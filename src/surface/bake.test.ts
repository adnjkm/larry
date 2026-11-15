import assert from "node:assert/strict";
import { test } from "node:test";
import { bakeField } from "./bake.ts";
import { circle, pill, RELIEF, type Scene } from "./relief.ts";

const knob: Scene = {
  width: 100,
  height: 64,
  parts: [
    { ...pill(84, 48), x: 8, y: 8, relief: RELIEF.slot, material: "slate" },
    { ...circle(42), x: 14, y: 11, relief: RELIEF.cap },
  ],
};

const cap = (relief: Scene["parts"][number]["relief"]): Scene => ({ width: 64, height: 64, parts: [{ ...circle(40), x: 12, y: 12, relief }] });

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

test("parts own their cells: the cap is bone, the slot round it slate, the corner outside empty", () => {
  const f = bakeField(knob, 1);
  assert.equal(f.owner[32 * 100 + 35], 0);
  assert.equal(f.owner[32 * 100 + 80], 1);
  assert.equal(f.owner[0], -1);
});

test("an unknown material is an error, not a silent gap", () => {
  const scene: Scene = { width: 20, height: 20, parts: [{ ...circle(16), x: 2, y: 2, relief: RELIEF.key, material: "nope" as "bone" }] };
  assert.throws(() => bakeField(scene, 1), /unknown material/);
});

test("the light comes from above: a cap's top rim is lighter than its bottom rim, and its shadow falls below it", () => {
  const f = bakeField(cap(RELIEF.cap), 1);
  const at = (x: number, y: number) => y * f.cols + x;
  // Just inside the cap's top and bottom edges (it spans rows 12 to 52), on its centre line.
  assert.ok(f.tone[at(32, 14)]! > f.tone[at(32, 49)]!, "top rim lighter");
  // Just outside the cap: below it in shadow, above it not.
  assert.ok(f.cast[at(32, 52)]! > 0.1, "shadow below");
  assert.ok(f.cast[at(32, 10)]! < 0.05, "no shadow above");
});

test("a pressed cap stands lower, so it throws less shadow", () => {
  assert.ok(sum(bakeField(cap(RELIEF.capPressed), 1).cast) < sum(bakeField(cap(RELIEF.cap), 1).cast));
});

test("cells that don't divide the scene still cover it", () => {
  const f = bakeField(knob, 1.34);
  assert.equal(f.cols, Math.ceil(100 / 1.34));
  assert.equal(f.rows, Math.ceil(64 / 1.34));
  assert.ok(f.cover.every((c) => c >= 0 && c <= 1));
});
