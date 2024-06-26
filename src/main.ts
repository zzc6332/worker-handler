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
          "type" | "proxyTargetId" | "trap" | "getterId" | "property"
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
  readonly data: D;
  // readonly data: ProxyData<D>; // - 未使用
  readonly proxyTargetId: number | undefined;
};

// 将 Worker 中的 Action 传递的数据的类型 D 转换成 Main 中接收到的数据的类型（如果 D 无法被结构化克隆，则 ReceivedData 会是 Proxy 类型）
type ReceivedData<D, T extends boolean = true> =
  D extends StructuredCloneable<Transferable> ? D : ProxyData<D, T>;

// 将任意类型的数据转换为 Proxy 的形式，D 表示要被转换的数据，T 代表 root，即最外层的根 Proxy，其中递归调用的 ProxyData 的 T 都为 false
type ProxyData<D, T extends boolean = true> = D extends (
  ...args: any[]
) => infer R
  ? (...args: Parameters<D>) => PromiseLike<ReceivedData<R>>
  : D extends new (...args: any[]) => infer I
    ? new (...args: ConstructorParameters<D>) => PromiseLike<ReceivedData<I>>
    : D extends object
      ? {
          [K in keyof D]: T extends true
            ? D[K] extends (...args: any[]) => any
              ? ReceivedData<D[K], false>
              : D[K] extends new (...args: any[]) => any
                ? ReceivedData<D[K], false>
                : PromiseLike<ReceivedData<D[K], false>> &
                    ProxyData<D[K], false>
            : ProxyData<D[K], false>;
        }
      : PromiseLike<D>;

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
    ...payloads: Parameters<A[K]>
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
          Symbol.for("root_proxy"),
          null,
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
        let isArray = false;
        if (typeof ev.data.isProxy === "object") {
          isArray = ev.data.isProxy.isArray;
        }
        const msgData = ev.data as MsgData<A, any, "proxy">;
        const data = this.createProxy(
          msgData.proxyTargetId,
          Symbol.for("root_proxy"),
          null,
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
   * @returns 一个 target 为 promise 的 proxy
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
                Symbol.for("sub_proxy"),
                null,
                e.data.isArray
              )
            );
            this.handleListeners(handleProxylistenerMap, false);
          }
        },
      };
      this.handleListeners(handleProxylistenerMap);
    });
    return this.createProxy(
      handleProxyMsg.proxyTargetId,
      promise,
      (handleProxyMsg as any).property
    );
  }

  private handleProxy(handleProxyMsg: MsgToWorker<"handle_proxy">) {
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

  // proxy 拦截 get 操作时的唯一标识，用于匹配返回的 data，每次拦截时都会递增
  private proxyGetterId = 0;

  // proxyWeakMap 中存储 proxy 和与之对应的 proxyTargetId 和 revoke 方法
  private proxyWeakMap = new WeakMap<any, ProxyContextX>();

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

  //#region - createProxy

  /**
   * 收到 worker 传来的带有 port_proxy 或 create_subproxy 标识的消息后，为 Worker 中的对应目标创建一个 proxy
   * @param proxyTargetId Worker 中定义的 proxy 目标的唯一标识符
   * @param target proxy 在 Main 中也可以指定一个 target，为该 proxy 添加一些在 Main 中的额外功能
   * @param parentProperty 接收一个包含一系列属性名的数组，当使用 get 捕捉器时，会将 property 放入该数组末尾，并根据该数组中的属性名依次嵌套获取 Worker 中的目标的嵌套属性
   * @returns
   */
  private createProxy(
    proxyTargetId: number,
    target: any = {},
    parentProperty: keyof any | (keyof any)[] | null = null,
    isTargetArray: boolean = false
  ) {
    const _this = this;

    //#region - tailProxy

    const tailTarget = typeof target === "symbol" ? {} : target;

    // tailProxy 是最内层的 Proxy，如果 createProxy() 调用时，target 参数传入了一个非 symbol 类型的数据，那么对 tailProxy 的操作会被反应到该数据上，否则 tailProxy 的作用只是提供一个 function(){} 作为 target，使得 dataProxy 的 apply 和 constract 捕获器可以工作
    const { proxy: tailProxy, revoke: tailProxyRevoke } = Proxy.revocable(
      function () {},
      {
        get(_, property) {
          if (property in tailTarget) {
            const value = tailTarget[property];
            if (typeof value === "function") {
              return value.bind(tailTarget);
            } else {
              return value;
            }
          }

          return Reflect.get(tailTarget, property);
        },
        set(_, property, value) {
          return Reflect.set(tailTarget, property, value);
        },
        apply(target, thisArg, argumentsList) {
          return Reflect.apply(target, thisArg, argumentsList);
        },
        has(_, property) {
          return Reflect.has(tailTarget, property);
        },
      }
    );

    //#endregion

    //#region - dataProxy

    // dataProxy 是操作 data 的 Proxy，对 dataProxy 的操作最终会反应到 Worker 中被引用的 Data 上，其中一些特定操作会被反应到 tailProxy 上
    const dataProxyHandler: ProxyHandler<any> = {
      get(_target, property) {
        if (typeof property === "symbol") return;

        if (
          (target === Symbol.for("root_proxy") ||
            target === Symbol.for("sub_proxy")) &&
          property === "then"
        )
          return;

        if (property in _target) {
          const value = _target[property];
          if (typeof value === "function") {
            return value.bind(_target);
          } else {
            return value;
          }
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

        return _this.handleProxy({
          type: "handle_proxy",
          trap: "get",
          proxyTargetId,
          property: propertyValue,
          getterId: _this.proxyGetterId++,
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
            });
          } else return false;
        }

        return _this.handleProxy({
          type: "handle_proxy",
          trap: "set",
          proxyTargetId,
          property: propertyValue,
          value,
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
          getterId: _this.proxyGetterId++,
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
          getterId: _this.proxyGetterId++,
          parentProperty: Array.isArray(parentProperty)
            ? parentProperty
            : parentProperty
              ? [parentProperty]
              : [],
          argumentsList,
          argProxyContexts,
        });
      },
    };

    const { proxy: dataProxy, revoke: dataProxyRevoke } = Proxy.revocable(
      tailProxy,
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

      // drawArr 将 Worker 中的数组同步给 Main 中的数组
      async function drawArr() {
        arr.length = await dataProxy.length;
        for (let i = 0; i < arr.length; i++) {
          arr[i] = await dataProxy[i];
        }
      }

      // updateArr 将 Main 中的数组同步给 Worker 中的数组
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

      // 生成改造后的数组方法
      function getWrappedArrMethod(property: string) {
        const method = (arr as any)[property];
        return async function (...args: any[]) {
          await drawArr();
          method.apply(arr, args);
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
        };
      }

      // 判断一个属性名是否是数组方法名
      function isArrayMethodProperty(property: keyof any): property is string {
        return typeof property === "symbol" || typeof property === "number"
          ? false
          : Object.getOwnPropertyNames(Array.prototype).indexOf(property) !== -1
            ? typeof (arr as any)[property] === "function"
            : false;
      }

      const arrayProxyHandler: ProxyHandler<Array<any>> = {
        get(arr, property) {
          if (property === "then" || typeof property === "symbol") {
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
    associatedProxies.add(tailProxy);
    associatedProxies.add(dataProxy);
    if (arrayProxy) associatedProxies.add(arrayProxy);

    this.proxyWeakMap.set(dataProxy, {
      proxyTargetId,
      parentProperty,
      revoke: dataProxyRevoke,
      associatedProxies,
      isRevoked: false,
    });

    this.proxyWeakMap.set(tailProxy, {
      proxyTargetId,
      parentProperty,
      revoke: tailProxyRevoke,
      associatedProxies,
      isRevoked: false,
    });

    if (arrayProxy && arrayProxyRevoke)
      this.proxyWeakMap.set(arrayProxy, {
        proxyTargetId,
        parentProperty,
        revoke: arrayProxyRevoke,
        associatedProxies,
        isRevoked: false,
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
    ...payloads: Parameters<A[K]>
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

    // newPromise.catch(() => {});

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
            | ((this: MessagePort, ev: MessageEvent<A>) => any)
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
