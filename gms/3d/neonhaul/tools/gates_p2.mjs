#!/usr/bin/env node
// P2's done-criteria, as one command. Everything here asserts on `__state`, on the live instance
// buffers, or on SAMPLED PIXELS — a screenshot cannot tell you whether a cross-fade is hiding a
// LOD swap or whether two fields agree about a window pitch.
//
//   node tools/gates_p2.mjs
//   node tools/gates_p2.mjs --lite            ← the LOW preset
//   node tools/gates_p2.mjs --headed          ← real GPU
//
// Obligation T5: headless ANGLE on this machine stalls above ~5 Mpx of HalfFloat + 2x MSAA, so
// this runs at dpr 1 and a modest viewport by default.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce, cityStreamSig,
  cleanup, logs } from './shot.mjs';
import { GATES } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const W = +(args.w || 1000), H = +(args.h || 620), DPR = +(args.dpr || 1);
const LITE = args.lite ? '&lite=1' : '';
const LOW = !!args.lite;
const OUT = resolve(ROOT, 'shots/p2');

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

async function shoot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/p2/${name}.png`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed, sw: !!args.sw });
  const { S, base, close } = ctx;

  // ── 1. it boots into a city, with no patch miss and no error ─────────────
  await goto(S, base, 'debug=1&var=deepnight&nosave&nohud');
  let st = await evalJSON(S, 'window.__state');
  const patchWarns = (st.errors || []).filter(e => /patch MISSED/.test(e.msg || ''));
  check('no patch() warning and no error in __state.errors',
    st.errors.length === 0 && !patchWarns.length,
    `${st.errors.length} error(s): ${JSON.stringify(st.errors).slice(0, 400)}`);

  const prewarm = await evalJSON(S, 'window.__game.msPrewarm()');
  check('the 5x5 near ring is pre-warmed at boot (§3.2.3)',
    st.city.chunks > 0 && st.city.lod0 > 0 && st.city.queued === 0,
    `${st.city.chunks} chunks live (${st.city.near} near), ${st.city.lod0} LOD0 / ${st.city.lod1} LOD1 / `
    + `${st.city.lod2} LOD2 instances, ${st.city.aabbs} collision AABBs, queue ${st.city.queued}; `
    + `boot pre-warm ${prewarm} ms behind the loading bar`);
  await shoot(S, LOW ? 'spawn_low' : 'spawn');

  // ── 2. the draw / triangle budget, by field ──────────────────────────────
  // Measured in the densest place we can stand rather than at the spawn: the spawn sits inside
  // the Spindle's keep-out, which is a plaza by construction and therefore the cheapest frame in
  // the game. A budget measured there is a budget that means nothing.
  const DENSE = [-1500, 210, 640];              // The Ribs, off the authored core
  await evalJSON(S, `(window.__game.setCamera({pos:[${DENSE}],yaw:35,pitch:-8,fov:62}),1)`);
  await settle(S, 60);
  await evalJSON(S, 'window.__game.resetPerf()');
  await settle(S, 30);
  st = await evalJSON(S, 'window.__state');
  const bd = await evalJSON(S, 'window.__game.cityBreakdown()');
  await shoot(S, LOW ? 'dense_low' : 'dense');

  const table = bd.rows.filter(r => r.instances > 0)
    .map(r => `${r.field.padEnd(13)} ${String(r.draws)} draw ${String(r.instances).padStart(5)} inst `
      + `x ${String(r.geoTris).padStart(3)} tri = ${String(r.tris).padStart(7)}  (cap ${r.cap})`).join('\n      ');

  check(`draw and triangle budget at ${LOW ? 'LOW' : 'HIGH'} (§3.8: <= 65 draws, <= 260k tris)`,
    st.draws <= 65 && st.tris <= GATES.tris && bd.overflow === 0,
    `${st.draws} draws, ${(st.tris / 1000).toFixed(1)}k tris in the densest district\n      `
    + `city sub-total ${bd.draws} draws / ${(bd.tris / 1000).toFixed(1)}k tris; `
    + `the rest is the sky dome and the post chain\n      ` + table
    + `\n      field overflow: ${bd.overflow}`);

  // ── 3. §3.10 #1 — the window pitch is 3.6 m x 3.2 m on every face, every LOD ──
  // The Market is 180 x 140 m, so its two wall orientations MUST carry different column scales:
  // one iUvScale for both would give 3.2 m columns on one face and 4.1 m on the other, and the
  // ruler the whole scale read depends on would be wrong by 28 % depending which way you look.
  // The Market is in Lantern Quarter, 1.4 km east of the dense camera, so stand next to it —
  // a field only holds the chunks in the near ring and an unloaded landmark proves nothing.
  await evalJSON(S, `(window.__game.setCamera({pos:[1408, 300, 460],yaw:0,pitch:-14,fov:62}),1)`);
  await settle(S, 60);
  const pitch = await evalJSON(S, `(() => {
    const c = window.__game.city, m = window.__game.cityModel;
    const lm = m.byLandmark.market.parts[0];
    const find = (f) => {
      const mat = f.mesh.instanceMatrix.array;
      for (let i = 0; i < f.n; i++) {
        const w = Math.hypot(mat[i*16], mat[i*16+1], mat[i*16+2]);
        const h = Math.hypot(mat[i*16+4], mat[i*16+5], mat[i*16+6]);
        if (Math.abs(w - lm.w) < 0.5 && Math.abs(h - lm.h) < 0.5) {
          const a = f.attr.iUvScale.array;
          return { field: f.name, slot: i, uv: [a[i*3], a[i*3+1], a[i*3+2]] };
        }
      }
      return null;
    };
    const l0 = c.lod0.map(find).find(Boolean);
    const l1 = find(c.lod1);
    return { want: [lm.w/3.2/32, lm.h/3.6/32, lm.d/3.2/32], l0, l1, w: lm.w, h: lm.h, d: lm.d };
  })()`);
  const close3 = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-4);
  check('§3.10 #1 — 3.6 m rows / 3.2 m columns on both wall axes, identical at LOD0 and LOD1',
    !!pitch.l0 && close3(pitch.want, pitch.l0.uv) && (!pitch.l1 || close3(pitch.want, pitch.l1.uv)),
    `The Market is ${pitch.w} x ${pitch.h} x ${pitch.d} m → iUvScale must be `
    + `[${pitch.want.map(v => v.toFixed(4)).join(', ')}]\n      `
    + `LOD0 ${pitch.l0 ? pitch.l0.field + ' slot ' + pitch.l0.slot + ' → [' + pitch.l0.uv.map(v => v.toFixed(4)).join(', ') + ']' : 'NOT FOUND'}\n      `
    + `LOD1 ${pitch.l1 ? 'slot ' + pitch.l1.slot + ' → [' + pitch.l1.uv.map(v => v.toFixed(4)).join(', ') + ']' : '(not resident at this camera — LOD1 only carries the tallest 40 %)'}\n      `
    + `x and z scales differ by ${(pitch.want[0] / pitch.want[2]).toFixed(3)}x, which is exactly `
    + `the footprint ratio — one vec2 UV scale could not do this`);

  // ── 4. the authored core is in the world ─────────────────────────────────
  const core = await evalJSON(S, `(() => {
    const c = window.__game.city, m = window.__game.cityModel;
    const out = [];
    for (const l of m.landmarks) {
      const rec = m.generateChunk(l.chunk[0], l.chunk[1]);
      const parts = rec.buildings.filter(b => b.landmark === l.id);
      out.push({ id: l.id, name: l.name, district: l.district, x: l.x, z: l.z,
        h: Math.round(l.height), parts: parts.length, protos: parts.map(p => p.proto), radius: l.radius });
    }
    return out;
  })()`);
  check('§3.1.1 — eight landmarks across three named districts, all data, no bespoke meshes',
    core.length === 8 && core.every(l => l.parts === l.protos.length && l.parts > 0)
    && new Set(core.map(l => l.district)).size === 3,
    core.map(l => `${l.id.padEnd(9)} ${l.district.padEnd(8)} ${String(l.h).padStart(3)} m  `
      + `(${l.protos.join('+')})  keep-out ${l.radius} m  at ${Math.round(l.x)},${Math.round(l.z)}`).join('\n      '));

  // ── 5. the spawn is on the deck ──────────────────────────────────────────
  const sp = await evalJSON(S, 'window.__game.spawn()');
  await evalJSON(S, `(window.__game.teleport(${sp.pos[0]}, ${sp.pos[1] + 2}, ${sp.pos[2]}),
    window.__game.setCamera({pos:[${sp.pos[0]},${sp.pos[1] + 2},${sp.pos[2]}],yaw:${-sp.bearing},pitch:-4,fov:62}),1)`);
  // The AABB store is rebuilt at 1.2 ms a frame, so an impatient query finds an EMPTY store and
  // reports "nothing here" for any point in the world. Wait for it, and prove it is populated,
  // or this gate passes by not looking.
  await settle(S, 20);
  for (let i = 0; i < 40 && (await evalJSON(S, 'window.__state')).city.queued > 0; i++) await settle(S, 6);
  await settle(S, 10);
  const stSpawn = await evalJSON(S, 'window.__state');
  const solid = await evalJSON(S, `window.__game.solidAt(${sp.pos[0]}, ${sp.pos[1] + 2}, ${sp.pos[2]}, 0)`);
  const below = await evalJSON(S, `window.__game.solidAt(${sp.pos[0]}, ${sp.pos[1] - 6}, ${sp.pos[2]}, 0)`);
  const nearby = await evalJSON(S, `window.__game.city.aabbsNear(${sp.pos[0]}, ${sp.pos[2]}, 120).length`);
  await shoot(S, LOW ? 'spawn_view_low' : 'spawn_view');
  check('§3.1.1 spawn — on the Spindle deck, not inside geometry',
    stSpawn.city.aabbs > 0 && solid === null && below !== null && below.landmark === 'spindle',
    `spawn ${JSON.stringify(sp.pos)} bearing ${sp.bearing}; ${stSpawn.city.aabbs} AABBs resident, `
    + `${nearby} within 120 m\n      `
    + `at the spawn point: ${solid === null ? 'nothing solid — the player is in open air' : JSON.stringify(solid)}\n      `
    + `6 m below it: ${below ? `${below.landmark || 'seeded'} ${below.proto}, top ${below.top} m — there IS a deck underfoot` : 'NOTHING — the spawn is over a hole'}`);

  // ── 6. §3.2.2 — the cross-fade actually hides the swap ───────────────────
  //
  // The measurement, not the screenshot. Walk the camera across the LOD0 boundary in 3 m steps
  // and probe an 8x6 luminance grid TWICE at every position — once with the dither, once with it
  // collapsed to a hard swap. Because the camera is identical in the pair, ordinary parallax
  // cancels in the difference, and what is left is the LOD system on its own:
  //
  //   parallax   max per-cell change between consecutive steps under the dither. This is the
  //              frame's ordinary motion and it is the yardstick — a pop is only a pop if it is
  //              large next to this.
  //   swapJump   max per-cell |(hard(i) - hard(i-1)) - (dither(i) - dither(i-1))|. The EXTRA
  //              frame-to-frame jump a hard swap introduces. Parallax cancels twice over.
  //   stateGap   max per-cell |dither(i) - hard(i)| at the same camera. Non-complementary
  //              discard tests show up here: keeping the same noise band in both fields doubles
  //              the band chunks, and inverting one of them punches fog-coloured holes.
  await goto(S, base, 'debug=1&var=deepnight&nosave&nohud');

  // Framed ON the band rather than over it: the camera sits at 0.62 R0 and looks at a point
  // 0.92 R0 away at 0.30 R0 of height, through a 36 deg lens. At the default 62 deg the band is a
  // thin annulus in a frame mostly full of near buildings and open sky.
  const R0 = LOW ? 256 : 512;
  const PITCH = Math.round(Math.atan2(0.30 - 0.62, 0.92) * 180 / Math.PI);   // -19 deg
  const FOV = 36;
  const CAM = [-1500, Math.round(R0 * 0.62), 350];
  const park = () => evalJSON(S, `(window.__game.setCamera({pos:[${CAM}],yaw:0,pitch:${PITCH},fov:${FOV}}),1)`);
  await park();

  // ── THE GATE RACED CHUNK STREAMING. This is the fix, and it is not a threshold change. ──────
  //
  // This camera is 1.5 km from the spawn, so parking it asks for an entirely new 5x5 ring. The
  // previous version waited `settle(S, 40)` — forty FRAMES — and then swept. Measured at that
  // exact moment: **126 chunks still queued**, and over sweep steps 0-12 the live instance counts
  // climbed LOD0 218 → 553 and LOD1 961 → 1722. One thousand and ninety-six buildings appeared in
  // frame DURING the measurement, and the sweep's statistic is "worst per-cell luminance change
  // between consecutive steps" — so a chunk landing on any cell was reported as the dither's
  // residue.
  //
  // That is the whole explanation for the run-to-run swing P4 flagged and could not account for:
  //
  //   pass  dither 0.00530 @ cell 152 step 14   24.7 % of control   — after the queue drained
  //   fail  dither 0.05510 @ cell 411 step  8  255.1 % of control   — a chunk arriving
  //
  // and the tell was in the numbers all along: 255 % means the cross-fade moved a cell 2.5x more
  // than DELETING THE ENTIRE LOD1 FIELD does, which is impossible. Note also that the `hard` sweep
  // was bit-identical across runs (0.01470, cell 127, step 12) because it runs second, by which
  // time the queue is empty. It was never machine contention and it was never the `&&` guards.
  //
  // This is the second time a gate on this project has raced the chunk pump. So the world is
  // quiesced by its own signature, not by a frame count, and `quiesce()` THROWS if it never goes
  // quiet — an unmet precondition aborts the measurement rather than being assumed.
  const quiet = await quiesce(S, { timeout: 90000 });
  await settle(S, 8);

  // P3a's signage, strips and strobes are hidden for the duration of this sweep, and this is
  // isolation rather than convenience: §3.2.2 has THREE parts and this gate measures part 3, the
  // dither. Part 2 — signage intensity ramping over the same outer 15 % — is driven by the same
  // R0 this sweep moves, so leaving it on reports part 2 as part 3's residue (measured: the
  // residue went from 33 % of the control to 53 % the moment signage existed, with the dither
  // untouched). tools/gates_p3a.mjs measures part 2 on its own.
  await hook(S, 'setSignVisible', false, true);

  // P3b, and this is obligation T7's own rule turned back on this gate. The sweep measures the
  // WORST PER-CELL LUMINANCE CHANGE BETWEEN CONSECUTIVE STEPS, so anything in frame that moves on
  // its own is measured as if the dither had moved it. P3b added three such things:
  //
  //   rain          `deepnight` has rain 0.15, and a 2,500-drop animated field changes every cell
  //                 every frame — measured, it took the dither residue from 0.024 to 0.070 against
  //                 a 0.007 limit, with the dither untouched
  //   silhouettes   a +/-0.15 m sine drift, same problem at a smaller scale
  //   uTime         sign flicker and the ticker scroll, already hidden with the sign layers but
  //                 frozen here as well so the isolation does not depend on that
  //
  // setSignVisible already carries P3b's mirrored buckets and halo sprites with their source
  // fields (they ride the same R0), so those need nothing here.
  await hook(S, 'setRain', false);
  await hook(S, 'setSilhouettes', false);
  await hook(S, 'freezeTime', true);

  // THE CAMERA DOES NOT MOVE. §3.2.2's fade is a function of (chunk distance / R0), so sweeping
  // R0 walks every chunk across the band with EXACTLY ZERO parallax. Moving the camera instead —
  // which is the obvious way to write this test — puts a per-cell parallax floor of 0.05 under a
  // swap worth 0.02, and every version of this gate that did it that way measured the floor.
  const SWEEP = 26;
  const r0 = k => R0 * (1.30 - 0.50 * k / (SWEEP - 1));
  // `moved` is the falsification guard for the fix above. Sweeping R0 must not change the chunk
  // SET — R0 drives the fade, `ringNear/ringMid` drive streaming — so the world signature is
  // expected to be constant for the whole sweep. If it is not, the sample is contaminated and the
  // gate says so instead of averaging a race into a plausible-looking number.
  async function sweep(hard) {
    await evalJSON(S, `window.__game.setFadeHard(${hard})`);
    const out = [];
    const moved = [];
    for (let k = 0; k < SWEEP; k++) {
      await evalJSON(S, `window.__game.city.setR0(${r0(k).toFixed(2)})`);
      await settle(S, 3);
      const sig = await cityStreamSig(S);
      if (sig !== quiet.sig) moved.push(`${k}:${sig}`);
      out.push((await evalP(S, 'window.__game.probe({ grid: [24, 18] })')).grid.cells.map(c => c.lum));
      if (!hard && (k === 0 || k === 13 || k === SWEEP - 1)) await shoot(S, `fade_band_${k}`);
      if (hard && k === 13) await shoot(S, 'fade_hard_mid');
    }
    let worst = 0, at = -1, cell = -1;
    for (let i = 1; i < out.length; i++) {
      for (let c = 0; c < out[i].length; c++) {
        const d = Math.abs(out[i][c] - out[i - 1][c]);
        if (d > worst) { worst = d; at = i; cell = c; }
      }
    }
    return { worst: +worst.toFixed(5), at, cell, frames: out, moved };
  }
  const dith = await sweep(false);
  const hard = await sweep(true);
  await evalJSON(S, 'window.__game.setFadeHard(false)');
  await evalJSON(S, 'window.__game.city.setR0(0)');

  // The positive control. A measurement that says "the swap is invisible" is worthless unless the
  // probe can see the thing that swapped. Hide the whole LOD1 field and see how much moves.
  await settle(S, 6);
  const normal = (await evalP(S, 'window.__game.probe({ grid: [24, 18] })')).grid.cells.map(c => c.lum);
  await evalJSON(S, '(window.__game.city.lod1.mesh.visible = false, 1)');
  await settle(S, 6);
  const blind = (await evalP(S, 'window.__game.probe({ grid: [24, 18] })')).grid.cells.map(c => c.lum);
  await evalJSON(S, '(window.__game.city.lod1.mesh.visible = true, 1)');
  await hook(S, 'setSignVisible', true, true);
  let visGap = 0;
  for (let k = 0; k < normal.length; k++) visGap = Math.max(visGap, Math.abs(normal[k] - blind[k]));

  // Both bounds are RELATIVE, because the absolute per-cell numbers scale with how much of the
  // frame the band fills — LOW's 256 m band at 159 m altitude fills five times more of the frame
  // than HIGH's 512 m band does, and an absolute cap tuned on one preset fails the other for a
  // reason that has nothing to do with popping.
  // The stability of the world is now part of the pass condition, not a footnote. A sample taken
  // from a moving world is not a smaller measurement, it is a different one.
  const stable = dith.moved.length === 0 && hard.moved.length === 0;
  const pass = stable && visGap > 0.01 && hard.worst > dith.worst * 2.5 && dith.worst < visGap * 0.35;
  check('§3.2.2 — the dither cross-fade spreads the LOD0 → LOD1 swap; a hard swap concentrates it', pass,
    `world QUIESCED before sampling: queue drained in ${quiet.ms} ms over ${quiet.polls} polls, `
    + `signature [queued|chunks|near|lod0|lod1|lod2|far|aabbs] = ${quiet.sig}, and it did not move `
    + `for any of the ${SWEEP * 2} samples `
    + `(${stable ? 'confirmed stable' : `CONTAMINATED — moved at ${dith.moved.concat(hard.moved).slice(0, 4).join(' ')}`}). `
    + `The previous version waited 40 frames instead and swept with 126 chunks still queued, which `
    + `is what made this gate swing 24.7 % → 255.1 % between consecutive runs.\n      `
    + `camera FIXED at ${JSON.stringify(CAM)}, pitch ${PITCH}, fov ${FOV}, deepnight (the binding `
    + `variant, vis(R0) = 0.443). R0 swept ${(R0 * 1.30).toFixed(0)} → ${(R0 * 0.80).toFixed(0)} m in `
    + `${SWEEP} steps, which walks every chunk across the band with zero parallax. 24x18 luminance grid.\n      `
    + `control   ${visGap.toFixed(5)}  hiding the whole LOD1 field moves cells by this much — the probe `
    + `demonstrably sees the geometry that swaps, without which the rest is vacuous\n      `
    + `dither    ${dith.worst.toFixed(5)}  worst per-cell change between consecutive sweep steps `
    + `(cell ${dith.cell}, step ${dith.at})\n      `
    + `hard      ${hard.worst.toFixed(5)}  the same sweep with the fade collapsed to a hard swap `
    + `(cell ${hard.cell}, step ${hard.at}) — ${(hard.worst / Math.max(1e-9, dith.worst)).toFixed(1)}x, `
    + `and it all lands in one step\n      `
    + `The dither's residue is ${(dith.worst / Math.max(1e-9, visGap) * 100).toFixed(1)} % of the control `
    + `and ${(dith.worst * 255).toFixed(1)} eight-bit levels. §3.2.2 part 1 does most of the work before `
    + `the dither gets there — LOD1 boxes are the LOD0 prototype's bounding box carrying the same atlas `
    + `cell and the same 3.6 m / 3.2 m pitch, so the only silhouette change is a chamfer at 2-4 px; what `
    + `the dither has left to hide is the tallest-40 % subset dropping the short buildings.\n      `
    + `evidence: shots/p2/fade_band_0|13|25.png across the band, fade_hard_mid.png for contrast`);

  // ── 7. §3.2.3 — the generation budget over a real flight ─────────────────
  const SECS = +(args.secs || 20);
  await goto(S, base, 'auto=1&nosave&nohud');
  await evalJSON(S, 'window.__game.resetPerf()');
  const t0 = Date.now();
  let worstGen = 0, worstFrame = 0, meanFrame = 0, n = 0, chunkSet = new Set(), maxQueued = 0;
  let shots = 0;
  while (Date.now() - t0 < SECS * 1000) {
    const s = await evalJSON(S, 'window.__state');
    worstGen = Math.max(worstGen, s.ms.genWorst ?? s.ms.gen);
    worstFrame = Math.max(worstFrame, s.ms.worst);
    meanFrame += s.ms.frame; n++;
    maxQueued = Math.max(maxQueued, s.city.queued);
    chunkSet.add(`${Math.floor(s.player.x / 256)},${Math.floor(s.player.z / 256)}`);
    if (n % 12 === 0 && shots < 4) await shoot(S, `auto_${shots++}`);
    await sleep(100);
  }
  const flight = await evalJSON(S, 'window.__state');
  meanFrame /= Math.max(1, n);
  // §S2-K D4. `ms.gen` alone cannot say whether a red reading is one expensive work unit or an
  // accumulation, and the 1.900 ms failure this suite found at ship time cost a phase to answer.
  // `city.stagePeak` is the worst any single §3.2.3 unit cost DURING THIS FLIGHT — the sibling
  // `stageMs` also carries the boot pre-warm, where units run back to back with no cap at all.
  // Printed, not gated: gates_s2k D4 owns the assertion and the per-component timing behind it.
  const peak = flight.city.stagePeak || [];
  check(`§3.2.3 — chunk generation fits its budget over a ${SECS}s ?auto=1 flight`,
    worstGen <= GATES.msGen && worstFrame <= GATES.worstFrame && flight.errors.length === 0,
    `worst ms.gen ${worstGen.toFixed(3)} ms over any single frame (gate ${GATES.msGen}); worst frame ${worstFrame.toFixed(2)} ms `
    + `(gate ${GATES.worstFrame}, §13 quotes 22 — see the report); mean frame ${meanFrame.toFixed(2)} ms\n      `
    + `worst SINGLE work unit this flight [${peak.join(', ')}] ms against §3.2.3's 1.2 per-unit cap `
    + `(units 1-4 plus the deferred release) — a red ms.gen with every one of these low is a stall, `
    + `not a cost; see the header of tools/gates_s2k.mjs\n      `
    + `${chunkSet.size} distinct chunks flown through; deepest stream queue ${maxQueued} chunks; `
    + `${flight.city.chunks} live, ${flight.city.lod0}/${flight.city.lod1}/${flight.city.lod2} instances; `
    + `${flight.errors.length} errors`);

  await close();

  writeFileSync(resolve(OUT, `_gates${LOW ? '_low' : ''}.json`),
    JSON.stringify({ at: new Date().toISOString(), low: LOW, headed: !!args.headed, results }, null, 2));
  const bad = results.filter(r => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} gates pass  →  shots/p2/`);
  if (bad.length) process.exit(1);
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
