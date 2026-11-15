// Measures the main-thread JS cost of one figure frame on the library page (?primitives=<id>): every animation frame,
// the motion slider (the handle's slider, else the last one) moves one step, the way a drag or the play sweep moves it.
// Reports CDP ScriptDuration per frame (all script on the main thread, React included) and the stage's own pose / draw
// split from window.__stageStats.
// Then, on ?stage=<id>, the stage alone: the play sweep and the game's run, per drawn frame.
// Usage: node scripts/frame-cost.ts [id ...] [--gpu] [--frames=240] [--stage-only]
//   --gpu asks Chromium for the Mac's GPU (ANGLE on Metal) instead of SwiftShader, so the readback is not software rendering.
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { motionSlider } from "../shared/primitives/types.ts";
import { launch, ready } from "./browser.ts";

const gpu = process.argv.includes("--gpu");
const frames = Number(process.argv.find((a) => a.startsWith("--frames="))?.split("=")[1] ?? 240);
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const { url, browser, close } = await launch(gpu);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const scriptSeconds = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration")!.value;

let first = true;
const rows: string[] = [];
for (const p of PRIMITIVES.filter((q) => wanted.length === 0 || wanted.includes(q.id))) {
  if (process.argv.includes("--stage-only")) break;
  await page.goto(`${url}?primitives=${p.id}`, { waitUntil: "networkidle" });
  await ready(page);
  if (first) {
    first = false;
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    console.log(`GPU: ${renderer}; ${frames} frames per model, phone viewport at DPR 3`);
  }
  const slider = motionSlider(p);
  // Warm up: one full sweep so geometry caches and shader programs are in place, as they are after the first second of use.
  const drive = (n: number) =>
    page.evaluate(
      async ({ id, min, max, n }) => {
        const input = document.querySelector<HTMLInputElement>(`[data-slider="${id}"] input`)!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        const w = window as unknown as { __stageStats?: { reset(): void } };
        w.__stageStats?.reset();
        const start = performance.now();
        for (let i = 0; i < n; i++) {
          await new Promise(requestAnimationFrame);
          const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 120);
          setter.call(input, String(min + (max - min) * f));
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return performance.now() - start;
      },
      { id: slider.id, min: slider.min, max: slider.max, n },
    );
  await drive(120);
  const before = await scriptSeconds();
  const wall = await drive(frames);
  const script = ((await scriptSeconds()) - before) * 1000;
  const stats = await page.evaluate(() => (window as unknown as { __stageStats?: { summary(): unknown } }).__stageStats?.summary());
  const row = `${p.id.padEnd(9)} ${slider.id.padEnd(9)} slider: script ${(script / frames).toFixed(2)} ms/frame  (${((frames * 1000) / wall).toFixed(0)} fps)${stats ? `  stage ${JSON.stringify(stats)}` : ""}`;
  rows.push(row);
  console.log(row);
}

// The stage alone (?stage=<id>, game mode): the play sweep, and the game's run where there is one. No React per frame.
type Hook = {
  __stage: { sweep(): void; stop(): void; play(r: unknown): Promise<boolean>; get(): unknown };
  __stageStats: { reset(): void; summary(): unknown; frames: number };
};
const stageIds = wanted.length > 0 ? wanted : PRIMITIVES.map((p) => p.id);
for (const id of stageIds) {
  await page.goto(`${url}?stage=${id}`, { waitUntil: "networkidle" });
  await ready(page);
  for (const kind of ["sweep", "run"] as const) {
    const measure = async () => {
      await page.evaluate(() => (window as unknown as Hook).__stageStats.reset());
      const before = await scriptSeconds();
      const drawn = await page.evaluate(
        async ({ kind, frames }) => {
          const w = window as unknown as Hook;
          if (kind === "sweep") {
            w.__stage.sweep();
            for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame);
            w.__stage.stop();
          } else {
            (document.querySelector("[data-action=game]") as HTMLButtonElement).click();
            await new Promise(requestAnimationFrame);
            while ((w.__stage as unknown as { state(): string }).state() === "playing") await new Promise(requestAnimationFrame);
          }
          return w.__stageStats.frames;
        },
        { kind, frames },
      );
      const script = ((await scriptSeconds()) - before) * 1000;
      const stats = await page.evaluate(() => (window as unknown as Hook).__stageStats.summary());
      return { script, drawn, stats };
    };
    await measure();
    const { script, drawn, stats } = await measure();
    console.log(
      `${id.padEnd(15)} ${kind.padEnd(5)}: script ${(script / Math.max(1, drawn)).toFixed(2)} ms/frame over ${drawn} frames  stage ${JSON.stringify(stats)}`,
    );
  }
}
await close();
process.exit(0);
