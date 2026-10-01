// Review R1 (client): shell.save() is meant to serialise saves, but 2+ waiters on one in-flight save run concurrently.
// node tools/review_a_saverace.mjs
import { launch, open, stopBrowser } from './qa_cdp.mjs';

const PORT = 9330;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game && window.__game.shell && window.__game.shell.state === 'title'`, { timeout: 30000 });
  const meta = await pg.eval(`(async()=>{ const a=(await import('./js/net/api.js')).api; return await a.local.put({ name: 'Race', seed: 'race', mode: 'survival', data: null }); })()`);
  await pg.eval(`window.__game.shell.play(${JSON.stringify(meta)})`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing'`, { timeout: 30000 });
  const r = await pg.eval(`(async()=>{
    const a=(await import('./js/net/api.js')).api, orig=a.local.put;
    let inflight=0, max=0, calls=0;
    a.local.put = async (o) => { calls++; inflight++; max=Math.max(max,inflight); try { await new Promise(r=>setTimeout(r,150)); return await orig(o); } finally { inflight--; } };
    const S=window.__game.shell;
    const ps=[S.save('auto'), S.save('pause'), S.save('hide'), S.save('hide')];
    await Promise.all(ps);
    a.local.put = orig;
    return { saveCalls: ps.length, putCalls: calls, maxConcurrentPuts: max };
  })()`);
  console.log(JSON.stringify(r));
} finally {
  stopBrowser(PORT);
}
