// Sunken Reef theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as the other themes).
import * as THREE from 'three';
import { Buckets, mat } from './util.js';
import { COLORS } from './props.js';

const STONE = COLORS.stone, STONE2 = COLORS.stone2, STONE3 = COLORS.stone3, MOSS = COLORS.moss;
const BRONZE = COLORS.bronze, BRONZE2 = COLORS.bronze2, WOOD = COLORS.wood, WOOD2 = COLORS.wood2, WOOD3 = COLORS.wood3;
const CORAL = [0xff7a8a, 0xffa050, 0xc080e0, 0xf0d060];
const GLOW = 0x7af0e0, GLOW2 = 0xff7ac0;

export function createSkins(M) {
  const I = M.internal;
  const mats = {
    vc: I.vc, stone: I.vcStone, gloss: I.vcGloss, metal: I.vcMetal, glow: I.glow, win: I.windowGlow,
    band: I.band, gem: I.gemGlow, wood: I.vcWood, coral: I.vc,
  };
  const glowMats = [];
  const disposables = [];
  const lo = M.quality === 'low';

  function ringGlowMaterial(color, pulse = 1) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: M.uniforms.uTime, uColor: { value: new THREE.Color(color) }, uPulse: { value: pulse } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uPulse; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = abs(vUv.y - 0.5) * 2.0; float core = exp(-d * d * 18.0); float halo = exp(-d * d * 3.0) * 0.45;
          float p = 1.0 + 0.25 * uPulse * sin(uTime * 1.6);
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
  // barnacles / coral knobs: small half-spheres round a ring
  const knobRing = (b, R, y, n, rr = 0.012, key = 'gloss', colors = [0xd8d0c0, 0xc8c0b0]) => {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + (i % 3) * 0.13;
      b.add(key, new THREE.SphereGeometry(rr * (0.7 + (i % 3) * 0.2), 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), colors[i % colors.length],
        mat(Math.sin(a) * R, y + ((i * 7) % 5) * rr * 0.3, Math.cos(a) * R, 0, a, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    }
  };

  // ---------------- windmill: an old temple water-mill tower with a wooden paddle wheel ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets();
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    const seg = lo ? 8 : 12;
    // stone footing either side of the tunnel
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R * 1.04, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R * 1.04, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 6 });
      eg.rotateX(-Math.PI / 2);
      b.add('stone', eg, STONE2, null);
    }
    // a carved stone course over the tunnel line, mossy
    b.add('stone', new THREE.CylinderGeometry(R * 1.06, R * 1.06, 0.04, seg * 2), STONE3, mat(0, th + 0.02, 0));
    b.add('vc', new THREE.CylinderGeometry(R * 1.07, R * 1.07, 0.015, seg * 2, 1, true), MOSS, mat(0, th + 0.04, 0));
    // the tower: a tapering sandstone drum in courses, a moss band and coral crust low down
    const bodyH = (H - th) * 0.64;
    for (let k = 0; k < 4; k++) {
      const h = bodyH / 4, f0 = k / 4, f1 = (k + 1) / 4;
      b.add('stone', new THREE.CylinderGeometry(R * (1 - f1 * 0.12), R * (1 - f0 * 0.12), h * 0.98, seg), k % 2 ? STONE : STONE2, mat(0, th + 0.04 + h * (k + 0.5), 0));
    }
    knobRing(b, R * 0.985, th + 0.08, lo ? 8 : 16, 0.03, 'vc', CORAL);
    const yTop = th + 0.04 + bodyH;
    // arched windows glowing faintly on the sides (not on the rotor face)
    for (const ang of [Math.PI * 0.5, -Math.PI * 0.5, Math.PI]) {
      const y = th + 0.04 + bodyH * 0.55, rr = R * 0.93;
      b.add('glow', new THREE.BoxGeometry(0.09, 0.12, 0.02), GLOW, mat(Math.sin(ang) * rr, y, Math.cos(ang) * rr, 0, ang, 0));
      b.add('glow', new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8, 1, false, 0, Math.PI), GLOW, mat(Math.sin(ang) * rr, y + 0.06, Math.cos(ang) * rr, 0, ang, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
    }
    // a domed cap with a conch shell spire
    b.add('stone', new THREE.SphereGeometry(R * 0.9, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2), STONE, mat(0, yTop, 0, 0, 0, 0, [1, 0.5, 1]));
    b.add('metal', new THREE.TorusGeometry(R * 0.9, 0.018, 4, seg * 2), BRONZE, mat(0, yTop, 0, Math.PI / 2, 0, 0));
    const chH = Math.max(0.15, H - yTop - R * 0.2);
    {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(R * 0.22 * Math.pow(1 - t, 0.8) * (1 + 0.15 * Math.sin(t * 18)), t * (chH + R * 0.35))); }
      b.add('vc', new THREE.LatheGeometry(pts, lo ? 6 : 8), 0xf0d8c8, mat(0, yTop + R * 0.3, 0));
    }
    // stone-framed tunnel arch on both faces with a glowing keystone pearl
    for (const zs of [1, -1]) {
      const z = zs * (zFace + 0.014);
      for (const xs of [1, -1]) b.add('stone', new THREE.BoxGeometry(0.035, th + 0.02, 0.035), STONE3, mat(xs * (g2 + 0.017), (th + 0.02) / 2, z));
      b.add('stone', new THREE.BoxGeometry(gap + 0.09, 0.04, 0.04), STONE3, mat(0, th + 0.02, z));
      b.add('glow', new THREE.SphereGeometry(0.022, 8, 5), GLOW, mat(0, th + 0.06, z + zs * 0.012));
    }
    // hub housing: a bronze boss facing the incoming ball
    b.add('metal', new THREE.BoxGeometry(0.17, 0.17, 0.14), BRONZE2, mat(0, hub, R * 0.86));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.add('metal', new THREE.SphereGeometry(0.018, 5, 3), BRONZE, mat(sx * 0.075, hub + sy * 0.075, R * 0.93));
    const object = new THREE.Group(); object.name = 'reef.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: a bronze hub with a glowing pearl, wooden spars, planked paddles in bronze frames, barnacles.
    // Blade k along +Y rotated 2πk/n; the paddle spans x ∈ [0.018, 0.018 + BW], radius 0.06 → BL, within ±0.022 in Z.
    const rotor = new THREE.Group(); rotor.name = 'reef.windmill.rotor';
    const rb = new Buckets();
    rb.add('metal', new THREE.CylinderGeometry(0.085, 0.085, 0.035, 16), BRONZE, mat(0, 0, 0.018, Math.PI / 2, 0, 0));
    rb.add('glow', new THREE.SphereGeometry(0.04, 10, 6), 0xf0f8ff, mat(0, 0, 0.036, 0, 0, 0, [1, 1, 0.5]));
    const PL = [WOOD, WOOD3, WOOD2];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z) => M2.clone().multiply(mat(x, y, z));
      rb.add('wood', new THREE.BoxGeometry(0.026, BL - 0.01, 0.026), WOOD2, at(0, 0.03 + (BL - 0.01) / 2, -0.004));
      const sailL = BL - 0.06;
      const nS = 3;
      for (let k = 0; k < nS; k++) {
        // planks run across the paddle; a little gap between them
        const yy = 0.06 + (k + 0.5) / nS * sailL;
        rb.add('wood', new THREE.BoxGeometry(BW * 0.96, sailL / nS * 0.88, 0.016), PL[(i + k) % PL.length], at(0.018 + BW / 2, yy, -0.004));
      }
      rb.add('metal', new THREE.BoxGeometry(0.014, sailL, 0.022), BRONZE, at(0.018 + BW - 0.004, 0.06 + sailL / 2, 0.0));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.014, 0.022), BRONZE, at(0.018 + BW / 2, BL - 0.007, 0.0));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.012, 0.022), BRONZE2, at(0.018 + BW / 2, 0.066, 0.0));
      // a few barnacles on the paddle face, a starfish clinging near the tip on every other blade
      for (let k = 0; k < (lo ? 1 : 3); k++) rb.add('vc', new THREE.SphereGeometry(0.012, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8d0c0,
        at(0.018 + BW * (0.25 + 0.25 * k), 0.06 + sailL * (0.3 + 0.2 * ((k * 5 + i) % 3)), 0.006).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      if (i % 2 === 0) for (let s = 0; s < 5; s++) {
        const g = new THREE.ConeGeometry(0.008, 0.035, 3); g.rotateZ(-Math.PI / 2); g.translate(0.0175, 0, 0);
        rb.add('vc', g, 0xf07050, at(0.018 + BW * 0.7, BL - 0.07, 0.012).multiply(new THREE.Matrix4().makeRotationZ(s / 5 * Math.PI * 2)));
      }
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: a ship's-rib hoop of barnacled planks, bronze rails, coral knobs, a clam on top ----------------
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
      b.add('metal', new THREE.TubeGeometry(c, lo ? 40 : 56, 0.018, 5, false), BRONZE, null);
    }
    // plank band behind the track (uv: u = metres along, v 0..1 across; a glow seam down the middle)
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
    b.add('band', band, null, null, true);
    // bronze edge piping and coral knobs along both outer edges
    for (const e of [-1, 1]) {
      b.add('metal', new THREE.TubeGeometry(new Helix(R, S, -out - 0.004, e * BWd), 48, 0.013, 3, false), BRONZE2, null);
      const nB = lo ? 12 : 20;
      for (let i = 1; i < nB; i++) {
        const t = i / nB, a = t * Math.PI * 2, r = R + out + 0.012;
        const Mx = mat(loopX(S, t) + e * (BWd + 0.004), R - r * Math.cos(a), r * Math.sin(a), a, 0, 0);
        b.add('vc', new THREE.SphereGeometry(0.022 + (i % 3) * 0.006, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), CORAL[(i + (e > 0 ? 1 : 0)) % CORAL.length], Mx);
      }
    }
    // a giant clam crowning the top, a glowing pearl in it
    const top = 2 * R + out + 0.02;
    const shell = (up) => { const g = new THREE.SphereGeometry(0.13, lo ? 8 : 12, 4, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.4, 0.8); if (!up) g.rotateX(Math.PI); return g; };
    b.add('gloss', shell(false), 0xd8b8b0, mat(S * 0.5, top + 0.05, 0));
    b.add('gloss', shell(true), 0xf0dcd0, mat(S * 0.5, top + 0.06, -0.09, -0.7, 0, 0).multiply(mat(0, 0, 0.09)));
    b.add('glow', new THREE.SphereGeometry(0.03, 8, 6), 0xf8f4ff, mat(S * 0.5, top + 0.07, 0.01));
    const object = new THREE.Group(); object.name = 'reef.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: aqua sea glass with bronze rings and coral-crusted collars ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'reef.tube';
    const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r * 1.02, lo ? 10 : 14, false), I.glass);
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
      if (end) {
        b.add('stone', new THREE.TorusGeometry(r * 1.14, 0.032, 6, 20), STONE2, m4.clone());
        for (let k = 0; k < (lo ? 3 : 6); k++) {
          const a = k / (lo ? 3 : 6) * Math.PI * 2;
          b.add('vc', new THREE.SphereGeometry(0.02, 5, 3), CORAL[k % CORAL.length], m4.clone().multiply(mat(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, 0)));
        }
      } else b.add('metal', new THREE.TorusGeometry(r * 1.04, 0.009, 3, 16), i % 2 ? BRONZE : BRONZE2, m4.clone());
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: a tattered sail on a wooden mast with bronze bands and a glowing pearl ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'reef.flag';
    const b = new Buckets();
    b.add('wood', new THREE.CylinderGeometry(0.012, 0.015, H, 8, 1, true), WOOD2, mat(0, H / 2, 0));
    for (const f of [0.3, 0.6]) b.add('metal', new THREE.CylinderGeometry(0.017, 0.017, 0.02, 8), BRONZE, mat(0, H * f, 0));
    b.add('metal', new THREE.CylinderGeometry(0.02, 0.014, 0.03, 8), BRONZE, mat(0, H + 0.005, 0));
    b.add('gem', new THREE.SphereGeometry(0.03, 10, 6), null, mat(0, H + 0.045, 0));
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
          // the current: a slow, heavy undulation, the fly lifting a little
          pos.setZ(i, Math.sin(x * 9 - t * 1.6) * 0.03 * k + Math.sin(x * 4 - t * 0.8) * 0.016 * k);
          pos.setY(i, base[i * 3 + 1] + Math.sin(t * 0.9 + x * 6) * 0.01 * k);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup: a spinning, bobbing pearl in a scallop shell with a glow ----------------
  const pearlCols = [0xf8f4ff, 0xffd8ec, 0xb8fff4];
  const pickGeos = pearlCols.map((c) => {
    const b = new Buckets();
    b.add('glow', new THREE.SphereGeometry(0.045, 12, 8), c, mat(0, 0.012, 0));
    // the scallop: a fan of ribs below the pearl
    for (let i = 0; i < 7; i++) {
      const a = -1.0 + 2.0 * i / 6;
      b.add('gloss', new THREE.ConeGeometry(0.018, 0.08, 4), i % 2 ? 0xf0c8c0 : 0xffe0d8, mat(Math.sin(a) * 0.035, -0.03, Math.cos(a) * 0.035 - 0.02, Math.PI / 2 - 0.5, a, 0));
    }
    b.add('gloss', new THREE.TorusGeometry(0.055, 0.006, 4, 14), 0xffe8e0, mat(0, -0.015, 0, Math.PI / 2, 0, 0));
    const g = new THREE.Group();
    b.build(mats, g);
    g.traverse(x => { if (x.geometry) disposables.push(x.geometry); });
    return g;
  });
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0x9ff8f0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  let pickN = 0;
  function pickup() {
    const object = new THREE.Group(); object.name = 'reef.pickup';
    const spin = new THREE.Group();
    const body = pickGeos[pickN++ % pickGeos.length].clone();
    body.traverse(x => { if (x.isMesh) x.castShadow = true; });
    spin.add(body);
    const glow = new THREE.Sprite(sparkMat);
    glow.scale.set(0.3, 0.3, 1);
    glow.raycast = () => {};   // the engine's camera-occlusion raycast has no camera set → Sprite.raycast throws
    spin.add(glow);
    spin.position.y = 0.11;
    object.add(spin);
    object.traverse(x => { x.userData.noOcclude = true; });
    const phase = Math.random() * 6.28;
    return {
      object,
      update(dt, t) {
        spin.position.y = 0.11 + Math.sin(t * 1.6 + phase) * 0.025;
        spin.rotation.y = t * 1.4 + phase;
        const s = 0.28 + Math.sin(t * 2.3 + phase) * 0.05;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: a coral-crusted temple column drum with a glowing anemone on top ----------------
  let bumpN = 0;
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = Math.max(o.height ?? 0.2, r * 1.1);
    const b = new Buckets();
    const k = bumpN++;
    const sides = 10, R = r / Math.cos(Math.PI / sides) * 1.01;   // the flat faces sit on the collider radius
    b.add('stone', new THREE.CylinderGeometry(R * 0.97, R, h * 0.84, sides), k % 2 ? STONE : STONE2, mat(0, h * 0.42, 0));
    b.add('stone', new THREE.CylinderGeometry(R * 1.04, R * 1.06, h * 0.1, sides), STONE3, mat(0, h * 0.05, 0));
    knobRing(b, R * 0.99, h * 0.2, lo ? 6 : 10, Math.min(0.018, r * 0.18), 'vc', [CORAL[k % 4], CORAL[(k + 1) % 4]]);
    knobRing(b, R * 0.99, h * 0.55, lo ? 4 : 6, Math.min(0.012, r * 0.12), 'vc');
    b.add('vc', new THREE.CylinderGeometry(R * 0.94, R * 0.97, h * 0.12, sides), MOSS, mat(0, h * 0.9, 0));
    // the anemone's tentacles, glowing
    const nT = lo ? 6 : 10;
    for (let i = 0; i < nT; i++) {
      const a = i / nT * Math.PI * 2, t = 0.55;
      b.add('glow', new THREE.ConeGeometry(R * 0.1, R * 0.55, 4), k % 2 ? GLOW : GLOW2, mat(Math.cos(a) * R * 0.5, h * 0.96 + R * 0.2, Math.sin(a) * R * 0.5, Math.sin(a) * t, 0, -Math.cos(a) * t));
    }
    b.add('glow', new THREE.CylinderGeometry(R * 0.4, R * 0.4, 0.008, 10), 0xffffff, mat(0, h * 0.965, 0));
    const object = new THREE.Group(); object.name = 'reef.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: a temple mosaic disc with a glowing scallop sigil ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'reef.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, 48), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = Math.PI;   // the shell's fan (texture +v) opens back toward the tee, behind the ball
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets();
    b.add('metal', new THREE.TorusGeometry(R * 0.99, Math.min(0.016, R * 0.05), 5, 48), BRONZE, mat(0, 0.006, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      b.add('gloss', new THREE.SphereGeometry(Math.min(0.02, R * 0.06), 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? 0xf0dcd0 : 0xd8b8b0, mat(Math.cos(a) * R * 0.99, 0.004, Math.sin(a) * R * 0.99));
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.8, R * 0.92, 48), ringGlowMaterial(0x50f0e0, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover: a sliding temple block filling the w×h×d box ----------------
  let moverN = 0;
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const b = new Buckets();
    const k = moverN++ % 2;
    b.add('stone', new THREE.BoxGeometry(w, h * 0.86, d), k ? STONE : STONE2, mat(0, h * 0.43, 0));
    b.add('stone', new THREE.BoxGeometry(w * 0.98, h * 0.14, d * 0.98), STONE3, mat(0, h * 0.93, 0));
    // bronze corner straps, a glowing rune line on both long faces, moss on top
    for (const sx of [-1, 1]) b.add('stone', new THREE.BoxGeometry(0.02, h * 1.01, d * 1.02), BRONZE2, mat(sx * (w / 2 - 0.012), h * 0.5, 0));
    for (const sz of [-1, 1]) b.add('glow', new THREE.BoxGeometry(w * 0.7, h * 0.06, 0.004), k ? GLOW : GLOW2, mat(0, h * 0.5, sz * (d / 2 + 0.002)));
    b.add('stone', new THREE.BoxGeometry(w * 0.5, 0.01, d * 0.6), MOSS, mat(-w * 0.12, h + 0.004, 0));
    const object = new THREE.Group(); object.name = 'reef.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
