import { strict as assert } from "node:assert";
import { test } from "node:test";
import { titleCase } from "./titleCase.ts";

test("capitalises every word but the small ones in the middle", () => {
  assert.equal(titleCase("Next: learn the fix"), "Next: Learn the Fix");
  assert.equal(titleCase("Build it"), "Build It");
  assert.equal(titleCase("Another object"), "Another Object");
  assert.equal(titleCase("Next: piece it together"), "Next: Piece It Together");
});

test("the first word, the last and the first after a colon are always capitalised", () => {
  assert.equal(titleCase("the cap"), "The Cap");
  assert.equal(titleCase("Shake it up"), "Shake It Up");
  assert.equal(titleCase("Next: the thread"), "Next: The Thread");
});

test("keeps capitals that are already there", () => {
  assert.equal(titleCase("Laying out parts…"), "Laying Out Parts…");
  assert.equal(titleCase("see it in 3D"), "See It in 3D");
});
