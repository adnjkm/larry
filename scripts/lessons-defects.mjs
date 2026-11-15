// Prints a tag's lesson grades and the judge's problems. Usage: node scripts/lessons-defects.mjs <tag> [--problems]
import { readdirSync, readFileSync, existsSync } from "node:fs";
const [tag, flag] = process.argv.slice(2);
const dir = new URL(`../out/curriculum/${tag}/`, import.meta.url);
const KEYS = ["rows", "visible", "distinct", "path", "fit", "ramp", "variety", "breaking", "writing"];
const names = readdirSync(new URL("lessons-grade/", dir)).filter((f) => f.endsWith(".json"));
const sums = Object.fromEntries(KEYS.map((k) => [k, 0]));
let total = 0,
  first = 0,
  all = 0,
  breaks = 0,
  n = 0;
for (const name of names) {
  const g = JSON.parse(readFileSync(new URL(`lessons-grade/${name}`, dir), "utf8"));
  const t = KEYS.reduce((a, k) => a + g[k], 0);
  for (const k of KEYS) sums[k] += g[k];
  total += t;
  n++;
  if (existsSync(new URL(`lessons/${name}`, dir))) {
    const r = JSON.parse(readFileSync(new URL(`lessons/${name}`, dir), "utf8"));
    first += r.firstItemMs ?? r.ms;
    all += r.ms;
    breaks += r.problems.length;
  }
  if (flag) {
    console.log(`${name.slice(0, -5).padEnd(14)} ${KEYS.map((k) => g[k]).join(" ")} = ${t}`);
    for (const p of g.problems) console.log(`   - ${p}`);
  }
}
console.log(
  `${tag}: n ${n} mean ${(total / n).toFixed(2)} | ${KEYS.map((k) => `${k} ${(sums[k] / n).toFixed(1)}`).join(" ")} | first ${(first / n / 1000).toFixed(1)}s all ${(all / n / 1000).toFixed(1)}s | ${breaks} rule breaks`,
);
