import * as THREE from 'three';
import { pathX, glowTexture, cloudTexture, mat, rng, globalU } from './util.js';

const glowTex = glowTexture();
const smokeTex = cloudTexture(128, 9);

export function createFX(scene) {
  const N = 600;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), home = new Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: glowTex }, px: { value: Math.min(devicePixelRatio, 2) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `attribute float size; varying vec3 vC; uniform float px;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * px * 260.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a * 1.5, t.a); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  let next = 0;
  const c = new THREE.Color();
  function spawn(p, v, color, sz, lf, target) {
    const i = next; next = (next + 1) % N;
    pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3);
    c.set(color); col.set([c.r, c.g, c.b], i * 3);
    size[i] = sz; life[i] = lf; max[i] = lf; home[i] = target || null;
  }
  const v = new THREE.Vector3();
  return {
    burst(p, color = 0xffc070, n = 20, speed = 4, sz = 0.35, lf = 0.9) {
      for (let k = 0; k < n; k++) {
        v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
        spawn(p, v, color, sz * (0.5 + Math.random()), lf * (0.6 + Math.random() * 0.6));
      }
    },
    seek(p, target, color = 0xffd080, n = 5) {
      for (let k = 0; k < n; k++) {
        v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).multiplyScalar(5);
        spawn(p, v, color, 0.45, 1.2, target);
      }
    },
    ring(p, color, n = 40, speed = 12) {
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; v.set(Math.cos(a) * speed, (Math.random() - 0.3) * 2, Math.sin(a) * speed); spawn(p, v, color, 0.5, 0.7); }
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) { size[i] = 0; continue; }
        life[i] -= dt;
        const t = home[i];
        if (t) {
          const k = Math.min(1, dt * 6 * (1.3 - life[i] / max[i]) * 2);
          pos[i * 3] += (t.x - pos[i * 3]) * k + vel[i * 3] * dt; pos[i * 3 + 1] += (t.y + 1 - pos[i * 3 + 1]) * k + vel[i * 3 + 1] * dt; pos[i * 3 + 2] += (t.z - pos[i * 3 + 2]) * k + vel[i * 3 + 2] * dt;
          vel[i * 3] *= 0.9; vel[i * 3 + 1] *= 0.9; vel[i * 3 + 2] *= 0.9;
        } else {
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
          vel[i * 3] *= 0.96; vel[i * 3 + 1] = vel[i * 3 + 1] * 0.96 + 0.6 * dt; vel[i * 3 + 2] *= 0.96;
        }
        const f = life[i] / max[i];
        if (f < 0.3) size[i] *= 0.9;
      }
      g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
    },
  };
}

const MOTE_MAX = 220;
export function createMotes(scene) {
  const pos = new Float32Array(MOTE_MAX * 3), seed = new Float32Array(MOTE_MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: glowTex }, time: globalU.uTime, px: { value: Math.min(devicePixelRatio, 2) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float time, px; varying float vS;
      void main(){ vS = seed; vec3 p = position; p.y += sin(time * 3.0 + seed * 30.0) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (seed > 0.0 ? 1.0 : 0.0) * (0.9 + 0.2 * sin(time * 8.0 + seed * 50.0)) * px * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vS; void main(){ vec4 t = texture2D(map, gl_PointCoord); float core = smoothstep(0.18, 0.0, length(gl_PointCoord - 0.5));
      vec3 c = mix(vec3(1.0, 0.75, 0.3), vec3(1.0, 0.98, 0.85), core); gl_FragColor = vec4(c * (t.a * 1.4 + core * 2.0), t.a); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  const slots = [];
  return {
    list: slots,
    add(e) { if (slots.length >= MOTE_MAX) return false; slots.push(e); return true; },
    remove(e) { const i = slots.indexOf(e); if (i >= 0) slots.splice(i, 1); },
    clear() { slots.length = 0; },
    sync() {
      for (let i = 0; i < MOTE_MAX; i++) {
        const e = slots[i];
        if (e) { pos[i * 3] = e.wx; pos[i * 3 + 1] = e.wy; pos[i * 3 + 2] = e.wz; seed[i] = e.seed; } else seed[i] = 0;
      }
      g.attributes.position.needsUpdate = g.attributes.seed.needsUpdate = true;
    },
  };
}

const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8b0ff });
const coreMat = new THREE.MeshBasicMaterial({ color: 0x07030f });
const smokeMats = [0x120820, 0x1e0e36].map((c) => new THREE.SpriteMaterial({ map: smokeTex, color: c, transparent: true, depthWrite: false, opacity: 0.9 }));
const sphG = new THREE.SphereGeometry(1, 12, 8);

export function makeHushling(scale = 1) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(sphG, coreMat); core.scale.setScalar(0.42); g.add(core);
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(smokeMats[i % 2]); s.scale.setScalar(1.1 + Math.random() * 0.5);
    s.userData.a = Math.random() * 6.28; g.add(s); puffs.push(s);
  }
  const eyes = [-1, 1].map((sx) => { const e = new THREE.Mesh(sphG, eyeMat); e.scale.set(0.07, 0.1, 0.05); e.position.set(sx * 0.14, 0.06, 0.4); g.add(e); return e; });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8050ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.4); g.add(halo);
  g.scale.setScalar(scale);
  g.userData.tick = (t, dt) => {
    puffs.forEach((p, i) => { const a = p.userData.a + t * (1 + i * 0.2); p.position.set(Math.cos(a) * 0.25, Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.25); p.material.rotation = a; });
    const bl = Math.sin(t * 0.9 + g.id) > 0.97 ? 0.1 : 1;
    eyes.forEach((e) => (e.scale.y = 0.1 * bl));
  };
  return g;
}

const logMat = mat(0x5a3a28, { flat: true, rim: 0.8 });
const logEndMat = mat(0xb08860, { flat: true });
const rockMat = mat(0x5a5a70, { flat: true, rim: 1 });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
const poolMat = new THREE.MeshBasicMaterial({ color: 0x05020c, transparent: true, opacity: 0.92, depthWrite: false });
const poolRimMat = new THREE.MeshBasicMaterial({ color: 0x9a60ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
const stormMat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x2a1a40, transparent: true, depthWrite: false });
const thornMat = mat(0x140a1e, { flat: true, rim: 1.6 });

export function makeObstacle(type, width = 5) {
  const g = new THREE.Group();
  if (type === 'log') {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, width, 9), logMat); l.rotation.z = Math.PI / 2; l.position.y = 0.34; l.castShadow = true; g.add(l);
    [-1, 1].forEach((sx) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.34, 9), logEndMat); e.position.set(sx * width / 2 + sx * 0.01, 0.34, 0); e.rotation.y = sx * Math.PI / 2; g.add(e); });
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0x70e0ff })); m.position.set((Math.random() - 0.5) * width * 0.8, 0.66, 0); m.scale.y = 0.5; g.add(m); }
  } else if (type === 'rock') {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockMat); r.position.y = 0.45; r.rotation.set(Math.random(), Math.random(), 0); r.scale.y = 1.2; r.castShadow = true; g.add(r);
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x90ffb0 })); moss.position.set(0.3, 0.9, 0.3); g.add(moss);
  } else if (type === 'pool') {
    const d = new THREE.Mesh(new THREE.CircleGeometry(1, 28), poolMat); d.rotation.x = -Math.PI / 2; d.scale.set(width / 2, 1.4, 1); d.position.y = 0.04; g.add(d);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), poolRimMat); rim.rotation.x = -Math.PI / 2; rim.scale.set(width / 2, 1.4, 1); rim.position.y = 0.05; g.add(rim);
    const wisps = [];
    for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(stormMat); s.scale.setScalar(0.9); s.position.set((Math.random() - 0.5) * width * 0.8, 0.3, (Math.random() - 0.5)); g.add(s); wisps.push(s); }
    g.userData.tick = (t) => wisps.forEach((s, i) => { s.position.y = 0.2 + ((t * 0.4 + i * 0.2) % 1) * 1.2; s.material.opacity = 0.8; });
  } else if (type === 'thorns') {
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5 + Math.random(), 4), thornMat);
      c.position.set((i / 8 - 0.5) * width, 0.6, (Math.random() - 0.5) * 0.6); c.rotation.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8); g.add(c);
    }
  } else if (type === 'storm') {
    for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(stormMat); s.scale.setScalar(2.2 + Math.random()); s.position.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5)); g.add(s); }
    const fl = new THREE.PointLight(0xb080ff, 0, 10); g.add(fl);
    g.userData.tick = (t) => { fl.intensity = Math.random() < 0.02 ? 30 : fl.intensity * 0.85; };
  } else if (type === 'ring') {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 8, 36), ringMat); g.add(r);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd080, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(3.6); g.add(glow);
    g.userData.tick = (t) => { r.rotation.z = t; r.scale.setScalar(1 + Math.sin(t * 4) * 0.04); };
  }
  return g;
}

// Deterministic layout of pickups and hazards for a chapter; entries are spawned lazily as the player nears them.
export function buildLayout(ch) {
  const r = rng(ch.seed);
  const out = [];
  const W = ch.width;
  const addMotes = (s, n, fn) => { for (let i = 0; i < n; i++) { const [u, y] = fn(i); out.push({ type: 'mote', s: s + i * 1.6, u, y }); } };
  let s = ch.startClear ?? 25;
  const rules = ch.rules;
  while (s < ch.length - 30) {
    const t = s / ch.length;
    const opts = rules.filter((rl) => (rl.from ?? 0) <= s && (rl.to ?? 1e9) >= s);
    const tot = opts.reduce((a, b) => a + b.w, 0);
    let pick = r() * tot, rule = opts[0];
    for (const o of opts) { pick -= o.w; if (pick <= 0) { rule = o; break; } }
    const u0 = (r() * 2 - 1) * W * 0.7, y0 = ch.mode === 'glide' ? (r() * 2 - 1) * 2 : 0;
    switch (rule.k) {
      case 'line': addMotes(s, 6, () => [u0, y0 + 1]); s += 10; break;
      case 'weave': addMotes(s, 9, (i) => [Math.sin(i * 0.7) * W * 0.6, y0 + 1 + (ch.mode === 'glide' ? Math.cos(i * 0.5) * 1.5 : 0)]); s += 15; break;
      case 'arc': addMotes(s, 7, (i) => [u0, 1 + Math.sin((i / 6) * Math.PI) * 1.8]); out.push({ type: ch.mode === 'boat' ? 'floatlog' : 'log', s: s + 4.8, u: 0 }); s += 14; break;
      case 'hush': out.push({ type: 'hush', s: s + 4, u: u0, y: ch.mode === 'glide' ? y0 + 1 : 1.1, drift: r() < 0.5 ? 0 : (r() < 0.5 ? -1 : 1) }); addMotes(s + 8, 4, () => [-u0 * 0.6, y0 + 1]); s += 12; break;
      case 'hush2': out.push({ type: 'hush', s: s + 4, u: -W * 0.45, y: 1.1 }, { type: 'hush', s: s + 5, u: W * 0.45, y: 1.1 }); addMotes(s + 2, 5, () => [0, 1]); s += 13; break;
      case 'rocks': { const gap = r() < 0.5 ? -1 : 1; out.push({ type: 'rock', s: s + 3, u: -gap * W * 0.5 }, { type: 'rock', s: s + 3.5, u: -gap * W * 0.05 }); addMotes(s + 1, 5, () => [gap * W * 0.6, 1]); s += 13; break; }
      case 'pool': out.push({ type: 'pool', s: s + 5, u: 0 }); addMotes(s + 3, 5, (i) => [u0 * 0.3, 1 + Math.sin((i / 4) * Math.PI) * 1.6]); s += 14; break;
      case 'thorns': { const side = r() < 0.5 ? -1 : 1; out.push({ type: 'thorns', s: s + 4, u: side * W * 0.45, half: true }); addMotes(s + 2, 5, () => [-side * W * 0.55, 1]); s += 12; break; }
      case 'storm': out.push({ type: 'storm', s: s + 5, u: u0, y: y0 }); addMotes(s + 2, 6, (i) => [-u0 * 0.7, -y0 * 0.7 + 1]); s += 13; break;
      case 'ring': out.push({ type: 'ring', s: s + 5, u: u0 * 0.8, y: y0 * 0.8 + 1 }); addMotes(s + 7, 5, () => [u0 * 0.8, y0 * 0.8 + 1]); s += 13; break;
      default: s += 8;
    }
    s += (rule.gap ?? 5) * (1 - t * 0.25);
  }
  return out;
}

export { pathX };
