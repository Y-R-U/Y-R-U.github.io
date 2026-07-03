// Combat feedback: hit splats, gold bounty pops, floating health bars,
// explosions, frost pulse rings, chain-lightning arcs, death puffs.

import * as THREE from 'three';
import { rand } from './utils.js';

let scene = null;
const actives = []; // { obj, tick(dt) -> alive, dispose? }

export function initFx(s) { scene = s; }

export function tickFx(dt) {
  for (let i = actives.length - 1; i >= 0; i--) {
    if (!actives[i].tick(dt)) {
      scene.remove(actives[i].obj);
      actives[i].dispose?.();
      actives.splice(i, 1);
    }
  }
}

function textSprite(text, { bg = '#b3221a', fg = '#fff', size = 0.5 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    for (const [x, y, r] of [[64, 64, 40], [38, 58, 26], [90, 58, 26], [64, 88, 26], [64, 38, 24]]) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  g.fillStyle = fg;
  g.font = '800 54px -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sp.scale.set(size, size, 1);
  sp.renderOrder = 999;
  return { sp, tex };
}

export function splat(pos, dmg) {
  const { sp, tex } = textSprite(dmg, {});
  sp.position.copy(pos);
  scene.add(sp);
  let age = 0;
  actives.push({
    obj: sp,
    tick(dt) {
      age += dt;
      sp.position.y += dt * 0.6;
      sp.material.opacity = age < 0.4 ? 1 : 1 - (age - 0.4) / 0.3;
      return age < 0.7;
    },
    dispose() { tex.dispose(); sp.material.dispose(); },
  });
}

// gold bounty pop on a kill
export function goldPop(pos, amount) {
  const { sp, tex } = textSprite(`+${amount}`, { bg: null, fg: '#ffd75e', size: 0.9 });
  sp.position.copy(pos).y += 0.4;
  scene.add(sp);
  let age = 0;
  actives.push({
    obj: sp,
    tick(dt) {
      age += dt;
      sp.position.y += dt * 0.9;
      sp.material.opacity = 1 - age / 0.85;
      return age < 0.85;
    },
    dispose() { tex.dispose(); sp.material.dispose(); },
  });
}

// ── glow sprite util ──
let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
export function glowSprite(scl, color = 0xffc060, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTex(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.set(scl, scl, 1);
  return sp;
}

// ── explosion: flash + expanding shock ring + smoke puffs ──
const ringGeo = new THREE.RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2);
export function explosion(pos, radius, color = 0xffa040) {
  const flash = glowSprite(radius * 0.9, 0xffe0a0, 1);
  flash.position.copy(pos).y += 0.3;
  scene.add(flash);
  let fa = 0;
  actives.push({
    obj: flash,
    tick(dt) { fa += dt; const k = fa / 0.16; flash.scale.setScalar(radius * (0.9 + k)); flash.material.opacity = 1 - k; return k < 1; },
    dispose() { flash.material.dispose(); },
  });

  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.position.copy(pos).y = 0.06;
  scene.add(ring);
  let ra = 0;
  actives.push({
    obj: ring,
    tick(dt) { ra += dt; const k = ra / 0.34; ring.scale.setScalar(0.2 + k * radius); ring.material.opacity = 0.85 * (1 - k); return k < 1; },
    dispose() { ring.material.dispose(); },
  });

  for (let i = 0; i < 5; i++) {
    const puff = glowSprite(rand(0.4, 0.8) * radius * 0.5, 0x554438, 0.6);
    puff.material.blending = THREE.NormalBlending;
    puff.position.copy(pos).add(new THREE.Vector3(rand(-0.5, 0.5), rand(0.2, 0.8), rand(-0.5, 0.5)));
    scene.add(puff);
    const vy = rand(0.8, 1.8);
    let pa = 0;
    actives.push({
      obj: puff,
      tick(dt) { pa += dt; const k = pa / 0.7; puff.position.y += vy * dt; puff.scale.multiplyScalar(1 + dt * 1.4); puff.material.opacity = 0.6 * (1 - k); return k < 1; },
      dispose() { puff.material.dispose(); },
    });
  }
}

// ── frost pulse: icy expanding ring + sparkles ──
export function frostPulse(pos, radius) {
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0x9fd8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  ring.position.copy(pos).y = 0.08;
  scene.add(ring);
  let a = 0;
  actives.push({
    obj: ring,
    tick(dt) { a += dt; const k = a / 0.5; ring.scale.setScalar(0.3 + k * radius); ring.material.opacity = 0.75 * (1 - k); return k < 1; },
    dispose() { ring.material.dispose(); },
  });
}

// small icy glint over a chilled enemy
export function frostGlint(pos) {
  const sp = glowSprite(0.5, 0xbfe8ff, 0.9);
  sp.position.copy(pos);
  scene.add(sp);
  let a = 0;
  actives.push({
    obj: sp,
    tick(dt) { a += dt; sp.position.y += dt * 0.5; sp.material.opacity = 0.9 * (1 - a / 0.3); return a < 0.3; },
    dispose() { sp.material.dispose(); },
  });
}

// ── chain lightning: jagged multi-segment arc that flashes out ──
export function zapArc(from, to) {
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Vector3().lerpVectors(from, to, i / n);
    if (i > 0 && i < n) {
      p.x += rand(-0.28, 0.28); p.y += rand(-0.2, 0.3); p.z += rand(-0.28, 0.28);
    }
    pts.push(p);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xd8ffb8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  line.renderOrder = 6;
  scene.add(line);
  const spark = glowSprite(0.55, 0xd8ffb8, 1);
  spark.position.copy(to);
  scene.add(spark);
  let a = 0;
  actives.push({
    obj: line,
    tick(dt) { a += dt; line.material.opacity = 1 - a / 0.14; return a < 0.14; },
    dispose() { geo.dispose(); line.material.dispose(); },
  });
  let b = 0;
  actives.push({
    obj: spark,
    tick(dt) { b += dt; spark.material.opacity = 1 - b / 0.18; return b < 0.18; },
    dispose() { spark.material.dispose(); },
  });
}

// ── death puff (enemy despawn) ──
export function deathPuff(pos, color = 0x8a7a68) {
  for (let i = 0; i < 4; i++) {
    const puff = glowSprite(rand(0.3, 0.55), color, 0.55);
    puff.material.blending = THREE.NormalBlending;
    puff.position.copy(pos).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0.1, 0.6), rand(-0.3, 0.3)));
    scene.add(puff);
    let a = 0;
    actives.push({
      obj: puff,
      tick(dt) { a += dt; const k = a / 0.5; puff.position.y += dt * 0.8; puff.scale.multiplyScalar(1 + dt); puff.material.opacity = 0.55 * (1 - k); return k < 1; },
      dispose() { puff.material.dispose(); },
    });
  }
}

// heal sparkle rising over an enemy (warlock aura)
export function healSparkle(pos) {
  const sp = glowSprite(0.4, 0x80ff90, 0.85);
  sp.position.copy(pos).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0.2, 0.9), rand(-0.3, 0.3)));
  scene.add(sp);
  let a = 0;
  actives.push({
    obj: sp,
    tick(dt) { a += dt; sp.position.y += dt * 1.1; sp.material.opacity = 0.85 * (1 - a / 0.5); return a < 0.5; },
    dispose() { sp.material.dispose(); },
  });
}

// ── floating health bar ──
export function makeHealthBar(parent, yOff = 1.9, width = 0.72) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 10;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  sp.scale.set(width, 0.11, 1);
  sp.position.y = yOff;
  sp.renderOrder = 998;
  sp.visible = false;
  parent.add(sp);
  return {
    set(frac) {
      g.clearRect(0, 0, 64, 10);
      g.fillStyle = '#140a06'; g.fillRect(0, 0, 64, 10);
      g.fillStyle = '#8c1414'; g.fillRect(1, 1, 62, 8);
      g.fillStyle = frac > 0.45 ? '#48b148' : '#d8a020';
      g.fillRect(1, 1, Math.round(62 * Math.max(frac, 0)), 8);
      tex.needsUpdate = true;
      sp.visible = frac > 0 && frac < 1;
    },
    hide() { sp.visible = false; },
    dispose() { sp.parent?.remove(sp); tex.dispose(); sp.material.dispose(); },
  };
}
