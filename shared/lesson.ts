import { z } from "zod";
import type { Kit } from "./kit.ts";
import { RULES, WORDS } from "./rules.ts";

const Paragraphs = z.array(z.string()).describe("Short paragraphs, 1 to 3 sentences each.");

const Run = z
  .object({
    type: z.literal("run"),
    action: z.string().describe(`Button label for trying the build as it stands, ${RULES.runActionWords.min} to ${RULES.runActionWords.max} words, e.g. 'Draw a line'.`),
    outcome: z.string().describe("What happens when it runs, with a concrete number. This is a failure that motivates the next step, or the payoff of a join."),
  })
  .describe("Try the current build and watch what happens.");

const Pick = z
  .object({
    type: z.literal("pick"),
    question: z.string().describe("The failure restated as a choice, e.g. 'What could stop the tip from sliding back in?'"),
    options: z
      .array(
        z.object({
          primitive: z.string().describe("A primitive id from the catalogue."),
          works: z.boolean(),
          outcome: z.string().describe("What happens if you try this one, in one or two sentences. Wrong options fail for a specific physical reason, not because they are 'wrong'."),
        }),
      )
      .describe(`${RULES.options.min} or ${RULES.options.max} options. Exactly one works, and it is the step's primitive.`),
  })
  .describe("Choose which primitive answers the failure. Every choice plays out.");

const Tune = z
  .object({
    type: z.literal("tune"),
    goal: z.string().describe("What the setting has to achieve, with the numbers that matter."),
    slider: z.string().describe("Id of one of the step primitive's sliders."),
    min: z.number().describe("Lowest value that works, in the slider's units."),
    max: z.number().describe("Highest value that works."),
    tooLow: z.string().describe("What fails below min, physically and with a number."),
    tooHigh: z.string().describe("What fails above max."),
    justRight: z.string().describe("Why a value in the window works."),
  })
  .describe("Set one of the primitive's numbers so the build works. Both too little and too much fail, differently.");

export const Problem = z.discriminatedUnion("type", [Run, Pick, Tune]);
export type Problem = z.infer<typeof Problem>;
export type ProblemType = Problem["type"];

export const Step = z.object({
  id: z.string(),
  title: z.string().describe(`${RULES.stepTitleWords.min} to ${RULES.stepTitleWords.max} words.`),
  story: Paragraphs.describe(`One short paragraph of about ${WORDS.story.aim} words. Leads from the previous failure to this step's problem. Explain only what this step needs, and introduce a principle just before it is used.`),
  primitive: z.string().nullable().describe("The catalogue primitive this step is about, or null when no primitive is involved yet (a naive build)."),
  problem: Problem.nullable(),
  payoff: Paragraphs.describe(`Under ${WORDS.payoff.aim} words. Shown once the problem is solved: why it works, the name of the part now that its job has been shown, and any small detail that exists for a reason.`),
  earns: z.array(z.string()).describe("Ids of the scanned kit's parts this step adds to the build. Can be empty."),
});
export type Step = z.infer<typeof Step>;

const Module = z.object({
  kind: z.literal("module"),
  id: z.string(),
  need: z.string().describe("The requirement, as 'It must ...'."),
  why: z.string().describe("Why this requirement comes now: for the first module, the object's job; afterwards, a failure of what has been built."),
  surprise: z.boolean().describe("True when someone who has used the object would not list this requirement up front. It stays hidden on the roadmap until reached."),
  steps: z.array(Step).describe("The naive build first, then one step per sub-problem."),
});

const Join = z.object({
  kind: z.literal("join"),
  id: z.string(),
  title: z.string(),
  steps: z.array(Step).describe("Usually one step: run the modules together. It either works, which is the payoff, or exposes a requirement none of them has alone."),
});

const Casing = z.object({
  kind: z.literal("casing"),
  id: z.string(),
  title: z.string(),
  steps: z.array(Step).describe("The body, shell or frame whose shape now follows from everything inside it, and the interface the user touches."),
});

export const Chapter = z.discriminatedUnion("kind", [Module, Join, Casing]);
export type Chapter = z.infer<typeof Chapter>;

export const Lesson = z.object({
  title: z.string().describe("The invention's name."),
  hook: Paragraphs.describe(`Opening over the finished object: what it does, and the question the lesson will answer. Under ${WORDS.hook.aim} words.`),
  chapters: z.array(Chapter).describe("Modules in order of need, joins where modules meet, the casing last."),
  closing: Paragraphs.describe(`Shown over the finished build: what the reader now sees when they look at one. Under ${WORDS.closing.aim} words.`),
});
export type Lesson = z.infer<typeof Lesson>;

export const LessonHeader = Lesson.pick({ title: true, hook: true });
export type LessonHeader = z.infer<typeof LessonHeader>;

/** What a reader was shown of a lesson before it failed. A retry sends it back so the new lesson continues from it. */
export const Shown = z.object({ header: LessonHeader.optional(), chapters: z.array(Chapter) });
export type Shown = z.infer<typeof Shown>;

export type CatalogEntry = { id: string; sliders: { id: string; min: number; max: number; initial: number }[] };

export class LessonError extends Error {}

export function parseLesson(raw: unknown, kit: Kit, catalog: CatalogEntry[]): Lesson {
  const lesson = Lesson.parse(raw);
  const problems = lessonProblems(lesson, kit, catalog);
  if (problems.length > 0) throw new LessonError(problems.join("\n"));
  return lesson;
}

export const allSteps = (lesson: Lesson): Step[] => lesson.chapters.flatMap((c) => c.steps);

export const LessonEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started"), title: z.string(), hook: z.array(z.string()) }),
  z.object({ type: z.literal("chapter"), chapter: Chapter }),
  z.object({ type: z.literal("done"), lesson: Lesson }),
  z.object({ type: z.literal("failed"), message: z.string() }),
]);
export type LessonEvent = z.infer<typeof LessonEvent>;

const wordCount = (paragraphs: string[]) => paragraphs.join(" ").split(/\s+/).filter(Boolean).length;

function overLength(where: string, what: keyof typeof WORDS, paragraphs: string[]): string[] {
  const words = wordCount(paragraphs);
  return words > WORDS[what].max ? [`${where} ${what} is ${words} words; write about ${WORDS[what].aim}`] : [];
}

/** Checks that need only the title and hook, so they can be shown before the chapters are written. */
export const headerProblems = (header: Pick<Lesson, "hook">): string[] => overLength("the lesson", "hook", header.hook);

/** Checks that need only the chapter itself, so a chapter can be shown as soon as it is written. */
export function chapterProblems(chapter: Chapter, catalog: CatalogEntry[]): string[] {
  const primitives = new Map(catalog.map((p) => [p.id, p]));
  const problems: string[] = [];
  if (chapter.steps.length === 0) problems.push(`${chapter.id} has no steps`);
  for (const step of chapter.steps) {
    const where = `${chapter.id}/${step.id}`;
    problems.push(...overLength(where, "story", step.story), ...overLength(where, "payoff", step.payoff));
    const primitive = step.primitive === null ? undefined : primitives.get(step.primitive);
    if (step.primitive !== null && !primitive) problems.push(`${where} uses unknown primitive ${step.primitive}`);
    const problem = step.problem;
    if (problem?.type === "pick") {
      const working = problem.options.filter((o) => o.works);
      if (working.length !== 1) problems.push(`${where} pick needs exactly one working option`);
      else if (working[0]?.primitive !== step.primitive) problems.push(`${where} pick's working option must be the step's primitive`);
      for (const o of problem.options) if (!primitives.has(o.primitive)) problems.push(`${where} pick offers unknown primitive ${o.primitive}`);
      if (problem.options.length < RULES.options.min || problem.options.length > RULES.options.max) problems.push(`${where} pick needs ${RULES.options.min} or ${RULES.options.max} options`);
    }
    if (problem?.type === "tune") {
      const slider = primitive?.sliders.find((s) => s.id === problem.slider);
      if (!slider) {
        problems.push(`${where} tune uses slider ${problem.slider}, which ${step.primitive ?? "no primitive"} doesn't have`);
        continue;
      }
      if (!(problem.min < problem.max)) problems.push(`${where} tune window min must be below max`);
      if (problem.min <= slider.min || problem.max >= slider.max) problems.push(`${where} tune window ${problem.min}..${problem.max} must sit strictly inside the slider's range ${slider.min}..${slider.max}, so both failures are reachable`);
      if (slider.initial >= problem.min && slider.initial <= problem.max) problems.push(`${where} tune starts inside the window (initial ${slider.initial}); choose a window the starting value misses`);
    }
  }
  return problems;
}

export function lessonProblems(lesson: Lesson, kit: Kit, catalog: CatalogEntry[]): string[] {
  const problems: string[] = [];
  const kinds = lesson.chapters.map((c) => c.kind);
  if (kinds[0] !== "module") problems.push("the first chapter must be a module");
  if (kinds.at(-1) !== "casing") problems.push("the last chapter must be the casing");
  if (kinds.filter((k) => k === "casing").length !== 1) problems.push("there must be exactly one casing chapter");
  problems.push(...headerProblems(lesson), ...overLength("the lesson", "closing", lesson.closing));

  const partIds = new Set(kit.parts.map((p) => p.id));
  const earned = new Map<string, string>();
  for (const chapter of lesson.chapters) {
    problems.push(...chapterProblems(chapter, catalog));
    for (const step of chapter.steps) {
      for (const id of step.earns) {
        const where = `${chapter.id}/${step.id}`;
        if (!partIds.has(id)) problems.push(`${where} earns unknown part ${id}`);
        else if (earned.has(id)) problems.push(`${where} earns ${id}, already earned in ${earned.get(id)}`);
        else earned.set(id, where);
      }
    }
  }
  for (const id of partIds) if (!earned.has(id)) problems.push(`part ${id} is never earned`);
  return problems;
}
