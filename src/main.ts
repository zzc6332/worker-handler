import {
  CommonActions,
  MsgFromWorker,
  ActionResult,
  MessageData,
  KeyMsgFromWorker,
  Transfer,
} from "./worker";

export interface MsgToMain<A extends CommonActions, D> {
  actionName: keyof A;
  data: D;
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
      message: (e: MessageEvent<KeyMsgFromWorker>) => {
        if (!e.data.keyMessage) return;
        if (e.data.type === "message_error") {
          this.worker.dispatchEvent(
            new MessageEvent(
              "messageerror",
              e as unknown as MessageEventInit<KeyMsgFromWorker>
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

    const message = { actionName, payload, id: this.id++ };
    try {
      this.worker.postMessage(message, transfer);
    } catch (error) {
      console.error(error);
    }
    return [message.id, timeout] as [number, number];
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
      (e: MessageEvent<KeyMsgFromWorker>) => {
        if (!e.data.keyMessage || e.data.type !== "start_signal") return;
        readyState.current = 1;
      },
      { once: true }
    );

    const message = (e: MessageEvent<MsgFromWorker<D>>) => {
      if (e.data.id === id && !e.data.done && !e.data.keyMessage) {
        const data = e.data.data as D;
        sendPort.postMessage(data);
      }
    };

    const messageerror = (e: MessageEvent<KeyMsgFromWorker>) => {
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

      const message = (e: MessageEvent<MsgFromWorker<D>>) => {
        if (e.data.id === id && e.data.done && !e.data.keyMessage) {
          const data = e.data.data as D;
          const result: MsgToMain<A, D> = { actionName, data };
          resolve(result);
        }
      };

      const messageerror = (e: MessageEvent<MsgFromWorker<D>>) => {
        if (e.data.id === id && e.data.done) {
          reject("messageError");
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

    const messageSource: MessageSource<GetDataType<A, K>, A> = {
      ...boundReceivePort,
      readyState: 0,
      addEventListener: (type, listener) => {
        receivePort.addEventListener(type, listener);
        return messageSource;
      },
      promise,
    };

    let messageerrorCallback:
      | ((this: MessagePort, ev: MessageEvent) => any)
      | null;

    Object.defineProperties(messageSource, {
      readyState: {
        get: () => readyState.current,
        set: () => {},
      },
      onmessage: {
        set: (value: ((this: MessagePort, ev: MessageEvent) => any) | null) => {
          receivePort.onmessage = value;
        },
        get: () => receivePort.onmessage,
      },
      onmessageerror: {
        set: (value: ((this: MessagePort, ev: MessageEvent) => any) | null) => {
          if (messageerrorCallback) {
            receivePort.removeEventListener(
              "messageerror",
              messageerrorCallback
            );
          }
          messageerrorCallback = value;
          if (value) {
            receivePort.addEventListener("messageerror", value);
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

interface MessageSource<D, A extends CommonActions>
  extends Omit<MessagePort, "addEventListener"> {
  promise: Promise<MsgToMain<A, D>>;
  readyState: ReadyState["current"];
  onmessage: ((this: MessagePort, ev: MessageEvent<D>) => any) | null;
  addEventListener(
    type: "message",
    listener: (this: MessagePort, ev: MessageEvent<D>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, A>;
  addEventListener(
    type: "messageerror",
    listener: (this: MessagePort, ev: MessageEvent<any>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, A>;
}

type ReadyState = { current: 0 | 1 | 2 };
