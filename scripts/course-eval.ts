// Plays a generated course beside the hand-made one and reports where it falls short:
//   pnpm eval:course <name> [--gold pen] [--out out/eval/<stamp>] [--no-judge] [--only 0,5,6]
// <name> is fixtures/courses/<name>.json, played at ?course=<name>. "pen" is the hand-made lesson itself.
// Writes gold/ and cand/ screenshots, pairs/ (gold left, candidate right), sheet.png, report.json and report.md.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, Page } from "playwright-core";
import { type ViteDevServer, createServer } from "vite";
import { z } from "zod";
import { GenCourse } from "../shared/course/gen.ts";
import { streamStructured } from "../server/claude.ts";
import { launchChromium, root } from "./browser.ts";

const PORT = 5192;
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 520, height: 980 };
/** After a screen arrives: one frame while its test plays, one once it has ended. */
const EARLY_MS = 600;
const LATE_MS = 2600;
const MAX_SCREENS = 30;
/** Screens where the early frame matters: a test or an answer plays on arrival. */
const TIMED = new Set(["place", "assemble", "turn"]);
/** The judge's pair images are this much smaller than the screenshots. */
const JUDGE_SCALE = 0.75;

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
};
const VALUED = ["--gold", "--out", "--only"];
const name = argv.find((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1] ?? ""));
if (!name) {
  console.error("usage: pnpm eval:course <name> [--gold pen] [--out out/eval/<stamp>] [--no-judge] [--only 0,5,6]");
  process.exit(1);
}
const gold = flag("--gold") ?? "pen";
const judging = !argv.includes("--no-judge");
const only = flag("--only")
  ?.split(",")
  .map(Number)
  .filter((n) => Number.isInteger(n));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const outDir = resolve(root, flag("--out") ?? join("out", "eval", `${name}-${stamp}`));

/** "pen" is the hand-made lesson the demo plays by default; any other name is a course file. */
const urlOf = (course: string) => (course === "pen" ? `${BASE}/` : `${BASE}/?course=${encodeURIComponent(course)}`);

type Frame = { file: string; ink: number; box: [number, number, number, number] | null };
type Screen = { index: number; kind: string; text: string; ready: boolean; early?: Frame; late?: Frame; errors: string[] };
/** `problems` are errors met outside any screen: before the first one, or the reason the walk stopped. */
type Walk = { side: "gold" | "cand"; course: string; screens: Screen[]; problems: string[]; reachedEnd: boolean; ms: number };

// In-page code is passed as strings: a bundler's helpers do not exist in the page.
const KIND = `(function(){
  var m = document.querySelector(".demo-lesson main");
  var after = document.querySelector("[data-after]");
  if (after && after.hasAttribute("data-waiting")) return "result";
  if (!m) return document.querySelector("[data-build]") ? "result" : "none";
  return m.getAttribute("data-step") || m.getAttribute("data-stage") || "page";
})()`;
const TEXT = `(function(){
  var waiting = document.querySelector("[data-after][data-waiting]");
  var el = waiting ? document.querySelector("[data-phone]") : document.querySelector(".demo-lesson main") || document.body;
  return (el ? el.innerText : "").replace(/\\s*\\n\\s*/g, " / ").slice(0, 700);
})()`;
/** Canvases a person can see, biggest first, and whether every viewer on show has drawn. */
const VIEWERS = `(function(){
  var waiting = document.querySelector("[data-after][data-waiting]");
  var seen = function(el){
    if (waiting && waiting.contains(el)) return false;
    var r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  };
  var rects = Array.prototype.filter.call(document.querySelectorAll("canvas"), seen).map(function(c){
    var r = c.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) };
  }).sort(function(a, b){ return b.w * b.h - a.w * a.h; });
  var viewers = Array.prototype.filter.call(document.querySelectorAll("[data-kit-viewer]"), seen);
  return { rects: rects, ready: viewers.every(function(v){ return v.hasAttribute("data-ready"); }) };
})()`;
/** How much of a region is not its commonest colour, and the box those pixels cover (as fractions of the region). */
const INK = (b64: string, r: { x: number; y: number; w: number; h: number }) => `(async function(){
  var img = new Image();
  img.src = "data:image/png;base64,${b64}";
  await img.decode();
  var c = document.createElement("canvas");
  c.width = ${Math.round(r.w)}; c.height = ${Math.round(r.h)};
  var g = c.getContext("2d");
  g.drawImage(img, ${-Math.round(r.x)}, ${-Math.round(r.y)});
  var d = g.getImageData(0, 0, c.width, c.height).data;
  var counts = new Map();
  var key = function(i){ return (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4); };
  for (var i = 0; i < d.length; i += 4) counts.set(key(i), (counts.get(key(i)) || 0) + 1);
  var ground = 0, most = 0;
  counts.forEach(function(n, k){ if (n > most) { most = n; ground = k; } });
  var ink = 0, x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) {
    if (key((y * c.width + x) * 4) === ground) continue;
    ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  var round = function(v){ return Math.round(v * 1000) / 1000; };
  return { ink: round(ink / (c.width * c.height)), box: ink ? [round(x0 / c.width), round(y0 / c.height), round((x1 - x0 + 1) / c.width), round((y1 - y0 + 1) / c.height)] : null };
})()`;

const pad = (n: number) => String(n).padStart(2, "0");
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function answers(url: string) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

/** The pen demo's dev server, unless one already answers on the port. Its own dependency cache, so it never fights a demo running beside it. */
async function serve(): Promise<ViteDevServer | undefined> {
  if (await answers(BASE)) return undefined;
  process.env.LARRY_DEMO = "pen";
  const server = await createServer({
    configFile: join(root, "prototypes", "demo", "vite.config.ts"),
    cacheDir: join(root, "node_modules", ".vite-eval"),
    logLevel: "warn",
    server: { port: PORT, strictPort: true },
  });
  await server.listen();
  return server;
}

async function walk(browser: Browser, analyser: Page, side: Walk["side"], course: string): Promise<Walk> {
  const started = Date.now();
  const dir = join(outDir, side);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const screens: Screen[] = [];
  let current: Screen | undefined;
  const problems: string[] = [];
  const note = (line: string) => (current ? current.errors : problems).push(line.slice(0, 300));
  page.on("pageerror", (e) => note(`page error: ${String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") note(`console: ${m.text()}`);
  });

  const frame = async (screen: Screen, when: "early" | "late"): Promise<Frame> => {
    const file = `${pad(screen.index)}-${screen.kind}-${when}.png`;
    const png = await page.screenshot({ path: join(dir, file) });
    const { rects } = (await page.evaluate(VIEWERS)) as { rects: { x: number; y: number; w: number; h: number }[] };
    const rect = rects[0];
    if (!rect) return { file, ink: -1, box: null };
    const { ink, box } = (await analyser.evaluate(INK(png.toString("base64"), rect))) as Pick<Frame, "ink" | "box">;
    return { file, ink, box };
  };
  /** One screen: wait for its 3D, then the early and late frames, timed from when it arrived. */
  const shoot = async (index: number, arrived: number) => {
    const kind = (await page.evaluate(KIND)) as string;
    const screen: Screen = { index, kind, text: "", ready: true, errors: [] };
    current = screen;
    screens.push(screen);
    if (only && !only.includes(index)) {
      await page.waitForTimeout(350);
      return kind;
    }
    await sleep(Math.max(0, arrived + EARLY_MS - Date.now()));
    screen.ready = await page
      .waitForFunction(`${VIEWERS}.ready`, undefined, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    screen.early = await frame(screen, "early");
    await sleep(Math.max(0, arrived + LATE_MS - Date.now()));
    screen.late = await frame(screen, "late");
    screen.text = (await page.evaluate(TEXT)) as string;
    return kind;
  };

  let reachedEnd = false;
  try {
    await page.goto(urlOf(course), { waitUntil: "domcontentloaded" });
    // The camera's fake flow, when the page opens on it: photo, use it, wait for the model.
    const camera = page.getByRole("button", { name: "Take photo" });
    const opensOnCamera = await camera
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (opensOnCamera) {
      await page.waitForTimeout(1500);
      await camera.click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: /Use 1/ }).click();
      await page.locator("[data-build]:not([disabled])").first().waitFor({ timeout: 60_000 });
      await shoot(0, Date.now() + 1500);
      await page.locator("[data-build]").first().click();
    }
    await page.waitForSelector(".demo-lesson main", { timeout: 30_000 });
    // The hand-over from the result takes about a second.
    let arrived = Date.now() + (opensOnCamera ? 1400 : 0);
    for (let index = 1; index <= MAX_SCREENS; index++) {
      const kind = await shoot(index, arrived);
      if (kind === "end") {
        reachedEnd = true;
        break;
      }
      await page.keyboard.press("]");
      arrived = Date.now();
    }
  } catch (error) {
    problems.push(`walk stopped: ${String(error).slice(0, 300)}`);
  }
  await context.close();
  return { side, course, screens, problems, reachedEnd, ms: Date.now() - started };
}

const img = (dir: string, file: string | undefined, width: number) =>
  file
    ? `<img src="${pathToFileURL(join(outDir, dir, file)).href}" width="${width}">`
    : `<div class="none" style="width:${width}px;height:${Math.round((width * VIEW.height) / VIEW.width)}px">missing</div>`;
const SHEET_CSS = `body{margin:0;background:#e9e9e9;font:600 13px Helvetica,Arial,sans-serif;color:#141414;width:max-content}
img{display:block}.none{display:grid;place-items:center;background:#d4d4d4;color:#777}.row{display:flex;gap:4px;margin-top:4px}
h1{font-size:14px;margin:0;padding:8px}h1 span{font-weight:400}`;

/** A page of HTML drawn to an image; the HTML sits in the out directory so it may load the screenshots beside it. */
async function draw(page: Page, html: string, file: string, jpeg = false) {
  const tmp = join(outDir, "_draw.html");
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>${SHEET_CSS}</style>${html}`);
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForFunction("Array.prototype.every.call(document.images, function(i){ return i.complete; })");
  await page.locator("body").screenshot(jpeg ? { path: file, type: "jpeg", quality: 72 } : { path: file });
  rmSync(tmp);
}

type Pair = { index: number; kind: string; gold?: Screen; cand?: Screen; file: string; judgeFile: string };

/** One screen, gold on the left and the candidate on the right; both frames where a test plays, else the late one. */
function pairHtml(pair: Pair, width: number) {
  const timed = TIMED.has(pair.gold?.kind ?? "") || TIMED.has(pair.cand?.kind ?? "");
  const rows = (timed ? (["early", "late"] as const) : (["late"] as const))
    .map((when) => `<div class="row">${img("gold", pair.gold?.[when]?.file, width)}${img("cand", pair.cand?.[when]?.file, width)}</div>`)
    .join("");
  const kinds = pair.gold?.kind === pair.cand?.kind ? pair.kind : `gold ${pair.gold?.kind ?? "none"}, candidate ${pair.cand?.kind ?? "none"}`;
  return `<h1>${pad(pair.index)} ${kinds} <span>gold left, candidate right${timed ? "; top at 0.6 s, bottom at 2.6 s" : ""}</span></h1>${rows}`;
}

const Verdict = z.object({
  scores: z
    .array(
      z.object({
        id: z.enum(["a", "b", "c", "d", "e", "f"]),
        score: z.number().int().min(1).max(5),
        evidence: z.string().describe("One line: what on which screen decided the score."),
      }),
    )
    .length(6),
  summary: z.string().describe("Two or three plain sentences: how far the candidate is from the gold and why."),
  defects: z
    .array(
      z.object({
        tag: z.enum(["kit", "rig", "text"]),
        screens: z.array(z.number().int()).describe("Screen indexes that show it."),
        defect: z.string().describe("What is wrong, concretely, as seen."),
        fix: z.string().describe("What to change."),
      }),
    )
    .describe("Worst first. Empty when the candidate matches the gold."),
});
type Verdict = z.infer<typeof Verdict>;

const RUBRIC = {
  a: "The model looks like the photographed object: silhouette, proportion, colour, clip, panel, grip.",
  b: "Inner parts sit inside the case, with nothing poking through or floating.",
  c: "Each preview shows the mechanism working and is opaque.",
  d: "Drag screens: spots are on or in the object, the failing test visibly fails and the passing one visibly works.",
  e: "Framing: the object fills the frame as well as in the gold.",
  f: "Text: names, one-liners and tips are plain and correct.",
} as const;

const JUDGE_SYSTEM = `You review a generated lesson for an app that turns a photo of an object into a 3D model and a lesson on how it works. The model is drawn as low-resolution dithered pixel art.

You get the photo, then one image per lesson screen. Each image shows the hand-made gold lesson on the left and the generated candidate on the right, at the same screen index. Screens where a test plays show two rows: 0.6 s after arriving (top) and 2.6 s after (bottom). The text on each screen is also given as text.

Score the candidate (the right side) from 1 to 5 on each rubric line, with one line of evidence that names a screen index. The gold is 5 by definition: 5 means as good as the gold, 3 means clearly worse but usable, 1 means broken.
${Object.entries(RUBRIC)
  .map(([id, line]) => `(${id}) ${line}`)
  .join("\n")}

Then list concrete defects of the candidate, worst first. Tag each with where the fix belongs:
- kit: the outside of the object as drawn from the photo (shapes, sizes, colours, missing or wrong parts).
- rig: the hidden works, motion, tests, drag spots, camera framing and see-through, which code installs on top of the kit.
- text: names, one-liners, tips and other words.
Judge only what the images and text show. Do not list a difference that is no worse than the gold. When the two sides are the same, give 5 and no defects.`;

async function judge(pairs: Pair[], facts: string[]): Promise<{ verdict: Verdict; costUsd: number; sent: number[] }> {
  // Too many screens: keep the result, the previews, the drag screens and the end.
  const KEY = new Set(["result", "demo", "end", ...TIMED]);
  const sent = pairs.length > 20 ? pairs.filter((p) => KEY.has(p.kind) || KEY.has(p.cand?.kind ?? "")) : pairs;
  const image = (path: string, type: "image/jpeg") => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: type, data: readFileSync(path).toString("base64") },
  });
  const content = [
    { type: "text" as const, text: "The photo the candidate was generated from:" },
    image(join(root, "fixtures", "photos", "pen.jpg"), "image/jpeg"),
    ...sent.flatMap((p) => [
      {
        type: "text" as const,
        text: `Screen ${pad(p.index)} (${p.kind}).\nGold text: ${p.gold?.text || "(none)"}\nCandidate text: ${p.cand?.text || "(none)"}`,
      },
      image(p.judgeFile, "image/jpeg"),
    ]),
    { type: "text" as const, text: `Facts from the automatic checks:\n${facts.map((f) => `- ${f}`).join("\n") || "- none"}\n\nScore the candidate and list its defects.` },
  ];
  const { $schema: _dialect, ...schema } = z.toJSONSchema(Verdict);
  for await (const event of streamStructured({ system: JUDGE_SYSTEM, schema, brain: { model: "claude-opus-5-5", effort: "medium" }, content, streamKey: "defects" })) {
    if (event.type === "result") return { verdict: Verdict.parse(event.output), costUsd: event.costUsd, sent: sent.map((p) => p.index) };
  }
  throw new Error("the judge ended without a verdict");
}

/** shared/course/check.ts is written beside this script; run its checker when it is there. */
async function courseChecks(): Promise<{ ran: boolean; problems: string[] }> {
  const file = join(root, "fixtures", "courses", `${name}.json`);
  if (!existsSync(file)) return { ran: false, problems: name === "pen" ? [] : [`no course file at fixtures/courses/${name}.json`] };
  const json: unknown = JSON.parse(readFileSync(file, "utf8"));
  const parsed = GenCourse.safeParse(json);
  const problems = parsed.success ? [] : parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`);
  const checker = join(root, "shared", "course", "check.ts");
  if (!existsSync(checker)) return { ran: false, problems };
  const module = (await import(pathToFileURL(checker).href)) as { courseProblems?: (course: unknown) => unknown };
  if (typeof module.courseProblems !== "function") return { ran: false, problems };
  try {
    const found = await module.courseProblems(json);
    const list = Array.isArray(found) ? found : found ? [found] : [];
    return { ran: true, problems: [...problems, ...list.map((p) => (typeof p === "string" ? p : JSON.stringify(p)))] };
  } catch (error) {
    return { ran: true, problems: [...problems, `courseProblems threw: ${String(error)}`] };
  }
}

const started = Date.now();
mkdirSync(join(outDir, "pairs"), { recursive: true });
mkdirSync(join(outDir, "judge"), { recursive: true });
const server = await serve();
const browser = await launchChromium(true);
try {
  const tools = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const analyser = await tools.newPage();
  const sheetPage = await tools.newPage();

  // A fresh dependency cache reloads the page once while it fills; load it once first so the walks are not cut short.
  if (server) {
    const warm = await tools.newPage();
    await warm.goto(urlOf(name), { waitUntil: "domcontentloaded" }).catch(() => {});
    await warm.waitForTimeout(6000);
    await warm.close();
  }
  const [goldWalk, candWalk] = await Promise.all([walk(browser, analyser, "gold", gold), walk(browser, analyser, "cand", name)]);

  const indexes = [...new Set([...goldWalk.screens, ...candWalk.screens].map((s) => s.index))].sort((a, b) => a - b).filter((i) => !only || only.includes(i));
  const pairs: Pair[] = indexes.map((index) => {
    const g = goldWalk.screens.find((s) => s.index === index);
    const c = candWalk.screens.find((s) => s.index === index);
    const kind = c?.kind ?? g?.kind ?? "none";
    return { index, kind, gold: g, cand: c, file: join(outDir, "pairs", `${pad(index)}-${kind}.png`), judgeFile: join(outDir, "judge", `${pad(index)}.jpg`) };
  });
  for (const pair of pairs) {
    await draw(sheetPage, pairHtml(pair, VIEW.width), pair.file);
    if (judging) await draw(sheetPage, pairHtml(pair, Math.round(VIEW.width * JUDGE_SCALE)), pair.judgeFile, true);
  }
  // The whole lesson at a glance: every screen's late frame, gold over candidate.
  const cell = (dir: string, s: Screen | undefined) => img(dir, s?.late?.file, 156);
  await draw(
    sheetPage,
    `<div style="display:flex;flex-wrap:wrap;gap:12px;padding:12px;width:${Math.min(pairs.length, 8) * 168}px">${pairs
      .map((p) => `<figure style="margin:0"><figcaption style="padding-bottom:4px">${pad(p.index)} ${p.kind}</figcaption>${cell("gold", p.gold)}<div style="height:4px"></div>${cell("cand", p.cand)}</figure>`)
      .join("")}</div>`,
    join(outDir, "sheet.png"),
  );

  // What can be said without looking.
  const checks = await courseChecks();
  const findings: string[] = [];
  if (!goldWalk.reachedEnd) findings.push(`gold walk did not reach the end screen (${goldWalk.screens.length} screens)`);
  if (!candWalk.reachedEnd) findings.push(`candidate walk did not reach the end screen (${candWalk.screens.length} screens)`);
  if (goldWalk.screens.length !== candWalk.screens.length) findings.push(`screen count: gold ${goldWalk.screens.length}, candidate ${candWalk.screens.length}`);
  for (const pair of pairs) {
    const { gold: g, cand: c } = pair;
    const at = `screen ${pad(pair.index)} (${pair.kind})`;
    if (g && c && g.kind !== c.kind) findings.push(`${at}: gold is ${g.kind}, candidate is ${c.kind}`);
    if (!c) continue;
    for (const error of c.errors) findings.push(`${at}: ${error}`);
    if (!c.ready) findings.push(`${at}: 3D not drawn after 15 s`);
    const ink = c.late?.ink ?? -1;
    const goldInk = g?.late?.ink ?? -1;
    if (ink < 0 && goldInk >= 0) findings.push(`${at}: no 3D frame on screen, gold has one`);
    else if (ink >= 0 && ink < 0.004) findings.push(`${at}: 3D frame is blank (${(ink * 100).toFixed(2)}% drawn)`);
    else if (ink >= 0 && goldInk > 0.01 && ink < goldInk * 0.25) findings.push(`${at}: 3D frame nearly empty (${(ink * 100).toFixed(1)}% drawn, gold ${(goldInk * 100).toFixed(1)}%)`);
    const box = c.late?.box;
    const goldBox = g?.late?.box;
    if (box && goldBox && ink >= 0.004 && box[3] < goldBox[3] * 0.7) findings.push(`${at}: object is ${Math.round(box[3] * 100)}% of the frame's height, gold ${Math.round(goldBox[3] * 100)}%`);
  }
  for (const problem of goldWalk.problems) findings.push(`gold: ${problem}`);
  for (const problem of candWalk.problems) findings.push(`candidate: ${problem}`);
  for (const error of goldWalk.screens.flatMap((s) => s.errors.map((e) => `gold screen ${pad(s.index)}: ${e}`))) findings.push(error);
  for (const problem of checks.problems) findings.push(`course: ${problem}`);

  let verdict: Verdict | undefined;
  let judgeNote = judging ? "" : "skipped (--no-judge)";
  let costUsd = 0;
  if (judging) {
    try {
      const judged = await judge(pairs, findings);
      verdict = judged.verdict;
      costUsd = judged.costUsd;
      judgeNote = `screens ${judged.sent.map(pad).join(" ")}`;
    } catch (error) {
      judgeNote = `failed: ${String(error).slice(0, 300)}`;
    }
  }
  rmSync(join(outDir, "judge"), { recursive: true, force: true });

  const seconds = Math.round((Date.now() - started) / 1000);
  const report = {
    name,
    gold,
    out: outDir,
    seconds,
    walks: { gold: goldWalk, cand: candWalk },
    courseProblems: checks,
    findings,
    judge: { note: judgeNote, costUsd, rubric: RUBRIC, verdict },
  };
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    `# ${name} against ${gold}`,
    "",
    `${candWalk.screens.length} screens (gold ${goldWalk.screens.length}), end screen ${candWalk.reachedEnd ? "reached" : "NOT reached"}, ${seconds} s. Pairs in pairs/, overview in sheet.png.`,
    "",
    `## Checks (${findings.length})`,
    ...(findings.length > 0 ? findings.map((f) => `- ${f}`) : ["- nothing found"]),
    `- courseProblems: ${checks.ran ? `${checks.problems.length} problems` : "not run"}`,
    "",
    `## Judge${judgeNote ? ` (${judgeNote})` : ""}`,
    ...(verdict
      ? [
          "",
          ...verdict.scores.map((s) => `- (${s.id}) ${s.score}/5 ${s.evidence}`),
          "",
          verdict.summary,
          "",
          "### Defects, worst first",
          ...(verdict.defects.length > 0
            ? verdict.defects.map((d, i) => `${i + 1}. [${d.tag}] ${d.defect} Fix: ${d.fix} (screens ${d.screens.map(pad).join(", ") || "all"})`)
            : ["none"]),
        ]
      : []),
    "",
  ];
  writeFileSync(join(outDir, "report.md"), lines.join("\n"));
  console.log(lines.join("\n"));
  console.log(outDir);
} finally {
  await browser.close();
  await server?.close();
}
