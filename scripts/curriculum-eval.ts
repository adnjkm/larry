// Hill-climbing the curriculum prompts. Each command reads and writes out/curriculum/<tag>/.
//   plan     one blind attempt per object and sample, with no retry, so rule breaks show.
//   lessons  the lessons for each object's reference plan (or --plans <tag> to use that run's plans).
//   judge    Opus grades a tag's plans against the references, and its lessons against the rubric.
//   show     prints a tag's plans and lessons as text.
// Usage: node scripts/curriculum-eval.ts <command> --tag r1 [--objects pen,stapler] [--samples 2] [--model claude-sonnet-5-5] [--effort low]
// Objects are fixtures/kits/*.json and fixtures/curriculum/objects/*.json; references are fixtures/curriculum/gold/*.json.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { type Brain, type Effort, type Model, streamStructured } from "../server/claude.ts";
import { CATALOGUE } from "../server/catalogue.ts";
import { LESSONS_SYSTEM, lessonsRequest } from "../server/lessonsPrompt.ts";
import { PLAN_SYSTEM, planRequest } from "../server/planPrompt.ts";
import { lessonsJsonSchema, planJsonSchema } from "../server/schemas.ts";
import { type Brief, Lessons, type MechanismLesson, Plan, briefOf, lessonMechanisms, lessonProblems, planProblems } from "../shared/curriculum.ts";
import { parseKit } from "../shared/kit.ts";
import { PRIMITIVES } from "../shared/primitives/library.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tag: { type: "string", default: "scratch" },
    objects: { type: "string" },
    samples: { type: "string", default: "2" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    effort: { type: "string", default: "low" },
    plans: { type: "string", default: "gold" },
    jobs: { type: "string", default: "6" },
  },
});
const command = positionals[0];
const brain: Brain = { model: values.model as Model, effort: values.effort as Effort };
const JUDGE: Brain = { model: "claude-opus-5-5", effort: "medium" };
const samples = Number(values.samples);
const root = new URL("../", import.meta.url);
const out = new URL(`out/curriculum/${values.tag}/`, root);
const PRIMITIVE_IDS = new Set(PRIMITIVES.map((p) => p.id));

/** The practice objects the prompts are tuned on. The rest are held back to check the tuning did not overfit. */
export const PRACTICE = ["pen", "stapler", "bottle", "scissors", "clothespeg"];

const json = async <T>(url: URL): Promise<T> => JSON.parse(await readFile(url, "utf8")) as T;
const names = async (dir: string) =>
  existsSync(new URL(dir, root)) ? (await readdir(new URL(dir, root))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];

async function briefs(): Promise<Map<string, Brief>> {
  const all = new Map<string, Brief>();
  for (const name of await names("fixtures/kits/")) all.set(name, briefOf(parseKit(await json(new URL(`fixtures/kits/${name}.json`, root)))));
  for (const name of await names("fixtures/curriculum/objects/")) all.set(name, await json<Brief>(new URL(`fixtures/curriculum/objects/${name}.json`, root)));
  const wanted = values.objects === "all" ? [...all.keys()] : (values.objects?.split(",") ?? PRACTICE);
  return new Map(wanted.map((name) => [name, all.get(name) ?? fail(`no object ${name}`)]));
}
const fail = (message: string): never => {
  throw new Error(message);
};

type Gold = { accept: string[]; plan?: Plan };
const gold = async (name: string): Promise<Gold> => json<Gold>(new URL(`fixtures/curriculum/gold/${name}.json`, root));

/** Runs `tasks` with at most `limit` at once; each Claude call is its own process. */
async function pool<T>(tasks: (() => Promise<T>)[], limit = Number(values.jobs)): Promise<T[]> {
  const results: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]!();
      }
    }),
  );
  return results;
}

async function ask(system: string, schema: Record<string, unknown>, text: string, streamKey: string, with_ = brain) {
  const started = Date.now();
  let firstItemMs: number | undefined;
  for await (const event of streamStructured({ system, schema, brain: with_, content: [{ type: "text", text }], streamKey })) {
    if (event.type === "item") firstItemMs ??= Date.now() - started;
    if (event.type === "result") return { output: event.output, ms: Date.now() - started, firstItemMs, costUsd: event.costUsd };
  }
  throw new Error("no result");
}

type PlanRun = { object: string; sample: number; ms: number; costUsd: number; plan: Plan | null; problems: string[] };
type LessonsRun = {
  object: string;
  sample: number;
  ms: number;
  firstItemMs: number | undefined;
  costUsd: number;
  plan: Plan;
  lessons: MechanismLesson[];
  problems: string[];
};

const save = async (kind: string, name: string, data: unknown) => {
  await mkdir(new URL(`${kind}/`, out), { recursive: true });
  await writeFile(new URL(`${kind}/${name}.json`, out), `${JSON.stringify(data, null, 2)}\n`);
};
const load = async <T>(kind: string): Promise<T[]> =>
  Promise.all((await names(`out/curriculum/${values.tag}/${kind}/`)).map((n) => json<T>(new URL(`${kind}/${n}.json`, out))));

export const renderPlan = (plan: Plan): string =>
  [
    `${plan.object}: ${plan.job}`,
    `Uses: ${plan.uses.join(" / ")}`,
    ...plan.mechanisms.map((m, i) =>
      [
        `${i + 1}. ${m.lesson ? "LESSON" : "given "} ${m.name} [${m.id}] — ${m.does}  (parts: ${m.parts.join(", ") || "none"}; needs: ${m.needs.join(", ") || "nothing"})`,
        ...(m.gap ? [`     gap: ${m.gap.try} -> ${m.gap.fails}`] : []),
        ...m.subfunctions.map((s) => `     - ${s.does} [${s.id}] => ${s.primitive}`),
      ].join("\n"),
    ),
  ].join("\n");

const renderStep = (s: MechanismLesson["steps"][number]): string =>
  s.format === "trace"
    ? "trace"
    : s.format === "break"
      ? `break "${s.failure}" <= ${s.causes.map((c) => `${c.subfunction}:${c.fault}`).join(", ")}`
      : s.format === "broke"
        ? `broke ${s.subfunction}:${s.fault}`
        : `${s.format} ${s.subfunction}`;

export const renderLessons = (lessons: MechanismLesson[]): string =>
  lessons
    .map((l) =>
      [
        `LESSON ${l.id}`,
        ...l.rows.map((r) => `  ${r.id}\n    why: ${r.why}\n    need: ${r.need}\n    missing: ${r.missing}\n    little: ${r.little}\n    much: ${r.much}`),
        `  path: ${l.path.join(" > ")}`,
        `  steps: ${l.steps.map(renderStep).join("  |  ")}`,
      ].join("\n"),
    )
    .join("\n");

/** What a plan decided, in one line, so two runs of the same object can be compared at a glance. */
const signature = (plan: Plan): string =>
  lessonMechanisms(plan)
    .map((m) => `${m.name}(${m.subfunctions.map((s) => s.primitive).join("+")})`)
    .join(" | ") || "no lessons";

async function runPlans() {
  const tasks = [...(await briefs())].flatMap(([object, brief]) =>
    Array.from({ length: samples }, (_, sample) => async (): Promise<PlanRun> => {
      const r = await ask(PLAN_SYSTEM, planJsonSchema, planRequest(brief), "mechanisms");
      const parsed = Plan.safeParse(r.output);
      const run: PlanRun = {
        object,
        sample,
        ms: r.ms,
        costUsd: r.costUsd,
        plan: parsed.success ? parsed.data : null,
        problems: parsed.success ? planProblems(parsed.data, brief, PRIMITIVE_IDS) : [`schema: ${parsed.error.message}`],
      };
      await save("plan", `${object}.${sample}`, run);
      return run;
    }),
  );
  const runs = await pool(tasks);
  console.log(`${brain.model} ${brain.effort}, plans -> out/curriculum/${values.tag}`);
  for (const r of runs)
    console.log(
      `${r.object}.${r.sample}  ${(r.ms / 1000).toFixed(1)}s  $${r.costUsd.toFixed(3)}  ${r.problems.length} rule break(s)  ${r.plan ? signature(r.plan) : "NO PLAN"}`,
    );
  const breaks = runs.flatMap((r) => r.problems.map((p) => `${r.object}.${r.sample}: ${p}`));
  if (breaks.length > 0) console.log(`\nRule breaks:\n${breaks.join("\n")}`);
  console.log(`\nmean ${(runs.reduce((a, r) => a + r.ms, 0) / runs.length / 1000).toFixed(1)}s per plan, ${breaks.length} rule breaks in ${runs.length} plans`);
}

async function planFor(object: string, sample: number): Promise<Plan> {
  if (values.plans === "gold") return (await gold(object)).plan ?? fail(`no reference plan for ${object}; pass --plans <tag>`);
  const run = await json<PlanRun>(new URL(`../${values.plans}/plan/${object}.${sample}.json`, out));
  return run.plan ?? fail(`${values.plans} has no plan for ${object}.${sample}`);
}

async function runLessons() {
  const tasks = [...(await briefs()).keys()].flatMap((object) =>
    Array.from({ length: samples }, (_, sample) => async (): Promise<LessonsRun | null> => {
      const plan = await planFor(object, sample);
      if (lessonMechanisms(plan).length === 0) return null;
      const r = await ask(LESSONS_SYSTEM, lessonsJsonSchema, lessonsRequest(plan), "lessons");
      const parsed = Lessons.safeParse(r.output);
      const lessons = parsed.success ? parsed.data.lessons : [];
      const byId = new Map(lessons.map((l) => [l.id, l]));
      const problems = parsed.success
        ? lessonMechanisms(plan).flatMap((m) => (byId.has(m.id) ? lessonProblems(byId.get(m.id)!, m) : [`${m.id} has no lesson`]))
        : [`schema: ${parsed.error.message}`];
      const run: LessonsRun = { object, sample, ms: r.ms, firstItemMs: r.firstItemMs, costUsd: r.costUsd, plan, lessons, problems };
      await save("lessons", `${object}.${sample}`, run);
      return run;
    }),
  );
  const runs = (await pool(tasks)).filter((r) => r !== null);
  console.log(`${brain.model} ${brain.effort}, lessons on ${values.plans} plans -> out/curriculum/${values.tag}`);
  for (const r of runs)
    console.log(
      `${r.object}.${r.sample}  first ${((r.firstItemMs ?? NaN) / 1000).toFixed(1)}s  all ${(r.ms / 1000).toFixed(1)}s  $${r.costUsd.toFixed(3)}  ${r.problems.length} rule break(s)  ${r.lessons.map((l) => `${l.id}: ${l.steps.map((s) => s.format).join(" ")}`).join("  |  ")}`,
    );
  const breaks = runs.flatMap((r) => r.problems.map((p) => `${r.object}.${r.sample}: ${p}`));
  if (breaks.length > 0) console.log(`\nRule breaks:\n${breaks.join("\n")}`);
  const formats = runs.flatMap((r) => r.lessons.flatMap((l) => l.steps.map((s) => s.format)));
  const count = (f: string) => formats.filter((x) => x === f).length;
  console.log(
    `\nformats used: ${["who", "much", "broke", "trace", "break"].map((f) => `${f} ${count(f)}`).join(", ")}; ${breaks.length} rule breaks in ${runs.length} runs`,
  );
}

const score = (label: string) => z.number().int().min(0).max(2).describe(label);
const Problems = z
  .array(z.string())
  .describe("What is wrong, most damaging first. Each quotes the offending text and says why, in at most 30 words. Empty when nothing is wrong.");

const PlanGrade = z.object({
  lessonSet: score("2: the lessons are the reference's or an accepted alternative. 1: one lesson missing, extra or wrongly split. 0: worse."),
  boundary: score(
    "2: every mechanism is a feature a user would name and every sub-function is an inner step nobody asks for. 1: one is at the wrong level. 0: several.",
  ),
  primitives: score(
    "2: every sub-function's primitive is the reference's or an accepted alternative, and its job is literally what happens there. 1: one is a stretch. 0: one is bent or wrong.",
  ),
  subfunctions: score(
    "2: each lesson's sub-functions are the right steps, in the order they would be discovered, each leaving the next undone. 1: one is redundant, missing or out of order. 0: worse.",
  ),
  givens: score("2: the givens are complete and nothing lesson-worthy hides among them. 1: one mechanism is missing or misfiled. 0: worse."),
  order: score("2: buildable in this order, the first mechanism is the foundation, and needs are right. 1: one mechanism is early or late. 0: worse."),
  gaps: score(
    "2: every gap is something a person would really do with exactly the build so far, with a visible result only this mechanism fixes. 1: one is vague, abstract or fixed by something else. 0: worse.",
  ),
  writing: score("2: plain, short, concrete, as a person holding the object would say it. 1: some jargon or padding. 0: reads like a manual or a textbook."),
  problems: Problems,
});

const LessonsGrade = z.object({
  rows: score("2: every why, need and symptom is true of this object and specific to it. 1: one is generic or doubtful. 0: one is false."),
  visible: score("2: every symptom is something you would see happen on the object. 1: one is abstract. 0: several."),
  distinct: score("2: within each mechanism no two symptoms could be confused. 1: one pair is close. 0: a pair is the same."),
  path: score(
    "2: the path is the real route of the motion from hand to result, complete and in order. 1: one item wrong or missing. 0: it follows the sub-function order or is wrong.",
  ),
  fit: score(
    "2: each step's format suits what is hard about its sub-function, and nothing is forced. 1: one step would work better as another format. 0: several.",
  ),
  ramp: score("2: each lesson starts with its easiest question and builds. 1: slightly out of order. 0: starts with the hardest."),
  variety: score("2: formats vary within and across lessons without forcing. 1: one repeated pattern. 0: every lesson has the same sequence."),
  breaking: score(
    "2: every break step names a clear failure and lists exactly the causes that produce it (2 as well when there is no break step and none is warranted). 1: a cause is missing or doubtful. 0: a listed cause does not produce it.",
  ),
  writing: score("2: plain, short, concrete. 1: some jargon or padding. 0: reads like a manual."),
  problems: Problems,
});

const PLAN_JUDGE = `You grade a plan for teaching how an everyday object works, written by a model, against the notes of the curriculum's designer. Grade what the plan says, strictly. A defect you can name costs a point.

How plans are meant to work. An object is the full list of its mechanisms; a mechanism is one thing the finished object does for its user, a feature you could print on the box. Each mechanism is a lesson (catalogue primitives do its work and their numbers must be right) or a given (self-evident, built without explanation). A lesson has 1 to 3 sub-functions: inner steps nobody would list as a feature, in the order you would discover them, each answered by exactly one catalogue primitive whose job is literally what happens there. The first mechanism has no gap; every later lesson has a gap: something a person would really do with the build so far, and what they would see go wrong, that only this mechanism fixes.

The designer's notes list what is required and which alternatives are acceptable. Where the notes are silent, judge by the rules above. Do not reward length.`;

const LESSONS_JUDGE = `You grade the questions written for a lesson plan about how an everyday object works. Grade strictly; a defect you can name costs a point. Check the physics yourself: do not assume a statement is true because it is confident.

How lessons are meant to work. For each lesson mechanism there is one row per sub-function (why this primitive, what the object needs of its number, and what you would see with it missing, too low or too high), a path (what a push passes through from hand to result, in motion order), and steps. Step formats: who (a sub-function is stated, pick the primitive), much (set the primitive's number to meet the need), broke (a symptom plays, find the primitive at fault), trace (tap the path in order), break (cause a named failure; every listed cause must really produce it). Each sub-function should get the format that tests what is hard about it. Formats should vary but never be forced.`;

const schemaOf = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(schema);
  return body;
};

async function judge() {
  const plans = (await load<PlanRun>("plan")).filter((r) => r.plan);
  const lessons = await load<LessonsRun>("lessons");
  const tasks = [
    ...plans.map((r) => async () => {
      const g = await gold(r.object);
      const text = `Designer's notes for this object:\n${g.accept.map((a) => `- ${a}`).join("\n")}${g.plan ? `\n\nDesigner's own plan:\n${renderPlan(g.plan)}` : ""}\n\nCatalogue:\n${CATALOGUE}\n\nPlan to grade:\n${renderPlan(r.plan!)}`;
      const grade = PlanGrade.parse((await ask(PLAN_JUDGE, schemaOf(PlanGrade), text, "problems", JUDGE)).output);
      await save("plan-grade", `${r.object}.${r.sample}`, grade);
      return { kind: "plan", name: `${r.object}.${r.sample}`, grade: grade as Record<string, unknown> };
    }),
    ...lessons.map((r) => async () => {
      const text = `Catalogue:\n${CATALOGUE}\n\nThe plan:\n${renderPlan(r.plan)}\n\nLessons to grade:\n${renderLessons(r.lessons)}`;
      const grade = LessonsGrade.parse((await ask(LESSONS_JUDGE, schemaOf(LessonsGrade), text, "problems", JUDGE)).output);
      await save("lessons-grade", `${r.object}.${r.sample}`, grade);
      return { kind: "lessons", name: `${r.object}.${r.sample}`, grade: grade as Record<string, unknown> };
    }),
  ];
  const graded = await pool(tasks);
  for (const kind of ["plan", "lessons"]) {
    const rows = graded.filter((g) => g.kind === kind);
    if (rows.length === 0) continue;
    const keys = Object.keys(rows[0]!.grade).filter((k) => k !== "problems");
    console.log(`\n${kind.toUpperCase()}  ${keys.join(" ")}  = total/${keys.length * 2}`);
    let sum = 0;
    for (const r of rows) {
      const total = keys.reduce((a, k) => a + (r.grade[k] as number), 0);
      sum += total;
      console.log(`${r.name.padEnd(16)} ${keys.map((k) => String(r.grade[k]).padStart(k.length)).join(" ")}  = ${total}`);
      for (const p of r.grade.problems as string[]) console.log(`    - ${p}`);
    }
    const means = keys.map((k) => `${k} ${(rows.reduce((a, r) => a + (r.grade[k] as number), 0) / rows.length).toFixed(2)}`);
    console.log(`MEAN ${(sum / rows.length).toFixed(2)}/${keys.length * 2}   ${means.join("  ")}`);
  }
}

async function show() {
  for (const r of await load<PlanRun>("plan"))
    console.log(
      `\n=== plan ${r.object}.${r.sample} (${(r.ms / 1000).toFixed(1)}s)\n${r.plan ? renderPlan(r.plan) : "NO PLAN"}${r.problems.map((p) => `\n  ! ${p}`).join("")}`,
    );
  for (const r of await load<LessonsRun>("lessons"))
    console.log(
      `\n=== lessons ${r.object}.${r.sample} (${(r.ms / 1000).toFixed(1)}s)\n${renderLessons(r.lessons)}${r.problems.map((p) => `\n  ! ${p}`).join("")}`,
    );
}

const commands: Record<string, () => Promise<void>> = { plan: runPlans, lessons: runLessons, judge, show };
await (commands[command ?? ""] ?? (() => fail(`usage: node scripts/curriculum-eval.ts <${Object.keys(commands).join("|")}> --tag <name>`)))();
process.exit(0);
