// Tower composure / Outrage meter (DESIGN §1.3). Plain-JSON state so it serialises with the rest of ATC.
import { TIERS, TIER_NAMES, OUTRAGE_CFG as C } from './rules.js';

export function newMeter() { return { v: 0, tier: 1, lvl: 0, lastEv: -1e9, frozenUntil: -1e9, scandals: 0 }; }

export function tierFor(v) {
  let t = 1;
  for (const x of TIERS) if (v >= x.min) t = x.tier;
  return t;
}

// Returns a list of {kind:'tier'|'scandal', ...} changes.
export function addOutrage(m, amount, t, gain = 1) {
  const out = [];
  if (!amount) return out;
  m.v = Math.max(0, Math.min(C.max, m.v + amount * (amount > 0 ? gain : 1)));
  if (amount > 0) m.lastEv = t;
  if (m.v >= C.max) {
    m.scandals++;
    m.v = C.scandalReset;
    m.frozenUntil = t + C.scandalFrozen;
    out.push({ kind: 'scandal' });
  }
  retier(m, out);
  return out;
}

// calmFlying: true when nobody this meter cares about is currently overriding the autopilot.
export function decayOutrage(m, dt, t, calmFlying) {
  const out = [];
  if (!calmFlying || t - m.lastEv < C.calmDelay || m.v <= 0) return out;
  m.v = Math.max(0, m.v - C.decayPerSec * dt);
  retier(m, out);
  return out;
}

function retier(m, out) {
  const lvl = Math.round(m.v / 5);
  if (lvl !== m.lvl) { m.lvl = lvl; out.push({ kind: 'level' }); }
  const raw = tierFor(m.v);
  let next = m.tier;
  if (raw > m.tier) next = raw;
  else if (raw < m.tier) {
    const min = TIERS.find((x) => x.tier === m.tier)?.min ?? 0;
    if (m.v < min - C.hysteresis) next = raw;
  }
  if (next !== m.tier) { out.push({ kind: 'tier', from: m.tier, to: next }); m.tier = next; }
}

export const tierName = (tier) => TIER_NAMES[Math.max(0, Math.min(3, tier - 1))];
