import assert from "node:assert/strict";
import { test } from "node:test";
import { LOOK } from "../surface/look.ts";
import { ramp, type Raster } from "../surface/dither.ts";
import { drawSwell, swellFor } from "./light.ts";

const raster = (cols: number, rows: number): Raster => {
  const data = new Uint8ClampedArray(cols * rows * 4);
  return {
    cols,
    rows,
    image: { data } as unknown as ImageData,
    px: new Uint32Array(data.buffer),
    ctx: { putImageData() {} } as unknown as CanvasRenderingContext2D,
  };
};

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
