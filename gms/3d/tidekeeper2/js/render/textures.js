/* ═══════════════════════════════════════════════════════════════════════════
   TEXTURES
   The surface maps are photographs generated offline (assets/tex). They are
   not seamless, so everything uses MirroredRepeatWrapping, which hides the
   join at the cost of a mirror line no one has ever noticed underwater.

   Normal maps are DERIVED from the colour map here rather than shipped, which
   halves the download and means a replaced texture brings its own relief.
   Every load has a procedural fallback so a missing file can never stop the
   game booting.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { fbm, vnoise, clamp, lerp } from '../util.js';

const loader = new THREE.TextureLoader();
const cache = new Map();

function setup(tex, repeat = 1, srgb = true) {
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Load a photo map, falling back to a procedural one that looks plausible. */
export function photo(name, { repeat = 1, fallback = null, srgb = true } = {}) {
  const key = name + repeat;
  if (cache.has(key)) return cache.get(key);
  const fb = fallback ? fallback() : noiseTexture(0xe8e8e8, 0xb4b4b4, 5);
  const tex = setup(fb, repeat, srgb);
  cache.set(key, tex);
  loader.load(`assets/tex/${name}.jpg`,
    img => {
      /* take the loaded texture's Source wholesale — assigning .image to a
         texture that has already uploaded makes the driver try a partial
         update against the old dimensions */
      tex.dispose();
      tex.source = img.source;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      if (tex.userData.onLoad) tex.userData.onLoad(tex);
    },
    undefined,
    () => { /* keep the fallback; a missing texture must never be fatal */ });
  return tex;
}

/** A normal map derived from a colour map's luminance, built once it loads. */
export function derivedNormal(colourTex, strength = 1.6, repeat = 1) {
  /* start as a CanvasTexture, not a DataTexture: the real map is a canvas of a
     different size, and swapping a canvas into a DataTexture makes WebGL
     complain on every upload */
  const seed = document.createElement('canvas'); seed.width = seed.height = 4;
  const sg = seed.getContext('2d');
  sg.fillStyle = '#8080ff'; sg.fillRect(0, 0, 4, 4);
  const n = new THREE.CanvasTexture(seed);
  n.colorSpace = THREE.NoColorSpace;
  n.needsUpdate = true;
  n.wrapS = n.wrapT = THREE.MirroredRepeatWrapping;
  n.repeat.set(repeat, repeat);
  const build = () => {
    const img = colourTex.image;
    if (!img || !img.width) return;
    const S = Math.min(512, img.width);
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, S, S);
    const src = g.getImageData(0, 0, S, S).data;
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
    const out = g.createImageData(S, S);
    const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength * 4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength * 4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      out.data[i]     = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
    /* three caches uploads per Source, so assigning a differently sized image
       to the same source makes it try a partial update and fail. Swap the
       whole source instead. */
    n.dispose();
    n.source = new THREE.Source(c);
    n.needsUpdate = true;
  };
  if (colourTex.image && colourTex.image.width) build();
  else colourTex.userData.onLoad = build;
  return n;
}

/* ── procedural fallbacks ────────────────────────────────────────────────── */
function canvasTex(S, draw) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function noiseTexture(a, b, scale = 6, S = 256) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return canvasTex(S, (g, S) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = fbm(x / S * scale, y / S * scale, 5);
      const i = (y * S + x) * 4;
      img.data[i]     = lerp(ca.r, cb.r, n) * 255;
      img.data[i + 1] = lerp(ca.g, cb.g, n) * 255;
      img.data[i + 2] = lerp(ca.b, cb.b, n) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
export const sandFallback   = () => noiseTexture(0xffffff, 0xcfc6b6, 14);
export const gravelFallback = () => noiseTexture(0xf2eee6, 0x9d968a, 22);
export const slateFallback  = () => noiseTexture(0xf0f2ee, 0xa8aeaa, 9);
export const woodFallback   = () => noiseTexture(0xf6e6d2, 0xa98f74, 7);
export const wallFallback   = () => noiseTexture(0xf4f6f8, 0xc8ced4, 3);
export const oakFallback    = () => noiseTexture(0xf2e2ce, 0xa8875f, 4);

/** The one texture that is always procedural: a caustics tile we can animate
    by scrolling two copies of it over each other. */
export function causticTile(S = 256) {
  const t = canvasTex(S, (g, S) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let a = 0;
      for (let k = 0; k < 3; k++) {
        const f = 3 + k * 2.3, ph = k * 1.7;
        a += Math.sin((u * f + Math.sin(v * f * 1.3 + ph) * 0.6) * Math.PI * 2 + ph)
           * Math.sin((v * f + Math.sin(u * f * 1.1 - ph) * 0.6) * Math.PI * 2 - ph);
      }
      a = Math.pow(clamp(Math.abs(a) / 3, 0, 1), 2.4);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Small round sprite used for bubbles, food crumbs and marine snow. */
export function dotSprite(S = 64, soft = 0.42) {
  const t = canvasTex(S, (g, S) => {
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(soft, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
