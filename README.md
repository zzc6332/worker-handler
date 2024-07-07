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

`Worker-handler` can be used with type supports in typescript. Once the type of `Action` is defined, it enables type detections and hints at both the posting and reveiving ends when passing messages between `Main` and `Worker`. 

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

demoWorker.execute("pingLater", null, 1000).promise.then((res) => {
  console.log(res.data);
});
~~~

## Call `Action`

Calling `excute()` of a `WorkerHandle` instance in `Main` will create a connection with `Worker` and call an `Action`.

The parameters received by `excute()` from the third one onwards are all `payloads`, which will be passed to the target `Action` in `Worker` in order.

The second parameter is an object that specifies connection configuration options, which contains two properties named `transfer` and `timeout`:

- The value of `transfer` is an array of [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) that will have their ownership transferred to the `Worker`,  used to specify the `transferable objects` in `payloads` that need to be transferred. 

  If the value of `transfer` is `"auto"`, then the `transferable objects` in `payloads` wil be automatically identified.

- The value of `timeout` is the timeout duration for this connection.

   After the timeout, the connection will be closed, no further responses will be received, and the `Promise` returned by `Action` will become `rejected`.

The passing of the second parameter can also be simplified according to follow situations:

- If only `transfer` is needed, an array can be directly passed.
- If only `timeout` is needed, a number can be directly passed.
- If neither is needed, any of the following values can be passed: `null`, `undefined`, `[]`, any number less than or equal to `0`.

## Responding Messages

`Actions` support responding with messages to `Main` through either `Promise` or `EventTarget`, and both ways can be used within the same `Action`.

Responding through `Promise` is suitable for situations where one request corresponds to a unique response, or that response will be the last response in the request.

Responding through `EventTarget` is suitable for situations where one request will recieve multiple responses.

### Responding through `Promise` (`terminating responses`)

In `Actions`, you can respond to messages through `Promise` either by using return value of the `Action` or by calling `this.$end()`.

#### Using return value of the `Action`

Return a `Promise` in an `Action`，as shown in the <a href="#basic-example" target="_self">basic example</a>.

It should be noted that this method of response cannot transfer `transferable objects`. Objects like `OffscreenCanvas`, which must be transferred to be used in different contexts, cannot be sent to the main thread in this way.

#### <span id="this_end">Calling `this.$end()`</span>

Calling `this.$end()` within `Action` can also pass the message to `Main` through `Promise`.

The first parameter that `$end()` receives is the message data to be passed, and the optional second parameter is `transfer` (If `"auto"`is passed in, it will automatically identify all `transferable objects` in the message as `transfer`).

❗**Attention**: The `Action` cannot be defined as an arrow function if `this.$end()` needs to be called.

Once `this.$end()` is called correctly in the `Action`, it will immediately change the state of the corresponding `Promise` received in `Main` to `fulfilled`. After that, the `Action` will continue to execute, but the connection for the "request " will have been closed, and no further responses will be made (including responses through `EventTarget`). And the return value of the `Action` will be ignored.

It is more suitable for situations where `Action` needs to continue executing after making a response, or where a response needs to be made when excuting a callback function in `Action`.

For instance, in the <a href="#ts-example" target="_self">Typescript example above</a>, the `pingLater Action` is actually more suited to respond messages by calling `this.$end()`:

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

#### Comparison of two ways to send `terminating responses`

Using the function return value:

- It's concise and convenient, and supports use in arrow functions.
- It has following limitations:
  - Once `return` is used, the `action` will not execute further.
  - It cannot be used within the callback functions of `action`.
  - It cannot transfer `transferable objects`.

Using `this.$end()`:

- It can flexibly match various situations, as reflected in:
  - After using `this.$end()`, the `action` can still execute further, but no further responses can be sent.
  - It can be used within the callback functions of `action`.
  - It can transfer `transferable objects`.
- It does not support use in arrow functions.

#### Responding without data

 For compatibility with the way to respond by <a href="#this_end" target="_self">this.\$end()</a> or <a href="#this_post" target="_self">this.\$post()</a>, when no explicit value is returned in `Action`, or the data in the returned `Promise` is `undefined`, the state of the corresponding `Promise` received in `Main` remains unaffected by the `Promise` returned by `Action`. This allows `this.$end()` and `this.$post()` to control the response when there is no need to use the return value of `Action` for responding.

If an `Action` does not need to respond with any data through `Promise`, but needs to inform `Main` that the `Action` has been completed, then the following two ways can be referenced:
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

### <span id="this_post">Responding through `EventTarget` (`nonterminating responses`)</span>

Calling `this.$post()` within `Action` can pass the message to `Main` through `EventTarget`.

The first parameter that `$end()` receives is the message data to be passed, and the optional second parameter is `transfer` (If `"auto"`is passed in, it will automatically identify all `transferable objects` in the message as `transfer`).

❗**Attention**: The `Action` cannot be defined as an arrow function if `this.$post()` needs to be called.

Once `this.$post()` is called correctly in the `Action`, it will immediately trigger the `message` event of the corresponding `MessageSource` (which extends methods similar to those in [EventTarget](https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget)) recieved in `Main`. The message can be received by setting the `onmessage` callback or by using `addEventListener()` to listen for the `message` event of `MessageSource`. If you need to receive the message through `Promise` as well, using `addEventListener()` it is recommended. `MessageSource.addEventListener()` will return `MessageSource` itself, allowing for convenient chaining to obtain the `Promise`. Below is an example of responding with messages through both `EventTarget` and `Promise`:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  // The type of the message which is passed through the `EventTarget` is also defined by the return type of the `Action`.
  pingInterval: (
    interval: number,
    isImmediate: boolean,
    duration: number
  ) => ActionResult<string>;
};

// After calling `pingInterval()`, a message will be posted every `interval` ms through `EventTarget`, and after `duration` ms, a message will be posted through `Promise` and the request connection will be closed.
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
  .execute("pingInterval", [], 1000, false, 5000) // A `MessageSource` will be obtained as the return value of `execute()`.
  .addEventListener("message", (e) => {
    console.log(e.data);
  })
// If you use `addEventListener()` to listen for the `MessageSource`, it will return the `MessageSource` itself, allowing chaining calls.
  .promise.then((res) => {
    console.log(res.data);
  });
~~~

## <span id="Worker_Proxy">Worker Proxy</span>

Starting from `worker-handler v0.2.0`, in environments that support [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy), messages that cannot be handled by the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) is also allowed to be passed.

### Basic Usage

If the data sent by `Worker` to `Main` cannot be structured cloned, then a `Proxy` that references this data (hereinafter referred to as `Worker Proxy`) will be created in `Main` as the received data:

- It is possible to operate on `Worker Proxy` in `Main`, and `Worker Proxy` will update these operations to its referenced data.
- The currently implemented `traps` for `Worker Proxy` are: `get`, `set`, `apply`, `construct`.
- Since message passing is asynchronous, operations that return results such as `get`, `apply`, `construct` will return a new `promise-like` proxy object, representing the result of the operation. In environments that support the `await` syntax, adding `await` before operating on the `Proxy` (except for `set`) can simulate operations on its referenced data. In most cases, if you need to perform chained operations on `Worker Proxy`, you only need to use the `await` keyword once.
- If the data accessed by operating the `Worker Proxy` still cannot be structured cloned, a new `Worker Proxy` referencing that data will be obtained .

For example:

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
import { DemoActions, UnwrapPromise } from "./demo.worker";

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
  
  // The `set` operation of `Worker Proxy` currently does not fully support the type system, so type assertions are required. Either of the following two methods can be chosen: 
  (data.layer1.layer2 as any as UnwrapPromise<
    typeof data.layer1.layer2
  >) = "Hello Proxy!";
  // data.layer1.layer2 = "Hello Proxy!" as any;
  console.log(await data.layer1.layer2); // "Hello Proxy!"
}

init();
~~~

`Worker Proxy` can be used as the `payloads` parameter of `execute()`, or as the parameters of methods called by other `Worker Proxy`. In this way, it will be parsed in the `Worker` as the original data referenced by the `Worker Proxy`.

### <span id="Worker_Array_Proxy">Worker Array Proxy</span>

`Worker Array Proxy` is a special type of `Worker Proxy`. If the data referenced by a `Worker Proxy` is an array, then that `Worker Proxy` is a `Worker Array Proxy`.

Hereafter, the `Worker Array Proxy` will be referred to as `proxyArr`, and the array it references in the `Worker` will be referred to as `ogArr`.

All `Main` examples in this section are based on the following `Worker` example:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  returnUncloneableArr: () => ActionResult<
    { index: number; f: () => string; layer1: { layer2: { index: number } } }[]
  >;
};

onmessage = createOnmessage<DemoActions>({
  async returnUncloneableArr() {
    const ogArr = [0, 1, 2].map((_, index) => ({
      index,
      f: () => "result of index: " + index,
      layer1: { layer2: { index } },
    }));
    return ogArr;
  },
});
~~~

`Worker Array Proxy` is an array-like object that can simulate some behaviors of arrays:

- Accessing the item by index:

  The `Worker Proxy` that references `ogArr[index]` can be accessed through `proxyArr[index]`. For example:

  ~~~typescript
  // demo.main.ts
  import { WorkerHandler } from "worker-handler/main";
  import { DemoActions } from "./demo.worker";
  
  const demoWorker = new WorkerHandler<DemoActions>(
    new Worker(new URL("./demo.worker.ts", import.meta.url))
  );
  
  async function init() {
    const { data: proxyArr } = await worker.execute("returnUncloneableArr").promise;
  
    console.log(await proxyArr[0]); // Worker Proxy
    console.log(await proxyArr[0].index); // 0
    console.log(await proxyArr[0].f()); // "result of index: 0"
    console.log(await proxyArr[0].layer1.layer2.index); // 0
  }
  
  init();
  ~~~

- Getting the length of `proxyArr`:

  The length of the `ogArr` can be accessed through `await proxyArr.length`. For example:

  ~~~typescript
  // demo.main.ts
  import { WorkerHandler } from "worker-handler/main";
  import { DemoActions } from "./demo.worker";
  
  const demoWorker = new WorkerHandler<DemoActions>(
    new Worker(new URL("./demo.worker.ts", import.meta.url))
  );
  
  async function init() {
    const { data: proxyArr } = await worker.execute("returnUncloneableArr").promise;
  
    console.log(await proxyArr.length); // 3
  }
  
  init();
  ~~~

- Iterating over the items of `proxyArr`:

  The `proxyArr` implements an asynchronous iterator (but not a regular iterator), so it can be iterated using the `for await...of` statement. For example:

  ~~~typescript
  // demo.main.ts
  import { WorkerHandler } from "worker-handler/main";
  import { DemoActions } from "./demo.worker";
  
  const demoWorker = new WorkerHandler<DemoActions>(
    new Worker(new URL("./demo.worker.ts", import.meta.url))
  );
  
  async function init() {
    const { data: proxyArr } = await worker.execute("returnUncloneableArr")
      .promise;
  
    for await (const item of proxyArr) {
      console.log(await item.index);
    }
    console.log("Iteration executed by `for await...of` is completed!");
    // --- The console output is as follows: ---
    // 0
    // 1
    // 2
    // "Iteration executed by `for await...of` is completed!"
    // --- The console output is as above. ---
  }
  
  init();
  ~~~

  It can also be iterated by `proxyArr.forEach()`. For example:

  ~~~typescript
  // demo.main.ts
  import { WorkerHandler } from "worker-handler/main";
  import { DemoActions } from "./demo.worker";
  
  const demoWorker = new WorkerHandler<DemoActions>(
    new Worker(new URL("./demo.worker.ts", import.meta.url))
  );
  
  async function init() {
    const { data: proxyArr } = await worker.execute("returnUncloneableArr")
      .promise;
  
    // `proxyArr.forEach()` is executed asynchronously. If you need to wait for the callback function in `forEach()` to complete, you can use the `await` keyword before `forEach()`.
    await proxyArr.forEach(async (item) => {
      console.log(await item.index);
    });
    console.log("Iteration executed by `forEach()` is completed!");
    // --- The console output is as follows: ---
    // 0
    // 1
    // 2
    // "Iteration executed by `forEach()` is completed!"
    // --- The console output is as above. ---
  
    // 如果不使用 await 关键字，那么 forEach() 会晚于之后的同步代码执行
    proxyArr.forEach(async (item) => {
      console.log(await item.index);
    });
    console.log("Iteration executed by `forEach()` has not started!");
    // --- The console output is as follows: ---
    // "Iteration executed by `forEach()` has not started!"
    // 0
    // 1
    // 2
    // --- The console output is as above. ---
  }
  
  init();
  ~~~

- Using other array methods:

  Any method with the same name of array methods can be called by `proxyArr`, and all these methods are executed asynchronously.

  If the return value of the original array method is an array, then the method of  `proxyArr` which has the same name of the array method will also return an actual array. For example, using `proxyArr.map()` can quickly convert proxyArr into an actual array:

  ~~~typescript
  // demo.main.ts
  import { WorkerHandler } from "worker-handler/main";
  import { DemoActions } from "./demo.worker";
  
  const demoWorker = new WorkerHandler<DemoActions>(
    new Worker(new URL("./demo.worker.ts", import.meta.url))
  );
  
  async function init() {
    const { data: proxyArr } = await worker.execute("returnUncloneableArr")
      .promise;
  
    const actualArr = await proxyArr.map((item) => item);
    console.log(actualArr); //  [Worker Proxy, Worker Proxy, Worker Proxy]
  
    // Since `actualArr` is an actual array, it has a regular iterator interface and can be iterated using the `for...of` statement.
    for (const item of actualArr) {
      console.log(await item.index);
    }
    console.log("Iteration executed by `for...of` is completed!")
    // --- The console output is as follows: ---
    // 0
    // 1
    // 2
    // "Iteration executed by `for...of` is completed!"
    // --- The console output is as above. ---
      
    // Note that when using `forEach()` to iterate over an actual array, if the callback function passed in is an asynchronous function, it will not wait for the asynchronous operations in the callback to complete.
    actualArr.forEach(async (item) => {
      console.log(await item.index);
    });
    console.log("Iteration executed by `forEach()` has not started!");
    // --- The console output is as follows: ---
    // "Iteration executed by `forEach()` has not started!"
    // 0
    // 1
    // 2
    // --- The console output is as above. ---
  }
  
  init();
  ~~~

  The `ogArr` can be modified by methods of the corresponding `proxyArr` like `unshift()` or `push()`:

  ~~~typescript
  // demo.main.ts
  import { WorkerHandler } from "worker-handler/main";
  import { DemoActions } from "./demo.worker";
  
  const demoWorker = new WorkerHandler<DemoActions>(
    new Worker(new URL("./demo.worker.ts", import.meta.url))
  );
  
  async function init() {
    const { data: proxyArr } = await worker.execute("returnUncloneableArr")
      .promise;
  
    // Remove an item from the head of `ogArr`.
    console.log(await proxyArr.length); // 3
    const shifted = await proxyArr.shift();
    if (shifted) console.log(await shifted?.index); // 0
    console.log(await proxyArr.length); // 2
      
    for await (const item of proxyArr) {
      console.log(await item.index);
    }
    // --- The console output is as follows: ---
    // 1
    // 2
    // --- The console output is as above. ---
  
    // Insert an item at the tail of `ogArr`.
    if (shifted) console.log(await proxyArr.push(shifted)); // 3
  
    for await (const item of proxyArr) {
      console.log(await item.index);
    }
    // --- The console output is as follows: ---
    // 1
    // 2
    // 0
    // --- The console output is as above. ---
  }
  
  init();
  ~~~

## APIs

### worker-handler/main

#### WorkerHandler

Constructor:

- The `WorkerHandler` constructor receives an instance of `Worker`. Alternatively, if the environment can provide a `string` or `URL` representing the path to the bundled `Worker` script, it can be passed in. The constructor returns an instance of `WorkerHandler`. 

Instance methods:

- `execute()`:

  The `execute()` method will open a connection and call the target `Action` in `Worker`. 

  Parameters:

  - `actionName`:

    The name of the target `Action` to be called.

  - `options`:

    The options for calling the `Action`.

    The complete form of `options` is an object that includes the properties `transfer` and `timeout`:

    - The value of `transfer` is an array of [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) that will have their ownership transferred to the `Worker`,  used to specify the `transferable objects` in `payloads` that need to be transferred. 

      If the value of `transfer` is `"auto"`, then the `transferable objects` in `payloads` wil be automatically identified.

    - The value of `timeout` is a number of milliseconds representing the timeout duration for this connection. 

      After the specified timeout, the connection will be closed, no further responses will be received, and the `Promise` returned by the `Action` will become `rejected`.

       A number less than or equal to `0` means no timeout.

    If only one of `transfer` or `timeout` needs to take effect, you can directly pass the  value of the one you need to the `options`.

    If neither `transfer` nor `timeout` needs to take effect, you can omit the values when not passing any `payload`. Otherwise, you can pass any of the following values: `null`, `undefined`, `[]`, any number less than or equal to `0`. 

  - ...`payloads`:

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

  When a `terminating response` is made in `Action`, the `promise` will become `fulfilled` and receive the response message.

  If an error is thrown in `Action` or the `terminating response` message made by `Action` cannot be structured cloned, and the current environment does not support `Proxy`, the `promise` will become `rejected` and receive the error message.

  When the `promise` is settled, the connection is closed, and `Action` will not make any more response messages (including `non-terminating response` messages).

- `onmessage`:

  A callback function that is called when `Action` makes a `non-terminating response` message. 

  It receives a parameter `e`, through which the `non-terminating response` message made by `Action` can be accessed via `e.data`.

- `onmessageerror`:

  A callback function that is called when the `non-terminating response` message made by `Action` cannot be structured cloned  and the current environment does not support `Proxy`.

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

#### UnwrapPromise

`UnwrapPromise` is an utility type that can accept a `Promise` type or a `PromiseLike` type and can extract the type inside it.

### worker-handler/worker

#### createOnmessage()

Define `Actions` within an object, which is passed to the `createOnmessage()` when called, and return a listener function for the `message` event of `Worker`.

Use `this.$post()` within `Action` to make `non-terminating responses`, and use `this.$end()` or return a value to make `terminating responses`.

#### ActionResult

`ActionResult` is a type that represents the return value of an `Action`. It requires a generic parameter that specifies the type of response message to be passed, and returns a `Promise` type.

When defining the `Action` type, `ActionResult` is required to generate the type of return value.

The generic parameter passed also affects the types of parameters received by `this.$post()` and `this.$end()` within the `Action`.

If no generic parameters are passed, it is equivalent to `ActionResult<void>`.

## Significant Updates

### `v0.2.0`

- <a href="#Worker_Proxy" target="_self">In environments that support Proxy, messages that cannot be handled by the structured clone algorithm can also be passed.</a>

- When passing messages, if the `transfer` option is not specified, all `transferable objects` will be automatically identified from the message and placed into `transfer`.

- When sending a `terminating response` through the return value of `Action`, the return form of `[messageData, [...transferable]]` from version `v0.1.x` is discontinued. This means that if the response data is an array, it can also be returned directly. 

  It is because if using `this.$end()` form to send a `terminating response`, `transfer` can be specified more intuitively, and everything that can be done using the return value form can also be done using `this.$end()`. Therefore, the use of the return value form has been simplified, making it more convenient to use in some situations to send `terminating responses`.

- `ActionResult<Data>` is equivalent to `ActionResult<Data | void>` from version `v0.1.x`.

### `v0.2.1`

- <a href="#Worker_Array_Proxy" target="_self">Add Worker Array Proxy feature.</a>
- When passing messages, if the `transfer` option is not specified, `transferable objects` will not be transferred.
