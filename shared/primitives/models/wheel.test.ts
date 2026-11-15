// Wheel's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts and here.
//
// The geometry proofs read the parts build() returns: the bucket against the axle and the cord, the knob against the
// bucket, the wound arc against the turn.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, find, numberSweep, sample } from "../checks.ts";
import { startValues, steps, type Values } from "../types.ts";
import { ARM, LIFT, LOAD, R_EFF, REACH, rig, settle, TURN_MAX, wheel, winch } from "./wheel.ts";

const game = wheel.game;
const [radius, turn] = wheel.sliders as [NonNullable<(typeof wheel.sliders)[0]>, NonNullable<(typeof wheel.sliders)[1]>];
const box = (p: Part) => (p.shape.kind === "box" ? p.shape : assert.fail(`${p.id} is not a box`));
const TAU = 2 * Math.PI;

describe("wheel", () => {
  it("lifts the bucket 2 pi x the cord's radius a turn, and the readout says the same", () => {
    for (const r of [30, 36, 44]) {
      for (const t of [0, 0.25, 0.5, 0.8]) {
        const v = { radius: r, turn: t };
        const s = settle(v);
        const bucket = find(wheel.build(v), "bucket");
        assert.ok(Math.abs(bucket.position.y - box(bucket).height / 2 - (6 + TAU * R_EFF * s.turn)) < 1e-9, `radius ${r}, turn ${t}`);
        assert.ok(Math.abs(s.rise - TAU * R_EFF * s.turn) < 1e-9);
        assert.ok(wheel.readouts(v)[1]!.value.includes(`bucket up ${s.rise.toFixed(0)} mm`));
      }
    }
  });

  it("hangs the bucket from the axle's left tangent: the cord runs from the axle down to the bucket's top, and never into the axle", () => {
    for (const r of [30, 44]) {
      for (const t of [0, 0.4, 0.8]) {
        const parts = wheel.build({ radius: r, turn: t });
        const cord = find(parts, "cord");
        const bucket = find(parts, "bucket");
        assert.ok(Math.abs(cord.position.x + R_EFF) < 1e-9, "the cord leaves the axle's tangent");
        const top = cord.position.y + (box(cord).width - 3.2 * 0.8) / 2;
        assert.ok(Math.abs(top - rig.AXLE_Y) < 1e-6, `the cord's top is ${top - rig.AXLE_Y} off the axle's centre height`);
        const bucketTop = bucket.position.y + box(bucket).height / 2;
        assert.ok(bucketTop <= rig.AXLE_Y - 8 - 3, `the bucket rises into the axle at turn ${t}`);
      }
    }
  });

  it("winds the cord on as the wheel turns: the wound arc grows with the turn", () => {
    let last = 0;
    for (const t of steps(turn)) {
      const w = find(wheel.build({ radius: 40, turn: t }), "wound");
      assert.ok(w.shape.kind === "torus");
      assert.ok(w.shape.arcDegrees >= last - 1e-9, "the wound cord shrinks");
      last = w.shape.arcDegrees;
    }
    assert.ok(last > 200);
  });

  it("shows both radii: the wheel's is the slider, the axle's is fixed", () => {
    for (const r of steps(radius)) {
      const parts = wheel.build({ radius: r, turn: 0 });
      const disc = find(parts, "wheel");
      const axle = find(parts, "axle");
      assert.ok(disc.shape.kind === "lathe" && axle.shape.kind === "lathe");
      assert.equal(Math.max(...disc.shape.profile.map((q) => q.r)), r);
      assert.equal(Math.max(...axle.shape.profile.map((q) => q.r)), 8);
    }
  });

  it("puts the knob's centre ON the rim, turning clockwise to lift", () => {
    for (const r of steps(radius)) {
      for (const t of [0, 0.2, 0.5, 0.55]) {
        const v = { radius: r, turn: t };
        const parts = wheel.build(v);
        const k = find(parts, "knob");
        const h = wheel.handle.at(v);
        assert.ok(Math.hypot(k.position.x - h.x, k.position.y - h.y, k.position.z - h.z) < 1e-9);
        assert.ok(Math.abs(Math.hypot(k.position.x, k.position.y - rig.AXLE_Y) - r) < 1e-9, `radius ${r}: the knob is not on the rim`);
      }
    }
    const a = (t: number) => {
      const k = find(wheel.build({ radius: 40, turn: t }), "knob").position;
      return (Math.atan2(k.y - rig.AXLE_Y, k.x) * 180) / Math.PI;
    };
    assert.ok(Math.abs(a(0) - 150) < 1e-9);
    assert.ok(Math.abs(a(0.1) - 114) < 1e-9, "a tenth of a turn is 36 degrees clockwise");
  });

  it("uses the knob's radius in every force and travel: the drawn knob's distance from the axle gives the hold, the rim travel and the verdict's numbers", () => {
    for (const r of steps(radius)) {
      for (const t of [0.1, 0.3, 0.5]) {
        const v = { radius: r, turn: t };
        const s = settle(v);
        const k = find(wheel.build(v), "knob").position;
        const dist = Math.hypot(k.x, k.y - rig.AXLE_Y);
        assert.ok(Math.abs(dist - s.hand) < 1e-9 && s.hand === r);
        // Hold: the bucket's pull on the axle (LOAD x R_EFF) over the lever arm the hand really has.
        assert.ok(Math.abs((LOAD * R_EFF) / dist - s.hold) < 1e-9, `radius ${r}: hold ${s.hold} is not W x r / the knob's radius`);
        assert.ok(wheel.readouts(v)[0]!.value.includes(`÷ ${dist.toFixed(0)} = ${s.hold.toFixed(1)} N`), `radius ${r}: the readout's radius is not the knob's`);
        // Travel: the knob goes round an arc of its own radius.
        const k0 = find(wheel.build({ radius: r, turn: 0 }), "knob").position;
        const swept = Math.atan2(k0.y - rig.AXLE_Y, k0.x) - Math.atan2(k.y - rig.AXLE_Y, k.x);
        const arc = dist * (swept < 0 ? swept + TAU : swept);
        if (!s.weak) assert.ok(Math.abs(arc - s.rim) < 1e-6, `radius ${r}, turn ${t}: the knob went ${arc} mm round, the readout says ${s.rim}`);
      }
    }
    // The verdict's arithmetic uses it too: a pass holds with the arm's 15 N at the knob's own radius.
    for (const r of [32, 35, 38]) {
      const hand = Math.hypot(find(wheel.build({ radius: r, turn: 0 }), "knob").position.x, find(wheel.build({ radius: r, turn: 0 }), "knob").position.y - rig.AXLE_Y);
      assert.ok((LOAD * R_EFF) / hand <= ARM + 1e-9, `radius ${r}: a pass the hand could not hold`);
    }
    assert.ok((LOAD * R_EFF) / 31 > ARM, "31 is too small to pass");
    assert.equal(game.judge({ radius: 31, turn: 0 }).pass, false);
  });

  it("never lets the bucket or its cord overlap the knob in the picture, at any radius or turn the slider reaches", () => {
    const e = rig.BUCKET;
    for (const r of steps(radius)) {
      for (const t of steps({ ...turn, step: 0.01 })) {
        const v = { radius: r, turn: t };
        const parts = wheel.build(v);
        const k = find(parts, "knob").position;
        const bucket = find(parts, "bucket");
        const cord = find(parts, "cord");
        const rects = [
          { x0: bucket.position.x - e / 2, x1: bucket.position.x + e / 2, y0: bucket.position.y - e / 2, y1: bucket.position.y + e / 2 },
          { x0: cord.position.x - 1.6, x1: cord.position.x + 1.6, y0: bucket.position.y + e / 2, y1: rig.AXLE_Y },
        ];
        for (const q of rects) {
          const dx = Math.max(q.x0 - k.x, 0, k.x - q.x1);
          const dy = Math.max(q.y0 - k.y, 0, k.y - q.y1);
          assert.ok(Math.hypot(dx, dy) > 5.5 + 1, `radius ${r}, turn ${t}: the knob is ${Math.hypot(dx, dy).toFixed(1)} mm from the bucket or cord in the front view`);
        }
        assert.ok(k.z + 10 < bucket.position.z - e / 2, "the knob's tip reaches the bucket's z");
      }
    }
  });

  it("only turns as far as an arm can turn it: a millimetre or two when the wheel is too small", () => {
    for (const r of steps(radius)) {
      const [lo, hi] = wheel.handle.reach!({ radius: r, turn: 0.3 });
      assert.equal(lo, 0);
      if ((LOAD * R_EFF) / r > ARM + 1e-9) {
        assert.ok(hi * TAU * r <= 1.5 + 1e-9 && hi > 0, `radius ${r}: reach ${hi}`);
        assert.ok(settle({ radius: r, turn: 0.5 }).turn <= hi + 1e-12);
      } else assert.equal(hi, TURN_MAX);
    }
    assert.equal(settle({ radius: 36, turn: 0.3 }).turn, 0.3);
    assert.ok(settle({ radius: 31, turn: 0.3 }).turn < 0.01, "a wheel that has become too small re-settles");
  });

  it("draws the rim pull that holds the bucket, from the same numbers as the readout", () => {
    const len = (p: Part) => (p.shape.kind === "extrusion" ? Math.max(...p.shape.outline.map((q) => q.x)) : 0);
    assert.equal(wheel.build({ radius: 36, turn: 0 }).filter((p) => p.id === "pull-arrow").length, 0);
    const parts = wheel.build({ radius: 36, turn: 0.3 });
    assert.ok(Math.abs(len(find(parts, "bucket-arrow")) - 40) < 1e-9);
    assert.ok(Math.abs(len(find(parts, "pull-arrow")) - Math.max(12, (40 * settle({ radius: 36, turn: 0.3 }).hold) / LOAD)) < 1e-9);
  });

  it("drags the knob round to the pointer and back", () => {
    const h = wheel.handle;
    for (const r of [34, 40]) {
      for (const t of [0.05, 0.3, 0.5]) {
        const v: Values = { radius: r, turn: t };
        assert.ok(Math.abs(h.solve(h.at(v), v) - t) < 1e-9, `radius ${r}, turn ${t}`);
      }
    }
  });

  it("lifts the bucket for radii 32 to 38: smaller turns too hard, bigger runs the arm out", () => {
    const outcome = Object.fromEntries(numberSweep(wheel).map((v) => [v.radius, game.judge(v).outcome]));
    for (const r of steps(radius)) {
      const o = outcome[r as number];
      if (r < 32) assert.equal(o, "too-heavy", `radius ${r}`);
      else if (r <= 38) assert.equal(o, "bucket-lifted", `radius ${r}`);
      else assert.equal(o, "out-of-reach", `radius ${r}`);
    }
    assert.equal(game.judge(startValues(wheel)).outcome, "too-heavy");
  });

  it("raises the bucket exactly LIFT on a pass, stops short when the arm runs out, and barely moves when too heavy", () => {
    for (const v of numberSweep(wheel)) {
      const run = game.play(v);
      const r = winch(v);
      const peak = Math.max(...sample(run).map(({ frame }) => settle(frame.values).rise));
      if (r.kind === "pass") assert.ok(Math.abs(peak - LIFT) < 1e-6, `radius ${v.radius}: up ${peak}`);
      else if (r.kind === "short") assert.ok(Math.abs(peak - r.canLift) < 1e-6 && peak < LIFT, `radius ${v.radius}: up ${peak}, arm gives ${r.canLift}`);
      else assert.ok(peak < 1.5 * (R_EFF / (v.radius ?? 1)), `radius ${v.radius}: moved ${peak}`);
    }
  });

  it("brings the top of the bucket to the line when it is up", () => {
    const mark = find(game.scene!({ radius: 36, turn: 0 }), "game-mark");
    const run = game.play({ radius: 36, turn: 0 });
    const top = sample(run).reduce((a, b) => (settle(b.frame.values).rise > settle(a.frame.values).rise ? b : a));
    const bucket = find(wheel.build(top.frame.values), "bucket");
    assert.ok(Math.abs(bucket.position.y + box(bucket).height / 2 - mark.position.y) < 1e-6);
  });

  it("misses by at least 3 mm at the big-wheel extreme, in the numbers and against the line in the picture; too small barely moves it", () => {
    const r = winch({ radius: 44 });
    assert.equal(r.kind, "short");
    assert.ok(LIFT - r.canLift >= 3, `radius 44 lifts ${r.canLift} mm of ${LIFT}`);
    const run = game.play({ radius: 44, turn: 0 });
    const mark = find(game.scene!({ radius: 44, turn: 0 }), "game-mark");
    const top = sample(run).reduce((a, b) => (settle(b.frame.values).rise > settle(a.frame.values).rise ? b : a));
    const bucket = find(wheel.build(top.frame.values), "bucket");
    const gap = mark.position.y - (bucket.position.y + box(bucket).height / 2);
    assert.ok(gap >= 3, `radius 44: the bucket's top stops ${gap.toFixed(2)} mm under the line`);
    assert.ok(Math.abs(gap - (LIFT - r.canLift)) < 1e-6, "the picture's gap is the verdict's gap");
    const small = winch({ radius: 20 });
    assert.ok(small.kind === "weak" && LIFT - 1.5 > 3);
    assert.equal(REACH, 120);
  });

  it("puts the line on a post: at least 10 long, touching its face, in the bucket's own plane and clear of the knob", () => {
    const scene = game.scene!({ radius: 36, turn: 0 });
    const mark = find(scene, "game-mark");
    const post = find(scene, "game-mark-post");
    assert.ok(mark.shape.kind === "box" && post.shape.kind === "box");
    assert.ok(mark.shape.width >= 10);
    assert.equal(mark.parentId, "game-mark-post");
    assert.ok(Math.abs(mark.position.x - mark.shape.width / 2 - (post.position.x + post.shape.width / 2)) < 1e-9, "the line does not touch the post");
    assert.ok(Math.abs(post.position.y - post.shape.height / 2 - 6) < 1e-9 && post.position.y + post.shape.height / 2 > mark.position.y);
    const bucket = find(wheel.build({ radius: 36, turn: 0 }), "bucket");
    assert.ok(Math.abs(mark.position.z - bucket.position.z) < 1e-9, "the line is not in the bucket's plane");
    // The line's free end stays clear of the bucket's left face, and the post is left of the bucket: open background, not the support post.
    assert.ok(mark.position.x + mark.shape.width / 2 < bucket.position.x - box(bucket).width / 2 - 2);
    // ...and short of the weight arrow that stands beside the bucket, at every turn.
    for (const t of [0, 0.3, 0.55]) {
      const arrowPart = find(wheel.build({ radius: 36, turn: t }), "bucket-arrow");
      assert.ok(mark.position.x + mark.shape.width / 2 < arrowPart.position.x - 5 - 2, "the line runs into the weight arrow");
    }
    assert.ok(post.position.x + post.shape.width / 2 < bucket.position.x - box(bucket).width / 2);
    // The knob stays in front of the wheel's face and behind the bucket's plane, so the post (in the bucket's plane) never meets it.
    for (const r of steps(radius)) for (const t of [0, 0.5]) assert.ok(find(wheel.build({ radius: r, turn: t }), "knob").position.z + 10 < post.position.z - post.shape.depth / 2);
    assert.equal(new Set(scene.map((p) => p.name)).size, 2);
  });

  it("keeps to seven kinds of part at rest and two in the scene", () => {
    const kinds = (parts: Part[]) => new Set(parts.map((p) => p.name));
    assert.ok(kinds(wheel.build({ radius: 36, turn: 0.3 })).size <= 7, [...kinds(wheel.build({ radius: 36, turn: 0.3 }))].join());
    assert.ok(kinds(game.scene!({ radius: 36, turn: 0 })).size <= 2);
  });

  it("passes the generic game and design checks", () => {
    checkGame(wheel);
    checkDesign(wheel);
  });
});
