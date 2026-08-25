#!/usr/bin/env node
/**
 * The p90 framing box measured over REAL duels — the number §4.4.1's whole
 * table is indexed on.
 *
 * The first attempt measured it over tools/pages/hud.html's mission and got a
 * clean-looking 346 wu. It was meaningless: over 64,800 ticks the nearest
 * hostile was a median 2,290 wu away and inside the frame on 2.7% of them. The
 * fixture is not a fight, so the camera sat pinned at zoomIntimate with an
 * empty box and every camera number it produced flattered the build. D99 again.
 *
 * A duel is a fight by construction: two aircraft, 800 m apart, closing.
 *
 *   node tools/p8duelbox.mjs [--runs 40] [--aces A1,A5,...]
 */
import { createCamera } from '../js/core/camera.js';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { M_PER_WU } from '../js/core/math.js';
import { framingContributions, FRAMING } from '../js/sim/entities.js';
import { HULL_M } from '../js/sim/damage.js';
import { ACE_IDS } from '../js/sim/ai.js';
import { createDuel } from '../js/modes/duel.js';

const DT = 1 / 60;
const HULL_WU = HULL_M / M_PER_WU;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(arg('--runs', 40));
const ACES = (arg('--aces', '') || ACE_IDS.join(',')).split(',').filter(Boolean);
const ARENA = Number(arg('--arena', 0));   // positive control: shrink the arena (m)
const CLOSING = arg('--closing', '');      // experiment: relax FRAMING.closingWu
if (CLOSING !== '') { const f = { ...FRAMING, closingWu: Number(CLOSING) }; Object.defineProperty(globalThis, '__none', { value: 0 });
  // FRAMING is frozen; re-implement admission here only for the experiment arm
}

function makeView(mode = 'portrait', w = 390, h = 844) {
  const profile = VIEW_PROFILE[mode];
  const scale = h / profile.worldH;
  return { mode, w, h, dpr: 2, profile, worldH: profile.worldH, worldW: w / scale, scale,
           safe: { top: 0, right: 0, bottom: 0, left: 0 } };
}
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };

const all = { W: [], H: [], MEM: [], Z: [], NEAR: [], HULLPX: [] };
const D = { ticks: 0, inLock: 0, boxed: 0, onScreen: 0, atFloor: 0 };
let rounds = 0;

for (let i = 0; i < RUNS; i++) {
  const ace = ACES[i % ACES.length];
  const view = makeView();
  const cam = createCamera(view, { bias: 'normal' });
  const d = createDuel({}, { ace, seed: 1000 + i }).begin();
  if (ARENA) d.world.arena.halfW = ARENA;
  const box = [];
  let guard = 0;
  while (!d.done && guard++ < 60 * 90 * 3 + 10) {
    if (!d.step()) break;
    const player = d.entities.player;
    if (!player || !player.alive) continue;
    const pf = player.flight;
    cam.clearTracked();
    framingContributions(d.world, player, box, view.profile.admitWu);   // D129: NOT zoomLockRange
    if (CLOSING !== '') {
      // EXPERIMENT ARM: admit any hostile inside lockRange whose closing beats
      // the relaxed threshold, so the effect of FRAMING.closingWu is isolated.
      const thr = Number(CLOSING), have = new Set(box.map((m) => m.id));
      for (const e of d.world.live) {
        if (e === player || !e.alive || e.side === player.side || have.has(e.id)) continue;
        const f2 = e.flight;
        const dxWu = (f2.sx - pf.sx) / M_PER_WU, dyWu = (f2.sy - pf.sy) / M_PER_WU;
        const dWu = Math.hypot(dxWu, dyWu);
        if (dWu > view.profile.zoomLockRange) continue;
        const rvx = (f2.svx - pf.svx) / M_PER_WU, rvy = (f2.svy - pf.svy) / M_PER_WU;
        const closing = dWu > 1e-6 ? -(rvx * dxWu + rvy * dyWu) / dWu : 0;
        if (closing <= thr) continue;
        box.push({ id: e.id, x: f2.sx / M_PER_WU, y: f2.sy / M_PER_WU, w: 64, h: 64, weight: 1 });
      }
    }
    for (const m of box) cam.track(m.id, m.x, m.y, m.w, m.h, m.weight);
    cam.setPlayerControl(false);
    cam.update({ x: pf.sx / M_PER_WU, y: pf.sy / M_PER_WU, vx: pf.svx / M_PER_WU,
                 vy: pf.svy / M_PER_WU, angle: pf.theta, hull: HULL_WU }, DT);
    all.W.push(cam.box.w); all.H.push(cam.box.h); all.MEM.push(cam.memberCount); all.Z.push(cam.zoom);
    D.ticks++; if (box.length) D.boxed++;
    if (cam.zoom <= view.profile.zoomWide + 1e-4) D.atFloor++;
    // §4.4 P3: on-screen hull of the nearest hostile, css px, at delivered zoom
    let best = Infinity, bestE = null;
    for (const e of d.world.live) {
      if (e === player || !e.alive || e.side === player.side) continue;
      const dd = Math.hypot((e.flight.sx - pf.sx) / M_PER_WU, (e.flight.sy - pf.sy) / M_PER_WU);
      if (dd < best) { best = dd; bestE = e; }
    }
    if (bestE) {
      all.NEAR.push(best);
      if (best <= view.profile.zoomLockRange) D.inLock++;
      const halfW = view.worldW / cam.zoom * 0.5, halfH = view.worldH / cam.zoom * 0.5;
      if (Math.abs(bestE.flight.sx / M_PER_WU - cam.x) <= halfW &&
          Math.abs(bestE.flight.sy / M_PER_WU - cam.y) <= halfH) D.onScreen++;
      all.HULLPX.push(HULL_WU * view.scale * cam.zoom);
    }
  }
  rounds += d.roundIndex;
}

const f = (v, w = 9) => String(Number.isFinite(v) ? (Number.isInteger(v) ? v : v.toFixed(2)) : v).padStart(w);
console.log(`\nP8 DUEL BOX${ARENA ? ' [CONTROL arena ' + ARENA + ' m]' : ''}${CLOSING !== '' ? ' [ARM closingWu=' + CLOSING + ']' : ''} — ${RUNS} duels (${ACES.length} aces), ${rounds} rounds, ${D.ticks} ticks`);
console.log(`portrait 390x844: worldW 462.09 wu, scale ${(844 / 1000).toFixed(3)} px/wu, zoomFill 0.85\n`);
console.log('  quantity          p50      p75      p90      p95      max');
console.log('  (zoom row is p05/p10/p25/p50/min so the WIDE tail is visible, not the tight one)');
for (const [n, a] of [['box W (wu)', all.W], ['box H (wu)', all.H], ['members', all.MEM],
                      ['nearest (wu)', all.NEAR], ['hull px', all.HULLPX]])
  console.log(`  ${n.padEnd(14)}${f(pct(a, 50))}${f(pct(a, 75))}${f(pct(a, 90))}${f(pct(a, 95))}${f(pct(a, 100))}`);
console.log(`  ${'delivered z'.padEnd(14)}${f(pct(all.Z, 5))}${f(pct(all.Z, 10))}${f(pct(all.Z, 25))}${f(pct(all.Z, 50))}${f(pct(all.Z, 0))}`);
const p = (n) => `${((n / D.ticks) * 100).toFixed(1)}%`;
console.log(`\n  box has >= 1 hostile member   ${p(D.boxed)}`);
console.log(`  nearest within lockRange      ${p(D.inLock)}`);
console.log(`  nearest inside the frame      ${p(D.onScreen)}`);
console.log(`  delivered zoom at 0.78 floor  ${p(D.atFloor)}`);
const bw = pct(all.W, 90);
console.log(`\n  §4.4.1 on p90 box width ${bw.toFixed(1)} wu -> containment z <= ${(0.85 * 462.09 / bw).toFixed(4)}`);
console.log(`  503 wu = clamp floor reached | 585 wu = PIVOT SIGNAL -> ${bw > 585 ? 'PIVOT SIGNAL' : bw > 503 ? 'clamp must widen to 0.68' : 'inside the auto clamp'}`);
