// Particles + juicy feedback. One pooled THREE.Points system handles the
// high-volume stuff (offroad dust, tyre smoke, damage smoke, fire, water
// spray); an actives list handles bespoke effects (explosions, tracers,
// flung props, muzzle flashes).

import * as THREE from 'three';
import { rand, M, mesh } from './utils.js';
import { CFG, FLAG } from './config.js';

let scene = null;
const actives = [];

// ── pooled soft-puff points ──
const CAP = FLAG.lite ? CFG.fx.liteDustCap : CFG.fx.dustCap;
let pts, pGeo, pos, col, sizes, life, maxLife, vel, grow, head = 0, alive = 0;

function makePuffTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function initFx(s) {
  scene = s;
  pGeo = new THREE.BufferGeometry();
  pos = new Float32Array(CAP * 3); col = new Float32Array(CAP * 3);
  sizes = new Float32Array(CAP); life = new Float32Array(CAP);
  maxLife = new Float32Array(CAP); vel = new Float32Array(CAP * 3);
  grow = new Float32Array(CAP);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  pGeo.setAttribute('psize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: makePuffTex() } },
    vertexShader: `attribute float psize; varying vec3 vc;
      void main(){ vc = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = psize * (240.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vc;
      void main(){ vec4 t = texture2D(map, gl_PointCoord);
      gl_FragColor = vec4(vc, t.a); if (gl_FragColor.a < 0.02) discard; }`,
    vertexColors: true, transparent: true, depthWrite: false,
  });
  pts = new THREE.Points(pGeo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  scene.add(pts);
  for (let i = 0; i < CAP; i++) life[i] = -1;
}

export function puff(x, y, z, { color = 0xcdb894, size = 1.4, up = 1.2, spread = 0.8, t = 0.9, growK = 1.6, vx = 0, vz = 0 } = {}) {
  const i = head; head = (head + 1) % CAP;
  pos[i * 3] = x + rand(-spread, spread) * 0.4;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = z + rand(-spread, spread) * 0.4;
  const c = new THREE.Color(color).multiplyScalar(rand(0.85, 1.1));
  col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  sizes[i] = size * rand(0.7, 1.25);
  life[i] = maxLife[i] = t * rand(0.7, 1.2);
  vel[i * 3] = vx + rand(-spread, spread);
  vel[i * 3 + 1] = up * rand(0.6, 1.3);
  vel[i * 3 + 2] = vz + rand(-spread, spread);
  grow[i] = growK;
  alive = Math.min(alive + 1, CAP);
}

const TERRAIN_DUST = { g: 0x86a05c, d: 0xb08d5a, s: 0xd8c48e, w: 0x9fd4e8, r: 0x9a9a9a, p: 0x9a9a9a };
export function dust(x, z, terrain, speedFrac) {
  puff(x, 0.25, z, {
    color: TERRAIN_DUST[terrain] || 0xb0a080, size: 1.3 + speedFrac * 1.6,
    up: 0.8, spread: 1.1, t: 0.7 + speedFrac * 0.4,
  });
}
export function tyreSmoke(x, z) {
  puff(x, 0.2, z, { color: 0xdedede, size: 1.15, up: 0.55, spread: 0.5, t: 0.55 });
}
export function damageSmoke(x, y, z, heavy) {
  puff(x, y, z, {
    color: heavy ? 0x2a2a2e : 0x8a8a92, size: heavy ? 1.6 : 1.1,
    up: 1.9, spread: 0.3, t: 1.25, growK: 2.0,
  });
}
export function firePuff(x, y, z) {
  puff(x, y, z, { color: rand(0, 1) < 0.5 ? 0xff9a2e : 0xffd23e, size: 1.0, up: 2.4, spread: 0.25, t: 0.4, growK: 0.4 });
}
export function splash(x, z, big = false) {
  for (let i = 0; i < (big ? 14 : 5); i++)
    puff(x, 0.15, z, { color: 0xbfe6f5, size: big ? 1.7 : 1.0, up: big ? 3.2 : 1.6, spread: 1.4, t: 0.55 });
}
export function flameJet(x, y, z, dx, dz) {
  puff(x, y, z, {
    color: rand(0, 1) < 0.4 ? 0xffdd55 : 0xff8a2e, size: 1.15, up: 0.4,
    spread: 0.35, t: 0.38, growK: 2.6, vx: dx * 11, vz: dz * 11,
  });
}
export function waterJet(x, y, z, dx, dz) {
  puff(x, y, z, { color: 0xbfe6f5, size: 1.1, up: 0.7, spread: 0.4, t: 0.5, growK: 1.9, vx: dx * 14, vz: dz * 14 });
}

function tickPuffs(dt) {
  let liveCount = 0;
  for (let i = 0; i < CAP; i++) {
    if (life[i] < 0) { sizes[i] = 0; continue; }
    life[i] -= dt;
    if (life[i] < 0) { sizes[i] = 0; continue; }
    liveCount++;
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    vel[i * 3] *= 1 - 1.4 * dt; vel[i * 3 + 2] *= 1 - 1.4 * dt;
    const k = 1 - life[i] / maxLife[i];
    sizes[i] += grow[i] * dt;
    if (k > 0.6) sizes[i] *= 1 - 2.2 * (k - 0.6) * dt * 8;
  }
  alive = liveCount;
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
  pGeo.attributes.psize.needsUpdate = true;
}

// ── actives helpers ──
function addActive(a) { actives.push(a); }

let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,230,170,1)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.55)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(scl, opacity = 1, color = null) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTex(), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  if (color) sp.material.color.set(color);
  sp.scale.set(scl, scl, 1);
  return sp;
}

export function muzzleFlash(p) {
  const sp = glowSprite(0.9, 1);
  sp.position.copy(p);
  scene.add(sp);
  let age = 0;
  addActive({
    obj: sp,
    tick(dt) { age += dt; const k = age / 0.06; sp.material.opacity = 1 - k; return k < 1; },
    dispose() { sp.material.dispose(); },
  });
}

const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
export function tracer(from, to, color = null) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat.clone());
  if (color) line.material.color.set(color);
  line.renderOrder = 5;
  scene.add(line);
  let age = 0;
  addActive({
    obj: line,
    tick(dt) { age += dt; line.material.opacity = 1 - age / 0.08; return age < 0.08; },
    dispose() { geo.dispose(); line.material.dispose(); },
  });
}

export function sparks(p, n = 6, color = 0xffd76a) {
  for (let i = 0; i < n; i++) {
    const m = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color }), p.x, p.y, p.z, false);
    const v = new THREE.Vector3(rand(-4, 4), rand(1, 5), rand(-4, 4));
    scene.add(m);
    let age = 0;
    addActive({
      obj: m,
      tick(dt) {
        age += dt; v.y -= 14 * dt;
        m.position.addScaledVector(v, dt);
        return age < 0.5 && m.position.y > 0;
      },
      dispose() { m.material.dispose(); },
    });
  }
}

// big boom: flash + fireball + smoke column + shock ring + debris
export function explosion(x, y, z, r = 5) {
  const p = new THREE.Vector3(x, y + 0.6, z);
  const fl = glowSprite(r * 1.7, 1);
  fl.position.copy(p); scene.add(fl);
  let fa = 0;
  addActive({ obj: fl, tick(dt) { fa += dt; const k = fa / 0.16; fl.scale.setScalar(r * (1.7 + k)); fl.material.opacity = 1 - k; return k < 1; }, dispose() { fl.material.dispose(); } });
  const ringGeo = new THREE.RingGeometry(0.4, 0.7, 26);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.25, z);
  scene.add(ring);
  let ra = 0;
  addActive({ obj: ring, tick(dt) { ra += dt; const k = ra / 0.45; ring.scale.setScalar(1 + k * r * 2.2); ring.material.opacity = 0.9 * (1 - k); return k < 1; }, dispose() { ringGeo.dispose(); ring.material.dispose(); } });
  for (let i = 0; i < 16; i++) {
    setTimeout(() => {
      firePuff(x + rand(-1, 1), y + rand(0.2, 1.4), z + rand(-1, 1));
      puff(x, y + 0.6, z, { color: 0x33343a, size: 2.4, up: 2.8, spread: 1.6, t: 1.6, growK: 2.6 });
    }, i * 34);
  }
  sparks(p, 12, 0xff9a3e);
}

// smashable prop hit: fling the model with spin + fade, plus confetti bits
export function flingProp(obj, vx, vz, cash = 0) {
  const v = new THREE.Vector3(vx, rand(3.5, 6.5), vz);
  const spin = new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7));
  let age = 0;
  addActive({
    obj,
    tick(dt) {
      age += dt;
      v.y -= 16 * dt;
      obj.position.addScaledVector(v, dt);
      obj.rotation.x += spin.x * dt; obj.rotation.y += spin.y * dt; obj.rotation.z += spin.z * dt;
      const k = Math.max(0, 1 - age / 1.1);
      obj.scale.setScalar(Math.max(0.01, k));
      return age < 1.1;
    },
  });
}

// pickup burst (cash/weapon collect)
export function collectBurst(p, color = 0x8ef0b2) {
  for (let i = 0; i < 8; i++) {
    const sp = glowSprite(0.4, 0.9, color);
    sp.position.copy(p);
    const v = new THREE.Vector3(rand(-2.5, 2.5), rand(2, 5), rand(-2.5, 2.5));
    scene.add(sp);
    let age = 0;
    addActive({
      obj: sp,
      tick(dt) { age += dt; v.y -= 9 * dt; sp.position.addScaledVector(v, dt); sp.material.opacity = 0.9 * (1 - age / 0.6); return age < 0.6; },
      dispose() { sp.material.dispose(); },
    });
  }
}

export function tickFx(dt) {
  tickPuffs(dt);
  for (let i = actives.length - 1; i >= 0; i--) {
    if (!actives[i].tick(dt)) {
      scene.remove(actives[i].obj);
      actives[i].dispose?.();
      actives.splice(i, 1);
    }
  }
}
export function clearFx() {
  for (const a of actives) { scene.remove(a.obj); a.dispose?.(); }
  actives.length = 0;
  for (let i = 0; i < CAP; i++) { life[i] = -1; sizes[i] = 0; }
}
