// Stack a location's bands the way the game will, so the composition can be judged.
//   node preview.js sunderwood [outfile] [--cam 600] [--w 1920]
const fs = require('fs');
const path = require('path');
const { Img, readPNG, readImage, writePNG, resize, composite } = require('./img.js');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, '..', 'game', 'assets');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'work', 'bg_manifest.json')));

const loc = process.argv[2];
const out = process.argv[3] || path.join(ROOT, 'work', `preview_${loc}.png`);
const argCam = process.argv.indexOf('--cam');
const camX = argCam > 0 ? +process.argv[argCam + 1] : 700;
const VIEW_W = 1920, VIEW_H = 1080, SCALE = 0.5;
const camY = -400;                      // world point at screen centre

const W = Math.round(VIEW_W * SCALE), H = Math.round(VIEW_H * SCALE);
const view = Img.blank(W, H, 6, 8, 12, 255);

const worldToScreenYTop = wy => Math.round((wy - camY + VIEW_H / 2) * SCALE);
for (const b of man[loc].bands) {
  const tex = readImage(path.join(ASSETS, b.image));
  const dw = Math.round(b.worldW * SCALE), dh = Math.round(b.worldH * SCALE);
  const scaled = resize(tex, dw, dh);
  // world -> screen, with the band's own parallax shift
  const shift = camX * (1 - b.parallax);
  const worldToScreenX = wx => Math.round((wx - camX + VIEW_W / 2) * SCALE);
  const worldToScreenY = wy => Math.round((wy - camY + VIEW_H / 2) * SCALE);
  const y = worldToScreenY(b.anchorY);
  let x0 = worldToScreenX(shift);
  while (x0 > 0) x0 -= dw;
  for (let x = x0; x < W; x += dw) composite(view, scaled, x, y);
}
// a stand-in ground plane so the band bottoms are not judged in mid air
for (let y = Math.max(0, worldToScreenYTop(0)); y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    view.data[i] = 12; view.data[i+1] = 14; view.data[i+2] = 16; view.data[i+3] = 255;
  }
writePNG(out, view);
console.log(out, W + 'x' + H);
