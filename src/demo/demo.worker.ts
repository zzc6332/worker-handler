// import {
//   ActionResult,
//   createActions,
//   createOnmessage,
// } from "worker-handler-test/worker";
import { ActionResult, createOnmessage } from "../worker";

export type DemoActions = {
  pingLater: (delay: number) => ActionResult<string>;
  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string | void>;
};

onmessage = createOnmessage<DemoActions>({
  async pingLater(delay) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, delay);
    });
    return "Worker recieved a message from Main " + delay + "ms ago.";
  },

  async pingInterval(interval, isImmediate, duration) {
    let counter = 0;
    const genMsg = () => "ping " + ++counter;
    if (isImmediate) this.post(genMsg());
    const intervalId = setInterval(() => {
      this.post(genMsg());
    }, interval);
    setTimeout(() => {
      clearInterval(intervalId);
      this.end("no longer ping");
    }, duration);
  },
});
