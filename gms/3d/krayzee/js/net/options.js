// Room options from data/modes.js: the defaults a room type sets, the keys it fixes, and what the host
// may still change. The server (settings.go) only checks shape and range; the game applies these.
import { ROOM_TYPES, HOST_OPTIONS, AIRCRAFT_CLASSES } from '../../data/modes.js';
import { RANKS } from '../../data/ranks.js';

export const TYPE_IDS = Object.keys(ROOM_TYPES);
const rankIdx = (id) => Math.max(0, RANKS.findIndex((r) => r.id === id));

export function defaultsFor(type) {
  const T = ROOM_TYPES[type] || ROOM_TYPES.court;
  return {
    type: ROOM_TYPES[type] ? type : 'court',
    protection: T.protection,
    partialStart: 100,
    traffic: T.traffic,
    aircraft: Array.isArray(T.classes) ? [...T.classes] : [],
    maxPlayers: T.maxPlayers || HOST_OPTIONS.maxPlayers.default,
    voices: 'first_come',
    runway: 'wind',
    minutes: T.minutes ?? 0,
    target: T.target || 5000,
    outrageGain: T.outrageGain || 1,
    decrees: [],
    ranked: false,
  };
}

const FIX_KEY = { protection: 'protection', traffic: 'traffic', minutes: 'minutes', classes: 'aircraft', maxPlayers: 'maxPlayers' };

export function fixedKeys(type) { return (ROOM_TYPES[type]?.fixed || []).map((k) => FIX_KEY[k] || k); }

// Applies the type's fixed values and the host's rank gates (on trust, DECISIONS D5).
export function normalise(set, hostRank = 'baron') {
  const d = defaultsFor(set?.type);
  const s = { ...d, ...(set || {}) };
  s.type = d.type;
  for (const k of fixedKeys(s.type)) s[k] = d[k];
  const H = HOST_OPTIONS;
  if (!H.protection.includes(s.protection)) s.protection = d.protection;
  if (!H.partialStartPct.includes(s.partialStart)) s.partialStart = 100;
  if (!H.traffic.includes(s.traffic)) s.traffic = d.traffic;
  if (!H.runway.includes(s.runway)) s.runway = 'wind';
  if (!H.minutes.includes(s.minutes)) s.minutes = d.minutes;
  if (!H.target.includes(s.target)) s.target = d.target;
  if (!H.outrageGain.includes(s.outrageGain)) s.outrageGain = 1;
  if (!H.voices.includes(s.voices)) s.voices = 'first_come';
  s.maxPlayers = Math.max(H.maxPlayers.min, Math.min(H.maxPlayers.max, s.maxPlayers | 0 || H.maxPlayers.default));
  if (s.type === 'joust') s.maxPlayers = 2;
  s.aircraft = (s.aircraft || []).filter((a) => AIRCRAFT_CLASSES.includes(a) || /^[a-z0-9_-]{1,24}$/.test(a));
  s.decrees = rankIdx(hostRank) >= rankIdx(H.decreeMinRank) ? (s.decrees || []).filter((x) => x in H.decrees) : [];
  if (rankIdx(hostRank) < rankIdx(H.hostRankedMinRank)) s.ranked = false;
  return s;
}

export function canDecree(rank) { return rankIdx(rank) >= rankIdx(HOST_OPTIONS.decreeMinRank); }
export function canRanked(rank) { return rankIdx(rank) >= rankIdx(HOST_OPTIONS.hostRankedMinRank); }

export function summary(set) {
  const T = ROOM_TYPES[set.type] || ROOM_TYPES.court;
  const prot = { rubber: 'impossiRubber', partial: `Partial ${set.partialStart}%`, realistic: 'Realistic' }[set.protection] || set.protection;
  const len = set.type === 'joust' ? `Best of ${T.rounds}` : set.type === 'coronation' ? `First to ${set.target.toLocaleString('en')}` : set.minutes ? `${set.minutes} min` : 'No clock';
  return { name: T.name, blurb: T.blurb, parts: [prot, `${set.traffic} traffic`, len, `${set.maxPlayers} max`] };
}

export { ROOM_TYPES, HOST_OPTIONS, AIRCRAFT_CLASSES };
