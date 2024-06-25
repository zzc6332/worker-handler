import { ActionResult, createOnmessage } from "src/worker";

export type DemoActions = {
  pingLater: (delay: number) => ActionResult<string>;

  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string>;

  returnVoid: () => ActionResult;

  returnNull: () => ActionResult<null>;

  receiveAndReturnOffscreenCanvas1: (
    offscreen: OffscreenCanvas
  ) => ActionResult<OffscreenCanvas>;

  receiveAndReturnOffscreenCanvas2: (
    offscreen: OffscreenCanvas
  ) => ActionResult<OffscreenCanvas>;

  returnUncloneableData: () => ActionResult<{
    f: () => string;
    count: number;
    increase: () => void;
    Person: typeof Person;
    layer1: { layer2: string; f: () => void };
  }>;

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
    return offscreen;
  },

  async returnUncloneableData() {
    const data = {
      f: () => "result of data.f",
      count: 0,
      increase() {
        this.count++;
      },
      Person,
      layer1: { layer2: "nested value", f: () => {} },
    };
    this.$post(data);
    setTimeout(() => {
      this.$end(data);
    }, 500);
  },

  // Insert Actions above this line
});

class Person {
  constructor(public name: string) {}
}
