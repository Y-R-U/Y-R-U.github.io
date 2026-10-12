#!/usr/bin/env node
/**
 * The player's name written into event art (js/events/overlay.js), in the real game in Chrome:
 *   - the composed picture differs from the raw art inside the name box and nowhere else;
 *   - a long name stays inside the box, shrinks no smaller than 1/9 of it, then gets cut;
 *   - "lines" layout fits every line across the box;
 *   - opening the square over the box shows the name (the panel draws the composed picture);
 *   - the guess choices do not depend on the name.
 *
 *   node tools/overlaygate.mjs            (OVERLAY_TEST_PORT, default 9540)
 *   node tools/overlaygate.mjs --falsify  3 mutants, each must go red
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, symlinkSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CDP, ROOT, serve } from './cdp.mjs';
import { defById, windowOf, eventIdOf } from '../js/events/calendar.js';

const P0 = +(process.env.OVERLAY_TEST_PORT || 9540);
const log = (m) => process.stderr.write(m + '\n');
const OV = { x: 0.6, y: 0.2, w: 0.2, h: 0.45, rot: 0, text: '{NAME}', layout: 'stack' };

function gameCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'overlaygate-'));
  for (const d of ['js', 'css', 'dev']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  cpSync(join(ROOT, 'index.html'), join(dir, 'index.html'));
  mkdirSync(join(dir, 'assets/events'), { recursive: true });
  for (const a of ['audio', 'fonts']) { try { symlinkSync(join(ROOT, 'assets', a), join(dir, 'assets', a)); } catch {} }
  const ev = eventIdOf(defById('reveal-week'), windowOf(defById('reveal-week'), Date.now()));
  execFileSync('sips', ['-s', 'format', 'png', '-z', '640', '1024', join(ROOT, '../../../assets/screenshots/ragdojo.jpg'), '--out', join(dir, 'src.png')], { stdio: 'ignore' });
  execFileSync('cwebp', ['-quiet', '-q', '80', join(dir, 'src.png'), '-o', join(dir, 'assets/events/pic.webp')]);
  writeFileSync(join(dir, 'assets/events/manifest.json'), JSON.stringify({ v: 1, pictures: { [ev]: {
    img: 'pic.webp', jpg: 'pic.jpg', w: 1024, h: 640, choices: ['A TEA PARTY', 'A PAPER NINJA', 'A SUMO MATCH', 'A KITE'], overlay: OV } } }));
  return { dir, ev };
}

async function run(dir, ev, label = '') {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${label}${n}${x && !c ? '  ' + x : ''}`); };
  const web = await serve(dir, P0);
  const c = await CDP.launch();
  try {
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.viewport(844, 390, 1, true);
    const boot = async (name) => {
      await c.goto(`${web.base}/index.html?auto=1&dpr=1&arena=http://127.0.0.1:1/x`);
      await c.eval(`localStorage.setItem('ragdojo.arena.name', ${JSON.stringify(name)})`);
      await c.goto(`${web.base}/index.html?auto=1&dpr=1&arena=http://127.0.0.1:1/x`);
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await c.eval(`document.getElementById('btnEvents').click()`);
      await c.eval(`window.__events.setTab(${JSON.stringify(ev)})`);
      return c.waitFor(`window.__events.picture(${JSON.stringify(ev)})`, 8000);
    };
    ok('the approved picture loads', await boot('AARON'));
    // Raw vs composed, counted in and out of the box (8 px margin for the pen's wobble).
    const diff = (margin) => c.eval(`(()=>{
      const pic = window.__events.picture(${JSON.stringify(ev)}), im = new Image();
      const W = 1024, H = 640, a = document.createElement('canvas'), b = document.createElement('canvas');
      a.width = b.width = W; a.height = b.height = H;
      const ga = a.getContext('2d'), gb = b.getContext('2d');
      gb.drawImage(pic, 0, 0, W, H);
      const raw = [...document.images].find(() => false);
      return new Promise((res) => { im.onload = () => {
        ga.drawImage(im, 0, 0, W, H);
        const A = ga.getImageData(0, 0, W, H).data, B = gb.getImageData(0, 0, W, H).data;
        const o = ${JSON.stringify(OV)}, x0 = o.x * W - ${margin}, x1 = (o.x + o.w) * W + ${margin}, y0 = o.y * H - ${margin}, y1 = (o.y + o.h) * H + ${margin};
        let inside = 0, outside = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, d = Math.abs(A[i] - B[i]) + Math.abs(A[i+1] - B[i+1]) + Math.abs(A[i+2] - B[i+2]);
          if (d > 30) (x >= x0 && x < x1 && y >= y0 && y < y1) ? inside++ : outside++;
        }
        res({ inside, outside });
      }; im.src = 'assets/events/pic.webp'; });
    })()`);
    const d1 = await diff(8);
    ok('the name is written inside the box', d1.inside > 800, JSON.stringify(d1));
    ok('nothing is written outside the box', d1.outside === 0, JSON.stringify(d1));
    const choices = await c.eval(`[...document.querySelectorAll('[data-guess]')].map(b => b.dataset.guess).join('|')`);

    // A long name: still inside, shrunk no further than 1/9 of the box, then cut.
    ok('a long name loads', await boot('MAXIMILIANA JOSEPHINE-LONGNAME'));
    const d2 = await diff(8);
    ok('a long name stays inside the box', d2.inside > 400 && d2.outside === 0, JSON.stringify(d2));
    const lay = await c.eval(`import('./js/events/overlay.js').then(({ layoutOverlay }) => {
      const g = document.createElement('canvas').getContext('2d'), h = ${OV.h} * 640, w = ${OV.w} * 1024;
      const L = layoutOverlay(g, ${JSON.stringify(OV)}, 'MAXIMILIANA JOSEPHINE-LONGNAME', w, h);
      const S = layoutOverlay(g, { ...${JSON.stringify(OV)}, layout: 'lines', text: "{NAME}'S\\nDOJO" }, 'MAXIMILIANA JOSEPHINE-LONGNAME', w, h);
      g.font = '700 ' + S.size + 'px "Caveat", cursive';
      return { n: L.items.length, size: L.size, min: h / 9, lines: S.items, fits: S.items.every((s) => { g.font = '700 ' + S.size + 'px "Caveat", cursive'; return g.measureText(s).width <= w * 0.93; }) };
    })`);
    ok('stacked: letters no smaller than 1/9 of the box, so the name is cut', lay.size >= lay.min - 0.01 && lay.n < 28, JSON.stringify(lay));
    ok('lines: every line fits across the box', lay.fits && lay.lines.length === 2, JSON.stringify(lay));
    ok('the guess choices do not depend on the name', choices === await c.eval(`[...document.querySelectorAll('[data-guess]')].map(b => b.dataset.guess).join('|')`), choices);

    // Opening the square under the box shows the composed picture there, not the raw art.
    await c.eval(`window.dispatchEvent(new CustomEvent('ragdojo:battle',{detail:{at:Date.now(),src:'campaign',won:true,oppDmg:1}}))`);
    const cell = Math.floor((OV.y + OV.h / 2) * 5) * 5 + Math.floor((OV.x + OV.w / 2) * 5);
    await c.eval(`window.__events.uncover(${cell})`);
    await c.frames(6);
    const shown = await c.eval(`new Promise((res) => {
      const cv = document.getElementById('evCanvas'), r = window.__events.rview.r, dpr = cv.width / cv.clientWidth;
      const pic = window.__events.picture(${JSON.stringify(ev)}), im = new Image();
      im.onload = () => {
        const cw = r.w / 5, ch = r.h / 5, cx = r.x + (${cell} % 5) * cw, cy = r.y + Math.floor(${cell} / 5) * ch;
        const grab = (src) => { const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const g = t.getContext('2d');
          if (src) { g.scale(dpr, dpr); g.drawImage(src, r.x, r.y, r.w, r.h); } else g.drawImage(cv, 0, 0);
          return g.getImageData(Math.round((cx + 4) * dpr), Math.round((cy + 4) * dpr), Math.round((cw - 8) * dpr), Math.round((ch - 8) * dpr)).data; };
        const S = grab(null), C = grab(pic), R = grab(im);
        let dc = 0, dr = 0;
        for (let i = 0; i < S.length; i += 4) { dc += Math.abs(S[i] - C[i]); dr += Math.abs(S[i] - R[i]); }
        res({ composed: dc / (S.length / 4), raw: dr / (S.length / 4) });
      };
      im.src = 'assets/events/pic.webp';
    })`);
    ok('the opened square shows the name (matches the composed picture, not the raw art)', shown.composed < 6 && shown.raw > shown.composed + 4, JSON.stringify(shown));
    ok('zero console errors', c.errors.length === 0, c.errors.join(' | '));
  } catch (e) { ok('no exception', false, e.stack); }
  finally { c.chrome.kill('SIGKILL'); web.close(); }
  return { pass, fail };
}

const MUTANTS = [
  ['the panel draws the raw art, not the composed one', 'js/events/ui.js', '    if (!a.overlay) return e.im;\n', '    return e.im;\n'],
  ['no minimum letter size (a long name shrinks to dust)', 'js/events/overlay.js', '    if (size < min) { letters', '    if (false) { letters'],
  ['lines are not shrunk to the box width', 'js/events/overlay.js', '  for (const s of lines) size = Math.min(size, size * (w * 0.92) / Math.max(1, width(s, size)));\n', ''],
];
if (process.argv.includes('--falsify')) {
  let red = 0;
  for (const [what, file, from, to] of MUTANTS) {
    const { dir, ev } = gameCopy();
    const src = readFileSync(join(dir, file), 'utf8');
    if (!src.includes(from)) { log(`MUTANT MISSED: ${what}`); rmSync(dir, { recursive: true, force: true }); continue; }
    writeFileSync(join(dir, file), src.replace(from, to));
    log(`\n── mutant: ${what}`);
    const r = await run(dir, ev, '[mut] ');
    rmSync(dir, { recursive: true, force: true });
    log(r.fail ? `RED   ${what}` : `GREEN ${what} — not noticed`);
    if (r.fail) red++;
  }
  log(`\nfalsify: ${red}/${MUTANTS.length} mutants caught`);
  process.exit(red === MUTANTS.length ? 0 : 1);
} else {
  const { dir, ev } = gameCopy();
  const r = await run(dir, ev);
  rmSync(dir, { recursive: true, force: true });
  log(`\n${r.pass} passed, ${r.fail} failed`);
  process.exit(r.fail ? 1 : 0);
}
