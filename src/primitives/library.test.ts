import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitProblems, Kit } from "../../shared/kit.ts";
import { PRIMITIVES, framingParts, initialValues, type Values } from "./library.ts";

/** Each slider at its minimum, start and maximum, with the others at their start. */
function samples(p: (typeof PRIMITIVES)[number]): Values[] {
  const start = initialValues(p);
  return [start, ...p.sliders.flatMap((s) => [{ ...start, [s.id]: s.min }, { ...start, [s.id]: s.max }])];
}

describe("primitives library", () => {
  it("has unique ids, and builds-on links that exist", () => {
    const ids = PRIMITIVES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const p of PRIMITIVES) for (const b of p.buildsOn) assert.ok(ids.includes(b), `${p.id} builds on unknown ${b}`);
  });

  for (const p of PRIMITIVES) {
    it(`${p.id} builds a valid kit across its slider range`, () => {
      for (const v of samples(p)) {
        const kit = Kit.parse({ name: p.name, summary: p.idea, parts: p.build(v) });
        assert.deepEqual(kitProblems(kit), [], `${p.id} at ${JSON.stringify(v)}`);
        for (const part of kit.parts) for (const n of [part.position.x, part.position.y, part.position.z]) assert.ok(Number.isFinite(n), `${p.id}/${part.id} position`);
        assert.ok(kit.parts.some((part) => part.color === "#ff5a1f"), `${p.id} has no focus part`);
        assert.ok(p.readouts(v).every((r) => !r.value.includes("NaN")), `${p.id} readout`);
      }
    });

    it(`${p.id} framing covers every slider extreme`, () => {
      assert.equal(framingParts(p).length, p.build(initialValues(p)).length * 2 ** p.sliders.length);
    });
  }
});
