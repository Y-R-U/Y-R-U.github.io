// Jungle Temple theme — obstacle skins (visual only; the engine owns colliders).
// Placement conventions follow THEME_CONTRACT "Engine extensions" (same as the other themes).
import * as THREE from 'three';
import { Buckets, mat, ALIAS_HI, ALIAS_LO } from './util.js';
import { COLORS as K } from './props.js';

const JADE = 0x70ffb0, EMBER = 0xffa030;

export function createSkins(M) {
  const I = M.internal;
  const mats = { vc: I.vc, stone: I.vcStone, gold: I.vcGold, glow: I.glow, band: I.band, gem: I.gemGlow, bark: I.bark };
  const glowMats = [];
  const disposables = [];
  const lo = M.quality === 'low';
  const alias = lo ? ALIAS_LO : ALIAS_HI;
  const ONE_LO = { vc: 'vc', stone: 'vc', gold: 'vc', glow: 'vc' };   // low: small skins in one lit draw

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

  // ---------------- windmill: a stone wheel totem — a carved face tower, a stone-spoked wheel ----------------
  function windmill(o = {}) {
    const R = o.towerRadius ?? 0.45, H = o.towerHeight ?? 1.25, hub = o.hubHeight ?? H * 0.78;
    const n = o.bladeCount ?? 4, BL = o.bladeLength ?? 0.8, BW = o.bladeWidth ?? 0.2, gap = o.gapWidth ?? 0.3;
    const g2 = gap / 2;
    const th = o.gapHeight ?? 0.24;
    const b = new Buckets(alias);
    const beta = Math.acos(Math.min(0.99, g2 / R));
    const zFace = Math.sqrt(Math.max(0, R * R - g2 * g2));
    const seg = lo ? 8 : 8;   // octagonal drums: carved, faceted
    // footings either side of the tunnel
    for (const s of [1, -1]) {
      const sh = new THREE.Shape();
      if (s > 0) { sh.moveTo(g2, -zFace); sh.absarc(0, 0, R * 1.04, -beta, beta, false); sh.lineTo(g2, -zFace); }
      else { sh.moveTo(-g2, zFace); sh.absarc(0, 0, R * 1.04, Math.PI - beta, Math.PI + beta, false); sh.lineTo(-g2, zFace); }
      const eg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 6 });
      eg.rotateX(-Math.PI / 2);
      b.add('stone', eg, K.stone2, null);
    }
    // a lintel slab over the tunnel with a gold band, moss on top
    b.add('stone', new THREE.CylinderGeometry(R * 1.08, R * 1.08, 0.06, seg * 2), K.stone, mat(0, th + 0.03, 0));
    b.add('gold', new THREE.CylinderGeometry(R * 1.085, R * 1.085, 0.016, seg * 2, 1, true), K.gold, mat(0, th + 0.03, 0));
    // the totem: three stacked octagonal drums, each a little narrower, glyph bands between
    const bodyH = (H - th) * 0.66;
    const dr = bodyH / 3;
    for (let k = 0; k < 3; k++) {
      const r0 = R * (1 - k * 0.07), r1 = R * (0.94 - k * 0.07);
      const y = th + 0.06 + dr * (k + 0.5);
      b.add('stone', new THREE.CylinderGeometry(r1, r0, dr * 0.92, seg), k % 2 ? K.stone2 : K.stone, mat(0, y, 0, 0, Math.PI / 8, 0));
      b.add('stone', new THREE.CylinderGeometry(r1 * 1.03, r1 * 1.03, dr * 0.1, seg), k === 1 ? K.moss : K.dark, mat(0, y + dr * 0.5, 0, 0, Math.PI / 8, 0));
    }
    // a carved face on the front of the middle drum (the side the ball comes from: +Z), jade eyes
    const fy = th + 0.06 + dr * 1.5, fz = R * 0.9;
    b.add('stone', new THREE.BoxGeometry(R * 0.9, 0.04, 0.05), K.dark, mat(0, fy + dr * 0.18, fz));
    for (const sx of [-1, 1]) b.add('glow', new THREE.BoxGeometry(R * 0.18, 0.04, 0.02), JADE, mat(sx * R * 0.24, fy + 0.05, fz + 0.01));
    b.add('stone', new THREE.BoxGeometry(R * 0.5, 0.035, 0.04), K.dark, mat(0, fy - dr * 0.25, fz));
    const yTop = th + 0.06 + bodyH;
    // a feathered headdress crowning it: a gold band and a fan of red / green / gold plumes
    b.add('gold', new THREE.CylinderGeometry(R * 0.78, R * 0.8, 0.06, seg), K.gold, mat(0, yTop + 0.03, 0, 0, Math.PI / 8, 0));
    const nP = lo ? 5 : 9;
    for (let i = 0; i < nP; i++) {
      const a = (i / (nP - 1) - 0.5) * 2.2;
      b.add('vc', new THREE.BoxGeometry(0.07, Math.max(0.2, H - yTop) * 0.9, 0.015), [K.red, 0x3a9a4a, K.gold][i % 3],
        mat(Math.sin(a) * R * 0.5, yTop + 0.06 + Math.cos(a) * 0.14, -R * 0.2, -0.15, 0, -a * 0.5));
    }
    // tunnel jambs: carved posts with ember-lit niches
    for (const zs of [1, -1]) {
      const z = zs * (zFace + 0.014);
      for (const xs of [1, -1]) {
        b.add('stone', new THREE.BoxGeometry(0.04, th + 0.02, 0.04), K.dark, mat(xs * (g2 + 0.02), (th + 0.02) / 2, z));
        b.add('glow', new THREE.BoxGeometry(0.02, 0.03, 0.012), EMBER, mat(xs * (g2 + 0.02), th * 0.75, z + zs * 0.022));
      }
    }
    // the axle boss facing the incoming ball
    b.add('stone', new THREE.BoxGeometry(0.18, 0.18, 0.14), K.stone2, mat(0, hub, R * 0.86));
    const object = new THREE.Group(); object.name = 'jungle.windmill';
    b.build(mats, object, { castShadow: true, receiveShadow: true });

    // rotor: a gold sun hub with a jade gem, carved stone spokes.
    // Blade k along +Y rotated 2πk/n; the slab spans x ∈ [0.018, 0.018 + BW], radius 0.06 → BL, within ±0.022 in Z.
    const rotor = new THREE.Group(); rotor.name = 'jungle.windmill.rotor';
    const rb = new Buckets(alias);
    rb.add('gold', new THREE.CylinderGeometry(0.09, 0.09, 0.035, 12), K.gold, mat(0, 0, 0.018, Math.PI / 2, 0, 0));
    rb.add('glow', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8), JADE, mat(0, 0, 0.038, Math.PI / 2, 0, 0));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const M2 = new THREE.Matrix4().makeRotationZ(a);
      const at = (x, y, z) => M2.clone().multiply(mat(x, y, z));
      const sailL = BL - 0.06;
      rb.add('stone', new THREE.BoxGeometry(0.03, BL - 0.01, 0.03), K.dark, at(0, 0.03 + (BL - 0.01) / 2, -0.004));
      rb.add('stone', new THREE.BoxGeometry(BW * 0.96, sailL, 0.036), i % 2 ? K.stone : K.stone2, at(0.018 + BW / 2, 0.06 + sailL / 2, 0));
      // carved glyph grooves across the slab
      const nG = lo ? 2 : 4;
      for (let k = 0; k < nG; k++) rb.add('stone', new THREE.BoxGeometry(BW * 0.7, 0.014, 0.04), K.dark, at(0.018 + BW / 2, 0.1 + (k + 0.5) / nG * (sailL - 0.08), 0));
      rb.add('gold', new THREE.BoxGeometry(BW, 0.03, 0.042), K.gold, at(0.018 + BW / 2, BL - 0.015, 0));
    }
    rb.build(mats, rotor, { castShadow: true });
    rotor.position.set(0, hub, R + 0.05);
    object.add(rotor);
    return { object, rotor };
  }

  // ---------------- loop: a carved feathered serpent ring, gold rails, the serpent's head on top ----------------
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
      b.add('gold', new THREE.TubeGeometry(c, lo ? 32 : 40, 0.016, 4, false), K.gold, null);
    }
    // the serpent's body behind the track (uv: u = metres along, v 0..1 across; scales + belly stripe)
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
    // feather spines along both outer edges (red / green / gold), alternating
    for (const e of [-1, 1]) {
      const nB = lo ? 8 : 14;
      for (let i = 1; i < nB; i++) {
        const t = i / nB, a = t * Math.PI * 2, r = R + out + 0.04;
        b.add('vc', new THREE.ConeGeometry(0.022, 0.09, 4), [K.red, 0x3a9a4a, K.gold][(i + (e > 0 ? 1 : 0)) % 3],
          mat(loopX(S, t) + e * (BWd + 0.01), R - r * Math.cos(a), r * Math.sin(a), a, 0, 0));
      }
    }
    // the serpent's head on top of the ring, jaws open toward the travel direction, jade eyes, a plume crest
    const top = 2 * R + out + 0.03;
    const hx = S * 0.5;
    b.add('stone', new THREE.BoxGeometry(W * 0.6, 0.12, 0.2), 0x4a8a50, mat(hx, top + 0.06, 0.02));
    b.add('stone', new THREE.BoxGeometry(W * 0.56, 0.04, 0.16), 0x3a7040, mat(hx, top + 0.01, 0.14, 0.25, 0, 0));
    b.add('stone', new THREE.BoxGeometry(W * 0.5, 0.03, 0.03), K.gold, mat(hx, top + 0.12, 0.12));
    for (const sx of [-1, 1]) {
      b.add('glow', new THREE.BoxGeometry(0.035, 0.03, 0.03), JADE, mat(hx + sx * W * 0.22, top + 0.1, 0.06));
      b.add('vc', new THREE.ConeGeometry(0.012, 0.05, 4), 0xf0ecd8, mat(hx + sx * W * 0.12, top + 0.0, 0.13, Math.PI, 0, 0));
    }
    for (let i = 0; i < (lo ? 3 : 5); i++) b.add('vc', new THREE.BoxGeometry(0.05, 0.16, 0.012), [K.red, 0x3a9a4a, K.gold][i % 3], mat(hx + (i - 2) * W * 0.1, top + 0.18, -0.08, -0.5, 0, (i - 2) * 0.2));
    const object = new THREE.Group(); object.name = 'jungle.loop';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tube: a hollow log, split open along the top so the ball stays visible ----------------
  function tube(o = {}) {
    const curve = o.curve, r = o.radius ?? 0.1;
    const len = curve.getLength();
    const segs = Math.min(120, Math.max(14, Math.round(len * 12)));
    const object = new THREE.Group(); object.name = 'jungle.tube';
    const open = 0.75;        // half-angle (rad) of the open slot at the top
    const ar = lo ? 9 : 13;   // around
    const rin = r * 1.04, rout = r * 1.3;
    const pos = [], uv = [], col = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), nUp = new THREE.Vector3();
    const frames = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      side.crossVectors(tg, up); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      nUp.crossVectors(side, tg).normalize();
      frames.push({ p, s: side.clone(), u: nUp.clone(), t });
    }
    // one ring of vertices per frame: inner wall (open .. 2π-open), then the outer wall back
    const ring = [];
    for (let k = 0; k <= ar; k++) ring.push([open + (Math.PI * 2 - 2 * open) * k / ar, rin, 1]);
    for (let k = ar; k >= 0; k--) ring.push([open + (Math.PI * 2 - 2 * open) * k / ar, rout, 0]);
    ring.push(ring[0]);
    const cIn = new THREE.Color(0xc8a070), cOut = new THREE.Color(0xffffff), cMoss = new THREE.Color(0x9ad070);
    frames.forEach((f, i) => {
      ring.forEach(([a, rr, inner], k) => {
        const x = Math.sin(a) * rr, y = Math.cos(a) * rr;
        const wob = inner ? 0 : (Math.sin(f.t * 40 + a * 3) * 0.06 + Math.sin(f.t * 13) * 0.04) * r;
        const q = f.p.clone().addScaledVector(f.s, x * (1 + wob / rr)).addScaledVector(f.u, y * (1 + wob / rr));
        pos.push(q.x, q.y, q.z);
        uv.push(a / (Math.PI * 2), f.t * len * 1.4);
        const c = inner ? cIn : (Math.cos(a) > 0.55 ? cMoss : cOut);
        col.push(c.r, c.g, c.b);
      });
    });
    const rl = ring.length;
    for (let i = 0; i < segs; i++) for (let k = 0; k < rl - 1; k++) {
      const a = i * rl + k, b2 = a + 1, c = a + rl, d = c + 1;
      idx.push(a, c, b2, b2, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const log = new THREE.Mesh(g, I.bark);
    log.castShadow = true; log.receiveShadow = true;
    object.add(log);
    // end rings (heartwood annulus), shelf fungi and a few leaves along the top
    const b = new Buckets(alias);
    const q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), m4 = new THREE.Matrix4();
    for (const t of [0, 1]) {
      const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      q.setFromUnitVectors(Z, tg); m4.compose(p, q, new THREE.Vector3(1, 1, 1));
      b.add('vc', new THREE.RingGeometry(rin, rout * 1.02, 14, 1), 0xd8b080, m4.clone().multiply(mat(0, 0, 0, 0, t ? 0 : Math.PI, 0)));
    }
    const nF = Math.max(2, Math.floor(len / 0.7));
    for (let i = 0; i < nF; i++) {
      const f = frames[Math.floor((i + 0.5) / nF * segs)];
      const s = i % 2 ? 1 : -1;
      const p = f.p.clone().addScaledVector(f.s, s * rout * 0.95).addScaledVector(f.u, -r * 0.2);
      b.add('vc', new THREE.CylinderGeometry(0.06, 0.05, 0.016, 7), i % 3 ? 0xe0c890 : 0xd87a40, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
    }
    b.build(mats, object, { castShadow: false });
    return object;
  }

  // ---------------- flag: a woven banner on a bamboo pole with a gold sun finial ----------------
  function flag(o = {}) {
    const H = o.poleHeight ?? 1.0;
    const object = new THREE.Group(); object.name = 'jungle.flag';
    const b = new Buckets(alias);
    b.add('vc', new THREE.CylinderGeometry(0.011, 0.014, H, 7, 1, true), K.bamboo, mat(0, H / 2, 0));
    for (const f of [0.22, 0.44, 0.66, 0.88]) b.add('vc', new THREE.CylinderGeometry(0.016, 0.016, 0.014, 7), 0x8a7440, mat(0, H * f, 0));
    b.add('gold', new THREE.CylinderGeometry(0.035, 0.035, 0.008, 10), K.gold, mat(0, H + 0.04, 0, Math.PI / 2, 0, 0));
    b.add('gem', new THREE.SphereGeometry(0.012, 8, 5), null, mat(0, H + 0.04, 0.006));
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
        // a lazy humid breeze
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3] - 0.012;
          const k = x / FW;
          pos.setZ(i, Math.sin(x * 11 - t * 2.2) * 0.026 * k + Math.sin(x * 5 - t * 0.9) * 0.014 * k);
        }
        pos.needsUpdate = true;
        cloth.computeVertexNormals();
      },
    };
  }

  // ---------------- pickup: a spinning gold sun coin with a jade centre (or a jade idol gem) ----------------
  const pickGeos = [0, 1, 2].map((kind) => {
    const b = new Buckets(lo ? { gold: 'glow' } : alias);   // low: unlit (one draw + the sprite)
    if (kind === 1) {
      b.add('gold', new THREE.OctahedronGeometry(0.055, 0), 0x40c890, mat(0, 0.012, 0, 0, 0, 0, [0.8, 1.3, 0.8]));
      b.add('gold', new THREE.TorusGeometry(0.07, 0.007, 4, 16), K.gold, mat(0, 0.012, 0, Math.PI / 2, 0, 0));
    } else {
      b.add('gold', new THREE.CylinderGeometry(0.065, 0.065, 0.016, 14), kind ? 0xe8a040 : K.gold, mat(0, 0.012, 0, Math.PI / 2, 0, 0));
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.add('gold', new THREE.BoxGeometry(0.016, 0.02, 0.014), K.gold, mat(Math.cos(a) * 0.075, 0.012 + Math.sin(a) * 0.075, 0, 0, 0, a)); }
      b.add('glow', new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8), JADE, mat(0, 0.012, 0, Math.PI / 2, 0, 0));
    }
    const g = new THREE.Group();
    b.build(mats, g);
    g.traverse(x => { if (x.geometry) disposables.push(x.geometry); });
    return g;
  });
  const sparkMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: 0xffe090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  disposables.push(sparkMat);
  let pickN = 0;
  function pickup() {
    const object = new THREE.Group(); object.name = 'jungle.pickup';
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
        const s = 0.26 + Math.sin(t * 2.6 + phase) * 0.05;
        glow.scale.set(s, s, 1);
      },
    };
  }

  // ---------------- bumper: an idol head (flat faces on the collider radius), jade / ember eyes ----------------
  let bumpN = 0;
  function bumper(o = {}) {
    const r = o.radius ?? 0.1, h = Math.max(o.height ?? 0.2, r * 1.1);
    const b = new Buckets(lo ? ONE_LO : { ...alias, vc: 'stone', gold: 'stone' });   // one lit draw + the eyes (low: one draw)
    const k = bumpN++;
    const sides = 8, R = r / Math.cos(Math.PI / sides) * 1.01;   // the flat faces sit on the collider radius
    b.add('stone', new THREE.CylinderGeometry(R * 0.97, R, h * 0.82, sides), k % 2 ? K.stone2 : K.stone, mat(0, h * 0.41, 0, 0, Math.PI / 8, 0));
    b.add('stone', new THREE.CylinderGeometry(R * 1.04, R * 1.06, h * 0.1, sides), K.moss, mat(0, h * 0.05, 0, 0, Math.PI / 8, 0));
    // the face: a brow ridge, a nose, a wide mouth, carved ear spools on the sides
    b.add('stone', new THREE.BoxGeometry(R * 1.3, h * 0.08, R * 0.3), K.dark, mat(0, h * 0.62, R * 0.86));
    b.add('stone', new THREE.BoxGeometry(R * 0.3, h * 0.2, R * 0.2), K.stone2, mat(0, h * 0.45, R * 0.95));
    b.add('stone', new THREE.BoxGeometry(R * 0.9, h * 0.06, R * 0.2), K.dark, mat(0, h * 0.26, R * 0.92));
    for (const sx of [-1, 1]) b.add('gold', new THREE.CylinderGeometry(R * 0.22, R * 0.22, R * 0.2, 8), K.gold, mat(sx * R * 0.98, h * 0.48, 0, 0, 0, Math.PI / 2));
    // a gold headband and a stepped crest
    b.add('gold', new THREE.CylinderGeometry(R * 1.0, R * 1.0, h * 0.08, sides), K.gold, mat(0, h * 0.8, 0, 0, Math.PI / 8, 0));
    b.add('stone', new THREE.CylinderGeometry(R * 0.55, R * 0.85, h * 0.14, sides), K.stone2, mat(0, h * 0.9, 0, 0, Math.PI / 8, 0));
    for (const sx of [-1, 1]) b.add('glow', new THREE.BoxGeometry(R * 0.32, h * 0.07, 0.01), k % 2 ? EMBER : JADE, mat(sx * R * 0.34, h * 0.53, R * 0.99));
    const object = new THREE.Group(); object.name = 'jungle.bumper';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  // ---------------- tee pad: a carved sun stone with a glowing gold ring ----------------
  function teePad(o = {}) {
    const R = o.radius ?? 0.6;
    const object = new THREE.Group(); object.name = 'jungle.teePad';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.05, lo ? 24 : 36), I.teePad);
    disc.position.y = 0.006 - 0.025;
    disc.rotation.y = Math.PI / 2;   // the arrow points down the hole (local -Z), as Star Station's pad
    disc.receiveShadow = true;
    object.add(disc);
    const b = new Buckets(alias);
    b.add('gold', new THREE.TorusGeometry(R * 0.99, Math.min(0.012, R * 0.04), 4, lo ? 24 : 36), K.gold, mat(0, 0.006, 0, Math.PI / 2, 0, 0));
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      b.add('glow', new THREE.BoxGeometry(0.02, 0.01, 0.02), JADE, mat(Math.cos(a) * R * 0.96, 0.01, Math.sin(a) * R * 0.96));
    }
    b.build(mats, object, { receiveShadow: true });
    const ring = new THREE.Mesh(flatRing(R * 0.8, R * 0.9, 48), ringGlowMaterial(0xffc050, 1));
    ring.position.y = 0.009; ring.renderOrder = 5;
    object.add(ring);
    return object;
  }

  // ---------------- mover: a carved stone block filling the w×h×d box ----------------
  let moverN = 0;
  function mover(o = {}) {
    const w = o.width ?? 0.4, h = o.height ?? 0.16, d = o.depth ?? 0.2;
    const b = new Buckets(lo ? ONE_LO : { ...alias, vc: 'stone', gold: 'stone' });   // one lit draw + the eyes (low: one draw)
    const k = moverN++ % 2;
    b.add('stone', new THREE.BoxGeometry(w, h * 0.9, d), k ? K.stone2 : K.stone, mat(0, h * 0.45, 0));
    b.add('stone', new THREE.BoxGeometry(w * 0.98, h * 0.1, d * 0.98), K.moss, mat(0, h * 0.95, 0));
    // gold corner edges and carved glyph panels on both long faces
    for (const sx of [-1, 1]) b.add('gold', new THREE.BoxGeometry(0.02, h * 0.9, d * 1.01), K.gold, mat(sx * (w / 2 - 0.01), h * 0.45, 0));
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) b.add('stone', new THREE.BoxGeometry(w * 0.22, h * 0.45, 0.006), K.dark, mat((i - 1) * w * 0.28, h * 0.45, sz * (d / 2 + 0.003)));
      b.add('glow', new THREE.BoxGeometry(w * 0.06, h * 0.1, 0.004), k ? JADE : EMBER, mat(0, h * 0.5, sz * (d / 2 + 0.007)));
    }
    const object = new THREE.Group(); object.name = 'jungle.mover';
    b.build(mats, object, { castShadow: true, receiveShadow: true });
    return object;
  }

  return {
    skins: { windmill, loop, tube, flag, pickup, bumper, teePad, mover },
    dispose() { for (const m of glowMats) m.dispose(); for (const d of disposables) d.dispose(); },
  };
}
