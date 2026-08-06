// Interior lamps — C2 ONLY.
//
// Every major emissive in the room has a lamp here, colour-matched and placed at the fixture, so
// the chart table, the LED banks and the deckhead fixtures actually light what is around them.
// The rig is a PRIORITY-ORDERED list and the preset budget refills a fixed pool from the top of
// it, which is why the plot glow is always element 0 — it is the one light a shot cannot lose.
//
// `bridgeLights` in the preset table is a TIER, not a count. Forward-rendered point lights cost no
// draw calls, no triangles and no texture, and this room is lit entirely by its own practicals, so
// the tier maps to a larger real lamp count (medium 5 → 16) than the raw number.

import * as THREE from 'three';
import { RIGS, ROOM } from './bridge.js';

const TIER = 3.2;

export function buildBridgeLights(quality) {
  const object3D = new THREE.Group();
  object3D.name = 'bridgeLights';
  const lamps = [];

  let rigName = 'bridge';
  let extra = [];
  let dim = 1;

  const hemi = new THREE.HemisphereLight(0x1a2a3a, 0x0a0c10, 0);
  hemi.position.set(0, ROOM.deck + ROOM.h, 0);
  object3D.add(hemi);

  const rig = () => RIGS[rigName] || RIGS.bridge;
  const specs = () => rig().lamps.concat(extra);
  const cap = () => Math.max(1, Math.round((quality.get('bridgeLights') ?? 5) * TIER));

  function clearPool() {
    for (const l of lamps) {
      l.parent?.remove(l);
      if (l.target) object3D.remove(l.target);
      l.dispose?.();
    }
    lamps.length = 0;
  }

  function apply() {
    const want = specs().slice(0, cap());
    // Spots and points are different objects, so the pool is rebuilt rather than retyped. Rig
    // changes happen at scenario setup, not per frame.
    clearPool();
    const shadowMap = quality.get('shadowMap') ?? 1024;
    const shadowsOn = (quality.get('shadows') ?? 'soft') !== 'off';

    for (const s of want) {
      let l;
      if (s.spot) {
        l = new THREE.SpotLight(s.colour, 1, s.distance, s.spot.angle ?? 0.6, s.spot.penumbra ?? 0.6, s.decay ?? 1.8);
        l.target.position.set(s.spot.at[0], s.spot.at[1] + ROOM.deck, s.spot.at[2]);
        object3D.add(l.target);
        if (s.shadow && shadowsOn) {
          l.castShadow = true;
          l.shadow.mapSize.set(shadowMap, shadowMap);
          // near/far are tight on purpose. A 0.08→6 m frustum on a 1024² map has so little depth
          // precision that a 7 mm ruler self-shadows and renders solid black, and the paper under
          // it speckles with acne.
          l.shadow.camera.near = s.spot.near ?? 0.4;
          l.shadow.camera.far = s.spot.far ?? Math.min(4.0, Math.max(2, s.distance || 8));
          l.shadow.bias = -0.0006;
          l.shadow.normalBias = 0.014;
          l.shadow.radius = 2.4;
        }
      } else {
        l = new THREE.PointLight(s.colour, 1, s.distance, s.decay ?? 2);
      }
      l.position.set(s.pos[0], s.pos[1] + ROOM.deck, s.pos[2]);
      l.userData.base = s.intensity;
      l.intensity = s.intensity * dim;
      object3D.add(l);
      lamps.push(l);
    }

    const h = rig().hemi;
    hemi.color.set(h?.sky ?? 0x1a2a3a);
    hemi.groundColor.set(h?.ground ?? 0x0a0c10);
    hemi.intensity = (h?.intensity ?? 0) * dim;
  }

  const api = {
    object3D,
    lamps,
    hemi,

    // Named lamp rigs live in bridge.js next to the geometry they light.
    useRig(name) { rigName = RIGS[name] ? name : 'bridge'; extra = []; apply(); return api; },
    rig() { return rigName; },

    // Appends to the current rig. It can return null: the rig may already be at the preset's cap,
    // and silently exceeding it is how a phone ends up with twenty forward-rendered point lights.
    add({ pos, colour = 0xffb877, intensity = 6, distance = 9, spot = null, shadow = false }) {
      const i = specs().length;
      extra.push({ pos: pos.toArray ? pos.toArray() : pos, colour, intensity, distance, spot, shadow });
      apply();
      return i < cap() ? lamps[i] : null;
    },

    setDim(f) {
      dim = f;
      for (const l of lamps) l.intensity = (l.userData.base ?? 1) * f;
      hemi.intensity = (rig().hemi?.intensity ?? 0) * f;
    },

    registerKnobs(q) {
      q.register({ key: 'bridgeLights', label: 'Bridge lamps', type: 'range', min: 0, max: 12, step: 1, group: 'Lighting' },
        () => apply());
    },
  };

  apply();
  return api;
}
