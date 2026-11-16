import { CONFIG } from '../config.js';

// Mirrors stepSteals in js/sim/sim.js: what would happen if these two crowds touched right now.
// 'ally' never trade (teammates, two hordes) · 'even' nobody takes anyone (dead zone, equal, spawn protection)
// 'danger' o can absorb me · 'prey' I can absorb o.
export function threatOf(me, o, mode, dz = CONFIG.SIM.stealDeadzone) {
  if (mode === 'teams' ? me.team === o.team : mode === 'infection' && me.horde && o.horde) return 'ally';
  if (!me.alive || !o.alive || me.protect > 0 || o.protect > 0 || me.count === o.count) return 'even';
  const big = Math.max(me.count, o.count), small = Math.max(1e-9, Math.min(me.count, o.count));
  if (big / small < 1 + dz) return 'even';
  return o.count > me.count ? 'danger' : 'prey';
}

// The leader only wears the crown when it leads outright: a tie (everyone on 4 at kick-off) has no king.
export function outrightLeader(state, ld = state.leader) {
  const L = ld != null && ld >= 0 ? state.crowds[ld] : null;
  if (!L || !L.alive) return -1;
  const ts = (c) => (state.teams && state.teams[c.team] ? state.teams[c.team].score : 0);
  const key = state.mode === 'teams' ? (c) => [ts(c), c.count]
    : state.mode === 'lcs' ? (c) => [c.out ? 0 : 1, c.out ? c.score : c.count]
    : state.mode === 'koth' || state.mode === 'infection' ? (c) => [c.score, c.count]
    : (c) => [c.count];
  const kl = key(L);
  for (const c of state.crowds) {
    if (c === L) continue;
    const k = key(c);
    if (k.every((v, i) => v === kl[i])) return -1;
  }
  return ld;
}
