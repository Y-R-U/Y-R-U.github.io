# Emberwake enhancement checklist

Last updated: 2026-09-15. This file is the continuation handoff; update it as work lands.

## Design decisions

- Levels 1–4 are manual: one resource action per tap. The first mastery challenge at level 5 earns automatic work for that skill; later challenges improve rewards. Tap a resource once to work automatically after this unlock. Movement, dodge, combat, travel, and Stop end the activity. Menus and hidden tabs pause it. No offline rewards.
- Skill levels come from XP. Mastery is a separate permanent rank, earned through a challenge at levels 5, 10, 15, etc. Missed ranks remain available; failures are free to retry.
- Fishing mastery improves the healing and sale value of all stored and future fish. Item stacks stay simple; no obsolete fish grades clutter the bag.
- Shops use coins, show buy/sell prices and quantities, and never trade story items. Existing journeys must migrate without losing progress.
- Keep touch controls usable on small phones and preserve the narrated chapter.

## 1. Automatic work and economy (released)

- [x] Add save migration for mastery and coins; validate new fields.
- [x] Manual fishing, woodcutting and mining; level 5 mastery unlocks automatic work per skill, with progress display and Stop control.
- [x] Pause/cancel correctly for movement, combat, menus, background tabs and travel.
- [x] Fishing challenge: hold to reel, release to ease tension; snapping/escape fail safely; higher levels help.
- [x] Woodcutting challenge: time cuts in the sweet spot.
- [x] Mining challenge: strike changing weak points.
- [x] Glowing mastery opportunity every five levels; show rank, benefit and next unlock in skill details.
- [x] Apply mastery to existing/future fish healing and sale prices; improve gathered resource value/yield.
- [x] Island supply stall and mainland merchant: buy/sell supplies and food, visible coins.
- [x] Automated state/challenge tests, desktop/touch browser checks and screenshots.
- [x] Record exact verification results and continuation instructions below.

## 2. Complete the artisan loop (current milestone)

- [x] Introduce Cooking XP with manual early levels and earned automatic batch cooking and a temperature-control mastery challenge.
- [x] Repeatable Smithing recipes, earned automatic crafting, an anvil timing challenge, and permanent equipment upgrades.
- [x] Buyable tool upgrades that change gathering speed and appearance.
- [x] Add recipe previews, ingredient shortages and craft quantities.
- [ ] Balance time to level 5/10/15 and prices through a normal early-game playthrough.

- [ ] Extend earned automation to Melee/Magic training; review how the unlock should interact with existing repeated combat attacks.

## 3. Give progression a purpose

- [ ] Merchant requests with clear rewards and saved completion state.
- [ ] New fishing pools, trees and mineral veins gated by levels/mastery.
- [ ] Rare catches and resource discoveries; collection page in the journal.
- [ ] Gear choices, new enemy encounters and a use for surplus artisan goods.
- [ ] Next story mission beyond the sealed northern road.

## 4. Presentation and release

- [ ] Fishing rod/line, chopping and pickaxe animations; visible tool upgrades.
- [ ] Richer water/ripples, wildlife and time-of-day ambience.
- [ ] Sound and optional short tutorial narration for mastery/trading.
- [ ] Accessibility pass: reduced motion, keyboard challenges, readable feedback.
- [ ] Physical phone performance/playability rehearsal.
- [ ] Refresh project description/screenshot, then publish and smoke-test the public URL when release is requested.

## Continuation

Read this file, README.md, and the nearest AGENTS.md before continuing. Work is limited to this game directory; the repository has many unrelated modified/staged files.

Current implementation: **Milestone 1 committed/pushed as bed969b2 and verified on https://yru.br8t.com/gms/3d/emberwake/** (public shop purchase, manual fishing, clean WebGL/assets). **Milestone 2 artisan changes implemented and verified locally; commit/push/public verification next.** State tests pass 29/29. User expects tested work to be committed/pushed as progress continues.

Next work: commit/push the artisan batch and verify the public version 4 game. Then review level/price pacing, add merchant requests and resource unlocks, and continue the remaining checklist. Cooking/Smithing now use earned auto at level 5; combat still uses its original repeated attacks until its separate checklist item is addressed.

New modules: `professions.mjs` contains pure rules and challenge simulations; `professions-ui.js` contains activity/modal/input handling. `main.js` stops work on movement/damage/dodge/travel, pauses it through `paused()`, and awards quest progression after gathering or buying materials. Saved activity/challenge timers are intentionally absent. Ranks 1–20 unlock at levels 5–100.

Known balance choice: rank 1 gives automation plus a reward improvement; wood/mining extra yield starts at rank 2. Fishing/woodcutting challenges get easier when overlevelled. Mining currently uses a fixed 30-second weak-point game; later ranks reuse these mechanics. Combat retains its original repeat attacks until its checklist item is addressed.

Commands from this directory:

```sh
node --test tests/*.test.mjs
export PLAYWRIGHT_MODULE=/private/tmp/tanking-tools/node_modules/playwright
export EMBERWAKE_URL=http://127.0.0.1:8888/gms/3d/emberwake/
node tests/professions.mjs
node tests/artisans.mjs
node tests/interactions.mjs
node tests/browser.mjs
```

Serve `/Users/aaronair/cc/yru/site` over HTTP. Browser scripts use Playwright and installed Google Chrome; set PLAYWRIGHT_MODULE if the dependency is outside the project. Never call a pushed commit a verified public release.
