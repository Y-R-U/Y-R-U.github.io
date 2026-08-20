// Named camera + world setups. The critic harness renders these by id and blind-compares
// each against its `ref` plate. Adding a scenario is how a component gets judged.

const registry = new Map();

export function defineScenario(s) { registry.set(s.id, s); }
export function getScenario(id) { return registry.get(id); }
export function allScenarios() { return [...registry.values()]; }

export function frameCamera(app, { pos, look, fov = 55 }) {
  // Through the knob, not app.setFov: `fov` is registered with quality, and usePreset() re-applies
  // every knob from its own settings. A direct write is stomped back to 55 the moment --preset or
  // any other param is applied, which happens after the scenario has run.
  app.quality.set('fov', fov);
  app.camera.position.set(...pos);
  app.camera.lookAt(...look);
  app.camera.updateProjectionMatrix();
}
