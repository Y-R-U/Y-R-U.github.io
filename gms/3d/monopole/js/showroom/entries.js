// Hand-written showroom entries — the things that are not scenarios, panels or stories.

import * as THREE from 'three';
import { showroom } from './index.js';
import { frameCamera } from '../scenarios.js';
import { getMaterial, allSurfaces } from '../world/materials.js';
import { allPalettes } from '../world/palettes.js';
import { shipClass, allShipClasses } from '../world/kit/ship.js';
import { station } from '../world/kit/station.js';
import { belt } from '../world/kit/belt.js';
import { camera, moveCamera, flyBy } from '../world/camera.js';

export function registerEntries(app, world, backdrop) {
  registerCameraEntries(app, world);
  showroom.register({
    id: 'mat_lineup', group: 'misc', label: 'Material lineup', note: 'every surface × palette',
    run: ctx => {
      world.setSubject(materialLineup());
      world.subject.position.set(0, 0, 0);
      world.subject.rotation.set(0, 0, 0);
      // the star has to be behind the camera or every sample in the lineup is backlit
      ctx.app.quality.set('starAz', 145);
      ctx.app.quality.set('starEl', 26);
      ctx.app.quality.set('envPower', 0.7);
      frameCamera(ctx.app, { pos: [0, 3.2, 30], look: [0, 0.4, 0], fov: 44 });
    },
  });

  showroom.register({
    id: 'mat_lineup_close', group: 'misc', label: 'Material lineup — close', note: 'hull, panel, trim',
    run: ctx => {
      world.setSubject(materialLineup());
      world.subject.position.set(0, 0, 0);
      world.subject.rotation.set(0, 0, 0);
      ctx.app.quality.set('starAz', 145);
      ctx.app.quality.set('starEl', 26);
      ctx.app.quality.set('envPower', 0.7);
      frameCamera(ctx.app, { pos: [-8.5, 1.6, 9], look: [-8.5, 0.2, 0], fov: 32 });
    },
  });

  showroom.register({
    id: 'backdrop_bare', group: 'fx', label: 'Backdrop — no subject', note: 'fov 60',
    run: ctx => {
      world.setSubject(null);
      frameCamera(ctx.app, { pos: [0, 0, 0], look: [0, 4, -100], fov: 60 });
    },
  });

  showroom.register({
    id: 'backdrop_away', group: 'fx', label: 'Backdrop — anti-star', note: 'the dark side',
    run: ctx => {
      world.setSubject(null);
      frameCamera(ctx.app, { pos: [0, 0, 0], look: [0, 6, 100], fov: 60 });
    },
  });

  showroom.register({
    id: 'star_close', group: 'fx', label: 'Star + flare', note: 'fov 24',
    run: ctx => {
      world.setSubject(null);
      frameCamera(ctx.app, { pos: [0, 0, 0], look: [0, 1.5, -100], fov: 24 });
    },
  });

  showroom.register({
    id: 'silhouette_ab', group: 'fx', label: 'Silhouette — key off', note: 'value separation only',
    run: ctx => {
      world.setSubject(shipClass('hauler', { palette: 'ferrous', seed: 3 }));
      world.subject.position.set(6, -13, 0);
      world.subject.rotation.set(0.03, -0.16, 0.05);
      ctx.app.quality.set('keyPower', 0);
      ctx.app.quality.set('fillPower', 0);
      frameCamera(ctx.app, { pos: [0, 4, 132], look: [-2, 12, 0], fov: 35 });
    },
  });

  for (const [id, label, fov, dist] of [['ship_lineup', 'Ship kit — three hulls', 46, 78],
    ['ship_lineup_close', 'Ship kit — close', 26, 30]]) {
    showroom.register({
      id, group: 'misc', label, note: 'hauler / rig / escort',
      run: ctx => {
        const g = new THREE.Group();
        allShipClasses().forEach((c, i) => {
          const o = shipClass(c, { palette: i === 1 ? 'corvain' : 'ferrous', seed: i * 17 });
          o.position.set((i - 1) * 46, 0, 0);
          o.rotation.y = -1.25;
          g.add(o);
        });
        world.setSubject(g);
        ctx.app.quality.set('starAz', -42);
        ctx.app.quality.set('starEl', 16);
        frameCamera(ctx.app, { pos: [0, 9, dist], look: [0, 0, 0], fov });
      },
    });
  }

  for (const lod of [0, 1, 2]) {
    showroom.register({
      id: `ship_lod${lod}`, group: 'misc', label: `Hauler — LOD ${lod}`, note: `swaps at ${[0, 900, 2600][lod]} m`,
      run: ctx => {
        world.setSubject(shipClass('hauler', { palette: 'ferrous', lod, seed: 3 }));
        world.subject.rotation.y = -1.25;
        ctx.app.quality.set('starAz', -42);
        ctx.app.quality.set('starEl', 16);
        frameCamera(ctx.app, { pos: [0, 8, 62], look: [0, 0, 0], fov: 40 });
      },
    });
  }

  for (const p of ['potato', 'medium', 'ultra']) {
    showroom.register({
      id: `preset_${p}`, group: 'fx', label: `Preset — ${p}`, note: 'same frame, different budget',
      run: ctx => {
        ctx.app.quality.usePreset(p);
        world.setSubject(shipClass('hauler', { palette: 'ferrous', seed: 3 }));
        world.subject.position.set(6, -13, 0);
        world.subject.rotation.set(0.03, -0.16, 0.05);
        frameCamera(ctx.app, { pos: [0, 4, 132], look: [-2, 12, 0], fov: 35 });
      },
    });
  }
}

/* ── camera ──────────────────────────────────────────────────────────────
   The rig is off while a scenario owns the framing (frameCamera stands it down), so every
   entry here turns it back on. §1 beat 1 is `cam_cold_open`. */

const KESTREL = [-1400, 60, -900];

function reachScene(app, world) {
  const q = app.quality;
  q.set('starAz', 148);
  q.set('starEl', 26);
  q.set('keySwing', 0);
  q.set('keyLift', 0);
  q.set('fogDensity', 0.00035);
  q.set('fogTint', 0.35);
  q.set('keyPower', 16);
  q.set('fillPower', 1.2);
  q.set('ambient', 0.01);
  q.set('envPower', 0.22);
  q.set('windowGlow', 4.4);
  q.set('stripPower', 3.4);
  q.set('dockGlow', 2.0);
  q.set('bloomPower', 0.3);

  const g = new THREE.Group();
  g.add(station('ledger', { seed: 4 }));

  const field = belt('kestrel', { seed: 5 });
  field.position.set(...KESTREL);
  g.add(field);

  for (const [cls, pal, x, y, z, ry] of [
    ['hauler', 'ferrous', 216, 4, 142, Math.PI],
    ['escort', 'ferrous', 96, 30, 128, 2.4],
    ['hauler', 'corvain', 900, 140, -640, 2.2],
  ]) {
    const o = shipClass(cls, { palette: pal, seed: x });
    o.position.set(x, y, z);
    o.rotation.set(0.04, ry, 0.02);
    g.add(o);
  }
  world.setSubject(g);

  // the belt's own centre, not its group origin — the fly-by's last key aims here, and a rig
  // sits in it so the final frame has something known-small in it
  const c = new THREE.Box3().setFromObject(field).getBoundingSphere(new THREE.Sphere()).center;
  const rig = shipClass('rig', { palette: 'ferrous', seed: 7 });
  rig.position.set(c.x + 120, c.y - 40, c.z + 210);
  rig.rotation.set(0.05, -1.1, 0.03);
  g.add(rig);

  return { group: g, belt: [c.x, c.y, c.z] };
}

// The §1 cold open, keyed off the belt's measured centre so the last frame lands on the rocks.
function coldOpenKeys(b) {
  return [
    { pos: [-150, 26, 250], look: [130, 4, 60], fov: 44, t: 0 },
    { pos: [110, 20, 150], look: [430, -8, 10], fov: 50, t: 0.26 },
    { pos: [470, 54, -10], look: [700, 10, -230], fov: 52, t: 0.48 },
    { pos: [340, 240, -560], look: [b[0] * 0.4, 60, b[2] * 0.5], fov: 46, t: 0.72 },
    { pos: [b[0] + 700, b[1] + 170, b[2] + 430], look: b, fov: 40, t: 1 },
  ];
}

function registerCameraEntries(app, world) {
  // §1 beat 1: down Ledger Station's spine, then out and round until the belt is the frame.
  showroom.register({
    id: 'cam_cold_open', group: 'camera', label: 'Fly-by — cold open', note: 'spine → orbit on the belt',
    run: ctx => {
      const { belt: b } = reachScene(ctx.app, world);
      camera.enable(true);
      camera.setTouchEnabled(false);
      flyBy(ctx.app, { ms: 11000, keys: coldOpenKeys(b) })
        .then(() => camera.setTouchEnabled(true));
    },
  });

  showroom.register({
    id: 'cam_cold_open_loop', group: 'camera', label: 'Fly-by — cold open, looping', note: 'same keys, loop:true',
    run: ctx => {
      const { belt: b } = reachScene(ctx.app, world);
      camera.enable(true);
      camera.setTouchEnabled(false);
      flyBy(ctx.app, { ms: 11000, loop: true, keys: coldOpenKeys(b) });
    },
  });

  showroom.register({
    id: 'cam_belt_run', group: 'camera', label: 'Fly-by — down the belt', note: 'along the belt axis',
    run: ctx => {
      const [bx, by, bz] = reachScene(ctx.app, world).belt;
      camera.enable(true);
      camera.setTouchEnabled(false);
      flyBy(ctx.app, {
        ms: 9000,
        keys: [
          { pos: [bx + 620, by + 120, bz + 480], look: [bx, by, bz], fov: 50, t: 0 },
          { pos: [bx + 180, by + 40, bz + 120], look: [bx - 300, by, bz - 200], fov: 55, t: 0.5 },
          { pos: [bx - 340, by + 10, bz - 240], look: [bx - 900, by + 30, bz - 560], fov: 50, t: 1 },
        ],
      }).then(() => camera.setTouchEnabled(true));
    },
  });

  showroom.register({
    id: 'cam_focus', group: 'camera', label: 'focus() — wide to hull', note: '700 ms, framed from the bounds',
    run: ctx => {
      reachScene(ctx.app, world);
      camera.enable(true);
      const hull = world.subject.children.find(c => c.position.x === 216);
      moveCamera(ctx.app, { pos: [-900, 420, 1400], look: [0, 0, 0], fov: 46, ms: 0 })
        .then(() => camera.focus(hull, { dist: 120, phi: Math.PI * 0.42, ms: 1400 }));
    },
  });

  showroom.register({
    id: 'cam_orbit', group: 'camera', label: 'Touch orbit — live', note: 'drag orbits, pinch dollies, tap picks',
    run: ctx => {
      reachScene(ctx.app, world);
      camera.enable(true);
      camera.setTouchEnabled(true);
      moveCamera(ctx.app, { pos: [-60, 180, 700], look: [220, 0, -40], fov: 48, ms: 0 });
    },
  });

  showroom.register({
    id: 'cam_dolly', group: 'camera', label: 'moveCamera — dolly sweep', note: 'close → far, one promise chain',
    run: ctx => {
      reachScene(ctx.app, world);
      camera.enable(true);
      camera.setTouchEnabled(false);
      moveCamera(ctx.app, { pos: [180, 30, 220], look: [300, 0, 0], fov: 42, ms: 0 })
        .then(() => moveCamera(ctx.app, { pos: [-500, 320, 1500], look: [200, 0, -100], fov: 42, ms: 3200 }))
        .then(() => camera.setTouchEnabled(true));
    },
  });
}

// One column per surface, one row per palette. Sphere for the shading read, slab for the
// texture read, and the emissive surfaces get a slab that is mostly their own light.
function materialLineup() {
  const g = new THREE.Group();
  const surfaces = allSurfaces();
  const palettes = allPalettes();
  const sphere = new THREE.SphereGeometry(0.85, 32, 20);
  const slab = new THREE.BoxGeometry(1.5, 1.5, 0.35);
  const step = 2.3;
  const x0 = -((surfaces.length - 1) * step) / 2;

  palettes.forEach((p, row) => {
    const y = 2.4 - row * 4.4;
    surfaces.forEach((s, col) => {
      const m = getMaterial(p.id, s);
      const a = new THREE.Mesh(sphere, m);
      a.position.set(x0 + col * step, y, 0);
      const b = new THREE.Mesh(slab, m);
      b.position.set(x0 + col * step, y - 1.9, -0.4);
      g.add(a, b);
    });
  });

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(surfaces.length * step + 3, 12, 0.6),
    getMaterial('corvain', 'hullDark'));
  back.position.set(0, -0.6, -2.2);
  g.add(back);
  return g;
}
