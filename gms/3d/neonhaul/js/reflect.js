// §3.7(b) — the wet-ground double, the water film, and §4.4's LOW halo field.
//
// Real planar reflection is a second full scene render and we are not doing it. What the plates
// actually show (1488490_08, 1475810_04) is that what a wet street reflects is ONLY THE LIGHT
// SOURCES — the lit geometry contributes almost nothing. So we mirror the emissive instanced
// fields and nothing else:
//
//   a THREE.Group at y = 0 with scale(1, -1, 1)
//   three InstancedMeshes that SHARE THE SOURCE FIELDS' GEOMETRY AND INSTANCE BUFFERS by
//   reference, so a chunk streaming in updates the reflection for exactly zero extra CPU.
//
// Three things here are load-bearing and each is a bug this file exists to have already made:
//
// 1. `side` STAYS AS THE SOURCE'S — never BackSide. three.js already compensates for a
//    negatively-scaled object: WebGLRenderer computes
//    `frontFaceCW = object.isMesh && object.matrixWorld.determinant() < 0` and setMaterial does
//    `if ( frontFaceCW ) flipSided = ! flipSided`. InstancedMesh extends Mesh, so all three of
//    ours get it. Adding BackSide applies the flip a SECOND time and the mirrored quads become
//    invisible from the side you are looking at.
// 2. DRAW ORDER. The road (§3.6) is drawn first with depthWrite FALSE; the mirror group is
//    renderOrder 2, depth-tested and not depth-writing; the water film is renderOrder 3. Get the
//    road's depth write wrong and the mirror is entirely occluded and NOTHING APPEARS. Buildings
//    and craft do write depth, which is what makes a tower occlude a sign's reflection — that is
//    §3.7's P3b gate and tools/gates_p3b.mjs asserts it on sampled pixels.
// 3. THE COUNT IS COPIED EVERY FRAME. The source fields are dense swap-remove allocations whose
//    `n` moves as chunks stream; a mirror whose count is stale draws garbage instances out of the
//    tail of the buffer.
//
// The 900 traffic streaks are deliberately NOT mirrored (§3.7b): they are the largest fill item of
// the four and doubled light streaks on water read as noise rather than as reflection.

import * as THREE from 'three';
import { patchMirror, patchHalo, filmMaterial, signMaterial, stripMaterial, strobeMaterial,
  haloMaterial } from './materials.js';

// Which source fields are mirrored, in the order §3.8's budget lists them. `signsBox` is NOT
// mirrored: it is a lit PANEL on normal blending, and a normal-blended dark rectangle painted
// upside down on the road is a hole in the street, not a reflection. What doubles in the plates is
// the neon.
const BUCKETS = [
  { src: 'neon', mode: 'tube', low: true },
  { src: 'strip', mode: 'strip', low: true },
  { src: 'strobe', mode: 'strobe', low: false },   // Q.reflect 'signs+strips' drops this one
];

export class Reflections {
  constructor(scene, Q, atlas, sky, signage) {
    this.Q = Q; this.signage = signage;
    this.enabled = true;

    // ── the mirror group ───────────────────────────────────────────────────
    this.group = new THREE.Group();
    this.group.scale.set(1, -1, 1);
    this.group.position.y = 0;
    this.group.updateMatrix();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    this.mats = [];
    this.buckets = [];
    const full = Q.reflect === 'full';
    for (const b of BUCKETS) {
      if (!full && !b.low) continue;
      const src = signage[b.src];
      if (!src) continue;
      const mat = b.mode === 'tube' ? signMaterial(signage.sa.tex, 'tube')
        : b.mode === 'strip' ? stripMaterial() : strobeMaterial();
      // 220 m, not 26. The fade is in MIRROR SPACE — the reflection of a sign 180 m up a tower
      // lives at y = -180 — so a shallow depth does not "fade the reflection with distance below
      // the surface", it deletes the entire skyline's reflection and leaves only the shopfronts.
      patchMirror(mat, 220, 0.42);
      const mesh = new THREE.InstancedMesh(src.geo, mat, src.cap);
      // BY REFERENCE. Not a copy — the point is that the source field's own writes are the
      // reflection's writes.
      mesh.instanceMatrix = src.mesh.instanceMatrix;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 2;
      mesh.count = src.n;
      this.group.add(mesh);
      this.buckets.push({ name: b.src, src, mesh, tris: src.tris });
      this.mats.push(mat);
    }

    // ── the water film (§3.6) ──────────────────────────────────────────────
    // Co-planar at y = +0.02 and drawn after the mirror, so the reflection sits under it and the
    // two read as one wet surface. Its own alpha is the variant's rain, so a dry daysmog street
    // costs nothing at all.
    this.filmMat = filmMaterial(atlas, sky.env);
    this.film = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), this.filmMat);
    this.film.rotation.x = -Math.PI / 2;
    this.film.position.y = 0.02;
    this.film.frustumCulled = false;
    this.film.matrixAutoUpdate = false;
    this.film.renderOrder = 3;
    this.film.updateMatrix();
    scene.add(this.film);

    // ── §4.4's halo field, LOW only ────────────────────────────────────────
    // A second instanced draw of the same buffers with a 64² radial gradient. Capped to the
    // nearest 400 signs / 500 strips / 300 strobes: the cap is a slot RANGE in the existing
    // buffers (mesh.count), which is free, and the shader carries §3.2.2's own distance ramp so
    // what survives the cap is also what is near. See `haloCost()` for the measurement §4.4
    // demands before this substitution is allowed to ship.
    this.halos = [];
    this.haloMats = [];
    if (Q.halos) {
      const CAPS = { neon: Q.haloCap.signs, strip: Q.haloCap.strips, strobe: Q.haloCap.strobes };
      for (const name of ['neon', 'strip', 'strobe']) {
        const src = signage[name];
        if (!src || !CAPS[name]) continue;
        const tube = name === 'strip';
        const mat = haloMaterial(atlas);
        patchHalo(mat, Q.haloScale, tube ? 'tube' : 'sprite');
        // Sprite buckets get their OWN quad carrying the source field's instanced attributes by
        // reference; the tube bucket reuses the source box outright, because what is being
        // fattened is that box.
        let geo;
        if (tube) {
          geo = src.geo;
        } else {
          geo = new THREE.PlaneGeometry(1, 1);
          for (const a of src.attrSpec) geo.setAttribute(a.name, src.attr[a.name]);
        }
        const mesh = new THREE.InstancedMesh(geo, mat, src.cap);
        mesh.instanceMatrix = src.mesh.instanceMatrix;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 7;                  // over everything it is haloing
        mesh.count = 0;
        scene.add(mesh);
        this.halos.push({ name, src, mesh, cap: CAPS[name], ownGeo: !tube });
        this.haloMats.push(mat);
      }
    }

    // Obligation T7. gates_p2's R0 sweep hides the signage layers so it measures the dither
    // alone — and every mesh in this file rides that same R0, through the shared ramp in the
    // mirrored materials and through patchHalo's copy of it. Hiding the source without hiding
    // these would put part 2's ramp back into part 3's residue by a different door, so
    // signage.setVisible drives them too.
    signage.attachDerived({
      signs: this.buckets.filter(b => b.name === 'neon').map(b => b.mesh)
        .concat(this.halos.filter(h => h.name === 'neon').map(h => h.mesh)),
      all: this.buckets.map(b => b.mesh).concat(this.halos.map(h => h.mesh)),
    });
  }

  // Called once a frame, after the city has flushed its fields.
  update(dt, rain) {
    for (const b of this.buckets) b.mesh.count = this.enabled ? b.src.n : 0;
    for (const h of this.halos) h.mesh.count = Math.min(h.src.n, h.cap);
    // the film: opacity tracks the weather, and the ripple scrolls with the wind
    const wet = Math.max(0.12, rain);
    this.filmMat.opacity = 0.22 + 0.42 * wet;
    // `filmOff` is the gate's control and must be consulted HERE — see weather.js' note: a flag
    // set on mesh.visible is overwritten by the next update() and the measurement silently
    // becomes "the layer against itself".
    this.film.visible = wet > 0.05 && !this.filmOff;
    const off = this.filmMat.normalMap.offset;
    off.x = (off.x + dt * 0.012 * (0.4 + wet)) % 1;
    off.y = (off.y + dt * 0.031 * (0.4 + wet)) % 1;
  }

  // The film follows the camera on the same 256 m snap as the road, or it swims.
  snap(x, z) {
    if (this.film.position.x === x && this.film.position.z === z) return;
    this.film.position.set(x, 0.02, z);
    this.film.updateMatrix();
  }

  setEnabled(on) {
    this.enabled = !!on;
    for (const b of this.buckets) b.mesh.visible = this.enabled;
    return this.enabled;
  }

  setFilmVisible(on) { this.filmOff = !on; this.film.visible = !!on; return !!on; }

  setHalosVisible(on) {
    for (const h of this.halos) h.mesh.visible = !!on;
    return !!on;
  }

  breakdown() {
    return {
      buckets: this.buckets.map(b => ({ field: b.name, instances: b.mesh.count, tris: b.mesh.count * b.tris })),
      draws: this.buckets.filter(b => b.mesh.count > 0).length + (this.film.visible ? 1 : 0),
      tris: this.buckets.reduce((a, b) => a + b.mesh.count * b.tris, 0),
      halos: this.halos.map(h => ({ field: h.name, drawn: h.mesh.count, cap: h.cap, of: h.src.n })),
      film: { visible: this.film.visible, opacity: +this.filmMat.opacity.toFixed(3) },
    };
  }

  dispose() {
    for (const m of this.mats.concat(this.haloMats)) m.dispose();
    for (const h of this.halos) if (h.ownGeo) h.mesh.geometry.dispose();   // never the source's
    this.filmMat.dispose();
    this.film.geometry.dispose();
    this.group.parent?.remove(this.group);
    this.film.parent?.remove(this.film);
  }
}
