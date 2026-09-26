# HEIRFRAME music

All tracks are Aaron's Suno generations reused from other yru games. None has been edited; loop
points live in `js/audio/tracks.js` (`start`/`end`), and the engine crossfades 3 s before `end`.
Nobody has listened to these in HEIRFRAME context; choices are by style prompt and measurement.

## State → playlist (js/audio/tracks.js `STATES`)

| state | tracks (rotate each loop) | why |
|---|---|---|
| `menu` | title_chrome → menu | retro sci-fi menu theme, loops cleanly; then patient Blade-Runner synth |
| `explore` | cruise_a → cruise_day | relaxed forward-moving synth-funk; washed-out ambient drone (the too-perfect utopia) |
| `stealth` | cruise_b | hypnotic dub techno, no melody, no build |
| `combat` | combat_chrome → combat_drift | sleek militaristic 140 BPM sci-fi march; tense retro-futurist 130 BPM |
| `warehouse` | docked | intimate noir jazz-electronica, sits under conversation |
| `boss` | boss_chrome | retro sci-fi metal, same key/tempo family as combat_chrome |
| `boss_final` | boss_final | dark heavy metal with choir stabs (Archon Dray) |
| `story` | menu | patient, unresolved; good under reveals |
| `undercity` | cruise_b → cruise_day | grimy and oppressive for the Stacks / later acts |
| `comms` | comms (`net.mp3`) | radio-chatter murmur bed for hacking / Warden-band scenes |
| stings | `sting_win`, `sting_lose` | contract complete / frame wrecked |

## Files

| file | length | source | Suno style (abridged) |
|---|---|---|---|
| menu.mp3 | 209.6 s | NEONHAUL M1 "Standing By" | dark cinematic synthwave, 78 BPM, Juno pad, patient |
| cruise_a.mp3 | 212.1 s | NEONHAUL M2 "Lanes Four Through Nine" | darkwave / slow synth-funk, 92 BPM |
| cruise_b.mp3 | 252.0 s | NEONHAUL M3 "Sootfields" | dub techno, 88 BPM, tape delay |
| cruise_day.mp3 | 213.9 s | NEONHAUL M4 "Smoglight" | ambient drone with a slow pulse, 70 BPM |
| docked.mp3 | 164.1 s | NEONHAUL M5 "Terms" | noir jazz-electronica, 74 BPM |
| title_chrome.mp3 | 119.9 s | Skyhammer `title_chrome` "Cold Start" | brooding retro sci-fi menu, Em, 100 BPM |
| combat_chrome.mp3 | 119.0 s | Skyhammer `battle_chrome_march` "Chrome Sky Anthem" | chrome-plated future war march, Em, 140 BPM (ends abruptly; loop point handles it) |
| combat_drift.mp3 | 119.5 s | Skyhammer `battle_drift_march` "Compass Spinning" | retro-futurist march, Am, 130 BPM |
| boss_chrome.mp3 | 119.7 s | Skyhammer `battle_chrome_heavy` "Chrome Sky Overload" | industrial metal, Em, 140 BPM |
| boss_final.mp3 | 119.6 s | Skyhammer `boss_heavy` "The Big One Unchained" | dark heavy metal boss, Fm, 140 BPM |
| sting_win.mp3 | 7.5 s | Skyhammer `victory` | brass victory sting (1940s flavour) |
| sting_lose.mp3 | 9.4 s | Skyhammer `defeat` | deflating minor sting |
| net.mp3 | 24.5 s | NEONHAUL `bg_net` | **spoken radio murmur, not music** |
| boss.mp3 | 48.9 s | NEONHAUL `boss_take` | **spoken VO (NEONHAUL's criminal leader), not music. Unused — safe to delete.** |

Sources: `gms/3d/neonhaul/assets/audio/music/`, `gms/2d/skyhammer/assets/audio/music/` (prompts in
`gms/2d/skyhammer/docs/MUSIC_NOTES.md`, `gms/3d/neonhaul/docs/SUNO.md` §1).

## Gaps worth a Suno session later
- A genuinely **bright, sunlit utopian** explore theme (the NEONHAUL tracks are night/noir). Prompt idea:
  "optimistic utopian city ambient electronica, 96 BPM, instrumental, glassy arpeggios, warm pads,
  gentle four-on-the-floor, bright major key, a hint of unease under the polish".
- A music-box / choir arrangement of the family lullaby for reveals (a synth version exists: `sfx('lullaby')`).
- Stings in the sci-fi palette (the current ones are 1940s brass).
