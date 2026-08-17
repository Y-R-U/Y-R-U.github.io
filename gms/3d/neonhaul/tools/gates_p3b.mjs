#!/usr/bin/env node
// P3b's done-criteria, as one command. Everything here asserts on `__state`, on the live scene
// graph, or on SAMPLED PIXELS — and every visual claim is measured as a DIFFERENCE, with the
// layer under test switched off and back on. A frame that is 90 % building measures the building.
//
//   node tools/gates_p3b.mjs
//   node tools/gates_p3b.mjs --lite        ← the LOW preset, where the halo substitution lives
//   node tools/gates_p3b.mjs --headed      ← real GPU; the halo cost gate wants this
//
// Obligation T5: headless ANGLE on this machine stalls above ~5 Mpx of HalfFloat + 2x MSAA, so
// this runs at dpr 1 and a modest viewport by default.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup, logs } from './shot.mjs';
import { GATES, AERIAL, HAZE } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const W = +(args.w || 1000), H = +(args.h || 620), DPR = +(args.dpr || 1);
const LITE = args.lite ? '&lite=1' : '';
const LOW = !!args.lite;
const OUT = resolve(ROOT, 'shots/p3b');

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

async function goto(S, base, q) {
  await S('Page.navigate', { url: `${base}/index.html?${q}${LITE}` });
  await waitFor(S, 'window.__ready', 40000);
  await settle(S, 30);
}

const RING = LOW ? 9 : 25;
async function drain(S) {
  await settle(S, 8);
  for (let i = 0; i < 240; i++) {
    const s = await evalJSON(S, 'window.__state');
    if (s.city.queued === 0 && s.city.near >= RING) { await settle(S, 6); return true; }
    await settle(S, 6);
  }
  throw new Error('the near ring never completed streaming');
}

async function shoot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/p3b/${name}.png`;
}

async function cam(S, pos, yaw, pitch, fov) {
  await evalJSON(S, `(window.__game.setCamera({pos:[${pos}],yaw:${yaw},pitch:${pitch},fov:${fov}}),1)`);
}

// A 24x18 luminance grid of the composed frame, as a flat array.
async function grid(S, nx = 24, ny = 18) {
  return (await evalP(S, `window.__game.probe({ grid: [${nx}, ${ny}] })`)).grid;
}
// The difference a layer makes: sum of |Δ| per cell, and the worst single cell.
function diff(a, b) {
  let sum = 0, worst = 0, at = -1;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > worst) { worst = d; at = i; }
  }
  return { sum: +sum.toFixed(4), mean: +(sum / a.length).toFixed(5), worst: +worst.toFixed(5), at };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed });
  const { S, base, close } = ctx;

  // Everything below is measured on a FROZEN clock. Rain, sign flicker, the ticker scroll and the
  // silhouette drift all move on uTime, and a difference measured across two moving frames
  // measures the movement.
  const STREET = { pos: [1305.6, 5, 300], yaw: 180, pitch: -3, fov: 64 };
  const CANYON = { pos: [1305.6, 150, 260], yaw: 180, pitch: -32, fov: 64 };

  await goto(S, base, 'debug=1&var=stormnight&nosave&nohud');
  await drain(S);
  await evalJSON(S, 'window.__game.freezeTime(true)');
  await cam(S, STREET.pos, STREET.yaw, STREET.pitch, STREET.fov);
  await drain(S);

  // ── 1. §3.7(b) — the mirror group exists, shares its sources' buffers ────
  const rf = await evalJSON(S, 'window.__state.reflect');
  const shared = await evalJSON(S, `(() => {
    const g = window.__game.reflect, s = window.__game.signage;
    const src = { neon: s.neon, strip: s.strip, strobe: s.strobe };
    return g.buckets.map(b => ({
      field: b.name,
      sameMatrix: b.mesh.instanceMatrix === src[b.name].mesh.instanceMatrix,
      sameGeo: b.mesh.geometry === src[b.name].geo,
      count: b.mesh.count, srcN: src[b.name].n,
      side: b.mesh.material.side, depthWrite: b.mesh.material.depthWrite,
      order: b.mesh.renderOrder,
      det: g.group.matrixWorld.determinant() < 0,
    }));
  })()`);
  const allShared = shared.length > 0 && shared.every(b => b.sameMatrix && b.sameGeo && b.count === b.srcN);
  const noBackSide = shared.every(b => b.side !== 1);   // THREE.BackSide === 1
  check('§3.7(b) the mirror shares its sources\' geometry AND instance buffers, by reference',
    allShared && noBackSide && shared.every(b => !b.depthWrite && b.order === 2 && b.det),
    `${shared.length} bucket(s): ${shared.map(b => `${b.field} ${b.count}/${b.srcN} matrix=${b.sameMatrix} geo=${b.sameGeo} side=${b.side} order=${b.order}`).join('; ')}\n      `
    + `group determinant < 0 (three flips winding for us — never BackSide): ${shared[0]?.det}`);

  // ── 2. §3.7(b) — the reflection is VISIBLE, measured as a difference ─────
  const mOn = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setReflect(false)');
  await settle(S, 6);
  const mOff = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setReflect(true)');
  await settle(S, 6);
  const dm = diff(mOn, mOff);
  await shoot(S, 'street_mirror_on');
  check('§3.7(b) the wet-ground double puts measurable light on the road',
    dm.worst > 0.004 && dm.mean > 0.0002,
    `mirror on vs off over a 24x18 grid at 5 m above the street: worst cell ${dm.worst}, mean ${dm.mean}, `
    + `total ${dm.sum} — ${rf.buckets.map(b => `${b.field} ${b.instances}`).join(', ')}`);

  // ── 3. §3.7(b) — the P3b gate: a building OCCLUDES a sign's reflection ───
  // The reflection is depth-tested and does not write depth, and the road does not write depth
  // either. Get either wrong and this fails in one of two opposite ways: an opaque depth-writing
  // road hides the mirror entirely (nothing appears at all, caught by gate 2), or depthTest:false
  // paints the reflection straight over the buildings in front of it — which is what this
  // measures. Sample the cells that a NEAR BUILDING covers: the mirror must change none of them.
  const occl = await evalJSON(S, `(() => {
    const g = window.__game.reflect;
    return g.buckets.map(b => ({ field: b.name, depthTest: b.mesh.material.depthTest }));
  })()`);
  // WHICH CELLS ARE OCCLUDED IS DERIVED, NOT ASSUMED. P11 had to rewrite this gate twice and the
  // two failures are worth keeping, because both are the project's dominant failure mode.
  //
  // Version 1 took "the near tower fills the right quarter of frame" from a comment and sampled
  // the whole right quarter. Rendered with the grid drawn on it, the tower fills that quarter's
  // TOP half; the bottom half is open road, where the mirror is SUPPOSED to show. The gate was
  // measuring the road and calling it the facade, and it passed only because the reflection over
  // those particular road cells sat under the threshold — until P11 widened §3.8's vertical corner
  // strips and their reflections pushed it over.
  //
  // Version 2 narrowed the set to the quarter's top half. It reported 0.00000 — and the
  // falsification leg reported 0.00000 as well, i.e. those cells have no mirrored geometry behind
  // them at all and the gate could not have failed. A zero that cannot become non-zero is not a
  // measurement, and narrowing a cell set until it passes is a workaround inside a gate.
  //
  // So the occluded set is derived from the render itself, with no assumption about where any
  // building is:
  //
  //   broken[i]  the mirror's contribution with depthTest FORCED OFF — every cell it WANTS to paint
  //   real[i]    the mirror's contribution as shipped
  //
  // A cell is occluded when the mirror wants to paint it and does not. With depthTest off,
  // real === broken by construction, so NO cell can qualify and the gate fails — which is exactly
  // what it should do, because that is the defect §3.7 names.
  // AND IT NEEDS ITS OWN CAMERA. Measured at STREET (5 m, level) the depthTest-off pass is
  // BYTE-IDENTICAL to the shipped one — sum 0.1623 against sum 0.1623, zero cells differing by
  // more than 0.0005 — because the mirror group lives at y < 0 and the only thing in the scene
  // that exposes y < 0 is the non-depth-writing road. At a level camera every mirrored fragment
  // lands on open road and nothing is ever in front of it, so the ORIGINAL form of this gate
  // ("the mirror must move none of these cells") was asserting that nothing moves in a region
  // where nothing could move. It was vacuous from the day it was written and it passed for two
  // phases. Five candidate cameras were swept; this one is the one where the premise is
  // satisfiable, and the numbers below prove it is.
  const OCCL = { pos: [1280, 45, 420], yaw: 180, pitch: -18, fov: 64 };
  await cam(S, OCCL.pos, OCCL.yaw, OCCL.pitch, OCCL.fov);
  await drain(S);
  const oOn = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setReflect(false)');
  await settle(S, 8);
  const oOff = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setReflect(true)');
  await settle(S, 8);
  await evalJSON(S, `(window.__game.reflect.buckets.forEach(b => { b.mesh.material.depthTest = false; }), 1)`);
  await settle(S, 8);
  const oBroken = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, `(window.__game.reflect.buckets.forEach(b => { b.mesh.material.depthTest = true; }), 1)`);
  await settle(S, 8);
  await shoot(S, 'mirror_occlusion');

  // LOW streams a NINTH of the near ring (ringNear 1, not 2) and mirrors two buckets rather than
  // three, so it simply has fewer mirrored instances behind a tower. The count is a property of
  // the preset; the worst survivor and the leak count are not, and those are the same either way.
  const WANT = 0.006, ALLOW = 0.004, MIN_OCC = LOW ? 3 : 8;
  let occN = 0, occWorst = 0, brokenMax = 0, leak = 0;
  for (let i = 0; i < oOn.length; i++) {
    const real = Math.abs(oOn[i] - oOff[i]);
    const broken = Math.abs(oBroken[i] - oOff[i]);
    if (broken > brokenMax) brokenMax = broken;
    if (real > broken + 0.002) leak++;              // it can never paint MORE with the test on
    if (broken > WANT && real < ALLOW) { occN++; if (real > occWorst) occWorst = real; }
  }
  check('§3.7(b) a building between the camera and a sign occludes that sign\'s reflection',
    occl.every(b => b.depthTest) && occN >= MIN_OCC && occWorst < ALLOW && leak === 0,
    `every mirrored bucket is depthTest: ${occl.map(b => b.field + '=' + b.depthTest).join(' ')}\n      `
    + `over the whole 24x18 grid, the mirror with depthTest FORCED OFF wants to paint cells up to `
    + `${brokenMax.toFixed(5)}; ${occN} of them are cut to under ${ALLOW} once the depth test is on, `
    + `worst survivor ${occWorst.toFixed(5)} — those are the cells with a building in front of them\n      `
    + `cells where the reflection is BRIGHTER with the test on than without it (impossible; a `
    + `sanity check on the probe itself): ${leak}\n      `
    + `the occluded set is DERIVED from the depthTest-off pass, not assumed from where a tower is `
    + `thought to be. With depthTest off the two passes are identical, no cell can qualify, and this `
    + `gate fails — which is the defect it exists to catch.\n      `
    + `camera ${JSON.stringify(OCCL.pos)} yaw ${OCCL.yaw} pitch ${OCCL.pitch} — NOT the street camera, `
    + `where this measurement is vacuous by geometry (see the comment). Evidence: shots/p3b/mirror_occlusion.png\n      `
    + `at STREET the mirror moves the road by ${dm.worst}; that it shows there and not behind a tower is the point`);

  // back to the street for §3.6's film check, and re-measured there rather than reusing a grid
  // taken before the camera moved.
  await cam(S, STREET.pos, STREET.yaw, STREET.pitch, STREET.fov);
  await drain(S);

  // ── 4. §3.6 — the road and the film read as one surface ─────────────────
  const fOn = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setFilm(false)');
  await settle(S, 6);
  const fOff = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setFilm(true)');
  await settle(S, 6);
  const df = diff(fOn, fOff);
  const ground = await evalJSON(S, `(() => {
    const r = window.__game.city, g = window.__game.reflect;
    return { roadWrite: r.ground.material.depthWrite, roadOrder: r.ground.renderOrder,
      filmOrder: g.film.renderOrder, filmY: g.film.position.y, roadY: r.ground.position.y,
      snapped: Math.abs(g.film.position.x - r.ground.position.x) + Math.abs(g.film.position.z - r.ground.position.z) };
  })()`);
  check('§3.6 the road does not write depth, and the water film rides it at +0.02 m',
    ground.roadWrite === false && ground.roadOrder === -1 && ground.filmOrder === 3
    && Math.abs(ground.filmY - 0.02) < 1e-6 && ground.snapped === 0 && df.worst > 0.002,
    `road depthWrite ${ground.roadWrite} order ${ground.roadOrder}; film order ${ground.filmOrder} at y=${ground.filmY}, `
    + `snap offset ${ground.snapped} m from the road; film on vs off moves the worst cell by ${df.worst}`);

  // ── 5. §2.2 — the rain field is one draw and no per-frame CPU ────────────
  const rain = await evalJSON(S, `(() => {
    const w = window.__game.weather;
    return { n: w.geo.instanceCount, tris: w.geo.index.count / 3 * w.geo.instanceCount,
      isInstancedGeo: !!w.geo.isInstancedBufferGeometry, isInstancedMesh: !!w.mesh.isInstancedMesh,
      attrs: Object.keys(w.geo.attributes), visible: w.mesh.visible, order: w.mesh.renderOrder };
  })()`);
  const st1 = await evalJSON(S, 'window.__state.weather');
  const rainOn = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setRain(false)');
  await settle(S, 6);
  const rOff = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setRain(true)');
  await settle(S, 6);
  const dr = diff(rainOn, rOff);
  // Gated on the TOTAL, not the worst cell, and deliberately: rain is a sub-pixel-wide effect
  // spread over the whole frame, so a 24x18 cell average is the right instrument for "is it
  // everywhere" and the wrong one for "is it bright". A worst-cell test on rain measures which
  // cell happened to contain a near streak.
  const cells = rainOn.length;
  check('§3.8 rain is ONE instanced draw of the budgeted size and covers the frame',
    rain.isInstancedGeo && !rain.isInstancedMesh && rain.n === (LOW ? 900 : 2500)
    && rain.tris === (LOW ? 1800 : 5000) && dr.sum > 0.02 && dr.mean > 0.00005,
    `${rain.n} drops, ${rain.tris} tris, InstancedBufferGeometry (no 16-float-per-drop matrix buffer), `
    + `attributes ${rain.attrs.join(',')}; rain on vs off over ${cells} cells: total ${dr.sum}, `
    + `mean ${dr.mean}, worst ${dr.worst}; state ${JSON.stringify(st1)}`);

  // ── 6. §4.5 — the shafts are anchored to real chunk gaps ────────────────
  await goto(S, base, 'debug=1&var=daysmog&nosave&nohud');
  await drain(S);
  await cam(S, [1280, 120, 140], 149, 6, 62);
  await drain(S);
  await evalJSON(S, 'window.__game.anchorShafts()');
  await settle(S, 8);
  const sky = await evalJSON(S, 'window.__state.sky');
  const anchors = (sky.shaftAnchors || []).filter(Boolean);
  // Every anchor must be in open air: no LOD0 building AABB may contain it.
  const solid = await evalJSON(S, `[${anchors.map(a => `window.__game.solidAt(${a[0]}, 40, ${a[2]}, 0)`).join(',')}]`);
  const sep = [];
  for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
    sep.push(Math.round(Math.hypot(anchors[i][0] - anchors[j][0], anchors[i][2] - anchors[j][2])));
  }
  check('§4.5 the shaft cards are anchored to real gaps in the near ring, not to debug constants',
    anchors.length >= 1 && solid.every(s => s === null) && sep.every(d => d >= 130)
    && anchors.every(a => a[0] !== 35 && a[0] !== 168),
    `${anchors.length} anchored at ${JSON.stringify(anchors.map(a => [a[0], a[2]]))}; `
    + `none inside a building (solidAt: ${JSON.stringify(solid.map(s => (s ? 'SOLID' : 'open')))}); `
    + `pairwise separation ${sep.join('/')} m (>= 130); P1a's debug anchors were x=35/168/145/273`);
  await shoot(S, 'shafts_daysmog');

  // ── 7. decision 11 — the aerial vista costs NOTHING at low altitude ─────
  await goto(S, base, 'debug=1&var=stormnight&nosave&nohud');
  await drain(S);
  await evalJSON(S, 'window.__game.freezeTime(true)');
  await cam(S, CANYON.pos, CANYON.yaw, CANYON.pitch, CANYON.fov);
  await drain(S);
  const low0 = (await grid(S)).cells.map(c => c.lum);
  const lowState = await evalJSON(S, 'window.__state.aerial');
  await evalJSON(S, 'window.__game.setAerial(0)');
  await settle(S, 6);
  const low1 = (await grid(S)).cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setAerial(null)');
  const dLow = diff(low0, low1);
  check('decision 11 — the aerial treatment is EXACTLY zero at street/canyon altitude',
    lowState.k === 0 && lowState.rayMean === 0 && dLow.worst === 0,
    `at y = ${CANYON.pos[1]} m (gate opens at ${AERIAL.y0} m): k = ${lowState.k}, uRayMean = ${lowState.rayMean}, `
    + `fog.far = ${lowState.fogFar} m. Forcing the ramp to 0 changes the frame by ${dLow.worst} — it is not `
    + `"small at low altitude", it is off, so the common path pays one mix() in the fog shader and nothing else.`);

  // ── 8. decision 11 — and it makes the city legible from above ───────────
  await cam(S, [1350, 760, 400], 120, -34, 70);
  await drain(S);
  await settle(S, 12);
  const upOn = (await grid(S)).cells.map(c => c.lum);
  const upState = await evalJSON(S, 'window.__state.aerial');
  await shoot(S, 'aerial_on');
  await evalJSON(S, 'window.__game.setAerial(0)');
  await settle(S, 10);
  const upOff = (await grid(S)).cells.map(c => c.lum);
  await shoot(S, 'aerial_off');
  await evalJSON(S, 'window.__game.setAerial(null)');
  // Legibility, as a number: the SPREAD of cell luminance. Flat haze has almost none; a city seen
  // through haze has a lot, because the towers are dark and the gaps between them are not.
  const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const sOn = sd(upOn), sOff = sd(upOff);
  const draws = (await evalJSON(S, 'window.__state')).draws;
  check('decision 11 — at 760 m the city is legible, and the vista adds no draw calls',
    upState.k === 1 && sOn > sOff * 1.35 && draws <= GATES.draws,
    `at 760 m the ramp is fully open (k = ${upState.k}, fog.far ${upState.fogFar} m vs the ground model's `
    + `${lowState.fogFar} m). Luminance spread across a 24x18 grid: ${sOn.toFixed(4)} with the vista, `
    + `${sOff.toFixed(4)} without — ${(sOn / sOff).toFixed(2)}x. Flat haze has no spread; a city has. `
    + `${draws} draws, unchanged: the vista is two ramped numbers, not more geometry.`);

  // ── 9. §3.9 — the silhouettes obey their radius, or are absent ──────────
  const silh = await evalJSON(S, 'window.__state.silhouettes');
  if (silh && silh.on) {
    const near = await evalJSON(S, `(() => {
      const s = window.__game.silhouettes, m = s.mesh, THREE = window.__game.three;
      const v = new THREE.Vector3(), c = window.__game.camera.position;
      let minD = 1e9;
      for (let i = 0; i < m.count; i++) {
        v.setFromMatrixPosition(new THREE.Matrix4().fromArray(m.instanceMatrix.array, i * 16));
        minD = Math.min(minD, v.distanceTo(c));
      }
      return { n: m.count, minD: +minD.toFixed(1), cull: s.uNear.value };
    })()`);
    check('§3.9 distant silhouettes: <= 120 instances, culled inside 140 m in the vertex shader',
      silh.instances <= 120 && near.cull === 140,
      `${silh.instances} instances, ${silh.tris} tris, nearest placement ${near.minD} m from the camera, `
      + `shader cull radius ${near.cull} m — inside it the instance is scaled to zero and parked at y = -9999, `
      + `so no CPU work per frame`);
  } else {
    check('§3.9 distant silhouettes are OFF on this preset', !LOW || !silh?.on,
      `Q.silhouettes = ${silh ? silh.on : 'no module'} — §3.9 turns them off on LOW`);
  }

  // ── 10. §4.4 — the halo substitution, MEASURED against the bloom ────────
  // §4.4 is explicit that this is a real gate: if the halos cost more than the bloom they replace,
  // LOW ships bloom-less and that is recorded. Both numbers go in the handoff either way.
  const q = await evalJSON(S, 'window.__state.quality');
  const bloomOn = await evalJSON(S, 'window.__state.bloom');
  check('§4.4 the preset carries the right bloom substitute',
    (LOW && q === 'low' && bloomOn === null) || (!LOW && q === 'high' && bloomOn !== null),
    `preset ${q}: composer bloom ${bloomOn ? JSON.stringify(bloomOn) : 'absent'}; halo field `
    + `${JSON.stringify((await evalJSON(S, 'window.__state.reflect')).halos)}`);

  // ── 10b. §4.4's REAL gate: do the halos cost more than the bloom? ───────
  // "measure LOW *with* halos against LOW *without*, over the same 60 s ?auto=1 flight. If halos
  // cost more than the bloom they replace, the substitution has failed and LOW ships bloom-less."
  // Run it with --halocost --lite --headed: the software rasteriser's numbers mean nothing here,
  // because what is being compared is fill.
  if (args.halocost) {
    const SECS = +(args.secs || 30);
    async function flight(label, setup) {
      await goto(S, base, 'auto=1&var=stormnight&nosave&nohud&debug=1');
      await drain(S);
      await setup();
      await evalJSON(S, 'window.__game.resetPerf()');
      const t0 = Date.now();
      const frames = [];
      while (Date.now() - t0 < SECS * 1000) {
        await settle(S, 30);
        const s = await evalJSON(S, 'window.__state');
        frames.push(s.ms.frame);
      }
      const s = await evalJSON(S, 'window.__state');
      frames.sort((a, b) => a - b);
      return { label, mean: +s.ms.frame.toFixed(3), worst: +s.ms.worst.toFixed(3),
        median: +frames[frames.length >> 1].toFixed(3), fps: s.fps, draws: s.draws, samples: frames.length };
    }
    const withHalos = await flight('halos on', async () => {});
    const noHalos = await flight('halos off', async () => { await evalJSON(S, 'window.__game.setHalos(false)'); });
    const bloomRef = await flight('HIGH, composer bloom', async () => {
      await evalJSON(S, 'window.__game.setQuality("high")');
      await drain(S);
    });
    const cost = +(withHalos.median - noHalos.median).toFixed(3);
    check('§4.4 the LOW halo field costs less than the bloom it replaces',
      cost >= 0 && cost < 1.3,
      `${SECS}s ?auto=1 flights, ${args.headed ? 'HEADED (real GPU)' : 'HEADLESS ANGLE — these numbers are a proxy'}:\n      `
      + [withHalos, noHalos, bloomRef].map(f => `${f.label}: median ${f.median} ms, mean ${f.mean}, worst ${f.worst}, `
        + `${f.draws} draws, ${f.fps} fps`).join('\n      ')
      + `\n      halo cost = ${cost} ms against §3.11's 1.3 ms for the composer bloom it replaces. `
      + `Both numbers go in the handoff either way (§4.4).`);
  }

  // ── 11. the budget, with P3b's layers broken out ────────────────────────
  await cam(S, CANYON.pos, CANYON.yaw, CANYON.pitch, CANYON.fov);
  await drain(S);
  await evalJSON(S, 'window.__game.resetPerf()');
  await settle(S, 60);
  const st = await evalJSON(S, 'window.__state');
  check(`§3.8 budget at ${st.quality}: <= ${GATES.draws} draws, <= ${GATES.tris / 1000}k tris`,
    st.draws <= GATES.draws && st.tris <= GATES.tris && st.errors.length === 0,
    `${st.draws} draws, ${(st.tris / 1000).toFixed(1)}k tris, frame ${st.ms.frame} ms (worst ${st.ms.worst}); `
    + `P3b's own: mirror ${JSON.stringify(st.reflect.buckets)}, film ${JSON.stringify(st.reflect.film)}, `
    + `rain ${JSON.stringify(st.weather)}, silhouettes ${st.silhouettes ? st.silhouettes.instances : 0}; `
    + `${st.errors.length} errors`);

  // ── 12. decision 10's number is one named number, and it is live ────────
  const haze = await evalJSON(S, 'window.__state.haze');
  check('decision 10 — the far-haze tunable is a single named number in config.js',
    Math.abs(haze.gamma - HAZE.gamma) < 1e-6,
    `config.HAZE.gamma = ${HAZE.gamma}, live uniform = ${haze.gamma}; __game.setHaze(g) sweeps it without `
    + `an edit. Far-plane luminance at this value: see SCORES.md`);

  for (const l of logs) console.log('  ' + l);
  await close();

  const pass = results.filter(r => r.pass).length;
  console.log(`\n${pass}/${results.length} gates pass  →  shots/p3b/`);
  writeFileSync(resolve(OUT, LOW ? '_gates_low.json' : '_gates.json'),
    JSON.stringify({ preset: LOW ? 'low' : 'high', at: new Date().toISOString(), results }, null, 2));
  if (pass !== results.length) process.exitCode = 1;
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
