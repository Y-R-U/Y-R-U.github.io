#!/usr/bin/env node
// What the draw calls at one traverse station are made of. `budget.mjs --traverse` reports a
// number; this reports the meshes behind it, split by LOD set, so an over-gate frame can be
// attributed to the town or to everything that is not the town.
//
//   node tools/callsat.mjs --at=520,-163,0
//   node tools/callsat.mjs --at="-138.72,62.95,0;520,-163,0" --set=stamp=neutral
//
// `--at` is x,z,yaw copied out of a traverse row. The look point is rebuilt from the path
// tangent the same way budget.mjs does it, so the frame matches the row rather than approximating
// it — `--step` and `--yaws` have to match the traverse the row came from.

import { open, parseArgs, waitFor, settle, evalJSON } from './shot.mjs';

const args = parseArgs();
const W = +(args.w || 844), H = +(args.h || 390), DPR = +(args.dpr || 1);
const PRESET = args.preset || 'medium';
const AHEAD = 22;

const want = (args.at || '520,-163,0').split(';').map(s => s.split(',').map(Number));

function stationsFrom(paths, step, yaws) {
  const out = [];
  for (const pts of paths) {
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      for (let t = carry; t < len; t += step) {
        const x = a[0] + ux * t, z = a[1] + uz * t;
        for (let k = 0; k < yaws; k++) {
          const ang = (k / yaws) * Math.PI * 2;
          const dx = ux * Math.cos(ang) - uz * Math.sin(ang);
          const dz = ux * Math.sin(ang) + uz * Math.cos(ang);
          out.push([x, z, x + dx * AHEAD, z + dz * AHEAD, Math.round(ang * 57.3)]);
        }
      }
      carry = (carry - len) % step;
      if (carry < 0) carry += step;
    }
  }
  return out;
}

const RUN = st => `(() => {
  const THREE = window.__forge.three, f = window.__forge, app = f.app, T = f.demo.terrain;
  const out = [];
  for (const s of ${JSON.stringify(st)}) {
    const [x, z, lx, lz, yawDeg] = s;
    app.camera.position.set(x, T.surfaceY(x, z) + 6, z);
    app.camera.lookAt(lx, T.surfaceY(lx, lz) + 1.5, lz);
    app.camera.updateMatrixWorld();
    for (const sys of app.systems) if (sys.update) sys.update(1 / 60, app);
    app.renderer.info.reset();
    app.marked = false;
    app.renderer.render(app.scene, app.camera);
    const r = app.renderer.info.render;

    app.scene.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(app.camera.projectionMatrix, app.camera.matrixWorldInverse));
    const sphere = new THREE.Sphere();
    const tally = {};
    const path = o => { const v = []; for (let n = o; n; n = n.parent) if (n.name) v.push(n.name); return v; };
    (function visit(o, shown) {
      const vis = shown && o.visible;
      if (o.isMesh || o.isPoints || o.isLine) {
        const g = o.geometry;
        const per = (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
        if (per * (o.isInstancedMesh ? o.count : 1) > 0) {
          // a depth-only mesh stays out of the main list through material.visible, not o.visible
          let drawn = vis && [].concat(o.material).some(m => m.visible);
          if (drawn && o.frustumCulled) {
            if (o.boundingSphere === null) o.computeBoundingSphere();
            const bs = o.boundingSphere || (g.boundingSphere || (g.computeBoundingSphere(), g.boundingSphere));
            drawn = frustum.intersectsSphere(sphere.copy(bs).applyMatrix4(o.matrixWorld));
          }
          if (drawn) {
            const p = path(o);
            const holder = p.find(v => v.startsWith('blk'));
            let label = o.name || o.type;
            if (p.includes('scatter')) label = 'foliage';
            else if (p.includes('people')) label = 'people';
            else if (holder) label = holder.split(':')[1];
            tally[label] = (tally[label] || 0) + 1;
          }
        }
      }
      for (const c of o.children) visit(c, vis);
    })(app.scene, true);

    out.push({ x, z, yaw: yawDeg, calls: r.calls, tris: r.triangles,
      shadowCalls: app.stats.shadowCalls | 0, mainCalls: r.calls - (app.stats.shadowCalls | 0),
      blocks: { ...f.demo.stream.counts }, drawn: tally });
  }
  return out;
})()`;

const { S, base, close } = await open({ w: W, h: H, dpr: DPR });
await S('Page.navigate', { url: `${base}/index.html?shot=street_dusk&preset=${PRESET}&dpr=${DPR}${args.set ? '&' + args.set : ''}` });
await waitFor(S, `window.__forge && window.__forge.ready`, 20000);
await evalJSON(S, `(()=>{__forge.app.quality.set('shadowRate','every frame');return 1})()`);
await settle(S, 30);

const paths = await evalJSON(S, `window.__forge.demo.terrain.paths.map(p => p.pts)`);
const all = stationsFrom(paths, +(args.step || 25), +(args.yaws || 3));
const stations = want.map(([x, z, yaw]) => {
  const hit = all.find(s => Math.abs(s[0] - x) < 0.6 && Math.abs(s[1] - z) < 0.6 && s[4] === yaw);
  if (!hit) throw new Error(`no traverse station at ${x}, ${z} yaw ${yaw} at step ${args.step || 25}`);
  return hit;
});
const rows = await evalJSON(S, RUN(stations));
await close();

for (const r of rows) {
  console.log(`\n(${r.x.toFixed(1)}, ${r.z.toFixed(1)}) yaw ${r.yaw}: ${r.calls} calls (${r.mainCalls} main + ${r.shadowCalls} shadow), ${(r.tris / 1000).toFixed(1)}k tris`);
  console.log(`  live blocks ${JSON.stringify(r.blocks)}`);
  let total = 0;
  for (const [k, v] of Object.entries(r.drawn).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(v).padStart(4)}  ${k}`);
    total += v;
  }
  console.log(`    ${String(total).padStart(4)}  = walked drawn meshes`);
}
