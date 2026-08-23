# KITEHAWK — audio engine

Every sound effect in this game is code. There are no SFX files and there is no download
(DECISIONS **D16**). Music and voice are unchanged — they are still generated files (D7/D8) and
this document does not cover them beyond the facade calls that reach them.

The engine is the Web Audio SFX lab from `gms/3d/forge_test/audio/`, ported whole, plus the thing
that lab did not have: a **sustained-source layer**, which is what D17 is about.

---

## 1. Layout

```
js/audio/
  core.js       graph, buses, reverb IR, envelopes, Karplus-Strong, noise
                + THE SUSTAINED-SOURCE LAYER (pool, cap, smoothing, doppler, distance)
  sfx.js        the 53 one-shots ported from the lab, behaviour unchanged
  aviation.js   the 12 aviation one-shots
  sources.js    the 6 continuous sources
  registry.js   merges them; import THIS, not the individual files
  facade.js     the ARCHITECTURE §6.8 facade — the only thing the game itself calls
  verify.js     the browser half of the harness (renders and measures)
tools/
  verify_sfx.mjs        the harness — headless Chrome, OfflineAudioContext
  sfxlab/index.html     the bench Aaron auditions and retunes in
  sfxlab/harness.html   the page verify_sfx.mjs drives
shots/audio/_gates.json the gate record (ARCHITECTURE §8.3 shape)
```

**`js/core/audio.js` is not written here** — it belongs to agent S (§5.1) and is a two-line
re-export away:

```js
export { createAudio, createAudio as default } from '../audio/facade.js';
```

---

## 2. The facade — what the game calls

`js/audio/facade.js` implements ARCHITECTURE §6.8 exactly, and adds four methods for the sustained
layer that §6.8 has no way to express.

```js
const audio = await createAudio(ctx);   // never throws, never blocks, never awaits a file
```

| call | returns |
|---|---|
| `audio.ready` | `false` until a user gesture starts the AudioContext |
| `audio.available` | `false` when there is no AudioContext at all |
| `audio.sfx(key, {gain, rate, force, params})` | `id` or `false` |
| `audio.loop(key, {x, y, gain, …params})` | `id` or `false` — a **continuous** source |
| `audio.param(id, values)` | **extension** — push parameters at a running loop |
| `audio.place(id, x, y, vx, vy)` | **extension** — position and velocity, in world units |
| `audio.handle(id)` | **extension** — the raw handle, for the hot path |
| `audio.update(dt)` | **extension** — once a frame: re-spatialise and reap |
| `audio.stop(id, fade)` / `audio.stopAll(fade)` | |
| `audio.music/stopMusic/setIntensity/ambience` | file-backed; no-ops with no manifest |
| `audio.voice(lineId)` | `{playing:false, len:0}` is the **normal** path |
| `audio.hasTake(take)` | |
| `audio.setListener(x, y, halfWidth)` / `audio.followCamera(on)` | |
| `audio.duck(amount, seconds)` / `audio.hitstop(scale, seconds)` | |
| `audio.setVolume/getVolume/setMuted` | buses: master, sfx, music, voice, ambience |
| `audio.report()` | for the debug overlay |

**The rule that matters (D7, §10 rule 3): the game must be fully playable and correct with
`assets/audio/` renamed away, and no gameplay logic may hang off an audio callback.** So every
method above is *total*. With no AudioContext at all, `sfx()` and `loop()` return `false`,
`param()`/`place()` return `false`, `voice()` still returns `{playing:false, len:0}`, `handle()`
still returns something with `.set()` on it, and nothing throws. A caller never needs to know which
kind of facade it is holding. Gate **A9** calls all 22 methods with the context disabled and
requires zero exceptions.

Keys are dotted and stable (`gun.vickers`, `flak.crump`, `loop.engine`); the procedural ids behind
them are not a contract. The map is `KEYS` in `facade.js` — 45 keys, and the harness fails if any of
them resolves to nothing.

**One deviation from §6.8, and DECISIONS is the authority over it.** §6.8 resolves a key file-first
and falls back to "a small built-in synth for the ~20 core keys". D16 post-dates that and makes the
procedural bank the primary, so for SFX the order here is *manifest entry with a real loaded file →
the procedural bank → silent*. Music, ambience and VO keep §6.8's order, because those genuinely are
files.

---

## 3. The sustained-source layer

This is the piece the lab did not have and the reason D17 exists. The lab's whole contract is
`play(eng, o)` — fire and forget, tracked by a start and an end time. Nothing in it sustains. A
biplane game's defining sound is a rotary engine, which is the exact opposite: continuous, and
driven every frame by RPM, load and the player's own dive.

### Create, drive, release

```js
const h = eng.source('rotary', { x, y, rpm: 0.6, load: 0.4, mixture: 1 });

h.set({ rpm, load, mixture, rough });   // partial; unknown keys ignored
h.at(x, y, vx, vy);                     // world units and world units/second
h.gain(v);
h.stop(0.4);
```

Through the facade the same thing is:

```js
const id = audio.loop('loop.engine', { x, y, rpm: 0.6 });
audio.param(id, { rpm, load, mixture });
audio.place(id, x, y, vx, vy);
audio.stop(id, 0.4);
```

Once a frame, after the sim has moved everything:

```js
audio.setListener(cam.x, cam.y, view.halfWidth);
audio.update(dt);          // re-spatialises every live source and reaps finished slots
```

**Every write takes an explicit time**, defaulting to `ctx.currentTime`. That is what lets the whole
layer render in an `OfflineAudioContext`: the harness calls `h.set(v, t)` at `t = 0.05, 0.95, 1.85 …`
and the automation is in the timeline before rendering starts. There is no separate offline path to
drift out of sync with the live one.

### The six continuous sources

| id | parameters | note |
|---|---|---|
| `rotary` | rpm, load, **mixture**, rough | 9-cylinder, fires 4.5×/rev; at 1200 rpm that is a 90 Hz blat and a 40 Hz blade pass |
| `slipstream` | speed, gust, shield | airflow over the airframe; the energy cue |
| `wireHum` | q, stress | aeolian tone off the bracing wires, rising with dynamic pressure |
| `stallBuffet` | severity, speed | separated flow hammering the tail, 8–20 Hz |
| `zeppelinDrone` | engines, rpm, load | several big Maybachs slightly out of step; the beat is the character |
| `groundRoll` | speed, surface | grass to gravel, with bumps whose rate rises with speed |

**`mixture` is the blip switch.** A period rotary has no useful throttle — the pilot cuts the
ignition with a blip switch, so the engine goes on and off rather than up and down. Drive `mixture`
to 0 and the firing collapses to a windmilling prop; that *is* the sound of a stall turn, and it is
also dead-stick. Engine damage is therefore: `rough` for misfire and rough running, `mixture` → 0
for dead-stick, and the `engine.cough` / `engine.restart` one-shots for the transitions.

### Pooling and the cap

- **Cap is 12 concurrent sources** (`eng.sources.cap`). A hundred aircraft may not open a hundred
  oscillators.
- Over the cap, the pool **steals** from the weakest source, where weakness is
  `priority / (1 + distance/260 wu)`. The far zeppelin loses its slot to the enemy on your tail.
  If the newcomer is not stronger than the weakest incumbent it is **refused**.
- A refusal returns `NULL_SOURCE`: a frozen handle with the whole API on it that does nothing.
  **Callers never branch on it.** That is the same contract as the facade's, one level down.
- Released slots go to an **idle list** and are reused by the next source of the same type for 4
  seconds, then torn down. Building a rotary is about fifteen nodes; a dogfight should not rebuild
  it every time an enemy dies.
- Parameters are **smoothed, not stepped** — `setTargetAtTime` with a per-parameter time constant
  declared on the def, and a write whose target has not moved is skipped so a 60 Hz drive does not
  pile up automation events. The **first** write to a parameter snaps rather than glides, because
  Web Audio constructs an oscillator at 440 Hz and a smoothed first write means every source
  audibly slides in from 440 Hz.

### Distance and doppler

The pool owns spatialisation; a source def owns timbre only, and receives the doppler multiplier as
`_pitch` and the distance as `_dist`.

- **Distance**: `1/(1 + d/260 wu)`, plus an air-absorption lowpass at `20 kHz · e^(−d/2500 wu)`.
  Distant engines lose their top end long before they lose their level.
- **Doppler**: `(c + v_listener) / (c + v_source)` along the line between them, clamped to
  0.55–1.9. `c` is 340 m/s expressed in world units — **2267 wu/s at D26's 1 wu = 0.15 m**.
  At a 700 wu/s pass that is ×1.45 in and ×0.76 out.
- `stallBuffet` and `groundRoll` deliberately ignore `_pitch`: your own airframe shaking has no
  closing speed.

---

## 4. Running the harness

```
node tools/verify_sfx.mjs                # everything; writes shots/audio/_gates.json
node tools/verify_sfx.mjs --json         # also writes shots/audio/verify.json (raw rows)
node tools/verify_sfx.mjs --only=rotary  # filter the sustained tables
node tools/verify_sfx.mjs --nolab        # skip the lab-page smoke test
```

It starts a static server and headless Chrome, renders every effect through the **real master
chain** in an `OfflineAudioContext`, and measures it. Exit code is non-zero if any row or any gate
result fails. **A broken envelope is silent and looks perfectly fine in source; this is the only
thing that catches it.** Rule: an unverified effect is assumed silent.

Renders are **seeded** — the engine draws its noise buffer, its reverb IR and every loop offset from
`Math.random`, and the harness swaps in a fixed generator for the graph build. Two runs produce
byte-identical numbers, which is what lets a control render cancel and a threshold be set against a
measured floor rather than against run-to-run drift.

### What it asserts

| gate | assertion |
|---|---|
| **A1** | every one-shot makes sound, does not clip, has no DC, no head click, no cut-off tail |
| **A2** | every swept parameter **changes the output** — rms, brightness or envelope modulation |
| **A3** | a released source goes silent |
| **A4** | doppler shifts pitch up on approach and down on recede |
| **A5** | distance attenuates |
| **A6** | the pool caps concurrent sources and steals correctly |
| **A7** | release frees the slot |
| **A8** | the lab page boots and every card plays |
| **A9** | the facade is total with audio disabled — 22 methods, zero exceptions |

**A2 is the one that took work.** A continuous source that makes a noise is not necessarily working;
it has to *respond*. Three things are measured per plateau of an 8-step sweep — mean rms, a spectral
brightness proxy, and **envelope modulation depth over 20 ms blocks** — and the largest spread wins.
The third exists because mean level is the wrong instrument for an *intermittent* parameter: a
misfire that guts the engine a fifth of the time barely moves the average, so a `rough` knob wired
to a dramatic effect and one wired to nothing measured the same.

The threshold (0.30) is bracketed by measurement, not taste: with rotary's roughness wiring cut
entirely the suite still reports 0.218 from plateau-to-plateau variation, and the weakest genuinely
wired parameter in the set measures 0.462.

**A4 needed a real spectrum.** The flyby compares the approach half against the recede half over
mirrored 2.5 s windows — the motion is purely radial so the doppler factor is constant across each
half and the distance profiles cancel — and then divides by **the same seeded flyby rendered with
doppler clamped off**, so anything asymmetric that is not doppler divides out. The pitch proxy is a
Hann-windowed 4096-point FFT centroid, because the two cheap proxies both failed on the zeppelin:
the beating between its detuned engines swings `mean|Δv|/mean|v|` more than pitch does and came out
*non-monotonic* across a sweep that raised every frequency by 90%, and a single Goertzel per bin is
0.4 Hz wide over a 2.5 s window, so a bank of them samples forty arbitrary slivers rather than a
spectrum. The controls now read **exactly 1.000**.

### Before landing a change

Per §8.3, a gate must fail if the thing it tests is reverted. These have all been run:

| revert | result |
|---|---|
| silence one one-shot's first envelope | A1 red, 64/65 |
| disconnect `rough` from the rotary entirely | A2 red at 0.218 |
| make `stop()` not silence the source | A3 and A7 red, 0/15 sweeps clean |
| force the doppler factor to 1 | A4 red, all four sources read exactly 1.000 |
| remove the cap check | A6 red, 22 live against a cap of 12 |

---

## 5. How Aaron auditions and retunes

Open `tools/sfxlab/index.html`, press **Enable audio** (browsers only start audio from a real tap).

- **One-shot cards** have a ▶ Play button. Press it, then open *notes & settings* and drag sliders.
- **Continuous cards** are at the top and have two buttons. **● Hold** starts the source and leaves
  it running — **the sliders then drive the live sound**, which is the only way to tell whether a
  rotary engine is any good. **↗ Flyby** sends it past you at 700 wu/s so you can hear the doppler
  and the distance roll-off.
- Sort each sound into **Keepers / To audition / Not for this game**. The buckets are seeded from
  SFX.md's inventory, so the FORGE village foley is already parked and everything KITEHAWK actually
  uses starts in *To audition*.
- Type what it actually sounds like in **Notes**, and rename it in **Call it instead** if it turned
  out to be something else. That is how `impactMetal` became a struck bell in FORGE.
- **Copy keepers** / **Copy all** puts a report on the clipboard. Paste it straight back into a
  session. The report ends with a machine-applicable `DEFAULTS = { … }` block listing only the
  parameters that were actually moved.

**The defaults Aaron lands on are the ones that ship** (SFX.md), not the ones an agent guessed. All
current defaults are agent-guessed placeholders and should be treated as such until they have been
through this page.

Verdicts and slider positions persist in `localStorage`. **Reset** needs two presses within three
seconds — nothing in here uses `confirm()`.

---

## 6. Inventory

**65 one-shots.** The 53 ported from the lab (SFX.md lists which carry over to a biplane game and
which are FORGE foley kept because they cost nothing), plus 12 aviation:

`vickers` · `spandau` · `ricochet` · `flakCrump` · `canopySnap` · `crateCatch` · `wingShear` ·
`wireSnap` · `gearTouchdown` · `propStop` · `engineCough` · `engineRestart`

The guns are the ones most easily got wrong. A synchronised Vickers .303 fires about 500 rounds a
minute — eight a second — so you hear individual reports rather than a modern buzzsaw, and what
carries is the clatter of the interrupter gear and the breech as much as the crack. Both guns are
built from the same `round()` primitive with different rates, brightness and second-gun offsets, and
the inter-round interval is jittered because a gear-driven gun is not a metronome.

`flakCrump` is deliberately not `explosionCrack`. A crump has a **smeared** attack and a woolly
body; what is sharp about it is the shell casing, not the charge. It carries an optional incoming
whistle, black smoke sitting in the air afterwards, and a shrapnel field whose count and brightness
fall with distance.

**6 continuous.** Listed in §3.
