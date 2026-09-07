// A confluence for every combination there is.
//
// Twelve essences taken three at a time is 220 triples, and Aaron's son asked for a unique
// confluence essence for each of them. Two hundred and twenty confluences with ten abilities each
// is two thousand two hundred pieces of writing, which nobody will ever write and nobody would
// ever keep true to the table beside it. So the seventeen the registry has on file are authored —
// they are the good writing and they win — and every other triple is composed here, from the three
// that made it.
//
// Everything below is DETERMINISTIC on the sorted triple. That is not an optimisation, it is the
// requirement: the save keeps ability ids, so a player who reloads has to be handed exactly the
// confluence they had. Nothing here may call Math.random, read a clock, or depend on the order the
// essences happen to sit in the JSON.
//
// Pure. No DOM, no three, no fetch.

import { KINDS } from './spells.js';

// The ten kinds, in a fixed order. Taken from js/game/spells.js rather than re-listed, so a
// confluence gains an ability the day a new kind is added and there is no second list to forget.
export const KIND_ORDER = Object.keys(KINDS).sort();

// How many a confluence holds. Ten, like an essence, so the four rows a player has are all the
// same shape and five can be claimed from any of them. An authored confluence with two abilities
// of the same kind (Apparatus has two) would otherwise come out at eleven.
export const SIZE = 10;

// FNV-1a. Small, stable across engines, and — the part that matters — the same next week.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// A word list for an essence. `words` in data/essences.json; an essence that has not been given
// any falls back to its own name, which is dull but never blank.
export const wordsOf = (doc, id) => {
  const w = doc?.essences?.[id]?.words;
  return Array.isArray(w) && w.length ? w : [doc?.essences?.[id]?.name || id];
};

const nameOf = (doc, id) => doc?.essences?.[id]?.name || id;

// Every name this triple could be called, in a deterministic order: one word from one parent and
// one from another, for every ordered pair of parents. Three parents with three words each is 54
// candidates, which is far more than enough to give all 220 triples a name of their own.
export function candidates(doc, triple) {
  const w = triple.map(id => wordsOf(doc, id));
  const out = [];
  for (let i = 0; i < triple.length; i++) {
    for (let j = 0; j < triple.length; j++) {
      if (i === j) continue;
      for (const a of w[i]) for (const b of w[j]) if (a !== b) out.push(`${a} ${b}`);
    }
  }
  // Rotated by the triple's own hash so two triples sharing two essences do not both open with
  // the same candidate and fight over it.
  const k = out.length ? hash(triple.join(',')) % out.length : 0;
  return [...out.slice(k), ...out.slice(0, k)];
}

// ── the registry ────────────────────────────────────────────────────────────
// Built once per table and cached against it. Authored names are reserved first and never given
// away; every other triple takes the first candidate nobody has claimed.

const CACHE = new WeakMap();

function triples(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (let k = j + 1; k < ids.length; k++) out.push([ids[i], ids[j], ids[k]]);
    }
  }
  return out;
}

export function registry(doc) {
  if (!doc?.essences) return { names: new Map(), authored: new Map() };
  const hit = CACHE.get(doc);
  if (hit) return hit;

  const ids = Object.keys(doc.essences).sort();
  const authored = new Map();
  const taken = new Set();
  for (const c of doc.confluences || []) {
    if (!c.exact?.length) continue;
    authored.set(c.exact.join(','), c);
    taken.add(c.name);
  }

  const names = new Map();
  // Sorted, so the order the triples are named in does not depend on the order of the essences in
  // the file. Two runs of the same table must agree about who got "Ember Tide".
  for (const t of triples(ids)) {
    const key = t.join(',');
    if (authored.has(key)) { names.set(key, authored.get(key).name); continue; }
    const list = candidates(doc, t);
    let name = list.find(n => !taken.has(n));
    // 54 candidates against 220 triples means this cannot happen with the shipped table; it is
    // here so that a table with one word per essence still produces 220 different names.
    if (!name) name = `${list[0] || 'Confluence'} ${names.size + 1}`;
    taken.add(name);
    names.set(key, name);
  }

  const out = { names, authored };
  CACHE.set(doc, out);
  return out;
}

// ── composing the abilities ─────────────────────────────────────────────────
// One per kind, so a generated confluence covers the whole ladder and a player awakening five of
// them gets five different things to press. The name is a parent's word and the kind's own noun;
// the text names two of the three essences, rotated per kind so a confluence does not read as
// being about its first parent ten times over.

const NOUNS = {
  attack: ['Strike', 'Lash', 'Cast'],
  affliction: ['Blight', 'Mark', 'Wasting'],
  buff: ['Temper', 'Ascendant', 'Rising'],
  conjuration: ['Ground', 'Standing', 'Field'],
  control: ['Hold', 'Bind', 'Stay'],
  defence: ['Ward', 'Guard', 'Shell'],
  movement: ['Step', 'Passage', 'Way'],
  recovery: ['Mending', 'Restoration', 'Return'],
  special: ['Undoing', 'Hour', 'Confluence'],
  utility: ['Sense', 'Reading', 'Eye'],
};

const TEXTS = {
  attack: (a, b) => `${a} and ${b} in one motion. It arrives as one thing and it is not felt as two.`,
  affliction: (a, b) => `A ${a.toLowerCase()} wound that will not settle, because the ${b.toLowerCase()} in it keeps reopening it.`,
  buff: (a, b) => `For a few seconds you carry more ${a.toLowerCase()} and more ${b.toLowerCase()} in you than one person is meant to at once.`,
  conjuration: (a, b) => `${a} laid down on the floor and held there by ${b}. It stays exactly where you put it.`,
  control: (a, b) => `${a} takes hold of it and ${b} sees to it that the hold keeps.`,
  defence: (a, b) => `${a} over ${b} over you. Three layers is two more than most people ever get.`,
  movement: (a, b) => `You leave by way of ${a} and arrive by way of ${b}. The ground in between is not consulted.`,
  recovery: (a, b) => `${a} closes it and ${b} makes it hold. Neither of them asks whether you had earned it.`,
  special: (a, b) => `${a}, ${b} and the third of them at once, for about ten seconds. You will want somewhere quiet afterwards.`,
  utility: (a, b) => `What ${a} notices and what ${b} notices, at the same moment, about the same room.`,
};

const COSTS = {
  attack: 'mana', affliction: 'mana, stacking', buff: 'mana, sustained', conjuration: 'mana, heavy',
  control: 'mana', defence: 'mana, sustained', movement: 'mana', recovery: 'mana',
  special: 'mana, heavy', utility: 'free',
};

// The generated abilities for a triple, under a given id prefix. `skip` is the set of kinds an
// authored confluence already covers, so topping one up never gives it two attacks with different
// names and the same tuning.
export function composeAbilities(doc, triple, prefix, skip = new Set()) {
  const h = hash(triple.join(','));
  const names = triple.map(id => nameOf(doc, id));
  const out = [];
  for (let i = 0; i < KIND_ORDER.length; i++) {
    const kind = KIND_ORDER[i];
    if (skip.has(kind)) continue;
    const parent = (h + i) % triple.length;
    const words = wordsOf(doc, triple[parent]);
    const word = words[(h + i * 7) % words.length];
    const nouns = NOUNS[kind] || ['Working'];
    const noun = nouns[(h + i * 3) % nouns.length];
    const a = names[(h + i) % names.length];
    const b = names[(h + i + 1) % names.length];
    out.push({
      id: `${prefix}.gen.${kind}`,
      name: `${word} ${noun}`,
      kind,
      cost: COSTS[kind] || 'mana',
      text: (TEXTS[kind] || ((x, y) => `${x} and ${y}, together.`))(a, b),
    });
  }
  return out;
}

// ── the confluence itself ───────────────────────────────────────────────────

export const idFor = triple => `conf.${[...triple].sort().join('-')}`;

// The row for one triple: authored if the registry has it on file, composed if it does not, and
// ten abilities either way. Cached per table, because js/game/session.js asks for this every time
// it resolves what the player has awakened.
export function confluenceFor(doc, picked) {
  const triple = [...new Set(picked || [])].filter(id => doc?.essences?.[id]).sort();
  // Two is enough to compose from. A save naming an essence this build has dropped must not lose
  // its fourth row as well — that would be a player opening their sheet to find a quarter of
  // themselves gone because a table moved on.
  if (triple.length < 2) return null;
  const reg = registry(doc);
  const key = triple.join(',');

  const box = CACHE.get(doc);
  let cache = box?.rows;
  if (!cache) {
    cache = new Map();
    if (box) box.rows = cache;
  }
  if (cache.has(key)) return cache.get(key);

  const authored = reg.authored.get(key) || null;
  const id = authored ? authored.id : idFor(triple);
  const have = authored?.abilities || [];
  const skip = new Set(have.map(a => a.kind));
  const row = {
    id,
    // The registry names every three. A pair — which only happens to a save whose table has moved
    // on — takes the first candidate its two parents can make between them.
    name: reg.names.get(key) || (authored ? authored.name : (candidates(doc, triple)[0] || 'Confluence')),
    blurb: authored ? authored.blurb : blurbFor(doc, triple, reg.names.get(key)),
    exact: triple,
    needs: null,
    // Authored first, in the order they were written: the writing somebody did should be the top
    // of the sheet, and the composed ones fill out the ladder underneath it.
    abilities: [...have, ...composeAbilities(doc, triple, id, skip)].slice(0, SIZE),
    // What made it. js/game/spells.js blends the look from exactly these three.
    from: triple,
    generated: !authored,
  };
  cache.set(key, row);
  return row;
}

function blurbFor(doc, triple, name) {
  const [a, b, c] = triple.map(id => nameOf(doc, id));
  return `${a}, ${b} and ${c}. The registry has no entry for this one, so it is written up as `
    + `${name || 'unfiled'} and you are asked to say, in your own words, what it turned out to do.`;
}

// Every triple the table can make, named. The test walks this; nothing in the game needs it, and
// the sheet builds one row at a time.
export function all(doc) {
  const reg = registry(doc);
  return [...reg.names.entries()].map(([key, name]) => ({ triple: key.split(','), name }));
}
