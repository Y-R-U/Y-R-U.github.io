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
import { QUESTS, SANDBOX } from '../js/sim/campaign.js';

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
            // dialoguebox reports the node a conversation *ends* on, so a step whose node branches
            // away is a step the player can complete the conversation for and never get credit.
            for (const exit of exitsOf(dialogue[o.node])) {
              errors.push(`${sp}: ${o.node} runs on to ${exit}, so the scene ends on a node this step does not name`);
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

  errors.push(...graphErrors(defs));
  errors.push(...truthErrors(truths));
  errors.push(...unwiredTruths(defs, dialogue, truths));
  return { errors, warnings, defs, dialogue, areas, truths };
}

// STORY §8.5 promises a Truth on a named quest. Twice now the table has promised one that was
// never wired to anything, so a Truth whose quest is in the shipped packs has to be awarded by
// something in them. Truths belonging to campaigns not yet authored are skipped.
function unwiredTruths(defs, dialogue, truths) {
  const out = [];
  const byStory = {};
  for (const d of Object.values(defs)) if (d.story) byStory[d.story] = d;
  const awarded = new Set();
  const collect = list => { for (const e of list || []) if (e[0] === 'truth') awarded.add(e[1]); };
  for (const d of Object.values(defs)) {
    for (const t of d.reward.truths) awarded.add(t);
    collect(d.onDone);
    for (const s of d.steps) collect(s.onDone);
  }
  for (const n of Object.values(dialogue)) {
    if (n.mark) awarded.add(n.mark);
    collect(n.sets);
    for (const c of n.choices || []) collect(c.sets);
  }
  for (const [id, t] of Object.entries(truths)) {
    if (!t?.story || !byStory[t.story]) continue;
    if (!awarded.has(id)) out.push(`truth ${id}: ${t.story} is in the packs but nothing awards it`);
  }
  return out;
}

const exitsOf = node => node
  ? [...(node.choices || []).map(c => c.goto), node.next].filter(Boolean)
  : [];

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
    const gatesNothing = terminal && !d.onDone.some(e => e[0] === 'unlock');
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
