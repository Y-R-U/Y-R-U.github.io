#!/usr/bin/env node
// tools/cap_s2e.mjs — the S2-E capture pass. Every new screen, portrait and landscape, so they can
// be LOOKED AT rather than reported on.
//
//   node tools/cap_s2e.mjs                 # portrait 390x844
//   node tools/cap_s2e.mjs --land          # landscape 844x390
//   node tools/cap_s2e.mjs --only=intro
//
// Shots land in shots/s2e/ (gitignored, like every other render).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const TAG = LAND ? 'land' : 'port';
const ONLY = args.only || null;
const OUT = resolve(ROOT, 'shots/s2e');

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = resolve(OUT, `${name}_${TAG}.png`);
  writeFileSync(p, Buffer.from(data, 'base64'));
  console.log(`  → shots/s2e/${name}_${TAG}.png`);
  return p;
}

async function session(url) {
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}${url}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  return { S, close };
}

mkdirSync(OUT, { recursive: true });

// ── the cutscene ───────────────────────────────────────────────────────────
if (!ONLY || ONLY === 'intro') {
  console.log(`intro ${W}x${H}`);
  const { S, close } = await session('/index.html?nosave=1&intro=1');
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 8);
  await shot(S, 'intro_name');
  // The name/gender pick, then the pull-out, then the Boss.
  await hook(S, 'introName', 'VANE', 'f');
  await settle(S, 6);
  // The beat clock is DERIVED, not eyeballed: the pull-out is 3.4 s and every hold is in
  // storyui.js's SCRIPT, so each capture below names the moment it is aiming at. The first pass
  // guessed and landed `intro_cut` on a Boss beat with no interjection on screen at all — which
  // is a screenshot of the thing this scene exists to show, taken 0.4 s after it stopped.
  await hook(S, 'introStep', 1.7);          // mid pull-out
  await settle(S, 4);
  await shot(S, 'intro_pullout');
  await hook(S, 'introStep', 2.2);          // 3.9 — the Boss's first line
  await settle(S, 4);
  await shot(S, 'intro_boss');
  // 17.0 total = 13.6 into the Boss = 1.4 s after "But—" started and 0.4 s after he cut it off.
  // Both boxes are up; his is the one still going.
  await hook(S, 'introStep', 13.1);
  await settle(S, 4);
  await shot(S, 'intro_cut');
  // The script's holds sum to 33.4 s, but `introStep` advances in 0.5 s chunks and DISCARDS the
  // overshoot at every beat boundary, so ten beats can cost up to 5 s more than the sum. 37.5 landed
  // on the Boss's last line rather than on the crew leaving; 27 more gets clear of the worst case.
  await hook(S, 'introStep', 27.0);         // the crew breaking formation
  await settle(S, 4);
  await shot(S, 'intro_leave');
  await hook(S, 'introStep', 6.0);          // the closing monologue
  await settle(S, 4);
  await shot(S, 'intro_close');
  console.log('  intro state:', JSON.stringify(await evalJSON(S, '__state.intro')));
  await close();
}

// ── the warmth gauge, at three pace settings, in both views ────────────────
if (!ONLY || ONLY === 'warmth') {
  console.log(`warmth ${W}x${H}`);
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=8000');
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  for (const [name, t, rate] of [['cool', 600, 26], ['pace', 1800, 9.9], ['hot', 3600, 3.0]]) {
    await hook(S, 'setStoryTime', t);
    await hook(S, 'setStoryRate', rate);
    await settle(S, 30);            // the display filter has an 8 s constant; let it arrive
    await shot(S, `warm_cockpit_${name}`);
    console.log(`  ${name}:`, JSON.stringify(await evalJSON(S,
      '({w:__state.story.warmth, shown:__state.story.shown, ratio:__state.story.ratio})')));
  }
  await hook(S, 'toggleView');
  await settle(S, 20);
  await shot(S, 'warm_chase_hot');
  await close();
}

// ── the hire panel, both modes ─────────────────────────────────────────────
if (!ONLY || ONLY === 'hire') {
  console.log(`hire ${W}x${H}`);
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=12000');
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await hook(S, 'hire', 'wisp', 1);
  await settle(S, 6);
  await hook(S, 'openHire', 'extend');
  await settle(S, 6);
  await shot(S, 'hire_extend');
  await hook(S, 'closeHire');
  await hook(S, 'expireHire');
  await settle(S, 20);
  await hook(S, 'openHire', 'extend');
  await settle(S, 6);
  await shot(S, 'hire_lapsed');
  await close();
}

// ── both endings, and the grounded hire that follows ───────────────────────
if (!ONLY || ONLY === 'ending') {
  for (const branch of ['paid', 'seized']) {
    console.log(`ending ${branch} ${W}x${H}`);
    const { S, close } = await session(`/index.html?nosave=1&intro=0&story=${branch}&crd=${branch === 'paid' ? 62000 : 4000}`);
    await evalJSON(S, '(window.__game.clearToasts(), 1)');
    await hook(S, 'forceDock', 0);
    await settle(S, 10);
    await shot(S, `ending_${branch}`);
    console.log(`  ${branch}:`, JSON.stringify(await evalJSON(S,
      '({branch:__state.story.branch, credits:__state.credits, flags:__state.flags, grounded:__state.story.grounded})')));
    await hook(S, 'closeEnding');
    await settle(S, 8);
    await shot(S, `ending_${branch}_hire`);
    await close();
  }
}

console.log('done');
