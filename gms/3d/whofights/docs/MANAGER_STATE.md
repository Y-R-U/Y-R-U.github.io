# WHO FIGHTS — manager state

**Read this first if you are picking this session up cold.** It is the coordinator's own record,
written to survive a usage-limit cutoff. Last written 2026-08-30, ~13:20Z.

`docs/DEV_CONTRACT.md` is the binding spec. `docs/DEVTOOLS.md` is how the dev tools work.
`docs/HANDOFF.md` is the scaffold agent's record. Read those; this file is only *what is happening*.

## The ask, from Aaron

A new project copied off the FORGE engine, called **Who Fights**. A deliberately simple starting
level (road, castle, oversized hall, four contract boards, a white-cloak NPC, meadows) and then —
the actual point — **a solid set of developer tools** behind a dev mode that only appears on
localhost or a private LAN address. Level editor with hotspots, conversation editor, character
viewer with Kokoro voices and barks, a sound studio and music box, and whatever other debug pages
are worth having.

Aaron's own framing: *"the idea is, simple start template, and I want to work on a solid set of
developer tools."*

## Recovery rules

- **Never `git add -A`.** Several other sessions are live in this shared tree (waterline, kitehawk,
  homebound). Stage `gms/3d/whofights/`, `gms/3d/forge/`, `projects.js` and
  `assets/screenshots/whofights.jpg` explicitly and nothing else.
- Check `git rev-list --left-right --count origin/main...HEAD` before any rebase. Another session
  pushed on top of this one's FORGE commit within seconds.
- **The GPU is one slot.** ACE-Step (`:8001`) and Flux (`:7867`) cannot co-reside in 24 GB. Check
  `/admin/status` and `/api/status` before starting anything that generates. Never run two.
- Verify before believing: `node tools/test.mjs` and `node tools/shot.mjs --shot=spawn`, then
  **open the PNG**. Headless renders here are software-rendered — the image is trustworthy, the
  timings are not.

## Done and pushed

- **FORGE quality control** — commit `f71635e`, deployed and live. Preset picker, render scale,
  shadows, live fps, first-run auto-detect. Fixed two bugs on the way: `usePreset()` rebuilt the
  whole world on every preset change, and `tools/shot.mjs` had rendered nothing since 23 Aug
  because its static server was rooted below the `lib/` the importmap points at. 588 tests pass.
  Aaron's decisions applied: shadows are three options, Ultra shares High's soft filter.

## Done, not yet committed

- **Engine lift + the Academy level.** `js/engine`, `js/world`, `js/editor`, a thin `js/game`.
  FORGE's campaign/quest/economy layer deliberately left behind. `__forge` → `__wf`, localStorage
  renamespaced `wf.*`. The level is authored entirely in `data/levels/academy.json`.
- **Dev infrastructure.** `js/dev/gate.js` (local-only, 56 tests), `boot.js`, `hub.js`, `api.js`,
  `data.js` (store with undo), Status and Data tabs, `tools/devserver.mjs` on port **8796**,
  `tools/vo/kokoro_say.py`. Async job queue for `/api/music` and `/api/flux`.
- **Music library**, 25 tracks so far, generated on Suno in Aaron's browser.
- 168/168 tests pass. `spawn` renders at 70 calls / 137k tris.

## All agents finished

Every tab is built and verified. FORGE quality control shipped and is live. Music library is 25
ACE-Step tracks (Suno never ran — browser tools were refused by the permission classifier). Voice
is 96 clips at 736 KB. The dummy rig and Flux skinning work, with a measured verdict in
`docs/SKIN.md`.

## Integration facts discovered the hard way

- **`hub.show(id)` drops extra arguments.** To open the Conversations tab on a specific node, call
  `window.__wfConvo.open(nodeId)` *then* `ctx.hub.show('convo')`. Passing `{node:id}` as a second
  argument to `show()` silently does nothing.
- **`cam` is `none|close|two|wide`** — the arms `dialoguebox.js`'s `CAM` table actually has. The
  contract never enumerated them; use these four everywhere.
- **Renaming a conversation node does not rewrite level hotspots** — only internal `goto`/`next`.
  The convo tab flags nodes nothing triggers; the level tab must flag `say` actions whose target is
  missing. Between them both directions are covered.
- **UI tests must run against an rsynced copy on a separate port**, not the live tree. The convo
  agent's harness copies to `gms/3d/.wf-convotest` on 8797 and deletes it after. Follow that.
- A transient `bayLines is not defined` from `interior.js` during the art agent's live edit is not
  a real bug — it is a hoisted export. Re-check before chasing an error in a file you do not own.

## Open question for Aaron

**Conversation-line VO freshness is per-browser** (`wf.dev.convo.vohash`), while bark freshness is
shared in `data/vo.json`. The ledger is keyed `{character, category, i}`, which a dialogue line has
no answer for. Clearing the browser would regenerate every line clip. Fix is a `lines` section in
the ledger keyed by node id + line index. Worth doing; not blocking.

## Audio policy — Aaron's call, binding

Compress at a sensible default, keep raws gitignored, and make the rate choice **a human A/B in the
tool**. Machines keep only the checks they are good at — silent, truncated, clipped, stops-early.
**Nothing machine-grades how good audio sounds.** The precedent: whisper scored a clip pool at
90.7 % intelligibility that Aaron heard as "a computer voice from the 90s".

`POST /api/encode` serves both music and voice, on its own CPU queue (never the GPU slot), with
8 profiles carrying exact ffmpeg args. `preview:true` writes beside the shipped file; `promote` is
a rename, so the bytes the ear approved are the bytes that ship. Re-encode from `raw/`, never from
an already-compressed file.

## Skinning — done, with a measured verdict

`edit` mode ships 8 of 12 generations as-is; `txt2img` 0 of 3. The failure mode is the head: the
reference mannequin's head is a blank grey egg and "do not change the outline" beats "paint a
face", so a bare-headed subject returns in a good costume under a grey mask. **Name what is on the
head** and the hit rate goes from two thirds to near ninety. Good for a cast and a bestiary; not
for a hero, and it cannot do the same character in a different tabard. The highest-value next hour
is giving `pose_ref.png` a head with a brow, nose and jaw.

## Aaron's decisions so far — do not relitigate

| | |
|---|---|
| Hall size | **Keep 35 × 29 m** and dress it — tables, cupboards, tapestries, doors to other rooms, some locked. |
| Locked doors | Author with existing verbs only: `if` predicate on a flag firing `goto`, plus the inverse firing a `say`. No new action verb. |
| Castle tone | Pale limestone stays. Per-object tone is **already a data field** (`zone` on every object); the editor gets a picker for it, labelled **tone**, not "zone". |
| White cloak | **Instructor Vail**, a woman, voice `bf_emma`. Confirmed. |
| FORGE shadows | Three options. Ultra shares High's soft filter. Done. |
| Music source (superseded) | **Suno** for the initial library — credits are not a constraint, over-generate and curate. **ACE-Step is the long-term route**, since the Suno subscription lapses; it must stay first-class and every track must be re-makeable from what `docs/MUSIC.md` records. |
| projects.js | Who Fights added, `wip: true`. `wip` removed from SKYHAMMER and Sunderfall. |

## Music — settled 2026-08-31

Chrome browser automation **works**; the earlier refusal was transient. Suno is reachable and
logged in. Aaron, after listening to the ACE-Step library: *"the local ai music doesn't sound very
good, it gets ok results sometimes, but should only be used (and will be far more work to use to
get his results) when we don't have sunoai available."*

So: **Suno is the source while the subscription lasts.** ACE-Step is the documented fallback for
when it lapses, and stays working, but is not what ships. Credits are not a constraint — over-
generate and curate.

## Open items not yet assigned

- ~~Nothing spawns a `body: "dummy"` character.~~ **Done, and this note was stale as of 31 Aug** —
  `js/main.js:85` passes `dummies` into `Characters`, and `data/characters.json` places a dummy
  `quartermaster` in the hall. What is actually missing is narrower: it asks for `skin:
  "watch_s11"` and `art/skins/` holds only `knight_s33`, `nomad_ui` and `undead_s77`, so it renders
  as an untextured grey mannequin and warns. Assigned 31 Aug with the §11 head experiment.
  **That was wrong too.** `art/skins/watch_s11.png` has been tracked since `15234423`; the manager
  asserted it was absent from an `ls | head -12` that had truncated the directory, and then twice
  built on it — including a mid-task instruction to an agent to rename over it, which the agent
  correctly refused because the file was tracked, documented and working. Brann had no bug.
  A purpose-built `quartermaster` skin was generated anyway and he now wears that instead of a
  city-watch sergeant's. *Two stale claims in a row in this file: check one against the code before
  briefing an agent on it, and never assert a file is absent from a truncated listing.*
- **`hub.js toast()` dismisses a `bad` toast after 9 s**, while DEV_CONTRACT §11 and DEVTOOLS §4
  say a failed save gets a red toast that does not auto-dismiss. Making `bad` permanent would pin
  every validation nag from every tab, so this needs a distinct severity — a design decision for
  Aaron, not a bug fix.

## Known problems

> **Three entries in this section have now been struck through as already fixed, and one of them
> sent an agent after work that existed.** Items here are written when a problem is *found* and
> nothing revisits them when it is *solved*. Verify any claim against the code before briefing
> anyone on it — `grep` for the function it names, `git ls-files` the asset it says is missing.
> Strike through what you disprove rather than deleting it; a wrong entry is worth keeping as a
> record of what was already checked.


- **Aaron, playing it: "I can't fully look around."** Root cause was `PITCH_MIN/PITCH_MAX` in
  `js/player.js` — hard clamps at −0.35 / +1.05 rad (−20° / +60°), and indoors a further cap at
  0.50 rad (~29°), which made the new 11 m hall roof unreachable. Widened to −0.90 / +1.30 and the
  indoor cap to 0.95, all three now knobs (`camPitchDown`, `camPitchUp`, `camPitchIn`) in the
  Controls group so they can be tuned live. **Not yet confirmed by Aaron in play** — if it is still
  restrictive, the indoor cap should scale with the actual ceiling height rather than being one
  number for a cottage and a great hall alike.
- **Aaron, again: "look can get sick... I can't look all the way round... refresh page fixed it."**
  A *second*, unrelated cause, found 31 Aug and fixed in `9f68df3c`. `Doors.peek()` set a flag
  nothing ever cleared, and `Doors.update()` returns on its first line while peeking — so one press
  of a Camera shot in the ⚙ panel (Menu → Settings → Developer panel, which Aaron has open to tune
  the pitch knobs) froze every field the door system writes onto the player. Pressed inside the
  hall it pinned `indoor` at 1, so the indoor cap of 0.95 applied outdoors and the camera stopped
  tilting up ~20° short. Pressed outdoors it could leave `driven` true, locking look and movement
  entirely. `indoor`/`driven`/`confine`/`floorY` are now re-derived every frame in
  `js/world/doorstate.js` rather than latched. **The lesson generalises: a field written by an
  event and never re-derived is a bug waiting for the frame that misses the event.**
  Ruled out and worth not re-investigating: input-accumulator saturation (it self-drains every
  frame, so it can only ever whip, never shrink the range), a stranded `lookId`, `Input.lock()`
  latching, OrbitControls re-enabling, and `js/unstick.js`.
- **Conversation effects had never once run.** `DialogueBox.emit` called the sink with one action
  at a time; the sink is `runActions`, which iterates arrays and returns `[]` for anything else,
  silently — and `session.js` discarded the results, so nothing could report it. Every authored
  `sets` in `data/conversations.json` was dead, including `academy.met.vail` and
  `academy.brushed.vail`, which gate Vail's own branches. Fixed 31 Aug in `07151d25`, pinned by a
  test wired to the real `runActions` rather than a stub that would accept either shape.
  **Still latent:** `effectsOf()` turns `node.mark` into the tuple `['truth', mark]`, which is not
  an action object and will now warn rather than run. No node in shipped data uses `mark`, so this
  is a trap for the first author who does, not a live bug.
- **Flux skips heads far less often now.** `tools/skin/template.mjs` gives the reference
  mannequin's front-panel head a relief — brow, sockets, nose, cheekbones, jaw, chin, shading only
  — so there is something to anchor a face to. Measured 4/8 → 8/8 over five subjects at fixed
  seeds, re-run at the same seeds, controls unchanged. `docs/SKIN.md` §7.1 has the paired table.
  **Still open, and visible in `shots/skin/_HEADS_baseline_vs_face.png`:** two of the eight paint a
  fully modelled face in the mannequin's *grey* rather than in a skin tone. §7.1 suggests tinting
  the reference off-grey as the next hour's work. Also recorded there: a skin's sidecar stores the
  pose reference's path rather than its bytes, so the four older skins no longer reproduce
  byte-for-byte from their own sidecars.
- ~~Nothing in the hall has a collider — you walk through tables, presses and the hearth.~~
  **Stale as of 31 Aug — the third wrong claim in this file.** `js/world/interior.js` has a
  `solid()` helper, an `I.solids` list and a `pushOut` per frame, and every solid prop is in it:
  the hearth (`:462`), both refectory tables with their benches folded into one box (`:933`), the
  two presses (`:1012`) and the three chests (`:1019`). Tapestries and door reveals sit flush to
  the masonry and correctly have none.
- **`tools/shot.mjs` wedged on any screenshot over 4 MiB**, which is every render at its own
  defaults (1600×900 dpr 2 = a 9.1 MB base64 reply). Node's bundled websocket negotiates
  permessage-deflate and undici destroys the socket over a 4 MiB decompressed message, closing 1006
  with no frame; a `send` that only settles on a reply then waits for ever. Fixed 31 Aug in
  `1af64b55` with a hand-rolled transport that negotiates no extension, bounded requests that name
  themselves on timeout, and a close handler that rejects everything in flight.
  **It had never worked at those settings** — the last good render was an `--all` sweep at a quarter
  of the pixels, and `HANDOFF.md` hardcoded the small-render flags as a workaround nobody had
  explained. *Three separate silent-failure tools on this project now: a check that cannot fail is
  the recurring shape, and `settle()` — which returned success for a page that never drew a frame —
  was another.* `js/dev/cdp.mjs` had the same defect — fixed 31 Aug in `5522f61b`, and it now
  imports shot.mjs's transport rather than being a third copy of it. Measured boundary: 3.687 MiB
  fine, 4.031 MiB wedged. `js/dev/debug/uitest.mjs` was screenshotting at 3.26 MiB — three quarters
  of a megabyte under the cap — so it too was passing on luck and now cannot.
- ~~Confirmed still true by the 31 Aug hall render (`shots/hall.png`), unlike the struck-through
  entries above: the masonry reads as brick, and the flat blue window panels read as placeholders.~~
  **Both fixed 31 Aug, uncommitted.** Before/after at the same camera, with the window and door
  work in the same pair: `shots/hall-pass/1-hall-before.png` and `2-hall-after.png` (and 3–8 for
  the facade and the two side walls). 64 → 65 draw calls, 137k → 121k triangles, texture budget
  52.9 → 56.9 MB.
- ~~Hall masonry reads as brick rather than ashlar; one number (`INTERIOR_TILE.stone`).~~
  Fixed, but **it was never one number** — a fourth wrong claim in this file. The block size comes
  from `COURSE` in `materials.js`, which deliberately shrinks every zone's authored `blockW/blockH`
  to ~0.21 m so a 6 m cottage is not cartoon blockwork; `INTERIOR_TILE.stone` is only the metres
  the interior projects that bake over, and raising it would have enlarged the chipping and grain
  with the blocks and halved the texel density. The hall now bakes its own `ashlarSet()` in
  `materials.js` at the size zones.js actually authors (light is 0.9 × 0.42 m), with a `joint`
  override in `stone.js` because a shape's joint is a fraction of its course — the `rounded`
  profile that gives a cottage a 0.09 m bed opens to 0.18 m at hall scale and the wall turns to
  rubble. Cottages and every exterior are untouched.
- ~~Flat blue window panels at mid-wall height read as placeholder rectangles.~~ **They were never
  windows.** Proved by recolouring the one material with a normal map and no albedo map and
  re-rendering: every mid-blue panel turned red, so they are the five *tapestries* in
  `hallDress()`, drawn in a flat dyed `z.interior.cloth`. The hall's actual windows are the
  clerestory leaded lights, which already read correctly. They now take a woven texture from a new
  `js/world/textures/cloth.js` — sibling to `stained.js`, and driven off the same
  `z.interior.pattern` name, so a hall's hanging and its window carry the same device — and the
  four flat `cloth` battens laid on the panel are replaced by folds waved into the plane itself,
  which is fewer triangles per unit of relief and keeps one 0..1 UV across the whole hanging.
  *`b.add()` box-projects world-scale UVs unless you pass `keepUV`; the one surface in the room
  that wants a whole picture across a whole panel has to ask for it.*
- **Aaron, playing it: *"on the outside of building i see lots of windows, go on the inside and
  that same wall has none! so obviously there are 2 surfaces? we should try to match up the
  windows, some of them should be see through right?"*** and ***"there appears to be some door
  hotspots (locked) but I cannot actual see doors where the hotspots are?"***
  **Both fixed 31 Aug, uncommitted, and they were one bug.** The hall is two surfaces —
  `buildings.js house()` outside, `interior.js hallShell()` inside — and the interior one was
  drawn as a *solid plane*: `wallPanel()` never cut an opening for anything. So the exterior put
  ~110 windows on a 2 m slot grid at heights of its own choosing while the interior had twelve at
  bay midpoints at a third, and all three inner doorways were buried in the masonry — the shut
  leaves hung 0.26 m the wrong side of a wall with no hole in it, and the open one's reveal was a
  flat stone ring on stone.
  - Both surfaces now read `js/world/hallplan.js`, which is the only place a hall's fenestration
    is decided. The exterior uses the *interior's* span for its bay midpoints (`span − 2t − 0.18`)
    or the two grids drift half a metre and every window misses.
  - `wallWithHoles()` in `interior.js` builds a wall as the stone left over once its openings are
    taken out, splitting into columns at every opening edge — which keeps `wallPanel`'s
    subdivision, and so the baked vertex gradient, instead of collapsing a wall into one
    ShapeGeometry with three triangles in it.
  - The low row is **unglazed on both surfaces**: a real hole through both skins, with the
    exterior's iron bars still in it. That is the "see through" — visible in
    `shots/hall-pass/4-doorway-after.png`, where you can read the interior ashlar from the lawn.
  - The board wall gets no wall light at all now, inside or out. The four contract boards stand
    2.6–6.2 m off the floor across the whole of it and the plate is at 7.2: there is no band left.
- ~~The locked-door hotspots are not where the doors are.~~ **They always were.** Measured, not
  assumed: the hall sits at world (0, −16), `bayMids(bayLines(rz*2, HALL.bay))` gives ∓3.6, and
  the three doorways come out at world (−15.9, −12.4) yard, (15.9, −19.6) armoury and
  (15.9, −12.4) dormitory — the authored `hs.door.*` centres exactly. Nothing needed moving and
  `data/` was not touched. What was wrong is that they could not be *seen*: no hole in the wall,
  and a 2.7 m press standing across the west one. `js/world/hallplan.test.mjs` now pins the three
  positions against the numbers the level document authors, so the next person to touch the bay
  grid finds out at once.
- **A shared RNG stream is a dependency, and this one bit.** `house()` draws `R()` once per window
  slot. Making a hall's windows deterministic removed ~110 draws and silently re-rolled every
  later decision in the function — the roof ridge among them — and the exterior roof slab came
  through the interior gable as a stone chevron floating over the contract boards. Pinning the
  ridge to the interior's axis (which is what it *should* be — `interior.js` hard-codes it) then
  put the slab through the interior roof at the side walls instead. The cottage slot loop is
  therefore still run for a hall and its draws still taken, just not built. **Latent:** a hall's
  ridge is still a coin toss that agrees with the room inside it only by luck of the seed.
- The tracer misses boot — hooks install on first Debug-tab open. One line in `js/dev/boot.js`.
- No running world clock: `time` is a lighting knob, `js/game/clock.js` is uncalled arithmetic.

- The great hall reads as a timber box — flat-lit, plank texture on every surface, beams sized off
  cottage constants. That is what the interior art agent is fixing.
- Portrait crops the outer two contract boards from the authored `hall` framing.
- `js/game/audio.js` and `sounds.js` were lifted but are unwired.
- `gotoLevel` reloads the page.
- `Props` is instantiated empty.

## What Aaron wants next

To **play-test it together**. The report to him should lead with what he can click on, not with
architecture.
