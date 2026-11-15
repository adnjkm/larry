// Plays a whole lesson in a phone-sized browser: node scripts/play-lesson.ts [name] [--live | --photo]
// Uses fixtures/lessons/<name>.json when it exists, otherwise serves out/sample-lesson.json from a stubbed POST /api/lessons.
// --live loads the kit fixture and asks the real API server (node server/index.ts, port 8787) to write the lesson, and plays
// it while it streams in. Every line of the stream is timestamped on the way through, so the log shows what arrived when.
// --photo implies --live and starts from nothing: it uploads fixtures/photos/<name>.jpg through the capture input, watches the
// real POST /api/kits stream the kit in, and takes the kit for the rest of the run from that stream instead of from a fixture.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { request as httpRequest, createServer as createHttpServer } from "node:http";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import type { Browser, Locator, Page } from "playwright-core";
import { launchChromium } from "./browser.ts";
import { createServer } from "vite";
import { type Kit, KitEvent, parseKit } from "../shared/kit.ts";
import { type Chapter, type Lesson, LessonEvent, parseLesson } from "../shared/lesson.ts";
import { CATALOG, PRIMITIVE_BY_ID } from "../shared/primitives/catalog.ts";
import { READY_VIEWER_SELECTOR, VIEWER_SELECTOR } from "../src/viewport.ts";

const root = resolve(import.meta.dirname, "..");
const photo = process.argv.includes("--photo");
const live = photo || process.argv.includes("--live");
const outDir = join(root, "out", photo ? "play-photo" : live ? "play-live" : "play");
const name = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "pen";
const API_PORT = Number(process.env.LARRY_API_PORT ?? 8787);
const READY_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 20_000;
const LIVE_TIMEOUT_MS = 150_000;
const KIT_TIMEOUT_MS = 150_000;


const photoPath = join(root, "fixtures", "photos", `${name}.jpg`);
if (photo && !existsSync(photoPath)) throw new Error(`No photo at ${photoPath}`);
const fixtureKit = photo ? undefined : parseKit(JSON.parse(readFileSync(join(root, "fixtures", "kits", `${name}.json`), "utf8")));
const fixturePath = join(root, "fixtures", "lessons", `${name}.json`);
const stubbed = !live && !existsSync(fixturePath);
const lessonPath = stubbed ? join(root, "out", "sample-lesson.json") : fixturePath;
const lessonRaw: unknown = live ? null : JSON.parse(readFileSync(lessonPath, "utf8"));
const lesson: Lesson | undefined = live || !fixtureKit ? undefined : parseLesson(lessonRaw, fixtureKit, CATALOG);

/** What the live stream has delivered so far, each event stamped with the time it passed through the tee. */
const arrivals: { t: number; event: LessonEvent }[] = [];
const kitArrivals: { t: number; event: KitEvent }[] = [];
const t0 = Date.now();
const since = (t = Date.now()) => `${((t - t0) / 1000).toFixed(1)}s`;
const arrival = (type: LessonEvent["type"]) => arrivals.filter((a) => a.event.type === type);
const kitArrival = (type: KitEvent["type"]) => kitArrivals.filter((a) => a.event.type === type);
const streamedKit = (): Kit | undefined => {
  const done = kitArrival("done")[0]?.event;
  return done?.type === "done" ? done.kit : undefined;
};
/** The kit the lesson is built from: the fixture, or the one the real kit stream ended with. */
const playedKit = (): Kit => {
  const found = fixtureKit ?? streamedKit();
  assert.ok(found, "the kit has arrived");
  return found;
};
const finalLesson = () => {
  const done = arrival("done")[0]?.event;
  return done?.type === "done" ? done.lesson : undefined;
};

/** Forwards the app's kit and lesson requests to the API server unchanged and records each NDJSON line as it goes by. */
function teeToApi() {
  return createHttpServer((req, res) => {
    const recordsKit = req.url === "/api/kits";
    const upstream = httpRequest({ host: "127.0.0.1", port: API_PORT, method: req.method, path: req.url, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      let buffer = "";
      up.on("data", (chunk: Buffer) => {
        res.write(chunk);
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (recordsKit) kitArrivals.push({ t: Date.now(), event: KitEvent.parse(JSON.parse(line)) });
          else arrivals.push({ t: Date.now(), event: LessonEvent.parse(JSON.parse(line)) });
        }
      });
      up.on("end", () => res.end());
    });
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
}

const apiIsUp = () =>
  new Promise<boolean>((done) => {
    const socket = connect(API_PORT, "127.0.0.1", () => (socket.destroy(), done(true)));
    socket.on("error", () => done(false));
  });

const shot = (page: Page, file: string, fullPage = true) => page.screenshot({ path: join(outDir, file), fullPage });

/** Every viewer has drawn a frame and every entrance animation has finished, so a screenshot shows the settled screen. */
async function viewersReady(page: Page) {
  await page.waitForFunction(({ viewer, ready }) => document.querySelectorAll(viewer).length === document.querySelectorAll(ready).length, { viewer: VIEWER_SELECTOR, ready: READY_VIEWER_SELECTOR }, { timeout: READY_TIMEOUT_MS });
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)));
}

async function setSlider(input: Locator, value: number) {
  await input.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
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
  assert.equal(gltf.meshes.length, playedKit().parts.length, "one mesh per part");
  assert.ok(gltf.nodes.some((n) => n.scale?.[0] === 0.001), "root is scaled from mm to m");
  console.log(`download ${saved.suggestedFilename()}: ${bytes.length} bytes, ${gltf.meshes.length} meshes, ${gltf.materials.length} materials, root scale 0.001`);
}

mkdirSync(outDir, { recursive: true });
if (live && !(await apiIsUp())) throw new Error(`--live and --photo need the API server: node server/index.ts (port ${API_PORT})`);
const tee = live ? teeToApi().listen(0, "127.0.0.1") : undefined;
const teePort = tee ? await new Promise<number>((r) => tee.once("listening", () => r((tee.address() as { port: number }).port))) : 0;
const server = await createServer({
  root,
  logLevel: "warn",
  server: { port: 0, host: "127.0.0.1", forwardConsole: false, ...(tee ? { proxy: { "/api": `http://127.0.0.1:${teePort}` } } : {}) },
});
let browser: Browser | undefined;
let exitCode = 0;
const pageErrors: string[] = [];

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL");

  browser = await launchChromium();
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
      else {
        const whole = parseLesson(lessonRaw, playedKit(), CATALOG);
        const events: LessonEvent[] = [{ type: "started", title: whole.title, hook: whole.hook }, ...whole.chapters.map((chapter): LessonEvent => ({ type: "chapter", chapter })), { type: "done", lesson: whole }];
        await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
      }
    });
  }

  /** The chapter at `c`: from the fixture, or from the stream once it has arrived (waiting on the player's own waiting state if the script outruns it). */
  const known = (c: number): Chapter | undefined => {
    const event = arrivals.filter((a) => a.event.type === "chapter")[c]?.event;
    return event?.type === "chapter" ? event.chapter : finalLesson()?.chapters[c];
  };
  let waitingShot = false;
  async function chapterAt(c: number): Promise<Chapter | undefined> {
    if (lesson) return lesson.chapters[c];
    if (!known(c) && !finalLesson()) {
      const waited = await page.locator("[data-waiting]").waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (waited) {
        console.log(`${since()} waiting state shown: out of chapters at ${c}, ${arrival("chapter").length} streamed`);
        if (!waitingShot) await shot(page, "03-waiting-for-next-part.png", false);
        waitingShot = true;
      } else assert.ok(known(c) || finalLesson(), `chapter ${c + 1} has not arrived, so the player must show its waiting state`);
    }
    while (!known(c) && !finalLesson()) {
      if (arrival("failed").length > 0) throw new Error(`lesson stream failed: ${JSON.stringify(arrival("failed")[0]?.event)}`);
      await page.waitForTimeout(100);
    }
    return known(c);
  }

  await page.goto(photo ? url : `${url}?demo=${name}${live ? "&live" : ""}`, { waitUntil: "domcontentloaded" });
  const start = page.locator("[data-action=start]");
  if (photo) {
    await page.getByRole("button", { name: "Photograph something" }).waitFor();
    await shot(page, "k0-capture.png", false);
    const uploaded = Date.now();
    await page.locator("input[type=file]").setInputFiles(photoPath);
    await page.getByText("Larry is taking it apart").waitFor();
    await shot(page, "k1-kit-waiting.png", false);
    console.log(`${since()} uploaded ${name}.jpg, kit request sent, waiting screen shown`);
    while (kitArrival("part").length < 3 && kitArrival("done").length === 0) {
      if (kitArrival("failed").length > 0) throw new Error(`kit stream failed: ${JSON.stringify(kitArrival("failed")[0]?.event)}`);
      if (Date.now() - uploaded > KIT_TIMEOUT_MS) throw new Error("no kit parts arrived");
      await page.waitForTimeout(100);
    }
    console.log(`${since(kitArrival("part")[0]?.t)} kit first part (started ${since(kitArrival("started")[0]?.t)}, ${kitArrival("part").length} part(s) streamed by ${since()}), done: ${kitArrival("done").length > 0 ? "yes" : "no"}`);
    await viewersReady(page);
    await shot(page, "k2-kit-streaming.png", false);
    console.log(`${since()} kit streaming screen: ${await page.locator("li").count()} part row(s) listed, ${kitArrival("part").length} part(s) streamed, done: ${kitArrival("done").length > 0 ? "yes" : "no"}`);
    await start.waitFor({ timeout: KIT_TIMEOUT_MS });
    const kit = playedKit();
    console.log(`${since()} kit done at ${since(kitArrival("done")[0]?.t)}: "${kit.name}", ${kit.parts.length} parts, north-star screen shown`);
    await viewersReady(page);
    await shot(page, "k3-north-star-after-kit.png");
  }
  if (stubbed) {
    await page.getByText("Larry is planning your build").waitFor();
    assert.equal(await page.locator("button", { hasText: "Larry is planning your build" }).isDisabled(), true, "Start is disabled while the lesson is planned");
    await viewersReady(page);
    await shot(page, "00-north-star-planning.png");
    await page.locator("[data-lesson-failed]").waitFor();
    await shot(page, "00-north-star-failed.png");
    console.log("lesson failure state shown, retrying");
    await page.locator("[data-action=retry]").click();
  }
  if (live) {
    await page.locator("[data-hook]").waitFor({ timeout: LIVE_TIMEOUT_MS });
    const hookSeen = Date.now();
    const chaptersAtHook = arrival("chapter").length;
    assert.equal(chaptersAtHook, 0, "the hook is shown before any chapter has arrived");
    assert.equal(await start.isDisabled(), true, "Start is disabled until the first chapter arrives");
    console.log(`${since(hookSeen)} lesson started: hook shown (started arrived ${since(arrival("started")[0]?.t)}), Start disabled, 0 chapters`);
    await viewersReady(page);
    await shot(page, "00-north-star-hook-only.png");
  }
  await page.locator("[data-action=start]:not([disabled])").waitFor({ timeout: live ? LIVE_TIMEOUT_MS : STEP_TIMEOUT_MS });
  if (live) {
    const enabled = Date.now();
    const chapters = arrival("chapter").length;
    const rows = await page.locator("[data-requirements] li").count();
    const finished = arrival("done").length;
    console.log(`${since(enabled)} Start building enabled with ${chapters} chapter(s) streamed (first at ${since(arrival("chapter")[0]?.t)}), ${rows} requirement row(s) shown, lesson done: ${finished > 0 ? "yes" : "no"}`);
    assert.ok(chapters >= 1, "Start enables only once a chapter has arrived");
    assert.equal(finished, 0, "Start enables while the rest of the lesson is still arriving");
    await shot(page, "02-north-star-first-chapter.png");
  }
  assert.equal(await start.innerText(), "Start building");
  await viewersReady(page);
  await shot(page, "01-north-star.png");
  await download(page, page.locator("[data-action=download]"), `${name}-north-star.glb`);

  await start.click();

  let chapterNumber = 0;
  let firstTune = true;
  let firstRun = true;
  let midStreamShot = false;
  for (let c = 0; ; c++) {
    const chapter = await chapterAt(c);
    if (!chapter) break;
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
      if (problem) assert.equal(await next.count(), 0, `${step.id}: Next is not offered before the problem is solved`);

      if (problem?.type === "run") {
        assert.equal(await page.locator("[data-figure]").count(), step.primitive === null ? 0 : 1, `${step.id}: a run step draws its primitive, if it has one`);
        assert.equal(await page.locator("[data-figure] input[type=range]").count(), 0, `${step.id}: a run step's figure stays at its starting values`);
        if (firstRun && step.primitive !== null) {
          await shot(page, `run-figure-${step.id}.png`, false);
          firstRun = false;
        }
        // Held until the outcome appears, however slowly the software renderer gets frames out.
        await page.locator("[data-action=run]").hover();
        await page.mouse.down();
        await page.locator("[data-note]").waitFor();
        await page.mouse.up();
      } else if (problem?.type === "pick") {
        const wrong = problem.options.findIndex((o) => !o.works);
        const right = problem.options.findIndex((o) => o.works);
        if (wrong >= 0) {
          await page.locator(`[data-option="${wrong}"] button`).click();
          await page.locator(`[data-option="${wrong}"][data-tried]`).waitFor();
          const tried = page.locator(`[data-option="${wrong}"] button`);
          assert.equal(await tried.getAttribute("aria-disabled"), "true", "a failed option is marked as tried");
          await tried.click({ force: true });
          assert.equal(await page.locator("[data-option][data-tried]").count(), 1, "a failed option cannot be re-picked");
          assert.ok((await tried.evaluate((b) => b === document.activeElement)), "a failed option keeps focus");
          assert.equal(await next.count(), 0, "a wrong pick does not complete the step");
          await viewersReady(page);
          if (index === 1) await shot(page, `pick-wrong-${step.id}.png`);
        }
        await page.locator(`[data-option="${right}"] button`).click();
      } else if (problem?.type === "tune") {
        const primitive = PRIMITIVE_BY_ID.get(step.primitive ?? "");
        const slider = primitive?.sliders.find((s) => s.id === problem.slider);
        assert.ok(primitive && slider, `${step.id}: tune slider exists`);
        const input = page.locator(`[data-slider="${slider.id}"] input`);
        assert.equal(await page.locator("[data-readouts]").count(), 0, "a lesson figure has no readouts");
        assert.equal(await page.locator("[data-slider]").count(), 1, "a tune step shows only its own slider");

        await setSlider(input, slider.min);
        await page.locator('[data-note="fail"]').waitFor();
        assert.ok((await page.locator('[data-note="fail"]').innerText()).includes(problem.tooLow.slice(0, 20)), "too-low text shown below the window");
        assert.equal(await next.count(), 0, "a failed try does not complete the step");

        await input.focus();
        await page.keyboard.press("End");
        await page.waitForFunction((t) => document.querySelector('[data-note="fail"]')?.textContent?.includes(t), problem.tooHigh.slice(0, 20));

        const inside = snap(slider, (problem.min + problem.max) / 2);
        assert.ok(inside >= problem.min && inside <= problem.max, `${step.id}: slider step can land inside the window (got ${inside})`);
        await setSlider(input, slider.min);
        await page.waitForFunction((t) => document.querySelector('[data-note="fail"]')?.textContent?.includes(t), problem.tooLow.slice(0, 20));
        if (firstTune) {
          await viewersReady(page);
          await shot(page, `tune-mid-attempt-${step.id}.png`);
          firstTune = false;
        }
        const box = await input.boundingBox();
        assert.ok(box, `${step.id}: slider is on screen`);
        const THUMB = 24;
        const xAt = (value: number) => box.x + THUMB / 2 + ((value - slider.min) / (slider.max - slider.min)) * (box.width - THUMB);
        await page.mouse.move(xAt(slider.min), box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(xAt(inside), box.y + box.height / 2, { steps: 8 });
        await input.evaluate((el: HTMLInputElement, v) => new Promise<void>((done) => (function check() { Number(el.value) === v ? done() : requestAnimationFrame(check); })()), inside);
        assert.equal(await page.locator('[data-note="ok"]').count(), 0, "the verdict waits for the slider to be let go");
        await page.mouse.up();
        await page.locator('[data-note="ok"]').waitFor();
      }

      const solved = await article.getAttribute("data-complete");
      console.log(`${live ? `${since()} ` : ""}${chapter.id} | ${step.title} | ${type} | solved: ${solved !== null ? "yes" : "no"}`);
      if (live && !midStreamShot && index === 1 && !finalLesson()) {
        midStreamShot = true;
        await shot(page, "04-mid-stream-step.png", false);
        console.log(`${since()} mid-stream: playing ${chapter.id}/${step.id} with ${arrival("chapter").length} chapter(s) streamed, lesson not done`);
      }
      assert.notEqual(solved, null, `${step.id} can be completed`);
      const stage = await page.locator("[data-stage]").getAttribute("data-stage");
      assert.equal(stage, step.earns.length > 0 || step.primitive === null ? "build" : "figure", `${step.id}: once solved, the stage shows the build if the step earned parts, else its figure`);
      assert.equal(await page.locator(`${VIEWER_SELECTOR}:visible`).count(), 1, `${step.id}: one model per step, on its stage`);
      assert.equal(await next.count(), 1, `${step.id}: Next appears once the step is complete`);
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
  assert.equal(await page.locator(`[data-finish] ${VIEWER_SELECTOR}`).count(), 1, "the finish shows the built model");
  await shot(page, "99-finish.png");
  const done = await page.locator("[data-roadmap] [data-status=done]").count();
  assert.equal(done, chapterNumber, "every roadmap chip is ticked at the finish");
  assert.equal(await page.locator("[data-roadmap]").getAttribute("aria-valuenow"), String(chapterNumber), "the progress bar reads full at the finish");
  assert.equal(await page.locator("[data-roadmap] [data-placeholder]").count(), 0, "no placeholder chip once the lesson is done");
  if (live) {
    assert.ok(finalLesson(), "the stream ended with done");
    console.log(`${since()} finish shown: ${chapterNumber} chapters played, kit timeline ${kitArrivals.map((a) => `${a.event.type}@${since(a.t)}`).join(" ")}, lesson timeline ${arrivals.map((a) => `${a.event.type}@${since(a.t)}`).join(" ")}`);
  }
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
  tee?.close();
}
process.exit(exitCode);
