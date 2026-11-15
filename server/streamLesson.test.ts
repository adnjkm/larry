import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseKit } from "../shared/kit.ts";
import { Lesson, type LessonEvent, type Shown, chapterProblems, lessonProblems } from "../shared/lesson.ts";
import { WORDS } from "../shared/rules.ts";
import { CATALOG } from "../shared/primitives/catalog.ts";
import type { StructuredEvent } from "./claude.ts";
import { streamLesson } from "./streamLesson.ts";

const fixture = (dir: string) => JSON.parse(readFileSync(new URL(`../fixtures/${dir}/pen.json`, import.meta.url), "utf8")) as unknown;
const pen = Lesson.parse(fixture("lessons"));
const kit = parseKit(fixture("kits"));
const [first, second, ...rest] = pen.chapters;
assert.ok(first && second);

const header = (lesson: Lesson): StructuredEvent => ({ type: "header", value: { title: lesson.title, hook: lesson.hook } });
const result = (output: Lesson): StructuredEvent => ({ type: "result", output, costUsd: 0.1 });

function scripted(...answers: StructuredEvent[][]) {
  let call = 0;
  return async function* (): AsyncGenerator<StructuredEvent> {
    const answer = answers[call++];
    assert.ok(answer, "asked more often than scripted");
    yield* answer;
  };
}

async function play(ask: ReturnType<typeof scripted>, resume?: Shown) {
  const events: LessonEvent[] = [];
  let attempts = 0;
  for await (const event of streamLesson(kit, { onStats: (s) => (attempts = s.attempts), ask, resume })) events.push(event);
  const done = events.at(-1);
  assert.ok(done?.type === "done");
  const streamed = events.flatMap((e) => (e.type === "chapter" ? [e.chapter.id] : []));
  return { events, attempts, streamed, lesson: done.lesson };
}

test("a rewrite after a broken chapter keeps what was streamed and streams the rest", async () => {
  const broken = { ...pen, chapters: [first, { ...second, steps: second.steps.map((s) => ({ ...s, primitive: "no-such-primitive" })) }, ...rest] };
  const rewrite = { ...pen, title: "Rewritten", hook: ["Rewritten hook."], chapters: [{ ...first, id: "rewritten-first" }, second, ...rest] };

  const { events, attempts, streamed, lesson } = await play(
    scripted(
      [header(broken), ...broken.chapters.map((value): StructuredEvent => ({ type: "item", value })), result(broken)],
      [header(rewrite), ...rewrite.chapters.map((value): StructuredEvent => ({ type: "item", value })), result(rewrite)],
    ),
  );

  assert.equal(attempts, 2);
  assert.deepEqual(
    events.map((e) => e.type),
    ["started", ...pen.chapters.map(() => "chapter"), "done"],
  );
  assert.deepEqual(
    streamed,
    pen.chapters.map((c) => c.id),
  );
  assert.equal(lesson.title, pen.title);
  assert.deepEqual(
    lesson.chapters.map((c) => c.id),
    streamed,
  );
});

test("a hook that runs long is held back, and the rewrite's title and hook are the ones shown", async () => {
  const rambling = { ...pen, hook: [Array.from({ length: WORDS.hook.max + 1 }, () => "word").join(" ")] };
  const rewrite = { ...pen, title: "Rewritten" };
  const items = (lesson: Lesson) => lesson.chapters.map((value): StructuredEvent => ({ type: "item", value }));

  const { events, lesson } = await play(
    scripted([header(rambling), ...items(rambling), result(rambling)], [header(rewrite), ...items(rewrite), result(rewrite)]),
  );

  const started = events.filter((e) => e.type === "started");
  assert.deepEqual(
    started.map((e) => e.title),
    ["Rewritten"],
  );
  assert.equal(lesson.title, "Rewritten");
  assert.deepEqual(lesson.hook, pen.hook);
});

test("a retry continues from what the reader was shown and streams only what is new", async () => {
  const rewrite = { ...pen, title: "Rewritten", chapters: [{ ...first, id: "rewritten-first" }, second, ...rest] };
  const items = rewrite.chapters.map((value): StructuredEvent => ({ type: "item", value }));

  const { events, streamed, lesson } = await play(scripted([header(rewrite), ...items, result(rewrite)]), {
    header: { title: pen.title, hook: pen.hook },
    chapters: [first],
  });

  assert.equal(events.filter((e) => e.type === "started").length, 0);
  assert.deepEqual(streamed, [second.id, ...rest.map((c) => c.id)]);
  assert.equal(lesson.title, pen.title);
  assert.deepEqual(
    lesson.chapters.map((c) => c.id),
    pen.chapters.map((c) => c.id),
  );
});

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

const [firstStep, ...otherSteps] = first.steps;
assert.ok(firstStep);

const withStep = (change: Partial<typeof firstStep>): typeof first => ({ ...first, steps: [{ ...firstStep, ...change }, ...otherSteps] });
const withStory = (story: string[]) => withStep({ story });

test("a story that rambles past the limit sends its chapter back, and a normal one passes", () => {
  assert.deepEqual(chapterProblems(withStory([words(WORDS.story.aim)]), CATALOG), []);
  assert.deepEqual(chapterProblems(withStory([words(WORDS.story.max)]), CATALOG), [], "a story at the limit still passes");
  const problems = chapterProblems(withStory([words(40), words(WORDS.story.max - 39)]), CATALOG);
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? "", new RegExp(`story is ${WORDS.story.max + 1} words`), "the words are counted across paragraphs");
});

test("a payoff, hook or closing past its limit is a problem for the lesson", () => {
  const over = (key: "hook" | "closing") => lessonProblems({ ...pen, [key]: [words(WORDS[key].max + 1)] }, kit, CATALOG);
  assert.deepEqual(lessonProblems(pen, kit, CATALOG), []);
  assert.match(over("hook").join("\n"), /hook is \d+ words/);
  assert.match(over("closing").join("\n"), /closing is \d+ words/);
  const longPayoff = { ...pen, chapters: [withStep({ payoff: [words(WORDS.payoff.max + 1)] }), second, ...rest] };
  assert.match(lessonProblems(longPayoff, kit, CATALOG).join("\n"), /payoff is \d+ words/);
});
