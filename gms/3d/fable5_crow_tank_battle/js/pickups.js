// Pickups that spawn inside the ring: glowing harvest pumpkins (repair) plus
// three timed buffs — rapid fire, shield and crow-ward (immune to pecks).
// Each kind has its own shape, colour and a floating icon sprite.

import * as THREE from 'three';
import { PICKUP, PICKUP_KINDS, TANK } from './config.js';
import { rand, srand } from './utils.js';
import { scene, obstacles, glowBasic, camera } from './world.js';
import { spawnFlash, spawnRing } from './particles.js';
import { AudioFX } from './audio.js';
import { state, aliveTanks } from './state.js';
import { callout } from './ui.js';

let K = null;   // per-kind shared geometry / materials / icon, built on first use

function drawIcon(kind, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const css = '#' + color.toString(16).padStart(6, '0');
  g.fillStyle = 'rgba(16,8,22,0.82)';
  g.strokeStyle = css;
  g.lineWidth = 7;
  g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = css;
  g.strokeStyle = css;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  if (kind === 'heal') {
    g.fillRect(52, 28, 24, 72); g.fillRect(28, 52, 72, 24);
  } else if (kind === 'rapid') {
    g.lineWidth = 13;
    g.moveTo(36, 38); g.lineTo(58, 64); g.lineTo(36, 90);
    g.moveTo(66, 38); g.lineTo(88, 64); g.lineTo(66, 90);
    g.stroke();
  } else if (kind === 'shield') {
    g.moveTo(64, 26); g.lineTo(96, 38); g.quadraticCurveTo(94, 84, 64, 102);
    g.quadraticCurveTo(34, 84, 32, 38); g.closePath(); g.fill();
  } else {
    // crow-ward: a crow silhouette struck through
    g.moveTo(26, 62); g.quadraticCurveTo(46, 44, 64, 60); g.quadraticCurveTo(82, 44, 102, 62);
    g.quadraticCurveTo(82, 56, 70, 70); g.lineTo(64, 84); g.lineTo(58, 70);
    g.quadraticCurveTo(46, 56, 26, 62); g.fill();
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(32, 96); g.lineTo(96, 32); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false });
}

function build() {
  K = {};
  const geos = {
    heal: new THREE.SphereGeometry(0.62, 8, 6),
    rapid: new THREE.OctahedronGeometry(0.62, 0),
    shield: new THREE.IcosahedronGeometry(0.6, 0),
    ward: new THREE.ConeGeometry(0.5, 1.1, 5),
  };
  const stemGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.4, 5);
  const stemMat = new THREE.MeshBasicMaterial({ color: 0x4a6a20 });
  for (const [kind, def] of Object.entries(PICKUP_KINDS)) {
    K[kind] = {
      geo: geos[kind],
      mat: glowBasic(def.color, 1.6),
      shell: new THREE.MeshBasicMaterial({
        color: new THREE.Color(def.color).multiplyScalar(1.1),
        transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false }),
      icon: drawIcon(kind, def.color),
      stemGeo, stemMat,
    };
  }
}

let spawnTimer = 4;

function pickKind() {
  let total = 0;
  for (const d of Object.values(PICKUP_KINDS)) total += d.weight;
  let r = srand(0, total);
  for (const [kind, d] of Object.entries(PICKUP_KINDS)) {
    r -= d.weight;
    if (r <= 0) return kind;
  }
  return 'heal';
}

function spawnPickup() {
  if (!K) build();
  let kind = pickKind();
  // a crow-ward before the murder moves is wasted
  if (kind === 'ward' && !state.zoneShrinking && state.zoneTimer > 8) kind = 'heal';
  const k = K[kind];
  // find a clear spot inside the ring
  for (let i = 0; i < 20; i++) {
    const a = srand(0, Math.PI * 2);
    const r = srand(4, Math.max(6, state.zoneR * 0.8));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2.5)) continue;
    const grp = new THREE.Group();
    const body = new THREE.Mesh(k.geo, k.mat);
    if (kind === 'heal') {
      body.scale.y = 0.78;
      const stem = new THREE.Mesh(k.stemGeo, k.stemMat);
      stem.position.y = 0.62;
      grp.add(stem);
    }
    if (kind === 'ward') body.rotation.x = Math.PI;
    const shell = new THREE.Mesh(k.geo, k.shell);
    shell.scale.setScalar(1.5);
    const icon = new THREE.Sprite(k.icon);
    icon.scale.setScalar(1.5);
    icon.position.y = 2.0;
    grp.add(body, shell, icon);
    grp.position.set(x, 1.3, z);
    scene.add(grp);
    state.pickups.push({ grp, body, kind, pos: grp.position, life: PICKUP.lifetime,
      alive: true, phase: rand(0, Math.PI * 2) });
    return;
  }
}

function removePickup(pk) {
  pk.alive = false;
  scene.remove(pk.grp);
  const i = state.pickups.indexOf(pk);
  if (i >= 0) state.pickups.splice(i, 1);
}

export function clearPickups() {
  while (state.pickups.length) removePickup(state.pickups[0]);
  spawnTimer = 4;
}

function collect(t, pk) {
  const def = PICKUP_KINDS[pk.kind];
  if (pk.kind === 'heal') t.heal(PICKUP.heal);
  else t.applyBuff(pk.kind);
  spawnFlash(pk.pos, 1.4, def.color);
  spawnRing(pk.pos, 3, def.color);
  if (t.isPlayer) {
    if (pk.kind === 'heal') AudioFX.pickup(); else AudioFX.powerup();
    callout(def.label + (def.dur ? ' · ' + def.dur + 's' : ' +' + PICKUP.heal),
      '#' + def.color.toString(16).padStart(6, '0'), 'pickup');
  } else {
    AudioFX.hit(0.15 / (1 + t.pos.distanceTo(camera.position) / 35));
  }
  removePickup(pk);
}

export function updatePickups(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = PICKUP.interval;
    if (state.pickups.length < PICKUP.max) spawnPickup();
  }

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0 ||
        Math.hypot(pk.pos.x, pk.pos.z) > state.zoneR) {  // the murder ate it
      removePickup(pk);
      continue;
    }
    pk.body.rotation.y += 1.8 * dt;
    pk.grp.position.y = 1.3 + Math.sin(state.time * 2.2 + pk.phase) * 0.25;

    for (const t of aliveTanks()) {
      // AI at full hp ignores repairs
      if (pk.kind === 'heal' && t.hp >= TANK.hp && !t.isPlayer) continue;
      const d = Math.hypot(t.pos.x - pk.pos.x, t.pos.z - pk.pos.z);
      if (d < PICKUP.radius + 1.2) {
        collect(t, pk);
        break;
      }
    }
  }
}
