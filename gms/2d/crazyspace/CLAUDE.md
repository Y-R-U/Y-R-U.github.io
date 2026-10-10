# Crazy Space — notes for agents

Single-player Subspace-style arena shooter. Vanilla ES modules + Canvas 2D, no build step.
All balance data lives in `js/config.js`. Live on GitHub Pages and games.br8t.com.

## Hangar (permanent upgrades) — added 2026-10-10

- Credits are paid once per FINISHED match on the results screen (`main.js showResults`, same
  place as `recordMatch`). Formula: `CREDITS` in config, `creditsFor()` in `js/hangar.js`.
- Save key `crazyspace.hangar.v1` `{v, credits, lifetimeCredits, levels}`; sanitised on load
  (levels clamped 0..8, credits ≥ 0, unknown keys carried forward). Synced via `cloud.js` KEYS.
- 8 upgrades × 8 levels (`UPGRADES`, `HEADSTART`, `AIM_ASSIST`, `UPGRADE_COST` in config).
  Effects reach the player only: `Game({ upgrades })` → `Ship.upg`. Bots never get them.
- Effect curves are deliberately back-loaded: the stats multiply together, so even mid-level
  values compound fast (an early tune gave K/D 8 at half levels).
- `?noupg` flies without upgrades (levels stay saved). Test hooks: `__crazyspace.setHangar({levels, credits})`,
  `__crazyspace.hangar()`, `__crazyspace.audio`.
- New players default to Rookie (`settingsDefaults().lastDiff`); a saved choice wins via mergeForward.

## Magnet (2026-10-10)

Player-only green magnet (Aaron: picking greens up exactly is the hardest part on a phone). Pull range is the
9th upgrade `magnet` (`eff` = px). Aaron's numbers: level 0 = 35 px base that every player gets, even with
`?noupg` (contact alone is ~24 px); +14 px a level, so L8 = 147 px ≈ 2.1× the original 70 px base. The first
70→350 px version made greens far too easy (he won 30 to 20 at the base level).
Pull speed `MAGNET_PULL` 240→720 px/s, edge to contact, in `Game._updatePrizes`; a green never gets pulled into a
wall. Cost ×0.6 (`UPGRADE_COST_MULT`), so max-everything rose by about 5.6k credits. Bots don't get it.

## Balance harness

`node tools/upgradegate.mjs --seeds 12 --gate` runs the real Game/Ship/Bot modules in node
(DOM stubbed, render never called). The human is a `HumanPilot` (Bot subclass: aims where
targets were 0.25s ago with no lead, sprays fire regardless of energy). `--botpilot` uses the
plain Bot. Other flags: `--falsify` (max levels bought, upgrades forced off), `--career`
(earn and buy from zero, counts matches to max), `--ablate --level N`, `--rookie`.

## Difficulty (2026-10-10, second pass)

`DIFFICULTY` in config: Rookie ×1.0, Veteran ×1.25, Ace hull ×1.5 / firepower ×1.75 (raised from ×1.5 to offset the magnet) for **bots only** (`Game.botScale` → `Ship.hullK/fireK`).
"Hull" scales max energy AND recharge. Energy is health and ammo, so a bigger tank refills in the same time;
gun and bomb costs are unscaled, so firepower is never throttled. "Firepower" scales bullet, bomb, mine and burst
damage. Aim skill (0.4 / 0.62 / 0.85) is unchanged. The picker shows the buff in words. Credit multipliers are
rookie ×0.8, veteran ×1.0, ace ×1.5 (Ace was ×1.3 before the buff).
`--nobuff` in the harness reproduces the unscaled bots for comparison.

## Grind

`UPGRADE_COST = [0, 20, 30, 40, 50, 65, 1300, 2600, 5200]`. Levels 1–5 are quick; 6–8 are the long grind.
Max everything costs 77,235 credits. Harness career runs (greedy cheapest-first): all L4 ≈ 20 matches / 0.8 h,
all L6 ≈ 120 / 4.6 h, all L8 ≈ 560 matches / 18 h on Veteran (Rookie ≈ 630 / 18 h, Ace ≈ 420 / 14.6 h).
Late matches are short (~2 min) because a near-max player hits the frag limit fast, so match counts run above "hours × 15".

## Balance numbers (HumanPilot skill 0.5, 12 seeds, ships rotated)

Deathmatch K/D (win%), with buffs:

| | none | L4 | L6 | L8 |
|---|---|---|---|---|
| Rookie | 0.50 (0) | 1.51 (17) | 6.5 (83) | 22 (100) |
| Veteran | 0.14 (0) | 0.63 (0) | 3.7 (67) | 10.6 (100) |
| Ace | 0.08 (0) | 0.34 (0) | 1.5 (33) | 7.2 (100) |

Team: Veteran 0.21 / 0.63 / 1.85 / 5.6; Ace 0.07 / 0.29 / 0.96 / 3.7 (92% win at max).
High K/D values are noisy, since one or two deaths swing them: the same Veteran-max cell read 10.6 in one run and
17.2 in another. Global ship ids make results depend on run order.

## UI proof

`tools/uiproof.mjs` (raw CDP, real touch events): every screen at 390×844 and 375×667, header/footer
controls inside the viewport and uncovered, no sideways overflow, Hangar buy, results credits,
Upgrade→Rematch, `?noupg`, audio unlock. Both checks have falsifiers (unpinned footer, touchstart activation).
Run it with an http server on the site root, port 8771, and `~/.claude/bin/cdp start --port 9241 -- --use-angle=metal`.

## Layout rule (Aaron)

Every menu screen is header / scrolling body / fixed footer (`screen()` in menu.js). Primary actions
and navigation stay in the header or footer, never at the bottom of the scrolling content.

## Audio

Unlocks on `pointerup`/`touchend`/`click`/`keydown`, listeners kept for the page lifetime. Android
Chrome does not count a touch `pointerdown`/`touchstart` as user activation. Before 2026-10-10 the
context was created by a once-only pointerdown and the only "resume" listener was also pointerdown,
so the one activation-time resume was the LAUNCH click; any later suspension (screen lock, app
switch) never recovered. Not confirmed on Aaron's phone. Headless Chrome runs audio without a
gesture, so `uiproof.mjs` checks `navigator.userActivation` instead of ctx.state.
`navigator.audioSession.type = 'playback'` is set before the context is created (iOS silent switch).
