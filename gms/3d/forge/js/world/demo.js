// The world: terrain, foliage, whichever scene document is loaded on top of them, and the five
// named scenarios the critic renders. The buildings themselves are data — see js/editor/scene.js.

import * as THREE from 'three';
import { Terrain, CAMERAS, setCameras, heightAt, TOWNS } from './terrain.js';
import { Scatter } from './scatter.js';
import { Stream } from './stream.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { SceneBuilder, shadowOnly } from '../editor/build.js';
import { demoScene, paveLight } from '../editor/demoScene.js';
import { loadScene } from '../editor/store.js';

// x and z are offsets from the town the shot belongs to and **y is height above the ground at
// that point**, not an absolute. Both matter: the towns moved 520 m apart and then 60–80 m in z,
// and Blackstone's pad is 48 m up. Absolute y was why four of the five framings came out either
// buried in the grass or staring at the floor — `frameCamera` clamps the eye to ground + 2.2,
// and every authored y was below the new ground.
const SHOTS = [
  { id: 'wall_day', label: 'Wall + tower, midday', zone: 'light', time: 10.5,
    at: 0, pos: [-48, 9, -62], look: [14, 5, -31], keep: 13, ref: '2198150_03' },
  { id: 'street_dusk', label: 'Street at dusk', zone: 'neutral', time: 17.6,
    at: 1, pos: [0, 3.2, 44], look: [0, 4, -26], keep: 10, ref: '2198150_05' },
  { id: 'gate_night', label: 'Gatehouse at night', zone: 'dark', time: 21.5,
    at: 2, pos: [-18, 5.5, -8], look: [0, 9, -34], keep: 11, ref: '2198150_08' },
  { id: 'town_night', label: 'District at night', zone: 'neutral', time: 21,
    at: 1, pos: [40, 26, 46], look: [0, 4, -16], keep: 10, ref: '2198150_04' },
  // Millbridge, from the south bank looking up the Vail into Longacre. The old framing looked at
  // z = +160, which was the creek's line in the 290 m world and is 70 m of dry water meadow now.
  { id: 'creek_day', label: 'Creek through the zones', zone: 'neutral', time: 8.5,
    at: 1, pos: [-4, 9, 112], look: [-40, 1, 78], keep: 10, ref: '2198150_05' },
].map(s => ({
  ...s,
  pos: [s.pos[0] + TOWNS[s.at].cx, s.pos[1], s.pos[2] + TOWNS[s.at].cz],
  look: [s.look[0] + TOWNS[s.at].cx, s.look[1], s.look[2] + TOWNS[s.at].cz],
}));


export class Demo {
  constructor() {
    this.object3D = new THREE.Group();
    setCameras(SHOTS);
    this.terrain = new Terrain();
    this.scatter = new Scatter(this.terrain);
    this.doc = startScene(this.terrain, r => { this.loadReport = r; });
    this.builder = new SceneBuilder(this.terrain);
    this.object3D.add(this.builder.object3D);
    this.builder.buildAll(this.doc, true);
    this.terrain.addRoads();
    for (const [x, z] of CAMERAS) this.terrain.mark(x, z, 3.5);
    this.terrain.build();
    this.scatter.build();
    this.terrain.finish();
    this.object3D.add(this.terrain.object3D, this.scatter.object3D);
    this.stream = new Stream(this);
    this.registerScenarios();
  }

  registerKnobs(q, app) {
    this.terrain.registerKnobs(q);
    this.scatter.registerKnobs(q);
    this.stream.registerKnobs(q);
    if (app) {
      app.stats.blocks = () => this.stream.counts;
      app.shadowOnly.push(shadowOnly);
    }
  }

  // For quality.onRebuild. Only the terrain's own meshes are rebuilt: the occupancy grid, the
  // footprints and the scatter come from the scene document and do not change with a world knob.
  rebuild() {
    this.terrain.teardown();
    this.terrain.build();
    this.terrain.finish();
    this.stream.reset();
  }

  update(dt, app) { this.stream.update(dt, app); }

  registerScenarios() {
    for (const s of SHOTS.concat(devShots(this.doc))) {
      defineScenario({
        ...s,
        setup: app => {
          const g = this.terrain.surfaceY.bind(this.terrain);
          const y = g(s.pos[0], s.pos[2]) + s.pos[1];
          const look = [s.look[0], g(s.look[0], s.look[2]) + s.look[1], s.look[2]];
          frameCamera(app, { pos: [s.pos[0], Math.max(y, g(s.pos[0], s.pos[2]) + 2.2), s.pos[2]], look, fov: s.fov });
          app.quality.set('time', s.time);
        },
      });
    }
  }
}

// A8's framings, one per named place in Whitewall. Absolute world coordinates, because these are
// aimed at areas data/areas.json fixes rather than at a town centre; `y` is still height above the
// ground. Off unless ?dev=1, so they cannot become scenario keep-outs and cannot move the five
// framings the critic scores.
const WHITEWALL_SHOTS = [
  { id: 'wwa_air', label: 'Whitewall from the north-west', time: 10, fov: 60,
    pos: [-660, 74, -216], look: [-508, -8, -58] },
  { id: 'wwa_yard', label: 'Sanctum Yard and the Lantern Spire', time: 11,
    pos: [-556, 9, -92], look: [-518, 14, -58] },
  { id: 'wwa_gate', label: 'The north gate and the cells', time: 9,
    pos: [-520, 5, -178], look: [-524, 6, -128] },
  { id: 'wwa_sanctum', label: 'The Sanctum from the Yard', time: 12,
    pos: [-520, 5, -45], look: [-520, 5, -18] },
  { id: 'wwa_granary', label: 'The granary door, where the game opens', time: 4.2,
    pos: [-547, 3.4, -6], look: [-548, 1.6, -25] },
  { id: 'wwa_cloister', label: 'The Cloister garth', time: 10,
    pos: [-556, 9, -111], look: [-590, 4, -111] },
  { id: 'wwa_almonry', label: 'The Almonry and Ivo\'s room', time: 15,
    pos: [-457, 5, -101], look: [-459, 3, -120] },
  { id: 'wwa_works', label: 'Pell\'s works yard', time: 15,
    pos: [-556, 7, -44], look: [-592, 3, -44] },
  { id: 'wwa_steps', label: 'The fish steps on the Vail', time: 8,
    pos: [-566, 20, 66], look: [-512, -2, 124] },
];

// Working framings for the door kit, off unless ?dev=1 — --all lists whatever is registered,
// and the critic scores exactly the five above. Derived from the scene rather than hardcoded so
// they follow the layout.
function devShots(doc) {
  if (!new URLSearchParams(location.search).has('dev')) return [];
  const out = WHITEWALL_SHOTS.map(s => ({ zone: 'light', ...s }));
  for (const [di, d] of doc.districts.entries()) {
    const h = doc.objects.find(o => o.dist === di && o.type === 'house');
    if (!h) continue;
    const c = Math.cos(h.ry), s = Math.sin(h.ry);
    const nx = s, nz = c;
    const dx = h.x + nx * h.p.d / 2, dz = h.z + nz * h.p.d / 2;
    const gy = heightAt(dx, dz);
    out.push({
      id: `door_${d.zone}`, label: `House door, ${d.zone}`, zone: d.zone, time: 14, fov: 45,
      pos: [dx + nx * 7.5, gy + 3.0, dz + nz * 7.5], look: [dx, gy + 1.5, dz],
    });
  }
  return out;
}

// A saved scene must never change what the critic renders, so `?shot=` always gets the demo.
function startScene(terrain, report) {
  if (!new URLSearchParams(location.search).has('shot')) {
    const saved = loadScene();
    if (saved) {
      report(saved);
      if (saved.doc) { paveLight(terrain); return saved.doc; }
    }
  }
  return demoScene(terrain);
}
