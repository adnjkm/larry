import assert from "node:assert/strict";
import { test } from "node:test";
import { LOOK, MATERIAL_NAMES } from "./look.ts";
import { paintField } from "./paint.ts";
import type { Field } from "./relief.ts";

// Node has no ImageData; paintField only touches data, so a plain object does.
const image = (cols: number, rows: number) => ({ data: new Uint8ClampedArray(cols * rows * 4), width: cols, height: rows }) as unknown as ImageData;

function field(cols: number, rows: number, fill: { tone?: number; cover?: number; cast?: number; owner?: number }): Field {
  const n = cols * rows;
  return {
    cols,
    rows,
    cell: 1,
    tone: new Float32Array(n).fill(fill.tone ?? 0),
    owner: new Int8Array(n).fill(fill.owner ?? 0),
    cover: new Float32Array(n).fill(fill.cover ?? 0),
    cast: new Float32Array(n).fill(fill.cast ?? 0),
  };
}

const pixels = (out: ImageData) => Array.from({ length: out.data.length / 4 }, (_, c) => Array.from(out.data.subarray(c * 4, c * 4 + 4)).join(","));
const rgba = (rgb: readonly number[]) => [...rgb, 255].join(",");
const bone = LOOK.materials.bone.tones;
const boneIndex = MATERIAL_NAMES.indexOf("bone");
const still = { origin: [0, 0], drift: 0, seconds: 0 } as const;

function paint(f: Field | Field[], opts: { origin: readonly [number, number]; drift: number; seconds: number } = still) {
  const fields = Array.isArray(f) ? f : [f];
  const out = image(fields[0]!.cols, fields[0]!.rows);
  paintField(fields, out, opts);
  return out;
}

test("a flat tone dithers between the two tones either side of it, in proportion", () => {
  // 0.625 of the way along five tones is 2.5 steps: tones 2 and 3, half the cells on each.
  const counts = new Map<string, number>();
  for (const p of pixels(paint(field(8, 8, { tone: 0.625, cover: 1, owner: boneIndex })))) counts.set(p, (counts.get(p) ?? 0) + 1);
  assert.deepEqual([...counts.keys()].sort(), [rgba(bone[2]!), rgba(bone[3]!)].sort());
  assert.equal(counts.get(rgba(bone[3]!)), 32);
});

test("the ends of the tone range are solid", () => {
  assert.ok(pixels(paint(field(4, 4, { tone: 0, cover: 1, owner: boneIndex }))).every((p) => p === rgba(bone[0]!)));
  assert.ok(pixels(paint(field(4, 4, { tone: 1, cover: 1, owner: boneIndex }))).every((p) => p === rgba(bone[4]!)));
});

test("origin moves the pattern with the part, so neighbours line up", () => {
  const f = field(8, 4, { tone: 0.6, cover: 1, owner: boneIndex });
  const a = pixels(paint(f));
  const b = pixels(paint(f, { origin: [1, 0], drift: 0, seconds: 0 }));
  for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) assert.equal(b[y * 8 + x], a[y * 8 + x + 1], `cell ${x},${y}`);
});

test("uncovered cells are the shadow's ink or transparent, by how much shadow falls there", () => {
  const none = paint(field(4, 4, { owner: -1 }));
  assert.ok(none.data.every((v) => v === 0));
  const full = pixels(paint(field(4, 4, { cast: 1, owner: -1 })));
  assert.ok(full.every((p) => p === rgba(LOOK.ink)));
  const half = pixels(paint(field(4, 4, { cast: 0.5, owner: -1 })));
  assert.ok(half.every((p) => p === rgba(LOOK.ink) || p === "0,0,0,0"));
  assert.ok(half.includes("0,0,0,0") && half.includes(rgba(LOOK.ink)));
});

test("several fields average their tone and cover; the first owner wins", () => {
  const dark = field(4, 4, { tone: 0, cover: 1, owner: boneIndex });
  const light = field(4, 4, { tone: 1, cover: 1, owner: 1 });
  assert.deepEqual(pixels(paint([dark, light])), pixels(paint(field(4, 4, { tone: 0.5, cover: 1, owner: boneIndex }))));
  const half = pixels(paint([field(4, 4, { cover: 1, owner: boneIndex }), field(4, 4, { cover: 0, owner: boneIndex })]));
  assert.equal(half.filter((p) => p !== "0,0,0,0").length, 8);
});

test("without drift a paint holds still; with drift the grain moves but stays between neighbouring tones", () => {
  const f = field(32, 32, { tone: 0.45, cover: 1, owner: boneIndex });
  assert.deepEqual(pixels(paint(f, { origin: [2, 3], drift: 0, seconds: 0 })), pixels(paint(f, { origin: [2, 3], drift: 0, seconds: 9.5 })));
  const a = pixels(paint(f, { origin: [0, 0], drift: 1, seconds: 0 }));
  const b = pixels(paint(f, { origin: [0, 0], drift: 1, seconds: 3 }));
  assert.notDeepEqual(a, b);
  const allowed = new Set([rgba(bone[1]!), rgba(bone[2]!)]);
  assert.ok([...a, ...b].every((p) => allowed.has(p)));
});
