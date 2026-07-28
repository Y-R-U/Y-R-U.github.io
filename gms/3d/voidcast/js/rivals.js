// rivals.js — other clearance workers, streaming the same planet at you.

import * as THREE from 'three';
import { Hole, runCapture } from './hole.js';
import { RIVAL, TIER_R } from './config.js';
import { domeY } from './world.js';
import { alienName, makeRng, clamp, fmt, TAU } from './utils.js';

const PERSONALITIES = [
  { id: 'greedy', name: 'greedy', reach: 1.0, bravery: 0.4, focus: 0.75 },
  { id: 'hunter', name: 'hunter', reach: 0.7, bravery: 1.0, focus: 0.5 },
  { id: 'grinder', name: 'grinder', reach: 1.4, bravery: 0.2, focus: 1.0 },
  { id: 'showoff', name: 'showoff', reach: 0.85, bravery: 0.7, focus: 0.4 },
];

const RIVAL_COLS = [
  [0x2fa8ff, 0xc8f0ff], [0x4aff8a, 0xe0ffd0], [0xff2fa8, 0xffd0ee],
  [0x8a4aff, 0xe0d0ff], [0xffd23a, 0xfff4c0], [0xff5a3a, 0xffd0c0],
];

function labelSprite(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  sp.scale.set(11, 2.75, 1);
  sp.renderOrder = 20;
  return sp;
}

export class Rival {
  constructor(scene, sector, seed, opts) {
    const rng = makeRng(seed);
    this.rng = rng;
    this.sector = sector;
    this.pers = rng.pick(PERSONALITIES);
    this.name = alienName(seed);
    const col = RIVAL_COLS[(opts.index || 0) % RIVAL_COLS.length];
    const a = rng() * TAU;
    const d = sector.R * rng.range(0.55, 0.9);
    this.hole = new Hole(scene, {
      x: Math.cos(a) * d, z: Math.sin(a) * d,
      mass: opts.mass || 0, colA: col[0], colB: col[1], simple: true, name: this.name,
    });
    this.hole.owner = this;
    this.growth = opts.growth || 1;
    this.thinkT = rng() * RIVAL.THINK;
    this.tx = this.hole.x; this.tz = this.hole.z;
    this.eaten = 0;
    this.eatenMass = 0;
    this.eatenArea = 0;
    this.label = labelSprite(this.name, '#' + col[0].toString(16).padStart(6, '0'));
    scene.add(this.label);
    this.scene = scene;
    this.mode = 'farm';
  }

  get x() { return this.hole.x; }
  get z() { return this.hole.z; }

  think(player, others) {
    const h = this.hole;
    const p = this.pers;
    // 1. run from anything that can eat us
    let threat = null, threatD = 1e9;
    const all = others.concat(player ? [player] : []);
    for (const o of all) {
      if (o === h || !o.alive) continue;
      if (o.radius > h.radius * RIVAL.EAT_PLAYER_RATIO) {
        const d = Math.hypot(o.x - h.x, o.z - h.z);
        if (d < h.radius * 14 && d < threatD) { threat = o; threatD = d; }
      }
    }
    if (threat && threatD < h.radius * (10 - p.bravery * 6)) {
      this.mode = 'flee';
      const a = Math.atan2(h.z - threat.z, h.x - threat.x);
      this.tx = h.x + Math.cos(a) * 40;
      this.tz = h.z + Math.sin(a) * 40;
      return;
    }
    // 2. hunt someone smaller
    if (p.bravery > 0.5) {
      let prey = null, preyD = 1e9;
      for (const o of all) {
        if (o === h || !o.alive) continue;
        if (h.radius > o.radius * RIVAL.EAT_PLAYER_RATIO) {
          const d = Math.hypot(o.x - h.x, o.z - h.z);
          if (d < h.radius * 12 * p.bravery && d < preyD) { prey = o; preyD = d; }
        }
      }
      if (prey) { this.mode = 'hunt'; this.tx = prey.x; this.tz = prey.z; return; }
    }
    // 3. otherwise find the richest patch we can actually eat
    this.mode = 'farm';
    const props = this.sector.props;
    if (!props.length) return;
    let best = null, bestScore = -1;
    const stride = Math.max(1, Math.floor(props.length / 220));
    const off = this.rng.int(0, stride);
    for (let i = off; i < props.length; i += stride) {
      const pr = props[i];
      if (pr.dead || pr.state >= 2) continue;
      if (TIER_R[pr.tier] > h.radius) continue;
      const dx = pr.x - h.x, dz = pr.z - h.z;
      const d = Math.hypot(dx, dz);
      const s = (pr.value + 3) / Math.pow(d + 12, p.focus + 0.6);
      if (s > bestScore) { bestScore = s; best = pr; }
    }
    if (best) { this.tx = best.x; this.tz = best.z; }
    else {
      const a = this.rng() * TAU;
      this.tx = Math.cos(a) * this.sector.R * 0.6;
      this.tz = Math.sin(a) * this.sector.R * 0.6;
    }
  }

  update(dt, player, others, cb) {
    const h = this.hole;
    if (!h.alive) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = RIVAL.THINK * (0.7 + this.rng() * 0.6); this.think(player, others); }
    const dx = this.tx - h.x, dz = this.tz - h.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.4) {
      const sp = h.speed * RIVAL.SPEED_MUL * this.growth;
      h.x += (dx / d) * sp * dt;
      h.z += (dz / d) * sp * dt;
    }
    const R = this.sector.R * 0.97;
    const dd = Math.hypot(h.x, h.z);
    if (dd > R) { h.x = (h.x / dd) * R; h.z = (h.z / dd) * R; }

    runCapture(h, this.sector, dt, cb);
    h.updateVisual(dt);
    this.label.position.set(h.x, domeY(h.x, h.z) + 3 + h.radius * 0.35, h.z);
    this.label.scale.set(clamp(9 + h.radius * 0.5, 9, 26), clamp(2.25 + h.radius * 0.125, 2.25, 6.5), 1);
  }

  gain(p) {
    this.eaten++;
    this.eatenMass += p.value;
    this.eatenArea += p.area;
    this.hole.addMass(p.value * this.growth);
  }

  dispose() {
    this.hole.dispose();
    this.scene.remove(this.label);
    if (this.label.material.map) this.label.material.map.dispose();
    this.label.material.dispose();
  }
}

export function spawnRivals(scene, sector, n, seed, growth, startMass) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(new Rival(scene, sector, (seed ^ (i * 0x9e3779b9)) >>> 0, { index: i, growth, mass: startMass || 0 }));
  }
  return out;
}
