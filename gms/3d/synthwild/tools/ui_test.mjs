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
console.log('ui_test: all passed');
