#!/usr/bin/env node
/**
 * P8 pre-flight probe: what IS the p90 framing box, measured on the real thing?
 *
 * This is not the gate. It answers the one number the whole gate turns on
 * (ARCHITECTURE §4.4.1: 503 wu is the widest fight the auto clamp can frame,
 * 585 wu is the widest portrait can frame at all) before a harness is built
 * around it. It replicates tools/pages/hud.html's mission loop headlessly —
 * same world, same AI, same framingContributions, same camera — minus the
 * renderer, which the box does not depend on.
 *
 *   node tools/p8probe.mjs [--secs 90] [--runs 24] [--foes 3]
 */
import { createBus } from '../js/core/events.js';
import { createRNG } from '../js/core/rng.js';
import { createCamera } from '../js/core/camera.js';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { M_PER_WU } from '../js/core/math.js';
import { createWorld, ENEMY_BY_ID, playerType, framingContributions } from '../js/sim/entities.js';
import { createCrateField } from '../js/sim/crates.js';
import { createAI } from '../js/sim/ai.js';
import { createPilot } from '../js/sim/pilot.js';
import { HULL_M } from '../js/sim/damage.js';

const DT = 1 / 60;
const HULL_WU = HULL_M / M_PER_WU;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const SECS = arg('--secs', 90);
const RUNS = arg('--runs', 24);
const FOES = arg('--foes', 3);

function makeView(mode = 'portrait', w = 390, h = 844) {
  const profile = VIEW_PROFILE[mode];
  const scale = h / profile.worldH;
  return { mode, w, h, dpr: 2, profile, worldH: profile.worldH, worldW: w / scale, scale,
           safe: { top: 0, right: 0, bottom: 0, left: 0 } };
}

function pct(a, p) { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1)))); return s[i]; }

const FOE_IDS = ['shrike', 'wasp', 'kestrel'];

function run(seedTag) {
  const rng = createRNG(seedTag);
  const bus = createBus();
  const view = makeView();
  const cam = createCamera(view, { bias: 'normal' });
  const world = createWorld({ rng, bus }, {});
  world.arena.halfW = 1400; world.arena.lineX = 0;
  const field = createCrateField(world, {
    wind: [[0, -4.5], [300, -5], [900, -5.5], [1500, -5.5]], lineX: 0, groundFire: true });
  world.crates = field;

  const player = world.spawn(playerType('kite_b1', 't2'), {
    id: 'player', side: 1, xM: -120, yM: -520, speed: 42, theta: 0, k: 0.85 });
  player.special = 'shotgun'; player.specialAmmo = 3;
  const advisor = createPilot({ rng: { fork: () => rng.fork('advisor') } }, { tier: 'competent', id: 'player' });
  player.pilot = { tier: 'human', params: advisor.params,
    get intent() { return advisor.intent; },
    setIntent(n, v) { advisor.setIntent(n, v); return this; },
    setAxisX(v) { advisor.setAxisX(v); },
    update(dt, ac) { return advisor.update(dt, ac); } };
  player.ai = createAI(player, { k: 0.85, aggro: 1 });

  for (let i = 0; i < FOES; i++) {
    const e = world.spawn(ENEMY_BY_ID[FOE_IDS[i % FOE_IDS.length]], {
      side: -1, xM: 260 + i * 90, yM: -560 - i * 70, speed: 40, theta: Math.PI, k: 0.55 + i * 0.08 });
    if (e) e.ai = createAI(e, { k: 0.55 + i * 0.08 });
  }
  for (let i = 0; i < 2; i++) field.drop({ xM: -40 + i * 220, yM: -1450, kind: i ? 'ammo' : 'supply' });

  const box = [];
  const W = [], H = [], Z = [], MEM = [], NEED = [], NEAR = [];
  const diag = { ticks: 0, anyLive: 0, inLock: 0, inLock600: 0, closingOK: 0, lofOK: 0, boxed: 0, onScreen: 0 };
  let t = 0, lastSpawn = -99, spawnN = FOES;
  const n = Math.round(SECS / DT);
  for (let i = 0; i < n; i++) {
    world.update(DT); t += DT;
    let live = 0;
    for (const e of world.live) if (e.side !== 1 && !e.dead) live++;
    if (live < FOES && world.t - lastSpawn > 4) {
      lastSpawn = world.t;
      const k = spawnN++;
      const e = world.spawn(ENEMY_BY_ID[FOE_IDS[k % FOE_IDS.length]], {
        side: -1, xM: player.flight.sx + (k % 2 ? 320 : -320), yM: player.flight.sy - 90,
        speed: 44, theta: k % 2 ? Math.PI : 0, k: 0.55 + (k % 3) * 0.08 });
      if (e) e.ai = createAI(e, { k: 0.55 + (k % 3) * 0.08 });
    }
    cam.clearTracked();
    framingContributions(world, player, box, view.profile.admitWu);   // D129: NOT zoomLockRange
    for (const m of box) cam.track(m.id, m.x, m.y, m.w, m.h, m.weight);
    cam.setPlayerControl(false);
    cam.update({ x: player.flight.sx / M_PER_WU, y: player.flight.sy / M_PER_WU,
                 vx: player.flight.svx / M_PER_WU, vy: player.flight.svy / M_PER_WU,
                 angle: player.flight.theta, hull: HULL_WU }, DT);
    if (!player.alive || player.dead) break;
    /* --- why is the box empty? measured, not guessed --- */
    {
      const pf = player.flight, wuOf = (m) => m / M_PER_WU;
      let best = Infinity, bestE = null, anyLive = 0;
      for (const e of world.live) {
        if (e === player || !e.alive || e.side === player.side) continue;
        anyLive++;
        const d = Math.hypot(wuOf(e.flight.sx - pf.sx), wuOf(e.flight.sy - pf.sy));
        if (d < best) { best = d; bestE = e; }
      }
      diag.ticks++;
      if (anyLive) diag.anyLive++;
      if (best < Infinity) NEAR.push(best);
      if (best <= view.profile.zoomLockRange) diag.inLock++;
      if (best <= 600) diag.inLock600++;
      if (box.length) diag.boxed++;
      if (bestE) {
        const f2 = bestE.flight;
        const dxWu = wuOf(f2.sx - pf.sx), dyWu = wuOf(f2.sy - pf.sy), dWu = Math.hypot(dxWu, dyWu);
        const rvx = wuOf(f2.svx - pf.svx), rvy = wuOf(f2.svy - pf.svy);
        const closing = dWu > 1e-6 ? -(rvx * dxWu + rvy * dyWu) / dWu : 0;
        if (closing > 120) diag.closingOK++;
        const halfW = view.worldW / cam.zoom * 0.5, halfH = view.worldH / cam.zoom * 0.5;
        if (Math.abs(wuOf(f2.sx) - cam.x) <= halfW && Math.abs(wuOf(f2.sy) - cam.y) <= halfH) diag.onScreen++;
      }
    }
    W.push(cam.box.w); H.push(cam.box.h); Z.push(cam.zoom); MEM.push(cam.memberCount);
    NEED.push(Math.min(view.worldW / (cam.box.w / view.profile.zoomFill),
                       view.worldH / (cam.box.h / view.profile.zoomFill)));
  }
  return { W, H, Z, MEM, NEED, NEAR, diag, ticks: W.length, alive: player.alive && !player.dead };
}

const all = { W: [], H: [], Z: [], MEM: [], NEED: [], NEAR: [] };
const D = { ticks: 0, anyLive: 0, inLock: 0, inLock600: 0, closingOK: 0, lofOK: 0, boxed: 0, onScreen: 0 };
let died = 0, ticks = 0;
for (let r = 0; r < RUNS; r++) {
  const s = run('p8probe:' + r);
  for (const k of Object.keys(all)) all[k].push(...s[k]);
  for (const k of Object.keys(D)) D[k] += s.diag[k];
  ticks += s.ticks; if (!s.alive) died++;
}
const f = (v, w = 8) => String(typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v).padStart(w);
console.log(`\nP8 PROBE — ${RUNS} runs x ${SECS}s, ${FOES} foes, portrait 390x844 (worldW 462.09 wu)`);
console.log(`  ${ticks} ticks sampled, player died in ${died}/${RUNS} runs\n`);
console.log('  quantity        p50      p75      p90      p95      max');
for (const [name, a] of [['box W (wu)', all.W], ['box H (wu)', all.H], ['members', all.MEM], ['nearest (wu)', all.NEAR],
                         ['delivered z', all.Z], ['needed z', all.NEED]])
  console.log(`  ${name.padEnd(14)}${f(pct(a, 50))}${f(pct(a, 75))}${f(pct(a, 90))}${f(pct(a, 95))}${f(pct(a, 100))}`);
const boxp90 = pct(all.W, 90);
console.log(`\n  §4.4.1 verdict on the p90 box width ${boxp90.toFixed(1)} wu:`);
console.log(`    containment ceiling  z <= ${(0.85 * 462.09 / boxp90).toFixed(4)}`);
console.log(`    503 wu = clamp floor reached | 585 wu = PIVOT SIGNAL`);
console.log(`    -> ${boxp90 > 585 ? 'ABOVE 585: no zoom satisfies both'
              : boxp90 > 503 ? 'between 503 and 585: clamp floor must widen to 0.68'
              : 'inside the auto clamp'}`);
// P8c: this read `<= 0.7801`, a LITERAL of portrait's clamp floor in a
// comparison — orient.mjs's bug verbatim. It fails SILENTLY DOWNWARD: against a
// 0.74 floor it reports 0.0% pinned while the camera sits on the floor all
// mission, which is the believable-wrong shape this project keeps meeting.
const FLOOR = view.profile.zoomWide;
const zLow = all.Z.filter((z) => z <= FLOOR + 1e-4).length / all.Z.length;
console.log(`\n  fraction of ticks pinned at the ${FLOOR} clamp floor: ${(zLow * 100).toFixed(1)}%`);

const p = (n) => `${((n / D.ticks) * 100).toFixed(1)}%`;
console.log(`\n  WHY the box is what it is, over ${D.ticks} ticks:`);
console.log(`    a hostile is alive somewhere        ${p(D.anyLive)}`);
console.log(`    nearest hostile within lockRange    ${p(D.inLock)}   (1400 wu = 210 m)`);
console.log(`    nearest hostile within 600 wu       ${p(D.inLock600)}   (90 m — gun range is 66 m)`);
console.log(`    nearest hostile closing > 120 wu/s  ${p(D.closingOK)}`);
console.log(`    box has >= 1 hostile member         ${p(D.boxed)}`);
console.log(`    nearest hostile inside the frame    ${p(D.onScreen)}`);
