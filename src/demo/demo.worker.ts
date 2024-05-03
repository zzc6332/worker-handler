import { ActionResult, createActions, createOnmessage } from "../worker";

export type DemoActions = {
  sendBackMsgLater: (
    msg: string,
    delay: number
  ) => ActionResult<DemoActions, "sendBackMsgLater", string>;
};

const demoActions = createActions<DemoActions>({
  sendBackMsgLater: async (msg, delay) => {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, delay);
    });
    return [{ msg: "sendBackMsgLater", value: msg }];
  },
});

onmessage = createOnmessage(demoActions);
