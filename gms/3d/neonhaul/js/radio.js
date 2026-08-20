// §10.3 the SUNO slot manifest, §10.4 the chatter director, and the music state machine.
//
// ── What this file is for ───────────────────────────────────────────────────
//
// `audio.js` is the graph. This is everything that touches the network, and therefore everything
// that can be slow, missing, silent, or blocked by an autoplay policy. Three requirements shape it:
//
// **1. ~12 MB of music must not be on the critical path.** It isn't, and the mechanism is not a
// promise about ordering — it is that no music byte has a reason to be requested. Music is streamed
// through `HTMLMediaElement` with `preload="none"` and a `src` that is assigned only at the moment a
// pool is actually started, which cannot happen before a gesture has unlocked the context. Music is
// also the ONE thing here that must not be `decodeAudioData`'d: a 4-minute stereo track decodes to
// ~76 MB of Float32 and five of them would be ~380 MB of resident memory on a phone.
//
// **2. Every slot behaves correctly with zero files present.** An absent or SILENT foreground clip
// still fires as a text-only popup using the manifest's `text` (§10.3 rule 2), which is why the
// director keeps absent foreground slots in its bags and only the *audio* drops out. Absent music
// falls back down the pool chain and finally to `audio.js`'s synthesised traffic-net bed. Deleting
// `assets/audio/` entirely changes nothing about whether the game runs.
//
// **3. A silent clip is an absent clip.** Every decoded buffer is measured with `rms()` and a clip
// below `MIN_RMS` is marked absent. This project has already shipped a silent clip that a
// "file exists / decodes / has duration" check passed. Bytes and seconds are not evidence of audio.
//
// The two pieces with real logic in them — `ShuffleBag` and `ChatterDirector` — take no DOM, no
// AudioContext and no network. They are plain objects with an injected RNG and an injected clock, so
// §13's "a 25-minute virtual-clock run of the director draws no foreground line twice" is a pure
// node test that runs in milliseconds and is deterministic per seed.

import { rms, MIN_RMS } from './audio.js';

// ── config (§10.3 / §10.4) ─────────────────────────────────────────────────

export const DIR = {
  FORE_MIN: 22, FORE_MAX: 50,        // §10.4 "a foreground line every 22–50 s, jittered (mean 36)"
  BACK_MIN: 8, BACK_MAX: 20,         // §10.4 background lines run on their own 8–20 s timer
  TOAST_SUPPRESS: 4.0,               // §10.4 suppressed for 4 s after any toast
  // §10.4's context weights. Everything is always possible at ×1.
  WEIGHTS: {
    dispatch: { nearHub: 3 },
    police: { patrolNear: 2 },
    distress: { district: ['drownings', 'sootfields'], mul: 2 },
    ad: { district: ['lantern'], mul: 2 },
    weather: { variantChange: 3 },
    pirate: { night: 1.5 },
    life: { commercial: 1.5 },
  },
  // The ambient groups the director draws from. `dispatch_confirm` / `dispatch_pay` are NOT here —
  // §10.4 gives them dedicated event pools driven by the job loop.
  AMBIENT: ['dispatch', 'police', 'pirate', 'ad', 'distress', 'weather', 'life'],
};

// §10.3 rule 4's state machine, as a precedence list. First pool with a playable slot wins.
export const MUSIC_CHAIN = {
  menu: ['menu'],
  intro: ['intro', 'cruise'],
  docked: ['docked', 'cruise'],
  rush: ['rush', 'cruise'],
  storm: ['storm', 'cruise'],
  cruise_day: ['cruise_day', 'cruise'],
  cruise: ['cruise'],
  diegetic: ['diegetic', 'cruise'],
};

export const PREFETCH = {
  PROBE_DELAY: 1.0,    // seconds after the game is ready before the first HEAD probe goes out
  DELAY: 1.5,          // seconds after the game is ready before a single chatter byte is requested
  CONCURRENCY: 2,
  // S2-B took the pool from 26 clips (896 KB) to 203 (2.29 MB measured, 11.3 KB mean) by encoding
  // at 16 kbps mono 16 kHz behind a 300–3400 Hz band-limit. The ceiling is set above the whole set
  // on purpose: a foreground line whose clip has not arrived still SPEAKS, but it speaks as text
  // only, and a pool this size would leave most lines silent on their first play if the cap cut the
  // queue off. It is a ceiling on a trickle, not a burst — CONCURRENCY is 2 and nothing starts
  // until DELAY seconds after the game is playable. `navigator.connection.saveData` still skips it
  // entirely.
  MAX_BYTES: 2.6e6,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// A seeded RNG, so the director's long-run behaviour is reproducible and a gate can assert it
// rather than sample it. `Math.random` is the default in the game.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── §10.4 the shuffle bag ──────────────────────────────────────────────────
//
// Drawn without replacement; refilled and reshuffled when empty. §10.4 adds one rule — "the line
// that was drawn last is moved into the second half of the new bag so a bag boundary can never play
// the same line twice in a row" — and that rule is not strong enough to support the arithmetic §10.4
// then does with it. Holding back only the single last line still permits the SECOND-to-last line of
// one bag to be the first of the next: for a 5-line group drawn every ~252 s that is a repeat after
// ~8 minutes, not the 21 minutes §10.4 claims. (§10.4's 21 minutes is the length of one full bag
// cycle, i.e. the MEAN repeat interval; it is not a floor.)
//
// So this holds back the last `floor(n/2)` drawn lines from the first `floor(n/2)` positions of the
// new bag, which puts a floor of `floor(n/2)+1` draws between any two occurrences of a line. The
// per-slot `cooldown` from the manifest is enforced on top as a hard time floor. The measured
// numbers for both are in `tools/gates_p8.mjs`; they are reported, not claimed.
export class ShuffleBag {
  constructor(items, rng = Math.random) {
    this.all = items.slice();
    this.rng = rng;
    this.bag = [];
    this.recent = [];            // most-recent-first, capped at holdBack()
    this.cycles = 0;
    this._refill();
  }

  holdBack() { return Math.floor(this.all.length / 2); }

  _shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  _refill() {
    const k = this.holdBack();
    const next = this._shuffle(this.all.slice());
    // Push every recently-drawn line out of the first k positions. A single pass of swaps is enough
    // and terminates: there are at most k held-back lines and at least k free slots behind them.
    if (k > 0 && this.recent.length) {
      const held = new Set(this.recent.slice(0, k));
      for (let i = 0; i < Math.min(k, next.length); i++) {
        if (!held.has(next[i])) continue;
        let j = -1;
        for (let s = k; s < next.length; s++) if (!held.has(next[s])) { j = s; break; }
        if (j < 0) break;
        const t = next[i]; next[i] = next[j]; next[j] = t;
      }
    }
    this.bag = next;
    this.cycles++;
  }

  // `eligible` lets the caller veto a draw (a slot inside its cooldown). A vetoed line is rotated to
  // the BACK of the bag rather than consumed, so a cooldown defers a line instead of skipping it and
  // the bag still empties exactly once per cycle.
  //
  // If every line in the bag is vetoed, this returns null and the caller fires NOTHING this tick.
  // That is deliberate: an occasional quiet slot is a better outcome than a repeat inside the
  // cooldown, and it is what makes the cooldown a floor rather than a preference.
  draw(eligible = null) {
    if (!this.all.length) return null;
    const take = () => {
      const held = [];
      let picked = null;
      const n = this.bag.length;
      for (let i = 0; i < n; i++) {
        const item = this.bag.shift();
        if (eligible && !eligible(item)) { held.push(item); continue; }
        picked = item; break;
      }
      // Push the vetoed lines back only if the bag was not refilled underneath us — a refill
      // rebuilds from `all` and pushing held items on top would duplicate them.
      for (const h of held) this.bag.push(h);
      return picked;
    };
    if (!this.bag.length) this._refill();
    let picked = take();
    if (picked === null) { this._refill(); picked = take(); }
    if (picked === null) return null;
    this.recent.unshift(picked);
    if (this.recent.length > Math.max(1, this.holdBack())) this.recent.length = Math.max(1, this.holdBack());
    return picked;
  }

  state() { return { n: this.all.length, left: this.bag.length, cycles: this.cycles, holdBack: this.holdBack() }; }
}

// ── §10.4 the chatter director ─────────────────────────────────────────────
//
// No DOM, no audio, no network. `tick(t, ctx)` is called with a monotonic time in seconds and
// returns `null` or the slot to fire. That is the whole interface, which is what makes the long-run
// claims testable without a browser.
export class ChatterDirector {
  constructor({ slots, rng = Math.random, weights = DIR.WEIGHTS } = {}) {
    this.rng = rng;
    this.weights = weights;
    this.slots = new Map();
    this.groups = new Map();          // group -> { bag, layer }
    this.lastPlayed = new Map();      // slot id -> t
    this.history = [];                // { slot, t } in order, for the gates and for state()
    this.nextFore = 0;
    this.nextBack = 0;
    this.fired = { fore: 0, back: 0, event: 0 };
    this.suppressedUntil = 0;
    this.started = false;

    for (const s of slots || []) {
      this.slots.set(s.slot, s);
      const g = s.group || (s.tags && s.tags[0]) || 'misc';
      if (!this.groups.has(g)) this.groups.set(g, { layer: s.layer, ids: [] });
      this.groups.get(g).ids.push(s.slot);
    }
    for (const [, g] of this.groups) g.bag = new ShuffleBag(g.ids, this.rng);
  }

  // §10.3 rule 2 in one place: absence removes a slot from the AUDIO path, never from a foreground
  // bag — a foreground line with no file is still a line the city says. A BACKGROUND line with no
  // file is nothing at all (it never shows text), so it is removed.
  setAbsent(slotId, absent = true) {
    const s = this.slots.get(slotId);
    if (!s) return false;
    s.absent = !!absent;
    if (s.layer === 'back') this._rebuildBack();
    return true;
  }

  _rebuildBack() {
    for (const [gid, g] of this.groups) {
      if (g.layer !== 'back') continue;
      const live = g.ids.filter(id => !this.slots.get(id).absent);
      g.bag = new ShuffleBag(live.length ? live : [], this.rng);
      g.empty = live.length === 0;
      void gid;
    }
  }

  jitter(min, max) { return min + this.rng() * (max - min); }

  start(t = 0) {
    this.started = true;
    this.nextFore = t + this.jitter(DIR.FORE_MIN, DIR.FORE_MAX);
    this.nextBack = t + this.jitter(DIR.BACK_MIN, DIR.BACK_MAX);
    return this;
  }

  suppress(t, seconds) { this.suppressedUntil = Math.max(this.suppressedUntil, t + seconds); }

  // §10.4's context weights. `ctx` carries whatever the caller knows; every unknown field is simply
  // ×1, so a caller that knows nothing still gets a correctly-shaped ambient mix.
  weightFor(group, ctx = {}) {
    let w = 1;
    const c = this.weights[group];
    if (!c) return w;
    if (c.nearHub && ctx.nearHub) w *= c.nearHub;
    if (c.patrolNear && ctx.patrolNear) w *= c.patrolNear;
    if (c.district && ctx.district && c.district.includes(ctx.district)) w *= c.mul;
    if (c.variantChange && ctx.variantChange) w *= c.variantChange;
    if (c.night && ctx.night) w *= c.night;
    if (c.commercial && ctx.commercial) w *= c.commercial;
    return w;
  }

  _pickGroup(candidates, ctx) {
    const ws = candidates.map(g => this.weightFor(g, ctx));
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = this.rng() * total;
    for (let i = 0; i < candidates.length; i++) { r -= ws[i]; if (r <= 0) return candidates[i]; }
    return candidates[candidates.length - 1];
  }

  _eligible(t) {
    return id => {
      const s = this.slots.get(id);
      if (!s) return false;
      const last = this.lastPlayed.get(id);
      if (last === undefined) return true;
      return (t - last) >= (s.cooldown || 0);
    };
  }

  // Returns the slot record to fire, or null. `ctx` is §10.4's context: { nearHub, patrolNear,
  // district, variantChange, night, commercial, docked, toastAt }.
  tick(t, ctx = {}) {
    if (!this.started) this.start(t);
    const out = [];

    // §10.4: suppressed while the docking panel is open and for 4 s after any toast.
    const blocked = !!ctx.docked || t < this.suppressedUntil;

    if (t >= this.nextFore) {
      this.nextFore = t + this.jitter(DIR.FORE_MIN, DIR.FORE_MAX);
      if (!blocked) {
        const groups = DIR.AMBIENT.filter(g => this.groups.has(g) && this.groups.get(g).ids.length);
        const g = this._pickGroup(groups, ctx);
        if (g) {
          const id = this.groups.get(g).bag.draw(this._eligible(t));
          if (id) out.push(this._commit(id, t, 'fore'));
        }
      }
    }

    if (t >= this.nextBack) {
      this.nextBack = t + this.jitter(DIR.BACK_MIN, DIR.BACK_MAX);
      const backGroups = [...this.groups.entries()]
        .filter(([, g]) => g.layer === 'back' && g.bag && g.bag.all.length)
        .filter(([gid]) => gid !== 'bg_dock' || !!ctx.docked)   // bg_dock plays only while docked
        .map(([gid]) => gid);
      if (backGroups.length) {
        const gid = backGroups[Math.floor(this.rng() * backGroups.length)];
        const id = this.groups.get(gid).bag.draw();
        if (id) out.push(this._commit(id, t, 'back'));
      }
    }

    return out;
  }

  // §10.4's dedicated event pools. `kind` is a group id: 'dispatch_confirm' | 'dispatch_pay'.
  event(kind, t) {
    const g = this.groups.get(kind);
    if (!g || !g.ids.length) return null;
    const id = g.bag.draw(this._eligible(t));
    if (!id) return null;
    return this._commit(id, t, 'event');
  }

  _commit(id, t, kindOfFire) {
    this.lastPlayed.set(id, t);
    this.history.push({ slot: id, t: +t.toFixed(3), fire: kindOfFire });
    this.fired[kindOfFire === 'event' ? 'event' : kindOfFire]++;
    return this.slots.get(id);
  }

  state() {
    const bags = {};
    for (const [gid, g] of this.groups) bags[gid] = g.bag ? g.bag.state() : null;
    return { fired: { ...this.fired }, bags, lines: this.history.length,
      nextFore: +this.nextFore.toFixed(2), nextBack: +this.nextBack.toFixed(2) };
  }
}

// ── the runtime side: manifest, absence, lazy loading, music ────────────────

export class Radio {
  // Everything the class needs from the rest of the game arrives here. Nothing is imported from
  // main.js, so the harness in tools/ can construct it against stubs.
  constructor({
    audio,                                   // a GameAudio
    base = './',                             // where assets/audio/ lives, relative to the document
    chatter = () => {},                      // (o) => void — main.js's ui.chatter
    settings = () => ({ music: true, radio: true, sfx: true }),
    onError = () => {},
    rng = Math.random,
    manifest = null,                         // inject to skip the fetch (harness / gates)
    fetchImpl = null,
  } = {}) {
    this.audio = audio;
    this.base = base.endsWith('/') ? base : base + '/';
    this.chatterOut = chatter;
    this.settings = settings;
    this.onError = onError;
    this.rng = rng;
    this.fetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

    this.manifest = null;
    this.dir = null;
    this.music = new Map();                  // slot -> record
    this.pools = new Map();                  // pool name -> [slot ids]
    this.buffers = new Map();                // slot -> AudioBuffer | 'absent' | 'pending'
    this.absent = new Set();
    this.silent = new Set();                 // decoded, and measured to contain no audio
    this.probed = false;
    this.t = 0;
    this.ready = false;
    this.state_ = 'menu';
    this.current = null;                     // { slot, el, src, gain, pool }
    this.introUsed = false;
    this.prefetchAt = Infinity;
    this.probeAt = Infinity;
    this.probing = false;
    this.prefetchBytes = 0;
    this.inflight = 0;
    this.queue = [];
    this.stats = { fetched: 0, bytes: 0, decodeFail: 0, silentRejected: 0, playRejected: 0,
      musicRequests: 0, musicBytes: 0, textOnly: 0, withAudio: 0, headProbes: 0 };
    if (manifest) this.adopt(manifest);
  }

  // ── manifest ────────────────────────────────────────────────────────────
  // 2 KB of JSON. Fire-and-forget: a rejected fetch leaves `this.dir` null and the game plays on
  // with the synthesised bed and no popups, which is a worse game but a working one.
  async load() {
    if (this.manifest) return this.manifest;
    if (!this.fetch) return null;
    try {
      const r = await this.fetch(this.base + 'assets/audio/manifest.json', { cache: 'force-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this.adopt(await r.json());
      return this.manifest;
    } catch (e) {
      this.onError('radio-manifest', e && e.message);
      return null;
    }
  }

  adopt(m) {
    this.manifest = m;
    for (const rec of m.music || []) {
      this.music.set(rec.slot, { ...rec });
      if (!this.pools.has(rec.pool)) this.pools.set(rec.pool, []);
      this.pools.get(rec.pool).push(rec.slot);
    }
    this.dir = new ChatterDirector({ slots: (m.chatter || []).map(c => ({ ...c })), rng: this.rng });
    this.ready = true;
    return this;
  }

  // ── §10.3 rule 1 — absence, probed off the critical path ────────────────
  //
  // The plan says "at boot, for every slot, fetch(file, {method:'HEAD'})". Taken literally that is
  // 73 requests during startup, 42 of which are 404s today. It is fire-and-forget so it never
  // *blocks*, but on a phone it still contends with the city's own assets for connections, and
  // startup is the one moment this game cannot spare bandwidth. So the sweep is DEFERRED (call it
  // when the game says it is ready) and THROTTLED to 4 in flight.
  //
  // The probe is a convenience, not the safety net. The safety net is that every real load path
  // marks its own slot absent on failure, so a slot that HEADs 200 and then fails to decode — or
  // decodes to silence — still degrades correctly. A probe that is trusted as the only check is a
  // measurement that can be wrong in exactly the direction that hurts.
  async probeAll({ concurrency = 4 } = {}) {
    if (!this.manifest || !this.fetch) return null;
    const files = [
      ...[...this.music.values()].map(r => [r.slot, r.file, 'music']),
      ...(this.manifest.chatter || []).map(c => [c.slot, c.file, 'chatter']),
    ];
    let i = 0;
    const worker = async () => {
      while (i < files.length) {
        const [slot, file] = files[i++];
        try {
          const r = await this.fetch(this.base + 'assets/audio/' + file, { method: 'HEAD', cache: 'force-cache' });
          this.stats.headProbes++;
          if (!r.ok) this._markAbsent(slot);
        } catch { this._markAbsent(slot); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    this.probed = true;
    return this.absenceReport();
  }

  _markAbsent(slot) {
    this.absent.add(slot);
    this.buffers.set(slot, 'absent');
    if (this.dir) this.dir.setAbsent(slot, true);
    const m = this.music.get(slot);
    if (m) m.absent = true;
    return true;
  }

  absenceReport() {
    const musicPresent = [...this.music.keys()].filter(s => !this.absent.has(s));
    const chatter = (this.manifest?.chatter || []);
    return {
      probed: this.probed,
      music: { total: this.music.size, present: musicPresent.length, presentSlots: musicPresent },
      chatter: { total: chatter.length, absent: chatter.filter(c => this.absent.has(c.slot)).length },
      pools: Object.fromEntries([...this.pools].map(([p, ids]) => [p, ids.filter(id => !this.absent.has(id)).length])),
      silent: [...this.silent],
    };
  }

  // ── chatter clips: fetch + decode + the silence check ────────────────────
  //
  // Short files (2.7–8.2 s, 20–53 KB). These DO go through decodeAudioData: they need to be
  // sample-accurate one-shots through the radio bus, their exact duration feeds §8.5's hold rule,
  // and the whole set decodes to a few MB.
  async clip(slot) {
    const have = this.buffers.get(slot);
    if (have instanceof Object && have.duration !== undefined) return have;   // AudioBuffer
    if (have === 'absent') return null;
    if (have === 'pending') return null;                                       // never await a popup
    if (!this.audio || !this.audio.ctx || !this.fetch) return null;
    const rec = (this.manifest?.chatter || []).find(c => c.slot === slot);
    if (!rec) return null;

    this.buffers.set(slot, 'pending');
    try {
      const r = await this.fetch(this.base + 'assets/audio/' + rec.file, { cache: 'force-cache' });
      if (!r.ok) { this._markAbsent(slot); return null; }
      const bytes = await r.arrayBuffer();
      this.stats.fetched++;
      this.stats.bytes += bytes.byteLength;
      this.prefetchBytes += bytes.byteLength;
      const buf = await this.audio.ctx.decodeAudioData(bytes);
      // THE check. Not byteLength, not duration, not "decodeAudioData resolved" — decoded sample
      // energy. A silent clip is indistinguishable from a missing one as far as the player is
      // concerned, so it is treated as missing and the line goes out as text.
      const energy = rms(buf, 8);
      if (energy < MIN_RMS) {
        this.silent.add(slot);
        this.stats.silentRejected++;
        this.onError('radio-silent', `${slot} decoded to rms ${energy.toExponential(2)} — treating as absent`);
        this._markAbsent(slot);
        return null;
      }
      buf._rms = energy;
      this.buffers.set(slot, buf);
      return buf;
    } catch (e) {
      this.stats.decodeFail++;
      this.onError('radio-clip', `${slot}: ${e && e.message}`);
      this._markAbsent(slot);
      return null;
    }
  }

  // ONE call for the whole deferred-load schedule, made when the game says it is ready. Both the
  // HEAD sweep and the chatter prefetch hang off it, so a caller cannot wire half of it. The delays
  // are what keep them off the critical path: nothing here can issue a request during startup even
  // if `update()` is running, because `t` has not reached the deadline yet.
  scheduleDeferredLoads(t = this.t) {
    this.probeAt = t + PREFETCH.PROBE_DELAY;
    this.prefetchAt = t + PREFETCH.DELAY;
    return { probeAt: this.probeAt, prefetchAt: this.prefetchAt };
  }
  // kept as the older, narrower name so a caller that only wants the prefetch still works
  scheduleChatterPrefetch(t = this.t) { return this.scheduleDeferredLoads(t); }

  _pumpPrefetch() {
    if (!this.manifest) return;
    if (this.probeAt !== undefined && this.t >= this.probeAt && !this.probing && !this.probed) {
      this.probing = true;
      this.probeAll().catch(e => this.onError('radio-probe', e && e.message)).finally(() => { this.probing = false; });
    }
    if (this.t < this.prefetchAt) return;
    if (this.prefetchBytes >= PREFETCH.MAX_BYTES) return;
    if (typeof navigator !== 'undefined' && navigator.connection && navigator.connection.saveData) return;
    if (!this.queue.length) {
      // Foreground groups first — those are the ones with a popup whose hold should match the audio.
      this.queue = (this.manifest.chatter || [])
        .filter(c => !this.absent.has(c.slot) && !this.buffers.has(c.slot))
        .sort((a, b) => (a.layer === 'fore' ? 0 : 1) - (b.layer === 'fore' ? 0 : 1))
        .map(c => c.slot);
      if (!this.queue.length) { this.prefetchAt = Infinity; return; }
    }
    while (this.inflight < PREFETCH.CONCURRENCY && this.queue.length) {
      const slot = this.queue.shift();
      this.inflight++;
      this.clip(slot).finally(() => { this.inflight--; });
    }
  }

  // ── firing a line ───────────────────────────────────────────────────────
  //
  // The popup NEVER waits on the network. If the clip is already decoded the hold takes the audio
  // duration into account (§8.5's `max(hold, audioDuration + 1.2)`); if it is not, the line goes out
  // as text immediately and the fetch is started for next time. A radio line that appears 400 ms
  // late because of a 30 KB request is a worse bug than one that appears without audio.
  fire(rec) {
    if (!rec) return null;
    const fore = rec.layer !== 'back';
    const buf = this.buffers.get(rec.slot);
    const playable = buf && buf.duration !== undefined;
    let played = null;

    if (playable && this.audio && this.audio.ready && this.settings().radio !== false) {
      played = this.audio.playClip(buf, { gain: rec.gain || (fore ? 0.9 : 0.22), squelch: true, bus: 'radio' });
    } else if (!this.buffers.has(rec.slot)) {
      this.clip(rec.slot);                     // fire-and-forget; no await, no rejection escapes
    }

    if (fore) {
      const dur = played ? played.duration : 0;
      (dur ? this.stats.withAudio++ : this.stats.textOnly++);
      // §10.3 rule 3: a foreground line plays at `gain` AND shows the popup. Text comes from the
      // manifest, so it is present whether or not the file is.
      this.chatterOut({ speaker: rec.speaker || 'RADIO', text: rec.text || '', tag: rec.tag || 'info', audio: dur });
      // §10.2 ducking for the length of the line, or for the read hold when there is no audio —
      // the bed should drop while the player is reading, not only while a file is playing.
      const holdish = dur ? dur + 0.6 : clamp(1.8 + 0.085 * (rec.text || '').length, 3.5, 13);
      this.audio && this.audio.duckFor(holdish);
    }
    return { slot: rec.slot, audio: played ? +played.duration.toFixed(3) : 0, rms: played ? played.rms : 0 };
  }

  // §S2-J. Fire ONE NAMED SLOT with text the caller supplies. The story's remarks about the
  // player's father are seeded into the ordinary `life` and `pirate` pools precisely so they arrive
  // looking like every other line on the channel, and this is how the story asks for a specific one
  // instead of waiting for the director to happen to draw it.
  //
  // It goes through `fire()` and nothing else, so it inherits the property that matters: **the
  // popup never waits on the network.** If the 11 KB clip is not decoded yet the line goes out as
  // text immediately and the fetch starts for next time — which is what every line in this game
  // already does on its first play.
  speak(slot, { speaker = null, text = null, tag = null } = {}) {
    const rec = (this.manifest && this.manifest.chatter || []).find(c => c.slot === slot) || null;
    const out = rec
      ? { ...rec, speaker: speaker || rec.speaker, text: text || rec.text, tag: tag || rec.tag }
      : { slot, speaker: speaker || 'OPEN CHANNEL', text: text || '', tag: tag || 'bg',
        layer: 'fore', gain: 0.9 };
    return this.fire(out);
  }

  // §10.4's job-event pools. Called by the mission loop (see docs/P8_WIRING.md).
  event(kind) {
    if (!this.dir) return null;
    const rec = this.dir.event(kind, this.t);
    return rec ? this.fire(rec) : null;
  }

  onToast() { this.dir && this.dir.suppress(this.t, DIR.TOAST_SUPPRESS); }

  // ── music: streamed, lazy, and never on the critical path ────────────────

  setState(name) {
    if (!MUSIC_CHAIN[name]) return false;
    if (this.state_ === name) return false;
    this.state_ = name;
    this._applyMusic();
    return true;
  }

  // The state machine as a function of context, so main.js can hand over what it knows and this
  // file owns the precedence. `menu` holds until the player flies.
  musicStateFor(ctx = {}) {
    if (ctx.menu) return 'menu';
    if (ctx.docked) return 'docked';
    if (ctx.rush) return 'rush';
    if (ctx.variant === 'stormnight') return 'storm';
    if (this.settings().station === 'pirate') return 'diegetic';
    if (!this.introUsed && ctx.firstFlight) return 'intro';
    if (ctx.variant === 'daysmog') return 'cruise_day';
    return 'cruise';
  }

  _pickSlot(state) {
    for (const pool of MUSIC_CHAIN[state] || []) {
      const ids = (this.pools.get(pool) || []).filter(s => !this.absent.has(s) && !this.silent.has(s));
      if (!ids.length) continue;
      // do not restart the track that is already playing when the state re-resolves to it
      const others = ids.filter(s => !this.current || s !== this.current.slot);
      const from = others.length ? others : ids;
      return { slot: from[Math.floor(this.rng() * from.length)], pool };
    }
    return null;                        // every pool in the chain is empty → the synth bed carries it
  }

  _applyMusic() {
    if (!this.audio || !this.audio.ready) return null;        // no context yet → nothing to request
    if (this.settings().music === false) { this._stopMusic(0.4); return null; }
    const pick = this._pickSlot(this.state_);
    if (!pick) { this._stopMusic(1.0); return null; }
    if (this.current && this.current.slot === pick.slot) return null;
    const rec = this.music.get(pick.slot);
    if (!rec) return null;
    if (this.state_ === 'intro') this.introUsed = true;
    this._startMusic(rec, pick.pool);
    return pick.slot;
  }

  _startMusic(rec, pool) {
    const ctx = this.audio.ctx;
    let el;
    try {
      el = new Audio();
      el.preload = 'none';                 // nothing is requested by construction
      el.loop = true;
      el.crossOrigin = 'anonymous';
      el.muted = false;
      // playsinline is meaningless for audio-only, but the attribute is harmless and this element
      // is the same shape as the video one obligation T8 governs.
      el.setAttribute('playsinline', '');
      // THIS assignment is the first and only moment a music byte is requested, and it is
      // downstream of a gesture by construction: audio.ready is false until the context runs.
      el.src = this.base + 'assets/audio/' + rec.file;
      this.stats.musicRequests++;
    } catch (e) { this.onError('radio-music-el', e && e.message); return null; }

    let src = null, gain = null, analyser = null;
    try {
      gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src = ctx.createMediaElementSource(el);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(gain);
      gain.connect(analyser);
      // §10.3 rule 4 / M9: the diegetic pirate station goes through the radio band limit; everything
      // else goes to the music bus.
      gain.connect(pool === 'diegetic' ? this.audio.diegeticBus : this.audio.musicBus);
    } catch (e) {
      // createMediaElementSource can fail (older WebKit, a CORS-tainted element). Fall back to the
      // element's own volume — worse (no bus, no equal-power curve) but audible, which beats silence.
      this.onError('radio-music-graph', e && e.message);
      src = null; gain = null; analyser = null;
      el.volume = clamp(rec.gain || 0.4, 0, 1);
    }

    const prev = this.current;
    const next = { slot: rec.slot, pool, el, src, gain, analyser, rec, startedAt: this.t, checked: false };
    this.current = next;

    // A rejected play() is normal, not exceptional: an autoplay policy, a pending gesture, a network
    // stall, or a file that is simply not there all produce one. It is always caught. But the two
    // causes need different answers and conflating them is a bug the gates caught:
    //
    //   NotSupportedError / a media error  → the FILE is not usable. Mark the slot absent and fall
    //     through the §10.3 chain immediately, or the state machine picks the same missing track
    //     every time it re-resolves and burns a request on each one. (This is how an unprobed
    //     `storm` slot behaved before the split.)
    //   NotAllowedError / AbortError       → the POLICY blocked it. The file is fine; mark the track
    //     blocked and let the next gesture or state change retry. Marking it absent here would
    //     permanently delete a perfectly good track because the player had not tapped yet.
    const failed = (e, why) => {
      next.playing = false;
      this.stats.playRejected++;
      this.onError('radio-music-play', `${rec.slot}: ${why} ${e && e.name} ${e && e.message || ''}`);
      if (this.current === next) this.current = prev && prev !== next ? prev : null;
      this._teardown(next);
      if (why === 'unusable') { this._markAbsent(rec.slot); this._applyMusic(); }
      else next.blocked = true;
    };
    el.addEventListener('error', () => {
      if (next.playing || next.dead) return;
      next.dead = true;
      failed(el.error || new Error('media error'), 'unusable');
    }, { once: true });

    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { next.playing = true; this._fadeIn(next, prev); },
        e => {
          if (next.dead) return;
          next.dead = true;
          const name = e && e.name;
          failed(e, (name === 'NotAllowedError' || name === 'AbortError') ? 'blocked' : 'unusable');
        });
    } else {
      next.playing = true;
      this._fadeIn(next, prev);
    }
    return next;
  }

  // §10.3 rule 4's equal-power crossfade over the slot's `fade`. sin/cos, not two exponentials —
  // two exponential ramps dip through the middle of a crossfade and the seam is audible.
  _fadeIn(next, prev) {
    const ctx = this.audio.ctx;
    const fade = Math.max(0.05, next.rec.fade || 1.5);
    const target = next.rec.gain || 0.4;
    const N = 32;
    const up = new Float32Array(N), down = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      up[i] = Math.max(0.0001, Math.sin(x * Math.PI / 2) * target);
      down[i] = Math.max(0.0001, Math.cos(x * Math.PI / 2));
    }
    const t0 = ctx.currentTime + 0.01;
    if (next.gain) {
      try { next.gain.gain.cancelScheduledValues(t0); next.gain.gain.setValueCurveAtTime(up, t0, fade); }
      catch { next.gain.gain.linearRampToValueAtTime(target, t0 + fade); }
    }
    if (prev && prev !== next) {
      if (prev.gain) {
        const pv = prev.gain.gain.value || 0.0001;
        const d = new Float32Array(N);
        for (let i = 0; i < N; i++) d[i] = Math.max(0.0001, down[i] * pv);
        try { prev.gain.gain.cancelScheduledValues(t0); prev.gain.gain.setValueCurveAtTime(d, t0, fade); }
        catch { prev.gain.gain.linearRampToValueAtTime(0.0001, t0 + fade); }
      }
      setTimeout(() => this._teardown(prev), (fade + 0.2) * 1000);
    }
  }

  _teardown(rec) {
    if (!rec) return;
    try { rec.el.pause(); } catch {}
    try { rec.src && rec.src.disconnect(); } catch {}
    try { rec.gain && rec.gain.disconnect(); } catch {}
    try { rec.analyser && rec.analyser.disconnect(); } catch {}
    // Dropping the src releases the stream. `removeAttribute` rather than `src = ''`, which requests
    // the document URL in some engines.
    try { rec.el.removeAttribute('src'); rec.el.load(); } catch {}
  }

  _stopMusic(fade = 1.0) {
    const cur = this.current;
    if (!cur) return false;
    this.current = null;
    if (cur.gain) { try { cur.gain.gain.linearRampToValueAtTime(0.0001, this.audio.ctx.currentTime + fade); } catch {} }
    setTimeout(() => this._teardown(cur), (fade + 0.2) * 1000);
    return true;
  }

  // Streamed music cannot be RMS'd before it plays, so it is measured AFTER it starts, off the
  // analyser. Same rule, same threshold: a track that streams and plays and produces no energy is
  // silent, and silent is absent.
  _checkMusicEnergy() {
    const c = this.current;
    if (!c || c.checked || !c.analyser || !c.playing) return;
    if (this.t - c.startedAt < 2.0) return;
    c.checked = true;
    const buf = new Float32Array(c.analyser.fftSize);
    try { c.analyser.getFloatTimeDomainData(buf); } catch { return; }
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const r = Math.sqrt(s / buf.length);
    c.rms = r;
    // The analyser sits AFTER the fade gain, so a track still ramping in reads low. 2 s in, a
    // 1.2–3.0 s fade is at ≥ 0.7 of target, and MIN_RMS is two decades below any real track.
    if (r < MIN_RMS * 0.2) {
      this.silent.add(c.slot);
      this.stats.silentRejected++;
      this.onError('radio-music-silent', `${c.slot} played with rms ${r.toExponential(2)} — treating as absent`);
      this._markAbsent(c.slot);
      this.current = null;
      this._teardown(c);
      this._applyMusic();
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────
  // `ctx` is the game context: { menu, docked, rush, variant, firstFlight, nearHub, patrolNear,
  // district, variantChange, night, commercial }. Everything is optional.
  update(dt, ctx = {}) {
    this.t += dt;
    if (!this.dir) return null;
    this._pumpPrefetch();

    const want = this.musicStateFor(ctx);
    if (want !== this.state_) { this.state_ = want; this._applyMusic(); }
    else if (this.audio && this.audio.ready && !this.current && this.settings().music !== false) {
      // the context came up after the state was first resolved — try again now that it can be served
      this._applyMusic();
    }
    this._checkMusicEnergy();

    const fired = this.dir.tick(this.t, ctx);
    const out = [];
    for (const rec of fired) { const r = this.fire(rec); if (r) out.push(r); }
    return out.length ? out : null;
  }

  state() {
    return {
      ready: this.ready,
      t: +this.t.toFixed(2),
      music: this.current ? { slot: this.current.slot, pool: this.current.pool,
        playing: !!this.current.playing, blocked: !!this.current.blocked,
        gain: this.current.gain ? +this.current.gain.gain.value.toFixed(4) : null,
        rms: this.current.rms !== undefined ? +this.current.rms.toFixed(5) : null } : null,
      state: this.state_,
      absent: this.absent.size,
      silent: [...this.silent],
      buffers: [...this.buffers.keys()].filter(k => { const v = this.buffers.get(k); return v && v.duration !== undefined; }).length,
      stats: { ...this.stats },
      // `this.dir` is null whenever the manifest did not load — which is the entire point of leg E,
      // and every other method in this file already guards it. Unguarded here, `__state.radio`
      // THREW, and because `__state` is one getter that means the WHOLE debug surface became
      // unreadable in exactly the case the game is supposed to degrade gracefully in. Found by
      // wiring `radio.state()` into §2.7 and deleting assets/audio/.
      director: this.dir ? this.dir.state() : null,
    };
  }
}
