// STORY: Mission 1 "Letters Patent" end-to-end in the real game (devhook shim) with real CDP touch (mouse/keys on desktop).
//   ~/.claude/bin/cdp start --port 9531 -- --use-angle=metal
//   node tools/story/test-mission.mjs [--view=portrait|landscape|desktop] [--diff=easy|medium|hard]
// Scripted help is limited to: medium/hard tower pass (teleport onto a low line at the tower, wings held level).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', 'docs', 'shots', 'story');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const VIEW = arg('view', 'portrait'), DIFF = arg('diff', 'easy');
const BASE = 'http://localhost:8888/gms/3d/krayzee/';
const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#1d3f8f', secondary: '#f4f1ea', accent: '#d4af37', voice: 'toff', registration: 'K-DIRK' };
const [W, H, MOBILE] = { portrait: [390, 844, true], landscape: [844, 390, true], desktop: [1280, 800, false] }[VIEW];

const C = await connect(+arg('port', 9531));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const tag = `${VIEW}_${DIFF}`;
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);

await C.viewport(W, H, MOBILE);
await C.send('Page.navigate', { url: 'about:blank' });
await C.load(BASE);
await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('krayzee.story', JSON.stringify({ introSeen: true, missions: {} })); const k = 'krayzee.settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.difficulty = '${DIFF}'; s.v = Math.max(s.v || 0, 3); localStorage.setItem(k, JSON.stringify(s)); true`);
// the real path: main.js's ?mission=1 wiring (GAMEPLAY), not the devhook shim
check('game boots', await C.load(BASE + '?mission=1'));
for (let i = 0; i < 60 && !(await C.ev(`!!window.__krzStory?.mission`)); i++) await C.sleep(250);
await C.ev(`window.__story = { story: window.__krzStory }; window.__lp0 = window.__game.wiring?.game?.career?.lifetimePP ?? 0; true`);
C.errors.length = 0;
const M = () => C.ev(`(() => { const m = window.__story.story.mission; const w = window.__story.story.warp; const g = window.__game.state().player; return { ...m.state, log: undefined, warp: { level: w.level, scale: w.scale, reason: w.reason, dropped: w.dropped }, p: g && { x: g.x, z: g.z, alt: g.alt, agl: g.agl, kt: g.speedKt, hdg: g.heading, ground: g.onGround, leg: g.leg, li: g.legIndex, ap: g.apMode, phase: g.phase } }; })()`);
const rectOf = (sel) => C.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => !x.hidden && !x.closest('[hidden]') && x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const overlapIssues = [];
async function layoutCheck(when) {
  const coach = await rectOf('.krz-st-coach');
  const warp = await rectOf('.krz-warp');
  for (const sel of ['#krz-hud .krz-hud-strip', '.krz-stick-zone', '.krz-thr', '.krz-r-btn', '.krz-score', '.krz-top-r', '.krz-finish:not([data-story])', '.krz-land']) {
    const r = await rectOf(sel);
    if (hit(coach, r)) overlapIssues.push(`${when}: coach over ${sel}`);
    if (hit(warp, r)) overlapIssues.push(`${when}: warp chip over ${sel}`);
  }
  if (coach && (coach.l < 0 || coach.r > W)) overlapIssues.push(`${when}: coach off-screen`);
}
async function holdKey(key, code, ms) {
  await C.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37 }[key] });
  await C.sleep(ms);
  await C.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37 }[key] });
}

const seen = new Set();
let last = '', lastT = Date.now(), warpTapped = 0, demandTo = false, chip = false, lifted = false, scripted = false, landTapped = 0;
const LIMIT = { taxi: 400, takeoff: 120, turn: 60, letgo: 40, radio: 60, castle: 400, crime: 400, land: 500, touchdown: 300, stop: 300, demand: 60 };
while (true) {
  const m = await M();
  if (m.status !== 'running') { last = m.status; break; }
  if (m.step !== last) {
    console.log(`[${secs()}s] step ${m.step} · coach: ${m.coach} · warp ${m.warp.level}/${m.warp.scale} · ${JSON.stringify(m.p)}`);
    last = m.step; lastT = Date.now();
    await C.sleep(900);
    await C.shot(SHOTS, `m1_${tag}_${String(m.index + 1).padStart(2, '0')}_${m.step}`);
    await layoutCheck(m.step);
    seen.add(m.step);
  }
  if ((Date.now() - lastT) / 1000 > (LIMIT[m.step] || 200)) { check(`step ${m.step} finishes in time`, false, JSON.stringify(m.p)); break; }

  if (m.step === 'taxi') {
    if (warpTapped < 2) {
      await C.tapSel('.krz-warp'); warpTapped++;
      await C.sleep(300);
      if (warpTapped === 2) { const w = (await M()).warp; check('warp chip taps cycle 1× → 2× → 5× (or a conflict dropped it)', w.level === 5 || !!w.dropped || w.reason === 'Traffic nearby', JSON.stringify(w)); }
    } else if (!demandTo && await rectOf('.krz-gbtn-to')) {
      await C.sleep(1500);
      const r = await C.tapSel('.krz-gbtn-to'); demandTo = !!r;
      console.log(`  tapped DEMAND TAKEOFF ${!!r}`);
    }
    if (/SKIP TO RUNWAY/.test(m.coach) && !seen.has('skip') && await rectOf('.krz-gbtn-skip')) { seen.add('skip'); await C.tapSel('.krz-gbtn-skip'); console.log('  tapped SKIP TO RUNWAY'); }
    if (warpTapped === 2 && !seen.has('warpOn')) {
      const w = (await M()).warp;
      if (w.scale === 5) { seen.add('warpOn'); check('5× warp runs while the autopilot taxis', true); }
    }
  } else if (m.step === 'turn' && (!lifted || (Date.now() - lastT) / 1000 > 12 && !seen.has('turn2'))) {
    if (lifted) seen.add('turn2');
    lifted = true;
    await C.sleep(700);
    if (MOBILE) {
      const z = await rectOf('.krz-stick-zone');
      const x = (z.l + z.r) / 2, y = z.t + (z.b - z.t) * 0.55;
      await C.drag(x, y, 70, 0, 2600);
    } else await holdKey('ArrowRight', 'ArrowRight', 4000);
    const w = (await M()).warp;
    check('stick input drops the warp to 1×', w.level === 1, JSON.stringify(w));
  } else if (m.step === 'radio') {
    const r = await rectOf('.krz-r-chip');
    if (r) {
      if (!chip) await C.shot(SHOTS, `m1_${tag}_05b_radio_window`);
      await C.tap((r.l + r.r) / 2, (r.t + r.b) / 2); chip = true; console.log('  tapped radio chip');
      await C.sleep(800);
    } else if (/Tap RADIO/.test(m.coach) && !(await rectOf('.krz-r-panel'))) { await C.tapSel('.krz-r-btn'); console.log('  opened RADIO'); await C.sleep(500); }
  } else if (m.step === 'castle' && m.warp.level !== 5) {
    await C.tapSel('.krz-warp'); await C.sleep(250);
  } else if (m.step === 'crime') {
    if (m.warp.level === 1 && m.warp.scale === 1 && !m.warp.reason) { await C.tapSel('.krz-warp'); await C.sleep(200); await C.tapSel('.krz-warp'); }
    if (scripted && m.p.li < 8) scripted = false; // went round again
    if (DIFF !== 'easy' && !scripted && m.p.li >= 8) {
      scripted = true;
      // scripted: put the plane on a low line 600 m short of the tower, wings level, and hold the controls straight
      await C.ev(`(() => { const T = [190, -260], p = window.__game.state().player; const dx = T[0] - p.x, dz = T[1] - p.z, d = Math.hypot(dx, dz); const h = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; window.__game.teleport({ x: T[0] - dx / d * 300, z: T[1] - dz / d * 300, alt: 58, heading: h, speedKt: 90, throttle: 0.5 }); return h; })()`);
      await C.ev(`window.__game.setControls({ aileron: 0, elevator: -0.1, rudder: 0 }, 9000)`);
      console.log('  scripted low tower pass');
    }
  } else if (m.step === 'land') {
    const r = await rectOf('.krz-land');
    if (r && m.p.li >= 13 && landTapped < 3) {
      await C.sleep(300);
      await C.shot(SHOTS, `m1_${tag}_08b_land_button`);
      await C.tap((r.l + r.r) / 2, (r.t + r.b) / 2); landTapped++;
      console.log(`  tapped LAND (${landTapped})`);
      await C.sleep(1500);
    }
  } else if (m.step === 'demand') {
    const r = await rectOf('.krz-finish');
    if (r) {
      await C.sleep(500);
      await C.shot(SHOTS, `m1_${tag}_11b_demand`);
      await C.tap((r.l + r.r) / 2, (r.t + r.b) / 2);
      console.log('  tapped DEMAND IT');
      await C.sleep(1500);
    }
  }
  await C.sleep(250);
}
const fin = await C.ev(`(() => { const m = window.__story.story.mission.state; return { status: m.status, result: m.result, log: m.log.filter((l) => l.type !== 'event' || l.id).slice(-40) }; })()`);
console.log(`[${secs()}s] mission ${fin.status}`, JSON.stringify(fin.result));
check('mission completes', fin.status === 'complete', JSON.stringify(fin.result));
const steps = ['taxi', 'takeoff', 'turn', 'letgo', 'radio', 'castle', 'crime', 'land', 'touchdown', 'stop', 'demand'];
check('every step was reached in order', steps.every((s) => seen.has(s)), [...seen].join(','));
if (fin.status === 'complete') {
  let reel = false;
  for (let i = 0; i < 60 && !(await C.ev(`!!document.querySelector('.krz-st-card')`)); i++) {
    if (await rectOf('.krz-reel-all')) {
      if (!reel) { await C.sleep(600); await C.shot(SHOTS, `m1_${tag}_11c_herald`); }
      reel = true; await C.tapSel('.krz-reel-all');
    }
    await C.sleep(500);
  }
  if (reel) check('reward card waits for the Herald reel', true);
  await C.sleep(1800);
  await C.shot(SHOTS, `m1_${tag}_12_complete`);
  const card = await C.ev(`(() => { const c = document.querySelector('.krz-st-card'); const r = c.getBoundingClientRect(); return { text: c.innerText, l: r.left, r: r.right, t: r.top, b: r.bottom, bar: c.querySelector('.bar i')?.style.width }; })()`);
  check('complete card shows PP + rank progress', /PP/.test(card.text) && /lifetime/.test(card.text) && card.bar, card.text.replace(/\n+/g, ' | '));
  check('complete card fits the screen', card.l >= 0 && card.r <= W && card.t >= 0 && card.b <= H, JSON.stringify(card));
  const lp = await C.ev(`window.__game.wiring.game?.career?.lifetimePP ?? 0`);
  const lp0 = await C.ev('window.__lp0');
  check('career PP grew by sortie + reward', lp - lp0 >= fin.result.bonus + fin.result.sortie, `${lp0} → ${lp}`);
  await C.tapSel('.krz-st-btns button[data-a="continue"]');
  await C.sleep(600);
  check('Continue closes the card', !(await C.ev(`!!document.querySelector('.krz-st-done')`)));
  check('progress saved', await C.ev(`JSON.parse(localStorage.getItem('krayzee.story')).missions[1]?.done === true`));
}
check('coach/warp never cover HUD or controls', overlapIssues.length === 0, overlapIssues.join('; '));
check('no console errors', C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed (${secs()} s)`);
process.exit(bad.length ? 1 : 0);
