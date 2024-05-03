//#region  - 创建 actions

export interface MsgToMain<T extends CommonActions, M extends keyof T, V> {
  msg: M;
  value: V;
}
export interface MsgToMainWithId<T extends CommonActions>
  extends MsgToMain<T, keyof T, unknown> {
  id: number;
}
export type ActionResult<
  T extends CommonActions = CommonActions,
  M extends keyof T = keyof CommonActions,
  V = unknown
> = Promise<void | [MsgToMain<T, M, V>] | [MsgToMain<T, M, V>, Transferable[]]>;

export type CommonActions = {
  [K: string]: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => ActionResult<CommonActions>;
};

export function createActions<T extends CommonActions>(actions: T) {
  return actions;
}

//#endregion

//#region - onmessage

type MsgData = {
  actionName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  id: number;
};

export function createOnmessage(actions: CommonActions) {
  return async (e: MessageEvent<MsgData>) => {
    const { actionName, payload, id } = e.data;
    const action = actions[actionName];
    const toMain = await action(...payload);
    if (Array.isArray(toMain)) {
      const msgToMain = toMain[0];
      const transfer = toMain[1] || [];
      postMessage({ ...msgToMain, id }, transfer);
    }
  };
}

//#endregion
