// WOLF: DIRE WOLF (horde, ember) / FROST WOLF (order, frost). D21 fantasy, M quadruped on the 'beast' rig. sculptor-17.
// One model, the variant follows the faction (order = frost, anything else = ember; wild tints it green).
// Fur = smooth noise-displaced body masses + hundreds of flat-shaded tufts scattered over them with a flow direction,
// plus a canvas strand texture (paint/accent detail). Ears ride aux2/aux3 (re-parented to the head) so they can flick.
import { THREE, pod, fin, deform, PI } from '../kit.js';

const Z0 = -0.4;        // pelvis shift so the body is centred over the plate
const AF = 0.12;        // front wrist height (pastern + paw below it)
const TAILX = 1.1;      // tail rest: rotates the -Y pod back and down
const HEADK = 1.18;     // head scale (skull, jaw, ears) about the head joint; the aux1-3 offsets in WOLF_DIMS are pre-scaled
export const WOLF_DIMS = {
  hover: 0.86, thigh: 0.36, shin: 0.42, ankle: 0.2, hipX: 0.13, hipY: -0.04, upArm: 0.38, foreArm: 0.4, shoulder: 0.0,
  frontZ: 0.68, footX: 0.13,
  offsets: { spine: [0, 0.04, 0.3], chest: [0, 0.03, 0.36], neck: [0, 0.08, 0.16], head: [0, 0.06, 0.14], clavL: [0.13, -0.04, 0.04], upArmL: [0, 0, 0] },
  parents: { aux0: 'pelvis', aux2: 'head', aux3: 'head' },
  aux0: [0, 0.06, -0.16], aux1: [0, -0.059, 0.094], aux2: [0.077, 0.094, -0.012], aux3: [-0.077, 0.094, -0.012],
};

// ---------- small geometry helpers (model-local) ----------
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// rotation (Euler XYZ) that maps +Y onto dir and +Z toward ref
const _m = new THREE.Matrix4(), _e = new THREE.Euler();
function orient(dir, ref) {
  const y = dir.clone().normalize();
  let z = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y)));
  if (z.lengthSq() < 1e-6) z = V(1, 0, 0).cross(y);
  z.normalize();
  const x = V(0, 0, 0).crossVectors(y, z);
  _m.makeBasis(x, y, z);
  _e.setFromRotationMatrix(_m, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
// a fur tuft: diamond cross-section spike along +Y, curving toward +Z (flat shaded, ~12 tris)
function tuftGeo(len, w, bend = 0.3, t = 0.45) {
  const ring = (y, k, z) => [[w * k, y, z], [0, y, z + t * w * k], [-w * k, y, z], [0, y, z - t * w * k]];
  const p = [...ring(0, 1, 0), ...ring(len * 0.5, 0.7, bend * len * 0.28), [0, len, bend * len]].flat(), idx = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, 4 + i, j, j, 4 + i, 4 + j, 4 + i, 8, 4 + j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();   // shared verts: soft, rounded clumps instead of faceted shards
  return g;
}
// smooth lumpy ellipsoid (indexed, so normals stay soft)
function blob(b, r, amp = 0.05, seed = 1, ws = 15, hs = 11) {
  const g = b.sph(ws, hs), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = Math.sin(x * 4.1 + seed) * Math.sin(y * 3.3 + seed * 1.7) + 0.5 * Math.sin(z * 5.7 + x * 2.3 + seed * 0.3);
    const k = 1 + amp * n;
    P.setXYZ(i, x * k * r[0], y * k * r[1], z * k * r[2]);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- fur detail texture (strands; rgb 0.5 = neutral) ----------
function furTex(g, w, h, r) {
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {   // soft clumps
    const x = r() * w, y = r() * h, R = 20 + r() * 50, gr = g.createRadialGradient(x, y, 0, x, y, R);
    const v = r() < 0.5 ? 90 : 170;
    gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = r() * w, y = r() * h, L = 6 + r() * 16, a = PI / 2 + (r() - 0.5) * 0.9, light = r() < 0.45;
    const v = light ? 175 + r() * 60 : 40 + r() * 50;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.25 + r() * 0.35})`;
    g.lineWidth = 0.7 + r() * 1.3;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
}

// ---------- palette per faction: paint = body fur, accent = dark saddle / nose / leather, trim = pale fur (bib, cheeks, belly),
// metal = bone (claws, fangs, collar spikes) or ice on frost wolves ----------
const PAINT = {
  horde: { paint: 0x3b2f29, accent: 0x110d0c, trim: 0x6a4630 },
  order: { paint: 0x52627a, accent: 0x1f2a3e, trim: 0xb4c4d8 },
  wild: { paint: 0x5e4e38, accent: 0x222a1a, trim: 0xa08a5c },
  legendary: { paint: 0x2e2622, accent: 0x110d0b, trim: 0xe0a848 },
  corporate: { paint: 0x4a5462, accent: 0x161c26, trim: 0x9aa8b8 },
  rogue: { paint: 0x4a3a30, accent: 0x171210, trim: 0x9a6a44 },
  experimental: { paint: 0x4c4458, accent: 0x1a1624, trim: 0xa898c8 },
};
const FUR = { map: furTex, scale: 2.6, albedo: 0.9, rough: 0.35, scratch: 0.25 };
const FURMAT = { detail: FUR, metal: 0.0, panel: { grime: 0.16, grimeScale: 16, grimeRough: 0.1, stretch: 0.5 } };

// ---------- build ----------
function build(b, o) {
  const r = o.rank, far = b.far, W = b.rig.world, D = b.rig.D, frost = o.faction === 'order';
  const rnd = rng(17 + r);
  const at = (bone, p) => [p[0] - W[bone][0], p[1] - W[bone][1], p[2] - W[bone][2]];
  const add = (g, bone, slot, p, rot, s) => b.add(g, bone, slot, at(bone, p), rot, s);
  const side = (bone) => (bone + 'L' in W ? bone + 'L' : bone);
  const sym = (g, bone, slot, p, rot, s) => b.sym(g, bone, slot, at(side(bone), p), rot, s);
  const H = W.head, N = W.neck;
  const hp = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];   // head-relative world point
  const furK = far ? 0.4 : [0.64, 0.84, 0.92, 0.96, 1, 1][r];   // robots touch-up: common trimmed ~1k tris to fit its budget
  // shingled fur: flat leaf-like clumps scattered over an ellipsoid, lying along `flow`, curling in.
  // f: { c, r, n, len:[a,b], w, flow, lift, keep(d), slot(d) -> slot name, bend, sym, sink }
  function fur(bone, f) {
    const n = Math.max(1, Math.round(f.n * furK)), c = V(...f.c), R = V(...f.r), flow = V(...f.flow).normalize();
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 40) {
      const d = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      const l2 = d.lengthSq();
      if (l2 > 1 || l2 < 0.01) continue;
      d.normalize();
      if (f.sym && d.x < 0) d.x = -d.x;
      if (f.keep && !f.keep(d)) continue;
      const p = V(c.x + d.x * R.x, c.y + d.y * R.y, c.z + d.z * R.z);
      const nrm = V(d.x / R.x, d.y / R.y, d.z / R.z).normalize();
      const lift = f.lift ?? 0.36;
      const fl = typeof f.flow === 'function' ? f.flow(d) : flow;
      const dir = nrm.clone().multiplyScalar(lift).addScaledVector(fl, 1 - lift).normalize();
      const L = f.len[0] + (f.len[1] - f.len[0]) * rnd();
      const g = tuftGeo(L, (f.w ?? 0.46) * L, f.bend ?? 0.26, f.t ?? 0.34);
      const slot = typeof f.slot === 'function' ? f.slot(d) : f.slot || 'paint';
      const pp = p.addScaledVector(nrm, -(f.sink ?? 0.02));
      const rot = orient(dir, nrm.clone().negate());
      if (f.sym) sym(g, bone, slot, [pp.x, pp.y, pp.z], rot);
      else add(g, bone, slot, [pp.x, pp.y, pp.z], rot);
      placed++;
    }
  }
  // coat zones: dark saddle on top, body colour on the flanks, pale underside
  const coat = (hi = 0.45, lo = -0.45) => (d) => { const w = 0.12 * Math.sin(d.z * 7 + d.x * 3); return d.y + w > hi ? 'accent' : d.y + w < lo ? 'trim' : 'paint'; };
  const back = [0, -0.25, -1];

  // ---- body masses (covered by the shingles; they only fill gaps) ----
  add(blob(b, [0.17, 0.19, 0.22], 0.05, 1), 'pelvis', 'paint', [0, 0.9, -0.02]);
  add(blob(b, [0.15, 0.17, 0.26], 0.04, 2), 'spine', 'paint', [0, 0.9, 0.3]);
  add(blob(b, [0.2, 0.26, 0.28], 0.05, 3), 'chest', 'paint', [0, 0.88, 0.6]);
  add(blob(b, [0.15, 0.12, 0.2], 0.05, 4), 'chest', 'accent', [0, 1.02, 0.66]);                       // withers hump
  add(blob(b, [0.13, 0.08, 0.3], 0.04, 20, 12, 8), 'spine', 'accent', [0, 0.99, 0.34]);              // dark saddle
  add(blob(b, [0.15, 0.1, 0.2], 0.04, 21, 12, 8), 'pelvis', 'accent', [0, 1.0, -0.02]);
  add(blob(b, [0.15, 0.16, 0.17], 0.06, 5), 'neck', 'paint', [N[0], N[1] - 0.01, N[2] + 0.03]);
  sym(blob(b, [0.075, 0.17, 0.12], 0.06, 6, 12, 10), 'chest', 'paint', [0.14, 0.9, 0.7], [0.25, 0, -0.12]);   // shoulder blades

  // ---- head: wedge skull, long muzzle, heavy brow, slanted eyes, snarl ----
  b.scope([0, 0, 0], [0, 0, 0], HEADK, () => {
  add(blob(b, [0.1, 0.088, 0.11], 0.03, 8, 16, 12), 'head', 'paint', hp(0, 0.02, -0.01));
  sym(blob(b, [0.05, 0.05, 0.065], 0.05, 9, 10, 8), 'head', 'paint', hp(0.055, -0.035, 0.03));          // cheeks
  const muzzle = pod(b, 0, -0.26, [0.076, 0.072, 0.06, 0.046], 12);
  add(muzzle, 'head', 'paint', hp(0, -0.015, 0.04), [-PI / 2 + 0.14, 0, 0], [1, 1, 0.74]);
  add(blob(b, [0.045, 0.022, 0.15], 0.02, 10, 10, 6), 'head', 'accent', hp(0, 0.035, 0.15), [0.12, 0, 0]);   // dark bridge
  add(blob(b, [0.034, 0.026, 0.03], 0.02, 11, 10, 8), 'head', 'accent', hp(0, -0.045, 0.31));               // nose
  sym(blob(b, [0.052, 0.02, 0.05], 0.05, 12, 10, 6), 'head', 'accent', hp(0.048, 0.06, 0.07), [0.1, 0.3, -0.42]);   // brows
  sym(b.sph(10, 8), 'head', 'eye', hp(0.05, 0.03, 0.095), [0, 0.45, -0.35], [0.024, 0.01, 0.014]);
  const fang = (L, rr = 0.01) => b.cyl(0.0, rr, L, 6);
  sym(fang(0.065, 0.012), 'head', 'metal', hp(0.034, -0.085, 0.27), [PI + 0.15, 0, 0]);
  if (!far) sym(fang(0.03), 'head', 'metal', hp(0.042, -0.075, 0.21), [PI, 0, 0]);
  sym(b.tube([[0.045, -0.07, 0.08], [0.05, -0.078, 0.18], [0.04, -0.08, 0.27]], 0.009, 6, 4), 'head', 'accent', [H[0], H[1], H[2]]);   // dark lip line
  // jaw on aux1 + glowing maw
  b.add(pod(b, 0, -0.25, [0.048, 0.046, 0.036, 0.026], 10), 'aux1', 'paint', [0, -0.01, -0.01], [-PI / 2 + 0.08, 0, 0], [1, 1, 0.55]);
  b.add(pod(b, 0, -0.18, [0.04, 0.036, 0.026], 8), 'aux1', 'trim', [0, -0.03, 0.0], [-PI / 2 + 0.1, 0, 0], [1, 1, 0.5]);
  b.sym(fang(0.05, 0.011), 'aux1', 'metal', [0.026, 0.018, 0.2], [0.1, 0, 0]);
  if (!far) for (let i = 0; i < 2; i++) b.sym(fang(0.02), 'aux1', 'metal', [0.032, 0.008, 0.15 - i * 0.04]);
  b.add(b.box(0.05, 0.012, 0.17), 'aux1', 'glow', [0, 0.008, 0.09]);
  // ears (aux2 / aux3 on the head): tall, cupped, with a dark rim and pale inner fur
  for (const s of [1, -1]) {
    const bone = s > 0 ? 'aux2' : 'aux3', rot = [-0.3, s * -0.25, s * -0.22];
    const e = deform(fin(b, [[-0.05, 0], [0.05, 0], [0.014, 0.14], [-0.006, 0.155]], 0.03, 0.01), (v) => { v.z -= v.y * v.y * 1.1 - Math.abs(v.x) * 0.25; });
    b.add(e, bone, 'accent', [0, 0, 0], rot);
    b.add(fin(b, [[-0.033, 0.01], [0.033, 0.01], [0.006, 0.105]], 0.012, 0.003), bone, 'trim', [0, 0.004, 0.016], rot);
  }

  });
  // ---- legs ----
  b.sym(blob(b, [0.075, D.upArm * 0.55, 0.098], 0.05, 13, 12, 10), 'upArm', 'paint', [0, -D.upArm * 0.38, -0.005]);
  b.sym(pod(b, 0.02, -D.foreArm, [0.07, 0.064, 0.05, 0.04], 10), 'foreArm', 'paint');
  b.sym(pod(b, 0.02, -AF + 0.02, [0.038, 0.04, 0.044], 8), 'hand', 'paint', [0, 0, 0.012], [0.2, 0, 0]);
  b.sym(blob(b, [0.098, D.thigh * 0.66, 0.135], 0.05, 14, 12, 10), 'thigh', 'paint', [0.01, -D.thigh * 0.36, 0.02]);
  b.sym(pod(b, 0.03, -D.shin, [0.075, 0.066, 0.048, 0.036], 10), 'shin', 'paint');
  b.sym(pod(b, 0.02, -D.ankle + 0.03, [0.04, 0.036, 0.04], 8), 'foot', 'paint', [0, 0, 0.0], [-0.12, 0, 0]);
  const paw = (bone, h) => {
    b.sym(blob(b, [0.058, 0.036, 0.074], 0.05, 15, 10, 8), bone, 'paint', [0, -h + 0.032, 0.035]);
    for (const x of [-0.032, -0.011, 0.011, 0.032]) {
      b.sym(b.sph(8, 6), bone, 'accent', [x, -h + 0.024, 0.092 - Math.abs(x) * 0.6], [0, 0, 0], [0.018, 0.02, 0.024]);
      if (!far) b.sym(b.cyl(0.0, 0.008, 0.045, 5), bone, 'metal', [x * 1.05, -h + 0.014, 0.12 - Math.abs(x) * 0.6], [PI / 2 + 0.55, 0, 0]);
    }
  };
  paw('hand', AF); paw('foot', D.ankle);
  // joint masses so the limbs read as one muscular leg, not tubes
  b.sym(blob(b, [0.062, 0.075, 0.075], 0.05, 16, 10, 8), 'foreArm', 'paint', [0, -0.01, -0.025]);
  b.sym(blob(b, [0.045, 0.05, 0.05], 0.05, 17, 10, 8), 'hand', 'paint', [0, -0.005, 0.0]);
  b.sym(blob(b, [0.078, 0.085, 0.09], 0.05, 18, 10, 8), 'shin', 'paint', [0, -0.01, 0.02]);
  b.sym(blob(b, [0.05, 0.065, 0.06], 0.05, 19, 10, 8), 'foot', 'paint', [0, -0.005, -0.015]);
  const FA = W.foreArmL, SH = W.shinL;
  fur('foreArm', { c: [FA[0], FA[1] - D.foreArm * 0.35, FA[2]], r: [0.06, D.foreArm * 0.45, 0.06], n: 26, len: [0.07, 0.12], flow: [0, -1, -0.45], lift: 0.5, sym: true, keep: (d) => d.y > -0.75, slot: (d) => (d.z < -0.2 ? 'trim' : 'paint') });
  fur('shin', { c: [SH[0], SH[1] - D.shin * 0.35, SH[2]], r: [0.07, D.shin * 0.45, 0.07], n: 24, len: [0.08, 0.12], flow: [0, -1, -0.5], lift: 0.5, sym: true, keep: (d) => d.y > -0.75, slot: (d) => (d.z < -0.2 ? 'trim' : 'paint') });
  // leg fur: shingles on the upper legs, feathering down the backs
  const UA = W.upArmL, TH = W.thighL;
  fur('upArm', { c: [UA[0] + 0.005, UA[1] - D.upArm * 0.38, UA[2]], r: [0.08, D.upArm * 0.55, 0.1], n: 44, len: [0.09, 0.15], lift: 0.42, flow: [0, -1, -0.25], sym: true, keep: (d) => d.y > -0.6, slot: (d) => (d.z < -0.3 ? 'trim' : 'paint') });
  fur('thigh', { c: [TH[0] + 0.01, TH[1] - D.thigh * 0.36, TH[2] + 0.02], r: [0.1, D.thigh * 0.66, 0.14], n: 50, len: [0.1, 0.16], lift: 0.42, flow: [0, -0.9, -0.5], sym: true, keep: (d) => d.y > -0.7, slot: (d) => (d.z < -0.4 ? 'trim' : 'paint') });
  const feather = (bone, n, y0, dy, L, z) => {
    for (let i = 0; i < Math.ceil(n * furK); i++) b.sym(tuftGeo(L * (1 - i * 0.08), 0.5 * L, 0.25, 0.24), bone, i % 3 === 2 ? 'paint' : 'trim', [0.005, y0 - i * dy, z], orient(V(0, -0.55, -1), V(0, -1, 0)));
  };
  feather('foreArm', 4, -0.04, 0.07, 0.09, -0.045);
  feather('shin', 4, -0.06, 0.08, 0.09, -0.055);
  feather('thigh', 3, -0.15, 0.08, 0.13, -0.14);

  // ---- tail: bushy, dark on top ----
  b.add(pod(b, 0.0, -0.5, [0.045, 0.075, 0.08, 0.055, 0.02], 10), 'aux0', 'paint', [0, 0, 0], [TAILX, 0, 0]);
  const tE = new THREE.Euler(TAILX, 0, 0), tipDir = V(0, -1, 0).applyEuler(tE);
  for (let i = 0; i < Math.round(30 * furK); i++) {
    const s = 0.04 + (i / 30) * 0.46, a = i * 2.39, rad = 0.05 + Math.sin(PI * Math.min(1, s / 0.5)) * 0.035;
    const axis = V(0, -s, 0).applyEuler(tE), off = V(Math.cos(a), 0, Math.sin(a)).applyEuler(tE);
    const L = 0.11 + 0.06 * Math.sin(PI * s / 0.55);
    const up = off.y > 0.2;
    b.add(tuftGeo(L, 0.5 * L, 0.2, 0.24), 'aux0', up ? 'accent' : s > 0.42 ? 'accent' : 'paint', [axis.x + off.x * rad, axis.y + off.y * rad, axis.z + off.z * rad],
      orient(tipDir.clone().addScaledVector(off, 0.35), off.clone().negate()));
  }

  // ---- body coat ----
  fur('pelvis', { c: [0, 0.9, -0.02], r: [0.17, 0.19, 0.22], n: 56, len: [0.1, 0.15], flow: back, keep: (d) => d.z < 0.55, slot: coat(0.05, -0.6) });
  fur('spine', { c: [0, 0.9, 0.3], r: [0.15, 0.17, 0.26], n: 50, len: [0.1, 0.15], flow: back, slot: coat(0.0, -0.55) });
  fur('chest', { c: [0, 0.88, 0.6], r: [0.2, 0.26, 0.28], n: 70, len: [0.11, 0.17], flow: [0, -0.35, -1], slot: coat(0.1, -0.45) });
  // belly fringe + chest bib hang down (pale)
  fur('spine', { c: [0, 0.8, 0.36], r: [0.12, 0.08, 0.3], n: 16, len: [0.1, 0.16], flow: [0, -1, -0.35], lift: 0.05, keep: (d) => d.y < -0.3, slot: 'trim' });
  fur('chest', { c: [0, 0.8, 0.76], r: [0.14, 0.2, 0.13], n: 30, len: [0.12, 0.2], flow: [0, -1, 0.1], lift: 0.15, keep: (d) => d.z > 0.1, slot: (d) => (d.y > 0.3 ? 'paint' : 'trim') });
  // the big ruff around the neck and over the shoulders (silhouette), dark on top
  const ruffN = [46, 54, 62, 68, 74, 80][r], ruffL = [0.15, 0.17, 0.19, 0.2, 0.21, 0.22][r];
  fur('neck', { c: [N[0], N[1] - 0.01, N[2] + 0.02], r: [0.18, 0.2, 0.2], n: ruffN, len: [ruffL * 0.6, ruffL], w: 0.55, flow: [0, -0.1, -1], lift: 0.42, bend: 0.3, keep: (d) => d.z < 0.7, slot: coat(-0.05, -0.4) });
  // cheek ruff framing the face (pale), head fur
  b.scope([0, 0, 0], [0, 0, 0], HEADK, () => {
      fur('head', { c: hp(0, 0.0, 0.0), r: [0.11, 0.1, 0.11], n: 26, len: [0.06, 0.11], flow: [0, -0.35, -1], lift: 0.45, sym: true, keep: (d) => d.z < 0.35 && d.x > 0.35, slot: (d) => (d.y > 0.3 ? 'paint' : 'trim') });
    fur('head', { c: hp(0, 0.02, -0.01), r: [0.1, 0.09, 0.11], n: 12, len: [0.04, 0.07], flow: [0, 0.1, -1], lift: 0.2, keep: (d) => d.y > 0.4, slot: 'accent' });
  });
  // hackles along the spine (stand up, dark)
  const hk = [9, 11, 12, 13, 14, 15][r];
  for (let i = 0; i < hk; i++) {
    const z = 0.8 - i * (0.9 / hk), y = 1.1 - Math.abs(z - 0.5) * 0.1, L = (0.07 + 0.05 * Math.sin((i / hk) * PI) + r * 0.006) * (0.85 + 0.3 * rnd());
    const bone = z > 0.62 ? 'neck' : z > 0.15 ? 'spine' : 'pelvis';
    for (const x of [-0.045, 0.0, 0.045]) add(tuftGeo(L * (x ? 0.8 : 1), 0.55 * L, 0.4, 0.3), bone, 'accent', [x, y - 0.025, z + (x ? 0.04 : 0)], orient(V(x * 5, 0.55, -1), V(0, 1, 0.2)));
  }

  // ---- variant glow: ember cracks + smouldering fur tips / frost veins + ice crystals (metal slot = ice) ----
  const nCr = far ? 4 : [6, 7, 9, 11, 13, 15][r];
  const masses = [['chest', [0, 0.88, 0.6], [0.2, 0.26, 0.28]], ['pelvis', [0, 0.9, -0.02], [0.17, 0.19, 0.22]], ['spine', [0, 0.9, 0.3], [0.15, 0.17, 0.26]], ['neck', [N[0], N[1] - 0.01, N[2] + 0.03], [0.15, 0.16, 0.17]]];
  for (let i = 0; i < nCr; i++) {
    const [bone, c, R] = masses[i % masses.length];
    const lat0 = 0.0 + rnd() * 0.7, lon = (rnd() < 0.5 ? 1 : -1) * (1.0 + rnd() * 1.1);
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const la = lat0 - k * 0.2, lo = lon + Math.sin(k * 1.7 + i) * 0.14;
      const d = V(Math.sin(lo) * Math.cos(la), Math.sin(la), Math.cos(lo) * Math.cos(la));
      pts.push(at(bone, [c[0] + d.x * R[0] * 1.07, c[1] + d.y * R[1] * 1.07, c[2] + d.z * R[2] * 1.07]));
    }
    b.add(b.tube(pts, frost ? 0.007 : 0.014 + 0.003 * (r >= 3), 8, 4), bone, 'glow');
  }
  if (!frost) {
    // smouldering tips: short glowing tufts poking out of the saddle
    const nE = far ? 4 : [8, 10, 13, 16, 19, 22][r];
    for (let i = 0; i < nE; i++) {
      const [bone, c, R] = masses[i % 3];
      const d = V(rnd() - 0.5, 0.7 + rnd() * 0.3, rnd() - 0.5).normalize();
      const p = [c[0] + d.x * R[0] * 1.08, c[1] + d.y * R[1] * 1.08, c[2] + d.z * R[2] * 1.08];
      add(tuftGeo(0.06 + rnd() * 0.04, 0.026, 0.3, 0.3), bone, 'glow', p, orient(V(d.x, d.y, d.z).add(V(0, 0.2, -0.8)), V(0, 1, 0)));
    }
  }
  if (frost) {
    const nI = far ? 3 : [2, 4, 6, 8, 10, 12][r];
    const spots = [['chest', [0.15, 1.06, 0.66], [0.6, 1, -0.4]], ['chest', [-0.15, 1.06, 0.66], [-0.6, 1, -0.4]], ['spine', [0.07, 1.07, 0.34], [0.4, 1, -0.5]],
      ['spine', [-0.07, 1.07, 0.3], [-0.4, 1, -0.5]], ['pelvis', [0.08, 1.07, 0.0], [0.4, 1, -0.6]], ['pelvis', [-0.08, 1.07, -0.04], [-0.4, 1, -0.6]],
      ['neck', [0.11, N[1] + 0.12, N[2] - 0.04], [0.5, 1, -0.3]], ['neck', [-0.11, N[1] + 0.12, N[2] - 0.04], [-0.5, 1, -0.3]], ['chest', [0.0, 1.13, 0.56], [0, 1, -0.4]],
      ['pelvis', [0.0, 1.09, -0.1], [0, 1, -0.8]], ['spine', [0.13, 0.99, 0.24], [1, 0.6, -0.3]], ['spine', [-0.13, 0.99, 0.24], [-1, 0.6, -0.3]]];
    for (let i = 0; i < nI; i++) {
      const [bone, p, d] = spots[i], L = 0.1 + 0.05 * rnd() + r * 0.014;
      add(b.cyl(0, 0.024 + L * 0.12, L, 5).translate(0, L / 2, 0), bone, 'metal', p, orient(V(...d), V(0, 0, 1)));
      add(b.cyl(0, 0.014, L * 0.6, 5).translate(0, L * 0.3, 0), bone, 'metal', [p[0] + d[0] * 0.02, p[1], p[2] + 0.04], orient(V(d[0] * 1.6, 1, d[2] + 0.3), V(0, 0, 1)));
      if (r >= 3 && i % 2 === 0) add(b.cyl(0, 0.008, L * 0.8, 4).translate(0, L * 0.4, 0), bone, 'glow', p, orient(V(...d), V(0, 0, 1)));
    }
  }

  // ---- rank ladder ----
  if (r >= 2) {
    // collar: dark leather band with bone (horde) / ice (frost) spikes, sitting in the ruff
    const tilt = -0.62, cz = N[2] + 0.02, cy = N[1] - 0.02;
    add(b.tor(0.2, 0.022, 22, 5), 'neck', 'accent', [0, cy, cz], [tilt, 0, 0], [1, 1.1, 1]);
    for (let i = 0; i < (far ? 4 : 9); i++) {
      const a = (i / 9) * PI * 2 + 0.35;
      const p = V(Math.cos(a) * 0.21, Math.sin(a) * 0.21 * 1.1, 0).applyEuler(new THREE.Euler(tilt, 0, 0));
      add(b.cyl(0, 0.016, 0.065, 5).translate(0, 0.032, 0), 'neck', 'metal', [p.x, cy + p.y, cz + p.z], orient(p.clone(), V(0, 0, 1)));
    }
  }
  if (r >= 3) {
    for (const bone of ['hand', 'foot']) b.sym(b.sph(6, 4), bone, 'glow', [0, -(bone === 'hand' ? AF : D.ankle) + 0.016, 0.13], [0, 0, 0], [0.045, 0.008, 0.012]);
  }
  if (r >= 4) {
    // silhouette: a crest of flame (ember) / ice blades (frost) along the spine
    const nF = far ? 4 : 9;
    for (let i = 0; i < nF; i++) {
      const z = 0.78 - i * 0.1, bone = z > 0.62 ? 'neck' : z > 0.15 ? 'spine' : 'pelvis', y = 1.15 - Math.abs(z - 0.45) * 0.1;
      const L = 0.13 + 0.12 * Math.sin(((i + 0.5) / nF) * PI);
      const sh = frost ? [[-0.032, 0], [0.032, 0], [0.008, L], [-0.004, L * 0.9]] : [[-0.04, 0], [0.034, 0], [0.012, L * 0.55], [0.026, L], [-0.014, L * 0.6]];
      add(fin(b, sh, 0.014, 0.004), bone, frost ? 'metal' : 'glow', [0, y, z], [-0.55, PI / 2, 0]);
    }
  }
  if (r >= 5) {
    // crown: curled bone horns (ember) / ice horns (frost) + a rune ring hovering behind the head
    for (const s of [1, -1]) add(b.tube([[0, 0, 0], [s * 0.05, 0.06, -0.06], [s * 0.09, 0.14, -0.1], [s * 0.07, 0.23, -0.07]], 0.017, 10, 5), 'head', 'metal', hp(s * 0.05, 0.07, -0.03));
    add(b.tor(0.2, 0.009, 32, 4), 'neck', 'glow', [0, N[1] + 0.2, N[2] - 0.1], [0.35, 0, 0]);
  }
}

// ---------- anims (all bespoke; shared helpers copied from anims_beast.js and extended) ----------
const TAU = PI * 2;
function feet(P, ctx, F, L) {
  const _t = feet._t || (feet._t = new THREE.Vector3());
  L.armIK(P, ctx, 'L', _t.set(F.FL[0], F.FL[1], F.FL[2]), -0.12);
  L.armIK(P, ctx, 'R', _t.set(F.FR[0], F.FR[1], F.FR[2]), -0.12);
  L.legIK(P, ctx, 'L', F.BL[0], F.BL[1], F.BL[2], F.BL[3] || 0);
  L.legIK(P, ctx, 'R', F.BR[0], F.BR[1], F.BR[2], F.BR[3] || 0);
  for (const s of ['L', 'R']) {
    const i = L.BI['upArm' + s] * 3, f = L.BI['foreArm' + s] * 3, h = L.BI['hand' + s] * 3;
    P[h] = -(P[i] + P[f] + P[L.BI.spine * 3] + P[L.BI.chest * 3] + P[0]) + (F['p' + s] || 0);
  }
}
// k: dy dz pitch roll spine chest neck head tail wag jaw earL earR earB fz bz yaw (all optional)
function base(P, ctx, t, k, L) {
  const D = ctx.D, st = ctx.st, br = Math.sin(t * 2.4);
  L.pel(P, k.dx || 0, (k.dy || 0) + br * 0.007, Z0 + (k.dz || 0));
  L.R(P, 'pelvis', k.pitch || 0, k.yaw || 0, k.roll || 0);
  L.R(P, 'spine', 0.025 * br + (k.spine || 0), (k.sy || 0), 0);
  L.R(P, 'chest', -0.03 * br + (k.chest || 0), (k.sy || 0), 0);
  L.R(P, 'neck', (k.neck || 0) + st.gp * 0.4, st.gy * 0.55 * (k.look ?? 1), 0);
  L.R(P, 'head', (k.head || 0) + st.gp * 0.3, st.gy * 0.35 * (k.look ?? 1), st.tilt + (k.tilt || 0));
  L.R(P, 'aux0', -0.15 + (k.tail || 0) + Math.sin(t * 1.7) * 0.05, Math.sin(t * 2.6) * 0.3 * (k.wag ?? 1), 0);
  L.R(P, 'aux1', k.jaw || 0, 0, 0);
  const eb = k.earB || 0;
  L.R(P, 'aux2', eb + (k.earL || 0), 0, -eb * 0.3);
  L.R(P, 'aux3', eb + (k.earR || 0), 0, eb * 0.3);
  const fx = D.footX, bx = D.hipX * 1.02, fz = D.frontZ + Z0, bz = -0.03 + Z0;
  return { FL: [fx, AF, fz + (k.fz || 0)], FR: [-fx, AF, fz + (k.fz || 0)], BL: [bx, D.ankle, bz + (k.bz || 0)], BR: [-bx, D.ankle, bz + (k.bz || 0)] };
}
const pulse = (t, period, len, off = 0) => { const x = ((t + off) % period) / len; return x < 1 ? Math.sin(PI * x) : 0; };

const anims = {
  idle(P, t, ctx, L) {
    // breathing, a periodic sniff at the ground, ear flicks, weight shifts, slow tail sway
    const sniff = L.smooth(Math.min(1, Math.max(0, pulse(t, 7.3, 2.2, 1.5) * 1.6)));
    const tw = sniff * Math.max(0, Math.sin(t * 22)) * 0.04;
    const shift = Math.sin(t * 0.7) * 0.015;
    const F = base(P, ctx, t, { dy: -0.015 + 0.02 * sniff * 0 - 0.02 * sniff, dx: shift, neck: 0.45 * sniff, head: 0.25 * sniff + tw, jaw: 0.04 + 0.03 * Math.max(0, Math.sin(t * 1.3)),
      earL: -0.5 * pulse(t, 3.1, 0.22) + 0.3 * sniff, earR: -0.5 * pulse(t, 4.3, 0.22, 1.2) + 0.3 * sniff, look: 1 - sniff, tail: -0.05 }, L);
    feet(P, ctx, F, L);
  },
  advance(P, t, ctx, L) {
    // trot: diagonal pairs, spine flex, head steady-forward, ears back, tail streaming
    const m = ctx.move, d = m.stride * 1.15, duty = 0.5, ph = m.phase;
    const bob = Math.sin(TAU * 2 * ph);
    const F = base(P, ctx, t, { dy: -0.02 + 0.022 * bob, pitch: 0.03 * Math.sin(TAU * 2 * ph + 1), neck: 0.12 - 0.03 * bob, head: 0.05 + 0.03 * bob, earB: 0.35, tail: 0.25, wag: 0.25,
      roll: 0.025 * Math.sin(TAU * ph), sy: 0.04 * Math.sin(TAU * ph), look: 0.3, jaw: 0.12 }, L);
    const order = { FL: 0, BR: 0, FR: 0.5, BL: 0.5 };
    for (const k of ['FL', 'FR', 'BL', 'BR']) {
      const p = (ph + order[k]) % 1;
      let z, y = 0;
      if (p < duty) z = d / 2 - d * (p / duty);
      else { const u = (p - duty) / (1 - duty); z = -d / 2 + d * L.smooth(u); y = (k[0] === 'F' ? 0.13 : 0.1) * Math.sin(PI * u); }
      F[k][2] += z; F[k][1] += y;
    }
    feet(P, ctx, F, L);
  },
  attack(P, u, ctx, L) {
    // pounce-bite: coil low, spring up and forward, front paws reach, jaws snap at 0.48, land and shake
    const kf = L.kf;
    const coil = kf(u, [[0, 0], [0.26, 1], [0.36, 0], [1, 0]]);
    const air = kf(u, [[0, 0], [0.3, 0], [0.42, 1], [0.54, 0.45], [0.64, 0], [1, 0]]);
    const fwd = kf(u, [[0, 0], [0.3, -0.06], [0.46, 0.4], [0.62, 0.36], [1, 0]]);
    const land = kf(u, [[0, 0], [0.56, 0], [0.64, 1], [0.8, 0.2], [1, 0]]);
    const F = base(P, ctx, ctx.t, { dy: -0.17 * coil + 0.3 * air - 0.1 * land, dz: fwd, pitch: 0.16 * coil - 0.32 * air + 0.18 * land, neck: 0.35 * coil - 0.2 * air + 0.3 * land, head: 0.15 * coil + 0.35 * kf(u, [[0, 0], [0.42, 0], [0.5, 1], [0.7, 0]]),
      jaw: kf(u, [[0, 0.05], [0.3, 0.25], [0.44, 0.75], [0.49, 0.02], [0.6, 0.25], [0.8, 0.1], [1, 0.05]]), earB: 0.6 * Math.max(coil, air), tail: -0.25 * coil + 0.35 * air, wag: 0.1,
      fz: 0.36 * fwd / 0.4 * kf(u, [[0, 0], [0.5, 0.2], [0.6, 1], [1, 1]]), bz: fwd * kf(u, [[0, 0], [0.4, 0], [0.62, 1], [1, 1]]) }, L);
    // front paws lift off and reach while airborne
    const reach = kf(u, [[0, 0], [0.3, 0], [0.4, 1], [0.58, 0.6], [0.64, 0], [1, 0]]);
    F.FL[1] += 0.32 * reach; F.FR[1] += 0.28 * reach; F.FL[2] += 0.3 * reach; F.FR[2] += 0.26 * reach;
    F.BL[1] += 0.05 * air; F.BR[1] += 0.05 * air;
    feet(P, ctx, F, L);
  },
  attack_alt(P, u, ctx, L) {
    // claw rake: rear onto the haunches, left fore paw sweeps down across (impact 0.5), snarl
    const kf = L.kf;
    const rear = kf(u, [[0, 0], [0.3, 1], [0.55, 0.7], [0.8, 0], [1, 0]]);
    const sw = kf(u, [[0, 0], [0.32, -1], [0.5, 1], [0.62, 0.8], [0.85, 0], [1, 0]]);
    const F = base(P, ctx, ctx.t, { dy: 0.04 * rear, dz: 0.12 * kf(u, [[0, 0], [0.45, 0], [0.55, 1], [1, 0]]), pitch: -0.42 * rear, roll: -0.08 * rear, neck: 0.3 * rear, head: 0.25 * rear,
      jaw: 0.5 * kf(u, [[0, 0], [0.35, 1], [0.6, 0.6], [1, 0]]), earB: 0.7 * rear, tail: 0.1, wag: 0.2, bz: -0.06 * rear }, L);
    // fore paws leave the floor as the chest rises; the left one rakes
    F.FR[1] += 0.18 * rear; F.FR[2] += 0.05 * rear;
    F.FL[1] += 0.3 * rear + 0.12 * Math.max(0, -sw); F.FL[2] += 0.18 * rear + 0.14 * sw; F.FL[0] += -0.1 * sw;
    feet(P, ctx, F, L);
    L.A(P, 'handL', -0.6 * Math.max(0, -sw) + 0.5 * Math.max(0, sw), 0, 0);
  },
  cast(P, u, ctx, L) {
    // howl: settle back, chest up, muzzle to the sky, jaw open, hold
    const kf = L.kf, k = kf(u, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]), hw = kf(u, [[0, 0], [0.3, 0.2], [0.42, 1], [0.8, 0.85], [1, 0]]);
    const F = base(P, ctx, ctx.t, { dy: -0.14 * k, pitch: -0.28 * k, neck: -0.65 * k, head: -0.55 * hw, jaw: 0.6 * hw, earB: 0.5 * k, tail: -0.2 * k, wag: 0.3, look: 1 - k, bz: -0.05 * k }, L);
    feet(P, ctx, F, L);
  },
  overdrive(P, u, ctx, L) {
    // rear up and howl (cast 0.22), drop into a crouch, leap high and crash down on the target (impact 0.72), snarl
    const kf = L.kf;
    const howl = kf(u, [[0, 0], [0.12, 1], [0.34, 1], [0.42, 0], [1, 0]]);
    const crouch = kf(u, [[0, 0], [0.36, 0], [0.48, 1], [0.54, 0.2], [0.6, 0], [0.72, 1.1], [0.84, 0.4], [1, 0]]);
    const air = kf(u, [[0, 0], [0.52, 0], [0.62, 1], [0.71, 0], [1, 0]]);
    const fwd = kf(u, [[0, 0], [0.5, -0.08], [0.66, 0.42], [0.85, 0.36], [1, 0]]);
    const F = base(P, ctx, ctx.t, { dy: 0.1 * howl - 0.2 * crouch + 0.75 * air, dz: fwd, pitch: -0.75 * howl + 0.25 * crouch - 0.2 * air, neck: -0.7 * howl + 0.35 * crouch, head: -0.5 * howl + 0.25 * air,
      jaw: 0.8 * kf(u, [[0, 0], [0.1, 0.8], [0.34, 0.9], [0.42, 0.2], [0.62, 0.9], [0.71, 0], [0.78, 0.5], [1, 0]]), earB: 0.7, tail: 0.4 * air - 0.2 * crouch, wag: 0.2, look: 0,
      bz: -0.14 * howl + fwd * kf(u, [[0, 0], [0.6, 0], [0.7, 1], [1, 1]]), fz: fwd * kf(u, [[0, 0], [0.6, 0], [0.7, 1], [1, 1]]) }, L);
    // up on the hind legs while howling: fore paws paw the air
    F.FL[1] += 0.55 * howl + 0.25 * air; F.FR[1] += 0.5 * howl + 0.22 * air;
    F.FL[2] += -0.12 * howl + 0.3 * air; F.FR[2] += -0.1 * howl + 0.28 * air;
    F.FL[1] += 0.06 * howl * Math.sin(ctx.t * 9); F.FR[1] += 0.06 * howl * Math.cos(ctx.t * 9);
    F.BL[1] += 0.2 * air; F.BR[1] += 0.2 * air; F.BL[2] -= 0.15 * air; F.BR[2] -= 0.15 * air;
    feet(P, ctx, F, L);
  },
  hit(P, u, ctx, L) {
    const kf = L.kf, k = kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
    const F = base(P, ctx, ctx.t, { dz: -0.08 * k, dy: -0.04 * k, roll: 0.1 * k * d, pitch: -0.08 * k, neck: -0.25 * k, head: -0.2 * k, tilt: 0.2 * k * d, jaw: 0.45 * k, earB: 0.8 * k, tail: -0.3 * k, wag: 0 }, L);
    feet(P, ctx, F, L);
  },
  die(P, u, ctx, L) {
    // stagger, legs buckle, roll onto the side (down at 0.62), a last twitch
    const kf = L.kf, D = ctx.D;
    const st = kf(u, [[0, 0], [0.12, 1], [0.3, 0.6], [0.4, 1], [1, 1]]);
    const fall = kf(u, [[0, 0], [0.3, 0.1], [0.62, 1], [0.7, 0.95], [1, 1]]);
    const F = base(P, ctx, ctx.t * (1 - u), { dy: -0.06 * st - (D.hover - 0.24) * fall, dz: -0.05 * st, roll: 1.45 * fall + 0.06 * st * Math.sin(u * 30) * (1 - fall), pitch: 0.12 * st * (1 - fall),
      neck: 0.25 * st + 0.15 * fall, head: 0.2 * st + 0.2 * fall, tilt: 0.3 * fall, tail: -0.4 * fall, wag: 1 - fall, jaw: 0.35 * fall, earB: 0.8 * fall, look: 0 }, L);
    // buckle: back end drops first
    F.BL[1] += 0; F.FL[2] += 0.04 * st;
    feet(P, ctx, F, L);
    if (fall > 0.25) {
      const k = Math.min(1, (fall - 0.25) / 0.6), tw = u > 0.72 ? Math.sin(u * 60) * (1 - u) * 0.6 : 0;
      for (const s of ['L', 'R']) {
        const sg = s === 'L' ? 1 : -1;
        const blend = (n, x, y, z) => { const i = L.BI[n] * 3; P[i] += (x - P[i]) * k; P[i + 1] += (y - P[i + 1]) * k; P[i + 2] += (z - P[i + 2]) * k; };
        blend('thigh' + s, -0.7 + 0.2 * sg, 0, 0.1 * sg); blend('shin' + s, 1.1 + tw * (s === 'L'), 0, 0); blend('foot' + s, -0.6, 0, 0);
        blend('upArm' + s, -0.35 - 0.25 * sg, 0, 0.08 * sg); blend('foreArm' + s, 0.7 + tw * 0.5 * (s === 'R'), 0, 0); blend('hand' + s, 0.5, 0, 0);
      }
    }
  },
  victory(P, t, ctx, L) {
    // sit on the haunches and howl at the sky, again and again
    const k = L.smooth(Math.min(1, t / 0.6)), w = Math.max(0, Math.sin(t * 1.1 - 0.6));
    const F = base(P, ctx, t, { dy: -0.3 * k, dz: -0.05 * k, pitch: -0.62 * k, neck: -0.45 * k - 0.15 * w, head: -0.35 * k - 0.35 * w, jaw: 0.65 * w, earB: 0.3 * w, tail: 0.25 * k, wag: 1.2, look: 1 - k,
      bz: 0.08 * k }, L);
    F.FL[2] -= 0.05 * k; F.FR[2] -= 0.05 * k;
    F.BL[3] = 0; F.BR[3] = 0;
    feet(P, ctx, F, L);
  },
  deploy(P, u, ctx, L) {
    // leaps in from behind (noDrop): airborne arc 0..0.42, lands (land 0.42), absorbs, snarls, ready (0.85)
    const kf = L.kf;
    const fl = Math.min(1, u / 0.42), air = u < 0.42 ? Math.sin(PI * fl) : 0;
    const back = u < 0.42 ? -(1 - L.smooth(fl)) * 1.7 : 0;
    const land = kf(u, [[0, 0], [0.4, 0], [0.47, 1], [0.66, 0.35], [1, 0]]);
    const snarl = kf(u, [[0, 0], [0.55, 0], [0.68, 1], [0.86, 1], [1, 0]]);
    const F = base(P, ctx, ctx.t, { dy: 1.1 * air - 0.18 * land, dz: back, pitch: -0.3 * (1 - fl) * (u < 0.42) + 0.35 * fl * (u < 0.42) * air + 0.15 * land, neck: 0.3 * land + 0.35 * snarl, head: -0.2 * snarl,
      jaw: 0.5 * snarl * (0.8 + 0.2 * Math.sin(u * 50)), earB: 0.7 * (air + snarl), tail: 0.4 * air, wag: 0.1, look: 0 }, L);
    if (u < 0.42) {
      // feet travel with the body, tucked under then reaching for the landing
      for (const k of ['FL', 'FR', 'BL', 'BR']) { F[k][2] += back; F[k][1] += 1.1 * air + (k[0] === 'F' ? 0.15 : 0.1) * air; }
      F.FL[2] += 0.18 * fl; F.FR[2] += 0.18 * fl; F.BL[2] -= 0.15 * air; F.BR[2] -= 0.15 * air;
    }
    feet(P, ctx, F, L);
  },
};

export default {
  id: 'wolf', name: 'WOLF', role: 'archer', faction: 'horde', rarity: 'common', realm: 'fantasy',
  rig: 'beast', dims: WOLF_DIMS, height: 1.35, radius: 0.62, walkSpeed: 1.8, cadence: 1.5, scheme: 'dark',
  style: {},
  noDrop: true,   // leaps in from behind instead of the sky drop (deploy anim + js/fx/units/wolf.js deploy hook)
  paint: PAINT,
  mats: {
    all: { paint: { ...FURMAT, rough: 0.8 }, accent: { ...FURMAT, rough: 0.86 }, trim: { ...FURMAT, rough: 0.78 },
      metal: { color: 0xdcd0b4, metal: 0.05, rough: 0.42 } },
    order: { metal: { color: 0xcfeaff, metal: 0.3, rough: 0.08, env: 1.6 }, glow: { color: 0x8fd8ff } },
    horde: { glow: { color: 0xff6a1a, ei: 3.4 } }, rogue: { glow: { color: 0xff6a1a, ei: 3.4 } },
  },
  sockets: { muzzle: ['head', [0, -0.06, 0.3]], core: [0, -0.02, -0.02], head: [0, 0.12, 0.02], hand: [0, -0.1, 0.1], tail: ['aux0', [0, -0.3, -0.25]] },
  events: { attack: [['impact', 0.48]], attack_alt: [['impact', 0.5]], cast: [['cast', 0.4]], overdrive: [['cast', 0.22], ['impact', 0.72]], die: [['down', 0.62]], deploy: [['land', 0.42], ['ready', 0.85]] },
  durs: { attack: 1.0, attack_alt: 0.9, cast: 1.4, overdrive: 2.4, hit: 0.42, die: 1.9, deploy: 1.6 },
  fxHints: { impact: 'bite', overdrive: 'howl_leap' },
  build,
  anims,
};
