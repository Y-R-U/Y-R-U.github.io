// Named camera + world setups. The critic harness renders these by id and blind-compares
// each against its `ref` plate. Adding a scenario is how a component gets judged.

import { showroom } from './showroom/index.js';
import { camera } from './world/camera.js';

const registry = new Map();

export function defineScenario(s) {
  registry.set(s.id, s);
  showroom.expect('scene', s.id);
  showroom.register({
    id: s.id,
    group: 'scene',
    label: s.label || s.id,
    note: s.ref,
    // a scenario is absolute: whatever the last one left behind goes back to its default first,
    // so the showroom shows exactly what tools/shot.mjs renders in a fresh page
    run: ctx => { ctx.app.quality.resetDefaults(); s.setup(ctx.app); },
  });
}

export function getScenario(id) { return registry.get(id); }
export function allScenarios() { return [...registry.values()]; }

// A scenario framing is absolute: the orbit rig stands down and takes the new framing as its
// starting point, so enabling touch afterwards continues from here instead of snapping.
export function frameCamera(app, { pos, look, fov = 45 }) {
  app.camera.fov = fov;
  app.camera.position.set(...pos);
  app.camera.lookAt(...look);
  app.camera.updateProjectionMatrix();
  if (camera.rig) { camera.rig.active = false; camera.rig.setFrom(pos, look, fov); }
}
