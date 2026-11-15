// Run sheets: for each primitive (or the ids given), three runs of game.play (the number at its lowest
// step, mid-window, and its highest step, so one passes and one fails on each side), N frames each, captioned with the
// frame's time and its `live` text. One sheet per primitive at out/runs/<id>.png.
//   node scripts/run-sheet.ts [id ...] [--frames N] [--out dir]
// Frames are computed here and shown through the ?stage=<id> dev page's window.__stage controller, which draws them as a
// game does: run-only values, the game's scene and the frame's marks. The drag ring is hidden.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { type Frame, type Primitive, type Values, startValues, steps } from "../shared/primitives/types.ts";
import { launch, root } from "./stage-lib.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const frames = Number(flag("--frames") ?? 10);
const outDir = flag("--out") ?? join(root, "out", "runs");
const wanted = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

/** The number at its lowest step, the middle passing step, and its highest step. */
function settings(p: Primitive): Values[] {
  const g = p.game;
  const s = [...p.sliders, ...(g.controls ?? [])].find((q) => q.id === g.number)!;
  const all = steps(s).map((n) => ({ ...startValues(p), [s.id]: n }));
  const passing = all.filter((v) => g.judge(v).pass);
  return [all[0]!, passing[Math.floor(passing.length / 2)] ?? all[Math.floor(all.length / 2)]!, all.at(-1)!];
}

const { url, browser, close } = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });

for (const p of PRIMITIVES.filter((q) => (wanted.length === 0 || wanted.includes(q.id)))) {
  await page.goto(`${url}?stage=${p.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-kit-viewer][data-ready]", { timeout: 90_000 });
  await page.addStyleTag({ content: "[data-handle]{display:none!important}" });
  const number = p.game.number;
  const rows: { title: string; cells: { label: string; data: string }[] }[] = [];
  for (const v of settings(p)) {
    const run = p.game.play(v);
    const cells: { label: string; data: string }[] = [];
    for (let i = 0; i < frames; i++) {
      const ms = Math.round((i / (frames - 1)) * run.durationMs);
      const f: Frame = run.at(ms);
      // A run that holds this one frame until the next: values (run-only ones included) and marks as the game shows them.
      await page.evaluate((shown) => {
        const stage = (window as unknown as { __stage: { stop(): void; play(r: unknown): Promise<boolean> } }).__stage;
        stage.stop();
        void stage.play({ verdict: { pass: true, outcome: "sheet", headline: "Sheet frame", detail: "0" }, durationMs: 1e9, at: () => shown });
      }, f);
      await page.waitForTimeout(220);
      const buf = await page.locator("[data-kit-viewer]").screenshot();
      cells.push({ label: `${ms} ms · ${f.live}`, data: buf.toString("base64") });
    }
    const verdict = run.verdict;
    rows.push({ title: `${number} = ${v[number]} · ${verdict.pass ? "PASS" : "FAIL"} ${verdict.outcome}: ${verdict.headline}. ${verdict.detail}`, cells });
  }
  const html = rows
    .map((r) => `<h2>${r.title}</h2><div class=row>${r.cells.map((c) => `<figure><img src="data:image/png;base64,${c.data}"><figcaption>${c.label}</figcaption></figure>`).join("")}</div>`)
    .join("");
  await sheet.setContent(
    `<style>body{margin:0;padding:12px;font:12px ui-monospace,monospace;background:#fff;width:1576px}h1{font:600 18px system-ui;margin:0 0 6px}h2{font:500 13px system-ui;margin:10px 0 4px}.row{display:flex;gap:4px}figure{margin:0;flex:1;border:1px solid #ddd;min-width:0}img{width:100%;display:block}figcaption{padding:3px 4px;background:#f4f4f4;font-size:11px;min-height:28px}</style>` +
      `<h1>${p.name}: game "${p.game.name}", ${frames} frames per run</h1>${html}`,
  );
  await sheet.locator("body").screenshot({ path: join(outDir, `${p.id}.png`) });
  console.log(join(outDir, `${p.id}.png`));
}
await close();
process.exit(0);
