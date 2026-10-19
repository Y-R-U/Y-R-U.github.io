// Rotating special ops. day = integer days since epoch (local virtual clock injected by game_state).
export const dayOfWeek = (day) => (day + 4) % 7; // 0 = Sunday (JS getDay convention)

export function isActive(ev, day) {
  const r = ev.rotation || {};
  if (r.days) return r.days.includes(dayOfWeek(day));
  if (r.everyDays) return Math.floor(day) % r.everyDays === (r.offset || 0) % r.everyDays || r.everyDays === 1;
  if (r.weekly) return true;
  return true;
}
export function activeEvents(data, day) {
  return Object.values(data.events || {}).filter((e) => isActive(e, day));
}
// Raid rewards by damage dealt to the boss.
export function raidRewards(ev, damage) {
  let best = null;
  for (const t of ev.raid?.rewardsByDamage || []) if (damage >= t.damage) best = t.rewards;
  return best || {};
}
