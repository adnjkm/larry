import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Effort, Model } from "../server/claude.ts";
import { LESSON_BRAIN, type LessonStats, streamLesson } from "../server/streamLesson.ts";
import { parseKit } from "../shared/kit.ts";
import { allSteps } from "../shared/lesson.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: LESSON_BRAIN.model },
    effort: { type: "string", default: LESSON_BRAIN.effort },
    out: { type: "string", default: "fixtures/lessons" },
  },
});
const brain = { model: values.model as Model, effort: values.effort as Effort };

const kitDir = new URL("../fixtures/kits/", import.meta.url);
const outDir = new URL(`../${values.out.replace(/\/?$/, "/")}`, import.meta.url);
await mkdir(outDir, { recursive: true });

const names = (await readdir(kitDir)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const selected = positionals.length > 0 ? names.filter((n) => positionals.includes(n)) : names;

const results = await Promise.allSettled(
  selected.map(async (name) => {
    const kit = parseKit(JSON.parse(await readFile(new URL(`${name}.json`, kitDir), "utf8")));
    let stats: LessonStats | undefined;
    for await (const event of streamLesson(kit, brain, (s) => (stats = s))) {
      if (event.type === "failed") throw new Error(event.message);
      if (event.type !== "done") continue;
      await writeFile(new URL(`${name}.json`, outDir), `${JSON.stringify(event.lesson, null, 2)}\n`);
      const types = allSteps(event.lesson).map((s) => s.problem?.type ?? "-").join(" ");
      const s = stats!;
      return `${name}: ${event.lesson.chapters.length} chapters, ${allSteps(event.lesson).length} steps [${types}], first chapter ${((s.firstChapterMs ?? NaN) / 1000).toFixed(0)}s, done ${(s.ms / 1000).toFixed(0)}s, $${s.costUsd.toFixed(3)}, ${s.attempts} attempt(s)`;
    }
    throw new Error("no lesson");
  }),
);

console.log(`${brain.model} ${brain.effort} -> ${values.out}`);
for (const [i, r] of results.entries()) console.log(r.status === "fulfilled" ? r.value : `${selected[i]}: FAILED ${r.reason}`);
