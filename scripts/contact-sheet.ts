// One image of the screens a person meets, 390 px wide each: node scripts/contact-sheet.ts [lesson]
// Writes out/contact-sheet/sheet.png. The capture and generating screens come from the real app with the kit request held open.
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type Page, chromium } from "playwright-core";
import { createServer } from "vite";
import { parseKit } from "../shared/kit.ts";
import { type Step, parseLesson } from "../shared/lesson.ts";
import { CATALOG, PRIMITIVE_BY_ID } from "../src/primitives/catalog.ts";

const root = resolve(import.meta.dirname, "..");
const name = process.argv[2] ?? "pen";
const outDir = join(root, "out", "contact-sheet");
const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const executable = ["chromium_headless_shell-", "chromium-"].flatMap((prefix) =>
  readdirSync(cache)
    .filter((n) => n.startsWith(prefix))
    .sort()
    .reverse()
    .flatMap((n) => ["chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"].map((e) => join(cache, n, e)))
).find(existsSync);
if (!executable) throw new Error(`No chromium in ${cache}`);

const kit = parseKit(JSON.parse(readFileSync(join(root, "fixtures", "kits", `${name}.json`), "utf8")));
const lesson = parseLesson(JSON.parse(readFileSync(join(root, "fixtures", "lessons", `${name}.json`), "utf8")), kit, CATALOG);

mkdirSync(outDir, { recursive: true });
const shots: { label: string; file: string }[] = [];
const server = await createServer({ root, logLevel: "warn", server: { port: 0, host: "127.0.0.1" } });
const browser = await chromium.launch({ executablePath: executable, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });

async function shoot(page: Page, label: string) {
  await page.waitForFunction(() => [...document.querySelectorAll("[data-kit-viewer]")].every((v) => v.hasAttribute("data-ready")), undefined, { timeout: 90_000 });
  await page.waitForTimeout(400);
  const file = `${String(shots.length + 1).padStart(2, "0")}.png`;
  await page.screenshot({ path: join(outDir, file) });
  shots.push({ label, file });
}

async function setSlider(page: Page, slider: { id: string; min: number; max: number }, value: number) {
  const box = await page.locator(`[data-slider="${slider.id}"] input`).boundingBox();
  if (!box) throw new Error("slider not on screen");
  const x = (v: number) => box.x + 12 + ((v - slider.min) / (slider.max - slider.min)) * (box.width - 24);
  const y = box.y + box.height / 2;
  await page.mouse.move(x(slider.min), y);
  await page.mouse.down();
  await page.mouse.move(x(value), y, { steps: 8 });
  await page.mouse.up();
}

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  await page.route("**/api/kits", () => new Promise(() => {}));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Photograph something" }).waitFor();
  await shoot(page, "Capture");
  await page.locator("input[type=file]").setInputFiles(join(root, "fixtures", "photos", `${name}.jpg`));
  await page.getByText("Larry is taking it apart").waitFor();
  await page.waitForTimeout(1400);
  await shoot(page, "Generating");

  await page.goto(`${url}?demo=mug`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-action=start]:not([disabled])").waitFor();
  await shoot(page, "North star");

  await page.goto(`${url}?demo=${name}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-action=start]:not([disabled])").click();

  const taken = new Set<string>();
  const once = async (label: string, fn: () => Promise<void>) => {
    if (taken.has(label)) return;
    taken.add(label);
    await fn();
  };
  for (const chapter of lesson.chapters) {
    for (const step of chapter.steps) {
      await page.locator(`article[data-step="${step.id}"]`).waitFor();
      // A step slides in; measure controls only once it is at rest.
      await page.waitForFunction((id) => document.querySelector<HTMLElement>(`article[data-step="${id}"]`)?.style.transform === "", step.id);
      const problem = step.problem;
      if (problem?.type === "run") {
        if (step.primitive !== null) await once("Run step", () => shoot(page, "Run step with its figure"));
        await page.locator("[data-action=run]").click();
      } else if (problem?.type === "pick") {
        const wrong = problem.options.findIndex((o) => !o.works);
        const right = problem.options.findIndex((o) => o.works);
        await page.locator(`[data-option="${wrong}"] button`).click();
        await once("Pick step", async () => {
          await page.locator(`[data-option="${wrong}"]`).scrollIntoViewIfNeeded();
          await shoot(page, "Pick step after a wrong try");
        });
        await page.locator(`[data-option="${right}"] button`).click();
      } else if (problem?.type === "tune") {
        const slider = PRIMITIVE_BY_ID.get(step.primitive ?? "")?.sliders.find((s) => s.id === problem.slider);
        if (!slider) throw new Error("tune slider missing");
        await setSlider(page, slider, slider.min);
        await page.locator('[data-note="fail"]').waitFor();
        await setSlider(page, slider, (problem.min + problem.max) / 2);
        await page.locator('[data-note="ok"]').waitFor();
        await once("Tune step", async () => {
          await page.locator('[data-note="ok"]').scrollIntoViewIfNeeded();
          await shoot(page, "Tune step after release");
        });
      }
      if (step.earns.length > 0) {
        await once("Payoff", async () => {
          await page.locator('[data-stage="build"]').waitFor();
          await page.evaluate(() => window.scrollTo(0, 0));
          await shoot(page, "Earned part on the stage");
        });
      }
      await page.locator("[data-action=next]").click();
    }
  }
  await page.locator("[data-finish]").waitFor();
  await shoot(page, "Finish");

  const sheet = await context.newPage();
  const order = ["Capture", "Generating", "North star", "Run", "Pick", "Tune", "Payoff", "Finish"];
  shots.sort((a, b) => order.findIndex((o) => a.label.startsWith(o)) - order.findIndex((o) => b.label.startsWith(o)));
  const cells = shots.map(({ label, file }) => `<figure><img src="data:image/png;base64,${readFileSync(join(outDir, file)).toString("base64")}" width="390"><figcaption>${label}</figcaption></figure>`).join("");
  await sheet.setContent(`<body style="margin:0;padding:24px;background:#e9e9e9;display:flex;gap:16px;font:600 13px Helvetica,Arial,sans-serif;width:max-content"><style>figure{margin:0}img{display:block;border-radius:12px;box-shadow:0 1px 6px #0003}figcaption{margin-top:8px;text-align:center}</style>${cells}</body>`);
  await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
  await sheet.screenshot({ path: join(outDir, "sheet.png"), fullPage: true });
  console.log(`${join(outDir, "sheet.png")}: ${shots.map((s) => s.label).join(", ")}`);
} finally {
  await browser.close();
  await server.close();
}
