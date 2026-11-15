import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { bakeField } from "./bake.ts";
import { LOOK } from "./look.ts";
import { circle, drum, pill, RELIEF, rrect, type Scene } from "./relief.ts";

const PROTO = "/tmp/surface-system/proto/surface.mjs";
const MARK = "// The Bayer phase follows the screen, not the sprite.";

type Reference = { cols: number; rows: number; tone: Float32Array; owner: Int8Array; cover: Float32Array; cast: Float32Array };
type ProtoPart = { x: number; y: number; w: number; h: number; r: number; relief: unknown; material?: string };

/**
 * The prototype doesn't expose its per-cell grey, so run a copy of it that returns right after the averaging step
 * (which also leaves out dithering, so its time is comparable to ours).
 */
async function loadReference() {
  const source = readFileSync(PROTO, "utf8");
  assert.ok(source.includes(MARK), "prototype changed: averaging marker not found");
  const patched = source.replace(MARK, "return { cols, rows, tone: grey, owner, cover, cast };\n" + MARK);
  const file = join(mkdtempSync(join(tmpdir(), "bake-ref-")), "surface.mjs");
  writeFileSync(file, patched);
  const mod = (await import(pathToFileURL(file).href)) as { bake: (args: { width: number; height: number; parts: ProtoPart[]; look: unknown; cell: number }) => Reference };
  return (scene: Scene, cell: number) => mod.bake({ width: scene.width, height: scene.height, parts: scene.parts as unknown as ProtoPart[], look: LOOK, cell });
}

const shutter: Scene = { width: 112, height: 112, parts: [{ ...circle(96), x: 8, y: 8, relief: RELIEF.dish }] };

const knob: Scene = {
  width: 100,
  height: 64,
  parts: [
    { ...pill(84, 48), x: 8, y: 8, relief: RELIEF.slot, material: "slate" },
    { ...circle(42), x: 14, y: 11, relief: RELIEF.cap },
  ],
};

const wheel = (turn: number): Scene => ({ width: 112, height: 64, parts: [{ ...rrect(112, 64, 10), x: 0, y: 0, relief: [drum({ ridges: 19, turn })] }] });

function compare(name: string, ours: ReturnType<typeof bakeField>, ref: Reference) {
  assert.equal(ours.cols, ref.cols, `${name}: cols`);
  assert.equal(ours.rows, ref.rows, `${name}: rows`);
  let tone = 0;
  let cover = 0;
  let cast = 0;
  let owners = 0;
  for (let c = 0; c < ref.tone.length; c++) {
    tone = Math.max(tone, Math.abs(ours.tone[c]! - ref.tone[c]!));
    cover = Math.max(cover, Math.abs(ours.cover[c]! - ref.cover[c]!));
    cast = Math.max(cast, Math.abs(ours.cast[c]! - ref.cast[c]!));
    if (ours.owner[c] !== ref.owner[c]) owners++;
  }
  console.log(`${name}: max |tone| ${tone.toExponential(2)}, cover ${cover.toExponential(2)}, cast ${cast.toExponential(2)}, owner mismatches ${owners}`);
  assert.ok(tone <= 0.01, `${name}: tone differs by ${tone}`);
  assert.ok(cover <= 1e-6, `${name}: cover differs by ${cover}`);
  assert.ok(cast <= 0.01, `${name}: cast differs by ${cast}`);
  assert.equal(owners, 0, `${name}: owners differ`);
}

/** Fastest and median of `n` runs. The fastest is the steadier number when the machine is busy. */
function time(run: () => void, n: number) {
  for (let i = 0; i < 10; i++) run();
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    run();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return { min: times[0]!, median: times[n >> 1]! };
}

/** A fixed loop to read the machine's speed by: slow numbers on a loaded machine show up here too. */
function machine() {
  const a = new Float32Array(1 << 20).fill(1.5);
  const run = () => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i]!;
    return s;
  };
  const { min } = time(run, 20);
  return ((min * 1e6) / a.length).toFixed(2);
}

const show = ({ min, median }: { min: number; median: number }) => `${min.toFixed(1)} ms fastest, ${median.toFixed(1)} ms median`;

test("matches the prototype", async () => {
  const reference = await loadReference();
  const cases: [string, Scene, number][] = [
    ["shutter", shutter, 1],
    ["knob", knob, 1],
    ["wheel", wheel(0.37), 1],
    // Cells that don't divide the scene, and a cell size off the whole-px grid.
    ["knob at 1.34", knob, 1.34],
    ["wheel at 0.67", wheel(1.1), 0.67],
  ];
  for (const [name, scene, cell] of cases) compare(name, bakeField(scene, cell), reference(scene, cell));
});

test("fields have the contract's shape", () => {
  const f = bakeField(knob, 1);
  assert.equal(f.cell, 1);
  assert.equal(f.cols, 100);
  assert.equal(f.rows, 64);
  for (const a of [f.tone, f.owner, f.cover, f.cast]) assert.equal(a.length, 100 * 64);
  // The cap is bone (index 0), the slot around it slate (1), and the corner outside the pill is empty.
  assert.equal(f.owner[32 * 100 + 35], 0);
  assert.equal(f.owner[32 * 100 + 80], 1);
  assert.equal(f.owner[0], -1);
});

test("an unknown material is an error, not a silent gap", () => {
  const scene: Scene = { width: 20, height: 20, parts: [{ ...circle(16), x: 2, y: 2, relief: RELIEF.key, material: "nope" as "bone" }] };
  assert.throws(() => bakeField(scene, 1), /unknown material/);
});

// Timing is logged, not asserted: it depends on the machine, and these tests also run on busy ones.
test("bake time", async () => {
  const reference = await loadReference();
  const frames = Array.from({ length: 18 }, (_, i) => wheel((i / 18) * ((Math.PI * 2) / 19)));
  const frame = frames[3]!;
  let n = 0;
  console.log(`reference loop: ${machine()} ns per element`);
  console.log(`shutter 112x112 (target < 15 ms): prototype ${show(time(() => reference(shutter, 1), 5))}`);
  console.log(`shutter 112x112 (target < 15 ms): now       ${show(time(() => bakeField(shutter, 1), 60))}`);
  console.log(`wheel 112x64 (target < 8 ms):     prototype ${show(time(() => reference(frame, 1), 5))}`);
  console.log(`wheel 112x64 (target < 8 ms):     now       ${show(time(() => bakeField(frame, 1), 60))}`);
  console.log(`wheel, cycling its 18 frames:               ${show(time(() => bakeField(frames[n++ % 18]!, 1), 60))}`);
});
