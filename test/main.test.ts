import { expect } from "chai";
import {
  worker,
  pingIntervalExecutor,
  pingLaterExecutor,
  returnVoidExecutor,
  returnNullExecutor,
  receiveAndReturnOffscreenCanvas1Executor,
  receiveAndReturnOffscreenCanvas2Executor,
  returnUncloneableDataExecutor,
  // Insert Executors to be imported above this line.
} from "demo/demo.main";

type IsEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

describe("actions", function () {
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
        const typeCheck: IsEqual<typeof e.data, string> = true;

        expect(typeCheck).to.equal(true);
        done();
      });
    });

    it("promise", async function () {
      const { data } = await pingIntervalPort.promise;
      expect(data).to.equal("no longer ping");
      expect(pingIntervalPort.readyState).to.equal(2);

      const typeCheck: IsEqual<typeof data, string> = true;
      expect(typeCheck).to.equal(true);
    });
  });

  describe("pingLater", function () {
    let pingLaterPort: ReturnType<typeof pingLaterExecutor>;

    it("event", function () {
      pingLaterPort = pingLaterExecutor();
    });

    it("promise", async function () {
      const { data } = await pingLaterPort.promise;
      expect(data).to.equal("Worker recieved a message from Main 500ms ago.");

      const typeCheck: IsEqual<typeof data, string> = true;
      expect(typeCheck).to.equal(true);
    });
  });

  describe("returnVoid", function () {
    let returnVoidPort: ReturnType<typeof returnVoidExecutor>;

    it("event", function () {
      returnVoidPort = returnVoidExecutor();
    });

    it("promise", async function () {
      const { data } = await returnVoidPort.promise;
      expect(data).to.equal(undefined);

      const typeCheck: IsEqual<typeof data, undefined> = true;
      expect(typeCheck).to.equal(true);
    });
  });

  describe("returnNull", function () {
    let returnNullPort: ReturnType<typeof returnNullExecutor>;

    it("event", function () {
      returnNullPort = returnNullExecutor();
    });

    it("promise", async function () {
      const { data } = await returnNullPort.promise;
      expect(data).to.equal(null);

      const typeCheck: IsEqual<typeof data, null> = true;
      expect(typeCheck).to.equal(true);
    });
  });

  describe("receiveAndReturnOffscreenCanvas1", function () {
    let receiveAndReturnOffscreenCanvas1Port: ReturnType<
      typeof receiveAndReturnOffscreenCanvas1Executor
    >;

    it("event", function () {
      receiveAndReturnOffscreenCanvas1Port =
        receiveAndReturnOffscreenCanvas1Executor();
    });

    it("promise", async function () {
      const { data } = await receiveAndReturnOffscreenCanvas1Port.promise;
      expect(data instanceof OffscreenCanvas).to.equal(true);

      const typeCheck: IsEqual<typeof data, OffscreenCanvas> = true;
      expect(typeCheck).to.equal(true);
    });
  });

  describe("receiveAndReturnOffscreenCanvas2", function () {
    let receiveAndReturnOffscreenCanvas2Port: ReturnType<
      typeof receiveAndReturnOffscreenCanvas2Executor
    >;

    it("event", function () {
      receiveAndReturnOffscreenCanvas2Port =
        receiveAndReturnOffscreenCanvas2Executor();
    });

    it("promise", async function () {
      const { data } = await receiveAndReturnOffscreenCanvas2Port.promise;
      expect(data instanceof OffscreenCanvas).to.equal(true);

      const typeCheck: IsEqual<typeof data, OffscreenCanvas> = true;
      expect(typeCheck).to.equal(true);
    });
  });

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
            expect(await data.f()).to.equal("result of data.f");
            const f = data.f;
            expect(await f()).to.equal("result of data.f");

            expect(await data.count).to.equal(0);
            await data.increase();
            expect(await data.count).to.equal(1);

            expect(await data.layer1.layer2).to.equal("nested value");

            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

    it("promise", async function () {
      const { data } = await returnUncloneableDataPort.promise;

      expect(await data.f()).to.equal("result of data.f");
      const f = data.f;
      expect(await f()).to.equal("result of data.f");

      expect(await data.count).to.equal(1);
      await data.increase();
      expect(await data.count).to.equal(2);

      expect(await data.layer1.layer2).to.equal("nested value");
    });
  });

  // Insert test cases above this line.
});

describe("terminate", () => {
  it("listenerCount", function (done) {
    setTimeout(() => {
      expect((worker as any).listenerMapsSet.size).to.equal(1);
      worker.terminate();
      expect((worker as any).listenerMapsSet.size).to.equal(0);
      done();
    }, 550);
  });
});
