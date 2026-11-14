import { Kit, type KitEvent } from "../shared/kit.ts";

export type ScannedEvent = Extract<KitEvent, { type: "started" }> | { type: "part"; part: unknown };

const Header = Kit.pick({ name: true, summary: true });

/**
 * Reads the kit JSON as it is written, one chunk at a time, and reports the header and each
 * finished part. It only looks at new characters, tracking string state and bracket depth:
 * depth 1 is the kit object, 2 the parts array, 3 a part object.
 */
export function createKitScanner() {
  let text = "";
  let pos = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  let stringIsKey = false;
  let expectKey = false;
  let sentHeader = false;
  let inParts = false;
  let partStart = 0;

  function header(keyStart: number): ScannedEvent | undefined {
    try {
      const parsed = Header.safeParse(JSON.parse(`${text.slice(0, keyStart)}"parts":[]}`));
      return parsed.success ? { type: "started", ...parsed.data } : undefined;
    } catch {
      return undefined;
    }
  }

  function push(chunk: string): ScannedEvent[] {
    const events: ScannedEvent[] = [];
    text += chunk;
    for (; pos < text.length; pos++) {
      const c = text[pos];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') {
          inString = false;
          if (stringIsKey && !sentHeader && text.slice(stringStart, pos + 1) === '"parts"') {
            sentHeader = true;
            const started = header(stringStart);
            if (started) events.push(started);
          }
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        stringStart = pos;
        stringIsKey = depth === 1 && expectKey;
        expectKey = false;
      } else if (c === "{" || c === "[") {
        depth++;
        if (c === "{" && depth === 1) expectKey = true;
        if (c === "[" && depth === 2 && sentHeader) inParts = true;
        if (c === "{" && depth === 3 && inParts) partStart = pos;
      } else if (c === "}" || c === "]") {
        if (c === "}" && depth === 3 && inParts) {
          try {
            events.push({ type: "part", part: JSON.parse(text.slice(partStart, pos + 1)) });
          } catch {
            // The done event carries the checked kit, so an unreadable part is only skipped here.
          }
        }
        depth--;
        if (c === "]" && depth === 1) inParts = false;
      } else if (c === "," && depth === 1) {
        expectKey = true;
      }
    }
    return events;
  }

  return { push };
}
