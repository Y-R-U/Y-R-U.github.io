// Speech bubbles with a driver's face in them. When a rival loses their roof
// at 200km/h you want to see what they think about it.

import * as THREE from 'three';
import { scene, camera } from './render.js';
import { pick, clamp01 } from './utils.js';

const MAX = 9;
const pool = [];
const texCache = new Map();

// Faces are drawn, not typed, so they read at any size and never depend on the
// device having an emoji font.
const FACES = {
  scared: { eye: 'wide', mouth: 'o', brow: 'up', tint: '#ffffff' },
  angry: { eye: 'narrow', mouth: 'grit', brow: 'down', tint: '#ffdede' },
  smug: { eye: 'wink', mouth: 'smirk', brow: 'flat', tint: '#e6ffe9' },
  dazed: { eye: 'spiral', mouth: 'wavy', brow: 'flat', tint: '#fff6d8' },
  shock: { eye: 'huge', mouth: 'gape', brow: 'up', tint: '#ffffff' },
  pain: { eye: 'shut', mouth: 'grit', brow: 'down', tint: '#ffe2e2' },
};

export const LINES = {
  scared: ['MY BONNET!', 'NOT AGAIN!', 'THE ROOF!', 'WHERE IS IT?!', 'AAAAH!', 'MY DOOR!'],
  angry: ['YOU MANIAC!', 'STEWARDS!', 'THAT WAS DELIBERATE!', 'I SAW THAT!', 'RAT!'],
  smug: ['ALL YOURS.', 'OOPS.', 'RACING INCIDENT.', 'MY MISTAKE.', 'SORRY, PAL.'],
  dazed: ['...WHICH WAY?', 'WHO AM I?', 'IS IT OVER?', 'STARS...'],
  shock: ['LOOK OUT!', 'NO NO NO', 'OH COME ON', 'HE IS INSIDE ME'],
  pain: ['OW.', 'MY SPINE.', 'THAT HURT.'],
};

function faceTexture(kind, text) {
  const key = kind + '|' + (text || '');
  if (texCache.has(key)) return texCache.get(key);

  const W = 256, H = text ? 192 : 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const f = FACES[kind] || FACES.scared;

  // bubble
  const bx = 8, by = 8, bw = W - 16, bh = (text ? 150 : 128);
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.strokeStyle = '#12161c';
  g.lineWidth = 7;
  roundRect(g, bx, by, bw, bh, 26);
  g.fill();
  g.stroke();
  // tail
  g.beginPath();
  g.moveTo(W / 2 - 18, by + bh - 2);
  g.lineTo(W / 2 + 4, H - 4);
  g.lineTo(W / 2 + 22, by + bh - 2);
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.fill();
  g.stroke();

  // head
  const cx = W / 2, cy = by + 54;
  g.fillStyle = f.tint;
  g.strokeStyle = '#12161c';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, 40, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // helmet
  g.fillStyle = '#e5533d';
  g.beginPath();
  g.arc(cx, cy - 4, 41, Math.PI, 0);
  g.fill();
  g.stroke();

  g.fillStyle = '#12161c';
  g.strokeStyle = '#12161c';
  g.lineWidth = 4;

  // eyes
  const ex = 15;
  if (f.eye === 'wide' || f.eye === 'huge') {
    const r = f.eye === 'huge' ? 12 : 9;
    for (const s of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(cx + s * ex, cy + 4, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#12161c';
      g.beginPath(); g.arc(cx + s * ex, cy + 4, r * 0.45, 0, Math.PI * 2); g.fill();
    }
  } else if (f.eye === 'narrow') {
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(cx + s * ex - 9, cy + 2); g.lineTo(cx + s * ex + 9, cy + 6); g.stroke();
    }
  } else if (f.eye === 'wink') {
    g.beginPath(); g.arc(cx - ex, cy + 4, 6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx + ex - 8, cy + 4); g.lineTo(cx + ex + 8, cy + 4); g.stroke();
  } else if (f.eye === 'spiral') {
    for (const s of [-1, 1]) {
      g.beginPath();
      for (let a = 0; a < 12; a += 0.3) {
        const rr = a * 0.75;
        const px = cx + s * ex + Math.cos(a) * rr;
        const py = cy + 4 + Math.sin(a) * rr;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.lineWidth = 3; g.stroke(); g.lineWidth = 4;
    }
  } else if (f.eye === 'shut') {
    for (const s of [-1, 1]) {
      g.beginPath(); g.arc(cx + s * ex, cy + 4, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
  }

  // brows
  if (f.brow !== 'flat') {
    const dy = f.brow === 'up' ? -6 : 4;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * ex - 11, cy - 12 + (f.brow === 'down' ? 0 : dy));
      g.lineTo(cx + s * ex + 11, cy - 12 + (f.brow === 'down' ? dy : 0) * s * s);
      g.stroke();
    }
  }

  // mouth
  g.lineWidth = 5;
  if (f.mouth === 'o' || f.mouth === 'gape') {
    const rr = f.mouth === 'gape' ? 14 : 9;
    g.fillStyle = '#5a1d1d';
    g.beginPath(); g.ellipse(cx, cy + 24, rr * 0.8, rr, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  } else if (f.mouth === 'grit') {
    g.fillStyle = '#ffffff';
    g.fillRect(cx - 15, cy + 18, 30, 11);
    g.strokeRect(cx - 15, cy + 18, 30, 11);
    g.beginPath();
    for (let i = -1; i <= 1; i++) { g.moveTo(cx + i * 10, cy + 18); g.lineTo(cx + i * 10, cy + 29); }
    g.lineWidth = 2; g.stroke(); g.lineWidth = 5;
  } else if (f.mouth === 'smirk') {
    g.beginPath(); g.moveTo(cx - 12, cy + 24); g.quadraticCurveTo(cx + 4, cy + 32, cx + 15, cy + 18); g.stroke();
  } else if (f.mouth === 'wavy') {
    g.beginPath();
    g.moveTo(cx - 15, cy + 24);
    g.quadraticCurveTo(cx - 7, cy + 18, cx, cy + 24);
    g.quadraticCurveTo(cx + 7, cy + 30, cx + 15, cy + 24);
    g.stroke();
  }

  if (text) {
    g.fillStyle = '#12161c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Shrink to fit rather than clip — these lines are the joke.
    let size = 26;
    const maxW = bw - 24;
    do {
      g.font = 'bold ' + size + 'px system-ui, -apple-system, sans-serif';
      size -= 1;
    } while (size > 12 && g.measureText(text).width > maxW);
    g.fillText(text, W / 2, by + bh - 22);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function initBubbles() {
  if (pool.length) return;
  for (let i = 0; i < MAX; i++) {
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 20;
    sp.scale.set(4.2, 3.2, 1);
    scene.add(sp);
    pool.push({ sp, car: null, age: 0, life: 0, active: false });
  }
}

export function showBubble(car, kind, text, life = 2.1) {
  if (!pool.length) return;
  // One bubble per car — a new reaction replaces the old one.
  let slot = pool.find((p) => p.car === car);
  if (!slot) slot = pool.find((p) => !p.active);
  if (!slot) slot = pool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));

  const line = text === undefined ? pick(LINES[kind] || LINES.scared) : text;
  slot.sp.material.map = faceTexture(kind, line);
  slot.sp.material.needsUpdate = true;
  slot.sp.visible = true;
  slot.active = true;
  slot.car = car;
  slot.age = 0;
  slot.life = life;
  slot.kind = kind;
}

export function updateBubbles(dt) {
  for (const p of pool) {
    if (!p.active) continue;
    p.age += dt;
    const t = p.age / p.life;
    if (t >= 1 || !p.car || p.car.mode === 'out') {
      p.active = false;
      p.sp.visible = false;
      p.car = null;
      continue;
    }
    const pop = t < 0.12 ? t / 0.12 : 1;
    const fade = t > 0.82 ? (1 - t) / 0.18 : 1;
    p.sp.position.copy(p.car.worldPos);
    p.sp.position.y += 2.9 + pop * 0.4;

    // A sprite two metres from the lens fills the screen. Anything that close
    // is beside or behind you anyway, so hide it rather than blind the player —
    // but keep the slot alive so it comes back as the car falls away.
    const d = camera.position.distanceTo(p.sp.position);
    p.sp.visible = d >= 7;
    if (!p.sp.visible) continue;
    const s = 3.4 * (0.6 + 0.4 * pop) * Math.min(1, 15 / d);
    p.sp.scale.set(s * 1.25, s, 1);
    p.sp.material.opacity = fade * Math.min(1, (d - 7) / 3);
  }
}

export function clearBubbles() {
  for (const p of pool) { p.sp.visible = false; p.active = false; p.car = null; }
}

export function bubbleForDamage(part) {
  if (part === 'roof') return ['scared', 'THE ROOF!'];
  if (part === 'bonnet') return ['scared', 'MY BONNET!'];
  if (part && part.startsWith('wheel')) return ['shock', 'THAT WAS A WHEEL'];
  if (part && part.startsWith('door')) return ['scared', 'MY DOOR!'];
  if (part === 'spoiler') return ['angry', 'THE WING!'];
  if (part && part.startsWith('mirror')) return ['angry', undefined];
  return ['pain', undefined];
}
