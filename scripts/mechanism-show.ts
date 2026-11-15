// Prints a known mechanism's lesson in the words of each object it fits, to read it as a learner would.
// Usage: node scripts/mechanism-show.ts <id> [<id> ...]   (no id: every entry)
import { readdirSync } from "node:fs";
import { lessonOf, subfunctionsOf, wordsFor } from "../shared/mechanisms/instantiate.ts";
import type { KnownMechanism } from "../shared/mechanisms/types.ts";

const dir = new URL("../shared/mechanisms/entries/", import.meta.url);
const wanted = process.argv.slice(2);
for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && (wanted.length === 0 || wanted.includes(f.slice(0, -3))))) {
  const entry = Object.values((await import(new URL(file, dir).href)) as Record<string, KnownMechanism>)[0]!;
  console.log(`\n=== ${entry.id}: ${entry.does}\n    slots: ${entry.slots.map((s) => `${s.id} (${s.is}; default "${s.default}")`).join("; ")}`);
  for (const fit of [{ object: "defaults", words: wordsFor(entry, []) }, ...entry.fits]) {
    const lesson = lessonOf(entry, "m", fit.words);
    const subs = subfunctionsOf(entry, "m", fit.words);
    console.log(`\n  -- as ${fit.object}`);
    for (const [i, row] of lesson.rows.entries())
      console.log(
        `  ${subs[i]!.does} => ${subs[i]!.primitive}\n     why: ${row.why}\n     need: ${row.need}\n     missing: ${row.missing}\n     little: ${row.little}\n     much: ${row.much}`,
      );
    console.log(`  path: ${lesson.path.join(" > ")}`);
    console.log(
      `  steps: ${lesson.steps.map((s) => (s.format === "break" ? `break "${s.failure}" <= ${s.causes.map((c) => `${c.subfunction}:${c.fault}`).join(", ")}` : s.format === "broke" ? `broke ${s.subfunction}:${s.fault}` : s.format === "trace" ? "trace" : `${s.format} ${s.subfunction}`)).join(" | ")}`,
    );
  }
}
