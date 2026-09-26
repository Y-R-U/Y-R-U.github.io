# finisher notes

Owns: `js/sim/*`, `js/data/*`, `tools/sim/*`, `js/ui/*`, `css/*`, `tools/ui_kit.html`, this file.
Picked up from `docs/notes/systems.md` and `docs/notes/ui.md`. Both jobs are finished.

## DONE — systems
- `tools/sim/balance.mjs` finished: the bot travels to the best district, buys frames, Mk tiers and tunes, spends when rich (broker, Sal's Special, homes, paints, stash), climbs Overclock at 60. It also has a `--rotate` variant that plays the spare frames one contract in four, plus a death log, an xp/min×L column and the average-gear TTK table.
- Tuning (all marked `// sim:` in the data files):
  - `BALANCE.enemyHp` ramps enemy HP from ×1.15 at L1 to ×1.5 at L5+. `r_baton` base 9 → 11. Grunt TTK with average gear was ~1.0 s.
  - Pack `pts` raised: warden 1.5, rustkin 1.8, saboteur 2, lancer 2.5, hull_wight 2.2, choir_angel 3.5, gilded_guard 4. choir_angel was 1, so the budget filler built packs of 10 angels.
  - Kill XP × sqrt(unit pts). Tough late units paid grunt XP, so XP/min fell from 22×L to 10×L after L35.
  - gilded_guard dmg 30 → 24, sovereign_construct 40 → 34. The Helm was a 25% contract-fail wall at L45-50.
- New sim API (add-only): `buyHome/setHome/homes()`, `buyPaint/setPaint/paintsList()`, `buyMaterial(id,n)/brokerPrice(id,n)`.
  - The broker (`MATERIAL_BROKER`) is the endless credit sink. It unlocks at L15 and its price rises within a shift.
  - Overclock now unlocks: L60 gives 1, and an Elite clear at n gives n+1 (`overclock:unlock`).
  - `nextGoal` falls back to stash/homes/paints, so the goal chip is never empty.
- Save v2: migration 1→2 adds `homesOwned` and ensures `overclock`.
- `tools/sim/test.mjs`: 15 tests green in ~1.5 s (`--quick` ~0.5 s). I broke the Overclock unlock and the story advance on purpose, and the suite caught both (falsified).
- `js/sim/README.md`: the full API, covering queries, actions, events, the runner contract, the modules and a Changes list.

## DONE — UI
- Already there from the ui agent: 7 rarities, `ui.detect/lens/boss/band/sting`, a full `tools/ui_kit.html`.
- Dialogue:
  - `ui.dialogue.setVoice(fn)` plus a per-line `voiceKey`. The caller plays `audio.vo(key)` and returns a duration, and typing syncs to it. A bare `voiceDuration` also works.
  - Events `dialogue:line` and `dialogue:end`.
- Settings: Master and Ambience sliders, a `volumes` event (`{master,music,sfx,vo,ambient}` → `audio.setVolumes`) and `ui.settings.volumes()`.
- HUD accepts `sim.hud()` as-is:
  - The goal can be an object, with a progress line.
  - The tracker stays hidden until a mission has a title or objective. This caused the empty tracker in mgr/game.png.
  - Skills start empty, which removes the phantom heir button.
  - The empty name chip is hidden, and so is the energy bar when its max is 0.
  - The frame chip reads "Brawler · Mk II".
  - The attack glyph defaults per frame kind until `setAttack` is called.
  - The goal chip wraps to 2 lines.
- Top overlays:
  - Boss bar and tail band get dark legibility plates, and the band is narrowed so it clears the menu.
  - Toasts stay inside the gap between the vitals and the menu.
  - Off-screen detection pips stay out of the HUD corners.
- Touch targets: seg buttons, tabs, stash filters, loot EQUIP, Accept and header buttons are ≥44 px, or padded with `::after` hit areas.
- Panels, results and death screens scale up on big screens (`--ps` = min(W/960, H/460), clamped 1..1.6). Dialogue text is bigger at ≥1100×600.
- Contracts:
  - Cards show the blurb (`desc`) and `target`, with 1 line on phones, hidden on crowded cards, and up to 4 lines on desktop.
  - The threats list accepts plain strings.
  - The loadout header wraps instead of truncating FR.
- `ui_adapt` now emits the UI README shapes: item `fr/tune/tuneMax/tuneCost/tuneChance/salvage/isNew/better`; contract `suits/badge`, `bonus:null` (it used to render "+NaN bonus"), site names for `location`; board `threats` objects; warehouse `mk/mkMax/mkCost/slotsAllowed/shop/invMax`; materials with both key sets. New `toUiCodex(game)`; `portrait('rental')` works.
- Screenshots: 33 states at each size, in `scratchpad/finisher/final_915x412/` and `final_1280x720/`, each folder with an `audit.json`. There are 0 console errors. The only off-screen elements are the scroll carousels (contracts, frames) and the codex tree. The driver is `scratchpad/finisher/kitshots.mjs`, and `gshot.mjs` screenshots the real game.

## For the integrator (not my files)
- `js/game/overlay.js` bark subtitles (e.g. HIRA's "Tip! Drag the left side…") render under the dialogue letterbox and show through it. Hide them while `ui.dialogue.open`, or on `dialogue:line` / `dialogue:end`.
- Optional: `ui.dialogue.setVoice(k => { audio.vo(k); return audio.voInfo(k)?.duration; })` + `voiceKey` on lines; `ui.on('volumes', v => audio.setVolumes(v))` and `audio.setVolumes(ui.settings.volumes())` at boot; `ui.on('dialogue:end', () => audio.stopVo())`.
- `toUiCodex(game)` for the codex panel.

## Balance curves (seeds 1-4, Tense, one main frame)
| milestone | target | sim |
|---|---|---|
| first frame | 30-45 min (brief 45-75) | 47-56 min |
| second / third frame | 3-4 h / 7-9 h | 3.2-3.7 h / 6.0-8.3 h |
| first Relic | 3-5 h | 3.3-6.1 h |
| L20 / L30 / L40 | 5.5 / 11.3 / 19.1 h | 4.5-5.1 / 8.7-9.5 / 15.7-17.6 h |
| L50 / L60 | 28-32 / ~40 h | 26.9-31.0 / 42.3-47.1 h |
- Income tracks 2,300-5,000 × L per hour through L60. Overclock income is ~1-1.6 M/h at L60, which is ECONOMY's own multiplier.
- Without the broker, a one-frame player banks 4-14 M by 60 h with nothing to buy. With it, spare credits stay under ~1.5 M.
- Grunt TTK at average gear (Tuned +3, Mk I), by frame:
  - rental 2.8 s
  - gunner 1.7 s
  - ghost 1.4 s
  - brawler 1.2 s: its 3-hit combo quantises, so it sits under the 1.5 s floor. Accepted.
- Remaining deaths are mostly Overclock pushes and the act 5-6 districts. The contract-fail rate is ~10%.

## Gotchas
- The bot must `travel()` to the newest district. Otherwise contract levels cap at district maxLvl+5 and XP stalls after L30.
- `overclock.unlocked` was never incremented before this change.
- In the rarity-distribution test, custom items at L1-2 are legal: ECONOMY's band gives 2%, even though DESIGN says "lvl 3+".
- `--ps` scales `.hf-panel` and the complete/death screens with a transform on a virtual page. Don't use `vw`/`vh` inside panels.
