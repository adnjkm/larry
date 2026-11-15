// Gear's own tests. The generic game and design checks (checks.ts) also run for it in library.test.ts.
//
// The mesh proof does not reuse the layout code: it takes the gear parts build() returns, places their outlines in the
// world as the renderer does (outline centred on its bounding box, turned about z, moved to the part's position), and
// measures how far any point of one outline lies inside another's, and how far apart two outlines are.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { look } from "../parts.ts";
import { checkDesign, checkGame, numberSweep, sample, steps } from "../checks.ts";
import type { Values } from "../types.ts";
import { DRIVER_TEETH, gear, GHOST, rig, settle, shadow, TOLERANCE } from "./gear.ts";

type Pt = [number, number];
const game = gear.game!;
const ratio = gear.sliders[0]!;
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);

function world(part: Part): Pt[] {
  assert.ok(part.shape.kind === "extrusion");
  const xs = part.shape.outline.map((q) => q.x);
  const ys = part.shape.outline.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const a = (part.rotation.z * Math.PI) / 180;
  return part.shape.outline.map(({ x, y }): Pt => [part.position.x + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), part.position.y + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
}
function insidePoly(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function edgeDistance(p: Pt, poly: Pt[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]!;
    const [bx, by] = poly[i]!;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
    d = Math.min(d, Math.hypot(p[0] - ax - t * (bx - ax), p[1] - ay - t * (by - ay)));
  }
  return d;
}
function along(poly: Pt[], spacing: number): Pt[] {
  return poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
    return Array.from({ length: k }, (_, s): Pt => [a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
  });
}
/** Deepest point of either outline inside the other, and the smallest gap between them when apart. */
function contact(a: Pt[], b: Pt[]): { depth: number; gap: number } {
  let depth = 0;
  let gap = Infinity;
  for (const [p, q] of [[a, b], [b, a]] as const) {
    for (const pt of along(p, 0.5)) {
      const d = edgeDistance(pt, q);
      if (insidePoly(pt, q)) depth = Math.max(depth, d);
      else gap = Math.min(gap, d);
    }
  }
  return { depth, gap };
}
const gears = (v: Values) => {
  const parts = gear.build(v);
  return { driver: world(find(parts, "gear-driver")), driven: world(find(parts, "gear-driven")), parts };
};
const TURNS = [0, 0.013, 0.171, 0.333, 0.62, 0.9];

describe("gear", () => {
  it("passes the generic game and design checks", () => {
    checkGame(gear);
    checkDesign(gear);
  });

  it("keeps to the simple-first budget: two gears, one arrow, no idler, every gear pink", () => {
    const v = { ratio: 1.5, turn: 0.1 };
    const parts = gear.build(v);
    const kinds = new Set(parts.map((p) => p.name));
    assert.ok(kinds.size <= 7, [...kinds].join(", "));
    // Two posts and two axles hold two gears: nothing else is black but the plate and the turn mark.
    assert.equal(parts.filter((p) => p.name === "Gear").length, 2);
    assert.ok(parts.filter((p) => p.name === "Gear").every((p) => p.color === look.focus.color), "both gears are pink");
    assert.equal(parts.filter((p) => p.name === "Post").length, 2);
    assert.equal(parts.filter((p) => /arrow/.test(p.id)).length, 1, "one direction arrow");
    assert.ok(find(parts, "arrow-driven"));
    assert.ok(!parts.some((p) => /idler/.test(p.id)), "no idler in the rig");
    assert.equal(game.controls, undefined, "the game has no control but the tooth ratio");
    assert.equal(game.scene!(v).length, 1);
    // The game's one cause is the ratio: it starts failing, and no start value sets anything else.
    assert.equal(game.number, "ratio");
    assert.ok(!game.judge({ ...game.start!, ratio: 2 }).pass);
  });

  it("keeps the black posts lighter than the pink gears", () => {
    const area = (p: Part) => {
      const o = world(p);
      return o.reduce((a, [x, y], i) => a + (x * o[(i + 1) % o.length]![1] - o[(i + 1) % o.length]![0] * y), 0) / 2;
    };
    for (const r of steps(ratio)) {
      const parts = gear.build({ ratio: r, turn: 0.1 });
      const pink = parts.filter((p) => p.name === "Gear").reduce((a, p) => a + Math.abs(area(p)), 0);
      const black = parts.filter((p) => p.name === "Post").reduce((a, p) => a + (p.shape.kind === "box" ? p.shape.width * p.shape.height : 0), 0);
      assert.ok(black < pink, `ratio ${r.toFixed(2)}: posts cover ${black.toFixed(0)}, gears ${pink.toFixed(0)}`);
    }
  });

  it("keeps the teeth meshed at every angle and tooth count: no tooth cuts into another, and they touch", () => {
    for (const r of steps(ratio)) {
      for (const turn of TURNS) {
        const { driver, driven } = gears({ ratio: r, turn, idler: 0 });
        const { depth, gap } = contact(driver, driven);
        assert.ok(depth <= 0.05, `ratio ${r.toFixed(2)}, turn ${turn}: the gears overlap by ${depth.toFixed(3)} mm`);
        assert.ok(gap <= 1.2, `ratio ${r.toFixed(2)}, turn ${turn}: the gears are ${gap.toFixed(2)} mm apart, not meshed`);
      }
    }
  });

  it("turns the output by the tooth ratio, the other way round", () => {
    for (const r of steps(ratio)) {
      const z2 = settle({ ratio: r }).z2;
      const a = settle({ ratio: r, turn: 0.2 });
      const b = settle({ ratio: r, turn: 0.7 });
      const want = (-DRIVER_TEETH * (b.theta1 - a.theta1)) / z2;
      assert.ok(Math.abs(b.theta2 - a.theta2 - want) < 1e-9, `ratio ${r.toFixed(2)}: output turned ${b.theta2 - a.theta2}, wanted ${want}`);
    }
  });

  it("puts the knob at the handle and solves a drag back", () => {
    for (const turn of [0, 0.3, 0.8]) {
      const v = { ratio: 1.5, turn };
      const parts = gear.build(v);
      const k = find(parts, "knob").position;
      const h = gear.handle!.at(v);
      assert.ok(Math.hypot(k.x - h.x, k.y - h.y, k.z - h.z) < 1e-9);
      const solved = gear.handle!.solve(h, v);
      assert.ok(Math.abs(solved - turn) < 1e-6, `drag solves to ${solved}, not ${turn}`);
    }
  });

  it("reads its numbers from the pose it draws", () => {
    const s = settle({ ratio: 1.5, turn: 0.1 });
    assert.match(gear.readouts({ ratio: 1.5, turn: 0.1 })[0]!.value, /12 ÷ 18 = 0\.67/);
    assert.match(gear.readouts({ ratio: 1.5, turn: 0.1 })[1]!.value, /driver 36°, output 24° the other way/);
    assert.equal(s.z2, 18);
  });

  it("passes for 15 to 17 teeth, too fast below and too slow above: both failures come from the one ratio", () => {
    const outcomes = Object.fromEntries(numberSweep(gear).map((v) => [settle(v).z2, game.judge(v).outcome]));
    for (let z = 8; z <= 14; z++) assert.equal(outcomes[z], "too-fast", `${z} teeth`);
    for (const z of [15, 16, 17]) assert.equal(outcomes[z], "on-the-ghost");
    for (let z = 18; z <= 24; z++) assert.equal(outcomes[z], "too-slow", `${z} teeth`);
    for (const v of numberSweep(gear)) assert.ok(v.idler === undefined, "the sweep sets nothing but the ratio");
  });

  it("keeps the output's mark on the ghost on a pass, and drifts off it otherwise", () => {
    const hand = (v: Values) => settle(v).hand;
    const ghostAt = (v: Values, turn: number) => hand({ ...v, turn: 0 }) - GHOST * 360 * turn;
    for (const r of steps(ratio)) {
      const v = { ratio: r, turn: 0 };
      assert.ok(Math.abs(hand(v) - ghostAt(v, 0)) < 1e-9, "mark and ghost start together");
      const drift = Math.abs(hand({ ...v, turn: 1 }) - ghostAt(v, 1));
      const kind = shadow(v).kind;
      assert.equal(drift <= TOLERANCE + 1e-9, kind === "pass", `ratio ${r}: drifts ${drift}°, ${kind}`);
      // The drift is the very number the meters show.
      const [ahead, behind] = game.meters(v);
      assert.ok(Math.abs(Math.max(ahead.value, behind.value) - Math.min(120, drift)) < 1e-9, `ratio ${r}: meters differ from the drawn drift`);
    }
  });

  it("draws the ghost as a real arrow on the output's axle, turning the way the output turns", () => {
    for (const r of [8 / 12, 1, 16 / 12, 2]) {
      for (const turn of [0, 0.4, 1]) {
        const v = { ratio: r, turn };
        const g = find(game.scene!(v), "game-ghost-arrow");
        const want = settle({ ...v, turn: 0 }).hand - GHOST * 360 * turn;
        const k = (((g.rotation.z - want) % 360) + 540) % 360 - 180;
        assert.ok(Math.abs(k) < 1e-6, `ratio ${r}, turn ${turn}: ghost at ${g.rotation.z}, wanted ${want}`);
        assert.equal(g.parentId, "pin-2");
      }
    }
  });

  it("runs one driver turn from the start, and ends with the driver at a full turn", () => {
    for (const v of numberSweep(gear)) {
      const run = game.play(v);
      const turns = sample(run).map(({ frame }) => frame.values.turn ?? 0);
      assert.equal(Math.max(...turns), 1);
      assert.equal(run.at(run.durationMs).values.turn, 1);
    }
    assert.ok(rig.AXLE_Y > 0);
  });
});
