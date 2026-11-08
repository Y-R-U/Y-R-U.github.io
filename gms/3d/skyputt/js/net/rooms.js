// Online room helpers: hole sets, default options, rank ↔ skill, helper inventories for the
// room's helper mode. Pure data, node-safe (tools/online_test.mjs).
import { COURSES } from '../course/holes/index.js';
import { HELPERS } from '../meta/helpers.js';

export const MAX_PLAYERS = 8, MIN_PLAYERS = 2;
export const SHOT_CLOCKS = [0, 20, 30, 45, 60];
export const MAX_AI_SKILL = 0.9;   // D14

// AI personalities the room picker offers (js/ai/golfers.js ids) and the "rank" choice → skill.
export const AI_PERSONALITIES = [
  { id: 'any', name: 'Mixed' }, { id: 'carl', name: 'Careful Carl' }, { id: 'bertha', name: 'Big Bertha' },
  { id: 'banks', name: 'Banks' }, { id: 'lou', name: 'Lucky Lou' }, { id: 'pro', name: 'The Pro' },
  { id: 'professor', name: 'The Professor' }, { id: 'zoe', name: 'Zippy Zoe' }, { id: 'mags', name: 'Old Mags' },
];
export const AI_RANKS = [
  { name: 'Nobody', skill: 0.08 }, { name: 'Amateur', skill: 0.25 }, { name: 'Club Player', skill: 0.45 },
  { name: 'Semi-pro', skill: 0.63 }, { name: 'Pro', skill: 0.8 }, { name: 'Legend', skill: MAX_AI_SKILL },
];
export function rankForSkill(skill) {
  let best = AI_RANKS[0];
  for (const r of AI_RANKS) if (Math.abs(r.skill - skill) < Math.abs(best.skill - skill)) best = r;
  return best;
}
export const personalityName = id => (AI_PERSONALITIES.find(p => p.id === id) || AI_PERSONALITIES[0]).name;

// Every hole def by id (all courses), so a room can name holes from any course.
export function holeById(id) {
  for (const c of Object.values(COURSES)) for (const h of c.holes) if (h.id === id) return h;
  return null;
}

// Hole sets a host can pick for a course: "all", and runs of 3 (front / middle / back …) + random 3.
export function holeSets(courseId) {
  const c = COURSES[courseId] || COURSES.sky;
  const n = c.holes.length, out = [];
  for (let i = 0; i + 3 <= n; i += 3) out.push({ id: `${i}-3`, name: `Holes ${i + 1}–${i + 3}`, count: 3 });
  out.push({ id: 'r3', name: 'Random 3', count: 3 });
  if (n >= 9) out.push({ id: '0-9', name: n > 9 ? 'Front nine' : 'All nine', count: 9 });
  if (n >= 18) out.push({ id: '9-9', name: 'Back nine', count: 9 }, { id: '0-18', name: 'All 18', count: 18 });
  return out;
}

// → [{ id, par }] for a set id ("start-count" or "r3"); rand() picks for random sets.
export function holesFor(courseId, setId, rand = Math.random) {
  const c = COURSES[courseId] || COURSES.sky;
  let hs;
  if (setId === 'r3') {
    const pool = c.holes.slice();
    hs = [];
    while (hs.length < 3 && pool.length) hs.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  } else {
    const [a, k] = String(setId || '0-3').split('-').map(Number);
    hs = c.holes.slice(a || 0, (a || 0) + (k || 3));
    if (!hs.length) hs = c.holes.slice(0, 3);
  }
  return hs.map(h => ({ id: h.id, par: h.par }));
}

// The course object a Round plays for a room (hole defs in the room's order), or null if this
// build doesn't know one of the holes (an older client: "update the game").
export function courseForRoom(opts) {
  const defs = (opts.holes || []).map(h => holeById(h.id));
  if (!defs.length || defs.some(d => !d)) return null;
  const c = COURSES[opts.course];
  return { id: opts.course, name: opts.courseName || c?.name || 'Online', holes: defs };
}

// collide: ball hits (notes/ballhit.md) — the creator's setting becomes the room's rule.
export function defaultOpts({ theme = 'sky', course = 'sky', collide = true } = {}) {
  const c = COURSES[course] || COURSES.sky;
  return {
    name: '', public: false, course: c.id, courseName: c.name, holeSet: '0-3', holes: holesFor(c.id, '0-3'),
    theme, max: 4, helpers: { mode: 'fixed', n: 2 }, shotClock: 30,
    ai: { count: 2, personality: 'any', skill: 0.45 }, collide: !!collide,
  };
}

// Quick play: a public table of 4 that fills with ghost AIs; 3 random holes.
export function quickOpts({ theme = 'sky', collide = true } = {}) {
  const o = defaultOpts({ theme, collide });
  return { ...o, public: true, holeSet: 'r3', holes: holesFor(o.course, 'r3'), helpers: { mode: 'fixed', n: 1 }, ai: { count: 3, personality: 'any', skill: 0.4 } };
}

// The wire form of options (drops UI-only keys).
export function wireOpts(o) {
  const { holeSet, ...rest } = o;
  return rest;
}

// Helper counts for a round, by the room's helper mode:
//   off   → nothing (the tray is hidden)
//   fixed → everyone starts with n of each (minus what this seat already used, on a rejoin)
//   own   → your own saved inventory (the Store)
export function makeInventory(helpers, uses = {}, store = null) {
  if (helpers?.mode === 'own' && store) return store;
  const n = helpers?.mode === 'fixed' ? helpers.n | 0 : 0;
  const counts = Object.fromEntries(HELPERS.map(h => [h.id, Math.max(0, n - (uses?.[h.id] | 0))]));
  return {
    mode: helpers?.mode || 'off',
    helpers: () => counts,
    useHelper(id) { if ((counts[id] | 0) <= 0) return false; counts[id]--; return true; },
    giveHelper(id, k = 1) { counts[id] = (counts[id] | 0) + k; },
  };
}

export function helpersLabel(h) {
  if (!h || h.mode === 'off') return 'No helpers';
  if (h.mode === 'fixed') return `${h.n} of each helper`;
  return 'Own helpers';
}
// Ball hits: only a server that knows the rule echoes `collide: true` (older servers → pass through).
export const collideLabel = c => (c ? 'Battle (ball hits)' : 'Classic (no ball hits)');
export const clockLabel = s => (s ? `${s}s shot clock` : 'No shot clock');

// Share link for a room code (?room=CODE on this page).
export function shareLink(code) {
  if (typeof location === 'undefined') return `?room=${code}`;
  return `${location.origin}${location.pathname}?room=${code}`;
}
