// Plays every lesson through the real UI, driven only by the lesson data, and screenshots each stage.
// Usage: node prototypes/lesson/verify.ts [run ...]
//   run = a sample id (e.g. bottle) for the lesson that sample opens with (hand-written, name-matched,
//   generated or Inspect), generated-<sample> for the lesson generated from that sample's joints,
//   inspect-<sample> for the Inspect lesson derived from its kit, or templates to check every joint
//   template's rules on every fixture kit's geometry without a browser. With no runs: every sample's
//   own lesson, templates, and the generated and Inspect lessons each sample does not already open with. Screenshots go to out/lesson/<run>-<nn>-<stage>.png.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";
import viteConfig from "../../vite.config.ts";
import { type Kit, type Part, parseKit } from "../../shared/kit.ts";
import { lessonFor, LESSONS } from "./lessons/index.ts";
import { inspectLesson, JOINT_PRIMITIVE } from "./lessons/inspect.ts";
import { EVIDENCE, generatedLesson, JOINT_TEMPLATES } from "./templates/index.ts";
import { fixedValues, listOf, midWindow, tidyKit, type Module, passBand, passesAt, presentAfter, sliderSteps, type TestCtx, type Values, type Window, type Workshop } from "./model.ts";
import { restCentre } from "./pose.ts";
import { COLOR, SYNTHWAVE } from "../../src/primitives/parts.ts";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "out", "lesson");
const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const kitsDir = join(root, "fixtures", "kits");
const KITS: Record<string, Kit> = Object.fromEntries(
  readdirSync(kitsDir).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), tidyKit(parseKit(JSON.parse(readFileSync(join(kitsDir, f), "utf8"))))]),
);
const READY = 90_000;
const TEST_TIMEOUT = 30_000;
/** Long enough into a test that the object is mid-move (the flip has turned over and drops are falling). */
const MID_TEST_MS = 1300;
const FOCUS = [1, 3, 5].map((i) => parseInt(COLOR.focus.slice(i, i + 2), 16)).join(",");
const SHADOW = new Set(SYNTHWAVE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")));
/** The object, or the reach of its tests, fills this share of the viewer's width or height. */
const FILL_LO = 0.75;
const FILL_HI = 0.9;
/** Device pixels of a pink part's shading that count as the piece being in sight. */
const PINK_SEEN = 200;
/** Long enough for an explode tween and the camera's ease to settle. */
const SETTLE_MS = 1000;

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

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG, which is what Chromium's screenshots are. */
function decodePng(png: Buffer): { width: number; height: number; px: (x: number, y: number) => [number, number, number] } {
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const data: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("only 8-bit non-interlaced PNGs");
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`PNG colour type ${body[9]}`);
    }
    if (type === "IDAT") data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? out[y * stride + i - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels]! : 0;
      const paeth = () => {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      out[y * stride + i] = (x + [0, a, b, (a + b) >> 1, paeth()][filter]!) & 255;
    }
  }
  return { width, height, px: (x, y) => [out[y * stride + x * channels]!, out[y * stride + x * channels + 1]!, out[y * stride + x * channels + 2]!] };
}

type Query = "" | "?inspect" | "?generated";
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
    const viewers = await this.page.locator(`[data-stage="${stage}"] [data-kit-viewer]`).count();
    if (viewers) await this.page.waitForSelector(`[data-stage="${stage}"] [data-kit-viewer][data-ready]`, { timeout: READY });
    await this.page.waitForTimeout(300);
    const explode = await this.page.locator(`[data-stage="${stage}"] [data-explode]`).count();
    const drawn = await this.page.locator("img, svg").count();
    // Learn shows a primitive, not the object, so only it may go without Explode.
    this.check(`${stage}: object in the 3D viewer${stage === "learn" ? "" : " with Explode"}, no <img> or <svg>`, viewers === 1 && (stage === "learn" || explode === 1) && drawn === 0, `${viewers} viewers, ${explode} explode, ${drawn} img/svg`);
  }

  async open(sample: string, query: Query, url: string) {
    await this.page.goto(`${url}prototypes/lesson/${query}`, { waitUntil: "networkidle" });
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

  /**
   * How much of the viewer the drawn object fills, as the larger of its width and height shares. The
   * shadow is dithered in exactly the synthwave stops, so those pixels and near-white ones are skipped;
   * a part's own shading never lands exactly on a stop except the brightest pink.
   */
  async fill(stage: string): Promise<{ fill: number; pink: number; flat: number }> {
    const viewer = this.page.locator(`[data-stage="${stage}"] .viewer`).first();
    await this.page.addStyleTag({ content: ".viewer .live, .viewer .drag { visibility: hidden !important; } .viewer, .viewer::after { box-shadow: none !important; }" }).then((h) => h.evaluate((el) => (el as Element).setAttribute("data-measure", "")));
    const img = decodePng(await viewer.screenshot());
    await this.page.evaluate(() => document.querySelectorAll("[data-measure]").forEach((el) => el.remove()));
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    let pink = 0;
    let flat = 0;
    const inset = 6;
    const edge = (x: number, y: number) => x < 2 || y < 2 || x >= img.width - 2 || y >= img.height - 2;
    // A flat, evenly lit pink face (a lens seen head on) is drawn only in the brightest stop and grey,
    // and the shadow uses that stop too. The shadow dithers it with its other stops and white, so a
    // pixel of that stop with no other stop and no white within two pixels counts as flat pink. Seen
    // through a clear part the shadow can pass that test, so flat pink only ever proves a piece is shown.
    const NEAR = [-2, -1, 0, 1, 2];
    const shadowy = (x: number, y: number) => {
      const [r, g, b] = img.px(x, y);
      const key = `${r},${g},${b}`;
      return (key !== FOCUS && SHADOW.has(key)) || (Math.max(r, g, b) - Math.min(r, g, b) <= 10 && r > 235);
    };
    const flatFocus = (x: number, y: number) => img.px(x, y).join(",") === FOCUS && NEAR.every((dy) => NEAR.every((dx) => !shadowy(x + dx, y + dy)));
    for (let y = inset; y < img.height - inset; y++)
      for (let x = inset; x < img.width - inset; x++) {
        const [r, g, b] = img.px(x, y);
        if (!edge(x, y) && flatFocus(x, y)) flat += 1;
        if ((Math.max(r, g, b) - Math.min(r, g, b) <= 10 && r > 235) || SHADOW.has(`${r},${g},${b}`)) continue;
        if (r > g + 60 && r > b + 20) pink += 1;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
    const fill = x1 < x0 ? 0 : Math.max((x1 - x0 + 1) / (img.width - 2 * inset), (y1 - y0 + 1) / (img.height - 2 * inset));
    return { fill, pink, flat };
  }

  /** Checks the object fills a sensible share of the viewer, within `lo`..`hi`. */
  async framed(stage: string, label: string, pinkShown?: boolean) {
    const { fill: f, pink, flat } = await this.fill(stage);
    rows.push({ run: this.name, step: `${label} fills ${Math.round(f * 100)}% of the viewer`, ok: f >= FILL_LO && f <= FILL_HI, detail: `want ${Math.round(FILL_LO * 100)} to ${Math.round(FILL_HI * 100)}%` });
    if (pinkShown !== undefined) rows.push({ run: this.name, step: `${label} ${pinkShown ? "shows" : "has no"} pink piece`, ok: pinkShown ? pink + flat >= PINK_SEEN : pink < PINK_SEEN, detail: `${pink} shaded and ${flat} flat pink pixels` });
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
      const at = JSON.stringify(Object.fromEntries(lesson.modules.slice(0, i).map((q) => [q.fault.key, values[q.fault.key]])));
      if (!band) {
        problems.push(`nothing passes at ${at}`);
        continue;
      }
      if (passing.length !== steps.filter((v) => inWindow(v, band)).length) problems.push(`the passing values have a gap at ${at}`);
      if (near(band[0], slider.min) || near(band[1], slider.max)) problems.push(`band ${band.join("..")} reaches the end of the slider at ${at}`);
      const lines = (v: number) => m.tests.map((t) => t.run({ ...values, [m.fault.key]: v }, ctx).verdict).filter((x) => !x.pass).map((x) => x.line.replace(/[\d.]+/g, "#"));
      const low = lines(slider.min);
      const high = lines(slider.max);
      if (low.some((l) => high.includes(l))) problems.push(`the same failure on both sides at ${at}: ${low.join(" / ")}`);
      next.push(...passing.map((v) => ({ ...values, [m.fault.key]: v })));
    }
    const mid = fixedValues(lesson);
    const declared = passBand(m, mid, ctx);
    if (!declared || !near(declared[0], m.fix.window[0]) || !near(declared[1], m.fix.window[1]))
      problems.push(`declared window ${m.fix.window.join("..")} but ${declared?.join("..") ?? "nothing"} passes at the middle tuning`);
    r.check(`m${i + 1} rules: ${m.fault.key} fails below and above its window, at ${reachable.length} reachable tunings`, problems.length === 0, problems.slice(0, 3).join("; "));
    reachable = next;
  }
  const ctx = ctxAt(lesson.modules.length - 1);
  const failing = reachable.filter((values) => !lesson.final.tests.every((t) => t.run(values, ctx).verdict.pass));
  r.check(`rules: every reachable tuning (${reachable.length}) passes the final tests`, failing.length === 0, JSON.stringify(failing[0] ?? {}));
}

async function playWorkshop(r: Run, lesson: Workshop, sample: string, query: Query, url: string) {
  const kit = KITS[sample];
  if (!kit) throw new Error(`no fixture kit for ${sample}`);
  checkRules(r, lesson, kit);
  await r.open(sample, query, url);
  for (const [i, m] of lesson.modules.entries()) {
    const tag = `m${i + 1}`;
    await r.stage("learn");
    const tabs = await r.page.locator("[data-tab]").count();
    r.check(`${tag} learn teaches ${m.teach.map((p) => p.id).join("+")}`, m.teach.length === 1 ? tabs === 0 : tabs === m.teach.length, `${tabs} tabs`);
    await r.shot(`${tag}-learn`);
    await r.page.click("[data-next]");

    await r.stage("assemble");
    await r.framed("assemble", `${tag} assemble`);
    await r.shot(`${tag}-assemble`);
    await r.page.click("[data-fit]");
    await r.page.waitForSelector('[data-stage="assemble"] [data-next]', { timeout: 10_000 });
    await r.page.waitForTimeout(SETTLE_MS);
    await r.framed("assemble", `${tag} built`, true);
    await r.shot(`${tag}-built`);
    r.check(`${tag} fit it`, true);
    await r.page.click("[data-next]");

    await r.stage("sandbox");
    await r.framed("sandbox", `${tag} sandbox`, false);
    const testIds = m.tests.map((t) => t.id);
    const before = await r.runTests(testIds, `${tag}-fault`);
    const failing = testIds.filter((id) => before[id] === "fail");
    r.check(`${tag} tests fail at the fault`, failing.length > 0 && (await r.page.locator('[data-stage="sandbox"]').count()) === 1, JSON.stringify(before));
    const auto = await r.page.locator("[data-hint]").count();
    r.check(`${tag} each failed run reveals a hint`, auto === Math.min(failing.length, 3), `${auto} hints after ${failing.length} failures`);
    for (let i = auto; i < 3; i++) await r.page.click("[data-next-hint]");
    r.check(`${tag} Next hint reads ahead to hint 3 after ${failing.length} failures`, (await r.page.locator('[data-hint="3"] .side').count()) === 2 && (await r.page.locator("[data-next-hint]").count()) === 0);

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
    const note = r.page.locator("[data-fix] [data-game-note]");
    const closed = (await note.getAttribute("open")) === null && !(await note.locator(".note").isVisible());
    await note.locator("summary").click();
    const shown = (await note.getAttribute("open")) !== null && (await note.locator(".note").isVisible()) && (await note.locator(".note").textContent()) === m.gameNote;
    r.check(`${tag} game numbers start closed and open to the module's note`, closed && shown);
    await note.locator("summary").click();

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
    await r.page.waitForTimeout(SETTLE_MS);
    await r.framed("earned", `${tag} earned`, true);
    await r.shot(`${tag}-earned`);
    await r.page.click("[data-next]");
  }

  await r.stage("final");
  await r.framed("final", "final exploded");
  await r.shot("final-exploded");
  await r.page.click("[data-assemble]");
  await r.page.waitForSelector("[data-assemble][disabled]", { timeout: 10_000 });
  const finalIds = lesson.final.tests.map((t) => t.id);
  const statuses = await r.runTests(finalIds, "final");
  await r.page.waitForSelector('[data-stage="final"] [data-earned]', { timeout: 5_000 });
  r.check("final tests pass and the object is earned", finalIds.every((id) => statuses[id] === "pass"), JSON.stringify(statuses));
  await r.shot("final-earned");
}

async function playInspect(r: Run, sample: string, query: Query, url: string) {
  const kit = KITS[sample];
  if (!kit) throw new Error(`no fixture kit ${sample}`);
  const lesson = inspectLesson(kit);
  await r.open(sample, query, url);
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
  await r.framed("apart", "apart");
  await r.shot("apart");
  await r.setRange("[data-explode] input", 1);
  await r.page.waitForTimeout(SETTLE_MS);
  await r.framed("apart", "apart exploded");
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
  await r.framed("final", "final exploded");
  await r.shot("final-exploded");
  await r.page.click("[data-assemble]");
  await r.page.waitForSelector('[data-stage="final"] [data-earned]', { timeout: 10_000 });
  await r.page.waitForTimeout(SETTLE_MS);
  await r.framed("final", "pieced together");
  r.check("pieced together", true);
  await r.shot("final-earned");
}

/**
 * Every template on every kit's geometry: each non-root part in turn gets the template's joint (or,
 * for an evidence rule, the joint and words that rule reads) and every other part a fixed joint and
 * plain words, and the one-module lesson that generates must keep the fix rules.
 */
function checkTemplates(r: Run) {
  for (const t of JOINT_TEMPLATES)
    r.check(`${t.primitive} template teaches what Inspect maps ${t.joints.join(" and ")} to`, t.joints.every((j) => JOINT_PRIMITIVE[j] === t.primitive));
  const plain = (p: Part, i: number): Part => ({ ...p, name: `Part ${i + 1}`, role: "Part of the object.", joint: p.parentId === null ? null : "molded" });
  type Variant = { label: string; make: (kit: Kit, child: Part) => Kit };
  const variants: Variant[] = [
    ...JOINT_TEMPLATES.map((t): Variant => ({ label: t.primitive, make: (kit, child) => ({ ...kit, summary: "", parts: kit.parts.map((p, i) => (p.id === child.id ? { ...plain(p, i), joint: t.joints[0]! } : plain(p, i))) }) })),
    ...EVIDENCE.map((e): Variant => ({
      label: `${e.template.primitive} by evidence (${e.id})`,
      make: (kit, child) => ({
        ...kit,
        summary: "",
        parts: kit.parts.map((p, i) =>
          p.id === child.id ? { ...plain(p, i), joint: e.joints === "any" ? "glue" : e.joints[0]!, ...(e.whose === "self" ? { name: e.id === "seal" ? "Rubber seal" : "Pivot" } : {}) }
          : e.whose === "pin" && p.id === child.parentId ? { ...plain(p, i), name: "Pivot pin" }
          : plain(p, i)),
      }),
    })),
  ];
  const start = rows.length;
  let lessons = 0;
  for (const [sample, kit] of Object.entries(KITS))
    for (const v of variants)
      for (const child of kit.parts.filter((p) => p.parentId !== null)) {
        const variant = v.make(kit, child);
        const each = new Run(`templates ${sample} ${v.label} ${child.id}`, r.page);
        try {
          const lesson = generatedLesson(variant, each.name);
          each.check("generates one module", lesson?.modules.length === 1, String(lesson?.modules.length));
          checkRules(each, lesson!, variant);
          lessons += 1;
        } catch (error) {
          if (!rows.slice(start).some((row) => row.run === each.name && !row.ok)) rows.push({ run: each.name, step: "aborted", ok: false, detail: String(error).split("\n")[0]! });
        }
      }
  const checked = rows.splice(start);
  rows.push(...checked.filter((row) => !row.ok));
  r.check(`every template keeps the fix rules on every kit's parts (${lessons} lessons, ${checked.length} checks)`, checked.every((row) => row.ok));
}

const SAMPLE_IDS = Object.keys(KITS);
const opensWith = (id: string) => {
  const lesson = lessonFor(KITS[id]!, id);
  return lesson.kind === "inspect" ? "inspect" : LESSONS[id] === lesson ? "written" : "generated";
};
const wanted = process.argv.slice(2);
const runs = wanted.length > 0 ? wanted : [
  ...SAMPLE_IDS,
  "templates",
  ...SAMPLE_IDS.filter((id) => opensWith(id) !== "generated" && generatedLesson(KITS[id]!) !== null).map((id) => `generated-${id}`),
  ...SAMPLE_IDS.filter((id) => opensWith(id) !== "inspect").map((id) => `inspect-${id}`),
];
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
      const own = KITS[name] ? lessonFor(KITS[name], name) : undefined;
      const generated = name.startsWith("generated-") ? KITS[name.slice("generated-".length)] : undefined;
      if (own) await (own.kind === "workshop" ? playWorkshop(r, own, name, "", url) : playInspect(r, name, "", url));
      else if (name === "templates") checkTemplates(r);
      else if (generated) {
        const made = generatedLesson(generated, name);
        if (!made) throw new Error(`${name}: no joint in this kit moves, so it has no generated lesson`);
        await playWorkshop(r, made, name.slice("generated-".length), "?generated", url);
      } else if (name.startsWith("inspect-")) await playInspect(r, name.slice("inspect-".length), "?inspect", url);
      else throw new Error(`unknown run ${name}: use a sample id (${SAMPLE_IDS.join(", ")}), generated-<sample>, inspect-<sample> or templates`);
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
