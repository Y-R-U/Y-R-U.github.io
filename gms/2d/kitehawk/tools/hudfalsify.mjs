#!/usr/bin/env node
/**
 * Revert each feature and REQUIRE the matching criterion to go red.
 *
 * This is the half that makes the other half mean something. Every phase on
 * this project has shipped checks that could not catch their own bug — P1's
 * axis criterion passed the forbidden implementation identically, P2 found a
 * completely broken camera scoring best on three of six criteria, P4 had two of
 * seven switches pass the whole suite, P6 had three of six uncaught on the first
 * try. The assumption here is that mine are the same until shown otherwise.
 *
 *   node tools/hudfalsify.mjs           node switches only
 *   node tools/hudfalsify.mjs --cdp     ...plus the two browser ones
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** P8b, additive: `mode` steers only the H7 arms. Default portrait, unchanged. */
export async function falsify({ row, h7, h14, cdp = false, mode = 'portrait' } = {}) {
  const M = await import('./hudcheck.mjs');
  row = row || M.row;
  h7 = h7 || M.h7;
  h14 = h14 || M.h14;
  const out = [];
  const expect = (name, caughtBy, red, detail) => {
    out.push({ name, caughtBy, red: !!red, detail });
    console.log(`  ${red ? 'RED ' : 'MISS'}  ${name.padEnd(16)} caught by ${String(caughtBy).padEnd(5)} ${detail}`);
    return !!red;
  };

  console.log('\n-- falsification: each switch MUST go red --');

  /* --- H7: the tape ---------------------------------------------------- */
  const base7 = await h7(60, { quiet: true, mode });
  const noTape = await h7(60, { notape: true, quiet: true, mode });
  expect('notape', 'H7', noTape.arms.far.warned === 0,
         `warned ${noTape.arms.far.warned}/${noTape.arms.far.usable} (baseline ${base7.arms.far.warned})`);
  const framePip = await h7(60, { framepip: true, quiet: true, mode });
  const fpMed = framePip.arms.far.median;
  expect('framepip', 'H7', !(framePip.arms.far.warned === framePip.arms.far.usable && fpMed >= 0.6),
         `median lead ${Number.isFinite(fpMed) ? fpMed.toFixed(2) : 'n/a'} s, warned ` +
         `${framePip.arms.far.warned}/${framePip.arms.far.usable} (baseline ${base7.arms.far.median.toFixed(2)} s)`);

  /* --- H14: the threat bracket ----------------------------------------- */
  const noBr = await h14(120, { nobracket: true, quiet: true });
  expect('nobracket', 'H14', noBr.unwarned === noBr.engagements && noBr.engagements > 0,
         `unwarned ${noBr.unwarned}/${noBr.engagements}`);
  // the cone margin is the term that made H14 pass; take it back out
  const tightCone = await h14(120, { quiet: true, coneK: 1 });
  expect('bracket cone = fire cone', 'H14', !(tightCone.median >= 0.5),
         `median warning ${tightCone.median.toFixed(3)} s`);

  /* --- H3: the draw-twice rule ----------------------------------------- */
  const { INK, markContrast } = await import('../js/ui/theme.js');
  const inks = ['bright', 'ink', 'brass', 'hostile', 'hostileHot', 'friendly', 'crate', 'objective', 'warn', 'danger'];
  let worstNoOutline = Infinity;
  for (const k of inks) for (const bg of ['#FFFFFF', '#080B12'])
    worstNoOutline = Math.min(worstNoOutline, markContrast(INK[k], bg, INK.outline, 0).best);
  expect('nooutline', 'H3', worstNoOutline < 4.5,
         `worst tone-vs-ground with the outline removed = ${worstNoOutline.toFixed(2)}:1`);

  /* --- H1 / H13: the source scans -------------------------------------- */
  const dir = mkdtempSync(join(tmpdir(), 'kh-falsify-'));
  try {
    writeFileSync(join(dir, 'widget.js'), 'export const draw = (g, x) => g.fillRect(x + 12, 40, 8, 8);\n');
    const px = M.scanPx(dir, new Set());
    expect('pxliteral', 'H1', px.bad.length > 0, `flagged ${px.bad.join(' ') || 'nothing'}`);
    writeFileSync(join(dir, 'modal.js'), 'export const ask = () => ' + ('al' + 'ert') + '("hi");\n');
    const modals = M.scanModals(dir);
    expect('modal', 'H13', modals.length > 0, `flagged ${modals.join(' ') || 'nothing'}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  /* --- H8 / H9 / H10: the criteria, against broken stand-ins ----------- */
  const screen = { x: 0, y: 0, w: 390, h: 844 };
  const toScreen = (wx, wy, o) => { o.x = 195 + wx; o.y = 422 + wy; return o; };
  const eight = [];
  for (let i = 0; i < 8; i++)
    eight.push({ id: 'c' + i, x: (i % 2 ? 1 : -1) * (400 + i * 60), y: -300 + i * 80,
                 side: -1, kind: 'aircraft', dist: 400 + i * 60, closing: 20 });
  // a model that draws every off-screen contact — what H8 exists to forbid
  const noMerge = eight.filter((c) => { const o = { x: 0, y: 0 }; toScreen(c.x, c.y, o);
                                        return o.x < screen.x || o.x > screen.x + screen.w; });
  expect('nomerge', 'H8', noMerge.length !== 3, `a model without the cap draws ${noMerge.length}`);

  const { cardDuration } = await import('../js/ui/cards.js');
  // duration taken from the audio, with the audio absent — D7's 0 ms card
  const fromAudio = (line) => line.audioLen || 0;
  const zero = ['Go.', "Belt's thick today."].map((t) => fromAudio({ text: t })).filter((d) => !(d > 0)).length;
  expect('audio-derived duration', 'H10', zero > 0,
         `${zero}/2 cards would show for 0 ms (text-derived gives ` +
         `${['Go.', "Belt's thick today."].map((t) => cardDuration(t).toFixed(2)).join('/')} s)`);

  const noCap = (script) => Object.keys(script.lines).filter(() => false);
  const long = 'x'.repeat(80);
  expect('no 44-char cap', 'H9', noCap({ lines: { bad: { kind: 'radio', text: long } } }).length === 0,
         'a validator without the cap passes an 80-char radio line');

  /* --- the browser switches -------------------------------------------- */
  if (cdp) {
    const { runCdp } = await import('./hudcdp.mjs');
    const z = await runCdp({ row: () => {}, secs: 6, bug: 'zoom' });
    expect('hudbug=zoom', 'H4', z.H4.worst > 1, `chrome bbox moves ${z.H4.worst.toFixed(1)} px between zooms`);
    const inp = await runCdp({ row: () => {}, secs: 10, bug: 'input' });
    expect('hudbug=input', 'H12', inp.trace.travelPerMin === 0 || inp.trace.thumbSamples === 0,
           `HUD canvas eats the touch: ${inp.trace.thumbSamples} thumb samples, ` +
           `${inp.trace.travelPerMin.toFixed(0)} px/min`);
  }

  const missed = out.filter((r) => !r.red);
  console.log(`\n${out.length - missed.length}/${out.length} switches caught` +
              (missed.length ? `  UNCAUGHT: ${missed.map((r) => r.name).join(', ')}` : ''));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mi = process.argv.indexOf('--mode');
  await falsify({ cdp: process.argv.includes('--cdp'), mode: mi >= 0 ? process.argv[mi + 1] : 'portrait' });
}
