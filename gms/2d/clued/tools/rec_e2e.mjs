#!/usr/bin/env node
// World records pack, end to end with real taps in headless Chrome (CDP_PORT, default 9620; the :8888 site server).
//   node tools/rec_e2e.mjs <outDir> portrait|landscape
// Rounds: mc (trivia: holder / value / range-band questions), number (keypad + Lock it in), hilo, order.
// Start Chrome first: ~/.claude/bin/cdp start --port 9620 -- --use-angle=metal
import { mkdirSync } from 'node:fs';
import { open } from './a_cdp.mjs';

const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
const PORT = +process.env.CDP_PORT || 9620;
const SITE = 'http://localhost:8888/gms/2d/clued/';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) pass++; else { fail++; console.log(`  FAIL ${m} ${x}`); } };
const HARD = setTimeout(() => { console.log('FATAL: over 8 min'); process.exit(1); }, 8 * 60 * 1000); HARD.unref();

const L = MODE === 'landscape';
const b = await open({ port: PORT, width: L ? 854 : 384, height: L ? 384 : 854, mobile: true });
await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ kids: false })); true`);
await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);

const Q = () => b.eval('(() => { const q = window.__clued.state().q; return q && { prompt: q.prompt, answer: q.answer, answerText: q.answerText, options: q.options?.map(o => o.text), id: q.id, data: q.data }; })()');
const noHScroll = () => b.eval('document.documentElement.scrollWidth <= innerWidth + 1');
const fits = () => b.eval(`(() => { const s = document.querySelector('.stage'); if (!s) return false; const r = s.getBoundingClientRect(); return [...s.querySelectorAll('button, .q-prompt, .hl-card, .or-it')].every(e => { const x = e.getBoundingClientRect(); return x.right <= innerWidth + 1 && x.left >= -1; }); })()`);
const next = async () => { await b.waitFor('document.querySelector(".reveal.show")', 10000); await sleep(500); };
const go = async () => { await b.click('.reveal.show .next'); };
const start = (format, count, opts = {}, difficulty = 0) => b.eval(`window.__clued.start({ structure: 'quick', format: '${format}', packs: ['records'], count: ${count}, timer: 0, opts: ${JSON.stringify(opts)}, difficulty: ${difficulty} }); true`);

// ---- mc: trivia questions, look for a value question and a range-band question to photograph
await start('mc', 60, { answers: 4, source: 'questions' }, 3);
const seen = { band: 0, value: 0 };
for (let r = 0; r < 60; r++) {
  if (r >= 10 && seen.band && seen.value) break;
  await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelectorAll('.stage .choice').length`, 20000);
  await sleep(400);
  const q = await Q();
  const band = q.options.some(t => /^(Under|Over) /.test(t));
  const value = !band && q.options.every(t => /\d/.test(t));
  if (band) {
    const nums = q.options.map(t => parseFloat(t.replace(/^(Under|Over) /, '').replace(/,/g, '')));
    ok(nums.every((n, i) => !i || n >= nums[i - 1]), 'band options stay in ascending order', q.options.join(' / '));
  }
  if (band && !seen.band++) await b.shot(`${OUT}/${MODE}-mc-band.png`);
  if (value && !seen.value++) await b.shot(`${OUT}/${MODE}-mc-value.png`);
  if (r === 0) await b.shot(`${OUT}/${MODE}-mc.png`);
  ok(await noHScroll(), `mc q${r} no horizontal scroll`);
  await b.click('.stage .choice', { index: r % 2 ? q.answer : (q.answer + 1) % q.options.length });
  await next();
  const rec = await b.eval('window.__clued.run().state.answers.at(-1)');
  ok(!!rec.correct === !!(r % 2), `mc q${r} scored`, JSON.stringify(rec));
  if (band && seen.band === 1) await b.shot(`${OUT}/${MODE}-mc-band-reveal.png`);
  await go();
}
console.log(`  mc: saw ${seen.value} value and ${seen.band} band questions`);
ok(seen.band && seen.value, 'mc round served value and range-band questions');

// ---- number: type the answer on the keypad, lock it in
await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
await start('number', 4);
for (let r = 0; r < 4; r++) {
  await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelector('.stage .nb-pad')`, 20000);
  await sleep(400);
  const q = await Q();
  if (r === 0) await b.shot(`${OUT}/${MODE}-number.png`);
  const WORD = { m: 'metres', km: 'kilometres', s: 'seconds', 'km/h': 'km/h', 'km²': 'square kilometres', '°C': 'degrees Celsius', cm: 'centimetres' };
  ok(!WORD[q.data.unit] || q.prompt.includes(WORD[q.data.unit]), `number q${r} names its unit in the prompt`, `${q.prompt} [${q.data.unit}]`);
  const guess = String(q.answer).replace('-', '');
  for (const ch of guess) await b.click('.stage .nb-pad button', { index: '1234567890'.includes(ch) ? '1234567890'.indexOf(ch) : 10 });
  await b.click('.stage .nb-go');
  await next();
  const rec = await b.eval('window.__clued.run().state.answers.at(-1)');
  ok(q.answer < 0 || rec.correct, `number q${r}: typing the exact answer scores`, `${q.prompt} ${q.answer} ${JSON.stringify(rec)}`);
  if (r === 0) await b.shot(`${OUT}/${MODE}-number-reveal.png`);
  ok(await noHScroll(), `number q${r} no horizontal scroll`);
  await go();
}
await b.waitFor('document.body.dataset.screen === "results"', 15000);

// ---- hilo
await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
await start('hilo', 4);
for (let r = 0; r < 4; r++) {
  await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelectorAll('.stage .choice').length === 2`, 20000);
  await sleep(500);
  const q = await Q();
  if (r === 0) await b.shot(`${OUT}/${MODE}-hilo.png`);
  ok(await fits(), `hilo q${r} cards and buttons fit the screen`);
  await b.click('.stage .choice', { index: q.answer });
  await next();
  ok((await b.eval('window.__clued.run().state.answers.at(-1)')).correct, `hilo q${r} right answer scores`, q.prompt);
  if (r === 0) await b.shot(`${OUT}/${MODE}-hilo-reveal.png`);
  await go();
}
await b.waitFor('document.body.dataset.screen === "results"', 15000);

// ---- order
await b.goto(SITE + '?test'); await b.waitFor('window.__cluedReady', 20000);
await start('order', 2, { items: 4 });
for (let r = 0; r < 2; r++) {
  await b.waitFor(`window.__clued.state().run?.answers === ${r} && document.querySelectorAll('.stage .or-it').length === 4`, 20000);
  await sleep(500);
  if (r === 0) await b.shot(`${OUT}/${MODE}-order.png`);
  ok(await fits(), `order q${r} fits the screen`);
  await b.click('.stage .or-foot .btn');
  await next();
  await sleep(800);
  if (r === 0) await b.shot(`${OUT}/${MODE}-order-reveal.png`);
  await go();
}
await b.waitFor('document.body.dataset.screen === "results"', 15000);

const errs = b.logs.filter(l => /exception|\[error\]/i.test(l) && !/favicon|net::|Failed to load resource/i.test(l));
ok(!errs.length, 'no console errors', errs.slice(-3).join(' | '));
b.close();
console.log(`rec_e2e ${MODE}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
