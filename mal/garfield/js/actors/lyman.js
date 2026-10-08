// Lyman: Jon's rig/anim engine (human.js) with his own head, black hair, bushy moustache and clothes.
// createLyman({quality, outfit:'normal'|'disco'}); lyman.setOutfit() swaps at runtime, lyman.setFur(t) = orange shed fur.
import * as THREE from '../../vendor/three/three.module.js';
import { createHumanActor } from './human.js';
import { HEAD } from './lyman_head.js';
import {
  FACE, V, loft, ellipsoid, blend, collarGeo, noise3, headShape, backTufts, longSleeve, trouserLeg, pelvis,
  TORSO, TORSO_SKIN, torsoZ,
} from './human_body.js';

const NORMAL_COLORS = {
  skin: 0xedb894, blush: 0xe88470, skinShade: 0xdf9f7e,
  shirt: 0xf1e8d4, shirtDark: 0xdcd0b6, collar: 0xf6efe0,
  vest: 0xc99a2e, vestDark: 0xa97c1e,
  pants: 0x3f5238, pantsDark: 0x2f3e2a, belt: 0x2a1c14,
  shoe: 0x6a3a1e, sole: 0x2a160a,
  // cool blue-black: the warm evening key turned the old warm near-black into brown
  hair: 0x1b1d26, hairDark: 0x0d0e14, brow: 0x121319, lash: 0x121319, stache: 0x15161d, iris: 0x3a2618,
};
const DISCO_COLORS = {
  ...NORMAL_COLORS,
  suit: 0xf8f5ee, suitDark: 0xe2ddd2, shirt: 0xa8d0f0, shirtDark: 0x8cb8e0, collar: 0xa8d0f0,
  pants: 0xf8f5ee, pantsDark: 0xe2ddd2, belt: 0xf2eee6, buckle: 0xe0b440, shoe: 0xf4f1ea, sole: 0xd8d2c6, gold: 0xe6b84a,
};

// ---------- head furniture ----------
function lymanHair(c) {
  const { add, S, C, surfZ } = c;
  const hc = FACE.headC, hr = FACE.headR;
  const col = (p) => (p.y > hc[1] + 0.07 ? C.hair : C.hairDark);
  // shell: thick, part on his right, hairline a touch higher than Jon's
  add('hair', ellipsoid(hc, [hr[0] + 0.02, hr[1] + 0.026, hr[2] + 0.02], S(24), {
    shape: (p) => {
      const back = THREE.MathUtils.smoothstep(-p.z, 0.3, 0.85);
      const line = p.y - (0.24 + 0.6 * p.z) + 0.22 * back;
      const taper = 1 - 0.13 * back * (1 - THREE.MathUtils.smoothstep(p.y, -0.55, 0.25));
      headShape(p);
      p.multiplyScalar((0.6 + 0.4 * THREE.MathUtils.smoothstep(line, -0.1, 0.02)) * taper);
    },
    disp: (p) => {
      const d = V(p.x - hc[0], p.y - hc[1], p.z - hc[2]).normalize();
      p.addScaledVector(d, 0.008 * (noise3(p.x * 50, p.y * 50, p.z * 50) - 0.5) + 0.005 * Math.sin(Math.atan2(d.x, d.z) * 7 + d.y * 5));
    },
  }), col, 'head');
  // big swept-back top (wavy pompadour)
  add('hair', ellipsoid([0.008, 1.765, 0.05], [0.108, 0.04, 0.1], S(20), {
    rot: new THREE.Euler(-0.22, 0, -0.05),
    disp: (p) => { p.y += 0.008 * (noise3(p.x * 60, p.y * 60, p.z * 60) - 0.5) + 0.004 * Math.sin(p.z * 120); },
  }), C.hair, 'head');
  // front wave rolling over from the part on his right towards his left
  const fr = [[-0.06, 1.79], [-0.02, 1.8], [0.03, 1.796], [0.075, 1.775], [0.1, 1.745]];
  add('hair', loft(fr.map(([x, y], i) => ({ p: [x, y, surfZ(x, y) + 0.016 - i * 0.002], r: [[0.02, 0.03, 0.03, 0.024, 0.014][i], [0.016, 0.022, 0.022, 0.018, 0.01][i]] })),
    { seg: S(12), cap0: 3, cap1: 4, side: [0, 1, 0] }), C.hair, 'head');
  // sideburns
  for (const k of [1, -1]) {
    add('hair', loft([{ p: [k * 0.104, 1.69, 0.04], r: [0.005, 0.014] }, { p: [k * 0.106, 1.65, 0.05], r: [0.005, 0.012] }, { p: [k * 0.104, 1.615, 0.055], r: [0.004, 0.009] }],
      { seg: S(8), cap0: 2, cap1: 3, side: [0, 0, 1] }), C.hairDark, 'head');
  }
  layeredBack(c);
}

// short, combed-back back of the head: flat strands hugging the skull that tuck into the shell at the nape
function layeredBack(c) {
  const { add, S, C } = c;
  const hc = FACE.headC, hr = FACE.headR;
  const R = [hr[0] + 0.02, hr[1] + 0.026, hr[2] + 0.02];
  const onHead = (d) => { const q = d.clone().normalize(); headShape(q); return V(hc[0] + q.x * R[0], hc[1] + q.y * R[1], hc[2] + q.z * R[2]); };
  const N = 13;
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1) - 0.5, ph = u * 2.5 + 0.04 * Math.sin(k * 2.1);
    const secs = [], m = 6;
    for (let i = 0; i <= m; i++) {
      const t = i / m, y = 0.8 - t * 1.08, a = ph * (1 - 0.25 * t);
      const p = onHead(V(Math.sin(a) * 0.95, y, -Math.cos(a) * 0.95));
      const out = p.clone().sub(V(...hc)).normalize();
      p.addScaledVector(out, 0.0035 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - 0.003 * (1 - Math.min(1, t * 4)) - 0.016 * t * t * t);
      secs.push({ p: [p.x, p.y, p.z], r: [0.0035 * Math.min(1, 0.3 + t * 3), 0.022 * (1 - 0.5 * t * t) * (1 - 0.25 * Math.abs(u) * 2) * Math.min(1, 0.35 + t * 2.5)] });
    }
    const mid = V(...secs[3].p).sub(V(...hc)).normalize();
    add('hair', loft(secs, { seg: S(7), cap0: 1, cap1: 2, side: [mid.x, mid.y, mid.z] }), k % 3 === 1 ? C.hair : (p) => (p.y > hc[1] ? C.hair : C.hairDark), 'head');
  }
}

function moustache(c) {
  const { add, S, C, surfZ } = c;
  // push-broom: a thick bar that droops at the ends, plus little bristle lobes along the bottom edge
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8 * 2 - 1, x = u * 0.066, y = 1.566 - 0.016 * u * u;
    pts.push({ p: [x, y, surfZ(x, y) + 0.009 - 0.004 * u * u], r: [0.016 - 0.006 * u * u, 0.011 - 0.003 * u * u] });
  }
  add('hair', loft(pts, { seg: S(12), cap0: 3, cap1: 3, side: [0, 1, 0] }), C.stache, 'head');
  for (let i = 0; i < 9; i++) {
    const u = i / 8 * 2 - 1, x = u * 0.058, y = 1.552 - 0.016 * u * u;
    add('hair', ellipsoid([x, y, surfZ(x, y) + 0.008], [0.011, 0.013, 0.008], 8, {
      disp: (p) => { p.y += 0.002 * (noise3(p.x * 300, p.y * 300, i) - 0.5); },
    }), C.stache, 'head');
  }
}

// ---------- torsos ----------
function torsoLoft(c, color) {
  c.add('cloth', loft(TORSO.map(([y, rx, rz, z]) => ({ p: [0, y, z], r: [rx, rz] })), { seg: c.S(20), side: [1, 0, 0], exp: 2.3 }), color, TORSO_SKIN);
}

function vestTorso(c) {
  const { add, S, C } = c;
  torsoLoft(c, (p) => {
    if (p.y < 1.085) return (Math.floor((Math.atan2(p.x, p.z) + 4) * 26) % 2) ? C.vestDark : C.vest;
    return C.vest;
  });
  // vest hem over the belt line
  add('cloth', loft([{ p: [0, 1.09, 0.014], r: [0.152, 0.114] }, { p: [0, 1.05, 0.012], r: [0.16, 0.122] }, { p: [0, 1.015, 0.01], r: [0.158, 0.12] }],
    { seg: S(20), exp: 2.3 }), (p) => (Math.floor((Math.atan2(p.x, p.z) + 4) * 26) % 2) ? C.vestDark : C.vest, blend([[1.04, 'hips'], [1.1, 'spine']]));
  add('cloth', collarGeo(S(28)), C.collar, blend([[1.45, 'chest'], [1.5, 'neck']]));
  // crew-neck rib
  add('cloth', loft([{ p: [0, 1.432, 0.0], r: [0.076, 0.07] }, { p: [0, 1.452, 0.0], r: [0.068, 0.062] }], { seg: S(20), cap1: 0 }), C.vestDark, blend([[1.42, 'chest'], [1.47, 'neck']]));
}

function discoTorso(c) {
  const { add, S, C } = c;
  const vOpen = (p) => p.z > 0.02 && p.y > 1.17 && Math.abs(p.x) < (p.y - 1.17) * 0.42;
  torsoLoft(c, (p) => (vOpen(p) ? C.shirt : C.suit));
  // shirt fronts as separate panels so the shirt/chest/suit edges stay crisp (vertex colours alone smeared them)
  for (const k of [1, -1]) {
    const e = [];
    for (let i = 0; i <= 8; i++) {
      const y = 1.172 + i * 0.034, outer = (y - 1.17) * 0.42 + 0.004, inner = Math.max(0, (y - 1.26) * 0.46);
      const x = k * (outer + inner) / 2;
      e.push({ p: [x, y, torsoZ(x, y) + 0.003], r: [0.003, Math.max(0.003, (outer - inner) / 2 + 0.003)] });
    }
    add('cloth', loft(e, { seg: 8, cap0: 1, cap1: 1, side: [0, 0, 1] }), C.shirt, TORSO_SKIN);
  }
  // jacket skirt over the hips
  add('cloth', loft([{ p: [0, 1.09, 0.014], r: [0.155, 0.116] }, { p: [0, 1.02, 0.01], r: [0.17, 0.13] }, { p: [0, 0.96, 0.006], r: [0.178, 0.136] }],
    { seg: S(20), exp: 2.3 }), C.suit, blend([[1.0, 'hips'], [1.1, 'spine']]));
  // wide lapels along the V
  for (const k of [1, -1]) {
    const e = [];
    for (let i = 0; i <= 6; i++) {
      const y = 1.18 + i * 0.042, x = k * ((y - 1.17) * 0.42 + 0.028 + 0.02 * Math.sin(i / 6 * Math.PI));
      e.push({ p: [x, y, torsoZ(x, y) + 0.006], r: [0.008, 0.026 + 0.012 * Math.sin(i / 6 * Math.PI)] });
    }
    add('cloth', loft(e, { seg: 8, cap0: 2, cap1: 2, side: [0, 0, 1] }), C.suitDark, TORSO_SKIN);
    // huge pointy 70s shirt collar spread over the lapels
    add('cloth', loft([{ p: [k * 0.045, 1.452, 0.06], r: [0.006, 0.026] }, { p: [k * 0.1, 1.41, torsoZ(k * 0.1, 1.41) + 0.012], r: [0.005, 0.03] }, { p: [k * 0.155, 1.355, torsoZ(k * 0.155, 1.355) + 0.012], r: [0.004, 0.006] }],
      { seg: 8, cap0: 1, cap1: 1, side: [0, 0, 1] }), C.shirt, blend([[1.4, 'chest'], [1.46, 'neck']]));
    for (const y of [1.2, 1.08]) add('cloth', ellipsoid([k * 0.05, y, torsoZ(k * 0.05, y) + 0.004], [0.01, 0.01, 0.005], 8), C.suitDark, TORSO_SKIN);
  }
  // gold medallion on a chain
  const chain = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10 - 0.5) * 1.6, x = Math.sin(a) * 0.07, y = 1.44 - Math.cos(a * 0.6) * 0.09; chain.push({ p: [x, y, torsoZ(x, y) + 0.008], r: [0.003, 0.003] }); }
  add('cloth', loft(chain, { seg: 5 }), C.gold, TORSO_SKIN);
  add('cloth', ellipsoid([0, 1.335, torsoZ(0, 1.335) + 0.012], [0.022, 0.022, 0.005], 12), C.gold, TORSO_SKIN);
}

export const LYMAN_LOOK = {
  name: 'lyman', head: HEAD, colors: NORMAL_COLORS, belt: false, blushY: 1.6,
  brow: { w: 1.15, h: 1.7 },
  torso: vestTorso,
  sleeve: (c, s, k) => longSleeve(c, s, k, { color: c.C.vest, cuff: c.C.vestDark, r: 1.05 }),
  hair: lymanHair,
  extras: moustache,
};
export const LYMAN_DISCO_LOOK = {
  ...LYMAN_LOOK, colors: DISCO_COLORS, clothRough: 0.6, belt: true,
  torso: discoTorso,
  sleeve: (c, s, k) => longSleeve(c, s, k, { color: c.C.suit, cuff: c.C.suitDark, wide: 0.012, r: 1.06 }),
  leg: (c, s, k) => trouserLeg(c, s, k, { flare: 0.05 }),
};

export async function createLyman({ quality = 'high', outfit = 'normal' } = {}) {
  const a = await createHumanActor({ quality, look: LYMAN_LOOK, name: 'lyman', height: 1.8, variants: { disco: LYMAN_DISCO_LOOK } });
  a.setOutfit(outfit);
  return a;
}
