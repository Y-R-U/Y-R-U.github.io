#!/usr/bin/env node
// Local focus end-to-end, real clicks: Settings chip → host screen (Japan · Most) → a round that can't reach its share
// shows the warning → Change round opens the editor → Keep clears it → device room → lobby badge on every player →
// play questions and check all three players see the same ones.
//   CDP_PORT=9550 node tools/local_e2e.mjs OUT
// Needs the :8888 site server, internet (PeerJS broker) and ~/.claude/bin/cdp. Uses CDP_PORT, +1 and +2.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] || '/tmp/clued-local';
mkdirSync(OUT, { recursive: true });
const BASE = +process.env.CDP_PORT || 9550;
const SITE = 'http://localhost:8888/gms/2d/clued/';
const CDP = join(homedir(), '.claude/bin/cdp');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) { pass++; console.log(`  ok   ${msg}`); } else { fail++; console.log(`  FAIL ${msg} ${extra}`); } };

class Page {
  constructor(name, port) { this.name = name; this.port = port; this.id = 0; this.cbs = new Map(); this.errs = []; }
  async open() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
    const t = list.find(x => x.type === 'page');
    this.ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && this.cbs.has(d.id)) { const { res, rej } = this.cbs.get(d.id); this.cbs.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method === 'Runtime.exceptionThrown') this.errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    };
    for (const m of ['Network.enable', 'Runtime.enable', 'Page.enable']) await this.send(m);
    await this.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.send('Emulation.setDeviceMetricsOverride', { width: 384, height: 854, deviceScaleFactor: 2, mobile: true });
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.cbs.set(id, { res, rej })); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  go(url) { return this.send('Page.navigate', { url }); }
  async waitFor(expr, ms = 15000, label = expr) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { const v = await this.eval(expr); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error(`${this.name}: timed out waiting for ${label}`);
  }
  async click(sel, ms = 15000) {
    const r = await this.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return b.width ? {x: b.x + b.width/2, y: b.y + b.height/2} : null; })()`, ms, sel);
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await sleep(120);
  }
  async type(sel, text) { await this.click(sel); await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ''; e.focus(); })()`); await this.send('Input.insertText', { text }); }
  async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, file), Buffer.from(r.data, 'base64')); }
  room() { return this.eval('window.__cluedRoom ? JSON.parse(JSON.stringify(window.__cluedRoom.st)) : null'); }
}

const ports = [BASE, BASE + 1, BASE + 2];
for (const p of ports) execFileSync(CDP, ['start', '--port', String(p), '--idle', '240', '--', '--disable-features=WebRtcHideLocalIpsWithMdns'], { stdio: 'ignore' });
const [host, ann, bob] = [new Page('host', ports[0]), new Page('ann', ports[1]), new Page('bob', ports[2])];
const all = [host, ann, bob];
for (const p of all) await p.open();
const q = JSON.stringify;

try {
  // 1. Settings: the chip edits the player's own setting
  await host.go(`${SITE}?test&noauth=1`); await host.waitFor('window.__cluedReady', 20000);
  await host.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ bgm: false })); true`);
  await host.go(`${SITE}?test&noauth=1`); await host.waitFor('window.__cluedReady', 20000); await sleep(400);
  await host.eval(`window.__cluedCtx.go('settings')`);
  await host.click('[data-set=local] [data-act=local]');
  await host.click('.pop [data-act=loc-country]');
  await host.type('.pop input[type=search]', 'Japan');
  await host.click('.pop .loc-list button[data-cc=JPN]');
  ok(await host.eval(`document.querySelector('.pop [data-loc=country]').textContent`) === 'Japan', 'editor: picked Japan');
  ok(await host.eval(`document.querySelector('.pop .chip.on')?.dataset.v`) === 'more', 'picking a country turns Off into More');
  ok(await host.eval(`document.querySelector('.pop [data-act=loc-live]').checked`) === (await host.eval(`(${q('JPN')}) === (window.__cluedLocal.places && (() => { try { return window.__cluedLocal.places.iso2[window.__cluedLocal.places.tz[Intl.DateTimeFormat().resolvedOptions().timeZone]]; } catch (e) { return null; } })())`)), '"I live here" is on only for the detected country');
  await host.click('.pop .chip[data-v=most]');
  await host.shot('local-editor.png');
  await host.click('.pop .btn.primary'); await sleep(300);
  const saved = await host.eval(`JSON.parse(localStorage.getItem('clued.settings')).local`);
  ok(saved?.level === 'most' && saved.cc === 'JPN', 'settings keep { level: most, cc: JPN }', q(saved));
  ok(await host.eval(`document.querySelector('[data-set=local] [data-act=local]').textContent.includes('Japan focus · Most')`), 'Settings chip reads "📍 Japan focus · Most"');

  // 2. Host screen (device room): rounds, warning, Keep / Change, total
  await host.eval(`import('./js/net/index.js?v=' + (window.__clued?.BUILD || 1)).then(() => window.__cluedCtx.go('online'))`);
  await host.click('[data-act=host-device]');
  await host.waitFor(`document.querySelector('.round-card[data-round="0"] .loc-line[data-local]')`, 20000, 'first round local line');
  ok(await host.eval(`document.querySelector('[data-act=local]').textContent.includes('Japan focus · Most')`), 'host chip shows the host setting');
  const first = await host.eval(`document.querySelector('.round-card[data-round="0"] .loc-line').textContent`);
  ok(/📍 6 of 10 local/.test(first), 'mc / All themes reaches 6 of 10', first);
  // a second round on Snakes (no Japanese snakes): add round → format mc → pick the Snakes pack
  await host.click('[data-act=add-round]');
  await host.click('.pop .tile[data-format=mc]');
  await host.waitFor(`document.querySelector('[data-act=save-round]')`);
  await host.click('.picker .theme-sum .btn');
  await host.eval(`document.querySelectorAll('.th').forEach(t => t.classList.add('open')); true`);
  await host.waitFor(`document.querySelector('.pk-loc[data-pack=countries][data-n]')`, 20000, 'picker counts');
  const cnt = await host.eval(`({ countries: +document.querySelector('.pk-loc[data-pack=countries]').dataset.n, snakes: +document.querySelector('.pk-loc[data-pack=snakes]').dataset.n })`);
  ok(cnt.countries > 0 && cnt.snakes === 0, 'picker: 📍 count on Countries, none on Snakes', q(cnt));
  await host.shot('local-picker.png');
  await host.eval(`[...document.querySelectorAll('.pk')].find(l => l.querySelector('.pk-loc[data-pack=snakes]')).querySelector('input').click(); true`);
  await host.click('[data-act=save-round]');
  await host.waitFor(`document.querySelector('.round-card[data-round="1"] .loc-line[data-local]')`, 20000, 'second round local line');
  const warn = await host.eval(`document.querySelector('.round-card[data-round="1"] .loc-line').textContent`);
  ok(/only 0 of 10 local: the rest will be normal questions/.test(warn), 'Snakes round warns "only 0 of 10 local"', warn);
  ok(await host.eval(`document.querySelector('.round-card[data-round="1"]').classList.contains('loc-short')`), 'the short round card is highlighted');
  await host.waitFor(`/📍 \\d+ of 20 local/.test(document.querySelector('[data-loc=total]').textContent)`, 15000, 'total');
  ok(true, `rounds total: ${await host.eval(`document.querySelector('[data-loc=total]').textContent`)}`);
  await host.shot('local-host-warning.png');
  await host.click('.round-card[data-round="1"] [data-act=loc-change]');
  ok(await host.waitFor(`document.querySelector('[data-act=save-round]') && document.body.textContent.includes('Round 2')`, 8000), 'Change round opens the round editor');
  await host.eval(`history.back(); true`);
  await host.waitFor(`document.body.dataset.screen === 'host' && document.querySelector('.round-card[data-round="1"] [data-act=loc-keep]')`, 15000, 'back on host');
  await sleep(800);
  await host.click('.round-card[data-round="1"] [data-act=loc-keep]');
  await sleep(300);
  await host.waitFor(`document.querySelector('.round-card[data-round="1"] .loc-line[data-local]')`, 15000);
  await host.shot('local-host-kept.png');
  ok(await host.eval(`!document.querySelector('.round-card[data-round="1"] [data-act=loc-keep]') && !document.querySelector('.round-card[data-round="1"]').classList.contains('loc-short')`), 'Keep clears the highlight (count still shown)');

  // 3. Create the room; everyone sees the focus; same questions for all
  await host.type('[data-field=name]', 'Hosty');
  await host.click('[data-act=create]');
  await host.waitFor(`document.querySelector('.net-code')?.textContent`, 60000, 'lobby code');
  const link = await host.eval(`document.querySelector('.net-link').textContent`);
  const st0 = await host.room();
  ok(st0.spec?.local?.cc === 'JPN' && st0.spec.local.level === 'most', 'room spec carries the focus', q(st0.spec?.local));
  for (const [p, name] of [[ann, 'Ann'], [bob, 'Bob']]) {
    await p.go(`http://${link}&noauth=1`);
    await p.waitFor(`document.querySelector('[data-field=name]')`, 40000, 'join form');
    await p.type('[data-field=name]', name);
    await p.click('[data-act=join]');
    await p.waitFor(`window.__cluedRoom?.st?.phase === 'lobby'`, 30000, 'lobby');
  }
  for (const p of all) ok(await p.eval(`document.querySelector('[data-badge=local]')?.textContent`) === '📍 Japan focus · Most', `${p.name}: lobby badge "📍 Japan focus · Most"`);
  await ann.shot('local-lobby-joiner.png');
  await host.click('[data-act=start]');
  const seen = [];
  for (let k = 0; k < 4; k++) {
    await host.waitFor(`window.__cluedRoom?.st?.phase === 'question' && window.__cluedRoom.st.q === ${k}`, 40000, `q${k}`);
    const prompts = [];
    for (const p of all) prompts.push(await p.waitFor(`window.__cluedRoom?.st?.q === ${k} && document.querySelector('.stage .q-prompt')?.textContent.replace('🔊', '').trim()`, 30000, `${p.name} prompt q${k}`));
    ok(prompts.every(x => x === prompts[0]), `q${k + 1}: all three see "${prompts[0].slice(0, 60)}"`);
    seen.push(prompts[0]);
    for (const p of all) { try { await p.click('.stage .choices .choice:not([disabled]), .stage button.choice', 4000); } catch (e) {} }
    await host.waitFor(`window.__cluedRoom.st.phase !== 'question' || window.__cluedRoom.st.q !== ${k}`, 40000, `end q${k}`);
  }
  await host.shot('local-question-host.png');
  ok(new Set(seen).size === seen.length, 'questions differ from each other');
  for (const p of all) ok(!p.errs.length, `${p.name}: no page exceptions`, p.errs.join(' | '));
} catch (e) {
  fail++;
  console.log('  FAIL', e.message);
  for (const p of all) await p.shot(`local-fail-${p.name}.png`).catch(() => {});
} finally {
  for (const p of ports) { try { execFileSync(CDP, ['stop', String(p)], { stdio: 'ignore' }); } catch (e) {} }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
