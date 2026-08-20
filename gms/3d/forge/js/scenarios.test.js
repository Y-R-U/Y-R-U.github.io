import { test } from 'node:test';
import assert from 'node:assert/strict';

import { frameCamera } from './scenarios.js';
import { Quality } from './engine/quality.js';
import { fovFor, FOV_MINOR } from './engine/fov.js';

// The part of js/engine/app.js a scenario touches. three cannot be imported under node, so the
// camera and the two field methods are stood up here; the knob registry and the policy they call
// are the real modules, and the registration mirrors App.registerCoreKnobs.
function stubApp(w = 1600, h = 900) {
  const app = {
    quality: new Quality('medium'),
    camera: {
      fov: FOV_MINOR, aspect: w / h,
      position: { set() {} }, lookAt() {}, updateProjectionMatrix() {},
    },
    fovMinor: FOV_MINOR,
    setFov(minor) { this.fovMinor = minor; this.applyFov(); },
    applyFov() { this.camera.fov = fovFor(this.camera.aspect, this.fovMinor); },
    resize(rw, rh) { this.camera.aspect = rw / rh; this.applyFov(); },
  };
  app.quality.register({ key: 'fov', label: 'Field of view (short axis)', type: 'range', default: FOV_MINOR },
    v => app.setFov(v));
  return app;
}

const AIM = { pos: [0, 2, 0], look: [0, 2, -10] };

test("a scenario's declared field survives the preset re-apply that follows it", () => {
  const app = stubApp();
  frameCamera(app, { ...AIM, fov: 60 });
  assert.equal(app.camera.fov, 60);
  // main.js runs shot.setup(app) at boot and applyParams() — which is this — eighty lines later.
  app.quality.usePreset('medium');
  assert.equal(app.camera.fov, 60);
  // and --dpr, which resizes
  app.resize(844, 390);
  assert.equal(app.camera.fov, 60);
});

test('a scenario field is a short-axis field, so a portrait shot keeps its declared horizontal', () => {
  const app = stubApp(390, 844);
  frameCamera(app, { ...AIM, fov: 45 });
  app.quality.usePreset('high');
  assert.equal(app.fovMinor, 45);
  assert.equal(app.camera.fov, fovFor(390 / 844, 45));
});

test('no preset carries a fov, so a preset change cannot redefine a scenario field', () => {
  for (const p of Object.values(Quality.presets)) assert.equal('fov' in p, false);
});
