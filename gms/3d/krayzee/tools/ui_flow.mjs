// UI lane flow test: real taps/clicks over raw CDP against tools/ui.html.
//   node tools/ui_flow.mjs            starts Chrome on :9441 (metal), runs 3 viewports, stops it
//   node tools/ui_flow.mjs --keep     leave Chrome running
// Screenshots: docs/shots/ui/flow-*.png
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = 9441;
const BASE = 'http://localhost:8888/gms/3d/krayzee/tools/ui.html';
const CDP = `${process.env.HOME}/.claude/bin/cdp`;
const SHOTS = fileURLToPath(new URL('../docs/shots/ui/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = [
  { name: '390x844', w: 390, h: 844, touch: true },
  { name: '844x390', w: 844, h: 390, touch: true },
  { name: '1280x800', w: 1280, h: 800, touch: false },
];

async function connect() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(), events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { const { res, rej } = wait.get(d.id); wait.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
    else if (d.method) events.push(d);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, events, close: () => { ws.close(); return fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}); } };
}

async function run(view) {
  const c = await connect();
  const { send } = c;
  const fails = [], passes = [];
  const ok = (cond, label, extra = '') => { (cond ? passes : fails).push(label + (cond || !extra ? '' : ` — ${extra}`)); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: view.touch ? 2 : 1, mobile: view.touch });
  await send('Emulation.setTouchEmulationEnabled', { enabled: view.touch, maxTouchPoints: view.touch ? 5 : 1 });
  const errors = [];
  c.events.push = function (d) {
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    return Array.prototype.push.call(this, d);
  };

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const go = async (q, settle = 900) => {
    await send('Page.navigate', { url: `${BASE}?${q}` });
    for (let i = 0; i < 60; i++) { await sleep(150); if (await ev('!!(window.__ui && document.querySelector("#kz-ui"))').catch(() => false)) break; }
    await sleep(settle);
  };
  const tap = async (sel) => {
    const r = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; })()`);
    if (!r || !r.w) throw new Error(`no element ${sel}`);
    await sleep(60);
    if (view.touch) {
      const tp = [{ x: r.x, y: r.y, id: 1 }];
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    }
    await sleep(350);
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}flow-${name}-${view.name}.png`, Buffer.from(data, 'base64'));
  };
  const store = (k) => ev(`JSON.parse(localStorage.getItem('${k}'))`);
  const noOverflow = async (label) => {
    const o = await ev(`(() => { const b = document.querySelector('.kz-pop.on .kz-body'); return { doc: document.documentElement.scrollWidth - innerWidth, body: b ? b.scrollWidth - b.clientWidth : 0 }; })()`);
    ok(o.doc <= 0 && o.body <= 0, `${label}: no horizontal overflow`, JSON.stringify(o));
  };
  const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);

  // 1. Round-1 save with the old 'high' default and no version → reads as Auto, nothing rewritten at boot.
  await go('state=loading&reset&nocloud=1', 300);
  await ev(`localStorage.setItem('krayzee.settings', JSON.stringify({ view: 'chase', quality: 'high', sfx: 0.5, voice: 1, music: 0.6, invertPitch: true, hand: 'right', units: 'aviation' }))`);
  await go('state=menu&seed&career=60000&nocloud=1');
  let s = await ev('__ui.getSettings()');
  ok(s.quality === 'auto', 'legacy high → auto', s.quality);
  ok(s.sfx === 0.5, 'other legacy settings kept');
  ok(s.invertPitch === false && s.stickRight === false && s.hand === 'left', 'D9/D10 migration: pitch not inverted, stick left', JSON.stringify(s));
  ok((await store('krayzee.settings')).v === undefined, 'migration does not write at boot');
  let p = await ev('__ui.getProfile()');
  ok(p.rank === 5 && p.title === 'Archduke' && p.flightTitle === 'Archduke', 'profile rank follows career (Archduke)', JSON.stringify(p));
  ok((await text('.kz-pilot-name'))?.includes('Archduke Dirk'), 'menu card shows career title', await text('.kz-pilot-name'));
  ok((await text('.kz-pilot-next em')) === '20,000 PP to Prince', 'menu card rank progress', await text('.kz-pilot-next em'));
  await shot('menu');

  // 2. Settings: peerage + title picker.
  await tap('.kz-menu [data-a="settings"]');
  ok(await ev(`document.querySelector('.kz-settings').classList.contains('on')`), 'settings opens from menu');
  ok((await text('.kz-rank-top b')) === 'Archduke' && (await text('.kz-rank-top span')) === '60,000 PP', 'peerage card', await text('.kz-rank'));
  ok((await text('.kz-throne'))?.includes('260,000 PP and 10 online wins'), 'throne requirement shown (D2)');
  const chips = await ev(`[...document.querySelectorAll('.kz-titles button')].map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : ''))`);
  ok(chips.length === 6 && chips[5] === 'Archdukehighest*', 'six unlocked titles, highest selected', JSON.stringify(chips));
  await noOverflow('settings');
  await shot('settings');
  await tap('.kz-titles [data-t="earl"]');
  let car = await store('krayzee.career');
  ok(car.selectedTitle === 'earl', 'pick Earl saves selectedTitle', car.selectedTitle);
  ok(await ev(`document.querySelector('.kz-titles [data-t="earl"]').getAttribute('aria-checked') === 'true'`), 'Earl chip checked');
  p = await ev('__ui.getProfile()');
  ok(p.flightTitle === 'Earl' && p.title === 'Archduke', 'Free Flight title = Earl, menu keeps rank before story (D3)', `${p.flightTitle}/${p.title}`);
  ok(await ev(`(__uiLog || []).some((l) => l[0] === 'profile' && l[1].flightTitle === 'Earl')`), 'onProfile fires with new title');
  ok(car.lifetimePP === 60000, 'picker save keeps lifetimePP');
  await tap('.kz-titles [data-t="archduke"]');
  ok((await store('krayzee.career')).selectedTitle === null, 'highest title = follow rank (null)');

  // 3. Quality (D6).
  ok(await ev(`document.querySelector('.kz-seg[data-k="quality"] [data-v="auto"]').getAttribute('aria-pressed') === 'true'`), 'Auto pressed by default');
  await tap('.kz-seg[data-k="quality"] [data-v="medium"]');
  s = await store('krayzee.settings');
  ok(s.quality === 'medium' && s.v === 2, 'Medium saves with v2', JSON.stringify(s));
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].quality === 'medium'`), 'onSettings gets medium');
  await tap('.kz-seg[data-k="quality"] [data-v="low"]');
  await tap('.kz-seg[data-k="quality"] [data-v="auto"]');
  ok((await ev('__ui.getSettings()')).quality === 'auto', 'back to Auto');
  await shot('quality');

  // 3b. D9/D10 switches.
  ok((await text('[data-say="invertPitch"]')) === 'Off: stick down = nose up', 'invert label states default', await text('[data-say="invertPitch"]'));
  await tap('.kz-switch[data-k="invertPitch"]');
  ok((await ev('__ui.getSettings()')).invertPitch === true && (await text('[data-say="invertPitch"]')) === 'On: stick down = nose down', 'invert pitch on');
  await tap('.kz-switch[data-k="invertPitch"]');
  await tap('.kz-switch[data-k="stickRight"]');
  s = await store('krayzee.settings');
  ok(s.stickRight === true && !('hand' in s) && (await ev('__ui.getSettings()')).hand === 'right', 'Stick on right saves stickRight, hand derived', JSON.stringify(s));
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].hand === 'right'`), 'onSettings gets hand right');
  await tap('.kz-switch[data-k="stickRight"]');
  await shot('controls');
  await tap('.kz-settings .kz-foot .kz-btn.primary');
  ok(!(await ev(`document.querySelector('.kz-settings').classList.contains('on')`)), 'Done closes settings');

  // 4. A chosen low title stays after a reload (v2 'low' is a real choice).
  await tap('.kz-menu [data-a="settings"]');
  await tap('.kz-seg[data-k="quality"] [data-v="low"]');
  await go('state=menu&nocloud=1');
  ok((await ev('__ui.getSettings()')).quality === 'low', 'explicit Low survives reload');

  // 5. Lady titles.
  await ev(`localStorage.setItem('krayzee.profile', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.profile')), gender: 'f' }))`);
  await go('state=settings&nocloud=1');
  const fchips = await ev(`[...document.querySelectorAll('.kz-titles button')].map((b) => b.firstChild.textContent)`);
  ok(fchips.join() === 'Baroness,Viscountess,Countess,Marchioness,Duchess,Archduchess', 'gender-correct titles', fchips.join());

  // 6. Locked picker.
  await go('state=settings&seed&career=0&nocloud=1');
  ok(await ev(`!!document.querySelector('.kz-titles .kz-note') && !document.querySelector('.kz-titles button')`), 'locked note, no chips at Baron');
  ok((await text('.kz-titles .kz-note'))?.includes('Earn Viscount (2,000 PP)'), 'locked note says when', await text('.kz-titles .kz-note'));
  await noOverflow('settings locked');
  await shot('locked');

  // 7. King parked on wins (D2).
  await go('state=settings&seed&career=200000,7&nocloud=1');
  ok((await text('.kz-rank p')) === '60,000 PP + 3 online wins to Emperor', 'King → Emperor needs PP + wins', await text('.kz-rank p'));
  ok(await ev(`!document.querySelector('.kz-pips').hidden && document.querySelectorAll('.kz-pips i.on').length === 7`), 'crown pips 7/10');
  await shot('king');
  await go('state=menu&seed&career=300000,4&nocloud=1');
  p = await ev('__ui.getProfile()');
  ok(p.rank === 8 && (await text('.kz-pilot-next em')) === '6 online wins to Emperor', 'past 260k PP still King until 10 wins', `${p.rank} ${await text('.kz-pilot-next em')}`);
  await go('state=menu&seed&career=300000,10&nocloud=1');
  ok((await ev('__ui.getProfile()')).title === 'Emperor' && (await text('.kz-pilot-next em')).includes('top of the peerage'), 'Emperor with 10 wins');

  // 8. Story complete: the chosen title shows on the menu too.
  await go('state=settings&seed&career=60000,0,story&nocloud=1');
  await tap('.kz-titles [data-t="viscount"]');
  await tap('.kz-settings .kz-x');
  ok((await text('.kz-pilot-name'))?.includes('Viscount Dirk'), 'story complete: menu shows chosen title', await text('.kz-pilot-name'));

  // 9. Lite link holds Low and does not persist it.
  await ev(`localStorage.setItem('krayzee.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.settings')), quality: 'high' }))`);
  await go('state=settings&seed&lite=1&nocloud=1');
  ok((await ev('__ui.getSettings()')).quality === 'low' && await ev(`document.querySelector('.kz-seg[data-k="quality"] button').disabled`), 'lite: Low, quality buttons disabled');
  await tap('.kz-seg[data-k="units"] [data-v="metric"]');
  ok((await store('krayzee.settings')).quality === 'high', 'lite does not persist Low');
  await tap('.kz-seg[data-k="units"] [data-v="aviation"]');

  // 10. Round-1 regression: play / pause / resume / quit, account visibility.
  await go('state=menu&seed&career=60000&nocloud=1');
  await tap('.kz-menu [data-a="free"]');
  ok((await ev('__ui.getUIState()')).state === 'game' && await ev(`document.documentElement.classList.contains('kz-acct-off')`), 'Free Flight → game, account hidden');
  await tap('#pause');
  ok(await ev(`!document.documentElement.classList.contains('kz-acct-off') && !!document.querySelector('.kz-settings.on .kz-titles button')`), 'pause shows settings + picker + account');
  await tap('.kz-settings .kz-foot .kz-btn.primary');
  ok(await ev(`__uiLog.some((l) => l[0] === 'resume')`), 'Resume fires onResume');
  await tap('#pause');
  await tap('.kz-settings .kz-foot .kz-btn.danger');
  ok((await ev('__ui.getUIState()')).state === 'menu' && await ev(`__uiLog.some((l) => l[0] === 'quit')`), 'Quit → menu');

  // 11. Cloud sync watches krayzee.career (desktop only; needs the account layer).
  if (!view.touch) {
    await go('state=menu&seed&career=60000', 3500);
    const before = await ev(`+localStorage.getItem('br8t_savedAt_krayzee') || 0`);
    await sleep(20);
    await ev(`localStorage.setItem('krayzee.career', localStorage.getItem('krayzee.career'))`);
    const after = await ev(`+localStorage.getItem('br8t_savedAt_krayzee') || 0`);
    ok(after > before, 'career write moves the cloud sync stamp', `${before} → ${after}`);
  }

  const real = errors.filter((e) => !/sample\.mp3|404|Failed to load resource/.test(e));
  ok(real.length === 0, 'no page errors', real.slice(0, 3).join(' | '));
  await c.close();
  return { view: view.name, passes, fails };
}

const keep = process.argv.includes('--keep');
try { execFileSync(CDP, ['start', '--port', String(PORT), '--', '--use-angle=metal'], { stdio: 'ignore' }); } catch (e) { /* may already run */ }
let bad = 0;
try {
  for (const v of VIEWS) {
    const r = await run(v);
    bad += r.fails.length;
    console.log(`${r.view}: ${r.passes.length}/${r.passes.length + r.fails.length} pass`);
    for (const f of r.fails) console.log(`  FAIL ${f}`);
  }
} finally {
  if (!keep) try { execFileSync(CDP, ['stop', String(PORT)], { stdio: 'ignore' }); } catch (e) { /* */ }
}
process.exit(bad ? 1 : 0);
