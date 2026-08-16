#!/usr/bin/env node
// Renders from an arbitrary camera at an arbitrary hour, so a framing can be judged before it is
// worth adding to js/world/demo.js. `y` in --pos and --look is height above the ground at that
// point, matching the scenario convention.
//
//   node tools/eyeshot.mjs --pos=-424,2,-48 --look=-424,4,-108 --time=11 --out=x.png
//
// No perf numbers: the extra render below lands on top of the app's own frame, so renderer.info
// would double-count. Use budget.mjs or callsat.mjs for counts.

import { writeFileSync } from 'node:fs';
import { open, parseArgs, waitFor, settle, evalJSON } from './shot.mjs';

const args = parseArgs();
const W = +(args.w || 1280), H = +(args.h || 720), DPR = +(args.dpr || 1);
const pos = (args.pos || '0,2,60').split(',').map(Number);
const look = (args.look || '0,4,0').split(',').map(Number);

const AIM = `(() => {
  const app = window.__forge.app, T = window.__forge.demo.terrain;
  const p = ${JSON.stringify(pos)}, l = ${JSON.stringify(look)};
  app.camera.position.set(p[0], T.surfaceY(p[0], p[2]) + p[1], p[2]);
  app.camera.lookAt(l[0], T.surfaceY(l[0], l[2]) + l[1], l[2]);
  app.camera.updateMatrixWorld();
  return 1;
})()`;

const { S, base, close } = await open({ w: W, h: H, dpr: DPR });
await S('Page.navigate', { url: `${base}/index.html?shot=street_dusk&preset=${args.preset || 'medium'}&dpr=${DPR}${args.set ? '&' + args.set : ''}` });
await waitFor(S, `window.__forge && window.__forge.ready`, 20000);
await evalJSON(S, `(()=>{
  window.__forge.app.quality.set('time', ${+(args.time || 12)});
  window.__forge.app.quality.set('shadowRate', 'every frame');
  return 1;
})()`);
// aim, settle so the shadow map and the foliage repack catch up, then aim and draw again —
// settling runs the app's own loop, which puts the camera back where the scenario left it
await evalJSON(S, AIM);
await settle(S, 45);
await evalJSON(S, `${AIM} && (window.__forge.app.renderer.render(window.__forge.app.scene, window.__forge.app.camera), 1)`);

const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(args.out || 'eyeshot.png', Buffer.from(data, 'base64'));
await close();
console.log(`→ ${args.out || 'eyeshot.png'}`);
