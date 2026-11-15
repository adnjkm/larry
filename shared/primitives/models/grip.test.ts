// Grip's own tests. The generic game and design checks (checks.ts) run here, in its own file, so node runs the models in parallel.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { DEG_TO_RAD } from "../../angles.ts";
import { checkDesign, checkGame, contact, find, sample } from "../checks.ts";
import { type Pt, PLATE_TOP } from "../parts.ts";
import { playBuild, playHandle, playMotion, playTuning, playValues, startValues, steps, type Values } from "../types.ts";
import { blockPose, CRACK, geometry, grip, hold, LOAD_END, MU, ramp, settle, SLIDE, slipAngle, TARGET } from "./grip.ts";

const game = grip.game;
const [squeeze, load] = grip.sliders as [NonNullable<(typeof grip.sliders)[0]>, NonNullable<(typeof grip.sliders)[1]>];
/** A box part's outline in world x-y: its four corners, turned about z. */
const corners = (p: Part): Pt[] => {
  assert.ok(p.shape.kind === "box");
  const { width: w, height: h } = p.shape;
  const a = p.rotation.z * DEG_TO_RAD;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]): Pt => [
    p.position.x + (x! * w * Math.cos(a)) / 2 - (y! * h * Math.sin(a)) / 2,
    p.position.y + (x! * w * Math.sin(a)) / 2 + (y! * h * Math.cos(a)) / 2,
  ]);
};
/** The hinge pin's outline in world x-y: radius 3 about its centre. */
const circle = (p: Part): Pt[] =>
  Array.from({ length: 48 }, (_, i): Pt => [p.position.x + 3 * Math.cos((i * Math.PI) / 24), p.position.y + 3 * Math.sin((i * Math.PI) / 24)]);
const length = (p: Part) => {
  assert.ok(p.shape.kind === "extrusion");
  return Math.max(...p.shape.outline.map((o) => o.x));
};

describe("grip", () => {
  it("passes the generic game checks", () => checkGame(grip));
  it("follows the design language", () => checkDesign(grip));

  it("is six kinds of part at rest", () => {
    assert.deepEqual(
      grip
        .build({ squeeze: 40, load: 20 })
        .map((p) => p.id)
        .sort(),
      ["handle", "limit-arrow", "load-arrow", "pad-left", "pad-right", "plate", "rod"],
    );
  });

  it("presses both pads on the rod with no gap and no overlap, squashed more as the squeeze grows", () => {
    let last = Infinity;
    for (const n of steps(squeeze)) {
      const parts = grip.build({ squeeze: n, load: 20 });
      const rod = find(parts, "rod");
      const l = find(parts, "pad-left");
      const r = find(parts, "pad-right");
      assert.ok(l.shape.kind === "box" && r.shape.kind === "box");
      assert.ok(Math.abs(rod.position.x - geometry.ROD_R - (l.position.x + l.shape.width / 2)) < 1e-9, `left pad at ${n} N`);
      assert.ok(Math.abs(r.position.x - r.shape.width / 2 - geometry.ROD_R - geometry.X0) < 1e-9, `right pad at ${n} N`);
      assert.ok(r.shape.width < last, "thinner with more squeeze");
      last = r.shape.width;
      const handle = find(parts, "handle");
      assert.ok(Math.abs(handle.position.x - geometry.KNOB / 2 - (r.position.x + r.shape.width / 2)) < 1e-9, "the thumb knob rests on the pad");
    }
  });

  it("draws the friction limit and the load at one scale", () => {
    for (const n of [10, 25, 40, 60]) {
      for (const w of [5, 20, 40, 60]) {
        const parts = grip.build({ squeeze: n, load: w });
        const a = length(find(parts, "limit-arrow"));
        const b = length(find(parts, "load-arrow"));
        assert.ok(Math.abs(a - Math.max(12, (40 * MU * 2 * n) / 60)) < 1e-9, `limit arrow at ${n}`);
        assert.ok(Math.abs(b - Math.max(12, (40 * w) / 60)) < 1e-9, `load arrow at ${w}`);
      }
    }
  });

  it("holds when the limit beats the load and has slid to the plate when it does not, never in between", () => {
    for (const n of steps(squeeze)) {
      for (const w of steps(load)) {
        const parts = grip.build({ squeeze: n, load: w });
        const rod = find(parts, "rod");
        assert.ok(rod.shape.kind === "box" || rod.shape.kind === "lathe");
        const bottom = rod.position.y - geometry.ROD_LEN / 2;
        const slips = w > MU * 2 * n;
        assert.ok(Math.abs(bottom - (slips ? PLATE_TOP : geometry.HELD_BOTTOM)) < 1e-9, `squeeze ${n}, load ${w}`);
        assert.equal(settle({ squeeze: n, load: w }).slips, slips);
        // Either way the rod is still between the pads.
        assert.ok(bottom + geometry.ROD_LEN > PLATE_TOP + 20 && bottom < PLATE_TOP + geometry.PAD_H - 20);
      }
    }
  });

  it("passes between a weak and a crushing squeeze, and the numbers are the formulas", () => {
    const pass = steps(squeeze).filter((n) => game.judge({ ...startValues(grip), squeeze: n }).pass);
    assert.equal(pass[0], Math.ceil(LOAD_END / (2 * MU)));
    assert.equal(pass.at(-1), CRACK);
    assert.equal(game.judge({ squeeze: 20, load: 5 }).outcome, "slipped");
    assert.equal(game.judge({ squeeze: CRACK + 1, load: 5 }).outcome, "glass-cracked");
    assert.equal(hold({ squeeze: 45 }).limit, 36);
  });

  it("slides the rod down to the plate when the load passes the limit, exactly then, and cracks a chip off at once", () => {
    const run = game.play({ squeeze: 25, load: 5 });
    const slip = run.cues!.find((c) => c.kind === "slip")!;
    const before = settle(run.at(slip.ms - 20).values);
    assert.equal(before.slips, false);
    assert.ok(Math.abs(before.load - MU * 2 * 25) < 0.5, "the slip comes as the load reaches the limit");
    assert.ok(Math.abs(settle(run.at(run.durationMs).values).bottom - PLATE_TOP) < 1e-9, "ends on the plate");
    const crack = game.play({ squeeze: 56, load: 5 });
    const end = grip.build(crack.at(crack.durationMs).values);
    assert.ok(end.some((p) => p.id === "rod-chip"));
    const chip = find(end, "rod-chip");
    assert.ok(Math.abs(chip.position.y - geometry.CHIP / 2 - PLATE_TOP) < 1e-9, "the chip lies on the plate");
    assert.ok(
      Math.abs(find(end, "rod").position.y - (geometry.HELD_BOTTOM + geometry.CHIP + (geometry.ROD_LEN - geometry.CHIP) / 2)) < 1e-9,
      "the rest stays held",
    );
  });

  it("keeps the handle on the thumb disc and solves back to the squeeze", () => {
    for (const n of steps(squeeze)) {
      const v = { squeeze: n, load: 20 };
      assert.ok(Math.abs(grip.handle.solve(grip.handle.at(v), v) - n) < 1e-9);
    }
  });

  it("drops no rod below the plate in any run", () => {
    for (const n of [10, 30, 45, 56]) {
      for (const { frame } of sample(game.play({ squeeze: n, load: 5 }))) {
        for (const p of grip.build(frame.values).filter((q) => q.id.startsWith("rod"))) {
          assert.ok(p.shape.kind === "lathe" || p.shape.kind === "box");
          assert.ok(p.position.y - (p.shape.kind === "lathe" ? Math.min(...p.shape.profile.map((q) => q.y)) : 0) >= 0);
        }
        assert.ok(settle(frame.values).bottom >= PLATE_TOP - 1e-9 && SLIDE === 30);
      }
    }
  });

  describe("free play: a block on a plank", () => {
    const play = grip.play!;
    const build = playBuild(grip);
    const handle = playHandle(grip);
    const [mu, tilt] = play.sliders! as [NonNullable<(typeof grip.sliders)[0]>, NonNullable<(typeof grip.sliders)[1]>];
    const at = (m: number, t: number) => ({ ...playValues(grip), mu: m, tilt: t });

    it("is its own rig: the grip slider shows, the handle lifts the plank, and no id clashes with the game's", () => {
      assert.deepEqual(
        playTuning(grip).map((s) => s.id),
        ["mu"],
      );
      assert.equal(playMotion(grip).id, "tilt");
      assert.deepEqual(mu.ends, ["Ice", "Rubber"]);
      assert.equal(play.label, "Lift");
      const game = new Set([...grip.sliders, ...(grip.game.poses ?? [])].map((s) => s.id));
      for (const id of ["mu", "tilt", "slid", "put"]) assert.ok(!game.has(id), id);
      assert.deepEqual(
        build(playValues(grip))
          .map((p) => p.id)
          .sort(),
        ["block", "handle", "hinge", "plank", "plate"],
      );
    });

    it("rests flat, with the block at its spot near the plank's free end", () => {
      const r = ramp(playValues(grip));
      assert.equal(r.tilt, 0);
      assert.equal(r.slid, 0);
      const plank = find(build(playValues(grip)), "plank");
      assert.ok(Math.abs(Math.min(...corners(plank).map((q) => q[1])) - PLATE_TOP) < 1e-9, "the flat plank lies on the plate");
    });

    it("holds the block still at every tilt up to the friction angle, and has it off on the plate just past it", () => {
      for (const m of steps(mu)) {
        const angle = slipAngle(m);
        assert.ok(Math.abs(Math.tan(angle * DEG_TO_RAD) - m) < 1e-12);
        const home = blockPose(ramp(at(m, 0)));
        for (const t of steps(tilt).filter((x) => x <= angle)) {
          const r = ramp(at(m, t));
          assert.equal(r.slid, 0, `μ ${m}, ${t}°`);
          assert.equal(r.slips, false);
          // Held, the block turns with the plank about the hinge and stays the same distance from it.
          const b = blockPose(r);
          assert.equal(b.angle, t);
          const hinge = find(build(at(m, t)), "hinge").position;
          assert.ok(Math.abs(Math.hypot(b.centre.x - hinge.x, b.centre.y - hinge.y) - Math.hypot(home.centre.x - hinge.x, home.centre.y - hinge.y)) < 1e-9);
        }
        const past = steps(tilt).find((x) => x > angle)!;
        assert.ok(ramp(at(m, past)).slid > 0, `μ ${m}: moving at ${past}°, the first step past ${angle.toFixed(1)}°`);
        const gone = steps(tilt).find((x) => x >= angle + 2)!;
        const r = ramp(at(m, gone));
        assert.equal(r.slid, 1, `μ ${m}: off by ${gone}°`);
        const block = find(build(at(m, gone)), "block");
        assert.ok(Math.abs(Math.min(...corners(block).map((q) => q[1])) - PLATE_TOP) < 1e-9, "landed flat on the plate");
        assert.equal(block.parentId, "plate");
      }
    });

    it("rests the block's underside on the plank's top while it is on it, never in it", () => {
      for (const m of [0.1, 0.5, 1]) {
        for (const t of steps(tilt).filter((_, i) => i % 4 === 0)) {
          const parts = build(at(m, t));
          const r = ramp(at(m, t));
          if (!r.onPlank) continue;
          const block = corners(find(parts, "block"));
          const plank = corners(find(parts, "plank"));
          const { depth, gap } = contact(block, plank, 0.5);
          assert.ok(depth < 1e-6 && gap < 1e-6, `μ ${m}, ${t}°: depth ${depth}, gap ${gap}`);
          // Underside on the top face: both lower corners on the line through the plank's top corners.
          const [a, b] = [plank[3]!, plank[2]!];
          for (const q of [block[0]!, block[1]!]) {
            const cross = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
            assert.ok(Math.abs(cross / Math.hypot(b[0] - a[0], b[1] - a[1])) < 1e-9, `μ ${m}, ${t}°: corner off the plank's top`);
          }
        }
      }
    });

    it("keeps the block clear of the plank, the hinge and the plate all the way off and back", () => {
      for (const t of steps(tilt).filter((_, i) => i % 4 === 0)) {
        for (let k = 0; k <= 40; k++) {
          for (const put of [0, 0.25, 0.5, 0.75]) {
            const parts = build({ ...at(0.5, t), slid: k / 40, put });
            const block = corners(find(parts, "block"));
            const where = `${t}°, slid ${k / 40}, put ${put}`;
            assert.ok(contact(block, corners(find(parts, "plank")), 0.5).depth < 1e-6, `${where}: into the plank`);
            assert.ok(contact(block, circle(find(parts, "hinge")), 0.5).depth < 1e-6, `${where}: into the hinge`);
            assert.ok(Math.min(...block.map((q) => q[1])) >= PLATE_TOP - 1e-9, `${where}: into the plate`);
          }
        }
      }
    });

    it("keeps the knob on the plank's end and solves the finger back to the tilt", () => {
      for (const t of steps(tilt)) {
        const v = at(0.5, t);
        assert.ok(Math.abs(handle.solve(handle.at(v), v) - t) < 1e-9, `${t}°`);
        const knob = find(build(v), "handle").position;
        const h = handle.at(v);
        assert.ok(Math.hypot(knob.x - h.x, knob.y - h.y, knob.z - h.z) < 1e-9);
      }
    });

    it("lets the hand only lift further once the block has started down", () => {
      const reach = handle.reach!;
      const angle = slipAngle(0.5);
      assert.deepEqual(reach(at(0.5, 10)), [0, 60]);
      assert.deepEqual(reach(at(0.5, angle + 0.5)), [angle + 0.5, 60]);
    });

    it("lets go: a held block rides the plank down flat; a slipped one finishes, lands, and is put back on its spot", () => {
      const rest = blockPose(ramp(playValues(grip)));
      for (const v of [at(0.5, 20), at(0.5, 26.6), at(0.5, 27), at(0.5, 40), at(0.1, 60), { ...at(0.5, 30), slid: 1, put: 0.4 }]) {
        const run = play.release!(v);
        const end = run.at(run.durationMs).values;
        assert.equal(end.tilt, 0);
        assert.equal(ramp(end).slid, 0);
        const b = blockPose(ramp(end));
        assert.ok(Math.hypot(b.centre.x - rest.centre.x, b.centre.y - rest.centre.y) < 1e-9, `ends at the block's spot from ${JSON.stringify(v)}`);
        assert.ok(run.durationMs <= 2000);
        let last = ramp(run.at(0).values);
        for (let ms = 16; ms <= run.durationMs; ms += 16) {
          const r = ramp(run.at(ms).values);
          assert.ok(r.tilt <= last.tilt + 1e-9, "the plank only falls");
          assert.ok(
            Math.abs(r.tilt - last.tilt) <= 0.2 * 60 && Math.abs(r.slid - last.slid) <= 0.2 && Math.abs(r.put - last.put) <= 0.2,
            `no jump at ${ms} ms`,
          );
          last = r;
        }
      }
      // Held below the friction angle, the block never moves on the plank as it falls.
      const held = play.release!(at(0.5, 20));
      for (let ms = 0; ms <= held.durationMs; ms += 16) assert.equal(ramp(held.at(ms).values).slid, 0);
      // Past it, the block reaches the plate before it is carried back.
      const slipped = play.release!(at(0.5, 27));
      assert.ok(Array.from({ length: 100 }, (_, i) => ramp(slipped.at((i / 99) * slipped.durationMs).values)).some((r) => r.slid === 1 && r.put === 0));
    });

    it("draws no graph", () => assert.equal(play.plot, undefined));

    describe("its goal: lift it to the green by hand without the block slipping", () => {
      const task = play.tasks![0]!;
      const watch = task.drive!;
      /** The hand lifting the plank from flat to `to` degrees in half-degree steps, the motor watching each. */
      const lift = (mu: number, to: number) => {
        let v: Values = { ...play.rest, mu };
        for (let t = 0; t <= to + 1e-9; t += 0.5) v = watch({ ...v, tilt: t }, 0, 16);
        return v;
      };

      it("is one goal, done by hand, with the grip slider; no button", () => {
        assert.equal(play.tasks!.length, 1);
        assert.equal(task.hand, true);
        assert.equal(task.action, undefined);
        assert.equal(task.met({ ...play.rest }), false, "free play's grip does not hold at the green");
        assert.ok(slipAngle(play.rest!.mu!) < TARGET);
      });

      it("is met once lifted to the green, exactly when the grip holds there", () => {
        for (const m of steps(play.sliders!.find((q) => q.id === "mu")!)) {
          const v = lift(m, TARGET);
          assert.equal(task.met(v), slipAngle(m) >= TARGET, `μ ${m}`);
        }
        assert.equal(task.met(lift(0.8, TARGET - 5)), false, "not short of the green");
      });

      it("stays met once the plank is let down, until the grip is turned down", () => {
        const v = { ...lift(0.8, TARGET), tilt: 0 };
        assert.ok(task.met(v));
        assert.equal(task.met({ ...v, mu: 0.5 }), false);
      });

      it("says the block slid only once it has, and only while the grip is too slick", () => {
        assert.equal(task.hint!({ ...play.rest }), undefined);
        const slid = lift(0.5, 33);
        assert.match(task.hint!(slid)!, /grip/);
        assert.equal(task.hint!({ ...slid, mu: 0.8 }), undefined);
      });

      it("hands back what it was given when there is nothing new to record", () => {
        const v = { ...play.rest, tilt: 5 };
        assert.equal(watch(v, 0, 16), v);
      });

      it("draws the green ghost plank at the target angle", () => {
        const parts = task.scene({});
        assert.ok(parts.length > 0 && parts.every((q) => q.rotation.z === TARGET));
      });
    });
  });
});
