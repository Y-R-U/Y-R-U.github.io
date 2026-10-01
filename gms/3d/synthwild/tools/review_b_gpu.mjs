// R2 reviewer: GPU/JS resource growth across world and mini-game cycles, chunk churn, and WebGL context loss.
// node tools/review_b_gpu.mjs   (needs the local server on :8861; headless Chrome with metal on :9332)
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9332;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const out = { worlds: [], minigames: [], churn: [], ctxloss: null };

const snap = (pg, tag) => pg.game(`
  const r = C.renderer, m = r.info.memory; let objs = 0; C.scene.traverse(() => objs++);
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  return { tag: ${JSON.stringify(tag)}, geo: m.geometries, tex: m.textures, progs: r.info.programs?.length ?? null,
    objs, kids: C.scene.children.length, heap, cols: C.render.stats.columns, secs: C.render.stats.sections };`);
const gc = (pg) => pg.evalSafe(`(async()=>{ if (window.gc) gc(); await new Promise(r=>setTimeout(r,300)); return 1; })()`);
const temp = (n, seed) => `({ id: null, temp: true, name: '${n}', seed: '${seed}', mode: 'survival', difficulty: 'normal', source: 'local', mine: true })`;

const port = await launch(PORT, ['--use-angle=metal', '--js-flags=--expose-gc', '--enable-precise-memory-info']);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game && window.__game.ctx.ui?.shell?.state === 'title' || window.__game?.shell?.state === 'title'`, { timeout: 40000 });
  const S = `(window.__game.shell || window.__game.ctx.ui.shell)`;

  // world start/stop cycles
  for (let i = 0; i < 4; i++) {
    await pg.eval(`${S}.play(${temp('W' + i, 'seed' + i)}, { fresh: true })`, { timeout: 90000 });
    await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 });
    await sleep(2500);
    out.worlds.push(await snap(pg, 'playing W' + i));
    await pg.eval(`(async()=>{ ${S}.pause(); await ${S}.quit(); })()`, { timeout: 60000 });
    await pg.waitFor(`${S}.state === 'title'`, { timeout: 30000 });
    await gc(pg);
    out.worlds.push(await snap(pg, 'title after W' + i));
  }

  // chunk churn: one world, teleport far away repeatedly
  await pg.eval(`${S}.play(${temp('Churn', 'churn')}, { fresh: true })`, { timeout: 90000 });
  await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 });
  for (let i = 0; i < 6; i++) {
    await pg.game(`const P=C.player; P.teleport(${(i + 1) * 400}, 90, ${(i % 2) * 400}); return 1;`);
    await sleep(6000);
    await gc(pg);
    out.churn.push(await snap(pg, 'churn ' + i));
  }
  out.churn.push({ keyCacheNote: 'render keyCache size not exposed' });
  await pg.eval(`(async()=>{ ${S}.pause(); await ${S}.quit(); })()`, { timeout: 60000 });
  await pg.waitFor(`${S}.state === 'title'`, { timeout: 30000 });

  // mini-game cycles
  const ids = ['parkour', 'floorfall', 'treasure', 'ctf', 'hideseek', 'siege', 'parkour', 'ctf', 'siege'];
  for (const id of ids) {
    await pg.eval(`${S}.playMinigame('${id}')`, { timeout: 90000 });
    await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 });
    await sleep(3000);
    const a = await snap(pg, 'mg ' + id);
    await pg.eval(`(async()=>{ await ${S}.quit(); })()`, { timeout: 60000 });
    await pg.waitFor(`${S}.state === 'title'`, { timeout: 30000 });
    await gc(pg);
    out.minigames.push(a, await snap(pg, 'title after ' + id));
  }

  // context loss / restore while playing
  await pg.eval(`${S}.play(${temp('Ctx', 'ctx')}, { fresh: true })`, { timeout: 90000 });
  await pg.waitFor(`${S}.state === 'playing'`, { timeout: 60000 });
  await sleep(2000);
  out.ctxloss = await pg.game(`
    const gl = C.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context');
    const px = () => { const c = C.renderer.domElement; const t = document.createElement('canvas'); t.width = 32; t.height = 18;
      const g = t.getContext('2d'); g.drawImage(c, 0, 0, 32, 18); const d = g.getImageData(0, 0, 32, 18).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i+1] + d[i+2]; return Math.round(s / (d.length / 4)); };
    const before = px();
    let lostEvt = false, restoredEvt = false;
    C.renderer.domElement.addEventListener('webglcontextlost', () => lostEvt = true);
    C.renderer.domElement.addEventListener('webglcontextrestored', () => restoredEvt = true);
    ext.loseContext(); await new Promise(r => setTimeout(r, 800));
    const during = { lost: gl.isContextLost(), lostEvt };
    ext.restoreContext(); await new Promise(r => setTimeout(r, 2500));
    return { before, during, restoredEvt, after: px(), err: gl.getError() };`);
  out.exceptions = pg.log?.exceptions?.slice(0, 10);
} catch (e) {
  out.error = String(e && e.stack || e);
} finally {
  stopBrowser(PORT);
}
console.log(JSON.stringify(out, null, 1));
