import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { type Effort, generateKit } from "../server/generateKit.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    effort: { type: "string", default: "low" },
    out: { type: "string", default: "fixtures/kits" },
  },
});

const photoDir = new URL("../fixtures/photos/", import.meta.url);
const kitDir = new URL(`../${values.out.replace(/\/?$/, "/")}`, import.meta.url);
const effort = values.effort as Effort;

await mkdir(kitDir, { recursive: true });
const names = (await readdir(photoDir)).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, ""));
const selected = positionals.length > 0 ? names.filter((n) => positionals.includes(n)) : names;

const results = await Promise.allSettled(
  selected.map(async (name) => {
    const base64 = (await readFile(new URL(`${name}.jpg`, photoDir))).toString("base64");
    const { kit, ms, costUsd } = await generateKit([{ mediaType: "image/jpeg", base64 }], effort);
    await writeFile(new URL(`${name}.json`, kitDir), `${JSON.stringify(kit, null, 2)}\n`);
    return `${name}: "${kit.name}", ${kit.parts.length} parts, ${(ms / 1000).toFixed(1)}s, $${costUsd.toFixed(3)}`;
  }),
);

console.log(`effort ${effort} -> ${values.out}`);
for (const [i, r] of results.entries()) console.log(r.status === "fulfilled" ? r.value : `${selected[i]}: FAILED ${r.reason}`);
