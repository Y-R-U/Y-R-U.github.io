#!/usr/bin/env node
/**
 * The player's name written into event art (js/events/overlay.js), in the real game in Chrome:
 *   - the composed picture differs from the raw art inside the name box and nowhere else;
 *   - a long name stays inside the box, shrinks no smaller than 1/9 of it, then gets cut;
 *   - "lines" layout fits every line across the box;
 *   - opening the square over the box shows the name (the panel draws the composed picture);
 *   - the guess choices do not depend on the name;
 *   - a Hindi name (नमस्ते) survives intact: combining marks kept, stacked by grapheme.
 * The art comes from a real arena server, a tile per opened square (server/eventart.go), so the
 * gate opens the three squares under the box (8, 13, 18) and compares inside them only.
 *
 *   node tools/overlaygate.mjs            (OVERLAY_TEST_PORT, default 9540)
 *   node tools/overlaygate.mjs --falsify  5 mutants, each must go red
 */
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
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
  for (const d of ['js', 'css', 'dev', 'server']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  cpSync(join(ROOT, 'index.html'), join(dir, 'index.html'));
  mkdirSync(join(dir, 'assets/events'), { recursive: true });
  mkdirSync(join(dir, 'art'));
  for (const a of ['audio', 'fonts']) { try { symlinkSync(join(ROOT, 'assets', a), join(dir, 'assets', a)); } catch {} }
  const ev = eventIdOf(defById('reveal-week'), windowOf(defById('reveal-week'), Date.now()));
  // The raw picture sits outside the served game (as on the real site); the page reads it only
  // through the arena server's tiles. The gate's copy at /gate/raw.jpg is for comparison.
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', '-z', '640', '1024', join(ROOT, '../../../assets/screenshots/ragdojo.jpg'), '--out', join(dir, 'art', ev.replace(/[^A-Za-z0-9-]+/g, '-') + '.jpg')], { stdio: 'ignore' });
  mkdirSync(join(dir, 'gate'));
  cpSync(join(dir, 'art', ev.replace(/[^A-Za-z0-9-]+/g, '-') + '.jpg'), join(dir, 'gate/raw.jpg'));
  writeFileSync(join(dir, 'art/answers.json'), JSON.stringify({ answers: { [ev]: 'A KITE' } }));
  writeFileSync(join(dir, 'assets/events/manifest.json'), JSON.stringify({ v: 1, pictures: { [ev]: {
    w: 1024, h: 640, choices: ['A TEA PARTY', 'A CANOE', 'A SUMO MATCH', 'A KITE'], overlay: OV } } }));
  return { dir, ev };
}

async function arena(dir) {
  const bin = process.env.ARENA_BIN || join(dir, 'arena');
  if (!process.env.ARENA_BIN) execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(dir, 'server'), stdio: 'inherit' });
  const proc = spawn(bin, [], { env: { ...process.env, ARENA_ADDR: `127.0.0.1:${P0 + 1}`, ARENA_DB: join(dir, 'a.db'), ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
    ARENA_ENTITLEMENT_URL: 'off', ARENA_DEV_AUTH: '1', ARENA_EVENT_ANSWERS: join(dir, 'art/answers.json'), ARENA_EVENT_ART: join(dir, 'art') }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${P0 + 1}/gms/2d/ragdojo/arena`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await sleep(100); }
  return { proc, base };
}
const BOX_CELLS = [8, 13, 18];

async function run(dir, ev, label = '') {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${label}${n}${x && !c ? '  ' + x : ''}`); };
  const web = await serve(dir, P0);
  const srv = await arena(dir);
  const c = await CDP.launch();
  let n = 0;
  try {
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.viewport(844, 390, 1, true);
    // Each name is a fresh player: three fights (60 s apart, the campaign cap), three squares.
    const boot = async (name) => {
      const url = `${web.base}/index.html?auto=1&dpr=1&arena=${encodeURIComponent(srv.base)}&arenauid=ovl${n++}`;
      await c.goto(url);
      await c.eval(`localStorage.clear(); localStorage.setItem('ragdojo.arena.name', ${JSON.stringify(name)})`);
      await c.goto(url);
      await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
      await c.eval(`document.getElementById('btnEvents').click()`);
      await c.eval(`window.__events.setTab(${JSON.stringify(ev)})`);
      for (const k of [0, 1, 2]) await c.eval(`window.dispatchEvent(new CustomEvent('ragdojo:battle',{detail:{at:Date.now()-${(3 - k) * 70e3},src:'campaign',won:false,oppDmg:0}}))`);
      if (!await c.waitFor(`window.__events.artOn(${JSON.stringify(ev)}) && window.__events.state.ev[${JSON.stringify(ev)}]?.b.length === 3`, 8000)) return false;
      for (const cell of BOX_CELLS) await c.eval(`window.__events.uncover(${cell})`);
      return c.waitFor(`window.__events.arts.get(${JSON.stringify(ev)})?.have.size === 3 && window.__events.picture(${JSON.stringify(ev)})`, 8000);
    };
    ok('the approved picture loads', await boot('AARON'));
    // Served tiles vs composed, counted in and out of the box (8 px margin for the pen's wobble).
    const diff = (margin) => c.eval(`(()=>{
      const pic = window.__events.picture(${JSON.stringify(ev)}), im = new Image();
      const W = 1024, H = 640, a = document.createElement('canvas'), b = document.createElement('canvas');
      a.width = b.width = W; a.height = b.height = H;
      const ga = a.getContext('2d'), gb = b.getContext('2d');
      gb.drawImage(pic, 0, 0, W, H);
      const raw = [...document.images].find(() => false);
      return new Promise((res) => { im.onload = () => {
        // The tiles as served, before the name: the only difference left is the pen.
        ga.drawImage(window.__events.arts.get(${JSON.stringify(ev)}).c, 0, 0, W, H);
        const A = ga.getImageData(0, 0, W, H).data, B = gb.getImageData(0, 0, W, H).data;
        const o = ${JSON.stringify(OV)}, x0 = o.x * W - ${margin}, x1 = (o.x + o.w) * W + ${margin}, y0 = o.y * H - ${margin}, y1 = (o.y + o.h) * H + ${margin};
        let inside = 0, outside = 0;
        const opened = (x, y) => [${BOX_CELLS}].includes(Math.floor(y / (H / 5)) * 5 + Math.floor(x / (W / 5)));
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!opened(x, y)) continue;
          const i = (y * W + x) * 4, d = Math.abs(A[i] - B[i]) + Math.abs(A[i+1] - B[i+1]) + Math.abs(A[i+2] - B[i+2]);
          if (d > 30) (x >= x0 && x < x1 && y >= y0 && y < y1) ? inside++ : outside++;
        }
        res({ inside, outside });
      }; im.src = 'gate/raw.jpg'; });
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
      im.src = 'gate/raw.jpg';
    })`);
    ok('the opened square shows the name (matches the composed picture, not the raw art)', shown.composed < 6 && shown.raw > shown.composed + 4, JSON.stringify(shown));
    ok('the full picture is never in the page\'s own files', !(await c.eval(`fetch('assets/events/manifest.json').then(r=>r.text())`)).match(/jpg|webp|img/));

    // A Hindi name: NFC, combining marks kept, stacked by grapheme (never a bare vowel sign).
    const HINDI = 'नमस्ते';
    ok('a Hindi name loads', await boot(HINDI));
    const hi = await c.eval(`import('./js/events/overlay.js').then(({ cleanName, layoutOverlay }) => {
      const g = document.createElement('canvas').getContext('2d');
      const L = layoutOverlay(g, ${JSON.stringify(OV)}, ${JSON.stringify(HINDI.normalize('NFD'))}, 200, 288);
      return { name: cleanName(${JSON.stringify(HINDI)}), items: L.items, bare: L.items.some((s) => /^\\p{M}/u.test(s)) };
    })`);
    ok('the Hindi name survives cleanName intact', hi.name === HINDI, JSON.stringify(hi));
    ok('stacked by grapheme: the letters join back to the name, none starts with a mark', hi.items.join('') === HINDI && !hi.bare && hi.items.length < [...HINDI].length, JSON.stringify(hi));
    const d3 = await diff(8);
    ok('the Hindi name is written inside the box', d3.inside > 300 && d3.outside === 0, JSON.stringify(d3));
    ok('zero console errors', c.errors.length === 0, c.errors.join(' | '));
  } catch (e) { ok('no exception', false, e.stack); }
  finally { c.chrome.kill('SIGKILL'); web.close(); srv.proc.kill('SIGKILL'); }
  return { pass, fail };
}

const MUTANTS = [
  ['the panel draws the raw art, not the composed one', 'js/events/ui.js', '    if (!a.overlay) return A.c;\n', '    return A.c;\n'],
  ['names lose their combining marks', 'js/events/overlay.js', '[^\\p{L}\\p{M}\\p{N}', '[^\\p{L}\\p{N}'],
  ['stacked by code point, not grapheme', 'js/events/overlay.js', "let letters = graphemes(text.replace(/\\s+/g, ''));", "let letters = [...text.replace(/\\s+/g, '')];"],
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
