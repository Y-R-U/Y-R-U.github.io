// ctx.fx: pooled particles (cap 512), hologram place commits, EMP blooms.
const CAP = 512;

const P_VS = /* glsl */`
attribute float aSize;
attribute vec4 aCol;
uniform float uScale;
varying vec4 vCol;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 96.0);
  gl_Position = projectionMatrix * mv;
}`;
const P_FS = /* glsl */`
varying vec4 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb * a + vec3(1.0) * pow(a, 6.0) * 0.6, a);
  #include <colorspace_fragment>
}`;

const HOLO_VS = /* glsl */`
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
void main() {
  vL = position + 0.5;
  vN = normalize(normalMatrix * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const HOLO_FS = /* glsl */`
uniform vec3 uColor;
uniform float uFill, uFade, uTime;
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
void main() {
  float lines = step(0.8, fract(vW.y * 8.0 - uTime * 3.0));
  float below = step(vL.y, uFill);
  float edge = smoothstep(0.04, 0.0, abs(vL.y - uFill));
  float a = (below * (0.35 + lines * 0.25) + edge * 1.2) * uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.0 + edge * 2.0), a);
  #include <colorspace_fragment>
}`;

const EMP_FS = /* glsl */`
uniform vec3 uColor;
uniform float uFade;
varying vec3 vL;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = pow(1.0 - min(abs(dot(normalize(vN), normalize((viewMatrix * vec4(V, 0.0)).xyz))), 1.0), 2.5);
  float a = (f * 0.9 + 0.08) * uFade;
  gl_FragColor = vec4(uColor * (0.6 + f * 1.6), a);
  #include <colorspace_fragment>
}`;

export function createFx(ctx) {
  const { THREE, scene } = ctx;
  const toColor = (c) => {
    if (c == null) return new THREE.Color(0x7ff6ff);
    if (Array.isArray(c)) return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    return new THREE.Color(c);
  };
  const toVec = (p) => (Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p);

  // ---- particles ----
  const pos = new Float32Array(CAP * 3), col = new Float32Array(CAP * 4), size = new Float32Array(CAP);
  const vel = new Float32Array(CAP * 3), life = new Float32Array(CAP), maxLife = new Float32Array(CAP);
  const grav = new Float32Array(CAP), size0 = new Float32Array(CAP), size1 = new Float32Array(CAP), drag = new Float32Array(CAP);
  const base = new Float32Array(CAP * 4);
  let alive = 0;
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('aCol', aCol); geo.setAttribute('aSize', aSize);
  geo.setDrawRange(0, 0);
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } }, vertexShader: P_VS, fragmentShader: P_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  function emit(p, c, v, l, g, s0, s1, a, dr) {
    let i;
    if (alive < CAP) i = alive++;
    else { // recycle the oldest-ish slot
      i = 0; let m = 1e9;
      for (let k = 0; k < CAP; k += 7) if (life[k] < m) { m = life[k]; i = k; }
    }
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    vel[i * 3] = v[0]; vel[i * 3 + 1] = v[1]; vel[i * 3 + 2] = v[2];
    life[i] = maxLife[i] = l; grav[i] = g; size0[i] = s0; size1[i] = s1; drag[i] = dr;
    base[i * 4] = c.r; base[i * 4 + 1] = c.g; base[i * 4 + 2] = c.b; base[i * 4 + 3] = a;
  }
  const rnd = Math.random;

  // ---- holograms ----
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const holos = [];
  for (let i = 0; i < 8; i++) {
    const u = { uColor: { value: new THREE.Color() }, uFill: { value: 0 }, uFade: { value: 0 }, uTime: ctx.sky?.uniforms.uTime ?? { value: 0 } };
    const fill = new THREE.Mesh(boxGeo, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: HOLO_VS, fragmentShader: HOLO_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const wire = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const g = new THREE.Group(); g.add(fill, wire); g.visible = false; g.renderOrder = 6; fill.renderOrder = 6; wire.renderOrder = 7;
    scene.add(g);
    holos.push({ g, u, wire, t: -1, dur: 0.45 });
  }

  // ---- EMP shells ----
  const sphGeo = new THREE.SphereGeometry(1, 24, 16);
  const emps = [];
  for (let i = 0; i < 3; i++) {
    const u = { uColor: { value: new THREE.Color() }, uFade: { value: 0 } };
    const m = new THREE.Mesh(sphGeo, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: HOLO_VS, fragmentShader: EMP_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.visible = false; m.renderOrder = 8; scene.add(m);
    emps.push({ m, u, t: -1, r: 1, p: new THREE.Vector3() });
  }

  const fx = {
    get count() { return alive; },
    spark(p, color, n = 14) {
      p = toVec(p); const c = toColor(color);
      for (let k = 0; k < n; k++) {
        const th = rnd() * Math.PI * 2, up = 1.5 + rnd() * 3.5, sp = 1.5 + rnd() * 3;
        emit(p, c, [Math.cos(th) * sp, up, Math.sin(th) * sp], 0.35 + rnd() * 0.45, -14, 0.09 + rnd() * 0.06, 0.02, 1, 1.5);
      }
    },
    puff(p, color, n = 8) {
      p = toVec(p); const c = toColor(color ?? 0xcfe8ff);
      for (let k = 0; k < n; k++) {
        const th = rnd() * Math.PI * 2, sp = 0.3 + rnd() * 0.6;
        emit({ x: p.x + (rnd() - 0.5) * 0.4, y: p.y + (rnd() - 0.5) * 0.3, z: p.z + (rnd() - 0.5) * 0.4 }, c,
          [Math.cos(th) * sp, 0.6 + rnd() * 0.6, Math.sin(th) * sp], 0.6 + rnd() * 0.4, 0, 0.25, 0.7, 0.35, 2);
      }
    },
    hologram(minSub, maxSub, color) {
      const h = holos.find((o) => o.t < 0) || holos.reduce((a, b) => (a.t > b.t ? a : b));
      const sx = (maxSub[0] - minSub[0]) / 4, sy = (maxSub[1] - minSub[1]) / 4, sz = (maxSub[2] - minSub[2]) / 4;
      h.g.position.set(minSub[0] / 4 + sx / 2, minSub[1] / 4 + sy / 2, minSub[2] / 4 + sz / 2);
      h.g.scale.set(sx + 0.02, sy + 0.02, sz + 0.02);
      h.u.uColor.value.copy(toColor(color ?? 0x5cf2ff));
      h.wire.material.color.copy(h.u.uColor.value).multiplyScalar(1.5);
      h.t = 0; h.dur = 0.3 + Math.min(0.4, Math.cbrt(sx * sy * sz) * 0.05);
      h.g.visible = true;
      // a few sparks along the top edge
      const c = toColor(color ?? 0x5cf2ff);
      const n = Math.min(24, 6 + Math.round((sx + sz) * 2));
      for (let k = 0; k < n; k++) {
        emit({ x: minSub[0] / 4 + rnd() * sx, y: minSub[1] / 4 + sy, z: minSub[2] / 4 + rnd() * sz }, c,
          [(rnd() - 0.5) * 1.2, 0.8 + rnd(), (rnd() - 0.5) * 1.2], 0.3 + rnd() * 0.3, -3, 0.07, 0.01, 0.9, 2);
      }
    },
    emp(p, radius = 4) {
      p = toVec(p);
      const e = emps.find((o) => o.t < 0) || emps[0];
      e.t = 0; e.r = radius; e.p.copy(p); e.m.position.copy(p); e.m.visible = true;
      e.u.uColor.value.set(0x9ff6ff);
      const c = new THREE.Color(0xc8fbff), c2 = new THREE.Color(0xff6ae0);
      for (let k = 0; k < 70; k++) {
        const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), sp = radius * (1.5 + rnd() * 1.5);
        emit(p, k % 3 ? c : c2, [Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp],
          0.35 + rnd() * 0.4, -2, 0.18, 0.04, 1, 3);
      }
      ctx.bus?.emit('fx:emp', { pos: [p.x, p.y, p.z], radius });
    },
    update(dt) {
      const cam = ctx.camera;
      if (cam && ctx.renderer) {
        const h = ctx.renderer.domElement.height;
        pMat.uniforms.uScale.value = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
      }
      for (let i = 0; i < alive; i++) {
        life[i] -= dt;
        if (life[i] <= 0) {
          const j = --alive;
          if (i !== j) {
            pos.copyWithin(i * 3, j * 3, j * 3 + 3); vel.copyWithin(i * 3, j * 3, j * 3 + 3);
            base.copyWithin(i * 4, j * 4, j * 4 + 4);
            life[i] = life[j]; maxLife[i] = maxLife[j]; grav[i] = grav[j]; size0[i] = size0[j]; size1[i] = size1[j]; drag[i] = drag[j];
            i--;
          }
          continue;
        }
        const k = 1 - life[i] / maxLife[i];
        const dr = Math.exp(-drag[i] * dt);
        vel[i * 3] *= dr; vel[i * 3 + 2] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr + grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] = size0[i] + (size1[i] - size0[i]) * k;
        const fade = base[i * 4 + 3] * (1 - k * k);
        col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = fade;
      }
      geo.setDrawRange(0, alive);
      if (alive) {
        aPos.addUpdateRange(0, alive * 3); aPos.needsUpdate = true;
        aCol.addUpdateRange(0, alive * 4); aCol.needsUpdate = true;
        aSize.addUpdateRange(0, alive); aSize.needsUpdate = true;
      }
      for (const h of holos) {
        if (h.t < 0) continue;
        h.t += dt;
        const k = h.t / h.dur;
        h.u.uFill.value = Math.min(1, k * 1.25);
        h.u.uFade.value = k < 0.8 ? 1 : Math.max(0, 1 - (k - 0.8) / 0.4);
        h.wire.material.opacity = h.u.uFade.value;
        if (k > 1.2) { h.t = -1; h.g.visible = false; }
      }
      for (const e of emps) {
        if (e.t < 0) continue;
        e.t += dt;
        const k = e.t / 0.55;
        const s = e.r * (0.2 + 0.8 * (1 - Math.pow(1 - Math.min(1, k), 3)));
        e.m.scale.setScalar(s);
        e.u.uFade.value = Math.max(0, 1 - k);
        if (k >= 1) { e.t = -1; e.m.visible = false; }
      }
    },
    clear() { alive = 0; geo.setDrawRange(0, 0); for (const h of holos) { h.t = -1; h.g.visible = false; } for (const e of emps) { e.t = -1; e.m.visible = false; } },
  };
  return fx;
}
