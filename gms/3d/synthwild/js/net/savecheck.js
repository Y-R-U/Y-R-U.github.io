// Validates a loaded save before it reaches the game. Saves can come from other
// players (public worlds), so nothing in them is trusted: bad numbers are
// clamped or dropped, and anything structurally wrong throws code 'corrupt'.
const XZ_LIMIT = 1e6;
const Y_MIN = -16, Y_MAX = 256;
const MAX_SECTIONS = 50000;
const MAX_SECTION_CHARS = 200000;
const MAX_SLOTS = 200;
const SECTION_KEY = /^-?\d{1,7},\d{1,2},-?\d{1,7}$/;

export class SaveError extends Error {
  constructor(why) {
    super("This world's save is damaged and can't be opened.");
    this.name = 'SaveError';
    this.code = 'corrupt';
    this.status = 0;
    this.why = why;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, def, a = -Infinity, b = Infinity) => (fin(v) ? clamp(v, a, b) : def);

function vec3(p) {
  if (!Array.isArray(p) || p.length < 3 || !p.slice(0, 3).every(fin)) return null;
  return [clamp(p[0], -XZ_LIMIT, XZ_LIMIT), clamp(p[1], Y_MIN, Y_MAX), clamp(p[2], -XZ_LIMIT, XZ_LIMIT)];
}

function slots(inv) {
  if (!isObj(inv)) return null;
  const out = { sel: num(inv.sel, 0, 0, 64) | 0, slots: [] };
  if (Array.isArray(inv.slots)) {
    for (const s of inv.slots.slice(0, MAX_SLOTS)) {
      if (!isObj(s) || !(typeof s.id === 'string' || fin(s.id)) || String(s.id).length > 64) { out.slots.push(null); continue; }
      const c = { id: s.id, n: num(s.n, 0, 0, 1e7) | 0, f: num(s.f, 0, 0, 1e7) | 0 };
      if (s.dur != null) c.dur = num(s.dur, 0, 0, 1e7);
      out.slots.push(c);
    }
  }
  return out;
}

export function sanitizeSave(save) {
  if (save == null) return null;
  if (!isObj(save)) throw new SaveError('not an object');
  const out = { ...save };
  if (out.v != null && !fin(out.v)) throw new SaveError('bad version');
  if (out.mode !== 'survival' && out.mode !== 'build') delete out.mode;
  if (fin(out.time)) out.time = ((out.time % 1) + 1) % 1;
  else delete out.time;

  if (out.world != null) {
    const w = out.world;
    if (!isObj(w)) throw new SaveError('bad world');
    if (w.seed != null && !(typeof w.seed === 'string' || fin(w.seed))) throw new SaveError('bad seed');
    if (typeof w.seed === 'string' && w.seed.length > 64) throw new SaveError('bad seed');
    const secs = w.sections ?? {};
    if (!isObj(secs)) throw new SaveError('bad sections');
    const keys = Object.keys(secs);
    if (keys.length > MAX_SECTIONS) throw new SaveError('too many sections');
    const clean = {};
    for (const k of keys) {
      const v = secs[k];
      if (!SECTION_KEY.test(k) || typeof v !== 'string' || v.length > MAX_SECTION_CHARS) throw new SaveError('bad section ' + k.slice(0, 20));
      clean[k] = v;
    }
    out.world = { ...w, sections: clean };
    if (w.mode !== 'survival' && w.mode !== 'build') delete out.world.mode;
  }

  if (out.player != null) {
    const p = isObj(out.player) ? out.player : {};
    const pos = vec3(p.pos);
    out.player = pos
      ? { ...p, pos, yaw: num(p.yaw, 0, -1e4, 1e4), pitch: num(p.pitch, 0, -Math.PI / 2, Math.PI / 2), flying: !!p.flying }
      : null;
  }

  if (out.game != null) {
    const g = out.game;
    if (!isObj(g)) throw new SaveError('bad game state');
    const n = { ...g };
    if (g.stats != null) {
      const s = isObj(g.stats) ? g.stats : {};
      n.stats = { ...s, integrity: num(s.integrity, 20, 0, 1000), charge: num(s.charge, 20, 0, 1000), air: num(s.air, 10, 0, 1000), dead: !!s.dead };
    }
    if (g.inv != null) n.inv = slots(g.inv);
    if (g.stash != null) n.stash = slots(g.stash);
    n.nights = num(g.nights, 0, 0, 1e7) | 0;
    if (g.spawn != null) {
      const s = g.spawn;
      const v = Array.isArray(s) ? vec3(s) : isObj(s) ? vec3([s.x, s.y, s.z]) : null;
      n.spawn = v ? (Array.isArray(s) ? v : { x: v[0], y: v[1], z: v[2] }) : null;
    }
    out.game = n;
  }
  return out;
}
