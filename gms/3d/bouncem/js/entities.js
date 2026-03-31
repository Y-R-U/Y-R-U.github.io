// ─── Entities: Ball, Block, Pipe, SuctionTube, BlackHole, WhiteHole, EventOrb ───

import * as THREE from 'three';
import { ARENA, getBallColor, formatNumber } from './config.js';
import { scene, spawnParticles } from './scene.js';
import { createBallBody, createBlockBody, removeBody, world } from './physics.js';

// ─── Shared geometries ───
const ballGeo = new THREE.SphereGeometry(ARENA.ballRadius, 20, 16);
const blockGeos = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  hexagonal: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  rounded: new THREE.BoxGeometry(1, 1, 1, 4, 4, 4),
};
const blockShapeTypes = ['box', 'cylinder', 'hexagonal', 'rounded'];

// ─── Sprite for text labels ───
function makeTextSprite(text, color = '#ffffff', fontSize = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, 64, 32);
  ctx.fillText(text, 64, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.2, 0.6, 1);
  return sprite;
}

// ─── Ball ───
export class Ball {
  constructor(value, inPipe = true) {
    this.value = value;
    this.baseValue = value;   // original value (for temp buffs)
    this.inPipe = inPipe;
    this.inSuction = false;
    this.inLimbo = false;     // trapped by black hole
    this.merged = false;
    this.isTemporary = false; // clone balls that vanish after round
    this.tempBuff = 1;        // temp value multiplier (resets after round)
    this.body = null;
    this.suctionProgress = 0;
    this.mergeImmunityUntil = 0; // game-time before which this ball cannot merge

    // Mesh
    const color = getBallColor(value);
    this.mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      metalness: 0.3,
      roughness: 0.5,
    });
    this.mesh = new THREE.Mesh(ballGeo, this.mat);
    this.mesh.castShadow = true;
    this.mesh.userData.ball = this;

    // Label
    this.label = makeTextSprite(formatNumber(value));
    this.label.position.y = 0;
    this.mesh.add(this.label);

    scene.add(this.mesh);
  }

  get effectiveValue() {
    return this.value * this.tempBuff;
  }

  updateVisual(value) {
    if (value !== undefined) {
      this.value = value;
      this.baseValue = value;
    }
    const displayVal = Math.round(this.value * this.tempBuff);
    const color = getBallColor(displayVal);
    this.mat.color.setHex(color);
    this.mat.emissive.setHex(color);
    // Update label
    this.mesh.remove(this.label);
    this.label.material.map.dispose();
    this.label.material.dispose();
    let labelText = formatNumber(displayVal);
    if (this.tempBuff !== 1) labelText += (this.tempBuff > 1 ? '↑' : '↓');
    if (this.isTemporary) labelText += '⏳';
    this.label = makeTextSprite(labelText);
    this.mesh.add(this.label);
  }

  refreshLabel() {
    this.updateVisual();
  }

  spawn(x, y, z) {
    this.inPipe = false;
    this.body = createBallBody(ARENA.ballRadius, { x, y, z });
    this.body.userData = { type: 'ball', entity: this };
  }

  syncMesh() {
    if (this.body && !this.inPipe && !this.inSuction && !this.inLimbo) {
      this.mesh.position.copy(this.body.position);
      this.mesh.quaternion.copy(this.body.quaternion);
    }
  }

  destroy() {
    if (this.body) {
      removeBody(this.body);
      this.body = null;
    }
    scene.remove(this.mesh);
    this.mat.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.merged = true;
  }
}

// ─── Block ───
export class Block {
  constructor(hp, wave, x, y) {
    this.hp = hp;
    this.maxHp = hp;
    this.wave = wave;
    this.dead = false;

    const shapeType = blockShapeTypes[Math.floor(Math.random() * blockShapeTypes.length)];
    const size = ARENA.blockMinSize + Math.random() * (ARENA.blockMaxSize - ARENA.blockMinSize);
    this.size = size;
    this.shapeType = shapeType;

    const blockIndex = Math.floor(x * 3 + hp);
    this.baseHue = ((wave * 0.27 + blockIndex * 0.618033) % 1);
    this.mat = new THREE.MeshStandardMaterial({
      color: 0x44ff44,
      metalness: 0.3,
      roughness: 0.5,
    });

    const geo = blockGeos[shapeType];
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.scale.set(size, size, size);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.block = this;

    this.label = makeTextSprite(formatNumber(hp), '#ffffff', 36);
    this.label.position.y = size * 0.7;
    this.mesh.add(this.label);

    this.body = createBlockBody(shapeType, size, { x, y, z: 0 });
    this.body.userData = { type: 'block', entity: this };

    this.mesh.position.set(x, y, 0);
    scene.add(this.mesh);

    this.isBoss = false;
    this.pulseTime = 0;
    this.updateColor();
  }

  updateColor() {
    const ratio = this.hp / this.maxHp;
    const c = new THREE.Color();
    c.setHSL(this.baseHue, 0.8, 0.3 + ratio * 0.3);
    this.mat.color.copy(c);
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    this.updateColor();
    this.mesh.remove(this.label);
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.label = makeTextSprite(formatNumber(Math.ceil(this.hp)), '#ffffff', 36);
    this.label.position.y = this.size * 0.7;
    this.mesh.add(this.label);
  }

  moveUp(amount) {
    this.body.position.y += amount;
    this.mesh.position.y += amount;
  }

  destroy() {
    spawnParticles(this.mesh.position, 0xff4444, 20);
    removeBody(this.body);
    scene.remove(this.mesh);
    this.mat.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }

  update(dt) {
    if (this.isBoss) {
      this.pulseTime += dt * 3;
      const s = this.size * (1 + Math.sin(this.pulseTime) * 0.05);
      this.mesh.scale.set(s, s, s);
      this.mat.emissive = this.mat.emissive || new THREE.Color();
      this.mat.emissive.setRGB(0.3 + Math.sin(this.pulseTime) * 0.15, 0.05, 0.1);
      this.mat.emissiveIntensity = 0.5;
    }
  }
}

// ─── Pipe ───
export class Pipe {
  constructor() {
    const tubeGeo = new THREE.CylinderGeometry(0.5, 0.5, ARENA.width * 0.8, 16, 1, true);
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xaaccff,
      transparent: true,
      opacity: 0.25,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.set(0, ARENA.pipeY, 0);
    scene.add(this.mesh);

    const indGeo = new THREE.RingGeometry(0.15, 0.3, 16);
    const indMat = new THREE.MeshBasicMaterial({
      color: 0x4a90ff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.indicator = new THREE.Mesh(indGeo, indMat);
    this.indicator.rotation.x = -Math.PI / 2;
    this.indicator.position.set(0, ARENA.pipeY - 0.6, 0);
    scene.add(this.indicator);

    this.targetX = 0;
    this.currentX = 0;
    this.shakeTime = 0;
  }

  clampX(x) {
    const hw = ARENA.width / 2 - 0.5;
    return Math.max(-hw, Math.min(hw, x));
  }

  setTargetX(x) {
    this.targetX = this.clampX(x);
  }

  // Snap instantly — used on tap/click so ball drops at the right position
  snapToX(x) {
    const cx = this.clampX(x);
    this.targetX = cx;
    this.currentX = cx;
    this.indicator.position.x = cx;
  }

  update(dt) {
    // Lerp to target (for desktop mouse-follow; after snap this is a no-op)
    this.currentX += (this.targetX - this.currentX) * Math.min(1, dt * 15);
    this.indicator.position.x = this.currentX;

    let shakeOff = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      shakeOff = Math.sin(this.shakeTime * 40) * 0.08 * this.shakeTime;
    }
    this.indicator.position.y = ARENA.pipeY - 0.6 + shakeOff;
  }

  triggerShake() {
    this.shakeTime = 0.2;
  }

  destroy() {
    scene.remove(this.mesh);
    scene.remove(this.indicator);
  }
}

// ─── SuctionTube ───
export class SuctionTube {
  constructor() {
    const hw = ARENA.width / 2;
    const tubeGeo = new THREE.CylinderGeometry(0.4, 0.4, ARENA.height, 12, 1, true);
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.mesh.position.set(hw + 0.1, 0, 0);
    scene.add(this.mesh);

    this.particleTime = 0;
    this.suctionParticles = [];
    for (let i = 0; i < 5; i++) {
      const ringGeo = new THREE.RingGeometry(0.2, 0.35, 12);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x4488ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(hw + 0.1, -ARENA.height / 2 + i * (ARENA.height / 5), 0);
      scene.add(ring);
      this.suctionParticles.push(ring);
    }
  }

  update(dt) {
    this.particleTime += dt;
    for (let i = 0; i < this.suctionParticles.length; i++) {
      const ring = this.suctionParticles[i];
      const baseY = -ARENA.height / 2;
      const t = ((this.particleTime * 0.5 + i * 0.2) % 1);
      ring.position.y = baseY + t * ARENA.height;
      ring.material.opacity = 0.15 * (1 - Math.abs(t - 0.5) * 2);
    }
  }

  destroy() {
    scene.remove(this.mesh);
    this.suctionParticles.forEach(r => scene.remove(r));
  }
}

// ─── BlackHole ───
export class BlackHole {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.lifetime = 4;
    this.time = 0;

    // Dark sphere with animated swirl
    const geo = new THREE.SphereGeometry(0.5, 24, 16);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x220044,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(x, y, 0);
    scene.add(this.mesh);

    // Accretion ring
    const ringGeo = new THREE.TorusGeometry(0.7, 0.08, 8, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xaa44ff,
      transparent: true,
      opacity: 0.6,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.set(x, y, 0);
    scene.add(this.ring);
  }

  update(dt) {
    this.time += dt;
    // Rotate ring
    this.ring.rotation.z += dt * 3;
    this.ring.rotation.x = Math.PI / 3 + Math.sin(this.time * 2) * 0.2;
    // Pulse core
    const s = 0.5 + Math.sin(this.time * 5) * 0.08;
    this.mesh.scale.set(s, s, s);
    // Fade out near end
    if (this.lifetime < 1) {
      this.ringMat.opacity = 0.6 * this.lifetime;
    }
  }

  destroy() {
    scene.remove(this.mesh);
    scene.remove(this.ring);
    this.mat.dispose();
    this.ringMat.dispose();
  }
}

// ─── WhiteHole ───
export class WhiteHole {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.lifetime = 3.5;
    this.time = 0;
    this._spitTimer = 0;

    const geo = new THREE.SphereGeometry(0.45, 24, 16);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(x, y, 0);
    scene.add(this.mesh);

    // Glow ring
    const ringGeo = new THREE.TorusGeometry(0.65, 0.06, 8, 32);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0.5,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.set(x, y, 0);
    scene.add(this.ring);
  }

  update(dt) {
    this.time += dt;
    this.ring.rotation.z -= dt * 3;
    this.ring.rotation.x = Math.PI / 3 + Math.cos(this.time * 2) * 0.2;
    const s = 0.45 + Math.sin(this.time * 4) * 0.06;
    this.mesh.scale.set(s, s, s);
    if (this.lifetime < 1) {
      this.ringMat.opacity = 0.5 * this.lifetime;
    }
  }

  destroy() {
    scene.remove(this.mesh);
    scene.remove(this.ring);
    this.mat.dispose();
    this.ringMat.dispose();
  }
}

// ─── EventOrb (collectible floating orb that triggers effects) ───
// Types: 'clone' (×3 balls), 'power' (↑ value), 'curse' (↓ value)
export class EventOrb {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.time = 0;
    this.lifetime = 8;
    this.dead = false;
    this.radius = 0.45;

    const colorMap = {
      clone: 0x44ff88,   // green
      power: 0xffdd00,   // gold
      curse: 0xff4466,   // red
    };
    const labelMap = {
      clone: '×3',
      power: '⬆2x',
      curse: '⬇½',
    };

    const geo = new THREE.OctahedronGeometry(this.radius, 1);
    this.mat = new THREE.MeshStandardMaterial({
      color: colorMap[type] || 0xffffff,
      emissive: colorMap[type] || 0xffffff,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(x, y, 0);
    scene.add(this.mesh);

    // Label
    this.label = makeTextSprite(labelMap[type] || '?', '#ffffff', 40);
    this.label.position.y = 0.6;
    this.mesh.add(this.label);
  }

  update(dt) {
    this.time += dt;
    this.lifetime -= dt;
    if (this.lifetime <= 0) this.dead = true;
    // Bob and spin
    this.mesh.position.y = this.y + Math.sin(this.time * 2) * 0.2;
    this.mesh.rotation.y += dt * 2;
    this.mesh.rotation.x += dt * 0.5;
    // Fade out near end
    if (this.lifetime < 1.5) {
      this.mat.opacity = 0.85 * (this.lifetime / 1.5);
      // Blink
      this.mesh.visible = Math.sin(this.time * 12) > -0.3;
    }
  }

  destroy() {
    scene.remove(this.mesh);
    this.mat.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.dead = true;
  }
}
