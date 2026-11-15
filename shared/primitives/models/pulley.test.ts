// Pulley's own tests. The generic game and design checks (checks.ts) also run for it in library.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../kit.ts";
import { checkDesign, checkGame, numberSweep, sample } from "../checks.ts";
import { steps } from "../types.ts";
import { ARROW_PER_N, cordLength, geometry, HAND, hoist, LOAD, pulley, RISE, ROPE, settle } from "./pulley.ts";

const game = pulley.game!;
const [strands, pull] = pulley.sliders as [NonNullable<(typeof pulley.sliders)[0]>, NonNullable<(typeof pulley.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);

/** A box part's extent in x and y (the parts here are unrotated except the cord bars and rings, which are handled apart). */
const boxOf = (p: Part) => {
  assert.ok(p.shape.kind === "box");
  return { x0: p.position.x - p.shape.width / 2, x1: p.position.x + p.shape.width / 2, y0: p.position.y - p.shape.height / 2, y1: p.position.y + p.shape.height / 2 };
};

describe("pulley", () => {
  it("passes the generic game and design checks", () => {
    checkGame(pulley);
    checkDesign(pulley);
  });

  it("keeps to the simple-first budget: nine kinds of part at rest with the two arrows, one in the game", () => {
    for (const n of steps(strands)) {
      const kinds = new Set(pulley.build({ strands: n, pull: 10 }).map((p) => p.name));
      assert.ok(kinds.size <= 9, [...kinds].join(", "));
      assert.equal(kinds.size, 9, [...kinds].join(", "));
    }
    assert.equal(game.scene!({ strands: 3, pull: 10 }).length, 1);
  });

  /** An arrow's length, and where its tip and tail are (the arrows here point straight down). */
  const arrowOf = (parts: Part[], id: string) => {
    const a = find(parts, id);
    assert.ok(a.shape.kind === "extrusion");
    const len = Math.max(...a.shape.outline.map((o) => o.x)) - Math.min(...a.shape.outline.map((o) => o.x));
    assert.ok(Math.abs(a.rotation.z + 90) < 1e-9, "points down");
    return { len, tip: a.position.y - len / 2, tail: a.position.y + len / 2, x: a.position.x, z: a.position.z, depth: a.shape.depth };
  };

  it("draws the load's weight and the pull on the hauling end at one scale: the pull arrow is the weight's over the strands", () => {
    for (const n of steps(strands)) {
      for (const p of [0, 20, 50]) {
        const parts = pulley.build({ strands: n, pull: p });
        const w = arrowOf(parts, "weight-arrow");
        const h = arrowOf(parts, "pull-arrow");
        assert.ok(Math.abs(w.len - LOAD * ARROW_PER_N) < 1e-9, "weight arrow");
        assert.ok(Math.abs(h.len - (LOAD / n) * ARROW_PER_N) < 1e-9, `${n} strands: pull arrow ${h.len}`);
        assert.ok(Math.abs(h.len * n - w.len) < 1e-9, "pull × strands = weight, in arrow length");
        assert.ok(h.len >= 12 - 1e-9, "never under the shortest arrow");
      }
    }
    const lens = steps(strands).map((n) => arrowOf(pulley.build({ strands: n, pull: 0 }), "pull-arrow").len);
    assert.ok(lens.every((l, i) => i === 0 || l < lens[i - 1]! - 1), `the pull arrow shrinks as strands go up: ${lens}`);
    assert.ok(Math.abs(lens.at(-1)! - 12) < 1e-9, "and is exactly the shortest arrow at 5 strands, so none is stretched");
  });

  it("keeps both arrows clear of every other part: above the load in front of the block, beside the ring and the cord", () => {
    for (const n of steps(strands)) {
      for (const p of steps(pull)) {
        const parts = pulley.build({ strands: n, pull: p });
        const load = boxOf(find(parts, "load"));
        const w = arrowOf(parts, "weight-arrow");
        assert.ok(Math.abs(w.tip - (load.y1 + 4)) < 1e-9, "the weight arrow's tip is 4 above the load");
        assert.ok(Math.abs(w.x - find(parts, "load").position.x) < 1e-9, "over the load");
        // In front of the block (z up to -2.6) and every cord (z up to 2): nothing else reaches the arrow's z.
        assert.ok(w.z - w.depth / 2 > 2 + 1e-9, "in front of the cords");
        const h = arrowOf(parts, "pull-arrow");
        const ring = find(parts, "handle").position;
        assert.ok(Math.abs(h.tip - (ring.y + 6 + 4)) < 1e-9, "tip just above the ring");
        assert.ok(h.x - 5 >= ring.x + 2 + 1e-9, "beside the hauling cord, not on it");
        assert.ok(h.tip >= ring.y + 8, "the arrow stops above the ring");
      }
    }
  });

  it("marks the target with a tick at least 10 long that sticks out of the stand's post, level with the load's final top", () => {
    for (const n of steps(strands)) {
      const mark = find(game.scene!({ strands: n, pull: 0 }), "game-mark");
      assert.equal(mark.parentId, "stand", "held by the post");
      const m = boxOf(mark);
      const stand = find(pulley.build({ strands: n, pull: 0 }), "stand");
      assert.ok(stand.shape.kind === "extrusion");
      const postRight = stand.position.x + Math.min(...stand.shape.outline.map((o) => o.x)) + 10;
      assert.ok(m.x1 - m.x0 >= 10 - 1e-9, "at least 10 mm long");
      assert.ok(Math.abs(m.x0 - postRight) < 1e-9, "starting at the post's face");
      assert.ok(Math.abs(m.y1 - (6 + geometry.EDGE + RISE)) < 1e-9, "its top is where the load's top must come");
      // Clear of the moving block and the load wherever they are.
      for (const p of steps(pull)) for (const id of ["block", "load"]) {
        const b = boxOf(find(pulley.build({ strands: n, pull: p }), id));
        assert.ok(m.x1 <= b.x0 + 1e-9 || m.x0 >= b.x1 || m.y1 <= b.y0 || m.y0 >= b.y1, `${n} strands, pull ${p}: the tick meets the ${id}`);
      }
    }
  });

  it("draws exactly as many strands holding the load as the slider says, and a pink cord", () => {
    for (const n of steps(strands)) {
      const parts = pulley.build({ strands: n, pull: 20 });
      const runs = parts.filter((p) => p.id.startsWith("cord-"));
      assert.equal(runs.length, n + 1, `${n} supporting strands and the hauling end`);
      for (const c of runs) assert.equal(c.color, "#ff0087");
      assert.equal(parts.filter((p) => p.id.startsWith("wheel-")).length, n);
      assert.ok(parts.filter((p) => p.id.startsWith("wheel-")).every((p) => p.color === "#a9adb3"), "wheels are steel");
    }
  });

  it("keeps the cord the same length at every pull: what the strands lose, the hauling end gains", () => {
    for (const n of steps(strands)) {
      const base = cordLength({ strands: n, pull: 0 });
      for (const p of steps(pull)) assert.ok(Math.abs(cordLength({ strands: n, pull: p }) - base) < 1e-9, `${n} strands, pull ${p}`);
    }
  });

  it("raises the load by the pull over the strands, from the plate, with the block resting on it", () => {
    for (const n of steps(strands)) {
      for (const p of [0, 7, 20, 50]) {
        const parts = pulley.build({ strands: n, pull: p });
        const load = boxOf(find(parts, "load"));
        const block = boxOf(find(parts, "block"));
        assert.ok(Math.abs(load.y0 - (6 + p / n)) < 1e-9, `${n} strands, pull ${p}: the load is ${load.y0 - 6} up`);
        assert.ok(Math.abs(block.y0 - load.y1) < 1e-9, "the block sits on the load");
      }
    }
  });

  it("keeps the hauling end clear of the load and the blocks at every strand count and every pull", () => {
    for (const n of steps(strands)) {
      for (const p of steps(pull)) {
        const parts = pulley.build({ strands: n, pull: p });
        const ring = find(parts, "handle").position;
        const rx0 = ring.x - 8;
        const rx1 = ring.x + 8;
        const ry0 = ring.y - 8;
        const ry1 = ring.y + 8;
        for (const id of ["load", "block"]) {
          const b = boxOf(find(parts, id));
          const apart = rx0 >= b.x1 || rx1 <= b.x0 || ry0 >= b.y1 || ry1 <= b.y0;
          assert.ok(apart, `${n} strands, pull ${p}: the ring touches the ${id}`);
        }
        const hauling = find(parts, `cord-${n}`);
        assert.ok(Math.abs(hauling.position.x - ring.x) < 1e-9);
        for (const id of ["load", "block"]) {
          const b = boxOf(find(parts, id));
          assert.ok(hauling.position.x - 2 >= b.x1 || hauling.position.x + 2 <= b.x0, `${n} strands, pull ${p}: the hauling cord passes the ${id}`);
        }
        assert.ok(ring.y - 8 >= 6, "the ring stays above the plate");
      }
    }
  });

  it("keeps the moving block clear of the fixed wheels at every pose", () => {
    for (const n of steps(strands)) for (const p of steps(pull)) {
      const parts = pulley.build({ strands: n, pull: p });
      const block = boxOf(find(parts, "block"));
      assert.ok(block.y1 + 2 <= geometry.Y_FIXED - geometry.WHEEL_R + 40, "room above the block");
      assert.ok(block.y1 < geometry.Y_FIXED - geometry.WHEEL_R, `${n} strands, pull ${p}: the block reaches the fixed wheels`);
    }
  });

  it("reads its numbers from the pose it draws", () => {
    for (const n of steps(strands)) {
      const v = { strands: n, pull: 20 };
      assert.match(pulley.readouts(v)[0]!.value, new RegExp(`= ${(LOAD / n).toFixed(1).replace(".", "\\.")} N`));
      assert.match(pulley.readouts(v)[1]!.value, new RegExp(`up ${(20 / n).toFixed(1).replace(".", "\\.")} mm`));
    }
  });

  it("works with 3 strands only: fewer are too heavy, more run out of cord", () => {
    const outcomes = Object.fromEntries(numberSweep(pulley).map((v) => [v.strands, game.judge(v).outcome]));
    assert.deepEqual(outcomes, { 1: "too-heavy", 2: "too-heavy", 3: "crate-raised", 4: "out-of-cord", 5: "out-of-cord" });
    assert.ok(LOAD / 3 <= HAND && 3 * RISE <= ROPE && 4 * RISE > ROPE);
  });

  it("raises the crate to the mark exactly on a pass, and stops short when the cord runs out", () => {
    for (const v of numberSweep(pulley)) {
      const run = game.play(v);
      let highest = 0;
      for (const { frame } of sample(run)) {
        const parts = [...pulley.build(frame.values), ...game.scene!(frame.values)];
        highest = Math.max(highest, boxOf(find(parts, "load")).y1);
      }
      const mark = boxOf(find(game.scene!(v), "game-mark")).y1;
      const r = hoist(v);
      if (r.kind === "pass") assert.ok(Math.abs(highest - mark) < 1e-6, `${v.strands} strands: the top ends ${highest - mark} from the mark`);
      else assert.ok(highest < mark - 0.5 || r.kind === "heavy", `${v.strands} strands stops short`);
      if (r.kind === "heavy") assert.ok(highest - (6 + geometry.EDGE) < 2, "a load too heavy hardly moves");
    }
    assert.ok(settle({ strands: 2 }).n === 2);
  });

  it("only lets the drag go as far as the hand and the cord allow", () => {
    assert.deepEqual(pulley.handle!.reach!({ strands: 3, pull: 0 }), [0, 35]);
    assert.deepEqual(pulley.handle!.reach!({ strands: 2, pull: 0 }), [0, 3]);
    const h = pulley.handle!;
    for (const p of [0, 12, 33]) assert.ok(Math.abs(h.solve(h.at({ strands: 3, pull: p }), { strands: 3, pull: p }) - p) < 1e-9);
  });
});
