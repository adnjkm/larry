import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseKit } from "../shared/kit.ts";
import { type LessonEvent, Lesson } from "../shared/lesson.ts";
import type { StructuredEvent } from "./claude.ts";
import { keepShown, streamLesson } from "./streamLesson.ts";

const fixture = (dir: string) => JSON.parse(readFileSync(new URL(`../fixtures/${dir}/pen.json`, import.meta.url), "utf8")) as unknown;
const pen = Lesson.parse(fixture("lessons"));
const kit = parseKit(fixture("kits"));
const [first, second, ...rest] = pen.chapters;
assert.ok(first && second);

test("a rewrite keeps the title, hook and chapters the reader was already shown", () => {
  const shown = [{ ...first, id: "as-shown" }];
  const rewrite = { ...pen, title: "Rewritten", hook: ["Rewritten hook."], chapters: [{ ...first, id: "rewritten-first" }, second, ...rest] };

  const kept = keepShown(rewrite, { title: "Shown title", hook: ["Shown hook."] }, shown);

  assert.equal(kept.title, "Shown title");
  assert.deepEqual(kept.hook, ["Shown hook."]);
  assert.deepEqual(kept.chapters.map((c) => c.id), ["as-shown", second.id, ...rest.map((c) => c.id)]);
  assert.deepEqual(kept.closing, rewrite.closing);
});

test("with nothing shown the rewrite stands as written", () => {
  assert.deepEqual(keepShown(pen, undefined, []), pen);
});

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

async function play(ask: ReturnType<typeof scripted>) {
  const events: LessonEvent[] = [];
  let attempts = 0;
  for await (const event of streamLesson(kit, undefined, (s) => (attempts = s.attempts), ask)) events.push(event);
  const done = events.at(-1);
  assert.ok(done?.type === "done");
  const streamed = events.flatMap((e) => (e.type === "chapter" ? [e.chapter.id] : []));
  return { events, attempts, streamed, lesson: done.lesson };
}

test("a rewrite after a broken chapter keeps what was streamed and streams the rest", async () => {
  const broken = { ...pen, chapters: [first, { ...second, steps: second.steps.map((s) => ({ ...s, primitive: "no-such-primitive" })) }, ...rest] };
  const rewrite = { ...pen, title: "Rewritten", hook: ["Rewritten hook."], chapters: [{ ...first, id: "rewritten-first" }, second, ...rest] };

  const { events, attempts, streamed, lesson } = await play(
    scripted([header(broken), ...broken.chapters.map((value): StructuredEvent => ({ type: "item", value })), result(broken)], [header(rewrite), ...rewrite.chapters.map((value): StructuredEvent => ({ type: "item", value })), result(rewrite)]),
  );

  assert.equal(attempts, 2);
  assert.deepEqual(events.map((e) => e.type), ["started", ...pen.chapters.map(() => "chapter"), "done"]);
  assert.deepEqual(streamed, pen.chapters.map((c) => c.id));
  assert.equal(lesson.title, pen.title);
  assert.deepEqual(lesson.chapters.map((c) => c.id), streamed);
});
