// Short multi-round device room (lane P2P + ROUNDS): host builds 2 rounds through real clicks (round 2 from a ♥
// favourite), one joiner plays via the ?p2p= link, round cards on both screens, a joiner refresh mid-round-2,
// per-round scores on the podium. Needs :8888, internet (0.peerjs.com) and ~/.claude/bin/cdp. Ports 9451, 9452.
//   node tools/rounds_p2p_e2e.mjs [--shots DIR] [--keep]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://localhost:8888/gms/2d/clued/';
const CDP = join(homedir(), '.claude/bin/cdp');
const args = process.argv.slice(2);
const arg = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const SHOTS = arg('--shots') || join(tmpdir(), 'clued-rounds-p2p');
mkdirSync(SHOTS, { recursive: true });
const HARD = setTimeout(() => { console.log('FATAL: run exceeded 6 min'); process.exit(1); }, 6 * 60 * 1000);
HARD.unref();

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok   ${msg}`); } else { fail++; console.log(`  FAIL ${msg} ${extra}`); } };

class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.cbs = new Map(); this.events = []; }
  async open() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
    const t = list.find(x => x.type === 'page');
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cbs.has(d.id)) { const { res, rej } = this.cbs.get(d.id); this.cbs.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') this.events.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Page.javascriptDialogOpening') { this.dialogs = (this.dialogs || 0) + 1; this.send('Page.handleJavaScriptDialog', { accept: true }); }
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') this.events.push('ERR ' + d.params.args.map(a => a.value ?? a.description).join(' '));
    };
    await this.send('Network.enable');
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.size(384, 854, 1, true);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.cbs.set(id, { res, rej }));
  }
  size(w, h, dpr = 1, mobile = false) { return this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  async go(url) { await this.send('Page.navigate', { url }); }
  async waitFor(expr, ms = 15000, label = expr) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = await this.eval(expr); if (v) return v; } catch (e) {}
      await sleep(150);
    }
    throw new Error(`${this.name}: timed out waiting for ${label}`);
  }
  async click(sel, ms = 15000) {
    const r = await this.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return b.width ? {x: b.x + b.width/2, y: b.y + b.height/2} : null; })()`, ms, sel);
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  }
  async type(sel, text) {
    await this.click(sel);
    await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.focus(); })()`);
    await this.send('Input.insertText', { text });
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'));
  }
  room() { return this.eval('window.__cluedRoom ? JSON.parse(JSON.stringify(window.__cluedRoom.st)) : null'); }
}

const PORTS = [9451, 9452];
let all = [];

async function main() {
  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '240', '--', '--use-angle=metal', '--disable-features=WebRtcHideLocalIpsWithMdns'], { stdio: 'ignore' });
  const [host, ann] = [new Page('host', PORTS[0]), new Page('ann', PORTS[1])];
  all = [host, ann];
  for (const p of all) await p.open();
  await host.go(`${SITE}?noauth=1`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  await host.eval(`(() => { localStorage.removeItem('clued.online'); localStorage.setItem('clued.favs', JSON.stringify({ v: 1, slots: { tf: [{ packs: 'all', opts: {}, count: 3, at: 1 }, null, null, null, null] } })); return true; })()`);
  await host.eval(`import('./js/net/index.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(() => window.__cluedCtx.go('online'))`);
  await host.click('[data-act=host-device]');
  await host.click('.round-card [data-act=round-edit]');
  await host.waitFor(`document.body.dataset.screen === 'pqround'`, 8000, 'editor');
  await host.click('.opt .chip[data-v="5"]');
  await host.click('[data-act=save-round]');
  await host.waitFor(`document.body.dataset.screen === 'host'`, 8000, 'back to host');
  await sleep(500); // screen transition: the old screen slides out
  await host.click('[data-act=add-round]');
  await host.click('.pop:not(.out) .rp-fav[data-fav-format=tf]');
  await host.waitFor(`document.querySelectorAll('.round-card').length === 2`, 8000, '2 rounds');
  // a ♥ round takes the online round default (10), not the favourite's own count (manager rule 2026-10-08)
  ok(await host.eval(`document.querySelectorAll('.round-card')[1].textContent.includes('10 questions')`), 'fav round uses the default 10 questions');
  await sleep(500);
  await host.click('.round-card[data-round="1"] [data-act=round-edit]');
  await host.waitFor(`document.body.dataset.screen === 'pqround'`, 8000, 'editor 2');
  await host.click('.opt .chip[data-v="5"]');
  await host.click('[data-act=save-round]');
  await host.waitFor(`document.body.dataset.screen === 'host' && document.querySelector('.rounds-sum')?.textContent === '2 rounds · 10 questions'`, 8000, 'round 2 edited to 5').catch(() => {});
  await sleep(500);
  ok(await host.eval(`document.querySelector('.rounds-sum').textContent === '2 rounds · 10 questions'`), 'device host: 2 rounds · 10 questions', await host.eval(`document.querySelector('.rounds-sum')?.textContent`));
  await host.type('[data-field=name]', 'Hosty');
  await host.click('[data-opt=answer] .chip[data-v="30"]');
  await host.click('[data-opt=gap] .chip[data-v="3"]');
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 60000, 'lobby code');
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  ok(link.includes('p2p='), 'device room created', link);
  await ann.go('http://' + link + '&noauth=1');
  await ann.waitFor(`document.querySelector('[data-field=name]')`, 40000, 'join form');
  ok(await ann.eval(`document.querySelector('.net-hero p')?.textContent.includes('2 rounds')`), 'join screen says 2 rounds');
  await ann.type('[data-field=name]', 'Ann');
  await ann.click('[data-act=join]');
  await ann.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 30000, 'lobby');
  ok(await ann.eval(`document.querySelectorAll('.net-rlist li').length === 2`), 'joiner lobby lists both rounds');
  await host.waitFor(`window.__cluedRoom.st.players.length === 2`, 15000, '2 players');
  await host.click('[data-act=start]');
  const st0 = await host.room();
  ok(JSON.stringify(st0.roundSizes) === '[5,5]', 'rounds of 5 and 5', JSON.stringify(st0.roundSizes));
  const cards = {};
  let refreshed = false, lastQ = -1;
  for (let guard = 0; guard < 400; guard++) {
    const st = await host.room();
    if (st.phase === 'final') break;
    if (st.phase === 'question' && st.q !== lastQ) {
      lastQ = st.q;
      if (st.q === 0 || st.q === 5) for (const p of all) {
        const t = await p.waitFor(`document.querySelector('.net-round')?.textContent`, 8000, `${p.name} round card`).catch(() => '');
        cards[st.q] = (cards[st.q] || 0) + (t.includes(`Round ${st.q ? 2 : 1} of 2`) ? 1 : 0);
        if (st.q === 5 && p === ann) await p.shot('p2p-round2-card.png');
      }
      for (const p of all) {
        if (p === ann && st.q === 6 && !refreshed) {
          refreshed = true;
          await p.send('Page.reload', { ignoreCache: true });
          await p.waitFor(`window.__cluedRoom?.st?.q === 6`, 40000, 'rejoin');
          const label = await p.waitFor(`document.querySelector('.prog-txt')?.textContent`, 20000, 'label').catch(() => '');
          ok(label === 'Round 2 · 2/5', 'joiner back after a refresh mid-round-2, HUD Round 2 · 2/5', label);
        }
        await p.waitFor(`document.querySelector('.stage .choices .choice:not([disabled])')`, 25000, `${p.name} q${st.q}`);
        await p.click('.stage .choices .choice');
      }
      await host.waitFor(`window.__cluedRoom.st.phase !== 'question' || window.__cluedRoom.st.q !== ${st.q}`, 40000, 'q end');
    }
    await sleep(200);
  }
  ok(cards[0] === 2 && cards[5] === 2, 'both screens showed both round cards', JSON.stringify(cards));
  ok(refreshed, 'refresh happened');
  for (const p of all) await p.waitFor(`window.__cluedRoom?.st?.phase === 'final' && document.querySelector('.net-rtable')`, 20000, `${p.name} podium`);
  const fin = await ann.room();
  ok(fin.players.every(p => p.rs?.length === 2 && p.rs[0] + p.rs[1] === p.score), 'per-round scores add up', JSON.stringify(fin.players.map(p => [p.rs, p.score])));
  await sleep(2500);
  await ann.eval(`document.querySelector('.net-rtable').scrollIntoView({ block: 'center' }); true`);
  await ann.shot('p2p-final.png');
  ok(all.every(p => !p.events.some(e => e.startsWith('EXC'))), 'no uncaught exceptions', all.flatMap(p => p.events).join(' | '));
}

main().catch(async e => {
  fail++; console.error('FATAL', e.message);
  for (const p of all) { try { await p.shot(`fail-${p.name}.png`); p.events.forEach(x => console.log(`  [${p.name}] ${x}`)); } catch (err) {} }
}).finally(() => {
  if (!args.includes('--keep')) for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
  console.log(`\n${pass} passed, ${fail} failed · screenshots in ${SHOTS}`);
  process.exit(fail ? 1 : 0);
});
