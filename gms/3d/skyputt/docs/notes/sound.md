# sound — SKYPUTT audio module

Procedural Web Audio only, no audio files. Self-contained in `js/audio/`; nothing else imports it yet.
Audition page: http://192.168.0.236:8888/gms/3d/skyputt/tools/sound_preview.html

## Files
| file | what |
|---|---|
| `js/audio/index.js` | public API `createAudio()`, plus test exports |
| `js/audio/graph.js` | master chain: sfx/music buses, one shared convolution reverb (generated impulse), limiter, soft clip |
| `js/audio/core.js` | helpers: noise buffers, impulse, voices (self-disconnecting), envelopes, modal impacts, FM bells |
| `js/audio/sfx.js` | every one-shot recipe, per-sound throttle, auto-duck table |
| `js/audio/roll.js` | continuous rolling noise, one reusable chain, per-surface profiles |
| `js/audio/music.js` | generative ambient player; `sky` theme |
| `js/audio/offline.js` | OfflineAudioContext renders and peak/RMS measurement (tests, preview) |
| `tools/sound_preview.html/.js` | audition page: every sound, roll slider and surface, music, mix, level meter, offline level table |
| `tools/sound_preview_cdp.mjs` | headless test (see Testing) |
| `tools/sound_preview_levels.json` | last measured levels (written by the test) |

## API
```js
import { createAudio } from '../audio/index.js';
const audio = createAudio({ master: 0.9, sfx: 1, music: 0.6 });   // defaults

audio.unlock();                       // in a gesture handler; idempotent, cheap: call on every pointerdown
audio.setVolume({ master, sfx, music });   // any subset, 0..1
audio.mute(true|false);
audio.play(name, params) -> bool      // false = not unlocked, muted, throttled or voice cap hit
audio.roll(speed, surface);           // every frame
audio.stopRoll();
audio.music.start('sky'); audio.music.stop(); audio.music.duck(true|false);
audio.music.playing / audio.music.theme / audio.ready / audio.supported / audio.debugState()
```
- Before `unlock()` everything is a silent no-op. `music.start()` called early is remembered and
  starts on unlock. Without Web Audio, every call is a no-op and nothing throws.
- Any sound takes an optional `pan` (-1..1) param, for example from the hit's screen x.
- The context suspends when the tab is hidden and resumes when it is visible again.
- Polyphony: per-sound minimum gap (`THROTTLE` in sfx.js, e.g. wall 35 ms) plus a 28-voice cap, so
  physics can call `play` freely.

### Sounds
| name | params | notes |
|---|---|---|
| `putt` | `power` 0..1 | level, brightness and low thump scale with power |
| `wall` | `speed` m/s, `material` stone/wood/metal/glass | level ~ speed^0.8 over 0..5 m/s |
| `bumper` | `speed` | springy boing |
| `windmillHit` | `speed` | wooden thwack and creak |
| `cupRattle` then `cupDrop` | | rim rattle (~0.45 s), then a hollow plop with two small bounces |
| `lipOut` | | rim scrape, pop-out, quiet "aww" |
| `splash`, `fall`, `boost`, `loop` | | |
| `pickup` | (`combo` to force) | rises a D-major-pentatonic step for each pickup within 2 s |
| `holeInOne` | | brass fanfare, bells and a crowd cheer (~4 s); auto-ducks the music |
| `birdie` / `par` / `bogey` | | stingers; auto-duck the music for their length |
| `click`, `back`, `star {n:1..3}`, `coin` | | UI |
| `aimTick` | `power` | very quiet; pitch follows power. Throttled to one per 35 ms |

### Roll surfaces
`grass sand ice wood metal glass`. The aliases `tube`, `bridge`, `fringe`, `rim`, `boost` and `sticky`
also work, and so do engine `MAT` ids (0/1/3/10 grass, 7 sand, 8 ice, 9 sticky, 11 wood). Wood plays
plank ticks every 12 cm and metal a seam tink every 50 cm. Speed is normalised over 0..5 m/s.
After 2 s of silence the chain is torn down, so an idle game costs no CPU.

## Wiring it in (engine)
| game event | call |
|---|---|
| first pointerdown / keydown (and every later one) | `audio.unlock()` |
| enter a hole / the menu | `audio.music.start('sky')` (the theme's id; unknown ids fall back to sky) |
| aim drag, power changes by about ≥ 0.04 | `audio.play('aimTick', { power })` |
| shot released | `audio.play('putt', { power })` |
| every render frame while the ball moves | `audio.roll(supported ? speed : 0, surfaceOfContact)`. Pass 0 while airborne |
| ball at rest / cup / oob | `audio.stopRoll()` |
| physics event `wall` (mat WALL) | `play('wall', { speed: ev.speed, material: theme wall material })` |
| physics event `obstacle` on a bumper | `play('bumper', { speed })`; on a windmill blade: `play('windmillHit', { speed })` |
| physics event `rim` / `cup-hit` | `play('cupRattle')` (throttled to one per 0.3 s) |
| physics event `cup` | `play('cupDrop')`, then the result stinger about 0.5 s later: `holeInOne` / `birdie` / `par` / `bogey` |
| ball crossed the cup but left (if the engine detects it) | `play('lipOut')` |
| oob into water / off the island | `play('splash')` / `play('fall')` |
| crystal collected | `play('pickup')` |
| boost pad entered | `play('boost')`; loop entered: `play('loop')` |
| results screen | `play('star', { n })` for each star about 350 ms apart, `play('coin')` per coin tick |
| menu buttons | `play('click')` / `play('back')` |
| celebration overlays (confetti etc.) | `audio.music.duck(true)` … `duck(false)` (stingers also auto-duck on their own) |
| settings screen | `audio.setVolume(...)`, `audio.mute(...)` |

Physics event speeds (`jn`, the normal impulse speed) map well onto the 0..5 m/s range. Below
about 0.3 m/s the sounds are near silent, so there is no need to filter them.

## Testing
```
~/.claude/bin/cdp start --port 9541
CDP_PORT=9541 node tools/sound_preview_cdp.mjs [--wav=DIR]
```
It checks that there is no AudioContext before a gesture, that play() is a no-op before unlock,
that pre-unlock calls don't throw, that unlock works on a click, that a pre-unlock `music.start`
begins on unlock, that every sfx plays live, that mute works and that the voice counter drains. It
then renders every sfx variant, all 6 roll surfaces and 40 s of music offline through the real
master chain, and checks peak < 1.0 and RMS > -50 dBFS. It also checks for zero console errors or
warnings. All pass (2026-11-02).

Levels (final output, with RMS over the audible span). Recipes are randomised, so values move by about ±1 dB between runs. The full table, including the pre-limiter peaks, is in `tools/sound_preview_levels.json`:

| sound | peak | peak dB | RMS dB | | sound | peak | peak dB | RMS dB |
|---|---|---|---|---|---|---|---|---|
| putt p=0.15 | 0.139 | -17.1 | -40.5 | | splash | 0.280 | -11.1 | -33.2 |
| putt p=0.6 | 0.297 | -10.6 | -37.1 | | fall | 0.180 | -14.9 | -32.7 |
| putt p=1 | 0.543 | -5.3 | -34.6 | | pickup (combo 0) | 0.170 | -15.4 | -31.0 |
| wall stone 1 / 6.4 m/s | 0.119 / 0.487 | -18.5 / -6.3 | -39.1 / -36.9 | | pickup (combo 6) | 0.197 | -14.1 | -30.4 |
| wall wood 1 / 6.4 | 0.097 / 0.452 | -20.3 / -6.9 | -41.7 / -35.2 | | boost | 0.223 | -13.0 | -32.8 |
| wall metal 1 / 6.4 | 0.088 / 0.322 | -21.1 / -9.8 | -42.3 / -33.8 | | loop | 0.175 | -15.2 | -35.0 |
| wall glass 1 / 6.4 | 0.066 / 0.166 | -23.6 / -15.6 | -44.7 / -35.9 | | holeInOne | 0.540 | -5.4 | -23.8 |
| bumper 1.5 / 6 | 0.175 / 0.350 | -15.1 / -9.1 | -32.9 / -28.2 | | birdie | 0.230 | -12.8 | -27.9 |
| windmillHit | 0.443 | -7.1 | -33.4 | | par | 0.166 | -15.6 | -29.6 |
| cupRattle | 0.216 | -13.3 | -34.5 | | bogey | 0.240 | -12.4 | -25.2 |
| cupDrop | 0.349 | -9.1 | -31.3 | | click / back | 0.084 / 0.080 | -21.5 / -21.9 | -34.8 / -36.3 |
| lipOut | 0.203 | -13.8 | -37.6 | | star 1/2/3 | 0.18/0.15/0.16 | -15.0/-16.7/-15.8 | ~-30.5 |
| roll grass (4.5 m/s → 0) | 0.179 | -14.9 | -29.4 | | coin | 0.137 | -17.3 | -34.8 |
| roll sand | 0.225 | -13.0 | -32.8 | | aimTick p=0 / 1 | 0.018 / 0.026 | -34.8 / -31.8 | -46 |
| roll ice | 0.088 | -21.1 | -36.9 | | music sky 40 s | 0.190 | -14.4 | -27.5 |
| roll wood | 0.290 | -10.8 | -27.5 | | | | | |
| roll metal / glass | 0.123 / 0.089 | -18.2 / -21.0 | -34.9 / -36.5 | | | | | |

The highest peak is 0.543 (putt at full power), so there is at least 5 dB of headroom everywhere,
and the limiter and soft clip are only a safety net. Harp pitch was checked by autocorrelation and
is within 1 cent.

## Music: `sky`
D major (with drifts to A and C major), 66 bpm. Warm detuned-saw pads go through one slowly
breathing lowpass, with a sine root under them. Karplus-Strong harp plucks are rendered once every
3 semitones and repitched, and soft FM bells sit an octave up. A ping-pong delay sits on the
arpeggios, and a quiet pink-noise "air" bed with a wandering bandpass runs under everything.
Chords follow a Markov graph (7 chords, 2–4 bars each). Phrase types are rest / sparse / up / down
/ wander / bells, chosen by a random-walk density, and the timing and velocity are humanised, so
nothing repeats verbatim. The scheduler runs every 250 ms with a 1.5 s lookahead. Adding a theme
means adding an entry to `THEMES` in music.js (chords, key set, bpm, levels).

## Known issues / notes
- **The levels were balanced by meter and spectrogram, not by ear.** The agent cannot listen. Aaron or
  the manager should audition the preview page, especially the relative loudness of music vs. sfx
  (music sits around -27.5 dB RMS at volume 0.6) and the crowd cheer, which is the most synthetic sound.
- The `holeInOne` crowd is synthesised: saw "woo" voices through vowel formants, applause and a
  noise roar. It reads as a cheer but not a real crowd.
- `lipOut` cannot be triggered by physics today; the engine has no lip-out event yet.
- The CDP test cannot pull a WAV larger than about 5 MB through Runtime.evaluate (the socket closes),
  so `--wav` renders only 12 s of music.
- The harp buffers are about 0.4 MB each, and about 10 get cached per context.
- Proposals for DECISIONS: (1) music starts on the menu at 0.6 and sfx at 1.0, and the settings
  show master / sfx / music sliders plus mute; (2) theme packs add a music theme id with the same
  name as the visual theme (`sky`, `spooky`, `frost`).
