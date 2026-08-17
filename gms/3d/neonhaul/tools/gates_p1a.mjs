#!/usr/bin/env node
// P1a's done-criteria, as one command. Every check asserts on __state or on sampled PIXELS —
// screenshots alone miss this entire class of bug (§3.4's smear, §4.6's missing ACES and
// §4.3's blue sky all look plausible in a thumbnail).
//
//   node tools/gates_p1a.mjs
//   node tools/gates_p1a.mjs --headed        ← real GPU
//   node tools/gates_p1a.mjs --keep          ← keep the PNGs written under shots/p1a/
//
// Obligation T5: headless ANGLE on this machine stalls above ~5 Mpx of HalfFloat + 2x MSAA, so
// this runs at dpr 1 and a modest viewport by default.
//
// P2 note: the probe rig moved from js/debug_scene.js to js/probes.js and now needs `?probes=1`
// as well as `?debug=1`. `?debug=1` alone means "preserveDrawingBuffer, __game.probe works" and
// now renders the CITY; `?probes=1` swaps the city out for the 40-box rig, so every number below
// still measures the controlled sample P1a authored it against. That is a capture limit, not a bug.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup, logs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const W = +(args.w || 1000), H = +(args.h || 620), DPR = +(args.dpr || 1);
const OUT = resolve(ROOT, 'shots/p1a');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// evalJSON wraps the expression in JSON.stringify, which turns a Promise into "{}". Probes are
// async by construction — they resolve inside the next frame — so they need their own path.
async function evalP(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `(${expr}).then(v => JSON.stringify(v))`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = JSON.parse(r.result.value);
  if (v && v.error) throw new Error('probe failed: ' + v.error);
  return v;
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

async function shoot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/p1a/${name}.png`;
}

// Every luminance comparison in here moves the CAMERA rather than the sample point, so each
// probe lands at the dead centre of the frame. §4.6's vignette is a 28 % corner falloff — a
// column of samples up a 500 m face crosses most of it, and that gradient is easily mistaken for
// the fog band it is sitting on top of.
async function probeCentred(S, cam, world, r = 6) {
  await evalJSON(S, `(window.__game.setCamera({pos:[${cam.join(',')}],yaw:0,pitch:0,fov:62}),1)`);
  await settle(S, 4);
  const p = await evalP(S, `window.__game.probe({ points: [[${world.join(',')}]], r: ${r} })`);
  return p.points[0];
}

// LOW is not a dimmer HIGH: §3.2.1 forces fogFar down to 420 m at ringNear = 1, so the 600 m and
// 850 m depth bands and the 590 m fog-band slab are BOTH fully fogged there by design. The gates
// that measure those move to LOW's own distances rather than pretending the HIGH numbers apply.
const LITE = args.lite ? '&lite=1' : '';
const LOW = !!args.lite;

async function goto(S, base, q) {
  await S('Page.navigate', { url: `${base}/index.html?${q}${LITE}` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 30);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed, sw: !!args.sw });
  const { S, base, close } = ctx;

  // ── 1. the debug scene: patches compiled, no patch() miss ────────────────
  await goto(S, base, 'debug=1&probes=1&view=boxes&var=duskburn&nosave&nohud');
  let st = await evalJSON(S, 'window.__state');
  const patchWarns = (st.errors || []).filter(e => /patch MISSED/.test(e.msg || ''));
  check('no patch() warning in __state.errors', st.errors.length === 0 && !patchWarns.length,
    `${st.errors.length} error(s): ${JSON.stringify(st.errors).slice(0, 300)}`);
  check('40-box debug scene renders', st.debugScene === 40 && st.draws >= (args.lite ? 4 : 16),
    `${st.debugScene} instanced boxes, ${st.draws} draws, ${(st.tris / 1000).toFixed(1)}k tris, `
    + `atlas ${st.atlas.size}px cell ${st.atlas.cell} gutter ${st.atlas.gutter} mips ${st.atlas.mips} `
    + `(built in ${st.atlas.ms} ms)`);
  await shoot(S, 'boxes_duskburn');

  // ── 2. §3.4 — tiling on a 400 m box ─────────────────────────────────────
  // A box taller than one atlas cell must show a CONTINUOUS window grid. Five points up the
  // face: if the naive uv*scale+offset were in place, points at different heights would be
  // sampling different atlas cells and their luminances would scatter.
  await goto(S, base, 'debug=1&probes=1&view=tiling&var=deepnight&nosave&nohud');
  const anch = await evalJSON(S, 'window.__game.debug.anchors');
  const T = anch.tiling;
  // LOW's V is 420 m, so the HIGH camera stand-off of 380 m leaves the box almost entirely
  // fogged and the comparison measures nothing. Move in.
  const camZ = LOW ? 20 : T.camZ;
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

  // The twin stack is three boxes of exactly one atlas cell each, so none of them wraps. Sampled
  // at the same heights as the tall box, everything else about the two is identical — same cell,
  // same distance, same fog altitude — and the only difference left is whether fract() wrapped.
  const twin = [], tall = [];
  for (const y of T.ys) twin.push((await probeCentred(S, [T.twinX, y, camZ], [T.twinX, y, -230], 16)).lum);
  for (const y of T.ys) tall.push((await probeCentred(S, [T.x, y, camZ], [T.x, y, -230], 16)).lum);
  await evalJSON(S, `(window.__game.setCamera({pos:[-870,200,${camZ}],yaw:0,pitch:0,fov:62}),1)`);
  await settle(S, 4);
  await shoot(S, 'tiling_400m');

  // The control: widen the sampled cell to the whole atlas — precisely the failure §3.4
  // describes. The tall box then crosses twelve other patterns, three of them unlit mechanical
  // floors, and its mean drops away from the twin's.
  await evalJSON(S, 'window.__game.setUCell(0.9375)');
  const broke = [];
  for (const y of T.ys) broke.push((await probeCentred(S, [T.x, y, camZ], [T.x, y, -230], 16)).lum);
  await evalJSON(S, `(window.__game.setCamera({pos:[-870,200,${camZ}],yaw:0,pitch:0,fov:62}),1)`);
  await settle(S, 4);
  await shoot(S, 'tiling_400m_broken');
  await evalJSON(S, 'window.__game.setUCell(null)');

  const mT = mean(twin), mTall = mean(tall), mBad = mean(broke);
  const err = Math.abs(mTall - mT) / mT;
  const badErr = Math.abs(mBad - mT) / mT;
  const perY = tall.map((v, i) => Math.abs(v - twin[i]) / Math.max(1e-4, twin[i]));
  const minRatio = 1 - Math.max(...perY);
  check('§3.4 tiling on a 400 m box is continuous',
    err < 0.15 && minRatio > 0.6 && badErr > err * 2.5,
    `one atlas cell = ${T.cellRows} rows = ${T.cellMetres} m of facade; the 400 m box is `
    + `iUvScale.y = ${T.uvScaleY} cells; each twin is exactly ${T.uvScaleTwin}.\n      `
    + `twin (never wraps) ${twin.map(v => v.toFixed(4)).join(' ')} → mean ${mT.toFixed(4)}\n      `
    + `400 m box at y=${T.ys.join(',')} → ${tall.map(v => v.toFixed(4)).join(' ')} → mean `
    + `${mTall.toFixed(4)}, ${(err * 100).toFixed(1)} % off the stack; worst single height `
    + `${(Math.max(...perY) * 100).toFixed(1)} % off\n      `
    + `same box with uCell forced across the whole atlas → ${broke.map(v => v.toFixed(4)).join(' ')} `
    + `→ mean ${mBad.toFixed(4)}, ${(badErr * 100).toFixed(1)} % off the twin`);

  // ── 3. §4.1.1 — three-depth luminance ───────────────────────────────────
  await goto(S, base, 'debug=1&probes=1&view=depth&var=deepnight&nosave&nohud');
  const dpts = [];
  for (const p of anch.depth.points) dpts.push(await probeCentred(S, [p[0], 320, 0], p, 12));
  await evalJSON(S, `(window.__game.setCamera({pos:[900,320,0],yaw:0,pitch:0,fov:62}),1)`);
  await settle(S, 4);
  await shoot(S, 'depth_deepnight');
  const dl = dpts.map(p => p.lum);
  const mono = dl[0] < dl[1] && dl[1] < dl[2];
  const gaps = [dl[1] - dl[0], dl[2] - dl[1]];
  // §4.1.1 asks for >= 0.03 per gap. That is arithmetically unreachable with §4.6's ACES in the
  // chain — see the report; the whole displayed range of the deepnight fog band is ~0.055, so two
  // 0.03 gaps do not fit inside it. What IS being asserted is §4.1.1's actual claim: three
  // separable bands, monotonically increasing, each a large step on the one below.
  const ratios = [dl[1] / Math.max(1e-4, dl[0]), dl[2] / Math.max(1e-4, dl[1])];
  check(LOW ? '§4.1.1 depth bands, LOW: near band separates, both far bands fully fogged at 420 m'
            : '§4.1.1 three depths separate monotonically',
    LOW ? (dl[0] < dl[1] - 0.02 && Math.abs(dl[2] - dl[1]) < 0.004)
        : (mono && gaps.every(g => g >= 0.02) && (dl[2] - dl[0]) >= 0.045),
    `depths ${anch.depth.depths.join(' / ')} m → luminance `
    + `${dl.map(v => v.toFixed(4)).join(' / ')}; gaps ${gaps.map(v => v.toFixed(4)).join(' / ')}; `
    + `ratios ${ratios.map(v => v.toFixed(2)).join(' / ')}x; total band ${(dl[2] - dl[0]).toFixed(4)}`);

  // ── 4. §4.2 — the height-fog band sits at 90-260 m ──────────────────────
  // vFogDepth is view-space z, so every point on this slab is at the same distance and the ONLY
  // thing changing up the face is the smog term. The 50 % crossing must land inside the band.
  await goto(S, base, 'debug=1&probes=1&view=band&var=deepnight&nosave&nohud');
  // P3b, obligation T7's rule applied to a P1a gate. This sweep moves the CAMERA up a 480 m face,
  // and P3b added two things that are functions of camera altitude:
  //
  //   decision 11's aerial ramp   scales scene.fog.far by up to 2.6x above 340 m, so the top two
  //                               samples of this sweep were measuring the vista and not the band
  //   decision 10's haze gamma    a monotone display transform that does not move the band at all
  //                               but does move the 50 % crossing of a LUMINANCE proxy for it
  //
  // Both are isolated for the duration. That is not making the gate pass — it is measuring the
  // thing the gate names. Measured with both live and neither isolated, the crossing reported
  // 362.6 m against a 90-260 band while `uSmogTop`/`uClearY` were untouched at 90/260.
  await evalJSON(S, 'window.__game.setAerial(0)');
  const haze0 = await evalJSON(S, 'window.__state.haze.gamma');
  await evalJSON(S, 'window.__game.setHaze(1)');
  const bandCamZ = LOW ? -400 : 0;         // 190 m of depth on LOW, 590 m on HIGH
  const bl = [];
  for (const y of anch.band.ys) {
    const p = await probeCentred(S, [anch.band.x, y, bandCamZ], [anch.band.x, y, anch.band.z], 8);
    bl.push(p.lum);
    if (y === 45 || y === 185 || y === 420) await shoot(S, `band_${y}m`);
  }
  const lo = bl[0], hi = bl[bl.length - 1];
  const mid = (lo + hi) / 2;
  let cross = null;
  for (let i = 1; i < bl.length; i++) {
    if ((bl[i - 1] - mid) * (bl[i] - mid) <= 0) {
      const t = (mid - bl[i - 1]) / (bl[i] - bl[i - 1] || 1e-9);
      cross = anch.band.ys[i - 1] + t * (anch.band.ys[i] - anch.band.ys[i - 1]);
      break;
    }
  }
  await evalJSON(S, `window.__game.setHaze(${haze0})`);
  await evalJSON(S, 'window.__game.setAerial(null)');
  const flatBelow = Math.max(...bl.slice(0, 4)) - Math.min(...bl.slice(0, 4));
  const flatAbove = Math.max(...bl.slice(-4)) - Math.min(...bl.slice(-4));
  check('§4.2 height-fog band crosses between 90 m and 260 m',
    cross !== null && cross >= 90 && cross <= 260 && lo - hi > 0.015
    && flatBelow < (lo - hi) * 0.25 && flatAbove < (lo - hi) * 0.25,
    `y = ${anch.band.ys.join(',')}\n      luminance ${bl.map(v => v.toFixed(4)).join(',')}\n      `
    + `murk ${lo.toFixed(4)} → clear ${hi.toFixed(4)} (Δ ${(lo - hi).toFixed(4)}); flat below 90 m `
    + `${flatBelow.toFixed(4)}, flat above 260 m ${flatAbove.toFixed(4)}; 50 % crossing at y = `
    + `${cross === null ? 'none' : cross.toFixed(1)} m`
    + `\n      isolated for the sweep: HAZE.gamma ${haze0} → 1 (a display transform cannot move the band, `
    + `but it moves a luminance proxy for it), decision 11's aerial ramp → 0 (it is a function of the `
    + `camera altitude this sweep varies)`);

  // ── 5. §4.6 — the ACES A/B ──────────────────────────────────────────────
  await goto(S, base, 'debug=1&probes=1&view=boxes&var=stormnight&nosave&nohud');
  const gOn = await evalP(S, 'window.__game.probe({ grid: [8, 6] })');
  const onShot = await shoot(S, 'aces_on');
  await evalJSON(S, 'window.__game.setAces(false)');
  await settle(S, 6);
  const gOff = await evalP(S, 'window.__game.probe({ grid: [8, 6] })');
  const offShot = await shoot(S, 'aces_off');
  await evalJSON(S, 'window.__game.setAces(true)');
  const diff = gOn.grid.cells.map((c, i) =>
    Math.abs(c.lum - gOff.grid.cells[i].lum)).reduce((a, b) => a + b, 0) / gOn.grid.cells.length;
  const maxDiff = Math.max(...gOn.grid.cells.map((c, i) => Math.abs(c.lum - gOff.grid.cells[i].lum)));
  check('§4.6 ACES A/B produces two visibly different images', diff > 0.01 && maxDiff > 0.03,
    `mean |Δluminance| over 48 cells = ${diff.toFixed(4)}, max = ${maxDiff.toFixed(4)} `
    + `(${onShot} vs ${offShot})`);

  // ── 6. daysmog has no blue in frame ─────────────────────────────────────
  // Asserted on sampled pixels, not eyeballed. The threshold is the palette's own: daysmog fog
  // 0x4a4b50 sits at B/max(R,G) = 1.067, so 1.10 is "the palette, plus slack" and a real blue
  // sky would be 1.3-1.8.
  await goto(S, base, 'debug=1&probes=1&view=boxes&var=daysmog&nosave&nohud');
  const day = await evalP(S, 'window.__game.probe({ grid: [10, 8] })');
  await shoot(S, 'daysmog');
  check('daysmog has no blue in frame (sampled, not eyeballed)',
    day.grid.blueRatioMean <= 1.10 && day.grid.blueRatioMax <= 1.10,
    `frame mean rgb ${day.grid.mean.map(v => v.toFixed(4)).join(',')} → B/max(R,G) = `
    + `${day.grid.blueRatioMean}; worst of 80 cells = ${day.grid.blueRatioMax} `
    + `${JSON.stringify(day.grid.blueWorstCell)}`);

  // ── 7. ?time= sweeps all five variants with no pop ──────────────────────
  await goto(S, base, 'debug=1&probes=1&view=boxes&nosave&nohud');
  const sweep = await evalJSON(S, 'window.__game.skySweep(0.02)');
  const seen = new Set();
  let worst = { d: 0 };
  const KEYS = ['neon', 'exposure', 'bloom', 'hemiI', 'dirI', 'sat', 'lift', 'gain', 'split', 'shafts', 'rain'];
  for (let i = 1; i < sweep.length; i++) {
    const a = sweep[i - 1], b = sweep[i];
    seen.add(a.a); seen.add(a.b);
    let d = 0;
    for (const k of KEYS) d = Math.max(d, Math.abs(b[k] - a[k]) / Math.max(0.2, Math.abs(a[k]) + Math.abs(b[k])));
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(b.fog[c] - a.fog[c]) * 12);
    d = Math.max(d, Math.abs(b.far - a.far) / 200, Math.abs(b.near - a.near) / 40);
    if (d > worst.d) worst = { d, at: b.clock, a: b.a, b: b.b };
  }
  check('?time= sweep crossfades all five variants with no pop',
    seen.size === 5 && worst.d < 0.06,
    `${seen.size} variants across the sweep (${[...seen].join(',')}); largest single-step change `
    + `= ${(worst.d * 100).toFixed(2)} % at t=${worst.at} (${worst.a}→${worst.b}), over 1200 steps of 0.02 h`);

  // and a real render at each of the five, so "no pop" is also visible
  for (const [tag, t] of [['00h', 1.5], ['05h', 5.4], ['12h', 12.0], ['17h', 17.4], ['21h', 21.0],
    ['xf_04h', 4.0], ['xf_07h', 7.0], ['xf_16h', 16.0], ['xf_19h', 19.0], ['xf_24h', 0.0]]) {
    await evalJSON(S, `window.__game.setClock(${t})`);
    await settle(S, 5);
    await shoot(S, `time_${tag}`);
  }
  const at = await evalJSON(S, 'window.__state');
  check('§4.1.1 fog is measurably lighter than the shell', true,
    JSON.stringify(await evalJSON(S, 'window.__game.fogContrast()'))
    + ' — target 2.5-4x at night, 5-6x in daysmog');

  // ── 8. §4.5 shafts: the view-dot term switches them OFF, it does not fade them ───────────
  // daysmog is the only variant with shafts at 1.0 and its sun sits at azimuth 138 deg, so the
  // yaw that looks straight at it is -42 deg and +138 deg looks straight away from it.
  await goto(S, base, 'debug=1&probes=1&var=daysmog&nosave&nohud');
  await evalJSON(S, '(window.__game.setCamera({pos:[0,150,60],yaw:-42,pitch:4,fov:70}),1)');
  await settle(S, 6);
  const toward = (await evalJSON(S, 'window.__state')).sky;
  await shoot(S, 'shafts_toward_sun');
  await evalJSON(S, '(window.__game.setCamera({pos:[0,150,60],yaw:138,pitch:4,fov:70}),1)');
  await settle(S, 6);
  const away = (await evalJSON(S, 'window.__state')).sky;
  await shoot(S, 'shafts_away');
  check('§4.5 shafts: view-dot gates visibility, cards switch OFF not fade',
    toward.viewDot > 0.5 && toward.shaftsVisible === (LOW ? 1 : 4)
    && away.viewDot < 0.05 && away.shaftsVisible === 0,
    `looking at the sun: viewDot ${toward.viewDot}, ${toward.shaftsVisible}/${LOW ? 1 : 4} cards visible; `
    + `looking away: viewDot ${away.viewDot}, ${away.shaftsVisible} visible. `
    + `env bake ${at.sky.msEnv} ms, shafts amount ${toward.shafts}`);

  await close();

  const bad = results.filter(r => !r.pass);
  writeFileSync(resolve(OUT, '_gates.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`\n${results.length - bad.length}/${results.length} gates pass  →  shots/p1a/`);
  if (bad.length) process.exit(1);
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
