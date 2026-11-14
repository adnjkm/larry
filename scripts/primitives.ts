// Screenshots every primitive in the library on a phone-sized page, for checking the renders.
// Usage: node scripts/primitives.ts   -> out/primitives/<id>.png and out/primitives/page.png
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { PRIMITIVES } from "../src/primitives/library.ts";

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "out", "primitives");
const cache = join(homedir(), "Library", "Caches", "ms-playwright");

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

const server = await createServer({ root, logLevel: "warn", server: { port: 0, host: "127.0.0.1", forwardConsole: false } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let exitCode = 0;

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a URL");
  browser = await chromium.launch({
    executablePath: findChromium(),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`[page error] ${m.text()}`);
  });
  mkdirSync(outDir, { recursive: true });

  for (const p of PRIMITIVES) {
    await page.goto(`${url}?primitives=${p.id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-kit-viewer][data-ready]", { timeout: 90_000 });
    await page.waitForTimeout(400);
    await page.locator("[data-kit-viewer]").screenshot({ path: join(outDir, `${p.id}.png`) });
    if (p === PRIMITIVES[2]) await page.screenshot({ path: join(outDir, "page.png"), fullPage: true });
    console.log(p.id);
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
process.exit(exitCode);
