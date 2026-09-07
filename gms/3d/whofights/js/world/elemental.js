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

// The earth elemental's own two colours. js/game/bestiary.js hands a different pair per kind, and
// those two are the whole difference between a thing made of soil and a thing made of brine — see
// the note in that file about one body and many monsters.
const SEAM = '#ff7a2a';

// ── the four silhouettes ────────────────────────────────────────────────────
// One body, many monsters — and up to the silver board that body was literally one silhouette
// with two colours swapped, which is what docs/RESUME.md §6.10 said silver could not live on:
// "every kind in it is a lump of rock with a seam, and the writing on that board is about
// processions and things that count".
//
// So a kind may now name a BUILD. Each is the same idea — chunks of rock with light between them
// — arranged to a different proportion, and each carries its own seam cores so the glow stays
// inside the stone rather than standing proud of a body that has moved out from under it.
//
//   [radius, x, y, z, squash]        rock
//   [radius, x, y, z]                seam core, about six tenths of the chunk it sits in
//
// Nothing here reads a kind id. A fifteenth monster is a row in js/game/bestiary.js and no code.
export const BUILDS = {
  // The original: a lump for a body, two for arms, a smaller one for a head.
  stack: {
    rock: [[0.72, 0, 1.02, 0, 0.9], [0.44, 0, 1.86, 0.04, 1],
      [0.30, -0.78, 1.34, 0, 1], [0.30, 0.78, 1.34, 0, 1],
      [0.24, -0.94, 0.82, 0.06, 1], [0.24, 0.94, 0.82, 0.06, 1],
      [0.34, -0.36, 0.34, 0, 1], [0.34, 0.36, 0.34, 0, 1]],
    seam: [[0.42, 0, 1.02, 0], [0.24, 0, 1.86, 0.04], [0.17, -0.78, 1.34, 0], [0.17, 0.78, 1.34, 0]],
  },
  // Narrow and high, arms held in: something walking in a line. Silver's processions.
  tall: {
    rock: [[0.46, 0, 1.10, 0, 1.5], [0.40, 0, 2.10, 0, 1.35], [0.34, 0, 2.86, 0.03, 1],
      [0.20, -0.48, 1.72, 0, 1.6], [0.20, 0.48, 1.72, 0, 1.6],
      [0.17, -0.52, 1.02, 0.04, 1.4], [0.17, 0.52, 1.02, 0.04, 1.4],
      [0.40, 0, 0.28, 0, 0.55]],
    seam: [[0.28, 0, 1.10, 0], [0.24, 0, 2.10, 0], [0.19, 0, 2.86, 0.03], [0.11, 0, 0.28, 0]],
  },
  // Wide, low and close to the ground, with a head sunk into it. Things that count.
  squat: {
    rock: [[1.02, 0, 0.62, 0, 0.62], [0.42, 0, 1.16, 0.12, 0.8],
      [0.40, -1.00, 0.52, 0, 0.85], [0.40, 1.00, 0.52, 0, 0.85],
      [0.30, -0.72, 0.20, 0.30, 1], [0.30, 0.72, 0.20, 0.30, 1],
      [0.34, 0, 0.22, -0.62, 1]],
    seam: [[0.58, 0, 0.62, 0], [0.24, 0, 1.16, 0.12], [0.22, -1.00, 0.52, 0], [0.22, 1.00, 0.52, 0]],
  },
  // Thin body, long arms, almost no mass: it reads as fast before it has moved.
  spindly: {
    rock: [[0.34, 0, 1.24, 0, 1.45], [0.30, 0, 2.02, 0.02, 1],
      [0.15, -0.62, 1.56, 0, 1], [0.15, 0.62, 1.56, 0, 1],
      [0.13, -0.98, 1.04, 0.04, 1], [0.13, 0.98, 1.04, 0.04, 1],
      [0.12, -1.16, 0.46, 0.10, 1], [0.12, 1.16, 0.46, 0.10, 1],
      [0.18, -0.24, 0.40, 0, 1.3], [0.18, 0.24, 0.40, 0, 1.3]],
    seam: [[0.20, 0, 1.24, 0], [0.17, 0, 2.02, 0.02], [0.09, -0.62, 1.56, 0], [0.09, 0.62, 1.56, 0]],
  },
};

export const BUILD_IDS = Object.keys(BUILDS);
export const DEFAULT_BUILD = 'stack';

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
  constructor(zoneId = 'neutral', scale = 1, look = {}) {
    this.object3D = new THREE.Group();
    this.object3D.name = 'elemental';
    this.scale = scale;
    const build = BUILDS[look.build] || BUILDS[DEFAULT_BUILD];
    this.build = BUILDS[look.build] ? look.build : DEFAULT_BUILD;
    const rock = [];
    // The seed is the chunk's index, so the same build always comes out the same shape — a monster
    // the player learnt to read yesterday has to be the same monster today.
    for (const [i, [r, x, y, z, squash = 1]] of build.rock.entries()) {
      const g = chunk(r, 11 + i, squash);
      g.translate(x, y, z);
      rock.push(g);
    }
    // Its own material, not one out of the ROCK palette: those are seams in a cliff and read as
    // pale stone, and a pale body with hot cracks in it is a bonfire rather than a thing made of
    // earth. A kind that names no rock colour falls back to the zone's own stone taken well down,
    // which is what the earth elemental was before there was anything else to be.
    this.seamColour = new THREE.Color(look.seam || SEAM);
    this.rockMat = new THREE.MeshStandardMaterial({
      color: look.rock
        ? new THREE.Color(look.rock)
        : new THREE.Color(zone(zoneId).stone.base).multiplyScalar(0.34),
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
      color: this.seamColour.clone(), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.FrontSide,
    });
    // Well inside the rock it sits in — about six tenths of each chunk. At eight tenths the glow
    // stood proud of the stone on every silhouette and the thing read as a ball of fire.
    const cores = [];
    for (const [r, x, y, z] of build.seam) {
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
    this.seamMat.color.copy(this.seamColour).lerp(_white, 0.35 * mend);
  }

  dispose() {
    this.rockMat.dispose();
    this.body.geometry.dispose();
    this.seam.geometry.dispose();
    this.seamMat.dispose();
  }
}

const _white = new THREE.Color(1, 1, 1);
