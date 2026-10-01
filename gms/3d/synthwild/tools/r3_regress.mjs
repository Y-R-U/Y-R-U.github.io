// Review R3 regression tests (browser).  node tools/r3_regress.mjs [C3,C4,...]   local server :8861, headless Chrome :9331
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9331;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const only = process.argv[2] ? process.argv[2].split(',') : null;
let pass = 0, fail = 0;
const ok = (id, c, msg, detail) => {
  if (c) pass++; else fail++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${id} ${msg}${c ? '' : '  ' + JSON.stringify(detail)}`);
};
const playing = (pg) => pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 60000 });
// DOM mutation records over n frames, by kind
const MUT = (n) => `
  let recs = 0; const kinds = {};
  const mo = new MutationObserver((l) => { for (const r of l) { recs++; const k = r.type + ':' + (r.attributeName || '') + ':' + (r.target.className || r.target.parentNode?.className || r.target.nodeName) + ':' + (r.target.parentNode?.className || ''); kinds[k] = (kinds[k] || 0) + 1; } });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const t0 = performance.now();
  for (let i = 0; i < ${n}; i++) await new Promise((r) => requestAnimationFrame(r));
  mo.disconnect();
  const secs = (performance.now() - t0) / 1000;
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { perSec: +(recs / secs).toFixed(1), top };`;

const tests = {
  async C11(pg) {
    await pg.goto(BASE + '?play=1&nointro&seed=bugplace');
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(1500);
    const r = await pg.game(`
      const W = C.world, P = C.player, B = C.brush, inv = C.game.inv, items = C.game.items;
      const { placeBox } = await import('./js/player/brushmath.js');
      const { BLOCK } = await import('./js/data/blocks.js');
      const out = {};
      for (const [label, above] of [['basalt', BLOCK.BASALT_MATRIX], ['coreplate', BLOCK.COREPLATE]]) {
        const x = Math.floor(P.pos.x) + 4, z = Math.floor(P.pos.z), y0 = Math.floor(W.surfaceY(x + 0.5, z + 0.5)) + 1;
        W.setBox([x * 4, y0 * 4, z * 4], [x * 4 + 4, y0 * 4 + 12, z * 4 + 4], 0, 'fill', { flow: false });
        W.setBox([x * 4, y0 * 4, z * 4], [x * 4 + 4, y0 * 4 + 2, z * 4 + 4], BLOCK.LOAM_MESH, 'fill', { flow: false });
        W.setBox([x * 4, (y0 + 1) * 4, z * 4], [x * 4 + 4, (y0 + 2) * 4, z * 4 + 4], above, 'fill', { flow: false });
        B.setScale(1); inv.setSlot(inv.sel, items.id('polymer_brick'), 5);
        const ok = B._doPlace(placeBox([x * 4 + 1, y0 * 4 + 1, z * 4 + 1], [0, 1, 0], 1, [1, 1, 1]), 'fill');
        out[label] = { placed: ok, above: W.getCell(x, y0 + 1, z) === above, brickBelow: W.getSub(x * 4, y0 * 4 + 2, z * 4) === BLOCK.POLYMER_BRICK, bricks: inv.count(items.id('polymer_brick')) };
      }
      return out;`);
    ok('C11', r.basalt.above && r.coreplate.above && r.basalt.brickBelow && r.basalt.bricks < 5, 'a scale-1 place on a ½ slab never overwrites basalt or coreplate above', r);
  },

  async C12(pg) {
    await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
    await pg.goto(BASE + '?play=1&nointro&seed=bugportrait');
    await playing(pg); await sleep(1500);
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await sleep(1200);
    const portrait = await pg.game(`return { paused: C.session.paused, state: C.ui.shell.state };`);
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 915, height: 412, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await sleep(1200);
    const land = await pg.game(`return { paused: C.session.paused, state: C.ui.shell.state };`);
    ok('C12', portrait.paused && portrait.state === 'paused' && !land.paused && land.state === 'playing', 'portrait pauses, landscape resumes', { portrait, land });
    await pg.viewport({ width: 1100, height: 620 });
  },

  async C3(pg) {
    await pg.goto(BASE + '?play=1&nointro&seed=hud&t=0.85');
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(2500);
    const s = await pg.game(MUT(120));
    ok('C3', s.perSec < 20, `survival HUD: few DOM mutations per second (${s.perSec}/s)`, s);
    await pg.goto(BASE + '?mgtest=ctf&nointro');
    await playing(pg); await sleep(6000);
    const m = await pg.game(MUT(120));
    ok('C3', m.perSec < 20, `mini-game HUD (CTF): few DOM mutations per second (${m.perSec}/s)`, m);
  },

  async C4(pg) {
    await pg.goto(BASE + '?mgtest=siege&nointro');
    await playing(pg); await sleep(3000);
    const r = await pg.game(`
      const T = G.ctx.THREE; const P = T.BufferGeometry.prototype, od = P.dispose; let disposed = 0;
      const def = (await import('./js/minigames/index.js')).minigames.running.def, ring = def.hpRing, g0 = ring.geometry;
      P.dispose = function () { disposed++; return od.call(this); };
      for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
      const hp0 = def.hp; def.hp = Math.max(1, def.hp * 0.5);
      for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
      P.dispose = od;
      const shown = ring.geometry.drawRange.count, full = ring.geometry.index ? ring.geometry.index.count : ring.geometry.attributes.position.count;
      return { disposed, same: ring.geometry === g0, shownFrac: +(shown / full).toFixed(2), hpFrac: +(def.hp / hp0).toFixed(2) };`);
    ok('C4', r.disposed === 0 && r.same && Math.abs(r.shownFrac - 0.5) < 0.1, 'the Siege HP ring is never rebuilt, and its arc still follows HP', r);
  },

  async C14(pg) {
    await pg.goto(BASE + '?play=1&nointro&seed=border&mode=build');
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(1500);
    await pg.game(`const P = C.player; P.teleport(29997.5, 90, 0.5); P.flying = true; P.yaw = -Math.PI / 2; P.pitch = 0; return 1;`);
    await pg.keyDown('KeyW', 'w');
    await sleep(2500);
    await pg.keyUp('KeyW', 'w');
    const r = await pg.game(`const P = C.player; return { x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2), toasts: [...document.querySelectorAll('.sw-toast')].map((e) => e.textContent) };`);
    ok('C14', r.x <= 30000 && r.toasts.some((t) => /edge|border/i.test(t)), 'the player stops at the ±30,000 m border with a toast', r);
    ok('C14', r.x > 29997.6, 'and they really were walking into it', r);
  },

  // C7 remainder: the brush outline is one bars mesh plus one face mesh, and it still wraps the target box.
  async C7(pg) {
    await pg.goto(BASE + '?play=1&nointro&seed=outline');
    await playing(pg); await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true'); await sleep(1000);
    const r = await pg.game(`
      const o = C.brush.outline; o.show({ min: [0, 160, 0], max: [8, 164, 4] }, 0xffffff, 4);
      let meshes = 0; o.group.traverse((m) => { if (m.isMesh) meshes++; });
      const bars = o.group.children.find((m) => m.geometry && m.geometry.index && m.geometry.index.count > 36);
      bars?.geometry.computeBoundingBox(); const b = bars?.geometry.boundingBox;
      return { meshes, box: b && [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(2)) };`);
    ok('C7', r.meshes <= 2 && r.box && Math.abs(r.box[0]) < 0.1 && Math.abs(r.box[3] - 2) < 0.1 && Math.abs(r.box[4] - 41) < 0.1, 'brush outline: 2 meshes, bars still wrap the box', r);
  },
};

const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  for (const [id, fn] of Object.entries(tests)) {
    if (only && !only.includes(id)) continue;
    try { await fn(pg); } catch (e) { ok(id, false, 'threw', e.message); }
  }
  if (pg.log.exceptions.length) console.log('page exceptions:', JSON.stringify(pg.log.exceptions.slice(0, 8)));
  const shaderErr = pg.log.console.filter((c) => /shader|WebGLProgram/i.test(c.text));
  ok('C25', !shaderErr.length && !pg.log.exceptions.length, 'no shader compile errors or page exceptions across the run', shaderErr.slice(0, 3));
} finally {
  stopBrowser(PORT);
}
console.log(`r3_regress: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
