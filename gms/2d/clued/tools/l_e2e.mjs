#!/usr/bin/env node
// Lane L end-to-end: real clicks through every Learn screen. Needs `~/.claude/bin/cdp start --port 9404` and :8888.
// Usage: [CDP_PORT=9404] node tools/l_e2e.mjs [outDir] [portrait|landscape|desktop] [scenario,...]
import { open } from './a_cdp.mjs';

const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
const VP = { portrait: [384, 854, true], landscape: [854, 384, true], desktop: [1280, 800, false] }[MODE];
const URL = 'http://localhost:8888/gms/2d/clued/?test';
const b = await open({ port: +(process.env.CDP_PORT || 9404), width: VP[0], height: VP[1], mobile: VP[2], dpr: VP[2] ? 2 : 1 });
let fails = 0;
if (process.env.DEBUG) for (const k of ['click', 'eval', 'goto', 'shot']) { const f = b[k]; b[k] = (...a) => { console.log('·', k, String(a[0]).slice(0, 90)); return f(...a); }; }
const keepAlive = setInterval(() => {}, 1000);
const log = (...a) => console.log(`[${MODE}]`, ...a);
const scr = () => b.eval('document.body.dataset.screen');
const shot = async name => {
  const bad = await b.eval(`(document.querySelector('.screen:not(.leaving)')?.innerText || '').match(/\\b(null|undefined|NaN)\\b|\\[object/)?.[0] || ''`);
  if (bad && !(await b.eval(`!!document.querySelector('.screen:not(.leaving).learn-scr')`))) log(`  note: "${bad}" on a non-Learn screen (${name})`);
  else if (bad) throw new Error(`"${bad}" rendered on ${name}: ` + await b.eval(`[...document.querySelectorAll(".screen:not(.leaving) *")].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && /null|undefined|NaN/.test(n.nodeValue))).map(e => e.className + " = " + e.textContent.slice(0, 60)).join(" | ")`));
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
    // Aaron's report: due cards from other packs (a song, a game miss) must not leak into a Snakes session
    const day = await b.eval(`Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000)`).catch(() => 0);
    await fresh({}, { 'clued.cards': { cards: { 'hits-1970s/alone-again-naturally-gilbert-osullivan': { b: 1, due: 0, n: 1, l: 0, a: 0 }, 'flowers/sunflower': { b: 0, due: 0, n: 0, l: 0, a: 0, g: 1 } }, decks: ['flowers'] } });
    await openLearn();
    await b.click('[data-act=review]');
    await until(vis('.l-dp'));
    expect(await b.eval(`document.querySelector('.l-dp[data-pack=flowers]').classList.contains('on')`), 'previous pick restored');
    await b.click('.l-dp[data-pack=flowers]');
    await b.click('.l-dp[data-pack=snakes]');
    await b.sleep(300);
    const lbl = await b.eval(`document.querySelector('[data-act=start]').textContent`);
    expect(/Study Snakes$/.test(lbl), 'start button names the pack: ' + lbl);
    expect(/Review all due \(2\)/.test(await b.eval(`document.querySelector('[data-act=all]').textContent`)), 'review-all is separate and counts every pack');
    expect(/10 new/.test(await b.eval(`document.querySelector('.l-dp[data-pack=snakes] .dp-n').textContent`)), 'per-pack new count');
    expect(await b.eval(`getComputedStyle(document.querySelector('[data-study=mc]')).backgroundColor !== 'rgba(0, 0, 0, 0)' && document.querySelector('[data-study=mc]').classList.contains('on')`), 'multiple choice is the default');
    await b.eval(`document.querySelector('.screen:not(.leaving)').scrollTo(0, 0); window.scrollTo(0, 0); true`);
    await b.sleep(200);
    await shot('deck');
    await b.click('[data-act=start]');
    await until('document.body.dataset.screen === "l-review"');
    await until(vis('.l-answer .choice'), 15000);
    await imgsSettled();
    await shot('card-mc');
    const refs = [];
    const frontCheck = async () => {
      const r = await b.eval(`(() => { const c = document.querySelector('.l-card'); const name = c.querySelector('.back .l-card-name').textContent; const f = c.querySelector('.front').innerText;
        return { ref: c.dataset.ref, kind: c.dataset.kind, leak: name.length >= 4 && f.toLowerCase().includes(name.toLowerCase()), n: document.querySelectorAll('.l-answer .choice').length }; })()`);
      refs.push(r.ref);
      expect(!r.leak, 'front shows the answer: ' + r.ref);
      return r;
    };
    // multiple choice: pick the right answer on card 1, a wrong one on card 2
    let r = await frontCheck();
    expect(r.n === 4, '4 options: ' + r.n);
    const rightIdx = () => b.eval(`(() => { const name = document.querySelector('.l-card .back .l-card-name').textContent; return [...document.querySelectorAll('.l-answer .choice')].findIndex(x => x.querySelector('.label').textContent === name); })()`);
    let ri = await rightIdx();
    await b.click('.l-answer .choice', { index: ri });
    await until(vis('[data-act=next]'));
    expect(await b.eval(`!document.querySelector('.l-card .back').hidden && !!document.querySelector('.choice.right')`), 'answer highlighted + back shown');
    await shot('card-mc-right');
    const ref1 = r.ref;
    await b.click('[data-act=next]');
    await b.sleep(250);
    r = await frontCheck();
    ri = await rightIdx();
    await b.click('.l-answer .choice', { index: (ri + 1) % 4 });
    await until(vis('[data-act=next]'));
    expect(await b.eval(`!!document.querySelector('.choice.wrong') && !!document.querySelector('.choice.right')`), 'wrong pick marked, right one shown');
    await shot('card-mc-wrong');
    let c = await b.eval(`JSON.parse(localStorage.getItem('clued.cards')).cards`);
    expect(c[ref1]?.b === 1 && c[ref1].due === day + 1, 'right first try = Good: ' + JSON.stringify(c[ref1]));
    expect(c[r.ref]?.b === 0 && c[r.ref].due === day, 'wrong = Again: ' + JSON.stringify(c[r.ref]));
    await b.click('[data-act=next]');
    await b.sleep(250);
    // "Just show me the answer" → self-grade
    r = await frontCheck();
    await b.click('[data-act=show]');
    await until(vis('.l-grades'));
    expect(await n('.l-grades:not([hidden]) .btn') === 4, 'show answer offers 4 grades');
    await b.click('[data-grade=easy]');
    await b.sleep(250);
    c = await b.eval(`JSON.parse(localStorage.getItem('clued.cards')).cards`);
    expect(c[r.ref]?.b === 2, 'easy from MC show-answer: ' + JSON.stringify(c[r.ref]));
    // switch to flip mode mid-session (remembered)
    await b.click('.l-rv-top [data-study=flip]');
    await until(vis('[data-act=flip]'));
    r = await frontCheck();
    await imgsSettled();
    await shot('card-flip-front');
    await b.click('[data-act=flip]');
    await until(vis('.l-grades'));
    expect(await n('.l-grades .btn') === 4, 'flip: Again/Hard/Good/Easy');
    await shot('card-flip-back');
    await b.click('[data-grade=hard]');
    await b.sleep(250);
    c = await b.eval(`JSON.parse(localStorage.getItem('clued.cards'))`);
    expect(c.study === 'flip' && c.cards[r.ref]?.b === 1, 'hard grade + mode remembered: ' + JSON.stringify(c.cards[r.ref]));
    // finish with the keyboard (flip: space then 3 = Good)
    for (let i = 0; i < 40 && await b.eval(vis('[data-act=flip]')); i++) { await frontCheck(); await b.key(' '); await b.sleep(80); await b.key('3'); await b.sleep(150); }
    await until(vis('.l-done'));
    const bad = refs.filter(x => !x.startsWith('snakes/'));
    expect(!bad.length, 'only snake cards: ' + bad.join(','));
    log('snake session', refs.length, 'cards');
    await shot('cards-done');
  },

  async music() {
    await fresh({}, { 'clued.cards': { cards: {}, decks: ['hits-1970s'], study: 'mc' } });
    await openLearn();
    await b.click('[data-go=l-cards]');
    await until(vis('[data-act=start]'));
    await b.click('[data-act=start]');
    await until(vis('.l-answer .choice'), 15000);
    const r = await b.eval(`(() => { const c = document.querySelector('.l-card'); const name = c.querySelector('.back .l-card-name').textContent;
      return { ref: c.dataset.ref, kind: c.dataset.kind, play: !!c.querySelector('.front .l-bigplay .l-sound'), front: c.querySelector('.front').innerText, name }; })()`);
    expect(r.ref.startsWith('hits-1970s/') && r.kind === 'audio' && r.play, 'song card has a play button: ' + JSON.stringify(r));
    expect(!r.front.toLowerCase().includes(r.name.toLowerCase()), 'song front hides the title: ' + r.front);
    await b.sleep(1500);
    const playing = await b.eval(`(() => { const s = document.querySelector('.l-bigplay .l-sound'); return s.classList.contains('playing') || s.classList.contains('loading'); })()`);
    log('song auto-play started:', playing);
    await shot('music-mc');
    await b.click('.l-hint').catch(() => {});
    await b.sleep(150);
    const hint = await b.eval(`document.querySelector('.l-hinttext')?.textContent || ''`);
    expect(/hit by/.test(hint) && !hint.toLowerCase().includes(r.name.toLowerCase()), 'hint without the title: ' + hint);
    await b.click('.l-answer .choice');
    await until(vis('[data-act=next]'));
    await shot('music-mc-back');
    await b.click('[data-act=next]');
    await b.sleep(200);
    expect(await b.eval(`!document.querySelector('.l-sound.playing') || document.querySelector('.l-card').dataset.kind === 'audio'`), 'audio stops between cards');
  },

  async reviewall() {
    const due = { b: 1, due: 0, n: 1, l: 0, a: 0 };
    await fresh({}, { 'clued.cards': { cards: { 'hits-1970s/alone-again-naturally-gilbert-osullivan': due, 'flowers/sunflower': { ...due, g: 1 }, 'capitals/kabul': due, 'snakes/inland-taipan': due }, decks: ['snakes'] } });
    await openLearn();
    await b.click('[data-go=l-cards]');
    await until(vis('[data-act=all]'));
    expect(/Review all due \(4\)/.test(await b.eval(`document.querySelector('[data-act=all]').textContent`)), 'review all count');
    expect(/missed in games/.test(await b.eval(`document.querySelector('.l-allsub').textContent`)), 'review-all says it mixes game misses');
    expect(/1 due/.test(await b.eval(`document.querySelector('[data-act=start]').textContent + document.querySelector('.l-startsub').textContent`)), 'study counts only snakes due');
    await b.click('[data-act=all]');
    await until(vis('.l-answer .choice'), 15000);
    expect(await b.eval(`!!document.querySelector('.l-rv-note')`), 'mix note shown');
    const seen = new Set();
    for (let i = 0; i < 10 && await b.eval(vis('.l-answer .choice')); i++) {
      const r = await b.eval(`(() => { const c = document.querySelector('.l-card'); const name = c.querySelector('.back .l-card-name').textContent; return { ref: c.dataset.ref, leak: c.querySelector('.front').innerText.toLowerCase().includes(name.toLowerCase()) }; })()`);
      expect(!r.leak, 'leak on ' + r.ref);
      seen.add(r.ref.split('/')[0]);
      if (i === 2) { await imgsSettled(); await shot('reviewall-text'); }
      await b.click('[data-act=show]'); await until(vis('.l-grades')); await b.click('[data-grade=good]'); await b.sleep(200);
    }
    expect(seen.size === 4, 'review all mixed every pack: ' + [...seen]);
    await until(vis('.l-done'));
  },

  async guidecards() {
    await fresh();
    await openLearn();
    await b.click('[data-go=l-guide]');
    await until(vis('.l-pk[data-pack=snakes]'));
    await b.click('.l-pk[data-pack=snakes]');
    await until(vis('[data-act=flash]'), 15000);
    await b.click('[data-act=flash]');
    await until(vis('.l-answer .choice'), 15000);
    expect((await b.eval(`document.querySelector('.l-card').dataset.ref`)).startsWith('snakes/'), 'field guide opens that pack');
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
    expect(!(await b.eval(`!!document.querySelector('.l-dp[data-pack=capitals]')`)), 'kids picker hides text-only packs');
    await b.click('.l-dp[data-pack=mammals]');
    await b.eval(`document.querySelector('.screen:not(.leaving)').scrollTo(0, 0); window.scrollTo(0, 0); true`);
    await b.sleep(300);
    await shot('kids-deck');
    await b.click('[data-act=start]');
    await until(vis('.l-answer .choice'), 15000);
    expect(await n('.l-answer .choice') === 3, 'kids get 3 options');
    expect(await b.eval(`document.querySelector('.l-card').dataset.kind === 'img'`), 'kids card is a picture');
    await imgsSettled();
    await shot('kids-card');
    await b.click('.l-answer .choice');
    await until(vis('[data-act=next]'));
    await shot('kids-card-back');
    await b.click('[data-study=flip]');
    await b.click('[data-act=next]');
    await until(vis('[data-act=flip]'));
    await b.click('[data-act=flip]');
    expect(await n('.l-grades .btn') === 2, 'kids flip has 2 buttons');
    await b.click('[data-grade=good]');
    await b.sleep(200);
    // kids sound pack
    await b.click('.back'); await b.sleep(300);
    await until(vis('.l-dp[data-pack=nursery-rhymes]'));
    await b.click('.l-dp[data-pack=mammals]');
    await b.click('.l-dp[data-pack=nursery-rhymes]');
    await b.click('[data-study=mc]');
    await b.click('[data-act=start]');
    await until(vis('.l-answer .choice'), 15000);
    expect(await b.eval(`document.querySelector('.l-card').dataset.kind === 'audio' && !!document.querySelector('.l-bigplay .l-sound')`), 'kids sound card');
    await shot('kids-sound');
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
