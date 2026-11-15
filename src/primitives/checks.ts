// Generic checks for a primitive's game and figure, from src/primitives/docs/motion-language.md and design-language.md.
// Each throws an AssertionError naming the primitive and the values that broke it. library.test.ts runs them for every
// primitive with a game; a model's own test file can call them directly. Test-only: imports node:assert.
import assert from "node:assert/strict";
import { Kit, kitProblems, type Part } from "../../shared/kit.ts";
import { measurePoses } from "../kit3d/buildKit.ts";
import { poses } from "./framing.ts";
import { MARK, SCENE } from "./motion/run.ts";
import { ARROW_MIN, COLOR, PLATE_T, PLATE_MARGIN, PLATE_TOP } from "./parts.ts";
import { type Frame, type Game, type Primitive, type Run, type Slider, type Values, VIEW } from "./types.ts";

/** Frames are sampled this far apart, as a 60 Hz screen would. */
export const FRAME_MS = 16;
/** The largest change a value may make between two frames FRAME_MS apart, as a share of its range, except at a cue. */
export const MAX_STEP = 0.2;
const MAX_RUN_MS = 4500;

const fail = (p: Primitive, what: string, v?: Values) => `${p.id}: ${what}${v ? ` at ${JSON.stringify(v)}` : ""}`;

export const initial = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));
/** Where the game starts: every slider's initial value, then the game's own start, then any run-only pose at its initial. */
export function startOf(p: Primitive): Values {
  const g = p.game as Game;
  return { ...initial(p), ...Object.fromEntries((g.controls ?? []).map((s) => [s.id, s.initial])), ...g.start };
}

/** Every value a frame may carry, with its range: sliders, game controls and run-only poses. */
export function ranges(p: Primitive): Map<string, Slider> {
  return new Map([...p.sliders, ...(p.game?.controls ?? []), ...(p.game?.poses ?? [])].map((s) => [s.id, s]));
}

/** Every value on a slider's step grid, min to max. */
export function steps(s: Slider): number[] {
  const n = Math.round((s.max - s.min) / s.step);
  return Array.from({ length: n + 1 }, (_, i) => Number((s.min + i * s.step).toFixed(10)));
}

const numberSlider = (p: Primitive): Slider => {
  const g = p.game as Game;
  const s = [...p.sliders, ...(g.controls ?? [])].find((q) => q.id === g.number);
  assert.ok(s, fail(p, `game.number "${g.number}" is not a slider or control`));
  return s;
};

/** The game's start with its number set to each step of its slider. */
export const numberSweep = (p: Primitive): Values[] => steps(numberSlider(p)).map((n) => ({ ...startOf(p), [numberSlider(p).id]: n }));

/** A run's frames every FRAME_MS, and the last frame exactly at durationMs. */
export function sample(run: Run): { ms: number; frame: Frame }[] {
  const out: { ms: number; frame: Frame }[] = [];
  for (let ms = 0; ms < run.durationMs; ms += FRAME_MS) out.push({ ms, frame: run.at(ms) });
  out.push({ ms: run.durationMs, frame: run.at(run.durationMs) });
  return out;
}

/** judge passes somewhere, the passing steps are one window, and it fails on both sides with at least two steps clear of each end. The start fails. */
export function checkTwoSided(p: Primitive): void {
  const g = p.game as Game;
  const sweep = numberSweep(p);
  const pass = sweep.map((v) => g.judge(v).pass);
  const first = pass.indexOf(true);
  const last = pass.lastIndexOf(true);
  assert.ok(first >= 0, fail(p, "judge never passes along the number slider"));
  assert.ok(pass.slice(first, last + 1).every(Boolean), fail(p, `the passing settings are not one window: ${pass.map((x) => (x ? "o" : ".")).join("")}`));
  assert.ok(first >= 2, fail(p, `the window starts ${first} steps from the slider's minimum; keep at least 2 failing steps below it`));
  assert.ok(last <= pass.length - 3, fail(p, `the window ends ${pass.length - 1 - last} steps from the slider's maximum; keep at least 2 failing steps above it`));
  assert.equal(g.judge(startOf(p)).pass, false, fail(p, "the start values pass, so there is nothing to solve", startOf(p)));
}

/** play(v).verdict equals judge(v) at every step of the number slider. */
export function checkVerdictIsJudge(p: Primitive): void {
  const g = p.game as Game;
  for (const v of numberSweep(p)) assert.deepEqual(g.play(v).verdict, g.judge(v), fail(p, "play's verdict differs from judge", v));
}

/** Verdict and game words stay inside their limits. */
export function checkWords(p: Primitive): void {
  const g = p.game as Game;
  const words = (s: string) => s.trim().split(/\s+/).length;
  assert.ok(words(g.rules) <= 30, fail(p, `rules run to ${words(g.rules)} words`));
  for (const text of [g.name, g.goal, g.rules, g.action, ...[...p.sliders, ...(g.controls ?? [])].map((q) => q.label)])
    assert.doesNotMatch(text, /\d/, fail(p, `"${text}" shows a number`));
  for (const v of numberSweep(p)) {
    const verdict = g.judge(v);
    assert.match(verdict.outcome, /^[a-z]+(-[a-z]+)*$/, fail(p, `outcome "${verdict.outcome}" is not kebab-case`));
    assert.ok(words(verdict.headline) >= 2 && words(verdict.headline) <= 5, fail(p, `headline "${verdict.headline}" is not 2 to 5 words`));
    // No numbers anywhere the player reads: the game teaches by feel, not arithmetic (owner's rule, 2026-11-14).
    assert.doesNotMatch(`${verdict.headline} ${verdict.detail}`, /\d/, fail(p, `the verdict "${verdict.headline} ${verdict.detail}" shows a number`, v));
    for (const m of g.meters(v)) assert.ok(m.label.length <= 12, fail(p, `meter label "${m.label}" is over 12 characters`));
  }
}

/**
 * Every frame of every run (at each number step): known values inside their ranges, a short live caption, marks that
 * never clash with build's ids and make a valid kit with it, and a run under 4.5 s.
 */
export function checkRunFrames(p: Primitive): void {
  const g = p.game as Game;
  const known = ranges(p);
  for (const v of numberSweep(p)) {
    const run = g.play(v);
    assert.ok(run.durationMs > 0 && run.durationMs <= MAX_RUN_MS, fail(p, `run lasts ${run.durationMs} ms`, v));
    for (const { ms, frame } of sample(run)) {
      const at = `${ms} ms of the run`;
      for (const [id, x] of Object.entries(frame.values)) {
        const s = known.get(id);
        assert.ok(s, fail(p, `${at} sets "${id}", which is no slider, control or game pose`, v));
        assert.ok(Number.isFinite(x) && x >= s.min - 1e-9 && x <= s.max + 1e-9, fail(p, `${at} sets ${id} = ${x}, outside ${s.min}..${s.max}`, v));
      }
      const words = frame.live.trim().split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 1 && words <= 6, fail(p, `${at} caption "${frame.live}" is not 1 to 6 words`, v));
      assert.doesNotMatch(frame.live, /\d/, fail(p, `${at} caption "${frame.live}" shows a number`, v));
      const built = p.build(frame.values);
      const scene = g.scene?.(frame.values) ?? [];
      const ids = new Set([...built, ...scene].map((q) => q.id));
      for (const m of frame.marks ?? []) {
        assert.ok(m.id.startsWith(MARK), fail(p, `${at} mark "${m.id}" does not start with "${MARK}"`, v));
        assert.ok(!ids.has(m.id), fail(p, `${at} mark "${m.id}" clashes with a built or scene part`, v));
      }
      const kit = Kit.parse({ name: p.name, summary: p.job, parts: [...built, ...scene, ...(frame.marks ?? [])] });
      assert.deepEqual(kitProblems(kit), [], fail(p, `${at} is not a valid kit`, v));
    }
  }
}

/**
 * The game's scene, at the start and across the slider grid: ids start with SCENE and never clash with build's, colours
 * are COLOR roles, and build plus scene is a valid kit.
 */
export function checkScene(p: Primitive): void {
  const scene = p.game?.scene;
  if (!scene) return;
  const palette = new Set<string>(Object.values(COLOR));
  for (const v of [startOf(p), ...poses(p, 3).map((q) => ({ ...startOf(p), ...q }))]) {
    const built = p.build(v);
    const ids = new Set(built.map((q) => q.id));
    const parts = scene(v);
    for (const q of parts) {
      assert.ok(q.id.startsWith(SCENE), fail(p, `scene part "${q.id}" does not start with "${SCENE}"`, v));
      assert.ok(!ids.has(q.id), fail(p, `scene part "${q.id}" clashes with a built part`, v));
      assert.ok(palette.has(q.color), fail(p, `scene part "${q.id}" colour ${q.color} is not a COLOR role`, v));
    }
    assert.deepEqual(kitProblems(Kit.parse({ name: p.name, summary: p.job, parts: [...built, ...parts] })), [], fail(p, "build plus scene is not a valid kit", v));
  }
}

/** at(0) is the start pose, and no value jumps more than MAX_STEP of its range between frames FRAME_MS apart, except within a frame of a cue. */
export function checkContinuity(p: Primitive): void {
  const g = p.game as Game;
  const known = ranges(p);
  for (const v of numberSweep(p)) {
    const run = g.play(v);
    const first = run.at(0).values;
    for (const s of p.sliders) assert.ok(Math.abs((first[s.id] ?? s.initial) - (v[s.id] ?? s.initial)) < 1e-9, fail(p, `at(0) has ${s.id} = ${first[s.id]}, not the start's ${v[s.id]}`, v));
    for (const s of g.poses ?? []) assert.ok(Math.abs((first[s.id] ?? s.initial) - s.initial) < 1e-9, fail(p, `at(0) has run-only ${s.id} = ${first[s.id]}, not its initial ${s.initial}`, v));
    const cues = (run.cues ?? []).map((c) => c.ms);
    const frames = sample(run);
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1]!;
      const b = frames[i]!;
      if (cues.some((c) => c >= a.ms - FRAME_MS && c <= b.ms + FRAME_MS)) continue;
      for (const [id, s] of known) {
        const before = a.frame.values[id] ?? s.initial;
        const after = b.frame.values[id] ?? s.initial;
        assert.ok(Math.abs(after - before) <= MAX_STEP * (s.max - s.min) + 1e-9, fail(p, `${id} jumps ${before} → ${after} between ${a.ms} and ${b.ms} ms with no cue`, v));
      }
    }
  }
}

/**
 * The handle's reach stays inside its slider's range, lowest first, across a grid of poses; and no run moves the handle's
 * slider outside the reach of the frame before it (beyond where the run started), except after a "snap": something broke.
 */
export function checkReach(p: Primitive): void {
  const h = p.handle;
  const reach = h?.reach;
  if (!h || !reach) return;
  const s = p.sliders.find((q) => q.id === h.slider);
  assert.ok(s, fail(p, `handle drives unknown slider ${h.slider}`));
  for (const v of poses(p, 7)) {
    const [lo, hi]: [number, number] = reach(v);
    assert.ok(lo <= hi + 1e-9, fail(p, `reach [${lo}, ${hi}] is not lowest first`, v));
    assert.ok(lo >= s.min - 1e-9 && hi <= s.max + 1e-9, fail(p, `reach [${lo}, ${hi}] leaves ${s.min}..${s.max}`, v));
  }
  if (!p.game) return;
  for (const v of numberSweep(p)) {
    const run = p.game.play(v);
    const broke = Math.min(...(run.cues ?? []).filter((c) => c.kind === "snap").map((c) => c.ms));
    const start: number = v[s.id] ?? s.initial;
    const frames = sample(run);
    for (let i = 1; i < frames.length; i++) {
      const b = frames[i]!;
      if (b.ms >= broke) break;
      const before: Values = frames[i - 1]!.frame.values;
      const bounds: [number, number] = reach(before);
      const lo = bounds[0];
      const hi = bounds[1];
      const x: number = b.frame.values[s.id] ?? s.initial;
      assert.ok(x >= Math.min(lo, start) - 1e-6 && x <= Math.max(hi, start) + 1e-6, fail(p, `${b.ms} ms of the run moves ${s.id} to ${x}, outside the reach [${lo}, ${hi}] of the frame before`, v));
    }
  }
}

/** Every pose the figure shows: the slider grid (alone, and with the game's scene) and every run frame with scene and marks. */
function shownPoses(p: Primitive): { label: string; values: Values; parts: Part[] }[] {
  const out = poses(p, 5).map((v) => ({ label: JSON.stringify(v), values: v, parts: p.build(v) }));
  const scene = p.game?.scene;
  if (scene) for (const v of poses(p, 3)) out.push({ label: `${JSON.stringify(v)} with the game's scene`, values: v, parts: [...p.build(v), ...scene(v)] });
  if (p.game) {
    for (const v of numberSweep(p).filter((_, i, all) => i % Math.max(1, Math.floor(all.length / 6)) === 0)) {
      for (const { ms, frame } of sample(p.game.play(v)).filter((_, i) => i % 8 === 0)) {
        out.push({ label: `${ms} ms of the run at ${JSON.stringify(v)}`, values: frame.values, parts: [...p.build(frame.values), ...(scene?.(frame.values) ?? []), ...(frame.marks ?? [])] });
      }
    }
  }
  return out;
}

const PALETTE = new Set<string>(Object.values(COLOR));

/** Width of an arrow extrusion's outline: its length. */
const extent = (part: Part) => (part.shape.kind === "extrusion" ? Math.max(...part.shape.outline.map((q) => q.x)) - Math.min(...part.shape.outline.map((q) => q.x)) : 0);

/** The checkable rules of design-language.md, on every pose the figure shows. */
export function checkDesign(p: Primitive): void {
  const presets = Object.values(VIEW);
  const preset = presets.some((q) => q.elevation === p.view.elevation && q.azimuth === p.view.azimuth);
  assert.ok(preset || (p.viewReason ?? "").trim().length > 10, fail(p, "view is neither VIEW.bench nor VIEW.coaxial, and there is no viewReason"));

  for (const v of poses(p, 3)) assert.equal(p.readouts(v).length, 3, fail(p, "readouts are not exactly 3 rows", v));

  for (const { label, values, parts } of shownPoses(p)) {
    const at = `${p.id} at ${label}`;
    const base = parts.find((q) => q.id === "plate");
    assert.ok(base && base.shape.kind === "box", `${at}: no box part "plate"`);
    if (base.shape.kind === "box") {
      assert.equal(base.parentId, null, `${at}: the plate is not the root part`);
      assert.equal(base.color, COLOR.structure, `${at}: the plate is not structure black`);
      assert.ok(Math.abs(base.shape.height - PLATE_T) < 1e-9 && Math.abs(base.position.y + base.shape.height / 2 - PLATE_TOP) < 1e-9, `${at}: the plate's top is not at y = ${PLATE_TOP}`);
      assert.ok(Math.abs(base.position.x) < 1e-9 && Math.abs(base.position.z) < 1e-9, `${at}: the plate is not centred on x = 0, z = 0`);
      assert.equal(base.shape.cornerRadius, 2, `${at}: the plate's corner radius is not 2`);
    }

    const light = parts.filter((q) => q.color === COLOR.light);
    if (p.handle) {
      assert.equal(light.length, 1, `${at}: ${light.length} light parts; the handle is the one light part`);
      const h = p.handle.at(values);
      const q = light[0]!.position;
      assert.ok(Math.hypot(q.x - h.x, q.y - h.y, q.z - h.z) < 1, `${at}: the light part ${light[0]!.id} is at ${JSON.stringify(q)}, not at handle.at ${JSON.stringify(h)}`);
    }

    for (const q of parts) {
      assert.ok(PALETTE.has(q.color), `${at}: ${q.id} colour ${q.color} is not a COLOR role`);
      const isArrow = /arrow/.test(q.id);
      assert.equal(q.color === COLOR.accent, isArrow, `${at}: ${q.id} ${isArrow ? "is an arrow but not purple" : "is purple but not an arrow"}`);
      if (isArrow) assert.ok(extent(q) >= ARROW_MIN - 1e-9, `${at}: arrow ${q.id} is ${extent(q).toFixed(1)} long, under ${ARROW_MIN}`);
      const s = q.shape;
      if (s.kind === "box") assert.ok(Math.min(s.width, s.height, s.depth) >= 3 - 1e-9, `${at}: box ${q.id} is under 3 mm thick`);
      if (s.kind === "helix") assert.ok(2 * s.tube >= 2.4 - 1e-9, `${at}: coil ${q.id} wire is under 2.4 mm`);
      if (s.kind === "torus") assert.ok(2 * s.tube >= 3 - 1e-9, `${at}: ring ${q.id} tube is under 3 mm`);
      if (s.kind === "extrusion") assert.ok(s.depth >= 3 - 1e-9, `${at}: extrusion ${q.id} is under 3 mm deep`);
    }
  }

  // The rig sits centred on the plate with the plate's margin round it, and is neither a strip nor a stick.
  const grid = poses(p, 5).map(p.build);
  const rig = measurePoses(grid.map((parts) => parts.filter((q) => q.id !== "plate")));
  const all = measurePoses(grid);
  const lo = (k: "X" | "Z") => Math.min(...rig.map((b) => b[`center${k}`] - b[`half${k}`]));
  const hi = (k: "X" | "Z") => Math.max(...rig.map((b) => b[`center${k}`] + b[`half${k}`]));
  for (const k of ["X", "Z"] as const) {
    assert.ok(Math.abs(lo(k) + hi(k)) / 2 <= 3, fail(p, `the rig's poses span ${lo(k).toFixed(1)}..${hi(k).toFixed(1)} in ${k.toLowerCase()}, not centred on 0`));
    const base = grid[0]!.find((q) => q.id === "plate")!;
    const size = base.shape.kind === "box" ? (k === "X" ? base.shape.width : base.shape.depth) : 0;
    const want = hi(k) - lo(k) + 2 * PLATE_MARGIN;
    assert.ok(Math.abs(size - want) <= 4, fail(p, `the plate is ${size.toFixed(1)} in ${k.toLowerCase()}; the rig plus ${PLATE_MARGIN} each side is ${want.toFixed(1)}`));
  }
  const width = Math.max(...all.map((b) => b.centerX + b.halfX)) - Math.min(...all.map((b) => b.centerX - b.halfX));
  const height = Math.max(...all.map((b) => b.maxY)) - Math.min(...all.map((b) => b.minY));
  assert.ok(width / height >= 0.7 && width / height <= 1.4, fail(p, `width : height of every pose together is ${(width / height).toFixed(2)}, outside 0.7..1.4`));
}

/** Distinct kinds of part (by name; copies such as teeth or links count once) an Element or a Mechanism may show at rest. */
export const KIND_BUDGET = { Element: 7, Mechanism: 9 } as const;
/** The game's scene may add this many kinds (a target and what holds it); a run frame may show this many kinds of mark. */
export const SCENE_KINDS = 2;
export const MARK_KINDS = 2;
const kinds = (parts: Part[]) => [...new Set(parts.map((q) => q.name))];

/** Simple first (design-language.md): the kinds of part at rest, in the game's scene, and in any run frame's marks stay in budget. */
export function checkKinds(p: Primitive): void {
  const budget = KIND_BUDGET[p.level];
  const rests = [initial(p), ...(p.game ? [startOf(p)] : [])];
  for (const v of rests) {
    const k = kinds(p.build(v));
    assert.ok(k.length <= budget, fail(p, `${k.length} kinds of part at rest, over the ${p.level}'s ${budget}: ${k.join(", ")}`, v));
    const scene = p.game?.scene ? kinds(p.game.scene(v)) : [];
    assert.ok(scene.length <= SCENE_KINDS, fail(p, `the game's scene adds ${scene.length} kinds, over ${SCENE_KINDS}: ${scene.join(", ")}`, v));
  }
  if (!p.game) return;
  for (const v of numberSweep(p)) {
    for (const { ms, frame } of sample(p.game.play(v))) {
      const m = kinds(frame.marks ?? []);
      assert.ok(m.length <= MARK_KINDS, fail(p, `${ms} ms of the run shows ${m.length} kinds of mark, over ${MARK_KINDS}: ${m.join(", ")}`, v));
    }
  }
}

/** Every game check, for a model's own test file. */
export function checkGame(p: Primitive): void {
  checkTwoSided(p);
  checkVerdictIsJudge(p);
  checkWords(p);
  checkRunFrames(p);
  checkScene(p);
  checkKinds(p);
  checkContinuity(p);
  checkReach(p);
}
