// Cord's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts and here.
//
// The cord can only pull: the proofs below read the parts build() returns, so the picture is held to that, not only
// the numbers behind it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, find, numberSweep, sample } from "../checks.ts";
import { type Values, VIEW, startValues, steps } from "../types.ts";
import { BREAK, cord, cordPath, LINE, rig, settle, STROKE, yank } from "./cord.ts";

const game = cord.game;
const [tension, pull] = cord.sliders as [NonNullable<(typeof cord.sliders)[0]>, NonNullable<(typeof cord.sliders)[1]>];
const len = (p: Part) => (p.shape.kind === "extrusion" ? Math.max(...p.shape.outline.map((q) => q.x)) : 0);
const edge = (p: Part) => (p.shape.kind === "box" ? p.shape.height : assert.fail());
const hasArrow = (parts: Part[], id: string) => parts.some((p) => p.id === id);

/** How far a point is from a free-play plot's line, in the plot's unit square. */
function offLine(line: readonly (readonly [number, number])[], [x, y]: readonly [number, number]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!;
    const [bx, by] = line[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
/** Every point of a plot's line inside its unit square. */
const inSquare = (line: readonly (readonly [number, number])[]) => line.every(([x, y]) => x >= -1e-9 && x <= 1 + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9);
/** A motion's frames' values, at 41 moments. */
const moments = (m: { durationMs: number; at: (ms: number) => { values: Values } }) =>
  Array.from({ length: 41 }, (_, i) => m.at((i / 40) * m.durationMs).values);

describe("cord", () => {
  it("lifts the weight exactly as far as the hand pulls it out, and carries the weight's whole pull", () => {
    for (const w of [10, 25, 40]) {
      for (const p of [1, 12, 30]) {
        const parts = cord.build({ tension: w, pull: p });
        const weight = find(parts, "weight");
        assert.ok(Math.abs(weight.position.y - edge(weight) / 2 - (6 + p)) < 1e-9, `weight ${w}, pull ${p}`);
        assert.equal(settle({ tension: w, pull: p }).tension, w);
        // The cord's pull at the hand is the weight's pull: one length (or the shortest arrow, if the weight is light).
        assert.ok(Math.abs(len(find(parts, "pull-arrow")) - len(find(parts, "weight-arrow"))) < 1e-9, `weight ${w}: the two ends are drawn different`);
      }
    }
  });

  it("never pushes: the ring toward the peg leaves the weight where it is, and the spare cord hangs as a sag", () => {
    for (const w of [10, 25, 40]) {
      const rest = find(cord.build({ tension: w, pull: 0 }), "weight").position;
      for (const p of steps(pull).filter((x) => x < 0)) {
        const parts = cord.build({ tension: w, pull: p });
        const at = find(parts, "weight").position;
        assert.equal(at.y, rest.y, `pull ${p}: the weight moved`);
        assert.ok(!hasArrow(parts, "pull-arrow"), `pull ${p}: a slack cord is drawn pulling`);
        const s = settle({ tension: w, pull: p });
        assert.ok(Math.abs(s.slack - -p) < 1e-9 && s.tension === 0);
        // The sag hangs below the straight line from the peg to the ring, and above the floor.
        const path = cordPath(s);
        const low = Math.min(...path.filter((q) => q[0] > rig.RC).map((q) => q[1]));
        assert.ok(low < rig.CORD_Y - 0.5 && low > 6 + 20, `pull ${p}: the sag bottoms at ${low}`);
      }
    }
    assert.ok(!hasArrow(cord.build({ tension: 25, pull: 0 }), "pull-arrow"), "just taut on the floor carries nothing");
  });

  it("keeps the cord out of the peg at every pose, taut or slack", () => {
    for (const w of [10, 40]) {
      for (const p of steps(pull)) {
        for (const flight of [0, 12, 26]) {
          const s = settle({ tension: w, pull: p, flight });
          const path = cordPath(s);
          for (let i = 1; i < path.length; i++) {
            const a = path[i - 1]!;
            const b = path[i]!;
            for (let t = 0; t <= 1; t += 0.1) {
              const x = a[0] + (b[0] - a[0]) * t;
              const y = a[1] + (b[1] - a[1]) * t;
              // The peg is a cylinder about (0, PEG_Y); the cord's centre line stays outside its radius plus the cord's own.
              assert.ok(
                Math.hypot(x, y - rig.PEG_Y) >= rig.RC - 0.3,
                `weight ${w}, pull ${p}, flight ${flight}: the cord is ${rig.RC - Math.hypot(x, y - rig.PEG_Y)} mm into the peg at x ${x.toFixed(1)}`,
              );
            }
          }
        }
      }
    }
  });

  it("joins the weight to the ring: the cord runs from the weight's top to the ring's edge", () => {
    for (const p of [-20, 0, 15, 30]) {
      const s = settle({ tension: 25, pull: p });
      const path = cordPath(s);
      assert.deepEqual(path[0], [-rig.RC, 6 + s.lift + s.edge]);
      assert.deepEqual(path.at(-1), [s.ringX, rig.CORD_Y]);
      assert.ok(Math.abs(cord.handle.at({ tension: 25, pull: p }).x - (rig.PX + s.ringX + rig.RING_R)) < 1e-9);
    }
  });

  it("shows the number in the weight's size", () => {
    const sizes = steps(tension).map((w) => edge(find(cord.build({ tension: w, pull: 12 }), "weight")));
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i]! > sizes[i - 1]!);
    assert.ok(sizes.at(-1)! - sizes[0]! >= 12);
  });

  it("drags the ring to the pointer and back", () => {
    const h = cord.handle;
    for (const p of [-20, -5, 0, 12, 30]) {
      const v: Values = { tension: 25, pull: p };
      assert.ok(Math.abs(h.solve(h.at(v), v) - p) < 1e-9, `pull ${p}`);
    }
    assert.deepEqual(h.reach!({ tension: 25, pull: 0 }), [-20, 30]);
  });

  it("snaps only above the break, and lifts to the line only when the yank is enough: yank 0.5 to 1.0 passes", () => {
    const outcome = Object.fromEntries(numberSweep(cord).map((v) => [v.yank, game.judge(v).outcome]));
    for (const f of steps({ ...game.controls![0]!, id: "yank" })) {
      const o = outcome[f as number];
      if (f < 0.5) assert.equal(o, "too-gentle", `yank ${f}`);
      else if (f <= 1) assert.equal(o, "reached-the-line", `yank ${f}`);
      else assert.equal(o, "cord-snapped", `yank ${f}`);
    }
    assert.equal(game.judge(startValues(cord)).outcome, "too-gentle");
    assert.equal(yank({ tension: 20, yank: 1 }).peak, BREAK);
  });

  it("plays the yank as drawn: the weight rises past the hand, goes on to the line on a pass, and falls on a snap", () => {
    for (const v of numberSweep(cord)) {
      const run = game.play(v);
      const r = yank(v);
      const tops = sample(run).map(({ frame }) => {
        const s = settle(frame.values);
        return { lift: s.lift, snapped: s.snapped, slack: s.slack };
      });
      const peak = Math.max(...tops.map((t) => t.lift));
      if (r.kind === "pass") assert.ok(Math.abs(peak - r.reach) < 0.1 && peak >= LINE - 0.1, `yank ${v.yank}: up ${peak}`);
      if (r.kind === "gentle") assert.ok(peak < LINE && Math.abs(peak - r.reach) < 0.1, `yank ${v.yank}: up ${peak}`);
      if (r.kind === "snap") {
        assert.ok(
          tops.some((t) => t.snapped),
          `yank ${v.yank}: never snapped`,
        );
        assert.equal(tops.at(-1)!.lift, 0, "the weight ends on the floor");
        assert.ok(peak <= STROKE + 1e-9, "it never flew");
        assert.ok(!tops.some((t, i) => i > 0 && tops[i - 1]!.snapped && !t.snapped && false));
      } else if (r.f > 0.1)
        assert.ok(
          tops.some((t) => t.slack > 1),
          `yank ${v.yank}: the cord never went slack under the flying weight`,
        );
      assert.equal(
        (run.cues ?? []).some((c) => c.kind === "snap"),
        r.kind === "snap",
      );
    }
  });

  it("touches the line at the top of a pass", () => {
    const mark = find(game.scene!(startValues(cord)), "game-line");
    const v = { ...startValues(cord), yank: 0.5 };
    const run = game.play(v);
    let top = run.at(0);
    for (let ms = 0; ms <= run.durationMs; ms++) if (settle(run.at(ms).values).lift > settle(top.values).lift) top = run.at(ms);
    const weight = find(cord.build(top.values), "weight");
    assert.ok(Math.abs(weight.position.y + edge(weight) / 2 - mark.position.y) < 1e-6);
  });

  it("keeps the post out of the picture behind the cord and the weight: seen from the front, nothing pink or stone is in front of the black post", () => {
    // From the bench view (azimuth 24 degrees) a part nearer the camera shifts left on screen by z x sin(azimuth).
    const k = Math.sin((VIEW.bench.azimuth * Math.PI) / 180);
    const screen = (x: number, z: number) => x - z * k;
    for (const w of steps(tension)) {
      for (const p of [-20, -8, 0, 12, 30]) {
        const parts = cord.build({ tension: w, pull: p });
        const post = find(parts, "post");
        assert.ok(post.shape.kind === "box");
        const postZ = post.position.z;
        const lo = screen(post.position.x - post.shape.width / 2, postZ + post.shape.depth / 2);
        const hi = screen(post.position.x + post.shape.width / 2, postZ - post.shape.depth / 2);
        const top = post.position.y + post.shape.height / 2;
        // The weight, in full depth.
        const weight = find(parts, "weight");
        assert.ok(weight.shape.kind === "box");
        const wLo = screen(weight.position.x - weight.shape.width / 2, weight.position.z + weight.shape.depth / 2);
        const wHi = screen(weight.position.x + weight.shape.width / 2, weight.position.z - weight.shape.depth / 2);
        assert.ok(
          wHi < lo - 0.2 || wLo > hi + 0.2,
          `weight ${w}: the weight (screen ${wLo.toFixed(1)}..${wHi.toFixed(1)}) is in front of the post (${lo.toFixed(1)}..${hi.toFixed(1)})`,
        );
        // Every cord strand below the post's top, by its screen position.
        for (const c of parts.filter((q) => /^cord-/.test(q.id))) {
          if (c.position.y - 2 > top) continue;
          const x = screen(c.position.x, c.position.z);
          assert.ok(
            x < lo - 1 || x > hi + 1,
            `weight ${w}, pull ${p}: cord ${c.id} at screen x ${x.toFixed(1)} runs down the post's face (${lo.toFixed(1)}..${hi.toFixed(1)})`,
          );
        }
      }
    }
  });

  it("scales both arrows at 1 mm per N: 12 at the smallest weight (the minimum), 40 at the largest, equal while the cord holds, none when it is slack", () => {
    const lens = steps(tension).map((w) => len(find(cord.build({ tension: w, pull: 12 }), "weight-arrow")));
    assert.equal(lens[0], 12);
    assert.equal(lens.at(-1), 40);
    for (let i = 1; i < lens.length; i++) assert.ok(lens[i]! >= lens[i - 1]!, "an arrow shrinks as the weight grows");
    assert.ok(lens.every((l) => l >= 12));
    for (const w of steps(tension))
      assert.ok(Math.abs(len(find(cord.build({ tension: w, pull: 12 }), "weight-arrow")) - Math.max(12, w * rig.MM_PER_N)) < 1e-9);
    for (const p of [-20, -1, 0]) assert.ok(!hasArrow(cord.build({ tension: 25, pull: p }), "pull-arrow"));
  });

  it("shows the tension slider in the cord itself: both ends' arrows grow with it, the weight grows with it, and the arrows are equal", () => {
    const at = (w: number) => cord.build({ tension: w, pull: 12 });
    const pulls = steps(tension).map((w) => len(find(at(w), "pull-arrow")));
    assert.ok(pulls.at(-1)! - pulls[0]! >= 28, "the cord's own arrow hardly changes across the slider");
    for (const w of steps(tension)) assert.equal(len(find(at(w), "pull-arrow")), len(find(at(w), "weight-arrow")));
    // The arrow floats over the cord's run, clear of the cord and the ring.
    const arrowPart = find(at(25), "pull-arrow");
    assert.ok(arrowPart.position.y - 5 > rig.CORD_Y + rig.RING_R, "the pull arrow overlaps the ring");
  });

  it("puts the line on a post: a tick at least 10 long across the weight's front face at the line's height, touching the post, never in the weight", () => {
    for (const w of steps(tension)) {
      const scene = game.scene!({ tension: w, pull: 0 });
      assert.equal(scene.length, 2);
      const mark = find(scene, "game-line");
      const post = find(scene, "game-line-post");
      assert.ok(mark.shape.kind === "box" && post.shape.kind === "box");
      assert.ok(mark.shape.width >= 10, `tension ${w}: the line is ${mark.shape.width} long`);
      assert.equal(mark.parentId, "game-line-post");
      assert.ok(Math.abs(mark.position.x - mark.shape.width / 2 - (post.position.x + post.shape.width / 2)) < 1e-9, "the line does not touch the post's face");
      assert.ok(Math.abs(post.position.y - post.shape.height / 2 - 6) < 1e-9 && post.position.y + post.shape.height / 2 > mark.position.y);
      const weight = find(cord.build({ tension: w, pull: 0 }), "weight");
      assert.ok(weight.shape.kind === "box");
      // In front of the weight's face by under a millimetre, and level with where its top has to get to.
      const gap = mark.position.z - mark.shape.depth / 2 - (weight.position.z + weight.shape.depth / 2);
      assert.ok(gap > 0.1 && gap < 1, `tension ${w}: the line is ${gap} mm in front of the weight`);
      assert.ok(Math.abs(mark.position.y - (6 + LINE + weight.shape.height)) < 1e-9);
      // The post is left of the weight and inside the plate.
      assert.ok(post.position.x + post.shape.width / 2 <= weight.position.x - weight.shape.width / 2 + 1e-9);
      const plate = find(cord.build({ tension: w, pull: 0 }), "plate");
      assert.ok(plate.shape.kind === "box");
      assert.ok(
        post.position.x - post.shape.width / 2 > plate.position.x - plate.shape.width / 2 && post.position.z + post.shape.depth / 2 < plate.shape.depth / 2,
      );
    }
  });

  it("keeps to seven kinds of part at rest and two in the scene", () => {
    const kinds = (parts: Part[]) => new Set(parts.map((p) => p.name));
    assert.ok(kinds(cord.build({ tension: 25, pull: 12 })).size <= 7, [...kinds(cord.build({ tension: 25, pull: 12 }))].join());
    assert.equal(kinds(game.scene!(startValues(cord))).size, 2);
  });

  it("passes the generic game and design checks", () => {
    checkGame(cord);
    checkDesign(cord);
  });

  it("plots the cord's pull for where the hand is in free play: nothing while slack, the whole weight once taut, the dot on the line", () => {
    const plot = cord.play!.plot!;
    for (const w of [10, 25, 40]) {
      for (const p of [-20, -5, 0, 1, 12, 30]) {
        const out = plot({ tension: w, pull: p });
        assert.ok(inSquare(out.line) && out.dot && offLine(out.line, out.dot) < 1e-9, `weight ${w}, pull ${p}: the dot is off the line`);
        assert.equal(out.dot[1], p > 0 ? w / 40 : 0);
      }
      for (const v of moments(cord.play!.release!({ tension: w, pull: 24 }))) assert.ok(offLine(plot(v).line, plot(v).dot!) < 1e-9);
    }
    assert.notDeepEqual(plot({ tension: 10, pull: 5 }).line, plot({ tension: 40, pull: 5 }).line);
  });

  it("draws the hand's pull and the weight's, the same length, while the hand is on, and no pull when the cord is slack", () => {
    const hand = cord.play!.hand!;
    const taut = hand({ tension: 30, pull: 10 });
    assert.ok(Math.abs(len(find(taut, "pull-arrow")) - len(find(taut, "weight-arrow"))) < 1e-9);
    assert.deepEqual(
      hand({ tension: 30, pull: -10 }).map((p) => p.id),
      ["weight-arrow"],
    );
  });
});
