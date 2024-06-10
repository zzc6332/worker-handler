import { expect } from "chai";
import worker, {
  pingIntervalPort,
  pingLaterPort,
  returnVoidPort,
  returnNullPort,
  receiveAndReturnOffscreenCanvas1Port,
  receiveAndReturnOffscreenCanvas2Port,
  // Insert Ports to be imported above this line.
} from "demo/demo.main";

type IsEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

describe("actions", () => {
  it("pingInterval_event", function (done) {
    let counter = 0;
    expect(pingIntervalPort.readyState).to.equal(0);

    pingIntervalPort.addEventListener("message", (e) => {
      const msg = "ping " + ++counter;
      expect(e.data).to.equal(msg);
      expect(pingIntervalPort.readyState).to.equal(1);
      const typeCheck: IsEqual<typeof e.data, string> = true;

      expect(typeCheck).to.equal(true);
      done();
    });
  });

  it("pingInterval_promise", async function () {
    const { data } = await pingIntervalPort.promise;
    expect(data).to.equal("no longer ping");
    console.log(pingIntervalPort.readyState);
    expect(pingIntervalPort.readyState).to.equal(2);

    const typeCheck: IsEqual<typeof data, string> = true;
    expect(typeCheck).to.equal(true);
  });

  it("pingLater_promise", async function () {
    const { data } = await pingLaterPort.promise;
    expect(data).to.equal("Worker recieved a message from Main 500ms ago.");

    const typeCheck: IsEqual<typeof data, string> = true;
    expect(typeCheck).to.equal(true);
  });

  it("returnVoid_promise", async function () {
    const { data } = await returnVoidPort.promise;
    expect(data).to.equal(undefined);

    const typeCheck: IsEqual<typeof data, undefined> = true;
    expect(typeCheck).to.equal(true);
  });

  it("returnNull_promise", async function () {
    const { data } = await returnNullPort.promise;
    expect(data).to.equal(null);

    const typeCheck: IsEqual<typeof data, null> = true;
    expect(typeCheck).to.equal(true);
  });

  it("receiveAndReturnOffscreenCanvas1_promise", async function () {
    const { data } = await receiveAndReturnOffscreenCanvas1Port.promise;
    expect(data instanceof OffscreenCanvas).to.equal(true);

    const typeCheck: IsEqual<typeof data, OffscreenCanvas> = true;
    expect(typeCheck).to.equal(true);
  });

  it("receiveAndReturnOffscreenCanvas2_promise", async function () {
    const { data } = await receiveAndReturnOffscreenCanvas2Port.promise;
    expect(data instanceof OffscreenCanvas).to.equal(true);

    const typeCheck: IsEqual<typeof data, OffscreenCanvas> = true;
    expect(typeCheck).to.equal(true);
  });

  // Insert test cases above this line.
});

describe("terminate", () => {
  it("listenerCount", function () {
    expect((worker as any).listenerMapsSet.size).to.equal(1);
    worker.terminate();
    expect((worker as any).listenerMapsSet.size).to.equal(0);
  });
});
