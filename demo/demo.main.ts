import { ReceivedData, WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const worker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker", import.meta.url))
);

export const pingLaterExecutor = () => worker.execute("pingLater", [], 500);

export const pingIntervalExecutor = () =>
  worker.execute("pingInterval", [], 300, false, 1000);

export const returnVoidExecutor = () => worker.execute("returnVoid");

export const returnNullExecutor = () => worker.execute("returnNull");

const offscreen = new OffscreenCanvas(0, 0);
export const receiveAndReturnOffscreenCanvasExecutor = () =>
  worker.execute("receiveAndReturnOffscreenCanvas", [offscreen], offscreen);

export const returnUncloneableDataExecutor = () =>
  worker.execute("returnUncloneableData");

export const returnUncloneableDataWithOffscreenCanvasExecutor = () =>
  worker.execute("returnUncloneableDataWithOffscreenCanvas");

export const receiveProxyDataExecutor = (
  data: ReceivedData<{
    f: () => void;
    offscreen: OffscreenCanvas;
    imageBitmap: ImageBitmap | null;
  }>
) => worker.execute("receiveProxyData", 0, data);

export const returnUncloneableArrExecutor = () =>
  worker.execute("returnUncloneableArr");

export const returnResolvedPromiseExecutor = () =>
  worker.execute("returnResolvedPromise");

export const returnRejectedPromiseExecutor = () =>
  worker.execute("returnRejectedPromise");

export const postAndEndWithResolvedPromiseExecutor = () =>
  worker.execute("postAndEndWithResolvedPromise");

export const postAndEndWithRejectedPromiseExecutor = () =>
  worker.execute("postAndEndWithRejectedPromise");

export const returnResolvedPromiseInObjExecutor = () =>
  worker.execute("returnResolvedPromiseInObj");

export const returnRejectedPromiseInObjExecutor = () =>
  worker.execute("returnRejectedPromiseInObj");

export const postNumReturnStrExecutor = () => worker.execute("postNumReturnStr");

// Insert Executors above this line

export default worker;
