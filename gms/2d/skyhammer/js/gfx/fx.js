// The small stuff that sells it: tracer streaks, muzzle flash, bombs and rockets in flight,
// impact sparks and dirt kicks, jet exhaust, and contrails at altitude.
//
// This file also DRAINS world.events (CONTRACTS §8) and routes them to explosions and debris. The
// sim never spawns a particle; it pushes plain objects and this is where they land.

import * as THREE from 'three';
import { getPlate } from './plates.js';
import { MAT, makeTex, makeBin } from './materials.js';
import { mix, shade } from './palette.js';
import { bumpHit } from './actors.js';

const TRACERS = 320;
const ORD = 96;
const FLASH = 24;

export function makeFx(camApi, scene, explosions, debris) {
  const bin = makeBin();
  const root = new THREE.Group();
  scene.add(root);

  const quad = new THREE.PlaneGeometry(1, 1);

  const tracerMat = MAT.additive(null, { depthTest: false });
  const tracers = new THREE.InstancedMesh(quad, tracerMat, TRACERS);
  tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TRACERS * 3), 3);
  tracers.frustumCulled = false;
  tracers.renderOrder = 20;
  tracers.count = 0;
  root.add(tracers);

  // bombs / rockets: a shared shell body, instanced, oriented along flight
  const ordGeo = new THREE.CapsuleGeometry(0.5, 1.6, 3, 6);
  ordGeo.rotateZ(-Math.PI / 2);
  const ordMat = MAT.prop();
  const ord = new THREE.InstancedMesh(ordGeo, ordMat, ORD);
  ord.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ord.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ORD * 3).fill(1), 3);
  ord.castShadow = false;
  ord.frustumCulled = false;
  ord.count = 0;
  root.add(ord);

  const flashMat = MAT.additive(null, { depthTest: false });
  const flashes = new THREE.InstancedMesh(quad, flashMat, FLASH);
  flashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flashes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLASH * 3), 3);
  flashes.frustumCulled = false;
  flashes.renderOrder = 21;
  flashes.count = 0;
  root.add(flashes);

  const fx = { x: new Float32Array(FLASH), y: new Float32Array(FLASH), a: new Float32Array(FLASH), t: new Float32Array(FLASH), d: new Float32Array(FLASH), s: new Float32Array(FLASH), on: new Uint8Array(FLASH) };
  let fHead = 0;

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const E = new THREE.Euler(), C = new THREE.Color();
  let pal = null, terrain = null, t = 0, hitCount = 0;
  const trailT = new Map();   // ent id -> next trail time

  function flash(x, y, ang, size, hex, dur = 0.09) {
    const i = fHead; fHead = (fHead + 1) % FLASH;
    fx.x[i] = x; fx.y[i] = y; fx.a[i] = ang; fx.t[i] = 0; fx.d[i] = dur; fx.s[i] = size; fx.on[i] = 1;
    C.set(hex).toArray(flashes.instanceColor.array, i * 3);
  }

  return {
    root,

    setPalette(p, key) {
      pal = p;
      bin.dispose();
      tracerMat.map = bin.keep(makeTex(getPlate('streak', p, key)));
      tracerMat.needsUpdate = true;
      flashMat.map = bin.keep(makeTex(getPlate('fire', p, key)));
      flashMat.needsUpdate = true;
    },

    setTerrain(tr) { terrain = tr; },

    /** CONTRACTS §8. Adding a new event never requires a sim change downstream. */
    events(list, world) {
      if (!list || !pal) return;
      for (const ev of list) {
        switch (ev.e) {
          case 'explode': {
            const g = terrain ? terrain.heightAt(ev.x) : undefined;
            explosions.boom(ev.x, ev.y, ev.r || (ev.big ? 320 : 90), { nuke: !!ev.nuke || (ev.r || 0) >= 520, ground: g, kind: ev.kind });
            // A blast in open ground throws dirt, not masonry. Real mesh chunks come from `kill`,
            // where the def says how big the thing that broke actually was.
            const rr = ev.r || 90;
            if (rr > 120) debris.shatter(ev.x, ev.y, Math.min(46, rr * 0.10), Math.min(34, rr * 0.08),
              Math.min(8, 2 + Math.round(rr / 90)), { force: 150 + rr * 0.5 });
            break;
          }
          case 'kill': {
            const g = terrain ? terrain.heightAt(ev.x) : undefined;
            const r = ev.def ? Math.max(60, (ev.def.w || 50) * 2.1) : 110;
            explosions.boom(ev.x, ev.y, r, { ground: g, kind: ev.kind });
            debris.shatter(ev.x, ev.y, (ev.def?.w || 40), (ev.def?.h || 30), 0, { force: 260 });
            break;
          }
          case 'hit': {
            if ((hitCount++ & 1) === 0) explosions.boom(ev.x, ev.y, 13, { kind: 'hit' });
            if (ev.ent) bumpHit(ev.ent, 0.5);
            break;
          }
          case 'fire': {
            flash(ev.x, ev.y, ev.ang || 0, 46, mix(pal.fx.tracer, '#ffffff', 0.35));
            break;
          }
          case 'pickup':
            explosions.trail(ev.x, ev.y, 0, 90, 22, 62, 0.5, 0.8, pal.fx.accent, 0);
            break;
          default: break;
        }
      }
    },

    update(world, alpha, dt) {
      if (!pal) return;
      t += dt;
      const camX = camApi.cam.position.x, vw = camApi.vw;
      const x0 = camX - vw * 0.62, x1 = camX + vw * 0.62;

      // ---- projectiles
      let nT = 0, nO = 0;
      const tc = tracers.instanceColor.array, oc = ord.instanceColor.array;
      const tracerCol = new THREE.Color(pal.fx.tracer);
      const projs = world.projs || [];
      for (const p of projs) {
        if (p.dead) continue;
        const x = p.x + (p.vx || 0) * (alpha - 1) / 60;
        const y = p.y + (p.vy || 0) * (alpha - 1) / 60;
        if (x < x0 - 200 || x > x1 + 200) continue;
        const sp = Math.hypot(p.vx || 0, p.vy || 0);
        const ang = Math.atan2(p.vy || 0, p.vx || 1);
        const heavy = p.kind === 'bomb' || p.kind === 'rocket' || p.kind === 'cluster' || p.kind === 'nuke';

        if (heavy) {
          if (nO >= ORD) continue;
          const s = p.kind === 'nuke' ? 34 : (p.kind === 'rocket' ? 15 : 20);
          P.set(x, y, 0);
          Q.setFromEuler(E.set(0, 0, ang));
          S.set(s * 1.5, s, s);
          M.compose(P, Q, S);
          ord.setMatrixAt(nO, M);
          C.set(p.team === 0 ? pal.prop.metal : pal.prop.dark);
          oc[nO * 3] = C.r; oc[nO * 3 + 1] = C.g; oc[nO * 3 + 2] = C.b;
          nO++;
          if (p.kind === 'rocket' || p.kind === 'nuke') {
            explosions.trail(x - Math.cos(ang) * 20, y - Math.sin(ang) * 20, -Math.cos(ang) * 40, 30,
              14, 46, 0.5, 0.45, pal.fog.col);
            flash(x - Math.cos(ang) * 22, y - Math.sin(ang) * 22, ang, 30, pal.fx.fire, 0.05);
          }
        } else {
          if (nT >= TRACERS) continue;
          const len = Math.max(26, Math.min(150, sp * 0.045)) * (p.kind === 'shell' ? 1.5 : 1);
          const w = p.kind === 'shell' ? 8 : 4.5;
          P.set(x, y, 2);
          Q.setFromEuler(E.set(0, 0, ang));
          S.set(len, w, 1);
          M.compose(P, Q, S);
          tracers.setMatrixAt(nT, M);
          const k = p.team === 0 ? 1 : 0.85;
          const hot = p.team === 0 ? tracerCol : C.set(mix(pal.fx.fire, '#ff7a4a', 0.5));
          tc[nT * 3] = hot.r * k; tc[nT * 3 + 1] = hot.g * k * 0.92; tc[nT * 3 + 2] = hot.b * k * 0.7;
          nT++;
        }
      }
      tracers.count = nT; ord.count = nO;
      tracers.instanceMatrix.needsUpdate = true; tracers.instanceColor.needsUpdate = true;
      ord.instanceMatrix.needsUpdate = true; ord.instanceColor.needsUpdate = true;

      // ---- muzzle flashes
      let nF = 0;
      const fc = flashes.instanceColor.array;
      for (let i = 0; i < FLASH; i++) {
        if (!fx.on[i]) continue;
        fx.t[i] += dt;
        const k = fx.t[i] / fx.d[i];
        if (k >= 1) { fx.on[i] = 0; continue; }
        const a = (1 - k) * (1 - k) * 1.6;
        P.set(fx.x[i], fx.y[i], 4);
        Q.setFromEuler(E.set(0, 0, fx.a[i]));
        S.set(fx.s[i] * (1 + k * 0.8), fx.s[i] * 0.75, 1);
        M.compose(P, Q, S);
        flashes.setMatrixAt(nF, M);
        const src = i * 3, dst = nF * 3;
        fc[dst] = fc[src] * a; fc[dst + 1] = fc[src + 1] * a; fc[dst + 2] = fc[src + 2] * a;
        nF++;
      }
      flashes.count = nF;
      flashes.instanceMatrix.needsUpdate = true;
      flashes.instanceColor.needsUpdate = true;

      // ---- engine trails: jet flame, contrails at altitude, smoke from a damaged aeroplane
      for (const e of world.ents || []) {
        if (e.dead) continue;
        if (e.kind !== 'player' && e.kind !== 'fighter') continue;
        if (e.x < x0 || e.x > x1) continue;
        const nx = trailT.get(e.id) || 0;
        if (t < nx) continue;
        const d = e.def || {};
        const jet = d.shape && /jet|delta|stealth|drone|mig|proto/.test(d.shape);
        const len = d.len || (e.w ? e.w * 2 : 110);
        const ang = e.ang || 0;
        const bx = e.x - Math.cos(ang) * len * 0.5, by = e.y - Math.sin(ang) * len * 0.5;
        const hurt = e.hpMax ? e.hp / e.hpMax : 1;

        if (jet) {
          flash(bx, by, ang, len * 0.26, mix(pal.fx.fire, '#8fd6ff', 0.25), 0.07);
          explosions.trail(bx, by, -Math.cos(ang) * 60, 8, len * 0.12, len * 0.5, 0.55, 0.16, pal.fog.col);
          trailT.set(e.id, t + 0.03);
        } else {
          trailT.set(e.id, t + 0.07);
        }
        if (e.y > 1350) {
          explosions.trail(bx, by, -Math.cos(ang) * 20, 2, len * 0.09, len * 0.55, 2.6, 0.30, '#ffffff');
        }
        if (hurt < 0.45) {
          explosions.trail(bx, by, -Math.cos(ang) * 40, 26, len * 0.14, len * 0.7, 1.5, 0.5,
            mix(pal.earth.deep, '#000000', 0.4));
          if (hurt < 0.22) explosions.trail(bx, by, -Math.cos(ang) * 30, 60, len * 0.10, len * 0.24, 0.35, 0.9, pal.fx.fire, 0);
        }
      }
    },

    drawCalls() { return 3; },
    dispose() { bin.dispose(); quad.dispose(); ordGeo.dispose(); tracerMat.dispose(); ordMat.dispose(); flashMat.dispose(); },
  };
}
