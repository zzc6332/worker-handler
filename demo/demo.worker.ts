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
    getArray: () => {
      index: number;
      f: () => string;
      layer1: { layer2: { index: number } };
    }[];
    array: {
      index: number;
      f: () => string;
      layer1: { layer2: { index: number } };
    }[];
    promise: Promise<{
      //  f: () => void;
      s: string;
    }>;
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

  returnResolvedPromise: () => ActionResult<Promise<() => string>>;

  returnRejectedPromise: () => ActionResult<Promise<never>>;

  postAndEndWithResolvedPromise: () => ActionResult<Promise<() => string>>;

  postAndEndWithRejectedPromise: () => ActionResult<Promise<never>>;

  returnResolvedPromiseInObj: () => ActionResult<{
    promise: Promise<() => string>;
  }>;

  returnRejectedPromiseInObj: () => ActionResult<{ promise: Promise<never> }>;

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
      getArray: () =>
        [0, 1, 2].map((_, index) => ({
          index,
          f: () => "index: " + index,
          layer1: { layer2: { index } },
        })),
      array: [0, 1, 2].map((_, index) => ({
        index,
        f: () => "index: " + index,
        layer1: { layer2: { index } },
      })),
      promise: Promise.reject({
        // f: () => {},
        s: "resolved string of promise",
      }),
    };

    setTimeout(() => {
      this.$post(data);
    }, 100);
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

  async returnResolvedPromise(): ActionResult<Promise<() => string>> {
    // return Promise.resolve(() => 'test string of "returnResolvedPromise"');
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(() => 'test string of "returnResolvedPromise"');
      }, 50);
    });
  },

  async returnRejectedPromise() {
    // return Promise.reject(new Error('test string of "returnRejectedPromise"'));
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('test string of "returnRejectedPromise"'));
      }, 100);
    });
  },

  async postAndEndWithResolvedPromise() {
    // this.$end(Promise.resolve(() => 'test string of "postAndEndWithResolvedPromise"'));
    this.$post(
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(() => 'test string of "postAndEndWithResolvedPromise"');
        }, 150);
      })
    );
    this.$end(
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(() => 'test string of "postAndEndWithResolvedPromise"');
        }, 200);
      })
    );
  },

  async postAndEndWithRejectedPromise() {
    // this.$end(
    //   Promise.reject(new Error('test string of "postAndEndWithRejectedPromise"'))
    // ); this.$end(
    this.$post(
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('test string of "postAndEndWithRejectedPromise"'));
        }, 250);
      })
    );
    this.$end(
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('test string of "postAndEndWithRejectedPromise"'));
        }, 300);
      })
    );
  },

  async returnResolvedPromiseInObj() {
    return {
      promise: new Promise((resolve) => {
        setTimeout(() => {
          resolve(() => 'test string of "returnResolvedPromiseInObj"');
        }, 350);
      }),
    };
  },

  async returnRejectedPromiseInObj() {
    return {
      promise: new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('test string of "returnRejectedPromiseInObj"'));
        }, 400);
      }),
    };
  },

  // Insert Actions above this line
});

class Person {
  constructor(public name: string) {}

  getName() {
    return this.name;
  }
}
