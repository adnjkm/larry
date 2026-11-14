// Weight's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../../shared/kit.ts";
import { checkGame } from "../checks.ts";
import { sample, steps, startOf } from "../checks.ts";
import { PLATE_TOP } from "../parts.ts";
import type { Values } from "../types.ts";
import { bobRadius, CONTACT, freed, freedAt, geometry, NEED, OMEGA, PERIOD, QUARTER, SNAP, strike, strikeOf, STRING_MM, weight, X0 } from "./weight.ts";

const game = weight.game!;
const [mass, swing] = weight.sliders as [NonNullable<(typeof weight.sliders)[0]>, NonNullable<(typeof weight.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const has = (parts: Part[], id: string) => parts.some((p) => p.id === id);
const RAD = Math.PI / 180;

type Pt = [number, number];
/** The crate's four corners in the world, from the part the scene returns. */
function corners(p: Part): Pt[] {
  assert.ok(p.shape.kind === "box");
  const a = (p.rotation.z * Math.PI) / 180;
  const hx = p.shape.width / 2;
  const hy = p.shape.height / 2;
  return ([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as Pt[]).map(([x, y]) => [p.position.x + x * Math.cos(a) - y * Math.sin(a), p.position.y + x * Math.sin(a) + y * Math.cos(a)]);
}
function rect(p: Part): { x0: number; x1: number; y0: number; y1: number } {
  assert.ok(p.shape.kind === "box");
  return { x0: p.position.x - p.shape.width / 2, x1: p.position.x + p.shape.width / 2, y0: p.position.y - p.shape.height / 2, y1: p.position.y + p.shape.height / 2 };
}
/** Deepest a convex polygon's points sink into an axis-aligned box (mm), by sampling its edges. */
function sink(poly: Pt[], r: ReturnType<typeof rect>): number {
  let deepest = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % poly.length]!;
    for (let k = 0; k <= 60; k++) {
      const x = ax + ((bx - ax) * k) / 60;
      const y = ay + ((by - ay) * k) / 60;
      const d = Math.min(x - r.x0, r.x1 - x, y - r.y0, r.y1 - y);
      if (d > 0) deepest = Math.max(deepest, d);
    }
  }
  return deepest;
}
/** Distance from a point to a convex polygon (counter-clockwise or clockwise): 0 inside. */
function distToPoly(poly: Pt[], x: number, y: number): number {
  let inside = true;
  let sign = 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % poly.length]!;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign && cross !== 0) inside = false;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return inside ? 0 : best;
}
const boxPoly = (b: { x0: number; x1: number; y0: number; y1: number }): Pt[] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];

describe("weight", () => {
  it("passes the generic game checks", () => checkGame(weight));

  it("draws the string at the length the swing time is worked out from", () => {
    const parts = weight.build({ mass: 2, swing: -28 });
    const s = find(parts, "string");
    assert.ok(s.shape.kind === "box");
    // strand() is 0.8 of its thickness longer than the gap.
    assert.ok(Math.abs(s.shape.width - 0.8 * 3.2 - STRING_MM) < 1e-9);
    assert.ok(Math.abs(PERIOD - 2 * Math.PI * Math.sqrt(STRING_MM / 1000 / 9.8)) < 1e-12);
    assert.ok(Math.abs(OMEGA * PERIOD - 2 * Math.PI) < 1e-12);
    assert.match(weight.readouts({ mass: 2, swing: -28 })[2]!.value, new RegExp(QUARTER.toFixed(2).replace(".", "\\.")));
  });

  it("is seven kinds of part at most, with the weight arrow and the hand's arrow", () => {
    for (const m of steps(mass)) {
      const parts = weight.build({ mass: m, swing: -28 });
      assert.deepEqual(parts.map((p) => p.id).sort(), ["bead", "bob", "hold-arrow", "plate", "stand", "string", "weight-arrow"]);
      assert.ok(new Set(parts.map((p) => p.name)).size <= 7);
    }
  });

  it("keeps the crate on one side: the bob can only be pulled back to the left of the bottom, and the crate never moves across", () => {
    assert.ok(swing.max < 0 && swing.min < swing.max, "the slider holds the bob out on one side only");
    assert.ok(-swing.max > CONTACT, "and far enough out to reach the crate at its strike angle");
    let crateX: number | undefined;
    for (const a of steps(swing)) {
      for (const m of [1, 3, 5]) {
        const v = { mass: m, swing: a };
        const crate = rect(find(game.scene!(v), "game-crate"));
        assert.ok(crate.x0 > X0 + geometry.CONTACT_X, `m ${m}, a ${a}: the crate is on the far side of the bottom`);
        crateX = crate.x0 - bobRadius(m);
        assert.ok(Math.abs(crateX - (X0 + geometry.CONTACT_X)) < 1e-9);
        const bob = find(weight.build(v), "bob");
        assert.ok(bob.position.x < X0, "the held bob is on the other side of the bottom");
      }
    }
    // The crate does not move when only the swing angle does.
    for (const m of [1, 3, 5]) {
      const x = steps(swing).map((a) => rect(find(game.scene!({ mass: m, swing: a }), "game-crate")).x0);
      assert.ok(x.every((q) => Math.abs(q - x[0]!) < 1e-9), `m ${m}: crate moved with the swing slider`);
    }
  });

  it("draws the hand's pull whenever the bob is held out, at the weight's scale, and not once it is let go", () => {
    const len = (parts: Part[], id: string) => {
      const q = find(parts, id);
      assert.ok(q.shape.kind === "extrusion");
      return Math.max(...q.shape.outline.map((o) => o.x));
    };
    for (const a of steps(swing)) {
      for (const m of [1, 2.6, 5]) {
        const parts = weight.build({ mass: m, swing: a });
        const w = len(parts, "weight-arrow");
        const h = len(parts, "hold-arrow");
        assert.ok(Math.abs(w - Math.max(12, (40 * m) / 5)) < 1e-9, "weight arrow");
        assert.ok(Math.abs(h - Math.max(12, (40 * m * Math.sin(Math.abs(a) * RAD)) / 5)) < 1e-9, `hold arrow ${h} at ${a}, ${m}`);
      }
    }
    for (const v of [{ mass: 3, swing: -35 }, { mass: 1, swing: -26 }]) {
      const run = game.play(v);
      for (const { ms, frame } of sample(run)) {
        const built = weight.build(frame.values);
        const marks = frame.marks ?? [];
        const handOn = has(built, "hold-arrow") || marks.some((q) => /hand-arrow/.test(q.id));
        const let_go = (frame.values.ahead ?? 0) > 1e-9 && !marks.length;
        assert.equal(handOn, !let_go, `${ms} ms: the hand's arrow is ${handOn ? "drawn" : "missing"} while the bob is ${let_go ? "free" : "held"}`);
        assert.ok(!(has(built, "hold-arrow") && marks.length), `${ms} ms: two hand arrows`);
      }
      assert.ok(has(weight.build(run.at(run.durationMs).values), "hold-arrow"), "the rest pose shows its hold");
    }
  });

  it("holds the bob out with exactly the along-the-swing part of the weight, drawn at the weight's scale", () => {
    const len = (parts: Part[], id: string) => {
      const q = find(parts, id);
      assert.ok(q.shape.kind === "extrusion");
      return Math.max(...q.shape.outline.map((o) => o.x));
    };
    for (const a of [-40, -28, -25]) {
      const reset = game.play({ mass: 3, swing: a });
      const frameAt = reset.at(reset.durationMs - 100);
      const hand = frameAt.marks!.find((q) => q.id === "mark-hand-arrow")!;
      const ang = (a + (frameAt.values.ahead ?? 0)) * RAD;
      assert.ok(Math.abs(len([hand], "mark-hand-arrow") - Math.max(12, (40 * 3 * Math.sin(Math.abs(ang))) / 5)) < 1e-9);
    }
  });

  it("keeps the bob clear of the post and the string on the pin at every angle and mass", () => {
    for (const m of steps(mass)) {
      for (const a of steps(swing)) {
        const parts = weight.build({ mass: m, swing: a });
        const bob = find(parts, "bob");
        assert.ok(bob.position.x + bobRadius(m) < geometry.POST_X - geometry.POST_W / 2 - 1, `m ${m}, a ${a}: bob reaches the post`);
        const handle = weight.handle!.at({ mass: m, swing: a });
        assert.ok(Math.abs(Math.hypot(handle.x - X0, geometry.PIVOT_Y - handle.y) - (STRING_MM - bobRadius(m) - 9 - 6)) < 1e-9, "the bead sits just above the bob");
        assert.ok(Math.abs(Math.atan2(handle.x - X0, geometry.PIVOT_Y - handle.y) * (180 / Math.PI) - a) < 1e-9, "the bead is on the string's line");
        assert.ok(Math.abs(weight.handle!.solve(handle, { mass: m, swing: a }) - a) < 1e-9, "solve undoes at");
      }
    }
  });

  it("makes the same swing time at every mass: the cue at the strike does not move with the mass", () => {
    const a = -30;
    const strikeMs = (m: number) => game.play({ ...startOf(weight), mass: m, swing: a }).cues!.find((c) => c.kind === "thud")!.ms;
    const t = strikeMs(2.6);
    for (const m of [2.6, 3, 3.5, 4]) assert.ok(Math.abs(strikeMs(m) - t) < 1e-6, `m ${m}`);
    for (const m of [1, 1.5, 2]) assert.ok(Math.abs(strikeMs(m) - t) < 1e-6, `light m ${m}`);
    // The small-angle swing a0 cos(ωt) is at +CONTACT degrees when cos(ωt) = CONTACT ÷ a0.
    assert.ok(Math.abs(t - (300 + (Math.acos(CONTACT / a) / OMEGA) * 5000)) < 1e-6);
  });

  it("has a window: too light rocks, too heavy snaps, and the numbers are the formulas", () => {
    const pass = steps(mass).filter((m) => game.judge({ ...startOf(weight), mass: m }).pass);
    assert.ok(pass.length >= 10, `window ${pass}`);
    assert.equal(game.judge({ ...startOf(weight), mass: 1 }).outcome, "too-light");
    assert.equal(game.judge({ ...startOf(weight), mass: 5 }).outcome, "string-snapped");
    for (const m of steps(mass)) {
      const v = { ...startOf(weight), mass: m };
      const r = strike(v);
      const a = (35 * Math.PI) / 180;
      assert.ok(Math.abs(r.momentum - m * Math.sqrt(2 * 9.8 * 0.1 * (Math.cos(CONTACT * RAD) - Math.cos(a)))) < 1e-9);
      assert.ok(Math.abs(r.pull - m * 9.8 * (3 - 2 * Math.cos(a))) < 1e-9);
      assert.equal(game.judge(v).pass, r.momentum >= NEED && r.pull <= SNAP);
    }
  });

  it("puts the crate where the bob's rim meets it at the strike angle, level with the bob, whatever the mass", () => {
    for (const m of [1, 3, 5]) {
      const v = { mass: m, swing: -35 };
      const crate = rect(find(game.scene!(v), "game-crate"));
      // The bob's centre when the string is at CONTACT degrees.
      const cx = X0 + STRING_MM * Math.sin(CONTACT * RAD);
      const cy = geometry.PIVOT_Y - STRING_MM * Math.cos(CONTACT * RAD);
      assert.ok(Math.abs(crate.x0 - (cx + bobRadius(m))) < 1e-9, `m ${m}: the crate's near face is not at the bob's rim`);
      assert.ok(cy > crate.y0 && cy < crate.y1, "the bob meets the crate's face");
      // And the bob, resting at the bottom, is clear of it.
      assert.ok(X0 + bobRadius(m) < crate.x0 - 5, "the hanging bob is well short of the crate");
    }
  });

  it("never lets the bob, the crate, the pedestal or the plate cut into each other during a run", () => {
    for (const m of [1, 2.6, 3.5, 4.4, 5]) {
      for (const a of [-40, -35, -25]) {
        const run = game.play({ mass: m, swing: a });
        for (const { ms, frame } of sample(run)) {
          const parts = weight.build(frame.values);
          const scene = game.scene!(frame.values);
          const crate = find(scene, "game-crate");
          const poly = corners(crate);
          const bob = find(parts, "bob");
          const rb = bobRadius(m);
          const at = `m ${m}, a ${a}, ${ms} ms`;
          assert.ok(sink(poly, rect(find(scene, "game-pedestal"))) < 0.05, `${at}: crate in the pedestal`);
          assert.ok(Math.min(...poly.map((p) => p[1])) > PLATE_TOP - 0.05, `${at}: crate through the plate`);
          assert.ok(distToPoly(poly, bob.position.x, bob.position.y) >= rb - 0.05, `${at}: bob in the crate`);
          assert.ok(bob.position.y - rb >= PLATE_TOP - 0.05, `${at}: bob through the plate`);
          const r = rect(find(scene, "game-pedestal"));
          assert.ok(distToPoly(boxPoly(r), bob.position.x, bob.position.y) >= rb - 0.05, `${at}: bob in the pedestal`);
          assert.ok(bob.position.x + rb < geometry.POST_X - geometry.POST_W / 2 + 0.05, `${at}: bob in the post`);
          assert.ok(Math.max(...poly.map((p) => p[0])) < geometry.POST_X - geometry.POST_W / 2 + 0.05, `${at}: crate in the post`);
        }
      }
    }
  });

  it("drops the crate on the plate, flat, away from the shelf and the post", () => {
    const run = game.play({ mass: 3, swing: -35 });
    const end = run.at(run.durationMs).values;
    const crate = corners(find(game.scene!(end), "game-crate"));
    const ys = crate.map((p) => p[1]);
    assert.ok(Math.abs(Math.min(...ys) - PLATE_TOP) < 0.05 && Math.abs(Math.max(...ys) - PLATE_TOP - 24) < 0.05, "lands flat on the plate");
    const plate = find(weight.build(end), "plate");
    assert.ok(plate.shape.kind === "box" && Math.max(...crate.map((p) => p[0])) < plate.shape.width / 2 - 1, "stays on the plate");
    assert.ok(Math.max(...crate.map((p) => p[0])) < geometry.POST_X - geometry.POST_W / 2, "clear of the post");
  });

  describe("a snapped string", () => {
    // Every setting on the sliders' grids that snaps, and, for each swing angle, the lightest bob that snaps at all: the
    // string then breaks just before the bottom and the freed bob has the swing's whole speed.
    const failing: { mass: number; swing: number }[] = [];
    for (const a of steps(swing)) for (const m of steps(mass)) if (strikeOf(m, a).kind === "snap") failing.push({ mass: m, swing: a });
    const limit: { mass: number; swing: number }[] = [];
    for (const a of steps(swing)) {
      const m = SNAP / (9.8 * (3 - 2 * Math.cos(Math.abs(a) * RAD)));
      if (m * (1 + 1e-9) <= 5) limit.push({ mass: m * (1 + 1e-9), swing: a });
    }

    it("has failing settings to test, from the heavy end, at the start's swing", () => {
      assert.ok(failing.length >= 8 && limit.length >= 4);
      assert.ok(failing.some((f) => f.swing === -35 && f.mass === 5));
    });

    it("breaks where the pull first reaches the string's strength, with the swing's speed there", () => {
      for (const f of [...failing, ...limit]) {
        const r = strikeOf(f.mass, f.swing);
        const A = Math.abs(f.swing) * RAD;
        assert.ok(Math.abs(f.mass * 9.8 * (3 * Math.cos(r.breakAt) - 2 * Math.cos(A)) - SNAP) < 1e-6, `pull at the break, ${JSON.stringify(f)}`);
        assert.ok(Math.abs(0.5 * r.speedAtBreak ** 2 - 9.8 * 0.1 * (Math.cos(r.breakAt) - Math.cos(A))) < 1e-9, "energy");
        assert.ok(r.breakAt >= 0 && r.breakAt < A, "on the way down");
      }
    });

    it("lets the freed bob fall below the crate and strike the pedestal or the plate, never the crate, at every failing setting", () => {
      for (const f of [...failing, ...limit]) {
        const fl = freedAt(f.mass, f.swing)!;
        assert.ok(fl.touch === "pedestal" || fl.touch === "plate", `${JSON.stringify(f)} touches ${fl.touch}`);
        const crate = fl.boxes.find((b) => b.name === "crate")!;
        // Along the whole flight to the first touch, and on down the face, the bob stays clear of the crate by a margin.
        let least = Infinity;
        for (let t = 0; t <= fl.tEnd; t += 2e-4) {
          const p = fl.position(t);
          least = Math.min(least, geometry.gap(crate, p.x, p.y) - fl.rb);
        }
        assert.ok(least > 1.5, `${JSON.stringify(f)}: the freed bob passes ${least.toFixed(2)} mm from the crate`);
        // It touches the pedestal's face below the crate's underside.
        assert.ok(fl.hit.y < geometry.LEDGE_Y, "it meets the pedestal below the ledge");
      }
    });

    it("plays exactly that flight: from the break point and velocity under gravity, then down the pedestal to rest on the plate", () => {
      for (const f of failing) {
        const run = game.play(f);
        const fl = freed(f)!;
        const r = strike(f);
        const impact = run.cues!.find((c) => c.kind === "snap")!.ms;
        // The break point is on the string, the velocity along the arc.
        assert.ok(Math.abs(Math.hypot(fl.start.x - X0, geometry.PIVOT_Y - fl.start.y) - STRING_MM) < 1e-9);
        assert.ok(Math.abs(Math.hypot(fl.vel.x, fl.vel.y) - r.speedAtBreak * 1000) < 1e-9);
        for (const { ms, frame } of sample(run)) {
          if (ms < impact) continue;
          const t = (ms - impact) / (geometry.SLOW * 1000);
          const bob = find(weight.build(frame.values), "bob");
          if (t <= fl.tHit) {
            assert.ok(Math.abs(bob.position.x - (fl.start.x + fl.vel.x * t)) < 1e-6, `${JSON.stringify(f)}: x at ${ms}`);
            assert.ok(Math.abs(bob.position.y - (fl.start.y + fl.vel.y * t - 4900 * t * t)) < 1e-6, `${JSON.stringify(f)}: y at ${ms}`);
          } else {
            assert.ok(Math.abs(bob.position.x - fl.hit.x) < 1e-6, "after the touch it drops straight down the face");
          }
        }
      }
    });

    it("leaves the crate alone in every snapped run, and ends with the bob on the plate at the foot of the pedestal", () => {
      for (const f of failing) {
        const run = game.play(f);
        for (const { ms, frame } of sample(run)) {
          assert.equal(frame.values.crateAway ?? 0, 0, `${ms} ms: crate pushed`);
          assert.equal(frame.values.crateTilt ?? 0, 0, `${ms} ms: crate tilted`);
          assert.equal(frame.values.crateDown ?? 0, 0, `${ms} ms: crate dropped`);
        }
        const last = run.at(run.durationMs).values;
        const bob = find(weight.build(last), "bob");
        const crate = rect(find(game.scene!(last), "game-crate"));
        assert.ok(Math.abs(bob.position.y - (PLATE_TOP + bobRadius(f.mass))) < 0.05, "the bob rests on the plate");
        assert.ok(bob.position.x + bobRadius(f.mass) <= crate.x0 + 3 + 1e-6, "short of the pedestal");
        assert.equal(run.verdict.outcome, "string-snapped");
      }
    });

    it("is a failure the picture shows: a harder swing does not hit the crate harder", () => {
      // At every snapping setting the freed bob never touches the crate, so its momentum is irrelevant to the crate.
      for (const f of failing) assert.notEqual(freed(f)!.touch, "crate");
      // And the string's pull is what the verdict quotes.
      assert.match(game.judge({ ...startOf(weight), mass: 5 }).detail, /67 N/);
    });
  });

  it("keeps the readouts on the same numbers as the figure", () => {
    for (const m of [1, 2, 5]) {
      const v: Values = { mass: m, swing: -28 };
      const r = weight.readouts(v);
      assert.match(r[0]!.value, new RegExp((m * 9.8).toFixed(1).replace(".", "\\.")));
      assert.match(r[1]!.value, new RegExp((m * 9.8 * Math.sin((28 * Math.PI) / 180)).toFixed(1).replace(".", "\\.")));
    }
  });
});
