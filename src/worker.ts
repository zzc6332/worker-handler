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
  D extends MessageData | void = MessageData,
  T extends Transferable[] = Transfer<Exclude<D, void>>,
> = Promise<D extends void ? void : D extends Array<any> ? [D, T] : D>;

export type CommonActions = {
  [K: string]: (this: ActionThis, ...args: any[]) => ActionResult;
};

export type MsgFromWorker<D = MessageData> = {
  data?: D;
  id: number;
  done: boolean;
  keyMessage?: false;
};

export interface KeyMsgFromWorker extends Pick<MsgFromWorker, "id"> {
  keyMessage: true;
  type: string;
  error?: any;
  done?: boolean;
}

export type ActionWithThis<A extends CommonActions> = {
  [K in keyof A]: (
    this: ActionThis<A, GetDataType<A, K>>,
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

type PostMsgWithId<D extends MessageData = MessageData> = (
  data: D,
  transfer?: Transferable[]
) => void;

type ActionThis<
  A extends CommonActions = CommonActions,
  D extends MessageData = MessageData,
> = {
  $post: PostMsgWithId<D>;
  $end: PostMsgWithId<D>;
} & {
  [K in keyof A]: (
    this: ActionThis<A, any>,
    ...args: Parameters<A[K]>
  ) => ReturnType<A[K]>;
};

function _postMessage(
  message: MsgFromWorker,
  id: number,
  done: boolean,
  options?: Transferable[] | StructuredSerializeOptions
) {
  try {
    if (Array.isArray(options)) {
      postMessage(message, options);
    } else {
      postMessage(message, options);
    }
  } catch (error) {
    const keyMsgFromWorker: KeyMsgFromWorker = {
      keyMessage: true,
      id,
      done,
      type: "message_error",
      error,
    };
    console.error(error);
    postMessage(keyMsgFromWorker);
  }
}

export function createOnmessage<A extends CommonActions>(
  actions: ActionWithThis<A>
) {
  return async (e: MessageEvent<MsgDataFromMain>) => {
    const { actionName, payload, id } = e.data;

    const startSignalMsg: KeyMsgFromWorker = {
      keyMessage: true,
      id,
      type: "start_signal",
    };
    postMessage(startSignalMsg);

    const postMsgWithId: PostMsgWithId = (data, transfer = []) => {
      const done = false;
      const msgFromWorker: MsgFromWorker = {
        data,
        id,
        done,
      };
      _postMessage(msgFromWorker, id, done, transfer);
    };

    const postResultWithId: PostMsgWithId = (data, transfer = []) => {
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
        const resultFromWorker: MsgFromWorker = {
          data,
          id,
          done,
        };
        _postMessage(resultFromWorker, id, done, transfer);
      });
    };

    const boundActions = { ...actions };

    const actionThis: ActionThis<A> = {
      $post: postMsgWithId,
      $end: postResultWithId,
      ...boundActions,
    };

    for (const k in actions) {
      const boundAction = actions[k].bind(actionThis);
      boundActions[k] = boundAction;
      actionThis[k] = boundAction as any;
    }

    const action = actions[actionName];

    try {
      let promise: ReturnType<typeof action> = action.apply(
        actionThis,
        payload
      );

      const toMain = await promise;
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
        const resultFromWorker: MsgFromWorker = {
          data,
          id,
          done,
        };
        _postMessage(resultFromWorker, id, done, transfer);
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
