import type { Kit } from "../shared/kit.ts";
import { Chapter, chapterProblems, headerProblems, Lesson, LessonError, LessonHeader, type Shown, type LessonEvent, lessonProblems, parseLesson } from "../shared/lesson.ts";
import { RULES, WORDS } from "../shared/rules.ts";
import { CATALOG } from "../shared/primitives/catalog.ts";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { formatSlider, initialValues } from "../shared/primitives/types.ts";
import { type Brain, streamStructured } from "./claude.ts";
import { lessonJsonSchema } from "./schemas.ts";

const SYSTEM_PROMPT = `You are Larry. You write interactive lessons that let a curious adult reinvent an everyday object from first principles. The bar is Bartosz Ciechanowski's article on the mechanical watch: an unbroken chain of reasoning in which every part appears because something before it failed, so that by the end the object looks inevitable.

You get the object's kit (its parts, from a 3D scan of a photo) and a catalogue of primitives: generic mechanisms and elements that can be drawn and simulated. You write the lesson as data. Each primitive is drawn as a figure with sliders and readouts, so every number the reader sees there comes from the simulation, not from you.

What the reader sees. The reader never learns how the lesson is made. Every string you write is about the object and its physics, so never mention the catalogue, primitives, figures, sliders, readouts, the simulation, the app or the screen. Say "the spring", not "the spring figure". Say "how stiff the spring is", not "the stiffness slider". Say "we run it", not "the simulation runs". When nothing in the catalogue fits a mechanism, do not say so. Explain it in words.

How to teach:
- Follow the function, not the assembly. Begin with the object's core job in its crudest possible form, then trace the chain from where the action starts to where the result comes out, one primitive at a time. The body, the case and the parts a hand touches come last, because their shape follows from everything inside.
- Every step exists because the build before it falls short. Build the naive version, run it, and show exactly how it fails, with a number: how far, how fast, how much, how long.
- Explain only what the next step needs. Introduce a principle just before it is used.
- Name a part only after its job has been shown. Before that, describe what it does.
- Explain why small details exist when they matter: why the ball is tungsten carbide, why the spring sits where it does.
- Pose the problem and let the reader solve it. Never write instructions like "now attach the spring". The payoff explains why the answer works, after they have found it.
- Use real, specific numbers: millimetres, newtons, seconds, millilitres, cycles. Be physically honest; when you simplify, say what you left out.
- Write in short, plain sentences. Use "we" the way the article does. Earn each technical term before using it. No exclamation marks, no praise ("great job"), no filler ("let's dive in", "in this lesson"). The reader is a curious adult, never a child.

How to structure it:
- Requirements first. Decide what makes this object this invention, each phrased "It must ...". Each requirement is a module. Use ${RULES.modules.min} or ${RULES.modules.max} modules.
- Order the modules by need. The first module does the object's core job crudely. Every later module must be motivated, in its "why", by a specific failure of what has already been built. A module the reader would not list up front, like "it must not dry out", is a surprise.
- Inside a module, the first step is the naive build: the simplest thing that meets the requirement at all, with a run problem that shows it falling short. Then one step per sub-problem, each answered by one primitive, until the requirement is fully met. A simple module can be the naive build plus one step.
- After the modules, add one join: run the modules together. A good join either works, which is the payoff the reader has been building toward, or exposes a requirement none of the modules has alone; then answer it in the same step.
- Finish with exactly one casing chapter of one step: the body, shell or frame, and the interface the reader touches. Its shape should now feel like it follows from everything inside.
- Aim for ${RULES.steps.min} to ${RULES.steps.max} steps in total. Cut anything the chain of reasoning does not need.

Problems. There are only three types; mix them and never use the same type more than ${RULES.problemRun} times in a row.
- run: the reader tries the build as it stands. The outcome is a concrete observation with a number. Use it for naive builds and joins. Give a run step the closest primitive, drawn at its starting values, so the reader sees the failing build before pressing the button; the starting values are listed in the catalogue, and the outcome must match what they show. Choose the primitive that shows the failing thing, not the one a later pick offers as the fix, which would give the answer away. Use primitive null only when nothing in the catalogue comes close.
- pick: the failure restated as a choice between ${RULES.options.min} or ${RULES.options.max} primitives from the catalogue. Exactly one works, and it must be the step's primitive. The others are tempting and fail for a specific physical reason, which their outcome explains. Wrong answers should teach.
- tune: the reader sets one quantity of the step's primitive so the build works for this object. Below the window one thing fails, above it another thing fails, each with a number. The window must sit strictly inside the slider's range, and the slider's starting value must miss it. Use the slider's own units. The reader sees the primitive's live readouts, listed in the catalogue, so state the goal in terms of those readouts where you can. The goal is shown to the reader on its own card, so the story must not restate the goal's numbers; it poses the failure and the goal gives the target.
- A good pattern is a pick that introduces a primitive followed by a tune that fits it to this object. Leave problem null only for a step that is pure explanation, and use that rarely.

Primitives:
- Use only ids from the catalogue, and only where the primitive's job really is what the object's part does. The figures are generic (the spring figure is a coil spring). The story connects the generic primitive to this object's version of it.
- Never force a wrong primitive. When the mechanism has no honest match, use primitive null.

Earning parts:
- Every part id in the kit appears in exactly one step's earns list, at the step where that part's job has just been shown. A naive build earns the crude parts it uses. Casing parts are earned in the casing chapter.

Lengths: hook under ${WORDS.hook.aim} words. Each story is one short paragraph of about ${WORDS.story.aim} words, never over 50, so the problem below it stays in view on a phone. Each payoff is 1 or 2 short paragraphs under ${WORDS.payoff.aim} words. Closing under ${WORDS.closing.aim} words. A paragraph is 1 to 3 sentences.

An outline of a good lesson for a click ballpoint pen, to show the shape (do not copy it for other objects):
- Hook: a pen writes only where its tip touches paper, never leaks in a pocket, and hides its tip with one press. Every part answers one of those demands.
- Module "It must leave a line" (the job). Naive build: an open tube of ink; run it and the ink pours out, a puddle not a line. Sub-problem: let ink out only where the tip touches paper: pick between a valve (a ball in a socket that rolls ink onto the paper and plugs the hole when still), a seal (stops the leak, but also stops the writing) and a grip. Then tune the valve so it neither drips when hanging tip-down nor skips under a light hand.
- Module "It must hide its tip" (why: the wet tip is always out and draws on the inside of a pocket). Naive build: push the refill in by hand; it falls back out the moment the pen tips over. Pick a spring to return it, then tune its stiffness so it returns the refill but a thumb can still beat it.
- Join: write with the tip clicked out; the writing force must not collapse the mechanism.
- Casing: the barrel that holds it all in line, and the clip.

Before writing, plan silently: the requirements and their order of need, each module's naive build and failure, which primitive answers each sub-problem, and where every kit part is earned. Then write the lesson.`;

const CATALOG_TEXT = catalogText();

function catalogText(): string {
  return PRIMITIVES.map((p) => {
    const start = initialValues(p);
    const sliders = p.sliders.map((s) => `${s.id} ("${s.label}", ${s.min} to ${s.max}${s.unit ? ` ${s.unit.trim()}` : ""}, starts at ${s.initial})`).join("; ");
    const readouts = p.readouts(start).map((r) => `${r.label}: ${r.value}`).join(" | ");
    const madeOf = p.madeOf.length > 0 ? ` Made of ${p.madeOf.join(" + ")}.` : "";
    return `- ${p.id} (${p.level.toLowerCase()}): ${p.job}.${madeOf} Seen in ${p.seenIn.join(", ")}.
  How it works: ${p.howItWorks}
  Sliders: ${sliders}.
  Readouts at the start: ${readouts}
  Starting values shown as: ${p.sliders.map((s) => `${s.id} = ${formatSlider(s, s.initial)}`).join(", ")}`;
  }).join("\n");
}

function kitText(kit: Kit): string {
  const parts = kit.parts.map((p) => `- ${p.id}: ${p.name}. ${p.role}${p.parentId ? ` Attached to ${p.parentId} by ${p.joint}.` : " The main part."}`);
  return `Object: ${kit.name}. ${kit.summary}\nParts:\n${parts.join("\n")}`;
}

/** The lesson is written again once with the rules it broke spelled out; the second try is kept whatever it holds. */
const MAX_ATTEMPTS = 2;

export const LESSON_BRAIN: Brain = { model: "claude-opus-5-5", effort: "low" };

export type LessonStats = { ms: number; firstChapterMs: number | undefined; costUsd: number; attempts: number };

/**
 * Puts the title, hook and chapters the reader has already been shown back in front of a rewrite, so
 * the finished lesson never changes what they have played. The rewrite supplies the rest.
 */
function keepShown(rewrite: Lesson, header: LessonHeader | undefined, shown: Chapter[]): Lesson {
  return { ...rewrite, ...header, chapters: [...shown, ...rewrite.chapters.slice(shown.length)] };
}

/**
 * Yields the title and hook, then each chapter, as soon as each is written and passes its own checks,
 * then the whole checked lesson. Chapters stop streaming at the first one that fails.
 * If the finished lesson breaks a rule, Claude rewrites it once: the rewrite keeps the chapters
 * already shown, streams the ones after them, and `done` carries the whole. `resume` continues a
 * lesson a reader was partly shown before it failed, the same way.
 */
export async function* streamLesson(
  kit: Kit,
  { brain = LESSON_BRAIN, onStats, ask = streamStructured, resume, signal }: { brain?: Brain; onStats?: (stats: LessonStats) => void; ask?: typeof streamStructured; resume?: Shown; signal?: AbortSignal } = {},
): AsyncGenerator<LessonEvent> {
  const started = Date.now();
  let firstChapterMs: number | undefined;
  let costUsd = 0;
  let header = resume?.header;
  const shown: Chapter[] = [...(resume?.chapters ?? [])];
  let feedback = shown.length > 0 || header ? `${alreadyShown(header, shown)}\n\nWhat they were shown:\n${JSON.stringify({ ...header, chapters: shown })}` : "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let chaptersOk = true;
    let seen = 0;
    let output: unknown;
    const text = `Catalogue of primitives:\n${CATALOG_TEXT}\n\n${kitText(kit)}\n\nWrite the lesson for this ${kit.name}.${feedback}`;

    for await (const event of ask({ system: SYSTEM_PROMPT, schema: lessonJsonSchema, brain, content: [{ type: "text", text }], streamKey: "chapters", signal })) {
      if (event.type === "result") {
        output = event.output;
        costUsd += event.costUsd;
      } else if (event.type === "header") {
        const parsed = LessonHeader.safeParse(event.value);
        if (parsed.success && !header && headerProblems(parsed.data).length === 0) {
          header = parsed.data;
          yield { type: "started", ...header };
        }
      } else if (chaptersOk && seen++ >= shown.length) {
        const chapter = Chapter.safeParse(event.value);
        chaptersOk = chapter.success && chapterProblems(chapter.data, CATALOG).length === 0;
        if (!chapter.success || !chaptersOk) continue;
        firstChapterMs ??= Date.now() - started;
        shown.push(chapter.data);
        yield { type: "chapter", chapter: chapter.data };
      }
    }

    const written = Lesson.safeParse(output);
    if (!written.success) throw new LessonError(`Claude's lesson did not match the schema: ${written.error.message}`);
    const lesson = repairEarns(keepShown(written.data, header, shown), kit);
    const problems = lessonProblems(lesson, kit, CATALOG);
    if (problems.length === 0 || attempt === MAX_ATTEMPTS) {
      onStats?.({ ms: Date.now() - started, firstChapterMs, costUsd, attempts: attempt });
      yield { type: "done", lesson: parseLesson(lesson, kit, CATALOG) };
      return;
    }
    feedback = `\n\nYour previous lesson broke these rules. Write it again with them fixed, keeping what was good:\n${problems.map((p) => `- ${p}`).join("\n")}${alreadyShown(header, shown)}\n\nPrevious lesson:\n${JSON.stringify(lesson)}`;
  }
}

function alreadyShown(header: LessonHeader | undefined, shown: Chapter[]): string {
  const what = [header && "the title and the hook", shown.length > 0 && `the first ${shown.length} chapter(s)`].filter(Boolean).join(" and ");
  return what ? `\n\nThe reader has already been shown ${what}, so they cannot change. Write the lesson with those kept word for word, then everything after them.` : "";
}

/**
 * Where each part is earned is bookkeeping, not teaching, so it is fixed here instead of costing a retry:
 * unknown ids and repeats are dropped, and parts never earned go to the casing's last step.
 */
function repairEarns(written: Lesson, kit: Kit): Lesson {
  const lesson = structuredClone(written);
  const known = new Set(kit.parts.map((p) => p.id));
  const seen = new Set<string>();
  for (const chapter of lesson.chapters) {
    for (const step of chapter.steps) {
      step.earns = step.earns.filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
    }
  }
  const last = lesson.chapters.at(-1)?.steps.at(-1);
  if (last) last.earns.push(...kit.parts.map((p) => p.id).filter((id) => !seen.has(id)));
  return lesson;
}
