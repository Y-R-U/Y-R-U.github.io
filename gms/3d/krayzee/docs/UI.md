# UI lane

Files: `js/ui/*.js`, `js/ui/fonts/` (Instrument Serif, OFL, vendored from `/br8t/fonts/`), `css/ui.css`, `tools/ui.html`.
Everything is injected from JS: `initUI()` adds `<link id="kz-ui-css" href="css/ui.css">` itself and one root `#kz-ui`
(fixed, `z-index: 30`, `pointer-events: none` except on visible screens and popups).

| file | what |
|---|---|
| `index.js` | the contract API + state machine (`loading` → `menu` ⇄ `game`) |
| `loading.js` | crest, wordmark, tagline, progress ribbon, rotating quips; fades out on `showMenu()` |
| `menu.js` | translucent menu over FLIGHT's attract scene (portrait: title top / buttons bottom; landscape: left column) |
| `profile.js` + `preview.js` | pilot creator / Hangar with a live turntable (own small `WebGLRenderer`, `createPlane` from `js/plane`) |
| `settings.js` | pause-style settings popup; Resume / Quit in game, Done on the menu |
| `popup.js`, `dom.js` | popup shell, toast, icons, crest SVG, sound sink |
| `store.js` | `krayzee.profile` / `krayzee.settings` in localStorage (try/catch), validation, registration suggestion |
| `career.js` | career instance (`setCareer` shared or a fresh `loadCareer()` per read), `rankProgress`, cloud `describeCareer` |
| `ranks.js` | re-exports `RANKS` from `data/ranks.js` (DESIGN) + `titleFor(gender, rankIndex)` |
| `voices.js` | the 15 pilot ids; names/blurbs are replaced by `data/voices.json` when it loads |
| `account.js` | br8t account layer |

## API (contract + additive extras)
```js
initUI({ onPlay(mode), onSettings(settings), onProfile(profile),      // contract
         onResume(), onQuit(), onSound(kind), career })               // extras, all optional
setLoading(fraction, label)   showMenu()   enterGameplay()   openSettings()
getProfile()  // { name, title, gender, company, primary, secondary, accent, voice, registration, rank, display, flightTitle, rankTitle }
getSettings() // { view, views, quality:'auto'|'low'|'medium'|'high', sfx, voice, music (0..1), invertPitch, stickRight, hand:'left'|'right', units:'aviation'|'metric', v }
getLivery()   // { name, company, primary, secondary, accent, registration } — straight into plane.setLivery
openProfile({ first })   toast(title, text, ms)   getUIState()  // { state, settings, profile, firstRun }
setCareer(career)   refreshProfile()   getRankProgress()  // { rankIndex, rankTitle, title, pp, next:{title, ppNeeded, frac, wins, winsNeeded, winsMax, emperor, text} | null }
```
- `initUI` shows the loading screen immediately. `showMenu()` crossfades it away (0.9 s) and, on first run (no saved
  profile), opens the creator ~1 s later. Free Flight with no profile also opens the creator first, then plays.
- Free Flight calls `enterGameplay()` itself and then `hooks.onPlay('free')`. Story/Online show a "coming soon" toast.
- `openSettings()` during play shows Resume + Quit to menu. Closing (Resume, ✕, backdrop, Escape) fires `onResume`;
  Quit fires `onQuit` after `showMenu()`. Escape in play opens settings.
- `onSettings(s)` fires on every change, including while a volume slider is dragged (persisted on release).
- `onSound(kind)`: `'click'|'toggle'|'confirm'|'back'|'error'` — matches `audio.playUI()`.
- `?lite=1` makes `getSettings().quality` report `'low'` without persisting it.
- Rank comes from the career (`js/game/career.js`), not the profile: `rank` = `career.rankIndex`; `title` =
  `displayTitle({context:'menu'})` (chosen title only once story is complete, D3); `flightTitle` =
  `displayTitle({context:'free'})` — use that for radio/subtitles in Free Flight; `rankTitle` = the real rank.
  `krayzee.profile` no longer stores `rank`.
- Pass the live career: `initUI({ career })` or `ui.setCareer(career)`. Without it UI reads a fresh `loadCareer()` each
  time, and a title pick saves through that copy — any other long-lived instance would then overwrite it on its next save.
  Call `ui.refreshProfile()` after a rank-up if the menu is visible (showMenu() refreshes anyway).
- Picking a title fires `onProfile(getProfile())` so the radio title can update.

## Settings keys (FLIGHT reads these)
| key | values | default | meaning |
|---|---|---|---|
| `quality` | `'auto'\|'low'\|'medium'\|'high'` | `'auto'` | D6: auto = boot low, step up adaptively; others force a tier. `?lite=1` reports `'low'` and never persists it (buttons disabled) |
| `invertPitch` | bool | `false` | D9: **false = stick DOWN → nose UP** (aviator default). true flips it (stick down → nose down). Keyboard: same rule for ArrowDown/S |
| `stickRight` | bool | `false` | D10: false = virtual stick on the LEFT, buttons right. true = stick right |
| `hand` | `'left'\|'right'` | `'left'` | derived from `stickRight` (= the stick's side) for round-1 code; never stored |
| `views` | ordered subset of `['chase','center','cockpit']`, ≥ 1 | all three | D11: views the in-game button cycles (always in that order). One view = fixed view, hide the button |
| `view` | one of `views` | `'chase'` | current view; always a member of `views` (else `views[0]`) |
| `sfx`, `voice`, `music`, `units` | as before | | |

Saved settings carry `v`. Migration happens on read and is written only when the player next changes a setting
(no boot write, so a first visit never stamps a save over the cloud): `v < 2` → `quality = 'auto'` (round 1's
'high'/'low' was a default nobody chose); `v < 3` → `invertPitch = false`, `stickRight = false` (D9/D10 changed
their meaning). Saves are `v: 3`. `views` is repaired on every read: missing/invalid/empty → all three, re-ordered to
chase → center → cockpit, and `view` falls back to `views[0]` if it is not enabled.

Settings → Views: three switches (Chase / Centre cockpit / Pilot's seat); the last one on is disabled so it can't be
turned off; hint "Only one view on = fixed view, the view button is hidden."; "Current view" offers only enabled views.
Switching a view off that is current moves `view` to `views[0]`; `onSettings` fires with the new `views` and `view`.

## Peerage (Settings) and menu card
- Menu pilot card: title + name, company · reg, then a thin gold progress bar and "20,000 PP to Prince" /
  "60,000 PP + 3 online wins to Emperor" / "6 online wins to Emperor" / "… top of the peerage".
- Settings → Peerage: real rank, lifetime PP, bar, next-rung line, "The throne: Emperor needs 260,000 PP and 10 online
  wins" (D2) below King; at King ten crown pips show the wins (7/10).
- Title picker (D3): chips for `career.unlockedTitles` in the profile's gender; the highest is marked and picking it
  stores `selectTitle(null)` (keeps following promotions); others `selectTitle(id)`. Gated by `canPickTitle('free')`;
  locked (Baron only) shows a dashed note "Earn Viscount (2,000 PP) to choose your title…".

## Account
`mountKrayzeeAccount` always mounts the avatar (gameId `krayzee`, gold accent, `nudge: 'callout'`, 6 s pill) and, outside
`?auto/test/nocloud/noui/shot/dev`, uses `syncLocalKeys` to mirror `krayzee.profile` + `krayzee.settings` + `krayzee.career` (raw strings; localsync's own
`savedAt` stamp decides freshness, nothing is JSON-compared). The two-saves chooser describes a save as
"Archduke Dirk · 60,000 PP lifetime · Dirk Air".
`canPester` = on the menu with no popup open. `?noaccount=1` skips the layer entirely.
Visibility (`html.kz-acct-off` fades `#br8t-account`; `--br8t-account-space` drops to 0 while hidden):
loading + menu visible; creator hidden (it would sit on the close button); settings visible (menu and in game); play hidden.
Settings also has an "Account" button that opens the panel. Neither profile nor settings is written until the player
changes something, so a first visit never stamps a blank save over a cloud one.

## Voice samples
Cards probe `audio/voices/<id>/sample.mp3` with a HEAD request once per session; missing → disabled "Sample soon"
(those 404s in the console are expected until VOICE writes them). Playback respects the Radio voices volume.

## Testing
`tools/ui.html` = stand-in attract scene + the real UI. Params: `state=loading|menu|creator|settings|game|pause`,
`seed` (write a Dirk profile), `reset` (clear profile/settings/career), `career=<pp>[,<wins>[,story]]` (seed a career), `first` (creator in first-run mode), `shot=1`.
Hooks log to `window.__uiLog`, sounds to `window.__sounds`; the module is `window.__ui`.
Verified with raw CDP on port 9441 (`--use-angle=metal`, cache disabled) at 390×844 touch, 844×390 touch, 1280×800 mouse:
23 real-input checks each (typing, validation, 12-char cap, auto registration, gender title, preset, voice pick, save →
localStorage + menu card, Story toast, settings persist + hook, Free Flight → account faded, pause → account back, Resume,
Escape, Quit, Hangar, Cancel), no horizontal overflow, 1 top-level navigation in 12 s with cloud sync on, sample
play/stop via an intercepted request. Screenshots: `docs/shots/ui/`.

### Round 2: `node tools/ui_flow.mjs` (starts/stops Chrome on 9441 with `--use-angle=metal`, cache disabled)
Real touch taps (390×844, 844×390) and mouse clicks (1280×800): legacy-save migration (quality, pitch, stick) with no
boot write; career-driven rank/title on profile + menu card; progress text; picker (6 chips, pick Earl → saved,
Free Flight title Earl while menu keeps Archduke pre-story, pick highest → null, onProfile fires); quality 4-way +
onSettings; invert/stick switches and labels; D11 views (pick Centre, switch off → fallback + hidden in the view
choice, last view locked, canonical order, repair of bad stored views); explicit Low survives reload; Lady titles; locked note; King parked on
wins (pips 7/10, still King at 300k PP with 4 wins, Emperor at 10); story-complete menu shows the chosen title; lite;
play/pause/resume/quit regression; desktop with cloud on: a career write moves `br8t_savedAt_krayzee`. No overflow, no
page errors. Result 2026-10-21: 55/55, 55/55, 56/56. Falsified: dropping `krayzee.career` from the sync keys and
removing the quality migration each turn the suite red. Screenshots `docs/shots/ui/flow-*.png`.
