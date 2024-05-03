//#region - 定义 StructuredCloneable 类型

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

type StructuredCloneable =
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

export interface MsgToMain<A extends CommonActions, D> {
  msg: keyof A;
  data: D;
}
export interface MsgToMainWithId<A extends CommonActions>
  extends MsgToMain<A, unknown> {
  id: number;
}

export type ActionResult<
  D extends StructuredCloneable = StructuredCloneable,
  T extends Transferable[] = Transferable[],
> = Promise<D extends null ? void : never | Exclude<D, Array<any>> | [D, T]>;

export type CommonActions = {
  [K: string]: (...args: any[]) => ActionResult;
};

//#endregion

//#region - onmessage

type MsgDataFromMain = {
  actionName: string;
  payload: any;
  id: number;
};

export function createOnmessage<A extends CommonActions>(actions: A) {
  return async (e: MessageEvent<MsgDataFromMain>) => {
    const { actionName, payload, id } = e.data;
    const action = actions[actionName];
    const toMain = await action(...payload);
    let data: StructuredCloneable = null;
    let transfers: Transferable[] = [];
    if (Array.isArray(toMain)) {
      data = toMain[0];
      transfers = toMain[1];
    } else if (toMain) {
      data = toMain;
    }
    postMessage({ msg: actionName, data, id }, transfers);
  };
}

//#endregion
