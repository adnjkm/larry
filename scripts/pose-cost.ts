// Per-frame cost of posing a figure, without React or WebGL: build alone, and build plus the stage's diff-apply into a
// kept scene, on the play sweep (a new value every frame); then a game run's frames with its scene and marks.
// Usage: node scripts/pose-cost.ts [id ...]
import { MeshBasicMaterial } from "three";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { sweepRun } from "../shared/primitives/motion/run.ts";
import { type Primitive, type Values, startValues } from "../shared/primitives/types.ts";
import { framePrimitive } from "../shared/primitives/framing.ts";
import { StageScene } from "../src/primitives/stage/scene.ts";

const FRAMES = 600;
const wanted = process.argv.slice(2);
const material = new MeshBasicMaterial();
const looks = { part: () => material, shadow: () => material };

function sweepFrames(p: Primitive): Values[] {
  const sweep = sweepRun(p);
  return Array.from({ length: FRAMES }, (_, i) => sweep.at((i * 1000) / 60).values);
}

function buildOnly(p: Primitive, frames: Values[]): number {
  const t0 = performance.now();
  for (const v of frames) p.build(v);
  return (performance.now() - t0) / frames.length;
}

function stagePath(p: Primitive, frames: Values[]): number {
  const scene = new StageScene(framePrimitive(p), p.view, looks);
  const t0 = performance.now();
  for (const v of frames) scene.setFrame(p.build(v));
  const ms = (performance.now() - t0) / frames.length;
  scene.dispose();
  return ms;
}

function runPath(p: Primitive): number {
  const game = p.game;
  const run = game.play(startValues(p));
  const scene = new StageScene(framePrimitive(p), p.view, looks);
  const pose = (ms: number) => {
    const f = run.at(ms);
    scene.setFrame(p.build(f.values), game.scene?.(f.values), f.marks);
  };
  for (let ms = 0; ms <= run.durationMs; ms += 16) pose(ms);
  const t0 = performance.now();
  let n = 0;
  for (let rep = 0; rep < 5; rep++) for (let ms = 0; ms <= run.durationMs; ms += 16.7, n++) pose(ms);
  scene.dispose();
  return (performance.now() - t0) / n;
}

console.log(`ms per frame, ${FRAMES} frames of the motion slider's sweep (warm: one pass first)`);
console.log("model      build-only   stage   game run (stage)");
for (const p of PRIMITIVES.filter((q) => wanted.length === 0 || wanted.includes(q.id))) {
  const frames = sweepFrames(p);
  stagePath(p, frames.slice(0, 240));
  const b = buildOnly(p, frames);
  const s = stagePath(p, frames);
  console.log(`${p.id.padEnd(15)} ${b.toFixed(3).padStart(6)}   ${s.toFixed(3).padStart(5)}   ${runPath(p).toFixed(3)}`);
}
