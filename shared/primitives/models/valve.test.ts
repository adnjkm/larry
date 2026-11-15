// Valve's own tests: the generic game and design checks (checks.ts), and proofs of its own claims.
//
// The contact proofs do not reuse the model's expressions: they take the parts build() returns, place the body outlines
// in the world as the renderer does, and measure the ball's circle, the spring and the bag against them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, numberSweep, sample } from "../checks.ts";
import { startValues, steps, type Values } from "../types.ts";
import { BALL_R, LEAK_LIMIT, pumpUp, rig, SEAT_AREA, settle, springFor, STEP, STROKES, strokeAt, TARGET, TAU, THUMB, valve } from "./valve.ts";

type Pt = [number, number];
const game = valve.game;
const [open, pressure] = valve.sliders as [NonNullable<(typeof valve.sliders)[0]>, NonNullable<(typeof valve.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);

function world(part: Part): Pt[] {
  assert.ok(part.shape.kind === "extrusion");
  const xs = part.shape.outline.map((q) => q.x);
  const ys = part.shape.outline.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return part.shape.outline.map(({ x, y }): Pt => [part.position.x + x - cx, part.position.y + y - cy]);
}
function segDistance(p: Pt, a: Pt, b: Pt): number {
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1)));
  return Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1]));
}
/** How far a circle reaches into the outline (positive: overlap) or stands off it (negative: gap). */
function reach(centre: Pt, r: number, poly: Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDistance(centre, poly[j]!, poly[i]!));
  return r - d;
}
const radius = (part: Part) => {
  assert.ok(part.shape.kind === "lathe");
  return Math.max(...part.shape.profile.map((q) => q.r));
};
/** The deepest the ball or the bag reaches into the body (positive: overlap), each as a circle in the cut. */
const inBody = (v: Values, id: "ball" | "bag") => {
  const parts = valve.build(v);
  const p = find(parts, id);
  const body = [world(find(parts, "body-left")), world(find(parts, "body-right"))];
  return Math.max(...body.map((poly) => reach([p.position.x, p.position.y], radius(p), poly)));
};

const kinds = (r: ReturnType<typeof pumpUp>) => r.kind;

describe("valve", () => {
  it("passes the generic game checks", () => checkGame(valve));
  it("follows the design language", () => checkDesign(valve));

  it("never lets the ball cut into the body; seated it rests on the seat's edge", () => {
    for (const o of steps(open)) {
      for (const p of steps(pressure)) {
        const v = { open: o, pressure: p };
        const r = inBody(v, "ball");
        assert.ok(r <= 1e-6, `open ${o}, pressure ${p}: ball ${r.toFixed(4)} mm into the body`);
        if (settle(v).lift < 1e-9) assert.ok(r > -1e-6, `open ${o}, pressure ${p}: seated ball floats ${(-r).toFixed(4)} mm off the seat`);
      }
    }
  });

  it("holds the spring between the ball and the shoulder, and stops the ball where its coils touch", () => {
    for (const o of steps(open)) {
      for (const p of steps(pressure)) {
        const v = { open: o, pressure: p };
        const parts = valve.build(v);
        const spring = find(parts, "spring");
        const ball = find(parts, "ball");
        assert.ok(spring.shape.kind === "helix");
        const { tube, radius: coilR, length, turns } = spring.shape;
        const bottom = spring.position.y - length / 2;
        // The bottom wire's centre ring, at the coil's radius, sits on the sphere.
        assert.ok(Math.abs(Math.hypot(coilR, bottom + tube - ball.position.y) - (BALL_R + tube)) < 1e-9, `open ${o}, pressure ${p}: spring off the ball`);
        assert.ok(Math.abs(spring.position.y + length / 2 - rig.SHOULDER) < 1e-9, "the spring's top bears on the shoulder");
        const solid = 2 * tube * (turns + 1);
        assert.ok(length >= solid - 1e-9, `open ${o}, pressure ${p}: spring squeezed past solid`);
        if (settle(v).solid) assert.ok(Math.abs(length - solid) < 1e-9, `open ${o}, pressure ${p}: on its stop, the coils touch`);
      }
    }
  });

  it("lifts only when the push beats the spring's preload, and pressure from the bag only keeps it shut", () => {
    for (const o of steps(open)) {
      for (const p of steps(pressure)) {
        const s = settle({ open: o, pressure: p });
        assert.equal(s.lift > 0, (p * SEAT_AREA) / 1000 > s.preload + 1e-9, `open ${o}, pressure ${p}`);
      }
      for (const bag of [10, 100, 250]) {
        assert.equal(settle({ open: o, pressure: 0, bag }).lift, 0, `open ${o}, bag ${bag}: lifted from above`);
        assert.equal(settle({ open: o, pressure: Math.min(THUMB, bag + o), bag }).lift, 0, `open ${o}, bag ${bag}: lifted with no push past opening`);
      }
    }
  });

  it("shows the opening pressure in the spring: thicker wire and fewer turns as it rises", () => {
    const springs = steps(open).map(springFor);
    for (let i = 1; i < springs.length; i++) {
      assert.ok(springs[i]!.wire > springs[i - 1]!.wire);
      assert.ok(springs[i]!.turns < springs[i - 1]!.turns);
    }
    assert.ok(springs[springs.length - 1]!.wire / springs[0]!.wire > 1.4, "the stiffest wire is clearly thicker");
  });

  it("decides the leak from the spring: a softer one reseats slower and starts later, and a stiff one has no leak", () => {
    for (const o of steps(open)) {
      const r = pumpUp({ open: o });
      assert.ok(Math.abs(springFor(o).reseat * Math.sqrt(o) - springFor(20).reseat * Math.sqrt(20)) < 1e-9, `open ${o}: reseat time goes as 1 ÷ √k`);
      assert.ok(Math.abs(r.share - r.late / TAU) < 1e-12);
      if (o > 20) assert.ok(r.late <= pumpUp({ open: o - 5 }).late, `open ${o}: no later than the softer spring`);
    }
    for (let o = 65; o <= 160; o += 5) assert.equal(pumpUp({ open: o }).late, 0, `open ${o}: down before the pump drops below the bag`);
  });

  it("passes for 55 to 110 kPa: softer leaks back, stiffer stalls; both far off at the ends", () => {
    const outcomes = Object.fromEntries(numberSweep(valve).map((v) => [v.open, game.judge(v).outcome]));
    for (let o = 20; o <= 50; o += 5) assert.equal(outcomes[o], "leaks-back", `open ${o}`);
    for (let o = 55; o <= 110; o += 5) assert.equal(outcomes[o], "pumped-up", `open ${o}`);
    for (let o = 115; o <= 160; o += 5) assert.equal(outcomes[o], "stalls-short", `open ${o}`);
    for (let o = 115; o <= 160; o += 5) assert.equal(pumpUp({ open: o }).final, THUMB - o, `open ${o}: stalls at the ceiling`);
    for (let o = 55; o <= 110; o += 5) assert.ok(pumpUp({ open: o }).share <= LEAK_LIMIT && THUMB - o >= TARGET);
    assert.ok(pumpUp({ open: 20 }).final < TARGET / 2, "the softest spring ends under half the mark");
    assert.ok(pumpUp({ open: 160 }).final < (2 * TARGET) / 3, "the stiffest ends under two thirds of it");
    assert.ok(pumpUp({ open: 80 }).final >= TARGET + 20, "mid-window clears the mark comfortably");
  });

  it("pumps six strokes: the ball lifts and clicks down on each stroke that moves air, never on a stalled one", () => {
    for (const v of numberSweep(valve)) {
      const run = game.play(v);
      const r = pumpUp(v);
      const clicks = (run.cues ?? []).filter((c) => c.kind === "click");
      assert.equal(clicks.length, r.list.filter((s) => s.gain > 0).length, `open ${v.open}`);
      for (const c of clicks) {
        assert.ok(settle(run.at(c.ms - 4).values).lift > 0, `open ${v.open}: down before the click at ${c.ms} ms`);
        assert.equal(settle(run.at(c.ms + 1).values).lift, 0, `open ${v.open}: still up after the click at ${c.ms} ms`);
      }
      // A stalled stroke never lifts the ball, though the thumb pushes all the way.
      r.list.forEach((s, n) => {
        if (s.gain > 0) return;
        for (let t = 0; t < rig.STROKE; t += 5) assert.equal(settle({ ...v, open: r.open, ...pick(strokeAt(r, n, t)) }).lift, 0, `open ${v.open}, stroke ${n + 1}`);
      });
      assert.ok(Math.abs((run.at(run.durationMs).values.bag ?? 0) - r.final) < 1e-9);
    }
  });

  it("shows three different pictures: the pass reaches the mark, the stall stops below it, the leak sags between strokes", () => {
    const tops = (o: number) => sample(game.play({ ...startValues(valve), open: o })).map(({ frame }) => rig.bagTop(frame.values.bag ?? 0));
    assert.ok(Math.max(...tops(80)) >= rig.MARK_Y, "the pass gets the bag's top to the mark");
    assert.ok(Math.max(...tops(160)) < rig.MARK_Y - 5, "the stall leaves it well below");
    const leak = pumpUp({ open: 20 });
    for (const s of leak.list) assert.ok(s.lost > 0.3 * s.after - 1e-9, "a soft spring loses a third of the bag each stroke");
    const stiff = pumpUp({ open: 160 });
    for (const s of stiff.list) assert.equal(s.lost, 0, "a stiff spring loses nothing");
  });

  it("counts the bag one way within each phase of a stroke, with air dots moving the way the air goes", () => {
    for (const o of [20, 50, 80, 160]) {
      const r = pumpUp({ open: o });
      for (let n = 0; n < STROKES; n++) {
        let last = -Infinity;
        for (let t = 0; t < rig.PUSH_MS; t += 2) {
          const k = strokeAt(r, n, t);
          assert.ok(k.bag >= last - 1e-9, `open ${o}, stroke ${n + 1}: bag falls while pushing`);
          last = k.bag;
          if (k.flow !== 0) assert.equal(k.flow, 1, "air goes in on the push");
        }
        last = Infinity;
        for (let t = rig.PUSH_MS; t < rig.STROKE; t += 2) {
          const k = strokeAt(r, n, t);
          assert.ok(k.bag <= last + 1e-9, `open ${o}, stroke ${n + 1}: bag rises on the way back`);
          last = k.bag;
          if (k.flow !== 0) assert.equal(k.flow, -1, "air only runs back on the way back");
        }
        assert.ok(Math.abs(strokeAt(r, n, rig.STROKE - 1).bag - (r.list[n]!.after - r.list[n]!.lost)) < 1e-9);
      }
    }
    const run = game.play({ ...startValues(valve), open: 20 });
    let up = false;
    let down = false;
    for (const { frame } of sample(run)) {
      const dots = (frame.marks ?? []).filter((m) => m.name === "Air");
      for (const d of dots) {
        assert.ok(d.position.y >= rig.DOT_LO - 1e-9 && d.position.y <= rig.DOT_HI + 1e-9, "air stays in the neck");
        assert.ok(Math.abs(d.position.x - rig.VX) < 1e-9);
      }
      if (/running back/.test(frame.live)) down ||= dots.length > 0;
      else up ||= dots.length > 0;
    }
    assert.ok(up && down, "air is drawn going in and running back");
  });

  it("never lets the ball cut into the body during a run; the bag sits on the neck and clear of the mark", () => {
    const tick = find(game.scene!(startValues(valve)), "game-mark");
    assert.ok(tick.shape.kind === "box" && tick.shape.width >= 10, "the mark is at least 10 mm long");
    const post = find(game.scene!(startValues(valve)), "game-mark-post");
    assert.ok(post.shape.kind === "box" && Math.abs(tick.position.x - tick.shape.width / 2 - (post.position.x + post.shape.width / 2)) < 1e-9, "the mark meets its post");
    const tickLine: [Pt, Pt] = [[tick.position.x - tick.shape.width / 2, tick.position.y], [tick.position.x + tick.shape.width / 2, tick.position.y]];
    for (const v of [startValues(valve), ...numberSweep(valve).filter((q) => [20, 50, 80, 120, 160].includes(q.open ?? 0))]) {
      for (const { ms, frame } of sample(game.play(v))) {
        assert.ok(inBody(frame.values, "ball") <= 1e-6, `open ${v.open} at ${ms} ms: ball in the body`);
        assert.ok(inBody(frame.values, "bag") <= 1e-6, `open ${v.open} at ${ms} ms: bag in the neck`);
        const bag = find(valve.build(frame.values), "bag");
        const clear = segDistance([bag.position.x, bag.position.y], ...tickLine) - 1.5 - radius(bag);
        assert.ok(clear > 0.5, `open ${v.open} at ${ms} ms: bag ${clear.toFixed(2)} mm from the mark`);
      }
    }
    // The bag rests on the neck's rim.
    for (const bag of [0, 140, 230]) {
      const b = find(valve.build({ open: 80, pressure: 0, bag }), "bag");
      assert.ok(Math.abs(Math.hypot(rig.NECK, b.position.y - rig.NECK_TOP) - radius(b)) < 1e-9, `bag ${bag}: on the rim`);
    }
  });

  it("puts STEP into the bag each full stroke until the ceiling", () => {
    const r = pumpUp({ open: 80 });
    r.list.forEach((s) => assert.equal(s.gain, Math.min(STEP, THUMB - 80 - s.from)));
    assert.ok(kinds(r) === "pass");
  });
});

function pick(k: { pump: number; bag: number; held: number }): Values {
  return { pressure: k.pump, bag: k.bag, held: k.held };
}
