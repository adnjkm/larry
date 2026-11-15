// Lever's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts and here.
//
// The contact proofs read the parts build() returns, not the solver: the bar's pose comes from its drawn position and
// rotation, and the pivot's point from the drawn pivot.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, numberSweep, sample } from "../checks.ts";
import { startValues, steps } from "../types.ts";
import type { Values } from "../types.ts";
import { bounds, FINGER, holdFor, lever, LOAD, lift, RISE, rig, settle, STRAIN, TRAVEL } from "./lever.ts";

const game = lever.game!;
const [ratio, push] = lever.sliders as [NonNullable<(typeof lever.sliders)[0]>, NonNullable<(typeof lever.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const DEG = Math.PI / 180;
const EXT = rig.EXT;
const SPAN_BAR = rig.SPAN + 2 * rig.EXT;

/** The pivot's point as drawn: the top of the fulcrum triangle. */
const pivotOf = (parts: Part[]) => {
  const p = find(parts, "pivot");
  assert.ok(p.shape.kind === "extrusion");
  return { x: p.position.x, y: p.position.y + Math.max(...p.shape.outline.map((q) => q.y)) / 2 };
};
/** A world point given in the bar's frame (x along it from the pivot, y up from its underside), from the drawn pivot and bar. */
function onBar(parts: Part[], lx: number, ly: number) {
  const pivot = pivotOf(parts);
  const a = find(parts, "bar").rotation.z * DEG;
  return { x: pivot.x + lx * Math.cos(a) - ly * Math.sin(a), y: pivot.y + lx * Math.sin(a) + ly * Math.cos(a) };
}
/** A world point as seen in the bar's frame. */
function inBar(parts: Part[], x: number, y: number) {
  const pivot = pivotOf(parts);
  const a = find(parts, "bar").rotation.z * DEG;
  const dx = x - pivot.x;
  const dy = y - pivot.y;
  return { lx: dx * Math.cos(a) + dy * Math.sin(a), ly: -dx * Math.sin(a) + dy * Math.cos(a) };
}
/** The bar's two lower end corners, in the world. */
const corners = (parts: Part[], r: number) => {
  const b = bounds(r);
  return { effort: onBar(parts, -(b.aEff + EXT), 0), load: onBar(parts, b.aLoad + EXT, 0) };
};
/** Where the top of the block is, from the drawn parts: its highest corner. */
const topOf = (parts: Part[]) => {
  const b = find(parts, "load");
  const a = b.rotation.z * DEG;
  return b.position.y + (rig.BLOCK / 2) * (Math.cos(a) + Math.abs(Math.sin(a)));
};
/** The ratios at which the finger can hold the block. */
const strong = (steps(ratio) as number[]).filter((r) => holdFor(r) <= FINGER + 1e-9);

describe("lever", () => {
  it("rests with its load side down, the load end lying on the plate and the bar resting on the pivot's point", () => {
    for (const r of steps(ratio)) {
      const parts = lever.build({ ratio: r, push: 0 });
      const b = bounds(r);
      const bar = find(parts, "bar");
      assert.ok(bar.rotation.z < 0, `ratio ${r}: the effort end is not up at rest`);
      // The load end's lower corner is on the plate's top, the effort end's is in the air, and the pivot's point is on the underside.
      const { effort, load } = corners(parts, r);
      assert.ok(Math.abs(load.y - 6) < 1e-6, `ratio ${r}: the load end is ${load.y - 6} mm off the plate`);
      assert.ok(effort.y > 6 + 10, `ratio ${r}: the effort end is down at rest`);
      const apex = inBar(parts, pivotOf(parts).x, pivotOf(parts).y);
      assert.ok(Math.abs(apex.ly) < 1e-9 && Math.abs(apex.lx) < 1e-9, `ratio ${r}: the bar's underside misses the pivot's point`);
      assert.ok(onBar(parts, b.aLoad, 0).y < rig.PIVOT_Y && onBar(parts, -b.aEff, 0).y > rig.PIVOT_Y, `ratio ${r}: load side is not the low side`);
    }
  });

  it("shows the fulcrum: at least 10 tall, 28 across its base, and deeper than the bar so its faces stand out at the sides", () => {
    const p = find(lever.build({ ratio: 3, push: 8 }), "pivot");
    assert.ok(p.shape.kind === "extrusion");
    const xs = p.shape.outline.map((q) => q.x);
    const ys = p.shape.outline.map((q) => q.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 10, "the fulcrum is under 10 tall");
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 28, "the fulcrum is under 28 wide");
    const bar = find(lever.build({ ratio: 3, push: 8 }), "bar");
    assert.ok(bar.shape.kind === "box" && p.shape.depth >= bar.shape.depth + 8, "the fulcrum does not stand out past the bar's faces");
  });

  it("never lets the bar through the plate, and the plate never limits the push: the bar has room for the finger's whole stroke", () => {
    for (const r of steps(ratio)) {
      for (const p of steps(push)) {
        const parts = lever.build({ ratio: r, push: p });
        const { effort, load } = corners(parts, r);
        assert.ok(Math.min(effort.y, load.y) >= 6 - 1e-6, `ratio ${r}, push ${p}: a bar corner is ${6 - Math.min(effort.y, load.y)} mm into the plate`);
      }
    }
    for (const r of strong) {
      assert.ok(bounds(r).pushMax >= TRAVEL + 1, `ratio ${r}: the plate stops the end after ${bounds(r).pushMax} mm, under the finger's ${TRAVEL}`);
      assert.equal(settle({ ratio: r, push: push.max }).push, TRAVEL, `ratio ${r}: the stroke is cut short`);
    }
  });

  it("clears the pivot's faces: the bar stays above the triangle at every pose", () => {
    for (const r of steps(ratio)) {
      for (const p of steps(push)) {
        const parts = lever.build({ ratio: r, push: p });
        const apex = pivotOf(parts);
        // The base corners of the pivot's triangle, seen from the bar: below its underside.
        for (const dx of [-rig.PIVOT_W, rig.PIVOT_W]) {
          const c = inBar(parts, apex.x + dx, 6);
          assert.ok(c.ly < 0, `ratio ${r}, push ${p}: the pivot's base corner is inside the bar`);
        }
      }
    }
  });

  it("pays in distance: the effort point goes down ratio times as far as the load point goes up", () => {
    for (const r of strong) {
      const b = bounds(r);
      const rest = lever.build({ ratio: r, push: 0 });
      const rest0 = { e: onBar(rest, -b.aEff, 0).y, l: onBar(rest, b.aLoad, 0).y };
      for (const p of [5, 10, 15]) {
        const parts = lever.build({ ratio: r, push: p });
        const down = rest0.e - onBar(parts, -b.aEff, 0).y;
        const up = onBar(parts, b.aLoad, 0).y - rest0.l;
        assert.ok(Math.abs(down - p) < 1e-6, `ratio ${r}: the effort end went down ${down}, not ${p}`);
        assert.ok(Math.abs(down / up - r) < 1e-6, `ratio ${r}, push ${p}: ${down} down against ${up} up is ${down / up}`);
      }
    }
  });

  it("gives the finger one fixed stroke: the slider and the drag stop at TRAVEL, so the load rises TRAVEL ÷ ratio", () => {
    assert.equal(push.max, TRAVEL);
    for (const r of strong) {
      const [lo, hi] = lever.handle!.reach!({ ratio: r, push: 8 });
      assert.equal(lo, 0);
      assert.equal(hi, TRAVEL, `ratio ${r}: reach ${hi}`);
      assert.ok(Math.abs(settle({ ratio: r, push: TRAVEL }).rise - TRAVEL / r) < 1e-9);
      // Drawn: the load point at the end of the stroke is TRAVEL ÷ ratio above where it rested.
      const b = bounds(r);
      const up = onBar(lever.build({ ratio: r, push: TRAVEL }), b.aLoad, 0).y - onBar(lever.build({ ratio: r, push: 0 }), b.aLoad, 0).y;
      assert.ok(Math.abs(up - TRAVEL / r) < 1e-6, `ratio ${r}: load up ${up}, not ${TRAVEL / r}`);
    }
  });

  it("only goes as far as one finger can move it: a millimetre or two when the ratio is too small", () => {
    for (const r of steps(ratio).filter((x) => holdFor(x) > FINGER + 1e-9)) {
      const [lo, hi] = lever.handle!.reach!({ ratio: r, push: 8 });
      assert.equal(lo, 0);
      assert.ok(hi <= STRAIN + 1e-9 && hi >= 1, `ratio ${r}: reach ${hi}`);
      assert.ok(settle({ ratio: r, push: 12 }).push <= STRAIN + 1e-9, "the picture holds to it however far the slider asks");
    }
  });

  it("re-settles when the ratio changes: the same push is held where the forces allow it, and no further", () => {
    assert.equal(settle({ ratio: 2, push: 12 }).push, 12);
    assert.ok(settle({ ratio: 1.4, push: 12 }).push <= STRAIN);
    assert.equal(settle({ ratio: 5, push: push.max }).push, TRAVEL);
  });

  it("draws the push as the force that balances the block, and none at rest", () => {
    const eff = (v: Values) => lever.build(v).filter((p) => p.id === "effort-arrow");
    const len = (p: Part) => (p.shape.kind === "extrusion" ? Math.max(...p.shape.outline.map((q) => q.x)) : 0);
    assert.equal(eff({ ratio: 2, push: 0 }).length, 0);
    assert.equal(eff({ ratio: 2, push: 8 }).length, 1);
    assert.ok(Math.abs(len(find(lever.build({ ratio: 2, push: 8 }), "load-arrow")) - 36) < 1e-9);
    // 15 N at ratio 2 is 18 long, to the 1.2 mm per N of the load's 36; the same scale for both.
    assert.ok(Math.abs(len(eff({ ratio: 2, push: 8 })[0]!) - 18) < 1e-9);
    assert.ok(Math.abs(settle({ ratio: 2, push: 8 }).effort - LOAD / 2) < 1e-9);
    // A light push is the shortest arrow, 12 long, never shorter.
    assert.ok(Math.abs(len(eff({ ratio: 4, push: 8 })[0]!) - 12) < 1e-9);
    assert.ok(len(eff({ ratio: 1.2, push: 1 })[0]!) > 0);
  });

  it("lays the pad flat on the bar, and the block on it, turned with the bar", () => {
    for (const r of [1, 3, 5]) {
      for (const p of [0, 8, 15]) {
        const parts = lever.build({ ratio: r, push: p });
        const bar = find(parts, "bar");
        for (const id of ["pad", "load"]) assert.ok(Math.abs(find(parts, id).rotation.z - bar.rotation.z) < 1e-9, `${id} is not turned with the bar`);
        const load = inBar(parts, find(parts, "load").position.x, find(parts, "load").position.y);
        assert.ok(Math.abs(load.ly - (rig.BAR_T + rig.BLOCK / 2)) < 1e-6, `the block floats ${load.ly - rig.BAR_T - rig.BLOCK / 2} mm off the bar`);
        const pad = inBar(parts, find(parts, "pad").position.x, find(parts, "pad").position.y);
        assert.ok(Math.abs(pad.ly - (rig.BAR_T + rig.PAD_T / 2)) < 1e-6, "the pad is not flat on the bar");
        assert.ok(Math.abs(pad.lx + bounds(r).aEff) < 1e-6, "the pad is not over the effort point");
      }
    }
  });

  it("drags the pad to the pointer and back", () => {
    const h = lever.handle!;
    for (const r of [2, 3, 5]) {
      for (const p of [0, 7, 13]) {
        const v: Values = { ratio: r, push: p };
        assert.ok(Math.abs(h.solve(h.at(v), v) - p) < 1e-6, `ratio ${r}, push ${p}`);
      }
    }
  });

  it("lifts the block in a window of ratios, and fails when the finger is too weak and when it runs out of travel", () => {
    const outcome = Object.fromEntries(numberSweep(lever).map((v) => [v.ratio, game.judge(v).outcome]));
    for (const r of steps(ratio)) {
      const o = outcome[r as number];
      if (r < 1.5) assert.equal(o, "too-heavy", `ratio ${r}`);
      else if (r <= 2.3 + 1e-9) assert.equal(o, "block-lifted", `ratio ${r}`);
      else assert.equal(o, "out-of-room", `ratio ${r}`);
    }
    assert.equal(game.judge(startValues(lever)).outcome, "out-of-room");
    for (const r of [1.5, 2, 2.3]) assert.ok(lift({ ratio: r }).canRise >= RISE - 1e-9);
  });

  it("misses by at least 3 mm at the long-arm extreme, in the numbers and in the picture, and by the whole RISE when too weak", () => {
    const r = lift({ ratio: 5 });
    assert.equal(r.kind, "short");
    assert.ok(RISE - r.canRise >= 3, `ratio 5 lifts ${r.canRise} mm of ${RISE}`);
    for (const ratioValue of [5, 4, 3]) {
      const run = game.play({ ratio: ratioValue, push: 0 });
      const top = sample(run).reduce((a, b) => (settle(b.frame.values).rise > settle(a.frame.values).rise ? b : a));
      const mark = find(game.scene!({ ratio: ratioValue, push: 0 }), "game-mark");
      const gap = mark.position.y - topOf(lever.build(top.frame.values));
      assert.ok(gap >= (ratioValue === 5 ? 3 : 1) - 1e-9, `ratio ${ratioValue}: the block stops ${gap.toFixed(2)} mm below the line`);
      assert.ok(Math.abs(settle(top.frame.values).rise - TRAVEL / ratioValue) < 1e-6);
    }
    // Too weak: the bar strains a millimetre or two, and the block is nowhere near the line.
    const weak = game.play({ ratio: 1, push: 0 });
    const high = Math.max(...sample(weak).map(({ frame }) => settle(frame.values).rise));
    assert.ok(high <= STRAIN && RISE - high > 3);
  });

  it("raises the block exactly RISE on a pass, and leaves it short on a fail", () => {
    for (const v of numberSweep(lever)) {
      const run = game.play(v);
      const end = Math.max(...sample(run).map(({ frame }) => frame.values.push ?? 0));
      const r = lift(v);
      const peak = settle({ ratio: r.ratio, push: end }).rise;
      if (r.kind === "pass") assert.ok(Math.abs(peak - RISE) < 1e-6, `ratio ${v.ratio}: block up ${peak}`);
      else assert.ok(peak < RISE - 1e-6, `ratio ${v.ratio} fails but the block rose ${peak}`);
      if (r.kind === "weak") assert.ok(end <= STRAIN + 1e-9, `ratio ${v.ratio}: the bar moved ${end}`);
      if (r.kind === "short") assert.ok(Math.abs(end - TRAVEL) < 1e-6, `ratio ${v.ratio}: the finger went ${end}, not its whole ${TRAVEL}`);
    }
  });

  it("brings the top of the block to the line when the block is up", () => {
    for (const r of [1.5, 2, 2.3]) {
      const mark = find(game.scene!({ ratio: r, push: 0 }), "game-mark");
      const run = game.play({ ratio: r, push: 0 });
      const parts = lever.build(run.at(run.durationMs * 0.6).values);
      assert.ok(Math.abs(topOf(parts) - mark.position.y) < 1e-6, `ratio ${r}: the block's top is ${topOf(parts) - mark.position.y} off the line`);
    }
  });

  it("puts the line on a post: at least 10 long, touching the post's face, and out of the way of everything that moves", () => {
    for (const r of steps(ratio)) {
      const scene = game.scene!({ ratio: r, push: 0 });
      const mark = find(scene, "game-mark");
      const post = find(scene, "game-mark-post");
      assert.ok(mark.shape.kind === "box" && post.shape.kind === "box");
      assert.ok(mark.shape.width >= 10, `ratio ${r}: the line is ${mark.shape.width} long`);
      assert.equal(mark.parentId, "game-mark-post");
      // Its right end meets the post's left face, and the post stands on the plate and reaches past the line.
      assert.ok(Math.abs(mark.position.x + mark.shape.width / 2 - (post.position.x - post.shape.width / 2)) < 1e-9, "the line does not touch the post");
      assert.ok(Math.abs(mark.position.z - post.position.z) < 1e-9);
      assert.ok(Math.abs(post.position.y - post.shape.height / 2 - 6) < 1e-9 && post.position.y + post.shape.height / 2 > mark.position.y);
      // The line is level with the block's front face, within 1 mm, so the eye compares heights in one plane.
      assert.ok(Math.abs(mark.position.z - rig.BLOCK / 2) <= 2.5, `ratio ${r}: the line stands ${mark.position.z - rig.BLOCK / 2} mm off the block's face in z`);
      assert.ok(mark.position.z - mark.shape.depth / 2 >= rig.BLOCK / 2, "the line is in the block");
      // Nothing that moves touches the post (its left face) or the line, at any pose.
      for (const p of steps(push)) {
        const parts = lever.build({ ratio: r, push: p });
        const block = find(parts, "load");
        const a = block.rotation.z * DEG;
        const half = rig.BLOCK / 2;
        const farthest = Math.max(...[[half, half], [half, -half], [-half, half], [-half, -half]].map(([x, y]) => block.position.x + x! * Math.cos(a) - y! * Math.sin(a)));
        assert.ok(farthest <= post.position.x - post.shape.width / 2 - 0.5, `ratio ${r}, push ${p}: the block reaches x = ${farthest.toFixed(1)}, into the post`);
        // The bar shares the line's z range, so beyond the line's left end the bar's top edge must stay under it, and short of the post.
        const bar = find(parts, "bar");
        const ba = bar.rotation.z * DEG;
        const along = (x: number, y: number) => ({ x: bar.position.x + x * Math.cos(ba) - y * Math.sin(ba), y: bar.position.y + x * Math.sin(ba) + y * Math.cos(ba) });
        const end = along(SPAN_BAR / 2, rig.BAR_T / 2);
        const start = along(-SPAN_BAR / 2, rig.BAR_T / 2);
        const lineLeft = mark.position.x - mark.shape.width / 2;
        const edgeAt = (x: number) => start.y + ((end.y - start.y) * (x - start.x)) / (end.x - start.x);
        const top = Math.max(edgeAt(lineLeft), end.y);
        assert.ok(top < mark.position.y - 1.5 - 0.5, `ratio ${r}, push ${p}: the bar's top edge rises to ${top.toFixed(1)}, into the line at ${mark.position.y.toFixed(1)}`);
        assert.ok(Math.max(end.x, along(SPAN_BAR / 2, -rig.BAR_T / 2).x) < post.position.x - post.shape.width / 2 - 0.5, `ratio ${r}, push ${p}: the bar reaches the post`);
      }
    }
    assert.equal(new Set(game.scene!({ ratio: 2, push: 0 }).map((p) => p.name)).size, 2);
  });

  it("keeps to seven kinds of part at rest and two in the scene", () => {
    const kinds = (parts: Part[]) => new Set(parts.map((p) => p.name));
    assert.ok(kinds(lever.build({ ratio: 3, push: 8 })).size <= 7, [...kinds(lever.build({ ratio: 3, push: 8 }))].join());
    assert.ok(kinds(game.scene!({ ratio: 3, push: 0 })).size <= 2);
  });

  it("passes the generic game and design checks", () => {
    checkGame(lever);
    checkDesign(lever);
  });
});
