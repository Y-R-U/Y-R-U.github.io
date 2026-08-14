#!/usr/bin/env node
// Checks the quest, dialogue, truth and area packs. This is what makes "adding a quest needs no
// code change" true rather than merely permitted.
//
//   node tools/lintQuests.mjs
//   node tools/lintQuests.mjs --quiet     only the summary line

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseQuests, normaliseDialogue, normaliseAreas } from '../js/game/questdef.js';
import { findLevelTerms } from '../js/game/predicate.js';
import { SCHOOLS } from '../js/sim/schools.js';
import { ENEMIES, CATCH, FORAGE, ROCK, ITEM_VALUE, SHOP } from '../js/sim/tables.js';
import { SPELLS } from '../js/sim/spells.js';
import { QUESTS, SANDBOX, ACTS } from '../js/sim/campaign.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const KINDS = new Set([
  ...Object.keys(ENEMIES),
  ...Object.values(CATCH).flat().map(e => e.id),
  ...Object.values(FORAGE).flat().map(e => e.id),
  ...Object.values(ROCK).map(r => r.item),
]);
const ITEMS = new Set([...Object.keys(ITEM_VALUE), ...Object.keys(SHOP), ...KINDS]);
const STORY_IDS = new Set([...QUESTS, ...SANDBOX].map(q => q.id));

const known = (set, id) => set.has(id) || (id.startsWith('cooked_') && set.has(id.slice(7)));

// The playable box from js/world/terrain.js — the mesh inset 40 m. Copied rather than imported
// because terrain.js pulls in three.
const PLAY = { x0: -680, x1: 680, z0: -360, z1: 280 };
const CAMPAIGN_IDS = ['light', 'dark', 'neutral'];
const RECOVER = { moveTo: 'area', respawn: 'enemy', grant: 'item', arm: 'object', sound: 'any' };

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));

export function lintAll(root = ROOT) {
  const errors = [], warnings = [];
  const data = join(root, 'data');
  const need = f => {
    const p = join(data, f);
    if (!existsSync(p)) { errors.push(`data/${f} is missing`); return null; }
    try { return readJson(p); } catch (e) { errors.push(`data/${f}: ${e.message}`); return null; }
  };

  const areasRaw = need('areas.json');
  const truths = need('truths.json') || {};
  const packNames = need('quests/index.json') || [];

  const { areas, errors: areaErrors } = normaliseAreas(areasRaw || []);
  errors.push(...areaErrors);

  const defs = {}, dialogue = {};
  if (!Array.isArray(packNames)) errors.push('data/quests/index.json: must be an array of pack names');

  for (const pack of Array.isArray(packNames) ? packNames : []) {
    const qRaw = need(`quests/${pack}.json`);
    if (qRaw) {
      const r = normaliseQuests(qRaw, { pack });
      errors.push(...r.errors);
      warnings.push(...r.warnings);
      for (const [id, d] of Object.entries(r.defs)) {
        if (defs[id]) errors.push(`${id}: defined in more than one pack`);
        defs[id] = d;
      }
    }
    const dPath = join(data, `dialogue/${pack}.json`);
    if (existsSync(dPath)) {
      const r = normaliseDialogue(readJson(dPath), { pack });
      errors.push(...r.errors);
      warnings.push(...r.warnings);
      Object.assign(dialogue, r.nodes);
    }
  }

  const areaId = id => !!areas[id];
  // `wwa.granary.lamp` is an object inside `wwa.granary`; the nearest declared ancestor is enough.
  const underKnownArea = id => {
    const bits = id.split('.');
    for (let i = bits.length - 1; i > 0; i--) if (areas[bits.slice(0, i).join('.')]) return true;
    return false;
  };

  errors.push(...areaGeometryErrors(areas));

  const nodeOwners = {};
  for (const [id, n] of Object.entries(dialogue)) {
    for (const l of n.lines) (nodeOwners[l[0]] ||= []).push(id);
  }

  for (const def of Object.values(defs)) {
    const p = def.id;
    if (def.story && !STORY_IDS.has(def.story)) {
      errors.push(`${p}: story id ${def.story} is not in sim/campaign.js — rewards cannot be generated`);
    }
    if (!def.story && !def.board) warnings.push(`${p}: no \`story\` id, so it pays nothing`);
    if (def.board && !def.board.school) warnings.push(`${p}: a board post with no `+'`board.school`'+` pays nothing`);
    errors.push(...findLevelTerms(def.prereq, `${p}.prereq`));

    if (def.giver && !nodeOwners[def.giver]) warnings.push(`${p}: giver ${def.giver} has no dialogue node`);
    if (def.turnin && !nodeOwners[def.turnin]) warnings.push(`${p}: turnin ${def.turnin} has no dialogue node`);
    if (def.town && !Object.values(areas).some(a => a.town === def.town)) {
      warnings.push(`${p}: town ${def.town} has no areas`);
    }
    for (const t of def.reward.truths) if (!truths[t]) errors.push(`${p}: unknown truth ${t}`);
    for (const [item] of def.reward.items) {
      if (!known(ITEMS, item)) warnings.push(`${p}: reward item ${item} is not in sim/tables.js`);
    }
    for (const e of def.onDone) {
      if (e[0] === 'truth' && !truths[e[1]]) errors.push(`${p}.onDone: unknown truth ${e[1]}`);
      if (e[0] === 'dialogue' && !dialogue[e[1]]) errors.push(`${p}.onDone: unknown dialogue node ${e[1]}`);
      if (e[0] === 'unlock' && !defs[e[1]] && !CAMPAIGN_IDS.includes(e[1])) {
        errors.push(`${p}.onDone: unlocks ${e[1]}, which is neither a quest nor a campaign`);
      }
    }

    for (const s of def.steps) {
      const sp = `${p}.${s.id}`;
      if (s.in && !areaId(s.in)) errors.push(`${sp}: unknown area ${s.in}`);
      if (s.verb && !SCHOOLS.includes(s.verb) && !SPELLS[s.verb]) {
        errors.push(`${sp}: verb ${s.verb} is not a school or a spell`);
      }
      for (const e of s.onDone || []) {
        if (e[0] === 'dialogue' && !dialogue[e[1]]) errors.push(`${sp}.onDone: unknown dialogue node ${e[1]}`);
        if (e[0] === 'truth' && !truths[e[1]]) errors.push(`${sp}.onDone: unknown truth ${e[1]}`);
      }
      // A recover action that names nothing is a "Reset this step" button that does nothing, and
      // the player only ever presses it when already stuck.
      for (const a of s.recover || []) {
        const want = RECOVER[a[0]];
        if (!want) { errors.push(`${sp}.recover: ${a[0]} is not one of ${Object.keys(RECOVER).join(' | ')}`); continue; }
        if (want === 'area' && !areaId(a[1])) errors.push(`${sp}.recover: moveTo unknown area ${a[1]}`);
        if (want === 'enemy' && !ENEMIES[a[1]]) errors.push(`${sp}.recover: respawn unknown enemy ${a[1]}`);
        if (want === 'item' && !known(ITEMS, a[1])) errors.push(`${sp}.recover: grant unknown item ${a[1]}`);
        if (want === 'object' && !areaId(a[1]) && !underKnownArea(a[1])) {
          errors.push(`${sp}.recover: arm ${a[1]} is not under any declared area`);
        }
      }
      for (const o of s.objectives) {
        switch (o.k) {
          case 'kill':
            if (!ENEMIES[o.kind]) errors.push(`${sp}: unknown enemy ${o.kind}`);
            break;
          case 'gather':
            if (!known(KINDS, o.kind)) errors.push(`${sp}: unknown gather kind ${o.kind}`);
            break;
          case 'deliver':
            if (!known(ITEMS, o.item)) errors.push(`${sp}: unknown item ${o.item}`);
            if (o.to && !nodeOwners[o.to] && !areaId(o.to)) warnings.push(`${sp}: deliver target ${o.to} is neither a speaking npc nor an area`);
            break;
          case 'goto':
            if (!areaId(o.area)) errors.push(`${sp}: unknown area ${o.area}`);
            break;
          case 'survive':
            if (!areaId(o.area)) errors.push(`${sp}: unknown area ${o.area}`);
            break;
          case 'talk':
            if (o.node && !dialogue[o.node]) errors.push(`${sp}: unknown dialogue node ${o.node}`);
            if (o.node && dialogue[o.node] && !nodeOwners[o.npc]?.includes(o.node)) {
              warnings.push(`${sp}: ${o.npc} does not speak in ${o.node}`);
            }
            break;
          case 'interact':
            if (o.id.includes('.') && !underKnownArea(o.id)) warnings.push(`${sp}: interact id ${o.id} is not under any declared area`);
            break;
        }
      }
    }
  }

  for (const [id, n] of Object.entries(dialogue)) {
    for (const c of n.choices || []) {
      if (c.goto && !dialogue[c.goto]) errors.push(`${id}: choice goes to unknown node ${c.goto}`);
      for (const e of c.sets || []) if (e[0] === 'truth' && !truths[e[1]]) errors.push(`${id}: choice sets unknown truth ${e[1]}`);
    }
    if (n.next && !dialogue[n.next]) errors.push(`${id}: next is unknown node ${n.next}`);
    if (n.mark && !truths[n.mark]) errors.push(`${id}: marks unknown truth ${n.mark}`);
  }

  const played = playedNodes(defs, dialogue);
  errors.push(...graphErrors(defs));
  errors.push(...truthErrors(truths));
  errors.push(...unwiredTruths(defs, dialogue, truths, played));
  errors.push(...lockedOutNodes(defs, dialogue));
  errors.push(...missingCampaignQuests(defs));
  // A school column that no enemy in the quest can pay is a silent hole in the XP economy, not a
  // style note — it reads as a trained school and awards nothing. Kept in `errors` so it gates.
  errors.push(...schoolPayErrors(defs));
  return { errors, warnings, defs, dialogue, areas, truths, played };
}

// Which non-combat work pays which school, so a quest that trains Ward by taking hits under Brace
// is not accused of failing to train it with the wrong enemies.
const WORK_PAYS = {
  catch: 'line', sell: 'barter', cook: 'hearth', forage: 'forage',
  rock: 'setting', mend: 'mend', evade: 'glamour', absorb: 'ward',
};
const ENEMY_SCHOOLS = new Set(Object.values(ENEMIES).flatMap(e => Object.keys(e.xp)));
const paysSchool = (id, s) => {
  const e = ENEMIES[id];
  return !!e && e.xp[s] > 0 && !(e.immune || []).includes(s);
};

// A quest's school column promises that doing the work trains that school. Naming a combat school
// against a fight where every enemy is immune to it, or simply never pays it, is a promise the XP
// table cannot keep — and it is also how a missing enemy hides, because the pack substitutes
// whatever rig already exists and the column quietly stops meaning anything.
// Reported on their own channel rather than as warnings, because `packs.test.js` asserts that the
// warning list only ever holds two known strings and the four live offenders are in files this
// pass does not own. Once they are fixed, fold this into `errors`.
export function schoolPayErrors(defs) {
  const out = [];
  const complain = (label, schools, kills, paidByWork) => {
    if (!kills.length) return;
    for (const s of schools) {
      if (!ENEMY_SCHOOLS.has(s) || paidByWork.has(s)) continue;
      if (kills.some(k => paysSchool(k, s))) continue;
      const immune = kills.some(k => ENEMIES[k]?.immune?.includes(s));
      out.push(`${label}: school column names ${s}, but every enemy it fights (${kills.join(', ')}) `
        + `${immune ? 'is immune to it or never pays it' : 'never pays it'}`);
    }
  };

  for (const q of QUESTS) {
    const kills = [...new Set((q.work || []).filter(w => w[0] === 'kill').map(w => w[1]))]
      .filter(k => ENEMIES[k]);
    const paidByWork = new Set((q.work || []).map(w => WORK_PAYS[w[0]]).filter(Boolean));
    complain(q.id, q.schools || [], kills, paidByWork);

    // The pack is what the player actually fights, and it can drift from the story's work list.
    const def = Object.values(defs).find(d => d.story === q.id);
    if (!def) continue;
    const packKills = [...new Set(def.steps.flatMap(s =>
      s.objectives.filter(o => o.k === 'kill').map(o => o.kind)))].filter(k => ENEMIES[k]);
    if (packKills.slice().sort().join() !== kills.slice().sort().join()) {
      complain(def.id, q.schools || [], packKills, paidByWork);
    }
  }
  return out;
}

// Every node the player can actually reach: the ones quests name or fire, plus everything a
// choice or a `next` leads to from there. A Truth marked outside this set is authored and unread.
export function playedNodes(defs, dialogue) {
  const out = new Set();
  const walk = id => {
    if (!id || out.has(id) || !dialogue[id]) return;
    out.add(id);
    for (const c of dialogue[id].choices || []) walk(c.goto);
    walk(dialogue[id].next);
  };
  for (const d of Object.values(defs)) {
    for (const e of d.onDone) if (e[0] === 'dialogue') walk(e[1]);
    for (const s of d.steps) {
      for (const e of s.onDone || []) if (e[0] === 'dialogue') walk(e[1]);
      for (const o of s.objectives) if (o.k === 'talk' && o.node) walk(o.node);
    }
  }
  return out;
}

// A `once` node opens exactly one time ever. If two things can play it, the second one is a step
// the player can never satisfy — the conversation simply refuses to open.
function lockedOutNodes(defs, dialogue) {
  const out = [];
  const callers = {};
  const add = (id, who) => { if (dialogue[id]) (callers[id] ||= []).push(who); };
  for (const d of Object.values(defs)) {
    for (const e of d.onDone) if (e[0] === 'dialogue') add(e[1], `${d.id}.onDone`);
    for (const s of d.steps) {
      for (const e of s.onDone || []) if (e[0] === 'dialogue') add(e[1], `${d.id}.${s.id}.onDone`);
      for (const o of s.objectives) if (o.k === 'talk' && o.node) add(o.node, `${d.id}.${s.id}`);
    }
  }
  for (const [id, n] of Object.entries(dialogue)) {
    if (!n.once) continue;
    const from = [...(callers[id] || [])];
    for (const [other, o] of Object.entries(dialogue)) {
      if (other === id) continue;
      if (o.next === id || (o.choices || []).some(c => c.goto === id)) from.push(other);
    }
    if (from.length > 1) out.push(`${id}: \`once\` but ${from.length} things play it (${from.join(', ')}) — all but the first are dead`);
  }
  return out;
}

// A campaign is authored as a whole. Once a pack claims one quest of a campaign, every story id
// sim/campaign.js prices for that campaign has to exist, or an act quietly pays short.
function missingCampaignQuests(defs) {
  const out = [];
  for (const campaign of CAMPAIGN_IDS) {
    const acts = new Set(ACTS.filter(a => a.campaign === campaign).map(a => a.id));
    const authored = new Set(Object.values(defs).filter(d => d.campaign === campaign).map(d => d.story));
    if (!authored.size) continue;
    for (const q of QUESTS) {
      if (!acts.has(q.act) || authored.has(q.id)) continue;
      out.push(`${campaign}: sim/campaign.js prices ${q.id} "${q.title}" and no quest in the pack claims it`);
    }
  }
  return out;
}

// STORY §8.5 promises a Truth on a named quest, and says it lands in dialogue and never at a
// turn-in. Both halves are checked: something must award it, that something must be a dialogue
// node, and the node must be one the campaign actually plays. Unauthored campaigns are skipped.
function unwiredTruths(defs, dialogue, truths, played) {
  const out = [];
  const byStory = {};
  for (const d of Object.values(defs)) if (d.story) byStory[d.story] = d;

  const anywhere = new Set(), inPlayedDialogue = new Set();
  const collect = (list, set) => { for (const e of list || []) if (e[0] === 'truth') set.add(e[1]); };
  for (const d of Object.values(defs)) {
    for (const t of d.reward.truths) anywhere.add(t);
    collect(d.onDone, anywhere);
    for (const s of d.steps) collect(s.onDone, anywhere);
  }
  for (const [id, n] of Object.entries(dialogue)) {
    const here = new Set();
    if (n.mark) here.add(n.mark);
    collect(n.sets, here);
    for (const c of n.choices || []) collect(c.sets, here);
    for (const t of here) {
      anywhere.add(t);
      if (played.has(id)) inPlayedDialogue.add(t);
    }
  }

  for (const [id, t] of Object.entries(truths)) {
    if (!t?.story || !byStory[t.story]) continue;
    if (!anywhere.has(id)) out.push(`truth ${id}: ${t.story} is in the packs but nothing awards it`);
    else if (!inPlayedDialogue.has(id)) {
      out.push(`truth ${id}: awarded outside a played dialogue node — §8.5 wants it marked in a scene`);
    }
  }
  return out;
}

const boxOf = s => s.k === 'circle'
  ? { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r }
  : { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) };

const centre = s => s.k === 'circle' ? { x: s.x, z: s.z } : { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 };

const holds = (s, x, z) => s.k === 'circle'
  ? (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r
  : x >= Math.min(s.x0, s.x1) && x <= Math.max(s.x0, s.x1)
    && z >= Math.min(s.z0, s.z1) && z <= Math.max(s.z0, s.z1);

// areas.json is the contract the world is built to satisfy, so an area outside the playable box
// is a place the world agent cannot build and the player cannot reach.
function areaGeometryErrors(areas) {
  const out = [];
  for (const a of Object.values(areas)) {
    if (!a.shape) continue;
    const b = boxOf(a.shape);
    if (b.x0 < PLAY.x0 || b.x1 > PLAY.x1 || b.z0 < PLAY.z0 || b.z1 > PLAY.z1) {
      out.push(`areas.json: ${a.id} leaves the playable box (${b.x0},${b.z0})–(${b.x1},${b.z1})`);
    }
    const parent = a.parent && areas[a.parent];
    if (parent?.shape) {
      const c = centre(a.shape);
      if (!holds(parent.shape, c.x, c.z)) out.push(`areas.json: ${a.id} is not inside its parent ${a.parent}`);
    }
  }
  return out;
}

// A supersession chain is the whole point of the Truths tab, so a broken link is an error.
function truthErrors(truths) {
  const out = [];
  const parents = id => {
    const s = truths[id]?.supersedes;
    return s == null ? [] : (Array.isArray(s) ? s : [s]);
  };
  for (const [id, t] of Object.entries(truths)) {
    if (typeof t?.text !== 'string' || !t.text) out.push(`truth ${id}: needs \`text\``);
    for (const p of parents(id)) {
      if (!truths[p]) out.push(`truth ${id}: supersedes unknown truth ${p}`);
      if (p === id) out.push(`truth ${id}: supersedes itself`);
    }
    const seen = new Set([id]);
    let walk = parents(id);
    while (walk.length) {
      const next = [];
      for (const p of walk) {
        if (seen.has(p)) { out.push(`truth ${id}: supersession cycle through ${p}`); continue; }
        seen.add(p);
        next.push(...parents(p));
      }
      walk = next;
    }
  }
  return out;
}

// A quest that no chain reaches and that gates nothing is content nobody will ever see.
function graphErrors(defs) {
  const out = [];
  const deps = id => {
    const found = new Set();
    const walk = p => {
      if (!Array.isArray(p)) return;
      if (p[0] === 'quest' && defs[p[1]]) found.add(p[1]);
      if (['all', 'any', 'not'].includes(p[0])) p.slice(1).forEach(walk);
    };
    walk(defs[id].prereq);
    return [...found];
  };

  for (const d of Object.values(defs)) {
    for (const dep of deps(d.id)) {
      const o = defs[dep];
      if (o.campaign === d.campaign && o.act > d.act) out.push(`${d.id}: act ${d.act} waits on ${dep}, which is act ${o.act}`);
    }
  }

  const seen = {}, stack = new Set();
  const cycle = id => {
    if (stack.has(id)) { out.push(`prereq cycle through ${id}`); return true; }
    if (seen[id]) return false;
    seen[id] = 1; stack.add(id);
    for (const d of deps(id)) if (cycle(d)) { stack.delete(id); return true; }
    stack.delete(id);
    return false;
  };
  for (const id of Object.keys(defs)) cycle(id);

  const reachable = new Set(Object.keys(defs).filter(id => deps(id).length === 0));
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of Object.keys(defs)) {
      if (reachable.has(id)) continue;
      if (deps(id).every(d => reachable.has(d))) { reachable.add(id); grew = true; }
    }
  }
  for (const id of Object.keys(defs)) if (!reachable.has(id)) out.push(`${id}: unreachable — its prereq chain never bottoms out`);

  const unlocks = new Set();
  for (const d of Object.values(defs)) for (const e of d.onDone) if (e[0] === 'unlock') unlocks.add(e[1]);
  for (const d of Object.values(defs)) {
    const terminal = !Object.values(defs).some(o => deps(o.id).includes(d.id));
    // The last quest of the last campaign unlocks nothing because nothing follows the trilogy.
    // It says so by setting `trilogy.done`, which is a claim the campaign test checks.
    const ends = d.onDone.some(e => e[0] === 'flag' && e[1] === 'trilogy.done');
    const gatesNothing = terminal && !d.onDone.some(e => e[0] === 'unlock') && !ends;
    if (gatesNothing && !d.board) out.push(`${d.id}: terminal — it unlocks nothing and nothing requires it`);
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quiet = process.argv.includes('--quiet');
  const { errors, warnings, defs, dialogue } = lintAll();
  if (!quiet) {
    for (const w of warnings) console.warn(`  warn  ${w}`);
    for (const e of errors) console.error(` error  ${e}`);
  }
  const steps = Object.values(defs).reduce((n, d) => n + d.steps.length, 0);
  console.log(`${Object.keys(defs).length} quests · ${steps} steps · ${Object.keys(dialogue).length} dialogue nodes · ${warnings.length} warnings · ${errors.length} errors`);
  process.exit(errors.length ? 1 : 0);
}
