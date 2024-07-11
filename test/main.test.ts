import { expect } from "chai";
import worker, {
  pingIntervalExecutor,
  pingLaterExecutor,
  returnVoidExecutor,
  returnNullExecutor,
  receiveAndReturnOffscreenCanvasExecutor,
  returnUncloneableDataExecutor,
  returnUncloneableDataWithOffscreenCanvasExecutor,
  receiveProxyDataExecutor,
  returnUncloneableArrExecutor,
  // Insert Executors to be imported above this line.
} from "demo/demo.main";
import { ProxyObj, UnwrapPromise } from "src/main";

function typeCheck<T>(data: T) {
  return data;
}

describe("actions", function () {
  //#region - pingInterval
  describe("pingInterval", function () {
    let pingIntervalPort: ReturnType<typeof pingIntervalExecutor>;

    it("event", function (done) {
      pingIntervalPort = pingIntervalExecutor();

      let counter = 0;
      expect(pingIntervalPort.readyState).to.equal(0);

      pingIntervalPort.addEventListener("message", async (e) => {
        const msg = "ping " + ++counter;
        expect(e.data).to.equal(msg);
        expect(pingIntervalPort.readyState).to.equal(1);
        typeCheck<string>(e.data);
        done();
      });
    });

    it("promise", async function () {
      const { data } = await pingIntervalPort.promise;
      expect(data).to.equal("no longer ping");
      expect(pingIntervalPort.readyState).to.equal(2);
      typeCheck<string>(data);
    });
  });
  //#endregion

  //#region - pingLater
  describe("pingLater", function () {
    let pingLaterPort: ReturnType<typeof pingLaterExecutor>;

    it("event", function () {
      pingLaterPort = pingLaterExecutor();
    });

    it("promise", async function () {
      const { data } = await pingLaterPort.promise;
      expect(data).to.equal("Worker recieved a message from Main 500ms ago.");
      typeCheck<string>(data);
    });
  });
  //#endregion

  //#region - returnVoid
  describe("returnVoid", function () {
    let returnVoidPort: ReturnType<typeof returnVoidExecutor>;

    it("event", function () {
      returnVoidPort = returnVoidExecutor();
    });

    it("promise", async function () {
      const { data } = await returnVoidPort.promise;
      expect(data).to.equal(undefined);
      typeCheck<undefined>(data);
    });
  });
  //#endregion

  //#region - returnNull
  describe("returnNull", function () {
    let returnNullPort: ReturnType<typeof returnNullExecutor>;

    it("event", function () {
      returnNullPort = returnNullExecutor();
    });

    it("promise", async function () {
      const { data } = await returnNullPort.promise;
      expect(data).to.equal(null);
      typeCheck<null>(data);
    });
  });
  //#endregion

  //#region - receiveAndReturnOffscreenCanvas
  describe("receiveAndReturnOffscreenCanvas", function () {
    let receiveAndReturnOffscreenCanvas1Port: ReturnType<
      typeof receiveAndReturnOffscreenCanvasExecutor
    >;

    it("event", function () {
      receiveAndReturnOffscreenCanvas1Port =
        receiveAndReturnOffscreenCanvasExecutor();
    });

    it("promise", async function () {
      const { data } = await receiveAndReturnOffscreenCanvas1Port.promise;
      expect(data instanceof OffscreenCanvas).to.equal(true);
      typeCheck<OffscreenCanvas>(data);
    });
  });
  //#endregion

  //#region - UncloneableData
  describe("returnUncloneableData", function () {
    let returnUncloneableDataPort: ReturnType<
      typeof returnUncloneableDataExecutor
    >;

    it("event", function () {
      returnUncloneableDataPort = returnUncloneableDataExecutor();

      return new Promise<void>((resolve, reject) => {
        returnUncloneableDataPort.addEventListener("message", async (e) => {
          const { data } = e;
          try {
            typeCheck<PromiseLike<string>>(data.f());
            expect(await data.f()).to.equal("result of data.f()");
            const f = data.f;
            typeCheck<() => PromiseLike<string>>(f);
            typeCheck<PromiseLike<string>>(f());
            expect(await f()).to.equal("result of data.f()");

            typeCheck<PromiseLike<number>>(data.count);
            expect(await data.count).to.equal(0);
            await data.increase();
            expect(await data.count).to.equal(1);

            typeCheck<PromiseLike<string>>(data.layer1.layer2);
            expect(await data.layer1.layer2).to.equal("nested value");

            typeCheck<PromiseLike<string>>(data.layer1.getString()().value);
            expect(await data.layer1.getString()().value).to.equal(
              "result of data.layer1.getString()"
            );

            typeCheck<PromiseLike<string>>(
              new (data.layer1.getString()().Person)("zzc6332").getName()
            );
            expect(
              await new (data.layer1.getString()().Person)("zzc6332").getName()
            ).to.equal("zzc6332");

            (data.layer1.layer2 as any as UnwrapPromise<
              typeof data.layer1.layer2
            >) = "Hello Proxy!";

            expect(await data.layer1.layer2).to.equal("Hello Proxy!");

            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

    it("promise", async function () {
      const { data } = await returnUncloneableDataPort.promise;

      typeCheck<PromiseLike<string>>(data.f());
      expect(await data.f()).to.equal("result of data.f()");
      const f = data.f;
      typeCheck<() => PromiseLike<string>>(data.f);
      typeCheck<PromiseLike<string>>(f());
      expect(await f()).to.equal("result of data.f()");

      typeCheck<PromiseLike<number>>(data.count);
      expect(await data.count).to.equal(1);
      await data.increase();
      expect(await data.count).to.equal(2);

      typeCheck<PromiseLike<string>>(data.layer1.layer2);
      expect(await data.layer1.layer2).to.equal("Hello Proxy!");

      typeCheck<PromiseLike<string>>(data.layer1.getString()().value);
      expect(await data.layer1.getString()().value).to.equal(
        "result of data.layer1.getString()"
      );

      typeCheck<PromiseLike<string>>(
        new (data.layer1.getString()().Person)("zzc6332").getName()
      );
      expect(
        await new (data.layer1.getString()().Person)("zzc6332").getName()
      ).to.equal("zzc6332");
    });
  });

  let dataOfReturnUncloneableDataWithTranserableObj: ProxyObj<{
    f: () => void;
    offscreen: OffscreenCanvas;
    imageBitmap: ImageBitmap | null;
  }>;

  describe("returnUncloneableDataWithTranserableObj", function () {
    let returnUncloneableDataWithOffscreenCanvasPort: ReturnType<
      typeof returnUncloneableDataWithOffscreenCanvasExecutor
    >;

    it("event", function () {
      returnUncloneableDataWithOffscreenCanvasPort =
        returnUncloneableDataWithOffscreenCanvasExecutor();
    });

    it("promise", async function () {
      const { data } =
        await returnUncloneableDataWithOffscreenCanvasPort.promise;

      (data.imageBitmap as any as UnwrapPromise<typeof data.imageBitmap>) =
        await data.offscreen.transferToImageBitmap();

      typeCheck<ImageBitmap | null>(await data.imageBitmap);
      expect((await data.imageBitmap) instanceof ImageBitmap).to.equal(true);

      dataOfReturnUncloneableDataWithTranserableObj = data;
    });
  });

  describe("receiveProxyData", function () {
    let receiveProxyDataPort: ReturnType<typeof receiveProxyDataExecutor>;

    it("event", function () {
      receiveProxyDataPort = receiveProxyDataExecutor(
        dataOfReturnUncloneableDataWithTranserableObj
      );
    });

    it("promise", async function () {
      const { data } = await receiveProxyDataPort.promise;
      typeCheck<boolean>(data);
      expect(data).to.equal(true);
    });
  });
  //#endregion

  //#region - UncloneableArr
  describe("returnUncloneableArr", function () {
    describe("async iterator", function () {
      let returnUncloneableArrPort: ReturnType<
        typeof returnUncloneableArrExecutor
      >;

      it("event", function () {
        returnUncloneableArrPort = returnUncloneableArrExecutor();
      });

      it("promise", async function () {
        const { data } = await returnUncloneableArrPort.promise;

        let index = 0;
        for await (const item of data) {
          typeCheck<PromiseLike<number>>(item.index);
          expect(await item.index).to.equal(index);

          typeCheck<PromiseLike<number>>(item.layer1.layer2.index);
          expect(await item.layer1.layer2.index).to.equal(index);

          typeCheck<() => PromiseLike<string>>(item.f);
          expect(await item.f()).to.equal("index: " + index++);
        }
      });
    });

    describe("forEach", function () {
      let returnUncloneableArrPort: ReturnType<
        typeof returnUncloneableArrExecutor
      >;

      it("event", function () {
        returnUncloneableArrPort = returnUncloneableArrExecutor();
      });

      it("promise", async function () {
        const { data } = await returnUncloneableArrPort.promise;

        await data.forEach(async (item, index) => {
          typeCheck<PromiseLike<number>>(item.index);
          expect(await item.index).to.equal(index);

          typeCheck<PromiseLike<number>>(item.layer1.layer2.index);
          expect(await item.layer1.layer2.index).to.equal(index);

          typeCheck<() => PromiseLike<string>>(item.f);
          expect(await item.f()).to.equal("index: " + index);
        });
      });
    });

    describe("map", function () {
      let returnUncloneableArrPort: ReturnType<
        typeof returnUncloneableArrExecutor
      >;

      it("event", function () {
        returnUncloneableArrPort = returnUncloneableArrExecutor();
      });

      it("promise", async function () {
        const { data } = await returnUncloneableArrPort.promise;

        const clonedArr = await data.map((item) => {
          return item;
        });
        let currentIndex = 0;
        for await (const item of clonedArr) {
          typeCheck<PromiseLike<number>>(item.index);
          expect(await item.index).to.equal(currentIndex);

          typeCheck<PromiseLike<number>>(item.layer1.layer2.index);
          expect(await item.layer1.layer2.index).to.equal(currentIndex);

          typeCheck<() => PromiseLike<string>>(item.f);
          expect(await item.f()).to.equal("index: " + currentIndex++);
        }

        const newArr = await data.map((item, index) => {
          return { item, index };
        });
        for (const i in newArr) {
          const newItem = newArr[i];
          const { item, index } = newItem;

          typeCheck<PromiseLike<number>>(item.index);
          expect(await item.index).to.equal(Number(i));

          typeCheck<PromiseLike<number>>(item.layer1.layer2.index);
          expect(await item.layer1.layer2.index).to.equal(Number(i));

          typeCheck<() => PromiseLike<string>>(item.f);
          expect(await item.f()).to.equal("index: " + i);

          typeCheck<number>(index);
          expect(index).to.equal(Number(i));
        }
      });
    });

    describe("pop", function () {
      let returnUncloneableArrPort: ReturnType<
        typeof returnUncloneableArrExecutor
      >;

      it("event", function () {
        returnUncloneableArrPort = returnUncloneableArrExecutor();
      });

      it("promise", async function () {
        const { data } = await returnUncloneableArrPort.promise;

        typeCheck<PromiseLike<number>>(data.length);
        const originalLength = await data.length;

        const popped = await data.pop();
        typeCheck<
          | ProxyObj<{
              index: number;
              f: () => string;
              layer1: {
                layer2: {
                  index: number;
                };
              };
            }>
          | undefined
        >(popped);
        typeCheck<PromiseLike<number> | undefined>(popped?.index);
        expect(await popped?.index).to.equal(originalLength - 1);
        expect(await data[originalLength - 1]).to.equal(undefined);

        await data.pop();
        await data.pop();
        expect(await data.length).to.equal(0);
      });
    });
  });
  //#endregion

  // Insert test cases above this line.
});

describe("terminate", () => {
  it("listenerCount", function (done) {
    expect((worker as any).listenerMapsSet.size).to.equal(1);
    worker.terminate();
    expect((worker as any).listenerMapsSet.size).to.equal(0);
    done();
  });
});
