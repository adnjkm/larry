import assert from "node:assert/strict";
import { test } from "node:test";
import { LOOK } from "../surface/look.ts";
import { ramp, type Raster } from "../surface/dither.ts";
import { drawSweep, drawSwell, reachedTop, sweepAt, swellFor } from "./light.ts";

const raster = (cols: number, rows: number): Raster => {
  const data = new Uint8ClampedArray(cols * rows * 4);
  return { cols, rows, image: { data } as unknown as ImageData, px: new Uint32Array(data.buffer), ctx: { putImageData() {} } as unknown as CanvasRenderingContext2D };
};

test("the sweep climbs, reaches the top before it ends, and ends", () => {
  const ms = 2700;
  let last = -Infinity;
  let topAt = Infinity;
  for (let t = 0; t < ms; t += 20) {
    const f = sweepAt(t, ms, 0.12);
    assert.ok(f);
    assert.ok(f.front >= last);
    last = f.front;
    if (topAt === Infinity && reachedTop(f, 0.03)) topAt = t;
  }
  assert.ok(topAt < ms / 2, `reached the top at ${topAt} ms`);
  assert.equal(sweepAt(ms, ms, 0.12), null);
});

test("the band lights cells round its front and none far ahead of it", () => {
  const r = raster(60, 100);
  const f = sweepAt(600, 2700, 0.12)!;
  drawSweep(r, f);
  const litRows = new Set<number>();
  r.px.forEach((p, i) => p && litRows.add(Math.floor(i / 60)));
  const frontRow = (1 - f.front) * 100;
  assert.ok(litRows.size > 10);
  assert.ok([...litRows].every((y) => y > frontRow - 45), "nothing lit far ahead of the front");
});

test("before it eases in, the swell is the grey photo in the bone tones only", () => {
  const cols = 40;
  const rows = 30;
  const lum = Float32Array.from({ length: cols * rows }, (_, i) => (i % cols) / cols);
  const swell = swellFor({ cols, rows, dpr: 2, cell: 3, lum });
  const r = raster(cols, rows);
  drawSwell(r, swell, { wave: 4, light: 1, speed: 1, glow: 0, reach: 0 }, 5, 0);
  const greys = new Set(ramp(LOOK.materials.bone.tones));
  assert.ok(r.px.every((p) => greys.has(p)));
});
