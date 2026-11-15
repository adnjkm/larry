// A second look at one written lesson: a stronger model checks each claim against the real object and rewrites only
// what is false or confusable. It answers with fixes, not a whole lesson, so a good lesson costs a few tokens.
import { z } from "zod";
import { LIMITS, type Mechanism, type MechanismLesson, type Plan, Step, lessonProblems } from "../shared/curriculum.ts";
import { lessonsRequest } from "./lessonsPrompt.ts";

export const REVIEW_SYSTEM = `You check one lesson about how an everyday object works before a learner sees it. It was written quickly. Find what is false or confusable and rewrite only that; leave everything that is right as it is. A good lesson gets an empty answer.

How a lesson works. Each row answers one sub-function with one catalogue primitive and its one number: why this primitive does the job here, what the object needs of the number on both sides, and what a person would see with the primitive taken out (missing), its number too low (little) and too high (much). The path is what the motion passes through, from where it starts to what it acts on. The steps are questions: who (a sub-function is stated, pick the primitive), much (set the number), broke (one row's symptom plays, find the primitive at fault), trace (tap the path in order), break (cause a named failure; every listed cause must produce it).

Picture the real object in the hand and check four things.

Would it happen? For each row, first work out which way the number runs here: what more of it gives this object and what that costs. Then take each why, need and symptom in turn, with the object built right but for that one change. A symptom on the wrong side of the number is false. So is one carried over from the catalogue's words that this part cannot do, one that belongs to a different cause, and a why that claims a trade the part's shape does not make.

Could two be confused? Compare the symptoms within the lesson in pairs, starting with each row's missing and little, then faults in different rows that make the same thing hard or loose. If a person watching could not say which is which, rewrite one to show an effect only that fault has. Missing is usually a different kind of failure from little, not a bigger one.

Is the path the motion's route? Each name is moved or pressed by the one before, and the last is what gets acted on. A part the motion must pass through belongs on it even when another mechanism owns it. A part that only holds another in place, or a spring that only pushes back, does not.

Does each question still have one right answer? A broke step needs a symptom no other fault in the lesson shows. A break step lists every fault whose symptom shows the failure, and no other. Change the steps only when a fix or this check requires it, keeping every sub-function the subject of a who, much or broke step and no format twice in a row.

Write replacements as the rest is written: plain words a person holding the object would use, present tense, no numbers, something seen happening on the object, no longer than what it replaces.

Sometimes the plan gives a sub-function a primitive that does not honestly do that job on this object: its number hardly matters here, or something else is really at work. Make the row as true as it can be, and add a flag saying what is really at work. Flags go back to the planner; the learner never sees them.`;

const Fix = z.object({
  row: z.string().describe("The sub-function's id."),
  field: z.enum(["why", "need", "missing", "little", "much"]),
  problem: z.string().describe("What is false, or which other symptom it could be confused with, and what really happens. At most 25 words."),
  text: z.string().describe("The replacement, within the length of what it replaces."),
});

export const Review = z.object({
  fixes: z.array(Fix).describe("One per sentence that fails a check. Empty when all hold."),
  path: z
    .array(z.string())
    .nullable()
    .describe(`The corrected path, ${LIMITS.path.min} to ${LIMITS.path.max} names of 1 to ${LIMITS.words.pathName.max} words. null when the path is right.`),
  steps: z.array(Step).nullable().describe("The corrected steps. null when the steps still hold."),
  flags: z
    .array(z.object({ row: z.string(), note: z.string().describe("What is really at work here, in one sentence.") }))
    .describe("Sub-functions whose primitive is not honest on this object. Usually empty."),
});
export type Review = z.infer<typeof Review>;

export const reviewJsonSchema = ((): Record<string, unknown> => {
  const { $schema: _dialect, ...body } = z.toJSONSchema(Review);
  return body;
})();

/** The plan and the one lesson to check, as the reviewer reads them. */
export function reviewRequest(plan: Plan, lesson: MechanismLesson): string {
  const context = lessonsRequest(plan, [lesson.id]);
  return `${context.slice(0, context.lastIndexOf("\n\n"))}\n\nThe lesson written for ${lesson.id}:\n${JSON.stringify(lesson, null, 1)}`;
}

/** The lesson with the review's fixes applied. A fix that breaks a rule is dropped with the rest, so a review can never make a lesson unplayable. */
export function applyReview(lesson: MechanismLesson, review: Review, mechanism: Mechanism): MechanismLesson {
  const rows = lesson.rows.map((row) => {
    const fixed = { ...row };
    for (const fix of review.fixes) if (fix.row === row.id && fixed[fix.field] !== null) fixed[fix.field] = fix.text;
    return fixed;
  });
  const candidates: MechanismLesson[] = [
    { ...lesson, rows, path: review.path ?? lesson.path, steps: review.steps ?? lesson.steps },
    { ...lesson, rows, path: review.path ?? lesson.path },
    { ...lesson, rows },
  ];
  return candidates.find((c) => lessonProblems(c, mechanism).length === 0) ?? lesson;
}
