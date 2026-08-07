# P3 — the fleet layout editor, and the fly-out that shows it happening

You are the only coder agent running. P1 and P2 have landed — read `HANDOFF_P1.md` and
`HANDOFF_P2.md` first. P1 moved the fleets, put the bridge on a real flagship and rewrote
`fleet.js` / `sequences.js`; P2 added the noon→dusk opening and WebGL context recovery.

Then read `DECISIONS.md` **D33** (the ruling this implements) and **D30** (why the flagship matters
here), plus the standing rules at the bottom of that file. `MANAGER.md` has the traps.

## What Aaron asked for, in his words

> the layout of your ships is auto-done for you, first time in, highlight the top right box for this
> layout, and allow it to be clickable. maybe even have a nice pointer that says click-me (first time
> in). Clicking on this makes it mostly full screen with the following options: "Shuffle" (or
> "Randomize")(Randomizes placement of ships), allow drag of ship to move (showing conflict if ships
> touch each other), single click or after drag, also show a rotate next to the ship or somewhere on
> the layout. Maybe say a short line that says, drag or tap on ships. Close(cancel) Undo / Save
> changes to layout. What would be AWESOME, is if the camera (on save), flies out of the cockpit into
> birds-eye view to watch the fleet change position live!!! with a skip button somewhere on the screen
> and a check-box to "don't show again" although have a setting in pause-settings to toggle on off
> there as well. On cancel or save (after camera cut-scene if on) close the layout panel to once
> again show the play board.

## The pieces

### 1. The entry point

The top-right box is `.hud-own` in `js/ui/hud.js` — your own grid plus the roster. Make it a
control: tappable, with a focus state and an accessible label.

**First time only**, draw attention to it: a pointer or callout reading something like "your fleet —
tap to change it". Store the fact that it has been seen in `save` (`js/save.js`), so it appears once
per player, not once per match. It must not block a tap on anything and it must go away the first
time the box is used.

### 2. When it may be used — D33

`sim.setBoard()` currently refuses outside `SETUP`/`PLACING`. It separately refuses once that side
has been fired on, and **that** is the guard that matters — it is the actual cheat. D33 rules that
`setBoard` may run in `AIM` while `p.board` is still untouched. Make that change in `js/sim/state.js`,
keep the untouched guard exactly as it is, keep the phase in `AIM` afterwards, and **re-run
`node sim.mjs 2000`** — the sim is the one part of this project with a real gate on it. Also run
`node tools/purity.mjs`.

So: editable until the enemy resolves its first shot on you, which in practice is your whole first
turn. After that, tapping the box still opens the panel — **read-only**, a large legible view of
your own grid, with one line saying why it can no longer be changed. A dead control that gives no
reason is worse than no control.

### 3. The panel

Near-fullscreen, non-modal in feel — **never `alert`/`confirm`/`prompt`**, and it must be
dismissable. Aaron plays on a phone, so this is a portrait-first layout with thumb-sized targets.

- **Shuffle** — re-randomises the whole fleet. `js/ui/setup.js`'s `showPlace()` already has a good
  scatter (`auto()`, with `sim.packedPlacement` as the guaranteed-legal fallback). Reuse that logic;
  do not write a third copy of it.
- **Drag a ship to move it.** Pointer events, works with a finger.
- **Tap a ship, or finish a drag, and a rotate control appears** on or beside it.
- **Conflict shown live.** Overlap is illegal — mark it red and block Save, with the reason stated.
  Ships merely *touching* are legal under the sim's rules; Aaron's wording asks to see that too, so
  show adjacency as a soft amber note, never as a block. Do not change what the sim permits.
- A short line of instruction: "Drag or tap a ship. Tap again to rotate." — his phrasing, your
  wording.
- **Undo**, **Cancel** (restores what you came in with) and **Save changes**.

`showPlace()` is the pre-match placement screen and is a reasonable model, but it is a
tap-to-place tray, not a drag editor. Share the geometry helpers; do not try to make one function
serve both.

### 4. The fly-out on save

This is the part Aaron is most excited about, so it is worth doing properly.

On Save: leave the bridge, climb to a bird's-eye over your own formation, and **watch the escorts
take their new stations** — then come back to the board.

Three things you need to know before you design it:

- **The flagship carries the bridge and must not move.** P1 pins the longest ship of side 0 at the
  world origin with the room built onto it. A re-layout moves the *escorts*. That is not a
  limitation to work around — it is the shot: you fly off your own ship and watch the rest of the
  fleet re-form around you.
- **The enemy fleet is dramatised and must not change.** It is drawn from `dramaSeed` and stored
  with the match so a resume puts it back where the player last saw it.
- `fleet.layout()` disposes and rebuilds every ship. For ships to *move* rather than teleport you
  will need something new in `js/world/fleet.js` — a re-layout that keeps handles whose length
  matches and tweens them to their new stations. Keep the diff small and additive; P1 has just
  rewritten that file.

The camera: add **one new generator** to `js/cine/sequences.js`, appended. Do not edit the existing
eight — P1 has just reworked `fire_out`, `open_flyover` and `bridge_settle` and they are proven.
`aim.release()` hands the camera over and `aim.take()` brings it back (D25); `rig.adopt()` /
`rig.release()` are the halves of the handoff.

Controls during the cutscene: a **Skip** button and a **don't show this again** checkbox, both on
screen. Skip must land the same end state as watching it — the layout is saved either way. The
checkbox writes a setting, and the same setting gets a row in **pause → Settings** (`showSettings()`
in `js/ui/flow.js`) so it can be turned back on.

On Cancel — or on Save once the cutscene ends or is skipped — close the panel and return to the
board, with the turn in exactly the state it was in.

## What you own

`js/ui/hud.js`, `js/ui/setup.js`, `js/ui/flow.js`, `js/ui/overlay.js`, `js/save.js`, `style.css`,
the `UI` block of `js/config.js`, one guard in `js/sim/state.js` (D33), one new generator appended to
`js/cine/sequences.js`, and an additive re-layout in `js/world/fleet.js`.

**Do not touch:** `js/world/ship.js`, `js/world/bridge.js`, `js/world/sky.js`, `js/engine/`,
anything under `js/world/vfx/`. `js/main.js` is frozen — if you need wiring there, say so in your
handoff and I will rule on it.

No scored scenario may move. Prove it on `bridge_table`, `guns_fire` and `sea_dusk`:
`tools/shot.mjs --shot=<id> --dpr=1 --w=1600 --h=900` (never `--dpr=2 --w=1280 --h=720`; it has hung
for three independent parties). Per D13 a pixel diff means nothing without a same-code control — and
per P2's finding, that control is only valid **rendered next to** what it controls for, because the
harness settles a fixed number of frames rather than a fixed amount of simulated time.

## How to prove it

Drive the real game headless over CDP. Working harnesses in the scratchpad at
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/`:
`wl_soak.mjs` (boots, plays ten turns with shell/heavy/salvo, portrait, save, resume) and
`wl_ctx.mjs`. Copy, do not edit in place. Both set `Network.setCacheDisabled` and a fresh
`--user-data-dir` (D28). D36's trap: `awaitPromise: true` on `flow.fire()` waits for the whole turn.

Deliver, as images read back with the Read tool and as measurements:

1. the first-time pointer on the own-grid box, **in portrait 390×844** as well as landscape
2. the editor open, portrait, with a ship mid-drag and an overlap showing as a conflict
3. the rotate control visible on a selected ship
4. three frames of the fly-out: leaving the bridge, the bird's-eye with escorts moving, and back on
   the board
5. the read-only panel after the enemy has fired on you, with its reason line
6. `node sim.mjs 2000` and `node tools/purity.mjs` passing
7. a full soak — ten turns, portrait, save, reload, resume — with **zero console errors**, run after
   your changes
8. draw calls and texture MB in a live match, and the peak during the fly-out. Ceiling is 120 main;
   a recent settled match reads 63–85 main and 39.6 MB against 45.
9. Skip and watch produce the same board state — assert it, and say what that assertion could not
   have caught.

## Budget

Two passes, then I review. A crash or an API error does not consume a pass. Write `HANDOFF_P3.md`:
what changed, what you measured, **what your tests could not have caught**, and anything that
belongs in `DECISIONS.md`.
