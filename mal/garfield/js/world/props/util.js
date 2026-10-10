import * as THREE from '../../../vendor/three/three.module.js';
import { mergeGeometries } from '../../../vendor/three/addons/utils/BufferGeometryUtils.js';

export { THREE, mergeGeometries };

export const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outBack: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export const clamp01 = v => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Time-based tweens; every animating action returns one of these Promises.
export class Anim {
  constructor() { this.list = []; }
  tween(dur, fn, e = ease.inOut) {
    return new Promise(res => {
      const tw = { t: 0, dur: Math.max(1e-4, dur), fn, e, res };
      fn(e(0), 0);
      this.list.push(tw);
    });
  }
  wait(dur) { return this.tween(dur, () => {}, ease.linear); }
  update(dt) {
    if (!this.list.length) return;
    const done = [];
    for (const tw of this.list) {
      tw.t = Math.min(tw.dur, tw.t + dt);
      const r = tw.t / tw.dur;
      tw.fn(tw.e(r), r);
      if (r >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter(t => !done.includes(t));
      for (const t of done) t.res();
    }
  }
  clear() { const l = this.list; this.list = []; for (const t of l) t.res(); }
  get busy() { return this.list.length > 0; }
}

// Inverted-hull glow outline shared by every prop's highlight(on).
let OUTLINE = null;
function outlineMat() {
  if (OUTLINE) return OUTLINE;
  OUTLINE = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffb02e) }, width: { value: 0.012 }, alpha: { value: 0.8 } },
    vertexShader: `uniform float width; void main(){ vec3 p = position + normal * width; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float alpha; void main(){ gl_FragColor = vec4(color, alpha); }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
  });
  return OUTLINE;
}
let hlTime = 0;
export function tickHighlight(dt) { hlTime += dt; if (OUTLINE) { OUTLINE.uniforms.alpha.value = 0.55 + 0.35 * Math.sin(hlTime * 6); OUTLINE.uniforms.width.value = 0.01 + 0.004 * Math.sin(hlTime * 6); } }

export function makeProp(id, ctx) {
  const root = new THREE.Group();
  root.name = 'prop_' + id;
  const anim = new Anim();
  const p = {
    id, root, colliders: [], state: {}, anim,
    sfx: (n, o) => ctx?.sfx?.(n, o),
    _updaters: [],
    update(dt) { anim.update(dt); for (const u of p._updaters) u(dt); },
    reset() {},
    onUpdate(fn) { p._updaters.push(fn); },
    // glow outline for 'you can scratch/interact with this'; target defaults to the whole prop
    highlight(on = true, target = p.root) {
      if (!p._hulls) p._hulls = new Map();
      if (!p._hulls.has(target)) {
        const list = [];
        target.traverse(o => {
          if (!o.isMesh || o.isInstancedMesh || o.userData.isHull || !o.geometry?.attributes?.normal) return;
          const h = new THREE.Mesh(o.geometry, outlineMat());
          h.userData.isHull = true; h.visible = false; h.renderOrder = 3; h.frustumCulled = false;
          list.push([o, h]);
        });
        for (const [o, h] of list) o.add(h);
        p._hulls.set(target, list.map(x => x[1]));
      }
      for (const h of p._hulls.get(target)) h.visible = !!on;
      p.state.highlighted = !!on;
    },
  };
  return p;
}

// World-space AABB collider tied to a local box on some Object3D; syncColliders() refreshes it in place.
export function addBox(prop, id, obj, lmin, lmax, kind = 'solid') {
  const c = {
    id: prop.id + ':' + id, min: new THREE.Vector3(), max: new THREE.Vector3(), kind, enabled: true,
    prop: prop.id, _obj: obj, _lmin: new THREE.Vector3(...lmin), _lmax: new THREE.Vector3(...lmax),
  };
  prop.colliders.push(c);
  return c;
}
const _v = new THREE.Vector3();
export function syncCollider(c) {
  c._obj.updateWorldMatrix(true, false);
  c.min.set(Infinity, Infinity, Infinity); c.max.set(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? c._lmax.x : c._lmin.x, i & 2 ? c._lmax.y : c._lmin.y, i & 4 ? c._lmax.z : c._lmin.z)
      .applyMatrix4(c._obj.matrixWorld);
    c.min.min(_v); c.max.max(_v);
  }
}
export function syncColliders(prop) { for (const c of prop.colliders) syncCollider(c); }

export function place(prop, anchor) {
  if (!anchor) return;
  if (anchor.pos) prop.root.position.copy(anchor.pos);
  if (anchor.rotY != null) prop.root.rotation.y = anchor.rotY;
}

let QUALITY = 'high';
export function setPropQuality(q) { QUALITY = q === 'med' ? 'medium' : (q || 'high'); }
export const propQuality = () => QUALITY;

// Rounded box with analytic smooth normals. seg drops on medium/low quality.
// nx (optional): extra evenly spaced slices along X between the rounded ends, so the box can bend (table.warp)
export function roundedBox(w, h, d, r, seg = 3, nx = 0) {
  seg = QUALITY === 'low' ? 1 : QUALITY === 'medium' ? Math.min(seg, 2) : seg;
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const s = seg * 2 + 1, sx = nx ? seg * 2 + nx : s;
  const g = new THREE.BoxGeometry(w, h, d, sx, s, s);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  const map = (x, hw) => {
    const idx = Math.round((x / hw + 1) / 2 * s);
    if (idx <= seg) return -hw + r * idx / seg;
    if (idx >= s - seg) return hw - r * (s - idx) / seg;
    return 0;
  };
  const mapX = (x, hw) => {
    if (!nx) return map(x, hw);
    const idx = Math.round((x / hw + 1) / 2 * sx);
    if (idx <= seg) return -hw + r * idx / seg;
    if (idx >= sx - seg) return hw - r * (sx - idx) / seg;
    return -hw + r + (2 * hw - 2 * r) * (idx - seg) / nx;
  };
  const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const a = [mapX(p.x, half[0]), map(p.y, half[1]), map(p.z, half[2])];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(p.getComponent(k)) >= half[k] - 1e-6) a[k] = Math.sign(p.getComponent(k)) * half[k];
    }
    p.set(a[0], a[1], a[2]);
    c.set(THREE.MathUtils.clamp(p.x, -half[0] + r, half[0] - r), THREE.MathUtils.clamp(p.y, -half[1] + r, half[1] - r),
      THREE.MathUtils.clamp(p.z, -half[2] + r, half[2] - r));
    n.subVectors(p, c);
    if (n.lengthSq() < 1e-10) n.fromBufferAttribute(nor, i);
    n.normalize();
    p.copy(c).addScaledVector(n, r);
    pos.setXYZ(i, p.x, p.y, p.z); nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// Lathe from [radius, y] pairs.
export function lathe(pts, segs = 32) {
  segs = Math.max(8, Math.round(segs * (QUALITY === 'low' ? 0.5 : QUALITY === 'medium' ? 0.7 : 1)));
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  g.computeVertexNormals();
  return g;
}

export function xform(geo, { pos, rot, scale } = {}) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...(pos || [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))),
    new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale ?? 1, scale ?? 1, scale ?? 1])));
  return geo.applyMatrix4(m);
}

function norm(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (color != null) {
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// Collects geometry per material, merges into one mesh per material (draw-call budget).
export class Builder {
  constructor() { this.parts = new Map(); }
  // color: per-part vertex colour for palette materials (vertexColors: true) so many parts share one draw call
  add(geo, mat, t, color) {
    if (t) xform(geo, t);
    if (this.matrix) geo.applyMatrix4(this.matrix);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(norm(geo, mat.vertexColors ? (color ?? 0xffffff) : null));
    return this;
  }
  // vertex count per material so far (for drawRange-based hiding of merged sub-parts)
  marks() { const m = new Map(); for (const [k, g] of this.parts) m.set(k, g.reduce((a, x) => a + x.attributes.position.count, 0)); return m; }
  build(name = 'merged', { cast = true, receive = true } = {}) {
    const grp = new THREE.Group(); grp.name = name;
    for (const [mat, geos] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = cast; m.receiveShadow = receive; m.userData.mat = mat;
      grp.add(m);
    }
    this.parts.clear();
    return grp;
  }
}

// Shared palette materials: tint per part via Builder.add(..., color).
let PAL = null;
export function palette() {
  if (PAL) return PAL;
  PAL = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    gloss: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.28 }),
  };
  return PAL;
}

export function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });
}
export function gloss(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, ...o });
}

const texCache = new Map();
export function canvasTex(key, w, h, draw, { repeat, srgb = true } = {}) {
  const k = key + (repeat ? repeat.join(',') : '');
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  texCache.set(k, t);
  return t;
}

export function woodTex(base = '#a8673a', dark = '#7a4523', key = 'wood') {
  return canvasTex(key + base, 256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = dark; g.globalAlpha = 0.08 + r() * 0.18; g.lineWidth = 1 + r() * 3;
      g.beginPath(); const x0 = r() * w;
      for (let y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * 0.03 + i) * 6 + Math.sin(y * 0.11 + i * 3) * 2, y);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

// Instanced short-lived particles in world space (splinters, crumbs, feathers, shards, breeze).
export class Particles {
  constructor(scene, { count = 64, geo, material, gravity = -9.8, drag = 0.5, floorY = 0, bounce = 0.25, shadows = false }) {
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.count = 0; this.mesh.visible = false;
    this.p = [];
    this.max = count; this.gravity = gravity; this.drag = drag; this.floorY = floorY; this.bounce = bounce;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3();
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    const q = {
      pos: o.pos.clone(), vel: o.vel ? o.vel.clone() : new THREE.Vector3(),
      rot: o.rot ? o.rot.clone() : new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: o.spin ? o.spin.clone() : new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      life: o.life ?? 1.5, age: 0, size: o.size ?? 1, sizeEnd: o.sizeEnd ?? o.size ?? 1,
      scale: o.scale || null, floorY: o.floorY ?? this.floorY, gravity: o.gravity ?? this.gravity,
      drag: o.drag ?? this.drag, rest: false, flat: o.flat ?? false, color: o.color || null,
      sway: o.sway || 0,
    };
    this.p.push(q);
    return q;
  }
  update(dt) {
    const keep = [];
    for (const q of this.p) {
      q.age += dt;
      if (q.age >= q.life) continue;
      if (!q.rest) {
        q.vel.y += q.gravity * dt;
        q.vel.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        if (q.sway) { q.vel.x += Math.sin(q.age * 5 + q.size * 50) * q.sway * dt; q.vel.z += Math.cos(q.age * 4 + q.size * 70) * q.sway * dt; }
        q.pos.addScaledVector(q.vel, dt);
        q.rot.addScaledVector(q.spin, dt);
        if (q.pos.y < q.floorY) {
          q.pos.y = q.floorY;
          if (Math.abs(q.vel.y) < 0.6) {
            q.rest = true;
            if (q.flat) q.rot.set(0, q.rot.y, 0);
          } else {
            q.vel.y = -q.vel.y * this.bounce; q.vel.x *= 0.5; q.vel.z *= 0.5; q.spin.multiplyScalar(0.5);
          }
        }
      }
      keep.push(q);
    }
    this.p = keep;
    const m = this._m;
    for (let i = 0; i < keep.length; i++) {
      const q = keep[i];
      const k = q.age / q.life;
      const s = lerp(q.size, q.sizeEnd, k);
      this._q.setFromEuler(this._e.set(q.rot.x, q.rot.y, q.rot.z));
      if (q.scale) this._s.set(q.scale.x * s, q.scale.y * s, q.scale.z * s); else this._s.setScalar(s);
      m.compose(q.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, m);
      if (q.color && this.mesh.instanceColor !== undefined) this.mesh.setColorAt(i, q.color);
    }
    this.mesh.count = keep.length;
    this.mesh.visible = keep.length > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.p = []; this.mesh.count = 0; this.mesh.visible = false; }
}

export function worldPos(obj, out = new THREE.Vector3()) { obj.updateWorldMatrix(true, false); return obj.getWorldPosition(out); }
