interface TypeMap {
  string: string;
  number: number;
  boolean: boolean;
  symbol: symbol;
  undefined: undefined;
  object: object;
  function: (...args: any[]) => unknown;
  bigint: bigint;
}

export function hasProperty<V extends unknown, P extends PropertyKey>(
  val: V,
  prop: P,
): val is V & Record<P, unknown> {
  if (!isTypeOf(val, "object")) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(val, prop);
}

export function hasPropertyTypeOf<
  V extends unknown,
  P extends PropertyKey,
  T extends keyof TypeMap,
>(val: V, prop: P, type: T): val is V & Record<P, TypeMap[T]> {
  return hasProperty(val, prop) && isTypeOf(val[prop], type);
}

export function hasPropertyInstanceOf<
  V extends unknown,
  P extends PropertyKey,
  I,
>(val: V, prop: P, ctor: new (...args: any[]) => I): val is V & Record<P, I> {
  return hasProperty(val, prop) && isInstanceOf(val[prop], ctor);
}

export function isTypeOf<T extends keyof TypeMap>(
  val: unknown,
  type: T,
): val is TypeMap[T] {
  return typeof val === type;
}

export function isInstanceOf<T>(
  val: unknown,
  ctor: new (...args: any[]) => T,
): val is T {
  return val instanceof ctor;
}
