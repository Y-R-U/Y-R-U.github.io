// Odie: baked SDF sculpt (tools/sculpt/odie_sculpt.js → bake_odie.mjs) → SkinnedMesh + procedural clips
// + secondary motion (floppy ears, wobbly tongue, tail wag). Same common API as Garfield.
import * as THREE from '../../vendor/three/three.module.js';
import { MESH } from './odie_mesh.js';
import { BONES, TAIL_TIP, TAIL_N, BONE_INDEX } from './odie_rig.js';
import { CLIPS, EXT, EXPRESSIONS } from './odie_anim.js';
import { Pose, ClipPlayer, applyPose, Spring, clamp, lerp } from './shared/pose.js';

const TAU = Math.PI * 2;
const REST = Object.fromEntries(BONES.map((b) => [b[0], new THREE.Vector3(...b[2])]));
const LOCO_DEFAULT = { idle: 0, walk: 0.8, run: 3.0 };
const MOVE_OK = new Set(['gallop_goofy', 'walk_socked']);
const PIVOT = new THREE.Vector3(0, 0.42, 0);

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
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(decode(L.si, Uint8Array), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(decode(L.sw, Uint8Array), 4, true));
  g.setAttribute('tone', new THREE.BufferAttribute(decode(L.tone, Uint8Array), 3, true));
  g.setIndex(new THREE.BufferAttribute(decode(L.idx, Uint16Array), 1));
  g.computeBoundingSphere();
  return g;
}

function furMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.8, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff0b0), specularIntensity: 0.25 });
  const u = {
    uYellow: { value: new THREE.Color(0xf0d47a) }, uYellow2: { value: new THREE.Color(0xf7e39a) },
    uCream: { value: new THREE.Color(0xfbf0c8) }, uBlack: { value: new THREE.Color(0x1d1714) }, uPink: { value: new THREE.Color(0xe46a7c) },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 tone;\nvarying vec3 vTone;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position; vTone = tone;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uYellow, uYellow2, uCream, uBlack, uPink; varying vec3 vTone; varying vec3 vRest;
float oh(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float on3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(oh(i),oh(i+vec3(1,0,0)),f.x),mix(oh(i+vec3(0,1,0)),oh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(oh(i+vec3(0,0,1)),oh(i+vec3(1,0,1)),f.x),mix(oh(i+vec3(0,1,1)),oh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float fn = on3(vRest*240.0)*0.6 + on3(vRest*60.0)*0.4;
  vec3 c = mix(uYellow, uYellow2, smoothstep(0.3, 0.6, vRest.y) * 0.5 + (fn-0.5)*0.4);
  c = mix(c, uCream, vTone.z);
  c = mix(c, uBlack * (0.85 + 0.3*fn), smoothstep(0.35, 0.6, vTone.x));
  c = mix(c, uPink, smoothstep(0.3, 0.6, vTone.y));
  c *= 0.92 + 0.16*fn;
  diffuseColor.rgb = c;
}`)
      .replace('#include <opaque_fragment>', `{
  float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  outgoingLight += vec3(1.0, 0.92, 0.7) * diffuseColor.rgb * pow(fr, 2.2) * 0.3;
  outgoingLight += diffuseColor.rgb * 0.06;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'odie-fur-v1';
  return mat;
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
  float r = p.z > 0.0 ? length(p.xy) : 2.0;
  float aa = fwidth(r) + 0.01;
  vec3 c = mix(vec3(0.88,0.86,0.82), vec3(1.0,0.99,0.96), smoothstep(-0.2, 0.9, p.z));
  float pr = 0.27*(1.0+uPupil);
  c = mix(c, vec3(0.03), 1.0 - smoothstep(pr-aa, pr+aa, r));
  float hl = 1.0 - smoothstep(0.05, 0.075, length(p.xy - vec2(0.09, 0.1)));
  c = mix(c, vec3(1.0), hl * step(0.0, p.z));
  diffuseColor.rgb = c;
}`);
  };
  m.customProgramCacheKey = () => 'odie-eye-v2';
  return m;
}

// red/white striped sock tube, closed at the far end; length along +Y from 0
function sockGeo(r, len, flat = 1) {
  const g = new THREE.CylinderGeometry(r * 0.92, r, len, 14, 6, false);
  g.translate(0, len / 2, 0);
  const cap = new THREE.SphereGeometry(r * 0.92, 14, 6, 0, TAU, 0, Math.PI / 2); cap.translate(0, len, 0);
  const merged = [g, cap];
  const pos = [], col = [], idx = [];
  let base = 0;
  const cA = new THREE.Color(0xd8343c), cB = new THREE.Color(0xf8f2e6);
  for (const gg of merged) {
    const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      pos.push(p.getX(i) * flat, y, p.getZ(i));
      const c = y < 0.012 ? cA : (Math.floor(y / (len / 5)) % 2 ? cA : cB);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < gg.index.count; i++) idx.push(gg.index.getX(i) + base);
    base += p.count; gg.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx); out.computeVertexNormals();
  return out;
}

export async function createOdie({ quality = 'high' } = {}) {
  const lodName = quality === 'low' ? 'low' : quality === 'medium' ? 'medium' : 'high';
  const geo = buildGeometry(MESH.lods[lodName]);
  const disposables = [geo];

  const bones = [], rest = [], byName = {};
  for (const [name, parent, p] of BONES) {
    const b = new THREE.Bone(); b.name = 'o_' + name;
    const pp = parent ? REST[parent] : new THREE.Vector3();
    b.position.set(p[0] - pp.x, p[1] - pp.y, p[2] - pp.z);
    if (parent) byName[parent].add(b);
    bones.push(b); byName[name] = b;
    rest.push({ pos: b.position.clone(), quat: new THREE.Quaternion() });
  }
  const fur = furMaterial();
  disposables.push(fur);
  const mesh = new THREE.SkinnedMesh(geo, fur);
  mesh.name = 'odie_body';
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;

  // thin whippy black tail: tapered tube skinned along the tail chain
  const tailPts = [...Array(TAIL_N).keys()].map((i) => REST['tail' + i].clone()).concat([new THREE.Vector3(...TAIL_TIP)]);
  tailPts[0].lerp(tailPts[1], 0.15);
  const TSEG = quality === 'low' ? 18 : 36, TRAD = quality === 'low' ? 5 : 7;
  const tailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts), TSEG, 1, TRAD, false);
  {
    const pos = tailGeo.attributes.position, nv = pos.count;
    const curve = new THREE.CatmullRomCurve3(tailPts), c = new THREE.Vector3(), v = new THREE.Vector3();
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const ring = TRAD + 1;
    for (let k = 0; k < nv; k++) {
      const j = Math.floor(k / ring), u = j / TSEG;
      curve.getPointAt(u, c);
      const r = lerp(0.016, 0.0065, Math.pow(u, 0.8)) * (u > 0.9 ? Math.sqrt(Math.max(0.02, 1 - (u - 0.9) / 0.1)) : 1);
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
      const sb = u * TAIL_N, jn = Math.round(sb), d = sb - jn;
      const lo = clamp(jn - 1, 0, TAIL_N - 1), hi = clamp(jn, 0, TAIL_N - 1);
      const wh = clamp((d + 0.35) / 0.7, 0, 1);
      si[k * 4] = BONE_INDEX['tail' + lo]; si[k * 4 + 1] = BONE_INDEX['tail' + hi];
      sw[k * 4] = 1 - wh; sw[k * 4 + 1] = wh;
    }
    tailGeo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    tailGeo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    tailGeo.computeVertexNormals();
  }
  const tailMat = new THREE.MeshPhysicalMaterial({ color: 0x1d1714, roughness: 0.75, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x8a7a66) });
  disposables.push(tailGeo, tailMat);
  const tailMesh = new THREE.SkinnedMesh(tailGeo, tailMat);
  tailMesh.name = 'odie_tail';
  tailMesh.castShadow = true; tailMesh.frustumCulled = false;

  const root = new THREE.Object3D(); root.name = 'odie';
  const squash = new THREE.Object3D(), spin = new THREE.Object3D(), unpivot = new THREE.Object3D();
  root.add(squash); squash.add(spin); spin.position.copy(PIVOT); spin.add(unpivot); unpivot.position.copy(PIVOT).negate();
  unpivot.add(mesh);
  unpivot.add(tailMesh);
  tailMesh.bind(mesh.skeleton, mesh.bindMatrix);
  const local = (bone, p) => new THREE.Vector3(p[0] - REST[bone].x, p[1] - REST[bone].y, p[2] - REST[bone].z);
  const head = byName.head;
  const segs = lodName === 'low' ? 14 : 24;
  const sph = (r, ws, hs, ps, pl, ts, tl) => { const g = new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl); disposables.push(g); return g; };

  // ---- face: big round eyes close together, half-lidded; shiny black nose; mouth cavity
  const eyeMat = eyeMaterial();
  const lidMat = new THREE.MeshPhysicalMaterial({ color: 0xf0d47a, roughness: 0.8, sheen: 0.6, sheenColor: new THREE.Color(0xfff0b0) });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.7 });
  const noseMat = new THREE.MeshPhysicalMaterial({ color: 0x141010, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a1214, roughness: 0.8 });
  disposables.push(eyeMat, lidMat, lineMat, noseMat, darkMat);
  const eyeGeo = sph(1, segs, segs * 0.75 | 0), lidGeo = sph(1.07, segs, 10, 0, TAU, 0, Math.PI / 2), lowGeo = sph(1.05, segs, 8, 0, TAU, Math.PI / 2, Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(1.07, 0.06, 6, segs, Math.PI); disposables.push(rimGeo);
  const eyes = [];
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.copy(local('head', [s * 0.043, 0.79, 0.342]));
    g.rotation.set(-0.08, s * 0.2, 0);
    g.scale.set(0.045, 0.053, 0.034);
    const ball = new THREE.Mesh(eyeGeo, eyeMat);
    const lidPivot = new THREE.Group(), lid = new THREE.Mesh(lidGeo, lidMat);
    const rim = new THREE.Mesh(rimGeo, lineMat); rim.rotation.x = Math.PI / 2; lid.add(rim);
    lidPivot.add(lid);
    const low = new THREE.Mesh(lowGeo, lidMat);
    g.add(ball, lidPivot, low);
    head.add(g);
    eyes.push({ s, g, ball, lid, lidPivot, low, base: g.scale.clone() });
  }
  const nose = new THREE.Mesh(sph(1, 20, 14), noseMat);
  nose.position.copy(local('head', [0, 0.708, 0.53])); nose.scale.set(0.034, 0.025, 0.022); nose.rotation.x = 0.25;
  head.add(nose);
  const cavity = new THREE.Mesh(sph(1, 16, 10), darkMat);
  cavity.position.copy(local('head', [0, 0.648, 0.42])); cavity.scale.set(0.038, 0.012, 0.07);
  head.add(cavity);

  // grin line along the upper lip, curling up into the cheeks (reads as a smile with the tongue in)
  const SM = [[0.0696, 0.6987, 0.3751], [0.0796, 0.6809, 0.3887], [0.0862, 0.6618, 0.4047], [0.0642, 0.6357, 0.4493], [0.0314, 0.6405, 0.481], [0, 0.64, 0.501]];
  const smPts = [...SM, ...SM.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])].map((p) => local('head', p));
  const smileGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smPts), 40, 0.0032, 5, false);
  disposables.push(smileGeo);
  const smile = new THREE.Mesh(smileGeo, lineMat);
  head.add(smile);

  // dizzy stars
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? 0.012 : 0.028; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 });
  starGeo.center();
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffb000, emissiveIntensity: 0.6, roughness: 0.4 });
  disposables.push(starGeo, starMat);
  const starRing = new THREE.Group(); starRing.visible = false; root.add(starRing);
  const stars = [0, 1, 2].map(() => { const m = new THREE.Mesh(starGeo, starMat); starRing.add(m); return m; });

  // socks (L10): ears, tail, mouth
  const sockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  disposables.push(sockMat);
  const socks = {};
  const mkSock = (bone, geoS, p, rot) => { const m = new THREE.Mesh(geoS, sockMat); m.position.copy(local(bone, p)); m.rotation.set(...rot); m.visible = false; m.castShadow = true; byName[bone].add(m); return m; };
  const earSock = sockGeo(0.034, 0.15, 0.5); disposables.push(earSock);
  socks.ears = [mkSock('earL1', earSock, [0.127, 0.6, 0.26], [Math.PI, 0, 0.05]), mkSock('earR1', earSock, [-0.127, 0.6, 0.26], [Math.PI, 0, -0.05])];
  const tailSock = sockGeo(0.024, 0.11); disposables.push(tailSock);
  socks.tail = [mkSock('tail4', tailSock, [0, 0.66, -0.548], [-0.42, 0, 0])];
  const mouthSock = sockGeo(0.066, 0.13, 1.0); disposables.push(mouthSock);
  socks.mouth = [mkSock('head', mouthSock, [0, 0.69, 0.42], [Math.PI / 2 - 0.1, 0, 0])];

  const sock = (bone, p) => { const o = new THREE.Object3D(); o.position.copy(local(bone, p)); byName[bone].add(o); return o; };
  const sockets = {
    head: sock('head', [0, 0.82, 0.29]),
    mouth: sock('jaw', [0, 0.65, 0.5]),
    tail: sock('tail5', TAIL_TIP),
    back: sock('spine', [0, 0.55, -0.03]),
    body: sock('spine', [0, 0.45, -0.02]),
  };

  // ---- animation state
  const makePose = () => new Pose(BONES.map((b) => b[0]), EXT);
  const ctx = { time: 0, locoSpeed: 0, phase: 0, tmpPose: makePose() };
  const player = new ClipPlayer(CLIPS, makePose, 'idle');
  player.play('idle', { fade: 0 });
  let moveSpeed = 0, moveSetAt = -1, lookTarget = null, expr = 'dopey';
  const look = { yaw: 0, pitch: 0, w: 0 };
  const exprCur = { lidU: 0.35, lidD: 0.05, cross: 0.35, pupil: 0, smile: 0.6, tongue: 0.5, eyeScale: 0 };
  let blinkT = 2, blinkA = 0;
  const earSpr = { L: new Spring(55, 4.5), R: new Spring(55, 4.5), Lz: new Spring(70, 5), Rz: new Spring(70, 5) };
  const tongueSpr = new Spring(90, 3.5), tongueYaw = new Spring(70, 3);
  const tailYaw = new Spring(40, 6), sqSpr = new Spring(260, 14);
  const prev = { y: null, vy: 0, yaw: null, acc: 0 };
  const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), tv = new THREE.Vector3();
  const listeners = {};
  let lastClip = null, lastT = 0;
  const emit = (ev, d) => (listeners[ev] || []).forEach((f) => f(d));

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    ctx.time += dt;
    const cur = player.name;
    const explicit = moveSetAt >= 0 && ctx.time - moveSetAt < 0.6;
    const target = explicit ? moveSpeed : (LOCO_DEFAULT[cur] ?? 0);
    ctx.locoSpeed += (target - ctx.locoSpeed) * Math.min(1, dt * 8);
    const s = ctx.locoSpeed;
    const stride = lerp(0.46, 1.0, clamp((s - 0.9) / 1.6, 0, 1));
    ctx.phase = (ctx.phase + dt * Math.max(s, 0) / stride) % 1000;

    const P = player.update(dt, ctx);
    const X = P.x;
    // clip events
    const L = player.current;
    if (L) {
      if (L.name !== lastClip) { lastClip = L.name; lastT = 0; }
      const ev = L.clip.ev;
      if (ev) for (const [n, et] of Object.entries(ev)) if (lastT < et && L.t >= et) emit(n, { clip: L.name });
      lastT = L.t;
    }

    root.updateWorldMatrix(true, false);
    root.getWorldPosition(wp); root.getWorldQuaternion(wq);
    const yaw = Math.atan2(2 * (wq.w * wq.y + wq.x * wq.z), 1 - 2 * (wq.y * wq.y + wq.x * wq.x));
    let vy = 0, yawRate = 0;
    if (prev.y !== null) {
      vy = (wp.y - prev.y) / dt;
      let dy = yaw - prev.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); yawRate = dy / dt;
      if (prev.vy < -1.2 && vy > -0.3) { const imp = Math.min(4, -prev.vy); sqSpr.v -= imp * 1.4; earSpr.L.v -= imp * 3; earSpr.R.v -= imp * 3; tongueSpr.v -= imp * 4; }
    }
    const acc = (vy - prev.vy) / dt;
    prev.y = wp.y; prev.vy = vy; prev.yaw = yaw;

    const E = EXPRESSIONS[expr] || EXPRESSIONS.dopey;
    for (const k in exprCur) exprCur[k] += ((E[k] ?? 0) - exprCur[k]) * Math.min(1, dt * 8);
    blinkT -= dt;
    if (blinkT < 0) { blinkA = 1; blinkT = 1.8 + Math.random() * 3.5; }
    blinkA = Math.max(0, blinkA - dt * 6);
    const blink = X.blinkOff > 0.5 ? 0 : Math.sin(Math.min(1, blinkA) * Math.PI);

    // look-at
    let wantW = 0, wy = 0, wpch = 0;
    if (lookTarget) {
      tv.copy(lookTarget); root.worldToLocal(tv); tv.sub(REST.head);
      wy = clamp(Math.atan2(tv.x, tv.z), -1.1, 1.1); wpch = clamp(-Math.atan2(tv.y, Math.hypot(tv.x, tv.z)), -0.6, 0.6); wantW = 1;
    }
    wantW *= 1 - clamp(X.noLook, 0, 1);
    const ls = Math.min(1, dt * 5);
    look.w += (wantW - look.w) * ls; look.yaw += (wy - look.yaw) * ls; look.pitch += (wpch - look.pitch) * ls;
    P.r('neck', look.pitch * 0.35 * look.w, look.yaw * 0.4 * look.w);
    P.r('head', look.pitch * 0.55 * look.w, look.yaw * 0.6 * look.w, -look.yaw * 0.25 * look.w);

    // floppy ears: lag the body's vertical motion and turning; earsUp lifts them out, earFlap flaps
    const flap = X.earFlap * Math.sin(ctx.time * 22);
    const drive = clamp(-acc * 0.002, -0.6, 0.6);
    for (const [k, sg] of [['L', 1], ['R', -1]]) {
      earSpr[k].step(dt, 0, drive * 40 + sg * yawRate * 2);
      earSpr[k + 'z'].step(dt, 0, -sg * yawRate * 6);
      const up = clamp(X.earsUp, -1, 2);
      P.r('ear' + k + '0', -0.15 * up + earSpr[k].x * 0.5 + 0.3 * flap, 0, sg * (0.9 * up + 0.5 * flap + earSpr[k].x * 0.35 + earSpr[k + 'z'].x * 0.3));
      P.r('ear' + k + '1', earSpr[k].x * 0.4 + 0.25 * flap, 0, sg * (0.25 * up + 0.3 * flap + earSpr[k + 'z'].x * 0.2));
    }

    // tongue: out amount + jelly wobble (panting adds a pulse)
    const tOut = clamp(exprCur.tongue + X.tongue, 0, 1.8);
    tongueSpr.step(dt, 0, -acc * 0.06 + X.pant * 18 * Math.sin(ctx.time * TAU * 3.2) + 6 * Math.sin(ctx.time * 7.1));
    tongueYaw.step(dt, 0, -yawRate * 8 + 5 * Math.sin(ctx.time * 5.3));
    const ts = tOut < 0.05 ? 0.001 : 0.3 + 0.7 * Math.min(1, tOut) + 0.25 * Math.max(0, tOut - 1);
    P.s('tongue0', ts - 1, ts - 1, ts - 1);
    P.r('tongue0', 0.15 * (tOut - 0.5) + tongueSpr.x * 0.08, tongueYaw.x * 0.06);
    P.r('tongue1', tongueSpr.x * 0.18, tongueYaw.x * 0.12, tongueYaw.x * 0.1);
    P.r('tongue2', tongueSpr.x * 0.25, tongueYaw.x * 0.15);

    // tail wag + lag
    tailYaw.step(dt, clamp(-yawRate * 0.15, -0.6, 0.6));
    const wag = clamp(X.wag, 0, 2) * 0.5;
    for (let i = 0; i < TAIL_N; i++) P.r('tail' + i, 0.04 * wag * Math.sin(ctx.time * 30 - i * 0.6), tailYaw.x * (0.15 + i * 0.12) + wag * (0.22 + i * 0.13) * Math.sin(ctx.time * 15 - i * 0.6));

    sqSpr.step(dt);
    const sy = clamp(1 + X.sqY + sqSpr.x * 0.06, 0.12, 1.6);
    const sxz = 1 + (1 / Math.sqrt(sy) - 1) * 0.4 + X.sqX;
    squash.scale.set(sxz, sy, sxz);
    squash.position.set(0, Math.max(-0.45, X.rootY), X.rootZ);
    spin.rotation.set(X.rotX, 0, X.rotZ);

    applyPose(P, bones, rest);
    byName.jaw.quaternion.setFromAxisAngle(XAXIS, clamp(X.mouth + exprCur.smile * 0.1, 0, 1.3) * 0.38);

    // face
    const lidU = clamp(exprCur.lidU + X.lidU + blink * 1.6, -0.4, 1.0), lidD = clamp(exprCur.lidD + X.lidD + blink * 0.2, 0, 1);
    const cross = clamp(exprCur.cross + X.cross, 0, 1.6), eyeS = 1 + exprCur.eyeScale + X.eyeScale;
    const lyaw = clamp(look.yaw * look.w * 0.6, -0.5, 0.5), lp = look.pitch * look.w * 0.5 + 0.1;
    const dz = clamp(X.dizzy, 0, 1);
    for (const e of eyes) {
      e.g.scale.copy(e.base).multiplyScalar(eyeS);
      e.lid.rotation.x = lerp(-0.9, 1.55, lidU);
      e.low.rotation.x = lerp(1.2, -0.9, lidD);
      e.ball.rotation.set(lp, lyaw - e.s * cross * 0.42, 0);
      if (dz > 0) { const a = ctx.time * 9 * e.s; e.ball.rotation.x += Math.sin(a) * 0.5 * dz; e.ball.rotation.y += Math.cos(a) * 0.5 * dz; }
    }
    eyeMat.userData.u.uPupil.value = exprCur.pupil + X.pupil;
    const st = clamp(X.stars, 0, 1);
    starRing.visible = st > 0.02;
    if (starRing.visible) {
      head.updateWorldMatrix(true, false);
      tv.set(0, 0.14, 0).applyMatrix4(head.matrixWorld); root.worldToLocal(tv);
      starRing.position.copy(tv); starRing.scale.setScalar(st);
      for (let i = 0; i < 3; i++) { const a = ctx.time * 5 + i * TAU / 3; stars[i].position.set(Math.cos(a) * 0.13, 0.012 * Math.sin(a * 2), Math.sin(a) * 0.11); stars[i].rotation.set(0, -a, ctx.time * 4); }
    }
  }
  const XAXIS = new THREE.Vector3(1, 0, 0);

  const api = {
    root, mesh, bones: byName, update, sockets,
    height: 0.82, radius: 0.25,
    anims: Object.keys(CLIPS).filter((n) => !n.endsWith('_hold')),
    play: (name, opts) => player.play(name, opts),
    setMove(speed) {
      moveSpeed = Math.max(0, speed || 0); moveSetAt = ctx.time;
      const L = player.current;
      if (L && !LOCO_DEFAULT.hasOwnProperty(L.name) && !(MOVE_OK.has(L.name) && moveSpeed > 0.05) && (L.loop || L.done)) player.play('idle', { fade: 0.2 });
    },
    lookAt(v) { lookTarget = v ? (lookTarget || new THREE.Vector3()).copy(v) : null; },
    setExpression(n) { if (EXPRESSIONS[n]) expr = n; },
    get expression() { return expr; },
    // setSocks(true|false) or setSocks({ears, tail, mouth}) — only the given parts change
    setSocks(v) {
      const o = typeof v === 'object' && v ? v : { ears: !!v, tail: !!v, mouth: !!v };
      for (const k of ['ears', 'tail', 'mouth']) if (k in o) for (const m of socks[k]) m.visible = !!o[k];
      const muffled = socks.mouth[0].visible;
      cavity.visible = !muffled;
      if (muffled) exprCur.tongue = 0;
      api.socks = { ears: socks.ears[0].visible, tail: socks.tail[0].visible, mouth: muffled };
    },
    socks: { ears: false, tail: false, mouth: false },
    get clip() { return player.name; },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => api.off(ev, fn); },
    off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    get tris() { return geo.index.count / 3; },
    dispose() { root.removeFromParent(); for (const d of disposables) d.dispose?.(); },
  };
  // a muffled mouth keeps the tongue in
  const baseExprTongue = () => (api.socks.mouth ? 0 : null);
  const _upd = update;
  api.update = (dt) => { _upd(dt); if (baseExprTongue() === 0) byName.tongue0.scale.setScalar(0.001); };
  api.update(0.016);
  return api;
}
