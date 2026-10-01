// node tools/ui_test.mjs — settings store + count formatting.
import assert from 'node:assert/strict';
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const { settings, DEFAULTS } = await import('../js/ui/settings.js');
const { fmtCount } = await import('../js/ui/icons.js');

for (const k of ['music', 'sfx', 'voice', 'muteAll', 'fullscreen', 'renderDistance', 'quality', 'fov', 'sensitivity', 'invertY', 'view',
  'uiScale', 'leftHanded', 'autoJump', 'aimAssist', 'highContrast', 'noFallDamage', 'keepInventory', 'toolsNeverBreak', 'peaceful',
  'alwaysDay', 'mobGrief', 'showFps', 'subtitles']) assert.ok(k in DEFAULTS, 'missing contract key ' + k);
assert.equal(settings.get('autoJump'), true);
assert.equal(settings.get('mobGrief'), false);
const seen = [];
const off = settings.on('fov', (v, k) => seen.push([k, v]));
const all = [];
settings.on('*', (v, k) => all.push(k));
settings.set('fov', 90); settings.set('fov', 90); off(); settings.set('fov', 80);
assert.deepEqual(seen, [['fov', 90]]);
assert.deepEqual(all, ['fov', 'fov']);
settings.set('music', 0.5);
assert.equal(settings.gain('music'), 0.5);
settings.set('musicOn', false); assert.equal(settings.gain('music'), 0);
settings.set('musicOn', true); settings.set('muteAll', true); assert.equal(settings.gain('music'), 0);
await new Promise((r) => setTimeout(r, 200));
assert.equal(JSON.parse(mem['synthwild.settings']).fov, 80);

assert.equal(fmtCount({ count: 18, frac: 0.25 }), '18¼');
assert.equal(fmtCount({ count: 0, frac: 0.5 }), '½');
assert.equal(fmtCount({ count: 3, frac: 3 / 64 }), '3.0');
assert.equal(fmtCount({ count: 64, frac: 0 }), '64');

// R1 A11: a conflict copy keeps its meta; saving a world deleted elsewhere asks before copying
{
  const { createStore } = await import('../js/ui/store.js');
  let created = null;
  const err = (code) => Object.assign(new Error(code), { code });
  const api = {
    worlds: {
      save: async () => { throw Object.assign(err('conflict'), { current: { version: 5 } }); },
      create: async (o) => { created = o; return { id: 'c1', name: o.name, seed: o.seed, mode: o.mode, source: 'cloud', mine: true }; },
    },
    local: { put: async (o) => { if (o.id === 'gone') throw err('not_found'); return { id: o.id || 'l_new', name: o.name, seed: o.seed, mode: o.mode, source: 'local', mine: true }; } },
  };
  const store = createStore(() => api, {});
  const meta = { id: 'w1', name: 'Castle', seed: 's1', mode: 'build', difficulty: 'hard', cheats: true, source: 'cloud', mine: true, version: 4 };
  const r = await store.save(meta, { x: 1 }, null, async () => 'copy');
  assert.ok(r.copied && created.seed === 's1' && created.mode === 'build', 'conflict copy keeps seed + mode');
  assert.equal(r.meta.difficulty, 'hard', 'conflict copy keeps difficulty');
  assert.equal(r.meta.cheats, true, 'conflict copy keeps commands');
  const lm = { id: 'gone', name: 'Gone', seed: 'gs', mode: 'build', difficulty: 'easy', cheats: true, source: 'local', mine: true };
  let asked = null;
  const r2 = await store.save(lm, { x: 1 }, null, async (cur, why) => { asked = why; return 'copy'; });
  assert.equal(asked, 'missing', 'a deleted world asks');
  assert.ok(r2.copied && r2.meta.id === 'l_new' && r2.meta.seed === 'gs' && r2.meta.mode === 'build' && r2.meta.difficulty === 'easy' && r2.meta.cheats, 'the copy keeps all meta');
  await assert.rejects(store.save(lm, { x: 1 }, null, async () => null), 'declining does not save');
}
console.log('ui_test: all passed');
