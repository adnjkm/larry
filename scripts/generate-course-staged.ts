// Generates a course from one photo with the staged pipeline (server/genCourseStaged.ts) and writes it with its timings.
// node scripts/generate-course-staged.ts fixtures/photos/pen.jpg [--out name] [--details code|sonnet] [--race 2] [--publish]
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";
import type { Model } from "../server/claude.ts";
import { type DetailMode, generateCourseStaged, type StagedStats } from "../server/genCourseStaged.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    details: { type: "string", default: "code" },
    race: { type: "string", default: "1" },
    publish: { type: "boolean", default: false },
    shell: { type: "string" },
    text: { type: "string" },
  },
});

const photoPath = positionals[0];
if (!photoPath) throw new Error("usage: generate-course-staged.ts <photo> [--out name] [--details code|sonnet] [--race n] [--publish]");
const name = values.out ?? basename(photoPath, extname(photoPath));
const ext = extname(photoPath).toLowerCase();
const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
const base64 = (await readFile(photoPath)).toString("base64");

let stats: StagedStats | undefined;
const course = await generateCourseStaged([{ mediaType, base64 }], {
  details: values.details as DetailMode,
  race: Number(values.race),
  shellModel: values.shell as Model | undefined,
  textModel: values.text as Model | undefined,
  onStats: (s) => (stats = s),
});

const dir = new URL(`../out/gen/staged/${name}/`, import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL("course.json", dir), `${JSON.stringify(course, null, 2)}\n`);
await writeFile(new URL("stats.json", dir), `${JSON.stringify({ details: values.details, race: Number(values.race), ...stats }, null, 2)}\n`);
if (values.publish) await copyFile(new URL("course.json", dir), new URL(`../fixtures/courses/${name}.staged.json`, import.meta.url));

if (stats) {
  for (const s of stats.stages)
    console.log(`${s.stage.padEnd(18)} ${s.model.padEnd(18)} start ${(s.startMs / 1000).toFixed(1)}s  took ${(s.ms / 1000).toFixed(1)}s  $${s.costUsd.toFixed(4)}`);
  console.log(`total ${(stats.totalMs / 1000).toFixed(1)}s  $${stats.costUsd.toFixed(4)}  parts ${course.kit.parts.length}  repaired [${stats.repaired.join(", ")}]`);
  if (stats.textFallbacks.length > 0) console.log(`text from gold: ${stats.textFallbacks.join(", ")}`);
  if (stats.firstProblems.length > 0) console.log(`first pass:\n- ${stats.firstProblems.join("\n- ")}`);
  console.log(stats.problems.length === 0 ? "no problems" : `problems:\n- ${stats.problems.join("\n- ")}`);
}
