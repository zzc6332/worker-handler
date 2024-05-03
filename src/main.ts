import {
  CommonActions,
  MsgToMain,
  MsgToMainWithId,
  ActionResult,
} from "./worker";

export class WorkerHandler<A extends CommonActions> {
  private worker: Worker;

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

  get instance() {
    return this.worker;
  }

  private postMsgToWorker<K extends keyof A>(
    actionName: K,
    transfers: Transferable[],
    ...payload: Parameters<A[K]>
  ) {
    this.id++;
    const message = { actionName, payload, id: this.id };
    this.worker.postMessage(message, transfers);
    return message.id;
  }

  private getMsgFromWorker<D>(id: number) {
    return new Promise<MsgToMain<A, D>>((resolve, reject) => {
      const onmessage = (e: MessageEvent<MsgToMainWithId<A>>) => {
        if (e.data.id === id) {
          this.worker.removeEventListener("message", onmessage);
          const { msg } = e.data;
          const data = e.data.data as D;
          const result = { msg, data };
          resolve(result);
        }
      };

      const onmessageerror = (e: MessageEvent<MsgToMainWithId<A>>) => {
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

  async execute<K extends keyof A>(
    actionName: K,
    transfers: Transferable[] | null | undefined,
    ...payload: Parameters<A[K]>
  ) {
    const id = this.postMsgToWorker(actionName, transfers || [], ...payload);
    return await this.getMsgFromWorker<GetDataType<A, K>>(id);
  }

  terminate() {
    this.worker.terminate();
  }
}

type GetDataType<A extends CommonActions, K extends keyof A> =
  ReturnType<A[K]> extends ActionResult<infer D> ? D : unknown;
