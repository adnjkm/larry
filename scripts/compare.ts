import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const outPath = join(root, "out", "compare.png");
const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const READY_TIMEOUT_MS = 90_000;

const browserLayouts = [
  { dir: "chromium_headless_shell", executable: "chrome-headless-shell-mac-arm64/chrome-headless-shell" },
  { dir: "chromium", executable: "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium" },
];

function findChromium(): string {
  for (const { dir, executable } of browserLayouts) {
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`[page error] ${m.text()}`);
  });
  page.on("pageerror", (e) => console.error(`[page error] ${e.message}`));

  await page.goto(`${url}?compare`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => {
      const viewers = [...document.querySelectorAll("[data-kit-viewer]")];
      const photos = [...document.images];
      return viewers.length > 0 && viewers.every((v) => v.hasAttribute("data-ready")) && photos.every((img) => img.complete && img.naturalWidth > 0);
    },
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
  const count = await page.locator("[data-kit-viewer]").count();

  mkdirSync(join(root, "out"), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`${count} rows rendered`);
  console.log(outPath);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
process.exit(exitCode);
