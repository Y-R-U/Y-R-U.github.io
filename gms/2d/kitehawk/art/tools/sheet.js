// Contact sheet builder. Composites cutouts into a grid on a chosen ground so a human — or a blind
// critic (ART.md §9) — can look at a batch at once. §7 step 6 says an automated pass is not a look.
//
//   node sheet.js out.png a.png b.png c.png [--cols 4] [--cell 384] [--bg 234,229,218] [--pad 12]
//
// --bg accepts r,g,b or one of: paper, sky, night.
const path = require('path');
const { Img, readPNG, writePNG, resize, composite, trim } = require('./img.js');

const GROUNDS = { paper: [234, 229, 218], sky: [150, 168, 186], night: [26, 28, 42] };

function sheet(files, opts = {}) {
  const cell = opts.cell || 384;
  const pad = opts.pad ?? 12;
  const cols = opts.cols || Math.ceil(Math.sqrt(files.length));
  const rows = Math.ceil(files.length / cols);
  const bg = opts.bg || GROUNDS.paper;
  const W = cols * cell + (cols + 1) * pad;
  const H = rows * cell + (rows + 1) * pad;
  let out = Img.blank(W, H, bg[0], bg[1], bg[2], 255);
  if (opts.ground) {
    // Judge a cutout against painted terrain, not a swatch — a prop that reads fine on flat paper
    // can still look pasted on once it sits in the world.
    const g = readPNG(opts.ground);
    const s = Math.max(W / g.w, H / g.h);
    composite(out, resize(g, Math.ceil(g.w * s), Math.ceil(g.h * s)), 0, 0);
  }
  files.forEach((f, i) => {
    let im = readPNG(f);
    if (opts.trim !== false) im = trim(im, 2).img;
    const s = Math.min(cell / im.w, cell / im.h, opts.up ? Infinity : 1);
    if (s < 1 || opts.up) im = resize(im, Math.max(1, Math.round(im.w * s)), Math.max(1, Math.round(im.h * s)));
    const cx = pad + (i % cols) * (cell + pad) + Math.round((cell - im.w) / 2);
    const cy = pad + Math.floor(i / cols) * (cell + pad) + Math.round((cell - im.h) / 2);
    composite(out, im, cx, cy);
  });
  return out;
}

module.exports = { sheet, GROUNDS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const files = [];
  const o = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { o[args[i].slice(2)] = args[++i]; continue; }
    files.push(args[i]);
  }
  const dst = files.shift();
  const bg = o.bg ? (GROUNDS[o.bg] || o.bg.split(',').map(Number)) : GROUNDS.paper;
  const im = sheet(files, { cols: +o.cols || 0, cell: +o.cell || 384, pad: o.pad !== undefined ? +o.pad : 12, bg, up: o.up === '1', ground: o.ground });
  writePNG(dst, im);
  console.log(`${path.basename(dst)} ${im.w}x${im.h} (${files.length} cells)`);
}
