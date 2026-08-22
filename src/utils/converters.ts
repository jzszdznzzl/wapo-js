import { Readable } from "node:stream";
import {
  assertInstanceOf,
  hasPropertyTypeOf,
  isInstanceOf,
  isTypeOf,
  stringifyJSON,
} from "./index.js";

export function toString(val: unknown) {
  if (isTypeOf(val, "object")) {
    return stringifyJSON(val);
  }

  return isTypeOf(val, "string") ? val : String(val);
}

export function toError(val: unknown) {
  return isInstanceOf(val, Error) ? val : Error(toString(val));
}

export function toNumber(val: unknown) {
  if (isTypeOf(val, "number")) {
    return val;
  }
  if (isTypeOf(val, "object")) {
    if (hasPropertyTypeOf(val, "toNumber", "function")) {
      return val.toNumber() as number;
    }
  }
  return Number(val);
}

export async function streamToBuffer(val: Readable): Promise<Buffer> {
  assertInstanceOf(val, "val", Readable);
  const chunks: Buffer[] = [];
  for await (const chunk of val) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
