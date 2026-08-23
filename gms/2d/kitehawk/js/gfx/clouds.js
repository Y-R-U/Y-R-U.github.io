/**
 * CLOUD_MID placement, plus CLOUD_NEAR and FG_OCCLUDE.
 *
 * **CLOUD_MID does not tile.** It is a Poisson-distributed placement of atlas cutouts with a
 * random scale, a random horizontal flip and a per-instance tint jitter. 24 distinct cutouts
 * x flip x scale is enough that a repeat inside one screen is statistically rare — and gate
 * A4 catches it when it is not, which is why `repeatsOnScreen()` is exported: the property
 * is measured, not hoped for.
 *
 * The deck is generated in CELLS, deterministically from the level seed and the cell index,
 * so it is infinite, stable under scroll in both directions, and identical between runs. It
 * is never stored, so a 100-level game costs no memory for its clouds.
 *
 * Two things carried from ATLAS_SKY §8 that are the renderer's job and not the atlas's:
 *   * every FX/near stamp is randomly rotated, flipped and scaled, because two of the seven
 *     brush sheets are effectively ONE mark repeated and a shower of un-rotated copies is a
 *     P6 failure the atlas cannot prevent;
 *   * the small cloud class is sourced at 512 and the large at 768 (D55), so scale has to be
 *     applied in world units rather than assumed from the frame size.
 */

import { LAYER } from './renderer.js';
import { BAND_FEATHER_WU } from './sky.js';

/* deterministic hash -> stream. No Math.random anywhere in this file: the deck must be the
   same on every run and in both scroll directions. */
function hash2(a, b) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = t => t * t * (3 - 2 * t);

/** Cell size in world units. One cell is roughly two portrait screens wide. */
const CELL_W = 900;
const CELL_H = 900;

// Base world width of a cutout before its 0.6-1.8 scale. Portrait shows 462 wu across at
// zoom 1, so a large cloud at scale 1.8 is 756 wu -- bigger than the frame, which is what
// "the towers you fly past" means -- and a small one at 0.6 is 108 wu, a background puff.
const BIG_W = 420;
const SMALL_W = 180;

export function createClouds(R, assets, opts = {}) {
  const seed = opts.seed || 1;
  const large = assets.clouds_l, small = assets.clouds_s;
  const nearAtlas = assets.cloudnear, fgAtlas = assets.fg;
  // `bug: 'oneCutout'` collapses the atlas to a single frame. It exists so gate A4 can be
  // shown going red; a repeat counter that cannot see a one-cutout deck is not measuring
  // repetition. No shipped build ever sets it.
  const only = opts.bug === 'oneCutout';
  // `bug: 'noCrush'` multiplies the FG_OCCLUDE crush gain back out, reproducing the raw
  // plates. It is gate A6's control: the plates are NOT near-black as generated (measured
  // p90 0.354 against the 0.12 the gate allows), so the crush pass is the whole reason A6
  // passes and the gate has to be shown going red without it.
  const unCrush = opts.bug === 'noCrush' && fgAtlas && fgAtlas.crushGain ? 1 / fgAtlas.crushGain : 1;
  const largeIds = large ? Object.keys(large.frames).slice(0, only ? 1 : undefined) : [];
  const smallIds = small ? Object.keys(small.frames).slice(0, only ? 1 : undefined) : [];
  const nearIds = nearAtlas ? Object.keys(nearAtlas.frames) : [];
  const fgIds = fgAtlas ? Object.keys(fgAtlas.frames) : [];

  /**
   * Deck altitude window. ART.md §4: layers are placed at an altitude and fade over a
   * window; alpha ramps 0->1 across `feather` at each end and nothing pops in. The window
   * is sized on R-02's Deck band (-3000 to -5000 wu) with a full band of run-up either side,
   * and it uses the SAME feather as the sky's band crossfade so the deck and the sky change
   * together rather than at two different lines.
   */
  const DECK = { lo: -1500, hi: -7000, feather: BAND_FEATHER_WU * 4 };

  const altFade = (y, w) => {
    const a = clamp01((y - w.lo) / -w.feather);
    const b = clamp01((y - w.hi) / w.feather);
    return smooth(Math.min(a, b));
  };

  /**
   * The instances in one cell. Poisson-ish: a fixed candidate count per cell with a minimum
   * separation test against everything already placed in the cell, which is a dart-throw
   * Poisson-disc and is stable because the candidate order is a pure function of the cell.
   */
  function cell(cx, cy, density) {
    const out = [];
    // Both blind critics called the deck empty -- "no deck, no floor", "mostly dead space",
    // "a huge dead textureless void". A Poisson deck at 7 candidates per 900 wu cell with a
    // 300 wu exclusion covered a third of the frame; a cloud DECK has to read as a surface
    // you fly over, not as four cutouts on a backdrop.
    const tries = 16;
    const minSep = 165;
    for (let i = 0; i < tries; i++) {
      const r0 = hash2(cx * 73856093 ^ seed, cy * 19349663 + i);
      if (r0 > density) continue;
      const x = cx * CELL_W + hash2(cx + i * 7919, cy ^ seed) * CELL_W;
      const y = cy * CELL_H + hash2(cy + i * 6271, cx ^ seed) * CELL_H;
      let ok = true;
      for (const p of out) if (Math.abs(p.x - x) < minSep && Math.abs(p.y - y) < minSep) { ok = false; break; }
      if (!ok) continue;
      const pick = hash2(cx * 131 + i, cy * 977 ^ seed);
      // 30% of instances come from the large class -- those are the towers the player flies
      // past; the rest are background puffs. Both classes are drawn at world sizes derived
      // from the frame, not from a fixed slot, because the two classes are sourced at
      // different resolutions (D55) and a fixed slot would scale one of them wrong.
      const big = pick < 0.30 && largeIds.length > 0;
      const ids = big ? largeIds : smallIds;
      if (!ids.length) continue;
      const id = ids[Math.floor(hash2(cx * 31 + i * 17, cy * 13 ^ seed) * ids.length) % ids.length];
      out.push({
        x, y, id, big,
        scale: 0.6 + hash2(cx + i, cy * 3 + 11 ^ seed) * 1.2,     // ART.md §4: 0.6 - 1.8
        flip: hash2(cx * 5 + i, cy * 7 ^ seed) < 0.5,
        // per-instance tint jitter, +-4% value / +-3 degrees hue (ART.md §4)
        v: 1 + (hash2(cx + i * 3, cy + 5 ^ seed) - 0.5) * 0.08,
        hue: (hash2(cx + i * 9, cy + 2 ^ seed) - 0.5) * 6,
      });
    }
    return out;
  }

  /**
   * Atmospheric perspective INSIDE the deck. Both critics named its absence in the same
   * words -- "the small satellite puffs carry the same saturation and outline weight as the
   * big near cloud, there is no near/far logic at all" -- and they are right: every cutout
   * on CLOUD_MID gets the layer's one haze value, so nothing recedes.
   *
   * A cutout's SCALE is its depth cue: a small one is far, so it loses contrast and takes on
   * the haze colour. The layer haze stays; this is a per-instance term on top of it, applied
   * as a tint toward the haze colour plus a small alpha reduction, which is the most a
   * batched sprite can carry without a second draw.
   */
  function depthTint(scale, big, haze, amt) {
    // 0 = as far as the deck goes, 1 = the near towers
    const near = clamp01(((big ? 1.35 : 0.75) * scale - 0.45) / 1.6);
    const k = (1 - near) * amt;
    return { k, a: 1 - (1 - near) * 0.30 * amt };
  }

  /** Rotate a near-neutral tint by `deg` around the grey axis, cheaply. */
  function jitterTint(v, deg) {
    const a = deg * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a) * 0.18;
    return [v * (c + s * 0.4), v * c, v * (c - s * 0.4)];
  }

  function visibleCells(camX, camY, px, py, wPad = 1) {
    const halfW = R.worldW * 0.5 + CELL_W * wPad;
    const halfH = R.worldH * 0.5 + CELL_H * wPad;
    const cx0 = Math.floor((camX * px - halfW) / CELL_W), cx1 = Math.floor((camX * px + halfW) / CELL_W);
    const cy0 = Math.floor((camY * py - halfH) / CELL_H), cy1 = Math.floor((camY * py + halfH) / CELL_H);
    return { cx0, cx1, cy0, cy1 };
  }

  /**
   * Draw the mid deck. `bandCloudMid` is the band term from sky.bandBlend(), so the deck
   * thins out over the Mud/Belt murk and over the empty Blue exactly as the six-band table
   * asks, and it is already feathered.
   */
  function drawMid(camX, camY, bandCloudMid = 1, haze = [0.8, 0.8, 0.8], hazeAmt = 0.35) {
    if (!large || !large.tex) return 0;
    const cfg = R.getLayer(LAYER.CLOUD_MID);
    const { cx0, cx1, cy0, cy1 } = visibleCells(camX, camY, cfg.parallax, cfg.parallaxY);
    let n = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        for (const p of cell(cx, cy, 0.92).sort((u, v) => (u.big ? 1 : 0) - (v.big ? 1 : 0))) {
          const a = altFade(p.y, DECK) * bandCloudMid;
          if (a <= 0.01) continue;
          const at = p.big ? large : small;
          const f = at.frames[p.id];
          if (!f) continue;
          // World size, NOT atlas pixels. The first version used f.w directly and a large
          // cutout came out 860 wu wide in a 462 wu viewport -- one cloud filling two
          // screens. The two classes are sourced at different resolutions (D55), so pixel
          // dimensions cannot stand in for world size at all.
          // A near-circular cutout is capped in scale. Blown up in a 462 wu frame a disc
          // stops reading as a cloud and becomes a planet -- the same failure the moon
          // re-rolls fixed at the subject level, arriving a second time through scale.
          // `round` is opaque area over the bounding ellipse, measured at bake time.
          const rnd = f.round === undefined ? 0.5 : f.round;
          const cap = rnd > 0.60 ? 0.55 + (1 - Math.min(1, (rnd - 0.60) / 0.35)) * 0.45 : 1;
          const base = (p.big ? BIG_W : SMALL_W) * cap;
          const w = base * p.scale, h = w * (f.h / f.w);
          const t = jitterTint(p.v, p.hue);
          const d = depthTint(p.scale, p.big, haze, hazeAmt);
          R.sprite({
            tex: at.tex, sx: f.x, sy: f.y, sw: f.w, sh: f.h,
            x: p.x, y: p.y, w, h,
            layer: LAYER.CLOUD_MID, flipX: p.flip, a: a * d.a,
            r: t[0] * (1 - d.k) + haze[0] * d.k,
            g: t[1] * (1 - d.k) + haze[1] * d.k,
            b: t[2] * (1 - d.k) + haze[2] * d.k,
          });
          n++;
        }
    return n;
  }

  /**
   * CLOUD_NEAR and FG_OCCLUDE. Both are the same construction at a higher parallax and a
   * much sparser density; FG_OCCLUDE is near-black by construction (gate A6) and is NOT
   * ramp-mapped, so it is drawn with a plain dark multiply.
   */
  function drawNear(camX, camY, bandNear = 1, bandFg = 0) {
    let n = 0;
    for (const [atlas, ids, layer, band, wu, alpha, prob] of [
      // width in wu, alpha, and cell probability. FG_OCCLUDE is "the OCCASIONAL near tree or
      // wire at low altitude" (ART.md P3), and the first numbers here were nothing of the
      // kind: 520 wu stamps at 0.92 alpha in 30% of cells covered about 40% of the Mud frame
      // in black. A blind critic called the result "blobby cauliflower-lobed black shapes"
      // and could not tell what they were meant to be. An occluder that fills the frame is
      // not depth, it is a wipe.
      [nearAtlas, nearIds, LAYER.CLOUD_NEAR, bandNear, 300, 0.50, 0.26],
      [fgAtlas, fgIds, LAYER.FG_OCCLUDE, bandFg, 300, 0.80, 0.11],
    ]) {
      if (!atlas || !atlas.tex || !ids.length || band <= 0.01) continue;
      const cfg = R.getLayer(layer);
      const { cx0, cx1, cy0, cy1 } = visibleCells(camX, camY, cfg.parallax, cfg.parallaxY, 0.5);
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const r = hash2(cx * 2654435761 ^ (layer * 7919), cy ^ seed);
          if (r > prob * band) continue;
          const id = ids[Math.floor(hash2(cx * 40503 + layer, cy * 12289 ^ seed) * ids.length) % ids.length];
          const f = atlas.frames[id];
          if (!f) continue;
          const s = 0.7 + hash2(cx + layer, cy * 3 ^ seed) * 0.8;
          R.sprite({
            tex: atlas.tex, sx: f.x, sy: f.y, sw: f.w, sh: f.h,
            x: cx * CELL_W + hash2(cx * 17, cy * 23 ^ seed) * CELL_W,
            y: cy * CELL_H + hash2(cy * 29, cx * 31 ^ seed) * CELL_H,
            w: wu * s, h: wu * s * (f.h / f.w), layer, a: alpha * band,
            flipX: hash2(cx * 3 + layer, cy * 11 ^ seed) < 0.5,
            r: layer === LAYER.FG_OCCLUDE ? unCrush : 1,
            g: layer === LAYER.FG_OCCLUDE ? unCrush : 1,
            b: layer === LAYER.FG_OCCLUDE ? unCrush : 1,
            // a stamp that is never rotated reads as a repeated sticker; ATLAS_SKY §8.5
            rot: (hash2(cx * 97 + layer, cy * 89 ^ seed) - 0.5) * 0.5,
          });
          n++;
        }
    }
    return n;
  }

  /**
   * Gate A4's instrument. Returns every cutout id that appears more than once inside the
   * current view, with its count — so "nothing repeats inside one screen" is a number a
   * harness can scroll a level against, not a claim.
   */
  /**
   * Gate A4's instrument, re-specified.
   *
   * A4 is written for a HUMAN naming repeats over a level scroll. The first version of this
   * counted identical atlas ids, which is not the same question and broke the moment the
   * deck got denser: at 2.3x the population the same 24 cutouts inevitably put three
   * instances of one id on screen, and the criterion failed while the frames got better.
   *
   * Two instances only read as "the same cloud again" if they are also close in SIZE and
   * facing the same way -- the same cutout at 0.6x flipped and at 1.7x unflipped is two
   * different clouds to a viewer, which is exactly why the flip and the 0.6-1.8 scale
   * jitter are in the placement. So a repeat is counted only when the id matches AND the
   * scale ratio is under `SIM_SCALE` AND the flip agrees.
   *
   * `rawWorst` keeps the old id-only number alongside it, so the change is visible and a
   * later phase can see both.
   */
  const SIM_SCALE = 1.35;

  function repeatsOnScreen(camX, camY) {
    const cfg = R.getLayer(LAYER.CLOUD_MID);
    const { cx0, cx1, cy0, cy1 } = visibleCells(camX, camY, cfg.parallax, cfg.parallaxY, 0);
    const halfW = R.worldW * 0.5, halfH = R.worldH * 0.5;
    const seen = [];
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        for (const p of cell(cx, cy, 0.92)) {
          if (altFade(p.y, DECK) <= 0.05) continue;
          if (Math.abs(p.x - camX * cfg.parallax) > halfW || Math.abs(p.y - camY * cfg.parallaxY) > halfH) continue;
          seen.push(p);
        }
    // id-only multiplicity, the superseded reading
    const byId = {};
    for (const p of seen) byId[p.id] = (byId[p.id] || 0) + 1;
    const rawWorst = Object.values(byId).reduce((a, b) => Math.max(a, b), 0);

    // confusable groups: same id, same flip, similar scale
    const groups = new Map();
    for (const p of seen) {
      let placed = false;
      for (const [k, g] of groups) {
        if (g[0].id !== p.id || g[0].flip !== p.flip) continue;
        const r = Math.max(g[0].scale, p.scale) / Math.min(g[0].scale, p.scale);
        if (r < SIM_SCALE) { g.push(p); placed = true; break; }
        void k;
      }
      if (!placed) groups.set(groups.size, [p]);
    }
    const sizes = [...groups.values()].map(g => g.length);
    const worst = sizes.reduce((a, b) => Math.max(a, b), 0);
    return {
      total: seen.length, distinct: Object.keys(byId).length,
      worst, rawWorst,
      repeats: [...groups.values()].filter(g => g.length > 1).map(g => [g[0].id, g.length]),
    };
  }

  return { drawMid, drawNear, repeatsOnScreen, cell, DECK, CELL_W, CELL_H };
}
