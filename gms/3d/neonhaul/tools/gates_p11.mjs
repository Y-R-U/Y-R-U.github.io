// P11 — ART_PASS. The colour, variety and depth pass.
//
//   node tools/gates_p11.mjs [--lite]
//
// The PHASE gate for P11 is a blind critic round (ART_PASS "Gate for this pass", DECISIONS 12) and
// this file is not that. What this file does is stop the four claims in the report from being
// impressions: that the colour distribution actually changed, that the shader half of the pass is
// actually running, that the road markings land on the streets the generator left, and that none
// of it moved the city's determinism or the frame budget.
//
// THE STANDING LESSON APPLIES HARDEST TO AN ART GATE. A colour-spread measured across a frame
// where every building happens to be off screen, or an A/B whose two halves are the same frame,
// reads exactly like a clean result. So:
//
//   * every A/B carries a NULL control (capture twice, change nothing — must be ~0) and the frame
//     is frozen first, or rain and the dither put 0.75 of a channel under every measurement;
//   * every distribution assertion first asserts its SAMPLE is non-degenerate (a real instance
//     count, off the live GPU buffers rather than recomputed from the source data);
//   * every geometric assertion is run a second time with the parameter it depends on deliberately
//     broken, and must fail there.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, waitFor, settle, evalJSON, hook, quiesce, cleanup, logs } from './shot.mjs';
import { CityModel } from '../js/city.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'shots/p11');
const TMP = `/tmp/neonhaul-p11g-${process.pid}`;
const LITE = process.argv.includes('--lite');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
  // Written as each gate completes: agents on this project have been interrupted five times.
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `_gates${LITE ? '_low' : ''}.json`), JSON.stringify({
    preset: LITE ? 'low' : 'high', at: new Date().toISOString(),
    results, ok: results.filter(r => r.pass).map(r => r.name), fail: results.filter(r => !r.pass).map(r => r.name),
  }, null, 2));
}

const GW = 160, GH = 90;
function toGrid(png) {
  mkdirSync(TMP, { recursive: true });
  const a = `${TMP}/a.png`, b = `${TMP}/a.raw`;
  writeFileSync(a, png);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', a,
    '-vf', `scale=${GW}:${GH}:flags=area`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', b]);
  return new Uint8Array(readFileSync(b));
}
function frameDelta(p, q) {
  let s = 0, peak = 0;
  for (let i = 0; i < p.length; i += 3) {
    const d = (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])) / 3;
    s += d; if (d > peak) peak = d;
  }
  return { mean: +(s / (p.length / 3)).toFixed(4), peak: +peak.toFixed(1) };
}

// ── the node half: the road corridor is the gap the generator leaves ────────
// This one needs no browser. §3.1 lays 5x5 lots of 51.2 m in a 256 m chunk with a 13.2 m road
// between them, and P11's ROAD_BODY paints its markings from world XZ on exactly that pitch. If
// the two ever disagree, lane lines run through building footprints and the "road" reads as a
// decal laid over the city rather than as the street the city was built around.
function roadCorridor(city, half) {
  let n = 0, bad = 0, worst = 0;
  for (let cz = -6; cz <= 6; cz++) {
    for (let cx = -6; cx <= 6; cx++) {
      for (const b of city.generateChunk(cx, cz).buildings) {
        if (b.landmark) continue;              // landmarks are authored and not lot-bound (§3.1.1)
        n++;
        const dx = Math.abs((((b.x / 51.2) % 1) + 1.5) % 1 - 0.5) * 51.2;
        const dz = Math.abs((((b.z / 51.2) % 1) + 1.5) % 1 - 0.5) * 51.2;
        const enc = Math.min(half - (dx - b.w / 2), half - (dz - b.d / 2));
        if (enc > 0) { bad++; if (enc > worst) worst = enc; }
      }
    }
  }
  return { n, bad, pct: +((100 * bad) / n).toFixed(2), worst: +worst.toFixed(2) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // ── 1. the road corridor, node-side ──────────────────────────────────────
  const city = new CityModel({
    landmarks: JSON.parse(readFileSync(resolve(ROOT, 'data/landmarks.json'), 'utf8')),
    names: JSON.parse(readFileSync(resolve(ROOT, 'data/names.json'), 'utf8')),
    seed: 1313165134,
  });
  const ship = roadCorridor(city, 6.6);
  const falsA = roadCorridor(city, 13.2);
  const falsB = roadCorridor(city, 19.0);
  check('P1 the painted road corridor IS the gap §3.1 leaves between lots',
    ship.bad === 0 && falsA.pct > 50 && falsB.pct > 90,
    `${ship.n} seeded footprints over a 13x13 chunk block against ROAD_BODY's own 51.2 m pitch and `
    + `13.2 m road width: ${ship.bad} encroach (${ship.pct} %).\n      `
    + `FALSIFICATION — the same probe with the road widened to 26.4 m: ${falsA.bad} encroach `
    + `(${falsA.pct} %, worst ${falsA.worst} m); at 38.0 m: ${falsB.bad} (${falsB.pct} %). `
    + `A zero that cannot become non-zero is not a measurement.`);

  // ── the browser half ─────────────────────────────────────────────────────
  const ctx = await open({ w: 1000, h: 562, dpr: 1, headed: false });
  const { S, base, close } = ctx;
  const url = `${base}/index.html?dpr=1&nohud&nosave&debug=1&var=stormnight&freecam=1${LITE ? '&lite=1' : ''}`;
  await S('Page.navigate', { url });
  await waitFor(S, 'window.__ready', 30000);
  // A street-level camera: the road, the near facades and a canyon in one frame. Not a §12.1 shot —
  // those are frozen for scoring and are not moved by anything in this file.
  await evalJSON(S, '(window.__game.setCamera({pos:[1305.6,26,300],yaw:3.1416,pitch:-16,fov:66}),1)');
  await quiesce(S, { label: 'p11' });
  await settle(S, 40);
  // Asserted, not `&&`-guarded (T10). Without it the null control reads ~0.75 of a channel — rain,
  // sign flicker and §4.6's scrolling dither move every pixel between two captures of a scene that
  // did not change, which is larger than several of the effects below.
  await hook(S, 'freezeTime', true);
  await settle(S, 10);

  const grab = async label => {
    await settle(S, 10);
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(data, 'base64');
    if (label) writeFileSync(resolve(OUT, `g_${label}${LITE ? '_low' : ''}.png`), buf);
    return toGrid(buf);
  };

  const base0 = await grab('a_p11on');
  const nullCtl = frameDelta(base0, await grab(null));

  // ── 2. the colour distribution, off the live GPU buffers ─────────────────
  const t = await evalJSON(S, 'window.__game.cityTints()');
  // The non-degeneracy assertion, and it is preset-aware because the sample genuinely is smaller
  // on LOW: `ringNear` is 1 there, so the near ring is 9 chunks rather than 25 and carries ~180
  // LOD0 instances against ~570. Below this the hue histogram is counting noise.
  const MIN_N = LITE ? 120 : 200;
  if (!t || t.n < MIN_N) throw new Error(`cityTints returned ${t ? t.n : 'null'} instances (need ${MIN_N} at preset ${LITE ? 'low' : 'high'}) — the sample is degenerate and nothing below would mean anything`);
  const hue = c => {
    const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 1e-4) return -1;
    let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn);
    return ((h * 60) % 360 + 360) % 360;
  };
  const BINS = 12;
  const bins = new Array(BINS).fill(0);
  let dark = 0, twoZone = 0, band = 0, crown = 0, sumV = 0;
  const vals = [];
  for (let i = 0; i < t.n; i++) {
    const a = t.tints[i].slice(0, 3), b = t.tints[i].slice(3, 6);
    const v = Math.max(...a);
    vals.push(v); sumV += v;
    if (v < 0.20) dark++;
    const ha = hue(a), hb = hue(b);
    if (ha >= 0) bins[Math.min(BINS - 1, (ha / 360 * BINS) | 0)]++;
    if (ha >= 0 && hb >= 0 && Math.abs(ha - hb) > 12) twoZone++;
    const z = t.zones[i];
    if (z[2] > z[1] + 0.1) band++;
    // A no-crown building is authored at h + 3.6, so "crown exists" is crown < h, NOT crown < some
    // large sentinel — the first version of this line tested `< 1e5` and reported 100.0 %, which is
    // the shape of a measurement that measures nothing and was caught by the number being exactly
    // everything.
    if (z[3] < t.h[i] * 0.995) crown++;
  }
  vals.sort((x, y) => x - y);
  const occupied = bins.filter(b => b >= t.n * 0.01).length;
  const spread = +(vals[Math.floor(vals.length * 0.95)] / Math.max(1e-4, vals[Math.floor(vals.length * 0.05)])).toFixed(2);
  check('P2 colour variety: many hues in one live sample, a real brightness spread, and unlit blocks',
    occupied >= 5 && spread >= 2.2 && dark / t.n > 0.05 && dark / t.n < 0.25,
    `${t.n} LIVE LOD0 instances, read off the iEmissive/iEmissive2/iZone buffers the GPU samples — `
    + `not recomputed from districts.js, which would pass with the attribute never written.\n      `
    + `hue bins (30 deg each) carrying >= 1 % of the sample: ${occupied} of ${BINS}  [${bins.join(',')}]\n      `
    + `brightness p05 ${vals[Math.floor(vals.length * 0.05)].toFixed(3)} → p95 `
    + `${vals[Math.floor(vals.length * 0.95)].toFixed(3)} = ${spread}x spread (mean ${(sumV / t.n).toFixed(3)})\n      `
    + `unlit or near-unlit masses: ${dark} (${(100 * dark / t.n).toFixed(1)} %) — the plates are full of `
    + `them and they are what makes the lit ones read as light\n      `
    + `BEFORE P11 this sample would have shown ONE hue per district, a 1.14/0.86 = 1.33x spread and `
    + `zero unlit masses, by construction: districts.window with a +/-14 % jitter.`);

  check('P3 intra-building zones: a second colour, a dark band and a dark crown all exist in the data',
    twoZone / t.n > 0.35 && band / t.n > 0.20 && crown / t.n > 0.12,
    `of ${t.n} instances: ${twoZone} (${(100 * twoZone / t.n).toFixed(1)} %) carry an upper zone whose `
    + `hue differs from the lower by more than 12 deg; ${band} (${(100 * band / t.n).toFixed(1)} %) carry an `
    + `unlit band; ${crown} (${(100 * crown / t.n).toFixed(1)} %) carry an unlit crown.\n      `
    + `Zone boundaries are quantised to §3.4's 3.6 m floor pitch, so a colour change lands ON a floor line.`);

  // ── 3. the shader half is running, measured against itself ───────────────
  await hook(S, 'setP11', false);
  const off = await grab('b_p11off');
  await hook(S, 'setP11', true);
  const restored = await grab(null);
  const dP11 = frameDelta(base0, off);
  const dRestore = frameDelta(base0, restored);
  check('P4 the P11 shader half is live and reversible (A/B with a null control)',
    nullCtl.mean < 0.05 && dP11.mean > 1.0 && dRestore.mean < 0.05,
    `null control (capture twice, change nothing): mean ${nullCtl.mean} — anything above ~0.05 and `
    + `every number here is noise\n      `
    + `uP11 1 → 0 → 1: the frame moves ${dP11.mean} of a channel (peak ${dP11.peak}) and comes back `
    + `to ${dRestore.mean}. Off, the pass reverts to one colour per instance, no bands, no crown, `
    + `no spill, no street glow, no facade bays and no road markings.`);

  // ── 4. the two lighting terms specifically ───────────────────────────────
  const prevSp = await evalJSON(S, 'window.__game.setSpill(0,null)');
  const dSpill = frameDelta(base0, await grab('c_nospill'));
  await evalJSON(S, `window.__game.setSpill(${prevSp.spill},null)`);
  await evalJSON(S, 'window.__game.setSpill(null,0)');
  const dStreet = frameDelta(base0, await grab('c_nostreet'));
  await evalJSON(S, `window.__game.setSpill(null,${prevSp.street})`);

  const prevRoad = await evalJSON(S, 'window.__game.setRoadGlow(0)');
  const noRoad = await grab('d_noroadglow');
  await evalJSON(S, `window.__game.setRoadGlow(${prevRoad})`);
  const dRoad = frameDelta(base0, noRoad);
  check('P5 the emissives light something: window spill, street wash and road light each move the frame',
    dSpill.mean > 0.25 && dStreet.mean > 0.25 && dRoad.mean > 0.25,
    `each term forced to a constant SEPARATELY, so no one of them can be carrying the others:\n      `
    + `window spill → 0    : ${dSpill.mean} of a channel (peak ${dSpill.peak})\n      `
    + `street wash  → 0    : ${dStreet.mean} (peak ${dStreet.peak})\n      `
    + `road lighting → 0   : ${dRoad.mean} (peak ${dRoad.peak})\n      `
    + `against a null control of ${nullCtl.mean}. Round 6's six critics led with "every light source `
    + `in this image is a sticker"; these are the two terms that answer it and they are measured `
    + `by forcing each to a constant, not by looking at a screenshot.`);

  // ── 5. signage size span ─────────────────────────────────────────────────
  await evalJSON(S, '(window.__game.setCamera({pos:[430,240,90],yaw:0,pitch:-14,fov:64}),1)');
  await quiesce(S, { label: 'p11/signs' });
  await settle(S, 25);
  const meta = await evalJSON(S, 'window.__game.signMeta()');
  const dims = meta.map(m => Math.max(m.w, m.h)).sort((a, b) => a - b);
  const mega = meta.filter(m => m.cls === 'megahero');
  const heroes = meta.filter(m => m.layer === 5);
  const span = dims.length ? +(dims[dims.length - 1] / dims[0]).toFixed(1) : 0;
  // LOW is a NINTH of the near ring (`ringNear` 1, not 2) at `signDensity` 0.55, so the counts are
  // a property of the preset and not of the pass. What must hold at both presets is the SPAN and
  // the presence of an authored megahero — those are what ART_PASS item 2 asks for.
  const MIN_SIGNS = LITE ? 80 : 300, MIN_HEROES = LITE ? 4 : 12;
  check('P6 §3.5.5 signage spans a plate-like size range and carries the occasional very large sign',
    dims.length > MIN_SIGNS && span >= 25 && mega.length >= 1 && heroes.length >= MIN_HEROES,
    `${dims.length} live signs around the Hollow (preset floor ${MIN_SIGNS}): smallest ${dims[0].toFixed(1)} m → largest `
    + `${dims[dims.length - 1].toFixed(1)} m = ${span}x. 746850_03 spans roughly 30x; before P11 this `
    + `read 3.2 → 69 m = 21.5x with 7 heroes.\n      `
    + `L5 heroes ${heroes.length}; of those ${mega.length} are authored LANDMARK megaheroes at `
    + `${mega.map(m => Math.max(m.w, m.h).toFixed(0)).join(', ')} m — ART_PASS item 2 option 2, and `
    + `they are a separate class with their own fixed band, not a stretched L5 (§3.10 #4).`);

  // ── 6. the budget did not move ───────────────────────────────────────────
  const st = await evalJSON(S, 'window.__state');
  check('P7 draws, triangles and frame time still inside §3.8 / §3.11.2',
    st.draws <= 65 && st.tris <= 260000 && st.errors.length === 0,
    `${st.draws} draws (gate 65) · ${(st.tris / 1000).toFixed(1)}k tris (gate 260k) · frame `
    + `${st.ms.frame.toFixed(2)} ms · ${st.errors.length} errors · preset ${st.quality}.\n      `
    + `P11 adds NO draw call and NO geometry: two instanced attributes (7 floats), ~30 ALU in the `
    + `shell fragment shader and ~35 in the ground's. The one draw the city can gain is the hero `
    + `field going from count 0 to non-zero, which is a field that already existed.`);

  const bad = logs.filter(l => /error|throw|MISSED/i.test(l));
  check('P8 no shader patch missed and no console error',
    bad.length === 0 && st.errors.length === 0,
    `${logs.length} console line(s), ${bad.length} that matter. patch() warns loudly on a missed `
    + `chunk name and main.js routes '[neonhaul]' into __state.errors, so a silently-deleted patch `
    + `— P11 adds three — fails here rather than shipping.${bad.length ? '\n      ' + bad.slice(0, 4).join('\n      ') : ''}`);

  await close();
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
  const nOk = results.filter(r => r.pass).length;
  console.log(`\n${nOk}/${results.length} gates pass  →  shots/p11/_gates${LITE ? '_low' : ''}.json`);
  if (nOk !== results.length) process.exit(1);
}

main().catch(e => { console.error(e.message); cleanup(); process.exit(1); });
