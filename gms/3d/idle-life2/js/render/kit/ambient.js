// Town life that belongs to no plot: lamp halos at night, pecking pigeons, wheeling gulls, joggers, traffic.
import * as THREE from 'three';
import * as S from './shape.js?v=20261004c';
import { createCrowd, CLIP } from './crowd.js?v=20261004c';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function birdGeo(kit, gull) {
  const b = kit.builder({ body: gull ? '#f6f4f0' : '#9a96a8', head: gull ? '#f6f4f0' : '#7d7890', beak: '#f2b84b', wing: gull ? '#c9ccd6' : '#87839a' });
  b.ball('body', 0, 0.14, 0, 0.12, { sx: 0.8, sy: 0.75, sz: 1.25, smooth: true });
  b.ball('head', 0, 0.26, 0.11, 0.07, { smooth: true });
  b.cone('beak', 0, 0.255, 0.18, 0.02, 0.06, 0, { rx: Math.PI / 2, sides: 5 });
  if (gull) for (const s of [-1, 1]) b.slab('wing', s * 0.2, 0.17, 0, 0.32, 0.02, 0.14, { round: 0.01, rz: s * 0.2 });
  else for (const s of [-1, 1]) b.ball('wing', s * 0.07, 0.15, -0.02, 0.06, { sx: 0.5, sz: 1.5 });
  return b.geometry({ ao: 0.2, aoH: 0.15 });
}

export function createAmbient(kit, scene, { lamps, life, street, span, palette }) {
  const group = new THREE.Group();
  group.name = 'ambient';
  scene.add(group);

  const lampPos = [];
  const glowGeo = new THREE.BufferGeometry();
  const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({ size: 2.6, map: kit.materials.basicBlob.map, color: 0xffcf88, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: false, opacity: 0 }));
  glow.frustumCulled = false;
  glow.renderOrder = 4;
  group.add(glow);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffa95a, map: kit.materials.basicBlob.map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const pool = new THREE.Mesh(new THREE.BufferGeometry(), poolMat);
  pool.frustumCulled = false;
  pool.renderOrder = 3;
  pool.raycast = () => {};
  group.add(pool);
  const setLamps = () => {
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos.flat(), 3));
    const pos = [], uv = [], R = 4.2;
    for (const [x, , z] of lampPos) {
      const q = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      for (const [u, v] of q) { pos.push(x + u * R, 0.1, z - v * R); uv.push((u + 1) / 2, (v + 1) / 2); }
    }
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
  const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, color: 0x8f86c8, transparent: true, depthWrite: false, opacity: 0, fog: false, toneMapped: false });
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
  for (let i = 0; i < 7; i++) gulls.push({ cx: span.harbour[0] + 20 + i * 9, cz: -20 - (i % 3) * 8, r: 8 + (i % 4) * 3, sp: 0.25 + (i % 3) * 0.07, y: 9 + (i % 4) * 2, ph: i * 1.7 });
  const gl = new THREE.InstancedMesh(birdGeo(kit, true), kit.materials.uber, gulls.length);
  gl.boundingSphere = new THREE.Sphere(new THREE.Vector3(span.harbour[0] + 45, 10, -25), 60);
  group.add(gl);

  const crowd = createCrowd(kit.materials, { count: 12, seed: 5, radius: 600, center: [(street.x0 + street.x1) / 2, 0, 0] });
  group.add(crowd.mesh);
  const roadS = street.z + street.width / 2;
  const runners = [];
  for (let i = 0; i < 12; i++) {
    const back = i >= 8;
    runners.push({
      i, s: Math.random(), dir: i % 2 ? 1 : -1, sp: back ? 1.0 : i < 3 ? 3.0 : 1.2,
      z: back ? -6.9 + (i % 2) * 0.7 : roadS + 1.2 + (i % 3) * 0.55,
      x0: back ? street.x0 - 40 : street.x0 - 40, x1: back ? span.oldtown[1] - 4 : street.x1 + 30,
    });
    crowd.look(i, { top: ['#e8776a', '#6fb7a8', '#f2b84b', '#7d9ad6', '#e58fb0', '#9bc66b'][i % 6], style: i % 5, hair: i % 6, skin: i % 5 });
  }

  const carCols = ['#e8776a', '#7fb5a8', '#f2b84b', '#8a8fd0', '#f2a6bd'];
  const cars = carCols.map((c, i) => {
    const b = kit.builder(palette);
    kit.vehicles.car(b, 0, 0, 0, c, {});
    const m = b.finish();
    m.matrixAutoUpdate = true;
    group.add(m);
    return { m, lane: i % 2 ? 1 : -1, s: i / carCols.length, sp: 7 + i };
  });

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
    prepare() {},
    update(dt, time, n) {
      night = n;
      glow.material.opacity = Math.max(0, (n - 0.15) / 0.85) * 0.85;
      glow.visible = glow.material.opacity > 0.01;
      poolMat.opacity = Math.max(0, (n - 0.2) / 0.8) * 0.28;
      pool.visible = poolMat.opacity > 0.01;
      mistMat.opacity = Math.max(0, (n - 0.3) / 0.7) * 0.32;
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
        crowd.set(r.i, x, 0.06, r.z, r.dir > 0 ? Math.PI / 2 : -Math.PI / 2, CLIP.walk, undefined, r.sp > 2 ? 8.5 : 4.2);
      }
      crowd.commit();
      const L = street.x1 - street.x0 + 120;
      for (const c of cars) {
        c.s = (c.s + (c.sp * dt) / L) % 1;
        const x = c.lane > 0 ? street.x0 - 60 + c.s * L : street.x1 + 60 - c.s * L;
        c.m.position.set(x, 0, street.z + c.lane * 1.45);
        c.m.rotation.y = c.lane > 0 ? 0 : Math.PI;
      }
    },
  };
}
void S; void Math;
