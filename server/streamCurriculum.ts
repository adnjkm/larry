import {
  type Brief,
  CurriculumError,
  type CurriculumEvent,
  Lessons,
  type Mechanism,
  MechanismLesson,
  Plan,
  lessonMechanisms,
  lessonProblems,
  planProblems,
} from "../shared/curriculum.ts";
import { completePlan, libraryLessons, withoutKnownLessons } from "../shared/mechanisms/plan.ts";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { type Brain, streamStructured } from "./claude.ts";
import { LESSONS_SYSTEM, lessonsRequest } from "./lessonsPrompt.ts";
import { REVIEW_SYSTEM, Review, applyReview, reviewJsonSchema, reviewRequest } from "./lessonsReview.ts";
import { PLAN_SYSTEM, planRequest } from "./planPrompt.ts";
import { lessonsJsonSchema, planJsonSchema } from "./schemas.ts";

const PRIMITIVE_IDS: ReadonlySet<string> = new Set(PRIMITIVES.map((p) => p.id));

/** `review` is the second look at each written lesson (server/lessonsReview.ts); null skips it. */
export type CurriculumBrains = { plan: Brain; lessons: Brain; review: Brain | null };
export const CURRICULUM_BRAINS: CurriculumBrains = {
  // Measured on 12 objects: Opus at low effort plans as fast as Sonnet at low effort (about 10 s) and agrees with itself from run to run far more often.
  plan: { model: "claude-opus-5-5", effort: "low" },
  // Nobody waits on the lessons, so they are written by the model that gets the physics right more often, at the same speed.
  lessons: { model: "claude-opus-5-5", effort: "low" },
  review: { model: "claude-opus-5-5", effort: "low" },
};

/** A sub-function whose primitive the reviewer found not to be honest on this object: feedback for the plan, never shown to the learner. */
export type PlanFlag = { mechanism: string; row: string; note: string };

export type CallStats = { ms: number; costUsd: number; attempts: number };
export type CurriculumStats = { plan: CallStats; lessons: CallStats; firstLessonMs: number | undefined };

type Ask = typeof streamStructured;
type Options = { brain?: Brain; ask?: Ask; signal?: AbortSignal; onStats?: (stats: CallStats) => void };
type LessonOptions = Options & { review?: Brain | null; onFlag?: (flag: PlanFlag) => void };

const feedback = (problems: string[], previous: unknown): string =>
  `\n\nYour previous answer broke these rules. Write it again with them fixed and everything else kept:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nPrevious answer:\n${JSON.stringify(previous)}`;

/**
 * Slips that change nothing a reader would see are fixed here instead of costing a rewrite, which would double the wait:
 * parts that were never scanned are dropped, and a given, or the first mechanism, loses a gap it should not have.
 */
function repairPlan(written: Plan, brief: Brief): Plan {
  const plan = completePlan(written);
  const known = new Set(brief.parts.map((p) => p.id));
  return {
    ...plan,
    mechanisms: plan.mechanisms.map((m, index) => ({
      ...m,
      parts: m.parts.filter((id) => known.has(id)),
      gap: m.lesson && index > 0 ? m.gap : null,
      subfunctions: m.lesson ? m.subfunctions : [],
    })),
  };
}

/** Writes the plan. If it breaks a rule it is written once more with the rule spelled out, and the second answer must hold. */
export async function writePlan(brief: Brief, { brain = CURRICULUM_BRAINS.plan, ask = streamStructured, signal, onStats }: Options = {}): Promise<Plan> {
  const started = Date.now();
  let costUsd = 0;
  let retry = "";
  for (let attempt = 1; ; attempt++) {
    let output: unknown;
    const content = [{ type: "text" as const, text: `${planRequest(brief)}${retry}` }];
    for await (const event of ask({ system: PLAN_SYSTEM, schema: planJsonSchema, brain, content, streamKey: "mechanisms", signal })) {
      if (event.type !== "result") continue;
      output = event.output;
      costUsd += event.costUsd;
    }
    const written = Plan.safeParse(output);
    if (!written.success) throw new CurriculumError(`The plan did not match its schema: ${written.error.message}`);
    const plan = repairPlan(written.data, brief);
    const problems = planProblems(plan, brief, PRIMITIVE_IDS);
    if (problems.length === 0 || attempt === 2) {
      onStats?.({ ms: Date.now() - started, costUsd, attempts: attempt });
      if (problems.length > 0) throw new CurriculumError(problems.join("\n"));
      return plan;
    }
    retry = feedback(problems, plan);
  }
}

/**
 * Yields each mechanism's lesson as soon as it is written, holds together and has had its second look, so the first is
 * playable while the rest are still being written and reviewed. Lessons can arrive out of plan order.
 */
export async function* writeLessons(
  plan: Plan,
  { brain = CURRICULUM_BRAINS.lessons, review = CURRICULUM_BRAINS.review, ask = streamStructured, signal, onStats, onFlag }: LessonOptions = {},
): AsyncGenerator<MechanismLesson> {
  const started = Date.now();
  const stats = { costUsd: 0, attempts: 0 };
  const drafts = draftLessons(plan, brain, ask, signal, stats);
  try {
    if (!review) for await (const draft of drafts) yield draft.lesson;
    else yield* asReady(drafts, (draft) => reviewLesson(plan, draft, { brain: review, ask, signal, onFlag }, stats));
  } finally {
    if (stats.attempts > 0) onStats?.({ ms: Date.now() - started, ...stats });
  }
}

/**
 * The second look: a failed or broken review costs nothing but its time, because the lesson as drafted already holds together.
 */
async function reviewLesson(
  plan: Plan,
  draft: Draft,
  { brain, ask, signal, onFlag }: { brain: Brain; ask: Ask; signal?: AbortSignal; onFlag?: (flag: PlanFlag) => void },
  stats: { costUsd: number },
): Promise<MechanismLesson> {
  try {
    const content = [{ type: "text" as const, text: reviewRequest(plan, draft.lesson) }];
    for await (const event of ask({ system: REVIEW_SYSTEM, schema: reviewJsonSchema, brain, content, streamKey: "fixes", signal })) {
      if (event.type !== "result") continue;
      stats.costUsd += event.costUsd;
      const written = Review.safeParse(event.output);
      if (!written.success) break;
      for (const flag of written.data.flags) onFlag?.({ mechanism: draft.mechanism.id, ...flag });
      return applyReview(draft.lesson, written.data, draft.mechanism);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return draft.lesson;
}

/** Runs `work` on each item as it arrives and yields the results as they finish, so slow work on one never holds back the source or the others. */
async function* asReady<T, U>(source: AsyncGenerator<T>, work: (item: T) => Promise<U>): AsyncGenerator<U> {
  type Settled = { step: IteratorResult<T> } | { error: unknown } | { result: U; from: Promise<Settled> };
  const pull = (): Promise<Settled> =>
    source.next().then(
      (step) => ({ step }),
      (error: unknown) => ({ error }),
    );
  const working = new Set<Promise<Settled>>();
  let next: Promise<Settled> | null = pull();
  let failure: { error: unknown } | undefined;
  while (next || working.size > 0) {
    const settled: Settled = await Promise.race([...(next ? [next] : []), ...working]);
    if ("result" in settled) {
      working.delete(settled.from);
      yield settled.result;
    } else if ("error" in settled) {
      failure = settled;
      next = null;
    } else if (settled.step.done) {
      next = null;
    } else {
      const from: Promise<Settled> = work(settled.step.value).then((result) => ({ result, from }));
      working.add(from);
      next = pull();
    }
  }
  if (failure) throw failure.error;
}

type Draft = { lesson: MechanismLesson; mechanism: Mechanism };

/** Each lesson as soon as it is written and keeps the rules. Lessons that break one are rewritten once, together, after the stream ends. */
async function* draftLessons(
  plan: Plan,
  brain: Brain,
  ask: Ask,
  signal: AbortSignal | undefined,
  stats: { costUsd: number; attempts: number },
): AsyncGenerator<Draft> {
  const wanted = new Map<string, Mechanism>(lessonMechanisms(plan).map((m) => [m.id, m]));
  if (wanted.size === 0) return;
  let retry = "";

  for (let attempt = 1; attempt <= 2 && wanted.size > 0; attempt++) {
    stats.attempts = attempt;
    const broken: { lesson: MechanismLesson; problems: string[] }[] = [];
    const content = [{ type: "text" as const, text: `${lessonsRequest(plan, attempt === 1 ? undefined : [...wanted.keys()])}${retry}` }];
    for await (const event of ask({ system: LESSONS_SYSTEM, schema: lessonsJsonSchema, brain, content, streamKey: "lessons", signal })) {
      if (event.type === "result") stats.costUsd += event.costUsd;
      if (event.type !== "item") continue;
      const lesson = MechanismLesson.safeParse(event.value);
      const mechanism = lesson.success ? wanted.get(lesson.data.id) : undefined;
      if (!lesson.success || !mechanism) continue;
      const problems = lessonProblems(lesson.data, mechanism);
      if (problems.length > 0) {
        broken.push({ lesson: lesson.data, problems });
        continue;
      }
      wanted.delete(mechanism.id);
      yield { lesson: lesson.data, mechanism };
    }
    retry = feedback(
      broken.flatMap((b) => b.problems),
      Lessons.parse({ lessons: broken.map((b) => b.lesson) }),
    );
  }
  if (wanted.size > 0) throw new CurriculumError(`No lesson that holds together for ${[...wanted.keys()].join(", ")}`);
}

/**
 * The whole curriculum as events: the plan first, so the reader sees every mechanism and can start on the first one's
 * primitives, then each lesson as it is written, then everything together.
 */
export async function* streamCurriculum(
  brief: Brief,
  {
    brains = CURRICULUM_BRAINS,
    ask = streamStructured,
    signal,
    onStats,
    onFlag,
  }: { brains?: CurriculumBrains; ask?: Ask; signal?: AbortSignal; onStats?: (stats: CurriculumStats) => void; onFlag?: (flag: PlanFlag) => void } = {},
): AsyncGenerator<CurriculumEvent> {
  const started = Date.now();
  let planStats: CallStats | undefined;
  let lessonStats: CallStats = { ms: 0, costUsd: 0, attempts: 0 };
  let firstLessonMs: number | undefined;

  const plan = await writePlan(brief, { brain: brains.plan, ask, signal, onStats: (s) => (planStats = s) });
  yield { type: "plan", plan };

  // Lessons for mechanisms the library knows are already written: they go out with no wait and no model call.
  const lessons: MechanismLesson[] = libraryLessons(plan);
  for (const lesson of lessons) {
    firstLessonMs ??= Date.now() - started;
    yield { type: "lesson", lesson };
  }
  const lessonOptions = { brain: brains.lessons, review: brains.review, ask, signal, onStats: (s: CallStats) => (lessonStats = s), onFlag };
  for await (const lesson of writeLessons(withoutKnownLessons(plan), lessonOptions)) {
    firstLessonMs ??= Date.now() - started;
    lessons.push(lesson);
    yield { type: "lesson", lesson };
  }
  const order = new Map(lessonMechanisms(plan).map((m, i) => [m.id, i]));
  lessons.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  if (planStats) onStats?.({ plan: planStats, lessons: lessonStats, firstLessonMs });
  yield { type: "done", curriculum: { plan, lessons } };
}
