// Plays every lesson through the real UI, driven only by the lesson data, and screenshots each stage.
// Usage: node prototypes/lesson/verify.ts [run ...]
//   run = a sample id (e.g. bottle) for the lesson that sample opens with (hand-written, name-matched,
//   generated or Inspect), generated-<sample> for the lesson generated from that sample's joints,
//   inspect-<sample> for the Inspect lesson derived from its kit, story-<sample> for the story generated
//   from its kit, templates to check every joint template's rules on every fixture kit's geometry
//   without a browser, or stories to generate a story from every fixture kit and check its rules. With no runs: every sample's
//   own lesson, templates, and the generated and Inspect lessons each sample does not already open with. Screenshots go to out/lesson/<run>-<nn>-<stage>.png.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { chromium, type Page } from "playwright-core";
import { Euler, Vector3 } from "three";
import { createServer } from "vite";
import viteConfig from "../../vite.config.ts";
import { type Kit, type Part, parseKit } from "../../shared/kit.ts";
import { lessonFor, LESSONS } from "./lessons/index.ts";
import { inspectLesson, JOINT_PRIMITIVE } from "./lessons/inspect.ts";
import { EVIDENCE, generatedLesson, JOINT_TEMPLATES, standOf } from "./templates/index.ts";
import { generatedStory } from "./stories/index.ts";
import { aim, idsOf, resting, sharesOf, SPRING, springsAt, type Springs, step } from "./explode.ts";
import { bindStory, familyOf, faultValues, fixedValues, midWindow, tidyKit, type Module, passBand, passesAt, presentAfter, type Run as TestRun, type Shares, sliderSteps, type Story, type TestCtx, type Values, type Window, type Workshop, zoneAt } from "./model.ts";
import { corners, drawObject, extents, restCentre } from "./pose.ts";
import { COLOR, SYNTHWAVE } from "./primitives/parts.ts";

/** Steps along a lesson control's track (TRACK in controls.tsx, which node cannot import). */
const TRACK = 1000;

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
/** A second look at a story's failing run, once the drops have fallen and the cap has landed. */
const LATER_MS = 900;
const FOCUS = [1, 3, 5].map((i) => parseInt(COLOR.focus.slice(i, i + 2), 16)).join(",");
const SHADOW = new Set(SYNTHWAVE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")));
/** The object, or the reach of its tests, fills this share of the viewer's width or height. */
const FILL_LO = 0.75;
/**
 * Story lessons frame the object together and fully apart at once, so the camera and its shadow hold
 * still while Explode moves; the assembled object then fills a little less of the viewer.
 */
const HELD_FILL_LO = 0.65;
const FILL_HI = 0.9;
/** Device pixels of a pink part's shading that count as the piece being in sight. */
const PINK_SEEN = 200;
/** Pink parts at least this share of the object's size must show PINK_SEEN pixels. */
const PINK_SHARE = 0.15;
/** The earned parts' largest size over the whole object's. */
const shareOf = (kit: Kit, ids: readonly string[]) => {
  const span = (parts: readonly Part[]) => {
    const { min, max } = extents(parts);
    return Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  };
  return span(kit.parts.filter((p) => ids.includes(p.id))) / span(kit.parts);
};
/** Long enough for an explode tween and the camera's ease to settle. */
const SETTLE_MS = 1000;
/** Every screen fits one phone screen at the main size and the small one, and still reflows at 320 wide. */
const SCREENS = [{ width: 390, height: 844 }, { width: 375, height: 667 }] as const;
const NARROW = { width: 320, height: 640 };

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

type Query = "" | "?inspect" | "?generated" | "?story";
type Row = { run: string; step: string; ok: boolean; detail: string };
const rows: Row[] = [];

class Run {
  shots = 0;
  fillLo = FILL_LO;
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

  /**
   * The screen as it stands fits the viewport without scrolling, and its pinned action sits wholly in
   * view, at each size in SCREENS; at 320 wide nothing runs off the side. The page returns to the
   * main size afterwards.
   */
  async fits(label: string) {
    const measure = () => this.page.evaluate(() => {
      const el = document.scrollingElement!;
      const bar = document.querySelector("[data-actions]")?.getBoundingClientRect();
      return { tall: el.scrollHeight, wide: el.scrollWidth, h: innerHeight, w: innerWidth, bar: bar ? bar.top >= 0 && bar.bottom <= innerHeight + 0.5 && bar.height > 0 : null };
    });
    const problems: string[] = [];
    for (const size of [...SCREENS, NARROW]) {
      await this.page.setViewportSize(size);
      await this.page.waitForTimeout(120);
      const m = await measure();
      const at = `${size.width}×${size.height}`;
      if (m.wide > m.w) problems.push(`${at} scrolls sideways (${m.wide} wide)`);
      if (size !== NARROW && m.tall > m.h) problems.push(`${at} scrolls (${m.tall} tall)`);
      if (size !== NARROW && m.bar === false) problems.push(`${at} action bar out of view`);
    }
    await this.page.setViewportSize(SCREENS[0]);
    // The camera eases to the restored size; let it land before anything measures the viewer.
    await this.page.waitForTimeout(SETTLE_MS);
    this.check(`${label}: one screen, no scroll, action in view`, problems.length === 0, problems.join("; "));
  }

  async stage(stage: string) {
    await this.page.waitForSelector(`[data-stage="${stage}"]`, { timeout: READY });
    const viewers = await this.page.locator(`[data-stage="${stage}"] .viewer [data-kit-viewer]`).count();
    if (viewers) await this.page.waitForSelector(`[data-stage="${stage}"] .viewer [data-kit-viewer][data-ready]`, { timeout: READY });
    await this.page.waitForTimeout(300);
    const explode = await this.page.locator(`[data-stage="${stage}"] [data-explode]`).count();
    const drawn = await this.page.locator("img, svg").count();
    // Learn shows a primitive, not the object, so only it may go without Explode.
    this.check(`${stage}: object in the 3D viewer${stage === "learn" ? "" : " with Explode"}, no <img> or <svg>`, viewers === 1 && (stage === "learn" || explode === 1) && drawn === 0, `${viewers} viewers, ${explode} explode, ${drawn} img/svg`);
    await this.fits(stage);
  }

  /** Opens the Why sheet, runs `inside`, and closes it again. */
  async inSheet(inside: () => Promise<void>) {
    await this.page.click("[data-why]");
    await this.page.waitForSelector("[data-sheet][open]");
    await inside();
    // A tap anywhere off the card shuts it.
    await this.page.mouse.click(4, 4);
    await this.page.waitForSelector("[data-sheet][open]", { state: "detached", timeout: 2000 }).catch(() => undefined);
    this.check("a tap off the Why card closes it", (await this.page.locator("[data-sheet][open]").count()) === 0);
  }

  async open(sample: string, query: Query, url: string, plain = false) {
    await this.page.goto(`${url}prototypes/lesson/${query}`, { waitUntil: "networkidle" });
    await this.page.waitForSelector(`[data-sample="${sample}"] canvas[data-ready]`, { timeout: READY });
    await this.fits("home");
    await this.shot("home");
    await this.page.click(`[data-sample="${sample}"]`);
    await this.page.waitForSelector("[data-start]:not([disabled])", { timeout: 20_000 });
    await this.fits("scan");
    const listed = await this.page.locator(".parts li").count();
    this.check("scan lists every kit part", listed === KITS[sample]!.parts.length, `${listed} of ${KITS[sample]!.parts.length}`);
    if (plain) await this.noDigits("scan");
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
    await this.page.addStyleTag({ content: ".viewer .live, .viewer .drag, .viewer .play { visibility: hidden !important; } .viewer, .viewer::after { box-shadow: none !important; }" }).then((h) => h.evaluate((el) => (el as Element).setAttribute("data-measure", "")));
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

  /**
   * Checks the object fills a sensible share of the viewer, within `lo`..`hi`. `share` is the pink
   * parts' size over the object's: a part much smaller than the object (a 6 mm rivet on 120 mm
   * scissors) cannot cover PINK_SEEN pixels, so the bar scales with its area below PINK_SHARE.
   */
  async framed(stage: string, label: string, pinkShown?: boolean, share = 1) {
    const { fill: f, pink, flat } = await this.fill(stage);
    const seen = Math.round(PINK_SEEN * Math.min(1, share / PINK_SHARE) ** 2);
    rows.push({ run: this.name, step: `${label} fills ${Math.round(f * 100)}% of the viewer`, ok: f >= this.fillLo && f <= FILL_HI, detail: `want ${Math.round(this.fillLo * 100)} to ${Math.round(FILL_HI * 100)}%` });
    if (pinkShown !== undefined) rows.push({ run: this.name, step: `${label} ${pinkShown ? "shows" : "has no"} pink piece`, ok: pinkShown ? pink + flat >= seen : pink < PINK_SEEN, detail: `${pink} shaded and ${flat} flat pink pixels, want ${pinkShown ? `${seen} or more` : `under ${PINK_SEEN}`}` });
  }

  /**
   * Drags Explode through several values, shooting the bottom of the viewer (the body's base and its
   * shadow, which an explode never moves) mid-spring and settled: every shot must match the first,
   * so the shadow never shifts or shimmers. Leaves Explode at 0.
   */
  async shadowHolds(stage: string) {
    const box = (await this.page.locator(`[data-stage="${stage}"] .viewer`).boundingBox())!;
    const clip = { x: box.x + 2, y: box.y + box.height * 0.78, width: box.width - 4, height: box.height * 0.2 };
    const base = await this.page.screenshot({ clip });
    let changed = 0;
    for (const v of [0.3, 0.8, 0.1, 1, 0]) {
      await this.setRange(`[data-stage="${stage}"] [data-explode] input`, v * TRACK);
      for (const wait of [60, 180]) {
        await this.page.waitForTimeout(wait);
        if (!(await this.page.screenshot({ clip })).equals(base)) changed++;
      }
    }
    await this.page.waitForTimeout(SETTLE_MS);
    this.check(`${stage}: the shadow holds still while Explode moves`, changed === 0, `${changed} of 10 shots differ`);
  }

  async setRange(selector: string, value: number) {
    await this.page.locator(selector).evaluate((el, v) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }

  /**
   * On the fault primitive's Learn tab, the object's own numbers sit under the figure and follow its
   * slider, matching the module's numbers at that value; the primitive's own readouts are hidden when the
   * module says they would contradict them.
   */
  async learnNumbers(tag: string, m: Module, tuning: Values) {
    if (m.teach.length > 1) await this.page.click(`[data-tab="${m.fault.primitive.id}"]`);
    const shown = () => this.page.locator('[data-stage="learn"] [data-own] [data-number]').evaluateAll((els) => els.map((e) => [...e.children].map((c) => c.textContent).join(": ")));
    const want = (v: number) => m.numbers({ ...tuning, [m.fault.key]: v }).map((x) => `${x.label}: ${x.value}`);
    const input = `[data-stage="learn"] input[data-slider="${m.fault.slider.id}"]`;
    const at = Number(await this.page.locator(input).inputValue());
    const first = await shown();
    const mid = midWindow(m.fault.slider, m.fix.window);
    await this.setRange(input, mid);
    await this.page.waitForTimeout(100);
    const moved = await shown();
    const generic = await this.page.locator('[data-stage="learn"] [data-generic]').count();
    this.check(
      `${tag} learn shows the ${m.fault.primitive.id}'s numbers in the object at ${at} and ${mid}${m.hideLearnReadouts ? ", not the primitive's own" : ""}`,
      at === m.fault.slider.initial && JSON.stringify(first) === JSON.stringify(want(at)) && JSON.stringify(moved) === JSON.stringify(want(mid)) && generic === (m.hideLearnReadouts ? 0 : 1),
      `${JSON.stringify(first)} | ${JSON.stringify(moved)} | ${generic} generic`,
    );
    await this.shot(`${tag}-learn-numbers`);
  }

  /** No digit anywhere in the text a person can see right now, an open sheet and the viewer's live line included. */
  async noDigits(label: string) {
    const lines = await this.page.evaluate(() => document.body.innerText.split("\n").filter((l) => /\d/.test(l)));
    this.check(`${label}: no numbers on screen`, lines.length === 0, lines.slice(0, 3).join(" | "));
  }

  /** Drags a grip sideways by `px` with the mouse, the way a thumb would. */
  async drag(selector: string, px: number) {
    const box = await this.page.locator(selector).boundingBox();
    if (!box) throw new Error(`no ${selector} on screen`);
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await this.page.mouse.move(x - px / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + px / 2, y, { steps: 5 });
    await this.page.mouse.up();
  }

  async centreOf(selector: string) {
    const b = await this.page.locator(selector).boundingBox();
    if (!b) throw new Error(`no ${selector} on screen`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /**
   * Plays a drag Build step with the mouse: a drop far away springs the piece home, holding it never
   * turns the view, a turned view still aims true (`turn`), and a drop on the lit ghost lands it.
   */
  async dragBuild(tag: string, turn: boolean) {
    const piece = '[data-stage="assemble"] [data-piece]';
    const ghost = '[data-stage="assemble"] [data-ghost]';
    const said = async () => ((await this.page.textContent("h1.do")) ?? "").trim();
    const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const { mouse } = this.page;
    this.check(`${tag} build has no pick-up or drop-on cards`, (await this.page.locator('[data-stage="assemble"] [data-step]').count()) === 0);
    await this.page.waitForTimeout(300);
    const home = await this.centreOf(piece);
    await this.shot(`${tag}-build-rest`);

    const viewer = (await this.page.locator('[data-stage="assemble"] .viewer').boundingBox())!;
    const spot = await this.centreOf(ghost);
    await mouse.move(home.x, home.y);
    await mouse.down();
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([s, t]) => ({ x: viewer.x + 40 + s! * (viewer.width - 80), y: viewer.y + 60 + t! * (viewer.height - 120) }));
    const wide = corners.reduce((a, b) => (apart(b, spot) > apart(a, spot) ? b : a));
    await mouse.move(wide.x, wide.y, { steps: 12 });
    const held = await this.centreOf(piece);
    const spotHeld = await this.centreOf(ghost);
    this.check(`${tag} the piece follows the mouse and the view holds still`, apart(held, wide) < 0.2 * apart(home, wide) && apart(spot, spotHeld) < 2, `piece ${apart(held, wide).toFixed(0)} px from the mouse; ghost moved ${apart(spot, spotHeld).toFixed(1)} px`);
    await mouse.up();
    const missed = await said();
    await this.page.waitForTimeout(1000);
    const back = await this.centreOf(piece);
    this.check(`${tag} a drop far away springs the piece home`, missed.startsWith("Not there") && apart(back, home) < 4, `"${missed}", ${apart(back, home).toFixed(1)} px from home`);
    await this.noDigits(`${tag} build missed`);

    if (turn) {
      const at = { x: viewer.x + viewer.width * 0.15, y: viewer.y + viewer.height * 0.5 };
      await mouse.move(at.x, at.y);
      await mouse.down();
      await mouse.move(at.x + 60, at.y, { steps: 6 });
      // Still before lifting, so the view stops where it was dragged instead of flinging on.
      await this.page.waitForTimeout(200);
      await mouse.up();
      await this.page.waitForTimeout(300);
      const turned = await this.centreOf(piece);
      this.check(`${tag} dragging the view elsewhere still turns it`, apart(turned, back) > 10, `${apart(turned, back).toFixed(1)} px`);
      await this.shot(`${tag}-build-turned`);
    }

    // Built while exploded: the drop must put the object back together before the piece seats.
    await this.setRange('[data-stage="assemble"] [data-explode] input', TRACK);
    await this.page.waitForTimeout(SETTLE_MS);
    const from = await this.centreOf(piece);
    const to = await this.centreOf(ghost);
    await mouse.move(from.x, from.y);
    await mouse.down();
    await mouse.move(to.x + 6, to.y - 4, { steps: 16 });
    await this.page.waitForTimeout(150);
    this.check(`${tag} the ghost lights up with the piece over it`, (await this.page.locator(`${piece}[data-near]`).count()) === 1 && (await said()) === "Let go.", await said());
    await this.noDigits(`${tag} build near`);
    await this.shot(`${tag}-build-near`);
    await mouse.up();
    await this.page.waitForTimeout(400);
    await this.shot(`${tag}-build-landing`);
    const closing = Number(await this.page.inputValue('[data-stage="assemble"] [data-explode] input')) / TRACK;
    this.check(`${tag} dropping on an exploded object closes it up before the piece seats`, closing === 0, `explode ${closing} at 400 ms`);
    await this.page.waitForSelector('[data-stage="assemble"] [data-next]:not([disabled])', { timeout: 10_000 });
  }

  /** Moves the play grip a step at a time with the arrow keys (wheel or bar alike), one way, until it reads `word`. */
  async twistTo(word: string, dir: 1 | -1) {
    const grip = "[data-strip] .grip";
    for (let i = 0; i < 160; i++) {
      if ((await this.page.getAttribute(grip, "aria-valuetext")) === word) return this.check(`the grip reads ${word} after ${i} steps`, true);
      await this.page.focus(grip);
      await this.page.keyboard.press(dir > 0 ? "ArrowRight" : "ArrowLeft");
    }
    this.check(`the grip reaches ${word}`, false, (await this.page.getAttribute(grip, "aria-valuetext")) ?? "");
  }

  /** Where a control stands: a range's value, or a wheel's aria-valuenow. */
  async gripAt(selector: string) {
    return this.page.locator(selector).first().evaluate((el) => (el instanceof HTMLInputElement ? el.value : (el.getAttribute("aria-valuenow") ?? "")));
  }

  /** Runs each test, screenshotting it mid-move (and again `later` ms on), and returns the statuses. `plain` also checks no number shows mid-test. */
  async runTests(ids: readonly string[], label: string, plain = false, later = 0): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const id of ids) {
      await this.page.click(`[data-test="${id}"]`);
      await this.page.waitForTimeout(MID_TEST_MS);
      if (plain) await this.noDigits(`${label} ${id} mid-run`);
      await this.shot(`${label}-${id}`);
      if (later > 0 && (await this.page.locator(`[data-test="${id}"]:disabled`).count()) > 0) {
        await this.page.waitForTimeout(later);
        await this.shot(`${label}-${id}-later`);
      }
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
  const tuning: Record<string, number> = { ...faultValues(lesson) };
  for (const [i, m] of lesson.modules.entries()) {
    const tag = `m${i + 1}`;
    await r.stage("learn");
    const tabs = await r.page.locator("[data-tab]").count();
    r.check(`${tag} learn teaches ${m.teach.map((p) => p.id).join("+")}`, m.teach.length === 1 ? tabs === 0 : tabs === m.teach.length, `${tabs} tabs`);
    await r.shot(`${tag}-learn`);
    await r.learnNumbers(tag, m, tuning);
    await r.page.click("[data-next]");

    await r.stage("assemble");
    await r.framed("assemble", `${tag} assemble`);
    await r.shot(`${tag}-assemble`);
    await r.page.click('[data-step="piece"]');
    await r.page.click('[data-step="target"]');
    await r.page.waitForSelector('[data-stage="assemble"] [data-next]:not([disabled])', { timeout: 10_000 });
    await r.page.waitForTimeout(SETTLE_MS);
    await r.framed("assemble", `${tag} built`, true, shareOf(kit, m.produces));
    await r.shot(`${tag}-built`);
    await r.fits(`${tag} built`);
    await r.page.click("[data-next]");

    await r.stage("sandbox");
    await r.framed("sandbox", `${tag} sandbox`, false);
    const testIds = m.tests.map((t) => t.id);
    const before = await r.runTests(testIds, `${tag}-fault`);
    const failing = testIds.filter((id) => before[id] === "fail");
    r.check(`${tag} tests fail at the fault`, failing.length > 0 && (await r.page.locator('[data-stage="sandbox"]').count()) === 1, JSON.stringify(before));
    const auto = await r.page.locator("[data-hint]").count();
    r.check(`${tag} each failed run reveals a hint`, auto === Math.min(failing.length, 3), `${auto} hints after ${failing.length} failures`);
    await r.inSheet(async () => {
      for (let i = auto; i < 3; i++) await r.page.click("[data-next-hint]");
    });
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
    await r.fits(`${tag} diagnosed`);
    await r.shot(`${tag}-diagnosed`);
    const note = r.page.locator("[data-sheet] [data-game-note]");
    await r.inSheet(async () => {
      const closed = (await note.getAttribute("open")) === null && !(await note.locator(".note").isVisible());
      await note.locator("summary").click();
      const shown = (await note.getAttribute("open")) !== null && (await note.locator(".note").isVisible()) && (await note.locator(".note").textContent()) === m.gameNote;
      r.check(`${tag} game numbers in the Why sheet start closed and open to the module's note`, closed && shown);
      await r.shot(`${tag}-why`);
      await note.locator("summary").click();
    });

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
    r.check(`${tag} readouts in the Why sheet`, (await r.page.locator("[data-sheet] [data-readouts] [data-number]").count()) > 0);

    const mid = midWindow(m.fault.slider, m.fix.window);
    await r.setRange(`[data-fix] input[data-slider="${m.fault.slider.id}"]`, mid);
    tuning[m.fault.key] = mid;
    const after = await r.runTests(testIds, `${tag}-fixed`);
    await r.stage("earned");
    r.check(`${tag} ${m.fault.slider.id} = ${mid} passes every test`, testIds.every((id) => after[id] === "pass"), JSON.stringify(after));
    await r.page.waitForTimeout(SETTLE_MS);
    await r.framed("earned", `${tag} earned`, true, shareOf(kit, m.produces));
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
  await r.page.waitForSelector('[data-stage="final"] [data-next]:not([disabled])', { timeout: 5_000 });
  await r.fits("final earned");
  r.check("final tests pass and the object is earned", finalIds.every((id) => statuses[id] === "pass"), JSON.stringify(statuses));
  await r.shot("final-earned");
}

/**
 * A story lesson's rules, checked from the tests without a browser. Each module's opener fails
 * without its part. With the part, the control fails where it starts, and the values that pass every
 * test are exactly one zone of the control, so the word on the grip tells the truth. Where the grip
 * can go past that zone, the two sides fail differently. Every verdict and live line is words only,
 * and the final passes at the tuning the modules leave.
 */
/** The grip's words on one module's Make it work: where it starts, where it works, and past that (if it can go there). */
type Grip = { start: string; works: string; over: string | null };

function checkStory(r: Run, story: Story, kit: Kit): Grip[] {
  const grips: Grip[] = [];
  const ctxOf = (present: string[]): TestCtx => ({ kit, present, centre: restCentre(kit, present, story.rest({ kit, present })) });
  const STEPS = 200;
  const SAMPLES = 24;
  const numbered = new Set<string>();
  const words = (label: string, run: TestRun) => {
    if (/\d/.test(run.verdict.line)) numbered.add(`${label}: "${run.verdict.line}"`);
    for (let i = 0; i <= SAMPLES; i++) {
      const live = run.at((run.durationMs * i) / SAMPLES).live;
      if (/\d/.test(live)) numbered.add(`${label} live: "${live}"`);
    }
    return run;
  };
  let tuning: Values = {};
  for (const [i, m] of story.modules.entries()) {
    const tag = `m${i + 1}`;
    const opener = words(`${tag} without`, m.without.test.run({ ...tuning, ...m.without.values }, ctxOf([...presentAfter(story, kit, i - 1), ...m.without.adds])));
    r.check(`${tag} rules: without the ${m.produces.join(" and ")}, ${m.without.test.id} fails`, !opener.verdict.pass, opener.verdict.line);
    const ctx = ctxOf(presentAfter(story, kit, i));
    const c = m.play.control;
    const zones = c.zones(ctx);
    const values = Array.from({ length: STEPS + 1 }, (_, k) => (zones[zones.length - 1]!.until * k) / STEPS);
    const runs = (v: number) => m.play.tests.map((t) => words(`${tag} ${t.id}`, t.run({ ...tuning, [c.key]: v }, ctx)).verdict);
    const passing = values.filter((v) => runs(v).every((x) => x.pass));
    const truthful = zones.find((z) => passing.length > 0 && values.every((v) => passing.includes(v) === (zoneAt(zones, v).id === z.id)));
    const fromStart = runs(c.start).filter((x) => !x.pass).map((x) => x.line);
    r.check(`${tag} rules: fails at the start and passes exactly where the grip reads ${truthful?.word ?? "?"}`, fromStart.length > 0 && truthful !== undefined, `${passing.length} passing of ${values.length}`);
    const past = zones.indexOf(truthful!) < zones.length - 1;
    grips.push({ start: zoneAt(zones, c.start).word, works: truthful!.word, over: past ? zones[zones.length - 1]!.word : null });
    if (past) {
      const fromEnd = runs(zones[zones.length - 1]!.until).filter((x) => !x.pass).map((x) => x.line);
      r.check(`${tag} rules: too little and too much fail differently`, fromEnd.length > 0 && !fromEnd.some((l) => fromStart.includes(l)), `${fromStart.join(" / ")} | ${fromEnd.join(" / ")}`);
    }
    tuning = { ...tuning, [c.key]: passing[Math.floor(passing.length / 2)]! };
  }
  const all = ctxOf(kit.parts.map((p) => p.id));
  const final = story.final.tests.map((t) => words(`final ${t.id}`, t.run(tuning, all)).verdict);
  r.check(`rules: the final passes at the modules' tuning ${JSON.stringify(tuning)}`, final.every((v) => v.pass), final.map((v) => v.line).join(" / "));
  r.check("rules: every verdict and live line is words only", numbered.size === 0, [...numbered].slice(0, 3).join(" | "));
  return grips;
}

type Rz = { r: number; y: number };
/** A part's cut through the axis, in (distance from the axis, height): a closed outline, or an open one for a shell. */
type Section = { pts: Rz[]; closed: boolean };
/** Overlaps shallower than this, in mm, are parts resting on each other. */
const FLUSH = 0.05;

/** Whether a part still stands as it was drawn, turned only about the vertical (a turn past a right angle reads back as 180, θ, 180). */
const upright = (p: Part) => new Vector3(0, 1, 0).applyEuler(new Euler((p.rotation.x * Math.PI) / 180, (p.rotation.y * Math.PI) / 180, (p.rotation.z * Math.PI) / 180, "XYZ")).y > 1 - 1e-6;
/** Shortest distance from the axis to a closed outline in the floor plane, or 0 when the outline goes round it. */
function reachIn(foot: readonly { x: number; z: number }[]): number {
  let inside = false;
  let near = Infinity;
  foot.forEach((a, i) => {
    const b = foot[(i + 1) % foot.length]!;
    if (a.z > 0 !== b.z > 0 && 0 < a.x + ((b.x - a.x) * -a.z) / (b.z - a.z)) inside = !inside;
    const [dx, dz] = [b.x - a.x, b.z - a.z];
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.z * dz) / (dx * dx + dz * dz || 1)));
    near = Math.min(near, Math.hypot(a.x + t * dx, a.z + t * dz));
  });
  return inside ? 0 : near;
}

/**
 * A part's cut through the bottle's axis. An explode moves the bottle's assemblies only along the axis
 * and turns them about it, so two parts meet exactly where their cuts do. Round parts give their true
 * cut; anything else the band of distances and heights it sweeps as it turns, which can only be bigger.
 */
function sectionOf(p: Part): Section {
  const s = p.shape;
  if (s.kind === "lathe" && upright(p)) {
    const ys = s.profile.map((q) => q.y);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    const pts = s.profile.map((q) => ({ r: q.r, y: q.y - mid + p.position.y }));
    const [a, b] = [pts[0]!, pts[pts.length - 1]!];
    const shut = a.r === b.r && a.y === b.y;
    return { pts: shut ? pts.slice(0, -1) : pts, closed: shut || (a.r < 1e-6 && b.r < 1e-6) };
  }
  if (s.kind === "helix" && upright(p)) {
    const [r0, r1, y0, y1] = [s.radius - s.tube, s.radius + s.tube, p.position.y - s.length / 2, p.position.y + s.length / 2];
    return { pts: [{ r: r0, y: y0 }, { r: r1, y: y0 }, { r: r1, y: y1 }, { r: r0, y: y1 }], closed: true };
  }
  if (s.kind === "torus" && upright(p) && s.arcDegrees >= 360) {
    return { pts: Array.from({ length: 16 }, (_, i) => ({ r: s.radius + s.tube * Math.cos((i / 16) * 2 * Math.PI), y: p.position.y + s.tube * Math.sin((i / 16) * 2 * Math.PI) })), closed: true };
  }
  const pts = corners([p]);
  const ys = pts.map((q) => q.y);
  const plan = s.kind === "extrusion" || s.kind === "box" ? pts.slice(0, pts.length / 2).map((q) => ({ x: q.x, z: q.z })) : [];
  const flat = plan.length > 0 && new Set(pts.slice(0, pts.length / 2).map((q) => q.y.toFixed(3))).size === 1;
  const near = flat ? reachIn(plan) : Math.min(...pts.map((q) => Math.hypot(q.x, q.z)));
  const wraps = !flat && Math.min(...pts.map((q) => q.x)) < 0 && Math.max(...pts.map((q) => q.x)) > 0 && Math.min(...pts.map((q) => q.z)) < 0 && Math.max(...pts.map((q) => q.z)) > 0;
  const [r0, r1, y0, y1] = [wraps ? 0 : near, Math.max(...pts.map((q) => Math.hypot(q.x, q.z))), Math.min(...ys), Math.max(...ys)];
  return { pts: [{ r: r0, y: y0 }, { r: r1, y: y0 }, { r: r1, y: y1 }, { r: r0, y: y1 }], closed: true };
}

const edges = (s: Section) => s.pts.flatMap((a, i) => (i + 1 < s.pts.length ? [[a, s.pts[i + 1]!] as const] : s.closed ? [[a, s.pts[0]!] as const] : []));
/** How far `p` is from the line through `a` and `b`, signed by side. */
const side = (a: Rz, b: Rz, p: Rz) => ((b.r - a.r) * (p.y - a.y) - (b.y - a.y) * (p.r - a.r)) / (Math.hypot(b.r - a.r, b.y - a.y) || 1);
const nearEdge = (s: Section, p: Rz) =>
  Math.min(...edges(s).map(([a, b]) => {
    const [dr, dy] = [b.r - a.r, b.y - a.y];
    const t = Math.max(0, Math.min(1, ((p.r - a.r) * dr + (p.y - a.y) * dy) / (dr * dr + dy * dy || 1)));
    return Math.hypot(p.r - a.r - t * dr, p.y - a.y - t * dy);
  }));
const inside = (s: Section, p: Rz) => s.closed && edges(s).reduce((n, [a, b]) => (a.y > p.y !== b.y > p.y && p.r < a.r + ((b.r - a.r) * (p.y - a.y)) / (b.y - a.y) ? !n : n), false) && nearEdge(s, p) > FLUSH;

/** Whether two cuts pass into each other by more than FLUSH: their edges cross, or a corner of one sits inside the other. */
function interpenetrate(a: Section, b: Section): boolean {
  for (const [p, q] of edges(a))
    for (const [u, v] of edges(b)) if (side(u, v, p) * side(u, v, q) < 0 && Math.min(Math.abs(side(u, v, p)), Math.abs(side(u, v, q))) > FLUSH && side(p, q, u) * side(p, q, v) < 0 && Math.min(Math.abs(side(p, q, u)), Math.abs(side(p, q, v))) > FLUSH) return true;
  return a.pts.some((p) => inside(b, p)) || b.pts.some((p) => inside(a, p));
}

/**
 * The explode, sampled on the real springs: no assembly passes into another while opening, closing,
 * reversing just after the second spring starts or late, or in the prefix states (the earlier
 * assemblies out, one on its way, the rest home). Drawn at the lesson's rest, the cap seated.
 */
function checkExplode(r: Run, story: Story, kit: Kit) {
  const plan = story.explode;
  if (!plan) return;
  const present = kit.parts.map((p) => p.id);
  const scene = story.rest({ kit, present });
  const centre = restCentre(kit, present, scene);
  const owner = new Map(plan.order.flatMap((l) => familyOf(kit, l.id).map((id) => [id, l.id] as const)));
  const ids = idsOf(plan);
  // The cuts below are taken through the y axis, so they hold only for an object round about it whose
  // assemblies lift along it. Anything else is checked fully apart: no two assemblies' boxes meet.
  const main = kit.parts.find((p) => p.parentId === null)!;
  const alongAxis = main.shape.kind === "lathe" && upright(main) && plan.order.every((l) => {
    const o = l.at(1).offset ?? { x: 0, y: 0, z: 0 };
    return Math.abs(o.x) < 1e-6 && Math.abs(o.z) < 1e-6;
  });
  if (!alongAxis) {
    const apart = drawObject({ kit, present, scene, explode: Object.fromEntries(ids.map((id) => [id, 1])), plan, pink: new Set(), centre });
    const groups = [...new Set(present.map((id) => owner.get(id) ?? "body"))].map((id) => ({ id, box: extents(apart.filter((p) => (owner.get(p.id) ?? "body") === id)) }));
    const meet = groups.flatMap((a, i) => groups.slice(i + 1).filter((b) => (["x", "y", "z"] as const).every((k) => a.box.min[k] < b.box.max[k] - 0.5 && b.box.min[k] < a.box.max[k] - 0.5)).map((b) => `${a.id} and ${b.id}`));
    r.check(`explode: fully apart, no two assemblies' boxes meet (${groups.length} groups)`, meet.length === 0, meet.join(", "));
    return;
  }
  const frames: { label: string; shares: Shares }[] = [];
  const DT = 1000 / 60;
  const play = (label: string, from: number, to: number, reverseAt?: number) => {
    let s: Springs = aim(springsAt(ids, from), to);
    let turned = reverseAt === undefined;
    for (let i = 0; i < 400 && !(turned && resting(s)); i++) {
      if (!turned && s.ms >= reverseAt!) [s, turned] = [aim(s, from), true];
      s = step(s, DT);
      frames.push({ label: `${label} at ${Math.round(s.ms)} ms`, shares: sharesOf(s) });
    }
  };
  play("opening", 0, 1);
  play("closing", 1, 0);
  const reversals = [SPRING.staggerMs + 8, 300];
  for (const t of reversals) {
    play(`opened then reversed at ${t} ms,`, 0, 1, t);
    play(`closed then reversed at ${t} ms,`, 1, 0, t);
  }
  ids.forEach((id, k) => [0.25, 0.5, 0.75, 1].forEach((x) => frames.push({ label: `prefix ${id} at ${x}`, shares: Object.fromEntries(ids.map((other, j) => [other, j < k ? 1 : j === k ? x : 0])) })));
  // A scanned kit's parts can already overlap at rest (a seal sunk into its rim); only new overlaps count.
  const cutsAt = (shares: Shares) => drawObject({ kit, present, scene, explode: shares, plan, pink: new Set(), centre }).filter((p) => present.includes(p.id)).map((p) => ({ id: p.id, owner: owner.get(p.id) ?? "body", section: sectionOf(p) }));
  const home = cutsAt(Object.fromEntries(ids.map((id) => [id, 0])));
  const atRest = new Set(home.flatMap((a, i) => home.slice(i + 1).filter((b) => a.owner !== b.owner && interpenetrate(a.section, b.section)).map((b) => `${a.id}|${b.id}`)));
  const clashes: string[] = [];
  for (const f of frames) {
    const cut = cutsAt(f.shares);
    for (const [i, a] of cut.entries())
      for (const b of cut.slice(i + 1)) if (a.owner !== b.owner && !atRest.has(`${a.id}|${b.id}`) && interpenetrate(a.section, b.section)) clashes.push(`${f.label}: ${a.id} into ${b.id}`);
    if (clashes.length > 0) break;
  }
  r.check(`explode: no assembly passes into another in ${frames.length} replayed frames${atRest.size > 0 ? ` (${atRest.size} overlaps already at rest left out)` : ""} (opening, closing, ${reversals.length} reversals each way, prefix states)`, clashes.length === 0, clashes.slice(0, 3).join(" | "));
  const apart = drawObject({ kit, present, scene, explode: Object.fromEntries(ids.map((id) => [id, 1])), plan, pink: new Set(), centre }).filter((p) => present.includes(p.id));
  const boxOf = (id: string) => extents(apart.filter((p) => (owner.get(p.id) ?? "body") === id));
  const gaps = ids.map((id, k) => {
    const below = k + 1 < ids.length ? boxOf(ids[k + 1]!) : boxOf("body");
    return boxOf(id).min.y - below.max.y;
  });
  r.check(`explode: apart, each assembly clears the next one out, and the last clears the body (${gaps.map((g) => g.toFixed(0)).join(", ")} mm)`, gaps.every((g) => g > 5));
}

/** Plays a story lesson: each module's failure, Learn in words, Build, then twisting the cap by hand until it works. No number may show on any screen. */
async function playStory(r: Run, written: Story, sample: string, url: string, query: Query = "") {
  const scanned = KITS[sample];
  if (!scanned) throw new Error(`no fixture kit for ${sample}`);
  const { story, kit } = bindStory(written, scanned);
  const grips = checkStory(r, story, kit);
  checkExplode(r, story, kit);
  r.fillLo = HELD_FILL_LO;
  await r.open(sample, query, url, true);
  const said = async () => ((await r.page.textContent("h1.do")) ?? "").trim();
  for (const [i, m] of story.modules.entries()) {
    const tag = `m${i + 1}`;
    await r.stage("problem");
    await r.noDigits(`${tag} problem`);
    await r.framed("problem", `${tag} problem`, false);
    r.check(`${tag} opens on "${m.without.say}" with Next locked`, (await said()) === m.without.say && (await r.page.locator("[data-next]:disabled").count()) === 1);
    const opener = await r.runTests([m.without.test.id], `${tag}-without`, true, LATER_MS);
    r.check(`${tag} without the part, ${m.without.test.id} fails and says why`, opener[m.without.test.id] === "fail" && (await said()) === m.without.line, `${JSON.stringify(opener)} "${await said()}"`);
    await r.shot(`${tag}-problem`);
    await r.inSheet(async () => {
      await r.noDigits(`${tag} problem Why`);
      const text = await r.page.locator("[data-sheet][open] [data-why-text]").innerText();
      r.check(`${tag} problem Why says what breaks without it`, m.why.every((l) => text.includes(l)));
      await r.shot(`${tag}-problem-why`);
    });
    await r.page.click("[data-next]");

    await r.stage("learn");
    await r.noDigits(`${tag} learn`);
    // The figure moves only by the control under it (no drag handle on the figure): a wheel by its keys, a bar by its range.
    const row = '[data-stage="learn"] [data-rig] .grip';
    r.check(`${tag} learn: no drag handle on the figure`, (await r.page.locator('[data-stage="learn"] [data-handle]').count()) === 0);
    const before = await r.gripAt(row);
    if ((await r.page.locator(`${row}[role="slider"]`).count()) > 0) {
      await r.page.focus(row);
      for (let i = 0; i < 8; i++) await r.page.keyboard.press(Number(before) > 500 ? "ArrowLeft" : "ArrowRight");
    } else await r.setRange(row, Number(before) > 500 ? 100 : 900);
    await r.page.waitForTimeout(200);
    const after = await r.gripAt(row);
    r.check(`${tag} learn: "${(await r.page.textContent('[data-stage="learn"] [data-rig] .mono')) ?? ""}" moves the figure`, before !== after, `${before} → ${after}`);
    await r.noDigits(`${tag} learn after a drag`);
    await r.shot(`${tag}-learn`);
    await r.inSheet(async () => {
      await r.noDigits(`${tag} learn Why`);
      await r.shot(`${tag}-learn-why`);
    });
    await r.page.click("[data-next]");

    await r.stage("assemble");
    await r.noDigits(`${tag} build`);
    await r.framed("assemble", `${tag} assemble`);
    await r.dragBuild(tag, i === 0);
    await r.page.waitForTimeout(SETTLE_MS);
    await r.framed("assemble", `${tag} built`, true, shareOf(kit, m.produces));
    await r.noDigits(`${tag} built`);
    await r.shot(`${tag}-built`);
    await r.page.click("[data-next]");

    await r.stage("play");
    await r.noDigits(`${tag} play`);
    await r.framed("play", `${tag} play`, true, shareOf(kit, m.produces));
    if (i === 0) await r.shadowHolds("play");
    const ids = m.play.tests.map((t) => t.id);
    const zone = () => r.page.getAttribute("[data-strip] .grip", "aria-valuetext");
    const want = grips[i]!;
    r.check(`${tag} play starts ${want.start}`, (await zone()) === want.start, (await zone()) ?? "");
    const loose = await r.runTests(ids, `${tag}-start`, true, LATER_MS);
    const fails = ids.filter((id) => loose[id] === "fail").length;
    r.check(`${tag} at ${want.start} it fails`, fails > 0, JSON.stringify(loose));
    await r.inSheet(async () => {
      await r.noDigits(`${tag} Hint`);
      const hints = await r.page.locator("[data-sheet][open] [data-hint]").count();
      r.check(`${tag} each failed run reveals a hint`, hints === Math.min(fails, m.hints.length), `${hints} hints after ${fails} failures`);
      await r.shot(`${tag}-hint`);
    });
    const end = await r.gripAt("[data-strip] .grip");
    if (want.over) {
      await r.twistTo(want.over, 1);
      await r.page.focus("[data-strip] .grip");
      await r.page.keyboard.press("End");
      await r.shot(`${tag}-over`);
      const tight = await r.runTests(ids, `${tag}-over`, true, LATER_MS);
      r.check(`${tag} ${want.over} fails differently from ${want.start}`, ids.some((id) => tight[id] === "fail") && ids.some((id) => tight[id] !== loose[id]), `${JSON.stringify(loose)} | ${JSON.stringify(tight)} (grip ends at ${end})`);
      await r.twistTo(want.works, -1);
    } else await r.twistTo(want.works, 1);
    await r.shot(`${tag}-works`);
    const snug = await r.runTests(ids, `${tag}-works`, true);
    await r.stage("earned");
    r.check(`${tag} ${want.works} passes every test and says the part's job`, ids.every((id) => snug[id] === "pass") && (await said()) === m.job, `${JSON.stringify(snug)} "${await said()}"`);
    await r.page.waitForTimeout(SETTLE_MS);
    await r.framed("earned", `${tag} earned`, true, shareOf(kit, m.produces));
    await r.noDigits(`${tag} earned`);
    await r.inSheet(() => r.noDigits(`${tag} earned Why`));
    await r.shot(`${tag}-earned`);
    await r.page.click("[data-next]");
  }

  await r.stage("final");
  await r.noDigits("final");
  await r.framed("final", "final exploded");
  await r.shot("final-exploded");
  await r.page.click("[data-assemble]");
  await r.page.waitForSelector("[data-assemble][disabled]", { timeout: 10_000 });
  const ids = story.final.tests.map((t) => t.id);
  const statuses = await r.runTests(ids, "final", true);
  await r.page.waitForSelector('[data-stage="final"] [data-next]:not([disabled])', { timeout: 5_000 });
  const payoff = await r.page.locator("[data-payoff] li").count();
  r.check("final tests pass and each part's job is named", ids.every((id) => statuses[id] === "pass") && payoff === story.final.payoff.length, `${JSON.stringify(statuses)}, ${payoff} jobs`);
  await r.noDigits("final earned");
  await r.fits("final earned");
  await r.inSheet(() => r.noDigits("final Why"));
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
  await r.setRange("[data-explode] input", TRACK);
  await r.page.waitForTimeout(SETTLE_MS);
  await r.framed("apart", "apart exploded");
  for (const p of kit.parts) {
    await r.page.click(`[data-part="${p.id}"]`);
    const role = (await r.page.textContent(`[data-role="${p.id}"]`)) ?? "";
    if (!role.includes(p.role)) r.check(`tap ${p.id} shows its kit role`, false, role);
  }
  r.check("every part shows its kit role", true);
  await r.fits("apart, every part seen");
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
  await r.page.waitForSelector('[data-stage="final"] [data-next]:not([disabled])', { timeout: 10_000 });
  await r.fits("final earned");
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
  /** `declines`: the template may judge the part unfit (a clamp with nothing turning on it) and generate nothing. */
  type Variant = { label: string; primitive: string; declines: boolean; make: (kit: Kit, child: Part) => Kit };
  const variants: Variant[] = [
    ...JOINT_TEMPLATES.map((t): Variant => ({ label: t.primitive, primitive: t.primitive, declines: t.applies !== undefined, make: (kit, child) => ({ ...kit, summary: "", parts: kit.parts.map((p, i) => (p.id === child.id ? { ...plain(p, i), joint: t.joints[0]! } : plain(p, i))) }) })),
    ...EVIDENCE.map((e): Variant => ({
      label: `${e.template.primitive} by evidence (${e.id})`,
      primitive: e.template.primitive,
      declines: e.template.applies !== undefined,
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
  const made = new Map<string, number>();
  for (const [sample, kit] of Object.entries(KITS))
    for (const v of variants)
      for (const child of kit.parts.filter((p) => p.parentId !== null)) {
        const variant = v.make(kit, child);
        const each = new Run(`templates ${sample} ${v.label} ${child.id}`, r.page);
        try {
          const lesson = generatedLesson(variant, each.name);
          // A kit that stands also gets its stand module, so the two are checked together.
          const ids = lesson?.modules.map((m) => m.main.id) ?? [];
          if (v.declines && !ids.includes(v.primitive)) continue;
          made.set(v.label, (made.get(v.label) ?? 0) + 1);
          each.check(`generates the ${v.primitive} module`, ids.filter((id) => id !== "weight").length === 1 && ids.includes(v.primitive), ids.join("+"));
          checkRules(each, lesson!, variant);
          lessons += 1;
        } catch (error) {
          if (!rows.slice(start).some((row) => row.run === each.name && !row.ok)) rows.push({ run: each.name, step: "aborted", ok: false, detail: String(error).split("\n")[0]! });
        }
      }
  // The stand: every kit with plain words (geometry alone decides), then each part in turn named as its
  // base, then each part in turn named as a handle. When it stands, the one module must keep the rules.
  const stands: string[] = [];
  const standVariants = (kit: Kit): { label: string; kit: Kit }[] => {
    const bare = kit.parts.map(plain);
    return [
      { label: "plain", kit: { ...kit, summary: "", parts: bare } },
      ...kit.parts.map((p, i) => ({ label: `base ${p.id}`, kit: { ...kit, summary: "", parts: bare.map((q, j) => (j === i ? { ...q, name: "Base", role: "The flat base it stands on." } : q)) } })),
      ...kit.parts.map((p, i) => ({ label: `handle ${p.id}`, kit: { ...kit, summary: "", parts: bare.map((q, j) => (j === i ? { ...q, name: "Handle", role: "You lift it by this." } : q)) } })),
    ];
  };
  for (const [sample, kit] of Object.entries(KITS))
    for (const v of standVariants(kit)) {
      const each = new Run(`templates ${sample} stand ${v.label}`, r.page);
      if (!standOf(v.kit)) continue;
      try {
        const lesson = generatedLesson(v.kit, each.name);
        each.check("generates one module", lesson?.modules.length === 1 && lesson.modules[0]!.id === "stand", String(lesson?.modules.map((m) => m.id)));
        checkRules(each, lesson!, v.kit);
        stands.push(`${sample} ${v.label}`);
        lessons += 1;
      } catch (error) {
        if (!rows.slice(start).some((row) => row.run === each.name && !row.ok)) rows.push({ run: each.name, step: "aborted", ok: false, detail: String(error).split("\n")[0]! });
      }
    }
  const checked = rows.splice(start);
  rows.push(...checked.filter((row) => !row.ok));
  r.check(`every template keeps the fix rules on every kit's parts (${lessons} lessons, ${checked.length} checks)`, checked.every((row) => row.ok));
  const never = variants.filter((v) => !made.get(v.label)).map((v) => v.label);
  r.check(`every template generates on some kit's parts`, never.length === 0, never.join(", "));
  const plainStands = Object.keys(KITS).filter((id) => stands.includes(`${id} plain`));
  r.check(`the stand template reads upright roots from geometry alone (${plainStands.join(", ")}) and the stapler's rubber foot from its name`, plainStands.join() === "bottle,jar,mug" && standOf(KITS.stapler!)?.footing.part.id === "rubber-pad");
}

/**
 * A cheap guard for kits never seen: the story generated from every fixture kit, as scanned and with
 * its words and joints scrambled the ways a scan gets them wrong (digits in names, long names, every
 * joint the same), loads without a throw and keeps the story rules: no digit, short lines, each grip
 * word telling the truth.
 */
function checkStories(r: Run) {
  const start = rows.length;
  const odd = (kit: Kit): { label: string; kit: Kit }[] => [
    { label: "as scanned", kit },
    { label: "numbered names", kit: { ...kit, name: `${kit.name} 2000`, parts: kit.parts.map((p, i) => ({ ...p, name: `${p.name} ${i + 1}mm`, role: `${p.role} Fits a 12 mm hole.` })) } },
    { label: "long names", kit: { ...kit, name: "Very large heavy duty kitchen thing", parts: kit.parts.map((p) => ({ ...p, name: `Big round shiny ${p.name}` })) } },
    { label: "all press-fit", kit: { ...kit, parts: kit.parts.map((p) => ({ ...p, joint: p.parentId === null ? null : "press-fit" })) } },
    { label: "all thread", kit: { ...kit, parts: kit.parts.map((p) => ({ ...p, joint: p.parentId === null ? null : "thread" })) } },
  ];
  let made = 0;
  for (const [sample, kit] of Object.entries(KITS))
    for (const v of odd(kit)) {
      const each = new Run(`stories ${sample} ${v.label}`, r.page);
      try {
        const story = generatedStory(v.kit, each.name, true);
        if (!story) continue;
        made += 1;
        checkStory(each, story, v.kit);
      } catch (error) {
        if (!rows.slice(start).some((row) => row.run === each.name && !row.ok)) rows.push({ run: each.name, step: "aborted", ok: false, detail: String(error).split("\n").slice(0, 2).join(" ") });
      }
    }
  const checked = rows.splice(start);
  rows.push(...checked.filter((row) => !row.ok));
  r.check(`every generated story loads and keeps the story rules (${made} stories, ${checked.length} checks)`, checked.every((row) => row.ok));
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
  "stories",
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
      const storied = name.startsWith("story-") ? name.slice("story-".length) : undefined;
      if (own) await (own.kind === "workshop" ? playWorkshop(r, own, name, "", url) : own.kind === "story" ? playStory(r, own, name, url) : playInspect(r, name, "", url));
      else if (name === "templates") checkTemplates(r);
      else if (name === "stories") checkStories(r);
      else if (storied && KITS[storied]) {
        const made = generatedStory(KITS[storied], name, true);
        if (!made) throw new Error(`${name}: no story template applies to this kit`);
        await playStory(r, made, storied, url, "?story");
      }
      else if (generated) {
        const made = generatedLesson(generated, name);
        if (!made) throw new Error(`${name}: no joint in this kit moves, so it has no generated lesson`);
        await playWorkshop(r, made, name.slice("generated-".length), "?generated", url);
      } else if (name.startsWith("inspect-")) await playInspect(r, name.slice("inspect-".length), "?inspect", url);
      else throw new Error(`unknown run ${name}: use a sample id (${SAMPLE_IDS.join(", ")}), generated-<sample>, inspect-<sample>, story-<sample>, templates or stories`);
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
