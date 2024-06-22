import { GetDataType, MsgToWorker, ProxyContext } from "./main";

import { TreeNode } from "./data-structure";
import { judgeStructuredCloneable } from "./type-judge";

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
  D = CloneableMessageData,
> = {
  type: T;
  data: D;
  executionId: number;
  done: boolean;
  error: any;
  proxyTargetId: number;
  parentProxyTargetId: number;
  getterId: number;
};

export type MsgFromWorker<
  T extends MsgFromWorkerType = MsgFromWorkerType,
  D = CloneableMessageData,
> = T extends "action_data"
  ? Pick<MsgFromWorkerBasic<T, D>, "type" | "data" | "executionId" | "done">
  : T extends "message_error"
    ? Pick<MsgFromWorkerBasic<T>, "type" | "executionId" | "done" | "error">
    : T extends "start_signal"
      ? Pick<MsgFromWorkerBasic<T>, "type" | "executionId">
      : T extends "port_proxy"
        ? Pick<
            MsgFromWorkerBasic<T>,
            "type" | "executionId" | "proxyTargetId" | "done"
          >
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

export type CloneableMessageData = StructuredCloneable<Transferable>;

type ObjectInCloneableMessageData = {
  [k: string | number]: CloneableMessageData;
};

// 获取 ObjectInMessageData 中的所有 Transferable 的具体类型组成的联合类型
type GetTransferableInObject<
  D extends ObjectInCloneableMessageData,
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
  D extends CloneableMessageData,
  L extends number | null,
  P extends number | null = Prev<L>,
> = [L] extends [number]
  ? D extends Transferable
    ? D // 当 D 直接是 Transferable 的情况，递归的终点
    : D extends ObjectInCloneableMessageData
      ? GetTransferableInObject<D, P> // 当 D 是 ObjectInMessageData 的情况
      : D extends
            | Array<infer T extends CloneableMessageData>
            | Map<infer T, any>
            | Map<any, infer T>
            | Set<infer T>
        ? GetTransferables<T, Prev<L>> // 当 D 是其它引用数据类型的情况
        : null
  : null;

// postMessage 方法的 transfer 参数，以及 excute 方法的 options 参数的类型推导，其中 E 表示不需要 transfer 时其它的可选类型，适用于 excute 中
export type Transfer<
  D extends CloneableMessageData,
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
  D extends CloneableMessageData | void = void,
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
  ) => ActionResult<CloneableMessageData | void>;
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

type PostMsgWithId<D extends CloneableMessageData = CloneableMessageData> = D extends undefined
  ? (data?: undefined, transfer?: []) => void
  : GetTransferables<D, 10> extends null
    ? (data: Exclude<D, undefined>, transfer?: []) => void
    : (
        data: Exclude<D, undefined>,
        transfer: Transfer<Exclude<D, undefined>, []>
      ) => void;

type ActionThis<
  A extends CommonActions = CommonActions,
  D extends CloneableMessageData = CloneableMessageData,
> = {
  $post: PostMsgWithId<D>;
  $end: PostMsgWithId<D>;
} & ActionWithThis<A, any>; // 为什么这里要将 D（data） 指定为 any？因为如果这里获取到了具体的 data 的类型，那么 this 中访问到的其它 Action 的 data 类型会被统一推断为该类型。如此，当在一个 Action 中使用 this 访问其它 Action 时，如果它们的 data 的类型不同，就会出现类型错误。既然在 Action 中通过 this 调用其它 Action 时，不会触发它们的消息传递，只会获取到它们的返回值，因此将 this 中访问到的 Action 中的 data 类型设置为 any 即可。

//#endregion

//#endregion

//#region - onmessage

//#region - 相关变量与工具函数

let currentProxyTargetId = 0;

// proxyTargetTreeNodes 数组中存放 proxy 相关的树节点，数组的索引和 proxyTargetId 对应
const proxyTargetTreeNodes: (TreeNode<{
  target: any;
  proxyTargetId: number;
}> | null)[] = [];

//#region - postActionMessage

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
    if (!judgeStructuredCloneable(message, { transferable: false }))
      throw new Error("could not be cloned.");
    if (Array.isArray(options)) {
      postMessage(message, options);
    } else {
      postMessage(message, options?.transfer!);
    }
  } catch (error: any) {
    //#region - 处理当要传递的消息无法被结构化克隆时的情况
    // 在支持 ES6 Proxy 的环境中，如果传递的数据无法被结构化克隆，可以在 Main 中创建一个 Proxy 来控制该数据
    if (Proxy) {
      // 无论是根据 judgeStructuredCloneable() 条件抛出的 Error 还是 postMessage() 抛出的 Error 的 message 都会被 reg 匹配到
      const reg = /could not be cloned\.$/;
      if (reg.test(error?.message)) {
        const data: any = message.data;
        const proxyMsg: MsgFromWorker<"port_proxy"> = {
          type: "port_proxy",
          executionId: message.executionId,
          done: message.done,
          proxyTargetId: currentProxyTargetId,
        };

        proxyTargetTreeNodes[currentProxyTargetId] = new TreeNode({
          target: data,
          proxyTargetId: currentProxyTargetId,
        });

        currentProxyTargetId++;
        postMessage(proxyMsg);
        return;
      }
    }
    //#endregion

    const { executionId, done } = message;
    const errorMsg: MsgFromWorker<"message_error"> = {
      executionId,
      done,
      type: "message_error",
      error,
    };
    console.error(error);
    postMessage(errorMsg);
  }
}

//#endregion

//#region - handle_proxy 相关工具函数

/**
 * 根据对应的 proxyTargetId 获取对应的未废弃的 proxyTargetTreeNode
 * @param proxyTargetId
 * @returns proxyTargetTreeNode
 */
function getProxyTargetTreeNode(proxyTargetId: number) {
  const proxyTargetTreeNode = proxyTargetTreeNodes[proxyTargetId];
  if (proxyTargetTreeNode === null) {
    throw new Error("Proxy has been revoked.");
  }
  return proxyTargetTreeNode;
}

/**
 * 在响应来自 Main 的 handle_proxy 消息的一些操作时调用，用于将一些与 proxy 相关的数据传递给 Main
 * @param proxyTargetId
 * @param getterId
 * @param data
 * @param parentProxyTargetTreeNode
 * @returns
 */
function postProxyData(
  proxyTargetId: number,
  getterId: number,
  data: any,
  parentProxyTargetTreeNode?: TreeNode<{
    target: any;
    proxyTargetId: number;
  }>
) {
  const proxyDataMsg: MsgFromWorker<"proxy_data"> = {
    type: "proxy_data",
    proxyTargetId,
    data,
    getterId: getterId!,
  };
  try {
    if (!judgeStructuredCloneable(proxyDataMsg, { transferable: false }))
      throw new Error("could not be cloned.");
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
    const proxyTargetTreeNodeValue = {
      target: data,
      proxyTargetId: currentProxyTargetId,
    };
    const proxyTargetTreeNode = parentProxyTargetTreeNode
      ? parentProxyTargetTreeNode.addChild(proxyTargetTreeNodeValue)
      : new TreeNode(proxyTargetTreeNodeValue);
    proxyTargetTreeNodes[currentProxyTargetId] = proxyTargetTreeNode;
    currentProxyTargetId++;
    postMessage(createSubproxyMsg);
  }
}

/**
 * 根据 proxyContext 获取对应的 target
 * @param proxyContext
 * @returns target
 */
function getTargetByProxyContext(proxyContext: ProxyContext) {
  // 根据 proxyContext 获取到 proxyId 对应的 rootProxyTarget
  const proxyTargetTreeNode = getProxyTargetTreeNode(
    proxyContext.proxyTargetId
  );
  const rootProxyTarget = proxyTargetTreeNode.value.target;

  // 将 thisProxyContext.parentProperty 整理为数组，用它获取到具体的 target
  let { parentProperty } = proxyContext;
  parentProperty = Array.isArray(parentProperty)
    ? parentProperty
    : parentProperty
      ? [parentProperty]
      : [];

  return parentProperty.reduce((prev, cur) => prev[cur], rootProxyTarget);
}
//#endregion

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
      const { actionName, payload, executionId } = e.data;

      const startSignalMsg: MsgFromWorker<"start_signal"> = {
        executionId,
        type: "start_signal",
      };
      postMessage(startSignalMsg);

      const postMsgWithId: PostMsgWithId = (
        data?: CloneableMessageData,
        transfer: Transferable[] = []
      ) => {
        const done = false;
        const msgFromWorker: MsgFromWorker<"action_data"> = {
          data,
          executionId,
          done,
          type: "action_data",
        };
        postActionMessage(msgFromWorker, transfer);
      };

      const postResultWithId: PostMsgWithId = (
        data?: CloneableMessageData,
        transfer: Transferable[] = []
      ) => {
        Promise.resolve([data, transfer]).then((res) => {
          const toMain: Awaited<ReturnType<A[string]>> = res as any;
          let data: CloneableMessageData = null;
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
            executionId,
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
          let data: CloneableMessageData = null;
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
            executionId,
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

      //#region - get trap
      if (trap === "get") {
        const { property, getterId } = e.data;
        let data: any;
        const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
        const { target } = proxyTargetTreeNode.value;
        if (!Array.isArray(property)) {
          data = target[property!];
        } else {
          data = property.reduce((preV, cur) => preV[cur], target);
        }
        postProxyData(proxyTargetId, getterId, data, proxyTargetTreeNode);

        //#endregion

        //#region - set trap
      } else if (trap === "set") {
        const { property, value } = e.data;
        const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
        const { target } = proxyTargetTreeNode.value;
        if (!Array.isArray(property)) {
          Reflect.set(target, property, value);
        } else {
          const _target = property
            .slice(0, -1)
            .reduce((prev, cur) => prev[cur], target);
          Reflect.set(_target, property[property.length - 1], value);
        }

        //#endregion

        //#region - apply trap
      } else if (trap === "apply") {
        const {
          getterId,
          parentProperty,
          argumentsList, // argumentsList 中可以被结构化克隆的部分会在这里被接收
          argProxyContexts, // argumentsList 中如果存在元素是在 Main 中是已注册的 proxy，那么他们会以 ProxyContext 的形式传递到这里
          thisProxyContext, // thisArg 如果在 Main 中是已注册的 proxy，那么会以 ProxyContext 的形式传递到这里
          thisArg: _thisArg, // 如果 Main 中传递的 thisArg 可以被结构化克隆，则会在这里被接收到，否则这里的 thisArg 接收 undefined
        } = e.data;

        //#region - 处理 thisArg

        let thisArg: any = undefined;

        // 如果 Main 中传递的 thisArg 是已注册的 proxy
        if (thisProxyContext) {
          thisArg = getTargetByProxyContext(thisProxyContext);
        }
        // 如果 Main 中传递的 thisArg 可以被结构化克隆
        if (_thisArg) {
          thisArg = _thisArg;
        }

        //#endregion

        //#region - 处理 argumentsList
        const _argumentsList = [...argumentsList];
        argProxyContexts.forEach((argProxyContext, index) => {
          if (argProxyContext) {
            _argumentsList[index] = getTargetByProxyContext(argProxyContext);
          }
        });
        //#endregion

        const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
        const { target } = proxyTargetTreeNode.value;
        const fn = parentProperty.reduce((prev, cur) => prev[cur], target);
        const result = fn.apply(thisArg, _argumentsList);

        postProxyData(proxyTargetId, getterId, result);

        //#endregion

        //#region - construct trap
      } else if (trap === "construct") {
        const { getterId, parentProperty, argumentsList, argProxyContexts } =
          e.data;

        // 处理 argumentsList
        const _argumentsList = [...argumentsList];
        argProxyContexts.forEach((argProxyContext, index) => {
          if (argProxyContext) {
            _argumentsList[index] = getTargetByProxyContext(argProxyContext);
          }
        });

        const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
        const { target } = proxyTargetTreeNode.value;
        const constructor = parentProperty.reduce(
          (prev, cur) => prev[cur],
          target
        );
        const instance = new constructor(..._argumentsList);

        postProxyData(proxyTargetId, getterId, instance);

        //#endregion
      }

      //#endregion

      //#region - revoke_proxy
    } else if (type === "revoke_proxy") {
      // console.log("revoke 之前的 proxyTargetTreeNodes： ", [...proxyTargetTreeNodes]);
      const e = ev as MessageEvent<MsgToWorker<"revoke_proxy">>;
      const proxyTargetTreeNode = proxyTargetTreeNodes[e.data.proxyTargetId];
      if (proxyTargetTreeNode === null) return;
      for (const subTreeNode of proxyTargetTreeNode) {
        // console.log("被 revoke 的 proxyTargetTreeNode:", subTreeNode);
        proxyTargetTreeNodes[subTreeNode.value.proxyTargetId] = null;
      }
      // console.log("revoke 之后的 proxyTargetTreeNodes： ", proxyTargetTreeNodes);
    }

    //#endregion
  };
}

//#endregion

//#endregion
