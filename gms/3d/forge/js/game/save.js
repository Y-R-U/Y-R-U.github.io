// The save document: version, migrations, and the untrusted-input pass. Pure — no storage, no
// renderer. `savestore.js` is what puts it in localStorage.
//
// Migration shape is `editor/scene.js`'s, not a fresh one: it is the version in this codebase that
// is actually working, and it handles the saved-by-a-newer-build case.

import { SCHOOLS, FACTIONS, blankSchools } from '../sim/schools.js';
import { xpToReach, MAX_LEVEL } from '../sim/xp.js';

export const SAVE_VERSION = 1;

const MIGRATIONS = {
  // 1 → 2, when it happens. Kept here as the pattern: a pure function of the previous shape, and
  // every field it adds must default to v1 behaviour.
  // 1: raw => ({ ...raw, v: 2, pins: raw.pins ?? [] }),
};

const XP_CAP = xpToReach(MAX_LEVEL) * 4;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, d = null) => (typeof v === 'string' && v ? v : d);
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
const arr = v => (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function clamp(v, lo, hi, d, name, warnings) {
  const n = num(v, d);
  if (n < lo || n > hi) {
    warnings.push(`${name} was ${n}, clamped to ${Math.min(hi, Math.max(lo, n))}`);
    return Math.min(hi, Math.max(lo, n));
  }
  return n;
}

export function blank(seed = (Date.now() & 0x7fffffff)) {
  return {
    v: SAVE_VERSION,
    seed,
    created: Date.now(),
    played: 0,
    clock: { t: 4 },
    campaign: { current: 'light', act: 1, done: [], echoes: [], postures: {} },
    faction: 'light',
    worn: null,
    schools: blankSchools(),
    vitals: { hp: null, focus: null },
    purse: { marks: 0, banked: 0 },
    standing: { light: 0, neutral: 0, dark: 0 },
    items: [],
    bank: [],
    stave: { id: 'ash_stave', integrity: 100 },
    charms: [null, null, null],
    pins: [],
    known: { recipes: [], appraised: [] },
    atlas: { ferry: [], nodes: [] },
    quests: {},
    tracked: null,
    flags: {},
    truths: [],
    log: [],
    at: null,
    ledger: { day: 0, sold: {} },
    daily: { day: 0, standing: {}, mended: [], reforgeT: null },
    board: { day: -1, ids: [] },
    settings: { flip: false, haptics: true, aimAssist: 1, uiScale: 1, holdAssist: false,
      factionMarks: false, motion: 1, volume: 0.8, mute: false, ambience: 1 },
    onboard: {},
  };
}

export function normalise(raw, opts = {}) {
  const fail = error => ({ doc: null, error, warnings: [] });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('not a save');

  let doc = raw;
  const v = num(doc.v, 1);
  if (v > SAVE_VERSION) return fail(`saved by a newer build (v${v}; this one reads v${SAVE_VERSION})`);

  const warnings = [];
  for (let from = Math.max(1, v | 0); from < SAVE_VERSION; from++) {
    if (!MIGRATIONS[from]) return fail(`no migration from v${from}`);
    doc = MIGRATIONS[from](doc);
    warnings.push(`upgraded v${from} → v${from + 1}`);
  }
  return { doc: clampAll(doc, warnings, opts), error: null, warnings };
}

export function clampAll(raw, warnings = [], { defs = null, items = null, truths = null } = {}) {
  const d = blank(num(raw.seed, blank().seed));
  d.v = SAVE_VERSION;
  d.created = num(raw.created, d.created);
  d.played = Math.max(0, num(raw.played, 0));
  d.clock = { t: Math.max(0, num(raw.clock?.t, 4)) };

  const c = obj(raw.campaign);
  d.campaign = {
    current: FACTIONS.includes(c.current) ? c.current : 'light',
    act: clamp(c.act, 1, 5, 1, 'campaign.act', warnings),
    done: arr(c.done).filter(x => FACTIONS.includes(x)),
    echoes: arr(c.echoes).filter(x => typeof x === 'string'),
    postures: obj(c.postures),
  };
  d.faction = FACTIONS.includes(raw.faction) ? raw.faction : 'light';
  // A Graft is combat-timescale (SYSTEMS §9.2): you are never reloaded mid-disguise.
  if (raw.worn != null && !FACTIONS.includes(raw.worn)) warnings.push(`worn faction ${raw.worn} no longer exists`);
  d.worn = null;

  const s = obj(raw.schools);
  for (const school of SCHOOLS) d.schools[school] = clamp(s[school], 0, XP_CAP, 0, `schools.${school}`, warnings);
  for (const k of Object.keys(s)) if (!SCHOOLS.includes(k)) warnings.push(`unknown school ${k} dropped`);

  d.vitals = { hp: raw.vitals?.hp == null ? null : Math.max(0, num(raw.vitals.hp, 0)),
    focus: raw.vitals?.focus == null ? null : Math.max(0, num(raw.vitals.focus, 0)) };
  d.purse = { marks: Math.max(0, Math.round(num(raw.purse?.marks, 0))),
    banked: Math.max(0, Math.round(num(raw.purse?.banked, 0))) };
  for (const f of FACTIONS) d.standing[f] = clamp(raw.standing?.[f], -100, 100, 0, `standing.${f}`, warnings);

  const stack = (list, where) => arr(list).map(e => {
    if (!e || !str(e.id)) return null;
    if (items && !items.has(e.id)) { warnings.push(`${where}: unknown item ${e.id} dropped`); return null; }
    const out = { id: e.id, n: Math.max(0, Math.round(num(e.n, 0))) };
    if (typeof e.caught === 'number') out.caught = e.caught;
    return out.n > 0 ? out : null;
  }).filter(Boolean);
  d.items = stack(raw.items, 'items');
  d.bank = stack(raw.bank, 'bank');

  d.stave = { id: str(raw.stave?.id, 'ash_stave'), integrity: clamp(raw.stave?.integrity, 0, 100, 100, 'stave.integrity', warnings) };
  d.charms = [0, 1, 2].map(i => {
    const ch = arr(raw.charms)[i];
    if (!ch || !str(ch.id)) return null;
    return { id: ch.id, tier: clamp(ch.tier, 1, 4, 1, 'charm.tier', warnings),
      school: SCHOOLS.includes(ch.school) ? ch.school : null, mod: str(ch.mod),
      mag: num(ch.mag, 0), integrity: clamp(ch.integrity, 0, 100, 100, 'charm.integrity', warnings) };
  });
  d.pins = arr(raw.pins).filter(p => SCHOOLS.includes(p)).slice(0, 3);
  d.known = { recipes: arr(raw.known?.recipes).filter(x => typeof x === 'string'),
    appraised: arr(raw.known?.appraised).filter(x => typeof x === 'string') };
  d.atlas = { ferry: arr(raw.atlas?.ferry).filter(x => FACTIONS.includes(x)),
    nodes: arr(raw.atlas?.nodes).filter(x => typeof x === 'number') };

  d.quests = {};
  for (const [id, rec] of Object.entries(obj(raw.quests))) {
    if (defs && !defs[id]) { warnings.push(`quest ${id} no longer exists, dropped`); continue; }
    if (!rec || typeof rec !== 'object') continue;
    d.quests[id] = {
      s: ['active', 'turnin', 'done', 'failed', 'cooling'].includes(rec.s) ? rec.s : 'active',
      i: Math.max(0, Math.round(num(rec.i, 0))),
      c: obj(rec.c),
      t: num(rec.t, 0),
      e: 0,                                   // real-seconds step timer, dies on load
      scene: str(rec.scene),
      ...(rec.readyOn != null ? { readyOn: num(rec.readyOn, 0) } : {}),
      ...(rec.why ? { why: str(rec.why) } : {}),
    };
  }
  d.tracked = d.quests[str(raw.tracked)] ? raw.tracked : null;
  d.flags = obj(raw.flags);

  // Unknown truth ids are KEPT and shown as their raw id. Truths are the carry-over; losing one
  // silently is worse than an ugly string on the screen.
  d.truths = arr(raw.truths).map(t => {
    if (typeof t === 'string') return { id: t, day: 0, campaign: null, quest: null, scene: null };
    if (!t || !str(t.id)) return null;
    if (truths && !truths[t.id]) warnings.push(`truth ${t.id} is not in this build's catalogue`);
    return { id: t.id, day: num(t.day, 0), campaign: str(t.campaign), quest: str(t.quest),
      scene: str(t.scene), ...(t.superseded ? { superseded: t.superseded } : {}) };
  }).filter(Boolean);
  d.log = arr(raw.log).filter(e => e && Array.isArray(e.line)).slice(-200)
    .map(e => ({ day: num(e.day, 0), scene: str(e.scene), line: e.line.slice(0, 3) }));

  d.at = positionOf(raw.at);
  d.ledger = { day: num(raw.ledger?.day, 0), sold: obj(raw.ledger?.sold) };
  d.daily = { day: num(raw.daily?.day, 0), standing: obj(raw.daily?.standing),
    mended: arr(raw.daily?.mended).filter(x => typeof x === 'string'),
    reforgeT: raw.daily?.reforgeT == null ? null : num(raw.daily.reforgeT, 0) };
  d.board = { day: num(raw.board?.day, -1), ids: arr(raw.board?.ids).filter(x => typeof x === 'string') };

  const st = obj(raw.settings);
  d.settings = {
    flip: bool(st.flip), haptics: bool(st.haptics, true), holdAssist: bool(st.holdAssist),
    factionMarks: bool(st.factionMarks),
    aimAssist: clamp(st.aimAssist, 0, 2, 1, 'settings.aimAssist', warnings),
    uiScale: clamp(st.uiScale, 0.8, 1.6, 1, 'settings.uiScale', warnings),
    motion: clamp(st.motion, 0, 1, 1, 'settings.motion', warnings),
    volume: clamp(st.volume, 0, 1, 0.8, 'settings.volume', warnings),
    mute: bool(st.mute),
    ambience: clamp(st.ambience, 0, 1, 1, 'settings.ambience', warnings),
  };
  d.onboard = obj(raw.onboard);
  return d;
}

export const itemCount = (doc, id) => doc.items.find(e => e.id === id)?.n || 0;

export function addItem(doc, id, n, caught) {
  const cur = doc.items.find(e => e.id === id);
  if (cur) cur.n = Math.max(0, cur.n + n);
  else if (n > 0) doc.items.push(caught ? { id, n, caught } : { id, n });
  doc.items = doc.items.filter(e => e.n > 0);
  return doc;
}

function positionOf(at) {
  if (!at || typeof at !== 'object') return null;
  const ok = ['x', 'y', 'z', 'yaw'].every(k => typeof at[k] === 'number' && Number.isFinite(at[k]));
  if (!ok) return null;
  return { x: at.x, y: at.y, z: at.z, yaw: at.yaw, area: str(at.area), door: at.door ?? null, rev: num(at.rev, -1) };
}

// SYSTEMS §9.2: anything on an economy timescale is keyed on the day and survives; a week away
// resets it once, with no catch-up loop.
export function rollDay(doc, day) {
  if (!(day > doc.ledger.day)) return doc;
  return {
    ...doc,
    ledger: { day, sold: {} },
    daily: { day, standing: {}, mended: [], reforgeT: doc.daily.reforgeT },
    board: { day: -1, ids: [] },
  };
}

export const POSITION = {
  ok: 'restored',
  door: 'door',
  none: 'no stored position',
  stale: 'the world has been rebuilt since this save',
  unverifiable: 'the ground could not be sampled',
  sky: 'the ground has moved under the stored position',
};

export const GROUND_TOLERANCE = 2;

// Track A is rebuilding the world while saves exist, so a stored position is guilty until proven
// innocent: the scene revision must match and the ground must still be where the save says it was.
export function checkPosition(at, { rev = null, groundAt = null } = {}) {
  if (!at) return { ok: false, reason: POSITION.none };
  if (at.door != null) return { ok: true, door: at.door, reason: POSITION.door, area: at.area };
  if (rev == null || at.rev !== rev) return { ok: false, reason: POSITION.stale, area: at.area };
  if (typeof groundAt !== 'function') return { ok: false, reason: POSITION.unverifiable, area: at.area };
  const gy = groundAt(at.x, at.z, at.y);
  if (!Number.isFinite(gy) || Math.abs(gy - at.y) > GROUND_TOLERANCE) {
    return { ok: false, reason: POSITION.sky, area: at.area };
  }
  return { ok: true, x: at.x, y: gy, z: at.z, yaw: at.yaw, area: at.area, reason: POSITION.ok };
}
