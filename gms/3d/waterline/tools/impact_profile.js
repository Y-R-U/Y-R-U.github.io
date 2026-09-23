// shot.mjs --shot=boot --headed --dpr=1 --evalfile=tools/impact_profile.js
(async () => {
  const w = window.__waterline, app = w.app, fx = w.vfx.emit, T = w.three;
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const report = [];
  for (const kind of ['hit', 'hit', 'splash', 'salvo']) {
    fx.clear();
    for (let i = 0; i < 5; i++) await frame();
    const programs = app.renderer.info.programs.length;
    const times = [];
    let before = performance.now();
    const start = before;
    for (let i = 0; i < (kind === 'salvo' ? 9 : 1); i++) {
      const p = new T.Vector3((i % 3 - 1) * 15, kind === 'hit' ? 6 : 0, Math.floor(i / 3) * 15);
      fx[kind === 'salvo' ? 'splash' : kind](p, 9);
    }
    const spawnMs = performance.now() - start;
    for (let i = 0; i < 100; i++) {
      await frame();
      const now = performance.now(); times.push(now - before); before = now;
    }
    times.sort((a, b) => a - b);
    report.push({ kind, spawnMs, p95: times[95], max: Math.max(...times),
      shaderVariantsAdded: app.renderer.info.programs.length - programs });
  }
  fx.clear();
  return report;
})()
