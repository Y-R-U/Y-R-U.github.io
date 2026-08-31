#!/usr/bin/env node
/** Capture candidate frames for the projects.js thumbnail (1280x800). */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots');
const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(1280, 800, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&autoplay=1&unlock=1&level=${process.argv[2] || 28}`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  for (let i = 0; i < 8; i++) {
    await c.frames(70);
    await c.shot(join(SHOTS, `proj_${i}.png`));
    const st = await c.eval('window.__state');
    process.stderr.write(`frame set ${i}: hp=${Math.round(st.hp)} enemies=${st.enemies} over=${st.over}\n`);
    if (st.over) break;
  }
} finally { c.close(); srv.close(); }
process.exit(0);
