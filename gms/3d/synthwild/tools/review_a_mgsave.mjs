// Review R1 (client): /play <minigame> from a world whose save fails throws the world away without asking.
// node tools/review_a_mgsave.mjs
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9330;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game && window.__game.shell && window.__game.shell.state === 'title'`, { timeout: 30000 });
  const meta = await pg.eval(`(async()=>{ const a=(await import('./js/net/api.js')).api; return await a.local.put({ name: 'Keep', seed: 'keep', mode: 'build', data: null }); })()`);
  await pg.eval(`window.__game.shell.play(${JSON.stringify(meta)})`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing'`, { timeout: 30000 });
  const r = await pg.eval(`(async()=>{
    const G=window.__game, C=G.ctx, a=(await import('./js/net/api.js')).api;
    const P=C.player.pos, x=Math.floor(P.x)*4, z=Math.floor(P.z)*4+12, y=90*4;
    C.world.setBox([x,y,z],[x+16,y+16,z+16], 1, 'fill');       // the kid's unsaved build
    const orig=a.local.put; a.local.put = async () => { throw Object.assign(new Error('QuotaExceededError'), { code: 'quota' }); };
    await G.shell.playMinigame('parkour');
    a.local.put = orig;
    const popups=[...document.querySelectorAll('h2,h3,.title')].map(e=>e.textContent).filter(t=>/fail|quit|leave/i.test(t));
    const saved=await a.local.get(${JSON.stringify(meta.id)});
    return { stateNow: G.shell.state, mode: C.session.mode, confirmShown: popups, savedBlob: saved.data ? 'has data' : 'null (build lost)' };
  })()`, { timeout: 60000 });
  console.log(JSON.stringify(r));
} finally {
  stopBrowser(PORT);
}
