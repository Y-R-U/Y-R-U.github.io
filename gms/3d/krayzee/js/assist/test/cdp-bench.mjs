// Drives tools/assist.html over raw CDP (port 9481): marker screenshots in 3 viewports + 3 views, marker perf,
// LAND button / edge-arrow safe-zone checks, real-world planner sweep (+ a blind-planner falsification run).
// ~/.claude/bin/cdp start --port 9481 -- --use-angle=metal ; node js/assist/test/cdp-bench.mjs ; ~/.claude/bin/cdp stop 9481
import fs from 'node:fs';
const PORT = 9481;
const OUT = new URL('../../../docs/shots/assist/', import.meta.url).pathname;
const BASE = 'http://localhost:8888/gms/3d/krayzee/tools/assist.html';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tabs = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, (d) => r(d.result ?? d)); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

let pass = 0, fail = 0;
const ok = (c, name, detail = '') => { if (c) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); } };
const overlap = (a, b, pad = 0) => a && b && a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
async function rect(sel) { return ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e||e.hidden) return null; const r=e.getBoundingClientRect(); return r.width?{x:r.x,y:r.y,w:r.width,h:r.height}:null})()`); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name + '.png', Buffer.from(r.data, 'base64')); }
async function load(w, h, mobile, qs = '') {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await send('Page.navigate', { url: `${BASE}?${qs}` });
  for (let i = 0; i < 200; i++) { await sleep(150); if (await ev('!!window.__ready').catch(() => false)) break; }
  await sleep(1200);
}

const VPS = [[390, 844, true, 'portrait'], [844, 390, true, 'landscape'], [1280, 800, false, 'desktop']];
for (const [w, h, mobile, tag] of VPS) {
  console.log(`\n${tag} ${w}x${h}`);
  for (const hand of ['left', 'right']) {
    await load(w, h, mobile, `freeze&shot=1&sc=final27&hand=${hand}`);
    await ev('__bench.freeze(14)');
    await sleep(600);
    const ctl = { stick: await rect('.krz-stick-zone'), thr: await rect('.krz-thr'), pad: await rect('.krz-pad'), radio: await rect('.krz-r-btn'), tower: await rect('.krz-r-tower'), topR: await rect('.krz-top-r'), topL: await rect('.krz-top-l') };
    const landR = await rect('.krz-land');
    const hits = Object.entries(ctl).filter(([, r]) => overlap(landR, r)).map(([k]) => k);
    ok(landR && !hits.length, `[${hand}] LAND button clear of controls/radio/tower`, JSON.stringify({ landR, hits }));
    ok(landR && landR.x >= 0 && landR.y >= 0 && landR.x + landR.w <= w && landR.y + landR.h <= h, `[${hand}] LAND button on screen`);
    // the throttle/stick centres must still hit the controls, not the LAND button
    for (const k of ['stick', 'thr']) {
      const r = ctl[k];
      const covered = await ev(`!!document.elementFromPoint(${r.x + r.w / 2}, ${r.y + r.h / 2})?.closest('.krz-land, .krz-mk')`);
      ok(!covered, `[${hand}] ${k} centre not covered by assist UI`);
    }
    ctl.land = landR;
    let dbg;
    for (const v of ['chase', 'center', 'cockpit']) {
      await ev(`__bench.setView('${v}')`); await sleep(400);
      dbg = await ev('__bench.markers.debug()');
      const offs = dbg.drawn.filter((d) => d.off);
      const near = (d, r, p) => r && d.x > r.x - p && d.x < r.x + r.w + p && d.y > r.y - p && d.y < r.y + r.h + p;
      const bad = offs.filter((d) => Object.values(ctl).some((r) => near(d, r, 12)));
      ok(offs.length > 0 && bad.length === 0, `[${hand}/${v}] ${offs.length} edge arrows, none within 12 px of controls/buttons`, JSON.stringify(bad));
      const zones = { stick: ctl.stick, thr: ctl.thr, pad: ctl.pad, radio: ctl.radio, land: ctl.land };
      const pb = dbg.pills.filter((p) => Object.values(zones).some((r) => overlap({ x: p[0], y: p[1], w: p[2] - p[0], h: p[3] - p[1] }, r)));
      ok(pb.length === 0, `[${hand}/${v}] ${dbg.pills.length} label pills clear of stick/throttle/pad/radio/LAND`, JSON.stringify(pb));
      if (v === 'chase') ok(dbg.drawn.some((d) => !d.off), `[${hand}] on-screen tags present`);
    }
    await ev(`__bench.setView('chase')`); await sleep(300);
    if (hand === 'left') {
      await shot(`markers_${w}x${h}_chase`);
      for (const v of ['center', 'cockpit']) { await ev(`__bench.setView('${v}')`); await sleep(500); await shot(`markers_${w}x${h}_${v}`); }
      await ev(`__bench.setView('chase')`);
      const ms = await ev('__bench.perf(400)');
      const loopMs = await ev('new Promise((r)=>setTimeout(()=>r(__bench.loopMs()), 2500))');
      console.log(`  (in-loop, after render: ${loopMs.toFixed(3)} ms/frame)`);
      ok(ms <= 0.3, `markers.update() ${ms.toFixed(3)} ms for ${dbg.n} markers (≤ 0.3)`);
      // tap LAND: final 27 → should plan RWY 27 and go active
      const lr = landR;
      if (mobile) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lr.x + lr.w / 2, y: lr.y + lr.h / 2 }] });
        await sleep(60); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: lr.x + lr.w / 2, y: lr.y + lr.h / 2, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lr.x + lr.w / 2, y: lr.y + lr.h / 2, button: 'left', clickCount: 1 });
      }
      await sleep(300);
      const st = await ev('({s: __bench.land.state, p: (()=>{const p=__bench.plan(); return p.fail||p.label})()})');
      ok(st.s === 'active' && st.p === 'RWY 27', 'tapping LAND on final 27 → active, RWY 27', JSON.stringify(st));
      await shot(`land_active_${w}x${h}`);
      await ev(`__bench.land.setState('unavailable', 'GO LOWER')`); await sleep(200);
      await shot(`land_unavailable_${w}x${h}`);
      const lr2 = await rect('.krz-land');
      ok(!Object.entries(ctl).some(([k, r]) => k !== 'land' && overlap(lr2, r)), 'unavailable LAND (with reason) still clear of controls');
    }
  }
}

console.log('\nplanner on the real world (buildWorld)');
await load(1280, 800, false, 'freeze');
const sw = await ev('__bench.sweep(300, 11)');
console.log(`  ${sw.plans}/${sw.n} plans ${JSON.stringify(sw.kinds)} avg ${sw.ms.toFixed(1)} ms max ${sw.maxMs.toFixed(1)} ms`);
ok(sw.violations.length === 0, 'no chosen strip crosses water/building/collider/tree', sw.violations.slice(0, 5).join(' | '));
ok(sw.plans > 100, 'planner finds strips on the real world');
const fz = await ev('__bench.sweep(300, 11, true)');
const fzGrade = fz.violations.filter((v) => v.includes('grade')).length;
ok(fz.violations.length - fzGrade > 0 && fzGrade > 0, `FALSIFY: blind planner (flat, no colliders/trees/water) is caught: ${fz.violations.length - fzGrade} obstacle + ${fzGrade} grade violations`, '');
for (const sc of ['final27', 'cross', 'field']) {
  await ev(`__bench.scenario('${sc}')`);
  const p = await ev('(()=>{const p=__bench.plan(); return {f:p.fail,l:p.label,k:p.kind,r:p.reason,ms:p.ms}})()');
  console.log(`  ${sc}: ${p.f || p.l + ' — ' + p.r} (${p.ms.toFixed(1)} ms)`);
  if (sc === 'final27') ok(p.l === 'RWY 27', 'final 27 → RWY 27');
}
await ev(`__bench.showMap(true, 40)`); await sleep(500); await shot('planner_map_40');
await ev(`__bench.showMap(true, 1)`); await sleep(500); await shot('planner_map_debug');

if (logs.length) console.log('\nconsole:\n  ' + logs.slice(0, 10).join('\n  '));
ok(!logs.some((l) => l.startsWith('EXC')), 'no page exceptions');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();
process.exit(fail ? 1 : 0);
