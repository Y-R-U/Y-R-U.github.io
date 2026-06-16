import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Shortest-path angle lerp (radians).
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Frame-rate independent smoothing factor.
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

// Floating name tag sprite.
export function makeNameSprite(text, y = 2.0) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 52px -apple-system, "Segoe UI", sans-serif';
  const w = g.measureText(text).width + 60;
  const x0 = (512 - w) / 2;
  g.fillStyle = 'rgba(10, 18, 8, 0.55)';
  g.beginPath();
  g.roundRect(x0, 22, w, 78, 39);
  g.fill();
  g.fillStyle = '#f6f2df';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.1, 0.52, 1);
  sp.position.y = y;
  return sp;
}

// Tiny procedural pickup chime — Web Audio, created lazily on first gesture.
let actx = null;
export function unlockAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
  if (actx && actx.state === 'suspended') actx.resume();
}
export function chime(freq = 880) {
  if (!actx || actx.state !== 'running') return;
  const t0 = actx.currentTime;
  for (let i = 0; i < 2; i++) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * (i ? 1.5 : 1);
    g.gain.setValueAtTime(0.0001, t0 + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.07 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.07 + 0.22);
    o.connect(g).connect(actx.destination);
    o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + 0.25);
  }
}
