// The events save. It follows the hub's dailies rule (games/CLAUDE.md): days are UTC date
// strings and "already today" is `last >= today`. Only FINISHED battles are ever recorded —
// an in-progress match never enters this state, so it never syncs.
//
//   { v: 1, seenDay: 'YYYY-MM-DD', ev: { [eventId]: { b: [[battleId, pts, src, at]], rolls?, open?, ... } } }
//
// `b` is kept in play order (at, then id): for Vines & Ladders it IS the list of turns.

import { activeEvents, parseEventId, utcDay } from './calendar.js?v=20261015-evf';
import { pointsFor, counts, counted } from './points.js?v=20261015-evf';
import { CAMPAIGN_CAP } from './calendar.js?v=20261015-evf';
import { fresh as freshReveal, CELLS } from './reveal.js';
import { towerCounted } from './tower.js?v=20261015-evf';

const KEEP_ENDED = 7 * 86400000;

export const fresh = () => ({ v: 1, seenDay: '', ev: {} });

const REVEAL_ONLY = ['open', 'guesses', 'solved', 'bonus'];

/**
 * Events whose definition is gone (the old Pass events SCROLLS & ROPES, MONTHLY PICTURE) are dropped,
 * and so are picture fields on a STORY or TOWER state (an old adopt() wrote them there, with NaN).
 */
export function load(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const ev = {};
  if (s.ev && typeof s.ev === 'object') {
    for (const [id, e] of Object.entries(s.ev)) {
      const kind = parseEventId(id)?.def.kind;
      if (!kind || !e || typeof e !== 'object') continue;
      if ((kind === 'story' || kind === 'tower') && REVEAL_ONLY.some((k) => k in e)) {
        ev[id] = { ...e };
        for (const k of REVEAL_ONLY) delete ev[id][k];
      } else ev[id] = e;
    }
  }
  return { v: 1, seenDay: typeof s.seenDay === 'string' ? s.seenDay : '', ev };
}

const BASE = { reveal: freshReveal, vines: () => ({ rolls: 0 }), tower: () => ({ t: [], claimed: [] }), story: () => ({ seen: 0, read: 0, claimed: [] }) };

export function evState(state, eventId) {
  const kind = parseEventId(eventId)?.def.kind;
  const base = (BASE[kind] || BASE.vines)();
  return { b: [], ...base, ...(state.ev[eventId] || {}) };
}

export const pointsOf = (ev) => ev.b.reduce((s, x) => s + x[1], 0);
/** The ordered per-battle points — a Vines & Ladders player's turns. */
export const turnPoints = (ev) => ev.b.map((x) => x[1]);
const order = (a, b) => a[3] - b[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const utc = (ms) => new Date(ms).toISOString().slice(0, 10);

function campaignAllowed(list, battle, cap) {
  const camp = list.filter((x) => x[2] === 'campaign');
  if (camp.filter((x) => utc(x[3]) === utc(battle.at)).length >= cap.perDay) return false;
  return camp.every((x) => Math.abs(battle.at - x[3]) >= cap.gapMs);
}

/** `last >= today`, never `===`: a save from a device whose clock runs ahead is still "today". */
export const seenToday = (state, day) => state.seenDay >= day;
export const markSeen = (state, day) => (seenToday(state, day) ? state : { ...state, seenDay: day });

/**
 * Bank one finished battle into every running event it counts for, Pass events included: a
 * Pass holder whose entitlement is briefly unknown must not lose the fight. The Pass gates
 * what is shown, paid and synced, never what is banked.
 */
export function recordBattle(state, battle, { cap = CAMPAIGN_CAP } = {}) {
  state = load(state);
  const ev = { ...state.ev };
  const pts = pointsFor(battle);
  for (const a of activeEvents(battle.at, { pass: true })) {
    if (!counts(a.def, a.win, battle)) continue;
    const cur = evState(state, a.id);
    if (cur.b.some((x) => x[0] === battle.id)) continue;
    if (battle.src === 'campaign' && !campaignAllowed(cur.b, battle, cap)) continue;
    ev[a.id] = { ...cur, b: [...cur.b, [battle.id, pts, battle.src, battle.at]].sort(order) };
  }
  return { ...state, ev };
}

export const setEv = (state, eventId, ev) => ({ ...state, ev: { ...state.ev, [eventId]: ev } });

/**
 * The rows a sync sends: the server takes nothing older than `since` (its previous sync less a
 * slack, or a day back), so a long month of fights is never sent whole. Newest `max` at most.
 */
export function syncRows(rows, since, max = 400) {
  const keep = rows.filter((r) => r[r.length === 3 ? 2 : 3] >= since);
  return keep.slice(-max);
}

/** One finished tower fight, `[id, won, at]`, into THE TOWER's ordered W/L list. */
export function recordTower(state, eventId, row) {
  const p = parseEventId(eventId);
  if (!p || p.def.kind !== 'tower') return state;
  const cur = evState(state, eventId);
  if (cur.t.some((r) => r[0] === row[0])) return state;
  return setEv(state, eventId, { ...cur, t: towerCounted(p.win, [...cur.t, row]) });
}

/** Drop events that ended more than a week before `now`. */
export function prune(state, now) {
  const ev = {};
  for (const [id, e] of Object.entries(state.ev)) {
    const p = parseEventId(id);
    if (p && p.win.end + KEEP_ENDED > now) ev[id] = e;
  }
  return { ...state, ev };
}

/**
 * Two devices' saves -> one. Battles union by id in play order, rolls take the max (never past
 * what the merged battles bank — dice depend on the roll index only), reveal squares union and
 * are then clamped to what the merged points can pay for, so two devices spending the same
 * points offline cannot add up to more squares than were earned.
 */
export function merge(a, b, { cap = CAMPAIGN_CAP } = {}) {
  a = load(a); b = load(b);
  const out = { v: 1, seenDay: a.seenDay >= b.seenDay ? a.seenDay : b.seenDay, ev: {} };
  for (const id of new Set([...Object.keys(a.ev), ...Object.keys(b.ev)])) {
    const x = evState(a, id), y = evState(b, id);
    const ids = new Set(x.b.map((r) => r[0]));
    const m = { ...x, b: capped(id, [...x.b, ...y.b.filter((r) => !ids.has(r[0]))].sort(order), cap) };
    if ('rolls' in x || 'rolls' in y) m.rolls = Math.min(pointsOf(m), Math.max(x.rolls | 0, y.rolls | 0));
    if (parseEventId(id).def.kind === 'reveal') {
      const def = parseEventId(id).def, arr = (v) => (Array.isArray(v) ? v : []);
      const cap = Math.min(CELLS, Math.floor(pointsOf(m) / def.cost));
      const xo = arr(x.open), xg = arr(x.guesses);
      const open = [...xo, ...arr(y.open).filter((c) => !xo.includes(c))];
      m.open = open.slice(0, cap);
      m.guesses = [...xg, ...arr(y.guesses).filter((g) => !xg.includes(g))];
      m.solved = !!(x.solved || y.solved);
      m.bonus = Math.max(x.bonus | 0, y.bonus | 0);
      m.claimed = [...new Set([...arr(x.claimed), ...arr(y.claimed)])];
    }
    if (Array.isArray(x.t)) {
      const tids = new Set(x.t.map((r) => r[0]));
      m.t = towerCounted(parseEventId(id).win, [...x.t, ...y.t.filter((r) => !tids.has(r[0]))]);
    }
    if ('seen' in x || 'seen' in y) { m.seen = Math.max(x.seen | 0, y.seen | 0); m.read = Math.max(x.read | 0, y.read | 0); }
    if (!('open' in m) && (x.claimed || y.claimed)) m.claimed = [...new Set([...(x.claimed || []), ...(y.claimed || [])])];
    out.ev[id] = m;
  }
  return out;
}

/** The rows `counted()` keeps: two devices' 10 campaign fights a day are still 10, 60 s apart. */
function capped(eventId, rows, cap) {
  const p = parseEventId(eventId);
  if (!p) return rows;
  const keep = new Set(counted(p.def, p.win, rows.map((r) => ({ id: r[0], at: r[3], src: r[2], won: r[1] === 3, oppDmg: r[1] === 2 ? 1 : 0 })), cap).map((b) => b.id));
  return rows.filter((r) => keep.has(r[0]));
}

/** The claims that paid ink: the reveal's guess bonus, the tower's TOP, the story's end. */
const INK_CLAIMS = ['bonus', 'top', 'end'];

/**
 * This device's events carried into a save adopted from the cloud. A reward that paid INK
 * stays claimed only if the adopted save had claimed it too — otherwise its ink is not in
 * that save, and the game pays it again there. `cap` is the campaign cap re-applied to the
 * union (the game passes PAID_CAP: a not-yet-known entitlement must never trim fights already
 * banked; the server's cap is the authority online).
 */
export function adoptMerge(cloud, local, { cap = CAMPAIGN_CAP } = {}) {
  const c = load(cloud), out = merge(local, cloud, { cap });
  for (const [id, e] of Object.entries(out.ev)) {
    if (!Array.isArray(e.claimed)) continue;
    const had = c.ev[id]?.claimed || [];
    e.claimed = e.claimed.filter((r) => !INK_CLAIMS.includes(r) || had.includes(r));
  }
  return out;
}

export { utcDay };
