// P11 — "the ground appears semi transparent" (ART_PASS §4). INVESTIGATE BEFORE STYLING.
//
// The question: is the road reading as see-through because of a DEFECT (§3.7b's mirror group or
// §3.6's water film showing through) or because of an art choice?
//
// Method: render one frozen shot four ways — baseline, mirror off, film off, both off — and diff
// the frames. A layer that is invisible in the frame cannot change it; a layer that is painting a
// whole inverted skyline through the floor changes a large, contiguous, LOW region of the frame.
//
// The standing lesson on this project is measurements that silently measure nothing, so this tool
// carries BOTH controls and prints them beside the result:
//   NULL control     — capture twice with nothing changed. Must be ~0.
//   POSITIVE control — hide the signage field outright. Must be large.
// A near-zero result for the mirror is only allowed to mean "the mirror is not visible" once the
// positive control has shown the differ can see a layer disappear.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { open, waitFor, settle, evalJSON, hook, quiesce, cleanup } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'shots/p11');
const TMP = `/tmp/neonhaul-p11-${process.pid}`;

const GW = 160, GH = 90;   // the diff grid — coarse on purpose, this is about WHERE not about fidelity

function toGrid(png, w, h) {
  mkdirSync(TMP, { recursive: true });
  const a = `${TMP}/a.png`, b = `${TMP}/a.raw`;
  writeFileSync(a, png);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', a,
    '-vf', `scale=${w}:${h}:flags=area`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', b]);
  return new Uint8Array(readFileSync(b));
}

// Mean absolute per-channel delta over the whole grid, plus the same restricted to the bottom
// third (where a floor lives) and the top third (where it does not), plus the bounding box of
// every cell that moved by more than 3/255.
function diff(p, q, w = GW, h = GH) {
  let all = 0, lo = 0, hi = 0, nLo = 0, nHi = 0, moved = 0;
  let x0 = w, x1 = -1, y0 = h, y1 = -1, peak = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const d = (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])) / 3;
      all += d;
      if (y >= (h * 2) / 3) { lo += d; nLo++; } else if (y < h / 3) { hi += d; nHi++; }
      if (d > 3) {
        moved++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (d > peak) peak = d;
    }
  }
  return {
    mean: +(all / (w * h)).toFixed(3),
    meanBottomThird: +(lo / Math.max(1, nLo)).toFixed(3),
    meanTopThird: +(hi / Math.max(1, nHi)).toFixed(3),
    peak: +peak.toFixed(1),
    movedPct: +((moved / (w * h)) * 100).toFixed(2),
    bbox: x1 < 0 ? null : { x0, y0, x1, y1 },
  };
}

async function main() {
  const shot = process.argv.find(a => a.startsWith('--shot='))?.slice(7) || 'canyon_dive';
  const ctx = await open({ w: 900, h: 506, dpr: 1, headed: false });
  const { S, base, close } = ctx;
  mkdirSync(OUT, { recursive: true });

  await S('Page.navigate', { url: `${base}/index.html?shot=${shot}&dpr=1&nohud&nosave` });
  await waitFor(S, 'window.__ready', 30000);
  await quiesce(S, { label: `p11/${shot}` });
  await settle(S, 45);
  // Without this the null control is ~0.75 of a channel — rain, flicker and the grade's scrolling
  // dither move every pixel between two captures of an UNCHANGED scene, which is the same size as
  // the effects being measured. Asserted, not `&&`-guarded: if the hook is gone the run aborts.
  await hook(S, 'freezeTime', true);
  await settle(S, 12);

  const grab = async label => {
    await settle(S, 12);
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(data, 'base64');
    writeFileSync(resolve(OUT, `ground_${shot}_${label}.png`), buf);
    return toGrid(buf, GW, GH);
  };

  const res = { shot, at: new Date().toISOString(), conditions: {}, controls: {} };

  const base0 = await grab('a_baseline');
  const base1 = await grab('a_baseline2');
  res.controls.null = diff(base0, base1);          // must be ~0

  await hook(S, 'setReflect', false);
  const noMirror = await grab('b_nomirror');
  res.conditions.mirrorOff = diff(base0, noMirror);
  await hook(S, 'setReflect', true);

  await hook(S, 'setFilm', false);
  const noFilm = await grab('c_nofilm');
  res.conditions.filmOff = diff(base0, noFilm);
  await hook(S, 'setFilm', true);

  await hook(S, 'setReflect', false);
  await hook(S, 'setFilm', false);
  const neither = await grab('d_neither');
  res.conditions.bothOff = diff(base0, neither);
  await hook(S, 'setReflect', true);
  await hook(S, 'setFilm', true);

  // POSITIVE CONTROL — a layer the differ must be able to see vanish.
  await hook(S, 'setSignVisible', false, true);
  const noSigns = await grab('e_nosigns');
  res.controls.positive = diff(base0, noSigns);
  await hook(S, 'setSignVisible', true, true);

  const ok = res.controls.null.mean < 0.05 && res.controls.positive.mean > 1.0;
  res.probeValid = ok;
  res.note = ok
    ? 'probe valid: null control ~0 AND positive control large, so a zero here means the layer is invisible'
    : 'PROBE INVALID — a result from it means nothing';

  writeFileSync(resolve(OUT, `ground_${shot}.json`), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
  await close();
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

main().catch(e => { console.error(e.message); cleanup(); process.exit(1); });
