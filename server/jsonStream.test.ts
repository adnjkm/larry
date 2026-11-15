import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { Kit } from "../shared/kit.ts";
import { createArrayScanner, type ScannedEvent } from "./jsonStream.ts";

type Doc = Record<string, unknown>;

function load(dir: string) {
  const url = new URL(`../fixtures/${dir}/`, import.meta.url);
  return readdirSync(url)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: `${dir}/${f}`, doc: JSON.parse(readFileSync(new URL(f, url), "utf8")) as Doc }));
}

const kits = load("kits");
const firstKit = kits[0]!.doc as Kit;

const tricky: Kit = {
  ...firstKit,
  name: 'The "parts" {kit}',
  summary: 'Quotes \\" and backslashes \\\\ and ]} brackets, "parts": [ in text.',
  parts: firstKit.parts.map((part, i) => (i === 0 ? { ...part, name: 'a "b" \\ {c} [d]', role: "ends with a backslash \\" } : part)),
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scan(key: string, chunks: string[]) {
  const scanner = createArrayScanner(key);
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
  for (let i = 0; i < text.length;) {
    const size = 1 + Math.floor(next() * maxSize);
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}

function expected(doc: Doc, key: string) {
  const keys = Object.keys(doc);
  const header = Object.fromEntries(keys.slice(0, keys.indexOf(key)).map((k) => [k, doc[k]]));
  return [{ type: "header", value: { ...header, [key]: [] } }, ...(doc[key] as unknown[]).map((value) => ({ type: "item", value }))];
}

const cases = [
  ...kits.map(({ name, doc }) => ({ name, doc, key: "parts" })),
  { name: "tricky strings", doc: tricky as unknown as Doc, key: "parts" },
  ...load("lessons").map(({ name, doc }) => ({ name, doc, key: "chapters" })),
];

for (const { name, doc, key } of cases) {
  const text = JSON.stringify(doc);
  const assertEmits = (chunks: string[]) =>
    assert.deepEqual(
      scan(key, chunks).map((e) => e.event),
      expected(doc, key),
    );

  test(`${name}: one character at a time`, () => assertEmits([...text]));

  test(`${name}: random chunk sizes`, () => {
    for (let seed = 1; seed <= 20; seed++) assertEmits(randomChunks(text, seed, seed % 2 === 0 ? 7 : 120));
  });

  test(`${name}: every two-way split`, () => {
    for (let i = 1; i < text.length; i += Math.max(1, Math.floor(text.length / 400))) assertEmits([text.slice(0, i), text.slice(i)]);
  });

  test(`${name}: each element appears as soon as its closing brace arrives`, () => {
    const events = scan(key, [...text]);
    const items = events.filter((e) => e.event.type === "item");
    const elements = doc[key] as unknown[];
    assert.equal(items.length, elements.length);
    for (const [i, { consumed }] of items.entries()) {
      const serialized = JSON.stringify(elements[i]);
      assert.equal(consumed, text.indexOf(serialized) + serialized.length);
    }
    assert.ok(events[0]!.consumed < events[1]!.consumed);
    assert.ok(items[0]!.consumed < text.length);
  });
}

test("an element that is not valid JSON is skipped and the next one still arrives", () => {
  const text = '{"name":"n","summary":"s","parts":[{"a":,},{"b":1}]}';
  const events = scan("parts", [text]).map((e) => e.event);
  assert.deepEqual(events, [
    { type: "header", value: { name: "n", summary: "s", parts: [] } },
    { type: "item", value: { b: 1 } },
  ]);
});
