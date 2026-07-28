// events.js — limited-time contracts. The rotation is derived from the date so
// every player on every device sees the same event at the same time, with no
// server involved.

import { S, save, unlockSkin, addSubs } from './save.js';

const EPOCH = Date.UTC(2026, 0, 5, 0, 0, 0);   // a Monday
export const SLOT_MS = 3 * 24 * 3600 * 1000;   // each event runs three days

export const EVENTS = [
  {
    id: 'glacier', name: 'GLACIER RUSH', theme: 'frost', icon: '❄️',
    blurb: 'A frozen moon, cracked open and quiet. Everything is brittle — it comes apart faster than it should.',
    rules: ['Objects are one tier easier to swallow', 'Hype drains twice as fast', '110 seconds'],
    time: 110, tierEase: 1, hypeDecayMul: 2.0, hazards: 0, rivals: 2, radius: 96,
    reward: { skin: 'frost' },
  },
  {
    id: 'cinder', name: 'CINDER RUN', theme: 'ember', icon: '🌋',
    blurb: 'The mantle is already coming up. Clear what you can before the crust does it for you.',
    rules: ['Everything is worth double mass', 'Defence grid is fully active', '95 seconds'],
    time: 95, massMul: 2, hazards: 3, rivals: 3, radius: 104,
    reward: { skin: 'ember' },
  },
  {
    id: 'loud', name: 'THE LOUD QUARTER', theme: 'neon', icon: '🎆',
    blurb: 'A pleasure district that never signed a clearance waiver. The audience is enormous and extremely impatient.',
    rules: ['Hype gains ×2.5', 'Idle drain starts after 1.5s', 'Four rival streamers'],
    time: 120, hypeGainMul: 2.5, idleAfter: 1.5, hazards: 1, rivals: 4, radius: 112,
    reward: { subs: 900 },
  },
  {
    id: 'swarm', name: 'RIVAL SWARM', theme: 'hive', icon: '🛰',
    blurb: 'Six feeds, one planet, no rules. The Guild is calling it a "collaboration".',
    rules: ['Six rival clearers', 'Rivals grow fast', 'Eat them or be eaten'],
    time: 130, rivals: 6, rivalGrowth: 1.5, hazards: 1, radius: 120,
    reward: { subs: 1200 },
  },
  {
    id: 'blackout', name: 'BLACKOUT CONTRACT', theme: 'verge', icon: '🌑',
    blurb: 'No audience feed, no telemetry. The Guild wants this one clean and unrecorded. Pay is good.',
    rules: ['Hype is locked at zero — mass only', 'No hazards, no rivals', 'Triple SUBS payout'],
    time: 150, noHype: true, hazards: 0, rivals: 0, subsMul: 3, radius: 130,
    reward: { subs: 1500 },
  },
  {
    id: 'garden', name: 'GARDEN CLEARANCE', theme: 'sanctum', icon: '🌿',
    blurb: 'A seed world, three centuries from anything that could argue. Viewers love a garden.',
    rules: ['Dense sector, no roads', 'Living things pay triple hype', 'No time limit — one life'],
    time: 0, roads: 'none', density: 1.5, moverHypeMul: 3, hazards: 2, rivals: 2, radius: 118,
    reward: { subs: 800 },
  },
];

export function slotIndex(now) {
  return Math.floor(((now == null ? Date.now() : now) - EPOCH) / SLOT_MS);
}

export function currentEvent(now) {
  const i = slotIndex(now);
  const ev = EVENTS[((i % EVENTS.length) + EVENTS.length) % EVENTS.length];
  const start = EPOCH + i * SLOT_MS;
  return { ev, start, end: start + SLOT_MS, index: i };
}

export function nextEvent(now) {
  const i = slotIndex(now) + 1;
  const ev = EVENTS[((i % EVENTS.length) + EVENTS.length) % EVENTS.length];
  return { ev, start: EPOCH + i * SLOT_MS, index: i };
}

export function timeLeft(now) {
  const c = currentEvent(now);
  return c.end - (now == null ? Date.now() : now);
}

export function fmtCountdown(ms) {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

/** Score milestones are relative to the event's own par, so every event scales. */
export function milestones(ev) {
  const par = (ev.time || 120) * 260;
  return [
    { at: Math.round(par * 0.5), subs: 150, label: 'Signed on' },
    { at: Math.round(par * 1.2), subs: 300, label: 'Featured' },
    { at: Math.round(par * 2.4), subs: 500, label: 'Front page' },
    { at: Math.round(par * 4.5), subs: 0, label: 'Event reward', reward: true },
  ];
}

export function eventRecord(id) {
  const s = S();
  return (s.events[id] ||= { best: 0, claimed: [] });
}

/** Award anything newly earned. Returns a list of human-readable strings. */
export function claim(ev, score) {
  const rec = eventRecord(ev.id);
  const out = [];
  if (score > rec.best) rec.best = score;
  for (const m of milestones(ev)) {
    if (rec.best < m.at) continue;
    if (rec.claimed.includes(m.at)) continue;
    rec.claimed.push(m.at);
    if (m.reward) {
      if (ev.reward.skin) {
        if (unlockSkin(ev.reward.skin)) out.push('New hole skin unlocked');
        else { addSubs(600); out.push('+600 SUBS (skin already owned)'); }
      } else if (ev.reward.subs) { addSubs(ev.reward.subs); out.push('+' + ev.reward.subs + ' SUBS'); }
    } else if (m.subs) { addSubs(m.subs); out.push('+' + m.subs + ' SUBS — ' + m.label); }
  }
  save();
  return out;
}

/** Turn an event into a level spec the run loop understands. */
export function eventSpec(ev) {
  return {
    id: 'ev_' + ev.id,
    kind: 'event',
    name: ev.name,
    theme: ev.theme,
    act: ({ frost: 0, ember: 2, neon: 2, hive: 2, verge: 4, sanctum: 3 })[ev.theme] ?? 2,
    seed: (ev.id.charCodeAt(0) * 7919 + slotIndex() * 104729) >>> 0,
    radius: ev.radius || 110,
    time: ev.time || 0,
    target: 0,
    rivals: ev.rivals || 0,
    hazards: ev.hazards || 0,
    density: ev.density || 1,
    roads: ev.roads || 'normal',
    maxTier: 7,
    landmarks: 1,
    ev,
  };
}
