// Writes shared/primitives/framing.json: the camera bounds of every primitive, still and game, so the figure stage
// does not sample a grid of poses on load. Run it after a model's parts or motion change:
//   node scripts/generate-framing.ts
// (shared/primitives/framing.test.ts fails when the file is out of date.)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { computeFraming } from "../shared/primitives/framing.ts";

const out = join(import.meta.dirname, "..", "shared", "primitives", "framing.json");
const framing = Object.fromEntries(PRIMITIVES.map((p) => [p.id, { still: computeFraming(p, "still"), game: computeFraming(p, "game") }]));
writeFileSync(out, `${JSON.stringify(framing, null, 2)}\n`);
console.log(`Wrote ${PRIMITIVES.length} framings to ${out}`);
