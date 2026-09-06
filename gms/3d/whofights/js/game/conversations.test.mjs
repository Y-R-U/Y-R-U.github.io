import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { run, open, visibleChoices } from './dialogue.js';
import { validateAction } from './actions.js';
import { normaliseCast } from './characters.js';
import { Hotspots } from './hotspots.js';
import { RANKS } from './contracts.js';

const pack = JSON.parse(readFileSync(new URL('../../data/conversations.json', import.meta.url))).nodes;
const cast = normaliseCast(JSON.parse(readFileSync(new URL('../../data/characters.json', import.meta.url)))).cast;
const ids = Object.keys(pack);

test('every line speaks as a character that exists', () => {
  for (const [id, n] of Object.entries(pack)) {
    for (const l of n.lines) ok(cast[l.who], `${id}: unknown speaker "${l.who}"`);
  }
});

test('every goto and every `next` lands on a real node', () => {
  for (const [id, n] of Object.entries(pack)) {
    if (n.next) ok(pack[n.next], `${id}: next → missing ${n.next}`);
    for (const c of n.choices || []) {
      if (c.goto) ok(pack[c.goto], `${id}: choice → missing ${c.goto}`);
    }
  }
});

test('every `sets` effect is a valid action', () => {
  for (const [id, n] of Object.entries(pack)) {
    for (const a of n.sets || []) eq(validateAction(a, id), []);
    for (const c of n.choices || []) for (const a of c.sets || []) eq(validateAction(a, id), []);
  }
});

test('the greeter conversation is a worked example, not a stub', () => {
  const root = pack['society.greeter.hello'];
  ok(root, 'the hotspot in society.json says this node');
  ok(root.lines.length > 1, 'more than one line');
  ok(root.choices.length >= 2, 'it branches');
  ok(root.choices.some(c => (c.sets || []).length), 'a choice has an effect');
  ok(root.lines.some(l => l.who === 'narrator'), 'the narrator is used');
  ok(ids.length >= 4, 'there is somewhere for the branches to go');
});

test('taking the first choice every time walks to an end', () => {
  const r = run(pack, 'society.greeter.hello', {}, [0, 0, 0, 0, 0]);
  ok(r.lines.length >= 4, `walked ${r.lines.length} lines`);
  ok(r.effects.some(a => a.k === 'flag'), 'flags were set on the way through');
});

test('a choice gated on a flag only appears once that flag is set', () => {
  const n = pack['society.greeter.newadventures'];
  const gated = n.choices.find(c => c.if);
  ok(gated, 'the example keeps one gated choice');
  const before = visibleChoices(n, { flags: {} }).length;
  const after = visibleChoices(n, { flags: { 'society.knows.vail': true } }).length;
  eq(after, before - 1, 'the gate closes once the player already knows');
});

test('a `once` node will not reopen', () => {
  // No shipped node is `once` any more — Vail's first hello is gated on the flag it sets instead,
  // because `seen` lives in the DialogueBox and dies with the page while the flag is saved. The
  // engine rule still has to hold for the first author who reaches for it.
  const one = { solo: { id: 'solo', once: true, lines: [{ who: 'greeter', text: 'once' }], choices: [], next: null } };
  ok(open(one, 'solo', { seen: [] }));
  eq(open(one, 'solo', { seen: ['solo'] }), null);
});

// Aaron, playing it: "there used to be a menu of questions i could ask after the chat but it no
// longer shows". `society.greeter.hello` was `once`, so the second press opened nothing at all and
// the say action reported nothing either. The invariant that fixes it is this one: whatever the
// flags say, and whatever the player has already been shown, pressing on Vail opens something.
test('Vail always has something to say, whatever the save knows', () => {
  const level = JSON.parse(readFileSync(new URL('../../data/levels/society.json', import.meta.url)));
  const mine = level.hotspots.filter(h => h.attach === 'greeter' && h.trigger === 'interact');
  ok(mine.length >= 2, 'a first meeting and a return visit');

  const at = { x: cast.greeter.place.x, z: cast.greeter.place.z };
  const everySeen = Object.keys(pack);          // the worst case: he has said all of it already
  for (const flags of [{}, { 'society.met.registrar': true },
    { 'society.met.registrar': true, 'society.knows.vail': true, 'society.knows.contracts': true,
      'society.greeted': true },
    // Every rung of the registration path, because each one swaps which hotspot answers.
    { 'society.met.registrar': true, 'society.test.passed': true },
    { 'society.met.registrar': true, 'society.test.passed': true, 'society.essences.chosen': true },
    { 'society.test.passed': true, 'society.essences.chosen': true, 'society.registered': true,
      'society.rank': 'iron' },
    // A save from before 07151d25, when no `sets` ran: the player has met her and nothing wrote
    // it down. It must fall back to a conversation, never to silence.
    { 'society.chose.iron': true }]) {
    const hs = new Hotspots(level.hotspots, { flags, characterAt: () => at });
    const open4 = hs.candidates(at, ['interact']).filter(h => h.attach === 'greeter');
    eq(open4.length, 1, `exactly one greeter hotspot answers for ${JSON.stringify(flags)}`);
    const node = open4[0].actions.find(a => a.k === 'say')?.node;
    ok(pack[node], `${open4[0].id} says a node that exists`);
    ok(open(pack, node, { flags, seen: everySeen }), `${node} still opens for ${JSON.stringify(flags)}`);
    ok(visibleChoices(pack[node], { flags }).length >= 2, `${node} offers him questions to ask`);
  }
});

// Same shape as the greeter rule, and the same bug waiting: two hotspots on one body whose
// predicates both answer means the player presses a person and gets whichever the array happens
// to list first. Brann and Bel each got a second one when the proving landed.
test('nobody has two hotspots answering at once', () => {
  const level = JSON.parse(readFileSync(new URL('../../data/levels/society.json', import.meta.url)));
  const saves = [
    {},
    { 'society.met.registrar': true },
    { 'society.met.registrar': true, 'society.test.entered': true },
    { 'society.test.passed': true },
    { 'society.test.passed': true, 'society.essences.chosen': true },
    { 'society.test.passed': true, 'society.essences.chosen': true, 'society.registered': true,
      'society.rank': 'iron' },
  ];
  const bodies = [...new Set(level.hotspots.map(h => h.attach).filter(Boolean))];
  for (const flags of saves) {
    for (const who of bodies) {
      const at = cast[who]?.place;
      if (!at) continue;
      const hs = new Hotspots(level.hotspots, { flags, characterAt: () => at });
      const open = hs.candidates(at, ['interact']).filter(h => h.attach === who);
      ok(open.length <= 1, `${who}: ${open.length} hotspots for ${JSON.stringify(flags)}`);
      for (const h of open) {
        const node = h.actions.find(a => a.k === 'say')?.node;
        if (node) ok(pack[node], `${h.id} says a node that exists`);
      }
    }
  }
});

// Every new node has to be reachable, or it is writing nobody will ever see. A node is reached
// either from a hotspot, a character, another node's `goto`/`next`, or — for the stair refusals
// alone — from a template in session.js, which is why that one coupling is spelled out here.
test('every conversation node is reachable from somewhere', () => {
  const level = JSON.parse(readFileSync(new URL('../../data/levels/society.json', import.meta.url)));
  const proving = JSON.parse(readFileSync(new URL('../../data/levels/proving.json', import.meta.url)));
  const reached = new Set();
  const eat = list => { for (const a of list || []) if (a.k === 'say' && a.node) reached.add(a.node); };
  for (const l of [level, proving]) for (const h of l.hotspots || []) eat(h.actions);
  for (const c of Object.values(cast)) eat(c.actions);
  // js/game/session.js stairRefusal(): `society.stair.refuse.${why}`, one per rank you can be
  // turned back from. A rank with no node there falls through to a toast, which is the mute
  // version of the whole feature.
  for (const rank of RANKS.filter(r => r !== 'none')) {
    const id = `society.stair.refuse.${rank}`;
    ok(pack[id], `no refusal written for the ${rank} stair`);
    reached.add(id);
  }
  for (const n of Object.values(pack)) {
    if (n.next) reached.add(n.next);
    for (const c of n.choices || []) if (c.goto) reached.add(c.goto);
  }
  for (const id of ids) ok(reached.has(id), `${id} is written but nothing opens it`);
});
