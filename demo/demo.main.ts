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
