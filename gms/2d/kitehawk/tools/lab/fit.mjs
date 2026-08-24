/**
 * Register T23, second pass. Bisection on a noisy win rate walks off — six
 * sequential decisions each taken on one +-6% sample, and the answer lands
 * wherever the noise pointed. This evaluates THREE toughness points at high n,
 * fits win-rate against log(toughness), and solves once. Same number of duels,
 * an answer that does not depend on the order the coin came up.
 */
import { createDuel, INTENDED } from '../../js/modes/duel.js';
import { ACES, ACE_IDS } from '../../js/sim/ai.js';
const RUNS = Number(process.env.RUNS || 110);
const TARGET = Number(process.env.TARGET || 0.62);
function win(id, runs, seed0) {
  const it = INTENDED[ACES[id].act];
  let w = 0, l = 0;
  for (let i = 0; i < runs; i++) {
    const r = createDuel({}, { ace: id, airframe: it.airframe, gun: it.gun, seed: seed0 + i,
                               k: 0.70, swap: (i & 1) === 1 }).run();
    if (r.winner === 'player') w++; else if (r.winner === 'ace') l++;
  }
  return w / Math.max(1, w + l);
}
const only = process.argv[2] ? process.argv[2].split(',') : ACE_IDS.filter(a => a !== 'A12');
const out = {};
for (const id of only) {
  const p = ACES[id], b = p.hp, bw = p.wingHp || 0;
  const set = (t) => { p.hp = Math.round(b * t); if (bw) p.wingHp = Math.round(bw * t); };
  const ts = [0.55, 1.0, 1.8], ws = [];
  for (const t of ts) { set(t); ws.push(win(id, RUNS, 6100 + Math.round(t * 100))); }
  // least squares of w against ln t
  const xs = ts.map(Math.log);
  const mx = xs.reduce((a, c) => a + c) / 3, mw = ws.reduce((a, c) => a + c) / 3;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < 3; i++) { sxy += (xs[i] - mx) * (ws[i] - mw); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx > 1e-9 ? sxy / sxx : 0;
  let t = slope < -0.02 ? Math.exp(mx + (TARGET - mw) / slope) : 1;
  t = Math.max(0.35, Math.min(3.0, t));
  set(t);
  const conf = win(id, RUNS * 2, 52000);
  out[id] = { hp: p.hp, wingHp: p.wingHp || undefined, tough: +t.toFixed(2), win: +conf.toFixed(3),
              probe: ws.map(x => +x.toFixed(2)) };
  console.log(`${id.padEnd(4)} probe ${ws.map(x => (100 * x).toFixed(0) + '%').join(' ')}  -> hp ${p.hp}${bw ? '/' + p.wingHp : ''}  win ${(conf * 100).toFixed(0)}%`);
}
console.log('FIT ' + JSON.stringify(out));
