// Cosmetics in the scene (PLAN 2.4): ball skins (canvas-texture patterns, a glowing ball, a gold
// ball) and trails while the ball rolls. Also draws the shop's ball previews from the same canvas.
import * as THREE from 'three';
import { BALL_R } from '../engine/constants.js';
import { BALL_BY_ID, TRAIL_BY_ID } from './economy.js';

// Equirect texture (2:1) for a skin: base colour, dimples, then the pattern.
export function skinCanvas(skin, W = 256) {
  const H = W / 2, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), k = W / 128;
  g.fillStyle = skin.base; g.fillRect(0, 0, W, H);
  const A = skin.accent;
  switch (skin.pattern) {
    case 'stripe': g.fillStyle = A; g.fillRect(0, H / 2 - 2 * k, W, 4 * k); break;
    case 'swirl':
      g.fillStyle = A;
      for (let i = -4; i < 12; i++) { g.beginPath(); const x = i * 16 * k; g.moveTo(x, 0); g.lineTo(x + 7 * k, 0); g.lineTo(x + 7 * k + H * 0.6, H); g.lineTo(x + H * 0.6, H); g.fill(); }
      break;
    case 'dots':
      g.fillStyle = A;
      for (let y = 6 * k; y < H; y += 13 * k) for (let x = ((y / k / 13) % 2 ? 6.5 * k : 0); x < W; x += 13 * k) { g.beginPath(); g.arc(x, y, 3.4 * k, 0, 7); g.fill(); }
      break;
    case 'checker': {
      g.fillStyle = A; const n = 8, m = 4, cw = W / n, ch = H / m;
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if ((i + j) % 2) g.fillRect(i * cw, j * ch, cw, ch);
      break;
    }
    case 'stars': {
      g.fillStyle = A;
      const star = (x, y, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
      const pts = [[10, 12, 5], [34, 30, 4], [58, 14, 6], [80, 40, 4], [100, 18, 5], [120, 46, 4], [22, 50, 4], [70, 54, 3], [46, 44, 3], [112, 6, 3]];
      for (const [x, y, r] of pts) star(x * k, y * k, r * k);
      g.fillStyle = 'rgba(255,255,255,.6)';
      for (let i = 0; i < 40; i++) g.fillRect(((i * 37) % 128) * k, ((i * 23) % 64) * k, k, k);
      break;
    }
  }
  if (!skin.metal) {   // dimples, so the roll reads on any skin
    g.fillStyle = skin.glow ? 'rgba(0,80,120,0.10)' : 'rgba(0,0,0,0.07)';
    for (let y = 4 * k; y < H; y += 7 * k) for (let x = ((y / k) % 14 ? 0 : 3.5 * k); x < W; x += 7 * k) { g.beginPath(); g.arc(x, y, 1.6 * k, 0, 7); g.fill(); }
  }
  return c;
}

const glowTex = (() => { let t = null; return () => {
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (t = new THREE.CanvasTexture(c));
}; })();

// The ball mesh for a skin id (unknown → classic). dispose with disposeBall().
export function makeSkinnedBall(id = 'classic') {
  const skin = BALL_BY_ID[id] || BALL_BY_ID.classic;
  const tex = new THREE.CanvasTexture(skinCanvas(skin)); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 });
  if (skin.metal) Object.assign(mat, { metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
  if (skin.glow) { mat.emissive = new THREE.Color(skin.accent); mat.emissiveIntensity = 0.9; mat.emissiveMap = tex; }
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), mat);
  mesh.castShadow = true;
  mesh.name = 'ball';
  mesh.userData.skin = skin.id;
  if (skin.glow) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: skin.accent, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    halo.scale.setScalar(BALL_R * 6); halo.renderOrder = 4; halo.userData.noOcclude = true;
    mesh.add(halo);
  }
  return mesh;
}
export function disposeBall(mesh) {
  mesh.geometry.dispose(); mesh.material.map?.dispose(); mesh.material.dispose();
  for (const ch of mesh.children) ch.material?.dispose();
}

// Shop preview: the skin texture wrapped into a shaded disc. → data URL
export function ballPreview(id, size = 96) {
  const skin = BALL_BY_ID[id] || BALL_BY_ID.classic;
  const tex = skinCanvas(skin, 128);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2 - 4;
  g.save(); g.beginPath(); g.arc(size / 2, size / 2, r, 0, 7); g.clip();
  g.drawImage(tex, 24, 0, 80, 64, size / 2 - r, size / 2 - r, 2 * r, 2 * r);
  const sh = g.createRadialGradient(size * 0.36, size * 0.32, r * 0.1, size / 2, size / 2, r);
  if (skin.metal) { sh.addColorStop(0, 'rgba(255,250,220,.9)'); sh.addColorStop(0.35, 'rgba(255,220,120,.1)'); sh.addColorStop(1, 'rgba(90,50,0,.6)'); }
  else { sh.addColorStop(0, 'rgba(255,255,255,.55)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.4)'); }
  g.fillStyle = sh; g.fillRect(0, 0, size, size);
  g.restore();
  if (skin.glow) { g.globalCompositeOperation = 'destination-over'; const gl = g.createRadialGradient(size / 2, size / 2, r * 0.8, size / 2, size / 2, size / 2); gl.addColorStop(0, skin.accent); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(0, 0, size, size); }
  return c.toDataURL();
}
export function trailPreviewCSS(id) {
  const t = TRAIL_BY_ID[id];
  if (!t || !t.colors.length) return 'repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 6px, transparent 6px 12px)';
  if (t.sparkle) return `radial-gradient(circle at 20% 50%, ${t.colors[0]} 0 2px, transparent 3px), radial-gradient(circle at 45% 30%, ${t.colors[1]} 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, ${t.colors[0]} 0 1.5px, transparent 2.5px), radial-gradient(circle at 88% 40%, ${t.colors[1]} 0 2.5px, transparent 3.5px), linear-gradient(90deg, transparent, ${t.colors[1]}55)`;
  return `linear-gradient(90deg, transparent, ${t.colors.slice().reverse().join(', ')})`;
}

// ---- trails ----
const N = 48, LIFE = 0.75, SPARKS = 70;
const _c = new THREE.Color();
export class Trail {
  constructor(scene, id) {
    this.def = TRAIL_BY_ID[id] || TRAIL_BY_ID.none;
    this.on = this.def.colors.length > 0;
    if (!this.on) return;
    this.scene = scene;
    this.pts = [];   // { x, y, z, t }
    this.time = 0;
    this.cols = this.def.colors.map(c => new THREE.Color(c));
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3); this.col = new Float32Array(N * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: this.def.sparkle ? 0.35 : 0.9 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.userData.noOcclude = true;
    scene.add(this.mesh);
    if (this.def.sparkle) {
      this.sp = Array.from({ length: SPARKS }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, t: 99 }));
      this.spNext = 0;
      const pg = new THREE.BufferGeometry();
      this.spPos = new Float32Array(SPARKS * 3); this.spCol = new Float32Array(SPARKS * 4);
      pg.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3).setUsage(THREE.DynamicDrawUsage));
      pg.setAttribute('color', new THREE.BufferAttribute(this.spCol, 4).setUsage(THREE.DynamicDrawUsage));
      this.spGeo = pg;
      this.spMat = new THREE.PointsMaterial({ size: 0.045, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      this.points = new THREE.Points(pg, this.spMat);
      this.points.frustumCulled = false; this.points.renderOrder = 3; this.points.userData.noOcclude = true;
      scene.add(this.points);
    }
    this.seed = 1;
  }
  clear() { if (this.on) { this.pts.length = 0; if (this.sp) for (const s of this.sp) s.t = 99; } }
  // p = ball centre; emitting = the ball is rolling (a trail only grows while it moves)
  update(dt, p, emitting) {
    if (!this.on) return;
    this.time += dt;
    const T = this.time, last = this.pts[this.pts.length - 1];
    if (emitting && (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 0.018)) {
      this.pts.push({ x: p.x, y: p.y, z: p.z, t: T });
      if (this.pts.length > N) this.pts.shift();
      if (this.sp) for (let k = 0; k < 2; k++) this._spark(p);
    }
    while (this.pts.length && T - this.pts[0].t > LIFE) this.pts.shift();
    const n = this.pts.length;
    if (n >= 2) {
      const C = this.cols;
      for (let i = 0; i < n; i++) {
        const q = this.pts[i], a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(n - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const age = Math.min(1, (T - q.t) / LIFE), head = i / (n - 1);   // head 1 = newest
        const w = BALL_R * (0.25 + 0.7 * head) * (1 - age);
        const y = q.y - BALL_R * 0.35, o = i * 6;
        this.pos[o] = q.x - dz * w; this.pos[o + 1] = y; this.pos[o + 2] = q.z + dx * w;
        this.pos[o + 3] = q.x + dz * w; this.pos[o + 4] = y; this.pos[o + 5] = q.z - dx * w;
        const u = (1 - head) * (C.length - 1), j = Math.min(C.length - 2, Math.floor(u));
        if (C.length > 1) _c.copy(C[j]).lerp(C[j + 1], u - j); else _c.copy(C[0]);
        const al = (1 - age) * (0.25 + 0.75 * head);
        for (const v of [0, 1]) { const c = i * 8 + v * 4; this.col[c] = _c.r; this.col[c + 1] = _c.g; this.col[c + 2] = _c.b; this.col[c + 3] = al; }
      }
      this.geo.setDrawRange(0, (n - 1) * 6);
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
      this.mesh.visible = true;
    } else this.mesh.visible = false;
    if (this.sp) {
      for (let i = 0; i < SPARKS; i++) {
        const s = this.sp[i]; s.t += dt;
        const al = s.t < 0.9 ? 1 - s.t / 0.9 : 0;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= 0.4 * dt;
        this.spPos[i * 3] = s.x; this.spPos[i * 3 + 1] = al ? s.y : -999; this.spPos[i * 3 + 2] = s.z;
        _c.copy(this.cols[i % this.cols.length]);
        this.spCol[i * 4] = _c.r; this.spCol[i * 4 + 1] = _c.g; this.spCol[i * 4 + 2] = _c.b; this.spCol[i * 4 + 3] = al * (0.6 + 0.4 * Math.sin(s.t * 30 + i));
      }
      this.spGeo.attributes.position.needsUpdate = true; this.spGeo.attributes.color.needsUpdate = true;
    }
  }
  _spark(p) {
    const r = () => { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647 - 0.5; };   // visual only
    const s = this.sp[this.spNext]; this.spNext = (this.spNext + 1) % SPARKS;
    Object.assign(s, { x: p.x + r() * 0.05, y: p.y + r() * 0.04, z: p.z + r() * 0.05, vx: r() * 0.25, vy: 0.12 + r() * 0.2, vz: r() * 0.25, t: 0 });
  }
  dispose() {
    if (!this.on) return;
    this.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose();
    if (this.points) { this.scene.remove(this.points); this.spGeo.dispose(); this.spMat.dispose(); }
  }
}
