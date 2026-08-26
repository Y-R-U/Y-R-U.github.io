// Generates story levels 21-100 (acts 2-5) into js/data/levels_gen.js from per-act
// templates, deterministic from GEN_SEED, then validates ALL 100 levels (this file's
// output plus the 20 hand-authored act-1 levels in js/data/levels.js).
//
// Run: node tools/gen_levels.mjs            (generate + write + validate, exit 1 on failure)
//      node tools/gen_levels.mjs --check     (validate only, do not write)
//
// Plain node, no deps. Objectives are derived FROM what gets spawned (never the other
// way around) so every generated level is structurally guaranteed achievable; the
// validator below still checks it, and also checks the hand-authored levels, because a
// gate that only ever runs against its own generator's output is not a gate.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ENEMIES } from '../js/data/enemies.js';
import { baseMoney, baseXp } from '../js/data/economy.js';
import { LEVELS as ACT1_LEVELS } from '../js/data/levels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'js', 'data', 'levels_gen.js');
const GEN_SEED = 0x5cf1a1;

// ---------------------------------------------------------------- deterministic RNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function ri(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

// ---------------------------------------------------------------------- act content
const BIOMES = ['farmland', 'coast', 'city', 'sea', 'alpine', 'desert'];
const TIMES = ['dawn', 'day', 'dusk', 'night'];
const WEATHERS = ['clear', 'clear', 'overcast', 'storm']; // weighted toward clear

const ACT_POOLS = {
  2: { ground: ['hut', 'bunker', 'depot', 'factory', 'halftrack', 'railyard', 'uboat'],
       flak: ['flakLight', 'flakHeavy'],
       fighter: ['scout', 'bf109', 'fw190', 'he111', 'bomber'],
       balloon: ['balloon', 'balloon_gold'] },
  3: { ground: ['bunker', 'depot', 'factory', 'halftrack', 'railyard', 'comms_tower', 'convoy_truck'],
       flak: ['flakHeavy', 'sam_site'],
       fighter: ['bf109', 'fw190', 'proto_jet', 'mig_ghost', 'he111', 'bomber'],
       balloon: ['balloon', 'balloon_gold'] },
  4: { ground: ['factory', 'railyard', 'reactor', 'aa_carrier', 'comms_tower'],
       flak: ['sam_site', 'laser_turret', 'flakHeavy'],
       fighter: ['proto_jet', 'mig_ghost', 'jet_fighter', 'stealth_drone', 'bomber'],
       balloon: ['balloon_gold'] },
  5: { ground: ['reactor', 'drone_hive', 'mech_walker', 'aa_carrier'],
       flak: ['laser_turret', 'plasma_nest', 'sam_site'],
       fighter: ['jet_fighter', 'stealth_drone', 'cyber_interceptor', 'drone_swarm'],
       balloon: ['balloon_gold'] },
};
const ACT_BOSS = { 2: 'boss_leviathan', 3: 'boss_blacksigma', 4: 'boss_behemoth', 5: 'boss_orbitalmother' };
const ACT_NAME = { 2: 'Wider War', 3: 'The Drift', 4: 'Jet Age', 5: 'Chrome Sky' };
const ACT_INTRO_POOL = {
  2: ['Bigger raid today. Bigger everything.', 'Command wants the whole sector, not just the ridge.',
      'They rebuilt what you burned last week. Burn it better this time.', 'Fresh guns, same map. Go earn your pay.'],
  3: ['Someone at HQ has been drawing planes that should not exist yet. Shoot them down anyway.',
      'Prototype spotted. It is faster than it has any right to be.', 'The war keeps forgetting what decade it is.',
      'New paint on the enemy birds. New engine sound too. Handle it.'],
  4: ['Sound barrier is not a barrier any more, it is a formality.', 'Radar country. Assume they see you first.',
      'The jets do not get tired. Neither do you, apparently.', 'Full afterburner sector. Try to keep up with your own aircraft.'],
  5: ['Nobody has explained the drones. Nobody is going to.', 'Sky looks wrong today. Corporate wrong.',
      'The enemy does not have a nationality any more, just a logo.', 'Whatever this is, it flies, and it is shooting at you.'],
};

function pickBiomeTimeWeather(rng) {
  return { biome: pick(rng, BIOMES), timeOfDay: pick(rng, TIMES), weather: pick(rng, WEATHERS) };
}

function spawnRow(id, kind) { return { at: 0, kind: id }; }

function buildLevel(n) {
  const act = Math.ceil(n / 20);
  const p = ((n - 1) % 20) + 1;
  const isBoss = p === 20;
  const rng = mulberry32(GEN_SEED + n * 7919);
  const { biome, timeOfDay, weather } = pickBiomeTimeWeather(rng);
  const pool = ACT_POOLS[act];

  const length = Math.min(30000, Math.max(14000,
    15000 + act * 1200 + p * 170 + ri(rng, -600, 1400)));

  const id = `a${act}-${String(p).padStart(2, '0')}`;
  const name = isBoss ? bossName(act) : `${ACT_NAME[act]} ${p}`;
  const money = baseMoney(n);
  const xp = baseXp(n);

  if (isBoss) {
    const bossX = Math.round(length * 0.72);
    const escortN = 2 + (act - 2);
    const spawns = [{ at: bossX, kind: ACT_BOSS[act] }];
    const waves = escortN > 0
      ? [{ at: Math.round(length * 0.3), kind: pick(rng, pool.fighter), n: escortN, spacing: 420 }]
      : [];
    const par = Math.round(length * (0.011 + act * 0.001));
    return {
      id, act, name, biome, length, seed: GEN_SEED + n,
      timeOfDay, weather,
      objectives: [{ type: 'destroy', kind: 'boss', count: 1 }],
      spawns, waves,
      reward: { money, xp }, par,
      intro: `${bossName(act)} ahead. This is the one the briefing warned you about.`,
    };
  }

  // scale enemy counts with act and position-in-act
  const groundCount = 2 + Math.floor(p / 4) + (act - 2);
  const flakCount = 1 + Math.floor(p / 6) + Math.floor((act - 2) / 2);
  const fighterCount = 3 + Math.floor(p / 3) + (act - 2);
  const wantCollect = p % 4 === 0;
  const wantLand = p % 5 === 0;
  const balloonCount = wantCollect ? ri(rng, 3, 5) : ri(rng, 0, 2);

  const spawns = [];
  const step = length / (groundCount + flakCount + balloonCount + 2);
  let cursor = step;
  for (let i = 0; i < groundCount; i++) {
    spawns.push({ at: Math.round(cursor), kind: pick(rng, pool.ground) });
    cursor += step;
  }
  for (let i = 0; i < flakCount; i++) {
    spawns.push({ at: Math.round(cursor), kind: pick(rng, pool.flak) });
    cursor += step;
  }
  for (let i = 0; i < balloonCount; i++) {
    spawns.push({ at: Math.round(cursor), kind: pick(rng, pool.balloon), y: ri(rng, 480, 700) });
    cursor += step;
  }
  if (wantLand) {
    spawns.push({ at: Math.max(length - 900, 1000), kind: 'pad', padId: (p % 10 === 0) ? 'carrier' : 'airstrip', y: 'ground' });
  }

  const waves = [];
  let remaining = fighterCount;
  const waveCount = remaining > 5 ? 2 : 1;
  for (let w = 0; w < waveCount; w++) {
    const n2 = w === waveCount - 1 ? remaining : Math.ceil(remaining / waveCount);
    remaining -= n2;
    waves.push({ at: Math.round(length * (0.25 + w * 0.4)), kind: pick(rng, pool.fighter), n: n2, spacing: 400 });
  }

  const objectives = [];
  objectives.push({ type: 'destroy', kind: 'ground', count: Math.max(1, groundCount - 1) });
  if (flakCount > 0) objectives.push({ type: 'destroy', kind: 'flak', count: flakCount });
  objectives.push({ type: 'kill', kind: 'fighter', count: fighterCount });
  if (wantCollect) objectives.push({ type: 'collect', count: Math.max(1, balloonCount - 1) });
  if (wantLand) objectives.push({ type: 'land', padId: (p % 10 === 0) ? 'carrier' : 'airstrip' });

  const par = Math.round(length * (0.0078 + p * 0.00025) + (groundCount + flakCount + fighterCount) * 2.5);

  return {
    id, act, name, biome, length, seed: GEN_SEED + n,
    timeOfDay, weather,
    objectives, spawns, waves,
    reward: { money, xp }, par,
    intro: pick(rng, ACT_INTRO_POOL[act]),
  };
}

function bossName(act) {
  return { 2: 'Leviathan', 3: 'Black Sigma', 4: 'Behemoth', 5: 'ORBITAL MOTHER' }[act];
}

function generateAll() {
  const out = [];
  for (let n = 21; n <= 100; n++) out.push(buildLevel(n));
  return out;
}

// -------------------------------------------------------------------------- validate
// objective matching mirrors levels.js's header comment: objectives[].kind matches
// ENEMIES[spawnedId].kind, objectives[].tag matches ENEMIES[spawnedId].tag, a bare
// `collect` (no kind/tag) counts balloon-kind spawns.
function matchesObjective(def, obj) {
  if (obj.type === 'collect' && !obj.kind && !obj.tag) return def.kind === 'balloon';
  let ok = true;
  if (obj.kind) ok = ok && def.kind === obj.kind;
  if (obj.tag) ok = ok && def.tag === obj.tag;
  return ok;
}

export function validateLevels(levels) {
  const failures = [];
  const seenIds = new Set();
  for (const lvl of levels) {
    const tag = `${lvl.id} (${lvl.name})`;
    if (seenIds.has(lvl.id)) failures.push(`${tag}: duplicate level id`);
    seenIds.add(lvl.id);

    if (!BIOMES.includes(lvl.biome)) failures.push(`${tag}: invalid biome '${lvl.biome}'`);
    if (!TIMES.includes(lvl.timeOfDay)) failures.push(`${tag}: invalid timeOfDay '${lvl.timeOfDay}'`);
    if (!['clear', 'overcast', 'storm'].includes(lvl.weather)) failures.push(`${tag}: invalid weather '${lvl.weather}'`);
    if (!(lvl.length >= 8000 && lvl.length <= 40000)) failures.push(`${tag}: implausible length ${lvl.length}`);

    const pool = [];
    for (const s of lvl.spawns || []) {
      if (!ENEMIES[s.kind] && s.kind !== 'pad') failures.push(`${tag}: spawns references unknown enemy id '${s.kind}'`);
      pool.push(s);
    }
    for (const w of lvl.waves || []) {
      if (!ENEMIES[w.kind]) failures.push(`${tag}: waves references unknown enemy id '${w.kind}'`);
      for (let i = 0; i < (w.n || 1); i++) pool.push({ kind: w.kind });
    }

    if (!lvl.objectives || lvl.objectives.length === 0) {
      failures.push(`${tag}: no objectives`);
    }
    for (const obj of lvl.objectives || []) {
      if (obj.type === 'survive') continue;
      if (obj.type === 'land') {
        const hasPad = (lvl.spawns || []).some(s => s.kind === 'pad' && (!obj.padId || s.padId === obj.padId));
        if (!hasPad) failures.push(`${tag}: land objective (padId=${obj.padId}) has no matching pad spawn`);
        continue;
      }
      if (obj.type === 'destroy' || obj.type === 'kill' || obj.type === 'collect') {
        const matching = pool.filter(e => {
          const def = ENEMIES[e.kind];
          return def && matchesObjective(def, obj);
        }).length;
        if (matching < obj.count) {
          failures.push(`${tag}: objective ${obj.type} kind=${obj.kind || '-'} tag=${obj.tag || '-'} needs ${obj.count} but only ${matching} spawned/waved`);
        }
      }
    }

    if (!lvl.par || lvl.par <= 0) {
      failures.push(`${tag}: missing/invalid par`);
    } else {
      const impliedSpeed = lvl.length / lvl.par;
      if (impliedSpeed < 40 || impliedSpeed > 300) {
        failures.push(`${tag}: par ${lvl.par} implausible against length ${lvl.length} (implied speed ${impliedSpeed.toFixed(1)})`);
      }
    }

    if (!lvl.reward || !(lvl.reward.money > 0) || !(lvl.reward.xp > 0)) {
      failures.push(`${tag}: missing/invalid reward`);
    }
    if (!lvl.intro || lvl.intro.length < 8) {
      failures.push(`${tag}: missing/too-short intro`);
    }
  }
  return failures;
}

function writeGenFile(levels) {
  const body = levels.map(l => JSON.stringify(l)).join(',\n  ');
  const src = `// AUTO-GENERATED by tools/gen_levels.mjs from GEN_SEED=${GEN_SEED}. Do not hand-edit —
// re-run the generator after tuning js/data/enemies.js or js/data/economy.js instead.
// Levels 21-100, acts 2-5. See CONTRACTS §12 for the level shape.

export const LEVELS_GEN = [
  ${body},
];
`;
  writeFileSync(OUT_PATH, src);
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const generated = generateAll();
  if (!checkOnly) writeGenFile(generated);

  const all = [...ACT1_LEVELS, ...generated];
  const failures = validateLevels(all);

  console.log(`levels: ${all.length} total (act1 hand-authored: ${ACT1_LEVELS.length}, generated: ${generated.length})`);
  if (failures.length) {
    console.log(`VALIDATION FAILED — ${failures.length} problem(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('validation OK — every level has an achievable objective set.');
}

main();
