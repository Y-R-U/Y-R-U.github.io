// Lane M headless UI test: real taps on the map component and every map format via js/geo/dev.html.
// Needs: site server on :8888 and `~/.claude/bin/cdp start --port 9403`. Run: node tools/m_ui_test.mjs [--shots DIR]
import { open } from './m_cdp.mjs';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8888/gms/2d/clued/js/geo/dev.html?';
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const p = await open(+(process.env.CDP_PORT || 9403));
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FAIL', msg); } };
const HELP = `window.pt = (id, dx = 0, dy = 0) => { const r = map.el.getBoundingClientRect(); const q = map.featurePoint(id); return q && [r.left + q[0] + dx, r.top + q[1] + dy]; };
window.ll = (lon, lat) => { const r = map.el.getBoundingClientRect(); const q = map.project(lon, lat); return [r.left + q[0], r.top + q[1]]; };
window.visible = (x, y) => { const r = map.el.getBoundingClientRect(); return x > r.left + 4 && x < r.right - 52 && y > r.top + 4 && y < r.bottom - 4; }; true`;

async function load(query, vp = [384, 854]) {
  await p.viewport(vp[0], vp[1], 2, vp[0] < 900);
  await p.goto(BASE + query, 200);
  await p.waitFor('window.map && window.map.featureIds && document.querySelector(".gm-svg")', 10000);
  await p.eval('window.map.ready.then(() => true)');
  let last = '';
  for (let i = 0; i < 20; i++) {   // wait for layout to settle (the dev bar can re-wrap after fonts load)
    await p.sleep(150);
    const now = await p.eval('JSON.stringify([map.el.getBoundingClientRect(), map.featurePoint(map.featureIds()[0])])');
    if (now === last) break;
    last = now;
  }
  await p.eval(HELP);
}
const tapAt = async ([x, y], desktop) => (desktop ? p.click(x, y) : p.tap(x, y));
async function tapFeature(id, { dx = 0, dy = 0, desktop = false, fly = true } = {}) {
  let pt = await p.eval(`pt(${JSON.stringify(id)}, ${dx}, ${dy})`);
  if (fly && (!pt || !(await p.eval(`visible(${pt[0]}, ${pt[1]})`)))) {
    await p.eval(`map.flyTo(${JSON.stringify(id)}, { maxZoom: 6, duration: 200 })`);
    await p.sleep(300);
    pt = await p.eval(`pt(${JSON.stringify(id)}, ${dx}, ${dy})`);
  }
  if (!pt) return null;
  await tapAt(pt, desktop);
  await p.sleep(350);
  return pt;
}
const lastLog = () => p.eval(`JSON.parse(document.getElementById('log').textContent || '{}')`);
const lastResult = () => p.eval('window.results.at(-1) || null');
async function shot(name) { if (shotsDir) await p.shot(`${shotsDir}/${name}.png`); }

// 1. Map viewer: countries, microstates (with snapping), states.
for (const vp of [[384, 854], [854, 384], [1280, 800]]) {
  const desktop = vp[0] >= 1000;
  await load('region=world', vp);
  for (const id of ['FRA', 'BRA', 'AUS', 'SGP']) {
    await tapFeature(id, { desktop });
    const l = await lastLog();
    ok(l.id === id, `${vp} world tap ${id} -> ${l.id}`);
  }
  await load('region=EU', vp);
  for (const [id, dx] of [['MLT', 0], ['MLT', 9], ['DEU', 0], ['SMR', 0]]) {
    await tapFeature(id, { dx, desktop });
    const l = await lastLog();
    ok(l.id === id, `${vp} EU tap ${id}${dx ? ' (offset ' + dx + 'px)' : ''} -> ${l.id}`);
  }
}
for (const [region, id] of [['AUS', 'AU-VIC'], ['AUS', 'AU-TAS'], ['USA', 'US-CA'], ['USA', 'US-RI'], ['USA', 'US-AK'], ['IND', 'IN-KA'], ['IND', 'IN-GA']]) {
  await load('region=' + region);
  await tapFeature(id);
  const l = await lastLog();
  ok(l.id === id, `${region} tap ${id} -> ${l.id}`);
}
// pin-drop inverse projection must round-trip through insets too
await load('region=USA');
const rt = await p.eval(`(() => { const r = map.el.getBoundingClientRect(); const a = map.project(-149.9, 61.2); return map.invert(a[0], a[1]); })()`);
ok(rt && Math.abs(rt[0] + 149.9) < 0.05 && Math.abs(rt[1] - 61.2) < 0.05, 'inset invert round-trip ' + JSON.stringify(rt));

// 2. Gestures: pinch zooms, drag pans, double-tap on ocean zooms.
await load('region=world');
const z0 = await p.eval('map.zoom');
await p.pinch(192, 500, 80, 240);
const z1 = await p.eval('map.zoom');
ok(z1 > z0 * 2, `pinch zoom ${z0.toFixed(2)} -> ${z1.toFixed(2)}`);
const before = await p.eval(`pt('FRA')`);
await p.drag(200, 500, 120, 450);
const after = await p.eval(`pt('FRA')`);
ok(Math.abs(after[0] - before[0] + 80) < 6 && Math.abs(after[1] - before[1] + 50) < 6, `drag pans ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
await load('region=world');
const oz = await p.eval('map.zoom');
const sea = await p.eval('ll(-25, -38)');
await p.tap(...sea); await p.tap(...sea); await p.sleep(600);
ok(await p.eval('map.zoom') > oz * 1.6, 'double-tap on ocean zooms');

// 3. Every format, answered by real taps.
async function playFormat(query, answerFn, label, vps = [[384, 854]]) {
  for (const vp of vps) {
    await load(query, vp);
    await p.waitFor('window.q', 5000);
    const q = await p.eval('window.q');
    await answerFn(q, vp[0] >= 1000);
    await p.sleep(450);
    const r = await lastResult();
    ok(r && r.q === q.id && r.correct, `${label} ${vp} correct answer by tap (${q.id}) -> ${JSON.stringify(r && { correct: r.correct, given: r.given })}`);
    await shot(`${label}_${vp[0]}x${vp[1]}`);
  }
}
const ALL_VP = [[384, 854], [854, 384], [1280, 800]];
await playFormat('fmt=map-click&seed=t1', (q, d) => tapFeature(q.answer, { desktop: d }), 'map-click', ALL_VP);
await playFormat('fmt=map-click&seed=t2&difficulty=3', (q, d) => tapFeature(q.answer, { desktop: d }), 'map-click-hard');
await playFormat('fmt=map-click&region=states&country=AUS&seed=t3', q => tapFeature(q.answer), 'map-click-aus');
await playFormat('fmt=map-click&region=states&country=USA&seed=t4', q => tapFeature(q.answer), 'map-click-usa');
await playFormat('fmt=map-click&region=states&country=IND&seed=t5', q => tapFeature(q.answer), 'map-click-ind');
await playFormat('fmt=map-click&kids=1&seed=t6', q => tapFeature(q.answer), 'map-click-kids');
await playFormat('fmt=flag-map&seed=t7', (q, d) => tapFeature(q.answer, { desktop: d }), 'flag-map', ALL_VP);
await playFormat('fmt=water-click&kids=1&seed=t8', q => tapFeature(q.data.accept[0]), 'water-click-kids');
await playFormat('fmt=water-click&difficulty=2&seed=t9', (q, d) => tapFeature(q.data.accept[0], { desktop: d }), 'water-click', ALL_VP);
await playFormat('fmt=city-pick&seed=t10', async (q, d) => {
  await p.sleep(600);
  const c = q.data.cities[q.answer];
  await tapAt(await p.eval(`ll(${c.lon}, ${c.lat})`), d);
}, 'city-pick', ALL_VP);
await playFormat('fmt=city-pick&scope=states&seed=t11', async q => {
  await p.sleep(600);
  const c = q.data.cities[q.answer];
  await p.tap(...(await p.eval(`ll(${c.lon}, ${c.lat})`)));
}, 'city-pick-state');
await playFormat('fmt=continent&kids=1&seed=t12', async (q, d) => {
  const xy = await p.eval(`(() => { const b = document.querySelectorAll('.gmq-big button')[${q.answer}].getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  await tapAt(xy, d);
}, 'continent-kids', ALL_VP);
await playFormat('fmt=pin-drop&seed=t13', async (q, d) => {
  await p.eval(`map.flyTo([[${q.answer.lon}, ${q.answer.lat}]], { maxZoom: 6, duration: 100 })`); await p.sleep(250);
  await tapAt(await p.eval(`ll(${q.answer.lon}, ${q.answer.lat})`), d);
  const b = await p.eval(`(() => { const b = [...document.querySelectorAll('.gmq-btn')].find(x => /pin/i.test(x.textContent)).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  await tapAt(b, d);
}, 'pin-drop', ALL_VP);
await playFormat('fmt=neighbours&ask=map&seed=t14', async (q, d) => {
  await p.sleep(600);
  for (const id of q.answer) await tapFeature(id, { desktop: d });
}, 'neighbours', ALL_VP);

// 4. A wrong tap must score wrong (guards against a format that always says "correct").
await load('fmt=map-click&seed=t15');
const q15 = await p.eval('window.q');
const other = await p.eval(`map.featureIds().find(id => id !== ${JSON.stringify(q15.answer)} && map.feature(id).playable && map.feature(id).props.d === 1)`);
await tapFeature(other);
await p.sleep(300);
const r15 = await lastResult();
ok(r15 && r15.correct === false && r15.given === other, `wrong tap scores wrong (${other} for ${q15.answer})`);

const errors = p.logs.filter(l => /^EXC|error/i.test(l));
ok(!errors.length, 'no page errors: ' + errors.join(' | '));
console.log(`${passes} passed, ${fails} failed`);
p.close();
process.exit(fails ? 1 : 0);
