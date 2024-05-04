import {
  CommonActions,
  MsgFromWorker,
  ActionResult,
  StructuredCloneable,
  KeyMsgFromWorker,
} from "./worker";

export interface MsgToMain<A extends CommonActions, D> {
  actionName: keyof A;
  data: D;
}

export class WorkerHandler<A extends CommonActions> {
  private worker: Worker;

  private id = 0;

  private customListenersCount = 0;

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
    this.worker.addEventListener(
      "message",
      (e: MessageEvent<KeyMsgFromWorker>) => {
        if (!e.data.keyMessage) return;
        if (e.data.type === "message_error") {
          this.worker.dispatchEvent(
            new MessageEvent(
              "message_error",
              e as unknown as MessageEventInit<KeyMsgFromWorker>
            )
          );
        }
      }
    );
  }

  get instance() {
    return this.worker;
  }

  terminate(getListenerCount?: boolean) {
    this.worker.terminate();
    if (getListenerCount) return this.customListenersCount;
  }

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
    this.worker.postMessage(message, transfer);
    return [message.id, timeout] as [number, number];
  }

  private handleListeners(listenerMap: ListenerMap, isAdd: boolean = true) {
    for (const key in listenerMap) {
      const type = key as keyof WorkerEventMap;
      if (isAdd) {
        this.worker.addEventListener(type, listenerMap[type]!);
        this.customListenersCount++;
      } else {
        this.worker.removeEventListener(type, listenerMap[type]!);
        this.customListenersCount--;
      }
    }
  }

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

    const clearSideEffects = () => {
      this.handleListeners(resultListenerMap, false);
      this.handleListeners(msgListenerMap, false);
      messageChannel.port1.close();
      messageChannel.port2.close();
      readyState.current = 2;
    };

    promise
      .catch(() => {})
      .finally(() => {
        clearSideEffects();
      });

    return promise;
  }

  private watchMsgFromWorker<D>(
    id: number,
    actionName: keyof A,
    readyState: ReadyState
  ) {
    const messageChannel = new MessageChannel();
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
          new MessageEvent("messageorror", {
            data: { actionName, error: e.data.error },
          })
        );
      }
    };

    const listenerMap = { message, messageerror };

    this.handleListeners(listenerMap);

    const bindToSource = (messagePort: MessagePort): MessagePort => {
      const bindedMessagePort = { ...messagePort };
      for (const key in receivePort) {
        const k = key as keyof MessagePort;
        const v = receivePort[k];
        if (typeof v === "function") {
          bindedMessagePort[k] = v.bind(messagePort);
        }
      }
      return bindedMessagePort;
    };

    const bindedReceivePort = bindToSource(receivePort);

    const {
      postMessage,
      start,
      close,
      onmessage,
      onmessageerror,
      addEventListener,
      removeEventListener,
      dispatchEvent,
    } = bindedReceivePort;

    const messagePort: MessagePort = {
      postMessage,
      start,
      close,
      onmessage,
      onmessageerror,
      addEventListener,
      removeEventListener,
      dispatchEvent,
    };

    return [messagePort, receivePort, listenerMap, messageChannel] as [
      MessagePort,
      MessagePort,
      ListenerMap,
      MessageChannel,
    ];
  }

  execute<K extends keyof A>(
    actionName: K,
    options: ExecuteOptions | Transferable[] | number | null | undefined,
    ...payload: Parameters<A[K]>
  ) {
    const [id, timeout] = this.postMsgToWorker(
      actionName,
      options || [],
      ...payload
    );

    const readyState: ReadyState = { current: 0 };

    const [messagePort, receivePort, msgListenerMap, messageChannel] =
      this.watchMsgFromWorker(id, actionName, readyState);

    const promise = this.watchResultFromWorker<GetDataType<A, K>>(
      id,
      actionName,
      timeout,
      msgListenerMap,
      messageChannel,
      readyState
    );

    const messageSource: MessageSource<MsgToMain<A, GetDataType<A, K>>> = {
      ...messagePort,
      readyState: 0,
      addEventListener: (type, listener) => {
        messagePort.addEventListener(type, listener);
        return messageSource;
      },
      promise,
    };

    Object.defineProperties(messageSource, {
      readyState: {
        get: () => readyState.current,
        set: () => {},
      },
      onmessage: {
        set: (value: ((this: MessagePort, ev: MessageEvent) => any) | null) => {
          receivePort.onmessage = value;
        },
      },
      onmessageerror: {
        set: (value: ((this: MessagePort, ev: MessageEvent) => any) | null) => {
          receivePort.onmessage = value;
        },
      },
    });

    return messageSource;
  }
}

export type GetDataType<A extends CommonActions, K extends keyof A> =
  ReturnType<A[K]> extends ActionResult<infer D>
    ? Exclude<D, void>
    : StructuredCloneable;

type ExecuteOptions = {
  transfer?: Transferable[];
  timeout?: number;
};

type ListenerMap = {
  [key in keyof WorkerEventMap]?: (
    this: Worker,
    ev: ErrorEvent | MessageEvent<any>
  ) => any;
};

interface MessageSource<D> extends MessagePort {
  promise: Promise<D>;
  readyState: ReadyState["current"];
  onmessage: ((this: MessagePort, ev: MessageEvent<D>) => any) | null;
  addEventListener(
    type: "message",
    listener: (this: MessagePort, ev: MessageEvent<D>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D>;
  addEventListener(
    type: "message_error",
    listener: (this: MessagePort, ev: MessageEvent<any>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D>;
}

type ReadyState = { current: 0 | 1 | 2 };
