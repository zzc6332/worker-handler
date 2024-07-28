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
  | "action_promise_settled"
  | "create_promise"
  | "create_rootproxy"
  | "proxy_data"
  | "create_subproxy"
  | "proxy_promise_rejected";

type MsgFromWorkerBasic<
  T extends MsgFromWorkerType = MsgFromWorkerType,
  D = any,
> = {
  type: T;
  data: D;
  executionId: number;
  done: boolean;
  isArray: boolean;
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
      : T extends "action_promise_settled"
        ? Pick<MsgFromWorkerBasic<T>, "type" | "executionId" | "done"> & {
            dataPromiseId?: number;
          } & (
              | (Pick<MsgFromWorkerBasic<T>, "error"> & {
                  promiseState: "rejected";
                })
              | (Partial<
                  Pick<
                    MsgFromWorkerBasic<T>,
                    "data" | "proxyTargetId" | "isArray"
                  >
                > & {
                  promiseState: "fulfilled";
                })
            )
        : T extends "create_promise"
          ? Pick<MsgFromWorkerBasic<T>, "type" | "executionId"> & {
              done: false; // 只有当 done 为 false 时，即使用 this.$post() 传递 Promise 对象时，才需要在 Main 中创建一个对应的 Promise
              dataPromiseId: number;
            }
          : T extends "create_rootproxy"
            ? Pick<
                MsgFromWorkerBasic<T>,
                "type" | "executionId" | "proxyTargetId" | "done" | "isArray"
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
                    | "type"
                    | "proxyTargetId"
                    | "parentProxyTargetId"
                    | "getterId"
                    | "isArray"
                  >
                : T extends "proxy_promise_rejected"
                  ? Pick<
                      MsgFromWorkerBasic<T>,
                      "type" | "proxyTargetId" | "getterId" | "error"
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

// proxyTargetId 是 Main 中的 Worker Proxy 应用的数据的唯一标识符
let currentProxyTargetId = 1;

// dataPromiseId 是通过 this.$post() 发送给 Main 的 Promise 的唯一标识符
let currentDataPromiseId = 1;

// proxyTargetTreeNodes 中存放 proxy 相关的树节点，数组的索引和 proxyTargetId 对应
const proxyTargetTreeNodes: Map<
  number,
  TreeNode<ProxyTargetTreeNodeValue> | undefined
> = new Map();

// depositedDatas 中存放对 Carrier Proxy 进行 apply 或 construct 操作而创建的临时数据
const depositedDatas: Map<number, { data: any; proxyTargetId: number | null }> =
  new Map();

export const debugging = {
  currentProxyTargetId,
  proxyTargetTreeNodes,
  depositedDatas,
};

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
  const { data, done, executionId } = message;

  if (data instanceof Promise && !done) {
    // 当 done 为 false 时，Worker 中需通过对 MessageSource 添加事件监听器回调来获取数据，此时需要在 Main 为 Promise 类型的 data 创建一个对应的 Promise。否则如果 done 为 true，那么 Main 中本身就是通过 Promise 形式来获取 data，就不需要在 Main 中再次创建 Promise 了。
    const dataPromiseId = currentDataPromiseId;

    const createPromiseMsg: MsgFromWorker<"create_promise"> = {
      type: "create_promise",
      executionId,
      done,
      dataPromiseId,
    };
    postMessage(createPromiseMsg);

    data
      .then((res) => {
        try {
          if (!judgeStructuredCloneable(res)) throw new Error();
        } catch (error) {
          // 如果 dataPromise 解析出的值无法被结构化克隆，则需要为它创建 Proxy
          const actionPromiseRejectedMsg: MsgFromWorker<"action_promise_settled"> =
            {
              type: "action_promise_settled",
              executionId,
              done,
              promiseState: "fulfilled",
              proxyTargetId: currentProxyTargetId,
              isArray: Array.isArray(res),
              dataPromiseId,
            };
          postMessage(actionPromiseRejectedMsg);
          proxyTargetTreeNodes.set(
            currentProxyTargetId,
            new TreeNode<ProxyTargetTreeNodeValue>({
              target: res,
              proxyTargetId: currentProxyTargetId,
              transfer: [],
            })
          );
          return;
        }
        const actionPromiseRejectedMsg: MsgFromWorker<"action_promise_settled"> =
          {
            type: "action_promise_settled",
            executionId,
            done,
            promiseState: "fulfilled",
            data: res,
            dataPromiseId,
          };
        postMessage(actionPromiseRejectedMsg);
      })
      .catch((err) => {
        const actionPromiseRejectedMsg: MsgFromWorker<"action_promise_settled"> =
          {
            type: "action_promise_settled",
            executionId,
            done,
            promiseState: "rejected",
            error: judgeStructuredCloneable(err)
              ? err
              : JSON.parse(JSON.stringify(err)),
            dataPromiseId,
          };
        postMessage(actionPromiseRejectedMsg);
      });
    currentDataPromiseId++;
    return;
  }
  try {
    if (!judgeStructuredCloneable(data))
      throw new Error("could not be cloned.");
    postMessage(message, transfer);
  } catch (error: any) {
    //#region - 处理当要传递的消息无法被结构化克隆时的情况
    // 在支持 ES6 Proxy 的环境中，如果传递的数据无法被结构化克隆，可以在 Main 中创建一个 Proxy 来控制该数据
    if (Proxy) {
      // 无论是根据 judgeStructuredCloneable() 条件抛出的 Error 还是 postMessage() 抛出的 Error 的 message 都会被 reg 匹配到
      const reg = /could not be cloned\.$/;
      const regV = /clone/;
      const reg2 = /could not be transferred/;
      const reg2V = /Cannot clone canvas with context./;
      if (reg2.test(error?.message) || reg2V.test(error?.message)) {
        console.warn(error);
      }
      if (
        reg.test(error?.message) ||
        regV.test(error?.message) ||
        reg2.test(error?.message) ||
        reg2V.test(error?.message)
      ) {
        const proxyMsg: MsgFromWorker<"create_rootproxy"> = {
          type: "create_rootproxy",
          executionId,
          done,
          proxyTargetId: currentProxyTargetId,
          isArray: Array.isArray(data),
        };

        proxyTargetTreeNodes.set(
          currentProxyTargetId,
          new TreeNode<ProxyTargetTreeNodeValue>({
            target: data,
            proxyTargetId: currentProxyTargetId,
            transfer,
          })
        );

        currentProxyTargetId++;
        postMessage(proxyMsg);
        return;
      }
    }
    //#endregion

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
  const proxyTargetTreeNode = proxyTargetTreeNodes.get(proxyTargetId);
  if (proxyTargetTreeNode === undefined) {
    throw new Error("Proxy has been revoked.");
  }
  return proxyTargetTreeNode;
}

/**
 * 在响应来自 Main 的 handle_proxy 消息的一些操作时调用，用于将一些与 proxy 相关的数据传递给 Main
 * @param proxyTargetId
 * @param getterId
 * @param data
 * @param temporaryProxyIdForDepositing
 * @param parentProxyTargetTreeNode
 * @param adoptiveParentProxyTargetTreeNode
 * @returns
 */
async function postProxyData(
  proxyTargetId: number,
  getterId: number,
  data: any,
  temporaryProxyIdForDepositing: number | null,
  parentProxyTargetTreeNode?: TreeNode<ProxyTargetTreeNodeValue> | null,
  adoptiveParentProxyTargetTreeNode?: TreeNode<ProxyTargetTreeNodeValue> | null
) {
  const transfer = parentProxyTargetTreeNode
    ? parentProxyTargetTreeNode.value.transfer.filter((item) =>
        judgeContainer(data, item)
      )
    : [];

  if (data instanceof Promise) {
    try {
      const resolvedValue = await data;
      postProxyData(
        proxyTargetId,
        getterId,
        resolvedValue,
        temporaryProxyIdForDepositing,
        null,
        parentProxyTargetTreeNode || adoptiveParentProxyTargetTreeNode // 因目标 promise 而产生的目标数据对应的 Worker Proxy 属于目标 promise 对应的 Worker Proxy 的 adoptedChild，因此无论该目标 promise 是存在 parentProxyTarget 还是 adoptiveParentProxyTarget，它们都作为 resolvedData 的 adoptiveParentProxyTarget
      );
    } catch (err: any) {
      const proxyPromiseRejectedMsg: MsgFromWorker<"proxy_promise_rejected"> = {
        type: "proxy_promise_rejected",
        proxyTargetId,
        getterId,
        error: judgeStructuredCloneable(err)
          ? err
          : JSON.parse(JSON.stringify(err)),
      };
      postMessage(proxyPromiseRejectedMsg);
    }
    return;
  }

  try {
    const proxyDataMsg: MsgFromWorker<"proxy_data"> = {
      type: "proxy_data",
      proxyTargetId,
      data,
      getterId,
    };
    if (!judgeStructuredCloneable(data))
      throw new Error("could not be cloned.");
    postMessage(proxyDataMsg, transfer);
  } catch (error: any) {
    // 如果读取到的数据无法被实例化，则继续创建 proxy
    const reg = /could not be cloned\.$/;
    const regV = /clone/;
    const reg2 = /could not be transferred/;
    const reg2V = /Cannot clone canvas with context./;
    if (
      !reg.test(error?.message) &&
      !regV.test(error?.message) &&
      !reg2.test(error?.message) &&
      !reg2V.test(error?.message)
    )
      throw error;

    if (reg2.test(error?.message) || reg2V.test(error?.message)) {
      console.warn(error);
    }
    const createSubproxyMsg: MsgFromWorker<"create_subproxy"> = {
      type: "create_subproxy",
      proxyTargetId: currentProxyTargetId,
      parentProxyTargetId: proxyTargetId,
      getterId,
      isArray: Array.isArray(data),
    };
    postMessage(createSubproxyMsg);

    const proxyTargetTreeNodeValue: ProxyTargetTreeNodeValue = {
      target: data,
      proxyTargetId: currentProxyTargetId,
      transfer,
    };
    const proxyTargetTreeNode = parentProxyTargetTreeNode
      ? parentProxyTargetTreeNode.addChild(proxyTargetTreeNodeValue)
      : adoptiveParentProxyTargetTreeNode
        ? adoptiveParentProxyTargetTreeNode.addAdoptedChild(
            proxyTargetTreeNodeValue
          )
        : new TreeNode(proxyTargetTreeNodeValue);
    proxyTargetTreeNodes.set(currentProxyTargetId, proxyTargetTreeNode);

    // 如果传入了有效的 temporaryProxyIdForDepositing，则为 depositedDatas 中对应的数据追加关联的 proxyTargetId
    if (temporaryProxyIdForDepositing !== null) {
      const depositedData = depositedDatas.get(temporaryProxyIdForDepositing);
      if (depositedData) depositedData.proxyTargetId = currentProxyTargetId;
    }

    currentProxyTargetId++;
  }
}

/**
 * 根据 proxyContext 获取对应的 target
 * @param proxyContext
 * @returns target
 */
function getTargetByProxyContext(proxyContext: ProxyContext) {
  if (proxyContext.temporaryProxyIdForPickingUp) {
    return depositedDatas.get(proxyContext.temporaryProxyIdForPickingUp)?.data;
  }
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

/**
 * 向 depositedDatas 中存储临时数据的同时，清除 depositedDatas 中不需要的临时数据
 * @param temporaryProxyIdForDepositing
 * @param data
 */
function depositeData(temporaryProxyIdForDepositing: number, data: any) {
  depositedDatas.set(temporaryProxyIdForDepositing, {
    data,
    proxyTargetId: null, // proxyTargetId 先设置为 null，之后如果在 postProxyData() 中需要为 data 创建 proxy，则会追加设置对应的 proxyTargetId
  });

  // 临时数据大多数情况下可以在下一个临时数据被存储时就删除，除了当临时数据是对象的情况下，有可能在调用其方法时会将其作为 this 引用，因此多保留一回合
  if (
    typeof depositedDatas.get(temporaryProxyIdForDepositing - 1)?.data !==
    "object"
  ) {
    depositedDatas.delete(temporaryProxyIdForDepositing - 1);
  }
  depositedDatas.delete(temporaryProxyIdForDepositing - 2);
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
        transfer: Transferable[] | "auto" = []
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
      const postResultWithId: PostMsgWithId = async (
        data?: any,
        transfer: Transferable[] | "auto" = []
      ) => {
        if (data instanceof Promise) {
          try {
            const resolvedValue = await data;
            postActionMessage({
              data: resolvedValue,
              executionId,
              done: true,
              type: "action_data",
            });
          } catch (err: any) {
            let error: any;
            if (judgeStructuredCloneable(err)) {
              error = err;
            } else {
              try {
                error = JSON.parse(JSON.stringify(err));
              } catch (e) {
                error = new Error(err).message;
              }
            }
            const actionPromiseRejectedMsg: MsgFromWorker<"action_promise_settled"> =
              {
                type: "action_promise_settled",
                executionId,
                done: true,
                error,
                promiseState: "rejected",
              };
            // 为了避免一些极端情况下的出现的非预期情况，比如在 Action 中同步地使用 this.$post() 和 this.$end() 发送同一个会立马被 reject 的 Promise 对象，使得这里的 this.$end() 对应的 postMessage() 的调用会会早于 this.$post() 对应的 postMessage()，使得 Main 中由于先接受到了终止消息，而提前关闭了非终止消息的接收通道造成的消息丢失，所以这里异步地执行 postMessage()，保证它的执行晚于非终止消息的 postMessage()
            setTimeout(() => {
              postMessage(actionPromiseRejectedMsg);
            });
          }
        } else {
          postActionMessage(
            {
              data,
              executionId,
              done: true,
              type: "action_data",
            },
            transfer === "auto" ? getTransfers(data) : transfer
          );
        }
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

      if (action === undefined) {
        console.warn(
          actionName
            ? `"${String(actionName)}" is not a action name.`
            : `Please provide a valid action name.`
        );
      } else {
        try {
          const data = await action.apply(
            actionThis as ActionThis<A, GetDataType<A, keyof A>>,
            payloadList
          );
          if (data !== undefined) {
            postActionMessage({
              data,
              executionId,
              done: true,
              type: "action_data",
            });
          }
        } catch (err: any) {
          const actionPromiseRejectedMsg: MsgFromWorker<"action_promise_settled"> =
            {
              type: "action_promise_settled",
              executionId,
              done: true,
              error: judgeStructuredCloneable(err)
                ? err
                : JSON.parse(JSON.stringify(err)),
              promiseState: "rejected",
            };
          postMessage(actionPromiseRejectedMsg);
        }
      }

      //#endregion

      //#region - handle_proxy
    } else if (type === "handle_proxy") {
      const e = ev as MessageEvent<MsgToWorker<"handle_proxy">>;
      const { trap, proxyTargetId, temporaryProxyIdForPickingUp } = e.data;

      //#region - get trap
      if (trap === "get") {
        const { property, getterId, temporaryProxyIdForDepositing } = e.data;
        let data: any;
        let target: any;
        let proxyTargetTreeNode: TreeNode<ProxyTargetTreeNodeValue> | undefined;
        if (temporaryProxyIdForPickingUp) {
          const depositedData = depositedDatas.get(
            temporaryProxyIdForPickingUp
          );
          target = depositedData?.data;
          // 如果 depositedData 中关联了 proxyTargetId，那么也要取出相应的 proxyTargetTreeNode
          if (depositedData?.proxyTargetId) {
            proxyTargetTreeNode = getProxyTargetTreeNode(
              depositedData?.proxyTargetId
            );
          }
        } else {
          proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
          target = proxyTargetTreeNode.value.target;
        }
        if (Array.isArray(property)) {
          data = property.reduce((preV, cur) => preV[cur], target);
        } else {
          data = target[property];
        }

        if (temporaryProxyIdForDepositing)
          depositeData(temporaryProxyIdForDepositing, data);

        postProxyData(
          proxyTargetId,
          getterId,
          data,
          temporaryProxyIdForDepositing,
          proxyTargetTreeNode
        );

        //#endregion

        //#region - set trap
      } else if (trap === "set") {
        const {
          property,
          value,
          valueProxyContext,
          temporaryProxyIdForPickingUp,
        } = e.data;

        // 判断 value 是引用了 Worker 数据的 Proxy，还是可结构化克隆的数据
        const _value = valueProxyContext
          ? getTargetByProxyContext(valueProxyContext)
          : value;

        let target: any;
        if (temporaryProxyIdForPickingUp) {
          target = depositedDatas.get(temporaryProxyIdForPickingUp)?.data;
        } else {
          const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
          target = proxyTargetTreeNode.value.target;
        }
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
          temporaryProxyIdForDepositing, // 使用 temporaryProxyIdForDepositing 作为唯一标识符寄存 apply 操作的结果数据
          temporaryProxyIdForPickingUp, // temporaryProxyIdForPickingUp 用于取出使用 temporaryProxyIdForDepositing 寄存的数据
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

        let fn: (...args: any) => any;
        let proxyTargetTreeNode: TreeNode<ProxyTargetTreeNodeValue> | undefined;
        if (temporaryProxyIdForPickingUp) {
          const depositedData = depositedDatas.get(
            temporaryProxyIdForPickingUp
          );
          fn = depositedData?.data;
          // 如果 depositedData 中关联了 proxyTargetId，那么也要取出相应的 proxyTargetTreeNode
          if (depositedData?.proxyTargetId) {
            proxyTargetTreeNode = getProxyTargetTreeNode(
              depositedData?.proxyTargetId
            );
          }
        } else {
          proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
          const target = proxyTargetTreeNode.value.target;
          fn = parentProperty.reduce((prev, cur) => prev[cur], target);
        }

        const result = fn.apply(thisArg, _argumentsList);

        depositeData(temporaryProxyIdForDepositing, result);

        postProxyData(
          proxyTargetId,
          getterId,
          result,
          temporaryProxyIdForDepositing,
          null,
          proxyTargetTreeNode
        );

        //#endregion

        //#region - construct trap
      } else if (trap === "construct") {
        const {
          getterId,
          parentProperty,
          argumentsList,
          argProxyContexts,
          temporaryProxyIdForDepositing,
          temporaryProxyIdForPickingUp,
        } = e.data;

        // 处理 argumentsList
        const _argumentsList = [...argumentsList];
        argProxyContexts.forEach((argProxyContext, index) => {
          if (argProxyContext) {
            _argumentsList[index] = getTargetByProxyContext(argProxyContext);
          }
        });

        let constructor: new (...args: any[]) => any;
        let proxyTargetTreeNode: TreeNode<ProxyTargetTreeNodeValue> | undefined;
        if (temporaryProxyIdForPickingUp) {
          const depositedData = depositedDatas.get(
            temporaryProxyIdForPickingUp
          );
          constructor = depositedData?.data;
          // 如果 depositedData 中关联了 proxyTargetId，那么也要取出相应的 proxyTargetTreeNode
          if (depositedData?.proxyTargetId) {
            proxyTargetTreeNode = getProxyTargetTreeNode(
              depositedData?.proxyTargetId
            );
          }
        } else {
          proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);
          const target = proxyTargetTreeNode.value.target;
          constructor = parentProperty.reduce((prev, cur) => prev[cur], target);
        }

        const instance = new constructor(..._argumentsList);

        depositeData(temporaryProxyIdForDepositing, instance);

        postProxyData(
          proxyTargetId,
          getterId,
          instance,
          temporaryProxyIdForDepositing,
          null,
          proxyTargetTreeNode
        );

        //#endregion
      }

      //#endregion

      //#region - revoke_proxy
    } else if (type === "revoke_proxy") {
      // console.log("revoke 之前的 proxyTargetTreeNodes： ", [...proxyTargetTreeNodes]);
      const { data } = ev as MessageEvent<MsgToWorker<"revoke_proxy">>;

      const proxyTargetTreeNode = proxyTargetTreeNodes.get(data.proxyTargetId);
      if (proxyTargetTreeNode === undefined) return;

      const { traverse } = data;
      if (traverse) {
        for (const subTreeNode of traverse === "adopted_children"
          ? proxyTargetTreeNode.allChildren()
          : proxyTargetTreeNode) {
          // console.log("被 revoke 的 proxyTargetTreeNode:", subTreeNode);
          proxyTargetTreeNodes.delete(subTreeNode.value.proxyTargetId);
        }
      } else {
        // console.log("被 revoke 的 proxyTargetTreeNode:", proxyTargetTreeNode);
        proxyTargetTreeNodes.delete(proxyTargetTreeNode.value.proxyTargetId);
      }

      // console.log("revoke 之后的 proxyTargetTreeNodes： ", proxyTargetTreeNodes);

      //#endregion

      //#region - update_array
    } else if (type === "update_array") {
      const e = ev as MessageEvent<MsgToWorker<"update_array">>;
      const {
        proxyTargetId,
        itemProxyContexts, // 要更新的数组中，无法结构化克隆的部分会以 ProxyContext 的形式传递到这里
        cloneableItemsInArr, // 要更新的数组中，可结构化克隆的部分
      } = e.data;

      // 将 itemProxyContexts 和 cloneableItemsInArr 合并，并将 ProxyContext 还原为原始数据
      const reducedItems = itemProxyContexts.map((itemProxyContext) => {
        if (itemProxyContext) return getTargetByProxyContext(itemProxyContext);
      });
      const newArr = cloneableItemsInArr.map((item, index) => {
        if (item === undefined) {
          return reducedItems[index];
        } else {
          return item;
        }
      });

      // 获取目标数组所在的树节点
      const proxyTargetTreeNode = getProxyTargetTreeNode(proxyTargetId);

      // 更新数组
      const oldArr = proxyTargetTreeNode.value.target as any[];
      oldArr.length = newArr.length;
      for (let i = 0; i < oldArr.length; i++) {
        oldArr[i] = newArr[i];
      }
    }

    //#endregion
  };
}

//#endregion

//#endregion
