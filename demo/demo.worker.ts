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

  receiveAndReturnOffscreenCanvas: (
    offscreen: OffscreenCanvas
  ) => ActionResult<OffscreenCanvas>;

  returnUncloneableData: () => ActionResult<{
    f: () => string;
    count: number;
    increase: () => void;
    Person: typeof Person;
    layer1: {
      layer2: string;
      getString: () => () => { value: string; Person: typeof Person };
    };
  }>;

  returnUncloneableDataWithOffscreenCanvas: () => ActionResult<{
    f: () => void;
    offscreen: OffscreenCanvas;
    imageBitmap: ImageBitmap | null;
  }>;

  receiveProxyData: (data: {
    f: () => void;
    offscreen: OffscreenCanvas;
    imageBitmap: ImageBitmap | null;
  }) => ActionResult<boolean>;

  returnUncloneableArr: () => ActionResult<
    { index: number; f: () => string; layer1: { layer2: { index: number } } }[]
  >;

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

  async receiveAndReturnOffscreenCanvas(offscreen) {
    this.$end(offscreen, [offscreen]);
  },

  async returnUncloneableData() {
    const data = {
      f: () => "result of data.f()",
      count: 0,
      increase() {
        this.count++;
      },
      Person,
      layer1: {
        layer2: "nested value",
        getString: () => () => ({
          value: "result of data.layer1.getString()",
          Person,
        }),
      },
    };
    this.$post(data);
    setTimeout(() => {
      this.$end(data);
    }, 500);
  },

  async returnUncloneableDataWithOffscreenCanvas() {
    const offscreen = new OffscreenCanvas(1, 1);
    offscreen.getContext("2d");
    this.$end({ f: () => {}, offscreen, imageBitmap: null });
  },

  async receiveProxyData(data) {
    return (
      typeof data.f === "function" &&
      data.imageBitmap instanceof ImageBitmap &&
      data.offscreen instanceof OffscreenCanvas
    );
  },

  async returnUncloneableArr() {
    const result = [0, 1, 2].map((_, index) => ({
      index,
      f: () => "index: " + index,
      layer1: { layer2: { index } },
    }));
    return result;
  },

  // Insert Actions above this line
});

class Person {
  constructor(public name: string) {}

  getName() {
    return this.name;
  }
}
