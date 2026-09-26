import { mat, glow } from './materials.js';
import { pod, band, arcH, ringH, discX, ringX, rod, capRod, hand } from './shapes.js';

const PI = Math.PI;

// Elegant humanoid (refs). o: {bust, layered, crest, lines, worker}
export function buildElegant(b, o) {
  const far = b.far, D = b.rig.D;
  const s = o.bust ? 0.94 : 1;

  // ---- head ----
  b.scope([0, 0, 0], [0, 0, 0], o.worker ? 0.95 : 0.9, () => {
    b.add(b.lathe([[0, 0.02], [0.042, 0.028], [0.066, 0.058], [0.081, 0.105], [0.086, 0.155], [0.082, 0.2], [0.066, 0.24], [0.038, 0.266], [0, 0.274]], 22), 'head', 'body', [0, 0, -0.016], [0, 0, 0], [1, 1, 1.14]);
    const face = o.face || 'human';
    if (face === 'human') {
      b.add(b.sph(20, 16), 'head', 'body', [0, 0.112, 0.04], [0.1, 0, 0], [0.071, 0.104, 0.064]);
      b.add(b.sph(14, 10), 'head', 'body', [0, 0.048, 0.058], [0, 0, 0], [0.04, 0.032, 0.04]);
      b.add(b.cyl(0.0, 0.014, 0.046, 4), 'head', 'body', [0, 0.108, 0.1], [-0.28, PI / 4, 0], [1, 1, 0.7]);
      b.add(arcH(b, 0.062, 0.007, PI * 0.6, 16, 5), 'head', 'body', [0, 0.146, 0.04], [0.12, 0, 0], [1, 0.8, 1]);
      b.sym(b.sph(12, 8), 'head', 'mech', [0.03, 0.126, 0.089], [0, 0.38, 0], [0.02, 0.011, 0.012]);
      b.sym(b.sph(12, 8), 'head', 'eye', [0.03, 0.126, 0.095], [0, 0.38, 0], [0.016, 0.006, 0.008]);
      b.add(b.box(0.026, 0.004, 0.006), 'head', 'mech', [0, 0.07, 0.097]);
    } else if (face === 'none') {
      b.add(b.sph(20, 16), 'head', 'body', [0, 0.118, 0.03], [0.1, 0, 0], [0.074, 0.11, 0.07]);
      b.add(arcH(b, 0.074, 0.0045, PI * 0.55, 18, 5), 'head', 'eye', [0, 0.128, 0.034], [0.08, 0, 0], [1, 1, 1.02]);
      if (!far) b.add(b.tor(0.1, 0.003, 24, 4, PI * 0.8), 'head', 'glow', [0, 0.135, -0.016], [0, PI / 2, PI * 0.1], [0.9, 1.25, 1.12]);
    } else if (face === 'visor') {
      b.add(b.sph(20, 16, 0, PI * 2, 0, PI * 0.62), 'head', 'mech', [0, 0.11, 0.03], [PI / 2 - 0.1, 0, 0], [0.078, 0.07, 0.1]);
      b.add(arcH(b, 0.083, 0.009, PI * 0.7, 20, 5), 'head', 'eye', [0, 0.125, 0.012], [0, 0, 0], [1, 1, 1.12]);
      b.add(b.sph(12, 10), 'head', 'body', [0, 0.05, 0.05], [0, 0, 0], [0.05, 0.04, 0.045]);
    }
    b.sym(ringX(b, 0.036, 0.009, 20), 'head', 'trim', [0.083, 0.118, -0.016]);
    b.sym(discX(b, 0.03, 0.02, 20), 'head', 'mech', [0.081, 0.118, -0.016]);
    b.sym(discX(b, 0.017, 0.028, 14), 'head', 'body', [0.083, 0.118, -0.016]);
    if (!far) b.sym(discX(b, 0.007, 0.034, 10), 'head', o.lines ? 'glow' : 'trim', [0.083, 0.118, -0.016]);
    b.add(b.sph(14, 10), 'head', 'mech', [0, 0.06, -0.042], [0, 0, 0], [0.055, 0.062, 0.052]);
    if (o.crest === 1) b.add(b.sph(12, 10), 'head', 'trim', [0, 0.25, -0.03], [0.25, 0, 0], [0.011, 0.028, 0.11]);
    if (o.crest === 2 && !far) b.add(b.tor(0.1, 0.004, 24, 5, PI * 0.9), 'head', 'glow', [0, 0.14, -0.016], [0, PI / 2, PI * 0.05], [0.9, 1.2, 1.1]);
    if (o.worker) {
      b.add(b.sph(20, 10, 0, PI * 2, 0, PI / 2), 'head', 'trim', [0, 0.155, -0.014], [0, 0, 0], [0.1, 0.105, 0.12]);
      b.add(ringH(b, 0.104, 0.01, 24), 'head', 'trim', [0, 0.158, -0.004], [0, 0, 0], [1, 1, 1.14]);
      b.add(b.box(0.12, 0.022, 0.03), 'head', 'glow', [0, 0.126, 0.09]);
    }
  });

  // ---- neck: column, cables, collars ----
  b.add(b.cyl(0.024, 0.029, 0.13, 12), 'neck', 'mech', [0, 0.055, 0]);
  if (!far) {
    for (const z of [0.022, -0.02]) b.sym(b.tube([[0.038, -0.01, z], [0.047, 0.05, z * 1.15], [0.03, 0.105, z * 0.8]], 0.0065, 8, 5), 'neck', 'mech');
    b.add(b.tube([[0, -0.01, 0.042], [0, 0.04, 0.05], [0, 0.09, 0.03]], 0.008, 8, 5), 'neck', 'trim');
  }
  b.add(ringH(b, 0.046, 0.008, 20), 'neck', 'trim', [0, 0.008, 0]);
  b.add(ringH(b, 0.03, 0.006, 16), 'neck', 'trim', [0, 0.09, 0]);

  // ---- chest ----
  b.add(b.sph(18, 14), 'chest', 'mech', [0, 0.09, -0.005], [0, 0, 0], [0.118, 0.13, 0.085]);
  b.add(b.sph(22, 16), 'chest', 'body', [0, 0.14, 0.0], [0, 0, 0], [0.15 * s, 0.12, 0.098]);
  b.add(b.sph(20, 12), 'chest', 'body', [0, 0.198, -0.012], [0, 0, 0], [0.19 * s, 0.05, 0.084]);
  if (o.worker) { /* vest covers the chest */ } else if (o.bust) b.sym(b.sph(16, 12), 'chest', 'body', [0.056, 0.118, 0.068], [0, 0.3, 0], [0.056, 0.056, 0.052]);
  else b.sym(b.sph(16, 12), 'chest', 'body', [0.06, 0.14, 0.07], [0, 0.25, -0.15], [0.074, 0.056, 0.042]);
  for (let i = 0; i < 3; i++) b.add(band(b, 0.06, 0.098 - i * 0.008, 0.02, PI * 1.25, 24), 'chest', i ? 'body' : 'trim', [0, 0.012 + i * 0.026, 0.004], [0, 0, 0], [1.05, 1, 0.9]);
  b.add(b.sph(12, 8), 'chest', 'body', [0, 0.12, -0.075], [0, 0, 0], [0.1, 0.1, 0.04]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.rbox(0.03, 0.03, 0.025, 0.008), 'chest', 'trim', [0, 0.05 + i * 0.05, -0.092]);
  b.sym(b.sph(12, 10), 'chest', 'mech', [0.168, 0.2, 0], [0, 0, 0], 0.042);
  if (o.lines && !far) {
    b.add(b.cap(0.0035, 0.1, 5), 'chest', 'glow', [0, 0.115, 0.1]);
    b.sym(capRod(b, [0.02, 0.215, 0.07], [0.13, 0.205, 0.045], 0.0035, 5), 'chest', 'glow');
    b.sym(b.tube([[0.03, 0.08, 0.104], [0.08, 0.075, 0.09], [0.125, 0.1, 0.05]], 0.003, 8, 4), 'chest', 'glow');
  }
  if (o.chestPlate) {
    b.sym(b.rbox(0.13, 0.12, 0.03, 0.012), 'chest', 'trim', [0.062, 0.15, 0.085], [-0.2, 0.35, 0.08]);
    b.add(b.rbox(0.05, 0.13, 0.03, 0.01), 'chest', 'mech', [0, 0.13, 0.1], [-0.12, 0, 0]);
  }
  if (o.worker) {
    b.add(b.rbox(0.25, 0.16, 0.19, 0.03), 'chest', 'trim', [0, 0.12, 0.005]);
    b.add(b.rbox(0.07, 0.035, 0.02, 0.006), 'chest', 'glow', [0.06, 0.16, 0.1]);
  }

  // ---- spine: wasp waist, vertebrae, abdominal plates, side cables ----
  b.add(b.cyl(0.03, 0.034, 0.24, 12), 'spine', 'mech', [0, 0.115, 0]);
  const rr = [0.07, 0.062, 0.072, 0.082];
  for (let i = 0; i < 4; i++) {
    const y = 0.03 + i * 0.054;
    b.add(b.cyl(rr[i] - 0.014, rr[i] - 0.014, 0.03, 16), 'spine', 'mech', [0, y, -0.004], [0, 0, 0], [1.1, 1, 0.9]);
    if (!far && i < 3) b.add(band(b, rr[i] - 0.016, rr[i] - 0.004, 0.034, PI * 0.5, 10), 'spine', 'trim', [0, y, 0], [0, PI, 0], [1.1, 1, 0.9]);
  }
  // sculpted abdominal plate: one continuous front shell pinched at the waist, with three shallow segment grooves
  {
    const prof = [[0.08, 0.0], [0.072, 0.05], [0.064, 0.1], [0.07, 0.15], [0.082, 0.2], [0.09, 0.235]];
    const pts = prof.map(([r, y]) => [r, y]).concat(prof.slice().reverse().map(([r, y]) => [r - 0.009, y]));
    pts.push([prof[0][0], prof[0][1]]);
    b.add(b.lathe(pts, 22, -PI * 0.58, PI * 1.16), 'spine', 'body', [0, 0, 0.004], [0, 0, 0], [1.08 * s, 1, 0.95]);
    if (!o.worker) for (const y of [0.062, 0.112, 0.162]) b.add(band(b, 0.066, 0.071 + (y - 0.1) * 0.04, 0.006, PI * 0.62, 12), 'spine', 'trim', [0, y, 0.008], [0, 0, 0], [1.08 * s, 1, 0.95]);
    if (!o.worker && !far) b.add(b.box(0.005, 0.15, 0.006), 'spine', 'trim', [0, 0.115, 0.072]);
  }
  b.add(b.sph(16, 12, -PI * 0.28, PI * 0.56, PI * 0.2, PI * 0.6), 'spine', 'body', [0, 0.1, -0.02], [0, 0, 0], [0.07, 0.15, 0.1]);
  if (!far) b.sym(b.tube([[0.07, -0.02, -0.01], [0.085, 0.1, -0.015], [0.07, 0.22, -0.01]], 0.007, 10, 5), 'spine', 'mech');

  // ---- pelvis ----
  b.add(b.sph(16, 12), 'pelvis', 'mech', [0, -0.01, 0], [0, 0, 0], [0.1, 0.075, 0.075]);
  b.add(b.lathe([[0, -0.1], [0.035, -0.097], [0.075, -0.075], [0.11, -0.035], [0.124, 0.005], [0.118, 0.04], [0.095, 0.062], [0.072, 0.07], [0, 0.07]], 22), 'pelvis', 'body', [0, 0, 0.002], [0, 0, 0], [o.bust ? 1.04 : 0.97, 1, 0.78]);
  b.add(b.sph(14, 12), 'pelvis', 'body', [0, -0.075, 0.035], [0.35, 0, 0], [0.05, 0.055, 0.035]);
  b.sym(b.sph(12, 10), 'pelvis', 'body', [0.065, -0.005, -0.05], [0, 0, 0], [0.06, 0.07, 0.055]);
  b.add(ringH(b, 0.086, 0.01, 22), 'pelvis', 'trim', [0, 0.072, 0], [0, 0, 0], [1.05, 1, 0.8]);
  b.sym(b.sph(12, 10), 'pelvis', 'mech', [0.1, -0.035, 0], [0, 0, 0], 0.05);
  b.sym(discX(b, 0.042, 0.012, 18), 'pelvis', 'trim', [0.132, -0.028, 0]);
  if (o.lines && !far) b.add(b.tube([[-0.118, 0.03, 0.058], [-0.05, -0.03, 0.09], [0, -0.07, 0.092], [0.05, -0.03, 0.09], [0.118, 0.03, 0.058]], 0.0035, 12, 4), 'pelvis', 'glow');
  if (o.worker) {
    b.add(ringH(b, 0.13, 0.016, 24), 'pelvis', 'mech', [0, 0.03, 0], [0, 0, 0], [1, 1, 0.8]);
    b.add(b.rbox(0.06, 0.07, 0.04, 0.01), 'pelvis', 'mech', [0.11, 0.0, 0.06], [0, 0.6, 0]);
    b.add(b.rbox(0.05, 0.06, 0.035, 0.01), 'pelvis', 'trim', [-0.12, 0.0, 0.03], [0, -0.9, 0]);
  }

  // ---- arms ----
  b.sym(b.cyl(0.018, 0.018, 0.13, 8), 'clav', 'mech', [0.07, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'mech', [0, 0, 0], [0, 0, 0], 0.042);
  b.sym(b.sph(20, 14, 0, PI * 2, 0, PI * 0.66), 'upArm', 'body', [0.01, -0.012, 0], [0, 0, -0.28], [0.07 * s, 0.086, 0.078]);
  b.sym(b.sph(12, 8), 'upArm', 'mech', [0.004, -0.05, 0], [0, 0, 0], [0.05, 0.03, 0.05]);
  if (o.layered) {
    b.sym(b.sph(18, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'body', [0.02, 0.03, 0], [0, 0, -0.4], [0.078, 0.06, 0.082]);
    b.sym(band(b, 0.06, 0.072, 0.02, PI * 2, 20), 'upArm', 'trim', [0.004, -0.03, 0], [0, 0, -0.3]);
  }
  b.sym(b.cyl(0.022, 0.02, 0.26, 10), 'upArm', 'mech', [0, -0.14, 0]);
  b.sym(pod(b, -0.055, -0.268, [0.05, 0.058, 0.054, 0.044, 0.035], 18), 'upArm', 'body', [0, 0, 0], [0, 0, 0], [0.95 * s, 1, 1.02]);
  if (!far) b.sym(rod(b, [0, -0.08, -0.043], [0, -0.25, -0.036], 0.006, 6), 'upArm', 'trim');
  b.sym(b.sph(12, 10), 'foreArm', 'mech', [0, 0, 0], [0, 0, 0], 0.03);
  b.sym(b.sph(10, 8), 'foreArm', 'body', [0, -0.008, -0.022], [0, 0, 0], [0.026, 0.032, 0.022]);
  b.sym(pod(b, -0.02, -0.235, [0.036, 0.047, 0.043, 0.034, 0.027], 18), 'foreArm', 'body', [0, 0, 0], [0, 0, 0], [0.88 * s, 1, 1.05]);
  b.sym(ringH(b, 0.026, 0.005, 14), 'foreArm', 'trim', [0, -0.232, 0]);
  b.sym(b.sph(10, 8), 'foreArm', 'mech', [0, -D.foreArm, 0], [0, 0, 0], 0.02);
  if (o.lines && !far) b.sym(b.cap(0.003, 0.11, 4), 'foreArm', 'glow', [0.034, -0.12, 0]);
  hand(b, 'body', o.worker ? 'mech' : 'body', s * 1.12, far);

  // ---- legs ----
  b.sym(b.sph(14, 10), 'thigh', 'mech', [0, 0, 0], [0, 0, 0], 0.048);
  b.sym(b.cyl(0.028, 0.026, 0.4, 10), 'thigh', 'mech', [0, -0.2, 0]);
  b.sym(pod(b, -0.02, -0.39, [0.07, 0.076, 0.071, 0.06, 0.05, 0.043], 20), 'thigh', 'body', [0.004, 0, 0.006], [0, 0, 0], [o.bust ? 1.02 : 1, 1, 1.1]);
  b.sym(band(b, 0.044, 0.052, 0.018, PI * 2, 18), 'thigh', 'trim', [0.004, -0.372, 0.006], [0, 0, 0], [1, 1, 1.1]);
  b.sym(b.sph(12, 10), 'shin', 'mech', [0, 0, 0], [0, 0, 0], 0.04);
  b.sym(b.sph(12, 10), 'shin', 'body', [0, -0.006, 0.034], [0, 0, 0], [0.037, 0.046, 0.03]);
  b.sym(discX(b, 0.028, 0.01, 14), 'shin', 'trim', [0.042, 0, 0]);
  b.sym(discX(b, 0.028, 0.01, 14), 'shin', 'trim', [-0.042, 0, 0]);
  b.sym(b.cyl(0.024, 0.02, 0.4, 10), 'shin', 'mech', [0, -0.215, 0]);
  b.sym(pod(b, -0.045, -0.395, [0.042, 0.054, 0.05, 0.04, 0.033, 0.029], 20), 'shin', 'body', [0, 0, -0.008], [0, 0, 0], [0.95, 1, 1.15]);
  b.sym(b.sph(10, 8), 'shin', 'mech', [0, -D.shin, 0], [0, 0, 0], 0.027);
  if (o.lines && !far) b.sym(b.cap(0.0035, 0.2, 4), 'shin', 'glow', [0, -0.2, 0.048], [-0.04, 0, 0]);
  b.sym(b.sph(16, 12), 'foot', 'body', [0, -0.037, 0.048], [0, 0, 0], [0.042, 0.036, 0.104]);
  b.sym(b.sph(12, 8), 'foot', 'body', [0, -0.043, -0.022], [0, 0, 0], [0.034, 0.03, 0.04]);
  b.sym(b.sph(12, 6), 'foot', 'mech', [0, -0.066, 0.045], [0, 0, 0], [0.04, 0.009, 0.1]);
  b.sym(b.sph(10, 8), 'foot', 'mech', [0, -0.005, 0], [0, 0, 0], [0.03, 0.03, 0.034]);
}

// Material palettes. Tones vary with seed.
const GOLDS = [0xffd27a, 0xf8cf9e, 0xf2c060];
const CHROMES = [0xf3f5f8, 0xe8eef6, 0xf6f1ea];
const CIV_GLOW = { civ_gold: 0xffd9a0, civ_chrome: 0x9fe8ff, civ_black: 0x2fe0ff, civ_worker: 0xffb030 };

export function civMats(kind, tone) {
  const eyeC = { civ_gold: 0xffe2b0, civ_chrome: 0xbff2ff, civ_black: 0x5ff0ff, civ_worker: 0xffc860 }[kind];
  const m = { glow: glow(kind, CIV_GLOW[kind], kind === 'civ_black' ? 3.2 : 2.2), eye: glow(kind + ':eye', eyeC, 2.2) };
  if (kind === 'civ_gold') {
    m.body = mat('gold' + tone, { color: GOLDS[tone], metal: 1, rough: 0.2, coat: 0.5, coatRough: 0.08 });
    m.mech = mat('blackchrome', { color: 0x1a1a1d, metal: 1, rough: 0.22 });
    m.trim = mat('darkgold', { color: 0x8a6428, metal: 1, rough: 0.3 });
  } else if (kind === 'civ_chrome') {
    m.body = mat('chrome' + tone, { color: CHROMES[tone], metal: 1, rough: 0.07 });
    m.mech = mat('blackchrome', { color: 0x1a1a1d, metal: 1, rough: 0.22 });
    m.trim = mat('satin', { color: 0xb8bcc2, metal: 1, rough: 0.28 });
  } else if (kind === 'civ_black') {
    m.body = mat('glossblack' + tone, { color: [0x08090b, 0x0b0a10, 0x0a0b0a][tone], metal: 0.55, rough: 0.28, coat: 1, coatRough: 0.04 });
    m.mech = mat('gunchrome', { color: 0x3a3d44, metal: 1, rough: 0.18 });
    m.trim = mat('blackchrome2', { color: 0x222328, metal: 1, rough: 0.12 });
  } else {
    m.body = mat('workerwhite' + tone, { color: [0xdcd7cb, 0xc9cfd3, 0xd8cdb8][tone], metal: 0.15, rough: 0.42 });
    m.mech = mat('greymech', { color: 0x3a3c40, metal: 0.8, rough: 0.4 });
    m.trim = mat('safetyyellow' + tone, { color: [0xe8b923, 0xe88a1a, 0xd9cd35][tone], metal: 0.1, rough: 0.45 });
  }
  return m;
}
