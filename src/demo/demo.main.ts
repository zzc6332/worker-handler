import { WorkerHandler } from "worker-handler-test/main";
// import { WorkerHandler } from "../main";
import { DemoActions } from "./demo.worker";

// import workerUrl from "./demo.worker.ts?worker&url"; // in vite
// import workerInstance from "./demo.worker.ts?worker"; // in vite

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url)) // in webpack5
  // pass workerUrl Or workerInstance here in Vite
);

demoWorker
  .execute("sendBackMsgLater", "message me later", 1000)
  .then((res) => {
    console.log(res.value);
  })
  .catch((err) => {
    console.log(err);
  });
