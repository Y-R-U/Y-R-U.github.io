// Named camera + world setups. The critic harness renders these by id and blind-compares each
// against its `ref` plate, so a scenario id and its ref must not change between rounds — score
// movement would stop meaning anything. Adding a scenario is how a component gets judged.
//
//   defineScenario({ id: 'bridge_dusk', label: '…', ref: '1489630_00', setup(app) { … } })
//
// `ref` is a filename stem in the naval plate set (see tools/compare.mjs). `setup` runs once,
// after boot, on a scene that is already built — move the camera, set the time of day, spawn
// whatever the shot is about.

const registry = new Map();

export function defineScenario(s) { registry.set(s.id, s); }
export function getScenario(id) { return registry.get(id); }
export function allScenarios() { return [...registry.values()]; }

// What the hook publishes: the record minus its setup function, so it survives JSON.
export function scenarioList() {
  return allScenarios().map(({ setup, ...rest }) => rest);
}

export function frameCamera(app, { pos, look, fov = 52, near, far }) {
  app.camera.fov = fov;
  if (near) app.camera.near = near;
  if (far) app.camera.far = far;
  app.camera.position.set(...pos);
  app.camera.lookAt(...look);
  app.camera.updateProjectionMatrix();
}
