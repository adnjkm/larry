// Wedge's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts and here.
//
// The contact proofs read the parts build() returns: the log halves' top inner corners against the wedge's drawn face,
// the pads between the halves and the posts, the tip against the plate, the force arrows against the halves they push.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, numberSweep, sample } from "../checks.ts";
import { startValues, steps, type Values } from "../types.ts";
import { BLOW, BLOWS, ELASTIC, GRIP, gripAt, LENGTH, OPEN, rig, settle, split, wedge } from "./wedge.ts";

const game = wedge.game;
const [slope, push] = wedge.sliders as [NonNullable<(typeof wedge.sliders)[0]>, NonNullable<(typeof wedge.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const box = (p: Part) => (p.shape.kind === "box" ? p.shape : assert.fail(`${p.id} is not a box`));
const len = (p: Part) => (p.shape.kind === "extrusion" ? Math.max(...p.shape.outline.map((q) => q.x)) : 0);

/** The wedge's outline in the world: its three corners, tip first. */
function wedgeCorners(parts: Part[]) {
  const w = find(parts, "wedge");
  assert.ok(w.shape.kind === "extrusion");
  const ys = w.shape.outline.map((q) => q.y);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs = w.shape.outline.map((q) => q.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  return w.shape.outline.map((q) => ({ x: w.position.x + q.x - cx, y: w.position.y + q.y - cy }));
}
/** Distance from a point to the infinite line through a and b. */
const lineDistance = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
/** The caption's "open X mm", if it has one. */
const openIn = (live: string) => {
  const m = /open ([\d.]+) mm/.exec(live);
  return m ? Number(m[1]) : undefined;
};

describe("wedge", () => {
  it("rides each log half's top inner corner on its own face, at every reachable pose", () => {
    for (const sl of steps(slope)) {
      for (const p of steps(push)) {
        const v = { slope: sl, push: p };
        const parts = wedge.build(v);
        const [tip, right, left] = wedgeCorners(parts) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
        const r = find(parts, "block-right");
        const l = find(parts, "block-left");
        const topY = r.position.y + box(r).height / 2;
        const cornerR = { x: r.position.x - box(r).width / 2, y: topY };
        const cornerL = { x: l.position.x + box(l).width / 2, y: topY };
        assert.ok(lineDistance(cornerR, tip, right) < 1e-6, `slope ${sl}, push ${p}: the right half is ${lineDistance(cornerR, tip, right)} mm off the wedge`);
        assert.ok(lineDistance(cornerL, tip, left) < 1e-6, `slope ${sl}, push ${p}: the left half is ${lineDistance(cornerL, tip, left)} mm off the wedge`);
        // Opening is the tan of the half-angle times the way in.
        assert.ok(Math.abs(cornerR.x - settle(v).push * Math.tan((sl * Math.PI) / 180)) < 1e-6);
      }
    }
  });

  it("never lets the wedge through the log: the tip is between the halves, and lands on the plate at the full length", () => {
    assert.equal(push.max, LENGTH);
    for (const sl of steps(slope)) {
      const parts = wedge.build({ slope: sl, push: push.max });
      const tip = wedgeCorners(parts)[0]!;
      const s = settle({ slope: sl, push: push.max });
      assert.ok(tip.y >= 6 - 1e-9, `slope ${sl}: the tip is under the plate`);
      if (s.push >= LENGTH - 1e-9) assert.ok(Math.abs(tip.y - 6) < 1e-9, `slope ${sl}: the tip stops ${tip.y - 6} mm off the plate`);
      // Below the halves' tops the wedge is narrower than the gap they leave.
      const half = (rig.TOP_Y - tip.y) * s.t;
      assert.ok(half <= s.open + 1e-9);
    }
  });

  it("holds each pad between its half and its post: no gap, no overlap, squeezing as the half goes out", () => {
    for (const sl of [8, 14, 20]) {
      for (const p of [0, 5, 12, 32]) {
        const parts = wedge.build({ slope: sl, push: p });
        for (const side of ["left", "right"] as const) {
          const sign = side === "right" ? 1 : -1;
          const pad = find(parts, `pad-${side}`);
          const block = find(parts, `block-${side}`);
          const post = find(parts, `post-${side}`);
          const inner = pad.position.x - sign * (box(pad).width / 2);
          const outer = pad.position.x + sign * (box(pad).width / 2);
          assert.ok(Math.abs(inner - (block.position.x + sign * (box(block).width / 2))) < 1e-9, "the pad does not meet the half");
          assert.ok(Math.abs(outer - (post.position.x - sign * (box(post).width / 2))) < 1e-9, "the pad does not meet the post");
          assert.ok(box(pad).width >= 3);
        }
      }
    }
  });

  it("only goes in as far as its push can hold against the log's grip: a fat wedge stalls, a fatter one will not go in", () => {
    for (const sl of steps(slope)) {
      const s = settle({ slope: sl, push: push.max });
      if (s.push > ELASTIC + 1e-9) assert.ok(s.side >= gripAt(s.open) - 1e-6 || s.through, `slope ${sl}: ${s.side} N against a grip of ${gripAt(s.open)} N`);
      if (s.side < GRIP) assert.ok(s.push <= ELASTIC + 1e-9, `slope ${sl}: pushes in against more grip than it makes`);
      const [lo, hi] = wedge.handle.reach!({ slope: sl, push: 10 });
      assert.deepEqual([lo, hi], [0, s.limit]);
    }
    assert.ok(settle({ slope: 28, push: 24 }).push < 24, "a fat wedge is held to its stall");
    assert.ok(settle({ slope: 30, push: 24 }).push <= ELASTIC);
  });

  it("draws three arrows only, all on something: the hammer's push on the tap pad and one push on the face of each half; none at rest, none above the logs", () => {
    const arrows = (v: Values) => wedge.build(v).filter((p) => /arrow/.test(p.id));
    assert.equal(arrows({ slope: 20, push: 0 }).length, 0);
    for (const sl of [8, 14, 20, 28, 35]) {
      const parts = wedge.build({ slope: sl, push: 4 });
      const all = arrows({ slope: sl, push: 4 });
      assert.deepEqual(all.map((a) => a.id).sort(), ["out-arrow-left", "out-arrow-right", "push-arrow"], `slope ${sl}`);
      assert.ok(!all.some((a) => /grip/.test(a.id)));
      const s = settle({ slope: sl, push: 4 });
      for (const side of ["left", "right"] as const) {
        const sign = side === "right" ? 1 : -1;
        const a = find(parts, `out-arrow-${side}`);
        const block = find(parts, `block-${side}`);
        assert.ok(a.shape.kind === "extrusion");
        // Lies on the half's front face: its back face meets the face's plane, its height is within the half's, and it points outward.
        assert.ok(Math.abs(a.position.z - a.shape.depth / 2 - rig.DEPTH / 2) < 1e-9, `slope ${sl}: the arrow does not lie on the half's front face`);
        assert.ok(a.position.y > 6 && a.position.y < rig.TOP_Y, `slope ${sl}: the arrow is not level with the half`);
        const tail = a.position.x - sign * (len(a) / 2);
        const tipX = a.position.x + sign * (len(a) / 2);
        assert.ok(sign * tail >= s.open - 1e-9 && sign * tail <= s.open + 3, `slope ${sl}: the ${side} arrow starts ${sign * tail - s.open} mm from the half's inner edge`);
        assert.ok(sign * tipX > sign * tail, "the arrow points inward");
        assert.ok(sign * tipX < rig.POST_X - 5, `slope ${sl}: the ${side} arrow runs into the post`);
        assert.ok(Math.abs(block.position.y - a.position.y) < 1e-9);
      }
      // The same scale for all: a bigger force is a longer arrow, none under 12.
      assert.ok(len(find(parts, "out-arrow-left")) >= 12 && len(find(parts, "push-arrow")) >= 12);
    }
    // At the thinnest slope the side push is the longest arrow; at a fatter one it is shorter.
    assert.ok(len(find(wedge.build({ slope: 8, push: 4 }), "out-arrow-left")) > len(find(wedge.build({ slope: 20, push: 4 }), "out-arrow-left")));
  });

  it("drags the tap pad to the pointer and back", () => {
    const h = wedge.handle;
    for (const sl of [10, 14, 17]) {
      for (const p of [0, 4, 9]) {
        const v: Values = { slope: sl, push: p };
        assert.ok(Math.abs(h.solve(h.at(v), v) - Math.min(p, settle(v).limit)) < 1e-9, `slope ${sl}, push ${p}`);
      }
    }
  });

  it("splits the log for slopes 16 to 22 only: thinner is all in and not open enough, fatter stalls", () => {
    const outcome = Object.fromEntries(numberSweep(wedge).map((v) => [v.slope, game.judge(v).outcome]));
    for (const sl of steps(slope)) {
      const o = outcome[sl as number];
      if (sl < 16) assert.equal(o, "too-thin", `slope ${sl}`);
      else if (sl <= 22) assert.equal(o, "log-split", `slope ${sl}`);
      else assert.equal(o, "too-fat", `slope ${sl}`);
    }
    assert.equal(game.judge(startValues(wedge)).outcome, "too-fat");
    for (const sl of [16, 19, 22]) assert.ok(split({ slope: sl }).canOpen >= OPEN);
  });

  /** The line the right half has to reach: the target post's inner face, from the scene. */
  const lineOf = (scene: Part[]) => {
    const post = find(scene, "game-mark-post");
    return post.position.x - box(post).width / 2;
  };

  it("misses by at least 3 mm at both extremes, in the numbers and against the line in the picture", () => {
    // Thinnest wedge: all the way in and short of the line by at least 3 mm.
    const thin = split({ slope: 8 });
    assert.equal(thin.kind, "thin");
    assert.ok(OPEN - thin.open >= 3, `slope 8 opens ${thin.open} of ${OPEN}`);
    const scene = game.scene!({ slope: 8, push: 0 });
    for (const [sl, fatOrThin] of [[8, "thin"], [35, "fat"]] as const) {
      const run = game.play({ slope: sl, push: 0 });
      const peak = Math.max(...sample(run).map(({ frame }) => frame.values.push ?? 0));
      const right = find(wedge.build({ slope: sl, push: peak }), "block-right");
      const gap = lineOf(scene) - (right.position.x + box(right).width / 2);
      assert.ok(gap >= 3, `slope ${sl} (${fatOrThin}): the half stops ${gap.toFixed(2)} mm short of the line`);
      assert.ok(Math.abs(gap - (OPEN - settle({ slope: sl, push: peak }).open)) < 1e-6);
    }
  });

  it("puts the one target on a post: a tick at least 10 long, touching the post's inner face, in front of the half and clear of everything that moves", () => {
    for (const sl of [8, 20, 35]) {
      const scene = game.scene!({ slope: sl, push: 0 });
      assert.equal(scene.length, 2);
      const mark = find(scene, "game-mark");
      const post = find(scene, "game-mark-post");
      assert.ok(mark.shape.kind === "box" && post.shape.kind === "box");
      assert.ok(mark.shape.width >= 10, `the tick is ${mark.shape.width} long`);
      assert.equal(mark.parentId, "game-mark-post");
      assert.ok(Math.abs(mark.position.x + mark.shape.width / 2 - lineOf(scene)) < 1e-9, "the tick does not touch the post's inner face");
      assert.ok(Math.abs(mark.position.z - post.position.z) < 1e-9);
      // The post stands on the plate, and tick and post are in front of the halves' faces and under the force arrows, at every pose.
      assert.ok(Math.abs(post.position.y - post.shape.height / 2 - 6) < 1e-9 && mark.position.y < 6 + post.shape.height);
      assert.ok(mark.position.z - mark.shape.depth / 2 > rig.DEPTH / 2, "the tick is in the half");
      assert.ok(post.position.z - post.shape.depth / 2 > rig.DEPTH / 2, "the post is in the half");
      const arrowBottom = 6 + rig.BLOCK_H / 2 - 5;
      assert.ok(6 + post.shape.height < arrowBottom, "the post reaches the force arrows");
      for (const p of [0, 10, 20, 32]) for (const a of wedge.build({ slope: sl, push: p }).filter((q) => /out-arrow/.test(q.id))) assert.ok(a.position.y - 5 > 6 + post.shape.height);
    }
  });

  it("brings the half's outer face exactly to the line on a pass, and the blows stop there", () => {
    const line = lineOf(game.scene!({ slope: 19, push: 0 }));
    for (const sl of [16, 19, 22]) {
      const run = game.play({ slope: sl, push: 0 });
      const peak = Math.max(...sample(run).map(({ frame }) => settle(frame.values).open));
      assert.ok(Math.abs(peak - OPEN) < 1e-6, `slope ${sl}: opened ${peak}`);
      const right = find(wedge.build(run.at(run.durationMs * 0.78).values), "block-right");
      assert.ok(Math.abs(right.position.x + box(right).width / 2 - line) < 1e-6, `slope ${sl}: the face is not on the line`);
      assert.ok(Math.max(...sample(run).map(({ frame }) => frame.values.push ?? 0)) <= split({ slope: sl }).depth + 1e-9, "the wedge went past the split");
    }
  });

  it("plays one clear motion per outcome: the wedge only goes in during the blows, a fat one is then pushed back out once, and the captions follow the pose", () => {
    for (const v of numberSweep(wedge)) {
      const run = game.play(v);
      const r = split(v);
      const frames = sample(run);
      const pushes = frames.map(({ frame }) => frame.values.push ?? 0);
      // The thuds are the blows struck: five, or fewer when the log splits sooner.
      const thuds = (run.cues ?? []).filter((c) => c.kind === "thud").length;
      assert.ok(thuds >= 1 && thuds <= BLOWS && (r.kind === "pass" || thuds === BLOWS), `slope ${v.slope}: ${thuds} blows`);
      // Blow captions: the blow number never goes down, the opening in it is the pose's own, and never goes down either.
      let lastBlow = 0;
      let lastOpen = 0;
      let lastPush = pushes[0]!;
      for (const { frame } of frames) {
        const m = /^Blow (\d+), open/.exec(frame.live);
        if (!m) continue;
        assert.ok(Number(m[1]) >= lastBlow, `slope ${v.slope}: "${frame.live}" counts back`);
        lastBlow = Number(m[1]);
        const shown = openIn(frame.live)!;
        const pose = settle(frame.values).open;
        assert.ok(Math.abs(shown - pose) <= 0.05 + 1e-9 || Math.abs(shown - Math.round(pose)) <= 0.5 + 1e-9, `slope ${v.slope}: "${frame.live}" against a pose open ${pose}`);
        assert.ok(shown >= lastOpen - 1e-9, `slope ${v.slope}: the caption's opening goes ${lastOpen} → ${shown}`);
        lastOpen = shown;
        const p = frame.values.push ?? 0;
        assert.ok(p >= lastPush - 1e-9, `slope ${v.slope}: the wedge came back out during a blow (${lastPush} → ${p})`);
        lastPush = p;
      }
      // The whole run: up to the peak, then (fat only) one fall back out, then still, then back to where it started.
      const peakAt = pushes.indexOf(Math.max(...pushes));
      assert.ok(pushes.slice(0, peakAt + 1).every((p, i, a) => i === 0 || p >= a[i - 1]! - 1e-9), `slope ${v.slope}: not a single rise`);
      const popped = frames.some(({ frame }) => frame.live === "Sprang back out");
      assert.equal(popped, r.kind === "fat", `slope ${v.slope}: only a fat wedge is pushed back out`);
      if (r.kind === "fat") {
        assert.equal((run.cues ?? []).filter((c) => c.kind === "pop").length, 1);
        const after = pushes.slice(peakAt);
        assert.ok(after.every((p, i, a) => i === 0 || p <= a[i - 1]! + 1e-9), `slope ${v.slope}: the wedge rose again after the peak`);
      }
      assert.equal((run.cues ?? []).some((c) => c.kind === "snap"), r.kind === "pass", `slope ${v.slope}: the log splits only on a pass`);
      assert.ok(Math.max(...pushes) <= r.limit + 1e-9, `slope ${v.slope}: the wedge went to ${Math.max(...pushes)}, past its limit ${r.limit}`);
    }
  });

  it("does not say the log is split when it is not: the thin failure is worded as not open enough", () => {
    const thin = game.judge({ slope: 8, push: 0 });
    assert.equal(thin.pass, false);
    assert.ok(!/through|split/i.test(thin.headline), thin.headline);
    assert.ok(/needs|need/.test(thin.detail));
  });

  it("keeps to seven kinds of part at rest and two in the scene (one target and its post)", () => {
    const kinds = (parts: Part[]) => new Set(parts.map((p) => p.name));
    assert.ok(kinds(wedge.build({ slope: 14, push: 10 })).size <= 7, [...kinds(wedge.build({ slope: 14, push: 10 }))].join());
    assert.equal(kinds(game.scene!({ slope: 14, push: 0 })).size, 2);
    assert.equal(BLOW, 120);
  });

  it("passes the generic game and design checks", () => {
    checkGame(wedge);
    checkDesign(wedge);
  });
});
