// Star Station theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as the other themes).
import * as THREE from 'three';
import { Buckets, mat, ALIAS_HI, ALIAS_LO } from './util.js';
import { COLORS as K } from './props.js';

const GLOW = 0x50fff0, AMBER = 0xffb040, RED = 0xff4a40;

export function createSkins(M) {
  const I = M.internal;
  const mats = { vc: I.vc, panel: I.vcPanel, gloss: I.vcGloss, metal: I.vcMetal, glow: I.glow, win: I.windowGlow, band: I.band, gem: I.gemGlow };
  const glowMats = [];
  const disposables = [];
  const lo = M.quality === 'low';
  const alias = lo ? ALIAS_LO : ALIAS_HI;
  const ONE_LO = { vc: 'vc', panel: 'vc', metal: 'vc', gloss: 'vc', glow: 'vc' };   // low: small skins in one lit draw

  function ringGlowMaterial(color, pulse = 1) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: M.uniforms.uTime, uColor: { value: new THREE.Color(color) }, uPulse: { value: pulse } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uPulse; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float d = abs(vUv.y - 0.5) * 2.0; float core = exp(-d * d * 18.0); float halo = exp(-d * d * 3.0) * 0.45;
          float p = 1.0 + 0.3 * uPulse * sin(uTime * 2.0);
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

  // ---------------- windmill: a reactor pylon whose rotor is a cross of solar panel arrays ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets(alias);
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    const seg = lo ? 8 : 12;
    // footings either side of the tunnel (white hull)
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R * 1.04, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R * 1.04, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 6 });
      eg.rotateX(-Math.PI / 2);
      b.add('panel', eg, K.white2, null);
    }
    b.add('metal', new THREE.CylinderGeometry(R * 1.06, R * 1.06, 0.04, seg * 2), K.dark, mat(0, th + 0.02, 0));
    b.add('glow', new THREE.CylinderGeometry(R * 1.065, R * 1.065, 0.012, seg * 2, 1, true), GLOW, mat(0, th + 0.045, 0));
    // the tower: a tapering hull drum in two sections, a teal band and a glowing window band
    const bodyH = (H - th) * 0.64;
    b.add('panel', new THREE.CylinderGeometry(R * 0.94, R, bodyH * 0.5, seg), K.white, mat(0, th + 0.04 + bodyH * 0.25, 0));
    b.add('panel', new THREE.CylinderGeometry(R * 0.88, R * 0.94, bodyH * 0.5, seg), K.white2, mat(0, th + 0.04 + bodyH * 0.75, 0));
    b.add('vc', new THREE.CylinderGeometry(R * 0.955, R * 0.955, 0.04, seg), K.teal, mat(0, th + 0.04 + bodyH * 0.5, 0));
    const yTop = th + 0.04 + bodyH;
    for (const ang of [Math.PI * 0.5, -Math.PI * 0.5, Math.PI]) {
      const y = th + 0.04 + bodyH * 0.3, rr = R * 0.99;
      b.add('glow', new THREE.BoxGeometry(0.14, 0.03, 0.02), GLOW, mat(Math.sin(ang) * rr, y, Math.cos(ang) * rr, 0, ang, 0));
    }
    // a domed reactor cap with an antenna and a red beacon
    b.add('gloss', new THREE.SphereGeometry(R * 0.86, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a5a7a, mat(0, yTop, 0, 0, 0, 0, [1, 0.55, 1]));
    b.add('metal', new THREE.TorusGeometry(R * 0.87, 0.016, 4, seg * 2), K.metal, mat(0, yTop, 0, Math.PI / 2, 0, 0));
    const chH = Math.max(0.15, H - yTop - R * 0.2);
    b.add('metal', new THREE.CylinderGeometry(0.012, 0.02, chH + R * 0.35, 5), K.metal, mat(0, yTop + R * 0.4 + (chH + R * 0.35) / 2, 0));
    b.add('glow', new THREE.SphereGeometry(0.025, 6, 4), RED, mat(0, yTop + R * 0.4 + chH + R * 0.35, 0));
    // tunnel mouth framed in dark metal with amber hazard lights
    for (const zs of [1, -1]) {
      const z = zs * (zFace + 0.014);
      for (const xs of [1, -1]) {
        b.add('metal', new THREE.BoxGeometry(0.035, th + 0.02, 0.035), K.dark, mat(xs * (g2 + 0.017), (th + 0.02) / 2, z));
        b.add('glow', new THREE.BoxGeometry(0.02, 0.02, 0.012), AMBER, mat(xs * (g2 + 0.017), th * 0.8, z + zs * 0.02));
      }
      b.add('metal', new THREE.BoxGeometry(gap + 0.09, 0.04, 0.04), K.dark, mat(0, th + 0.02, z));
    }
    // the hub housing facing the incoming ball
    b.add('panel', new THREE.BoxGeometry(0.17, 0.17, 0.14), K.white2, mat(0, hub, R * 0.86));
    const object = new THREE.Group(); object.name = 'star.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: a metal hub with a glowing core, truss spars, solar panel arrays in gold frames.
    // Blade k along +Y rotated 2πk/n; the panel spans x ∈ [0.018, 0.018 + BW], radius 0.06 → BL, within ±0.022 in Z.
    const rotor = new THREE.Group(); rotor.name = 'star.windmill.rotor';
    const rb = new Buckets(alias);
    rb.add('metal', new THREE.CylinderGeometry(0.085, 0.085, 0.035, 12), K.metal, mat(0, 0, 0.018, Math.PI / 2, 0, 0));
    rb.add('glow', new THREE.CylinderGeometry(0.045, 0.045, 0.01, 12), GLOW, mat(0, 0, 0.037, Math.PI / 2, 0, 0));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z) => M2.clone().multiply(mat(x, y, z));
      rb.add('metal', new THREE.BoxGeometry(0.022, BL - 0.01, 0.022), K.metal, at(0, 0.03 + (BL - 0.01) / 2, -0.004));
      const sailL = BL - 0.06;
      const nS = lo ? 2 : 4;
      for (let k = 0; k < nS; k++) {
        const yy = 0.06 + (k + 0.5) / nS * sailL;
        rb.add('metal', new THREE.BoxGeometry(BW * 0.92, sailL / nS * 0.9, 0.012), (i + k) % 2 ? K.cell : K.cell2, at(0.018 + BW / 2, yy, -0.002));
      }
      rb.add('metal', new THREE.BoxGeometry(0.012, sailL, 0.02), K.gold, at(0.018 + BW - 0.004, 0.06 + sailL / 2, 0.0));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.012, 0.02), K.gold, at(0.018 + BW / 2, BL - 0.006, 0.0));
      rb.add('metal', new THREE.BoxGeometry(BW, 0.01, 0.02), K.gold, at(0.018 + BW / 2, 0.065, 0.0));
      rb.add('glow', new THREE.BoxGeometry(0.02, 0.02, 0.02), i % 2 ? GLOW : RED, at(0.018 + BW, BL - 0.01, 0.0));
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: an orbit ring of white hull panels with running lights, rails and a beacon on top ----------------
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
    const b = new Buckets(alias);
    for (const s of [-1, 1]) {
      const c = new Helix(R, S, 0.04, s * (W / 2 + 0.014));
      b.add('metal', new THREE.TubeGeometry(c, lo ? 32 : 40, 0.016, 4, false), K.metal, null);
    }
    // hull band behind the track (uv: u = metres along, v 0..1 across; running lights down the middle)
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
    // glowing teal edge strips along both outer edges, struts every so often
    for (const e of [-1, 1]) {
      b.add('glow', new THREE.TubeGeometry(new Helix(R, S, -out - 0.004, e * BWd), lo ? 32 : 48, 0.008, 3, false), GLOW, null);
      const nB = lo ? 6 : 10;
      for (let i = 1; i < nB; i++) {
        const t = i / nB, a = t * Math.PI * 2, r = R + out + 0.03;
        b.add('panel', new THREE.BoxGeometry(0.03, 0.06, 0.05), K.white2, mat(loopX(S, t) + e * (BWd + 0.012), R - r * Math.cos(a), r * Math.sin(a), a, 0, 0));
      }
    }
    // a beacon pod crowning the top
    const top = 2 * R + out + 0.02;
    b.add('panel', new THREE.CylinderGeometry(0.05, 0.07, 0.06, 6), K.white, mat(S * 0.5, top + 0.03, 0));
    b.add('glow', new THREE.SphereGeometry(0.03, 8, 5), RED, mat(S * 0.5, top + 0.08, 0));
    const object = new THREE.Group(); object.name = 'star.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: an airlock of clear glass with white hull collars and glowing rings ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(140, Math.max(16, Math.round(len * 14)));
    const object = new THREE.Group(); object.name = 'star.tube';
    const glass = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r * 1.02, lo ? 10 : 14, false), I.glass);
    glass.renderOrder = 4;
    object.add(glass);
    const b = new Buckets(alias);
    const nRings = Math.max(2, Math.floor(len / 0.4));
    const q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i <= nRings; i++) {
      const t = i / nRings;
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      q.setFromUnitVectors(Z, tg);
      const end = i === 0 || i === nRings;
      m4.compose(p, q, new THREE.Vector3(1, 1, 1));
      if (end) {
        b.add('panel', new THREE.TorusGeometry(r * 1.16, 0.035, 6, 16), K.white, m4.clone());
        b.add('glow', new THREE.TorusGeometry(r * 1.16, 0.008, 3, 16), AMBER, m4.clone().multiply(mat(0, 0, 0.036)));
      } else b.add('glow', new THREE.TorusGeometry(r * 1.04, 0.006, 3, 16), GLOW, m4.clone());
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: a station pennant on an antenna mast with a beacon finial ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'star.flag';
    const b = new Buckets(alias);
    b.add('metal', new THREE.CylinderGeometry(0.011, 0.014, H, 8, 1, true), K.metal, mat(0, H / 2, 0));
    for (const f of [0.3, 0.6]) b.add('vc', new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8), K.teal, mat(0, H * f, 0));
    b.add('metal', new THREE.CylinderGeometry(0.02, 0.014, 0.03, 8), K.dark, mat(0, H + 0.005, 0));
    b.add('gem', new THREE.SphereGeometry(0.028, 10, 6), null, mat(0, H + 0.045, 0));
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
        // no wind in space: a slow ripple from the station's air vents
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3] - 0.012;
          const k = x / FW;
          pos.setZ(i, Math.sin(x * 10 - t * 1.4) * 0.02 * k + Math.sin(x * 4 - t * 0.6) * 0.012 * k);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup: a spinning, bobbing energy star (an octahedron crystal in a ring) ----------------
  const pickCols = [0x9ffcff, 0xfff0a0, 0xd8a8ff];
  const pickGeos = pickCols.map((c) => {
    const b = new Buckets(lo ? { metal: 'glow' } : alias);   // low: the ring is unlit too (one draw + the sprite)
    b.add('glow', new THREE.OctahedronGeometry(0.05, 0), c, mat(0, 0.012, 0, 0, 0, 0, [0.8, 1.3, 0.8]));
    b.add('metal', new THREE.TorusGeometry(0.07, 0.007, 4, 18), K.white, mat(0, 0.012, 0, Math.PI / 2, 0, 0));
    b.add('metal', new THREE.TorusGeometry(0.07, 0.005, 3, 18), K.gold, mat(0, 0.012, 0, 0.6, 0, 0));
    const g = new THREE.Group();
    b.build(mats, g);
    g.traverse(x => { if (x.geometry) disposables.push(x.geometry); });
    return g;
  });
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.flare, color: 0xb0fff8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  let pickN = 0;
  function pickup() {
    const object = new THREE.Group(); object.name = 'star.pickup';
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
        spin.rotation.y = t * 1.6 + phase;
        const s = 0.28 + Math.sin(t * 2.6 + phase) * 0.06;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: a beacon pylon (flat faces on the collider radius) with a glowing cap ----------------
  let bumpN = 0;
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = Math.max(o.height ?? 0.2, r * 1.1);
    const b = new Buckets(lo ? ONE_LO : { ...alias, vc: 'panel', metal: 'panel' });   // one lit draw + the glow cap per bumper (low: one draw)
    const k = bumpN++;
    const sides = 8, R = r / Math.cos(Math.PI / sides) * 1.01;   // the flat faces sit on the collider radius
    b.add('panel', new THREE.CylinderGeometry(R * 0.96, R, h * 0.8, sides), K.white, mat(0, h * 0.4, 0));
    b.add('metal', new THREE.CylinderGeometry(R * 1.05, R * 1.07, h * 0.12, sides), K.dark, mat(0, h * 0.06, 0));
    b.add('vc', new THREE.CylinderGeometry(R * 0.98, R * 0.98, h * 0.12, sides), k % 2 ? K.orange : K.teal, mat(0, h * 0.5, 0));
    b.add('metal', new THREE.CylinderGeometry(R * 0.8, R * 0.95, h * 0.1, sides), K.dark, mat(0, h * 0.85, 0));
    b.add('glow', new THREE.CylinderGeometry(R * 0.55, R * 0.7, h * 0.1, sides), k % 2 ? AMBER : GLOW, mat(0, h * 0.95, 0));
    const object = new THREE.Group(); object.name = 'star.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: a hexagonal launch pad with a glowing arrow ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'star.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, 6), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = Math.PI / 2;   // the arrow points down the hole (local -Z)
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets(alias);
    b.add('metal', new THREE.TorusGeometry(R * 0.99, Math.min(0.014, R * 0.05), 4, 6), K.dark, mat(0, 0.006, 0, Math.PI / 2, 0, Math.PI / 6));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      b.add('glow', new THREE.BoxGeometry(0.02, 0.01, 0.02), i % 2 ? AMBER : GLOW, mat(Math.cos(a) * R * 0.97, 0.01, Math.sin(a) * R * 0.97));
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.8, R * 0.9, 48), ringGlowMaterial(0x40f0e0, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover: a docking arm block filling the w×h×d box ----------------
  let moverN = 0;
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const b = new Buckets(lo ? ONE_LO : { ...alias, vc: 'panel', metal: 'panel' });   // one lit draw + the glow strips per mover (low: one draw)
    const k = moverN++ % 2;
    b.add('panel', new THREE.BoxGeometry(w, h * 0.84, d), K.white, mat(0, h * 0.42, 0));
    b.add('metal', new THREE.BoxGeometry(w * 0.98, h * 0.16, d * 0.98), K.dark, mat(0, h * 0.92, 0));
    // hazard ends, a glowing strip on both long faces, a clamp on top
    for (const sx of [-1, 1]) b.add('vc', new THREE.BoxGeometry(0.04, h * 0.85, d * 1.01), k ? K.amber : K.orange, mat(sx * (w / 2 - 0.02), h * 0.42, 0));
    for (const sz of [-1, 1]) b.add('glow', new THREE.BoxGeometry(w * 0.6, h * 0.06, 0.004), k ? GLOW : AMBER, mat(0, h * 0.55, sz * (d / 2 + 0.002)));
    b.add('metal', new THREE.BoxGeometry(w * 0.3, 0.02, d * 0.5), K.metal, mat(0, h + 0.01, 0));
    const object = new THREE.Group(); object.name = 'star.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
