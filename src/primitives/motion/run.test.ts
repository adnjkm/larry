import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ratchet } from "../models/ratchet.ts";
import { spring } from "../models/spring.ts";
import { easeOut, fall, ring, rockBack, shudder, smooth, strain } from "./ease.ts";
import { phases, SWEEP_MS, sweepRun, whenReaches } from "./run.ts";

describe("ease", () => {
  it("starts and ends where each name says", () => {
    for (const f of [smooth, easeOut, fall]) assert.deepEqual([f(0), f(1)], [0, 1]);
    for (const f of [strain, shudder, (t: number) => rockBack(t)]) assert.ok(Math.abs(f(0)) < 1e-12 && Math.abs(f(1)) < 1e-12);
    assert.equal(ring(0), 1);
    assert.ok(Math.abs(ring(1)) < 1e-12);
    assert.ok(easeOut(0.2) > 0.2 && fall(0.2) < 0.2, "released things start fast, falling things start slow");
  });
});

describe("phases", () => {
  const tl = phases({ lead: 200, act: 600, snap: 0, hold: 500 });
  it("lays phases end to end and reports progress through each", () => {
    assert.equal(tl.total, 1300);
    assert.deepEqual([tl.start("act"), tl.end("act"), tl.start("hold")], [200, 800, 800]);
    assert.equal(tl.t("act", 500), 0.5);
    assert.deepEqual([tl.t("act", 0), tl.t("act", 2000)], [0, 1]);
    assert.equal(tl.at(500).phase, "act");
    assert.equal(tl.at(800).phase, "hold", "a zero-length phase is never current");
    assert.equal(tl.at(5000).phase, "hold");
    assert.equal(tl.t("snap", 799), 0);
    assert.equal(tl.t("snap", 800), 1);
  });
  it("finds when a rising curve passes a value", () => {
    assert.ok(Math.abs(whenReaches((ms) => ms / 10, 25, 0, 1000) - 250) < 1e-6);
  });
});

describe("sweepRun", () => {
  it("sweeps the handle's slider inside its reach, end to end and back", () => {
    const start = { stiffness: 1, force: 0 };
    const sweep = sweepRun(spring, start);
    const values = Array.from({ length: 101 }, (_, i) => sweep.at((i / 100) * SWEEP_MS).values.force!);
    assert.equal(values[0], 0);
    assert.ok(Math.abs(Math.max(...values) - 25) < 1e-6, "1 N/mm goes solid at 25 N, so the drag stops there");
    assert.ok(Math.abs(values[100]!) < 1e-6);
  });
  it("never runs a one-way machine backward: the ratchet winds up and holds", () => {
    const sweep = sweepRun(ratchet, { teeth: 12, turn: 0 });
    let prev = -1;
    // One period: at SWEEP_MS the sweep starts again from where it began.
    for (let ms = 0; ms < SWEEP_MS; ms += 16) {
      const turn = sweep.at(ms).values.turn!;
      assert.ok(turn >= prev - 1e-9 || turn >= Math.floor(prev * 12 + 1e-9) / 12 - 1e-9, `turn went back past a landing at ${ms} ms`);
      prev = Math.max(prev, turn);
    }
    assert.ok(Math.abs(sweep.at(SWEEP_MS / 2).values.turn! - 1) < 1e-6);
  });
});
