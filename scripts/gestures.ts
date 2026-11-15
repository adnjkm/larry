// Real touch input through CDP, at phone size: node scripts/gestures.ts
// Swipes between steps on the mug demo, then flicks a figure on the primitives page.
import assert from "node:assert/strict";
import { launch } from "./browser.ts";

const { url, browser, close } = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  async function swipe(from: [number, number], to: [number, number], ms = 160, steps = 10) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, ms / steps));
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(900);
  }
  const stepId = () => page.locator("[data-step]").getAttribute("data-step");
  await page.goto(`${url}?demo=mug`);
  await page.locator("[data-action=start]:not([disabled])").click();
  const first = await stepId();
  // Grab the story card, well clear of the model and any slider.
  const card = await page.locator("[data-story]").boundingBox();
  assert.ok(card, "the story card is on screen");
  const y = card.y + card.height / 2;

  await swipe([300, y], [60, y]);
  assert.equal(await stepId(), first, "an unfinished step does not swipe forward");
  assert.equal(await page.locator("[data-step]").evaluate((el: HTMLElement) => el.style.transform), "", "it springs back into place");
  console.log("swipe left on an unfinished step: rubber-bands and stays");

  await page.locator("[data-action=run]").click({ delay: 150 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-action=next]").count(), 0, "a short tap on a hold button does not run the experiment");
  assert.ok(await page.getByText("Hold until it fills").isVisible(), "and says to hold");
  await page.locator("[data-action=run]").click({ delay: 900 });
  console.log("hold button: a short tap only hints, a held press runs it");
  await page.locator("[data-action=next]").waitFor();
  await swipe([300, y], [60, y]);
  const second = await stepId();
  assert.notEqual(second, first, "a finished step swipes forward");
  console.log(`swipe left on a finished step: ${first} -> ${second}`);

  const y2 = ((await page.locator("[data-story]").boundingBox())?.y ?? 0) + 20;
  await swipe([80, y2], [340, y2]);
  assert.equal(await stepId(), first, "swiping right goes back");
  console.log(`swipe right: back to ${first}`);

  await swipe([200, 700], [215, 300], 200);
  assert.equal(await stepId(), first, "a vertical swipe scrolls instead of changing step");
  console.log(`vertical swipe: still ${first}, scrollY ${await page.evaluate(() => scrollY)}`);

  await page.evaluate(() => {
    const w = window as unknown as { samples: string[] };
    w.samples = [];
    new MutationObserver(() => w.samples.push(document.querySelector<HTMLElement>("[data-step]")?.style.transform ?? "")).observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["style"],
    });
  });
  await page.locator("[data-action=next]").click();
  await page.waitForTimeout(150);
  const mid = await page.evaluate(() => (window as unknown as { samples: string[] }).samples[0] ?? "");
  assert.match(mid, /translateX\(\d/, "Next pushes the new step in from the right");
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-step]").evaluate((el: HTMLElement) => el.style.transform), "", "the pushed step settles at rest");
  console.log(`Next pushes the step in from ${mid} and it settles`);
  // A still figure (no idle spin): a flick keeps it turning after release, then it comes to rest.
  await page.goto(`${url}?primitives`);
  await page.waitForFunction(() => document.querySelector("[data-figure] [data-kit-viewer]")?.hasAttribute("data-ready"));
  const viewer = page.locator("[data-figure] [data-kit-viewer] canvas");
  const box = await viewer.boundingBox();
  assert.ok(box, "the figure is on screen");
  const cy = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 40, y: cy }] });
  for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 40 + i * 45, y: cy }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const a1 = await viewer.screenshot();
  await page.waitForTimeout(200);
  const a2 = await viewer.screenshot();
  await page.waitForTimeout(3500);
  const b1 = await viewer.screenshot();
  await page.waitForTimeout(400);
  const b2 = await viewer.screenshot();
  assert.ok(!a1.equals(a2), "the model keeps turning after the finger lifts");
  assert.ok(b1.equals(b2), "and then comes to rest");
  console.log("fling: keeps turning after release, then rests");
  assert.deepEqual(errors, []);
} finally {
  await close();
}
