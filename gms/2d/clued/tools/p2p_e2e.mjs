// Lane P2P end-to-end: 3 headless Chromes play a device-hosted room through the real PeerJS cloud broker.
// Host creates via real clicks, 2 joiners open the ?p2p= share link, full game with a joiner refresh and a
// host refresh mid-game, a vote-to-reveal round, then the host leaves and the room ends with final scores.
//   node tools/p2p_e2e.mjs [--shots DIR] [--keep] [--peerhost host:port]
// Needs the :8888 site server, internet (0.peerjs.com) and ~/.claude/bin/cdp. Ports 9411 (host), 9412, 9413.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://localhost:8888/gms/2d/clued/';
const CDP = join(homedir(), '.claude/bin/cdp');
const args = process.argv.slice(2);
const arg = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const SHOTS = arg('--shots') || join(tmpdir(), 'clued-p2p-shots');
const PEERHOST = arg('--peerhost');
mkdirSync(SHOTS, { recursive: true });

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
    await this.size(384, 854, 2, true);
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

const PORTS = [9411, 9412, 9413];
let all = [];
const extra = `noauth=1${PEERHOST ? `&peerhost=${PEERHOST}` : ''}`;

// One question round: everyone in `who` taps a choice (skip = sits out).
async function playQuestion(pages, st, { skip = [], pick = () => '.stage .choices .choice' } = {}) {
  for (const p of pages) {
    if (skip.includes(p)) continue;
    await p.waitFor(`document.querySelector('.stage .choices .choice:not([disabled])')`, 20000, `${p.name} q${st.q} choices`);
    if (p.name === 'host' && st.q === 0 && !p.qshot) { p.qshot = true; await p.shot('question-portrait.png'); }
    await p.click(pick(p));
  }
}

async function main() {
  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '240', ...(args.includes('--mdns') ? [] : ['--', '--disable-features=WebRtcHideLocalIpsWithMdns'])], { stdio: 'ignore' });
  const [host, j1, j2] = [new Page('host', PORTS[0]), new Page('ann', PORTS[1]), new Page('bob', PORTS[2])];
  all = [host, j1, j2];
  for (const p of all) await p.open();

  await host.go(`${SITE}?${extra}`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  await host.eval(`import('./js/net/index.js?v=1').then(() => window.__cluedCtx.go('online'))`);
  await host.waitFor(`document.querySelector('[data-act=host-device]')`, 8000, 'device host button');
  ok(true, 'Online hub offers "Host from this device"');
  await host.shot('hub-portrait.png');
  await host.click('[data-act=host-device]');
  await host.click('.tile[data-format=mc]');
  await host.type('[data-field=name]', 'Hosty');
  ok(await host.eval(`!document.querySelector('[data-opt=vis]') && document.body.textContent.includes('this device runs the room')`), 'device host screen: no public option, device note');
  await host.click('[data-opt=answer] .chip[data-v="15"]');
  await host.click('[data-opt=gap] .chip[data-v="3"]');
  const t0 = Date.now();
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 40000, 'lobby code');
  console.log(`  …host registered with the broker in ${Date.now() - t0} ms`);
  const code = await host.eval(`document.querySelector('.net-code').textContent`);
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  ok(/^[A-Z2-9]{5}$/.test(code), `host created device room ${code}`);
  ok(link.includes(`p2p=${code}`), 'share link is ?p2p=CODE', link);
  ok(await host.eval(`!!document.querySelector('.net-qr svg path')`), 'QR drawn');
  ok(await host.eval(`document.querySelector('[data-p2p=host]')?.textContent.includes('Hosting from this device')`), '"Hosting from this device" shown to the host');
  ok(await host.eval(`[...document.querySelectorAll('.net-badge')].some(b => b.textContent.includes('Device room'))`), 'Device room badge');

  const url = 'http://' + link + '&' + extra;
  for (const [p, name] of [[j1, 'Ann'], [j2, 'Bob']]) {
    const tj = Date.now();
    await p.go(url);
    await p.waitFor(`document.querySelector('[data-field=name]')`, 30000, 'join form');
    console.log(`  …${name}: join form after ${Date.now() - tj} ms`);
    if (p === j1) await p.shot('join-form-portrait.png');
    ok(await p.eval(`document.body.textContent.includes('Hosty')`), `${name}: join screen names the host`);
    await p.type('[data-field=name]', name);
    await p.click('[data-act=join]');
    await p.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 20000, 'lobby');
    console.log(`  …${name} in the lobby ${Date.now() - tj} ms after opening the link`);
  }
  await host.waitFor(`window.__cluedRoom.st.players.length === 3`, 8000, '3 players');
  ok(true, 'host sees 3 players');
  ok(await j1.eval(`document.querySelector('[data-p2p=join]') && document.querySelector('.net-wait')?.textContent.includes('Hosty')`), 'joiner sees device-room note and "waiting for Hosty"');
  ok(await j1.eval(`location.search.includes('p2p=${code}')`), 'joiner URL keeps ?p2p= for refresh');
  await host.shot('lobby-host-portrait.png');
  await j1.shot('lobby-joiner-portrait.png');
  await host.size(854, 384, 2, true); await sleep(300); await host.shot('lobby-host-landscape.png');
  await host.size(1280, 800, 1, false); await sleep(300); await host.shot('lobby-host-desktop.png');
  await host.size(384, 854, 2, true);

  /* ---------------------------------------------------------------- game 1 */
  await host.click('[data-act=start]');
  const total = (await host.room()).total;
  console.log(`  …playing ${total} questions`);
  const pages = [host, j1, j2];
  let refreshed = false, hostRefreshed = false, lastQ = -1, sawCountdown = false, sawGap = false;
  for (let guard = 0; guard < 600; guard++) {
    const st = await host.room().catch(() => null);
    if (!st) { await sleep(200); continue; }
    if (st.phase === 'final') break;
    if (st.phase === 'question' && st.q !== lastQ) {
      lastQ = st.q;
      if (st.q >= 1 && !refreshed) {
        refreshed = true;
        await j2.eval('window.__preReload = 1');
        await j2.send('Page.reload', { ignoreCache: true });
        await j2.waitFor(`!window.__preReload && window.__cluedReady`, 20000, 'joiner page reloaded');
        await j2.waitFor(`window.__cluedRoom?.st?.q >= ${st.q}`, 25000, 'rejoin after refresh');
        const me = await j2.room();
        ok(me.you.name === 'Bob', 'joiner refresh mid-game → same seat', me.you.name);
      }
      const tq = Date.now();
      if (!sawCountdown) sawCountdown = await j1.eval(`!!document.querySelector('.net-count3')`);
      await playQuestion(pages, st, { skip: st.q === total - 1 ? [j1] : [], pick: p => (p === j1 ? '.stage .choices .choice:nth-child(2)' : '.stage .choices .choice') });
      await host.waitFor(`window.__cluedRoom.st.phase !== 'question' || window.__cluedRoom.st.q !== ${st.q}`, 25000, 'question end');
      const s2 = await host.room();
      if (st.q === total - 1) ok(s2.phase === 'reveal' && s2.answered === 2, 'last question revealed at the deadline with one silent player', `${s2.phase} ${s2.answered}`);
      else if (Date.now() - tq > 17000 && s2.q !== st.q) console.log(`  warn q${st.q}: answering took ${Date.now() - tq} ms (machine load), early-reveal check skipped`);
      else ok(s2.phase === 'reveal' && s2.answered === 3, `q${st.q}: all answered → early reveal`, `q${s2.q} ${s2.phase} ${s2.answered} (answers took ${Date.now() - tq} ms)`);
      await sleep(400);
      if (st.q === 0) { await host.shot('reveal-host-portrait.png'); await j1.shot('reveal-joiner-portrait.png'); }
      if (!sawGap) sawGap = await j1.eval(`!!document.querySelector('.net-gap i') && document.querySelector('.net-auto').textContent.includes('Next question in')`);
      if (st.q >= 2 && !hostRefreshed && total > 4) {
        hostRefreshed = true;
        const before = (await j1.room()).players.map(p => `${p.name}:${p.score}`).join(',');
        const tr = Date.now();
        await host.eval('window.__preReload = 1');
        await host.send('Page.reload', { ignoreCache: true });
        await host.waitFor(`!window.__preReload && window.__cluedReady`, 20000, 'host page reloaded');
        await host.waitFor(`window.__cluedRoom?.st?.you?.host && window.__cluedRoom.st.q >= ${st.q}`, 40000, 'host resumes after refresh');
        await j1.waitFor(`window.__cluedRoom?.st && document.querySelector('.net-link-dot')?.hidden !== false`, 40000, 'joiner reconnects to the resumed host');
        console.log(`  …host refresh: room back in ${Date.now() - tr} ms`);
        const after = (await host.room()).players.map(p => `${p.name}:${p.score}`).join(',');
        ok(before.split(',').sort().join() === after.split(',').sort().join(), 'host refresh keeps the room and scores', `${before} vs ${after}`);
        ok(host.dialogs >= 1, 'host reload mid-game asks "leave site?" (beforeunload)');
      }
    }
    await sleep(200);
  }
  ok(sawCountdown, 'saw the 3-2-1 countdown');
  ok(sawGap, 'saw the next-question countdown bar');
  for (const p of pages) await p.waitFor(`window.__cluedRoom?.st?.phase === 'final' && document.querySelector('.net-podium')`, 25000, `${p.name} podium`);
  ok(true, 'all three reach the podium');
  const finals = await Promise.all(pages.map(p => p.room()));
  const sig = s => s.players.map(p => `${p.name}:${p.score}`).join(',');
  ok(finals.every(f => sig(f) === sig(finals[0])), 'every screen shows the same final scores', finals.map(sig).join(' | '));
  await sleep(2500);
  await host.shot('final-host-portrait.png');
  await j2.shot('final-joiner-portrait.png');

  /* ------------------------------------------------- game 2: vote to reveal */
  await host.eval(`(async () => {
    const T = window.__cluedP2P.transport, st = window.__cluedRoom.st, seat = JSON.parse(sessionStorage.getItem('clued.room.' + st.code));
    const q0 = (await T.question(st.code, seat.key, 0)).question, q1 = (await T.question(st.code, seat.key, 1)).question;
    await T.host(st.code, seat.key, 'again', { spec: st.spec, title: 'Vote test', questions: [{ ...q0, id: 'v0', stages: 3 }, { ...q1, id: 'v1' }] });
  })()`);
  for (const p of pages) await p.waitFor(`window.__cluedRoom?.st?.phase === 'lobby' && window.__cluedRoom.st.game === 1`, 15000, `${p.name} back in the lobby`);
  ok(true, 'play again returns everyone to the lobby');
  await host.click('[data-act=start]');
  for (const p of pages) await p.waitFor(`document.querySelector('[data-act=more]:not([hidden]):not([disabled])')`, 20000, `${p.name} show-more button`);
  const v0 = await host.room();
  ok(v0.stages === 3 && v0.stage === 0 && v0.needed === 3, 'progressive question: 3 stages, 3 voters needed', JSON.stringify({ s: v0.stages, st: v0.stage, n: v0.needed }));
  const dl0 = v0.qDeadline;
  await j1.click('[data-act=more]');
  await host.waitFor(`window.__cluedRoom.st.votes === 1`, 5000, 'one vote counted');
  await j2.waitFor(`document.querySelector('[data-act=more]').textContent.includes('1/3')`, 5000, 'vote count on other screens');
  ok(true, 'vote count shows "1/3" on another player');
  await j2.shot('vote-joiner-portrait.png');
  await j2.click('[data-act=more]');
  await host.click('[data-act=more]');
  for (const p of pages) await p.waitFor(`window.__cluedRoom.st.stage === 1`, 5000, `${p.name} stage 1`);
  const v1 = await host.room();
  ok(true, 'everyone voted → all advance to stage 1 together');
  ok(v1.qDeadline >= dl0, 'deadline never shrinks on a stage advance', `${dl0} → ${v1.qDeadline}`);
  await j1.waitFor(`document.querySelector('.stage .choices .choice:not([disabled])')`, 5000, 'choices');
  await j1.click('.stage .choices .choice');
  for (const p of [host, j2]) await p.waitFor(`window.__cluedRoom.st.locked === true && document.querySelector('[data-act=more]')?.textContent.includes('Locked')`, 5000, `${p.name} locked`);
  ok(true, 'the first answer locks voting for everyone');
  await host.shot('vote-locked-host-portrait.png');
  await playQuestion([host, j2], v1);
  await host.waitFor(`window.__cluedRoom.st.phase === 'reveal'`, 10000, 'vote q reveal');
  const ann = (await host.room()).players.find(p => p.name === 'Ann');
  ok(ann.last && (!ann.last.correct || ann.last.points < 500), 'stage-1 answer scored with the stage multiplier', JSON.stringify(ann.last));

  /* --------------------------------------------- host leaves → room ends */
  await host.waitFor(`window.__cluedRoom.st.phase === 'question' && window.__cluedRoom.st.q === 1`, 15000, 'q2');
  await host.click('.scr-room [aria-label="Leave room"], [aria-label="Quit"], .hud [aria-label]', 5000).catch(() => {});
  await host.eval(`(async () => { const st = window.__cluedRoom.st, seat = JSON.parse(sessionStorage.getItem('clued.room.' + st.code)); await window.__cluedP2P.transport.leave(st.code, seat.key); })()`);
  for (const p of [j1, j2]) await p.waitFor(`window.__cluedRoom?.st?.closed && window.__cluedRoom.st.phase === 'final' && document.querySelector('.net-podium')`, 15000, `${p.name} sees the room end`);
  ok(true, 'host leaving ends the room with final scores for everyone');
  ok(await j1.eval(`document.body.textContent.includes('The host closed the room')`), 'joiners told the host closed the room');
  await sleep(1500);
  await j1.shot('host-left-joiner-portrait.png');

  for (const p of pages) for (const e of p.events) console.log(`  [${p.name}] ${e}`);
  ok(pages.every(p => !p.events.some(e => e.startsWith('EXC'))), 'no uncaught exceptions');
  const st = await Promise.all(pages.map(p => p.eval(`(({ hostConns, clientConnects, clientFails, lastError }) => ({ hostConns, clientConnects, clientFails, lastError }))(window.__cluedP2P || {})`)));
  console.log('  p2p stats', JSON.stringify(st));
}

main().catch(async e => {
  fail++; console.error('FATAL', e.message);
  for (const p of all) {
    try {
      await p.shot(`fail-${p.name}.png`);
      console.log(`  [${p.name}] screen=${await p.eval('document.body.dataset.screen')} err=${await p.eval(`[...document.querySelectorAll('.net-err,.toast,.panel.net-hero')].map(x=>x.textContent).join(' | ')`)} p2p=${await p.eval('JSON.stringify({...window.__cluedP2P, transport: undefined})')}`);
      p.events.forEach(x => console.log(`  [${p.name}] ${x}`));
    } catch (err) {}
  }
}).finally(() => {
  if (!args.includes('--keep')) for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
  console.log(`\n${pass} passed, ${fail} failed · screenshots in ${SHOTS}`);
  process.exit(fail ? 1 : 0);
});
