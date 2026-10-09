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

## Balance harness

`node tools/upgradegate.mjs --seeds 12 --gate` runs the real Game/Ship/Bot modules in node
(DOM stubbed, render never called). The human is a `HumanPilot` (Bot subclass: aims where
targets were 0.25s ago with no lead, sprays fire regardless of energy). `--botpilot` uses the
plain Bot. Other flags: `--falsify` (max levels bought, upgrades forced off), `--career`
(earn and buy from zero, counts matches to max), `--ablate --level N`, `--rookie`.

Numbers at commit (12 seeds, ships rotated, HumanPilot skill 0.5):

| Veteran DM | K/D | win |   | Veteran Team | K/D | win |
|---|---|---|---|---|---|---|
| none | 0.43 | 0% | | none | 0.55 | 42% |
| half (L4) | 1.49 | 25% | | half | 1.05 | 42% |
| max (L8) | 36 | 100% | | max | 13.8 | 100% |
| Ace, max | 24 | 100% | | Ace, max | 11.6 | 100% |

Bots average K/D ≈ 1.09. Forced-off max ≈ none (0.39 vs 0.43). Career to full: ~36 matches on Veteran, ~46 on Rookie.
Caveat: Rookie/Veteran/Ace "none" K/D are nearly identical for this pilot. Bot skill only changes aim jitter
and fire cadence, so the difficulty presets are weaker levers than their names suggest.

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
