#!/usr/bin/env node
/**
 * THE TOWER's balance, in node: every floor fought by the autoplay player (skill 0.62, the
 * "decent player" the campaign sim uses) at four saves, from a fresh white belt to a maxed one.
 * The opponent is scaled to the player's own body and kit, so the curve should look the same
 * for all four.
 *
 *   node tools/eventtower.mjs [--runs=40] [--floors=1,6,12]
 *   node tools/eventtower.mjs --check     # the gate: floor 1 >= 85%, floor 12 between 20% and 90%,
 *                                         # floors fall from 1 to 12, no timeouts or non-finite fights
 *   node tools/eventtower.mjs --climb     # a whole week's climb: fights needed to reach the TOP
 *   node tools/eventtower.mjs --falsify   # the check against a tower 3x too hard and one 6x too soft: both must fail
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.argv.includes('--falsify')) {
  let red = 0;
  for (const m of ['3', '0.16']) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--check', '--runs=16'], { env: { ...process.env, TOWER_M: m }, encoding: 'utf8' });
    const ok = r.status !== 0 && /FAIL/.test(r.stdout);
    if (ok) red++;
    console.log(`${ok ? 'RED  ' : 'GREEN'} difficulty x${m}`);
  }
  console.log(`falsify: ${red}/2`);
  process.exit(red === 2 ? 0 : 1);
}
const noopCtx = new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const { TowerMatch, KNOBS } = await import('../js/events/towerfight.js');
if (process.env.TOWER_M) KNOBS.m = +process.env.TOWER_M;
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

const floors = args.floors ? String(args.floors).split(',').map(Number) : Array.from({ length: FLOORS }, (_, i) => i + 1);
let bad = 0;
const rate = {};
if (!args.climb) {
  console.log(`floor  ${Object.keys(SAVES).map((k) => k.padStart(8)).join('')}   (win %, ${RUNS} fights each; mean seconds)`);
  for (const f of floors) {
    const row = [];
    for (const [k, s] of Object.entries(SAVES)) {
      let w = 0, secs = 0, to = 0, nan = 0;
      for (let i = 0; i < RUNS; i++) { const x = fight(f, s); if (x.r === 'win') w++; if (x.r === 'timeout') to++; if (!x.finite) nan++; secs += x.t; }
      (rate[k] ||= {})[f] = w / RUNS;
      row.push(`${String(Math.round((100 * w) / RUNS)).padStart(5)}%${to ? 't' + to : '  '}`);
      if (args.check && (to > RUNS * 0.1 || nan)) { bad++; console.log(`FAIL floor ${f} ${k}: ${to} timeouts, ${nan} non-finite`); }
      if (!row.secs) row.secs = [];
      row.secs.push(Math.round(secs / RUNS));
    }
    console.log(`${String(f).padStart(5)}  ${row.join('')}   ${row.secs.join('/')} s`);
  }
  if (args.check) {
    for (const [k, r] of Object.entries(rate)) {
      if (r[1] < 0.85) { bad++; console.log(`FAIL ${k}: floor 1 is ${Math.round(r[1] * 100)}% (want >= 85%)`); }
      if (r[FLOORS] < 0.2 || r[FLOORS] > 0.9) { bad++; console.log(`FAIL ${k}: the top is ${Math.round(r[FLOORS] * 100)}% (want 20-90%)`); }
      if (r[FLOORS] >= r[1]) { bad++; console.log(`FAIL ${k}: the top is no harder than floor 1`); }
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
