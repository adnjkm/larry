// Measures the second look: takes the lessons one eval tag wrote, reviews each lesson on its own (as the server would,
// while later lessons are still being written), and saves the repaired lessons as a new tag for `curriculum-eval.ts judge`.
// Usage: node scripts/lessons-review.ts --from l8 --tag fr1 [--model claude-opus-5-5] [--effort low] [--jobs 4]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { type Brain, type Effort, type Model, streamStructured } from "../server/claude.ts";
import { REVIEW_SYSTEM, Review, applyReview, reviewJsonSchema, reviewRequest } from "../server/lessonsReview.ts";
import { type MechanismLesson, type Plan, lessonMechanisms, lessonProblems } from "../shared/curriculum.ts";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    tag: { type: "string" },
    model: { type: "string", default: "claude-opus-5-5" },
    effort: { type: "string", default: "low" },
    jobs: { type: "string", default: "4" },
    // Measurement only: append the judge's problems for the same run from this tag, to see how much a perfect critic could buy.
    hints: { type: "string" },
  },
});
if (!values.from || !values.tag) throw new Error("usage: node scripts/lessons-review.ts --from <tag> --tag <tag>");
const brain: Brain = { model: values.model as Model, effort: values.effort as Effort };
const root = new URL("../out/curriculum/", import.meta.url);
const from = new URL(`${values.from}/lessons/`, root);
const to = new URL(`${values.tag}/lessons/`, root);
await mkdir(to, { recursive: true });

type Run = { object: string; sample: number; ms: number; firstItemMs?: number; costUsd: number; plan: Plan; lessons: MechanismLesson[]; problems: string[] };

async function review(plan: Plan, lesson: MechanismLesson, hints = "") {
  const started = Date.now();
  for await (const event of streamStructured({
    system: REVIEW_SYSTEM,
    schema: reviewJsonSchema,
    brain,
    content: [{ type: "text", text: `${reviewRequest(plan, lesson)}${hints}` }],
    streamKey: "fixes",
  })) {
    if (event.type === "result") return { review: Review.safeParse(event.output), ms: Date.now() - started, costUsd: event.costUsd };
  }
  throw new Error("no result");
}

const files = (await readdir(from)).filter((f) => f.endsWith(".json"));
const tasks = files.map((file) => async () => {
  const run = JSON.parse(await readFile(new URL(file, from), "utf8")) as Run;
  const mechanisms = new Map(lessonMechanisms(run.plan).map((m) => [m.id, m]));
  const hints = values.hints
    ? `\n\nA strict reader found these problems across the object's lessons. Fix each one that is real and concerns this lesson:\n${(JSON.parse(await readFile(new URL(`${values.hints}/lessons-grade/${file}`, root), "utf8")) as { problems: string[] }).problems.map((p) => `- ${p}`).join("\n")}`
    : "";
  const reviewed = await Promise.all(
    run.lessons.map(async (lesson) => {
      const mechanism = mechanisms.get(lesson.id);
      if (!mechanism) return { lesson, ms: 0, costUsd: 0, fixes: [], flags: [], changed: [] as string[] };
      const r = await review(run.plan, lesson, hints);
      if (!r.review.success) return { lesson, ms: r.ms, costUsd: r.costUsd, fixes: [], flags: [], changed: ["schema failure"] };
      const fixed = applyReview(lesson, r.review.data, mechanism);
      const changed = [
        ...(JSON.stringify(fixed.rows) !== JSON.stringify(lesson.rows) ? ["rows"] : []),
        ...(JSON.stringify(fixed.path) !== JSON.stringify(lesson.path) ? ["path"] : []),
        ...(JSON.stringify(fixed.steps) !== JSON.stringify(lesson.steps) ? ["steps"] : []),
        ...(fixed === lesson && (r.review.data.fixes.length > 0 || r.review.data.path || r.review.data.steps) ? ["REJECTED"] : []),
      ];
      return { lesson: fixed, ms: r.ms, costUsd: r.costUsd, fixes: r.review.data.fixes, flags: r.review.data.flags, changed };
    }),
  );
  const lessons = reviewed.map((r) => r.lesson);
  const reviewMs = reviewed.map((r) => r.ms);
  const out = {
    ...run,
    lessons,
    // The first lesson is ready when it has been written and reviewed; the last when the slowest review after the draft ends.
    firstItemMs: (run.firstItemMs ?? run.ms) + (reviewMs[0] ?? 0),
    ms: run.ms + Math.max(0, ...reviewMs),
    costUsd: run.costUsd + reviewed.reduce((a, r) => a + r.costUsd, 0),
    problems: lessons.flatMap((l) => (mechanisms.has(l.id) ? lessonProblems(l, mechanisms.get(l.id)!) : [])),
    review: reviewed.map((r, i) => ({ id: lessons[i]!.id, ms: r.ms, changed: r.changed, fixes: r.fixes, flags: r.flags })),
  };
  await writeFile(new URL(file, to), `${JSON.stringify(out, null, 2)}\n`);
  return out;
});

const results: Awaited<ReturnType<(typeof tasks)[number]>>[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Number(values.jobs) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
    }
  }),
);
for (const r of results) {
  console.log(`${r.object}.${r.sample}  first ${(r.firstItemMs / 1000).toFixed(1)}s  all ${(r.ms / 1000).toFixed(1)}s  $${r.costUsd.toFixed(3)}`);
  for (const l of r.review) {
    console.log(`  ${l.id}: review ${(l.ms / 1000).toFixed(1)}s, ${l.fixes.length} fixes, changed ${l.changed.join("+") || "nothing"}`);
    for (const f of l.fixes) console.log(`    ~ ${f.row}.${f.field}: ${f.problem}\n      -> ${f.text}`);
    for (const f of l.flags) console.log(`    ! flag ${f.row}: ${f.note}`);
  }
}
const n = results.length;
console.log(
  `\n${brain.model} ${brain.effort} review of ${values.from} -> ${values.tag}: mean first ${(results.reduce((a, r) => a + r.firstItemMs, 0) / n / 1000).toFixed(1)}s, all ${(results.reduce((a, r) => a + r.ms, 0) / n / 1000).toFixed(1)}s, review ${(results.flatMap((r) => r.review.map((l) => l.ms)).reduce((a, b) => a + b, 0) / results.flatMap((r) => r.review).length / 1000).toFixed(1)}s per lesson, ${results.flatMap((r) => r.review.flatMap((l) => l.fixes)).length} fixes, ${results.flatMap((r) => r.review.flatMap((l) => l.flags)).length} flags`,
);
process.exit(0);
