// The music runtime. Everything about *when* — which track comes next, when a cross-fade starts,
// what a set change does to what is already playing — lives in MusicPlan, which is pure and unit
// tested. MusicRuntime is a thin HTMLAudioElement shell that applies the plan's decisions.
//
// A set is the unit of play, not a track: pick from the set, play it, pick again.

// `now` is milliseconds throughout (performance.now / Date.now); `seconds` and playhead
// positions are seconds, because that is what an audio element reports.
export const DUCK = 0.35;          // how far a sting pushes the bed down
export const DUCK_IN = 200;
export const DUCK_OUT = 600;
export const RETARGET_MS = 120;    // volume/mute changes glide rather than step
export const HANDOVER_MIN = 250;   // shortest cross-fade between two tracks of one set
// ACE-Step takes do not all resolve. A track marked ends:"abrupt" stops dead, so the runtime has
// to fade it out itself no matter how short the set's own fade is; one marked starts:"quiet" ramps
// in from near-silence already, and fading it in on top of that dips the bed twice.
export const ABRUPT_FADE = 1500;
export const QUIET_IN = 300;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function envAt(env, now) {
  if (!env) return 0;
  if (!(env.ms > 0)) return env.to;
  return env.from + (env.to - env.from) * clamp01((now - env.t0) / env.ms);
}

// Sequential when shuffle is off; otherwise random, never the track that just played unless the
// set has nothing else to offer.
export function pickNext(tracks, { shuffle = true, lastId = null, cursor = 0, rnd = Math.random } = {}) {
  const list = (Array.isArray(tracks) ? tracks : []).filter(t => typeof t === 'string' && t);
  if (!list.length) return { id: null, cursor: 0 };
  if (!shuffle) {
    const i = ((cursor % list.length) + list.length) % list.length;
    return { id: list[i], cursor: i + 1 };
  }
  const pool = list.length > 1 ? list.filter(t => t !== lastId) : list;
  const pick = pool.length ? pool[Math.floor(rnd() * pool.length) % pool.length] : list[0];
  return { id: pick, cursor };
}

export const fadeOf = s => Math.max(0, num(s?.fadeMs, 1200));
export const fadeInFor = (t, ms) => (t?.starts === 'quiet' ? Math.min(ms, QUIET_IN) : ms);
export const fadeOutFor = (t, ms) => (t?.ends === 'abrupt' ? Math.max(ms, ABRUPT_FADE) : ms);
export const volOf = s => clamp01(num(s?.volume, 0.7));

export class MusicPlan {
  constructor({ manifest = null, rnd = Math.random, volume = 1, mute = false } = {}) {
    this.rnd = rnd;
    this.volume = clamp01(num(volume, 1));
    this.mute = !!mute;
    this.setId = null;
    this.voices = [];
    this.seq = 0;
    this.cursor = 0;
    this.lastId = null;
    this.duck = null;
    this.duckUntil = 0;
    this.problems = [];
    this.load(manifest);
  }

  load(m) {
    const doc = m && typeof m === 'object' ? m : {};
    this.manifest = { version: 1, tracks: doc.tracks || [], sets: doc.sets || [] };
    this.tracksById = new Map(this.manifest.tracks.filter(t => t?.id).map(t => [t.id, t]));
    this.setsById = new Map(this.manifest.sets.filter(s => s?.id).map(s => [s.id, s]));
  }

  setOf(id) { return this.setsById.get(id) || null; }
  trackOf(id) { return this.tracksById.get(id) || null; }
  master() { return this.mute ? 0 : this.volume; }
  targetFor(setId) { return volOf(this.setOf(setId)) * this.master(); }

  beds() { return this.voices.filter(v => v.role === 'bed' && !v.out); }
  head(v, now) { return v.head + (now - v.headAt) / 1000; }
  gainOf(v, now) {
    const d = v.role === 'bed' ? envAt(this.duck, now) : 1;
    return clamp01(envAt(v.env, now) * (this.duck ? d : 1));
  }

  gains(now) {
    const out = new Map();
    for (const v of this.voices) out.set(v.id, this.gainOf(v, now));
    return out;
  }

  state(now = 0) {
    return {
      setId: this.setId,
      voices: this.voices.map(v => ({
        id: v.id, trackId: v.trackId, role: v.role, out: v.out,
        gain: +this.gainOf(v, now).toFixed(4), head: +this.head(v, now).toFixed(3), seconds: v.seconds,
      })),
      playing: this.beds().map(v => v.trackId),
    };
  }

  // A doorway you walk back through must not restart the music, so asking for the set that is
  // already playing is a no-op unless the caller insists.
  playSet(setId, now, { restart = false } = {}) {
    const s = this.setOf(setId);
    if (!s) { this.problems.push(`no music set "${setId}"`); return []; }
    if (!restart && this.setId === setId && this.beds().length) return [];
    const fade = fadeOf(s);
    const ops = [];
    for (const v of this.beds()) this.fadeOut(v, now, fade);
    this.setId = setId;
    this.cursor = 0;
    ops.push(...this.startNext(now, fade));
    return ops;
  }

  stop(now, ms = null) {
    const fade = ms == null ? fadeOf(this.setOf(this.setId)) : Math.max(0, num(ms, 800));
    for (const v of this.voices) this.fadeOut(v, now, fade);
    this.setId = null;
    return [];
  }

  // A sting plays over the bed rather than replacing it — docs/MUSIC.md is explicit that the
  // `stings` set is not a loop bed.
  sting(setId, now) {
    const s = this.setOf(setId);
    if (!s) { this.problems.push(`no music set "${setId}"`); return []; }
    const pick = pickNext(s.tracks, { shuffle: s.shuffle !== false, lastId: this.lastSting, cursor: this.stingCursor || 0, rnd: this.rnd });
    if (!pick.id) return [];
    this.stingCursor = pick.cursor;
    this.lastSting = pick.id;
    const t = this.trackOf(pick.id);
    if (!t) { this.problems.push(`set "${setId}" names missing track "${pick.id}"`); return []; }
    const v = this.voice(t, setId, now, 'sting', 0);
    const from = this.duck ? envAt(this.duck, now) : 1;
    this.duck = { from, to: DUCK, t0: now, ms: DUCK_IN };
    this.duckUntil = now + Math.max(500, (v.seconds || 2) * 1000) - 300;
    return [this.playOp(v)];
  }

  startNext(now, fadeMs) {
    const s = this.setOf(this.setId);
    if (!s) return [];
    const pick = pickNext(s.tracks, { shuffle: s.shuffle !== false, lastId: this.lastId, cursor: this.cursor, rnd: this.rnd });
    if (!pick.id) { this.problems.push(`music set "${s.id}" has no tracks`); return []; }
    this.cursor = pick.cursor;
    this.lastId = pick.id;
    const t = this.trackOf(pick.id);
    if (!t) { this.problems.push(`set "${s.id}" names missing track "${pick.id}"`); return []; }
    return [this.playOp(this.voice(t, s.id, now, 'bed', fadeInFor(t, fadeMs)))];
  }

  voice(t, setId, now, role, fadeMs) {
    const to = role === 'sting' ? volOf(this.setOf(setId)) * this.master() : this.targetFor(setId);
    const v = {
      id: ++this.seq, trackId: t.id, file: t.file, seconds: Math.max(0, num(t.seconds, 0)),
      setId, role, out: false, over: false, born: now, head: 0, headAt: now,
      env: { from: fadeMs > 0 ? 0 : to, to, t0: now, ms: fadeMs },
    };
    this.voices.push(v);
    return v;
  }

  playOp(v) { return { op: 'play', voice: v.id, trackId: v.trackId, file: v.file, seconds: v.seconds }; }

  fadeOut(v, now, ms) {
    if (v.out) return;
    v.out = true;
    v.env = { from: this.gainOf(v, now), to: 0, t0: now, ms: Math.max(0, ms) };
    v.deadAt = now + Math.max(0, ms);
  }

  // The shell tells us where the element actually is; without this a blocked autoplay would make
  // the plan think a track is running when nothing has been heard.
  syncHead(voiceId, seconds, now) {
    const v = this.voices.find(x => x.id === voiceId);
    if (!v) return;
    v.head = Math.max(0, num(seconds, 0));
    v.headAt = now;
  }

  // The element fired `ended` — either the track is shorter than the manifest claims, or nothing
  // handed over in time. Move on immediately rather than going silent.
  ended(voiceId, now) {
    const v = this.voices.find(x => x.id === voiceId);
    if (!v) return [];
    const ops = [{ op: 'stop', voice: v.id }];
    this.voices = this.voices.filter(x => x !== v);
    if (v.role !== 'bed' || v.out || v.over || v.setId !== this.setId) return ops;
    return ops.concat(this.startNext(now, HANDOVER_MIN));
  }

  tick(now) {
    const ops = [];
    if (this.duckUntil && now >= this.duckUntil) {
      this.duckUntil = 0;
      this.duck = { from: envAt(this.duck, now), to: 1, t0: now, ms: DUCK_OUT };
    }
    const s = this.setOf(this.setId);
    if (s) {
      const fade = Math.max(HANDOVER_MIN, fadeOf(s));
      for (const v of this.beds().slice()) {
        if (v.over || v.setId !== this.setId || !(v.seconds > 0)) continue;
        // Only the natural end needs the abrupt-take fade; a set change is the author's call.
        const out = fadeOutFor(this.trackOf(v.trackId), fade);
        if (this.head(v, now) < v.seconds - out / 1000) continue;
        v.over = true;
        ops.push(...this.startNext(now, fade));
        this.fadeOut(v, now, out);
      }
    }
    // A sting is not cross-faded into anything, so an abrupt take would be heard hitting its own
    // dead stop. Take the last 400 ms off it.
    for (const v of this.voices) {
      if (v.role !== 'sting' || v.out || !(v.seconds > 0)) continue;
      if (this.trackOf(v.trackId)?.ends !== 'abrupt') continue;
      if (this.head(v, now) >= v.seconds - 0.4) this.fadeOut(v, now, 400);
    }
    for (const v of this.voices.slice()) {
      const dead = v.out && v.deadAt != null && now >= v.deadAt;
      const past = !v.out && v.seconds > 0 && this.head(v, now) >= v.seconds + 0.35;
      if (!dead && !past) continue;
      this.voices = this.voices.filter(x => x !== v);
      ops.push({ op: 'stop', voice: v.id });
      if (past && v.role === 'bed' && !v.over && v.setId === this.setId) ops.push(...this.startNext(now, HANDOVER_MIN));
    }
    return ops;
  }

  setMaster({ volume, mute }, now) {
    if (volume !== undefined) this.volume = clamp01(num(volume, this.volume));
    if (mute !== undefined) this.mute = !!mute;
    for (const v of this.voices) {
      if (v.out) continue;
      v.env = { from: envAt(v.env, now), to: this.targetFor(v.setId), t0: now, ms: RETARGET_MS };
    }
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// The shell. Two or three <audio> elements, one per live voice, with their volume driven from
// MusicPlan every tick. No AudioContext: js/game/audio.js owns that for the synthesised SFX, and
// a second context fighting it over the autoplay unlock is not worth the sample-accurate ramp.

const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

export class MusicRuntime {
  constructor({ base = '', plan = null, make = null, now = null, settings = null, tickMs = 100, rnd = undefined } = {}) {
    this.base = base;
    this.plan = plan || new MusicPlan(rnd ? { rnd } : {});
    this.make = make || (() => new Audio());
    this.now = now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.settings = settings || (() => null);
    this.tickMs = tickMs;
    this.els = new Map();
    this.armed = false;
    this.blocked = false;
    this.warned = false;
    this.timer = null;
    this.lastSettings = '';
  }

  load(manifest) { this.plan.load(manifest); return this; }
  playSet(id, opts) { return this.apply(this.plan.playSet(id, this.now(), opts)); }
  stop(ms) { return this.apply(this.plan.stop(this.now(), ms)); }
  sting(id) { return this.apply(this.plan.sting(id, this.now())); }
  state() { return { ...this.plan.state(this.now()), blocked: this.blocked, armed: this.armed }; }

  // `{"k":"music", …}` straight off a hotspot.
  action(a) {
    if (!a) return;
    if (a.stop === true) return this.stop(a.fadeMs);
    if (typeof a.set !== 'string') return;
    return a.sting ? this.sting(a.set) : this.playSet(a.set, { restart: !!a.restart });
  }

  start() {
    if (this.timer || typeof setInterval !== 'function') return this;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    return this;
  }

  dispose() {
    clearInterval(this.timer);
    this.timer = null;
    for (const [, el] of this.els) this.release(el);
    this.els.clear();
  }

  apply(ops) {
    for (const op of ops || []) {
      if (op.op === 'play') this.open(op);
      else if (op.op === 'stop') { const el = this.els.get(op.voice); if (el) { this.release(el); this.els.delete(op.voice); } }
    }
    this.paint();
    return ops;
  }

  open(op) {
    const el = this.make(op.file);
    el.src = this.base + op.file;
    el.preload = 'auto';
    el.volume = 0;
    el.onended = () => this.apply(this.plan.ended(op.voice, this.now()));
    el.onerror = () => { this.plan.problems.push(`cannot load ${op.file}`); this.apply(this.plan.ended(op.voice, this.now())); };
    this.els.set(op.voice, el);
    this.kick(el);
  }

  release(el) {
    try { el.onended = el.onerror = null; el.pause(); el.removeAttribute('src'); el.load?.(); } catch { /* already gone */ }
  }

  // Browsers refuse to start audio before a real gesture. One warning, then arm and retry — a
  // rejected play() per tick would otherwise fill the console.
  kick(el) {
    const p = el.play?.();
    if (!p || typeof p.catch !== 'function') return;
    p.then(() => { this.blocked = false; }).catch(() => {
      this.blocked = true;
      if (!this.warned) { this.warned = true; console.info('[music] waiting for a tap before starting audio'); }
      this.arm();
    });
  }

  arm() {
    if (this.armed || typeof addEventListener !== 'function') return;
    this.armed = true;
    const go = () => {
      for (const g of GESTURES) removeEventListener(g, go, true);
      this.armed = false;
      this.blocked = false;
      for (const [, el] of this.els) this.kick(el);
    };
    for (const g of GESTURES) addEventListener(g, go, { capture: true, once: false });
  }

  tick() {
    const now = this.now();
    for (const [id, el] of this.els) if (!el.paused) this.plan.syncHead(id, el.currentTime || 0, now);
    this.readSettings(now);
    this.apply(this.plan.tick(now));
  }

  paint() {
    const g = this.plan.gains(this.now());
    for (const [id, el] of this.els) {
      const v = g.get(id);
      if (v === undefined) continue;
      const want = Math.max(0, Math.min(1, v));
      if (Math.abs(el.volume - want) > 0.002) el.volume = want;
    }
  }

  // The save's own volume/mute — there is no second music volume.
  readSettings(now) {
    const s = this.settings();
    if (!s) return;
    const key = `${s.volume}|${s.mute}`;
    if (key === this.lastSettings) return;
    this.lastSettings = key;
    this.plan.setMaster({ volume: s.volume, mute: s.mute }, now);
    this.paint();
  }
}

let installed = null;

// Called once from js/main.js. Loads the manifest, starts the level's default set, and puts the
// runtime where the `music` action can find it.
export function installMusic({ level = null, session = null, base = '', manifest = null, fetchFn = null } = {}) {
  if (installed) return installed;
  const rt = new MusicRuntime({
    base,
    settings: () => session?.doc?.settings || null,
  });
  installed = rt;
  if (typeof globalThis !== 'undefined') {
    globalThis.__wfMusic = rt;
    if (globalThis.__wf) globalThis.__wf.music = rt;
  }
  const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  const ready = manifest ? Promise.resolve(manifest)
    : f ? f(`${base}data/music.json`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null);
  rt.ready = ready.then(m => {
    if (m) rt.load(m);
    rt.start();
    const def = level?.music;
    if (typeof def === 'string' && def) rt.playSet(def);
    return rt;
  });
  return rt;
}

export const currentMusic = () => installed;
export function resetMusic() { installed?.dispose(); installed = null; }
