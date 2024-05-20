import { expect } from "chai";
import {
  pingIntervalPort,
  pingLaterPort,
  returnVoidPort,
  returnNullPort,
} from "demo/demo.main";

describe("worker-handler", function () {
  it("pingInterval", async function () {
    let counter = 0;
    pingIntervalPort.addEventListener("message", (e) => {
      const msg = "ping " + ++counter;
      expect(e.data).to.equal(msg);
    });
    const { data } = await pingIntervalPort.promise;
    expect(data).to.equal("no longer ping");
  });

  it("pingLater", async function () {
    const { data } = await pingLaterPort.promise;
    expect(data).to.equal("Worker recieved a message from Main 500ms ago.");
  });

  it("returnVoid", async function () {
    const { data } = await returnVoidPort.promise;
    expect(data).to.equal(undefined);
  });

  it("returnNull", async function () {
    const { data } = await returnNullPort.promise;
    expect(data).to.equal(null);
  });
});
