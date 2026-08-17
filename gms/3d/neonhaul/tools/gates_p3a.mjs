#!/usr/bin/env node
// P3a's done-criteria, as one command. Like gates_p2.mjs, everything here asserts on `__state`, on
// the live instance buffers, or on SAMPLED PIXELS — a screenshot cannot tell you whether a sign is
// 0.4 m proud of a facade or 8 m off the front of a `taper` setback, and it certainly cannot tell
// you whether the mip chain is doing anything.
//
//   node tools/gates_p3a.mjs
//   node tools/gates_p3a.mjs --lite            ← the LOW preset
//   node tools/gates_p3a.mjs --headed          ← real GPU
//
// Obligation T5: headless ANGLE on this machine stalls above ~5 Mpx of HalfFloat + 2x MSAA, so
// this runs at dpr 1 and a modest viewport by default.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup, logs } from './shot.mjs';
import { GATES } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const W = +(args.w || 1000), H = +(args.h || 620), DPR = +(args.dpr || 1);
const LITE = args.lite ? '&lite=1' : '';
const LOW = !!args.lite;
const OUT = resolve(ROOT, 'shots/p3a');
const SIGNS = JSON.parse(readFileSync(resolve(ROOT, 'data/signs.json'), 'utf8'));

// The baked aspect of every kind, read straight out of the bake manifest, so §3.10 #4 is checked
// against P1b's own numbers and not against anything signage.js believes.
const KIND_ASPECT = {};
for (const r of SIGNS.regions) KIND_ASPECT[r.kind] = r.aspect;

// §3.5.5's size bands, verbatim. A sign outside its band is §3.10 #4 broken.
const BAND = {
  1: { key: 'blade', dim: 'h', min: 3.0, max: 5.2, proud: [0.9, 1.4] },
  2: { key: 'board', dim: 'w', min: 11.5, max: 24.5, proud: [0.35, 0.45] },
  3: { key: 'panel', dim: 'w', min: 7.5, max: 16.5, proud: [0.25, 0.35] },
  4: { key: 'rule', dim: 'w', min: 7.5, max: 24.5, proud: [0.1, 0.2] },
  5: { key: 'hero', dim: 'h', min: 59, max: 111, proud: [0.9, 1.1] },
};

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

// Wait for the near ring to be COMPLETE, not merely for the queue to look empty. After a camera
// jump the queue is still empty for a frame or two — retarget has not run yet — so polling
// `queued === 0` straight away exits before any work has been queued at all, and every
// measurement afterwards is taken on a half-streamed city. That flake cost an hour.
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
  return `shots/p3a/${name}.png`;
}

const cam = (S, pos, yaw, pitch, fov = 62) =>
  evalJSON(S, `(window.__game.setCamera({pos:[${pos}],yaw:${yaw},pitch:${pitch},fov:${fov}}),1)`);

// The Lantern Quarter, off the authored core: 45 % commercial, so it is the densest signage in the
// game and therefore the honest place to measure a budget.
const DENSE = [1330, 150, 430];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed, sw: !!args.sw });
  const { S, base, close } = ctx;

  // ── 1. the sheet loads the way P1b baked it ──────────────────────────────
  await goto(S, base, 'debug=1&var=deepnight&nosave&nohud');
  let st = await evalJSON(S, 'window.__state');
  const sa = await evalJSON(S, 'window.__game.signAtlas()');
  const patchWarns = (st.errors || []).filter(e => /patch MISSED/.test(e.msg || ''));
  check('the baked sheet loads with P1b\'s own conventions, and no patch() missed',
    sa && sa.flipY === false && sa.mips === 3 && sa.regions === 250 && sa.colorSpace === ''
    && sa.anisotropy >= 1 && st.errors.length === 0 && !patchWarns.length,
    `assets/signs.png ${sa.size}² → flipY ${sa.flipY} (top-left u,v — the shader flips v), `
    + `colorSpace "${sa.colorSpace}" (NoColorSpace: it is a mask, not colour), `
    + `${sa.mips} hand-built mip levels (stopping at 2 keeps the 4 px pad ring above one texel), `
    + `anisotropy ${sa.anisotropy}\n      `
    + `${sa.regions} regions: ${JSON.stringify(sa.counts.byMode)} by mode, ${JSON.stringify(sa.counts.byClass)} by class\n      `
    + `${st.errors.length} error(s) in __state.errors, ${patchWarns.length} patch miss(es)`);

  // ── 2. the budget, with signage broken out ───────────────────────────────
  await cam(S, DENSE, 20, -6);
  await drain(S);
  await evalJSON(S, 'window.__game.resetPerf()');
  await settle(S, 30);
  st = await evalJSON(S, 'window.__state');
  const bd = await evalJSON(S, 'window.__game.cityBreakdown()');
  const sg = await evalJSON(S, 'window.__game.signBreakdown()');
  await shoot(S, LOW ? 'dense_low' : 'dense');

  const table = bd.rows.filter(r => r.instances > 0)
    .map(r => `${r.field.padEnd(13)} ${r.draws} draw ${String(r.instances).padStart(5)} inst `
      + `x ${String(r.geoTris).padStart(3)} tri = ${String(r.tris).padStart(7)}  (cap ${r.cap})`).join('\n      ');

  check(`draw and triangle budget at ${LOW ? 'LOW' : 'HIGH'} (65 draws / ${GATES.tris / 1000}k tris)`,
    st.draws <= 65 && st.tris <= GATES.tris && bd.overflow === 0,
    `${st.draws} draws, ${(st.tris / 1000).toFixed(1)}k tris standing in the Lantern Quarter\n      `
    + `SIGNAGE SUB-TOTAL: ${sg.draws} draws / ${(sg.tris / 1000).toFixed(1)}k tris `
    + `(${sg.rows.map(r => r.field + ' ' + r.instances).join(', ')})\n      ` + table
    + `\n      field overflow: ${bd.overflow} — a field that overflows drops instances silently`);

  // ── 2b. field caps hold in EVERY district, not just the one we measured in ──
  //
  // Each field peaks somewhere different — signs in the Lantern Quarter, strobes in Vault Row's
  // 260-620 m towers, strips and masts wherever the building count is highest — and a field that
  // overflows drops instances silently, so a single camera proves nothing. Vault at 2785 strobes
  // against a 2800 cap is exactly the near miss this check exists to find.
  const DISTRICT_SPOTS = [
    ['Vault Row', [-7808, 300, -9088]], ['Lantern Quarter', [5504, 180, -10112]],
    ['The Ribs', [-2944, 180, 1920]], ['Sootfields', [3968, 200, -10112]],
    ['The Cradle', [8320, 220, -9344]], ['The Spine', [40, 220, 30]],
  ];
  const peaks = {};
  let capFail = [];
  for (const [name, p] of DISTRICT_SPOTS) {
    await cam(S, p, 20, -6);
    await drain(S);
    const b = await evalJSON(S, 'window.__game.signBreakdown()');
    for (const r of b.rows) {
      const use = r.instances / r.cap;
      if (!peaks[r.field] || use > peaks[r.field].use) peaks[r.field] = { use, n: r.instances, cap: r.cap, at: name };
      if (r.overflow) capFail.push(`${r.field} overflowed in ${name}`);
    }
  }
  check('every signage field cap holds in every district',
    !capFail.length && Object.values(peaks).every(p => p.use < 0.95),
    Object.entries(peaks).map(([f, p]) => `${f.padEnd(11)} peak ${String(p.n).padStart(4)} / ${String(p.cap).padStart(4)} `
      + `= ${(p.use * 100).toFixed(0).padStart(3)} %  in ${p.at}`).join('\n      ')
    + `\n      ${capFail.length ? capFail.join('; ') : 'no field overflowed in any of the six districts sampled'}`);

  await cam(S, DENSE, 20, -6);
  await drain(S);

  // ── 3. §3.5.5 — five layers, and §3.10 #4's fixed size bands ─────────────
  //
  // Sampled from THREE districts, not one. The near ring is 5x5 at HIGH but 3x3 at LOW, an eighth
  // of the area, and L5 heroes and decision 9's posters are rare by design — one 3x3 ring can
  // legitimately contain none of either. So the layer, poster and facade checks run over the union
  // of the Lantern Quarter (dense signage), the Pennant (three authored L5 heroes) and the Spine
  // (220-520 m towers, which is where posters can exist at all).
  const dense = await evalJSON(S, 'window.__game.signMeta()');
  const stats = await evalJSON(S, 'window.__game.signStats()');
  const PENNANT = [1596, 210, 180], SPINE = [40, 220, 30];
  await cam(S, PENNANT, 200, -4);
  await drain(S);
  const atPennant = await evalJSON(S, 'window.__game.signMeta()');
  await cam(S, SPINE, 118, -4);
  await drain(S);
  const atSpine = await evalJSON(S, 'window.__game.signMeta()');
  const seen = new Set(), meta = [];
  for (const m of dense.concat(atPennant, atSpine)) {
    const k = m.kind + m.x.toFixed(2) + m.y.toFixed(2) + m.z.toFixed(2);
    if (seen.has(k)) continue;
    seen.add(k); meta.push(m);
  }
  const byLayer = {};
  for (const m of meta) (byLayer[m.layer] = byLayer[m.layer] || []).push(m);
  const layerN = l => (byLayer[l] || []).length;

  const bandFails = [];
  const aspFails = [];
  for (const m of meta) {
    const B = BAND[m.layer];
    const v = B.dim === 'h' ? m.h : m.w;
    // posters ride the L2 roll but are their own 12-20 m band (decision 9)
    //
    // P11 / ART_PASS item 2 adds a SECOND exception on the same principle: an authored landmark's
    // hero rides the L5 roll but is its own 80-190 m band. §3.5.5's 60-110 m was derived against
    // §3.1's 51.2 m seeded lot (DECISIONS T6.1) and a landmark is explicitly not lot-limited —
    // `market` is an authored 180 x 140 m mass. This is a NEW rung on §3.10 #4's ruler, with its
    // own constant size, not a widening of L5: seeded heroes are still checked against 59-111 and
    // a seeded hero at 150 m still fails this gate.
    const lo = m.cls === 'poster' ? 11.5 : m.cls === 'megahero' ? 79.5 : B.min;
    const hi = m.cls === 'poster' ? 20.5 : m.cls === 'megahero' ? 190.5 : B.max;
    if (v < lo - 0.01 || v > hi + 0.01) bandFails.push(`${m.kind} L${m.layer} ${B.dim}=${v.toFixed(2)}`);
    const want = m.kind === 'hero' && stats.heroFps > 0 ? 0.5 : KIND_ASPECT[m.kind];
    if (want && Math.abs(m.w / m.h - want) > 0.02) aspFails.push(`${m.kind} ${(m.w / m.h).toFixed(3)} vs ${want}`);
  }
  check('§3.5.5 five layers populated, §3.10 #4 fixed size bands and baked aspect preserved',
    [1, 2, 3, 4, 5].every(l => (byLayer[l] || []).length > 0) && !bandFails.length && !aspFails.length,
    `over three districts: L1 blades ${layerN(1)}  L2 boards ${layerN(2)}  L3 panels ${layerN(3)}  `
    + `L4 rules/tickers ${layerN(4)}  L5 heroes ${layerN(5)}\n      `
    + `in the Lantern Quarter ring alone: ${stats.blade}/${stats.board}/${stats.panel}/${stats.rule}/`
    + `${stats.hero} against §3.5.5's near-ring targets of 260/220/140/210/12\n      `
    + `${meta.length} signs audited; ${stats.rejected} placements dropped for want of a face — `
    + `dropped, never shrunk to fit\n      `
    + `size-band violations: ${bandFails.length ? bandFails.slice(0, 6).join('; ') : 'none'}\n      `
    + `aspect violations (a stretched tile is a broken ruler): ${aspFails.length ? aspFails.slice(0, 6).join('; ') : 'none'}`);

  // ── 4. the geometric audit — nothing floats, nothing crosses a setback ───
  //
  // Re-derives every facade from blocks.js' OWN unit-space box list and asks four questions of
  // every live sign: is its back plane ON a face; is its whole vertical extent inside that one
  // continuous face; is its horizontal extent inside it too; and is its stand-off point outside
  // every other mass. A sign hovering off a `taper` step is the expected failure and it is
  // question one; a sign spanning a setback is question two.
  const boxesByProto = await evalJSON(S, 'window.__game.protoBoxes()');
  const audit = { n: 0, float: [], setback: [], overrun: [], buried: [], round: 0 };
  for (const m of meta) {
    audit.n++;
    const boxes = boxesByProto[m.proto];
    if (!boxes) continue;
    // strip the stand-off back off to recover the wall point
    const wx = m.x - m.nx * m.off, wz = m.z - m.nz * m.off;
    const ux = (wx - m.bx) / m.bw, uy = m.y / m.bh, uz = (wz - m.bz) / m.bd;
    const halfU = (m.h / 2) / m.bh;

    if (m.face >= 4) {                        // a `drum` facet
      audit.round++;
      const r = Math.hypot(ux, uz), inr = 0.5 * Math.cos(Math.PI / 10);
      if (Math.abs(r - inr) > 0.02) audit.float.push(`${m.kind} drum r=${r.toFixed(3)} want ${inr.toFixed(3)}`);
      continue;
    }

    // find the box whose face this sign is standing on
    let host = null;
    for (const b of boxes) {
      if (b.round) continue;
      const on = (m.nx > 0.5 && Math.abs(ux - b.x1) < 0.004) || (m.nx < -0.5 && Math.abs(ux - b.x0) < 0.004)
        || (m.nz > 0.5 && Math.abs(uz - b.z1) < 0.004) || (m.nz < -0.5 && Math.abs(uz - b.z0) < 0.004);
      if (!on) continue;
      if (uy < b.y0 - 1e-6 || uy > b.y1 + 1e-6) continue;
      if (!host || (b.y1 - b.y0) > (host.y1 - host.y0)) host = b;
    }
    if (!host) { audit.float.push(`${m.kind} L${m.layer} on ${m.proto} at y ${m.y.toFixed(1)} touches no face`); continue; }

    if (uy - halfU < host.y0 - 1e-4 || uy + halfU > host.y1 + 1e-4) {
      audit.setback.push(`${m.kind} L${m.layer} on ${m.proto}: ${(halfU * 2 * m.bh).toFixed(1)} m tall across a face of ${((host.y1 - host.y0) * m.bh).toFixed(1)} m`);
    }
    // horizontal: heroes are allowed <= 1.6x their host face (a screen strapped across a tower)
    const faceW = Math.abs(m.nx) > 0.5 ? (host.z1 - host.z0) * m.bd : (host.x1 - host.x0) * m.bw;
    const lim = m.layer === 5 ? faceW * 1.6 : faceW;
    const span = m.perp ? 0 : m.w;           // a blade's width is its projection, not its span
    if (span > lim + 0.02) audit.overrun.push(`${m.kind} L${m.layer} ${m.w.toFixed(1)} m on a ${faceW.toFixed(1)} m face`);

    const px = ux + m.nx * 0.9 / m.bw, pz = uz + m.nz * 0.9 / m.bd;
    for (const b of boxes) {
      if (b === host || b.round) continue;
      if (px > b.x0 + 1e-4 && px < b.x1 - 1e-4 && uy > b.y0 + 1e-4 && uy < b.y1 - 1e-4
        && pz > b.z0 + 1e-4 && pz < b.z1 - 1e-4) { audit.buried.push(`${m.kind} on ${m.proto} inside another mass`); break; }
    }
  }
  check('every sign is ON a facade: none floating, none across a setback, none buried',
    !audit.float.length && !audit.setback.length && !audit.overrun.length && !audit.buried.length,
    `${audit.n} signs audited against blocks.js' own box list (${audit.round} of them on the `
    + `\`drum\`, which needs a facet normal rather than a cardinal one)\n      `
    + `floating off the facade : ${audit.float.length}${audit.float.length ? ' — ' + audit.float.slice(0, 4).join('; ') : ''}\n      `
    + `crossing a setback      : ${audit.setback.length}${audit.setback.length ? ' — ' + audit.setback.slice(0, 4).join('; ') : ''}\n      `
    + `wider than its face     : ${audit.overrun.length}${audit.overrun.length ? ' — ' + audit.overrun.slice(0, 4).join('; ') : ''}\n      `
    + `buried in another mass  : ${audit.buried.length}${audit.buried.length ? ' — ' + audit.buried.slice(0, 4).join('; ') : ''}`);

  // ── 5. §3.5.5 rule 1 — blades project perpendicular ──────────────────────
  // A blade's PROJECTION is how far its outer edge stands off the wall: the quad plane contains
  // the wall normal, so that is (centre offset + half its width), not the centre offset alone.
  const blades = (byLayer[1] || []).map(m => Object.assign({ proj: m.off + m.w / 2 }, m));
  const perpBad = blades.filter(m => !m.perp || m.proj < BAND[1].proud[0] || m.proj > BAND[1].proud[1]);
  // the quad's normal must be at right angles to the wall normal it hangs off
  const yawBad = blades.filter(m => {
    const qn = [Math.sin(m.yaw), Math.cos(m.yaw)];
    return Math.abs(qn[0] * m.nx + qn[1] * m.nz) > 0.02;
  });
  check('§3.5.5 rule 1 — street blades project PERPENDICULAR from the face, ~1.2 m proud',
    blades.length > 0 && !perpBad.length && !yawBad.length,
    `${blades.length} blades. Projection ${Math.min(...blades.map(m => m.proj)).toFixed(2)}-`
    + `${Math.max(...blades.map(m => m.proj)).toFixed(2)} m (§3.5.5 asks 1.2; the 0.25 baked aspect on a `
    + `3.2-5.0 m tile gives 0.92-1.37 and the tile's aspect is not ours to change)\n      `
    + `${yawBad.length} blades whose plane is not at right angles to the wall — a blade flush to the `
    + `wall is invisible when you fly parallel to it, which is the whole point of the rule\n      `
    + `heights ${Math.min(...blades.map(m => m.h)).toFixed(1)}-${Math.max(...blades.map(m => m.h)).toFixed(1)} m`);

  // ── 6. §3.5.5 rule 2 — signage clusters, it does not sprinkle ────────────
  const perB = new Map();
  for (const m of dense) {
    const k = Math.round(m.bx) + ',' + Math.round(m.bz);
    perB.set(k, (perB.get(k) || 0) + 1);
  }
  const lit = perB.size, total = st.city.lod0;
  const MEANMIN = LOW ? 2.0 : 3.5;      // Q.signDensity is 0.55 at LOW; 4-9 signs becomes 2-5
  const counts = [...perB.values()];
  const mean = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  const dark = 1 - lit / total;
  check('§3.5.5 rule 2 — signage CLUSTERS: dense blocks next to dark blocks, not an even wash',
    dark > 0.45 && mean >= MEANMIN,
    `${lit} of ${total} near-ring buildings carry signage — ${(dark * 100).toFixed(1)} % of the city `
    + `is deliberately DARK. A commercial face carries ${Math.min(...counts)}-${Math.max(...counts)} `
    + `signs (mean ${mean.toFixed(1)}, floor ${MEANMIN} at this preset — Q.signDensity is `
    + `${stats.density}); a non-commercial one carries zero.\n      `
    + `Per-district commercial rate: ribs and lantern 45 %, pale 12 %, the rest between (§3.5.5). `
    + `Uniform density is the failure mode the P3 critic round is watching for.`);

  // ── 7. DECISIONS decision 9 — posters live high, and only high ───────────
  const posters = meta.filter(m => m.cls === 'poster');
  const lowPoster = posters.filter(m => m.y - m.h / 2 < 120);
  check('DECISIONS 9 — figurative poster tiles are DISTANCE ONLY: upper facade, never at eye level',
    posters.length > 0 && !lowPoster.length && posters.length <= meta.length * 0.06,
    `${posters.length} posters of ${meta.length} signs (${(posters.length / meta.length * 100).toFixed(1)} % — `
    + `decision 9 wants punctuation, not wallpaper). Lowest edge ${posters.length ? Math.min(...posters.map(m => m.y - m.h / 2)).toFixed(0) : '-'} m, `
    + `highest ${posters.length ? Math.max(...posters.map(m => m.y + m.h / 2)).toFixed(0) : '-'} m.\n      `
    + `Rule enforced at placement: host >= 200 m tall, sign centre above max(120 m, 0.55 h), one per `
    + `building. ${lowPoster.length} below the 120 m floor.\n      `
    + `L5 heroes sit at ${(byLayer[5] || []).length ? Math.min(...byLayer[5].map(m => m.y - m.h / 2)).toFixed(0) : '-'}-`
    + `${(byLayer[5] || []).length ? Math.max(...byLayer[5].map(m => m.y + m.h / 2)).toFixed(0) : '-'} m.`);

  // ── 8. §3.10 #3 — the strobe column spacing is exactly 60 m ──────────────
  const cols = await evalJSON(S, 'window.__game.strobeColumns()');
  let worstGap = 0, gaps = 0, tallest = 0, n = 0, offGrid = 0, wrongCount = 0;
  for (const c of cols) {
    n += c.y.length;
    tallest = Math.max(tallest, c.y.length);
    for (const y of c.y) if (Math.abs(y % 60) > 1e-9) offGrid++;
    for (let i = 1; i < c.y.length; i++) { gaps++; worstGap = Math.max(worstGap, Math.abs(c.y[i] - c.y[i - 1] - 60)); }
    // and the column must be COMPLETE: one strobe at every 60 m the building is tall enough for
    if (c.y.length !== Math.floor((c.h - 4) / 60 + 1e-9)) wrongCount++;
  }
  check('§3.10 #3 — warning strobes at EXACTLY 60 m of height, on every building over 180 m',
    worstGap < 1e-9 && offGrid === 0 && wrongCount === 0 && n > 0,
    `${n} strobes in ${cols.length} columns, grouped by BUILDING (a \`taper\`'s strobes step inward `
    + `with its setbacks, so keying a column on position would split one column into three and hide `
    + `a 120 m gap).\n      `
    + `${gaps} gaps measured, worst deviation from 60.000 m: ${worstGap.toExponential(2)} m. `
    + `${offGrid} strobes off the 60 m grid. ${wrongCount} columns with the wrong strobe count for `
    + `their building's height.\n      `
    + `Tallest column ${tallest} strobes = ${tallest * 60} m of height read on one silhouette. Red, `
    + `0.85 Hz, per-building phase, billboarded so it is never edge-on.`);

  // ── 9. §3.2.2 part 2 — signage RAMPS at the LOD0 boundary, it does not pop ─
  //
  // The measurement, not the screenshot — and measured on ONE SIGN, which is the whole trick.
  //
  // The obvious test (sweep R0 with a fixed camera and watch the frame) does not work here and it
  // took two attempts to see why: R0 also drives the LOD0 building dither, and the 25 near chunks
  // sit on a 256 m lattice so they cross the band at a dozen different R0 values. The aggregate
  // over all of them is a smooth curve WHETHER OR NOT the ramp exists — measured, both modes
  // declined identically. So: park 55 m in front of one board, sweep R0 so that board's own chunk
  // walks from a = 0 to a = 1, and read that board's pixels. Nothing else moves.
  // Candidates: an additive board big enough to read, whose CHUNK CENTRE is 80-220 m from where
  // the camera will park. The chunk-centre distance is what `d` in the ramp actually is, and a
  // candidate whose chunk centre lands under the camera gives d ~ 0, an R0 sweep of 1.2 -> 0.9 m
  // and a completely meaningless measurement.
  const D = 45;
  const cands = meta.filter(m => {
    if (m.layer !== 2 || m.perp || m.mode !== 'tube' || m.w < 16 || m.y < 35 || m.y > 130) return false;
    const cx = Math.floor(m.bx / 256) * 256 + 128, cz = Math.floor(m.bz / 256) * 256 + 128;
    const d = Math.hypot(m.x + m.nx * D - cx, m.z + m.nz * D - cz);
    return d > 80 && d < 220;
  });
  let ramp = null;
  await evalJSON(S, 'window.__game.freezeTime(true)');
  // The LOD1 field is hidden for the whole measurement. At a = 1 the chunk is fully LOD1, and an
  // LOD1 box is the prototype's BOUNDING box — wider than the setback face the sign is 0.4 m proud
  // of, so it swallows the sign. That is harmless in the game (both happen together, and the sign
  // has ramped to nothing by then) but it destroys the control: with the ramp collapsed to a hard
  // cut-off the sign stays bright and is hidden anyway, so the "pop" reads as zero. Measured.
  await evalJSON(S, '(window.__game.city.lod1.mesh.visible = false, 1)');
  for (const m of cands.slice(0, 8)) {
    const cx = Math.floor(m.bx / 256) * 256 + 128, cz = Math.floor(m.bz / 256) * 256 + 128;
    const px = m.x + m.nx * D, pz = m.z + m.nz * D;
    await cam(S, [px.toFixed(1), m.y.toFixed(1), pz.toFixed(1)],
      (Math.atan2(m.nx, m.nz) * 180 / Math.PI).toFixed(2), 0, 30);
    await drain(S);
    const d = Math.hypot(px - cx, pz - cz);
    const pt = `{ points: [[${m.x.toFixed(2)}, ${m.y.toFixed(2)}, ${m.z.toFixed(2)}]], r: 22 }`;
    const at = async () => {
      const on = (await evalP(S, `window.__game.probe(${pt})`)).points[0].lum;
      await evalJSON(S, 'window.__game.setSignVisible(false)');
      await settle(S, 3);
      const off = (await evalP(S, `window.__game.probe(${pt})`)).points[0].lum;
      await evalJSON(S, 'window.__game.setSignVisible(true)');
      await settle(S, 3);
      return on - off;
    };
    const N = 22;
    // a = (d - 0.85 R0) / (0.15 R0) runs 0 -> 1 as R0 falls from d/0.85 to d/1.0
    const setA = k => evalJSON(S, `window.__game.city.setR0(${(d / (0.80 + 0.26 * k / (N - 1))).toFixed(2)})`);
    await evalJSON(S, 'window.__game.setSignHard(false)');
    await setA(0); await settle(S, 3);
    const lo = await at();
    await setA(N - 1); await settle(S, 3);
    const hi = await at();
    if (lo - hi < 0.05) continue;           // this board is occluded or too dim to measure
    const curve = async hard => {
      await evalJSON(S, `window.__game.setSignHard(${hard})`);
      const out = [];
      for (let k = 0; k < N; k++) { await setA(k); await settle(S, 3); out.push(await at()); }
      let worst = 0, at2 = -1;
      for (let i = 1; i < out.length; i++) {
        const dd = Math.abs(out[i] - out[i - 1]);
        if (dd > worst) { worst = dd; at2 = i; }
      }
      return { out, worst: +worst.toFixed(5), at: at2, span: +(out[0] - out[out.length - 1]).toFixed(5) };
    };
    const soft = await curve(false);
    const hard = await curve(true);
    ramp = { m, d, soft, hard };
    break;
  }
  await evalJSON(S, 'window.__game.setSignHard(false)');
  await evalJSON(S, 'window.__game.city.setR0(0)');
  await evalJSON(S, '(window.__game.city.lod1.mesh.visible = true, 1)');
  await evalJSON(S, 'window.__game.freezeTime(false)');
  const rp = ramp || { soft: { span: 0, worst: 0, out: [], at: -1 }, hard: { worst: 0, at: -1 }, d: 0, m: {} };
  check('§3.2.2 part 2 — signage ramps to zero over the outer 15 % of the LOD0 band',
    rp.soft.span > 0.02 && rp.hard.worst > rp.soft.worst * 2.0
      && rp.soft.worst < rp.soft.span * 0.35,
    `ONE ${rp.m.kind || '-'} board, ${(rp.m.w || 0).toFixed(1)} x ${(rp.m.h || 0).toFixed(1)} m, camera parked 45 m in `
    + `front of it and NOT MOVED. Its chunk centre is ${rp.d.toFixed(0)} m away; R0 is swept so that `
    + `chunk walks from a = 0 to a = 1 across the band. 45 px disc on the board, differenced against `
    + `the same frame with the sign quads hidden.\n      `
    + `control ${rp.soft.span.toFixed(5)}  the board's own luminance from full to nothing — the probe `
    + `demonstrably sees this sign, without which the rest is vacuous\n      `
    + `ramp    ${rp.soft.worst.toFixed(5)}  worst single-step change (iIntensity *= 1 - smoothstep(0.85 R0, R0, d))\n      `
    + `        and it is ${(rp.soft.worst / Math.max(1e-9, rp.soft.span) * 100).toFixed(0)} % of the total swing, `
    + `i.e. spread across the band rather than landing in one place\n      `
    + `hard    ${rp.hard.worst.toFixed(5)}  the same sweep with the ramp collapsed to a cut-off at R0 — `
    + `${(rp.hard.worst / Math.max(1e-9, rp.soft.worst)).toFixed(1)}x, and it all lands in one step (step ${rp.hard.at} of 22)\n      `
    + `ramp curve: ${(rp.soft.out || []).map(v => v.toFixed(3)).join(' ')}\n      `
    + `hard curve: ${(rp.hard.out || []).map(v => v.toFixed(3)).join(' ')}`);

  // ── 10. §3.5.4 — the mip chain is real, and it is what stops the crawl ───
  //
  // "Not crawling when the camera moves" measured rather than watched: walk the camera in 1.5 m
  // steps down a signage-dense canyon and take the worst per-cell luminance change between
  // consecutive frames, twice — once with the chain and once with it switched off. Aliasing is
  // exactly high-frequency temporal energy, so the ratio IS the crawl.
  // Isolated the same way, and for the same reason: the building atlas has its own aliasing and it
  // is most of the frame.
  await goto(S, base, 'debug=1&var=deepnight&nosave&nohud');
  async function layer32() {
    const on = (await evalP(S, 'window.__game.probe({ grid: [32, 24] })')).grid.cells.map(c => c.lum);
    await evalJSON(S, 'window.__game.setSignVisible(false)');
    await settle(S, 2);
    const off = (await evalP(S, 'window.__game.probe({ grid: [32, 24] })')).grid.cells.map(c => c.lum);
    await evalJSON(S, 'window.__game.setSignVisible(true)');
    await settle(S, 2);
    return on.map((v, i) => v - off[i]);
  }
  // A fixed camera looking ACROSS the ring, not standing next to a sign: mipmaps matter under
  // minification, and a vantage 80 m from a cluster of 4 m blades is magnification, where the
  // chain has nothing to do. Measured — the same test from a close vantage reports a static A/B of
  // 0.0004 against 0.039 from here.
  const DOLLY = [DENSE[0], 60, DENSE[2]];
  await evalJSON(S, 'window.__game.freezeTime(true)');
  async function crawl(mips) {

    await evalJSON(S, `window.__game.setSignMips(${mips})`);
    const out = [];
    for (let k = 0; k < 12; k++) {
      await cam(S, [DOLLY[0] + k * 1.5, DOLLY[1], DOLLY[2] + k * 1.5], 20, -2, 62);
      if (k === 0) await drain(S);
      await settle(S, 3);
      out.push(await layer32());
      if (k === 6) await shoot(S, mips ? 'canyon_mips' : 'canyon_nomips');
    }
    let e = 0;
    for (let i = 1; i < out.length; i++)
      for (let c = 0; c < out[i].length; c++) e += Math.abs(out[i][c] - out[i - 1][c]);
    return +(e / ((out.length - 1) * out[0].length)).toFixed(6);
  }
  const withMips = await crawl(true);
  // The same measurement again, unchanged, so the gate knows its OWN noise floor. Without it there
  // is no way to tell a real 5 % difference from run-to-run scatter, and at LOW — where ringNear is
  // 1 and the whole sign field sits inside 256 m, barely minified — the difference IS the scatter.
  const withMips2 = await crawl(true);
  const noMips = await crawl(false);
  // Two floors, and both are needed. `floor` is run-to-run scatter, which with a fixed camera and
  // frozen time is almost zero — so on its own it would call a 0.004-of-an-8-bit-level difference
  // "resolvable" and gate on its SIGN, which is exactly what flipped this check between runs at
  // LOW. MEANING is the absolute floor: a difference smaller than 1e-4 of luminance per cell is
  // not a crawl anybody can see, whatever its repeatability.
  const floor = Math.abs(withMips2 - withMips);
  const MEANING = 1e-4;
  const delta = noMips - withMips;
  const resolvable = Math.abs(delta) > Math.max(floor * 3, MEANING);

  // The STATIC half of the same question, and the half that works at both presets: does the chain
  // change the image at all? Same camera, one frame each, chain on and off.
  await evalJSON(S, 'window.__game.setSignMips(true)');
  await settle(S, 6);
  const sa1 = (await evalP(S, 'window.__game.probe({ grid: [40, 30] })')).grid.cells.map(c => c.lum);
  await evalJSON(S, 'window.__game.setSignMips(false)');
  await settle(S, 6);
  const sa2 = (await evalP(S, 'window.__game.probe({ grid: [40, 30] })')).grid.cells.map(c => c.lum);
  let statMean = 0, statMax = 0;
  for (let i = 0; i < sa1.length; i++) { const v = Math.abs(sa1[i] - sa2[i]); statMean += v; if (v > statMax) statMax = v; }
  statMean /= sa1.length;
  await evalJSON(S, 'window.__game.setSignMips(true)');
  await evalJSON(S, 'window.__game.freezeTime(false)');
  check('§3.5.4 — the sign sheet is mipmapped and the chain measurably kills the crawl',
    statMax > 0.005 && (!resolvable || delta > 0),
    `STATIC A/B, same camera, chain on vs off (40x30 grid): mean |diff| ${statMean.toFixed(6)}, `
    + `worst cell ${statMax.toFixed(4)} against a 0.005 floor. The chain is demonstrably doing work.\n      `
    + `TEMPORAL crawl: mean per-cell luminance change between consecutive frames of a 12-step, `
    + `1.5 m dolly across the Lantern Quarter at 60 m, signage layer isolated —\n      `
    + `mips on   ${withMips.toFixed(6)}   (repeat ${withMips2.toFixed(6)} — scatter ${floor.toFixed(6)}, `
    + `visibility floor ${MEANING})\n      `
    + `mips off  ${noMips.toFixed(6)}   (${(noMips / Math.max(1e-9, withMips)).toFixed(2)}x, delta ${delta.toFixed(6)})\n      `
    + (resolvable
      ? `      The delta clears both floors, so it is real and it is gated: switching the chain off `
        + `crawls ${(noMips / Math.max(1e-9, withMips)).toFixed(2)}x more.`
      : `      The delta is inside this gate's own noise floor, so the temporal half is NOT resolvable `
        + `here and is not gated —\n      `
        + `the static A/B is. That is expected at LOW: ringNear is 1, the whole sign field sits inside `
        + `256 m and is barely\n      minified, so the chain has little to do. A property of the preset, `
        + `not a weakened test.`)
    + `\n      evidence: shots/p3a/canyon_mips.png vs canyon_nomips.png`);

  // ── 11. determinism — same seed, same signs ──────────────────────────────
  //
  // Hashed off the GPU buffers, order-independently, because slot indices depend on the order the
  // chunks happened to stream in and "same seed, same signs" is a claim about the SIGNS.
  await goto(S, base, 'debug=1&var=deepnight&nosave&nohud');
  await cam(S, DENSE, 20, -6);
  await drain(S);
  const h1 = await evalJSON(S, 'window.__game.signHash()');

  // fly 3 km away and back: every chunk is evicted, re-generated and re-signed from scratch
  await cam(S, [DENSE[0] + 3000, 200, DENSE[2] + 3000], 20, -6);
  await drain(S);
  await cam(S, DENSE, 20, -6);
  await drain(S);
  const h2 = await evalJSON(S, 'window.__game.signHash()');

  // and a cold second page load
  await goto(S, base, 'debug=1&var=deepnight&nosave&nohud');
  await cam(S, DENSE, 20, -6);
  await drain(S);
  const h3 = await evalJSON(S, 'window.__game.signHash()');

  const same = (a, b) => a.length === b.length && a.every((r, i) => r.hash === b[i].hash && r.n === b[i].n);
  check('signage placement is DETERMINISTIC — same seed, same signs',
    same(h1, h2) && same(h1, h3),
    `${h1.map(r => `${r.field} n=${r.n} ${r.hash}`).join('\n      ')}\n      `
    + `after a 3 km round trip that evicted and re-generated every chunk: `
    + `${same(h1, h2) ? 'IDENTICAL' : 'DIFFERS — ' + h2.map(r => r.field + ' ' + r.hash).join(', ')}\n      `
    + `after a cold page reload: ${same(h1, h3) ? 'IDENTICAL' : 'DIFFERS — ' + h3.map(r => r.field + ' ' + r.hash).join(', ')}`);

  // ── 12. the visual record ────────────────────────────────────────────────
  const views = [
    ['street', [1330, 12, 300], 10, 8, 70],
    ['midrise', [1350, 120, 420], 8, -6, 62],
    ['above', [1300, 430, 620], 12, -30, 62],
    ['canyon', [1345, 40, 500], 4, 2, 70],
  ];
  for (const [n, p, y, pi, f] of views) {
    await cam(S, p, y, pi, f);
    await drain(S);
    await settle(S, 10);
    await shoot(S, LOW ? n + '_low' : n);
  }
  // a close-up of one real board, so "no sign is upside down" is something a human can see
  const board = meta.find(m => m.layer === 2 && m.kind === 'board_en' && !m.perp);
  if (board) {
    const d = 26;
    await cam(S, [(board.x + board.nx * d).toFixed(1), board.y.toFixed(1), (board.z + board.nz * d).toFixed(1)],
      (Math.atan2(board.nx, board.nz) * 180 / Math.PI).toFixed(1), 0, 40);
    await drain(S);
    await settle(S, 10);
    await shoot(S, LOW ? 'board_closeup_low' : 'board_closeup');
  }
  check('visual record captured', true,
    `shots/p3a/: street, midrise, above, canyon, dense, board_closeup, canyon_mips|nomips`
    + (board ? `\n      close-up is a ${board.kind} at ${board.w.toFixed(1)} x ${board.h.toFixed(1)} m, `
      + `y ${board.y.toFixed(0)} m on a ${board.proto}` : ''));

  await close();

  writeFileSync(resolve(OUT, `_gates${LOW ? '_low' : ''}.json`),
    JSON.stringify({ at: new Date().toISOString(), low: LOW, headed: !!args.headed, results }, null, 2));
  const bad = results.filter(r => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} gates pass  →  shots/p3a/`);
  if (bad.length) process.exit(1);
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
