// Shelf packer. Entries keep an anchor (ax, ay) measured in the trimmed frame's pixels,
// so the game can position a sprite by its feet/pivot rather than its top-left.
const { Img, composite, writeSmallest, writePNG } = require('./img.js');

function pack(entries, opts = {}) {
  const pad = opts.padding ?? 2;
  const maxW = opts.width ?? 2048;
  const list = entries.slice().sort((a, b) => b.img.h - a.img.h);
  let x = pad, y = pad, shelfH = 0, usedW = 0;
  const placed = [];
  for (const e of list) {
    const w = e.img.w, h = e.img.h;
    if (w + pad * 2 > maxW) throw new Error(`frame ${e.id} (${w}px) wider than atlas ${maxW}`);
    if (x + w + pad > maxW) { x = pad; y += shelfH + pad; shelfH = 0; }
    placed.push({ e, x, y });
    x += w + pad;
    usedW = Math.max(usedW, x);
    shelfH = Math.max(shelfH, h);
  }
  const H = y + shelfH + pad;
  const W = opts.tight ? nextMul(usedW, 4) : maxW;
  const sheet = new Img(W, nextMul(H, 4));
  const frames = {};
  for (const p of placed) {
    composite(sheet, p.e.img, p.x, p.y);
    frames[p.e.id] = {
      x: p.x, y: p.y, w: p.e.img.w, h: p.e.img.h,
      ax: Math.round(p.e.ax ?? p.e.img.w / 2),
      ay: Math.round(p.e.ay ?? p.e.img.h),
    };
  }
  return { image: sheet, frames };
}

const nextMul = (v, m) => Math.ceil(v / m) * m;

function write(dir, name, packed, useQuant = true) {
  const file = `${dir}/${name}.png`;
  const bytes = useQuant ? writeSmallest(file, packed.image) : writePNG(file, packed.image, { forceAlpha: true });
  return { image: `${name}.png`, w: packed.image.w, h: packed.image.h, bytes, frames: packed.frames };
}

module.exports = { pack, write };
