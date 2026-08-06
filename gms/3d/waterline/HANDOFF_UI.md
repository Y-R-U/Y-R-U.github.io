# WATERLINE — C7 handoff: UI, game flow, dormant multiplayer

**Pass 2 of 2 (D18). This is the last pass.** Everything under "PASS 2" is current; everything from
"PASS 1" onward is kept for history and is superseded where it says so.

Files owned: `js/ui/*`, `js/save.js`, `js/net/multiplayer.js`, `style.css`, and — newly, per **D25**
— the `UI` block of `js/config.js` and nothing else in that file.

Edited this pass: `js/config.js` (`UI` only), `js/ui/flow.js`, `js/ui/aim.js`, `js/ui/setup.js`,
`js/ui/hud.js`, `js/ui/present.js`, `js/ui/overlay.js`, `js/save.js`, `style.css`.
`js/net/multiplayer.js` and `js/ui/ladder.js` were not touched. Nothing outside the owned list was
edited.

```
open index.html                 # that is still the whole install
window.__waterline.flow         # the state machine, exposed for the harness
```

---

# PASS 2

## P2.0 — what changed, in one paragraph

**A match now survives a reload, a backgrounded tab and a closed browser**, because the sim is pure
and `serialize`/`deserialize` round-trip it; the title screen offers *Carry on* with the position
written on it, and Pause grew a *Leave* that keeps the match beside the *Give up* that does not.
**The gameplay camera is a documented handoff rather than an override (D25)**: after a sequence ends
C7 takes the camera through C6's own `rig.adopt()` and gives it back with `rig.release()`, the pose
is solved by projecting the board's four corners rather than by a paraxial approximation that was
wrong by 30%, and the framing is BUILD_PLAN §7.7's — table in the lower middle under a band of
window — instead of pass 1's board-filling-the-frame. The drop-and-retry around `memoryProblem` is
gone now that the export exists. Every tunable C7 had is in `config.js`'s `UI` block. And the custom
builder can no longer be walked into a state it will not start from.

## P2.1 — match resume (priority 1)

`save.js` is at **schema v2**. One new section:

```js
match: null | { v: 1, game: <sim.serialize(game)>, cfg, drama, at }
```

* `game` is the sim's own serialization. `deserialize` is **structural** — it rejects a truncated
  write, an unexpected field, a `w` edited to 99 on a 100-cell board — so `save.js` validates only
  the envelope and does not duplicate a single one of those rules.
* `cfg` is what the match was started from: mode, grid, fleet, tier, ladder rung and name.
* `drama` is the seed the **dramatised** enemy fleet was laid out from (§7 of pass 1). Without it a
  resume would put the enemy ships somewhere else on the sea, which is the one visible thing a
  reload could get wrong.
* `MIGRATIONS[1]` adds the field, so a v1 save from pass 1 upgrades rather than being discarded.

**When it is written.** At the end of every beat (after the result lands, before the next turn), on
`visibilitychange` → hidden, on `pagehide`, and on `beforeunload`. All three because `pagehide` is
the only one iOS fires reliably and none of them is expensive. Measured size: **5.7 kB at turn 6 on
a 10×10** — it grows with the event log, so a long 16×16 match is tens of kB against a 5 MB quota.

**When it is cleared.** A match ending, *Give up*, *Discard* on the title, starting any new match,
and `Reset progress`.

**What the title shows.** *Carry on* above the menu, with `Fire Control · 6 shots in — you 5/5,
them 5/5` under it and a *Discard* link. Building that line is also where a save this build cannot
use is thrown away, so the button is never offered for a match that would then fail to load.

**Resuming does not replay the flyover.** `present.open(flyover)` takes a flag; a resume gets
`bridge_settle` only. Six seconds of establishing shot is for arriving, not for coming back.

**One property of pass 1 is deliberately given up.** Pass 1 said the private `layoutSeed` is "never
persisted". It is now inside the serialized game in localStorage. It is still never derived from
`?seed`, never logged and never in a URL, so D8's oracle — *the holder of a shareable link must not
be able to reconstruct the enemy fleet* — is intact. What has changed is that a player with devtools
can read their own opponent's board. That was already true of `viewAs` in the same console.

## P2.2 — the gameplay camera, per D25

**The seam, written as a handoff.** C6's pass 2 published exactly the two verbs this needs and
`js/ui/aim.js` now uses them and nothing else:

| | |
|---|---|
| `rig.adopt()` | C7 writes the play pose onto the camera and calls this. The rig takes that pose as its own and holds it every frame — **and free-look rides the same path**, so the drag-and-ease-back of brief step 2 is C6's code, not a second copy of it. |
| `rig.release()` | The rig goes inert. Used for the menu orbit and for the hand-over ease, both of which write the camera per frame and would otherwise be overwritten. |

`aim.take(ms)` is the only entry point. It is called after every beat, at match start, on resize and
when a match ends. **`frameIfSmall()` is gone** — there is no longer a measurement of C6's pose and
a conditional override of it, because the camera is unambiguously C7's the moment a sequence stops.

**This also fixes a case pass 1 was papering over.** `present()` plays `bridge_return` only after
*your* shot. After an **enemy volley** there is no return beat at all, so the camera was left out
over the water beside your own hull and pass 1's override cut back to the table in one frame.
`take()` now eases over `UI.camera.handOverMs` (620 ms) from wherever the sequence left it.

**Free-look was also broken after an enemy turn and is not now.** `rig.freeLook(true)` is set at the
end of `bridge_settle` and `bridge_return` and nowhere else, so an enemy turn ended with it off.
`settle()` turns it on; `release()` turns it off before handing the camera back, so a drag offset
cannot leak into a sequence.

**The fit is measured, not derived.** Pass 1 solved the distance paraxially. At a 30° depression the
board's near edge is a third of the distance of its far edge and projects far wider than its size at
the centre implies: measured, the paraxial solve asked for 74% of frame width and delivered
**98.5%**, with the table overflowing every edge. `solve()` now poses a scratch `PerspectiveCamera`,
projects the board's four corners and scales the distance by the overshoot until the projected box
fits, **and solves the aim in the same loop** — sitting the board low in frame puts it off-axis where
the projection stretches, so fitting first and aiming after left a portrait board 8% wider than the
frame.

Measured at the settled pose, board bounding box as a fraction of the frame:

| | target (`UI.camera`) | measured | camera |
|---|---|---|---|
| landscape 1280×800 | width 0.74, height 0.54, centre y −0.42 | **0.733 / 0.513 / −0.40** | 1.33 m above the chart, 1.9 m back, fov 46 |
| portrait 390×844 | width 0.94, height 0.46, centre y −0.44 | **0.939 / 0.137 / −0.43** | 1.33 m above the chart, 3.2 m back, fov 72 |

Height is not the binding constraint in portrait and cannot be: the deckhead is 1.73 m above the
chart so the camera cannot climb, and width forces it 3.2 m back. That is geometry, not taste —
see P2.8 item 1.

**Two constants moved and both are stated in `config.js` with the reason.** `back` 3.05 → **3.40**
(ROOM.d is 7.2 and the table is at z +0.15, so the bulkhead is 3.75 m behind it; at 3.05 a 10×10
board does not fit portrait at any field of view). Play-view `sway` 0.045/0.12 → **0.025/0.05**: the
`aim` term is a lateral offset of the look point, and at play distance C6's 0.12 m swings the board
±0.09 of the frame width — enough to move a cell out from under a thumb mid-tap.

**And a pass-1 defect nobody had noticed.** `parkWide()` posed through `rig.commit()`, which returns
immediately while `rig.posed` is false — and at boot no sequence has ever run. So **the title screen
was a frozen frame of App's boot pose until the player had finished a match.** Measured now:
`[69.8, 30, 53.6] → [61.9, 30, 62.5]` over three seconds, from a cold load.

## P2.3 — `memoryProblem`, and the `UI` block

`memoryProblem` is exported, so `loadMemory()` asks the sim directly and drops a bad memory with the
sim's own reason in a `console.warn`. **The drop-and-retry that rebuilt the whole game without the
memory is gone**, and with it the `try/catch/try` around `newGame`.

`config.js`'s `UI` export is filled and `flow.js`, `aim.js`, `overlay.js` read from it. It carries
`toastMs`, `turnGapMs`, `fastForward`, `aimExposure`, the whole `camera` block, `menu` and
`resumeMaxDays`. `export const UI` no longer exists in `flow.js`.

## P2.4 — the rest of pass 1's weakness list

**Firing into resolved cells is now remarked (item 4).** The HUD's hint line turns amber and reads
*Already fired here* / *4 of 9 already resolved* / *Every cell here is already resolved*. It reads
`view.grid`, which the sim has already redacted, so it can only ever say what this side is entitled
to know.

**The sunk-lengths strip exists (item 5).** Under the roster: `lost 3 2` / `sunk 5 4`. Legal
information under D6 — a ship's cells become known when it sinks — and without it a player who sank
a 3 twenty turns ago has no record of it.

**The custom builder can no longer be walked into a dead end (item 10).** Stepping the grid used to
leave a state that would not start: 6×6 with the classic fleet is over the 35% occupancy cap, 16×16
with it is under the 8% minimum, and each is one button tap away. The fleet now follows the grid.
Measured, from the classic default:

| | fleet | reason line | Start |
|---|---|---|---|
| stepped down to 6×6 | 5, 4, 3 | *3 ships · 12 cells · 33% of the grid* | enabled |
| stepped up to 16×16 | 5×7 | *7 ships · 35 cells · 14% of the grid* | enabled |
| then 16 ships added by hand | 23 ships | *at most 12 ships* | **disabled** |

A limit the player walks into deliberately still refuses, in the sim's words. Only the ones they
arrive at by touching a different control are fixed for them.

**The result panel has a backdrop again.** The last beat leaves the camera at an impact, which is a
dark hull filling the frame; `finish()` now calls `aim.take()` so the result reads over the bridge
and the finished chart.

**Pause is `Resume / Settings / Leave / Give up`**, with *Leave* keeping the match and saying so.

## P2.5 — how this was verified, and what each check does not cover (D24)

Everything below is **the real page driven through the DOM over raw CDP** — no `?shot=`, no
puppeteer — with `Runtime.consoleAPICalled` and `Runtime.exceptionThrown` collected throughout.
**Every run listed reported zero of both.**

| | measured |
|---|---|
| boot → Battle → live match | `YOUR MOVE / Fire Control / You 5/5 / Enemy 5/5 / SHELL ∞ HEAVY 3 SALVO 2 / FIRE` |
| **reload mid-match** | 3 shots fired, reload, *Carry on* → back at turn 6 with 3 resolved cells on the chart |
| **background and restore** | `visibilitychange` → hidden with the game running → the stored match reads `6 shots in` |
| **pause → Leave → Carry on** | title, stored match present, resumed at turn 2 |
| **pause → Give up** | title, stored match `null` |
| **a match won** | `ENEMY FLEET DESTROYED · LOOKOUT · 9 shots fired · 2 of 2 enemy ships sunk`, stats `games 1 / wins 1 / sunk 2`, stored match cleared |
| **a match lost** | `FLEET LOST · GHOST · 16 shots fired · 2 of 2 of yours lost`, stats `losses 1`, stored match cleared |
| **the ladder advancing** | rung 1 won → `{rung:2, best:2, wins:1, losses:0}`, opponent memory written, match cleared |
| **placement screen** | Auto-place → Ready → a live match with `[5,4,3,3,2]` on the board |
| **corrupt / hostile / future-version / truncated / hand-edited / stale saves** | all six boot to the title with defaults and **no** resume offered |
| **free-look** | at the play pose: drag → yaw −0.246 rad, camera rotation moves, eases back to 0 after `LOOK.idleMs` |
| **`?shot=` guarantee** | `#ui` and `#hud` `display:none`, `flowBooted:false`, camera at `bridge_table`'s authored `[-0.62, 19.8, -3.15]` fov 48, `rig.posed:false`, **95 calls / 47k tris — bit-identical to HANDOFF_CINE §P2.6** |
| **exposure at capture time** | `renderer.toneMappingExposure` **0.92** and the knob 0.92, read from the live play state, not from the call site |

**What these checks do not cover.**

1. **Everything is headless Chrome with touch emulation. Nothing has been played on a phone.** The
   framing numbers are geometry and will hold; how a 12 px cell feels under a thumb is not
   something this harness can answer.
2. **The camera checks are pose and projected-extent measurements, not renders.** I have looked at
   the play view in both orientations, at the title, at the result panel and at `bridge_table`, but
   I have not watched the 620 ms hand-over ease *in motion* — a stills-only check cannot see a
   stutter, an overshoot or a frame where the board leaves the frame mid-ease.
3. **The board fit is measured on the table's four corners at y = 0.** The bezel, the chart bleed
   and the peg heads sit outside that box and are expected to overflow; `fillW`/`fillH` are the
   playable grid, not the furniture.
4. **The resume test round-trips through localStorage and a real page reload, but always on the same
   build.** A save written by this build and read by a *later* one is only covered by the migration
   chain, which is untested past v1 → v2 because there is no v3.
5. **`saveMatch` is called at the end of a beat.** A tab killed *during* a presentation loses that
   turn, not the match; the stored position is the one before it. I have not tested a kill inside a
   beat, only a hide.
6. **The loss was produced by firing into the same resolved cell every turn** so the AI would win.
   That is a legal but degenerate line; it exercises `finish()`, the stats and the clear, not
   normal play.
7. **The free-look check drags at one point in landscape and reads `rig.lk`.** It does not cover the
   chart/off-chart discrimination on a touchscreen, two-finger gestures, or a drag that starts on
   the chart and leaves it.
8. **Draw calls were read from `renderer.info` at one moment in one match** — see below.
9. **Nothing here tests audio, because there is none.**

## P2.6 — counts (D4)

Read from `renderer.info.render` in a live match at the settled play pose, 1280×800:

| | pass 1's pose (manager's measurement) | this pose |
|---|---|---|
| draw calls | 196 total (167 main + 29 shadow) | **170 total (139 main + 31 shadow)** |
| triangles | 132.2k (112.9k main) | 136.6k (116.6k main) |
| texture MB | 39 | **39** — unchanged |

**Draw calls fell by 26 as a side effect of the framing, and that is a soft number, not a saving.**
It is entirely camera-dependent: the same build reads 140–177 depending on where the camera is in
the room and what the enemy turn left on screen, and portrait reads **177–199** because a 72° field
of view puts far more of the bridge in the frustum. Treat 199 as the figure to plan against, not
170. Nothing in this pass adds a draw call or a byte of texture on purpose — the HUD additions
(sunk-length chips, the wasted-shot hint, the resume line) are DOM.

The `?shot=` scenarios are unaffected and were confirmed so: `bridge_table` still renders at 95
calls / 47k tris with the rig unposed. `shots/bridge_table.png` was overwritten during that check
and has been **re-rendered at `--preset=high --dpr=1 --w=1600 --h=900` and looked at** — C2's dusk
bridge with the lit plot table over a sunset sea, as C6 left it.

## P2.7 — escalations

**E1, E2, E3 from pass 1 are closed.** The rig regression was fixed by C6, `memoryProblem` is
exported, and D25 gave C7 the `UI` block.

**E4 — the chart clutter still sits on playable cells.** `table.setClutter(false)` is still called
while a match runs: the parallel rule alone covers four cells and the notepad two. The instruments
are a third of what makes the table read as real and the scored `bridge_table` shot has them. If C2
moves the props into the chart bleed or under the bezel, the one line in `playScene()` comes out.

**E5 — the enemy turn has no return beat.** `present()` plays `bridge_return` only when the shot was
yours. C7 now eases the camera home itself, which is a correct fix for the game and a worse one for
the film: a cut back through the window is C6's shot and a 620 ms lerp is not. If C6 is ever
reopened, `present()` playing `bridge_return` after `enemy_volley` would be strictly better and
`aim.take()` would simply have less distance to cover.

**E6 — `vfx.hit`'s `out` normal is still not computed** (C6's own item 10). Carried, not mine.

## P2.8 — what is weak, ranked, honestly

1. **Portrait is playable and it is not good.** The board is **13.7% of the frame height** and cells
   are roughly 35 × 12 CSS px on a 390 px phone. This is a geometric dead end, not a tuning
   failure: fixing the board's width fraction fixes `d·tan(fov/2)`, so the only lever on its height
   is a shorter distance, which needs a wider field of view, and 72° is already close to where the
   room distorts. The real fix is to **view the board along its short axis in portrait** — turn the
   camera 90° so the ten columns run up the screen — and that is a different composition with a
   different relationship to the window and the HUD's own board. I did not attempt it in a final
   pass. Landscape is the hero and landscape is good.
2. **The 620 ms hand-over is a lerp, not a shot.** It reads as a camera move and not as a cut, which
   is the point, but it is a straight line between two poses with no ease on the path itself. See
   E5 — the right version of this is C6's.
3. **The presenter is still thin.** `present.js` is an adapter. When C6's `present()` is missing it
   falls back to table pulses and a wait — correct, dull — and §7.4's "impact plays in a corner
   inset" is still not built.
4. **No sound.** `settings.sound` is stored and read by nothing. It is not shown in the settings
   panel, so nothing lies to the player, but the field is dead weight.
5. **`stats` are one line on the title.** No history, no per-tier record, no accuracy.
6. **The resume offers no "how did I get here".** It restores the position and the chart, but the
   player gets no reminder of what happened last turn beyond the markers.
7. **`hook.sim.view/fire/ai` still close over `main.js`'s own `game`,** which a resumed match never
   sets. `hook.sim.game()` is repointed here so the accessor is honest, but the four delegating
   helpers cannot be without editing a frozen file. `window.__waterline.flow` is the supported
   handle and is always right.
8. **The custom builder's auto-fit adds copies of the largest ship** when a grid grows past the
   minimum occupancy. It is legal and instant but it is not a *good* fleet — `5,5,5,5,5,5,5` on
   16×16 is a starting point to edit, not a design.
9. **Untested on a real phone.** Still true, and now the only item on this list that a person rather
   than a pass could close.

---

# PASS 1

Kept for history. **§4 (the camera), §9 (escalations) and §11 (weaknesses) are superseded** by P2.2,
P2.7 and P2.8. §6's schema is superseded by P2.1. The rest — the screen map, the turn loop, the seed
rule, the ladder, the aiMemory decision, the dormant multiplayer seam and §12's driving notes — is
still current.

---

## 0. The one guarantee, verified by looking

**The HUD is absent from a `?shot=` capture.** Two independent defences, both measured at capture
time rather than at set time (D17):

1. `style.css` — `body.shotmode #hud, body.shotmode #ui { display: none !important }` (unchanged
   from W0).
2. **`js/ui/flow.js` does not boot at all when `?shot=` is present.** There is no game running
   behind the hidden div — no camera pose, no table repaint, no scene edit, nothing.

```
node tools/shot.mjs --shot=bridge_table --preset=high --w=400 --h=225 \
  --eval='({ui:getComputedStyle(document.getElementById("ui")).display,
             hudbox:getComputedStyle(document.getElementById("hud")).display,
             flowBooted:!!window.__waterline.flow, screen:document.body.dataset.screen||null,
             cls:document.body.className})'

eval: {"ui":"none","hudbox":"none","uiChildren":7,"flowBooted":false,"screen":null,"cls":"shotmode"}
```

I also rendered `shots/bridge_table.png` at 800×450 and read the PNG back: no UI in frame.

⚠ *(Pass 2: that render was broken by the rig regression at the time and has since been re-rendered
correctly — see P2.6. The UI-absence result stood either way and was re-confirmed in pass 2.)*

One more knob: the W0 perf readout (`#perf`) is hidden once the game is running
(`body.wl-play:not(.wl-perf) #hud`). `?perf=1` or `?hud=1` brings it back. Scenario captures are
untouched, because `wl-play` is only added when the flow boots.

---

## 1. Files

| File | What it is |
|---|---|
| `js/ui/flow.js` | The match controller: screens, the turn loop, the ladder, the save glue, the boot |
| `js/ui/aim.js` | Tap → shot on the 3D table, and the camera pose that makes a tap possible |
| `js/ui/present.js` | The turn hand-off to C6's presenter, plus a table-only fallback |
| `js/ui/hud.js` | In-play HUD: turn, ordnance + charges, target readout, FIRE, your own board |
| `js/ui/setup.js` | Title, custom-game builder, fleet placement |
| `js/ui/ladder.js` | Tournament screen |
| `js/ui/overlay.js` | `panel()` / `toast()` / `note()` — result, pause, settings, messages |
| `js/save.js` | The localStorage adapter. **The only file that knows where progress lives** |
| `js/net/multiplayer.js` | The dormant seam |
| `style.css` | The whole stylesheet |

### How they meet, given that `main.js` is frozen

`main.js` builds the four UI modules and never introduces them to each other, and it has no wiring
for a game loop. So each module calls `register(name, api)` from `flow.js` at build time; when all
four are up, `flow.js` boots on a **microtask** — which runs the instant `main.js`'s module body
finishes, so `window.__waterline` is fully populated and no `requestAnimationFrame` (and therefore
no visible tab) is required.

`hook.ui.*` keeps working: `hook.ui.arm(kind)`, `hook.ui.confirm()` (clicks `[data-fire]`),
`hook.ui.screen()`, `hook.ui.go(name)` all still resolve, because the `[data-fire]` / `[data-kind]`
hooks and the `overlay.show/screen` shape were kept from W0.

---

## 2. Every screen, and how to reach it

`document.body.dataset.screen` names the current one; `flow.screen` is the same value.

| Screen | Reached by | Leaves by |
|---|---|---|
| `title` | boot; "Menu" on any result; Back from anywhere | the menu entries (**pass 2**: plus *Carry on* / *Discard* when a match is stored) |
| `place` | **Title → "Place your own fleet"**, Tournament → "Place my fleet", Custom with *Place it myself*, or Settings → Fleet = manual | Ready → match · Back → title |
| `custom` | Title → "Custom game" | Start → (place or match) · Back → title |
| `ladder` | Title → "Tournament" | Fight → match · Back → title |
| `play` | any match start | the match ending, or Pause → Leave / Give up |
| `result` | the match ending | Fight again / Tournament / Menu |

Panels (`overlay.panel`) are in-page and never `alert`/`confirm`/`prompt`: Multiplayer, Settings,
Reset progress, Pause, and the match result. `toast()` is transient and blocks nothing; `note()` is
the standing callout used for "private browsing, progress will not be saved".

**D7, as built.** The title's big button starts a classic match in **one tap** with an auto-placed
fleet. The line directly under it — *"Place your own fleet"* — goes to the placement screen for the
same match. Manual placement is one tap away and auto-place is the default; neither is buried in a
settings menu (the setting exists too, and flips the default for every entry point).

**Placement screen.** Tap a ship in the tray, tap the grid to drop it, tap a placed ship to pick it
up, `Rotate` flips the orientation, `Auto-place` fills the whole fleet, `Ready` commits. Auto-place
is the prominent (amber) action. The auto layout is rejection-sampled here rather than taken from
`sim.packedPlacement`, because the packing lays every ship out in rows — or, rotated, in columns —
and as a *preview* that reads as a bug rather than as a fleet.

**Custom builder.** Grid steppers (6…16, `BOARD.min/max`), a fleet built from length buttons capped
at `min(w,h)`, opponent tier, auto/manual fleet. `sim.fleetLegal(w, h, lengths)` runs **on every
keystroke**, not on submit: the reason string is shown under the form and `Start` is disabled while
it is non-null. *(Pass 2: the fleet now follows the grid so a step can no longer produce an
unstartable state — see P2.4.)*

---

## 3. The turn loop

```
startMatch(cfg, placements)
  layoutSeed = entropy()            ← D8, see §5
  game = hook.sim.newGame(opts)     ← via the hook, so __waterline.sim.* stays truthful
  placeFleet(0, placements ?? null); placeFleet(1, null)
  → enterMatch(game, cfg, flyover)  ← pass 2: shared with resumeMatch()
      useTable(w, h) · playScene() · layoutFleets(view) · aim.frame()
      opening(flyover) → present.open() → C6's opening() + toBridge()
      nextTurn()

nextTurn()  side 0 → aim.take(), aim.setActive(true), refresh()
            side 1 → sim.fire(game, 1, sim.aiMove(game, 1)) → beat()

fire(shot)  whyIllegal → sim.fire(game, 0, shot) → beat()

beat(events, by)  busy=true → aim.release() → present.play(events, by, game) → busy=false
                  → refresh() → phase OVER ? finish() : saveMatch() → nextTurn()
```

`refresh()` is the single repaint: `sim.view(game, 0)` → `table.setState(view)` → `hud.setState()`.
Nothing else reads the game to draw with.

**Two-stage commit (BUILD_PLAN §3.2).** A tap or a drag on the chart moves the ghost; a second tap
inside the same footprint fires; the HUD's FIRE button commits from anywhere. That is what makes a
20-pixel cell workable with a thumb — the small target only ever *moves* the ghost, and the big one
fires. `js/ui/aim.js` never rounds a coordinate: it raycasts the table's own plane, brings the point
into table-local space and calls `table.localToAnchor(local, kind)`, exactly as HANDOFF_BRIDGE §4
specifies, then `sim.footprint()` → `table.showGhost()`.

**Free look (brief step 2) is wired.** A drag that lands on the chart moves the ghost; a drag
anywhere else calls `rig.nudge(dx, dy)`. One gesture, two meanings, told apart by what is under the
finger. *(Pass 2: measured working at the play pose, and now enabled after an enemy turn too.)*

**Hold anywhere = 4× fast-forward** (`UI.fastForward`), routed to `cine.fastForward(true|false)`.
Not a skip: the result still lands.

---

## 5. `layoutSeed`, and the seed rule (D8)

```js
seed:       entropy(),   // public, drives the AI's tiebreaks
layoutSeed: entropy(),   // PRIVATE — the fleet layouts
```

`entropy()` is `crypto.getRandomValues` with a `Date.now() ^ Math.random()` fallback. The layout
seed is **drawn at the UI layer, never derived from `?seed`, never logged and never put in the
URL**. *(Pass 2: it is now written to localStorage inside the serialized match — see P2.1 for why
that does not open D8's oracle.)*

`newGame` throws without it, which is the point: the sim is pure and cannot draw its own.

---

## 6. `save.js` — the schema, and how to migrate it later

*(Superseded by P2.1 for the `match` section and the version. The mechanism below is unchanged.)*

```js
{
  v: 2,
  settings: { cine: 'auto'|'full'|'off', place: 'auto'|'manual', sound: true },
  ladder:   null | { rung, best, wins, losses, complete },   // a sim LadderState, verbatim
  memory:   null | Memory,                                   // a sim Memory, verbatim
  stats:    { games, wins, losses, shots, hits, sunk },
  custom:   null | { mode, w, h, fleet, tier, manual },      // the builder reopens where it was left
  match:    null | { v, game, cfg, drama, at },              // the match in progress (P2.1)
}
```

One key, `localStorage['waterline']` (`SAVE_KEY`). API: `get / set / patch / bump / remove / all /
clear`, plus `available` (false in private browsing — the game says so once, in a `note()`, and
plays on).

**Migration.** `MIGRATIONS[v]` turns a `v`-shaped save into a `v+1`-shaped one; `read()` runs every
step from the stored `v` up to `VERSION`. Append steps, never edit one that has shipped. A save with
`v > VERSION` is **discarded**, not half-read — a newer build's save cannot be migrated backwards.

**Hostile saves are dropped section by section**, because localStorage is user-editable and a bad
section reaches either the sim (a `Memory`) or a screen (a `rung`). Measured before the fix:
`{v:99, ladder:'nonsense', stats:42}` survived intact into the ladder screen. Now each section is
shape-checked and reset to its default if wrong.

**When the br8t account layer wakes up**, `createSave()` is the only thing to replace: give it the
same seven methods over a cloud document, keep `v`, and run the same migration chain. Nothing else
in the game reads storage.

---

## 7. The ladder

The table is **`sim.ladderRungs`, not `config.LADDER`** (HANDOFF_SIM R8 — config's shape has no room
for the per-rung ordnance budget, which is the difficulty dial). Eight rungs; a win climbs, a loss
drops one but never below 1, a rung-8 win sets `complete`. `sim.applyLadderResult(state, won)` is
pure and `save.set('ladder', …)` is the only place a result becomes progress.

The screen lists every rung with its grid, fleet, ordnance and tier, marks the current one, and
offers `Fight <name>` / `Place my fleet` / `Reset`.

**A table per grid size.** `main.js` builds one 10×10 table and freezes it into `hook.world.table`;
the ladder plays on 8×8 and 12×12. `flow.useTable(w,h)` builds and caches one table per size,
parents it to `bridge.tableAnchor`, shows only the current one, **and repoints `hook.world.table`**
so C6's presenter pulses the board actually on screen. `table.js` keeps its own pump list, so a
second table animates with no wiring. Cost is geometry and draw calls only — the sheen texture is
memoised at module level and materials are shared, so it is ~0 MB against the texture budget (D16).

**Fleet layout is C7's stopgap.** Nothing else calls `fleet.layout()`, and every cinematic beat asks
the fleet where a cell is. Side 0 is laid out from the player's real cells. **Side 1 is dramatised**
and has to be: the sim will not say where the enemy's ships are, and that is precisely what D2's
caption exists for. It is drawn with `packedPlacement` from a seed of its own, which pass 2 stores
with the match so a resume does not move the enemy fleet. Note `fleet.layout(side, view)` wants
`{ fleet: [{id,len,r,c,dir}] }` — ship *defs* — while a sim `View.fleet` is a `number[]` of lengths
(renamed in sim revision 2). C7 adapts between them.

---

## 8. `aiMemory` — the decision, and why

**Wired, for the tournament only.** `save.memory` holds one `Memory`; after every ladder match
`observeLayout(mem, w, h, revealedLayout(g, 0))` and `observeShots(mem, w, h, shotHistory(g, 0))`
run and the result is persisted. Skirmishes (Battle, Custom) neither read nor write it.

Why on:

- **D7 is the reason it exists.** The player places their own fleet, so the "one good layout beats
  every tier forever" exploit is live by construction. HANDOFF_SIM §7 measures it: a hand-placed
  edge layout costs tier 4 **26.1** shots with no memory against **12.6** once it has learned. The
  static `coverage⁻¹` correction alone gets it to +4% over random, which is *most* of the fix —
  but rung 8's opponent is called Ghost and "adapts to a player who repeats a layout" is the whole
  of its character. Without memory, rung 8 is rung 7 with a bigger board.
- **The poisoning objection is closed and measured, not argued.** `placementPrior` clamps the
  learned multiplier to `[1.0, 1.8]`, so learning may only ever *add* attention to a cell. Soak
  result: `rung 8, tier-2 player: auto-place 10.0% · one honest layout 0.0% · 12 poison games then
  switch 0.7%`. Deliberately teaching Ghost the wrong map is **worse** than not bothering.
- **The failure mode is bounded.** With no memory, or with one the sim refuses, Ghost falls back to
  the static prior: strictly weaker, never broken.

The safety rail is now the sim's own: `loadMemory()` calls **`sim.memoryProblem(raw)`** and clears
the section if it returns a reason. Pass 1's drop-and-retry around `newGame` is gone (P2.3).

---

## 10. Dormant multiplayer

`js/net/multiplayer.js` touches nothing at import: no fetch, no `/lib/auth/` import, no side effect.
`available()` is `location.hostname === 'games.br8t.com'` and nothing else. The mode is **visible and
explains itself** rather than hidden — W0's stub said absent, the brief overrode it, and a missing
mode reads as unfinished while an explained one reads as deliberate. The copy is not an apology:

> Multiplayer needs the accounts layer on games.br8t.com. This is the offline build — everything
> else here runs with no connection at all.

The seam is shaped so a live build is a transport job and never a rules job. The sim is pure and
deterministic, so a match is fully described by the `newGame` options plus the shot stream:

```js
connect() → { side, opts, send(shot), onShot(fn), onLeave(fn), close() }
```

`opts` carries the `layoutSeed` the host drew and the guest never sees. `flow.startMatch(cfg,
placements)` already drives a side from exactly that, so wiring it up means replacing `aiMove` with
a socket in `nextTurn()`. No board ever crosses the wire, which keeps fog of war on the sim's side
of it.

---

## 12. Driving it

```js
const f = window.__waterline.flow;
f.quick(false)            // classic match, auto-placed
f.quick(true)             // …via the placement screen
f.ladder(8)               // fight a rung
f.start(cfg, placements)  // any config, bypassing the legality check
f.aimAt(4, 4, 'salvo')    // arm a footprint (snaps through sim.snapTarget, and syncs the HUD)
f.fire()                  // commit it
f.view()                  // sim.view(game, 0)
f.screen()                // 'title' | 'custom' | 'place' | 'ladder' | 'play' | 'result'
f.flow.busy               // true for exactly the length of a beat
f.stored()                // the resume descriptor, or null
f.resume()                // resume the stored match
f.persist()               // write the match now
f.title()
```

`tools/shot.mjs` always loads with `?shot=`, which is exactly the case where the UI does not exist,
so it cannot screenshot a screen. Drive the real page with a CDP script instead. Things worth
stealing if you rebuild one:

- **Take the first `/json/list` entry whose `type` is `"page"`.** A fresh Chrome profile lists an
  extension `background_page` first, and connecting to that gives a session where `Page.navigate`
  appears to succeed and the page never loads. This cost two runs and looked exactly like the game
  failing to boot.
- **With touch emulation on, `Input.dispatchMouseEvent` hangs.** A `--mobile` run must send
  `Input.dispatchTouchEvent`.
- **`Emulation.setDeviceMetricsOverride` is required for a useful screenshot** even in
  `--headless=new` with `--window-size`; without it `Page.captureScreenshot` returns a few pixels.
- **Wait on `!director.playing() && !flow.busy && screen()==='play'`**, not on `!busy` alone: there
  is a turn gap and a hand-over ease either side of it, and a single read lands in one of them.
- **Do not edit a source file while a run is in flight.** The dev server will happily serve a
  half-written module and the page fails to boot with no error anywhere useful.

### The one real bug pass 1 found this way, and how

The result panel closed itself about 1.2 s after appearing and dumped the player on the title
screen. Two things made it findable rather than mysterious:

1. **Watch the value over time instead of reading it once.** Polling `screen` every 200 ms showed
   `result … result … title` with no input in between.
2. **A stack trace at the suspect function, not a theory about it.** `console.warn(new Error().stack)`
   in `showTitle()` and `finish()` showed `finish` called **twice** — once from `beat ← fire`, once
   from `beat ← enemyTurn`.

Cause: `beat()` ends with `await sleep(UI.turnGapMs); nextTurn()`. A shot fired inside that gap
starts a new beat, and the *old* beat's `nextTurn()` — resuming afterwards, with `sideToMove` now 1
— starts the enemy's as well. Two presentations at once, two `finish()` calls, and the second
`panel()` closes the first with `null`. Fixed with a `flow.busy` guard in `nextTurn()` and
`enemyTurn()` and by deactivating aiming for the whole beat. **That guard is load-bearing; do not
remove it.**
