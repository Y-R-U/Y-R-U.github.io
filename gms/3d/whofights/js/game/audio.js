// The bridge to `audio/`. It imports the lab's synthesis stack rather than copying any of it, so
// a sound Aaron tunes in the bench is the sound the game plays.

import { createEngine } from '../../audio/js/core.js';
import { fire } from '../../audio/js/sfx.js';
import { SOUNDS, AMBIENCE, VOICE_CAP, BELL_GAP, RANGE, atten } from './sounds.js';

const AC = window.AudioContext || window.webkitAudioContext;
const rnd = (a, b) => a + Math.random() * (b - a);

export class Audio {
  constructor() {
    this.eng = null;
    this.volume = 0.8;
    this.mute = false;
    this.ambient = 1;
    this.beds = new Map();
    this.reapAcc = 0;
    this.listener = { x: 0, z: 0 };
  }

  registerKnobs(q, settings = {}) {
    q.register({ key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.05, default: settings.volume ?? 0.8, group: 'Audio' },
      v => { this.volume = v; if (this.eng) this.eng.master.gain.value = 0.72 * v * (this.mute ? 0 : 1); });
    q.register({ key: 'mute', label: 'Mute', type: 'toggle', default: !!settings.mute, group: 'Audio' },
      v => { this.mute = !!v; if (this.eng) this.eng.master.gain.value = 0.72 * this.volume * (v ? 0 : 1); });
    q.register({ key: 'ambience', label: 'Ambience', type: 'range', min: 0, max: 1, step: 0.05, default: settings.ambience ?? 1, group: 'Audio' },
      v => { this.ambient = v; });
  }

  // iOS will not start a context outside a gesture, and `resume()` alone is not always enough —
  // the silent one-sample buffer is what actually unlocks it. Same trick as audio/js/bench.js.
  unlock() {
    if (this.eng) { this.eng.ctx.resume?.().catch(() => {}); return this.eng; }
    if (!AC) return null;
    const ctx = new AC();
    this.eng = createEngine(ctx);
    this.eng.master.gain.value = 0.72 * this.volume * (this.mute ? 0 : 1);
    ctx.resume?.().catch(() => {});
    const b = ctx.createBufferSource();
    b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    b.connect(ctx.destination);
    b.start(0);
    return this.eng;
  }

  at(x, z) { this.listener = { x, z }; }

  // `at` is a world position; everything else is a param override for the bench sound.
  play(event, { at = null, level = 1, range = RANGE.world, ...over } = {}) {
    const s = SOUNDS[event];
    if (!s || !this.eng || this.mute) return false;
    let k = level;
    if (at) {
      const d = Math.hypot(at.x - this.listener.x, at.z - this.listener.z);
      k *= atten(d, range);
      if (k <= 0.01) return false;
    }
    // Over the cap the quietest thing is the thing not worth hearing, so a footstep loses to a
    // bolt rather than the other way round.
    if (this.eng.activeAt(this.eng.ctx.currentTime) >= VOICE_CAP && k < 0.5) return false;
    const p = { ...s.p, ...over };
    p.level = (p.level ?? 0.6) * k;
    fire(this.eng, s.id, p);
    return true;
  }

  // The Spire strikes the hour: 1–4 strikes, spaced, level falling with distance from Whitewall.
  strikes(n, opts = {}) {
    if (!this.eng) return;
    const t0 = this.eng.ctx.currentTime + 0.02;
    for (let i = 0; i < Math.max(1, n); i++) this.play('bell', { ...opts, t: t0 + i * BELL_GAP });
  }

  ambience(id, on, opts = {}) {
    if (!on) { this.beds.delete(id); return; }
    const def = AMBIENCE[id];
    if (!def) return;
    const cur = this.beds.get(id) || { next: 0 };
    this.beds.set(id, { ...cur, ...opts, def });
  }

  tick(dt, { hour = 12, outdoor = true } = {}) {
    if (!this.eng) return;
    this.reapAcc += dt;
    if (this.reapAcc > 1) { this.reapAcc = 0; this.eng.reap(); }
    if (this.mute || this.ambient <= 0) return;
    for (const [id, bed] of this.beds) {
      const d = bed.def;
      if (d.hours && (hour < d.hours[0] || hour >= d.hours[1])) continue;
      if (d.outdoor && !outdoor) continue;
      bed.next -= dt;
      if (bed.next > 0) continue;
      bed.next = rnd(d.every[0], d.every[1]);
      const p = { ...d.p };
      p.level = (p.level ?? 0.4) * this.ambient * (bed.level ?? 1);
      if (p.level > 0.01) fire(this.eng, d.id, p);
    }
  }
}
