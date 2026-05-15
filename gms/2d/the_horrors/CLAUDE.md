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

## Slice scope (v0.1)

3 rooms: bedroom (start) + bathroom + cellar. Hub: hallway. Monster: pale woman. Endings: window (in bedroom) + caught (reuses monster_attack clip) + escape (no clip — text only).

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
