/**
 * One localStorage key, versioned (§6.11, §7.3).
 *
 * This is the SHAPE only. P10 owns the story/level data model and P13 the
 * economy fields; both extend `fresh()` and add a migration. Every version bump
 * ships a migration, never a wipe — losing a hangar to a schema change is the
 * one bug a player never forgives.
 *
 * A corrupt save costs exactly one console warning plus an in-page callout.
 * Never an alert, never a blocking modal (§10 rule 2) — a modal that opens under
 * a thumb also eats the pointerup and permanently deadens the action under it.
 */

const KEY = 'kitehawk.save';
/**
 * v4 (P10) — the story model gets `unlocked`, `attempts` and `lastPlayed`, and
 * the hangar's airframe id is corrected from `"kitehawk-i"` to `"kite_b1"`.
 *
 * `"kitehawk-i"` is not an id `js/data/tables.js` builds, and `playerType()`
 * returns the reference airframe for an unknown id **silently** — the same
 * defect D149 found in `ARCHITECTURE.md` §7.1's worked level, in a second place
 * nobody had looked. A save carrying it would have furnished a hangar with an
 * aeroplane that does not exist, and read clean.
 */
const VERSION = 4;
const WRITE_DELAY = 400;

function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'fnv1a:' + (h >>> 0).toString(16).padStart(8, '0');
}

export function freshSave(now) {
  const t = now || 0;
  return {
    v: VERSION,
    created: t,
    saved: t,
    profile: { name: '', flags: {} },
    economy: { crates: 0, scrip: 0 },
    hangar: {
      airframe: 'kite_b1',
      owned: ['kite_b1'],
      upgrades: { engine: 0, wings: 0, guns: 0, armour: 0, fuel: 0, ammo: 0 },
      traits: [],
    },
    /**
     * `unlocked` is a LIST OF IDS rather than a high-water index. The map has
     * to be able to show act 2's worked level while act 1 is still half done —
     * P9 ships four levels out of a hundred and they are not contiguous — and a
     * ladder index cannot express that without lying about the 96 that do not
     * exist yet.
     */
    story: { act: 1, level: 1, beatsSeen: [], unlocked: ['a1-01'], lastPlayed: '' },
    levels: {},
    modes: { survival: {}, race: {}, duel: {}, daily: {} },
    settings: {
      volume: { master: 0.9, sfx: 1.0, music: 0.7, voice: 1.0, ambience: 0.7 },
      lowDetail: false,
      orientationLock: 'auto',
      handed: 'right',
      assist: 'off',
      // D18 §4.3.3 — a persistent bias, NOT a per-moment control.
      zoomBias: 'normal',
      invertPitch: false,
      holdToFly: false,
      reducedMotion: false,
      damageDiagram: false,
      // DESIGN §9.2, individually toggleable. There is no bundled "assist level".
      assists: {
        alphaLimiter: true, wingsLevel: true, autoUpright: true,
        antiOvershoot: true, threatBrackets: true, leadPip: true,
        cratePredictor: false, dynamicZoom: true,
      },
    },
    checksum: '',
  };
}

export function createSave(bus, opts = {}) {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const disabled = q.has('nosave') || opts.disabled === true;
  const now = () => (typeof Date !== 'undefined' ? Date.now() : 0);

  const save = {
    data: freshSave(now()),
    enabled: !disabled && hasStorage(),
    corrupt: false,
    version: VERSION,
  };

  function hasStorage() {
    try {
      localStorage.setItem('__kh_probe', '1');
      localStorage.removeItem('__kh_probe');
      return true;
    } catch { return false; }
  }

  function sign(d) {
    const c = d.checksum;
    d.checksum = '';
    const s = fnv1a(JSON.stringify(d));
    d.checksum = c;
    return s;
  }

  /**
   * Corrupt means corrupt: `save.data` is REPLACED with a fresh one here rather
   * than left as whatever happened to be in memory. At boot those two are the
   * same object and the difference is invisible, which is exactly why it has to
   * be explicit — a later `save.load()` (a profile switch, a re-read after an
   * import) would otherwise keep serving stale data while reporting a reset.
   */
  function complain(msg) {
    save.corrupt = true;
    save.data = freshSave(now());
    console.warn('[save] ' + msg);
    if (typeof document !== 'undefined') {
      const el = document.getElementById('callout');
      if (el) { el.textContent = 'Saved progress could not be read and has been reset.'; el.hidden = false; }
    }
    if (bus) bus.emit('save:write', { reset: true, reason: msg });
  }

  save.load = () => {
    if (!save.enabled) return save.data;
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { raw = null; }
    if (!raw) return save.data;
    let d = null;
    try { d = JSON.parse(raw); } catch { d = null; }
    if (!d || typeof d !== 'object') { complain('save is not JSON — starting fresh'); return save.data; }
    if (typeof d.v !== 'number') { complain('save has no version — starting fresh'); return save.data; }
    if (d.v > VERSION) { complain(`save is from a newer build (v${d.v} > v${VERSION}) — starting fresh`); return save.data; }
    if (d.checksum && d.checksum !== sign(d)) { complain('save checksum failed — starting fresh'); return save.data; }
    if (d.v < VERSION) d = save.migrate(d, VERSION);
    save.data = merge(freshSave(d.created || now()), d);
    return save.data;
  };

  /** Structural merge so a save written before a field existed still gets it. */
  function merge(base, over) {
    if (over === null || over === undefined) return base;
    if (Array.isArray(base) || typeof base !== 'object') return over;
    if (typeof over !== 'object' || Array.isArray(over)) return over;
    const out = base;
    for (const k in over) out[k] = (k in base) ? merge(base[k], over[k]) : over[k];
    return out;
  }

  /**
   * Migrations are registered per step so a v1 save walks v1->v2->v3 rather
   * than needing an N x N table. P10/P13 add theirs here.
   */
  const MIGRATIONS = Object.create(null);
  save.registerMigration = (from, fn) => { MIGRATIONS[from] = fn; };
  save.migrate = (d, to) => {
    let cur = d;
    while (cur.v < to) {
      const step = MIGRATIONS[cur.v];
      if (!step) { cur.v = to; break; }
      cur = step(cur) || cur;
      if (cur.v <= d.v) { cur.v = to; break; }   // a migration that does not advance is a loop
    }
    return cur;
  };

  let timer = 0, pending = false;
  function flush() {
    timer = 0;
    if (!save.enabled || !pending) return;
    pending = false;
    save.data.v = VERSION;
    save.data.saved = now();
    save.data.checksum = sign(save.data);
    try { localStorage.setItem(KEY, JSON.stringify(save.data)); }
    catch (e) { console.warn('[save] write failed', e); return; }
    if (bus) bus.emit('save:write', { reset: false });
  }

  save.write = () => {
    pending = true;
    if (!save.enabled) return;
    if (timer) return;                       // coalesced, not queued
    timer = setTimeout(flush, WRITE_DELAY);
  };
  save.flush = flush;

  save.reset = () => {
    save.data = freshSave(now());
    save.corrupt = false;
    if (save.enabled) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
    return save.data;
  };

  save.export = () => {
    const s = JSON.stringify(save.data);
    return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : s;
  };
  save.import = (str) => {
    try {
      const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(str))) : str;
      const d = JSON.parse(json);
      if (!d || typeof d.v !== 'number') return false;
      save.data = merge(freshSave(now()), d.v < VERSION ? save.migrate(d, VERSION) : d);
      save.write();
      return true;
    } catch { return false; }
  };

  /* --------------------------------------------------------- the story --- */

  /**
   * v3 -> v4. **Every version bump ships a migration, never a wipe** — losing a
   * hangar to a schema change is the one bug a player never forgives (§6.11).
   * A v3 save keeps its crates, its scrip and its stars; only the two fields
   * that named an aeroplane the game does not build are rewritten.
   */
  save.registerMigration(3, (d) => {
    const h = d.hangar || (d.hangar = {});
    if (h.airframe === 'kitehawk-i') h.airframe = 'kite_b1';
    if (Array.isArray(h.owned)) h.owned = h.owned.map((id) => (id === 'kitehawk-i' ? 'kite_b1' : id));
    const st = d.story || (d.story = {});
    if (!Array.isArray(st.unlocked)) st.unlocked = ['a1-01'];
    if (typeof st.lastPlayed !== 'string') st.lastPlayed = '';
    d.v = 4;
    return d;
  });

  save.isUnlocked = (id) => save.data.story.unlocked.includes(id);

  save.unlock = (id) => {
    if (!id || save.data.story.unlocked.includes(id)) return false;
    save.data.story.unlocked.push(id);
    save.write();
    return true;
  };

  /**
   * Bank one attempt. §9.4: **a mission never costs progress.** A failed run
   * still records the attempt, still banks whatever it caught, and never takes
   * a star, a crate or an unlock away — so this only ever moves numbers upward,
   * apart from the repair fee, which is the entire cost of failing.
   */
  save.recordRun = (id, r, nextId) => {
    const L = save.data.levels[id] || (save.data.levels[id] = { best: 0, stars: [], runs: 0, fails: 0 });
    L.runs++;
    if (!r.won) L.fails++;
    else {
      L.fails = 0;
      if (!L.best || r.time < L.best) L.best = +r.time.toFixed(1);
      for (const s of r.stars) if (s.got && !L.stars.includes(s.id)) L.stars.push(s.id);
    }
    const e = save.data.economy;
    e.crates += r.cratesCaught || 0;
    e.scrip = Math.max(0, e.scrip + (r.scrip || 0) + (r.crateValue || 0) - (r.repair || 0));
    save.data.story.lastPlayed = id;
    if (r.won && nextId) save.unlock(nextId);
    save.write();
    return L;
  };

  // A phone rarely gives you an unload event and never gives you two.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  }

  return save;
}
