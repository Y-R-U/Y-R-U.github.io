#!/usr/bin/env node
// Per-system triangle attribution for every scenario, at the mobile profile.
// Walks the scene graph and sums by mesh name, then reconciles the drawn total against
// renderer.info. Writes docs/BUDGET_LATEST.json unless --out says otherwise.
//
//   node tools/budget.mjs --stage=A2 --out=docs/BUDGET_A2.json
//   node tools/budget.mjs --shot=street_dusk --preset=high
//
// Frozen readings are refused as an output. A0's docs/BASELINE.json was destroyed by a run that
// defaulted to writing it, which is why the default is a scratch name and the guard exists.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, listScenarios } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();

const W = +(args.w || 844), H = +(args.h || 390);
const DPR = +(args.dpr || 1);
const PRESET = args.preset || 'medium';
const FROZEN = ['docs/BASELINE.json', 'docs/BUDGET.json'];
const OUT = resolve(ROOT, args.out || 'docs/BUDGET_LATEST.json');
if (!args.force && FROZEN.some(f => OUT === resolve(ROOT, f))) {
  console.error(`${args.out} is a frozen reading. Pick another --out, or --force.`);
  process.exit(1);
}

// Runs in the page. `drawn` applies three's own visibility rules — the visible chain, the
// frustumCulled flag and the bounding sphere against the camera frustum — so its total is
// comparable with renderer.info's main pass. `resident` is everything in the graph.
const WALK = `(() => {
  const THREE = window.__forge.three;
  const app = window.__forge.app;
  const cam = app.camera;

  cam.updateMatrixWorld();
  app.scene.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const sphere = new THREE.Sphere();

  const tally = {};
  const add = (bucket, part, tris, drawn) => {
    const b = tally[bucket] || (tally[bucket] = { tris: 0, meshes: 0, drawnTris: 0, drawnMeshes: 0, parts: {} });
    const p = b.parts[part] || (b.parts[part] = { tris: 0, meshes: 0, drawnTris: 0, drawnMeshes: 0 });
    b.tris += tris; b.meshes++;
    p.tris += tris; p.meshes++;
    if (drawn) { b.drawnTris += tris; b.drawnMeshes++; p.drawnTris += tris; p.drawnMeshes++; }
  };

  const path = o => { const a = []; for (let n = o; n; n = n.parent) if (n.name) a.push(n.name); return a; };

  function classify(o, names) {
    const n = o.name || '';
    if (names.includes('scatter')) return ['foliage', n.split(':').pop() || 'unnamed'];
    if (names.includes('people')) return ['people', n.startsWith('people:contact') ? 'contact' : 'robed'];
    if (names.includes('chickens')) return ['people', n === 'chickens:contact' ? 'contact' : 'chickens'];
    if (names.includes('player')) return ['people', 'player'];
    if (names.includes('interior')) return ['interior', n || 'room'];
    if (names.includes('spells')) return ['misc', 'spells'];
    if (n.startsWith('doorLeaves')) return ['buildings', 'doorLeaves'];
    if (names.includes('scene') || names.some(v => v.startsWith('district')) || names.includes('live')) {
      return ['buildings', n || 'unnamed'];
    }
    if (n === 'ground') return ['ground', 'ground'];
    if (n === 'water' || n === 'waterReflect') return ['water', n];
    if (n === 'road') return ['roads', 'road'];
    if (n === 'contactAO') return ['decals', 'contactAO'];
    return ['misc', n || o.type];
  }

  // Mirrors WebGLRenderer.projectObject: a hidden ancestor removes the whole subtree.
  function visit(o, shown) {
    const vis = shown && o.visible;
    if (o.isMesh || o.isPoints || o.isLine) {
      const g = o.geometry;
      const per = (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
      const tris = per * (o.isInstancedMesh ? o.count : 1);
      if (tris > 0) {
        let drawn = vis;
        if (drawn && o.frustumCulled) {
          // An InstancedMesh's own bounding sphere spans its instances; its geometry's spans one
          // blade of grass at the origin. Using the wrong one culls the entire foliage system.
          if (o.boundingSphere === null) o.computeBoundingSphere();
          const bs = o.boundingSphere || (g.boundingSphere || (g.computeBoundingSphere(), g.boundingSphere));
          drawn = frustum.intersectsSphere(sphere.copy(bs).applyMatrix4(o.matrixWorld));
        }
        const [bucket, part] = classify(o, path(o));
        add(bucket, part, tris, drawn);
      }
    }
    for (const c of o.children) visit(c, vis);
  }
  visit(app.scene, true);

  const order = ['ground', 'water', 'roads', 'decals', 'buildings', 'foliage', 'people', 'interior', 'misc'];
  const out = {};
  for (const k of order.concat(Object.keys(tally))) if (tally[k] && !out[k]) out[k] = tally[k];
  return out;
})()`;

// Cost of one object of each type, built on its own. §6.3 carries estimates for these and says
// they are to be replaced with a Phase 0 measurement. `liveObject` builds an unmerged copy whose
// first child is the builder's own output; the second is the foundation collar, which belongs to
// the district's dressing rather than to the object.
// The demo holds nothing near the size of the landmarks WORLD.md §3 specifies, so §6.3's table
// cannot be checked against it. These are the specified objects and the K = 1.5 defaults.
const SPEC = [
  ['spire (Whitewall)', 'light', 'tower', { radius: 9, height: 58, sides: 12 }],
  ['keep (Blackstone)', 'dark', 'tower', { radius: 11, height: 52, sides: 8 }],
  ['granary (Longacre)', 'neutral', 'tower', { radius: 5, height: 20, sides: 12 }],
  ['precinct wall 130 m', 'light', 'wallRun', { length: 130, height: 12, thickness: 3.6 }],
  ['curtain 115 m', 'dark', 'wallRun', { length: 115, height: 15, thickness: 4.5 }],
  ['wallRun 60 m (§6.3 row)', 'neutral', 'wallRun', { length: 60, height: 12, thickness: 3.6 }],
  ['sanctum 34x26x16', 'light', 'house', { w: 34, d: 26, h: 16 }],
  ['tithe barn 40x18x15', 'neutral', 'house', { w: 40, d: 18, h: 15 }],
  ['house, K=1 default', 'neutral', 'house', { w: 8, d: 7, h: 6 }],
  ['house, K=1.5 default', 'neutral', 'house', { w: 12, d: 10.5, h: 9 }],
  ['mass, K=1.5 default', 'neutral', 'mass', { w: 12, d: 10.5, h: 9 }],
];

const PER_OBJECT = `(() => {
  const b = window.__forge.doors.demo.builder;
  const count = root => { let t = 0; root.traverse(m => { if (m.isMesh) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return t; };
  const spec = {};
  for (const [label, zone, type, p] of ${JSON.stringify(SPEC)}) {
    const root = b.liveObject({ id: 0, dist: 0, zone, type, x: 0, z: 0, ry: 0, seed: 12345, p });
    spec[label] = count(root.children[0]);
    root.traverse(m => { if (m.isMesh) m.geometry.dispose(); });
  }

  const rows = [];
  for (const o of b.doc.objects) {
    const root = b.liveObject(o);
    const tris = count(root.children[0]);
    root.traverse(m => { if (m.isMesh) m.geometry.dispose(); });
    rows.push({ type: o.type, zone: o.zone, p: o.p, tris });
  }
  const by = {};
  for (const r of rows) {
    const g = by[r.type] || (by[r.type] = { n: 0, min: Infinity, max: 0, total: 0, examples: [] });
    g.n++; g.total += r.tris;
    g.min = Math.min(g.min, r.tris); g.max = Math.max(g.max, r.tris);
    if (g.examples.length < 3) g.examples.push({ zone: r.zone, p: r.p, tris: r.tris });
  }
  for (const g of Object.values(by)) g.mean = Math.round(g.total / g.n);
  return { demoTypes: by, spec };
})()`;

async function main() {
  const { S, base, close } = await open({ w: W, h: H, dpr: DPR });
  const shots = args.shot ? [args.shot] : await listScenarios(S, base);
  const scenarios = {};
  let perObject = null;

  for (const shot of shots) {
    await S('Page.navigate', { url: `${base}/index.html?shot=${shot}&preset=${PRESET}&dpr=${DPR}` });
    await waitFor(S, `window.__forge && window.__forge.ready`, 15000);
    await settle(S, 45);

    const stats = await evalJSON(S, `window.__forge.stats()`);
    const systems = await evalJSON(S, WALK);
    if (!perObject) perObject = await evalJSON(S, PER_OBJECT);

    let drawn = 0, resident = 0, meshes = 0;
    for (const b of Object.values(systems)) { drawn += b.drawnTris; resident += b.tris; meshes += b.drawnMeshes; }

    scenarios[shot] = {
      reported: {
        calls: stats.calls, mainCalls: stats.mainCalls, shadowCalls: stats.shadowCalls,
        tris: stats.tris, mainTris: stats.mainTris, shadowTris: stats.shadowTris,
        texMB: +stats.texMB.toFixed(1),
      },
      walked: { drawnTris: drawn, residentTris: resident, drawnMeshes: meshes },
      // A gap here means the walk and the renderer disagree about what is on screen, which is
      // the only thing that would make the attribution below untrustworthy.
      reconcile: {
        mainTris: stats.mainTris,
        deltaTris: drawn - stats.mainTris,
        deltaPct: +((drawn - stats.mainTris) / Math.max(1, stats.mainTris) * 100).toFixed(2),
      },
      systems,
    };

    const pc = scenarios[shot].reconcile.deltaPct;
    console.log(`${shot.padEnd(12)} drawn ${k(drawn)} / resident ${k(resident)}  vs main ${k(stats.mainTris)} (${pc > 0 ? '+' : ''}${pc}%)`);
    for (const [name, b] of Object.entries(systems)) {
      console.log(`   ${name.padEnd(10)} ${k(b.drawnTris).padStart(7)}  ${Object.entries(b.parts)
        .filter(([, p]) => p.drawnTris)
        .sort((a, c) => c[1].drawnTris - a[1].drawnTris)
        .map(([n, p]) => `${n} ${k(p.drawnTris)}`).join('  ')}`);
    }
  }

  await close();

  console.log('\ndemo objects, built alone:');
  for (const [t, g] of Object.entries(perObject.demoTypes)) {
    console.log(`   ${t.padEnd(9)} n=${String(g.n).padStart(2)}  mean ${k(g.mean).padStart(7)}  min ${k(g.min)}  max ${k(g.max)}`);
  }
  console.log('\nspecified objects, built alone:');
  for (const [label, tris] of Object.entries(perObject.spec)) {
    console.log(`   ${label.padEnd(24)} ${k(tris).padStart(7)}`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    stage: args.stage || 'unlabelled',
    profile: { preset: PRESET, dpr: DPR, w: W, h: H, headed: false },
    note: 'Headless software render. Counts are trustworthy; timings are not — see CLAUDE.md.',
    scenarios,
    perObject,
  }, null, 2) + '\n');
  console.log(`\n→ ${OUT}`);
}

const k = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

main().catch(e => { console.error(e); process.exit(1); });
