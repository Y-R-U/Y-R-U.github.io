import { test, eq, ok } from '../../../tools/harness.mjs';
import { deriveLinks, tree, describeLink } from './links.js';

const nodes = {
  root: { name: 'root', lines: [], choices: [{ say: 'left', goto: 'a' }, { say: 'right', goto: 'b' }], next: null },
  a: { name: 'a', lines: [], choices: [], next: 'c' },
  b: { name: 'b', lines: [], choices: [{ say: 'back', goto: 'root' }], next: null },
  c: { name: 'c', lines: [], choices: [], next: null },
  aside: { name: 'aside', lines: [], choices: [], next: null },
  lonely: { name: 'lonely', lines: [], choices: [], next: null },
};

const levels = {
  academy: {
    hotspots: [
      { id: 'hs.greeter', name: 'Speak to Vail', attach: 'greeter', trigger: 'interact',
        actions: [{ k: 'say', node: 'root' }, { k: 'flag', name: 'x', value: true }] },
      { id: 'hs.gone', name: 'Broken', trigger: 'enter', actions: [{ k: 'say', node: 'nosuchnode' }] },
    ],
  },
  yard: { hotspots: [{ id: 'hs.yard', trigger: 'enter', actions: [{ k: 'say', node: 'root' }] }] },
};

const characters = {
  greeter: { name: 'Vail', body: 'robed', actions: [{ k: 'say', node: 'aside' }] },
  narrator: { name: 'Narrator', body: 'none' },
};

test('a node linked from two hotspots reports both', () => {
  const { links } = deriveLinks({ nodes, levels, characters });
  const hs = links.root.filter(l => l.kind === 'hotspot');
  eq(hs.map(l => l.level).sort(), ['academy', 'yard']);
  eq(hs[0].attach, 'greeter');
});

test('a character record that says a node counts as a link', () => {
  const { links } = deriveLinks({ nodes, levels, characters });
  eq(links.aside.filter(l => l.kind === 'character').map(l => l.character), ['greeter']);
});

test('choice and next links both appear, with where they came from', () => {
  const { links } = deriveLinks({ nodes, levels, characters });
  eq(links.a.map(l => `${l.kind}:${l.from}`), ['choice:root']);
  eq(links.c.map(l => `${l.kind}:${l.from}`), ['next:a']);
  eq(links.root.filter(l => l.kind === 'choice').map(l => l.from), ['b']);
});

test('a node nothing points at is an orphan', () => {
  const { orphans } = deriveLinks({ nodes, levels, characters });
  eq(orphans, ['lonely']);
});

test('a hotspot pointing at a node that does not exist is reported, not swallowed', () => {
  const { missing } = deriveLinks({ nodes, levels, characters });
  eq(missing.length, 1);
  eq(missing[0].node, 'nosuchnode');
  ok(missing[0].from.includes('hs.gone'));
});

test('reverse links are derived from nothing stored on the node', () => {
  const bare = deriveLinks({ nodes });
  eq(bare.links.root.filter(l => l.kind === 'hotspot').length, 0, 'no levels in, no hotspot links out');
  eq(bare.orphans, ['aside', 'lonely'], 'without the level and character docs both look orphaned');
});

test('the tree walks a branch as a tree and marks the loop back', () => {
  const rows = tree(nodes, deriveLinks({ nodes, levels, characters }));
  const seq = rows.map(r => `${'  '.repeat(r.depth)}${r.id}${r.repeat ? '*' : ''}`);
  eq(seq, ['aside', 'root', '  a', '    c', '  b', '    root*', 'lonely']);
});

test('every node appears in the tree exactly once as a real row', () => {
  const rows = tree(nodes, deriveLinks({ nodes, levels, characters }));
  const real = rows.filter(r => !r.repeat).map(r => r.id).sort();
  eq(real, Object.keys(nodes).sort());
});

test('a cycle with no root still lists every node', () => {
  const loop = { x: { lines: [], choices: [{ say: 'on', goto: 'y' }] }, y: { lines: [], choices: [{ say: 'back', goto: 'x' }] } };
  const rows = tree(loop, deriveLinks({ nodes: loop }));
  ok(rows.some(r => r.id === 'x'));
  ok(rows.some(r => r.id === 'y'));
});

test('describeLink says where to look', () => {
  const { links } = deriveLinks({ nodes, levels, characters });
  ok(describeLink(links.root[0]).includes('academy'));
  ok(describeLink(links.a[0]).includes('root'));
});
