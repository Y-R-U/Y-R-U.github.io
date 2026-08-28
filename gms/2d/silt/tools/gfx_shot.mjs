#!/usr/bin/env node
/**
 * Lane A's own capture + perf tool. Drives dev/gfx.html through cdp.mjs.
 *
 * Both of cdp.mjs's gotchas apply and are honoured here: capture goes through
 * canvas.toDataURL (never Page.captureScreenshot, which hangs forever on an
 * animating WebGL canvas under headless), which is why every URL carries
 * ?preserve=1, and every URL carries ?dpr=1 because the software rasteriser
 * takes minutes a frame at dpr 2.
 *
 *   node tools/gfx_shot.mjs                       # every scene, default biome
 *   node tools/gfx_shot.mjs --scene=dissolve --biome=kiln --dt=9
 *   node tools/gfx_shot.mjs --all                 # scene x biome matrix
 *   node tools/gfx_shot.mjs --perf --gpu          # timed run, real GPU
 *   node tools/gfx_shot.mjs --check               # v-flip + board-rect + thin-scenery + sand gates
 *   node tools/gfx_shot.mjs --check --falsify=rect|thin|sand    # watch one go red
 */
import { harness, ROOT } from './cdp.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const SCENES = ['dune', 'tide', 'kiln', 'jelly', 'glass', 'dissolve', 'mixed', 'tints', 'wall', 'thin'];
const BIOMES = ['dune', 'abyss', 'kiln', 'lumen', 'quartz'];
const W = +(args.w || 420), H = +(args.h || 900);
const SHOTS = join(ROOT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const jobs = [];
if (args.all) {
  for (const s of SCENES) for (const b of BIOMES) jobs.push({ scene: s, biome: b });
} else if (args.scene) {
  jobs.push({ scene: args.scene, biome: args.biome || 'dune' });
} else {
  for (const s of SCENES) jobs.push({ scene: s, biome: args.biome || (s === 'kiln' ? 'kiln' : s === 'glass' ? 'abyss' : 'dune') });
}


/* ------------------------------------------------------------------ gates */
/**
 * V-FLIP GATE. The board was once rendered upside down: the sim piles sand at
 * the BOTTOM (grid row 0 is the ceiling) and the renderer drew it across the
 * top, because a GL texture's row 0 is its BOTTOM. Settled convention, in one
 * place only — RESOLVE_FS does `cell = v_uv * u_grid`, so cell.y counts UP from
 * the floor and the texture row is `rows - 1 - cell.y`. Nothing else flips.
 *
 * The gate does not eyeball anything: it renders an empty board and a board
 * with material in the bottom 10 rows ONLY, diffs the two framebuffers, and
 * asserts the difference mass is in the bottom of the image. Verified to FAIL
 * on the flipped build before it was trusted on the fixed one.
 */
async function vflipGate(cdp, base) {
  await cdp.goto(`${base}/dev/gfx.html?preserve=1&dpr=1&scene=empty&biome=dune&anim=0&bot=0&t=3.5`);
  if (!await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000)) throw new Error('harness never became ready');
  const r = await cdp.eval(`(async () => {
    const g = window.__gfx;
    g.hidePanel();
    const grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const c = document.getElementById('gl');
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const x = o.getContext('2d'); x.drawImage(c, 0, 0);
      res(x.getImageData(0, 0, o.width, o.height));
    })));
    g.build('empty');  const A = await grab();
    g.build('vflip');  const B = await grab();
    const w = A.width, h = A.height;
    const rows = new Float64Array(h);
    let total = 0;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        s += Math.abs(B.data[i] - A.data[i]) + Math.abs(B.data[i+1] - A.data[i+1]) + Math.abs(B.data[i+2] - A.data[i+2]);
      }
      rows[y] = s; total += s;
    }
    let acc = 0, mean = 0, bottom = 0;
    for (let y = 0; y < h; y++) { mean += rows[y] * y; if (y > h * 0.5) bottom += rows[y]; }
    // ImageData row 0 is the TOP of the canvas, so a big meanY means low on screen.
    return { h, total, meanY: total ? mean / total : 0, bottomFrac: total ? bottom / total : 0 };
  })()`);
  const ok = r.total > 1e5 && r.bottomFrac > 0.70 && r.meanY > r.h * 0.65;
  console.log('v-flip gate: mass %s%% in the lower half, mean row %s of %d (%s)',
    (r.bottomFrac * 100).toFixed(1), r.meanY.toFixed(0), r.h, ok ? 'PASS' : 'FAIL');
  if (!ok) {
    console.log('  the bottom 10 grid rows must light the BOTTOM of the image.');
    console.log('  diff signal=%s bottomFrac=%s (need >0.70) meanY/h=%s (need >0.65)',
      r.total.toFixed(0), r.bottomFrac.toFixed(3), (r.meanY / r.h).toFixed(3));
  }
  return ok;
}

/**
 * BOARD-RECT GATE. The renderer used to compute its OWN letterbox fit —
 * `Math.min(vw/cols, vh/rows) * 0.985`, centred — while core/viewport.js
 * computed a different one that respects the safe-area insets and biases the
 * board upward. input.js converts touches through view.board and the shell
 * anchors its controls to it, so every touch was ~16 px off what was drawn.
 * view.board is now the only board rect there is, and this proves it.
 *
 * It does not eyeball anything: it fills every cell, diffs against an empty
 * board, and finds the drawn edges from the row/column diff profiles at half
 * the plateau — a threshold the bloom halo outside the lip never reaches.
 * Falsify with --falsify=rect, which hands the renderer a 0.985-shrunk rect
 * through dev/gfx.html's ?boardfudge= while the gate still reads view.board.
 */
async function boardRectGate(cdp, base, fudge, vp) {
  await cdp.viewport(vp[0], vp[1], 1, true);
  const q = new URLSearchParams({ preserve: '1', dpr: '1', scene: 'empty', biome: 'dune', anim: '0', bot: '0', t: '3.5' });
  if (fudge) q.set('boardfudge', String(fudge));
  await cdp.goto(`${base}/dev/gfx.html?${q}`);
  if (!await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000)) throw new Error('harness never became ready');
  const r = await cdp.eval(`(async () => {
    const g = window.__gfx;
    g.hidePanel();
    const grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const c = document.getElementById('gl');
      const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
      const x = o.getContext('2d'); x.drawImage(c, 0, 0);
      res(x.getImageData(0, 0, o.width, o.height));
    })));
    g.build('empty'); const A = await grab();
    g.build('full');  const B = await grab();
    const w = A.width, h = A.height;
    const cols = new Float64Array(w), rows = new Float64Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = Math.abs(B.data[i] - A.data[i]) + Math.abs(B.data[i+1] - A.data[i+1]) + Math.abs(B.data[i+2] - A.data[i+2]);
      cols[x] += d; rows[y] += d;
    }
    // half-plateau edge finder: the fill is a solid rectangle, so each profile
    // is a plateau with steep sides. The median of the middle half is the
    // plateau height whatever the vignette does to the corners.
    const edges = (p) => {
      const n = p.length;
      const mid = [...p].slice(Math.floor(n * 0.25), Math.ceil(n * 0.75)).sort((a, b) => a - b);
      const plateau = mid[mid.length >> 1];
      if (!(plateau > 0)) return null;
      const th = plateau * 0.5;
      let lo = 0, hi = n - 1;
      while (lo < n && p[lo] < th) lo++;
      while (hi >= 0 && p[hi] < th) hi--;
      return { lo, hi, plateau };
    };
    const ex = edges(cols), ey = edges(rows);
    const s = document.getElementById('gl').width / g.view.w;   // css px -> device px
    const b = g.view.board;
    return { ex, ey, s, w, h,
      want: { x0: b.x * s, x1: (b.x + b.w) * s, y0: b.y * s, y1: (b.y + b.h) * s } };
  })()`);
  if (!r || !r.ex || !r.ey) { console.log('board-rect gate: no diff signal at all (FAIL)'); return false; }
  // profile index i covers [i, i+1), so the drawn span is [lo, hi+1)
  const got = { x0: r.ex.lo, x1: r.ex.hi + 1, y0: r.ey.lo, y1: r.ey.hi + 1 };
  const TOL = 2.0;
  const err = {
    left: got.x0 - r.want.x0, right: got.x1 - r.want.x1,
    top: got.y0 - r.want.y0, bottom: got.y1 - r.want.y1,
  };
  const worst = Math.max(...Object.values(err).map(Math.abs));
  const ok = worst <= TOL;
  console.log('board-rect gate %dx%d: drawn %s vs view.board %s — worst edge %s px (%s)',
    vp[0], vp[1],
    `[${got.x0},${got.y0},${got.x1},${got.y1}]`,
    `[${r.want.x0.toFixed(1)},${r.want.y0.toFixed(1)},${r.want.x1.toFixed(1)},${r.want.y1.toFixed(1)}]`,
    worst.toFixed(1), ok ? 'PASS' : 'FAIL');
  if (!ok) {
    console.log('  the drawn board MUST be view.board. Edge errors (drawn - view, px):');
    console.log('   left %s  right %s  top %s  bottom %s   (tolerance %s)',
      err.left.toFixed(1), err.right.toFixed(1), err.top.toFixed(1), err.bottom.toFixed(1), TOL);
  }
  return ok;
}

/**
 * THIN-SCENERY GATE. A player on a phone, on the hand-authored tutorial level
 * 2: "Am I meant to see the dividers? Because I don't see them until water hits
 * them." He was, and he was right about the cause.
 *
 * `js/data/tutorial.js` separates that level's three lava pits with WALL
 * dividers exactly TWO cells wide, and `pillars()` in `js/data/levelgen.js`
 * builds WALL and CRYSTAL pillars two to five cells wide right through the
 * generated campaign. The renderer resolves the grid into a density field and
 * then blurs it — which is what makes a heap read as a dune — and that blur
 * erodes a 2-cell column to a smoothed density of 0.32 against a cover
 * threshold of 0.42. Not dim: ABSENT. `cover` was exactly zero and the lighting
 * pass returned the backdrop, so the divider was the sky.
 *
 * WHAT IT MEASURES. `dev/gfx.html` scene `thin` is a width ladder — 1, 2, 3, 4
 * and 6 cells of WALL plus 2-cell CRYSTAL and ICE, on an 80x160 board with the
 * two dividers at x=26 and x=53 taken from the tutorial cell for cell — and
 * scene `thinbare` is the identical board with the structures removed. The gate
 * grabs both, and for each structure averages the per-channel difference over
 * every device-pixel column that lands inside it.
 *
 * Diffing against a bare board rather than against a gutter in the same frame
 * is deliberate. Every biome's key glow makes one end of the board several
 * units brighter than the other, which is the same size as the effect being
 * measured, and the bloom halo off a wide pillar reaches into the gutter beside
 * it. Two captures of the same board, one with the scenery and one without,
 * have neither problem — and with the renderer clock pinned by ?t= they are
 * otherwise bit-identical.
 *
 * Per-channel, not luma, because a wall that matches the sky's brightness but
 * not its hue is still visible — and hue is what actually fixed kiln.
 *
 * THE BAR IS 18, and it is calibrated from this ladder rather than picked.
 * Measured before the fix, in this metric:
 *
 *     width   kiln  lumen  abyss  quartz  dune     visible in the capture?
 *       1      1.3   1.5    1.0    2.0     1.5     no, in any biome
 *       2      3.5   3.9    2.3    5.1     3.6     no — the reported bug
 *       3      5.7  10.4   33.5   22.1    31.8     only where it scored >20
 *       4     21.8  32.9   64.0   51.4    49.5     yes, everywhere
 *       6     20.2  27.5   47.4   29.0    39.2     yes, everywhere
 *
 * 10.4 is the highest score of any structure a human could not find in the
 * capture; ~20 is the lowest score of one nobody could miss. 18 sits above the
 * first and at the second, with the shipping numbers landing 23-52 on the
 * 2-cell case. A relative floor rides alongside it: at least 3x the change the
 * same structures make to the empty board around them, so the bar cannot be
 * met by bloom spill alone.
 *
 * TWO BIOMES WITH OPPOSITE BACKDROPS, always. `kiln` puts its scenery in front
 * of the brightest part of a hot red vessel and `lumen` in front of a lit aqua
 * panel; a fix that only worked against a dark sky would pass on abyss and be
 * half a fix. Both are checked, and abyss/quartz/dune are reported alongside.
 *
 * Falsify with --falsify=thin, which sets ?staticbug=1. That does not imitate
 * the old renderer, it IS the old renderer: the resolve pass is told nothing is
 * static, so the static coverage attachment is zero everywhere and `cover`
 * falls back to ss(0.42, 0.62, d) exactly.
 */
const THIN_BAR = 18.0;      // per-channel mean difference, 0-255
const THIN_RATIO = 3.0;     // ... and at least this many times the spill floor
const THIN_MATS = { 1: 'WALL', 7: 'ICE', 9: 'CRYSTAL' };

const THIN_PROBE = `(async () => {
  const g = window.__gfx;
  g.hidePanel();
  const grab = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = document.getElementById('gl');
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const x = o.getContext('2d'); x.drawImage(c, 0, 0);
    res(x.getImageData(0, 0, o.width, o.height));
  })));
  g.build('thin');      const S = await grab();
  const wr = g.world.g, cols = wr.cols, rows = wr.rows;
  const mats = []; for (let cx = 0; cx < cols; cx++) mats.push(wr.mat[wr.idx(cx, rows - 16)]);
  g.build('thinbare');  const E = await grab();

  const c = document.getElementById('gl');
  const b = g.view.board, s = c.width / g.view.w;
  const bx = b.x * s, bw = b.w * s, by = b.y * s, bh = b.h * s;
  const py = (cy) => Math.round(by + (cy + 0.5) / rows * bh);
  // rows strictly INSIDE the structures: above the floor slab, below their tops
  const yA = py(rows - 24), yB = py(rows - 8);
  const lo = Math.min(yA, yB), hi = Math.max(yA, yB);
  const W = S.width;
  const dV = new Float64Array(W), sV = new Float64Array(W), eV = new Float64Array(W);
  const cc = new Int32Array(W).fill(-1);
  for (let X = 0; X < W; X++) {
    let d = 0, sv = 0, ev = 0, n = 0;
    for (let Y = lo; Y <= hi; Y++) {
      const i = (Y * W + X) * 4;
      d += (Math.abs(S.data[i] - E.data[i]) + Math.abs(S.data[i+1] - E.data[i+1]) + Math.abs(S.data[i+2] - E.data[i+2])) / 3;
      sv += (S.data[i] + S.data[i+1] + S.data[i+2]) / 3;
      ev += (E.data[i] + E.data[i+1] + E.data[i+2]) / 3;
      n++;
    }
    dV[X] = d / n; sV[X] = sv / n; eV[X] = ev / n;
    const q = Math.floor((X + 0.5 - bx) / bw * cols);
    if (q >= 0 && q < cols) cc[X] = q;
  }
  const runs = []; let st = 0;
  for (let cx = 1; cx <= cols; cx++)
    if (cx === cols || mats[cx] !== mats[st]) { runs.push({ mat: mats[st], x0: st, x1: cx - 1, w: cx - st }); st = cx; }
  const band = (x0, x1) => {
    let d = 0, sv = 0, ev = 0, n = 0;
    for (let X = 0; X < W; X++) if (cc[X] >= x0 && cc[X] <= x1) { d += dV[X]; sv += sV[X]; ev += eV[X]; n++; }
    return { d: n ? d / n : 0, sv: n ? sv / n : 0, ev: n ? ev / n : 0, n };
  };
  const out = [];
  for (const r of runs) {
    if (r.mat === 0 || r.w > 20) continue;         // 0 is empty, >20 is the floor slab
    out.push({ mat: r.mat, w: r.w, x0: r.x0, ...band(r.x0, r.x1) });
  }
  // Spill floor: the middle of the widest EMPTY run. Bloom and the contact
  // shade reach into a gutter, so this is what "nothing is there" is worth.
  let big = null;
  for (const r of runs) if (r.mat === 0 && (!big || r.w > big.w)) big = r;
  const q0 = big.x0 + Math.floor(big.w * 0.3), q1 = big.x1 - Math.floor(big.w * 0.3);
  return { out, floor: band(q0, q1).d, pxPerCell: bw / cols, cols, rows };
})()`;

async function thinSceneryGate(cdp, base, falsify) {
  // All five are asserted. kiln and lumen are the two that matter and the two
  // the bar was set against — kiln stands its scenery in front of the brightest
  // part of a hot vessel and lumen in front of a lit aqua panel, so a fix that
  // only worked against a dark sky passes abyss and fails these — but there is
  // no reason to leave the other three unguarded, and under the arm all five go
  // red, which is what says so.
  const biomes = ['kiln', 'lumen', 'abyss', 'quartz', 'dune'];
  const OPPOSED = ['kiln', 'lumen'];
  // The low tier compiles a DIFFERENT resolve shader — R=1, SIG=0.60, nine taps
  // instead of twenty-five — and the renderer drops to it on its own after
  // sixty slow frames, on exactly the phones this game is for. The static tent
  // only reaches one cell either side, so R=1 is enough for it to remain a
  // partition of unity, but "is enough" is an argument and this is the
  // measurement. Both tiers on the two biomes the bar was set against.
  const runs = biomes.map((b) => [b, null])
    .concat(OPPOSED.map((b) => [b, 'low']));
  let ok = true;
  console.log('thin-scenery gate: a 2-cell static structure must differ from the bare board');
  console.log('  by >= %s per channel and >= %sx the spill floor%s',
    THIN_BAR.toFixed(0), THIN_RATIO.toFixed(0), falsify ? '   [--falsify=thin]' : '');
  for (const [biome, tier] of runs) {
    const q = new URLSearchParams({
      preserve: '1', dpr: '1', scene: 'thin', biome, anim: '0', bot: '0', t: '6',
      cols: '80', rows: '160',
    });
    if (tier) q.set('q', tier);
    if (falsify) q.set('staticbug', '1');
    await cdp.goto(`${base}/dev/gfx.html?${q}`);
    if (!await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000)) {
      console.log('  %s/%s: harness never became ready (FAIL)', biome, tier || 'high'); ok = false; continue;
    }
    const r = await cdp.eval(THIN_PROBE);
    const two = r.out.filter((o) => o.w === 2);
    const bad = two.filter((o) => o.d < THIN_BAR || o.d < r.floor * THIN_RATIO);
    const ladder = r.out.map((o) => `${THIN_MATS[o.mat] || o.mat}${o.w}=${o.d.toFixed(1)}`).join(' ');
    console.log('  %s %s %s floor %s | %s  (%s)',
      biome.padEnd(7), (tier || 'high').padEnd(4), OPPOSED.includes(biome) ? '*' : ' ',
      r.floor.toFixed(1), ladder, bad.length ? 'FAIL' : 'ok');
    if (bad.length) {
      ok = false;
      for (const o of bad)
        console.log('     %s %d cells wide reads %s against the bare board — bar %s, floor %s',
          THIN_MATS[o.mat] || o.mat, o.w, o.d.toFixed(1), THIN_BAR.toFixed(1), (r.floor * THIN_RATIO).toFixed(1));
    }
  }
  console.log('thin-scenery gate: %s', ok ? 'PASS' : 'FAIL');
  return ok;
}

/**
 * SAND-IS-UNTOUCHED GATE, and it is the other half of the one above. The fix
 * for thin scenery lives inside the shared resolve and lighting passes, so the
 * hazard is that it quietly re-grades sand, water, jelly, oil, lava and the
 * dissolve as well — and no amount of looking at a wall would ever show that.
 *
 * Every one of these scenes contains no STATIC material at all, so the static
 * coverage attachment is zero across the whole board and the render must come
 * out BIT-IDENTICAL to the same page with ?staticbug=1, which is the old
 * renderer. Not "close", not "within a tolerance": zero differing bytes.
 *
 * This check cannot fail for the reason its sibling fails, so it has its own
 * arm — --falsify=sand puts a WALL slab into the scene through ?sandbug=1,
 * which makes the two renders legitimately differ and the check go red.
 */
async function sandUntouchedGate(cdp, base, falsify) {
  const GRAB = `(async () => {
    window.__gfx.hidePanel();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.getElementById('gl');
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const x = o.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const a = new Array(d.length / 4 * 3);
    for (let i = 0, k = 0; i < d.length; i += 4) { a[k++] = d[i]; a[k++] = d[i+1]; a[k++] = d[i+2]; }
    return a;
  })()`;
  let ok = true;
  for (const [scene, biome] of [['dune', 'dune'], ['tide', 'abyss'], ['jelly', 'lumen'], ['mixed', 'kiln'], ['dissolve', 'dune']]) {
    const grab = async (bug) => {
      // motes=0: the dissolve garnish is seeded from Math.random and stepped by
      // the real frame dt, so a dissolving board is the one thing ?t= cannot
      // pin. Without this the dissolve scene differs from ITSELF and the check
      // reads as a fault in a change that never touched it.
      const q = new URLSearchParams({ preserve: '1', dpr: '1', scene, biome, anim: '0', bot: '0', t: '6', seed: '7', motes: '0' });
      if (bug) q.set('staticbug', '1');
      if (falsify) q.set('sandbug', '1');
      await cdp.goto(`${base}/dev/gfx.html?${q}`);
      if (!await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000)) return null;
      await cdp.frames(6);
      return cdp.eval(GRAB);
    };
    const A = await grab(false), B = await grab(true);
    if (!A || !B) { console.log('  %s: never became ready (FAIL)', scene); ok = false; continue; }
    let n = 0, max = 0;
    for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d) { n++; if (d > max) max = d; } }
    const pass = n === 0;
    if (!pass) ok = false;
    console.log('  %s/%s %s of %d subpixels differ from the old renderer, worst %d (%s)',
      scene.padEnd(8), biome.padEnd(6), String(n).padStart(7), A.length, max, pass ? 'PASS' : 'FAIL');
  }
  console.log('sand-untouched gate: %s', ok ? 'PASS' : 'FAIL');
  return ok;
}


const { cdp, base, close } = await harness({ gpu: !!args.gpu });
let failed = false;
try {
  await cdp.viewport(W, H, 1, true);
  const tag = args.tag ? args.tag + '_' : '';

  if (args.check) {
    if (!await vflipGate(cdp, base)) failed = true;
    const fudge = args.falsify === 'rect' ? 0.985 : 0;
    // 390x844 letterboxes the board VERTICALLY (a real phone); 900x520 letterboxes
    // it HORIZONTALLY. One shape alone leaves two of the four edges untested,
    // and the bottom and the sides were both wrong.
    let rectOk = true;
    for (const vp of [[390, 844], [900, 520]]) {
      if (!await boardRectGate(cdp, base, fudge, vp)) rectOk = false;
    }
    await cdp.viewport(W, H, 1, true);
    if (fudge) {
      // the falsification arm passes only when the gate goes RED
      console.log('falsify=rect: gate went %s (%s)', rectOk ? 'GREEN' : 'RED', rectOk ? 'FAIL — the gate is not evidence' : 'PASS');
      if (rectOk) failed = true;
    } else if (!rectOk) failed = true;

    const thinArm = args.falsify === 'thin';
    const thinOk = await thinSceneryGate(cdp, base, thinArm);
    if (thinArm) {
      console.log('falsify=thin: gate went %s (%s)', thinOk ? 'GREEN' : 'RED',
        thinOk ? 'FAIL — the gate is not evidence' : 'PASS');
      if (thinOk) failed = true;
    } else if (!thinOk) failed = true;

    const sandArm = args.falsify === 'sand';
    const sandOk = await sandUntouchedGate(cdp, base, sandArm);
    if (sandArm) {
      console.log('falsify=sand: gate went %s (%s)', sandOk ? 'GREEN' : 'RED',
        sandOk ? 'FAIL — the gate is not evidence' : 'PASS');
      if (sandOk) failed = true;
    } else if (!sandOk) failed = true;
    if (!args.all && !args.scene && !args.perf) jobs.length = 0;
  }

  for (const j of jobs) {
    const q = new URLSearchParams({
      preserve: '1', dpr: '1', scene: j.scene, biome: j.biome,
      anim: args.anim ? '1' : '0', bot: '0', seed: String(args.seed || 7),
    });
    if (args.q) q.set('q', args.q);
    if (args.dt) q.set('dt', args.dt);
    if (args.tint) q.set('tint', args.tint);
    for (const k of ['ptint', 'fill', 'py', 'ticks', 'tints']) if (args[k]) q.set(k, args[k]);
    // Pin the renderer clock so two captures of the same build are the same
    // image. Without it the haze, motes and grain move between runs and any
    // diff measures dust. --anim wants motion, so it opts out.
    if (!args.anim) q.set('t', String(args.t || 6.0));

    await cdp.goto(`${base}/dev/gfx.html?${q}`);
    const ok = await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000);
    if (!ok) { console.log(`  !! ${j.scene}/${j.biome} never became ready`); continue; }
    if (!args.panel) await cdp.eval('window.__gfx.hidePanel()');
    await cdp.frames(+(args.frames || 8));

    const file = join(SHOTS, `${tag}${j.scene}_${j.biome}.png`);
    await cdp.capture(file, '#gl');
    console.log(`  ${j.scene.padEnd(9)} ${j.biome.padEnd(6)} -> shots/${tag}${j.scene}_${j.biome}.png`);
  }

  if (args.perf) {
    const q = new URLSearchParams({
      preserve: '1', dpr: '1', scene: args.scene || 'mixed', biome: args.biome || 'dune', bot: '1', seed: '7',
    });
    if (args.q) q.set('q', args.q);
    await cdp.goto(`${base}/dev/gfx.html?${q}`);
    await cdp.waitFor('window.__gfx && window.__gfx.ready', 60000);
    await cdp.frames(90);            // let the tier probe settle first
    await cdp.eval('window.__gfx.R.stats && 1');
    await cdp.frames(200);
    const s = await cdp.eval('JSON.stringify(window.__gfx.stats())');
    const st = JSON.parse(s);
    console.log('\nperf  (%s, %dx%d dpr1, %s)', args.gpu ? 'ANGLE Metal' : 'SwiftShader — numbers are NOT device-representative', W, H, st.tier);
    for (const k of ['fps', 'frameMs', 'frameP95', 'cpuP95', 'gpuP95', 'gpuSupported', 'uploadMs', 'passes', 'motes', 'verdict']) {
      console.log('  %s %s', String(k).padEnd(13), typeof st[k] === 'number' ? st[k].toFixed(2) : st[k]);
    }
  }

  const errs = cdp.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) { console.log('\nconsole errors:'); errs.slice(0, 12).forEach((e) => console.log('  ' + e)); }
  else console.log('\nno console errors');
  const off = cdp.offOrigin(base);
  console.log(off.length ? `OFF-ORIGIN REQUESTS: ${off.join(', ')}` : 'no off-origin requests');
} catch (e) {
  // process.exit() in finally kills the process before an uncaught throw prints,
  // which reads as a silent success. Never let that happen again.
  console.error('gfx_shot failed:', e && e.stack || e);
  failed = true;
} finally {
  close();
  process.exit(failed ? 1 : 0);
}
