// Per-frame cost of posing a figure, without React or WebGL: the old KitViewer path (build, JSON.stringify keys,
// a geometry per new key, an Euler per part) against the stage's (build, then diff-apply into a kept scene).
// Each model's motion slider moves on the play sweep's cosine, a new value every frame, as in a run.
// Usage: node scripts/pose-cost.ts [id ...]
import { type BufferGeometry, MeshBasicMaterial } from "three";
import type { Part } from "../shared/kit.ts";
import { rotationOf } from "../src/kit3d/buildKit.ts";
import { buildGeometry } from "../src/kit3d/geometry.ts";
import { framePrimitive } from "../src/primitives/stage/framing.ts";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { fixtureSpring } from "../src/primitives/stage/dev/fixture.ts";
import { StageScene } from "../src/primitives/stage/scene.ts";
import type { Primitive, Values } from "../shared/primitives/types.ts";

const FRAMES = 600;
const wanted = process.argv.slice(2);
const material = new MeshBasicMaterial();

function framesFor(p: Primitive): Values[] {
  const s = p.sliders.find((x) => x.id === p.handle?.slider) ?? p.sliders.at(-1)!;
  const start: Values = Object.fromEntries(p.sliders.map((x) => [x.id, x.initial]));
  // 4 s cosine at 60 fps, continuous values (a run's frames are not on the slider's step).
  return Array.from({ length: FRAMES }, (_, i) => ({ ...start, [s.id]: s.min + (s.max - s.min) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 240)) }));
}

function oldPath(p: Primitive, frames: Values[]): number {
  const cache = new Map<string, BufferGeometry>();
  const t0 = performance.now();
  for (const v of frames) {
    const parts: Part[] = p.build(v);
    const live = new Set<string>();
    for (const part of parts) {
      const key = JSON.stringify(part.shape);
      live.add(key);
      if (!cache.has(key)) cache.set(key, buildGeometry(part.shape));
      void `${part.color} ${part.finish}`;
      rotationOf(part);
    }
    for (const [k, g] of cache) if (!live.has(k)) (g.dispose(), cache.delete(k));
  }
  return (performance.now() - t0) / frames.length;
}

function newPath(p: Primitive, frames: Values[]): number {
  const scene = new StageScene(framePrimitive(p), p.view, { part: () => material, shadow: () => material });
  const t0 = performance.now();
  for (const v of frames) scene.setFrame(p.build(v));
  const ms = (performance.now() - t0) / frames.length;
  scene.dispose();
  return ms;
}

function buildOnly(p: Primitive, frames: Values[]): number {
  const t0 = performance.now();
  for (const v of frames) p.build(v);
  return (performance.now() - t0) / frames.length;
}

function runPath(p: Primitive): number | undefined {
  const game = p.game;
  if (!game) return undefined;
  const run = game.play({ ...Object.fromEntries(p.sliders.map((x) => [x.id, x.initial])), ...game.start });
  const scene = new StageScene(framePrimitive(p), p.view, { part: () => material, shadow: () => material });
  for (let ms = 0; ms <= run.durationMs; ms += 16) {
    const f = run.at(ms);
    scene.setFrame(p.build(f.values), game.scene?.(f.values), f.marks);
  }
  const t0 = performance.now();
  let n = 0;
  for (let rep = 0; rep < 5; rep++)
    for (let ms = 0; ms <= run.durationMs; ms += 16.7, n++) {
      const f = run.at(ms);
      scene.setFrame(p.build(f.values), game.scene?.(f.values), f.marks);
    }
  scene.dispose();
  return (performance.now() - t0) / n;
}

console.log(`ms per frame, ${FRAMES} frames of the motion slider's sweep (warm: one pass first)`);
console.log("model      build-only   old path   stage   game run (stage)");
for (const p of [fixtureSpring, ...PRIMITIVES].filter((q) => wanted.length === 0 || wanted.includes(q.id))) {
  const frames = framesFor(p);
  oldPath(p, frames.slice(0, 240));
  newPath(p, frames.slice(0, 240));
  const b = buildOnly(p, frames);
  const o = oldPath(p, frames);
  const n = newPath(p, frames);
  const r = runPath(p);
  console.log(`${p.id.padEnd(15)} ${b.toFixed(3).padStart(6)}   ${o.toFixed(3).padStart(8)}   ${n.toFixed(3).padStart(5)}   ${r === undefined ? "-" : r.toFixed(3)}`);
}
