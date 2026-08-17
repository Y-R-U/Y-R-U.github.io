#!/usr/bin/env node
// §13's P5 done-criterion: "all 9 craft render from the shared generator with only L/W/H and the
// three integer options differing (a contact sheet in the handoff proves it)".
//
// Puts the nine defs in a line in front of a fixed camera in an empty-ish part of the sky, writes
// shots/p5/family.png, and — the half a picture cannot do — dumps the per-def geometry accounting
// so "one generator" is a number and not an impression.
//
//   node tools/craftsheet.mjs [--headed] [--w=2200] [--y=60] [--yaw=-0.62] [--var=duskburn]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const OUT = resolve(ROOT, 'shots/p5');
const W = +(args.w || 1500), H = +(args.h || 950), DPR = +(args.dpr || 1);

async function main() {
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed });
  const { S, base, close } = ctx;
  mkdirSync(OUT, { recursive: true });

  const url = `${base}/index.html?nohud&nosave&var=${args.var || 'duskburn'}&time=19.6`;
  await S('Page.navigate', { url });
  await waitFor(S, 'window.__ready', 30000);

  const y = +(args.y || 1400);
  const gap = +(args.gap || 16);
  // High enough to be clear of the towers, so the sheet is nine craft against fog and nothing else.
  const sheet = await evalJSON(S, `(() => {
    const g = window.__game;
    g.freezeTime(true);
    g.setTraffic(false);
    const s = g.craftSheet(null, ${gap}, ${y}, 3);
    g.setCamera({ pos: [0, ${y + 3.0}, 62], yaw: 0, pitch: -2.4, fov: 46 });
    return s;
  })()`);
  await settle(S, 30);

  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, 'family.png'), Buffer.from(data, 'base64'));

  const acct = await evalJSON(S, `(() => {
    const g = window.__game, st = window.__state;
    return { craft: st.craft, defs: g.craftDefs(), draws: st.draws, tris: st.tris,
      errors: st.errors.map(e => e.msg) };
  })()`);

  writeFileSync(resolve(OUT, 'family.json'), JSON.stringify({ sheet, acct }, null, 2));

  const geoTris = acct.craft.rows.reduce((a, r) => a + (r.instances ? r.geoTris : 0), 0);
  console.log(`\n  ${sheet.craft.length} craft, ONE geometry each field:`);
  for (const r of acct.craft.rows) {
    console.log(`    ${r.field.padEnd(11)} ${String(r.instances).padStart(3)} instances x ${r.geoTris} tris = ${r.tris}`);
  }
  console.log(`\n  id          L      W      H     nac fin   hull      trim      run`);
  for (const c of sheet.craft) {
    const d = acct.defs[c.id];
    const hx = v => (v === undefined ? '--' : '#' + ('000000' + v.toString(16)).slice(-6));
    console.log(`    ${c.id.padEnd(10)} ${String(c.L).padStart(5)} ${String(c.W).padStart(6)} ${String(c.H).padStart(6)}` +
      `   ${c.nac}   ${c.fin}   ${hx(d.hull).padEnd(9)} ${hx(d.trim).padEnd(9)} ${d.run === undefined ? '-' : d.run}` +
      `${c.police ? '   (police light rig)' : ''}`);
  }
  console.log(`\n  one craft body = ${geoTris ? acct.craft.rows[0].geoTris : 0} tris, shared by all ${sheet.craft.length}`);
  console.log(`  frame: ${acct.draws} draws, ${(acct.tris / 1000).toFixed(1)}k tris, ${acct.errors.length} errors`);
  console.log(`  → shots/p5/family.png`);

  await close();
}

main().catch(e => { console.error(e); cleanup(); process.exit(1); });
