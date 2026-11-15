// Cam's own tests. The generic game and design checks (checks.ts) also run for it in library.test.ts.
//
// The contact proof does not reuse the solver: it takes the cam and follower parts build() returns, places their outlines
// in the world as the renderer does (outline centred on its bounding box, turned about z, moved to the part's position),
// and measures how far the cam's rim reaches above the follower's foot.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, find, numberSweep, sample, worldOutline } from "../checks.ts";
import { steps, type Values } from "../types.ts";
import { COLOR } from "../parts.ts";
import { beat, cam, geometry, JAM_RISE, LIMIT, rampAngle, rise, STRIKE } from "./cam.ts";
import { DEG_TO_RAD, RAD_TO_DEG } from "../../angles.ts";

type Pt = [number, number];
const game = cam.game;
const lift = cam.sliders[0]!;

/** The follower's foot bottom, and the highest the rim reaches within the foot's width (edges included). */
function foot(parts: Part[]): { bottom: number; rim: number } {
  const rod = find(parts, "follower");
  assert.ok(rod.shape.kind === "extrusion");
  const bottom = rod.position.y - FOOT_TOTAL / 2;
  const o = worldOutline(find(parts, "cam"));
  const W = geometry.FOOT_W / 2;
  let rim = -Infinity;
  for (let i = 0; i < o.length; i++) {
    const p = o[i]!;
    const q = o[(i + 1) % o.length]!;
    if (Math.abs(p[0]) <= W) rim = Math.max(rim, p[1]);
    for (const e of [-W, W]) if ((p[0] - e) * (q[0] - e) < 0) rim = Math.max(rim, p[1] + ((q[1] - p[1]) * (e - p[0])) / (q[0] - p[0]));
  }
  return { bottom, rim };
}
const FOOT_TOTAL = geometry.ROD_L;
const TURNS = Array.from({ length: 41 }, (_, i) => i / 40);

describe("cam", () => {
  it("passes the generic game and design checks", () => {
    checkGame(cam);
    checkDesign(cam);
  });

  it("keeps to the simple-first budget: five kinds of part at rest, two in the game, and no control but the lift", () => {
    const kinds = new Set(cam.build({ lift: 12, turn: 0.1 }).map((p) => p.name));
    assert.equal(kinds.size, 5, [...kinds].join(", "));
    const scene = game.scene!({});
    assert.deepEqual(scene.map((p) => p.name).sort(), ["Bell", "Post"]);
    assert.equal(game.controls, undefined, "the bumps are fixed: the game has no toggles");
    assert.equal(game.number, "lift");
    // The game starts failing with the lift alone: the player has one thing to set.
    assert.equal(game.judge(game.start!).pass, false);
  });

  it("draws a rise ramp, a dwell and a drop on each of two fixed bumps", () => {
    const outline = geometry.outlineOf(12);
    const radii = outline.map(([x, y]) => Math.hypot(x, y));
    const tops = radii.filter((r) => Math.abs(r - (geometry.R0 + 12)) < 1e-9).length;
    assert.equal(tops, geometry.BUMPS.length * (geometry.DWELL + 1), `${tops} vertices on the dwells`);
    const ramp = radii.filter((r) => r > geometry.R0 + 0.01 && r < geometry.R0 + 12 - 0.01).length;
    assert.equal(ramp, geometry.BUMPS.length * 2 * (geometry.RAMP - 1), `${ramp} vertices on the ramps`);
    assert.ok(Math.abs(Math.min(...radii) - geometry.R0) < 1e-9);
    // The rim is the same at every lift's base: only the bump heights change with the number.
    for (const l of steps(lift))
      assert.equal(
        geometry.outlineOf(l).filter(([x, y]) => Math.abs(Math.hypot(x, y) - geometry.R0) < 1e-9).length,
        360 - geometry.BUMPS.length * (geometry.DWELL + 2 * geometry.RAMP - 1),
      );
  });

  it("rides the drawn rim: the foot rests on its highest point at every turn and lift, never inside it", () => {
    for (const l of steps(lift)) {
      for (const t of TURNS) {
        const { bottom, rim } = foot(cam.build({ lift: l, turn: t }));
        assert.ok(bottom >= rim - 1e-6, `lift ${l}, turn ${t}: the rim is ${(rim - bottom).toFixed(3)} mm inside the foot`);
        assert.ok(bottom - rim <= 0.03, `lift ${l}, turn ${t}: the foot floats ${(bottom - rim).toFixed(3)} mm above the rim`);
      }
    }
  });

  it("lifts the rod the full bump height on each bump's top, and drops it back to rest between them", () => {
    for (const l of steps(lift)) {
      for (const turn of [0.25, 0.75]) assert.ok(Math.abs(rise({ lift: l }, turn) - l) < 0.02, `lift ${l}, turn ${turn}`);
      for (const turn of [0, 0.5]) assert.ok(rise({ lift: l }, turn) < 1e-9, `lift ${l}: back on the base circle at turn ${turn}`);
    }
  });

  it("turns the knob with the cam and solves the drag back", () => {
    for (const t of [0, 0.3, 0.8]) {
      const parts = cam.build({ lift: 12, turn: t });
      const k = find(parts, "knob").position;
      const h = cam.handle.at({ lift: 12, turn: t });
      assert.ok(Math.hypot(k.x - h.x, k.y - h.y, k.z - h.z) < 1e-9);
      assert.ok(Math.abs(cam.handle.solve(h, { lift: 12, turn: t }) - t) < 1e-6);
    }
  });

  it("measures the ramp's steepness from the drawn rim: it grows with the lift and crosses 45 degrees between 12 and 13 mm", () => {
    let last = 0;
    for (const l of steps(lift)) {
      const a = rampAngle(l);
      assert.ok(a > last, `lift ${l}: ${a}° is not steeper than ${last}°`);
      last = a;
    }
    assert.ok(rampAngle(12) <= LIMIT && rampAngle(13) > LIMIT, `${rampAngle(12)}° at 12 mm, ${rampAngle(13)}° at 13 mm`);
    // Cross-check on the drawn polygon, not the solver: the steepest edge's rise over its run along the turn.
    const o = geometry.outlineOf(13);
    const edge = Math.max(
      ...o.map(([x, y], i) => {
        const [x1, y1] = o[(i + 1) % o.length]!;
        const [r0, r1] = [Math.hypot(x, y), Math.hypot(x1, y1)];
        return Math.atan2(Math.abs(r1 - r0), ((r0 + r1) / 2) * DEG_TO_RAD) * RAD_TO_DEG;
      }),
    );
    assert.ok(Math.abs(edge - rampAngle(13)) < 1e-9);
  });

  it("rings on a lift of 9 to 12 only: lower is silent, higher is a jam, one rule for each side", () => {
    const outcomes = Object.fromEntries(numberSweep(cam).map((v) => [v.lift, game.judge(v).outcome]));
    for (let l = 4; l <= 8; l++) assert.equal(outcomes[l], "bell-silent");
    for (const l of [9, 10, 11, 12]) assert.equal(outcomes[l], "bell-rung");
    for (const l of [13, 14]) assert.equal(outcomes[l], "cam-jammed");
    assert.equal(STRIKE, 9);
    // The meters, the verdict and the picture read the same two numbers.
    for (const v of numberSweep(cam)) {
      const [liftMeter, angleMeter] = game.meters(v);
      const r = beat(v);
      assert.equal(liftMeter.value, r.lift);
      assert.equal(angleMeter.value, rampAngle(r.lift));
      assert.equal(r.kind === "jam", angleMeter.value > angleMeter.target);
      assert.equal(r.kind === "silent", liftMeter.value < liftMeter.target);
    }
  });

  it("rings the bell once per bump that clears it, with the rod touching the bell, and never through it", () => {
    for (const v of numberSweep(cam)) {
      const run = game.play(v);
      const rings = (run.cues ?? []).filter((c) => c.kind === "ring").length;
      assert.equal(rings, beat(v).rings, `lift ${v.lift}: ${rings} rings`);
      for (const { ms, frame } of sample(run)) {
        const parts = [...cam.build(frame.values), ...game.scene!(frame.values)];
        const rod = find(parts, "follower");
        const top = rod.position.y + FOOT_TOTAL / 2;
        const bell = find(parts, "game-bell");
        assert.ok(bell.shape.kind === "lathe");
        const bellBottom = bell.position.y - geometry.BELL_H / 2;
        assert.ok(top <= bellBottom + 1e-6, `lift ${v.lift} at ${ms} ms: the rod is ${(top - bellBottom).toFixed(3)} mm into the bell`);
        const { bottom, rim } = foot(parts);
        assert.ok(bottom >= rim - 1e-6, `lift ${v.lift} at ${ms} ms: the rim is inside the foot`);
      }
      for (const c of (run.cues ?? []).filter((q) => q.kind === "ring")) {
        const parts = [...cam.build(run.at(c.ms).values), ...game.scene!(run.at(c.ms).values)];
        const top = find(parts, "follower").position.y + FOOT_TOTAL / 2;
        const bellBottom = find(parts, "game-bell").position.y - geometry.BELL_H / 2;
        assert.ok(Math.abs(top - bellBottom) < 0.05, `lift ${v.lift}: the rod is ${(bellBottom - top).toFixed(3)} mm from the bell when it rings`);
      }
    }
  });

  it("stops the cam where the ramp meets the rod when it is too steep, and runs a full turn otherwise", () => {
    const end = (v: Values) => Math.max(...sample(game.play(v)).map((s) => s.frame.values.turn ?? 0));
    assert.equal(end({ lift: 11, turn: 0 }), 1);
    assert.equal(end({ lift: 4, turn: 0 }), 1);
    for (const l of [13, 14]) {
      const stop = geometry.firstReach({ lift: l }, JAM_RISE);
      assert.ok(Math.abs(end({ lift: l, turn: 0 }) - stop) < 1e-3, `lift ${l}`);
      assert.ok(stop > 0.05 && stop < 0.2, `lift ${l}: stops at turn ${stop}, after a visible turn and long before one`);
      assert.deepEqual(cam.handle.reach!({ lift: l, turn: 0 }), [0, stop]);
    }
    assert.deepEqual(cam.handle.reach!({ lift: 11, turn: 0 }), [0, 1]);
  });

  it("looks nothing like the handle: the bell is not light, the stand is slim, and the bell hangs on it", () => {
    const parts = [...cam.build({ lift: 12, turn: 0.1 }), ...game.scene!({ lift: 12 })];
    const bell = find(parts, "game-bell");
    assert.notEqual(bell.color, COLOR.light);
    assert.notEqual(bell.color, COLOR.steel, "steel renders near-white");
    assert.equal(find(parts, "knob").color, COLOR.light);
    const posts = parts.filter((p) => p.name === "Post");
    assert.ok(posts.every((p) => p.shape.kind === "box" && p.shape.width === 10 && p.shape.depth === 8));
    // The stand never rises more than a bell's height past the bell's top, and the pink cam is wider than the whole post.
    const top = Math.max(...posts.map((p) => (p.shape.kind === "box" ? p.position.y + p.shape.height / 2 : 0)));
    assert.ok(top <= geometry.REST_TOP + STRIKE + geometry.BELL_H + 3, `post top ${top}`);
    // The bell's back face touches the post's front face: it hangs on it, it does not float.
    const post = posts[0]!;
    assert.ok(post.shape.kind === "box");
    const bellBack = bell.position.z - geometry.BELL_R;
    assert.ok(Math.abs(bellBack - (post.position.z + post.shape.depth / 2)) < 1e-9, `bell back ${bellBack}`);
    const camPart = find(parts, "cam");
    assert.ok(camPart.shape.kind === "extrusion");
    const xs = camPart.shape.outline.map((q) => q.x);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 3 * 10, "the cam is far wider than the post");
  });
});
