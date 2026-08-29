// The numbered walls: the wooden-and-steel blockers from the reference frames
// with one very large white number on the face.
//
// A barrier is the game's only *pure* cost. A gate asks "which of these", a
// barrier asks "is this worth the seconds". Its number is its HP, it counts
// down while you shoot it, and if you reach it with the wall still standing it
// takes `BARRIER.killOnTouch` of the squad off you and the rest slide around it.
//
// Same performance shape as gates.js: one instanced draw for every wall on
// screen, one for the plank debris, and the numbers ride on signs.js's shared
// glyph mesh (band 1) so a wall showing "300" costs no draw call of its own.

import * as THREE from 'three';
import { BARRIER, PAL, DEV_MODE } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { clamp, smoothstep, fmt } from './utils.js';
import {
  initSigns, glyphLayer, labelWriter, panelMaterial, cbox, ccone, cmerge,
} from './signs.js';

const MAX_WALLS = 14;
const MAX_PLANKS = 72;

const B_W = 6;                   // nominal width the geometry is built at
const B_H = 2.30;
const NUM_Y = B_H * 0.50;
const NUM_Z = -0.36;             // proud of the plank face, toward the camera
const NUM_H = B_H * 0.80;        // the number IS the wall; it fills the planks

const FADE_START = 74;           // matches the fog near plane; see gates.js
const POP_M = 12;
const DESPAWN_BEHIND = 8;

let wallMesh = null, plankMesh = null;
let wallArr = null, plankArr = null;
let labels = null;

let defs = [], nextDef = 0, prevZ = 0;
const active = [];
const pool = [];

const pk = {
  x: new Float32Array(MAX_PLANKS), y: new Float32Array(MAX_PLANKS), z: new Float32Array(MAX_PLANKS),
  vx: new Float32Array(MAX_PLANKS), vy: new Float32Array(MAX_PLANKS), vz: new Float32Array(MAX_PLANKS),
  rx: new Float32Array(MAX_PLANKS), ry: new Float32Array(MAX_PLANKS),
  wx: new Float32Array(MAX_PLANKS), wy: new Float32Array(MAX_PLANKS),
  s: new Float32Array(MAX_PLANKS), life: new Float32Array(MAX_PLANKS),
};
const PK_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rx', 'ry', 'wx', 'wy', 's', 'life'];
let pkCount = 0;

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();

// --------------------------------------------------------------------------
// Geometry
// --------------------------------------------------------------------------
// Planks as actual boxes with actual gaps, not a texture. At the distance the
// player meets a wall the seams are 4-5 px and geometry holds up where a
// 256 px texture goes soft; it is 14 boxes and it is instanced, so it is free.
function buildWall() {
  const parts = [];
  const rows = 3, gap = 0.06;
  const ph = (B_H - 0.34 - gap * (rows - 1)) / rows;
  for (let i = 0; i < rows; i++) {
    const y = 0.17 + ph / 2 + i * (ph + gap);
    parts.push(cbox(B_W, ph, 0.46, 0, y, 0, i % 2 ? PAL.wood : 0xb8813f));
  }
  // steel rails top and bottom, the thing that makes it read as fortified
  parts.push(cbox(B_W + 0.12, 0.20, 0.56, 0, 0.11, 0, PAL.steel));
  parts.push(cbox(B_W + 0.12, 0.20, 0.56, 0, B_H - 0.10, 0, PAL.steel));
  for (let i = -3; i <= 3; i++) {
    parts.push(cbox(0.10, 0.10, 0.10, i * (B_W / 7), 0.11, -0.30, PAL.signStroke));
    parts.push(cbox(0.10, 0.10, 0.10, i * (B_W / 7), B_H - 0.10, -0.30, PAL.signStroke));
  }
  for (const s of [-1, 1]) {
    parts.push(cbox(0.46, B_H + 0.34, 0.66, s * (B_W / 2 + 0.10), (B_H + 0.34) / 2, 0, PAL.steel));
    parts.push(ccone(0.36, 0.52, s * (B_W / 2 + 0.10), B_H + 0.34 + 0.26, 0, PAL.steel));
  }
  return cmerge(parts);
}

export function initBarriers(ctx) {
  if (!ctx?.scene) return null;
  initSigns();

  wallMesh = new THREE.InstancedMesh(buildWall(), panelMaterial('wood'), MAX_WALLS);
  wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wallMesh.frustumCulled = false;
  wallMesh.castShadow = !!ctx.quality?.shadows;
  wallMesh.count = 0;
  wallArr = wallMesh.instanceMatrix.array;

  plankMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.78, 0.24, 0.22),
    new THREE.MeshLambertMaterial({ color: PAL.wood, flatShading: true }),
    MAX_PLANKS
  );
  plankMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plankMesh.frustumCulled = false;
  plankMesh.count = 0;
  plankArr = plankMesh.instanceMatrix.array;

  ctx.scene.add(wallMesh, plankMesh, glyphLayer());
  labels = labelWriter(1);

  if (DEV_MODE) window.__hbBarriers = { active };
  return wallMesh;
}

// --------------------------------------------------------------------------
// Barrier objects
// --------------------------------------------------------------------------
function newBarrier() {
  const b = {
    def: null, z: 0, x: 0, w: B_W, hp: 0, hpMax: 1, value: 0,
    scale: 0, dead: false, crumble: -1, touched: false, shown: '',
    hit: null, damage: null, applyDamage: null,
  };
  b.hit = (d) => hitBarrier(b, d);
  b.damage = b.hit;
  b.applyDamage = b.hit;
  return b;
}

function acquire(def) {
  const b = pool.pop() || newBarrier();
  b.def = def;
  b.z = def.z; b.x = def.x ?? 0; b.w = def.w || B_W;
  b.hpMax = def.hp || Math.round(BARRIER.hpPerWidth * b.w);
  b.hp = b.hpMax;
  b.value = def.value ?? b.hpMax;
  b.scale = 0; b.dead = false; b.crumble = -1; b.touched = false;
  b.shown = '';
  active.push(b);
  return b;
}

// Order-preserving remove without `splice` — see gates.js:release. This runs
// inside updateBarriers and updateBarriers must not allocate.
function release(b) {
  const i = active.indexOf(b);
  if (i >= 0) {
    for (let j = i; j < active.length - 1; j++) active[j] = active[j + 1];
    active.length--;
  }
  b.def = null;
  if (pool.length < MAX_WALLS) pool.push(b);
}

function hitBarrier(b, damage = 1) {
  if (!b || b.dead) return false;
  b.hp -= damage;
  if (b.hp <= 0) {
    b.hp = 0;
    b.dead = true;
    b.crumble = 0;
    emit('barrier:broken', { pos: { x: b.x, y: B_H * 0.5, z: b.z }, value: b.value });
    emit('fx:explosion', { pos: { x: b.x, y: B_H * 0.5, z: b.z }, scale: 1.4, color: PAL.wood });
    emit('fx:shake', { amount: 0.3 });
    burstPlanks(b, 16);
  }
  return true;
}

function burstPlanks(b, n) {
  for (let i = 0; i < n && pkCount < MAX_PLANKS; i++) {
    const k = pkCount++;
    pk.x[k] = b.x + (Math.random() - 0.5) * b.w;
    pk.y[k] = 0.3 + Math.random() * B_H;
    pk.z[k] = b.z + (Math.random() - 0.5) * 0.5;
    pk.vx[k] = (pk.x[k] - b.x) * 1.4 + (Math.random() - 0.5) * 3;
    pk.vy[k] = 3.2 + Math.random() * 5.2;
    pk.vz[k] = -3.4 - Math.random() * 3.4;
    pk.rx[k] = Math.random() * 6.28; pk.ry[k] = Math.random() * 6.28;
    pk.wx[k] = (Math.random() - 0.5) * 16; pk.wy[k] = (Math.random() - 0.5) * 16;
    pk.s[k] = 0.7 + Math.random() * 0.9;
    pk.life[k] = 0.9 + Math.random() * 0.5;
  }
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------
export function resetBarriers(level) {
  if (!wallMesh) return null;
  for (let i = active.length - 1; i >= 0; i--) release(active[i]);
  active.length = 0;
  defs = (level?.items || []).filter((it) => it.kind === 'barrier');
  nextDef = 0;
  prevZ = 0;
  pkCount = 0;
  wallMesh.count = plankMesh.count = 0;
  return defs.length;
}

export function updateBarriers(dt) {
  if (!wallMesh) return null;
  const z = state.z;

  while (nextDef < defs.length && defs[nextDef].z - z <= FADE_START) {
    if (active.length >= MAX_WALLS) break;
    acquire(defs[nextDef++]);
  }

  labels.begin();
  let n = 0;

  for (let i = active.length - 1; i >= 0; i--) {
    const b = active[i];
    const d = b.z - z;

    // Bodying a live wall. It costs a fraction of the squad ONCE — the rest
    // slide around it, which is army.js's business, not ours. We only announce
    // the loss; see the MANAGER note in gates.js about who applies it.
    if (!b.dead && !b.touched && b.z <= z && b.z > prevZ) {
      if (Math.abs(state.x - b.x) <= b.w * 0.5 + 0.4) {
        b.touched = true;
        const lost = Math.max(1, Math.round(state.troops * BARRIER.killOnTouch));
        emit('army:count', { count: Math.max(0, state.troops - lost), delta: -lost, reason: 'barrier' });
        emit('fx:explosion', { pos: { x: b.x, y: 1.0, z: b.z }, scale: 1.0, color: PAL.enemyDark });
        emit('fx:shake', { amount: 0.42 });
        emit('fx:number', { pos: { x: b.x, y: 2.2, z: b.z }, text: '-' + lost, color: PAL.enemy });
      }
    }

    if (b.crumble >= 0) {
      b.crumble += dt;
      if (b.crumble >= BARRIER.crumbleTime) { release(b); continue; }
    } else if (d < -DESPAWN_BEHIND) {
      release(b);
      continue;
    }

    const t = clamp((FADE_START - d) / POP_M, 0, 1);
    let s = 0.2 + 0.8 * smoothstep(t);
    let sink = 0;
    if (b.crumble >= 0) {
      // sink and shrink; the planks are already in the air
      const c = b.crumble / BARRIER.crumbleTime;
      s *= Math.max(0, 1 - c);
      sink = -c * 1.2;
    }

    writeScaled(wallArr, n * 16, (b.w / B_W) * s, s, s, b.x, sink, b.z);
    n++;

    if (s > 0.05 && b.crumble < 0) {
      // The number IS the health bar. `fmt` keeps a 1200 hp wall to four
      // glyphs so it still fills the plank face instead of shrinking to fit.
      const txt = b.hp >= 1000 ? fmt(b.hp) : String(Math.ceil(b.hp));
      b.shown = txt;
      labels.label(txt, '', b.x, NUM_Y * s, b.z + NUM_Z * s, b.w * 0.72 * s, NUM_H * s, 0);
    }
  }

  labels.end();
  wallMesh.count = n;
  wallMesh.instanceMatrix.needsUpdate = true;

  updatePlanks(dt);
  prevZ = z;
  return active.length;
}

function updatePlanks(dt) {
  for (let i = pkCount - 1; i >= 0; i--) {
    pk.life[i] -= dt;
    if (pk.life[i] <= 0) {
      const last = --pkCount;
      if (i !== last) for (let f = 0; f < PK_FIELDS.length; f++) { const a = pk[PK_FIELDS[f]]; a[i] = a[last]; }
      continue;
    }
    pk.vy[i] -= 20 * dt;
    pk.x[i] += pk.vx[i] * dt; pk.y[i] += pk.vy[i] * dt; pk.z[i] += pk.vz[i] * dt;
    pk.rx[i] += pk.wx[i] * dt; pk.ry[i] += pk.wy[i] * dt;
    if (pk.y[i] < 0.12) { pk.y[i] = 0.12; pk.vy[i] *= -0.3; pk.vx[i] *= 0.62; pk.vz[i] *= 0.62; }
    _v.set(pk.x[i], pk.y[i], pk.z[i]);
    _q.setFromEuler(_e.set(pk.rx[i], pk.ry[i], 0));
    const k = pk.s[i] * Math.min(1, pk.life[i] * 3);
    _s.set(k, k, k);
    _m.compose(_v, _q, _s);
    _m.toArray(plankArr, i * 16);
  }
  plankMesh.count = pkCount;
  plankMesh.instanceMatrix.needsUpdate = true;
}

function writeScaled(arr, o, sx, sy, sz, x, y, z) {
  arr[o] = sx; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

/**
 * Bullet vs wall. Same contract as `gateHitTest`: walks the small active window,
 * allocates nothing, returns the barrier or null. The caller calls `hit(dmg)`.
 */
export function barrierHitTest(x, y, z, r = 0.3) {
  for (let i = 0; i < active.length; i++) {
    const b = active[i];
    if (b.dead) continue;
    const dz = z - b.z;
    if (dz < -r - 0.6 || dz > r + 0.6) continue;
    if (Math.abs(x - b.x) > b.w * 0.5 + r) continue;
    if (y > B_H + 0.5 + r) continue;
    return b;
  }
  return null;
}

// Does a still-standing wall cover this lane? army.js can use this to slide the
// formation around one instead of walking men into it.
export function barrierBlocks(x, z, r = 0.4) {
  for (let i = 0; i < active.length; i++) {
    const b = active[i];
    if (b.dead) continue;
    if (Math.abs(z - b.z) > 1.2) continue;
    if (Math.abs(x - b.x) <= b.w * 0.5 + r) return b;
  }
  return null;
}

export function disposeBarriers() {
  if (!wallMesh) return;
  // The wall material is signs.js's shared `wood` — gates.js instances it too,
  // so disposeSigns() owns it. Only the plank material is ours.
  plankMesh.material.dispose();
  for (const m of [wallMesh, plankMesh]) {
    m.parent?.remove(m);
    m.geometry.dispose();
    m.dispose();
  }
  wallMesh = plankMesh = null;
  active.length = 0; pool.length = 0; defs = [];
}
