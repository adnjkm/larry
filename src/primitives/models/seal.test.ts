// Seal's own tests. The generic game and design checks (checks.ts) run for it in library.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../../../shared/kit.ts";
import { checkGame, sample, startOf, steps } from "../checks.ts";
import { COLOR, PLATE_TOP } from "../parts.ts";
import { geometry, seal, settle, SPLIT, T0, WEEP } from "./seal.ts";

const game = seal.game!;
const [squeeze] = seal.sliders as [NonNullable<(typeof seal.sliders)[0]>];
const find = (parts: Part[], id: string) => parts.find((p) => p.id === id) ?? assert.fail(`no part ${id}`);
const outerOf = (p: Part) => {
  assert.ok(p.shape.kind === "lathe");
  return Math.max(...p.shape.profile.map((q) => q.r));
};
const heightOf = (p: Part) => {
  assert.ok(p.shape.kind === "lathe");
  const ys = p.shape.profile.map((q) => q.y);
  return Math.max(...ys) - Math.min(...ys);
};

describe("seal", () => {
  it("passes the generic game checks", () => checkGame(seal));

  it("keeps the rubber's volume: π (R² − r²) t is the same at every squeeze", () => {
    const vol = (s: number) => {
      const g = find(seal.build({ squeeze: s }), "gasket");
      return Math.PI * (outerOf(g) ** 2 - geometry.BORE_R ** 2) * heightOf(g);
    };
    const v0 = vol(0);
    for (const s of steps(squeeze)) assert.ok(Math.abs(vol(s) - v0) < 1e-6, `squeeze ${s}`);
    assert.ok(Math.abs(Math.PI * (geometry.GASKET_R0 ** 2 - geometry.BORE_R ** 2) * T0 - v0) < 1e-6);
  });

  it("reaches the flange's edge at 30% and is squeezed out past it beyond that", () => {
    assert.ok(Math.abs(outerOf(find(seal.build({ squeeze: SPLIT }), "gasket")) - geometry.FLANGE_R) < 1e-9);
    for (const s of steps(squeeze)) {
      const out = outerOf(find(seal.build({ squeeze: s }), "gasket"));
      if (s <= SPLIT + 1e-9) assert.ok(out <= geometry.FLANGE_R + 1e-9, `inside the flange at ${s}`);
      else assert.ok(out > geometry.FLANGE_R + 0.2, `a lip at ${s}`);
    }
    assert.ok(settle({ squeeze: 0.4 }).lip > 2.5);
  });

  it("stacks the flange, the gasket and the lid with no gap and no overlap, the handle on the lid", () => {
    for (const s of steps(squeeze)) {
      const parts = seal.build({ squeeze: s });
      const g = find(parts, "gasket");
      const lid = find(parts, "lid");
      const h = find(parts, "handle");
      assert.ok(lid.shape.kind === "lathe");
      assert.ok(Math.abs(g.position.y - heightOf(g) / 2 - geometry.GASKET_Y) < 1e-9, `gasket on the flange at ${s}`);
      assert.ok(Math.abs(g.position.y + heightOf(g) / 2 - (lid.position.y - geometry.LID_T / 2)) < 1e-9, `lid on the gasket at ${s}`);
      assert.ok(Math.abs(h.position.y - geometry.HANDLE_T / 2 - (lid.position.y + geometry.LID_T / 2)) < 1e-9, `handle on the lid at ${s}`);
      assert.ok(Math.abs(heightOf(g) - T0 * (1 - s)) < 1e-9);
    }
  });

  it("weeps only under 15%, with more drops the wider the gaps, and none through the plate", () => {
    const count = (s: number) => seal.build({ squeeze: s }).filter((p) => p.id.startsWith("drop-")).length;
    for (const s of steps(squeeze)) assert.equal(count(s) > 0, s < WEEP - 1e-9, `drops at ${s}`);
    assert.equal(count(0), 3);
    assert.ok(count(0.14) === 1);
    // A run starts its drops one at a time (drop k when drip reaches k ÷ n) and hides them while the pressure climbs (drip < 0).
    const at = (drip: number) => seal.build({ squeeze: 0, drip }).filter((q) => q.id.startsWith("drop-")).length;
    assert.deepEqual([-0.5, 0, 0.34, 0.67, 1.4, 3.7].map(at), [0, 1, 2, 3, 3, 3]);
    for (const drip of [0, 0.4, 0.99, 3.7]) {
      for (const p of seal.build({ squeeze: 0, drip }).filter((q) => q.id.startsWith("drop-"))) {
        assert.ok(p.position.y - geometry.DROP_R >= PLATE_TOP - 1e-9 && p.position.y <= geometry.GASKET_Y + geometry.FLANGE_T, `drop at y ${p.position.y}`);
        assert.ok(p.position.x - geometry.DROP_R > geometry.FLANGE_R, "clear of the flange");
      }
    }
  });

  it("passes only between 15% and 30%, and the start weeps", () => {
    const pass = steps(squeeze).filter((s) => game.judge({ squeeze: s }).pass);
    assert.equal(pass[0], WEEP);
    assert.equal(pass.at(-1), SPLIT);
    assert.equal(game.judge(startOf(seal)).outcome, "weeping");
    assert.equal(game.judge({ squeeze: 0.4 }).outcome, "rubber-split");
  });

  it("shows each failure as its own motion: drips cue the weep, spray and a pop the split, nothing for a dry joint", () => {
    const cues = (s: number) => (game.play({ squeeze: s }).cues ?? []).map((c) => c.kind);
    assert.ok(cues(0.05).length > 3 && cues(0.05).every((k) => k === "drip"));
    assert.deepEqual(cues(0.4), ["pop"]);
    assert.deepEqual(cues(0.2), ["click"]);
    const sprayAt = (s: number) => {
      const run = game.play({ squeeze: s });
      return Math.max(...sample(run).map(({ frame }) => (frame.marks ?? []).length));
    };
    assert.equal(sprayAt(0.4), 4);
    assert.equal(sprayAt(0.2), 0);
    for (const { frame } of sample(game.play({ squeeze: 0.4 }))) for (const m of frame.marks ?? []) assert.ok(m.position.y - geometry.DROP_R >= PLATE_TOP - 1e-9, "spray stays above the plate");
  });

  it("keeps drops slate and the lid a mid grey: only the handle is light", () => {
    for (const s of steps(squeeze)) {
      const parts = seal.build({ squeeze: s });
      assert.deepEqual(parts.filter((p) => p.color === COLOR.light).map((p) => p.id), ["handle"]);
      const lid = find(parts, "lid");
      assert.ok(lid.finish !== "metal" && lid.color !== COLOR.light, "the lid is not the metal finish that renders near-white");
      for (const d of parts.filter((p) => p.id.startsWith("drop-"))) assert.equal(d.color, COLOR.slate);
    }
    for (const { frame } of sample(game.play({ squeeze: 0.4 }))) for (const m of frame.marks ?? []) assert.equal(m.color, COLOR.slate);
  });

  describe("a run tells the story in order", () => {
    const caption = (s: number) => sample(game.play({ squeeze: s })).map(({ ms, frame }) => ({ ms, frame }));
    const thick = (values: Record<string, number>) => {
      const g = find(seal.build(values), "gasket");
      return heightOf(g);
    };

    it("starts at the set squeeze, backs the lid off, screws it down to exactly the squeeze the number implies, and holds it there", () => {
      for (const s of [0.05, 0.2, 0.4]) {
        const run = game.play({ squeeze: s });
        const frames = caption(s);
        assert.equal(frames[0]!.frame.values.squeeze, s, "frame 0 is the pose that was set");
        const sq = frames.map((f) => f.frame.values.squeeze!);
        const low = sq.indexOf(Math.min(...sq));
        assert.ok(Math.min(...sq) < 0.005, "the lid is backed right off");
        // Down monotonically to the low point, then up monotonically to s and stays.
        for (let i = 1; i <= low; i++) assert.ok(sq[i]! <= sq[i - 1]! + 1e-9, `backing off at ${frames[i]!.ms} ms`);
        const top = sq.findIndex((q, i) => i > low && Math.abs(q - s) < 1e-9);
        for (let i = low + 1; i <= top; i++) assert.ok(sq[i]! >= sq[i - 1]! - 1e-9, `twisting at ${frames[i]!.ms} ms`);
        for (let i = top; i < sq.length; i++) assert.ok(Math.abs(sq[i]! - s) < 1e-9, `squeeze holds from ${frames[top]!.ms} ms`);
        // The gasket the picture shows is the thickness the number implies, in every frame.
        for (const { frame } of frames) assert.ok(Math.abs(thick(frame.values) - T0 * (1 - Math.round(frame.values.squeeze! * 100) / 100)) < 1e-9, `gasket at ${frame.live}`);
        assert.ok(Math.abs(thick(run.at(run.durationMs).values) - T0 * (1 - s)) < 1e-9, "ends at the squeeze that was set");
      }
    });

    it("counts the pressure up from 0 to the test pressure in the caption, after the twist and before anything escapes", () => {
      for (const s of [0.05, 0.2, 0.4]) {
        const frames = caption(s);
        const p = frames.filter(({ frame }) => frame.live === "Pressure building");
        assert.ok(p.length > 0, "a pressure phase is shown");
        const first = frames.findIndex(({ frame }) => frame.live.startsWith("Pressure"));
        const last = frames.map(({ frame }) => frame.live.startsWith("Pressure")).lastIndexOf(true);
        // Nothing has escaped yet: no drops, no spray, until the count is over.
        // (The lead frames show the joint as it was set, with whatever drops it had at rest.)
        const back = frames.findIndex(({ frame }) => frame.live.startsWith("Backing"));
        for (const { ms, frame } of frames.slice(back, last + 1)) {
          assert.equal(seal.build(frame.values).filter((q) => q.id.startsWith("drop-")).length, 0, `drops at ${ms} ms, before the pressure is up (frame ${first})`);
          assert.equal((frame.marks ?? []).length, 0);
        }
      }
    });

    it("then drops escape (weeping), the rubber sprays (split), or nothing does and the hold is confirmed (dry)", () => {
      const after = (s: number) => caption(s).filter(({ frame }) => !/^(Squeez|Backing|Pressure)/.test(frame.live));
      const drops = (f: { frame: { values: Record<string, number> } }) => seal.build(f.frame.values).filter((q) => q.id.startsWith("drop-")).length;
      assert.ok(after(0.05).some((f) => drops(f) >= 1), "drops escape when it weeps");
      assert.ok(after(0.05).at(-1)!.frame.live.startsWith("Leaking"));
      assert.ok(after(0.4).some((f) => (f.frame.marks ?? []).length === 4), "spray when it splits");
      assert.ok(after(0.2).every((f) => drops(f) === 0 && (f.frame.marks ?? []).length === 0), "nothing escapes when it holds");
      assert.equal(after(0.2).at(-1)!.frame.live, "Dry joint");
      assert.deepEqual((game.play({ squeeze: 0.2 }).cues ?? []).map((c) => c.kind), ["click"]);
    });
  });

  it("solves the handle back to the squeeze", () => {
    for (const s of steps(squeeze)) assert.ok(Math.abs(seal.handle!.solve(seal.handle!.at({ squeeze: s }), { squeeze: s }) - s) < 1e-9);
  });
});
