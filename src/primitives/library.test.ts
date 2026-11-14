import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Kit, kitProblems } from "../../shared/kit.ts";
import { PRIMITIVES, framingParts, initialValues, type Values } from "./library.ts";
import { COLOR, SYNTHWAVE } from "./parts.ts";

/** Each slider at its minimum, start and maximum, with the others at their start. */
function samples(p: (typeof PRIMITIVES)[number]): Values[] {
  const start = initialValues(p);
  return [start, ...p.sliders.flatMap((s) => [{ ...start, [s.id]: s.min }, { ...start, [s.id]: s.max }])];
}

const palette = new Set<string>([...SYNTHWAVE, ...Object.values(COLOR)]);

describe("primitives library", () => {
  it("has unique ids", () => {
    const ids = PRIMITIVES.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("builds mechanisms only from elements", () => {
    const elements = new Set(PRIMITIVES.filter((p) => p.level === "Element").map((p) => p.id));
    for (const p of PRIMITIVES) {
      if (p.level === "Element") assert.deepEqual(p.madeOf, [], `${p.id} is an element, so it is made of nothing`);
      else {
        assert.ok(p.madeOf.length >= 1 && p.madeOf.length <= 3, `${p.id} is made of 1 to 3 elements`);
        for (const e of p.madeOf) assert.ok(elements.has(e), `${p.id} is made of unknown element ${e}`);
      }
    }
  });

  for (const p of PRIMITIVES) {
    it(`${p.id} builds a valid kit across its slider range`, () => {
      assert.ok(p.sliders.length >= 1 && p.sliders.length <= 2, `${p.id} has 1 or 2 sliders`);
      for (const v of samples(p)) {
        const kit = Kit.parse({ name: p.name, summary: p.job, parts: p.build(v) });
        assert.deepEqual(kitProblems(kit), [], `${p.id} at ${JSON.stringify(v)}`);
        for (const part of kit.parts) {
          for (const n of [part.position.x, part.position.y, part.position.z]) assert.ok(Number.isFinite(n), `${p.id}/${part.id} position`);
          assert.ok(palette.has(part.color), `${p.id}/${part.id} colour ${part.color} is not from the Synthwave palette`);
        }
        assert.ok(kit.parts.some((part) => part.color === COLOR.focus), `${p.id} has no focus part`);
        assert.ok(p.readouts(v).every((r) => !/NaN|Infinity/.test(r.value)), `${p.id} readout`);
      }
    });

    it(`${p.id} framing covers every slider extreme`, () => {
      assert.equal(framingParts(p).length, p.build(initialValues(p)).length * 2 ** p.sliders.length);
    });
  }
});
