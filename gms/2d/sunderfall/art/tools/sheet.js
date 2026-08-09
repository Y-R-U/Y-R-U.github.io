// Contact sheet: lay images out over a dark checker so alpha problems are visible.
//   node sheet.js out.png [--cell 320] [--cols 4] [--bg dark|checker|light] file...
const { Img, readPNG, writePNG, resize, composite } = require('./img.js');
const path = require('path');

const args = process.argv.slice(2);
const out = args.shift();
let cell = 320, cols = 4, bgMode = 'checker';
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cell') cell = +args[++i];
  else if (args[i] === '--cols') cols = +args[++i];
  else if (args[i] === '--bg') bgMode = args[++i];
  else files.push(args[i]);
}
const rows = Math.ceil(files.length / cols);
const pad = 8;
const W = cols * (cell + pad) + pad, H = rows * (cell + pad) + pad;
const sheet = new Img(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  let v = 24;
  if (bgMode === 'checker') v = (((x >> 4) + (y >> 4)) & 1) ? 34 : 18;
  else if (bgMode === 'light') v = 200;
  sheet.data[i] = v; sheet.data[i+1] = v; sheet.data[i+2] = v + (bgMode === 'light' ? 0 : 6); sheet.data[i+3] = 255;
}
files.forEach((f, k) => {
  const im = readPNG(f);
  const s = Math.min(cell / im.w, cell / im.h);
  const sm = resize(im, Math.max(1, Math.round(im.w * s)), Math.max(1, Math.round(im.h * s)));
  const cx = pad + (k % cols) * (cell + pad) + ((cell - sm.w) >> 1);
  const cy = pad + Math.floor(k / cols) * (cell + pad) + ((cell - sm.h) >> 1);
  composite(sheet, sm, cx, cy);
});
writePNG(out, sheet);
console.log(out, W + 'x' + H, files.map(f => path.basename(f)).join(' '));
