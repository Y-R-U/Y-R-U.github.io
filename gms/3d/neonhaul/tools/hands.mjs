#!/usr/bin/env node
// A pair of thumbs on a phone. Boots the REAL game — not a shot scenario — in a phone viewport,
// drives it with real `Input.dispatchTouchEvent` points, and writes a PNG plus whatever the moment
// asked to measure.
//
//   node tools/hands.mjs                       every moment, 390x844
//   node tools/hands.mjs --only=lookup,cog
//   node tools/hands.mjs --w=844 --h=390       landscape
//   node tools/hands.mjs --outdir=/tmp/x
//
// Why this exists: `shot.mjs` renders a FROZEN camera with the DOM control layer suppressed, so it
// can say nothing at all about the two things Aaron keeps finding — where a control ends up under
// a thumb, and what the cabin looks like when you point it somewhere the scenario never points.
// Every S2-L defect was invisible to every gate we had and visible in the first frame here.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, open, waitFor, settle, evalJSON, logs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const W = +(args.w || 390), H = +(args.h || 844);
const OUT = resolve(ROOT, args.outdir || 'shots/hands');

// Chrome takes the FULL set of live points on touchStart/touchMove and an empty list on touchEnd.
function thumbs(S) {
  const live = new Map();
  const all = () => [...live].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const send = (type, pts) => S('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  return {
    async down(id, x, y) { live.set(id, { x, y }); await send('touchStart', all()); },
    async move(id, x, y) { live.set(id, { x, y }); await send('touchMove', all()); },
    async up(id) { live.delete(id); await send('touchEnd', all()); },
    // A drag in `steps` increments, because a single jump reads as one enormous delta and every
    // look filter in controls.js is rate-limited.
    async drag(id, x0, y0, x1, y1, steps = 14, ms = 16) {
      await this.down(id, x0, y0);
      for (let i = 1; i <= steps; i++) {
        await this.move(id, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
        await wait(ms);
      }
      await this.up(id);
    },
    async tap(x, y, hold = 60) { await this.down(9, x, y); await wait(hold); await this.up(9); await wait(120); },
    wait,
  };
}

// What a real finger would hit. Returns the id/class chain of whatever is actually on top, which
// is the only honest answer to "is this button clickable" — a box that exists and is covered
// reports its own rect happily.
const HIT = sel => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return { sel: ${JSON.stringify(sel)}, missing: true };
  const r = e.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const id = n => n ? (n.id ? '#' + n.id : (n.tagName || '?').toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : '')) : 'null';
  let hitsSelf = false;
  for (let n = top; n; n = n.parentElement) if (n === e) { hitsSelf = true; break; }
  return { sel: ${JSON.stringify(sel)}, x: +r.x.toFixed(1), y: +r.y.toFixed(1),
    w: +r.width.toFixed(1), h: +r.height.toFixed(1), cx: +cx.toFixed(1), cy: +cy.toFixed(1),
    top: id(top), hitsSelf,
    vis: getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && r.width > 0 };
})()`;

const MOMENTS = {
  // The view as shipped, with the whole control layer live.
  cockpit: async () => {},
  // Aaron: *"there is a big black bar if i look up, it doesn't look good, have it all glass."*
  lookup: async (S, T) => { await T.drag(1, W * 0.72, H * 0.60, W * 0.72, H * 0.60 + 260); await T.wait(500); },
  lookdown: async (S, T) => { await T.drag(1, W * 0.72, H * 0.60, W * 0.72, H * 0.60 - 200); await T.wait(500); },
  // The comparison Aaron is drawing: *"I almost want the exact same view as chase but dashboard."*
  chase: async (S, T) => { const b = await evalJSON(S, HIT('#btn-view')); if (b.vis) await T.tap(b.cx, b.cy); await T.wait(700); },
  // *"settings is unclickable… cog… i can't click on it at all?"*
  cog: async (S, T) => { const b = await evalJSON(S, HIT('#btn-settings')); if (b.vis) await T.tap(b.cx, b.cy); await T.wait(600); },
  // §S2-L. The other flip state: the lip's two ends swap so the collective stays under the thumb
  // that is not flying. Both states have to be looked at, because the S2-K defect was that a
  // console mirrored the WRONG WAY and was in the flying half in both of them.
  flip: async (S, T) => { await evalJSON(S, '(() => { __game.applySettings({ flipSides: true }); return 1; })()'); await T.wait(400); },
  // §S2-L. A thumb on the stick, held. The frame above the lip is the flying half's whole working
  // area and this is the picture that says whether anything is in it.
  stick: async (S, T) => {
    await T.down(1, W * 0.26, H * 0.62);
    await T.move(1, W * 0.26 + 44, H * 0.62 - 52);
    await T.wait(700);
  },
};

const only = args.only ? String(args.only).split(',') : Object.keys(MOMENTS);
mkdirSync(OUT, { recursive: true });

const ctx = await open({ w: W, h: H, dpr: 2, mobile: true });
const { S, base, close } = ctx;
const report = [];

for (const name of only) {
  if (!MOMENTS[name]) { console.log(`unknown moment "${name}"`); continue; }
  logs.length = 0;
  // ?nosave alone. There is no `nostory` flag — `story` takes a VALUE (due/paid/seized) — so
  // ?nostory=1 parsed to nothing while reading like it did something. ?nosave already skips the
  // cutscene: `intro` is tri-state and defaults to skipped for anything that smells like a harness.
  await S('Page.navigate', { url: `${base}/index.html?nosave` });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 40);
  const T = thumbs(S);
  // One tap to arm audio and clear any opener, then the moment itself.
  await MOMENTS[name](S, T);
  await settle(S, 12);

  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const png = resolve(OUT, `${name}.png`);
  writeFileSync(png, Buffer.from(data, 'base64'));

  const hits = await evalJSON(S, `[${['#btn-settings', '#btn-view', '#btn-auto', '#btn-home', '#btn-squelch', '#btn-boost', '#btn-up', '#btn-down', '#mapcase', '#settings']
    .map(s => HIT(s)).join(',')}]`);
  const st = await evalJSON(S, 'JSON.stringify({view:window.__state&&window.__state.view, err:(window.__state&&window.__state.errors||[]).length})');
  report.push({ moment: name, png, hits, st, logs: logs.slice() });
  const bad = hits.filter(h => h.vis && !h.hitsSelf);
  console.log(`${name}  → ${png}${bad.length ? '   ⚠ covered: ' + bad.map(b => `${b.sel} by ${b.top}`).join(', ') : ''}`);
}

writeFileSync(resolve(OUT, '_hands.json'), JSON.stringify(report, null, 2));
await close();
process.exit(0);
