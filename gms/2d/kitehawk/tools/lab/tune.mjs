/**
 * Register T23. The ace dials are not guessed twice: DESIGN §5.3's `k` is kept
 * (it is the ace's CHARACTER) and the single continuous lever — how tough his
 * machine is — is bisected until the intended-tier loadout wins the middle of
 * C4's 55-70% band. One monotone lever, six evaluations, so the answer is not a
 * lucky point in a noisy grid.
 */
import { createDuel, INTENDED } from '../../js/modes/duel.js';
import { ACES, ACE_IDS } from '../../js/sim/ai.js';
const RUNS = Number(process.env.RUNS || 60);
const TARGET = Number(process.env.TARGET || 0.62);
function win(id, runs, seed0) {
  const it = INTENDED[ACES[id].act];
  let w = 0, l = 0;
  for (let i = 0; i < runs; i++) {
    const r = createDuel({}, { ace: id, airframe: it.airframe, gun: it.gun, seed: seed0 + i, k: 0.70,
                               swap: (i & 1) === 1 }).run();
    if (r.winner === 'player') w++; else if (r.winner === 'ace') l++;
  }
  return w / Math.max(1, w + l);
}
const base = {}; for (const id of ACE_IDS) base[id] = { hp: ACES[id].hp || 220, wingHp: ACES[id].wingHp || 0 };
const only = process.argv[2] ? process.argv[2].split(',') : ACE_IDS;
const out = {};
for (const id of only) {
  const p = ACES[id], b = base[id];
  let lo = 0.25, hi = 3.2;                        // toughness multiplier
  const set = (t) => { p.hp = Math.round(b.hp * t); if (b.wingHp) p.wingHp = Math.round(b.wingHp * t); };
  let w = 0, t = 1;
  for (let it = 0; it < 6; it++) {
    t = (lo + hi) / 2; set(t);
    w = win(id, RUNS, 4100 + it * 977);
    if (w > TARGET) lo = t; else hi = t;          // tougher ace -> player wins less
  }
  set(t);
  const conf = win(id, RUNS * 2, 31000);
  out[id] = { hp: p.hp, wingHp: p.wingHp || undefined, tough: +t.toFixed(2), win: +conf.toFixed(3) };
  console.log(`${id.padEnd(4)} hp ${String(b.hp).padStart(3)}->${String(p.hp).padStart(3)}${b.wingHp ? ` wing ${b.wingHp}->${p.wingHp}` : ''}  win ${(conf * 100).toFixed(0)}%`);
}
console.log('TUNED ' + JSON.stringify(out));
