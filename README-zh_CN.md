# worker-handler

<div style="text-align: center;">
   <a href="./README.md">English</a> | <span style="font-weight:bold;">简体中文<span>
</div>

## 简介

`worker-handler` 提供了一种在 `javascript` 或 `typescript` 中使用 `Web Worker` 时使得主线程 `Main` 与工作线程 `Worker` 之间能够便捷地进行通信的能力。

通过 `worker-handler`，在 `Main` 中可以像发送网络请求一样向 `Worker` 发送请求，并在 `Worker` 中定义用于处理这些请求的 `Actions`。有两种方式获得消息响应，可以通过 `Promise` 获取，就像 [AJAX](https://developer.mozilla.org/zh-CN/docs/Glossary/AJAX)，也可以通过 `EventTarget` 获取，就像 [Server-sent events](https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events)，并且这两种响应方式可以在同一个请求中同时使用。

## 快速开始

### 安装

~~~sh
npm install worker-handler
~~~

### 基础示例

<span id="basic-example">以下示例展示了 `worker-handler` 最基础的用法：</span>

~~~javascript
// demo.worker.js
import { createOnmessage } from "worker-handler/worker";

// 传入 Actions 调用 createOnmessage 以创建 worker 的 onmessage 回调
onmessage = createOnmessage({
  // 如果只使用 Promise 响应方式，推荐使用 async 函数定义 Action
  async someAction() {
    // Action 中可以执行任意异步内容
    ......
    // 异步 Action 中返回的内容将作为响应内容以 promise 的形式传递给 Main
    return "some messages";
  }
});
~~~

~~~javascript
// demo.main.js
import { WorkerHandler } from "worker-handler"; // 也可以从 "worker-handler/main" 中引入

// import workerUrl from "./demo.worker.ts?worker&url"; // in vite
// import workerInstance from "./demo.worker.ts?worker"; // in vite

const demoWorker = new WorkerHandler(
  // 如果是在 vite 环境中，可以传入上面的 workerUrl 或 workerInstance
  new Worker(new URL("./demo.worker.js", import.meta.url)) // webpack5 环境中以这种方式创建 Worker 实例
);

// 请求 Worker 执行 someAction
demoWorker.execute("someAction", []).promise.then((res) => {
  // 接收 Action 中以 Promise 形式响应的内容
  console.log(res.data);
}).catch((err) => {
  // Action 中发生的错误会使得 promise 被 reject
  console.log(err)
});
~~~

## Typescript

`worker-handler` 具有 `typescript` 类型支持。一旦定义了 `Action` 的类型，就可以使得在 `Main` 和 `Worker` 之间传递消息时在发送端和接收端都能得到类型检测和提示，并且可以检测传递的消息是否可以被[结构化克隆算法](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)处理，是否需要处理[可转移对象](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects)等。

<span id="ts-example">以下是 `typescript` 中使用 `worker-handler` 的简单示例</span>：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

/* 
 * 定义 Actions 的类型，之后有以下两处地方需要将其作为泛型参数传入：
 * - 在 Worker 中使用 createOnmessage() 时
 * - 在 Main 中使用 new WorkerHandler() 时
*/
export type DemoActions = {
  // 定义一个名为 pingLater 的 Action，其返回值类型 ActionResult<string> 表示该 Action 可以传递给 Main 的消息类型为 string
  pingLater: (delay: number) => ActionResult<string>;
};

onmessage = createOnmessage<DemoActions>({
  // pingLater 执行后会在 delay 毫秒后将消息传递给 Main
  async pingLater(delay) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, delay);
    });
    return "Worker recieved a message from Main " + delay + "ms ago.";
  }
});
~~~

~~~typescript
// demo.main.ts
import { WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

demoWorker.execute("pingLater", [], 1000).promise.then((res) => {
  console.log(res.data);
});
~~~

## 调用 Action

在 `Main` 中执行 `WorkerHandle` 实例的 `excute()` 会与 `Worker` 产生一个连接，并执行一个 `Action`。

`excute()` 接收的第三个以后的参数会按顺序传递给 `Worker` 中对应的 `Action`。

第二个参数可以接收一个连接配置选项对象，包含 `transfer` 和 `timeout` 两个属性：

- `transfer` 是一个会被转移所有权到 `Worker` 中的的[可转移对象](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects)数组。
- `timeout` 是本次连接的超时时间。超时后该连接将会被关闭，不会再收到任何响应，且 `Action` 返回的 `Promise` 将转变为 `rejected` 状态。

也可以简化传参：

- 如果只需要使用 `transfer`，可以直接传入一个数组。
- 如果只需要使用 `timeout`，可以直接传入一个数字。
- 如果都不需要开启，那么可以传入以下任意值：`null`、`undefined`、`[]`、小于或等于 `0` 的任何数字。

## 消息响应

`Action` 支持以 `Promise` 或 `EventTarget` 形式响应消息到 `Main` 中，并且这两种形式可以在同一个 `Action` 中使用。

`Promiose` 形式的消息响应适用于一次请求对应唯一一条响应，或该响应会作为该请求中最后一条响应的情况。

`EventTarget` 形式的消息响应适用于一次请求会得到多条响应的情况。

### Promise 形式

`Action` 中可以用函数返回值，或调用 `this.end()` 这两种方式以 `Promise` 形式响应消息。

函数返回值的方式适合当 `Action` 中所有逻辑执行完毕后再做出响应的情况，且可以在箭头函数中使用。

`this.end()` 方式适合 `Action` 在发出响应后仍需要继续执行的情况，或需要在 `Action` 中的回调函数中发出响应的情况，不支持在箭头函数中使用。

#### 使用函数返回值

在 `Action` 中返回一个 `Promise`，如上面<a href="#basic-example" target="_self">基础示例</a>所示。

如果需要传递 `transfer`，则需要将异步返回值定义为 `[messageData, [...transferable]]` 的形式，例如：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  getOffscreenCanvas: () => ActionResult<OffscreenCanvas>;
};

onmessage = createOnmessage<DemoActions>({
  async getOffscreenCanvas() {
    const offscreen = new OffscreenCanvas(0, 0);
    // 将 offscreen 作为 transfer 传递，之后它在 Worker 中处于 detached 状态，无法再对其进行操作
    return [offscreen, [offscreen]];
  },
});
~~~

~~~typescript
// demo.main.ts
import { WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

demoWorker.execute("getOffscreenCanvas").promise.then((res) => {
  console.log(res.data); // offscreen 被转移到了 Main 中
});
~~~

❗**注意**：为了兼容要传递 `transfer` 的情况下的写法，如果要传递的消息数据本身是数组，则必须将其以 `[messageData, [...transferable]]` 的形式传递，无论是否需要传递 `transfer`，例如：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  getRandomNumsInArray: (amount: number) => ActionResult<number[]>;
};

onmessage = createOnmessage<DemoActions>({
  async getRandomNumsInArray(amount) {
    const numsArr = [];
    for (let i = 0; i < amount; i++) {
      numsArr.push(Math.round(Math.random() * 100));
    }
    // 如果这里返回的是 numsArr，则 TS 类型检测不会通过
    return [numsArr, []];
  },
});
~~~

#### 使用 this.end()

在 `Action` 中调用 `this.end()` 也可以将消息以 `Promise` 的形式传递给 `Main`。

`this.end()` 接收的第一个参数是要传递的消息数据，可选第二个参数是要转移的 `transfer`。

❗**注意**：这种情况下 `Action` 不能使用箭头函数定义。

一旦 `Action` 中的 `this.end()` 被正确地调用，则会立刻将 `Main` 中收到的对应 `Promise` 的状态转变为 `fulfilled`，之后 `Action` 中的代码仍会执行，但是该次请求的连接已关闭，不会再发出任何响应（包括 `EventTarget` 形式的响应），即使最后 `return` 了其它内容也会被无视。

这种 `Promise` 响应方式更适合 `Action` 在发出响应后仍需要继续执行的情况，或需要在 `Action` 中的回调函数中发出响应的情况。

比如上面的 <a href="#ts-example" target="_self">Typescript 示例</a>中，`pingLater Action` 实际上更适合使用这种方式响应消息：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

export type DemoActions = {
  // 这里返回值类型被定义为 ActionResult<string | void>，表示传递的消息类型应为 string，并且该异步函数可能不会显式地返回一个值
  pingLater: (delay: number) => ActionResult<string | void>;
};

onmessage = createOnmessage<DemoActions>({
  async pingLater(delay) {
    setTimeout(() => {
      this.end("Worker recieved a message from Main " + delay + "ms ago.");
    }, delay);
  }
});
~~~

### EventTarget 形式

在 `Action` 中调用 `this.post()` 可以将消息以 `EventTarget` 形式传递给 `Main`。

`post()` 接收的第一个参数是要传递的消息数据，可选第二个参数是要转移的 `transfer`。

❗**注意**：这种情况下 `Action` 不能使用箭头函数定义。

一旦 `Action` 中的 `this.post()` 被正确地调用，则会立刻触发 `Main` 中收到的对应 `MessageSource`（它拓展了类似 [EventTarget](https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget) 中的方法） 的 `message` 事件。通过设置 `onmessage` 回调或使用 `addEventListener()` 监听 `MessageSource` 的 `message` 事件可以接收到该消息。如果需要同时获取 `Promise` 形式的消息，则推荐使用 `addEventListener()` 的方式监听，`MessageSource.addEventListener()` 会将 `MessageSource` 自身返回，可以方便地链式调用再获取到 `Promise`。以下是一个同时使用 `EventTarget` 和 `Promise` 形式响应消息的示例：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

export type DemoActions = {
  // EventTarget 形式传递的消息类型也通过 Action 的返回值类型定义，ActionResult<string | void> 表示传递的消息类型是 string，并且该异步函数可能不会显式地返回一个值
  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string | void>;
};

// 调用 pingInterval() 后，每隔 interval 毫秒就会发送一次 EventTarget 形式的消息，在 duration 毫秒后会发送 Promise 形式的消息并关闭请求连接
onmessage = createOnmessage<DemoActions>({
  async pingInterval(interval, isImmediate, duration) {
    let counter = 0;
    const genMsg = () => "ping " + ++counter;
    if (isImmediate) this.post(genMsg());
    const intervalId = setInterval(() => {
      this.post(genMsg());
    }, interval);
    setTimeout(() => {
      clearInterval(intervalId);
      this.end("no longer ping");
    }, duration);
  }
});
~~~

~~~typescript
// demo.main.ts
import { WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

demoWorker
  .execute("pingInterval", [], 1000, false, 5000) // execute() 执行后会返回一个 MessageSource
  .addEventListener("message", (e) => {
    console.log(e.data);
  }) // 如果使用 addEventListener() 的方式监听 MessageSource，则会将 MessageSource 本身再次返回，使得可以链式调用
  .promise.then((res) => {
    console.log(res.data);
  });
~~~

## API

### worker-handler/main

#### WorkerHandler

构造函数：

`WorkerHandler` 构造函数接收一个 `Worker` 实例。或者如果环境中能够提供打包后 `Worker` 脚本的路径的 `string` 或 `URL`，则可以将它们传入。返回一个 `WorkerHandler` 实例。

实例方法：

- `execute()`：

  执行后会开启一个连接，并调用 `Worker` 中对应的 `Action`。

  参数：

  - `actionName`：

    要调用的 `Action` 名称。

  - `options`：

    执行 `Action` 的选项参数。

    完整写法是传入一个对象，包含 `transfer` 和 `timeout` 属性：

    - `transfer` 是一个会被转移所有权到 `Worker` 中的的[可转移对象](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects)数组。如果 `payload` 中存在，则必须将这些可转移对象全部传入到 `transfer` 数组中。
    - `timeout` 是一个数字，表示本次连接的超时时间的毫秒数。超时后该连接将会被关闭，不会再收到任何响应，且 `Action` 返回的 `Promise` 将转变为 `rejected` 状态。小于或等于 `0` 的数字表示不设置超时时间。

    如果 `transfer` 和 `timeout` 只需要生效一项，则可以将要生效的值直接传给 `options`。

    如果 `transfer` 和 `timeout` 都不需要生效，那么当不需要传递 `payload` 的情况下可以直接不穿值，否则可以传入以下任意值：`null`、`undefined`、`[]`、小于或等于 `0` 的任何数字。

  - ...`payload`：

    `Action` 执行时需要的参数，按顺序传值。

  返回值：

  一个 `MessageSource` 对象。

- `terminate()`

  执行后会立即终止 `Worker` 的行为。

#### MessageSource

`MessageSource` 对象用于接收 `Action` 的响应消息。

属性：

- `promise`：

  一个 `Promise` 对象。

  当 `Action` 中发出了终止响应时，`promise` 会转变为 `fulfilled` 状态并接收响应消息。

  当 `Action` 中抛出错误或 `Action` 发出的终止响应消息无法被结构化克隆时，`proise` 会转变为 `rejected` 状态并接收错误信息。

  当 `promise` 状态转变时，连接被关闭，`Action` 不会再发出的任何响应消息（包括非终止响应消息）。

- `onmessage`：

  当 `Action` 发出的非终止响应消息时会被调用的回调函数。

  接收一个参数 `e`，通过 `e.data` 可以接收到 `Action` 发出的非终止响应消息。

- `onmessageerror`：

  当 `Action` 发出的非终止响应消息无法被结构化克隆时会被调用的回调函数。

  在 `typescript` 中，由于在类型检测时就会发现这种情况，因此基本上不需要监听 `messageerror` 事件。

- `readyState`:

  一个表示当前连接状态的数字：

  - `0` 代表 `connecting`，表示正在连接中；
  - `1` 代表 `open`，表示连接处于开启状态。
  - `2` 代表 `closed`，表示连接处于关闭状态。

方法：

- `addEventListener()`

  添加事件监听器，可以监听的事件有 `message` 和 `messageerror`。

  在 `EventTarget.addEventListener()` 的基础上进行了扩展，调用后会返回对应的 `MessageSource` 对象。

### worker-handler/worker

#### createOnmessage()

将 `Actions` 定义到一个对象中，传递给 `createOnmessage()` 调用后，返回一个对 `Worker` 的 `message` 事件的监听函数。

`Action` 中使用 `this.post()` 发送非终止响应，使用 `this.end()` 或通过返回值发送终止响应。

#### ActionResult

`ActionResult` 是一个表示 `Action` 返回值的类型。需要传入一个表示要传递的响应消息类型的泛型参数，最终会返回一个 `Promise` 类型。

定义 `Action` 类型时，需要使用 `ActionResult` 来生成返回值类型。

传入的泛型参数同时会影响到 `Action` 中 `this.post()` 和 `this.end()` 接收的参数类型。

如果 `Action` 不需要显式返回一个值，则传入的泛型参数需要包含 `void`，如 `ActionResult<string | void>`。
