// Piston's own tests. The generic game and design checks (checks.ts) run here, in its own file, so node runs the models in parallel.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, find, sample } from "../checks.ts";
import { startValues, steps } from "../types.ts";
import { PLATE_TOP } from "../parts.ts";
import { AIR, downFor, geometry, HAND, MARK, piston, settle, stop, TOLERANCE } from "./piston.ts";

const game = piston.game;
const [area, force] = piston.sliders as [NonNullable<(typeof piston.sliders)[0]>, NonNullable<(typeof piston.sliders)[1]>];
const dots = (parts: Part[]) => parts.filter((p) => p.id.startsWith("air-"));
const arrowLen = (p: Part) => (p.shape.kind === "extrusion" ? Math.max(...p.shape.outline.map((o) => o.x)) : 0);

describe("piston", () => {
  it("passes the generic game checks", () => checkGame(piston));
  it("follows the design language", () => checkDesign(piston));

  it("balances the push against the air at every setting: p × A = F, and Boyle's law holds", () => {
    for (const a of steps(area)) {
      for (const f of steps(force)) {
        const s = settle({ area: a, force: f });
        assert.ok(Math.abs((s.gauge * s.mm2) / 1000 - f) < 1e-9, `A ${a}, F ${f}`);
        assert.ok(Math.abs(geometry.P0 * AIR - (geometry.P0 + s.gauge) * s.air) < 1e-9, `Boyle at A ${a}, F ${f}`);
      }
    }
  });

  it("draws the tube as wide as the area says and the head exactly filling it", () => {
    for (const a of steps(area)) {
      const parts = piston.build({ area: a, force: 50 });
      const head = find(parts, "head");
      assert.ok(head.shape.kind === "box");
      assert.ok(Math.abs(head.shape.width * geometry.Z - a * 100) < 1e-9, "inner width × depth is the area");
      const tube = find(parts, "tube");
      assert.ok(tube.shape.kind === "extrusion");
      const xs = tube.shape.outline.map((o) => o.x);
      assert.ok(Math.abs(Math.max(...xs) - head.shape.width / 2 - geometry.WALL) < 1e-9, "walls touch the head");
    }
  });

  it("keeps the head on the air, the rod on the head and the handle on the rod, with the dots between floor and head", () => {
    for (const a of [4, 8, 12]) {
      for (const f of [0, 30, 80, 100]) {
        const parts = piston.build({ area: a, force: f });
        const s = settle({ area: a, force: f });
        const head = find(parts, "head");
        const rod = find(parts, "rod");
        const handle = find(parts, "handle");
        assert.ok(Math.abs(head.position.y - HEADT / 2 - s.headBottom) < 1e-9);
        assert.ok(rod.shape.kind === "lathe");
        assert.ok(Math.abs(rod.position.y - geometry.ROD_LEN / 2 - (head.position.y + HEADT / 2)) < 1e-9, "rod stands on the head");
        assert.ok(Math.abs(handle.position.y - 2 - (rod.position.y + geometry.ROD_LEN / 2)) < 1e-9, "handle rests on the rod");
        const d = dots(parts);
        assert.equal(d.length, geometry.DOT_ROWS * geometry.DOT_COLS, "the same dots at every pose");
        const lo = Math.min(...d.map((p) => p.position.y)) - geometry.DOT_R;
        const hi = Math.max(...d.map((p) => p.position.y)) + geometry.DOT_R;
        assert.ok(lo >= geometry.FLOOR_TOP - 1e-9, `dots through the floor at A ${a}, F ${f}`);
        assert.ok(hi <= s.headBottom + 1e-9, `dots through the head at A ${a}, F ${f}`);
        // No two dots overlap.
        for (const p of d)
          for (const q of d)
            if (p !== q)
              assert.ok(Math.hypot(p.position.x - q.position.x, p.position.y - q.position.y) >= 2 * geometry.DOT_R - 1e-9, `dots overlap at A ${a}, F ${f}`);
      }
    }
  });

  it("crowds the same dots closer as the air shrinks", () => {
    const spread = (f: number) => {
      const d = dots(piston.build({ area: 6, force: f })).map((p) => p.position.y);
      return Math.max(...d) - Math.min(...d);
    };
    assert.ok(spread(0) > spread(40) && spread(40) > spread(100));
  });

  it("stops a drag where the hand's push balances the air, whatever the area", () => {
    const h = piston.handle;
    for (const a of [4, 8, 12]) {
      const v = { area: a, force: 20 };
      assert.deepEqual(h.reach!(v), [0, HAND]);
      assert.ok(Math.abs(h.solve(h.at(v), v) - 20) < 1e-9, "solve undoes at");
      // Dragging to the lowest the hand can go lands exactly at the reach's top.
      const low = h.at({ area: a, force: HAND });
      assert.ok(Math.abs(h.solve(low, v) - HAND) < 1e-9);
    }
  });

  it("is on the line only for a middle area: wide stops short, narrow goes past", () => {
    const pass = steps(area).filter((a) => game.judge({ ...startValues(piston), area: a }).pass);
    assert.ok(pass.length >= 5, `window ${pass}`);
    for (const a of pass) assert.ok(Math.abs(downFor(HAND, a) - MARK) <= TOLERANCE + 1e-9);
    assert.equal(game.judge({ area: 12, force: 0 }).outcome, "stopped-short");
    assert.equal(game.judge({ area: 4, force: 0 }).outcome, "went-past");
    assert.equal(stop({ area: 8 }).kind, "pass");
  });

  it("draws the line at the head's underside height when the plunger is on it", () => {
    for (const a of steps(area).filter((x) => game.judge({ area: x, force: 0 }).pass)) {
      const line = find(game.scene!({ area: a }), "game-line");
      const bottom = settle({ area: a, force: HAND }).headBottom;
      assert.ok(Math.abs(line.position.y - bottom) <= TOLERANCE + 1e-9, `A ${a}`);
      assert.ok(line.position.x < -settle({ area: a }).wi / 2 - geometry.WALL, "outside the wall, in the open");
    }
  });

  it("pushes down, stops, then springs back to where it started, in every run", () => {
    for (const a of [4, 8, 12]) {
      const run = game.play({ area: a, force: 0 });
      const ys = sample(run).map(({ frame }) => settle(frame.values).headBottom);
      assert.ok(Math.abs(ys[0]! - (geometry.FLOOR_TOP + AIR)) < 1e-9);
      assert.ok(Math.abs(Math.min(...ys) - settle({ area: a, force: HAND }).headBottom) < 1e-9, "reaches where 80 N balances the air");
      assert.ok(Math.abs(ys.at(-1)! - ys[0]!) < 1e-9, "springs back");
      assert.ok(Math.min(...ys) > PLATE_TOP + geometry.FLOOR, "never through the floor");
      for (const { frame } of sample(run)) {
        const parts = piston.build(frame.values);
        const arrows = parts.filter((p) => p.id === "push-arrow");
        const f = frame.values.force ?? 0;
        assert.equal(arrows.length, f > 0 ? 1 : 0);
        if (f > 0) assert.ok(Math.abs(arrowLen(arrows[0]!) - Math.max(12, (40 * f) / 100)) < 1e-9);
      }
    }
  });
});

const HEADT = geometry.HEAD_T;
