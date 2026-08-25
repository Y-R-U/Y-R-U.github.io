#!/usr/bin/env node
/**
 * P8b — the LEAD audit, portrait against landscape, measured not argued.
 *
 * D106/D108/D110 fitted portrait's `leadSeconds`/`leadMax` by making them the
 * same FRACTION OF THE FRAME as landscape's — and landscape's 0.70 / 420 were
 * never themselves measured. So the derivation is circular: re-applying D108 to
 * landscape is a no-op by construction. This file measures the thing D110
 * actually judged the fix on instead — how much lead the playfield clamp
 * DISCARDS — in both orientations, on the same engagements.
 *
 * Nothing is re-implemented: the numbers come from `camera.js`'s own
 * `clipTicks` / `clipSumX` / `capTicks` getters, sampled per tick by
 * `p8engage.mjs` and restricted here to ENGAGED ticks (D115).
 *
 *   node tools/p8blead.mjs [--runs 16]
 *   node tools/p8blead.mjs --geometry      # the closed-form headroom table only
 */
import { traceDuel, segment, makeView, pct } from './p8engage.mjs';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { M_PER_WU } from '../js/core/math.js';
import { HULL_M } from '../js/sim/damage.js';
import { ACE_IDS } from '../js/sim/ai.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(arg('--runs', 16));
const HULL_WU = HULL_M / M_PER_WU;
const CRUISE = 280;                    // wu/s, D108's cruise reference
const f3 = (x) => Number(x).toFixed(3);

/* ---------------------------------------------------------- geometry ---- */
/**
 * The closed form of camera.js:428 — where the anchor sits inside the playfield
 * and how much of the frame is left between it and the bound the lead pushes it
 * towards. Both directions are symmetric about the playfield centre, so one
 * number covers east and west.
 */
function geom(mode) {
  const v = makeView(mode), P = v.profile;
  const pfW = P.playfield.right - P.playfield.left;
  const pfH = P.playfield.bottom - P.playfield.top;
  const mx = HULL_WU * 0.5 / v.worldW, my = HULL_WU * 0.25 / v.worldH;
  // Eastbound the aeroplane sits at anchorX of the playfield and the lead pushes
  // it towards the LEFT bound; westbound it is mirrored to (1-anchorX) and pushed
  // towards the right one. Both headrooms are anchorX*pfW - mx, so one covers both.
  const fxE = P.playfield.left + P.anchorX * pfW;
  const headX = P.anchorX * pfW - mx;                  // frame fractions
  // Vertical: a CLIMB (vy<0) pushes the aeroplane DOWN the screen from
  // anchorYClimb towards playfield.bottom; a DIVE pushes it UP towards top.
  const fyRest = P.playfield.top + P.anchorY * pfH;
  const fyClimb = P.playfield.top + P.anchorYClimb * pfH;
  const fyDive = P.playfield.top + P.anchorYDive * pfH;
  const headUp = P.playfield.bottom - fyClimb - my;    // room a climb's lead has
  const headDn = fyDive - P.playfield.top - my;        // room a dive's lead has
  return { v, P, pfW, pfH, mx, my, fxE, headX, fyRest, fyClimb, fyDive, headUp, headDn,
    vClimbExhaust: headUp * v.worldH / P.leadSeconds,
    vDiveExhaust: headDn * v.worldH / P.leadSeconds,
    leadCruiseWu: P.leadSeconds * CRUISE,
    leadCruiseFrac: P.leadSeconds * CRUISE / v.worldW,
    // the speed at which the lead exactly exhausts the horizontal headroom
    vExhaustX: headX * v.worldW / P.leadSeconds,
    // the speed at which leadMax itself starts to bind
    vCap: P.leadMax / P.leadSeconds,
    leadMaxFrac: P.leadMax / v.worldW,
  };
}

console.log('\n=== GEOMETRY — closed form of camera.js:394-433, both profiles ===\n');
const G = { portrait: geom('portrait'), landscape: geom('landscape') };
const rows = [
  ['view px', (g) => `${g.v.w}x${g.v.h}`],
  ['worldW / worldH (wu)', (g) => `${g.v.worldW.toFixed(1)} / ${g.v.worldH}`],
  ['scale px/wu', (g) => g.v.scale.toFixed(4)],
  ['playfield x [left,right]', (g) => `[${g.P.playfield.left}, ${g.P.playfield.right}] = ${f3(g.pfW)} of frame`],
  ['playfield y [top,bottom]', (g) => `[${g.P.playfield.top}, ${g.P.playfield.bottom}] = ${f3(g.pfH)} of frame`],
  ['playfield W (wu)', (g) => (g.pfW * g.v.worldW).toFixed(1)],
  ['playfield H (wu)', (g) => (g.pfH * g.v.worldH).toFixed(1)],
  ['anchorX', (g) => String(g.P.anchorX)],
  ['anchor x, frame fraction', (g) => f3(g.fxE)],
  ['hull half-width mx', (g) => f3(g.mx)],
  ['HORIZ HEADROOM, frame frac', (g) => f3(g.headX)],
  ['HORIZ HEADROOM, px', (g) => (g.headX * g.v.w).toFixed(1)],
  ['HORIZ HEADROOM, wu', (g) => (g.headX * g.v.worldW).toFixed(1)],
  ['leadSeconds', (g) => String(g.P.leadSeconds)],
  ['lead at 280 wu/s (wu)', (g) => g.leadCruiseWu.toFixed(1)],
  ['  ...as frac of FRAME', (g) => f3(g.leadCruiseFrac)],
  ['  ...as frac of PLAYFIELD', (g) => f3(g.leadCruiseWu / (g.pfW * g.v.worldW))],
  ['  ...as frac of HEADROOM', (g) => f3(g.leadCruiseFrac / g.headX)],
  ['speed where lead = headroom', (g) => `${g.vExhaustX.toFixed(0)} wu/s = ${(g.vExhaustX * M_PER_WU).toFixed(1)} m/s`],
  ['leadMax', (g) => String(g.P.leadMax)],
  ['  ...as frac of frame', (g) => f3(g.leadMaxFrac)],
  ['speed where leadMax binds', (g) => `${g.vCap.toFixed(0)} wu/s = ${(g.vCap * M_PER_WU).toFixed(1)} m/s`],
  ['anchorY rest, in playfield', (g) => `${g.P.anchorY} -> frame ${f3(g.fyRest)}`],
  ['anchorYClimb / Dive', (g) => `${g.P.anchorYClimb} / ${g.P.anchorYDive} -> frame ${f3(g.fyClimb)} / ${f3(g.fyDive)}`],
  ['CLIMB headroom (frac / wu)', (g) => `${f3(g.headUp)} / ${(g.headUp * g.v.worldH).toFixed(0)} wu`],
  ['DIVE  headroom (frac / wu)', (g) => `${f3(g.headDn)} / ${(g.headDn * g.v.worldH).toFixed(0)} wu`],
  ['vy where climb lead exhausts', (g) => `${g.vClimbExhaust.toFixed(0)} wu/s = ${(g.vClimbExhaust * M_PER_WU).toFixed(1)} m/s`],
  ['vy where dive lead exhausts', (g) => `${g.vDiveExhaust.toFixed(0)} wu/s = ${(g.vDiveExhaust * M_PER_WU).toFixed(1)} m/s`],
];
console.log(`  ${'quantity'.padEnd(30)} ${'PORTRAIT'.padEnd(30)} LANDSCAPE`);
for (const [name, fn] of rows)
  console.log(`  ${name.padEnd(30)} ${String(fn(G.portrait)).padEnd(30)} ${fn(G.landscape)}`);

if (argv.includes('--geometry')) process.exit(0);

/* ------------------------------------------------------------ measured -- */
console.log(`\n=== MEASURED — ${RUNS} duels per orientation, engaged ticks only (D115) ===\n`);

/**
 * `lead` is a BREAK-SWITCH, not a retune: it clones the profile so nothing in
 * `VIEW_PROFILE` is mutated, and exists so the clip counter can be shown to move
 * in BOTH directions. A counter never driven to 0 and to saturation is not
 * evidence that it measures the lead (D47, and the rule the whole resume ran on).
 */
function measure(mode, lead = null) {
  const view = makeView(mode);
  if (lead !== null) view.profile = { ...view.profile, leadSeconds: lead };
  let engT = 0, allT = 0, clip = 0, cap = 0, sx = 0, sy = 0, segs = 0, clipXT = 0, clipYT = 0;
  const spd = [], clipPx = [];
  for (let i = 0; i < RUNS; i++) {
    const T = traceDuel({ ace: ACE_IDS[i % ACE_IDS.length], seed: 1000 + i, view });
    allT += T.sep.length;
    for (const s of segment(T)) {
      segs++;
      for (let k = s.i0; k <= s.i1; k++) {
        engT++; clip += T.clip[k]; cap += T.cap[k]; sx += T.clipX[k]; sy += T.clipY[k];
        if (T.clipX[k] > 0) clipXT++;
        if (T.clipY[k] > 0) clipYT++;
        spd.push(T.speed[k]);
        clipPx.push(T.clipX[k] * view.w);
      }
    }
  }
  return { mode, view, engT, allT, segs, clip, cap, sx, sy, spd, clipPx, clipXT, clipYT };
}

const M = { portrait: measure('portrait'), landscape: measure('landscape') };
const mrows = [
  ['engagements', (m) => m.segs],
  ['engaged ticks / all ticks', (m) => `${m.engT} / ${m.allT} = ${(100 * m.engT / m.allT).toFixed(1)}%`],
  ['speed p50 / p90 (wu/s)', (m) => `${pct(m.spd, 50).toFixed(0)} / ${pct(m.spd, 90).toFixed(0)}`],
  ['speed p50 / p90 (m/s)', (m) => `${(pct(m.spd, 50) * M_PER_WU).toFixed(1)} / ${(pct(m.spd, 90) * M_PER_WU).toFixed(1)}`],
  ['CLIP ticks (clamp cut lead)', (m) => `${m.clip} = ${(100 * m.clip / m.engT).toFixed(1)}% of engaged`],
  ['  ...of which HORIZONTAL', (m) => `${m.clipXT} = ${(100 * m.clipXT / m.engT).toFixed(1)}% of engaged`],
  ['  ...of which VERTICAL', (m) => `${m.clipYT} = ${(100 * m.clipYT / m.engT).toFixed(1)}% of engaged`],
  ['leadMax CAP ticks', (m) => `${m.cap} = ${(100 * m.cap / m.engT).toFixed(1)}% of engaged`],
  ['lead discarded, mean px/tick x', (m) => (m.sx * m.view.w / m.engT).toFixed(2)],
  ['lead discarded, mean px/tick y', (m) => (m.sy * m.view.h / m.engT).toFixed(2)],
  ['x discard, frac of frame/tick', (m) => f3(m.sx / m.engT)],
  ['x discard p90 on clipped ticks', (m) => {
    const c = m.clipPx.filter((v) => v > 0);
    return c.length ? `${pct(c, 90).toFixed(1)} px (n=${c.length})` : 'none';
  }],
];
console.log(`  ${'quantity'.padEnd(30)} ${'PORTRAIT'.padEnd(30)} LANDSCAPE`);
for (const [name, fn] of mrows)
  console.log(`  ${name.padEnd(30)} ${String(fn(M.portrait)).padEnd(30)} ${fn(M.landscape)}`);
console.log('');

/* --- falsification: drive the clip counter to both ends ------------------ */
const LEADS = (arg('--leads', '0,0.27,0.70,2.0')).split(',').map(Number);
console.log('=== BREAK-SWITCH — leadSeconds forced, same 16 duels, engaged ticks ===');
console.log('   (a cloned profile, never a mutation of VIEW_PROFILE)\n');
console.log(`  ${'leadSeconds'.padEnd(13)} ${'PORTRAIT clipX% / clipY%'.padEnd(28)} LANDSCAPE clipX% / clipY%`);
for (const L of LEADS) {
  const p = measure('portrait', L), l = measure('landscape', L);
  const fmt = (m) => `${(100 * m.clipXT / m.engT).toFixed(1)}% / ${(100 * m.clipYT / m.engT).toFixed(1)}%`;
  const tag = L === 0 ? '0 (none)' : L === VIEW_PROFILE.portrait.leadSeconds ? `${L} (shipped P)`
    : L === VIEW_PROFILE.landscape.leadSeconds ? `${L} (shipped L)` : String(L);
  console.log(`  ${tag.padEnd(13)} ${fmt(p).padEnd(28)} ${fmt(l)}`);
}
console.log('');
