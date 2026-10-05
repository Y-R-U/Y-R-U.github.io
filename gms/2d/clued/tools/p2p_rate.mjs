// Lane P2P: connection success rate + time through the real PeerJS broker. One host tab, one joiner tab that
// reloads and connects N times (fresh peer each time).  node tools/p2p_rate.mjs [N=20] [--mdns]
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://localhost:8888/gms/2d/clued/?noauth=1';
const CDP = join(homedir(), '.claude/bin/cdp');
const N = Number(process.argv.find(a => /^\d+$/.test(a)) || 20);
const flags = process.argv.includes('--mdns') ? [] : ['--', '--disable-features=WebRtcHideLocalIpsWithMdns'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(port) {
  const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const cbs = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { cbs.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const boot = async () => {
    await send('Page.navigate', { url: SITE });
    for (let i = 0; i < 100 && !(await ev('!!window.__cluedReady').catch(() => false)); i++) await sleep(200);
    await ev(`import('./js/net/index.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1))`);
  };
  return { ev, boot };
}

const ports = [9411, 9412];
for (const p of ports) execFileSync(CDP, ['start', '--port', String(p), '--idle', '120', ...flags], { stdio: 'ignore' });
try {
  const [host, joiner] = [await page(9411), await page(9412)];
  await host.boot();
  const code = await host.ev(`(async () => { const T = window.__cluedP2P.transport;
    const r = await T.create({ hostName: 'Rate', spec: {}, title: 'Rate test', questions: [{ format: 'mc', id: 'x', prompt: 'x', options: [{ text: 'a' }], answer: 0 }] });
    return r.code; })()`);
  console.log(`host room ${code}`);
  const times = []; let failsN = 0; const errs = {};
  for (let i = 0; i < N; i++) {
    await joiner.boot();
    const r = await joiner.ev(`(async () => { const t0 = performance.now(); try { await window.__cluedP2P.transport.peek('${code}'); return { ms: Math.round(performance.now() - t0) }; } catch (e) { return { err: e.code || e.message, ms: Math.round(performance.now() - t0) }; } })()`);
    if (r.err) { failsN++; errs[r.err] = (errs[r.err] || 0) + 1; } else times.push(r.ms);
    process.stdout.write(r.err ? `x(${r.err}) ` : `${r.ms} `);
  }
  times.sort((a, b) => a - b);
  console.log(`\n${times.length}/${N} connected (${Math.round(100 * times.length / N)} %), median ${times[times.length >> 1] ?? '-'} ms, max ${times.at(-1) ?? '-'} ms, fails ${JSON.stringify(errs)}`);
} finally {
  for (const p of ports) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
}
