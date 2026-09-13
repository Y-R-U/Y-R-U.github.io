// Burn / slow / stun / shock. One flat record per enemy, allocated once with the
// enemy and cleared on reuse - statuses are the most common thing in the game to
// touch 400 bodies with, so they must never allocate and must skip fast.
// LANE B-core owns this file.

import { applyDamage } from './damage.js';

export const S_BURN = 1, S_SLOW = 2, S_STUN = 4, S_SHOCK = 8;

const DT = 1 / 60;

export function newStatus() {
  return { f: 0, burnT: 0, burnDps: 0, burnAcc: 0, burnSrc: null,
           slowT: 0, slowMul: 1, stunT: 0, shockT: 0, shockDps: 0, shockAcc: 0 };
}

export function clearStatus(s) {
  s.f = 0; s.burnT = 0; s.burnDps = 0; s.burnAcc = 0; s.burnSrc = null;
  s.slowT = 0; s.slowMul = 1; s.stunT = 0; s.shockT = 0; s.shockDps = 0; s.shockAcc = 0;
}

// Refresh semantics: the stronger effect wins on magnitude, the longer wins on
// duration. Stacking durations lets one weapon trivially perma-lock the horde.
export function applyBurn(world, e, dps, dur, weaponId) {
  const s = e.statuses; if (!s) return;
  if (dps > s.burnDps) { s.burnDps = dps; s.burnSrc = weaponId || s.burnSrc; }
  if (dur > s.burnT) s.burnT = dur;
  s.f |= S_BURN;
}

export function applySlow(world, e, mul, dur) {
  const s = e.statuses; if (!s) return;
  if (mul < s.slowMul || s.slowT <= 0) s.slowMul = mul;
  if (dur > s.slowT) s.slowT = dur;
  s.f |= S_SLOW;
}

export function applyStun(world, e, dur) {
  const s = e.statuses; if (!s) return;
  if (dur > s.stunT) s.stunT = dur;
  s.f |= S_STUN;
}

export function applyShock(world, e, dps, dur) {
  const s = e.statuses; if (!s) return;
  if (dps > s.shockDps) s.shockDps = dps;
  if (dur > s.shockT) s.shockT = dur;
  s.f |= S_SHOCK;
}

export function slowFactor(e) {
  const s = e.statuses;
  return s && s.slowT > 0 ? s.slowMul : 1;
}

export function isStunned(e) {
  const s = e.statuses;
  return !!(s && s.stunT > 0);
}

export function hasStatus(e, bit) {
  const s = e.statuses;
  return !!(s && (s.f & bit));
}

function tickOne(world, e) {
  const s = e.statuses;
  if (!s || s.f === 0) return;

  if (s.burnT > 0) {
    s.burnT -= DT;
    s.burnAcc += s.burnDps * DT;
    // Bank fractional damage and spend it in whole points: 400 enemies each
    // taking 0.08 damage a tick is 24000 pointless events a second.
    if (s.burnAcc >= 1) {
      const d = Math.floor(s.burnAcc);
      s.burnAcc -= d;
      applyDamage(world, e, d, { source: 'burn', weaponId: s.burnSrc, noCrit: true, ignoreArmour: true, quiet: true });
    }
    if (s.burnT <= 0) { s.burnT = 0; s.burnDps = 0; s.burnAcc = 0; s.f &= ~S_BURN; }
  }

  if (s.shockT > 0) {
    s.shockT -= DT;
    s.shockAcc += s.shockDps * DT;
    if (s.shockAcc >= 1) {
      const d = Math.floor(s.shockAcc);
      s.shockAcc -= d;
      applyDamage(world, e, d, { source: 'shock', noCrit: true, quiet: true });
    }
    if (s.shockT <= 0) { s.shockT = 0; s.shockDps = 0; s.shockAcc = 0; s.f &= ~S_SHOCK; }
  }

  if (s.slowT > 0) { s.slowT -= DT; if (s.slowT <= 0) { s.slowT = 0; s.slowMul = 1; s.f &= ~S_SLOW; } }
  if (s.stunT > 0) { s.stunT -= DT; if (s.stunT <= 0) { s.stunT = 0; s.f &= ~S_STUN; } }
}

export function stepStatuses(world) {
  world.enemies.each((e) => { if (!e.dying) tickOne(world, e); });
}
