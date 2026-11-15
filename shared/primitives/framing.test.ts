import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { measureParts } from "../bounds.ts";
import { PRIMITIVES } from "./library.ts";
import { computeFraming, framePrimitive, poses, releasePoses, runPoses } from "./framing.ts";

describe("figure framing", () => {
  for (const p of PRIMITIVES) {
    it(`${p.id}: framing.json is current (run node scripts/generate-framing.ts if not)`, () => {
      for (const mode of ["still", "play", "game"] as const) {
        const baked = framePrimitive(p, mode);
        const fresh = computeFraming(p, mode);
        const { seen: bakedSeen, ...bakedBox } = baked;
        const { seen: freshSeen, ...freshBox } = fresh;
        for (const key of Object.keys(freshBox) as (keyof typeof freshBox)[])
          assert.ok(Math.abs(bakedBox[key] - freshBox[key]) < 1e-6, `${mode} ${key}: ${bakedBox[key]} in framing.json, ${freshBox[key]} now`);
        assert.deepEqual(bakedSeen, freshSeen, `${mode} seen: out of date in framing.json`);
      }
    });

    it(`${p.id}: stays inside its framing at every slider setting and run frame`, () => {
      const frame = framePrimitive(p);
      for (const v of poses(p, 13)) {
        const b = measureParts(p.build(v));
        const at = `${p.id} at ${JSON.stringify(v)}`;
        assert.ok(b.minY >= frame.minY && b.maxY <= frame.maxY, `${at} leaves the framing vertically`);
        assert.ok(
          Math.abs(b.centerX - frame.centerX) + b.halfX <= frame.halfX && Math.abs(b.centerZ - frame.centerZ) + b.halfZ <= frame.halfZ,
          `${at} leaves the framing's footprint`,
        );
        assert.ok(b.radius + Math.hypot(b.centerX - frame.centerX, b.centerZ - frame.centerZ) <= frame.radius, `${at} reaches past the framing's radius`);
      }
      const play = framePrimitive(p, "play");
      for (const parts of releasePoses(p)) {
        const b = measureParts(parts);
        assert.ok(b.minY >= play.minY && b.maxY <= play.maxY, `${p.id}: a release frame leaves the play framing vertically`);
        assert.ok(
          b.radius + Math.hypot(b.centerX - play.centerX, b.centerZ - play.centerZ) <= play.radius,
          `${p.id}: a release frame reaches past the play framing's radius`,
        );
      }
      const game = framePrimitive(p, "game");
      for (const parts of runPoses(p)) {
        const b = measureParts(parts);
        assert.ok(b.minY >= game.minY && b.maxY <= game.maxY, `${p.id}: a run frame leaves the game framing vertically`);
        assert.ok(
          b.radius + Math.hypot(b.centerX - game.centerX, b.centerZ - game.centerZ) <= game.radius,
          `${p.id}: a run frame reaches past the game framing's radius`,
        );
      }
    });
  }
});
