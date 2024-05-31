//#region - 定义 StructuredCloneable 类型

import { GetDataType } from "./main";

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

//#region - 从 MessageData 中获取 Transferable

export type MessageData = StructuredCloneable<Transferable>;

type ObjectInMessageData = {
  [k: string | number]: MessageData;
};

// 获取 ObjectInMessageData 中的所有 Transferable 的具体类型组成的联合类型
type GetTransferableInObject<
  D extends ObjectInMessageData,
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
  D extends MessageData,
  L extends number | null,
  P extends number | null = Prev<L>,
> = [L] extends [number]
  ? D extends Transferable
    ? D // 当 D 直接是 Transferable 的情况，递归的终点
    : D extends ObjectInMessageData
      ? GetTransferableInObject<D, P> // 当 D 是 ObjectInMessageData 的情况
      : D extends
            | Array<infer T extends MessageData>
            | Map<infer T, any>
            | Map<any, infer T>
            | Set<infer T>
        ? GetTransferables<T, Prev<L>> // 当 D 是其它引用数据类型的情况
        : null
  : null;

// postMessage 方法的 transfer 参数，以及 excute 方法的 options 参数的类型推导，其中 E 表示不需要 transfer 时其它的可选类型，适用于 excute 中
export type Transfer<
  D extends MessageData,
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

//#region  - actions 中的各种类型

export type ActionResult<
  D extends MessageData | void = void,
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
  ) => ActionResult<MessageData | void>;
};

type MsgType =
  | "action_data"
  | "start_signal"
  | "message_error"
  | "create_proxy";

type MsgFromWorkerBasic<D = MessageData> = {
  type: MsgType;
  data: D;
  id: number;
  done: boolean;
  error: any;
  proxyId: number;
};

export type MsgFromWorker<
  T extends MsgType = MsgType,
  D = MessageData,
> = T extends "action_data"
  ? { type: T } & Pick<MsgFromWorkerBasic<D>, "data" | "id" | "done">
  : T extends "message_error"
    ? { type: T } & Pick<MsgFromWorkerBasic, "id" | "done" | "error">
    : T extends "start_signal"
      ? { type: T } & Pick<MsgFromWorkerBasic, "id">
      : T extends "create_proxy"
        ? { type: T } & Pick<MsgFromWorkerBasic, "id" | "proxyId">
        : never;

export type ActionWithThis<
  A extends CommonActions,
  D extends true | any = true,
> = {
  [K in keyof A]: (
    this: ActionThis<A, D extends true ? GetDataType<A, K> : any>,
    ...args: Parameters<A[K]>
  ) => ReturnType<A[K]>;
};

//#endregion

//#region - onmessage

type MsgDataFromMain = {
  actionName: string;
  payload: any;
  id: number;
};

type PostMsgWithId<D extends MessageData = MessageData> = D extends undefined
  ? (data?: undefined, transfer?: []) => void
  : GetTransferables<D, 10> extends null
    ? (data: Exclude<D, undefined>, transfer?: []) => void
    : (
        data: Exclude<D, undefined>,
        transfer: Transfer<Exclude<D, undefined>, []>
      ) => void;

type ActionThis<
  A extends CommonActions = CommonActions,
  D extends MessageData = MessageData,
> = {
  $post: PostMsgWithId<D>;
  $end: PostMsgWithId<D>;
} & ActionWithThis<A, any>; // 为什么这里要将 D（data） 指定为 any？因为如果这里获取到了具体的 data 的类型，那么 this 中访问到的其它 Action 的 data 类型会被统一推断为该类型。如此，当在一个 Action 中使用 this 访问其它 Action 时，如果它们的 data 的类型不同，就会出现类型错误。既然在 Action 中通过 this 调用其它 Action 时，不会触发它们的消息传递，只会获取到它们的返回值，因此将 this 中访问到的 Action 中的 data 类型设置为 any 即可。

function _postMessage(
  message: MsgFromWorker<"action_data">,
  options?: Transferable[] | StructuredSerializeOptions
) {
  try {
    if (Array.isArray(options)) {
      postMessage(message, options);
    } else {
      postMessage(message, options);
    }
  } catch (error) {
    const { id, done } = message;
    const errorMsg: MsgFromWorker<"message_error"> = {
      id,
      done,
      type: "message_error",
      error,
    };
    console.error(error);
    postMessage(errorMsg);
  }
}
//#endregion

export function createOnmessage<A extends CommonActions>(
  actions: ActionWithThis<A>
) {
  return async (e: MessageEvent<MsgDataFromMain>) => {
    const { actionName, payload, id } = e.data;

    const startSignalMsg: MsgFromWorker<"start_signal"> = {
      id,
      type: "start_signal",
    };
    postMessage(startSignalMsg);

    const postMsgWithId: PostMsgWithId = (
      data?: MessageData,
      transfer: Transferable[] = []
    ) => {
      const done = false;
      const msgFromWorker: MsgFromWorker<"action_data"> = {
        data,
        id,
        done,
        type: "action_data",
      };
      _postMessage(msgFromWorker, transfer);
    };

    const postResultWithId: PostMsgWithId = (
      data?: MessageData,
      transfer: Transferable[] = []
    ) => {
      Promise.resolve([data, transfer]).then((res) => {
        const toMain: Awaited<ReturnType<A[string]>> = res as any;
        let data: MessageData = null;
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
          id,
          done,
          type: "action_data",
        };
        _postMessage(resultFromWorker, transfer);
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
        let data: MessageData = null;
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
          id,
          done,
          type: "action_data",
        };
        _postMessage(resultFromWorker, transfer);
      }
    } catch (error: any) {
      if (
        error.message ===
        "Cannot read properties of undefined (reading 'apply')"
      ) {
        if (actionName) console.warn(`'${actionName}' is not a action name.`);
      } else {
        throw error;
      }
    }
  };
}

//#endregion
