// Motion layer: flying traffic, searchlights, blinking beacons, steam, sparks, yard robots and the dropship.
import * as THREE from 'three';
import { glowTex, beamTex, smokeTex, holoTex } from './textures.js';
import { PLAT, LAYOUT } from './compound.js';
import { Kit } from './kit.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// point sprites with per-point color, size and blink phase; one draw call
export function blinkPoints(points, { size = 3, colors, rate = 1.2, duty = 0.5, base = 0.15, add = true }) {
  const n = points.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n);
  points.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); const c = new THREE.Color(colors[i % colors.length]); col.set([c.r, c.g, c.b], i * 3); ph[i] = Math.random(); sz[i] = size * (p.s || 1); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('psize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: glowTex() }, uRate: { value: rate }, uDuty: { value: duty }, uBase: { value: base }, uScale: { value: 400 } },
    vertexShader: `attribute vec3 color; attribute float phase; attribute float psize; uniform float uTime, uRate, uDuty, uBase, uScale; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        float f = fract(uTime * uRate + phase); vA = mix(uBase, 1.0, step(f, uDuty) * (1.0 - f / max(uDuty, 0.001) * 0.5));
        vC = color; gl_PointSize = psize * uScale / -mv.z; }`,
    fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).r; gl_FragColor = vec4(vC * a * vA * 3.0, a * vA); }`,
    transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return pts;
}

function makeCarGeo() {
  // body + glowing tail: built once, instanced
  const body = new THREE.BoxGeometry(1.6, 0.5, 3.2);
  return body;
}

export function createAmbient(scene, compound, opts) {
  const { stage, quality = 'high' } = opts;
  const r = rng(99);
  const group = new THREE.Group(); scene.add(group);
  const updaters = [];
  const q = quality === 'low' ? 0.5 : 1;

  // --- beacons (feature towers + platform corners)
  const bpts = [...compound.fx.beacons];
  for (const [x, z] of [[PLAT.x0 + 0.6, PLAT.z0 + 0.6], [PLAT.x1 - 0.6, PLAT.z0 + 0.6], [PLAT.x0 + 0.6, PLAT.z1 - 0.6], [PLAT.x1 - 0.6, PLAT.z1 - 0.6]]) bpts.push(new THREE.Vector3(x, 1.4, z));
  const beacons = blinkPoints(bpts, { size: 0.9, colors: [0xff3040, 0xff3040, 0xffb040], rate: 0.55, duty: 0.3, base: 0.08 });
  group.add(beacons);

  // --- festoon string lights (warm bulbs sagging between poles) + fire barrels: the scrapyard's lived-in glow
  const bulbs = [];
  for (const [p0, p1, sag] of compound.fx.festoons || []) {
    const n = Math.max(4, Math.round(p0.distanceTo(p1) / 1.3));
    for (let i = 0; i <= n; i++) { const f = i / n, p = p0.clone().lerp(p1, f); p.y -= Math.sin(f * Math.PI) * sag; p.s = 1; bulbs.push(p); }
  }
  for (const f of compound.fx.fires || []) for (let i = 0; i < 3; i++) { const p = f.clone(); p.y += 0.3 + i * 0.35; p.s = 2.6 - i * 0.6; bulbs.push(p); }
  const festoon = bulbs.length ? blinkPoints(bulbs, { size: 0.55, colors: [0xffc070, 0xffd890, 0xffa850, 0xff9040], rate: 2.3, duty: 0.92, base: 0.75 }) : null;
  if (festoon) group.add(festoon);

  // --- light pools: soft additive glows on the deck under lamps / in front of buildings (fake local lights)
  const pools = compound.fx.pools;
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, pools.length);
  pools.forEach((p, i) => {
    poolMesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.06, p.z), new THREE.Quaternion(), new THREE.Vector3(p.r * 2, 1, p.r * 2)));
    poolMesh.setColorAt(i, new THREE.Color(p.c).multiplyScalar(p.a * 0.5));
  });
  poolMesh.renderOrder = 1;
  group.add(poolMesh);

  // --- skyline aviation lights + window twinkle (static-ish points)
  const sky = [];
  for (let i = 0; i < 160 * q; i++) { const a = -Math.PI * 0.95 + r() * Math.PI * 0.9, d = 110 + r() * 240; const p = new THREE.Vector3(Math.cos(a) * d * 0.9, 20 + r() * 220, Math.sin(a) * d - 40); p.s = 0.6 + r() * 1.2; sky.push(p); }
  const skyPts = blinkPoints(sky, { size: 2, colors: [0xff3050, 0x60e0ff, 0xffffff, 0xff60e0], rate: 0.3, duty: 0.6, base: 0.25 });
  group.add(skyPts);

  // --- flying traffic: instanced bodies + head/tail light streaks along curved lanes
  // skyway lanes: dense streams on a few fixed paths (paired, opposite directions) so they read as traffic lanes,
  // plus a few loose loops further out
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const skyways = [
    { a: V3(-320, 36, -118), b: V3(320, 36, -118), n: 16, speed: 22 }, { a: V3(320, 31, -110), b: V3(-320, 31, -110), n: 14, speed: 19 },
    { a: V3(-260, 62, -380), b: V3(240, 50, 140), n: 14, speed: 26 }, { a: V3(250, 56, 140), b: V3(-250, 68, -380), n: 12, speed: 24 },
    { a: V3(-320, 18, -200), b: V3(320, 22, -200), n: 10, speed: 16 },
  ];
  const lanes = [];
  for (const w of skyways) for (let j = 0; j < Math.round(w.n * q); j++) lanes.push({ type: 'way', w, ph: (j + r() * 0.4) / w.n, len: w.a.distanceTo(w.b), dir: w.b.clone().sub(w.a).normalize() });
  for (let i = 0; i < 10 * q; i++) lanes.push({ type: 'loop', rx: 120 + r() * 120, rz: 140 + r() * 140, cz: -60 + r() * 40, y: 25 + r() * 55, speed: (0.03 + r() * 0.04) * (r() < 0.5 ? 1 : -1), ph: r() * Math.PI * 2 });
  const N = lanes.length;
  const carMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.8, roughness: 0.3 });
  const cars = new THREE.InstancedMesh(makeCarGeo(), carMat, N);
  const lightGeo = new THREE.PlaneGeometry(1, 1);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex(), vertexColors: false });
  const trails = new THREE.InstancedMesh(lightGeo, headMat, N * 2);
  trails.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 2 * 3), 3);
  const tailCols = [new THREE.Color(3, 0.4, 0.6), new THREE.Color(2.5, 1.2, 0.3), new THREE.Color(0.4, 2.2, 3)];
  const headCol = new THREE.Color(3, 3, 3.2);
  cars.frustumCulled = trails.frustumCulled = false;
  group.add(cars, trails);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), camQ = new THREE.Quaternion();
  updaters.push((t, dt, camera) => {
    camera.getWorldQuaternion(camQ);
    for (let i = 0; i < N; i++) {
      const L = lanes[i];
      if (L.type === 'loop') {
        const a = L.ph + t * L.speed;
        pp.set(Math.cos(a) * L.rx, L.y + Math.sin(a * 3) * 2, L.cz + Math.sin(a) * L.rz);
        fwd.set(-Math.sin(a) * L.rx, 0, Math.cos(a) * L.rz).multiplyScalar(Math.sign(L.speed)).normalize();
      } else {
        const f = ((L.ph + t * L.w.speed / L.len) % 1 + 1) % 1;
        pp.copy(L.w.a).lerp(L.w.b, f); pp.y += Math.sin(f * 40 + L.ph * 9) * 0.4; fwd.copy(L.dir);
      }
      qq.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
      m4.compose(pp, qq, ss.set(1, 1, 1)); cars.setMatrixAt(i, m4);
      // head light (front) + tail streak (back), camera-facing quads
      const hp = pp.clone().addScaledVector(fwd, 1.8), tp = pp.clone().addScaledVector(fwd, -2.6);
      m4.compose(hp, camQ, ss.set(1.4, 1.4, 1)); trails.setMatrixAt(i * 2, m4); trails.setColorAt(i * 2, headCol);
      m4.compose(tp, camQ, ss.set(2.2, 2.2, 1)); trails.setMatrixAt(i * 2 + 1, m4); trails.setColorAt(i * 2 + 1, L.type === 'way' ? tailCols[i % 4 ? 0 : 2] : tailCols[i % 3]);
    }
    cars.instanceMatrix.needsUpdate = true; trails.instanceMatrix.needsUpdate = true; trails.instanceColor.needsUpdate = true;
    void yAxis;
  });

  // --- searchlights: additive cones sweeping the sky
  const coneGeo = new THREE.CylinderGeometry(0.4, 9, 120, 16, 1, true);
  coneGeo.translate(0, 60, 0);
  // cylinder uv.y: 0 bottom .. 1 top; beamTex is bright at v=1 so flip so the source is bright
  const uv = coneGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  // all cones in one instanced draw (per-instance colour); each keeps its own sweep
  const SL = compound.fx.searchlights;
  const coneMat = new THREE.MeshBasicMaterial({ map: beamTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, SL.length);
  cones.userData.noReflect = true; cones.frustumCulled = false;
  group.add(cones);
  const lights = SL.map((p, i) => {
    cones.setColorAt(i, new THREE.Color(i % 2 ? 0x60b0ff : 0xb070ff).multiplyScalar(0.7));
    const pivot = new THREE.Object3D(); pivot.position.copy(p).add(new THREE.Vector3(0, 2, 0));
    return { pivot, ph: i * 2.1, sp: 0.18 + i * 0.05 };
  });
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
  updaters.push((t) => {
    lights.forEach((l, i) => {
      l.pivot.rotation.set(-0.5 - Math.sin(t * l.sp * 1.3 + l.ph) * 0.2, t * l.sp + l.ph, 0, 'YXZ');
      l.pivot.updateMatrix(); cones.setMatrixAt(i, l.pivot.matrix);
    });
    cones.instanceMatrix.needsUpdate = true;
  });

  // --- steam from vents: soft sprites rising and fading
  const vents = compound.fx.vents;
  const PER = quality === 'low' ? 3 : 6, SN = vents.length * PER;
  const sPos = new Float32Array(SN * 3), sAge = new Float32Array(SN), sSeed = new Float32Array(SN);
  for (let i = 0; i < SN; i++) { const v = vents[i / PER | 0]; sPos.set([v.x, v.y, v.z], i * 3); sAge[i] = (i % PER) / PER; sSeed[i] = r(); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sg.setAttribute('age', new THREE.BufferAttribute(sAge, 1));
  sg.setAttribute('seed', new THREE.BufferAttribute(sSeed, 1));
  const steamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: smokeTex() }, uScale: { value: 400 } },
    vertexShader: `attribute float age; attribute float seed; uniform float uTime, uScale; varying float vA;
      void main(){ float a = fract(age + uTime * (0.12 + seed * 0.06)); vec3 p = position + vec3(sin(seed*20.0 + a*3.0)*0.8 + a*2.0, a * 7.0, cos(seed*13.0)*0.6);
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv; vA = smoothstep(0.0,0.15,a) * (1.0 - a);
        gl_PointSize = (1.2 + a * 4.5) * uScale / -mv.z; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).r * vA * 0.35; gl_FragColor = vec4(vec3(0.5,0.6,0.85) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const steam = new THREE.Points(sg, steamMat); steam.frustumCulled = false; group.add(steam);

  // --- welding sparks at the workshop door
  const emitters = compound.fx.sparks.length ? compound.fx.sparks : [new THREE.Vector3(0, -50, 0)];
  const PERS = 28, spN = emitters.length * PERS;
  const spg = new THREE.BufferGeometry();
  const spPos = new Float32Array(spN * 3), spSeed = new Float32Array(spN), spEm = new Float32Array(spN);
  for (let i = 0; i < spN; i++) { const e = emitters[i / PERS | 0]; spPos.set([e.x, e.y, e.z], i * 3); spSeed[i] = r(); spEm[i] = (i / PERS | 0) * 0.37; }
  spg.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spg.setAttribute('seed', new THREE.BufferAttribute(spSeed, 1)); spg.setAttribute('em', new THREE.BufferAttribute(spEm, 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: `attribute float seed; attribute float em; uniform float uTime, uScale; varying float vA;
      void main(){ float tt = uTime * 1.1 + em * 2.3; float burst = floor(tt); float a = fract(tt); float h = fract(sin(seed*91.3 + burst*7.1)*4375.5);
        vec3 v = vec3(cos(seed*40.0 + burst)*1.8, 1.0 + h*3.0, sin(seed*40.0 + burst)*1.8); vec3 p = position + v * a + vec3(0.0, -9.0 * a * a, 0.0);
        vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv; vA = step(a, 0.6) * (1.0 - a / 0.6) * step(0.35, fract(sin(burst * 12.9 + em * 7.0) * 437.5));
        gl_PointSize = 1.4 * uScale / -mv.z; }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)) * vA; gl_FragColor = vec4(vec3(3.0,2.0,0.8) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(spg, sparkMat); sparks.frustumCulled = false; group.add(sparks);

  // --- free-standing neon signs (some flicker like a failing tube)
  const signs = (compound.fx.signs || []).map((sg, i) => {
    const ti = holoTex(sg.text, sg.color, { w: 512, h: 128, frame: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.h * ti.aspect, sg.h), new THREE.MeshBasicMaterial({ map: ti.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(sg.color).multiplyScalar(1.8), side: THREE.DoubleSide }));
    m.position.set(sg.x, sg.y, sg.z); m.rotation.y = sg.ry || 0; m.userData.noReflect = true; group.add(m);
    return { m, flicker: sg.flicker, ph: i * 3.1 };
  });
  updaters.push((t) => { for (const s of signs) if (s.flicker) { const u = (t + s.ph) % 7; s.m.material.opacity = (u > 5.2 && u < 5.9 && Math.sin(t * 70) > -0.2) || (u > 6.4 && u < 6.5) ? 0.12 : 1; } });

  // --- yard robots: all bodies in one instanced mesh (+ one for visor lights); some haul crates
  const paths = [
    [[-9, -30], [-9, 14], [3, 14]],
    [[9, -30], [9, 12]],
    [[-27, -6], [-27, 26], [-12, 40]],
    [[13, 40], [27, 38], [28, 22]],
    [[-6, -32], [6, -32], [6, -34]],
  ].slice(0, [3, 4, 5, 5][stage]);
  const PARTS = [[1.4, 1.1, 1.0, 0, 2.2, 0], [0.7, 0.45, 0.6, 0, 3.0, 0.15], [0.35, 1.7, 0.4, 0, -0.85, 0], [0.35, 1.7, 0.4, 0, -0.85, 0], [0.3, 1.3, 0.35, 0, -0.6, 0], [0.3, 1.3, 0.35, 0, -0.6, 0], [1.3, 1.0, 1.1, 0, 2.4, 1.1]];
  const NB = paths.length * PARTS.length;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa8b2c4, metalness: 0.7, roughness: 0.38, envMap: compound.env });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, NB);
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3).fill(1), 3);
  const eyes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }), paths.length);
  bodies.frustumCulled = eyes.frustumCulled = false;
  group.add(bodies, eyes);
  const crateCol = new THREE.Color(0x9a6a4a), tint = [new THREE.Color(0xc8d2e4), new THREE.Color(0xd9a300), new THREE.Color(0x8a96aa)];
  const robots = paths.map((path, i) => {
    const root = new THREE.Object3D(), parts = [];
    const legs = [-0.45, 0.45].map((x) => { const l = new THREE.Object3D(); l.position.set(x, 1.7, 0); root.add(l); return l; });
    const arms = [-0.9, 0.9].map((x) => { const l = new THREE.Object3D(); l.position.set(x, 2.6, 0); root.add(l); return l; });
    const parents = [root, root, legs[0], legs[1], arms[0], arms[1], root];
    PARTS.forEach(([w, h, d, x, y, z], j) => { const o = new THREE.Object3D(); o.scale.set(w, h, d); o.position.set(x, y, z); parents[j].add(o); parts.push(o); });
    const carry = i % 2 === 1;
    PARTS.forEach((_, j) => bodies.setColorAt(i * PARTS.length + j, j === 6 ? crateCol : tint[i % 3]));
    if (!carry) parts[6].scale.setScalar(0.001);
    eyes.setColorAt(i, new THREE.Color(i % 2 ? 0xff8a2a : 0x38e8ff).multiplyScalar(3));
    const eye = new THREE.Object3D(); eye.position.set(0, 3.02, 0.47); root.add(eye);
    const sc = 1 + (i % 3) * 0.12; root.scale.setScalar(sc);
    // ping-pong along the path at constant speed
    const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const loop = pts.concat(pts.slice(1, -1).reverse());
    const segs = loop.map((p, j) => p.distanceTo(loop[(j + 1) % loop.length]));
    const total = segs.reduce((a, b) => a + b, 0);
    return { root, legs, arms, parts, eye, carry, loop, segs, total, speed: 1.5 + (i % 3) * 0.25, off: i * 9 };
  });
  bodies.instanceColor.needsUpdate = true; eyes.instanceColor.needsUpdate = true;
  updaters.push((t) => {
    robots.forEach((R, i) => {
      let d = (t * R.speed + R.off) % R.total, j = 0;
      while (d > R.segs[j]) { d -= R.segs[j]; j++; }
      const a = R.loop[j], b = R.loop[(j + 1) % R.loop.length], f = d / R.segs[j];
      R.root.position.lerpVectors(a, b, f);
      const targetYaw = Math.atan2(b.x - a.x, b.z - a.z);
      let dy = targetYaw - R.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      R.root.rotation.y += dy * 0.1;
      const ph = t * R.speed * 3.2;
      R.legs[0].rotation.x = Math.sin(ph) * 0.5; R.legs[1].rotation.x = -Math.sin(ph) * 0.5;
      if (R.carry) { R.arms[0].rotation.x = R.arms[1].rotation.x = -1.2; }
      else { R.arms[0].rotation.x = -Math.sin(ph) * 0.35; R.arms[1].rotation.x = Math.sin(ph) * 0.35; }
      R.root.position.y = Math.abs(Math.cos(ph)) * 0.12;
      R.root.updateMatrixWorld(true);
      R.parts.forEach((p, k) => bodies.setMatrixAt(i * R.parts.length + k, p.matrixWorld));
      eyes.setMatrixAt(i, R.eye.matrixWorld);
    });
    bodies.instanceMatrix.needsUpdate = true; eyes.instanceMatrix.needsUpdate = true;
  });

  // --- dropships: arrive, land on a pad, idle, lift off. Stage 3 adds the white-and-gold VIP shuttle on its own pad.
  const ships = [];
  function makeShip(vip) {
    const ship = new THREE.Group();
    const sk = new Kit();
    if (!vip) {
      sk.box('navy', 4, 1.6, 9, 0, -0.8, 0); sk.boxR('navy', 3, 1.2, 2.5, 0, 0.2, 5.2, 0.25, 0, 0); sk.box('steel', 11, 0.3, 3, 0, 0.05, -1.5);
      sk.boxR('cyan', 2.2, 0.4, 1.4, 0, 0.8, 4.6, 0.25, 0, 0); sk.box('steel', 0.3, 1.6, 2.4, 0, 0.8, -3.6);
      for (const x of [-4.5, 4.5]) { sk.cyl('dark', 0.9, 0.9, 0.5, x, -0.35, -1.5, 12); sk.cyl('cyan', 0.75, 0.75, 0.04, x, -0.4, -1.5, 12); }
      sk.box('red', 0.3, 0.3, 0.3, -5.5, 0.15, -1.5); sk.box('green', 0.3, 0.3, 0.3, 5.5, 0.15, -1.5); sk.box('orange', 3, 0.1, 0.1, 0, 0.82, -4.4);
    } else {
      // executive shuttle: long white nose, swept wings, gold trim, warm cabin windows
      sk.box('white_p', 3.2, 1.5, 8, 0, -0.7, 0); sk.boxR('white_p', 2.4, 1.1, 3.4, 0, -0.4, 5.2, 0.12, 0, 0); sk.boxR('glass', 1.9, 0.5, 1.6, 0, 0.55, 3.6, 0.3, 0, 0);
      for (const sx of [-1, 1]) { sk.boxR('white_p', 4.6, 0.22, 2.6, sx * 3.4, -0.45, -1.8, 0, sx * 0.35, 0); sk.box('amber', 0.2, 0.24, 2.4, sx * 5.6, -0.45, -2.6); sk.cyl('dark', 0.7, 0.7, 0.4, sx * 2.2, -0.9, -3.2, 12); sk.cyl('amber', 0.55, 0.55, 0.04, sx * 2.2, -0.95, -3.2, 12); }
      sk.box('amber', 3.24, 0.14, 6, 0, 0.3, -0.4); sk.panel('win', 4.2, 0.45, 1.62, -0.35, -0.6, Math.PI / 2, 0.7); sk.panel('win', 4.2, 0.45, -1.62, -0.35, -0.6, -Math.PI / 2, 0.7);
      sk.boxR('white_p', 0.25, 1.6, 1.8, 0, 0.6, -3.6, -0.3, 0, 0); sk.box('red', 0.25, 0.25, 0.25, -5.8, -0.35, -2.6); sk.box('green', 0.25, 0.25, 0.25, 5.8, -0.35, -2.6);
    }
    const hull = sk.build(opts.mats || {}); hull.traverse((o) => { o.userData.noReflect = true; }); ship.add(hull);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 5, 1, 16, 1, true), new THREE.MeshBasicMaterial({ map: beamTex(), color: new THREE.Color(vip ? 0xffc860 : 0x60c8ff).multiplyScalar(0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.userData.noReflect = true;
    ship.add(beam);
    ship.scale.setScalar(vip ? 0.8 : 0.85);
    group.add(ship);
    return { ship, beam, k: vip ? 0.8 : 0.85 };
  }
  function flyCycle(S, t, pads, CYCLE, from, to, dwell = 0.22) {
    const cyc = Math.floor(t / CYCLE), u = (t % CYCLE) / CYCLE;
    const pad = pads[cyc % pads.length];
    const a = 0.28, b = a + 0.12, c = b + dwell, d = c + 0.12;
    let pos, hover = 0;
    if (u < a) { const f = u / a, e = 1 - Math.pow(1 - f, 3); pos = from.clone().lerp(pad.clone().add(new THREE.Vector3(0, 14, 0)), e); }
    else if (u < b) { const f = (u - a) / 0.12, e = f * f * (3 - 2 * f); pos = pad.clone().add(new THREE.Vector3(0, 14 - e * 12.6, 0)); hover = 1; }
    else if (u < c) { pos = pad.clone().add(new THREE.Vector3(0, 1.4, 0)); hover = 0.4; }
    else if (u < d) { const f = (u - c) / 0.12, e = f * f; pos = pad.clone().add(new THREE.Vector3(0, 1.4 + e * 14, 0)); hover = 1; }
    else { const f = (u - d) / (1 - d), e = f * f; pos = pad.clone().add(new THREE.Vector3(0, 15.4, 0)).lerp(to, e); }
    const { ship, beam } = S;
    const prev = ship.position.clone();
    ship.position.copy(pos);
    const vel = pos.clone().sub(prev);
    if (vel.lengthSq() > 0.0004 && hover < 0.5) ship.rotation.y = Math.atan2(vel.x, vel.z);
    ship.rotation.z = Math.sin(t * 1.3) * 0.03;
    const h = ship.position.y - pad.y;
    beam.visible = hover > 0.3 && h > 1.6;
    beam.scale.set(1, Math.max(0.1, h - 0.5), 1); beam.position.y = -(h - 0.5) / 2 / S.k;
  }
  const pads = compound.fx.pads;
  const ship1 = makeShip(false);
  updaters.push((t) => flyCycle(ship1, t, pads, 36, new THREE.Vector3(-160, 70, -160), new THREE.Vector3(170, 80, -60)));
  if (compound.fx.vipPad) {
    const ship2 = makeShip(true), vp = [compound.fx.vipPad];
    updaters.push((t) => flyCycle(ship2, t + 17, vp, 48, new THREE.Vector3(-200, 60, 120), new THREE.Vector3(-150, 90, -220), 0.34));
  }
  void ships;

  return {
    group, noReflect: [bodies, eyes, poolMesh, steam, sparks],
    update(t, dt, camera, pxScale) {
      for (const m of [beacons.material, skyPts.material, steamMat, sparkMat, festoon?.material].filter(Boolean)) { m.uniforms.uTime.value = t; m.uniforms.uScale.value = pxScale; }
      for (const u of updaters) u(t, dt, camera);
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose(); if (!o.userData.matKey) o.material?.dispose?.(); }); scene.remove(group); },
  };
}
void LAYOUT;
