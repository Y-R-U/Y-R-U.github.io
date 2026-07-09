import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

export function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function M(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...opts });
}
export function mesh(geo, mat, x = 0, y = 0, z = 0, shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadows) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}

// text sprite (labels above hotspots / cars)
export function textSprite(text, { size = 44, color = '#fff', bg = 'rgba(8,12,10,.6)', scale = 2.2 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = `800 ${size}px -apple-system, "Segoe UI", sans-serif`;
  const w = Math.min(500, g.measureText(text).width + 56);
  if (bg) {
    g.fillStyle = bg;
    g.beginPath(); g.roundRect((512 - w) / 2, 24, w, 76, 38); g.fill();
  }
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(scale, scale / 4, 1);
  return sp;
}

// circle-vs-OBB (rect rotated by rot at cx,cz halfext hw,hh). Returns push
// vector {x,z} to move the circle out, or null.
export function circleOBB(px, pz, r, box) {
  const s = Math.sin(-box.rot), c = Math.cos(-box.rot);
  const dx = px - box.x, dz = pz - box.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = clamp(lx, -box.hw, box.hw), qz = clamp(lz, -box.hh, box.hh);
  const ex = lx - qx, ez = lz - qz;
  const d2 = ex * ex + ez * ez;
  if (d2 > r * r) return null;
  let nx, nz, depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nx = ex / d; nz = ez / d; depth = r - d;
  } else {
    // centre inside the box: push out the nearest face
    const ox = box.hw - Math.abs(lx), oz = box.hh - Math.abs(lz);
    if (ox < oz) { nx = Math.sign(lx) || 1; nz = 0; depth = ox + r; }
    else { nx = 0; nz = Math.sign(lz) || 1; depth = oz + r; }
  }
  const wc = Math.cos(box.rot), ws = Math.sin(box.rot);
  return { x: (nx * wc - nz * ws) * depth, z: (nx * ws + nz * wc) * depth, nx: nx * wc - nz * ws, nz: nx * ws + nz * wc };
}

export const fmtCash = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
