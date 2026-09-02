#!/usr/bin/env node
/**
 * No save state may dead-end the game. Finishing a bully run stored level 45 of 45; the hub
 * clamped that for display but FIGHT passed the raw value, LEVELS[45] was undefined, and the
 * click handler threw — a button that silently did nothing, for ever, across refreshes.
 *
 *   node tools/stuckgate.mjs
 *   node tools/stuckgate.mjs --falsify   # stop clamping and watch it go red
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const falsify = process.argv.includes('--falsify');

const STATES = [
  ['a fresh save', {}],
  ['mid campaign', { level: 17 }],
  ['the last fight', { level: 44 }],
  ['campaign completed', { level: 44, completed: true }],
  ['mid bully run', { completed: true, bully: true, bullyLevel: 20 }],
  ['a FINISHED bully run', { completed: true, bully: true, bullyLevel: 45 }],
  ['a corrupt level index', { level: 999, bully: true, bullyLevel: -4 }],
  ['a non-numeric level', { level: null, bullyLevel: 'x' }],
];

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(900, 420, 1, true);
  for (const [name, patch] of STATES) {
    await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
    await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
    await c.eval(`(()=>{
      const K = 'ragdojo.save.v2';
      const s = JSON.parse(localStorage.getItem(K) || '{}');
      Object.assign(s, ${JSON.stringify(patch)});
      localStorage.setItem(K, JSON.stringify(s));
    })()`);
    await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
    await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
    c.errors.length = 0;
    // Falsify reproduces the old handler exactly: the index straight out of the stored save,
    // unclamped, into LEVELS. Healthy states still pass; only the out-of-range ones go red.
    const started = await c.eval(`(()=>{
      try {
        if (${falsify}) {
          const raw = JSON.parse(localStorage.getItem('ragdojo.save.v2') || '{}');
          const idx = raw.bully ? raw.bullyLevel : raw.level;
          window.__ragdojo.startFight(window.__ragdojo.LEVELS[idx].idx, !!raw.bully);
        } else document.getElementById('btnFight').click();
        return 'clicked';
      } catch (e) { return 'threw: ' + e.message; }
    })()`);
    let inFight = false;
    try { inFight = await c.waitFor('window.__state && window.__state.mode === "fight"', 6000); } catch { /* reported below */ }
    ok(`FIGHT works with ${name}`, inFight && !c.errors.length,
      `${started}${c.errors.length ? ' | ' + c.errors[0].split('\n')[0] : ''}`);
  }

  // And the options behind the victory screen stay reachable without winning another fight.
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
  await c.waitFor('document.getElementById("hub").classList.contains("show")', 20000);
  ok('a completed save offers its championship from the hub',
    await c.eval(`!document.getElementById('btnTrophy').classList.contains('hidden')`));
  await c.eval(`document.getElementById('btnTrophy').click()`);
  await c.frames(6);
  ok('and it opens the victory screen',
    await c.eval(`document.getElementById('victory').classList.contains('show')`));

  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
