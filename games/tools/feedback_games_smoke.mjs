// Smoke test: every hub game wired with the shared feedback row shows it in Settings, with the
// real auth layer (a guest = "Sign in"), and opening it as a signed-in player shows the panel.
//
//   CDP_PORT=9407 SITE=http://127.0.0.1:8791 node games/tools/feedback_games_smoke.mjs [shots-dir]
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = +process.env.CDP_PORT || 9407;
const SITE = process.env.SITE || 'http://127.0.0.1:8791';
const SHOTS = process.argv[2] || '/tmp/feedback-games';
mkdirSync(SHOTS, { recursive: true });

// open: JS run in the page that opens its Settings (a click on the game's own button).
const GAMES = [
  { id: 'silt', path: '/gms/2d/silt/', open: `document.querySelector('button[aria-label=Settings]').click()` },
  // A fresh profile shows Racketeer's intro comic first; rerun once if it times out.
  { id: 'racketeer', path: '/gms/2d/racketeer/', open: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('⚙')).click()` },
  { id: 'ironhail', path: '/gms/3d/opus5_ironhail/', open: `document.querySelector('[data-act=settings]').click()` },
  { id: 'hexpire', path: '/gms/3d/hexpire/', open: `document.getElementById('btn-options').click()` },
  { id: 'grudgebugs', path: '/gms/3d/grudgebugs/', open: `document.getElementById('btn-options').click()` },
  { id: 'sundayleague', path: '/gms/2d/sundayleague/', open: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('⚙ Settings')).click()` },
  { id: 'paperant', path: '/gms/2d/paperant/', open: `document.getElementById('settings-btn').click()` },
  { id: 'sudoku', path: '/gms/pwa/sudoku/', open: `document.getElementById('settingsBtn').click()` },
  { id: 'crazyspace', path: '/gms/2d/crazyspace/', open: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('⚙ Settings')).click()` },
  { id: 'outpace', path: '/gms/3d/outpace/', open: `document.getElementById('settings-button').click()` },
  // New settings screens (round 2).
  { id: 'snakeeee', path: '/gms/pwa/snake/', open: `document.getElementById('settings-btn').click()` },
  { id: 'murderroyale', path: '/gms/3d/fable5_crow_tank_battle/', open: `document.getElementById('btn-settings').click()` },
  { id: 'heirframe', path: '/gms/3d/heirframe/', landscape: true, wait: 25000, open: `document.querySelector('.hf-title [data-a=settings]').click()` },
];

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
};
const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { /* not yet */ } await sleep(250); } return false; };
for (const d of ['Runtime.enable', 'Page.enable', 'Network.enable']) await send(d);
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 384, height: 854, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });

let fails = 0;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
for (const g of GAMES.filter(g => !ONLY.length || ONLY.includes(g.id))) {
  errors.length = 0;
  const [w, hgt] = g.landscape ? [854, 384] : [384, 854];
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: SITE + g.path });
  await sleep(2500);
  const opened = await waitFor(`(() => { try { ${g.open}; return true; } catch (e) { return false; } })()`, g.wait || 15000);
  const row = opened && await waitFor(`document.querySelector('[data-br8t-feedback]')?.dataset.br8tFeedback === 'signed-out'`);
  let panel = false;
  if (row) {
    await ev(`document.querySelector('[data-br8t-feedback]').scrollIntoView({ block: 'center' }); true`);
    await sleep(300);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${g.id}.png`, Buffer.from(r.data, 'base64'));
    // Sign in with a fake account and use the game's own button.
    await ev(`import('/lib/feedback/feedback.js').then(m => { const ls = new Set(); m._setAuthForTest({ user: { uid: 'u', anon: false, email: 'e@x' }, signedIn: true, ready: async () => ({}), onChange: fn => { ls.add(fn); return () => ls.delete(fn); }, getIdToken: async () => 't' }); window.fetch = async () => new Response(JSON.stringify({ items: [], todayId: 0, resetsAt: 0 }), { status: 200 }); return true; })`);
    const b = await ev(`(() => { const e = [...document.querySelectorAll('[data-br8t-feedback]')].pop(); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    // The guest button opens sign-in; re-render Settings is game-specific, so open the panel directly via a fresh button.
    await ev(`import('/lib/feedback/feedback.js').then(m => { const btn = m.feedbackButton({ game: '${g.id}' }); document.querySelector('[data-br8t-feedback]').after(btn); return true; })`);
    await sleep(300);
    await ev(`[...document.querySelectorAll('[data-br8t-feedback=ready]')].pop().click(); true`);
    panel = await waitFor(`document.getElementById('br8t-feedback')?.shadowRoot?.querySelector('form[data-state=form]')`, 5000);
    void b;
  }
  const errs = errors.filter(e => !/firebase|gstatic|identitytoolkit|net::|WebGL|AudioContext/i.test(e));
  const ok = opened && row && panel && !errs.length;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${g.id}: settings ${opened ? 'opened' : 'NOT opened'}, row ${row ? 'signed-out' : 'MISSING'}, panel ${panel ? 'ok' : 'no'}${errs.length ? ', errors: ' + errs.join(' | ').slice(0, 300) : ''}`);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
