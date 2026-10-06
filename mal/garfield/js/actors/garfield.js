// Garfield: baked SDF sculpt (tools/sculpt) → SkinnedMesh + procedural clip blending + secondary motion.
import * as THREE from '../../vendor/three/three.module.js';
import { MESH } from './garfield_mesh.js';
import { BONES, TAIL_TIP } from './garfield_rig.js';
import { createFurMaterial } from './garfield_mat.js';
import { CLIPS, EXT, EXPRESSIONS } from './garfield_anim.js';
import { Pose, ClipPlayer, applyPose, Spring, clamp, lerp } from './shared/pose.js';

const TAU = Math.PI * 2;
const REST = Object.fromEntries(BONES.map((b) => [b[0], new THREE.Vector3(...b[2])]));
const LOCO_DEFAULT = { idle: 0, walk: 0.7, run: 2.6 };

function decode(s, T) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new T(u8.buffer);
}

function buildGeometry(L) {
  const g = new THREE.BufferGeometry();
  const q = decode(L.pos, Int16Array);
  const pos = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) pos[i] = MESH.qmin[i % 3] + ((q[i] + 32768) / 65535) * MESH.qr;
  const n8 = decode(L.nrm, Int8Array), nrm = new Float32Array(n8.length);
  for (let i = 0; i < n8.length; i++) nrm[i] = n8[i] / 127;
  const d16 = decode(L.dpos, Int16Array), dpos = new Float32Array(d16.length);
  for (let i = 0; i < d16.length; i++) dpos[i] = (d16[i] / 32767) * MESH.dscale;
  const dn8 = decode(L.dn, Int8Array), dn = new Float32Array(dn8.length);
  for (let i = 0; i < dn8.length; i++) dn[i] = dn8[i] / 127;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(decode(L.si, Uint8Array), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(decode(L.sw, Uint8Array), 4, true));
  g.setAttribute('tone', new THREE.BufferAttribute(decode(L.tone, Uint8Array), 3, true));
  g.setIndex(new THREE.BufferAttribute(L.nv < 65536 ? decode(L.idx, Uint16Array) : decode(L.idx, Uint32Array), 1));
  const idxArr = L.nv < 65536 ? decode(L.idx, Uint16Array) : decode(L.idx, Uint32Array);
  // lower legs/paws must not get fat (their deltas stretched spikes between the front paws)
  const si = decode(L.si, Uint8Array), sw = decode(L.sw, Uint8Array);
  const LOWER = new Set(['elbowL', 'pawL', 'elbowR', 'pawR', 'shinL', 'footL', 'shinR', 'footR'].map((n) => BONES.findIndex((b) => b[0] === n)));
  for (let v = 0; v < pos.length / 3; v++) {
    let w = 0;
    for (let j = 0; j < 4; j++) if (LOWER.has(si[v * 4 + j])) w += sw[v * 4 + j] / 255;
    const y = pos[v * 3 + 1];
    const k = Math.min(1 - Math.min(1, w * 1.25), Math.max(0, Math.min(1, (y - 0.03) / 0.09)));
    dpos[v * 3] *= k; dpos[v * 3 + 1] *= k; dpos[v * 3 + 2] *= k;
  }
  smoothMorph(dpos, idxArr, pos.length / 3);
  g.morphAttributes.position = [new THREE.BufferAttribute(dpos, 3)];
  g.morphAttributes.normal = [new THREE.BufferAttribute(dn, 3)];
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  return g;
}

// The baked belly-fat deltas have a few outliers (between the front legs) that stretch into spiky triangles
// at setBelly(1): pull any vertex whose delta disagrees with its 1-ring back to the ring average, then relax.
function smoothMorph(d, idx, nv) {
  const nb = Array.from({ length: nv }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  const avg = new Float32Array(3);
  const ring = (v, out) => {
    out[0] = out[1] = out[2] = 0; let n = 0;
    for (const u of nb[v]) { out[0] += d[u * 3]; out[1] += d[u * 3 + 1]; out[2] += d[u * 3 + 2]; n++; }
    if (n) { out[0] /= n; out[1] /= n; out[2] /= n; }
    return n;
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let v = 0; v < nv; v++) {
      if (!ring(v, avg)) continue;
      const k = v * 3;
      const dx = d[k] - avg[0], dy = d[k + 1] - avg[1], dz = d[k + 2] - avg[2];
      const dev = Math.hypot(dx, dy, dz), mag = Math.hypot(avg[0], avg[1], avg[2]);
      const w = dev > 0.35 * mag + 0.006 ? 1 : 0.3;
      d[k] -= dx * w; d[k + 1] -= dy * w; d[k + 2] -= dz * w;
    }
  }
}

function eyeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const u = { uPupil: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform float uPupil;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = normalize(vObj);
  float r = length(p.xy) * step(0.0, p.z);
  r = p.z > 0.0 ? r : 2.0;
  float aa = fwidth(r) + 0.01;
  vec3 sclera = mix(vec3(0.86,0.83,0.78), vec3(1.0,0.985,0.95), smoothstep(-0.2, 0.9, p.z));
  float iris = 1.0 - smoothstep(0.42-aa, 0.42+aa, r);
  float pup = 1.0 - smoothstep(0.27*(1.0+uPupil)-aa, 0.27*(1.0+uPupil)+aa, r);
  vec3 c = mix(sclera, mix(vec3(0.33,0.2,0.09), vec3(0.16,0.09,0.04), smoothstep(0.1,0.42,r)), iris);
  c = mix(c, vec3(0.02), pup);
  float hl = 1.0 - smoothstep(0.07, 0.1, length(p.xy - vec2(0.15, 0.17)));
  c = mix(c, vec3(1.0), hl * step(0.0, p.z));
  diffuseColor.rgb = c;
}`);
  };
  m.customProgramCacheKey = () => 'garfield-eye-v1';
  return m;
}

export async function createGarfield({ quality = 'high', shellFur = false } = {}) {
  const lodName = quality === 'low' ? 'low' : quality === 'medium' ? 'medium' : 'high';
  const geo = buildGeometry(MESH.lods[lodName]);
  const disposables = [geo];

  // skeleton
  const bones = [], rest = [], byName = {};
  for (const [name, parent, p] of BONES) {
    const b = new THREE.Bone(); b.name = 'g_' + name;
    const pp = parent ? REST[parent] : new THREE.Vector3();
    b.position.set(p[0] - pp.x, p[1] - pp.y, p[2] - pp.z);
    if (parent) byName[parent].add(b);
    bones.push(b); byName[name] = b;
    rest.push({ pos: b.position.clone(), quat: new THREE.Quaternion() });
  }
  const tailPts = [...BONES.filter((b) => b[0].startsWith('tail')).map((b) => b[2]), TAIL_TIP];
  const fur = createFurMaterial({ tailPts, quality });
  if (lodName === 'low') { fur.sheen = 0; }
  disposables.push(fur);
  const mesh = new THREE.SkinnedMesh(geo, fur);
  mesh.name = 'garfield_body';
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.morphTargetInfluences = [0];

  // fuzzy silhouette: alpha-tested shells pushed out along the skinned normal (high quality only)
  const shells = [];
  if (shellFur && lodName === 'high') {
    const N = 4;
    for (let i = 1; i <= N; i++) {
      const m = createFurMaterial({ tailPts, shell: i / N, shared: fur.userData.uniforms });
      disposables.push(m);
      const sm = new THREE.SkinnedMesh(geo, m);
      sm.bind(mesh.skeleton, mesh.bindMatrix);
      sm.frustumCulled = false; sm.receiveShadow = true;
      sm.morphTargetInfluences = mesh.morphTargetInfluences;
      shells.push(sm);
    }
  }
  const root = new THREE.Object3D(); root.name = 'garfield';
  const squash = new THREE.Object3D();
  root.add(squash); squash.add(mesh);
  for (const sm of shells) squash.add(sm);

  const local = (bone, p) => new THREE.Vector3(p[0] - REST[bone].x, p[1] - REST[bone].y, p[2] - REST[bone].z);
  const head = byName.head;

  // ---- face parts
  const lidMat = new THREE.MeshPhysicalMaterial({ color: 0xf08a24, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0xffc690), sheenRoughness: 0.55 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x24120a, roughness: 0.7 });
  const eyeMat = eyeMaterial();
  const noseMat = new THREE.MeshPhysicalMaterial({ color: 0xe9808d, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  disposables.push(lidMat, lineMat, eyeMat, noseMat);
  const sph = (r, ws, hs, ps, pl, ts, tl) => { const g = new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl); disposables.push(g); return g; };
  const segs = lodName === 'low' ? 16 : 28;
  const eyeGeo = sph(1, segs, segs * 0.75 | 0);
  const lidGeo = sph(1.07, segs, 10, 0, TAU, 0, Math.PI / 2);
  const lowGeo = sph(1.05, segs, 8, 0, TAU, Math.PI / 2, Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(1.07, 0.075, 6, segs, Math.PI); disposables.push(rimGeo);
  const eyes = [];
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.copy(local('head', [s * 0.047, 0.437, 0.343]));
    g.rotation.set(-0.12, s * 0.3, 0);
    g.scale.set(0.041, 0.037, 0.026);
    const ball = new THREE.Mesh(eyeGeo, eyeMat);
    const lidPivot = new THREE.Group();
    const lid = new THREE.Mesh(lidGeo, lidMat);
    const rim = new THREE.Mesh(rimGeo, lineMat); rim.rotation.x = Math.PI / 2;
    lid.add(rim);
    lidPivot.add(lid);
    const low = new THREE.Mesh(lowGeo, lidMat);
    g.add(ball, lidPivot, low);
    head.add(g);
    eyes.push({ s, g, ball, lidPivot, lid, low, base: g.scale.clone() });
  }
  const nose = new THREE.Mesh(sph(1, 20, 14), noseMat);
  nose.position.copy(local('head', [0, 0.388, 0.383]));
  nose.scale.set(0.021, 0.0135, 0.014);
  nose.rotation.x = 0.35;
  head.add(nose);

  // whiskers
  const wpts = [];
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
    const a = new THREE.Vector3(s * 0.062, 0.362 - i * 0.011, 0.368);
    const ctrl = [a, new THREE.Vector3(s * 0.12, 0.368 - i * 0.016, 0.355 - i * 0.004), new THREE.Vector3(s * 0.18, 0.36 - i * 0.03, 0.335 - i * 0.012)];
    const curve = new THREE.QuadraticBezierCurve3(...ctrl);
    const pts = curve.getPoints(6);
    for (let k = 0; k < pts.length - 1; k++) wpts.push(pts[k].clone().sub(REST.head), pts[k + 1].clone().sub(REST.head));
  }
  const wGeo = new THREE.BufferGeometry().setFromPoints(wpts);
  const wMat = new THREE.LineBasicMaterial({ color: 0xf6eee2, transparent: true, opacity: 0.85 });
  disposables.push(wGeo, wMat);
  head.add(new THREE.LineSegments(wGeo, wMat));

  // dynamic mouth (line when closed → open lens with tongue) on the face surface
  const MW = 0.04, MN = 13;
  const surfZ = sampleFaceZ(geo);
  const mouthGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(MN * 3 * 3), mCol = new Float32Array(MN * 3 * 3);
  const mIdx = [];
  for (let i = 0; i < MN - 1; i++) for (let r = 0; r < 2; r++) {
    const a = i * 3 + r, b = (i + 1) * 3 + r, c = (i + 1) * 3 + r + 1, d = i * 3 + r + 1;
    mIdx.push(a, d, b, b, d, c);
  }
  mouthGeo.setIndex(mIdx);
  mouthGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  mouthGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  const mouthMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  disposables.push(mouthGeo, mouthMat);
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.frustumCulled = false;
  head.add(mouth);
  const MOUTH_Y = 0.329;
  const fangGeo = new THREE.ConeGeometry(0.0035, 0.009, 6); fangGeo.rotateX(Math.PI);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.4 });
  disposables.push(fangGeo, toothMat);
  const fangs = [1, -1].map((s) => { const f = new THREE.Mesh(fangGeo, toothMat); head.add(f); f.userData.s = s; return f; });
  const dark = new THREE.Color(0x3a0f12), tongueC = new THREE.Color(0xd9606e), lineC = new THREE.Color(0x2a120c);
  function updateMouth(open, smile, tongue) {
    open = clamp(open, 0, 1.2);
    const thick = 0.0022;
    for (let i = 0; i < MN; i++) {
      const u = i / (MN - 1) * 2 - 1, x = u * MW, ax = Math.abs(u);
      const top = MOUTH_Y - 0.006 * Math.sin(Math.PI * ax) * (1 - open * 0.7) + smile * 0.009 * ax * ax + open * 0.004;
      const h = (thick * (1 - ax * 0.6)) + open * 0.046 * Math.pow(Math.max(0, Math.cos(u * Math.PI / 2)), 0.7);
      const ys = [top, top - h * 0.55, top - h];
      for (let r = 0; r < 3; r++) {
        const k = (i * 3 + r) * 3;
        const y = ys[r];
        mPos[k] = x - REST.head.x; mPos[k + 1] = y - REST.head.y; mPos[k + 2] = surfZ(x, y) + 0.0015 - REST.head.z;
        const c = r === 2 ? dark.clone().lerp(tongueC, clamp(tongue * open * 1.5, 0, 1) * (1 - ax)) : (open < 0.05 ? lineC : dark);
        mCol[k] = c.r; mCol[k + 1] = c.g; mCol[k + 2] = c.b;
      }
    }
    mouthGeo.attributes.position.needsUpdate = true;
    mouthGeo.attributes.color.needsUpdate = true;
    for (const f of fangs) {
      const x = f.userData.s * 0.014, y = MOUTH_Y + open * 0.004 - 0.006 * Math.sin(Math.PI * 0.35);
      f.position.set(x - REST.head.x, y - 0.004 - REST.head.y, surfZ(x, y) + 0.001 - REST.head.z);
      const sc = clamp((open - 0.15) * 3, 0, 1);
      f.scale.setScalar(sc || 1e-4); f.visible = sc > 0.01;
    }
  }

  // claws
  const clawGeo = new THREE.ConeGeometry(0.0055, 0.028, 6); clawGeo.rotateX(Math.PI / 2 + 0.4);
  const clawMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.35 });
  disposables.push(clawGeo, clawMat);
  const claws = [];
  for (const side of ['L', 'R']) for (const tx of [-1, 0, 1]) {
    const c = new THREE.Mesh(clawGeo, clawMat);
    c.position.set(tx * 0.022, -0.012, 0.082 - Math.abs(tx) * 0.008);
    c.scale.setScalar(1e-4);
    byName['paw' + side].add(c); claws.push(c);
  }

  // dizzy stars (whacked)
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? 0.011 : 0.026; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 });
  starGeo.center();
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffb000, emissiveIntensity: 0.6, roughness: 0.4 });
  disposables.push(starGeo, starMat);
  const starRing = new THREE.Group(); starRing.position.copy(local('head', [0, 0.53, 0.25])); starRing.visible = false;
  const stars = [0, 1, 2].map((i) => { const m = new THREE.Mesh(starGeo, starMat); starRing.add(m); return m; });
  head.add(starRing);

  // sockets
  const sock = (bone, p) => { const o = new THREE.Object3D(); o.position.copy(local(bone, p)); byName[bone].add(o); return o; };
  const sockets = {
    head: sock('head', [0, 0.45, 0.25]),
    mouth: sock('head', [0, 0.325, 0.37]),
    pawR: sock('pawR', [-0.092, 0.01, 0.2]),
    pawL: sock('pawL', [0.092, 0.01, 0.2]),
    belly: sock('belly', [0, 0.12, 0.05]),
  };

  // ---- animation state
  const makePose = () => new Pose(BONES.map((b) => b[0]), EXT);
  const ctx = { time: 0, locoSpeed: 0, phase: 0, tmpPose: makePose() };
  const player = new ClipPlayer(CLIPS, makePose, 'idle');
  player.play('idle', { fade: 0 });
  let moveSpeed = 0, moveSetAt = -1;
  let belly = 0, bellyTarget = 0;
  let lookTarget = null;
  const look = { yaw: 0, pitch: 0, w: 0 };
  let expr = 'smug';
  const exprCur = { lidU: 0.4, lidD: 0.1, lidTilt: 0.12, smile: 0.35, pupil: 0, eyeScale: 0, mouth: 0 };
  let blinkT = 2 + Math.random() * 3, blinkA = 0;
  const bellySpr = new Spring(170, 7), bellySprZ = new Spring(140, 7), sqSpr = new Spring(260, 14);
  const tailYaw = new Spring(40, 7), tailPitch = new Spring(40, 7);
  const earL = new Spring(300, 9), earR = new Spring(300, 9);
  let earT = 3;
  const prev = { y: null, vy: 0, yaw: null, bodyY: null, bodyV: 0, pos: new THREE.Vector3() };
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), tv = new THREE.Vector3();
  let clawOn = false, clawCur = 0;

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    ctx.time += dt;
    // locomotion speed
    const cur = player.name;
    const explicit = moveSetAt >= 0 && ctx.time - moveSetAt < 0.6;
    const target = explicit ? moveSpeed : (LOCO_DEFAULT[cur] ?? 0);
    ctx.locoSpeed += (target - ctx.locoSpeed) * Math.min(1, dt * 8);
    const s = ctx.locoSpeed;
    const stride = lerp(0.33, 0.6, clamp((s - 0.8) / 1.6, 0, 1));   // ≈ stance foot travel ÷ stance fraction (no foot-sliding)
    ctx.phase = (ctx.phase + dt * Math.max(s, 0) / stride) % 1000;

    const P = player.update(dt, ctx);
    const X = P.x;

    // world motion for secondary
    root.updateWorldMatrix(true, false);
    root.getWorldPosition(wp);
    root.getWorldQuaternion(wq);
    const yaw = Math.atan2(2 * (wq.w * wq.y + wq.x * wq.z), 1 - 2 * (wq.y * wq.y + wq.x * wq.x));
    let vy = 0, yawRate = 0;
    if (prev.y !== null) {
      vy = (wp.y - prev.y) / dt;
      let dy = yaw - prev.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yawRate = dy / dt;
      if (prev.vy < -1.2 && vy > -0.3) { // touchdown
        const imp = Math.min(4, -prev.vy);
        bellySpr.v -= imp * 0.12 * (0.6 + belly);
        sqSpr.v -= imp * 1.4;
      }
    }
    const bodyY = wp.y + X.rootY + P.off[3 * 1 + 1];
    let bodyA = 0;
    if (prev.bodyY !== null) {
      const bv = (bodyY - prev.bodyY) / dt;
      bodyA = clamp((bv - prev.bodyV) / dt, -60, 60);
      prev.bodyV = bv;
    }
    prev.bodyY = bodyY; prev.y = wp.y; prev.vy = vy; prev.yaw = yaw;

    // expression baseline + blink
    const E = EXPRESSIONS[expr] || EXPRESSIONS.smug;
    for (const k in exprCur) exprCur[k] += ((E[k] ?? 0) - exprCur[k]) * Math.min(1, dt * 10);
    blinkT -= dt;
    if (blinkT < 0) { blinkA = 1; blinkT = 2.2 + Math.random() * 4; }
    blinkA = Math.max(0, blinkA - dt * 7);
    const blink = X.blinkOff > 0.5 ? 0 : Math.sin(Math.min(1, blinkA) * Math.PI);

    // look-at (neck/head)
    let wantW = 0, wantYaw = 0, wantPitch = 0;
    if (lookTarget) {
      tv.copy(lookTarget); root.worldToLocal(tv);
      tv.sub(REST.head);
      wantYaw = clamp(Math.atan2(tv.x, tv.z), -1.2, 1.2);
      wantPitch = clamp(-Math.atan2(tv.y, Math.hypot(tv.x, tv.z)), -0.6, 0.6);
      wantW = 1;
    }
    wantW *= 1 - clamp(X.noLook, 0, 1);
    const ls = Math.min(1, dt * 6);
    look.w += (wantW - look.w) * ls; look.yaw += (wantYaw - look.yaw) * ls; look.pitch += (wantPitch - look.pitch) * ls;
    P.r('neck', look.pitch * 0.35 * look.w, look.yaw * 0.4 * look.w);
    P.r('head', look.pitch * 0.55 * look.w, look.yaw * 0.6 * look.w);

    // belly jiggle
    const bk = 0.6 + belly * 0.8;
    bellySpr.step(dt, 0, -bodyA * 0.004 * bk);
    bellySprZ.step(dt, 0, -clamp(s - (prev.s ?? s), -1, 1) / dt * 0.02);
    prev.s = s;
    const by = clamp(bellySpr.x, -0.035, 0.035), bz = clamp(bellySprZ.x, -0.02, 0.02);
    P.o('belly', 0, by, bz);
    P.s('belly', -by * 2.5, by * 4, -by * 2.5);

    // tail lag
    tailYaw.step(dt, clamp(-yawRate * 0.12, -0.6, 0.6));
    tailPitch.step(dt, clamp(-vy * 0.12, -0.5, 0.5));
    for (let i = 0; i < 6; i++) P.r('tail' + i, tailPitch.x * (i + 1) / 6, tailYaw.x * (0.4 + i * 0.25));

    // ears: flicks + pinning back
    earT -= dt;
    if (earT < 0) { earT = 2.5 + Math.random() * 5; (Math.random() < 0.5 ? earL : earR).v += 14 + Math.random() * 8; }
    earL.step(dt); earR.step(dt);
    const eb = clamp(X.earsBack, 0, 1.2);
    P.r('earL', -0.5 * eb + earL.x * 0.1, 0, -0.45 * eb - earL.x * 0.25);
    P.r('earR', -0.5 * eb + earR.x * 0.1, 0, 0.45 * eb + earR.x * 0.25);

    // squash group
    sqSpr.step(dt);
    const sy = clamp(1 + X.sqY + sqSpr.x * 0.06, 0.2, 1.6);
    const sxz = 1 / Math.sqrt(sy);
    squash.scale.set(sxz, sy, sxz);
    squash.position.set(0, Math.max(0, X.rootY), X.rootZ);

    // cheeks puff
    if (X.cheeks) P.s('head', 0.05 * X.cheeks, -0.015 * X.cheeks, 0.01 * X.cheeks);

    applyPose(P, bones, rest);

    // belly morph
    belly += (bellyTarget - belly) * Math.min(1, dt * 3);
    mesh.morphTargetInfluences[0] = belly;

    // face
    const lidU = clamp(exprCur.lidU + X.lidU + blink * 1.5, -0.4, 1.0);
    const lidD = clamp(exprCur.lidD + X.lidD + blink * 0.2, 0, 1);
    const tilt = exprCur.lidTilt + X.lidTilt;
    const eyeS = 1 + exprCur.eyeScale + X.eyeScale;
    const lyaw = clamp(look.yaw * look.w * 0.6, -0.5, 0.5), lpitch = look.pitch * look.w * 0.5 + 0.22 + X.lookDown * 0.3;
    const dz = clamp(X.dizzy, 0, 1);
    starRing.visible = dz > 0.02;
    if (starRing.visible) {
      starRing.scale.set(dz / squash.scale.x, dz / squash.scale.y, dz / squash.scale.z);
      for (let i = 0; i < 3; i++) {
        const a = ctx.time * 5 + i * TAU / 3;
        stars[i].position.set(Math.cos(a) * 0.12, 0.012 * Math.sin(a * 2), Math.sin(a) * 0.1);
        stars[i].rotation.set(0, -a, ctx.time * 4);
      }
    }
    for (const e of eyes) {
      e.g.scale.copy(e.base).multiplyScalar(eyeS);
      e.lid.rotation.x = lerp(-0.9, 1.55, lidU);
      e.lidPivot.rotation.z = -e.s * tilt;
      e.low.rotation.x = lerp(1.2, -0.9, lidD);
      e.ball.rotation.set(lpitch, lyaw - e.s * 0.06, 0);
      if (dz > 0) { const a = ctx.time * 9 * e.s; e.ball.rotation.x += Math.sin(a) * 0.45 * dz; e.ball.rotation.y += Math.cos(a) * 0.45 * dz; }
    }
    eyeMat.userData.u.uPupil.value = exprCur.pupil + X.pupil;
    updateMouth(exprCur.mouth + X.mouth, exprCur.smile + X.smile, X.tongue);
    jawOpen(exprCur.mouth + X.mouth);

    clawCur += ((clawOn ? 1 : 0) + X.claw > 0.5 ? dt * 14 : -dt * 8);
    clawCur = clamp(clawCur, 0, 1);
    for (const c of claws) { c.scale.setScalar(clawCur > 0.01 ? clawCur : 1e-4); c.visible = clawCur > 0.01; }   // hidden = no draw call
  }
  const XAXIS = new THREE.Vector3(1, 0, 0);
  function jawOpen(o) {
    byName.jaw.quaternion.setFromAxisAngle(XAXIS, clamp(o, 0, 1.2) * 0.35);
  }

  const api = {
    root,
    mesh,
    shells,
    setFur(on) { for (const sm of shells) sm.visible = !!on; },
    bones: byName,
    update,
    play: (name, opts) => player.play(name, opts),
    setMove(speed) {
      moveSpeed = Math.max(0, speed || 0); moveSetAt = ctx.time;
      // re-enter locomotion unless a one-shot is still mid-play (it returns to idle by itself)
      const L = player.current;
      if (L && !LOCO_DEFAULT.hasOwnProperty(L.name) && (L.loop || L.done)) player.play('idle', { fade: 0.2 });
    },
    lookAt(v) { lookTarget = v ? (lookTarget || new THREE.Vector3()).copy(v) : null; },
    sockets,
    height: 0.5,
    radius: 0.22,
    anims: Object.keys(CLIPS),
    setBelly(t) { bellyTarget = clamp(t, 0, 1); api.radius = 0.22 + 0.06 * bellyTarget; },
    getBelly: () => belly,
    claw(on) { clawOn = !!on; },
    setExpression(name) { if (EXPRESSIONS[name]) expr = name; },
    get expression() { return expr; },
    get clip() { return player.name; },
    dispose() {
      root.removeFromParent();
      for (const d of disposables) d.dispose?.();
    },
  };
  update(0.016);
  return api;
}

// Sample the rest-pose face surface z on a small (x,y) grid in front of the mouth (raycast from the front).
function sampleFaceZ(geo) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const rc = new THREE.Raycaster();
  const xs = [], ys = [], NX = 9, NY = 9, x0 = -0.05, x1 = 0.05, y0 = 0.28, y1 = 0.36;
  const Z = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const x = x0 + (x1 - x0) * i / (NX - 1), y = y0 + (y1 - y0) * j / (NY - 1);
    rc.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    const hit = rc.intersectObject(m, false)[0];
    Z[j * NX + i] = hit ? hit.point.z : 0.33;
  }
  m.material.dispose();
  return (x, y) => {
    const fx = clamp((x - x0) / (x1 - x0) * (NX - 1), 0, NX - 1.001), fy = clamp((y - y0) / (y1 - y0) * (NY - 1), 0, NY - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const a = Z[j * NX + i], b = Z[j * NX + i + 1], c = Z[(j + 1) * NX + i], d = Z[(j + 1) * NX + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}
