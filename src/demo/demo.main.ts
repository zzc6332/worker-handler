// import { WorkerHandler } from "worker-handler/main";
import { WorkerHandler } from "../main";
import { DemoActions } from "./demo.worker";

// import workerUrl from "./demo.worker.ts?worker&url"; // in vite
// import workerInstance from "./demo.worker.ts?worker"; // in vite

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url)) // in webpack5
  // pass workerUrl Or workerInstance here in Vite
);

const pingInterval = demoWorker.execute("pingInterval", [], 1000, false, 5000);
pingInterval.addEventListener("message", (e) => {
  console.log(e.data);
});
pingInterval.onmessage = (e) => {
  console.log(e.data);
  console.log("readyState: ", pingInterval.readyState);
};
pingInterval.promise.then((res) => {
  console.log(res.data);
});
console.log("readyState: ", pingInterval.readyState);
setTimeout(() => {
  console.log("结束时的 customListenersCount: ", demoWorker.terminate(true));
  console.log("readyState: ", pingInterval.readyState);
}, 6000);

demoWorker.execute("getDocument");

export default demoWorker;
