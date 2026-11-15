// A photo to a course: pnpm course <photo> [--out name] [--effort low|medium] [--publish]
// Writes out/gen/<name>/course.json and stats.json. --publish also copies the course to fixtures/courses/<name>.gen.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Effort } from "../server/claude.ts";
import { COURSE_KIT_BRAIN, CourseError, type CourseStats, generateCourse } from "../server/genCourse.ts";
import type { Photo } from "../server/streamKit.ts";
import type { GenCourse } from "../shared/course/gen.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    effort: { type: "string", default: COURSE_KIT_BRAIN.effort },
    publish: { type: "boolean", default: false },
  },
});

const root = resolve(import.meta.dirname, "..");
const photoPath = resolve(positionals[0] ?? join(root, "fixtures", "photos", "pen.jpg"));
const photoName = basename(photoPath, extname(photoPath));
const name = values.out ?? photoName;
const outDir = join(root, "out", "gen", name);

const MEDIA: Record<string, Photo["mediaType"]> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const mediaType = MEDIA[extname(photoPath).toLowerCase()];
if (!mediaType) throw new Error(`${photoPath} is not a jpg, png or webp`);

const save = (path: string, data: unknown) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`);

await mkdir(outDir, { recursive: true });
const base64 = (await readFile(photoPath)).toString("base64");
let stats: CourseStats | undefined;
let course: GenCourse | undefined;
let failure: CourseError | undefined;
try {
  course = await generateCourse([{ mediaType, base64 }], { brain: { ...COURSE_KIT_BRAIN, effort: values.effort as Effort }, onStats: (s) => (stats = s) });
} catch (error) {
  if (!(error instanceof CourseError)) throw error;
  failure = error;
  course = error.course;
}

if (course) await save(join(outDir, "course.json"), course);
await save(join(outDir, "stats.json"), { ...stats, effort: values.effort, failed: failure?.problems ?? [] });

const line = stats ? `${(stats.ms / 1000).toFixed(1)}s (kit ${(stats.kitMs / 1000).toFixed(1)}s, text ${(stats.textMs / 1000).toFixed(1)}s), $${stats.costUsd.toFixed(3)}` : "";
if (failure) {
  console.error(`${name}: FAILED ${line}\n${failure.problems.join("\n")}`);
  process.exit(1);
}
console.log(`${name}: "${course!.object}", ${course!.kit.parts.length} parts, ${line}${stats?.repaired ? `, repaired: ${stats.problems.join("; ")}` : ""}`);
console.log(join(outDir, "course.json"));
if (values.publish) {
  const published = join(root, "fixtures", "courses", `${values.out ?? photoName}.gen.json`);
  await save(published, course);
  console.log(published);
}
