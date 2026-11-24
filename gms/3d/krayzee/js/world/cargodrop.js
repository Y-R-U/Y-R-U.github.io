// A6 / D39 (STAIRS) the Herc's ramp drop: OPEN RAMP (≈ 5 s of hydraulics), then DROP HAMPER rolls the royal hamper
// out of the hold; it falls, its chute pops and it drifts down with the wind (js/flight/cargo.js). Landing within
// BONUSES.cargo_drop.radius of the Palace Lawn pays Royal Picnic. One hamper per sortie: stop on the ground to reload.
import * as THREE from 'three';
import { Builder, col } from './util.js';
import { BONUSES } from '../../data/rules.js';
import { DROP, createCrate, stepCrate, predictLanding, windVel, targetFor, distTo, dropBlock, dropHint } from '../flight/cargo.js';

const MAX_CRATES = 3;
let parts = null;
function buildParts() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  const box = new Builder();
  box.box(0, 0.65, 0, 1.6, 1.3, 1.6, col('#6b4a2a'));
  box.box(0, 0.65, 0, 1.66, 0.14, 1.66, col('#e2ac2c'));
  box.geo(new THREE.CylinderGeometry(0.35, 0.3, 0.3, 10), new THREE.Matrix4().makeTranslation(0, 1.45, 0), col('#e2ac2c'));
  const dome = new Builder();
  // rigging lines in the canopy's frame (origin 5.2 m over the crate's lid) so they fold up with it
  for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) dome.beam([x, -5.2, z], [x * 0.2, 0.6, z * 0.2], 0.04, col('#ddd6c4'));
  const sph = new THREE.SphereGeometry(4.2, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2.3);
  const c = [], P = col('#5a1f7a'), G = col('#e2ac2c'), pos = sph.attributes.position;
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 2; c.push(...(k ? G : P)); }
  sph.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  dome.geo(sph, new THREE.Matrix4().makeScale(1, 0.55, 1));
  const domeGeo = dome.build();
  // a double-sided canopy so it reads from under it too
  const domeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  parts = { boxGeo: box.build(), domeGeo, m, domeMat };
  return parts;
}

function crateObject() {
  const p = parts || buildParts();
  const g = new THREE.Group(); g.name = 'hamper';
  const body = new THREE.Mesh(p.boxGeo, p.m); body.castShadow = true;
  const dome = new THREE.Mesh(p.domeGeo, p.domeMat); dome.position.y = 1.4; dome.castShadow = true;
  g.add(body, dome);
  return { g, body, dome };
}

export function createCargoDrops({ scene }) {
  const H = { phase: 'closed', t: 0, crates: [], reloadT: 0, drops: 0, landings: [], worldId: null, rig: null, pred: null, hint: '', predT: 0 };
  const crateMesh = () => H.rig?._ext?.crate || null;
  const clear = () => { for (const c of H.crates) c.obj.g.removeFromParent(); H.crates.length = 0; };

  function setPhase(p) { H.phase = p; H.t = 0; }
  H.offered = (P, ctx = {}) => dropBlock(info(P, ctx)) === null;
  function info(P, ctx) {
    const ac = P.ac;
    return { herc: P.rig?.type === 'herc', airborne: !ac.onGround, crashed: ac.crashed, story: !!ctx.story, speedKt: ac.speed / 0.5144, agl: ac.agl,
      loaded: H.phase !== 'empty' && H.phase !== 'closing', busy: H.phase === 'opening' || H.phase === 'sliding' };
  }

  // tap OPEN RAMP / DROP HAMPER (the LAND slot's second pill, js/main.js onCargoPress)
  H.press = (key, P, ctx = {}) => {
    if (!P || P.rig?.type !== 'herc' || !H.offered(P, ctx)) return false;
    const pos = P.rig.root.position;
    if (key === 'ramp' && H.phase === 'closed') {
      setPhase('opening'); P.rig.setRamp(1);
      try { ctx.audio?.playRampWhine?.({ position: [pos.x, pos.y, pos.z], dur: DROP.rampOpen }); } catch (e) { /* */ }
      return true;
    }
    if (key === 'drop' && H.phase === 'open') { setPhase('sliding'); return true; }
    return false;
  };

  function release(P, ctx) {
    const cm = crateMesh(), ac = P.ac;
    const wp = new THREE.Vector3();
    if (cm) { cm.getWorldPosition(wp); cm.visible = false; } else wp.set(ac.pos.x, ac.pos.y - 2, ac.pos.z);
    // leaves the ramp at the plane's velocity, pushed a little aft by the rollers
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(P.rig.root.quaternion).multiplyScalar(2.5);
    const c = createCrate([wp.x, wp.y, wp.z], [ac.vel.x + back.x, ac.vel.y + back.y, ac.vel.z + back.z]);
    c.obj = crateObject(); c.obj.g.rotation.y = (-ac.heading * Math.PI) / 180; c.popped = false;
    scene.add(c.obj.g);
    H.crates.push(c);
    if (H.crates.length > MAX_CRATES) H.crates.shift().obj.g.removeFromParent();
    H.drops++;
  }

  // P: the player entity (or null); ctx: { ground(x,z), worldId, wind, story, game, audio, flash }
  H.update = (dt, P, ctx = {}) => {
    if (ctx.worldId !== H.worldId) { clear(); H.worldId = ctx.worldId; }
    const wind = windVel(ctx.wind), target = targetFor(ctx.worldId);
    for (let i = H.crates.length - 1; i >= 0; i--) {
      const c = H.crates[i], o = c.obj;
      if (stepCrate(c, dt, ctx.ground || (() => 0), wind)) {
        const dist = target ? distTo(target, c.x, c.z) : null;
        H.landings.push({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), dist: dist == null ? null : +dist.toFixed(1), t: +c.t.toFixed(1) });
        if (H.landings.length > 10) H.landings.shift();
        try { ctx.audio?.playGearThump?.({ position: [c.x, c.y, c.z], gain: 0.5 }); } catch (e) { /* */ }
        if (target) try { ctx.game?.handleEvent({ type: 'cargo_drop', actor: 'player', target: target.id, dist }); } catch (e) { /* */ }
        const paid = target && dist <= BONUSES.cargo_drop.radius;
        if (!paid) ctx.flash?.(target && dist < 3000 ? `HAMPER DOWN · ${Math.round(dist / 10) * 10} M FROM THE LAWN` : 'HAMPER DOWN');
      }
      if (!c.popped && c.chute > 0) { c.popped = true; try { ctx.audio?.playChutePop?.({ position: [c.x, c.y + 6, c.z] }); } catch (e) { /* */ } }
      o.g.position.set(c.x, c.y, c.z);
      const k = c.landed ? Math.max(0, 1 - c.landT / 1.5) : c.chute;
      o.dome.visible = k > 0.02;
      o.dome.scale.set(0.1 + 0.9 * k, 0.05 + 0.95 * (c.landed ? k * k : k), 0.1 + 0.9 * k);
      o.dome.position.y = 1.4 + 5.2 * (c.landed ? k * k : k);
      o.g.rotation.z = c.landed ? 0 : Math.sin(c.t * 2.1) * 0.12 * c.chute;
      if (c.landed && c.landT > DROP.linger) { o.g.removeFromParent(); H.crates.splice(i, 1); }
    }

    if (!P || P.rig?.type !== 'herc') { H.rig = null; return; }
    if (H.rig !== P.rig) { H.rig = P.rig; setPhase('closed'); P.rig.setRamp(0); const cm = crateMesh(); if (cm) cm.visible = true; }
    const ac = P.ac, cm = crateMesh();
    H.t += dt;
    // the ramp shuts if the drop stops being possible (LAND, too low, on the ground); the hamper stays aboard
    const why = ctx.landActive ? 'LAND' : dropBlock(info(P, ctx));
    if ((H.phase === 'opening' || H.phase === 'open') && why) { setPhase('closed'); P.rig.setRamp(0); H.shut = why; }
    if (H.phase === 'opening' && H.t >= DROP.rampOpen) setPhase('open');
    if (H.phase === 'sliding') {
      const f = Math.min(1, H.t / DROP.slide);
      if (cm) { const h = cm.userData.home; cm.position.set(h.x, h.y - 3.6 * Math.max(0, f - 0.25) / 0.75, h.z + 8.7 * f); }
      if (f >= 1) { release(P, ctx); setPhase('closing'); P.rig.setRamp(0); try { ctx.audio?.playRampWhine?.({ position: [ac.pos.x, ac.pos.y, ac.pos.z], dur: DROP.rampOpen }); } catch (e) { /* */ } }
    }
    if (H.phase === 'closing' && H.t >= DROP.rampOpen) setPhase('empty');
    // reload: stopped on the ground for a moment
    if (H.phase === 'empty' || H.phase === 'closing') {
      H.reloadT = ac.onGround && !ac.crashed && ac.gs < 1.5 ? H.reloadT + dt : 0;
      if (H.reloadT >= DROP.reloadStop) { H.reloadT = 0; setPhase('closed'); P.rig.setRamp(0); if (cm) { cm.position.copy(cm.userData.home); cm.visible = true; } }
    }
    // the button's hint, 4× a second
    if ((H.predT -= dt) <= 0) {
      H.predT = 0.25;
      H.pred = null;
      if (H.phase === 'open' && ctx.ground) {
        const lead = DROP.slide, v = ac.vel;
        const p0 = [ac.pos.x + v.x * lead, ac.pos.y - 2 + v.y * lead, ac.pos.z + v.z * lead];
        H.pred = predictLanding(p0, [v.x, v.y, v.z], ctx.ground, wind, 0.1);
      }
      H.hint = dropHint({ target, open: H.phase === 'open', pred: H.pred, x: ac.pos.x, z: ac.pos.z, heading: ac.heading });
    }
  };
  H.reset = () => { clear(); H.rig = null; setPhase('closed'); };
  Object.defineProperty(H, 'state', { get: () => ({ phase: H.phase, shut: H.shut || null, t: +H.t.toFixed(2), drops: H.drops, crates: H.crates.map((c) => ({ x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1), chute: +c.chute.toFixed(2), landed: c.landed })), landings: H.landings.slice(), hint: H.hint, pred: H.pred && { x: +H.pred.x.toFixed(1), z: +H.pred.z.toFixed(1) } }) });
  return H;
}
