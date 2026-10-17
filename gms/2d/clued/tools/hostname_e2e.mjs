// Lane HOSTNAME end-to-end: Settings › Your name pre-fills the host screen; the host renames inline in the lobby (✎,
// Enter saves) and the joiner sees it; the joiner renames by leaving the field (blur saves) and a clash is deduped.
// Server room (a local clued server) by default; --p2p runs the same lobby checks on a device room (needs 0.peerjs.com).
//   node tools/hostname_e2e.mjs [--p2p] [--shots DIR] [--ports 9531,9532]
// Needs the :8888 site server and ~/.claude/bin/cdp (started with --use-angle=metal).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { startLocalServer, blockProd } from './lib/localserver.mjs';

const argv = process.argv.slice(2);
const argOf = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const P2P = argv.includes('--p2p');
const SITE = 'http://localhost:8888/gms/2d/clued/';
const CDP = join(homedir(), '.claude/bin/cdp');
const SHOTS = argOf('--shots') || join(tmpdir(), 'clued-hostname-shots');
const PORTS = argOf('--ports') ? argOf('--ports').split(',').map(Number) : P2P ? [9533, 9534] : [9531, 9532];
mkdirSync(SHOTS, { recursive: true });
setTimeout(() => { console.log('FATAL: run exceeded 4 min'); process.exit(1); }, 4 * 60 * 1000).unref();

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok   ${msg}`); } else { fail++; console.log(`  FAIL ${msg} ${extra}`); } };

class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.cbs = new Map(); this.events = []; }
  async open() {
    const t = (await (await fetch(`http://127.0.0.1:${this.port}/json`)).json()).find(x => x.type === 'page');
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cbs.has(d.id)) { const { res, rej } = this.cbs.get(d.id); this.cbs.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') this.events.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    };
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await blockProd((m, p) => this.send(m, p));
    await this.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.cbs.delete(id); rej(new Error(`${this.name}: CDP ${method} timed out`)); }, 20000);
      this.cbs.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  go(url) { return this.send('Page.navigate', { url }); }
  async waitFor(expr, ms = 15000, label = expr) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = await this.eval(expr); if (v) return v; } catch (e) {}
      await sleep(150);
    }
    throw new Error(`${this.name}: timed out waiting for ${label}`);
  }
  async click(sel) {
    const r = await this.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return b.width ? {x: b.x + b.width/2, y: b.y + b.height/2} : null; })()`, 15000, sel);
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  }
  async type(sel, text) {
    await this.click(sel);
    await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.focus(); })()`);
    await this.send('Input.insertText', { text });
  }
  async key(k) {
    const code = { Enter: 13, Escape: 27 }[k];
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, text: k === 'Enter' ? '\r' : undefined });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'));
    console.log(`  shot ${join(SHOTS, file)}`);
  }
}

const chipName = (id) => `document.querySelector('.net-player[data-id="' + ${JSON.stringify(id)} + '"] .nm')?.textContent`;
let srv;

async function main() {
  let q = 'noauth=1';
  // --p2p also points ?api= at the local server: the live one has the daily allowance on, which makes a signed-out
  // device host stop at the sign-in panel (the room itself never touches the server)
  srv = await startLocalServer({ tag: 'clued-hostname' });
  console.log(`server ${srv.api}`);
  q += `&${srv.query}`;
  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '120', '--', '--use-angle=metal', '--disable-features=WebRtcHideLocalIpsWithMdns'], { stdio: 'ignore' });
  const host = new Page('host', PORTS[0]), ann = new Page('ann', PORTS[1]);
  pages = [host, ann];
  for (const p of [host, ann]) await p.open();
  const tag = P2P ? 'p2p' : 'server';

  // Settings › Your name (real clicks from the home page)
  await host.go(`${SITE}?${q}`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  await host.eval(`localStorage.removeItem('clued.name'); localStorage.removeItem('clued.online'); true`);
  await host.send('Page.reload', { ignoreCache: true });
  await host.waitFor('window.__cluedReady', 20000, 'reboot');
  await host.click('.home-top .icon-btn[aria-label=Settings]');
  await host.waitFor(`document.querySelector('[data-field=settings-name]')`, 8000, 'settings name field');
  ok(await host.eval(`document.querySelector('[data-field=settings-name]').value === ''`), 'Settings name starts empty (no account in ?noauth)');
  await host.type('[data-field=settings-name]', '  Aaron  ');
  await host.key('Enter');
  await host.waitFor(`localStorage.getItem('clued.name') === '"Aaron"'`, 4000, 'name stored').catch(() => {});
  ok(await host.eval(`localStorage.getItem('clued.name')`) === '"Aaron"', 'Settings saves the tidied name to clued.name', await host.eval(`localStorage.getItem('clued.name')`));
  ok(await host.eval(`document.querySelector('[data-field=settings-name]').value === 'Aaron'`), 'field shows the tidied name');
  await host.eval(`document.activeElement?.blur(); scrollTo(0, 0); document.querySelector('.screen') && (document.querySelector('.screen').scrollTop = 0); true`);
  await sleep(400);
  if (!P2P) await host.shot('settings-name-portrait.png');

  // hosting pre-fills it
  await host.go(`${SITE}?${q}`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  await host.click('[data-mode=online]');
  await host.click(P2P ? '[data-act=host-device]' : '[data-act=host]');
  await host.waitFor(`document.querySelector('.round-card[data-round="0"]') && document.querySelector('[data-field=name]')?.value`, 10000, 'host screen');
  ok(await host.eval(`document.querySelector('[data-field=name]').value`) === 'Aaron', `${tag}: host screen pre-fills the Settings name`, await host.eval(`document.querySelector('[data-field=name]').value`));
  await host.click('[data-opt=answer] .chip[data-v="15"]');
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 40000, 'lobby code');
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  const hostId = await host.eval(`window.__cluedRoom.st.you.id`);
  ok(await host.eval(chipName(hostId)) === 'Aaron', `${tag}: host joins the room as Aaron`);

  await ann.go('http://' + link + '&noauth=1');
  await ann.waitFor(`document.querySelector('[data-field=name]')`, 30000, 'join form');
  await ann.eval(`localStorage.removeItem('clued.name'); true`);
  await ann.type('[data-field=name]', 'Ann');
  await ann.click('[data-act=join]');
  await ann.waitFor(`window.__cluedRoom?.st?.phase === 'lobby' && document.querySelector('.net-player')`, 30000, 'ann in lobby');
  await host.waitFor(`window.__cluedRoom.st.players.length === 2`, 10000, '2 players');
  const annId = await ann.eval(`window.__cluedRoom.st.you.id`);

  ok(await host.eval(`!!document.querySelector('.net-player.me [data-act=rename]')`), `${tag}: ✎ on the host's own chip`);
  ok(await host.eval(`!document.querySelector('.net-player:not(.me) [data-act=rename]')`), `${tag}: no ✎ on other players`);
  ok(await ann.eval(`!!document.querySelector('.net-player.me [data-act=rename]')`), `${tag}: joiner has ✎ on their own chip`);
  await host.eval(`scrollTo(0, 0); document.querySelector('.net-players').scrollIntoView({block:'center'}); true`);
  await sleep(300);
  await host.shot(`lobby-pencil-${tag}-portrait.png`);

  // host: ✎ → type → Enter
  await host.click('.net-player.me [data-act=rename]');
  await host.waitFor(`document.activeElement?.dataset?.field === 'rename'`, 4000, 'rename input focused');
  ok(await host.eval(`!document.querySelector('.pop, dialog[open], .modal')`), `${tag}: inline edit, no popup`);
  await host.send('Input.insertText', { text: 'Captain Aaron' });
  await host.shot(`lobby-rename-editing-${tag}-portrait.png`);
  await host.key('Enter');
  await ann.waitFor(`${chipName(hostId)} === 'Captain Aaron'`, 10000, 'ann sees the new host name').catch(() => {});
  ok(await ann.eval(chipName(hostId)) === 'Captain Aaron', `${tag}: joiner sees the host's new name`, await ann.eval(chipName(hostId)));
  ok(await ann.eval(`document.querySelector('.net-wait')?.textContent.includes('Captain Aaron')`), `${tag}: joiner's "Waiting for …" uses the new name`);
  ok(await host.eval(`${chipName(hostId)} === 'Captain Aaron' && !document.querySelector('[data-field=rename]')`), `${tag}: host chip shows the new name, editor closed`);
  ok(await host.eval(`localStorage.getItem('clued.name')`) === '"Captain Aaron"', `${tag}: rename remembered as the default name`);

  // joiner: ✎ → type a clashing name → tap elsewhere (blur saves) → deduped
  await ann.click('.net-player.me [data-act=rename]');
  await ann.waitFor(`document.activeElement?.dataset?.field === 'rename'`, 4000, 'ann rename focused');
  await ann.send('Input.insertText', { text: 'captain aaron' });
  await ann.click('.net-count');
  await host.waitFor(`${chipName(annId)} === 'captain aaron 2'`, 10000, 'host sees deduped ann').catch(() => {});
  ok(await host.eval(chipName(annId)) === 'captain aaron 2', `${tag}: joiner rename (blur) reaches the host, clash deduped`, await host.eval(chipName(annId)));

  // Escape cancels
  await ann.click('.net-player.me [data-act=rename]');
  await ann.waitFor(`document.activeElement?.dataset?.field === 'rename'`, 4000, 'ann rename focused 2');
  await ann.send('Input.insertText', { text: 'Nope' });
  await ann.key('Escape');
  await sleep(800);
  ok(await host.eval(chipName(annId)) === 'captain aaron 2' && await ann.eval(chipName(annId)) === 'captain aaron 2', `${tag}: Escape cancels`);

  // the game starts with the new names
  await host.click('[data-act=start]');
  await ann.waitFor(`window.__cluedRoom?.st?.phase === 'question'`, 15000, 'question');
  ok((await ann.eval(`window.__cluedRoom.st.players.find(p => p.host).name`)) === 'Captain Aaron', `${tag}: in-game state carries the new host name`);

  for (const p of [host, ann]) ok(!p.events.length, `${p.name}: no page exceptions`, p.events.join(' | '));
}

let pages = [];
main().catch(async e => {
  fail++; console.log('FATAL', e.message);
  for (const p of pages) { try { console.log(`  [${p.name}] `, (await p.eval(`(document.querySelector('.screen')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 300)`))); } catch (err) {} }
}).finally(() => {
  srv?.stop();
  for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
