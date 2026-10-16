// E2E for /lib/feedback/feedback.js and its wiring in Clued and RAGDOJO, over raw CDP.
//
//   ~/.claude/bin/cdp start --port 9407 -- --use-angle=metal
//   (cd ~/cc/yru/site && python3 -m http.server 8791 --bind 127.0.0.1) &
//   CDP_PORT=9407 SITE=http://127.0.0.1:8791 node games/tools/feedback_e2e.mjs [shots-dir]
//
// Auth and the API are faked in the page (_setAuthForTest + a fetch stub), so nothing is sent
// anywhere. The game checks first run with the real auth layer (anonymous = signed out).
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = +process.env.CDP_PORT || 9407;
const SITE = process.env.SITE || 'http://127.0.0.1:8791';
const SHOTS = process.argv[2] || '/tmp/feedback-shots';
mkdirSync(SHOTS, { recursive: true });

async function open() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let page = list.find(t => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), logs = [], dialogs = [], csp = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === 'Log.entryAdded' && /Content.Security.Policy/i.test(m.params.entry.text)) { logs.push('[csp] ' + m.params.entry.text); csp.push(m.params.entry.text); }
    else if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); }
  };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const d of ['Runtime.enable', 'Page.enable', 'Network.enable', 'Log.enable']) await send(d);
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = {
    logs, dialogs, csp, sleep, send,
    async viewport(w, h, mobile) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    },
    async goto(u) { await send('Page.navigate', { url: u }); await sleep(500); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await api.eval(expr)) return true; } catch (e) { /* not yet */ } await sleep(150); }
      throw new Error('timeout waiting for ' + expr);
    },
    // A real mouse click at the centre of an element found by a JS expression (shadow roots allowed).
    async clickAt(findExpr) {
      const box = await api.eval(`(() => { const e = ${findExpr}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!box) throw new Error('no element for ' + findExpr);
      await sleep(80);
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(200);
    },
    async type(text) { await send('Input.insertText', { text }); await sleep(60); },
    async key(key, code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key }); await sleep(150); },
    async shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const p = `${SHOTS}/${name}.png`;
      writeFileSync(p, Buffer.from(r.data, 'base64'));
      return p;
    },
  };
  return api;
}

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const SR = `document.getElementById('br8t-feedback')?.shadowRoot`;
const q = sel => `${SR}?.querySelector(${JSON.stringify(sel)})`;

// Installed into the page: fake auth, fetch stub, dialog spies and a fake account fab.
const HARNESS = `(async () => {
  const m = await import('/lib/feedback/feedback.js');
  const ls = new Set();
  const fake = window.__fakeAuth = {
    user: { uid: 'anon1', anon: true }, get signedIn() { return !!this.user && !this.user.anon; },
    ready() { return Promise.resolve(this.user); },
    onChange(fn) { ls.add(fn); fn(this.user); return () => ls.delete(fn); },
    async getIdToken() { return this.signedIn ? 'tok-' + this.user.uid : null; },
    set(u) { this.user = u; ls.forEach(f => f(u)); },
  };
  m._setAuthForTest(fake);
  window.__fb = m;
  // A small in-page fake of the server's rules: one report per account per game per UTC day,
  // additions only to new/seen reports.
  window.__reqs = []; window.__mode = 'ok'; window.__hideToday = false;
  const db = window.__db = { reports: [], next: 1 };
  const OPEN = ['new', 'seen', 'need_info'];
  const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
  const json = (status, v) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.fetch = async (url, init = {}) => {
    if (!String(url).includes('/api/br8t/')) return real(url, init);
    const u = new URL(String(url), location.href), path = u.pathname.replace('/api/br8t/', '');
    const body = init.body ? JSON.parse(init.body) : null;
    const uid = (init.headers?.Authorization || '').replace('Bearer tok-', '');
    window.__reqs.push({ url: String(url), method: init.method || 'GET', auth: init.headers?.Authorization, body });
    if (window.__mode === 'net') throw new TypeError('Failed to fetch');
    if (window.__mode === '429') return json(429, { error: "you've added a lot today, thank you! Please try again tomorrow" });
    const mid = new Date(); mid.setUTCHours(24, 0, 0, 0);
    if (path === 'feedback/mine') {
      const items = db.reports.filter(r => r.uid === uid && r.game === u.searchParams.get('game')).sort((a, b) => b.id - a.id)
        .map(r => ({ ...r, canAdd: OPEN.includes(r.status), newReply: !!r.reply && r.replyAt > (r.seenReply || 0) }));
      const today = items.find(r => r.day === day() && r.canAdd);
      return json(200, { items: window.__hideToday ? items.filter(r => r !== today) : items, todayId: !window.__hideToday && today ? today.id : 0, day: day(), resetsAt: mid / 1000, perDay: 1 });
    }
    if (path === 'feedback/replies-seen') {
      for (const r of db.reports) if (r.uid === uid && r.game === body.game && r.reply) r.seenReply = Date.now() / 1000 | 0;
      return json(200, { ok: true });
    }
    if (path === 'feedback') {
      const dup = db.reports.find(r => r.uid === uid && r.game === body.game && r.day === day() && OPEN.includes(r.status));
      if (dup) return json(409, { error: "you've already sent a report for this game today. Add to it instead", id: dup.id });
      const r = { id: db.next++, uid, game: body.game, kind: body.kind, title: body.title, body: body.body, status: 'new', created: Date.now() / 1000 | 0, day: day(), updated: 0, additions: 0 };
      db.reports.push(r);
      return json(201, { ok: true, id: r.id });
    }
    const m = path.match(/^feedback\\/(\\d+)\\/add$/);
    if (m) {
      const r = db.reports.find(x => x.id === +m[1] && x.uid === uid);
      if (!r) return json(404, { error: 'not found' });
      if (!OPEN.includes(r.status)) return json(409, { error: "this report is closed, so it can't be added to. Send a new one instead" });
      r.body += '\\n\\n--- Added 2026-10-16 12:00 UTC ---\\n' + body.text; r.updated = Date.now() / 1000 | 0; r.additions++;
      return json(200, { ok: true, id: r.id, body: r.body, updated: r.updated });
    }
    return json(404, { error: 'not found' });
  };
  window.__dialogs = 0;
  for (const k of ['alert', 'confirm', 'prompt']) window[k] = () => { window.__dialogs++; };
  if (!document.getElementById('br8t-account')) {
    const host = document.createElement('div'); host.id = 'br8t-account';
    const root = host.attachShadow({ mode: 'open' }); const b = document.createElement('button'); b.className = 'fab';
    b.onclick = () => { window.__fabClicks = (window.__fabClicks || 0) + 1; }; root.append(b); document.body.append(host);
  } else {
    document.getElementById('br8t-account').shadowRoot.querySelector('.fab').addEventListener('click', () => { window.__fabClicks = (window.__fabClicks || 0) + 1; }, true);
  }
  return true;
})()`;

const t = await open();

/* ------------------------------------------------ the module on its own */
await t.viewport(384, 854, true);
await t.goto(`${SITE}/lib/feedback/?room=SECRET&oobCode=TOKEN#frag`);
await t.eval(`(() => { const m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1'; document.head.append(m); return true; })()`);
await t.eval(`document.body.style.cssText = 'background:#223;color:#ccd;font:16px system-ui;padding:20px'; document.body.innerHTML = '<h3>Game settings</h3><div id=row>Feedback: </div><p id=note></p>'; true`);
await t.eval(HARNESS);
await t.eval(`document.getElementById('row').append(window.__btn = __fb.feedbackButton({ game: 'clued', build: 'B123', note: document.getElementById('note') })); true`);
await t.waitFor(`__btn.dataset.br8tFeedback === 'signed-out'`);
ok(await t.eval(`__btn.textContent === 'Sign in to send feedback' && __btn.getAttribute('aria-disabled') === 'true'`), 'signed out: button reads "Sign in to send feedback" and is aria-disabled');
ok(await t.eval(`document.getElementById('note').textContent === 'You must be signed in to use this.'`), 'signed out: the note says sign-in is needed');
await t.clickAt(`__btn`);
ok(await t.eval(`window.__fabClicks === 1 && !document.getElementById('br8t-feedback')`), 'signed out: tapping opens the account panel, not the feedback panel');
await t.shot('01-signed-out-button-384');

await t.eval(`__fb.openFeedback({ game: 'clued', build: 'B123' }); true`);
await t.waitFor(`${q('[data-state=signed-out]')}`);
ok(true, 'openFeedback while signed out shows the sign-in message');
await t.shot('02-panel-signed-out-384');

await t.eval(`__fakeAuth.set({ uid: 'u1', anon: false, name: 'Tess Tester', email: 'tess@example.com' }); true`);
await t.waitFor(`${q('form[data-state=form]')}`);
ok(true, 'signing in swaps the open panel to the form');
await t.waitFor(`__btn.dataset.br8tFeedback === 'ready'`);
ok(await t.eval(`__btn.textContent === 'Send feedback' && __btn.getAttribute('aria-disabled') === 'false'`), 'signed in: the Settings button is enabled');

ok(await t.eval(`${q('[data-note=one-a-day]')}?.textContent.startsWith('One open report per game per day')`), 'the one-a-day rule is shown up front');

// Empty submit: inline message, nothing sent.
await t.clickAt(q('[data-act=send]'));
ok(await t.eval(`${q('.status')}.textContent.includes('title') && !__reqs.some(r => r.method === 'POST')`), 'empty form: inline "add a title" message, no request');

// Fill it in with real typing, pick Idea, send.
await t.clickAt(q('[data-kind=idea]'));
await t.clickAt(q('#fb-title'));
await t.type('More levels <b>please</b>');
await t.clickAt(q('#fb-body'));
await t.type('Line one\nLine two with <script>alert(1)</script>');
ok(await t.eval(`${q('[data-kind=idea]')}.getAttribute('aria-pressed') === 'true'`), 'Idea chip selected');
await t.shot('03-form-filled-384');
await t.clickAt(q('[data-act=send]'));
await t.waitFor(`${q('[data-state=sent]')}`);
const req = await t.eval(`__reqs.find(r => r.method === 'POST')`);
ok(req && req.url.endsWith('/api/br8t/feedback') && req.auth === 'Bearer tok-u1', 'POSTs to /api/br8t/feedback with the bearer token');
ok(req && !req.body.page.includes('?') && req.body.game === 'clued' && req.body.kind === 'idea' && req.body.title === 'More levels <b>please</b>' && req.body.body.includes('<script>') && req.body.build === 'B123' && /\d+x\d+@/.test(req.body.viewport) && req.body.page.startsWith(SITE), 'payload: game, kind, title, body, build, viewport, page');
ok(await t.eval(`!document.querySelector('script[src*=alert]') && __dialogs === 0`), 'player text never executed');
await t.shot('04-sent-384');

// Add more: today's report with an add box, never a second blank form.
await t.clickAt(q('[data-act=add-more]'));
await t.waitFor(`${q('[data-state=today]')}`);
ok(await t.eval(`!${q('form[data-state=form]')} && ${q('[data-note=one-a-day]')}.textContent.includes('A new one opens at')`), 'after sending: opens on today\'s report with the reset time, no new form');
ok(await t.eval(`${q('.today .rep-body')}.textContent.includes('<script>alert(1)</script>') && !${q('.today script')}`), 'today\'s report text is shown as text');
await t.clickAt(q('.today .add-text'));
await t.type('It also happens on level 4.');
await t.clickAt(q('.today [data-act=add]'));
await t.waitFor(`${q('.today .status.ok')}`);
ok(await t.eval(`${q('.today .rep-body')}.textContent.includes('--- Added') && ${q('.today .rep-body')}.textContent.endsWith('level 4.') && ${q('.today .add-text')}.value === ''`), 'Add more appends a timestamped addition, original kept');
ok(await t.eval(`__reqs.some(r => r.method === 'POST' && r.url.endsWith('feedback/1/add') && r.body.text === 'It also happens on level 4.')`), 'addition POSTs to feedback/{id}/add');
await t.shot('05-today-added-384');

// Add errors stay inline and keep the text.
await t.clickAt(q('.today .add-text'));
await t.type('one more thing');
await t.eval(`__mode = '429'; true`);
await t.clickAt(q('.today [data-act=add]'));
await t.waitFor(`${q('.today .status.err')}?.textContent.includes('tomorrow')`);
ok(await t.eval(`${q('.today .add-text')}.value === 'one more thing'`), 'add rate limit: inline error, text kept');
await t.eval(`__mode = 'ok'; true`);

// Earlier reports: listed with status, open ones expandable to add more, closed ones read-only.
await t.eval(`(() => { const y = Date.now() / 1000 - 86400 * 3 | 0;
  __db.reports.push({ id: 50, uid: 'u1', game: 'clued', kind: 'bug', title: 'Old <i>crash</i>', body: 'old body', status: 'done', created: y, day: '2026-10-01', updated: 0, additions: 0 });
  __db.reports.push({ id: 51, uid: 'u1', game: 'clued', kind: 'idea', title: 'Dark mode', body: 'please', status: 'seen', created: y + 60, day: '2026-10-02', updated: 0, additions: 0 });
  __db.reports.push({ id: 52, uid: 'someone-else', game: 'clued', kind: 'idea', title: 'Not yours', body: 'x', status: 'new', created: y, day: '2026-10-03', updated: 0, additions: 0 });
  __fb.closeFeedback(); __fb.openFeedback({ game: 'clued', build: 'B123' }); return true; })()`);
await t.waitFor(`${q('[data-list=earlier]')}`);
ok(await t.eval(`${SR}.querySelectorAll('[data-list=earlier] details').length === 2 && !${SR}.textContent.includes('Not yours')`), 'earlier reports: only this account\'s, for this game');
ok(await t.eval(`${q('[data-report="50"] .closed')} && !${q('[data-report="50"] .add-text')} && ${q('[data-report="50"] summary')}.textContent.includes('Done')`), 'a done report shows its status and cannot be added to');
await t.clickAt(q('[data-report="51"] summary'));
await t.clickAt(q('[data-report="51"] .add-text'));
await t.type('and a light theme');
await t.clickAt(q('[data-report="51"] [data-act=add]'));
await t.waitFor(`${q('[data-report="51"] .status.ok')}`);
ok(await t.eval(`__db.reports.find(r => r.id === 51).body.endsWith('and a light theme')`), 'an earlier open report can be added to');
await t.shot('06-earlier-reports-384');

// Another tab already sent today's: Send gets 409 and the text moves into the add box.
await t.eval(`__fb.closeFeedback(); __db.reports.push({ id: 60, uid: 'u1', game: 'g409', kind: 'bug', title: 'From the phone', body: 'b', status: 'new', created: Date.now() / 1000 | 0, day: new Date().toISOString().slice(0, 10), updated: 0, additions: 0 }); __hideToday = true; __fb.openFeedback({ game: 'g409' }); true`);
await t.waitFor(`${q('#fb-title')}`);
await t.clickAt(q('#fb-title')); await t.type('Crash in round 3');
await t.clickAt(q('#fb-body')); await t.type('The screen froze.');
await t.eval(`__hideToday = false; true`);
await t.clickAt(q('[data-act=send]'));
await t.waitFor(`${q('[data-state=today]')}`);
ok(await t.eval(`${q('.today .add-text')}.value.includes('Crash in round 3') && ${q('.today .status')}.textContent.includes('already sent one today')`), '409: opens today\'s report with the text ready to add');

// Network failure on a fresh game: inline, text kept.
await t.eval(`__fb.closeFeedback(); __fb.openFeedback({ game: 'netgame' }); true`);
await t.waitFor(`${q('#fb-title')}`);
await t.clickAt(q('#fb-title')); await t.type('Crash in round 3');
await t.clickAt(q('#fb-body')); await t.type('The screen froze.');
await t.eval(`__mode = 'net'; true`);
await t.clickAt(q('[data-act=send]'));
await t.waitFor(`${q('.status.err')}?.textContent.includes('reach the server')`);
ok(await t.eval(`${q('#fb-title')}.value === 'Crash in round 3' && !${q('[data-act=send]')}.disabled`), 'network failure: inline error, text kept, Send re-enabled');
await t.shot('07-error-net-384');
await t.eval(`__mode = 'ok'; true`);

// Non-blocking: no scrim, the page above the sheet still takes taps.
ok(await t.eval(`(() => { const e = document.elementFromPoint(20, 30); return !!e && !e.closest('#br8t-feedback'); })()`), 'no scrim: page outside the sheet is still hit-testable');
ok(await t.eval(`__dialogs === 0`) && t.dialogs.length === 0, 'no alert/confirm/prompt at any point');

// Escape closes; the draft survives a reopen.
await t.key('Escape');
ok(await t.eval(`!document.getElementById('br8t-feedback')`), 'Escape closes the panel');
await t.eval(`__fb.openFeedback({ game: 'netgame' }); true`);
await t.waitFor(`${q('#fb-title')}`);
ok(await t.eval(`${q('#fb-title')}.value === 'Crash in round 3'`), 'draft kept after closing and reopening');
await t.clickAt(q('[data-act=close]'));
ok(await t.eval(`!document.getElementById('br8t-feedback')`), '× closes the panel');

// Game keys: typing in the form must not reach window keydown listeners.
await t.eval(`window.__keys = 0; addEventListener('keydown', () => window.__keys++); __fb.openFeedback({ game: 'netgame' }); true`);
await t.waitFor(`${q('#fb-title')}`);
await t.clickAt(q('#fb-body'));
await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', text: 'a' });
await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a' });
await t.sleep(100);
ok(await t.eval(`window.__keys === 0`), 'keys typed in the form do not reach the game');

// Round 2: a public reply shows with a "new reply" dot once, then the dot is cleared.
await t.eval(`(() => { const r = __db.reports.find(x => x.id === 51); r.reply = 'Thanks! Dark mode is <b>planned</b>.'; r.replyAt = Date.now() / 1000 - 3600 | 0; r.status = 'planned'; __fb.closeFeedback(); __fb.openFeedback({ game: 'clued' }); return true; })()`);
await t.waitFor(`${q('[data-reply="51"]')}`);
ok(await t.eval(`${q('[data-report="51"]')}.open && !!${q('[data-report="51"] summary .dot')} && !!${q('[data-reply="51"] .dot')}`), 'new public reply: the report opens itself with a red dot');
ok(await t.eval(`${q('[data-reply="51"] .reply-body')}.textContent === 'Thanks! Dark mode is <b>planned</b>.' && ${q('[data-reply="51"]')}.textContent.includes('Reply from the developer') && !${q('[data-reply="51"] b b')}`), 'the reply is shown as text under "Reply from the developer"');
ok(await t.eval(`${q('[data-report="51"] .closed')}?.textContent.startsWith('Planned') && !${q('[data-report="51"] .add-text')} && ${q('[data-report="51"] summary')}.textContent.includes('Planned')`), 'planned: friendly read-only status, locked for additions');
await t.waitFor(`__reqs.some(r => r.url.endsWith('feedback/replies-seen') && r.body.game === 'clued')`);
ok(true, 'the panel tells the server the reply has been seen');
await t.sleep(400); await t.shot('06b-public-reply-384');
await t.eval(`__fb.closeFeedback(); __fb.openFeedback({ game: 'clued' }); true`);
await t.waitFor(`${q('[data-reply="51"]')}`);
ok(await t.eval(`!${q('.dot')}`), 'next open: no dot');

// need info stays open and asks for more; a locked report today frees the day for a new one.
await t.eval(`(() => { __db.reports.find(x => x.id === 1).status = 'need_info'; __fb.closeFeedback(); __fb.openFeedback({ game: 'clued' }); return true; })()`);
await t.waitFor(`${q('[data-state=today]')}`);
ok(await t.eval(`${q('.today .closed.need')}?.textContent.includes('needs a bit more') && !!${q('.today .add-text')} && ${q('.today .pill')}.textContent === 'Needs more info'`), 'need info: today\'s report asks for more and stays open');
await t.eval(`(() => { __db.reports.find(x => x.id === 1).status = 'in_progress'; __fb.closeFeedback(); __fb.openFeedback({ game: 'clued' }); return true; })()`);
await t.waitFor(`${q('form[data-state=form]')}`);
ok(await t.eval(`${SR}.querySelector('[data-report="1"] .closed')?.textContent.startsWith('Being worked on') && ${SR}.querySelector('[data-report="1"] .rep-meta').textContent.includes('Today')`), 'in progress today: locked, listed as Today, and a new report can be started');
await t.eval(`(() => { __db.reports.find(x => x.id === 1).status = 'seen'; return true; })()`);

// Layouts, on the busiest view: today's report plus earlier ones.
await t.eval(`__fb.closeFeedback(); __fb.openFeedback({ game: 'clued' }); true`);
await t.waitFor(`${q('[data-state=today]')}`);
await t.shot('07b-today-and-earlier-384');
await t.viewport(854, 384, true); await t.sleep(400);
ok(await t.eval(`(() => { const r = ${q('.sheet')}.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; })()`), 'phone landscape: the sheet fits on screen');
await t.shot('08-landscape-854x384');
await t.viewport(1280, 800, false); await t.sleep(400);
ok(await t.eval(`(() => { const r = ${q('.sheet')}.getBoundingClientRect(); return r.width <= 421 && r.right <= innerWidth && r.bottom <= innerHeight; })()`), 'desktop: a 420px card in the corner');
await t.shot('09-desktop-1280');
await t.eval(`__fb.closeFeedback(); true`);

/* ------------------------------------------------ Clued's Settings */
await t.viewport(384, 854, true);
await t.goto(`${SITE}/gms/2d/clued/`);
await t.waitFor(`window.__cluedReady`, 30000);
await t.eval(`import('/gms/2d/clued/js/ui/app.js').then(m => { m.go('settings'); return true; })`);
await t.waitFor(`document.querySelector('[data-set=feedback] [data-br8t-feedback]')?.dataset.br8tFeedback === 'signed-out'`, 20000);
ok(await t.eval(`(() => { const b = document.querySelector('[data-set=feedback] button'); return b.textContent === 'Sign in' && b.classList.contains('btn'); })()`), 'Clued Settings: real auth, guest -> "Sign in" button in the game\'s style');
await t.eval(`document.querySelector('[data-set=feedback]').scrollIntoView({ block: 'center' }); true`);
await t.shot('10-clued-settings-signed-out');
await t.eval(HARNESS);
await t.eval(`import('/gms/2d/clued/js/ui/app.js').then(m => { m.go('home'); m.go('settings'); return true; })`);
await t.eval(`__fakeAuth.set({ uid: 'u2', anon: false, email: 'p@example.com' }); true`);
await t.waitFor(`document.querySelector('[data-set=feedback] [data-br8t-feedback]')?.dataset.br8tFeedback === 'ready'`);
await t.clickAt(`document.querySelector('[data-set=feedback] button')`);
await t.waitFor(`${q('form[data-state=form]')}`);
ok(true, 'Clued Settings: signed in, the button opens the panel');
await t.shot('11-clued-panel');
await t.eval(`__fb.closeFeedback(); true`);

/* ------------------------------------------------ RAGDOJO's Settings */
await t.viewport(854, 384, true);
await t.goto(`${SITE}/gms/2d/ragdojo/`);
await t.waitFor(`document.getElementById('btnSettings') && getComputedStyle(document.getElementById('btnSettings')).display !== 'none'`, 30000);
await t.sleep(1500);
await t.eval(`document.getElementById('btnSettings').click(); true`);
await t.waitFor(`document.querySelector('#fbRow button')?.dataset.br8tFeedback === 'signed-out'`, 20000);
ok(await t.eval(`document.querySelector('#fbRow button').textContent === 'SIGN IN' && document.getElementById('fbNote').textContent.includes('signed in')`), 'RAGDOJO Settings: guest -> SIGN IN + "must be signed in" note');
await t.eval(`document.getElementById('fbRow').scrollIntoView({ block: 'center' }); true`);
await t.shot('12-ragdojo-settings-signed-out');
await t.eval(HARNESS);
await t.eval(`document.getElementById('btnSetClose').click(); document.getElementById('btnSettings').click(); true`);
await t.eval(`__fakeAuth.set({ uid: 'u3', anon: false, email: 'r@example.com' }); true`);
await t.waitFor(`document.querySelector('#fbRow button')?.dataset.br8tFeedback === 'ready'`);
await t.clickAt(`document.querySelector('#fbRow button')`);
await t.waitFor(`${q('form[data-state=form]')}`);
ok(await t.eval(`document.getElementById('settings').classList.contains('show')`), 'RAGDOJO: the panel opens over Settings without dismissing it');
await t.shot('13-ragdojo-panel-landscape');
await t.clickAt(q('[data-act=close]'));

/* ------------------------------------------------ the admin page (API stubbed) */
await t.viewport(1280, 800, false);
t.csp.length = 0; // Log.enable replays entries from earlier pages
await t.goto(`${SITE}/lib/feedback/admin.html`);
await t.waitFor(`document.getElementById('gate').textContent.includes('Sign in')`, 20000);
ok(true, 'admin page: a guest sees the sign-in gate');
ok(await t.eval(`import('/lib/auth/auth.js').then(m => m.auth.ready()).then(u => !!(u && u.uid))`) && t.csp.length === 0, 'admin page under its CSP: Firebase loads and signs in (anonymous), no CSP violations' + (t.csp.length ? ': ' + t.csp.join(' | ') : ''));
await t.eval(`(async () => {
  const { auth } = await import('/lib/auth/auth.js');
  auth.getIdToken = async () => 'tok-admin';
  window.__posts = [];
  const evil = '<img src=x onerror="window.__pwned=1">';
  const row = { id: 3, created: 1800000000, uid: 'u1', email: 'p@example.com', name: evil, game: 'clued', kind: 'bug', title: evil + ' title', body: 'line1\\nline2 ' + evil, page: 'https://games.br8t.com/gms/2d/clued/', build: 'B1', ua: 'UA', viewport: '384x854@3 portrait', status: 'seen', note: '', updated: 1800000000, additions: 2, playerUpdated: 1800000600, seenAt: 1800000300, updatedSinceSeen: true };
  window.fetch = async (url, init = {}) => {
    if (init.method === 'POST') { const b = JSON.parse(init.body); window.__posts.push({ url, b }); Object.assign(row, b); if ('reply' in b) row.replyAt = Date.now() / 1000 | 0; if (b.seen || b.status) row.updatedSinceSeen = false; delete row.seen; return new Response(JSON.stringify(row), { status: 200 }); }
    return new Response(JSON.stringify({ items: [row], next: 0, counts: { new: 1, seen: 0, planned: 0, done: 0, wontfix: 0 }, games: ['clued'] }), { status: 200 });
  };
  await window.__fbAdmin.load();
  return true;
})()`);
await t.waitFor(`document.querySelector('#list .item')`);
ok(await t.eval(`document.querySelector('#list .item .tag.upd')?.textContent === 'added to'`), 'admin page: "added to since seen" is flagged in the list');
await t.clickAt(`document.querySelector('#list .item')`);
await t.waitFor(`document.querySelector('#detail .text')`);
await t.sleep(300);
ok(await t.eval(`!window.__pwned && !document.querySelector('#app img') && document.querySelector('#detail .text').textContent.includes('<img')`), 'admin page: player text shown as text, never HTML');
ok(await t.eval(`__posts.some(p => p.url.endsWith('/admin/feedback/3') && p.b.seen === true) && __posts.length === 1`), 'admin page: opening a report added to since seen marks it seen again, once');
await t.clickAt(`[...document.querySelectorAll('#detail button')].find(b => b.textContent === 'planned')`);
await t.eval(`(() => { const n = document.querySelectorAll('#detail textarea')[1]; n.value = 'fix in next build'; n.dispatchEvent(new Event('input')); return true; })()`);
await t.clickAt(`[...document.querySelectorAll('#detail button')].find(b => b.textContent === 'Save note')`);
ok(await t.eval(`__posts.some(p => p.b.status === 'planned') && __posts.some(p => p.b.note === 'fix in next build')`), 'admin page: status and note are saved');
await t.eval(`(() => { const r = document.querySelectorAll('#detail textarea')[0]; r.value = 'Thanks, fixed in build 43!'; r.dispatchEvent(new Event('input')); return true; })()`);
await t.clickAt(`document.querySelector('#detail [data-status=need_info]')`);
ok(await t.eval(`document.querySelectorAll('#detail textarea')[0].value === 'Thanks, fixed in build 43!' && __posts.some(p => p.b.status === 'need_info')`), 'admin page: new statuses; an unsaved reply survives a status change');
await t.clickAt(`document.querySelector('#detail [data-act=save-reply]')`);
ok(await t.eval(`__posts.some(p => p.b.reply === 'Thanks, fixed in build 43!') && document.querySelector('#detail').textContent.includes('not seen by the player yet')`), 'admin page: the public reply is saved and its seen state shown');
await t.eval(`(() => { window.__clip = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async v => { window.__clip = v; } }, configurable: true }); document.getElementById('copy').click(); return true; })()`);
await t.waitFor(`window.__clip`);
ok(await t.eval(`__clip.startsWith('untrusted player text:\\n') && !__clip.includes('p@example.com') && !__clip.includes('"uid"') && !__clip.includes('"name"') && __clip.includes('"body"')`), 'Copy as JSON: header line, no email/uid/name');
ok(t.csp.length === 0, 'no CSP violations while using the admin page');
await t.shot('14-admin-desktop');
await t.viewport(384, 854, true); await t.sleep(300);
await t.shot('15-admin-phone');

const errs = t.logs.filter(l => !/firebase|gstatic|identitytoolkit|ERR_|net::/i.test(l));
ok(errs.length === 0, 'no page exceptions' + (errs.length ? ': ' + errs.join(' | ') : ''));
console.log(`\n${failures ? failures + ' FAILED' : 'all passed'} — screenshots in ${SHOTS}`);
process.exit(failures ? 1 : 0);
