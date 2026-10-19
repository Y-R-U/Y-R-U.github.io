// Difficulty curve probe: for every story level, the lowest uniform level at which a fixed reference
// squad (typical mid-roster: 2 tanks / 2 archers / 2 mages, commons + rares) wins >= half its fights.
// Rank = whatever that level needs (common max rank 4, so commons stop at L50), abilities at the rank cap.
// node tools/sim/curve.mjs [--seeds=8] [--hq=0.06]   → per map: required level start / median / max / boss
import { loadData } from '../../js/sim/data.js';
import { simulateBattle, autoSlots } from '../../js/sim/battle.js';
import { allLevels } from '../../js/sim/story.js';
import * as P from '../../js/sim/progression.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SEEDS = +(args.seeds || 8), HQ = +(args.hq ?? 0.06);
const D = await loadData();
const E = P.econ(D);
const SQUAD = (args.squad || 'bulwark,lancer,oracle,scrapper,gunner,patch').split(',');
const slotUnlocks = Object.entries(E.slotUnlocks || {}).map(([s, id]) => [+s, id]);
const levels = allLevels(D);
const idx = Object.fromEntries(levels.map((l, i) => [l.id, i]));
const slotsAt = (i) => slotUnlocks.reduce((s, [n, id]) => (idx[id] < i ? Math.max(s, n) : s), E.start?.slots || 2);

function squad(level, n) {
  const units = SQUAD.slice(0, n).map((def) => {
    const rar = D.units[def].rarity;
    let r = E.startRank[rar] ?? 0;
    const max = P.maxRank(E, rar);
    while (r < max && P.levelCap(E, r) < level) r++;
    const lv = Math.min(level, P.levelCap(E, r));
    const a = E.abilityLevel.capByRank[r];
    return { def, level: lv, rank: r, abilityLevels: { attack: a, passive: a, overdrive: a } };
  });
  return autoSlots(D, units);
}
const mods = { atk: HQ, hp: HQ, def: HQ };
function winRate(l, level, n) {
  let w = 0;
  for (let s = 1; s <= SEEDS; s++) w += simulateBattle({ data: D, player: { units: squad(level, n), mods }, enemyWaves: l.waves, seed: s * 7717 }).win ? 1 : 0;
  return w / SEEDS;
}
const req = {};
for (const [i, l] of levels.entries()) {
  const n = slotsAt(i);
  let lo = 1, hi = 66;
  if (winRate(l, 60, n) < 0.5) { req[l.id] = 99; continue; }
  while (lo < hi) { const mid = (lo + hi) >> 1; if (winRate(l, mid, n) >= 0.5) hi = mid; else lo = mid + 1; }
  req[l.id] = lo;
}
const byMap = {};
for (const l of levels) (byMap[l.mapId] ||= []).push(req[l.id]);
console.log('map | enemy lv | req start | median | max | boss | per level');
for (const [m, xs] of Object.entries(byMap)) {
  const ls = levels.filter((l) => l.mapId === m);
  const elv = ls.map((l) => Math.max(...l.waves.flatMap((w) => w.units.map((u) => u.level))));
  console.log(`${m} | ${elv[0]}-${elv[elv.length - 1]} | ${xs[0]} | ${xs.slice().sort((a, b) => a - b)[xs.length >> 1]} | ${Math.max(...xs)} | ${xs[xs.length - 1]} | ${xs.join(' ')}`);
}
