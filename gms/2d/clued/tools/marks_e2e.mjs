#!/usr/bin/env node
// Picture circles: draw one on review.html (touch, then mouse redraw, clear) against a fake admin API, then play a
// body-pack question whose picture carries a mark and check the ring sits on it, before and after the reveal.
// Needs: ~/.claude/bin/cdp start --port 9402 -- --use-angle=metal (CDP_PORT=9402) and the :8888 site server.
// Usage: node tools/marks_e2e.mjs [outDir]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './a_cdp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '/tmp';
const BASE = 'http://localhost:8888/gms/2d/clued/';
const SPLEEN = { cx: 0.706, cy: 0.783, rx: 0.13, ry: 0.085 }; // the yellow organ in the spleen picture
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

const b = await open({ port: 9402, width: 384, height: 854, mobile: true });
const reviews = new Map();
const posts = [];
let gamePack = null;
const AUTH = `export const auth = { ready: async () => {}, getIdToken: async () => 'tok', user: { email: 'admin@test' } };
export async function signInGoogle() {}`;
const b64 = s => Buffer.from(s).toString('base64');
b.on('Fetch.requestPaused', async ({ requestId, request }) => {
  const reply = (body, type = 'application/json') => b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: b64(body),
    responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
  if (request.url.includes('/lib/auth/auth.js')) return reply(AUTH, 'text/javascript');
  if (request.url.includes('/fakeapi/admin/imgreview')) {
    if (request.method === 'POST') {
      const items = JSON.parse(request.postData || '{}').items || [];
      posts.push(items);
      for (const it of items) if (it.verdict) reviews.set(it.ref, it); else reviews.delete(it.ref);
      return reply(JSON.stringify({ saved: items.length }));
    }
    return reply(JSON.stringify({ reviews: [...reviews.values()] }));
  }
  if (request.url.includes('/data/packs/body.json') && gamePack) return reply(gamePack);
  b.send('Fetch.continueRequest', { requestId }).catch(() => {});
});
await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/lib/auth/auth.js*' }, { urlPattern: '*/fakeapi/*' }, { urlPattern: '*/data/packs/body.json*' }] });

// image coordinates → client point on the spleen card's picture
const pt = (x, y) => b.eval(`(() => {
  const c = [...document.querySelectorAll('.rv-card')].find(c => c.querySelector('.rv-meta b')?.textContent === 'Spleen');
  const pic = c.querySelector('.rv-pic'), img = pic.querySelector('img'), r = pic.getBoundingClientRect();
  const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
  return { x: r.left + (r.width - w) / 2 + ${x} * w, y: r.top + (r.height - h) / 2 + ${y} * h };
})()`);
const corners = m => [pt(m.cx - m.rx, m.cy - m.ry), pt(m.cx + m.rx, m.cy + m.ry)];
async function touchDrag(m) {
  const [a, z] = await Promise.all(corners(m));
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 6; i++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (z.x - a.x) * i / 6, y: a.y + (z.y - a.y) * i / 6 }] }); await b.sleep(30); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await b.sleep(400);
}
async function mouseDrag(m) {
  const [a, z] = await Promise.all(corners(m));
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (z.x - a.x) * i / 6, y: a.y + (z.y - a.y) * i / 6, button: 'left', buttons: 1 }); await b.sleep(30); }
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: z.x, y: z.y, button: 'left', buttons: 0, clickCount: 1 });
  await b.sleep(400);
}
const close = (a, z, tol = 0.012) => !!a && ['cx', 'cy', 'rx', 'ry'].every(k => Math.abs(a[k] - z[k]) < tol);
const lastSpleen = () => posts.flat().filter(p => p.ref.startsWith('body/spleen/')).pop();
const cardSel = `[...document.querySelectorAll('.rv-card')].find(c => c.querySelector('.rv-meta b')?.textContent === 'Spleen')`;

// review page (phone width: compact 2-per-row grid by default)
await b.goto(`${BASE}review.html?api=http://localhost:8888/fakeapi`);
await b.waitFor(`document.querySelector('#rv-pack')`, 30000);
await b.eval(`localStorage.removeItem('clued.review.compact'); true`);
await b.goto(`${BASE}review.html?api=http://localhost:8888/fakeapi`);
await b.waitFor(`document.querySelectorAll('.rv-card').length > 2`, 30000);
await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = 'body'; s.dispatchEvent(new Event('change')); return true; })()`);
await b.sleep(300);
const twoUp = () => b.eval(`(() => { const c = [...document.querySelectorAll('.rv-card')]; return c.length > 1 && Math.abs(c[0].getBoundingClientRect().top - c[1].getBoundingClientRect().top) < 2; })()`);
const noOverflow = () => b.eval(`(() => {
  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W) return 'page scrolls sideways';
  for (const e of document.querySelectorAll('.rv-card, .rv-card button, .rv-bar > *')) { const r = e.getBoundingClientRect(); if (r.right > W + 0.5 || r.left < -0.5) return (e.className || e.tagName) + ' ' + r.right; }
  for (const c of document.querySelectorAll('.rv-card')) for (const e of c.querySelectorAll('button, .rv-meta b')) { if (!e.offsetParent) continue; const r = e.getBoundingClientRect(), cr = c.getBoundingClientRect(); if (r.right > cr.right + 0.5) return 'inside card: ' + e.textContent; }
  return '';
})()`);
ok(await b.eval(`document.querySelector('.rv-grid').classList.contains('compact')`) && await twoUp(), 'phone width opens 2 cards per row');
ok(await b.eval(`document.querySelector('#rv-lay').textContent`) === '▭ 1 per row', 'toggle offers 1 per row');
const tapH = await b.eval(`Math.min(...[...document.querySelectorAll('.rv-card .rv-acts:not(.rv-circ) button')].slice(0, 4).map(x => x.getBoundingClientRect().height))`);
ok(tapH >= 44, `OK/Bad buttons are at least 44px tall (${tapH})`);
ok(!(await noOverflow()), `nothing overflows at 384x854 ${await noOverflow()}`);
await b.shot(`${OUT}/review-compact-384.png`);
// Bad on a compact card unfolds the reasons
await b.eval(`document.querySelectorAll('.rv-card')[1].querySelector('.rv-acts .n').click(); true`);
await b.sleep(300);
ok(await b.eval(`!document.querySelectorAll('.rv-card')[1].querySelector('.rv-why').hidden`), 'Bad unfolds the reasons on a compact card');
ok(!(await noOverflow()), `reasons fit the compact card ${await noOverflow()}`);
await b.shot(`${OUT}/review-compact-bad.png`);
await b.eval(`document.querySelectorAll('.rv-card')[1].querySelector('.rv-acts .n').click(); true`); // clear it again
await b.sleep(300);
await b.viewport(430, 932); await b.sleep(400);
ok(await twoUp() && !(await noOverflow()), `430x932: 2 per row, nothing overflows ${await noOverflow()}`);
await b.shot(`${OUT}/review-compact-430.png`);
await b.viewport(384, 854);
await b.eval(`document.querySelector('#rv-lay').click(); true`);
await b.sleep(300);
ok(!(await twoUp()) && await b.eval(`localStorage.getItem('clued.review.compact')`) === '0', 'toggle switches to 1 per row and remembers it');
await b.goto(`${BASE}review.html?api=http://localhost:8888/fakeapi`);
await b.waitFor(`document.querySelectorAll('.rv-card').length > 1`, 30000);
ok(!(await b.eval(`document.querySelector('.rv-grid').classList.contains('compact')`)), '1 per row survives a reload');
await b.eval(`document.querySelector('#rv-lay').click(); true`); // back to compact for the circle checks
await b.sleep(300);
ok(await b.eval(`localStorage.getItem('clued.review.compact')`) === '1', 'back to 2 per row');
await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = 'body'; s.dispatchEvent(new Event('change')); return true; })()`);
await b.waitFor(`(${cardSel})?.scrollIntoView() ?? true`);
await b.waitFor(`${cardSel}.querySelector('img').naturalWidth > 0`, 20000);
await b.eval(`(() => { const c = ${cardSel}; [...c.querySelectorAll('.rv-draw')][0].click(); c.scrollIntoView({ block: 'start' }); return true; })()`);
await b.sleep(400);
ok(await b.eval(`${cardSel}.classList.contains('drawing')`), 'circle mode opens the card full width');
await touchDrag({ cx: 0.4, cy: 0.4, rx: 0.1, ry: 0.1 });
ok(close(lastSpleen()?.mark, { cx: 0.4, cy: 0.4, rx: 0.1, ry: 0.1 }) && lastSpleen()?.verdict === 'ok', `touch draw saved with verdict ok: ${JSON.stringify(lastSpleen())}`);
await mouseDrag(SPLEEN);
ok(close(lastSpleen()?.mark, SPLEEN), `mouse redraw replaces it: ${JSON.stringify(lastSpleen()?.mark)}`);
ok(await b.eval(`!${cardSel}.querySelector('.rv-ring').hidden`), 'ring shown on the card');
await b.shot(`${OUT}/marks-review-drawing.png`);
await b.eval(`(() => { const c = ${cardSel}; [...c.querySelectorAll('.rv-draw')][1].click(); return true; })()`);
await b.sleep(300);
ok(!lastSpleen()?.mark && lastSpleen()?.verdict === 'ok' && await b.eval(`${cardSel}.querySelector('.rv-ring').hidden`), 'clear removes the circle, keeps the verdict');
await touchDrag(SPLEEN);
await b.eval(`(() => { const c = ${cardSel}; [...c.querySelectorAll('.rv-draw')][0].click(); return true; })()`);
await b.sleep(300);
// a later reason/note edit must keep the circle
await b.eval(`(() => { const c = ${cardSel}; c.querySelector('.rv-acts .n').click(); return true; })()`);
await b.sleep(300);
ok(close(lastSpleen()?.mark, SPLEEN) && lastSpleen()?.verdict === 'bad', `verdict change keeps the circle: ${JSON.stringify(lastSpleen())}`);
await b.eval(`(() => { const c = ${cardSel}; c.querySelector('.rv-acts .y').click(); return true; })()`);
await b.sleep(300);
await b.eval(`(() => { [...document.querySelectorAll('.rv-seg button')].find(x => x.textContent === 'Circled').click(); return true; })()`);
await b.sleep(500);
ok(await b.eval(`document.querySelectorAll('.rv-card').length === 1 && !!${cardSel}`), 'Circled filter lists only the circled picture');
ok(await b.eval(`/1 circled/.test(document.querySelector('.rv-sum').textContent)`), 'summary counts circled');
await b.eval(`window.scrollTo(0, 0); true`);
await b.shot(`${OUT}/marks-review.png`);
const saved = reviews.get(lastSpleen().ref);

// game: serve the body pack with the saved circle on the spleen picture
const pack = JSON.parse(readFileSync(join(ROOT, 'data/packs/body.json'), 'utf8'));
const spleenImg = pack.items.find(i => i.id === 'spleen').media.img[0];
ok(saved.src === spleenImg.src, 'review ref is tied to the pack src');
spleenImg.mark = saved.mark;
pack.questions = [];
pack.items = pack.items.filter(i => ['spleen', 'heart', 'liver', 'kidneys', 'stomach', 'brain'].includes(i.id));
gamePack = JSON.stringify(pack);
await b.goto(`${BASE}?test`); await b.waitFor('window.__cluedReady', 30000);
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ bgm: false })); true`);
await b.goto(`${BASE}?test`); await b.waitFor('window.__cluedReady', 30000); await b.sleep(400);
const ringCheck = () => b.eval(`(() => {
  const fig = document.querySelector('.q-media'), img = fig?.querySelector('img'), ring = fig?.querySelector('.q-mark');
  if (!ring || ring.hidden || !img.naturalWidth) return null;
  const f = fig.getBoundingClientRect(), r = ring.getBoundingClientRect();
  const W = fig.clientWidth, H = fig.clientHeight, s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s, m = ${JSON.stringify(saved.mark)};
  const ex = f.left + fig.clientLeft + (W - w) / 2 + m.cx * w, ey = f.top + fig.clientTop + (H - h) / 2 + m.cy * h;
  return { dx: Math.abs(r.left + r.width / 2 - ex), dy: Math.abs(r.top + r.height / 2 - ey), w: r.width, ew: Math.max(24, 2 * m.rx * w), H };
})()`);
let found = false, sawImageGrid = false;
for (let round = 0; round < 12 && !found; round++) {
  await b.eval(`window.__clued.start({ structure: 'quick', format: 'mc', packs: ['body'], count: 6, timer: false, difficulty: 0 }); true`);
  for (let i = 0; i < 6; i++) {
    await b.waitFor(`window.__clued.state().q`, 15000); await b.sleep(700);
    const q = await b.eval(`(() => { const q = window.__clued.state().q; return { src: q.media?.img?.[0]?.src || '', grid: !!document.querySelector('.q-answers img') }; })()`);
    if (q.grid) { sawImageGrid = true; ok(!(await b.eval(`!!document.querySelector('.q-answers .q-mark')`)), 'no ring on picture answer options'); }
    if (q.src === spleenImg.src) {
      found = true;
      const before = await ringCheck();
      ok(before && before.dx < 1.5 && before.dy < 1.5 && Math.abs(before.w - before.ew) < 1.5, `ring on the spleen: ${JSON.stringify(before)}`);
      await b.shot(`${OUT}/marks-game.png`);
      await b.eval(`window.__clued.answer('correct'); true`); await b.sleep(900);
      const after = await ringCheck();
      ok(after && after.H < before.H && after.dx < 1.5 && after.dy < 1.5, `ring follows the reveal shrink: ${JSON.stringify(after)}`);
      await b.shot(`${OUT}/marks-game-reveal.png`);
      await b.viewport(854, 384, 2, true); await b.sleep(700);
      const land = await ringCheck();
      ok(land && land.dx < 1.5 && land.dy < 1.5, `ring follows a resize (landscape): ${JSON.stringify(land)}`);
      await b.shot(`${OUT}/marks-game-landscape.png`);
      await b.viewport(384, 854, 2, true);
      break;
    }
    if (await b.eval(`!!document.querySelector('.q-media') && !window.__clued.state().q.media?.img?.[0]?.mark`)) ok(!(await b.eval(`!!document.querySelector('.q-media .q-mark')`)), 'no ring on an unmarked picture');
    await b.eval(`window.__clued.answer('correct'); true`); await b.sleep(400);
    await b.eval(`window.__clued.next(); true`); await b.sleep(400);
  }
}
ok(found, 'a question showed the circled spleen picture');
console.log(sawImageGrid ? '(saw picture-option questions)' : '(no picture-option question this run)');
const errs = b.logs.filter(l => /\[(exception|error)\]/.test(l));
ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
