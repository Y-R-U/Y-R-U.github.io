// The one import a model file needs. See docs/MODEL_GUIDE.md.
export * as THREE from 'three';
export { pod, band, arcH, ringH, discX, ringX, rod, capRod, deform, plate, shell, hex, fin } from './shapes.js';
export { P, PS, legs, arms, fists, openHands, visor, thrusters, flair, halo, poseFrame, PI } from './mech.js';
export { FACTIONS, RARITIES, rarityIndex } from './materials.js';
export { LIB, kf, smooth, lerp } from './anims.js';
export { BONES, BI, makeRig } from './rig.js';
export { ARCH, fr } from './archetypes/index.js';
import { ARCH } from './archetypes/index.js';

// Start a model from an archetype preset: fromArch('tank', { id, name, faction, ... overrides })
export function fromArch(arch, def) {
  const A = ARCH[arch];
  if (!A) throw new Error('kit: unknown archetype ' + arch);
  return { realm: 'scifi', arch, ...A, ...def,
    opts: { ...(A.opts || {}), ...(def.opts || {}) }, style: { ...A.style, ...(def.style || {}) }, sockets: { ...A.sockets, ...(def.sockets || {}) } };
}
// D21 organic body kits (fantasy realm)
export { buildHumanoid, buildBrute, buildBeast, HUMANOID_DIMS, BRUTE_DIMS, BEAST_DIMS, scatterFur, tuftGeo, blob, orient } from './organic.js';
export { detailTexture } from './materials.js';
