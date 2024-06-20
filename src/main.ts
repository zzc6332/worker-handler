import {
  CommonActions,
  MsgFromWorker,
  ActionResult,
  MessageData,
  Transfer,
} from "./worker.js";

//#region - types

//#region - message 相关

type MsgToWorkerType =
  | "execute_action"
  | "handle_proxy"
  | "revoke_proxy"
  | "check_clonability";

export interface ProxyContext {
  proxyTargetId: number;
  parentProperty: keyof any | (keyof any)[] | null;
}

interface ProxyContextPro extends ProxyContext {
  revoke: () => void;
}

type MsgToWorkerBasic<
  T extends MsgToWorkerType = MsgToWorkerType,
  A extends CommonActions = CommonActions,
  K extends keyof A = keyof A,
  P extends keyof ProxyHandler<any> = keyof ProxyHandler<any>,
> = {
  type: T;
  actionName: K;
  payload: Parameters<A[K]>;
  executionId: number;
  trap: P;
  proxyTargetId: number;
  getterId: number;
  property: keyof any | (keyof any)[];
  value: any;
  argumentsList: any[];
  parentProperty: (keyof any)[];
  argProxyContexts: (ProxyContext | undefined)[];
  thisProxyContext?: ProxyContext;
  thisArg?: any;
};

export type MsgToWorker<
  T extends MsgToWorkerType = MsgToWorkerType,
  A extends CommonActions = CommonActions,
  K extends keyof A = keyof A,
  P extends keyof ProxyHandler<any> = keyof ProxyHandler<any>,
> = T extends "execute_action"
  ? Pick<
      MsgToWorkerBasic<T, A, K>,
      "type" | "actionName" | "payload" | "executionId"
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
            "type" | "proxyTargetId" | "trap" | "property" | "value"
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
      : T extends "check_clonability"
        ? Pick<MsgToWorkerBasic<T>, "type" | "value">
        : never;

// MsgData 是传递给 messageSource 的数据
type MsgData<
  A extends CommonActions,
  D,
  T extends "message" | "proxy" = "message" | "proxy",
> = {
  readonly actionName: keyof A;
  readonly isProxy: T extends "proxy" ? true : false;
} & (T extends "message"
  ? { readonly data: D }
  : T extends "proxy"
    ? { readonly proxyTargetId: number }
    : never);

//#endregion

export type GetDataType<A extends CommonActions, K extends keyof A> =
  ReturnType<A[K]> extends ActionResult<infer D>
    ? Exclude<D, void> extends never
      ? undefined
      : Exclude<D, void>
    : MessageData;

type ExecuteOptions<D extends MessageData[] = MessageData[]> = {
  transfer: Transfer<D>;
  timeout?: number;
};

type ListenerMap = {
  message?: (e: MessageEvent<any>) => any;
  messageerror?: (e: MessageEvent<any>) => any;
  error?: (e: ErrorEvent) => any;
};

interface ExtendedMessageEvent<A extends CommonActions, D>
  extends MessageEvent<D>,
    MsgData<A, D, "message"> {}

interface MessageSource<D, A extends CommonActions>
  extends Omit<
    MessagePort,
    "addEventListener" | "onmessage" | "onmessageerror"
  > {
  promise: Promise<MsgData<A, D>>;
  readonly readyState: ReadyState["current"];
  onmessage:
    | ((this: MessagePort, ev: ExtendedMessageEvent<A, D>) => any)
    | null;
  onmessageerror:
    | ((this: MessagePort, ev: ExtendedMessageEvent<A, any>) => any)
    | null;
  addEventListener(
    type: "message",
    listener: (this: MessagePort, ev: ExtendedMessageEvent<A, D>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, A>;
  addEventListener(
    type: "messageerror",
    listener: (this: MessagePort, ev: ExtendedMessageEvent<A, any>) => any,
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
   * @param payload action 接收参数
   * @returns [executionId, timeout]
   */
  private postMsgToWorker<K extends keyof A>(
    actionName: K,
    options: ExecuteOptions | Transferable[] | number,
    ...payload: Parameters<A[K]>
  ) {
    let transfer: Transferable[] = [];
    let timeout: number = 0;
    if (Array.isArray(options)) {
      transfer = options;
    } else if (typeof options === "number") {
      timeout = options;
    } else {
      transfer = options.transfer || [];
      timeout = options.timeout || 0;
    }

    const msgToWorker: MsgToWorker<"execute_action", A, K> = {
      type: "execute_action",
      actionName,
      payload,
      executionId: this.executionId++,
    };
    try {
      this.worker.postMessage(msgToWorker, transfer);
    } catch (error) {
      console.error(error);
    }
    return [msgToWorker.executionId, timeout] as [number, number];
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
            isProxy: true,
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
              isProxy: true,
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
    const newPromise = promise
      .then((res) => {
        clearEffects();
        if (res.isProxy) {
          const msgData = res as MsgData<A, D, "proxy">;
          const data = this.createProxy(
            msgData.proxyTargetId,
            Symbol.for("root_proxy")
          );
          return { ...res, data };
        } else {
          return res as MsgData<A, D, "message">;
        }
      })
      .catch(() => {
        clearEffects();
      });

    // 返回的这个 promise 会在 this.execute() 中再用于进行一次副作用清理
    return newPromise as Promise<MsgData<A, D, "message" | "proxy">>;
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
    extendedListener: (
      this: MessagePort,
      ev: ExtendedMessageEvent<A, any>
    ) => any,
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
        const msgData = ev.data as MsgData<A, any, "proxy">;
        const data = this.createProxy(
          msgData.proxyTargetId,
          Symbol.for("root_proxy")
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
              this.createProxy(e.data.proxyTargetId, Symbol.for("sub_proxy"))
            );
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

  // proxy 拦截 get 操作时的唯一标识，用于匹配返回的 data，每次拦截时都会递增
  private proxyGetterId = 0;

  // proxyWeakMap 中存储 proxy 和与之对应的 proxyTargetId 和 revoke 方法
  private proxyWeakMap = new WeakMap<
    any,
    ProxyContext & { revoke: () => void }
  >();

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
    parentProperty: keyof any | (keyof any)[] | null = null
  ) {
    const _this = this;

    const utilsForHandler = {
      /**
       * 将 ProxyContextPro 精简为 ProxyContext 后返回
       * @param proxyContext ProxyContextPro 或 undefined
       * @returns ProxyContext 或 undefined
       */
      reduceProxyContext(
        proxyContext: ProxyContextPro | undefined
      ): ProxyContext | undefined {
        if (proxyContext) {
          const { proxyTargetId, parentProperty } = proxyContext;
          return { proxyTargetId, parentProperty };
        }
      },
      /**
       * 接收初始的 argumentsList，将其中已注册过的 Proxy 提取并解析后放入 argProxyContexts 中
       * @param argumentsList
       * @returns  一个包含 argProxyContexts 和提炼后的 argumentsList 的对象
       */
      handleArguments(argumentsList: any[]) {
        const argProxyContexts: (ProxyContext | undefined)[] = [];
        const newArgumentsList = argumentsList.map((arg, index) => {
          const argProxyContext = _this.proxyWeakMap.get(arg);
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

    const handler: ProxyHandler<any> = {
      get(_target, property, receiver) {
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

        if (typeof property === "symbol") return receiver[property];

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

        const checkClonabilityMsg: MsgToWorker<"check_clonability"> = {
          type: "check_clonability",
          value,
        };
        try {
          _this.worker.postMessage(checkClonabilityMsg);
        } catch (error) {
          return false;
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
          trap: "set",
          proxyTargetId,
          property: propertyValue,
          value,
        });
      },

      apply(_, thisArg, _argumentsList) {
        // 处理 thisArg
        const _thisProxyContext = _this.proxyWeakMap.get(thisArg);
        const { reduceProxyContext } = utilsForHandler;

        // 处理 argumentsList
        const { argProxyContexts, argumentsList } =
          utilsForHandler.handleArguments(_argumentsList);

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
          thisProxyContext: reduceProxyContext(_thisProxyContext),
          thisArg: _thisProxyContext ? undefined : thisArg,
        });
      },

      construct(_, _argumentsList) {
        // 处理 argumentList
        const { argProxyContexts, argumentsList } =
          utilsForHandler.handleArguments(_argumentsList);

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

    const targetArg = typeof target !== "symbol" ? target : {};

    const targetProxy = new Proxy(function () {}, {
      get(_, property) {
        if (property in targetArg) {
          const value = targetArg[property];
          if (typeof value === "function") {
            return value.bind(targetArg);
          } else {
            return value;
          }
        }

        return Reflect.get(targetArg, property);
      },
      set(_, property, value) {
        return Reflect.set(targetArg, property, value);
      },
      apply(target, thisArg, argumentsList) {
        return Reflect.apply(target, thisArg, argumentsList);
      },
      has(_, property) {
        return Reflect.has(targetArg, property);
      },
    });

    const { proxy, revoke } = Proxy.revocable(targetProxy, handler);

    this.proxyWeakMap.set(proxy, {
      proxyTargetId,
      parentProperty,
      revoke,
    });

    return proxy;
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

  revokeProxy(proxy: any) {
    const proxyContext = this.proxyWeakMap.get(proxy);
    if (!proxyContext) return;
    proxyContext.revoke();
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
   * @param payload action 接收的参数
   * @returns messageSource
   */
  execute<K extends keyof A, D extends Parameters<A[K]> = Parameters<A[K]>>(
    actionName: K,
    options?: ExecuteOptions<D> | Transfer<D, number | null | undefined>,
    ...payload: D
  ) {
    const [executionId, timeout] = this.postMsgToWorker(
      actionName,
      options || [],
      ...payload
    );

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

    const newPromise: Promise<
      MsgData<A, GetDataType<A, K>, "message" | "proxy">
    > = new Promise((resolve, reject) => {
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
            | ((this: MessagePort, ev: ExtendedMessageEvent<A, D>) => any)
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
