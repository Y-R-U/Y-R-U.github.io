# NOTES — mobile UX fix pass

Work list from `AUDIT_MOBILE.md` §1 and §2, restricted to the UI surface. Files owned by this
pass: `js/game/game.css`, `style.css`, `index.html`, `js/input.js`, `js/game/ui.js`,
`js/game/onboard.js`, `js/game/menu.js`. Nothing else was touched.

Reference viewport **844 × 390** (landscape iPhone), landscape only.
Baseline before starting: `node --test` → **312 pass / 0 fail**.

## Tasks

| # | task | state |
|---|---|---|
| 1 | dialogue panel occludes `.g-act` / `.g-dial` — blocker | **done** |
| 2 | `.g-scene` missing horizontal safe-area insets | **done** |
| 3 | 44 px touch floor scaled away by `uiScale` | **done** |
| 4 | `touch-action`, `user-select`, long-press click swallow | **done** |
| 5 | no sprint on touch | **done** |
| 6 | tutorial legibility + the `move` prompt gate stall | **done** |
| 7 | first-run opening beat — mechanism built, **needs one line in `session.js`** | **mechanism done** |
| 8 | silent save failure — pause panel shipped, **toast needs one hook** | **partly done** |

## Verification method

`tools/shot.mjs` never builds `#game` under `?shot=`, so scenario renders cannot see any of this.
Everything below is verified against a live page driven by raw CDP, reusing the exported
`open/waitFor/settle/evalJSON` helpers from `tools/shot.mjs`. Probe script lives in the session
scratchpad, not in the repo.

## Log

### 1 + 2 — the dialogue panel no longer covers the thumb cluster (`game.css`)

Two new tokens on `#game`:

```css
--tap:   max(44px, calc(44px * var(--ui)));
--thumb: calc(26px + 166px * var(--ui));   /* 26 offset + dial 60 + gap 30 + act 76 */
```

`.g-scene` now reserves `--thumb` on whichever side `.g-right` is on, takes the horizontal
safe-area insets it was missing, and caps its own height so a long choice list scrolls instead of
running off the top:

```css
left:  calc(env(safe-area-inset-left, 0px) + 16px);
right: calc(env(safe-area-inset-right, 0px) + var(--thumb) + 12px);
max-height: calc(100% - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 60px);
```

`body.flip` mirrors it. `.g-choices` became the flex item that gives (`flex: 0 1 auto;
min-height: 0; overflow-y: auto`) and the bubble is `flex: 0 0 auto`, so the speaker line is never
squeezed out.

Paint order is now explicit rather than append-order luck — `.g-scene` z 1, `.g-hud` z 2,
`.g-prompt` / `.g-open` / `.g-toast` z 3, the full-screen sheets z 4, `.g-rotate` z 5 (unchanged).
Even if a future surface lands on the buttons, the buttons win the tap.

**Measured at 844 × 390, dpr 1, `light.01.first` playing:**

| element | before | after |
|---|---|---|
| `.g-bubble` | x 16 → 828, y 293 → 374 | x 16 → **640**, y 291 → 374 |
| `.g-act` occluded | **93 %** | **0 %** |
| `.g-dial` occluded | **100 %** | **0 %** |
| `elementFromPoint` at `.g-act` centre | `P` (the bubble's line) | **`.g-act`** |
| `elementFromPoint` at `.g-dial` centre | `P` | **the dial** |
| `.g-cog` | 38 × 38 | **44 × 44** |

With a 59 px landscape notch inset the bubble starts at **x 75**, not 16 — the 43 px that used to
sit in the cutout is gone.

Verified across a 60-row matrix: {844×390, 812×375, 932×430, 667×375, 1024×600} × uiScale
{0.85, 1, 1.4} × safe-area inset {0, 59} × {single line, 3-choice list}. Every row: 0 % overlap,
both buttons hit-test to themselves, no control under 44 px, `.g-scene` never runs off the top.
Safe-area insets driven with CDP `Emulation.setSafeAreaInsetsOverride`.

### 3 — the 44 px floor (`game.css`)

**Chosen fix: the floor is enforced independently of `uiScale`, on the hit area, while every
visual inside the control keeps scaling.** `--tap: max(44px, calc(44px * var(--ui)))` replaced
every `min-height: calc(44px * var(--ui))` (13 rules). `.g-cog` went to
`max(44px, calc(38px * var(--ui)))`, `.g-ware` to `max(44px, calc(34px * var(--ui)))`,
`.g-radial button` height to `max(44px, calc(48px * var(--ui)))`.

Why this and not "uiScale stops applying to hit areas": uiScale is labelled *Text size*, and a
player who raises it to 1.4 is asking for bigger everything — capping the hit area at 44 px there
would make the setting fight itself. `max()` gives both: never below the floor, still grows.
Glyph and label sizes were left on plain `calc()`, so the visual design is unchanged at
`--ui: 1`; only the 0.85 end of the slider moves.

Also picked up on the way (`AUDIT_MOBILE.md` §1.10, same file, one rule): `.g-panels` was a
non-wrapping row of three 200 px panels that overflowed by 181 px at uiScale 1.4. The panels are
now `flex: 1 1 0; min-width: 0; max-width: calc(200px * var(--ui))` inside a safe-area-padded row,
so they shrink instead of clipping.

### 4 — gestures and selection (`game.css`, `style.css`, `input.js`)

`#game` now carries `touch-action: manipulation`, `user-select: none`, `-webkit-touch-callout:
none` and `-webkit-tap-highlight-color: transparent`. `#stage` gets `touch-action: none` — it is a
look-drag surface, not a document — plus the same selection suppression, and `#touch` the same.
The two range inputs and `.g-dial` / `.g-act` keep their existing `touch-action: none`; the
effective value is the intersection down the chain, so `manipulation` on the root does not weaken
them. `input.js`'s `contextmenu` guard gained `#game` alongside `#touch, #stage`, which is what
stops Android raising the context menu under the same two long-presses.

**The click-swallow gotcha — checked, not assumed.** Both long-presses were driven with real
synthetic touches:

- **the school dial (400 ms)** — `hud.bindDial` is pure pointer events with `setPointerCapture`
  and there is no `click` handler anywhere on `.g-dial`, so there is nothing for a long-press to
  swallow. Confirmed live: a long press leaves no stuck radial, and the tap immediately after it
  still reaches the dial.
- **the quest tracker (500 ms)** — `session.bind` mounts the journal *while the finger is still
  down*. The release therefore lands on a `.g-tabs button` that was not there at `pointerdown`.
  It does **not** activate it: `click` fires on the nearest common ancestor of the down and up
  targets, which is `#game`, so the journal opens on the tab it was already on. Confirmed live
  (`{open: true, tab: "QUESTS"}`), and the cog still opens the menu on the very next tap.

No swallow found in either. Worth keeping the two probes if this area is touched again.

### 5 — sprint on touch (`input.js`, `style.css`)

**Push past full deflection.** The stick already saturates at `STICK_R = 62`; sprint arms above
`1.55 × 62 = 96 px` of travel and disarms below `1.35 × 62 = 84 px`. The two thresholds are
deliberate — a thumb resting on the rim otherwise flickers between walk and run twelve times a
second. It cannot collide with the look-drag because it is read only off `stickId`, which is the
move half of the screen by construction.

`read()` is now `sprint = Shift || stickSprint`, so the keyboard path is untouched, and
`session.bind`'s dialogue wrapper still forces `c.sprint = false` during a scene with no change.
The stick ring turns gold while sprinting (`#stick i.sprint`) — a sprint you cannot see is a
sprint players will not believe in. Cleared on `pointerup`, `pointercancel` and `blur`.

`WORLD.md §1.1`'s second column is now reachable on a phone: Whitewall gate → Longacre gate goes
from 101 s to 59 s, end to end from 216 s to 127 s.

### 6 — the tutorial (`onboard.js`, `onboard.test.js`, `game.css`)

**The stall.** `move` was `when: c => c.cast`, and `cast` was `when: c => c.looked && c.target`,
so "Drag to move." required an NPC within 4 m. `move` now arms on nothing and sits second in the
script, ahead of `cast`:

```js
{ id: 'look', when: () => true,      until: c => c.looked },
{ id: 'move', when: () => true,      until: c => c.moved, side: true },
{ id: 'cast', when: c => c.target,   until: c => c.cast },
```

`next()` already returns the first armed prompt in array order, so the teaching order is
unchanged for a player standing next to someone, and a player who just walks now gets
look → move instead of look → nothing. This also restores the `side: true` "left-handed?" button,
which is the only route to the flip setting outside Settings. Verified in a live page:
`["look", "move", null]` with no target in range.

Tests updated in place — the order assertion, and `a player who only walks is still taught the
stick` as an explicit regression. No spawn-position compensation anywhere; the prompt chain is the
only thing that changed.

**Legibility.** `.g-prompt` went from 12 px / 55 % opacity to **14 px at full opacity on its own
plate** (`rgba(10,11,13,.78)` with a hairline border), because a text-shadow does nothing against
a bright sky and the audit measured ≈1.5:1 there. It is also inset by `--thumb` on both sides, so
neither handedness can put the line or its button under the two round buttons.

Three more from `AUDIT_MOBILE.md` §1.7's table, all in the same file: `.g-dial em` / `.g-act em`
9 px/.6 → 10 px/.85 (the labels on the two primary buttons), `.g-vital em` 10 px/.6 → 11 px/.82
(the HP/Focus readout), `.g-bubble header` 10 px/.45 → 11 px/.62.

### 7 — the opening beat

**What was built.** `ui.openingBeat(host, beats, { hold, onDone })` plus `.g-open` in `game.css`.
Deliberately **not** a card and not modal: it takes the same bottom band and the same thumb
clearance as the dialogue bubble, the world keeps rendering and running behind it, there is no dim
and no blocking layer. Tap advances, waiting `hold` ms advances, `onDone` fires exactly once
however it ended. Verified live at 844 × 390: mounts at x 16 → 640, never overlaps `.g-act`,
16 px body text, tapping through all three beats fires `onDone` once and removes the element.

**It is not wired.** `session.js` belongs to another agent this pass. One line in `Session.start()`
does it:

```js
// after `this.doc.onboard = settle(...)`, cold start only
if (opts.fresh) openingBeat(this.host, OPENING, { onDone: () => this.autosave.mark() });
```

with `import { openingBeat } from './ui.js'` and `OPENING` added to the existing `./onboard.js`
import. Guard on `opts.fresh` so a returning player never sees it.

**Proposed copy — needs Aaron's sign-off.** It lives in `onboard.js` as `OPENING` rather than in
`data/**`, which belongs to the content pass; replacing the array is the whole edit. Written
against `STORY.md` §5 ("a young adult in the apprentice hall who has been getting away with being
talented and unserious") and the two quests it sets up, `light.01` (the granary) and `light.02`
(Rell's "five silverling, off the steps below"):

> **Whitewall · the apprentice hall** — You are talented, and you have been unserious about it.
> This is the year that stops.
>
> Everything here is a school. Kindling a fire, mending a coat, taking a fish off the creek — all
> of it is magic, and all of it is learned by doing it.
>
> **Today** — Cull what is in the grain. Take five fish off the steps. Sell them at the market and
> earn your own keep.

Three beats, ~20 s at the default hold. It deliberately does not pre-empt Bel: `light.01.out`
already carries "You have been getting away with talent. That stops being enough this year."
as a *payoff*, and this states the premise before the player has done anything.

Open question for Aaron: the copy names Whitewall as the start. Per `AUDIT_MOBILE.md` §2.2 the
cold start currently lands in Longacre, and another agent owns that fix. If the spawn ends up
somewhere other than the apprentice hall, beat 1's location eyebrow is the line to change.

Also fixed on the way, because it is the *actual* first screen (§2.4/§1.10): the faction slate's
three panels overflowed by 181 px at uiScale 1.4. They now shrink to fit inside the safe area.

### 8 — save failure

**Shipped now**, in a file this pass owns. The pause panel's status line was unconditionally
`saved · Day N, HH:MM · Town`. It now reads storage health live:

```js
storageHealthy() ? `saved · ${where}` : `Not saving — ${storageError()}. ${where}`
```

styled `.g-pause p.warn` — full opacity, `#e0a99e`. `kv.js` already distinguishes *storage is
full* from *storage is blocked*, so the player gets the same sentence the editor gives in its six
places. This is the surface a player reaches by choice and it needs no hook from anyone.

**The hook still needed.** `Autosave.flush()` returns `false` on a failed write and
`session.update()` (line ~824) discards it. `ui.toast(host, text, { level, ms })` is built and
tested for exactly this: top-centre, `pointer-events: none`, no dim, no button, auto-dismiss —
non-modal by construction, so it does not violate the no-modals rule the way `session.notice()`'s
`.g-card` would. Verified live: `pointer-events: none`, clears the cog, clears the day chip.

What the session owner needs to add:

```js
import { toast } from './ui.js';
// in update(), replacing the bare `this.autosave.tick(dt)`
const wrote = this.autosave.tick(dt);
if (wrote === false && !storageHealthy() && !this.saveWarned) {
  this.saveWarned = true;
  toast(this.host, `Not saving — ${storageError()}.`, { level: 'warn', ms: 6000 });
}
```

Once per session is the right frequency — a toast every ten seconds for a whole playthrough is
worse than silence. `storageHealthy` / `storageError` are already re-exported from
`savestore.js`. Note `flush()` also returns `false` for "nothing changed" and "blocked during a
channel", which is why the `storageHealthy()` term is load-bearing and not decoration.

## Verification

Real browser, headless Chrome over raw CDP, reusing `open/waitFor/settle/evalJSON` exported from
`tools/shot.mjs`. Two probes, both driving the actual game (slate tapped, campaign chosen, quest
packs loaded) — `?shot=` builds no `#game`, so no scenario render can see any of this.

- **layout matrix**, 60 rows: {844×390, 812×375, 932×430, 667×375, 1024×600} × uiScale
  {0.85, 1, 1.4} × safe-area inset {0 px, 59 px} × {one line, three-choice list}. Asserts 0 %
  overlap between `.g-scene` and both buttons, both buttons hit-testing to themselves via
  `elementFromPoint`, no visible control under 44 px, and `.g-scene` never running off the top.
  All 60 clean.
- **interaction probe**, 28 assertions, all through `Input.dispatchTouchEvent` — real touches, not
  `.click()`. Covers the two long-presses and the swallow question, the act button taking its own
  tap with the bubble up, the bubble still advancing, the whole sprint threshold ladder including
  hysteresis and release, the opening beat, the toast and the prompt chain. 28/28.

`node --test` → **0 fail** throughout. The absolute count drifted from 312 to 327 during the
pass because two other agents were adding tests concurrently; this pass contributed one new test
(`a player who only walks is still taught the stick`) and rewrote three assertions in
`onboard.test.js` to match the new prompt order. Nothing was skipped or deleted.

`index.html` was in scope and needed no change: `viewport-fit=cover` is already there, which is
what makes every `env(safe-area-inset-*)` in this pass resolve. `user-scalable=no` /
`maximum-scale=1` were left alone — iOS ignores them, but Android honours them and they cost
nothing now that `touch-action` does the real work.

## Not done, deliberately

- **§1.8**, the press-and-drag-off-the-bubble scene skip. The fix is `setPointerCapture` in
  `dialoguebox.js:168`, which is another agent's file this pass.
- **§1.9**, no player-facing brightness control. `exposure` is a registered knob but lives in the
  dev panel; exposing it in Settings needs a `session.setting` key, and `session.js` is not mine.
  `menu.js` has the row ready to take it the moment there is a setting to write.
- **§2.6**, boot-path error handling. `main.js`, another agent.
