# AUDIT — mobile UX, first run, static performance risk

Read-only review, A7 as landed. Target device is a landscape iPhone at **844 × 390 CSS px**, the
gate profile in `quality.js` `MOBILE_PROFILE`.

Every number is labelled:

- **[M] measured** — read out of a running page or a tool in this session.
- **[D] derived** — arithmetic on measured numbers. The arithmetic is shown.
- **[G] guessed** — an estimate. Treated as an estimate everywhere it is used.

Measurements were taken with `node tools/budget.mjs`, `node tools/shot.mjs`, and CDP probes against
`index.html` at 844 × 390 dpr 1, preset medium. Headless renders here are software-rendered: images
and counts are trustworthy, timings are not.

---

## 1. Mobile UX and input

### 1.1 The dialogue bubble completely covers both primary action buttons — **blocker**, one-liner

**What.** At the actual gate viewport the dialogue panel is drawn on top of, and swallows the taps
of, the school dial and the context/action button.

**Where.** `js/game/game.css:34-43` (`.g-scene`), `js/game/game.css:306-331` (`.g-right`,
`.g-dial`, `.g-act`), `js/game/dialoguebox.js:25`, `js/game/hud.js:69-81`.

**The number [M]** — `getBoundingClientRect()` at 844 × 390 with `light.01.first` playing:

| element | x range | y range |
|---|---|---|
| `.g-bubble` | 16 → 828 | 293 → 375 |
| `.g-act` (76 px) | 742 → 818 | 288 → 364 |
| `.g-dial` (60 px) | 652 → 712 | 296 → 356 |

`.g-act` is 100 % inside the bubble in x and 71 of its 76 px in y = **93 % occluded**. `.g-dial` is
**100 % occluded**. The bubble is `rgba(16,18,21,.92)` — near-opaque — and it is appended to the host
*after* `.g-hud` (`hud.js:91` in the constructor, `dialoguebox.js:48` on `begin()`), so with both at
`z-index: auto` the bubble wins the paint order. It also carries `pointer-events: auto`
(`game.css:51`), so it takes the taps as well as the pixels.

This directly contradicts the design: `dialoguebox.js:1` — *"Non-modal: movement is off, look-drag
stays live, the clock keeps running."* The HUD is meant to stay usable and it is not. `hud.show(false)`
is called for the menu and the market (`session.js:129,143`) but deliberately **not** for dialogue.

Confirmed visually — the "KIND" dial reads as a ghost behind the panel in a 844 × 390 capture. It is
invisible in every committed shot because `?shot=` builds no `#game` host at all (`ui.js:1-3`), so
no scenario render has ever contained this UI.

**Fix.** `.g-scene { right: calc(env(safe-area-inset-right, 0px) + 120px); }` when the HUD is up, or
give `.g-right` a `z-index` above `.g-scene` and shorten the bubble. One line either way.

### 1.2 Dialogue and choice buttons sit under the landscape notch — **medium**, one-liner

**What.** `.g-scene` is the only bottom-anchored surface in the game that does not use the
horizontal safe-area insets.

**Where.** `js/game/game.css:34-43`:

```css
#game .g-scene { left: 16px; right: 16px; bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); }
```

`bottom` is inset-aware; `left` and `right` are not.

**The number [D].** Landscape `safe-area-inset-left`/`right` on a notched iPhone is **59 px**. The
bubble's content box starts at x = 16, so **43 px of the speaker name and the first line sit inside
the cutout**, and so does the leading edge of every `.g-choices button` — which is a *tappable* target,
not just text. Everything else in the file gets this right: `.g-track` (line 13), `.g-vitals` (233),
`.g-chip` (274), `.g-cog` (295), `.g-right` (308), `.g-journal` (108) and `.g-sheet` (461) all use
`env()` on the horizontal axis.

### 1.3 The two most-used buttons are 38 px, and the 44 px floor scales down to 37 px — **medium**, one-liner

**Where / [M]** at `--ui: 1`:

| control | size | file |
|---|---|---|
| `.g-cog` — the only way into pause/journal/settings on touch | **38 × 38** | `game.css:292-304` |
| `#panel-toggle`, `#audio-link` | 38 × 38 | `style.css:39-43, 115-121` (dev only, hidden by `body.playing`) |
| `.g-ware` — market row, the sell interaction | **min-height 34** | `game.css:508-521` |
| `.g-skill` | 22 | `game.css:490` (display only) |

Everything else correctly uses `min-height: calc(44px * var(--ui))`.

**The multiplier is the bigger problem [D].** `uiScale` ranges **0.85 → 1.4** (`menu.js:187`). At
0.85 every `calc(44px * var(--ui))` target becomes **44 × 0.85 = 37.4 px**, i.e. the accessibility
setting labelled "Text size" silently shrinks every touch target below the 44 px floor. The 44 px
term should be a floor, not a scalable: `min-height: max(44px, calc(44px * var(--ui)))`.

### 1.4 No `touch-action` on the game UI, so double-tap zoom is live — **medium**, one-liner

**Where [M].** `grep -rn "touch-action"` finds exactly four hits: `.pad` (`style.css:84`),
`.g-dial`/`.g-act` (`game.css:327`) and the two range inputs (`game.css:566`, `style.css:77`).

`index.html:5` sets `user-scalable=no, maximum-scale=1` — **iOS has ignored both since iOS 10**.
So on iPhone, pinch-zoom and double-tap-zoom are active on every game surface that isn't one of
those four: `.g-bubble`, `.g-choices button`, `.g-pause button`, `.g-jrow`, `.g-ware`, `.g-panel`,
`.g-tabs button`, `.g-jacts button`. Advancing dialogue is a repeated tap in one place — the exact
gesture that trips double-tap zoom.

**Fix.** `#game { touch-action: manipulation }`, with the two range inputs keeping their
`touch-action: none`.

### 1.5 Nothing suppresses the iOS selection callout under two deliberate long-presses — **medium**, one-liner

**Where [M].** No `user-select`, no `-webkit-touch-callout`, no `-webkit-tap-highlight-color`
anywhere in `style.css`, `game.css` or `editor.css`. Meanwhile there are two intentional long-press
gestures over text:

- `hud.js:18` `LONG_PRESS = 400` — hold the school dial to open the radial.
- `session.js:287` — hold the quest tracker (`.g-track`, which is text) 500 ms to open the journal.

At 400–500 ms iOS raises the text-selection magnifier and the copy/define callout. `contextmenu` is
prevented only on `#touch, #stage` (`input.js:43`) — `#game` is not covered, so Android gets the
context menu on the same gestures.

### 1.6 No sprint on touch — **medium**, medium

**Where [M].** `input.js:128` — `this.sprint = k.has('ShiftLeft') || k.has('ShiftRight')`. That is
the only writer. `player.js:178` applies `× 1.7`.

**The number.** `WORLD.md §1.1` costs the world on both columns: Whitewall gate → Longacre gate is
**101 s walking, 59 s sprinting**; end to end is **216 s vs 127 s**. A mobile player never gets the
second column, so every journey in a mobile-first game is the slow number. The stick already has a
magnitude (`input.js:78-80`, `k = min(1, len/STICK_R)`) that saturates at `STICK_R = 62` px — a
push-past-full-deflection sprint, or a double-tap-and-hold on the stick, is the conventional answer.

### 1.7 The only teaching text in the game is 12 px at 55 % opacity — **medium**, one-liner

**Where / [M]** font sizes at `--ui: 1`:

| element | size | opacity | what it is |
|---|---|---|---|
| `.g-prompt` | **12 px** | **.55** | every onboarding line — the whole tutorial (`game.css:364-377`) |
| `.g-dial em` / `.g-act em` | **9 px** | .6 | the labels on the two primary buttons (`game.css:334-339`) |
| `.g-vital em` | **10 px** | .6 | the HP / Focus numbers (`game.css:256-261`) |
| `.g-bubble header` | 10 px | .45 | speaker name + line counter (`game.css:53-59`) |
| `.g-jrow em` | 9 px | .4 | ACT / BOARD badge (`game.css:159-165`) |

Body text is fine — `#game { font-size: calc(15px * var(--ui)) }` (line 227) and dialogue lines
inherit it. The problem is confined to the small stuff, and the small stuff is the wrong small stuff:
the tutorial, the action-button labels and the health readout.

`.g-prompt` is `#e8e3d8` at 55 % over a moving 3D scene. Against the pale dusk sky in
`shots/street_dusk.png` (mean luminance ≈ 200/255 in the upper half) the effective contrast is
roughly 1.5:1 — well under WCAG's 4.5:1 and under any practical outdoor-phone threshold. The
`text-shadow: 0 1px 3px rgba(0,0,0,.9)` helps against a dark background and does nothing against a
light one.

### 1.8 A press-and-drag off the dialogue bubble silently skips the whole scene — **medium**, one-liner

**Where.** `dialoguebox.js:168-170`:

```js
bubble.onpointerdown  = () => { this.held = 1e-6; };
bubble.onpointerup    = () => { if (this.held) { this.held = 0; this.next(); } };
bubble.onpointercancel= () => { this.held = 0; };
```

and `tick()` at line 67-70 skips the entire scene once `held > HOLD_SKIP` (**0.6 s**).

There is no `setPointerCapture` and no `pointerleave` handler. Press on the bubble, slide the thumb
off it (toward the look pad, which is the natural next thing to do), release — `pointerup` never
fires on the bubble, `held` keeps accumulating, and at 0.6 s `skipScene()` runs the conversation to
its end. The player loses the scene with no undo; the lines are recorded to the log
(`session.js:84-88`) but nothing tells them that happened.

0.6 s is also short for a deliberate hold. A hesitant tap while reading crosses it.

### 1.9 No player-facing brightness control — **small**, one-liner

`gate_night.png` is a genuinely dark frame (correctly so). `exposure` is a registered knob
(`app.js:77`) but it lives in the `Renderer` group of the dev panel, and `style.css:128` hides
`#panel` under `body.playing`. Settings (`menu.js:186-196`) offers text size, motion, hold assist,
aim assist, faction marks, haptics, volume, mute, ambience — no brightness. A phone outdoors at
midday cannot see a night scene.

### 1.10 The faction slate overflows at large text sizes — **small**, one-liner

`.g-panels` is a non-wrapping flex row of three `.g-panel` at `calc(200px * var(--ui))` with
`calc(24px * var(--ui))` gaps (`game.css:590-605`).

**[D]** at `uiScale = 1.4`: `3 × 200 × 1.4 + 2 × 24 × 1.4 = 840 + 67 = 907 px` against
`844 − 2 × 59 = 726 px` of safe width. **181 px overflows**, ~90 px clipped off each end, and
`.g-slate` has no `overflow` handling. Add `flex-wrap: wrap` or clamp the panel width.

### 1.11 Things that are right, so nobody re-does them

- **The portrait rotate prompt exists and works.** `.g-rotate` (`game.css:618-631`) with
  `@media (orientation: portrait)`, and `session.rotate()` (`session.js:319-328`) pauses the
  simulation and the clock. It is wired to **both** `orientationchange` and `resize`
  (`session.js:302-303`), so it survives a mid-game rotation — including the case where iOS fires
  `resize` without `orientationchange`. `z-index: 5` inside `#game` (z 40) puts it above the journal,
  the sheets and the touch pads (z 15), and `pointer-events: auto` blocks input behind it. See §2.1
  for the one hole.
- **No load-bearing `:hover`.** The only `:hover` in the codebase is `.adv > summary` in the dev
  panel (`style.css:69`), and it is cosmetic.
- **No right-click-only or keyboard-only affordance except sprint.** `KeyJ` / `KeyE` / `Escape`
  (`session.js:281-283`) all have touch routes: cog → pause → Journal, the context button, the cog.
- **Scroll/gesture conflicts are handled.** Both range inputs carry `touch-action: none` with a
  comment explaining why (`style.css:75-77`). The scrolling panels (`.g-body`, `.g-jlist`, `.g-jpane`)
  are inside `.g-journal`/`.g-sheet`, which are full-screen and `pointer-events: auto`, and opening
  either pauses the game — so a scroll drag can never reach the camera. `input.js:52` early-returns
  on `#panel, #hud`, and the game UI never reaches `Input` at all because its listeners are bound
  only to `#stage` and `#touch` (`input.js:39`).
- **Window lights correctly cast no shadows.** `app.js:69-71` restricts the `castShadow` sweep to
  directional lights, with the comment that 18 cube-shadowed point lights would be 2185 draw calls.

---

## 2. First run and failure states

### 2.1 There is no way for a player to accept a quest — **blocker**, one-liner

**What.** The offer path is computed and never consumed. A cold-start player cannot enter the
content at all.

**Where.** `questrunner.js:73` `get offers()` → `quest.js:237-247` `offered()`. `grep -rn "\.offers"`
over `js/` returns **the definition and nothing else**. `questrunner.accept()` (line 85) is called
from exactly one place: `session.jumpTo()` (`session.js:243`), which is reached only from
`?quest=<id>` (`session.js:170-171`) and passes `force = true`.

`session.talk(npc)` (`session.js:407-412`) calls `questrunner.sceneFor(npc)`, and `sceneFor`
(`questrunner.js:153-163`) only walks quests already in state `active` or `turnin`. A quest that has
never been accepted has no record, so `sceneFor` returns `null`, `talk()` falls through to
`emit({t:'talk', npc})` and a `uiBlip`, and nothing happens.

**[M] — verified in a live page.** Fresh profile, Light campaign chosen, player teleported onto Bel:

```
offers:            ["light.01"]          ← the engine knows
context:           {id:"bel", kind:"talk", label:"talk", range:4}
after g.act('talk'): accepted: []  dialogueActive: false
after g.talk('bel'): accepted: []  dialogueActive: false  sceneFor('bel'): null
tracker text:      ""
```

The content itself is fine — `?quest=light.01` accepts it, tracks it and the tracker reads
`THE GRANARY / Cull the rodent`, and 99 quest defs + 89 areas load cleanly.

**This is a gap between B2/B3/B6 and Track D, not a Track D job.** `BUILD_PLAN.md:156` lists Track D
as "not started" and scopes it to *"quest packs, dialogue, NPC placement"* — content. But the packs
already exist and `offered()` already works; what is missing is one branch in `Session.talk()` that
checks `this.quests.offers` for a def whose `giver === npc` and either plays an offer scene or calls
`accept(id)`. That is a one-liner, and without it the whole runtime is unreachable.

### 2.2 The player spawns 517 m from the only quest giver, in the wrong town — **blocker**, medium

**[M] — cold start, Light campaign, no save:**

```
playerPos:   (1, 8, 22)
spawnReason: "no stored position"
here:        ["lac", "lac.square", "lac.cross"]      ← Longacre's market square
nearestNPC:  rell 9 m · sedge 62 m · bel 517 m
wwa.granary: rect x −556…−538, z −34…−14             ← Whitewall
```

The Light campaign opens in **Longacre**, the Neutral town. Bel — who gives `light.01`, the first
quest of the first campaign — is **517 m away**, which is **≈ 103 s of walking** at `player.js`
`speed = 5.0` with no touch sprint (§1.6).

**Why.** `session.restorePosition()` → `spawnAtHearth()` (`session.js:220-232`) finds the hearth
area, then bails on `reachable()` (line 235-239), which requires the anchor to be within
`REACH = 400` m (line 34). The comment at line 227-229 is honest about it — the anchors are authored
against the finished valley and A8 has not placed the towns. So the player is left wherever
`player.js` defaults, which happens to be Longacre. Correct behaviour, wrong outcome, and nothing
tells the player.

Nearest NPC is `rell`, who gives `light.02`, gated behind `light.01`. So even the one figure in
range has nothing.

### 2.3 The premise is not in the game — **blocker**, medium

`CLAUDE.md`'s opening is *"a young adult told it is time to take their magic skills seriously — to
earn their way and learn their craft. Cull the problematic rodents, catch fish and sell them at the
market."*

**[M]** `data/dialogue/light.json` holds 56 nodes; the first is `light.01.first`, which fires *after*
the player has already killed a rat inside `wwa.granary`:

```json
"light.01.first": { "cam": "close", "lines": [["bel","That is one.","There will be seven more in there."]] }
```

There is no prologue node, no opening card, no `notice()` at first run. `light.01`'s summary
("Something is in the grain.") is only visible in the journal after acceptance, which per §2.1 cannot
happen. The three-line premise exists in `CLAUDE.md` and `STORY.md` and nowhere the player can reach.

### 2.4 What a brand-new player actually sees in the first 30 seconds — **[M]**

1. `#boot` — "FORGE / a valley, three towns / **warming…**". Removed at `main.js:140`.
2. **The faction slate** — "FORGE", three panels: Whitewall *lit* ("Start here. Everyone does."),
   Longacre *dim*, Blackstone *shadow*. This is the first interactive screen and it has **no rotate
   prompt** — `.g-rotate` is created lazily in `Session.rotate()` (`session.js:321-324`), and the
   session is not constructed until the slate promise resolves (`main.js:108-111`). A phone held in
   portrait gets an overflowing three-panel row (§1.10) with no instruction to turn it.
3. **The world.** Total on-screen text, verbatim from the live page:

   ```
   ♥  ◆  Day 0 · Rising  ⚙  KIND  8  Drag to look.
   ```

   Two unlabelled bars, a date chip, a cog, a school dial reading "KIND / 8", an inert grey action
   button, and one 12 px 55 %-opacity line that fades after `HOLD = 4` seconds (`onboard.js:5`,
   `session.js:817-819`).

4. Nothing else, ever. See §2.5.

**Severity: blocker. Effort: medium** — §2.1 unblocks the loop, §2.2 needs a start anchor that works
against the demo world, §2.3 needs one prologue node.

### 2.5 The onboarding script stalls after prompt 1 — **medium**, one-liner

**Where.** `onboard.js:10-18`. The chain is `look → cast → move → …`, and `next()` returns the first
prompt whose `when` fires:

```js
{ id: 'look', when: () => true,                     until: c => c.looked },
{ id: 'cast', when: c => c.looked && c.target,      until: c => c.cast  },
{ id: 'move', when: c => c.cast,                    until: c => c.moved, side: true },
```

`c.target` is `!!this.context` (`session.js:764`), i.e. an NPC within its 4 m range. **"Drag to move."
is gated behind having cast a spell, which is gated behind standing next to an NPC.** On the cold
start measured in §2.2 no target is in range, `cast` never arms, `move` never arms, and the player is
never told that the left half of the screen moves them — nor shown the `side: true` "left-handed?"
button, which is the only route to the flip setting outside the settings sheet.

The `look` prompt is also retired the instant the player's finger moves (`session.js:271`), which on
a phone happens accidentally within a second.

### 2.6 A failed asset fetch is a permanent "warming…" screen — **blocker**, one-liner

There is **no error handling of any kind in the boot path**. `grep -rn "onerror|unhandledrejection|
addEventListener('error'"` over `js/` and `index.html` returns **zero hits**.

Three ways this bites, worst first:

**(a) The CDN.** `index.html:13-17` resolves `three` from
`https://cdn.jsdelivr.net/npm/three@0.160.0/…`. It is the only cross-origin dependency in the
project. If jsdelivr is slow, blocked (corporate wifi, a content filter, China) or down, the module
graph never resolves, `main.js` never runs, `#boot` never gets `.gone` (`main.js:140`), and the
player looks at "warming…" **forever**. No timeout, no retry, no message, no `<noscript>`.

**(b) The quest packs.** `questrunner.js:37` — `const get = async p => (await fetch(\`${base}/${p}\`)).json();`
No `.catch`, and `fetch` does not reject on 404 — it resolves and `.json()` throws on the HTML error
body. `session.start()` (line 166-176) awaits `this.quests.load()` at line 168, so a single failed
pack aborts everything after it: `restorePosition()`, the `?quest=` hook, `settle()`, the ambience
beds and the save-migration `notice()`. `main.js:90` calls `play()` **without `await` and without
`.catch`**, so the rejection goes to the console. The player gets a HUD (built in the constructor)
over a world with no quests, no areas, no audio and no error.

**(c) The stylesheet.** `ui.js:8-11` injects `game.css` as a runtime `<link>` with no `onerror`. If
it 404s or is slow, `#game` loses `position: fixed` and `pointer-events: none` and the entire game UI
renders as unstyled block content stacked over the canvas, swallowing all input.

**Fix.** A `window.onerror` + `unhandledrejection` pair that writes into `#boot-status` — which is
already in the DOM (`index.html:43`) and, notably, **is never written to by any code**
(`grep -rn "boot-status" js/` → no hits). It exists solely to say "warming…" and then be hidden.

### 2.7 Save failure is silent in the game and loud in the editor — **medium**, one-liner

`js/kv.js` is good: it probes at boot (line 32), distinguishes "storage is full" from "storage is
blocked" (line 21), and never throws. `savestore.js` re-exports `storageHealthy` / `storageError`
(line 6). The **editor** uses them in six places — `editor/ui.js:94,129,148`, `editor/editor.js:377,383,386,392`
— with real user-facing text: *"Not saving — storage is blocked. Use Export file to keep this scene."*

**The game uses neither.** `Autosave.flush()` (`savestore.js:78-87`) returns `false` on a failed write
and `session.update()` (line 824) discards the return. In private-browsing Safari or on a full quota
the player plays a whole session that is never saved, with no indication. `session.notice()`
(line 330-337) already exists as the surfacing mechanism — it is used only for save-migration
warnings (line 174).

### 2.8 Corrupt-save handling is right, so leave it

`savestore.load()` (line 19-24) copies unreadable bytes to `forge.save.broken` before anything can
overwrite them, and `normalise()` errors and warnings reach the player through `session.notice()`
(`session.js:65-66, 174`). That is better than most shipped games. `Autosave` also skips writes when
nothing changed (line 82) and blocks during a channel — both correct for a phone.

---

## 3. Static performance risk

### 3.1 The gate is measured at a quarter of the shipped pixel count — **blocker**, one-liner

**What.** `PHONE_TEST.md` and every measurement in the project use `dpr=1`. The shipped default is
a dpr cap of **2**. Every fill-rate cost in this section multiplies by four between the number on
record and the number the player gets.

**Where [M].** `app.js:94`:

```js
const capped = Math.min(devicePixelRatio || 1, this.dprCap ?? 2);
```

`this.dprCap` is written in exactly one place — `main.js:135`, `if (params.has('dpr'))`. With no
`?dpr=` in the URL it stays `undefined` and the `?? 2` applies.

**The arithmetic [D].**

```
gate profile (?dpr=1) :  844 × 390                       =   329,160 px
shipped default       : (844×2) × (390×2) = 1688 × 780   = 1,316,640 px
ratio                                                    =      4.00×
```

An iPhone at `devicePixelRatio = 3` is still clamped to 2, so 4.00× is the ceiling, not a floor.

**This is the first thing to fix in `PHONE_TEST.md`.** As written the test answers a question about a
configuration no player is in. It should be run **twice** — once bare (the shipped default) and once
with `&dpr=1` (the gate) — and the delta between them *is* the fill-rate answer, before any of the
document's own A/Bs are needed.

### 3.2 Fill-rate ranking — what to turn off first

The frame is not triangle-bound anywhere near the gate (§3.5). It is plausibly fetch- and
ALU-bound per fragment, and none of that is visible in a triangle count. Ranked by cost per
fragment, worst first.

#### (1) The custom penumbra shadow filter — 25 texture fetches per shadowed pixel

**Where [M].** `lighting.js:18-61` monkey-patches `THREE.ShaderChunk.shadowmap_pars_fragment`,
replacing three's PCF path with `forgePenumbra`:

- **9** `FORGE_SEARCH` taps — `unpackRGBAToDepth(texture2D(...))`, a *dependent* fetch plus unpack
  (lines 27-35);
- early-out at `hit < 0.5` (fully lit) or `hit > 8.5` (fully shadowed) — lines 36-37;
- otherwise **16** `FORGE_TAP` rotated PCF compares (lines 43-58).

**The arithmetic [D].** Stock `SHADOWMAP_TYPE_PCF` is 9 hardware-bilinear taps. A penumbra fragment
here costs `9 + 16 = 25`, i.e. **2.8× stock**, and the early-out is a *branch* — on a tile GPU's wide
SIMD groups any quad straddling a shadow edge pays 25 for every lane. `shadowSoft` defaults to 0.05
(`lighting.js:245`), a deliberate storybook exaggeration, which makes penumbra regions wide and
therefore common.

At the shipped default, assuming 60 % of the frame receives the key light **[G]**:

```
1,316,640 px × 0.60 × 25 fetches × 60 fps = 1.19 × 10⁹ dependent texture fetches / second
```

Nothing else in the frame is close. This is the single largest per-pixel item and it does not appear
in any triangle or draw-call number.

**Off switch.** `?shadows=hard` → `THREE.BasicShadowMap`, which does not enter the patched branch at
all: **1 tap**. `?shadows=off` removes the shadow pass entirely (worth 27.8k–82.9k triangles as well).

#### (2) 18 point lights evaluated on every fragment at night

**Where [M].** `lighting.js:226-227` — `windowLights` default **18**, capped by `lightCap` 24 at
medium. Probed at `gate_night`: `{dir: 1, pt: 18, ptOn: 18, hemi: 1}`.

**Why it costs what it does.** Three.js forward rendering compiles `NUM_POINT_LIGHTS` into every
material and loops it unconditionally. There is no light culling and no clustering. So **all 18 are
evaluated on every fragment of every surface in the frame** — the ground 200 m away, the sky-facing
roof slopes, the terrain behind the camera's near plane. `Windows.update()` (`materials.js:328-377`)
does a good job of choosing *which* 18 windows get a light, and none of that reduces the per-fragment
cost.

**The arithmetic [D].** A `MeshStandardMaterial` point-light term is distance attenuation +
GGX specular + Fresnel + diffuse ≈ **50 ALU** **[G]**:

```
18 lights × 50 ALU = 900 extra ALU per fragment
1,316,640 px × 900 × 60 fps = 7.1 × 10¹⁰ ALU / second on window lights alone
```

Against a mid-range mobile GPU in the 200–400 GFLOP range **[G]**, that is a meaningful fraction of
the whole budget. Look at `shots/gate_night.png`: the lights illuminate perhaps 5 % of the frame.

**Off switch.** `?windowLights=6` or `=0`. Night scenes only.

#### (3) Triplanar and biplanar projection — 4–7 fetches where a UV material does 2

**Where [M].** `js/world/textures/project.js`:

- **Full triplanar** (lines 73-90), used on ground and roads: 3 albedo (`texture2D(map, pUvX/Y/Z)`,
  line 78) + 3 normal (lines 82-84) = **6 fetches**, plus the ground-field lookup at line 67 = **7**.
- **Biplanar** (lines 98-113), used on walls: 2 albedo (line 103) + 2 normal (line 110) = **4**.

Ground and roads are the largest screen-area surface in every outdoor frame; walls are ~60 % of
`shots/street_dusk.png`.

**The arithmetic [D]** — per-fragment texture fetches, daylight, with shadows on:

| pixel | material | env cube | shadow | total | stock three equivalent |
|---|---|---|---|---|---|
| shadowed wall | 4 | 1 | 25 | **30** | 2 + 1 + 9 = 12 |
| shadowed ground/road | 7 | 1 | 25 | **33** | 12 |

**2.5–2.75× the fetch cost of a plain UV-mapped `MeshStandardMaterial`.** Whole frame, at the shipped
default with ~28 fetches average **[G]**:

```
1,316,640 px × 28 × 60 fps = 2.21 × 10⁹ texture fetches / second, before overdraw
```

This is structural — it is how the material system works and it is most of what makes the renders
read. It is listed so that when the phone test comes back "fill-rate bound", nobody spends a week on
foliage before understanding that the base material is already 2.5× stock.

#### (4) Alpha-tested foliage overdraw

**[M]** drawn grass across the five scenarios: 15.0k / 16.0k / 16.3k / 19.7k / 20.0k triangles. Near-
camera grass is alpha-tested cards, and `alphaTest`/`discard` disables early-Z, so every covered
fragment runs the full shader before it can be rejected. Triangle count does not measure this at all;
`?foliage=0` in `PHONE_TEST.md` is exactly the right probe.

**Off switch.** `?foliage=0.3` (from 0.6), `?foliageCull=0.6` (from 1.15).

#### (5) The PMREM environment cube — 1 dependent cube fetch + roughness LOD per fragment

`lighting.js:192-194, 426-431`. `scene.environment` is a 256 × (256·6) PMREM, sampled by every
`MeshStandardMaterial` fragment. This is requirement 1 of the Tiny Glade bar and should not be cut —
but `?envPower=0` is a clean diagnostic A/B that isolates it.

#### (6) Post and AA — both off by default, keep them off

- `post.js:23` — `ao` defaults to `'off'`. The composer is not even built until it is enabled
  (`setAO` → `build()`), so the no-post path costs nothing. Note `post.js:74-76`: `ao: 'half'` still
  runs GTAO's depth/normal prepass at **full** resolution, so "half" is not half the cost.
- `aa.js:53-54` — `aa` defaults to `'off'` unless `localStorage['forge.aa'] === 'native'`. If it ever
  gets flipped to `native`, that is MSAA on a 1.32 Mpx default framebuffer — a 2–4× bandwidth
  multiplier on a bandwidth-bound tile GPU, and unlike every other knob it forces a page reload
  (`aa.js:66-72`).

### 3.3 Texture memory — 54.25 MB tracked, but the real footprint is ~2.6× that

**[M]** `__forge.texBreakdown()` at the gate profile (medium, `texCap` 1024): **54.25 MB**, against
a 60 MB budget. Reproduces `WORLD.md §6.5`'s 54.2 exactly.

| group | count | size | MB | share |
|---|---|---|---|---|
| `{light,neutral,dark}:wall` albedo + normal | 6 | 1024² | **32.16** | **59.3 %** |
| `{…}:ground` albedo + normal | 6 | 512² | 8.04 | 14.8 % |
| `{…}:{glass,roof,road,wood}` albedo + normal | 24 | 256² | 8.04 | 14.8 % |
| `sky:equirect` + `sky:pmrem` | 2 | 1024×512, 256×1536 | 3.51 | 6.5 % |
| foliage atlases (leafclump, grass, bark, needle, flower) | 5 | ≤512² | 2.14 | 3.9 % |
| heightfield, ripple, plumage, fur | 4 | ≤256² | 0.36 | 0.7 % |
| **total** | 47 | | **54.25** | |

Per-texture arithmetic checks against `budget.js:8-12`:
`1024 × 1024 × 4 bytes × 1.34 (mips) = 5,620,204 B = 5.360 MB` ✔.

**All three zone sets are already resident simultaneously.** `WORLD.md §6.5`'s claim that three towns
add nothing is **confirmed by measurement** — the three material sets are baked at boot regardless of
where the player is. The only risk is a fourth set, and the six new `TYPES` in §5.10-B are explicitly
specified to reuse `getMaterial`.

**What the 54.25 MB does not include [M / D].** `budget.js` tracks textures only, as
`WORLD.md §5.10-E` says. Measured by walking the scene graph:

| item | MB | how |
|---|---|---|
| vertex + index buffers | **19.22** | **[M]** sum of `attributes[*].array.byteLength + index.array.byteLength` over 288 unique geometries |
| instance matrices + colours | **1.36** | **[M]** `instanceMatrix`/`instanceColor` byteLength |
| shadow map, 1024² RGBA8 packed depth | 4.19 | **[D]** `1024²×4`; RGBA8 implied by `unpackRGBAToDepth`, `lighting.js:21` |
| default framebuffer, dpr cap 2, colour + depth, double-buffered | **21.06** | **[D]** `1688×780 × 8 B × 2` |
| retained CPU canvas backing stores | **~44** | **[D]** see below |

**The canvas copies.** `bake.js:46-52` builds every surface as a `THREE.CanvasTexture(cv)`, which
holds the `<canvas>` alive as `texture.image` for the texture's lifetime. Raw un-mipped bytes:

```
6 × 1024² × 4  =  25.17 MB   (wall albedo + normal, three zones)
6 ×  512² × 4  =   6.29 MB   (ground)
24 ×  256² × 4  =   6.29 MB   (glass/roof/road/wood)
1 × 1024×512×4 =   2.10 MB   (sky canvas)
1 × 1024×512×4 =   2.10 MB   (lighting.js:163 `skyImg`, a permanently-retained ImageData)
foliage atlases ≈  2      MB
                ─────────
                ≈ 44 MB
```

Whether the browser frees the backing store after upload is engine-dependent; the JS reference keeps
the canvas element alive either way, and the `skyImg` `ImageData` at `lighting.js:163` is definitely
retained because `drawSky` writes into it every redraw.

**Totals [D]:**

```
GPU side, ?dpr=1   : 54.25 + 20.58 + 4.19 +  5.27  =  84.3 MB
GPU side, default  : 54.25 + 20.58 + 4.19 + 21.06  = 100.1 MB
+ retained CPU images                              ≈ 144 MB
```

**On a 4 GB phone** this is survivable but not comfortable: a Safari tab doing WebGL gets jetsammed
well below the nominal per-tab limit, and ~144 MB of image and buffer memory sits underneath a JS
heap this report has not measured. The actionable point is narrower and certain: **the "tex MB < 60"
readout understates the real footprint by ~2.6×.** `WORLD.md §5.10-E` asks for buffer tracking as an
additive change — the number it wants is 19.22 MB and it is above.

**Severity: medium. Effort: one-liner** to track buffers in `budget.js`; **medium** to drop the CPU
canvases (`tex.image = null` after first upload, or bake through `ImageBitmap`), and that trades
against context-loss recovery.

### 3.4 Draw calls — 79–100 of 150, and the margin is where the content isn't

**[M]**, reproduced this session at the gate profile with `shadowRate` forced to every frame:

| | calls | tris |
|---|---|---|
| `wall_day` | 88 | 227.7k |
| `street_dusk` | 81 | 157.8k |
| `gate_night` | 61 | 158.5k |
| `town_night` | 90 | 163.4k |
| `creek_day` | 91 | 114.8k |
| **worst traverse frame**, (−520, −142) | **79** | **224,977** |
| worst-calls traverse station, (−116, 74) | **100** | 130.0k |

I reproduced the worst traverse frame independently by placing the camera at (−520, −142) yaw 120°:
**224,977 triangles, 79 calls** against `TRAVERSE_A7.json`'s 224,506 / 79 — **0.2 % agreement**. The
A7 numbers hold.

**Nothing is un-batched that should be batched.** Foliage is `InstancedMesh` per zone per kind
(≈12 named parts drawn per frame); buildings merge per 60 m block into one detail set and one proxy
set; decals bucket into 120 m cells; roads cut into 110 m runs. The one thing that *would* explode
calls is already prevented (`app.js:69-71`, point lights excluded from `castShadow`).

**The risk is where the margin sits.** Calls scale with *blocks inside the cull radius*, which is an
area, so a denser town does not add calls. But the worst-calls frame (100) is on the **King's Road
between towns** — countryside that today is bare (§3.6). Populating it adds foliage instance meshes,
ground chunks and decal cells: **[G]** +10–15 calls → ~115 / 150, **23 % margin**. Thinner than
triangles, and A7's own handover note flags calls as the number to watch.

### 3.5 Three towns, not one — does the 350k gate survive? **Yes, at ~22 % margin instead of 36 %.**

The measured worst frame, decomposed **[M]** (camera at the traverse's worst station, scene-graph
walk with three's own frustum/visibility rules applied):

| bucket | tris |
|---|---|
| buildings | 60,848 |
| foliage | 34,656 |
| ground | 21,382 |
| people | 14,518 |
| bank | 4,536 |
| decals | 4,355 |
| water | 2,812 |
| roads | 2,100 |
| **main sum** | **145,207** |
| shadow (total − main) | **79,770** |
| **total** | **224,977** |

3 detail block-holders + 1 proxy visible.

#### The key measurement: the demo district is *denser* than the spec town

This is the number that decides the question, and it goes the opposite way to the caveat in
`NOTES_WORLD_A7.md`.

**[M]** — walking `demo.builder.doc.objects`:

| district | objects | mix | footprint | m² / object |
|---|---|---|---|---|
| 0 (light) | 30 | 1 wallRun · 3 tower · 7 house · 19 mass | 52 × 68 m = 3,538 m² | **118** |
| 1 (neutral) | 28 | 1 · 3 · 7 · 17 | 52 × 67 m = 3,494 m² | **125** |
| 2 (dark) | 22 | 1 · 3 · 7 · 11 | 52 × 64 m = 3,323 m² | **151** |

**Spec town, `WORLD.md §6.3` + §3.1:** 160 objects over a 240 × 200 m footprint = 48,000 m² =
**300 m² per object**.

The spec town is **2.4× less dense** than the demo district. The demo's 27–30 objects are a clot
inside a single 60 m LOD block; the spec's 160 are spread over 13.3 blocks.

#### Objects per detail block

```
demo   [D]:  mean tris/object in district 0
             = (1×4,200 + 3×3,600 + 7×4,300 + 19×168) / 30
             = (4,200 + 10,800 + 30,100 + 3,192) / 30 = 48,292 / 30 = 1,610 tris/object
             drawn buildings 60,848 / 1,610 = 37.8 objects across 3 detail blocks
             = 12.6 objects per detail block

spec   [D]:  160 objects / (48,000 m² ÷ 3,600 m² per 60 m block) = 160 / 13.3
             = 12.0 objects per detail block
```

**12.6 vs 12.0 — effectively identical.**

#### Triangles per object

Measured alone by `tools/budget.mjs` this session **[M]**: `mass` K=1.5 **130**, `house` K=1.5
default **4,400**, `wallRun` 60 m **3,700**, `tower` demo mean **3,600**.

```
spec mix [D]: 100×130 + 45×4,400 + 10×3,700 + 5×3,600
            = 13,000 + 198,000 + 37,000 + 18,000 = 266,000 tris per town
            266,000 / 160 = 1,663 tris/object
demo                                            = 1,610 tris/object
ratio                                           = 1.033×
```

**So the detail-block building cost scales by `(12.0 / 12.6) × 1.033 = 0.98×` — it does not grow.**
A whole spec town is 5.5× a demo district (266k vs 48.3k), but the frame never draws a whole town; it
draws 3 detail blocks, and a block holds the same number of objects either way.

#### What *does* grow: the landmark blocks

Measured alone **[M]**: Sanctum **23,700** · Tithe Barn **9,400** · precinct wall 130 m **8,100** ·
curtain 115 m **6,700** · Lantern Spire 4,700 · Black Keep 3,100 · Granary 2,300.

The Sanctum alone is **1.17× an entire current detail block** (60,848 / 3 = 20,283). Whitewall's
Sanctum Yard puts the Sanctum and the Spire in one 60 m block:

```
[D] Sanctum 23,700 + Spire 4,700 + ~10 infill × 1,663 = 23,700 + 4,700 + 16,630 = 45,030
    vs a normal block's 20,283  →  2.22× a normal block
```

#### The extrapolation

```
[D] buildings   3 blocks, one of them the Sanctum Yard:
                45,030 + 2 × 20,283            = 85,596   (was 60,848,  +24,748)
[M] foliage     unchanged — see §3.6           = 34,656
[M] ground                                     = 21,382
[G] people      three real towns, ×1.5         = 21,777   (was 14,518,  + 7,259)
[M] bank                                       =  4,536
[D] decals      §6.7: 160-object town ≈ 8k     =  8,000   (was  4,355,  + 3,645)
[M] water                                      =  2,812
[M] roads                                      =  2,100
                                                 ───────
    main                                       = 180,859   (was 145,207,  ×1.246)

[D] shadow      buildings are 42 % of main and scale ×1.407 (85,596/60,848);
                shadowDist 60 m sits inside the 70 m detail radius, so the
                casters are the same geometry:
                79,770 × (0.42 × 1.407 + 0.58) = 79,770 × 1.171 = 93,410

    TOTAL                                      = 274,269   vs the 350,000 gate
    margin                                     = 21.6 %
```

Without a landmark-class object in the detail set, the same arithmetic gives **≈ 243k → 31 % margin**.

**Verdict.** The gate survives, at **~22 % margin at the worst frame** rather than 36 %. It survives
for a reason worth writing down: the culled frame does not scale with the town, it scales with
*object density per 60 m block*, and the spec town is less dense than the demo district. What can
eat the margin is not 160 objects — it is **one Sanctum**. `WORLD.md §6.3` already says "budget the
big enterable buildings, not the landmarks"; this quantifies it at ~25k of the ~125k of remaining
margin for a single block.

**Two things this does not cover.**

- **Sightlines.** Whitewall's four radial avenues all point at the Spire and Longacre's High Street
  is 18 m wide and straight. Long sightlines put more blocks in the frustum at once than the demo's
  52 × 68 m clot ever can. The traverse harness is the right instrument and it must be re-run at A8.
- **The `blk` lever.** If it does climb, A7's handover names the fix: `BLK` is 60 m and everything
  reads it. A coarser cell trades culled triangles for fewer calls.

### 3.6 The `scatter.js` scenario-camera caveat — real, but it does **not** threaten the gate

**What it is.** `scatter.js:608-609` gates all placement on distance to the five scenario cameras:

```js
const reach = this.reach ?? 150;
const off = (x, z, pad = 0) => camDist(x, z) > reach + pad;
```

`camDist` (`terrain.js:79-83`) is the distance to the nearest entry in `CAMERAS`, which `demo.js:41`
fills from its own five-shot table. Foliage is placed **only inside five 150 m discs**, and there is a
second weighting inside them (`scatter.js:737`, `smoothstep(126, 26, camDist)`).

**How badly [D].** The five camera world positions, from `demo.js:18-33` (`SHOTS` offsets plus
`field.js` `TOWNS` centres): (−568, −122), (0, 84), (502, −88), (40, 86), (−4, 152). Numerically
integrating the union of five r = 150 discs clipped to `PLAY` (x −680…680, z −360…280 = 870,400 m²):

```
foliage-covered area = 233,720 m² = 26.85 % of the playable world
```

**73 % of the world the player can walk to has no foliage placed at all.** Walk to the Chalk Downs,
the North Moor, the Water Meadows, the Ashen Heath or anywhere along the Drove Road and the ground is
bare. That is a *look* failure, and it is severe — grounding is 20 % of the critic's rubric.

**But it does not inflate the perf numbers, and here is why.** Applying `camDist` to the 333
traverse stations:

```
[D] stations within 150 m of a scenario camera : 114 / 333 = 34.2 %
    median station distance to nearest camera   : 202 m
```

So the traverse's **p50 of 55.4k is optimistic** — two thirds of its samples see an empty world.
Correcting it: a populated frame carries 27.7k–34.7k of foliage **[M]**, so a fully-scattered p50 is
roughly **55.4k + 28k ≈ 83k**, still a fifth of the gate.

**The worst frame, however, is already fully scattered.** All ten of the traverse's highest-triangle
stations sit **35–97 m** from a scenario camera, i.e. inside a bubble, and the worst one (−520, −142)
is 52 m out and already draws **34,656** foliage triangles. It is a genuine worst case.

**And player-centred placement will not raise it**, because the instance budget is a global cap, not
a density. Measured source instance totals **[M]**: grass 13,200 · bush 1,020 · flower 960 ·
rock 510 · 234 per tree kind × 12. `focus()`/`repack()` (`scatter.js:1017-1058`) re-packs *within*
those caps. Redistributing the same 13,200 grass instances from five bubbles to one player-centred
bubble concentrates them — it does not create more.

**The real risk it moves is fill rate, not triangles.** `WORLD.md §6.4` proposes 3,000 grass
instances over a 60 m radius = one clump per 3.8 m², against today's one per ~20 m². That is **5×
the near-field density** of alpha-tested cards, which is 5× the overdraw in exactly the band where
overdraw is most expensive. The triangle count will be capped and flat; the fill rate will not be.
That is item (4) in §3.2 and it is the second thing the phone test should answer.

**Severity: medium** (look, not perf). **Effort: medium** — A7 left the machinery in place; the loops
in `build()` want `camDist` swapped for a distance to a moving centre and a re-run on the same
threshold.

---

## When Aaron runs the phone test

Everything below is a **live registered knob**, so it can be set straight from the URL —
`main.js:133-134` applies `preset` first and then any query key that `quality.knobs` recognises. No
rebuild, no code change, and several can be combined in one load.

### Step 0 — the test as written measures the wrong thing. Run it twice.

```
…&hud=1&preset=medium&shot=street_dusk            ← what a player actually gets (dpr cap 2, 1.32 Mpx)
…&hud=1&preset=medium&shot=street_dusk&dpr=1      ← the gate as measured (0.33 Mpx)
```

**4.00× the pixels** between them (§3.1). If fps recovers on the second URL, the answer is fill rate
and you already know it before running any of `PHONE_TEST.md`'s own A/Bs. If it does *not* recover,
the problem is CPU or geometry and A7's culling work is the right lever.

Then run the document's `renderScale=1.0` vs `0.6` A/B **without** `&dpr=1`, so it is measured against
the shipped configuration.

### If it is fill-rate bound — disable in this order

Each line is one page load. Stop at the first that recovers 60 fps; that names the culprit.

| # | knob | from → to | why it is here | expected |
|---|---|---|---|---|
| 1 | `shadows` | `soft` → **`hard`** | 25 dependent fetches/pixel → 1. `BasicShadowMap` skips the `forgePenumbra` branch entirely. §3.2(1) | biggest single win; hard shadow edges |
| 2 | `windowLights` | 18 → **0** | 18 point lights are evaluated on every fragment of the frame, lit or not. **Night scenes only** — no effect by day. §3.2(2) | large at night, zero by day |
| 3 | `foliage` | 0.6 → **0** | isolates alpha-tested overdraw with no early-Z. This is `PHONE_TEST.md`'s own second A/B and it belongs here, not as an afterthought. §3.2(4) | large near the camera |
| 4 | `dprCap` | 2 → **1** *(via `&dpr=1`)* | 4× the pixels. Not a fix, a diagnostic — but if 1 is the only thing that works, this is the shipping default and it needs a decision | 4× the fill |
| 5 | `shadowDist` | 60 → **45** | geometry, not fill: fewer casters in the map. `WORLD.md §6.6` item 1 | ~35k triangles |
| 6 | `envPower` | 0.58 → **0** | removes the PMREM cube fetch per fragment. Diagnostic only — it destroys the look. §3.2(5) | moderate, everywhere |
| 7 | `viewDist` | 180 → **130** | pulls fog in; drives every cull radius (`lodCull`, `groundCull`, `foliageCull` all multiply it) | moderate; visible world shrinks |
| 8 | `foliageCull` | 1.15 → **0.6** | halves the foliage draw radius without thinning the near field | small |
| 9 | `shadowRate` | `15hz` → **`10hz`** | CPU and geometry, not fill. Only helps if step 0 said CPU-bound | small |

### Confirm these are off before believing any number

- `ao` must read `off` (`post.js:23`). If it is `half`, note that GTAO's depth/normal prepass still
  runs at full resolution (`post.js:74-76`) — "half" is not half.
- `aa` must read `off` (`aa.js:53-54`). It persists in `localStorage['forge.aa']`, so a previous
  session can have left `native` on, and `native` means MSAA on a 1.32 Mpx framebuffer.

### While the phone is in your hand — three things only it can answer

1. **Turn it to portrait and back mid-game.** §1.11 says this should work; confirm the pause lands
   and the card covers the touch pads. Then start a **fresh** run and turn it to portrait *during the
   faction slate* — §2.4 predicts no rotate prompt and an overflowing three-panel row.
2. **Trigger a conversation.** `?quest=light.01` is the only way in right now (§2.1). §1.1 predicts
   the dialogue panel completely covers the school dial and the action button.
3. **Look at the bottom-left and bottom-right corners on a notched phone.** §1.2 predicts 43 px of
   the dialogue and of every choice button sitting inside the cutout.
