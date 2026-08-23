#!/usr/bin/env node
/**
 * The rest of core/, checked in a real browser: the save round trip and its
 * corruption fallbacks, the quality switch, the `__state` snapshot's shape, and
 * that nothing leaves the origin.
 *
 * `__state`'s shape is checked because every later gate asserts on it — a field
 * quietly renamed here is a gate that reads `undefined` and passes.
 *
 *   node tools/statecheck.mjs [--gpu]
 */

import { harness } from './cdp.mjs';

const gpu = process.argv.includes('--gpu');
const { cdp, base, close } = await harness({ gpu });
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n.padEnd(44)} ${d ?? ''}`); };

// Every field a later phase is entitled to read off __state.
const SHAPE = {
  tick: 'number', fps: 'number', frameMs: 'number', drawCalls: 'number', sprites: 'number',
  tris: 'number', particles: 'number', lights: 'number', scene: 'string',
  view: { mode: 'string', w: 'number', h: 'number', dpr: 'number', worldW: 'number', worldH: 'number', scale: 'number' },
  cam: { x: 'number', y: 'number', zoom: 'number', zoomTarget: 'number', reason: 'string', boxW: 'number', boxH: 'number', members: 'number' },
  input: { axisX: 'number', axisY: 'number', stickActive: 'boolean', stickR: 'number', source: 'string' },
  entities: { total: 'number', hostile: 'number', crates: 'number' },
  player: { alive: 'boolean', x: 'number', y: 'number', vx: 'number', vy: 'number', speed: 'number', angle: 'number', band: 'string', altFt: 'number' },
  audio: { ready: 'boolean', available: 'boolean', voices: 'number' },
  quality: { low: 'boolean' },
  errors: 'object',
};
function checkShape(obj, shape, path = '') {
  const bad = [];
  for (const [k, v] of Object.entries(shape)) {
    const at = path ? path + '.' + k : k;
    if (!(k in obj)) { bad.push(at + ' MISSING'); continue; }
    if (typeof v === 'object') bad.push(...checkShape(obj[k], v, at));
    else if (typeof obj[k] !== v) bad.push(`${at} is ${typeof obj[k]}, want ${v}`);
  }
  return bad;
}

try {
  await cdp.viewport(390, 844, 1, true);

  /* --- 1. shape, on a booted game with a scripted player ---------------- */
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1&nosave`);
  if (!await cdp.waitFor('window.__state && window.__state.tick > 0', 20000)) throw new Error('did not boot');
  await cdp.eval(`window.__kh.player = { x: 120, y: -4200, vx: 300, vy: -40, hull: 64 };
    window.__kh.entities = [{ id: 'a', hostile: true }, { id: 'b', hostile: true }, { id: 'c', kind: 'crate' }];`);
  await cdp.frames(10);
  const s = await cdp.state();
  const bad = checkShape(s, SHAPE);
  ok('__state has the §8.2 shape', bad.length === 0, bad.join('; ') || `${Object.keys(s).length} top-level fields`);
  ok('band occupancy is derived from y', s.player.band === 'deck' && Math.abs(s.player.altFt - 2067.5) < 1,
    `y ${s.player.y} -> band "${s.player.band}", ${s.player.altFt.toFixed(1)} ft`);
  ok('entity counts split hostile from crates', s.entities.total === 3 && s.entities.hostile === 2 && s.entities.crates === 1,
    `total ${s.entities.total} hostile ${s.entities.hostile} crates ${s.entities.crates}`);
  ok('no request left the origin', cdp.offOrigin(base).length === 0,
    `${cdp.requests.length} requests, ${cdp.offOrigin(base).length} off-origin`);
  ok('no console error and no unhandled rejection', cdp.errors.length === 0 && s.errors.length === 0,
    `console ${cdp.errors.length}, page ${s.errors.length}`);

  /* --- 2. ?nosave really disables both read and write ------------------- */
  const wroteWithNosave = await cdp.eval(`(() => {
    localStorage.removeItem('kitehawk.save');
    window.__kh.save.data.economy.crates = 99;
    window.__kh.save.write(); window.__kh.save.flush();
    return localStorage.getItem('kitehawk.save');
  })()`);
  ok('?nosave writes nothing to localStorage', wroteWithNosave === null, `key is ${wroteWithNosave === null ? 'absent' : 'PRESENT'}`);

  /* --- 3. a real save round trip ---------------------------------------- */
  await cdp.goto(`${base}/index.html?preserve=1&dpr=1`);
  await cdp.waitFor('window.__kh && window.__kh.save', 20000);
  const round = await cdp.eval(`(() => {
    const sv = window.__kh.save;
    sv.reset();
    sv.data.economy.crates = 46; sv.data.economy.scrip = 1180;
    sv.data.settings.zoomBias = 'wide';
    sv.data.story = { act: 2, level: 7, beatsSeen: ['a1-01.open'] };
    sv.write(); sv.flush();
    const raw = localStorage.getItem('kitehawk.save');
    const parsed = JSON.parse(raw);
    return { bytes: raw.length, v: parsed.v, checksum: parsed.checksum, crates: parsed.economy.crates, bias: parsed.settings.zoomBias };
  })()`);
  ok('save writes, versions and checksums', round.v === 3 && /^fnv1a:[0-9a-f]{8}$/.test(round.checksum) && round.crates === 46,
    `v${round.v} ${round.bytes} bytes checksum ${round.checksum}`);

  const reloaded = await cdp.eval(`(() => { const sv = window.__kh.save; sv.load(); return { crates: sv.data.economy.crates, bias: sv.data.settings.zoomBias, act: sv.data.story.act }; })()`);
  ok('save loads back identically', reloaded.crates === 46 && reloaded.bias === 'wide' && reloaded.act === 2, JSON.stringify(reloaded));

  /* --- 4. the three corruption paths, one warning + one callout each ----- */
  for (const [name, mutate] of [
    ['not JSON', `localStorage.setItem('kitehawk.save', '{ not json')`],
    ['bad checksum', `(() => { const d = JSON.parse(localStorage.getItem('kitehawk.save')); d.economy.crates = 7777; localStorage.setItem('kitehawk.save', JSON.stringify(d)); })()`],
    ['future version', `(() => { const d = JSON.parse(localStorage.getItem('kitehawk.save')); d.v = 99; localStorage.setItem('kitehawk.save', JSON.stringify(d)); })()`],
  ]) {
    await cdp.eval(`(() => { const sv = window.__kh.save; sv.reset(); sv.data.economy.crates = 46; sv.write(); sv.flush(); })()`);
    const before = cdp.logs.length;
    await cdp.eval(mutate);
    const r = await cdp.eval(`(() => {
      document.getElementById('callout').hidden = true;
      const sv = window.__kh.save; sv.load();
      return { crates: sv.data.economy.crates, corrupt: sv.corrupt, callout: !document.getElementById('callout').hidden, text: document.getElementById('callout').textContent };
    })()`);
    const warns = cdp.logs.slice(before).filter((l) => l.startsWith('[warning]'));
    ok(`corrupt save (${name}) -> fresh, 1 warning, 1 callout`,
      r.crates === 0 && r.corrupt && r.callout && warns.length === 1,
      `crates ${r.crates}, corrupt ${r.corrupt}, callout ${r.callout}, warnings ${warns.length}: ${warns.map((w) => w.slice(0, 70)).join(' | ')}`);
  }

  /* --- 5. no alert / confirm / prompt anywhere in the shipped path ------ */
  const modal = await cdp.eval(`(async () => {
    const files = ['js/main.js','js/core/save.js','js/core/debug.js','js/core/input.js','js/core/camera.js','js/core/viewport.js','js/core/quality.js','js/core/loop.js','index.html'];
    const hits = [];
    for (const f of files) {
      const t = await (await fetch('/' + f)).text();
      if (/(^|[^.\\w])(alert|confirm|prompt)\\s*\\(/.test(t)) hits.push(f);
    }
    return hits;
  })()`);
  ok('no alert / confirm / prompt', modal.length === 0, modal.join(', ') || 'none in 9 files');

  /* --- 6. quality --------------------------------------------------------*/
  const qres = await cdp.eval(`(() => {
    const q = window.__kh.quality; let ev = 0;
    window.__kh.bus.on('quality:change', () => ev++);
    const a = q.low; q.set(true); const b = q.low; q.set(true); const c = ev;
    q.set(false); q.auto(true);
    for (let i = 0; i < 400; i++) q.frame(30, 1/60);   // 30 ms frames for ~6.7 s
    const dropped = q.low;
    for (let i = 0; i < 400; i++) q.frame(8, 1/60);    // fast again
    return { a, b, coalesced: c === 1, dropped, stillLow: q.low };
  })()`);
  ok('quality.set emits once and is idempotent', qres.a === false && qres.b === true && qres.coalesced, JSON.stringify(qres));
  ok('quality.auto drops to low and never returns', qres.dropped && qres.stillLow, `dropped ${qres.dropped}, still low after fast frames ${qres.stillLow}`);

  /* --- 7. the audio facade is reachable through core/audio.js ----------- */
  const au = await cdp.eval(`(async () => {
    const m = await import('/js/core/audio.js');
    return { hasCreate: typeof m.createAudio === 'function', hasDefault: typeof m.default === 'function', keys: Object.keys(m.KEYS || {}).length };
  })()`);
  ok('core/audio.js re-exports the facade', au.hasCreate && au.hasDefault && au.keys > 40,
    `createAudio ${au.hasCreate}, default ${au.hasDefault}, ${au.keys} keys`);
} finally { close(); }

console.log(fails ? `\nFAIL — ${fails} case(s)\n` : '\nPASS — every case behaved\n');
process.exit(fails ? 1 : 0);
