import {
  CommonActions,
  MsgToMain,
  MsgToMainWithId,
  ActionResult,
} from "./worker";

export class WorkerHandler<T extends CommonActions> {
  worker: Worker;

  private id: number = 0;

  constructor(workerSrc: string | URL | Worker, options?: WorkerOptions) {
    const _options: WorkerOptions = {
      ...options,
      type: "module",
    };
    if (workerSrc instanceof Worker) {
      this.worker = workerSrc;
    } else {
      this.worker = new Worker(workerSrc, _options);
    }
  }

  private postMsgToWorker<K extends keyof T>(
    actionName: K,
    ...payload: Parameters<T[K]>
  ) {
    this.id++;
    const message = { actionName, payload, id: this.id };
    this.worker.postMessage(message);
    return message.id;
  }

  private getMsgFromWorker<V>(id: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise<MsgToMain<T, keyof T, V>>((resolve, reject) => {
      const onmessage = (e: MessageEvent<MsgToMainWithId<T>>) => {
        const { data } = e;
        if (data.id === id) {
          this.worker.removeEventListener("message", onmessage);
          const { msg } = data;
          const value = data.value as V;
          const result = { msg, value };
          resolve(result);
        }
      };

      const onmessageerror = (e: MessageEvent<MsgToMainWithId<T>>) => {
        if (e.data.id === id) {
          this.worker.removeEventListener("messageerror", onmessageerror);
          reject(e);
        }
      };

      const onerror = (e: ErrorEvent) => {
        this.worker.removeEventListener("error", onerror);
        reject(e);
      };

      this.worker.addEventListener("message", onmessage);
      this.worker.addEventListener("messageerror", onmessageerror);
      this.worker.addEventListener("error", onerror);
    });
  }

  async execute<K extends keyof T>(
    actionName: K,
    ...payload: Parameters<T[K]>
  ) {
    const id = this.postMsgToWorker(actionName, ...payload);
    return await this.getMsgFromWorker<GetValueType<T, K>>(id);
  }

  terminate() {
    this.worker.terminate();
  }
}

type GetValueType<T extends CommonActions, M extends keyof T> =
  ReturnType<T[M]> extends ActionResult<T, M, infer V> ? V : unknown;
