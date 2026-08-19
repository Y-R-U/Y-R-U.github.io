#!/usr/bin/env node
// S2-D's capture rig. Not a gate — it drives the game to each SCREEN this phase owns and writes a
// PNG, so the visual claim behind "these no longer look like a web form" is a picture and not an
// adjective.
//
//   node tools/cap_s2d.mjs [--land] [--tag=before]
//
// Every screen is opened through the real path (__game.forceDock, a real tap on the tab), never by
// unhiding a layer: a screen that only exists because a class was removed is not the screen the
// player sees.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const TAG = args.tag || 'now';
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2d');
const suffix = LAND ? '_land' : '';

async function shot(S, name) {
  // The boot two-thumb hint is an 8-second toast and every capture was landing inside it, which
  // both hid the header and stole `--toast-h` px of the sheet's height. A player sees these screens
  // without it; so does the camera.
  await evalJSON(S, '(window.__game.ui.clearToasts(), 1)');
  await settle(S, 6);
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = resolve(OUT, `${TAG}_${name}${suffix}.png`);
  writeFileSync(p, Buffer.from(data, 'base64'));
  console.log('wrote', p.replace(ROOT + '/', ''));
}

async function tap(S, sel, nth = 0) {
  const box = await evalJSON(S, `(() => {
    const els = document.querySelectorAll(${JSON.stringify(sel)});
    const el = els[${nth}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { empty: true };
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!box || box.empty) throw new Error(`cap: ${sel}[${nth}] not tappable`);
  await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(S, 6);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&crd=9000&tier=4` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });

  await shot(S, 'cockpit');

  const d = await hook(S, 'forceDock');
  console.log('docked', JSON.stringify(d));
  await settle(S, 20);
  await shot(S, 'board_jobs');

  // the client deal panel
  const cp = await hook(S, 'openClient', 0);
  if (cp) { await settle(S, 20); await shot(S, 'client'); await hook(S, 'closeClient'); await settle(S, 6); }

  // tabs — real taps on the real buttons
  const tabs = await evalJSON(S, `[...document.querySelectorAll('.dk-tab')].map(b => b.textContent)`);
  console.log('tabs', JSON.stringify(tabs));
  for (let i = 0; i < tabs.length; i++) {
    await tap(S, '.dk-tab', i);
    await shot(S, 'board_tab' + i);
  }

  // settings — through the hook, not the cog: undocking puts the DOCK prompt over the same corner
  // and the tap landed on it instead, which is a capture that shows the wrong screen.
  await hook(S, 'undock');
  await settle(S, 8);
  await hook(S, 'openSettings', true);
  await settle(S, 8);
  await shot(S, 'settings');
  await hook(S, 'openSettings', false);

  // ── the refusal states ────────────────────────────────────────────────
  // Every screen in this game has to look futuristic when it is saying NO, too: a greyed row with
  // its reason on it is the only refusal this project allows (never a confirm()), so it is the
  // surface most likely to be left looking like a disabled form control.
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&crd=60&tier=1` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await hook(S, 'forceDock');
  await settle(S, 20);
  await tap(S, '.dk-tab', 2);
  await shot(S, 'poor_shop');
  await tap(S, '.dk-tab', 0);
  await shot(S, 'poor_jobs');
  await tap(S, '.dk-tab', 3);
  await shot(S, 'poor_record');
  await evalJSON(S, `(document.querySelector('.dk-body').scrollTop = 99999, 1)`);
  await settle(S, 6);
  await shot(S, 'poor_record_end');

  await close();
}
main().catch(e => { console.error(e); process.exit(1); });
