# audio agent notes

Owner of `js/app/sound.js`, `js/audio/`, `assets/audio/`, `tools/audio_*`, and each theme's
`sounds.js` (wired by ONE line in the theme's `index.js`: `sounds: () => import('./sounds.js')`).

## Design
- **All SFX are procedural**, but not synthesised live: each recipe (`js/audio/dsp.js` helpers) is
  rendered once per (theme, sound, variant) in an `OfflineAudioContext`, then normalised and
  cached as an AudioBuffer. Playing a sound = one BufferSource → gain → panner → bus. So even the
  battle sounds cost about nothing per play, and every sound is level-checked by numbers.
  No sample files are needed for SFX (0 KB of downloads; ~35 KB of JS for engine + recipes).
- **Normalising**: rendered buffers are measured (max 50 ms RMS of the mid channel after a
  120 Hz high-pass and +4 dB shelf above 2 kHz, a rough K-weighting) and scaled to
  `-15 dBFS + lvl`, then capped at **-3 dBFS peak**. Impact sounds use `punch` (a tanh
  soft-clip) so the 2–3 ms strike transient doesn't set the peak and they can sit as loud
  as they should. A master DynamicsCompressor (threshold -4 dB, ratio 12) catches overlaps.
  `lvl` per sound: move -2, capture +2, castle -1, check/promote -1, start/lose/draw -2,
  win 0, lowtime -4, correct -4, wrong/illegal -5, tap -12. Measured result: moves about
  -17, captures about -13.5, end-of-game jingles -15 to -17, UI tap -27 (all in the same units).
- **Variants**: move has 4, capture 3, castle 2 (seeded, slightly different modes); the engine
  never plays the same variant twice running and adds ±2.5% pitch / ±0.5 dB jitter.
- **iOS / autoplay**: no AudioContext is created before a user gesture (Chrome warns otherwise).
  `js/audio/index.js` listens (capture phase) for pointerdown / touchend / keydown / click,
  creates + resumes the context inside the gesture, plays a 1-sample silent buffer (iOS unlock),
  and stops listening once it's running. If iOS interrupts it (call, Siri) the listeners come
  back. The context is suspended while the tab is hidden. We don't set `navigator.audioSession`,
  so the iPhone ring/silent switch still mutes the game, as users expect.
- **Settings** (`gambit.settings`): `sound` (master on/off, default on), `volume` (0..1, default
  0.8, gain = v²), `music` (default **off**), `musicVolume` (0..1, default 0.5, gain = v^1.5).
  Changes apply live (store `onSettings`).
- **Move timing**: `playMove(v)` defers the sound until the board's `animend` for that move
  (the piece lands), with fallbacks (450 ms if no anim starts, 2.5 s for a move anim, 12 s for
  a battle). For a battle it waits for `battleend`: if the battle anim played its own sounds,
  the capture clack is skipped (only the check chime plays); if it played none, the capture
  clack plays when the victim disappears.

## Sound list (core; every theme falls back to these)
| name | design |
|---|---|
| move | felt-bottomed piece on wood: 4 decaying sine modes (640/1180/1890/2950 Hz, 14–45 ms) + band-passed noise click + small low thump, tiny room |
| capture | the same, lower and harder, plus a second higher clack 42 ms later (the captured piece knocked away) |
| castle | two clacks, king then rook 115 ms later, panned slightly apart |
| check | overlay on the move: two-note FM bell (E6 → C6), short |
| promote | four-note rising mallet arpeggio (C5 E5 G5 C6) + high glints |
| illegal | soft two-note triangle "bonk" (Bb4 → F4), not a buzzer |
| start | wooden knock + two-note marimba (G4, C5) |
| win | mallet arpeggio C-E-G-C into a held major triad with shimmer, 1.6 s |
| lose | gentle descending minor (G4 Eb4 C4) over a low C, 1.5 s |
| draw | open fifth (G4 + D5) twice, neutral |
| lowtime | clock tic-toc (two short high woody clicks) |
| tick | one tic (for per-second ticking if ui wants it) |
| correct | puzzle step right: two quick rising bell notes |
| wrong | puzzle miss: muted square-wave down-step |
| solved | puzzle solved: five-note sparkle arpeggio + high bell |
| tap | UI button click: 2.3 + 4.7 kHz micro click, very quiet |
| notify | two-note mallet (draw offers, opponent found) |
Aliases: `click`/`button` → tap, `ok` → correct, `bad`/`fail` → wrong, `loss` → lose.

### Theme flavour
- **Classic** (gold/black chrome on marble): move/capture/castle are "weighted piece on
  marble" (higher stone modes, crisp click, faint metallic ring); battle overrides `thud`
  (stone thud), `knock` (pieces clinking, more ring), `topple` (rattle on marble).
- **Fantasy**: move = figurine on stone + wood (one variant in four has a barely-there arcane
  chime); capture = heavy landing + steel ting; check = brighter bell; `zap` override = spell
  with an arcane bell tail.
- **Halloween**: move/capture/castle are hollow knocks on flagstone (capture adds a squelch);
  check = eerie music-box minor third; promote = music-box arpeggio.
- **Sci-fi** (not started): falls back to core; `laser` exists in the battle vocabulary.

## Battle API (for battle animations)
```js
import { sfx } from '../../audio/index.js';      // from js/themes/<id>/battles.js
// at the moment the effect happens in your timeline:
sfx('clash', { ctx, at: ctx.victimPos });
```
- `ctx` = the battle ctx the board passes you. The engine reads the live battle speed from
  `ctx.tl.rate` (so the 1×/2×/5× setting and the online cap just work), and knows when the
  battle is **skipped** (tap / `board.skip()`): later calls are dropped and sounds still ringing
  get a 120 ms fade, so a skip never dumps every remaining sound at once.
- `at`: where it happens — a Vector3 (world x is used), a square `'e4'`, or x in [-4, 4] → a
  subtle stereo pan (flipped when the board is viewed from black).
- Speed scaling: playback rate × speed^0.22 (2× ≈ 1.16, 5× ≈ 1.42, capped 1.45), tails are
  faded out after `dur / speed^0.6`, and 5× is 1.5 dB quieter. `speed` can be passed
  explicitly if you have no ctx.
- Other options: `delay` (s), `gain` (linear, 1 = normal), `pan` (-1..1, overrides `at`),
  `rate`. Returns `true` if it will play. Identical calls within 30 ms are merged; max 14 voices.
- Call it **inside the timeline** (after the `await ctx.wait()/tween()` that leads to the
  moment) — not with setTimeout — so skip and speed work.

Battle vocabulary (all themes can use all names; themes may override any):
| name | design | aliases |
|---|---|---|
| swing | short rising whoosh, panned L→R | slash |
| clash | sword clash: 6 inharmonic metal modes (2–9 kHz, ringing up to 0.35 s) + transient + scrape | sword, blade |
| hit | dull body impact | impact |
| thud | heavy wooden thud (Classic: stone) | wood |
| knock | two pieces knock together | |
| stone | masonry crunch: stone hit + brown-noise grind + crackle | crunch |
| topple | piece tips over: 5 diminishing clacks | fall |
| slide | friction scrape (shoved along the board) | shove |
| stomp | big low boom + board rattle | |
| poof | puff of air (vanish) | vanish |
| zap | magic bolt: descending vibrato saw + noise + crackle + glints (Fantasy: + arcane bells) | magic, spell, bolt |
| sparkle | glittering chime cloud | |
| thunder | lightning crack + rolling rumble, 2.2 s | lightning |
| fire | fire whoosh: rising band-passed roar + brown-noise body + crackle, 1.3 s | flame, burn |
| explosion | sub drop + noise burst + rumble + debris crackle, 2 s | boom, blast |
| laser | sci-fi beam zap | beam |
| roar | dragon roar: formant-filtered saws with slow vibrato + breath | |
| bats | 3 bats: AM wing-flap noise sweeping across + tiny squeaks | bat |
| wail | ghost wail: gliding vibrato sine + breath, big reverb, 2 s | ghost |
| creak | creaky grave / coffin lid: stick-slip pulse train through wood resonances | grave |
| pop | pumpkin pop: hollow pok + squelch + scattered seeds | pumpkin |
| hex | witchy trill + crackle | |
| whoosh | generic swish | |

Suggested use: Fantasy — swing/clash on sword fights, zap for wizard bolts, fire + explosion
for dragon/fire attacks, roar for the dragon, sparkle on a magic vanish. Halloween — bats when
bats fly, wail for ghosts, creak when a grave opens, pop when a pumpkin bursts, hex for the
witch, thunder for lightning. Classic — knock on contact, thud/stomp on impacts, topple when the
victim falls, slide for the shove-off-board.

## Ambient music (off by default)
| theme | file | loop | ogg / m4a | source (Music Studio project GAMBIT) |
|---|---|---|---|---|
| Fantasy | assets/audio/music/fantasy.{ogg,m4a} | 18 bars @ 72 bpm = 60 s, 5 s crossfade | 637 / 648 KB | ACE-Step track 7ba8639963 (harp, legato strings, cello pad), from 8.4 s |
| Halloween | assets/audio/music/halloween.{ogg,m4a} | 18 bars @ 96 bpm = 45 s, 5 s crossfade | 496 / 498 KB | ACE-Step e224b25618 (pizzicato, celesta, music box), from 20.1 s |
| Classic | assets/audio/music/classic.{ogg,m4a} | 16 bars @ 75 bpm = 51.2 s, 4.8 s crossfade | 503 / 558 KB | ACE-Step 893b3c0aac (sparse solo piano), from 4.0 s |
Seam match (cosine similarity of log spectra, 1 = identical): classic 0.88, fantasy 0.58,
halloween 0.60; simulated seams stay inside each track's normal level range. Alternates:
fantasy 5a2f8ddc67, halloween 325d8b93dc (has a dropout at 50 s, rejected), classic 704e9e8297.
- Each file is `loop + xfade` seconds; `js/audio/music.js` starts a copy every `loop` seconds
  and equal-power crossfades the tail into the next head, so it's seamless whatever padding
  the AAC encoder adds. Opus/ogg where `canPlayType` says yes, else AAC/m4a (Safari).
- Loaded only when music is on, audio is unlocked, and the theme declares
  `music: {file, loop, xfade}` in its sounds.js. One decoded track at a time (~23 MB RAM for
  60 s stereo at 48 kHz), released on theme switch / music off.
- Made with `tools/audio_loop.py make <flac> <name> --bpm B --bars N`: it searches beat-grid
  start points for the best-matching seam (cosine similarity of log spectra), trims, loudnorms
  to -18 LUFS / -2 dBTP, and encodes Opus 64k + AAC 80k (AudioToolbox).
- Music Studio project "GAMBIT" holds the generated sources (2 variations each).

## How to test
```
~/.claude/bin/cdp start --port 9524 -- --use-angle=metal --use-gl=angle --ignore-gpu-blocklist
node tools/audio_cdp.mjs [--wav] [--out=DIR]
```
Checks: no AudioContext before a gesture; running after the first click; every sound of every
theme renders, peaks ≤ -3 dBFS and is not silent (prints a peak/loudness table; `levels.json`;
`--wav` writes each buffer as a WAV for ffmpeg/ears); battle sounds at 1/2/5×, aliases, skip
drop; sound off mutes; settings sliders/toggle exist and save; music off by default, on →
loop plays, theme switch swaps track, off stops; a real game vs Pip plays move sounds through
`playMove`; zero console errors or warnings.
In a browser console: `(await import('/gms/3d/gambit/js/audio/index.js')).sfx('explosion')`.

## Edits outside my folders (all small)
- `js/app/boardhost.js`: import `attachBoard`, call it when the shared board is created.
- `js/app/screens/game.js`: move sound → `playMove(v)`; `play('illegal')` when a drop isn't legal.
- `js/app/screens/online_game.js`: its `sfx(v)` helper → `playMove(v)`.
- `js/app/screens/settings.js`: Effects volume slider, Music toggle, Music volume slider + 2 listeners.
- `js/app/store.js`: defaults `volume: 0.8, music: false, musicVolume: 0.5`.
- `js/puzzles/play.js`: moveSound → `playMove`; miss → `wrong`; correct step → `correct`; solved → `solved`.
- `js/themes/{classic,fantasy,halloween}/index.js`: one line each, `sounds: () => import('./sounds.js')`.

## Requests
- **battle agent**: call `sfx(name, {ctx, at})` from battle anims (table above).
- **ui**: online_game.js doesn't play `illegal` (left alone). `tick` exists if you want per-second
  ticking under 10 s. Settings styles the range inputs inline (accent-color); move to app.css if you like.
- **sci-fi sculptor**: copy `js/themes/classic/sounds.js` to give sci-fi its own move/capture; `laser` is ready.

## Open issues
- Nothing has been listened to by a human yet: the sounds are designed and measured, not
  ear-checked. Most likely tweaks: wood/marble mode tuning, check bell pitch, music picks.
- Music sources were picked by numbers (onset density, level steadiness), not by ear; the
  alternate variations are in Music Studio (project GAMBIT) if one sounds wrong.
