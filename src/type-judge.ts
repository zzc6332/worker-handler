type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

type Primitive = number | string | boolean | null | undefined | BigInt | symbol;

type StructuredCloneableError =
  | Error
  | EvalError
  | RangeError
  | ReferenceError
  | SyntaxError
  | TypeError
  | URIError;

// StructuredCloneable 可以接受一个泛型参数以扩展类型
export type StructuredCloneable<T = never> =
  | Exclude<Primitive, symbol>
  | { [k: string | number]: StructuredCloneable<T> }
  | Array<StructuredCloneable<T>>
  | Map<StructuredCloneable<T>, StructuredCloneable<T>>
  | Set<StructuredCloneable<T>>
  | Boolean
  | String
  | DataView
  | Date
  | RegExp
  | ArrayBuffer
  | TypedArray
  | Blob
  | StructuredCloneableError
  | T;

/**
 * 判断一个数据是否是可转移对象
 * @param data
 * @returns boolean
 */
function judgeTransferableObj(data: any): data is Transferable {
  let isArrayBuffer = false;
  try {
    isArrayBuffer = data instanceof ArrayBuffer;
  } catch (error) {
    isArrayBuffer;
  }

  let isMessagePort = false;
  try {
    isMessagePort = data instanceof MessagePort;
  } catch (error) {
    isMessagePort;
  }

  let isReadableStream = false;
  try {
    isReadableStream = data instanceof ReadableStream;
  } catch (error) {
    isReadableStream;
  }

  let isWritableStream = false;
  try {
    isWritableStream = data instanceof WritableStream;
  } catch (error) {
    isWritableStream;
  }

  let isTransformStream = false;
  try {
    isTransformStream = data instanceof TransformStream;
  } catch (error) {
    isTransformStream;
  }

  let isAudioData = false;
  try {
    isAudioData = data instanceof AudioData;
  } catch (error) {
    isAudioData;
  }

  let isImageBitmap = false;
  try {
    isImageBitmap = data instanceof ImageBitmap;
  } catch (error) {
    isImageBitmap;
  }

  let isVideoFrame = false;
  try {
    isVideoFrame = data instanceof VideoFrame;
  } catch (error) {
    isVideoFrame;
  }

  let isOffscreenCanvas = false;
  try {
    isOffscreenCanvas = data instanceof OffscreenCanvas;
  } catch (error) {
    isOffscreenCanvas;
  }

  let isRTCDataChannel = false;
  try {
    isRTCDataChannel = data instanceof RTCDataChannel;
  } catch (error) {
    isRTCDataChannel;
  }

  return (
    isArrayBuffer ||
    isMessagePort ||
    isReadableStream ||
    isWritableStream ||
    isTransformStream ||
    isAudioData ||
    isImageBitmap ||
    isVideoFrame ||
    isOffscreenCanvas ||
    isRTCDataChannel
  );
}

/**
 * 判断一个数据是否可以被结构化克隆
 * @param data
 * @param options 参数选项，包含以下属性：
 * - complete：表示是否需要判断数据是否能被完整格式化克隆，默认开启，表示只要当数据中有对象的原型不全等于 Object.prototype 时将被认定为无法完整结构化克隆，从而返回 false
 * - transferable：表示是否接受可转移对象，默认开启，表示数据中的可转移对象会被认为可以结构化克隆
 * @returns boolean
 */
export function judgeStructuredCloneable(
  data: any,
  options: { complete?: boolean; transferable?: boolean } = {
    complete: true,
    transferable: true,
  }
): boolean {
  const isArrayBuffer = data instanceof ArrayBuffer;
  const isBlob = data instanceof Blob;
  const isBoolean = data instanceof Boolean;
  const isDataView = data instanceof DataView;
  const isDate = data instanceof Date;
  const isError =
    data instanceof Error ||
    data instanceof EvalError ||
    data instanceof RangeError ||
    data instanceof ReferenceError ||
    data instanceof SyntaxError ||
    data instanceof TypeError ||
    data instanceof URIError;
  const isRegExp = data instanceof RegExp;
  const isString = data instanceof String;
  const isTypedArray =
    data instanceof Int8Array ||
    data instanceof Uint8Array ||
    data instanceof Uint8ClampedArray ||
    data instanceof Int16Array ||
    data instanceof Uint16Array ||
    data instanceof Int32Array ||
    data instanceof Uint32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array ||
    data instanceof BigInt64Array ||
    data instanceof BigUint64Array;
  const isPrimitiveExcludeSymbol =
    typeof data === "number" ||
    typeof data === "string" ||
    typeof data === "boolean" ||
    typeof data === "bigint" ||
    data === null ||
    data === undefined;
  const isTransferable = judgeTransferableObj(data);
  if (
    isArrayBuffer ||
    isBlob ||
    isBoolean ||
    isDataView ||
    isDate ||
    isError ||
    isRegExp ||
    isString ||
    isTypedArray ||
    isPrimitiveExcludeSymbol ||
    (options?.transferable ? isTransferable : false)
  ) {
    return true;
  } else {
    if (Array.isArray(data) || data instanceof Set) {
      for (const item of data) {
        if (!judgeStructuredCloneable(item)) return false;
      }
      return true;
    } else if (data instanceof Map) {
      for (const item of data) {
        if (
          !(
            judgeStructuredCloneable(item[0]) &&
            judgeStructuredCloneable(item[1])
          )
        )
          return false;
      }
      return true;
    } else if (typeof data === "object" && data !== null) {
      if (options.complete && Object.getPrototypeOf(data) !== Object.prototype)
        return false;
      for (const key in data) {
        if (!judgeStructuredCloneable(data[key])) return false;
      }
      return true;
    }
    return false;
  }
}

/**
 * 将一个可结构化克隆对象中的可转移对象提取到一个数组中
 * @param source
 * @returns extracted
 */
export function getTransfers(source: StructuredCloneable<Transferable>) {
  const extracted = new Set<Transferable>();

  /**
   * 遍历一个可结构化克隆对象，将其中的可转移对象放入到 extractedSet 中
   * @param source
   */
  function extractTransferableObj(source: StructuredCloneable<Transferable>) {
    if (judgeTransferableObj(source)) {
      extracted.add(source);
      return;
    }

    const handleItem = (item: StructuredCloneable<Transferable>) => {
      if (judgeTransferableObj(item)) {
        extracted.add(item);
      } else {
        extractTransferableObj(item);
      }
    };

    if (Array.isArray(source) || source instanceof Set) {
      for (const item of source) {
        handleItem(item);
      }
    } else if (source instanceof Map) {
      for (const itemTuple of source) {
        handleItem(itemTuple[0]);
        handleItem(itemTuple[1]);
      }
    } else if (typeof source === "object" && source !== null) {
      for (const key in source) {
        const item = (source as any)[key] as StructuredCloneable<Transferable>;
        handleItem(item);
      }
    }
  }

  extractTransferableObj(source);

  return [...extracted];
}

/**
 * 判断一个任意的嵌套对象中是否包含 value
 * @param container
 * @param value
 * @returns boolean
 */
export function judgeContainer(container: any, value: any) {
  if (container === value) return true;

  if (Array.isArray(container) || container instanceof Set) {
    for (const item of container) {
      if (judgeContainer(item, value)) return true;
    }
  } else if (container instanceof Map) {
    for (const itemTuple of container) {
      if (
        judgeContainer(itemTuple[0], value) ||
        judgeContainer(itemTuple[1], value)
      )
        return true;
    }
  } else if (typeof container === "object" && container !== null) {
    for (const key in container) {
      const item = container[key];
      if (judgeContainer(item, value)) return true;
    }
  }

  return false;
}
