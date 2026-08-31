import { test, eq, ok } from '../../tools/harness.mjs';

// kv.js probes localStorage at import time, so the stub has to be up before store.js loads.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
const { loadScene, saveScene, clearScene } = await import('./store.js');

const scene = id => ({ version: 1, id, name: id, start: { x: 0, z: 0, yaw: 0 }, objects: [], hotspots: [] });
const reset = () => mem.clear();

// The world editor autosaved to one global `wf.scene`, and startDoc handed that back whatever
// level was asked for — so ?level= and the `goto` verb both landed on somebody else's scene.
test('a working scene belongs to the level it was edited in', () => {
  reset();
  loadScene('academy');
  saveScene(scene('academy'));
  eq(loadScene('academy').doc.id, 'academy');
  eq(loadScene('yard'), null, 'the yard has no working scene of its own yet');
  ok(mem.has('wf.scene.academy'));
});

test('editing one level does not overwrite another', () => {
  reset();
  loadScene('academy');
  saveScene(scene('academy'));
  loadScene('yard');
  saveScene(scene('yard'));
  eq(loadScene('academy').doc.id, 'academy');
  eq(loadScene('yard').doc.id, 'yard');
});

test('clearScene throws away the level that was loaded, not every level', () => {
  reset();
  loadScene('academy');
  saveScene(scene('academy'));
  loadScene('yard');
  saveScene(scene('yard'));
  clearScene();
  eq(loadScene('yard'), null);
  eq(loadScene('academy').doc.id, 'academy');
});

// The old global key names no level. It is claimed by the one it says it holds and by no other.
test('a pre-existing global scene is adopted by its own level only', () => {
  reset();
  mem.set('wf.scene', JSON.stringify(scene('academy')));
  eq(loadScene('yard'), null, 'the yard does not inherit the academy');
  ok(mem.has('wf.scene'), 'and leaves it for the level it belongs to');
  eq(loadScene('academy').doc.id, 'academy');
  ok(mem.has('wf.scene.academy'));
  ok(!mem.has('wf.scene'), 'moved, not copied');
});
