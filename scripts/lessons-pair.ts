// A paired judge for lessons. The absolute rubric in curriculum-eval.ts saturates: it takes a point for any defect it
// can name, and it can always name one. Here Opus reads two lesson sets written for the same plan, side by side and
// unlabelled, lists what is false or confusable in each, then says which is better on each count.
// Usage: node scripts/lessons-pair.ts --a l8 --b fr1 [--shift] [--jobs 5]
//   --shift pairs a's sample i with b's other sample, so `--a l8 --b l8 --shift` measures the judge's own noise.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { streamStructured } from "../server/claude.ts";
import { CATALOGUE } from "../server/catalogue.ts";
import type { MechanismLesson, Plan } from "../shared/curriculum.ts";

const { values } = parseArgs({
  options: { a: { type: "string" }, b: { type: "string" }, shift: { type: "boolean", default: false }, jobs: { type: "string", default: "5" } },
});
if (!values.a || !values.b) throw new Error("usage: node scripts/lessons-pair.ts --a <tag> --b <tag>");
const root = new URL("../out/curriculum/", import.meta.url);
type Run = { object: string; sample: number; plan: Plan; lessons: MechanismLesson[] };
const read = async (tag: string, name: string) => JSON.parse(await readFile(new URL(`${tag}/lessons/${name}.json`, root), "utf8")) as Run;

const renderPlan = (plan: Plan): string =>
  [
    `${plan.object}: ${plan.job}`,
    ...plan.mechanisms.map((m, i) =>
      [
        `${i + 1}. ${m.lesson ? "LESSON" : "given "} ${m.name} [${m.id}] — ${m.does}  (parts: ${m.parts.join(", ") || "none"})`,
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
const renderLessons = (lessons: MechanismLesson[]): string =>
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

const SYSTEM = `You compare two sets of lessons, X and Y, written for the same plan of how an everyday object works. Check the physics yourself; do not trust a statement because it is confident. The plan and its primitives are fixed: do not blame either set for the plan's choices, only for what it wrote.

How lessons work. For each lesson mechanism there is one row per sub-function (why this primitive, what the object needs of its number, and what you would see with it missing, too low or too high), a path (what a push passes through from hand to result, in motion order), and steps: who (a sub-function is stated, pick the primitive), much (set the number), broke (a symptom plays, find the primitive at fault), trace (tap the path in order), break (cause a named failure; every listed cause must really produce it).

First list the defects of each set, then give the verdicts. A verdict is "same" unless one set is clearly better on that count: sentences the two sets share word for word cannot decide it.`;

const side = z.enum(["X", "Y", "same"]);
const Verdict = z.object({
  falseX: z.array(z.string()).describe("Each why, need or symptom in X that is false or doubtful physics for this object. Quote it, at most 15 words each."),
  falseY: z.array(z.string()).describe("The same for Y."),
  alikeX: z.array(z.string()).describe("Each pair of symptoms within one mechanism of X that a person watching could confuse. At most 15 words each."),
  alikeY: z.array(z.string()).describe("The same for Y."),
  truth: side.describe("Whose rows are truer of this object."),
  distinct: side.describe("Whose symptoms are easier to tell apart."),
  path: side.describe("Whose paths are closer to the real route of the motion, complete and in order."),
  steps: side.describe("Whose steps fit their sub-functions better, build from easy to hard, and have exactly one right answer."),
  overall: side.describe("Which set you would put in front of a learner."),
});
const schema = ((): Record<string, unknown> => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(Verdict);
  return body;
})();

const names = (await readdir(new URL(`${values.a}/lessons/`, root))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const tasks = names.map((name, index) => async () => {
  const [object, sample] = name.split(".") as [string, string];
  const a = await read(values.a!, name);
  const b = await read(values.b!, values.shift ? `${object}.${1 - Number(sample)}` : name);
  // Alternate which tag is shown first, so a taste for X or Y cancels out.
  const aIsX = index % 2 === 0;
  const text = `Catalogue:\n${CATALOGUE}\n\nThe plan:\n${renderPlan(a.plan)}\n\nSet X:\n${renderLessons((aIsX ? a : b).lessons)}\n\nSet Y:\n${renderLessons((aIsX ? b : a).lessons)}`;
  for await (const event of streamStructured({
    system: SYSTEM,
    schema,
    brain: { model: "claude-opus-5-5", effort: "medium" },
    content: [{ type: "text", text }],
    streamKey: "falseX",
  })) {
    if (event.type !== "result") continue;
    const v = Verdict.parse(event.output);
    const who = (s: "X" | "Y" | "same") => (s === "same" ? "same" : (s === "X") === aIsX ? "a" : "b");
    return {
      name,
      falseA: (aIsX ? v.falseX : v.falseY).length,
      falseB: (aIsX ? v.falseY : v.falseX).length,
      alikeA: (aIsX ? v.alikeX : v.alikeY).length,
      alikeB: (aIsX ? v.alikeY : v.alikeX).length,
      truth: who(v.truth),
      distinct: who(v.distinct),
      path: who(v.path),
      steps: who(v.steps),
      overall: who(v.overall),
      raw: { aIsX, ...v },
    };
  }
  throw new Error("no result");
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
const label = `${values.a}-vs-${values.b}${values.shift ? "-shift" : ""}`;
await mkdir(new URL("pairs/", root), { recursive: true });
await writeFile(new URL(`pairs/${label}.json`, root), `${JSON.stringify(results, null, 2)}\n`);
const tally = (key: "truth" | "distinct" | "path" | "steps" | "overall") => {
  const count = (w: string) => results.filter((r) => r[key] === w).length;
  return `${key} ${count("a")}-${count("b")} (${count("same")} same)`;
};
const mean = (key: "falseA" | "falseB" | "alikeA" | "alikeB") => (results.reduce((s, r) => s + r[key], 0) / results.length).toFixed(1);
console.log(
  `a=${values.a} b=${values.b}${values.shift ? " (shifted)" : ""}, n ${results.length}, wins a-b: ${(["truth", "distinct", "path", "steps", "overall"] as const).map(tally).join(" | ")} | false claims per run ${mean("falseA")} vs ${mean("falseB")} | alike pairs ${mean("alikeA")} vs ${mean("alikeB")}`,
);
process.exit(0);
