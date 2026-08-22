import { assertTypeOf, parseArguments } from "../utils/index.js";

export interface ParsedCommand {
  prefix: string;
  name: string;
  args: string[];
}

export function parseCommand(
  str: string,
  prefix?: string,
): ParsedCommand | undefined {
  assertTypeOf(str, "str", "string");
  if (prefix !== undefined) {
    assertTypeOf(prefix, "prefix", "string");
    if (!str.startsWith(prefix)) {
      return;
    }
  }
  const args = parseArguments(str);
  prefix ??= args.at(0)?.at(0);
  if (prefix === undefined) {
    return;
  }
  const name = args.at(0)?.substring(prefix.length).toLowerCase();
  if (!name) {
    return;
  }
  return {
    prefix,
    name,
    args: args.slice(1),
  };
}
