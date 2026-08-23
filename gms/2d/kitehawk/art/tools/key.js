// Ported verbatim from gms/2d/sunderfall/art/tools/ (ART.md §7: port, do not rewrite).
// Cut a Flux "isolated on a flat grey background" render down to real alpha.
//
// Flat-key, then a border flood fill so interior areas that happen to match the backdrop
// stay opaque, then colour decontamination (unmix the backdrop out of the soft edge) —
// without that last step every cutout wears a pale halo the moment it sits on a dark scene.
const { Img, readPNG, writePNG, trim } = require('./img.js');

function estimateBg(img, patch = 24) {
  const samples = [];
  const corners = [[0, 0], [img.w - patch, 0], [0, img.h - patch], [img.w - patch, img.h - patch]];
  for (const [cx, cy] of corners)
    for (let y = cy; y < cy + patch; y++)
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * img.w + x) * 4;
        samples.push([img.data[i], img.data[i+1], img.data[i+2]]);
      }
  const med = c => { const s = samples.map(v => v[c]).sort((a, b) => a - b); return s[s.length >> 1]; };
  return [med(0), med(1), med(2)];
}

/**
 * opts: { bg, lo, hi, mode:'flat'|'luma'|'dark', fillHoles, erode, decontam, shrink }
 *  flat — key against a uniform backdrop colour (default, for grey-background renders)
 *  luma — alpha = brightness (for glow art rendered on black; keeps additive sources clean)
 *  dark — key against black
 */
function key(img, opts = {}) {
  const mode = opts.mode || 'flat';
  const out = new Img(img.w, img.h);
  const n = img.w * img.h;
  const alpha = new Float32Array(n);

  if (mode === 'invluma') {
    // silhouette art: dark = solid, light = gone. Survives a non-uniform backdrop,
    // which a flat key does not — Flux likes to paint a glow behind a canopy.
    const lo = opts.lo ?? 60, hi = opts.hi ?? 165;
    for (let i = 0; i < n; i++) {
      const r = img.data[i*4], g = img.data[i*4+1], b = img.data[i*4+2];
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      const a = Math.max(0, Math.min(1, (hi - l) / (hi - lo)));
      out.data[i*4] = r; out.data[i*4+1] = g; out.data[i*4+2] = b;
      out.data[i*4+3] = Math.round(a * 255);
    }
    return out;
  }

  if (mode === 'luma' || mode === 'dark') {
    const lo = opts.lo ?? 8, hi = opts.hi ?? 90;
    for (let i = 0; i < n; i++) {
      const r = img.data[i*4], g = img.data[i*4+1], b = img.data[i*4+2];
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      alpha[i] = Math.max(0, Math.min(1, (l - lo) / (hi - lo)));
      // keep full-strength colour; only the coverage varies
      out.data[i*4] = r; out.data[i*4+1] = g; out.data[i*4+2] = b;
    }
    for (let i = 0; i < n; i++) out.data[i*4+3] = Math.round(alpha[i] * 255);
    return out;
  }

  const bg = opts.bg || estimateBg(img);
  const lo = opts.lo ?? 12, hi = opts.hi ?? 40;
  for (let i = 0; i < n; i++) {
    const dr = img.data[i*4] - bg[0], dg = img.data[i*4+1] - bg[1], db = img.data[i*4+2] - bg[2];
    const d = Math.sqrt(dr*dr + dg*dg + db*db);
    alpha[i] = Math.max(0, Math.min(1, (d - lo) / (hi - lo)));
  }

  if (opts.fillHoles !== false) {
    // Only background connected to the frame edge is really background.
    const bgMask = new Uint8Array(n);
    const stack = [];
    const push = i => { if (!bgMask[i] && alpha[i] < 0.5) { bgMask[i] = 1; stack.push(i); } };
    for (let x = 0; x < img.w; x++) { push(x); push((img.h - 1) * img.w + x); }
    for (let y = 0; y < img.h; y++) { push(y * img.w); push(y * img.w + img.w - 1); }
    while (stack.length) {
      const i = stack.pop(), x = i % img.w, y = (i / img.w) | 0;
      if (x > 0) push(i - 1);
      if (x < img.w - 1) push(i + 1);
      if (y > 0) push(i - img.w);
      if (y < img.h - 1) push(i + img.w);
    }
    // Enclosed background (gaps between trunks) must stay transparent — only fill
    // pockets small enough to be keying noise.
    const maxHole = Math.round(n * (opts.maxHole ?? 0.00008));
    const seen = new Uint8Array(n);
    for (let start = 0; start < n; start++) {
      if (seen[start] || bgMask[start] || alpha[start] >= 0.5) continue;
      const comp = [start]; seen[start] = 1;
      for (let p = 0; p < comp.length; p++) {
        const i = comp[p], x = i % img.w, y = (i / img.w) | 0;
        const nb = [x > 0 ? i-1 : -1, x < img.w-1 ? i+1 : -1, y > 0 ? i-img.w : -1, y < img.h-1 ? i+img.w : -1];
        for (const j of nb) if (j >= 0 && !seen[j] && !bgMask[j] && alpha[j] < 0.5) { seen[j] = 1; comp.push(j); }
      }
      if (comp.length <= maxHole) for (const i of comp) alpha[i] = 1;
    }
  }

  const shrink = opts.shrink ?? 0.0;   // pull the matte in slightly to bite off leftover fringe
  for (let i = 0; i < n; i++) {
    let a = alpha[i];
    if (shrink) a = Math.max(0, Math.min(1, (a - shrink) / (1 - shrink)));
    let r = img.data[i*4], g = img.data[i*4+1], b = img.data[i*4+2];
    if (opts.decontam !== false && a > 0.004 && a < 0.996) {
      r = (r - (1 - a) * bg[0]) / a;
      g = (g - (1 - a) * bg[1]) / a;
      b = (b - (1 - a) * bg[2]) / a;
    }
    out.data[i*4]   = Math.max(0, Math.min(255, Math.round(r)));
    out.data[i*4+1] = Math.max(0, Math.min(255, Math.round(g)));
    out.data[i*4+2] = Math.max(0, Math.min(255, Math.round(b)));
    out.data[i*4+3] = Math.round(a * 255);
  }
  return out;
}

module.exports = { key, estimateBg };

if (require.main === module) {
  const [src, dst, ...rest] = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i].replace(/^--/, ''), v = rest[i+1];
    o[k] = isNaN(+v) ? v : +v;
  }
  let im = key(readPNG(src), o);
  if (o.trim !== undefined) im = trim(im, o.trim || 0).img;
  console.log(dst, im.w + 'x' + im.h, writePNG(dst, im, { forceAlpha: true }));
}
