#!/usr/bin/env node
// §S2-K's gates — the four defect fixes Aaron reported after playing the shipped pass-2 build.
//
//   node tools/gates_s2k.mjs [--headed] [--land] [--w= --h=]
//
// D2  no control button may sit in the FLYING half, in EITHER flipSides state
// D3  the chatter director is silent for the whole of a story beat, and comes back after it
// D1  the shipped chatter and story pools decode, speak, and are the pool the manifest describes
//
// **Every check is falsified in-suite.** D2's falsification physically moves a key back into the
// stick zone and requires the same check to reject it; D3's plays the scene with the suppression
// turned off and requires the same counter to see the lines it missed. A green suite is evidence
// about what it checked and nothing about what it did not — all four of these defects shipped
// through a fully green suite.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, quiesce } from './shot.mjs';

// `evalJSON` wraps its expression in JSON.stringify() BEFORE awaiting, so an async IIFE stringifies
// to "{}" and every field comes back undefined. It did exactly that on D1's first run. Anything
// that awaits inside the page goes through here instead.
async function evalAsyncJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2k');
mkdirSync(OUT, { recursive: true });
const FILE = resolve(OUT, `_gates${LAND ? '_land' : ''}.json`);

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2k/${name}.png`;
}

// ── D2 ─────────────────────────────────────────────────────────────────────
//
// The rule, and it is the router's rule rather than a new one: js/controls.js `half(x)` says
// `left = x < innerWidth/2; role = (left !== flip) ? 'move' : 'look'`. The stick is FLOATING — its
// origin is wherever the finger lands — so the whole of the move half is the thumb zone, not a
// corner of it. #leftpad shipped on the left at mid-height and mirrored WITH the flip, which put
// RADIO / HOME / AUTO in the flying thumb's half in both states.
//
// So the assertion is every visible `.ctl-btn` centre, against the half the router would give it.
// `.ctl-btn.gear` and `.ctl-btn.view` are exempt BY POSITION rather than by name: both sit in the
// top band, above `TOP_BAND` px, where a flight thumb never goes and where the map pod and the view
// switch have always lived. Naming exemptions would let the next control be exempted by adding it
// to a list.
// A control belongs to a THUMB if it mirrors when the movement side is flipped. That is not a
// stylistic observation, it is the layout's own contract: #altpad and #leftpad both mirror because
// they are meant to be reachable by one particular thumb, and #btn-view and the cog do NOT mirror
// because they are corner furniture in the HUD pod (style.css: *"it belongs to the map housing
// now, and the map does not move"*).
//
// So the exemption is derived rather than listed: a control is exempt iff its box is IDENTICAL in
// both flipSides states AND sits entirely in the top half of the viewport. Nothing can be exempted
// by being added to a name list, and the falsification below still fires, because a mirrored key
// moved into the stick zone is still mirrored.
const buttonBoxes = S => evalJSON(S, `(() => {
  // The ROUTER's own truth. js/controls.js applyFlip() writes the flipped class and sets this.flip
  // in the same call, and half() reads this.flip — so this is the value the touch router will
  // actually use. Reading __state.settings.flipSides instead gave a STALE false while the DOM had
  // already mirrored, and the offender list came back describing the wrong half entirely.
  // (No backticks below this line: it is inside a template literal. Fourth time on this project.)
  const flip = document.getElementById('controls').classList.contains('flipped');
  const w = innerWidth, h = innerHeight;
  const out = [];
  for (const el of document.querySelectorAll('#controls .ctl-btn')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;                       // hidden slots are not controls
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    // Its own centre, hit-tested. A control that is on screen and in the right half is still
    // useless if something is sitting on it — in landscape the cog, which does not mirror and so
    // is exempt from the half rule, landed squarely on AUTO and the half check saw nothing wrong.
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    out.push({ id: el.id || el.className,
      x0: Math.round(r.x), x1: Math.round(r.x + r.width),
      y0: Math.round(r.y), y1: Math.round(r.y + r.height),
      self: !!(hit && (hit === el || el.contains(hit))),
      over: hit ? (hit.id || hit.className) : null });
  }
  return { flip, w, h, btns: out };
})()`);

// A button is only clear if its whole BOX is out of the flying half, not just its centre — half a
// key under the thumb is still under the thumb.
function offenders(st, mirrors) {
  const mid = st.w / 2;
  return st.btns.filter(b => {
    const corner = !mirrors.has(b.id) && b.y1 <= st.h / 2;
    if (corner) return false;
    // the move half is the left when flip is false, the right when it is true
    return st.flip ? b.x1 > mid : b.x0 < mid;
  });
}

const setFlip = async (S, v) => {
  await evalJSON(S, `(() => { __game.applySettings({ flipSides: ${v} }); return 1; })()`);
  await settle(S, 6);
};

async function d2(S) {
  await setFlip(S, false);
  const st0 = await buttonBoxes(S);
  await setFlip(S, true);
  const st1 = await buttonBoxes(S);
  const by = st => Object.fromEntries(st.btns.map(b => [b.id, b]));
  const a0 = by(st0), a1 = by(st1);
  const mirrors = new Set(Object.keys(a0).filter(k => a1[k] && a1[k].x0 !== a0[k].x0));

  check('D2 the controls that belong to a thumb are exactly the ones that mirror with the flip',
    mirrors.has('btn-auto') && mirrors.has('btn-home') && mirrors.has('btn-squelch')
      && mirrors.has('btn-boost') && mirrors.has('btn-up') && mirrors.has('btn-down')
      && !mirrors.has('btn-view') && !mirrors.has('btn-settings'),
    `mirrored (thumb controls): ${[...mirrors].join(', ')}\n      `
    + `fixed (HUD corner furniture, exempt): `
    + `${Object.keys(a0).filter(k => !mirrors.has(k)).map(k => `${k} y${a0[k].y0}-${a0[k].y1} of ${st0.h}`).join(', ')}`);

  for (const [flip, st] of [[false, st0], [true, st1]]) {
    const covered = st.btns.filter(b => !b.self);
    check(`D2 every visible control is pressable — nothing is sitting on it — flipSides=${flip}${LAND ? ' landscape' : ''}`,
      covered.length === 0,
      covered.length ? covered.map(b => `${b.id} centre hit-tests to ${b.over}`).join('; ')
        : `all ${st.btns.length} hit-test to themselves at ${st.w}x${st.h}`);
    const bad = offenders(st, mirrors);
    await setFlip(S, flip);
    const png = await shot(S, `controls_flip${flip ? 1 : 0}${LAND ? '_land' : ''}`);
    check(`D2 no control button is in the flying half — flipSides=${flip}${LAND ? ' landscape' : ''}`,
      bad.length === 0 && st.btns.length >= 6 && st.flip === flip,
      `${st.btns.length} visible controls at ${st.w}x${st.h}; flying half is the `
      + `${flip ? 'RIGHT' : 'LEFT'}; offenders ${bad.length ? bad.map(b => `${b.id}@${b.x0}-${b.x1}`).join(', ') : 'none'}`
      + `\n      ${st.btns.map(b => `${b.id}:${b.x0}-${b.x1}`).join('  ')}`
      + `\n      ${png}`);
  }

  // FALSIFICATION. Put one key back where the shipped build had it — the left edge at mid-height —
  // and require the same check to catch it in the flipSides=false state it shipped in.
  await setFlip(S, false);
  const before = offenders(await buttonBoxes(S), mirrors).length;
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-home');
    b.dataset.s2kSaved = b.style.cssText;
    b.style.cssText += ';position:fixed;left:14px;bottom:280px;right:auto;';
    return 1;
  })()`);
  await settle(S, 4);
  const st = await buttonBoxes(S);
  const after = offenders(st, mirrors);
  const png = await shot(S, `falsify_leftpad${LAND ? '_land' : ''}`);
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-home');
    b.style.cssText = b.dataset.s2kSaved || '';
    delete b.dataset.s2kSaved;
    return 1;
  })()`);
  await settle(S, 4);
  const restored = offenders(await buttonBoxes(S), mirrors).length;
  check(`D2 FALSIFY — the check catches a key moved back into the stick zone${LAND ? ' landscape' : ''}`,
    before === 0 && after.length === 1 && after[0].id === 'btn-home' && restored === 0,
    `clean ${before} offenders → HOME forced to the left edge at mid-height → ${after.length} `
    + `(${after.map(b => b.id).join(',') || 'none'}) → restored ${restored}\n      ${png}`);
}

// ── D3 ─────────────────────────────────────────────────────────────────────
//
// The counter is the DIRECTOR's own `fired` totals, taken as a DELTA across a fixed span of radio
// time. Reading absolutes would read the fixture; reading the DOM ticker would miss the background
// layer, which never shows text and is the layer Aaron could hear.
//
// The scene is driven through `radio.setScene()` rather than through the cutscene, because the
// intro needs a fresh profile and a real camera, and what is being tested is the mechanism the
// cutscene calls. The wiring — that startIntro/endIntro actually call it — is asserted separately
// by reading main.js's own source, which is the only way to check a call site without playing the
// scene in a harness that turns the scene off.
const dirFired = S => evalJSON(S, `(() => {
  const r = __game.radioState();
  const d = r && r.director;
  return d ? { fore: d.fired.fore, back: d.fired.back, event: d.fired.event, t: r.t,
    scene: !!r.scene, playing: r.playing } : null;
})()`);

// Wind the radio's own clock forward without waiting on wall time. `update()` takes dt, so a burst
// of large steps is exactly the same code path the game runs — and DIR.FORE_MIN/BACK_MIN mean a
// 90-second span must produce lines when nothing is suppressing them.
const windRadio = (S, seconds, step = 1.5) => evalJSON(S, `(() => {
  const r = __game.radio;
  if (!r) return null;
  const n = Math.round(${seconds} / ${step});
  for (let i = 0; i < n; i++) r.update(${step}, { night: true });
  return n;
})()`);

async function d3(S) {
  // 1. The control arm: with no scene, 90 s of radio time must produce lines. Without this the
  //    zero below would be a zero from a director that never fires at all.
  const a0 = await dirFired(S);
  await windRadio(S, 90);
  const a1 = await dirFired(S);
  const freeLines = (a1.fore - a0.fore) + (a1.back - a0.back);
  check('D3 control — the chatter director fires over 90 s of radio time when nothing suppresses it',
    freeLines > 0,
    `fore +${a1.fore - a0.fore}, back +${a1.back - a0.back} over 90 s; if this is 0 the D3 zero `
    + `below measures nothing`);

  // 2. The scene arm: the same 90 s with the scene latched must produce NOTHING, on either layer.
  await evalJSON(S, '(() => { __game.radio.setScene(true); return 1; })()');
  const b0 = await dirFired(S);
  const mixIn = await evalJSON(S, '(() => __game.audioState())()');
  await windRadio(S, 90);
  const b1 = await dirFired(S);
  const sceneLines = (b1.fore - b0.fore) + (b1.back - b0.back);
  check('D3 the chatter director is silent for the whole of a story beat',
    sceneLines === 0 && b1.scene === true,
    `fore +${b1.fore - b0.fore}, back +${b1.back - b0.back} over the same 90 s with the scene `
    + `latched (control fired ${freeLines})`);

  // 3. The MIX, not only the director. The bed and the music are what "heaps louder than the
  //    speech" was about, and they are separate machinery from the line picker.
  check('D3 the traffic bed and the music take the deeper scene duck, not the dispatch duck',
    mixIn && mixIn.sceneDucked === true,
    `audio.sceneDucked=${mixIn && mixIn.sceneDucked} · net gain heads for MIX.SCENE_NET (0) and `
    + `music for MIX.SCENE_MUSIC (0.16), against the dispatch-line duck of NET_DUCK 0.04 / `
    + `MUSIC_DUCK 0.35`);

  // 4. …and it comes BACK. A suppression with no release is a worse defect than the one it fixes.
  await evalJSON(S, '(() => { __game.radio.setScene(false); return 1; })()');
  const c0 = await dirFired(S);
  await windRadio(S, 90);
  const c1 = await dirFired(S);
  const afterLines = (c1.fore - c0.fore) + (c1.back - c0.back);
  const mixOut = await evalJSON(S, '(() => __game.audioState())()');
  check('D3 the radio comes back after the beat',
    afterLines > 0 && c1.scene === false && mixOut.sceneDucked === false,
    `fore +${c1.fore - c0.fore}, back +${c1.back - c0.back} over 90 s once the scene is released; `
    + `sceneDucked=${mixOut.sceneDucked}`);

  // 5. FALSIFICATION. Turn the suppression off inside the director while leaving the latch on, and
  //    require the same counter to see the lines. This proves check 2's zero is the suppression's
  //    doing and not, say, an empty bag or a stalled clock.
  await evalJSON(S, '(() => { __game.radio.setScene(true); __game.radio.dir.scene = false; return 1; })()');
  const d0 = await dirFired(S);
  await windRadio(S, 90);
  const d1 = await dirFired(S);
  const brokenLines = (d1.fore - d0.fore) + (d1.back - d0.back);
  await evalJSON(S, '(() => { __game.radio.setScene(false); return 1; })()');
  check('D3 FALSIFY — with the director gate removed the same 90 s fires lines again',
    brokenLines > 0,
    `${brokenLines} lines over 90 s with `+'`dir.scene`'+` forced false while the latch stayed on `
    + `(the suppressed arm was ${sceneLines})`);

  // 6. The WIRING. Checks 1-5 exercise the mechanism; this one asserts the cutscene calls it, which
  //    is the half that was missing. Read off main.js's source because introWanted() is false for
  //    every harness by design (js/config.js FLAG.intro) and playing the scene to test the thing
  //    that silences the scene is circular.
  const src = readFileSync(resolve(ROOT, 'js/main.js'), 'utf8');
  const inStart = /function startIntro\(\)[\s\S]*?\n}/.exec(src);
  const inEnd = /function endIntro\(pick\)[\s\S]*?\n}/.exec(src);
  const startsIt = !!(inStart && /radio\?\.setScene\(true\)/.test(inStart[0]));
  const endsIt = !!(inEnd && /radio\?\.setScene\(false\)/.test(inEnd[0]));
  check('D3 the cutscene actually latches and releases it',
    startsIt && endsIt,
    `startIntro sets it: ${startsIt} · endIntro clears it: ${endsIt} — and endIntro is the ONE exit `
    + `for confirm, skip and auto-name alike (js/storyui.js finish())`);
}

// D3, end to end, on the REAL cutscene. Checks 1-6 drive the mechanism and read the wiring off the
// source; this one plays the scene on a throwaway profile and watches the director's own counters.
//
// It exists because the mechanism checks passed while the game was still broken. `setScene(true)`
// is called by startIntro(), and startIntro() runs BEFORE the 22 KB manifest lands — so
// `this.dir && this.dir.setScene(v)` had nothing to set, the director was constructed a second
// later with `scene` false, and the chatter came up under the Boss exactly as Aaron heard it. The
// guarded call is this project's dominant failure mode wearing a fix's clothes, and no amount of
// driving setScene() on a page whose director already exists can see it.
async function d3Live(ctx) {
  const { S, base } = ctx;
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&intro=1&seed=7` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 40);
  const early = await evalJSON(S, `(() => {
    const r = __game.radioState();
    return { scene: r.scene, dir: r.director ? r.director.scene : null,
      hasDir: !!r.director, mix: __game.audioState().sceneDucked,
      active: !!(__state.intro && __state.intro.active) };
  })()`);
  // Wind the director's own clock forward INSIDE the live cutscene. Without this the zero below is
  // only worth the ~7 s the harness can afford to watch, and DIR.FORE_MIN is longer than that — a
  // broken build would have shown the same zero. This is the same update() the game loop calls.
  await evalJSON(S, `(() => { const r = __game.radio; for (let i = 0; i < 80; i++) r.update(1.5, { night: true }); return 1; })()`);
  await settle(S, 40);
  const late = await evalJSON(S, `(() => {
    const r = __game.radioState(), d = r.director;
    return { scene: r.scene, dir: d ? d.scene : null, hasDir: !!d,
      fired: d ? d.fired : null, slots: d ? d.lines : -1,
      active: !!(__state.intro && __state.intro.active), phase: __state.intro && __state.intro.phase };
  })()`);
  const png = await shot(S, `intro_scene${LAND ? '_land' : ''}`);
  const fired = late.fired ? late.fired.fore + late.fired.back + late.fired.event : -1;
  check('D3 LIVE — the real cutscene fires no chatter, with a director that exists to fire it',
    late.hasDir && late.dir === true && late.scene === true && fired === 0 && late.active === true,
    `at 0.7 s: scene ${early.scene}, director ${early.hasDir ? 'exists' : 'NOT BUILT YET'} `
    + `(scene ${early.dir}), mix ducked ${early.mix}\n      `
    + `after 120 s of director clock inside the live cutscene: director ${late.hasDir ? 'exists' : 'MISSING — a zero here would '
      + 'mean nothing'} (scene ${late.dir}), fired ${JSON.stringify(late.fired)}, phase ${late.phase}`
    + `\n      ${png}`);
}

// ── D4 ─────────────────────────────────────────────────────────────────────
//
// gates_p2 §3.2.3 failed once, at ship time, with `worst ms.gen 1.900 ms` against a 1.4 gate, and
// three pass-2 phases were named as suspects: S2-H's shopfronts, S2-G's posters, S2-C's traffic.
//
// **All three are exonerated, and the number is not measuring per-chunk cost.** Timed directly, on
// real chunk records in the densest district gates_p2 uses for its draw budget:
//
//   unit (3) signage, whole chunk        0.104 ms   (100 samples)
//   unit (4) extras,  whole chunk        0.187 ms   — strips 0.043 · strobes 0.004 ·
//                                                     structures 0.021 · SHOPFRONTS 0.111 ·
//                                                     bridges 0.009
//   the deferred release path            0.026 ms   — signage 0.017 · shopfronts 0.009
//
// against §3.2.3's 1.2 ms per-unit cap. **Nothing is within five times of it.** The shopfronts are
// the largest single component of unit (4) and unit (4) is a sixth of its budget; removing every
// one of the 2,290 live shopfronts from a 20 s flight leaves `ms.gen` where it was.
//
// The same units measure 1.0-2.1 ms in flight. A 50x gap between the work and the wall time around
// the work is not a cost — it is allocation, GC and scheduling inside a busy frame, which is
// exactly what CLAUDE.md already says about budget.mjs's milliseconds and is equally true here.
// Ten gates_p2 runs put `ms.gen` at 0.8-1.1 and it passed every one, including under eight busy
// CPU threads; the reading is orientation-sensitive (see the note in the first check) in a way no
// per-chunk cost could be.
//
// So nothing was re-sliced. Unit (4) WAS sliced during this phase on the shopfront hypothesis and
// the slice was reverted when the timing came back, because machinery justified by noise is the
// thing this project keeps a list of. What is left behind is the ability to tell a cost from a
// stall the next time the number goes red: `city.stagePeak` (flight-scoped, where `city.stageMs`
// carries the uncapped boot pre-warm), `__game.setShopDensity` (the generation lever that did not
// exist), `__game.cityRecs` and `__game.setGenSlice`.
const CAP = 1.2;

// Unit (4), timed directly on the live near ring instead of inferred from a flight. Each chunk is
// released and re-prepared first, because `writeExtras` returns immediately once `rec.extra` is
// set and timing that would measure a function call. `mult` runs the unit's work N times inside
// ONE timed span — the falsification control, so the threshold below is shown to be one the
// instrument can actually cross.
const timeExtras = (S, mult = 1) => evalJSON(S, `(() => {
  const sg = __game.signage;
  const recs = [...__game.cityRecs()].filter(r => r.near && r.desc && r.desc.buildings.length);
  const part = {}; let worst = 0, total = 0, n = 0, maxB = 0;
  const T = (k, f) => { const a = performance.now(); f(); const d = performance.now() - a;
    part[k] = (part[k] || 0) + d; return d; };
  for (let rep = 0; rep < 4; rep++) for (const rec of recs) {
    sg.release(rec); sg.prepare(rec);
    const cx = rec.desc.cxWorld, cz = rec.desc.czWorld, bs = rec.desc.buildings;
    maxB = Math.max(maxB, bs.length);
    const t0 = performance.now();
    for (let m = 0; m < ${mult}; m++) {
      T('strips', () => { for (const b of bs) sg.buildingStrips(rec, b, cx, cz); });
      T('strobes', () => { for (const b of bs) sg.buildingStrobes(rec, b, cx, cz); });
      T('structures', () => { for (const b of bs) sg.buildingStructures(rec, b, cx, cz); });
      T('shopfronts', () => { for (const b of bs) sg.shops.writeBuilding(rec, b, cx, cz); });
      T('bridges', () => sg.bridges(rec, cx, cz));
    }
    const d = performance.now() - t0;
    total += d; if (d > worst) worst = d;
    rec.extra = true; n++;
  }
  for (const k of Object.keys(part)) part[k] = +(part[k] / n).toFixed(3);
  return { mean: +(total / n).toFixed(3), worst: +worst.toFixed(3), part,
    chunks: recs.length, samples: n, maxBuildings: maxB };
})()`);

async function d4(ctx) {
  const { S, base } = ctx;
  const fly = async (secs, setup) => {
    await S('Page.navigate', { url: `${base}/index.html?auto=1&nosave&nohud` });
    await waitFor(S, 'window.__ready', 60000);
    if (setup) await evalJSON(S, setup);
    await evalJSON(S, 'window.__game.resetPerf()');
    const t0 = Date.now();
    let gen = 0, frame = 0;
    while (Date.now() - t0 < secs * 1000) {
      const s = await evalJSON(S, 'window.__state');
      gen = Math.max(gen, s.ms.genWorst ?? s.ms.gen);
      frame = Math.max(frame, s.ms.worst);
      await sleep(60);
    }
    const c = await evalJSON(S, 'window.__state.city');
    const sh = await evalJSON(S, 'window.__game.shopState()');
    return { gen, frame, peak: c.stagePeak, session: c.stageMs, queued: c.queued,
      shops: sh.n, overflow: sh.overflow };
  };

  const base1 = await fly(20);
  const worstUnit = Math.max(...base1.peak);
  // CEILING, derived rather than fitted. The pump spends at most CAP across the units it chooses,
  // plus at most one unit forced through on top — and a unit's own budget is CAP. So 2.4 ms is
  // what the design permits in the worst frame, and a reading above it means something ran that
  // the pump did not account for. gates_p2's 1.4 is the tighter, portrait-only figure and it stays
  // the gate for the shipped flight; this one is the architectural bound, and it is what makes a
  // LANDSCAPE arm assertable at all — see the note below.
  const CEIL = 2 * CAP;
  check('D4 the generation pump stays inside the budget its own design permits, and the frame holds',
    base1.gen <= CEIL && base1.frame <= 12,
    `ms.gen ${base1.gen.toFixed(2)} against the derived ceiling ${CEIL} (gates_p2's own gate is 1.4, `
    + `portrait only); worst FRAME ${base1.frame.toFixed(2)} against §3.2.3's 12\n      `
    + `flight-scoped stage worsts [${base1.peak.join(', ')}] ms — worst unit ${worstUnit}\n      `
    + `${base1.shops} shopfronts live, ${base1.overflow} dropped, ${base1.queued} queued\n      `
    + `**ms.gen is systematically worse in LANDSCAPE**: three paired 20 s flights measured `
    + `1.0/1.1/1.3 portrait against 1.4/1.5/2.1 landscape, so the 1.4 figure is exceeded there `
    + `while gates_p2 — which has no landscape arm — passes 8/8. Recorded, not gated: the worst `
    + `FRAME is 7.6-10.2 ms against 12 in both, so the game holds 60 fps either way\n      `
    + `the SESSION array [${base1.session.join(', ')}] also carries the BOOT PRE-WARM, where units `
    + `run back to back with no cap at all and stage 0 has measured 1.6 ms — a gate reading it `
    + `would be reading the loading bar and calling it a flight (city.stagePeak exists for this)`);

  // The BISECT, kept as a check rather than a note: the prime suspect stays exonerated by a
  // measurement the next agent can re-run in three minutes, not by a paragraph in a report.
  const noshop = await fly(20, 'window.__game.setShopDensity(0)');
  check('D4 the shopfronts are NOT the generation cost — removing every one of them moves nothing',
    noshop.shops === 0 && noshop.gen <= CEIL,
    `shops on:  ${String(base1.shops).padStart(4)} live, stage worsts [${base1.peak.join(', ')}], ms.gen ${base1.gen.toFixed(2)}\n      `
    + `shops off: ${String(noshop.shops).padStart(4)} live, stage worsts [${noshop.peak.join(', ')}], ms.gen ${noshop.gen.toFixed(2)}\n      `
    + `setShopDensity is a GENERATION lever — setShopVisible/Force/Range are render levers and `
    + `cannot move ms.gen at all, which is why this A/B could not be run before`);

  // The per-component timing, at the densest camera gates_p2 uses for its draw budget. This is the
  // bisect itself rather than a summary of it, so the numbers in the header above stay true or the
  // check goes red.
  await S('Page.navigate', { url: `${base}/index.html?nosave&nohud&seed=7` });
  await waitFor(S, 'window.__ready', 60000);
  await evalJSON(S, '(window.__game.setCamera({pos:[-1500,210,640],yaw:35,pitch:-8,fov:62}),1)');
  await settle(S, 60);
  await quiesce(S, { label: 'city' });
  await settle(S, 40);
  const one = await timeExtras(S);
  const parts = Object.entries(one.part).sort((a2, b2) => b2[1] - a2[1]);
  check('D4 unit (4) — where its time actually goes, at the densest camera',
    one.worst <= CAP && one.samples >= 50 && parts[0][0] === 'shopfronts',
    `${one.samples} chunk-samples over ${one.chunks} live near chunks (worst chunk ${one.maxBuildings} buildings)\n      `
    + `unit (4) whole chunk: ${one.mean} ms mean, ${one.worst} ms worst, against the ${CAP} cap\n      `
    + `  ` + parts.map(([k, v]) => `${k} ${v}`).join(' · ')
    + `\n      the shopfronts are the largest component of the unit AND the unit is a `
    + `${(CAP / one.mean).toFixed(0)}th of its budget — both halves matter`);

  // FALSIFICATION. The bisect's central claim is that this instrument can SEE the shopfronts and
  // that they are 0.10 of the unit's 0.17 ms. So take them away and require the same per-component
  // timing to lose that component and keep the others.
  //
  // Repeating the unit eight times inside one timed span was tried first as a way to push the
  // measurement over the 1.2 cap, and it measured 2.1x rather than 8x — the second pass over a
  // chunk is not the same work as the first, because the field slots are already allocated. That
  // is worth recording: **nothing in this system can cross the 1.2 ms per-unit cap**, which is the
  // finding, and a threshold nothing can cross is not a check that can be falsified by crossing
  // it. What can be falsified is whether the instrument is measuring the thing it names.
  await evalJSON(S, 'window.__game.setShopDensity(0)');
  await settle(S, 60);
  const nos = await timeExtras(S);
  await evalJSON(S, 'window.__game.setShopDensity(1)');
  const dropped = one.part.shopfronts - nos.part.shopfronts;
  const others = ['strips', 'strobes', 'structures', 'bridges'];
  const otherDrift = Math.max(...others.map(k => Math.abs(one.part[k] - nos.part[k])));
  check('D4 FALSIFY — take the shopfronts away and the same per-component timing loses that component',
    nos.part.shopfronts < one.part.shopfronts * 0.35 && dropped > 0.03 && otherDrift < 0.03
      && nos.mean < one.mean,
    `with shops: ` + parts.map(([k, v]) => `${k} ${v}`).join(' · ') + ` = ${one.mean} ms\n      `
    + `without:    ` + others.concat(['shopfronts']).map(k => `${k} ${nos.part[k]}`).join(' · ')
    + ` = ${nos.mean} ms\n      `
    + `the shopfront component fell by ${dropped.toFixed(3)} ms a chunk; every other component `
    + `moved by at most ${otherDrift.toFixed(3)} ms — so the ${one.part.shopfronts} ms attributed `
    + `to shopfronts above is theirs and not the timer's`);
}

// ── D1 ─────────────────────────────────────────────────────────────────────
//
// What can be checked in a browser is that the pool the manifest describes is the pool on disk and
// that every clip decodes to real energy. What CANNOT be checked here is whether it sounds human —
// whisper scored the `say` pool at 90.7 % and that is how this defect shipped. Aaron listening is
// the acceptance test; this is a build check.
async function d1(S) {
  const pool = await evalAsyncJSON(S, `(async () => {
    const r = await fetch('./assets/audio/manifest.json');
    const m = await r.json();
    return { chatter: m.chatter.length, music: m.music.length,
      fore: m.chatter.filter(c => c.layer === 'fore').length,
      withText: m.chatter.filter(c => c.text).length };
  })()`);
  check('D1 the manifest still describes the whole 207-slot pool',
    pool.chatter === 207 && pool.music === 9 && pool.fore === 183,
    `${pool.chatter} chatter (${pool.fore} foreground, ${pool.withText} with text) + ${pool.music} music`);

  // Decode a spread of the regenerated clips and measure the SPEECH WINDOW — the span between the
  // two squelch bursts radio_fx.sh keys onto every clip. Whole-file RMS is not evidence that
  // anybody spoke: the chain mixes a hiss floor into everything, so a clip whose synthesiser
  // produced nothing still decodes at about -34 dBFS of pink noise and would pass any "decodes,
  // has duration, has energy" check. This project has shipped a silent clip past exactly that.
  //
  // An OfflineAudioContext, not the game's own loader: `radio.clip()` returns null when
  // `audio.ctx` is null, and there is no user gesture in a CDP harness, so routing through it
  // would have measured ten nulls and called them ten zeros. It did, on the first run.
  const HEADS = 0.075, TAILS = 0.130;
  const slots = ['dispatch_01', 'life_09', 'police_03', 'pirate_04', 'weather_02',
    'ad_05', 'distress_07', 'bg_net_10', 'bg_dock_04', 'dispatch_pay_20'];
  const dec = await evalAsyncJSON(S, `(async () => {
    const ctx = new OfflineAudioContext(1, 512, 44100);
    const win = (buf, h, t) => {
      const d = buf.getChannelData(0), sr = buf.sampleRate;
      const i0 = Math.min(d.length, Math.round(h * sr)), i1 = Math.max(i0, d.length - Math.round(t * sr));
      let s = 0; for (let i = i0; i < i1; i++) s += d[i] * d[i];
      return 20 * Math.log10(Math.sqrt(s / Math.max(1, i1 - i0)) + 1e-12);
    };
    const out = [];
    for (const slot of ${JSON.stringify(slots)}) {
      const r = await fetch('./assets/audio/chatter/' + slot + '.mp3', { cache: 'no-store' });
      if (!r.ok) { out.push({ slot, ok: false }); continue; }
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      out.push({ slot, ok: true, sec: +buf.duration.toFixed(2),
        speech: +win(buf, ${HEADS} + 0.05, ${TAILS} + 0.05).toFixed(1) });
    }
    // The falsification, in the page and on the same buffer: zero the speech window and leave the
    // squelch bursts, and the same measurement must fall through the floor.
    const r = await fetch('./assets/audio/chatter/life_09.mp3', { cache: 'no-store' });
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    const z = ctx.createBuffer(1, buf.length, buf.sampleRate);
    const src = buf.getChannelData(0), dst = z.getChannelData(0);
    const i0 = Math.round(${HEADS} * buf.sampleRate), i1 = buf.length - Math.round(${TAILS} * buf.sampleRate);
    for (let i = 0; i < buf.length; i++) dst[i] = (i >= i0 && i < i1) ? 0 : src[i];
    return { out, gutted: +win(z, ${HEADS} + 0.05, ${TAILS} + 0.05).toFixed(1) };
  })()`);
  // -26.5 dBFS, the floor tools/vo/gen_chatter.py derives by pushing SILENCE through the identical
  // ffmpeg chain and adding 8 dB. Not a number anybody liked the look of.
  const FLOOR = -26.5;
  const bad = dec.out.filter(d => !d.ok || d.speech < FLOOR);
  check('D1 the regenerated clips decode to real speech, and the same measurement rejects a gutted one',
    bad.length === 0 && dec.gutted < FLOOR,
    `${dec.out.length} slots against the ${FLOOR} dBFS noise-only floor: `
    + dec.out.map(d => `${d.slot} ${d.sec}s ${d.speech}`).join(' · ')
    + `\n      FALSIFY: life_09 with its speech window zeroed measures ${dec.gutted} dBFS -> `
    + `${dec.gutted < FLOOR ? 'REJECTED' : 'ACCEPTED, THE CHECK IS BROKEN'}`);

  const story = await evalAsyncJSON(S, `(async () => {
    const r = await fetch('./assets/audio/story/index.json');
    const j = await r.json();
    return { n: j.clips.length, voices: Object.entries(j.voices).map(([k, v]) => k + ':' + v.voice),
      bytes: j.clips.reduce((a, c) => a + c.bytes, 0),
      quiet: j.clips.filter(c => c.rms < -30).length };
  })()`);
  check('D1 the 19 story clips are Kokoro and the Boss is bm_george',
    story.n === 19 && story.quiet === 0 && story.voices.includes('boss:bm_george'),
    `${story.n} clips, ${(story.bytes / 1024).toFixed(0)} KB, ${story.quiet} under -30 dBFS · `
    + `${story.voices.join(' ')}`);
}

(async () => {
  // `open()` serves the repo itself and returns { S, base, close } — it does NOT return S. Passing
  // the context where the session was expected produced a suite that printed "0/0 passed" and
  // exited 0, which is the shape of every partial run this project has been bitten by.
  const ctx = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  const { S, base } = ctx;
  try {
    await S('Page.navigate', { url: `${base}/index.html?nosave=1&seed=7` });
    await waitFor(S, 'window.__ready', 60000);
    await quiesce(S, { label: 'city' });
    await settle(S, 20);
    await d2(S);
    await d3(S);
    await d1(S);
    await d3Live(ctx);       // navigates away; anything needing the flying page runs above this
    await d4(ctx);
  } catch (e) {
    // Without this the `finally` below calls process.exit() before node can print the rejection,
    // and the suite reports "0/0 passed" for a crash. It did exactly that on its first run.
    console.error('\nSUITE THREW:', e && e.stack || e);
    fail.push('suite threw: ' + (e && e.message));
  } finally {
    console.log(`\n${ok.length}/${ok.length + fail.length} passed`
      + (fail.length ? `\nFAILED: ${fail.join(', ')}` : ''));
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
    await ctx.close();
    process.exit(fail.length ? 1 : 0);
  }
})();
