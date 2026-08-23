// trim.js — cut a keyed plate down to its content bbox and record the offset, plus the two
// component rules D57 asks for.
//
// `largest` keeps only the biggest connected opaque component. That one rule clears every
// stray artefact measured in this project: the sun and moon discs beside a cloud, the green
// grass strip under `h66`/`h67`, and `h68b`'s cast shadow (D58). It is cheaper and more
// reliable than re-rolling the plate.
//
// `components` is the opposite operation and is what cuts an FX sheet apart: return every
// component over a minimum area as its own frame. ATLAS_SKY §4 is explicit that these sheets
// must NOT be sliced on a grid — the layout is deliberately irregular and the delivered mark
// count is never the requested one.
//
//   node trim.js in.png out.png [--pad 2] [--largest 1]
//   node trim.js --split in.png outdir/prefix [--min 900] [--pad 2]
const { Img, readPNG, writePNG, trim: bboxTrim } = require('./img.js');

/** 8-connected components over alpha >= t. Returns [{px:[i], x0,y0,x1,y1, n}] biggest first. */
function components(img, t = 24, minPx = 1) {
  const n = img.w * img.h, seen = new Uint8Array(n), out = [];
  const a = i => img.data[i * 4 + 3] >= t;
  for (let s = 0; s < n; s++) {
    if (seen[s] || !a(s)) continue;
    const st = [s]; seen[s] = 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0;
    const px = [];
    while (st.length) {
      const i = st.pop(), x = i % img.w, y = (i / img.w) | 0;
      px.push(i); cnt++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
          const j = ny * img.w + nx;
          if (!seen[j] && a(j)) { seen[j] = 1; st.push(j); }
        }
    }
    if (cnt >= minPx) out.push({ px, x0, y0, x1, y1, n: cnt });
  }
  out.sort((p, q) => q.n - p.n);
  return out;
}

/** Zero every pixel not in the largest component. D57's general fix for stray furniture. */
function largestComponent(img, t = 24) {
  const comps = components(img, t);
  if (comps.length <= 1) return { img, dropped: 0, kept: comps[0] ? comps[0].n : 0 };
  const keep = new Uint8Array(img.w * img.h);
  for (const i of comps[0].px) keep[i] = 1;
  const out = new Img(img.w, img.h);
  out.data.set(img.data);
  let dropped = 0;
  for (let i = 0; i < img.w * img.h; i++)
    if (!keep[i] && out.data[i * 4 + 3]) { out.data[i * 4 + 3] = 0; dropped++; }
  return { img: out, dropped, kept: comps[0].n, comps: comps.length };
}

/** Cut a sheet apart into one image per component. */
function split(img, { min = 900, pad = 2, t = 24 } = {}) {
  return components(img, t, min).map((c, k) => {
    const w = c.x1 - c.x0 + 1 + pad * 2, h = c.y1 - c.y0 + 1 + pad * 2;
    const o = new Img(w, h);
    for (const i of c.px) {
      const x = i % img.w - c.x0 + pad, y = ((i / img.w) | 0) - c.y0 + pad;
      const s = i * 4, d = (y * w + x) * 4;
      o.data[d] = img.data[s]; o.data[d + 1] = img.data[s + 1];
      o.data[d + 2] = img.data[s + 2]; o.data[d + 3] = img.data[s + 3];
    }
    return { img: o, index: k, area: c.n, src: { x: c.x0, y: c.y0 } };
  });
}

function trimTo(img, { pad = 2, largest = false } = {}) {
  let dropped = 0;
  if (largest) { const r = largestComponent(img); img = r.img; dropped = r.dropped; }
  const t = bboxTrim(img, pad);
  return { img: t.img, off: t.off, dropped };
}

module.exports = { trimTo, largestComponent, components, split };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const o = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const v = argv[i + 1]; o[argv[i].slice(2)] = (v === undefined || v.startsWith('--')) ? 1 : (isNaN(+v) ? v : +v); if (v !== undefined && !v.startsWith('--')) i++; }
    else pos.push(argv[i]);
  }
  if (o.split) {
    const parts = split(readPNG(pos[0]), o);
    parts.forEach(p => {
      const f = `${pos[1]}${String(p.index).padStart(2, '0')}.png`;
      writePNG(f, p.img, { forceAlpha: true });
      console.log(`${f} ${p.img.w}x${p.img.h} area=${p.area}`);
    });
    console.log(`${parts.length} components`);
  } else {
    const r = trimTo(readPNG(pos[0]), o);
    writePNG(pos[1], r.img, { forceAlpha: true });
    console.log(`${pos[1]} ${r.img.w}x${r.img.h} off=${r.off.x},${r.off.y} dropped=${r.dropped}px`);
  }
}
