// Ratchet's own tests. The generic game and design checks (checks.ts) run here, in its own file, so node runs the models in parallel.
//
// The overlap proof below does not reuse the solver: it takes the wheel and pawl parts build() returns, places their
// outlines in the world exactly as the renderer does (outline centred on its bounding box, turned about z, moved to
// the part's position), and measures how far any point of one lies inside the other.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, numberSweep, sample } from "../checks.ts";
import { startValues } from "../types.ts";
import { PLATE_TOP } from "../parts.ts";
import type { Values } from "../types.ts";
import { LIFT_PER_TURN, MARK, ratchet, rig, stopAt, TOLERANCE } from "./ratchet.ts";
import { PIVOT } from "./ratchetGeometry.ts";

type Pt = [number, number];
const game = ratchet.game!;
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);

/** A part's extrusion outline in world x-y, as geometry.ts and the renderer place it. */
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

/** Deepest point of either outline inside the other (mm), and the smallest gap between them when apart. */
function contact(wheel: Pt[], pawl: Pt[]): { depth: number; gap: number } {
  const near = (p: Pt, poly: Pt[]) => {
    const xs = poly.map((q) => q[0]);
    const ys = poly.map((q) => q[1]);
    return p[0] > Math.min(...xs) - 1 && p[0] < Math.max(...xs) + 1 && p[1] > Math.min(...ys) - 1 && p[1] < Math.max(...ys) + 1;
  };
  let depth = 0;
  let gap = Infinity;
  for (const p of along(pawl, 0.25).filter((q) => near(q, wheel))) {
    const d = edgeDistance(p, wheel);
    if (insidePoly(p, wheel)) depth = Math.max(depth, d);
    else gap = Math.min(gap, d);
  }
  for (const p of along(wheel, 0.25).filter((q) => near(q, pawl))) {
    const d = edgeDistance(p, pawl);
    if (insidePoly(p, pawl)) depth = Math.max(depth, d);
    else gap = Math.min(gap, d);
  }
  return { depth, gap };
}

const outlines = (v: Values) => {
  const parts = ratchet.build(v);
  return { wheel: world(find(parts, "wheel")), pawl: world(find(parts, "pawl")), parts };
};
const pawlAngle = (v: Values) => find(ratchet.build(v), "pawl").rotation.z;

const TEETH = [8, 11, 12, 13, 16, 20, 24];
/** Fine turns plus every landing and a hair either side of it. */
const turnsFor = (n: number) => [...new Set([...Array.from({ length: 161 }, (_, i) => i / 160), ...Array.from({ length: n + 1 }, (_, k) => [k / n, k / n + 1e-4, k / n - 1e-4]).flat()])].filter((t) => t >= 0 && t <= 1);

describe("ratchet", () => {
  it("never lets the wheel and pawl cut into each other, and keeps them touching", () => {
    for (const n of TEETH) {
      for (const turn of turnsFor(n)) {
        const { wheel, pawl } = outlines({ teeth: n, turn });
        const { depth, gap } = contact(wheel, pawl);
        assert.ok(depth <= 0.03, `n ${n}, turn ${turn}: pawl and wheel overlap by ${depth.toFixed(3)} mm`);
        assert.ok(depth > 0 || gap <= 0.3, `n ${n}, turn ${turn}: pawl floats ${gap.toFixed(3)} mm off the wheel`);
      }
    }
  });

  it("clicks once per tooth, exactly at each landing, and counts its clicks right", () => {
    const STEPS = 1200;
    for (const n of [8, 13, 24]) {
      const drops: number[] = [];
      let before = pawlAngle({ teeth: n, turn: 0 });
      for (let i = 1; i <= STEPS; i++) {
        const turn = i / STEPS;
        const now = pawlAngle({ teeth: n, turn });
        if (before - now > 1) drops.push(turn);
        before = now;
        const clicks = Number(/(\d+) clicks|landing (\d+)/.exec(ratchet.readouts({ teeth: n, turn })[2]!.value)?.slice(1).find(Boolean));
        assert.equal(clicks, Math.floor(turn * n + 1e-9), `n ${n}, turn ${turn}: click count`);
      }
      assert.equal(drops.length, n, `n ${n}: ${drops.length} clicks in a turn`);
      drops.forEach((t, k) => assert.ok(Math.abs(t - (k + 1) / n) <= 1 / STEPS + 1e-9, `n ${n}: click ${k + 1} at turn ${t}, landing at ${(k + 1) / n}`));
    }
  });

  it("locks backward: at a landing, turning the wheel back half a degree drives the cliff into the pawl", () => {
    for (const n of TEETH) {
      for (const k of [1, Math.floor(n / 2), n - 1]) {
        const seated = outlines({ teeth: n, turn: k / n }).pawl;
        const back = outlines({ teeth: n, turn: k / n - 0.5 / 360 }).wheel;
        assert.ok(contact(back, seated).depth > 0.1, `n ${n}, landing ${k}: the wheel turns back through the pawl`);
      }
    }
  });

  it("is self-engaging: the cliff's push on the nose turns the pawl into the wheel", () => {
    // At a landing the holding cliff lies along y = W.y on the wheel's right and pushes the nose's underside up.
    // The pawl turns about its pin; a push whose moment about the pin is clockwise swings the nose inward.
    for (const n of TEETH) {
      const parts = ratchet.build({ teeth: n, turn: 1 / n });
      const pin = { x: rig.W.x + PIVOT[0], y: rig.W.y + PIVOT[1] };
      assert.ok(Math.hypot(find(parts, "pivot").position.x - pin.x, find(parts, "pivot").position.y - pin.y) < 1e-9, "the pawl's stub sits at its pivot");
      // The cliff's outer end is the wheel's farthest point on that line: where it meets the nose's underside.
      const tip = Math.max(...world(find(parts, "wheel")).map(([x, y]) => Math.hypot(x - rig.W.x, y - rig.W.y)));
      const contactAt: Pt = [rig.W.x + tip, rig.W.y];
      // Moment of an upward push (0, 1) at the contact about the pin; negative is clockwise, which swings the nose in.
      const moment = contactAt[0] - pin.x;
      assert.ok(moment < 0, `n ${n}: moment ${moment}: the push would swing the pawl out`);
    }
  });

  it("keeps to the simple-first budget: eight kinds at rest, no spring housing, one coil on the pawl's own hinge", () => {
    const start = startValues(ratchet);
    const parts = ratchet.build({ teeth: 12, turn: 0.2 });
    const kinds = [...new Set(parts.map((p) => p.name))];
    assert.ok(kinds.length <= 8, kinds.join(", "));
    assert.deepEqual(kinds.sort(), ["Base plate", "Bucket", "Cord", "Knob", "Pawl", "Ratchet wheel", "Spring", "Stand"]);
    assert.ok(!parts.some((p) => /arrow/.test(p.id)), "the bucket carries no arrow");
    assert.ok(!parts.some((p) => p.id === "seat"), "the spring has no block to sit in");
    // Black is the plate and one stand piece with its pivot stub: nothing else.
    assert.deepEqual(parts.filter((p) => p.color === "#2e2e30").map((p) => p.id).sort(), ["pivot", "plate", "stand"]);
    const scene = game.scene!(start);
    assert.deepEqual(scene.map((p) => p.name).sort(), ["Mark", "Post"]);
    checkGame(ratchet);
    checkDesign(ratchet);
  });

  it("presses the pawl with one coil round its pivot stub, fixed between the pawl's back face and the stand, whatever the pawl does", () => {
    const at = (v: Values) => {
      const parts = ratchet.build(v);
      const spring = find(parts, "spring");
      assert.ok(spring.shape.kind === "helix");
      const pivot = find(parts, "pivot");
      const pawl = find(parts, "pawl");
      assert.ok(pawl.shape.kind === "extrusion" && pivot.shape.kind === "lathe");
      return { spring, pivot, pawl, stand: find(parts, "stand") };
    };
    const first = at({ teeth: 12, turn: 0 });
    const poses: Values[] = [{ teeth: 12, turn: 0.02 }, { teeth: 12, turn: 0.05 }, { teeth: 12, turn: 0.71 }, { teeth: 24, turn: 0.3 }, { teeth: 12, turn: 0.1, lift: 1 }];
    for (const v of poses) {
      const { spring, pivot } = at(v);
      assert.ok(Math.hypot(spring.position.x - first.spring.position.x, spring.position.y - first.spring.position.y, spring.position.z - first.spring.position.z) < 1e-9, "the coil stays where it is");
      // It is centred on the pivot stub's axis (x, y), lies along z, and is wider than the stub.
      assert.ok(Math.hypot(spring.position.x - pivot.position.x, spring.position.y - pivot.position.y) < 1e-9);
      assert.equal(spring.rotation.x, 90);
      assert.ok(spring.shape.kind === "helix" && spring.shape.radius - spring.shape.tube > 3, "the coil clears the 3 mm stub");
    }
    // Its ends: the stand's front face at the back, the pawl's back face at the front.
    const spring = first.spring;
    assert.ok(spring.shape.kind === "helix" && first.stand.shape.kind === "extrusion" && first.pawl.shape.kind === "extrusion");
    const back = spring.position.z - spring.shape.length / 2;
    const front = spring.position.z + spring.shape.length / 2;
    assert.ok(Math.abs(back - (first.stand.position.z + first.stand.shape.depth / 2)) < 1e-9, `back of the coil at ${back}`);
    assert.ok(Math.abs(front - (first.pawl.position.z - first.pawl.shape.depth / 2)) < 1e-9, `front of the coil at ${front}`);
    assert.equal(spring.parentId, "stand");
  });

  it("has one target: a tick at least 10 mm long held by a slim post beside the bucket's path, and the bucket reaches it and never goes into it", () => {
    const scene = game.scene!(startValues(ratchet));
    const tick = find(scene, "game-mark");
    const post = find(scene, "game-post");
    assert.ok(tick.shape.kind === "box" && post.shape.kind === "box");
    assert.ok(tick.shape.width >= 10, `the tick is ${tick.shape.width} long`);
    assert.equal(tick.parentId, "game-post");
    // The tick's end sits on the post's face, and the tick stands at the mark's height, level with the bucket's top there.
    assert.ok(Math.abs(tick.position.x + tick.shape.width / 2 - (post.position.x - post.shape.width / 2)) < 1e-9, "the tick's far end touches the post");
    assert.ok(Math.abs(tick.position.y - rig.bucketTop(MARK / LIFT_PER_TURN)) < 1e-9, "the tick is level with the bucket's top at the mark");
    assert.ok(post.position.y + post.shape.height / 2 >= tick.position.y + 1.5 - 1e-9 && post.position.y - post.shape.height / 2 <= PLATE_TOP + 1e-9, "the post stands from the plate to the tick");
    // Across every run (and a fine scan of the whole turn) the bucket stays out of the tick.
    const tickBox = { x0: tick.position.x - tick.shape.width / 2, y0: tick.position.y - 1.5, y1: tick.position.y + 1.5 };
    const clear = (v: Values) => {
      const bucket = find(ratchet.build(v), "bucket");
      assert.ok(bucket.shape.kind === "box");
      const [right, top] = [bucket.position.x + bucket.shape.width / 2, bucket.position.y + bucket.shape.height / 2];
      const bottom = bucket.position.y - bucket.shape.height / 2;
      return right <= tickBox.x0 + 1e-9 || bottom >= tickBox.y1 || top <= tickBox.y0 + 1e-9;
    };
    for (const v of numberSweep(ratchet)) for (const { frame } of sample(game.play(v)).filter((_, i) => i % 3 === 0)) assert.ok(clear(frame.values), `n ${v.teeth}: the bucket is in the tick`);
    // Only a drag past the mark with the scene showing could push it in, and the bucket's side is clear of the tick all the same.
    const bucket = find(ratchet.build({ teeth: 12, turn: MARK / LIFT_PER_TURN }), "bucket");
    assert.ok(bucket.shape.kind === "box" && tickBox.x0 - (bucket.position.x + bucket.shape.width / 2) > 0.5, "the tick stops short of the bucket's side");
  });

  it("words the tooth strength as this game's wheel, and says in howItWorks that it is a simplification", () => {
    assert.match(game.rules, /On this wheel a tooth holds about 1100 ÷ teeth N/);
    assert.doesNotMatch(game.rules, /^A tooth holds/);
    assert.match(ratchet.howItWorks, /simplification/);
    for (const v of numberSweep(ratchet).filter((q) => (q.teeth ?? 0) > 13)) assert.match(game.judge(v).detail, /On this wheel/);
  });

  it("hangs the bucket from the cord, a turn of the hub lifting it 37.7 mm", () => {
    for (const turn of [0, 0.4, 1]) {
      const parts = ratchet.build({ teeth: 12, turn });
      const bucket = find(parts, "bucket");
      const cord = find(parts, "cord");
      assert.ok(bucket.shape.kind === "box" && cord.shape.kind === "box");
      assert.ok(Math.abs(bucket.position.y - bucket.shape.height / 2 - (6 + LIFT_PER_TURN * turn)) < 1e-9);
      assert.ok(Math.abs(cord.position.y - (cord.shape.width - 3.2 * 0.8) / 2 - (bucket.position.y + bucket.shape.height / 2)) < 1e-6, "the cord ends on the bucket");
    }
  });

  it("can be turned back by hand only to the landing the pawl last dropped into", () => {
    assert.deepEqual(ratchet.handle!.reach!({ teeth: 12, turn: 3.5 / 12 }), [3 / 12, 1]);
    assert.deepEqual(ratchet.handle!.reach!({ teeth: 12, turn: 3 / 12 }), [3 / 12, 1]);
    assert.deepEqual(ratchet.handle!.reach!({ teeth: 12, turn: 3.5 / 12, lift: 1 }), [0, 1]);
  });

  it("keeps the knob on the wheel's face, inside the teeth, and the hand's point on it", () => {
    for (const turn of [0, 0.3, 0.77]) {
      const v = { teeth: 12, turn };
      const parts = ratchet.build(v);
      const k = find(parts, "knob").position;
      assert.ok(Math.abs(Math.hypot(k.x - rig.W.x, k.y - rig.W.y) + 5.5 - 19.5) < 1e-9, "the knob's rim stays inside the tooth roots");
      const h = ratchet.handle!.at(v);
      assert.ok(Math.hypot(h.x - k.x, h.y - k.y, h.z - k.z) < 1e-9);
    }
  });

  it("stops within the tolerance for 11 to 13 teeth only: coarser slips, finer strips", () => {
    const outcomes = Object.fromEntries(numberSweep(ratchet).map((v) => [v.teeth, game.judge(v).outcome]));
    for (const n of [8, 9, 10]) assert.equal(outcomes[n], "slipped-past");
    for (const n of [11, 12, 13]) assert.equal(outcomes[n], "held-at-mark");
    for (let n = 14; n <= 24; n++) assert.equal(outcomes[n], "teeth-stripped");
    for (const n of [11, 12, 13]) assert.ok(stopAt({ teeth: n }).drop <= TOLERANCE);
  });

  it("winds to the mark, then drops back to the last landing, in every run", () => {
    for (const v of numberSweep(ratchet)) {
      const run = game.play(v);
      const r = stopAt(v);
      const peak = Math.max(...sample(run).map(({ frame }) => frame.values.turn ?? 0));
      assert.ok(Math.abs(peak * LIFT_PER_TURN - MARK) < 1e-6, `n ${v.teeth}: wound to ${peak * LIFT_PER_TURN} mm`);
      const end = run.at(run.durationMs).values.turn ?? 0;
      assert.ok(Math.abs(end - (r.kind === "strips" ? 0 : r.landTurn)) < 1e-9, `n ${v.teeth}: rests at turn ${end}`);
      const clicks = (run.cues ?? []).filter((c) => c.kind === "click").length;
      assert.equal(clicks, Math.floor(r.markTurn * r.n + 1e-9) + 1, `n ${v.teeth}: one click per tooth wound past, and one at the catch`);
    }
  });

  it("never lets the wheel and pawl cut into each other during a run", () => {
    for (const v of [startValues(ratchet), ...numberSweep(ratchet).filter((q) => [10, 12, 16, 24].includes(q.teeth ?? 0)), { teeth: 12, turn: 0.95 }]) {
      for (const { ms, frame } of sample(game.play(v)).filter((_, i) => i % 2 === 0)) {
        const { wheel, pawl } = outlines(frame.values);
        const { depth } = contact(wheel, pawl);
        assert.ok(depth <= 0.03, `n ${v.teeth} at ${ms} ms: overlap ${depth.toFixed(3)} mm`);
      }
    }
  });
});
