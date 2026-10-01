// R3 reviewer C: how many chunk-column meshes pass three's bounding-sphere frustum test vs a tight AABB test.
//   node tools/review_c_cull.mjs   (mobile viewport, rd 6, several yaw/pitch views)
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';
const PORT = 9335, BASE = 'http://localhost:8861/gms/3d/synthwild/';
const port = await launch(PORT, ['--use-angle=metal']);
try {
  const pg = await open(port);
  await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?play=1&nointro&seed=perfnight');
  await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
  await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true');
  await sleep(9000);
  const out = [];
  for (const [yaw, pitch] of [[0, 0], [1.6, 0], [3.1, -0.2], [4.7, -0.5], [0.8, 0.3]]) {
    out.push(await pg.game(`
      const T = G.THREE, P = C.player; P.yaw = ${yaw}; P.pitch = ${pitch};
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      const cam = C.camera; cam.updateMatrixWorld();
      const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      let parts = 0, vis = 0, sph = 0, box = 0, triS = 0, triB = 0;
      const bb = new T.Box3(), sp = new T.Sphere();
      for (const m of C.render.group.children) {
        parts++; if (!m.visible) continue; vis++;
        const g = m.geometry, tris = g.index.count / 3;
        sp.copy(g.boundingSphere).applyMatrix4(m.matrixWorld); bb.copy(g.boundingBox).applyMatrix4(m.matrixWorld);
        if (fr.intersectsSphere(sp)) { sph++; triS += tris; }
        if (fr.intersectsBox(bb)) { box++; triB += tris; }
      }
      return { yaw: ${yaw}, pitch: ${pitch}, parts, inRange: vis, passSphere: sph, passBox: box, trisSphere: Math.round(triS), trisBox: Math.round(triB), calls: C.renderer.info.render.calls, cols: C.render.stats.columns };`));
  }
  console.table(out);
} finally { stopBrowser(PORT); }
