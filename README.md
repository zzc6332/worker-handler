# worker-handler

<div style="text-align: center;">
    <span style="font-weight:bold;">English</span> | <a href="./README-zh_CN.md">简体中文</a> 
</div>

## OvewrView

`Worker-handler` provides a convenient capability for posting messages between the `Main` thread and the `Worker` thread when using `Web Worker` in javascript or typescript.

Through `worker-handler`, in `Main`, messages can be posted to and recieved from `Worker` just like network requests. `Actions` for handling these "requests" can be defined within `Worker`. There are two ways to obtain "responses": they can be acquired through `Promise`, which is similar to [AJAX](https://developer.mozilla.org/en-US/docs/Glossary/AJAX), or through `EventTarget`, which is similar to [Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events), and both ways of response can be used simultaneously in the same request.

## Quick Start

### Install

~~~sh
npm install worker-handler
~~~

### Basic Usage

<span id="basic-example">The following example demonstrates the most basic usage of `worker-handler`:</span>

~~~javascript
// demo.worker.js
import { createOnmessage } from "worker-handler/worker";

// Call `createOnmessage` with `Actions` to get the `onmessage` callback of worker.
onmessage = createOnmessage({
  // Defining the `Action` with a async function is recommended if only responsing messages by `Promise`.
  async someAction() {
    // Any asynchronous process can be excuted in Actions.
    ......
    // The value returned in the asynchronous `Action` will be posted to Main as the response message through `Promise`.
    return "some messages";
  }
});
~~~

~~~javascript
// demo.main.js
import { WorkerHandler } from "worker-handler"; // It can also be imported from "worker-handler/main".

// import workerUrl from "./demo.worker.ts?worker&url"; // in vite
// import workerInstance from "./demo.worker.ts?worker"; // in vite

const demoWorker = new WorkerHandler(
  // In Vite, workerUrl or workerInstance can also be used as the parameter.
  new Worker(new URL("./demo.worker.js", import.meta.url)) // In webpack5, create an instance of Worker in this way.
);

// Request `Worker` to execute someAction.
demoWorker.execute("someAction", []).promise.then((res) => {
  // Receive the message responded through `Promise` from the `Action`.
  console.log(res.data);
}).catch((err) => {
  //  Errors occurring in the `Action` will cause the `Promise` to be rejected.
  console.log(err)
});
~~~

## Typescript

`Worker-handler` can be used with type supports in typescript. Once the type of `Action` is defined, it enables type detections and hints at both the posting and reveiving ends when passing messages between `Main` and `Worker`. It also be able to detect whether the passed message can be processed by [the structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), and whether there are [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) contained in the message.

<span id="ts-example">The following is a simple example of using `worker-handler` in typescript:</span>

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

/* 
 * Define the types for `Actions`, which will subsequently be passed as generic parameters in two places:
 * - When using `createOnmessage()` in `Worker`.
 * - When using `new WorkerHandler()`` in `Main`.
*/
export type DemoActions = {
  // Define an `Action` named `pingLater`, whose return type `ActionResult<string>` indicates that this `Action` can pass a message of string type to Main.
  pingLater: (delay: number) => ActionResult<string>;
};

onmessage = createOnmessage<DemoActions>({
  // After being called, `pingLater` will pass the message to Main after `delay` ms.
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

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

demoWorker.execute("pingLater", [], 1000).promise.then((res) => {
  console.log(res.data);
});
~~~

## Call `Action`

Calling `excute()` of a `WorkerHandle` instance in `Main` will create a connection with `Worker` and call an `Action`.

The parameters received by `excute()` from the third one onwards will be passed to the target `Action` in `Worker` in order.

The second parameter can accept an object about connection configuration option, which contains two properties: `transfer` and `timeout`:

- The value of `transfer` is an array of [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) whose ownership will be transferred to `Worker`.
- The value of `timeout` is the timeout duration for this connection. After the timeout, the connection will be closed, no further responses will be received, and the `Promise` returned by `Action` will become `rejected`.

Parameter passing can also be simplified according to follow situations:

- If only `transfer` is needed, an array can be directly passed.
- If only `timeout` is needed, a number can be directly passed.
- If neither is needed, any of the following values can be passed: `null`, `undefined`, `[]`, or any number less than or equal to `0`.

## Responding Messages

`Actions` support responding with messages to `Main` through either `Promise` or `EventTarget`, and both ways can be used within the same `Action`.

Responding through `Promise` is suitable for situations where one request corresponds to a unique response, or that response will be the last response in the request.

Responding through `EventTarget` is suitable for situations where one request will recieve multiple responses.

### Responding through `Promise`

In `Actions`, you can respond to messages through `Promise` either by using return value of the `Action` or by calling `this.end()`.

Using return value of the `Action` is suitable when the response should be made after the `Action` has been totally executed , and it can be used in arrow functions.

Calling `this.end()` is suitable for situations where the `Action` needs to continue executing after making a response, or when a response needs to be made within a callback function within the `Action`. But it does not support use in arrow functions.

#### Using return value of the `Action`

Return a `Promise` in an `Action`，as shown in the <a href="#basic-example" target="_self">basic example</a>.

If a `transfer` needs to be passed, the asynchronous return value should be defined in the form of `[messageData, [...transferable]]`, for example:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  getOffscreenCanvas: () => ActionResult<OffscreenCanvas>;
};

onmessage = createOnmessage<DemoActions>({
  async getOffscreenCanvas() {
    const offscreen = new OffscreenCanvas(0, 0);
    // Pass the `offscreen` as a `transfer`, after which it is detached in `Worker` and cannot be operated on anymore.
    return [offscreen, [offscreen]];
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
  console.log(res.data); // The `offscreen` has been transferred to `Main`.
});
~~~

❗**Note**: For compatibility with the situations when passing `transfer`, if the message data to be passed is an array, it must be passed in the form of `[messageData, [...transferable]]`, even if there is no `transfer` needs to be passed, for example:

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
    // Typescript type detection will not pass if content in this line is "return numsArr".
    return [numsArr, []];
  },
});
~~~

#### Calling `this.end()`

Calling `this.end()` within `Action` can also pass the message to `Main` through `Promise`.

The first parameter that `end()` receives is the message data to be passed, and the optional second parameter is `transfer`.

❗**Attention**: The `Action` cannot be defined as an arrow function if `this.end()` needs to be called.

Once `this.end()` is called correctly in the `Action`, it will immediately change the state of the corresponding `Promise` received in `Main` to `fulfilled`. After that, the `Action` will continue to execute, but the connection for the "request " will have been closed, and no further responses will be made (including responses through `EventTarget`). And the return value of the `Action` will be ignored.

It is more suitable for situations where `Action` needs to continue executing after making a response, or where a response needs to be made when excuting a callback function in `Action`.

For instance, in the <a href="#ts-example" target="_self">Typescript example above</a>, the `pingLater Action` is actually more suited to respond messages by calling `this.end()`:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler-test/worker";

export type DemoActions = {
  // The return type is defined as `ActionResult<string | void>` here, which means that the message type passed should be `string`, and this asynchronous function may not return a value explicitly.
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

### Responding through `EventTarget`

Calling `this.post()` within `Action` can pass the message to `Main` through `EventTarget`.

The first parameter that `end()` receives is the message data to be passed, and the optional second parameter is `transfer`.

❗**Attention**: The `Action` cannot be defined as an arrow function if `this.post()` needs to be called.

Once `this.post()` is called correctly in the `Action`, it will immediately trigger the `message` event of the corresponding `MessageSource` (which extends methods similar to those in [EventTarget](https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget)) recieved in `Main`. The message can be received by setting the `onmessage` callback or by using `addEventListener()` to listen for the `message` event of `MessageSource`. If you need to receive the message through `Promise` as well, using `addEventListener()` it is recommended. `MessageSource.addEventListener()` will return `MessageSource` itself, allowing for convenient chaining to obtain the `Promise`. Below is an example of responding with messages through both `EventTarget` and `Promise`:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  // The type of the message which is passed through the `EventTarget` is also defined by the return type of the `Action`, `ActionResult<string | void>` means that the message type should be a string, and this asynchronous function may not return a value explicitly.
  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string | void>;
};

// After calling `pingInterval()`, a message will be posted every `interval` ms through `EventTarget`, and after `duration` ms, a message will be posted through `Promise` and the request connection will be closed.
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

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

demoWorker
  .execute("pingInterval", [], 1000, false, 5000) // A `MessageSource` will be obtained as the return value of `execute()`.
  .addEventListener("message", (e) => {
    console.log(e.data);
  })
// If you use `addEventListener()` to listen for the `MessageSource`, it will return the `MessageSource` itself, allowing chaining calls.
  .promise.then((res) => {
    console.log(res.data);
  });
~~~

## API

### worker-handler/main

#### WorkerHandler

Constructor:

The `WorkerHandler` constructor receives an instance of `Worker`. Alternatively, if the environment can provide a `string` or `URL` representing the path to the bundled `Worker` script, it can be passed in. The constructor returns an instance of `WorkerHandler`. 

Instance methods:

- `execute()`:

  The `execute()` method will open a connection and call the target `Action` in `Worker`. 

  Parameters:

  - `actionName`:

    The name of the target `Action` to be called.

  - `options`:

    The options for calling the `Action`.

    The complete form of `options` is an object that includes the `transfer` and the `timeout` properties:

    - The value of `transfer` is an array of [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) that will have their ownership transferred to the `Worker`. If there are any transferable objects in the `payload`, they must all be passed into the `transfer` array.
    - The value of `timeout` is a number of milliseconds representing the timeout duration for this connection. After the specified timeout, the connection will be closed, no further responses will be received, and the `Promise` returned by the `Action` will become `rejected`. A number less than or equal to `0` means no timeout.

    If only one of `transfer` or `timeout` needs to take effect, you can directly pass the  value of the one you need to the `options`.

    If neither `transfer` nor `timeout` needs to take effect, you can omit the values when not passing any `payload`. Otherwise, you can pass any of the following values: `null`, `undefined`, `[]`, or any number less than or equal to `0`. 

  - ...`payload`:

    The parameters required for the calling of the target `Action`, passed in sequence.

  Return value:

  A `MessageSource`.

- `terminate()`

  The `terminate()` method will immediately terminate the `Worker`.

#### MessageSource

`MessageSource` is used to receive response messages from `Action`.

Properties:

- `promise`:

  A `Promise` object.

  When a terminating response is made in `Action`, the `promise` will become `fulfilled` and receive the response message.

  If an error is thrown in `Action` or the terminating response message made by `Action` cannot be structured cloned, the `promise` will become `rejected` and receive the error.

  When the `promise` is settled, the connection is closed, and `Action` will not make any more response messages (including non-terminating response messages).

- `onmessage`:

  当 `Action` 发出的非终止响应消息时会被调用的回调函数。

  接收一个参数 `e`，通过 `e.data` 可以接收到 `Action` 发出的非终止响应消息。

  A callback function that is called when `Action` makes a non-terminating response message. 

  It receives a parameter `e`, through which the non-terminating response message made by `Action` can be accessed via `e.data`.

- `onmessageerror`:

  A callback function that is called when the non-terminating response message made by `Action` cannot be structured cloned.

  In `typescript`, this situation is usually detected during type checking, so there is generally no need to listen for the `messageerror` event.

- `readyState`:

  A number representing the current state of the connection :

  - `0` — `connecting`, 
  - `1` — `open`,
  - `2` —`closed`.

Methods:

- `addEventListener()`

  Adds an event listener, which can listen for events such as `message` and `messageerror`.

  It extends `EventTarget.addEventListener()` and returns the corresponding `MessageSource` object after being called.

### worker-handler/worker

#### createOnmessage()

Define `Actions` within an object, which is passed to the `createOnmessage()` when called, and return a listener function for the `message` event of `Worker`.

Use `this.post()` within `Action` to make non-terminating responses, and use `this.end()` or return a value to make terminating responses.

#### ActionResult

`ActionResult` is a type that represents the return value of an `Action`. It requires a generic parameter that specifies the type of response message to be passed, and returns a `Promise` type.

When defining the `Action` type, `ActionResult` is required to generate the type of return value.

The generic parameter passed also affects the types of parameters received by `this.post()` and `this.end()` within the `Action`.

If the `Action` does not need to return a value explicitly, the generic parameter passed should include `void`, such as `ActionResult<string | void>`.

