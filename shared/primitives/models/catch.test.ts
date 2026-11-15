// Catch's own tests: the generic game and design checks (checks.ts), and proofs of its own claims.
//
// The overlap proofs do not reuse the solver: they take the bolt, door and frame parts build() returns, place their
// outlines in the world exactly as the renderer does (outline centred on its bounding box, moved to the part's
// position), and measure how far any point of one lies inside another.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, numberSweep, sample, startOf, steps } from "../checks.ts";
import type { Values } from "../types.ts";
import { catchLatch, GUST, PUSH, rig, settle, shutAndHold, springFor } from "./catch.ts";
import { CLOSE_GAIN, FLAT_AT, HOLD_GAIN, LIP_AT, liftAt, THROW, TOUCH_AT } from "./catchGeometry.ts";

type Pt = [number, number];
const game = catchLatch.game!;
const [force, door] = catchLatch.sliders as [NonNullable<(typeof catchLatch.sliders)[0]>, NonNullable<(typeof catchLatch.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);

function world(part: Part): Pt[] {
  assert.ok(part.shape.kind === "extrusion");
  const xs = part.shape.outline.map((q) => q.x);
  const ys = part.shape.outline.map((q) => q.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  assert.equal(part.rotation.z, 0);
  return part.shape.outline.map(({ x, y }): Pt => [part.position.x + x - cx, part.position.y + y - cy]);
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
function contact(a: Pt[], b: Pt[]): { depth: number; gap: number } {
  let depth = 0;
  let gap = Infinity;
  for (const [from, into] of [[a, b], [b, a]] as const) {
    for (const p of along(from, 0.2)) {
      const d = edgeDistance(p, into);
      // A point on the other's edge may test as inside: it is touching, so it closes the gap either way.
      if (insidePoly(p, into)) depth = Math.max(depth, d);
      gap = Math.min(gap, insidePoly(p, into) ? 0 : d);
    }
  }
  return { depth, gap };
}
const outlines = (v: Values) => {
  const parts = catchLatch.build(v);
  return { bolt: world(find(parts, "bolt")), frame: world(find(parts, "frame")), door: world(find(parts, "door")) };
};

const DOORS = steps(door);
const FORCES = [2, 8, 12, 16, 20];
const KEY_DOORS = [TOUCH_AT, (TOUCH_AT + FLAT_AT) / 2, FLAT_AT, LIP_AT, LIP_AT / 2, -0.01, 0];

describe("catch", () => {
  it("passes the generic game checks", () => checkGame(catchLatch));
  it("follows the design language", () => checkDesign(catchLatch));

  it("never lets the bolt cut into the door or the frame, and only lifts it where the door's edge touches it", () => {
    for (const f of FORCES) {
      for (const d of [...DOORS, ...KEY_DOORS]) {
        const o = outlines({ force: f, door: d });
        const onDoor = contact(o.bolt, o.door);
        assert.ok(onDoor.depth <= 0.03, `force ${f}, door ${d}: bolt ${onDoor.depth.toFixed(3)} mm into the door`);
        if (liftAt(d) > 1e-6) assert.ok(onDoor.gap <= 0.05 || onDoor.depth > 0, `force ${f}, door ${d}: lifted by a door ${onDoor.gap.toFixed(3)} mm away`);
        const inFrame = contact(o.bolt, o.frame);
        assert.ok(inFrame.depth <= 0.03, `force ${f}, door ${d}: bolt ${inFrame.depth.toFixed(3)} mm into the frame`);
        const doorFrame = contact(o.door, o.frame);
        assert.ok(doorFrame.depth <= 0.03, `force ${f}, door ${d}: door ${doorFrame.depth.toFixed(3)} mm into the frame`);
      }
    }
  });

  it("rides up the gentle face, slides on the keeper, and drops down the steep face into the notch", () => {
    assert.equal(liftAt(door.min), 0, "hangs free with the door open");
    assert.ok(liftAt(TOUCH_AT) < 1e-9, "just touching where the door's corner meets the gentle face");
    assert.ok(Math.abs(liftAt(FLAT_AT) - THROW) < 1e-9, "all the way up when the tip reaches the keeper");
    assert.ok(Math.abs(liftAt((FLAT_AT + LIP_AT) / 2) - THROW) < 1e-9, "held up on the keeper");
    assert.ok(liftAt(0) < 1e-9, "back down, seated, with the door shut");
    // The faces' slopes, read off the solved lift, are the angles the bolt is drawn with.
    const mid = (TOUCH_AT + FLAT_AT) / 2;
    assert.ok(Math.abs((liftAt(mid + 0.01) - liftAt(mid)) / 0.01 - CLOSE_GAIN) < 1e-6, "the gentle face's slope");
    assert.ok(Math.abs((liftAt(LIP_AT / 2 - 0.01) - liftAt(LIP_AT / 2)) / 0.01 - HOLD_GAIN) < 1e-6, "the steep face's slope");
  });

  it("when shut, the flange sits on the lips, the steep face lies on the notch's wall, and the door rests on the post", () => {
    for (const f of FORCES) {
      const o = outlines({ force: f, door: 0 });
      assert.ok(contact(o.bolt, o.frame).gap <= 0.05, "the flange rests on the lips");
      assert.ok(contact(o.bolt, o.door).gap <= 0.05, "the steep face lies on the notch's wall");
      assert.ok(contact(o.door, o.frame).gap <= 0.05, "the door rests on the post");
    }
  });

  it("shows the release force in the spring: thicker wire, fewer turns, never squeezed solid, ends on the flange and the roof", () => {
    for (let f = 3; f <= 20; f++) {
      assert.ok(springFor(f).wire > springFor(f - 1).wire, "the wire thickens");
      assert.ok(springFor(f).turns < springFor(f - 1).turns, "the turns fall");
    }
    assert.ok(springFor(20).wire / springFor(2).wire > 1.5, "the stiffest wire is half as thick again as the softest");
    for (const f of steps(force)) {
      for (const d of [door.min, FLAT_AT, 0]) {
        const parts = catchLatch.build({ force: f, door: d });
        const spring = find(parts, "spring");
        assert.ok(spring.shape.kind === "helix");
        const solid = 2 * spring.shape.tube * (spring.shape.turns + 1);
        assert.ok(spring.shape.length >= solid - 1e-9, `force ${f}, door ${d}: spring ${spring.shape.length} mm, solid at ${solid}`);
        assert.ok(Math.abs(spring.shape.length - (rig.FITTED - liftAt(d))) < 1e-9, `force ${f}, door ${d}: the spring is as long as the bolt's lift leaves it`);
        const flangeTop = Math.max(...world(find(parts, "bolt")).map(([, y]) => y));
        assert.ok(Math.abs(spring.position.y - spring.shape.length / 2 - flangeTop) < 1e-9, `force ${f}, door ${d}: the spring stands on the flange`);
      }
    }
  });

  it("pulls with exactly the release force at the top of the steep face, and pushes with the shutting force at the top of the gentle one", () => {
    for (const f of steps(force)) {
      const steep = settle({ force: f, door: LIP_AT + 1e-4 });
      assert.ok(Math.abs(-steep.hand - f) < 1e-3, `force ${f}: the steep face peaks at a ${-steep.hand} N pull`);
      const gentle = settle({ force: f, door: FLAT_AT - 1e-4 });
      assert.ok(Math.abs(gentle.hand - springFor(f).toShut) < 1e-3, `force ${f}: the gentle face peaks at a ${gentle.hand} N push`);
      assert.ok(Math.abs(springFor(f).toShut / f - CLOSE_GAIN / HOLD_GAIN) < 1e-12, "one spring: shutting is tan 30° ÷ tan 70° of opening");
    }
  });

  it("passes for 9 to 14 N: weaker and the gust pulls it open, stronger and the push cannot shut it", () => {
    const outcomes = Object.fromEntries(numberSweep(catchLatch).map((v) => [v.force, game.judge(v).outcome]));
    for (let f = 2; f <= 8; f++) assert.equal(outcomes[f], "gust-opens", `force ${f}`);
    for (let f = 9; f <= 14; f++) assert.equal(outcomes[f], "shuts-and-holds", `force ${f}`);
    for (let f = 15; f <= 20; f++) assert.equal(outcomes[f], "wont-shut", `force ${f}`);
    for (let f = 9; f <= 14; f++) assert.ok(springFor(f).toShut <= PUSH && f >= GUST);
  });

  it("stalls the push and the gust exactly where the face asks as much as they give", () => {
    for (const f of [15, 20]) {
      const r = shutAndHold({ force: f });
      const s = settle({ force: f, door: r.pushStall });
      assert.ok(Math.abs(s.hand - PUSH) < 1e-3, `force ${f}: the push stalls where holding takes ${s.hand} N`);
      assert.ok(r.pushStall < FLAT_AT, "it stalls on the gentle face, short of the keeper");
    }
    // At 9 N the gust equals the hold and the door stops right on the corner; inside the window it stops on the face.
    for (const f of [10, 12, 14]) {
      const r = shutAndHold({ force: f });
      const s = settle({ force: f, door: r.gustStall });
      assert.ok(Math.abs(-s.hand - GUST) < 1e-3, `force ${f}: the gust stops where the steep face holds ${-s.hand} N`);
      assert.ok(r.gustStall >= LIP_AT, "the bolt stays on the steep face");
    }
  });

  it("never lets the bolt cut in during a run, and each outcome is its own motion", () => {
    for (const v of [startOf(catchLatch), ...numberSweep(catchLatch)]) {
      const run = game.play(v);
      const kind = shutAndHold(v).kind;
      const frames = sample(run);
      for (const { ms, frame } of frames.filter((_, i) => i % 3 === 0)) {
        const o = outlines(frame.values);
        assert.ok(contact(o.bolt, o.door).depth <= 0.03, `force ${v.force} at ${ms} ms: bolt into the door`);
        assert.ok(contact(o.bolt, o.frame).depth <= 0.03, `force ${v.force} at ${ms} ms: bolt into the frame`);
      }
      const doors = frames.map((f) => f.frame.values.door ?? 0);
      const end = doors[doors.length - 1]!;
      const furthest = Math.max(...doors);
      if (kind === "wont-shut") {
        assert.ok(furthest < FLAT_AT, `force ${v.force}: a stiff spring never lets the door onto the keeper`);
        assert.ok(Math.abs(end - TOUCH_AT) < 1e-9, `force ${v.force}: pushed back out to where it first touched`);
      } else assert.equal(furthest, 0, `force ${v.force}: the door shuts onto the post`);
      if (kind === "gust-opens") assert.ok(end < TOUCH_AT, `force ${v.force}: the gust leaves it open`);
      if (kind === "pass") assert.equal(end, 0, `force ${v.force}: still shut at the end`);
      assert.equal((run.cues ?? []).some((c) => c.kind === "snap"), kind !== "wont-shut", `force ${v.force}: snaps only if it shuts`);
    }
  });
});
