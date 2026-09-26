// Randomised contract generator (MISSIONS.md). Pure: board + mission objects, validation, payouts.
// The step RUNNER lives in js/game/* (integration agent); this module only describes steps.
import {
  GRADES, THREATS, overclockThreat, ARCHETYPES, FRAME_BIAS, MODIFIERS, MODIFIER_CONFLICTS, BONUSES, TWISTS,
  FIRST_NAMES, SURNAMES, ORGS, ORGS_BY_FLAG, NICKNAMES, EPITHETS, PARCELS, CASE_ITEMS, CASE_ITEMS_BY_FLAG,
  SABOTAGE_OBJECTS, SABOTAGE_SITES, SITE_NAMES, TITLES, TAGLINES, BLURBS, DEFEND_OBJECTS, ELITE_PACK_BONUS, PAYOUT_BASE,
} from '../data/missions.js';
import { DISTRICTS, fallbackSites } from '../data/districts.js';
import { FACTION_TARGET, FACTION_ELITE, ELITE_MODS } from '../data/enemies.js';
import { REP_RULES } from '../data/factions.js';
import { L } from '../data/balance.js';
import { rngFor, hash32 } from './rng.js';
import { buildEnemies, enemyBudget, championUnit } from './enemies.js';
import { overLevelPenalty } from './economy.js';
import { clamp } from './util.js';

export const STEP_TYPES = ['goto', 'pickup', 'deliver', 'kill', 'killCount', 'destroy', 'hack', 'photo', 'tail', 'escort', 'defend', 'race', 'capture', 'exfil', 'choose', 'survive'];
const round5 = v => Math.max(5, Math.round(v / 5) * 5);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function threatDef(threat) {
  if (typeof threat === 'object') return threat;
  if (String(threat).startsWith('overclock')) return overclockThreat(+String(threat).split(':')[1] || 1);
  return THREATS[threat] || THREATS.tense;
}

// ---- sites -------------------------------------------------------------------------------

export function sitesFor(districtId, registry) {
  const real = registry?.[districtId];
  return real && real.length ? real : fallbackSites(districtId);
}

function sitesByTag(sites, tags) {
  if (!tags || tags.includes('*')) return sites.filter(s => s.tag !== 'spawn_edge');
  const t = new Set(tags);
  return sites.filter(s => t.has(s.tag));
}

// prefer 40-120 m from `from`; then any; excludes used ids when possible
function pickSite(rng, sites, tags, { from, used, minD = 40, maxD = 120, strict = false } = {}) {
  let pool = sitesByTag(sites, tags);
  if (!pool.length && !strict) pool = sitesByTag(sites, ['*']);
  if (!pool.length) return null;
  const fresh = pool.filter(s => !used?.has(s.id));
  if (fresh.length) pool = fresh;
  if (from) {
    const band = pool.filter(s => { const d = dist(s, from); return d >= minD && d <= maxD; });
    if (band.length) pool = band;
    else {
      const notSame = pool.filter(s => s.id !== from.id);
      if (notSame.length) pool = notSame;
    }
  }
  const s = rng.pick(pool);
  used?.add(s.id);
  return s;
}

function nearest(sites, tags, from, excludeId) {
  const pool = sitesByTag(sites, tags).filter(s => s.id !== excludeId);
  if (!pool.length) return null;
  return pool.reduce((a, b) => (dist(a, from) <= dist(b, from) ? a : b));
}

// ---- names -------------------------------------------------------------------------------

const PORTRAIT_BY_FACTION = { nexus: 'civ_chrome', concord: 'civ_gold', syndicate: 'civ_black', unlinked: 'civ_worker', freehaul: 'civ_worker' };

export function personName(rng) { return `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`; }
export function robotDesignation(rng) {
  const A = () => String.fromCharCode(65 + rng.int(0, 25));
  return `${A()}${A()}-${rng.int(10, 99)}`;
}

function orgsFor(flags) {
  let out = ORGS.slice();
  for (const [flag, list] of Object.entries(ORGS_BY_FLAG)) if (flags?.has(flag)) out = out.concat(list);
  return out;
}

function makeClient(rng, flags, archetype) {
  if (archetype === 'repo') return { name: personName(rng), org: 'HireFrame Collections', faction: 'nexus', portrait: { kind: 'civ_chrome', seed: rng.int(1, 9999) } };
  const [org, faction] = rng.pick(orgsFor(flags));
  const anon = org === 'No-Name Friend' || org.startsWith('"');
  return { name: anon ? 'Anonymous' : personName(rng), org, faction, portrait: { kind: anon ? 'unknown' : PORTRAIT_BY_FACTION[faction] || 'civ_chrome', seed: rng.int(1, 9999) } };
}

function makeTarget(rng, faction, rank, archetype) {
  const robot = rng.chance(0.5);
  const nick = rng.pick(NICKNAMES);
  const name = robot ? `${robotDesignation(rng)} "${nick}"` : personName(rng);
  const defId = archetype === 'repo' ? 'deadbeat' : ['surveil', 'tail'].includes(archetype) ? 'vip' : FACTION_TARGET[faction] || 'knuckle';
  return { name, nickname: nick, epithet: rng.pick(EPITHETS), defId, faction, rank, seed: rng.int(1, 99999) };
}

function fillTemplate(str, v) {
  return str.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? v[k.toLowerCase()] ?? k);
}

// ---- step builders -----------------------------------------------------------------------
// each returns {steps, placements:[{atStep, site, weight}], target?, npc?, extra?} or null if the district can't host it

let stepSeq = 0;
const step = (type, params) => ({ id: `s${++stepSeq}`, type, ...params });

const BUILDERS = {
  courier(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['locker'], { used }) || pickSite(rng, S, ['plaza', 'market'], { used });
    const B = pickSite(rng, S, ['locker', 'plaza', 'market', 'rooftop'], { from: A, used });
    if (!A || !B) return null;
    c.vars.parcel = rng.pick(PARCELS);
    const item = { kind: 'parcel', name: c.vars.parcel };
    const steps = [step('goto', { site: A.id, radius: 4, label: `Collect the parcel at the ${SITE_NAMES[A.tag]}` }), step('pickup', { item, site: A.id, time: 1 }),
      step('goto', { site: B.id, radius: 4, label: `Deliver to the ${SITE_NAMES[B.tag]}` }), step('deliver', { site: B.id, item })];
    const placements = [];
    if (rng.chance(0.4)) placements.push({ atStep: 2, site: (nearest(S, ['alley', 'spawn_edge'], mid(A, B)) || B).id, ambush: true });
    return { steps, placements, sites: { A, B } };
  },
  pest(rng, S) {
    const Z = pickSite(rng, S, ['alley', 'warehouse', 'park']);
    if (!Z) return null;
    const steps = [step('goto', { site: Z.id, radius: 8, label: 'Find the nest' }), step('kill', { target: 'all', site: Z.id, label: 'Clear the Scrap' }),
      step('destroy', { objs: [{ site: Z.id, kind: 'nest' }], label: 'Destroy the nest' })];
    return { steps, placements: [{ atStep: 1, site: Z.id, weight: 2 }, { atStep: 2, site: Z.id }], sites: { A: Z } };
  },
  retrieve(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['warehouse', 'alley', 'rooftop', 'vault'], { used });
    const C = pickSite(rng, S, ['plaza', 'market', 'locker', 'fountain'], { from: A, used });
    if (!A || !C) return null;
    c.vars.caseItem = rng.pick(c.caseItems);
    const item = { kind: 'case', name: c.vars.caseItem };
    const steps = [step('goto', { site: A.id, radius: 6, label: `Reach the ${SITE_NAMES[A.tag]}` }), step('kill', { target: 'all', site: A.id, optional: true, label: 'Deal with the guards (or sneak past)' }),
      step('pickup', { item, site: A.id, time: 1 }), step('goto', { site: C.id, radius: 4, label: 'Return it to the client' }), step('deliver', { site: C.id, item })];
    return { steps, placements: [{ atStep: 1, site: A.id, weight: 2, guard: true }, { atStep: 3, site: (nearest(S, ['alley', 'spawn_edge'], mid(A, C)) || C).id }], sites: { A, B: C } };
  },
  surveil(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['plaza', 'market', 'fountain', 'lobby'], { used });
    const X = pickSite(rng, S, ['relay', 'spawn_edge', 'alley'], { from: A, used, minD: 30 });
    if (!A || !X) return null;
    const shots = rng.int(1, 3);
    const steps = [step('goto', { site: A.id, radius: 10, label: 'Find the target' }), step('photo', { target: 'target', site: A.id, shots, holdTime: 2.5, maxDist: 14 }),
      step('exfil', { site: X.id, radius: 5 })];
    return { steps, placements: [{ atStep: 1, site: A.id, guard: true }], target: true, targetRank: 'grunt', sites: { A, B: X } };
  },
  bounty(rng, S, c) {
    const used = new Set();
    const a = pickSite(rng, S, ['*'], { used });
    const b = pickSite(rng, S, ['*'], { from: a, used, minD: 20, maxD: 80 });
    const t = pickSite(rng, S, ['*'], { from: b, used, minD: 15, maxD: 60 });
    if (!a || !b || !t) return null;
    const steps = [step('goto', { site: a.id, radius: 40, ping: 1, label: 'Informant ping: search the area' }), step('goto', { site: b.id, radius: 25, ping: 2, label: 'Second ping: closer' }),
      step('goto', { site: t.id, radius: 12, ping: 3, label: 'Target spotted' }), step('kill', { target: 'target', site: t.id, captureAllowed: true, captureBonus: 0.3 })];
    return { steps, placements: [{ atStep: 3, site: t.id, weight: 2, guard: true }], target: true, targetRank: c.grade === 'street' ? 'veteran' : 'elite', sites: { A: a, B: t } };
  },
  escort(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['plaza', 'park', 'market', 'fountain', 'dock', 'lobby'], { used });
    if (!A) return null;
    const path = [];
    let prev = A;
    const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) { const s = pickSite(rng, S, ['*'], { from: prev, used, minD: 25, maxD: 70 }); if (!s) break; path.push(s.id); prev = s; }
    if (path.length < 2) return null;
    c.vars.escortee = personName(rng);
    const npc = { id: 'escortee', name: c.vars.escortee, defId: 'escortee', site: A.id, speed: 3, stopRadius: 8 };
    const steps = [step('goto', { site: A.id, radius: 5, label: `Meet ${c.vars.escortee}` }), step('escort', { npc: 'escortee', path })];
    const k = rng.int(2, 3);
    const placements = [];
    for (let i = 0; i < k; i++) placements.push({ atStep: 1, pathIndex: Math.min(path.length - 1, i + 1), site: path[Math.min(path.length - 1, i + 1)], ambush: true });
    return { steps, placements, npc, sites: { A, B: S.find(s => s.id === path[path.length - 1]) } };
  },
  sabotage(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['warehouse', 'dock', 'rooftop', 'interior', 'market', 'plaza'], { used });
    if (!A) return null;
    const n = rng.int(2, 4);
    const objs = [];
    c.vars.object = rng.pick(SABOTAGE_OBJECTS);
    for (let i = 0; i < n; i++) {
      const s = pickSite(rng, S, SABOTAGE_SITES[c.vars.object], { from: A, used, minD: 0, maxD: 60 }) || pickSite(rng, S, ['*'], { from: A, used, minD: 0, maxD: 60 }) || A;
      objs.push({ site: s.id, kind: c.vars.object, hpMult: 3 });
    }
    const X = pickSite(rng, S, ['relay', 'spawn_edge', 'alley'], { from: A, used, minD: 30 }) || A;
    const steps = [step('goto', { site: A.id, radius: 8, label: `Reach the ${SITE_NAMES[A.tag]}` }), step('destroy', { objs, label: `Destroy the ${c.vars.object.replace('_', ' ')}s` }), step('exfil', { site: X.id, radius: 5 })];
    return { steps, placements: [{ atStep: 1, site: A.id, weight: 2, guard: true }, { atStep: 2, site: X.id }], sites: { A, B: X } };
  },
  hack(rng, S) {
    const used = new Set();
    const n = rng.int(2, 4);
    const sites = [];
    let prev = null;
    for (let i = 0; i < n; i++) { const s = pickSite(rng, S, ['lobby', 'interior', 'relay', 'rooftop', 'plaza', 'market'], { from: prev, used, minD: 20, maxD: 80 }); if (!s) break; sites.push(s); prev = s; }
    if (sites.length < 2) return null;
    const steps = [step('goto', { site: sites[0].id, radius: 5, label: 'Reach the first terminal' }), step('hack', { sites: sites.map(s => s.id), time: 4, ghostTime: 2, inOrder: true })];
    return { steps, placements: sites.map((s, i) => ({ atStep: 1, site: s.id, terminal: i, wave: true })), sites: { A: sites[0], B: sites[sites.length - 1] } };
  },
  tail(rng, S) {
    const used = new Set();
    const A = pickSite(rng, S, ['boulevard', 'market', 'park', 'plaza', 'fountain'], { used });
    const M = pickSite(rng, S, ['*'], { from: A, used, minD: 50, maxD: 140 });
    if (!A || !M) return null;
    const steps = [step('goto', { site: A.id, radius: 12, label: 'Pick up the target' }), step('tail', { target: 'target', minD: 5, maxD: 22, duration: rng.int(90, 150), loseTime: 8, endSite: M.id }),
      step('photo', { target: 'meeting', site: M.id, shots: 1, holdTime: 2.5, maxDist: 14 })];
    return { steps, placements: [{ atStep: 2, site: M.id, guard: true }], target: true, targetRank: 'grunt', sites: { A, B: M } };
  },
  infiltrate(rng, S) {
    const used = new Set();
    const A = pickSite(rng, S, ['interior', 'warehouse', 'vault', 'lobby'], { used });
    const X = pickSite(rng, S, ['relay', 'spawn_edge', 'alley'], { from: A, used, minD: 30 });
    if (!A || !X) return null;
    const steps = [step('goto', { site: A.id, radius: 6, restricted: true, label: 'Get inside' }), step('hack', { sites: [A.id], time: 3, plant: 'bug', label: 'Plant the bug' }), step('exfil', { site: X.id, radius: 5 })];
    return { steps, placements: [{ atStep: 1, site: A.id, weight: 2, guard: true }], alarmPenalty: { pay: 0.5, heat: 1 }, sites: { A, B: X } };
  },
  transport(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['warehouse', 'dock', 'market'], { used }) || pickSite(rng, S, ['*'], { used });
    const B = pickSite(rng, S, ['warehouse', 'dock', 'market', 'locker', 'plaza'], { from: A, used });
    if (!A || !B) return null;
    const item = { kind: 'crate', name: 'a heavy crate', heavy: true };
    const steps = [step('goto', { site: A.id, radius: 5, label: 'Collect the crate' }), step('pickup', { item, site: A.id, time: 1 }), step('goto', { site: B.id, radius: 5, label: `Haul it to the ${SITE_NAMES[B.tag]}` }), step('deliver', { site: B.id, item })];
    const m = mid(A, B);
    return { steps, placements: [{ atStep: 2, site: (nearest(S, ['alley', 'spawn_edge'], m) || B).id, ambush: true }, { atStep: 2, site: (nearest(S, ['spawn_edge', 'alley'], B, A.id) || B).id, ambush: true }], sites: { A, B } };
  },
  defend(rng, S, c) {
    const A = pickSite(rng, S, ['market', 'fountain', 'dock', 'pods', 'plaza']);
    if (!A) return null;
    const edges = sitesByTag(S, ['spawn_edge']);
    const spawns = (edges.length ? rng.sample(edges, rng.int(2, 3)) : [A]).map(s => s.id);
    const waves = rng.int(3, 5);
    c.vars.object = rng.pick(DEFEND_OBJECTS);
    const steps = [step('goto', { site: A.id, radius: 6, label: `Get to the ${c.vars.object}` }), step('defend', { site: A.id, object: c.vars.object, objHpMult: 10, waves, duration: rng.int(90, 150), spawns })];
    const placements = [];
    for (let w = 0; w < waves; w++) placements.push({ atStep: 1, site: spawns[w % spawns.length], wave: w + 1 });
    return { steps, placements, sites: { A, B: A } };
  },
  repo(rng, S, c) {
    const used = new Set();
    const a = pickSite(rng, S, ['*'], { used });
    const t = pickSite(rng, S, ['*'], { from: a, used, minD: 20, maxD: 80 });
    if (!a || !t) return null;
    const steps = [step('goto', { site: a.id, radius: 30, ping: 1, label: 'Last known location' }), step('goto', { site: t.id, radius: 12, ping: 2, label: 'Frame spotted' }), step('capture', { target: 'target', site: t.id, below: 0.2, time: 1.5 })];
    return { steps, placements: [{ atStep: 2, site: t.id }], target: true, targetRank: 'veteran', sites: { A: a, B: t } };
  },
  race(rng, S) {
    const used = new Set();
    const n = rng.int(6, 10);
    const cps = [];
    let prev = pickSite(rng, S, ['rooftop', 'plaza', 'fountain', 'market', 'park', 'locker'], { used });
    if (!prev) return null;
    cps.push(prev);
    for (let i = 1; i < n; i++) { const s = pickSite(rng, S, ['*'], { from: prev, used, minD: 25, maxD: 70 }); if (!s) break; cps.push(s); prev = s; }
    if (cps.length < 4) return null;
    let len = 0;
    for (let i = 1; i < cps.length; i++) len += dist(cps[i - 1], cps[i]);
    const par = Math.round(len / 4.2 * 1.25 + 10);
    const steps = [step('goto', { site: cps[0].id, radius: 5, label: 'Starting line' }), step('race', { checkpoints: cps.map(s => s.id), par, rivals: 2, firstBonus: 0.5 })];
    return { steps, placements: [], par, sites: { A: cps[0], B: cps[cps.length - 1] } };
  },
  assassinate(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['lobby', 'rooftop', 'dock', 'vault', 'plaza', 'fountain'], { used });
    const X = pickSite(rng, S, ['relay', 'spawn_edge', 'alley'], { from: A, used, minD: 30 });
    const F = pickSite(rng, S, ['pad', 'plaza', 'spawn_edge', 'alley'], { from: A, used, minD: 30, maxD: 90 });
    if (!A || !X) return null;
    const flees = rng.chance(0.3);
    const steps = [step('goto', { site: A.id, radius: 10, label: 'Find the target' }), step('kill', { target: 'target', site: A.id, fleeAt: flees ? 0.5 : null, fleeSite: flees && F ? F.id : null }), step('exfil', { site: X.id, radius: 5 })];
    return { steps, placements: [{ atStep: 1, site: A.id, weight: 2, guard: true, bodyguards: true }], target: true, targetRank: c.grade === 'pro' ? 'veteran' : 'elite', sites: { A, B: X } };
  },
  rescue(rng, S, c) {
    const used = new Set();
    const A = pickSite(rng, S, ['warehouse', 'interior', 'pods', 'alley', 'vault'], { used });
    if (!A) return null;
    const p1 = pickSite(rng, S, ['*'], { from: A, used, minD: 25, maxD: 70 });
    const E = pickSite(rng, S, ['relay', 'pad', 'plaza', 'spawn_edge'], { from: p1 || A, used, minD: 25, maxD: 80 });
    if (!p1 || !E) return null;
    c.vars.escortee = personName(rng);
    const npc = { id: 'hostage', name: c.vars.escortee, defId: 'escortee', site: A.id, speed: 3, stopRadius: 8 };
    const steps = [step('goto', { site: A.id, radius: 6, label: `Find ${c.vars.escortee}` }), step('hack', { sites: [A.id], time: 4, label: 'Cut the cuffs' }),
      step('escort', { npc: 'hostage', path: [p1.id, E.id] }), step('defend', { site: E.id, object: 'evac', objHpMult: 0, protect: 'hostage', waves: 1, duration: 30, spawns: [(nearest(S, ['spawn_edge'], E) || E).id] })];
    return { steps, placements: [{ atStep: 1, site: A.id, weight: 2, guard: true }, { atStep: 2, site: p1.id, ambush: true }, { atStep: 3, site: (nearest(S, ['spawn_edge'], E) || E).id, wave: 1 }], npc, sites: { A, B: E } };
  },
  heist(rng, S, c) {
    const used = new Set();
    const V = pickSite(rng, S, ['vault', 'interior', 'warehouse', 'dock'], { used });
    if (!V) return null;
    const h1 = pickSite(rng, S, ['interior', 'lobby', 'relay', 'rooftop', 'warehouse', 'dock'], { from: V, used, minD: 20, maxD: 70 });
    const h2 = pickSite(rng, S, ['interior', 'lobby', 'relay', 'rooftop', 'warehouse', 'dock'], { from: h1 || V, used, minD: 20, maxD: 70 });
    const X = pickSite(rng, S, ['relay', 'spawn_edge', 'pad', 'alley'], { from: V, used, minD: 40 });
    if (!h1 || !h2 || !X) return null;
    c.vars.caseItem = rng.pick(c.caseItems);
    const item = { kind: 'case', name: c.vars.caseItem };
    const steps = [step('photo', { target: 'vault', site: V.id, shots: 1, holdTime: 2.5, maxDist: 14, label: 'Case the vault', checkpoint: true }),
      step('hack', { sites: [h1.id, h2.id], time: 4, ghostTime: 2, inOrder: true, checkpoint: true }), step('pickup', { item, site: V.id, time: 1.5, checkpoint: true }), step('exfil', { site: X.id, radius: 5 })];
    return { steps, placements: [{ atStep: 1, site: h1.id, guard: true }, { atStep: 2, site: V.id, weight: 2, guard: true }, { atStep: 3, site: X.id, ambush: true }], heat: 2, sites: { A: V, B: X } };
  },
  wetwork(rng, S, c) { return BUILDERS.assassinate(rng, S, c); },
};

function mid(a, b) { return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; }

// ---- twists --------------------------------------------------------------------------------

function twistChance(ctx, grade, arch) {
  if (grade === 'story') return 0;
  if (arch.twistAlways) return 1;
  return Math.min(0.3, 0.1 + 0.005 * ctx.riderLevel) + (grade === 'black' ? 0.2 : 0);
}

function stepIndex(steps, types) {
  const t = [].concat(types);
  return steps.findIndex(s => t.includes(s.type));
}

function buildTwist(rng, id, m, S, ctx, built) {
  const T = TWISTS[id];
  const tw = { id, name: T.name, sting: T.sting };
  const steps = m.steps;
  const at = T.at;
  if (at === 'start') tw.atStep = 0;
  else if (at === 'end') tw.atStep = steps.length - 1;
  else if (at === 'payout') tw.atStep = steps.length;
  else if (at === 'mid') tw.atStep = Math.floor(steps.length / 2);
  else if (at === 'combat') tw.atStep = m.enemies.length ? m.enemies[0].atStep : Math.max(0, stepIndex(steps, 'kill'));
  else if (at === 'lowHp') tw.atStep = stepIndex(steps, ['kill', 'capture']);
  else if (at === 'goto') { const gs = steps.map((s, i) => (s.type === 'goto' ? i : -1)).filter(i => i >= 0); tw.atStep = gs.length ? rng.pick(gs) : 0; }
  else tw.atStep = stepIndex(steps, at);
  if (tw.atStep < 0) return null;
  const here = steps[Math.min(tw.atStep, steps.length - 1)];
  const hereSite = S.find(s => s.id === (here.site || here.sites?.[0] || here.path?.[0])) || built.sites.A;
  switch (id) {
    case 'T1': {
      const elite = { defId: FACTION_ELITE[m.faction] || 'chromehead', rank: 'elite', level: m.level, eliteMods: rng.sample(ELITE_MODS.map(e => e.id), 2) };
      const grunts = Array.from({ length: 4 }, () => ({ defId: FACTION_TARGET[m.faction] || 'knuckle', rank: 'grunt', level: m.level }));
      tw.payMult = T.payMult; tw.loot = 'case'; tw.enemies = [{ units: [elite, ...grunts], site: hereSite.id }];
      break;
    }
    case 'T2': { const s = pickSite(rng, S, ['*'], { from: hereSite, minD: 60, maxD: 100 }) || built.sites.B; tw.steps = [step('goto', { site: s.id, radius: 10, label: 'Chase the real target' }), step(here.type === 'photo' ? 'photo' : 'kill', { target: 'realTarget', site: s.id, shots: 1, holdTime: 2.5, maxDist: 14 })]; tw.realTarget = makeTarget(rng, m.faction, m.target?.rank || 'veteran', m.archetype); break; }
    case 'T3': tw.enemies = [{ units: [{ defId: 'rival_rider', rank: 'veteran', level: m.level }, { defId: 'rival_rider', rank: 'veteran', level: m.level }], site: built.sites.A.id, rivals: true }]; break;
    case 'T4': { const f = nearest(S, ['fountain'], hereSite) || nearest(S, ['relay', 'alley'], hereSite) || hereSite; tw.delay = T.delay; tw.timer = T.timer; tw.payMult = T.payMult; tw.steps = [step('goto', { site: f.id, radius: 4, label: 'Dump the bomb in the water', timer: T.timer }), step('deliver', { site: f.id, item: { kind: 'bomb', name: 'the ticking parcel' }, dispose: true })]; break; }
    case 'T5': tw.steps = [step('choose', { options: [{ label: 'Finish the job.', outcome: 'kill' }, { label: 'Fake it and let them go.', outcome: 'spare', payMult: 0.6, rep: { unlinked: 10 }, giftChance: 0.3 }] })]; tw.rep = { kill: { unlinked: -8 } }; break;
    case 'T6': { const x = pickSite(rng, S, ['relay', 'spawn_edge'], { from: hereSite, minD: 30 }) || hereSite; tw.heat = T.heat; tw.payMult = T.payMult; tw.clientRep = T.clientRep; tw.steps = [step('survive', { seconds: 45, orExfil: x.id })]; break; }
    case 'T7': { const s = pickSite(rng, S, ['plaza', 'park', 'relay', 'market'], { from: hereSite, minD: 30, maxD: 100 }) || built.sites.B; tw.payMult = T.payMult; tw.npc = { id: 'stowaway', name: personName(rng), defId: 'escortee', site: hereSite.id, speed: 3, stopRadius: 8 }; tw.replaceRest = true; tw.steps = [step('escort', { npc: 'stowaway', path: [s.id] })]; break; }
    case 'T8': tw.enemies = [{ units: [championUnit(rng, m.faction, m.level, null)], site: hereSite.id }]; break;
    case 'T9': tw.collectPay = T.collectPay; break;
    case 'T10': tw.clue = true; tw.fallbackCreditMult = T.fallbackCreditMult; break;
    case 'T11': tw.steps = [step('choose', { options: [{ label: `Stick with ${m.client.name}.`, outcome: 'stay' }, { label: 'Switch sides.', outcome: 'switch', payMult: 1.2, rep: { [m.client.faction]: -5 } }] })]; break;
    case 'T12': tw.threshold = T.threshold; tw.steps = [step('choose', { options: [{ label: 'Finish the job.', outcome: 'finish' }, { label: `Take the bribe (${Math.round(T.bribePay * 100)}% now).`, outcome: 'bribe', payMult: T.bribePay, fail: true, clientRep: T.clientRep }] })]; break;
  }
  return tw;
}

// ---- payouts ---------------------------------------------------------------------------------

// ctx: {riderLevel, repMul (fn faction -> mul), creditsPct, heatMult}
export function missionPayout(m, ctx = {}) {
  const arch = ARCHETYPES[m.archetype] || { pay: 1, xp: 1 };
  const grade = GRADES[m.grade];
  const threat = threatDef(m.threat);
  const modPay = m.modifiers.reduce((a, id) => a + (MODIFIERS[id]?.pay || 0), 0);
  const repMul = ctx.repMul ? ctx.repMul(m.client.faction) : 1;
  const Lm = L(m.level);
  const credits = round5(PAYOUT_BASE.credits * Lm * arch.pay * grade.pay * threat.credits * (1 + modPay) * repMul * (1 + (ctx.creditsPct || 0)));
  const xpRaw = PAYOUT_BASE.xp * Lm * arch.xp * grade.xp * threat.xp;
  const xp = Math.round(xpRaw * overLevelPenalty(ctx.riderLevel ?? m.level, m.level));
  const rep = {};
  if (!['unknown'].includes(m.client.faction)) rep[m.client.faction] = REP_RULES.forClient[m.grade] ?? 3;
  if (m.faction && m.faction !== m.client.faction) rep[m.faction] = (rep[m.faction] || 0) + (REP_RULES.againstTarget[m.grade] ?? -4);
  return { credits, xp, rep, cache: m.grade };
}

// result: {alarm, hpLost, time, collateral, captured, twistOutcome:{outcome,payMult,fail}, rental, heatMult, stiffed}
export function completionRewards(m, result = {}, ctx = {}) {
  const base = m.payout;
  const bonuses = [];
  if (!result.alarm) bonuses.push(['stealth', BONUSES.stealth]);
  if (!result.hpLost) bonuses.push(['flawless', BONUSES.flawless]);
  if (result.time != null && m.parTime && result.time <= m.parTime) bonuses.push(['speed', BONUSES.speed]);
  if (!result.collateral) bonuses.push(['clean', BONUSES.clean]);
  let mult = 1 + bonuses.reduce((a, [, v]) => a + v, 0);
  if (m.alarmPenalty && result.alarm) mult *= m.alarmPenalty.pay;
  if (result.captured && m.steps.some(s => s.captureAllowed)) mult *= 1 + (m.steps.find(s => s.captureAllowed).captureBonus || 0);
  const tw = m.twist;
  if (tw && result.twistFired !== false) {
    if (tw.payMult && !['T5', 'T11', 'T12'].includes(tw.id)) mult *= tw.payMult;
    if (result.twistOutcome?.payMult) mult *= result.twistOutcome.payMult;
  }
  if (result.raceFirst) mult *= 1.5;
  let credits = Math.round(base.credits * mult * (result.heatMult || ctx.heatMult || 1));
  let surcharge = 0;
  if (result.rental) { surcharge = Math.round(credits * 0.1); credits -= surcharge; }
  const stiffed = tw?.id === 'T9' && result.twistFired !== false;
  return {
    credits: stiffed ? 0 : credits, surcharge: stiffed ? 0 : surcharge, stiffed,
    bonuses: bonuses.map(([id, v]) => ({ id, pct: v })), xp: base.xp, rep: { ...base.rep }, cache: m.grade,
  };
}

// ---- contract generation ---------------------------------------------------------------------

function districtWeights(ctx) {
  const unlocked = ctx.districts;
  const cur = ctx.currentDistrict;
  const others = unlocked.filter(d => d.id !== cur);
  return { cur, others };
}

function chooseFaction(rng, district, arch, clientFaction) {
  if (arch.faction) return arch.faction;
  let pool = DISTRICTS[district].pools.filter(([f]) => f !== clientFaction);
  if (!pool.length) pool = DISTRICTS[district].pools;
  return rng.weighted(pool);
}

function rollModifiers(rng, arch, grade, level, combat) {
  const [lo, hi, p] = GRADES[grade].mods;
  let n = grade === 'street' ? (rng.chance(p) ? 1 : 0) : rng.int(lo, hi);
  const pool = Object.values(MODIFIERS).filter(md =>
    level >= md.unlock && (!md.only || md.only.includes(arch.id)) && (!md.except || !md.except.includes(arch.id)) && (!md.minCombat || combat >= md.minCombat));
  const out = [];
  for (let i = 0; i < n; i++) {
    const cands = pool.filter(md => !out.includes(md.id) && !MODIFIER_CONFLICTS.some(([a, b]) => (a === md.id && (out.includes(b) || b === arch.id)) || (b === md.id && (out.includes(a) || a === arch.id))));
    if (!cands.length) break;
    out.push(rng.pick(cands).id);
  }
  return out;
}

export function missionLevel(ctx, gradeId, districtId, rng) {
  const threat = threatDef(ctx.threat);
  if (threat.fixedLevel) return threat.fixedLevel;
  const d = DISTRICTS[districtId];
  const danger = ctx.danger?.[districtId] ?? d.danger;
  const raw = ctx.riderLevel + threat.lvlOff + Math.floor(danger / 2) + GRADES[gradeId].lvlOff + rng.int(-1, 0);
  return Math.max(1, clamp(raw, d.minLvl, d.maxLvl + 5));
}

// ctx: see generateBoard. opts: {grade, archetype, district, id, forceTwist, noTwist}
export function generateContract(rng, ctx, opts) {
  stepSeq = 0;
  const arch = ARCHETYPES[opts.archetype];
  const grade = opts.grade;
  const district = opts.district;
  const S = sitesFor(district, ctx.sites);
  const flags = ctx.flags instanceof Set ? ctx.flags : new Set(ctx.flags || []);
  const client = makeClient(rng, flags, arch.id);
  const faction = chooseFaction(rng, district, arch, client.faction);
  const level = missionLevel(ctx, grade, district, rng);
  const caseItems = CASE_ITEMS.concat(...Object.entries(CASE_ITEMS_BY_FLAG).filter(([f]) => flags.has(f)).map(([, v]) => v));
  const c = { grade, level, vars: {}, caseItems };
  const built = BUILDERS[arch.id](rng, S, c);
  if (!built) return null;
  const threat = threatDef(ctx.threat);
  const m = {
    id: opts.id || `c_${(hash32(ctx.seed, ctx.shiftIndex, opts.slot ?? 0, rng.int(0, 1e9)) % 1e6).toString().padStart(6, '0')}`,
    seed: rng.int(1, 2 ** 31 - 1), archetype: arch.id, type: arch.type, name: arch.name, grade, threat: threat.id === 'overclock' ? `overclock:${threat.n}` : threat.id,
    district, districtName: DISTRICTS[district].name, level, client, faction, target: null, npcs: [], steps: built.steps, modifiers: [], timeLimit: null,
    parTime: built.par || arch.par, twist: null, enemies: [], heat: (arch.heat || 0) + (GRADES[grade].heat || 0), checkpoints: !!arch.checkpoints,
    stealthy: !!arch.stealthy, alarmPenalty: built.alarmPenalty || null, bonuses: ['stealth', 'flawless', 'speed', 'clean'],
  };
  if (built.target) {
    let rank = built.targetRank || 'veteran';
    if (grade === 'elite' && ['bounty', 'assassinate', 'wetwork'].includes(arch.id)) rank = 'champion';
    m.target = makeTarget(rng, faction, rank, arch.id);
  }
  if (built.npc) m.npcs.push(built.npc);
  m.modifiers = rollModifiers(rng, arch, grade, level, arch.combat);
  if (m.modifiers.includes('timed')) m.timeLimit = Math.round(m.parTime * 1.3);
  if (m.modifiers.includes('broadcast')) m.heat += 1;

  // enemies
  const gradeCombat = GRADES[grade].combat;
  let budget = enemyBudget(level, arch.combat, gradeCombat);
  if (m.modifiers.includes('reinforced')) built.placements.push({ ...(built.placements[built.placements.length - 1] || { atStep: built.steps.length - 1, site: built.sites.A.id }), reinforcement: true }), budget *= 1.2;
  const danger = ctx.danger?.[district] ?? DISTRICTS[district].danger;
  const eliteChance = 0.04 + 0.015 * danger + (ELITE_PACK_BONUS[grade] || 0);
  m.enemies = buildEnemies(rng, {
    level, faction, placements: built.placements, budget, danger, grade, districtPacks: DISTRICTS[district].packs,
    elitePack: built.placements.length > 0 && (m.modifiers.includes('elitePack') || rng.chance(eliteChance)),
  });
  if (m.target) {
    const tgtSite = built.steps.find(s => s.target === 'target')?.site || built.sites.A.id;
    m.target.site = tgtSite;
  }
  if (GRADES[grade].champion && m.target && built.placements.length) {
    // the elite grade's "champion target" (MISSIONS §7)
    m.target.rank = 'champion';
  } else if (GRADES[grade].champion && built.placements.length) {
    m.enemies.push({ pack: 'champion', faction, atStep: built.placements[0].atStep, site: built.placements[0].site, units: [championUnit(rng, faction, level)], champion: true });
  }

  // twist
  const onboarding = (ctx.contractsDone ?? 99);
  let twistId = null;
  if (!opts.noTwist && onboarding >= 3) {
    if (onboarding === 3 && arch.twists.includes('T10')) twistId = 'T10';
    else if (opts.forceTwist) twistId = opts.forceTwist;
    else if (rng.chance(twistChance(ctx, grade, arch))) {
      const pool = ctx.twists ? arch.twists.filter(t => ctx.twists.includes(t)) : arch.twists;
      if (pool.length) twistId = rng.pick(pool);
    }
  }
  if (twistId) m.twist = buildTwist(rng, twistId, m, S, ctx, built);

  // names
  const v = {
    Parcel: cap(c.vars.parcel || rng.pick(PARCELS)), parcel: c.vars.parcel, Surname: rng.pick(SURNAMES), First: rng.pick(FIRST_NAMES),
    CaseItem: cap(c.vars.caseItem || rng.pick(caseItems)), caseItem: c.vars.caseItem, Site: SITE_NAMES[built.sites.A.tag] || 'Plaza', Object: cap((c.vars.object || 'kiosk').replace('_', ' ')),
    object: (c.vars.object || 'kiosk').replace('_', ' '), Nickname: m.target?.nickname || rng.pick(NICKNAMES), Epithet: m.target?.epithet || rng.pick(EPITHETS),
    Name: m.target?.name || personName(rng), Org: client.org, Num: rng.int(10, 99), siteA: (SITE_NAMES[built.sites.A.tag] || 'plaza').toLowerCase(),
    siteB: (SITE_NAMES[built.sites.B?.tag] || 'plaza').toLowerCase(), target: m.target ? m.target.name : 'the target', escortee: c.vars.escortee || 'the client', district: DISTRICTS[district].name,
  };
  if (arch.id === 'surveil' || arch.id === 'tail') v.First = m.target?.name.split(' ')[0] || v.First;
  if (arch.id === 'escort' || arch.id === 'rescue') v.First = (c.vars.escortee || v.First).split(' ')[0];
  m.title = fillTemplate(rng.pick(TITLES[arch.id]), v);
  const [verb, obj, place] = BLURBS[arch.id];
  const who = client.name === 'Anonymous' ? client.org : `${client.name} of ${client.org}`;
  m.blurb = `${who} ${verb} ${fillTemplate(obj, v)} ${fillTemplate(place, v)}. ${rng.pick(TAGLINES)}`;
  m.payout = missionPayout(m, ctx);
  m.difficulty = clamp(GRADES[grade].difficulty + (m.modifiers.length > 1 ? 1 : 0) - (threat.id === 'calm' ? 1 : 0) + (['hostile', 'lethal', 'nightmare', 'overclock'].includes(threat.id) ? 1 : 0), 1, 5);
  return m;
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Board (MISSIONS §10).
// ctx: {seed, shiftIndex, reroll=0, riderLevel, threat, heatStars, frameArchetype, districts:[{id}], currentDistrict,
//       danger:{id:n}, contractsDone, flags:Set|[], sites:{districtId:[site]}, repMul(faction), creditsPct, storyCard (mission or null)}
export function generateBoard(ctx) {
  const rng = rngFor(ctx.seed, 'board', ctx.shiftIndex, ctx.reroll || 0);
  const lvl = ctx.riderLevel;
  const slots = 6 + (lvl >= 10 ? 1 : 0) + (lvl >= 20 ? 1 : 0);
  const grades = [];
  for (let i = 0; i < slots; i++) {
    let g = 'street';
    if (i === 2 || i === 3) g = lvl >= 5 && rng.chance(0.5) ? 'pro' : 'street';
    else if (i === 4) g = lvl >= 15 && rng.chance(0.5) ? 'elite' : lvl >= 5 ? 'pro' : 'street';
    else if (i >= 6) g = rng.pick(['street', lvl >= 5 ? 'pro' : 'street', lvl >= 15 ? 'elite' : 'street']);
    grades.push(g);
  }
  if ((ctx.heatStars || 0) >= 3) grades[rng.int(0, slots - 1)] = 'black';
  const { cur, others } = districtWeights(ctx);
  const counts = {};
  const biasSlot = rng.int(0, slots - 1);
  const cards = [];
  for (let i = 0; i < slots; i++) {
    const grade = grades[i];
    let district = cur;
    if (others.length && rng.chance(0.4)) district = rng.weighted(others.map((d, k) => [d.id, 1 + k]));
    const S = sitesFor(district, ctx.sites);
    const tagSet = new Set(S.map(s => s.tag));
    const avail = Object.values(ARCHETYPES).filter(a =>
      lvl >= a.unlock && a.grades.includes(grade) && (!ctx.archetypes || ctx.archetypes.includes(a.id)) && (counts[a.id] || 0) < 2 && (a.sites.includes('*') || a.sites.some(t => tagSet.has(t))));
    let card = null;
    for (let tries = 0; tries < 6 && !card; tries++) {
      const pool = avail.filter(a => (counts[a.id] || 0) < 2);
      if (!pool.length) break;
      const bias = i === biasSlot ? FRAME_BIAS[ctx.frameArchetype] || [] : [];
      const arch = rng.weighted(pool.map(a => [a, a.weight * (bias.includes(a.id) ? 3 : 1)]));
      card = generateContract(rng, ctx, { grade, archetype: arch.id, district, slot: i });
      if (card) {
        if (bias.includes(arch.id)) card.badge = `Suits your ${cap(ctx.frameArchetype === 'brawler' ? 'Brawler' : ctx.frameArchetype === 'gunner' ? 'Gunner' : 'Ghost')}`;
        counts[arch.id] = (counts[arch.id] || 0) + 1;
      }
    }
    if (card) cards.push(card);
  }
  return { shift: ctx.shiftIndex, reroll: ctx.reroll || 0, cards, story: ctx.storyCard || null };
}

// ---- validation ------------------------------------------------------------------------------

export function validateMission(m, sites) {
  const errors = [];
  const ids = new Set((sites || sitesFor(m.district)).map(s => s.id));
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(m.id && m.title && m.blurb, 'missing id/title/blurb');
  need(Number.isFinite(m.level) && m.level >= 1, 'bad level');
  need(m.steps?.length > 0, 'no steps');
  need(m.steps.some(s => !s.optional), 'no required steps');
  need(Number.isFinite(m.payout?.credits) && m.payout.credits > 0 && Number.isFinite(m.payout.xp) && m.payout.xp > 0, 'bad payout');
  if (m.timeLimit != null) need(m.timeLimit >= m.parTime, 'time limit under par');
  let carrying = false;
  const stepIds = new Set();
  const checkStep = (s, where) => {
    need(STEP_TYPES.includes(s.type), `${where}: unknown step type ${s.type}`);
    need(!stepIds.has(s.id), `${where}: duplicate step id ${s.id}`);
    stepIds.add(s.id);
    const siteOk = id => need(ids.has(id), `${where}: unknown site ${id}`);
    switch (s.type) {
      case 'goto': siteOk(s.site); need(s.radius > 0, `${where}: radius`); break;
      case 'exfil': siteOk(s.site); need(s.radius > 0, `${where}: radius`); carrying = false; break;
      case 'pickup': siteOk(s.site); need(s.item?.kind, `${where}: item`); carrying = true; break;
      case 'deliver': siteOk(s.site); need(carrying || s.dispose, `${where}: deliver without pickup`); carrying = false; break;
      case 'kill': need(['all', 'target', 'realTarget', 'boss'].includes(s.target), `${where}: kill target`); if (s.site) siteOk(s.site);
        if (s.target === 'target') need(m.target, `${where}: kill needs mission.target`);
        if (s.target === 'boss') need(m.boss?.defId, `${where}: kill needs mission.boss`); break;
      case 'killCount': need(s.n > 0, `${where}: n`); break;
      case 'destroy': need(s.objs?.length > 0, `${where}: objs`); s.objs?.forEach(o => siteOk(o.site)); break;
      case 'hack': need(s.sites?.length > 0 && s.time > 0, `${where}: hack sites/time`); s.sites?.forEach(siteOk); break;
      case 'photo': siteOk(s.site); need(s.shots >= 1 && s.holdTime > 0, `${where}: photo params`); if (s.target === 'target') need(m.target, `${where}: photo needs target`); break;
      case 'tail': need(m.target && s.duration > 0 && s.maxD > s.minD, `${where}: tail params`); if (s.endSite) siteOk(s.endSite); break;
      case 'escort': need(s.path?.length >= 1, `${where}: escort path`); s.path?.forEach(siteOk);
        need(m.npcs.some(n => n.id === s.npc) || m.twist?.npc?.id === s.npc, `${where}: escort npc ${s.npc} missing`); break;
      case 'defend': siteOk(s.site); need(s.duration > 0 && s.waves >= 1, `${where}: defend params`); s.spawns?.forEach(siteOk); break;
      case 'race': need(s.checkpoints?.length >= 2 && s.par > 0, `${where}: race params`); s.checkpoints?.forEach(siteOk); break;
      case 'capture': need(m.target, `${where}: capture needs target`); if (s.site) siteOk(s.site); break;
      case 'choose': need(s.options?.length >= 2, `${where}: choose options`); break;
      case 'survive': need(s.seconds > 0, `${where}: survive seconds`); if (s.orExfil) siteOk(s.orExfil); break;
    }
  };
  m.steps.forEach((s, i) => checkStep(s, `step ${i}`));
  need(!carrying, 'mission ends while still carrying the item');
  need(m.steps[m.steps.length - 1].type !== 'choose', 'ends on a choice');
  for (const e of m.enemies) {
    need(e.atStep >= 0 && e.atStep < m.steps.length, `enemy pack atStep ${e.atStep} out of range`);
    need(ids.has(e.site), `enemy pack site ${e.site}`);
    need(e.units?.length > 0, 'empty enemy pack');
  }
  if (m.twist) {
    need(TWISTS[m.twist.id], 'unknown twist');
    need(m.twist.atStep >= 0 && m.twist.atStep <= m.steps.length, 'twist atStep out of range');
    (m.twist.steps || []).forEach((s, i) => checkStep(s, `twist step ${i}`));
    (m.twist.enemies || []).forEach(e => need(ids.has(e.site) && e.units.length, 'twist enemies'));
  }
  if (m.npcs) for (const n of m.npcs) need(ids.has(n.site), `npc site ${n.site}`);
  return { ok: errors.length === 0, errors };
}

export { ARCHETYPES, GRADES, THREATS, MODIFIERS, TWISTS };
