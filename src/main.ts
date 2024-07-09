import { CommonActions, MsgFromWorker, GetDataType } from "./worker.js";

import { getTransfers, StructuredCloneable } from "./type-judge";

//#region - types

//#region - message 相关

type MsgToWorkerType =
  | "execute_action"
  | "handle_proxy"
  | "revoke_proxy"
  | "update_array"
  | "check_clonability";

export interface ProxyContext {
  proxyTargetId: number;
  parentProperty: keyof any | (keyof any)[] | null;
}

interface ProxyContextX extends ProxyContext {
  revoke: () => void;
  associatedProxies: Set<any>;
  isRevoked: boolean;
  isArray: boolean;
}

type MsgToWorkerBasic<
  T extends MsgToWorkerType = MsgToWorkerType,
  A extends CommonActions = CommonActions,
  K extends keyof A = keyof A,
  P extends keyof ProxyHandler<any> = keyof ProxyHandler<any>,
> = {
  type: T;
  actionName: K;
  payloads: Parameters<A[K]>;
  payloadProxyContexts: (Parameters<A[K]>[number] | undefined)[];
  executionId: number;
  trap: P;
  proxyTargetId: number;
  getterId: number;
  property: keyof any | (keyof any)[];
  value: any;
  valueProxyContext?: ProxyContext;
  argumentsList: any[];
  parentProperty: (keyof any)[];
  argProxyContexts: (ProxyContext | undefined)[];
  thisProxyContext?: ProxyContext;
  thisArg: any;
  itemProxyContexts: (ProxyContext | undefined)[];
  cloneableItemsInArr: any[];
  temporaryProxyIdForDepositing: number;
  temporaryProxyIdForPickingUp: number | null;
};

export type MsgToWorker<
  T extends MsgToWorkerType = MsgToWorkerType,
  A extends CommonActions = CommonActions,
  K extends keyof A = keyof A,
  P extends keyof ProxyHandler<any> = keyof ProxyHandler<any>,
> = T extends "execute_action"
  ? Pick<
      MsgToWorkerBasic<T, A, K>,
      | "type"
      | "actionName"
      | "payloads"
      | "executionId"
      | "payloadProxyContexts"
    >
  : T extends "handle_proxy"
    ? P extends "get"
      ? Pick<
          MsgToWorkerBasic<T, A, K, P>,
          | "type"
          | "proxyTargetId"
          | "trap"
          | "getterId"
          | "property"
          | "temporaryProxyIdForPickingUp"
        >
      : P extends "set"
        ? Pick<
            MsgToWorkerBasic<T, A, K, P>,
            | "type"
            | "proxyTargetId"
            | "trap"
            | "property"
            | "value"
            | "valueProxyContext"
            | "temporaryProxyIdForPickingUp"
          >
        : P extends "apply"
          ? Pick<
              MsgToWorkerBasic<T, A, K, P>,
              | "type"
              | "proxyTargetId"
              | "trap"
              | "argumentsList"
              | "getterId"
              | "parentProperty"
              | "argProxyContexts"
              | "thisProxyContext"
              | "thisArg"
              | "temporaryProxyIdForDepositing"
              | "temporaryProxyIdForPickingUp"
            >
          : P extends "construct"
            ? Pick<
                MsgToWorkerBasic<T, A, K, P>,
                | "type"
                | "proxyTargetId"
                | "trap"
                | "argumentsList"
                | "getterId"
                | "parentProperty"
                | "argProxyContexts"
                | "temporaryProxyIdForDepositing"
                | "temporaryProxyIdForPickingUp"
              >
            : never
    : T extends "revoke_proxy"
      ? Pick<MsgToWorkerBasic<T>, "type" | "proxyTargetId">
      : T extends "update_array"
        ? Pick<
            MsgToWorkerBasic<T>,
            | "type"
            | "proxyTargetId"
            | "itemProxyContexts"
            | "cloneableItemsInArr"
          >
        : T extends "check_clonability"
          ? Pick<MsgToWorkerBasic<T>, "type" | "value">
          : never;

// MsgData 是当接收到 Worker 传递来的 action_data 或 port_proxy 消息后，将其打包处理后的消息
type MsgData<
  A extends CommonActions,
  D,
  T extends "message" | "proxy" = "message" | "proxy",
> = {
  readonly actionName: keyof A;
  readonly isProxy: T extends "proxy" ? true | { isArray: boolean } : false;
} & (T extends "message"
  ? { readonly data: D }
  : T extends "proxy"
    ? { readonly proxyTargetId: number }
    : never);

// ExtendedMsgData 是 MsgData 加工处理后的数据，用于将这些信息合并到 MessageEventX 或 Promise 的结果中
type ExtendedMsgData<A extends CommonActions, D> = {
  readonly actionName: keyof A;
  readonly isProxy: boolean;
  readonly data: ReceivedData<D>;
  readonly proxyTargetId: number | undefined;
};

// 将 Worker 中的 Action 传递的数据的类型 D 转换成 Main 中接收到的数据的类型（如果 D 无法被结构化克隆，则 ReceivedData 会是 Proxy 类型）
type ReceivedData<D> =
  D extends StructuredCloneable<Transferable> ? D : ProxyData<D>;

//#endregion

//#region - Proxy 相关

// 将任意类型的数据转换为 Proxy 的形式，D 表示要被转换的数据，T 代表 root，即最外层的根 Proxy，其中递归调用的 ProxyData 的 T 都为 false
type ProxyData<D> = D extends new (...args: any[]) => infer Instance // Data 拥有构造签名的情况
  ? new (
      ...args: ConstructorParameters<D>
    ) => PromiseLike<ReceivedData<Instance>> & ProxyData<Instance>
  : D extends (...args: any[]) => infer Result // Data 拥有调用签名的情况
    ? (
        ...args: Parameters<D>
      ) => PromiseLike<ReceivedData<Result>> & ProxyData<Result>
    : D extends object // 排除上面条件后， Data 是引用数据类型的情况
      ? D extends Array<infer I>
        ? ProxyArr<I>
        : ProxyObj<D>
      : PromiseLike<D>;

// 对应数据为对象的 Worker Proxy
export type ProxyObj<D> = {
  [K in keyof D]: D[K] extends (...args: any[]) => any // 对象中的值拥有调用签名的情况
    ? ProxyData<D[K]>
    : D[K] extends new (...args: any[]) => any // 对象中的值拥有构造签名的情况
      ? ProxyData<D[K]>
      : // 对象中的值排除上面条件后的情况
        PromiseLike<ReceivedData<D[K]>> & // 逐层访问的情况，如 const { layer1 } =  await data; const layer2 = await layer1.layer2
          ProxyData<D[K]>; // 链式访问的情况，如 const layer2 = await data.layer1.layer2
};

type ArrWithoutIterator<T> = {
  [P in keyof Array<T>]: P extends typeof Symbol.iterator ? never : Array<T>[P];
};

type ArrWithRewrittenMethods<T, A = ArrWithoutIterator<T>> = {
  [P in keyof A]: A[P] extends <U>(
    callbackfn: (...cbArgs: infer CbArgs) => U,
    ...rest: infer Rest
  ) => U[] | U // 数组方法带泛型的情况
    ? <U>(
        callbackfn: (
          ...cbArgs: {
            [K in keyof CbArgs]: CbArgs[K] extends T ? ProxyObj<T> : CbArgs[K];
          }
        ) => U,
        ...rest: Rest
      ) => ReturnType<A[P]> extends U ? PromiseLike<U> : PromiseLike<U[]>
    : A[P] extends (...args: infer Args) => infer Result // 数组方法不带泛型的情况
      ? (
          ...args: {
            [K in keyof Args]: Args[K] extends (
              ...cbArgs: infer CbArgs
            ) => infer CbResult
              ? (
                  ...cbArgs: {
                    [K in keyof CbArgs]: CbArgs[K] extends T
                      ? ProxyObj<T>
                      : CbArgs[K];
                  }
                ) => CbResult
              : Args[K] extends T
                ? ProxyObj<T>
                : Args[K] extends T[]
                  ? ProxyObj<T[]>
                  : Args[K];
          }
        ) => PromiseLike<
          Result extends T
            ? ProxyObj<T>
            : Result extends T[]
              ? ProxyObj<T>[]
              : Result
        >
      : A[P]; // 不是数组方法的情况
};

// 对应数据为数组的 Worker Proxy
interface ArrWithAsyncIterator<T>
  extends Omit<ArrWithRewrittenMethods<T>, "length"> {
  [Symbol.asyncIterator](): AsyncIterableIterator<ProxyData<T>>;
  length: PromiseLike<number>;
}

type MergeProxyArr<A, O> = {
  [K in keyof A | keyof O]: K extends number
    ? K extends keyof O
      ? O[K]
      : never
    : K extends keyof A
      ? A[K]
      : never;
};

type ProxyArr<I> = MergeProxyArr<ArrWithAsyncIterator<I>, ProxyObj<I[]>>;

type ParametersOfAction<T extends ((...args: any) => any)[]> = {
  [K in keyof T]: ReceivedData<T[K]>;
};

// 修正 Actions 中 Action 在 Main 中的接收的 payload
type AdaptedAction<A extends CommonActions> = {
  [K in keyof A]: (
    ...args: ParametersOfAction<Parameters<A[K]>>
  ) => ReturnType<A[K]>;
};

export type UnwrapPromise<T extends Promise<any> | PromiseLike<any>> =
  T extends Promise<infer D> ? D : T extends PromiseLike<infer D> ? D : never;

//#endregion

type ExecuteOptions = {
  transfer: Transferable[] | "auto";
  timeout: number;
};

type ListenerMap = {
  message?: (e: MessageEvent<any>) => any;
  messageerror?: (e: MessageEvent<any>) => any;
  error?: (e: ErrorEvent) => any;
};

interface MessageEventX<A extends CommonActions, D>
  extends Omit<MessageEvent, "data">,
    ExtendedMsgData<A, D> {}

interface MessageSource<D, A extends CommonActions>
  extends Omit<
    MessagePort,
    "addEventListener" | "onmessage" | "onmessageerror"
  > {
  promise: Promise<ExtendedMsgData<A, D>>;
  readonly readyState: ReadyState["current"];
  onmessage: ((this: MessagePort, ev: MessageEventX<A, D>) => any) | null;
  onmessageerror:
    | ((this: MessagePort, ev: MessageEventX<A, any>) => any)
    | null;
  addEventListener(
    type: "message",
    listener: (this: MessagePort, ev: MessageEventX<A, D>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, A>;
  addEventListener(
    type: "messageerror",
    listener: (this: MessagePort, ev: MessageEventX<A, any>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, A>;
}

type ReadyState = { current: 0 | 1 | 2 };

//#endregion

//#region - WorkerHandler

export class WorkerHandler<A extends CommonActions> {
  constructor(workerSrc: string | URL | Worker, options?: WorkerOptions) {
    const _options: WorkerOptions = {
      ...options,
      type: "module",
    };
    if (workerSrc instanceof Worker) {
      this.worker = workerSrc;
    } else {
      this.worker = new Worker(workerSrc, _options);
    }
    const initialListenerMap = {
      message: (e: MessageEvent<MsgFromWorker>) => {
        if (e.data.type === "message_error") {
          this.worker.dispatchEvent(
            new MessageEvent(
              "messageerror",
              e as unknown as MessageEventInit<MsgFromWorker<"message_error">>
            )
          );
        }
      },
    };
    this.handleListeners(initialListenerMap);
  }

  //#region - 私有方法和属性

  private worker: Worker;

  private executionId = 0;

  private listenerMapsSet: Set<ListenerMap> = new Set();

  private messageChannelsSet: Set<{
    messageChannel: MessageChannel;
    readyState: ReadyState;
  }> = new Set();

  //#region - this.handleListeners ！！ 处理消息的核心

  // 使用 this.handleListeners 添加或移除事件监听器，监听 message 事件时，接收从 Worker 传来的 MsgFromWorker 类型的消息，根据不同消息标识来分别处理

  /**
   * 用于批量管理（添加或移除）事件监听器
   * @param listenerMap 要管理的事件类型和事件回调的映射关系
   * @param isAdd 默认为 true ，代表添加事件监听器，如果指定为 false 则代表移除事件监听器
   */
  private handleListeners(listenerMap: ListenerMap, isAdd: boolean = true) {
    for (const key in listenerMap) {
      if (isAdd) {
        if (key === "error" && listenerMap["error"]) {
          this.worker.addEventListener("error", listenerMap["error"]);
        } else if (key === "message" && listenerMap["message"]) {
          this.worker.addEventListener("message", listenerMap["message"]);
        } else if (key === "messageerror" && listenerMap["messageerror"]) {
          this.worker.addEventListener(
            "messageerror",
            listenerMap["messageerror"]
          );
        }
        this.listenerMapsSet.add(listenerMap);
      } else {
        if (key === "error" && listenerMap["error"]) {
          this.worker.removeEventListener("error", listenerMap["error"]);
        } else if (key === "message" && listenerMap["message"]) {
          this.worker.removeEventListener("message", listenerMap["message"]);
        } else if (key === "messageerror" && listenerMap["messageerror"]) {
          this.worker.removeEventListener(
            "messageerror",
            listenerMap["messageerror"]
          );
        }
        this.listenerMapsSet.delete(listenerMap);
      }
    }
  }

  //#endregion

  //#region - postMsgToWorker

  /**
   * 传递消息传递给 worker，使得 worker 调用 action
   * @param actionName action 的名称
   * @param options 配置选项
   * @param payloads action 接收参数
   * @returns executionId
   */
  private postMsgToWorker<K extends keyof A>(
    actionName: K,
    transfer: Transferable[],
    ...payloads: Parameters<AdaptedAction<A>[K]>
  ) {
    const {
      argProxyContexts: payloadProxyContexts,
      argumentsList: payloadsList,
    } = this.utilsForProxy.handleArguments(payloads);

    const msgToWorker: MsgToWorker<"execute_action", A, K> = {
      type: "execute_action",
      actionName,
      payloads: payloadsList,
      payloadProxyContexts,
      executionId: this.executionId++,
    };

    try {
      this.worker.postMessage(msgToWorker, transfer);
    } catch (error) {
      console.error(error);
    }
    return msgToWorker.executionId;
  }

  //#endregion

  //#region - watchMsgFromWorker

  /**
   * 当传递消息给 worker 后，监听产生的非终止消息
   * @param executionId
   * @param actionName
   * @param readyState
   * @returns [messagePort, receivePort, listenerMap, messageChannel]
   */
  private watchMsgFromWorker<D>(
    executionId: number,
    actionName: keyof A,
    readyState: ReadyState
  ) {
    const messageChannel = new MessageChannel();

    this.messageChannelsSet.add({ messageChannel, readyState });

    // sendPort 用于将从 worker 中接收到的数据发送给 recievePort，recievePort 会被用于生成 messageSource，作为 this.execute() 的返回值暴露出去
    const { port1: sendPort, port2: receivePort } = messageChannel;
    sendPort.start();
    receivePort.start();

    const startSignalListenerMap: ListenerMap = {
      message: (e: MessageEvent<MsgFromWorker<"start_signal">>) => {
        if (
          e.data.type === "start_signal" &&
          e.data.executionId === executionId
        ) {
          readyState.current = 1;
          this.handleListeners(startSignalListenerMap, false);
        }
      },
    };

    this.handleListeners(startSignalListenerMap);

    const msgListenerMap: ListenerMap = {
      message: (
        e: MessageEvent<MsgFromWorker<"action_data" | "port_proxy", D>>
      ) => {
        if (e.data.done || e.data.executionId !== executionId) return;
        if (e.data.type === "action_data") {
          const msgData: MsgData<A, D, "message"> = {
            data: e.data.data,
            actionName,
            isProxy: false,
          };
          sendPort.postMessage(msgData);
        } else if (e.data.type === "port_proxy") {
          const msgData: MsgData<A, D, "proxy"> = {
            actionName,
            isProxy: { isArray: e.data.isArray },
            proxyTargetId: e.data.proxyTargetId,
          };
          sendPort.postMessage(msgData);
        }
      },
      messageerror: (e: MessageEvent<MsgFromWorker<"message_error">>) => {
        if (e.data.executionId === executionId && !e.data.done) {
          receivePort.dispatchEvent(
            new MessageEvent("messageerror", {
              data: { actionName, error: e.data.error },
            })
          );
        }
      },
    };

    this.handleListeners(msgListenerMap);

    return [receivePort, msgListenerMap, messageChannel] as [
      MessagePort,
      ListenerMap,
      MessageChannel,
    ];
  }

  //#endregion

  //#region - watchResultFromWorker

  /**
   * 当传递消息给 worker 后，监听产生的终止消息
   * @param executionId
   * @param actionName
   * @param timeout
   * @param msgListenerMap
   * @param messageChannel
   * @param readyState
   * @returns promise
   */
  private watchResultFromWorker<D>(
    executionId: number,
    actionName: keyof A,
    timeout: number,
    msgListenerMap: ListenerMap,
    messageChannel: MessageChannel,
    readyState: ReadyState
  ) {
    let resultListenerMap: ListenerMap;
    const promise = new Promise<MsgData<A, D>>((resolve, reject) => {
      if (timeout > 0) {
        setTimeout(() => {
          reject("timeout");
        }, timeout);
      }

      resultListenerMap = {
        message(
          e: MessageEvent<MsgFromWorker<"action_data" | "port_proxy", D>>
        ) {
          if (!e.data.done || e.data.executionId !== executionId) return;
          if (e.data.type === "action_data") {
            const result: MsgData<A, D, "message"> = {
              data: e.data.data,
              actionName,
              isProxy: false,
            };
            resolve(result);
          } else if (e.data.type === "port_proxy") {
            const result: MsgData<A, D, "proxy"> = {
              actionName,
              isProxy: { isArray: e.data.isArray },
              proxyTargetId: e.data.proxyTargetId,
            };
            resolve(result);
          }
        },
        messageerror(e: MessageEvent<MsgFromWorker<"message_error", D>>) {
          if (e.data.executionId === executionId && e.data.done) {
            reject({
              data: { actionName, error: e.data.error },
            });
          }
        },
        error(e: ErrorEvent) {
          reject(e);
        },
      };

      this.handleListeners(resultListenerMap);
    });

    const newPromise = promise.then((res) => {
      if (res.isProxy) {
        let isArray = false;
        if (typeof res.isProxy === "object") {
          isArray = res.isProxy.isArray;
        }
        const msgData = res as MsgData<A, D, "proxy">;
        const data = this.createProxy(
          msgData.proxyTargetId,
          "root_proxy",
          isArray
        );
        return { ...res, data } as ExtendedMsgData<A, D>;
      } else {
        return res as ExtendedMsgData<A, D>;
      }
    });

    const clearEffects = () => {
      // 当一个 action 从 Worker 获取到 result 响应（终止消息）时清除副作用，由于此时已经不需要再从 Worker 接收 响应消息了，因此可以立马将 resultListenerMap 和 msgListenerMap 中的监听器全部移除
      this.handleListeners(resultListenerMap, false);
      this.handleListeners(msgListenerMap, false);
      readyState.current = 2;
      // 但是在 promise 被 resolve 之前的一瞬间，如果 action 从 Worker 获取到了 msg 响应（非终止消息），那么还此时需要使用 messageChannel 来将响应传递给 messageSource，因此关闭 messageChannel 中的 port 的操作异步执行
      setTimeout(() => {
        messageChannel.port1.close();
        messageChannel.port2.close();
      });
    };

    // 之所以要在 then() 和 catch() 的回调中中分别执行一次 clearEffects()，而不在 finally() 的回调中执行，是为了保证当用户在 promise 的 then() 或 catch() 的回调中访问到的 readyState.current 一定为 2，而 finally() 中的回调的执行晚于 then() 和 catch() 的回调的执行
    newPromise
      .then(() => {
        clearEffects();
      })
      .catch(() => {
        clearEffects();
      });

    // 返回的这个 promise 会在 this.execute() 中再用于进行一次副作用清理
    return newPromise;
  }

  //#endregion

  //#region - reduceEventListener

  /**
   * 将 messageSource 接收的 listener 中的参数还原为标准的 listener 的参数
   * @param extendedListener messageSource 接收的 listener
   * @param receivePort listener 的 this
   * @returns 还原后的 listener
   */
  private reduceEventListener<A extends CommonActions>(
    extendedListener: (this: MessagePort, ev: MessageEventX<A, any>) => any,
    receivePort: MessagePort
  ) {
    return async (ev: MessageEvent<MsgData<A, any>>) => {
      const extendedEventTmp: any = {};
      for (const p in ev) {
        let item = ev[p as keyof typeof ev];
        if (typeof item === "function") item = item.bind(ev);
        extendedEventTmp[p] = item;
      }
      let extendedEvent: any;
      if (ev.data.isProxy) {
        const isArray =
          typeof ev.data.isProxy === "object" ? ev.data.isProxy.isArray : false;
        const msgData = ev.data as MsgData<A, any, "proxy">;
        const data = this.createProxy(
          msgData.proxyTargetId,
          "root_proxy",
          isArray
        );
        extendedEvent = { ...extendedEventTmp, ...msgData, data };
      } else {
        const msgData = ev.data as MsgData<A, any, "message">;
        extendedEvent = { ...extendedEventTmp, ...msgData };
      }
      extendedListener.call(receivePort, extendedEvent);
    };
  }

  //#endregion

  //#region - receiveProxyData

  /**
   * 在 this.handleProxy() 中，当需要获取 Worker 中传递来的 handle_proxy 执行结果消息时调用
   * @param handleProxyMsg
   * @returns 一个 target 为 promise 的 proxy，这个 proxy 是用来处理 Worker Proxy 的链式调用的，而这个 promise 最终会 resolve 出 Worker Proxy
   */
  private receiveProxyData(
    handleProxyMsg: MsgToWorker<
      "handle_proxy",
      A,
      keyof A,
      "get" | "apply" | "construct"
    >
  ) {
    const promise = new Promise((resolve) => {
      const handleProxylistenerMap: ListenerMap = {
        message: (e: MessageEvent<MsgFromWorker>) => {
          if (
            e.data.type === "proxy_data" &&
            e.data.proxyTargetId === handleProxyMsg.proxyTargetId &&
            e.data.getterId === handleProxyMsg.getterId
          ) {
            resolve(e.data.data);
            this.handleListeners(handleProxylistenerMap, false);
          } else if (
            e.data.type === "create_subproxy" &&
            e.data.parentProxyTargetId === handleProxyMsg.proxyTargetId &&
            e.data.getterId === handleProxyMsg.getterId
          ) {
            resolve(
              this.createProxy(
                e.data.proxyTargetId,
                "sub_proxy",
                e.data.isArray
              )
            );
            this.handleListeners(handleProxylistenerMap, false);
          }
        },
      };
      this.handleListeners(handleProxylistenerMap);
    });
    let temporaryProxyIdForPickingUp: number | null = null;
    if (
      handleProxyMsg.trap === "apply" ||
      handleProxyMsg.trap === "construct"
    ) {
      temporaryProxyIdForPickingUp =
        handleProxyMsg.temporaryProxyIdForDepositing;
    }
    return this.createProxy(
      handleProxyMsg.proxyTargetId,
      promise,
      (handleProxyMsg as any).property,
      temporaryProxyIdForPickingUp || undefined
    );
  }

  private handleProxy(handleProxyMsg: MsgToWorker<"handle_proxy">) {
    try {
      this.worker.postMessage(handleProxyMsg);
      const { trap } = handleProxyMsg;
      if (trap === "get") {
        return this.receiveProxyData(handleProxyMsg);
      } else if (trap === "set") {
        return true;
      } else if (trap === "apply") {
        return this.receiveProxyData(handleProxyMsg);
      } else if (trap === "construct") {
        return this.receiveProxyData(handleProxyMsg);
      }
    } catch (error) {
      console.error(error);
    }
  }

  //#endregion

  //#region - UtilsForHandler

  private utilsForProxy: {
    reduceProxyContext(proxyContext: ProxyContextX): ProxyContext;
    reduceProxyContext(proxyContext: undefined): undefined;
    reduceProxyContext(
      proxyContext: ProxyContextX | undefined
    ): ProxyContext | undefined;
    handleArguments(argumentsList: any[]): any;
  } = {
    /**
     * 将 ProxyContextX 精简为 ProxyContext 后返回
     * @param proxyContext ProxyContextX 或 undefined
     * @returns ProxyContext 或 undefined
     */
    reduceProxyContext(proxyContext: any): any {
      if (proxyContext) {
        const { proxyTargetId, parentProperty } = proxyContext;
        return { proxyTargetId, parentProperty };
      }
    },
    /**
     * 接收初始的 argumentsList，将其中引用了 Worker 数据的 Proxy 提取并解析后放入 argProxyContexts 中
     * @param argumentsList
     * @returns  一个包含 argProxyContexts 和提炼后的 argumentsList 的对象
     */
    handleArguments: (argumentsList: any[]) => {
      const argProxyContexts: (ProxyContext | undefined)[] = [];
      const newArgumentsList = argumentsList.map((arg, index) => {
        const argProxyContext = this.proxyWeakMap.get(arg);
        if (argProxyContext) {
          const { proxyTargetId, parentProperty } = argProxyContext;
          argProxyContexts[index] = { proxyTargetId, parentProperty };
          return null;
        }
        return arg;
      });
      return { argProxyContexts, argumentsList: newArgumentsList };
    },
  };

  //#endregion

  //#region - 私有属性

  // proxy 拦截 get 操作时的唯一标识，用于匹配返回的 data，每次拦截时都会递增
  private currentProxyGetterId = 1;

  // proxyWeakMap 中存储 proxy 和与之对应的 proxyTargetId 和 revoke 方法
  private proxyWeakMap = new WeakMap<any, ProxyContextX>();

  // 当 Worker Proxy 通过 apply 操作或 construct 操作在 Worker 中产生了新的需要代理的数据，而无法及时在 Main 中获取其 proxyTargetId 时，使用这个临时的 temporaryProxyId 作为唯一标识符，每次调用 Worker Proxy 的 apply 或 construct 捕捉器时递增
  private currentTemporaryProxyId = 1;

  //#endregion

  //#region - checkClonability
  /**
   * 检测一个数据是否可以被传输到 Worker 中，如果不能，则会抛出错误
   * @param value
   */
  private checkClonability(value: any) {
    const checkClonabilityMsg: MsgToWorker<"check_clonability"> = {
      type: "check_clonability",
      value,
    };
    this.worker.postMessage(checkClonabilityMsg);
  }

  //#endregion

  //#region - createProxy

  /**
   * 创建一个 Worker Proxy
   * @param proxyTargetId Worker 中定义的 proxy 引用的数据的唯一标识符
   * @param workerProxyType Worker Proxy 的类型
   * @param isTargetArray Worker Proxy 引用的数据是不是数组
   */
  private createProxy(
    proxyTargetId: number,
    workerProxyType: "root_proxy" | "sub_proxy",
    isTargetArray: boolean
  ): any;

  /**
   * 创建一个 Carrier Proxy，它会在对一个 Worker Proxy 进行 get 操作，或对一个 Carrier Proxy 进行 get、apply、construct 操作（即对 Worker Proxy 进行链式调用）时被创建
   * @param proxyTargetId Worker 中定义的 proxy 引用的数据的唯一标识符
   * @param carriedPromise 一个会 resolve 出 Worker Promise 或被结构化克隆后的数据的 Promise
   * @param parentProperty 创建该 Carrier Proxy 的父级 Carrier Proxy 们被访问过的属性。当该 Carrier Proxy 触发 get 捕捉器时，会将 property 放入 parentProperty 的末尾，根据该数组中的属性名在 Worker 中获取到引用的数据的对应属性，如果还需要创建子级的 Carrier Proxy，它会作为新的 parentProperty
   * @param temporaryProxyId 如果该 Carrier Proxy 是由父级 Carrier Proxy 通过 apply 或 construct 操作创建时需要传入。由于 apply 和 construct 操作在 worker 中产生了新的需要代理的数据，而对应的 proxyTargetId 无法在 Main 中同步取得，因此使用 Main 中创建的 temporaryProxyId 来代替作为唯一标识符。而此时前面的 proxyTargetId 参数将失效。
   */
  private createProxy(
    proxyTargetId: number,
    carriedPromise: Promise<any>,
    parentProperty: keyof any | (keyof any)[],
    temporaryProxyId?: number
  ): any;

  private createProxy(proxyTargetId: number, p1: any, p2: any, p3?: any) {
    const _this = this;
    //#region - 整理重载参数
    const proxyType: "Worker Proxy" | "Carrier Proxy" =
      typeof p1 === "string" ? "Worker Proxy" : "Carrier Proxy";

    let isTargetArray: boolean = false;

    let promiseProxy: any = null;
    let promiseRevoke: (() => void) | null = null;

    let parentProperty: keyof any | (keyof any)[] | null = null;
    let temporaryProxyId: number | null = null;

    if (proxyType === "Worker Proxy") {
      isTargetArray = p2;
    } else {
      const carriedPromise: Promise<any> = p1;
      parentProperty = p2;
      temporaryProxyId = p3 || null;

      //#endregion

      //#region - promiseProxy

      // 当创建的是 Carrier Proxy 时，需要再创建一个 promiseProxy 作为 dataProxy 的 target，使得通过 Carrier Proxy 进行的链式调用的结果是一个类 Promise 对象，可以 resolve 出一个 Worker Proxy 或结构化克隆后的数据
      const { proxy, revoke } = Proxy.revocable(function () {}, {
        get(_, property) {
          if (property in carriedPromise) {
            const value = Reflect.get(carriedPromise, property);
            if (typeof value === "function") {
              return value.bind(carriedPromise);
            } else {
              return value;
            }
          }
        },
        set(_, property, value) {
          return Reflect.set(carriedPromise, property, value);
        },
        apply(target, thisArg, argumentsList) {
          return Reflect.apply(target, thisArg, argumentsList);
        },
        has(_, property) {
          return Reflect.has(carriedPromise, property);
        },
      });
      promiseProxy = proxy;
      promiseRevoke = revoke;

      //#endregion
    }

    //#region - dataProxy

    // dataProxy 是操作 data 的 Proxy，对 dataProxy 的操作最终会反应到 Worker 中被引用的 Data 上，其中一些特定操作会被反应到 tailProxy 上
    const dataProxyHandler: ProxyHandler<any> = {
      get(_target, property) {
        if (proxyType === "Carrier Proxy") {
          // 当前创建的是 Carrier Proxy 时，dataProxy 的 target 是 promiseProxy，需要代理对它的 get 操作
          if (property in _target) {
            const value = _target[property];
            if (typeof value === "function") {
              return value.bind(_target);
            } else {
              return value;
            }
          }
        } else {
          // 当前创建的是 Worker Proxy 时，如果对其进行 await 操作，需进行无视，否则调用对应方法的消息将被发送到 Worker 中，而传入的回调函数无法被结构化克隆
          if (
            property === "then" ||
            property === "catch" ||
            property === "finally"
          )
            return;
        }

        // symbol 类型的数据无法被传送到 Worker 中
        if (typeof property === "symbol") return;

        let propertyValue: keyof any | (keyof any)[];

        if (parentProperty) {
          const parentPropertyArray = Array.isArray(parentProperty)
            ? parentProperty
            : [parentProperty];
          if (Array.isArray(property)) {
            propertyValue = [...parentPropertyArray, ...property];
          } else {
            propertyValue = [...parentPropertyArray, property];
          }
        } else {
          propertyValue = property;
        }

        return _this.handleProxy({
          type: "handle_proxy",
          trap: "get",
          proxyTargetId,
          property: propertyValue,
          getterId: _this.currentProxyGetterId++,
          temporaryProxyIdForPickingUp: temporaryProxyId,
        });
      },

      set(_target, property, value) {
        if (property in _target) {
          return Reflect.set(_target, property, value);
        }

        let propertyValue: keyof any | (keyof any)[];

        if (parentProperty) {
          const parentPropertyArray = Array.isArray(parentProperty)
            ? parentProperty
            : [parentProperty];
          if (Array.isArray(property)) {
            propertyValue = [...parentPropertyArray, ...property];
          } else {
            propertyValue = [...parentPropertyArray, property];
          }
        } else {
          propertyValue = property;
        }

        try {
          _this.checkClonability(value);
        } catch (error) {
          const valueProxyContextX = _this.proxyWeakMap.get(value);
          if (valueProxyContextX) {
            const valueProxyContext =
              _this.utilsForProxy.reduceProxyContext(valueProxyContextX);
            return _this.handleProxy({
              type: "handle_proxy",
              trap: "set",
              proxyTargetId,
              property: propertyValue,
              value: null,
              valueProxyContext,
              temporaryProxyIdForPickingUp: temporaryProxyId,
            });
          } else return false;
        }

        return _this.handleProxy({
          type: "handle_proxy",
          trap: "set",
          proxyTargetId,
          property: propertyValue,
          value,
          temporaryProxyIdForPickingUp: temporaryProxyId,
        });
      },

      apply(_, thisArg, _argumentsList) {
        // 处理 thisArg
        const _thisProxyContext = _this.proxyWeakMap.get(thisArg);

        // 处理 argumentsList
        const { argProxyContexts, argumentsList } =
          _this.utilsForProxy.handleArguments(_argumentsList);

        return _this.handleProxy({
          type: "handle_proxy",
          trap: "apply",
          proxyTargetId,
          getterId: _this.currentProxyGetterId++,
          parentProperty: Array.isArray(parentProperty)
            ? parentProperty
            : parentProperty
              ? [parentProperty]
              : [],
          argumentsList,
          argProxyContexts,
          thisProxyContext:
            _this.utilsForProxy.reduceProxyContext(_thisProxyContext),
          thisArg: _thisProxyContext ? undefined : thisArg,
          temporaryProxyIdForDepositing: _this.currentTemporaryProxyId++,
          temporaryProxyIdForPickingUp: temporaryProxyId,
        });
      },

      construct(_, _argumentsList) {
        // 处理 argumentList
        const { argProxyContexts, argumentsList } =
          _this.utilsForProxy.handleArguments(_argumentsList);

        return _this.handleProxy({
          type: "handle_proxy",
          trap: "construct",
          proxyTargetId,
          getterId: _this.currentProxyGetterId++,
          parentProperty: Array.isArray(parentProperty)
            ? parentProperty
            : parentProperty
              ? [parentProperty]
              : [],
          argumentsList,
          argProxyContexts,
          temporaryProxyIdForDepositing: _this.currentTemporaryProxyId++,
          temporaryProxyIdForPickingUp: temporaryProxyId,
        });
      },
    };

    const { proxy: dataProxy, revoke: dataProxyRevoke } = Proxy.revocable(
      promiseProxy || function () {},
      dataProxyHandler
    );

    //#endregion

    //#region - arrayProxy

    let arrayProxy: any[] | null = null;
    let arrayProxyRevoke: (() => void) | null = null;

    // 当目标数据为 Array 时进行拓展处理
    if (isTargetArray) {
      // 在 Main 中创建一个数组
      const arr: any[] = [];

      /**
       * 将 Worker 中的数组同步给 Main 中的数组
       */
      async function drawArr() {
        arr.length = await dataProxy.length;
        for (let i = 0; i < arr.length; i++) {
          arr[i] = await dataProxy[i];
        }
      }

      /**
       * updateArr 将 Main 中的数组同步给 Worker 中的数组
       */
      async function updateArr() {
        const cloneableItemsInArr = arr.map((item) => {
          try {
            _this.checkClonability(item);
          } catch (error) {
            return;
          }
          return item;
        });
        const itemProxyContexts = arr.map((item) => {
          const itemProxyContext = _this.utilsForProxy.reduceProxyContext(
            _this.proxyWeakMap.get(item)
          );
          return itemProxyContext;
        });
        const updateArrMsg: MsgToWorker<"update_array"> = {
          type: "update_array",
          proxyTargetId,
          itemProxyContexts,
          cloneableItemsInArr,
        };
        _this.worker.postMessage(updateArrMsg);
      }

      /**
       * 生成改造后的数组方法
       * @param property 要改造的数组方法名
       * @returns
       */
      function getWrappedArrMethod(property: string) {
        return function (...args: any[]) {
          const methodResultPromise: Promise<any> = new Promise(
            async (resolve, reject) => {
              try {
                await drawArr();
                let methodResult: any;
                // 对 forEach 进行重写，使得当 forEach 中接收的回调是异步函数时，当异步函数中的所有 await 执行完毕后，forEach 返回的 Promise 才会被 resolve
                if (property === "forEach") {
                  const callback = args[0];
                  const callbackResults: any[] = [];
                  for (const i in arr) {
                    callbackResults.push(callback(arr[i], Number(i)));
                  }
                  if (callbackResults[0] instanceof Promise)
                    await Promise.all(callbackResults);
                } else {
                  methodResult = (arr as any)[property].apply(arr, args);
                }
                // 会修改原数组的方法的名称
                const mutatingMethods = [
                  "copyWithin",
                  "fill",
                  "pop",
                  "push",
                  "reverse",
                  "shift",
                  "sort",
                  "splice",
                  "unshift",
                ];
                if (mutatingMethods.indexOf(property) !== -1) await updateArr();
                resolve(methodResult);
              } catch (error) {
                reject(error);
              }
            }
          );

          return methodResultPromise;
        };
      }

      /**
       * 判断一个属性名是否是数组方法名
       * @param property
       * @returns
       */
      function isArrayMethodProperty(property: keyof any): property is string {
        return typeof property === "symbol" || typeof property === "number"
          ? false
          : Object.getOwnPropertyNames(Array.prototype).indexOf(property) !== -1
            ? typeof (arr as any)[property] === "function"
            : false;
      }

      const arrayProxyHandler: ProxyHandler<Array<any>> = {
        get(arr, property) {
          if (
            property === "then" ||
            property === "catch" ||
            property === "finally" ||
            typeof property === "symbol"
          ) {
            if (property === Symbol.asyncIterator)
              return async function* () {
                await drawArr();
                for (const item of arr) {
                  yield await item;
                }
              };
            return;
          } else if (isArrayMethodProperty(property)) {
            return getWrappedArrMethod(property);
          } else if (!isNaN(Number(property)) || property === "length") {
            const promise = new Promise(async (resolve) => {
              await drawArr();
              resolve((arr as any)[property]);
            });
            return _this.createProxy(proxyTargetId, promise, property);
          } else {
            return;
          }
        },
        set(arr, property, value) {
          if (!isNaN(Number(property)) || property === "length") {
            (arr as any)[property] = value;
            updateArr();
            return true;
          } else {
            return false;
          }
        },
      };
      const { proxy, revoke } = Proxy.revocable(arr, arrayProxyHandler);

      arrayProxy = proxy;
      arrayProxyRevoke = revoke;
    }

    //#endregion

    //#region - 关联 Proxy

    // 将关联的 Proxy 放入 associatedProxies 集合中
    const associatedProxies = new Set();
    associatedProxies.add(dataProxy);
    if (promiseProxy) associatedProxies.add(promiseProxy);
    if (arrayProxy) associatedProxies.add(arrayProxy);

    this.proxyWeakMap.set(dataProxy, {
      proxyTargetId,
      parentProperty,
      revoke: dataProxyRevoke,
      associatedProxies,
      isRevoked: false,
      isArray: isTargetArray,
    });

    if (promiseProxy && promiseRevoke) {
      this.proxyWeakMap.set(promiseProxy, {
        proxyTargetId,
        parentProperty,
        revoke: promiseRevoke,
        associatedProxies,
        isRevoked: false,
        isArray: isTargetArray,
      });
    }

    if (arrayProxy && arrayProxyRevoke)
      this.proxyWeakMap.set(arrayProxy, {
        proxyTargetId,
        parentProperty,
        revoke: arrayProxyRevoke,
        associatedProxies,
        isRevoked: false,
        isArray: true,
      });

    //#endregion

    return arrayProxy || dataProxy;
  }

  //#endregion

  //#endregion

  //#region - 暴露给实例的方法和属性

  get instance() {
    return this.worker;
  }

  //#region - terminate

  /**
   * 终止 worker 进程，并移除主线程上为 worker 进程添加的监听器
   */
  terminate() {
    this.worker.terminate();
    this.listenerMapsSet.forEach((listenerMap) => {
      this.handleListeners(listenerMap, false);
    });
    this.listenerMapsSet.clear();
    this.messageChannelsSet.forEach((messageChannel) => {
      const {
        readyState,
        messageChannel: { port1, port2 },
      } = messageChannel;
      readyState.current = 2;
      port1.close();
      port2.close();
    });
    this.messageChannelsSet.clear();
  }

  //#endregion

  //#region - revokeProxy

  /**
   * 废除 proxy，并清理 Worker 中对应的数据
   * @param proxy
   */
  revokeProxy(proxy: any) {
    const proxyContext = this.proxyWeakMap.get(proxy);
    if (!proxyContext) return;
    if (!proxyContext.isRevoked) proxyContext.revoke();
    proxyContext.isRevoked = true;
    proxyContext.associatedProxies.delete(proxy);

    proxyContext.associatedProxies.forEach((associatedProxy, _, set) => {
      if (set.has(associatedProxy)) this.revokeProxy(associatedProxy);
    });

    const revokeProxyMsg: MsgToWorker<"revoke_proxy"> = {
      type: "revoke_proxy",
      proxyTargetId: proxyContext.proxyTargetId,
    };
    this.worker.postMessage(revokeProxyMsg);
  }

  //#endregion

  //#region - execute

  /**
   * 执行一次 action 调用
   * @param actionName action 名称
   * @param options 选项
   * @param payloads action 接收的参数
   * @returns messageSource
   */
  execute<K extends keyof A>(
    actionName: K,
    options?:
      | Partial<ExecuteOptions>
      | ExecuteOptions["transfer"]
      | ExecuteOptions["timeout"]
      | null,
    ...payloads: Parameters<AdaptedAction<A>[K]>
  ) {
    let inputedTransfer: ExecuteOptions["transfer"] = [];
    let timeout: number = 0;
    if (Array.isArray(options) || options === "auto") {
      inputedTransfer = options;
    } else if (typeof options === "number") {
      timeout = options;
    } else if (typeof options === "object" && options !== null) {
      inputedTransfer = options.transfer || [];
      timeout = options.timeout || 0;
    }
    const transfer =
      inputedTransfer === "auto" ? getTransfers(payloads) : inputedTransfer;

    const executionId = this.postMsgToWorker(actionName, transfer, ...payloads);

    const readyState: ReadyState = { current: 0 };

    const [receivePort, msgListenerMap, messageChannel] =
      this.watchMsgFromWorker(executionId, actionName, readyState);

    const promise = this.watchResultFromWorker<GetDataType<A, K>>(
      executionId,
      actionName,
      timeout,
      msgListenerMap,
      messageChannel,
      readyState
    );

    // boundReceivePort 中的方法都绑定了 receivePort 作为 this
    const boundReceivePort = (function getBoundReceivePort() {
      const boundReceivePort = { ...receivePort } as MessagePort;
      for (const key in receivePort) {
        const k = key as keyof MessagePort;
        const method = receivePort[k];
        if (typeof method === "function") {
          boundReceivePort[k] = method.bind(receivePort) as any;
        }
      }
      return boundReceivePort;
    })();

    type ListenerTuple = [
      "message" | "messageerror",
      (this: MessagePort, ev: MessageEvent<any>) => any,
    ];

    // listenerSet 中存放通过 messageSource.addEventListener() 添加的监听器信息，当本次通信完毕后移除 listenerSet 中的所有监听器
    let listenerSet = new Set<ListenerTuple>();

    const newPromise: Promise<ExtendedMsgData<A, GetDataType<A, K>>> =
      new Promise((resolve, reject) => {
        promise
          .then((res) => {
            // 由于 msg 响应（非终止消息）达到 Main 后需要解析后再通过 messageChannel 异步地传递给 messageSource，因此为了确保一个 action 中 result 响应（非终止消息）始终是最后接收到的，该 promise 被异步地 resolve
            setTimeout(() => {
              resolve(res);
            });
          })
          .catch((res) => {
            reject(res);
          })
          .finally(() => {
            // 如果 promise 被 resolve 之前的一瞬间，action 从 Worker 获取到了 msg 响应（非终止消息），那么添加给 receivePort 的监听器还需要用来接收这次消息的数据，因此将移除监听器的操作异步执行
            setTimeout(() => {
              listenerSet.forEach((listenerTuple) => {
                receivePort.removeEventListener(
                  listenerTuple[0],
                  listenerTuple[1]
                );
              });
              listenerSet.clear();
            });
          });
      });

    const messageSource: MessageSource<GetDataType<A, K>, A> = {
      ...boundReceivePort,
      readyState: readyState.current,
      addEventListener: (type, extendedListener) => {
        const listener = this.reduceEventListener(
          extendedListener,
          receivePort
        );
        receivePort.addEventListener(type, listener);
        listenerSet.add([type, listener]);
        return messageSource;
      },
      promise: newPromise,
    };

    let messageerrorCallback:
      | ((this: MessagePort, ev: MessageEvent) => any)
      | null;

    Object.defineProperties(messageSource, {
      readyState: {
        get: () => readyState.current,
        set: () => {
          console.warn(`'readyState' is read-only.`);
        },
      },
      onmessage: {
        set: (
          extendedOnmessage:
            | ((
                this: MessagePort,
                ev: MessageEventX<A, GetDataType<A, K>>
              ) => any)
            | null
        ) => {
          if (extendedOnmessage) {
            receivePort.onmessage = this.reduceEventListener(
              extendedOnmessage,
              receivePort
            );
          } else {
            receivePort.onmessage = null;
          }
        },
        get: () => receivePort.onmessage,
      },
      onmessageerror: {
        set: (
          extendedOnmessageerror:
            | ((this: MessagePort, ev: MessageEventX<A, any>) => any)
            | null
        ) => {
          // 由于 messageerror 事件是使用 dispatchEvent 触发的，仅对 addEventListener() 生效，因此这里使用 addEventListener() 来模拟
          if (messageerrorCallback) {
            receivePort.removeEventListener(
              "messageerror",
              messageerrorCallback
            );
          }
          if (extendedOnmessageerror) {
            messageerrorCallback = this.reduceEventListener(
              extendedOnmessageerror,
              receivePort
            );
            receivePort.addEventListener("messageerror", messageerrorCallback);
          } else {
            messageerrorCallback = null;
          }
        },
        get: () => messageerrorCallback,
      },
    });

    return messageSource;
  }
}

//#endregion

//#endregion

//#endregion
