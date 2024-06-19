/**
 * 判断一个数据是否是可转移对象
 * @param data
 * @returns boolean
 */
function judgeTransferable(data: any) {
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
  const isPrimitive =
    typeof data === "number" ||
    typeof data === "string" ||
    typeof data === "boolean" ||
    typeof data === "bigint" ||
    data === null ||
    data === undefined;
  const isTransferable = judgeTransferable(data);
  if (
    isArrayBuffer ||
    isBoolean ||
    isDataView ||
    isDate ||
    isError ||
    isError ||
    isRegExp ||
    isString ||
    isTypedArray ||
    isPrimitive ||
    (options?.transferable ? isTransferable : false)
  ) {
    return true;
  } else {
    if (data instanceof Array) {
      return data.reduce(
        (prev, cur) => prev && judgeStructuredCloneable(cur),
        true
      );
    } else if (data instanceof Map) {
      for (const item of data) {
        if (
          !(judgeStructuredCloneable(item[0]) && judgeStructuredCloneable(item[1]))
        )
          return false;
      }
      return true;
    } else if (data instanceof Set) {
      for (const item of data) {
        if (!judgeStructuredCloneable(item)) return false;
      }
      return true;
    } else if (typeof data === "object") {
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
