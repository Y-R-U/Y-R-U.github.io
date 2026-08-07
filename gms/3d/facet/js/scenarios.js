// Named camera + world setups. The critic harness renders these by id and blind-compares each
// against a reference plate. Adding a scenario is how a component gets judged.

const registry = new Map();

export function defineScenario(s) { registry.set(s.id, s); }
export function getScenario(id) { return registry.get(id); }
export function allScenarios() { return [...registry.values()]; }

export function frameCamera(app, { target = [0, 2, 0], az = 45, el = 30, height = 46, mode = 'ortho', fov = 16 }) {
  app.rig.target.set(...target);
  app.rig.set({ azimuth: az, elevation: el, height, mode, fov });
  app.camera = app.rig.camera;
  for (const [k, v] of Object.entries({ camAz: az, camEl: el, camZoom: height, camMode: mode, camLens: fov })) {
    app.quality.settings[k] = v;
  }
}
