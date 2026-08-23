# KITEHAWK — sound effects

**Decision: KITEHAWK's sound effects are procedural code, not audio files.** We adopt the Web Audio
SFX lab Aaron built at `gms/3d/forge_test/audio/` as the foundation, and extend it with an aviation
set. Music and voice are unaffected — they stay as generated files per `SUNO.md` (D7, D8).

Manager verified 2026-08-23: `node audio/tools/verify.mjs` in `forge_test` reports **53/53 clean**.
This is not an assumption about the lab; it was run.

## Why code instead of samples

- **Zero download.** 53 sounds cost about 1200 lines of JS and no bytes of audio.
- **Parameterised by game state**, which is the real prize. Every effect takes live params, so an
  explosion's `size` and `dist` come from the actual event rather than from picking one of three
  pre-baked files. A flak burst 900 m below you and one that just holed your wing are the same
  function with different numbers.
- **Verifiable.** `tools/verify.mjs` renders every effect in an `OfflineAudioContext` inside
  headless Chrome and asserts it makes sound. A broken envelope is silent and looks perfectly fine
  in source — this harness is the only thing that catches it, and it must be ported with the code.
- It already exists and it already works.

## What we take

Port `js/core.js` (graph, buses, reverb IR, envelopes, Karplus-Strong, noise) and the harness
`tools/verify.mjs` **unchanged in behaviour**. Port the lab page too — it is how Aaron auditions and
retunes a sound by dragging sliders, and he has asked to check the sounds at playtest.

Of the 53, these carry straight over to a biplane game:

| use in KITEHAWK | lab effect |
|---|---|
| flak burst, ground target, ammo dump | `explosionBoom`, `explosionCrack`, `explosionDistant` |
| rounds into engine cowling / wire / strut | `impactMetal`, `impactWood` |
| a plane passing close, a dive | `whooshFast`, `whooshHeavy` |
| burning aircraft, fuel fire | `fireCrackle`, `ignite` |
| **parachute canopy, fabric wings** | `clothSwish` |
| **airframe stress in a dive** | `creak` |
| storm act, altitude weather | `thunder`, `rain`, `windGust` |
| ditching in the sea | `waterSplash`, `bubble` |
| HUD, warnings, menus | `uiBlip`, `uiConfirm`, `uiError`, `alarm` |
| crate collected, cash | `pickupCoin`, `pickupPower`, `coinsBag` |
| tension at low health | `heartbeat` |
| aerodrome ambience | `bird`, `owl`, `leaves`, `footGrass`, `footWood`, `doorWood` |
| shattered instrument glass | `glassBreak` |

Not used: `laser`, `electricZap` (wrong period), the melee/magic set (`swordClash`, `bowShot`,
`arrowHit`, `spellCast`, `spellHit`), and the FORGE work/village foley (`anvil`, `dig`, `chopWood`,
`stoneGrind`, `chestLatch`, `footSnow`, `wade`, `growl`, `insect`, `frog`). Port them anyway — they
cost nothing, and the lab is more useful to Aaron intact than pruned.

## The real gap, and it is a big one

**The lab is entirely one-shot.** Its contract is `play(eng, o)` — fire and forget, with `core.js`
tracking each voice by a start and end time. Nothing in it sustains and responds to changing
parameters.

The defining sound of this game is a **rotary engine**, and it is the exact opposite: continuous,
and driven every frame by RPM, load, and the player's own dive. So the aviation work is not "add
more one-shots", it is **adding a sustained-source layer to `core.js`** — a handle you create, push
parameters at, and release. That layer does not exist yet and it is the piece most likely to be
underestimated.

### To build, continuous

- **Rotary engine** — RPM, load, mixture. A period rotary blips on and off rather than throttling,
  which is a gift: the sound of cutting the blip is the sound of a stall turn.
- **Slipstream / airflow** — noise bed keyed to airspeed. This is the altitude cue as much as the HUD is.
- **Wire hum and airframe stress** — rises with dynamic pressure; the sound of overspeeding a dive.
- **Stall buffet** — the warning you feel before the HUD says anything.
- **Engine damage states** — misfire, rough running, cough, dead-stick silence, restart.
- **Zeppelin drone** — a distinct, larger, slower engine bed for act-scale targets.
- **Doppler and distance** for every continuous source, since enemies pass you at closing speed.

### To build, one-shot

Machine gun (Vickers/Spandau — synchronised, period, must not sound like a modern gun), ricochet,
canopy deploy snap, crate catch, wing-shear, gear touchdown and ground roll, flak *crump* as
distinct from a generic explosion, and the propeller-strike/prop-stop.

## Rules

- **The game must run correctly with the sound engine muted or unavailable** — same contract as D7.
  No gameplay logic hangs off an audio callback.
- Continuous sources are pooled and capped; a hundred aircraft may not open a hundred oscillators.
- Every new effect goes into `verify.mjs` in the same run. An unverified effect is assumed silent.
- Aaron auditions in the lab page and retunes with sliders. **Ship the defaults he lands on**, not
  the ones an agent guessed.

## Phase placement

This is P9 in `MANAGER_STATE.md`, with one exception: the **sustained-source layer in `core.js`**
is ported early, alongside the renderer in P1, because it is engine architecture rather than
content, and retrofitting sustain into a one-shot engine later is the expensive version.
