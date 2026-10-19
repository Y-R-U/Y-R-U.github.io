// MONOLITH, experimental epic tank "Gravity Obelisk" (sculptor-13). Brief: docs/ROSTER.md `monolith`; look: refs/ref_battle_02.png.
// The tallest monolithic shape on the board: a black-glass obelisk in four floating segments (inverted spike base, two
// shafts, a pyramidion cap) held apart by violet hardlight, one great eye in the upper shaft, faint gold glyph columns,
// two gravity rings, four slab "arms" orbiting it (six at R4), and a cloud of debris it drags along underneath.
// VALUE: `accent` = black glass (most of it), `paint` = deep violet corner pilasters + slab faces, `metal` = dark chrome
// collars, `trim` = gold glyphs (dim emissive), `glow` = violet gaps/rings, `eye` = the eye.
// Rank tiers (ROSTER): R0 battered (cracked cap, one slab missing a face) · R1 base minus the upper ring · R2 base ·
//   R3 glyph ring orbits the shaft (glyphs animate) + slab edge lights · R4 six slabs + crown spikes on the cap ·
//   R5 gravity-lens sphere around it (extra mesh, +1 dc) + a second, outer ring.
// Technique: slab bones (clav/thigh/upArm L+R, re-parented to the spine) are placed every frame in tick() from an orbit
// state per action; the shafts float apart by offsetting spine/chest/head rest positions; noDrop false, but the deploy
// fall decelerates ("gravity brake") instead of slamming.
import { THREE, P, plate, fin, LIB, kf, PI, BI } from '../kit.js';

const L = LIB;
const DIMS = {
  hover: 0.6, spine: 0.44, chest: 0.54, neck: 0.5, headOff: 0.04, hipX: 0.1, hipY: -0.1, thigh: 0.1, shin: 0.1, ankle: 0.02,
  clavX: 0, clavY: 0, shoulder: 0.01, upArm: 0.1, foreArm: 0.1,
  parents: { clavL: 'spine', clavR: 'spine', thighL: 'spine', thighR: 'spine', upArmL: 'spine', upArmR: 'spine', aux1: 'spine', aux3: 'chest', aux0: 'chest', footL: 'pelvis', footR: 'pelvis' },
  offsets: { clavL: [0, 0.2, 0], clavR: [0, 0.2, 0], thighL: [0, 0.2, 0], thighR: [0, 0.2, 0], upArmL: [0, 0.2, 0], upArmR: [0, 0.2, 0], footL: [0, -0.45, 0], footR: [0, -0.45, 0] },
  aux0: [0, 0.27, 0.2], aux1: [0, 0.25, 0], aux2: [0, -0.12, 0], aux3: [0, 0.25, 0],
};
const SLABS = ['clavL', 'clavR', 'thighL', 'thighR', 'upArmL', 'upArmR'];
const W0 = 0.48, W1 = 0.32;            // obelisk width at the base / under the cap
const wAt = (y) => W0 + (W1 - W0) * Math.min(1, Math.max(0, (y - 0.6) / 1.5));   // y = model height

// deterministic glyph pattern
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

// ---------- greebles ----------
function glyphCol(b, bone, x, y0, n, z, face, seed, step = 0.045) {
  // a column of little gold marks on a face; face = yaw of the face normal
  b.scope([0, 0, 0], [0, face, 0], 1, () => {
    for (let i = 0; i < n; i++) {
      const h = hash(seed * 131 + i), w = h < 0.3 ? 0.05 : h < 0.6 ? 0.025 : 0.012, hh = h > 0.8 ? 0.03 : 0.011;
      b.add(b.box(w, hh, 0.008), bone, 'trim', [x + (hash(seed + i * 7) - 0.5) * 0.02, y0 + i * step, z]);
      if (h > 0.55 && !b.far) b.add(b.box(0.008, 0.008, 0.008), bone, 'trim', [x + 0.035, y0 + i * step + 0.01, z]);
    }
  });
}
// one obelisk shaft segment: black glass, deep violet corner pilasters, chrome collars, glyph columns on 3 faces
function shaft(b, bone, y0, y1, yW, seed, o) {
  const h = y1 - y0, wb = wAt(yW), wt = wAt(yW + h), far = b.far, mid = (y0 + y1) / 2;
  b.add(plate(b, wb, h, wb, { c: 0.02, tx: wt / wb, tz: wt / wb }), bone, 'accent', [0, mid, 0]);
  // collars
  b.add(plate(b, wb + 0.03, 0.035, wb + 0.03, { c: 0.01, tx: 0.95, tz: 0.95 }), bone, 'metal', [0, y0 + 0.018, 0]);
  b.add(plate(b, wt * 0.9, 0.012, wt * 0.9, { c: 0.004 }), bone, 'paint', [0, y1 + 0.002, 0]);
  // corner pilasters
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2, r0 = wb * 0.68, r1 = wt * 0.68;
    const xm = Math.sin(a) * (r0 + r1) / 2, zm = Math.cos(a) * (r0 + r1) / 2, tilt = Math.atan2(r0 - r1, h);
    b.add(b.cbox(0.045, h * 0.9, 0.045, 0.01), bone, 'paint', [xm, mid, zm], [tilt * Math.cos(a), a, -tilt * Math.sin(a)]);
    if (!far) b.add(b.cbox(0.012, h * 0.6, 0.012, 0.003), bone, 'glow', [xm * 1.04, mid, zm * 1.04], [tilt * Math.cos(a), a, -tilt * Math.sin(a)]);
  }
  // glyph columns (front, sides) and a recessed back vent
  const zf = (wb + wt) / 4 + 0.006;
  const n = Math.floor(h / 0.05) - 2;
  for (const [face, k] of [[0, 0], [PI / 2, 1], [-PI / 2, 2]]) {
    glyphCol(b, bone, -0.055, y0 + 0.07, n, zf, face, seed * 10 + k);
    if (!far) glyphCol(b, bone, 0.06, y0 + 0.1, n - 1, zf, face, seed * 10 + k + 5);
  }
  if (!far) for (let i = 0; i < 4; i++) b.add(b.box(wt * 0.6, 0.012, 0.02), bone, 'metal', [0, mid - 0.06 + i * 0.04, -zf]);
  // recessed panel frames on every face + pilaster cap studs
  for (let f = 0; f < 4; f++) b.scope([0, 0, 0], [0, f * PI / 2, 0], 1, () => {
    const fw = (wb + wt) / 2 * 0.62;
    for (const sy of [1, -1]) b.add(b.cbox(fw, 0.014, 0.012, 0.004), bone, 'metal', [0, mid + sy * h * 0.36, zf - 0.002]);
    for (const sx of [1, -1]) b.add(b.cbox(0.014, h * 0.72, 0.012, 0.004), bone, 'metal', [sx * fw / 2, mid, zf - 0.002]);
  });
  if (!far) for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; b.add(b.sph(8, 6), bone, 'metal', [Math.sin(a) * wt * 0.66, y1 - 0.02, Math.cos(a) * wt * 0.66], [0, 0, 0], 0.03); }
}
function gapLight(b, bone, y, w) {
  b.add(plate(b, w * 0.82, 0.03, w * 0.82, { c: 0.008 }), bone, 'glow', [0, y, 0]);
  if (!b.far) for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; b.add(b.cbox(0.03, 0.06, 0.03, 0.008), bone, 'metal', [Math.sin(a) * w * 0.55, y, Math.cos(a) * w * 0.55], [0, a, 0]); }
}

// ---------- parts ----------
function body(b, o) {
  const rk = o.rank, far = b.far;
  // BASE (pelvis, world y 0.6): inverted spike + lower block
  b.add(b.cyl(W0 * 0.66, 0.02, 0.36, 4), 'pelvis', 'accent', [0, -0.25, 0], [0, PI / 4, 0]);
  if (!far) for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.add(b.cbox(0.012, 0.3, 0.012, 0.003), 'pelvis', 'glow', [Math.sin(a) * 0.2, -0.24, Math.cos(a) * 0.2], [0.55 * Math.cos(a), 0, -0.55 * Math.sin(a)]); }
  b.add(b.sph(8, 6), 'pelvis', 'glow', [0, -0.44, 0], [0, 0, 0], 0.035);
  shaft(b, 'pelvis', -0.07, 0.36, 0.53, 1, o);
  // the gap lights hang under each shaft
  gapLight(b, 'spine', 0.01, wAt(1.05));
  // LOWER SHAFT (spine, world y 1.04)
  shaft(b, 'spine', 0.03, 0.5, 1.07, 2, o);
  gapLight(b, 'chest', 0.0, wAt(1.58));
  // UPPER SHAFT with the EYE (chest, world y 1.58)
  shaft(b, 'chest', 0.03, 0.46, 1.61, 3, o);
  const zf = wAt(1.8) / 2 + 0.01;
  b.add(b.sph(20, 12), 'chest', 'eye', [0, 0.27, zf - 0.03], [0, 0, 0], [0.09, 0.13, 0.05]);
  b.add(b.tor(0.11, 0.014, 22, 4), 'chest', 'metal', [0, 0.27, zf], [0, 0, 0], [1, 1.35, 1]);
  b.add(b.tor(0.13, 0.006, 22, 3), 'chest', 'glow', [0, 0.27, zf + 0.005], [0, 0, 0], [1, 1.3, 1]);
  b.add(plate(b, 0.3, 0.05, 0.05, { c: 0.01, bx: 0.5 }), 'chest', 'paint', [0, 0.44, zf - 0.01], [0.3, 0, 0]);   // brow
  for (const s of [1, -1]) b.add(fin(b, [[0, 0], [0.12, 0.02], [0.14, -0.04]], 0.02, 0.005), 'chest', 'paint', [s * 0.12, 0.27, zf], [0, s > 0 ? 0 : PI, -0.1]);
  // radial lash fins around the eye socket
  if (!far) for (let i = 0; i < 10; i++) { const a = i * PI / 5; b.add(b.cbox(0.012, 0.05, 0.02, 0.004), 'chest', i % 2 ? 'paint' : 'metal', [Math.sin(a) * 0.15, 0.27 + Math.cos(a) * 0.19, zf + 0.004], [0, 0, -a]); }
  // pupil (aux0, on the chest in front of the eye): a vertical slit that glances
  b.add(b.cbox(0.025, 0.15, 0.02, 0.008), 'aux0', 'accent', [0, 0, zf - 0.2 + 0.02]);
  // CAP (head, world y 2.12): pyramidion + R4 crown spikes; R0 cracked
  const wc = wAt(2.1);
  b.add(plate(b, wc + 0.03, 0.05, wc + 0.03, { c: 0.01 }), 'head', 'metal', [0, 0.03, 0]);
  b.add(b.cyl(0.02, wc * 0.7, 0.38, 4), 'head', rk === 0 ? 'accent' : 'paint', [0, 0.25, 0], [0, PI / 4, rk === 0 ? 0.06 : 0]);
  b.add(b.cyl(0.005, wc * 0.5, 0.27, 4), 'head', 'accent', [0, 0.23, 0], [0, PI / 4 + 0.001, 0], [1.08, 1, 1.08]);
  b.add(b.sph(8, 6), 'head', 'glow', [0, 0.47, 0], [0, 0, 0], 0.03);
  gapLight(b, 'head', -0.01, wc);
  if (rk >= 4) for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.add(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.26]], 0.02, 0.005), 'head', i % 2 ? 'glow' : 'trim', [Math.sin(a) * wc * 0.45, 0.08, Math.cos(a) * wc * 0.45], [0.5 * Math.cos(a), a, -0.5 * Math.sin(a)]); }
}

function slab(b, bone, i, o) {
  const rk = o.rank, far = b.far, w = 0.3, h = 0.66, d = 0.12;
  // authored facing +Z (outward); the tick spins the bone so it faces away from the obelisk
  b.add(plate(b, w, h, d, { c: 0.02, tx: 0.82, bx: 0.9 }), bone, 'accent', [0, 0, 0]);
  if (!(rk === 0 && i === 1)) b.add(plate(b, w * 0.72, h * 0.72, 0.02, { c: 0.006, tx: 0.85 }), bone, 'paint', [0, 0.0, d / 2 + 0.006]);
  b.add(b.cbox(w * 0.92, 0.04, d + 0.02, 0.01), bone, 'metal', [0, h / 2 - 0.01, 0]);
  b.add(b.cbox(w * 0.9, 0.04, d + 0.02, 0.01), bone, 'metal', [0, -h / 2 + 0.01, 0]);
  b.add(b.cbox(0.012, h * 0.55, 0.012, 0.003), bone, 'glow', [0, 0, d / 2 + 0.02]);
  glyphCol(b, bone, -0.055, -0.2, 8, d / 2 + 0.018, 0, 40 + i, 0.05);
  // inner face: gravity coupling lamp facing the obelisk
  b.add(b.cyl(0.05, 0.05, 0.02, 14), bone, 'metal', [0, 0, -d / 2 - 0.006], [PI / 2, 0, 0]);
  b.add(b.cyl(0.034, 0.034, 0.026, 14), bone, 'glow', [0, 0, -d / 2 - 0.008], [PI / 2, 0, 0]);
  if (rk >= 3 && !far) for (const s of [1, -1]) b.add(b.cbox(0.008, h * 0.8, 0.008, 0.002), bone, 'glow', [s * w * 0.47, 0, d / 2], [0, 0, 0]);
  if (!far) for (const s of [1, -1]) b.add(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.07]], 0.03, 0.006), bone, 'metal', [0, s * (h / 2 + 0.01), 0], [s > 0 ? 0 : PI, 0, 0]);
  // side ribs + rivets on the face
  for (const s of [1, -1]) b.add(b.cbox(0.02, h * 0.8, d * 0.8, 0.006), bone, 'metal', [s * (w / 2 + 0.006), 0, 0]);
  if (!far) for (const s of [1, -1]) for (let k = 0; k < 4; k++) b.add(b.cyl(0.008, 0.008, 0.01, 6), bone, 'trim', [s * w * 0.4, -h * 0.3 + k * h * 0.2, d / 2 + 0.004], [PI / 2, 0, 0]);
  b.add(b.cbox(w * 0.5, 0.05, 0.03, 0.01), bone, 'metal', [0, h * 0.28, d / 2 + 0.012]);
}

function rings(b, o) {
  const rk = o.rank, far = b.far;
  // lower gravity ring (aux2 on the pelvis): chrome ring, violet inner ring, node blocks
  const R = 0.62;
  b.add(b.tor(R, 0.022, 48, 5), 'aux2', 'metal', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(R - 0.04, 0.009, 48, 4), 'aux2', 'glow', [0, 0, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; b.add(b.cbox(0.06, 0.05, 0.07, 0.012), 'aux2', i % 2 ? 'paint' : 'metal', [Math.sin(a) * R, 0, Math.cos(a) * R], [0, a, 0]); }
  // upper tilted ring around the eye shaft (aux3 on the chest)
  if (rk >= 1) {
    b.add(b.tor(0.48, 0.014, 40, 4), 'aux3', 'metal', [0, 0, 0], [PI / 2, 0, 0]);
    b.add(b.tor(0.45, 0.006, 40, 3), 'aux3', 'glow', [0, 0, 0], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; b.add(b.sph(8, 6), 'aux3', 'glow', [Math.sin(a) * 0.48, 0, Math.cos(a) * 0.48], [0, 0, 0], 0.028); }
  }
  if (rk >= 5) {
    b.add(b.tor(0.8, 0.01, 56, 4), 'aux2', 'glow', [0, 0.02, 0], [PI / 2, 0, 0]);
    b.add(b.tor(0.84, 0.005, 56, 3), 'aux2', 'trim', [0, 0.02, 0], [PI / 2, 0, 0]);
  }
  // R3: gold glyph band orbiting the lower shaft (aux1 on the spine)
  if (rk >= 3) {
    const n = far ? 12 : 22;
    for (let i = 0; i < n; i++) {
      const a = i * 2 * PI / n, h = hash(i * 17 + 3);
      b.add(b.box(h < 0.5 ? 0.05 : 0.025, h > 0.7 ? 0.05 : 0.018, 0.01), 'aux1', 'trim', [Math.sin(a) * 0.46, (h - 0.5) * 0.04, Math.cos(a) * 0.46], [0, a, 0]);
    }
    b.add(b.tor(0.46, 0.003, 40, 3), 'aux1', 'glow', [0, -0.04, 0], [PI / 2, 0, 0]);
  }
}

function debris(b, o) {
  // rubble it drags along under the spike (foot bones on the pelvis spin in post)
  const n = b.far ? 4 : 7;
  for (const [bone, s] of [['footL', 1], ['footR', -1]]) {
    for (let i = 0; i < n; i++) {
      const a = i * 2 * PI / n + (s > 0 ? 0 : 0.4), R = 0.28 + hash(i * 3 + (s > 0 ? 1 : 2)) * 0.22, sz = 0.03 + hash(i * 5 + s) * 0.04;
      b.add(b.sph(4, 3), bone, i % 3 ? 'accent' : 'metal', [Math.sin(a) * R, (hash(i + s * 9) - 0.5) * 0.12 + (s > 0 ? 0.05 : -0.04), Math.cos(a) * R], [a, a * 2, 0], [sz, sz * 0.8, sz * 1.1]);
    }
  }
}

function build(b, o) {
  body(b, o);
  const n = o.rank >= 4 ? 6 : 4;
  for (let i = 0; i < n; i++) slab(b, SLABS[i], i, o);
  rings(b, o);
  debris(b, o);
}

// ---------- R5 gravity lens (extra mesh) ----------
const LENS_VS = /* glsl */`
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }`;
const LENS_FS = /* glsl */`
uniform vec3 uColor; uniform float uA, uTime;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 3.0);
  float swirl = 0.5 + 0.5 * sin(atan(vP.z, vP.x) * 6.0 + vP.y * 5.0 - uTime * 2.2);
  float bands = smoothstep(0.75, 1.0, sin(f * 30.0 - uTime * 3.0));
  vec3 c = uColor * (rim * 1.6 + bands * 0.25 * f + swirl * 0.12 * f);
  float a = clamp(rim * 0.9 + 0.12 + bands * 0.15, 0.0, 1.0) * uA;
  gl_FragColor = vec4(c - vec3(0.06) * (1.0 - f), a);
}`;
function lens(unit, ctx) {
  if (ctx.lens) return ctx.lens;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x9a4dff) }, uA: { value: 1 }, uTime: { value: 0 } },
    vertexShader: LENS_VS, fragmentShader: LENS_FS, transparent: true, depthWrite: false,
  }));
  m.scale.set(1.0, 1.45, 1.0); m.position.y = 1.3; m.renderOrder = 5; m.castShadow = false; m.name = 'monolith-lens';
  unit.body.add(m);
  const dis = unit.dispose.bind(unit);
  unit.dispose = () => { m.geometry.dispose(); m.material.dispose(); m.removeFromParent(); dis(); };
  return (ctx.lens = m);
}

// ---------- slab orbit ----------
const TAU = PI * 2;
const wrap = (a) => ((a + PI) % TAU + TAU) % TAU - PI;
// per slab: angle, radius, height (spine-local), pitch (tip outward/forward), spin
function slabPose(name, u, i, n, ph, t) {
  let a = ph + i * TAU / n, R = 0.7, y = 0.18 + 0.05 * Math.sin(t * 1.3 + i * 1.7), tilt = 0.1, roll = 0;
  const front = (k, target = 0) => { a += wrap(target + i * TAU / n - a) * k; };   // pull the ring so slab 0 sits at `target`
  switch (name) {
    case 'attack': {
      // GRAVITY MAUL: slab 0 swings round to the front, rears up, slams down-forward (impact 0.45); the rest pull in
      const k = kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
      front(k);
      if (i === 0) {
        const up = kf(u, [[0, 0], [0.3, 1], [0.4, 0.6], [0.45, 0], [1, 0]]), slam = kf(u, [[0, 0], [0.38, 0], [0.45, 1], [0.7, 1], [1, 0]]);
        y += 0.55 * up - 0.75 * slam; R += -0.15 * up + 0.32 * slam; tilt += -0.6 * up + 1.35 * slam;
      } else R -= 0.12 * k;
      break;
    }
    case 'attack_alt': {
      // two slabs swing to the front and clap together (impact 0.5)
      const k = kf(u, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]), clap = kf(u, [[0, 0], [0.42, 0], [0.5, 1], [0.7, 1], [1, 0]]);
      front(k, 0.9);
      if (i === 0 || i === n - 1) {
        const side = i === 0 ? 1 : -1;
        a += wrap(side * (0.9 - 0.62 * clap) - a) * k; R += 0.15 * clap; y += 0.15 * k - 0.1 * clap; roll = side * 0.4 * clap;
      } else { R -= 0.1 * k; y += 0.2 * k; }
      break;
    }
    case 'cast': {
      const k = kf(u, [[0, 0], [0.4, 1], [0.7, 1], [1, 0]]);
      y += 0.5 * k; R += 0.15 * k; tilt -= 0.5 * k;
      break;
    }
    case 'overdrive': {
      // EVENT HORIZON: slabs fling wide and high, whirl, then crash back into orbit
      const k = kf(u, [[0, 0], [0.25, 1], [0.8, 1], [0.92, 0.2], [1, 0]]);
      R += 0.3 * k; y += 0.25 * k + 0.12 * Math.sin(t * 6 + i) * k; tilt -= 0.7 * k; roll = 0.3 * k * Math.sin(i * 2.1);
      break;
    }
    case 'hit': { const k = kf(u, [[0, 0], [0.1, 1], [1, 0]]); R += 0.12 * k; y += (hash(i) - 0.5) * 0.2 * k; tilt += 0.3 * k; break; }
    case 'die': {
      // slabs lose the field: they drift out and drop to the floor, lying tilted
      const k = kf(u, [[0, 0], [0.2, 0.1], [0.55, 1], [1, 1]]), bounce = kf(u, [[0.5, 0], [0.58, 1], [0.66, 0.85], [0.72, 1], [1, 1]]);
      R += 0.25 * k + hash(i + 3) * 0.12 * k; y += (-0.98 - y) * bounce + 0.1 * k * (1 - bounce); tilt += (1.2 + hash(i) * 0.3) * bounce; roll = (hash(i + 9) - 0.5) * 0.6 * bounce;
      break;
    }
    case 'deploy': {
      // slabs arrive from far out and lock into the ring (land 0.4)
      const k = kf(u, [[0, 1], [0.38, 1], [0.7, 0], [1, 0]]);
      R += 0.9 * k; y += 0.6 * k; tilt -= 0.8 * k;
      break;
    }
    case 'victory': {
      const k = Math.min(1, u);
      y += 0.55 * k; R -= 0.12 * k; tilt -= 0.55 * k;
      break;
    }
    case 'advance': R -= 0.04; y += 0.05; tilt += 0.15; break;
  }
  return [a, R, y, tilt, roll];
}
const GAP = { spine: 0, chest: 0, head: 0 };
function gapFor(name, u, t) {
  switch (name) {
    case 'overdrive': return kf(u, [[0, 0], [0.25, 0.12], [0.8, 0.12], [0.9, 0], [1, 0]]);
    case 'hit': return kf(u, [[0, 0], [0.1, 0.07], [1, 0]]);
    case 'cast': return kf(u, [[0, 0], [0.4, 0.06], [1, 0]]);
    case 'die': return kf(u, [[0, 0], [0.3, 0.05], [0.6, 0], [1, 0]]);
    case 'deploy': return kf(u, [[0, 0.2], [0.4, 0.2], [0.55, 0], [1, 0]]);
    case 'attack': return kf(u, [[0.4, 0], [0.45, 0.04], [0.6, 0]]);
    default: return 0;
  }
}

// ---------- anims (pelvis carries the whole obelisk: offset + lean) ----------
function base(P, t) {
  L.pel(P, Math.sin(t * 0.5) * 0.015, Math.sin(t * 1.1) * 0.05, 0);
  L.R(P, 'pelvis', 0.015 * Math.sin(t * 0.7), 0, 0.015 * Math.sin(t * 0.9));
}
const anims = {
  idle(P, t) { base(P, t); },
  advance(P, t) { base(P, t); L.A(P, 'pelvis', 0.12, 0, 0); P[L.PX + 1] += 0.06; },
  attack(P, u, ctx) {
    base(P, ctx.t);
    const up = kf(u, [[0, 0], [0.32, 1], [0.42, 0], [1, 0]]), slam = kf(u, [[0, 0], [0.4, 0], [0.46, 1], [0.7, 0.6], [1, 0]]);
    L.A(P, 'pelvis', -0.08 * up + 0.16 * slam, 0, 0); P[L.PX + 1] += 0.08 * up - 0.1 * slam; P[L.PX + 2] += 0.1 * slam;
  },
  attack_alt(P, u, ctx) {
    base(P, ctx.t);
    const clap = kf(u, [[0, 0], [0.45, 0], [0.52, 1], [0.8, 0], [1, 0]]), lean = kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]);
    L.A(P, 'pelvis', 0.1 * lean + 0.08 * clap, 0, 0); P[L.PX + 2] += 0.08 * clap;
  },
  cast(P, u, ctx) {
    base(P, ctx.t);
    const k = kf(u, [[0, 0], [0.4, 1], [0.7, 1], [1, 0]]);
    P[L.PX + 1] += 0.15 * k; L.A(P, 'pelvis', -0.06 * k, 0, 0);
  },
  // EVENT HORIZON: rises high, tips back to look over the board, holds while the field forms, crashes back down
  overdrive(P, u, ctx) {
    base(P, ctx.t);
    const rise = kf(u, [[0, 0], [0.28, 1], [0.8, 1], [0.88, -0.15], [0.95, 0.05], [1, 0]]);
    const back = kf(u, [[0, 0], [0.25, 1], [0.55, 1], [0.7, 0], [1, 0]]);
    P[L.PX + 1] += 0.55 * rise; L.A(P, 'pelvis', -0.12 * back + 0.02 * Math.sin(u * 60) * rise, 0.25 * Math.sin(u * PI * 2) * rise, 0);
  },
  hit(P, u, ctx) {
    base(P, ctx.t);
    const k = kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.1 * k, 0, 0.06 * k * d); P[L.PX + 2] -= 0.08 * k;
  },
  // die: the field fails, it drops, the spike digs in, and it tips over sideways (down 0.65)
  die(P, u, ctx) {
    base(P, ctx.t * (1 - u));
    const drop = kf(u, [[0, 0], [0.15, 0.06], [0.45, -0.38], [1, -0.38]]), tip = kf(u, [[0.42, 0], [0.65, 1], [0.72, 0.9], [0.78, 1], [1, 1]]);
    const gl = u < 0.3 ? Math.sin(u * 140) * 0.03 : 0;
    P[L.PX + 1] = drop + gl - 0.12 * tip; P[L.PX] += 0.25 * tip;
    L.R(P, 'pelvis', 0.15 * tip, 0.2 * tip, -1.15 * tip);
  },
  victory(P, t) {
    base(P, t);
    const k = L.smooth(Math.min(1, t / 0.8));
    P[L.PX + 1] += 0.18 * k; L.A(P, 'pelvis', 0, t * 0.6 * k, 0);
  },
  deploy(P, u, ctx) {
    base(P, ctx.t);
    const settle = kf(u, [[0, 0], [0.4, 0], [0.48, -0.12], [0.62, 0.04], [0.75, 0], [1, 0]]);
    P[L.PX + 1] += settle;
  },
};

export default {
  id: 'monolith', name: 'MONOLITH', role: 'tank', faction: 'experimental', rarity: 'epic', realm: 'scifi', noDrop: false,
  rig: 'hover', dims: DIMS, height: 2.5, radius: 0.85, walkSpeed: 0.8, scheme: 'dark',
  style: { weapon: 'fists', heavy: 1 },
  paint: {
    experimental: { paint: 0x3a1784, accent: 0x09080e, trim: 0xc89a3c, glow: 0xa04dff, eye: 0xf2c8ff },
    corporate: { paint: 0x163c8a, accent: 0x080b12, trim: 0xc89a3c },
    rogue: { paint: 0x7a1414, accent: 0x0e0909, trim: 0xd09a3c },
  },
  mats: {
    all: {
      accent: { rough: 0.1, metal: 0.45, env: 0.9, coat: 1, panel: { groove: 0.04, scale: 2 } },
      paint: { rough: 0.3, coat: 1, panel: { groove: 0.25 } },
      metal: { color: 0x7d8494, metal: 0.95, rough: 0.25, panel: { groove: 0.1, scale: 9 } },
      trim: { emissive: 0xffb44a, ei: 0.32, rough: 0.3, metal: 0.9 },
    },
  },
  sockets: { muzzle: ['clavL', [0, 0, 0.1]], muzzleL: ['clavR', [0, 0, 0.1]], hand: ['clavL', [0, 0, 0]], core: [0, 0.27, 0.25], head: [0, 0.3, 0.1], eye: ['chest', [0, 0.27, 0.26]], cap: ['head', [0, 0.47, 0]] },
  events: {
    attack: [['impact', 0.45]], attack_alt: [['impact', 0.5]], cast: [['cast', 0.45]],
    overdrive: [['cast', 0.22], ['impact', 0.55]], die: [['down', 0.65]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 1.1, attack_alt: 1.2, cast: 1.1, overdrive: 2.8, hit: 0.45, die: 2.2, deploy: 1.6 },
  motes: { color: 0xb06cff },
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
    const t = ctx.t, od = act && act.name === 'overdrive' ? kf(ctx.au, [[0, 0], [0.25, 1], [0.85, 1], [1, 0]]) : 0;
    const dying = act && act.name === 'die' ? ctx.au : 0;
    // rings: the lower ring spins flat, the upper ring precesses tilted; both race in the overdrive
    P[BI.aux2 * 3 + 1] = t * (0.4 + 3 * od) * (1 - dying); P[BI.aux2 * 3] = 0.08 * Math.sin(t * 0.6) + 0.3 * od * Math.sin(t * 3);
    P[BI.aux3 * 3 + 1] = -t * (0.7 + 4 * od); P[BI.aux3 * 3] = 0.42 + 0.1 * Math.sin(t * 0.8); P[BI.aux3 * 3 + 2] = 0.2 * Math.sin(t * 0.5);
    P[BI.aux1 * 3 + 1] = t * 0.35 * (1 + 3 * od);
    // debris tumbles round under the spike
    P[BI.footL * 3 + 1] = t * (0.9 + 4 * od); P[BI.footR * 3 + 1] = -t * (0.6 + 3 * od);
    P[BI.footL * 3] = 0.15 * Math.sin(t * 0.7); P[BI.footR * 3 + 2] = 0.15 * Math.sin(t * 0.9);
  },
  tick(unit, dt, ctx, bones) {
    const a = ctx.act || (unit.state.loop !== 'idle' ? unit.state.loop : null), u = ctx.act ? ctx.au : Math.min(1, (ctx.vt = (unit.state.loop === 'victory' ? (ctx.vt || 0) + dt : 0)) / 0.8);
    const t = ctx.t, n = unit.rank >= 4 ? 6 : 4;
    // orbit phase: slow, fast in the overdrive, frozen when it dies
    const sp = a === 'overdrive' ? kf(ctx.au, [[0, 0.5], [0.25, 5], [0.85, 5], [1, 0.5]]) : a === 'die' ? 0.5 * (1 - ctx.au) : a === 'victory' ? 1.2 : 0.45;
    ctx.ph = ((ctx.ph || 0) + dt * sp) % TAU;
    for (let i = 0; i < n; i++) {
      const [ang, R, y, tilt, roll] = slabPose(a, u, i, n, ctx.ph, t);
      const bn = bones[BI[SLABS[i]]];
      bn.position.set(Math.sin(ang) * R, y, Math.cos(ang) * R);
      bn.rotation.set(tilt, ang, roll, 'YXZ');
    }
    for (let i = n; i < SLABS.length; i++) bones[BI[SLABS[i]]].position.set(0, -50, 0);
    // floating shaft gaps
    if (!ctx.rest) ctx.rest = ['spine', 'chest', 'head'].map((nm) => bones[BI[nm]].position.clone());
    const g = 0.035 + 0.012 * Math.sin(t * 1.6) + (a ? gapFor(a, u, t) : 0);
    ['spine', 'chest', 'head'].forEach((nm, i) => bones[BI[nm]].position.copy(ctx.rest[i]).setY(ctx.rest[i].y + g * (i === 2 ? 1.4 : 1)));
    // pupil glances (aux0 sits in front of the eye)
    const pu = bones[BI.aux0];
    if (!ctx.prest) ctx.prest = pu.position.clone();
    pu.position.set(ctx.prest.x + ctx.st.gy * 0.09, ctx.prest.y + ctx.st.gp * 0.12, ctx.prest.z);
    // deploy: the fall decelerates (gravity brake) instead of the kit's accelerating drop
    if (ctx.act === 'deploy') { const fu = Math.min(1, u / 0.4); unit.body.position.y = 7 * (1 - fu) * (1 - fu) * (1 - fu); }
    // R5 gravity lens
    if (unit.rank >= 5) {
      const m = lens(unit, ctx);
      const od = ctx.act === 'overdrive' ? kf(ctx.au, [[0, 0], [0.25, 1], [0.85, 1], [1, 0]]) : 0;
      const dead = unit.state.dead || ctx.act === 'die' ? 1 - Math.min(1, ctx.au * 2) : 1;
      m.material.uniforms.uTime.value = t; m.material.uniforms.uA.value = (0.55 + 0.1 * Math.sin(t * 2) + 0.4 * od) * dead;
      const s = 1 + 0.25 * od + 0.02 * Math.sin(t * 1.3);
      m.scale.set(s, 1.45 * s, s); m.visible = dead > 0.01;
      if (!unit.extraDrawCalls) unit.extraDrawCalls = () => (m.visible ? 1 : 0);
    }
  },
  fxHints: { projectile: 'slab', impact: 'gravity_maul', overdrive: 'event_horizon', color: 0xa04dff },
  build,
};
