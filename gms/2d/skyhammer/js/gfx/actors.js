// world.ents -> meshes. Ground structures are INSTANCED per shape (one draw call for every hut on
// screen); aircraft and bosses get their own meshes because there are few of them and they carry
// per-entity extras (prop disc, rim light, exhaust).
//
// Render state that the sim must not know about — damage lean, hit shake, flash — lives in a
// WeakMap keyed by the ent, so nothing here writes into the sim's objects.

import * as THREE from 'three';
import { makeModelCache, classify, depthFor } from './models/index.js';
import { makeApproachBox } from './models/ground.js';
import { MAT, patchRim, patchHaze, makeTex, makeBin } from './materials.js';
import { getPlate } from './plates.js';
import { livery, mix, shade, lum } from './palette.js';
import { FLIP } from '../data/tuning.js';

const CAP0 = 24;
const RS = new WeakMap();     // ent -> render state

function stateOf(e) {
  let s = RS.get(e);
  if (!s) { s = { lean: 0, shake: 0, flash: 0, spin: Math.random() * 6.28, seen: 0,
                  face: 0, faceT: 0, roll: 0, rollFrom: 0, rollTo: 0, rollP: 1 }; RS.set(e, s); }
  return s;
}

export function bumpHit(ent, mag = 1) {
  const s = stateOf(ent);
  s.shake = Math.min(1.4, s.shake + mag);
  s.flash = Math.min(1, s.flash + mag * 0.8);
}

/**
 * Wing-levelling roll, in radians about the model's own nose axis. VISUAL ONLY: this reads
 * `ang` and writes nothing back, so the sim is untouched and the plane still flies exactly as
 * it did upside down. Committing needs the nose to hold the new side of vertical for FLIP.dwell
 * — otherwise a loop rolls the model twice per revolution and a plane hovering near vertical
 * flickers. Near-vertical is treated as neither side: it does not commit and does not reset.
 */
function rollFor(st, ang, dt) {
  const c = Math.cos(ang);
  const face = c < 0 ? -1 : 1;
  if (!st.face) {                                   // first frame: already levelled, no animation
    st.face = face; st.roll = face < 0 ? Math.PI : 0;
    st.rollFrom = st.roll; st.rollTo = st.roll; st.rollP = 1;
    return st.roll;
  }
  if (Math.abs(c) > FLIP.deadCos) {
    if (face === st.face) st.faceT = 0;
    else {
      st.faceT += dt;
      if (st.faceT >= FLIP.dwell) {
        st.face = face; st.faceT = 0;
        st.rollFrom = st.roll; st.rollTo = face < 0 ? Math.PI : 0; st.rollP = 0;
      }
    }
  }
  if (st.rollP < 1) {
    st.rollP = Math.min(1, st.rollP + dt / FLIP.dur);
    const k = st.rollP * st.rollP * (3 - 2 * st.rollP);     // smoothstep, so it eases in and out
    st.roll = st.rollFrom + (st.rollTo - st.rollFrom) * k;
  }
  return st.roll;
}

export function makeActors(camApi, scene) {
  const bin = makeBin();
  const root = new THREE.Group();
  scene.add(root);

  const cache = makeModelCache();
  // a weak rim on structures too: it is what stops a backlit prop reading as a black hole
  const groundMat = patchRim(MAT.prop(), '#ffd9a8', 0.30, 'prop');
  // ENEMIES ARE DELIBERATELY DIMMER. `color` multiplies the vertex colours, so one shared material
  // pulls every hostile aeroplane below the player without touching a single model.
  // Enemy aircraft are lifted TOWARD the background (an emissive tint of the sky) rather than
  // darkened. Darkening a hostile against a bright sky makes it MORE readable, not less — which is
  // the opposite of what ART_NOTES §1.2 asks for. Fog is kept off the player entirely.
  const airMat = patchHaze(MAT.aircraft({ color: 0x9ba1a7 }), 'enemyair');
  // The player is DARKENED and then given a strong warm rim. A brightly lit plane on a bright sky
  // has almost no mean-vs-surround contrast however saturated it is; a dark core with a hot edge
  // reads against a bright sky AND against dark ground, which is the whole point of ART.md §2.
  const playerMat = patchRim(MAT.aircraft({ color: 0x3d4144, emissive: 0x0a0906, emissiveIntensity: 1 }), '#ffe6bc', 1.6, 'player');

  const inst = new Map();       // shape -> { mesh, cap, n }
  const solo = new Map();       // ent id -> { obj, shape, livery }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const E = new THREE.Euler();
  const C = new THREE.Color();

  // contact / altitude shadows: one instanced quad, dark, laid on the terrain
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadowMat = MAT.alpha(null, { color: 0x000000, opacity: 0.34, depthTest: true });
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, 64);
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.frustumCulled = false;
  shadows.renderOrder = 2;
  shadows.count = 0;
  root.add(shadows);

  // the readability-law halo behind the player (ART.md §2 — do not drop it)
  const haloGeo = new THREE.PlaneGeometry(1, 1);
  const haloMat = MAT.additive(null, { depthTest: false, opacity: 0.9 });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.renderOrder = 8;
  halo.visible = false;
  root.add(halo);

  // The translucent green landing box Aaron asked for. ART built the factory; it lives here
  // because it needs the PLAYER ent every frame — the accept window is pad.w + player.w wide, so
  // it cannot be baked into the pad model. It restates the shape of landing.js's predicate; if
  // that predicate ever moves, this has to move with it (see ART_NOTES §9).
  const approach = makeApproachBox();
  root.add(approach.root);

  const propGeo = new THREE.CircleGeometry(0.5, 18);
  const propMat = MAT.alpha(null, { color: 0xffffff, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide });

  let pal = null, palKey = '', terrain = null, t = 0;

  function instFor(shape, need) {
    let it = inst.get(shape);
    if (it && it.cap >= need) return it;
    if (it) { root.remove(it.mesh); it.mesh.dispose(); }
    const geo = cache.get(shape, pal, palKey);
    const cap = Math.max(CAP0, need * 2);
    const mesh = new THREE.InstancedMesh(geo, groundMat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    it = { mesh, cap, n: 0 };
    inst.set(shape, it);
    root.add(mesh);
    return it;
  }

  function soloFor(ent, shape, liv) {
    let s = solo.get(ent.id);
    if (s && s.shape === shape && s.livery === liv) return s;
    if (s) root.remove(s.obj);
    const kind = classify(shape);
    const geo = cache.get(shape, pal, palKey, { livery: liv });
    const isPlayer = ent.kind === 'player';
    const mesh = new THREE.Mesh(geo, isPlayer ? playerMat : (kind === 'air' ? airMat : groundMat));
    mesh.castShadow = true;
    const obj = new THREE.Group();
    obj.add(mesh);
    if (geo.userData && geo.userData.prop) {
      const disc = new THREE.Mesh(propGeo, propMat);
      disc.position.set(geo.userData.prop * 0.78, 0.004, 0);
      disc.rotation.y = Math.PI / 2;
      disc.scale.setScalar(0.34);
      obj.add(disc);
      obj.userData.disc = disc;
    }
    // ZXY so rotation.x is a roll about the ALREADY-HEADED nose axis. In the default XYZ order
    // the x term would rotate about the parent's axis instead, which pitches the plane out of the
    // side-on plane rather than rolling it.
    obj.rotation.order = 'ZXY';
    obj.userData.mesh = mesh;
    root.add(obj);
    s = { obj, shape, livery: liv, kind };
    solo.set(ent.id, s);
    return s;
  }

  const interp = (v, dv, alpha) => v + dv * (alpha - 1) / 60;

  return {
    root,

    setPalette(p, key) {
      pal = p; palKey = key;
      cache.clear();
      for (const it of inst.values()) { root.remove(it.mesh); it.mesh.dispose(); }
      inst.clear();
      for (const s of solo.values()) root.remove(s.obj);
      solo.clear();
      bin.dispose();
      haloMat.map = bin.keep(makeTex(getPlate('halo', p, key)));
      haloMat.color.set(mix(p.fx.accent, '#ffffff', 0.4));
      haloMat.needsUpdate = true;
      const _sl = 0;
      propMat.map = bin.keep(makeTex(getPlate('spark', p, key)));
      propMat.color.set(mix(p.sky.horizon, '#ffffff', 0.5));
      airMat.userData.haze.value.set(mix(p.sky.stops[1][1], p.fog.col, 0.45));
      airMat.userData.hazeK.value = 0.40;

      // ADAPTIVE READABILITY: the player's core tracks AWAY from the sky's luminance. On a bright
      // daylight sky it goes near-black with a hot rim; on a night sky it lifts. A fixed livery
      // value cannot satisfy ART.md §2 across 72 palettes, and a plane at the sky's own luminance
      // is invisible however saturated it is.
      const sl = lum(p.sky.horizon);
      const core = sl > 0.5 ? 0.06 + (1 - sl) * 0.22 : 0.40 + (0.5 - sl) * 0.90;
      playerMat.color.setScalar(Math.max(0.10, Math.min(0.92, core)));
      playerMat.emissive.set(sl > 0.5 ? 0x060505 : 0x1a1510);
      playerMat.userData.rim.value = sl > 0.5 ? 0.85 : 1.25;
      playerMat.specular.setScalar(sl > 0.5 ? 0.05 : 0.16);
      haloMat.opacity = sl > 0.5 ? 0.42 : 0.72;
      propMat.needsUpdate = true;
      shadowMat.map = bin.keep(makeTex(getPlate('scorch', p, key)));
      shadowMat.needsUpdate = true;
    },

    setTerrain(tr) { terrain = tr; },

    update(world, alpha, dt) {
      if (!pal) return;
      t += dt;
      const camX = camApi.cam.position.x, vw = camApi.vw;
      const x0 = camX - vw * 0.62, x1 = camX + vw * 0.62;

      for (const it of inst.values()) it.n = 0;
      let sh = 0;
      const live = new Set();

      const ents = world.ents || [];
      for (const e of ents) {
        if (e.dead) continue;
        const ex = interp(e.x, e.vx || 0, alpha);
        if (ex < x0 - 260 || ex > x1 + 260) continue;
        const ey = interp(e.y, e.vy || 0, alpha);
        const st = stateOf(e);
        st.shake *= Math.max(0, 1 - dt * 6);
        st.flash *= Math.max(0, 1 - dt * 5);
        const d = e.def || {};
        const shape = d.shape || (e.kind === 'pad' ? 'pad' : 'hut');
        const kind = classify(shape);
        const hpF = e.hpMax ? Math.max(0, Math.min(1, e.hp / e.hpMax)) : 1;

        if (e.kind === 'player' || e.kind === 'fighter' || kind === 'air' || e.kind === 'boss') {
          const liv = e.kind === 'player' ? (d.livery || 'olive') : (d.livery || (e.id % 2 ? 'enemy' : 'enemy2'));
          const s = soloFor(e, shape, liv);
          live.add(e.id);
          const len = kind === 'air' ? (d.len || (e.w ? e.w * 2 : 120)) : 1;
          s.obj.position.set(ex + (Math.random() - 0.5) * st.shake * 6, ey + (Math.random() - 0.5) * st.shake * 6, 0);
          s.obj.rotation.set(kind === 'air' ? rollFor(st, e.ang || 0, dt) : 0, 0, e.ang || 0);
          if (kind === 'air') s.obj.scale.setScalar(len);
          else s.obj.scale.set(e.w || d.w || 100, e.h || d.h || 60, depthFor(shape));
          if (s.obj.userData.disc) {
            s.obj.userData.disc.rotation.x = t * 42;
            s.obj.userData.disc.scale.setScalar(0.30 + Math.sin(t * 30) * 0.01);
          }
          const dm = s.obj.userData.mesh;
          if (dm.material === playerMat) {
            halo.visible = true;
            halo.position.set(ex, ey, -30);
            halo.scale.setScalar(len * 1.9);
            // an altitude shadow on the ground directly below the player
            if (terrain && sh < shadows.count + 64) {
              const gy = terrain.heightAt(ex);
              const alt = Math.max(0, ey - gy);
              const k = Math.max(0, 1 - alt / 900);
              if (k > 0.02) {
                P.set(ex, gy - 16, 190);
                S.set(len * (0.9 + (1 - k) * 1.3), len * 0.26 * (0.6 + k * 0.6), 1);
                Q.setFromEuler(E.set(0, 0, 0));
                M.compose(P, Q, S);
                shadows.setMatrixAt(sh++, M);
              }
            }
          }
          continue;
        }

        // ---- instanced ground / flak / balloon / pad / pickup
        const it = instFor(shape, 1);
        if (it.n >= it.cap) continue;
        const lean = (1 - hpF) * 0.20 * ((e.id % 2) ? 1 : -1);
        const sx = (Math.random() - 0.5) * st.shake * 5;
        const w = e.w || d.w || 40, h = e.h || d.h || 30;
        const grounded = e.kind !== 'balloon';
        P.set(ex + sx, grounded ? ey - h : ey - h * 0.9, 0);
        Q.setFromEuler(E.set(0, 0, lean));
        S.set(w, h * 1.2, depthFor(shape));
        M.compose(P, Q, S);
        it.mesh.setMatrixAt(it.n, M);
        const dark = 0.62 + hpF * 0.38;
        C.setRGB(dark + st.flash * 1.4, dark + st.flash * 1.1, dark + st.flash * 0.7);
        it.mesh.setColorAt(it.n, C);
        it.n++;

        if (grounded && sh < 60 && e.kind !== 'pickup') {
          P.set(ex + sx, (e.y - h) - 6, 205);
          S.set(w * 2.4, h * 0.42, 1);
          Q.setFromEuler(E.set(0, 0, 0));
          M.compose(P, Q, S);
          shadows.setMatrixAt(sh++, M);
        }
      }

      // nearest live pad to the player, and only while actually flying: a box drawn around a
      // deck you are already parked on is noise.
      const pl = world.player;
      let nearPad = null, nearD = Infinity;
      if (pl && !pl.dead && !pl.landed) {
        for (const e of ents) {
          if (e.dead || e.kind !== 'pad') continue;
          const d = Math.abs(e.x - pl.x);
          if (d < nearD) { nearD = d; nearPad = e; }
        }
      }
      if (nearPad && nearD < camApi.vw * 1.1) approach.place(nearPad, pl, t);
      else approach.hide();

      for (const it of inst.values()) {
        it.mesh.count = it.n;
        it.mesh.instanceMatrix.needsUpdate = true;
        if (it.mesh.instanceColor) it.mesh.instanceColor.needsUpdate = true;
      }
      shadows.count = sh;
      shadows.instanceMatrix.needsUpdate = true;

      for (const [id, s] of solo) {
        if (!live.has(id)) { root.remove(s.obj); solo.delete(id); }
      }
      if (!world.player || world.player.dead) halo.visible = false;
    },

    setRim(k) { playerMat.userData.rim.value = k; },

    /**
     * FALSIFICATION HOOK for tools/contrastgate.mjs. Paints the player in a flat sky colour, kills
     * the rim and hides the halo — the exact failure ART.md §2 exists to prevent. A gate that has
     * never been seen to fail against this is not evidence (CONTRACTS §13).
     */
    camouflagePlayer(hex) {
      if (!hex) {
        playerMat.color.set(0x6e7376);
        playerMat.emissive.set(0x0a0906);
        playerMat.userData.rim.value = 1.5;
        halo.visible = true;
        return;
      }
      playerMat.color.set(0x000000);      // kill the lit component entirely
      playerMat.emissive.set(hex);        // and emit exactly the background colour
      playerMat.emissiveIntensity = 1;
      playerMat.userData.rim.value = 0;
      halo.visible = false;
    },
    drawCalls() { return inst.size + solo.size + 2; },
    dispose() {
      cache.clear(); bin.dispose();
      for (const it of inst.values()) it.mesh.dispose();
      if (approach.dispose) approach.dispose();
      shadowGeo.dispose(); haloGeo.dispose(); propGeo.dispose();
      groundMat.dispose(); airMat.dispose(); playerMat.dispose();
      shadowMat.dispose(); haloMat.dispose(); propMat.dispose();
    },
  };
}
