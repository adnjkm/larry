// What a reader will meet in each fixture lesson: node scripts/lesson-content.ts [dir]
// Words per step, strings that talk about the app instead of the object, and run steps that show no figure.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type Lesson, allSteps } from "../shared/lesson.ts";

const dir = join(import.meta.dirname, "..", process.argv[2] ?? "fixtures/lessons");
const LEAK = /catalogue|primitive|figure|slider|the app|simulation/i;
const words = (text: string[]) => text.join(" ").split(/\s+/).filter(Boolean).length;

function strings(lesson: Lesson): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [
    { where: "title", text: lesson.title },
    ...lesson.hook.map((text) => ({ where: "hook", text })),
    ...lesson.closing.map((text) => ({ where: "closing", text })),
  ];
  for (const chapter of lesson.chapters) {
    out.push({ where: chapter.id, text: chapter.kind === "module" ? `${chapter.need} ${chapter.why}` : chapter.title });
    for (const step of chapter.steps) {
      const where = `${chapter.id}/${step.id}`;
      const p = step.problem;
      const texts = [step.title, ...step.story, ...step.payoff];
      if (p?.type === "run") texts.push(p.action, p.outcome);
      if (p?.type === "pick") texts.push(p.question, ...p.options.map((o) => o.outcome));
      if (p?.type === "tune") texts.push(p.goal, p.tooLow, p.tooHigh, p.justRight);
      for (const text of texts) out.push({ where, text });
    }
  }
  return out;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const lesson = JSON.parse(readFileSync(join(dir, file), "utf8")) as Lesson;
  const steps = allSteps(lesson);
  const storyWords = steps.map((s) => words(s.story));
  const payoffWords = steps.map((s) => words(s.payoff));
  const runs = steps.filter((s) => s.problem?.type === "run");
  const bare = runs.filter((s) => s.primitive === null);
  const leaks = strings(lesson).filter(({ text }) => LEAK.test(text));
  console.log(`${file.replace(/\.json$/, "")}: ${steps.length} steps, story words [${storyWords.join(" ")}] max ${Math.max(...storyWords)}, payoff words [${payoffWords.join(" ")}] max ${Math.max(...payoffWords)}, hook ${words(lesson.hook)}, closing ${words(lesson.closing)}`);
  console.log(`  run steps ${runs.length}, without a primitive ${bare.length}${bare.length ? ` (${bare.map((s) => s.id).join(", ")})` : ""}; leaks ${leaks.length}`);
  for (const { where, text } of leaks) console.log(`  leak in ${where}: ${text.match(new RegExp(`.{0,40}(${LEAK.source}).{0,40}`, "i"))?.[0]}`);
}
