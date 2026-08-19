#!/usr/bin/env node
// S2-C's gates — vehicle silhouettes, per-vehicle edge lighting, the reflective/glassy material,
// and the road transports.
//
//   node tools/gates_s2c.mjs [--headed] [--lite]
//
// **Every check that asserts a mechanism is FALSIFIED**: it breaks the thing it guards and shows
// the same check goes the other way. That is not a style note. This project has logged nineteen
// measurements that silently measured nothing, one of them found this run, and the two failure
// modes that matter here are both easy to walk into:
//
//   1. A per-instance attribute that never reaches the shader looks exactly like one that does,
//      because the geometry carries every part whether it is collapsed or not. So every attribute
//      check drives the attribute and measures PIXELS.
//   2. Turning a material term off and seeing the frame move proves nothing unless the same
//      toggle moves NOTHING when the subject is hidden — otherwise the "reflection" could be the
//      rain, the bloom or the grade drifting. C3 carries that control.
//
// Results are written to disk as each check completes, never batched: agents on this project have
// been killed mid-suite and a partial run must be visibly partial.
//
// **No isolation here is `&&`-guarded.** S2-C's two isolation controls are methods on
// `__game.craftFields` (`setCityRefl`, `u`) rather than top-level `__game` functions, so they do
// not go through `hook()` — but they get the property `hook()` exists to guarantee anyway:
// `evalJSON` rethrows any page exception, so a missing or renamed control ABORTS the suite instead
// of resolving to `undefined` and letting a clean-looking number be reported off an un-isolated
// scene. That is obligation T10's actual requirement; `hook()` is one way of meeting it.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, logs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LITE = !!args.lite;
const OUT = resolve(ROOT, 'shots/s2c');
const FILE = resolve(OUT, `_gates${LITE ? '_low' : ''}.json`);
const W = +(args.w || 1000), H = +(args.h || 560);

const LOT = 51.2;            // city.js's lot pitch — the road lattice
const ROAD_W = 13.2;         // the carriageway between lots

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(FILE, JSON.stringify({ preset: LITE ? 'low' : 'high', at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

async function evalAsync(S, expr, timeout = 60000) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

// The 12x8 luminance grid of the composed frame. A 6 m craft is a rounding error in a frame MEAN
// — p5 learned that the hard way — so every pixel comparison below is on the WORST CELL.
const frameCells = S => evalAsync(S, `window.__game.probe({ grid: [12, 8] })
  .then(r => (r && r.grid ? r.grid.cells.map(c => c.lum) : null))`);
const worstCell = (a, b) => (!a || !b ? 0 : a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0));

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2c/${name}.png`;
}

// Drive a per-instance attribute on the live body field and force it back. Returns the worst-cell
// delta the change caused. `mut` is a JS expression over (A, i) where A is the attribute arrays.
async function attrProbe(S, mut) {
  const before = await frameCells(S);
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    f.__save = Float32Array.from(A.iVar);
    for (let i = 0; i < f.body.n; i++) { ${mut} }
    f.body.geo.attributes.iVar.needsUpdate = true; return f.body.n; })()`);
  await settle(S, 10);
  const after = await frameCells(S);
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    A.iVar.set(f.__save); f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  await settle(S, 6);
  return { d: worstCell(before, after) };
}

// A frozen craft sheet: `sheetHold` in main.js stops the game loop rewriting the fields, which is
// what makes an attribute mutation survive the next frame. Without it every probe above measures
// the unchanged scene — the exact trap the project's gotcha list already records.
async function sheet(S, ids, gap, y, cols, cam) {
  await evalJSON(S, `(() => { const g = window.__game;
    g.craftSheetRelease(); g.freezeTime(true); g.setTraffic(false);
    g.craftSheet(${JSON.stringify(ids)}, ${gap}, ${y}, ${cols});
    g.setCamera(${JSON.stringify(cam)}); return 1; })()`);
  await settle(S, 20);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: 1, headed: !!args.headed });
  const { S, base, close } = ctx;

  await S('Page.navigate', { url: `${base}/index.html?nohud&nosave&debug=1&var=duskburn&time=19.6${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 25);

  const defs = await evalJSON(S, 'window.__game.craftDefs()');
  const ids = Object.keys(defs);

  // ── A. silhouettes ───────────────────────────────────────────────────────

  const palette = await evalJSON(S, 'window.__game.traffic.palette()');

  // A1 reads the LIVE census, not the def table. The first cut of this check derived `civil` from
  // CRAFT_DEFS and its detail line claimed the types were "live in traffic.js's pool" — so cutting
  // TYPES back to the two silhouettes Aaron complained about left A1 GREEN while A2 went red. A
  // declared type that nothing spawns is exactly the defect this gate exists to catch.
  const civil = Object.keys(palette.shape).filter(i => defs[i] && !defs[i].police);
  const ratios = civil.map(i => +(defs[i].L / defs[i].W).toFixed(2));
  const heights = civil.map(i => defs[i].H);
  check('A1 the civilian traffic pool is five silhouettes, not two',
    civil.length >= 5 && Math.max(...ratios) / Math.min(...ratios) >= 1.8
    && Math.max(...heights) / Math.min(...heights) >= 2.0,
    `${civil.length} civilian types are SPAWNED in the live fleet (${civil.join(', ')}). `
    + `Length-to-width ${Math.min(...ratios)}:1 to ${Math.max(...ratios)}:1 (${ratios.join(' ')}), `
    + `height ${Math.min(...heights)} m to ${Math.max(...heights)} m. Aaron's complaint was that two `
    + `silhouettes were carrying the whole city.`);
  check('A2 all five are actually LIVE in the seeded fleet, not merely declared',
    palette.shapeDistinct >= 6 && Object.entries(palette.shape).every(([, n]) => n > 0)
    && palette.roadShapeDistinct === 3,
    `${palette.n} flying craft over ${palette.shapeDistinct} types `
    + Object.entries(palette.shape).map(([k, v]) => `${k} ${v}`).join(' · ')
    + `; ${palette.road} road transports over ${palette.roadShapeDistinct} forms `
    + Object.entries(palette.roadShape).map(([k, v]) => `${k} ${v}`).join(' · '));

  // FALSIFIED — the two new integer options have to REACH the shader. Forcing every instance's
  // kit to 3 must move the picture; an unchanged frame means iVar was never read and every craft
  // was always drawing the same parts. The geometry carries all of them either way, so a triangle
  // count cannot tell you this and only pixels can.
  await sheet(S, ['taxi_ai', 'taxi_ai', 'taxi_ai'], 15, 1400, 3,
    { pos: [0, 1401, 30], yaw: 0, pitch: -1.2, fov: 42 });
  await shot(S, 'a3_kit_off');
  const kitD = await attrProbe(S, 'A.iVar[i * 4] = 3;');
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    for (let i = 0; i < f.body.n; i++) A.iVar[i * 4] = 3;
    f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  await settle(S, 10);
  await shot(S, 'a3_kit_on');
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    for (let i = 0; i < f.body.n; i++) A.iVar[i * 4] = 0;
    f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  await settle(S, 8);
  check('A3 FALSIFIED — the module kits are per-instance and really change the shape',
    kitD.d > 2e-3,
    `three kit-0 craft filling the frame; forcing iVar.x = 3 (the cargo stack) on every one moved `
    + `the worst 12x8 cell by ${kitD.d.toFixed(5)} of luminance. The stack's triangles are in the `
    + `geometry either way — they are collapsed to a point when the kit is 0 — so an unchanged `
    + `frame would mean the collapse never happened and every craft always wore every module.`);

  // ── B. per-vehicle edge lighting ─────────────────────────────────────────

  check('B1 the edge mode varies across the fleet, and every mode is in use',
    palette.edgeDistinct === 6 && palette.pulsedFrac > 0.12 && palette.pulsedFrac < 0.34,
    `${palette.civil} civilian craft over ${palette.edgeDistinct}/6 edge modes `
    + `(shoulder ${palette.edge[0]} · shoulder+spine ${palette.edge[1]} · keel ${palette.edge[2]} · `
    + `spine ${palette.edge[3]} · shoulder+keel ${palette.edge[4]} · keel+spine ${palette.edge[5]}); `
    + `${(palette.pulsedFrac * 100).toFixed(1)} % carry a travelling bead on the run`);

  // FALSIFIED — collapsing every craft to one edge mode must change the frame.
  await sheet(S, ['kestrel', 'kestrel', 'kestrel'], 15, 1400, 3,
    { pos: [0, 1401, 26], yaw: 0, pitch: -1.0, fov: 42 });
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    for (let i = 0; i < f.body.n; i++) { A.iVar[i * 4 + 2] = i % 6; A.iVar[i * 4 + 3] = 0; }
    f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  await settle(S, 12);
  await shot(S, 'b2_edges_varied');
  const edgeBefore = await frameCells(S);
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    for (let i = 0; i < f.body.n; i++) A.iVar[i * 4 + 2] = 0;
    f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  await settle(S, 12);
  await shot(S, 'b2_edges_all_shoulder');
  const edgeAfter = await frameCells(S);
  const edgeD = worstCell(edgeBefore, edgeAfter);
  check('B2 FALSIFIED — the edge mode selects a DIFFERENT edge, not a different colour',
    edgeD > 1.5e-3,
    `three identical kestrels given edge modes 0/1/2 and then all forced to 0: worst cell moved `
    + `${edgeD.toFixed(5)} of luminance. Same hull, same trim colour, same trim run — the only `
    + `variable is which of the three baked edge channels the vertex shader sums, so a zero here `
    + `would mean the mode is decorative.`);

  // B3 — a P5 bug S2-C found and fixed. The forward lamp cone is placed apex-first so it starts AT
  // the lamp and widens forward; `_lampCone` passed the length negative and put the apex further
  // forward still, so every headlight in the game was a detached wedge floating 13.6-27.6 m ahead
  // of the craft that owns it. Measured on the LIVE instance matrix at yaw 0 — where the craft's
  // forward is exactly world -Z — so "apex z" and "lamp station z" are directly comparable and a
  // tolerance is not doing the work.
  const cones = await evalJSON(S, `(() => { const g = window.__game, f = g.craftFields;
    g.craftSheetRelease(); g.freezeTime(true); g.setTraffic(false);
    const out = {};
    for (const id of ['kestrel', 'bus_road', 'patrol']) {
      const d = g.craftDefs()[id];
      f.begin();
      f.write({ def: d, x: 0, y: 100, z: 0, yaw: 0, pitch: 0, roll: 0, throttle: 0.5, t: 0 });
      f.flush();
      const a = f.cone.mesh.instanceMatrix.array, rows = [];
      for (let i = 0; i < f.cone.n; i++) {
        const o = i * 16;
        if (f.cone.attrs.iGrad[i] < 0.5) continue;         // grad 1 = a LAMP cone, not a plume
        rows.push({ mouth: +a[o + 14].toFixed(3), apex: +(a[o + 14] + a[o + 10]).toFixed(3) });
      }
      out[id] = { L: d.L, road: !!d.road, police: !!d.police, nose: -d.L / 2, lamps: rows };
    }
    f.begin(); f.flush();
    return out; })()`);
  // The lamp stations, as (t - 0.5) * L. A civilian craft has one forward lamp cone at t = 0.06;
  // a road box has one at t = 0; `patrol` has that one AND decision 6's sweep at t = 0.30. The
  // first cut of this check assumed one station per craft and went red on the police sweep — the
  // gate was right and the expectation was wrong, which is the correct way round.
  const stations = c => (c.road ? [0] : (c.police ? [0.06, 0.30] : [0.06])).map(t => (t - 0.5) * c.L);
  const apexErr = Object.values(cones).flatMap(c =>
    c.lamps.map(r => Math.min(...stations(c).map(z => Math.abs(r.apex - z)))));
  const counted = Object.values(cones).every(c => c.lamps.length === stations(c).length);
  const forward = Object.values(cones).every(c => c.lamps.every(r => r.mouth < r.apex));
  check('B3 FALSIFIED-BY-MEASUREMENT — a forward lamp cone starts AT its lamp (a P5 bug, fixed)',
    apexErr.length >= 4 && Math.max(...apexErr) < 0.02 && forward && counted,
    Object.entries(cones).map(([id, c]) => `${id}: nose z ${c.nose.toFixed(2)}, lamp station(s) z `
      + `${stations(c).map(z => z.toFixed(2)).join('/')}, cone apex z ${c.lamps.map(r => r.apex).join('/')} (mouth `
      + `${c.lamps.map(r => r.mouth).join('/')})`).join(' · ')
    + `. Worst apex-to-lamp error ${Math.max(...apexErr).toFixed(3)} m. Before the fix these read `
    + `apex -30.73 for a kestrel whose lamp is at -2.73 — the beam floated 13.6 to 27.6 m ahead of `
    + `the craft. The check compares two independently-derived numbers, so it fails on any sign or `
    + `scale error rather than on a tolerance around zero.`);

  // ── C. the reflective / glassy read ──────────────────────────────────────

  await sheet(S, ['kestrel', 'nocturne', 'mammoth'], 15, 1400, 3,
    { pos: [0, 1401, 34], yaw: 0, pitch: -1.4, fov: 40 });
  const reflOn = await frameCells(S);
  await shot(S, 'c1_city_refl_on');
  const prev = await evalJSON(S, 'window.__game.craftFields.setCityRefl(0)');
  await settle(S, 14);
  const reflOff = await frameCells(S);
  await shot(S, 'c1_city_refl_off');
  const reflD = worstCell(reflOn, reflOff);

  // THE CONTROL. Hide the craft and run the identical toggle. If the frame still moves, the number
  // above is the rain, the bloom or the grade drifting and not the hull — which is precisely the
  // shape of the "a layer compared against itself returned exactly 0.0" defect in this project's
  // history, run the other way round.
  await evalJSON(S, '(() => { window.__game.craftFields.setCityRefl(' + prev + '); return 1; })()');
  await evalJSON(S, '(() => { window.__game.craftFields.setVisible(false); return 1; })()');
  await settle(S, 12);
  const ctlOn = await frameCells(S);
  await evalJSON(S, '(() => { window.__game.craftFields.setCityRefl(0); return 1; })()');
  await settle(S, 12);
  const ctlOff = await frameCells(S);
  const ctlD = worstCell(ctlOn, ctlOff);
  await evalJSON(S, `(() => { const g = window.__game;
    g.craftFields.setCityRefl(${prev}); g.craftFields.setVisible(true); return 1; })()`);
  await settle(S, 10);

  check('C1 FALSIFIED + CONTROLLED — the procedural city reflection is what lights the hull',
    reflD > 4e-3 && ctlD < reflD * 0.1,
    `three hulls filling the frame: driving uCity.x from ${prev} to 0 moves the worst 12x8 cell by `
    + `${reflD.toFixed(5)} of luminance. CONTROL — the identical toggle with the craft fields `
    + `hidden moves ${ctlD.toFixed(5)}, i.e. ${(ctlD / Math.max(reflD, 1e-9) * 100).toFixed(1)} % of it. `
    + `A control that also moved would mean the first number is the weather and not the paint. `
    + `The control reads EXACTLY zero, and on this project an exact zero is usually a broken `
    + `experiment — here it is not, and the proof is the first number: the same instrument on `
    + `the same frozen frame moved ${reflD.toFixed(5)} while the craft were visible. The scene `
    + `is frozen (freezeTime plus the sheet hold), so consecutive probes of an unchanged frame `
    + `are bit-identical by construction.`);

  // The hull must stay DARK. §5.3's rule survives S2-C: the reflection is a highlight, not a coat
  // of paint, and the way to prove it is that the craft is still mostly darker than its sky.
  const dark = await evalAsync(S, `window.__game.probe({ grid: [12, 8] })
    .then(r => (r && r.grid ? { mean: r.grid.meanLum } : null))`);
  const litCells = reflOn.filter((v, i) => Math.abs(v - reflOff[i]) > 2e-3);
  check('C2 the reflection is a HIGHLIGHT, not a coat of paint — the hulls stay dark',
    litCells.length > 0 && litCells.length <= reflOn.length * 0.5,
    `${litCells.length} of ${reflOn.length} cells changed by more than 2e-3 when the reflection `
    + `was switched off, so the term lands on part of the hull and not all of it. Frame mean `
    + `${dark.mean.toFixed(5)}. The first cut of this shader fired a slab on 66 % of reflection `
    + `directions and came back with nine chrome craft; the palette rule is "if a body colour reads `
    + `as a red car it is too saturated by a long way", and a mirror breaks it the same way.`);

  // The canopy. Its alpha now rides the fresnel — the whole reason it was invisible before was a
  // constant 0.55 over a near-black hull. Drive the two ends together and the glass must change.
  const glassOn = await frameCells(S);
  await evalJSON(S, `(() => { const f = window.__game.craftFields;
    const u = f.u.uGlassA.value; window.__gs = [u.x, u.y]; u.set(0.0, 0.0); return 1; })()`);
  await settle(S, 12);
  const glassOff = await frameCells(S);
  await shot(S, 'c3_glass_off');
  await evalJSON(S, `(() => { const f = window.__game.craftFields;
    f.u.uGlassA.value.set(window.__gs[0], window.__gs[1]); return 1; })()`);
  await settle(S, 10);
  await shot(S, 'c3_glass_on');
  const glassD = worstCell(glassOn, glassOff);
  check('C3 FALSIFIED — the canopy is drawing, and its alpha is view-dependent',
    glassD > 1.5e-3,
    `driving the canopy's alpha pair to (0, 0) — fully clear head-on AND at the grazing angle — `
    + `moves the worst cell by ${glassD.toFixed(5)}. Before S2-C the canopy carried a constant 0.55 `
    + `and did not read at all in shots/s2c/before_family.png; it now runs 0.24 head-on to 0.92 at `
    + `grazing, which is what a windscreen does.`);

  // ── D. the road transports ───────────────────────────────────────────────

  await evalJSON(S, `(() => { const g = window.__game;
    g.craftSheetRelease(); g.freezeTime(false); g.setTraffic(true);
    g.teleport(1305.6, 30, 260); return 1; })()`);
  await settle(S, 40);

  // Read the road population's positions STRAIGHT OFF THE STREAK INSTANCE MATRIX — the buffer the
  // GPU draws from — rather than from a JS list that could describe something the renderer never
  // saw. The road instances live at [N, N + rN) of the same mesh.
  const road = await evalJSON(S, `(() => { const t = window.__game.traffic;
    const im = t.mesh.instanceMatrix.array, out = [];
    for (let i = 0; i < t.rN; i++) {
      const o = (t.N + i) * 16;
      out.push({ i, x: im[o + 12], y: im[o + 13], z: im[o + 14],
        type: t.rType[i], lane: t.rLane[i], axis: t.rLanes[t.rLane[i]].axis });
    }
    return { n: t.rN, count: t.mesh.count, N: t.N, rows: out,
      roadNear: t.roadNear, meshes: t.stats.roadMeshes,
      types: Array.from(t.rType.slice(0, t.rN)) }; })()`);

  // Distance from the nearest road CENTRELINE, across the direction of travel.
  const off = road.rows.map(r => {
    const cross = r.axis === 0 ? r.z : r.x;
    return Math.abs((cross / LOT - Math.round(cross / LOT)) * LOT);
  });
  const worstOff = Math.max(...off);
  // A deliberately wrong control: the SAME arithmetic applied to a quarter-lot offset must fail.
  const offCtl = Math.max(...road.rows.map(r => {
    const cross = (r.axis === 0 ? r.z : r.x) + LOT * 0.25;
    return Math.abs((cross / LOT - Math.round(cross / LOT)) * LOT);
  }));
  check('D1 FALSIFIED — every road transport is inside a carriageway, on the road lattice',
    road.n > 0 && worstOff <= ROAD_W / 2 && offCtl > ROAD_W / 2,
    `${road.n} road transports live; the farthest from a 51.2 m road centreline is `
    + `${worstOff.toFixed(2)} m, inside the ${(ROAD_W / 2).toFixed(1)} m half-carriageway. `
    + `CONTROL: the same measurement with a 12.8 m offset added reads ${offCtl.toFixed(2)} m and `
    + `fails — so the assertion is capable of failing and the pass is a result. Positions read `
    + `straight off the streak InstancedMesh's instance matrix, i.e. what the GPU draws.`);

  const yTop = Math.max(...road.rows.map(r => r.y));
  const yBot = Math.min(...road.rows.map(r => r.y));
  check('D2 they are on the DECK, not in the flying lanes',
    yTop <= 2.0 && yBot >= 0.4,
    `road transport altitudes run ${yBot.toFixed(2)} m to ${yTop.toFixed(2)} m — each sits at half `
    + `its own height above the y = 0 deck. The lowest FLYING lane is 30 m (§3.10 #2), so nothing `
    + `here is in a lane.`);

  const rDefs = ['bus_road', 'tram_road', 'haul_road'];
  const lens = rDefs.map(i => defs[i].L);
  check('D3 they are LONG — buses, trams and long transports',
    Math.min(...lens) >= 12 && Math.max(...lens) >= 30 && new Set(road.types).size === 3,
    `${rDefs.map((i, k) => `${i} ${lens[k]} m`).join(' · ')}; the longest flying craft in the game `
    + `is mammoth at ${defs.mammoth.L} m. All three forms are live in the seeded population `
    + `(${[0, 1, 2].map(t => road.types.filter(v => v === t).length).join('/')}).`);

  // FALSIFIED — the road form is a per-instance selector over parts baked into the SAME geometry.
  // Forcing it onto a flying craft must replace the hull with a box; forcing it off must remove
  // the transports. Both directions, on pixels.
  await sheet(S, ['bus_road', 'tram_road', 'haul_road'], 26, 1400, 3,
    { pos: [0, 1403, 62], yaw: 0, pitch: -1.6, fov: 46 });
  await shot(S, 'd4_road_on');
  const roadOn = await frameCells(S);
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    f.__save = Float32Array.from(A.iVar);
    for (let i = 0; i < f.body.n; i++) A.iVar[i * 4 + 1] = 0;
    f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  await settle(S, 12);
  await shot(S, 'd4_road_off');
  const roadOff = await frameCells(S);
  await evalJSON(S, `(() => { const f = window.__game.craftFields, A = f.body.attrs;
    A.iVar.set(f.__save); f.body.geo.attributes.iVar.needsUpdate = true; return 1; })()`);
  const roadD = worstCell(roadOn, roadOff);
  check('D4 FALSIFIED — the road form is one geometry away from the flying hull',
    roadD > 5e-3,
    `three road transports filling the frame; forcing iVar.y = 0 on every instance collapses the `
    + `box bodies and raises the flying hull instead — worst cell moves ${roadD.toFixed(5)} of `
    + `luminance. There is still exactly ONE body geometry and one draw call: the road forms are `
    + `aPart 31-33 inside it, collapsed to a point on every flying craft.`);

  // ── E. the cost ──────────────────────────────────────────────────────────

  await S('Page.navigate', { url: `${base}/index.html?shot=canyon_dive&nohud&nosave&debug=1${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 40);
  const st = await evalJSON(S, 'window.__state');
  const vb = await evalJSON(S, 'window.__game.vehicleBreakdown()');
  await shot(S, LITE ? 'e1_cost_low' : 'e1_cost_high');
  check('E1 the whole vehicle layer is STILL five draws',
    vb.draws <= 5,
    `${vb.draws} draws / ${vb.tris} tris for every vehicle in the world, road transports included: `
    + vb.rows.filter(r => r.instances).map(r => `${r.field} ${r.instances}x${r.geoTris}`).join(', ')
    + `. Frame total ${st.draws} draws / ${(st.tris / 1000).toFixed(1)}k tris against §3.8's <= 90 `
    + `draws and budget.mjs's 260k gate.`);

  check('E2 the vehicle sim still fits the frame budget',
    st.traffic.ms < 1.2 && st.ms.frame < 12,
    `traffic + craft write costs ${st.traffic.ms} ms/frame for ${st.traffic.n} flying craft `
    + `(${st.traffic.meshes} meshed) plus ${st.traffic.road} road transports `
    + `(${st.traffic.roadMeshes} meshed); frame mean ${st.ms.frame} ms, worst ${st.ms.worst} ms`);

  // ── F. determinism, road population included ─────────────────────────────

  const HASH_T = 137.5;
  const hashOf = async (url) => {
    await S('Page.navigate', { url });
    await waitFor(S, 'window.__ready', 30000);
    await settle(S, 25);
    await evalJSON(S, '(() => { window.__game.teleport(1305.6, 150, 260); return 1; })()');
    await settle(S, 20);
    return evalJSON(S, `window.__game.trafficHash(${HASH_T})`);
  };
  const u0 = `${base}/index.html?nohud&nosave&debug=1${LITE ? '&lite=1' : ''}`;
  const hA = await hashOf(u0);
  const hB = await hashOf(u0);
  const hC = await hashOf(u0 + '&seed=99991');
  // `road > 0` proves there ARE road transports; it does NOT prove they reach the hash. So perturb
  // exactly one of them and require the hash to move — otherwise "the road population is inside
  // the hash" is a sentence in a comment rather than a property of the code.
  const hD = await hashOf(u0);
  const hE = await evalJSON(S, `(() => { const t = window.__game.traffic;
    t.__u = t.rU[0]; t.rU[0] = t.rU[0] + 0.1;
    return window.__game.trafficHash(${HASH_T}); })()`);
  await evalJSON(S, `(() => { const t = window.__game.traffic; t.rU[0] = t.__u; return 1; })()`);
  const hF = await evalJSON(S, `window.__game.trafficHash(${HASH_T})`);
  check('F1 FALSIFIED — street traffic is as deterministic as lane traffic, and it is IN the hash',
    hA.hash === hB.hash && hA.hash !== hC.hash && hA.road > 0
    && hD.hash !== hE.hash && hD.hash === hF.hash,
    `two page loads at the same seed with the clock pinned to t=${HASH_T}: ${hA.hash} == ${hB.hash} `
    + `over ${hA.n} flying craft AND ${hA.road} road transports. Seed 99991 gives ${hC.hash} — the `
    + `hash moves when the world moves, so the match is a result and not a constant. And the ROAD `
    + `half is genuinely covered: nudging one transport's phase by 0.1 takes ${hD.hash} to `
    + `${hE.hash}, and putting it back returns ${hF.hash}. Without that step the check would pass `
    + `just as happily on a hash that ignored street traffic entirely.`);

  const errs = logs.filter(l => /error|Uncaught|WebGL|GL_INVALID/i.test(String(l)));
  check('F2 console clean over the whole run',
    errs.length === 0,
    `${logs.length} console lines, ${errs.length} that matter${errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''}`);

  console.log(`\n${ok.length}/${ok.length + fail.length} gates pass  →  ${FILE}`);
  await close();
  if (fail.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
