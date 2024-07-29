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

// import workerUrl from "./demo.worker.js?worker&url"; // in vite
// import workerInstance from "./demo.worker.js?worker"; // in vite

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

### <span id="terminating">Responding through `Promise` (`terminating responses`)</span>

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

Starting from `v0.2.0`, in environments that [support](https://caniuse.com/?search=Proxy) [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy), messages that cannot be handled by the [structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm) is also allowed to be passed.

### Basic Usage

If the data sent by `Worker` to `Main` cannot be structured cloned, then a `Proxy` that references this data (hereinafter referred to as `Worker Proxy`) will be created in `Main` as the received data:

- It is possible to operate on `Worker Proxy` in `Main`, and `Worker Proxy` will update these operations to its referenced data.
- The currently implemented `traps` for `Worker Proxy` are: `get`, `set`, `apply`, `construct`.
- Since message passing is asynchronous, operations that return results such as `get`, `apply`, `construct` will return a new promise-like proxy object, representing the result of the operation. In environments that support the `await` syntax, adding `await` before operating on the `Proxy` (except for `set`) can simulate operations on its referenced data. In most cases, if you need to perform chained operations on `Worker Proxy`, you only need to use the `await` keyword once.
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
  const { data } = await demoWorker.execute("returnUncloneableData").promise;

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

`Worker Array Proxy` (supported from `v0.2.1`) is a special type of `Worker Proxy`. If the data referenced by a `Worker Proxy` is an array, then that `Worker Proxy` is a `Worker Array Proxy`.

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
    const { data: proxyArr } = await demoWorker.execute("returnUncloneableArr").promise;

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
    const { data: proxyArr } = await demoWorker.execute("returnUncloneableArr").promise;

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
    const { data: proxyArr } = await demoWorker.execute("returnUncloneableArr")
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
    const { data: proxyArr } = await demoWorker.execute("returnUncloneableArr")
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
    const { data: proxyArr } = await demoWorker.execute("returnUncloneableArr")
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
    const { data: proxyArr } = await demoWorker.execute("returnUncloneableArr")
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

### Advanced

#### `Worker Proxy` Related Objects

The objects related to `Worker Proxy` are: `Worker Proxy`, `Worker Array Proxy`, and `Carrier Proxy`.

The relationships between `Worker Proxy` objects:

- If a `Worker Proxy` (referred as `WP1`) references target data that exists with in the structure of the target data referenced by another `Worker Proxy` (referred as `WP2`), then `WP1` is a `Child Worker Proxy` (aka `Child`) of `WP2`.
- If a `Worker Proxy` (referred as `WP1`)  references target data that is generated by the target data referenced by another `Worker Proxy` (referred as `WP2`) through function calls or class instantiation, then `WP1` is a `Derived Worker Proxy` (aka `Adopted Child`) of `WP2`.
- If `WP1` is a `Child` of a `Child` of `WP2`, then `WP1` is also a `Child` of `WP2`. If `WP1` is a descendant of `WP2`, and there is an `Adopted Child` in their relationship chain, then `WP1` is an `Adopted Child` of `WP2`.

`Worker Proxy` can be obtained through the following ways:

1. When executing the `Action` in `Worker` and receiving the data it sends, if the data cannot be structured cloned, a `Worker Proxy` that references this data will be received in `Main`.
2. If the data obtained through a `Worker Proxy` still cannot be structured cloned, a new `Worker Proxy` that references the data will be obtained. There are two situations:
   - After performing a `get` operation on a `Worker Proxy`, if a `Worker Proxy` is obtained asynchronously, the latter is a `Child` of the former.
   - After performing an `apply` or a `construct` operation on a `Worker Proxy`, if a `Worker Proxy` is obtained asynchronously, the latter is an `Adopted Child` of the former.
3. If a `Worker Proxy` is a `Worker Array Proxy`, then when it executes certain array methods that require a callback function, the `item` parameter in the callback function is a `Worker Proxy` that references the corresponding target array item, and the latter is a `Child` of the fommer.

The `Worker Array Proxy` is a special type of `Worker Proxy`. If a `Worker Proxy` references target data that is an array, then it is a `Worker Array Proxy`. It can execute array methods, and its other behaviors are the same as a regular `Worker Proxy`.

The <span id="Carrier_Proxy">`Carrier Proxy`</span> is a promise-like object. Since operations on a `Worker Proxy` need to asynchronously take effect on the target data in `Worker` that it references, a carrier is needed to asynchronously obtain the result of the operation. The `Carrier Proxy` serves as this carrier. An operation on a `Worker Proxy` returns a `Carrier Proxy`, and the result of the operation is obtained asynchronously through this promise-like object. If further operations are performed on the `Carrier Proxy`, a new `Carrier Proxy` is also returned, enabling chain operations on the `Worker Proxy`.

If an operation on a `Worker Proxy` takes effect on its target data and results in a `Promise` object, the corresponding `Carrier Proxy` will simulate the behavior of this `Promise` object. See the <a href="#Carrier_Promise_Proxy" target="_self">example</a>.

By accessing the <span id="proxyTypeSymbol">`proxyTypeSymbol`</span> key of the `Worker Proxy` related object, you can obtain a string that represents the type of this object:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  returnUncloneableData: () => ActionResult<{
    getString: () => string;
    getUnclonable: () => { getString: () => string };
    getArray: () => {
      index: number;
      f: () => string;
      layer1: { layer2: { index: number } };
    }[];
  }>;
};

onmessage = createOnmessage<DemoActions>({
  async returnUncloneableData() {
  const data = {
      getString: () => "result of getString()",
      getUnclonable() {
        return { getString: data.getString };
      },
      getArray: () =>
        [0, 1, 2].map((_, index) => ({
          index,
          f: () => "index: " + index,
          layer1: { layer2: { index } },
        })),
    };
    return data;
  },
});
~~~

~~~typescript
// demo.main.ts
import { proxyTypeSymbol, WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

async function init() {
  const { data } = await demoWorker.execute("returnUncloneableData")
    .promise;

  console.log(data[proxyTypeSymbol]); // "Worker Proxy"
  console.log(data.getString[proxyTypeSymbol]); // "Carrier Proxy"
  console.log((await data.getString)[proxyTypeSymbol]); // "Worker Proxy"
  console.log((await data.getArray())[proxyTypeSymbol]); // "Worker Array Proxy"
  console.log((await data.getUnclonable())[proxyTypeSymbol]); // "Worker Proxy"

  const arrProxy = await data.getArray();
  await arrProxy.forEach((item) => {
    console.log(item[proxyTypeSymbol]); // "Worker Proxy"
  });
}

init();
~~~

#### <span id="cleanup">Clean Up Target Data</span>

When an `Action` in the `Worker` needs to post data that cannot be structured cloned to `Main`, a `Worker Proxy` referencing this data will be created in `Main`. The referenced data is stored and prevented from being garbage collected. Starting from `v0.2.4`, target data that is no longer in use can be cleaned up automatically or manually.

##### Auto Cleanup

In environments that [support](https://caniuse.com/?search=FinalizationRegistry) [FinalizationRegistry](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry), the referenced target data can be automatically cleaned up when the `Worker Proxy` is garbage collected. This feature can be enabled or disabled (enabled by default) when creating a `WorkerHandler` instance. For example:

~~~typescript
// demo.main.ts
import { WorkerHandler } from "worker-handler/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url)),
  { autoCleanup: false } // disable autoCleanup
);
~~~

##### Manual Cleanup

For environments that do not support `FinalizationRegistry`, the target data will be cleaned up when the `Worker Proxy` that referencing it is manually revoked.

When revoking a `Worker Proxy`, each of its `Children` will also be recursively revoked. Additionally, there is an option to specify whether to recursively revoke each of its `Adopted Children`.

There are two ways to revoke a `Worker Proxy`, and they have the same effect:

- Using `revokeProxy()` of the `WorkerHandler` instance:

  ~~~typescript
  /**
   * Recursively revoke Worker Proxy and clean up the corresponding data.
   * @param proxy The Worker Proxy to be revoked
   * @param options Configuration parameter `{ derived?: boolean }`, and can also be simplified to just passing a boolean value or `0 | 1`. If `true`, it indicates recursively revoking the Worker Proxy’s Children and Adopted Children; otherwise, it only recursively revokes the Children.
     */
  revokeProxy(
    proxy: WorkerProxy<any>,
    options?: { derived?: boolean } | boolean | 0 | 1
  ): void
  ~~~

- Using the method obtained with the `revokeSymbol` key of the `Worker Proxy`:

  ~~~typescript
  [revokeSymbol](options?: { derived?: boolean } | boolean | 0 | 1): void;
  ~~~

<span id="revokeSymbol">For example</span>:

~~~typescript
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  returnUncloneableData: () => ActionResult<{
    getString: () => string;
    getUnclonableData: () => { getString: () => string };
    getArray: () => {
      index: number;
      f: () => string;
      layer1: { layer2: { index: number } };
    }[];
  }>;
};

onmessage = createOnmessage<DemoActions>({
  async returnUncloneableData() {
  const data = {
      getString: () => "result of getString()",
      getUnclonableData() {
        return { getString: data.getString };
      },
      getArray: () =>
        [0, 1, 2].map((_, index) => ({
          index,
          f: () => "index: " + index,
          layer1: { layer2: { index } },
        })),
    };
    return data;
  },
});
~~~

~~~typescript
// demo.main.ts
import { proxyTypeSymbol, revokeSymbol, WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url)),
  { autoCleanup: false }
);

// Revoke the data using different derived options and check the state of the different Proxy objects.
async function init(derived?: { derived?: boolean } | boolean | 0 | 1) {
  const { data } = await demoWorker.execute("returnUncloneableData2").promise;

  const getString = await data.getString;
  const arrayProxy = await data.array;
  const array = await arrayProxy.map((item) => item);
  const derivedArrayProxy = await data.getArray();
  const derivedArray = await derivedArrayProxy.map((item) => item);
  const getStringOfUnclonableData = await data.getUnclonableData().getString;

  data[revokeSymbol](derived); // Equivalent to `demoWorker.revokeProxy(data, derived);`

  try {
    console.log(data[proxyTypeSymbol]);
  } catch (error) {
    console.log(error); // Whether or not derived is enabled, it will output: "TypeError: Cannot perform 'get' on a proxy that has been revoked"
  }

  // `getString` is a Child of `data`
  try {
    console.log(getString());
  } catch (error) {
    console.log(error); // Whether or not derived is enabled, it will output: "TypeError: Cannot perform 'apply' on a proxy that has been revoked"
  }

  // `array[0]` is a Child of `data`
  try {
    console.log(array[0][proxyTypeSymbol]);
  } catch (error) {
    console.log(error); // Whether or not derived is enabled, it will output: "TypeError: Cannot perform 'get' on a proxy that has been revoked"
  }

  // `derivedArray[0]` is an Adopted Child of `data`
  try {
    console.log(derivedArray[0][proxyTypeSymbol]); // When derived is not enabled, it outputs: "Worker Proxy"
  } catch (error) {
    console.log(error); // When derived is enabled, it outputs: "TypeError: Cannot perform 'get' on a proxy that has been revoked"
  }

  // getStringOfUnclonableData 是 data 的 Adopted Child
  try {
    console.log(await getStringOfUnclonableData()); // When derived is not enabled, it outputs: "result of getString()"
  } catch (error) {
    console.log(error); // When derived is enabled, it outputs: "TypeError: Cannot perform 'apply' on a proxy that has been revoked"
  }
}

init(1); // Equivalent to `init(true);` or `init({ derived: true });`
init(); // Equivalent to `init(0);` or `init(false);` or `init({ derived: false });`
~~~

##### Not Recommended Practices

If the target data of a `Worker Proxy` is responded to by `this.$post()` in an `Action`, the following two practices may cause unexpected behavior in the cleanup of the target data when calling the corresponding `MessageSource.addEventListener()`:

- Do not call `addEventListener()` asynchronously  after a period of time has passed since the `MessageSource` was created, for example:

  ~~~typescript
  const demoMessageSource = demoWorker.execute("demoAction")
  setTimeout(()=>{
    demoMessageSource.addEventListener(...)
  }, 1000)
  ~~~

  Doing so may result in the `this.$post()` in the `Action` having already executed by the time the listener is added. This will cause the target data to be stored and prevented from being garbage collected, but without creating the corresponding `Worker Proxy` in `Main`. Consequently, the target data cannot be cleaned up by revoking (or garbage collecting) the corresponding `Worker Proxy` .

- Do not call `addEventListener()` multiple times on a single `MessageSource`. Otherwise, multiple `Worker Proxies` will be created for the same target data. As any one of these `Worker Proxies` is revoked (or garbage collected), the target data will be cleaned up and will no longer be accessible to the other `Worker Proxies` that reference it.

## <span id="Promise_Object_Message">Promise Object Messages</span>

The `Promise` object messages described in this chapter do not refer to <a href="#terminating" target="_self">messages responded through Promise (terminating responses)</a>, but rather to messages which have a `Promise` object as their target data.

Starting from `v0.2.5`, support for `Promise` object messages has been added, allowing `Main` to intuitively handle `Promise` objects from `Worker`.

The generation of `Promise` object messages can be broadly categorized into the following three cases:

- Directly responding with a `Promise` object through a `terminating response`;
- Directly responding with a `Promise` object through a `nonterminating response`;
- Manipulating the `Promise` object in the target data through a `Worker Proxy`.

### Promise Object Messages In Terminating Responses

If a `Promise` object is posted through a `terminating response` in `Action`, the corresponding `MessageSource.promise` in `Main` will simulate the behavior of that `Promise` object.

If the value that the `Promise` object to be resolved with cannot be structured cloned, the `MessageSource.promise` will be resolved with a `Worker Proxy` that references that value.

For example:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  returnPromiseWithStr: () => ActionResult<Promise<string>>;
  returnPromiseWithFn: () => ActionResult<Promise<() => string>>;
};

onmessage = createOnmessage<DemoActions>({
  async returnPromiseWithStr() {
    this.$end(
      new Promise<string>((resolve, reject) => {
        if (Math.random() >= 0.5) {
          resolve('fulfilled test string of "returnPromiseWithStr"');
        } else {
          reject('rejected test string of "returnPromiseWithStr"');
        }
      })
    );
  },

  async returnPromiseWithFn() {
    this.$end(
      new Promise<() => string>((resolve, reject) => {
        if (Math.random() >= 0.5) {
          resolve(() => 'fulfilled test string of "returnPromiseWithFn"');
        } else {
          reject('rejected test string of "returnPromiseWithFn"');
        }
      })
    );
  },
});
~~~

~~~typescript
// demo.main.ts
import { proxyTypeSymbol, WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

async function init() {
  try {
    const { data } = await demoWorker.execute("returnPromiseWithStr").promise;
    // In the case where the target Promise object is fulfilled, if the value which the target Promise object resolved with can be structured cloned, then the value can be directly obtained.
    console.log(data); // 'fulfilled test string of "returnPromiseWithStr"'
  } catch (error) {
    // In the case where the target Promise object is rejected.
    console.log(error); // 'rejected test string of "returnPromiseWithStr"'
  }

  try {
    const { data } = await worker .execute("returnPromiseWithFn").promise;
    // In the case where the target Promise object is fulfilled, if the value which the target Promise object resolved with can not be structured cloned, then a Worker Proxy referencing the value will be obtained.
    console.log(data[proxyTypeSymbol]); // "Worker Proxy"
    console.log(await data()); // 'fulfilled test string of "returnPromiseWithFn"'
  } catch (error) {
    // In the case where the target Promise object is rejected.
    console.log(error); // 'rejected test string of "returnPromiseWithFn"'
  }
}

init();
~~~

If you use the return value of `Action` to respond with a `Promise` object, you need to explicitly annotate the return value type when defining the `Action` function:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  returnPromiseWithStr: () => ActionResult<Promise<string>>;
};

onmessage = createOnmessage<DemoActions>({
  // Explicitly annotate the return type of Action, which needs to match the type in DemoActions
  async returnPromiseWithStr(): ActionResult<Promise<string>> {
    return new Promise<string>((resolve, reject) => {
      if (Math.random() >= 0.5) {
        resolve('fulfilled test string of "returnPromiseWithStr"');
      } else {
        reject('rejected test string of "returnPromiseWithStr"');
      }
    });
  }
});
~~~

~~~typescript
// demo.main.ts
import { proxyTypeSymbol, WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

async function init() {
  try {
    const { data } = await demoWorker.execute("returnPromiseWithStr").promise;
     // In the case where the target Promise object is fulfilled
    console.log(data); // 'fulfilled test string of "returnPromiseWithStr"'
  } catch (error) {
     // In the case where the target Promise object is rejected
    console.log(error); // 'rejected test string of "returnPromiseWithStr"'
  }
}

init();
~~~

### Promise Object Messages In Nonterminating Responses

If a `Promise` object is posted through a `nonterminating response` in `Action`, a simulated `Promise` object can be obtained in `Main` by listening to the corresponding `MessageSource`.

If the value that the `Promise` object to be resolved with cannot be structured cloned, the `MessageSource.promise` will be resolved with a `Worker Proxy` that references that value.

For exampler:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  postPromiseWithStr: () => ActionResult<Promise<string>>;
  postPromiseWithFn: () => ActionResult<Promise<() => string>>;
};

onmessage = createOnmessage<DemoActions>({
  async postPromiseWithStr() {
    const promise = new Promise<string>((resolve, reject) => {
      if (Math.random() >= 0.5) {
        resolve('fulfilled test string of "postPromiseWithStr"');
      } else {
        reject('rejected test string of "postPromiseWithStr"');
      }
    });
    this.$post(promise);
    this.$end(promise);
  },

  async postPromiseWithFn() {
    const promise = new Promise<() => string>((resolve, reject) => {
      if (Math.random() >= 0.5) {
        resolve(() => 'fulfilled test string of "postPromiseWithFn"');
      } else {
        reject('rejected test string of "postPromiseWithFn"');
      }
    });
    this.$post(promise);
    this.$end(promise);
  },
});
~~~

~~~typescript
// demo.main.ts
import { proxyTypeSymbol, WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

async function init() {
  const messageSource1 = worker.execute("postPromiseWithStr");
  messageSource1.addEventListener("message", async (e) => {
    try {
      // e.data is a Promise object that will simulate the target Promise object.
      const resolvedValue = await e.data;
      // In the case where the target Promise object is fulfilled, if the value which the target Promise object resolved with can be structured cloned, then the value can be directly obtained.
      console.log(resolvedValue); // 'fulfilled test string of "postPromiseWithStr"'
    } catch (error) {
      // In the case where the target Promise object is rejected.
      console.log(error); // 'rejected test string of "postPromiseWithStr"'
    }
  });
  try {
    const { data } = await messageSource1.promise;
    // In the case where the target Promise object is fulfilled, if the value which the target Promise object resolved with can be structured cloned, then the value can be directly obtained.
    console.log(data); // 'fulfilled test string of "postPromiseWithStr"'
  } catch (error) {
    // In the case where the target Promise object is rejected.
    console.log(error); // 'rejected test string of "postPromiseWithStr"'
  }

  const messageSource2 = worker.execute("postPromiseWithFn");
  messageSource2.addEventListener("message", async (e) => {
    try {
      // e.data is a Promise object that will simulate the target Promise object.
      const data = await e.data;
      // In the case where the target Promise object is fulfilled, if the value which the target Promise object resolved with can be structured cloned, then the value can be directly obtained.
      console.log(data[proxyTypeSymbol]); // "Worker Proxy"
      const resultStr = await data();
      console.log(resultStr); // 'fulfilled test string of "returnPromiseWithFn"'
    } catch (error) {
      // In the case where the target Promise object is rejected.
      console.log(error); //  // 'rejected test string of "returnPromiseWithFn"'
    }
  });
  try {
    const { data } = await messageSource2.promise;
    // In the case where the target Promise object is fulfilled, if the value which the target Promise object resolved with can be structured cloned, then the value can be directly obtained.
    console.log(data[proxyTypeSymbol]); // "Worker Proxy"
    console.log(await data()); // 'fulfilled test string of "returnPromiseWithFn"'
  } catch (error) {
    // In the case where the target Promise object is rejected.
    console.log(error); // 'rejected test string of "returnPromiseWithFn"'
  }
}

init();
~~~

### Promise Object Messages In Worker Proxies

If the `Worker Proxy` references target data that contains (or can generate) `Promise` objects, then when attempting to access the `Promise` objects through the `Worker Proxy`, you will get a <a href="#Carrier_Proxy" target="_self">Carrier Proxy</a> that references the `Promise` object. This `Carrier Proxy` will simulate the behavior of the `Promise` object. For <span id="Carrier_Promise_Proxy">example</span>:

~~~typescript
// demo.worker.ts
import { ActionResult, createOnmessage } from "worker-handler/worker";

export type DemoActions = {
  getPromise: () => ActionResult<{ getPromise: () => Promise<string> }>;
};

onmessage = createOnmessage<DemoActions>({
  async getPromise() {
    this.$end({
      getPromise: () =>
        new Promise<string>((resolve, reject) => {
          if (Math.random() >= 0.5) {
            resolve('fulfilled test string of "getPromise"');
          } else {
            reject('rejected test string of "getPromise"');
          }
        }),
    });
  },
});
~~~

~~~typescript
// demo.main.ts
import { proxyTypeSymbol, WorkerHandler } from "src/main";
import { DemoActions } from "./demo.worker";

const demoWorker = new WorkerHandler<DemoActions>(
  new Worker(new URL("./demo.worker.ts", import.meta.url))
);

async function init() {
  const { data } = await worker.execute("getPromise").promise;
  try {
    // `data.getPromise()` will generate a Carrier Proxy that references the target Promise object, the Carrier Proxy will simulate the target Promise object.
    console.log(data.getPromise()[proxyTypeSymbol]); // "Carrier Proxy"
    const resolvedValue = await data.getPromise();
    // In the case where the target Promise object is fulfilled.
    console.log(resolvedValue); // 'fulfilled test string of "getPromise"'
  } catch (error) {
    // In the case where the target Promise object is rejected.
    console.log(error); // 'rejected test string of "getPromise"'
  }
}

init();
~~~

## APIs

### worker-handler/main

#### WorkerHandler

Constructor:

- Parameters:

  - `workerSrc`:

     A `Worker` instance. Alternatively, if the environment can provide the path to the bundled `Worker` script as a `string` or `URL`, thay can also be passed in as `workerSrc`.

  - `options`:

     Configuration options for creaing a `workerHandler` instance. Currently, there is only one property, `autoCleanup`, which is a `boolean`. It indicates whether to automatically clean up the target data referenced by the `Worker Proxy` that has been garbage collected if the environment supports `FinalizationRegistry`. The default value is `true`.

- Returns a `WorkerHandler` instance.

Instance methods:

- `execute(actionName, options, ...payloads)`:

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

- `revokeProxy(workerProxy, options?)`

  Upon execution, the specified `Worker Proxy` and its related `Worker Proxies` will be revoked, and the referenced target data they reference will be cleaned up.

  Parameters:

  - `workerProxy`:

    The `Worker Proxy` to be revoked.

  - `options`:

    Optional configuration parameters `{ derived?: boolean }`, which can also be simplified to a `boolean` value or `0 | 1`. If `true`, it indicates recursively revoking the `Children` and `Adopted Children` of the `Worker Proxy`; otherwise, it only recursively revokes the `Children`.

#### MessageSource

`MessageSource` is used to receive response messages from `Action`.

Properties:

- `promise`:

  A `Promise` object.

  When a `terminating response` is made in `Action`, the `promise` will become `fulfilled` and receive the response message.

  If an error is thrown in `Action` or the `terminating response` message made by `Action` cannot be structured cloned, and the current environment does not support `Proxy`, the `promise` will become `rejected` and receive the error message.

  When the `promise` is settled, the connection is closed, and `Action` will not make any more response messages (including `nonterminating response` messages).

- `onmessage`:

  A callback function that is called when `Action` makes a `nonterminating response` message.

  It receives a parameter `e`, through which the `nonterminating response` message made by `Action` can be accessed via `e.data`.

- `onmessageerror`:

  A callback function that is called when the `nonterminating response` message made by `Action` cannot be structured cloned  and the current environment does not support `Proxy`.

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

`UnwrapPromise` is an utility type that can accept a `Promise` type or a `PromiseLike` type as a generic parameter and can extract the inner type. It is used for type assertion when performing `set` operations on a `Worker Proxy` or a `Carrier Proxy`.

#### ReceivedData

ReceivedData is a utility type that can accept any type (representing the type of data in the response from an `Action`) as a generic parameter. It obtains the type of corresponding data to be received in `Main` based on  whether the generic parameter can be structured cloned (it is either the generic parameter type itself or a `WorkerProxy` type).

#### WorkerProxy / CarrierProxy

These two types indicate that it is either a `Worker Proxy` or a `Carrier Proxy`. They accept a generic parameter representing the type of the target data referenced by the `Worker Proxy` or the `Carrier Proy`.

In `worker-handler/main`, some `symbol` keys are provided. They can be used to access certain properties or methods of the `Worker Proxy` or the `Carrier Proxy`:

- `proxyTypeSymbol`

  Used to obtain a string that representing the type of the current `Proxy`. See the <a href="#proxyTypeSymbol" target="_self">example</a> for usage.

- `revokeSymbol`

  Only applicable to `Worker Proxy`, used to obtain a method to revoke the current `Worker Proxy` and clean up the corresponding data. See the <a href="#revokeSymbol" target="_self">example</a> for usage.

### worker-handler/worker

#### createOnmessage()

Define `Actions` within an object, which is passed to the `createOnmessage()` when called, and return a listener function for the `message` event of `Worker`.

Use `this.$post()` within `Action` to make `nonterminating responses`, and use `this.$end()` or return a value to make `terminating responses`.

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

### `v0.2.4`

- <a href="#cleanup" target="_self">Supports cleaning up the target data referenced by the Worker Proxy that is no longer in use.</a>

### `v0.2.5`

- <a href="#Promise_Object_Message" target="_self">Supports Promise Object Message feature.</a>
