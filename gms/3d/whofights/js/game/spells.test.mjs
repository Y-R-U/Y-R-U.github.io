// The cast rules, and the promise the look makes: every essence in data/essences.json comes out
// looking like itself, and every triple's confluence comes out looking like its three.

import { test, eq, ok, near } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { normalise, key, awaken, ids as essenceIds } from './essences.js';
import {
  MANA, REGEN, KINDS, SHAPES, CONFLUENCE_SHAPE, FALLBACK,
  makeWell, well, refuse, ready, spend, cooling, fraction, tuning, rulesFor,
  lookOf, blendSpell, mixHex, shapeOf, plan,
} from './spells.js';

const raw = JSON.parse(readFileSync(new URL('../../data/essences.json', import.meta.url)));
const { doc } = normalise(raw);
const A = (kind, extra = {}) => ({ id: `t.${kind}`, name: kind, kind, ...extra });

test('a fresh well is full and nothing is on cooldown', () => {
  const w = makeWell();
  eq(w.mana, MANA);
  eq(fraction(w), 1);
  eq(refuse(w, A('attack')), null);
});

test('a cast spends mana and starts its own cooldown', () => {
  const a = A('attack');
  const w = spend(makeWell(), a);
  eq(w.mana, MANA - KINDS.attack.cost);
  near(cooling(w, a), KINDS.attack.cooldown);
  ok(refuse(w, a), 'and it will not go again straight away');
  eq(refuse(w, A('utility')), null, 'a different ability is unaffected');
});

test('the cooldown runs down and the well fills back up', () => {
  const a = A('attack');
  let w = spend(makeWell(), a);
  w = well(w, KINDS.attack.cooldown + 0.01);
  eq(cooling(w, a), 0, 'the key is dropped, not left at zero');
  eq(refuse(w, a), null);
  eq(Object.keys(w.cool).length, 0);
});

test('the well never overfills and never goes negative', () => {
  eq(well(makeWell(), 60).mana, MANA);
  const drained = { mana: 1, max: MANA, cool: {} };
  ok(spend(drained, A('special')).mana >= 0);
  near(well({ mana: 0, max: MANA, cool: {} }, 2).mana, REGEN * 2, 1e-9);
});

test('an empty well refuses by name', () => {
  const w = { mana: 3, max: MANA, cool: {} };
  ok(refuse(w, A('attack')).includes('attack'), 'the reason names the ability');
  eq(ready(w, A('attack')), false);
});

test('an unknown kind still casts, as a utility', () => {
  eq(rulesFor({ kind: 'nonsense' }), KINDS.utility);
  eq(rulesFor(undefined), KINDS.utility);
  eq(refuse(makeWell(), { id: 'x', name: 'X', kind: 'nonsense' }), null);
  ok(refuse(makeWell(), null), 'but nothing at all is not a cast');
});

test('the confluence ability costs more and hits harder than the same kind would', () => {
  const plain = tuning(A('attack'));
  const fourth = tuning(A('attack', { confluence: true }));
  ok(fourth.damage > plain.damage);
  ok(fourth.cost > plain.cost);
  ok(fourth.cooldown > plain.cooldown);
});

test('every kind data/essences.json uses has a rule', () => {
  const kinds = new Set();
  for (const e of Object.values(doc.essences)) for (const a of e.abilities) kinds.add(a.kind);
  for (const c of doc.confluences) for (const a of c.abilities) kinds.add(a.kind);
  for (const k of kinds) ok(KINDS[k], `no rule for kind "${k}"`);
  ok(kinds.size >= 8, `${kinds.size} kinds in use`);
});

test('every essence has a look, and no two of them are the same one', () => {
  const seen = new Map();
  for (const id of essenceIds(doc)) {
    const look = lookOf(doc, { from: id });
    ok(SHAPES[look.shape], `${id}: unknown shape "${look.shape}"`);
    ok(/^#[0-9a-f]{6}$/i.test(look.core), `${id}: no core colour`);
    ok(/^#[0-9a-f]{6}$/i.test(look.edge), `${id}: no edge colour`);
    const k = `${look.shape}|${look.core}|${look.edge}`;
    ok(!seen.has(k), `${id} looks exactly like ${seen.get(k)}`);
    seen.set(k, id);
  }
  eq(seen.size, essenceIds(doc).length);
});

test('an ability from nowhere falls back rather than throwing', () => {
  eq(lookOf(doc, { from: 'no-such-essence' }), { ...FALLBACK });
  eq(lookOf(doc, null), { ...FALLBACK });
  eq(shapeOf({ shape: 'no-such-shape' }), SHAPES.bolt);
});

test('mixHex averages, and answers with the fallback when there is nothing to average', () => {
  eq(mixHex(['#000000', '#ffffff']), '#808080');
  eq(mixHex(['#ff0000', '#00ff00', '#0000ff']), '#555555');
  eq(mixHex(['nonsense'], '#123456'), '#123456');
  eq(mixHex([], '#123456'), '#123456');
});

test('the confluence look is the three that made it', () => {
  const triple = key(['fire', 'water', 'earth']);
  const look = blendSpell(doc, triple);
  eq(look.shape, CONFLUENCE_SHAPE);
  const cores = triple.map(id => doc.essences[id].spell.core);
  eq(look.core, mixHex(cores, FALLBACK.core));
  eq(look.void, null, 'none of those three opens a hole');
  const withVoid = blendSpell(doc, key(['void', 'fire', 'water']));
  eq(withVoid.void, doc.essences.void.spell.void, 'one void among the three is enough');
});

// The rule that has to hold for every player, not for the three triples somebody tried: every
// ability the essence table can hand out resolves to a shape that exists and a colour that parses.
test('every triple there is casts four spells that can be drawn', () => {
  const all = essenceIds(doc);
  let checked = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      for (let k = j + 1; k < all.length; k++) {
        const triple = key([all[i], all[j], all[k]]);
        const w = makeWell(400);
        const got = awaken(doc, triple);
        eq(got.length, 4, `${triple.join('+')} awakened ${got.length}`);
        for (const a of got) {
          const p = plan(doc, w, a, triple);
          ok(p.ok, `${a.id}: ${p.why}`);
          ok(SHAPES[p.cast.look.shape], `${a.id}: unknown shape`);
          ok(/^#[0-9a-f]{6}$/i.test(p.cast.look.core), `${a.id}: bad core`);
          ok(p.cast.damage >= 0 && p.cast.cost > 0, `${a.id}: nonsense tuning`);
        }
        checked++;
      }
    }
  }
  eq(checked, 220, 'twelve essences, three at a time');
});

test('plan refuses with the same reason refuse gives', () => {
  const a = A('special');
  const w = { mana: 1, max: MANA, cool: {} };
  const p = plan(doc, w, a);
  eq(p.ok, false);
  eq(p.why, refuse(w, a));
  eq(p.cast, null);
});
