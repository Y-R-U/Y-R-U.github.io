#!/usr/bin/env node
/** Boot the real game, drive a fight, report console errors and state. */
import { CDP } from './cdp.mjs';
import { serveWithUpload, grab } from './shot.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const W = +(args.w || 900), H = +(args.h || 420);
const log = (m) => process.stderr.write(m + '\n');

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(W, H, 1, true);
  const url = `${srv.base}/index.html?auto=1&dpr=1${args.level !== undefined ? `&level=${args.level}` : ''}`;
  await c.goto(url);
  const ready = await c.waitFor('window.__state && window.__state.mode !== "boot"', 20000);
  log(`mode after boot: ${JSON.stringify(await c.eval('window.__state'))}  (ready=${ready})`);

  await c.frames(30);
  await c.shot(new URL('../shots/boot_hub.png', import.meta.url).pathname);

  if (args.level !== undefined) {
    await c.frames(Math.max(60, +(args.frames || 600)));
    log(`state in fight: ${JSON.stringify(await c.eval('window.__state'))}`);
    await c.shot(new URL('../shots/boot_fight.png', import.meta.url).pathname);
  }
  const errs = c.errors;
  log(errs.length ? `\nERRORS (${errs.length}):\n` + errs.slice(0, 14).join('\n') : '\nno console errors');
} finally { c.close(); srv.close(); }
process.exit(0);
