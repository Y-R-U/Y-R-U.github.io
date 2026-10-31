# RADIO lane

Files: `js/radio/index.js` (director), `js/radio/hud.js` (DOM), `js/radio/lines.js` (script + clip bank),
`js/radio/fallback.js` (voice-agnostic stand-in lines), `js/radio/playback.js` (HTMLAudio/timed fallback when no AUDIO),
`css/radio.css`, `tools/radio.html` (bench), `js/radio/test/cdp-bench.mjs` (headless test, CDP port 9461).

Implements DESIGN §5–6 and reads its numbers from `data/rules.js` (`RADIO`, `INFRACTIONS[].scold`, `OUTRAGE.tiers`),
lines from `data/barks/script.json`, tower names from `data/voices.json`, clips from `audio/voices/barks.json` (VOICE).

## Wiring (main.js — FLIGHT)
```html
<link rel="stylesheet" href="css/radio.css">
```
```js
import { createRadio } from './radio/index.js';
import * as audio from './audio/index.js';
const radio = createRadio({
  audio,                                   // uses playRadio/loadBuffer/preload; omit → HTMLAudio/timed subtitles
  profile: ui.getProfile(),                // { name, title, voice, primary, registration, flightNo? }
  getContext: () => ({ phase, nearest, runway }), // phase: 'stand'|'taxi'|'hold'|'air'|'landed'; nearest: pilot id
  chatter: 'normal',                       // 'quiet'|'normal'|'chatty' → AI bark gap 12/6/3 s
});
for (const ai of traffic) radio.registerPilot({ id, name, title, voice, color, registration, rival, flightNo? });
radio.setTower({ voice: 'tower_m' });      // or tower_f / tower_trainee; name comes from voices.json
atcBus.on((ev) => radio.handleEvent(ev));  // see adapter below
radio.on('barked', (b) => scoring.onBark(b));
// every frame (game time; stop calling while paused):
radio.update(dt);
// menus / settings:
radio.setVisible(inGameplay); radio.setChatter(s.chatter); radio.setSubtitles(s.subtitles);
```
`radio.ready` resolves when script/manifest/voices are fetched (fallback lines work before that).
Player's flight number defaults to random 11–99 (no trailing 0); online, pass the server's via `setPlayer({flightNo})`.
The callsign splice title word is `profile.splice` if given, else `title` lower-cased with spaces → `_` (matches
`ranks.js` splice ids, e.g. `crown_prince`).

## Map towers (C-Tower 2 / C-Tower 4)
An airport def can carry `towerLines` (data/airports/farm-lines.js, airbase-lines.js). `wiring.setTower(def)` loads
them into the bank once and switches the tower to their voice (`tower_farm`, `tower_raf`). Clips are found the usual
way, by `audio/voices/barks.json[voice][id]`, and the callsign splice by `<voice>.cs_title_*` / `cs_digit_*`. So a map
tower plays real audio as soon as its clips are in barks.json, with no radio code change. `tower_raf` is tower_f's
voice under its own key, so Much Snoring's lines never mix into C-Tower 1. Headless check:
`node js/radio/test/tower-audio.mjs --airport=farm|palace|airbase [--falsify]` (CDP 9709; see VOICES.md "New towers").
A tower line the current tower voice does not have (a voiced story line such as Toby's `t_jumbo`, said in M8 while
Gerald holds the tower) is taken from the voice that has it (`LineBank.pickAny`) and plays that voice's own clip and
callsign splice; before this it was silently dropped. tower-audio.mjs checks it every run (falsified: without
`pickAny` it reports "t_jumbo DROPPED").

## Event adapter — `radio.handleEvent(ev)`
Ids are pilot ids as registered; the player's id is `'player'` (or `profile.id`). `actor` = who did it.
| ev | effect |
|---|---|
| `{type:'infraction', id, actor, victim?, outrage?}` (or `type` = an `INFRACTIONS` key) | tower scold (`INFRACTIONS[id].scold`, current tier) after 0.6–1.2 s, a newer one within 4 s replaces it. Player actor → *Scolded* window after the scold (Apology · Priority · Complain). Player victim → AI boasts (`cut_in`/`queue_jump`), then *Outrageous* window (Complain · Insult · Retort/Go-around). AI vs AI → victim complains (60 %), tower scolds half the time at AI priority. |
| `{type:'infraction', id:'near_miss', ...}` | scold + other pilot `near_miss`, window Near-miss · Insult · Apology |
| `{type:'collision', actor, victim}` (`bounce`/`bump`/`prang`) | `scold_bump`; window Boing · Insult · Apology |
| `{type:'goAround', actor, cause?}` | tower `go_around`; player sent round → Complain · Insult · Grumble; AI sent round by player → it insults you, Retort window |
| `{type:'tower', intent, actor, runway?}` | any routine tower line (`clear_land`, `taxi`, `sequence_2`, …). `clearance` with `kind:'land'|'takeoff'` also works |
| `{type:'phase', actor, phase}` | AI routine barks: taxi→greeting, hold→req_takeoff, pattern→req_land, rotate→takeoff, landed→landing_brag (chatter budget) |
| `{type:'landed', actor, impeccable?}` | tower `impeccable`; AI may brag |
| `{type:'bark', actor, intent, target}` | AI bark decided elsewhere; aimed at the player → *Insulted* window |
| `{type:'outrage', value 0..100}` or `outrage` field on any event | badge + tier (1–4 by `OUTRAGE.tiers`) |
| `{type:'scandal'}` | SCANDAL face + tower `scandal` |
| `{type:'crownChange', actor}` | tower `crown_change`; player → Landing brag · Insult |
Aliases (`cutIn`, `nearMiss`, `runwayIncursion`, `unauthorisedTakeoff`, `bump`, …) live in `EVENT_ALIASES`. Unknown
types are ignored. `radio.rules` is exported so main can add or override a rule.

## Director rules (DESIGN §5.1 / rules.js RADIO)
One channel; the director owns the queue and hands one line at a time to `audio.playRadio`. Priority tower 3 > player/
human 2 > AI 1; a player bark arriving while an AI line plays steps on it (AUDIO's heterodyne), it waits for the tower.
Stale: 3 s (tower clearances 8 s). AI budget: one AI bark per chatter gap, 5 s per speaker. Variants: random, never the
voice's last one. Response windows: 5 s ring, max one per 8 s, open when the triggering line ends, auto-dismiss.
Player: 6 s cooldown after any bark, 15 s per intent (initiate menu only; response chips ignore cooldowns).
Initiate chips by context (DESIGN §5.3): just-committed-crime (10 s) → boast · apology · insult victim · priority;
hold → req_takeoff · queue_jump · priority · insult; air → req_land · insult · priority · complain; landed →
landing_brag · insult · greeting · priority; else greeting · priority · insult · req_takeoff.
Tower callsign splice: entries with `callsign:'pre'` play `[cs_title_<word>][cs_digit_<d>][cs_digit_<d>]` + body
(+ `rwy_<runway>` for `rwy:'post'`), concatenated into one AudioBuffer with 40 ms crossfades, so AUDIO sees one
transmission. If any splice clip is missing the body plays alone; subtitles always show "Baron Four-Two, …".

## Events out — `radio.on(type, fn)`
- `barked` `{intent, target, targetType:'tower'|'pilot'|'all', voice, variant, lineId, source:'menu'|'response', cause, reaction}` —
  `reaction` = seconds into a response window (BANTER riposte / quick riposte ≤ 2 s). Online: send `{voice,intent,variant,target}`.
- `line` `{speaker, voice, intent, id, variant, text, target, missing}` when a transmission starts.
- `window` `{open, kind, cause, intents | reason:'chosen'|'timeout'|'closed'}`. `event` echoes every adapted event.

## Online (ONLINE §5/§10)
- `radio.setMode('host'|'follower'|'local')`. Follower: events only update outrage; lines come from the host.
- `radio.schedule(atRoomMs, msg)` with `createRadio({ roomTime: () => hostMs })`. `msg` = `{speaker, intent, variant,
  target, respond?:{kind, intents}}` or `{tower:true, line, about, rwy}`. Dropped if > 1.5 s late. The player's own
  bark is ignored here because it already played locally the moment it was tapped.
- `radio.openResponse(kind, intents, {target, cause})` for host-opened windows. `radio.preloadVoice(id)` on voice claims.

## Layout safe-zones (FLIGHT sets these on `:root`; fallbacks in brackets)
| var | used for |
|---|---|
| `--krz-hud-top` [8px] | top HUD strip height; subtitles sit just below it (top centre) |
| `--krz-tr-top` [hud-top+6px] | top of the tower badge, i.e. just below FLIGHT's view/fullscreen buttons (top right) |
| `--krz-tr-w` [78px] | right column kept clear of subtitles in portrait (badge is 70 px wide) |
| `--krz-ctl-bottom` [200px] | portrait: height of the stick/throttle band. Radio button sits 10 px above it, bottom centre; 2×2 chip tray above the button |
| `--krz-ctl-left` / `--krz-ctl-right` [190px] | landscape: side control widths. Chip column sits left of the right zone |
| `--krz-ctl-right-h` [200px] | landscape: right control height from bottom. Radio button sits 12 px above it on the right edge |
Set them per orientation (media query or JS on resize). Safe-area insets are added by radio.css. Root is
`pointer-events:none`; only pills, badge, button and tray take touches, and they stop propagation, so flight input
under/around them is unaffected. z-index 40. Keys: 1–4 chips, R tray, L log, Esc close.

## Verification (2026-10-21, CDP 9461, `--use-angle=metal`, cache disabled)
`node js/radio/test/cdp-bench.mjs` (needs `cdp start --port 9461 -- --use-angle=metal`). In 390×844 and 844×390 with
touch emulation (real `Input.dispatchTouchEvent` taps) and 1280×800 with mouse: radio button opens the menu, chip tap
emits `barked`, cut-in scold opens the Scolded window after the scold line and a chip tap answers it, the insult window
auto-dismisses on timeout, tapping a subtitle opens the log. No overlap of tray/button/subtitles/badge with the stick,
throttle or top-right buttons, and the stick/throttle centres hit-test to the controls. The overlap check was
falsified: with `--krz-ctl-bottom:0` it reports panel and button overlapping the stick. Shots: `docs/shots/radio/`.
Not yet verified: real clips (no `audio/voices/barks.json` yet: everything ran as AUDIO's missing-file squelch +
subtitle), splice audio joins, and a real phone.
