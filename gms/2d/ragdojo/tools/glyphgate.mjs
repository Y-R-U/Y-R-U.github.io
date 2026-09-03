#!/usr/bin/env node
/**
 * The gesture hints must show the gesture.
 *
 * Two real bugs live here, and neither was visible from the game's state:
 *   - `drawCoach` was written and never called. `match.coach` was correct every frame and
 *     nothing drew it, so a state-only assertion passed while the screen was empty.
 *   - `ink.jitterPath` mis-carried its sample spacing across segments shorter than the step,
 *     so a finely sampled path emitted ONE sample and `stroke` drew first-point-to-last.
 *     Every arc and circle glyph rendered as a straight dash.
 * So this gate measures PIXELS: it strokes each glyph the way the game does and checks the
 * ink actually bulges away from the straight line between its endpoints.
 *
 *   node tools/glyphgate.mjs
 *   node tools/glyphgate.mjs --falsify   # measure a straight line as if it were the arch
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const falsify = process.argv.includes('--falsify');
const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const srv = await serveWithUpload();
const c = await CDP.launch();
try {
  await c.viewport(844, 390, 2, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&level=0`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);

  // ── the glyph is the stroke you draw, and nothing else ────────────────────
  const shape = await c.eval(`(async()=>{
    const { GLYPH_PATH, glyphStart } = await import('/js/gestures.js');
    const out = {};
    for (const id in GLYPH_PATH) {
      const p = GLYPH_PATH[id];
      // An arrowhead is a barb: the path doubles back on itself near the end.
      let reversal = 0;
      for (let i = 1; i < p.length - 1; i++) {
        const ax = p[i][0]-p[i-1][0], ay = p[i][1]-p[i-1][1];
        const bx = p[i+1][0]-p[i][0], by = p[i+1][1]-p[i][1];
        const la = Math.hypot(ax,ay)||1, lb = Math.hypot(bx,by)||1;
        const cos = (ax*bx+ay*by)/(la*lb);
        if (cos < -0.35) reversal++;
      }
      out[id] = { n: p.length, reversal, start: glyphStart(id), first: p[0] };
    }
    return JSON.stringify(out);
  })()`);
  const S = JSON.parse(shape);
  const barbed = Object.entries(S).filter(([id, v]) => id !== 'vee' && v.reversal > 0).map(([id]) => id);
  ok('no glyph draws an arrowhead', barbed.length === 0, barbed.join(', ') || 'none');
  for (const id of ['slash', 'up', 'down', 'right']) {
    ok(`${id} is exactly the line you swipe`, S[id].n === 2, `${S[id].n} points`);
  }
  ok('every glyph names where the finger goes down',
     Object.values(S).every((v) => v.start[0] === v.first[0] && v.start[1] === v.first[1]));

  // ── rendered ink, not path data: does the stroke actually curve? ──────────
  // AT THE SIZES THE GAME ACTUALLY DRAWS THEM. The carry bug only bites when a path's
  // segments are shorter than the sample step, so a big test render hides it completely:
  // the arch is 24 segments, which is 5px each at 200px wide and 1.9px each on the strip.
  const bulges = await c.eval(`(async()=>{
    const { glyphPoints } = await import('/js/gestures.js');
    const { stroke } = await import('/js/ink.js');
    const R = {};
    const SIZES = { strip: 46 * 0.52, shop: 62 * 0.42 };   // ui.js drawMoveStrip, shop.js drawGlyph
    for (const id of ['slash','up','down','right','vee','archUp','circleCW','circleCCW']) {
      for (const where in SIZES) {
        const s = SIZES[where], box = 120;
        const cv = document.createElement('canvas'); cv.width = cv.height = box;
        const g = cv.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0,0,box,box);
        const src = ${falsify} && id === 'archUp' ? [[-0.55,0.18],[0.55,0.18]] : glyphPoints(id, 34, 1);
        const pts = src.map(([x,y]) => [box/2 + x*s, box/2 + y*s]);
        stroke(g, pts, { w: 3, passes: 1, wob: 0, seed: 5, col: '#000', a: 1, step: 5 });
        const d = g.getImageData(0,0,box,box).data;
        const a = pts[0], b = pts[pts.length-1];
        const vx = b[0]-a[0], vy = b[1]-a[1], L = Math.hypot(vx,vy) || 1;
        let far = 0, inked = 0;
        for (let y=0; y<box; y++) for (let x=0; x<box; x++) {
          if (d[(y*box+x)*4] > 120) continue;            // not ink
          inked++;
          const dist = L > 1 ? Math.abs((x-a[0])*vy - (y-a[1])*vx) / L
                             : Math.hypot(x-a[0], y-a[1]);   // closed shapes have no chord
          if (dist > far) far = dist;
        }
        // As a fraction of the glyph's own size, so the two render scales share a threshold.
        R[id + '@' + where] = { far: +(far / s).toFixed(2), inked };
      }
    }
    return JSON.stringify(R);
  })()`);
  const B = JSON.parse(bulges);
  log('  bulge as a fraction of glyph size: ' + Object.entries(B).map(([k, v]) => `${k} ${v.far}`).join(', '));
  for (const where of ['strip', 'shop']) {
    ok(`the arch renders as an arch on the ${where}`, B[`archUp@${where}`].far > 0.35,
       `${B[`archUp@${where}`].far} of its own size off the chord`);
    ok(`the vee renders as a vee on the ${where}`, B[`vee@${where}`].far > 0.5, `${B[`vee@${where}`].far}`);
    for (const id of ['circleCW', 'circleCCW']) {
      const v = B[`${id}@${where}`];
      ok(`${id} renders as a circle on the ${where}`, v.far > 0.8 && v.inked > 90, JSON.stringify(v));
    }
    for (const id of ['slash', 'up', 'down', 'right']) {
      ok(`${id} renders straight on the ${where}`, B[`${id}@${where}`].far < 0.2, `${B[`${id}@${where}`].far}`);
    }
  }

  // ── the first-run prompt has to reach the screen ──────────────────────────
  const coachBlue = `(()=>{const cv=document.getElementById('game');const g=cv.getContext('2d');
    const x=Math.round(cv.width*0.5);
    const d=g.getImageData(x,0,cv.width-x,cv.height).data; let n=0;
    for(let i=0;i<d.length;i+=4) if(d[i]<110 && d[i+1]>70 && d[i+1]<150 && d[i+2]>160) n++;
    return n;})()`;
  await c.eval(`window.__ragdojo.match.playerStrike()`);
  await c.frames(6);
  await c.eval(`window.__ragdojo.match.introT = 0; window.__ragdojo.match.brains.length = 0`);
  await c.frames(14);
  ok('the gesture prompt says what to do with a finger',
     (await c.eval(`window.__ragdojo.match.coach.text`)) === 'SWIPE DIAGONALLY UP');
  ok('and it demonstrates the gesture rather than naming it',
     (await c.eval(`window.__ragdojo.match.coach.demo`)) === 'slash');
  const withCoach = await c.eval(coachBlue);
  ok('the prompt is actually ON SCREEN', withCoach > 60, `${withCoach} prompt-blue pixels`);

  await c.waitFor(`!window.__ragdojo.match.player.attack`, 5000);
  await c.eval(`window.__ragdojo.match.playerSpecial('power')`);
  await c.frames(14);
  const without = await c.eval(coachBlue);
  ok('and it goes away once you have done it', without < withCoach / 3, `${withCoach} -> ${without}`);

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 4).join('\n')}` : '\nno console errors');
  if (c.errors.length) fail++;
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
