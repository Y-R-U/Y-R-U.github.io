// UI lane flow test: real taps/clicks over raw CDP against tools/ui.html.
//   node tools/ui_flow.mjs [--port=9601] [--shots=ui]   starts Chrome (metal), runs 3 viewports, stops it
//   node tools/ui_flow.mjs --keep                       leave Chrome running
// Screenshots: docs/shots/<shots>/flow-*.png
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const PORT = +arg('port', 9601);
const BASE = 'http://localhost:8888/gms/3d/krayzee/tools/ui.html';
const CDP = `${process.env.HOME}/.claude/bin/cdp`;
const SHOTS = fileURLToPath(new URL(`../docs/shots/${arg('shots', 'ui')}/`, import.meta.url));
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
    await ev('window.__flowStale = 1').catch(() => {}); // the old page answers the readiness poll until the new one commits
    await send('Page.navigate', { url: `${BASE}?${q}` });
    for (let i = 0; i < 60; i++) { await sleep(150); if (await ev('!window.__flowStale && !!(window.__ui && document.querySelector("#kz-ui"))').catch(() => false)) break; }
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
  ok(s.views.join() === 'chase,center,cockpit' && s.view === 'chase', 'D11 migration adds all three views', JSON.stringify(s.views));
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
  ok(s.quality === 'medium' && s.v === 3, 'Medium saves with v3', JSON.stringify(s));
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].quality === 'medium'`), 'onSettings gets medium');
  await tap('.kz-seg[data-k="quality"] [data-v="low"]');
  await tap('.kz-seg[data-k="quality"] [data-v="auto"]');
  ok((await ev('__ui.getSettings()')).quality === 'auto', 'back to Auto');
  await shot('quality');

  // 3b. D9/D10 switches.
  ok((await text('[data-say="invertPitch"]')) === 'Off: drag the stick down (towards you) to climb, like a real yoke', 'invert label states default', await text('[data-say="invertPitch"]'));
  await tap('.kz-switch[data-k="invertPitch"]');
  ok((await ev('__ui.getSettings()')).invertPitch === true && (await text('[data-say="invertPitch"]')) === 'On: drag the stick up (away from you) to climb', 'invert pitch on');
  await tap('.kz-switch[data-k="invertPitch"]');
  await tap('.kz-switch[data-k="stickRight"]');
  s = await store('krayzee.settings');
  ok(s.stickRight === true && !('hand' in s) && (await ev('__ui.getSettings()')).hand === 'right', 'Stick on right saves stickRight, hand derived', JSON.stringify(s));
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].hand === 'right'`), 'onSettings gets hand right');
  await tap('.kz-switch[data-k="stickRight"]');
  await shot('controls');

  // 3c. D11 views.
  const vs = () => ev('__ui.getSettings()').then((x) => `${x.views.join()}|${x.view}`);
  await tap('.kz-seg[data-k="view"] [data-v="center"]');
  ok((await vs()) === 'chase,center,cockpit|center', 'pick Centre view', await vs());
  await tap('.kz-switch[data-view="center"]');
  ok((await vs()) === 'chase,cockpit|chase', 'Centre off → current falls back to views[0]', await vs());
  ok(await ev(`document.querySelector('.kz-seg[data-k="view"] [data-v="center"]').hidden`), 'disabled view hidden from the view choice');
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].views.join() === 'chase,cockpit'`), 'onSettings gets views');
  await tap('.kz-switch[data-view="cockpit"]');
  ok((await vs()) === 'chase|chase' && await ev(`document.querySelector('.kz-switch[data-view="chase"]').disabled`), 'last view locked on');
  await shot('views-one');
  await ev(`document.querySelector('.kz-switch[data-view="chase"]').click()`);
  ok((await vs()) === 'chase|chase', 'cannot turn off the last view');
  await tap('.kz-switch[data-view="cockpit"]');
  await tap('.kz-switch[data-view="center"]');
  ok((await vs()) === 'chase,center,cockpit|chase', 'views stay in canonical order', await vs());
  ok((await store('krayzee.settings')).views.join() === 'chase,center,cockpit', 'views saved');
  await tap('.kz-settings .kz-foot .kz-btn.primary');
  ok(!(await ev(`document.querySelector('.kz-settings').classList.contains('on')`)), 'Done closes settings');

  // 4. A chosen low title stays after a reload (v2 'low' is a real choice).
  await tap('.kz-menu [data-a="settings"]');
  await tap('.kz-seg[data-k="quality"] [data-v="low"]');
  await go('state=menu&nocloud=1');
  ok((await ev('__ui.getSettings()')).quality === 'low', 'explicit Low survives reload');

  // 4b. Bad stored views are repaired on read.
  await ev(`localStorage.setItem('krayzee.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.settings')), views: ['cockpit'], view: 'chase' }))`);
  ok((await vs()) === 'cockpit|cockpit', 'view not in views → views[0]', await vs());
  await ev(`localStorage.setItem('krayzee.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.settings')), views: ['bogus'], view: 'cockpit' }))`);
  ok((await vs()) === 'chase,center,cockpit|cockpit', 'empty/invalid views → all three', await vs());

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

  // 12. Round 3 settings keys: defaults, switches, mischief, repair.
  await go('state=loading&reset&nocloud=1', 300);
  await go('state=settings&seed&nocloud=1');
  s = await ev('__ui.getSettings()');
  ok(s.hints === true && s.trafficMarkers === true && s.stallHorn === false && s.aiMischief === 'low' && s.difficulty === 'easy', 'r3 defaults: hints on, markers on, stall off, mischief low, easy', JSON.stringify(s));
  ok((await ev(`[...document.querySelectorAll('.kz-settings .kz-row > span')].map((n) => n.firstChild.textContent.trim()).join('|')`)).match(/Opportunity hints.*Traffic markers.*AI mischief.*Stall warning/), 'r3 settings rows present');
  ok(await ev(`document.querySelector('.kz-switch[data-k="stallHorn"]').getAttribute('aria-checked') === 'false' && document.querySelector('.kz-seg[data-k="aiMischief"] [data-v="low"]').getAttribute('aria-pressed') === 'true'`), 'stall off + Low pressed in the UI');
  await tap('.kz-switch[data-k="stallHorn"]');
  ok((await store('krayzee.settings')).stallHorn === true && await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].stallHorn === true`), 'Stall warning on saves + onSettings');
  await tap('.kz-seg[data-k="aiMischief"] [data-v="high"]');
  ok((await store('krayzee.settings')).aiMischief === 'high' && (await text('[data-say="aiMischief"]'))?.includes('badly behaved'), 'AI mischief High saves + label');
  await tap('.kz-seg[data-k="aiMischief"] [data-v="off"]');
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()[1].aiMischief === 'off'`), 'onSettings gets mischief off');
  await tap('.kz-switch[data-k="hints"]');
  await tap('.kz-switch[data-k="trafficMarkers"]');
  await tap('.kz-seg[data-k="difficulty"] [data-v="hard"]');
  s = await store('krayzee.settings');
  ok(s.hints === false && s.trafficMarkers === false && s.difficulty === 'hard', 'hints/markers off, Hard saved', JSON.stringify(s));
  await noOverflow('settings r3');
  await shot('settings-r3');
  await ev(`localStorage.setItem('krayzee.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.settings')), aiMischief: 'chaos', stallHorn: 'yes' }))`);
  s = await ev('__ui.getSettings()');
  ok(s.aiMischief === 'low' && s.stallHorn === false, 'bad mischief/stall values repaired', `${s.aiMischief}/${s.stallHorn}`);

  // 13. Favourite voices (profile.favourites, ≤ 3, ordered).
  await go('state=menu&seed&nocloud=1');
  await tap('.kz-menu [data-a="hangar"]');
  // roster names (data/voices.json) re-flow the cards when they land; tap after that
  for (let i = 0; i < 20 && (await text('.kz-voice[data-v="tex"] b')) === 'Tex'; i++) await sleep(150);
  await sleep(400);
  for (const v of ['bubba', 'nan', 'comte']) await tap(`.kz-star[data-star="${v}"]`);
  ok((await ev(`[...document.querySelectorAll('.kz-star[aria-pressed="true"]')].map((b) => b.dataset.star + b.textContent).join()`)) === 'bubba1,comte3,nan2', 'three stars numbered in order');
  ok(await ev(`document.querySelector('.kz-voice[data-v="toff"]').getAttribute('aria-checked') === 'true'`), 'starring does not change the voice');
  await tap('.kz-star[data-star="tex"]');
  ok(await ev(`document.querySelector('.kz-star[data-star="tex"]').getAttribute('aria-pressed') === 'false' && document.querySelector('[data-hint="fav"]').classList.contains('bad')`), 'fourth star refused with a hint');
  ok(await ev(`(__sounds || []).at(-1) === 'error'`), 'fourth star plays error');
  await shot('favourites');
  await noOverflow('hangar favourites');
  await tap('.kz-star[data-star="nan"]');
  await tap('.kz-star[data-star="tex"]');
  await tap('.kz-creator [data-act="save"]');
  ok((await store('krayzee.profile')).favourites?.join() === 'bubba,comte,tex', 'favourites saved in order', JSON.stringify((await store('krayzee.profile')).favourites));
  ok((await ev('__ui.getProfile().favourites.join()')) === 'bubba,comte,tex' && await ev(`__uiLog.filter((l) => l[0] === 'profile').pop()[1].favourites.join() === 'bubba,comte,tex'`), 'getProfile + onProfile carry favourites');
  ok((await ev(`import('../js/net/index.js').then((m) => m.helloFromProfile(__ui.getProfile()).voices.join())`)) === 'toff,bubba,comte', 'net hello sends voice + favourites (NET: chosen voice first, 3 max)');
  await tap('.kz-menu [data-a="hangar"]');
  await tap('.kz-star[data-star="bubba"]');
  await tap('.kz-creator [data-act="cancel"]');
  ok((await ev('__ui.getProfile().favourites.join()')) === 'bubba,comte,tex', 'Cancel discards star changes');
  await ev(`localStorage.setItem('krayzee.profile', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.profile')), favourites: ['nan', 'bogus', 'nan', 'laird', 'tex', 'toff'] }))`);
  ok((await ev('__ui.getProfile().favourites.join()')) === 'nan,laird,tex', 'stored favourites cleaned (valid, unique, ≤ 3)');

  // 14. Online button: SOON until GAMEPLAY says the endpoint is configured.
  ok(await ev(`!!document.querySelector('.kz-menu [data-a="online"] .kz-soon')`), 'Online shows SOON by default');
  await tap('.kz-menu [data-a="online"]');
  ok((await text('.kz-toast b')) === 'Online rooms' && !(await ev(`__uiLog.some((l) => l[0] === 'online')`)), 'SOON Online → toast, no hook');
  await go('state=menu&seed&online=1&nocloud=1');
  ok(await ev(`!document.querySelector('.kz-menu [data-a="online"] .kz-soon') && !document.querySelector('.kz-menu [data-a="online"]').classList.contains('soon')`), 'setOnlineAvailable(true) drops SOON');
  await shot('menu-online');
  await tap('.kz-menu [data-a="online"]');
  ok(await ev(`(window.__uiLog || []).filter((l) => l[0] === 'online').length === 1`), 'Online fires onOnline');
  let u = await ev('__ui.getUIState()');
  ok(u.lobby && u.state === 'menu' && await ev(`document.documentElement.classList.contains('kz-acct-off')`), 'lobby open: account hidden', JSON.stringify(u));
  await ev('__ui.showMenu()');
  ok(!(await ev('__ui.getUIState()')).lobby && !(await ev(`document.documentElement.classList.contains('kz-acct-off')`)), 'showMenu() after lobby → account back');
  await ev('__ui.setOnlineAvailable(false)');
  ok(await ev(`!!document.querySelector('.kz-menu [data-a="online"] .kz-soon')`), 'setOnlineAvailable(false) restores SOON');
  await go('state=loading&reset&nocloud=1', 300);
  await go('state=menu&online=1&nocloud=1', 200);
  await tap('.kz-menu [data-a="online"]');
  ok(await ev(`document.querySelector('.kz-creator').classList.contains('on') && !(window.__uiLog || []).some((l) => l[0] === 'online')`), 'no profile: Online opens the creator first');
  await tap('.kz-creator [data-act="random"]');
  await tap('.kz-creator [data-act="save"]');
  ok(await ev(`(window.__uiLog || []).filter((l) => l[0] === 'online').length === 1 && __ui.getUIState().lobby`), 'creator saved → onOnline fires');

  // 15. Story + intro hooks (GAMEPLAY no longer patches the menu at runtime).
  await go('state=menu&seed&nocloud=1');
  ok(await ev(`!!document.querySelector('.kz-menu [data-a="story"] .kz-soon') && document.querySelector('.kz-intro-link').hidden`), 'no onStory: Story SOON, no intro link');
  await tap('.kz-menu [data-a="story"]');
  ok((await text('.kz-toast b')) === 'Story mode' && (await ev('__ui.getUIState()')).state === 'menu', 'SOON Story → toast');
  await go('state=menu&seed&story=1&nocloud=1');
  ok(await ev(`!document.querySelector('.kz-menu [data-a="story"] .kz-soon') && !document.querySelector('.kz-menu [data-a="story"]').classList.contains('soon')`), 'onStory: Story live');
  ok(await ev(`(() => { const l = document.querySelector('.kz-intro-link'); const r = l.getBoundingClientRect(); return !l.hidden && r.height > 0 && r.bottom <= innerHeight; })()`), 'onIntro: intro link visible on screen');
  await shot('menu-story');
  await tap('.kz-menu [data-a="story"]');
  ok((await ev('__ui.getUIState()')).state === 'game' && await ev(`__uiLog.filter((l) => l[0] === 'story').length === 1 && !__uiLog.some((l) => l[0] === 'play')`), 'Story → enterGameplay + onStory (not onPlay)');
  ok(!(await ev(`document.querySelector('.kz-toast')?.classList.contains('on') && document.querySelector('.kz-toast b').textContent === 'Story mode'`)), 'no coming-soon toast');
  await ev('__ui.showMenu()');
  await tap('.kz-intro-link');
  ok((await ev('__ui.getUIState()')).state === 'game' && await ev(`__uiLog.filter((l) => l[0] === 'intro').length === 1`), 'Watch the intro → enterGameplay + onIntro');
  await go('state=loading&reset&nocloud=1', 300);
  await go('state=menu&story=1&nocloud=1', 200);
  await tap('.kz-menu [data-a="story"]');
  ok(await ev(`document.querySelector('.kz-creator').classList.contains('on') && !(window.__uiLog || []).some((l) => l[0] === "story")`), 'no profile: Story opens the creator first');
  ok(await ev(`document.querySelector('.kz-hangar').hidden`), 'first-run creator hides the aircraft picker');
  await tap('.kz-creator [data-act="random"]');
  await tap('.kz-creator [data-act="save"]');
  ok(await ev(`__uiLog.filter((l) => l[0] === 'story').length === 1 && __ui.getUIState().state === 'game'`), 'creator saved → onStory');
  ok((await store('krayzee.settings')) === null, 'first-run save writes no settings');

  // 16. Hangar aircraft picker: cards, unlocks (Moth = Earl, Bathtub = story), preview, saved as settings.aircraft.
  const cardState = () => ev(`[...document.querySelectorAll('.kz-plane')].map((c) => c.dataset.p + (c.classList.contains('locked') ? 'L' : '') + (c.getAttribute('aria-checked') === 'true' ? '*' : '')).join()`);
  const stageType = () => text('.kz-stage-type');
  await go('state=menu&seed&career=0&nocloud=1');
  ok((await ev('__ui.getSettings()')).aircraft === 'c172', 'default aircraft c172');
  await tap('.kz-menu [data-a="hangar"]');
  ok(!(await ev(`document.querySelector('.kz-hangar').hidden`)) && (await cardState()) === 'c172*,tigerL,bathtubL', 'Baron: Runabout picked, Moth + Bathtub locked', await cardState());
  ok((await text('.kz-plane[data-p="tiger"] .kz-lock'))?.includes('Reach Earl · 6,000 PP') && (await text('.kz-plane[data-p="bathtub"] .kz-lock'))?.includes('Finish the Story'), 'lock requirements shown');
  ok((await text('.kz-plane[data-p="tiger"] .kz-stats'))?.includes('80') && (await text('.kz-plane[data-p="c172"] .kz-ppx')) === 'PP ×1', 'stats + PP multiplier from data/aircraft.js', await text('.kz-plane[data-p="tiger"] .kz-stats'));
  for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('.kz-stage canvas') && !document.querySelector('.kz-stage-msg')`)); i++) await sleep(200);
  ok(await ev(`!!document.querySelector('.kz-stage canvas')`), 'live 3D preview mounted');
  await tap('.kz-plane[data-p="bathtub"]');
  ok((await cardState()) === 'c172*,tigerL,bathtubL' && await ev(`(__sounds || []).at(-1) === 'error'`), 'locked tap: selection kept, error sound');
  ok((await stageType())?.includes('Royal Flying Bathtub') && (await stageType())?.includes('Locked'), 'locked tap previews it, marked Locked', await stageType());
  ok((await text('[data-hint="plane"]'))?.startsWith('Just looking'), 'hint explains the lock', await text('[data-hint="plane"]'));
  await sleep(1500);
  await shot('hangar-locked');
  await noOverflow('hangar planes');
  await tap('.kz-creator [data-act="save"]');
  ok((await store('krayzee.settings')) === null || (await store('krayzee.settings')).aircraft !== 'bathtub', 'locked plane never saved');
  ok(!(await ev(`__ui.aircraftUnlocked('tiger')`)) && await ev(`__ui.aircraftUnlocked('c172')`), 'aircraftUnlocked API (Baron)');

  await go('state=menu&seed&career=6000&nocloud=1');
  await tap('.kz-menu [data-a="hangar"]');
  ok((await cardState()) === 'c172*,tiger,bathtubL', 'Earl: Moth unlocked', await cardState());
  await tap('.kz-plane[data-p="tiger"]');
  ok((await cardState()) === 'c172,tiger*,bathtubL' && (await stageType()) === "Grandfather's Moth", 'pick Moth', await cardState());
  for (let i = 0; i < 30 && !(await ev(`!!window.__ui`)); i++) await sleep(100);
  await sleep(1500);
  await shot('hangar-moth');
  await tap('.kz-creator [data-act="cancel"]');
  ok(((await store('krayzee.settings'))?.aircraft ?? 'c172') === 'c172', 'Cancel does not save the aircraft');
  await tap('.kz-menu [data-a="hangar"]');
  ok((await cardState()) === 'c172*,tiger,bathtubL', 'reopen after Cancel: Runabout again', await cardState());
  await tap('.kz-plane[data-p="tiger"]');
  await tap('.kz-creator [data-act="save"]');
  s = await store('krayzee.settings');
  ok(s?.aircraft === 'tiger' && (await ev('__ui.getSettings()')).aircraft === 'tiger', 'Save stores settings.aircraft = tiger', JSON.stringify(s));
  ok(await ev(`__uiLog.filter((l) => l[0] === 'settings').pop()?.[1].aircraft === 'tiger'`), 'onSettings fires with the aircraft');
  await go('state=menu&nocloud=1&career=6000');
  await tap('.kz-menu [data-a="hangar"]');
  ok((await cardState()) === 'c172,tiger*,bathtubL', 'saved Moth reopens selected', await cardState());
  await tap('.kz-creator [data-act="cancel"]');

  await go('state=menu&nocloud=1&career=6000,0,story');
  ok(await ev(`__ui.aircraftUnlocked('bathtub')`), 'story complete unlocks the Bathtub');
  await tap('.kz-menu [data-a="hangar"]');
  await tap('.kz-plane[data-p="bathtub"]');
  ok((await cardState()) === 'c172,tiger,bathtub*', 'pick Bathtub after the story', await cardState());
  await sleep(1500);
  await shot('hangar-bathtub');
  await tap('.kz-creator [data-act="save"]');
  ok((await ev('__ui.getSettings()')).aircraft === 'bathtub', 'Bathtub saved');
  await go('state=menu&nocloud=1&career=6000');
  ok(!(await ev(`__ui.aircraftUnlocked('bathtub')`)) && (await ev('__ui.getSettings()')).aircraft === 'bathtub', 'stored but locked type is reported (main falls back via aircraftUnlocked)');
  await tap('.kz-menu [data-a="hangar"]');
  ok((await cardState()) === 'c172*,tiger,bathtubL', 'locked stored type shows Runabout picked', await cardState());
  await tap('.kz-creator [data-act="cancel"]');
  await ev(`localStorage.setItem('krayzee.settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('krayzee.settings')), aircraft: 'jumbo' }))`);
  ok((await ev('__ui.getSettings()')).aircraft === 'c172', 'unknown stored aircraft repaired to c172');
  ok((await ev('__ui.getLivery()')).goldTaps === false, 'getLivery carries goldTaps (false below Emperor)');

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
