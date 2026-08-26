#!/usr/bin/env node
/**
 * Headless balance + reachability harness. Plain node, no browser, no npm.
 *
 *   node tools/sim.mjs --level a1-01 --seeds 12 [--all] [--ticks 30000] [--quiet]
 *
 * Exits non-zero if any seed crashes, times out, or leaves an objective that
 * nothing left in the level could ever satisfy.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const a = { level: 'a1-01', seeds: 8, ticks: 60 * 400, quiet: false, all: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i], v = argv[i + 1];
  if (k === '--level') { a.level = v; i++; }
  else if (k === '--seeds') { a.seeds = Number(v); i++; }
  else if (k === '--ticks') { a.ticks = Number(v); i++; }
  else if (k === '--quiet') a.quiet = true;
  else if (k === '--all') a.all = true;
  else if (k === '--plane') { a.plane = v; i++; }
}

/** Gate 0: sim code must be DOM-free (CONTRACTS §1.5). Source-level, so it cannot be faked. */
const BANNED = /\b(document|window|localStorage|navigator|requestAnimationFrame|performance\.now|Math\.random|new Image|new Audio)\b/;
async function lintSim() {
  const dir = join(ROOT, 'js', 'sim');
  const bad = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = await readFile(join(dir, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      const m = code.match(BANNED);
      if (m) bad.push(`js/sim/${f}:${i + 1}  ${m[0]}`);
      // Vendored three must never reach the sim, directly or transitively: it would
      // make js/sim un-runnable in node and take this whole harness with it.
      if (/\bfrom\s+['"](three|three\/addons\/[^'"]*|.*vendor\/three[^'"]*)['"]/.test(code)) {
        bad.push(`js/sim/${f}:${i + 1}  imports three`);
      }
    });
  }
  return bad;
}

const domBad = await lintSim();
if (domBad.length) {
  console.log('SIM PURITY FAIL — js/sim touches the DOM:');
  for (const b of domBad) console.log('  ' + b);
}
if (domBad.length) { console.log('\nrefusing to run the sim with an impure js/sim'); process.exit(1); }

const { LEVELS } = await import('../js/data/levels.js');
let GEN = [];
try { GEN = (await import('../js/data/levels_gen.js')).LEVELS_GEN || []; } catch { /* acts 2-5 not generated */ }
const ALL = [...LEVELS, ...GEN];
const { CAM, TERRAIN } = await import('../js/data/tuning.js');
const { makeTerrain } = await import('../js/sim/terrain.js');
const { makeRng } = await import('../js/core/rng.js');
const { createWorld } = await import('../js/sim/world.js');
const { makeAutopilot } = await import('../js/sim/autopilot.js');


/**
 * Gate 1 (CONTRACTS §16 / D25): per-level intent, not a global threshold. A flat
 * number cannot tell a deliberately hilly level from the D21 framing bug — both
 * measure 26%. So the level declares its character and this checks the generator
 * produced what was asked for.
 */
function bandCheck(level) {
  const name = level.terrainProfile || TERRAIN.defaultProfile;
  const prof = TERRAIN.profiles[name] || TERRAIN.profiles[TERRAIN.defaultProfile];
  const t = makeTerrain(level, makeRng(level.seed));
  let sum = 0, n = 0, crest = -1e9, crestX = 0;
  for (let x = 0; x < level.length; x += 25) {
    const h = t.heightAt(x);
    sum += h; n++;
    if (h > crest) { crest = h; crestX = x; }
  }
  const band = (v) => (v - CAM.baseY) / CAM.vh;
  const mean = band(sum / n);
  return {
    profile: name, want: prof.band, mean, crest: band(crest), crestX,
    meanY: sum / n, crestY: crest, water: t.waterY !== null,
    ok: mean >= prof.band[0] && mean <= prof.band[1],
  };
}

/**
 * A player who reached act N has an act-N aeroplane. Flying every level in the
 * starting Kestrel measures the wrong thing — acts 2-5 would all read as
 * unwinnable when they are simply not act-1 content.
 */
const ACT_PLANE = { 1: 'kestrel', 2: 'harrier1', 3: 'tempest', 4: 'sabre', 5: 'phantom' };
const ACT_LOADOUT = {
  1: ['bomb_std', 'rocket', null, null],
  2: ['bomb_heavy', 'rocket', 'cluster', null],
  3: ['bomb_heavy', 'homing', 'cluster', 'napalm'],
  4: ['bunker', 'homing', 'cluster', 'napalm'],
  5: ['bunker', 'homing', 'kraken_torp', 'nuke'],
};
function kitFor(level) {
  const act = Math.max(1, Math.min(5, level.act || 1));
  const lv = (act - 1) * 3;
  return {
    planeId: a.plane || ACT_PLANE[act],
    loadout: ACT_LOADOUT[act],
    upgrades: { armor: lv, speed: lv, turn: lv, gun: lv, ammo: Math.min(10, lv) },
  };
}

function runSeed(level, seed, maxTicks) {
  const world = createWorld({ level, seed, save: kitFor(level) });
  const bot = makeAutopilot();
  let ticks = 0;
  const evCount = {};
  while (!world.over && ticks < maxTicks) {
    bot.step(world, 1 / 60);
    world.step();
    for (const ev of world.drainEvents()) evCount[ev.e] = (evCount[ev.e] || 0) + 1;
    ticks++;
  }
  const shortfall = world.mission.shortfall(world);
  return {
    seed, ticks, world, evCount, shortfall,
    outcome: world.over || 'timeout',
    results: world.results,
  };
}

const levels = a.all ? ALL : ALL.filter((l) => l.id === a.level);
if (!levels.length) { console.log(`no such level: ${a.level}`); process.exit(2); }

let fails = 0, total = 0, seedFails = 0, levelFails = 0;
for (const level of levels) {
  console.log(`\n=== ${level.id} "${level.name}"  ${level.biome} len ${level.length} par ${level.par}s ===`);
  const bc = bandCheck(level);
  console.log(`  kit: ${kitFor(level).planeId}  [${kitFor(level).loadout.filter(Boolean).join(', ')}]  upgrades +${(Math.max(1, Math.min(5, level.act || 1)) - 1) * 3}`);
  console.log(`  terrain: profile '${bc.profile}' want ${(bc.want[0] * 100).toFixed(0)}-${(bc.want[1] * 100).toFixed(0)}%  ` +
              `mean y ${bc.meanY.toFixed(1)} crest y ${bc.crestY.toFixed(1)} @x${bc.crestX}  ` +
              `band mean ${(bc.mean * 100).toFixed(1)}% crest ${(bc.crest * 100).toFixed(1)}%  ${bc.ok ? 'ok' : 'FAIL'}`);
  if (!bc.ok) {
    fails++; levelFails++;
    console.log(`  FAIL terrain framing (CONTRACTS §16/D25): profile '${bc.profile}' wants a mean band of ` +
      `${(bc.want[0] * 100).toFixed(0)}-${(bc.want[1] * 100).toFixed(0)}%, generator produced ${(bc.mean * 100).toFixed(1)}%` +
      (bc.water ? '  (water biome: the surface is pinned to the waterline, so it cannot exceed ~11% — declare flat or rolling)' : ''));
  }
  const outcomes = {};
  for (let i = 0; i < a.seeds; i++) {
    const seed = level.seed + i * 7919;
    total++;
    let r;
    try {
      r = runSeed(level, seed, a.ticks);
    } catch (err) {
      fails++;
      seedFails++;
      console.log(`  seed ${seed}  CRASH  ${err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err}`);
      continue;
    }
    outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
    const w = r.world, st = w.stats;
    const kills = Object.entries(st.kills).map(([k, v]) => `${k}:${v}`).join(' ') || 'none';
    const acc = st.shots ? (100 * st.hits / st.shots).toFixed(1) : '0.0';
    const objs = w.mission.objectives
      .map((o) => `${o.done ? 'X' : 'o'} ${o.label} [${Math.round(o.have)}/${Math.round(o.need)}]`).join('  ');
    const stars = r.results ? r.results.stars : 0;
    if (!a.quiet) {
      console.log(
        `  seed ${String(seed).padStart(6)}  ${r.outcome.padEnd(7)} ` +
        `${(r.ticks / 60).toFixed(1)}s (${r.ticks}t)  kills[${kills}]  $${Math.round(st.money)}  ` +
        `shots ${st.shots}/hit ${st.hits} (${acc}%)  boom ${r.evCount.explode || 0}  ${stars}*`);
      const hurt = Object.entries(st.hurtBy).sort((x, y) => y[1] - x[1])
        .map(([k, v]) => `${k}:${Math.round(v)}`).join(' ') || 'none';
      console.log(`          took ${Math.round(st.damageTaken)} dmg from [${hurt}]${w.deathCause ? '  died: ' + w.deathCause : ''}`);
      console.log(`          obj: ${objs}   x ${Math.round(w.player.x)}/${level.length}  hp ${Math.round(Math.max(0, w.player.hp))}`);
    }
    if (r.outcome === 'timeout') { fails++; seedFails++; console.log('          FAIL: timed out'); }
    if (r.shortfall.length) {
      fails++; seedFails++;
      for (const s of r.shortfall) {
        console.log(`          FAIL unreachable: ${s.label} have ${s.have} need ${s.need}, only ${s.avail} left in the level`);
      }
    }
    if (r.outcome === 'dead') console.log('          note: autopilot died (not a harness failure by itself)');
  }
  console.log('  outcomes: ' + Object.entries(outcomes).map(([k, v]) => `${k} ${v}`).join(', '));
  // A pass count alone is not a gate: with bomb damage set to 0 every seed still
  // "ran clean". Requiring at least one win per level is what actually catches it.
  if (!outcomes.win) {
    fails++; levelFails++;
    console.log('  FAIL: no seed of this level was completable by the reference autopilot');
  }
}

if (domBad.length) fails++;
console.log(`\n${total - seedFails} / ${total} seed-runs clean across ${levels.length} level(s); ` +
            `${levelFails} level-level failure(s)` + (domBad.length ? '; sim purity FAILED' : ''));
process.exit(fails ? 1 : 0);
