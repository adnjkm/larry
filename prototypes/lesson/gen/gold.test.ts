import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PEN_KIT, PEN_SHELL } from "../lessons/pen-kit.ts";

// Taken from the hand-made pen before its kit became a factory (write-gold.ts --snapshot): the gold must not move.
const snapshot = JSON.parse(readFileSync(new URL("./pen.snapshot.json", import.meta.url), "utf8")) as { kit: unknown; shell: unknown };

test("the hand-made pen is unchanged by the refactor", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(PEN_KIT)), snapshot.kit);
  assert.deepEqual(JSON.parse(JSON.stringify(PEN_SHELL)), snapshot.shell);
});
