// Every triple, walked.
//
// Twelve essences taken three at a time is 220, and Aaron's son asked for a unique confluence for
// each. The tests that matter are the ones a spreadsheet could not keep true by hand: that all 220
// resolve, that all 220 are DIFFERENT, that all 220 have enough in them to claim five from, and —
// the one that would ruin a save — that the same three essences always come to exactly the same
// confluence with exactly the same ability ids, run after run.

import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { normalise, confluenceFor, rowsOf, capacity, awaken, MAX_PER_ESSENCE, MAX_ABILITIES, ids } from './essences.js';
import { registry, all, candidates, composeAbilities, idFor, KIND_ORDER, SIZE } from './confluence.js';
import { KINDS } from './spells.js';

const raw = JSON.parse(readFileSync(new URL('../../data/essences.json', import.meta.url), 'utf8'));
const { doc, warnings } = normalise(raw);

// A second, independent parse. `registry()` caches against the document object, so this is the
// only way to prove the answer is a property of the DATA and not of one run's cache.
const other = normalise(JSON.parse(readFileSync(new URL('../../data/essences.json', import.meta.url), 'utf8'))).doc;

const triples = (() => {
  const list = ids(doc).sort();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      for (let k = j + 1; k < list.length; k++) out.push([list[i], list[j], list[k]]);
    }
  }
  return out;
})();

test('the table loads clean', () => {
  eq(warnings, []);
  eq(ids(doc).length, 12);
});

test('twelve essences make 220 triples and every one of them resolves', () => {
  eq(triples.length, 220);
  const missing = triples.filter(t => !confluenceFor(doc, t));
  eq(missing.map(t => t.join('+')), [], 'these triples resolve to nothing');
});

test('every one of the 220 is a DIFFERENT confluence', () => {
  const names = new Map();
  const idsSeen = new Map();
  for (const t of triples) {
    const c = confluenceFor(doc, t);
    const key = t.join('+');
    if (names.has(c.name)) ok(false, `"${c.name}" is used by both ${names.get(c.name)} and ${key}`);
    if (idsSeen.has(c.id)) ok(false, `id "${c.id}" is used by both ${idsSeen.get(c.id)} and ${key}`);
    names.set(c.name, key);
    idsSeen.set(c.id, key);
  }
  eq(names.size, 220);
  eq(idsSeen.size, 220);
});

test('every ability id in the game is unique, across essences and all 220 confluences', () => {
  const seen = new Map();
  const claim = (id, where) => {
    if (seen.has(id)) ok(false, `ability id "${id}" is claimed by both ${seen.get(id)} and ${where}`);
    seen.set(id, where);
  };
  for (const e of Object.values(doc.essences)) for (const a of e.abilities) claim(a.id, e.id);
  for (const t of triples) {
    const c = confluenceFor(doc, t);
    for (const a of c.abilities) claim(a.id, c.id);
  }
  // 120 essence abilities plus 220 confluences of ten.
  eq(seen.size, 120 + 220 * SIZE);
});

test('the same three essences always come to the same confluence — a save depends on it', () => {
  for (const t of triples) {
    const a = confluenceFor(doc, t);
    const b = confluenceFor(other, [...t].reverse());
    eq(b.id, a.id, `${t.join('+')} resolved to two different ids on two parses`);
    eq(b.name, a.name, `${t.join('+')} was named twice`);
    eq(b.abilities.map(x => x.id), a.abilities.map(x => x.id),
      `${t.join('+')} handed out different abilities on a second parse — every save of it is broken`);
  }
});

test('order of the three never matters', () => {
  const t = ['fire', 'void', 'life'];
  const want = confluenceFor(doc, t).id;
  for (const p of [['void', 'life', 'fire'], ['life', 'fire', 'void'], ['void', 'fire', 'life']]) {
    eq(confluenceFor(doc, p).id, want);
  }
  eq(idFor(['void', 'fire', 'life']), idFor(['fire', 'life', 'void']));
});

test('every confluence holds ten, so five can be claimed from it', () => {
  for (const t of triples) {
    const c = confluenceFor(doc, t);
    eq(c.abilities.length, SIZE, `${c.name} has ${c.abilities.length}`);
    ok(c.abilities.length >= MAX_PER_ESSENCE, `${c.name} cannot fill five slots`);
  }
});

test('every ability everywhere has a kind js/game/spells.js can actually tune', () => {
  const bad = [];
  for (const e of Object.values(doc.essences)) {
    for (const a of e.abilities) if (!KINDS[a.kind]) bad.push(`${a.id} (${a.kind})`);
  }
  for (const t of triples) {
    for (const a of confluenceFor(doc, t).abilities) if (!KINDS[a.kind]) bad.push(`${a.id} (${a.kind})`);
  }
  eq(bad, [], 'these abilities have a kind with no tuning behind it');
});

test('a generated confluence covers the whole ladder — five awakened is five different things', () => {
  const c = confluenceFor(doc, ['blood', 'earth', 'void']);
  ok(c.generated, 'that triple should not be an authored one');
  eq([...new Set(c.abilities.map(a => a.kind))].sort(), KIND_ORDER,
    'a composed confluence should have one of every kind');
});

test('the authored seventeen keep their own writing and win on their own triple', () => {
  const authored = raw.confluences.filter(c => c.exact);
  eq(authored.length, 17, 'the registry should have seventeen named combinations on file');
  for (const a of authored) {
    const c = confluenceFor(doc, a.exact);
    eq(c.id, a.id, `${a.id} lost its own triple`);
    eq(c.name, a.name);
    eq(c.blurb, a.blurb, 'the authored blurb was overwritten by a composed one');
    eq(c.generated, false);
    // Its three authored abilities come first, and the composed ones fill the ladder underneath.
    eq(c.abilities.slice(0, a.abilities.length).map(x => x.id), a.abilities.map(x => x.id));
    eq(c.abilities.length, SIZE);
  }
});

test('topping up an authored confluence never gives it two of the same kind', () => {
  for (const a of raw.confluences.filter(c => c.exact)) {
    const kinds = confluenceFor(doc, a.exact).abilities.map(x => x.kind);
    eq(kinds.length, new Set(kinds).size, `${a.id} has two abilities of the same kind`);
  }
});

test('no two authored confluences claim the same triple', () => {
  const seen = new Map();
  for (const c of raw.confluences) {
    if (!c.exact) continue;
    const k = [...c.exact].sort().join('+');
    if (seen.has(k)) ok(false, `${k} is claimed by both ${seen.get(k)} and ${c.id}`);
    seen.set(k, c.id);
  }
});

test('a name is built from the words its three parents lend it', () => {
  const c = confluenceFor(doc, ['earth', 'fire', 'void']);
  const words = ['earth', 'fire', 'void'].flatMap(id => doc.essences[id].words);
  ok(c.name.split(' ').every(w => words.includes(w)), `"${c.name}" is not made of its parents' words`);
});

test('an essence with no words still lends its name rather than a blank', () => {
  const cut = normalise({
    ...raw,
    essences: Object.fromEntries(Object.entries(raw.essences).map(([k, v]) => [k, { ...v, words: undefined }])),
  }).doc;
  const c = confluenceFor(cut, ['earth', 'fire', 'void']);
  ok(c.name.trim().length > 3, `an unworded table produced "${c.name}"`);
  eq(all(cut).length, 220);
  eq(new Set(all(cut).map(x => x.name)).size, 220, 'an unworded table still needs 220 different names');
});

test('the four rows a player has are their three and the one those came to', () => {
  const saved = { picked: ['dark', 'life', 'water'], confluence: null };
  const rows = rowsOf(doc, saved);
  eq(rows.length, 4);
  eq(rows.slice(0, 3).map(r => r.id), ['dark', 'life', 'water']);
  eq(rows[3].id, confluenceFor(doc, saved.picked).id);
});

test('the ceiling is twenty for every one of the 220', () => {
  eq(MAX_PER_ESSENCE, 5);
  eq(MAX_ABILITIES, 20);
  for (const t of triples) {
    eq(capacity(doc, { picked: t, confluence: null }), 20, `${t.join('+')} tops out somewhere other than twenty`);
  }
});

test('the registry names all 220 and reserves the authored names first', () => {
  const reg = registry(doc);
  eq(reg.names.size, 220);
  eq(reg.authored.size, 17);
  eq(reg.names.get(['blood', 'dark', 'doom'].join(',')), 'Sin');
});

test('there are far more candidate names than there are triples to need them', () => {
  const c = candidates(doc, ['earth', 'fire', 'void']);
  ok(c.length >= 40, `only ${c.length} candidate names for a triple`);
  eq(c.length, new Set(c).size, 'the candidate list repeats itself');
});

test('composing skips the kinds it is told to skip', () => {
  const skip = new Set(['attack', 'defence']);
  const out = composeAbilities(doc, ['earth', 'fire', 'void'], 'x', skip);
  eq(out.length, KIND_ORDER.length - 2);
  eq(out.some(a => skip.has(a.kind)), false);
});

test('fewer than two essences has no confluence, and two still does', () => {
  eq(confluenceFor(doc, []), null);
  eq(confluenceFor(doc, ['fire']), null);
  eq(confluenceFor(doc, ['fire', 'nothing-like-it']), null);
  const pair = confluenceFor(doc, ['fire', 'water']);
  ok(pair, 'a save whose table dropped an essence lost its fourth row');
  ok(pair.abilities.length >= MAX_PER_ESSENCE);
});

// ── the opening hand ────────────────────────────────────────────────────────
// Registration draws one ability from each of the four at random, and about one hand in eight came
// out as four wards and a step — nothing that could be thrown at anything. Survivable, because you
// have a weapon, and a rotten first hour: four number keys that all do something you cannot see.
// A driven test drew exactly that hand (fire.kiln, life.bark, void.shell, and a movement
// confluence) which is why js/game/essences.js now guarantees one of the four is a bolt.

const canThrow = a => KINDS[a.kind]?.aim === 'bolt' && KINDS[a.kind].damage > 0;

test('every opening hand there is has something in it you can throw', () => {
  let checked = 0;
  const bad = [];
  for (const t of triples) {
    // Six rolls across the width of the draw, which walks a different ability out of each essence.
    for (let i = 0; i < 6; i++) {
      const hand = awaken(doc, t, () => (i + 0.5) / 6);
      checked++;
      if (!hand.some(canThrow)) bad.push(`${t.join('+')} @${i}: ${hand.map(a => a.kind).join(', ')}`);
    }
  }
  eq(checked, triples.length * 6);
  eq(bad.slice(0, 3), [], `${bad.length} of ${checked} opening hands could not hurt anything at range`);
});

test('the guarantee replaces one ability and never adds a fifth', () => {
  for (const t of triples.slice(0, 40)) {
    for (let i = 0; i < 4; i++) {
      const hand = awaken(doc, t, () => (i + 0.5) / 4);
      eq(hand.length, 4, `${t.join('+')} handed out ${hand.length}`);
      eq(new Set(hand.map(a => a.from)).size, 4, 'one from each of the four, still');
      eq(new Set(hand.map(a => a.id)).size, 4, 'and no ability twice');
    }
  }
});

test('a hand that could already throw is left exactly as it was drawn', () => {
  // fire's list opens with Searing Brand, an attack, so the lowest roll needs no correction.
  const hand = awaken(doc, ['fire', 'water', 'wind'], () => 0);
  eq(hand[0].id, doc.essences.fire.abilities[0].id);
  eq(hand.map(a => a.from), ['fire', 'water', 'wind', 'tempest']);
});
