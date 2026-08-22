import {
  hasPropertyInstanceOf,
  hasPropertyTypeOf,
  isInstanceOf,
  isTypeOf,
} from "./index.js";

interface TypeMap {
  string: string;
  number: number;
  boolean: boolean;
  symbol: symbol;
  undefined: undefined;
  object: object;
  function: (...args: any[]) => any;
  bigint: bigint;
}

export function assertTypeOf<T extends keyof TypeMap>(
  val: unknown,
  name: string,
  type: T,
): val is TypeMap[T] {
  if (!isTypeOf(val, type)) {
    throw new TypeError(`'${name}' is not a of type '${type}'`);
  }
  return true;
}

export function assertInstanceOf<T>(
  val: unknown,
  name: string,
  ctor: new (...args: any[]) => T,
): val is T {
  if (!isInstanceOf(val, ctor)) {
    throw new TypeError(
      `'${name}' is not an instance of '${ctor.constructor.name}'`,
    );
  }
  return true;
}

export function assertPropertyTypeOf<
  V extends unknown,
  P extends PropertyKey,
  T extends keyof TypeMap,
>(val: V, prop: P, type: T): val is V & Record<P, TypeMap[T]> {
  if (!hasPropertyTypeOf(val, prop, type)) {
    throw new TypeError(
      `'${prop.toString()}' property is not a of type '${type}'`,
    );
  }
  return true;
}

export function assertPropertyInstanceOf<
  V extends unknown,
  P extends PropertyKey,
  I,
>(val: V, prop: P, ctor: new (...args: any[]) => I): val is V & Record<P, I> {
  if (!hasPropertyInstanceOf(val, prop, ctor)) {
    throw new TypeError(
      `'${prop.toString()}' property is not an instance of '${ctor.constructor.name}'`,
    );
  }
  return true;
}
