// Frost Fair theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as Sky Isles / Spooky Hollow).
import * as THREE from 'three';
import { Buckets, mat } from './util.js';
import { snowman, present, candyCane, wreath, candyUv, COLORS, BULB_COLS } from './props.js';

const GINGER = 0xa8642e, GINGER2 = 0x8a4e22, ICING = 0xfbfbff, RED = 0xc8202c, GOLD = 0xe8b84a;

export function createSkins(M) {
  const I = M.internal;
  const mats = {
    vc: I.vc, gloss: I.vcGloss, metal: I.vcMetal, snow: I.vcSnow, candy: I.candy, cloth: I.vcCloth,
    bulbA: I.bulbA, bulbB: I.bulbB, star: I.starGlow, win: I.windowGlow, ice: I.vcIce,
  };
  const glowMats = [];
  const disposables = [];

  function ringGlowMaterial(color, pulse = 1) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: M.uniforms.uTime, uColor: { value: new THREE.Color(color) }, uPulse: { value: pulse } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uPulse; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = abs(vUv.y - 0.5) * 2.0; float core = exp(-d * d * 18.0); float halo = exp(-d * d * 3.0) * 0.45;
          float p = 1.0 + 0.25 * uPulse * sin(uTime * 2.2);
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
  /** Candy torus: stripes spiral round the ring (u = metres × k around). */
  function candyTorus(b, R, tube, matrix, seg = 24, k = 14) {
    const g = new THREE.TorusGeometry(R, tube, 6, seg);
    candyUv(g, Math.PI * 2 * R, k);
    b.add('candy', g, null, matrix, true);
  }
  /** Candy cylinder (stripes spiral up): v = metres × k along the height. */
  function candyCylinder(b, r0, r1, h, matrix, seg = 8, k = 10) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, true);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * h * k, uv.getX(i));
    b.add('candy', g, null, matrix, true);
  }
  /** Ribbon bow (two loops + tails + knot) of size s, facing +Z, centred at the knot. */
  function bow(b, Mx, s, color = RED) {
    for (const sx of [-1, 1]) {
      b.add('gloss', new THREE.TorusGeometry(s, s * 0.3, 5, 12), color, Mx.clone().multiply(mat(sx * s * 0.95, 0, 0, 0, 0, 0, [1, 0.62, 0.45])));
      b.add('gloss', new THREE.BoxGeometry(s * 0.45, s * 1.5, s * 0.08), color, Mx.clone().multiply(mat(sx * s * 0.45, -s * 1.0, 0.005, 0, 0, sx * 0.35)));
    }
    b.add('metal', new THREE.SphereGeometry(s * 0.34, 8, 6), GOLD, Mx);
  }

  // ---------------- windmill: gingerbread mill, candy-cane sails, wreath ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets();
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    // gingerbread footing either side of the tunnel
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 8 });
      eg.rotateX(-Math.PI / 2);
      b.add('vc', eg, GINGER2);
    }
    // tapered gingerbread body above the tunnel
    const top = R * 0.76;
    b.add('vc', new THREE.CylinderGeometry(top, R, H - th, 14), GINGER, mat(0, th + (H - th) / 2, 0));
    b.add('vc', new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.04, 14), GINGER2, mat(0, th + 0.02, 0));
    // icing: wavy bands (rings of dots) and vertical piping
    const rAt = (y) => R - (R - top) * ((y - th) / (H - th));
    for (const fy of [0.08, 0.5, 0.97]) {
      const y = th + (H - th) * fy, rr = rAt(y) + 0.008;
      b.add('snow', new THREE.TorusGeometry(rr, 0.013, 4, 24), ICING, mat(0, y, 0, Math.PI / 2, 0, 0));
      for (let i = 0; i < 9; i++) {
        const a = (i + 0.5) / 9 * Math.PI * 2;
        b.add('snow', new THREE.OctahedronGeometry(0.017, 0), ICING, mat(Math.sin(a) * rr, y - 0.022, Math.cos(a) * rr));
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const y0 = th + 0.05, y1 = H - 0.05, rr0 = rAt(y0) + 0.004, rr1 = rAt(y1) + 0.004;
      const len = Math.hypot(y1 - y0, rr0 - rr1);
      b.add('snow', new THREE.BoxGeometry(0.014, len, 0.01), ICING, mat(Math.sin(a) * (rr0 + rr1) / 2, (y0 + y1) / 2, Math.cos(a) * (rr0 + rr1) / 2, 0, a, 0)
        .multiply(new THREE.Matrix4().makeRotationX(-Math.atan2(rr0 - rr1, y1 - y0))));
    }
    // gumdrops round the base
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const x = Math.sin(a) * R * 1.02, z = Math.cos(a) * R * 1.02;
      if (Math.abs(x) < g2 + 0.04) continue;
      b.add('gloss', new THREE.SphereGeometry(0.03, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), [RED, 0x2a9a4a, GOLD, 0x8a3ac8][i % 4], mat(x, th, z));
    }
    // candy-cane arch round the tunnel on both faces
    for (const zs of [1, -1]) {
      const z = zs * (zFace + 0.012);
      for (const xs of [1, -1]) {
        const c = new THREE.LineCurve3(new THREE.Vector3(xs * (g2 + 0.016), 0, z), new THREE.Vector3(xs * (g2 + 0.016), th + 0.005, z));
        const tg = new THREE.TubeGeometry(c, 2, 0.016, 6, false); candyUv(tg, th, 14);
        b.add('candy', tg, null, null, true);
      }
      const c = new THREE.LineCurve3(new THREE.Vector3(-(g2 + 0.03), th + 0.016, z), new THREE.Vector3(g2 + 0.03, th + 0.016, z));
      const tg = new THREE.TubeGeometry(c, 2, 0.016, 6, false); candyUv(tg, gap, 14);
      b.add('candy', tg, null, null, true);
    }
    // windows with icing frames (warm glow), a door-sized one at the back
    for (const [ang, y] of [[0.95, H * 0.48], [-0.95, H * 0.62], [Math.PI, H * 0.5], [Math.PI * 0.6, H * 0.78]]) {
      const rr = rAt(y) + 0.012;
      b.add('win', new THREE.BoxGeometry(0.07, 0.1, 0.02), null, mat(Math.sin(ang) * rr, y, Math.cos(ang) * rr, 0, ang, 0));
      b.add('snow', new THREE.BoxGeometry(0.09, 0.016, 0.026), ICING, mat(Math.sin(ang) * rr, y + 0.056, Math.cos(ang) * rr, 0, ang, 0));
      b.add('snow', new THREE.BoxGeometry(0.09, 0.016, 0.026), ICING, mat(Math.sin(ang) * rr, y - 0.056, Math.cos(ang) * rr, 0, ang, 0));
    }
    // snowy roof: chocolate cone, a thick snow cap, icicle fringe, and a little gold star
    const roofH = H * 0.5;
    b.add('vc', new THREE.ConeGeometry(top * 1.28, roofH, 14), 0x6a3a22, mat(0, H + roofH / 2 - 0.02, 0));
    b.add('snow', new THREE.ConeGeometry(top * 1.0, roofH * 0.62, 14), COLORS.snow, mat(0, H + roofH * 0.69, 0));
    b.add('snow', new THREE.TorusGeometry(top * 1.2, 0.03, 5, 20), COLORS.snow, mat(0, H + 0.0, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, l = 0.05 + ((i * 7) % 5) * 0.012;
      b.add('ice', new THREE.ConeGeometry(0.011, l, 4), COLORS.ice, mat(Math.sin(a) * top * 1.24, H - 0.02 - l / 2, Math.cos(a) * top * 1.24, Math.PI, 0, 0));
    }
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.024 : 0.055; if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.014, bevelEnabled: false }); sg.translate(0, 0, -0.007);
    b.add('star', sg, null, mat(0, H + roofH + 0.04, 0));
    // wreath on the face between the tunnel and the hub (behind the sails)
    const wy = Math.min(hub - 0.12, th + (hub - th) * 0.45);
    if (wy > th + 0.06) wreath(b, mat(0, wy, rAt(wy) + 0.02), Math.min(0.07, (hub - th) * 0.22), 12);
    // hub housing
    b.add('vc', new THREE.BoxGeometry(0.16, 0.16, 0.12), GINGER2, mat(0, hub, rAt(hub) - 0.02));
    const object = new THREE.Group(); object.name = 'frost.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: peppermint hub + candy-cane spars + red/white striped sails. Blade k along +Y rotated 2πk/n;
    // sail on x ∈ [0.018, 0.018 + BW], radius 0.06 → BL, within ±0.022 in Z (matches the physics box).
    const rotor = new THREE.Group(); rotor.name = 'frost.windmill.rotor';
    const rb = new Buckets();
    for (let k = 0; k < 8; k++) {
      rb.add('gloss', new THREE.CylinderGeometry(0.07, 0.07, 0.04, 4, 1, false, (k / 8) * Math.PI * 2, Math.PI / 4), k % 2 ? RED : ICING, mat(0, 0, 0.02, Math.PI / 2, 0, 0));
    }
    rb.add('metal', new THREE.TorusGeometry(0.07, 0.008, 4, 20), GOLD, mat(0, 0, 0.04));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z, rz = 0) => M2.clone().multiply(mat(x, y, z, 0, 0, rz));
      // spar: a candy-cane stick on the radial line
      const sc = new THREE.LineCurve3(new THREE.Vector3(0, 0.03, -0.006), new THREE.Vector3(0, BL + 0.02, -0.006));
      const sg2 = new THREE.TubeGeometry(sc, 2, 0.016, 6, false); candyUv(sg2, BL, 14);
      rb.add('candy', sg2, null, M2.clone(), true);
      // sail: alternating red / white slats in a gold frame
      const sailL = BL - 0.06, nS = 6;
      for (let k = 0; k < nS; k++) {
        const y = 0.06 + (k + 0.5) / nS * sailL;
        rb.add('gloss', new THREE.BoxGeometry(BW, sailL / nS * 0.98, 0.012), k % 2 ? ICING : RED, at(0.018 + BW / 2, y, -0.004));
      }
      rb.add('metal', new THREE.BoxGeometry(0.012, sailL, 0.02), GOLD, at(BW + 0.012, 0.06 + sailL / 2, 0.004));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.012, 0.02), GOLD, at(0.018 + BW / 2, BL - 0.006, 0.004));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.01, 0.02), GOLD, at(0.018 + BW / 2, 0.065, 0.004));
      // fairy lights along the sail's outer edge
      for (let k = 0; k < 4; k++) {
        rb.add(k % 2 ? 'bulbA' : 'bulbB', new THREE.OctahedronGeometry(0.013, 0), BULB_COLS[(i + k) % BULB_COLS.length], at(BW + 0.012, 0.12 + k / 3 * (sailL - 0.12), 0.018));
      }
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: candy-cane hoop with fairy lights and a bow ----------------
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
    // candy-cane rails on the track edges
    for (const s of [-1, 1]) {
      const c = new Helix(R, S, 0.04, s * (W / 2 + 0.014));
      const g = new THREE.TubeGeometry(c, 64, 0.02, 5, false);
      candyUv(g, c.getLength(), 10);
      b.add('candy', g, null, null, true);
    }
    // candy-striped band behind the track (uv: u = metres × 8 along, v across)
    const pos = [], nor = [], uvs = [], idx = [];
    const BWd = W / 2 + 0.05, out = 0.05, N = 96;
    let acc = 0, prev = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = t * Math.PI * 2, r = R + out;
      const cx = loopX(S, t), cy = R - r * Math.cos(a), cz = r * Math.sin(a);
      if (prev) acc += Math.hypot(cx - prev[0], cy - prev[1], cz - prev[2]);
      prev = [cx, cy, cz];
      for (const e of [-1, 1]) { pos.push(cx + e * BWd, cy, cz); nor.push(0, -Math.cos(a), Math.sin(a)); uvs.push(acc * 8, (e + 1) / 2); }
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    band.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    band.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    band.setIndex(idx);
    b.add('candy', band, null, null, true);
    // snowy edges of the band (white piping) + fairy lights along both outer edges
    for (const e of [-1, 1]) {
      b.add('snow', new THREE.TubeGeometry(new Helix(R, S, -out - 0.004, e * BWd), 56, 0.012, 3, false), ICING, null);
      const nB = 26;
      for (let i = 1; i < nB; i++) {
        const t = i / nB, a = t * Math.PI * 2, r = R + out + 0.016;
        b.add(i % 2 ? 'bulbA' : 'bulbB', new THREE.OctahedronGeometry(0.015, 0), BULB_COLS[(i + (e > 0 ? 2 : 0)) % BULB_COLS.length],
          mat(loopX(S, t) + e * (BWd + 0.006), R - r * Math.cos(a), r * Math.sin(a)));
      }
    }
    // a big red bow crowning the top, facing the approaching ball (-Z)
    bow(b, mat(S * 0.5, 2 * R + out + 0.06, 0, 0, Math.PI, 0), Math.min(0.06, R * 0.14));
    const object = new THREE.Group(); object.name = 'frost.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: frosted ice glass with snow rings and a bow ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'frost.tube';
    const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r * 1.02, M.quality === 'low' ? 10 : 14, false), I.glass);
    glass.renderOrder = 4;
    object.add(glass);
    const b = new Buckets();
    const nRings = Math.max(2, Math.floor(len / 0.32));
    const q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i <= nRings; i++) {
      const t = i / nRings;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      q.setFromUnitVectors(Z, tg);
      const end = i === 0 || i === nRings;
      m4.compose(p, q, new THREE.Vector3(1, 1, 1));
      if (end) candyTorus(b, r * 1.12, 0.026, m4.clone(), 24, 14);
      else b.add('snow', new THREE.TorusGeometry(r * 1.04, 0.009, 4, 18), ICING, m4.clone());
    }
    // red bow on top of the entry collar, and frost lumps along the top
    {
      const p = curve.getPointAt(0), tg = curve.getTangentAt(0);
      const side = new THREE.Vector3().crossVectors(tg, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); else side.normalize();
      const upv = new THREE.Vector3().crossVectors(side, tg).normalize();
      const Mb = new THREE.Matrix4().makeBasis(side, upv, tg.clone().negate()).setPosition(p.clone().addScaledVector(upv, r * 1.12 + 0.03));
      bow(b, Mb, 0.05);
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: red with a white snowflake on a candy-cane pole ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'frost.flag';
    const b = new Buckets();
    candyCylinder(b, 0.012, 0.014, H, mat(0, H / 2, 0), 8, 6);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.018 : 0.042; if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.012, bevelEnabled: false }); sg.translate(0, 0, -0.006);
    b.add('star', sg, null, mat(0, H + 0.035, 0, 0, Math.PI / 2, 0));
    b.add('metal', new THREE.CylinderGeometry(0.017, 0.017, 0.03, 8), GOLD, mat(0, H - 0.27, 0));
    b.build(mats, object, { castShadow: true });
    const FW = 0.36, FH = 0.24;
    const cloth = new THREE.PlaneGeometry(FW, FH, 12, 5);
    cloth.translate(FW / 2 + 0.012, H - FH / 2 - 0.04, 0);
    const base = Float32Array.from(cloth.attributes.position.array);
    const flagMesh = new THREE.Mesh(cloth, M.materials.flag);
    flagMesh.castShadow = true;
    object.add(flagMesh);
    const pos = cloth.attributes.position;
    return {
      object,
      update(dt, t) {
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3] - 0.012;
          const k = x / FW;
          pos.setZ(i, Math.sin(x * 14 - t * 4.5) * 0.028 * k + Math.sin(x * 6 - t * 2.1) * 0.014 * k);
          pos.setY(i, base[i * 3 + 1] - k * k * 0.02);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup: a spinning candy cane with a soft glow ----------------
  const pickGeo = (() => {
    const b = new Buckets();
    candyCane(b, mat(-0.025, -0.075, 0), 0.15, 0.013, 14);
    const g = new THREE.Group();
    b.build(mats, g);
    return g;
  })();
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0xff8a90, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  pickGeo.traverse(o => { if (o.geometry) disposables.push(o.geometry); });
  function pickup() {
    const object = new THREE.Group(); object.name = 'frost.pickup';
    const spin = new THREE.Group();
    const body = pickGeo.clone();
    body.traverse(o => { if (o.isMesh) o.castShadow = true; });
    spin.add(body);
    const glow = new THREE.Sprite(sparkMat);
    glow.scale.set(0.3, 0.3, 1);
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
        const s = 0.26 + Math.sin(t * 4.1 + phase) * 0.03;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: a snowman whose bottom snowball fills the collider ----------------
  function bumper(o = {}) {
    const r = o.radius ?? 0.1;
    const b = new Buckets();
    snowman(b, mat(0, 0, 0), r * 1.04 / 0.24, { detail: 1 });
    b.add('snow', new THREE.CylinderGeometry(r * 1.05, r * 1.1, 0.03, 20), COLORS.snow, mat(0, 0.015, 0));   // snow skirt
    const object = new THREE.Group(); object.name = 'frost.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: red/gold disc with a glowing snowflake ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'frost.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, 48), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = Math.PI / 2;   // one flake arm points up the fairway
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets();
    b.add('metal', new THREE.TorusGeometry(R * 0.99, Math.min(0.018, R * 0.05), 5, 48), GOLD, mat(0, 0.006, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      b.add(i % 2 ? 'bulbA' : 'bulbB', new THREE.OctahedronGeometry(Math.min(0.014, R * 0.045), 0), BULB_COLS[i % BULB_COLS.length], mat(Math.cos(a) * R * 0.99, 0.02, Math.sin(a) * R * 0.99));
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.8, R * 0.92, 48), ringGlowMaterial(0xffd27a, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover: a big present filling the w×h×d box ----------------
  let moverN = 0;
  const MOVER_COLS = [[RED, GOLD], [0x1f8a46, 0xf4f4f4], [0x2a5ad0, GOLD]];
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const [c, rb] = MOVER_COLS[moverN++ % MOVER_COLS.length];
    const b = new Buckets();
    present(b, mat(0, 0, 0), w, h, d, c, rb);
    // snow on the lid and a sprig of holly
    b.add('snow', new THREE.BoxGeometry(w * 0.4, 0.012, d * 0.5), COLORS.snow, mat(-w * 0.25, h + 0.006, d * 0.1));
    for (const [x, cc] of [[0.18, 0x1f8a46], [0.24, RED], [0.21, RED]]) b.add('gloss', new THREE.SphereGeometry(0.013, 5, 4), cc, mat(w * x, h + 0.012, -d * 0.2 + x * 0.1));
    const object = new THREE.Group(); object.name = 'frost.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
