// A throwaway local Clued server for e2e tools, so no test ever reaches the production API (it has the daily
// allowance on: a signed-out host stops at the sign-in panel, and real games spend real accounts' free games).
//   const srv = await startLocalServer();      // builds server/, starts it on a free port with an empty data dir
//   page.go(`${SITE}?noauth=1&${srv.query}`);  // srv.api, srv.query ("api=…"); srv.stop() (also runs on exit)
//   await blockProd(send);                     // CDP safety net: any production API request fails instead
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server');
export const PROD_API = ['*games.br8t.com/gms/2d/clued/api*', '*games.br8t.com/api/br8t/*', '*://*.br8t.com/*api/*', '*://br8t.com/*api/*'];

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// env: extra CLUED_* settings (e.g. { CLUED_MAX_PUBLIC: '1' }). Inherited CLUED_* variables are dropped, so a shell
// that happens to carry production settings (allowance, alerts) can't leak into the test server.
export async function startLocalServer({ env = {}, origins = 'http://localhost:8888', tag = 'clued' } = {}) {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), `${tag}-srv-`));
  const bin = join(dir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLUED_')));
  const proc = spawn(bin, [], { env: { ...base, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dir, 'data'), CLUED_ORIGINS: origins, ...env }, stdio: 'ignore' });
  const api = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    try { up = (await fetch(api + '/health')).ok; } catch (e) {}
    if (!up) await new Promise(r => setTimeout(r, 100));
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { proc.kill(); } catch (e) {}
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  };
  process.once('exit', stop);
  if (!up) { stop(); throw new Error(`local clued server did not start on :${port}`); }
  return { api, port, dir, query: `api=${encodeURIComponent(api)}`, stop };
}

// send = a CDP send(method, params) for one page. Blocks the production API for that page.
export async function blockProd(send) {
  await send('Network.enable', {});
  await send('Network.setBlockedURLs', { urls: PROD_API });
}
