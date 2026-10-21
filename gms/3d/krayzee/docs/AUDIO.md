# AUDIO lane

Files: `js/audio/index.js` (engine, buses, unlock, radio chain), `js/audio/synth.js` (procedural buffers),
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
