/** PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser-smoke.mjs
 * Uses live input for controls, controlled fixtures for UI result/save branches.
 * Actual combat/campaign balance is exercised without cheats in engine.test.mjs.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const output = process.env.SCREENSHOT_DIR || "/private/tmp/hellwake-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
const base = process.env.GAME_URL || "http://127.0.0.1:8888/gms/3d/hellwake/";
const shot = async (name) => page.screenshot({ path: `${output}/${name}.png` });
const action = (id) => page.locator(`[data-action="${id}"]`);
async function ready() {
  await page.waitForFunction(() => window.hellwakeTest);
}
async function fixtureResult(chapter, victory = true) {
  await page.evaluate(
    ({ chapter, victory }) => {
      hellwakeTest.save.unlockedChapter = chapter;
      hellwakeTest.launch(chapter, false);
      const s = hellwakeTest.engine.state;
      s.phase = victory ? "won" : "lost";
      s.result = {
        victory,
        chapter,
        kills: 140,
        seconds: 130,
        embers: 90,
        endless: false,
      };
    },
    { chapter, victory },
  );
  await action(victory ? "outro" : "retry").waitFor();
}
try {
  await page.goto(base + "?test=1");
  await ready();
  await page.waitForTimeout(400);
  assert.ok((await page.evaluate(() => hellwake.metrics.triangles)) > 10000);
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const start = await action("start").boundingBox();
    assert.ok(
      start.y >= 0 && start.y + start.height <= height,
      `start fits ${width}`,
    );
    const nav = await action("refuge").boundingBox();
    assert.ok(nav.y + nav.height <= height, `nav fits ${width}`);
    await shot(`home-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await action("start").tap();
  await shot("story");
  await action("skip-story").tap();
  const client = await context.newCDPSession(page);
  const initial = await page.evaluate(() => ({
    ...hellwakeTest.engine.state.player,
  }));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 110, y: 570, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 145, y: 555, id: 1 }],
  });
  await page.waitForTimeout(550);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const after = await page.evaluate(() => ({
    ...hellwakeTest.engine.state.player,
  }));
  assert.ok(after.x - initial.x > 1, "actual touch drag moves");
  await page.locator("#pause").tap();
  const time = await page.evaluate(() => hellwakeTest.engine.state.time);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => hellwakeTest.engine.state.time), time);
  await action("settings").tap();
  await action("sound").tap();
  await action("motion").tap();
  await page.locator("#quality").selectOption("low");
  await action("close-sheet").tap();
  await action("resume").tap();
  await page.locator("#pulse").tap();
  assert.ok(
    await page.evaluate(() => hellwakeTest.engine.state.pulseCharge < 0.1),
  );
  await page.evaluate(() => {
    hellwakeTest.engine.state.xp = hellwakeTest.engine.state.xpNext;
  });
  await page.locator(".draft-card").first().waitFor();
  assert.equal(await page.locator(".draft-card").count(), 3);
  await shot("upgrade");
  await page.locator(".draft-card").first().tap();
  await page.locator("#pause").tap();
  await action("abandon").tap();
  await action("resume").tap();
  assert.equal(
    await page.evaluate(() => hellwakeTest.engine.state.paused),
    false,
  );
  await shot("gameplay");
  await fixtureResult(0, false);
  await page.keyboard.press("Escape");
  assert.equal(
    await action("retry").isVisible(),
    true,
    "Escape retains required result",
  );
  await action("result-refuge").tap();
  await page.locator('[data-action="buy"][data-id="vitality"]').tap();
  assert.equal(await page.evaluate(() => hellwakeTest.save.relics.vitality), 1);
  assert.equal(await page.evaluate(() => hellwakeTest.save.embers), 60);
  await page.reload();
  await ready();
  assert.equal(await page.evaluate(() => hellwakeTest.save.relics.vitality), 1);
  assert.equal(
    await page.evaluate(() => hellwakeTest.save.settings.sound),
    false,
  );
  assert.equal(
    await page.evaluate(() => hellwakeTest.save.settings.quality),
    "low",
  );
  await fixtureResult(0, true);
  assert.equal(await page.evaluate(() => hellwakeTest.save.unlockedChapter), 1);
  await action("outro").tap();
  await action("skip-story").tap();
  await action("campaign").tap();
  assert.equal(
    await page.locator('[data-action="chapter"][data-id="1"]').isEnabled(),
    true,
  );
  assert.equal(
    await page.locator('[data-action="chapter"][data-id="2"]').isEnabled(),
    false,
  );
  await shot("campaign");
  await fixtureResult(5, true);
  await page.reload();
  await ready();
  await action("pending-ending").waitFor();
  await action("pending-ending").tap();
  await action("skip-story").tap();
  assert.equal(await page.evaluate(() => hellwakeTest.save.endingSeen), true);
  await page.keyboard.press("Escape");
  assert.equal(await action("ending-home").isVisible(), true);
  await shot("ending");
  await action("endless").tap();
  assert.equal(
    await page.evaluate(() => hellwakeTest.engine.state.endless),
    true,
  );
  assert.equal(
    await page.evaluate(() => hellwakeTest.engine.state.arsenalChapter),
    5,
  );
  await page.evaluate(() => hellwakeTest.home());
  await action("arsenal").tap();
  assert.equal(await page.locator(".arsenal-card.locked").count(), 0);
  await shot("arsenal");
  await action("close-sheet").tap();
  await action("refuge").tap();
  await page.locator('[data-action="survivor"][data-id="vesper"]').tap();
  assert.equal(
    await page.evaluate(() => hellwakeTest.save.selectedSurvivor),
    "vesper",
  );
  await shot("refuge");
  await page.setViewportSize({ width: 844, height: 390 });
  await action("close-sheet").tap();
  await shot("landscape");
  await page.setViewportSize({ width: 1440, height: 960 });
  await shot("desktop");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks:
          "phone sizes; real touch; pause; settings; pulse; draft; retreat; loss; purchase; reload; victory; chapter locks; pending ending recovery; endless; arsenal; survivor; landscape; desktop",
        metrics: await page.evaluate(() => hellwake.metrics),
        errors,
        screenshots: output,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
