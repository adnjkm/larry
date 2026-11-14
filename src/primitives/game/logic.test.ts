import assert from "node:assert/strict";
import { test } from "node:test";
import type { Meter, Slider } from "../types.ts";
import { controlRows, meterFraction, meterMet, meterText, meterTextWidth, togglesLabel } from "./logic.ts";

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

const meter = (over: Partial<Meter> = {}): Meter => ({ label: "Push", value: 33, target: 20, max: 50, unit: "N", need: "atMost", ...over });

test("a meter is met on the side its need names", () => {
  assert.equal(meterMet(meter()), false);
  assert.equal(meterMet(meter({ value: 20 })), true);
  assert.equal(meterMet(meter({ need: "atLeast" })), true);
  assert.equal(meterMet(meter({ need: "atLeast", value: 19.9 })), false);
});

test("meter text and bar positions", () => {
  assert.equal(meterText(meter()), "33 of 20 N");
  assert.equal(meterText(meter({ digits: 1, value: 2.55, target: 3 })), "2.5 of 3.0 N");
  assert.equal(meterFraction(75, 50), 1);
  assert.equal(meterFraction(-3, 50), 0);
  assert.equal(meterFraction(10, 0), 0);
  assert.equal(meterTextWidth(meter({ value: 5, max: 100 })), "100 of 20 N".length);
});
