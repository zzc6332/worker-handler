import {
  CommonActions,
  MsgFromWorker,
  ActionResult,
  MessageData,
  Transfer,
} from "./worker";

export interface MsgToMain<A extends CommonActions, D> {
  readonly actionName: keyof A;
  readonly data: D;
}

export class WorkerHandler<A extends CommonActions> {
  private worker: Worker;

  private id = 0;

  private listenerMapsSet: Set<ListenerMap> = new Set();

  private messageChannelsSet: Set<{
    messageChannel: MessageChannel;
    readyState: ReadyState;
  }> = new Set();

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

  get instance() {
    return this.worker;
  }

  /**
   * 终止 worker 进程，并移除主线程上为 worker 进程添加的监听器
   * @param getListenerCount 布尔值，用于指定是否需要返回值，仅用于调试
   * @returns 如果 getListenerCount 指定为 true，则会返回一个数字，表示主线程上还剩多少被终止的 worker 进程的监听器，仅用于调试
   */
  terminate(getListenerCount?: boolean) {
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
    if (getListenerCount) return this.listenerMapsSet.size;
  }

  /**
   * 传递消息传递给 worker，使得 worker 调用 action
   * @param actionName action 的名称
   * @param options 配置选项
   * @param payload action 接收参数
   * @returns [id, timeout]
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

    const msgToWorker = { actionName, payload, id: this.id++ };
    try {
      this.worker.postMessage(msgToWorker, transfer);
    } catch (error) {
      console.error(error);
    }
    return [msgToWorker.id, timeout] as [number, number];
  }

  /**
   * 当传递消息给 worker 后，监听产生的非终止消息
   * @param id
   * @param actionName
   * @param readyState
   * @returns [messagePort, receivePort, listenerMap, messageChannel]
   */
  private watchMsgFromWorker<D>(
    id: number,
    actionName: keyof A,
    readyState: ReadyState
  ) {
    const messageChannel = new MessageChannel();

    this.messageChannelsSet.add({ messageChannel, readyState });

    // sendPort 用于将从 worker 中接收到的数据发送给 recievePort，recievePort 会被用于生成 messageSource，作为 this.execute() 的返回值暴露出去
    const { port1: sendPort, port2: receivePort } = messageChannel;
    sendPort.start();
    receivePort.start();

    this.worker.addEventListener(
      "message",
      (e: MessageEvent<MsgFromWorker<"start_signal">>) => {
        if (e.data.type === "start_signal" && e.data.id === id)
          readyState.current = 1;
      },
      { once: true }
    );

    const message = (e: MessageEvent<MsgFromWorker<"action_data", D>>) => {
      if (e.data.type === "action_data" && e.data.id === id && !e.data.done) {
        const data: MsgToMain<A, D> = { data: e.data.data, actionName };
        sendPort.postMessage(data);
      }
    };

    const messageerror = (e: MessageEvent<MsgFromWorker<"message_error">>) => {
      if (e.data.id === id && !e.data.done) {
        receivePort.dispatchEvent(
          new MessageEvent("messageerror", {
            data: { actionName, error: e.data.error },
          })
        );
      }
    };

    const listenerMap = { message, messageerror };

    this.handleListeners(listenerMap);

    return [receivePort, listenerMap, messageChannel] as [
      MessagePort,
      ListenerMap,
      MessageChannel,
    ];
  }

  /**
   * 当传递消息给 worker 后，监听产生的终止消息
   * @param id
   * @param actionName
   * @param timeout
   * @param msgListenerMap
   * @param messageChannel
   * @param readyState
   * @returns promise
   */
  private watchResultFromWorker<D>(
    id: number,
    actionName: keyof A,
    timeout: number,
    msgListenerMap: ListenerMap,
    messageChannel: MessageChannel,
    readyState: ReadyState
  ) {
    let resultListenerMap: ListenerMap;
    const promise = new Promise<MsgToMain<A, D>>((resolve, reject) => {
      if (timeout > 0) {
        setTimeout(() => {
          reject("timeout");
        }, timeout);
      }

      const message = (e: MessageEvent<MsgFromWorker<"action_data", D>>) => {
        if (e.data.type === "action_data" && e.data.id === id && e.data.done) {
          const data = e.data.data as D;
          const result: MsgToMain<A, D> = { actionName, data };
          resolve(result);
        }
      };

      const messageerror = (
        e: MessageEvent<MsgFromWorker<"message_error", D>>
      ) => {
        if (e.data.id === id && e.data.done) {
          reject({
            data: { actionName, error: e.data.error },
          });
        }
      };

      const error = (e: ErrorEvent) => {
        reject(e);
      };

      resultListenerMap = { message, messageerror, error };

      this.handleListeners(resultListenerMap);
    });

    const clearEffects = () => {
      this.handleListeners(resultListenerMap, false);
      this.handleListeners(msgListenerMap, false);
      messageChannel.port1.close();
      messageChannel.port2.close();
      readyState.current = 2;
    };

    promise
      .catch(() => {})
      .finally(() => {
        clearEffects();
      });

    return promise;
  }

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
    return (ev: MessageEvent<any>) => {
      const extendedEventTmp: any = {};
      for (const p in ev) {
        let item = ev[p as keyof typeof ev];
        if (typeof item === "function") item = item.bind(ev);
        extendedEventTmp[p] = item;
      }
      const extendedEvent = { ...extendedEventTmp, ...ev.data };
      extendedListener.call(receivePort, extendedEvent);
    };
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
    const [id, timeout] = this.postMsgToWorker(
      actionName,
      options || [],
      ...payload
    );

    const readyState: ReadyState = { current: 0 };

    const [receivePort, msgListenerMap, messageChannel] =
      this.watchMsgFromWorker(id, actionName, readyState);

    const promise = this.watchResultFromWorker<GetDataType<A, K>>(
      id,
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
      promise,
    };

    promise
      .catch(() => {})
      .finally(() => {
        listenerSet.forEach((listenerTuple) => {
          receivePort.removeEventListener(listenerTuple[0], listenerTuple[1]);
        });
        listenerSet.clear();
      });

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
    MsgToMain<A, D> {}

interface MessageSource<D, A extends CommonActions>
  extends Omit<
    MessagePort,
    "addEventListener" | "onmessage" | "onmessageerror"
  > {
  promise: Promise<MsgToMain<A, D>>;
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
