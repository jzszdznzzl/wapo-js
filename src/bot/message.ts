import {
  getContentType,
  proto,
  type WaSendMessageContent,
  type WaSendMessageOptions,
  type WaIncomingMessageEvent,
  downloadMediaMessage,
  type WaDownloadMediaMessageOptions,
} from "zapo-js";
import { JID, JIDServer, Bot } from "./index.js";
import {
  assertPropertyTypeOf,
  assertTypeOf,
  assertInstanceOf,
  hasProperty,
  hasPropertyInstanceOf,
  hasPropertyTypeOf,
  isTypeOf,
  parseJSON,
  streamToBuffer,
  toNumber,
} from "../utils/index.js";
import { Readable } from "node:stream";
import Long from "long";

interface BufferJSON {
  type: "Buffer";
  data: number[];
}

export interface MessageRecord {
  id: string;
  from: JID;
  sender?: JID;
  type?: keyof proto.IMessage;
  body?: string;
  media?: MessageMediaRecord;
  mentions: JID[];
  timestamp: number;
  quoted?: MessageRecord;
}

export interface MessageMediaRecord {
  phash: Buffer;
  key: Buffer;
  path: string;
  filename?: string;
  mimetype: string;
  url: URL;
  length: number;
}

export interface MessageJSON {
  type: "Message";
  data: {
    id: string;
    from: string;
    sender?: string;
    type?: string;
    body?: string;
    media?: {
      phash: BufferJSON;
      key: BufferJSON;
      path: string;
      filename?: string;
      mimetype: string;
      url: string;
      length: number;
    };
    mentions: string[];
    timestamp: number;
    quoted?: MessageJSON;
  };
}

export interface MessageMedia extends Readonly<MessageMediaRecord> {}

export interface ReplyRecord {
  id: string;
  msg: MessageRecord;
}

export interface ReplyJSON {
  type: "Reply";
  data: {
    id: string;
    msg: MessageJSON;
  };
}

export class Message {
  #evt: WaIncomingMessageEvent;

  readonly bot: Bot;
  readonly id: string;
  readonly from: JID;
  readonly sender?: JID;
  readonly type?: keyof proto.IMessage;
  readonly body?: string;
  readonly media?: MessageMedia;
  readonly mentions: readonly JID[];
  readonly timestamp: number;
  readonly quoted?: Message;

  constructor(evt: WaIncomingMessageEvent, bot: Bot) {
    assertTypeOf(evt, "evt", "object");
    assertInstanceOf(bot, "bot", Bot);
    assertPropertyTypeOf(evt.key, "id", "string");
    assertPropertyTypeOf(evt.key, "remoteJid", "string");
    this.#evt = evt;
    this.bot = bot;
    this.id = this.#evt.key.id;
    this.from = this.#getFrom();
    this.sender = this.#getSender();
    if (hasPropertyInstanceOf(this.#evt, "message", proto.Message)) {
      const msg = this.#evt.message;
      this.type = this.#getType(msg);
      this.body = this.#getBody(msg);
      this.media = this.#getMedia(msg);
      this.mentions = this.#getMentions(msg);
      this.quoted = this.#getQuoted(msg);
    } else {
      this.mentions = [];
    }
    const t = this.#evt.timestampSeconds;
    this.timestamp = toNumber(t ? t * 1000 : Date.now());
  }

  #getContent(msg?: proto.IMessage) {
    const type = this.#getType(msg);
    if (!type || !hasProperty(msg, type)) {
      return;
    }
    return msg[type];
  }

  #getFrom() {
    const key = this.#evt.key;
    let from = JID.parse(key.remoteJid, false);
    if (from.server !== JIDServer.LID && key.remoteJidAlt) {
      const alt = JID.parse(key.remoteJidAlt, false);
      if (alt.server === JIDServer.LID) {
        from = alt;
      }
    }
    return from;
  }

  #getSender() {
    const key = this.#evt.key;
    let sender: JID | undefined;
    if (key.fromMe) {
      sender = this.bot.getMe().lid;
    } else if (key.isNewsletter) {
      sender = this.from;
    } else if (key.participant) {
      sender = JID.parse(key.participant, false);
      if (sender.server !== JIDServer.LID && key.participantAlt) {
        const alt = JID.parse(key.participantAlt, false);
        if (alt.server === JIDServer.LID) {
          sender = alt;
        }
      }
    }
    return sender;
  }

  #getType(msg?: proto.IMessage) {
    return getContentType(msg);
  }

  #getBody(msg?: proto.IMessage): string | undefined {
    const ctn = this.#getContent(msg);
    let body: string | undefined;
    if (isTypeOf(ctn, "string")) {
      body = ctn;
    } else if (hasPropertyInstanceOf(ctn, "message", proto.Message)) {
      body = this.#getBody(ctn.message);
    } else if (hasPropertyTypeOf(ctn, "text", "string")) {
      body = ctn.text;
    } else if (hasPropertyTypeOf(ctn, "caption", "string")) {
      body = ctn.caption;
    } else if (hasPropertyTypeOf(ctn, "selectedButtonId", "string")) {
      body = ctn.selectedButtonId;
    } else if (hasPropertyTypeOf(ctn, "selectedId", "string")) {
      body = ctn.selectedId;
    } else if (
      hasPropertyInstanceOf(
        ctn,
        "singleSelectReply",
        proto.Message.ListResponseMessage.SingleSelectReply,
      )
    ) {
      if (hasPropertyTypeOf(ctn.singleSelectReply, "selectedRowId", "string")) {
        body = ctn.singleSelectReply.selectedRowId;
      }
    } else if (
      hasPropertyInstanceOf(
        ctn,
        "nativeFlowResponseMessage",
        proto.Message.InteractiveResponseMessage.NativeFlowResponseMessage,
      )
    ) {
      if (
        hasPropertyTypeOf(ctn.nativeFlowResponseMessage, "paramsJson", "string")
      ) {
        const params =
          parseJSON(ctn.nativeFlowResponseMessage.paramsJson) ?? {};
        if (hasPropertyTypeOf(params, "id", "string")) {
          body = params.id;
        }
        if (hasPropertyTypeOf(params, "selected_id", "string")) {
          body = params.selected_id;
        }
      }
    }
    return body?.trim();
  }

  #getMedia(msg?: proto.IMessage): MessageMedia | undefined {
    const ctn = this.#getContent(msg);
    let phash: Buffer | undefined;
    let key: Buffer | undefined;
    let path: string | undefined;
    let filename: string | undefined;
    let mimetype: string | undefined;
    let url: URL | undefined;
    let length: number | undefined;
    if (hasPropertyInstanceOf(ctn, "message", proto.Message)) {
      return this.#getMedia(ctn.message);
    }
    if (hasPropertyInstanceOf(ctn, "fileSha256", Uint8Array)) {
      phash = Buffer.from(ctn.fileSha256);
    }
    if (hasPropertyInstanceOf(ctn, "mediaKey", Uint8Array)) {
      key = Buffer.from(ctn.mediaKey);
    }
    if (hasPropertyTypeOf(ctn, "directPath", "string")) {
      path = ctn.directPath.trim();
    }
    if (hasPropertyTypeOf(ctn, "fileName", "string")) {
      filename = ctn.fileName.trim();
    }
    if (hasPropertyTypeOf(ctn, "mimetype", "string")) {
      mimetype = ctn.mimetype.trim();
    }
    if (hasPropertyTypeOf(ctn, "url", "string")) {
      url = new URL(ctn.url);
    }
    if (hasProperty(ctn, "fileLength") && ctn.fileLength) {
      length = toNumber(Long.fromValue(ctn.fileLength as number | Long));
    }
    if (!phash || !key || !path || !mimetype || !url || !length) {
      return;
    }
    return {
      phash,
      key,
      path,
      filename,
      mimetype,
      url,
      length,
    };
  }

  #getMentions(msg?: proto.IMessage): JID[] {
    const ctn = this.#getContent(msg);
    const mentions: JID[] = [];
    if (hasPropertyInstanceOf(ctn, "message", proto.Message)) {
      return this.#getMentions(ctn.message);
    }
    if (hasPropertyInstanceOf(ctn, "contextInfo", proto.ContextInfo)) {
      if (hasPropertyInstanceOf(ctn.contextInfo, "mentionedJid", Array)) {
        new Set(ctn.contextInfo.mentionedJid).values().forEach((jid) => {
          mentions.push(JID.parse(jid, false));
        });
      }
    }
    return mentions;
  }

  #getQuoted(msg?: proto.IMessage): Message | undefined {
    const ctn = this.#getContent(msg);
    if (hasPropertyInstanceOf(ctn, "message", proto.Message)) {
      return this.#getQuoted(ctn.message);
    }
    if (!hasPropertyInstanceOf(ctn, "contextInfo", proto.ContextInfo)) {
      return;
    }
    if (!hasPropertyTypeOf(ctn.contextInfo, "stanzaId", "string")) {
      return;
    }
    if (
      !hasPropertyInstanceOf(ctn.contextInfo, "quotedMessage", proto.Message)
    ) {
      return;
    }
    const ctx = ctn.contextInfo;
    const quoted = ctx.quotedMessage;
    const remoteJid = ctx.remoteJid
      ? JID.parse(ctx.remoteJid, false)
      : this.from;
    const participant = ctx.participant
      ? JID.parse(ctx.participant, false)
      : undefined;
    const me = this.bot.getMe();
    const fromMe = participant
      ? [me.lid, me.pn].some((j) => JID.equal(j, participant))
      : false;
    const evt: WaIncomingMessageEvent = {
      rawNode: this.#evt.rawNode,
      key: {
        id: ctx.stanzaId,
        remoteJid: remoteJid.toString(),
        participant: fromMe
          ? JID.normalize(me.lid).toString()
          : participant?.toString(),
        fromMe,
        isGroup: remoteJid.server === JIDServer.G_US,
        isBroadcast: remoteJid.server === JIDServer.BROADCAST,
        isNewsletter: remoteJid.server === JIDServer.NEWSLETTER,
        senderDevice: participant?.device ?? 0,
      },
      message: quoted ? quoted : undefined,
    };
    return new Message(evt, this.bot);
  }

  raw() {
    return { ...this.#evt };
  }

  toString() {
    return `Message<id=${this.id}, from=${this.from.toString()}, sender=${this.sender?.toString()}, body=${this.body}>`;
  }

  valueOf() {
    return this.id;
  }

  toObject(): MessageRecord {
    return {
      id: this.id,
      from: this.from,
      sender: this.sender,
      type: this.type,
      body: this.body,
      media: this.media ? { ...this.media } : undefined,
      mentions: [...this.mentions],
      timestamp: this.timestamp,
      quoted: this.quoted?.toObject(),
    };
  }

  toJSON(): MessageJSON {
    return {
      type: "Message",
      data: {
        id: this.id,
        from: this.from.toString(),
        sender: this.sender?.toString(),
        type: this.type,
        body: this.body,
        media: this.media
          ? {
              phash: this.media.phash.toJSON(),
              key: this.media.key.toJSON(),
              path: this.media.path,
              filename: this.media.filename,
              mimetype: this.media.mimetype,
              url: this.media.url.toString(),
              length: this.media.length,
            }
          : undefined,
        mentions: this.mentions.map((j) => j.toString()),
        timestamp: this.timestamp,
        quoted: this.quoted?.toJSON(),
      },
    };
  }

  async reply(ctn: WaSendMessageContent, opts?: WaSendMessageOptions) {
    return this.bot.cli.message
      .send(this.from.toString(), ctn, {
        ...(opts ?? {}),
        quote: this.#evt,
      })
      .then((r) => new Reply(r.id, this));
  }

  async react(emoji: string) {
    assertTypeOf(emoji, "emoji", "string");
    return this.reply({
      type: "reaction",
      emoji,
      target: this.#evt,
    });
  }

  async edit(ctn: WaSendMessageContent, opts?: WaSendMessageOptions) {
    if (!this.#evt.key.fromMe) {
      throw Error(`'${this.id}' message was not sent by the bot client`);
    }
    return this.reply(ctn, {
      ...(opts ?? {}),
      editKey: this.#evt,
    });
  }

  async del() {
    await this.reply({
      type: "revoke",
      target: this.#evt.key,
    });
  }

  download<T extends "stream">(
    type: T,
    opts?: WaDownloadMediaMessageOptions,
  ): Promise<Readable>;
  download<T extends "buffer">(
    type: T,
    opts?: WaDownloadMediaMessageOptions,
  ): Promise<Buffer>;
  async download<T extends "stream" | "buffer">(
    type?: T,
    opts?: WaDownloadMediaMessageOptions,
  ) {
    if (!this.media) {
      throw TypeError(`'${this.id}' message is not a multimedia message`);
    }
    const stream = await downloadMediaMessage(this.#evt, opts);
    if (type === "buffer") {
      return streamToBuffer(stream);
    }
    return stream;
  }

  async read() {
    await this.bot.cli.message.sendReceipt([this.#evt], { type: "read" });
  }
}

export class Reply {
  readonly id: string;
  readonly msg: Message;

  constructor(id: string, msg: Message) {
    assertTypeOf(id, "id", "string");
    assertInstanceOf(msg, "msg", Message);
    this.id = id;
    this.msg = msg;
  }

  toString() {
    return `Reply<id=${this.id}, from=${this.msg.from.toString()}>`;
  }

  valueOf() {
    return this.id;
  }

  toObject(): ReplyRecord {
    return {
      id: this.id,
      msg: this.msg.toObject(),
    };
  }

  toJSON(): ReplyJSON {
    return {
      type: "Reply",
      data: {
        id: this.id,
        msg: this.msg.toJSON(),
      },
    };
  }

  async reply(ctn: WaSendMessageContent, opts?: WaSendMessageOptions) {
    return this.msg.bot.cli.message
      .send(this.msg.from.toString(), ctn, {
        ...(opts ?? {}),
        quote: {
          id: this.id,
          remoteJid: this.msg.from.toString(),
          fromMe: true,
        },
      })
      .then((r) => new Reply(r.id, this.msg));
  }

  async react(emoji: string) {
    assertTypeOf(emoji, "emoji", "string");
    return this.reply({
      type: "reaction",
      emoji,
      target: {
        id: this.id,
        remoteJid: this.msg.from.toString(),
        fromMe: true,
      },
    });
  }

  async edit(ctn: WaSendMessageContent, opts?: WaSendMessageOptions) {
    return this.reply(ctn, {
      ...(opts ?? {}),
      editKey: {
        id: this.id,
        remoteJid: this.msg.from.toString(),
        fromMe: true,
      },
    });
  }

  async del() {
    await this.reply({
      type: "revoke",
      target: {
        id: this.id,
        remoteJid: this.msg.from.toString(),
        fromMe: true,
      },
    });
  }
}
