// R2 reviewer: does the game recover from a WebGL context loss (phone backgrounding / GPU reset)?
// node tools/review_b_ctxloss.mjs   (needs the local server on :8861; headless Chrome with metal on :9333)
import { launch, open, stopBrowser, sleep, decodePNG, imageStats } from './qa_cdp.mjs';

const PORT = 9333;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const out = {};
const port = await launch(PORT, ['--use-angle=metal']);
try {
  const pg = await open(port);
  await pg.viewport({ width: 960, height: 540 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?play=1&nointro');
  await pg.waitFor(`window.__game?.ctx?.session?.playing && window.__game.ctx.render.isSettled(2)`, { timeout: 60000 });
  await sleep(1500);
  const shot = async (tag) => { out[tag] = imageStats(decodePNG(await pg.shot(null))); };
  await shot('before');
  out.lose = await pg.game(`window.__ext = C.renderer.getContext().getExtension('WEBGL_lose_context'); __ext.loseContext(); await new Promise(r=>setTimeout(r,1000)); return C.renderer.getContext().isContextLost();`);
  await shot('lost');
  await pg.game(`__ext.restoreContext(); await new Promise(r=>setTimeout(r,3000)); return 1;`);
  await shot('restored');
  out.afterRestore = await pg.game(`const r=C.renderer; return { lost: r.getContext().isContextLost(), geo: r.info.memory.geometries, tex: r.info.memory.textures, calls: r.info.render.calls, tris: r.info.render.triangles, progs: r.info.programs?.length };`);
  // edits after restore still render?
  await pg.game(`C.player.teleport(C.player.pos.x + 200, 90, C.player.pos.z); await new Promise(r=>setTimeout(r,5000)); return 1;`);
  await shot('restoredMoved');
  out.exceptions = pg.log?.exceptions?.slice(0, 5);
  out.console = pg.log?.console?.filter((l) => /error|warn/i.test(JSON.stringify(l))).slice(0, 8);
} catch (e) { out.error = String(e && e.stack || e); }
finally { stopBrowser(PORT); }
console.log(JSON.stringify(out, null, 1));
