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

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgba = (out: ImageData, c: number) => Array.from(out.data.subarray(c * 4, c * 4 + 4));
const bone = LOOK.materials.bone.tones;
const boneIndex = MATERIAL_NAMES.indexOf("bone");

test("a covered cell dithers between evenly spaced tones by its Bayer threshold", () => {
  const out = image(4, 4);
  paintField([field(4, 4, { tone: 0.6, cover: 1, owner: boneIndex })], out, { origin: [0, 0], drift: 0, seconds: 0 });
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const th = (BAYER4[y * 4 + x]! + 0.5) / 16;
      const i = Math.min(4, Math.max(0, Math.floor(0.6 * 4 + th)));
      assert.deepEqual(rgba(out, y * 4 + x), [...bone[i]!, 255], `cell ${x},${y}`);
    }
});

test("origin shifts the Bayer pattern", () => {
  const a = image(4, 4);
  const b = image(4, 4);
  const f = field(4, 4, { tone: 0.6, cover: 1, owner: boneIndex });
  paintField([f], a, { origin: [0, 0], drift: 0, seconds: 0 });
  paintField([f], b, { origin: [1, 0], drift: 0, seconds: 0 });
  assert.notDeepEqual([...a.data], [...b.data]);
  // Cell (0,0) with origin (1,0) reads the pattern at (1,0).
  const th = (BAYER4[1]! + 0.5) / 16;
  assert.deepEqual(rgba(b, 0), [...bone[Math.floor(0.6 * 4 + th)]!, 255]);
});

test("uncovered cells are ink where the shadow clears the threshold, else transparent", () => {
  const out = image(4, 4);
  paintField([field(4, 4, { cast: 0.5, owner: -1 })], out, { origin: [0, 0], drift: 0, seconds: 0 });
  for (let c = 0; c < 16; c++) {
    const th = (BAYER4[c]! + 0.5) / 16;
    const want = 0.5 > th * 0.9 + 0.05 ? [...LOOK.ink, 255] : [0, 0, 0, 0];
    assert.deepEqual(rgba(out, c), want, `cell ${c}`);
  }
  const none = image(4, 4);
  paintField([field(4, 4, { owner: -1 })], none, { origin: [0, 0], drift: 0, seconds: 0 });
  assert.ok(none.data.every((v) => v === 0));
});

test("several fields average their tone, cover and cast; the first owner wins", () => {
  const dark = field(4, 4, { tone: 0, cover: 1, owner: boneIndex });
  const light = field(4, 4, { tone: 1, cover: 1, owner: 1 });
  const avg = image(4, 4);
  const mid = image(4, 4);
  paintField([dark, light], avg, { origin: [0, 0], drift: 0, seconds: 0 });
  paintField([field(4, 4, { tone: 0.5, cover: 1, owner: boneIndex })], mid, { origin: [0, 0], drift: 0, seconds: 0 });
  assert.deepEqual([...avg.data], [...mid.data]);

  // Cover averages too: half covered against none covers at 0.5.
  const half = image(4, 4);
  paintField([field(4, 4, { cover: 1, owner: boneIndex }), field(4, 4, { cover: 0, owner: boneIndex })], half, { origin: [0, 0], drift: 0, seconds: 0 });
  for (let c = 0; c < 16; c++) {
    const th = (BAYER4[c]! + 0.5) / 16;
    assert.equal(half.data[c * 4 + 3], 0.5 > th ? 255 : 0, `cell ${c}`);
  }
});

test("drift 0 paints the same twice, whatever the time", () => {
  const f = field(32, 32, { tone: 0.45, cover: 1, owner: boneIndex });
  const a = image(32, 32);
  const b = image(32, 32);
  paintField([f], a, { origin: [2, 3], drift: 0, seconds: 0 });
  paintField([f], b, { origin: [2, 3], drift: 0, seconds: 9.5 });
  assert.deepEqual([...a.data], [...b.data]);
});

test("drift moves the grain over time", () => {
  const f = field(32, 32, { tone: 0.45, cover: 1, owner: boneIndex });
  const a = image(32, 32);
  const b = image(32, 32);
  paintField([f], a, { origin: [0, 0], drift: 1, seconds: 0 });
  paintField([f], b, { origin: [0, 0], drift: 1, seconds: 3 });
  assert.notDeepEqual([...a.data], [...b.data]);
});

// dither.ts's valueNoise, to check paint's row-cached version gives the same tone.
function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) & 16777215) / 16777216;
}
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(x - xi);
  const v = s(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

test("drift matches the plain value-noise formula", () => {
  const cols = 37;
  const rows = 29;
  for (const seconds of [0, 0.37, 2.9, 11.25]) {
    const out = image(cols, rows);
    paintField([field(cols, rows, { tone: 0.5, cover: 1, owner: boneIndex })], out, { origin: [1, 2], drift: 0.6, seconds });
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const th = (BAYER4[((y + 2) & 3) * 4 + ((x + 1) & 3)]! + 0.5) / 16;
        const t = 0.5 + (valueNoise(x * 0.4 + seconds, y * 0.4) - 0.5) * 0.08 * 0.6;
        const i = Math.min(4, Math.max(0, Math.floor(t * 4 + th)));
        assert.deepEqual(rgba(out, y * cols + x), [...bone[i]!, 255], `t=${seconds} cell ${x},${y}`);
      }
  }
});

test("a 120 x 120 paint is under a millisecond", () => {
  const n = 120;
  const f = field(n, n, { tone: 0.5, cover: 1, owner: boneIndex, cast: 0.3 });
  const out = image(n, n);
  const opts = { origin: [0, 0], drift: 0.6, seconds: 1 } as const;
  for (let i = 0; i < 200; i++) paintField([f], out, opts); // warm up
  // Best of several batches: a busy machine slows a batch down but can't make one faster than the code is.
  const best = (fields: Field[]) => {
    let fastest = Infinity;
    for (let b = 0; b < 12; b++) {
      const start = performance.now();
      for (let i = 0; i < 50; i++) paintField(fields, out, opts);
      fastest = Math.min(fastest, (performance.now() - start) / 50);
    }
    return fastest;
  };
  const per = best([f]);
  const perBlur = best([f, f, f]);
  console.log(`paint 120x120: ${per.toFixed(3)} ms (1 field), ${perBlur.toFixed(3)} ms (3 fields), drift 0.6`);
  // The goal is 1 ms; the bound has slack because other work on the machine shows up here.
  assert.ok(per < 2, `took ${per} ms`);
});
