import { CommonActions, MsgFromWorker, GetDataType } from "./worker.js";

import { getTransfers, StructuredCloneable } from "./type-judge";
import { TreeNode } from "./data-structure";

//#region - symbols

export const revokeSymbol: unique symbol = Symbol();
export const proxyTypeSymbol: unique symbol = Symbol();

//#endregion

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
  temporaryProxyIdForPickingUp: number | null;
}

interface ProxyContextX extends ProxyContext {
  revoke: WeakRef<() => void> | (() => void);
  isRevoked: boolean;
  proxyType: ProxyType;
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
  traverse: "children" | "adopted_children" | null;
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
        > & { temporaryProxyIdForDepositing: number | null }
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
      ? Pick<MsgToWorkerBasic<T>, "type" | "proxyTargetId" | "traverse">
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

// MsgData 是当接收到 Worker 传递来的 action_data 或 create_rootproxy 消息后，将其打包处理后的消息
type MsgData<
  A extends CommonActions,
  D,
  T extends "message" | "proxy" | "promise" = "message" | "proxy" | "promise",
> = {
  readonly actionName: keyof A;
} & (T extends "message"
  ? { type: "message"; readonly data: D }
  : T extends "proxy"
    ? {
        type: "proxy";
        readonly proxyTargetId: number;
        specificProxy: { isArray: boolean };
      }
    : T extends "promise"
      ? { type: "promise"; readonly dataPromiseId: number }
      : never);

// ExtendedMsgData 是 MsgData 加工处理后的数据，用于将这些信息合并到 MessageEventX 或 Promise 的结果中
type ExtendedMsgData<
  A extends CommonActions,
  D,
  Occasion extends "promise" | "event" = "promise", // 这个泛型参数是给 ReceivedData 使用的，当使用 promise 或 event 形式获取 received data 时，对最外层的 Promise 对象的处理是不一样的
> = {
  readonly actionName: keyof A;
  readonly data: ReceivedData<D, Occasion>;
  readonly proxyTargetId?: number;
  readonly specificProxy?: { isArray: boolean };
  readonly dataPromise?: Promise<any>;
  readonly dataPromiseId?: number;
};

// 将 Worker 中的 Action 传递的数据的类型 D 转换成 Main 中接收到的数据的类型（如果 D 无法被结构化克隆，则 ReceivedData 会是 Proxy 类型）
export type ReceivedData<D, Occasion extends "promise" | "event" = "promise"> =
  D extends StructuredCloneable<Transferable>
    ? D
    : D extends Promise<infer V>
      ? Occasion extends "event"
        ? Promise<ReceivedData<V>>
        : ReceivedData<V>
      : WorkerProxy<D>;

// 将一个类型中的每一项的类型包装一层 ReceivedData
type WrapItemsWithReceivedData<T> = {
  [K in keyof T]: ReceivedData<T[K]>;
};

//#endregion

//#region - Proxy 相关

// 将任意类型的数据转换为 Proxy 的形式，D 表示要被转换的数据，T 代表 root，即最外层的根 Proxy，其中递归调用的 ProxyData 的 T 都为 false
type ProxyData<D, IsCarrier extends boolean = false> = D extends new (
  ...args: any[]
) => infer Instance // Data 拥有构造签名的情况
  ? new (
      ...args: WrapItemsWithReceivedData<ConstructorParameters<D>>
    ) => CarrierProxy<Instance>
  : D extends (...args: any[]) => infer Result // Data 拥有调用签名的情况
    ? (
        ...args: WrapItemsWithReceivedData<Parameters<D>>
      ) => CarrierProxy<Result>
    : D extends object // 排除上面条件后， Data 是引用数据类型的情况
      ? D extends Array<infer I>
        ? IsCarrier extends true
          ? ProxyObj<D, true, I> // 对于 Carrier Proxy 来说，不会是 Worker Array Proxy，使用 ProxyObj<D, true, I> 来表示非 Worker Array Proxy 的但引用的是数组的 Proxy 的行为
          : ProxyArr<I> // 只有 Worker Proxy 才可能是 Worker Array Proxy，用 ProxyArr 来表示 Worker Array Proxy 的行为
        : ProxyObj<D>
      : D extends symbol // Data 是 symbol 类型的情况，此时是永远无法取出该 symbol 值的，只能获得一个没有意义的 Worker Proxy
        ? PromiseLike<WorkerProxy<unknown>>
        : PromiseLike<D>; // Data 是可结构化克隆的基本数据类型的情况

// 为 ProxyData 附加一些 symbol 键名
type ProxyDataWithSymbolKeys<D, IsCarrier extends boolean = false> = ProxyData<
  D,
  IsCarrier
> & {
  [proxyTypeSymbol]: ProxyType;
};

// 只有 WorkerProxy 有 revokeSymbol 键
export type WorkerProxy<D> = ProxyDataWithSymbolKeys<D> & {
  [revokeSymbol]: (options?: { derived?: boolean } | boolean | 0 | 1) => void;
};

export type CarrierProxy<D> = PromiseLike<ReceivedData<D>> & // 逐层访问的情况，如 const { layer1 } =  await data; const layer2 = await layer1.layer2
  ProxyDataWithSymbolKeys<D, true>; // 链式访问的情况，如 const layer2 = await data.layer1.layer2

// 对应数据为对象的 Worker Proxy
type ProxyObj<D, IsArray extends boolean = false, I = never> = {
  [K in IsArray extends true ? keyof Array<I> : keyof D]: CarrierProxy<
    IsArray extends true ? Array<I>[K & keyof Array<I>] : D[K & keyof D]
  >;
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
            [K in keyof CbArgs]: CbArgs[K] extends T
              ? WorkerProxy<T>
              : CbArgs[K];
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
                      ? WorkerProxy<T>
                      : CbArgs[K];
                  }
                ) => CbResult
              : Args[K] extends T
                ? WorkerProxy<T>
                : Args[K] extends T[]
                  ? WorkerProxy<T[]>
                  : Args[K];
          }
        ) => PromiseLike<
          Result extends T
            ? WorkerProxy<T>
            : Result extends T[]
              ? WorkerProxy<T>[]
              : Result
        >
      : A[P]; // 不是数组方法的情况
};

interface ArrWithAsyncIterator<T>
  extends Omit<ArrWithRewrittenMethods<T>, "length"> {
  [Symbol.asyncIterator](): AsyncIterableIterator<WorkerProxy<T>>;
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

// 对应数据为数组的 Worker Proxy
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

type ProxyType = "Carrier Proxy" | "Worker Proxy" | "Worker Array Proxy";

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
    ExtendedMsgData<A, D, "event"> {}

interface MessageSource<D, P, A extends CommonActions>
  extends Omit<
    MessagePort,
    "addEventListener" | "onmessage" | "onmessageerror"
  > {
  promise: Promise<ExtendedMsgData<A, D>>;
  readonly readyState: ReadyState["current"];
  onmessage: ((this: MessagePort, ev: MessageEventX<A, P>) => any) | null;
  onmessageerror:
    | ((this: MessagePort, ev: MessageEventX<A, any>) => any)
    | null;
  addEventListener(
    type: "message",
    listener: (this: MessagePort, ev: MessageEventX<A, P>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, P, A>;
  addEventListener(
    type: "messageerror",
    listener: (this: MessagePort, ev: MessageEventX<A, any>) => any,
    options?: boolean | AddEventListenerOptions
  ): MessageSource<D, P, A>;
}

type ReadyState = { current: 0 | 1 | 2 };

interface WorkerHandlerOptions extends WorkerOptions {
  autoCleanup?: boolean;
}

//#endregion

//#region - WorkerHandler

export class WorkerHandler<A extends CommonActions> {
  constructor(
    workerSrc: string | URL | Worker,
    options: WorkerHandlerOptions = {}
  ) {
    const workerOptions: WorkerOptions = { type: "module" };
    Object.keys(options).forEach((key) => {
      const k = key as keyof WorkerHandlerOptions;
      if (k === "autoCleanup" || k === "type") return;
      (workerOptions[k] as string | undefined) = options[k];
    });
    if (typeof options.autoCleanup === "boolean") {
      this.autoCleanup = options.autoCleanup;
    }
    if (workerSrc instanceof Worker) {
      this.worker = workerSrc;
    } else {
      this.worker = new Worker(workerSrc, workerOptions);
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

  //#region - 私有属性

  private autoCleanup: boolean = true;

  private worker: Worker;

  private currentExecutionId = 1;

  private listenerMapsSet: Set<ListenerMap> = new Set();

  private messageChannelsSet: Set<{
    messageChannel: MessageChannel;
    readyState: ReadyState;
  }> = new Set();

  // proxy 拦截 get 操作时的唯一标识，用于匹配返回的 data，每次拦截时都会递增
  private currentProxyGetterId = 1;

  // proxyWeakMap 中存储 proxy 和与之对应的 proxyTargetId 和 revoke 方法
  private proxyWeakMap = new WeakMap<any, TreeNode<ProxyContextX>>();

  // 当 Worker Proxy 通过 apply 操作或 construct 操作在 Worker 中产生了新的需要代理的数据，而无法及时在 Main 中获取其 proxyTargetId 时，使用这个临时的 temporaryProxyId 作为唯一标识符，每次调用 Worker Proxy 的 apply 或 construct 捕捉器时递增
  private currentTemporaryProxyId = 1;

  // registries 中存放用于清理数据的 FinalizationRegistry 实例
  private registries: Map<number, FinalizationRegistry<any> | undefined> =
    new Map();
  private currentRegistryId = 1;

  // dataPromiseHandlers 中 存放用于控制传递给 MessageSource.addEventListener() 回调中的 promise 的 resolve() 或 reject() 方法
  private dataPromiseHandlers: Map<
    number,
    | {
        resolve: (value: unknown) => void;
        reject: (reason?: any) => void;
        dataPromise: Promise<any> | null;
      }
    | undefined
  > = new Map();

  //#endregion

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
      executionId: this.currentExecutionId++,
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

    // sendPort 用于将从 worker 中接收到的数据发送给 receivePort，receivePort 会被用于生成 messageSource，作为 this.execute() 的返回值暴露出去
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
        e: MessageEvent<
          MsgFromWorker<
            | "action_data"
            | "create_rootproxy"
            | "create_promise"
            | "action_promise_settled",
            D
          >
        >
      ) => {
        if (e.data.done || e.data.executionId !== executionId) return;
        if (e.data.type === "action_data") {
          const msgData: MsgData<A, D, "message"> = {
            type: "message",
            data: e.data.data,
            actionName,
          };
          sendPort.postMessage(msgData);
        } else if (e.data.type === "create_rootproxy") {
          const msgData: MsgData<A, D, "proxy"> = {
            type: "proxy",
            actionName,
            specificProxy: { isArray: e.data.isArray },
            proxyTargetId: e.data.proxyTargetId,
          };
          sendPort.postMessage(msgData);
        } else if (e.data.type === "create_promise") {
          const { dataPromiseId } = e.data as MsgFromWorker<"create_promise">;
          const dataPromise = new Promise((resolve, reject) => {
            const dataPromiseHandler = { resolve, reject, dataPromise: null };
            this.dataPromiseHandlers.set(dataPromiseId, dataPromiseHandler);
          });
          this.dataPromiseHandlers.get(dataPromiseId)!.dataPromise =
            dataPromise;
          const msgData: MsgData<A, D, "promise"> = {
            type: "promise",
            actionName,
            dataPromiseId,
          };
          sendPort.postMessage(msgData);
        } else if (e.data.type === "action_promise_settled") {
          const { dataPromiseId } =
            e.data as MsgFromWorker<"action_promise_settled">;
          const dataPromiseHandler = this.dataPromiseHandlers.get(
            dataPromiseId!
          );
          if (dataPromiseHandler) {
            const { resolve, reject } = dataPromiseHandler;
            if (e.data.promiseState === "fulfilled") {
              const { proxyTargetId, isArray } = e.data;
              const data = proxyTargetId
                ? this.createProxy(proxyTargetId, "root_proxy", isArray!)
                : e.data.data;
              resolve(data);
              setTimeout(() => {
                // 在极端情况下，比如在 Action 中同步地使用 this.$post() 和 this.$end() 发送同一个会立马被 resolve 的 Promise 对象，使得通过 this.$post() 发送的代理 Promise 对象的引用有可能会在被获取到前就被 delete 了，因此这里的 delete 操作需要异步进行
                this.dataPromiseHandlers.delete(dataPromiseId!);
              });
            } else {
              reject(e.data.error);
              setTimeout(() => {
                this.dataPromiseHandlers.delete(dataPromiseId!);
              });
            }
          }
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
          e: MessageEvent<
            MsgFromWorker<
              "action_data" | "create_rootproxy" | "action_promise_settled",
              D
            >
          >
        ) {
          if (!e.data.done || e.data.executionId !== executionId) return;
          if (e.data.type === "action_data") {
            const result: MsgData<A, D, "message"> = {
              type: "message",
              data: e.data.data,
              actionName,
            };
            resolve(result);
          } else if (e.data.type === "create_rootproxy") {
            const result: MsgData<A, D, "proxy"> = {
              type: "proxy",
              actionName,
              specificProxy: { isArray: e.data.isArray },
              proxyTargetId: e.data.proxyTargetId,
            };
            resolve(result);
          } else if (
            e.data.type === "action_promise_settled" &&
            e.data.promiseState === "rejected"
          ) {
            reject(e.data.error);
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
      if (res.type === "proxy") {
        const { isArray } = res.specificProxy;
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
      // readyState 的改变是需要立马生效的，所以不在定时器中执行
      readyState.current = 2;
      // 在 promise 被 resolve 之前的一瞬间，如果此时 action 从 Worker 获取到了 msg 响应（非终止消息），且由于传输消息需要时间，因此关闭 messageChannel 中的 port 的操作需要延迟执行
      setTimeout(() => {
        messageChannel.port1.close();
        messageChannel.port2.close();
      }, 5000);
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
      if (ev.data.type === "proxy") {
        const { isArray } = ev.data.specificProxy;
        const msgData = ev.data as MsgData<A, any, "proxy">;
        const data = this.createProxy(
          msgData.proxyTargetId,
          "root_proxy",
          isArray
        );
        extendedEvent = { ...extendedEventTmp, ...msgData, data };
      } else if (ev.data.type === "promise") {
        const msgData = ev.data as MsgData<A, any, "promise">;
        const { dataPromiseId } = msgData;
        const dataPromise =
          this.dataPromiseHandlers.get(dataPromiseId)?.dataPromise;
        extendedEvent = { ...extendedEventTmp, ...msgData, data: dataPromise };
      } else if (ev.data.type === "message") {
        // 当 ev.data.type 的值为 "promise" 或 "message" 的情况
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
    >,
    parentProxy: WorkerProxy<any>
  ) {
    const { trap } = handleProxyMsg;

    const parent = {
      proxy: parentProxy,
      type: trap === "get" ? "parent" : "adoptiveParent",
    } as const;

    const promise = new Promise((resolve, reject) => {
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
                e.data.isArray,
                parent
              )
            );
            this.handleListeners(handleProxylistenerMap, false);
          } else if (
            e.data.type === "proxy_promise_rejected" &&
            e.data.proxyTargetId === handleProxyMsg.proxyTargetId &&
            e.data.getterId === handleProxyMsg.getterId
          ) {
            reject(e.data.error);
            this.handleListeners(handleProxylistenerMap, false);
          }
        },
      };
      this.handleListeners(handleProxylistenerMap);
    });

    // 在对 Carrier Proxy 的链式操作中，将上一次操作产生的 temporaryProxyId 传递给下一个 temporaryProxyId
    const temporaryProxyIdForPickingUp =
      handleProxyMsg.temporaryProxyIdForDepositing;

    let parentProperty: keyof any | (keyof any)[] | null = null;
    if (handleProxyMsg.trap === "get") parentProperty = handleProxyMsg.property;

    return this.createProxy(
      handleProxyMsg.proxyTargetId,
      promise,
      parentProperty,
      parent,
      temporaryProxyIdForPickingUp || undefined
    );
  }

  /**
   * 发送 handleProxyMsg，并返回 receiveProxyData() 的结果
   * @param handleProxyMsg
   * @param proxy
   * @returns
   */
  private handleProxy(
    handleProxyMsg: MsgToWorker<"handle_proxy">,
    proxy: WorkerProxy<any>
  ) {
    try {
      this.worker.postMessage(handleProxyMsg);
      if (handleProxyMsg.trap === "set") {
        return true;
      } else {
        return this.receiveProxyData(handleProxyMsg, proxy);
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
        const { proxyTargetId, parentProperty, temporaryProxyIdForPickingUp } =
          proxyContext;
        return { proxyTargetId, parentProperty, temporaryProxyIdForPickingUp };
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
        const argProxyContext = this.proxyWeakMap.get(arg)?.value;
        if (argProxyContext) {
          const {
            proxyTargetId,
            parentProperty,
            temporaryProxyIdForPickingUp,
          } = argProxyContext;
          argProxyContexts[index] = {
            proxyTargetId,
            parentProperty,
            temporaryProxyIdForPickingUp,
          };
          return null;
        }
        return arg;
      });
      return { argProxyContexts, argumentsList: newArgumentsList };
    },
  };

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
    workerProxyType: "root_proxy",
    isTargetArray: boolean
  ): any;

  /**
   * 创建一个 Worker Proxy
   * @param proxyTargetId Worker 中定义的 proxy 引用的数据的唯一标识符
   * @param workerProxyType Worker Proxy 的类型
   * @param isTargetArray Worker Proxy 引用的数据是不是数组
   * @param parent 包含该 proxy 的 parent 或 adoptiveParent 的信息，只有当 workerProxyType 为 "sub_proxy" 时需要接收该参数
   */
  private createProxy(
    proxyTargetId: number,
    workerProxyType: "sub_proxy",
    isTargetArray: boolean,
    parent: { proxy: WorkerProxy<any>; type: "parent" | "adoptiveParent" }
  ): any;

  /**
   * 创建一个 Carrier Proxy，它会在对一个 Worker Proxy 进行 get 操作，或对一个 Carrier Proxy 进行 get、apply、construct 操作（即对 Worker Proxy 进行链式调用）时被创建
   * @param proxyTargetId Worker 中定义的 proxy 引用的数据的唯一标识符
   * @param carriedPromise 一个会 resolve 出 Worker Promise 或被结构化克隆后的数据的 Promise
   * @param parentProperty 创建该 Carrier Proxy 的父级 Carrier Proxy 们被访问过的属性。当该 Carrier Proxy 触发 get 捕捉器时，会将 property 放入 parentProperty 的末尾，根据该数组中的属性名在 Worker 中获取到引用的数据的对应属性，如果还需要创建子级的 Carrier Proxy，它会作为新的 parentProperty
   * @param temporaryProxyIdForPickingUp 如果该 Carrier Proxy 的创建链上存在对 Carrier Proxy 进行 apply 或 construct 操作而产生了 temporaryProxyId，那么则需要将最近的 temporaryProxyId 传入。由于 apply 和 construct 操作在 worker 中产生了新的需要代理的数据，而对应的 proxyTargetId 无法在 Main 中同步取得，因此使用 Main 中创建的 temporaryProxyId 来代替作为唯一标识符。到了 Worker 中，前面的 proxyTargetId 参数和 parentProperty 参数会配合以获取 target 的，而 temporaryProxyId 会取代它们来获取 target。
   */
  private createProxy(
    proxyTargetId: number,
    carriedPromise: Promise<any>,
    parentProperty: keyof any | (keyof any)[] | null,
    parent: { proxy: WorkerProxy<any>; type: "parent" | "adoptiveParent" },
    temporaryProxyIdForPickingUp?: number
  ): any;

  private createProxy(
    proxyTargetId: number,
    p1: any,
    p2: any,
    p3?: any,
    p4?: any
  ) {
    const _this = this;

    //#region - 整理重载参数

    let proxyType: ProxyType =
      typeof p1 === "string" ? "Worker Proxy" : "Carrier Proxy";

    let isTargetArray: boolean = false;

    let promiseProxy: any = null;

    let parentProperty: keyof any | (keyof any)[] | null = null;
    let temporaryProxyIdForPickingUp: number | null = null;

    let workerProxyType: "root_proxy" | "sub_proxy" | null = null;
    let parent: {
      proxy: WorkerProxy<any>;
      type: "parent" | "adoptiveParent";
    } | null = null;

    if (proxyType === "Worker Proxy") {
      isTargetArray = p2;
      workerProxyType = p1;
      if (isTargetArray) proxyType = "Worker Array Proxy";
      if (workerProxyType === "sub_proxy") {
        parent = p3;
      }
    } else {
      const carriedPromise: Promise<any> = p1;
      parentProperty = p2;
      temporaryProxyIdForPickingUp = p4 || null;
      parent = p3;

      //#endregion

      //#region - promiseProxy

      // 当创建的是 Carrier Proxy 时，需要再创建一个 promiseProxy 作为 dataProxy 的 target，使得通过 Carrier Proxy 进行的链式操作的结果是一个类 Promise 对象，可以 resolve 出一个 Worker Proxy 或结构化克隆后的数据
      // 为什么要创建 promiseProxy 而不直接使用 carriedPromise 来作为 dataProxy 的 target 呢？因为当 dataProxy 使用 apply 或 construct 捕获器时，它的 target 必须是函数，因此必须要创建一个 promiseProxy，它的 target 为 function(){}。
      const proxy = new Proxy(function () {}, {
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

      //#endregion
    }

    //#region - dataProxy

    let exposedProxy: any;
    let exposedProxyRevoke: (() => void) | null = null;

    /**
     * 返回当访问 Worker Proxy 相关对象的不同 symbol 键时需要返回的内容
     * @param key
     * @param proxy
     * @param proxyType
     * @returns
     */
    function handleSymbolKeys(
      key: symbol,
      proxy: WorkerProxy<any> | CarrierProxy<any>,
      proxyType: ProxyType
    ) {
      switch (key) {
        case revokeSymbol: {
          // Carrier Proxy 不需要被 revoke，首先是因为链式操作时不方便收集所有 Carrier Proxy 来进行 revoke 处理，其次因为 Carrier Proxy 引用的目标数据都可以通过其它方式去清理：用 targetProxyId 标记的数据可以通过 revoke 对应的 Worker Proxy 来清理，用 temporaryProxyId 标记的数据则会在到达一定周期后被自动清理
          if (proxyType !== "Carrier Proxy") {
            return (options?: { derived?: boolean } | boolean | 0 | 1) => {
              _this.revokeProxy(proxy as WorkerProxy<any>, options);
            };
          } else {
            return;
          }
        }
        case proxyTypeSymbol: {
          return proxyType;
        }
        default:
          return;
      }
    }

    /**
     * 创建 dataProxy
     * @param arrayProxy 如果创建的 dataProxy 不作为 exposedProxy，而是用作生成作为 exposedProxy 的 arrayProxy，则将该 arrayProxy 传入，在注册 Child 时使用该 arrayProxy
     * @returns
     */
    function createDataProxy(arrayProxy?: any) {
      let dataProxy: any;

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

          // symbol 类型的数据无法被传送到 Worker 中，只保留一些特定的 symbol 键用来做一些特殊处理
          if (typeof property === "symbol") {
            return handleSymbolKeys(property, dataProxy, proxyType);
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

          return _this.handleProxy(
            {
              type: "handle_proxy",
              trap: "get",
              proxyTargetId,
              property: propertyValue,
              getterId: _this.currentProxyGetterId++,
              temporaryProxyIdForDepositing: temporaryProxyIdForPickingUp
                ? _this.currentTemporaryProxyId++
                : null, // 对于 Carrier Proxy 的 get 操作，如果它的创建链上出现过 temporaryProxyId，那么需要再创建一个 temporaryProxyId
              temporaryProxyIdForPickingUp,
            },
            arrayProxy || dataProxy
          );
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
            const valueProxyContextX = _this.proxyWeakMap.get(value)?.value;
            if (valueProxyContextX) {
              const valueProxyContext =
                _this.utilsForProxy.reduceProxyContext(valueProxyContextX);
              return _this.handleProxy(
                {
                  type: "handle_proxy",
                  trap: "set",
                  proxyTargetId,
                  property: propertyValue,
                  value: null,
                  valueProxyContext,
                  temporaryProxyIdForPickingUp,
                },
                arrayProxy || dataProxy
              );
            } else return false;
          }

          return _this.handleProxy(
            {
              type: "handle_proxy",
              trap: "set",
              proxyTargetId,
              property: propertyValue,
              value,
              temporaryProxyIdForPickingUp,
            },
            arrayProxy || dataProxy
          );
        },

        apply(_, thisArg, _argumentsList) {
          // 处理 thisArg
          const _thisProxyContext = _this.proxyWeakMap.get(thisArg)?.value;

          // 处理 argumentsList
          const { argProxyContexts, argumentsList } =
            _this.utilsForProxy.handleArguments(_argumentsList);

          return _this.handleProxy(
            {
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
              temporaryProxyIdForPickingUp,
            },
            arrayProxy || dataProxy
          );
        },

        construct(_, _argumentsList) {
          // 处理 argumentList
          const { argProxyContexts, argumentsList } =
            _this.utilsForProxy.handleArguments(_argumentsList);

          return _this.handleProxy(
            {
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
              temporaryProxyIdForPickingUp,
            },
            arrayProxy || dataProxy
          );
        },
      };

      const { proxy, revoke } = Proxy.revocable(
        promiseProxy || function () {},
        dataProxyHandler
      );

      dataProxy = proxy;

      return { dataProxy, dataProxyRevoke: revoke };
    }

    //#region - arrayProxy

    // 当目标数据为 Array 时进行拓展处理
    if (isTargetArray) {
      /**
       * 创建 arrayProxy
       * @returns
       */
      function createArrayProxy() {
        let arrayProxy: any;

        // 在 Main 中创建一个数组
        const arr: any[] = [];

        const { dataProxy } = createDataProxy(arrayProxy);

        /**
         * 将 Worker 中的数组同步给 Main 中的数组
         */
        async function drawArr() {
          arr.length = await dataProxy.length;
          for (let i = 0; i < arr.length; i++) {
            arr[i] = await dataProxy[i];
            // 处理 arrayProxyContext 和  itemProxyContext 的关系
            const arrayProxyContextTreeNode =
              _this.proxyWeakMap.get(arrayProxy);
            const itemProxyContextTreeNode = _this.proxyWeakMap.get(arr[i]);
            if (arrayProxyContextTreeNode && itemProxyContextTreeNode) {
              arrayProxyContextTreeNode?.addChildNode(itemProxyContextTreeNode);
            }
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
              _this.proxyWeakMap.get(item)?.value
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
                  if (mutatingMethods.indexOf(property) !== -1)
                    await updateArr();
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
        function isArrayMethodProperty(
          property: keyof any
        ): property is string {
          return typeof property === "symbol" || typeof property === "number"
            ? false
            : Object.getOwnPropertyNames(Array.prototype).indexOf(property) !==
                -1
              ? typeof (arr as any)[property] === "function"
              : false;
        }

        const arrayProxyHandler: ProxyHandler<Array<any>> = {
          get(arr, property) {
            if (
              property === "then" ||
              property === "catch" ||
              property === "finally"
            ) {
              return;
            } else if (typeof property === "symbol") {
              if (property === Symbol.asyncIterator) {
                return async function* () {
                  await drawArr();
                  for (const item of arr) {
                    yield await item;
                  }
                };
              }
              return handleSymbolKeys(property, arrayProxy, proxyType);
            } else if (isArrayMethodProperty(property)) {
              return getWrappedArrMethod(property);
            } else if (!isNaN(Number(property)) || property === "length") {
              const promise = new Promise(async (resolve) => {
                if (property === "length") {
                  resolve(await dataProxy.length);
                } else {
                  await drawArr();
                  resolve((arr as any)[property]);
                }
              });
              return _this.createProxy(
                proxyTargetId,
                promise,
                property,
                arrayProxy
              );
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

        return { arrayProxy, arrayProxyRevoke: revoke };
      }

      const { arrayProxy, arrayProxyRevoke } = createArrayProxy();

      exposedProxy = arrayProxy;
      exposedProxyRevoke = arrayProxyRevoke;

      //#endregion
    } else {
      const { dataProxy, dataProxyRevoke } = createDataProxy();

      exposedProxy = dataProxy;
      exposedProxyRevoke = dataProxyRevoke;
    }

    //#endregion

    //#region - 映射 Proxy 与 ProxyContext

    const revoke = WeakRef
      ? new WeakRef(exposedProxyRevoke)
      : exposedProxyRevoke;

    const proxyContext: ProxyContextX = {
      proxyTargetId,
      parentProperty,
      revoke,
      isRevoked: false,
      temporaryProxyIdForPickingUp,
      proxyType,
    };

    let proxyContextTreeNode: TreeNode<ProxyContextX>;

    // 如果 exposedProxy 是其它 Worker Proxy 的 Child 或 adoptedChild，则将其 ProxyContext 添加到对应的 ProxyContextTree 中
    if (parent) {
      const { proxy, type } = parent;
      const parentProxyContextTreeNode = this.proxyWeakMap.get(proxy);
      if (parentProxyContextTreeNode) {
        if (type === "adoptiveParent") {
          proxyContextTreeNode =
            parentProxyContextTreeNode.addAdoptedChild(proxyContext);
        } else {
          proxyContextTreeNode =
            parentProxyContextTreeNode.addChild(proxyContext);
        }
      } else {
        proxyContextTreeNode = new TreeNode(proxyContext);
      }
    } else {
      proxyContextTreeNode = new TreeNode(proxyContext);
    }

    this.proxyWeakMap.set(exposedProxy, proxyContextTreeNode);

    //#endregion

    // 如果当前环境支持 FinalizationRegistry 且开启了 autoCleanup 时，则当 Worker Proxy 被回收时进行处理
    if (
      FinalizationRegistry &&
      this.autoCleanup &&
      proxyType !== "Carrier Proxy" // 当创建的 Proxy 是 Carrier Proxy 时，此时对应的 proxyTargetId 已经关联到了 Worker Proxy 中，因此不需要通过 Carrier Proxy 进行数据回收，只要处理 Worker Proxy 就好
    ) {
      // 先保存当前 _this.currentRegistryId 的值，用于在创建 FinalizationRegistry 的回调函数中使用
      const registryId = _this.currentRegistryId;
      const registry = new FinalizationRegistry(() => {
        const revokeProxyMsg: MsgToWorker<"revoke_proxy"> = {
          type: "revoke_proxy",
          proxyTargetId,
          traverse: null,
        };
        this.worker.postMessage(revokeProxyMsg);
        _this.registries.delete(registryId);
      });
      registry.register(exposedProxy, null);
      _this.registries.set(_this.currentRegistryId++, registry);
    }
    return exposedProxy;
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
   * 递归废除 Worker Proxy，并清理 Worker 中对应的数据
   * @param proxy 要废除的 Worker Proxy
   * @param options 配置参数 { derived?: boolean }，也可以简化为只传入布尔值或 0 | 1，如果为 true 则表示递归废弃该 Worker Proxy 的 Children 和 Adopted Children，否则只递归废弃 Children
   */
  revokeProxy(
    proxy: WorkerProxy<any>,
    options?: { derived?: boolean } | boolean | 0 | 1
  ) {
    const proxyContextTreeNode = this.proxyWeakMap.get(proxy);
    if (!proxyContextTreeNode) return;

    const derived = Boolean(
      typeof options === "object" ? options.derived : options
    );

    for (const subTreeNode of derived
      ? proxyContextTreeNode.allChildren()
      : proxyContextTreeNode) {
      const proxyContext = subTreeNode.value;
      if (!proxyContext.isRevoked) {
        const { revoke } = proxyContext;
        if (revoke instanceof WeakRef) {
          const revokeFn = revoke.deref();
          if (revokeFn) revokeFn();
        } else {
          revoke();
        }
      }
      proxyContext.isRevoked = true;
    }

    // revoke_proxy 消息只需要提交一次，而不需要在上面的循环中提交。这是因为 Worker 中也通过 TreeNode 存储了 Worker Proxy 引用的数据之间的关系，可以在 Worker 中递归清理它们。这样做可以减少消息通信的次数。而之所以在 Main 中将 WorkerProxyContext 也通过 TreeNode 存储，是为了当废除 Worker Proxy 时，可以在 Main 中同步地知道哪些 children 和 adoptedChildren 一起被废除了，如果操作废弃了的 Worker Proxy 可以原地抛出错误。
    const revokeProxyMsg: MsgToWorker<"revoke_proxy"> = {
      type: "revoke_proxy",
      proxyTargetId: proxyContextTreeNode.value.proxyTargetId,
      traverse: derived ? "adopted_children" : "children",
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
    const listenerSet = new Set<ListenerTuple>();

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
            // 如果 promise 被 resolve 之前的一瞬间，action 从 Worker 获取到了 msg 响应（非终止消息），那么添加给 receivePort 的监听器还需要用来接收这次消息的数据，且由于 messageChannel 传输数据需要时间，因此将移除监听器的操作延迟执行
            setTimeout(() => {
              listenerSet.forEach((listenerTuple) => {
                receivePort.removeEventListener(
                  listenerTuple[0],
                  listenerTuple[1]
                );
              });
              listenerSet.clear();
            }, 5000);
          });
      });

    const messageSource: MessageSource<
      GetDataType<A, K>,
      unknown extends ThisParameterType<A[K]>
        ? GetDataType<A, K>
        : ThisParameterType<A[K]>,
      A
    > = {
      ...boundReceivePort,
      readyState: readyState.current,
      addEventListener: (type, extendedListener) => {
        const listener = this.reduceEventListener(
          extendedListener,
          receivePort
        );
        receivePort.addEventListener(type, listener);
        listenerSet.add([type, listener]);
        messageSource.promise.catch(() => {});
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
