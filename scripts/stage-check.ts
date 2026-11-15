// Checks the shared-renderer figure stage in Chromium (SwiftShader):
//   grain     at device pixel ratios 2, 2.625, 3 and 3.5, every dither pixel is a whole number of device pixels: the
//             runs of identical pixels along each row of a device-resolution screenshot are all multiples of the
//             grain. Saves out/stage/grain-sheet.png (4-up, magnified).
//   contexts  mounting and unmounting 30 figures, one at a time and then all at once, creates exactly one WebGL context.
//   loss      the shared context lost and restored: figures keep their picture and draw again afterwards.
//   drag      with touch: the model follows the finger, stops at handle.reach, the ring rubber-bands past it and springs
//             back; a vertical swipe that starts off the handle scrolls the page; one that starts on it does not.
//   keys      arrow keys and End move the handle when it is focused.
//   run       the game's run plays with captions and cues; under reduced motion it jumps to the end.
// Usage: node scripts/stage-check.ts [grain|contexts|loss|drag|keys|run ...]   (all when none given)
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { launch, root } from "./stage-lib.ts";

const outDir = join(root, "out", "stage");
mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
const want = (name: string) => only.length === 0 || only.includes(name);
const { url, browser, close } = await launch();
let failed = false;

async function check(name: string, body: () => Promise<void>) {
  if (!want(name)) return;
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}`, error);
  }
}

const ready = (page: Page, count = 1) =>
  page.waitForFunction((n) => {
    const all = [...document.querySelectorAll("[data-kit-viewer]")];
    return all.length >= n && all.every((v) => v.hasAttribute("data-ready"));
  }, count, { timeout: 90_000 });

type Hooks = {
  __stage: { get(): Record<string, number>; set(v: Record<string, number>): void; state(): string };
  __stageMany: (n: number) => void;
  __stageGL: () => WebGLRenderingContext | undefined;
  __webglContexts: number;
};

await check("grain", async () => {
  const cases = [
    { name: "desktop", w: 390, dpr: 2 },
    { name: "pixel", w: 412, dpr: 2.625 },
    { name: "iphone", w: 393, dpr: 3 },
    { name: "galaxy", w: 360, dpr: 3.5 },
  ];
  const cells: string[] = [];
  const decoder = await browser.newPage();
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: c.w, height: 844 }, deviceScaleFactor: c.dpr });
    // The library page draws through PrimitiveFigure, the path lessons use.
    await page.goto(`${url}?primitives=spring`, { waitUntil: "networkidle" });
    await ready(page);
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-kit-viewer]")!;
      const cv = el.querySelector("canvas")!;
      const r = cv.getBoundingClientRect();
      return { grain: Number(el.dataset.grain), backing: [cv.width, cv.height], rect: { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }, dpr: devicePixelRatio };
    });
    const n = Math.max(1, Math.round(1.5 * c.dpr));
    assert.equal(info.grain, n, `${c.name}: grain`);
    assert.equal(info.backing[0], Math.round(info.rect.w * c.dpr), `${c.name}: backing width is the box's device width`);
    assert.equal(info.backing[1], Math.round(info.rect.h * c.dpr), `${c.name}: backing height is the box's device height`);
    // Measure the canvas alone: the handle ring, its label and any page controls laid over the figure are smooth DOM.
    const overlays = await page.addStyleTag({ content: "body * { visibility: hidden !important } [data-kit-viewer] canvas { visibility: visible !important }" });
    const shot = await page.screenshot({ clip: { x: info.rect.x, y: info.rect.y, width: info.rect.w, height: info.rect.h } });
    await overlays.evaluate((el) => (el as Element).remove());
    // Decode in a browser (no PNG library here) and measure runs of identical pixels along every row.
    const runs = await decoder.evaluate(
      async ({ b64, n }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = img.width;
        cv.height = img.height;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = new Uint32Array(ctx.getImageData(0, 0, img.width, img.height).data.buffer);
        const lengths = new Map<number, number>();
        let total = 0;
        let whole = 0;
        const add = (len: number) => {
          lengths.set(len, (lengths.get(len) ?? 0) + 1);
          total++;
          if (len % n === 0) whole++;
        };
        // Rows and columns; runs touching the crop's edges are cut by the crop, so they are skipped.
        for (let y = 0; y < img.height; y++) {
          let start = 0;
          for (let x = 1; x <= img.width; x++) {
            if (x < img.width && d[y * img.width + x] === d[y * img.width + x - 1]) continue;
            if (start > 0 && x < img.width) add(x - start);
            start = x;
          }
        }
        for (let x = 0; x < img.width; x++) {
          let start = 0;
          for (let y = 1; y <= img.height; y++) {
            if (y < img.height && d[y * img.width + x] === d[(y - 1) * img.width + x]) continue;
            if (start > 0 && y < img.height) add(y - start);
            start = y;
          }
        }
        const common = [...lengths].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, k]) => `${l}:${k}`);
        return { total, whole, common, size: [img.width, img.height] };
      },
      { b64: shot.toString("base64"), n },
    );
    const share = runs.whole / runs.total;
    console.log(`  ${c.name} dpr ${c.dpr}: ${n} device px per dither px; ${runs.total} runs, ${(share * 100).toFixed(2)}% whole multiples of ${n}; commonest lengths ${runs.common.join(" ")}`);
    assert.equal(runs.whole, runs.total, `${c.name}: every run of identical pixels is a whole number of dither pixels`);
    // A 60 x 60 CSS px patch over the coil for the sheet.
    const patch = await page.screenshot({ clip: { x: info.rect.x + info.rect.w * 0.42, y: info.rect.y + info.rect.h * 0.35, width: 60, height: 60 } });
    cells.push(`<figure><img src="data:image/png;base64,${patch.toString("base64")}"><figcaption>${c.name} · DPR ${c.dpr}<br>${n} device px per dither px · ${(share * 100).toFixed(1)}% of runs whole</figcaption></figure>`);
    await page.close();
  }
  await decoder.setViewportSize({ width: 1280, height: 420 });
  await decoder.setContent(
    `<style>body{margin:0;padding:12px;font:12px ui-monospace,monospace;background:#fff;display:flex;gap:10px}figure{margin:0;border:1px solid #ccc}img{width:300px;height:300px;display:block;image-rendering:pixelated}figcaption{padding:6px;background:#f4f4f4}</style>${cells.join("")}`,
  );
  await decoder.locator("body").screenshot({ path: join(outDir, "grain-sheet.png") });
  await decoder.close();
});

await check("contexts", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    const w = window as unknown as { __webglContexts: number };
    w.__webglContexts = 0;
    const seen = new WeakSet<HTMLCanvasElement>();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      const ctx = (original as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      if (ctx && (kind === "webgl" || kind === "webgl2") && !seen.has(this)) {
        seen.add(this);
        w.__webglContexts++;
      }
      return ctx;
    } as typeof original;
  });
  await page.goto(`${url}?stage=spring`, { waitUntil: "networkidle" });
  await ready(page);
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => (window as unknown as Hooks).__stageMany(1));
    await ready(page, 2);
    await page.evaluate(() => (window as unknown as Hooks).__stageMany(0));
    await page.waitForFunction(() => document.querySelectorAll("[data-kit-viewer]").length === 1);
  }
  await page.evaluate(() => (window as unknown as Hooks).__stageMany(30));
  await ready(page, 31);
  await page.locator("[data-kit-viewer]").nth(12).scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, "thirty.png") });
  await page.evaluate(() => (window as unknown as Hooks).__stageMany(0));
  const count = await page.evaluate(() => (window as unknown as Hooks).__webglContexts);
  console.log(`  61 figures mounted and unmounted (30 one at a time, then 30 at once): ${count} WebGL context(s)`);
  assert.equal(count, 1);
  await page.close();
});

const canvasHash = (page: Page) =>
  page.evaluate(() => {
    const cv = document.querySelector<HTMLCanvasElement>("[data-kit-viewer] canvas")!;
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    let h = 0;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      h = (h * 31 + d[i]! + d[i + 1]! * 7 + d[i + 2]! * 13) | 0;
      if (d[i]! < 200) ink++;
    }
    return { h, ink };
  });

await check("loss", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${url}?stage=spring`, { waitUntil: "networkidle" });
  await ready(page);
  // The baseline after the same 12 mm and back the test does below, so the coil is the same (stretched) geometry.
  await page.evaluate(() => (window as unknown as Hooks).__stage.set({ force: 12 }));
  await page.waitForTimeout(100);
  await page.evaluate(() => (window as unknown as Hooks).__stage.set({ force: 0 }));
  await page.waitForTimeout(200);
  const before = await canvasHash(page);
  // Kept from before the loss: a lost context's getExtension returns null.
  await page.evaluate(() => {
    const w = window as unknown as Hooks & { __lose: WEBGL_lose_context };
    w.__lose = w.__stageGL()!.getExtension("WEBGL_lose_context")!;
    w.__lose.loseContext();
  });
  await page.waitForTimeout(200);
  const during = await canvasHash(page);
  assert.equal(during.h, before.h, "the figure keeps its picture while the context is lost");
  await page.evaluate(() => (window as unknown as Hooks).__stage.set({ force: 12 }));
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
  await page.waitForTimeout(400);
  const moved = await canvasHash(page);
  assert.notEqual(moved.h, before.h, "after restore the figure draws the pose set while lost");
  await page.evaluate(() => (window as unknown as Hooks).__stage.set({ force: 0 }));
  await page.waitForTimeout(200);
  const back = await canvasHash(page);
  // Not bit-identical: a coil stretched in place and the same coil rebuilt after the loss differ by a vertex or two.
  assert.ok(Math.abs(back.ink - before.ink) < before.ink * 0.01, `and the same pose draws the same picture as before the loss (${back.ink} vs ${before.ink} ink pixels)`);
  console.log(`  lost: picture kept; restored: redrawn (${back.ink} ink pixels, ${before.ink} before)`);
  await page.close();
});

await check("drag", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await page.goto(`${url}?stage=spring`, { waitUntil: "networkidle" });
  await ready(page);
  // At 1.2 N/mm the coils touch after 25 mm, at 30 N: the handle's reach.
  await page.evaluate(() => (window as unknown as Hooks).__stage.set({ stiffness: 1.2, force: 0 }));
  await page.waitForTimeout(100);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const ringCentre = async () => {
    const b = (await page.locator("[data-handle]").boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const force = () => page.evaluate(() => (window as unknown as Hooks).__stage.get().force!);
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const start = await ringCentre();
  await touch("touchStart", start.x, start.y);
  const follow: string[] = [];
  for (let dy = 6; dy <= 30; dy += 6) {
    await touch("touchMove", start.x, start.y + dy);
    await frame();
    const r = await ringCentre();
    follow.push(`finger +${dy}px: force ${await force()} N, ring +${(r.y - start.y).toFixed(1)}px`);
    // Within reach the ring sits on the model, which follows the finger to within half a step.
    assert.ok(Math.abs(r.y - (start.y + dy)) < 6, `ring follows the finger (${r.y - start.y} vs ${dy})`);
  }
  console.log(`  ${follow.join("; ")}`);
  assert.ok((await force()) > 1, "the model moved down with the finger");
  // Far past the reach.
  for (let dy = 60; dy <= 300; dy += 30) await touch("touchMove", start.x, start.y + dy);
  await frame();
  const atReach = await force();
  assert.equal(atReach, 30, "the drag stops at handle.reach (the coils touching)");
  const pulled = await ringCentre();
  await touch("touchEnd");
  await page.waitForTimeout(700);
  const settled = await ringCentre();
  const band = pulled.y - settled.y;
  console.log(`  past reach: force stops at ${atReach} N; ring pulled ${band.toFixed(1)}px past the model (max 56), springs back to it on release`);
  assert.ok(band > 10 && band <= 56.5, `the ring rubber-bands past the stop (${band}px)`);
  assert.equal(await force(), 30, "the model stays at the reach after release");

  // A vertical swipe starting off the handle scrolls the page; one starting on the handle drags instead.
  const box = (await page.locator("[data-kit-viewer]").boundingBox())!;
  const scrollBefore = await page.evaluate(() => scrollY);
  const sx = box.x + 30;
  const sy = box.y + box.height - 30;
  await touch("touchStart", sx, sy);
  // Paced like a finger, one move a frame; unpaced moves let Chromium's gesture detection drop most of the scroll.
  for (let i = 1; i <= 12; i++) {
    await touch("touchMove", sx, sy - i * 20);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
  await page.waitForTimeout(400);
  const scrolled = (await page.evaluate(() => scrollY)) - scrollBefore;
  assert.ok(scrolled > 50, `a swipe off the handle scrolls the page (${scrolled}px)`);
  // Let the swipe's momentum scroll finish before going back up.
  await page.waitForTimeout(1500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(200);
  const r = await ringCentre();
  const before = await page.evaluate(() => scrollY);
  await touch("touchStart", r.x, r.y);
  for (let i = 1; i <= 6; i++) {
    await touch("touchMove", r.x, r.y - i * 25);
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => scrollY), before, "a swipe on the handle does not scroll");
  console.log(`  swipe off the handle scrolled ${scrolled}px; swipe on it scrolled 0 and set force to ${await force()} mm`);
  await page.close();
});

await check("keys", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${url}?stage=spring`, { waitUntil: "networkidle" });
  await ready(page);
  const ring = page.locator("[data-handle]");
  assert.equal(await ring.getAttribute("role"), "slider");
  assert.match((await ring.getAttribute("aria-label")) ?? "", /: Push$/);
  await page.evaluate(() => (window as unknown as Hooks).__stage.set({ stiffness: 1.2, force: 0 }));
  await ring.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => (window as unknown as Hooks).__stage.get().force), 3);
  await page.keyboard.press("End");
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => (window as unknown as Hooks).__stage.get().force), 30, "End goes to the reach, not the slider's max");
  assert.equal(await ring.getAttribute("aria-valuenow"), "30");
  console.log(`  ArrowRight x3 -> 3 N, End -> 30 N (reach), aria-valuenow ${await ring.getAttribute("aria-valuenow")}`);
  await page.close();
});

await check("run", async () => {
  for (const reduced of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.goto(`${url}?stage=spring`, { waitUntil: "networkidle" });
    await ready(page);
    const captions = new Set<string>();
    const t0 = Date.now();
    await page.locator("[data-action=game]").click();
    while (!(await page.locator("[data-verdict]").count())) {
      captions.add((await page.locator("[data-live]").textContent()) ?? "");
      if (Date.now() - t0 > 5000) throw new Error("no verdict");
    }
    const ms = Date.now() - t0;
    const outcome = await page.locator("[data-verdict]").getAttribute("data-verdict");
    const cues = await page.locator("[data-cues]").textContent();
    console.log(`  ${reduced ? "reduced motion" : "normal"}: verdict ${outcome} after ${ms} ms; captions seen: ${[...captions].join(" | ")}; cues: ${cues}`);
    assert.ok(outcome && cues, "the run ends in a verdict and fires its cues");
    if (reduced) assert.ok(ms < 800, "reduced motion jumps to the end");
    else assert.ok(ms > 2000, "the run plays out");
    await page.close();
  }
});

await close();
process.exit(failed ? 1 : 0);
