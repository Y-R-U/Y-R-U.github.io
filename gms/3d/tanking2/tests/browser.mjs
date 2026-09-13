import { createRequire } from "node:module";
import assert from "node:assert/strict";

// Run with a static site server, normally http://127.0.0.1:8888.
// PLAYWRIGHT_MODULE and CHROME_PATH may point to other local installations.
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE ||
    "/private/tmp/tanking-tools/node_modules/playwright",
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const url =
  process.env.TANKING2_URL || "http://127.0.0.1:8888/gms/3d/tanking2/";
const errors = [],
  checks = [],
  bounds = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
function watch(p) {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 1000));
  });
  p.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
}
watch(page);
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
  console.log("PASS", name);
};
const run = (fn) => page.evaluate(fn);
const mission = () => page.locator("#missionAction").click();
const boot = async (p) => {
  await p.goto(url);
  await p.waitForFunction(() => window.tanking2?.metrics.drawCalls > 5);
  await p.locator("#loading").waitFor({ state: "detached" });
};
const step = (seconds) => page.evaluate((s) => tanking2.step(s), seconds);
const inBounds = () =>
  page.evaluate(() => {
    const clipped = [
      "mission",
      "dock",
      "tankRail",
      "drawer",
      "photoBar",
      "modeBanner",
    ].filter((id) => {
      const el = document.getElementById(id);
      if (el.hidden) return false;
      const r = el.getBoundingClientRect();
      return (
        r.left < -0.5 ||
        r.right > innerWidth + 0.5 ||
        r.top < -0.5 ||
        r.bottom > innerHeight + 0.5
      );
    });
    return {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      clipped,
    };
  });

try {
  await boot(page);
  check(
    "opening has one purchase action and no premature tools, tank selector or mode picker",
    (await page.locator("#interface button:visible").count()) === 2 &&
      (await run(
        () =>
          tanking2.state.chapter === 0 &&
          tanking2.state.tanks[0].fish.length === 0 &&
          document.getElementById("dock").hidden &&
          document.getElementById("tankRail").hidden &&
          document.getElementById("settingsButton").hidden,
      )),
  );
  check(
    "engine rejects species, equipment and modes before their gameplay unlock",
    await run(() => {
      const n = tanking2.state.tanks[0].fish.length;
      return (
        !tanking2.act("buy", { species: "neon" }) &&
        !tanking2.act("upgrade", { id: "autofeeder" }) &&
        !tanking2.act("startMode", { id: "zen" }) &&
        tanking2.state.tanks[0].fish.length === n
      );
    }),
  );
  await page.locator("#missionAction").focus();
  await page.keyboard.press("Enter");
  check(
    "keyboard purchase welcomes exactly one betta and changes guidance to feeding",
    await run(
      () =>
        tanking2.state.tanks[0].fish.length === 1 &&
        tanking2.state.tanks[0].fish[0].species === "betta" &&
        tanking2.state.mission.action === "feed",
    ),
  );
  check(
    "new keeper sees no full tool dock after the first purchase",
    !(await page.locator("#dock").isVisible()),
  );
  await mission();
  check(
    "first meal completes the first mission",
    await run(
      () =>
        tanking2.state.mission.complete &&
        tanking2.state.tanks[0].fish[0].fed > 0,
    ),
  );
  await mission();
  check(
    "claim opens a second tank with a newly unlocked affordable school",
    await run(
      () =>
        tanking2.state.chapter === 1 &&
        tanking2.state.tanks.length === 2 &&
        tanking2.state.activeTank === 1 &&
        tanking2.state.unlockedSpecies.includes("neon") &&
        tanking2.state.coins >= tanking2.SPECIES.neon.cost &&
        tanking2.state.tanks[0].fish.length === 1,
    ),
  );
  check(
    "second tank still shows only the guided care actions",
    !(await page.locator("#dock").isVisible()) &&
      !(await page.locator('[data-panel="adventures"]').isVisible()),
  );
  await page.locator('[data-tank="0"]').click();
  await mission();
  check(
    "mission purchases return to the correct story tank after visiting an earlier tank",
    await run(
      () =>
        tanking2.state.activeTank === 1 &&
        tanking2.state.tanks[1].fish.filter((f) => f.species === "neon")
          .length === 6 &&
        tanking2.state.tanks[0].fish.length === 1,
    ),
  );
  const before = await run(() => ({
    coins: tanking2.state.coins,
    age: tanking2.state.tanks[0].age,
    hunger: tanking2.state.tanks[0].fish[0].hunger,
  }));
  await step(5);
  check(
    "the prior aquarium continues aging, metabolizing and earning in the background",
    await run(() => ({
      coins: tanking2.state.coins,
      age: tanking2.state.tanks[0].age,
      hunger: tanking2.state.tanks[0].fish[0].hunger,
    })).then(
      (after) =>
        after.coins > before.coins &&
        after.age > before.age &&
        after.hunger > before.hunger,
    ),
  );
  await mission();
  await mission();
  check(
    "second meal earns plants, care and photography while collection and adventures stay locked",
    await run(
      () =>
        tanking2.state.chapter === 2 &&
        ["plant", "care", "photo"].every((id) =>
          tanking2.state.abilities.includes(id),
        ) &&
        !tanking2.state.abilities.includes("collection") &&
        !tanking2.state.abilities.includes("adventures"),
    ),
  );
  await page.locator("#settingsButton").click();
  await page.locator("[data-photo]").click();
  check(
    "earned photo mode hides the interface and reveals camera controls",
    await run(
      () =>
        tanking2.ui.photo &&
        document.getElementById("interface").hidden &&
        !document.getElementById("photoBar").hidden,
    ),
  );
  await page.locator("#photoNight").click();
  check(
    "photo moonlight toggle reaches the renderer",
    await run(() => tanking2.scene.night),
  );
  const photoDownload = page.waitForEvent("download");
  await page.locator("#takePhoto").click();
  check(
    "photo captures a downloadable PNG",
    (await photoDownload).suggestedFilename().endsWith(".png"),
  );
  await page.keyboard.press("Escape");
  check(
    "Escape leaves photo mode and restores the guide",
    await run(
      () => !tanking2.ui.photo && !document.getElementById("interface").hidden,
    ),
  );
  await mission();
  await step(31);
  await mission();
  check(
    "plant care unlocks the fish journal, new species and time controls",
    await run(
      () =>
        tanking2.state.chapter === 3 &&
        ["cory", "rasbora", "snail"].every((id) =>
          tanking2.state.unlockedSpecies.includes(id),
        ) &&
        tanking2.state.abilities.includes("speed"),
    ),
  );
  await page.locator('[data-panel="species"]').click();
  check(
    "collection offers discovered inhabitants and only a teaser for future species",
    (await page.locator("[data-buy]").count()) === 5 &&
      !(await page.locator('[data-buy="lionfish"]').count()),
  );
  await page.locator("#closeDrawer").click();
  await mission();
  await step(41);
  await mission();
  check(
    "the first community earns a real three-way permanent trait choice",
    (await run(
      () => tanking2.state.chapter === 4 && tanking2.state.choices.length === 3,
    )) && (await page.locator("#choiceDialog").isVisible()),
  );
  const trait = await page
    .locator("[data-choice]")
    .first()
    .getAttribute("data-choice");
  await page.locator("[data-choice]").first().click();
  check(
    "choosing a trait retains exactly that upgrade and closes the choice",
    (await run(() => tanking2.state.relics).then((ids) =>
      ids.includes(trait),
    )) && !(await page.locator("#choiceDialog").isVisible()),
  );
  await mission();
  await step(91);
  await mission();
  check(
    "five completed missions unlock expeditions after an installed autofeeder",
    (await run(
      () =>
        tanking2.state.chapter === 5 &&
        tanking2.state.tanks.some((t) => t.autofeeder) &&
        tanking2.state.modes.length === 1 &&
        tanking2.state.modes[0] === "draft",
    )) && (await page.locator('[data-panel="adventures"]').isVisible()),
  );
  await page.locator("#settingsButton").click();
  await page.locator('[data-speed="0"]').click();
  let time = await run(() => tanking2.state.time);
  await page.waitForTimeout(350);
  check(
    "earned pause freezes simulation",
    (await run(() => tanking2.state.time)) === time,
  );
  await page.locator('[data-speed="3"]').click();
  check(
    "earned 3x advances three simulation seconds per second",
    await run(() => {
      const before = tanking2.state.time;
      tanking2.step(1);
      return tanking2.state.speed === 3 && tanking2.state.time >= before + 2.75;
    }),
  );
  await page.locator('[data-speed="1"]').click();
  await page.locator("#closeDrawer").click();
  await page.locator('[data-panel="journal"]').click();
  await page.locator("[data-follow]").first().click();
  check(
    "journal following starts a close view of an individual living fish",
    (await run(
      () =>
        tanking2.scene.followed !== null &&
        tanking2.ui.followId === tanking2.scene.followed,
    )) && (await page.locator("#followCard").isVisible()),
  );
  await page.locator("#unfollow").click();
  await page.waitForTimeout(500);
  const point = await run(() => {
    const scene = tanking2.scene;
    return [...scene.animals.values()]
      .map((f) => {
        const p = f.position.clone().project(scene.camera);
        return {
          uid: f.uid,
          x: ((p.x + 1) * innerWidth) / 2,
          y: ((1 - p.y) * innerHeight) / 2,
        };
      })
      .find((p) => p.x > 380 && p.x < 1200 && p.y > 200 && p.y < 650);
  });
  assert.ok(point, "a fish is visible inside the unoccluded scene");
  await page.mouse.click(point.x, point.y);
  check(
    "clicking an actual rendered fish starts cinematic following",
    await run(() => tanking2.scene.followed !== null),
  );
  await page.locator("#unfollow").click();
  await page.locator("#soundButton").click();
  check(
    "audio can be enabled by a user gesture",
    (await page.locator("#soundButton").getAttribute("aria-label")).includes(
      "off",
    ),
  );
  await page.locator("#soundButton").click();
  const saved = await run(() => {
    tanking2.save();
    return {
      chapter: tanking2.state.chapter,
      active: tanking2.state.activeTank,
      fish: tanking2.state.tanks.map((t) => t.fish.length),
      relics: tanking2.state.relics,
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.tanking2?.metrics.drawCalls > 5);
  await page.locator("#loading").waitFor({ state: "detached" });
  check(
    "reload restores inhabited worlds, selected tank, chapter and earned trait",
    JSON.stringify(
      await run(() => ({
        chapter: tanking2.state.chapter,
        active: tanking2.state.activeTank,
        fish: tanking2.state.tanks.map((t) => t.fish.length),
        relics: tanking2.state.relics,
      })),
    ) === JSON.stringify(saved),
  );
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1440, height: 960 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(180);
    bounds.push({ ...(await inBounds()), panel: "gallery" });
    await page.locator('[data-panel="species"]').click();
    await page.waitForTimeout(350);
    bounds.push({ ...(await inBounds()), panel: "collection" });
    await page.locator("#closeDrawer").click();
  }
  check(
    "gallery and collection controls fit five desktop, portrait and landscape viewports",
    bounds.every((b) => !b.overflow && !b.clipped.length),
  );
  await page.locator('[data-panel="species"]').click();
  await page.locator('[data-buy="snail"]').focus();
  await page.waitForTimeout(2200);
  check(
    "live earnings do not steal keyboard focus from a purchase",
    await run(() => document.activeElement?.dataset.buy === "snail"),
  );
  await page.locator("#closeDrawer").focus();
  await page.keyboard.press("Shift+Tab");
  check(
    "keyboard navigation remains within the open drawer",
    await run(() =>
      document.getElementById("drawer").contains(document.activeElement),
    ),
  );
  await page.keyboard.press("Escape");
  check(
    "Escape closes the drawer and restores an interactive focus",
    !(await page.locator("#drawer").isVisible()) &&
      (await run(() => document.activeElement?.dataset.panel === "species")),
  );
  const homeIds = await run(() => tanking2.state.tanks.map((t) => t.id));
  await mission();
  check(
    "earned expedition opens a temporary aquarium with three species choices",
    await run(
      () =>
        tanking2.state.mode?.id === "draft" &&
        tanking2.state.mode.choices.length === 3 &&
        tanking2.state.tanks.at(-1).temporary,
    ),
  );
  await step(8);
  check(
    "expedition reading time does not consume its clock",
    await run(() => tanking2.state.mode.time === 0),
  );
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(400);
    const b = { ...(await inBounds()), panel: "draft" };
    bounds.push(b);
    check(
      `draft layout fits ${size.width} by ${size.height}`,
      !b.overflow &&
        !b.clipped.length &&
        !(await page.locator("#mission").isVisible()),
    );
    await page
      .locator('#modeBanner [data-action="endMode"]')
      .scrollIntoViewIfNeeded();
    check(
      `return from draft is reachable at ${size.width} by ${size.height}`,
      await page
        .locator('#modeBanner [data-action="endMode"]')
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            el ===
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          );
        }),
    );
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  for (let round = 0; round < 3; round++) {
    await page.locator("#modeBanner [data-draft]").first().click();
    await step(41);
  }
  check(
    "three gameplay draft choices lead to a completed scored expedition",
    (await run(
      () => tanking2.state.mode.complete && tanking2.state.mode.score.total > 0,
    )) && (await page.locator("#reportDialog").isVisible()),
  );
  await page.locator("#reportClose").click();
  check(
    "report returns rewards home while retaining every original aquarium",
    await run(() => ({
      mode: tanking2.state.mode,
      ids: tanking2.state.tanks.map((t) => t.id),
      wins: tanking2.state.stats.completedModes.draft,
      pearls: tanking2.state.pearls,
    })).then(
      (s) =>
        s.mode === null &&
        JSON.stringify(s.ids) === JSON.stringify(homeIds) &&
        s.wins === 1 &&
        s.pearls > 0,
    ),
  );
  const offline = await run(() => {
    const save = tanking2.exportState(),
      before = save.coins;
    save.savedAt = Date.now() - 60 * 60 * 1000;
    tanking2.load(save);
    return {
      before,
      after: tanking2.state.coins,
      seconds: tanking2.state.offline?.seconds,
      fish: tanking2.state.tanks.flatMap((t) => t.fish).length,
    };
  });
  await page.locator("#reportDialog").waitFor({ state: "visible" });
  check(
    "returning after an hour shows caretaker earnings and keeps the inhabitants",
    offline.after > offline.before &&
      offline.seconds > 3599 &&
      offline.fish === 11 &&
      (await page.locator("#reportTitle").textContent()).includes(
        "Welcome back",
      ),
  );
  await page.locator("#reportClose").click();
  check(
    "offline report closes cleanly",
    !(await page.locator("#reportDialog").isVisible()),
  );
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  watch(mobile);
  await boot(mobile);
  await mobile.locator("#missionAction").tap();
  await mobile.locator("#missionAction").tap();
  await mobile.locator("#missionAction").tap();
  await mobile.locator("#missionAction").tap();
  check(
    "touch onboarding buys, feeds, expands, then welcomes the second school",
    await mobile.evaluate(
      () =>
        tanking2.state.chapter === 1 &&
        tanking2.state.tanks[0].fish.length === 1 &&
        tanking2.state.tanks[1].fish.length === 6,
    ),
  );
  await mobile.close();
  check(
    "no JavaScript, WebGL shader or HTTP asset errors",
    errors.length === 0,
  );
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks,
        bounds,
        metrics: await run(() => tanking2.metrics),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("ERRORS", errors);
  console.error("BOUNDS", bounds);
  await page.screenshot({ path: "/private/tmp/tanking2-browser-failure.png" });
  throw error;
} finally {
  await browser.close();
}
