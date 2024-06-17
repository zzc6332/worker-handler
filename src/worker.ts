import { GetDataType, MsgToWorker } from "./main";

import { TreeNode } from "./data-structure";

//#region - types

//#region - message 相关

type MsgFromWorkerType =
  | "action_data"
  | "start_signal"
  | "message_error"
  | "port_proxy"
  | "proxy_data"
  | "create_subproxy";

type MsgFromWorkerBasic<
  T extends MsgFromWorkerType = MsgFromWorkerType,
  D = MessageData,
> = {
  type: T;
  data: D;
  id: number;
  done: boolean;
  error: any;
  proxyTargetId: number;
  parentProxyTargetId: number;
  getterId: number;
};

export type MsgFromWorker<
  T extends MsgFromWorkerType = MsgFromWorkerType,
  D = MessageData,
> = T extends "action_data"
  ? Pick<MsgFromWorkerBasic<T, D>, "type" | "data" | "id" | "done">
  : T extends "message_error"
    ? Pick<MsgFromWorkerBasic<T>, "type" | "id" | "done" | "error">
    : T extends "start_signal"
      ? Pick<MsgFromWorkerBasic<T>, "type" | "id">
      : T extends "port_proxy"
        ? Pick<MsgFromWorkerBasic<T>, "type" | "id" | "proxyTargetId" | "done">
        : T extends "proxy_data"
          ? Pick<
              MsgFromWorkerBasic<T>,
              "type" | "proxyTargetId" | "getterId"
            > & {
              data: any;
            }
          : T extends "create_subproxy"
            ? Pick<
                MsgFromWorkerBasic<T>,
                "type" | "proxyTargetId" | "parentProxyTargetId" | "getterId"
              >
            : never;

//#endregion

//#region - StructuredCloneable 相关

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

type Primitive = number | string | boolean | null | undefined | BigInt | symbol;

type StructuredCloneableError =
  | Error
  | EvalError
  | RangeError
  | ReferenceError
  | SyntaxError
  | TypeError
  | URIError;

// StructuredCloneable 可以接受一个泛型参数以扩展类型
export type StructuredCloneable<T = never> =
  | Exclude<Primitive, symbol>
  | { [k: string | number]: StructuredCloneable<T> }
  | Array<StructuredCloneable<T>>
  | Map<StructuredCloneable<T>, StructuredCloneable<T>>
  | Set<StructuredCloneable<T>>
  | ArrayBuffer
  | Boolean
  | String
  | DataView
  | Date
  | RegExp
  | TypedArray
  | StructuredCloneableError
  | T;

//#endregion

//#region - MessageData 相关

export type MessageData = StructuredCloneable<Transferable>;

type ObjectInMessageData = {
  [k: string | number]: MessageData;
};

// 获取 ObjectInMessageData 中的所有 Transferable 的具体类型组成的联合类型
type GetTransferableInObject<
  D extends ObjectInMessageData,
  L extends number | null,
  P extends number | null = Prev<L>,
> = [L] extends [number]
  ? {
      [K in keyof D as GetTransferables<D[K], P> extends Transferable
        ? K
        : never]: GetTransferables<D[K], P>;
    } extends infer O // 先定义一个类型 O，O 中的键都是 D 中值类型包含 Transfer 的对应键，O 中的值都是该键最终提取出来的 Transferable 类型
    ? O[keyof O] // 将 O 中的所有值类型的联合类型返回
    : null
  : null;

// 获取 MessageData 中的所有 Transferable 类型的具体类型组成的联合类型
export type GetTransferables<
  D extends MessageData,
  L extends number | null,
  P extends number | null = Prev<L>,
> = [L] extends [number]
  ? D extends Transferable
    ? D // 当 D 直接是 Transferable 的情况，递归的终点
    : D extends ObjectInMessageData
      ? GetTransferableInObject<D, P> // 当 D 是 ObjectInMessageData 的情况
      : D extends
            | Array<infer T extends MessageData>
            | Map<infer T, any>
            | Map<any, infer T>
            | Set<infer T>
        ? GetTransferables<T, Prev<L>> // 当 D 是其它引用数据类型的情况
        : null
  : null;

// postMessage 方法的 transfer 参数，以及 excute 方法的 options 参数的类型推导，其中 E 表示不需要 transfer 时其它的可选类型，适用于 excute 中
export type Transfer<
  D extends MessageData,
  E = never,
  T extends Transferable | null = GetTransferables<D, 10>,
> = T extends Transferable ? [T, ...Transferable[]] : Transferable[] | E;

type Prev<N extends number | null> = N extends 1
  ? null // 当计数器为 1 时，下一步将是 never，从而停止递归
  : N extends 2
    ? 1
    : N extends 3
      ? 2
      : N extends 4
        ? 3
        : N extends 5
          ? 4
          : N extends 6
            ? 5
            : N extends 7
              ? 6
              : N extends 8
                ? 7
                : N extends 9
                  ? 8
                  : N extends 10
                    ? 9
                    : never;
//#endregion

//#region  - action 相关

export type ActionResult<
  D extends MessageData | void = void,
  T extends Transferable[] = Transfer<Exclude<D, void>>,
> = Promise<
  D extends void
    ? void
    : D extends Array<any>
      ? [D, T]
      : GetTransferables<Exclude<D, void>, 10> extends null
        ? D | [D, T]
        : [D, Transfer<Exclude<D, void>>]
>;

export type CommonActions = {
  [K: string]: (
    this: ActionThis,
    ...args: any[]
  ) => ActionResult<MessageData | void>;
};

export type ActionWithThis<
  A extends CommonActions,
  D extends true | any = true,
> = {
  [K in keyof A]: (
    this: ActionThis<A, D extends true ? GetDataType<A, K> : any>,
    ...args: Parameters<A[K]>
  ) => ReturnType<A[K]>;
};

type PostMsgWithId<D extends MessageData = MessageData> = D extends undefined
  ? (data?: undefined, transfer?: []) => void
  : GetTransferables<D, 10> extends null
    ? (data: Exclude<D, undefined>, transfer?: []) => void
    : (
        data: Exclude<D, undefined>,
        transfer: Transfer<Exclude<D, undefined>, []>
      ) => void;

type ActionThis<
  A extends CommonActions = CommonActions,
  D extends MessageData = MessageData,
> = {
  $post: PostMsgWithId<D>;
  $end: PostMsgWithId<D>;
} & ActionWithThis<A, any>; // 为什么这里要将 D（data） 指定为 any？因为如果这里获取到了具体的 data 的类型，那么 this 中访问到的其它 Action 的 data 类型会被统一推断为该类型。如此，当在一个 Action 中使用 this 访问其它 Action 时，如果它们的 data 的类型不同，就会出现类型错误。既然在 Action 中通过 this 调用其它 Action 时，不会触发它们的消息传递，只会获取到它们的返回值，因此将 this 中访问到的 Action 中的 data 类型设置为 any 即可。

//#endregion

//#endregion

//#region - onmessage

//#region - postActionMessage

let currentProxyTargetId = 0;

// proxyTreeNodes 数组中存放 proxy 相关的树节点，数组的索引和 proxyTargetId 对应
const proxyTreeNodes: (TreeNode<{
  target: any;
  proxyTargetId: number;
}> | null)[] = [];

/**
 * 传递 Action 要发送的消息
 * @param message
 * @param options
 */
function postActionMessage(
  message: MsgFromWorker<"action_data">,
  options?: Transferable[] | StructuredSerializeOptions
) {
  try {
    if (Array.isArray(options)) {
      postMessage(message, options);
    } else {
      postMessage(message, options?.transfer!);
    }
  } catch (error: any) {
    //#region - 处理当要传递的消息无法被结构化克隆时的情况
    // 在支持 ES6 Proxy 的环境中，如果传递的数据无法被结构化克隆，可以在 Main 中创建一个 Proxy 来控制该数据
    if (Proxy) {
      const reg = /could not be cloned\.$/;
      if (reg.test(error?.message)) {
        const data: any = message.data;
        const proxyMsg: MsgFromWorker<"port_proxy"> = {
          type: "port_proxy",
          id: message.id,
          done: message.done,
          proxyTargetId: currentProxyTargetId,
        };

        proxyTreeNodes[currentProxyTargetId] = new TreeNode({
          target: data,
          proxyTargetId: currentProxyTargetId,
        });

        currentProxyTargetId++;
        postMessage(proxyMsg);
        return;
      }
    }
    //#endregion

    const { id, done } = message;
    const errorMsg: MsgFromWorker<"message_error"> = {
      id,
      done,
      type: "message_error",
      error,
    };
    console.error(error);
    postMessage(errorMsg);
  }
}

//#endregion

//#region - createOnmessage ！！处理消息的核心

// worker 中处理消息的核心是 createOnmessage，接收从 Main 传来的 MsgToWorker 类型的消息，根据不同的消息标识来分别处理
export function createOnmessage<A extends CommonActions>(
  actions: ActionWithThis<A>
) {
  return async (ev: MessageEvent<MsgToWorker>) => {
    const { type } = ev.data;

    //#region - execute_action
    if (type === "execute_action") {
      const e = ev as MessageEvent<MsgToWorker<"execute_action", A>>;
      const { actionName, payload, id } = e.data;

      const startSignalMsg: MsgFromWorker<"start_signal"> = {
        id,
        type: "start_signal",
      };
      postMessage(startSignalMsg);

      const postMsgWithId: PostMsgWithId = (
        data?: MessageData,
        transfer: Transferable[] = []
      ) => {
        const done = false;
        const msgFromWorker: MsgFromWorker<"action_data"> = {
          data,
          id,
          done,
          type: "action_data",
        };
        postActionMessage(msgFromWorker, transfer);
      };

      const postResultWithId: PostMsgWithId = (
        data?: MessageData,
        transfer: Transferable[] = []
      ) => {
        Promise.resolve([data, transfer]).then((res) => {
          const toMain: Awaited<ReturnType<A[string]>> = res as any;
          let data: MessageData = null;
          let transfer: Transferable[] = [];
          if (Array.isArray(toMain)) {
            data = toMain[0];
            transfer = toMain[1];
          } else if (toMain) {
            data = toMain;
          }
          const done = true;
          const resultFromWorker: MsgFromWorker<"action_data"> = {
            data,
            id,
            done,
            type: "action_data",
          };
          postActionMessage(resultFromWorker, transfer);
        });
      };

      const boundActions = { ...actions } as ActionWithThis<A, any>;

      const actionThis: ActionThis<A> = {
        $post: postMsgWithId,
        $end: postResultWithId,
        ...boundActions,
      };

      for (const k in boundActions) {
        const boundAction = boundActions[k].bind(actionThis as any);
        boundActions[k] = boundAction;
        actionThis[k] = boundAction as any;
      }

      const action = actions[actionName];

      try {
        const toMain = await action.apply(
          actionThis as ActionThis<A, GetDataType<A, keyof A>>,
          payload
        );
        if (toMain !== undefined) {
          let data: MessageData = null;
          let transfer: Transferable[] = [];
          if (Array.isArray(toMain)) {
            data = toMain[0];
            transfer = toMain[1];
          } else if (toMain) {
            data = toMain;
          }
          const done = true;
          const resultFromWorker: MsgFromWorker<"action_data"> = {
            data,
            id,
            done,
            type: "action_data",
          };
          postActionMessage(resultFromWorker, transfer);
        }
      } catch (error: any) {
        if (
          error.message ===
          "Cannot read properties of undefined (reading 'apply')"
        ) {
          if (actionName)
            console.warn(`'${String(actionName)}' is not a action name.`);
        } else {
          throw error;
        }
      }
      //#endregion

      //#region - handle_proxy
    } else if (type === "handle_proxy") {
      const e = ev as MessageEvent<MsgToWorker<"handle_proxy">>;
      const { trap, proxyTargetId } = e.data;

      function getProxyTreeNode(proxyTargetId: number) {
        const proxyTreeNode = proxyTreeNodes[proxyTargetId];
        if (proxyTreeNode === null) {
          throw new Error("Proxy has been revoked.");
        }
        return proxyTreeNode;
      }

      if (trap === "get") {
        const { property, getterId } = e.data;
        let data: any;
        const proxyTreeNode = getProxyTreeNode(proxyTargetId);
        const { target } = proxyTreeNode.value;
        if (!Array.isArray(property)) {
          data = target[property!];
        } else {
          data = property.reduce((preV, cur) => preV[cur], target);
        }
        const proxyDataMsg: MsgFromWorker<"proxy_data"> = {
          type: "proxy_data",
          proxyTargetId,
          data,
          getterId: getterId!,
        };

        try {
          postMessage(proxyDataMsg);
        } catch (error: any) {
          // 如果读取到的数据无法被实例化，则继续创建 proxy
          const reg = /could not be cloned\.$/;
          if (!reg.test(error?.message)) return;
          const createSubproxyMsg: MsgFromWorker<"create_subproxy"> = {
            type: "create_subproxy",
            proxyTargetId: currentProxyTargetId,
            parentProxyTargetId: proxyTargetId,
            getterId: getterId!,
          };
          const parentProxyTreeNode = proxyTreeNode;
          const childProxyTreeNode = parentProxyTreeNode.addChild({
            target: data,
            proxyTargetId: currentProxyTargetId,
          });
          proxyTreeNodes[currentProxyTargetId] = childProxyTreeNode;
          currentProxyTargetId++;
          postMessage(createSubproxyMsg);
        }
      } else if (trap === "set") {
        const { property, value } = e.data;
        const proxyTreeNode = getProxyTreeNode(proxyTargetId);
        const { target } = proxyTreeNode.value;
        if (!Array.isArray(property)) {
          Reflect.set(target, property, value);
        } else {
          const _target = property
            .slice(0, -1)
            .reduce((prev, cur) => prev[cur], target);
          Reflect.set(_target, property[property.length - 1], value);
        }
      }
    } else if (type === "revoke_proxy") {
      // console.log("revoke 之前的 proxyTreeNodes： ", [...proxyTreeNodes]);
      const e = ev as MessageEvent<MsgToWorker<"revoke_proxy">>;
      const proxyTreeNode = proxyTreeNodes[e.data.proxyTargetId];
      if (proxyTreeNode === null) return;
      for (const subTreeNode of proxyTreeNode) {
        // console.log("被 revoke 的 proxyTreeNode:", subTreeNode);
        proxyTreeNodes[subTreeNode.value.proxyTargetId] = null;
      }
      // console.log("revoke 之后的 proxyTreeNodes： ", proxyTreeNodes);
    }
    //#endregion
  };
}

//#endregion

//#endregion
