// Town life that belongs to no plot: lamp halos at night, pecking birds, circling buzzards, townsfolk on the boardwalks.
import * as THREE from 'three';
import * as S from './shape.js?v=20261004f';
import { createCrowd, CLIP } from './crowd.js?v=20261004f';
import * as WK from './western.js?v=20261004f';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function birdGeo(kit, gull) {
  const b = kit.builder({ body: gull ? '#4a3a30' : '#9a7a5a', head: gull ? '#c98a7a' : '#c0402a', beak: '#e8c060', wing: gull ? '#3a2e28' : '#8a6a4a' });
  b.ball('body', 0, 0.14, 0, 0.12, { sx: 0.8, sy: 0.75, sz: 1.25, smooth: true });
  b.ball('head', 0, 0.26, 0.11, 0.07, { smooth: true });
  b.cone('beak', 0, 0.255, 0.18, 0.02, 0.06, 0, { rx: Math.PI / 2, sides: 5 });
  if (gull) for (const s of [-1, 1]) b.slab('wing', s * 0.2, 0.17, 0, 0.32, 0.02, 0.14, { round: 0.01, rz: s * 0.2 });
  else for (const s of [-1, 1]) b.ball('wing', s * 0.07, 0.15, -0.02, 0.06, { sx: 0.5, sz: 1.5 });
  return b.geometry({ ao: 0.2, aoH: 0.15 });
}

// Crisp lamp pool: a flat warm core with a short soft edge and a faint hot spot (not a gaussian smear).
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const d = Math.hypot(x + 0.5 - 64, y + 0.5 - 64) / 64;
    const e = Math.max(0, Math.min(1, (1 - d) / 0.22));
    const a = e * e * (3 - 2 * e) * (0.62 + 0.38 * Math.exp(-d * d * 7)) + 0.12 * Math.max(0, 1 - d) * (1 - e);
    const i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAmbient(kit, scene, { lamps, life, street }) {
  const group = new THREE.Group();
  group.name = 'ambient';
  scene.add(group);

  const lampPos = [];
  const glowGeo = new THREE.BufferGeometry();
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ size: 0.9, map: kit.materials.basicBlob.map, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: false, opacity: 0 }));
  glow.frustumCulled = false;
  glow.renderOrder = 4;
  group.add(glow);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xff7a1c, map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const pool = new THREE.Mesh(new THREE.BufferGeometry(), poolMat);
  pool.frustumCulled = false;
  pool.renderOrder = 3;
  pool.raycast = () => {};
  group.add(pool);
  // Night light pools: one additive decal draw for every lamp plus the warm spill in front of lit doors and windows.
  const spill = [];
  const setLamps = () => {
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos.flat(), 3));
    const pos = [], uv = [], q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    const disc = (x, y, z, rx, rz) => { for (const [u, v] of q) { pos.push(x + u * rx, y, z - v * rz); uv.push((u + 1) / 2, (v + 1) / 2); } };
    // R6: every pool lies on the ground. A disc raised to porch height cut through legs and bodies (the "ghosted"
    // night characters); porch boards and walls get their light from the shader lamps instead.
    for (const [x, , z] of lampPos) disc(x, 0.1, z, 3.3, 3.3);
    for (const [x, z, rx, rz, y] of spill) disc(x, y ?? 0.1, z, rx, rz);
    pool.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pool.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  };
  for (const l of lamps) lampPos.push(l);
  setLamps();

  const mistTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 24 + Math.random() * 80, y = 30 + Math.random() * 68, r = 14 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, color: 0x3c4c9c, transparent: true, depthWrite: false, opacity: 0, fog: false, toneMapped: false });
  const mist = (() => {
    const pos = [], uv = [];
    let r = 7;
    const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
    for (let x = street.x0 - 30; x < street.x1 + 30; x += 7) for (const zc of [-5, 2, 9]) {
      const cx = x + rnd() * 6, cz = zc + (rnd() - 0.5) * 4, w = 7 + rnd() * 6, d = 3 + rnd() * 3, y = 0.25 + rnd() * 0.5, a = (rnd() - 0.5) * 0.6;
      const c = Math.cos(a), s2 = Math.sin(a);
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        const lx = (u - 0.5) * w, lz = (0.5 - v) * d;
        pos.push(cx + lx * c + lz * s2, y, cz - lx * s2 + lz * c); uv.push(u, v);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, mistMat);
    m.frustumCulled = false; m.renderOrder = 5; m.raycast = () => {};
    return m;
  })();
  group.add(mist);

  const pigeons = [];
  for (const [x, z] of life.pigeonSpots) for (let i = 0; i < 5; i++) pigeons.push({ x: x + (Math.random() - 0.5) * 3, z: z + (Math.random() - 0.5) * 2.4, h: Math.random() * 6.28, ph: Math.random() * 10, hop: 0 });
  const pg = new THREE.InstancedMesh(birdGeo(kit, false), kit.materials.uber, pigeons.length);
  pg.frustumCulled = false;
  pg.castShadow = false;
  group.add(pg);

  const gulls = [];
  const midX = (street.x0 + street.x1) / 2;
  for (let i = 0; i < 4; i++) gulls.push({ cx: midX - 20 + i * 14, cz: -14 - (i % 2) * 10, r: 9 + (i % 3) * 3, sp: 0.18 + (i % 3) * 0.05, y: 16 + (i % 3) * 3, ph: i * 1.7 });
  const gl = new THREE.InstancedMesh(birdGeo(kit, true), kit.materials.uber, gulls.length);
  gl.boundingSphere = new THREE.Sphere(new THREE.Vector3(midX, 18, -20), 70);
  group.add(gl);

  const N = 8;
  const crowd = createCrowd(kit.materials, { count: N, seed: 5, radius: 600, center: [(street.x0 + street.x1) / 2, 0, 0] });
  kit.materials.crowdPool?.poolOnly(crowd);
  group.add(crowd.mesh);
  const walks = life.walks?.length ? life.walks : [{ z: street.z + street.width / 2 - 0.6, x0: street.x0, x1: street.x1 }];
  const runners = [];
  const TOPS = ['#b5483a', '#5e8f8c', '#d9a441', '#7d8fa3', '#c98b7e', '#8fa27a', '#e9e4da', '#8a5a6e'];
  for (let i = 0; i < N; i++) {
    const w = walks[i % walks.length];
    runners.push({ i, s: (i * 0.37) % 1, dir: i % 2 ? 1 : -1, sp: i === 3 ? 0.7 : 1.0 + (i % 3) * 0.15, z: w.z + ((i * 0.31) % 0.6) - 0.3, y: w.y ?? 0.06, x0: w.x0, x1: w.x1, clip: i === 3 ? CLIP.stagger : CLIP.walk });
    crowd.look(i, { top: TOPS[i % TOPS.length], style: i % 5, hair: i % 6, skin: i % 5 });
  }
  if (N > 3) crowd.dress(3, 'pickles');
  // a tumbleweed bowls down the street now and then (one dynamic draw)
  const tw = new THREE.Mesh(WK.tumbleweedGeo(), kit.materials.uber);
  tw.castShadow = true;
  tw.name = 'ambient:tumbleweed';
  group.add(tw);
  const twBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), kit.materials.basicBlob);
  twBlob.renderOrder = 1;
  group.add(twBlob);
  const twState = { t: -8, dur: 26, z: street.z };

  let night = 0;
  return {
    group,
    lamps: lampPos,
    nearest(x, z, n = 12, out = []) {
      let k = 0;
      for (const l of lampPos) {
        const d = (l[0] - x) ** 2 + (l[2] - z) ** 2;
        if (d >= 2500 || (k >= n && d >= out[n - 1][4])) continue;
        let i = Math.min(k, n - 1);
        const e = k < n ? (out[k] ||= [0, 0, 0, 1, 0]) : out[n - 1];
        e[0] = l[0]; e[1] = l[1]; e[2] = l[2]; e[3] = 1; e[4] = d;
        while (i > 0 && out[i - 1][4] > d) { out[i] = out[i - 1]; i--; }
        out[i] = e;
        if (k < n) k++;
      }
      out.length = k;
      return out;
    },
    addLamp(p) { lampPos.push(p); setLamps(); },
    addSpill(list) { spill.push(...list); setLamps(); },
    prepare() {},
    update(dt, time, n) {
      night = n;
      glow.material.opacity = Math.max(0, (n - 0.15) / 0.85) * 0.6;
      glow.visible = glow.material.opacity > 0.01;
      poolMat.opacity = Math.max(0, (n - 0.2) / 0.8) * 0.42;
      pool.visible = poolMat.opacity > 0.01;
      mistMat.opacity = Math.max(0, (n - 0.3) / 0.7) * 0.05;
      mist.visible = mistMat.opacity > 0.01;
      mist.position.x = Math.sin(time * 0.04) * 3;
      pigeons.forEach((p, i) => {
        const t = time + p.ph;
        const peck = Math.max(0, Math.sin(t * 3.1)) * 0.55 * (Math.sin(t * 0.37) > 0 ? 1 : 0);
        if (Math.sin(t * 0.23 + i) > 0.985) { p.h += (Math.random() - 0.5) * 2; p.hop = 0.35; }
        const hopY = p.hop > 0 ? Math.sin((p.hop / 0.35) * Math.PI) * 0.15 : 0;
        if (p.hop > 0) { p.hop -= dt; p.x += Math.sin(p.h) * dt * 0.8; p.z += Math.cos(p.h) * dt * 0.8; }
        _e.set(peck, p.h, 0);
        _m.compose(_p.set(p.x, 0.06 + hopY, p.z), _q.setFromEuler(_e), _s.setScalar(1.15));
        pg.setMatrixAt(i, _m);
      });
      pg.instanceMatrix.needsUpdate = true;
      gulls.forEach((g, i) => {
        const a = time * g.sp + g.ph;
        const flap = 0.55 + Math.abs(Math.sin(time * 5 + i)) * 0.6;
        _e.set(0, a + Math.PI, 0.35);
        _m.compose(_p.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(a * 2.3) * 0.6, g.cz + Math.sin(a) * g.r), _q.setFromEuler(_e), _s.set(2.2 * flap, 2.2, 2.2));
        gl.setMatrixAt(i, _m);
      });
      gl.instanceMatrix.needsUpdate = true;
      for (const r of runners) {
        const L = r.x1 - r.x0;
        r.s += (r.sp * dt * r.dir) / L;
        if (r.s > 1) r.s -= 1; if (r.s < 0) r.s += 1;
        const x = r.x0 + r.s * L;
        crowd.set(r.i, x, r.y, r.z, r.dir > 0 ? Math.PI / 2 : -Math.PI / 2, r.clip, undefined, r.clip === CLIP.stagger ? 2.6 : 4.2);
      }
      crowd.commit();
      twState.t += dt;
      if (twState.t > twState.dur + 10) { twState.t = 0; twState.z = street.z + (Math.sin(time) * 0.5) * street.width * 0.6; }
      const u = twState.t / twState.dur;
      tw.visible = twBlob.visible = u >= 0 && u <= 1;
      if (tw.visible) {
        const x = street.x0 - 10 + u * (street.x1 - street.x0 + 20), hop = Math.abs(Math.sin(twState.t * 2.6)) * 0.55;
        tw.position.set(x, 0.42 + hop, twState.z + Math.sin(twState.t * 0.7) * 1.2);
        tw.rotation.set(0, 0.3, -twState.t * 3.4);
        twBlob.position.set(x, 0.1, twState.z + Math.sin(twState.t * 0.7) * 1.2);
        twBlob.scale.setScalar(0.9 - hop * 0.6);
      }
    },
  };
}
void S; void Math;
