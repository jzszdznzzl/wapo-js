import { createStore, type WaCreateStoreOptions, type WaStore } from "zapo-js";
import { assertTypeOf } from "../utils/index.js";

export interface BotStoreOptions extends WaCreateStoreOptions {}

export interface BotStoreRecord {}

export interface BotStoreJSON {
  type: "Store";
  data: {};
}

interface BotStore extends WaStore {}

class BotStore {
  constructor(opts: BotStoreOptions) {
    assertTypeOf(opts, "opts", "object");
    // @ts-ignore
    const store = createStore(opts);
    Object.assign(this, store);
  }

  toString() {
    return "[BotStore]";
  }

  valueOf() {
    return this.toString();
  }

  toObject(): BotStoreRecord {
    return {};
  }

  toJSON(): BotStoreJSON {
    return {
      type: "Store",
      data: {},
    };
  }
}

export { BotStore };
