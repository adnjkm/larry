// Thread's own tests. The generic game and design checks (checks.ts) also run for it in library.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../../shared/kit.ts";
import { checkDesign, checkGame, numberSweep, sample, steps } from "../checks.ts";
import { FRICTION_DEG, geometry, HAND_R, jack, MEAN_R, PITCH_UNIT, ridgeWire, settle, TARGET, thread } from "./thread.ts";

const game = thread.game!;
const pitch = thread.sliders[0]!;
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);

describe("thread", () => {
  it("passes the generic game and design checks", () => {
    checkGame(thread);
    checkDesign(thread);
  });

  it("keeps to the simple-first budget: seven kinds of part at rest, one more in the game", () => {
    const kinds = new Set(thread.build({ pitch: 4, turns: 2.5 }).map((p) => p.id.replace(/-arrow$/, "arrow")));
    assert.ok(kinds.size <= 9, [...kinds].join(", "));
    assert.equal(kinds.size, 7);
    assert.equal(game.scene!({}).length, 1);
  });

  it("climbs exactly one pitch per turn, whatever the pitch, and rests on the plate at turn 0", () => {
    for (const p of steps(pitch)) {
      const at = (t: number) => find(thread.build({ pitch: p, turns: t }), "nut").position.y;
      for (const t of [0, 1, 2.5, 4]) assert.ok(Math.abs(at(t + 1) - at(t) - p * PITCH_UNIT) < 1e-9, `pitch ${p}, turn ${t}`);
      assert.ok(Math.abs(at(0) - geometry.nutMid(0)) < 1e-9 && Math.abs(at(0) - 12) < 1e-9, "the nut sits on the plate at turn 0");
    }
  });

  it("draws the ridge at the pitch it climbs by: the spacing is the drawn pitch, the wire thickens with it, and it is at least 2.4 thick with air between turns at every pitch", () => {
    for (const p of steps(pitch)) {
      const h = find(thread.build({ pitch: p, turns: 1 }), "ridge");
      assert.ok(h.shape.kind === "helix");
      const spacing = (h.shape.length - 2 * h.shape.tube) / h.shape.turns;
      assert.ok(Math.abs(spacing - p * PITCH_UNIT) < 1e-9, `pitch ${p}`);
      assert.ok(Math.abs(h.shape.radius - MEAN_R) < 1e-9);
      assert.ok(2 * h.shape.tube >= 2.4 - 1e-9, `pitch ${p}: the ridge wire is ${2 * h.shape.tube} thick`);
      assert.ok(spacing - 2 * h.shape.tube >= 1.5, `pitch ${p}: only ${(spacing - 2 * h.shape.tube).toFixed(2)} mm between turns, so it would read as stripes`);
      // The slider shows the drawn pitch.
      assert.equal(p * (pitch.displayScale ?? 1), spacing);
    }
    assert.ok(ridgeWire(12) > ridgeWire(6));
  });

  it("turns the handle bar with the nut: one turn is once round the bolt, the bar at the handle and inside the nut's height", () => {
    for (const t of [0, 0.3, 1.25, 4.9]) {
      const parts = thread.build({ pitch: 4, turns: t });
      const bar = find(parts, "handle").position;
      const h = thread.handle!.at({ pitch: 4, turns: t });
      assert.ok(Math.hypot(bar.x - h.x, bar.y - h.y, bar.z - h.z) < 1e-9);
      assert.ok(Math.abs(Math.hypot(bar.x, bar.z) - HAND_R) < 1e-9, "the bar goes round on its circle");
      const nut = find(parts, "nut").position;
      assert.ok(Math.abs(bar.y - nut.y) < 1e-9);
      assert.ok(Math.abs(find(parts, "handle").rotation.y - geometry.handleAngle(t)) < 1e-9);
    }
    const bottom = find(thread.build({ pitch: 4, turns: 0 }), "handle").position.y - 5.5;
    assert.ok(bottom >= 6, "the bar clears the plate at turn 0");
  });

  it("solves the drag back to the turn it came from, near the current one", () => {
    const h = thread.handle!;
    for (const t of [0.4, 1.6, 2.5, 3.1, 5.7]) {
      const v = { pitch: 4, turns: t };
      const solved = h.solve(h.at(v), v);
      const turnsApart = Math.abs(solved - t);
      assert.ok(turnsApart < 1e-6 || Math.abs(turnsApart - Math.round(turnsApart)) < 1e-6 || turnsApart < 0.6, `turn ${t} solves to ${solved}`);
    }
  });

  it("reads its numbers from the pose it draws", () => {
    for (const p of [2, 4, 6]) {
      const v = { pitch: p, turns: 3 };
      const s = settle(v);
      assert.equal(s.rise, 3 * p * PITCH_UNIT);
      assert.match(thread.readouts(v)[0]!.value, new RegExp(`= ${s.rise.toFixed(1)} mm`));
      const lead = (Math.atan((p * PITCH_UNIT) / (2 * Math.PI * MEAN_R)) * 180) / Math.PI;
      assert.match(thread.readouts(v)[2]!.value, new RegExp(lead.toFixed(1).replace(".", "\\.")));
      assert.equal(thread.readouts(v)[2]!.value.includes("holds"), lead <= FRICTION_DEG);
    }
  });

  it("holds for pitches 3 to 4 only: finer runs out of turns, steeper spins back", () => {
    const outcomes = Object.fromEntries(numberSweep(thread).map((v) => [v.pitch, game.judge(v).outcome]));
    for (const p of [2, 2.5]) assert.equal(outcomes[p], "ran-out-of-turns");
    for (const p of [3, 3.5, 4]) assert.equal(outcomes[p], "held-at-mark");
    for (const p of [4.5, 5, 5.5, 6]) assert.equal(outcomes[p], "spun-back");
    assert.ok(jack({ pitch: 4 }).lead <= FRICTION_DEG && jack({ pitch: 4.5 }).lead > FRICTION_DEG);
    assert.ok(jack({ pitch: 2.5 }).reach < TARGET && jack({ pitch: 3 }).reach >= TARGET);
  });

  it("brings the weight to the mark and no further, and the weight always rests on the nut", () => {
    for (const v of numberSweep(thread)) {
      const run = game.play(v);
      let highest = 0;
      for (const { ms, frame } of sample(run)) {
        const parts = [...thread.build(frame.values), ...game.scene!(frame.values)];
        const cube = find(parts, "load");
        assert.ok(cube.shape.kind === "box");
        const top = cube.position.y + cube.shape.height / 2;
        const nut = find(parts, "nut");
        assert.ok(Math.abs(cube.position.y - cube.shape.height / 2 - (nut.position.y + 6)) < 1e-9, `the weight rests on the nut at ${ms} ms`);
        assert.ok(top <= geometry.MARK_Y + 1e-6, `pitch ${v.pitch}: the weight rises past the mark at ${ms} ms`);
        highest = Math.max(highest, top);
      }
      if (run.verdict.outcome === "held-at-mark") assert.ok(Math.abs(highest - geometry.MARK_Y) < 1e-6, `pitch ${v.pitch} reaches the mark`);
      else if (run.verdict.outcome === "ran-out-of-turns") assert.ok(highest < geometry.MARK_Y - 0.9, "short of the mark");
    }
  });

  it("ends a pass at the mark, a spin-back on the plate and a short run with every turn used", () => {
    const rest = (v: { pitch: number; turns: number }) => {
      const run = game.play(v);
      return run.at(run.durationMs).values.turns ?? NaN;
    };
    assert.ok(Math.abs(rest({ pitch: 4, turns: 0 }) - TARGET / (4 * PITCH_UNIT)) < 1e-9);
    assert.equal(rest({ pitch: 6, turns: 0 }), 0);
    assert.ok(Math.abs(rest({ pitch: 2, turns: 0 }) - 6) < 1e-9);
  });

  it("holds the target tick on a slim post outside the handle's sweep: at least 10 long, level with the weight's top at the mark, clear of the weight", () => {
    const mark = find(game.scene!({}), "game-mark");
    assert.equal(mark.parentId, "plate");
    assert.ok(mark.shape.kind === "extrusion");
    const xs = mark.shape.outline.map((o) => mark.position.x + o.x);
    const ys = mark.shape.outline.map((o) => mark.position.y + o.y);
    const tipX = Math.min(...xs);
    const postLeft = geometry.POST_X - geometry.POST_W / 2;
    assert.ok(postLeft - tipX >= 10, `the tick is ${postLeft - tipX} long`);
    assert.ok(Math.abs(tipX - (geometry.EDGE / 2 + 2)) < 1e-9, "stops 2 mm short of the weight");
    assert.ok(Math.abs(Math.max(...ys) - geometry.MARK_Y) < 1e-9, "its top is the mark level");
    assert.ok(Math.abs(Math.min(...ys) - 6) < 1e-9, "the post stands on the plate");
    // The handle bar reaches out to HAND_R + 10 from the bolt; the post stands outside that.
    assert.ok(postLeft > HAND_R + 10, "the post is outside the handle's sweep");
  });

  it("only lets the drag go as far as the mark", () => {
    assert.deepEqual(thread.handle!.reach!({ pitch: 4, turns: 0 }), [0, 4]);
    assert.deepEqual(thread.handle!.reach!({ pitch: 2, turns: 0 }), [0, 6]);
  });
});
