import { ActionResult, createOnmessage } from "src/worker";

export type DemoActions = {
  pingLater: (delay: number) => ActionResult<string | void>;

  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string | void>;

  returnVoid: () => ActionResult;

  returnNull: () => ActionResult<null>;

  receiveAndReturnOffscreenCanvas1: (
    offscreen: OffscreenCanvas
  ) => ActionResult<OffscreenCanvas | void>;

  receiveAndReturnOffscreenCanvas2: (
    offscreen: OffscreenCanvas
  ) => ActionResult<OffscreenCanvas>;

  // Insert ActionTypes above this line
};

onmessage = createOnmessage<DemoActions>({
  async pingLater(delay) {
    setTimeout(() => {
      this.$end("Worker recieved a message from Main " + delay + "ms ago.");
    }, delay);
  },

  async pingInterval(interval, isImmediate, duration) {
    let counter = 0;
    const genMsg = () => "ping " + ++counter;
    if (isImmediate) this.$post(genMsg());
    const intervalId = setInterval(() => {
      this.$post(genMsg());
    }, interval);
    setTimeout(() => {
      clearInterval(intervalId);
      this.$end("no longer ping");
    }, duration);
  },

  async returnVoid() {
    this.$end();
  },

  async returnNull() {
    return null;
  },

  async receiveAndReturnOffscreenCanvas1(offscreen) {
    this.$end(offscreen, [offscreen]);
  },

  async receiveAndReturnOffscreenCanvas2(offscreen) {
    return [offscreen, [offscreen]];
  },

  // Insert Actions above this line
});
