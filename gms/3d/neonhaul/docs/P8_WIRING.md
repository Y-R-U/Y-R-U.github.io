# P8 — the pending wiring patch

**Status: APPLIED 2026-08-18 by the integration pass.** All six `main.js` edits, both mission-side
calls, the toast hook and the three `settings.js` rows are in. Deviations are listed at the bottom.
**Status (original text): NOT APPLIED.** P8 owns `js/audio.js`, `js/radio.js`, `assets/audio/manifest.json`,
`tools/gates_p8.mjs` and `tools/audio_harness.html`. It does not own `js/main.js`, `index.html`,
`js/settings.js`, `js/missions.js` or `js/economy.js`, so **the audio layer is currently unreachable
from the game.** Everything below is a patch for the manager (or whichever agent owns `main.js`) to
apply. Nothing in this file has been written to any file P8 does not own.

**It has been measured, not just written.** `tools/gates_p8.mjs` leg D installs exactly this patch
into the *real* game with `Page.addScriptToEvaluateOnNewDocument` and runs the full suite against it
— boot, gesture, chatter, music, and the deleted-assets case. Gates D1–D4 and E1–E3 are that patch
working. If you apply it as written it will behave the way those gates say it does.

`index.html` needs **no** change at all: no new markup, no new script tag, no new element. The
chatter popup and the toast rail already exist and `js/ui.js` already renders both.

---

## 1. `js/main.js` — six edits

### 1.1 Imports (with the other module imports, ~line 39)

```js
import { GameAudio } from './audio.js';
import { Radio } from './radio.js';
```

### 1.2 Construct, immediately AFTER the `const ui = new UI(...)` line (~line 400)

It must be after `ui`, because the radio hands foreground lines to `ui.chatter`. It must be after
`S()` is importable, which it already is.

```js
// ── P8 (§10) ───────────────────────────────────────────────────────────────
// Constructing these allocates NO AudioContext, no nodes and no network requests — see the header
// of js/audio.js. The only thing that happens here is two objects existing.
const audio = new GameAudio({
  settings: () => S().settings,
  onError: (k, m) => reportError(k, m),
});
const radio = new Radio({
  audio,
  base: './',
  chatter: o => ui.chatter(o),
  settings: () => S().settings,
  onError: (k, m) => reportError(k, m),
});
Game.radio = radio;          // the `radio: null` slot on Game (line ~302) is already reserved
Game.audio = audio;
radio.load();                // 22 KB of JSON, fire-and-forget, never awaited, cannot throw
audio.installGestureHooks(window);
```

`installGestureHooks` is deliberately redundant with 1.3 below. `audio.js` must not depend on
`main.js`'s gesture handler being right — a silent game is a silent game whoever forgot the hook, and
duplicate unlock calls are free.

### 1.3 `resumeAudio()` — one line added (~line 308)

The existing function already creates and resumes the context inside a real gesture handler. It just
needs to hand it over. **Adopting main.js's context is better than letting audio.js make a second
one**: iOS counts contexts against a small per-page budget, and a second suspended context is a
second thing that can be stuck.

```js
function resumeAudio() {
  try {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      Game.actx = actx;
    }
    if (actx.state !== 'running') actx.resume();
    audio.attach(actx);            // ← ADD. Idempotent; safe to call on every gesture.
  } catch (e) { reportError('audio', e.message); }
}
```

The existing listener list (`pointerdown`, `keydown`, `touchstart`) is fine. `audio.js` additionally
listens for `pointerup`, `touchend`, `mousedown` and `click` — `touchend` matters because iOS has
historically counted only some touch events as an activation, and `click` never fires at all when the
player's first interaction is a drag on §6.1's flight stick, which it always is.

### 1.4 The frame — two calls inside `update(dt)` (~line 830)

Put them at the **end** of `update(dt)`, after flight and the zone/mission state, so the context
object below is reading this frame's values and not last frame's.

Every field below was checked against the actual identifiers in `main.js`, `controls.js` and
`weather.js` as of this writing, rather than guessed:

```js
  // ── P8 (§10.1, §10.4) ────────────────────────────────────────────────────
  // Both are total no-ops before the context is unlocked, so a player who has not touched the
  // screen yet pays nothing for them.
  const cin = controls ? controls.inp : null;         // {moveX, moveY, moveActive, boost, climb}
  audio.update(dt, {
    speed: clamp(Game.player.speed / FLIGHT.MAX_FWD, 0, 1),   // FLIGHT is already imported (line 10)
    speedMs: Game.player.speed,
    thrust: cin ? Math.min(1, Math.hypot(cin.moveX, cin.moveY)) : 0,
    boost: cin ? !!cin.boost : false,
    rain: weather ? weather.amount : 0,                // weather.state().amount, 0..1
    zone: null,                                        // ← P7a: { d, r } of the nearest zone
  });
  radio.update(dt, {
    docked: !!Game.dock,                               // ← P7b sets this; null today, which is fine
    rush: !!(Game.job && Game.job.rush && Game.job.timeLeft < 30),   // ← P7a; §10.3 rule 4's `rush`
    variant,                                           // 'stormnight' | 'daysmog' | … (module-level)
    night: clock < 6 || clock > 19,                    // `clock` is module-level
    firstFlight: S().stats.jobs === 0 && mode === 'fly',
    // §10.4's remaining context weights. Leave them out entirely until something sets them.
    // nearHub, patrolNear, district, commercial
  });
```

**Every field is optional.** An unknown field is simply ×1 in §10.4's weighting and `false` in the
music state machine, so a first pass that passes only `{ variant, docked }` is correct — just less
contextual. Do not invent values to fill it; leave a field out instead.

**One field deliberately absent: `menu`.** `main.js`'s `mode` is `free | shot | auto | fly` — there
is no menu screen, only the `#boot` overlay, so nothing can ever set it. The state machine therefore
resolves straight to `cruise`, which is correct behaviour for a game with no menu. It does mean
**`music/menu.mp3` — SUNO M1, generated, 1.84 MB, and listed as required — currently has nothing to
play under.** Either give the boot overlay a mode that sets `menu: true`, or accept that M1 is
unused until there is a menu. This is a product decision, not a bug, and it is flagged rather than
silently wired to something plausible.

### 1.5 The ready signal — one line (~line 810, inside the `drawn === 3` block)

This is what keeps the audio assets off the critical path. It is a deadline, not a request: the HEAD
sweep starts 1.0 s of radio time after this call and the chatter prefetch 1.5 s after it.

```js
  if (drawn === 3 && !window.__ready) {
    window.__ready = true;
    radio.scheduleDeferredLoads();          // ← ADD
    document.getElementById('boot').classList.add('fade');
    setTimeout(() => document.getElementById('boot').classList.add('hidden'), 520);
  }
```

### 1.6 `window.__game` — the test hooks (~line 1052, beside the other P6 hooks)

`tools/gates_p8.mjs` does not need these (it drives the modules directly), but P10's soak and any
later gate will.

```js
  // ── P8 ───────────────────────────────────────────────────────────────────
  audio, radio,
  audioState: () => audio.state(),
  radioState: () => radio.state(),
  radioEvent: k => radio.event(k),
  radioFire: slot => { const r = radio.manifest?.chatter.find(c => c.slot === slot); return r ? radio.fire(r) : null; },
  setMusicState: s => radio.setState(s),
```

And in the `__state` snapshot (~line 981, next to the existing `audio: actx ? actx.state : null`):

```js
      radio: radio ? radio.state() : null,
```

---

## 2. The two calls that belong to whoever owns missions/economy

§10.4 gives job events their own dedicated pools, and this is the half of the fix that stops the
player hearing the same "Courier, your parcel is logged…" every ninety seconds forever. Eight lines
each, both already generated and on disk.

```js
// the moment a job is accepted
Game.radio?.event('dispatch_confirm');

// the moment a delivery is paid
Game.radio?.event('dispatch_pay');
```

That is the whole integration. Each returns `{ slot, audio, rms }` or `null`, and each is safe to
call when `assets/audio/` does not exist — the popup still fires from the manifest's text.

Also, wherever a toast is raised (§10.4 suppresses chatter for 4 s after any toast):

```js
Game.radio?.onToast();
```

---

## 3. `js/settings.js` — three rows that do not exist yet

`save.js` already stores `settings.music`, `settings.sfx` and `settings.radio`, and `audio.js` reads
all three every frame through the injected getter — **but there is no UI for any of them.** The
header of `settings.js` says "P6/P7 own the rest of the panel (SFX, music, chatter, chatter hold
time)" and the chatter-hold row landed; the three volume toggles did not.

Three lines, in the same style as the rows already there:

```js
    this.seg(panel, 'Music',  'music', [['Off', false], ['On', true]]);
    this.seg(panel, 'Sound',  'sfx',   [['Off', false], ['On', true]]);
    this.seg(panel, 'Radio',  'radio', [['Off', false], ['On', true]]);
```

and the panel's `apply` callback must reach `audio.applySettings()`. If `apply` is
`s => applySettings(s)` in `main.js`, add `audio.applySettings();` to that function.

Optional, and genuinely nice: §10.3 rule 4's diegetic pirate station is already implemented and is
offered "as a togglable station in settings". It reads `settings.station === 'pirate'`. The row would
be `this.seg(panel, 'Station', 'station', [['Haul net', 'none'], ['Understack', 'pirate']])`, and
`save.js` would need `station: 'none'` in its defaults. **The file it would play does not exist yet**
(`music/pirate.mp3`, SUNO M9, optional), so the row would currently do nothing audible — the pool is
empty and the chain falls through to cruise. Add the row when the track exists, not before.

---

## 4. One tooling note that is not P8's to fix

`tools/shot.mjs`'s `MIME` table has no `.mp3` entry, so its static server hands audio files back as
`application/octet-stream`. `decodeAudioData` on a fetched ArrayBuffer does not care, but an
`<audio>` element does, and every music track in this game is an `<audio>` element. **Any future gate
that drives music through `shot.mjs`'s server will be testing a coin flip.** `tools/gates_p8.mjs`
therefore runs its own server with a correct MIME table; GitHub Pages serves `audio/mpeg` properly,
so this only ever affects local harnesses. One line fixes it whenever `shot.mjs`'s owner is next in
that file:

```js
const MIME = { …, '.mp3': 'audio/mpeg' };
```


---

## 5. What actually landed — deviations from this note

**Every identifier in §1.4 checked out against the real code**: `controls.inp` really is
`{moveX,moveY,moveActive,lookDX,lookDY,climb,boost}`, `weather.amount` exists, `FLIGHT.MAX_FWD` is
imported, `variant` and `clock` are module-level, `Game.radio` was reserved. Leg D's claim held.

Four changes:

1. **`audio` and `radio` are `let`, declared above `resumeAudio()`, not `const` at the construction
   site.** `resumeAudio` is bound to three gesture listeners forty lines above where this note puts
   the `new GameAudio(...)`, and a `const` down there puts that read in its temporal dead zone.
   Boot has already died on exactly that pattern once on this project (`simTime`).
2. **`Game.radio?.onToast()` is called from `toast()` itself**, not from each call site. A per-site
   call is the kind of thing the next `toast(...)` somebody adds will silently miss.
3. **`rush` comes from the mission layer, not from a heuristic.** `missions.task()` now returns
   `rush`, so §10.3 rule 4's context is `!!(Game.job.rush && Game.job.timeLeft < 30)` exactly as
   this note writes it.
4. **`zone` is populated.** This note leaves it `null` for P7a; §10.1's proximity pulse now reads
   `{ d, r }` off the nearest zone in the live list.

**Measured in a browser (`tools/gates_wire.mjs` W5/W6):** the context goes `null → running` on a
**touch-only** path with no click ever sent, the master bus builds, `dispatch_pay` fires a clip with
non-zero measured RMS, and turning the Settings **Music** row off moves the music bus gain — the
assertion is on the mix moving, not on the row existing.

**Still open, unchanged:** `music/menu.mp3` has nothing to play it (`mode` is `free|shot|auto|fly`;
there is no menu). Flagged for P10, not wired to something plausible.
