import { WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const worker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker", import.meta.url))
);

export const pingLaterPort = worker.execute("pingLater", [], 500);

export const pingIntervalPort = worker.execute(
  "pingInterval",
  [],
  300,
  false,
  1000
);

export const returnVoidPort = worker.execute("returnVoid");

export const returnNullPort = worker.execute("returnNull");

const offset1 = new OffscreenCanvas(0, 0);
export const receiveAndReturnOffscreenCanvas1Port = worker.execute(
  "receiveAndReturnOffscreenCanvas1",
  [offset1],
  offset1
);

const offset2 = new OffscreenCanvas(0, 0);
export const receiveAndReturnOffscreenCanvas2Port = worker.execute(
  "receiveAndReturnOffscreenCanvas2",
  [offset2],
  offset2
);

// Insert Ports above this line
