import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeshBasicMaterial } from "three";
import type { Shape } from "../../../shared/kit.ts";
import { buildGeometry } from "../../kit3d/geometry.ts";
import { framePrimitive } from "./framing.ts";
import { PRIMITIVES } from "../../../shared/primitives/library.ts";
import { SWEEP_MS } from "../../../shared/primitives/motion/run.ts";
import { spring } from "../../../shared/primitives/models/spring.ts";
import { type Cue, type Run, type Values, initialValues, motionSlider, startValues } from "../../../shared/primitives/types.ts";
import { Motion, type MotionHost } from "./controller.ts";
import { StageScene, geometries } from "./scene.ts";
import { Stretch, canStretch, sameShape, shapeKey } from "./shapes.ts";

const material = new MeshBasicMaterial();
const looks = { part: () => material, shadow: () => material };
const sceneFor = (p = spring) => new StageScene(framePrimitive(p), p.view, looks);

function maxGap(a: ArrayLike<number>, b: ArrayLike<number>): number {
  assert.equal(a.length, b.length);
  let gap = 0;
  for (let i = 0; i < a.length; i++) gap = Math.max(gap, Math.abs(a[i]! - b[i]!));
  return gap;
}

describe("stage shapes", () => {
  it("treats float noise as the same shape, and a real change as a new one", () => {
    const a: Shape = { kind: "box", width: 40, height: 3, depth: 3, cornerRadius: 1.49 };
    assert.ok(sameShape(a, { ...a, width: 40 + 1e-12 }));
    assert.ok(!sameShape(a, { ...a, width: 40.01 }));
    assert.equal(shapeKey(a), shapeKey({ ...a, width: 40 + 1e-12 }));
  });

  it("stretches a box exactly, sharp or rounded", () => {
    for (const cornerRadius of [0, 1.49]) {
      const base: Shape = { kind: "box", width: 40, height: 3, depth: 3, cornerRadius };
      const next: Shape = { kind: "box", width: 71.3, height: 3, depth: 5, cornerRadius };
      assert.ok(canStretch(base, next));
      const s = new Stretch(base);
      s.apply(next);
      assert.ok(maxGap(s.geometry.getAttribute("position").array, buildGeometry(next).getAttribute("position").array) < 1e-4);
    }
  });

  it("reshapes a torus's arc exactly while its segment count holds", () => {
    const base: Shape = { kind: "torus", radius: 20, tube: 1.6, arcDegrees: 200 };
    const next: Shape = { ...base, arcDegrees: 202 };
    assert.ok(canStretch(base, next));
    assert.ok(!canStretch(base, { ...base, arcDegrees: 260 }), "a different segment count is rebuilt");
    const s = new Stretch(base);
    s.apply(next);
    const built = buildGeometry(next);
    assert.ok(maxGap(s.geometry.getAttribute("position").array, built.getAttribute("position").array) < 1e-4);
    assert.ok(maxGap(s.geometry.getAttribute("normal").array, built.getAttribute("normal").array) < 1e-4);
  });

  it("will not stretch a box whose rounding would change", () => {
    assert.ok(!canStretch({ kind: "box", width: 40, height: 3, depth: 3, cornerRadius: 1.5 }, { kind: "box", width: 2, height: 3, depth: 3, cornerRadius: 1.5 }));
  });

  it("stretches a coil along its axis, keeping the wire round to within a few hundredths of a mm", () => {
    const base: Shape = { kind: "helix", radius: 16, tube: 1.8, length: 80, turns: 7 };
    const next: Shape = { ...base, length: 35 };
    const s = new Stretch(base);
    s.apply(next);
    // Every vertex should sit one wire radius from the new centre line (nearest point, sampled finely around its own u).
    const pos = s.geometry.getAttribute("position");
    const uv = s.geometry.getAttribute("uv");
    const rise = next.length - 2 * next.tube;
    let worst = 0;
    for (let i = 0; i < pos.count; i++) {
      let d = Infinity;
      for (let k = -100; k <= 100; k++) {
        const u = uv.getX(i) + k * 2e-4;
        const a = 2 * Math.PI * next.turns * u;
        d = Math.min(d, Math.hypot(pos.getX(i) - next.radius * Math.cos(a), pos.getY(i) - rise * (u - 0.5), pos.getZ(i) + next.radius * Math.sin(a)));
      }
      worst = Math.max(worst, Math.abs(d - next.tube));
    }
    assert.ok(worst < 0.1, `wire off round by ${worst} mm`);
  });
});

describe("stage scene", () => {
  it("keeps one mesh per part id and hides parts that leave", () => {
    const scene = sceneFor();
    const run = spring.game.play(startValues(spring));
    const lead = run.at(200);
    scene.setFrame(spring.build(lead.values), undefined, lead.marks);
    const withArrow = scene.meshCount;
    const rest = run.at(0);
    scene.setFrame(spring.build(rest.values), undefined, []);
    assert.equal(scene.meshCount, withArrow, "the arrow's mesh is kept for when it comes back");
    scene.dispose();
  });

  it("builds no geometry while a motion slider sweeps, for every model", () => {
    for (const p of PRIMITIVES) {
      const s = motionSlider(p);
      const start = initialValues(p);
      const scene = sceneFor(p);
      const sweep = (n: number) => {
        for (let i = 0; i <= n; i++) scene.setFrame(p.build({ ...start, [s.id]: s.min + ((s.max - s.min) * i) / n }));
      };
      // The first pass meets each shape once; the second, with values in between, should only reuse and stretch.
      sweep(40);
      const before = geometries.builds;
      sweep(37);
      const built = geometries.builds - before;
      // Arrows and lathes that change size are rebuilt from the cache; allow a few, but not one per frame per part.
      assert.ok(built <= 38 * 2, `${p.id}: ${built} geometries built in a 38-frame sweep`);
      scene.dispose();
    }
  });

  it("projects and unprojects the handle through the same camera", () => {
    const scene = sceneFor();
    scene.resize(350, 360, 351, 360);
    const at = spring.handle.at({ stiffness: 1.5, force: 10 });
    const css = scene.project(at, { x: 0, y: 0 });
    assert.ok(css.x > 0 && css.x < 351 && css.y > 0 && css.y < 360);
    const back = scene.unproject(css.x, css.y, at.z);
    assert.ok(Math.abs(back.x - at.x) < 1e-6 && Math.abs(back.y - at.y) < 1e-6, JSON.stringify(back));
    scene.dispose();
  });
});

type Log = { applied: Values[]; live: string[]; cues: Cue[] };
function motion(reduced = false, initial: Values = { stiffness: 1.5, force: 0 }): { m: Motion; log: Log } {
  const log: Log = { applied: [], live: [], cues: [] };
  const host: MotionHost = {
    apply: (v) => log.applied.push(v),
    wake: () => {},
    reducedMotion: () => reduced,
    onLive: (t) => log.live.push(t),
    onCue: (c) => log.cues.push(c),
  };
  return { m: new Motion(host, spring, initial), log };
}

describe("stage controller", () => {
  const run = (): Run => spring.game.play({ ...startValues(spring), stiffness: 1, force: 0 });

  it("plays a run to its end, firing each cue once and each caption once", async () => {
    const { m, log } = motion();
    const r = run();
    const done = m.play(r);
    for (let t = 1000; t <= 1000 + r.durationMs + 50; t += 16) m.tick(t);
    assert.equal(await done, true);
    assert.deepEqual(log.cues, [...r.cues!].sort((a, b) => a.ms - b.ms), "cues fire in time order");
    assert.deepEqual(m.get(), r.at(r.durationMs).values);
    for (let i = 1; i < log.live.length; i++) assert.notEqual(log.live[i], log.live[i - 1]);
    assert.equal(m.state(), "idle");
  });

  it("resolves false when a set interrupts the run", async () => {
    const { m } = motion();
    const done = m.play(run());
    m.tick(0);
    m.tick(500);
    m.set({ force: 3 });
    assert.equal(await done, false);
    assert.equal(m.get().force, 3);
  });

  it("ignores a set that changes nothing, so a re-render cannot stop a run", () => {
    const { m } = motion();
    void m.play(run());
    m.tick(0);
    m.set({ ...m.get() });
    assert.equal(m.state(), "playing");
  });

  it("jumps to the end under reduced motion and still reports the outcome", async () => {
    const { m, log } = motion(true);
    const r = run();
    assert.equal(await m.play(r), true);
    assert.deepEqual(m.get(), r.at(r.durationMs).values);
    assert.deepEqual(log.live, [r.at(r.durationMs).live]);
    assert.deepEqual(log.cues, [r.cues!.at(-1)]);
    m.sweep();
    assert.equal(m.state(), "idle", "no sweep under reduced motion");
  });

  it("hands a run back without its run-only poses, keeping its last props", async () => {
    const applied: { v: Values; marks: unknown }[] = [];
    const m = new Motion({ apply: (v, marks) => applied.push({ v, marks }), wake: () => {}, reducedMotion: () => false }, spring, { force: 0, bounce: 0 });
    const marks = spring.build({ force: 0 }).slice(0, 1);
    const done = m.play({ verdict: { pass: true, outcome: "pass", headline: "", detail: "" }, durationMs: 100, at: (ms) => ({ values: { force: ms / 10, bounce: 3 }, live: "", marks }) });
    m.tick(0);
    m.tick(200);
    assert.equal(await done, true);
    assert.deepEqual(m.get(), { force: 10, bounce: 0 });
    assert.equal(applied.at(-1)!.marks, marks);
  });

  it("reset clears a finished run's props even when no value changes", async () => {
    const applied: unknown[] = [];
    const m = new Motion({ apply: (_v, marks) => applied.push(marks), wake: () => {}, reducedMotion: () => true }, spring, { force: 0 });
    const marks = spring.build({ force: 0 }).slice(0, 1);
    await m.play({ verdict: { pass: true, outcome: "pass", headline: "", detail: "" }, durationMs: 100, at: () => ({ values: { force: 0 }, live: "", marks }) });
    m.set({ force: 0 });
    assert.equal(applied.at(-1), marks, "a set that changes nothing keeps the run's props");
    m.reset();
    assert.equal(applied.at(-1), undefined, "reset clears them");
  });

  it("sweeps from where the slider is, without a jump, and clamps sets to the slider", () => {
    const { m } = motion(false, { stiffness: 1.5, force: 10 });
    m.sweep();
    m.tick(0);
    assert.ok(Math.abs(m.get().force! - 10) < 1e-9);
    m.tick(SWEEP_MS / 8);
    assert.ok(m.get().force! > 10, "heads up first");
    m.set({ force: 99 });
    assert.equal(m.get().force, 50);
  });
});
