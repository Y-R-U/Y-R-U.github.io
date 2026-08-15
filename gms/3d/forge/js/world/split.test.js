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
