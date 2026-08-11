# The Horrors

Mobile-first hub-and-spoke video horror. Built on the same engine as Awake (gms/2d/awake/).

## Architecture: see ~/.claude/skills/hub-video-game/SKILL.md

**Hub topology:** every room exits ONLY to the central hallway; the hallway exits to every room. Caps transition video count at 2 × N rooms. Monster reveals, attacks, and most endings happen in the hallway.

**First-frame freeze trick:** the room "still" is the same `<video>` element holding `currentTime=0` of its outgoing transition (`<room>_to_hallway.mp4`). No separate static image — the start frame of the transition IS the room view.

## Diegesis-neutral rule

Visuals deliberately plain (off-white walls, simple paintings, no era markers, no sci-fi). The same asset set serves any horror setting — the per-run flavour comes from the random pickers in `js/story.js`:

- `locations`: Hospital / Asylum / Manor / Boarding House / Orphanage / Sanitarium / Country House / Mountain Lodge
- `facilityNames`: Blackwell, Saint Mary's, Carrington, Hollowbrook, ...
- `playerNames`: period-neutral
- `threats`: pale_woman, lost_child, previous_tenant, white_shadow, silent_companion, hollow_one
- `goalPool`: identity / map / escape (core) + letter / chart / mirror (optional)

Any prompt edits in `gen_*.py` MUST stay diegesis-neutral. Don't add Victorian wallpaper, fluorescent lights, asylum bars, etc.

## Slice scope

**v0.1** (initial): 3 rooms (bedroom + bathroom + cellar) + hallway. One monster (pale woman). 3 endings.

**v0.2** (current): 11 spoke rooms — bedroom, bathroom, cellar, kitchen, study, attic, dining_room, library, parlour, storeroom, conservatory. All 6 threats have their own per-threat release + attack clips (with pale_woman as the missing-clip default). Hallway is rendered as a vertical corridor in the mini-map (col 2, rows 2-6) with 5 spokes flanking each side; parlour spans the wide top row, exit spans the wide bottom row.

## Asset pipeline

```
python3 gen_images.py                # MFLUX stills → original_files/*.png
# convert PNG → JPG: see header comment in gen_images.py
python3 gen_transitions.py           # LTX 384x640 → videos/<room>_<dir>_hallway.mp4
python3 gen_event_videos.py          # LTX → monster + ending clips
# music: copied from claude_horror/music/ (already neutral horror)
```

## Run-key & save

`localStorage` keys: `the_horrors.state.v1`, `the_horrors.settings.v1`, `the_horrors.archive.v1`, `the_horrors.debugMeta.v1`. Run keys are like `medium-l2aw4h-0k3mz` (difficulty-time-rand) and reproduce the random run via the seeded RNG in `story.js`.

## Namespace

`window.TheHorrorsStory`, `window.TheHorrorsSave`, `window.TheHorrorsAudio`, `window.TheHorrorsUI`. (Awake uses `CodexHorror*`; do not cross-wire.)

## Production rules (inherited from Awake)

- Mobile portrait first; desktop is a side-by-side adaptation.
- No `alert`, `prompt`, `confirm` — overlay modals only.
- Music + sound toggles in settings panel; volume slider 0–100; reset run.
- Local regen helper at `127.0.0.1:8788` if running `regen_helper.py`.

## Debug panel + regen helper

The debug panel ships in `index.html` (the bug button in the top-right). It calls the local helper at `http://127.0.0.1:8788`. `regen_helper.py` is **byte-identical** to `awake/regen_helper.py` and reads its project-specific data from `regen_config.json` in the same directory.

To debug this game locally:
```
cd ~/cc/yru/site/gms/2d/the_horrors && python3 regen_helper.py
```
**Then open `http://127.0.0.1:8788/?debug` in the browser** (NOT the GitHub Pages URL). The helper now serves the static game files too — that puts the debug panel at the same origin as the `/api/` endpoints, so the deployed HTTPS site doesn't blow up with mixed-content errors when trying to reach the local `http://127.0.0.1:8788` helper.

The panel auto-opens via `?debug`. Each row shows file size + mtime in amber (e.g. `386 KB | 2026-05-16 00:46:59`) under the filename, so stale clips are obvious at a glance.

The Redo popup for monster release/attack rows shows the current monster reference (`ref/monster_<id>.png`) at the top; if no reference exists but a marker frame for that monster is saved in `ref/`, the marker is shown instead, captioned as a fallback. Accepting an Image-Redo passes the (possibly edited) video prompt to the queued video regen via `videoPromptText`.

`regen_config.json` schema: `{ common, negative, transitions: {<file>: {id,label,start,end,seed,promptText,status}}, extras: [...], extra_prefixes: {<pre>: {group,status,default_poster}} }`. Add a new room → update `regen_config.json`, `gen_transitions.py`, and `js/story.js` `transitions` array (three sources of truth, kept aligned by hand).

## Per-threat clip strategy

`js/story.js` declares `eventVideos.release[<threat_id>]` and `eventVideos.attack[<threat_id>]` for all 6 threats; `eventVideoFor()` in `js/game.js` falls back to `group.default` (the pale_woman clip) when a per-threat file is missing. So generation of the remaining 10 monster clips can run in the background — the game stays playable the whole time, just shows pale_woman for unmapped threats.

## The five videos

These are the only clips the game plays. Anything else generated is review
material, not gameplay:

1. `<room>_to_hallway.mp4` — room → hallway
2. `hallway_to_<room>.mp4` — hallway → room
3. `monster_release_<id>*.mp4` — the reveal, in the hallway
4. `monster_attack_<id>*.mp4` — the attack, in the hallway (also the death ending)
5. the escape / victory clips, out of the hallway

The hallway is the hub precisely so this list stays short. **In-room scare clips
(`scare_<room>.mp4`) are retired** — they never read as the room you were
standing in. The scare beat still fires, but it now plays as a light-cut shudder
on the room still (`playRoomScare` in `js/game.js`). The old files stay on disk
and are still browsable in the debug panel under ALL.

## Monster art pipeline — `gen_monsters.py` + `monsters.json`

Every monster gets four stills, each derived from the previous one, so the
creature's identity survives the whole chain:

```
ref/monster_<id>.jpg                    txt2img  full-body identity reference
ref/monster_<id>_attack.jpg             edit(ref)  snarling close-up, teeth bared
images/monster_release_<id>_start.jpg   edit(hallway, ref)         creature down the corridor
images/monster_attack_<id>_start.jpg    edit(hallway, attack ref)  creature filling the lens
```

The last two are the LTX start frames. Because the creature is already *in* the
frame, the video prompt only has to describe **motion** — asking LTX to invent
the creature as well as animate it is what made the old clips inconsistent.

```
python3 gen_monsters.py images                 # all stills (skips ones that exist)
python3 gen_monsters.py images --force         # re-roll them
python3 gen_monsters.py videos                 # one new variant per monster per kind
python3 gen_monsters.py videos --only gene,mimic --kind attack
python3 gen_monsters.py seed                   # rebuild js/variants.js from disk
```

`monsters.json` holds the per-creature brief (visual description + the six
prompts). `gen_monsters.py` is byte-identical in both games; everything
project-specific lives in that JSON.

Flux and LTX cannot co-reside in 24 GB, so run the whole `images` stage before
the `videos` stage. Edit passes render at 512×848 with 512-px conditioning
copies — full-size two-reference composites take 15+ minutes each on this box
against ~3, and the composites only ever feed LTX at 384×640.

## Variants — `js/variants.js`

Monster clips are versioned. Nothing is overwritten: each render lands as
`monster_<kind>_<id>_v<N>.mp4` and is appended to `js/variants.js`, which records
every attempt and which one the game plays.

```js
window.MonsterVariants = {
  game, monsters: [{id, name, ref, attackRef}],
  clips: { "attack:gene": { selected, variants: [{n, file, src, created, bytes, prompt, start, note}] } },
  zoom:  { "videos/monster_attack_gene_v2.mp4": {enabled, x, y, scale, lead, fade} },
}
```

`js/monsters.js` (also byte-identical across both games) reads it, resolves
`eventVideoFor("release"|"attack")`, runs the jump-scare punch, and renders the
Monsters tab. Picks made without the helper go to `localStorage` and still
drive playback on that device; with the helper running they are written back
into `js/variants.js` so they can be committed.

## Debug panel

`MONSTERS · ROOM · ENDING · POSSIBLE · OTHER · ALL · MINI`, opening on MONSTERS.

The Monsters tab is a grid of creatures → tap one → its reference and attack
close-up, a RELEASE / ATTACK toggle, and every rendered variant with a tick to
choose the one the game uses. "Render another variant" queues one more take
(helper only). "Copy my picks" exports your local picks + zoom settings as JSON.

**Everything except regeneration works off the local network** — on the
deployed GitHub Pages build the panel still lists clips, plays them, lets you
pick variants and tune the zoom punch, and remembers all of it in
`localStorage`. Only Redo / Reverse / Marker / Render need `regen_helper.py`.

### Jump-scare punch-in

LTX reliably stops the creature a step or two short of the lens. The punch
rescues that: tick **Zoom punch-in**, press **Tap a spot**, tap the point on the
preview that should end up filling the screen, and the clip scales toward it and
fades to black over its last second. Scale and lead are sliders; **Test** replays
it. New *attack* variants get the punch armed by default (centred a little above
mid-frame); release clips are a slow reveal and stay off unless you turn them on.
