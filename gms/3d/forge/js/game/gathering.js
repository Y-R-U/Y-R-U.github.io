// The gather chain's rules: which catch table a node draws from, what working one produces, the
// fishing cast/bite/strike run, cooking at a hearth, and which hand-over a live step is waiting
// for. Pure — the caller supplies the clock, the rng and what the player is carrying. Nothing here
// imports three or touches the document, which is what lets the tests drive the real corpus
// through it.
//
// The balance lives in sim/gather.js and sim/tables.js and is used exactly as written.

import { CATCH, FORAGE, ROCK, PERISHABLE, ITEM_VALUE } from '../sim/tables.js';
import {
  castTime, biteChance, STRIKE_WINDOW, SECOND_LINE_CHANCE, rollCatch, rollForage, forageYield,
  rockYield, newNode, beginWork, finishWork, tickNode, cook, cookHeal, buffSeconds, buffSlots,
  burnChance,
} from '../sim/gather.js';
import { hasMilestone } from '../sim/schools.js';
import { areasAt, lineage } from './areas.js';
import { openSteps } from './quest.js';

export const REGION = { light: 'whitewall', neutral: 'longacre', dark: 'blackstone' };

// A node is single-purpose: there is nothing else you could be doing at a fishing spot. So its own
// school is what is cast, what is paid and what the reducer sees as the event's `verb` — never
// whatever the dial happens to be on. That is not only convenience: no school but Kindle is on the
// dial until it has XP, and the only way to earn Line XP is to fish, so a dial check would make
// light.02 unreachable on a fresh save.
export const KIND = {
  fish: { school: 'line', spell: 'line_cast', label: 'line' },
  forage: { school: 'forage', spell: 'forage_pulse', label: 'gather' },
  rock: { school: 'setting', spell: 'set_strike', label: 'cut' },
  hearth: { school: 'hearth', spell: 'hearth_hold', label: 'cook' },
};

const ROCK_RARITY = { chalk: 'common', iron_glass: 'uncommon', obsidian: 'rare' };
export const COOK_SECONDS = 1.6;

export const rawOf = id => (id.startsWith('cooked_') ? id.slice(7) : null);
export const cookedOf = id => `cooked_${id}`;

export function regionOf(areas, areaId, override = null) {
  if (override) return override;
  for (const id of lineage(areas, areaId)) {
    const town = areas[id]?.town;
    if (town) return REGION[town] || null;
  }
  return null;
}

// Where an item can come from, read off the tables rather than off a list kept here: a fish added
// to CATCH becomes findable without this file changing. `level` is the school level the entry
// needs — a catch's own `req`, a herb's tier gate, a rock's `req`.
export function sourceOf(id) {
  const raw = rawOf(id);
  if (raw) return PERISHABLE.has(raw) ? { kind: 'cook', raw, level: recipeLevel(raw) } : null;
  for (const [region, table] of Object.entries(CATCH)) {
    const e = table.find(x => x.id === id);
    if (e) return { kind: 'fish', region, level: e.req };
  }
  for (const [region, table] of Object.entries(FORAGE)) {
    const e = table.find(x => x.id === id);
    if (e) return { kind: 'forage', region, level: (e.tier - 1) * 5 };
  }
  for (const [rock, r] of Object.entries(ROCK)) if (r.item === id) return { kind: 'rock', rock, level: r.req };
  return null;
}

// A recipe is as hard as its ingredient was to get, which is the only level in the tables that
// `burnChance` can be measured against.
export function recipeLevel(raw) {
  const s = raw && !rawOf(raw) ? sourceOf(raw) : null;
  return Math.max(1, s?.level ?? 1);
}

export function produces(node, src) {
  if (!src || !node) return false;
  if (src.kind === 'cook') return node.kind === 'hearth';
  if (src.kind === 'rock') return node.kind === 'rock' && node.rock === src.rock;
  return node.kind === src.kind && node.region === src.region;
}

// Which items the quest corpus asks to be gathered. The packs are the only authority, so neither
// this nor the tests carries a second copy of the list.
export function gatherIds(defs) {
  const out = new Map();
  for (const def of Object.values(defs || {})) {
    for (const s of def.steps || []) {
      for (const o of s.objectives || []) {
        if (o.k !== 'gather') continue;
        const rec = out.get(o.kind) || { id: o.kind, n: 0, in: new Set(), verbs: new Set(), via: new Set() };
        rec.n++;
        if (s.in) rec.in.add(s.in);
        if (s.verb) rec.verbs.add(s.verb);
        if (s.via) rec.via.add(s.via);
        out.set(o.kind, rec);
      }
    }
  }
  return out;
}

export function buildNodes(placed, areas) {
  const nodes = [], errors = [];
  for (const e of placed || []) {
    const cfg = KIND[e.kind];
    if (!cfg) { errors.push(`${e.id}: unknown node kind ${e.kind}`); continue; }
    const region = regionOf(areas, e.area, e.region);
    // A seam yields whatever its rock is and a fire cooks whatever it is handed, so only the two
    // kinds that read a per-reach table have to know which reach they are in.
    const needsRegion = e.kind === 'fish' || e.kind === 'forage';
    if (needsRegion && !region) { errors.push(`${e.id}: ${e.area} belongs to no town, so it needs a \`region\``); continue; }
    if (e.kind === 'fish' && !CATCH[region]) { errors.push(`${e.id}: no catch table for ${region}`); continue; }
    if (e.kind === 'forage' && !FORAGE[region]) { errors.push(`${e.id}: no forage table for ${region}`); continue; }
    if (e.kind === 'rock' && !ROCK[e.rock]) { errors.push(`${e.id}: unknown rock ${e.rock}`); continue; }
    nodes.push(newNode(e.id, e.kind, {
      x: e.x, z: e.z, ry: e.ry || 0, region, rock: e.rock || null, quality: e.quality || 0,
      area: e.area, areas: areasAt(areas, e.x, e.z), town: e.town || null,
    }));
  }
  return { nodes, errors };
}

// The node table as the session holds it. `now` is game seconds; only `cooling` nodes care.
export class NodeSet {
  constructor(nodes = []) {
    this.nodes = new Map(nodes.map(n => [n.id, n]));
  }

  get(id) { return this.nodes.get(id) || null; }
  list() { return [...this.nodes.values()]; }

  tick(now) {
    const woke = [];
    for (const [id, n] of this.nodes) {
      const next = tickNode(n, now);
      if (next !== n) { this.nodes.set(id, next); woke.push(id); }
    }
    return woke;
  }

  begin(id, now) {
    const n = this.get(id);
    if (!n) return null;
    const next = beginWork(n, now);
    this.nodes.set(id, next);
    return next;
  }

  // A fishing spot is never used up — you fish it until you walk away — so a released line puts the
  // spot straight back rather than through the cooling delay a picked patch takes.
  release(id) {
    const n = this.get(id);
    if (!n || n.state !== 'working') return n;
    const next = { ...n, state: 'ready', t: 0 };
    this.nodes.set(id, next);
    return next;
  }

  finish(id, now, rng, forageLevel = 1) {
    const n = this.get(id);
    if (!n) return null;
    const rarity = n.kind === 'rock' ? ROCK_RARITY[n.rock] || 'common' : 'common';
    const next = finishWork(n, now, rng, { rarity, forageLevel });
    this.nodes.set(id, next);
    return next;
  }
}

// One pick off a patch or one strike at a seam. Fishing does not come through here — it has a run.
export function harvest(node, rng, levels = {}) {
  if (node.kind === 'forage') {
    const e = rollForage(rng, node.region, levels.forage || 1);
    if (!e) return null;
    return {
      item: e.id, n: forageYield(levels.forage || 1), school: 'forage',
      xp: e.xp, sourceLevel: Math.max(1, (e.tier - 1) * 5), perishable: true,
    };
  }
  if (node.kind !== 'rock') return null;
  const r = ROCK[node.rock];
  return {
    item: r.item, n: rockYield(node.rock, levels.setting || 1), school: 'setting',
    xp: r.xp, sourceLevel: r.req, perishable: false,
  };
}

// The cast → bite → strike loop of SYSTEMS §6.2. A cast that draws no bite recasts on its own,
// which is what makes `secondsPerCatch = castTime / biteChance` describe the hold the player
// actually performs.
export function newRun(node, lineLevel, { touch = true } = {}) {
  return {
    node: node.id, region: node.region, phase: 'cast', t: 0,
    wait: castTime(lineLevel), window: STRIKE_WINDOW[touch ? 'touch' : 'desktop'],
    level: lineLevel, quality: node.quality || 0, casts: 0, missed: false,
  };
}

export function tickRun(run, dt, rng) {
  const t = run.t + dt;
  if (run.phase === 'cast') {
    if (t < run.wait) return { run: { ...run, t }, event: null };
    if (rng() < biteChance(run.level, run.quality)) return { run: { ...run, phase: 'bite', t: 0, missed: false }, event: 'bite' };
    return { run: { ...run, t: 0, wait: castTime(run.level), casts: run.casts + 1, missed: false }, event: 'recast' };
  }
  if (t < run.window) return { run: { ...run, t }, event: null };
  // The window closed with the thumb still down. It survives on the run so that the release can
  // tell the player they were late rather than early — the two ways to miss are not the same
  // lesson, and reporting both as early teaches the wrong one about a timed mechanic.
  return { run: { ...run, phase: 'cast', t: 0, wait: castTime(run.level), casts: run.casts + 1, missed: true }, event: 'lost' };
}

export function strike(run, rng) {
  const recast = { ...run, phase: 'cast', t: 0, wait: castTime(run.level), casts: run.casts + 1, missed: false };
  if (run.phase !== 'bite') return { run: recast, caught: null, why: run.missed ? 'late' : 'early' };
  const e = rollCatch(rng, run.region, run.level);
  if (!e) return { run: recast, caught: null, why: 'nothing' };
  const second = hasMilestone('line', run.level, 'second_line') && rng() < SECOND_LINE_CHANCE;
  const n = second ? 2 : 1;
  return {
    run: recast,
    caught: { item: e.id, n, school: 'line', xp: e.xp * n, sourceLevel: e.req, perishable: !e.junk },
    why: null,
  };
}

// The three events the reducer credits, built here rather than inline in the session so a node
// test drives the same shapes the game emits. Two of them are the whole seam:
//
// `area`/`areas` are the *node's*, never the player's — a step scoped to the chalk stand counts a
// fish taken there however far up the bank the rod is. `via: 'craft'` is not decoration: every
// cook step in the corpus is authored `via: "craft"` and `credit()` refuses an event without it.
export const gatherEvent = (node, got) => ({
  t: 'gather', kind: got.item, n: got.n, verb: KIND[node.kind].school,
  area: node.area, areas: node.areas,
});

export const cookEvent = (node, item) => ({
  t: 'gather', kind: item, n: 1, via: 'craft', verb: 'hearth',
  area: node.area, areas: node.areas,
});

export const deliverEvent = h => ({ t: 'deliver', item: h.item, n: h.n, to: h.to });

// What goes over the fire: whatever a live step is waiting for, and otherwise the dearest raw in
// the bag the hearth can actually cook.
//
// Not simply the dearest. `recipeLevel` is derived from the same value ladder, so the most
// valuable raw is always the one most likely to be destroyed, and `burnChance` is not clamped at
// 1 — a goldenscale over a Hearth-1 fire burns 106 times in 100. So: the dearest raw with no worse
// than an even chance of surviving, and only if the bag holds nothing that safe, the one least
// likely to burn. A live step still overrides both — if the quest wants the goldenscale cooked,
// the player asked for the risk.
const COOK_RISK = 0.5;

export function cookChoice(wants = [], held = {}, hearthLevel = 1) {
  for (const w of wants) {
    const raw = rawOf(w);
    if (raw && (held[raw] || 0) > 0 && PERISHABLE.has(raw)) return raw;
  }
  let safe = null, safest = null, lowest = Infinity;
  for (const [id, n] of Object.entries(held)) {
    if (n <= 0 || !PERISHABLE.has(id)) continue;
    const burn = burnChance(hearthLevel, recipeLevel(id));
    const value = ITEM_VALUE[id] || 0;
    if (!safest || burn < lowest || (burn === lowest && value > ITEM_VALUE[safest])) { lowest = burn; safest = id; }
    if (burn <= COOK_RISK && (!safe || value > ITEM_VALUE[safe])) safe = id;
  }
  return safe || safest;
}

// A burn eats the raw and pays the reduced XP. It does not mint a `burnt_*` item: the corpus, the
// linter and ITEM_VALUE know no such id, and one mark of char is not worth inventing one for.
export function cookOne(rng, raw, hearthLevel) {
  const r = cook(rng, raw, hearthLevel, recipeLevel(raw));
  return {
    raw, burnt: r.burnt, item: r.burnt ? null : cookedOf(raw),
    xp: r.xp, value: r.value, school: 'hearth', sourceLevel: recipeLevel(raw),
  };
}

// Which dish family a cooked item buffs, SYSTEMS §6.4. Read off the tables the raw came from.
export function dishBuff(cooked) {
  const raw = rawOf(cooked);
  const src = raw ? sourceOf(raw) : null;
  if (!src) return null;
  if (src.kind === 'fish') return 'focus';
  if (src.region === 'longacre') return 'hp';
  return src.region === 'whitewall' ? 'ward' : 'kindle';
}

export function eat(cooked, hearthLevel) {
  const family = dishBuff(cooked);
  if (!family) return null;
  const seconds = buffSeconds(hearthLevel);
  return {
    heal: cookHeal(hearthLevel),
    buff: seconds > 0 ? { family, seconds } : null,
    slots: buffSlots(hearthLevel),
  };
}

// The hand-overs a live step is waiting for right here. `via: 'sell'` steps are the market's and
// are left alone. `at` answers with a body's position for a target that is a person or a prop, and
// null for a target that is an area — those are handed over by standing in it.
export function handovers(defs, quests, ctx, { held = {}, here = [], at = () => null } = {}) {
  const out = [];
  for (const [qid, rec] of Object.entries(quests || {})) {
    const def = defs?.[qid];
    if (!def) continue;
    for (const s of openSteps(def, rec, ctx)) {
      if (s.via === 'sell') continue;
      const counts = rec.c?.[s.id] || [];
      s.objectives.forEach((o, i) => {
        if (o.k !== 'deliver' || !o.to) return;
        const left = o.target - (counts[i] || 0);
        const have = held[o.item] || 0;
        if (left <= 0 || have <= 0) return;
        if (s.in && !here.includes(s.in)) return;
        const body = at(o.to);
        if (!body && !here.includes(o.to)) return;
        if (out.some(h => h.to === o.to && h.item === o.item)) return;
        out.push({ to: o.to, item: o.item, n: Math.min(left, have), body, quest: qid, step: s.id });
      });
    }
  }
  return out;
}

// What the live steps want gathered, in the order the tracker shows them — the cook target reads
// this to decide what to put over the fire.
export function gatherWants(defs, quests, ctx) {
  const out = [];
  for (const [qid, rec] of Object.entries(quests || {})) {
    const def = defs?.[qid];
    if (!def) continue;
    for (const s of openSteps(def, rec, ctx)) {
      const counts = rec.c?.[s.id] || [];
      s.objectives.forEach((o, i) => {
        if (o.k === 'gather' && (counts[i] || 0) < o.target) out.push(o.kind);
      });
    }
  }
  return out;
}
