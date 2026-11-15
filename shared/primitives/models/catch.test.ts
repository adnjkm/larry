// Catch's own tests: the generic game and design checks (checks.ts), and proofs of its own claims.
//
// The overlap proofs do not reuse the solver: they take the bolt, door and frame parts build() returns, place their
// outlines in the world exactly as the renderer does (outline centred on its bounding box, moved to the part's
// position), and measure how far any point of one lies inside another.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, contact, find, numberSweep, sample, worldOutline } from "../checks.ts";
import { startValues, steps, type Values } from "../types.ts";
import { catchLatch, GUST, PUSH, rig, settle, shutAndHold, springFor } from "./catch.ts";
import { CLOSE_GAIN, FLAT_AT, HOLD_GAIN, LIP_AT, liftAt, THROW, TOUCH_AT } from "./catchGeometry.ts";

type Pt = [number, number];
const game = catchLatch.game;
const [force, door] = catchLatch.sliders as [NonNullable<(typeof catchLatch.sliders)[0]>, NonNullable<(typeof catchLatch.sliders)[1]>];

const outlines = (v: Values) => {
  const parts = catchLatch.build(v);
  return { bolt: worldOutline(find(parts, "bolt")), frame: worldOutline(find(parts, "frame")), door: worldOutline(find(parts, "door")) };
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
        const onDoor = contact(o.bolt, o.door, 0.2);
        assert.ok(onDoor.depth <= 0.03, `force ${f}, door ${d}: bolt ${onDoor.depth.toFixed(3)} mm into the door`);
        if (liftAt(d) > 1e-6) assert.ok(onDoor.gap <= 0.05 || onDoor.depth > 0, `force ${f}, door ${d}: lifted by a door ${onDoor.gap.toFixed(3)} mm away`);
        const inFrame = contact(o.bolt, o.frame, 0.2);
        assert.ok(inFrame.depth <= 0.03, `force ${f}, door ${d}: bolt ${inFrame.depth.toFixed(3)} mm into the frame`);
        const doorFrame = contact(o.door, o.frame, 0.2);
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
      assert.ok(contact(o.bolt, o.frame, 0.2).gap <= 0.05, "the flange rests on the lips");
      assert.ok(contact(o.bolt, o.door, 0.2).gap <= 0.05, "the steep face lies on the notch's wall");
      assert.ok(contact(o.door, o.frame, 0.2).gap <= 0.05, "the door rests on the post");
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
        const flangeTop = Math.max(...worldOutline(find(parts, "bolt")).map(([, y]) => y));
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
    for (const v of [startValues(catchLatch), ...numberSweep(catchLatch)]) {
      const run = game.play(v);
      const kind = shutAndHold(v).kind;
      const frames = sample(run);
      for (const { ms, frame } of frames.filter((_, i) => i % 3 === 0)) {
        const o = outlines(frame.values);
        assert.ok(contact(o.bolt, o.door, 0.2).depth <= 0.03, `force ${v.force} at ${ms} ms: bolt into the door`);
        assert.ok(contact(o.bolt, o.frame, 0.2).depth <= 0.03, `force ${v.force} at ${ms} ms: bolt into the frame`);
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
      assert.equal(
        (run.cues ?? []).some((c) => c.kind === "snap"),
        kind !== "wont-shut",
        `force ${v.force}: snaps only if it shuts`,
      );
    }
  });
});

/** How far a plot's dot is from its line, in plot units. */
function offLine(plot: { line: readonly (readonly [number, number])[]; dot?: readonly [number, number] }): number {
  const p = plot.dot!;
  let best = Infinity;
  for (let i = 1; i < plot.line.length; i++) {
    const a = plot.line[i - 1]!;
    const b = plot.line[i]!;
    const len = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1])));
  }
  return best;
}

describe("catch free play", () => {
  const plot = catchLatch.play!.plot!;
  const hand = catchLatch.play!.hand!;
  it("plots the hand's push along the door's last stretch, with the dot on it wherever the door is", () => {
    for (const f of FORCES)
      for (const d of [...DOORS, ...KEY_DOORS, -12.34, -3.1]) {
        const p = plot({ force: f, door: d });
        assert.ok(offLine(p) < 1e-3, `force ${f}, door ${d}: the dot is ${offLine(p).toFixed(4)} off the line`);
      }
  });

  it("puts a small hump over the zero for the gentle face and a deep trough under it for the steep one, both scaled by the spring", () => {
    for (const f of FORCES) {
      const p = plot({ force: f, door: 0 });
      const ys = p.line.map((q) => q[1]);
      const unit = 1 / (force.max * (1 + CLOSE_GAIN / HOLD_GAIN));
      // The hump: the spring's full push times tan 30°; the trough: times tan 70°, which is the release force.
      assert.ok(Math.abs(Math.max(...ys) - p.zero! - ((f * CLOSE_GAIN) / HOLD_GAIN) * unit) < 2e-3, `force ${f}: hump`);
      assert.ok(Math.abs(p.zero! - Math.min(...ys) - f * unit) < 2e-3, `force ${f}: trough`);
    }
  });

  it("draws the holding arrow while the finger is on the door, longer for a stronger spring on the steep face", () => {
    const length = (f: number, d: number) => {
      const a = hand({ force: f, door: d });
      if (a.length === 0) return 0;
      const s = a[0]!.shape;
      assert.ok(s.kind === "extrusion");
      const xs = s.outline.map((q) => q.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    assert.equal(length(8, -36), 0, "clear of the bolt, the door needs no holding");
    assert.equal(length(8, 0), 0, "shut, the post holds it");
    assert.ok(length(8, -15) > 0, "on the gentle face");
    assert.ok(length(20, -2) > length(4, -2) + 8, `steep face: ${length(4, -2)} at 4 N, ${length(20, -2)} at 20 N`);
  });
});
