// R3 reviewer C: meshes (= potential draw calls) and unique materials/geometries per scene subtree.
//   node tools/review_c_scene.mjs [night|mg:<id>]
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';
const PORT = 9335, BASE = 'http://localhost:8861/gms/3d/synthwild/';
const which = process.argv[2] || 'night';
const port = await launch(PORT, ['--use-angle=metal']);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1280, height: 720 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + (which === 'night' ? '?play=1&nointro&t=0.85&seed=perfnight' : '?mgtest=' + which.slice(3) + '&nointro'));
  await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
  if (which === 'night') {
    await sleep(2000);
    await pg.game(`const M = C.game.mobs, p = C.player.pos; for (const k of ${JSON.stringify(process.argv[3]?.split(',') || [])}) M.spawn(k, p.x + 4, C.world.surfaceY(p.x+4, p.z) + 0.1, p.z); return 1;`);
  }
  await sleep(6000);
  console.log(JSON.stringify(await pg.game(`
    const out = [];
    const desc = (root) => { let meshes = 0, tris = 0; const mats = new Set(), geos = new Set(); root.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) { meshes++; for (const m of [].concat(o.material)) mats.add(m); geos.add(o.geometry); const g = o.geometry; tris += ((g.index ? g.index.count : g.attributes.position?.count || 0) / 3) * (o.isInstancedMesh ? o.count : 1); } }); return { meshes, mats: mats.size, geos: geos.size, tris: Math.round(tris) }; };
    for (const c of C.scene.children) { if (c.name === 'chunks') continue; const d = desc(c); if (d.meshes) out.push({ name: c.name || c.type, kids: c.children.length, ...d, inst: (() => { let n = 0; c.traverse(o => { if (o.isInstancedMesh) n++; }); return n; })() }); }
    const mobs = (C.game.mobs.list || []).map((m) => ({ kind: m.kind, ...desc(m.parts.root) }));
    return { top: out.sort((a, b) => b.meshes - a.meshes), mobs };`), null, 1));
} finally { stopBrowser(PORT); }
