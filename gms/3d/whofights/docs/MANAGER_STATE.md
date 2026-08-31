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

- **Nothing spawns a `body: "dummy"` character.** `js/world/people.js` builds hooded figures only,
  and `Characters` has no scene handle for `js/world/dummy.js`. The schema, the rig, the skins and
  the Skin tab all exist; only the spawn is missing. `normaliseCast` warns rather than failing
  silently. Needs a world-layer agent.
- **`hub.js toast()` dismisses a `bad` toast after 9 s**, while DEV_CONTRACT §11 and DEVTOOLS §4
  say a failed save gets a red toast that does not auto-dismiss. Making `bad` permanent would pin
  every validation nag from every tab, so this needs a distinct severity — a design decision for
  Aaron, not a bug fix.

## Known problems

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
- Nothing in the hall has a collider — you walk through tables, presses and the hearth.
- Hall masonry reads as brick rather than ashlar; one number (`INTERIOR_TILE.stone`).
- Flat blue window panels at mid-wall height read as placeholder rectangles.
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
