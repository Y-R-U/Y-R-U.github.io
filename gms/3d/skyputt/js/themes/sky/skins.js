// Sky Isles theme — obstacle skins (visual only; the engine owns colliders).
import * as THREE from 'three';
import { Buckets, mat } from './util.js';
import { fadeTexture } from './textures.js';

const ROOF = 0x34507e, DARKWOOD = 0x4a2e1c;

/** Scale a cylinder's UVs to metres so tiled textures keep their size. */
function metreUv(g, uScale, vScale) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  return g;
}

export function createSkins(M) {
  const I = M.internal;
  const mats = { vc: I.vc, gold: I.gold, glow: I.windowGlow, blue: I.blueGlow, stone: I.stone, wood: I.wood, marble: I.marble, metal: I.vcMetal };
  const shared = { fade: fadeTexture(64) };
  const glowMats = [];
  const disposables = [shared.fade];

  function ringGlowMaterial(color, pulse = 1) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: M.uniforms.uTime, uColor: { value: new THREE.Color(color) }, uPulse: { value: pulse } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uPulse; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = abs(vUv.y - 0.5) * 2.0; float core = exp(-d * d * 18.0); float halo = exp(-d * d * 3.0) * 0.45;
          float p = 1.0 + 0.25 * uPulse * sin(uTime * 3.0);
          gl_FragColor = vec4(uColor * (core * 1.4 + halo) * p, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    glowMats.push(m);
    return m;
  }

  /** A flat ring whose uv.y runs 0 (inner) → 1 (outer), for ringGlowMaterial. */
  function flatRing(r0, r1, seg = 48) {
    const g = new THREE.RingGeometry(r0, r1, seg, 1);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, 0, (r - r0) / (r1 - r0)); }
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // ---------------- windmill ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;   // engine extension: tunnel ceiling
    const b = new Buckets();
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 10 });
      eg.rotateX(-Math.PI / 2);
      b.add('stone', eg, null, null, true);
    }
    const up = metreUv(new THREE.CylinderGeometry(R * 0.86, R, H - th, 16, 1, true), Math.PI * 2 * R, (H - th) * 2);
    b.add('stone', up, null, mat(0, th + (H - th) / 2, 0), true);
    b.add('vc', new THREE.CircleGeometry(R, 16), 0x3a3430, mat(0, th, 0, Math.PI / 2, 0, 0));
    // gold bands + tunnel frames
    b.add('gold', new THREE.TorusGeometry(R * 1.01, 0.022, 4, 24), null, mat(0, th + 0.01, 0, Math.PI / 2, 0, 0));
    b.add('gold', new THREE.TorusGeometry(R * 0.875, 0.025, 4, 24), null, mat(0, H - 0.02, 0, Math.PI / 2, 0, 0));
    for (const zs of [1, -1]) {
      for (const xs of [1, -1]) b.add('gold', new THREE.BoxGeometry(0.035, th, 0.035), null, mat(xs * (g2 + 0.017), th / 2, zs * zFace));
      b.add('gold', new THREE.BoxGeometry(gap + 0.07, 0.035, 0.035), null, mat(0, th, zs * zFace));
    }
    // cap roof + finial
    const roofH = H * 0.42;
    b.add('vc', new THREE.ConeGeometry(R * 1.05, roofH, 16), ROOF, mat(0, H + roofH / 2 - 0.02, 0));
    b.add('gold', new THREE.ConeGeometry(0.025, 0.16, 6), null, mat(0, H + roofH + 0.05, 0));
    b.add('gold', new THREE.SphereGeometry(0.03, 8, 6), null, mat(0, H + roofH - 0.03, 0));
    // windows on the front and sides
    const wR = (y) => R - (R - R * 0.86) * ((y - th) / (H - th));
    for (const [ang, y] of [[0, H * 0.55], [0.9, H * 0.42], [-0.9, H * 0.42], [Math.PI, H * 0.55]]) {
      const r = wR(y) + 0.005;
      b.add('glow', new THREE.BoxGeometry(0.07, 0.11, 0.02), null, mat(Math.sin(ang) * r, y, Math.cos(ang) * r, 0, ang, 0));
      b.add('gold', new THREE.BoxGeometry(0.09, 0.015, 0.03), null, mat(Math.sin(ang) * r, y - 0.062, Math.cos(ang) * r, 0, ang, 0));
    }
    // hub housing on the front (static)
    b.add('vc', new THREE.BoxGeometry(0.16, 0.16, 0.12), DARKWOOD, mat(0, hub, wR(hub) - 0.02));
    const object = new THREE.Group(); object.name = 'sky.windmill';
    const meshes = b.build(mats, object, { castShadow: true, receiveShadow: true });
    void meshes;

    // rotor (spins about local Z)
    const rotor = new THREE.Group(); rotor.name = 'sky.windmill.rotor';
    const rb = new Buckets();
    rb.add('gold', new THREE.CylinderGeometry(0.055, 0.065, 0.08, 12), null, mat(0, 0, 0.02, Math.PI / 2, 0, 0));
    rb.add('gold', new THREE.SphereGeometry(0.04, 10, 6), null, mat(0, 0, 0.07));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z) => M2.clone().multiply(mat(x, y, z));
      rb.add('vc', new THREE.BoxGeometry(0.03, BL, 0.03), DARKWOOD, at(0, BL / 2, 0));
      // engine extension: sail spans x ∈ [0.018, 0.018 + BW], radius 0.06 → BL (matches the physics box)
      const sailL = BL - 0.06, sy = 0.06 + sailL / 2;
      const sail = new THREE.BoxGeometry(BW, sailL, 0.012);
      metreUv(sail, BW, sailL);
      rb.add('wood', sail, null, at(BW / 2 + 0.018, sy, -0.005), true);
      for (let k = 0; k <= 4; k++) rb.add('vc', new THREE.BoxGeometry(BW, 0.012, 0.02), DARKWOOD, at(BW / 2 + 0.018, sy - sailL / 2 + 0.006 + (k / 4) * (sailL - 0.012), 0.004));
      rb.add('vc', new THREE.BoxGeometry(0.012, sailL, 0.02), DARKWOOD, at(BW + 0.012, sy, 0.004));
      rb.add('gold', new THREE.BoxGeometry(0.04, 0.03, 0.035), null, at(0, BL, 0));
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop ----------------
  // engine extension: eased sideways shift, zero slope at entry and exit
  const loopX = (S, u) => S * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
  class Helix extends THREE.Curve {
    constructor(r, shift, inward, lateral) { super(); this.r = r; this.shift = shift; this.inward = inward; this.lateral = lateral; }
    getPoint(t, out = new THREE.Vector3()) {
      const a = t * Math.PI * 2, r = this.r - this.inward;
      return out.set(loopX(this.shift, t) + this.lateral, this.r - r * Math.cos(a), r * Math.sin(a));
    }
  }
  function loop(o = {}) {
    const R = o.radius ?? 0.6, W = o.width ?? 0.5, S = o.sideShift ?? W * 1.3;
    const b = new Buckets();
    const seg = 56;
    for (const s of [-1, 1]) {
      b.add('gold', new THREE.TubeGeometry(new Helix(R, S, 0.045, s * (W / 2 + 0.012)), seg, 0.018, 5, false), null, null);
      b.add('gold', new THREE.TubeGeometry(new Helix(R, S, -0.05, s * (W / 2 + 0.045)), 56, 0.028, 5, false), null, null);
    }
    // outer bronze band behind the track (faces outward)
    const pos = [], nor = [], idx = [];
    const BW = W / 2 + 0.05, out = 0.05, N = 96;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = t * Math.PI * 2, r = R + out;
      const cx = loopX(S, t), cy = R - r * Math.cos(a), cz = r * Math.sin(a);
      const nx = 0, ny = -Math.cos(a), nz = Math.sin(a);
      for (const e of [-1, 1]) { pos.push(cx + e * BW, cy, cz); nor.push(nx, ny, nz); }
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    band.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    band.setIndex(idx);
    b.add('metal', band, 0x9a6a3a, null);
    // glowing studs on the band and a crest at the top
    const studs = 14;
    for (let i = 1; i < studs; i++) {
      const t = i / studs, a = t * Math.PI * 2, r = R + out + 0.012;
      for (const e of [-1, 1]) b.add('glow', new THREE.BoxGeometry(0.03, 0.03, 0.03), null, mat(loopX(S, t) + e * (BW - 0.04), R - r * Math.cos(a), r * Math.sin(a), a, 0, 0));
    }
    b.add('gold', new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), null, mat(S * 0.5, 2 * R + out + 0.02, 0));
    b.add('blue', new THREE.CylinderGeometry(0.05, 0.05, 0.035, 12), null, mat(S * 0.5, 2 * R + out + 0.025, 0));
    const object = new THREE.Group(); object.name = 'sky.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'sky.tube';
    const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r * 1.02, M.quality === 'low' ? 10 : 14, false), I.glass);
    glass.renderOrder = 4;
    object.add(glass);
    const b = new Buckets();
    const nRings = Math.max(2, Math.floor(len / 0.3));
    const q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i <= nRings; i++) {
      const t = i / nRings;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      q.setFromUnitVectors(Z, tg);
      const end = i === 0 || i === nRings;
      m4.compose(p, q, new THREE.Vector3(1, 1, 1));
      if (end) b.add('gold', new THREE.TorusGeometry(r * 1.08, 0.022, 6, 20), null, m4.clone());
      else b.add('blue', new THREE.TorusGeometry(r * 1.03, 0.006, 3, 16), null, m4.clone());
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'sky.flag';
    const b = new Buckets();
    b.add('pole', new THREE.CylinderGeometry(0.011, 0.011, H, 8), 0xffffff, mat(0, H / 2, 0));
    b.add('gold', new THREE.SphereGeometry(0.024, 10, 8), null, mat(0, H + 0.015, 0));
    b.add('gold', new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8), null, mat(0, H - 0.25, 0));
    b.build({ ...mats, pole: M.materials.cupRim }, object, { castShadow: true });
    const FW = 0.34, FH = 0.22;
    const cloth = new THREE.PlaneGeometry(FW, FH, 10, 4);
    cloth.translate(FW / 2 + 0.01, H - FH / 2 - 0.03, 0);
    const base = Float32Array.from(cloth.attributes.position.array);
    const flagMesh = new THREE.Mesh(cloth, M.materials.flag);
    flagMesh.castShadow = true;
    object.add(flagMesh);
    const pos = cloth.attributes.position;
    return {
      object,
      update(dt, t) {
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3] - 0.01;
          const k = x / FW;
          pos.setZ(i, Math.sin(x * 16 - t * 7) * 0.028 * k + Math.sin(x * 7 - t * 3.1) * 0.012 * k);
          pos.setY(i, base[i * 3 + 1] - k * k * 0.015);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup (crystal) ----------------
  const crystalGeo = (() => {
    const pts = [new THREE.Vector2(0, -0.075), new THREE.Vector2(0.042, -0.02), new THREE.Vector2(0.046, 0.02), new THREE.Vector2(0.026, 0.06), new THREE.Vector2(0, 0.078)];
    const g = new THREE.LatheGeometry(pts, 6);
    g.deleteAttribute('uv');
    return g;
  })();
  disposables.push(crystalGeo);
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0x5fb8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  function pickup() {
    const object = new THREE.Group(); object.name = 'sky.pickup';
    const spin = new THREE.Group();
    const c = new THREE.Mesh(crystalGeo, I.crystal);
    c.castShadow = true;
    spin.add(c);
    const glow = new THREE.Sprite(sparkMat);
    glow.scale.set(0.3, 0.3, 1);
    spin.add(glow);
    spin.position.y = 0.12;
    object.add(spin);
    const phase = Math.random() * 6.28;
    return {
      object,
      update(dt, t) {
        spin.position.y = 0.12 + Math.sin(t * 2.2 + phase) * 0.022;
        c.rotation.y = t * 1.6 + phase;
        const s = 0.26 + Math.sin(t * 3.1 + phase) * 0.04;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper ----------------
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = o.height ?? 0.15;
    const b = new Buckets();
    b.add('marble', metreUv(new THREE.CylinderGeometry(r * 0.96, r, h * 0.86, 20), Math.PI * 2 * r, h), null, mat(0, h * 0.43, 0), true);
    b.add('gold', new THREE.TorusGeometry(r * 1.0, 0.016, 5, 24), null, mat(0, 0.012, 0, Math.PI / 2, 0, 0));
    b.add('gold', new THREE.TorusGeometry(r * 0.97, 0.012, 5, 24), null, mat(0, h * 0.5, 0, Math.PI / 2, 0, 0));
    b.add('gold', new THREE.CylinderGeometry(r * 1.0, r * 0.96, h * 0.14, 20), null, mat(0, h * 0.93, 0));
    b.add('blue', new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.012, 16), null, mat(0, h + 0.006, 0));
    const object = new THREE.Group(); object.name = 'sky.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'sky.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, 0.05, 48), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = -Math.PI / 2;  // compass star toward +Z = back toward the tee (behind the ball, like the ref)
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets();
    b.add('gold', new THREE.TorusGeometry(R * 0.985, Math.min(0.022, R * 0.05), 5, 56), null, mat(0, 0.008, 0, Math.PI / 2, 0, 0));
    b.add('gold', new THREE.TorusGeometry(R * 0.42, 0.01, 4, 40), null, mat(0, 0.007, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      b.add('gold', new THREE.SphereGeometry(Math.min(0.018, R * 0.035), 8, 5), null, mat(Math.cos(a) * R * 0.88, 0.006, Math.sin(a) * R * 0.88, 0, 0, 0, [1, 0.5, 1]));
    }
    b.build(mats, object, { receiveShadow: true });
    const rr = Math.min(0.17, R * 0.36);
    const ring = new THREE.Mesh(flatRing(rr * 0.62, rr, 48), ringGlowMaterial(0x3fc4ff, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    const ring2 = new THREE.Mesh(flatRing(R * 0.38, R * 0.44, 48), ringGlowMaterial(0x2a8cff, 0.5));
    ring2.position.y = 0.0085; ring2.renderOrder = 5;
    if (R >= 0.5) object.add(ring2); else ring2.geometry.dispose();
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
