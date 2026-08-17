// §10.1 synthesised sounds, §10.2 the radio bus, and the one persistent Web Audio graph the whole
// game hangs off. No files are loaded here — `radio.js` owns everything that touches the network.
//
// ── Three hard rules this file exists to enforce ────────────────────────────
//
// 1. **Nothing is created before a user gesture.** The constructor allocates no AudioContext, no
//    nodes, no timers. `unlock()` is the only thing that builds the graph, and it is only ever
//    called from a real gesture handler (or from `attach()` with a context main.js already made
//    inside one). A game that constructs an AudioContext at module scope gets a permanently
//    `suspended` context on iOS and no sound for the whole session.
//
// 2. **No `play()` is ever speculative.** Every promise that can reject — `ctx.resume()`, and
//    `HTMLMediaElement.play()` over in radio.js — is caught at the call site. An unhandled
//    rejection in the audio layer has killed a frame loop on this repo before.
//
// 3. **Absence and silence are the same failure.** `rms()` lives here, and radio.js runs it over
//    every decoded clip. This project has already shipped a silent audio clip that a
//    "file exists, decodes, non-zero length" check passed — that check is now impossible to pass
//    on silence, because the number it reads is decoded sample energy.
//
// The whole file is constructed against any `BaseAudioContext`, which is what makes it testable:
// `tools/gates_p8.mjs` builds the radio bus inside an `OfflineAudioContext`, renders it, and
// measures the band limiting as a spectrum rather than as an impression.

// ── constants (§10.1, §10.2) ───────────────────────────────────────────────

export const BUS = {
  // §10.2 says "bandpass(300–3400 Hz, Q 0.7)". A single biquad bandpass cannot BE a 300–3400 band:
  // its Q is centre/width, so 300–3400 is Q ≈ 0.33 and Q 0.7 is a ~1.4 kHz-wide band around
  // 1010 Hz. The stated corner frequencies are the intent (they are the telephone band), so this is
  // a highpass/lowpass pair at exactly those corners — which delivers the band the plan names and
  // is what the gate measures.
  HP: 300,
  LP: 3400,
  SHAPE_K: 2.5,          // §10.2 waveshaper, mild
  COMP: { threshold: -18, ratio: 4, knee: 6, attack: 0.004, release: 0.18 },
  SQUELCH_MS: 12,        // §10.2 squelch gate — a noise burst at start and end
};

export const MIX = {
  MASTER: 0.9,
  SFX: 1.0,
  MUSIC: 1.0,
  RADIO: 1.0,
  NET: 0.10,             // §10.1 the traffic net bed's own gain
  NET_DUCK: 0.04,        // §10.1 ducked under any real chatter
  MUSIC_DUCK: 0.35,      // §10.2 ducking
  NET_DUCK_MUL: 0.4,     // §10.2 states the net duck as a multiplier too; NET_DUCK is the absolute
  DUCK_FADE: 0.6,        // §10.2 restored over 0.6 s
};

// Any clip whose decoded RMS is below this is treated as ABSENT, not as quiet. Measured against the
// real asset set: the 31 shipped clips run RMS 0.10–0.46 (mean −18.5 dB to −6.9 dB). Digital
// silence is 0.0 and an mp3 encode of silence lands around 1e-5. 0.005 is −46 dB — two decades
// below the quietest real clip and two decades above encoder noise.
export const MIN_RMS = 0.005;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── the silence check (the standing lesson, as code) ────────────────────────
// Root-mean-square over the decoded samples of every channel. Not duration, not byteLength, not
// "did decodeAudioData resolve" — all three of those pass on silence.
export function rms(buffer, maxSeconds = 30) {
  if (!buffer || !buffer.numberOfChannels || !buffer.length) return 0;
  const n = Math.min(buffer.length, Math.floor((buffer.sampleRate || 48000) * maxSeconds));
  if (!n) return 0;
  let sum = 0, count = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    // Stride on long buffers: a 4-minute stereo track is 20 M samples and we only need the
    // statistic. Every 7th sample keeps the estimate within ~0.1 % and is not aligned to any
    // musical period.
    const step = n > 400000 ? 7 : 1;
    for (let i = 0; i < n; i += step) { const v = d[i]; sum += v * v; count++; }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

export const dbfs = r => (r > 0 ? 20 * Math.log10(r) : -Infinity);

// ── noise buffers ──────────────────────────────────────────────────────────

// Voss-ish pink noise. One 3 s buffer, looped — cheaper than a ScriptProcessor and there is no
// AudioWorklet file to ship.
export function pinkBuffer(ctx, seconds = 3) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

export function whiteBuffer(ctx, seconds = 1) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// tanh-ish soft clip for the §10.2 waveshaper.
function shaperCurve(k = BUS.SHAPE_K, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

// ── §10.2 the radio bus ────────────────────────────────────────────────────
// Built as a free function against any BaseAudioContext so an OfflineAudioContext can render it
// and a gate can measure the band limiting. SUNO returns clean, well-produced audio; clean audio
// does not sound like a radio, and this is the fifteen nodes that fix that for anything Aaron
// generates without him having to get it right in the prompt.
export function buildRadioBus(ctx, { gain = MIX.RADIO } = {}) {
  const input = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = BUS.HP; hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = BUS.LP; lp.Q.value = 0.7;
  const shaper = ctx.createWaveShaper();
  shaper.curve = shaperCurve();
  shaper.oversample = '2x';
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = BUS.COMP.threshold;
  comp.ratio.value = BUS.COMP.ratio;
  comp.knee.value = BUS.COMP.knee;
  comp.attack.value = BUS.COMP.attack;
  comp.release.value = BUS.COMP.release;
  const out = ctx.createGain();
  out.gain.value = gain;

  input.connect(hp); hp.connect(lp); lp.connect(shaper); shaper.connect(comp); comp.connect(out);

  // The squelch gate. A 12 ms filtered noise burst at the start and end of a transmission — this
  // is the single cheapest thing that makes a clean voice file read as a two-way radio.
  const noise = whiteBuffer(ctx, 0.25);
  function squelch(when = ctx.currentTime, level = 0.25) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.4;
    const g = ctx.createGain();
    const t = Math.max(when, ctx.currentTime);
    const ms = BUS.SQUELCH_MS / 1000;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + ms * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms);
    src.connect(bp); bp.connect(g); g.connect(input);
    src.start(t); src.stop(t + ms + 0.02);
  }

  return { input, output: out, squelch, nodes: { hp, lp, shaper, comp } };
}

// ── the graph ──────────────────────────────────────────────────────────────

export class GameAudio {
  // `opts.settings` is a getter returning `{ music, sfx, radio }` from save.js — injected, never
  // imported, so the harness can drive it without a localStorage profile.
  constructor(opts = {}) {
    this.settings = opts.settings || (() => ({ music: true, sfx: true, radio: true }));
    this.onError = opts.onError || (() => {});
    this.ctx = null;
    this.ready = false;         // graph built AND context running
    this.unlockTries = 0;
    this.blocked = false;       // a resume() we asked for came back rejected or stayed suspended
    this.gestureBound = false;
    this._duck = 0;
    this._duckUntil = 0;
    this._netNext = 0;
    this._sirenNext = 0;
    this._t = 0;
    this._counts = { oneShots: 0, clips: 0, squelch: 0, netClicks: 0 };
    this._boundHandler = null;
  }

  // ── unlock (§2.8 item 1, and mobile autoplay reality) ────────────────────

  // main.js already creates a context inside its own gesture handler and hangs it on Game.actx.
  // Adopting it is strictly better than making a second one: iOS counts contexts against a small
  // per-page budget and a second suspended context is a second thing that can be stuck.
  attach(ctx) {
    if (!ctx) return false;
    if (this.ctx && this.ctx !== ctx) return false;
    this.ctx = ctx;
    this._build();
    this._resume();
    return true;
  }

  // Safe to call from any gesture, any number of times. Never throws, never leaves a floating
  // rejected promise.
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC({ latencyHint: 'interactive' });
      }
      this._build();
      this._resume();
      return true;
    } catch (e) {
      this.onError('audio-unlock', e && e.message);
      this.blocked = true;
      return false;
    }
  }

  _resume() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.unlockTries++;
    if (ctx.state === 'running') { this.ready = true; this.blocked = false; return; }
    // `resume()` returns a promise on every engine that matters and rejects when there is no
    // activation. Catch it: an unhandled rejection here is exactly the trap obligation T8 names on
    // the video side.
    try {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') {
        p.then(() => { this.ready = ctx.state === 'running'; this.blocked = !this.ready; },
          e => { this.blocked = true; this.onError('audio-resume', e && e.message); });
      } else {
        this.ready = ctx.state === 'running';
      }
    } catch (e) {
      this.blocked = true;
      this.onError('audio-resume', e && e.message);
    }
  }

  // Installs its own gesture listeners. main.js has its own (and should call `attach`/`unlock` from
  // them — see docs/P8_WIRING.md), but this module must not be *dependent* on that wiring being
  // right: a silent game is a silent game whoever forgot the hook. Duplicate unlocks are free.
  //
  // `touchend` matters as much as `touchstart`: iOS Safari has historically counted only some touch
  // events as an activation, and `click` never fires at all if the player's first interaction is a
  // drag on the flight stick — which, given §6.1's two-thumb scheme, it always is.
  installGestureHooks(target = (typeof window !== 'undefined' ? window : null)) {
    if (!target || this.gestureBound) return false;
    this.gestureBound = true;
    const h = () => {
      this.unlock();
      // Keep listening until the context is genuinely running. A first gesture that lands while the
      // page is still backgrounded resolves to `suspended`, and one-shot listeners would give up.
      if (this.ready) this._unbind(target);
    };
    this._boundHandler = h;
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click']) {
      target.addEventListener(ev, h, { passive: true, capture: true });
    }
    return true;
  }

  _unbind(target) {
    if (!this._boundHandler) return;
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click']) {
      target.removeEventListener(ev, this._boundHandler, { capture: true });
    }
    this._boundHandler = null;
  }

  _build() {
    const ctx = this.ctx;
    if (!ctx || this.master) return;

    this.master = ctx.createGain();
    this.master.gain.value = MIX.MASTER;
    this.master.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = MIX.SFX;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = MIX.MUSIC;
    this.music.connect(this.master);

    this.bus = buildRadioBus(ctx, { gain: MIX.RADIO });
    this.bus.output.connect(this.master);

    this.pink = pinkBuffer(ctx, 3);
    this.white = whiteBuffer(ctx, 0.5);

    this._buildThruster();
    this._buildNet();
    this._buildWeather();
    this._buildProximity();

    this.applySettings();
  }

  // ── §10.1 the traffic net bed — the reason the city is never dead ────────
  _buildNet() {
    const ctx = this.ctx;
    const net = ctx.createGain();
    net.gain.value = 0;                     // ramps in on the first update
    net.connect(this.bus.input);
    this.net = net;
    this.netVoices = [];

    // A low male/female-ish formant pair. Two sawtooths at speech-fundamental pitches, each through
    // two bandpass formants. Ten minutes of this must never resolve into a word: there is no
    // articulation model, only a slow random envelope, so it cannot.
    for (const v of [{ f: 108, f1: 520, f2: 1180 }, { f: 187, f1: 720, f2: 2150 }]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = v.f;
      const b1 = ctx.createBiquadFilter();
      b1.type = 'bandpass'; b1.frequency.value = v.f1; b1.Q.value = 6;
      const b2 = ctx.createBiquadFilter();
      b2.type = 'bandpass'; b2.frequency.value = v.f2; b2.Q.value = 8;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(b1); osc.connect(b2);
      b1.connect(g); b2.connect(g);
      g.connect(net);
      osc.start();
      this.netVoices.push({ osc, g, base: v.f, next: 0 });
    }

    // room tone under the voices
    const room = ctx.createBufferSource();
    room.buffer = this.pink; room.loop = true;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass'; rlp.frequency.value = 1800;
    const rg = ctx.createGain(); rg.gain.value = 0.10;
    room.connect(rlp); rlp.connect(rg); rg.connect(net);
    room.start();
    this.netRoom = rg;
  }

  // ── §10.1 thruster / boost ──────────────────────────────────────────────
  _buildThruster() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.sfx);
    this.thrGain = g;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.9;
    lp.connect(g);
    this.thrLP = lp;

    this.thrOscs = [];
    for (const f of [110, 113]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start();
      this.thrOscs.push(o);
    }
    // §10.1 boost: "the above plus a third saw an octave up". It is always running at zero gain —
    // starting an oscillator on a button press costs a node allocation on the frame the player is
    // already asking for acceleration.
    const oct = ctx.createOscillator();
    oct.type = 'sawtooth'; oct.frequency.value = 226;
    const octG = ctx.createGain(); octG.gain.value = 0;
    oct.connect(octG); octG.connect(lp); oct.start();
    this.boostOsc = oct; this.boostGain = octG;

    // air: pink noise → bandpass 900
    const air = ctx.createBufferSource();
    air.buffer = this.pink; air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const ag = ctx.createGain(); ag.gain.value = 0;
    air.connect(bp); bp.connect(ag); ag.connect(this.sfx);
    air.start();
    this.airGain = ag;
  }

  // ── §10.1 rain / wind ───────────────────────────────────────────────────
  _buildWeather() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.pink; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(this.sfx);
    src.start();
    this.rainGain = g; this.rainLP = lp;
  }

  // ── §10.1 zone proximity ────────────────────────────────────────────────
  _buildProximity() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 220;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 1;
    const lfoG = ctx.createGain(); lfoG.gain.value = 1;
    const g = ctx.createGain(); g.gain.value = 0;
    // the LFO modulates the gain around zero, so it pulses rather than tremolos over a floor
    lfo.connect(lfoG); lfoG.connect(g.gain);
    osc.connect(g); g.connect(this.sfx);
    osc.start(); lfo.start();
    this.zoneOsc = osc; this.zoneLFO = lfo; this.zoneGain = g; this.zoneDepth = lfoG;
  }

  // ── settings ────────────────────────────────────────────────────────────
  applySettings() {
    if (!this.master) return;
    const s = this.settings() || {};
    this.sfx.gain.value = s.sfx === false ? 0 : MIX.SFX;
    this.music.gain.value = s.music === false ? 0 : MIX.MUSIC;
    this.bus.output.gain.value = s.radio === false ? 0 : MIX.RADIO;
    return true;
  }

  // ── per-frame (§10.1's speed-tracking parameters) ────────────────────────
  // Cheap and total no-op before unlock. That is load-bearing: the game runs at full frame rate
  // with audio disabled or never unlocked, and this function is why.
  update(dt, s = {}) {
    if (!this.ready || !this.master) return false;
    const ctx = this.ctx, now = ctx.currentTime;
    this._t += dt;

    const k = clamp(s.speed || 0, 0, 1);           // 0..1 normalised speed
    const thrust = clamp(s.thrust || 0, 0, 1);     // 0..1 how hard the player is asking
    const boost = s.boost ? 1 : 0;

    // §10.1: cutoff 300 → 2600 Hz and gain track speed
    this.thrLP.frequency.setTargetAtTime(300 + 2300 * k, now, 0.08);
    this.thrGain.gain.setTargetAtTime(0.02 + 0.16 * Math.max(k, thrust * 0.7), now, 0.09);
    this.airGain.gain.setTargetAtTime(0.008 + 0.055 * k, now, 0.12);
    this.boostGain.gain.setTargetAtTime(boost ? 0.075 : 0, now, boost ? 0.05 : 0.15);

    // §10.1 rain / wind: gain ∝ rain + 0.006 · speed(m/s)
    const rain = clamp(s.rain || 0, 0, 1);
    this.rainGain.gain.setTargetAtTime(clamp(0.16 * rain + 0.006 * (s.speedMs || 0) / 10, 0, 0.28), now, 0.4);
    this.rainLP.frequency.setTargetAtTime(900 + 2600 * rain, now, 0.5);

    // §10.1 zone proximity: 220 Hz sine pulsing at 1 + 3·(1 − d/R) Hz, gain 0.05
    const zp = s.zone && s.zone.r > 0 ? clamp(1 - s.zone.d / s.zone.r, 0, 1) : 0;
    this.zoneLFO.frequency.setTargetAtTime(1 + 3 * zp, now, 0.15);
    this.zoneGain.gain.setTargetAtTime(0, now, 0.2);      // the LFO supplies the level
    this.zoneDepth.gain.setTargetAtTime(zp > 0.02 ? 0.05 * zp : 0, now, 0.2);

    // §10.1 the net bed: a slow random envelope per voice, plus squelch clicks at 4–14 s
    const ducked = this._t < this._duckUntil;
    const target = (this.settings().radio === false) ? 0 : (ducked ? MIX.NET_DUCK : MIX.NET);
    this.net.gain.setTargetAtTime(target, now, 0.5);
    for (const v of this.netVoices) {
      if (this._t >= v.next) {
        v.next = this._t + 0.9 + Math.random() * 2.6;
        const on = Math.random() < 0.55;
        v.g.gain.setTargetAtTime(on ? 0.05 + Math.random() * 0.09 : 0.0, now, 0.35);
        v.osc.frequency.setTargetAtTime(v.base * (0.9 + Math.random() * 0.25), now, 0.5);
      }
    }
    if (this._t >= this._netNext) {
      this._netNext = this._t + 4 + Math.random() * 10;
      this.bus.squelch(now, 0.18);
      this._counts.netClicks++;
    }
    // occasional distant siren fragment in the bed
    if (this._t >= this._sirenNext) {
      this._sirenNext = this._t + 40 + Math.random() * 80;
      this.sirenFragment(0.5 + Math.random() * 0.8);
    }

    // §10.2 ducking, restored over DUCK_FADE
    const mTarget = (this.settings().music === false) ? 0 : (ducked ? MIX.MUSIC * MIX.MUSIC_DUCK : MIX.MUSIC);
    this.music.gain.setTargetAtTime(mTarget, now, MIX.DUCK_FADE / 3);
    return true;
  }

  // Called by radio.js for the length of a foreground line. Absolute seconds, not a toggle, so two
  // overlapping lines cannot leave the mix ducked forever.
  duckFor(seconds) {
    this._duckUntil = Math.max(this._duckUntil, this._t + Math.max(0.2, seconds || 0));
    return this._duckUntil - this._t;
  }
  get ducked() { return this._t < this._duckUntil; }

  // ── §10.1 one-shots ─────────────────────────────────────────────────────

  _blip(freq, when, dur, { type = 'sine', peak = 0.2, dest = null } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(when); o.stop(when + dur + 0.02);
    return g;
  }

  _noiseBurst(when, dur, { freq = 1800, Q = 3, peak = 0.25, type = 'bandpass', dest = null } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + Math.min(0.008, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(when); src.stop(when + dur + 0.02);
    return g;
  }

  // §10.1 dock lock: 3 descending sines (880/660/440) at 90 ms each + a 4 ms click
  dockLock() {
    if (!this.ready) return false;
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.004, { freq: 4000, Q: 1, peak: 0.18 });
    [880, 660, 440].forEach((f, i) => this._blip(f, t + 0.01 + i * 0.09, 0.09, { peak: 0.22 }));
    this._counts.oneShots++;
    return true;
  }

  // §10.1 payment: two-note major stab (660 → 990) with a 0.4 s exponential tail
  payment() {
    if (!this.ready) return false;
    const t = this.ctx.currentTime;
    this._blip(660, t, 0.4, { type: 'triangle', peak: 0.20 });
    this._blip(990, t + 0.1, 0.4, { type: 'triangle', peak: 0.17 });
    this._counts.oneShots++;
    return true;
  }

  // §10.1 scrape: filtered noise burst (bandpass 1.8 kHz, Q 3) + a 60 Hz thunk, gain ∝ impact speed
  scrape(impact = 0.5) {
    if (!this.ready) return false;
    const k = clamp(impact, 0, 1);
    const t = this.ctx.currentTime;
    this._noiseBurst(t, 0.14 + 0.1 * k, { freq: 1800, Q: 3, peak: 0.06 + 0.28 * k });
    this._blip(60, t, 0.18, { type: 'sine', peak: 0.10 + 0.30 * k });
    this._counts.oneShots++;
    return true;
  }

  // §10.1 UI: 8 ms filtered clicks at three pitches
  click(pitch = 1) {
    if (!this.ready) return false;
    const f = [1600, 2400, 3200][clamp(pitch | 0, 0, 2)];
    this._noiseBurst(this.ctx.currentTime, 0.008, { freq: f, Q: 6, peak: 0.14 });
    this._counts.oneShots++;
    return true;
  }

  // §10.1 siren: two-tone square with a 0.7 Hz LFO on frequency. Diegetic flavour only — decision 6
  // means nothing is ever chasing the player, so this is a passing police craft and nothing else.
  sirenFragment(seconds = 1.2, level = 0.05) {
    if (!this.ready) return false;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 720;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.7;
    const lg = ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    // through the bus, so it sits behind the same band limit as the rest of the radio
    o.connect(g); g.connect(this.bus.input);
    o.start(t); lfo.start(t);
    o.stop(t + seconds + 0.05); lfo.stop(t + seconds + 0.05);
    this._counts.oneShots++;
    return true;
  }

  // §10.1 lightning: a filtered noise crack with a ~1.2 s feedback-delay decay, delayed by distance
  lightning(distanceM = 300) {
    if (!this.ready) return false;
    const ctx = this.ctx;
    const t = ctx.currentTime + clamp(distanceM / 340, 0, 4);
    const dl = ctx.createDelay(0.4);
    dl.delayTime.value = 0.11;
    const fb = ctx.createGain(); fb.gain.value = 0.62;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 1200;
    dl.connect(damp); damp.connect(fb); fb.connect(dl);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    dl.connect(wet); wet.connect(this.sfx);
    const g = this._noiseBurst(t, 0.35, { freq: 420, Q: 0.7, peak: 0.34, type: 'lowpass' });
    g.connect(dl);
    // the feedback loop must be torn down or it rings for the rest of the session
    setTimeout(() => { try { fb.gain.value = 0; fb.disconnect(); dl.disconnect(); wet.disconnect(); } catch {} },
      (t - ctx.currentTime + 2.4) * 1000);
    this._counts.oneShots++;
    return true;
  }

  // ── playback of a decoded clip through the radio bus ─────────────────────
  // radio.js owns fetching and caching; this owns the graph end. A silent buffer is refused HERE
  // as well as at load time — two independent places, because "it decoded" has been mistaken for
  // "it has audio in it" on this project before.
  playClip(buffer, { gain = 0.9, squelch = true, bus = 'radio' } = {}) {
    if (!this.ready || !buffer) return null;
    const energy = rms(buffer, 4);
    if (energy < MIN_RMS) { this.onError('audio-silent-clip', `rms ${energy.toExponential(2)}`); return null; }
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(bus === 'radio' ? this.bus.input : this.sfx);
    if (squelch && bus === 'radio') {
      this.bus.squelch(t, 0.22);
      this.bus.squelch(t + buffer.duration, 0.16);
      this._counts.squelch += 2;
    }
    src.start(t);
    this._counts.clips++;
    return { src, gain: g, duration: buffer.duration, rms: energy };
  }

  // The destination a streamed music element connects into.
  get musicBus() { return this.music; }
  // Diegetic pirate radio goes through the band limit instead (§10.3 rule 4 / M9's 0.30 gain).
  get diegeticBus() { return this.bus ? this.bus.input : null; }

  suspend() { try { this.ctx && this.ctx.suspend(); } catch {} }
  resume() { this._resume(); }

  state() {
    return {
      ctx: this.ctx ? this.ctx.state : null,
      ready: this.ready,
      blocked: this.blocked,
      unlockTries: this.unlockTries,
      gestureBound: this.gestureBound,
      nodes: this.master ? true : false,
      ducked: this.ducked,
      net: this.net ? +this.net.gain.value.toFixed(4) : 0,
      musicGain: this.music ? +this.music.gain.value.toFixed(4) : 0,
      radioGain: this.bus ? +this.bus.output.gain.value.toFixed(4) : 0,
      counts: { ...this._counts },
      sampleRate: this.ctx ? this.ctx.sampleRate : 0,
    };
  }
}
