import { assertTypeOf, isTypeOf } from "./index.js";

export function parseArguments(str: string) {
  assertTypeOf(str, "str", "string");
  const args: string[] = [];
  str = str.trim();
  if (str.length < 1) {
    return args;
  }
  let curr = "";
  let idx = 0;
  const length = str.length;
  let inQuote = false;
  while (idx < length) {
    const char = str[idx];
    if (/\s/.test(char)) {
      if (curr.length > 0 || inQuote) {
        args.push(curr);
        curr = "";
        inQuote = false;
      }
      idx++;
      continue;
    }
    if (char === '"') {
      inQuote = true;
      idx++;
      while (idx < length) {
        const c = str[idx];
        if (c === "\\" && idx + 1 < length) {
          const next = str[idx + 1];
          if (
            next === '"' ||
            next === "\\" ||
            next === "'" ||
            next === "n" ||
            next === "t" ||
            next === "r"
          ) {
            if (next === "n") {
              curr += "\n";
            } else if (next === "t") {
              curr += "\t";
            } else if (next === "r") {
              curr += "\r";
            } else {
              curr += next;
            }
            idx += 2;
          } else {
            curr += c;
            idx++;
          }
        } else if (c === '"') {
          idx++;
          break;
        } else {
          curr += c;
          idx++;
        }
      }
      continue;
    }
    if (char === "'") {
      inQuote = true;
      idx++;
      while (idx < length) {
        const c = str[idx];
        if (c === "\\" && idx + 1 < length) {
          const next = str[idx + 1];
          if (next === "'" || next === "\\") {
            curr += next;
            idx += 2;
          } else {
            curr += c;
            idx++;
          }
        } else if (c === "'") {
          idx++;
          break;
        } else {
          curr += c;
          idx++;
        }
      }
      continue;
    }
    if (char === "\\" && idx + 1 < length) {
      curr += str[idx + 1];
      idx += 2;
      inQuote = false;
      continue;
    }
    curr += char;
    inQuote = false;
    idx++;
  }
  if (curr.length > 0 || inQuote) {
    args.push(curr);
  }
  return args;
}

export function parseJSON(str: string): object | undefined {
  try {
    if (!isTypeOf(str, "string") || !str) {
      return;
    }
    return JSON.parse(str);
  } catch {
    return;
  }
}

export function stringifyJSON(obj: object) {
  try {
    if (!isTypeOf(obj, "object") || !obj) {
      return;
    }
    const seen = new WeakSet();
    return JSON.stringify(obj, (_, value) => {
      if (isTypeOf(value, "object") && value) {
        if (seen.has(value)) {
          return "[Circular]";
        }
      }
      if (isTypeOf(value, "symbol")) {
        return value.toString();
      }
      if (isTypeOf(value, "function")) {
        return `[Function: ${value.name}]`;
      }
      if (isTypeOf(value, "bigint")) {
        return value.toString();
      }
      return value;
    });
  } catch {
    return;
  }
}
