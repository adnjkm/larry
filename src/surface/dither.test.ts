import assert from "node:assert/strict";
import { test } from "node:test";
import { hexRgb, inset, pack, ramp, snap, threshold, valueNoise } from "./dither.ts";

test("the 4 x 4 thresholds are each sixteenth once, centred", () => {
  const all = Array.from({ length: 16 }, (_, i) => threshold(i % 4, Math.floor(i / 4))).sort((a, b) => a - b);
  assert.deepEqual(
    all,
    Array.from({ length: 16 }, (_, k) => (k + 0.5) / 16),
  );
  assert.equal(threshold(5, 6), threshold(1, 2));
});

test("snap lights a flat tone's share of cells on the upper stop", () => {
  const stops = ramp(["#000000", "#ffffff"]);
  for (const tone of [0, 0.25, 0.5, 0.8, 1]) {
    let lit = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (snap(stops, tone, threshold(x, y)) === stops[1]) lit++;
    assert.equal(lit, Math.round(tone * 16), `tone ${tone}`);
  }
});

test("pack writes RGBA in memory order through a Uint32Array view", () => {
  const bytes = new Uint8ClampedArray(4);
  new Uint32Array(bytes.buffer)[0] = pack(1, 2, 3, 4);
  assert.deepEqual([...bytes], [1, 2, 3, 4]);
  assert.deepEqual(hexRgb("#FF0087"), [255, 0, 135]);
});

test("inset is the distance to a rounded rectangle's edge, negative outside", () => {
  assert.equal(inset(50, 20, 100, 40, 8), 20);
  assert.equal(inset(50, -5, 100, 40, 8), -5);
  // In the corner's square but outside its arc.
  assert.ok(inset(0.5, 0.5, 100, 40, 8) < 0);
});

test("value noise is smooth: lattice points are hashes, and it moves a little between nearby points", () => {
  assert.ok(Math.abs(valueNoise(3.1, 7.2) - valueNoise(3.11, 7.2)) < 0.05);
  for (let i = 0; i < 50; i++) {
    const v = valueNoise(i * 0.37, i * 0.91);
    assert.ok(v >= 0 && v < 1);
  }
});
