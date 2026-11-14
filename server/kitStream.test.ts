import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { Kit } from "../shared/kit.ts";
import { createKitScanner, type ScannedEvent } from "./kitStream.ts";

const kitDir = new URL("../fixtures/kits/", import.meta.url);
const fixtures = readdirSync(kitDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ name: f, kit: JSON.parse(readFileSync(new URL(f, kitDir), "utf8")) as Kit }));

const tricky: Kit = {
  ...fixtures[0]!.kit,
  name: 'The "parts" {kit}',
  summary: 'Quotes \\" and backslashes \\\\ and ]} brackets, "parts": [ in text.',
  parts: fixtures[0]!.kit.parts.map((part, i) => (i === 0 ? { ...part, name: 'a "b" \\ {c} [d]', role: 'ends with a backslash \\' } : part)),
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scan(chunks: string[]) {
  const scanner = createKitScanner();
  const events: { event: ScannedEvent; consumed: number }[] = [];
  let consumed = 0;
  for (const chunk of chunks) {
    consumed += chunk.length;
    for (const event of scanner.push(chunk)) events.push({ event, consumed });
  }
  return events;
}

function randomChunks(text: string, seed: number, maxSize: number) {
  const next = mulberry32(seed);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; ) {
    const size = 1 + Math.floor(next() * maxSize);
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}

function assertEmitsKit(kit: Kit, chunks: string[]) {
  const events = scan(chunks).map((e) => e.event);
  assert.deepEqual(events, [{ type: "started", name: kit.name, summary: kit.summary }, ...kit.parts.map((part) => ({ type: "part", part }))]);
}

for (const { name, kit } of [...fixtures, { name: "tricky strings", kit: tricky }]) {
  const text = JSON.stringify(kit);

  test(`${name}: one character at a time`, () => assertEmitsKit(kit, [...text]));

  test(`${name}: random chunk sizes`, () => {
    for (let seed = 1; seed <= 20; seed++) assertEmitsKit(kit, randomChunks(text, seed, seed % 2 === 0 ? 7 : 120));
  });

  test(`${name}: every two-way split`, () => {
    for (let i = 1; i < text.length; i++) assertEmitsKit(kit, [text.slice(0, i), text.slice(i)]);
  });

  test(`${name}: each part appears as soon as its closing brace arrives`, () => {
    const events = scan([...text]);
    const parts = events.filter((e) => e.event.type === "part");
    assert.equal(parts.length, kit.parts.length);
    for (const [i, { consumed }] of parts.entries()) {
      const serialized = JSON.stringify(kit.parts[i]);
      assert.equal(consumed, text.indexOf(serialized) + serialized.length);
    }
    assert.ok(events[0]!.consumed < events[1]!.consumed);
    assert.ok(parts[0]!.consumed < text.length);
  });
}

test("a part that is not valid JSON is skipped and the next part still arrives", () => {
  const text = '{"name":"n","summary":"s","parts":[{"a":,},{"b":1}]}';
  const events = scan([text]).map((e) => e.event);
  assert.deepEqual(events, [{ type: "started", name: "n", summary: "s" }, { type: "part", part: { b: 1 } }]);
});
