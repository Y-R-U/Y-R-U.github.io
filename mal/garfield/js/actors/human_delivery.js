// Delivery man look (courier uniform + cap) on the shared human body.
import * as THREE from '../../vendor/three/three.module.js';
import { HEAD } from './delivery_head.js';
import { FACE, ellipsoid, loft, blend, collarGeo, backTufts, jonSleeve, torsoZ, TORSO, TORSO_SKIN } from './human_body.js';

const COLORS = {
  skin: 0xc98e64, blush: 0xc8705a, skinShade: 0xb87c58, iris: 0x2a1a10,
  shirt: 0x3a5a8c, shirtDark: 0x2c4672, collar: 0x3f6296, button: 0xe8e2d0,
  pants: 0x2a3550, pantsDark: 0x1e2740, belt: 0x1a1410, buckle: 0xc0c4c8,
  shoe: 0x1c1612, sole: 0x0c0a08, hair: 0x2a1c14, hairDark: 0x1a120c, brow: 0x1a120c, lash: 0x1a120c,
  cap: 0x2c4672, capBand: 0xf2c230, patch: 0xf2c230,
};

function torso(c) {
  const { add, S, C } = c;
  add('cloth', loft(TORSO.map(([y, rx, rz, z]) => ({ p: [0, y, z], r: [rx, rz] })), { seg: S(20), side: [1, 0, 0], exp: 2.3 }),
    (p) => (Math.abs(p.x) < 0.012 && p.z > 0.05 && p.y < 1.43) ? C.shirtDark : C.shirt, TORSO_SKIN);
  add('cloth', collarGeo(S(28)), C.collar, blend([[1.45, 'chest'], [1.5, 'neck']]));
  for (const y of [1.36, 1.26, 1.16]) add('cloth', ellipsoid([0, y, torsoZ(0, y) + 0.002], [0.008, 0.008, 0.004], 8), C.button, TORSO_SKIN);
  // chest badge (plain yellow parcel patch, no branding)
  add('cloth', ellipsoid([0.08, 1.3, torsoZ(0.08, 1.3) + 0.002], [0.03, 0.022, 0.004], 10), C.patch, 'chest');
  for (const k of [1, -1]) add('cloth', ellipsoid([k * 0.075, 1.24, torsoZ(k * 0.075, 1.24) + 0.002], [0.034, 0.03, 0.006], 10), C.shirtDark, 'chest');
}

function capHair(c) {
  const { add, S, C } = c;
  const hc = FACE.headC, hr = FACE.headR;
  backTufts(c, { w: 0.8 });
  // crown dome
  add('hair', ellipsoid([hc[0], hc[1] + 0.045, hc[2] - 0.005], [hr[0] + 0.022, 0.13, hr[2] + 0.024], S(22), { thetaLength: Math.PI * 0.5 }), C.cap, 'head');
  add('hair', loft([{ p: [0, 1.682, 0.0], r: [hr[0] + 0.024, hr[2] + 0.026] }, { p: [0, 1.71, 0.0], r: [hr[0] + 0.024, hr[2] + 0.026] }], { seg: S(22) }), C.capBand, 'head');
  // brim
  add('hair', ellipsoid([0, 1.69, 0.165], [0.11, 0.01, 0.1], S(18), { rot: new THREE.Euler(-0.12, 0, 0), shape: (p) => { if (p.z < 0) p.z *= 0.3; } }), C.cap, 'head');
  add('hair', ellipsoid([0, 1.81, 0.02], [0.013, 0.008, 0.013], 8), C.cap, 'head');
}

export const DELIVERY_LOOK = {
  name: 'delivery', head: HEAD, colors: COLORS, brow: { w: 1.05, h: 1.3 }, blushY: 1.592,
  torso, sleeve: jonSleeve, hair: capHair,
};
