import * as THREE from 'three';
import { flushCards, pumpSea } from './field.js';
import { flushGunCards, resetGunOrder } from './gun.js';
import { resetImpactOrder } from './impact.js';

// Pay texture baking, shader compilation and GPU uploads behind the loading screen,
// instead of on the first shell, hit, miss or burning hull.
export async function warmCombat(app, vfx, ship) {
  const p = new THREE.Vector3(0, 8, 0);
  const target = new THREE.WebGLRenderTarget(16, 16);
  const previous = app.renderer.getRenderTarget();
  try {
    vfx.muzzle(ship.gunAnchors[0], 9);
    vfx.tracer(p, new THREE.Vector3(0, 10, -80), 1000, 9);
    vfx.hit(p, 9);
    // Fill the existing splash mesh pools before any multi-cell shot.
    for (let i = 0; i < 3; i++) vfx.splash(new THREE.Vector3(i * 8, 0, 0), 1);
    vfx.fire(null, p, { seconds: 1, size: 9 });
    vfx.update(1 / 60);
    flushCards(app.camera);
    flushGunCards(app);
    app.scene.updateMatrixWorld(true);
    await app.renderer.compileAsync(app.scene, app.camera);
    app.scene.traverse(o => {
      for (const m of [].concat(o.material || [])) {
        for (const value of Object.values(m)) if (value?.isTexture) app.renderer.initTexture(value);
      }
    });
    app.renderer.setRenderTarget(target);
    app.renderer.render(app.scene, app.camera);
  } finally {
    app.renderer.setRenderTarget(previous);
    target.dispose();
    vfx.clear();
    flushCards(app.camera);
    flushGunCards(app);
    pumpSea();
    resetGunOrder();
    resetImpactOrder();
    app.clock.start();
  }
}
