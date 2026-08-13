// The world: terrain, foliage, whichever scene document is loaded on top of them, and the five
// named scenarios the critic renders. The buildings themselves are data — see js/editor/scene.js.

import * as THREE from 'three';
import { Terrain, CAMERAS, setCameras, heightAt, TOWNS } from './terrain.js';
import { Scatter } from './scatter.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { SceneBuilder } from '../editor/build.js';
import { demoScene } from '../editor/demoScene.js';
import { loadScene } from '../editor/store.js';

// Positions are offsets from the town the shot belongs to, so the five framings survive the towns
// moving. They were absolute and had to be re-derived by hand when A4 pushed the towns 520 m apart.
const SHOTS = [
  { id: 'wall_day', label: 'Wall + tower, midday', zone: 'light', time: 10.5,
    at: 0, pos: [-48, 15, -62], look: [14, 7, -31], keep: 13, ref: '2198150_03' },
  { id: 'street_dusk', label: 'Street at dusk', zone: 'neutral', time: 17.6,
    at: 1, pos: [0, 3.2, 44], look: [0, 4, -26], keep: 10, ref: '2198150_05' },
  { id: 'gate_night', label: 'Gatehouse at night', zone: 'dark', time: 21.5,
    at: 2, pos: [-18, 5.5, -14], look: [0, 9, -34], keep: 11, ref: '2198150_08' },
  { id: 'town_night', label: 'District at night', zone: 'neutral', time: 21,
    at: 1, pos: [40, 30, 46], look: [0, 4, -16], keep: 10, ref: '2198150_04' },
  { id: 'creek_day', label: 'Creek through the zones', zone: 'neutral', time: 8.5,
    at: 1, pos: [-58, 16, 208], look: [4, 2, 160], keep: 10, ref: '2198150_05' },
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
    for (const [x, z] of CAMERAS) this.terrain.mark(x, z, 3.5);
    this.terrain.build();
    this.scatter.build();
    this.terrain.finish();
    this.object3D.add(this.terrain.object3D, this.scatter.object3D);
    this.registerScenarios();
  }

  registerKnobs(q) {
    this.terrain.registerKnobs(q);
    this.scatter.registerKnobs(q);
  }

  update(dt, app) { this.terrain.update(dt, app); }

  registerScenarios() {
    for (const s of SHOTS.concat(devShots(this.doc))) {
      defineScenario({
        ...s,
        setup: app => {
          const y = heightAt(s.pos[0], s.pos[2]);
          frameCamera(app, { pos: [s.pos[0], Math.max(s.pos[1], y + 2.2), s.pos[2]], look: s.look, fov: s.fov });
          app.quality.set('time', s.time);
        },
      });
    }
  }
}

// Working framings for the door kit, off unless ?dev=1 — --all lists whatever is registered,
// and the critic scores exactly the five above. Derived from the scene rather than hardcoded so
// they follow the layout.
function devShots(doc) {
  if (!new URLSearchParams(location.search).has('dev')) return [];
  const out = [];
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
      if (saved.doc) return saved.doc;
    }
  }
  return demoScene(terrain);
}
