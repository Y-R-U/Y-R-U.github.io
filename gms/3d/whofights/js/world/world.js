// The world: terrain, foliage, and whichever level document is loaded on top of them. The
// buildings themselves are data — see js/editor/scene.js and data/levels/.

import * as THREE from 'three';
import { Terrain, CAMERAS, setCameras } from './terrain.js';
import { Scatter } from './scatter.js';
import { Stream } from './stream.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { SceneBuilder, shadowOnly } from '../editor/build.js';
import { loadScene } from '../editor/store.js';

export class World {
  constructor(doc, saved = null) {
    this.object3D = new THREE.Group();
    this.doc = doc;
    this.loadReport = saved;
    setCameras(doc.shots || []);
    this.terrain = new Terrain();
    this.scatter = new Scatter(this.terrain);
    this.builder = new SceneBuilder(this.terrain);
    this.object3D.add(this.builder.object3D);
    this.builder.buildAll(doc, true);
    this.terrain.addRoads();
    for (const [x, z] of CAMERAS) this.terrain.mark(x, z, 3.5);
    this.terrain.build();
    this.scatter.build();
    this.terrain.finish();
    this.object3D.add(this.terrain.object3D, this.scatter.object3D);
    this.stream = new Stream(this);
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
  // footprints and the scatter come from the level document and do not change with a world knob.
  rebuild() {
    this.terrain.teardown();
    this.terrain.build();
    this.terrain.finish();
    this.stream.reset();
  }

  update(dt, app) { this.stream.update(dt, app); }

  // Where the floor of a house's interior sits in world y. Characters standing in a hall need it:
  // the room's floor is a plinth above the ground the terrain would put them on.
  floorOf(id) {
    const o = this.doc.objects.find(p => p.id === id);
    if (!o || o.type !== 'house') return null;
    return this.builder.seat(o).hi + 0.71;
  }

  // `pos.y` and `look.y` are heights above the ground at that point, not absolutes, so a shot
  // survives the terrain being retuned. `inside` names a door index to peek through instead.
  registerScenarios(doors) {
    for (const s of this.doc.shots || []) {
      defineScenario({
        ...s,
        setup: app => {
          if (s.inside !== undefined) doors?.peek(s.inside);
          const g = this.terrain.surfaceY.bind(this.terrain);
          const base = s.inside !== undefined ? (this.floorOf(this.doc.objects.find(o => o.type === 'house')?.id) ?? 0) : null;
          const gy = p => (base ?? g(p[0], p[2]));
          frameCamera(app, {
            pos: [s.pos[0], gy(s.pos) + s.pos[1], s.pos[2]],
            look: [s.look[0], gy(s.look) + s.look[1], s.look[2]],
            fov: s.fov,
          });
          app.quality.set('time', s.time ?? 11);
        },
      });
    }
  }
}

// A saved scene must never change what a render shows, so `?shot=` always gets the authored file.
export function startDoc(authored) {
  if (new URLSearchParams(location.search).has('shot')) return { doc: authored, saved: null };
  const saved = loadScene();
  return { doc: saved?.doc || authored, saved };
}
