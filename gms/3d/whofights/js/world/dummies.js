// The skinnable dummies standing in the world. js/world/people.js is the hooded rig drawn from an
// instanced crowd pool; a dummy is a lone textured mesh with its own material, so it gets its own
// small system rather than a seat in that pool.

import * as THREE from 'three';
import { Dummy, loadSkin } from './dummy.js';
import { heightAt } from './terrain.js';
import { groundAt, collidersReady } from './colliders.js';

export const SKIN_DIR = 'art/skins';
export const skinURL = id => `${SKIN_DIR}/${id}.png`;

export class Dummies {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'dummies';
    this.bodies = [];
  }

  // `sex` picks the body shape and `skin` names a texture under art/skins/. The skin is loaded
  // late and applied when it arrives, so a missing or slow one leaves a grey mannequin standing
  // rather than nothing at all — an invisible character is worse than an unpainted one.
  place({ id, sex = 'm', skin = null, x = 0, z = 0, yaw = 0, scale = 1, fixY = null }) {
    const mesh = new Dummy({ shape: sex === 'f' ? 'f' : 'm' });
    mesh.name = `dummy:${id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.setScalar(scale);
    mesh.rotation.y = yaw;
    const y = fixY ?? this.groundAt(x, z);
    mesh.position.set(x, y, z);
    this.object3D.add(mesh);

    const a = { id, x, y, z, mesh, skin: null };
    this.bodies.push(a);
    if (skin) {
      loadSkin(skinURL(skin), { label: id })
        .then(t => { a.skin = t; mesh.setSkin(t); })
        .catch(e => console.warn(`dummy ${id}: ${e.message}`));
    }
    return a;
  }

  groundAt(x, z) {
    if (collidersReady()) return groundAt(x, z, 0);
    return this.terrain ? this.terrain.surfaceY(x, z) : heightAt(x, z);
  }

  dispose() {
    for (const a of this.bodies) { this.object3D.remove(a.mesh); a.mesh.dispose(); }
    this.bodies.length = 0;
  }
}
