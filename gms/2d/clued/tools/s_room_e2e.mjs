// Lane S end-to-end: a local clued server + 3 headless Chromes (host + 2 joiners via the share link),
// a 3-round room game built with real clicks (round 2 picked from a ♥ favourite), round cards, a joiner refresh
// mid-round-2, per-round scores on the podium, an auto-advancing clue ladder round (no voting), host handover, and screenshots.
//   node tools/s_room_e2e.mjs [--keep] [--shots DIR] [--poll]
// Needs the :8888 site server and ~/.claude/bin/cdp. Ports: 9451 (host), 9452, 9453.
//
//   node tools/s_room_e2e.mjs --timing [--site URL] [--server DIR]       (docs/notes/TIMING.md; ports 9461–9463)
// A 2-round Apple-music listen game: one player's audio-ssl.itunes.apple.com requests are held 3 s each, the host
// presses "Round 2 ›" early and a stale Next tap follows; asserts no auto-answer, equal speed points for two
// simultaneous taps, the clip starting with the question on both devices and playing its full 5 s.
// --site/--server point at another copy (e.g. the pre-fix code) to prove the checks fail there.
//
//   node tools/s_room_e2e.mjs --myrooms                                   (docs/notes/MYROOMS.md; ports 9521–9523)
// The host creates a public and a private room, leaves both through the inline Leave/End bar, finds them under
// "Your rooms", ends the public one with the two-tap confirm (Ann's screen says "The host ended the room", the public
// slot frees and it leaves the list), rejoins the private one; Bob leaves it from "Your rooms", joins again, and
// the host's "Done" after the podium ends the finished room while Bob keeps the podium.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv0 = process.argv.slice(2);
const argOf = k => (argv0.includes(k) ? argv0[argv0.indexOf(k) + 1] : null);
const SERVER = argOf('--server') || join(HERE, '..', 'server');
const SITE = argOf('--site') || 'http://localhost:8888/gms/2d/clued/';
const TIMING = argv0.includes('--timing');
const MYROOMS = argv0.includes('--myrooms');
const CDP = join(homedir(), '.claude/bin/cdp');
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : join(tmpdir(), 'clued-s-shots');
const POLL = args.includes('--poll');
mkdirSync(SHOTS, { recursive: true });

const HARD_TIMEOUT = setTimeout(() => { console.log('FATAL: whole run exceeded 10 min'); process.exit(1); }, 10 * 60 * 1000);
HARD_TIMEOUT.unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok   ${msg}`); } else { fail++; console.log(`  FAIL ${msg} ${extra}`); } };

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}

class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.cbs = new Map(); this.events = []; this.handlers = new Map(); }
  onEvent(method, fn) { this.handlers.set(method, fn); }
  async open() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
    const t = list.find(x => x.type === 'page');
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cbs.has(d.id)) { const { res, rej } = this.cbs.get(d.id); this.cbs.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') this.events.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') this.events.push('ERR ' + d.params.args.map(a => a.value ?? a.description).join(' '));
      else if (d.method && this.handlers.has(d.method)) this.handlers.get(d.method)(d.params);
    };
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.size(384, 854, 1, true);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.cbs.delete(id); rej(new Error(`${this.name}: CDP ${method} timed out`)); }, 20000);
      this.cbs.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
    });
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
  async click(sel) {
    const r = await this.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return b.width ? {x: b.x + b.width/2, y: b.y + b.height/2} : null; })()`, 15000, sel);
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  }
  async type(sel, text) {
    await this.click(sel);
    await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.focus(); })()`);
    await this.send('Input.insertText', { text });
  }
  async shot(file) {
    try {
      const r = await this.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOTS, file), Buffer.from(r.data, 'base64'));
    } catch (e) { console.log(`  (screenshot ${file} skipped: ${e.message})`); }
  }
  room() { return this.eval('window.__cluedRoom ? JSON.parse(JSON.stringify(window.__cluedRoom.st)) : null'); }
}

const PORTS = argOf('--ports') ? argOf('--ports').split(',').map(Number) : MYROOMS ? [9521, 9522, 9523] : TIMING ? [9461, 9462, 9463] : [9451, 9452, 9453];
let srv, dataDir, all = [];
async function main() {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'clued-e2e-'));
  const bin = join(dataDir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data'), CLUED_ORIGINS: `http://localhost:8888,${new URL(SITE).origin}` }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
  console.log(`server ${API}`);

  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '180', '--', '--use-angle=metal'], { stdio: 'ignore' });
  const [host, j1, j2] = [new Page('host', PORTS[0]), new Page('ann', PORTS[1]), new Page('bob', PORTS[2])];
  all = [host, j1, j2];
  for (const p of all) await p.open();

  const q = `noauth=1&api=${encodeURIComponent(API)}${POLL ? '&netpoll=1' : ''}`;
  await host.go(`${SITE}?${q}`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  // a saved true/false favourite (4 questions) to pick round 2 from; no remembered rounds
  await host.eval(`(() => { localStorage.removeItem('clued.online'); localStorage.setItem('clued.favs', JSON.stringify({ v: 1, slots: { tf: [null, { packs: 'all', opts: {}, count: 4, at: 1 }, null, null, null] } })); return true; })()`);
  await host.eval(`import('./js/net/index.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(() => window.__cluedCtx.go('online'))`);
  await host.click('[data-act=host]');
  await host.waitFor(`document.querySelectorAll('.round-card').length === 1`, 10000, 'one starting round');
  ok(await host.eval(`document.querySelector('.round-card').textContent.includes('10 questions')`), 'host setup starts with one round of 10 questions');
  // round 1: edit the default round down to 5 questions and name it
  await host.click('.round-card [data-act=round-edit]');
  await host.waitFor(`document.body.dataset.screen === 'pqround'`, 8000, 'round editor');
  await host.click('.opt .chip[data-v="5"]');
  await host.type('.setup-head + input.field', 'Warm-up');
  await host.click('[data-act=save-round]');
  await host.waitFor(`document.body.dataset.screen === 'host' && document.querySelector('.round-card')?.textContent.includes('Warm-up')`, 8000, 'round 1 saved');
  await sleep(500); // screen transition: the old screen slides out
  // round 2: from the ♥ favourite, one tap
  await host.click('[data-act=add-round]');
  await host.waitFor(`document.querySelector('.pop .rp-fav')`, 8000, 'favourites in the add-round picker');
  await host.shot('add-round-portrait.png');
  await host.click('.pop:not(.out) .rp-fav[data-fav-format=tf]');
  await host.waitFor(`document.querySelectorAll('.round-card').length === 2`, 8000, 'fav round added');
  ok(await host.eval(`(() => { const c = document.querySelectorAll('.round-card')[1]; return c.textContent.includes('True or false') && c.textContent.includes('♥') && c.textContent.includes('10 questions'); })()`), 'round 2 added straight from a favourite (♥, the default 10 questions)');
  // keep the game short: edit the fav round down to 5
  await sleep(500);
  await host.click('.round-card[data-round="1"] [data-act=round-edit]');
  await host.waitFor(`document.body.dataset.screen === 'pqround'`, 8000, 'round 2 editor');
  await host.click('.opt .chip[data-v="5"]');
  await host.click('[data-act=save-round]');
  await host.waitFor(`document.body.dataset.screen === 'host' && document.querySelectorAll('.round-card')[1]?.textContent.includes('5 questions')`, 8000, 'round 2 → 5');
  await sleep(500);
  // round 3: format → editor → 5 questions
  await host.click('[data-act=add-round]');
  await host.click('.pop:not(.out) .tile[data-format=mc]');
  await host.waitFor(`document.body.dataset.screen === 'pqround' && document.querySelector('.opt .chip.on')?.textContent === '10'`, 8000, 'new round editor defaults to 10');
  ok(true, 'a new round defaults to 10 questions');
  await host.click('.opt .chip[data-v="5"]');
  await host.click('[data-act=save-round]');
  await host.waitFor(`document.body.dataset.screen === 'host' && document.querySelectorAll('.round-card').length === 3`, 8000, '3 rounds');
  // reorder: move round 3 up and back down
  await host.click('.round-card[data-round="2"] [data-act=round-up]');
  ok(await host.eval(`document.querySelectorAll('.round-card')[1].textContent.includes('Multiple choice')`), 'move up reorders the rounds');
  await host.click('.round-card[data-round="1"] [data-act=round-down]');
  ok(await host.eval(`document.querySelector('.rounds-sum').textContent === '3 rounds · 15 questions'`), 'summary: 3 rounds · 15 questions', await host.eval(`document.querySelector('.rounds-sum').textContent`));
  await host.eval(`scrollTo(0, 0); document.querySelector('.screen').scrollTop = 0; true`);
  await host.shot('host-rounds-portrait.png');
  await host.size(1280, 800, 1, false); await sleep(300); await host.shot('host-rounds-desktop.png');
  await host.size(384, 854, 1, true);
  await host.type('[data-field=name]', 'Hosty');
  await host.click('[data-opt=answer] .chip[data-v="30"]');
  await host.click('[data-opt=gap] .chip[data-v="3"]');
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 30000, 'lobby code');
  const code = await host.eval(`document.querySelector('.net-code').textContent`);
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  ok(/^[A-Z2-9]{5}$/.test(code), `host created room ${code}`);
  ok(link.includes(`join=${code}`), 'share link carries the code', link);
  ok(await host.eval(`!!document.querySelector('.net-qr svg path')`), 'QR code drawn');
  ok(await host.eval(`document.body.textContent.includes('friends you trust')`), 'trust hint shown');

  // joiners open the share link exactly as a phone would
  const url = 'http://' + link + (POLL ? '&netpoll=1' : '') + '&noauth=1';
  for (const [p, name] of [[j1, 'Ann'], [j2, 'Bob']]) {
    await p.go(url);
    await p.waitFor(`document.querySelector('[data-field=name]')`, 20000, 'join form');
    await p.type('[data-field=name]', name);
    await p.click('[data-act=join]');
    await p.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000, 'lobby');
  }
  await host.waitFor(`window.__cluedRoom.st.players.length === 3`, 8000, '3 players');
  ok(true, 'host sees 3 players');
  ok(await j1.eval(`document.querySelector('.net-wait')?.textContent.includes('Hosty')`), 'joiner sees "waiting for Hosty"');
  ok(await j1.eval(`document.querySelectorAll('.net-rlist li').length === 3 && [...document.querySelectorAll('.net-badge')].some(b => b.textContent === '3 rounds')`), 'lobby lists the 3 rounds');
  await host.shot('lobby-host-portrait.png');
  await j1.shot('lobby-joiner-portrait.png');
  await host.size(854, 384, 1, true); await sleep(300); await host.shot('lobby-host-landscape.png');
  await host.size(1280, 800, 1, false); await sleep(300); await host.shot('lobby-host-desktop.png');
  await host.size(384, 854, 1, true);

  await host.click('[data-act=start]');
  const total = (await host.room()).total;
  const sizes = (await host.room()).roundSizes;
  console.log(`  …playing ${total} questions in rounds of ${sizes}`);
  ok(JSON.stringify(sizes) === '[5,5,5]', 'server sees rounds of 5, 5 and 5', JSON.stringify(sizes));
  const starts = sizes.map((_, k) => sizes.slice(0, k).reduce((a, b) => a + b, 0));
  const REFRESH_Q = starts[1] + 1;
  const pages = [host, j1, j2];
  let refreshed = false, lastQ = -1, sawCountdown = false, sawGap = false, sawLive = false;
  const roundCards = {}, endCards = {};
  let sawRoundGap = false;
  for (let guard = 0; guard < 600; guard++) {
    const st = await host.room();
    if (!st) { await sleep(200); continue; }
    if (st.phase === 'final') break;
    if (st.phase === 'question' && st.q !== lastQ) {
      lastQ = st.q;
      const k = starts.indexOf(st.q);
      if (k >= 0) {
        // round card on every screen during the longer lead-in
        for (const p of pages) {
          const txt = await p.waitFor(`document.querySelector('.net-round[data-round="${k}"]')?.textContent`, 8000, `${p.name} round ${k + 1} card`).catch(() => '');
          roundCards[k] = (roundCards[k] || 0) + (txt.includes(`Round ${k + 1} of 3`) ? 1 : 0);
        }
        if (k === 1) { await host.shot('round-card-portrait.png'); await j1.size(1280, 800, 1, false); await sleep(200); await j1.shot('round-card-desktop.png'); await j1.size(384, 854, 1, true); }
      }
      for (const p of pages) {
        if (p === j2 && st.q === REFRESH_Q && !refreshed) {
          refreshed = true;
          await p.send('Page.reload', { ignoreCache: true });
          await p.waitFor(`window.__cluedRoom?.st?.q === ${REFRESH_Q}`, 20000, 'rejoin after refresh');
          ok(true, 'bob rejoined after a refresh mid-round-2');
          const me = await p.room();
          ok(me.you.name === 'Bob', 'same seat after refresh', me.you.name);
          const label = await p.waitFor(`document.querySelector('.prog-txt')?.textContent`, 15000, 'label after refresh').catch(() => '');
          ok(label === 'Round 2 · 2/5', 'after the refresh the HUD says Round 2 · 2/5', label);
        }
        if (p === j1 && st.q === total - 1) continue; // Ann sits out the last question: her timer must run out
        if (!sawCountdown) sawCountdown = await p.eval(`!!document.querySelector('.net-count3')`);
        await p.waitFor(`document.querySelector('.stage .choices .choice:not([disabled])')`, 15000, `q${st.q} choices`);
        if (p === host && st.q === 0) await p.shot('question-portrait.png');
        await p.click(p === j1 ? '.stage .choices .choice:nth-child(2)' : '.stage .choices .choice');
        if (p === host) {
          await sleep(150);
          sawLive = sawLive || await p.eval(`!!document.querySelector('.net-live .net-wait')`);
        }
      }
      await host.waitFor(`window.__cluedRoom.st.phase !== 'question' || window.__cluedRoom.st.q !== ${st.q}`, 45000, 'question end');
      const s2 = await host.room();
      if (st.q === total - 1) {
        ok(s2.phase === 'reveal' && s2.answered === 2, 'last question: revealed at the deadline with one player silent', `${s2.phase} ${s2.answered}`);
        ok(await j1.waitFor(`document.querySelector('.reveal.show')`, 5000, 'timeout reveal'), 'the silent player sees the reveal after time runs out');
      } else ok(s2.phase === 'reveal' && s2.answered === 3, `q${st.q}: all answered → early reveal`, `${s2.phase} ${s2.answered}`);
      await sleep(400);
      if (st.q === 0) { await host.shot('reveal-portrait.png'); await j1.shot('reveal-joiner-portrait.png'); }
      const ke = starts.indexOf(st.q + 1) - 1;
      if (ke >= 0 && st.q < total - 1) {
        endCards[ke] = await j1.waitFor(`document.querySelector('.net-round-end')?.textContent`, 5000, 'end of round card').catch(() => '');
        if (!sawRoundGap) sawRoundGap = await host.waitFor(`document.querySelector('.net-auto')?.textContent.includes('Round ${ke + 2} in')`, 4000, 'round gap').catch(() => false);
        if (ke === 0) { await j1.shot('round-end-portrait.png'); await host.size(1280, 800, 1, false); await sleep(250); await host.shot('round-end-desktop.png'); await host.size(384, 854, 1, true); }
      }
      if (!sawGap) sawGap = await host.eval(`!!document.querySelector('.net-gap i') && document.querySelector('.net-auto').textContent.includes('Next question in')`);
    }
    await sleep(200);
  }
  ok(sawCountdown, 'saw the 3-2-1 countdown');
  ok(sawLive, 'saw "waiting for others" after answering');
  ok(sawGap, 'saw the next-question countdown bar');
  ok(refreshed, 'refresh happened');
  ok([0, 1, 2].every(k => roundCards[k] === 3), 'every screen showed each round card ("Round N of 3")', JSON.stringify(roundCards));
  ok(/End of round 1 of 3/.test(endCards[0] || '') && /End of round 2 of 3/.test(endCards[1] || ''), 'end-of-round cards after rounds 1 and 2', JSON.stringify(endCards));
  ok(sawRoundGap, 'the gap countdown says "Round 2 in…"');
  for (const p of pages) await p.waitFor(`window.__cluedRoom?.st?.phase === 'final' && document.querySelector('.net-podium')`, 20000, 'podium');
  ok(true, 'all three reach the podium');
  const finals = await Promise.all(pages.map(p => p.room()));
  const sig = s => s.players.map(p => `${p.name}:${p.score}`).join(',');
  ok(finals.every(f => sig(f) === sig(finals[0])), 'every screen shows the same final scores', finals.map(sig).join(' | '));
  ok(finals[0].players.every(p => p.correct <= total), 'correct counts are sane');
  ok(finals[0].players.every(p => p.rs?.length === 3 && p.rs.reduce((a, b) => a + b, 0) === p.score), 'per-round scores add up to each total', JSON.stringify(finals[0].players.map(p => p.rs)));
  ok(await j2.eval(`document.querySelectorAll('.net-rtable thead th').length === 5 && document.querySelectorAll('.net-rtable tbody tr').length === 3`), 'podium shows the round-by-round table');
  await sleep(2600);
  await host.shot('final-host-portrait.png');
  await j2.eval(`document.querySelector('.net-rtable').scrollIntoView({ block: 'center' }); true`);
  await j2.shot('final-joiner-portrait.png');
  await host.size(1280, 800, 1, false); await sleep(300); await host.shot('final-host-desktop.png'); await host.size(384, 854, 1, true);

  // progressive stages auto-advance for everyone (no voting in rooms, 2026-10-08): play again with a clue ladder
  const hostKey = await host.eval(`JSON.parse(sessionStorage.getItem('clued.room.${code}')||'{}').key`);
  const post = (path, body) => fetch(`${API}/rooms/${code}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: hostKey, ...body }) }).then(r => r.json());
  const clues = ['Clue one is vague.', 'Clue two narrows it.', 'Clue three helps more.', 'Clue four nearly gives it.', 'Clue five gives it away.'];
  const lad = [0, 1].map(i => ({ format: 'ladder', id: `lad${i}`, prompt: 'Which one is it?', stages: 5, answer: 0, answerText: 'Right',
    options: [{ text: 'Right' }, { text: 'Wrong' }, { text: 'Nope' }], data: { clues, typed: false, accept: ['right'], layout: 'text' } }));
  await post('again', { questions: lad, spec: {} });
  await host.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 10000, 'again → lobby');
  await post('settings', { answerSec: 5 });   // ladder 5 clues @5 s: 23 s window, a clue every 4.5 s, last with 5 s left
  await host.click('[data-act=start]');
  const clueN = `(document.querySelector('.stage')?.innerText.match(/Clue (\\d+) of 5/) || [])[1]`;
  for (const p of pages) await p.waitFor(`window.__cluedRoom?.st?.phase === 'question' && ${clueN} === '1'`, 15000, `${p.name} clue 1`);
  const noVote = `!document.querySelector('.more-btn:not([hidden])') && !/Show more|voted/.test(document.body.innerText)`;
  for (const p of pages) ok(await p.eval(noVote), `${p.name}: no Show more / vote button`);
  ok((await host.room()).limitMs === 23000, 'auto window 23 s', String((await host.room()).limitMs));
  const t0 = Date.now();
  for (const p of pages) await p.waitFor(`window.__cluedRoom.st.stage === 1 && ${clueN} === '2'`, 8000, `${p.name} clue 2`);
  ok(Date.now() - t0 > 2500, `clue 2 arrived on its own for everyone (${Date.now() - t0} ms)`);
  await j2.shot('auto-clue2-portrait.png');
  await j1.click('.stage .choices .choice');
  await j2.waitFor(`window.__cluedRoom.st.stage === 2 && ${clueN} === '3'`, 8000, 'bob clue 3');
  ok(true, 'clues keep coming for players still answering after someone answers');
  for (const p of pages) ok(await p.eval(noVote), `${p.name}: still no vote button`);
  await j2.shot('auto-clue3-portrait.png');
  const annSt = await j1.room();
  ok(annSt.you.stage === 1 && annSt.you.last && annSt.you.last.points > 0, 'Ann scored at clue 2 (stage 1)', JSON.stringify(annSt.you.last));
  for (const p of [host, j2]) await p.click('.stage .choices .choice');
  await host.waitFor(`window.__cluedRoom.st.phase === 'reveal'`, 8000, 'ladder reveal');
  const rows = (await host.room()).players;
  const ann = rows.find(r => r.name === 'Ann'), bob = rows.find(r => r.name === 'Bob');
  ok(ann.last.points > bob.last.points, 'answering at an earlier clue scores more', `${ann.last.points} ${bob.last.points}`);
  await host.shot('auto-reveal-portrait.png');
  // skip to the podium ('end' now ends the room for everyone, so step through with Next instead)
  for (let i = 0, st = await host.room(); i < 60 && st.phase !== 'final'; i++) {
    await sleep(st.phase === 'question' && st.now < st.qStart ? st.qStart - st.now + 50 : 50);
    st = await post('next', { q: st.q });
  }
  await host.waitFor(`window.__cluedRoom?.st?.phase === 'final'`, 8000, 'final again');

  // host leaves → Ann becomes host
  await host.eval(`window.__cluedCtx.reset('home')`).catch(() => {});
  await fetch(`${API}/rooms/${code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: hostKey }) });
  await j1.waitFor(`window.__cluedRoom?.st?.you?.host === true`, 8000, 'ann becomes host');
  ok(true, 'host leaving hands the room to the next player');
  ok(await j1.eval(`!!document.querySelector('[data-act=again]')`), 'new host gets "Play again"');

  for (const p of pages) for (const e of p.events) console.log(`  [${p.name}] ${e}`);
  ok(pages.every(p => !p.events.some(e => e.startsWith('EXC'))), 'no uncaught exceptions');
}

/* ------------------------------------------------------------------ --timing (docs/notes/TIMING.md) */
const MEDIA_DELAY = 4500;
// Records every AudioBufferSourceNode start (clip.js plays listen clips this way) and when it ended.
const CLIP_HOOK = `(() => {
  window.__clipLog = [];
  const S = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, dur) {
    const st = window.__cluedRoom && window.__cluedRoom.st;
    const rec = { at: Date.now(), t0: this.context.currentTime, when, offset, dur, buf: this.buffer && this.buffer.duration, q: st && st.q, qStart: st && st.qStart };
    window.__clipLog.push(rec);
    this.addEventListener('ended', () => { rec.t1 = this.context.currentTime; });
    return S.call(this, when, offset, dur);
  };
  window.__timeUps = []; window.__holds = [];
  setInterval(() => { const st = window.__cluedRoom && window.__cluedRoom.st; if (st && st.hold && !window.__holds.includes(st.q)) window.__holds.push(st.q); }, 50);
  new MutationObserver(() => {
    const r = document.querySelector('.reveal.show .rv-title');
    const st = window.__cluedRoom && window.__cluedRoom.st;
    if (r && /Time.s up/.test(r.textContent) && st && !window.__timeUps.includes(st.q)) window.__timeUps.push(st.q);
  }).observe(document, { subtree: true, childList: true });
})()`;

async function timingMain() {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'clued-e2e-'));
  const bin = join(dataDir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data'), CLUED_ORIGINS: `http://localhost:8888,${new URL(SITE).origin}` }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
  console.log(`server ${API} · site ${SITE}`);
  for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }  // a reused browser keeps the last run's page
  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '180', '--', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'], { stdio: 'ignore' });
  const [host, slow, fast] = [new Page('host', PORTS[0]), new Page('slow', PORTS[1]), new Page('fast', PORTS[2])];
  all = [host, slow, fast];
  for (const p of all) { await p.open(); await p.send('Page.addScriptToEvaluateOnNewDocument', { source: CLIP_HOOK }); }
  // the slow device: every Apple preview request (HEAD check and the clip itself) waits MEDIA_DELAY
  let held = 0;
  await slow.send('Fetch.enable', { patterns: [{ urlPattern: '*audio-ssl.itunes.apple.com*', requestStage: 'Request' }] });
  slow.onEvent('Fetch.requestPaused', ev => { held++; setTimeout(() => slow.send('Fetch.continueRequest', { requestId: ev.requestId }).catch(() => {}), MEDIA_DELAY); });

  const q = `noauth=1&api=${encodeURIComponent(API)}`;
  await host.go(`${SITE}?${q}`);
  await host.waitFor(`location.href.startsWith(${JSON.stringify(SITE)}) && window.__cluedReady`, 20000, 'boot');
  const round = { format: 'listen', packs: ['hits-1980s', 'hits-1990s'], count: 2, opts: { clip: 5, art: 'off', ask: 'title', answers: 4 }, difficulty: 0 };
  await host.eval(`(() => { localStorage.setItem('clued.online', JSON.stringify({ rounds: [${JSON.stringify(round)}, ${JSON.stringify({ ...round, packs: ['hits-2000s'] })}] })); localStorage.setItem('clued.settings', JSON.stringify({ bgm: false })); return true; })()`);
  await host.eval(`import('./js/net/index.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(() => window.__cluedCtx.go('online'))`);
  await host.click('[data-act=host]');
  await host.waitFor(`document.querySelectorAll('.round-card').length === 2`, 10000, 'two listen rounds');
  await host.type('[data-field=name]', 'Hosty');
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 60000, 'lobby code');
  const code = await host.eval(`document.querySelector('.net-code').textContent`);
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  const hostKey = await host.eval(`JSON.parse(sessionStorage.getItem('clued.room.${code}')||'{}').key`);
  for (const [p, name] of [[slow, 'Slow'], [fast, 'Fast']]) {
    await p.go('http://' + link + '&noauth=1');
    await p.waitFor(`document.querySelector('[data-field=name]')`, 20000, 'join form');
    await p.type('[data-field=name]', name);
    await p.click('[data-act=join]');
    await p.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000, 'lobby');
  }
  await host.waitFor(`window.__cluedRoom.st.players.length === 3`, 8000, '3 players');
  const st0 = await host.room();
  ok(JSON.stringify(st0.roundSizes) === '[2,2]', 'two listen rounds of 2', JSON.stringify(st0.roundSizes));
  ok(st0.streakBonus === false, 'new online rooms: streaks just for show by default', String(st0.streakBonus));
  await host.click('[data-act=start]');
  const total = st0.total;
  const answerIdx = async i => (await (await fetch(`${API}/rooms/${code}/q/${i}?k=${hostKey}`)).json()).question.answer;
  const speedPairs = [], starts = {}, holds = new Set();
  let staleOk = null, whyText = '';
  for (let i = 0; i < total; i++) {
    await host.waitFor(`window.__cluedRoom?.st?.q >= ${i} || window.__cluedRoom?.st?.phase === 'final'`, 30000, `q${i}`);
    const cur = await host.room();
    if (cur.q > i || cur.phase === 'final') { ok(false, `q${i} was never playable (ended by a stale Next)`, `now ${cur.phase} q${cur.q}`); continue; }
    const right = await answerIdx(i);
    const sel = `.stage .choices .choice:not([disabled])`;
    for (const p of [host, slow, fast]) await p.waitFor(`(() => { const s = window.__cluedRoom?.st; if (s?.hold) window.__sawHold = true; return document.querySelector(${JSON.stringify(sel)}) || document.querySelector('.reveal.show'); })()`, 40000, `${p.name} q${i} choices`);
    const qs = (await host.room()).qStart;
    // let the clip play out on question 0 to measure its length; otherwise answer ~2 s in
    const wait = (i === 0 ? 6000 : 2000) - (Date.now() - qs);
    if (wait > 0) await sleep(wait);
    const click = `(() => { const b = document.querySelectorAll('.stage .choices .choice')[${right}]; if (!b || b.disabled) return false; b.click(); return true; })()`;
    const [a, b] = await Promise.all([slow.eval(click), fast.eval(click)]);
    ok(a && b, `q${i}: both players could answer (no auto-answer)`, `${a} ${b}`);
    await host.eval(click);
    await host.waitFor(`window.__cluedRoom.st.phase === 'reveal' && window.__cluedRoom.st.q === ${i}`, 20000, `q${i} reveal`);
    const st = await host.room();
    const P = n => st.players.find(x => x.name === n)?.last || {};
    speedPairs.push([i, P('Slow'), P('Fast')]);
    if (i === 0) whyText = await fast.waitFor(`document.querySelector('.net-why')?.textContent`, 5000, 'breakdown').catch(() => '');
    if (i === 0) { await fast.eval(`document.querySelector('.net-why')?.scrollIntoView({ block: 'center' }); true`); await sleep(1500); await fast.shot('timing-reveal.png'); }
    ok(st.answered === 3, `q${i}: all three answers recorded`, `${st.phase} q${st.q} answered ${st.answered}`);
    for (const p of [slow, fast]) {
      const log = (await p.eval('JSON.stringify(window.__clipLog || [])')).length ? JSON.parse(await p.eval('JSON.stringify(window.__clipLog || [])')) : [];
      const rec = log.filter(r => r.q === i && r.dur > 4.9 && r.dur < 5.2)[0];
      (starts[p.name === 'slow' ? 'Slow' : 'Fast'] ||= []).push(rec ? rec.at - rec.qStart : null);
      if (i === 0 && p === slow) {
        const played = rec && rec.t1 ? rec.t1 - Math.max(rec.t0, rec.when) : 0;
        ok(rec && rec.buf >= 5 && played >= 4.9, 'the full 5 s clip played (buffer ≥ 5 s, start→ended ≥ 4.9 s)', rec ? `buf ${rec.buf?.toFixed(2)} played ${played.toFixed(2)} offset ${rec.offset}` : 'no clip');
      }
    }
    const R = st.roundSizes;
    if (i === R[0] - 1) {
      // end of round 1: the host taps "Round 2 ›" during the gap, then a stale tap lands after the server moved on
      ok(await host.waitFor(`document.querySelector('[data-act=next]')?.textContent.includes('Round 2')`, 5000, 'Round 2 button'), 'host sees "Round 2 ›"');
      await host.click('[data-act=next]');
      await host.waitFor(`window.__cluedRoom.st.q === ${i + 1} && window.__cluedRoom.st.phase === 'question'`, 8000, 'round 2 opened early');
      for (const body of [{ key: hostKey, q: i }, { key: hostKey }]) {
        await fetch(`${API}/rooms/${code}/next`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const after = await (await fetch(`${API}/rooms/${code}/state?k=${hostKey}`)).json();
      staleOk = after.phase === 'question' && after.q === i + 1;
      ok(staleOk, 'stale "Next" taps after "Round 2 ›" don\'t end round 2\'s first question', `${after.phase} q${after.q}`);
    }
  }
  for (const p of [host, slow, fast]) await p.waitFor(`window.__cluedRoom?.st?.phase === 'final'`, 20000, 'final');
  const timeUps = await Promise.all([host, slow, fast].map(p => p.eval('JSON.stringify(window.__timeUps || [])')));
  ok(timeUps.every(t => t === '[]'), 'nobody saw "Time\'s up" at the start of a question', timeUps.join(' '));
  ok(held > 0, `the slow device's Apple requests were held (${held})`);
  console.log(`  holds on questions: ${await slow.eval('JSON.stringify(window.__holds)')} · clip start after qStart (ms): slow ${JSON.stringify(starts.Slow)} fast ${JSON.stringify(starts.Fast)}`);
  ok(starts.Slow?.length === total && starts.Slow.every(x => x != null && x < 1500), 'slow device: the clip starts within 1.5 s of the question opening', JSON.stringify(starts.Slow));
  ok(starts.Fast?.length === total && starts.Fast.every(x => x != null && x < 1500), 'fast device: the clip starts within 1.5 s of the question opening', JSON.stringify(starts.Fast));
  for (const [i, s1, f1] of speedPairs) {
    ok(s1.correct && f1.correct && Math.abs((s1.speed ?? s1.points) - (f1.speed ?? f1.points)) <= 6 && Math.abs(s1.ms - f1.ms) <= 150,
      `q${i}: simultaneous taps score the same speed points`, `slow ${s1.speed ?? s1.points} (${s1.ms} ms) fast ${f1.speed ?? f1.points} (${f1.ms} ms)`);
  }
  ok(/speed/.test(whyText) && /clip/.test(whyText), 'reveal shows the points breakdown', whyText);
  await fast.shot('timing-final.png');
  for (const p of all) for (const e of p.events) console.log(`  [${p.name}] ${e}`);
}

/* ------------------------------------------------------------------ --myrooms (docs/notes/MYROOMS.md) */
async function myroomsMain() {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'clued-e2e-'));
  const bin = join(dataDir, 'clued');
  execFileSync('go', ['build', '-o', bin, '.'], { cwd: SERVER, env: { ...process.env, CGO_ENABLED: '0' } });
  srv = spawn(bin, [], { env: { ...process.env, CLUED_ADDR: `127.0.0.1:${port}`, CLUED_DATA: join(dataDir, 'data'), CLUED_ORIGINS: `http://localhost:8888,${new URL(SITE).origin}` }, stdio: 'ignore' });
  const API = `http://127.0.0.1:${port}/gms/2d/clued/api`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch (e) {} await sleep(100); }
  console.log(`server ${API}`);
  for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
  for (const p of PORTS) execFileSync(CDP, ['start', '--port', String(p), '--idle', '180', '--', '--use-angle=metal'], { stdio: 'ignore' });
  const [host, ann, bob] = [new Page('host', PORTS[0]), new Page('ann', PORTS[1]), new Page('bob', PORTS[2])];
  all = [host, ann, bob];
  for (const p of all) await p.open();
  const getJ = async path => (await fetch(API + path)).json();
  const q = `noauth=1&api=${encodeURIComponent(API)}`;
  const toOnline = async p => {
    await p.eval(`import('./js/net/index.js?v=' + window.__cluedCtx.BUILD).then(() => window.__cluedCtx.reset('online'))`);
    await p.waitFor(`document.body.dataset.screen === 'online'`, 10000, 'online hub');
  };
  const mineRow = code => `document.querySelector('.net-myroom[data-code="${code}"]')`;

  await host.go(`${SITE}?${q}`);
  await host.waitFor('window.__cluedReady', 20000, 'boot');
  await host.eval(`(() => { localStorage.removeItem('clued.online'); localStorage.removeItem('clued.myrooms'); return true; })()`);
  await toOnline(host);
  ok(await host.eval(`document.querySelector('[data-sec=mine]').hidden`), 'no "Your rooms" before hosting anything');

  async function create(pub) {
    await host.click('[data-act=host]');
    await host.waitFor(`document.body.dataset.screen === 'host' && document.querySelector('[data-field=name]')`, 10000, 'host screen');
    await host.type('[data-field=name]', 'Hosty');
    await host.click(`[data-opt=vis] .chip[data-v="${pub}"]`);
    if (pub) await host.click('[data-opt=start] .chip[data-v="0"]');
    await host.click('[data-act=create]');
    await host.waitFor(`window.__cluedRoom?.st?.phase === 'lobby' && document.querySelector('.net-code')`, 30000, 'lobby');
    return host.eval(`window.__cluedRoom.code`);
  }
  async function leaveVia(p, choice, shot) {
    await p.click('.scr-room [aria-label="Leave room"]');
    await p.waitFor(`document.querySelector('.net-leavebar.in')`, 5000, 'leave bar');
    if (shot) { await sleep(250); await p.shot(shot); }
    await p.click(`.net-leavebar [data-leave=${choice}]`);
    await p.waitFor(`document.body.dataset.screen === 'home' && !document.querySelector('.net-leavebar')`, 10000, 'home after leaving');
  }

  // room A: public, Ann joins
  const A = await create(true);
  ok(/^[A-Z2-9]{5}$/.test(A), `host created public room ${A}`);
  const free0 = (await getJ('/status')).publicFree;
  await ann.go(`${SITE}?join=${A}&${q}`);
  await ann.waitFor(`document.querySelector('[data-field=name]')`, 20000, 'join form');
  await ann.type('[data-field=name]', 'Ann');
  await ann.click('[data-act=join]');
  await ann.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000, 'ann in lobby');
  await host.waitFor(`window.__cluedRoom.st.players.length === 2`, 8000, '2 players');
  // host leaves A: the inline bar offers leave vs end
  await host.click('.scr-room [aria-label="Leave room"]');
  await host.waitFor(`document.querySelector('.net-leavebar.in')`, 5000, 'leave bar');
  const barTxt = await host.eval(`document.querySelector('.net-leavebar').textContent`);
  ok(barTxt.includes('Leave (room keeps going, someone else becomes host)') && barTxt.includes('End room for everyone'), 'host leave bar: "Leave (room keeps going…)" vs "End room for everyone"', barTxt);
  ok(await host.eval(`!document.querySelector('#popups .pop')`), 'no popup: the choice is inline');
  await sleep(250); await host.shot('myrooms-leavebar-host.png');
  await host.click('.net-leavebar [data-leave=stay]');
  ok(await host.waitFor(`!document.querySelector('.net-leavebar') && document.body.dataset.screen === 'room'`, 4000, 'stay'), 'Stay keeps the host in the room');
  await leaveVia(host, 'leave');
  await ann.waitFor(`window.__cluedRoom?.st?.you?.host === true`, 10000, 'ann becomes host');
  ok(true, 'host left A: Ann became host, the room keeps going');

  // room B: private, host alone, leaves
  await toOnline(host);
  const B = await create(false);
  ok(B && B !== A, `host created private room ${B}`);
  await leaveVia(host, 'leave', 'myrooms-leavebar-alone.png');

  // Your rooms
  await toOnline(host);
  await host.waitFor(`${mineRow(A)} && ${mineRow(B)}`, 12000, 'both rooms listed');
  const rowA = await host.eval(`${mineRow(A)}.textContent`), rowB = await host.eval(`${mineRow(B)}.textContent`);
  ok(rowA.includes('In the lobby') && rowA.includes('You left · 👑 Ann hosts') && /1 player\b/.test(rowA) && rowA.includes('Public'), 'row A: lobby, you left, Ann hosts now, 1 player, public', rowA);
  ok(rowB.includes('You left · nobody in it') && rowB.includes('Private') && /min old|just made/.test(rowB), 'row B: you left, empty, private, age', rowB);
  ok(await host.eval(`!!${mineRow(A)}.querySelector('[data-act=end-room]') && !!${mineRow(B)}.querySelector('[data-act=end-room]') && !!${mineRow(B)}.querySelector('[data-act=rejoin]')`), 'both rows offer Rejoin and End room');
  await sleep(700);   // let the screen transition finish before the screenshot
  await host.eval(`document.querySelector('[data-sec=mine]').scrollIntoView(); true`);
  await host.shot('myrooms-list.png');

  // end A with the two-tap confirm
  await host.click(`.net-myroom[data-code="${A}"] [data-act=end-room]`);
  ok(await host.eval(`${mineRow(A)}.querySelector('[data-act=end-room]').textContent === 'End for everyone?'`), 'first tap arms: "End for everyone?"');
  ok(await host.eval(`!!${mineRow(A)} && !document.querySelector('#popups .pop')`), 'nothing ended yet, no popup');
  await host.shot('myrooms-end-armed.png');
  await host.click(`.net-myroom[data-code="${A}"] [data-act=end-room]`);
  await host.waitFor(`!${mineRow(A)}`, 8000, 'row A gone');
  ok(true, 'second tap ends room A and drops it from the list');
  await ann.waitFor(`document.body.textContent.includes('The host ended the room')`, 10000, 'ann told');
  ok(true, 'Ann sees "The host ended the room"');
  await ann.shot('myrooms-ann-ended.png');
  const free1 = (await getJ('/status')).publicFree;
  ok(free1 === free0 + 1, `public slot freed at once (${free0} → ${free1} free)`);
  ok(!(await getJ('/rooms/public')).rooms.some(r => r.code === A), 'ended room left the public list');
  ok(!(await host.eval(`JSON.parse(localStorage.getItem('clued.myrooms') || '{}')`))[A], 'ended room forgotten on this device');

  // rejoin B
  await host.click(`.net-myroom[data-code="${B}"] [data-act=rejoin]`);
  await host.waitFor(`window.__cluedRoom?.code === '${B}' && window.__cluedRoom.st.phase === 'lobby'`, 15000, 'rejoined B');
  ok(await host.eval(`window.__cluedRoom.st.you.host === true`), 'rejoined B as its host');

  // a player leaves from "Your rooms"
  await bob.go(`${SITE}?join=${B}&${q}`);
  await bob.waitFor(`document.querySelector('[data-field=name]')`, 20000, 'join form');
  await bob.type('[data-field=name]', 'Bob');
  await bob.click('[data-act=join]');
  await bob.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000, 'bob in lobby');
  await host.waitFor(`window.__cluedRoom.st.players.length === 2`, 8000, 'bob joined');
  await bob.eval(`window.__cluedCtx.reset('home'), true`);
  await toOnline(bob);
  await bob.waitFor(`${mineRow(B)}?.querySelector('[data-act=leave-room]')`, 12000, 'bob sees B with Leave');
  ok(!(await bob.eval(`!!${mineRow(B)}.querySelector('[data-act=end-room]')`)), 'a player gets Leave, not End');
  await sleep(700);
  await bob.shot('myrooms-player-list.png');
  await bob.click(`.net-myroom[data-code="${B}"] [data-act=leave-room]`);
  await bob.waitFor(`!${mineRow(B)}`, 8000, 'bob row gone');
  await host.waitFor(`window.__cluedRoom.st.players.length === 1`, 10000, 'host sees bob leave');
  ok(true, 'Bob left from "Your rooms": the host sees him go');

  // Done after the podium ends the finished room; Bob (back in) keeps the podium
  await bob.go(`${SITE}?join=${B}&${q}`);
  await bob.waitFor(`document.querySelector('[data-field=name]')`, 20000, 'join form');
  await bob.type('[data-field=name]', 'Bob');
  await bob.click('[data-act=join]');
  await bob.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 15000, 'bob back');
  await host.waitFor(`window.__cluedRoom.st.players.length === 2`, 8000, 'bob back for host');
  const hostKey = await host.eval(`JSON.parse(localStorage.getItem('clued.myrooms'))['${B}'].key`);
  const post = (a, extra) => fetch(`${API}/rooms/${B}/${a}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: hostKey, ...extra }) }).then(r => r.json());
  let st = await post('start', {});
  for (let i = 0; i < 40 && st.phase !== 'final'; i++) { await sleep(st.phase === 'question' && st.now < st.qStart ? st.qStart - st.now + 50 : 50); st = await post('next', { q: st.q }); }
  ok(st.phase === 'final', 'skipped to the podium');
  await host.waitFor(`document.querySelector('[data-act=done]')`, 15000, 'host Done');
  await bob.waitFor(`document.querySelector('.net-podium')`, 15000, 'bob podium');
  await host.shot('myrooms-final-host.png');
  await host.click('[data-act=done]');
  await host.waitFor(`document.body.dataset.screen === 'home'`, 10000, 'host home after Done');
  await bob.waitFor(`document.querySelector('[data-ended]')`, 10000, 'bob told');
  ok(await bob.eval(`!!document.querySelector('.net-podium') && document.body.textContent.includes('The host ended the room')`), 'Done ended the room; Bob keeps the podium with "The host ended the room"');
  await bob.shot('myrooms-final-bob-ended.png');
  const peek = await getJ(`/rooms/${B}`);
  ok(peek.ended === true, 'server: room B ended');
  await toOnline(host);
  await sleep(1500);
  ok(await host.eval(`document.querySelector('[data-sec=mine]').hidden && Object.keys(JSON.parse(localStorage.getItem('clued.myrooms') || '{}')).length === 0`), '"Your rooms" is empty again');
  for (const p of all) for (const e of p.events) console.log(`  [${p.name}] ${e}`);
  ok(all.every(p => !p.events.some(e => e.startsWith('EXC'))), 'no uncaught exceptions');
}

(MYROOMS ? myroomsMain() : TIMING ? timingMain() : main()).catch(async e => {
  fail++; console.error('FATAL', e.message);
  for (const p of all) {
    try {
      await p.shot(`fail-${p.name}.png`);
      console.log(`  [${p.name}] more=${await p.eval(`[...document.querySelectorAll('.more-btn')].map(b => b.outerHTML + ' w=' + b.getBoundingClientRect().width).join(' | ')`)}`);
      console.log(`  [${p.name}] screen=${await p.eval('document.body.dataset.screen')} err=${await p.eval(`[...document.querySelectorAll('.net-err,.error-panel,.toast')].map(x=>x.textContent).join(' | ')`)}`);
      p.events.forEach(x => console.log(`  [${p.name}] ${x}`));
    } catch (err) {}
  }
}).finally(() => {
  if (srv) srv.kill();
  if (!args.includes('--keep')) for (const p of PORTS) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed · screenshots in ${SHOTS}`);
  process.exit(fail ? 1 : 0);
});
