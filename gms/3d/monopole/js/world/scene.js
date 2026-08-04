// The live star system's scene graph. Owns the subject a scenario puts in front of the camera
// and keeps the ship kit's rim key on the star's bearing.

import * as THREE from 'three';
import { defineScenario, frameCamera, getScenario } from '../scenarios.js';
import { shipClass, updateShipLighting, lodForDistance } from './kit/ship.js';
import { station, stationModule, allStationModules, hazeSlab } from './kit/station.js';
import { planet, updatePlanetLighting } from './kit/planet.js';
import { belt, asteroid, allBelts } from './kit/belt.js';
import { beams, engineTrails, motes, debris } from './fx.js';
import { atmosphere } from './atmos.js';
import { fleet, shipMover, allFormations } from './fleet.js';
import { getMaterial } from './materials.js';
import content from '../sim/content.js';
import { showroom } from '../showroom/index.js';

export class World {
  constructor() {
    this.object3D = new THREE.Group();
    this.subject = shipClass('hauler', { palette: 'ferrous' });
    this.object3D.add(this.subject);
  }

  bind(backdrop, lighting) { this.backdrop = backdrop; this.lighting = lighting; }

  setSubject(obj) {
    this.object3D.remove(this.subject);
    // the live system is parked, not destroyed, when a showroom entry borrows the stage
    if (this.subject !== this.live?.group) disposeTree(this.subject);
    this.subject = obj;
    if (obj) this.object3D.add(obj);
  }

  // The live star system, when one is running. A scenario replaces the subject and stands it down.
  setLive(reach) {
    this.live = reach || null;
    if (reach) this.setSubject(reach.group);
  }

  resumeLive() { if (this.live) this.setSubject(this.live.group); return !!this.live; }

  update(dt) {
    updateShipLighting(this.backdrop, this.lighting);
    updatePlanetLighting(this.backdrop, this.lighting);
    if (this.live && this.live.group === this.subject) this.live.update(dt);
  }

  clear() { this.object3D.clear(); this.subject = null; }
}

// Materials are cached and shared by the kit; only the merged geometry is per-instance.
function disposeTree(o) {
  if (!o) return;
  o.traverse(n => n.geometry?.dispose());
}

export function registerBackdropScenarios(app, world) {
  defineScenario({
    id: 'nebula_back',
    label: 'Nebula backlight',
    ref: '244160_17c',
    setup(a) {
      const q = a.quality;
      q.set('starAz', 4.8);
      q.set('starEl', -2.9);
      q.set('fogDensity', 0.0007);
      q.set('fogTint', 0.78);
      q.set('rimDist', 150);
      q.set('rimFall', 60);
      q.set('rimPower', 1.1);
      q.set('bouncePower', 0.5);
      q.set('envPower', 0.09);
      q.set('envFloor', 0.20);
      q.set('keyPower', 2.2);
      q.set('fillPower', 0.18);
      q.set('windowGlow', 2.6);
      q.set('flareSpikes', 0.18);
      q.set('flareBreak', 0.62);
      q.set('keySwing', 0);
      q.set('keyLift', 0);

      const g = new THREE.Group();
      const hero = shipClass('hauler', { palette: 'ferrous', seed: 3 });
      hero.position.set(16, -17, 6);
      hero.rotation.set(-0.10, 1.42, 0.06);
      g.add(hero);

      // known-small against known-huge, and something to lose in the haze
      const far = [
        ['hauler', 'corvain', -210, 96, -620, 0.9, 0.4],
        ['rig', 'corvain', 130, 150, -1180, 1.1, -0.7],
        ['hauler', 'corvain', -420, -180, -1750, 1.4, 0.25],
        ['escort', 'ferrous', 300, -50, -760, 1.0, 1.1],
        ['escort', 'ferrous', 250, -46, -800, 1.0, 1.1],
      ];
      for (const [cls, pal, x, y, z, s, ry] of far) {
        const o = shipClass(cls, { palette: pal, lod: lodForDistance(Math.abs(z)), seed: x });
        o.position.set(x, y, z);
        o.rotation.set(-0.2, ry, 0.06);
        o.scale.setScalar(s);
        g.add(o);
      }

      world.setSubject(g);
      frameCamera(a, { pos: [0, 4, 95], look: [8, 4, 0], fov: 35 });
    },
  });

  // 3/4 from just above the deck plane, hull running off both edges, star out past the upper-left
  // corner on the hull's far bow quarter.
  //
  // The star's position and the key's angle are the same thing here, and that is deliberate: a
  // key that rakes the *camera-facing* flank has to come from behind the camera, which puts the
  // star out of shot and throws away the backlight. So the star lights the deck and the forward
  // faces, the visible flank is the shadow side, and the value runs blown deck → dark flank →
  // black underside. Swinging the key away from the star (rounds 1–2) only flattened it.
  defineScenario({
    id: 'hero_hull',
    label: 'Hero hull',
    ref: '1840080_01',
    setup(a) {
      const q = a.quality;
      q.set('starAz', -24);
      q.set('starEl', 10);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.0022);
      q.set('fogTint', 0.88);
      q.set('rimDist', 110);
      q.set('rimNear', 40);
      q.set('rimFall', 70);
      q.set('rimPower', 3.0);
      q.set('rimWidth', 3.0);
      q.set('bouncePower', 0.10);
      q.set('envPower', 0.16);
      q.set('envFloor', 0.06);
      q.set('ambient', 0.004);
      q.set('keyPower', 58);
      q.set('fillPower', 4.5);
      q.set('fillAngle', 168);
      q.set('fillLift', -24);
      q.set('windowGlow', 4.4);
      q.set('hullRough', 0.30);
      q.set('hullDetail', 0.34);
      q.set('flareSize', 32);
      q.set('bloomPower', 0.55);
      q.set('bloomSize', 44);

      const g = new THREE.Group();
      const hero = shipClass('hauler', { palette: 'ferrous', seed: 11 });
      hero.rotation.set(0.03, 1.05, 0.05);
      g.add(hero);

      // known-small against known-huge: two 30 m escorts alongside an 84 m hauler
      for (const [x, y, z, ry, sd] of [[-96, 34, -118, 1.5, 6], [-58, 27, -152, 1.9, 9]]) {
        const tug = shipClass('escort', { palette: 'corvain', seed: sd });
        tug.position.set(x, y, z);
        tug.rotation.set(0.06, ry, 0.02);
        g.add(tug);
      }

      for (const [cls, x, y, z, ry] of [
        ['escort', -120, 30, -210, 2.1], ['rig', -30, -40, -430, 1.4],
        ['hauler', -300, 60, -1000, 1.9]]) {
        const o = shipClass(cls, { palette: 'corvain', lod: lodForDistance(Math.abs(z)), seed: x + 40 });
        o.position.set(x, y, z);
        o.rotation.set(0.04, ry, 0.03);
        g.add(o);
      }

      world.setSubject(g);
      frameCamera(a, { pos: [-12, 10, 30], look: [-13, 2.5, -11], fov: 46 });
    },
  });

  // Nothing but surface: panel breaks, wear, a painted company name, the hangar's bounce.
  defineScenario({
    id: 'hull_close',
    label: 'Hull close',
    ref: '244160_11c',
    setup(a) {
      const q = a.quality;
      q.set('starAz', -168);
      q.set('starEl', 26);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.0002);
      q.set('fogTint', 0.5);
      q.set('rimDist', 40);
      q.set('rimNear', 12);
      q.set('rimFall', 18);
      q.set('rimPower', 1.1);
      q.set('rimWidth', 4.0);
      q.set('bouncePower', 1.5);
      q.set('envPower', 0.07);
      q.set('envFloor', 0.14);
      q.set('keyPower', 34);
      q.set('fillPower', 0.45);
      q.set('windowGlow', 3.4);
      q.set('hullRough', 0.34);
      q.set('hullDetail', 0.40);

      const g = new THREE.Group();
      const hero = shipClass('hauler', { palette: 'ferrous', seed: 5 });
      hero.rotation.set(0.01, 0.06, 0.04);
      g.add(hero);
      // a Corvain escort holding station off the flank: the known-small against the known-huge
      const esc = shipClass('escort', { palette: 'corvain', seed: 2 });
      esc.position.set(-34, -9, -26);
      esc.rotation.set(0.05, 0.35, 0.02);
      g.add(esc);
      world.setSubject(g);
      frameCamera(a, { pos: [-20, -0.8, 5], look: [-4.4, -1.6, -7], fov: 30 });
    },
  });
}

// ── stations ─────────────────────────────────────────────────────────────────

export function registerStationScenarios(app, world) {
  // Down the dock spine of Ledger, camera between the two bay columns and above the truss, so
  // the near bays run off the bottom and right edges and the row recedes to the hero blade.
  // The star is high and off the right shoulder: it lights the bay decks and the dock faces the
  // camera can see, and everything else is emissive.
  defineScenario({
    id: 'station_night',
    label: 'Ledger Station — night',
    ref: '8500_06',
    setup(a) {
      const q = a.quality;
      q.set('starAz', 152);
      q.set('starEl', 33);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.00115);
      q.set('fogTint', 0.32);
      q.set('fogDesat', 0.34);
      q.set('fogLevel', 0.17);
      q.set('keyPower', 13);
      q.set('fillPower', 1.5);
      q.set('fillAngle', 150);
      q.set('fillLift', -30);
      q.set('ambient', 0.006);
      q.set('envPower', 0.22);
      q.set('envFloor', 0.05);
      q.set('windowGlow', 6.0);
      q.set('stripPower', 5.2);
      q.set('dockGlow', 3.0);
      q.set('rimPower', 1.4);
      q.set('rimDist', 260);
      q.set('rimNear', 60);
      q.set('rimFall', 180);
      q.set('bouncePower', 0.5);
      q.set('flareSize', 20);
      q.set('bloomPower', 0.30);
      // a night station is mostly emissive texels; dropping the threshold turns the dock lights
      // into the glow that reads as air between the layers
      q.set('bloomThreshold', 0.52);
      q.set('bloomStrength', 0.92);
      q.set('bloomRadius', 1.35);

      const g = new THREE.Group();
      g.add(station('ledger', { seed: 4 }));

      // the far structure layer. Haze between two layers of the same kit is what turns one row
      // of modules into a yard; there is nothing behind the near row to lose contrast against.
      const far = station('drayyard', { palette: 'corvain', seed: 7 });
      far.position.set(1120, -70, 270);
      far.rotation.set(0.04, 1.42, 0.03);
      g.add(far);

      // known-small against known-huge: an 84 m hauler nosed into a 400 m row of bays
      const h = shipClass('hauler', { palette: 'ferrous', seed: 21 });
      h.position.set(216, 4, 142);
      h.rotation.set(0.02, Math.PI, 0.01);
      g.add(h);
      for (const [cls, x, y, z, ry, lod] of [
        ['escort', 96, 30, 128, 2.4, 0], ['rig', 372, -46, 168, 1.1, 0],
        ['hauler', 620, 120, -520, 2.2, 1], ['escort', -180, 70, -260, 0.6, 1],
        ['hauler', 760, 60, 210, 1.7, 0], ['escort', 900, -30, 60, 2.0, 1],
        ['rig', 1020, 130, 340, 0.8, 1], ['hauler', 1480, -20, 420, 2.4, 2]]) {
        const o = shipClass(cls, { palette: 'corvain', lod, seed: x });
        o.position.set(x, y, z);
        o.rotation.set(0.05, ry, 0.02);
        g.add(o);
      }

      // the near structure and the far half of the row are the same value without something
      // hanging between them; fog alone cannot put a finite bank *inside* one object
      g.add(atmosphere({
        seed: 6,
        layers: [
          { count: 4, center: [400, 10, 20], size: [560, 240, 300], scale: [240, 400],
            aspect: 1.7, color: '#6d8aa8', power: 0.55, variant: 3 },
          { count: 5, center: [900, -70, -60], size: [1000, 380, 460], scale: [440, 720],
            aspect: 1.5, color: '#54789c', power: 0.48, variant: 3 },
          { count: 14, center: [440, 20, 30], size: [900, 380, 420], scale: [90, 240],
            color: '#8fa8c2', power: 0.32, variant: 2 },
        ],
      }));

      world.setSubject(g);
      frameCamera(a, { pos: [10, 132, 214], look: [420, -14, -34], fov: 48 });
    },
  });

  // 1840080_04's whole depth trick: a near mass that is pure silhouette, a lit slab of medium,
  // and a far layer that has lost its blacks to it. The star sits behind the far station, so the
  // near pylon is meant to be black — that is the one place in the set a silhouette is the point.
  defineScenario({
    id: 'station_haze',
    label: 'Dray Yard — haze',
    ref: '1840080_04',
    setup(a) {
      const q = a.quality;
      q.set('starAz', 21);
      q.set('starEl', 8);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.00042);
      q.set('fogTint', 0.92);
      q.set('keyPower', 9.0);
      q.set('fillPower', 2.6);
      q.set('fillAngle', 96);
      q.set('fillLift', 12);
      q.set('ambient', 0.006);
      q.set('envPower', 0.20);
      q.set('envFloor', 0.10);
      q.set('windowGlow', 4.6);
      q.set('stripPower', 3.4);
      q.set('dockGlow', 1.8);
      q.set('hazePower', 1.0);
      q.set('rimPower', 2.2);
      q.set('rimDist', 400);
      q.set('rimNear', 80);
      q.set('rimFall', 300);
      // the nebula has to give way here: the haze slab is the depth cue and a blown red sky
      // simply swallows it
      q.set('nebGain', 1.05);
      q.set('nebHalo', 0.02);
      q.set('nebCool', 0.10);
      q.set('flareSize', 24);
      q.set('flarePower', 1.2);
      q.set('bloomPower', 0.42);
      q.set('bloomSize', 40);

      const g = new THREE.Group();

      // the near layer: a 300 m spire off the left edge, running off the top and the bottom
      const near = stationModule('pylon', { palette: 'corvain', seed: 2 });
      near.position.set(-126, -252, -318);
      near.rotation.set(0.05, 0.62, 0.09);
      g.add(near);

      const slab = hazeSlab({ w: 1900, h: 1000, color: '#e0913a', opacity: 0.5, glow: 0.7 });
      slab.position.set(180, -40, -660);
      g.add(slab);

      const far = station('drayyard', { seed: 9 });
      far.position.set(190, -168, -940);
      far.rotation.set(0.05, -0.52, 0.03);
      g.add(far);

      const far2 = station('ledger', { palette: 'corvain', seed: 3 });
      far2.position.set(-820, 190, -2100);
      far2.rotation.set(-0.04, 1.55, 0.02);
      g.add(far2);

      for (const [cls, x, y, z, ry, lod] of [
        ['hauler', -30, -46, -430, 1.3, 0], ['escort', 175, 42, -520, 2.6, 0],
        ['hauler', 400, -104, -900, 2.0, 1], ['rig', -330, 82, -1400, 0.8, 1]]) {
        const o = shipClass(cls, { palette: 'ferrous', lod, seed: x + 3 });
        o.position.set(x, y, z);
        o.rotation.set(0.04, ry, 0.03);
        g.add(o);
      }

      world.setSubject(g);
      frameCamera(a, { pos: [0, 0, 0], look: [72, -26, -400], fov: 45 });
    },
  });

  showroom.register({
    id: 'station_modules', group: 'misc', label: 'Station kit — every module', note: 'bay / refinery / coil / hub / spine / pylon',
    run: ctx => {
      const g = new THREE.Group();
      allStationModules().forEach((id, i) => {
        const m = stationModule(id, { palette: i % 2 ? 'corvain' : 'ferrous', seed: i * 5 });
        m.position.set((i - 2.5) * 210, 0, 0);
        g.add(m);
      });
      world.setSubject(g);
      ctx.app.quality.set('starAz', 132);
      ctx.app.quality.set('starEl', 30);
      ctx.app.quality.set('keyPower', 14);
      ctx.app.quality.set('envPower', 0.4);
      ctx.app.quality.set('fogDensity', 0.0002);
      frameCamera(ctx.app, { pos: [0, 150, 560], look: [0, 20, 40], fov: 60 });
    },
  });
}

// ── belt ─────────────────────────────────────────────────────────────────────

export function registerBeltScenarios(app, world) {
  // 8500_01 has no star in frame and the rocks are lit from the camera's own side, which is only
  // possible with the key behind the camera — the same geometry gotcha as every other scenario,
  // resolved the other way round because here the subject is diffuse rock rather than metal.
  defineScenario({
    id: 'belt_work',
    label: 'Kestrel Belt — mining',
    ref: '8500_01',
    setup(a) {
      const q = a.quality;
      q.set('starAz', 112);
      q.set('starEl', 34);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      // 8500_01's whole depth story: five readable planes, and the far ones have lost ~60 % of
      // their contrast into a warm grey medium. The two palette hues never lerp through a
      // neutral, so the mix gets pulled toward its own luminance before it is dimmed.
      q.set('fogDensity', 0.00175);
      q.set('fogTint', 0.60);
      q.set('fogDesat', 0.85);
      q.set('fogLevel', 0.16);
      q.set('keyPower', 17.0);
      q.set('fillPower', 0.35);
      q.set('fillAngle', 150);
      q.set('fillLift', -26);
      q.set('ambient', 0.022);
      // the analytic env is built out of the nebula's own red mid-tone, and on a diffuse rock
      // that lands as a flat pink wash on every up-facing plane. Metal can carry it; rock cannot.
      q.set('envPower', 0.075);
      q.set('envFloor', 0.06);
      q.set('windowGlow', 5.0);
      q.set('oreGlow', 1.5);
      q.set('beamGlow', 1.15);
      q.set('beamWidth', 0.34);
      q.set('rimPower', 2.4);
      q.set('rimDist', 230);
      q.set('rimNear', 120);
      q.set('rimFall', 170);
      q.set('bouncePower', 1.1);
      // 8500_01's background is not black — it is a flat warm grey dust field the whole belt sits
      // in, and it is what every rock loses its contrast into. Fog cannot supply it: fog only
      // tints geometry, and most of this frame is empty. The deep-space floor does.
      q.set('nebGain', 0.85);
      q.set('nebRays', 0.4);
      q.set('nebHalo', 0.02);
      q.set('nebCoolMass', 0.30);
      q.set('nebCoolGain', 0.08);
      q.set('nebAmbient', 0.014);
      q.set('nebDesat', 0.70);
      q.set('nebScale', 6.5);
      q.set('dustField', 0.036);
      q.set('starBright', 1.4);
      q.set('starOcclude', 18);
      q.set('flareSize', 16);
      q.set('bloomPower', 0);

      const g = new THREE.Group();
      const field = belt('kestrel', { seed: 5, density: 1.45 });
      field.position.set(40, -6, -70);
      g.add(field);
      const spur = belt('drift', { seed: 14, density: 1.1 });
      spur.position.set(360, 90, -420);
      spur.rotation.y = -0.28;
      g.add(spur);

      // the plate reads five depth planes because every one of them is *occupied*; a mid-field
      // with nothing in it is the single biggest thing rounds 1–2 were missing
      for (const [cls, seed, x, y, z, ore] of [
        ['huge', 4, -206, 104, -320, 0],
        ['large', 9, -262, -168, -430, 0.5],
        ['mid', 17, 96, -70, -215, 0],
        ['huge', 21, 176, 52, -330, 1],
        ['mid', 33, 74, 96, -690, 0.6],
        ['large', 41, -34, 128, -430, 0.7],
        ['large', 47, 268, -118, -470, 0],
        ['mid', 53, -104, 22, -300, 0.4],
        ['mid', 61, 210, 130, -520, 0],
        ['large', 67, 60, -150, -560, 0.55],
        ['mid', 73, -240, -40, -540, 0],
        ['huge', 79, 470, 30, -900, 0.5],
      ]) {
        const r = asteroid(cls, { seed, ore });
        r.position.set(x, y, z);
        g.add(r);
      }

      const rig = shipClass('rig', { palette: 'ferrous', seed: 12 });
      rig.position.set(-50, -33, -124);
      rig.rotation.set(0.06, -0.68, 0.12);
      g.add(rig);
      engineTrails(rig, { color: '#ffbe6a', length: 1.0, width: 1.15 });

      const esc = shipClass('escort', { palette: 'corvain', seed: 4 });
      esc.position.set(120, -110, -300);
      esc.rotation.set(0.04, -0.9, 0.03);
      g.add(esc);
      engineTrails(esc, { color: '#8fd6ff', length: 0.9, width: 1 });

      for (const [cls, x, y, z, ry] of [['hauler', -420, 160, -1500, 1.3], ['rig', 380, -180, -1000, 2.1]]) {
        const o = shipClass(cls, { palette: 'corvain', lod: 1, seed: Math.abs(x) });
        o.position.set(x, y, z);
        o.rotation.set(0.04, ry, 0.02);
        g.add(o);
      }

      // both beams land on the same rock and cross the frame on its long diagonal
      rig.updateMatrixWorld(true);
      const em1 = rig.localToWorld(new THREE.Vector3(3.4, 4.2, -20));
      const em2 = rig.localToWorld(new THREE.Vector3(-4.0, -1.6, 14));
      g.add(beams([
        // the endpoints land on the rock's near face, not at its centre: an impact flare buried
        // inside the mesh is depth-tested away and the beam simply stops in mid air
        { from: em1, to: new THREE.Vector3(142, 46, -266) },
        { from: em2, to: new THREE.Vector3(156, 30, -272) },
      ], { color: '#8df0c8', width: 1.1, glow: 1, dust: 1.5, impact: 2.4, ejecta: 20 }));

      g.add(motes({ count: 340, radius: 170, center: [-16, -18, -150], spread: [1.7, 0.7, 1.6], size: 0.4, seed: 9 }));
      g.add(debris({ count: 80, radius: 240, center: [10, -10, -300], spread: [1.5, 0.7, 1.4], size: 1.7, seed: 4 }));

      g.add(atmosphere({
        seed: 4,
        layers: [
          { count: 5, center: [90, -30, -540], size: [800, 240, 200], scale: [460, 700],
            aspect: 1.8, color: '#8e7d6c', power: 0.16, variant: 3 },
          { count: 16, center: [20, -14, -260], size: [820, 360, 420], scale: [150, 340],
            color: '#9b8571', power: 0.16, variant: 2 },
          { count: 8, center: [-10, -34, -110], size: [460, 240, 140], scale: [80, 190],
            color: '#b09a80', power: 0.18, variant: 2 },
        ],
      }));

      world.setSubject(g);
      frameCamera(a, { pos: [0, 0, 0], look: [28, 4, -300], fov: 55 });
    },
  });

  // 8500_02's trick, and the reason this scenario exists: three rocks resolve and forty do not.
  // The fog is tinted to the nebula so the far half of the field dissolves into the gas rather
  // than into a grey — a neutral fog here reads as a rendering bug, not as distance.
  defineScenario({
    id: 'belt_fog',
    label: 'Kestrel Belt — fog',
    ref: '8500_02',
    setup(a) {
      const q = a.quality;
      q.set('starAz', -56);
      q.set('starEl', 10);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.00058);
      q.set('fogTint', 0.74);
      q.set('fogLevel', 0.24);
      q.set('keyPower', 11.0);
      q.set('fillPower', 0.7);
      q.set('fillAngle', 140);
      q.set('fillLift', -18);
      q.set('ambient', 0.010);
      q.set('envPower', 0.34);
      q.set('envFloor', 0.14);
      q.set('windowGlow', 4.0);
      q.set('oreGlow', 2.2);
      q.set('beamGlow', 0.9);
      q.set('beamWidth', 0.7);
      q.set('rimPower', 2.2);
      q.set('rimDist', 150);
      q.set('rimNear', 40);
      q.set('rimFall', 110);
      q.set('nebGain', 2.0);
      q.set('nebRays', 2.4);
      q.set('flareSize', 30);
      q.set('bloomPower', 0.2);

      const g = new THREE.Group();
      const field = belt('kestrel', { seed: 21, density: 1.15 });
      field.position.set(220, -40, -420);
      field.rotation.y = 0.16;
      g.add(field);

      const far = belt('drift', { seed: 8, density: 0.7 });
      far.position.set(-500, 180, -2400);
      g.add(far);

      for (const [cls, seed, x, y, z, ore] of [
        ['huge', 3, 300, 24, -440, 1],
        ['large', 11, 210, -70, -330, 0.6],
        ['large', 27, 396, 104, -600, 0],
      ]) {
        const r = asteroid(cls, { seed, ore });
        r.position.set(x, y, z);
        g.add(r);
      }

      const hauler = shipClass('hauler', { palette: 'ferrous', seed: 6 });
      hauler.position.set(-52, 8, -230);
      hauler.rotation.set(0.02, 1.30, 0.04);
      g.add(hauler);
      engineTrails(hauler, { color: '#ffbe6a', length: 1.2, width: 1.0 });

      hauler.updateMatrixWorld(true);
      const nose = hauler.localToWorld(new THREE.Vector3(0, 1.5, -40));
      g.add(beams([
        // near faces, not centres — a flare inside the mesh is depth-tested away
        { from: nose, to: new THREE.Vector3(270, 22, -396) },
        { from: nose, to: new THREE.Vector3(198, -64, -312) },
        { from: nose, to: new THREE.Vector3(382, 100, -580) },
      ], { color: '#a8f2cc', width: 0.9, glow: 0.9, dust: 0.9, impact: 1.2, ejecta: 12 }));

      g.add(motes({ count: 340, radius: 210, center: [40, -10, -260], spread: [1.6, 0.6, 1.6], size: 0.6, seed: 31 }));

      world.setSubject(g);
      frameCamera(a, { pos: [0, 0, 0], look: [66, 0, -300], fov: 50 });
    },
  });

  showroom.register({
    id: 'belt_kit', group: 'misc', label: 'Belt kit — every size class', note: 'gravel → huge, ore and bare',
    run: ctx => {
      const g = new THREE.Group();
      ['gravel', 'small', 'mid', 'large', 'huge'].forEach((c, i) => {
        for (const ore of [0, 1]) {
          const r = asteroid(c, { seed: i * 7 + ore, ore });
          r.position.set((i - 2) * 170, ore ? -80 : 80, 0);
          g.add(r);
        }
      });
      world.setSubject(g);
      ctx.app.quality.set('starAz', 140);
      ctx.app.quality.set('starEl', 24);
      ctx.app.quality.set('keyPower', 4.4);
      ctx.app.quality.set('envPower', 0.3);
      ctx.app.quality.set('fogDensity', 0.00005);
      frameCamera(ctx.app, { pos: [0, 10, 620], look: [0, 0, 0], fov: 50 });
    },
  });

  showroom.register({
    id: 'belt_field', group: 'misc', label: 'Belt field — bare', note: allBelts().join(' / '),
    run: ctx => {
      const g = new THREE.Group();
      const f = belt('kestrel', { seed: 5 });
      f.position.set(-140, 30, -300);
      g.add(f);
      world.setSubject(g);
      ctx.app.quality.set('starAz', 138);
      ctx.app.quality.set('starEl', 26);
      ctx.app.quality.set('keyPower', 4.4);
      ctx.app.quality.set('fogDensity', 0.00034);
      frameCamera(ctx.app, { pos: [0, 0, 0], look: [28, 4, -300], fov: 55 });
    },
  });

  // the A-B the risk register asks for: same frame, one tap apart
  for (const on of [1, 0]) {
    showroom.register({
      id: `bloom_${on ? 'on' : 'off'}`, group: 'fx', label: `Bloom — ${on ? 'on' : 'off'}`,
      note: 'belt_work, threshold pass A-B',
      run: ctx => {
        getScenario('belt_work')?.setup(ctx.app);
        ctx.app.quality.set('bloom', !!on);
      },
    });
  }
}

// ── planet ───────────────────────────────────────────────────────────────────

export function registerPlanetScenarios(app, world) {
  // 244160_15c is a backlight shot: the star sits *behind* the fleet, the hulls fall to near
  // black on the camera side and hold a thin hot rim, and the medium around the star washes the
  // far ranks pale. Rounds 1–2 put the key upper-left on the camera's own side and every hull
  // came out front-lit into a mid-grey smudge at the same value as the gas behind it.
  //
  // The rim key is a point at rimDist along the star bearing, so rimNear/rimFall have to cover
  // the depth the fleet actually occupies — at the old 90 m the rim was off for every hull here.
  defineScenario({
    id: 'planet_limb',
    label: 'Ossian limb',
    ref: '244160_15c',
    setup(a) {
      const q = a.quality;
      q.set('starAz', -30);
      q.set('starEl', -9);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.0011);
      q.set('fogTint', 0.52);
      q.set('fogDesat', 0.45);
      q.set('fogLevel', 0.60);
      q.set('keyPower', 11.0);
      q.set('fillPower', 0.55);
      q.set('fillAngle', 150);
      q.set('fillLift', -20);
      q.set('ambient', 0.046);
      q.set('envPower', 0.46);
      q.set('envFloor', 0.03);
      q.set('windowGlow', 4.2);
      q.set('planetRim', 0.85);
      q.set('planetScatter', 0.95);
      q.set('planetBands', 1.1);
      q.set('rimPower', 12.0);
      q.set('rimWidth', 3.0);
      q.set('rimDist', 520);
      q.set('rimNear', 340);
      q.set('rimFall', 420);
      q.set('bouncePower', 0.15);
      q.set('flareSize', 30);
      q.set('flarePower', 0.85);
      q.set('flareSpikes', 0.08);
      q.set('flareStreak', 0.10);
      q.set('flareHalo', 2.6);
      q.set('bloomPower', 0.14);
      q.set('bloomSize', 46);
      // the plate's sky is a cool gradient with a pale wash round the star. A saturated warm
      // field at the hulls' own value gives them nothing to be cut out of, which is the whole
      // reason a backlight was worth moving the star for.
      q.set('nebGain', 0.15);
      q.set('nebDensity', 0.45);
      q.set('nebContrast', 2.3);
      q.set('nebBlack', 0.32);
      q.set('nebDesat', 0.76);
      q.set('nebScale', 3.0);
      q.set('nebDetail', 0.20);
      q.set('nebScatter', 0.40);
      q.set('nebGlow', 0.40);
      q.set('nebHalo', 0.07);
      q.set('nebBroad', 9.5);
      q.set('nebFalloff', 1800);
      q.set('nebRays', 0.6);
      q.set('nebCoolMass', 2.0);
      q.set('nebCoolGain', 0.95);
      q.set('nebCool', 0.34);
      q.set('nebCoolNear', 0.16);
      q.set('nebCoolFar', 0.42);
      q.set('nebAmbient', 0.012);
      q.set('nebFloor', 0.16);
      // the wide halo has to stay pale: an orange wash at the hulls' own value is not a backlight
      q.set('starChromaA', 0.16);
      q.set('starChromaB', 0.80);
      q.set('dustField', 0.008);

      const g = new THREE.Group();
      // pushed out and down until the disc is a corner arc rather than half the frame: the plate
      // gives the planet an eighth of the picture and the fleet the rest
      const p = planet('ossian');
      p.position.set(8490, -5210, -8505);
      g.add(p);

      // one hull big enough to survive a thumbnail, a 30 m escort beside it for the known-small,
      // and four ranks running back into the wash
      for (const [cls, x, y, z, ry, sc, lod] of [
        ['hauler', -11, -18, -147, 1.22, 1, 0], ['escort', -74, -54, -186, 0.85, 1, 0],
        ['hauler', 99, 16, -413, 1.34, 1, 0], ['escort', -170, -96, -300, 1.05, 1, 0],
        ['rig', -423, -77, -679, 1.18, 1, 1], ['hauler', -348, 75, -760, 1.45, 1, 1],
        ['escort', -288, 327, -1376, 1.6, 1, 2]]) {
        const o = shipClass(cls, { palette: 'ferrous', lod, seed: Math.abs(x) });
        o.position.set(x, y, z);
        o.rotation.set(0.04, ry, 0.03);
        o.scale.setScalar(sc);
        g.add(o);
      }

      // the medium the star is shining through — it is what turns a backlight into a halo the
      // hulls can be cut out of
      g.add(atmosphere({
        seed: 11,
        layers: [
          { count: 3, center: [-320, -180, -720], size: [900, 400, 300], scale: [620, 900],
            aspect: 1.5, color: '#c98a4e', power: 0.16, variant: 3 },
          { count: 10, center: [-180, -110, -320], size: [820, 420, 420], scale: [90, 260],
            color: '#e2a86e', power: 0.11 },
        ],
      }));

      world.setSubject(g);
      frameCamera(a, { pos: [0, 0, 0], look: [40, -20, -300], fov: 60 });
    },
  });

  // The exposure story: the star just inside the left edge, the limb a diagonal out of the
  // lower-right corner, and hulls crossing between the two as cut-outs.
  defineScenario({
    id: 'star_flare',
    label: 'Tamber over Ossian',
    ref: '244160_02c',
    setup(a) {
      const q = a.quality;
      q.set('starAz', -37);
      q.set('starEl', 3);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.00006);
      q.set('fogTint', 0.85);
      q.set('keyPower', 14);
      q.set('fillPower', 0.8);
      q.set('fillAngle', 160);
      q.set('fillLift', -14);
      q.set('ambient', 0.005);
      q.set('envPower', 0.24);
      q.set('envFloor', 0.12);
      q.set('windowGlow', 4.0);
      q.set('planetRim', 1.5);
      q.set('planetScatter', 1.6);
      q.set('planetBands', 1.15);
      q.set('planetTerm', 0.8);
      q.set('rimPower', 3.2);
      q.set('rimDist', 120);
      q.set('rimNear', 30);
      q.set('rimFall', 90);
      q.set('flareSize', 40);
      q.set('flarePower', 2.2);
      q.set('flareStreak', 0.34);
      q.set('bloomPower', 0.8);
      q.set('bloomSize', 52);

      const g = new THREE.Group();
      const p = planet('ossian', { seed: 2 });
      p.position.set(4200, -5000, -6600);
      g.add(p);

      for (const [cls, x, y, z, ry, lod] of [
        ['hauler', -90, 26, -300, 1.5, 0], ['escort', 120, -34, -260, 1.9, 0],
        ['hauler', 300, 60, -640, 1.2, 0], ['rig', -320, -60, -520, 2.3, 0],
        ['escort', 480, -120, -900, 1.7, 1], ['hauler', -600, 120, -1200, 2.0, 1]]) {
        const o = shipClass(cls, { palette: cls === 'rig' ? 'corvain' : 'ferrous', lod, seed: Math.abs(x) + 7 });
        o.position.set(x, y, z);
        o.rotation.set(0.05, ry, 0.02);
        g.add(o);
      }

      world.setSubject(g);
      frameCamera(a, { pos: [0, 0, 0], look: [30, -14, -300], fov: 55 });
    },
  });
}

// ── the live system ──────────────────────────────────────────────────────────

// Visual positions, not sim positions. content/system.tamber.js's `pos` is the sim's topology;
// Ossian is a 4200 m planet and Dray Yard is meant to read as another company's yard on the far
// side of the Reach, so both are pushed out until the scale reads. Everything else matches.
const REACH = {
  ledger: { pos: [0, 0, 0], dock: [238, 6, 168] },
  kestrel: { pos: [-1400, 60, -900], dock: [-1330, 6, -1460] },
  ossian: { pos: [5600, -1500, -4400], dock: [3963, -1062, -3114], scale: 0.34 },
  drayyard: { pos: [1540, 400, 3520], dock: [1330, 372, 3300] },
};

// the rock the rig cuts. It sits down the camera's own axis past the belt dock so the beams run
// away into the field rather than off the side of the frame.
const ORE_ROCK = [-1520, 46, -1652];

export class ReachScene {
  constructor(app, world, { seed = 4 } = {}) {
    this.app = app;
    this.world = world;
    this.t = 0;
    this.group = new THREE.Group();
    this.group.name = 'reach';
    this.sites = {};

    const g = this.group;
    const site = (id, obj) => {
      obj.userData.siteId = id;
      obj.position.set(...REACH[id].pos);
      if (REACH[id].scale) obj.scale.setScalar(REACH[id].scale);
      g.add(obj);
      this.sites[id] = obj;
      return obj;
    };

    site('ledger', station('ledger', { seed }));
    site('kestrel', belt('kestrel', { seed: seed + 1 }));
    site('drayyard', station('drayyard', { seed: seed + 5 }));
    site('ossian', planet('ossian', { seed }));

    // Tap targets. A place is a region, not a mesh: at Kestrel a finger between two rocks would
    // otherwise hit nothing at all. `material.visible = false` keeps them out of the render list
    // (three gates the push on it) while the raycaster still sees them.
    for (const [id, r] of [['ledger', 620], ['kestrel', 1100], ['drayyard', 620]]) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 6),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      p.position.set(...(REACH[id].dock || REACH[id].pos));
      p.userData.siteId = id;
      p.userData.proxy = true;
      g.add(p);
    }

    // two rocks the rig actually works, so the mining beam has somewhere to land and the belt
    // has a foreground the camera can find
    this.oreRock = asteroid('huge', { seed: 3, ore: 1 });
    this.oreRock.position.set(...ORE_ROCK);
    this.oreRock.scale.setScalar(1.7);
    this.oreRock.userData.siteId = 'kestrel';
    g.add(this.oreRock);
    const rock2 = asteroid('large', { seed: 12, ore: 0.5 });
    rock2.position.set(-1210, -70, -1560);
    rock2.userData.siteId = 'kestrel';
    g.add(rock2);

    // Corvain's hulls: static set dressing, so they merge across ships and cost one bucket set
    const corvain = fleet('echelon', [
      { class: 'hauler', palette: 'corvain' }, { class: 'hauler', palette: 'corvain' },
      { class: 'escort', palette: 'corvain' }, { class: 'rig', palette: 'corvain' },
    ], { spacing: 1.6 });
    corvain.position.set(1180, 300, 2860);
    corvain.rotation.y = -2.3;
    corvain.userData.siteId = 'drayyard';
    g.add(corvain);

    g.add(motes({ count: 220, radius: 520, center: [120, -20, 120], spread: [1.6, 0.6, 1.6], size: 0.7, seed: 5 }));
    g.add(motes({ count: 200, radius: 620, center: [-1360, 20, -1420], spread: [1.6, 0.7, 1.6], size: 0.6, seed: 17 }));

    this.mover = shipMover({
      root: g,
      anchor: (id, a) => this.anchor(id, a),
      build: (id, classId) => this.buildShip(id, classId),
      beamTarget: () => new THREE.Vector3(...ORE_ROCK),
    });

    // the two window materials the stations use: breathed off the knob's own value, so the knob
    // still sets the level and this only rides on top of it
    this.win = ['ferrous', 'corvain'].map(p => getMaterial(p, 'window'));
    this.winBase = this.win.map(m => m.emissiveIntensity);
  }

  // Where a ship sits at a site, and which way it points while it is there.
  anchor(id, a) {
    const r = REACH[id] || REACH.ledger;
    const base = new THREE.Vector3(...(r.dock || r.pos));
    const slot = this.slotOf(a);
    base.x += (slot % 3 - 1) * 58;
    base.y += (slot % 2 ? 1 : -1) * 22;
    base.z += Math.floor(slot / 3) * 62;
    return { pos: base, face: new THREE.Vector3(...r.pos) };
  }

  slotOf(a) {
    if (!a) return 0;
    if (a._slot === undefined) a._slot = this.mover ? this.mover.avatars.size : 0;
    return a._slot;
  }

  buildShip(id, classId) {
    const def = content.all('ship').find(s => s.id === classId);
    const o = shipClass(def?.mesh || 'hauler', { palette: def?.palette || 'ferrous', seed: hashId(id) });
    o.userData.shipId = id;
    // the mover hides these while the hull is docked, so they cost nothing at rest
    engineTrails(o, { color: '#ffbe6a', length: 1.1, width: 1.0 });
    return o;
  }

  // The 3D never reads sim state. This is the whole seam: events in, geometry moves.
  react(events) { this.mover.apply(events); }
  seed(ships) { this.mover.seed(ships); }

  setTickPhase(f) { this.phase = f; }

  update(dt) {
    this.t += dt;
    this.mover.update(this.phase || 0, this.t);
    const q = this.app.quality;
    const lvl = q.get('windowGlow');
    const pulse = 1 + Math.sin(this.t * 0.55) * 0.045 + Math.sin(this.t * 1.9 + 1.4) * 0.018;
    for (const m of this.win) m.emissiveIntensity = lvl * pulse;
  }

  // What a tap on the 3D landed on. The whole hit list, not just the first: a docked hull sits
  // inside its site's tap proxy, so the nearest hit is the region and the ship is behind it.
  siteAt(hit, hits) {
    const tags = (hits && hits.length ? hits : hit ? [hit] : []).map(h => tagOf(h.object)).filter(Boolean);
    return tags.find(t => t.kind === 'ship') || tags[0] || null;
  }

  focusTarget(id) { return this.sites[id] || this.group; }
}

function tagOf(o) {
  while (o) {
    if (o.userData?.shipId) return { kind: 'ship', ship: o.userData.shipId };
    if (o.userData?.siteId) return { kind: 'site', site: o.userData.siteId };
    o = o.parent;
  }
  return null;
}

const hashId = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 997; };

// The §1 cold open, keyed off the belt's real centre so the last frame lands on the rocks.
export function coldOpenKeys() {
  const b = REACH.kestrel.dock;
  return [
    { pos: [-150, 26, 250], look: [130, 4, 60], fov: 44, t: 0 },
    { pos: [110, 20, 150], look: [430, -8, 10], fov: 50, t: 0.26 },
    { pos: [470, 54, -10], look: [700, 10, -230], fov: 52, t: 0.48 },
    { pos: [340, 240, -560], look: [b[0] * 0.4, 60, b[2] * 0.5], fov: 46, t: 0.72 },
    { pos: [b[0] + 430, b[1] + 150, b[2] + 330], look: b, fov: 44, t: 1 },
  ];
}

export function reachLighting(q) {
  q.set('starAz', 148);
  q.set('starEl', 26);
  q.set('keySwing', 0);
  q.set('keyLift', 0);
  q.set('fogDensity', 0.00028);
  q.set('fogTint', 0.4);
  q.set('keyPower', 16);
  q.set('fillPower', 1.2);
  q.set('fillAngle', 150);
  q.set('fillLift', -24);
  q.set('ambient', 0.010);
  q.set('envPower', 0.22);
  q.set('envFloor', 0.10);
  q.set('windowGlow', 4.4);
  q.set('stripPower', 3.4);
  q.set('dockGlow', 2.0);
  q.set('oreGlow', 1.8);
  q.set('rimPower', 2.0);
  q.set('rimDist', 220);
  q.set('rimNear', 50);
  q.set('rimFall', 140);
  q.set('bouncePower', 0.4);
  q.set('planetRim', 1.2);
  q.set('planetScatter', 1.3);
  q.set('flareSize', 24);
  q.set('bloomPower', 0.30);
}

// ── fleet ────────────────────────────────────────────────────────────────────

export function registerFleetScenarios(app, world) {
  // 1840080_02: a long lens, four depth planes of hull, and the star on the centre line so every
  // rank is a darker cut-out than the one behind it.
  defineScenario({
    id: 'fleet_line',
    label: 'Fleet — ranks',
    ref: '1840080_02',
    setup(a) {
      const q = a.quality;
      q.set('starAz', -17);
      q.set('starEl', 9);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.00075);
      q.set('fogTint', 0.9);
      q.set('keyPower', 26);
      q.set('fillPower', 1.6);
      q.set('fillAngle', 158);
      q.set('fillLift', -20);
      q.set('ambient', 0.005);
      q.set('envPower', 0.18);
      q.set('envFloor', 0.08);
      q.set('windowGlow', 4.6);
      q.set('rimPower', 2.8);
      q.set('rimDist', 300);
      q.set('rimNear', 60);
      q.set('rimFall', 220);
      q.set('bouncePower', 0.2);
      q.set('nebGain', 1.25);
      q.set('nebHalo', 0.02);
      q.set('flareSize', 15);
      q.set('flarePower', 1.1);
      q.set('bloomPower', 0.34);

      const g = new THREE.Group();
      const main = fleetSet(9, 'ferrous');
      main.position.set(-70, -26, -40);
      g.add(main);
      // the far rank in the other faction's steel, so the two halves separate on hue as well
      const far = fleetSet(6, 'corvain');
      far.position.set(-500, 180, -1900);
      far.rotation.y = 0.22;
      g.add(far);
      // the near hull, half out of frame: the composition point of 1840080_02
      const near = shipClass('hauler', { palette: 'ferrous', seed: 41 });
      near.position.set(170, -96, -110);
      near.rotation.set(0.03, 0.22, 0.04);
      g.add(near);
      world.setSubject(g);
      frameCamera(a, { pos: [40, 20, 190], look: [-40, -18, -900], fov: 30 });
    },
  });

  // 1840080_05: one 62 m rig against a 480 m truss, spine running off three edges.
  defineScenario({
    id: 'fleet_scale',
    label: 'Fleet — scale',
    ref: '1840080_05',
    setup(a) {
      const q = a.quality;
      q.set('starAz', 128);
      q.set('starEl', 40);
      q.set('keySwing', 0);
      q.set('keyLift', 0);
      q.set('fogDensity', 0.0006);
      q.set('fogTint', 0.5);
      q.set('keyPower', 12);
      q.set('fillPower', 1.6);
      q.set('fillAngle', 150);
      q.set('fillLift', -26);
      q.set('ambient', 0.006);
      q.set('envPower', 0.20);
      q.set('envFloor', 0.06);
      q.set('windowGlow', 5.0);
      q.set('stripPower', 4.0);
      q.set('dockGlow', 2.2);
      q.set('rimPower', 2.0);
      q.set('rimDist', 260);
      q.set('rimNear', 50);
      q.set('rimFall', 180);
      q.set('bouncePower', 0.35);
      q.set('flareSize', 20);
      q.set('bloomPower', 0.34);

      const g = new THREE.Group();
      const st = station('ledger', { seed: 4 });
      st.position.set(60, 120, -260);
      st.rotation.set(0.06, 0.34, 0.02);
      g.add(st);

      const near = fleet('wedge', [
        { class: 'rig', palette: 'ferrous', seed: 7 },
        { class: 'escort', palette: 'ferrous', seed: 12 },
        { class: 'escort', palette: 'ferrous', seed: 19 },
      ], { spacing: 1.3 });
      near.position.set(-40, -46, 60);
      near.rotation.set(0.04, 0.9, 0.03);
      g.add(near);

      const away = fleet('column', ['hauler', 'hauler', 'escort'], { spacing: 1.4 });
      away.position.set(360, -120, -700);
      away.rotation.y = 2.1;
      g.add(away);

      world.setSubject(g);
      frameCamera(a, { pos: [0, -70, 150], look: [70, 60, -300], fov: 34 });
    },
  });

  // §5: the fleet sizes the risk register asks to be able to measure in one tap.
  for (const n of [1, 4, 9, 24]) {
    showroom.register({
      id: `fleet_${n}`, group: 'fleet', label: `Fleet — ${n} hull${n > 1 ? 's' : ''}`,
      note: 'merged across ships, ranks formation',
      run: ctx => {
        getScenario('fleet_line')?.setup(ctx.app);
        const g = new THREE.Group();
        g.add(fleetSet(n, 'ferrous'));
        world.setSubject(g);
        frameCamera(ctx.app, { pos: [-120, 46, 330], look: [30, 2, -260], fov: n > 4 ? 28 : 36 });
      },
    });
  }

  // one entry per formation, each framed off its own bounds — six formations in one frame puts
  // every hull at two pixels
  for (const f of allFormations()) {
    showroom.register({
      id: `fleet_form_${f}`, group: 'fleet', label: `Formation — ${f}`, note: '6 hulls, merged',
      run: ctx => {
        const o = fleet(f, ['hauler', 'escort', 'hauler', 'rig', 'escort', 'hauler'], { spacing: 1 });
        world.setSubject(o);
        ctx.app.quality.set('starAz', 140);
        ctx.app.quality.set('starEl', 30);
        ctx.app.quality.set('keyPower', 18);
        ctx.app.quality.set('envPower', 0.26);
        ctx.app.quality.set('fogDensity', 0.00025);
        const s = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere());
        const d = Math.max(140, s.radius * 2.4);
        frameCamera(ctx.app, {
          pos: [s.center.x + d * 0.5, s.center.y + d * 0.42, s.center.z + d * 0.78],
          look: [s.center.x, s.center.y, s.center.z], fov: 46,
        });
      },
    });
  }
}

// Three classes at four scales, per §4. The set is one merged object however many hulls it holds.
function fleetSet(n, palette) {
  const classes = ['hauler', 'escort', 'rig'];
  const entries = [];
  for (let i = 0; i < n; i++) {
    entries.push({ class: classes[i % 3], palette, seed: i * 29 + 3, scale: [1, 0.82, 1.18, 0.68][i % 4] });
  }
  return fleet('ranks', entries, { spacing: 1.15 });
}
