import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { Effort, Model } from "../server/claude.ts";
import { streamKit } from "../server/streamKit.ts";
import type { Kit } from "../shared/kit.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string", default: "claude-opus-5-5" },
    effort: { type: "string", default: "low" },
    out: { type: "string", default: "fixtures/kits" },
  },
});

const photoDir = new URL("../fixtures/photos/", import.meta.url);
const kitDir = new URL(`../${values.out.replace(/\/?$/, "/")}`, import.meta.url);
const brain = { model: values.model as Model, effort: values.effort as Effort };

await mkdir(kitDir, { recursive: true });
const names = (await readdir(photoDir)).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, ""));
const selected = positionals.length > 0 ? names.filter((n) => positionals.includes(n)) : names;

const results = await Promise.allSettled(
  selected.map(async (name) => {
    const base64 = (await readFile(new URL(`${name}.jpg`, photoDir))).toString("base64");
    let kit: Kit | undefined;
    let timing = "";
    for await (const event of streamKit([{ mediaType: "image/jpeg", base64 }], brain, (s) => {
      const firstPart = s.firstPartMs === undefined ? "never" : `${(s.firstPartMs / 1000).toFixed(1)}s`;
      timing = `first part ${firstPart}, done ${(s.ms / 1000).toFixed(1)}s, $${s.costUsd.toFixed(3)}`;
    })) {
      if (event.type === "done") kit = event.kit;
    }
    if (!kit) throw new Error("Kit generation ended without a kit");
    await writeFile(new URL(`${name}.json`, kitDir), `${JSON.stringify(kit, null, 2)}\n`);
    return `${name}: "${kit.name}", ${kit.parts.length} parts, ${timing}`;
  }),
);

console.log(`${brain.model} ${brain.effort} -> ${values.out}`);
for (const [i, r] of results.entries()) console.log(r.status === "fulfilled" ? r.value : `${selected[i]}: FAILED ${r.reason}`);
