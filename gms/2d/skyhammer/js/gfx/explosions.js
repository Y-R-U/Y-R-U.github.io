// EXPLOSIONS. The thing Aaron singled out, so this is the most-worked file in js/gfx.
//
// Every explosion is the same recipe scaled continuously from a rifle-round pop to a screen-filling
// nuke: a white-hot core, additive fire, embers under gravity, a smoke column that shears backwards,
// an expanding shockwave ring, a REAL PointLight that lights the terrain and the aeroplane, and a
// scorch on the ground. Above `NUKE_R` it grows a mushroom silhouette and whites the screen out.
//
// Nothing is allocated after boot: one particle array, two instanced meshes, four pooled lights.

import * as THREE from 'three';
import { getPlate } from './plates.js';
import { MAT, makeTex, makeBin } from './materials.js';
import { mix } from './palette.js';

const CAP = 2200;
const RINGS = 20;
const LIGHTS = 4;
const DECALS = 40;
export const NUKE_R = 520;

const FIRE = 0, SMOKE = 1, EMBER = 2;

const SMOKE_VERT = `
attribute float aAlpha; attribute vec3 aCol;
varying float vA; varying vec3 vC; varying vec2 vUv;
void main() {
  vA = aAlpha; vC = aCol; vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const SMOKE_FRAG = `
uniform sampler2D map;
varying float vA; varying vec3 vC; varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vC, t.a * vA);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}
`;

export function makeExplosions(camApi, scene) {
  const bin = makeBin();
  const root = new THREE.Group();
  scene.add(root);

  const quad = new THREE.PlaneGeometry(1, 1);

  // ---- fire + embers: additive, colour carries the alpha (premultiplied), so instanceColor is enough
  const fireMat = MAT.additive(null, { depthTest: true });
  const fire = new THREE.InstancedMesh(quad, fireMat, CAP);
  fire.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fire.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  fire.frustumCulled = false;
  fire.renderOrder = 30;
  fire.count = 0;
  root.add(fire);

  // ---- smoke: real alpha, so it needs its own tiny shader
  const smokeGeo = new THREE.InstancedBufferGeometry().copy(quad);
  const sAlpha = new Float32Array(CAP);
  const sCol = new Float32Array(CAP * 3);
  smokeGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(sAlpha, 1));
  smokeGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(sCol, 3));
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null } },
    vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
    transparent: true, depthWrite: false, fog: false,
  });
  const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, CAP);
  smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  smoke.frustumCulled = false;
  smoke.renderOrder = 25;
  smoke.count = 0;
  root.add(smoke);

  // ---- shockwave rings
  const ringMat = MAT.additive(null, { depthTest: false });
  const rings = new THREE.InstancedMesh(quad, ringMat, RINGS);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 3), 3);
  rings.frustumCulled = false;
  rings.renderOrder = 31;
  rings.count = 0;
  root.add(rings);

  // ---- scorch decals, laid on the ground face
  const decalMat = MAT.alpha(null, { color: 0x000000, opacity: 0.55, depthTest: true });
  const decals = new THREE.InstancedMesh(quad, decalMat, DECALS);
  decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  decals.frustumCulled = false;
  decals.renderOrder = 3;
  decals.count = 0;
  root.add(decals);

  // ---- flash lights. Kept in the scene at zero intensity so no shader ever recompiles.
  const lights = [];
  for (let i = 0; i < LIGHTS; i++) {
    const L = new THREE.PointLight(0xffbb66, 0, 2600, 1.6);
    L.userData = { t: 0, dur: 0, peak: 0 };
    scene.add(L);
    lights.push(L);
  }

  // ---- nuke white-out, a camera-locked quad
  const whiteMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false,
  });
  const white = new THREE.Mesh(quad, whiteMat);
  white.frustumCulled = false;
  white.renderOrder = 4000;
  white.visible = false;

  // ---- particle arrays
  const px = new Float32Array(CAP), py = new Float32Array(CAP), pz = new Float32Array(CAP);
  const vx = new Float32Array(CAP), vy = new Float32Array(CAP), vz = new Float32Array(CAP);
  const life = new Float32Array(CAP), maxL = new Float32Array(CAP);
  const s0 = new Float32Array(CAP), s1 = new Float32Array(CAP);
  const cr = new Float32Array(CAP), cg = new Float32Array(CAP), cb = new Float32Array(CAP);
  const a0 = new Float32Array(CAP), rot = new Float32Array(CAP), spin = new Float32Array(CAP);
  const drag = new Float32Array(CAP), grav = new Float32Array(CAP), kindA = new Uint8Array(CAP);
  let head = 0, alive = 0;

  const ringA = { x: new Float32Array(RINGS), y: new Float32Array(RINGS), t: new Float32Array(RINGS), d: new Float32Array(RINGS), r0: new Float32Array(RINGS), r1: new Float32Array(RINGS), on: new Uint8Array(RINGS) };
  const decA = { x: new Float32Array(DECALS), y: new Float32Array(DECALS), r: new Float32Array(DECALS), t: new Float32Array(DECALS), on: new Uint8Array(DECALS) };
  let decHead = 0;

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const E = new THREE.Euler(), C = new THREE.Color();

  let pal = null, whiteT = 0, whiteDur = 0, shakeOut = 0, reduce = false;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function emit(k, x, y, z, ux, uy, ttl, size0, size1, col, alpha, dg, gv, sp) {
    const i = head; head = (head + 1) % CAP;
    kindA[i] = k;
    px[i] = x; py[i] = y; pz[i] = z;
    vx[i] = ux; vy[i] = uy; vz[i] = 0;
    life[i] = maxL[i] = ttl;
    s0[i] = size0; s1[i] = size1;
    cr[i] = col.r; cg[i] = col.g; cb[i] = col.b;
    a0[i] = alpha; drag[i] = dg; grav[i] = gv;
    rot[i] = Math.random() * 6.283; spin[i] = sp;
    if (alive < CAP) alive++;
  }

  function light(x, y, peak, dur, colHex) {
    let best = lights[0], bt = 1e9;
    for (const L of lights) {
      const rem = L.userData.dur - L.userData.t;
      if (L.intensity <= 0.001) { best = L; bt = -1; break; }
      if (rem < bt) { bt = rem; best = L; }
    }
    best.position.set(x, y, 240);
    best.color.set(colHex);
    best.userData.t = 0; best.userData.dur = dur; best.userData.peak = peak;
    best.intensity = peak;
  }

  function ring(x, y, r0, r1, dur, colHex) {
    let i = 0, worst = 1e9;
    for (let j = 0; j < RINGS; j++) {
      if (!ringA.on[j]) { i = j; worst = -1; break; }
      const rem = ringA.d[j] - ringA.t[j];
      if (rem < worst) { worst = rem; i = j; }
    }
    ringA.x[i] = x; ringA.y[i] = y; ringA.t[i] = 0; ringA.d[i] = dur;
    ringA.r0[i] = r0; ringA.r1[i] = r1; ringA.on[i] = 1;
    C.set(colHex);
    C.toArray(rings.instanceColor.array, i * 3);
  }

  function scorch(x, y, r) {
    const i = decHead; decHead = (decHead + 1) % DECALS;
    decA.x[i] = x; decA.y[i] = y; decA.r[i] = r; decA.t[i] = 0; decA.on[i] = 1;
  }

  const cHot = new THREE.Color(), cFire = new THREE.Color(), cEmb = new THREE.Color(), cSmoke = new THREE.Color();

  /**
   * The one entry point. `r` is the blast radius in world units; everything scales off it.
   * opts: { nuke, ground (y of the surface), kind, dirX }
   */
  function boom(x, y, r, opts = {}) {
    if (!pal) return;
    const nuke = opts.nuke || r >= NUKE_R;
    const R = Math.max(12, r);
    const q = reduce ? 0.5 : 1;

    // white-hot core
    emit(FIRE, x, y, 6, 0, 0, 0.20 + R * 0.0005, R * 1.9, R * 0.6, cHot, 2.6, 3.0, 0, 0);

    // fireball
    const nF = Math.round(Math.min(96, 14 + R * 0.16) * q);
    for (let i = 0; i < nF; i++) {
      const a = Math.random() * 6.283, sp = rnd(0.35, 1) * R * (nuke ? 1.1 : 2.4);
      const c = cFire.clone().lerp(cHot, Math.random() * 0.6);
      emit(FIRE, x + Math.cos(a) * R * 0.16, y + Math.sin(a) * R * 0.16, rnd(-40, 60),
        Math.cos(a) * sp, Math.sin(a) * sp + R * 0.4,
        rnd(0.28, 0.62) + R * (nuke ? 0.0022 : 0.0006), R * rnd(0.26, 0.55), R * rnd(0.5, 1.0),
        c, rnd(1.15, 1.9), 3.4, -120, rnd(-3, 3));
    }

    // embers under gravity
    const nE = Math.round(Math.min(46, 7 + R * 0.07) * q);
    for (let i = 0; i < nE; i++) {
      const a = rnd(-0.4, Math.PI + 0.4), sp = rnd(0.6, 1.9) * R * 2.1;
      emit(EMBER, x, y, rnd(-30, 90), Math.cos(a) * sp, Math.sin(a) * sp,
        rnd(0.7, 1.8), R * 0.055, R * 0.018, cEmb, rnd(0.8, 1.5), 0.55, -1150, 0);
    }

    // smoke column, sheared backwards by the airflow
    const nS = Math.round(Math.min(56, 7 + R * 0.085) * q);
    for (let i = 0; i < nS; i++) {
      const a = Math.random() * 6.283;
      emit(SMOKE, x + Math.cos(a) * R * 0.3, y + Math.sin(a) * R * 0.22, rnd(-60, 40),
        Math.cos(a) * R * 0.7 - rnd(20, 90), rnd(0.35, 1.1) * R * (nuke ? 2.0 : 1.2) + 40,
        rnd(1.3, 2.9) + R * 0.003, R * rnd(0.4, 0.8), R * rnd(1.5, 2.8),
        cSmoke, rnd(0.30, 0.62), 0.85, 22, rnd(-1.2, 1.2));
    }

    ring(x, y, R * 0.30, R * (nuke ? 3.6 : 1.9), nuke ? 0.55 : 0.22, pal.fx.fire);
    light(x, y, Math.min(150, 8 + R * 0.28), nuke ? 0.9 : 0.34, pal.fx.fire);

    if (opts.ground !== undefined && Math.abs(y - opts.ground) < R * 1.3) scorch(x, opts.ground, R * 1.5);

    if (nuke) {
      // MUSHROOM. Everything here is paced against a 900-unit viewport: the column has to rise
      // slowly enough to be READ, so the stem climbs at about half the blast radius per second and
      // the cap sits at 1.5R, not at 2.6R where it is already off the top of the screen.
      // The viewport is only 900 units tall, so the column height is CAPPED in absolute units,
      // not scaled off R. At r=700 an uncapped 1.5R cap sits entirely above the top of the screen.
      const capY = Math.min(R * 1.5, 520);
      for (let i = 0; i < Math.round(34 * q); i++) {
        emit(SMOKE, x + rnd(-R * 0.16, R * 0.16), y + rnd(0, capY * 0.55), rnd(-60, 40),
          rnd(-30, 14), rnd(0.20, 0.36) * R, rnd(4.4, 6.6), R * 0.45, R * 1.2,
          cSmoke, rnd(0.40, 0.66), 0.35, 6, rnd(-0.4, 0.4));
      }
      for (let i = 0; i < Math.round(40 * q); i++) {
        const a = Math.random() * 6.283, rr = rnd(0.15, 1) * R * 0.95;
        emit(SMOKE, x + Math.cos(a) * rr, y + capY + Math.sin(a) * rr * 0.34, rnd(-90, 70),
          Math.cos(a) * R * 0.34, rnd(0.05, 0.20) * R, rnd(5.0, 7.5), R * 0.7, R * 1.6,
          cSmoke, rnd(0.45, 0.75), 0.45, 3, rnd(-0.35, 0.35));
      }
      for (let i = 0; i < Math.round(26 * q); i++) {
        const a = Math.random() * 6.283;
        emit(FIRE, x, y + capY * 0.85, 0, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.34 + R * 0.25,
          rnd(0.9, 1.8), R * 0.5, R * 1.1, cFire, 1.4, 1.4, -50, 0);
      }
      ring(x, y, R * 0.2, R * 3.0, 0.9, pal.fx.fire);
      whiteT = 0; whiteDur = 0.55;
      white.visible = true;
      shakeOut = Math.max(shakeOut, 1.6);
    } else {
      shakeOut = Math.max(shakeOut, Math.min(1, R / 260));
    }
  }

  let qw = 1, qh = 1;
  function fitWhite() {
    const Zl = -60;
    qh = 2 * Math.tan((camApi.cam.fov * Math.PI / 180) / 2) * Math.abs(Zl);
    qw = qh * camApi.cam.aspect;
    white.scale.set(qw * 1.1, qh * 1.1, 1);
    white.position.set(0, 0, Zl + 1);
  }

  /** A single smoke/fire puff, for contrails, engine smoke and burning wrecks. */
  function trail(x, y, ux, uy, size0, size1, ttl, alpha, hex, kind = SMOKE) {
    C.set(hex);
    emit(kind, x, y, 0, ux, uy, ttl, size0, size1, C, alpha, 0.9, kind === SMOKE ? 14 : -40, rnd(-0.8, 0.8));
  }

  return {
    root, boom, trail, white, fitWhite,

    setPalette(p, key) {
      pal = p;
      bin.dispose();
      fireMat.map = bin.keep(makeTex(getPlate('fire', p, key)));
      fireMat.needsUpdate = true;
      smokeMat.uniforms.map.value = bin.keep(makeTex(getPlate('smoke', p, key)));
      ringMat.map = bin.keep(makeTex(getPlate('ring', p, key)));
      ringMat.needsUpdate = true;
      decalMat.map = bin.keep(makeTex(getPlate('scorch', p, key)));
      decalMat.needsUpdate = true;
      cHot.set('#fffdf2');
      cFire.set(p.fx.fire);
      cEmb.set(mix(p.fx.fire, '#ff9a3c', 0.5));
      cSmoke.set(mix(p.earth.deep, p.fog.col, 0.24));
      fitWhite();
    },

    setReduce(v) { reduce = v; },

    /** Returns the extra camera shake this frame (0..1), for the renderer to add on. */
    update(dt, camX, vw) {
      const sc = camApi.scale;
      let nF = 0, nS = 0;
      const x0 = camX - vw, x1 = camX + vw;

      for (let i = 0; i < CAP; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        const k = 1 - life[i] / maxL[i];
        const d = Math.max(0, 1 - drag[i] * dt);
        vx[i] *= d; vy[i] *= d;
        vy[i] += grav[i] * dt;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt;
        rot[i] += spin[i] * dt;
        if (px[i] < x0 || px[i] > x1) continue;

        const size = s0[i] + (s1[i] - s0[i]) * k;
        const fade = kindA[i] === SMOKE
          ? Math.sin(Math.min(1, k * 3.2) * Math.PI * 0.5) * (1 - k * k)
          : (1 - k) * (1 - k);
        const a = a0[i] * fade;
        if (a <= 0.004) continue;

        P.set(px[i], py[i], pz[i]);
        S.set(size, size, 1);
        Q.setFromEuler(E.set(0, 0, rot[i]));
        M.compose(P, Q, S);

        if (kindA[i] === SMOKE) {
          if (nS >= CAP) continue;
          smoke.setMatrixAt(nS, M);
          sAlpha[nS] = a;
          sCol[nS * 3] = cr[i]; sCol[nS * 3 + 1] = cg[i]; sCol[nS * 3 + 2] = cb[i];
          nS++;
        } else {
          if (nF >= CAP) continue;
          fire.setMatrixAt(nF, M);
          const arr = fire.instanceColor.array;
          arr[nF * 3] = cr[i] * a; arr[nF * 3 + 1] = cg[i] * a; arr[nF * 3 + 2] = cb[i] * a;
          nF++;
        }
      }
      fire.count = nF; smoke.count = nS;
      fire.instanceMatrix.needsUpdate = true; fire.instanceColor.needsUpdate = true;
      smoke.instanceMatrix.needsUpdate = true;
      smokeGeo.attributes.aAlpha.needsUpdate = true;
      smokeGeo.attributes.aCol.needsUpdate = true;

      let nR = 0;
      for (let i = 0; i < RINGS; i++) {
        if (!ringA.on[i]) continue;
        ringA.t[i] += dt;
        const k = ringA.t[i] / ringA.d[i];
        if (k >= 1) { ringA.on[i] = 0; continue; }
        const r = ringA.r0[i] + (ringA.r1[i] - ringA.r0[i]) * Math.pow(k, 0.55);
        const a = (1 - k) * (1 - k) * 0.5;
        P.set(ringA.x[i], ringA.y[i], 120);
        S.set(r * 2, r * 2, 1);
        Q.identity();
        M.compose(P, Q, S);
        rings.setMatrixAt(nR, M);
        const src = i * 3, dst = nR * 3, arr = rings.instanceColor.array;
        if (dst !== src) { arr[dst] = arr[src]; arr[dst + 1] = arr[src + 1]; arr[dst + 2] = arr[src + 2]; }
        arr[dst] *= a; arr[dst + 1] *= a; arr[dst + 2] *= a;
        nR++;
      }
      rings.count = nR;
      rings.instanceMatrix.needsUpdate = true;
      rings.instanceColor.needsUpdate = true;

      let nD = 0;
      for (let i = 0; i < DECALS; i++) {
        if (!decA.on[i]) continue;
        decA.t[i] += dt;
        if (decA.t[i] > 26) { decA.on[i] = 0; continue; }
        if (decA.x[i] < x0 || decA.x[i] > x1) continue;
        P.set(decA.x[i], decA.y[i] - decA.r[i] * 0.18, 202);
        S.set(decA.r[i] * 2, decA.r[i] * 0.7, 1);
        Q.identity();
        M.compose(P, Q, S);
        decals.setMatrixAt(nD++, M);
      }
      decals.count = nD;
      decals.instanceMatrix.needsUpdate = true;

      for (const L of lights) {
        if (L.intensity <= 0.001) continue;
        L.userData.t += dt;
        const k = L.userData.t / L.userData.dur;
        L.intensity = k >= 1 ? 0 : L.userData.peak * Math.pow(1 - k, 2.2);
      }

      if (white.visible) {
        whiteT += dt;
        const k = whiteT / whiteDur;
        whiteMat.opacity = k >= 1 ? 0 : Math.pow(1 - k, 1.6) * 0.80;
        if (k >= 1) white.visible = false;
      }

      const out = shakeOut;
      shakeOut = Math.max(0, shakeOut - dt * 2.2);
      return out;
    },

    counts() { return { fire: fire.count, smoke: smoke.count, rings: rings.count, decals: decals.count }; },
    clear() { for (let i = 0; i < CAP; i++) life[i] = 0; for (let i = 0; i < RINGS; i++) ringA.on[i] = 0; for (let i = 0; i < DECALS; i++) decA.on[i] = 0; },
    dispose() {
      bin.dispose(); quad.dispose(); smokeGeo.dispose();
      fireMat.dispose(); smokeMat.dispose(); ringMat.dispose(); decalMat.dispose(); whiteMat.dispose();
      for (const L of lights) scene.remove(L);
    },
  };
}
