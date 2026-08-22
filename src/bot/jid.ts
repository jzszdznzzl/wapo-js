import { assertInstanceOf, assertTypeOf, isTypeOf } from "../utils/index.js";

export enum JIDServer {
  S_WHATSAPP_NET = "s.whatsapp.net",
  LID = "lid",
  C_US = "c.us",
  G_US = "g.us",
  NEWSLETTER = "newsletter",
  BROADCAST = "broadcast",
  HOSTED = "hosted",
  HOSTED_LID = "hosted.lid",
  BOT = "bot",
  MSGR = "msgr",
  INTEROP = "interop",
}

export interface JIDRecord {
  user: string;
  agent?: number;
  device?: number;
  server: JIDServer;
}

export interface JIDJSON {
  type: "JID";
  data: {
    user: string;
    agent?: number;
    device?: number;
    server: string;
  };
}

export class JID {
  static readonly REGEXP = new RegExp(
    `^([0-9-]+|[a-z-]+)(?:\\.([0-9]+))?(?::([0-9]+))?@(${Object.values(
      JIDServer,
    )
      .map((s) => s.replace(/\./g, "\\."))
      .join("|")})$`,
  );

  readonly user: string;
  agent?: number;
  device?: number;
  readonly server: JIDServer;

  constructor(
    user: string,
    agent: number | undefined,
    device: number | undefined,
    server: JIDServer,
  ) {
    assertTypeOf(user, "user", "string");
    if (agent !== undefined) {
      assertTypeOf(agent, "agent", "number");
    }
    if (device !== undefined) {
      assertTypeOf(device, "device", "number");
    }
    assertTypeOf(server, "server", "string");
    if (!Object.values(JIDServer).includes(server)) {
      throw TypeError(`'${server}' is not a valid JIDServer`);
    }
    this.user = user;
    this.agent = agent;
    this.device = device;
    this.server = server;
  }

  toString() {
    return (
      this.user +
      (this.agent ? `.${this.agent}` : "") +
      (this.device ? `:${this.device}` : "") +
      `@${this.server}`
    );
  }

  valueOf() {
    return this.toString();
  }

  toObject(): JIDRecord {
    return {
      user: this.user,
      agent: this.agent,
      device: this.device,
      server: this.server,
    };
  }

  toJSON(): JIDJSON {
    return {
      type: "JID",
      data: this.toObject(),
    };
  }

  static equal(jid1: JID, jid2: JID) {
    assertInstanceOf(jid1, "jid1", JID);
    assertInstanceOf(jid2, "jid2", JID);
    return jid1.user === jid2.user && jid1.server === jid2.server;
  }

  static normalize(jid: JID) {
    assertInstanceOf(jid, "jid", JID);
    const { user, server } = jid.toObject();
    return new JID(user, undefined, undefined, server);
  }

  static parse(str: string, safe: false): JID;
  static parse(str: string, safe: true): JID | undefined;
  static parse(str: string, safe: boolean) {
    if (!isTypeOf(str, "string")) {
      if (safe) {
        return;
      }
      assertTypeOf(str, "str", "string");
    }
    const matched = str.match(this.REGEXP);
    if (!matched) {
      if (safe) {
        return;
      }
      throw TypeError(`'${str}' is not a valid JID`);
    }
    const [user, agent, device, server] = matched.slice(1);
    return new JID(
      user,
      agent ? parseInt(agent) : undefined,
      device ? parseInt(device) : undefined,
      server as JIDServer,
    );
  }
}
