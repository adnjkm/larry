// Shared browser setup for every Playwright script: Playwright's cached Chromium (SwiftShader by default, the Mac's GPU
// with gpu = true), and a Vite server plus browser for the scripts that need nothing more.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type Browser, type Page, chromium } from "playwright-core";
import { type ViteDevServer, createServer } from "vite";
import { READY_VIEWER_SELECTOR } from "../src/viewport.ts";

export const root = resolve(import.meta.dirname, "..");

/** Waits until a viewer on the page has drawn its first frame. */
export const ready = (page: Page) => page.waitForSelector(READY_VIEWER_SELECTOR, { timeout: 90_000 });

function findChromium(): string {
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  for (const { dir, executable } of [
    { dir: "chromium_headless_shell", executable: "chrome-headless-shell-mac-arm64/chrome-headless-shell" },
    { dir: "chromium", executable: "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium" },
  ]) {
    const revisions = readdirSync(cache)
      .filter((n) => n.startsWith(`${dir}-`))
      .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
    for (const r of revisions) {
      const p = join(cache, r, executable);
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`No chromium in ${cache}`);
}

export function launchChromium(gpu = false): Promise<Browser> {
  return chromium.launch({
    executablePath: findChromium(),
    args: gpu
      ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"]
      : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
}

export async function launch(gpu = false): Promise<{ url: string; browser: Browser; server: ViteDevServer; close: () => Promise<void> }> {
  const server = await createServer({ root, logLevel: "warn", server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const url = server.resolvedUrls!.local[0]!;
  const browser = await launchChromium(gpu);
  return {
    url,
    browser,
    server,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}
