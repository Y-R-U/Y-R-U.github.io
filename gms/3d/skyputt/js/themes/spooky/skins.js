// Spooky Hollow theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as Sky Isles).
import * as THREE from 'three';
import { Buckets, mat } from './util.js';
import { pumpkin, skull, COLORS } from './props.js';

const PLANK = 0x7a6252, PLANK2 = 0x5e4a40, IRON = COLORS.iron;

function metreUv(g, uScale, vScale) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
  return g;
}

export function createSkins(M) {
  const I = M.internal;
  const mats = {
    vc: I.vc, gloss: I.vcGloss, metal: I.vcMetal, cloth: I.vcCloth, stone: I.stone, wood: I.wood, slate: I.slate,
    ember: I.emberGlow, face: I.faceGlow, green: I.greenGlow, candle: I.candle, trim: I.ember, win: I.windowGlow,
  };
  const glowMats = [];
  const disposables = [];

  function ringGlowMaterial(color, pulse = 1) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: M.uniforms.uTime, uColor: { value: new THREE.Color(color) }, uPulse: { value: pulse } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uPulse; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = abs(vUv.y - 0.5) * 2.0; float core = exp(-d * d * 18.0); float halo = exp(-d * d * 3.0) * 0.45;
          float p = 1.0 + 0.2 * uPulse * sin(uTime * 3.0) * sin(uTime * 7.1 + 1.0);
          gl_FragColor = vec4(uColor * (core * 1.3 + halo) * p, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    glowMats.push(m);
    return m;
  }
  function flatRing(r0, r1, seg = 48) {
    const g = new THREE.RingGeometry(r0, r1, seg, 1);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, 0, (r - r0) / (r1 - r0)); }
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // ---------------- windmill: rickety plank tower, ragged sails, skull hub ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets();
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    // stone footing either side of the tunnel
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 8 });
      eg.rotateX(-Math.PI / 2);
      b.add('stone', eg, null, null, true);
    }
    // plank body: vertical boards on an octagon, slightly crooked
    const sides = 10, top = R * 0.78;
    for (let i = 0; i < sides; i++) {
      const a = (i + 0.5) / sides * Math.PI * 2;
      const rr = (R + top) / 2 - 0.01;
      const w = 2 * Math.PI * rr / sides * 1.04;
      const lean = (i % 3 - 1) * 0.015;
      b.add('vc', new THREE.BoxGeometry(w, H - th, 0.035), i % 2 ? PLANK : PLANK2,
        mat(Math.sin(a) * rr, th + (H - th) / 2, Math.cos(a) * rr, Math.atan2(R - top, H - th) * -1 * 0 + lean, a, 0)
          .multiply(new THREE.Matrix4().makeRotationX(-Math.atan2(R - top, H - th))));
    }
    // cross braces + iron bands
    b.add('metal', new THREE.TorusGeometry(R * 1.0, 0.016, 4, 20), IRON, mat(0, th + 0.02, 0, Math.PI / 2, 0, 0));
    b.add('metal', new THREE.TorusGeometry((R + top) / 2 + 0.01, 0.014, 4, 20), IRON, mat(0, th + (H - th) * 0.5, 0, Math.PI / 2, 0, 0));
    b.add('metal', new THREE.TorusGeometry(top + 0.01, 0.016, 4, 20), IRON, mat(0, H - 0.02, 0, Math.PI / 2, 0, 0));
    // tunnel frame: ember trim around the opening both ends
    for (const zs of [1, -1]) {
      for (const xs of [1, -1]) b.add('trim', new THREE.BoxGeometry(0.03, th, 0.03), null, mat(xs * (g2 + 0.015), th / 2, zs * zFace));
      b.add('trim', new THREE.BoxGeometry(gap + 0.06, 0.03, 0.03), null, mat(0, th, zs * zFace));
    }
    // crooked witch-hat roof + broken weathervane
    const roofH = H * 0.55;
    b.add('vc', new THREE.ConeGeometry(top * 1.3, roofH, 10), 0x4e3a6e, mat(0.02, H + roofH / 2 - 0.03, 0, 0.08, 0, -0.1));
    b.add('metal', new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), IRON, mat(-0.06, H + roofH + 0.04, 0.02, 0.1, 0, -0.35));
    b.add('metal', new THREE.BoxGeometry(0.1, 0.03, 0.004), IRON, mat(-0.09, H + roofH + 0.1, 0.02, 0, 0.4, -0.3));
    // glowing windows (one green)
    const wR = (y) => R - (R - top) * ((y - th) / (H - th));
    for (const [ang, y, key] of [[0.95, H * 0.42, 'win'], [-0.95, H * 0.6, 'green'], [Math.PI, H * 0.55, 'win']]) {
      const r = wR(y) + 0.02;
      b.add(key, new THREE.BoxGeometry(0.07, 0.1, 0.02), null, mat(Math.sin(ang) * r, y, Math.cos(ang) * r, 0, ang, 0));
      b.add('vc', new THREE.BoxGeometry(0.012, 0.11, 0.024), PLANK2, mat(Math.sin(ang) * r, y, Math.cos(ang) * r, 0, ang, 0));
    }
    // hub housing
    b.add('vc', new THREE.BoxGeometry(0.16, 0.16, 0.12), PLANK2, mat(0, hub, wR(hub) - 0.02));
    const object = new THREE.Group(); object.name = 'spooky.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: skull hub + ragged sails. Blade k along +Y rotated 2πk/n; sail on x ∈ [0.018, 0.018 + BW],
    // radius 0.06 → BL, within ±0.022 in Z (matches the physics box).
    const rotor = new THREE.Group(); rotor.name = 'spooky.windmill.rotor';
    const rb = new Buckets();
    rb.add('metal', new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10), IRON, mat(0, 0, 0.01, Math.PI / 2, 0, 0));
    skull(rb, mat(0, -0.075, 0.04, Math.PI / 2 * 0, 0, 0).multiply(new THREE.Matrix4().makeRotationX(0)), 0.07, 'ember', 'gloss');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z, rz = 0) => M2.clone().multiply(mat(x, y, z, 0, 0, rz));
      rb.add('vc', new THREE.BoxGeometry(0.03, BL, 0.03), PLANK2, at(0, BL / 2 + 0.03, -0.01));
      const sailL = BL - 0.06;
      // slats: some missing, some crooked; the frame still outlines the physics box
      const nS = 7;
      for (let k = 0; k < nS; k++) {
        if (k === 2 + (i % 3) || (k === 5 && i % 2)) continue;   // missing slats
        const y = 0.06 + (k + 0.5) / nS * sailL;
        const crook = ((i * 7 + k * 3) % 5 - 2) * 0.03;
        const wk = BW * (k === nS - 1 && i % 2 ? 0.7 : 1);
        rb.add('vc', new THREE.BoxGeometry(wk, sailL / nS * 0.78, 0.012), k % 2 ? PLANK : 0x5a4636, at(0.018 + wk / 2, y, -0.004, crook));
      }
      rb.add('vc', new THREE.BoxGeometry(0.014, sailL, 0.02), PLANK2, at(BW + 0.011, 0.06 + sailL / 2, 0.004));
      rb.add('vc', new THREE.BoxGeometry(BW, 0.014, 0.02), PLANK2, at(0.018 + BW / 2, BL - 0.007, 0.004));
      // tattered cloth strip hanging from the tip
      rb.add('cloth', new THREE.PlaneGeometry(BW * 0.5, sailL * 0.35), 0x5a4a52, at(0.018 + BW * 0.7, BL - sailL * 0.2, 0.012, 0.1));
      rb.add('metal', new THREE.BoxGeometry(0.04, 0.03, 0.035), IRON, at(0, BL, 0));
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: ring of carved pumpkins ----------------
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
    for (const s of [-1, 1]) {
      b.add('trim', new THREE.TubeGeometry(new Helix(R, S, 0.045, s * (W / 2 + 0.012)), 56, 0.016, 5, false), null, null);
      b.add('metal', new THREE.TubeGeometry(new Helix(R, S, -0.05, s * (W / 2 + 0.045)), 56, 0.022, 5, false), IRON, null);
    }
    // dark wooden band behind the track
    const pos = [], nor = [], idx = [];
    const BWd = W / 2 + 0.05, out = 0.05, N = 96;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = t * Math.PI * 2, r = R + out;
      const cx = loopX(S, t), cy = R - r * Math.cos(a), cz = r * Math.sin(a);
      for (const e of [-1, 1]) { pos.push(cx + e * BWd, cy, cz); nor.push(0, -Math.cos(a), Math.sin(a)); }
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    band.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    band.setIndex(idx);
    b.add('vc', band, 0x6a5048, null);
    // carved pumpkins around the ring on both outer edges, faces toward the approaching ball (-Z)
    const count = 8, pr = Math.min(0.07, R * 0.15);
    for (let i = 1; i < count; i++) {
      const t = i / count, a = t * Math.PI * 2, r = R + out;
      for (const e of [-1, 1]) {
        const P = new THREE.Matrix4().makeTranslation(loopX(S, t) + e * (BWd + pr * 0.55), R - r * Math.cos(a) - pr * 0.78, r * Math.sin(a))
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI + e * 0.35));
        pumpkin(b, P, pr, { seg: 8 });
      }
    }
    // ember strips along both band edges so the ring glows orange
    for (const e of [-1, 1]) b.add('trim', new THREE.TubeGeometry(new Helix(R, S, -out - 0.005, e * BWd), 64, 0.012, 4, false), null, null);
    // a big pumpkin crowning the top
    pumpkin(b, new THREE.Matrix4().makeTranslation(S * 0.5, 2 * R + out + 0.005, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), Math.min(0.11, R * 0.24), { seg: 12 });
    const object = new THREE.Group(); object.name = 'spooky.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: ghostly green glass ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'spooky.tube';
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
      if (end) {
        b.add('metal', new THREE.TorusGeometry(r * 1.1, 0.024, 6, 20), IRON, m4.clone());
        b.add('green', new THREE.TorusGeometry(r * 1.1, 0.008, 3, 20), null, m4.clone().multiply(mat(0, 0, 0.026)));
      } else b.add('green', new THREE.TorusGeometry(r * 1.03, 0.006, 3, 16), null, m4.clone());
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: tattered red ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'spooky.flag';
    const b = new Buckets();
    b.add('metal', new THREE.CylinderGeometry(0.011, 0.013, H, 8), 0x3a3440, mat(0, H / 2, 0));
    skull(b, mat(0, H - 0.005, 0, 0, Math.PI / 2, 0), 0.026, 'ember', 'gloss');
    b.add('metal', new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8), 0x3a3440, mat(0, H - 0.27, 0));
    b.build(mats, object, { castShadow: true });
    const FW = 0.36, FH = 0.24;
    const cloth = new THREE.PlaneGeometry(FW, FH, 12, 5);
    cloth.translate(FW / 2 + 0.01, H - FH / 2 - 0.05, 0);
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
          pos.setZ(i, Math.sin(x * 15 - t * 5.5) * 0.03 * k + Math.sin(x * 6 - t * 2.3) * 0.016 * k);
          pos.setY(i, base[i * 3 + 1] - k * k * 0.03);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup: mini glowing pumpkin ----------------
  const pickGeo = (() => {
    const b = new Buckets();
    pumpkin(b, mat(0, -0.045, 0), 0.058, { seg: 10 });
    const g = new THREE.Group();
    b.build({ ...mats, gloss: I.vcGloss }, g);
    return g;
  })();
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0xff9a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  pickGeo.traverse(o => { if (o.geometry) disposables.push(o.geometry); });
  function pickup() {
    const object = new THREE.Group(); object.name = 'spooky.pickup';
    const spin = new THREE.Group();
    const body = pickGeo.clone();
    body.traverse(o => { if (o.isMesh) o.castShadow = true; });
    spin.add(body);
    const glow = new THREE.Sprite(sparkMat);
    glow.scale.set(0.32, 0.32, 1);
    glow.raycast = () => {};   // the engine's camera-occlusion raycast has no camera set → Sprite.raycast throws
    spin.add(glow);
    spin.position.y = 0.11;
    object.add(spin);
    object.traverse(o => { o.userData.noOcclude = true; });
    const phase = Math.random() * 6.28;
    return {
      object,
      update(dt, t) {
        spin.position.y = 0.11 + Math.sin(t * 2.2 + phase) * 0.02;
        body.rotation.y = t * 1.8 + phase;
        const s = 0.28 + Math.sin(t * 6.1 + phase) * 0.03 + Math.sin(t * 13.3) * 0.015;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: jack-o'-lantern post ----------------
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = o.height ?? 0.15;
    const b = new Buckets();
    // pumpkin body fills the collider cylinder: radius r, height ≈ h (squash 0.78 → 1.56 r tall)
    const P = mat(0, 0, 0, 0, 0, 0, [1, h / (r * 1.56), 1]);
    pumpkin(b, P, r * 1.02, { seg: 16 });
    b.add('trim', new THREE.TorusGeometry(r * 0.95, 0.01, 4, 24), null, mat(0, 0.008, 0, Math.PI / 2, 0, 0));
    const object = new THREE.Group(); object.name = 'spooky.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: carved stone disc with a jack-o'-lantern face ring ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'spooky.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, 48), I.teePad);
    disc.position.y = 0.006 - 0.025;
    // texture +v (face top) → local -Z, i.e. the face looks up the fairway with its top toward the cup
    disc.rotation.y = Math.PI / 2;
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets();
    b.add('metal', new THREE.TorusGeometry(R * 0.99, Math.min(0.02, R * 0.05), 5, 48), IRON, mat(0, 0.006, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      b.add('metal', new THREE.ConeGeometry(Math.min(0.016, R * 0.04), 0.03, 4), IRON, mat(Math.cos(a) * R * 0.99, 0.02, Math.sin(a) * R * 0.99));
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.56, R * 0.66, 48), ringGlowMaterial(0xff7a1a, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover (undocumented engine skin): sliding coffin filling the w×h×d box ----------------
  // opts = { width, height, depth }, base at y = 0, centred on x/z (same as the greybox fallback).
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const b = new Buckets();
    b.add('vc', new THREE.BoxGeometry(w, h * 0.78, d), PLANK, mat(0, h * 0.39, 0));
    b.add('vc', new THREE.BoxGeometry(w * 1.0, h * 0.22, d * 1.0), PLANK2, mat(0, h * 0.89, 0));   // lid
    b.add('trim', new THREE.BoxGeometry(w * 0.9, 0.012, d * 0.5), null, mat(0, h + 0.006, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('metal', new THREE.BoxGeometry(0.03, h * 1.0, 0.03), IRON, mat(sx * (w / 2 - 0.013), h / 2, sz * (d / 2 - 0.013)));
    // cross on the lid and a small skull on each long face
    b.add('vc', new THREE.BoxGeometry(w * 0.5, 0.008, 0.025), COLORS.bone, mat(0, h + 0.004, 0));
    b.add('vc', new THREE.BoxGeometry(0.025, 0.008, d * 0.6), COLORS.bone, mat(-w * 0.1, h + 0.004, 0));
    for (const sz of [-1, 1]) skull(b, mat(0, h * 0.2, sz * (d / 2 - 0.004), 0, sz > 0 ? 0 : Math.PI, 0), h * 0.22, 'ember', 'gloss');
    const object = new THREE.Group(); object.name = 'spooky.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
