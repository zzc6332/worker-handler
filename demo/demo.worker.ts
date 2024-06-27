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
    layer1: { layer2: string; f: () => string };
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

  receiveProxyData2: (data: {
    f: () => void;
    offscreen: OffscreenCanvas;
    imageBitmap: ImageBitmap | null;
  }) => ActionResult<boolean>;

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
      f: () => "result of data.f()",
      count: 0,
      increase() {
        this.count++;
      },
      Person,
      layer1: {
        layer2: "nested value",
        f: () => "result of data.layer1.f()",
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

  async receiveProxyData2(data) {
    return this.receiveProxyData(data);
  },

  // Insert Actions above this line
});

class Person {
  constructor(public name: string) {}
}
