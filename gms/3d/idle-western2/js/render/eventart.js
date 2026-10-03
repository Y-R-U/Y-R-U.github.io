import * as THREE from 'three';

// Diegetic event actors. Every prop shape lives in ONE instanced mesh: each instance picks its shape (iVar) and the
// vertex shader collapses the others, so all event props cost a single draw call. Townsfolk roles (band, celebrity,
// paparazzi, customers) share one crowd instance pool, and a billboard halo + claim-timer ring marks anything tappable.
const V = { pigeon: 0, limo: 1, wallet: 2, parcel: 3, clipboard: 4, drum: 5, horn: 6, flag: 7, camera: 8, flash: 9, glowDisc: 10, glint: 11, boxes: 12 };
const PROPS = 48, PEOPLE = 24, HALOS = 12;
const GOLD = { c: '#f4b52a', r: 0.3, m: 0.3, g: 0.3 };
const BRASS = { c: '#e9b949', r: 0.25, m: 0.55, g: 0.12 };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(),
  _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0), _e = new THREE.Euler();

function templates(kit) {
  const out = [];
  const make = (variant, build, flap = null) => {
    const b = kit.builder({});
    b.ao(0.15);
    build(b);
    const g = b.geometry();
    const n = g.attributes.position.count, ev = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) ev[i * 2] = variant;
    g.setAttribute('aEv', new THREE.BufferAttribute(ev, 2));
    out.push(g);
    if (flap) {
      const w = kit.builder({});
      w.ao(0);
      flap(w);
      const wg = w.geometry(), wn = wg.attributes.position.count, wev = new Float32Array(wn * 2);
      for (let i = 0; i < wn; i++) { wev[i * 2] = variant; wev[i * 2 + 1] = 1; }
      wg.setAttribute('aEv', new THREE.BufferAttribute(wev, 2));
      out.push(wg);
    }
  };
  // Facing +z, origin at the ground (pigeon: body centre).
  make(V.pigeon, (b) => {
    b.ball(GOLD, 0, 0, 0, 0.3, { sx: 0.8, sy: 0.62, sz: 1.3, smooth: true });
    b.ball(GOLD, 0, 0.12, 0.3, 0.2, { sx: 0.85, sy: 0.8, sz: 0.9, smooth: true });
    b.ball(GOLD, 0, 0.18, 0.44, 0.15, { smooth: true });
    b.cone({ c: '#ff9f43', r: 0.4, g: 0.2 }, 0, 0.15, 0.56, 0.05, 0.14, 0, { rx: Math.PI / 2 });
    b.ball('#2b2230', 0.08, 0.23, 0.52, 0.03).ball('#2b2230', -0.08, 0.23, 0.52, 0.03);
    b.ball({ c: '#ffe7a0', r: 0.3, g: 0.6 }, 0, 0.13, 0.33, 0.13, { sx: 1.1, sy: 0.6, sz: 0.6 });
    b.slab(GOLD, 0, -0.02, -0.52, 0.42, 0.05, 0.36, { rx: -0.2, taper: -0.4 });
    b.ball({ c: '#fff3b0', r: 0.3, g: 0.9 }, 0, 0.32, 0.4, 0.05);
  }, (w) => {
    for (const s of [-1, 1]) {
      w.ball(GOLD, s * 0.55, 0.08, -0.04, 0.22, { sx: 2.0, sy: 0.2, sz: 1.2, smooth: true });
      w.ball({ c: '#fff0a8', r: 0.3, g: 0.7 }, s * 0.95, 0.07, -0.12, 0.15, { sx: 1.4, sy: 0.22, sz: 0.95 });
    }
  });
  make(V.limo, (b) => {
    const paint = { c: '#e9e7e2', r: 0.22, m: 0.12 }, glass = { c: '#27303c', r: 0.08, m: 0.3 }, chrome = { c: '#dfe4ea', r: 0.18, m: 0.85 };
    b.slab(paint, 0, 0.28, 0, 1.9, 0.72, 6.2, { round: 0.26 });
    b.slab(glass, 0, 0.96, -0.25, 1.72, 0.56, 4.3, { round: 0.18, taper: 0.12 });
    b.slab(paint, 0, 1.48, -0.25, 1.66, 0.12, 4.0, { round: 0.06 });
    b.slab(paint, 0, 0.92, 2.05, 1.78, 0.14, 0.9, { rx: 0.08 });
    for (const z of [-1.3, 0.2]) for (const s of [-1, 1]) b.slab(paint, s * 0.87, 0.96, z, 0.06, 0.56, 0.12);
    b.slab(chrome, 0, 0.36, 3.08, 1.3, 0.34, 0.1).slab(chrome, 0, 0.18, -3.08, 1.6, 0.16, 0.1);
    b.slab(chrome, 0, 0.62, 0, 1.94, 0.05, 5.6, { round: 0.02 });
    for (const s of [-1, 1]) {
      b.ball({ c: '#fff4c2', r: 0.2, g: 1.4 }, s * 0.66, 0.6, 3.06, 0.13, { sz: 0.5 });
      b.ball({ c: '#ff3b4a', r: 0.3, g: 1.2 }, s * 0.72, 0.62, -3.07, 0.11, { sz: 0.5 });
      for (const z of [-2.1, 2.1]) {
        b.cyl('#26272d', s > 0 ? 0.98 : -0.72, 0.38, z, 0.38, 0.26, 0, { rz: Math.PI / 2, sides: 11, taper: 1 });
        b.cyl(chrome, s > 0 ? 1.0 : -0.98, 0.38, z, 0.2, 0.02, 0, { rz: Math.PI / 2, sides: 11, taper: 1 });
      }
    }
    b.ball(GOLD, 0, 0.72, 2.98, 0.08);
    b.slab({ c: '#c8323c', r: 0.9 }, 2.1, 0, 0, 2.2, 0.03, 1.5, { round: 0.01 });
    b.slab(GOLD, 2.1, 0, 0.77, 2.2, 0.035, 0.05, { round: 0.01 }).slab(GOLD, 2.1, 0, -0.77, 2.2, 0.035, 0.05, { round: 0.01 });
    for (const z of [-0.95, 0.95]) {
      b.cyl(BRASS, 3.0, 0, z, 0.05, 0.9, 0, { sides: 7, taper: 1 }).ball(BRASS, 3.0, 0.95, z, 0.08);
    }
    b.slab({ c: '#9d0208', r: 0.8 }, 3.0, 0.78, 0, 0.04, 0.06, 1.9, { round: 0.02 });
  });
  make(V.wallet, (b) => {
    const leather = { c: '#8a4f2c', r: 0.55 };
    b.slab(leather, 0, 0, 0, 0.52, 0.07, 0.38, { round: 0.03 });
    b.slab({ c: '#7ec27a', r: 0.8 }, 0.06, 0.06, -0.02, 0.5, 0.02, 0.26, { ry: 0.25 });
    b.slab(leather, 0, 0.07, -0.16, 0.52, 0.05, 0.36, { rx: -0.45, round: 0.02 });
    b.slab(GOLD, 0, 0.2, -0.33, 0.12, 0.05, 0.03);
    b.disc(GOLD, -0.18, 0.07, 0.16, 0.1, 0.03);
    b.disc(GOLD, 0.22, 0.0, 0.3, 0.09, 0.03);
  });
  make(V.parcel, (b) => {
    const wrap = { c: '#f28dc0', r: 0.6 }, ribbon = { c: '#ffd34d', r: 0.35, m: 0.2, g: 0.25 };
    b.slab(wrap, 0, 0, 0, 0.7, 0.62, 0.7, { round: 0.07 });
    b.slab(ribbon, 0, -0.01, 0, 0.72, 0.64, 0.14, { round: 0.03 }).slab(ribbon, 0, -0.01, 0, 0.14, 0.64, 0.72, { round: 0.03 });
    b.ball(ribbon, -0.12, 0.7, 0, 0.12, { sx: 1.3, sy: 0.75, sz: 0.7 }).ball(ribbon, 0.12, 0.7, 0, 0.12, { sx: 1.3, sy: 0.75, sz: 0.7 });
    b.ball(ribbon, 0, 0.68, 0, 0.06);
  });
  make(V.clipboard, (b) => {
    b.slab({ c: '#b5835a', r: 0.7 }, 0, 0, 0, 0.32, 0.42, 0.03, { round: 0.015 });
    b.slab({ c: '#fbfaf4', r: 0.9 }, 0, 0.03, 0.02, 0.27, 0.34, 0.012, { round: 0.004 });
    for (let i = 0; i < 4; i++) b.slab('#8aa0c8', -0.02, 0.1 + i * 0.065, 0.03, 0.18, 0.012, 0.01, { round: 0.002 });
    b.slab({ c: '#cfd6de', r: 0.2, m: 0.8 }, 0, 0.38, 0.02, 0.12, 0.05, 0.03);
  });
  make(V.drum, (b) => {
    b.cyl({ c: '#d6453d', r: 0.45 }, 0, 0, 0, 0.21, 0.24, 0, { sides: 13, taper: 1 });
    b.cyl({ c: '#fbf4e4', r: 0.6 }, 0, 0.23, 0, 0.215, 0.03, 0, { sides: 13, taper: 1 }).cyl({ c: '#fbf4e4', r: 0.6 }, 0, -0.01, 0, 0.215, 0.03, 0, { sides: 13, taper: 1 });
    for (let i = 0; i < 6; i++) b.slab(BRASS, Math.sin(i * 1.05) * 0.2, 0.03, Math.cos(i * 1.05) * 0.2, 0.025, 0.2, 0.025, { ry: i * 1.05, rz: 0.5 });
  });
  make(V.horn, (b) => {
    b.cyl(BRASS, 0, 0, 0, 0.06, 0.42, 0, { sides: 9, taper: 1 });
    b.cyl(BRASS, 0, 0.36, 0.02, 0.09, 0.32, 0, { sides: 11, taper: 2.4, rx: 0.5 });
    b.slab(BRASS, 0, 0.12, -0.08, 0.08, 0.16, 0.08);
  });
  make(V.flag, (b) => {
    b.cyl('#6b4a33', 0, 0, 0, 0.035, 2.3, 0, { sides: 7, taper: 1 });
    b.ball(GOLD, 0, 2.36, 0, 0.08);
    b.slab({ c: '#ffd34d', r: 0.85 }, 0, 1.62, -0.42, 0.03, 0.62, 0.8, { round: 0.01, sway: 0.18 });
    b.slab({ c: '#d6453d', r: 0.85 }, 0, 1.82, -0.42, 0.035, 0.16, 0.8, { round: 0.005, sway: 0.18 });
  });
  make(V.camera, (b) => {
    b.slab('#2b2d36', 0, 0, 0, 0.26, 0.18, 0.12, { round: 0.03 });
    b.cyl('#3c3f4a', 0, 0.09, 0.04, 0.06, 0.1, 0, { rx: Math.PI / 2, sides: 9, taper: 1 });
    b.slab('#e9eef3', 0.06, 0.18, 0, 0.1, 0.07, 0.06);
  });
  make(V.flash, (b) => b.ball({ c: '#ffffff', r: 0.2, g: 3.2 }, 0, 0, 0, 0.16, { smooth: true }));
  make(V.glowDisc, (b) => b.disc({ c: '#ffe27a', r: 0.5, g: 1.6 }, 0, 0, 0, 0.62, 0.02));
  make(V.glint, (b) => {
    const w = { c: '#fffbe8', r: 0.2, g: 3 };
    b.slab(w, 0, -0.3, 0, 0.05, 0.6, 0.05, { round: 0.02 }).slab(w, 0, -0.02, 0, 0.42, 0.04, 0.04, { round: 0.015 }).slab(w, 0, -0.02, 0, 0.04, 0.04, 0.42, { round: 0.015 });
  });
  make(V.boxes, (b) => {
    const card = { c: '#c99a63', r: 0.85 }, tape = { c: '#e8d5a8', r: 0.7 };
    b.slab({ c: '#5d6573', r: 0.3, m: 0.6 }, 0, 0, 0.3, 0.06, 1.25, 0.06).slab({ c: '#5d6573', r: 0.3, m: 0.6 }, 0, 0, -0.05, 0.62, 0.05, 0.5);
    b.cyl('#26272d', -0.3, 0.1, 0.32, 0.1, 0.08, 0, { rz: Math.PI / 2, sides: 9, taper: 1 }).cyl('#26272d', 0.38, 0.1, 0.32, 0.1, 0.08, 0, { rz: Math.PI / 2, sides: 9, taper: 1 });
    let y = 0.05;
    for (const [w, h, ry] of [[0.6, 0.38, 0], [0.54, 0.34, 0.12], [0.46, 0.3, -0.1]]) {
      b.slab(card, 0, y, -0.06, w, h, 0.46, { ry, round: 0.03 });
      b.slab(tape, 0, y + h - 0.01, -0.06, 0.1, 0.02, 0.47, { ry, round: 0.005 });
      y += h;
    }
  });
  let n = 0;
  for (const g of out) n += g.attributes.position.count;
  const merged = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['color', 3], ['aPbr', 4], ['aEv', 2]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of out) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    merged.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  merged.computeBoundingSphere();
  return merged;
}

function propMaterial(kit) {
  const uber = kit.materials.uber;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.3 });
  m.onBeforeCompile = (sh, r) => {
    uber.onBeforeCompile(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aEv;\nattribute vec2 iVar;')
      .replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
if (aEv.y > 0.5) {
  float sd = transformed.x < 0.0 ? -1.0 : 1.0;
  float a = (sin(uTime * 15.0 + iVar.y) * 0.85 + 0.25) * sd;
  vec2 h = vec2(sd * 0.14, 0.06), d = transformed.xy - h;
  transformed.xy = h + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
}
transformed *= float(abs(aEv.x - iVar.x) < 0.5);`);
  };
  m.customProgramCacheKey = () => 'iw2-evprops';
  return m;
}

const HALO_VERT = `attribute vec4 iRing;
varying vec2 vUv;
varying vec4 vR;
void main() {
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * iRing.y;
  gl_Position = projectionMatrix * c;
  vUv = position.xy;
  vR = iRing;
}`;
// x = time left (0..1, ≥1.5 = no timer), y = radius, z = pulse phase, w = strength.
const HALO_FRAG = `uniform float uTime;
varying vec2 vUv;
varying vec4 vR;
void main() {
  float r = length(vUv);
  float aa = fwidth(r) * 1.5;
  float pulse = 0.75 + 0.25 * sin(uTime * 4.0 + vR.z);
  float glow = pow(max(0.0, 1.0 - r), 2.2) * 0.32 * pulse;
  float band = 1.0 - smoothstep(0.045 - aa, 0.045 + aa, abs(r - 0.84));
  float a = fract(atan(vUv.x, vUv.y) / 6.2831853 + 1.0);
  float timed = step(vR.x, 1.4);
  float left = mix(1.0, step(a, vR.x), timed);
  float rim = 1.0 - smoothstep(0.02 - aa, 0.02 + aa, abs(r - 0.7));
  vec3 gold = vec3(1.0, 0.82, 0.36), warm = vec3(1.0, 0.95, 0.78);
  vec3 col = gold * glow + mix(gold, warm, left) * band * mix(0.12, 1.15, left) + gold * rim * 0.35 * pulse * (1.0 - timed * 0.4);
  gl_FragColor = vec4(col * vR.w, 1.0);
}`;

export function createEventArt(world, kit) {
  const scene = world.scene;
  const geo = templates(kit);
  const iVar = new THREE.InstancedBufferAttribute(new Float32Array(PROPS * 2), 2);
  geo.setAttribute('iVar', iVar);
  const props = new THREE.InstancedMesh(geo, propMaterial(kit), PROPS);
  props.name = 'events:props';
  props.castShadow = false;
  props.receiveShadow = true;

  const crowd = kit.crowd({ count: PEOPLE, blobs: true, scale: 1.36 });
  const people = crowd.mesh;
  people.name = 'events:people';

  const haloGeo = new THREE.PlaneGeometry(2, 2);
  const iRing = new THREE.InstancedBufferAttribute(new Float32Array(HALOS * 4), 4);
  haloGeo.setAttribute('iRing', iRing);
  const halos = new THREE.InstancedMesh(haloGeo, new THREE.ShaderMaterial({
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: { uTime: kit.materials.uTime },
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), HALOS);
  halos.name = 'events:halo';
  halos.renderOrder = 6;
  for (const m of [props, people, halos, crowd.blobMesh]) {
    if (!m) continue;
    m.frustumCulled = false;
    m.count = 0;
  }
  props.visible = people.visible = halos.visible = false;
  scene.add(props, halos);
  scene.add(people);

  let np = 0, nc = 0, nh = 0, time = 0;
  const looks = [];
  function prop(v, x, y, z, ry, s = 1, ph = 0, rx = 0, rz = 0) {
    if (np >= PROPS) return;
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.setScalar(s));
    props.setMatrixAt(np, _m);
    iVar.setXY(np++, v, ph);
  }
  // Local offset (lx, ly, lz) from a ground point facing heading h (0 = +z).
  const off = (x, z, h, lx, lz, out) => { const c = Math.cos(h), s = Math.sin(h); out[0] = x + lx * c + lz * s; out[1] = z - lx * s + lz * c; return out; };
  const o2 = [0, 0];
  function person(x, y, z, h, clip, look, phase = 0, speed = 3.8) {
    if (nc >= PEOPLE) return -1;
    const i = nc++;
    crowd.set(i, x, y, z, h, kit.CLIP[clip] ?? 0, phase, speed);
    const key = look.k;
    if (looks[i] !== key) { looks[i] = key; crowd.look(i, look); }
    return i;
  }
  function halo(x, y, z, left, r, k = 1, ph = 0) {
    if (nh >= HALOS) return;
    _m.makeTranslation(x, y, z);
    halos.setMatrixAt(nh, _m);
    iRing.setXYZW(nh++, left, r, ph, k);
  }
  const L = {
    band: { k: 'band', top: '#d6453d', bot: '#2f3e66', style: 4, hair: 0, skin: 1, acc: -1 },
    band2: { k: 'band2', top: '#f6f1e6', bot: '#d6453d', style: 4, hair: 4, skin: 3, acc: -1 },
    major: { k: 'major', top: '#f2b84b', bot: '#d6453d', style: 4, hair: 1, skin: 0, acc: -1 },
    celeb: { k: 'celeb', top: '#ffd34d', bot: '#2b2230', style: 1, hair: 3, skin: 5, acc: -1 },
    pap: { k: 'pap', top: '#5b5f66', bot: '#3f4452', style: 4, hair: 0, skin: 2, acc: -1 },
    pap2: { k: 'pap2', top: '#7a4f5a', bot: '#2f4a66', style: 0, hair: 1, skin: 4, acc: -1 },
    bulk: { k: 'bulk', top: '#6fb7a8', bot: '#4a5878', style: 2, hair: 6, skin: 1, acc: -1 },
    rush: [{ k: 'r0', top: '#e8776a', bot: '#4a5878', style: 0, hair: 2, skin: 0 }, { k: 'r1', top: '#7d9ad6', bot: '#6b5a7d', style: 1, hair: 5, skin: 3 }, { k: 'r2', top: '#9bc66b', bot: '#3f6b74', style: 3, hair: 0, skin: 2 }],
  };

  // e: {kind, x, y, z, h (heading), left (0..1), u (arrival 0..1), seed}; writes pick centre into e.px/py/pz + e.pr.
  function draw(e) {
    const { x, z, h } = e, t = time, sd = e.seed;
    const g = 0.1;
    switch (e.kind) {
      case 'pigeon': {
        const bob = Math.sin(t * 7 + sd) * 0.12;
        prop(V.pigeon, x, e.y + bob, z, h, 1.7, sd, Math.sin(t * 7 + sd) * 0.12);
        e.px = x; e.py = e.y + bob + 0.2; e.pz = z; e.pr = 1.45;
        break;
      }
      case 'limo': {
        const u = e.u, k = 1 - Math.pow(1 - u, 3);
        const lx = e.x0 + (x - e.x0) * k;
        const settle = u < 1 ? 0 : Math.max(0, 1 - (t - e.parkedAt) * 2) * Math.sin((t - e.parkedAt) * 18) * 0.03;
        prop(V.limo, lx, g, z, h, 0.92, 0, settle);
        e.px = lx; e.py = 1.4; e.pz = z; e.pr = 2.4;
        if (u >= 1) {
          off(lx, z, h, 1.9, 0.1, o2);
          person(o2[0], g, o2[1], h + Math.PI / 2, 'cheer', L.celeb, sd, 3);
          e.px = o2[0]; e.pz = o2[1]; e.py = 1.1; e.pr = 1.9;
          for (const [s, look] of [[-1, L.pap], [1, L.pap2]]) {
            off(lx, z, h, 3.2, s * 1.55, o2);
            const ph = h + Math.PI / 2 + Math.PI + s * 0.9;
            person(o2[0], g, o2[1], ph, 'carry', look, sd + s, 3);
            const cx = o2[0] + Math.sin(ph) * 0.45, cz = o2[1] + Math.cos(ph) * 0.45;
            prop(V.camera, cx, 0.92, cz, ph, 1.4);
            const f = (t * 1.7 + (s > 0 ? 0.47 : 0) + sd * 0.13) % 1;
            if (f < 0.09) prop(V.flash, cx, 1.18, cz, 0, 1.6 + f * 6);
          }
        }
        break;
      }
      case 'parade': {
        const ux = Math.sin(h), uz = Math.cos(h);
        person(x, g, z, h, 'walk', L.major, sd, 4.2);
        off(x, z, h, 0.36, 0.1, o2);
        prop(V.flag, o2[0], 0.5, o2[1], h, 1.45, 0, 0, Math.sin(t * 4.2) * 0.05);
        const roles = ['drum', 'horn', 'horn', 'drum', 'horn', 'horn'];
        for (let k = 0; k < roles.length; k++) {
          const side = k % 2 ? 0.55 : -0.55, back = 1.5 + (k >> 1) * 1.3;
          const wx = x - ux * back + side * uz, wz = z - uz * back - side * ux;
          person(wx, g, wz, h, 'carry', k % 4 < 2 ? L.band : L.band2, sd + k * 0.7, 4.2);
          const fx = wx + ux * 0.42, fz = wz + uz * 0.42;
          if (roles[k] === 'drum') prop(V.drum, fx, 0.5, fz, h, 1.6);
          else prop(V.horn, fx, 0.66, fz, h, 1.7, 0, -0.35);
        }
        e.px = x - ux * 1.6; e.py = 1.1; e.pz = z - uz * 1.6; e.pr = 2.6;
        break;
      }
      case 'wallet': {
        prop(V.wallet, x, g, z, sd, 1.5);
        const tw = Math.max(0, Math.sin(t * 3.1 + sd));
        if (tw > 0.05) prop(V.glint, x + 0.15, 0.55 + tw * 0.1, z + 0.1, t * 1.5, 0.35 + tw * 0.85);
        e.px = x; e.py = 0.35; e.pz = z; e.pr = 1.05;
        break;
      }
      case 'lucky': {
        const ph = t * 3.4 + sd, hop = Math.abs(Math.sin(ph));
        const squash = hop < 0.15 ? 1 - (0.15 - hop) * 1.6 : 1;
        if (np < PROPS) {
          _e.set(Math.sin(ph) * 0.12, sd + t * 0.6, 0, 'YXZ');
          _q.setFromEuler(_e);
          _m.compose(_p.set(x, g + hop * 0.9, z), _q, _s.set(1.25 / Math.sqrt(squash), 1.25 * squash, 1.25 / Math.sqrt(squash)));
          props.setMatrixAt(np, _m);
          iVar.setXY(np++, V.parcel, 0);
        }
        e.px = x; e.py = 0.6 + hop * 0.9; e.pz = z; e.pr = 1.2;
        break;
      }
      case 'bulk': {
        person(x, g, z, h, 'carry', L.bulk, sd, 2.5);
        prop(V.clipboard, x + Math.sin(h) * 0.42, 0.62, z + Math.cos(h) * 0.42, h, 1.3, 0, -0.75);
        off(x, z, h, -1.05, 0.15, o2);
        prop(V.boxes, o2[0], g, o2[1], h + 0.3, 1.25);
        e.px = x - Math.cos(h) * 0.5; e.py = 1.1; e.pz = z; e.pr = 1.6;
        break;
      }
      case 'rush': {
        for (let k = 0; k < 3; k++) {
          off(x, z, h, (k - 1) * 1.5, (k % 2) * -0.5, o2);
          prop(V.glowDisc, o2[0], 0.05, o2[1], 0, 1 + Math.sin(t * 5 + k) * 0.12);
          person(o2[0], g, o2[1], h + (k - 1) * 0.25, k === 1 ? 'cheer' : 'idle', L.rush[k], sd + k, 3.5);
          if (Math.sin(t * 2.4 + k * 2.1) > 0.7) prop(V.glint, o2[0], 2.05, o2[1], t, 0.5);
        }
        e.px = x; e.py = 1.0; e.pz = z; e.pr = 2.6;
        break;
      }
      default:
        prop(V.parcel, x, g, z, 0, 1);
        e.px = x; e.py = 0.6; e.pz = z; e.pr = 1.2;
    }
    halo(e.px, e.py, e.pz, e.left, e.pr, 1, sd);
  }

  return {
    V,
    get calls() { return (np ? 1 : 0) + (nc ? 2 : 0) + (nh ? 1 : 0); },
    // One camera's worth: line = null (hero, all events) or a lineId (that line's events + tip couriers only).
    fill(line, events, n, tips, simTime) {
      time = simTime;
      np = nc = nh = 0;
      for (let i = 0; i < n; i++) {
        const e = events[i];
        if (line && e.lineId !== line) continue;
        draw(e);
      }
      for (const c of tips) {
        if (line && c.lineId !== line) continue;
        halo(c.x, c.y + 1.3, c.z, 2, 1.05, 0.8, c.id);
        if (Math.sin(time * 3 + c.id) > 0.55) prop(V.glint, c.x, c.y + 2.0, c.z, time * 2 + c.id, 0.45);
      }
      props.count = np; people.count = nc; halos.count = nh;
      if (crowd.blobMesh) crowd.blobMesh.count = nc;
      props.visible = np > 0; people.visible = nc > 0; halos.visible = nh > 0;
      if (np) { props.instanceMatrix.needsUpdate = true; iVar.needsUpdate = true; }
      if (nc) crowd.commit();
      if (nh) { halos.instanceMatrix.needsUpdate = true; iRing.needsUpdate = true; }
    },
  };
}
