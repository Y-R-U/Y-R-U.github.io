// bake.js — the whole prop bake in one command: crop -> key -> poster -> trim.
//
//   node bake.js raw.png out.png [--maxdim 320] [--inset 0.04] [--seed 0] [--bands 5] ...
//
// `--preset mech` (default) or `--preset struct` picks the tuning; anything else on the command
// line is passed straight through to poster.js, so every knob in its DEFAULTS is reachable. `--inset` is ART.md §7 step 1's mandatory artefact crop —
// this model paints a cream paper mount, a signature and sometimes a caption, and cropping is the
// only thing that removes them (§8A). The backdrop colour key.js estimates is handed to poster.js,
// which needs it to find the cast shadow.
const path = require('path');
const { readPNG, writePNG, crop, trim } = require('./img.js');
const { key, estimateBg } = require('./key.js');
const { poster } = require('./poster.js');

function bake(raw, opts = {}) {
  const inset = opts.inset ?? 0.04;
  const cropped = inset > 0
    ? crop(raw, Math.round(raw.w * inset), Math.round(raw.h * inset),
           raw.w - 2 * Math.round(raw.w * inset), raw.h - 2 * Math.round(raw.h * inset))
    : raw;
  const bg = opts.bg || estimateBg(cropped);
  // NOTE on --maxHole. A grey prop on a grey backdrop keys with semi-transparent patches inside it
  // (the hangar's pale wall panels sit within a few units of the backdrop colour) and painted
  // ground shows through them. Raising key.js's hole-fill ceiling to 0.004 closes those — but it
  // ALSO fills genuine openwork, and a blind critic caught the result immediately: the supply
  // wagon's wheel-spoke gaps came back as backdrop grey and the split-tone turned them salmon pink.
  // Measured alpha histograms of enclosed non-opaque regions on the two subjects overlap almost
  // exactly, so no threshold separates "veil" from "real gap". It is therefore a PER-ASSET flag,
  // default off: use it on solid grey-on-grey subjects, never on anything with openwork.
  const keyed = key(cropped, { ...opts, bg });
  // --bypass gives the SAME crop/key/resize/trim with poster.js switched off, which is the only
  // honest "before" for a before/after: it isolates this one step.
  const { img, stats } = opts.bypass
    ? poster(keyed, { ...opts, bg, shadow: 0, speck: 0, bands: 2, dither: 0, temp: 0, ink: 0,
                      grain: 0, edge: 0, sat: 1, smooth: 0, detail: 1, bypass: 1 })
    : poster(keyed, { ...opts, bg });
  const t = trim(img, opts.pad ?? 2);
  return { img: t.img, off: t.off, bg, stats };
}

module.exports = { bake };

if (require.main === module) {
  const [src, dst, ...rest] = process.argv.slice(2);
  if (!src || !dst) { console.error('usage: node bake.js raw.png out.png [--maxdim 320] [...]'); process.exit(1); }
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i].replace(/^--/, ''), v = rest[i+1];
    o[k] = v === undefined || isNaN(+v) ? v : +v;
  }
  if (typeof o.bg === 'string') o.bg = o.bg.split(',').map(Number);
  const r = bake(readPNG(src), o);
  writePNG(dst, r.img, { forceAlpha: true });
  console.log(`${path.basename(dst)} ${r.img.w}x${r.img.h} bg=${r.bg} ${JSON.stringify(r.stats)}`);
}
