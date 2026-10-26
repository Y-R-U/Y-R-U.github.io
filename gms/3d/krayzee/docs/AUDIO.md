# AUDIO lane

Files: `js/audio/index.js` (engine, buses, unlock, radio chain), `js/audio/synth.js` (procedural buffers),
`js/audio/jets.js` (turbofan / turboprop / fighter voices + flyby, D33), `js/audio/jettest.js` (their offline checks),
`tools/sounds.html` (Aaron's phone rating page; `?test=1` runs the jet checks), `tools/test-jetsound.mjs` (CDP driver),
`tools/audio.html` (test bench; `?test=1` runs the offline level check into `window.__audioTest`).
Everything is synthesised at load (about 0.2 s of CPU, no network, no GPU). `audio/sfx/` is empty: nothing needed samples.

## Boot and unlock
```js
import * as audio from './audio/index.js';
audio.initAudio();               // idempotent; sets navigator.audioSession.type='playback' first (iPhone silent switch)
audio.onUnlock(() => {...});     // fires once the context first reaches 'running'
audio.isUnlocked();
```
`initAudio()` arms page-lifetime listeners on `pointerup`, `touchend`, `click`, `keydown`, `mousedown` (never a
`{once}` pointerdown/touchstart: that is not user activation on Android). Any of them resumes the context whenever it
is not running, so iOS app-switch suspends recover on the next tap. The context suspends on `visibilitychange` hidden
and resumes on visible / `pageshow`. Pre-iOS-16.4 gets a looping silent `<audio data-silent>` started inside the gesture.
Every function is safe to call before unlock; sounds simply start once the context runs.

## Mix
`setVolumes({ sfx, voice, music, master })` — 0..1 (0..100 also accepted). UI calls it with `getSettings()` values.
Buses: `master` (→ limiter) ← `sfx`, `radio` (voice), `music`. Radio transmissions duck sfx and music to 65%.

## Listener
Once per frame, from the active camera:
```js
audio.setListener({ position, velocity, forward, up });   // arrays or {x,y,z}; forward = camera -Z in world
```
Sources are placed relative to `position`; the WebAudio listener stays at the origin and only takes the orientation.

## Engine voices (Lycoming O-320-ish flat four, 2-blade prop)
```js
const eng = audio.createEngineVoice({ gain: 1, priority: 0 });
eng.setRPM(rpm, load?)        // 0 = engine off; load 0..1 (defaults from rpm). IDLE_RPM 700, MAX_RPM 2700
eng.setThrottle(t)            // shortcut: rpmFromThrottle(t) and load = t
eng.setInterior(bool)         // cockpit: muffled lowpass + cabin boom, centred, no doppler
eng.update(listenerPos, listenerVel, sourcePos, sourceVel)  // pass null listener args to use setListener's values
eng.setGain(v); eng.dispose();
audio.setVoiceCap(n)          // default 6; nearest win, the interior voice always wins, >4 km is culled
```
Exhaust (firing pulses at rpm/30 Hz with uneven cylinders) and prop (blade-pass whup + harmonics) are looped buffers
whose playbackRate = rpm/1200 × doppler. Throttle opens the load filter (brighter, louder). Exterior: inverse-distance
panner (ref 12 m), air-absorption lowpass with distance, doppler from relative velocity (clamped 0.6–1.6).
The cap is resolved in a microtask after the frame's `update()` calls; no extra tick call needed.

## Jet engine voices (D33, JETSOUND): `js/audio/jets.js`
Pick the voice from the aircraft's engine kind (`AIRCRAFT[id].engine.kind`, or `ac.engineKind` from the flight model):
```js
const eng = audio.createEngineVoice({ kind: 'piston' | 'turbofan' | 'turboprop' | 'fighter', gain: 1, priority: 0 });
// unknown or missing kind → the piston voice, so old call sites keep working
```
| kind | aircraft | layers |
|---|---|---|
| `turbofan` | Royal Jumbo (4 engines) | jet rumble (pink → lowpass, louder behind), fan whine (blade pass ~2.1 kHz at 100 % N1, 4 engines beating), "buzzsaw" shaft-order tones above ~80 % power, heard in front only. Inside: quiet, muffled at 500 Hz |
| `turboprop` | Hercules (4 engines) | 4-blade prop throb at 68 Hz with a growly harmonic stack, the 4 props 0.25–0.75 Hz apart (the "wow-wow" beat), turbine whine ~2.6 kHz, load-opened lowpass. Inside the hold: loud, muffled at 700 Hz |
| `fighter` | F-35 | roar (pink → lowpass, louder behind), idle howl (~760 Hz moan with vibrato, fades under the roar), afterburner layer (dense positively-skewed crackle + low boom), optional lift-fan layer |

Same methods as the piston voice, plus:
```js
eng.setN1(pct, load?)       // N1 % as JETCORE reports it (ac.n1 * 100). Values <= 1.5 are read as a 0..1 fraction.
                            // idle/max per kind: turbofan 22/100, turboprop 30/100 (n1 = power), fighter 30/100. 0 = off.
                            // load 0..1 (optional): turboprop uses it for prop loudness/brightness; defaults from N1.
eng.setRPM(pct, load?)      // alias of setN1 for jets
eng.setThrottle(t, { spool?, snap? })  // no N1 from the flight model? throttle → N1 with the voice's own spool lag
                            // (tau: turbofan 2.2 s, turboprop 0.9 s, fighter 0.7 s; on the audio clock). The first call snaps.
eng.setAfterburner(0..1)    // fighter only; JETCORE's ac.ab (already smoothed). No-op on other kinds.
eng.setLiftFan(0..1)        // fighter only; STOVL lift-fan roar. Its 3 nodes are only built on the first non-zero call.
eng.setForward(vec | null)  // optional nose direction (world). Without it the voice uses its velocity once > 3 m/s.
                            // Drives directivity: buzzsaw/howl/fan in front, roar behind.
eng.getN1()                 // current (spooled) N1 %, for debugging
```
`setInterior`, `update(listenerPos, listenerVel, sourcePos, sourceVel)`, `setGain` and `dispose` behave exactly as for the
piston voice, and jet voices share the voice cap. Jets differ in four ways. Doppler is clamped to 0.5–2.0, and it shifts
the noise layers' filter cutoffs as well as the playback rate. Pink noise sounds the same at any playback rate, so
without the cutoff shift a passing jet would not change pitch. Panner refDistance is 25–30 m, so a jet carries further
than a Cessna. The air-absorption lowpass is gentler. Jets are culled beyond 9 km (7 km for the turboprop) instead of 4 km.

### Flyby one-shot
```js
audio.playFlyby(intensity 0..1, { position, dir, delay, boom, gain })   // returns its length in s (~4.2)
```
A fast pass: the roar and howl are doppler-swept (bright and high on approach, dropping hard as it passes), with a
crackling tail after the pass. A double N-wave sonic boom ("ba-BOOM") follows the pass when `intensity >= 0.95` or
`boom: true`. `position` is the closest point of approach in world space and `dir` is the direction of flight. The
panner travels 220 m before that point to 330 m after it, so the pass sweeps across the stereo field. It costs 10
nodes for about 4 s. Suggested trigger: an F-35 at more than ~250 kt passing within ~150 m of the camera while the
camera is not riding that jet (tower view, chase of another plane). Pass `boom` only above Mach 1, or when the story
wants it.

### Wiring (main.js, at integration)
```js
// player voice (main.js ~206):
engine = audio.createEngineVoice({ gain: 1, priority: 1, kind: S.player.ac.engineKind });
// per frame (main.js ~751): pistons keep rpm; jets take N1 % (turboprop's instruments().rpm is PROP rpm, so use n1)
const jet = ac.engineKind && ac.engineKind !== 'piston';
engine.setRPM(ac.crashed ? 0 : (jet ? ac.n1 * 100 : ac.instruments().rpm), ac.eng);
engine.setAfterburner?.(ac.ab || 0);
engine.setInterior(interior);
engine.update(null, null, P.rig.root.position, ac.vel);
// AI (main.js ~764/765): same two changes
v = audio.createEngineVoice({ gain: 0.8, kind: e.ac.engineKind });
const ej = e.ac.engineKind && e.ac.engineKind !== 'piston';
v.setRPM(e.ac.crashed ? 0 : (ej ? e.ac.n1 * 100 : e.ac.instruments().rpm), e.ac.eng); v.setAfterburner?.(e.ac.ab || 0);
```
If the player switches aircraft, the voice must be recreated (it already is at play start). `setRPM` with a prop rpm of
735–1020 on a turboprop voice would be read as N1 > 100 %, which is why the turboprop needs `n1`.

### Cost (measured 2026-10-27, `tools/test-jetsound.mjs`)
Nodes per sounding voice, counted by wrapping the context's `create*`: piston 9, turbofan 11, turboprop 11, fighter 11
(+3 once the lift fan is used). The flyby one-shot uses 10 for about 4 s. The voice cap (default 6) still bounds the
total, so 6 jets ≈ 66 nodes. In an offline render, the player F-35 in afterburner plus 7 AI jets plus the wind and
rolling beds took 1.0–1.65× as long as 8 piston voices with the same beds (5 runs on a busy machine). The jet buffers are about 2.9 MB in total at 48 kHz and
take about 0.1 s of CPU to build. They are built lazily on the first jet voice, so piston-only sessions pay nothing.

### Test
`node tools/test-jetsound.mjs [--url=…] [--falsify=loud|flat|nodoppler] [--json]` loads `tools/sounds.html` (it must
have no errors) and then `tools/sounds.html?test=1`. The second page runs `js/audio/jettest.js`, which renders every
scenario in an OfflineAudioContext at 48 kHz with the limiter bypassed, so a limiter can't hide clipping. It measures
peak, RMS, ungated K-weighted LUFS, spectral centroid, the 250–2500 Hz band share, waveform skewness (the standard
measure of jet crackle) and the 200 ms envelope depth of the 40–400 Hz band (the turboprop beat).
2026-10-27: 75/75. Falsified: `loud` (×6 gain) fails 14 checks, `flat` (N1 pinned at 60 %) fails 8, `nodoppler` fails
the doppler check. Zeroing the prop detunes by hand dropped the beat from 0.17 to 0.02 and failed the beat check.

| scenario (25 m, raw) | peak dB | LUFS | centroid Hz | notes |
|---|---|---|---|---|
| piston full (reference) | −1.2 | −11.3 | 502 | |
| jumbo idle / mid / take-off, front | −23 / −13 / −4 | −31 / −21 / −12.6 | 480 → 1070 → 1420 | buzzsaw band share front 0.72 vs rear 0.45 |
| jumbo take-off, cockpit | −16 | −28.5 | 170 | |
| herc idle / full / inside | −17 / −3.6 / −6 | −27 / −12.9 / −15.8 | 290 → 520 / 170 | beat depth 0.17 (piston 0.06) |
| F-35 idle front / mil front / mil rear | −23 / −9.5 / −4.5 | −31 / −19.6 / −15.1 | 500 → 930 | |
| F-35 afterburner rear / cockpit | −2.7 / −13 | −13 / −25 | 1170 / 174 | skewness 0.40 (mil −0.02) |
| AI F-35 pass, 150 m/s, 60 m abeam | | | 1278 approaching / 515 receding | +11 dB at closest |

## Continuous beds (call every frame or on change; all are smoothed)
| call | notes |
|---|---|
| `setWind(airspeedKt, { interior })` | body + hiss rise with speed, gusting; muffled inside |
| `setStallHorn(0..1 \| bool)` | C172 reed horn; pitch and level rise with intensity. 0 = off |
| `setRolling(groundSpeedMs, surface, { interior })` | surface = AIRPORT `surfaceAt()` value; runway/taxiway/apron = tyre hum, grass = rustle + bumps, water = silent |
| `setFlapsMotor(bool)` | true while flaps are moving |

## One-shots (optional `{ position }` for other planes, `{ delay }`)
`playTouchdown(intensity 0..1)` (screech + thud; pass sink rate mapped to 0..1), `playGearThump()`,
`playCrash(intensity)`, `playBoing(intensity)` (impossiRubber bounce), `playUI('click'|'confirm'|'back'|'toggle'|'error')`,
`playSquelch('on'|'off')`.

## Radio
```js
const r = await audio.playRadio(urlOrAudioBuffer, {
  speaker: 'pilot'|'tower', voiceId: 'toff', text: 'subtitle text',
  priority: 0,            // higher priority "steps on" the current transmission (heterodyne squeal, current cut)
  interrupt: 'queue',     // optional: higher priority jumps the queue but waits instead of stepping on
  onStart(info), onEnd(info),   // info: { id, speaker, voiceId, text, duration, missing, interrupted?, steppedOn? }
  gain, rate, gap: 250,   // gap = ms of silence before the next queued transmission
});
// r: { ...info, played, interrupted?, steppedOn?, cancelled? }
audio.onRadio('start'|'end', fn)  // same info, for a subtitle component that doesn't own the call
audio.stopRadio(); audio.radioBusy();
audio.preload(urls); audio.loadBuffer(url)   // fetch → decodeAudioData, cached by URL
```
Chain: 2× highpass 300 Hz → presence peak 1.8 kHz → drive + soft clip → 2× lowpass 3400 Hz → compressor, plus a
faint band-passed static bed while transmitting, squelch click before and "kshh" after. Transmissions never overlap.
A missing or undecodable file still produces squelch + static for `duration` (or ~60 ms per character of `text`) and
fires onStart/onEnd with `missing: true`, so subtitles still work while VOICE assets are being generated.

Music: `playMusic(urlOrBuffer, { loop, fade, gain })`, `stopMusic(fade)`.

## How FLIGHT should call it
```js
audio.initAudio(); audio.setVolumes(ui.getSettings());
const eng = audio.createEngineVoice();
// per frame
audio.setListener({ position: cam.position, velocity: playerVel, forward: camForward, up: camUp });
eng.setRPM(fm.rpm, fm.throttle);
eng.setInterior(view === 'cockpit');
eng.update(null, null, plane.position, playerVel);      // chase view; ignored when interior
audio.setWind(fm.iasKt, { interior });
audio.setStallHorn(fm.stallWarning);                     // 0..1, e.g. ramp in from 5 kt above stall
audio.setRolling(onGround ? groundSpeed : 0, world.surfaceAt(x, z), { interior });
audio.setFlapsMotor(flapsMoving);
// events
onTouchdown(sink) => (rubber ? audio.playBoing(k) : audio.playTouchdown(k));
onGearContact => audio.playGearThump();  onCrash(k) => audio.playCrash(k);
// other planes: one voice each; update(null, null, pos, vel) every frame, dispose when despawned
```
Set `setRolling(0, ...)` and `setWind(0)` when paused; or simply `setVolumes({ sfx: 0 })` during the settings popup.

## How RADIO should call it
Own the queue logic above it (who talks when); hand each line to `playRadio(url, { speaker, voiceId, text, priority, onStart, onEnd })`
and drive subtitles from onStart/onEnd. Preload a voice's bark set with `preload([...])` when the voice is picked.
Pilot barks the player taps should use `priority: 1` if they are allowed to step on tower chatter.

## Verification (2026-10-21, CDP 9451, `--use-angle=metal`)
Offline render (2.5 s each, peak / RMS dBFS): engine idle chase −11.6/−24.7, full chase −0.8/−12.4, full cockpit
−1.5/−12.0, 800 m away −31.7/−48.0; wind 140 kt −6.5/−19.1; stall horn −13.3/−16.5; rolling runway −10.3/−22.7,
grass −3.6/−20.2; flaps −26.1/−37.9; touchdown −13/−38; gear −17/−38; crash −3/−22; boing −8/−27; UI −15/−40;
radio voice −4.1/−18.1; everything at once −1.5/−12.4 (limiter). No NaN anywhere. Voice cap: 10 planes → nearest 6 sound.
Live: context `suspended` before touch, `running` after a single emulated touchStart/touchEnd. Radio queue order with a
priority-2 step-on at 400 ms: `s1 e1(steppedOn) s4 e4 s2 e2 s3(missing) e3`.
