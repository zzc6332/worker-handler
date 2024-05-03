import { WorkerHandler } from "../main";
import { DemoActions } from "./demo.worker";

// import workerSrc from "./demo.worker.ts?worker&url"; // vite
// import workerSrc from "./demo.worker.ts?worker"; // vite

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url)) // webpack5
  // workerSrc
);

demoWorker
  .execute("sendBackMsgLater", "message me later", 1000)
  .then((res) => {
    console.log(res.value);
  })
  .catch((err) => {
    console.log(err);
  });
