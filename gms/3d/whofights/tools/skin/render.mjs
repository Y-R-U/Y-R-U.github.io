#!/usr/bin/env node
// Renders the dummy wearing a skin, headless, to a contact sheet of four views. This is the only
// honest check on a generated texture: the sheet can look like a lovely drawing and still put the
// face on an elbow, and nothing but a render says which.
//
//   node tools/skin/render.mjs --skin=art/skins/knight_s11.png --out=shots/skin/knight_s11
//   node tools/skin/render.mjs --skin=art/skin/uv_guide.png --shape=f      ← the unwrap check
//   node tools/skin/render.mjs --all                                        ← every skin, one row each

import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs } from '../shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs();
const VIEWS = ['front', 'left', 'back', 'right'];
const W = +(args.w || 420), H = +(args.h || 620);

const skins = args.all
  ? readdirSync(resolve(ROOT, 'art/skins')).filter(f => f.endsWith('.png') && !f.endsWith('_raw.png')).map(f => `art/skins/${f}`)
  : [args.skin || 'art/skin/uv_guide.png'];

const page = await open({ w: W, h: H, dpr: 1 });
const { S, base } = page;

async function waitReady(ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const r = await S('Runtime.evaluate', { expression: 'window.__wfSkinBench?.ready === true', returnByValue: true });
    if (r.result?.value) return;
    if (Date.now() - t0 > ms) {
      for (const l of page.logs) console.error('  ' + l);
      throw new Error('bench never became ready — see the console lines above');
    }
    await new Promise(r2 => setTimeout(r2, 200));
  }
}

for (const skin of skins) {
  const name = args.out || `shots/skin/${skin.split('/').pop().replace(/\.png$/, '')}`;
  for (const shape of (args.shape ? [args.shape] : ['m', 'f'])) {
    const tiles = [];
    for (const v of VIEWS) {
      const url = `${base}/js/dev/skin/bench.html?skin=${encodeURIComponent(`${base}/${skin}`)}&shape=${shape}&view=${v}`;
      await S('Page.navigate', { url });
      await waitReady();
      // The bench's own HUD prints the full skin URL, which wraps across the top of every tile.
      await S('Runtime.evaluate', { expression:
        `document.getElementById('hud').textContent = ${JSON.stringify(`${shape} · ${skin.split('/').pop()} · ${v}`)}` });
      // The texture decodes after ready; two frames of settling beats a blank first tile.
      await new Promise(r => setTimeout(r, 450));
      const shot = await S('Page.captureScreenshot', { format: 'png' });
      tiles.push(Buffer.from(shot.data, 'base64'));
    }
    const out = resolve(ROOT, `${name}_${shape}`);
    mkdirSync(dirname(out), { recursive: true });
    tiles.forEach((b, i) => writeFileSync(`${out}_${VIEWS[i]}.png`, b));
    writeFileSync(`${out}.png`, await stitch(tiles));
    console.log(`${name}_${shape}.png  (${VIEWS.join(' ')})`);
  }
}

await page.close();

// A four-up strip, so one Read call shows every side of the model instead of four.
async function stitch(tiles) {
  const { Canvas } = await import('./raster.mjs');
  const { readPNG } = await import('./raster.mjs');
  const imgs = tiles.map(t => readPNG(t));
  const w = imgs.reduce((s, i) => s + i.w, 0), h = Math.max(...imgs.map(i => i.h));
  const cv = new Canvas(w, h, [12, 16, 22, 255]);
  let x = 0;
  for (const im of imgs) {
    for (let y = 0; y < im.h; y++) for (let i = 0; i < im.w; i++) {
      const k = (y * im.w + i) * 4;
      cv.px(x + i, y, [im.d[k], im.d[k + 1], im.d[k + 2]]);
    }
    x += im.w;
  }
  return cv.png();
}
