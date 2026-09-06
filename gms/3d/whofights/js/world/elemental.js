// The earth elemental's body. Everything it decides it decides in js/game/foe.js; this is only
// what that looks like.
//
// It is a stack of rock, not a humanoid: a lump for a body, two for arms, a smaller one for a
// head, and a seam of hot light between them that closes as it mends and opens as it is cut. The
// seam is the whole readability of the fight — you can see across the room whether the thing is
// putting itself back together, which is what the flagstones are for.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getEnvIntensity, onEnvIntensity } from './materials.js';
import { zone } from './zones.js';
import { rng } from './details.js';

const SEAM = new THREE.Color('#ff7a2a');

function chunk(r, seed, squash = 1) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  const R = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const k = 0.72 + R() * 0.5;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Elemental {
  constructor(zoneId = 'neutral', scale = 1) {
    this.object3D = new THREE.Group();
    this.object3D.name = 'elemental';
    this.scale = scale;
    const rock = [];
    const put = (g, x, y, z) => { g.translate(x, y, z); rock.push(g); };

    put(chunk(0.72, 11, 0.9), 0, 1.02, 0);
    put(chunk(0.44, 12), 0, 1.86, 0.04);
    for (const s of [-1, 1]) {
      put(chunk(0.30, 13 + s), s * 0.78, 1.34, 0);
      put(chunk(0.24, 15 + s), s * 0.94, 0.82, 0.06);
      put(chunk(0.34, 17 + s), s * 0.36, 0.34, 0);
    }
    // Its own material, not one out of the ROCK palette: those are seams in a cliff and read as
    // pale stone, and a pale body with hot cracks in it is a bonfire rather than a thing made of
    // earth. This is the zone's own stone taken well down, so the seam is the only bright thing.
    this.rockMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(zone(zoneId).stone.base).multiplyScalar(0.34),
      roughness: 0.96, metalness: 0.04,
    });
    this.rockMat.envMapIntensity = getEnvIntensity() * 0.4;
    this.rockMat.name = 'elemental:rock';
    onEnvIntensity(v => { this.rockMat.envMapIntensity = v * 0.4; });
    const body = new THREE.Mesh(mergeGeometries(rock, false), this.rockMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.body = body;

    // The seam: a second, smaller stack drawn additively inside the rock. It reads as light coming
    // out of the cracks rather than as a shell round the outside, which is what a hull would be.
    this.seamMat = new THREE.MeshBasicMaterial({
      color: SEAM, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.FrontSide,
    });
    // Well inside the rock it sits in — about six tenths of each chunk. At eight tenths the glow
    // stood proud of the stone on every silhouette and the thing read as a ball of fire.
    const cores = [];
    for (const [r, x, y, z] of [[0.42, 0, 1.02, 0], [0.24, 0, 1.86, 0.04],
      [0.17, -0.78, 1.34, 0], [0.17, 0.78, 1.34, 0]]) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.translate(x, y, z);
      cores.push(g);
    }
    const seam = new THREE.Mesh(mergeGeometries(cores.map(g => g.toNonIndexed()), false), this.seamMat);
    seam.renderOrder = 4;
    this.seam = seam;

    this.object3D.add(body, seam);
    this.object3D.scale.setScalar(scale);
    this.tris = (body.geometry.attributes.position.count + seam.geometry.attributes.position.count) / 3;
    this.t = 0;
  }

  // `f` is the record js/game/foe.js keeps. Nothing here decides anything — it reads.
  sync(f, groundY, dt = 0) {
    this.t += dt;
    const g = this.object3D;
    g.visible = true;
    g.position.set(f.x, groundY, f.z);
    g.rotation.y = f.yaw;

    // A windup is a lean back and a lift; a strike is the whole body thrown forward. It is the
    // only tell the fight has, so it is deliberately large.
    const T = 0.62;
    let lean = 0, lift = 0;
    if (f.state === 'windup') { lean = -0.34 * Math.min(1, f.t / T); lift = 0.10 * Math.min(1, f.t / T); }
    else if (f.state === 'strike') lean = 0.55;
    else if (f.state === 'recover') lean = 0.30 * Math.max(0, 1 - f.t / 0.6);
    else if (f.state === 'stagger') lean = -0.22 + 0.1 * Math.sin(this.t * 40);
    else if (f.state === 'dead') lean = 0;
    g.rotation.x = lean;
    // A trudge, not a walk: it has no legs, so the read has to come from the whole mass rocking.
    const moving = f.state === 'chase';
    g.position.y = groundY + lift + (moving ? Math.abs(Math.sin(this.t * 5.4)) * 0.09 : 0);
    g.rotation.z = moving ? Math.sin(this.t * 5.4) * 0.06 : 0;

    if (f.state === 'dead') {
      // It comes apart rather than falling over: a rockfall reads as a thing that was never alive
      // the way a corpse does not.
      const k = Math.min(1, f.t / 1.1);
      g.scale.setScalar(this.scale * (1 - 0.55 * k));
      g.position.y = groundY - 0.5 * k;
      this.seamMat.opacity = 0.3 * (1 - k);
      return;
    }

    g.scale.setScalar(this.scale);
    // Hurt, it glows harder and hotter; standing in soil it pulses as it knits.
    const hurtK = 1 - (f.max ? f.hp / f.max : 1);
    const mend = f.mended > 0 ? 0.5 + 0.5 * Math.sin(this.t * 11) : 0;
    this.seamMat.opacity = 0.16 + 0.34 * hurtK + 0.22 * mend;
    this.seamMat.color.copy(SEAM).lerp(_white, 0.35 * mend);
  }

  dispose() {
    this.rockMat.dispose();
    this.body.geometry.dispose();
    this.seam.geometry.dispose();
    this.seamMat.dispose();
  }
}

const _white = new THREE.Color(1, 1, 1);
