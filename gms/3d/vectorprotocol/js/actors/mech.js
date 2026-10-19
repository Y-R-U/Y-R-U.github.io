// Shared mech part kits. Builders get (b, o): b = PartBuilder, o = { r (rarity 0..3), faction, far, opts }.
import { plate, shell, hex, fin, discX, ringH, ringX, rod, deform } from './shapes.js';
export { plate, shell, hex, fin, discX, ringH, ringX, rod, deform };
export const PI = Math.PI;
import * as THREE from 'three';
import { orderOf } from './rig.js';

// Euler (XYZ) that maps a frame aligned with the ROOT (x left, y up, z forward) into `bone`'s local frame when the
// skeleton holds `pose` ({ bone: [x,y,z] } rotations as the anims write them; the right side is NOT auto-mirrored).
// Use with b.scope(pos, poseFrame(b.rig, pose, 'foreArmL'), 1, ...) to model a held shield/gun in plain root space.
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _eu = new THREE.Euler();
export function poseFrame(rig, pose, bone) {
  const chain = [];
  for (let n = bone; n; n = rig.parent[n]) chain.unshift(n);
  _qa.identity();
  for (const n of chain) {
    const r = pose[n];
    if (r) { _eu.set(r[0], r[1], r[2], orderOf(n)); _qa.multiply(_qb.setFromEuler(_eu)); }
  }
  _qa.invert();
  _eu.setFromQuaternion(_qa, 'XYZ');
  return [_eu.x, _eu.y, _eu.z];
}

// Bolt-on armour plate shortcut: plate(b, w,h,d,{...}) placed on a bone.
export function P(b, bone, slot, size, pos, rot, opt) {
  b.add(plate(b, size[0], size[1], size[2], opt), bone, slot, pos, rot);
}
export function PS(b, bone, slot, size, pos, rot, opt) {
  b.sym(plate(b, size[0], size[1], size[2], opt), bone, slot, pos, rot);
}

// Legs: mech biped. s = { w width scale, knee 'cap'|'spike', foot 'wide'|'point'|'claw', shin 'flare'|'slim',
//   thighSlot, shellSlot, shinPlateSlot, kneeSlot, footSlot, outerSlot (outer thigh/shin side plates), heelSlot
//   (material slots; defaults paint/paint/paint/accent/paint/accent/accent), shinGlow: false drops the rare+ shin light strip }
export function legs(b, o, s = {}) {
  const D = b.rig.D, w = s.w || 1, r = o.r, far = b.far;
  const TS = s.thighSlot || 'paint', SS = s.shellSlot || 'paint', SP = s.shinPlateSlot || 'paint', KS = s.kneeSlot || 'accent', FS = s.footSlot || 'paint', OS = s.outerSlot || 'accent', HS = s.heelSlot || 'accent';
  const th = D.thigh, sh = D.shin;
  // hip ball + thigh core
  b.sym(b.sph(14, 10), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.1 * w);
  b.sym(b.cyl(0.06 * w, 0.055 * w, th, 10), 'thigh', 'metal', [0, -th / 2, 0]);
  // thigh armour: front + outer plates
  PS(b, 'thigh', TS, [0.2 * w, th * 0.78, 0.2 * w], [0.012 * w, -th * 0.45, 0.025], [0, 0, 0.04], { c: 0.03 * w, tx: 1.12, tz: 1.1, bx: 0.8, bz: 0.82 });
  PS(b, 'thigh', OS, [0.05 * w, th * 0.55, 0.16 * w], [0.115 * w, -th * 0.42, 0.01], [0, 0, 0.06], { c: 0.012 });
  if (!far) PS(b, 'thigh', 'trim', [0.12 * w, 0.03, 0.03], [0.012 * w, -th * 0.2, 0.13 * w], [0, 0, 0]);
  // knee
  b.sym(discX(b, 0.075 * w, 0.17 * w, 12), 'shin', 'metal', [0, 0, 0]);
  if (s.knee === 'spike') b.sym(fin(b, [[-0.06, 0], [0.06, 0], [0.0, 0.26]], 0.07 * w, 0.01), 'shin', KS, [0, 0.02, 0.1 * w], [-0.5, 0, 0]);
  else PS(b, 'shin', KS, [0.16 * w, 0.17, 0.08], [0, 0.02, 0.1 * w], [-0.25, 0, 0], { c: 0.025, tx: 0.75, bx: 1 });
  // shin shell
  const flare = s.shin === 'slim' ? [0.085, 0.1, 0.08, 0.065] : [0.11, 0.135, 0.125, 0.115];
  b.sym(shell(b, -0.03, -sh + 0.02, flare.map((x) => x * w), 8), 'shin', SS, [0, 0, 0.0], [0, 0, 0], [1, 1, 1.15]);
  PS(b, 'shin', SP, [0.19 * w, sh * 0.62, 0.07], [0, -sh * 0.38, 0.13 * w], [0.12, 0, 0], { c: 0.02, tx: 1.15, bx: 0.85, tz: 1, sz: 0.0 });
  if (r >= 1 && s.shinGlow !== false) PS(b, 'shin', 'glow', [0.025, sh * 0.32, 0.02], [0.05 * w, -sh * 0.42, 0.172 * w], [0.12, 0, 0]);
  if (r >= 2) PS(b, 'shin', OS, [0.05, sh * 0.55, 0.14 * w], [0.12 * w, -sh * 0.5, 0], [0, 0, 0.05], { c: 0.012 });
  // ankle + foot
  b.sym(b.sph(10, 8), 'foot', 'metal', [0, 0, 0], [0, 0, 0], 0.07 * w);
  const fw = s.foot === 'point' ? 0.15 : 0.22;
  PS(b, 'foot', 'metal', [fw * w, 0.07, 0.34 * w], [0, -D.ankle + 0.045, 0.07], [0, 0, 0], { c: 0.02 });
  PS(b, 'foot', FS, [fw * 0.9 * w, 0.08, 0.17 * w], [0, -D.ankle + 0.08, 0.15 * w], [0.2, 0, 0], { c: 0.025, tx: 0.7, tz: 0.6 });
  PS(b, 'foot', HS, [fw * 0.75 * w, 0.08, 0.1], [0, -D.ankle + 0.06, -0.11 * w], [-0.3, 0, 0], { c: 0.02 });
  if (s.foot === 'claw' && !far) for (const x of [-0.06, 0.06]) b.sym(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.12]], 0.03, 0.006), 'foot', 'metal', [x * w, -D.ankle + 0.04, 0.26 * w], [PI / 2, 0, 0]);
}

// Arms: shoulder ball, upper arm, elbow, forearm block. s = { w, fore [w,h,d], pad: fn | null }
export function arms(b, o, s = {}) {
  const D = b.rig.D, w = s.w || 1, ua = D.upArm, fa = D.foreArm;
  b.sym(b.cyl(0.05 * w, 0.05 * w, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.095 * w);
  b.sym(b.cyl(0.055 * w, 0.05 * w, ua, 10), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.15 * w, ua * 0.6, 0.15 * w], [0.015, -ua * 0.55, 0], [0, 0, 0], { c: 0.02, tx: 1.1, tz: 1.1 });
  b.sym(discX(b, 0.07 * w, 0.13 * w, 12), 'foreArm', 'metal', [0, 0, 0]);
  const F = s.fore || [0.19, 0.8, 0.2];
  PS(b, 'foreArm', 'paint', [F[0] * w, fa * F[1], F[2] * w], [0.01, -fa * 0.55, 0], [0, 0, 0], { c: 0.03 * w, tx: 0.82, tz: 0.85 });
  PS(b, 'foreArm', 'accent', [F[0] * 0.5 * w, fa * F[1] * 0.7, 0.04], [0.01, -fa * 0.55, F[2] * 0.5 * w + 0.01], [0, 0, 0], { c: 0.012 });
  if (o.r >= 1) PS(b, 'foreArm', 'glow', [0.02, fa * 0.4, 0.02], [F[0] * 0.5 * w + 0.005, -fa * 0.55, 0.03], [0, 0, 0]);
}

// Chunky mech fist on hand bone (left template mirrored). k = size
export function fists(b, o, k = 1, which = 'both') {
  const add = (fn) => which === 'both' ? fn((...a) => b.sym(...a)) : fn((g, bone, ...rest) => b.add(g, bone + which, ...rest));
  add((put) => {
    put(b.cbox(0.13 * k, 0.12 * k, 0.15 * k, 0.025 * k), 'hand', 'metal', [0, -0.06 * k, 0.01]);
    put(b.cbox(0.135 * k, 0.07 * k, 0.16 * k, 0.02 * k), 'hand', 'accent', [0, -0.135 * k, 0.015]);
    put(b.cbox(0.04 * k, 0.07 * k, 0.05 * k, 0.012 * k), 'hand', 'metal', [-0.05 * k, -0.05 * k, 0.08 * k]);
  });
}
export function openHands(b, o, k = 1) {
  b.sym(b.cbox(0.06 * k, 0.1 * k, 0.1 * k, 0.015 * k), 'hand', 'metal', [0, -0.05 * k, 0]);
  if (b.far) return;
  for (let i = 0; i < 3; i++) b.sym(b.cbox(0.025 * k, 0.09 * k, 0.025 * k, 0.006), 'hand', 'accent', [-0.005, -0.13 * k, (-0.035 + i * 0.035) * k], [0, 0, -0.25]);
  b.sym(b.cbox(0.025 * k, 0.07 * k, 0.025 * k, 0.006), 'hand', 'accent', [-0.03 * k, -0.06 * k, 0.06 * k], [0.6, 0, -0.4]);
}

// Visor: emissive slit with a dark glass surround.
export function visor(b, bone, w, h, pos, rot = [0, 0, 0], depth = 0.03) {
  b.add(b.cbox(w, h, depth, Math.min(h, depth) * 0.3), bone, 'eye', pos, rot);
}

// Back thrusters / vents with glowing nozzles.
export function thrusters(b, o, bone, x, y, z, r = 0.06, n = 2) {
  for (let i = 0; i < n; i++) {
    const xx = n === 1 ? 0 : x;
    const put = n === 1 ? b.add.bind(b) : b.sym.bind(b);
    put(b.cyl(r, r * 1.25, 0.16, 10), bone, 'metal', [xx, y, z], [PI / 2 - 0.4, 0, 0]);
    put(b.cyl(r * 0.75, r * 0.75, 0.02, 10), bone, 'glow', [xx, y - 0.03, z - 0.075], [PI / 2 - 0.4, 0, 0]);
    if (n === 2) break;
  }
}

// Faction flair: rogue spikes, experimental crystals, corporate antenna, legendary halo (rarity >= 3 adds halo for all).
export function flair(b, o, at) {
  const f = o.faction, r = o.r;
  if (b.far) return;
  if (f === 'rogue' && at.spikes) for (const [bone, p, rot, s] of at.spikes) b.sym(fin(b, [[-0.035, 0], [0.035, 0], [0, 0.18 * (s || 1)]], 0.04, 0.008), bone, 'accent', p, rot);
  if (f === 'experimental' && at.crystals) for (const [bone, p, rot, s] of at.crystals) b.sym(b.sph(5, 3), bone, 'glow', p, rot, [0.03 * s, 0.09 * s, 0.03 * s]);
  if (f === 'corporate' && at.antenna && r >= 1) b.add(b.cyl(0.006, 0.01, 0.22, 5), at.antenna[0], 'metal', at.antenna[1], at.antenna[2] || [0.2, 0, 0.25]);
}

// Halo ring behind the head (legendary / epic casters).
export function halo(b, bone, pos, R = 0.24, slot = 'glow', tilt = 0.2) {
  b.add(b.tor(R, 0.012, 32, 5), bone, slot, pos, [tilt, 0, 0]);
  b.add(b.tor(R * 1.18, 0.006, 32, 4), bone, 'trim', pos, [tilt, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    b.add(b.cbox(0.02, 0.06, 0.012, 0.004), bone, 'trim', [pos[0] + Math.cos(a) * R * 1.1, pos[1] + Math.sin(a) * R * 1.1 * Math.cos(tilt), pos[2] - Math.sin(a) * R * Math.sin(tilt)], [tilt, 0, a - PI / 2]);
  }
}
