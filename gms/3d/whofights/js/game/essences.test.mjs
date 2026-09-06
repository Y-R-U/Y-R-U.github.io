import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import {
  PICK, key, normalise, ids, tally, confluenceFor, checkPick, awaken, resolve, held,
} from './essences.js';

const raw = JSON.parse(readFileSync(new URL('../../data/essences.json', import.meta.url)));
const { doc, warnings } = normalise(raw);

test('the shipped table loads clean', () => {
  eq(warnings, []);
  eq(doc.pick, PICK);
  ok(ids(doc).length >= 9, `${ids(doc).length} essences`);
  for (const want of ['void', 'fire', 'doom', 'water', 'chaos', 'destruction', 'manipulation', 'wind', 'earth']) {
    ok(doc.essences[want], `no ${want} essence`);
  }
});

test('every essence is filled in, not a stub', () => {
  const seen = new Set();
  for (const e of Object.values(doc.essences)) {
    ok(e.name.length > 2, e.id);
    ok(e.blurb.length > 20, `${e.id} has no blurb`);
    ok(e.tags.length >= 1, `${e.id} has no tags — nothing can match it`);
    ok(e.abilities.length >= 5, `${e.id} has ${e.abilities.length} abilities`);
    for (const a of e.abilities) {
      ok(a.name.length > 2 && a.text.length > 20, `${e.id}/${a.id}`);
      ok(!seen.has(a.id), `duplicate ability id ${a.id}`);
      seen.add(a.id);
    }
  }
  for (const c of doc.confluences) {
    ok(c.abilities.length >= 2, `${c.id} has ${c.abilities.length} abilities`);
    for (const a of c.abilities) { ok(!seen.has(a.id), `duplicate ability id ${a.id}`); seen.add(a.id); }
  }
});

test('a triple is a set, however it is written down', () => {
  eq(key(['fire', 'water', 'wind']), key(['wind', 'fire', 'water']));
  eq(key(['fire', 'fire', 'water']), ['fire', 'water'], 'duplicates collapse');
  eq(key([null, 'fire', 7]), ['fire'], 'rubbish is dropped');
});

// The whole point of the fallback rule. Twelve essences is 220 triples and nobody is going to
// author 220 confluences, but a player must not be able to pick their way into a blank fourth.
test('every combination of three resolves to a confluence', () => {
  const all = ids(doc);
  let n = 0, named = 0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      for (let k = j + 1; k < all.length; k++) {
        const t = [all[i], all[j], all[k]];
        const c = confluenceFor(doc, t);
        ok(c, `no confluence for ${t.join(' + ')}`);
        ok(c.abilities.length >= 2, `${c.id} is empty for ${t.join(' + ')}`);
        if (c.exact) named++;
        n++;
      }
    }
  }
  ok(n > 200, `only ${n} triples`);
  ok(named >= 10, `only ${named} triples have a name of their own`);
});

test('a named combination beats the tag rule', () => {
  eq(confluenceFor(doc, ['dark', 'blood', 'doom']).id, 'sin');
  eq(confluenceFor(doc, ['doom', 'blood', 'dark']).id, 'sin', 'order must not matter');
  eq(confluenceFor(doc, ['fire', 'water', 'wind']).id, 'tempest');
  ok(confluenceFor(doc, ['fire', 'water', 'wind']).exact, 'tempest is a named entry');
});

test('the tags of a triple are counted, not guessed', () => {
  const t = tally(doc, ['fire', 'destruction', 'chaos']);
  eq(t.destructive, 3, 'three destructive essences did not count as three');
  ok(!t.confluence, 'a tag nothing carries appeared anyway');
});

test('a pick is checked before it is resolved, and says why', () => {
  ok(/Choose 2 more/.test(checkPick(doc, ['fire'])));
  ok(/Choose 3 more/.test(checkPick(doc, [])));
  ok(/only 3/.test(checkPick(doc, ['fire', 'water', 'wind', 'earth'])));
  ok(/no mithril essence/.test(checkPick(doc, ['fire', 'water', 'mithril'])));
  eq(checkPick(doc, ['fire', 'water', 'wind']), null);
});

// One ability for each essence you consume, and the confluence is one of the four.
test('choosing gives you four abilities, one from each', () => {
  const got = awaken(doc, ['blood', 'dark', 'doom']);
  eq(got.length, 4);
  eq(got.filter(a => a.confluence).length, 1, 'exactly one comes from the confluence');
  eq(got.map(a => a.from).sort(), ['blood', 'dark', 'doom', 'sin']);
  for (const a of got) ok(a.name && a.text, a.id);
});

test('the first ability of each essence is the one you get', () => {
  for (const id of ids(doc)) {
    const got = awaken(doc, [id, 'fire', 'water']).find(a => a.from === id);
    if (!got) continue;
    eq(got.id, doc.essences[id].abilities[0].id, `${id} awakened the wrong one`);
  }
});

test('resolve is the whole answer, in the shape the save keeps', () => {
  const bad = resolve(doc, ['fire']);
  eq(bad.ok, false);
  eq(bad.abilities, []);
  const good = resolve(doc, ['wind', 'fire', 'water']);
  eq(good.ok, true);
  eq(good.picked, ['fire', 'water', 'wind']);
  eq(good.confluence, 'tempest');
  eq(good.abilities.length, 4);
});

test('the sheet reads the save back, and marks what is owned', () => {
  const chose = resolve(doc, ['blood', 'dark', 'doom']);
  const h = held(doc, chose);
  eq(h.picked, ['blood', 'dark', 'doom']);
  eq(h.confluence.id, 'sin');
  eq(h.rows.length, 4, 'three essences and the confluence');
  eq(h.rows.filter(r => r.confluence).length, 1);
  eq(h.count, 4);
  // Five slots an essence, and one of them lit.
  for (const r of h.rows.filter(x => !x.confluence)) {
    eq(r.abilities.filter(a => a.owned).length, 1, `${r.id} has the wrong number awakened`);
    ok(r.abilities.length >= 5, `${r.id} lost its unawakened slots`);
  }
  eq(held(doc, null), null, 'a save with no essences is not a sheet');
  eq(held(doc, { picked: [] }), null);
});

// A save written by a build whose table has since changed must not take the sheet down with it.
test('a save naming an essence that no longer exists still opens', () => {
  const h = held(doc, { picked: ['fire', 'mithril', 'water'], confluence: 'nope', abilities: ['fire.brand'] });
  ok(h, 'the sheet refused to open');
  eq(h.rows.filter(r => !r.confluence).length, 2, 'the two real ones survived');
  ok(h.confluence, 'it fell back to the tag rule for the confluence');
});

test('a table with no catch-all says so rather than resolving to nothing', () => {
  const cut = normalise({ ...raw, confluences: raw.confluences.filter(c => c.exact) });
  ok(cut.warnings.some(w => /catch-all/.test(w)), cut.warnings.join('; '));
});
