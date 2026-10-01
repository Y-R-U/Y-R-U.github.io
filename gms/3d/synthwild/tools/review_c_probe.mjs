// R3 reviewer C: draw-call breakdown and per-frame program (re)selection, in a night survival world or a mini-game.
//   node tools/review_c_probe.mjs [night|mg:<id>] [--mobile]
// Wraps renderer.renderBufferDirect for 60 frames: draws per object "owner" (nearest named ancestor), and counts
// getProgram lookups via Material.customProgramCacheKey (three calls it from getParameters on every program change).
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9335;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const which = process.argv[2] || 'night';
const port = await launch(PORT, ['--use-angle=metal', '--enable-precise-memory-info']);
try {
  const pg = await open(port);
  if (process.argv.includes('--mobile')) await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
  else await pg.viewport({ width: 1280, height: 720 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + (which === 'night' ? '?play=1&nointro&t=0.85&seed=perfnight' : '?mgtest=' + which.slice(3) + '&nointro'));
  await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
  if (which === 'night') {
    await pg.eval(`import('./js/player/auto.js').then(m => { const C = window.__game.ctx; C.input.auto = m.createAuto(C); C.ui.shell.noAutoPause = true; return 1; })`);
    // force a few mobs near the player so the breakdown includes them
    await sleep(3000);
    await pg.game(`const M = C.game.mobs, p = C.player.pos; for (const k of ['crawler','glitchfuse','reboot','drone','voidlinker']) try { M.spawn(k, p.x + 6 + Math.random()*4, C.world.surfaceY(p.x+6, p.z+3) + 0.1, p.z + 3 + Math.random()*4); } catch(e) {} return M.list.map(m=>m.kind);`).then((r) => console.log('mobs', r));
  }
  await sleep(8000);
  const r = await pg.game(`
    const R = C.renderer, THREE = G.THREE;
    const owner = (o) => { let n = o, path = []; while (n && n !== C.scene) { if (n.name) path.push(n.name); n = n.parent; } return (path.reverse().slice(0, 2).join('/') || o.type) + ':' + o.type; };
    const draws = {}, tris = {};
    const orig = R.renderBufferDirect;
    R.renderBufferDirect = function (cam, scene, geo, mat, obj, group) {
      const k = owner(obj); draws[k] = (draws[k] || 0) + 1;
      const ic = obj.isInstancedMesh ? obj.count : 1;
      const n = geo.index ? geo.index.count : geo.attributes.position?.count || 0;
      tris[k] = (tris[k] || 0) + (n / 3) * ic;
      return orig.apply(this, arguments);
    };
    const progs = {}, Mat = THREE.Material.prototype, ock = Mat.customProgramCacheKey;
    Mat.customProgramCacheKey = function () { const k = (this.name || this.type) + '#' + this.id; progs[k] = (progs[k] || 0) + 1; return ock.call(this); };
    const wrapInst = () => C.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') && !m.__rcw) { const f = m.customProgramCacheKey; m.__rcw = 1; m.customProgramCacheKey = function () { const k = (this.name || this.type) + '#' + this.id + '(own)'; progs[k] = (progs[k] || 0) + 1; return f.call(this); }; } });
    const N = +(${JSON.stringify(process.env.FRAMES || '60')}); for (let i = 0; i < N; i++) { if (i % 30 === 0) wrapInst(); await new Promise((r) => requestAnimationFrame(r)); }
    R.renderBufferDirect = orig; Mat.customProgramCacheKey = ock;
    const per = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, +(v / N).toFixed(1)]));
    // which objects use the materials that switch programs
    const users = {};
    C.scene.traverse((o) => { if (!o.material) return; for (const m of [].concat(o.material)) { const k = (m.name || m.type) + '#' + m.id; if (progs[k]) (users[k] ||= new Set()).add(owner(o) + (o.isInstancedMesh ? '[inst]' : o.isSkinnedMesh ? '[skin]' : '') + (o.geometry?.attributes?.color ? '[vcol' + o.geometry.attributes.color.itemSize + ']' : '')); } });
    let meshes = 0, visMeshes = 0, inst = 0; C.scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { meshes++; if (o.visible) visMeshes++; if (o.isInstancedMesh) inst++; } });
    return { drawsPerFrame: per(draws), trisPerFrame: per(tris), programLookupsPerFrame: per(progs),
      programUsers: Object.fromEntries(Object.entries(users).map(([k, s]) => [k, [...s].slice(0, 8)])),
      meshes, visMeshes, inst, calls: R.info.render.calls, tris: R.info.render.triangles, mobs: C.game.mobs.list.length, progs: R.info.programs.length };`);
  console.log(JSON.stringify(r, null, 1));
} finally { stopBrowser(PORT); }
