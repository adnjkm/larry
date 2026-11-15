// The curriculum: how an object is taught. Written in two passes so a reader never waits for all of it.
//   1. Plan: every mechanism the object is made of, which are lessons, their order, the gap each one fills,
//      and each lesson's sub-functions with the primitive that answers them.
//   2. Lessons: per lesson mechanism, the facts the apply steps read from and the steps themselves.
import { z } from "zod";
import type { Kit } from "./kit.ts";

const Id = z.string().describe("Short kebab-case id.");

/** What the planner is told about the object: the scan without its geometry. */
export type Brief = { name: string; summary: string; parts: { id: string; name: string; role: string; parentId: string | null; joint: string | null }[] };

export const briefOf = (kit: Kit): Brief => ({
  name: kit.name,
  summary: kit.summary,
  parts: kit.parts.map(({ id, name, role, parentId, joint }) => ({ id, name, role, parentId, joint })),
});

export const LIMITS = {
  lessons: 3,
  subfunctions: 3,
  path: { min: 3, max: 6 },
  /** A lesson asks one question per sub-function and at most this many more. */
  extraSteps: 2,
  /** Word budgets: `aim` is what the schema asks for, `max` is where a draft is sent back. Models count loosely, so max sits well above aim. */
  words: {
    job: { aim: 10, max: 16 },
    does: { aim: 8, max: 14 },
    subfunction: { aim: 6, max: 11 },
    gapTry: { aim: 8, max: 14 },
    gapFails: { aim: 10, max: 16 },
    why: { aim: 16, max: 24 },
    need: { aim: 14, max: 22 },
    symptom: { aim: 10, max: 18 },
    failure: { aim: 8, max: 13 },
    pathName: { aim: 2, max: 4 },
  },
} as const;

export const Subfunction = z.object({
  id: Id,
  does: z.string().describe(`One effect, as a short command: "Bring the tip back in". About ${LIMITS.words.subfunction.aim} words.`),
  primitive: z.string().describe("The catalogue primitive whose job is literally what happens here."),
});
export type Subfunction = z.infer<typeof Subfunction>;

export const Gap = z.object({
  try: z.string().describe(`One of the uses, done with only the mechanisms above, as a command: "Tip it over". About ${LIMITS.words.gapTry.aim} words.`),
  fails: z.string().describe(`The trouble they meet that this mechanism exists to prevent. About ${LIMITS.words.gapFails.aim} words.`),
});
export type Gap = z.infer<typeof Gap>;

export const Mechanism = z.object({
  id: Id,
  name: z.string().describe("1 to 3 words."),
  does: z.string().describe(`The job, as a user would name it without opening the object. About ${LIMITS.words.does.aim} words.`),
  parts: z.array(z.string()).describe("Ids of the scanned parts it is made of, works through or is hidden inside. Never empty."),
  needs: z.array(z.string()).describe("Ids of earlier mechanisms that must exist before this one can be built or used."),
  subfunctions: z
    .array(Subfunction)
    .describe(`The job's 1 to ${LIMITS.subfunctions} steps in the order a builder meets them, one effect each. Empty for a given.`),
  lesson: z.boolean().describe("True when the sub-functions do the job."),
  gap: Gap.nullable().describe("null for a given and for the first mechanism."),
});
export type Mechanism = z.infer<typeof Mechanism>;

export const Plan = z.object({
  object: z.string().describe("What it is, 1 to 4 words."),
  job: z.string().describe(`What it is for. About ${LIMITS.words.job.aim} words.`),
  uses: z
    .array(z.string())
    .describe("What a person does with the finished object across one whole use and the next. 2 to 5 short commands, each ending in a full stop."),
  mechanisms: z.array(Mechanism).describe("Every mechanism, in build order."),
});
export type Plan = z.infer<typeof Plan>;

export const PlanHeader = Plan.pick({ object: true, job: true, uses: true });

export const FAULTS = ["missing", "little", "much"] as const;
export const Fault = z.enum(FAULTS);
export type Fault = z.infer<typeof Fault>;

const symptom = `What a person would see this object do, everything else being right. About ${LIMITS.words.symptom.aim} words.`;

/** Everything the apply steps need to know about one sub-function. */
export const Row = z.object({
  id: Id.describe("The sub-function's id from the plan."),
  why: z
    .string()
    .describe(
      `Why this primitive does it here. Where it trades force for travel, say which way, never both. One sentence, about ${LIMITS.words.why.aim} words.`,
    ),
  need: z
    .string()
    .nullable()
    .describe(
      `What this object asks of the primitive's number, both sides, named as the feature it sets here (how long an arm, how steep a face). About ${LIMITS.words.need.aim} words. null when any value would do.`,
    ),
  missing: z.string().describe(`What happens with the primitive taken out. ${symptom}`),
  little: z.string().nullable().describe(`What happens when its number is too low. ${symptom} null when need is null.`),
  much: z.string().nullable().describe(`What happens when its number is too high. ${symptom} null when need is null.`),
});
export type Row = z.infer<typeof Row>;

const Cause = z.object({ subfunction: Id, fault: Fault });

export const Step = z.discriminatedUnion("format", [
  z.object({ format: z.literal("who"), subfunction: Id }).describe("Who does this? The sub-function is stated and the learner picks the primitive."),
  z.object({ format: z.literal("much"), subfunction: Id }).describe("How much? The learner sets the primitive's number to meet the row's need."),
  z
    .object({ format: z.literal("broke"), subfunction: Id, fault: Fault })
    .describe("What broke? The row's symptom for this fault plays; the learner finds the primitive at fault and fixes it."),
  z.object({ format: z.literal("trace") }).describe("Trace it. The learner taps the path in order."),
  z
    .object({
      format: z.literal("break"),
      failure: z
        .string()
        .describe(`One failure a person would see, as a command: "Make the door rattle in its frame". About ${LIMITS.words.failure.aim} words.`),
      causes: z
        .array(Cause)
        .describe("Every sub-function of this mechanism and fault whose row symptom shows this failure, and no other. Any one of them is a right answer."),
    })
    .describe("Break it. The learner changes one thing so the named failure happens."),
]);
export type Step = z.infer<typeof Step>;
export type Format = Step["format"];
export const FORMATS: Format[] = ["who", "broke", "much", "trace", "break"];

export const MechanismLesson = z.object({
  id: Id.describe("The mechanism's id from the plan."),
  rows: z.array(Row).describe("One per sub-function, same ids, same order."),
  path: z
    .array(z.string().describe(`A part or piece, 1 to ${LIMITS.words.pathName.max} words.`))
    .describe(`What the motion passes through, from where it starts to what it acts on, in order. ${LIMITS.path.min} to ${LIMITS.path.max} names.`),
  steps: z.array(Step).describe("The questions, in the order they are asked."),
});
export type MechanismLesson = z.infer<typeof MechanismLesson>;

export const Lessons = z.object({ lessons: z.array(MechanismLesson).describe("One per lesson mechanism, in plan order.") });
export type Lessons = z.infer<typeof Lessons>;

export const Curriculum = z.object({ plan: Plan, lessons: z.array(MechanismLesson) });
export type Curriculum = z.infer<typeof Curriculum>;

export const CurriculumEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("plan"), plan: Plan }),
  z.object({ type: z.literal("lesson"), lesson: MechanismLesson }),
  z.object({ type: z.literal("done"), curriculum: Curriculum }),
  z.object({ type: z.literal("failed"), message: z.string() }),
]);
export type CurriculumEvent = z.infer<typeof CurriculumEvent>;

export class CurriculumError extends Error {}

export const lessonMechanisms = (plan: Plan): Mechanism[] => plan.mechanisms.filter((m) => m.lesson);

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
type Budget = { aim: number; max: number };
const tooLong = (where: string, text: string | null, budget: Budget): string[] =>
  text !== null && words(text) > budget.max ? [`${where} is ${words(text)} words; write about ${budget.aim}`] : [];
const hasDigit = (where: string, text: string | null): string[] =>
  text !== null && /\d/.test(text) ? [`${where} contains a number; say what a person would see instead`] : [];
const duplicates = (ids: string[]): string[] => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

/** The rules a plan must keep, as sentences Claude can act on. Empty means the plan holds together. */
export function planProblems(plan: Plan, brief: Brief, primitives: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const text = (where: string, value: string | null, budget: Budget) => problems.push(...tooLong(where, value, budget), ...hasDigit(where, value));

  text("job", plan.job, LIMITS.words.job);
  if (plan.mechanisms.length === 0) problems.push("the plan has no mechanisms");
  for (const id of duplicates(plan.mechanisms.map((m) => m.id))) problems.push(`mechanism id ${id} is used twice`);

  const lessons = lessonMechanisms(plan);
  if (lessons.length > LIMITS.lessons)
    problems.push(`${lessons.length} mechanisms are lessons; keep the ${LIMITS.lessons} a person understands least and make the rest givens`);

  const known = new Set(brief.parts.map((p) => p.id));
  const used = new Set<string>();
  const built = new Set<string>();
  for (const [index, m] of plan.mechanisms.entries()) {
    text(`${m.id} does`, m.does, LIMITS.words.does);
    for (const part of m.parts) known.has(part) ? used.add(part) : problems.push(`${m.id} lists ${part}, which is not a scanned part`);
    for (const need of m.needs) if (!built.has(need)) problems.push(`${m.id} needs ${need}, which is not built before it`);
    built.add(m.id);

    if (!m.lesson) {
      if (m.gap) problems.push(`${m.id} is a given, so it has no gap`);
      if (m.subfunctions.length > 0) problems.push(`${m.id} is a given, so it has no sub-functions`);
      continue;
    }
    if (index === 0 && m.gap) problems.push(`${m.id} is the first mechanism, so it has no gap`);
    if (index > 0 && !m.gap) problems.push(`${m.id} is a lesson after the first mechanism, so it needs a gap`);
    if (m.gap) {
      text(`${m.id} gap.try`, m.gap.try, LIMITS.words.gapTry);
      text(`${m.id} gap.fails`, m.gap.fails, LIMITS.words.gapFails);
    }
    if (m.subfunctions.length < 1 || m.subfunctions.length > LIMITS.subfunctions)
      problems.push(`${m.id} has ${m.subfunctions.length} sub-functions; a lesson has 1 to ${LIMITS.subfunctions}`);
    for (const s of m.subfunctions) {
      text(`${m.id}/${s.id} does`, s.does, LIMITS.words.subfunction);
      if (!primitives.has(s.primitive)) problems.push(`${m.id}/${s.id} uses ${s.primitive}, which is not in the catalogue`);
    }
  }
  for (const id of duplicates(lessons.flatMap((m) => m.subfunctions.map((s) => s.id)))) problems.push(`sub-function id ${id} is used twice`);
  for (const part of known) if (!used.has(part)) problems.push(`scanned part ${part} belongs to no mechanism`);
  return problems;
}

/** The rules one mechanism's lesson must keep against the plan it was written for. */
export function lessonProblems(lesson: MechanismLesson, mechanism: Mechanism): string[] {
  const problems: string[] = [];
  const at = lesson.id;
  const text = (where: string, value: string | null, budget: Budget) =>
    problems.push(...tooLong(`${at} ${where}`, value, budget), ...hasDigit(`${at} ${where}`, value));

  const planned = mechanism.subfunctions.map((s) => s.id);
  if (lesson.rows.map((r) => r.id).join() !== planned.join()) problems.push(`${at} rows must be ${planned.join(", ")}, in that order`);
  const rows = new Map(lesson.rows.map((r) => [r.id, r]));
  for (const row of lesson.rows) {
    text(`${row.id} why`, row.why, LIMITS.words.why);
    text(`${row.id} need`, row.need, LIMITS.words.need);
    for (const fault of FAULTS) text(`${row.id} ${fault}`, row[fault], LIMITS.words.symptom);
    if ((row.need === null) !== (row.little === null) || (row.need === null) !== (row.much === null))
      problems.push(`${at} ${row.id}: need, little and much are all written or all null`);
  }

  if (lesson.path.length < LIMITS.path.min || lesson.path.length > LIMITS.path.max)
    problems.push(`${at} path has ${lesson.path.length} names; it needs ${LIMITS.path.min} to ${LIMITS.path.max}`);
  for (const name of lesson.path) text(`path "${name}"`, name, LIMITS.words.pathName);

  const subject = new Set<string>();
  const fits = (where: string, id: string, fault?: Fault) => {
    const row = rows.get(id);
    if (!row) return problems.push(`${at} ${where} names ${id}, which is not one of this mechanism's sub-functions`);
    if (fault && row[fault] === null) problems.push(`${at} ${where} uses ${id}'s "${fault}", which is null`);
    return undefined;
  };
  for (const [i, step] of lesson.steps.entries()) {
    const where = `step ${i + 1} (${step.format})`;
    if (step.format === "trace") continue;
    if (step.format === "break") {
      text(`${where} failure`, step.failure, LIMITS.words.failure);
      if (step.causes.length === 0) problems.push(`${at} ${where} lists no causes`);
      for (const cause of step.causes) fits(where, cause.subfunction, cause.fault);
      continue;
    }
    fits(where, step.subfunction, step.format === "broke" ? step.fault : undefined);
    if (step.format === "much" && rows.get(step.subfunction)?.need === null)
      problems.push(`${at} ${where} asks how much of ${step.subfunction}, whose need is null`);
    subject.add(step.subfunction);
  }
  for (const id of planned) if (!subject.has(id)) problems.push(`${at} never asks about ${id}; each sub-function is the subject of a who, much or broke step`);
  for (const format of ["trace", "break"] as const)
    if (lesson.steps.filter((s) => s.format === format).length > 1) problems.push(`${at} uses ${format} more than once`);
  for (let i = 1; i < lesson.steps.length; i++)
    if (lesson.steps[i]?.format === lesson.steps[i - 1]?.format)
      problems.push(`${at} steps ${i} and ${i + 1} are both ${lesson.steps[i]?.format}; do not repeat a format back to back`);
  const most = planned.length + LIMITS.extraSteps;
  if (lesson.steps.length < planned.length || lesson.steps.length > most)
    problems.push(`${at} has ${lesson.steps.length} steps; it needs ${planned.length} to ${most}`);
  return problems;
}

/** Every rule a whole curriculum must keep. */
export function curriculumProblems(curriculum: Curriculum, brief: Brief, primitives: ReadonlySet<string>): string[] {
  const problems = planProblems(curriculum.plan, brief, primitives);
  const written = new Map(curriculum.lessons.map((l) => [l.id, l]));
  for (const mechanism of lessonMechanisms(curriculum.plan)) {
    const lesson = written.get(mechanism.id);
    problems.push(...(lesson ? lessonProblems(lesson, mechanism) : [`${mechanism.id} has no lesson`]));
  }
  return problems;
}
