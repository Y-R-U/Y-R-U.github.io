// Essences, confluences, and what the four of them give you. Pure — no DOM, no three — because
// the one rule that matters is arithmetic over a triple and it has to hold for every triple there
// is, not for the twelve somebody thought of.
//
// The book's shape, kept: you take THREE essences, and the fourth is whatever those three come to
// between them. Nobody chooses a confluence. `data/essences.json` names the combinations the
// Society has on file; anything else is matched on what the three are made of, so there is no
// triple that resolves to nothing and no player who can pick their way into a blank sheet.
//
// One ability from each of the four to begin with — DEV_CONTRACT §12. The rest are awakened later.

import { SLOTS } from './save.js';
import { confluenceFor as composeConfluence, registry as confluenceRegistry } from './confluence.js';
import { KINDS as SPELL_KINDS } from './spells.js';

export const PICK = 3;

// The most anyone can claim from one essence, and therefore — four essences, the three picked and
// the confluence they come to — the most anyone can hold. SLOTS is the same number seen from the
// keyboard's end (js/game/save.js), and they are the same number on purpose: every ability you
// have has a key, and every key has an ability on it once you are done.
export const MAX_PER_ESSENCE = 5;
export const MAX_ABILITIES = SLOTS;

const asId = v => (typeof v === 'string' ? v : '');

// A triple is a set, not a sequence: fire-water-wind and wind-fire-water are one choice, and the
// registry is keyed on the sorted form so it cannot hold both.
export const key = ids => [...new Set(ids.map(asId).filter(Boolean))].sort();

export function normalise(raw) {
  const warnings = [];
  const essences = {};
  for (const [id, e] of Object.entries(raw?.essences || {})) {
    if (!e || typeof e !== 'object') { warnings.push(`${id}: not an object`); continue; }
    const abilities = (Array.isArray(e.abilities) ? e.abilities : []).filter(a => a && a.id && a.name);
    if (!abilities.length) warnings.push(`${id}: no abilities`);
    essences[id] = {
      id,
      name: String(e.name || id),
      colour: typeof e.colour === 'string' ? e.colour : '#888888',
      tags: Array.isArray(e.tags) ? e.tags.filter(t => typeof t === 'string') : [],
      // The words this essence lends to a confluence's name — see js/game/confluence.js. An
      // essence with none falls back to its own name there, so this is allowed to be absent.
      words: Array.isArray(e.words) ? e.words.filter(w => typeof w === 'string' && w) : [],
      blurb: String(e.blurb || ''),
      // What it looks like coming out of a hand — js/game/spells.js reads this and nothing else
      // does. Kept verbatim rather than field-by-field: the shape names and the palette are that
      // module's contract with the data, and re-listing them here would be two places to change.
      spell: e.spell && typeof e.spell === 'object' ? { ...e.spell } : null,
      abilities,
    };
    if (!essences[id].spell) warnings.push(`${id}: no spell look`);
  }
  const confluences = (Array.isArray(raw?.confluences) ? raw.confluences : [])
    .filter(c => c && c.id && c.name)
    .map(c => ({
      id: c.id,
      name: String(c.name),
      blurb: String(c.blurb || ''),
      exact: Array.isArray(c.exact) ? key(c.exact) : null,
      needs: c.needs && typeof c.needs === 'object' ? c.needs : null,
      abilities: (Array.isArray(c.abilities) ? c.abilities : []).filter(a => a && a.id && a.name),
    }));
  if (!confluences.some(c => !c.exact && !Object.keys(c.needs || {}).length)) {
    // Without one, a triple nobody named and whose tags match nothing at all would resolve to
    // null and the player would be handed three abilities and a blank fourth slot.
    warnings.push('no catch-all confluence: some triples will resolve to nothing');
  }
  for (const c of confluences) {
    if (!c.exact) continue;
    for (const id of c.exact) if (!essences[id]) warnings.push(`${c.id}: names unknown essence "${id}"`);
  }
  return {
    doc: { pick: Math.max(1, +raw?.pick || PICK), essences, confluences },
    warnings,
  };
}

export const ids = doc => Object.keys(doc?.essences || {});

// Every tag the three carry, counted. The tag rules it used to feed are gone — every triple has a
// confluence of its own now (js/game/confluence.js) — but the count itself is what the picker uses
// to tell a player what they are building, so it stays.
export function tally(doc, triple) {
  const out = {};
  for (const id of triple) {
    for (const t of doc.essences[id]?.tags || []) out[t] = (out[t] || 0) + 1;
  }
  return out;
}

// The one rule, and it changed: EVERY triple has a confluence of its own now.
//
// It used to be "an exact entry wins, otherwise the tag rule that matches by the widest margin",
// which meant the five tag rules were shared between roughly two hundred triples — take any two
// entropic essences and you were an Attrition, whichever two. Aaron's son asked for a unique
// confluence for each combination, and js/game/confluence.js is the answer: the seventeen the
// registry has on file keep their authored writing and win on their own triple, and every other
// triple is composed, deterministically, from the three that made it.
//
// This function is kept as the way in because six other modules call it and every one of them
// wants the same thing: what did these three come to?
export function confluenceFor(doc, picked) {
  return composeConfluence(doc, picked);
}

// Every triple this table can make, with the name each one resolves to. The test walks it.
export const confluences = doc => confluenceRegistry(doc);

// Is this a legal choice? Said as a reason rather than a boolean, because the picker has to put
// something on screen when it is not.
export function checkPick(doc, picked) {
  const t = key(picked);
  if (t.length < doc.pick) return `Choose ${doc.pick - t.length} more.`;
  if (t.length > doc.pick) return `Choose only ${doc.pick}.`;
  for (const id of t) if (!doc.essences[id]) return `There is no ${id} essence.`;
  return null;
}

// What the four of them give you at registration: one from each, chosen at random rather than
// always the first. Two players who take the same three essences should not be the same
// adventurer — that is the whole reason there are more abilities in an essence than anyone can
// claim from it.
//
// `rnd` is injectable so the test can walk it and so a save can be replayed; nothing in the game
// passes one.
export function awaken(doc, picked, rnd = Math.random) {
  const triple = key(picked);
  const conf = confluenceFor(doc, triple);
  const rows = [...triple.map(id => doc.essences[id]), conf];
  const out = [];
  const draw = (row, confluence) => {
    const list = row?.abilities || [];
    if (!list.length) return;
    const a = list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
    out.push({ ...a, from: row.id, fromName: row.name, confluence });
  };
  for (const [i, row] of rows.entries()) draw(row, i === rows.length - 1);

  // One of the four has to be something you can THROW.
  //
  // The draw is random and ten of the twelve essences have three or four defensive and utility
  // abilities in them, so about one opening hand in eight came out as four wards and a step —
  // nothing that could hurt anything at range. That is survivable, because you have a weapon, and
  // it is still a rotten first hour: every one of the four keys does something you cannot see.
  // A driven test drew exactly that hand and it is why this is here.
  if (!out.some(canThrow)) {
    for (const [i, row] of rows.entries()) {
      const pool = (row?.abilities || []).filter(canThrow);
      if (!pool.length) continue;
      const a = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
      out[i] = { ...a, from: row.id, fromName: row.name, confluence: i === rows.length - 1 };
      break;
    }
  }
  return out;
}

// Does this ability arrive somewhere you were pointing and do damage when it gets there?
// js/game/spells.js owns the ten kinds; this is the one question anything outside it asks.
const canThrow = a => {
  const k = SPELL_KINDS[a?.kind];
  return !!k && k.aim === 'bolt' && k.damage > 0;
};

// The whole result of choosing, in the shape the save keeps it in.
export function resolve(doc, picked, rnd = Math.random) {
  const why = checkPick(doc, picked);
  if (why) return { ok: false, why, picked: key(picked), confluence: null, abilities: [] };
  const triple = key(picked);
  const conf = confluenceFor(doc, triple);
  return {
    ok: true, why: null, picked: triple,
    confluence: conf ? conf.id : null,
    confluenceName: conf ? conf.name : null,
    abilities: awaken(doc, triple, rnd).map(a => a.id),
  };
}

// ── awakening ───────────────────────────────────────────────────────────────
// An awakening stone wakes one ability. Which one is not a choice — that is the whole of what the
// stones are for, and it is why the sheet is different every time somebody starts again.

// The four rows a player's essences come to: the three picked and the confluence they resolve to.
// One helper because three places need exactly this list and each of them getting it slightly
// wrong is how a confluence ability ends up unreachable.
export function rowsOf(doc, saved) {
  const picked = key(saved?.picked || []);
  const out = [];
  for (const id of picked) if (doc.essences[id]) out.push(doc.essences[id]);
  const conf = picked.length ? confluenceFor(doc, picked) : null;
  if (conf) out.push(conf);
  return out;
}

// Every ability still to wake, per row, with the per-essence cap already applied. A row that is
// full contributes nothing, which is what makes a stone useless only when ALL of them are full.
export function unawakened(doc, saved) {
  const owned = new Set(saved?.abilities || []);
  const out = [];
  for (const r of rowsOf(doc, saved)) {
    const held = r.abilities.filter(a => owned.has(a.id)).length;
    if (held >= MAX_PER_ESSENCE) continue;
    for (const a of r.abilities) if (!owned.has(a.id)) out.push({ ...a, from: r.id, fromName: r.name, confluence: !doc.essences[r.id] });
  }
  return out;
}

// Is there anything left to wake? The stone refuses when there is not — see js/game/items.js.
export const allAwakened = (doc, saved) => unawakened(doc, saved).length === 0;

// The most this player will ever hold, which is 20 for a full table and less for a thin one. Said
// out loud so the sheet and the Bronze gate can both ask rather than assume.
export function capacity(doc, saved) {
  return rowsOf(doc, saved).reduce((n, r) => n + Math.min(MAX_PER_ESSENCE, r.abilities.length), 0);
}

// Wake one, at random, from a random essence that has room. Random across the whole pool rather
// than "pick an essence then pick an ability in it": the second is subtly biased toward whichever
// essence has fewest left, and the point is that you cannot steer it.
export function awakenOne(doc, saved, rnd = Math.random) {
  const pool = unawakened(doc, saved);
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

// Everything the player has, for the sheet. Reads the save, not the picker.
export function held(doc, saved) {
  const picked = key(saved?.picked || []);
  if (!picked.length) return null;
  // Always composed, never the raw authored row: an authored confluence carries three abilities
  // in the file and ten once js/game/confluence.js has filled out the ladder, and the sheet must
  // show the ten it can actually awaken.
  const conf = confluenceFor(doc, picked);
  const owned = new Set(saved?.abilities || []);
  const rows = [];
  for (const id of picked) {
    const e = doc.essences[id];
    if (!e) continue;
    rows.push({ ...e, confluence: false, abilities: e.abilities.map(a => ({ ...a, owned: owned.has(a.id) })) });
  }
  if (conf) {
    rows.push({
      ...conf, colour: '#c8a24a', tags: ['confluence'], confluence: true,
      abilities: conf.abilities.map(a => ({ ...a, owned: owned.has(a.id) })),
    });
  }
  return { picked, confluence: conf || null, rows, count: owned.size };
}

export async function load(url = 'data/essences.json') {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return normalise(await r.json());
}
