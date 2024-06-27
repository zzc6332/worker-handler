import { WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const worker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker", import.meta.url))
);

export const pingLaterExecutor = () => worker.execute("pingLater", [], 500);

export const pingIntervalExecutor = () =>
  worker.execute("pingInterval", [], 300, false, 1000);

export const returnVoidExecutor = () => worker.execute("returnVoid");

export const returnNullExecutor = () => worker.execute("returnNull");

const offset1 = new OffscreenCanvas(0, 0);
export const receiveAndReturnOffscreenCanvas1Executor = () =>
  worker.execute("receiveAndReturnOffscreenCanvas1", [offset1], offset1);

const offset2 = new OffscreenCanvas(0, 0);
export const receiveAndReturnOffscreenCanvas2Executor = () =>
  worker.execute("receiveAndReturnOffscreenCanvas2", [offset2], offset2);

export const returnUncloneableDataExecutor = () =>
  worker.execute("returnUncloneableData");

export const returnUncloneableDataWithOffscreenCanvasExecutor = () =>
  worker.execute("returnUncloneableDataWithOffscreenCanvas");

export const receiveProxyDataExecutor = (data: {
  f: () => void;
  offscreen: OffscreenCanvas;
  imageBitmap: ImageBitmap | null;
}) => worker.execute("receiveProxyData", 0, data);

export const receiveProxyData2Executor = (data: {
  f: () => void;
  offscreen: OffscreenCanvas;
  imageBitmap: ImageBitmap | null;
}) => worker.execute("receiveProxyData2", 0, data);

// Insert Executors above this line

export default worker;
