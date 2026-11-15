import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GenCourse } from "../../../shared/course/gen.ts";
import penCourse from "../lessons/pen-course.ts";
import { PEN, PEN_KIT } from "../lessons/pen-kit.ts";
import { courseFromGen, RigError } from "./index.ts";
import { installPen } from "./rig.ts";
import { scaleKit } from "./scale.ts";

const gold = GenCourse.parse(JSON.parse(readFileSync(new URL("../../../fixtures/courses/pen.gold.json", import.meta.url), "utf8")));
const near = (a: number, b: number, by = 0.05) => assert.ok(Math.abs(a - b) <= by, `${a} is not within ${by} of ${b}`);

test("the gold pen as data measures back to the hand-made pen", () => {
  const { dims, kit } = installPen(gold);
  for (const [key, value] of Object.entries(PEN)) {
    const got = dims[key as keyof typeof PEN];
    if (typeof value === "number") near(got as number, value);
    else value.forEach((p, i) => (near((got as typeof value)[i]!.r, p.r), near((got as typeof value)[i]!.y, p.y)));
  }
  assert.deepEqual(kit.parts.map((p) => p.id), PEN_KIT.parts.map((p) => p.id));
  for (const [i, p] of kit.parts.entries()) {
    const g = PEN_KIT.parts[i]!;
    assert.equal(p.finish, g.finish, p.id);
    assert.equal(p.parentId, g.parentId, p.id);
    near(p.position.y, g.position.y);
  }
});

test("the gold pen as data plays the hand-made course", () => {
  const course = courseFromGen(gold);
  const shape = (c: typeof course) => c.mechanisms.map((m) => [m.id, m.name, m.screens.map((s) => s.kind)]);
  assert.deepEqual(shape(course), shape(penCourse));
  assert.deepEqual(JSON.parse(JSON.stringify(course.mechanisms)), JSON.parse(JSON.stringify(penCourse.mechanisms)));
});

test("a pen lying down, off centre and with a stemless button is stood up and fitted", () => {
  const flat = scaleKit(gold.kit, 1, { x: 3, y: 40, z: -2 });
  const lying = {
    ...flat,
    parts: flat.parts.map((p) => {
      const button = p.id === "plunger" && p.shape.kind === "lathe" ? { ...p.shape, profile: p.shape.profile.filter((q) => q.y > 133.5 || q.r > 2) } : p.shape;
      return { ...p, shape: button, position: { x: -p.position.y, y: p.position.x, z: p.position.z }, rotation: { ...p.rotation, z: p.rotation.z + 90 } };
    }),
  };
  const { dims, kit } = installPen({ kit: lying, roles: gold.roles });
  near(dims.top, PEN.top, 0.5);
  near(dims.barrelIn, PEN.barrelIn, 0.1);
  assert.ok(kit.parts.some((p) => p.id === "spring"));
});

test("a kit that cannot take the works says why", () => {
  const solid = { ...gold.kit, parts: gold.kit.parts.map((p) => (p.id === "barrel" && p.shape.kind === "lathe" ? { ...p, shape: { ...p.shape, profile: p.shape.profile.map((q) => ({ ...q, r: q.r === 5 ? 0 : q.r })) } } : p)) };
  assert.throws(() => installPen({ kit: solid, roles: gold.roles }), (e: unknown) => e instanceof RigError && /not hollow enough/.test(e.message));
  assert.throws(() => installPen({ kit: gold.kit, roles: { case: "barrel", nose: "nose" } }), /no part is given the "button" role/);
  assert.throws(() => courseFromGen({ ...gold, mechanisms: [{ ...gold.mechanisms[0]!, entry: "hinge" }] }), /no rig for mechanism entry "hinge"/);
});
