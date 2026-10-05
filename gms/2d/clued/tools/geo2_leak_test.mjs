// GEO2 answer-leak audit: plays every format in the real app (normal + kids) and, before answering, checks that the answer
// is not readable on screen, in alt/title/aria-label text, in a credits button, or in read-aloud speech.
// Needs :8888 + `~/.claude/bin/cdp start --port 9431 -- --use-angle=metal`.
// Run: node tools/geo2_leak_test.mjs [format,…] [--vp=384x854] [--n=3] [--shots DIR]
import { open } from './a_cdp.mjs';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const only = args.find(a => !a.startsWith('--') && !a.includes('/'))?.split(',');
const N = +(args.find(a => a.startsWith('--n='))?.slice(4) || 3);
const [W, H] = (args.find(a => a.startsWith('--vp='))?.slice(5) || '384x854').split('x').map(Number);
const BREAK = args.includes('--break');   // falsify: show picture labels and name alts; every picture check must then fail
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const b = await open({ port: 9431, width: W, height: H, mobile: W < 900, dpr: W < 900 ? 2 : 1 });
await b.viewport(W, H, W < 900 ? 2 : 1, W < 900);
const URL = 'http://localhost:8888/gms/2d/clued/?test';
let fails = 0, passes = 0, skipped = [];
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('LEAK', msg); } };

// Packs tried per format, in order; the first two each format can play are used.
const EXTRA = { mc: ['movie-moments', 'paintings', 'landmarks'], listen: ['hits-1980s', 'kids-film-tv', 'classical-piano'], type: ['movie-moments', 'flags'], reveal: ['paintings', 'landmarks'] };
const PREFER = ['mammals', 'flags', 'movie-moments', 'countries', 'paintings', 'landmarks', 'actors', 'dogs', 'birds', 'quotes', 'movies', 'books',
  'capitals', 'kids', 'kids-nature', 'elements', 'dinosaurs', 'general', 'hits-1980s', 'kids-film-tv', 'classical-piano', 'nursery-rhymes', 'anthems'];

await b.goto(URL);
await b.waitFor('window.__cluedReady && window.__clued');
const plan = await b.eval(`(async () => {
  const BUILD = window.__clued.BUILD;
  const reg = await import('./js/formats/registry.js?v=' + BUILD);
  const idx = await (await fetch('data/index.json')).json();
  const out = [];
  for (const f of reg.listFormats()) for (const kids of [false, true]) {
    if (kids && !(f.tags || []).includes('kids') && !f.kids) continue;
    const packs = f.packless ? ['countries'] : ${JSON.stringify(PREFER)}.filter(id => idx.packs[id] && reg.supportsPack(f, idx.packs[id], { kids }) === true).slice(0, 2);
    for (const id of (${JSON.stringify(EXTRA)})[f.id] || []) if (!packs.includes(id) && idx.packs[id] && reg.supportsPack(f, idx.packs[id], { kids }) === true) packs.push(id);
    out.push({ format: f.id, kids, packs });
  }
  return out;
})()`);

// Runs in the page: what a player could read before answering.
const INSPECT = `(() => {
  const q = window.__clued.state().q; if (!q) return null;
  const root = document.querySelector('.play') || document.body;
  const stage = root.querySelector('.stage') || root;
  const vis = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const attrs = [...root.querySelectorAll('[alt],[title],[aria-label]')].filter(vis)
    .map(e => [e.getAttribute('alt'), e.getAttribute('title'), e.getAttribute('aria-label')].filter(Boolean).join(' | ')).filter(Boolean);
  const svgT = [...root.querySelectorAll('svg title, svg desc')].map(t => t.textContent);
  const brokenAlt = [...root.querySelectorAll('img')].filter(i => vis(i) && i.complete && !i.naturalWidth).map(i => i.alt).filter(Boolean);
  const promptEls = [...stage.querySelectorAll('.q-prompt, .dm-prompt, .dh-prompt')];
  const speech = window.__speechLog || [];
  return {
    q: { id: q.id, format: q.format, prompt: q.prompt, answerText: q.answerText, answer: q.answer, layout: q.data?.layout,
      opts: Array.isArray(q.options) ? q.options.map(o => ({ text: typeof o === 'string' ? o : o?.text, img: !!o?.img })) : null },
    text: stage.innerText, prompts: promptEls.map(e => e.innerText), attrs, svgT, brokenAlt,
    info: !!root.querySelector('.icon-btn.info') && vis(root.querySelector('.icon-btn.info')),
    revealShown: !!root.querySelector('.reveal.show'), speech: speech.slice(),
  };
})()`;

const BREAK_JS = `(() => { const st = document.createElement('style'); st.textContent = '.choices.images .choice .label{display:block!important}'; document.head.append(st); return true; })()`;
const norm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const has = (hay, needle) => needle && needle.length >= 3 && norm(hay).includes(norm(needle));
// Formats whose answer is meant to be on screen (you pick it among visible names/values, or you place it).
const ANSWER_VISIBLE = new Set(['mc', 'tf', 'odd', 'fake', 'quote', 'hilo', 'match', 'order', 'sort', 'connect', 'continent', 'neighbours',
  'map-click', 'city-pick', 'pin-drop', 'water-click', 'flag-map', 'silhouette', 'chain', 'number', 'ladder', 'listen', 'reveal']);

function check(tag, s) {
  const q = s.q;
  ok(!s.revealShown, `${tag}: reveal card already showing`);
  ok(!s.info, `${tag}: media credits button visible before answering`);
  const pics = q.opts && q.opts.some(o => o.img);
  const shownText = s.prompts.reduce((t, p) => t.replace(p, ' '), s.text);
  if (pics) {
    for (const o of q.opts) {
      ok(!has(shownText, o.text), `${tag}: picture option name "${o.text}" visible on screen`);
      ok(!s.attrs.some(a => has(a, o.text)) && !s.brokenAlt.some(a => has(a, o.text)), `${tag}: picture option name "${o.text}" in alt/title/aria`);
      ok(!s.speech.some(t => has(t.replace(q.prompt, ''), o.text)), `${tag}: picture option name "${o.text}" read aloud`);
    }
  }
  const ans = typeof q.answerText === 'string' ? q.answerText : null;
  if (ans && ans.length >= 3 && !/^(true|false|\d+)$/i.test(ans) && !has(q.prompt, ans)) {
    if (!ANSWER_VISIBLE.has(q.format)) {
      const optTexts = (q.opts || []).filter(o => !o.img).map(o => o.text);
      const rest = optTexts.reduce((t, o) => t.split(o).join(' '), shownText);
      ok(!has(rest, ans), `${tag}: answer "${ans}" visible on screen`);
    }
    ok(!s.attrs.some(a => has(a, ans)), `${tag}: answer "${ans}" in alt/title/aria-label: ${s.attrs.filter(a => has(a, ans))}`);
    ok(!s.svgT.some(a => has(a, ans)), `${tag}: answer "${ans}" in an svg title`);
  }
}

for (const run of plan) {
  if (only && !only.includes(run.format)) continue;
  if (!run.packs.length) { skipped.push(`${run.format}${run.kids ? ' (kids)' : ''}`); continue; }
  for (const pack of run.packs) {
    const tag0 = `${run.format}${run.kids ? ' kids' : ''} ${pack}`;
    await b.goto(URL);
    await b.waitFor('window.__cluedReady && window.__clued');
    // record what read-aloud would say
    await b.eval(`window.__speechLog = []; const _s = window.speechSynthesis; if (_s) _s.speak = u => { window.__speechLog.push(u.text); }; true`);
    if (BREAK) await b.eval(BREAK_JS);
    await b.eval(`window.__clued.start({ structure: 'quick', format: ${JSON.stringify(run.format)}, packs: [${JSON.stringify(pack)}], count: ${N}, timer: false, kids: ${run.kids} }); true`);
    let last = null;
    for (let i = 0; i < N; i++) {
      try { await b.waitFor(`(() => { const q = window.__clued.state().q; return q && q.id !== ${JSON.stringify(last)} && document.querySelector('.stage') && !document.querySelector('.reveal.show'); })()`, 25000); }
      catch { if (i === 0) skipped.push(tag0 + ' (no question)'); break; }
      await b.sleep(900);
      const s = await b.eval(INSPECT);
      if (!s) break;
      last = s.q.id;
      check(`${tag0} ${s.q.id}`, s);
      if (shotsDir && i === 0) await b.shot(`${shotsDir}/leak_${run.format}${run.kids ? '_kids' : ''}_${pack}.png`);
      await b.eval(`window.__clued.answer('correct'); true`);
      await b.sleep(500);
      await b.eval(`window.__clued.next(); window.__speechLog = []; true`);
    }
  }
}
// Aaron's report: "Which of these is a capybara?" showed names under the pictures. Find that exact question in mc, odd and
// ladder (normal + kids) by seed, play up to it, and inspect it.
const CAPY = `(async (format, kids) => {
  const BUILD = window.__clued.BUILD;
  const { buildQuestions } = await import('./js/core/spec.js?v=' + BUILD);
  for (let s = 0; s < 400; s++) {
    const spec = { v: 1, structure: 'quick', kids, seed: 'capy' + s, rounds: [{ format, packs: ['mammals'], count: 8, opts: format === 'mc' ? { source: 'pictures' } : {}, difficulty: 0 }] };
    let qs; try { qs = (await buildQuestions(spec, { sparesRatio: 0 })).questions; } catch (e) { continue; }
    const i = qs.findIndex(q => (q.options || []).some(o => o.img && /capybara/i.test(o.text)));
    if (i >= 0) return { seed: spec.seed, i, id: qs[i].id, prompt: qs[i].prompt };
  }
  return null;
})`;
if (!only || only.includes('capybara')) for (const format of ['mc', 'odd', 'ladder']) for (const kids of [false, true]) {
  await b.goto(URL);
  await b.waitFor('window.__cluedReady && window.__clued');
  const hit = await b.eval(`${CAPY}(${JSON.stringify(format)}, ${kids})`);
  const tag = `capybara ${format}${kids ? ' kids' : ''}`;
  if (!hit) { skipped.push(tag + ' (no capybara picture question found)'); continue; }
  if (BREAK) await b.eval(BREAK_JS);
  await b.eval(`window.__speechLog = []; if (window.speechSynthesis) window.speechSynthesis.speak = u => { window.__speechLog.push(u.text); }; true`);
  await b.eval(`window.__clued.start({ structure: 'quick', kids: ${kids}, seed: ${JSON.stringify(hit.seed)}, rounds: [{ format: ${JSON.stringify(format)}, packs: ['mammals'], count: 8, opts: ${format === 'mc' ? "{ source: 'pictures' }" : '{}'}, difficulty: 0 }] }); true`);
  let s = null;
  for (let k = 0; k < 9; k++) {
    await b.waitFor(`(() => { const q = window.__clued.state().q; return q && !document.querySelector('.reveal.show'); })()`, 25000);
    await b.sleep(900);
    s = await b.eval(INSPECT);
    if (s.q.id === hit.id || s.q.opts?.some(o => o.img && /capybara/i.test(o.text))) break;
    await b.eval(`window.__clued.answer('correct'); true`); await b.sleep(400); await b.eval(`window.__clued.next(); window.__speechLog = []; true`);
  }
  const found = s && s.q.opts?.some(o => o.img && /capybara/i.test(o.text));
  ok(found, `${tag}: reached the capybara question (${hit.prompt})`);
  if (found) { check(`${tag} "${s.q.prompt}"`, s); if (shotsDir) await b.shot(`${shotsDir}/capybara_${format}${kids ? '_kids' : ''}.png`); }
}

// Duel: picture options must stay nameless for both players, including after one player is locked out.
if (!only || only.includes('duel')) {
  await b.goto(URL);
  await b.waitFor('window.__cluedReady && window.__clued');
  if (BREAK) await b.eval(BREAK_JS);
  await b.eval(`window.__clued.start({ structure: 'duel', format: 'mc', packs: ['mammals'], count: 10, opts: { source: 'pictures' }, timer: false }); true`);
  let seen = false;
  for (let k = 0; k < 10 && !seen; k++) {
    await b.waitFor(`window.__cluedDuel && window.__cluedDuel.i === ${k} && document.querySelectorAll('.duel-half .choices').length === 2`, 30000);
    await b.sleep(700);
    const st = await b.eval(`(() => ({ answer: window.__cluedDuel.answer, pics: !!document.querySelector('.duel-half .choices.images'),
      labels: [...document.querySelectorAll('.duel-half')].map(h => [...h.querySelectorAll('.choice .label')].filter(e => e.getClientRects().length).map(e => e.textContent)) }))()`);
    if (st.pics) {
      seen = true;
      ok(st.labels.every(l => l.length === 0), `duel: picture names visible before anyone answers ${JSON.stringify(st.labels)}`);
      // player 1 answers wrong; player 2 is still playing and must not see names on player 1's grid
      await b.eval(`(() => { const btns = [...document.querySelectorAll('.duel-half.p1 .choice')]; btns[btns.findIndex((x, i) => i !== window.__cluedDuel.answer)].click(); return true; })()`);
      await b.sleep(300);
      const after = await b.eval(`[...document.querySelectorAll('.duel-half')].map(h => [...h.querySelectorAll('.choice .label')].filter(e => e.getClientRects().length).map(e => e.textContent))`);
      ok(after.every(l => l.length === 0), `duel: names shown after player 1's wrong answer while player 2 still plays ${JSON.stringify(after)}`);
      if (shotsDir) await b.shot(`${shotsDir}/duel_lockout.png`);
    } else await b.eval(`(() => { document.querySelectorAll('.duel-half.p2 .choice')[window.__cluedDuel.answer].click(); return true; })()`);
  }
  if (!seen) skipped.push('duel (no picture question in 10)');
}

const errs = b.logs.filter(l => /\[exception\]/.test(l));
ok(!errs.length, 'page exceptions: ' + errs.slice(0, 5).join(' | '));
console.log(`skipped: ${skipped.join(', ') || 'none'}`);
console.log(`${passes} passed, ${fails} leaks`);
b.close();
process.exit(fails ? 1 : 0);
