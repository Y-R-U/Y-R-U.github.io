// Three reviews in a row found the same hole: a js/world module that imports three — so no node
// test can reach it — quietly holding a rule the game depends on. vermin.js's draw list, then
// props.js's lamp state, then nodes.js's reach and labels, where `range: 0` made every gather node
// in the world unreachable with the suite still green. roster.js, propstate.js and nodestate.js
// are the three fixes. This is the check that a fourth one cannot ship.
//
// The tell each time was the same object: a context target — what pickContext reads — authored on
// the three side. That is the shape this looks for, and only that shape, because a rule that fires
// on anything vaguer gets deleted rather than obeyed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const JS = resolve(HERE, '..');

const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const importsOf = src => [...src.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)].map(m => m[1]);

// Every file under js/ that reaches `three`, directly or through another file. A file outside this
// set is one a node test can import, which is the whole point.
function threeSide() {
  const src = new Map();
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) src.set(p, strip(readFileSync(p, 'utf8')));
    }
  };
  walk(JS);
  const bad = new Set();
  for (const [p, s] of src) if (importsOf(s).some(i => i === 'three' || i.startsWith('three/'))) bad.add(p);
  for (let grew = true; grew;) {
    grew = false;
    for (const [p, s] of src) {
      if (bad.has(p)) continue;
      for (const i of importsOf(s)) {
        if (!i.startsWith('.')) continue;
        if (bad.has(resolve(dirname(p), i))) { bad.add(p); grew = true; break; }
      }
    }
  }
  return bad;
}

test('no js/world module builds a context target where no node test can reach it', () => {
  const bad = threeSide();
  const offenders = [];
  for (const name of readdirSync(JS + '/world')) {
    const path = `${JS}/world/${name}`;
    if (!name.endsWith('.js') || name.endsWith('.test.js') || !bad.has(path)) continue;
    for (const [lit] of strip(readFileSync(path, 'utf8')).matchAll(/\{[^{}]*\brange\s*:[^{}]*\}/g)) {
      if (/\bx\s*:/.test(lit) && /\bz\s*:/.test(lit)) offenders.push(`${name}: ${lit.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [],
    'move it into a sibling module that does not import three, the way propstate.js and nodestate.js do');
});

// The rule above catches one authored shape. The wave after it put nine rules the game depends on
// into two new three-side files — the follow speeds, whether a body moves at all, whether the Watch
// has a light, whether a hen exists — and every one of them could be deleted with the suite green,
// because none of them is a context target.
//
// The tell those nine share is not a shape in the source, it is a *dependency*: a js/world module
// that imports from js/sim or js/game is one the game drives, and its rules belong where a node
// test can reach them. That set is four files and it is computed, not listed, so a fifth rig cannot
// ship without a row here. Each row names the node-side module its rules live in and one call that
// proves it still delegates. Nothing textual and nothing to false-positive on.
const DRIVEN = {
  'vermin.js': ['./bestiary.js', /CREATURES\[spec\.enemy\]/, /roster\(this\.agents/],
  'robed.js': ['./foeshape.js', /carry\(a, dt\)/, /lampCount\(at\.length, this\.lampLevel, PER_MESH\)/,
    /mesh\.visible = n > 0;/, /if \(carriesLamp\(a\)\)/, /if \(this\.frozen\) return;/,
    /zi: 0, state: STATE\.idle,/],
  'chicken.js': ['./bestiary.js', /carry\(a, dt\)/, /penned\(this\.agents/, /if \(this\.frozen\) return;/],
  // A body's own three lines — the position write, the bird coming into existence, the walk home —
  // are the one thing that cannot be lifted out, so they are pinned where they are. Each of these
  // three deletions leaves the whole suite green and the feature gone.
  'escorts.js': ['../game/escort.js', /SPEED\[this\.entry\(npc\)\?\.body\]/,
    /carriedGait\(b\.body, heading\)/, /b\.agent\.x = x;\s*b\.agent\.z = z;/,
    /b\.group\.position\.set\(x, this\.groundY\(x, z\), z\)/,
    /if \(on\) b\.agent = this\.chickens\?\.add\(/,
    /park\(npc\) \{[^}]*this\.move\(npc, b\.home\.x, b\.home\.z, b\.home\.ry\)/],
};

test('every js/world module the game drives keeps its rules where a node test can reach them', () => {
  const bad = threeSide();
  const driven = [];
  for (const name of readdirSync(JS + '/world')) {
    const path = `${JS}/world/${name}`;
    if (!name.endsWith('.js') || name.endsWith('.test.js') || !bad.has(path)) continue;
    const src = strip(readFileSync(path, 'utf8'));
    if (importsOf(src).some(i => i.startsWith('../sim/') || i.startsWith('../game/'))) driven.push(name);
  }
  assert.deepEqual(driven.sort(), Object.keys(DRIVEN).sort(),
    'a three-side world module the game drives, with no row saying where its rules live');

  for (const [name, [rules, ...calls]] of Object.entries(DRIVEN)) {
    const src = strip(readFileSync(`${JS}/world/${name}`, 'utf8'));
    assert.ok(importsOf(src).includes(rules), `${name} no longer reads ${rules}`);
    for (const call of calls) {
      assert.match(src, call, `${name}: the rule ${call} came back inline, where nothing can test it`);
    }
  }
});

// The check above only proves the shape is absent. These prove the two files that used to hold it
// still delegate, so the rules cannot quietly come back inline under a different shape.
test('props.js and nodes.js answer the button out of their rules modules', () => {
  const props = strip(readFileSync(`${JS}/world/props.js`, 'utf8'));
  assert.match(props, /targetList\(/);
  assert.match(props, /useProp\(|LIT_VERB/);
  const nodes = strip(readFileSync(`${JS}/world/nodes.js`, 'utf8'));
  assert.match(nodes, /targetList\(/);
  assert.match(nodes, /nodeItem\(/);
  assert.doesNotMatch(nodes, /'spent'/, 'nodes.js is labelling targets by hand again');
  // `targets() { return []; }` was the review's second mutilation and it left the suite green:
  // every node in the game gone from the button, and nothing anywhere to say so.
  for (const src of [props, nodes]) assert.match(src, /targets\(\)\s*\{\s*return this\.list;\s*\}/);
});
