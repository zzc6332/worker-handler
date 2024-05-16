// import {
//   ActionResult,
//   createActions,
//   createOnmessage,
// } from "worker-handler/worker";
import { ActionResult, createOnmessage } from "../worker";
import * as pdfjsLib from "pdfjs-dist";

// import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";
import {
  DocumentInitParameters,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  TypedArray,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";

//#region - 指定 workerPort
// 在 web worker 中，pdfjs 通过设置 workerPort 的方式来指定它的 pdf.worker.js
const workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
);
const worker = new Worker(workerSrc, { type: "module", name: "pdf-worker" });
pdfjsLib.GlobalWorkerOptions.workerPort = worker;
//#endregion

//#region - utils
// 在 web worker 中调用 pdfjsLib.getDocument 时，由于 worker 中没有 document，因此需要通过传入 DocumentInitParameters 对象以指定一个自定义的 ownerDocument，在这里封装一下 createDocumentInitParameters 用以生成 DocumentInitParameters 对象
function createDocumentInitParameters(
  src: string | URL | TypedArray | ArrayBuffer
): DocumentInitParameters {
  const url =
    typeof src === "string"
      ? new URL(src)
      : src instanceof URL
        ? src
        : undefined;

  const data: TypedArray | ArrayBuffer | undefined =
    !(src instanceof URL) && typeof src !== "string" ? src : undefined;

  return {
    url,
    data,
    ownerDocument: {
      fonts: self.fonts,
      createElement: (name: string) => {
        if (name == "canvas") {
          return new OffscreenCanvas(0, 0);
        }
        return null;
      },
    },
  };
}
//#endregion

export type DemoActions = {
  pingLater: (delay: number) => ActionResult<string>;
  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string | void>;
  getDocument: () => ActionResult<void>;
  init: (src: string | URL | ArrayBuffer) => ActionResult<void>;
  loadDocument: () => ActionResult<void>;
  loadPages: () => ActionResult<string | number>;
  load: (src: string | URL | ArrayBuffer) => ActionResult<void>;
  render: (canvas: OffscreenCanvas) => ActionResult<OffscreenCanvas>;
};

onmessage = createOnmessage<DemoActions>({
  async pingLater(delay) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, delay);
    });
    return "Worker recieved a message from Main " + delay + "ms ago.";
  },

  async pingInterval(interval, isImmediate, duration) {
    let counter = 0;
    const genMsg = () => "ping " + ++counter;
    if (isImmediate) this.$post(genMsg());
    const intervalId = setInterval(() => {
      this.$post(genMsg());
    }, interval);
    setTimeout(() => {
      clearInterval(intervalId);
      this.$end("no longer ping");
    }, duration);
  },
  async getDocument() {
    const document = pdfjsLib.getDocument(
      createDocumentInitParameters("http://192.168.6.2:8080/2")
    );
    console.log(document);
    this.pingInterval(1, true, 1);
  },
  async init(src) {
    pdfDocumentLoadingTask = pdfjsLib.getDocument(
      createDocumentInitParameters(src)
    );
  },
  async loadDocument() {
    pdfDocumentProxy = (await pdfDocumentLoadingTask?.promise) || null;
    if (!pdfDocumentProxy) throw new Error("获取 PDF Document 失败");
  },
  async loadPages() {
    const error = new Error("获取 PDF Pages 失败");
    if (!pdfDocumentProxy) throw error;
    const { numPages } = pdfDocumentProxy;
    const pagePromises: Promise<PDFPageProxy>[] = [];
    for (let i = 1; i <= numPages; i++) {
      pagePromises.push(pdfDocumentProxy.getPage(i));
    }
    pdfPageProxies = await Promise.all(pagePromises);
    return "123";
  },
  async load(src) {
    await this.init(src);
    await this.loadDocument();
    const a = await this.loadPages();
    const b = await this.render(new OffscreenCanvas(0, 0));
    console.log(pdfPageProxies);
    return;
  },
  async render(canvas) {
    const canvasContext = canvas.getContext("2d");
    console.log(pdfPageProxies);
    const viewport = pdfPageProxies[0].getViewport({ scale: 1 });
    pdfPageProxies[0].render({ canvasContext, viewport });
    return canvas;
  },
});
let pdfDocumentLoadingTask: PDFDocumentLoadingTask | null = null;
let pdfDocumentProxy: PDFDocumentProxy | null = null;
let pdfPageProxies: PDFPageProxy[];
