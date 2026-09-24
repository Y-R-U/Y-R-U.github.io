# Lanternlight

Portrait mobile 3D story game (Three.js 0.160, vendored at `gms/lib/three/0.160.0`, no build step).
The eldest sibling (Ivy or Rowan, player's pick) follows the two little ones, Pip and Bean, into
the Gloaming and brings them home. Five chapters, about 8–10 minutes end to end.

| # | Chapter | Mode | Notes |
|---|---|---|---|
| 0 | The Night Garden | run | tutorial: jump at 136 m, SHINE at 226 m (spawns a Hushling ahead) |
| 1 | Lantern River | boat | outro: Pip in a thorn cage → tap SHINE |
| 2 | The Drifting Isles | glide (umbrella) | drag moves both axes; Pip rides on the eldest's back |
| 3 | The Hush | run | boss from 440 m: the moth spits Hushlings; outro: find Bean, HOLD SHINE |
| 4 | Home by Morning | ride (golden moth) | no drain, no hazards; ending text + credits |

## Files
- `js/game.js` — state machine, per-mode physics, collisions, light meter, checkpoints, all cutscenes
- `js/chapters.js` — chapter data: length, speed, drain, spawn rules, story events (VO keys at distances)
- `js/entities.js` — fireflies (one Points buffer), Hushlings, obstacles, FX particles, `buildLayout` (seeded)
- `js/env.js` — streamed 50 m chunks per environment; terrain is a ribbon that follows `pathX(s)` so seams always meet
- `js/chars.js` — procedural chibi characters (all four) + the moth; `world.js` sky shader, palettes, bloom/grade
- `audio/vo/manifest.json` — every clip → text, voice, full voice settings, job id. `e_*` lines exist per hero (`_ivy`/`_rowan`)

## Voices / music
Qwen Voice Studio (`localhost:7876`). Saved voices: *Fireside · British storyteller* (narrator) and four
designed ones named `Lanternlight · …`. Regenerate with `cd tools && python3 gen_vo.py [key…]` (skips
unchanged lines; it waits while mflux/LTX/mlxcel or another TTS job is busy). Edit text in `tools/script.json`.
Music is reused Suno tracks from `gms/3d/whofights/audio/music` (renamed in `audio/music`).

## Test hooks
`?ch=N` start chapter N · `?ch=0&intro=1` intro · `?auto=1` autopilot · `?fast=3` · `?hero=ivy|rowan` · `?lite=1`
`window.__game` exposes state, `P` (s, u, light), `stats`, `ents()`. A full `?ch=0&intro=1&auto=1&fast=3`
run reaches the ending in ~160 s with zero errors. Autopilot never gets hit, so it says nothing about difficulty.

## Gotchas
- Grazing-angle rim light on terrain washes the ground out; terrain and grass deliberately have little or no rim.
- The umbrella is parented to a hand whose arm points up, so it is rotated by π.
- `G.coast` advances `P.s` during outros; turn it off before any cutscene that places characters itself.
