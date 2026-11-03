// Volcano Forge theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as the other themes).
import * as THREE from 'three';
import { Buckets, mat } from './util.js';
import { anvil, COLORS } from './props.js';

const IRON = COLORS.iron, IRON2 = COLORS.iron2, BRASS = COLORS.brass, BRASS2 = COLORS.brass2, COPPER = COLORS.copper;
const STONE = 0x4e4846, STONE2 = 0x3a3634, EMBER = COLORS.ember, EMBER2 = COLORS.ember2;

export function createSkins(M) {
  const I = M.internal;
  const mats = {
    vc: I.vc, stone: I.vcStone, gloss: I.vcGloss, metal: I.vcMetal, ember: I.ember, win: I.windowGlow,
    band: I.band, gem: I.gemGlow, basalt: I.basalt,
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
  const rivetRing = (b, R, y, n, rr = 0.012, color = BRASS) => {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      b.add('metal', new THREE.SphereGeometry(rr, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2), color, mat(Math.sin(a) * R, y, Math.cos(a) * R, 0, a, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    }
  };

  // ---------------- windmill: a basalt forge-furnace mill with a smoking chimney and an iron sail wheel ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets();
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    const seg = lo ? 8 : 12;
    // basalt footing either side of the tunnel
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R * 1.04, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R * 1.04, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 6 });
      eg.rotateX(-Math.PI / 2);
      b.add('stone', eg, STONE2, null);
    }
    // brass band over the tunnel line
    b.add('metal', new THREE.CylinderGeometry(R * 1.06, R * 1.06, 0.035, seg * 2), BRASS, mat(0, th + 0.017, 0));
    // the furnace body: tapering basalt drum with iron hoops
    const bodyH = (H - th) * 0.62;
    const body = new THREE.CylinderGeometry(R * 0.9, R * 1.0, bodyH, seg);
    b.add('stone', body, STONE, mat(0, th + 0.035 + bodyH / 2, 0));
    for (const f of [0.3, 0.72]) b.add('metal', new THREE.CylinderGeometry(R * (1 - f * 0.1) * 1.03, R * (1 - f * 0.1) * 1.03, 0.03, seg * 2), IRON2, mat(0, th + 0.035 + bodyH * f, 0));
    rivetRing(b, R * 0.985, th + 0.035 + bodyH * 0.3, lo ? 8 : 14, 0.011);
    const yTop = th + 0.035 + bodyH;
    // glowing furnace vents on the sides (not on the rotor face) and slit windows
    for (const ang of [Math.PI * 0.5, -Math.PI * 0.5, Math.PI]) {
      const y = th + 0.035 + bodyH * 0.5, rr = R * 0.96;
      b.add('ember', new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10, 1, false, 0, Math.PI), EMBER2, mat(Math.sin(ang) * rr, y, Math.cos(ang) * rr, 0, ang, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      b.add('ember', new THREE.BoxGeometry(0.12, 0.06, 0.02), EMBER, mat(Math.sin(ang) * rr, y - 0.03, Math.cos(ang) * rr, 0, ang, 0));
      b.add('metal', new THREE.TorusGeometry(0.065, 0.01, 3, 10, Math.PI), BRASS, mat(Math.sin(ang) * (rr + 0.006), y, Math.cos(ang) * (rr + 0.006), 0, ang, 0));
    }
    // iron dome cap with a brass ring, then the chimney
    b.add('metal', new THREE.SphereGeometry(R * 0.92, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2), IRON, mat(0, yTop, 0, 0, 0, 0, [1, 0.42, 1]));
    b.add('metal', new THREE.TorusGeometry(R * 0.92, 0.018, 4, seg * 2), BRASS, mat(0, yTop, 0, Math.PI / 2, 0, 0));
    const chH = Math.max(0.15, H - yTop - R * 0.2);
    const cx = -R * 0.3, cz = -R * 0.25;
    b.add('stone', new THREE.CylinderGeometry(R * 0.16, R * 0.2, chH + R * 0.4, 6), STONE2, mat(cx, yTop + (chH + R * 0.4) / 2 - R * 0.1, cz));
    b.add('metal', new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.03, 8), BRASS, mat(cx, yTop + chH + R * 0.28, cz));
    b.add('ember', new THREE.CylinderGeometry(R * 0.13, R * 0.13, 0.01, 6), EMBER, mat(cx, yTop + chH + R * 0.3, cz));
    // brass-framed tunnel arch on both faces
    for (const zs of [1, -1]) {
      const z = zs * (zFace + 0.014);
      for (const xs of [1, -1]) b.add('metal', new THREE.BoxGeometry(0.03, th + 0.02, 0.03), BRASS, mat(xs * (g2 + 0.015), (th + 0.02) / 2, z));
      b.add('metal', new THREE.BoxGeometry(gap + 0.08, 0.035, 0.035), BRASS, mat(0, th + 0.02, z));
      // a molten keystone glow above the arch
      b.add('ember', new THREE.BoxGeometry(0.05, 0.03, 0.012), EMBER2, mat(0, th + 0.05, z + zs * 0.012));
    }
    // hub housing: an iron box with brass corners, facing the incoming ball
    b.add('metal', new THREE.BoxGeometry(0.17, 0.17, 0.14), IRON2, mat(0, hub, R * 0.86));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.add('metal', new THREE.BoxGeometry(0.03, 0.03, 0.145), BRASS, mat(sx * 0.075, hub + sy * 0.075, R * 0.86));
    const object = new THREE.Group(); object.name = 'volcano.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: a brass hub with a glowing core, iron spars, riveted iron sails in brass frames with molten seams.
    // Blade k along +Y rotated 2πk/n; the sail spans x ∈ [0.018, 0.018 + BW], radius 0.06 → BL, within ±0.022 in Z.
    const rotor = new THREE.Group(); rotor.name = 'volcano.windmill.rotor';
    const rb = new Buckets();
    rb.add('metal', new THREE.CylinderGeometry(0.085, 0.085, 0.035, 16), BRASS, mat(0, 0, 0.018, Math.PI / 2, 0, 0));
    rb.add('ember', new THREE.CylinderGeometry(0.04, 0.04, 0.01, 10), EMBER2, mat(0, 0, 0.038, Math.PI / 2, 0, 0));
    const SAIL = [0x3e3a38, 0x4a4542, 0x36322f];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z) => M2.clone().multiply(mat(x, y, z));
      rb.add('metal', new THREE.BoxGeometry(0.026, BL - 0.01, 0.026), IRON2, at(0, 0.03 + (BL - 0.01) / 2, -0.004));
      const sailL = BL - 0.06;
      const nS = 4;
      for (let k = 0; k < nS; k++) {
        const yy = 0.06 + (k + 0.5) / nS * sailL;
        rb.add('metal', new THREE.BoxGeometry(BW * 0.94, sailL / nS * 0.9, 0.014), SAIL[(i + k) % SAIL.length], at(0.018 + BW / 2, yy, -0.004));
        // molten seam between plates
        if (k < nS - 1) rb.add('ember', new THREE.BoxGeometry(BW * 0.9, 0.006, 0.016), EMBER, at(0.018 + BW / 2, 0.06 + (k + 1) / nS * sailL, -0.004));
      }
      rb.add('metal', new THREE.BoxGeometry(0.014, sailL, 0.022), BRASS, at(0.018 + BW - 0.004, 0.06 + sailL / 2, 0.0));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.014, 0.022), BRASS, at(0.018 + BW / 2, BL - 0.007, 0.0));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.012, 0.022), BRASS2, at(0.018 + BW / 2, 0.066, 0.0));
      // an ember gem on the sail tip corner
      rb.add('gem', new THREE.OctahedronGeometry(0.02, 0), null, at(0.018 + BW - 0.006, BL - 0.006, 0.014));
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: an iron hoop with a molten seam, brass rails and rivets, an anvil on top ----------------
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
      b.add('metal', new THREE.TubeGeometry(c, lo ? 40 : 56, 0.018, 5, false), BRASS, null);
    }
    // iron band behind the track (uv: u = metres along, v 0..1 across; molten seam down the middle)
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
    // brass edge piping and rivet studs along both outer edges
    for (const e of [-1, 1]) {
      b.add('metal', new THREE.TubeGeometry(new Helix(R, S, -out - 0.004, e * BWd), 48, 0.013, 3, false), BRASS2, null);
      const nB = lo ? 12 : 18;
      for (let i = 1; i < nB; i++) {
        const t = i / nB, a = t * Math.PI * 2, r = R + out + 0.012;
        const Mx = mat(loopX(S, t) + e * (BWd + 0.004), R - r * Math.cos(a), r * Math.sin(a), a, 0, 0);
        b.add('metal', new THREE.SphereGeometry(0.02, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), i % 3 ? IRON2 : COPPER, Mx);
      }
    }
    // an anvil crowning the top, horn pointing the way the track shifts, with a glowing gem
    const top = 2 * R + out + 0.02;
    anvil(b, mat(S * 0.5, top, 0, 0, Math.PI / 2, 0), 0.26, false);
    b.add('gem', new THREE.OctahedronGeometry(0.03, 0), null, mat(S * 0.5, top + 0.13, 0));
    const object = new THREE.Group(); object.name = 'volcano.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: smoked-amber obsidian glass with brass rings and iron collars ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'volcano.tube';
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
        b.add('metal', new THREE.TorusGeometry(r * 1.12, 0.028, 6, 20), IRON2, m4.clone());
        b.add('metal', new THREE.TorusGeometry(r * 1.14, 0.01, 3, 20), BRASS, m4.clone().multiply(mat(0, 0, 0.03)));
      } else b.add('metal', new THREE.TorusGeometry(r * 1.04, 0.009, 3, 16), i % 2 ? BRASS : COPPER, m4.clone());
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: forge-red banner on an iron pole with a glowing ember finial ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'volcano.flag';
    const b = new Buckets();
    b.add('metal', new THREE.CylinderGeometry(0.012, 0.014, H, 8, 1, true), IRON2, mat(0, H / 2, 0));
    for (const f of [0.3, 0.6]) b.add('metal', new THREE.CylinderGeometry(0.017, 0.017, 0.02, 8), BRASS, mat(0, H * f, 0));
    b.add('metal', new THREE.CylinderGeometry(0.02, 0.014, 0.03, 8), BRASS, mat(0, H + 0.005, 0));
    b.add('gem', new THREE.OctahedronGeometry(0.03, 0), null, mat(0, H + 0.05, 0, 0, 0, 0, [1, 1.4, 1]));
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
          // hot updraft: a slower, heavier flutter with a little lift
          pos.setZ(i, Math.sin(x * 12 - t * 3.6) * 0.026 * k + Math.sin(x * 5 - t * 1.7) * 0.014 * k);
          pos.setY(i, base[i * 3 + 1] - k * k * 0.016 + Math.sin(t * 2.1 + x * 8) * 0.004 * k);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup: a spinning, bobbing ember gem in a brass setting with a glow ----------------
  const gemCols = [0xff5a1a, 0xffa030, 0xff3a2a];
  const pickGeos = gemCols.map((c) => {
    const b = new Buckets();
    const gem = new THREE.OctahedronGeometry(0.055, 0);
    b.add('ember', gem, c, mat(0, 0, 0, 0, 0, 0, [1, 1.45, 1]));
    b.add('metal', new THREE.TorusGeometry(0.05, 0.007, 4, 12), BRASS, mat(0, 0, 0, Math.PI / 2, 0, 0));
    b.add('metal', new THREE.OctahedronGeometry(0.012, 0), BRASS2, mat(0, 0.085, 0));
    b.add('metal', new THREE.OctahedronGeometry(0.012, 0), BRASS2, mat(0, -0.085, 0));
    const g = new THREE.Group();
    b.build(mats, g);
    g.traverse(x => { if (x.geometry) disposables.push(x.geometry); });
    return g;
  });
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  let pickN = 0;
  function pickup() {
    const object = new THREE.Group(); object.name = 'volcano.pickup';
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
        spin.position.y = 0.11 + Math.sin(t * 2.2 + phase) * 0.02;
        spin.rotation.y = t * 1.8 + phase;
        const s = 0.28 + Math.sin(t * 5.1 + phase) * 0.04;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: an iron-banded basalt post with a molten cap that fills the collider ----------------
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = Math.max(o.height ?? 0.2, r * 1.1);
    const b = new Buckets();
    const sides = 8, R = r / Math.cos(Math.PI / sides) * 1.01;   // the flat faces sit on the collider radius
    b.add('stone', new THREE.CylinderGeometry(R * 0.96, R, h * 0.86, sides), STONE, mat(0, h * 0.43, 0));
    for (const f of [0.18, 0.7]) b.add('metal', new THREE.CylinderGeometry(R * 1.04, R * 1.04, Math.min(0.03, h * 0.12), sides * 2), BRASS, mat(0, h * f, 0));
    rivetRing(b, R * 1.04, h * 0.44, 8, Math.min(0.01, r * 0.1), COPPER);
    b.add('metal', new THREE.CylinderGeometry(R * 0.9, R * 0.96, h * 0.1, sides), IRON2, mat(0, h * 0.9, 0));
    b.add('ember', new THREE.CylinderGeometry(R * 0.62, R * 0.62, h * 0.03, sides), EMBER, mat(0, h * 0.955, 0));
    b.add('ember', new THREE.TorusGeometry(R * 0.98, 0.006, 3, sides * 2), EMBER2, mat(0, h * 0.06, 0, Math.PI / 2, 0, 0));
    const object = new THREE.Group(); object.name = 'volcano.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: a forged iron disc with a glowing hammer-and-anvil sigil ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'volcano.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, 48), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = Math.PI;   // the hammer head (texture +v) faces back toward the tee, behind the ball
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets();
    b.add('metal', new THREE.TorusGeometry(R * 0.99, Math.min(0.016, R * 0.05), 5, 48), BRASS, mat(0, 0.006, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      b.add('metal', new THREE.SphereGeometry(Math.min(0.02, R * 0.06), 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? BRASS : COPPER, mat(Math.cos(a) * R * 0.99, 0.004, Math.sin(a) * R * 0.99));
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.8, R * 0.92, 48), ringGlowMaterial(0xff7a2a, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover: an iron anvil block filling the w×h×d box ----------------
  let moverN = 0;
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const b = new Buckets();
    const k = moverN++ % 2;
    // base, waist and face; the face spans the full box, the horn tapers inside it
    b.add('metal', new THREE.BoxGeometry(w * 0.8, h * 0.25, d), IRON, mat(0, h * 0.125, 0));
    b.add('metal', new THREE.BoxGeometry(w * 0.5, h * 0.35, d * 0.7), IRON2, mat(-w * 0.05, h * 0.25 + h * 0.175, 0));
    b.add('metal', new THREE.BoxGeometry(w * 0.72, h * 0.4, d), IRON, mat(-w * 0.14, h * 0.8, 0));
    const horn = new THREE.CylinderGeometry(0.004, Math.min(d * 0.42, h * 0.2), w * 0.28, 8);
    b.add('metal', horn, IRON, mat(w * 0.36, h * 0.8, 0, 0, 0, Math.PI / 2).multiply(new THREE.Matrix4().makeRotationZ(Math.PI)));
    // brass edge on the face, a glowing heat strip and copper rivets
    b.add('metal', new THREE.BoxGeometry(w * 0.73, h * 0.05, d * 1.01), k ? BRASS : COPPER, mat(-w * 0.14, h * 0.62, 0));
    b.add('ember', new THREE.BoxGeometry(w * 0.6, h * 0.02, d * 0.6), EMBER, mat(-w * 0.14, h * 1.0 + 0.001, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('metal', new THREE.SphereGeometry(Math.min(0.012, h * 0.08), 5, 3), BRASS, mat(sx * w * 0.36, h * 0.125, sz * d * 0.5));
    const object = new THREE.Group(); object.name = 'volcano.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
