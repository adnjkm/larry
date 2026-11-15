// The game page, end to end: `node scripts/game-check.ts [primitive-id]` (default spring).
// At 390x844 and 320x700 it screenshots the page at rest, sets the game's number to a failing and a passing value,
// presses the action, waits for the run and checks that the verdict on screen is the one game.judge gives, and that
// every slider the other scripts drive is still on the page exactly once. Screenshots land in out/game/ (look at them).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { PRIMITIVES } from "../shared/primitives/library.ts";
import { verdictText as shown } from "../src/primitives/game/logic.ts";
import { type Values, startValues, steps } from "../shared/primitives/types.ts";
import { launch, root } from "./stage-lib.ts";

const id = process.argv[2] ?? "spring";
const primitive = PRIMITIVES.find((p) => p.id === id) ?? assert.fail(`no primitive ${id}`);
const game = primitive.game;
const numberSlider = [...primitive.sliders, ...(game.controls ?? [])].find((s) => s.id === game.number)!;
const outDir = join(root, "out", "game");
mkdirSync(outDir, { recursive: true });

const numbers = steps(numberSlider);
const withNumber = (n: number): Values => ({ ...startValues(primitive), [numberSlider.id]: n });
const failing = numbers.find((n) => !game.judge(withNumber(n)).pass);
const passing = [...numbers].reverse().find((n) => game.judge(withNumber(n)).pass);
assert(failing !== undefined, "no failing value for the number");
assert(passing !== undefined, "no passing value for the number");

const verdictText = async (page: Page) => (await page.locator("[data-verdict]").innerText()).replace(/\s+/g, " ").trim();

async function check(page: Page, url: string, tag: string) {
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${id}-${tag}-${name}.png`) });
  const action = page.locator("[data-action=act]");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${url}?primitives=${id}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-kit-viewer][data-ready]", { timeout: 90_000 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-game]").count(), 1, "one [data-game]");
  assert.equal(await page.locator("[data-meter]").count(), 2, "two meters");
  for (const s of primitive.sliders) assert.equal(await page.locator(`[data-slider="${s.id}"] input`).count(), 1, `exactly one input for slider ${s.id}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal scroll");
  await shot("1-rest");
  assert.equal(await verdictText(page), shown(game.judge(startValues(primitive))), "verdict at rest is game.judge(start)");

  for (const [name, n] of [["fail", failing!], ["pass", passing!]] as const) {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-kit-viewer][data-ready]", { timeout: 90_000 });
    await page.locator(`[data-slider="${numberSlider.id}"] input`).fill(String(n));
    await page.waitForTimeout(400);
    const expected = game.judge(withNumber(n));
    assert.equal(expected.pass, name === "pass");
    assert.equal(await verdictText(page), shown(expected), `${name}: live verdict follows the slider`);
    assert.equal(await page.locator("[data-verdict]").getAttribute("data-source"), "judge");
    await shot(`2-${name}-before`);

    await action.click();
    await page.waitForSelector('[data-game][data-phase="done"]', { timeout: 20_000 });
    const run = game.play(withNumber(n)).verdict;
    assert.equal(await verdictText(page), shown(run), `${name}: verdict after the run is the run's verdict`);
    assert.equal(await page.locator("[data-verdict]").getAttribute("data-source"), "run");
    assert.equal(await page.locator("[data-verdict]").getAttribute("data-pass"), String(run.pass));
    assert.equal((await action.innerText()).trim(), run.pass ? "Play again" : "Try again");
    await shot(`3-${name}-after`);

    await action.click();
    assert.equal(await page.locator("[data-game]").getAttribute("data-phase"), "ready", `${name}: the next press resets`);
    assert.equal(await page.locator(`[data-slider="${numberSlider.id}"] input`).inputValue(), String(n), `${name}: the number is kept`);
    assert.equal((await action.innerText()).trim(), game.action);
    assert.equal(await verdictText(page), shown(expected), `${name}: back to the live verdict`);
  }
  assert.deepEqual(errors, [], "no page errors");
}

const { url, browser, close } = await launch();
try {
  for (const [w, h] of [[390, 844], [320, 700]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
    await check(page, url, `${w}`);
    await page.close();
    console.log(`${id} at ${w}x${h}: ok`);
  }
} finally {
  await close();
}
