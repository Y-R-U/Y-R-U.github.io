// The live star system's scene graph. Owns the subject a scenario puts in front of the camera
// and keeps the ship kit's rim key on the star's bearing.

import * as THREE from 'three';
import { defineScenario, frameCamera, getScenario } from '../scenarios.js';
import { shipClass, updateShipLighting, lodForDistance } from './kit/ship.js';
import { station, stationModule, allStationModules, hazeSlab, setStationSpill } from './kit/station.js';
import { planet, updatePlanetLighting } from './kit/planet.js';
import { belt, asteroid, allBelts } from './kit/belt.js';
import { beams, engineTrails, motes, debris } from './fx.js';
import { atmosphere } from './atmos.js';
import { fleet, shipMover, allFormations } from './fleet.js';
import { beacons, tenders, beaconRing } from './traffic.js';
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
      // the star sits low so it can stay in frame, but a 10° key only ever rakes the risers and
      // leaves the deck black; lifting the key off the star bearing is what puts the light on the
      // dorsal without moving the flare
      q.set('keyLift', 28);
      q.set('fogDensity', 0.0030);
      q.set('fogTint', 0.88);
      q.set('fogDesat', 0.30);
      q.set('rimDist', 110);
      q.set('rimNear', 40);
      q.set('rimFall', 70);
      q.set('rimPower', 3.0);
      q.set('rimWidth', 3.0);
      q.set('bouncePower', 0.10);
      q.set('envPower', 0.16);
      q.set('envFloor', 0.06);
      q.set('ambient', 0.004);
      q.set('keyPower', 38);
      q.set('fillPower', 3.4);
      // the shadow side is 0.07-albedo metal, so a multiplied fill returns nothing; this is the
      // additive one that carries the plate map and puts plating back into the dark half
      q.set('shadowFill', 0.10);
      q.set('fillAngle', 168);
      q.set('fillLift', -24);
      q.set('windowGlow', 4.4);
      q.set('hullRough', 0.30);
      q.set('hullDetail', 0.34);
      q.set('hullPanel', 0.68);
      q.set('engineWash', 1.5);
      q.set('flareSize', 28);
      q.set('bloomPower', 0.38);
      q.set('bloomSize', 40);
      // The hull has to hold a dark value against the red field, and it could not: at nebGain 1.9
      // the cloud behind the dorsal was hotter than the deck in front of it, and the bloom off it
      // put a white hole through the strongest part of the silhouette. Pulling the gain and the
      // core, then rolling the top stop instead of clipping it, is the whole fix — everything the
      // critic listed on that side of the frame was downstream of this.
      q.set('nebGain', 1.05);
      q.set('nebCore', 0.55);
      q.set('nebGlow', 0.62);
      q.set('nebHalo', 0.02);
      q.set('nebDesat', 0.34);
      q.set('bloomThreshold', 0.86);
      q.set('bloomKnee', 0.16);
      q.set('bloomStrength', 0.44);
      q.set('bloomShoulder', 0.72);

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
        ['hauler', -300, 60, -1000, 1.9], ['escort', -74, -26, -96, 0.9],
        ['rig', -150, -52, -260, 2.4]]) {
        const o = shipClass(cls, { palette: 'corvain', lod: lodForDistance(Math.abs(z)), seed: x + 40 });
        o.position.set(x, y, z);
        o.rotation.set(0.04, ry, 0.03);
        g.add(o);
      }

      // known-huge: a 500 m yard at 700 m, nearly all of it lost to the fog, so the 84 m hauler
      // in front of it has something to be small against
      const yard = station('drayyard', { palette: 'corvain', seed: 3 });
      yard.position.set(-260, -120, -820);
      yard.rotation.set(0.05, 0.75, 0.02);
      g.add(yard);

      g.add(atmosphere({
        seed: 11,
        layers: [
          { count: 4, center: [-40, 10, -260], size: [420, 200, 320], scale: [180, 320],
            aspect: 1.8, color: '#c07a6a', power: 0.42, variant: 3 },
          { count: 10, center: [-30, 4, -120], size: [260, 120, 220], scale: [50, 130],
            color: '#d8a08a', power: 0.24, variant: 2 },
          { count: 5, center: [-58, -22, -70], size: [180, 90, 150], scale: [60, 150],
            aspect: 1.6, color: '#e0a894', power: 0.30, variant: 0 },
        ],
      }));

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
  // Three-quarter broadside on Ledger's dock row, near bays cropped by the left edge and the
  // hero blade sitting on the spine deck at the far end — 8500_06's own arrangement. Four
  // structure layers at 0 / 900 / 1200 / 2700 m so no corner of frame is empty sky.
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
      // one hard key, down onto the deck plane. At the star's own 33° every box top and every box
      // side landed within a few percent of each other; the shot had no form at all.
      q.set('keyLift', 34);
      q.set('fogDensity', 0.00165);
      q.set('fogTint', 0.32);
      q.set('fogDesat', 0.34);
      q.set('fogLevel', 0.17);
      q.set('keyPower', 6.2);
      q.set('fillPower', 1.15);
      q.set('fillAngle', 128);
      q.set('fillLift', -34);
      // the ambient and the env *were* the lighting here, which is why nothing had a dark side
      q.set('ambient', 0.002);
      q.set('envPower', 0.07);
      q.set('envFloor', 0.03);
      // a station's plates are painted, not bare metal: at metalness 0.9 a directional key has no
      // diffuse term to give and every face falls back to the env map at one value
      q.set('stationPaint', 0.86);
      q.set('stationPlane', 0.30);
      q.set('spillPower', 0.16);
      q.set('stationPanel', 0.52);
      q.set('stationDirt', 0.78);
      q.set('exposure', 0.88);
      q.set('nebGain', 0.30);
      q.set('nebDesat', 0.62);
      q.set('nebHalo', 0.05);
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
      q.set('bloomShoulder', 0.80);
      // the top-left quarter was dead black against a plate whose every corner is occupied; a flat
      // dust floor is the cheapest thing that puts a value in it
      q.set('dustField', 0.016);
      q.set('nebAmbient', 0.030);
      // the sharp band runs down the row, so the near bays at the bottom-left corner and the far
      // yard at the top-right both defocus and the middle of the run stays crisp
      // DOF tilt band off: at sheet scale it blurred geometry at the same depth as the sharp
      // foreground, and a blind critic read the whole station as unreadable because of it.
      q.set('dof', false);
      q.set('dofAngle', -45);
      q.set('dofCenter', 0.025);
      q.set('dofSharp', 0.045);
      q.set('dofFalloff', 0.21);
      q.set('dofPower', 0.85);
      q.set('dofNearSide', 0.16);
      q.set('dofBlur', 2.4);

      const g = new THREE.Group();
      g.add(station('ledger', { seed: 4 }));

      // What a lit window rectangle owes its own housing. These are not lights three knows about —
      // the whole station is four merged meshes, so they ride the station shader as an inverse-
      // square uniform array and cost no draw call. Sitting above the deck plane is the point:
      // a source level with the mouth pools on the walls and never on the plates.
      setStationSpill([
        [118, 15, 90, 30, '#ff8a2a', 1.15],
        [214, 14, 94, 28, '#ff9a3c', 1.00],
        [306, 14, 88, 26, '#ff8a2a', 0.90],
        [402, 13, 92, 24, '#ffa14e', 0.78],
        [470, 12, 86, 22, '#ff8a2a', 0.62],
        [150, 12, -86, 26, '#ff8a2a', 0.55],
        // two cool sources against six warm ones: the plate's whole colour story is warm dock
        // light pooling inside a cold structure, and one hue on its own is not a grade
        [270, 34, 26, 70, '#4fc9e8', 0.55],
        [560, 20, 40, 80, '#3fbcdd', 0.42],
      ]);

      // the far structure layer. Haze between two layers of the same kit is what turns one row
      // of modules into a yard; there is nothing behind the near row to lose contrast against.
      const far = station('drayyard', { palette: 'corvain', seed: 7 });
      far.position.set(1160, -40, 230);
      far.rotation.set(0.04, 1.42, 0.03);
      g.add(far);

      // the right half of the frame was empty sky against a plate that fills every pixel. A third
      // layer costs one station's worth of calls and buys the whole side of the shot.
      const right = station('drayyard', { palette: 'ferrous', seed: 12 });
      right.position.set(1250, -330, 300);
      right.rotation.set(-0.05, 2.35, 0.06);
      right.scale.setScalar(1.6);
      g.add(right);

      // a fourth layer, far enough that the fog has most of it: the plate never leaves a corner
      // of frame as empty sky
      const deep = station('ledger', { palette: 'corvain', seed: 41 });
      deep.position.set(2210, 610, -1880);
      deep.rotation.set(0.04, 2.2, 0.02);
      g.add(deep);

      // known-small against known-huge: an 84 m hauler nosed into a 400 m row of bays
      const h = shipClass('hauler', { palette: 'ferrous', seed: 21 });
      h.position.set(216, 4, 142);
      h.rotation.set(0.02, Math.PI, 0.01);
      g.add(h);
      for (const [cls, x, y, z, ry, lod] of [
        ['escort', 96, 30, 128, 2.4, 0], ['rig', 372, -46, 168, 1.1, 0],
        ['hauler', 620, 120, -520, 2.2, 1], ['escort', -180, 70, -260, 0.6, 1],
        ['hauler', 760, 60, 210, 1.7, 0], ['escort', 900, -30, 60, 2.0, 1],
        ['rig', 1020, 130, 340, 0.8, 1], ['hauler', 1480, -20, 420, 2.4, 2],
        ['escort', 520, -120, 60, 1.2, 0], ['hauler', 880, -150, -60, 2.7, 1],
        ['escort', 640, -60, -180, 0.4, 1], ['rig', 1180, -230, 120, 1.9, 2],
        ['hauler', 300, -170, 90, 0.9, 0], ['escort', 180, -140, 20, 1.8, 0],
        ['rig', 700, -220, 160, 2.3, 1], ['escort', 420, -90, 200, 0.2, 0]]) {
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
      frameCamera(a, { pos: [110, 128, 268], look: [356, -24, -26], fov: 42 });
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
      q.set('fogDensity', 0.00150);
      q.set('fogTint', 0.60);
      q.set('fogDesat', 1.0);
      // the fog colour has to sit *under* the background, not over it: at 0.16 a fully fogged
      // rock came back as a pale flat ellipse brighter than the sky behind it, which is a
      // cut-out, not distance. Below the background value the far field dissolves instead.
      q.set('fogLevel', 0.075);
      // one hard key and almost nothing else: the crater relief only exists as a terminator, and
      // a lifted fill fills the bowls back in. Every value in the frame below is deliberate.
      q.set('keyPower', 21.0);
      // the black point now comes from the sky, not from starving the rig — so the shadow side
      // can carry a little structure without a grey wash landing on the background as well
      q.set('fillPower', 0.44);
      q.set('fillAngle', 150);
      q.set('fillLift', -26);
      q.set('ambient', 0.018);
      // the analytic env is built out of the nebula's own red mid-tone, and on a diffuse rock
      // that lands as a flat pink wash on every up-facing plane. Metal can carry it; rock cannot.
      q.set('envPower', 0.10);
      q.set('envFloor', 0.03);
      // 5.0 blew the rig's bridge glazing into one solid white rectangle the size of the
      // deckhouse. A daylit belt does not need lit windows to read.
      q.set('windowGlow', 1.5);
      q.set('oreGlow', 2.6);
      q.set('beamGlow', 1.60);
      q.set('beamWidth', 0.50);
      // the belt's own dust cards are 900 m wide and hang right through the field. They were the
      // other half of the wash: an even additive veil over the vacuum between the depth layers.
      q.set('beltDust', 0.30);
      q.set('beltDustSize', 0.55);
      q.set('rimPower', 2.4);
      q.set('rimDist', 230);
      q.set('rimNear', 120);
      q.set('rimFall', 170);
      q.set('bouncePower', 1.1);
      // The medium is real but it must not be a *fill*. dustField is additive over every pixel,
      // so at 0.038 it lifted the whole frame off black and a critic read it as a missing light
      // rig rather than as dust. At 0.027 the background is a dark neutral the rocks still lose
      // contrast into — the depth cue is the fog *darkening* what is far away, not a wash
      // brightening what is near. Every hue term is pulled down with it: the belt is one grey.
      q.set('nebGain', 0.16);
      q.set('nebRays', 0.10);
      q.set('nebHalo', 0.0);
      q.set('nebBlack', 0.46);
      q.set('nebContrast', 2.4);
      q.set('nebCoolMass', 0.0);
      q.set('nebCoolGain', 0.0);
      q.set('nebCoolNear', 0.55);
      q.set('nebCoolFar', 1.10);
      q.set('nebAmbient', 0.011);
      q.set('nebDesat', 0.96);
      q.set('nebScale', 6.5);
      q.set('dustField', 0.027);
      // 8500_01 holds a dense starfield *through* the dust, and the stars are what stop a dark
      // background reading as an unlit hole. They cost nothing — the Points are already drawn.
      q.set('stars', 1.9);
      q.set('starBright', 4.4);
      q.set('starSize', 1.2);
      q.set('starOcclude', 1.2);
      q.set('flareSize', 16);
      q.set('bloomPower', 0);

      const g = new THREE.Group();
      const field = belt('kestrel', { seed: 5, density: 1.75 });
      field.position.set(40, -6, -70);
      g.add(field);
      const spur = belt('drift', { seed: 14, density: 1.1 });
      spur.position.set(360, 90, -420);
      spur.rotation.y = -0.28;
      g.add(spur);

      // the plate reads five depth planes because every one of them is *occupied*; a mid-field
      // with nothing in it is the single biggest thing rounds 1–2 were missing. Four of these are
      // cut by a frame edge, which is the other half of why the plate reads as a field the camera
      // is inside rather than a diorama it is looking at.
      // Three depth layers, and every one of them carries its own value spread — that is what
      // separates a field from a texture. `v` is the rock's albedo against the kit's base: the
      // near layer runs 0.36 to 1.44 so pale chalk sits beside near-black basalt with vacuum
      // between them, the mid layer narrows, and the far layer is dark and lets fog take it.
      for (const [cls, seed, x, y, z, ore, v] of [
        // near — the value story, highest contrast, four cut by a frame edge
        ['huge', 4, -206, 104, -320, 0, 1.44],
        ['mid', 17, 96, -70, -215, 0.6, 0.52],
        ['mid', 37, 30, -128, -235, 0, 1.30],
        ['mid', 83, -150, 90, -240, 0, 0.38],
        ['mid', 109, 176, -108, -250, 0.4, 1.16],
        ['mid', 97, 236, -130, -290, 0, 0.42],
        ['large', 35, 122, -166, -300, 0.6, 1.34],
        ['mid', 53, -104, 22, -300, 0, 0.36],
        ['large', 31, -70, 176, -330, 0.7, 0.46],
        // mid
        ['mid', 89, 250, -60, -350, 0.5, 1.10],
        ['huge', 12, -310, -196, -400, 0, 1.20],
        ['large', 103, 330, -150, -400, 0.5, 0.44],
        ['large', 91, 130, -190, -420, 0, 0.96],
        ['large', 9, -262, -168, -430, 0.5, 0.40],
        ['large', 41, -34, 128, -430, 0.7, 1.06],
        ['large', 47, 268, -118, -470, 0, 0.50],
        ['huge', 51, 372, 118, -470, 0.7, 0.88],
        // far — dark, low contrast, fog does the rest
        ['mid', 61, 210, 130, -520, 0.6, 0.62],
        ['huge', 63, -330, 210, -520, 0.8, 0.74],
        ['mid', 73, -240, -40, -540, 0, 0.44],
        ['large', 67, 60, -150, -560, 0.55, 0.58],
        ['large', 65, 400, 160, -560, 0.75, 0.68],
        ['large', 77, 300, -30, -640, 0.4, 0.50],
        ['mid', 33, 74, 96, -690, 0.6, 0.60],
        ['huge', 79, 470, 30, -900, 0.5, 0.55],
      ]) {
        const r = asteroid(cls, { seed, ore, value: v });
        r.position.set(x, y, z);
        g.add(r);
      }

      // Two ore rocks carry a real local light in the fissures. An emissive texel lights nothing;
      // this is what puts warm falloff on the grey faces beside the crack, which is the plate's
      // whole "lit from within" read. Two lights only — each one recompiles every material.
      for (const [cls, seed, x, y, z, v, at, power, dist] of [
        ['huge', 21, 300, 78, -330, 1.28, [-0.42, 0.06, 0.9], 8000, 400],
        ['huge', 26, 60, 190, -380, 0.62, [-0.35, -0.2, 1], 6000, 300],
      ]) {
        const r = asteroid(cls, { seed, ore: 1, value: v,
          ember: { power, distance: dist, color: '#ff6a20', at } });
        r.position.set(x, y, z);
        g.add(r);
      }

      // the plate's subject is a barge across the bottom third at a third of the frame width, fully
      // in shot. A 52 m rig tucked into the corner is a detail, not a subject — this is a hauler.
      const rig = shipClass('hauler', { palette: 'ferrous', seed: 12 });
      rig.position.set(-44, -38, -150);
      rig.rotation.set(0.13, -0.86, -0.09);
      g.add(rig);
      engineTrails(rig, { color: '#ffbe6a', length: 1.1, width: 1.2 });

      const mate = shipClass('rig', { palette: 'ferrous', lod: 1, seed: 12 });
      mate.position.set(-176, 34, -300);
      mate.rotation.set(0.08, -0.5, 0.06);
      g.add(mate);
      engineTrails(mate, { color: '#ffbe6a', length: 0.9, width: 0.9 });

      // the scale pair: a 38 m escort parked against a 140 m rock at the same depth, and a tug a
      // third that size further in. Nothing else in the frame tells you how big any of it is.
      const esc = shipClass('escort', { palette: 'corvain', seed: 4 });
      esc.position.set(112, -32, -292);
      esc.rotation.set(0.04, -0.9, 0.03);
      g.add(esc);
      engineTrails(esc, { color: '#8fd6ff', length: 0.9, width: 1 });

      const tug = shipClass('escort', { palette: 'ferrous', lod: 1, seed: 21 });
      tug.position.set(196, 122, -286);
      tug.rotation.set(0.1, -1.9, 0.05);
      tug.scale.setScalar(0.42);
      g.add(tug);
      engineTrails(tug, { color: '#ffbe6a', length: 0.8, width: 0.7 });

      for (const [cls, x, y, z, ry] of [['hauler', -420, 160, -1500, 1.3], ['rig', 380, -180, -1000, 2.1]]) {
        const o = shipClass(cls, { palette: 'corvain', lod: 1, seed: Math.abs(x) });
        o.position.set(x, y, z);
        o.rotation.set(0.04, ry, 0.02);
        g.add(o);
      }

      // two cuts on two different rocks, so the beams cross the frame on a diagonal and each
      // other near the middle. Both emitters sit forward of the deckhouse — an emitter behind the
      // hull's midpoint lays the core straight along the hull and blows the whole ship white.
      rig.updateMatrixWorld(true);
      const em1 = rig.localToWorld(new THREE.Vector3(6.0, 3.4, -30));
      const em2 = rig.localToWorld(new THREE.Vector3(-6.4, 0.6, -22));
      g.add(beams([
        // the endpoints land on the rock's near face, not at its centre: an impact flare buried
        // inside the mesh is depth-tested away and the beam simply stops in mid air
        { from: em1, to: new THREE.Vector3(252, 65, -277) },
        { from: em2, to: new THREE.Vector3(48, 148, -338) },
      ], { color: '#a8f4dd', width: 1.25, glow: 1, dust: 1.1, impact: 1.15, ejecta: 16 }));

      g.add(motes({ count: 340, radius: 170, center: [-16, -18, -150], spread: [1.7, 0.7, 1.6], size: 0.4, seed: 9 }));
      g.add(debris({ count: 80, radius: 240, center: [10, -10, -300], spread: [1.5, 0.7, 1.4], size: 1.7, seed: 4 }));
      // spall: lit chips coming off the cut, not additive. They are what stops the impact reading
      // as a sprite — solid rock catching the same key as the rock it came off.
      g.add(debris({ count: 34, radius: 40, center: [258, 60, -282], spread: [1, 1, 0.7], size: 2.6, seed: 77 }));
      g.add(debris({ count: 22, radius: 34, center: [52, 142, -336], spread: [1, 1, 0.7], size: 2.2, seed: 91 }));

      // Dust only where light is actually scattering: along the two beam corridors and around
      // the two cuts. The old broad banks hung dust in the empty vacuum *between* depth layers,
      // which is exactly the region the plate keeps black — that is what read as milk fog.
      g.add(atmosphere({
        seed: 4,
        layers: [
          { count: 9, center: [40, 20, -230], size: [230, 210, 200], scale: [60, 150],
            color: '#b8ccbe', power: 0.13, variant: 2 },
          { count: 6, center: [232, 62, -286], size: [180, 150, 160], scale: [50, 120],
            color: '#c2b49c', power: 0.16, variant: 0 },
          { count: 5, center: [52, 140, -336], size: [150, 130, 140], scale: [40, 100],
            color: '#c2b49c', power: 0.14, variant: 0 },
          { count: 4, center: [-60, -46, -150], size: [220, 110, 130], scale: [50, 120],
            color: '#a89d90', power: 0.11, variant: 2 },
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
  // 244160_15c is a night sky with a bloom in it, not a sunset. Two hues: a deep navy field with
  // a dense starfield through it, and one pale wash around the star on the right. The hulls are
  // *mid-value with surface on them* — the key is a three-quarter light from the camera's upper
  // left and the star is a composition element, not the key. Round 4's version put the star
  // behind the fleet, which turned every hull into a black cut-out and the sky into a sunset:
  // both wrong, and both for the same reason — the star had been made to do the key's job.
  defineScenario({
    id: 'planet_limb',
    label: 'Ossian limb',
    ref: '244160_15c',
    setup(a) {
      const q = a.quality;
      q.set('starAz', 30);
      q.set('starEl', -3);
      // The star is in frame at −Z, so *any* swing under 60° is still a backlight — the key only
      // starts front-lighting once keyDir.z goes positive, which for a star at az 30 needs a
      // swing past 120°. 140° puts it over the camera's right shoulder, on the same side of frame
      // as the star, which is where 244160_15c's key plainly is.
      q.set('keySwing', 140);
      q.set('keyLift', 24);
      q.set('fogDensity', 0.00085);
      q.set('fogTint', 0.94);
      q.set('fogDesat', 0.30);
      q.set('fogLevel', 0.55);
      q.set('keyPower', 28.0);
      q.set('fillPower', 1.55);
      q.set('fillAngle', 118);
      q.set('fillLift', -34);
      q.set('ambient', 0.012);
      // the analytic env ramps cool→mid→hot with distance from the star, so a wide falloff makes
      // the whole sphere orange and every hull in frame with it. 5.5 keeps the warm inside 25°.
      q.set('envPower', 0.90);
      q.set('envFalloff', 5.5);
      q.set('envFloor', 0.10);
      q.set('windowGlow', 3.0);
      q.set('planetRim', 0.9);
      q.set('planetScatter', 0.55);
      q.set('planetBands', 0.55);
      q.set('planetTerm', 0.6);
      q.set('planetTint', 0.72);
      q.set('planetHalo', 7.5);
      // the fleet spans 150–1400 m, so a rim key at the default 90 m is off for every hull in it.
      // rimWidth is the *exponent*: at 2.6 with rimNear 340 the whole near half of the fleet was
      // inside one broad orange wash and every hull read as an orange smear, which is exactly the
      // mistake gotcha 34 records on the planet limb.
      q.set('rimPower', 1.8);
      q.set('rimWidth', 5.5);
      q.set('rimDist', 520);
      q.set('rimNear', 340);
      q.set('rimFall', 420);
      q.set('bouncePower', 0.15);
      q.set('flareSize', 26);
      q.set('flarePower', 0.55);
      q.set('flareSpikes', 0.0);
      q.set('flareStreak', 0.04);
      q.set('flareHalo', 4.6);
      q.set('flareBreak', 0.16);
      q.set('plumePower', 0.30);
      q.set('engineGlow', 0.7);
      q.set('flareTint', 1.0);
      // the pale wash round the star is this quad, not the gas. starChromaB tops out at 0.8 rad,
      // so the *baked* halo is already orange by 30° off the star and can never supply it — the
      // bake's halo is off here and the tinted glow quad does the whole job.
      q.set('bloomPower', 0.85);
      q.set('bloomSize', 78);
      q.set('bloomFalloff', 2.0);
      q.set('bloomCore', 0);
      // on a 78° quad the anamorphic streak is a bright line clean across the frame
      q.set('bloomStreak', 0);
      // two hues, and the warm one is switched almost all the way off. Everything that used to be
      // orange here — gas, halo, flare, planet limb — is on a knob now and every one is cooled.
      q.set('nebGain', 0.012);
      q.set('nebHue', 0.30);
      q.set('nebDensity', 0.30);
      q.set('nebContrast', 2.6);
      q.set('nebBlack', 0.36);
      q.set('nebDesat', 0.80);
      q.set('nebScale', 2.4);
      q.set('nebScatter', 0.04);
      q.set('nebGlow', 0.06);
      q.set('nebHalo', 0.02);
      q.set('nebBroad', 9.0);
      q.set('nebFalloff', 2400);
      q.set('nebCore', 0.20);
      q.set('nebRays', 0.0);
      // the blue is the whole sky here, not a patch at the edges: the plate's field is a lit navy
      // (mean channel 46/52/72), not black. Cool mass wide, cool gain high, warm gain near zero.
      q.set('nebCoolMass', 2.0);
      q.set('nebCoolGain', 0.34);
      q.set('nebCool', 0.30);
      q.set('nebCoolNear', 0.02);
      q.set('nebCoolFar', 1.20);
      q.set('coolField', 0.17);
      q.set('nebAmbient', 0.002);
      q.set('nebFloor', 1.60);
      q.set('starChromaA', 0.22);
      q.set('starChromaB', 0.80);
      q.set('dustField', 0.004);
      // the plate's black holds a full magnitude-sorted starfield right down to the halo's edge
      q.set('stars', 1.0);
      q.set('starBright', 4.2);
      q.set('starSize', 1.5);
      q.set('starOcclude', 2.0);

      const g = new THREE.Group();
      // an eighth of the picture at most, in the corner opposite the star, and it must be a
      // *lit* sliver — a black disc with a ring round it is not a limb, it is a hole
      const p = planet('ossian');
      p.position.set(-9080, -8950, -9660);
      g.add(p);

      // The scale ladder, and the reason round 4 failed it: sixteen hulls all broadside at 1.3 rad
      // are sixteen horizontal slivers at the same apparent thickness, and no two of them tell you
      // anything about each other's size. Three-quarter rear yaws (0.6–0.95) with real pitch show
      // a hull's mass, and the near ones are close enough to *be* mass.
      for (const [cls, x, y, z, rx, ry, rz, lod] of [
        ['hauler', 30, -12, -122, 0.20, 0.78, 0.24, 0],
        ['hauler', -108, 66, -205, 0.14, 0.92, -0.18, 0],
        ['rig', -158, -76, -224, 0.26, 0.64, 0.30, 0],
        ['escort', 128, 52, -268, 0.18, 0.84, 0.12, 0],
        ['escort', -42, -104, -300, 0.22, 0.70, -0.14, 0],
        ['rig', -190, 10, -330, 0.20, 0.80, 0.18, 1],
        ['escort', -300, 96, -400, 0.16, 0.66, -0.10, 2],
        ['escort', -100, -190, -470, 0.18, 0.92, 0.08, 2],
        ['rig', 300, -38, -430, 0.16, 0.88, 0.10, 2],
        ['hauler', -370, 148, -560, 0.12, 0.74, -0.08, 2],
        ['escort', 190, 176, -520, 0.20, 0.96, 0.06, 2],
        ['escort', -520, -150, -700, 0.18, 0.62, 0.14, 2],
        ['hauler', 470, -140, -760, 0.10, 0.82, 0.04, 2],
        ['rig', -260, 268, -900, 0.14, 0.90, -0.06, 2],
        ['escort', 640, 120, -980, 0.16, 0.76, 0.08, 2],
        ['hauler', 860, 236, -1420, 0.08, 0.80, 0.02, 2],
      ]) {
        const o = shipClass(cls, { palette: 'ferrous', lod, seed: Math.abs(x) + 3 });
        o.position.set(x, y, z);
        o.rotation.set(rx, ry, rz);
        g.add(o);
        // engineTrails is two draw calls a ship — a merged ribbon and a Points — which makes it the
        // biggest lever on this scenario's call count, bigger than the hulls
        if (z > -320) engineTrails(o, { color: '#ffe7cf', length: 0.26, width: 0.5, power: 0.28 });
      }

      // the flight of escorts running in from the star side, cut out against the halo. Their
      // trails are the only cool light in the frame and they are what the eye reads as "far".
      for (const [x, y, z, ry] of [[780, 30, -760, 0.72], [880, 92, -860, 0.72],
        [960, -30, -930, 0.72], [1070, 54, -1040, 0.72]]) {
        const o = shipClass('escort', { palette: 'corvain', lod: 2, seed: x });
        o.position.set(x, y, z);
        o.rotation.set(0.1, ry, 0.02);
        g.add(o);
        engineTrails(o, { color: '#bfe8ff', length: 2.6, width: 0.5, power: 1.4 });
      }

      // dust between the ranks. Without it the gaps between hulls are the same value as the gaps
      // at the frame edge and the fleet has no depth at all.
      g.add(atmosphere({
        seed: 11,
        layers: [
          { count: 4, center: [520, -60, -900], size: [1400, 700, 500], scale: [700, 1100],
            aspect: 1.6, color: '#b9c6dc', power: 0.13, variant: 3 },
          { count: 12, center: [60, -60, -420], size: [1200, 600, 600], scale: [140, 380],
            color: '#8fa3c2', power: 0.085 },
          { count: 8, center: [-260, 40, -240], size: [700, 380, 220], scale: [90, 220],
            color: '#9db0cc', power: 0.075, variant: 2 },
        ],
      }));

      world.setSubject(g);
      frameCamera(a, { pos: [0, 0, 0], look: [40, -12, -300], fov: 58 });
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
    Object.assign(this.oreRock.userData, {
      siteId: 'kestrel',
      rock: { field: 'kestrel', index: 1, ore: 1, radius: (this.oreRock.userData.radius || 90) * 1.7, worked: true },
    });
    g.add(this.oreRock);
    const rock2 = asteroid('large', { seed: 12, ore: 0.5 });
    rock2.position.set(-1210, -70, -1560);
    Object.assign(rock2.userData, {
      siteId: 'kestrel',
      rock: { field: 'kestrel', index: 2, ore: 0.5, radius: rock2.userData.radius || 60 },
    });
    g.add(rock2);

    // Corvain's hulls: static set dressing, so they merge across ships and cost one bucket set
    const corvain = fleet('echelon', [
      { class: 'hauler', palette: 'corvain' }, { class: 'hauler', palette: 'corvain' },
      { class: 'escort', palette: 'corvain' }, { class: 'rig', palette: 'corvain' },
    ], { spacing: 1.6 });
    corvain.position.set(1180, 300, 2860);
    corvain.rotation.y = -2.3;
    Object.assign(corvain.userData, { siteId: 'drayyard', rivalId: 'echelon' });
    g.add(corvain);

    g.add(motes({ count: 220, radius: 520, center: [120, -20, 120], spread: [1.6, 0.6, 1.6], size: 0.7, seed: 5 }));
    g.add(motes({ count: 200, radius: 620, center: [-1360, 20, -1420], spread: [1.6, 0.7, 1.6], size: 0.6, seed: 17 }));

    // Chips off the working face, drifting. They tumble with everything else in `update`, which
    // is what stops the belt reading as a photograph of a belt.
    this.chips = debris({ count: 40, radius: 190, center: ORE_ROCK, spread: [1.4, 0.8, 1.4], size: 2.6, seed: 21 });
    g.add(this.chips);

    this.beacons = beacons(reachBeacons());
    if (this.beacons) g.add(this.beacons);
    this.tenders = tenders(reachLoops());
    if (this.tenders) g.add(this.tenders);

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
    engineTrails(o, { color: '#ffbe6a', length: 1.1, width: 1.0 });
    // Navigation lights, in hull space so they ride the ship. Red to port, green to starboard,
    // a white anti-collision strobe on the spine and a steady stern lamp — the real convention,
    // and one Points call per hull. This is most of what stops a docked ship reading as scenery.
    const L = o.userData.length || 60;
    const p = hashId(id) / 997;
    const nav = beacons([
      { pos: [-L * 0.19, L * 0.02, L * 0.06], color: '#ff2f2f', size: L * 0.025, rate: 0.55, phase: p, steady: true, gain: 1.4 },
      { pos: [L * 0.19, L * 0.02, L * 0.06], color: '#39ff88', size: L * 0.025, rate: 0.55, phase: p, steady: true, gain: 1.4 },
      { pos: [0, L * 0.14, -L * 0.10], color: '#ffffff', size: L * 0.035, rate: 0.62, phase: p, gain: 2.0 },
      { pos: [0, L * 0.05, L * 0.34], color: '#ffd08a', size: L * 0.020, rate: 0.31, phase: p + 0.4, steady: true },
      // a lamp this close to the camera would otherwise cover a quarter of the screen
    ], { seed: hashId(id), max: 22 });
    if (nav) { o.add(nav); o.userData.nav = nav; }
    return o;
  }

  // The 3D never reads sim state. This is the whole seam: events in, geometry moves.
  react(events) { this.mover.apply(events); }
  seed(ships) { this.mover.seed(ships); }

  setTickPhase(f) { this.phase = f; }

  // Pause stops the company, not the system. `rate` is the clock's own multiplier so a ×4 run
  // reads as a busier system, and 0 is never passed — a paused Reach still ticks over.
  setAmbientRate(r) { this.rate = Math.max(0.35, r || 1); }

  update(dt) {
    this.t += dt * (this.rate || 1);
    const t = this.t;
    this.mover.update(this.phase || 0, t);
    this.beacons?.update(t);
    this.tenders?.update(t);
    // hung off the avatar rather than a list of our own, so a scrapped hull takes its lights with it
    for (const a of this.mover.avatars.values()) a.obj.userData.nav?.update(t);
    this.oreRock.rotation.set(t * 0.013, t * 0.021, t * 0.008);
    this.chips.rotation.y = t * 0.006;
    this.chips.rotation.x = Math.sin(t * 0.05) * 0.06;
    const q = this.app.quality;
    const lvl = q.get('windowGlow');
    const pulse = 1 + Math.sin(t * 0.55) * 0.045 + Math.sin(t * 1.9 + 1.4) * 0.018;
    for (const m of this.win) m.emissiveIntensity = lvl * pulse;
  }

  // What a tap on the 3D landed on. The whole hit list, not just the first: a docked hull sits
  // inside its site's tap proxy, so the nearest hit is the region and the ship is behind it.
  //
  // Order of preference is specific-before-general — a hull, then a named rock, then the region
  // it is standing in — because the region proxies are 600 m spheres and would otherwise swallow
  // everything inside them.
  siteAt(hit, hits) {
    const list = hits && hits.length ? hits : hit ? [hit] : [];
    const tags = list.map(h => tagOf(h.object, h)).filter(Boolean);
    return tags.find(t => t.kind === 'ship') || tags.find(t => t.kind === 'rock')
      || tags.find(t => t.kind === 'rival') || tags[0] || null;
  }

  focusTarget(id) { return this.sites[id] || this.group; }
}

// Ledger's spine runs along X and its bays hang at z = ±80, so the truss lamps are a row down X
// and the yard markers ring the dock. Dray Yard gets cool ones — it is Corvain's, and the colour
// is how you tell whose lights you are looking at from a long way off.
function reachBeacons() {
  const out = [];
  const L = REACH.ledger.pos, K = REACH.kestrel.dock, D = REACH.drayyard.pos;
  for (let i = 0; i < 11; i++) {
    const x = L[0] - 240 + i * 48;
    out.push({ pos: [x, L[1] + 34, L[2] - 82], color: '#ff5a3c', size: 7, rate: 0.34, phase: i / 11 });
    out.push({ pos: [x, L[1] - 26, L[2] + 82], color: '#ffd08a', size: 5, gain: 0.7, rate: 0.34, phase: (i + 5.5) / 11, steady: true });
  }
  out.push(...beaconRing(REACH.ledger.dock, 96, 6, { color: '#8df0c8', size: 9, rate: 0.5 }));
  out.push(...beaconRing(K, 210, 5, { color: '#ff8a3c', size: 12, rate: 0.22 }));
  out.push({ pos: [ORE_ROCK[0], ORE_ROCK[1] + 120, ORE_ROCK[2]], color: '#ffffff', size: 14, rate: 0.7 });
  for (let i = 0; i < 7; i++) {
    out.push({ pos: [D[0] - 180 + i * 62, D[1] + 26, D[2] - 40], color: '#7ec8ff', size: 8, rate: 0.29, phase: i / 7 });
  }
  return out;
}

// Closed loops the tenders run forever. They exist to put something small and moving next to
// something huge and still — the cheapest scale cue in the file, and it never stops.
function reachLoops() {
  const L = REACH.ledger.pos, D = REACH.drayyard.pos, K = REACH.kestrel.dock;
  return [
    { count: 3, speed: 0.017, size: 5.5,
      points: [[L[0] - 300, 60, L[2] - 150], [L[0] + 260, 20, L[2] - 210], [L[0] + 380, -40, L[2] + 190], [L[0] - 220, 10, L[2] + 240]] },
    { count: 2, speed: 0.010, size: 6.5,
      points: [[L[0] + 240, 6, L[2] + 168], [620, 90, 900], [1180, 260, 2100], [D[0] - 210, D[1] - 28, D[2] - 220], [700, 180, 1400], [280, 40, 520]] },
    { count: 2, speed: 0.021, size: 4.5,
      points: [[K[0] - 240, K[1] + 90, K[2] + 60], [ORE_ROCK[0] + 130, ORE_ROCK[1] + 40, ORE_ROCK[2] - 120], [K[0] + 260, K[1] - 60, K[2] - 200], [K[0] + 40, K[1] + 120, K[2] + 260]] },
    { count: 2, speed: 0.014, size: 5,
      points: [[D[0] - 320, D[1] + 40, D[2] - 260], [D[0] + 240, D[1] - 30, D[2] - 180], [D[0] + 180, D[1] + 60, D[2] + 240], [D[0] - 260, D[1] - 10, D[2] + 200]] },
  ];
}

// `hit` carries what the raycaster knows that the object does not: where the finger landed, and
// which instance of a belt field it landed on. That instanceId is what lets every rock in a
// 400-rock InstancedMesh have its own name for nothing.
function tagOf(o, hit) {
  const at = hit?.point ? hit.point.clone() : null;
  let node = o;
  while (node) {
    const u = node.userData || {};
    if (u.shipId) return { kind: 'ship', ship: u.shipId, object: node, at };
    if (u.rock) return { kind: 'rock', rock: u.rock, object: node, at, radius: u.rock.radius };
    if (u.rivalId) return { kind: 'rival', rival: u.rivalId, site: u.siteId, object: node, at };
    if (u.beltId && hit && hit.instanceId !== undefined && hit.instanceId !== null) {
      // the bucket index has to come from the child order, not a uuid — a designation that
      // changed between sessions would not be a designation
      const bucket = Math.max(0, node.children.indexOf(hit.object));
      return {
        kind: 'rock', object: null, at,
        rock: { field: u.beltId, index: hit.instanceId * 13 + bucket },
        radius: instanceRadius(hit.object, hit.instanceId),
      };
    }
    if (u.siteId) return { kind: 'site', site: u.siteId, object: node, at };
    node = node.parent;
  }
  return null;
}

// A field rock's real size, so the readout is not the same number for every rock in the belt.
const _m4 = new THREE.Matrix4();
const _sc = new THREE.Vector3();
function instanceRadius(mesh, i) {
  mesh.getMatrixAt(i, _m4);
  _m4.decompose(new THREE.Vector3(), new THREE.Quaternion(), _sc);
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  // the belt kit's own `radius` is the largest scale axis, so match it rather than averaging
  return Math.max(1, mesh.geometry.boundingSphere.radius * Math.max(_sc.x, _sc.y, _sc.z));
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

// One framing per intro beat, in the order content/intro.js lists them. Index 0 is the title
// hold — the camera sits on it, nothing moving but the world's own ambience — and every later
// entry is where the card of the same index takes the camera. They are absolute framings rather
// than a spline so paging backwards is the same operation as paging forwards.
export function introShots() {
  const b = REACH.kestrel.dock;
  const d = REACH.drayyard.pos;
  return [
    { pos: [-150, 26, 250], look: [130, 4, 60], fov: 44, ms: 0 },
    { pos: [96, 22, 178], look: [400, -6, 22], fov: 48, ms: 4200 },
    { pos: [d[0] - 980, d[1] - 90, d[2] - 1420], look: [d[0] - 260, d[1] - 60, d[2] - 640], fov: 40, ms: 5200 },
    { pos: [520, 1480, 1980], look: [260, 40, 460], fov: 56, ms: 5200 },
    { pos: [b[0] + 430, b[1] + 150, b[2] + 330], look: b, fov: 44, ms: 5600 },
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
