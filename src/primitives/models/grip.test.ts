// Grip's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../../shared/kit.ts";
import { checkGame, sample, startOf, steps } from "../checks.ts";
import { PLATE_TOP } from "../parts.ts";
import { CRACK, geometry, grip, hold, LOAD_END, MU, settle, SLIDE } from "./grip.ts";

const game = grip.game!;
const [squeeze, load] = grip.sliders as [NonNullable<(typeof grip.sliders)[0]>, NonNullable<(typeof grip.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const length = (p: Part) => {
  assert.ok(p.shape.kind === "extrusion");
  return Math.max(...p.shape.outline.map((o) => o.x));
};

describe("grip", () => {
  it("passes the generic game checks", () => checkGame(grip));

  it("is six kinds of part at rest", () => {
    assert.deepEqual(grip.build({ squeeze: 40, load: 20 }).map((p) => p.id).sort(), ["handle", "limit-arrow", "load-arrow", "pad-left", "pad-right", "plate", "rod"]);
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
    const pass = steps(squeeze).filter((n) => game.judge({ ...startOf(grip), squeeze: n }).pass);
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
    assert.ok(Math.abs(find(end, "rod").position.y - (geometry.HELD_BOTTOM + geometry.CHIP + (geometry.ROD_LEN - geometry.CHIP) / 2)) < 1e-9, "the rest stays held");
  });

  it("keeps the handle on the thumb disc and solves back to the squeeze", () => {
    for (const n of steps(squeeze)) {
      const v = { squeeze: n, load: 20 };
      assert.ok(Math.abs(grip.handle!.solve(grip.handle!.at(v), v) - n) < 1e-9);
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
});
