export type ScannedEvent = { type: "header"; value: unknown } | { type: "item"; value: unknown };

/**
 * Reads a JSON object as it is written, one chunk at a time. When the top-level key `arrayKey` is
 * reached it reports the fields written before it, then each element of that array as soon as the
 * element closes. It only looks at new characters, tracking string state and bracket depth:
 * depth 1 is the root object, 2 the array, 3 an element object.
 */
export function createArrayScanner(arrayKey: string) {
  const quotedKey = JSON.stringify(arrayKey);
  let text = "";
  let pos = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  let stringIsKey = false;
  let expectKey = false;
  let sentHeader = false;
  let inArray = false;
  let itemStart = 0;

  function header(keyStart: number): ScannedEvent | undefined {
    try {
      return { type: "header", value: JSON.parse(`${text.slice(0, keyStart)}${quotedKey}:[]}`) };
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
          if (stringIsKey && !sentHeader && text.slice(stringStart, pos + 1) === quotedKey) {
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
        if (c === "[" && depth === 2 && sentHeader) inArray = true;
        if (c === "{" && depth === 3 && inArray) itemStart = pos;
      } else if (c === "}" || c === "]") {
        if (c === "}" && depth === 3 && inArray) {
          try {
            events.push({ type: "item", value: JSON.parse(text.slice(itemStart, pos + 1)) });
          } catch {
            // The final result is parsed whole, so an unreadable element is only skipped here.
          }
        }
        depth--;
        if (c === "]" && depth === 1) inArray = false;
      } else if (c === "," && depth === 1) {
        expectKey = true;
      }
    }
    return events;
  }

  return { push };
}
