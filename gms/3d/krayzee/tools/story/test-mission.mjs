// STORY: missions end-to-end in the real game (?mission=N) with real CDP touch (mouse/keys on desktop).
//   ~/.claude/bin/cdp start --port 9632 -- --use-angle=metal
//   node tools/story/test-mission.mjs [--mission=1..4] [--view=portrait|landscape|desktop] [--diff=easy|medium|hard]
//        [--port=9632] [--base=http://localhost:8790/gms/3d/krayzee/] [--falsify=<name>]
// Scripted help is limited to: Mission 1 medium/hard tower pass (teleport onto a low line at the tower, wings level) and
// Mission 2 medium/hard turn-in (teleport onto the centreline 1.6 km out, ahead of Rupert).
// --falsify breaks one thing in the page so the check that guards it must fail (see FALSIFY below).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', 'docs', 'shots', 'story');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const VIEW = arg('view', 'portrait'), DIFF = arg('diff', 'easy'), MISSION = +arg('mission', 1), FALSIFY = arg('falsify', '');
// --force=<case>: make the autopilot / player misbehave so a step has to recover (PLAYTEST_3 #1/#5):
//   castle (M1) the AP is sent past the castle while the radio waits · radio (M1) the rival is never answered
//   demandfast (all) DEMAND IT tapped the instant it lights, still in the "stop" step · church (M3) AP sent past the church
//   gate (M4) AP sent past gate 1 without passing it · polite (M2) LAND at once from the downwind: lands without a cut-in
const FORCE = arg('force', '');
const BASE = arg('base', 'http://localhost:8790/gms/3d/krayzee/');
const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#1d3f8f', secondary: '#f4f1ea', accent: '#d4af37', voice: 'toff', registration: 'K-DIRK' };
const [W, H, MOBILE] = { portrait: [390, 844, true], landscape: [844, 390, true], desktop: [1280, 800, false] }[VIEW];

// Each entry breaks the page right after the mission starts; the named check must then FAIL.
const FALSIFY_JS = {
  // the briefing never freezes the world
  freeze: `window.__krzStory.simScale = () => 1; true`,
  // the coach is dragged over the stick
  overlap: `(() => { const st = document.createElement('style'); st.textContent = '.krz-st-coach { top: auto !important; bottom: 120px !important; left: 10px !important; }'; document.head.appendChild(st); window.__krzStory.mission.state; return true; })()`,
  // mission completion does not save progress (so the next mission never unlocks)
  unlock: `(() => { const s = localStorage.setItem.bind(localStorage); localStorage.setItem = (k, v) => (k === 'krayzee.story' ? undefined : s(k, v)); return true; })()`,
  // the rule-break is never scored (objective never ticks → the mission cannot complete)
  // re-applied every 200 ms, so a game object rebuilt after load (a new play/session) is broken too
  crime: `(() => { const RX = /cut_in|forced_go|queue_jump|unauth|runway_steal|double_occ|tower_buzz/; setInterval(() => { const g = window.__game.wiring.game; if (!g || g.__falsified) return; const h = g.handleEvent.bind(g); g.handleEvent = (e) => (RX.test(String(e?.type || '') + ' ' + String(e?.id || '')) ? null : h(e)); g.__falsified = true; }, 200); return true; })()`,
  // the briefing objectives list is empty
  orders: `(() => { document.querySelector('.krz-st-obj')?.remove(); return true; })()`,
};

const C = await connect(+arg('port', 9632));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const tag = `m${MISSION}_${VIEW}_${DIFF}${FORCE ? '_' + FORCE : ''}`;
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);

await C.viewport(W, H, MOBILE);
await C.load(BASE + '?intro=0&start=none');
const done = Object.fromEntries(Array.from({ length: MISSION - 1 }, (_, k) => [k + 1, { done: true, diff: DIFF, best: 0 }]));
await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('krayzee.story', JSON.stringify({ introSeen: true, missions: ${JSON.stringify(done)} })); const k = 'krayzee.settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.difficulty = '${DIFF}'; s.v = Math.max(s.v || 0, 3); localStorage.setItem(k, JSON.stringify(s)); true`);
check('game boots', await C.load(BASE + `?mission=${MISSION}`));
for (let i = 0; i < 60 && !(await C.ev(`!!window.__krzStory?.mission`)); i++) await C.sleep(250);
await C.ev(`window.__story = { story: window.__krzStory }; window.__lp0 = window.__game.wiring?.game?.career?.lifetimePP ?? 0; true`);
C.errors.length = 0;
if (FALSIFY && FALSIFY_JS[FALSIFY]) { console.log('FALSIFY', FALSIFY, await C.ev(FALSIFY_JS[FALSIFY])); }
const M = () => C.ev(`(() => { const m = window.__story.story.mission; const w = window.__story.story.warp; const g = window.__game.state().player; return { ...m.state, log: undefined, warp: { level: w.level, scale: w.scale, reason: w.reason, dropped: w.dropped }, p: g && { x: g.x, z: g.z, alt: g.alt, agl: g.agl, kt: g.speedKt, hdg: g.heading, ground: g.onGround, leg: g.leg, li: g.legIndex, ap: g.apMode, phase: g.phase } }; })()`);
const rectOf = (sel) => C.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => !x.hidden && !x.closest('[hidden]') && x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const overlapIssues = [];
async function layoutCheck(when) {
  const coach = await rectOf('.krz-st-coach');
  const warp = await rectOf('.krz-warp');
  for (const sel of ['#krz-hud .krz-hud-strip', '#krz-hud .krz-ap', '#krz-hud .krz-axes', '.krz-stick-zone', '.krz-thr', '.krz-thr-col', '.krz-r-btn', '.krz-score', '.krz-top-r', '.krz-top-l', '.krz-finish:not([data-story])', '.krz-land', '.krz-gbtn']) {
    const r = await rectOf(sel);
    if (hit(coach, r)) overlapIssues.push(`${when}: coach over ${sel}`);
    if (hit(warp, r)) overlapIssues.push(`${when}: warp chip over ${sel}`);
  }
  if (coach && (coach.l < 0 || coach.r > W || coach.t < 0)) overlapIssues.push(`${when}: coach off-screen`);
}
async function holdKey(key, code, ms) {
  const vk = { ArrowRight: 39, ArrowLeft: 37, ShiftLeft: 16 }[code];
  await C.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
  await C.sleep(ms);
  await C.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}

// ---- briefing card: objectives listed, fits the screen, the world waits, "Fly" starts the mission ----
for (let i = 0; i < 40 && !(await rectOf('.krz-st-brief .krz-st-card')); i++) await C.sleep(250);
await C.sleep(900);
await C.shot(SHOTS, `${tag}_00_briefing`);
const brief = await C.ev(`(() => { const c = document.querySelector('.krz-st-brief .krz-st-card'); if (!c) return null; const r = c.getBoundingClientRect(); const go = c.querySelector('button[data-a="go"]').getBoundingClientRect(); return { orders: c.querySelectorAll('.krz-st-obj li').length, text: c.innerText.replace(/\\n+/g, ' | '), l: r.left, r: r.right, t: r.top, b: r.bottom, goB: go.bottom, sh: c.scrollHeight, ch: c.clientHeight }; })()`);
check('briefing card lists the orders and fits the screen', brief && brief.orders >= 1 && brief.l >= 0 && brief.r <= W && brief.t >= 0 && brief.b <= H && brief.goB <= H, JSON.stringify(brief && { orders: brief.orders, l: brief.l, r: brief.r, t: brief.t, b: brief.b }));
const before = await C.ev(`(() => { const p = window.__game.state().player; return [p.x, p.z, p.alt]; })()`);
await C.sleep(1500);
const after = await C.ev(`(() => { const p = window.__game.state().player; return [p.x, p.z, p.alt]; })()`);
check('the world waits while the briefing is up', Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) < 0.5, `${before.map((v) => v.toFixed(1))} → ${after.map((v) => v.toFixed(1))}`);
await C.tapSel('.krz-st-brief button[data-a="go"]');
await C.sleep(600);
check('Fly closes the briefing', !(await rectOf('.krz-st-brief .krz-st-card')));

const seen = new Set();
let last = '', lastT = Date.now(), warpTapped = 0, demandTo = false, chip = false, lifted = 0, scripted = false, landTapped = 0, thrDone = 0;
const LIMIT = { taxi: 400, takeoff: 120, turn: 60, letgo: 40, radio: 60, castle: 400, crime: 400, land: 500, touchdown: 300, stop: 300, demand: 60,
  spot: 40, cut: FORCE === 'polite' ? 600 : 300, queue: 120, roll: 200, bless: 400, start: 120, climb: 120, throttle: 120, race: 400 };
const STEPS = { 1: ['taxi', 'takeoff', 'turn', 'letgo', 'radio', 'castle', 'crime', 'land', 'touchdown', 'stop', 'demand'],
  2: ['spot', 'cut', 'land', 'touchdown', 'stop', 'demand'], 3: ['queue', 'roll', 'bless', 'land', 'touchdown', 'stop', 'demand'],
  4: ['start', 'climb', 'throttle', 'race', 'land', 'touchdown', 'stop', 'demand'] }[MISSION];
const warpTo5 = async (m) => { if (m.warp.level !== 5 && !m.warp.reason) { await C.tapSel('.krz-warp'); await C.sleep(250); } };
async function tapLand(m, ok) {
  const r = await rectOf('.krz-land');
  const st = await C.ev(`document.querySelector('.krz-land')?.dataset.state || ''`);
  if (r && ok && !m.p.ground && st !== 'unavailable' && st !== 'active' && landTapped < 6) {
    await C.sleep(300);
    if (!landTapped) await C.shot(SHOTS, `${tag}_land_button`);
    await C.tap((r.l + r.r) / 2, (r.t + r.b) / 2); landTapped++;
    console.log(`  tapped LAND (${landTapped}) li=${m.p.li}`);
    await C.sleep(1500);
  }
}
async function tapDemandTakeoff() {
  if (demandTo || !(await rectOf('.krz-gbtn-to'))) return;
  await C.sleep(800);
  const r = await C.tapSel('.krz-gbtn-to'); demandTo = !!r;
  console.log(`  tapped DEMAND TAKEOFF ${!!r}`);
}
while (true) {
  const m = await M();
  if (m.status !== 'running') { last = m.status; break; }
  if (m.step !== last) {
    console.log(`[${secs()}s] step ${m.step} · goal: ${m.goal} · coach: ${m.coach} · warp ${m.warp.level}/${m.warp.scale} · ${JSON.stringify(m.p)}`);
    last = m.step; lastT = Date.now();
    await C.sleep(900);
    await C.shot(SHOTS, `${tag}_${String(m.index + 1).padStart(2, '0')}_${m.step}`);
    await layoutCheck(m.step);
    seen.add(m.step);
  }
  if ((Date.now() - lastT) / 1000 > (LIMIT[m.step] || 200)) { check(`step ${m.step} finishes in time`, false, JSON.stringify(m.p)); break; }
  const mk = m.marks || {};
  const skipTo = (i) => C.ev(`(() => { const P = window.__game.S.player; P.ap.setRoute(P.ap.route, { start: ${i} }); return P.ap.i; })()`);
  if (FORCE === 'castle' && m.step === 'radio' && !seen.has('forced')) { seen.add('forced'); console.log('  FORCE: AP past the castle', await skipTo(mk.towerOut)); await C.sleep(14000); }
  if (FORCE === 'church' && m.step === 'bless' && !seen.has('forced')) { seen.add('forced'); console.log('  FORCE: AP past the church', await skipTo(mk.lineUp)); }
  if (FORCE === 'polite' && m.step === 'cut' && !seen.has('forced') && m.stepT > 2) { seen.add('forced'); console.log('  FORCE: LAND straight away, wherever', JSON.stringify(await C.ev(`(() => { const r = window.__krzStory.host.requestLand(); return r && (r.fail || r.label || 'ok'); })()`))); }
  if (FORCE === 'gate' && m.step === 'race' && !seen.has('forced')) { seen.add('forced'); console.log('  FORCE: AP past gate 1', await skipTo(mk.race + 1)); }
  if (FORCE === 'demandfast' && m.step === 'stop') {
    const st = await C.ev(`document.querySelector('.krz-finish')?.dataset.state || ''`);
    if (st === 'ready' && !seen.has('forced')) { seen.add('forced'); await C.tapSel('.krz-finish'); console.log('  FORCE: DEMAND IT tapped inside the stop step'); }
    await C.sleep(60); continue;
  }

  if (m.step === 'taxi') {
    if (warpTapped < 2) {
      await C.tapSel('.krz-warp'); warpTapped++;
      await C.sleep(300);
      if (warpTapped === 2) { const w = (await M()).warp; check('warp chip taps cycle 1× → 2× → 5× (or a conflict dropped it)', w.level === 5 || !!w.dropped || w.reason === 'Traffic nearby', JSON.stringify(w)); }
    } else await tapDemandTakeoff();
    if (/SKIP TO RUNWAY/.test(m.coach) && !seen.has('skip') && await rectOf('.krz-gbtn-skip')) { seen.add('skip'); await C.tapSel('.krz-gbtn-skip'); console.log('  tapped SKIP TO RUNWAY'); }
    if (warpTapped === 2 && !seen.has('warpOn')) {
      const w = (await M()).warp;
      if (w.scale === 5) { seen.add('warpOn'); check('5× warp runs while the autopilot taxis', true); }
    }
  } else if (m.step === 'turn' && (!lifted || (Date.now() - lastT) / 1000 > 9 * lifted && lifted < 5)) {
    // headless Chrome sometimes swallows a touchStart (GAMEPLAY notes): retry the drag a few times
    lifted++;
    await C.sleep(700);
    if (MOBILE) {
      const z = await rectOf('.krz-stick-zone');
      const x = (z.l + z.r) / 2, y = z.t + (z.b - z.t) * 0.55;
      await C.drag(x, y, 70, 0, 2600);
    } else await holdKey('ArrowRight', 'ArrowRight', 4000);
    const w = (await M()).warp;
    if (lifted === 1) check('stick input drops the warp to 1×', w.level === 1, JSON.stringify(w));
  } else if (m.step === 'radio' && FORCE !== 'radio') {
    const r = await rectOf('.krz-r-chip');
    if (r) {
      if (!chip) await C.shot(SHOTS, `${tag}_05b_radio_window`);
      await C.tap((r.l + r.r) / 2, (r.t + r.b) / 2); chip = true; console.log('  tapped radio chip');
      await C.sleep(800);
    } else if (/Tap RADIO/.test(m.coach) && !(await rectOf('.krz-r-panel'))) { await C.tapSel('.krz-r-btn'); console.log('  opened RADIO'); await C.sleep(500); }
  } else if (m.step === 'castle' || m.step === 'bless' || (m.step === 'roll' && !m.p.ground)) {
    await warpTo5(m);
  } else if (m.step === 'crime') {
    if (m.warp.level === 1 && m.warp.scale === 1 && !m.warp.reason) { await C.tapSel('.krz-warp'); await C.sleep(200); await C.tapSel('.krz-warp'); }
    if (scripted && m.p.li < 8) scripted = false; // went round again
    if (DIFF !== 'easy' && !scripted && m.p.li >= 8) {
      scripted = true;
      await C.ev(`(() => { const T = [190, -260], p = window.__game.state().player; const dx = T[0] - p.x, dz = T[1] - p.z, d = Math.hypot(dx, dz); const h = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; window.__game.teleport({ x: T[0] - dx / d * 300, z: T[1] - dz / d * 300, alt: 58, heading: h, speedKt: 90, throttle: 0.5 }); return h; })()`);
      await C.ev(`window.__game.setControls({ aileron: 0, elevator: -0.1, rudder: 0 }, 9000)`);
      console.log('  scripted low tower pass');
    }
  } else if (m.step === 'cut') {
    // Medium/Hard: scripted help (as M1's tower pass): put the plane on the centreline 1.6 km out, in front of Rupert
    if (DIFF !== 'easy' && !scripted && m.stepT > 8) {
      const ok = await C.ev(`(() => { const R = window.__game.state().ai.find((a) => a.name === 'K-POMF'); const e = window.__game.state().activeEnd; const thr = e === '27' ? [700, 0] : [-700, 0], dir = e === '27' ? 1 : -1; if (!R || Math.abs(R.x - thr[0]) < 2600) return false; window.__game.teleport({ x: thr[0] + dir * 1600, z: 0, alt: 115, heading: e === '27' ? 270 : 90, speedKt: 85, throttle: 0.5 }); return true; })()`);
      if (ok) { scripted = true; console.log('  scripted turn-in onto final ahead of Rupert'); }
    }
    await tapLand(m, !!m.flag?.landCue);
  } else if (m.step === 'land') {
    await tapLand(m, MISSION === 1 ? m.p.li >= 13 : !!m.flag?.landCue);
  } else if (m.step === 'queue' || m.step === 'start') {
    await tapDemandTakeoff();
  } else if (m.step === 'throttle' && !thrDone) {
    thrDone = 1;
    await C.sleep(600);
    if (MOBILE) {
      const r = await rectOf('.krz-thr');
      const x = (r.l + r.r) / 2, y0 = r.b - 18;
      await C.drag(x, y0, 0, -(r.b - r.t) - 30, 900);
    } else await holdKey('Shift', 'ShiftLeft', 2600);
    await C.sleep(800);
    const th = await C.ev(`window.__krzStory.host.throttle()`);
    check('throttle lever latched at full by real input', th && th.val > 0.9 && /latched|manual/.test(th.mode), JSON.stringify(th));
  } else if (m.step === 'demand') {
    const r = await rectOf('.krz-finish');
    if (r) {
      await C.sleep(500);
      await C.shot(SHOTS, `${tag}_demand`);
      await C.tap((r.l + r.r) / 2, (r.t + r.b) / 2);
      console.log('  tapped DEMAND IT');
      await C.sleep(1500);
    }
  }
  await C.sleep(250);
}
const fin = await C.ev(`(() => { const m = window.__story.story.mission.state; return { status: m.status, result: m.result, ticks: m.ticks, stepsSeen: m.stepsSeen, log: m.log.filter((l) => l.type !== 'event' || l.id).slice(-40) }; })()`);
console.log(`[${secs()}s] mission ${fin.status}`, JSON.stringify(fin.result));
check('mission completes', fin.status === 'complete', JSON.stringify(fin.result));
check('every step was reached in order', STEPS.join() === fin.stepsSeen.filter((x, i, a) => a.indexOf(x) === i).join(), fin.stepsSeen.join(','));
if (MISSION > 1) {
  const ci = fin.log.findIndex((l) => l.type === 'complete'); const ev = fin.log.filter((l, i) => l.type === 'objective' && (ci < 0 || i < ci)).map((l) => l.id);
  const need = { 2: ['cut'], 3: ['jump', 'bless'], 4: ['steal', 'throttle', 'race'] }[MISSION];
  check('the mission\'s rule-break and system objectives were earned in flight', need.every((x) => ev.includes(x)), `ticked in flight: ${ev.join(',')}`);
}
if (fin.status === 'complete') {
  let reel = false, stacked = 0, calm = 0;
  for (let i = 0; i < 100; i++) {
    const both = await C.ev(`(() => { const v = (sel) => [...document.querySelectorAll(sel)].some((e) => !e.hidden && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); return [v('.krz-st-done .krz-st-card'), v('.krz-reel')]; })()`);
    if (both[0] && both[1]) stacked++;
    calm = both[0] && !both[1] ? calm + 1 : 0;
    if (calm >= 6) break;
    if (both[1]) {
      if (!reel) { await C.sleep(1200); await C.shot(SHOTS, `${tag}_herald`); }
      reel = true; if (!(await C.tapSel('.krz-reel-all'))) await C.tapSel('.krz-reel-next');
    }
    await C.sleep(500);
  }
  check('reward card never stacks with the Herald reel', !stacked, `reel ${reel ? 'shown' : 'none'}, stacked ${stacked}×`);
  await C.sleep(1800);
  await C.shot(SHOTS, `${tag}_complete`);
  const card = await C.ev(`(() => { const c = document.querySelector('.krz-st-done .krz-st-card'); if (!c) return { text: 'NO CARD' }; const r = c.getBoundingClientRect(); return { text: c.innerText, l: r.left, r: r.right, t: r.top, b: r.bottom, bar: c.querySelector('.bar i')?.style.width, next: !!c.querySelector('button[data-a="next"]') }; })()`);
  check('complete card shows PP + rank progress', /PP/.test(card.text) && /lifetime/.test(card.text) && card.bar, card.text.replace(/\n+/g, ' | '));
  check('complete card fits the screen', card.l >= 0 && card.r <= W && card.t >= 0 && card.b <= H, JSON.stringify(card));
  const lp = await C.ev(`window.__game.wiring.game?.career?.lifetimePP ?? 0`);
  const lp0 = await C.ev('window.__lp0');
  check('career PP grew by sortie + reward', lp - lp0 >= fin.result.bonus + fin.result.sortie, `${lp0} → ${lp}`);
  if (MISSION > 1 && MISSION < 4) check('Next mission button offered', card.next);
  if (MISSION > 1) {
    const unlocked = await C.ev(`(async () => { const { missionList } = await import('${BASE}js/story/picker.js'); return missionList().map((m) => m.id + (m.unlocked ? 'U' : 'L') + (m.done ? 'D' : '')); })()`);
    const nextOk = MISSION >= 4 || unlocked.includes(`${MISSION + 1}U`);
    check(`progress saved; mission ${MISSION + 1 <= 4 ? MISSION + 1 + ' unlocked' : 'list complete'}`, unlocked.includes(`${MISSION}UD`) && nextOk, unlocked.join(' '));
  }
  await C.tapSel(`.krz-st-btns button[data-a="continue"]`);
  await C.sleep(600);
  check('Continue closes the card', !(await C.ev(`!!document.querySelector('.krz-st-done')`)));
  if (MISSION === 1) check('progress saved', await C.ev(`JSON.parse(localStorage.getItem('krayzee.story')).missions[1]?.done === true`));
}
check('coach/warp never cover HUD or controls', overlapIssues.length === 0, overlapIssues.join('; '));
check('no console errors', C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed (${secs()} s)`);
process.exit(bad.length ? 1 : 0);
