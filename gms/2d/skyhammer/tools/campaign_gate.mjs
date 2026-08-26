#!/usr/bin/env node
/**
 * Campaign gate. Plain node, no deps, no browser.
 *
 *   node tools/campaign_gate.mjs [--seeds 2] [--act N] [--structural-only] [--falsify]
 *
 * TWO checks, and the RUNTIME one is the point. A structural pass says "the level data
 * mentions enough targets"; it was green on 102/102 while 48 of the 80 generated levels were
 * unplayable, because sim/behaviour.js permanently despawns a fighter that falls 1600 units
 * behind the camera. So this reports the runtime number first and treats the structural one as
 * a cheap pre-filter.
 *
 *   STRUCTURAL — every objective has enough matching spawns/waves, every spawn id resolves,
 *                every `land` has its pad, and length/par/reward/intro are sane. Written from
 *                CONTRACTS §12 + §15.2 rather than reusing tools/gen_levels.mjs's validator,
 *                so the two instruments can disagree.
 *   RUNTIME    — fly each level with the reference autopilot and ask sim/mission.js's own
 *                shortfall() whether anything left in the world could still satisfy each open
 *                objective. A shortfall is a level that can be permanently locked.
 *
 * --falsify sabotages both checks on purpose and PASSES only if both go red. A gate never
 * proven to fail is not evidence (CONTRACTS §13).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = { seeds: 1, act: null, structuralOnly: false, falsify: false, quiet: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i], v = argv[i + 1];
  if (k === '--seeds') { a.seeds = Number(v); i++; }
  else if (k === '--act') { a.act = Number(v); i++; }
  else if (k === '--structural-only') a.structuralOnly = true;
  else if (k === '--falsify') a.falsify = true;
  else if (k === '--quiet') a.quiet = true;
}

const { CAMPAIGN } = await import(join(ROOT, 'js/data/levels.js'));
const { ENEMIES } = await import(join(ROOT, 'js/data/enemies.js'));
const { createWorld } = await import(join(ROOT, 'js/sim/world.js'));
const { makeAutopilot } = await import(join(ROOT, 'js/sim/autopilot.js'));

/* ------------------------------------------------------------------ sabotage */

/**
 * Two deliberate breaks, one per instrument, and the runtime one is chosen so that the
 * structural check CANNOT see it:
 *   a3-07 gets an enemy id that does not exist  -> STRUCTURAL must go red
 *   a2-04's fighter objective is set to exactly as many fighters as the level spawns -> the
 *     structural check reads "needs N, N exist" and stays green, while the mission is locked
 *     the first time the player outruns one. That is the real bug this file exists for, so a
 *     runtime check that does not catch it is measuring nothing.
 */
function sabotage(levels) {
  return levels.map((l) => {
    if (l.id === 'a3-07') return { ...l, spawns: l.spawns.map((s, i) => (i === 0 ? { ...s, kind: 'ghost_tank' } : s)) };
    if (l.id === 'a2-04') {
      // One early wave of `he111` — cruise 350, ai 'straight', so it flies the other way and
      // never turns back — and a kill objective sized at exactly that wave. The structural
      // check reads "needs 3, 3 exist" and stays green; at runtime all three are behind the
      // camera within seconds and deleted, and the mission is locked. Deterministic.
      return {
        ...l,
        waves: [{ at: Math.round(l.length * 0.05), kind: 'he111', n: 3, spacing: 400 }],
        objectives: l.objectives.map((o) => (o.type === 'kill' ? { ...o, count: 3 } : o)),
      };
    }
    return l;
  });
}

// --falsify always runs the whole campaign: an --act filter could hide the sabotaged level and
// turn "the gate did not fire" into "the gate was never asked".
if (a.falsify) a.act = null;
const LEVELS = a.falsify ? sabotage(CAMPAIGN) : CAMPAIGN;
const pick = LEVELS.filter((l) => a.act === null || (l.act ?? 1) === a.act);
if (!pick.length) { console.log(`no levels for act ${a.act}`); process.exit(2); }

/* ---------------------------------------------------------------- structural */

const matches = (o, def) => {
  if (o.type === 'collect' && !o.kind && !o.tag) return def.kind === 'balloon';
  if (o.kind && def.kind !== o.kind) return false;
  if (o.tag && def.tag !== o.tag) return false;
  return !!(o.kind || o.tag);
};

function structural(l) {
  const bad = [];
  const pool = [];
  for (const s of l.spawns || []) {
    if (s.kind === 'pad') { pool.push({ pad: true, padId: s.padId }); continue; }
    const def = ENEMIES[s.kind];
    if (!def) { bad.push(`unknown spawn id '${s.kind}'`); continue; }
    pool.push({ def });
  }
  for (const w of l.waves || []) {
    const def = ENEMIES[w.kind];
    if (!def) { bad.push(`unknown wave id '${w.kind}'`); continue; }
    for (let i = 0; i < (w.n || 1); i++) pool.push({ def });
  }
  if (!(l.objectives || []).length) bad.push('no objectives');
  for (const o of l.objectives || []) {
    if (o.type === 'survive') { if (!(o.seconds > 0)) bad.push('survive with no seconds'); continue; }
    if (o.type === 'land') {
      if (!pool.some((e) => e.pad && (!o.padId || e.padId === o.padId))) bad.push(`land padId='${o.padId}' has no pad spawn`);
      continue;
    }
    const n = pool.filter((e) => e.def && matches(o, e.def)).length;
    if (n < (o.count || 1)) bad.push(`${o.type} ${o.kind || ''}${o.tag ? '/' + o.tag : ''} needs ${o.count} but ${n} exist`);
  }
  if (!(l.length >= 8000 && l.length <= 40000)) bad.push(`length ${l.length}`);
  if (!(l.par > 0)) bad.push('no par');
  if (!(l.reward && l.reward.money > 0 && l.reward.xp > 0)) bad.push('no reward');
  if (!l.intro || l.intro.length < 8) bad.push('no intro');
  return bad;
}

/* ------------------------------------------------------------------- runtime */

const ACT_PLANE = { 1: 'kestrel', 2: 'harrier1', 3: 'tempest', 4: 'sabre', 5: 'phantom' };
const ACT_LOADOUT = {
  1: ['bomb_std', 'rocket', null, null],
  2: ['bomb_heavy', 'rocket', 'cluster', null],
  3: ['bomb_heavy', 'homing', 'cluster', 'napalm'],
  4: ['bunker', 'homing', 'cluster', 'napalm'],
  5: ['bunker', 'homing', 'kraken_torp', 'nuke'],
};
function kitFor(l) {
  const act = Math.max(1, Math.min(5, l.act || 1));
  const lv = (act - 1) * 3;
  return { planeId: ACT_PLANE[act], loadout: ACT_LOADOUT[act], upgrades: { armor: lv, speed: lv, turn: lv, gun: lv, ammo: Math.min(10, lv) } };
}

function runtime(l, seed) {
  const world = createWorld({ level: l, seed, save: kitFor(l) });
  const bot = makeAutopilot();
  let t = 0;
  while (!world.over && t < 60 * 400) { bot.step(world, 1 / 60); world.step(); world.drainEvents(); t++; }
  return { shortfall: world.mission.shortfall(world), outcome: world.over || 'timeout', t };
}

/* --------------------------------------------------------------------- run */

const acts = {};
const structProblems = [], runProblems = [];

for (const l of pick) {
  const act = l.act ?? 1;
  acts[act] = acts[act] || { n: 0, sOk: 0, rOk: 0, wins: 0, runs: 0 };
  acts[act].n++;

  const bad = structural(l);
  if (bad.length) structProblems.push(`${l.id}: ${bad.join('; ')}`);
  else acts[act].sOk++;

  if (a.structuralOnly) continue;

  let locked = null;
  for (let i = 0; i < a.seeds; i++) {
    const r = runtime(l, l.seed + i * 7919);
    acts[act].runs++;
    if (r.outcome === 'win') acts[act].wins++;
    if (r.shortfall.length && !locked) locked = r.shortfall;
  }
  if (locked) runProblems.push(`${l.id}: ` + locked.map((s) => `${s.label} have ${s.have}/${s.need}, ${s.avail} left`).join('; '));
  else acts[act].rOk++;
}

const keys = Object.keys(acts).sort();
if (!a.structuralOnly) {
  console.log(`RUNTIME  — every objective still reachable at the end of ${a.seeds} autopilot run(s) per level`);
  for (const k of keys) {
    const c = acts[k];
    console.log(`  act ${k}: ${c.rOk}/${c.n} reachable   (autopilot wins ${c.wins}/${c.runs})`);
  }
}
console.log('STRUCTURAL — objectives, spawn ids, pads, length/par/reward/intro');
for (const k of keys) console.log(`  act ${k}: ${acts[k].sOk}/${acts[k].n} clean`);

if (!a.quiet) {
  if (runProblems.length) { console.log(`\n${runProblems.length} level(s) can be permanently locked:`); for (const p of runProblems) console.log('  ' + p); }
  if (structProblems.length) { console.log(`\n${structProblems.length} structural problem(s):`); for (const p of structProblems) console.log('  ' + p); }
}

const failed = runProblems.length + structProblems.length;
if (a.falsify) {
  const sawStruct = structProblems.some((p) => p.startsWith('a3-07'));
  const sawRun = a.structuralOnly || runProblems.some((p) => p.startsWith('a2-04'));
  const ok = sawStruct && sawRun;
  console.log(`\nFALSIFY: structural sabotage caught = ${sawStruct}, runtime sabotage caught = ${sawRun}`);
  console.log(ok ? 'FALSIFY PASS — both instruments go red when the data is broken' : 'FALSIFY FAIL — a check did not fire; it is not evidence');
  process.exit(ok ? 0 : 1);
}
console.log(failed ? `\nFAIL — ${failed} problem(s)` : '\nOK');
process.exit(failed ? 1 : 0);
