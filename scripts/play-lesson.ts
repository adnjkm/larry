// Plays a whole lesson in a phone-sized browser: pnpm exec node scripts/play-lesson.ts [name]
// Uses fixtures/lessons/<name>.json when it exists, otherwise serves out/sample-lesson.json from a stubbed POST /api/lessons.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type Locator, type Page, chromium } from "playwright-core";
import { createServer } from "vite";
import { parseKit } from "../shared/kit.ts";
import { type Lesson, parseLesson } from "../shared/lesson.ts";
import { CATALOG, PRIMITIVE_BY_ID } from "../src/primitives/catalog.ts";

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "out", "play");
const name = process.argv[2] ?? "pen";
const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const READY_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 20_000;

const browserLayouts = [
  { dir: "chromium_headless_shell", executable: "chrome-headless-shell-mac-arm64/chrome-headless-shell" },
  { dir: "chromium", executable: "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium" },
];

function findChromium(): string {
  for (const { dir, executable } of browserLayouts) {
    const revisions = readdirSync(cache)
      .filter((n) => n.startsWith(`${dir}-`))
      .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
    for (const revision of revisions) {
      const path = join(cache, revision, executable);
      if (existsSync(path)) return path;
    }
  }
  throw new Error(`No chromium or chromium_headless_shell in ${cache}`);
}

const kit = parseKit(JSON.parse(readFileSync(join(root, "fixtures", "kits", `${name}.json`), "utf8")));
const fixturePath = join(root, "fixtures", "lessons", `${name}.json`);
const stubbed = !existsSync(fixturePath);
const lessonPath = stubbed ? join(root, "out", "sample-lesson.json") : fixturePath;
const lessonRaw: unknown = JSON.parse(readFileSync(lessonPath, "utf8"));
const lesson: Lesson = parseLesson(lessonRaw, kit, CATALOG);

const shot = (page: Page, file: string, fullPage = true) => page.screenshot({ path: join(outDir, file), fullPage });

async function viewersReady(page: Page) {
  await page.waitForFunction(() => [...document.querySelectorAll("[data-kit-viewer]")].every((v) => v.hasAttribute("data-ready")), undefined, { timeout: READY_TIMEOUT_MS });
  await page.waitForTimeout(500);
}

async function setSlider(input: Locator, value: number) {
  await input.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

/** A step-aligned slider value as close to `target` as the slider's step allows. */
function snap(slider: { min: number; max: number; step: number }, target: number): number {
  const k = Math.round((target - slider.min) / slider.step);
  return Number((slider.min + k * slider.step).toFixed(6));
}

async function download(page: Page, button: Locator, file: string) {
  const [saved] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const path = join(outDir, file);
  await saved.saveAs(path);
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 4).toString("latin1"), "glTF", `${file} starts with glTF`);
  assert.equal(bytes.readUInt32LE(4), 2, "glTF version 2");
  assert.equal(bytes.readUInt32LE(8), bytes.length, "header length matches file size");
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, "first chunk is JSON");
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as { meshes: unknown[]; nodes: { name?: string; scale?: number[] }[]; materials: unknown[] };
  assert.equal(gltf.meshes.length, kit.parts.length, "one mesh per part");
  assert.ok(gltf.nodes.some((n) => n.scale?.[0] === 0.001), "root is scaled from mm to m");
  console.log(`download ${saved.suggestedFilename()}: ${bytes.length} bytes, ${gltf.meshes.length} meshes, ${gltf.materials.length} materials, root scale 0.001`);
}

mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, logLevel: "warn", server: { port: 0, host: "127.0.0.1", forwardConsole: false } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let exitCode = 0;
const pageErrors: string[] = [];

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL");

  browser = await chromium.launch({ executablePath: findChromium(), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  page.on("console", (m) => m.type() === "error" && console.error(`[console error] ${m.text()}`));
  page.on("pageerror", (e) => pageErrors.push(e.message));

  let lessonRequests = 0;
  if (stubbed) {
    await page.route("**/api/lessons", async (route) => {
      lessonRequests++;
      await new Promise((r) => setTimeout(r, 1200));
      if (lessonRequests === 1) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Larry's planner is asleep" }) });
      else await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lesson: lessonRaw }) });
    });
  }

  await page.goto(`${url}?demo=${name}`, { waitUntil: "domcontentloaded" });
  const start = page.locator("[data-action=start]");
  if (stubbed) {
    await page.getByText("Larry is planning your build…").waitFor();
    assert.equal(await page.locator("button", { hasText: "Larry is planning your build…" }).isDisabled(), true, "Start is disabled while the lesson is planned");
    await viewersReady(page);
    await shot(page, "00-north-star-planning.png");
    await page.locator("[data-lesson-failed]").waitFor();
    await shot(page, "00-north-star-failed.png");
    console.log("lesson failure state shown, retrying");
    await page.locator("[data-action=retry]").click();
  }
  await page.locator("[data-action=start]:not([disabled])").waitFor();
  assert.equal(await start.innerText(), "Start building");
  await viewersReady(page);
  await shot(page, "01-north-star.png");
  await download(page, page.locator("[data-action=download]"), `${name}-north-star.glb`);

  await start.click();

  let chapterNumber = 0;
  let firstTune = true;
  for (const chapter of lesson.chapters) {
    chapterNumber++;
    for (const [index, step] of chapter.steps.entries()) {
      const article = page.locator(`article[data-step="${step.id}"]`);
      await article.waitFor();
      await viewersReady(page);
      const next = page.locator("[data-action=next]");
      const problem = step.problem;
      const type = problem?.type ?? "none";

      if (index === 0) {
        assert.equal(await page.locator("[data-chapter-header]").count(), 1, "chapter header shown on entering a chapter");
        await shot(page, `chapter-${String(chapterNumber).padStart(2, "0")}-${chapter.id}.png`);
        await shot(page, `chapter-${String(chapterNumber).padStart(2, "0")}-${chapter.id}-viewport.png`, false);
      }
      if (problem) assert.equal(await next.isDisabled(), true, `${step.id}: Next is disabled before the problem is solved`);

      if (problem?.type === "run") {
        await page.locator("[data-action=run]").click();
        await page.locator("[data-note]").waitFor();
      } else if (problem?.type === "pick") {
        const wrong = problem.options.findIndex((o) => !o.works);
        const right = problem.options.findIndex((o) => o.works);
        if (wrong >= 0) {
          await page.locator(`[data-option="${wrong}"] button`).click();
          await page.locator(`[data-option="${wrong}"][data-tried]`).waitFor();
          assert.equal(await page.locator(`[data-option="${wrong}"] button`).isDisabled(), true, "a failed option cannot be re-picked");
          assert.equal(await next.isDisabled(), true, "a wrong pick does not complete the step");
          await viewersReady(page);
          if (index === 1) await shot(page, `pick-wrong-${step.id}.png`);
        }
        await page.locator(`[data-option="${right}"] button`).click();
      } else if (problem?.type === "tune") {
        const primitive = PRIMITIVE_BY_ID.get(step.primitive ?? "");
        const slider = primitive?.sliders.find((s) => s.id === problem.slider);
        assert.ok(primitive && slider, `${step.id}: tune slider exists`);
        const input = page.locator(`[data-slider="${slider.id}"] input`);
        const readouts = page.locator("[data-readouts]");

        await setSlider(input, slider.min);
        await page.waitForTimeout(150);
        const lowReadouts = await readouts.innerText();
        await page.locator("[data-action=try]").click();
        await page.locator('[data-note="fail"]').waitFor();
        assert.ok((await page.locator('[data-note="fail"]').innerText()).includes(problem.tooLow.slice(0, 20)), "too-low text shown below the window");
        assert.equal(await next.isDisabled(), true, "a failed try does not complete the step");

        await setSlider(input, slider.max);
        await page.waitForTimeout(150);
        const highReadouts = await readouts.innerText();
        await page.locator("[data-action=try]").click();
        await page.waitForFunction((t) => document.querySelector('[data-note="fail"]')?.textContent?.includes(t), problem.tooHigh.slice(0, 20));
        console.log(`  readouts change with the slider: ${lowReadouts !== highReadouts ? "yes" : "NO"}`);

        const inside = snap(slider, (problem.min + problem.max) / 2);
        assert.ok(inside >= problem.min && inside <= problem.max, `${step.id}: slider step can land inside the window (got ${inside})`);
        await setSlider(input, slider.min);
        await page.waitForTimeout(150);
        if (firstTune) {
          await viewersReady(page);
          await shot(page, `tune-mid-attempt-${step.id}.png`);
          firstTune = false;
        }
        await setSlider(input, inside);
        await page.waitForTimeout(150);
        await page.locator("[data-action=try]").click();
        await page.locator('[data-note="ok"]').waitFor();
      }

      const solved = await article.getAttribute("data-complete");
      console.log(`${chapter.id} | ${step.title} | ${type} | solved: ${solved !== null ? "yes" : "no"}`);
      assert.notEqual(solved, null, `${step.id} can be completed`);
      if (step.earns.length > 0) assert.equal(await page.locator("[data-added]").count(), 1, "earned parts are announced");
      assert.equal(await next.isEnabled(), true, `${step.id}: Next is enabled once the step is complete`);
      if (index === chapter.steps.length - 1 && chapterNumber <= 2) {
        await viewersReady(page);
        await shot(page, `solved-${step.id}.png`);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await shot(page, `solved-${step.id}-viewport.png`, false);
      }
      await next.click();
    }
  }

  await page.locator("[data-finish]").waitFor();
  await viewersReady(page);
  await shot(page, "99-finish.png");
  const done = await page.locator("[data-roadmap] [data-status=done]").count();
  assert.equal(done, lesson.chapters.length, "every roadmap chip is ticked at the finish");
  await download(page, page.locator("[data-action=download]"), `${name}.glb`);
  await page.locator("[data-action=restart]").click();
  await page.locator("[data-finish]").waitFor({ state: "detached" });
  assert.deepEqual(pageErrors, [], "no uncaught page errors");
  console.log("played every step");
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  if (pageErrors.length > 0) console.error(`[page errors] ${pageErrors.join(" | ")}`);
  await browser?.close();
  await server.close();
}
process.exit(exitCode);
