// Candy Land theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as the other themes).
import * as THREE from 'three';
import { Buckets, mat } from './util.js';
import { gumdrop, gumStud, wrappedSweet, chocolateBar, scaleUv, COLORS, POP_COLS, GUM_COLS, SPRINK } from './props.js';

const CHOC = 0x5a2e1a, CHOC2 = 0x7a4428, ICING = 0xfffafc, PINK = 0xff7ab4, HOT = 0xff4f9a, CREAM = 0xfff1dc;

export function createSkins(M) {
  const I = M.internal;
  const mats = {
    vc: I.vc, gloss: I.vcGloss, frost: I.vcFrost, sugar: I.vcSugar, metal: I.vcMetal, candy: I.candy, swirl: I.swirl,
    rainbow: I.rainbow, win: I.windowGlow, cherry: I.cherryGlow,
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
          gl_FragColor = vec4(uColor * (core * 1.2 + halo) * p, 1.0); }`,
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
  /** Candy-striped tube along a curve (u = metres × k along). */
  function candyTubeGeo(curve, segs, radius, radial = 6, k = 10) {
    const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
    return scaleUv(g, curve.getLength() * k, 1);
  }
  function candyTorus(b, R, tube, matrix, seg = 24, k = 14) {
    const g = new THREE.TorusGeometry(R, tube, 6, seg);
    scaleUv(g, Math.PI * 2 * R * k, 1);
    b.add('candy', g, null, matrix, true);
  }

  // ---------------- windmill: a cupcake mill with a cherry, lollipop hub, wafer sails ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets();
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    // chocolate-cookie footing either side of the tunnel
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 8 });
      eg.rotateX(-Math.PI / 2);
      b.add('gloss', eg, CHOC, null);
    }
    b.add('frost', new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.03, 20), CREAM, mat(0, th + 0.015, 0));
    // fluted liner (flares outward) and a sponge rim
    const linerH = (H - th) * 0.55, seg = 18;
    const liner = new THREE.CylinderGeometry(R * 1.04, R * 0.94, linerH, seg, 1, false);
    const lp = liner.attributes.position;
    for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), z = lp.getZ(i), a = Math.atan2(z, x), k = 1 + 0.05 * Math.cos(a * seg / 2); lp.setX(i, x * k); lp.setZ(i, z * k); }
    liner.computeVertexNormals();
    b.add('gloss', liner, HOT, mat(0, th + 0.03 + linerH / 2, 0));
    const yTop = th + 0.03 + linerH;
    b.add('gloss', new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.05, seg), COLORS.sponge, mat(0, yTop + 0.02, 0));
    // round windows with icing frames on the liner
    for (const [ang, fy] of [[0.95, 0.5], [-0.95, 0.5], [Math.PI, 0.45], [Math.PI * 0.6, 0.55]]) {
      const y = th + 0.03 + linerH * fy, rr = R * 0.99 + 0.012;
      b.add('win', new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), null, mat(Math.sin(ang) * rr, y, Math.cos(ang) * rr, 0, ang, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      b.add('frost', new THREE.TorusGeometry(0.05, 0.011, 3, 12), ICING, mat(Math.sin(ang) * (rr + 0.004), y, Math.cos(ang) * (rr + 0.004), 0, ang, 0));
    }
    // frosting swirl: stacked tori up to H, then a tip and a cherry
    let y = yTop + 0.06;
    const tiers = 4, swirlH = H - y;
    for (let i = 0; i < tiers; i++) {
      const k = 1 - i / tiers, rr = R * (0.92 * k + 0.12), t = Math.max(0.03, swirlH / tiers * 0.55);
      b.add('frost', new THREE.TorusGeometry(rr, t, 6, seg), [CREAM, 0xffc0da][i % 2], mat(0, y, 0, Math.PI / 2, 0, i * 0.7));
      y += swirlH / tiers;
    }
    b.add('frost', new THREE.ConeGeometry(R * 0.3, R * 0.5, 10), 0xffc0da, mat(0, y + R * 0.15, 0));
    b.add('gloss', new THREE.SphereGeometry(R * 0.22, 10, 8), COLORS.cherry, mat(0, y + R * 0.55, 0));
    b.add('gloss', new THREE.CylinderGeometry(0.008, 0.01, R * 0.35, 4), 0x5a7a2a, mat(R * 0.05, y + R * 0.85, 0, 0, 0, -0.4));
    // sprinkles on the frosting
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, f = (i % 7) / 7, rr = R * (0.95 - f * 0.7) + 0.02, yy = yTop + 0.08 + f * swirlH * 0.9;
      b.add('gloss', new THREE.BoxGeometry(0.012, 0.012, 0.045), SPRINK[i % SPRINK.length], mat(Math.cos(a) * rr, yy, Math.sin(a) * rr, i, i * 0.7, 0));
    }
    // candy-cane arch round the tunnel on both faces
    for (const zs of [1, -1]) {
      const z = zs * (zFace + 0.012);
      for (const xs of [1, -1]) {
        b.add('candy', candyTubeGeo(new THREE.LineCurve3(new THREE.Vector3(xs * (g2 + 0.016), 0, z), new THREE.Vector3(xs * (g2 + 0.016), th + 0.005, z)), 2, 0.016, 6, 14), null, null, true);
      }
      b.add('candy', candyTubeGeo(new THREE.LineCurve3(new THREE.Vector3(-(g2 + 0.03), th + 0.016, z), new THREE.Vector3(g2 + 0.03, th + 0.016, z)), 2, 0.016, 6, 14), null, null, true);
    }
    // gumdrops round the base
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const x = Math.sin(a) * R * 1.05, z = Math.cos(a) * R * 1.05;
      if (Math.abs(x) < g2 + 0.05) continue;
      gumStud(b, mat(x, 0, z), 0.035, GUM_COLS[i % GUM_COLS.length]);
    }
    // hub housing: a chocolate block
    b.add('gloss', new THREE.BoxGeometry(0.16, 0.16, 0.14), CHOC2, mat(0, hub, R * 0.9));
    const object = new THREE.Group(); object.name = 'candy.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: lollipop hub, candy-striped spars, pastel wafer sails in icing frames. Blade k along +Y rotated 2πk/n;
    // the sail spans x ∈ [0.018, 0.018 + BW], radius 0.06 → BL, within ±0.022 in Z (matches the physics box).
    const rotor = new THREE.Group(); rotor.name = 'candy.windmill.rotor';
    const rb = new Buckets();
    rb.add('swirl', new THREE.CylinderGeometry(0.085, 0.085, 0.035, 24), HOT, mat(0, 0, 0.022, Math.PI / 2, 0, 0), true);
    const SAIL = [0xffb3d1, 0xb8f0d0, 0xfff0a8, 0xc6e8ff, 0xd8c8ff, 0xffd2b0];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z) => M2.clone().multiply(mat(x, y, z));
      rb.add('candy', candyTubeGeo(new THREE.LineCurve3(new THREE.Vector3(0, 0.03, -0.006), new THREE.Vector3(0, BL + 0.02, -0.006)), 2, 0.014, 6, 14), null, M2.clone(), true);
      const sailL = BL - 0.06;
      // wafer sail: the wafer texture is on the 'vc' path? keep it vertex coloured with grooves as slats
      const nS = 5;
      for (let k = 0; k < nS; k++) {
        const yy = 0.06 + (k + 0.5) / nS * sailL;
        rb.add('gloss', new THREE.BoxGeometry(BW * 0.96, sailL / nS * 0.88, 0.014), SAIL[i % SAIL.length], at(0.018 + BW / 2, yy, -0.004));
      }
      rb.add('frost', new THREE.BoxGeometry(0.014, sailL, 0.022), ICING, at(0.018 + BW - 0.004, 0.06 + sailL / 2, 0.0));
      rb.add('frost', new THREE.BoxGeometry(BW, 0.014, 0.022), ICING, at(0.018 + BW / 2, BL - 0.007, 0.0));
      rb.add('frost', new THREE.BoxGeometry(BW, 0.012, 0.022), ICING, at(0.018 + BW / 2, 0.066, 0.0));
      // a gumdrop on the sail tip corner
      rb.add('gloss', new THREE.SphereGeometry(0.018, 6, 4), GUM_COLS[i % GUM_COLS.length], at(0.018 + BW - 0.004, BL - 0.004, 0.012));
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: a rainbow sour-belt hoop with candy rails and gumdrop studs ----------------
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
      const c = new Helix(R, S, 0.04, s * (W / 2 + 0.014));
      b.add('candy', candyTubeGeo(c, 48, 0.02, 5, 10), null, null, true);
    }
    // rainbow band behind the track (uv: u = metres along, v 0..1 across = the colour stripes)
    const pos = [], nor = [], uvs = [], idx = [];
    const BWd = W / 2 + 0.05, out = 0.05, N = 96;
    let acc = 0, prev = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = t * Math.PI * 2, r = R + out;
      const cx = loopX(S, t), cy = R - r * Math.cos(a), cz = r * Math.sin(a);
      if (prev) acc += Math.hypot(cx - prev[0], cy - prev[1], cz - prev[2]);
      prev = [cx, cy, cz];
      for (const e of [-1, 1]) { pos.push(cx + e * BWd, cy, cz); nor.push(0, -Math.cos(a), Math.sin(a)); uvs.push(acc, (e + 1) / 2); }
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const band = new THREE.BufferGeometry();
    band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    band.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    band.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    band.setIndex(idx);
    b.add('rainbow', band, null, null, true);
    // icing piping on the band edges + gumdrop studs along both outer edges
    for (const e of [-1, 1]) {
      b.add('frost', new THREE.TubeGeometry(new Helix(R, S, -out - 0.004, e * BWd), 48, 0.014, 3, false), ICING, null);
      const nB = 18;
      for (let i = 1; i < nB; i++) {
        const t = i / nB, a = t * Math.PI * 2, r = R + out + 0.012;
        const Mx = mat(loopX(S, t) + e * (BWd + 0.004), R - r * Math.cos(a), r * Math.sin(a), a, 0, 0);
        gumStud(b, Mx, 0.026, GUM_COLS[(i + (e > 0 ? 3 : 0)) % GUM_COLS.length]);
      }
    }
    // a big swirl lollipop crowning the top, facing the approaching ball (-Z)
    const top = 2 * R + out + 0.02;
    b.add('frost', new THREE.CylinderGeometry(0.01, 0.012, 0.16, 6), COLORS.stick, mat(S * 0.5, top + 0.08, 0));
    b.add('swirl', new THREE.CylinderGeometry(0.11, 0.11, 0.035, 24), HOT, mat(S * 0.5, top + 0.2, 0, Math.PI / 2, 0, 0), true);
    const object = new THREE.Group(); object.name = 'candy.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: pink hard-candy glass with icing rings and candy collars ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'candy.tube';
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
      else b.add('frost', new THREE.TorusGeometry(r * 1.04, 0.009, 3, 16), i % 2 ? ICING : 0xffc0da, m4.clone());
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: polka-dot pink cloth on a candy-striped pole with a gumball ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'candy.flag';
    const b = new Buckets();
    const pole = new THREE.CylinderGeometry(0.012, 0.014, H, 8, 1, true);
    scaleUv(pole, 1, H * 6);
    b.add('candy', pole, null, mat(0, H / 2, 0), true);
    b.add('gloss', new THREE.SphereGeometry(0.03, 12, 8), 0xffd23f, mat(0, H + 0.025, 0));
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

  // ---------------- pickup: a spinning wrapped sweet with a soft pink glow ----------------
  const pickGeos = POP_COLS.slice(0, 4).map((c, k) => {
    const b = new Buckets();
    wrappedSweet(b, mat(0, 0, 0), 0.1, c, [0xffffff, 0xffe36e, 0xffffff, 0xff9ec7][k]);
    const g = new THREE.Group();
    b.build(mats, g);
    g.traverse(o => { if (o.geometry) disposables.push(o.geometry); });
    return g;
  });
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0xff8ac4, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  let pickN = 0;
  function pickup() {
    const object = new THREE.Group(); object.name = 'candy.pickup';
    const spin = new THREE.Group();
    const body = pickGeos[pickN++ % pickGeos.length].clone();
    body.rotation.z = 0.35;
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
        spin.rotation.y = t * 1.8 + phase;
        const s = 0.26 + Math.sin(t * 4.1 + phase) * 0.03;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: a giant sugared gumdrop that fills the collider ----------------
  let bumpN = 0;
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = o.height ?? 0.2;
    const b = new Buckets();
    const c = GUM_COLS[bumpN++ % GUM_COLS.length];
    gumdrop(b, mat(0, 0, 0, 0, 0, 0, [r * 1.03, Math.max(h, r * 1.1) / 1.15, r * 1.03]), 1, c);
    b.add('frost', new THREE.TorusGeometry(r * 1.02, 0.012, 4, 24), ICING, mat(0, 0.01, 0, Math.PI / 2, 0, 0));
    const object = new THREE.Group(); object.name = 'candy.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: a pink-iced cookie with a glowing star ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'candy.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, 48), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = Math.PI;   // the star's top point (texture +v) faces back toward the tee, behind the ball
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets();
    b.add('frost', new THREE.TorusGeometry(R * 0.99, Math.min(0.016, R * 0.05), 5, 48), ICING, mat(0, 0.006, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      gumStud(b, mat(Math.cos(a) * R * 0.99, 0.004, Math.sin(a) * R * 0.99), Math.min(0.022, R * 0.07), GUM_COLS[i % GUM_COLS.length]);
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.8, R * 0.92, 48), ringGlowMaterial(0xff8ac4, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover: a chocolate bar filling the w×h×d box ----------------
  let moverN = 0;
  const SLEEVES = [HOT, 0x4cc9f0, 0xffb02e];
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const b = new Buckets();
    chocolateBar(b, mat(0, 0, 0), w, h, d, SLEEVES[moverN++ % SLEEVES.length]);
    const object = new THREE.Group(); object.name = 'candy.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}

export { PINK };
