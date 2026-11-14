// Plays every lesson through the real UI, driven only by the lesson data, and screenshots each stage.
// Usage: node prototypes/lesson/verify.ts [run ...]
//   run = a lesson id from lessons/index.ts (e.g. bottle), or inspect-<sample> for the Inspect lesson
//   derived from that sample's kit. With no runs: every hand-written lesson plus inspect-<sample> for
//   every fixture kit. Screenshots go to out/lesson/<run>-<nn>-<stage>.png.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";
import viteConfig from "../../vite.config.ts";
import { type Kit, parseKit } from "../../shared/kit.ts";
import { LESSONS } from "./lessons/index.ts";
import { inspectLesson } from "./lessons/inspect.ts";
import { fixedValues, midWindow, type Module, passBand, passesAt, presentAfter, sliderSteps, type TestCtx, type Values, type Window, type Workshop } from "./model.ts";
import { restCentre } from "./pose.ts";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "out", "lesson");
const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const kitsDir = join(root, "fixtures", "kits");
const KITS: Record<string, Kit> = Object.fromEntries(
  readdirSync(kitsDir).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), parseKit(JSON.parse(readFileSync(join(kitsDir, f), "utf8")))]),
);
const READY = 90_000;
const TEST_TIMEOUT = 30_000;
/** Long enough into a test that the object is mid-move (the flip has turned over and drops are falling). */
const MID_TEST_MS = 1300;

function findChromium(): string {
  for (const { dir, executable } of [
    { dir: "chromium_headless_shell", executable: "chrome-headless-shell-mac-arm64/chrome-headless-shell" },
    { dir: "chromium", executable: "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium" },
  ]) {
    const revisions = readdirSync(cache)
      .filter((name) => name.startsWith(`${dir}-`))
      .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
    for (const revision of revisions) {
      const path = join(cache, revision, executable);
      if (existsSync(path)) return path;
    }
  }
  throw new Error(`No chromium or chromium_headless_shell in ${cache}`);
}

type Row = { run: string; step: string; ok: boolean; detail: string };
const rows: Row[] = [];

class Run {
  shots = 0;
  errors: string[] = [];
  readonly name: string;
  readonly page: Page;
  constructor(name: string, page: Page) {
    this.name = name;
    this.page = page;
  }

  check(step: string, ok: boolean, detail = "") {
    rows.push({ run: this.name, step, ok, detail });
    if (!ok) throw new Error(`${step}: ${detail}`);
  }

  async shot(stage: string) {
    this.shots += 1;
    await this.page.screenshot({ path: join(outDir, `${this.name}-${String(this.shots).padStart(2, "0")}-${stage}.png`), fullPage: true });
  }

  async stage(stage: string) {
    await this.page.waitForSelector(`[data-stage="${stage}"]`, { timeout: READY });
    if (await this.page.locator(`[data-stage="${stage}"] [data-kit-viewer]`).count()) await this.page.waitForSelector(`[data-stage="${stage}"] [data-kit-viewer][data-ready]`, { timeout: READY });
    await this.page.waitForTimeout(300);
  }

  async open(sample: string, inspect: boolean, url: string) {
    await this.page.goto(`${url}prototypes/lesson/${inspect ? "?inspect" : ""}`, { waitUntil: "networkidle" });
    await this.page.waitForSelector(`[data-sample="${sample}"] canvas[data-ready]`, { timeout: READY });
    await this.shot("home");
    await this.page.click(`[data-sample="${sample}"]`);
    await this.page.waitForSelector("[data-start]", { timeout: 20_000 });
    const listed = await this.page.locator(".parts li").count();
    this.check("scan lists every kit part", listed === KITS[sample]!.parts.length, `${listed} of ${KITS[sample]!.parts.length}`);
    await this.shot("scan");
    await this.page.click("[data-start]");
    const thumb = await this.page.locator(".north canvas[data-dither]").count();
    const photos = await this.page.locator("img").count();
    this.check("no raw photo, goal is dithered", thumb === 1 && photos === 0, `${thumb} dithered goal, ${photos} <img>`);
  }

  async setRange(selector: string, value: number) {
    await this.page.locator(selector).evaluate((el, v) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }

  /** Runs each test, screenshotting it mid-move, and returns the statuses. */
  async runTests(ids: readonly string[], label: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const id of ids) {
      await this.page.click(`[data-test="${id}"]`);
      await this.page.waitForTimeout(MID_TEST_MS);
      await this.shot(`${label}-${id}`);
      const done = await this.page.waitForSelector(`[data-test="${id}"]:not([disabled]):is([data-status="pass"], [data-status="fail"])`, { timeout: TEST_TIMEOUT });
      out[id] = (await done.getAttribute("data-status")) ?? "?";
    }
    return out;
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const inWindow = (v: number, [lo, hi]: Window) => v >= lo - 1e-6 && v <= hi + 1e-6;
/** A value halfway between the slider's end and the window's edge, snapped to the slider's step. */
const outside = (m: Module, side: "low" | "high") => {
  const { slider: s } = m.fault;
  const [lo, hi] = m.fix.window;
  const steps = sliderSteps(s).filter((v) => (side === "low" ? v < lo - 1e-6 : v > hi + 1e-6));
  return steps[Math.floor(steps.length / 2)]!;
};

/**
 * The fix rules, checked from the test verdicts without a browser. For every module and every tuning a
 * player can reach (each earlier module anywhere in its passing band): the band of passing values is
 * one unbroken run with failing values on both sides, the failures on the two sides read differently,
 * and at the middle tuning the band is exactly the declared window. Every reachable full tuning passes
 * the final tests.
 */
function checkRules(r: Run, lesson: Workshop, kit: Kit) {
  const ctxAt = (index: number): TestCtx => {
    const present = presentAfter(lesson, kit, index);
    return { kit, present, centre: restCentre(kit, present, lesson.rest({ kit, present })) };
  };
  let reachable: Values[] = [fixedValues(lesson)];
  for (const [i, m] of lesson.modules.entries()) {
    const ctx = ctxAt(i);
    const { slider } = m.fault;
    const steps = sliderSteps(slider);
    const problems: string[] = [];
    const next: Values[] = [];
    for (const values of reachable) {
      const passing = steps.filter((v) => passesAt(m, values, v, ctx));
      const band = passBand(m, values, ctx);
      const at = JSON.stringify(Object.fromEntries(lesson.modules.slice(0, i).map((q) => [q.fault.slider.id, values[q.fault.slider.id]])));
      if (!band) {
        problems.push(`nothing passes at ${at}`);
        continue;
      }
      if (passing.length !== steps.filter((v) => inWindow(v, band)).length) problems.push(`the passing values have a gap at ${at}`);
      if (near(band[0], slider.min) || near(band[1], slider.max)) problems.push(`band ${band.join("..")} reaches the end of the slider at ${at}`);
      const lines = (v: number) => m.tests.map((t) => t.run({ ...values, [slider.id]: v }, ctx).verdict).filter((x) => !x.pass).map((x) => x.line.replace(/[\d.]+/g, "#"));
      const low = lines(slider.min);
      const high = lines(slider.max);
      if (low.some((l) => high.includes(l))) problems.push(`the same failure on both sides at ${at}: ${low.join(" / ")}`);
      next.push(...passing.map((v) => ({ ...values, [slider.id]: v })));
    }
    const mid = fixedValues(lesson);
    const declared = passBand(m, mid, ctx);
    if (!declared || !near(declared[0], m.fix.window[0]) || !near(declared[1], m.fix.window[1]))
      problems.push(`declared window ${m.fix.window.join("..")} but ${declared?.join("..") ?? "nothing"} passes at the middle tuning`);
    r.check(`m${i + 1} rules: ${slider.id} fails below and above its window, at ${reachable.length} reachable tunings`, problems.length === 0, problems.slice(0, 3).join("; "));
    reachable = next;
  }
  const ctx = ctxAt(lesson.modules.length - 1);
  const failing = reachable.filter((values) => !lesson.final.tests.every((t) => t.run(values, ctx).verdict.pass));
  r.check(`rules: every reachable tuning (${reachable.length}) passes the final tests`, failing.length === 0, JSON.stringify(failing[0] ?? {}));
}

async function playWorkshop(r: Run, lesson: Workshop, url: string) {
  const kit = KITS[lesson.id];
  if (!kit) throw new Error(`no fixture kit for lesson ${lesson.id}`);
  checkRules(r, lesson, kit);
  await r.open(lesson.id, false, url);
  for (const [i, m] of lesson.modules.entries()) {
    const tag = `m${i + 1}`;
    await r.stage("learn");
    const tabs = await r.page.locator("[data-tab]").count();
    r.check(`${tag} learn teaches ${m.teach.map((p) => p.id).join("+")}`, m.teach.length === 1 ? tabs === 0 : tabs === m.teach.length, `${tabs} tabs`);
    await r.shot(`${tag}-learn`);
    await r.page.click("[data-next]");

    await r.stage("assemble");
    await r.shot(`${tag}-assemble`);
    await r.page.click("[data-fit]");
    await r.page.waitForSelector('[data-stage="assemble"] [data-next]', { timeout: 10_000 });
    await r.page.waitForTimeout(300);
    await r.shot(`${tag}-built`);
    r.check(`${tag} fit it`, true);
    await r.page.click("[data-next]");

    await r.stage("sandbox");
    const testIds = m.tests.map((t) => t.id);
    const before = await r.runTests(testIds, `${tag}-fault`);
    const failing = testIds.filter((id) => before[id] === "fail");
    r.check(`${tag} tests fail at the fault`, failing.length > 0 && (await r.page.locator('[data-stage="sandbox"]').count()) === 1, JSON.stringify(before));

    const chips = await r.page.locator("[data-guide] [data-part]").evaluateAll((els) => els.map((e) => e.getAttribute("data-part") ?? ""));
    const wrong = chips.find((id) => id !== m.suspect);
    if (wrong) {
      await r.page.click(`[data-guide] [data-part="${wrong}"]`);
      const said = (await r.page.textContent("[data-note]")) ?? "";
      const expected = m.misses[wrong] ?? m.missDefault;
      r.check(`${tag} wrong part (${wrong}) is turned away`, said === expected && (await r.page.locator("[data-note][data-found]").count()) === 0, said);
    }
    await r.page.click(`[data-guide] [data-part="${m.suspect}"]`);
    r.check(`${tag} suspect (${m.suspect}) unlocks the fix`, (await r.page.locator("[data-note][data-found]").count()) === 1 && (await r.page.locator(`[data-fix] input[data-slider="${m.fault.slider.id}"]:not([disabled])`).count()) === 1);
    await r.shot(`${tag}-diagnosed`);

    const failed: Record<string, string> = {};
    for (const side of ["low", "high"] as const) {
      const v = outside(m, side);
      await r.setRange(`[data-fix] input[data-slider="${m.fault.slider.id}"]`, v);
      const got = await r.runTests(testIds, `${tag}-${side}`);
      const bad = testIds.filter((id) => got[id] === "fail");
      failed[side] = (await r.page.locator(`[data-log] [data-result] .bad`).allTextContents()).join(" / ");
      r.check(`${tag} ${m.fault.slider.id} = ${v} (${side === "low" ? "below" : "above"} the window) fails ${bad.join("+") || "nothing"}`, bad.length > 0, JSON.stringify(got));
    }
    r.check(`${tag} the two sides fail differently`, failed.low !== failed.high, `${failed.low} | ${failed.high}`);
    r.check(`${tag} third hint names both sides`, (await r.page.locator('[data-hint="3"] .side').count()) === 2);
    r.check(`${tag} readouts beside the fix`, (await r.page.locator("[data-fix] [data-readouts] [data-number]").count()) > 0);

    const mid = midWindow(m.fault.slider, m.fix.window);
    await r.setRange(`[data-fix] input[data-slider="${m.fault.slider.id}"]`, mid);
    const after = await r.runTests(testIds, `${tag}-fixed`);
    await r.stage("earned");
    r.check(`${tag} ${m.fault.slider.id} = ${mid} passes every test`, testIds.every((id) => after[id] === "pass"), JSON.stringify(after));
    await r.shot(`${tag}-earned`);
    await r.page.click("[data-next]");
  }

  await r.stage("final");
  await r.shot("final-exploded");
  await r.page.click("[data-assemble]");
  await r.page.waitForSelector("[data-assemble][disabled]", { timeout: 10_000 });
  const finalIds = lesson.final.tests.map((t) => t.id);
  const statuses = await r.runTests(finalIds, "final");
  await r.page.waitForSelector('[data-stage="final"] [data-earned]', { timeout: 5_000 });
  r.check("final tests pass and the object is earned", finalIds.every((id) => statuses[id] === "pass"), JSON.stringify(statuses));
  await r.shot("final-earned");
}

async function playInspect(r: Run, sample: string, url: string) {
  const kit = KITS[sample];
  if (!kit) throw new Error(`no fixture kit ${sample}`);
  const lesson = inspectLesson(kit);
  await r.open(sample, true, url);
  if (lesson.teach.length > 0) {
    await r.stage("learn");
    const tabs = await r.page.locator("[data-tab]").count();
    r.check(`learn teaches ${lesson.teach.map((t) => t.primitive.id).join("+")}`, lesson.teach.length === 1 ? tabs === 0 : tabs === lesson.teach.length, `${tabs} tabs`);
    await r.shot("learn");
    await r.page.click("[data-next]");
  }

  await r.stage("apart");
  const plain = await r.page.locator("[data-structure]").count();
  r.check(lesson.teach.length === 0 ? "says plainly it has no mechanism" : "no structure note when it has mechanisms", plain === (lesson.teach.length === 0 ? 1 : 0));
  await r.shot("apart");
  await r.setRange("[data-explode] input", 1);
  for (const p of kit.parts) {
    await r.page.click(`[data-part="${p.id}"]`);
    const role = (await r.page.textContent(`[data-role="${p.id}"]`)) ?? "";
    if (!role.includes(p.role)) r.check(`tap ${p.id} shows its kit role`, false, role);
  }
  r.check("every part shows its kit role", true);
  await r.shot("apart-exploded");
  await r.page.click("[data-next]");

  await r.stage("jobs");
  for (let i = 0; i < lesson.prompts.length; i++) {
    const asked = ((await r.page.textContent("[data-prompt]")) ?? "").trim();
    const answer = kit.parts.find((p) => p.role === asked);
    if (!answer) return r.check(`prompt ${i + 1} is a kit role`, false, asked);
    const wrong = kit.parts.find((p) => p.id !== answer.id);
    if (wrong) {
      await r.page.click(`[data-part="${wrong.id}"]`);
      if ((await r.page.locator("[data-note][data-found]").count()) !== 0) r.check(`prompt ${i + 1} rejects ${wrong.id}`, false);
    }
    await r.page.click(`[data-part="${answer.id}"]`);
    if ((await r.page.locator("[data-note][data-found]").count()) !== 1) r.check(`prompt ${i + 1} accepts ${answer.id}`, false);
    if (i === 0) await r.shot("jobs");
    await r.page.click("[data-next]");
  }
  r.check(`${lesson.prompts.length} jobs named from kit roles`, true);

  await r.stage("final");
  await r.shot("final-exploded");
  await r.page.click("[data-assemble]");
  await r.page.waitForSelector('[data-stage="final"] [data-earned]', { timeout: 10_000 });
  r.check("pieced together", true);
  await r.shot("final-earned");
}

const wanted = process.argv.slice(2);
const runs = wanted.length > 0 ? wanted : [...Object.keys(LESSONS), ...Object.keys(KITS).map((id) => `inspect-${id}`)];
// No file watcher: an edit to any source mid-run would hot-update main.tsx and reload the page, dropping the
// lesson mid-play. Inline config cannot set watch to null (mergeConfig skips nulls), so the project config is
// spread in here instead of loaded from its file.
const server = await createServer({
  ...viteConfig,
  configFile: false,
  root,
  logLevel: "warn",
  server: { ...viteConfig.server, port: 0, host: "127.0.0.1", forwardConsole: false, watch: null },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL");
  browser = await chromium.launch({
    executablePath: findChromium(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  mkdirSync(outDir, { recursive: true });
  for (const name of runs) {
    for (const f of readdirSync(outDir)) if (f.startsWith(`${name}-`)) rmSync(join(outDir, f));
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const r = new Run(name, page);
    page.on("pageerror", (e) => r.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") r.errors.push(m.text());
    });
    const started = Date.now();
    try {
      const lesson = LESSONS[name];
      if (lesson) await playWorkshop(r, lesson, url);
      else if (name.startsWith("inspect-")) await playInspect(r, name.slice("inspect-".length), url);
      else throw new Error(`unknown run ${name}: use a lesson id (${Object.keys(LESSONS).join(", ")}) or inspect-<sample>`);
    } catch (error) {
      if (!rows.some((row) => row.run === name && !row.ok)) rows.push({ run: name, step: "aborted", ok: false, detail: error instanceof Error ? error.message.split("\n")[0]! : String(error) });
      await r.shot("aborted").catch(() => {});
    }
    rows.push({ run: name, step: "no console or page errors", ok: r.errors.length === 0, detail: r.errors.slice(0, 3).join(" | ") });
    rows.push({ run: name, step: `screenshots: ${r.shots}`, ok: true, detail: `${((Date.now() - started) / 1000).toFixed(0)} s` });
    await page.close();
  }
} catch (error) {
  console.error(error);
  rows.push({ run: "setup", step: "launch", ok: false, detail: String(error) });
} finally {
  await browser?.close();
  await server.close();
}

const width = (pick: (r: Row) => string) => Math.max(...rows.map((r) => pick(r).length));
const [wRun, wStep] = [width((r) => r.run), width((r) => r.step)];
for (const row of rows) console.log(`${row.ok ? "pass" : "FAIL"}  ${row.run.padEnd(wRun)}  ${row.step.padEnd(wStep)}  ${row.detail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed === 0 ? `\nAll ${rows.length} checks passed. Screenshots in ${outDir}` : `\n${failed} of ${rows.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
