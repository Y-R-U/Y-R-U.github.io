# Codex Guide: Awake

Awake is a separate game from `gms/2d/codex_horror/`. Do not modify `codex_horror` when working on Awake unless the user explicitly asks for that project too.

## Current Scope

- Path: `/Users/aaronair/cc/yru/site/gms/2d/awake/`
- Placeholder title: `Awake`
- Version: `0.1`
- Goal: mobile-first sci-fi horror escape prototype testing room-to-hallway transition videos.
- Runtime style: vanilla HTML, CSS, and JS with no build step.

## Implemented Vertical Slice

- Intro screen with `caching_data` progress, background video preloading, and a slow transition slideshow.
- Randomized run shell:
  - location type: Space Biome, Space Station, or Mars Habitat
  - generated facility name like `Nargpalm Space Biome`
  - hidden player name revealed by scanning wrist band
  - hunter type: genetically created monster, alien infiltrator, or reanimated crew
  - difficulty-driven random turn limit
- Playable room feeds: 35 non-hallway sci-fi rooms. The original seven remain, with expanded lab, storage, kitchen, lounge, sleeping, wild, and power-room variants.
- One shared `Central Hallway`.
- Transition debug panel for previewing generated videos, filtering ROOM/POSSIBLE/OTHER/ALL, editing local review messages, viewing prompts, and copying short file names.
- Optional localhost-only regen helper: run `python3 regen_helper.py` from the Awake folder, then the debug panel can queue replacement transition renders.
- Goal list, inventory, story history, local save, settings panel, help panel, and minimap behavior.
- Desktop layout uses video left and details panel right; mobile layout overlays glass tags over the video.

## Media

Runtime assets:

- `images/*.jpg` for every room in `js/story.js`
- `videos/*_to_hallway.mp4`
- `videos/hallway_to_*.mp4`
- `videos/cryo_room_event_collapse.mp4`
- `videos/monster_release_*.mp4`
- `videos/monster_attack_*.mp4`
- `music/theme1.mp3`

Ignored source assets:

- `original_files/*.png`
- `original_files/hallway.png`

The PNGs are Flux source outputs and should stay ignored. The JPGs are browser runtime assets.

## Generation Notes

Flux stills were generated locally through MFLUX using `gen_images.py`. The script loads the current room catalogue from `js/story.js`, writes source PNGs to ignored `original_files/`, and writes runtime JPGs to `images/`.

LTX transition videos were generated locally through `http://localhost:7866/api/generate`:

- Existing review transitions are 384x640, 73 frames, 24 FPS, about 3.04 s, video-only.
- Future game transition generation defaults to the proven 384x640 portrait size. The requested 360x640 9:16 shape is not valid in the current LTX AV path because it asserts 64-pixel-aligned dimensions; use 640x384 for landscape game clips.
- `cryo_room_event_collapse.mp4`: former `room_to_hallway.mp4`; 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 215.5 s.
- `hallway_to_cryo_room.mp4`: former `hallway_to_room.mp4`; 384x640, 121 frames, 24 FPS, 5.04 s, video-only, peak 15.77 GB, generation time 229.7 s.
- `gen_transitions.py` loads the current room transition catalogue from `js/story.js`, queues all missing room transition videos through LTX, and downloads completed MP4s.
- `gen_event_videos.py` loads current threats and victory videos from `js/story.js`. Monster/reveal clips are about 3 seconds; new escape/victory clips are about 6 seconds.
- Latest generated room batch added `security_hub`, `observation_deck`, and `engineering_bay` in both directions at 384x640, 73 frames, 24 FPS. Sampled frames were coherent and sub-1 MB.
- Latest generated monster batch added `machine`, `parasite`, and `shadow` release/attack clips. `monster_release_machine.mp4` sampled clearly; parasite and shadow samples were subtle and should be reviewed in the debug panel before treating them as approved.
- `regen_helper.py` starts a local-only helper on `http://127.0.0.1:8788` so the debug panel can edit prompt text, queue one-at-a-time regenerations, and either delete the old clip or move it into Possible or Other review buckets. The script itself is project-agnostic (byte-identical to `the_horrors/regen_helper.py`) — it reads `regen_config.json` from the same dir for the per-project transitions, COMMON/NEGATIVE boilerplate, and extra-video prefix routing. Each row in the panel shows file size + mtime (e.g. `869 KB | 2026-05-15 01:00:49`).
- The Redo popup for monster release/attack rows shows the current monster reference (`ref/monster_<id>.png`) at the top; if no reference exists yet but a marker frame for that monster is saved (e.g. `ref/machine_release.jpg`), the marker is shown instead, captioned as a fallback. Accepting an Image-Redo passes the (possibly edited) video prompt through to the queued video regen via `videoPromptText`.
- **To use the debug panel, open `http://127.0.0.1:8788/?debug` in the browser** (NOT the GitHub Pages URL). The helper now serves the static game from the same origin — this sidesteps the mixed-content block that stops the deployed HTTPS site from reaching the local HTTP helper.

`cryo_room_event_collapse.mp4` is visually strong but not accurate as a hallway transition. Treat it as a candidate ending or room-event clip.

ACE-Step generated `music/theme1.mp3` as a 120 s instrumental sci-fi elevator background track with acoustic guitar, soft keys, sparse drums, and no vocals.

## Important Rules

- Do not use `alert`, `prompt`, or native `confirm`; use the overlay modal helpers.
- Keep the game mobile-first portrait, with desktop as a side-by-side adaptation.
- Keep `original_files/` untracked unless the user explicitly wants source assets committed.
- Project registry entry is in `/Users/aaronair/cc/yru/site/projects.js` with screenshot `assets/screenshots/awake.jpg`.

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
ref/monster_<id>.jpg                  txt2img  full-body identity reference
ref/monster_<id>_attack.jpg           edit(ref)  snarling close-up, teeth bared
images/monster_release_<id>_end.jpg   edit(hallway, ref)         creature down the corridor
images/monster_attack_<id>_end.jpg    edit(hallway, attack ref)  creature filling the lens
```

**The last two are the LTX _end_ frames, not start frames.** This is the point of
the hub: every room's exit transition lands on the same empty hallway, so at the
instant an event fires the player is looking at exactly `images/hallway.jpg`.
Each event clip therefore *starts* on that plate and is pinned (`image_end`) to
*arrive* at the composite:

```
hallway.jpg  ──────────────► monster_release_<id>_end.jpg   73 frames (3.0s)
empty corridor               creature standing down the corridor

hallway.jpg  ──────────────► monster_attack_<id>_end.jpg    97 frames (4.0s)
empty corridor               creature filling the lens
```

The cut into the event is invisible because frame 0 *is* what was already on
screen, and LTX only has to invent the journey between two frames it has been
given. The video prompt describes that journey — how the creature enters and
closes the distance — and nothing else. The attack gets the extra second because
it is the end of the run.

Getting this wrong is subtle and expensive: an earlier pass used the composites
as *start* frames, which meant every event began with the monster already
standing in a hallway the player had just seen empty. `check_monsters.py` now
measures this directly and flags it as `driftstart`.

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

**Off by default now.** The punch existed because LTX used to stop the creature a
step or two short of the lens; pinning `image_end` means the clip is guaranteed
to arrive, and punching into an already-full-frame face just crops it.

It is still there per-clip when a take lands short: tick **Zoom punch-in**, press
**Tap a spot**, tap the point that should end up filling the screen, and the clip
scales toward it and fades to black over its last second. Scale and lead are
sliders; **Test** replays it.
