#!/usr/bin/env node
// Lane L end-to-end: real clicks through every Learn screen. Needs `~/.claude/bin/cdp start --port 9404` and :8888.
// Usage: node tools/l_e2e.mjs [outDir] [portrait|landscape|desktop] [scenario,...]
import { open } from './a_cdp.mjs';

const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
const VP = { portrait: [384, 854, true], landscape: [854, 384, true], desktop: [1280, 800, false] }[MODE];
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ port: 9404, width: VP[0], height: VP[1], mobile: VP[2] });
let fails = 0;
if (process.env.DEBUG) for (const k of ['click', 'eval', 'goto', 'shot']) { const f = b[k]; b[k] = (...a) => { console.log('·', k, String(a[0]).slice(0, 90)); return f(...a); }; }
const keepAlive = setInterval(() => {}, 1000);
const log = (...a) => console.log(`[${MODE}]`, ...a);
const scr = () => b.eval('document.body.dataset.screen');
const shot = async name => {
  const bad = await b.eval(`(document.querySelector('.screen:not(.leaving)')?.innerText || '').match(/\\b(null|undefined|NaN)\\b|\\[object/)?.[0] || ''`);
  if (bad) throw new Error(`"${bad}" rendered on ${name}`);
  // headless desktop sometimes stalls captureScreenshot until the tab is re-fronted
  for (let k = 0; k < 3; k++) {
    await b.send('Page.bringToFront');
    const r = await Promise.race([b.shot(`${OUT}/${MODE}-${name}.png`), b.sleep(8000).then(() => null)]);
    if (r) return r;
  }
  throw new Error('screenshot timed out: ' + name);
};
const until = (expr, ms) => b.waitFor(expr, ms);
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && e.getClientRects().length && !e.disabled); })()`;
const n = sel => b.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const visN = sel => b.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => !e.hidden && e.getClientRects().length).length`);
const expect = (c, msg) => { if (!c) throw new Error(msg); };

async function fresh(settings = {}, extra = {}) {
  await b.goto(URL);
  await until('window.__cluedReady');
  await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify(${JSON.stringify(settings)}));
    ${Object.entries(extra).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join('')} true`);
  await b.goto(URL);
  await until('window.__cluedReady');
  await b.sleep(300);
}
async function openLearn() {
  await b.click('[data-mode=learn]');
  await until('document.body.dataset.screen === "learn" && !!document.querySelector(".l-hub")');
  await b.sleep(250);
}
const imgsSettled = (ms = 6000) => until(`[...document.querySelectorAll('.screen:not(.leaving) img')].filter(i => i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0).every(i => i.complete)`, ms).catch(() => {});

const scenarios = {
  async hub() {
    await fresh();
    await openLearn();
    expect(await n('.l-tile') === 6, 'six tools');
    await shot('hub');
  },

  async guide() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-guide]');
    await until(vis('.l-pk'));
    await shot('guide-home');
    await b.click('.l-pk[data-pack=snakes]');
    await until(vis('.l-cell'), 15000);
    await imgsSettled();
    const total = await visN('.l-cell');
    expect(total > 20, 'snakes grid has cells: ' + total);
    expect(await n('.l-notice') >= 1, 'notice banner on snakes');
    await shot('grid-snakes');
    await b.click('.l-fbtn');
    await b.sleep(200);
    await shot('grid-filters');
    // first chip of the first filter row (Venomous: yes)
    await b.click('.l-frow .chip');
    await b.sleep(200);
    const venom = await visN('.l-cell');
    expect(venom > 0 && venom < total, `bool filter narrows (${venom}/${total})`);
    const allVen = await b.eval(`(async () => { const p = await window.__cluedCtx.packs.loadPack('snakes'); const vis = [...document.querySelectorAll('.l-cell')].filter(c => !c.hidden).map(c => c.dataset.ref.split('/')[1]); return vis.every(id => p.items.find(i => i.id === id).facts.venomous === true); })()`);
    expect(allVen, 'every shown snake is venomous');
    await b.click('.l-fbtn');
    await b.eval(`(() => { const s = document.querySelector('.l-search'); s.value = 'taipan'; s.dispatchEvent(new Event('input')); })()`);
    await b.sleep(400);
    const tp = await visN('.l-cell');
    expect(tp >= 1 && tp <= 4, 'search taipan: ' + tp);
    await b.click('.l-cell:not([hidden])');
    await until('document.body.dataset.screen === "l-item"');
    await until(vis('.l-item-title h2'));
    await imgsSettled();
    await shot('item');
    expect(await n('.l-facts tr') >= 3, 'facts table');
    expect(await n('.l-notice') === 1, 'item notice');
    await b.click('.l-info');
    await until(vis('.pop .credit'));
    await shot('item-credits');
    await b.click('.pop-actions .btn');
    await b.sleep(300);
    await b.click('[data-act=deck]');
    expect(await b.eval(`!!JSON.parse(localStorage.getItem('clued.cards')).cards[${JSON.stringify('snakes/inland-taipan')}] || Object.keys(JSON.parse(localStorage.getItem('clued.cards')).cards).length === 1`), 'card added');
    if (await b.eval(vis('.l-cmpbtn'))) {
      await b.click('.l-cmpbtn');
      await until('document.body.dataset.screen === "l-look"');
      await until(vis('.l-diff'));
      await imgsSettled();
      await shot('compare');
    }
  },

  async perf() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-guide]');
    await until(vis('.l-pk'));
    await b.click('.l-pk[data-pack=countries]');
    await until(vis('.l-cell'), 15000);
    const cells = await n('.l-cell');
    expect(cells >= 190, 'countries grid has ~195 cells: ' + cells);
    const res = await b.eval(`(async () => {
      const el = document.querySelector('.screen:not(.leaving)');
      const frames = []; let last = performance.now(), run = true;
      const tick = t => { frames.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const H = el.scrollHeight - el.clientHeight;
      for (let i = 0; i <= 90; i++) { el.scrollTop = H * i / 90; await new Promise(r => requestAnimationFrame(r)); }
      for (let i = 90; i >= 0; i -= 3) { el.scrollTop = H * i / 90; await new Promise(r => requestAnimationFrame(r)); }
      run = false;
      frames.sort((a, b) => a - b);
      return { n: frames.length, p50: frames[frames.length >> 1], p95: frames[Math.floor(frames.length * 0.95)], max: frames[frames.length - 1], height: H, dom: document.querySelectorAll('*').length };
    })()`);
    log('scroll 195 cells', JSON.stringify(res));
    expect(res.p95 < 50, 'scroll p95 frame < 50ms');
    // all animals theme (~600 cells)
    await b.goto(URL); await until('window.__cluedReady');
    await openLearn(); await b.click('[data-go=l-guide]'); await until(vis('.l-pk'));
    await b.click('[data-theme=animals]');
    await until(vis('.l-cell'), 20000);
    const t0 = Date.now();
    await b.eval(`(() => { const s = document.querySelector('.l-search'); s.value = 'red'; s.dispatchEvent(new Event('input')); })()`);
    await b.sleep(250);
    log('animals cells', await n('.l-cell'), 'red →', await visN('.l-cell'), `${Date.now() - t0}ms`);
    await shot('grid-animals');
  },

  async cards() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-cards]');
    await until(vis('.l-dp'));
    await b.click('.l-dp[data-pack=dogs]');
    await b.sleep(400);
    await shot('deck');
    await until(vis('[data-act=start]'));
    await b.click('[data-act=start]');
    await until('document.body.dataset.screen === "l-review"');
    await until(vis('[data-act=flip]'), 15000);
    await imgsSettled();
    await shot('card-front');
    await b.click('[data-act=flip]');
    await until(vis('.l-grades'));
    await shot('card-back');
    await b.click('[data-grade=good]');
    await b.sleep(300);
    await b.click('[data-act=flip]');
    await b.click('[data-grade=again]');
    await b.sleep(300);
    const c = await b.eval(`JSON.parse(localStorage.getItem('clued.cards'))`);
    const vals = Object.values(c.cards);
    expect(vals.length === 2 && vals.some(v => v.b === 1 && v.due > 0) && vals.some(v => v.b === 0), 'graded two cards: ' + JSON.stringify(c.cards));
    // finish the session with keyboard
    for (let i = 0; i < 30 && await b.eval(vis('[data-act=flip]')); i++) { await b.key(' '); await b.sleep(80); await b.key('2'); await b.sleep(120); }
    await until(vis('.l-done'));
    await shot('cards-done');
  },

  async feed() {
    await fresh();
    await openLearn();   // installs the hook (A is asked to install it at boot)
    await b.click('.back');
    await until('document.body.dataset.screen === "home"');
    await b.eval(`window.__clued.start({ structure: 'quick', format: 'mc', packs: ['dogs'], count: 5 }); true`);
    await until(vis('.choice'), 20000);
    for (let i = 0; i < 12 && (await scr()) === 'play'; i++) {
      if (await b.eval(vis('.reveal.show .next'))) { await b.click('.reveal.show .next'); await b.sleep(250); continue; }
      if (await b.eval(vis('.choices:not(.locked) .choice'))) { await b.eval(`window.__clued.answer('wrong')`); await b.sleep(300); continue; }
      await b.sleep(200);
    }
    await until('document.body.dataset.screen === "results"', 20000);
    await b.sleep(400);
    const st = await b.eval(`({ m: JSON.parse(localStorage.getItem('clued.mastery') || '{}'), c: JSON.parse(localStorage.getItem('clued.cards') || '{}') })`);
    const missed = Object.values(st.c.cards || {}).filter(x => x.g).length;
    log('mastery items', Object.keys(st.m.items || {}).length, 'game cards', missed);
    expect(missed >= 3, 'missed answers became flashcards');
    await b.click('[data-act=home]').catch(() => b.eval(`window.__cluedCtx.reset('home')`));
    await until('document.body.dataset.screen === "home"');
    await b.sleep(300);
    const badge = await b.eval(`document.querySelector('.tile[data-mode=learn] .l-badge')?.textContent`);
    expect(+badge >= missed, 'home badge shows due count: ' + badge);
    await shot('home-badge');
  },

  async mastery() {
    const t = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    await fresh({}, { 'clued.mastery': { v: 1, items: { 'countries/france': { c: 4, w: 0, s: 0.9, t }, 'flags/france': { c: 4, w: 0, s: 0.9, t }, 'capitals/paris': { c: 4, w: 0, s: 0.9, t },
      'countries/brazil': { c: 1, w: 0, s: 0.34, t }, 'countries/japan': { c: 2, w: 0, s: 0.6, t }, 'flags/japan': { c: 2, w: 0, s: 0.6, t }, 'capitals/tokyo': { c: 2, w: 0, s: 0.6, t } } } });
    await openLearn();
    await b.click('[data-go=l-mastery]');
    await until(vis('.l-mmap .gm-svg'), 20000);
    await b.sleep(800);
    const lm = await b.eval(`[document.querySelectorAll('.is-lm1').length, document.querySelectorAll('.is-lm2').length, document.querySelectorAll('.is-lm3').length]`);
    log('map bands', lm);
    expect(lm[2] >= 1 && lm[1] >= 1, 'map coloured');
    await shot('mastery');
    await b.eval(`document.querySelector('.screen:not(.leaving)').scrollTop = 9999`);
    await b.sleep(200);
    await shot('mastery-packs');
  },

  async look() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-look]');
    await until(vis('.l-pk'));
    await shot('look-home');
    await b.click('.l-pk[data-pack=dogs]');
    await until(vis('.l-pair'));
    await imgsSettled();
    await shot('look-pairs');
    await b.click('.l-pair');
    await until(vis('.l-diff'));
    await imgsSettled();
    await shot('look-compare');
    await b.click('.l-quiz-btns .btn');
    await until(vis('.l-quiz p'));
  },

  async sound() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-sound]');
    await until(vis('.l-snd'), 15000);
    await imgsSettled();
    await shot('sound-animals');
    for (const g of ['anthems', 'piano', 'hits']) {
      await b.click(`.l-groups [data-group=${g}]`);
      await until(vis('.l-snd'), 15000);
    }
    await b.click('.l-groups [data-group=piano]');
    await until(vis('.l-snd'));
    await b.click('.l-snd .l-sound');
    await b.sleep(1500);
    const st = await b.eval(`document.querySelector('.l-snd .l-sound').className`);
    log('piano button', st);
    await b.click('.l-snd-txt');
    await shot('sound-piano');
  },

  async explore() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-explore]');
    await until(vis('.l-xmap .gm-svg'), 20000);
    await b.sleep(500);
    await b.eval(`(() => { const s = document.querySelector('.l-xmap input[type=search]'); s.value = 'japan'; s.dispatchEvent(new Event('input')); })()`);
    await b.sleep(500);
    await b.click('.l-xmap input[type=search] + div button');
    await until(vis('.l-country'), 15000);
    await imgsSettled();
    const txt = await b.eval(`document.querySelector('.l-country').innerText`);
    expect(/Tokyo/.test(txt), 'Japan card shows Tokyo');
    expect(await n('.l-country .l-sound') === 1, 'anthem button');
    await shot('explore');
    // and a real tap on the map
    const pt = await b.eval(`(() => { const r = document.querySelector('.l-xmap').getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.4 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await b.sleep(600);
  },

  async kids() {
    await fresh({ kids: true });
    await openLearn();
    expect(await n('.l-tile') === 5, 'kids tools');
    await shot('kids-hub');
    await b.click('[data-go=l-guide]');
    await until(vis('.l-pk'));
    await b.click('.l-pk[data-pack=mammals]');
    await until(vis('.l-cell'), 15000);
    await imgsSettled();
    await shot('kids-grid');
    await b.click('.l-cell');
    await until(vis('.l-item-title h2'));
    await imgsSettled();
    await shot('kids-item');
    await b.click('.back'); await b.sleep(300); await b.click('.back'); await b.sleep(300); await b.click('.back');
    await until('document.body.dataset.screen === "learn"');
    await b.click('[data-go=l-cards]');
    await until(vis('.l-dp'));
    await b.click('.l-dp[data-pack=mammals]');
    await b.sleep(300);
    await b.click('[data-act=start]');
    await until(vis('[data-act=flip]'), 15000);
    await b.click('[data-act=flip]');
    await imgsSettled();
    await shot('kids-card');
    await b.click('[data-grade=good]');
    await b.sleep(200);
  },
};

for (const [name, fn] of Object.entries(scenarios)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  b.logs.length = 0;
  try { await fn(); log('ok', name); }
  catch (e) { fails++; log('FAIL', name, e.message); try { await shot(`FAIL-${name}`); } catch (x) {} }
  const errs = b.logs.filter(l => /exception|\[error\]/.test(l));
  if (errs.length) log('  console:', errs.slice(0, 5).join(' | '));
}
clearInterval(keepAlive);
b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
