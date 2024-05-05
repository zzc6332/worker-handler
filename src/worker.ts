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

export type StructuredCloneable =
  | Exclude<Primitive, symbol>
  | { [k: string | number]: StructuredCloneable }
  | Array<StructuredCloneable>
  | Map<StructuredCloneable, StructuredCloneable>
  | Set<StructuredCloneable>
  | ArrayBuffer
  | Boolean
  | String
  | DataView
  | Date
  | RegExp
  | TypedArray
  | StructuredCloneableError;

//#endregion

//#region  - actions 中的各种类型

export type ActionResult<
  D extends StructuredCloneable | void = StructuredCloneable,
  T extends Transferable[] = Transferable[],
> = Promise<D extends void ? void : never | Exclude<D, Array<any>> | [D, T]>;

export type CommonActions = {
  [K: string]: (this: ActionThis, ...args: any[]) => ActionResult;
};

export type MsgFromWorker<D = StructuredCloneable> = {
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
    this: ActionThis<GetDataType<A, K>>,
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

type PostMsgWithId<D extends StructuredCloneable = StructuredCloneable> = (
  data: D,
  transfer?: Transferable[]
) => void;

type ActionThis<D extends StructuredCloneable = StructuredCloneable> = {
  post: PostMsgWithId<D>;
  end: PostMsgWithId<D>;
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
        let data: StructuredCloneable = null;
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

    const actionThis: ActionThis = {
      post: postMsgWithId,
      end: postResultWithId,
    };

    const action = actions[actionName];

    let promise: ReturnType<typeof action> = action.apply(actionThis, payload);

    const toMain = await promise;
    if (toMain !== undefined) {
      let data: StructuredCloneable = null;
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
  };
}

//#endregion
