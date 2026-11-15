import assert from "node:assert/strict";
import { test } from "node:test";
import type { Slider } from "../../../shared/primitives/types.ts";
import { controlRows, meterFraction, togglesLabel } from "./logic.ts";

const slider = (id: string, over: Partial<Slider> = {}): Slider => ({ id, label: id, min: 0, max: 10, step: 1, initial: 0, ...over });
const toggle = (id: string, label = id) => slider(id, { label, max: 1 });

test("consecutive toggles share a row, anything else is its own slider row, the number is skipped", () => {
  const rows = controlRows([toggle("b1", "Beat 1"), toggle("b2", "Beat 2"), slider("height"), toggle("x"), slider("n")], "n");
  assert.deepEqual(
    rows.map((r) => (r.kind === "toggles" ? r.sliders.map((s) => s.id) : r.slider.id)),
    [["b1", "b2"], "height", ["x"]],
  );
});

test("a toggle row is labelled by its first control without the trailing number", () => {
  assert.equal(togglesLabel([toggle("a", "Beat 1"), toggle("b", "Beat 2")]), "Beat");
  assert.equal(togglesLabel([toggle("a", "Latch")]), "Latch");
  assert.equal(togglesLabel([toggle("a", "3")]), "3");
});

test("a meter bar stays inside its track whatever the value", () => {
  assert.equal(meterFraction(75, 50), 1);
  assert.equal(meterFraction(-3, 50), 0);
  assert.equal(meterFraction(10, 0), 0);
  assert.equal(meterFraction(Number.NaN, 50), 0);
});
