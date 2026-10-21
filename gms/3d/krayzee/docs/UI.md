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
| `ranks.js` | re-exports `RANKS` from `data/ranks.js` (DESIGN) + `titleFor(gender, rankIndex)` |
| `voices.js` | the 15 pilot ids; names/blurbs are replaced by `data/voices.json` when it loads |
| `account.js` | br8t account layer |

## API (contract + additive extras)
```js
initUI({ onPlay(mode), onSettings(settings), onProfile(profile),      // contract
         onResume(), onQuit(), onSound(kind) })                       // extras, all optional
setLoading(fraction, label)   showMenu()   enterGameplay()   openSettings()
getProfile()  // { name, title, gender, company, primary, secondary, accent, voice, registration, rank, display }
getSettings() // { view, quality:'high'|'low', sfx, voice, music (0..1), invertPitch, hand:'left'|'right', units:'aviation'|'metric' }
getLivery()   // { name, company, primary, secondary, accent, registration } — straight into plane.setLivery
openProfile({ first })   toast(title, text, ms)   getUIState()  // { state, settings, profile, firstRun }
```
- `initUI` shows the loading screen immediately. `showMenu()` crossfades it away (0.9 s) and, on first run (no saved
  profile), opens the creator ~1 s later. Free Flight with no profile also opens the creator first, then plays.
- Free Flight calls `enterGameplay()` itself and then `hooks.onPlay('free')`. Story/Online show a "coming soon" toast.
- `openSettings()` during play shows Resume + Quit to menu. Closing (Resume, ✕, backdrop, Escape) fires `onResume`;
  Quit fires `onQuit` after `showMenu()`. Escape in play opens settings.
- `onSettings(s)` fires on every change, including while a volume slider is dragged (persisted on release).
- `onSound(kind)`: `'click'|'toggle'|'confirm'|'back'|'error'` — matches `audio.playUI()`.
- `?lite=1` makes `getSettings().quality` report `'low'` without persisting it.
- Profile `rank` is an index into `data/ranks.js` RANKS (0 = Baron/Baroness). Nothing raises it yet.

## Account
`mountKrayzeeAccount` always mounts the avatar (gameId `krayzee`, gold accent, `nudge: 'callout'`, 6 s pill) and, outside
`?auto/test/nocloud/noui/shot/dev`, uses `syncLocalKeys` to mirror `krayzee.profile` + `krayzee.settings`.
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
`seed` (write a Dirk profile), `reset` (clear profile/settings), `first` (creator in first-run mode), `shot=1`.
Hooks log to `window.__uiLog`, sounds to `window.__sounds`; the module is `window.__ui`.
Verified with raw CDP on port 9441 (`--use-angle=metal`, cache disabled) at 390×844 touch, 844×390 touch, 1280×800 mouse:
23 real-input checks each (typing, validation, 12-char cap, auto registration, gender title, preset, voice pick, save →
localStorage + menu card, Story toast, settings persist + hook, Free Flight → account faded, pause → account back, Resume,
Escape, Quit, Hangar, Cancel), no horizontal overflow, 1 top-level navigation in 12 s with cloud sync on, sample
play/stop via an intercepted request. Screenshots: `docs/shots/ui/`.
