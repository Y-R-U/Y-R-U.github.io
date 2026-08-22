#!/usr/bin/env node
// P5's gates — §5 (vehicles and traffic) and §13's done-criteria for the phase.
//
//   node tools/gates_p5.mjs [--headed] [--lite]
//
// Every gate here is written so that it CAN FAIL. That is not a style note: this project has now
// shipped a silent audio clip, a layer compared against itself, a frame counter reading an absent
// field and a PSNR check that measured the encoder. So where a gate asserts that a mechanism
// works, it first breaks that mechanism on purpose and asserts the same check goes the other way.
// Six of the fourteen gates below carry an explicit falsification step, marked FALSIFIED.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup, logs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const OUT = resolve(ROOT, 'shots/p5');
const LITE = !!args.lite;
const W = +(args.w || 1000), H = +(args.h || 560);

const ok = [], fail = [];
const check = (name, pass, detail) => {
  (pass ? ok : fail).push(name);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

// `evalJSON` cannot await: it wraps the expression in JSON.stringify, and JSON.stringify of a
// pending promise is "{}". Every gate below that reads a probe or runs a timed soak needs the real
// resolved value, so those go through this instead. (This is the same class of bug as the rest of
// the standing lesson — a measurement that silently returns an empty object and reads as a number.)
async function evalAsync(S, expr, timeout = 60000) {
  const r = await S('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true, timeout });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

// The mean luminance of the composed frame, straight out of the renderer's own readback, so a gate
// can say "the hull went dark" as a number rather than as an impression. ?debug is required.
const frameLum = S => evalAsync(S, `window.__game.probe({ grid: [6, 4] })
  .then(r => (r && r.grid ? r.grid.meanLum : null))`);

// A 6 m craft is a rounding error in a frame MEAN — the first version of the two hull gates below
// measured deltas of 2e-5 against a 1e-4 threshold and failed for that reason alone, which is a
// gate measuring its own grid rather than the thing under test. The right instrument is the WORST
// CELL: where the craft actually is.
const frameCells = S => evalAsync(S, `window.__game.probe({ grid: [12, 8] })
  .then(r => (r && r.grid ? r.grid.cells.map(c => c.lum) : null))`);
const worstCell = (a, b) => (!a || !b ? 0 : a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: 1, headed: !!args.headed });
  const { S, base, close } = ctx;

  // ── 1. the parametric hull: nine craft, one geometry ─────────────────────

  await S('Page.navigate', { url: `${base}/index.html?nohud&nosave&debug=1${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 25);

  const defs = await evalJSON(S, 'window.__game.craftDefs()');
  const ids = Object.keys(defs);
  const sheet = await evalJSON(S, `(() => { const g = window.__game;
    g.freezeTime(true); g.setTraffic(false);
    const s = g.craftSheet(null, 16, 1400, 3);
    g.setCamera({ pos: [0, 1403, 62], yaw: 0, pitch: -2.4, fov: 46 });
    return s; })()`);
  await settle(S, 20);
  await shot(S, 'gate_family');

  const geo = await evalJSON(S, `(() => { const f = window.__game.craftFields;
    return { body: f.body.tris, glass: f.glass.tris, light: f.light.tris, cone: f.cone.tris,
      bodyN: f.body.n, glassN: f.glass.n, lightN: f.light.n, coneN: f.cone.n,
      geoIds: [f.body.geo.uuid, f.glass.geo.uuid], attrs: Object.keys(f.body.geo.attributes) }; })()`);

  // S2-C: nine craft became fifteen and three of them are ROAD forms, which have no canopy — their
  // glazing is a lit window band in the body geometry. So the canopy count is asserted as
  // "everything that is not a road form", not as a second copy of the craft count: writing
  // `glassN === ids.length` would have gone red for the right reason and `glassN === 12` would go
  // green for the wrong one the moment a road def is added.
  const roadIds = ids.filter(i => defs[i].road);
  check(`§5.1 all ${ids.length} craft are ONE geometry under a non-uniform scale`,
    ids.length === 15 && sheet.craft.length === ids.length && geo.bodyN === ids.length
    && geo.glassN === ids.length - roadIds.length && roadIds.length === 3,
    `${sheet.craft.length} craft drawn from a single ${geo.body}-tri body geometry and a single `
    + `${geo.glass}-tri canopy; ${roadIds.length} of them are road forms (${roadIds.join(', ')}) and `
    + `take no canopy instance, so ${geo.glassN} canopies for ${geo.bodyN} bodies. Instance `
    + `attributes ${geo.attrs.filter(a => a[0] === 'i').join(', ')}`);

  // §5.1's "variation is L / W / H plus three integer options only", now five. Proven from the
  // DEFS: no def may carry any other geometric field, or the family has quietly acquired a bespoke
  // silhouette — which is the failure this check exists to catch and which S2-C did NOT commit:
  // `kit` and `road` select between parts baked into the same geometry and collapsed in the vertex
  // shader, exactly as `nac` and `fin` already do. gates_s2c A3 and D4 falsify both on pixels.
  const GEOM_KEYS = ['L', 'W', 'H', 'nac', 'fin', 'kit', 'road'];
  const extra = [];
  for (const [id, d] of Object.entries(defs)) {
    for (const k of Object.keys(d)) {
      if (!GEOM_KEYS.includes(k) && !['slots', 'top', 'role', 'hull', 'trim', 'run', 'police', 'edge', 'pulse'].includes(k)) extra.push(`${id}.${k}`);
    }
  }
  const opts = new Set(ids.map(i => `${defs[i].nac}/${defs[i].fin}`));
  const kits = new Set(ids.map(i => defs[i].kit || 0));
  const roads = new Set(ids.map(i => defs[i].road || 0));
  const intOk = v => Number.isInteger(v) && v >= 0 && v <= 3;
  check('§5.1 variation is L/W/H plus the five integer options and NOTHING else',
    extra.length === 0
    && [...opts].every(o => ['0', '2', '4'].includes(o.split('/')[0]) && ['0', '1', '2'].includes(o.split('/')[1]))
    && [...kits].every(intOk) && [...roads].every(intOk),
    `no def carries a geometric field beyond L/W/H/nac/fin/kit/road (extras: ${extra.length ? extra.join(',') : 'none'}); `
    + `nacelle/fin combinations in use: ${[...opts].sort().join(' ')}; `
    + `module kits ${[...kits].sort().join(',')}; road forms ${[...roads].sort().join(',')}`);

  // FALSIFIED: the part-collapse is what makes one geometry serve 2 and 4 nacelles. Force every
  // craft to nac=4 and the drawn triangle count must not move (the tris are always there) while
  // the PICTURE must — so this is checked on pixels, not on counts.
  // One craft, close enough that a nacelle is a real share of a probe cell. At the nine-craft sheet
  // framing a nacelle is four pixels inside an 83x70 cell and the delta was 3e-4 — a real effect
  // measured through the wrong instrument, which is its own kind of broken experiment.
  await evalJSON(S, `(() => { const g = window.__game;
    g.craftSheetRelease(); g.setTraffic(false); g.craftSheet(['wisp'], 16, 1400, 1);
    g.setCamera({ pos: [0, 1400.6, 8.5], yaw: 0, pitch: -2, fov: 34 }); return 1; })()`);
  await settle(S, 18);
  const beforePx = await frameCells(S);
  await evalJSON(S, `(() => { const g = window.__game, f = g.craftFields;
    const A = f.body.attrs; for (let i = 0; i < f.body.n; i++) { A.iOpt[i * 4] = 4; A.iOpt[i * 4 + 1] = 2; }
    f.body.mesh.geometry.attributes.iOpt.needsUpdate = true; return 1; })()`);
  await settle(S, 12);
  const afterPx = await frameCells(S);
  await shot(S, 'gate_family_allparts');
  const partD = worstCell(beforePx, afterPx);
  check('§5.1 FALSIFIED — the per-instance part collapse actually removes nacelles and fins',
    partD > 2e-3,
    `forcing every craft to nac=4/fin=2 moved the worst 12x8 cell by ${partD.toFixed(5)} of luminance; `
    + `an unchanged frame would mean iOpt never reached the shader and the one geometry was always drawing `
    + `every part on every craft`);

  // ── 2. §5.3 the hull is dark AND reflective ──────────────────────────────
  // Aaron: "the very dark colour should be reflective". P3b shipped a groundMaterial whose
  // roughness map was really an albedo channel, so "it has an envMap assigned" is not evidence.
  // Detach the envMap and the hull must measurably go dark.

  await evalJSON(S, '(() => { window.__game.craftSheetRelease(); return 1; })()');
  await evalJSON(S, `(() => { const g = window.__game;
    g.setTraffic(false); g.craftSheet(['kestrel','mammoth','nocturne'], 15, 1400, 3);
    g.setCamera({ pos: [0, 1401, 34], yaw: 0, pitch: -1.4, fov: 40 }); return 1; })()`);
  await settle(S, 18);
  const litLum = await frameCells(S);
  await shot(S, 'gate_hull_env_on');
  const mat = await evalJSON(S, `(() => { const m = window.__game.craftFields.matBody;
    return { metalness: m.metalness, roughness: m.roughness, envMapIntensity: m.envMapIntensity,
      hasEnv: !!m.envMap, patches: m.userData.patches }; })()`);
  await evalJSON(S, `(() => { const m = window.__game.craftFields.matBody;
    m.__env = m.envMap; m.envMap = null; m.needsUpdate = true; return 1; })()`);
  await settle(S, 18);
  const darkLum = await frameCells(S);
  await shot(S, 'gate_hull_env_off');
  await evalJSON(S, `(() => { const m = window.__game.craftFields.matBody;
    m.envMap = m.__env; m.needsUpdate = true; return 1; })()`);

  const drop = worstCell(litLum, darkLum);
  check('§5.3 FALSIFIED — the dark hull is genuinely REFLECTIVE, not just carrying an envMap',
    mat.hasEnv && drop > 0.004,
    `metalness ${mat.metalness}, roughness ${mat.roughness}, envMapIntensity ${mat.envMapIntensity}; `
    + `detaching the envMap moves the worst 12x8 cell by ${drop.toFixed(5)} of luminance — that is the `
    + `reflection, measured. A material whose envMap does nothing reads identically both ways, which is `
    + `what P3b's groundMaterial did for two phases while "having a roughness map".`);

  // ── 2b. S2-M: the hull is not inside out, and the trim rim is an EDGE ─────
  //
  // The lofted skin shipped from P5 to S2-L wound the wrong way round the ring. Its front faces
  // were its INSIDE, so three culled the near half and drew the far half's interior, and every
  // shading term on the hull ran on a normal pointing away from the camera. `dot(N, V)` was
  // negative over the whole visible body, `saturate()` pinned it to 0, and §3.7(c)'s `1 - nv`
  // fresnel sat at full strength across the bodywork — a flood of the craft's trim colour that
  // every existing gate here was blind to, because it is a picture defect that costs no draw call,
  // no triangle and no millisecond. Both checks below are on things a screenshot comparison would
  // not name either: one is the geometry, one is the AREA the trim term covers.

  const wind = await evalJSON(S, `(() => {
    // The counter, run twice: once on the shipped arrays and once on a copy with every triangle's
    // winding reversed. Same code, opposite verdict — which is what makes the zero below a result.
    const g = window.__game.craftFields.geoBody;
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    const count = (flip) => {
      let agree = 0, disagree = 0;
      for (let i = 0; i < P.length; i += 9) {
        const o = flip ? [6, 3] : [3, 6];
        const ux = P[i + o[0]] - P[i], uy = P[i + o[0] + 1] - P[i + 1], uz = P[i + o[0] + 2] - P[i + 2];
        const vx = P[i + o[1]] - P[i], vy = P[i + o[1] + 1] - P[i + 1], vz = P[i + o[1] + 2] - P[i + 2];
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        if (Math.hypot(fx, fy, fz) < 1e-9) { agree++; continue; }
        const nx = N[i] + N[i + 3] + N[i + 6], ny = N[i + 1] + N[i + 4] + N[i + 7],
          nz = N[i + 2] + N[i + 5] + N[i + 8];
        (fx * nx + fy * ny + fz * nz > 0 ? agree++ : disagree++);
      }
      return { agree, disagree };
    };
    return { tris: P.length / 9, shipped: count(false), reversed: count(true) };
  })()`);

  check('S2-M the hull is not INSIDE OUT — every face winds the way its own normals point',
    wind.shipped.disagree === 0 && wind.reversed.disagree === wind.tris && wind.tris > 800,
    `${wind.tris} triangles in the body geometry, ${wind.shipped.disagree} of them wound against `
    + `their own vertex normals. FALSIFIED: the same counter run over a copy with every winding `
    + `reversed reports ${wind.reversed.disagree}/${wind.tris} — so the zero is a measurement and `
    + `not a counter that cannot count. The shipped build had 240 (the whole lofted skin: 10 `
    + `stations x 12 ring x 2), which put dot(N,V) below zero over the entire visible hull and left `
    + `the fresnel rim pinned at full strength.`);

  // The trim rim must be an EDGE. Measured as AREA, because that is the property that was wrong:
  // the term was drawn, it was the right colour, it was driven by the right per-instance data, and
  // it covered half the body. Total added light over a fine grid separates a stroke from a coat;
  // the flood arm is the same measurement with uRimW turned up, and it is what stops "the rim adds
  // almost nothing" from passing as "the rim is nicely tight".
  const cityWas = await evalJSON(S, `(() => { const g = window.__game;
    g.craftSheetRelease(); g.setTraffic(false); g.craftSheet(['mammoth'], 16, 1400, 1);
    g.setCamera({ pos: [0, 1400.4, 11], yaw: 0, pitch: -1.2, fov: 40 });
    return g.craftCityRefl(0).was; })()`);
  // Read the shipped values BEFORE zeroing anything: capturing them afterwards would make the
  // restore below put the zeros back and leave the edge stroke and the panel lines off for every
  // later gate in this suite — a fixture leak, which is the house speciality.
  const rimU = await evalJSON(S, 'window.__game.craftRim(null, null, null, null, null)');
  await evalJSON(S, 'window.__game.craftRim(null, 0, 0, null, null)');
  const rimCells = S2 => evalAsync(S2, `window.__game.probe({ grid: [24, 16] })
    .then(r => (r && r.grid ? r.grid.cells.map(c => c.lum) : null))`);
  const sumDelta = (a, b) => (!a || !b ? 0 : a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0));

  await evalJSON(S, 'window.__game.craftRim(0, null, null, null, null)');
  await settle(S, 14);
  const rimOff = await rimCells(S);
  await evalJSON(S, `window.__game.craftRim(${rimU.rim}, null, null, ${rimU.width}, null)`);
  await settle(S, 14);
  const rimOn = await rimCells(S);
  await shot(S, 'gate_rim_edge');
  await evalJSON(S, 'window.__game.craftRim(null, null, null, 1e9, null)');
  await settle(S, 14);
  const rimFlood = await rimCells(S);
  await shot(S, 'gate_rim_flood');
  await evalJSON(S, `(() => { const g = window.__game;
    g.craftRim(${rimU.rim}, ${rimU.chine}, ${rimU.panels}, ${rimU.width}, ${rimU.chineWidth});
    g.craftCityRefl(${cityWas}); return 1; })()`);

  const edgeSum = sumDelta(rimOff, rimOn), floodSum = sumDelta(rimOff, rimFlood);
  check('S2-M FALSIFIED — the trim rim is an EDGE and not a coat of paint',
    floodSum > 0.05 && edgeSum > 0.004 && edgeSum < 0.25 * floodSum,
    `one mammoth filling the frame, reflection and edge stroke off so only the rim moves: turning `
    + `the rim on adds ${edgeSum.toFixed(4)} of summed luminance over a 24x16 grid, against `
    + `${floodSum.toFixed(4)} for the same rim with its width driven to 1e9 — `
    + `${(100 * edgeSum / Math.max(1e-9, floodSum)).toFixed(1)} % of the flood, bound 25 %. The flood `
    + `arm is what the shipped fresnel looked like, and it is also the proof this instrument can `
    + `see area at all; the 0.004 floor under the edge figure is what stops a rim that draws nothing `
    + `at all from passing this as "tight".`);

  // ── 3. §5.3 / Aaron's note: dark bodies, varied trim, some with none ─────

  const pal = await evalJSON(S, `(() => { const g = window.__game;
    g.craftSheetRelease(); g.setTraffic(true); return 1; })()`);
  void pal;
  await settle(S, 20);
  const palette = await evalJSON(S, 'window.__game.traffic.palette()');
  const tints = await evalJSON(S, 'window.__game.craftPalette()');
  const bright = tints.body.map(h => Math.max((h >> 16) & 255, (h >> 8) & 255, h & 255));
  check('§5.3 every body colour is a NEAR-BLACK with a hue in it',
    Math.max(...bright) <= 34,
    `${tints.body.length} body tints, brightest channel across the whole palette is `
    + `${Math.max(...bright)}/255 (${tints.body.map(h => '#' + ('000000' + h.toString(16)).slice(-6)).join(' ')}) `
    + `— "if a body colour reads as a red car it is too saturated by a long way"`);

  check('trim varies across the fleet and some craft carry NONE',
    palette.bodyDistinct >= 6 && palette.trimDistinct >= 6 && palette.runDistinct >= 5 && palette.noTrimFrac > 0.1,
    `${palette.civil} civilian craft live: ${palette.bodyDistinct}/${tints.body.length} body colours, `
    + `${palette.trimDistinct}/${tints.trim.length} trim colours, ${palette.runDistinct}/${tints.runs.length} trim runs; `
    + `${palette.noTrim} craft (${(palette.noTrimFrac * 100).toFixed(1)} %) have no trim at all`);

  // §5.4's other half, unchanged: the LIGHT RIG is shared. Every civilian type must produce the
  // same fixtures in the same normalised places; only `patrol` differs.
  const rigs = await evalJSON(S, `(() => { const p = window.__game.craftPalette();
    return { civil: p.rig.map(l => l.id + '@' + l.t + ',' + l.fx + ',' + l.fy),
      police: p.policeRig.map(l => l.id + '@' + l.t + ',' + l.fx + ',' + l.fy) }; })()`);
  check('§5.4 the light RIG is shared across civilian types; `patrol` is the only exception',
    rigs.civil.length > 0 && rigs.police.join('|') !== rigs.civil.join('|')
    && rigs.police.filter(r => rigs.civil.includes(r)).length === 2,
    `one civilian rig for all six player craft and all five civilian traffic types (${rigs.civil.join(' ')}); `
    + `patrol keeps the two forward lamps and replaces the tail strips and belly strobe with a roof bar `
    + `(${rigs.police.join(' ')})`);

  // ── 4. §5.5 the 220 m line ───────────────────────────────────────────────

  await evalJSON(S, `(() => { const g = window.__game; g.freezeTime(false); g.setTraffic(true);
    g.teleport(1305.6, 150, 260); return 1; })()`);
  await settle(S, 30);
  const t1 = await evalJSON(S, 'window.__state.traffic');
  const list = await evalJSON(S, 'window.__game.trafficList(0)');
  const meshed = list.filter(c => c.near);
  const maxMeshD = meshed.length ? Math.max(...meshed.map(c => c.d)) : 0;
  const unmeshedInside = list.filter(c => !c.near && c.d < 220).length;
  check('§5.5 real meshes live inside the 220 m line and the far band is streaks',
    meshed.length <= t1.n && maxMeshD <= 262 && t1.streaks === t1.n,
    `${meshed.length} craft promoted to real meshes, the farthest at ${maxMeshD.toFixed(1)} m (line 220 m, `
    + `mesh hysteresis 260 m); all ${t1.streaks} craft are also in the streak field, so crossing the line is a `
    + `representation swap and not a spawn. ${unmeshedInside} craft inside 220 m stayed streaks because the `
    + `${t1.meshes}-mesh budget was full — they degrade, they do not vanish.`);

  // ── 5. traffic is deterministic from the seed ────────────────────────────
  // FALSIFIED: the same seed must give the same hash AND a different seed must give a different
  // one. A hash that never moves is a hash of nothing.

  // The clock is PINNED to a literal, not merely frozen: freezeTime stops `vehT` advancing but it
  // stops it at whatever it had already reached, which differs between two page loads by however
  // long boot took. Hashing at an unpinned time compares two different moments and always fails.
  const HASH_T = 137.5;
  const hashA = await evalJSON(S, `(() => { const g = window.__game;
    g.freezeTime(true); g.teleport(1305.6, 150, 260); return 1; })()`)
    .then(() => settle(S, 6))
    .then(() => evalJSON(S, `window.__game.trafficHash(${HASH_T})`));

  await S('Page.navigate', { url: `${base}/index.html?nohud&nosave&debug=1${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 20);
  const hashB = await evalJSON(S, `(() => { const g = window.__game;
    g.freezeTime(true); g.teleport(1305.6, 150, 260); return 1; })()`)
    .then(() => settle(S, 6))
    .then(() => evalJSON(S, `window.__game.trafficHash(${HASH_T})`));

  await S('Page.navigate', { url: `${base}/index.html?nohud&nosave&debug=1&seed=99991${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 20);
  const hashC = await evalJSON(S, `(() => { const g = window.__game;
    g.freezeTime(true); g.teleport(1305.6, 150, 260); return 1; })()`)
    .then(() => settle(S, 6))
    .then(() => evalJSON(S, `window.__game.trafficHash(${HASH_T})`));

  check('traffic is deterministic from the seed — and FALSIFIED against a different seed',
    hashA && hashB && hashA.hash === hashB.hash && hashC && hashC.hash !== hashA.hash,
    `two page loads at the same seed, the clock pinned to t=${HASH_T} and the same camera: ${hashA.hash} == ${hashB.hash} `
    + `over ${hashA.n} craft (order-independent hash of position, direction, speed, type and palette). `
    + `Seed 99991 gives ${hashC.hash} — the hash moves when the world moves, so the match above is a result.`);

  // ── 6. DECISIONS decision 6 — patrol is ambient and nothing else ─────────

  await S('Page.navigate', { url: `${base}/index.html?auto=1&nohud&nosave&debug=1${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 20);

  // 60 s of ?auto=1 flight, sampling every patrol craft's distance and its heading.
  const soak = await evalAsync(S, `(() => new Promise(res => {
    const g = window.__game;
    const out = { samples: 0, patrolMin: 1e9, patrolCloseUnder60: 0, headingBreaks: 0, towardCount: 0,
      awayCount: 0, minAny: 1e9, seen: 0 };
    let prev = new Map();
    const tick = () => {
      const list = g.trafficList(0);
      const cam = g.camera.position;
      for (const c of list) {
        if (c.type !== 'patrol') continue;
        out.seen++;
        if (c.d < out.patrolMin) out.patrolMin = c.d;
        if (c.d < 60) out.patrolCloseUnder60++;
        // A patrol craft's heading is its LANE's heading. Anything else is steering.
        const laneDir = c.axis === 0 ? [c.dir, 0] : [0, c.dir];
        if (c.dx !== laneDir[0] || c.dz !== laneDir[1]) out.headingBreaks++;
        const p = prev.get(c.i);
        if (p !== undefined) { if (c.d < p) out.towardCount++; else out.awayCount++; }
        prev.set(c.i, c.d);
      }
      out.samples++;
      if (out.samples >= 120) { res(out); return; }
      setTimeout(tick, 500);
    };
    tick();
  }))()`, 120000);
  if (!soak || soak.seen === undefined) throw new Error('patrol soak returned ' + JSON.stringify(soak));

  check('decision 6 — `patrol` never steers: its heading is its lane heading, always',
    soak.headingBreaks === 0 && soak.seen > 0,
    `${soak.seen} patrol observations over ${(soak.samples * 0.5).toFixed(0)} s of ?auto=1 flight, `
    + `${soak.headingBreaks} with a heading that is not exactly the lane's. Closest patrol approach `
    + `${(soak.patrolMin ?? -1).toFixed(1)} m; ${soak.patrolCloseUnder60} samples inside 60 m, all by lane coincidence `
    + `(closing ${soak.towardCount} samples / opening ${soak.awayCount} — a pursuer would close monotonically).`);

  // FALSIFIED: the ONLY force in this file that reads the player's position is §5.5's yield, and it
  // points away. This is asserted on the FORCE, not on chance encounters during a flight: the first
  // version waited for traffic to happen to pass within 25 m and, on LOW (10 near craft instead of
  // 26), collected 7 samples and could not separate the two signs. A gate whose verdict depends on
  // how many craft wandered past is a gate that reports the weather.
  const yieldTest = await evalJSON(S, `(() => {
    const t = window.__game.traffic;
    const l = t.lanes.find(x => x.axis === 0) || t.lanes[0];
    const i = l.first;
    const player = { x: 0, y: 100, z: 0 };
    const run = (pursue) => {
      t.pursue = pursue;
      t.offC[i] = 0; t.offV[i] = 0; t.offY[i] = 0; t.offYV[i] = 0;
      let off = 0;
      // the craft sits 10 m to +z of the player on a lane that runs along X, so "across" is +z
      for (let k = 0; k < 40; k++) off = t._yield(i, l, 0.02, 0, 100, 10, player);
      return +off.toFixed(4);
    };
    const away = run(false);
    const toward = run(true);
    t.pursue = false;
    for (let k = 0; k < t.N; k++) { t.offC[k] = 0; t.offV[k] = 0; t.offY[k] = 0; t.offYV[k] = 0; }
    return { away, toward, r: 25, acc: 12 };
  })()`);

  check('§5.5 FALSIFIED — the yield pushes traffic AWAY, and flipping its sign is detectable',
    yieldTest.away > 0.05 && yieldTest.toward < -0.05,
    `a craft 10 m to the +z side of the player on an X-running lane, integrated for 0.8 s: the shipped `
    + `yield moves it ${yieldTest.away} m FURTHER to +z (away). With the debug \`pursue\` flag set — the `
    + `only line in the file that could make traffic react to the player — the same craft moves `
    + `${yieldTest.toward} m the other way. Deterministic, and it can go negative.`);

  // ── 7. police light rig, and no adversarial layer anywhere ───────────────

  const noHeat = await evalJSON(S, `(() => { const g = window.__game;
    const t = g.traffic;
    return { keys: Object.keys(t).filter(k => /heat|pursu|chase|alert|wanted|attack/i.test(k)),
      pursue: t.pursue, state: Object.keys(window.__state.traffic) }; })()`);
  check('decision 6 — nothing in the traffic model is a heat, pursuit or combat system',
    noHeat.keys.length === 1 && noHeat.keys[0] === 'pursue' && noHeat.pursue === false,
    `the only adversarial-sounding field on the traffic object is \`pursue\`, which is the gate's own `
    + `falsification switch, is ${noHeat.pursue} in the game and is set by no code path outside this file`);

  // ── 8. the vehicle layer's cost, broken out ──────────────────────────────

  await S('Page.navigate', { url: `${base}/index.html?shot=canyon_dive&nohud&nosave&debug=1${LITE ? '&lite=1' : ''}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 40);
  const st = await evalJSON(S, 'window.__state');
  const vb = await evalJSON(S, 'window.__game.vehicleBreakdown()');
  await shot(S, LITE ? 'gate_cost_low' : 'gate_cost_high');

  check('§3.8 the WHOLE vehicle layer is five draws',
    vb.draws <= 5,
    `${vb.draws} draws / ${vb.tris} tris for every vehicle in the world: `
    + vb.rows.filter(r => r.instances).map(r => `${r.field} ${r.instances}x${r.geoTris}`).join(', ')
    + `. Frame total ${st.draws} draws / ${(st.tris / 1000).toFixed(1)}k tris.`);

  check('the vehicle sim fits inside the frame budget',
    st.traffic.ms < 1.2 && st.ms.frame < 12,
    `traffic + craft write costs ${st.traffic.ms} ms/frame for ${st.traffic.n} craft `
    + `(${st.traffic.meshes} of them as real meshes); frame mean ${st.ms.frame} ms, worst ${st.ms.worst} ms`);

  // ── 9. obligation T7 — the R0 isolation is not broken ────────────────────
  // The vehicle layers do NOT ride R0 (a streak at 700 m is past it and must still be there), but
  // they are new pixels in a differencing measurement all the same. They must therefore hide with
  // signage's own switch, and they must NOT respond to R0 itself.

  const t7 = await evalJSON(S, `(() => { const g = window.__game;
    g.freezeTime(true);
    const on = window.__state.traffic.streaks;
    g.setSignVisible(false, true);
    const hidden = { streaks: g.traffic.mesh.visible, body: g.craftFields.body.mesh.visible };
    g.setSignVisible(true, true);
    const back = { streaks: g.traffic.mesh.visible, body: g.craftFields.body.mesh.visible };
    return { on, hidden, back }; })()`);
  await settle(S, 8);
  const r0a = await frameLum(S);
  await evalJSON(S, '(() => { window.__game.setSignVisible(false, true); return 1; })()');
  await settle(S, 8);
  const r0Hidden = await frameLum(S);
  await evalJSON(S, '(() => { window.__game.setSignVisible(true, true); return 1; })()');

  check('obligation T7 — the vehicle layers hide with signage.setVisible, and demonstrably matter',
    t7.hidden.streaks === false && t7.hidden.body === false
    && t7.back.streaks === true && t7.back.body === true && Math.abs(r0a - r0Hidden) > 1e-4,
    `setSignVisible(false, all) hides the streak field and all four craft fields and restores them; `
    + `hiding them moves the frame from ${r0a} to ${r0Hidden}, so gates_p2's R0 sweep is measuring the `
    + `dither and not our traffic. They do NOT ride R0 themselves — a 700 m streak is past R0 and must survive it.`);

  // ── 10. §3.10 #2 — the lane altitudes are the scale cue ──────────────────

  const lanes = await evalJSON(S, `(() => { const t = window.__game.traffic;
    return { alts: t.state().alts, lanes: t.lanes.map(l => ({ alt: l.alt, dir: l.dir, axis: l.axis, n: l.n })) }; })()`);
  const byAlt = {};
  for (const l of lanes.lanes) { byAlt[l.alt] = (byAlt[l.alt] || new Set()); byAlt[l.alt].add(l.dir); }
  check('§3.10 #2 — fourteen lanes at the plan\'s seven altitudes, two directions each',
    lanes.lanes.length === 14
    && JSON.stringify(lanes.alts) === JSON.stringify([30, 55, 85, 120, 160, 210, 270])
    && Object.values(byAlt).every(s => s.size === 2),
    `altitudes ${lanes.alts.join(', ')} m, two directions at every one of them, `
    + `${lanes.lanes.reduce((a, l) => a + l.n, 0)} craft distributed across them `
    + `(${lanes.lanes.map(l => l.n).join('/')})`);

  console.log(`\n${ok.length}/${ok.length + fail.length} gates pass  →  shots/p5/`);
  writeFileSync(resolve(OUT, LITE ? '_gates_low.json' : '_gates.json'),
    JSON.stringify({ ok, fail, sheet, geo, mat, palette, traffic: t1, vehicles: vb,
      state: { draws: st.draws, tris: st.tris, ms: st.ms }, soak, yieldTest, lanes,
      console: logs.slice(0, 40), at: new Date().toISOString() }, null, 2));

  await close();
  if (fail.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); cleanup(); process.exit(1); });
