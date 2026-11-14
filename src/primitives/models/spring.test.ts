// Spring's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../../shared/kit.ts";
import { numberSweep, sample, startOf, steps } from "../checks.ts";
import { PLATE_TOP } from "../parts.ts";
import type { Values } from "../types.ts";
import { BIND, geometry, HAND, launch, NEED, settle, spring } from "./spring.ts";

const game = spring.game!;
const [stiffness, force] = spring.sliders as [NonNullable<(typeof spring.sliders)[0]>, NonNullable<(typeof spring.sliders)[1]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const discBottom = (parts: Part[]) => {
  const d = find(parts, "disc");
  return d.position.y - 2;
};

/** An extrusion's x and y extent in the world (the stands here are unrotated). */
const extent = (p: Part) => {
  assert.ok(p.shape.kind === "extrusion");
  const xs = p.shape.outline.map((o) => o.x);
  const ys = p.shape.outline.map((o) => o.y);
  return { x0: p.position.x + Math.min(...xs), x1: p.position.x + Math.max(...xs), y0: p.position.y + Math.min(...ys), y1: p.position.y + Math.max(...ys), depth: p.shape.depth };
};

describe("spring", () => {
  it("is five kinds of part at rest and the game's scene is two: one slim stand and the bell", () => {
    for (const k of [1, 2.5, 4]) assert.equal(new Set(spring.build({ stiffness: k, force: 30 }).map((p) => p.name)).size, 5);
    const scene = game.scene!({ stiffness: 2, force: 0 });
    assert.deepEqual(scene.map((p) => p.id), ["game-bell-stand", "game-bell"], "a stand and a bell: two parts, two kinds");
    assert.equal(new Set(scene.map((p) => p.name)).size, 2);
  });

  it("hangs the bell from one slim, low stand, so the coil is what stands out", () => {
    const scene = game.scene!({ stiffness: 2, force: 0 });
    const stand = extent(find(scene, "game-bell-stand"));
    const bell = find(scene, "game-bell");
    assert.ok(bell.shape.kind === "lathe");
    const bellTop = bell.position.y + (Math.max(...bell.shape.profile.map((q) => q.y)) - Math.min(...bell.shape.profile.map((q) => q.y))) / 2;
    // The bell hangs from the arm's underside.
    assert.ok(Math.abs(bellTop - (geometry.BELL_MOUTH + geometry.BELL_H)) < 1e-9);
    assert.ok(Math.abs(stand.y1 - (bellTop + geometry.SLIM)) < 1e-9, "the arm sits on the bell's top");
    assert.ok(stand.depth <= 6 + 1e-9, "slim");
    assert.ok(stand.y1 <= 110, `the stand is ${stand.y1} tall; the spring's own top is ${PLATE_TOP + geometry.FREE + 4}`);
    // The post is slim and well clear of the puck's path and of the plate's edge.
    const post = stand.x1 - geometry.SLIM;
    assert.ok(Math.abs(stand.x1 - (geometry.BELL_POST_X + geometry.SLIM / 2)) < 1e-9);
    assert.ok(post > geometry.CX + 8 + 8, "clear of the puck");
    const base = find(spring.build({ stiffness: 2, force: 0 }), "plate");
    assert.ok(base.shape.kind === "box" && stand.x1 < base.shape.width / 2, "the post stands on the plate");
    // The arm reaches over the bell's axis.
    assert.ok(stand.x0 < geometry.CX);
  });

  it("holds the free-length tick on a slim post: at least 10 long, level with the plate's free underside", () => {
    const m = extent(find(spring.build({ stiffness: 2, force: 30 }), "tick-free"));
    const arm = geometry.TICK_END - (geometry.MARK_POST_X + geometry.SLIM / 2);
    assert.ok(arm >= 10 - 1e-9, `tick ${arm} long`);
    assert.ok(Math.abs(m.y0 - PLATE_TOP) < 1e-9, "the post stands on the plate");
    assert.ok(Math.abs(m.y1 - (PLATE_TOP + geometry.FREE + 1.5)) < 1e-9 && Math.abs(m.x1 - geometry.TICK_END) < 1e-9);
    assert.ok(Math.abs(m.x1 - (geometry.CX - 15 - 2)) < 1e-9, "the tick stops 2 mm short of the plate's rim");
    for (const k of steps(stiffness)) {
      const disc = find(spring.build({ stiffness: k, force: 0 }), "disc");
      assert.ok(Math.abs(disc.position.y - 2 - (PLATE_TOP + geometry.FREE)) < 1e-9, "free-length underside is at the tick's middle");
    }
  });

  it("puts the push arrow in front of the plate, over its near half, clear of the puck and the tick", () => {
    const a = find(spring.build({ stiffness: 2, force: 30 }), "push-arrow");
    assert.equal(a.position.z, geometry.ARROW_Z);
    assert.ok(a.position.z - 2 >= 8, "outside the puck's radius");
    assert.ok(Math.hypot(a.position.x - geometry.CX, a.position.z) < 15, "over the plate's face");
  });

  it("sits where Hooke's law puts it, and never past the coils touching", () => {
    for (const k of steps(stiffness)) {
      for (const f of steps(force)) {
        const parts = spring.build({ stiffness: k, force: f });
        const coil = find(parts, "coil");
        assert.ok(coil.shape.kind === "helix");
        const x = Math.min(f / k, BIND);
        assert.ok(Math.abs(coil.shape.length - (geometry.FREE - x)) < 1e-9, `coil at k ${k}, F ${f}`);
        assert.ok(Math.abs(discBottom(parts) - (6 + geometry.FREE - x)) < 1e-9, `the plate rests on the coil at k ${k}, F ${f}`);
      }
    }
  });

  it("goes solid exactly at the bind: every turn touching, and open gaps at free length", () => {
    for (const k of steps(stiffness)) {
      const solid = find(spring.build({ stiffness: k, force: 50 * 4 }), "coil");
      const free = find(spring.build({ stiffness: k, force: 0 }), "coil");
      assert.ok(solid.shape.kind === "helix" && free.shape.kind === "helix");
      const d = 2 * solid.shape.tube;
      if (HAND / k >= BIND) {
        const pitch = (solid.shape.length - d) / solid.shape.turns;
        assert.ok(Math.abs(pitch - d) < 1e-6, `k ${k}: pitch ${pitch} at the bind, wire ${d}`);
      }
      assert.ok((free.shape.length - d) / free.shape.turns > d + 2, `k ${k}: gaps at free length`);
    }
  });

  it("shows stiffness in the wire: thicker wire and fewer turns as k rises", () => {
    const coils = steps(stiffness).map((k) => find(spring.build({ stiffness: k, force: 0 }), "coil")).map((c) => (c.shape.kind === "helix" ? c.shape : assert.fail()));
    for (let i = 1; i < coils.length; i++) {
      assert.ok(coils[i]!.tube > coils[i - 1]!.tube, "wire thickens");
      assert.ok(coils[i]!.turns < coils[i - 1]!.turns, "turns fall");
    }
    assert.ok(coils[0]!.turns - coils.at(-1)!.turns > 2, "at least two turns fewer across the range");
  });

  it("draws no push arrow at 0 N and a readable one for any push", () => {
    assert.equal(spring.build({ stiffness: 2, force: 0 }).filter((p) => p.id === "push-arrow").length, 0);
    assert.equal(spring.build({ stiffness: 2, force: 1 }).filter((p) => p.id === "push-arrow").length, 1);
  });

  it("reads the stored energy from the same squeeze it draws", () => {
    for (const k of [1, 2, 3.5]) {
      const v = { stiffness: k, force: 30 };
      const s = settle(v);
      assert.ok(Math.abs(s.energy - (0.5 * k * s.squeeze ** 2) / 1000) < 1e-12);
      assert.match(spring.readouts(v)[2]!.value, new RegExp(s.energy.toFixed(2).replace(".", "\\.")));
    }
  });

  it("launches best at a middle stiffness: the stiffest spring fails, and so does the softest", () => {
    const pass = steps(stiffness).filter((k) => game.judge({ ...startOf(spring), stiffness: k }).pass);
    assert.deepEqual(pass, [1.8, 1.9, 2, 2.1, 2.2]);
    assert.equal(game.judge({ stiffness: 4, force: 0 }).outcome, "too-stiff");
    assert.equal(game.judge({ stiffness: 1, force: 0 }).outcome, "too-soft");
    for (const k of pass) assert.ok(launch({ stiffness: k }).energy >= NEED);
  });

  it("drags only as far as the push can move the plate", () => {
    const h = spring.handle!;
    for (const k of [1, 2, 4]) {
      const v: Values = { stiffness: k, force: 20 };
      assert.deepEqual(h.reach!(v), [0, Math.min(50, k * BIND)]);
      const at = h.at(v);
      assert.ok(Math.abs(h.solve(at, v) - 20) < 1e-9, "solve undoes at");
    }
  });

  it("never sinks the puck into the plate or lifts it through the bell, and the bell is reached only on a pass", () => {
    for (const v of numberSweep(spring)) {
      const run = game.play(v);
      let reached = 0;
      for (const { ms, frame } of sample(run).filter(({ frame }) => frame.marks?.length)) {
        const puck = find(frame.marks ?? [], "mark-puck");
        const bottom = puck.position.y - geometry.PUCK_H / 2;
        const top = bottom + geometry.PUCK_H;
        const plateTop = discBottom(spring.build(frame.values)) + 4;
        assert.ok(bottom >= plateTop - 1e-6, `puck ${(plateTop - bottom).toFixed(3)} mm into the plate at ${ms} ms, k ${v.stiffness}`);
        assert.ok(top <= geometry.BELL_MOUTH + 1e-6, `puck through the bell at ${ms} ms, k ${v.stiffness}`);
        reached = Math.max(reached, top);
      }
      const ring = run.cues?.find((c) => c.kind === "ring");
      if (run.verdict.pass) {
        assert.ok(ring, `k ${v.stiffness} passes, so the bell rings`);
        const at = find(run.at(ring.ms).marks ?? [], "mark-puck");
        assert.ok(Math.abs(at.position.y + geometry.PUCK_H / 2 - geometry.BELL_MOUTH) < 0.05, "the puck touches the bell when it rings");
      } else {
        assert.equal(ring, undefined);
        // Height goes as energy, so a near miss (k 2.3 stores 1% too little) stops a fraction of a millimetre short; the caption says by how much.
        assert.ok(reached < geometry.BELL_MOUTH - 0.1, `k ${v.stiffness} fails, so the puck stops short of the bell`);
      }
    }
  });

  it("lets the plate ring past its free length after the release, and settles before the hold", () => {
    const run = game.play({ stiffness: 2, force: 0 });
    const lengths = sample(run).map(({ frame }) => settle(frame.values).length);
    assert.ok(Math.max(...lengths) > geometry.FREE + 3, "overshoots free length");
    assert.equal(settle(run.at(run.durationMs).values).length, settle({ stiffness: 2, force: 0 }).length);
  });
});
