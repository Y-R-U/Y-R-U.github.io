// LOOPTEST (D31): the core loop played end to end in the REAL game, the way a phone player does it — real
// Input.dispatchTouchEvent taps on live element rects. window.__game is read only (state, sim clock, logs, timeouts);
// it never drives the flow. Falsify modes inject a fault on purpose (see FALSIFY) and the suite must then FAIL.
//   ~/.claude/bin/cdp start --port 9636 -- --use-angle=metal
//   node tools/test-loop.mjs [--quick] [--cases=c172:easy:portrait,...] [--timescale=4] [--port=9636]
//   node tools/test-loop.mjs --soak[=30] [--cases=c172:easy:portrait]      (sim minutes)
//   node tools/test-loop.mjs --falsify=freeze|stuck|error|cover|all --quick
// Docs: docs/TESTING.md. Results: docs/review/loop/results-<stamp>.json (+ failure screenshots in docs/review/loop/).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep, SNAP, LOAD_ROUTES, rwyGeom } from './loop/driver.mjs';
import { COVER_INSTALL, COVER_FALSIFY, summarize, fmtCover, coverTake, coverShots, coverDir } from './loop/cover.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'docs', 'review', 'loop');
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); if (!a) return d; const v = a.split('=')[1]; return v === undefined ? true : v; };
const PORT = +arg('port', 9636);
const BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/');
const TS = +arg('timescale', 4);
const STUCK = +arg('stuck', 300);           // sim s without a phase change while a step waits on progress
const SOAK = arg('soak', false);
// falsify runs default to the first quick case
const FALSIFY = arg('falsify', '');
const SHOTS = !!arg('shots', false);
// MSGFIX screen cover: sampled every case; --cover-gate=<mean>,<p90> (airborne %, portrait only) turns it into a failing step
const COVER_GATE = arg('cover-gate', '') ? String(arg('cover-gate')).split(',').map(Number) : null;
const COVER_SHOTS = arg('cover-shots', false);   // --cover-shots[=tag] saves heavy-cover frames to docs/shots/msgfix/
// JETCORE: the jets run with --jets (their own matrix) or --cases=jumbo:easy:portrait; they need ?plane= support in main.js
const JETS = ['jumbo', 'herc', 'f35'];
const PLANES = arg('jets') ? JETS : ['c172', 'tiger', 'bathtub'], DIFFS = ['easy', 'medium', 'hard'];
const ORIENT = { portrait: [390, 844], landscape: [844, 390] };

let CASES;
if (arg('cases')) CASES = String(arg('cases')).split(',').map((s) => s.split(':'));
else if (arg('quick') || SOAK) CASES = SOAK ? [['c172', 'easy', 'portrait']] : [['c172', 'easy', 'portrait'], ['bathtub', 'hard', 'landscape']];
else if (FALSIFY) CASES = [['c172', 'easy', 'portrait']];
else CASES = PLANES.flatMap((p) => DIFFS.flatMap((d) => Object.keys(ORIENT).map((o) => [p, d, o])));

// Budgets in SIM seconds unless the name says real. docs/TESTING.md mirrors this table.
const B0 = {
  bootReal: 40, menuToPlayReal: 15,
  liftoff: 60, climb60: 90,
  stickHold: 3, apBack: 10, minAglManual: 15,
  latch: 3, latchHold: 6, thrAuto: 6,
  warpRatio5: 3,
  landActive: 3, waitFinal: 400, touchdown: 300, stop: 90,
  demandReady: 240, banked: 5,
  takeoffBtn: 30, airborne2: 120,
  fieldTouchdown: 240, fieldStop: 90, fieldTakeoffBtn: 20, fieldAirborne: 60,
};
// jets: a 4-5 min circuit, a long taxi to the threshold; LAND never picks a field (the field branch lands on the runway)
const BJ = { ...B0, liftoff: 90, waitFinal: 700, touchdown: 450, stop: 150, demandReady: 420, airborne2: 300, fieldTouchdown: 600, fieldStop: 150, fieldTakeoffBtn: 30, fieldAirborne: 300 };
let B = B0;
const FALSIFY_ALL = ['freeze', 'stuck', 'error', 'cover', 'deadbutton', 'msgcover'];
let FALSIFY_SET = FALSIFY === 'all' ? FALSIFY_ALL : FALSIFY ? String(FALSIFY).split(',') : [];

const PROFILE = { name: 'Loop', gender: 'm', company: 'Loop Air', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-LOOP' };
const COACH_SEEN = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1 };

let D;
const log = (...a) => console.log(...a);
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);

// ---------------------------------------------------------------- observer
// Every sample goes through watch(): page errors, freeze (sim clock runs, nothing moves), phase stall.
function newMon() {
  return { samples: [], lastPhase: null, lastPhaseT: 0, maxStall: 0, freeze: null, events: [], last: null, minAgl: Infinity, crashes: 0, wasCrashed: false };
}
let M = newMon();
async function snap() {
  const s = await D.evSafe(SNAP);
  if (s) watch(s);
  return s;
}
function watch(s) {
  M.last = s;
  const p = s.p;
  if (p) {
    const ph = `${p.phase}|${p.leg}|${p.sub}|${p.gnd ? 'G' : 'A'}`;
    if (ph !== M.lastPhase) { M.lastPhase = ph; M.lastPhaseT = s.simT; }
    M.maxStall = Math.max(M.maxStall, s.simT - M.lastPhaseT);
    if (p.crashed && !M.wasCrashed) { M.crashes++; M.events.push({ simT: s.simT, type: 'crash', reason: p.cr }); }
    M.wasCrashed = p.crashed;
    if (!M.gone && (p.phase === 'GONE' || p.leg === 'despawn')) { M.gone = { simT: s.simT, x: Math.round(p.x), z: Math.round(p.z), agl: Math.round(p.agl) }; M.events.push({ type: 'PLAYER_GONE', ...M.gone }); }
  }
  M.samples.push({ t: s.simT, p: p && [p.x, p.z, p.alt, p.gnd, p.kt], ai: s.ai });
  while (M.samples.length > 2 && s.simT - M.samples[1].t >= 8) M.samples.shift();
  const a = M.samples[0];
  if (!M.freeze && a && s.simT - a.t >= 6 && !s.paused) {
    const moved = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
    const pStatic = p && a.p && !p.gnd && moved(a.p, [p.x, p.z, p.alt]) < 0.3;
    const prevAI = new Map(a.ai.map((x) => [x[0], x]));
    const air = s.ai.filter((x) => !x[4] && !x[5] && prevAI.has(x[0]) && !prevAI.get(x[0])[4]);
    const aiStatic = air.length >= 1 && air.every((x) => { const o = prevAI.get(x[0]); return Math.hypot(x[1] - o[1], x[2] - o[2], x[3] - o[3]) < 0.3; });
    if (pStatic || aiStatic) {
      M.freeze = { simT: s.simT, overSim: r1(s.simT - a.t), player: pStatic ? 'static in the air' : 'moving', ai: aiStatic ? `${air.length} airborne AI static` : 'moving' };
      M.events.push({ type: 'FREEZE', ...M.freeze });
    }
  }
}

// ---------------------------------------------------------------- steps
class StepFail extends Error {}
const fail = (msg) => { throw new StepFail(msg); };
let CASE = null;
async function step(name, budgetSim, fn, { needs = true, blocks = needs } = {}) {
  const rec = { step: name, ok: false, simS: 0, realS: 0, budget: budgetSim, pp0: M.last?.pending ?? null, pp1: null, banked1: null, detail: '', errors: 0, stall: 0 };
  CASE.steps.push(rec);
  if (needs && CASE.blocked) { rec.skip = `blocked by ${CASE.blocked}`; log(`  SKIP ${name} (${rec.skip})`); return null; }
  const s0 = (await snap()) || M.last, e0 = D.errors.length, t0 = Date.now();
  M.lastPhaseT = s0?.simT ?? 0; M.maxStall = 0; M.freeze = null;
  const sim0 = s0?.simT ?? 0;
  try {
    const out = await fn(rec);
    rec.ok = true;
    if (out !== undefined && out !== null && !rec.detail) rec.detail = typeof out === 'string' ? out : JSON.stringify(out);
  } catch (e) {
    rec.ok = false;
    rec.detail = e instanceof StepFail ? e.message : `harness error: ${e.message}`;
  }
  const s1 = (await snap()) || M.last;
  rec.simS = r1((s1?.simT ?? sim0) - sim0); rec.realS = r1((Date.now() - t0) / 1000);
  rec.pp1 = s1?.pending ?? null; rec.banked1 = s1?.banked ?? null;
  rec.errors = D.errors.length - e0;
  if (s1?.ledgerN > (s0?.ledgerN ?? 0)) rec.ppLog = await D.evSafe(`window.__loopLedger.slice(${s0?.ledgerN ?? 0}).map((e) => e.k + ':' + (e.id || '') + ':' + e.amt)`, []);
  rec.stall = r1(M.maxStall);
  if (rec.errors) { rec.ok = false; rec.detail += ` | page errors: ${D.errors.slice(e0, e0 + 2).join(' || ')}`; }
  if (M.freeze) { rec.ok = false; rec.detail += ` | FREEZE ${JSON.stringify(M.freeze)}`; }
  if (M.gone && !M.goneReported) { M.goneReported = true; rec.ok = false; rec.detail += ` | the player's AP reached a despawn leg (GONE) ${JSON.stringify(M.gone)}`; }
  if (rec.ok && budgetSim && rec.simS > budgetSim * 1.0001) { rec.ok = false; rec.detail += ` | over budget ${rec.simS}s > ${budgetSim}s sim`; }
  if (!rec.ok) {
    try { rec.shot = await D.shot(OUT, `${CASE.id}-${name}`.replace(/[^\w.-]+/g, '_')); } catch (e) { /* */ }
    rec.log = await D.evSafe('__game.log().slice(-14).map((l) => JSON.stringify(l).slice(0, 160))', []);
    if (blocks) CASE.blocked ||= name;
    rec.state = s1 && { phase: s1.p?.phase, leg: s1.p?.leg, sub: s1.p?.sub, agl: s1.p && r1(s1.p.agl), kt: s1.p && r1(s1.p.kt), gnd: s1.p?.gnd, x: s1.p && Math.round(s1.p.x), z: s1.p && Math.round(s1.p.z),
      land: s1.land?.txt, finish: s1.finish, ground: s1.ground, apMode: s1.p?.apMode, thrMode: s1.p?.thrMode };
  } else if (SHOTS) { try { await D.shot(OUT, `${CASE.id}-${name}-ok`.replace(/[^\w.-]+/g, '_')); } catch (e) { /* */ } }
  if (rec.warn?.length) rec.detail += ` | WARN ${rec.warn.join('; ')}`;
  log(`  ${rec.ok ? (rec.warn?.length ? 'WARN' : 'PASS') : 'FAIL'} ${name.padEnd(22)} sim ${String(rec.simS).padStart(6)}s real ${String(rec.realS).padStart(5)}s  PP ${rec.pp0}→${rec.pp1}${rec.detail ? '  ' + rec.detail : ''}`);
  return rec;
}
// poll until cond(snapshot) is truthy or simBudget sim seconds pass (a real-time cap guards a stopped clock)
async function until(cond, simBudget, { label = 'condition', every = 250, realCap } = {}) {
  const s0 = (await snap()) || M.last, sim0 = s0?.simT ?? 0, t0 = Date.now();
  const cap = realCap ?? (simBudget / Math.max(0.25, TS) * 2.5 + 20) * 1000;
  for (;;) {
    const s = await snap();
    if (s) { const v = await cond(s); if (v) return { s, v, simS: s.simT - sim0 }; }
    if (M.freeze) fail(`${label}: world froze`);
    const st = s ? s.simT - M.lastPhaseT : 0;
    if (s && st > STUCK && !(s.p?.gnd && s.p?.kt < 1)) fail(`${label}: STUCK — no phase change for ${r1(st)} s sim (${s.p?.phase}/${s.p?.leg}/${s.p?.sub})`);
    if (s && s.simT - sim0 > simBudget) fail(`${label}: not within ${simBudget} s sim`);
    if (Date.now() - t0 > cap) fail(`${label}: real-time cap ${r1(cap / 1000)} s hit (sim advanced ${r1((s?.simT ?? sim0) - sim0)} s)`);
    await sleep(every);
  }
}
const waitReal = async (fn, ms, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(every); } return null; };
// a real tap that must take effect; headless Chrome sometimes eats a touchStart, so up to 3 tries (counted)
async function tapUntil(sel, effect, { tries = 3, ms = 1500, rec } = {}) {
  await waitReal(() => D.rect(sel), 2000);
  await sleep(250); // let a fade-in finish before the thumb lands
  for (let i = 0; i < tries; i++) {
    let r = await D.tap(sel);
    if (!r) fail(`${sel} not visible`);
    if (r.covered) {
      // a player waits for a transient sheet (radio chips, toast) to go; a cover that stays is a failure
      const by = await D.hitName(r.cx, r.cy), t0 = Date.now();
      r = await waitReal(async () => { const q = await D.tap(sel); return q && !q.covered ? q : null; }, 8000, 400);
      if (!r) fail(`${sel} is covered at its centre by ${by} for 8 s real — a thumb would hit that instead`);
      if (rec) (rec.warn ||= []).push(`${sel} was covered by ${by} for ${r1((Date.now() - t0) / 1000)} s real`);
    }
    const v = await waitReal(async () => { const s = await snap(); return s && effect(s); }, ms);
    if (v) { if (rec && i) rec.retries = (rec.retries || 0) + i; return v; }
  }
  fail(`tapping ${sel} had no effect after ${tries} tries`);
}

// the D24 Herald reel: "Skip all" when there are several headlines, only "Next"/"Done" for one
async function skipReel() {
  let n = 0;
  for (let i = 0; i < 8 && (await D.rect('.krz-reel')); i++) {
    if (!(await D.tap('.krz-reel-all'))) await D.tap('.krz-reel-next');
    n++; await sleep(450);
  }
  return n;
}

// ---------------------------------------------------------------- the loop
async function fresh(plane, w, h, diff = 'easy') {
  await D.viewport(w, h);
  await D.send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400);
  await D.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(COACH_SEEN)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k]));
    localStorage.setItem('krayzee.settings', JSON.stringify({ v: 3, difficulty: ${JSON.stringify(diff)} })); return 1; })()`);
  D.errors.length = 0; D.warns.length = 0;
  await D.send('Page.navigate', { url: `${BASE}?noaccount=1&intro=0&plane=${plane}&timescale=${TS}` });
}

const FALSIFY_JS = {
  // PLAYTEST_3 #2 shape: the sim clock keeps running while every aircraft stops dead
  freeze: `(() => { const A = Object.getPrototypeOf(__game.S.player.ac); A.__step = A.step; A.step = function () {}; return 1; })()`,
  // the player's AP phase never changes again while the plane keeps flying (run with a short --stuck)
  stuck: `(() => { const ap = __game.S.player.ap, ph = ap.phase; Object.defineProperty(ap, 'phase', { get: () => ph, set() {}, configurable: true }); return 1; })()`,
  error: `(() => { setTimeout(() => { throw new Error('LOOPTEST falsify: injected page error'); }, 50); return 1; })()`,
  // an invisible sheet over the lower screen: a hook-driven test would still pass, a real thumb cannot
  cover: `(() => { const d = document.createElement('div'); d.id = 'looptest-cover'; d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:60%;z-index:99999;background:transparent'; document.body.append(d); return 1; })()`,
  // MSGFIX: a giant radio card pinned over the middle of the view; the screen-cover sampler must report it
  msgcover: COVER_FALSIFY,
  // DEMAND TAKEOFF accepts the tap and does nothing: the plane just sits there
  deadbutton: `(() => { const ap = __game.S.player.ap; ap.demandTakeoff = () => 'dead'; window.__game.wiring.link && (window.__game.wiring.link.demandTakeoff = () => 'dead'); return 1; })()`,
};
const FALSIFY_AT = { freeze: 'stick', stuck: 'land', error: 'throttle', cover: 'bank', deadbutton: 'bank', msgcover: 'stick' };
// what the suite must report for each fault
const FALSIFY_EXPECT = { freeze: /FREEZE|froze/, stuck: /STUCK/, error: /page errors/, cover: /covered/, deadbutton: /airborne again/, msgcover: /screen cover/ };
async function maybeFalsify(at) {
  for (const f of FALSIFY_SET) if (FALSIFY_AT[f] === at) { log(`  !! falsify '${f}' injected before ${at}`); await D.ev(FALSIFY_JS[f]); CASE.falsified.push(f); }
}

async function runCase([plane, diff, orient]) {
  const [w, h] = ORIENT[orient];
  CASE = { id: `${plane}-${diff}-${orient}`, plane, diff, orient, steps: [], blocked: null, events: [], falsified: [], t0: Date.now() };
  B = JETS.includes(plane) ? BJ : B0;
  M = newMon();
  log(`\n== ${CASE.id} (${w}×${h}, timescale ${TS})`);
  await fresh(plane, w, h, diff);

  // 1. boot → menu → Free Flight by a real tap
  await step('boot', 0, async (rec) => {
    const t0 = Date.now();
    const ok = await waitReal(() => D.evSafe('!!window.__krayzeeReady'), B.bootReal * 1000, 300);
    if (!ok) fail(`not ready within ${B.bootReal} s real`);
    rec.bootReal = r1((Date.now() - t0) / 1000);
    const btn = await waitReal(() => D.rect('.kz-btn[data-a="free"]'), 8000);
    if (!btn) fail('menu Free Flight button never visible');
    await D.ev(COVER_INSTALL);
    return `ready ${rec.bootReal}s real`;
  });
  const shots = COVER_SHOTS ? coverShots(D, coverDir(HERE), `${COVER_SHOTS === true ? 'loop' : COVER_SHOTS}-${CASE.id}`, { guard: [D, ['tapAt', 'hold', 'touchStart', 'touchMove', 'touchEnd', 'shot']] }) : null;
  await step('menu→free', 0, async (rec) => {
    const t0 = Date.now();
    await tapUntil('.kz-btn[data-a="free"]', (s) => s.mode === 'play' && s.p, { ms: B.menuToPlayReal * 1000, rec });
    if (M.last.type !== plane) fail(`flying ${M.last.type}, wanted ${plane}`);
    return `playing ${plane} after ${r1((Date.now() - t0) / 1000)}s real`;
  });
  // difficulty by the chip a player taps on the ground before the first lift-off
  // difficulty is also seeded in settings: at 4× the Bathtub lifts off ~2 s real after spawn and the chips go with it
  await step('difficulty chip', 0, async (rec) => {
    const sel = `.krz-diff [data-d="${diff}"]`;
    if (!(await D.rect(sel))) {
      const s = await snap();
      (rec.warn ||= []).push(`chips gone before the tap (${s.p?.gnd ? 'on the ground' : 'airborne'}, ${r1(s.simT)} s sim after spawn)`);
      if (s.diff !== diff) fail(`difficulty ${s.diff}, wanted ${diff}`);
      return `difficulty ${s.diff} (seeded)`;
    }
    // the selected chip confirms and fades the set (HUD4); another chip applies and fades it
    try {
      await tapUntil(sel, async (s) => s.diff === diff && (await D.evSafe('!!document.querySelector(".krz-chips")?.classList.contains("gone")')), { rec, ms: 2500 });
    } catch (e) {
      // the chips fade the moment the plane lifts off: an F-35 in afterburner is airborne ~5 s sim after spawn (1.3 s real at
      // 4×), so the chip can vanish between finding it and tapping it. Same rule as above: gone = WARN, seeded difficulty counts
      if (await D.rect(sel)) throw e;
      const s = await snap();
      (rec.warn ||= []).push(`chips went while tapping (${s.p?.gnd ? 'on the ground' : 'airborne'}, ${r1(s.simT)} s sim after spawn)`);
      if (s.diff !== diff) fail(`difficulty ${s.diff}, wanted ${diff}`);
      return `difficulty ${s.diff} (seeded)`;
    }
    return `difficulty ${M.last.diff} by chip`;
  });

  // 2. take off (the AP rolls at once in Free Flight)
  await step('takeoff', B.liftoff + B.climb60, async (rec) => {
    const a = await until((s) => s.p && !s.p.gnd, B.liftoff, { label: 'liftoff' });
    rec.liftoffSim = r1(a.simS);
    await until((s) => s.p && s.p.agl >= 60, B.climb60, { label: 'climb to 60 m AGL' });
    return `liftoff ${rec.liftoffSim}s sim`;
  });

  // time warp: 1× → 2× → 5× by taps on the chip; measured sim rate against the 1× rate, then back to 1×
  await step('time warp', 0, async (rec) => {
    const rate = async (ms) => { const a = await snap(), t0 = Date.now(); await sleep(ms); const b = await snap(); return (b.simT - a.simT) / ((Date.now() - t0) / 1000); };
    const base = await rate(2500);
    // D18 drops the warp back to 1× on a conflict ("Traffic nearby"); a player sees the reason and tries again later
    const lvl = () => D.evSafe('document.querySelector(".krz-warp")?.dataset.level');
    const reason = () => D.evSafe('document.querySelector(".krz-warp small")?.textContent || ""');
    const s0 = M.last.simT;
    let refused = '';
    for (;;) {
      await D.tap('.krz-warp'); await sleep(350);
      if ((await lvl()) === '2') break;
      refused = (await reason()) || refused;
      if (M.last.simT - s0 > 90) fail(`warp refused for 90 s sim after takeoff: "${refused}"`);
      await sleep(5000 / TS); await snap();
    }
    if (refused) (rec.warn ||= []).push(`warp refused for ${r1(M.last.simT - s0)} s sim ("${refused}")`);
    await tapUntil('.krz-warp', () => D.evSafe('document.querySelector(".krz-warp")?.dataset.level === "5"'), { rec });
    const st = await D.evSafe('document.querySelector(".krz-warp")?.dataset.state');
    const r5 = await rate(2500);
    const why = await D.evSafe('document.querySelector(".krz-warp small")?.textContent || ""');
    await tapUntil('.krz-warp', () => D.evSafe('document.querySelector(".krz-warp")?.dataset.level === "1"'), { rec });
    rec.warp = { base: r1(base), at5: r1(r5), ratio: r1(r5 / base), chip: st, why };
    if (st === 'held') return `5× HELD at 1× (${why}) — not measurable here; base ${r1(base)} sim s/s`;
    if (r5 / base < B.warpRatio5) fail(`5× gave only ×${r1(r5 / base)} (base ${r1(base)}, at 5× ${r1(r5)} sim s/s)`);
    return `sim rate ${r1(base)} → ${r1(r5)} s/s (×${r1(r5 / base)})`;
  }, { needs: false });

  // 3. grab the stick, fly a bit, let go: the AP takes back
  await maybeFalsify('stick');
  await step('stick+release', B.stickHold + B.apBack + 20, async (rec) => {
    const base = await D.rect('.krz-stick-base');
    if (!base) fail('stick base not visible');
    if (!(await D.onTop('.krz-stick-zone', base.cx, base.cy))) fail('the stick zone is covered at the stick base');
    let manualSeen = 0;
    const s0 = await snap();
    await D.hold(base.cx, base.cy, 32, 10, (B.stickHold / TS) * 1000, async () => { const s = await snap(); if (s?.p?.modes?.aileron === 'manual') manualSeen++; });
    const s1 = await snap();
    rec.manualSim = r1(s1.simT - s0.simT);
    if (!manualSeen) fail('aileron never went manual while the thumb was on the stick');
    const back = await until((s) => s.p && s.p.apMode === 'AUTOPILOT' && Object.values(s.p.modes).every((m) => m === 'auto' || m === 'latched'), B.apBack, { label: 'AP takes back' });
    rec.apBackSim = r1(back.simS);
    if (M.crashes) fail('crashed during the manual bit');
    // the AP may be mid-turn on its circuit, so "recovered" = back inside a normal AP bank (≤ 35°) and not sinking hard
    const rcv = await until((s) => s.p && Math.abs(s.p.bank) <= 35 && s.p.fpm > -1500, 12, { label: 'recovered after release (|bank| ≤ 35°, sink < 1500 fpm)' });
    rec.recoverSim = r1(rcv.simS);
    return `manual ${rec.manualSim}s sim, bank ${r1(s1.p.bank)}°, AP back in ${rec.apBackSim}s sim`;
  });

  // 4. latch the throttle, hold, then AUTO
  await maybeFalsify('throttle');
  await step('throttle latch+AUTO', 40, async (rec) => {
    const t = await D.rect('.krz-thr');
    if (!t) fail('throttle not visible');
    const yOf = (v) => t.y + 14 + (1 - v) * (t.h - 28);
    const id = 90 + Math.floor(Math.random() * 9);
    await D.touchStart(t.cx, yOf(0.55), id);
    for (let i = 0; i < 4; i++) { await sleep(40); await D.touchMove(t.cx, yOf(0.52 - i * 0.01), id); }
    await D.touchEnd();
    const l = await until((s) => s.p && (s.p.thrMode === 'latched' || s.p.thrMode === 'manual'), B.latch, { label: 'throttle latched' });
    const v0 = l.s.p.thr;
    const h0 = l.s.simT;
    let drift = 0, lost = null;
    await until((s) => { if (s.p.thrMode !== 'latched' && s.p.thrMode !== 'manual') lost = s.p.thrMode; drift = Math.max(drift, Math.abs(s.p.thr - v0)); return lost || s.simT - h0 >= B.latchHold; }, B.latchHold + 2, { label: 'latch holds' });
    if (lost) fail(`latch dropped to '${lost}' within ${B.latchHold}s sim without AUTO`);
    if (Math.abs(v0 - 0.5) > 0.15) fail(`latched at ${v0}, thumb left it at ~0.49`);
    if (!(await D.rect('.krz-thr-auto'))) fail('AUTO detent not visible while latched');
    await tapUntil('.krz-thr-auto', (s) => s.p && s.p.thrMode !== 'latched' && s.p.thrMode !== 'manual', { rec });
    await until((s) => s.p.thrMode === 'auto', B.thrAuto, { label: 'throttle back to auto' });
    return `latched ${v0} (drift ${r1(drift)}), AUTO ok`;
  });

  // view toggle: chase → center → cockpit → chase by the view button
  await step('view toggle', 0, async (rec) => {
    const seen = [M.last.view];
    for (let i = 0; i < 3; i++) {
      const before = seen[seen.length - 1];
      await tapUntil('[data-act="view"]', (s) => s.view !== before, { rec });
      seen.push(M.last.view);
      if (SHOTS) await D.shot(OUT, `${CASE.id}-view-${M.last.view}`);
    }
    if (seen.join('>') !== 'chase>center>cockpit>chase') fail(`cycle was ${seen.join('>')}`);
    return seen.join('>');
  }, { needs: false });

  // probe: LAND pressed on our own downwind (PLAYTEST_3 #3 picked a field 2-4 km away); cancelled by a stick touch
  // jets: a fast circuit can be flown and landed (and the plane parked: "the tower is making you wait") while the steps above
  // run; a player would DEMAND TAKEOFF and go round again, so the suite does that before the LAND steps
  const relaunch = async (rec) => {
    if (!JETS.includes(CASE.plane)) return;
    const s0 = await snap();
    if (!s0.p?.gnd) return;
    await until((s) => s.ground?.takeoff, 90, { label: 'DEMAND TAKEOFF offered (jet already landed)' });
    await tapUntil('.krz-gbtn-to', (s) => !s.p.gnd || s.p.kt > 3, { rec, ms: 2500 });
    await until((s) => s.p && !s.p.gnd && s.p.agl > 30, 300, { label: 'airborne again' });
    rec.relaunched = true;
  };
  await step('LAND probe downwind', JETS.includes(CASE.plane) ? 600 : 30, async (rec) => {
    await relaunch(rec);
    // jets fly the circuit fast and ATC may stretch the downwind out of LAND's reach: any circuit leg before base will do
    // (the herc's short circuit is often on base by the time this step starts: base is still the home circuit)
    const legs = JETS.includes(CASE.plane) ? /^(CROSSWIND|DOWNWIND|UPWIND|BASE)$/ : /^DOWNWIND$/;
    await until((s) => legs.test(s.p?.phase || '') && (!JETS.includes(CASE.plane) || s.p.agl > 100) && s.land && !s.land.hidden && s.land.state === 'idle', 240, { label: 'downwind with LAND available' });
    await tapUntil('.krz-land', (s) => s.land?.state === 'active', { rec, ms: 2000 });
    rec.pick = M.last.land.txt; rec.landing = M.last.p.landing;
    // LAND NOW (shown while LAND flies a circuit/join) must switch the plan to straight ahead and keep LAND active
    if (await waitReal(() => D.evSafe('document.querySelector(".krz-land")?.dataset.now === "1"'), 2500)) {
      await tapUntil('.krz-land-now', (s) => /straight/.test(s.p?.landing || ''), { rec, ms: 2500 }).catch((e) => { rec.landNowErr = e.message; });
      const s = await snap();
      rec.landNow = { landing: s.p?.landing, land: s.land?.state };
      if (rec.landNowErr || s.land?.state !== 'active') (rec.warn ||= []).push(`LAND NOW: ${rec.landNowErr || 'LAND no longer active'} (${s.p?.landing})`);
    }
    const b = await D.rect('.krz-stick-base');
    await D.hold(b.cx, b.cy, 18, 0, 500);
    await until((s) => s.land?.state !== 'active', 6, { label: 'a stick touch cancels LAND' });
    await until((s) => s.p.apMode === 'AUTOPILOT', 15, { label: 'AP back after cancel' });
    if (/FIELD/i.test(rec.landing || rec.pick)) fail(`LAND on the home downwind picked ${rec.landing} ("${rec.pick}")${rec.landNow ? `; LAND NOW → ${rec.landNow.landing} (LAND ${rec.landNow.land})` : ''}`);
    return `picked ${rec.landing}${rec.landNow ? `; LAND NOW → ${rec.landNow.landing}` : '; no LAND NOW'}; stick cancelled it`;
  }, { needs: false });

  // 5. LAND (+ LAND NOW when shown) → touchdown → 6. stop. Pressed on final, runway ahead, as D13 expects.
  await maybeFalsify('land');
  await step('LAND', 0, async (rec) => {
    await relaunch(rec);
    await D.evSafe(LOAD_ROUTES);
    const w = await until((s) => { const g = rwyGeom(s); return s.land && !s.land.hidden && s.land.state === 'idle' && g && g.dist < 3500 && g.off < 25 && g.align < 30; }, B.waitFinal, { label: 'runway ahead within 3.5 km with LAND available' });
    rec.waitFinalSim = r1(w.simS);
    const g0 = rwyGeom(M.last);
    rec.at = { dist: Math.round(g0.dist), off: Math.round(g0.off), agl: Math.round(M.last.p.agl), phase: M.last.p.phase, rwy: g0.id };
    await tapUntil('.krz-land', (s) => s.land?.state === 'active', { rec, ms: 2000 });
    const a = M.last;
    rec.pick = a.land.txt; rec.landing = a.p.landing;
    const now = await waitReal(() => D.evSafe('document.querySelector(".krz-land")?.dataset.now === "1"'), 4000 / Math.max(1, TS / 2));
    rec.landNowShown = !!now;
    if (now) {
      const r = await D.rect('.krz-land-now');
      rec.landNowRect = r && { y: Math.round(r.y), h: Math.round(r.h) };
      if (MAIN_LANDNOW) { await tapUntil('.krz-land-now', (s) => /straight/i.test(s.p?.landing || '') || s.land?.now === false, { rec, ms: 2500 }); rec.landNowTapped = true; rec.landing = M.last.p.landing; }
    }
    const td = await until((s) => s.p && s.p.gnd, B.touchdown, { label: 'touchdown' });
    if (M.crashes) fail('crashed on the LAND approach');
    rec.touchdownSim = r1(td.simS);
    rec.surface = td.s.p.surf;
    return `final reached ${rec.waitFinalSim}s after the probe; tapped ${rec.at.dist} m from RWY ${rec.at.rwy} (${rec.at.phase}, ${rec.at.agl} m AGL): ${rec.landing}; LAND NOW ${now ? (rec.landNowTapped ? 'tapped' : 'shown, not tapped') : 'absent'}; touchdown ${rec.touchdownSim}s sim on ${rec.surface}`;
  });
  await step('stop', B.stop, async () => {
    const st = await until((s) => s.p && s.p.gnd && (s.p.kt < 1 || s.finish?.state === 'ready'), B.stop, { label: 'stopped (or DEMAND IT lit)' });
    if (M.crashes) fail(`crashed: ${JSON.stringify(M.events.filter((e) => e.type === 'crash'))}`);
    return `${st.s.p.kt < 1 ? 'stopped' : `DEMAND IT lit at ${r1(st.s.p.kt)} kt`} on ${st.s.p.surf} at (${Math.round(st.s.p.x)},${Math.round(st.s.p.z)})`;
  });

  // 7. DEMAND IT: banks + refuels. On Hard the AP may taxi to the stand first; we wait, as a player would.
  await maybeFalsify('bank');
  await step('DEMAND IT', B.demandReady + B.banked, async (rec) => {
    let lastWhy = '', idleSince = null, autoBank = null;
    const pp0 = M.last.pending, bk0 = M.last.banked;
    const r = await until((s) => {
      if (s.finish?.state === 'greyed') lastWhy = s.finish.reason;
      if (!autoBank && pp0 > 0 && s.pending === 0 && s.banked > bk0) autoBank = { simT: s.simT, amount: s.banked - bk0 };
      // the AP has finished and the plane sits still with no way to DEMAND IT: a player would be stranded here
      const idle = s.p?.done && s.p.kt < 1 && s.finish?.state !== 'ready';
      idleSince = idle ? (idleSince ?? s.simT) : null;
      if (idle && s.simT - idleSince > 40) fail(`AP done and stopped for 40 s sim on ${s.p.surf}; DEMAND IT ${s.finish?.state} "${s.finish?.reason || lastWhy}"${autoBank ? `; auto-banked ${autoBank.amount} PP without a tap` : ''}`);
      return s.finish?.state === 'ready';
    }, B.demandReady, { label: `DEMAND IT ready (last: ${lastWhy || 'hidden'})` }).catch((e) => fail(e.message.startsWith('AP done') ? e.message : `${e.message}; button ${M.last.finish?.state} "${M.last.finish?.reason || lastWhy}" on ${M.last.p?.surf}`));
    rec.readySim = r1(r.simS);
    rec.greyedWhy = lastWhy;
    const pend = M.last.pending, bank0 = M.last.banked, fuel0 = M.last.p.fuel;
    await tapUntil('.krz-finish', (s) => s.banked > bank0 || (pend === 0 && s.finish?.state === 'hidden'), { rec, ms: 2500 });
    const s = M.last;
    rec.fuel = [r1(fuel0), r1(s.p.fuel)];
    if (s.pending !== 0) fail(`pending ${s.pending} after DEMAND IT`);
    if (s.p.fuel != null && s.p.fuel < 0.999) fail(`not refuelled (fuel ${s.p.fuel})`);
    return `ready after ${rec.readySim}s sim${lastWhy ? ` (was greyed: ${lastWhy})` : ''}; banked ${pend} PP (${bank0}→${s.banked}); fuel ${fuel0?.toFixed(3)}→${s.p.fuel?.toFixed(3)}`;
  }, { blocks: false });
  // the D24 headline reel can open after a bank: a player skips it
  if (await waitReal(() => D.rect('.krz-reel'), 3500)) await skipReel();

  // 8. DEMAND TAKEOFF → 9. airborne again
  await step('DEMAND TAKEOFF', B.takeoffBtn + B.airborne2, async (rec) => {
    const b = await until((s) => s.ground?.takeoff, B.takeoffBtn, { label: 'DEMAND TAKEOFF offered' });
    rec.offeredSim = r1(b.simS);
    // the Herald reel hides the action buttons while it is open (after a rank-up ceremony it opens late): skip it
    const t0 = Date.now();
    const vis = await waitReal(async () => { if (await skipReel()) rec.reelSkipped = true; return D.rect('.krz-gbtn-to'); }, 12000, 400);
    if (!vis) fail(`DEMAND TAKEOFF offered by the game but not visible for 12 s real (reel ${rec.reelSkipped ? 'skipped' : 'not seen'})`);
    if (rec.reelSkipped) rec.reelWaitReal = r1((Date.now() - t0) / 1000);
    const nDT = () => D.evSafe('__game.log().filter((l) => l.type === "demandTakeoff").length', 0);
    const n0 = await nDT();
    await tapUntil('.krz-gbtn-to', async (s) => !s.p.gnd || (await nDT()) > n0, { rec, ms: 2500 });
    const a = await until((s) => s.p && !s.p.gnd && s.p.agl > 10, B.airborne2, { label: 'airborne again' });
    rec.airborneSim = r1(a.simS);
    return `offered after ${rec.offeredSim}s, airborne ${rec.airborneSim}s sim after the tap; PP ${M.last.pending} pending`;
  });

  // what the AP will fly next: a player's route must never end in an AI despawn leg (it flies off the map → GONE)
  await step('route after takeoff', 0, async (rec) => {
    const rt = await D.evSafe('(() => { const r = __game.S.player.ap.route; return r && { name: r.name, legs: r.legs.map((l) => l.kind), loop: r.loop }; })()');
    rec.route = rt;
    if (rt?.legs?.at(-1) === 'despawn') fail(`player's AP route is "${rt.name}" ending in a despawn leg: ${rt.legs.join('>')}`);
    return `${rt?.name}: ${rt?.legs?.join('>')} (loop ${rt?.loop})`;
  }, { blocks: false });

  // field branch: LAND during the climb-out (runway behind) → a field; DEMAND TAKEOFF must be offered there
  await step('field: LAND', B.fieldTouchdown + 30, async (rec) => {
    await until((s) => s.p && s.p.agl >= 80 && s.land && !s.land.hidden && s.land.state === 'idle', 90, { label: 'climb-out, LAND available' });
    await tapUntil('.krz-land', (s) => s.land?.state === 'active', { rec, ms: 2000 });
    rec.pick = M.last.land.txt; rec.landing = M.last.p.landing;
    const now = await waitReal(() => D.evSafe('document.querySelector(".krz-land")?.dataset.now === "1"'), 2500);
    if (now) { await tapUntil('.krz-land-now', (s) => s.land?.now === false || /straight/i.test(s.p?.landing || ''), { rec, ms: 2500 }); rec.landNow = true; rec.landing = M.last.p.landing; }
    const td = await until((s) => s.p && s.p.gnd, B.fieldTouchdown, { label: 'field touchdown' });
    if (M.crashes) fail('crashed landing in the field');
    rec.surface = td.s.p.surf;
    if (JETS.includes(CASE.plane) && rec.surface !== 'runway') fail(`a jet (${CASE.plane}) landed on ${rec.surface}: LAND must only pick runways`);
    await until((s) => s.p.gnd && s.p.kt < 1, B.fieldStop, { label: 'stopped in the field' });
    if (M.crashes) fail(`crashed in the field: ${JSON.stringify(M.events.filter((e) => e.type === 'crash'))}`);
    return `${rec.pick} [${rec.landing}]${now ? ' + LAND NOW' : ''}; touchdown on ${rec.surface} after ${r1(td.simS)}s sim`;
  });
  await step('field: DEMAND TAKEOFF', B.fieldTakeoffBtn + B.fieldAirborne, async (rec) => {
    const s0 = M.last;
    rec.finish = s0.finish;
    // a field inside the finish zone (Easy, < 300 m from the runway) offers DEMAND IT first; DEMAND TAKEOFF follows the bank
    if (s0.finish?.state === 'ready') {
      await tapUntil('.krz-finish', () => D.evSafe('document.querySelector(".krz-finish")?.dataset.state !== "ready"'), { rec, ms: 2500 });
      rec.bankedFirst = true;
    }
    const b = await until((s) => s.ground?.takeoff, B.fieldTakeoffBtn, { label: `DEMAND TAKEOFF offered on ${s0.p?.surf} (DEMAND IT ${s0.finish?.state} "${s0.finish?.reason}")` });
    const nDT = () => D.evSafe('__game.log().filter((l) => l.type === "demandTakeoff").length', 0);
    const n0 = await nDT();
    await tapUntil('.krz-gbtn-to', async (s) => !s.p.gnd || (await nDT()) > n0, { rec, ms: 2500 });
    const a = await until((s) => s.p && !s.p.gnd && s.p.agl > 10, B.fieldAirborne, { label: 'airborne from the field' });
    return `${rec.bankedFirst ? "banked first (in zone); " : ""}offered ${r1(b.simS)}s after stop (DEMAND IT ${s0.finish?.state}${s0.finish?.reason ? ': ' + s0.finish.reason : ''}); airborne ${r1(a.simS)}s sim`;
  });

  // quit with pending PP: the confirm must appear and show the number; Keep flying keeps the game; Quit ends it
  await step('quit confirm', 0, async (rec) => {
    let pend = M.last.pending;
    if (!(pend > 0)) {
      // earn something the honest way: buzz nothing, just wait for any pending from the departure
      await until((s) => s.pending > 0, 30, { label: 'some pending PP to lose' }).catch(() => {});
      pend = M.last.pending;
    }
    if (!(pend > 0)) { rec.skip = 'no pending PP'; return 'SKIPPED: pending 0, no confirm expected'; }
    await tapUntil('[data-act="pause"]', () => D.evSafe('!!document.querySelector(".kz-pop.on")'), { rec });
    await sleep(500);
    await tapUntil('.kz-pop.on .kz-btn.danger', () => D.evSafe('!!document.querySelector(".krz-quitc") && !document.querySelector(".krz-quitc").hidden'), { rec });
    const shown = await D.evSafe('document.querySelector(".krz-quitc-pp")?.textContent');
    const want = Math.round(M.last.pending).toLocaleString('en-GB');
    if (shown !== want) fail(`confirm shows ${shown} PP, pending is ${want}`);
    await tapUntil('.krz-quitc-stay', () => D.evSafe('document.querySelector(".krz-quitc").hidden'), { rec });
    if (M.last.mode !== 'play' || !M.last.p) fail('Keep flying left the game');
    await tapUntil('.kz-pop.on .kz-btn.danger', () => D.evSafe('!document.querySelector(".krz-quitc").hidden'), { rec });
    await tapUntil('.krz-quitc-go', (s) => s.mode === 'attract' && !s.p, { rec, ms: 3000 });
    return `confirm "Abandon ${shown} PP?" → Keep flying ok → Quit → menu`;
  }, { needs: false });

  shots?.stop();
  await coverStep(orient);

  CASE.events = M.events;
  CASE.realS = r1((Date.now() - CASE.t0) / 1000);
  CASE.errors = [...new Set(D.errors)].slice(0, 10);
  CASE.ok = CASE.steps.every((s) => s.ok || (s.skip && !s.skip.startsWith('blocked')));
  return CASE;
}
const MAIN_LANDNOW = !!arg('main-landnow', false);

// MSGFIX: how much of the flight view message UI covered over the whole case (airborne samples; all in-play samples too)
async function coverStep(orient) {
  await step('screen cover', 0, async (rec) => {
    const samples = await coverTake(D.ev);
    CASE.cover = { air: summarize(samples, 'air'), play: summarize(samples, 'play'), timescale: TS };
    if (arg('cover-raw', false)) CASE.coverSamples = samples;
    log(`  cover (airborne) ${fmtCover(CASE.cover.air)}`);
    log(`  cover (in play)  ${fmtCover(CASE.cover.play)}`);
    const gate = COVER_GATE || (CASE.falsified.includes('msgcover') ? [12, 25] : null);
    const a = CASE.cover.air;
    if (gate && orient === 'portrait' || gate && CASE.falsified.includes('msgcover')) {
      if (!a.n) fail('screen cover: no airborne samples');
      if (a.mean > gate[0] || a.p90 > gate[1]) fail(`screen cover over the gate: airborne mean ${a.mean}% (≤ ${gate[0]}), p90 ${a.p90}% (≤ ${gate[1]})`);
    }
    return `airborne mean ${a.mean}% p90 ${a.p90}% longest>25% ${a.longest25}s`;
  }, { needs: false });
}

// ---------------------------------------------------------------- soak
// Free Flight left to the AP for N sim minutes; a player thumb grabs the stick every ~3 sim min, DEMAND IT / DEMAND
// TAKEOFF are tapped whenever the plane sits stopped. Freezes, stuck phases, crashes, errors, heap and fps are logged.
async function soak([plane, diff, orient], minutes) {
  const [w, h] = ORIENT[orient];
  CASE = { id: `soak-${plane}-${diff}-${orient}`, plane, diff, orient, steps: [], blocked: null, events: [], falsified: [], t0: Date.now(), timeline: [] };
  M = newMon();
  log(`\n== SOAK ${CASE.id} ${minutes} sim min (timescale ${TS})`);
  await fresh(plane, w, h, diff);
  await step('boot', 0, async () => { if (!(await waitReal(() => D.evSafe('!!window.__krayzeeReady'), B.bootReal * 1000, 300))) fail('not ready'); });
  await step('menu→free', 0, async (rec) => { await tapUntil('.kz-btn[data-a="free"]', (s) => s.mode === 'play' && s.p, { ms: 15000, rec }); });
  await step('difficulty chip', 0, async (rec) => { await tapUntil(`.krz-diff [data-d="${diff}"]`, (s) => s.diff === diff, { rec, ms: 2500 }); });
  await maybeFalsify('stick');
  const s0 = await snap(), sim0 = s0.simT, t0 = Date.now();
  let nextGrab = 60, stoppedSince = null, parkedSince = null, strands = [], lastTL = -999, taps = { grab: 0, demandIt: 0, demandTakeoff: 0, land: 0 }, freezes = [], stucks = [];
  let lastPhaseT = sim0, lastPhase = '';
  const e0 = D.errors.length;
  for (;;) {
    const s = await snap();
    if (!s) { await sleep(500); continue; }
    const t = s.simT - sim0, p = s.p;
    if (t >= minutes * 60) break;
    if ((Date.now() - t0) / 1000 > (minutes * 60 / TS) * 3 + 120) { CASE.events.push({ type: 'realcap', simT: s.simT }); break; }
    if (M.freeze) { freezes.push(M.freeze); log('  FREEZE', JSON.stringify(M.freeze)); try { await D.shot(OUT, `${CASE.id}-freeze-${freezes.length}`); } catch (e) { /* */ } M.freeze = null; M.samples = []; if (freezes.length >= 3) break; }
    const ph = `${p?.phase}|${p?.leg}|${p?.sub}`;
    if (ph !== lastPhase) { lastPhase = ph; lastPhaseT = s.simT; }
    const parked = p?.gnd && p.kt < 1;
    if (!parked && s.simT - lastPhaseT > STUCK * 2 && !stucks.some((x) => x.since === lastPhaseT)) { stucks.push({ since: lastPhaseT, phase: ph, simT: s.simT }); log('  STUCK', ph, r1(s.simT - lastPhaseT)); }
    if (t - lastTL >= 30) {
      lastTL = t;
      const heap = await D.evSafe('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null');
      CASE.timeline.push({ t: Math.round(t), phase: p?.phase, agl: p && Math.round(p.agl), kt: p && Math.round(p.kt), gnd: p?.gnd, pend: s.pending, banked: s.banked, ai: s.ai.length, aiAir: s.ai.filter((a) => !a[4]).length, fps: s.fps, q: s.quality, heap, k: s.simK });
      log(`  t=${Math.round(t)}s ${p?.phase} agl ${p && Math.round(p.agl)} kt ${p && Math.round(p.kt)} PP ${s.pending}/${s.banked} ai ${s.ai.length} fps ${s.fps} heap ${heap}MB`);
    }
    if (await skipReel()) taps.reel = (taps.reel || 0) + 1;
    if (parked) {
      stoppedSince ??= s.simT;
      parkedSince ??= s.simT;
      if (s.simT - parkedSince > 90 && !strands.some((x) => x.since === parkedSince)) {
        strands.push({ since: parkedSince, simT: s.simT, finish: s.finish, ground: s.ground, surf: p.surf });
        log('  STRANDED', JSON.stringify(strands.at(-1)));
        try { await D.shot(OUT, `${CASE.id}-stranded-${strands.length}`); } catch (e) { /* */ }
      }
      if (s.simT - stoppedSince > 8) {
        if (s.finish?.state === 'ready') { if (await D.tap('.krz-finish')) taps.demandIt++; }
        else if (s.ground?.takeoff) { if (await D.tap('.krz-gbtn-to')) taps.demandTakeoff++; }
        stoppedSince = s.simT;
      }
    } else { stoppedSince = null; parkedSince = null; }
    if (p && !p.gnd && p.agl > 120 && t > nextGrab) {
      nextGrab = t + 180;
      const b = await D.rect('.krz-stick-base');
      if (b) { await D.hold(b.cx, b.cy, (taps.grab % 2 ? -1 : 1) * 25, 6, (2 / TS) * 1000); taps.grab++; }
      if (taps.grab % 3 === 0 && s.land?.state === 'idle' && !s.land.hidden) { if (await D.tap('.krz-land')) taps.land++; }
    }
    await sleep(400);
  }
  const s1 = await snap();
  CASE.soak = { simMin: r1((s1.simT - sim0) / 60), realMin: r1((Date.now() - t0) / 60000), taps, freezes, stucks, strands, crashes: M.crashes, errors: [...new Set(D.errors.slice(e0))].slice(0, 10), banked: s1.banked };
  CASE.ok = !freezes.length && !stucks.length && !strands.length && !CASE.soak.errors.length;
  log(`  SOAK ${CASE.ok ? 'PASS' : 'FAIL'} ${JSON.stringify(CASE.soak)}`);
  CASE.realS = r1((Date.now() - CASE.t0) / 1000);
  return CASE;
}

// ---------------------------------------------------------------- main
D = await connect(PORT);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const STEP_LIST = (results) => [...new Set(results.flatMap((r) => r.steps.map((s) => s.step)))];
function table(results) {
  const names = STEP_LIST(results);
  log('\n=== RESULTS (sim seconds per step; ✗ = fail, – = skipped) ===');
  log(['case'.padEnd(26), ...names.map((n) => n.slice(0, 10).padStart(10))].join(' '));
  for (const r of results) log([r.id.padEnd(26), ...names.map((n) => { const s = r.steps.find((x) => x.step === n); return (!s ? '' : s.skip ? '–' : (s.ok ? '' : '✗') + s.simS).padStart(10); })].join(' '));
  const fails = results.flatMap((r) => r.steps.filter((s) => !s.ok && !s.skip).map((s) => `${r.id} · ${s.step}: ${s.detail}${s.shot ? ` [${s.shot.split('/docs/')[1]}]` : ''}`));
  log(`\n${results.filter((r) => r.ok).length}/${results.length} cases green; ${fails.length} failing steps`);
  for (const f of fails) log('  ✗ ' + f);
}
if (FALSIFY_SET.length) {
  // one fresh run per fault; each must be reported by its own detector
  const verdicts = [], results = [];
  const all = FALSIFY_SET;
  for (const f of all) {
    FALSIFY_SET = [f];
    let r;
    try { r = await runCase(CASES[0]); } catch (e) { r = { ...CASE, ok: false, crashErr: e.message }; }
    results.push(r);
    const text = r.steps.filter((s) => !s.ok && !s.skip).map((s) => s.detail).join(' || ');
    const caught = !r.ok && FALSIFY_EXPECT[f].test(text);
    verdicts.push({ fault: f, caught, by: text.slice(0, 300) });
    log(`\nFALSIFY ${f}: ${caught ? 'CAUGHT' : 'NOT CAUGHT'} — ${text.slice(0, 300)}`);
    writeFileSync(join(OUT, `results-${stamp}-falsify.json`), JSON.stringify({ timescale: TS, verdicts, results }, null, 1));
  }
  D.close();
  log('\n=== FALSIFY ===');
  for (const v of verdicts) log(`  ${v.caught ? 'CAUGHT    ' : 'NOT CAUGHT'} ${v.fault}`);
  process.exit(verdicts.every((v) => v.caught) ? 0 : 1);
}
const results = [];
for (const c of CASES) {
  try { results.push(SOAK ? await soak(c, SOAK === true ? 30 : +SOAK) : await runCase(c)); }
  catch (e) { log('  CASE ERROR', e.message); results.push({ ...CASE, ok: false, crashErr: e.message }); }
  writeFileSync(join(OUT, `results-${stamp}${SOAK ? '-soak' : ''}.json`), JSON.stringify({ timescale: TS, results }, null, 1));
}
D.close();
table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
