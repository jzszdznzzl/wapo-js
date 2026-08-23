import {
  type WaClientOptions,
  type WaStoreSession,
  WaClient,
  type WaDisconnectReason,
  type WaIncomingMessageEvent,
  type Logger,
  type WaConnectionEvent,
  delay,
} from "zapo-js";
import { assertInstanceOf, assertTypeOf, toError } from "../utils/index.js";
import { BotStore, Message, JID } from "./index.js";
import { EventEmitter } from "node:events";
import { Context, parseCommand } from "../command/index.js";
import ms from "ms";

export interface BotOptions extends Omit<
  WaClientOptions,
  "sessionId" | "store"
> {
  logger?: Logger;
}

export interface BotMe {
  lid: JID;
  pn: JID;
  name: string;
  username?: string;
}

export enum BotEvent {
  QR = "qr",
  CONNECTED = "connected",
  PAIRED = "paired",
  DISCONNECTED = "disconnected",
  LOGGED_OUT = "logged_out",
  MESSAGE = "message",
  COMMAND = "command",
  ERROR = "error",
}

export interface BotEventMap {
  [BotEvent.QR]: [{ qr: string; ttlMs: number }];
  [BotEvent.CONNECTED]: [];
  [BotEvent.PAIRED]: [];
  [BotEvent.DISCONNECTED]: [reason: WaDisconnectReason];
  [BotEvent.LOGGED_OUT]: [reason: WaDisconnectReason];
  [BotEvent.MESSAGE]: [msg: Message];
  [BotEvent.COMMAND]: [ctx: Context];
  [BotEvent.ERROR]: [err: Error];
}

export enum BotState {
  CONNECTED,
  CONNECTING,
  RECONNECTING,
  PAIRING,
  DISCONNECTED,
  LOGGED_OUT,
}

export interface BotRecord {
  id: string;
  prefix?: string;
}

export interface BotJSON {
  type: "Bot";
  data: {
    id: string;
    prefix?: string;
  };
}

export interface Next {
  (): Promise<void>;
}

export interface Middleware {
  (ctx: Context, next: Next): Promise<void>;
}

export interface ErrorMiddleware {
  (err: Error, ctx: Context, next: Next): Promise<void>;
}

export class Bot extends EventEmitter<BotEventMap> {
  #commands = new Map<string, Middleware[]>();
  #middlewares: {
    normal: Middleware[];
    error: ErrorMiddleware[];
  } = { normal: [], error: [] };
  #prefix?: string = "/";

  readonly id: string;
  state: BotState;
  cli: WaClient;
  session: WaStoreSession;

  constructor(id: string, store: BotStore, opts?: BotOptions) {
    assertTypeOf(id, "id", "string");
    assertInstanceOf(store, "store", BotStore);
    if (opts) {
      assertTypeOf(opts, "opts", "object");
    }
    super();
    this.id = id;
    this.state = BotState.DISCONNECTED;
    this.cli = new WaClient(
      {
        ...opts,
        sessionId: this.id,
        store: store,
      },
      opts?.logger,
    );
    this.session = store.session(this.id);
  }

  async #onAuthQr(evt: { qr: string; ttlMs: number }) {
    try {
      this.state = BotState.PAIRING;
      this.emit(BotEvent.QR, evt);
    } catch (e) {
      const err = toError(e);
      this.emit(BotEvent.ERROR, err);
    }
  }

  async #onConnection(evt: WaConnectionEvent) {
    try {
      if (evt.status === "close") {
        this.state = BotState.DISCONNECTED;
        if (evt.isLogout) {
          this.state = BotState.LOGGED_OUT;
          this.emit(BotEvent.LOGGED_OUT, evt.reason);
          return;
        }
        if (evt.reason === "client_disconnected") {
          this.emit(BotEvent.DISCONNECTED, evt.reason);
          return;
        }
        if (evt.reason === "failure_service_unavailable") {
          await delay(ms("10ms"));
        }
        this.state = BotState.RECONNECTING;
        this.emit(BotEvent.DISCONNECTED, evt.reason);
        await this.cli.connect();
        return;
      }
      this.state = BotState.CONNECTED;
      this.emit(evt.isNewLogin ? BotEvent.PAIRED : BotEvent.CONNECTED);
    } catch (e) {
      const err = toError(e);
      this.emit(BotEvent.ERROR, err);
    }
  }

  async #onMessage(evt: WaIncomingMessageEvent) {
    try {
      const msg = new Message(evt, this);
      this.emit(BotEvent.MESSAGE, msg);
      if (!msg.body) {
        return;
      }
      const cmd = parseCommand(msg.body, this.#prefix ?? "");
      if (!cmd) {
        return;
      }
      const ctx = new Context(cmd, msg);
      this.emit(BotEvent.COMMAND, ctx);
    } catch (e) {
      const err = toError(e);
      this.emit(BotEvent.ERROR, err);
    }
  }

  async #onCommand(ctx: Context) {
    try {
      const middlewares = [
        ...this.#middlewares.normal,
        ...(this.#commands.get(ctx.cmd.name) ?? []),
      ];
      async function runner(idx: number) {
        const fn = middlewares.at(idx);
        if (!fn) {
          return;
        }
        await fn(ctx, async () => runner(idx + 1));
      }
      await runner(0);
    } catch (e) {
      const err = toError(e);
      await this.#onCommandError(ctx, err);
    }
  }

  async #onCommandError(ctx: Context, err: Error) {
    try {
      const middlewares = this.#middlewares.error;
      if (middlewares.length < 1) {
        this.emit(BotEvent.ERROR, err);
        return;
      }
      async function runner(idx: number) {
        const fn = middlewares.at(idx);
        if (!fn) {
          return;
        }
        await fn(err, ctx, async () => runner(idx + 1));
      }
      await runner(0);
    } catch (e) {
      const err = toError(e);
      this.emit(BotEvent.ERROR, err);
    }
  }

  toString() {
    return `Bot<id=${this.id}>`;
  }

  valueOf() {
    return this.id;
  }

  toObject(): BotRecord {
    return {
      id: this.id,
      prefix: this.#prefix,
    };
  }

  toJSON(): BotJSON {
    return {
      type: "Bot",
      data: this.toObject(),
    };
  }

  getMe(): BotMe {
    if (this.state !== BotState.CONNECTED) {
      throw Error("client not connected");
    }
    const creds = this.cli.getCredentials();
    if (!creds || !creds.meJid || !creds.meLid) {
      throw Error("me not available");
    }
    const meLID = JID.parse(creds.meLid, false);
    const mePN = JID.parse(creds.meJid, false);
    return {
      lid: meLID,
      pn: mePN,
      name: creds?.meDisplayName ?? creds?.pushName ?? `+${mePN.user}`,
      username: undefined,
    };
  }

  getPrefix() {
    return this.#prefix;
  }

  setPrefix(prefix?: string) {
    if (prefix !== undefined) {
      assertTypeOf(prefix, "prefix", "string");
    }
    this.#prefix = prefix;
    return this;
  }

  use(...middlewares: Middleware[]) {
    assertInstanceOf(middlewares, "middlewares", Array);
    middlewares.forEach((m) => assertTypeOf(m, "middleware", "function"));
    this.#middlewares.normal.push(...middlewares);
    return this;
  }

  error(...middlewares: ErrorMiddleware[]) {
    assertInstanceOf(middlewares, "middlewares", Array);
    middlewares.forEach((m) => assertTypeOf(m, "middleware", "function"));
    this.#middlewares.error.push(...middlewares);
    return this;
  }

  command(name: string, ...middlewares: Middleware[]) {
    assertTypeOf(name, "name", "string");
    assertInstanceOf(middlewares, "middlewares", Array);
    if (name.length < 1) {
      throw TypeError("'name' cannot be empty");
    }
    this.#commands.set(name, middlewares);
    return this;
  }

  async start() {
    if (this.state === BotState.LOGGED_OUT) {
      throw Error("client logged out");
    }
    if (this.state !== BotState.DISCONNECTED) {
      return;
    }
    this.cli
      .on("auth_qr", this.#onAuthQr.bind(this))
      .on("connection", this.#onConnection.bind(this))
      .on("message", this.#onMessage.bind(this));
    this.on(BotEvent.COMMAND, this.#onCommand.bind(this));
    return this.cli.connect();
  }

  async stop() {
    if (this.state === BotState.LOGGED_OUT) {
      throw Error("bot client logged out");
    }
    if (
      this.state !== BotState.CONNECTED &&
      this.state !== BotState.RECONNECTING
    ) {
      throw Error("client not connected");
    }
    return this.cli.disconnect();
  }

  async destroy() {
    if (this.state === BotState.LOGGED_OUT) {
      throw Error("client logged out");
    }
    if (
      this.state !== BotState.CONNECTED &&
      this.state !== BotState.RECONNECTING
    ) {
      throw Error("client not connected");
    }
    return this.cli.logout();
  }
}
