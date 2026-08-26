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
 * THREE deliberate breaks — one per instrument, plus a second for the runtime half, because
 * the runtime half now has to cover two different ways a level can be dead while every count
 * on paper adds up. Each break is chosen so the OTHER instrument stays green through it.
 *
 *   a3-07  an enemy id that does not exist            -> STRUCTURAL only
 *   a2-04  both fighter waves parked past the end of the level. The waves are still declared,
 *          so the structural check reads "needs 3, 4 exist" and stays green; at runtime a wave
 *          arms at `at - cam.vw * 0.4` and the player is clamped to `length - 40`, so it can
 *          never fire and the objective can never move.                    -> RUNTIME only
 *   a4-11  every ground target moved past the end of the level. Declared, alive, matching the
 *          objective, counted by the sim's own mission.shortfall() as available supply — and
 *          permanently out of reach of a player who cannot fly past `length - 40`.
 *                                                                          -> RUNTIME only
 *
 * The previous runtime sabotage (an early wave of straight-flying he111 that despawned behind
 * the camera) is deliberately retired: the recycle branch in sim/behaviour.js made that class
 * of defect impossible, so the sabotage could no longer fail and stopped being evidence.
 *
 * If a regeneration changes these levels enough that a break cannot be applied, this exits 2
 * rather than silently running a falsification that sabotages nothing.
 */
function sabotage(levels) {
  const applied = { structural: false, deadWave: false, strandedGround: false };
  const out = levels.map((l) => {
    if (l.id === 'a3-07' && (l.spawns || []).length) {
      applied.structural = true;
      return { ...l, spawns: l.spawns.map((sp, i) => (i === 0 ? { ...sp, kind: 'ghost_tank' } : sp)) };
    }
    if (l.id === 'a2-04' && (l.waves || []).length && (l.objectives || []).some((o) => o.type === 'kill')) {
      applied.deadWave = true;
      return { ...l, waves: l.waves.map((w) => ({ ...w, at: Math.round(l.length * 1.6) })) };
    }
    if (l.id === 'a4-11' && (l.objectives || []).some((o) => o.type === 'destroy' && o.kind === 'ground')) {
      const moved = (l.spawns || []).map((sp) => {
        const def = ENEMIES[sp.kind];
        return def && def.kind === 'ground' ? { ...sp, at: l.length + 4000 } : sp;
      });
      if (moved.some((sp, i) => sp.at !== l.spawns[i].at)) applied.strandedGround = true;
      return { ...l, spawns: moved };
    }
    return l;
  });
  const missing = Object.entries(applied).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.log(`cannot falsify: sabotage(s) [${missing.join(', ')}] no longer apply to their target level.`);
    console.log('Re-point them at a level with the right shape — a falsification that sabotages nothing is worse than none.');
    process.exit(2);
  }
  return out;
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

const GUN_REACH = 1500;   // main-gun bullet speed; a static target further past the player's
                          // hard x clamp than this can never be engaged, however alive it is

/**
 * The gate's own answer, deliberately NOT sim/mission.js's.
 *
 * `mission.shortfall()` counts every untriggered wave and every live ent as supply the player
 * can still reach. Neither is true in general: sim/plane.js clamps the player to
 * `length - 40`, and sim/spawn.js only arms a wave once the player passes `at - cam.vw * 0.4`.
 * A wave parked past the end of the level and a bunker parked past the end of the level are
 * both permanently unwinnable, and both report a shortfall of zero. So this recomputes
 * availability with the player's actual reach and reports the difference.
 *
 * Keeping both answers is the point: they use the same matching rule from two different
 * places, and if they ever disagree that is information rather than noise.
 */
function reachShortfall(world) {
  const l = world.level;
  const playerMaxX = l.length - 40;
  const engageX = playerMaxX + GUN_REACH;
  const out = [];
  for (const o of world.mission.objectives) {
    if (o.done || o.type === 'survive') continue;
    if (o.type === 'land') {
      const pad = world.ents.find((e) => e.kind === 'pad' && !e.dead && (!o.padId || e.padId === o.padId));
      if (!pad || pad.x > engageX) out.push({ label: o.label, have: 0, need: 1, avail: 0, stranded: pad ? 1 : 0 });
      continue;
    }
    let avail = 0, stranded = 0;
    for (const e of world.ents) {
      if (e.dead || !e.def) continue;
      if (!matches(o, { kind: e.kind, tag: e.def.tag })) continue;
      // A fighter flies to the player, so its spawn x does not strand it. Everything else sits.
      if (e.kind === 'fighter' || e.x <= engageX) avail++; else stranded++;
    }
    for (const wv of l.waves || []) {
      if (world.spawner.triggered(wv)) continue;
      const row = ENEMIES[wv.def || wv.kind];
      if (!row || !matches(o, row)) continue;
      if (wv.at - world.cam.vw * 0.4 <= playerMaxX) avail += wv.n || 1;
      else stranded += wv.n || 1;
    }
    const missing = o.need - o.have - avail;
    if (missing > 0) out.push({ label: o.label, have: o.have, need: o.need, avail, stranded });
  }
  return out;
}

function runtime(l, seed) {
  const world = createWorld({ level: l, seed, save: kitFor(l) });
  const bot = makeAutopilot();
  let t = 0;
  while (!world.over && t < 60 * 400) { bot.step(world, 1 / 60); world.step(); world.drainEvents(); t++; }
  const sim = world.mission.shortfall(world).map((x) => ({ ...x, src: 'sim' }));
  const reach = reachShortfall(world).map((x) => ({ ...x, src: 'reach' }));
  const seen = new Set(sim.map((x) => x.label));
  return { shortfall: [...sim, ...reach.filter((x) => !seen.has(x.label))], outcome: world.over || 'timeout', t };
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
  if (locked) runProblems.push(`${l.id}: ` + locked.map((s) => `${s.label} have ${s.have}/${s.need}, ${s.avail} reachable` + (s.stranded ? `, ${s.stranded} out of reach` : '') + ` [${s.src}]`).join('; '));
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
  const hit = (list, id) => list.some((p) => p.startsWith(id + ':'));
  const sawStruct = hit(structProblems, 'a3-07');
  const sawDeadWave = a.structuralOnly || hit(runProblems, 'a2-04');
  const sawStranded = a.structuralOnly || hit(runProblems, 'a4-11');
  // Each break must be invisible to the other instrument, or it is not testing what it claims.
  const structStayedClean = !hit(structProblems, 'a2-04') && !hit(structProblems, 'a4-11');
  const ok = sawStruct && sawDeadWave && sawStranded && structStayedClean;
  console.log('\nFALSIFY');
  console.log(`  a3-07 unknown enemy id        -> structural caught: ${sawStruct}`);
  console.log(`  a2-04 waves past level end    -> runtime caught:    ${sawDeadWave}`);
  console.log(`  a4-11 ground past level end   -> runtime caught:    ${sawStranded}`);
  console.log(`  the two runtime breaks stayed invisible to the structural check: ${structStayedClean}`);
  console.log(ok ? 'FALSIFY PASS — every instrument goes red on a defect only it can see'
                 : 'FALSIFY FAIL — a check did not fire, or fired for the wrong reason; it is not evidence');
  process.exit(ok ? 0 : 1);
}
console.log(failed ? `\nFAIL — ${failed} problem(s)` : '\nOK');
process.exit(failed ? 1 : 0);
