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

`worker-handler` 具有 `typescript` 类型支持。一旦定义了 `Action` 的类型，就可以使得在 `Main` 和 `Worker` 之间传递消息时在发送端和接收端都能得到类型检测和提示。

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

demoWorker.execute("pingLater", null, 1000).promise.then((res) => {
  console.log(res.data);
});
~~~

## 调用 Action

在 `Main` 中执行 `WorkerHandle` 实例的 `excute()` 会与 `Worker` 产生一个连接，并执行一个 `Action`。

`excute()` 接收的第三个以后的参数都是 `payload`，会按顺序传递给 `Worker` 中对应的 `Action`。

第二个参数的完整形式是一个连接配置选项对象，包含 `transfer` 和 `timeout` 两个属性：

- `transfer` 是一个会被转移所有权到 `Worker` 中的的[可转移对象](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects)数组，用来指定 `payloads` 中需要转移的可转移对象。

  如果不指定该属性，则 `payloads` 中的可转移对象全部会被自动识别并放入到 `transfer` 数组中。

  如果不需要转移任何对象，则将 `transfer` 设置为 `[]`。

- `timeout` 是本次连接的超时时间。

  超时后该连接将会被关闭，不会再收到任何响应，且 `Action` 返回的 `Promise` 将转变为 `rejected` 状态。

也可以简化传参：

- 如果只需要使用 `transfer`，可以直接传入一个数组。
- 如果只需要使用 `timeout`，可以直接传入一个数字。
- 如果都不需要开启，那么可以传入以下任意值：`null`、`undefined`、小于或等于 `0` 的任何数字。

## 消息响应

`Action` 支持以 `Promise` 或 `EventTarget` 形式响应消息到 `Main` 中，并且这两种形式可以在同一个 `Action` 中使用。

`Promiose` 形式的消息响应适用于一次请求对应唯一一条响应，或该响应会作为该请求中最后一条响应的情况。

`EventTarget` 形式的消息响应适用于一次请求会得到多条响应的情况。

### Promise 形式（终止响应）

`Action` 中可以用函数返回值，或调用 `this.$end()` 这两种方式以 `Promise` 形式响应消息。

#### 使用函数返回值

在 `Action` 中返回一个 `Promise`，如上面<a href="#basic-example" target="_self">基础示例</a>所示。

如果 `return` 的数据中包含[可转移对象](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects)，那么当 `Action` 执行时它们会被自动识别并被转移，例如：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  getOffscreenCanvas: () => ActionResult<OffscreenCanvas>;
};

onmessage = createOnmessage<DemoActions>({
  async getOffscreenCanvas() {
    const offscreen = new OffscreenCanvas(0, 0);
    // offscreen 会被转移到 Main 中，之后它在 Worker 中处于 detached 状态，无法对其进行操作
    return offscreen;
  },
});
~~~

~~~typescript
// demo.main.ts
import { WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

demoWorker.execute("getOffscreenCanvas").promise.then((res) => {
  console.log(res.data); 
});
~~~

#### <span id="this_end">使用 this.$end()</span>

在 `Action` 中调用 `this.$end()` 也可以将消息以 `Promise` 的形式传递给 `Main`。

`this.$end()` 接收的第一个参数是要传递的消息数据，可选第二个参数是指定要转移的 `transfer`（如果不指定，那么会自动识别消息中的所有可转移对象作为 `transfer`）。

❗**注意**：这种情况下 `Action` 不能使用箭头函数定义。

一旦 `Action` 中的 `this.$end()` 被正确地调用，则会立刻将 `Main` 中收到的对应 `Promise` 的状态转变为 `fulfilled`，之后 `Action` 中的代码仍会执行，但是该次请求的连接已关闭，不会再发出任何响应（包括 `EventTarget` 形式的响应），即使最后 `return` 了其它内容也会被无视。

这种 `Promise` 响应方式更适合 `Action` 在发出响应后仍需要继续执行的情况，或需要在 `Action` 中的回调函数中发出响应的情况。

比如上面的 <a href="#ts-example" target="_self">Typescript 示例</a>中，`pingLater Action` 实际上更适合使用这种方式响应消息：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

export type DemoActions = {
  pingLater: (delay: number) => ActionResult<string>;
};

onmessage = createOnmessage<DemoActions>({
  async pingLater(delay) {
    setTimeout(() => {
      this.$end("Worker recieved a message from Main " + delay + "ms ago.");
    }, delay);
  }
});
~~~

#### 两种发送终止响应方式的对比

使用函数返回值：

- 简洁方便，且支持在箭头函数中使用。

- 具有以下限制：

  - 一旦使用 `return` 之后，`action` 将不会再执行；

  - 无法在 `action` 内部的回调函数中使用；

  - 只能自动识别，无法手动指定要转移的可转移对象。

使用 `this.$end()`：

- 灵活匹配各种场景，体现在：

  - 使用 `this.$end()` 后，`action` 仍可以执行，只是无法再发送响应；
  
  - 可以在 `action` 内部的回调函数中使用；
  
  - 既可以自动识别，也可以手动指定要转移的可转移对象。
  
- 不支持在箭头函数中使用。

#### 响应空数据

为了兼容通过调用 <a href="#this_end" target="_self">this.\$end()</a> 或 <a href="#this_post" target="_self">this.\$post()</a> 进行响应的方式，当在 `Action` 中没有显式地返回一个值，或返回的 `Promise` 中的数据为 `undefined` 时，`Main` 中接收到的对应的 `Promise` 的状态不会受到 `Action` 返回的 `Promise` 的影响。这是为了在不需要使用函数返回值进行响应时，将响应的权限交给 `this.$end()` 和 `this.$post()`。

如果一个 `Action` 不需要以 `Promise` 形式响应任何数据，但是需要让 `Main` 知道该 `Action` 已经执行完毕，那么可以使用以下两种做法：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

export type DemoActions = {
  returnNull: () => ActionResult<null>;
};

onmessage = createOnmessage<DemoActions>({
  async returnNull() {
    // ...
    return null
  }
});
~~~

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

export type DemoActions = {
  returnVoid: () => ActionResult;
};

onmessage = createOnmessage<DemoActions>({
  async returnVoid() {
    // ...
    this.$end();
  }
});
~~~

### <span id="this_post">EventTarget 形式（非终止响应）</span>

在 `Action` 中调用 `this.$post()` 可以将消息以 `EventTarget` 形式传递给 `Main`。

`$post()` 接收的第一个参数是要传递的消息数据，可选第二个参数是要转移的 `transfer`（如果不指定，那么会自动识别消息中的所有可转移对象作为 `transfer`）。

❗**注意**：这种情况下 `Action` 不能使用箭头函数定义。

一旦 `Action` 中的 `this.$post()` 被正确地调用，则会立刻触发 `Main` 中收到的对应 `MessageSource`（它拓展了类似 [EventTarget](https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget) 中的方法） 的 `message` 事件。通过设置 `onmessage` 回调或使用 `addEventListener()` 监听 `MessageSource` 的 `message` 事件可以接收到该消息。如果需要同时获取 `Promise` 形式的消息，则推荐使用 `addEventListener()` 的方式监听，`MessageSource.addEventListener()` 会将 `MessageSource` 自身返回，可以方便地链式调用再获取到 `Promise`。以下是一个同时使用 `EventTarget` 和 `Promise` 形式响应消息的示例：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  // EventTarget 形式传递的消息类型也通过 Action 的返回值类型定义
  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string>;
};

// 调用 pingInterval() 后，每隔 interval 毫秒就会发送一次 EventTarget 形式的消息，在 duration 毫秒后会发送 Promise 形式的消息并关闭请求连接
onmessage = createOnmessage<DemoActions>({
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

demoWorker
  .execute("pingInterval", [], 1000, false, 5000) // execute() 执行后会返回一个 MessageSource
  .addEventListener("message", (e) => {
    console.log(e.data);
  }) // 如果使用 addEventListener() 的方式监听 MessageSource，则会将 MessageSource 本身再次返回，使得可以链式调用
  .promise.then((res) => {
    console.log(res.data);
  });
~~~

## <span id="Worker_Proxy">传递无法被结构化克隆的消息</span>

从 `worker-handler v0.2.0` 开始，在支持 [Proxy](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Proxy) 的环境中，可以传递无法被[结构化克隆算法](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)处理的消息。

如果 `Worker` 发送给 `Main` 的数据无法被结构化克隆，那么在 `Main` 中会创建一个引用了该数据的 `Proxy` （以下成为 `Worker Proxy`）作为接收到的数据：

- 可以在 `Main` 中操作 `Worker Proxy` ，`Worker Proxy` 会将这些操作同步给其引用的数据。
- `Worker Proxy` 目前实现的捕获器有：`get`、`set`、`apply`、`construct`。
- 由于消息传递是异步的，因此 `get`、`apply`、`construct` 这些会返回结果操作会返回一个 `promise-like` 的新的 `proxy` 对象，表示操作的结果。在支持 `await` 语法的环境中，在对该 `Proxy` 进行（除了 `set` 的）操作前加上 `await` 即可模拟对其引用的数据的操作。

示例：

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  returnUncloneableData: () => ActionResult<{
    f: () => string;
    count: number;
    increase: () => void;
    Person: typeof Person;
    layer1: { layer2: string; f: () => string };
  }>;
};

class Person {
  constructor(public name: string) {}
}

onmessage = createOnmessage<DemoActions>({
  async returnUncloneableData() {
    const data = {
      f: () => "result of data.f()",
      count: 0,
      increase() {
        this.count++;
      },
      Person,
      layer1: { layer2: "nested value", f: () => "result of data.layer1.f()" },
    };
    return data
  },
});
~~~

~~~typescript
// demo.main.ts
import { WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

async function init() {
  const { data } = await worker.execute("returnUncloneableData").promise;

  console.log(await data.f()); // "result of data.f()"

  const person = await new data.Person("zzc6332");
  console.log(await person.name); // "zzc6332"

  console.log(await data.count); // 0
  await data.increase();
  console.log(await data.count); // 1

  console.log(await data.layer1.layer2); // "nested value"
  console.log(await data.layer1.f()); // "result of data.layer1.f()"
  
  // 由于 set 操作不需要返回结果，因此前面不加 await
  data.layer1.layer2 = "Hello Proxy!";
  console.log(await data.layer1.layer2); // "Hello Proxy!"
}

init();
~~~

`Worker Proxy` 可以传递给 `execute()` 的 `payloads` 参数，或通过其它 `Worker Proxy` 调用的方法的参数，这样在 `Worker` 中接收到的将是 `Worker Proxy` 引用的原始数据。

## API

### worker-handler/main

#### WorkerHandler

构造函数：

- `WorkerHandler` 构造函数接收一个 `Worker` 实例。或者如果环境中能够提供打包后 `Worker` 脚本的路径的 `string` 或 `URL`，则可以将它们传入。返回一个 `WorkerHandler` 实例。

实例方法：

- `execute()`：

  执行后会开启一个连接，并调用 `Worker` 中对应的 `Action`。

  参数：

  - `actionName`：

    要调用的 `Action` 名称。

  - `options`：

    执行 `Action` 的选项参数。

    完整形式是传入一个对象，包含 `transfer` 和 `timeout` 属性：

    - `transfer` 是一个会被转移所有权到 `Worker` 中的的[可转移对象](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects)数组，用来指定 `payloads` 中需要转移的对象。

      如果不指定该属性，则 `payloads` 中的可转移对象全部会被自动识别并放入到 `transfer` 数组中。

      如果不需要转移任何对象，则将 `transfer` 设置为 `[]`。

    - `timeout` 是一个数字，表示本次连接的超时时间的毫秒数。

      超时后该连接将会被关闭，不会再收到任何响应，且 `Action` 返回的 `Promise` 将转变为 `rejected` 状态。

      小于或等于 `0` 的数字表示不设置超时时间。

    如果 `transfer` 和 `timeout` 只需要生效一项，则可以将要生效的值直接传给 `options`。

    如果 `transfer` 和 `timeout` 都不需要生效，那么当不需要传递 `payload` 的情况下可以直接不穿值，否则可以传入以下任意值：`null`、`undefined`、小于或等于 `0` 的任何数字。

  - ...`payloads`：

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

  当 `Action` 中抛出错误或 `Action` 发出的终止响应消息无法被结构化克隆，且当前环境不支持 `Proxy` 时，`proise` 会转变为 `rejected` 状态并接收错误信息。

  当 `promise` 状态转变时，连接被关闭，`Action` 不会再发出的任何响应消息（包括非终止响应消息）。

- `onmessage`：

  当 `Action` 发出的非终止响应消息时会被调用的回调函数。

  接收一个参数 `e`，通过 `e.data` 可以接收到 `Action` 发出的非终止响应消息。

- `onmessageerror`：

  当 `Action` 发出的非终止响应消息无法被结构化克隆，且当前环境不支持 `Proxy` 时，会被调用的回调函数。

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

`Action` 中使用 `this.$post()` 发送非终止响应，使用 `this.$end()` 或通过返回值发送终止响应。

#### ActionResult

`ActionResult` 是一个表示 `Action` 返回值的类型。需要传入一个表示要传递的响应消息类型的泛型参数，最终会返回一个 `Promise` 类型。

定义 `Action` 类型时，需要使用 `ActionResult` 来生成返回值类型。

传入的泛型参数同时会影响到 `Action` 中 `this.$post()` 和 `this.$end()` 接收的参数类型。

如果不传递任何泛型参数，则等同于 `ActionResult<void>`。

## 重大变更

### `v0.2.0`

- <a href="#Worker_Proxy" target="_self">在支持 Proxy 的环境中，可以传递无法被结构化克隆算法处理的消息。</a>

- 传递消息时，如果没有指定 `transfer` 选项，那么将自动从消息中识别所有的可转移对象放入到 `transfer` 中。

- 在 `Action` 中通过返回值发送终止响应时，取消在 `v0.1.x` 版本中 `[messageData, [...transferable]]` 的返回形式，这意味着如果响应的数据是一个数组，也可以直接将它返回。如果响应的数据中存在可转移对象，那么它们会被自动识别并转移。

  这是因为，如果使用 `$this.end()` 形式发送终止响应，可以更直观地指定 `transfer`，并且使用返回值形式能做到的，使用 `$this.end()` 都能做到。因此简化了返回值形式的使用方式，使得在一些场景下可以更方便地使用返回值形式发送终止响应。

- `ActionResult<Data>`  等同于 `v0.1.x` 版本中的 `ActionResult<Data | void>`。

