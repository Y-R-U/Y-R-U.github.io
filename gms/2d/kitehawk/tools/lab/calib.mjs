import { createDuel, INTENDED } from '../../js/modes/duel.js';
import { ACES, ACE_IDS } from '../../js/sim/ai.js';
const RUNS = Number(process.env.RUNS || 30);
const TARGET = 0.60;
const KS = [0.50, 0.60, 0.70, 0.80, 0.90, 0.96];
const HPS = [140, 180, 220, 280, 340];
function win(id, runs, seed0 = 4100) {
  const it = INTENDED[ACES[id].act];
  let w = 0;
  for (let i = 0; i < runs; i++) {
    const r = createDuel({}, { ace: id, airframe: it.airframe, gun: it.gun, seed: seed0 + i, k: 0.70 }).run();
    if (r.winner === 'player') w++;
  }
  return w / runs;
}
const only = process.argv[2] ? process.argv[2].split(',') : ACE_IDS;
const out = {};
for (const id of only) {
  const p = ACES[id];
  const k0 = p.k, hp0 = p.hp;
  let best = null;
  for (const hp of HPS) {
    for (const k of KS) {
      p.k = k; p.hp = hp;
      const w = win(id, RUNS);
      const err = Math.abs(w - TARGET) + 0.02 * Math.abs(k - k0) + 0.0002 * Math.abs(hp - hp0);
      if (!best || err < best.err) best = { k, hp, w, err };
    }
  }
  p.k = best.k; p.hp = best.hp;
  const conf = win(id, RUNS * 3, 9500);
  out[id] = { k: best.k, hp: best.hp, coarse: +best.w.toFixed(2), confirm: +conf.toFixed(3), wasK: k0, wasHp: hp0 };
  console.log(`${id.padEnd(4)} k ${k0.toFixed(2)}->${best.k.toFixed(2)}  hp ${String(hp0).padStart(3)}->${String(best.hp).padStart(3)}  win ${(conf*100).toFixed(0)}%`);
}
console.log(JSON.stringify(out));
