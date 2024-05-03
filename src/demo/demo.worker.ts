// import {
//   ActionResult,
//   createActions,
//   createOnmessage,
// } from "worker-handler-test/worker";
import { ActionResult, createOnmessage } from "../worker";

export type DemoActions = {
  pingMeLater: (delay: number) => ActionResult<string>;
  workWithOffscreenCanvas: (canvas: OffscreenCanvas) => ActionResult<null>;
};

onmessage = createOnmessage<DemoActions>({
  pingMeLater: async (delay) => {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, delay);
    });
    return "Worker recieved a message from Main " + delay + "ms ago.";
  },
  workWithOffscreenCanvas: async (canvas) => {
    console.log(canvas);
    return;
  },
});
