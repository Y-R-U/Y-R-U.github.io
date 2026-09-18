# Enhancement verification — 2026-09-15

## Artisan milestone — schema 4

- `node --test tests/*.test.mjs`: **29/29 passed**. Adds version 3-to-4 migration, recipe shortages/atomic ingredient spending, five bounded temper tiers, tool purchases, Cooking heat control, Smithing timing and buy/craft/sell economy checks.
- `tests/artisans.mjs`: **8 grouped checks passed** with actual touch heat control and keyboard anvil timing. Manual Cooking/Smithing wait between queued actions; level-5 mastery unlocks automatic batches that stop at the exact quantity; Cooking upgrades stored food; tempering applies a permanent blade bonus; purchased tools appear while gathering; ranks/tools/temper survive reload; seven-skill details fit 320x568 and 390x844. No browser/asset errors. Island scene: **338 draw calls / 198,919 triangles**.
- `tests/professions.mjs`: all **10 groups passed again** with the shared artisan UI and tool rendering. Mainland scene: **298 draw calls / 199,909 triangles**; no browser/asset errors.
- `tests/interactions.mjs`: all **10 groups passed again**, updated to use the kitchen recipe button for cooking.
- `tests/browser.mjs`: all **21 groups passed again**, including the complete narrated chapter, crossings, four viewport sizes and save/resume. Final mainland scene: **316 draw calls / 202,526 triangles**; no browser/asset errors.
- `tests/release.mjs` verified the first skilling release (`bed969b2`, schema 3) on **https://yru.br8t.com/gms/3d/emberwake/**: public assets, shop purchase, manual fishing and real world rendering (**322 draw calls / 198,047 triangles**), no errors. Artisan public verification follows its push.

## First skilling milestone

- `node --test tests/*.test.mjs`: **19/19 passed**. Save migration, progression, food, quest gates, mastery thresholds, duplicate reward prevention, challenge success/failure, gathering yield and atomic shop transactions.
- `tests/professions.mjs`: **10 grouped checks passed**. A manual catch crosses into level 5 without repeating; real mouse hold/release wins fishing mastery and starts automatic catches; menus pause work; movement and Stop cancel; mastery persists through reload; island trading uses mastery prices. Chrome touch events verify hold/release, snapped lines and retry. Keyboard timing wins woodcutting; touch weak points win mining. Mainland trading and activity bounds pass at 320/390/768 pixels. No JavaScript, console or HTTP errors. Mainland scene: **296 draw calls / 199,885 triangles**.
- `tests/interactions.mjs`: **10 grouped checks passed**. Touch movement, panel behavior, 320px skill contents, lightweight rendering, boss dodge, defeat recovery, fishing, cooking and baseline food healing. No browser errors.
- `tests/browser.mjs`: **21 grouped checks passed**. Real chapter playthrough from character creation through lab escape, island gathering/forging/weapon training/combat, beacon crossing, three mainland missions, journal, save/resume and return travel. Bounds passed at 320, 390, 768 and 1440 pixels. No JavaScript/shader/HTTP errors. Final mainland scene: **312 draw calls / 202,478 triangles**.
- Syntax checks and `git diff --check` passed.

Browsers: installed Google Chrome, headless with Metal/WebGL enabled. Local server: `http://127.0.0.1:8888/`. New mastery tests use saved fixtures close to level thresholds so they can check the unlock path without grinding all preceding levels; the full chapter test starts from character creation.

## Evidence

Screenshots are under `docs/verification/`: fishing mastery, automatic mining on mobile and the mainland shop on mobile. Additional artisan screenshots show Cooking mastery, Smithing mastery and the kitchen recipe screen. They are review evidence, not the site's public project thumbnail.

## Remaining checks

- Physical phone performance and feel.
- Extended economy/level pacing playtest from a fresh journey (roughly 25 manual fish catches, 34 woodcutting actions or 29 mining actions to level 5 at the current XP rates).
- Artisan public deployment verification is pending its push. The first skilling milestone is already committed, pushed and verified live.
- `tests/expansion.mjs` and `tests/speech.mjs` were not rerun for this milestone. The chapter/interaction suites cover the affected core flows; narration assets and story content were not changed.

## Reproduce

From this directory, with the site root served on port 8888:

```sh
node --test tests/*.test.mjs
export PLAYWRIGHT_MODULE=/private/tmp/tanking-tools/node_modules/playwright
export EMBERWAKE_URL=http://127.0.0.1:8888/gms/3d/emberwake/
node tests/professions.mjs
node tests/artisans.mjs
node tests/interactions.mjs
node tests/browser.mjs
# After deployment:
EMBERWAKE_URL=https://yru.br8t.com/gms/3d/emberwake/ node tests/release.mjs
```

The Playwright path is a local dependency outside this repo and may disappear when temporary files are cleaned. Any installed Playwright module can be supplied instead. Browser scripts require permission to launch Chrome/access the local server in restricted environments.
