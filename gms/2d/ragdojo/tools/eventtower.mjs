#!/usr/bin/env node
/**
 * THE TOWER's balance, in node: every floor fought by the autoplay player (skill 0.62, the
 * "decent player" the campaign sim uses) at four saves, from a fresh white belt to a maxed one.
 * The opponent is scaled to the player's own body and kit, so the curve should look the same
 * for all four.
 *
 *   node tools/eventtower.mjs [--runs=40] [--floors=1,6,12]
 *   node tools/eventtower.mjs --check     # the gate: floor 1 >= 85% for every save; mid + maxed: floor 2 >= 85%,
 *                                         # floors 10-11 together 20-75%, the top 10-65%; no timeouts or non-finite fights
 *   node tools/eventtower.mjs --mins      # also the shortest fight per cell (TOWER_CAP.gapMs comes from it)
 *   node tools/eventtower.mjs --climb     # a whole week's climb: fights needed to reach the TOP
 *   node tools/eventtower.mjs --falsify   # x3 too hard, x0.16 too soft, the old easy curve: all must fail
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--falsify')) {
  let red = 0;
  // x3 too hard, x0.16 too soft, and the pre-2026-10-15 curve (Aaron climbed all 12 without a loss).
  const runs = [['difficulty x3', { TOWER_M: '3' }], ['difficulty x0.16', { TOWER_M: '0.16' }],
    ['the old easy curve', { TOWER_KNOBS: '{"hp1":2.2,"hpP":0.75,"dmg1":1.7,"dmgP":0.75,"gx":0.41,"m":1}' }]];
  for (const [what, env] of runs) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--check', '--runs=16', '--saves=fresh,mid,maxed'], { env: { ...process.env, ...env }, encoding: 'utf8' });
    const ok = r.status !== 0 && /FAIL/.test(r.stdout);
    if (ok) red++;
    console.log(`${ok ? 'RED  ' : 'GREEN'} ${what}`);
  }
  console.log(`falsify: ${red}/${runs.length}`);
  process.exit(red === runs.length ? 0 : 1);
}
const noopCtx = new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const { TowerMatch, KNOBS } = await import('../js/events/towerfight.js');
if (process.env.TOWER_M) KNOBS.m *= +process.env.TOWER_M;
if (process.env.TOWER_KNOBS) Object.assign(KNOBS, JSON.parse(process.env.TOWER_KNOBS)); // tuning: '{"hp1":4}'
const { FLOORS, nextFloor } = await import('../js/events/tower.js');
const { MOVES } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const RUNS = +(args.runs || (args.check ? 30 : 40));
const DT = 1 / 120;

function saveAt(perk, nMoves, mvLv, level) {
  const s = DEFAULT();
  s.level = level;
  for (const p of ['hp', 'atk', 'spd', 'jump', 'armor', 'crit', 'combo', 'stiff', 'drain', 'wind']) s.perks[p] = perk;
  for (const m of MOVES.slice(0, nMoves)) s.moves[m.id] = { owned: true, power: mvLv, cd: mvLv };
  s.seen = { punch: true, power: true };
  return s;
}
const SAVES = {
  fresh: saveAt(0, 1, 0, 0),
  early: saveAt(2, 3, 1, 10),
  mid: saveAt(5, 6, 3, 25),
  maxed: saveAt(10, 8, 7, 44),
};

function fight(floor, save) {
  const m = new TowerMatch({ floor, save, autoplay: true, onEnd: () => {} });
  let t = 0;
  while (!m.over && t < 150) { m.update(DT, null); t += DT; }
  const finite = [m.player, ...m.enemies].every((f) => Number.isFinite(f.x) && Number.isFinite(f.y));
  return { r: m.over ? m.result : 'timeout', t, finite };
}

if (args.saves) for (const k of Object.keys(SAVES)) if (!String(args.saves).split(',').includes(k)) delete SAVES[k];
const floors = args.floors ? String(args.floors).split(',').map(Number) : Array.from({ length: FLOORS }, (_, i) => i + 1);
let bad = 0;
const rate = {}, shortest = { t: Infinity };
if (!args.climb) {
  console.log(`floor  ${Object.keys(SAVES).map((k) => k.padStart(8)).join('')}   (win %, ${RUNS} fights each; mean seconds)`);
  for (const f of floors) {
    const row = [];
    for (const [k, s] of Object.entries(SAVES)) {
      let w = 0, secs = 0, to = 0, nan = 0, mn = Infinity;
      for (let i = 0; i < RUNS; i++) {
        const x = fight(f, s); if (x.r === 'win') w++; if (x.r === 'timeout') to++; if (!x.finite) nan++; secs += x.t;
        if (x.r !== 'timeout') mn = Math.min(mn, x.t);
        if (x.r !== 'timeout' && x.t < shortest.t) Object.assign(shortest, { t: x.t, f, k });
      }
      (rate[k] ||= {})[f] = w / RUNS;
      row.push(`${String(Math.round((100 * w) / RUNS)).padStart(5)}%${to ? 't' + to : '  '}`);
      if (args.check && (to > RUNS * 0.1 || nan)) { bad++; console.log(`FAIL floor ${f} ${k}: ${to} timeouts, ${nan} non-finite`); }
      if (!row.secs) row.secs = [];
      row.secs.push(args.mins ? `${Math.round(secs / RUNS)}(${mn.toFixed(1)})` : Math.round(secs / RUNS));
    }
    console.log(`${String(f).padStart(5)}  ${row.join('')}   ${row.secs.join('/')} s`);
  }
  console.log(`shortest fight: ${shortest.t.toFixed(2)} s (floor ${shortest.f}, ${shortest.k}); TOWER_CAP.gapMs must stay under it + the ~2.1 s end delay`);
  if (args.check) {
    const pc = (x) => `${Math.round(x * 100)}%`;
    for (const [k, r] of Object.entries(rate)) {
      if (r[1] < 0.85) { bad++; console.log(`FAIL ${k}: floor 1 is ${pc(r[1])} (want >= 85%)`); }
      if (r[FLOORS] > 0.9) { bad++; console.log(`FAIL ${k}: the top is ${pc(r[FLOORS])} (want <= 90%)`); }
      if (r[FLOORS] >= r[1]) { bad++; console.log(`FAIL ${k}: the top is no harder than floor 1`); }
      if (k !== 'mid' && k !== 'maxed') continue;
      // Aaron, 2026-10-15: floors 1-2 ~90%+, a steady fall to ~50-60% on 10-11 and ~40% at the top.
      if (r[2] < 0.85) { bad++; console.log(`FAIL ${k}: floor 2 is ${pc(r[2])} (want >= 85%)`); }
      const late = (r[10] + r[11]) / 2; // the pair: one floor of 30 fights is too noisy alone
      if (!(late >= 0.2 && late <= 0.75)) { bad++; console.log(`FAIL ${k}: floors 10-11 are ${pc(late)} (want 20-75%)`); }
      if (r[FLOORS] < 0.1 || r[FLOORS] > 0.65) { bad++; console.log(`FAIL ${k}: the top is ${pc(r[FLOORS])} (want 10-65%)`); }
    }
    console.log(bad ? `\n${bad} check(s) failed` : '\nPASS  tower balance');
    process.exit(bad ? 1 : 0);
  }
} else {
  for (const [k, s] of Object.entries(SAVES)) {
    const need = [];
    for (let run = 0; run < Math.min(RUNS, 12); run++) {
      let f = 1, n = 0;
      for (; n < 150; n++) { const won = fight(f, s).r === 'win'; if (won && f === FLOORS) break; f = nextFloor(f, won); }
      need.push(n + 1);
    }
    need.sort((a, b) => a - b);
    console.log(`${k.padEnd(6)} fights to the TOP: median ${need[need.length >> 1]}, range ${need[0]}-${need[need.length - 1]}`);
  }
}
