import { MsgToWorker, ProxyContext } from "./main";

import { TreeNode } from "./data-structure";
import {
  getTransfers,
  judgeContainer,
  judgeStructuredCloneable,
} from "./type-judge";

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
  D = any,
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
  D = any,
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

type ProxyTargetTreeNodeValue = {
  target: any;
  proxyTargetId: number;
  transfer: Transferable[];
};

// 通过 Actions 的类型和 action 名获取到 action 要向 Main 传递的数据的类型
export type GetDataType<A extends CommonActions, K extends keyof A> =
  ReturnType<A[K]> extends ActionResult<infer D>
    ? Exclude<D, void> extends never
      ? undefined
      : Exclude<D, void>
    : any;

//#endregion

//#region  - action 相关

export type ActionResult<D extends any = void> = Promise<D | void>;

export type CommonActions = {
  [K: string]: (this: ActionThis, ...args: any[]) => ActionResult<any>;
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

type PostMsgWithId<D extends any = any> = D extends undefined
  ? (data?: undefined, transfer?: []) => void
  : (data: Exclude<D, undefined>, transfer?: Transferable[]) => void;

type ActionThis<
  A extends CommonActions = CommonActions,
  D extends any = any,
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
const proxyTargetTreeNodes: (TreeNode<ProxyTargetTreeNodeValue> | null)[] = [];

//#region - postActionMessage

/**
 * 传递 Action 要发送的消息
 * @param message
 * @param options
 */
function postActionMessage(
  message: MsgFromWorker<"action_data">,
  transfer: Transferable[] = []
) {
  try {
    if (!judgeStructuredCloneable(message))
      throw new Error("could not be cloned.");
    postMessage(message, transfer);
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

        proxyTargetTreeNodes[currentProxyTargetId] =
          new TreeNode<ProxyTargetTreeNodeValue>({
            target: data,
            proxyTargetId: currentProxyTargetId,
            transfer,
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
  parentProxyTargetTreeNode?: TreeNode<ProxyTargetTreeNodeValue>
) {
  const proxyDataMsg: MsgFromWorker<"proxy_data"> = {
    type: "proxy_data",
    proxyTargetId,
    data,
    getterId: getterId!,
  };
  const transfer = parentProxyTargetTreeNode
    ? parentProxyTargetTreeNode.value.transfer.filter((item) =>
        judgeContainer(data, item)
      )
    : getTransfers(data);
  try {
    if (!judgeStructuredCloneable(proxyDataMsg))
      throw new Error("could not be cloned.");
    postMessage(proxyDataMsg, transfer);
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
    const proxyTargetTreeNodeValue: ProxyTargetTreeNodeValue = {
      target: data,
      proxyTargetId: currentProxyTargetId,
      transfer,
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
      const { actionName, payloads, executionId, payloadProxyContexts } =
        e.data;
      const payloadList = (payloads ? [...payloads] : []) as typeof payloads;
      if (payloadProxyContexts) {
        payloadProxyContexts.forEach((payloadProxyContext, index) => {
          if (payloadProxyContext) {
            payloadList[index] = getTargetByProxyContext(payloadProxyContext);
          }
        });
      }

      const startSignalMsg: MsgFromWorker<"start_signal"> = {
        executionId,
        type: "start_signal",
      };
      postMessage(startSignalMsg);

      // // postMsgWithId 就是 action 中的 this.$post()
      const postMsgWithId: PostMsgWithId = (
        data?: any,
        transfer: Transferable[] | "auto" = "auto"
      ) => {
        postActionMessage(
          {
            data,
            executionId,
            done: false,
            type: "action_data",
          },
          transfer === "auto" ? getTransfers(data) : transfer
        );
      };

      // postResultWithId 就是 action 中的 this.$end()
      const postResultWithId: PostMsgWithId = (
        data?: any,
        transfer: Transferable[] | "auto" = "auto"
      ) => {
        postActionMessage(
          {
            data,
            executionId,
            done: true,
            type: "action_data",
          },
          transfer === "auto" ? getTransfers(data) : transfer
        );
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
        const data = await action.apply(
          actionThis as ActionThis<A, GetDataType<A, keyof A>>,
          payloadList
        );
        if (data !== undefined) {
          const transfer = getTransfers(data);
          postActionMessage(
            {
              data,
              executionId,
              done: true,
              type: "action_data",
            },
            transfer
          );
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
        const { property, value, valueProxyContext } = e.data;

        // 判断 value 是引用了 Worker 数据的 Proxy，还是可结构化克隆的数据
        const _value = valueProxyContext
          ? getTargetByProxyContext(valueProxyContext)
          : value;

        const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
        const { target } = proxyTargetTreeNode.value;
        if (!Array.isArray(property)) {
          Reflect.set(target, property, _value);
        } else {
          const _target = property
            .slice(0, -1)
            .reduce((prev, cur) => prev[cur], target);
          Reflect.set(_target, property[property.length - 1], _value);
        }

        //#endregion

        //#region - apply trap
      } else if (trap === "apply") {
        const {
          getterId,
          parentProperty,
          argumentsList, // argumentsList 中可以被结构化克隆的部分会在这里被接收
          argProxyContexts, // argumentsList 中如果存在元素是在 Main 中是引用了 Worker 数据的 proxy，那么他们会以 ProxyContext 的形式传递到这里
          thisProxyContext, // thisArg 如果在 Main 中是引用了 Worker 数据的 proxy，那么会以 ProxyContext 的形式传递到这里
          thisArg: _thisArg, // 如果 Main 中传递的 thisArg 可以被结构化克隆，则会在这里被接收到，否则这里的 thisArg 接收 undefined
        } = e.data;

        //#region - 处理 thisArg

        let thisArg: any = undefined;

        // 如果 Main 中传递的 thisArg 是引用了 Worker 数据的 proxy
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
