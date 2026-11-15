// Pose sheets: every primitive (or the ids given) with each slider swept across its range, the others at their initial
// values, one sheet per primitive at out/poses/<id>.png. Drives the ?primitives=<id> page through its range inputs.
//   node scripts/poses.ts [id ...] [--out dir]
// Fractions are off-period (not 0, 1/4, 1/2 ...) so a model that turns a whole number of times over its range does
// not show the same picture in every cell.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import type { Slider } from "../shared/primitives/types.ts";
import { launch, ready, root } from "./browser.ts";

const FRACTIONS = [0.07, 0.29, 0.5, 0.71, 0.93];

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? (args[outAt + 1] as string) : join(root, "out", "poses");
const wanted = args.filter((a, i) => !a.startsWith("--") && !(outAt >= 0 && i === outAt + 1));

/** The slider value nearest `f` of the way along, on the slider's own step grid. */
const snap = (s: Slider, f: number) => s.min + Math.round((f * (s.max - s.min)) / s.step) * s.step;
const shown = (s: Slider, value: number) => `${Number((value * (s.displayScale ?? 1)).toFixed(2))}${s.unit ?? ""}`;

const { url, browser, close } = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const sheet = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });

for (const p of PRIMITIVES.filter((q) => wanted.length === 0 || wanted.includes(q.id))) {
  await page.goto(`${url}?primitives=${p.id}`, { waitUntil: "networkidle" });
  await ready(page);
  // Only the figure: no drag ring or buttons the page may lay over it.
  await page.addStyleTag({ content: "[data-kit-viewer] [data-handle], [data-kit-viewer] button { display: none !important; }" });
  const rows: { label: string; data: string }[][] = [];
  for (const s of p.sliders) {
    const row: { label: string; data: string }[] = [];
    for (const f of FRACTIONS) {
      for (const other of p.sliders) await page.locator(`[data-slider="${other.id}"] input`).fill(String(other === s ? snap(s, f) : other.initial));
      await page.waitForTimeout(750);
      const buf = await page.locator("[data-kit-viewer]").screenshot();
      row.push({ label: `${s.label} = ${shown(s, snap(s, f))}`, data: buf.toString("base64") });
    }
    rows.push(row);
  }
  const html = rows
    .map(
      (row) =>
        `<div class=row>${row.map((c) => `<figure><img src="data:image/png;base64,${c.data}"><figcaption>${c.label}</figcaption></figure>`).join("")}</div>`,
    )
    .join("");
  await sheet.setContent(
    `<style>body{margin:0;padding:12px;font:13px ui-monospace,monospace;background:#fff;width:1176px}h1{font:600 18px system-ui;margin:0 0 8px}.row{display:flex;gap:6px;margin-bottom:8px}figure{margin:0;flex:1;border:1px solid #ddd}img{width:100%;display:block}figcaption{padding:4px 6px;background:#f4f4f4}</style>` +
      `<h1>${p.name} (${p.level}): each row sweeps one slider, the other at its initial value</h1>${html}`,
  );
  await sheet.locator("body").screenshot({ path: join(outDir, `${p.id}.png`) });
  console.log(join(outDir, `${p.id}.png`));
}
await close();
process.exit(0);
