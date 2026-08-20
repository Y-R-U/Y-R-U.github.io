#!/usr/bin/env node
// tools/gates_s2h.mjs — S2-H, street level. Shopfronts, Aaron's venetian blind, and what the
// whole thing costs.
//
//   node tools/gates_s2h.mjs                 # HIGH
//   node tools/gates_s2h.mjs --lite          # the LOW preset
//   node tools/gates_s2h.mjs --falsify       # ADDS four controls that must FAIL
//   node tools/gates_s2h.mjs --headed        # the only run whose ms numbers mean anything
//
// Needs ?debug for two reasons and says so rather than degrading: `probe()` needs
// preserveDrawingBuffer, and `shopPlacements()` is only kept under it.
//
// ── the thing this suite exists to avoid ──────────────────────────────────
//
// Every measurement here is a DIFFERENCE, and a difference of exactly zero is a broken experiment
// far more often than a result. So before any check is allowed to conclude "these two frames are
// the same", C0 proves the same counter can see a difference it is shown on purpose. The first
// pass of tools/cap_s2h.mjs aimed every camera 180 degrees away from its subject and produced four
// districts of frames with no shopfront in them; what caught it was an A/B whose two arms came back
// byte-identical, not a screenshot.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, cleanup, logs } from './shot.mjs';
import { GATES } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LOW = !!args.lite;
const FALSIFY = !!args.falsify;
const W = +(args.w || 844), H = +(args.h || 390);
const DPR = +(args.dpr || 1);
const OUT = resolve(ROOT, 'shots/s2h');
const LITE = LOW ? '&lite=1' : '';
const DEG = 180 / Math.PI;

const SIGNS = JSON.parse(readFileSync(resolve(ROOT, 'data/signs.json'), 'utf8'));
const REG_KEY = new Set(SIGNS.regions.map(r => `${r.u},${r.v},${r.w},${r.h}`));
// The instance buffer is Float32Array, so a region read back off the GPU is 0.4238280951976776
// where data/signs.json says 0.423828125. Keying those as strings never matches — the first run of
// this gate reported all 3,701 regions as absent from a sheet every one of them came out of.
// Matched within 5e-6, which is two orders above float32's error at these magnitudes and two below
// the smallest gap between any two region edges in the bake.
const REG_EPS = 5e-6;
function regionOf(uv) {
  for (const r of SIGNS.regions) {
    if (Math.abs(r.u - uv[0]) < REG_EPS && Math.abs(r.v - uv[1]) < REG_EPS
      && Math.abs(r.w - uv[2]) < REG_EPS && Math.abs(r.h - uv[3]) < REG_EPS) return r;
  }
  return null;
}

// The same district anchors gates_p3a measures its caps at, so "the Lantern Quarter" is the same
// place in both suites and a cap peak can be compared across them.
const SPOTS = [
  ['The Ribs', [-2944, 180, 1920]],
  ['Lantern Quarter', [5504, 180, -10112]],
  ['Sootfields', [3968, 200, -10112]],
  ['The Drownings', [-9088, 160, 5504]],
  ['Vault Row', [-7808, 300, -9088]],
  ['Pale Terrace', [8320, 300, 3968]],
];

// shops.js' SHOP_KINDS order — index 0-2 are eateries, 3-7 are stores.
const KINDS = ['ramen', 'tea', 'bar', 'grocer', 'pharm', 'parts', 'laundry', 'arcade'];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

async function evalP(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `(${expr}).then(v => JSON.stringify(v))`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = JSON.parse(r.result.value);
  if (v && v.error) throw new Error('probe failed: ' + v.error);
  return v;
}

const RING = LOW ? 9 : 25;
async function drain(S) {
  await settle(S, 8);
  for (let i = 0; i < 300; i++) {
    const s = await evalJSON(S, 'window.__state');
    if (s.city.queued === 0 && s.city.near >= RING) { await settle(S, 8); return true; }
    await settle(S, 6);
  }
  throw new Error('the near ring never completed streaming');
}

const cam = (S, pos, yaw, pitch, fov = 62) =>
  evalJSON(S, `(window.__game.setCamera({pos:[${pos}],yaw:${yaw},pitch:${pitch},fov:${fov}}),1)`);

// three's YXZ Euler looks along ( -sin(yaw), -cos(yaw) ), so this is the yaw that looks along
// (dx, dz). Getting the sign backwards aims the camera at the opposite wall, which is exactly how
// the capture tool produced a set of frames that read as a dead feature.
const lookYaw = (dx, dz) => Math.atan2(-dx, -dz) * DEG;

async function grid(S, nx = 28, ny = 16) {
  return (await evalP(S, `window.__game.probe({ grid: [${nx}, ${ny}] })`)).grid.cells.map(c => c.lum);
}

function diff(a, b) {
  if (!a.length || a.length !== b.length) throw new Error(`diff over ${a.length} vs ${b.length} cells — a zero from this would mean nothing`);
  let sum = 0, worst = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; if (d > worst) worst = d; }
  return { mean: +(sum / a.length).toFixed(5), worst: +worst.toFixed(5) };
}

async function shoot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2h/${name}.png`;
}

// Mean and worst frame ms over `secs`, sampled at 10 Hz off __state, after a perf reset.
async function frameMs(S, secs = 3) {
  await evalJSON(S, 'window.__game.resetPerf()');
  const t0 = Date.now(), f = [], wo = [];
  while (Date.now() - t0 < secs * 1000) {
    const s = await evalJSON(S, 'window.__state');
    if (s && s.ms) { f.push(s.ms.frame); wo.push(s.ms.worst); }
    await new Promise(r => setTimeout(r, 100));
  }
  return { mean: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(3), worst: +Math.max(...wo).toFixed(3), n: f.length };
}

// Stand `back` metres off a shopfront's face, looking at its middle. Every camera in this suite is
// DERIVED from a real instance matrix so a frame cannot be aimed at bare wall by accident.
async function faceShop(S, m, back, eye) {
  const px = m.x + m.nx * back, pz = m.z + m.nz * back;
  await cam(S, [px.toFixed(2), eye, pz.toFixed(2)],
    lookYaw(m.x - px, m.z - pz).toFixed(2), (Math.atan2(m.y - eye, back) * DEG).toFixed(2));
  await settle(S, 8);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed });
  const { S, base, close } = ctx;

  await S('Page.navigate', { url: `${base}/index.html?debug=1&var=deepnight&nosave&nohud${LITE}` });
  await waitFor(S, 'window.__ready', 60000);
  await drain(S);
  await evalJSON(S, 'window.__game.freezeTime(true)');

  // ── A1. one field, one draw, and the cap holds in every district ────────
  const peaks = [];
  let capFail = [], emptyDistricts = [];
  for (const [name, p] of SPOTS) {
    await cam(S, p, 20, -6);
    await drain(S);
    const st = await evalJSON(S, 'window.__game.shopState()');
    const bd = await evalJSON(S, 'window.__game.signBreakdown()');
    const row = bd.rows.find(r => r.field === 'shops');
    // The mix is counted off the LIVE field, never off `stats`: those counters are cumulative for
    // the whole session, so by the third district every "district mix" was really the running total
    // of the first three and the six rows came back within 0.6 % of each other. A per-district
    // measurement taken from a global accumulator measures the walk, not the district.
    const live = await evalJSON(S, 'window.__game.shopMeta(0)');
    const mix = {};
    for (const m of live) mix[KINDS[m.kind]] = (mix[KINDS[m.kind]] || 0) + 1;
    peaks.push({ name, n: st.n, cap: st.cap, use: st.n / st.cap, draws: row.draws, overflow: st.overflow, mix });
    if (st.overflow) capFail.push(`${name}: ${st.overflow} dropped`);
    if (st.n === 0) emptyDistricts.push(name);
  }
  const worstUse = Math.max(...peaks.map(p => p.use));
  check('S2-H the shopfront layer is ONE instanced field and ONE draw, and its cap holds everywhere',
    !capFail.length && !emptyDistricts.length && worstUse < 0.95
    && peaks.every(p => p.draws === 1),
    peaks.map(p => `${p.name.padEnd(16)} ${String(p.n).padStart(4)} / ${p.cap} = ${(p.use * 100).toFixed(0).padStart(3)} % `
      + `in ${p.draws} draw`).join('\n      ')
    + `\n      worst cap use ${(worstUse * 100).toFixed(1)} % (a field that overflows drops instances silently)`
    + `\n      overflow: ${capFail.length ? capFail.join('; ') : 'none in any of the six districts sampled'}`
    + `\n      districts with no street trade at all: ${emptyDistricts.length ? emptyDistricts.join(', ') : 'none'}`);

  // ── A2. the district IS a place at street level, not a repaint ──────────
  //
  // The mix has to DIFFER between districts or the whole per-district table is decoration. Measured
  // as total-variation distance between each pair's kind distribution, not asserted.
  const dist = peaks.map(p => {
    const tot = Object.values(p.mix).reduce((a, b) => a + b, 0) || 1;
    return { name: p.name, v: Object.fromEntries(Object.entries(p.mix).map(([k, v]) => [k, v / tot])) };
  });
  let minTV = 1;
  for (let i = 0; i < dist.length; i++) for (let j = i + 1; j < dist.length; j++) {
    let tv = 0;
    for (const k of KINDS) tv += Math.abs((dist[i].v[k] || 0) - (dist[j].v[k] || 0));
    minTV = Math.min(minTV, tv / 2);
  }
  // Aaron asked for eateries and food stores; they must be the plurality, not an option in a list.
  const food = dist.map(d => (d.v.ramen || 0) + (d.v.tea || 0) + (d.v.bar || 0) + (d.v.grocer || 0));
  check('the shop mix differs district to district, and food is the plurality everywhere',
    minTV > 0.06 && Math.min(...food) > 0.5,
    dist.map((d, i) => `${d.name.padEnd(16)} food ${(food[i] * 100).toFixed(0).padStart(3)} %  `
      + KINDS.filter(k => d.v[k]).map(k => `${k} ${(d.v[k] * 100).toFixed(0)}`).join(' ')).join('\n      ')
    + `\n      closest pair of districts differs by a total-variation distance of ${minTV.toFixed(3)} `
    + `(0 would mean the per-district table is decoration)`);

  // ── B1. nothing floats, nothing crosses a setback, nothing wraps a corner ─
  //
  // Re-derived from blocks.js' OWN unit-space box list, not from what shops.js thought it was
  // placing against — the same discipline gates_p3a applies to signage, for the same reason.
  await cam(S, SPOTS[1][1], 20, -6);
  await drain(S);
  const boxesByProto = await evalJSON(S, 'window.__game.protoBoxes()');
  const place = await evalJSON(S, 'window.__game.shopPlacements(0)');
  const audit = { n: 0, float: [], tall: [], overrun: [], buried: [], ground: [] };
  for (const m of place) {
    audit.n++;
    const boxes = boxesByProto[m.proto];
    if (!boxes) continue;
    // strip the stand-off back off to recover the wall point
    const wx = m.x - m.nx * m.proud, wz = m.z - m.nz * m.proud;
    const ux = (wx - m.bx) / m.bw, uz = (wz - m.bz) / m.bd;

    if (m.face >= 4) {                                  // a `drum` facet
      const r = Math.hypot(ux, uz), inr = 0.5 * Math.cos(Math.PI / 10);
      if (Math.abs(r - inr) > 0.02) audit.float.push(`drum r=${r.toFixed(3)} want ${inr.toFixed(3)}`);
      continue;
    }
    // `bridged` is TWO masses standing side by side and both of them reach z = 0.50, so a plane
    // match alone picks whichever is first in the list — which reported a perfectly legal shopfront
    // on the second tower as running off the end of the first. The host is the ground box that
    // both lies on the plane AND contains the shopfront's own along-wall position.
    const alongU = Math.abs(m.nx) > 0.5 ? (m.z - m.bz) / m.bd : (m.x - m.bx) / m.bw;
    let host = null;
    for (const b of boxes) {
      if (b.round || b.y0 > 0.005) continue;            // a shopfront is a GROUND floor or nothing
      const on = (m.nx > 0.5 && Math.abs(ux - b.x1) < 0.004) || (m.nx < -0.5 && Math.abs(ux - b.x0) < 0.004)
        || (m.nz > 0.5 && Math.abs(uz - b.z1) < 0.004) || (m.nz < -0.5 && Math.abs(uz - b.z0) < 0.004);
      if (!on) continue;
      const lo = Math.abs(m.nx) > 0.5 ? b.z0 : b.x0, hi = Math.abs(m.nx) > 0.5 ? b.z1 : b.x1;
      if (alongU < lo - 1e-3 || alongU > hi + 1e-3) continue;
      host = b; break;
    }
    if (!host) { audit.float.push(`${m.kind} on ${m.proto} at (${ux.toFixed(3)}, ${uz.toFixed(3)}) touches no ground-floor face`); continue; }
    // the whole 5.6 m storey must be inside that one continuous mass
    if (host.y1 * m.bh < m.h + 0.5) audit.tall.push(`${m.proto}: ${m.h} m front on a ${(host.y1 * m.bh).toFixed(1)} m ground mass`);
    if (m.y - m.h / 2 < -0.01) audit.ground.push(`${m.kind} base at y ${(m.y - m.h / 2).toFixed(2)}`);
    // horizontal: a shopfront may not run off the end of its wall
    const faceW = Math.abs(m.nx) > 0.5 ? (host.z1 - host.z0) * m.bd : (host.x1 - host.x0) * m.bw;
    const a = alongU;
    const aLo = Math.abs(m.nx) > 0.5 ? host.z0 : host.x0, aHi = Math.abs(m.nx) > 0.5 ? host.z1 : host.x1;
    const span = m.w / (Math.abs(m.nx) > 0.5 ? m.bd : m.bw);
    if (a - span / 2 < aLo - 1e-3 || a + span / 2 > aHi + 1e-3) audit.overrun.push(`${m.kind} ${m.w} m runs off a ${faceW.toFixed(1)} m wall`);
    // the stand-off point must not be inside any OTHER mass
    const px = ux + m.nx * (m.proud + 0.2) / m.bw, pz = uz + m.nz * (m.proud + 0.2) / m.bd;
    const uy = m.y / m.bh;
    for (const b of boxes) {
      if (b === host || b.round) continue;
      if (px > b.x0 + 1e-4 && px < b.x1 - 1e-4 && uy > b.y0 + 1e-4 && uy < b.y1 - 1e-4
        && pz > b.z0 + 1e-4 && pz < b.z1 - 1e-4) { audit.buried.push(`${m.kind} on ${m.proto} inside another mass`); break; }
    }
  }
  const bad = audit.float.length + audit.tall.length + audit.overrun.length + audit.buried.length + audit.ground.length;
  check('every shopfront stands ON a ground-floor wall, inside it, and outside every other mass',
    audit.n > 200 && bad === 0,
    `${audit.n} shopfronts audited against blocks.js' own unit-space box list\n      `
    + `off the face: ${audit.float.length ? audit.float.slice(0, 3).join('; ') : 'none'}\n      `
    + `taller than the ground mass: ${audit.tall.length ? audit.tall.slice(0, 3).join('; ') : 'none'}\n      `
    + `running off the end of a wall: ${audit.overrun.length ? audit.overrun.slice(0, 3).join('; ') : 'none'}\n      `
    + `buried in another mass: ${audit.buried.length ? audit.buried.slice(0, 3).join('; ') : 'none'}\n      `
    + `base below the pavement: ${audit.ground.length ? audit.ground.slice(0, 3).join('; ') : 'none'}`);

  // ── B2. the fascia signs come out of the FROZEN atlas ────────────────────
  //
  // CLAUDE.md: the signage atlas is frozen, and adding a word is a re-bake that moves every UV. So
  // this layer may only point at regions the bake already produced — and at 4:1 ones, because a
  // fascia is a fascia. `missingWords` is the placement side of the same assertion.
  const state = await evalJSON(S, 'window.__game.shopState()');
  const metaAll = await evalJSON(S, 'window.__game.shopMeta(0)');
  const badReg = [], badAsp = [];
  const words = new Map();
  for (const m of metaAll) {
    const r = regionOf(m.reg);
    if (!r) { badReg.push(m.reg.join(',')); continue; }
    if (r.kind !== 'board_en' && r.kind !== 'board_ja') badReg.push(`${r.kind} is not a fascia tile`);
    if (Math.abs(r.aspect - 4) > 0.01) badAsp.push(`${r.text} aspect ${r.aspect}`);
    words.set(r.text, (words.get(r.text) || 0) + 1);
  }
  check('every fascia sign is a real 4:1 board in the frozen sheet, and no word silently fell back',
    metaAll.length > 200 && !badReg.length && !badAsp.length
    && state.missingWords.length === 0 && words.size >= 10 && REG_KEY.size === SIGNS.regions.length,
    `${metaAll.length} shopfronts, ${words.size} distinct baked words in use: `
    + [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => `${w}×${n}`).join(', ')
    + `\n      regions not in data/signs.json (matched within ${REG_EPS}, because the buffer is float32): `
    + `${badReg.length ? badReg.slice(0, 3).join('; ') : 'none'}`
    + `\n      aspect violations (a stretched tile is a broken ruler): ${badAsp.length ? badAsp.slice(0, 3).join('; ') : 'none'}`
    + `\n      words the bake never produced: ${state.missingWords.length ? state.missingWords.join(', ') : 'none'}`);

  // ── C0. THE CONTROL — prove the counter can see a shopfront at all ───────
  //
  // Every check below is a difference between two frames. Until this one passes, a zero from any of
  // them means nothing: it is exactly the shape of CLAUDE.md's "0 requests" gate that a memory cache
  // made vacuous.
  const shops = metaAll.slice().sort((a, b) =>
    Math.hypot(a.x - SPOTS[1][1][0], a.z - SPOTS[1][1][2]) - Math.hypot(b.x - SPOTS[1][1][0], b.z - SPOTS[1][1][2]));
  const target = shops[0];
  await faceShop(S, target, 6.6, 3.2);
  const gOn = await grid(S);
  await hook(S, 'setShopVisible', false);
  await settle(S, 8);
  const gOff = await grid(S);
  await shoot(S, `gate_off${LOW ? '_low' : ''}`);
  await hook(S, 'setShopVisible', true);
  await settle(S, 8);
  await shoot(S, `gate_on${LOW ? '_low' : ''}`);
  const dLayer = diff(gOn, gOff);
  check('CONTROL — the frame measurably changes when the shopfront layer is switched off',
    dLayer.mean > 0.01 && dLayer.worst > 0.05,
    `standing 6.6 m off a ${target.kind === undefined ? '' : ''}shopfront at (${target.x.toFixed(0)}, ${target.z.toFixed(0)}), `
    + `28x16 luminance grid\n      `
    + `ON vs OFF: mean |Δ| ${dLayer.mean}, worst cell ${dLayer.worst}\n      `
    + `until this is non-zero, every "these two frames are the same" below is vacuous`);

  // ── C1. the venetian blind gates on ANGLE ───────────────────────────────
  //
  // Aaron's design: a lit face from most angles, see-through at some. So the same shop, from the
  // same distance, must resolve to the OPEN arm at eye level and to the SHUT arm from above — and
  // the two forced arms must differ from each other, or "auto matches shut" is satisfied by a
  // shader that ignores uShopForce entirely.
  // Three arms plus the probe's OWN repeat noise at that same camera, so the thresholds below are
  // derived from what this rig can actually resolve rather than picked to fit the HIGH preset. The
  // clock is frozen, so two consecutive grids of an unchanged scene differ only by readback noise.
  async function arms(S) {
    await hook(S, 'setShopForce', -1); await settle(S, 6);
    const a = await grid(S);
    await settle(S, 6);
    const floor = diff(a, await grid(S));
    await hook(S, 'setShopForce', 0); await settle(S, 6);
    const shut = await grid(S);
    await hook(S, 'setShopForce', 1); await settle(S, 6);
    const openA = await grid(S);
    await hook(S, 'setShopForce', -1); await settle(S, 6);
    return { auto: a, shut, open: openA, sep: diff(shut, openA), floor: Math.max(floor.mean, 1e-5) };
  }
  await faceShop(S, target, 6.6, 3.2);
  const low = await arms(S);
  await shoot(S, `gate_street_auto${LOW ? '_low' : ''}`);
  // The same shop from 45 m up and 40 m out — a 46-degree look-down, which is how the player flies
  // and where a blind must be shut. At 6.6 m back the first version of this put the shop on a
  // sliver of the frame and the two arms differed by 0.005; a check that barely clears its own
  // threshold is measuring almost nothing.
  {
    const px = target.x + target.nx * 40, pz = target.z + target.nz * 40, eye = 45;
    await cam(S, [px.toFixed(2), eye, pz.toFixed(2)], lookYaw(target.x - px, target.z - pz).toFixed(2),
      (Math.atan2(target.y - eye, 40) * DEG).toFixed(2));
    await settle(S, 8);
  }
  const high = await arms(S);
  await shoot(S, `gate_above_auto${LOW ? '_low' : ''}`);

  const lowOpen = diff(low.auto, low.open).mean, lowShut = diff(low.auto, low.shut).mean;
  const hiOpen = diff(high.auto, high.open).mean, hiShut = diff(high.auto, high.shut).mean;
  // The arms must be separable by at least 20x the probe's own repeat noise AT THAT CAMERA, and the
  // verdict must be won by at least 4x. A fixed threshold does not survive the preset change: LOW
  // deliberately tightens the interior band to 34-58 m, so from 45 m up the two forced arms differ
  // by only ~0.003 — which is 200x the readback noise and an entirely sound verdict, and which a
  // number picked against HIGH rejects. Deriving the floor is the difference between a threshold
  // and a guess.
  const sepOk = a => a.sep.mean > a.floor * 20;
  const margin = (win, lose) => lose > win * 4;
  check('the blind is OPEN at eye level and SHUT from above — the same shop, the same building',
    sepOk(low) && sepOk(high) && margin(lowOpen, lowShut) && margin(hiShut, hiOpen),
    `probe repeat noise at these two cameras: ${low.floor.toFixed(6)} and ${high.floor.toFixed(6)} — `
    + `the separation each arm pair has to clear is 20x that\n      `
    + `forced SHUT vs forced OPEN: ${low.sep.mean} at eye level (${(low.sep.mean / low.floor).toFixed(0)}x noise), `
    + `${high.sep.mean} from 45 m up (${(high.sep.mean / high.floor).toFixed(0)}x noise)\n      `
    + `at eye level  auto→open ${lowOpen}  auto→shut ${lowShut}   ${lowOpen < lowShut ? 'auto reads OPEN' : 'auto reads SHUT'} by ${(lowShut / Math.max(lowOpen, 1e-6)).toFixed(1)}x\n      `
    + `from 45 m up  auto→open ${hiOpen}  auto→shut ${hiShut}   ${hiShut < hiOpen ? 'auto reads SHUT' : 'auto reads OPEN'} by ${(hiOpen / Math.max(hiShut, 1e-6)).toFixed(1)}x\n      `
    + `this is the whole feature: the interior is paid for at eye level and nowhere else`);

  // ── C2. the blind gates on DISTANCE as well as angle ────────────────────
  //
  // Moving the range band must move the frame. Without this, a blind that is really only an angle
  // test would pass C1 unchanged and the distance half of Aaron's brief would be unimplemented and
  // undetected.
  await faceShop(S, target, 6.6, 3.2);
  await hook(S, 'setShopForce', -1);
  await settle(S, 6);
  const rNormal = await grid(S);
  await hook(S, 'setShopRange', 1, 2);           // the shop is now far outside the interior band
  await settle(S, 6);
  const rTiny = await grid(S);
  await hook(S, 'setShopRange', 900, 1200);      // and now well inside it
  await settle(S, 6);
  const rHuge = await grid(S);
  const dTiny = diff(rNormal, rTiny), dHuge = diff(rNormal, rHuge);
  const dTinyVsShut = diff(rTiny, low.shut);
  check('the interior is gated on DISTANCE too — collapsing the band shuts every blind in frame',
    dTiny.mean > 0.003 && dTinyVsShut.mean < dTiny.mean,
    `at 6.6 m with the shipped band, then with the band collapsed to 1-2 m, then opened to 900-1200 m\n      `
    + `band collapsed: mean |Δ| ${dTiny.mean} from the shipped frame, and ${dTinyVsShut.mean} from the `
    + `forced-SHUT frame — i.e. it converges on shut\n      `
    + `band opened: mean |Δ| ${dHuge.mean} (small, because at 6.6 m the shipped band is already open)`);
  await hook(S, 'setShopRange', LOW ? 34 : 58, LOW ? 58 : 100);

  // ── D1. what it costs, against the layer switched off as the control ────
  await faceShop(S, target, 6.6, 3.2);
  const onSt = await evalJSON(S, 'window.__state');
  const onN = (await evalJSON(S, 'window.__game.shopState()')).n;
  await hook(S, 'setShopVisible', false);
  await settle(S, 10);
  const offSt = await evalJSON(S, 'window.__state');
  await hook(S, 'setShopVisible', true);
  await settle(S, 10);
  check('the whole street layer is exactly ONE draw call and two triangles an instance',
    onSt.draws - offSt.draws === 1 && onSt.tris - offSt.tris === onN * 2
    && onSt.draws <= GATES.draws && onSt.tris <= GATES.tris,
    `${onN} shopfronts in frame: ${offSt.draws} → ${onSt.draws} draws (+${onSt.draws - offSt.draws}), `
    + `${(offSt.tris / 1000).toFixed(1)}k → ${(onSt.tris / 1000).toFixed(1)}k tris (+${onSt.tris - offSt.tris} = ${onN} × 2)\n      `
    + `against the budget: draws ${onSt.draws}/${GATES.draws}, tris ${onSt.tris}/${GATES.tris}`);

  // ── D2. the frame-time cost at street level, three arms ─────────────────
  //
  // Alternated, not run once each, because the between-arm difference here is small enough that a
  // single pass measures drift. The SHUT arm is what the game actually pays almost all of the time;
  // the OPEN arm is the worst case Aaron's blind exists to avoid.
  //
  // READ THE CAVEAT BEFORE READING THE NUMBERS. `__state.ms.frame` is CPU wall time around the loop
  // body — it measures draw-call SUBMISSION, not GPU execution — so while the GPU still finishes
  // inside vsync it cannot see fragment cost at all, and every arm here does. Pushed to 13 Mpx off
  // this gate, all three arms sat on 60.0 fps with a 0.01 spread. So this check is a REGRESSION
  // GUARD on the CPU side and a statement that the layer does not blow the budget; it is not
  // evidence that the venetian blind saves anything. Only a phone can be that.
  const ms = { off: [], shut: [], open: [] };
  await frameMs(S, 2);                       // warm-up, discarded — the first window after a camera
                                             // move still carries the tail of the chunk pump
  for (let pass = 0; pass < 3; pass++) {
    await hook(S, 'setShopVisible', false); await settle(S, 8);
    ms.off.push(await frameMs(S, 3));
    await hook(S, 'setShopVisible', true);
    await hook(S, 'setShopForce', 0); await settle(S, 8);
    ms.shut.push(await frameMs(S, 3));
    await hook(S, 'setShopForce', 1); await settle(S, 8);
    ms.open.push(await frameMs(S, 3));
    await hook(S, 'setShopForce', -1);
  }
  const avg = k => +(ms[k].reduce((a, b) => a + b.mean, 0) / ms[k].length).toFixed(3);
  const wst = k => Math.max(...ms[k].map(b => b.worst));
  const spread = k => +(Math.max(...ms[k].map(b => b.mean)) - Math.min(...ms[k].map(b => b.mean))).toFixed(3);
  const noise = Math.max(spread('off'), spread('shut'), spread('open'));
  const blindBuys = +(avg('open') - avg('shut')).toFixed(3);
  check(`frame time at street level with the street full of shopfronts (${args.headed ? 'HEADED — real GPU' : 'HEADLESS — ANGLE, not a measurement'})`,
    avg('open') <= GATES.meanFrame && wst('open') <= GATES.worstFrame
    && avg('shut') <= GATES.meanFrame && wst('shut') <= GATES.worstFrame,
    `layer OFF      mean ${avg('off')} ms  worst ${wst('off')} ms\n      `
    + `blinds SHUT   mean ${avg('shut')} ms  worst ${wst('shut')} ms   ← what the game pays almost all the time\n      `
    + `blinds OPEN   mean ${avg('open')} ms  worst ${wst('open')} ms   ← the worst case the blind exists to avoid\n      `
    + `within-arm spread across three passes is ${noise} ms, so the ${blindBuys} ms between SHUT and `
    + `OPEN is ${Math.abs(blindBuys) > noise * 1.5 ? 'above' : 'BELOW'} the noise floor — reported, not banked\n      `
    + `and ms.frame is CPU time around the loop, so it cannot see fragment cost while the GPU still `
    + `finishes inside vsync. This is a budget guard, not proof the blind saves anything.\n      `
    + `gate: mean ≤ ${GATES.meanFrame} ms, worst ≤ ${GATES.worstFrame} ms`);

  // ── E1. same seed, same shops — and a different seed, different shops ────
  const h1 = await evalJSON(S, 'window.__game.shopHash()');
  await cam(S, [SPOTS[1][1][0] + 4000, 200, SPOTS[1][1][2] + 4000], 20, -6);
  await drain(S);
  await cam(S, SPOTS[1][1], 20, -6);
  await drain(S);
  const h2 = await evalJSON(S, 'window.__game.shopHash()');
  await S('Page.navigate', { url: `${base}/index.html?debug=1&var=deepnight&nosave&nohud&seed=99${LITE}` });
  await waitFor(S, 'window.__ready', 60000);
  await cam(S, SPOTS[1][1], 20, -6);
  await drain(S);
  const h3 = await evalJSON(S, 'window.__game.shopHash()');
  check('shopfronts are a pure function of world position — same seed same shops, new seed new shops',
    h1 && h2 && h3 && h1.hash === h2.hash && h1.n === h2.n && h1.hash !== h3.hash,
    `default seed, ${h1.n} shopfronts, hash ${h1.hash}\n      `
    + `same camera after a 4 km round trip that evicted and re-streamed every chunk: `
    + `${h2.n} shopfronts, hash ${h2.hash} — ${h1.hash === h2.hash ? 'identical' : 'MOVED'}\n      `
    + `?seed=99 at the same place: ${h3.n} shopfronts, hash ${h3.hash} — `
    + `${h1.hash === h3.hash ? 'IDENTICAL, so the hash is not reading the world' : 'different'}\n      `
    + `placement takes no draw from the city rng, so data/city_golden.json is untouched — `
    + `tools/determinism.mjs is the assertion, not this line`);

  // ── the falsification arms ──────────────────────────────────────────────
  if (FALSIFY) {
    await S('Page.navigate', { url: `${base}/index.html?debug=1&var=deepnight&nosave&nohud${LITE}` });
    await waitFor(S, 'window.__ready', 60000);
    await cam(S, SPOTS[1][1], 20, -6);
    await drain(S);
    const t2 = (await evalJSON(S, 'window.__game.shopMeta(0)')).slice().sort((a, b) =>
      Math.hypot(a.x - SPOTS[1][1][0], a.z - SPOTS[1][1][2]) - Math.hypot(b.x - SPOTS[1][1][0], b.z - SPOTS[1][1][2]))[0];

    // F1 — the control's own control. Aim the camera the WRONG way, which is the exact mistake the
    // capture tool made, and confirm the layer A/B goes to zero. A control that cannot be driven to
    // zero is not measuring the thing it names.
    {
      const px = t2.x + t2.nx * 6.6, pz = t2.z + t2.nz * 6.6;
      // lookYaw with the sign flipped — literally the bug tools/cap_s2h.mjs shipped first time.
      await cam(S, [px.toFixed(2), 3.2, pz.toFixed(2)], lookYaw(px - t2.x, pz - t2.z).toFixed(2), 0);
      await settle(S, 8);
      const a = await grid(S);
      await hook(S, 'setShopVisible', false); await settle(S, 8);
      const b = await grid(S);
      await hook(S, 'setShopVisible', true); await settle(S, 8);
      const d = diff(a, b);
      check('FALSIFY — aimed 180° away, the layer A/B collapses to nothing',
        d.mean < dLayer.mean * 0.25,
        `looking at the opposite wall: ON vs OFF mean |Δ| ${d.mean} against ${dLayer.mean} aimed at the shop\n      `
        + `so C0's number is a measurement of the shopfronts and not of the frame`);
    }

    // F2 — a shopfront moved off its wall must be caught by B1.
    {
      // Along the NORMAL, not along x. Nudging x moves a shop on a +/-Z wall sideways ALONG its
      // own wall, which is an overrun and not a float — the first version of this caught 22 of 39
      // and read as a partially-working audit when it was really falsifying two different things.
      const moved = place.slice(0, 40).map(m => Object.assign({}, m, { x: m.x + m.nx * 8, z: m.z + m.nz * 8 }));
      let caught = 0;
      for (const m of moved) {
        const boxes = boxesByProto[m.proto];
        if (!boxes || m.face >= 4) continue;
        const wx = m.x - m.nx * m.proud, wz = m.z - m.nz * m.proud;
        const ux = (wx - m.bx) / m.bw, uz = (wz - m.bz) / m.bd;
        let host = null;
        for (const b of boxes) {
          if (b.round || b.y0 > 0.005) continue;
          const on = (m.nx > 0.5 && Math.abs(ux - b.x1) < 0.004) || (m.nx < -0.5 && Math.abs(ux - b.x0) < 0.004)
            || (m.nz > 0.5 && Math.abs(uz - b.z1) < 0.004) || (m.nz < -0.5 && Math.abs(uz - b.z0) < 0.004);
          if (on) { host = b; break; }
        }
        if (!host) caught++;
      }
      check('FALSIFY — shopfronts nudged 8 m off their walls are rejected by the placement audit',
        caught > 0 && caught === moved.filter(m => m.face < 4).length,
        `${caught} of ${moved.filter(m => m.face < 4).length} moved shopfronts reported as touching no ground-floor face\n      `
        + `B1's zero is therefore a measurement and not an empty loop`);
    }

    // F3 — the blind override must actually outrank the shader's own answer.
    {
      await faceShop(S, t2, 6.6, 3.2);
      await hook(S, 'setShopForce', 0); await settle(S, 6);
      const a = await grid(S);
      await hook(S, 'setShopForce', 1); await settle(S, 6);
      const b = await grid(S);
      await hook(S, 'setShopForce', -1); await settle(S, 6);
      const d = diff(a, b);
      check('FALSIFY — the blind override outranks the shader\'s own angle answer',
        d.mean > 0.004,
        `forced SHUT vs forced OPEN at a camera where the auto answer is OPEN: mean |Δ| ${d.mean}\n      `
        + `a uniform the shader ignored would give exactly 0 here and C1 would pass on nothing`);
    }

    // F4 — the region check must reject a region the sheet does not contain.
    {
      const fake = ['0.5,0.5,0.1,0.1', '0.123,0.456,0.01,0.02'];
      const rejected = fake.filter(k => !REG_KEY.has(k)).length;
      check('FALSIFY — the atlas-region check rejects a UV rect the frozen sheet does not contain',
        rejected === fake.length && REG_KEY.size === SIGNS.regions.length,
        `${rejected} of ${fake.length} invented UV rects rejected against ${REG_KEY.size} baked regions\n      `
        + `so B2's "none" is a lookup that can fail`);
    }
  }

  await close();

  const pass = results.filter(r => r.pass).length;
  const report = { at: new Date().toISOString(), preset: LOW ? 'low' : 'high', falsify: FALSIFY,
    headed: !!args.headed, w: W, h: H, dpr: DPR, total: results.length, pass, results };
  writeFileSync(resolve(OUT, `_gates${LOW ? '_low' : ''}${FALSIFY ? '_falsify' : ''}.json`), JSON.stringify(report, null, 2));
  console.log(`\n${pass}/${results.length} ${LOW ? '(LOW)' : '(HIGH)'}${FALSIFY ? ' +falsify' : ''}`);
  if (pass !== results.length) process.exit(1);
}

main().catch(e => { console.error(e.stack || e.message); for (const l of logs.slice(-20)) console.error('  ' + l); cleanup(); process.exit(1); });
