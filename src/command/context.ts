import { Message } from "../bot/index.js";
import type { ParsedCommand } from "./index.js";
import {
  assertInstanceOf,
  assertPropertyInstanceOf,
  assertPropertyTypeOf,
  assertTypeOf,
} from "../utils/index.js";

export class Context {
  readonly cmd: ParsedCommand;
  readonly msg: Message;

  constructor(cmd: ParsedCommand, msg: Message) {
    assertTypeOf(cmd, "cmd", "object");
    assertPropertyTypeOf(cmd, "prefix", "string");
    assertPropertyTypeOf(cmd, "name", "string");
    assertPropertyInstanceOf(cmd, "args", Array);
    assertInstanceOf(msg, "msg", Message);
    this.cmd = cmd;
    this.msg = msg;
  }
}
