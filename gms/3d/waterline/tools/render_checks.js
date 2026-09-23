// Run in Chrome through shot.mjs --shot=boot --evalfile=tools/render_checks.js.
// Actual geometry, effect ownership, frame uploads and cinematic timing regressions.
(async () => {
  const w = window.__waterline, T = w.three, app = w.app, fx = w.vfx.emit;
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const { buildShip } = await import('./js/world/ship.js');
  const { hotField, smokeField } = await import('./js/world/vfx/field.js');
  const { Pool } = await import('./js/world/vfx/pool.js');
  for (const kit of ['destroyer', 'cruiser', 'battleship']) {
    const ship = buildShip(kit, w.quality, kit === 'destroyer' ? 2 : 5, { detail: 2 });
    let hull;
    ship.object3D.traverse(o => { if (o.material?.name === `hull:${kit}`) hull = o; });
    ship.object3D.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const ray = new T.Raycaster(new T.Vector3(0, 2, side * 80), new T.Vector3(0, 0, -side));
      const hits = ray.intersectObject(hull);
      check(`${kit} ${side < 0 ? 'port' : 'starboard'} wall faces outward`,
        hits.length && hits[0].point.z * side > 0 && hits[0].face.normal.z * side > 0,
        hits[0]?.point.toArray());
    }
    check(`${kit} opaque painted steel`, !hull.material.transparent && hull.material.depthWrite && hull.material.roughness >= 0.75);
    ship.dispose?.();
  }
  const pool = new Pool({ cap: 2, make: () => ({}), reset: x => { x.reset = true; } });
  pool.warm();
  const a = pool.acquire(), b = pool.acquire();
  check('exhausted light pool cannot steal another effect', pool.acquire() === null && !a.reset && !b.reset);
  pool.release(a);
  check('released light can be reused', pool.acquire() === a && pool.built === 2);
  pool.clear(); pool.acquire(1);
  check('persistent lighting respects flash reserve', pool.acquire(1) === null && pool.acquire() !== null);

  fx.clear();
  await frame(); await frame();
  let lightsBefore = 0;
  app.scene.traverse(o => { if (o.isPointLight) lightsBefore++; });
  const programsBefore = app.renderer.info.programs.length;
  const samples = [];
  let previous = performance.now(), measuring = true;
  const sample = now => { samples.push(now - previous); previous = now; if (measuring) requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
  const start = performance.now();
  fx.hit(new T.Vector3(0, 8, 0), 9);
  const spawnMs = performance.now() - start;
  await frame(); await frame();
  let lightsAfter = 0;
  app.scene.traverse(o => { if (o.isPointLight) lightsAfter++; });
  check('impact keeps shader light count stable', lightsBefore === lightsAfter, { lightsBefore, lightsAfter });
  check('first impact has no new shader variants', app.renderer.info.programs.length === programsBefore,
    { before: programsBefore, after: app.renderer.info.programs.length });
  fx.hit(new T.Vector3(25, 8, 0), 4);
  await frame(); await frame();
  for (const field of [hotField(fx.object3D), smokeField(fx.object3D)]) {
    let error = 0, count = 0;
    const matrix = new T.Matrix4(), pos = new T.Vector3();
    for (const slot of field.slots) if (slot.live && slot.alpha > 0.002) {
      field.mesh.getMatrixAt(slot.i, matrix); pos.setFromMatrixPosition(matrix);
      error = Math.max(error, pos.distanceTo(slot.pos)); count++;
    }
    check('all concurrent particles uploaded in the same frame', count > 0 && error < 0.001, { count, error });
  }
  for (let i = 0; i < 90; i++) await frame();
  measuring = false;
  fx.clear(); await frame(); await frame();
  check('clearing effects leaves no ghost particles', hotField().mesh.count === 0 && smokeField().mesh.count === 0);
  const splashes = Array.from({ length: 9 }, (_, i) => fx.splash(new T.Vector3(i * 10, 0, 0), 1));
  await frame(); await frame();
  const columns = fx.object3D.children.filter(o => o.material?.customProgramCacheKey() === 'waterlineSplashColumn');
  check('salvo keeps splash geometry bounded', columns.length === 3 && columns.every(c => c.userData.busy));
  splashes[8].kill();
  check('overflow splash cannot release another splash', columns.every(c => c.userData.busy));
  fx.clear(); await frame(); await frame();
  check('salvo cleanup releases every column', columns.every(c => !c.userData.busy && !c.visible));
  const director = w.cine.director;
  const from = new T.Vector3(0, 20, 0), to = new T.Vector3(0, 5, 900);
  const round = fx.tracer(from, to, 2400, { size: 1, driven: true });
  director.setRate(3);
  const played = director.play('shell_chase', { round, size: 1, from, to, aspect: app.camera.aspect });
  await played;
  check('fast-forward shell arrives with its camera', Math.abs(round.round.u - 1) < 0.0001, round.round.u);
  round.kill(); round.kill();
  check('effect kill is idempotent', !round.alive);
  director.setRate(1);
  samples.sort((a, b) => a - b);
  const report = { results, impact: { spawnMs, frameP95: samples[Math.floor(samples.length * 0.95)], maxFrame: Math.max(...samples) } };
  console.log('render checks', JSON.stringify(report));
  if (results.some(r => !r.ok)) throw new Error(JSON.stringify(report));
  return report;
})()
