import * as THREE from 'three';
import { HALO_VERT, HALO_FRAG } from '../eventart.js?v=20261004a';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// Tap rings: eventart's billboard halo (gold ring + soft glow) for anything tappable in a spectacle. One draw.
export function createHalos(kit, scene, cap = 24) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const iRing = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  geo.setAttribute('iRing', iRing);
  const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: { uTime: kit.materials.uTime },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), cap);
  mesh.name = 'spectacle:halo';
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  const list = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, r: 1, k: 1, ph: 0, left: 2, line: null }));
  let n = 0;
  return {
    mesh,
    clear() { n = 0; },
    add(x, y, z, r, k, ph, left, line = null) {
      if (n >= cap) return;
      const h = list[n++];
      h.x = x; h.y = y; h.z = z; h.r = r; h.k = k; h.ph = ph; h.left = left; h.line = line;
    },
    write(line) {
      let k = 0;
      for (let i = 0; i < n; i++) {
        const h = list[i];
        if (line && h.line !== line) continue;
        mesh.setMatrixAt(k, _m.makeTranslation(h.x, h.y, h.z));
        iRing.setXYZW(k++, h.left, h.r, h.ph, h.k);
      }
      mesh.count = k;
      mesh.visible = k > 0;
      if (k) { mesh.instanceMatrix.needsUpdate = true; iRing.needsUpdate = true; }
      return k;
    },
    get calls() { return mesh.visible ? 1 : 0; },
  };
}

// Ghost Town (W12): a translucent clay sheet-ghost, lit like the cast with a cold green rim, one draw for all of them.
// Variants: 0 plain sheet, 1 cowboy ghost (stetson + bandana) for the ghost duels. Instance fade/variant in iGhost.
function ghostGeometry(kit) {
  const out = [];
  const make = (v, fn) => {
    const b = kit.builder({});
    b.ao(0.12);
    fn(b);
    const g = b.geometry(), n = g.attributes.position.count, a = new Float32Array(n);
    a.fill(v);
    g.setAttribute('aGv', new THREE.BufferAttribute(a, 1));
    out.push(g);
  };
  const sheet = (b) => {
    const W = { c: '#eef8f2', r: 0.6 };
    b.ball(W, 0, 1.25, 0, 0.5, { sy: 1.05, smooth: true });
    b.cyl(W, 0, 0.18, 0, 0.62, 1.1, 0, { sides: 14, taper: 0.62 });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.ball(W, Math.sin(a) * 0.56, 0.2, Math.cos(a) * 0.56, 0.17, { sy: 1.3 }); }
    for (const s of [-1, 1]) b.ball(W, s * 0.55, 0.95, 0.12, 0.15, { sx: 1.6, sy: 0.8, rz: s * 0.6 });
    for (const s of [-1, 1]) b.ball('#1e2a33', s * 0.17, 1.33, 0.43, 0.085, { sy: 1.5, sz: 0.5 });
    b.ball('#1e2a33', 0, 1.08, 0.46, 0.08, { sy: 1.25, sz: 0.4 });
  };
  make(0, sheet);
  make(1, (b) => {
    sheet(b);
    const F = { c: '#cfe9dc', r: 0.6 };
    b.cyl(F, 0, 1.62, 0, 0.62, 0.05, 0, { sides: 16, taper: 1 });
    b.cyl(F, 0, 1.64, 0, 0.3, 0.34, 0, { sides: 12, taper: 0.8 });
    b.slab({ c: '#b9d8c8', r: 0.6 }, 0, 0.9, 0.38, 0.62, 0.16, 0.18, { round: 0.05 });
  });
  let n = 0;
  for (const g of out) n += g.attributes.position.count;
  const merged = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['color', 3], ['aGv', 1]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of out) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    merged.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  merged.computeBoundingSphere();
  return merged;
}

// Lane A's kit.ghost (bedsheet ghost in a stetson, hem flutter in the shader) when present; else our own sheet-ghost.
// Fades are per mesh in kit.ghost, so a ghost's own fade also scales it.
function kitGhosts(kit, scene, cap) {
  const g = kit.ghost({ count: cap, hat: 'stetson' });
  scene.add(g.mesh);
  g.mesh.name = 'spectacle:ghosts';
  g.alpha(0);
  const list = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, h: 0, s: 1, a: 1, line: null }));
  let n = 0, shown = 0;
  return {
    mesh: g.mesh,
    clear() { n = 0; },
    add(x, y, z, o = {}) {
      if (n >= cap) return;
      const q = list[n++];
      q.x = x; q.y = y; q.z = z; q.h = o.h || 0; q.s = o.s || 1; q.a = o.a ?? 1; q.line = o.line ?? null;
    },
    write(line) {
      let k = 0, a = 0;
      for (let i = 0; i < n; i++) {
        const q = list[i];
        if (line && q.line !== line) continue;
        g.set(k++, q.x, q.y - 0.1, q.z, q.h, q.s * (0.55 + 0.45 * q.a));
        a = Math.max(a, q.a);
      }
      for (let i = k; i < shown; i++) g.hide(i);
      shown = k;
      g.commit();
      g.alpha(k ? a : 0);
      return k;
    },
    get calls() { return g.mesh.visible ? 1 : 0; },
  };
}

export function createGhosts(kit, scene, cap = 8) {
  if (typeof kit.ghost === 'function') return kitGhosts(kit, scene, cap);
  const geo = ghostGeometry(kit);
  const iGhost = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  geo.setAttribute('iGhost', iGhost);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, transparent: true, depthWrite: false, emissive: new THREE.Color('#5fe0a8'), emissiveIntensity: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGv;\nattribute vec2 iGhost;\nvarying float vFade;\nvarying vec3 vVn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = iGhost.x;\ntransformed *= float(abs(aGv - iGhost.y) < 0.5);\nfloat hem = smoothstep(0.6, 0.0, position.y);\ntransformed.x += sin(position.z * 9.0 + position.y * 3.0 + float(gl_InstanceID) * 1.7) * 0.05 * hem;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvVn = normalize(transformedNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;\nvarying vec3 vVn;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat rim = pow(1.0 - abs(vVn.z), 2.0);\ngl_FragColor.rgb += vec3(0.35, 0.95, 0.7) * rim * 0.55;\ngl_FragColor.a = (0.52 + rim * 0.4) * vFade;');
  };
  mat.customProgramCacheKey = () => 'iw2-ghost';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = 'spectacle:ghosts';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.renderOrder = 5;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  const list = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, h: 0, s: 1, a: 1, v: 0, roll: 0, line: null }));
  let n = 0;
  return {
    mesh,
    clear() { n = 0; },
    add(x, y, z, o = {}) {
      if (n >= cap) return;
      const g = list[n++];
      g.x = x; g.y = y; g.z = z; g.h = o.h || 0; g.s = o.s || 1; g.a = o.a ?? 1; g.v = o.v || 0; g.roll = o.roll || 0; g.line = o.line ?? null;
    },
    write(line) {
      let k = 0;
      for (let i = 0; i < n; i++) {
        const g = list[i];
        if (line && g.line !== line) continue;
        _e.set(0, g.h, g.roll, 'YXZ');
        _q.setFromEuler(_e);
        mesh.setMatrixAt(k, _m.compose(_p.set(g.x, g.y, g.z), _q, _s.setScalar(g.s)));
        iGhost.setXY(k++, g.a, g.v);
      }
      mesh.count = k;
      mesh.visible = k > 0;
      if (k) { mesh.instanceMatrix.needsUpdate = true; iGhost.needsUpdate = true; }
      return k;
    },
    get calls() { return mesh.visible ? 1 : 0; },
  };
}
