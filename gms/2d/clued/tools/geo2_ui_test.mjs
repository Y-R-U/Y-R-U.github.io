// GEO2 browser test: continent clue tiers and the new neighbours questions, answered with real taps/clicks in js/geo/dev.html.
// Needs :8888 and `~/.claude/bin/cdp start --port 9431 -- --use-angle=metal`. Run: node tools/geo2_ui_test.mjs [--shots DIR]
import { open } from './m_cdp.mjs';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8888/gms/2d/clued/js/geo/dev.html?';
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const p = await open(+(process.env.CDP_PORT || 9431));
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const VPS = [[384, 854], [854, 384], [1280, 800]];
const shot = async name => { if (shotsDir) await p.shot(`${shotsDir}/${name}.png`); };

async function load(query, [w, h]) {
  await p.viewport(w, h, w < 900 ? 2 : 1, w < 900);
  await p.goto(BASE + query, 300);
  await p.waitFor('window.q && window.ctrl', 10000);
  await p.sleep(250);
  return p.eval('window.q');
}
const desk = vp => vp[0] >= 1000;
async function press(sel, i, vp) {
  const xy = await p.eval(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  if (!xy) return false;
  desk(vp) ? await p.click(...xy) : await p.tap(...xy);
  await p.sleep(200);
  return true;
}
const result = () => p.eval('window.results.at(-1) || null');
const visible = sel => p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; })()`);

// 1. Continent tiers
const TIER = { 1: 'dot', 2: 'line', 3: 'name' };
for (const vp of VPS) for (const what of ['countries', 'cities']) for (const d of [1, 2, 3]) {
  const tag = `continent ${what} d${d} ${vp}`;
  const q = await load(`fmt=continent&what=${what}&difficulty=${d}&seed=g2${what}${d}`, vp);
  await p.eval('map.ready.then(() => true)'); await p.sleep(200);
  ok(q.data.tier === TIER[d], `${tag} tier ${q.data.tier}`);
  const pre = await p.eval(`({ mk: document.querySelectorAll('.gm-mk').length, line: document.querySelectorAll('.gm-line.clue').length,
    states: document.querySelectorAll('.gm-land [class*="is-"]').length, labels: document.querySelector('.gm-labels').textContent, faded: !!document.querySelector('.gm.faded') })`);
  if (d === 1) ok(what === 'cities' ? pre.mk === 1 && pre.states === 0 : pre.states === 1 && pre.mk === 0, `${tag} dot shown ${JSON.stringify(pre)}`);
  if (d === 2) ok(pre.line === 1 && pre.mk === 0 && pre.states === 0, `${tag} only the line ${JSON.stringify(pre)}`);
  if (d === 3) ok(pre.line === 0 && pre.mk === 0 && pre.states === 0 && pre.faded, `${tag} name only ${JSON.stringify(pre)}`);
  ok(pre.labels === '', `${tag} no map labels before answering`);
  if (d === 2) await shot(`continent_${what}_line_${vp[0]}x${vp[1]}`);
  await press('.gmq-big button', q.answer, vp);
  await p.sleep(400);
  const r = await result();
  ok(r && r.correct, `${tag} correct by ${desk(vp) ? 'click' : 'tap'}`);
  const post = await p.eval(`({ ok: document.querySelectorAll('.gm-mk.ok').length, target: document.querySelectorAll('.gm-land .is-target').length, labels: document.querySelector('.gm-labels').textContent + [...document.querySelectorAll('.gm-mk text')].map(t => t.textContent).join(''), faded: !!document.querySelector('.gm.faded') })`);
  ok(!post.faded && (what === 'cities' ? post.ok === 1 && post.labels.includes(q.data.city.n) : post.target === 1 && post.labels.length > 0), `${tag} reveal shows the true place ${JSON.stringify(post)}`);
  await shot(`continent_${what}_d${d}_after_${vp[0]}x${vp[1]}`);
}

// 2. Spain at each difficulty: multi-select, map hidden until answered
for (const vp of VPS) for (const d of [1, 2, 3]) {
  const tag = `neighbours ESP d${d} ${vp}`;
  const q = await load(`fmt=neighbours&iso=ESP&kind=pick&difficulty=${d}&seed=g2spain${d}`, vp);
  ok(q.options.length === 6 && q.answer.length === q.data.need, `${tag} 6 options, ${q.data.need} to find`);
  ok(!(await visible('.gmq-mapwrap')) && !(await p.eval('!!document.querySelector(".gm-svg")')), `${tag} no map before answering`);
  await shot(`spain_d${d}_pre_${vp[0]}x${vp[1]}`);
  for (const i of q.answer) await press('.nbq-opt', i, vp);
  if (q.data.need > 1) {
    ok(await p.eval(`!document.querySelector('.gmq-btn').disabled`), `${tag} Check enabled after ${q.data.need} picks`);
    await press('.gmq-btn', 0, vp);
  }
  await p.sleep(700);
  const r = await result();
  ok(r && r.correct && r.q === q.id, `${tag} correct (${JSON.stringify(r && { c: r.correct, g: r.given })})`);
  await p.sleep(500);
  const m = await p.eval(`({ vis: !!document.querySelector('.gm-svg'), hint: !!document.querySelector('.gm-land [data-id="ESP"].is-hint'), green: document.querySelectorAll('.gm-land .is-correct').length, red: document.querySelectorAll('.gm-land .is-wrong').length })`);
  ok(m.vis && m.hint && m.green >= q.data.all.length && m.red === 6 - q.data.need, `${tag} reveal map ${JSON.stringify(m)}`);
  await shot(`spain_d${d}_after_${vp[0]}x${vp[1]}`);
}
// partial credit: one right, one wrong on a medium question
{
  const q = await load('fmt=neighbours&iso=ESP&kind=pick&difficulty=2&seed=g2partial', [384, 854]);
  const wrongI = q.options.findIndex((o, i) => !q.answer.includes(i));
  await press('.nbq-opt', q.answer[0], [384, 854]);
  await press('.nbq-opt', wrongI, [384, 854]);
  if (q.data.need === 3) await press('.nbq-opt', q.answer[1], [384, 854]);
  ok(await p.eval(`document.querySelector('.gmq-btn').disabled === false`), 'partial: Check enabled');
  await press('.nbq-opt', q.options.findIndex((o, i) => !q.answer.includes(i) && i !== wrongI), [384, 854]);
  ok(await p.eval(`document.querySelectorAll('.nbq-opt[aria-pressed=true]').length`) === q.data.need, 'partial: cannot pick more than needed');
  await press('.gmq-btn', 0, [384, 854]); await p.sleep(400);
  const r = await result();
  const want = Math.round(100 * (q.data.need - 1) / q.data.need);
  ok(r && !r.correct && r.partial && r.points === want, `partial credit ${JSON.stringify(r)} want ${want}`);
}
// 3. How many?
for (const vp of VPS) {
  const q = await load('fmt=neighbours&iso=DEU&kind=count&difficulty=2&seed=g2count', vp);
  ok(q.answerText === '9' && q.options.length === 4, `count DEU ${vp} answer 9 of 4 options`);
  await press('.nbq-opt', q.answer, vp); await p.sleep(400);
  const r = await result();
  ok(r && r.correct, `count DEU ${vp} correct`);
  await shot(`count_${vp[0]}x${vp[1]}`);
}
// a wrong count scores wrong
{
  const q = await load('fmt=neighbours&iso=DEU&kind=count&difficulty=2&seed=g2count', [384, 854]);
  await press('.nbq-opt', (q.answer + 1) % 4, [384, 854]); await p.sleep(300);
  ok((await result())?.correct === false, 'wrong count scores wrong');
}
// 4. Kids: tap one neighbour; every neighbour big enough on screen
const MIN = await p.eval(`import('./formats/neighbours.js?v=' + [...document.scripts].map(s => s.textContent.match(/v=(\\d+)/)?.[1]).find(Boolean)).then(m => m.KIDS_MIN)`);
for (const vp of VPS) for (const iso of ['KEN', 'PRT', 'USA', 'BOL', 'NGA']) {
  const tag = `kids ${iso} ${vp}`;
  const q = await load(`fmt=neighbours&kids=1&iso=${iso}&kind=tap1&seed=g2k`, vp);
  await p.eval('map.ready.then(() => true)'); await p.sleep(900);
  const sizes = await p.eval(`${JSON.stringify(q.answer)}.map(id => { const r = document.querySelector('.gm-land [data-id="' + id + '"]').getBoundingClientRect(); return { id, w: r.width, h: r.height }; })`);
  ok(sizes.every(s => Math.min(s.w, s.h) >= MIN.thin && Math.sqrt(s.w * s.h) >= MIN.side), `${tag} every neighbour >= ${MIN.thin}px on screen ${JSON.stringify(sizes.map(s => [s.id, Math.round(s.w), Math.round(s.h)]))}`);
  const pt = await p.eval(`(() => { const r = map.el.getBoundingClientRect(); const q = map.featurePoint(${JSON.stringify(q.answer[0])}); return [r.left + q[0], r.top + q[1]]; })()`);
  desk(vp) ? await p.click(...pt) : await p.tap(...pt);
  await p.sleep(500);
  const r = await result();
  ok(r && r.correct && r.given === q.answer[0], `${tag} one tap on ${q.answer[0]} is correct (${JSON.stringify(r && r.given)})`);
  if (iso === 'KEN') await shot(`kids_${iso}_${vp[0]}x${vp[1]}`);
}

const errors = p.logs.filter(l => /^EXC|error/i.test(l));
ok(!errors.length, 'no page errors: ' + errors.join(' | '));
console.log(`${passes} passed, ${fails} failed`);
p.close();
process.exit(fails ? 1 : 0);
