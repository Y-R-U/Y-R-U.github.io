#!/usr/bin/env node
/**
 * Lane B's capture tool: every shell screen, at a true phone size.
 *
 * WHY THIS DOES NOT USE cdp.capture(). That helper composites the CANVASES, and
 * lane B's entire output is DOM on top of them — a canvas composite shows the
 * sand and nothing else, which reads as "the UI is broken" when it is drawing
 * perfectly. The shell has to go through Page.captureScreenshot.
 *
 * ...which is the exact call cdp.mjs warns hangs forever on an animating WebGL
 * canvas under --headless=new + SwiftShader. Two mitigations, both needed:
 *   1. --gpu (ANGLE Metal). The hang is a SwiftShader problem.
 *   2. Before each shot, park the render loop by stubbing renderer.draw, so the
 *      canvas is a still image while the capture runs. The sand keeps simulating
 *      and the last frame stays on screen because ?preserve=1 keeps the buffer.
 * Every capture is also raced against a timeout, so a hang fails the run in 25 s
 * instead of wedging the agent.
 *
 *   node tools/uishot.mjs                  390x844 phone, every screen
 *   node tools/uishot.mjs --desktop        1280x800 as well
 *   node tools/uishot.mjs --only=attract
 *   node tools/uishot.mjs --probe         click every control, assert the result
 *   node tools/uishot.mjs --probe --falsify   strip the listeners; every check must go red
 *   node tools/uishot.mjs --only=modehud  one HUD shot per mode, state driven until real
 *   node tools/uishot.mjs --only=levels   the ALCHEMY campaign picker, empty and part-played
 *   node tools/uishot.mjs --flow          attract -> every mode -> pause -> results -> attract,
 *                                         then a real ALCHEMY level played to a win
 *   node tools/uishot.mjs --win --only=none   just the ALCHEMY win/loss cards
 *   node tools/uishot.mjs --flow --falsify    HUD ignores the mode again and the results card
 *                                         forgets it was ALCHEMY; every panel and win check must go red
 *   node tools/uishot.mjs --payout        a real chain, and what it pays on the board
 *   node tools/uishot.mjs --payout --falsify  the shell blinded to score and chains; all 8 must go red
 *   node tools/uishot.mjs --payout --paybug   a perfect payout drawn back in the corner; EXACTLY the
 *                                         position check must go red
 *   node tools/uishot.mjs --legible       ink and smear for floating type, on the brightest
 *                                         and darkest boards in the game
 *   node tools/uishot.mjs --legible --dirtbug   the halo back; every SMEAR line must go red
 *   node tools/uishot.mjs --legible --flatbug   no shadow at all; the bright-board INK lines must
 *   node tools/uishot.mjs --copy          the two ALCHEMY card labels a player could misread
 *   node tools/uishot.mjs --copy --falsify    the copy as it shipped; 3 must go red
 *   node tools/uishot.mjs --layout        where the top controls ACTUALLY land, per mode
 *   node tools/uishot.mjs --layout --falsify  the naive version of the swap; every position must go red
 *   node tools/uishot.mjs --se            add a 375x667 iPhone SE pass to any of the above
 */
import { harness, ROOT } from './cdp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '../../../..');          // repo root, so /lib/auth would resolve
const OUT = join(ROOT, 'shots', 'ui');
mkdirSync(OUT, { recursive: true });

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const ONLY = args.only ? String(args.only).split(',') : null;
const SIZES = [{ tag: 'phone', w: 390, h: 844 }];
// A short phone. 390x844 is the design size and it hides a whole class of bug:
// the mode sheet fitted there by four pixels and scrolled by ninety on an SE.
if (args.se) SIZES.push({ tag: 'se', w: 375, h: 667 });
if (args.desktop) SIZES.push({ tag: 'desk', w: 1280, h: 800 });

const { cdp, base, close } = await harness({ root: SITE, gpu: true });

async function shot(name) {
  // Park the render loop: a still canvas is what makes captureScreenshot safe.
  await cdp.eval(`(() => {
    const R = window.__game && window.__game.renderer;
    if (R && !R.__parked) { R.__parked = R.draw; R.draw = function () {}; }
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 90));
  const p = cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const to = new Promise((_, rej) => setTimeout(() => rej(new Error('captureScreenshot hung')), 25000));
  let res;
  try { res = await Promise.race([p, to]); }
  finally {
    await cdp.eval(`(() => { const R = window.__game && window.__game.renderer;
      if (R && R.__parked) { R.draw = R.__parked; R.__parked = null; } return 1; })()`).catch(() => {});
  }
  const file = join(OUT, name + '.png');
  writeFileSync(file, Buffer.from(res.data, 'base64'));
  console.log('  ' + name.padEnd(22) + '-> shots/ui/' + name + '.png');
}

const want = (n) => !ONLY || ONLY.includes(n);

/**
 * WHAT IS ACTUALLY IN FRONT at the centre of `sel`.
 *
 * querySelector proves an element exists in the DOM. It says nothing about
 * whether a player can see it, and that gap shipped two real bugs: the settings
 * sheet and the level picker both slid up BEHIND the modal card that opened
 * them (`.sheet-wrap` was z-index 6 against `.modal-wrap`'s 7), and every
 * DOM-shaped check in this file stayed green through it — including one that
 * counted 96 level tiles nobody could see. Hit-test, do not count.
 *
 * Returns the layer the topmost element at that point belongs to.
 */
async function frontLayer(sel) {
  return cdp.eval(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return 'missing';
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return 'collapsed';
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + Math.min(r.height / 2, 70));
    const hit = document.elementFromPoint(x, y);
    if (!hit) return 'none';
    if (hit.closest('.sheet-wrap')) return 'sheet';
    if (hit.closest('.modal-wrap')) return 'modal';
    if (hit.closest('#ui')) return 'ui';
    return 'canvas';
  })()`);
}

/**
 * A REAL touch, through CDP's input pipeline.
 *
 * A `new PointerEvent(...)` dispatched by hand is not a pointer: it has no
 * active pointer id, so core/input.js's setPointerCapture throws NotFoundError
 * and the handler dies before it does anything. That is why the ZEN brush used
 * to need a window-capture workaround to be testable at all. Input.dispatchTouchEvent
 * produces a pointer Chrome believes in, which is both the honest thing to drive
 * the UI with and the only way to test the sanctioned paint route.
 */
async function touch(x, y, moves = []) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (const [mx, my] of moves) {
    await new Promise((r) => setTimeout(r, 30));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx, y: my, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Screenshots prove layout, not wiring. This clicks the real buttons and
 * asserts what the game did — the only way to catch a control that renders
 * perfectly and is attached to nothing.
 */
async function probe() {
  const fails = [];
  // A true phone, with TOUCH EMULATION ON. Not cosmetic: Input.dispatchTouchEvent
  // is dropped by a page with no touch points, so the ZEN brush silently pours
  // nothing and the check reads as a broken palette rather than a probe that
  // never touched anything.
  await cdp.viewport(390, 844, 1, true);
  // A fresh page. Running after the capture pass left the shell on the results
  // screen with three sheets built, and the probe read that as three failures —
  // its own fault, not the UI's.
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&seed=99`);
  await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000);
  await cdp.frames(20);
  if (args.falsify) {
    // D9: a check never proven capable of failing is not evidence. Cloning #ui
    // reproduces the whole tree WITHOUT its event listeners, so every control
    // still renders and none of them does anything. Every line below must go red.
    await cdp.eval(`(() => { const u = document.getElementById('ui');
      u.replaceWith(u.cloneNode(true)); return 1; })()`);
  }
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const click = (sel, n = 0) => cdp.eval(
    `(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}];
      if (!e) return 'missing'; e.click(); return 'clicked'; })()`);
  const q = (e) => cdp.eval(e);

  // The z-order arm. The listener-stripping arm above makes the two front-layer
  // checks go red for the WRONG reason — no sheet opens at all, so they report
  // 'missing'. This one puts the shipped bug back exactly: sheets at z-index 6,
  // under .modal-wrap's 7. Everything else must stay green and those two must
  // say 'modal'. Never ship a build that sets it.
  if (args.zbug) {
    await cdp.eval(`(() => { const s = document.createElement('style');
      s.textContent = '.sheet-wrap { z-index: 6 }'; document.head.append(s); return 1; })()`);
  }

  ok('attract is the first screen', (await q('window.__ui.screen')) === 'attract');

  // Three doors on the title screen. STORY is the campaign, QUICK PLAY is an
  // endless mode picked for you, and the icon between them is the full list.
  ok('STORY opens the campaign',
    (await click('.attract-btns .gb--primary')) === 'clicked' &&
    (await q('document.querySelectorAll(".sheet--lv .lvt").length')) > 0 &&
    (await q('window.__state.state')) === 'attract');
  await new Promise((r) => setTimeout(r, 340));
  ok('the campaign is the front layer', (await frontLayer('.sheet-wrap.is-on .sheet')) === 'sheet',
    String(await frontLayer('.sheet-wrap.is-on .sheet')));
  await click('.sheet-wrap.is-on .sheet-head .gb');
  await new Promise((r) => setTimeout(r, 340));

  const qpMode = async () => q('window.__state.mode');
  ok('QUICK PLAY starts an endless run',
    (await click('.attract-btns .gb:last-child')) === 'clicked' &&
    (await q('window.__state.state')) === 'play' && (await q('window.__ui.screen')) === 'hud' &&
    ['alchemy', 'zen'].indexOf(await qpMode()) < 0,
    String(await qpMode()));

  await click('.hud-pause .gb');
  ok('pause button pauses the sim',
    (await q('window.__state.state')) === 'pause' && (await q('window.__ui.screen')) === 'pause');

  // The bug this replaces: SETTINGS on the pause card slid the sheet up BEHIND
  // the card, so it could not be seen until the run was resumed. A DOM check
  // cannot see that; only a hit-test can.
  await click('.scr-pause .card-row .gb', 0);                 // SETTINGS
  await new Promise((r) => setTimeout(r, 400));
  ok('settings opens IN FRONT of the pause card',
    (await frontLayer('.sheet-wrap.is-on .sheet')) === 'sheet',
    String(await frontLayer('.sheet-wrap.is-on .sheet')));
  ok('opening settings does not resume the run', (await q('window.__state.state')) === 'pause');
  await click('.sheet-wrap.is-on .sheet-head .gb');
  await new Promise((r) => setTimeout(r, 340));
  ok('closing settings leaves you on the pause card', (await q('window.__ui.screen')) === 'pause');

  await click('.scr-pause .gb--primary');
  ok('resume resumes', (await q('window.__state.state')) === 'play');

  await click('.hud-pause .gb');
  await click('.scr-pause .card-row .gb', 1);          // QUIT
  ok('quit returns to attract', (await q('window.__ui.screen')) === 'attract');

  await q('window.__ui.openModes()');
  const cards = await q('document.querySelectorAll(".sheet-wrap.is-on .mcard").length');
  ok('mode sheet lists six modes', cards === 6, String(cards));
  await click('.sheet-wrap.is-on .mcard', 1);           // TIDE
  ok('a mode card starts that mode', (await q('window.__state.mode')) === 'tide',
    String(await q('window.__state.mode')));
  ok('mode sheet closes on start', (await q('document.querySelector(".sheet-wrap").classList.contains("is-on")')) === false);

  await q('window.__game.attract()');
  await q('window.__ui.openSettings()');
  await new Promise((r) => setTimeout(r, 260));
  await cdp.eval(`(() => { const s = document.querySelectorAll('.sheet-wrap.is-on input[type=range]')[0];
    if (!s) return 0; s.value = 25; s.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  ok('settings slider writes through save',
    Math.abs((await q('window.__game.save.settings.music')) - 0.25) < 0.02,
    String(await q('window.__game.save.settings.music')));
  await cdp.eval(`(() => { const b = [...document.querySelectorAll('.sheet-wrap.is-on .seg button')]
    .find((x) => x.textContent === 'Abyss'); b && b.click(); })()`);
  ok('biome segment writes through save', (await q('window.__game.save.settings.biome')) === 'abyss');
  await click('.sheet-wrap.is-on .sheet-head .gb');
  ok('sheet close button closes it',
    (await q('[...document.querySelectorAll(".sheet-wrap")].every(e => !e.classList.contains("is-on"))')) === true);

  await q('window.__game.attract()');
  // The settings sheet closed one line ago and its scrim transitions out over
  // 300 ms — it is still hit-testable, and sandtouch correctly refuses to pour
  // through a sheet. Wait for it, or the check measures the transition.
  await new Promise((r) => setTimeout(r, 400));
  const before = await q('window.__game.world.g.count');
  // Aim at the middle of the BOARD, not the middle of the window: on a desktop
  // viewport the board is a narrow centred column and a hard-coded phone
  // coordinate lands in the black margin, where pouring is correctly a no-op.
  //
  // A REAL touch, for two reasons. A hand-made PointerEvent throws inside
  // core/input.js's setPointerCapture, and it throws AFTER the handler has
  // latched st.down — so every later gesture in the run was ignored as "a
  // pointer is already down". That is what made the ZEN brush look dead three
  // hundred lines below a test that had nothing to do with it.
  {
    const b = JSON.parse(await q('JSON.stringify(window.__game.view.board)'));
    const x = b.x + b.w / 2, y = b.y + b.h * 0.35;
    await touch(x, y, [[x + 4, y + 4]]);
  }
  const after = await q('window.__game.world.g.count');
  ok('touching the sand on attract pours grains', after > before, `${before} -> ${after}`);

  await q('window.__ui.banner("TEST")');
  ok('attract suppresses mode banners', (await q('document.querySelectorAll(".banner").length')) === 0,
    await q('[...document.querySelectorAll(".banner")].map(e => e.textContent).join("|")'));

  // ZEN. Started through the API rather than a card, so the two checks below
  // are about the palette itself and not about whether a card still works.
  await q('window.__game.start("zen", { seed: 5 })');
  await cdp.frames(10);
  ok('zen builds the material palette',
    (await q('document.querySelectorAll(".zp-chip").length')) === 11 &&
    (await q('document.querySelector(".hud-score").classList.contains("off")')) === true);

  const m0 = await q('window.__ui.zen.material.name');
  await click('.zp-chip', 5);                            // Lava
  const m1 = await q('window.__ui.zen.material.name');
  ok('a palette chip selects that material', m0 !== m1 && m1 === 'Lava', `${m0} -> ${m1}`);

  // Painting listens on the WINDOW in the capture phase, so it must both pour
  // and swallow the drag — if core/input.js still sees it, the falling piece
  // slides sideways under the brush.
  await click('.zp-chip', 0);                            // Sand
  ok('zen paints through the sanctioned input route',
    (await q('window.__ui.zen.route')) === 'input', String(await q('window.__ui.zen.route')));
  const px = await q('window.__game.world.piece ? window.__game.world.piece.x : -1');
  const c0 = await q('window.__game.world.g.count');
  {
    const b = JSON.parse(await q('JSON.stringify(window.__game.view.board)'));
    const y = b.y + b.h * 0.3;
    const x0 = b.x + b.w * 0.4;
    await touch(x0, y, [1, 2, 3, 4, 5, 6].map((k) => [x0 + k * 9, y]));
  }
  const c1 = await q('window.__game.world.g.count');
  const px2 = await q('window.__game.world.piece ? window.__game.world.piece.x : -1');
  ok('painting in zen pours grains', c1 > c0, `${c0} -> ${c1}`);
  ok('painting does not also drag the piece', px === -1 || px2 === px, `${px} -> ${px2}`);

  /* ------------------------------------------------- the ALCHEMY campaign */
  // The picker is the only way into 96 levels, so every claim it makes — what
  // is open, what is shut, and which level a tile actually starts — has to be
  // clicked rather than photographed.
  await q('window.__game.attract()');
  await q('window.__ui.openModes()');
  await new Promise((r) => setTimeout(r, 240));
  await click('.sheet-wrap.is-on .mcard', 4);            // ALCHEMY
  await new Promise((r) => setTimeout(r, 320));
  const total = await q('document.querySelectorAll(".sheet--lv .lvt").length');
  ok('the ALCHEMY card opens the campaign rather than level 1',
    total > 0 && (await q('window.__state.mode')) !== 'alchemy', `${total} tiles`);

  const unlocked = await q(`window.__game.save.unlockedUpTo(${total || 1})`);
  const shut = await q('document.querySelectorAll(".sheet--lv .lvt.is-locked").length');
  ok('every level past the unlock point is locked',
    total > 0 && shut === total - unlocked && shut > 0, `${shut} of ${total} shut, unlocked ${unlocked}`);

  await click('.sheet--lv .lvt.is-locked');
  ok('a locked level refuses to start',
    (await q('window.__state.mode')) !== 'alchemy' &&
    (await q('document.querySelectorAll(".sheet-wrap.is-on .sheet--lv").length')) === 1);

  const scroll0 = await q('document.querySelector(".sheet--lv .sheet-body").scrollTop');
  await click('.lv-acts .lv-chip', 3);                   // act IV
  await new Promise((r) => setTimeout(r, 520));
  const scroll1 = await q('document.querySelector(".sheet--lv .sheet-body").scrollTop');
  ok('an act chip jumps the grid to that act', scroll1 > scroll0, `${scroll0} -> ${scroll1}`);

  await click('.sheet--lv .lvt:not(.is-locked)');
  ok('a level tile starts ALCHEMY on that level',
    (await q('window.__state.mode')) === 'alchemy' &&
    (await q('window.__game.world.cfg.levelId')) === 1,
    `${await q('window.__state.mode')} lv ${await q('window.__game.world.cfg.levelId')}`);
  ok('starting a level closes the campaign',
    (await q('[...document.querySelectorAll(".sheet-wrap")].every(e => !e.classList.contains("is-on"))')) === true);

  await q('window.__game.attract()');
  await q('window.__ui.openLevels()');
  await new Promise((r) => setTimeout(r, 320));
  await click('.lv-cont');
  ok('Continue starts the next unlocked level',
    (await q('window.__state.mode')) === 'alchemy' &&
    (await q('window.__game.world.cfg.levelId')) === unlocked,
    `lv ${await q('window.__game.world.cfg.levelId')} of unlocked ${unlocked}`);

  if (args.falsify) {
    // Six of the thirteen checks hang off a listener inside #ui and MUST flip:
    // PLAY, pause, resume, the mode card, the settings slider, the biome segment.
    // The arm cannot move the other seven, and it is worth being exact about why
    // rather than inflating the number:
    //   - 'attract is first', 'six mode cards'  structural, no listener involved
    //   - 'quit returns to attract', 'sheet closes on start', 'close button'
    //     vacuously true once the earlier clicks did nothing
    //   - 'touching the sand'  sandtouch listens on WINDOW, not on #ui, so
    //     cloning #ui is out of its reach by construction
    //   - 'attract suppresses banners'  a guard, not a handler
    //   - 'painting pours', 'does not drag the piece', 'the sanctioned route'
    //     the brush now paints through core/input.js, which listens on the
    //     CANVAS and pours through the mode — also out of #ui's reach
    //   - 'starting a level closes the campaign'  vacuously true once the tile
    //     click did nothing, because the campaign never opened
    // The seventh that MUST flip is the palette chip, whose tap handler lives on
    // #ui. Six more come from the ALCHEMY campaign, every one of them a listener
    // inside #ui: the mode card that opens it, the lock state it renders, the
    // refusal to start a locked level, the act chips, a tile, and Continue.
    // In practice fifteen go red, because the ZEN field-gating that hides the
    // score is applied by setHud to the detached originals, so the clone shows a
    // score panel a ZEN player should never see — a real failure, not a bonus.
    const MUST = 13;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST} required`);
    if (fails.length < MUST) { console.log('ARM TOO WEAK — these checks are not evidence'); process.exitCode = 1; }
    else console.log('arm ok: every listener-dependent check is capable of failing');
    return;
  }
  console.log(fails.length ? '\nPROBE FAILURES:\n  ' + fails.join('\n  ') : '\nprobe: all green');
  if (fails.length) process.exitCode = 1;
}


/**
 * Drive the SHIPPING bot over the shipping host loop until a predicate holds.
 *
 * __game.step() runs the sim and the mode hooks but NOT the bot, so stepping
 * alone piles every piece in one column and the mode state that the HUD is
 * supposed to show never becomes interesting. `cond` is evaluated with `w`
 * bound to the world.
 */
async function drive(cond, max = 40000) {
  const raw = await cdp.eval(`(async () => {
    const { Bot } = await import('${base}/gms/2d/silt/js/ai/bot.js');
    const w = window.__game.world;
    const bot = new Bot(w);
    const hit = (w) => (${cond});
    let i = 0, reached = false;
    for (; i < ${max}; i++) {
      bot.update(); window.__game.step(1);
      if (hit(w)) { reached = true; break; }
      if (w.over) break;
    }
    return JSON.stringify({ i, reached, over: w.over, t: +w.t.toFixed(1), score: w.score, chains: w.chains });
  })()`);
  return JSON.parse(raw);
}

/**
 * Push the world's real state through the shell exactly the way main.js's frame
 * loop does. Nothing here is invented — every field is read off the live world
 * and the live mode — it only removes the dependency on a rAF landing between
 * the last sim step and the capture.
 */
/**
 * Every bar in the mode HUD animates to its new value over ~0.3 s. The first
 * round of shots was taken 90 ms after the pump, so TIDE's 70% waterline was
 * photographed at 15% and read as a rail that does not track the flood. Let the
 * transitions land before the shutter.
 */
const settle = () => new Promise((r) => setTimeout(r, 480));

async function pump() {
  await cdp.eval(`(async () => {
    const M = await import('${base}/gms/2d/silt/js/modes/index.js');
    const w = window.__game.world, m = M.byId(window.__state.mode);
    window.__ui.setHud({
      score: w.score, chains: w.chains, combo: w.combo, next: w.nextPiece,
      mode: m.name, modeId: m.id, hud: m.hud,
      tide: w.tide, hourglass: w.hourglass, alchemy: w.alchemy, zen: w.zen,
    });
    return 1;
  })()`);
}

// What each mode has to be doing before its HUD is worth photographing. A shot
// of TIDE at 4% waterline or HOURGLASS twenty seconds from a flip proves the
// panel renders and nothing about whether it communicates.
const MODE_SHOTS = [
  ['flow',      'w.chains >= 2', 30000],
  ['tide',      'w.tide && w.tide.frac > 0.7', 40000],
  ['jelly',     'w.chains >= 1', 30000],
  ['hourglass', 'w.hourglass && w.hourglass.flips >= 1 && !w.hourglass.settling && w.hourglass.until < 2.2', 40000],
  ['alchemy',   'w.alchemy && w.alchemy.frac >= 0.4', 40000],
  ['zen',       'w.g.count > w.g.cols * w.g.rows * 0.18', 20000],
];

async function modeShots(tag) {
  for (const [id, cond, max] of MODE_SHOTS) {
    await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=${id}&seed=4242`);
    const up = await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000);
    if (!up) { console.log(`  !! ${id} never came up`); continue; }
    await cdp.frames(20);
    if (id === 'zen') {
      // ZEN is the palette. Paint with it, through the shell's own brush, so the
      // shot shows what the control actually does.
      await cdp.eval(`(() => {
        const b = document.querySelectorAll('.zp-chip')[1]; b && b.click();     // Water
        const v = window.__game.view.board;
        for (let k = 0; k < 26; k++) {
          window.__ui.zen.stroke(v.x + v.w * (0.22 + 0.03 * k), v.y + v.h * (0.30 + 0.004 * k));
        }
        return 1; })()`);
    }
    const r = await drive(cond, max);
    if (!r.reached) console.log(`  ~~ ${id} never reached its shot condition (${JSON.stringify(r)})`);
    await pump();
    await settle();
    await shot(`${tag}-hud-${id}`);
  }

  // ALCHEMY's win state. Driving all the way to a completed level takes about a
  // minute of sim; endGame() then flips the shell to results, so the HUD is put
  // back on screen and re-pumped from the SAME finished world — the panel below
  // is the real objective, won.
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=alchemy&seed=4242`);
  if (await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
    await cdp.frames(20);
    const r = await drive('w.alchemy && w.alchemy.won', 60000);
    console.log('  alchemy win: ' + JSON.stringify(r));
    await cdp.eval('window.__ui.show("hud")');
    await pump();
    await settle();
    await shot(`${tag}-hud-alchemy-won`);
  }
}

/**
 * The whole game, end to end, through the real controls: attract -> mode sheet
 * -> every one of the six modes starts, ticks and shows the panels IT declared
 * -> pause -> resume -> results -> back to attract.
 *
 * The panel assertions are the point. A HUD that renders beautifully for the
 * mode the author happened to be looking at, and silently shows nothing for the
 * other five, passes every screenshot check ever written.
 */
const PANELS = {
  flow:      { obj: 0, flip: 0, rail: 0, pal: 0, score: 1, next: 1 },
  tide:      { obj: 0, flip: 0, rail: 1, pal: 0, score: 1, next: 1 },
  jelly:     { obj: 0, flip: 0, rail: 0, pal: 0, score: 1, next: 1 },
  hourglass: { obj: 0, flip: 1, rail: 0, pal: 0, score: 1, next: 1 },
  alchemy:   { obj: 1, flip: 0, rail: 0, pal: 0, score: 1, next: 1 },
  zen:       { obj: 0, flip: 0, rail: 0, pal: 1, score: 0, next: 0 },
};

/** The results card as it was before ALCHEMY had one of its own. */
async function blindResults() {
  await cdp.eval(`(() => {
    const g = window.__ui.results;
    window.__ui.results = (r) => g({ score: r.score, chains: r.chains, best: r.best,
      isBest: r.isBest, mode: r.mode });
    return 1; })()`);
}

async function endToEnd() {
  const fails = [];
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const q = (e) => cdp.eval(e);
  const click = (sel, n = 0) => cdp.eval(
    `(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}];
      if (!e) return 'missing'; e.click(); return 'clicked'; })()`);

  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&seed=7`);
  await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000);
  await cdp.frames(20);

  if (args.falsify) {
    // D9. The arm is the HUD as it was BEFORE this work: main.js hands over the
    // mode's field list and its published state, and the shell drops both on the
    // floor. Every per-mode check below must go red against it — if one stays
    // green it was never testing that the panel is wired to the mode at all.
    await cdp.eval(`(() => {
      const f = window.__ui.setHud;
      window.__ui.setHud = (s) => f({ ...s,
        hud: ['score', 'chains', 'combo', 'next'], modeId: undefined,
        tide: undefined, hourglass: undefined, alchemy: undefined, zen: undefined });
      return 1; })()`);
    // ...and the results card as it was BEFORE this work: score, chains, best,
    // and no idea which mode produced them.
    await blindResults();
  }

  ok('attract is the first screen', (await q('window.__ui.screen')) === 'attract');

  await q('window.__ui.openModes()');
  await new Promise((r) => setTimeout(r, 420));
  const cards = await q('document.querySelectorAll(".sheet-wrap.is-on .mcard:not(.locked)").length');
  ok('mode sheet offers all six modes', cards === 6, String(cards));

  const order = await q(`JSON.stringify([...document.querySelectorAll('.sheet-wrap.is-on .mcard')]
    .map(e => e.querySelector('.mcard-name').textContent))`);
  console.log('  cards: ' + order);

  for (let i = 0; i < 6; i++) {
    await q('window.__ui.openModes()');
    await new Promise((r) => setTimeout(r, 220));
    await click('.sheet-wrap.is-on .mcard', i);
    // ALCHEMY's card opens the campaign, not a level: 96 hand-built problems
    // behind a single button would be a button that starts the wrong one.
    const viaPicker = (await q('document.querySelectorAll(".sheet-wrap.is-on .sheet--lv").length')) === 1;
    if (viaPicker) {
      await new Promise((r) => setTimeout(r, 320));
      await click('.sheet--lv .lvt:not(.is-locked)');
      await new Promise((r) => setTimeout(r, 120));
    }
    const id = await q('window.__state.mode');
    if (id === 'alchemy') ok('alchemy: its card opens the campaign picker', viaPicker);
    await cdp.frames(50);
    const st = await cdp.state();
    ok(`${id}: starts and the sim advances`, st.state === 'play' && st.ticks > 8, `ticks ${st.ticks}`);
    ok(`${id}: score is finite`, Number.isFinite(st.score), String(st.score));

    const on = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)});
      return e ? (!e.classList.contains('hide') && !e.classList.contains('off')) : false; })()`;
    const seen = {
      obj: +(await q(on('.obj'))), flip: +(await q(on('.flip'))),
      rail: +(await q(on('.rail'))), pal: +(await q(on('.zen-pal'))),
      score: +(await q(on('.hud-score'))), next: +(await q(on('.next'))),
    };
    const want = PANELS[id];
    ok(`${id}: HUD shows exactly what the mode declared`,
      want && Object.keys(want).every((k) => seen[k] === want[k]),
      JSON.stringify(seen));

    if (id === 'alchemy') {
      const lab = await q('document.querySelector(".obj-label").textContent');
      const cnt = await q('document.querySelector(".obj-count").textContent');
      ok('alchemy: the objective is legible on screen', !!lab && /\d/.test(cnt), `${lab} | ${cnt}`);
    }
    if (id === 'tide') {
      const hgt = await q('document.querySelector(".rail i").style.height');
      ok('tide: the waterline rail has a height', parseFloat(hgt) > 0, hgt);
    }
    if (id === 'hourglass') {
      const num = await q('document.querySelector(".flip-num").textContent');
      ok('hourglass: the flip clock counts down', /\d/.test(num), num);
    }
    if (id === 'zen') {
      // On screen, not merely constructed: eleven chips in a hidden element is
      // not a palette, and counting them alone passes against a HUD that never
      // learned the mode is ZEN.
      const chips = await q(`(() => {
        const p = document.querySelector('.zen-pal');
        return (p && !p.classList.contains('hide')) ? p.querySelectorAll('.zp-chip').length : 0; })()`);
      ok('zen: the material palette is on screen', chips === 11, String(chips));
    }

    await click('.hud-pause .gb');
    ok(`${id}: pause halts the sim`, (await q('window.__state.state')) === 'pause');
    await click('.scr-pause .gb--primary');
    ok(`${id}: resume resumes`, (await q('window.__state.state')) === 'play');

    if (id === 'zen') {
      // ZEN cannot end. Its onTick vents the crown and clears world.over, so
      // asking it for a results screen is asking it to stop being a sandbox.
      await q('window.__game.world.over = true');
      await cdp.frames(6);
      ok('zen: has no fail state', (await q('window.__state.state')) === 'play');
      await click('.hud-pause .gb');
      await click('.scr-pause .card-row .gb', 1);              // QUIT
      ok('zen: quit returns to attract', (await q('window.__ui.screen')) === 'attract');
    } else {
      await q('window.__game.world.over = true');
      await cdp.frames(8);
      ok(`${id}: tops out into results`, (await q('window.__ui.screen')) === 'results');
      const rs = await q('document.querySelector(".scr-results .bigscore").textContent');
      ok(`${id}: results carry a score`, /\d/.test(rs), rs);
      await click('.scr-results .card-row .gb', 1);            // HOME
      ok(`${id}: home returns to attract`, (await q('window.__ui.screen')) === 'attract');
    }
  }

  if (args.falsify) {
    // Eight: the four "HUD shows exactly what the mode declared" lines for TIDE,
    // HOURGLASS, ALCHEMY and ZEN, plus the four detail checks that read the
    // objective text, the rail height, the flip clock and the palette. FLOW and
    // JELLY stay green on purpose — they declare no mode panel, so the arm
    // cannot change what their HUD should look like, and a gate that went red
    // for them would be measuring something other than what it claims.
    const MUST = 8;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST} required`);
    if (fails.length < MUST) { console.log('ARM TOO WEAK — these checks are not evidence'); process.exitCode = 1; }
    else console.log('arm ok: every per-mode panel check is capable of failing');
    return;
  }
  console.log(fails.length ? '\nEND-TO-END FAILURES:\n  ' + fails.join('\n  ') : '\nend-to-end: all green');
  if (fails.length) process.exitCode = 1;
}


/* ------------------------------------------------------------------ layout */
/**
 * WHERE THE TOP CONTROLS LAND, measured, in every mode.
 *
 * Playtest moved PAUSE up into the corner the NEXT tile used to hold and
 * dropped NEXT beneath it, under the account avatar. Every claim that change
 * makes is geometric, so every one of them is measured here rather than looked
 * at: pause is top-right and clear of the avatar, NEXT is below pause and clear
 * of the avatar, no mode panel runs under either, TIDE's rail does not either,
 * and the button still offers 44 px of target now that it is out of the thumb
 * arc.
 *
 * The avatar itself never loads under ?auto — that is deliberate, it keeps soak
 * runs hermetic — so the gate publishes --br8t-account-space by hand at the
 * 52 px /lib/auth/ui.js sets, and then measures a second time with it cleared.
 * A corner that is only ever tested at 0px is a corner nobody has tested.
 */

/** The account layer's FAB, from /lib/auth/ui.js: 40 px inset 10 px, top-right. */
const avatarBox = (vw) => ({ x: vw - 50, y: 10, right: vw - 10, bottom: 50 });
const hits = (a, b) => !!a && !!b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;

const GEOM = `JSON.stringify((() => {
  const R = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  // The real target, not the painted one: walk out from the centre asking the
  // document what is under each point, and stop at the first miss. A button
  // drawn at 48 px with an 8 px expanded hit area answers 64; one drawn at 48
  // with no expansion answers 48; and a check that measured the CSS width
  // instead would have believed either.
  const pb = document.querySelector('.hud-pause .gb');
  let hit = 0;
  if (pb) {
    const r = pb.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    for (let k = 8; k <= 44; k++) {
      const inside = [[cx - k, cy], [cx + k, cy], [cx, cy - k], [cx, cy + k]].every(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!(el && el.closest && el.closest('.hud-pause'));
      });
      if (!inside) break;
      hit = k * 2;
    }
  }
  return {
    vw: innerWidth, vh: innerHeight, hit,
    space: getComputedStyle(document.documentElement).getPropertyValue('--br8t-account-space').trim(),
    stack: R('.hud-stack'), pause: R('.hud-pause'), next: R('.next'),
    obj: R('.obj'), flip: R('.flip'), rail: R('.rail'),
  };
})())`;

/**
 * D9's arm for this gate: the NAIVE version of the same swap, which is what a
 * reasonable person writes first. Pause goes to the top of the markup but stays
 * pinned bottom-left, NEXT is absolutely placed in the corner without the
 * layout being told to leave it room, the panels stay full width, and the
 * button keeps its old 42 px with no expanded target. Every check below must go
 * red against it or it is not measuring position at all.
 */
async function breakLayout() {
  await cdp.eval(`(() => {
    const s = document.createElement('style');
    s.textContent = \`
      .hud-stack { display: block !important; }
      .hud-main, .hud-side { display: contents !important; }
      .hud-pause { position: fixed !important; left: 14px !important; bottom: 14px !important; }
      .hud-pause .gb { width: 42px !important; height: 42px !important; }
      .hud-pause .gb::after { inset: 0 !important; }
      .next { position: absolute !important; right: 0 !important; top: 200px !important; }
      /* ...and the mode sheet as it was: six cards that miss the bottom of a
         real phone by the height of its home indicator. */
      .sheet { padding: 10px 16px calc(var(--sab) + 16px) !important; }
      .grabber { margin: 0 auto 12px !important; }
      .sheet-head { padding: 0 4px 12px !important; }
      .sheet-body { gap: 8px !important; }
      .mcard { padding: 12px 14px !important; }
      .mcard-blurb { display: block !important; margin-top: 4px !important; line-height: 1.38 !important; }\`;
    document.head.appendChild(s);
    return 1; })()`);
}

/**
 * Does the mode list FIT?
 *
 * Measured at two bottom safe areas, because that is the whole bug: six cards
 * cleared a 390x844 desk viewport by four pixels and then scrolled by thirty in
 * the hand, where 34 px of home indicator comes off the same sheet. A gate that
 * only ever measures --sab: 0 would have called the shipped version green.
 * The tap-target floor rides along in the same check: the fix was to tighten
 * the cards, and tightening them into 40 px rows would be a worse bug than the
 * scrollbar.
 */
const SHEET_FIT = `JSON.stringify((() => {
  const body = document.querySelector('.sheet-wrap.is-on .sheet-body');
  const sheet = document.querySelector('.sheet-wrap.is-on .sheet');
  if (!body || !sheet) return null;
  const cards = [...body.querySelectorAll('.mcard')];
  return {
    cards: cards.length,
    overflow: body.scrollHeight - body.clientHeight,
    sheetH: +sheet.getBoundingClientRect().height.toFixed(1),
    cap: +(innerHeight * 0.88).toFixed(1),
    minCard: +Math.min(...cards.map((c) => c.getBoundingClientRect().height)).toFixed(1),
  };
})())`;

async function sheetFit(S, ok) {
  const tag = S.tag;
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&seed=4242`);
  if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
    ok(`${tag}: shell came up for the mode sheet`, false); return;
  }
  await cdp.frames(20);
  if (args.falsify) await breakLayout();
  await cdp.eval('window.__ui.openModes()');
  await new Promise((r) => setTimeout(r, 700));

  const read = async (h, sab) => {
    if (h !== S.h) await cdp.viewport(S.w, h, 1, true);
    await cdp.eval(sab
      ? `document.documentElement.style.setProperty('--sab', '${sab}')`
      : `document.documentElement.style.removeProperty('--sab')`);
    await new Promise((r) => setTimeout(r, 160));
    return JSON.parse(await cdp.eval(SHEET_FIT));
  };
  // Three viewports the same phone actually has. The third is the one that
  // caught this: iOS Safari with both bars showing keeps about 88% of the
  // device height, and 88% of THAT is what the sheet is allowed. A 390x844
  // number alone says the shipped sheet was fine, and it was not.
  // The home indicator goes with the notch, so only a phone tall enough to
  // have one is charged 34 px for it — billing an SE for a home indicator it
  // does not have is a test failing against a device that cannot exist.
  const SAFARI = Math.round(S.h * 0.883);
  const bar = S.h >= 800 ? '34px' : null;
  const cases = [
    ['standalone', S.h, null],
    ['home bar', S.h, bar],
    ['safari', SAFARI, bar],
  ];
  const got = [];
  for (const [name, h, sab] of cases) got.push([name, h, await read(h, sab)]);
  await cdp.eval(`document.documentElement.style.removeProperty('--sab')`);
  await cdp.viewport(S.w, S.h, 1, true);

  const fits = got.every(([, , m]) => m && m.cards === 6 && m.overflow === 0 && m.minCard >= 44);
  ok(`${tag}: the mode sheet fits without scrolling, cards still 44 px`, fits,
    got.map(([n, h, m]) => m ? `${n} ${S.w}x${h} ${m.sheetH}/${m.cap} over ${m.overflow}` : `${n} no sheet`)
      .join(' · ') + (got[0][2] ? ` · card ${got[0][2].minCard}` : ''));
}

/**
 * The three doors on the title screen have to FIT, side by side, on the
 * narrowest phone the game supports. STORY and QUICK PLAY are text pills whose
 * width follows their label, so this is a real constraint and not a formality:
 * an SE is 375 px wide and the row is two pills plus the modes icon.
 */
async function attractFit(S, ok) {
  // ?soak, not a bare load: it gives the attract screen without importing the
  // account layer, so the gate never signs an anonymous player in to Firebase.
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&seed=7`);
  if (!await cdp.waitFor('window.__ui && window.__state', 20000)) {
    ok(`${S.tag}: attract came up`, false); return;
  }
  await cdp.frames(20);
  // MEASURE THE ROW A RETURNING PLAYER SEES, not the one a fresh profile shows.
  // STORY carries the level it will resume — "Story  lv 25" — and that is 30 px
  // wider than "Story". This gate ran on an empty profile, so the label was
  // never there, and the version it certified had the three doors touching at
  // 390 px and overflowing an SE for everybody who had played before. A check
  // that can only ever see the easy state is not a check.
  await cdp.eval(`(() => { const s = window.__game.save;
    for (let i = 1; i <= 24; i++) s.recordLevel(i, 3); return 1; })()`);
  await cdp.eval('window.__ui.show("attract")');
  await new Promise((r) => setTimeout(r, 240));
  // The arm. Every check below has to be able to go red, so it breaks all three
  // things they measure at once: pills too fat for the row, and an icon target
  // under the 44 px minimum. A count of buttons cannot be broken by CSS, so
  // there is no separate "there are three of them" check to leave stranded —
  // the count is folded into the fit.
  if (args.falsify) {
    await cdp.eval(`(() => { const s = document.createElement('style');
      // !important, because the row now has a higher-specificity rule of its own
      // for the returning-player state and the arm has to out-rank it. An arm
      // that loses a specificity fight is an arm that proves nothing.
      s.textContent = '.attract-btns .gb--pill { padding: 0 62px !important } ' +
                      '.attract-btns .gb--icon { width: 28px !important; height: 28px !important }';
      document.head.append(s); return 1; })()`);
    await new Promise((r) => setTimeout(r, 120));
  }
  const g = JSON.parse(await cdp.eval(`(() => {
    const row = document.querySelector('.attract-btns');
    const bs = [...row.querySelectorAll('.gb')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, right: r.right, y: r.top, bottom: r.bottom, w: r.width, h: r.height,
               label: (e.textContent || e.getAttribute('aria-label') || '').trim() };
    });
    const r = row.getBoundingClientRect();
    return JSON.stringify({ bs, row: { x: r.left, right: r.right }, vw: innerWidth });
  })()`));

  // `wide` rides INSIDE both fit checks rather than standing as a check of its
  // own. It is a statement about the fixture, not about the layout — it can
  // never go red against a broken stylesheet, and this gate's arm requires
  // every one of its checks to be capable of that. Carried this way, the day
  // paintStory stops labelling the button both fit lines fail instead of
  // quietly going back to measuring the easy row.
  const wide = /lv\s*\d/.test(g.bs[0] ? g.bs[0].label : '');
  const inside = wide && g.bs.length === 3 && g.bs.every((b) => b.x >= g.row.x - 1 && b.right <= g.row.right + 1);
  ok(`${S.tag}: three doors fit, with a level showing on STORY`, inside,
    g.bs.map((b) => `${b.label} ${b.x.toFixed(0)}-${b.right.toFixed(0)}`).join(' · ') +
    ` in ${g.row.x.toFixed(0)}-${g.row.right.toFixed(0)}`);

  let gap = Infinity;
  for (let i = 1; i < g.bs.length; i++) gap = Math.min(gap, g.bs[i].x - g.bs[i - 1].right);
  ok(`${S.tag}: they do not touch each other`, wide && g.bs.length === 3 && gap >= 8, `${gap.toFixed(0)} px apart`);
  ok(`${S.tag}: every door is a 44 px target`,
    g.bs.length === 3 && g.bs.every((b) => b.h >= 44 && b.w >= 44),
    g.bs.map((b) => `${b.w.toFixed(0)}x${b.h.toFixed(0)}`).join(' '));
  await cdp.eval(`(() => { try { localStorage.removeItem('silt.levels'); } catch (e) {} return 1; })()`);
}

/**
 * MEASURE THE TAPPABLE EXTENT, not the drawn box.
 *
 * `el.click()` does not care how big an element is, so every interaction check
 * in this file was green against a ZEN palette whose tint dots were 16 px —
 * seventeen of its eighteen controls under the 44 px minimum, in the one mode
 * whose entire interaction IS the palette. getBoundingClientRect is not the
 * answer either: it cannot see a ::before that widens the target, which is
 * exactly how the fix works.
 *
 * So probe. From each control's centre, walk outwards until elementFromPoint
 * stops landing on that control, and report the box that survives. That
 * measures pseudo-elements, overlap by later siblings, and anything invisible
 * sitting on top — a real thumb's answer rather than the stylesheet's.
 *
 * The bar is 32x44, not 44x44: eleven materials have to share one row on a
 * 390 px phone, and an iOS keyboard key is 32 wide. Full height is what makes
 * those hittable.
 */
const HIT_PROBE = `(() => {
  const SEL = '.gb, .mcard, .lvt, .lv-chip, .seg button, .tog, .zp-chip, .zp-tint, .zp-size';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    // A control half-scrolled out of a sheet measures small because it IS half
    // there, which is not a design fault. Judge only what is fully on screen:
    // the campaign picker scrolls 100 tiles and its top and bottom rows were
    // reporting as undersized targets every run.
    let clip = null;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (/(auto|scroll)/.test(acs.overflowY + acs.overflowX)) { clip = a.getBoundingClientRect(); break; }
    }
    if (clip && (r.top < clip.top - 1 || r.bottom > clip.bottom + 1)) continue;
    if (r.top < 0 || r.bottom > innerHeight) continue;
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const mine = (x, y) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    };
    if (!mine(cx, cy)) continue;                 // covered by something else entirely
    const reach = (dx, dy) => { let n = 0; while (n < 30 && mine(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    const w = reach(-1, 0) + reach(1, 0) + 1;
    const h = reach(0, -1) + reach(0, 1) + 1;
    out.push({ w, h, dw: Math.round(r.width), dh: Math.round(r.height),
      cls: el.className.split(' ')[0] || el.tagName,
      lab: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14) });
  }
  return JSON.stringify(out);
})()`;

async function hitGate() {
  const fails = [];
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const MIN_W = 32, MIN_H = 44;

  await cdp.viewport(390, 844, 1, true);
  for (const [name, url, open] of [
    ['title screen', '?preserve=1&dpr=1&soak&seed=3', null],
    ['modes sheet', '?preserve=1&dpr=1&soak&seed=3', 'window.__ui.openModes()'],
    ['settings', '?preserve=1&dpr=1&soak&seed=3', 'window.__ui.openSettings()'],
    ['campaign', '?preserve=1&dpr=1&soak&seed=3', 'window.__ui.openLevels()'],
    ['zen palette', '?preserve=1&dpr=1&auto&mode=zen&seed=3', null],
  ]) {
    await cdp.goto(`${base}/gms/2d/silt/index.html${url}`);
    if (!await cdp.waitFor('window.__ui && window.__state', 20000)) { ok(`${name}: came up`, false); continue; }
    await cdp.frames(20);
    // The arm collapses the hit boxes back to the drawn dots.
    if (args.hitbug) {
      await cdp.eval(`(() => { const s = document.createElement('style');
        s.textContent = '.zp-chip::before, .zp-tint::before, .zp-size::before { inset: 0 } ' +
          '.gb--icon::after, .seg button::after, .lv-chip::after { inset: 0 } ' +
          '.tog::before { inset: 0 } .seg button { padding: 6px 10px }';
        document.head.append(s); return 1; })()`);
    }
    if (open) { await cdp.eval(open); await new Promise((r) => setTimeout(r, 500)); }
    const list = JSON.parse(await cdp.eval(HIT_PROBE));
    const small = list.filter((b) => b.w < MIN_W || b.h < MIN_H);
    if (args.hitdump) console.log('    ' + list.map((b) => `${b.cls}${b.lab ? '"' + b.lab + '"' : ''} tap ${b.w}x${b.h} drawn ${b.dw}x${b.dh}`).join('\n    '));
    ok(`${name}: every control is at least ${MIN_W}x${MIN_H} to a thumb`,
      list.length > 0 && small.length === 0,
      `${list.length} controls, ${small.length} too small` +
      (small.length ? ' — ' + small.slice(0, 4).map((b) => `${b.cls}${b.lab ? ' "' + b.lab + '"' : ''} ${b.w}x${b.h}`).join(', ') : ''));
  }

  if (args.falsify || args.hitbug) {
    // All five screens carry at least one control whose target is built by a
    // pseudo-element, so all five must go red. Anything less means a screen is
    // being measured against nothing.
    console.log(`\nfalsification arm: ${fails.length} of 5 checks went red`);
    if (fails.length < 5) { console.log('ARM TOO WEAK — these sizes are not evidence'); process.exitCode = 1; }
    else console.log('arm ok: the hit probe can see a control shrink');
    return;
  }
  console.log(fails.length ? '\nHIT FAILURES:\n  ' + fails.join('\n  ') : '\nhit targets: all green');
  if (fails.length) process.exitCode = 1;
}

const LAYOUT_MODES = ['flow', 'tide', 'jelly', 'hourglass', 'alchemy', 'zen'];

async function layoutGate() {
  const fails = [];
  let total = 0;
  const ok = (name, cond, detail = '') => {
    total++;
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };

  for (const S of SIZES) {
    console.log(`\n  --- ${S.tag} ${S.w}x${S.h}`);
    await cdp.viewport(S.w, S.h, 1, true);
    await sheetFit(S, ok);
    await attractFit(S, ok);
    for (const id of LAYOUT_MODES) {
      await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=${id}&seed=4242`);
      if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
        ok(`${id}: shell came up`, false); continue;
      }
      await cdp.frames(20);
      if (args.falsify) await breakLayout();
      await pump();
      await settle();

      const tag = `${S.tag} ${id}`;
      for (const space of ['52px', '0px']) {
        await cdp.eval(`document.documentElement.style.setProperty('--br8t-account-space', '${space}')`);
        await new Promise((r) => setTimeout(r, 90));
        const g = JSON.parse(await cdp.eval(GEOM));
        const av = space === '52px' ? avatarBox(g.vw) : null;

        // Both, together: a control column with no measurable box is a layout
        // that has stopped existing, which is exactly what the arm below does
        // to ZEN — the mode that declares hud: [] and has nothing else in it.
        if (!g.pause || !g.stack) { ok(`${tag} @${space}: the top control column is on screen`, false); continue; }

        ok(`${tag} @${space}: pause is the top-right control, clear of the avatar`,
          g.pause.y - g.stack.y < 6 && g.pause.right > g.vw * 0.55 && !hits(g.pause, av),
          `pause ${g.pause.x.toFixed(0)},${g.pause.y.toFixed(0)} ${g.pause.w}x${g.pause.h} stack y ${g.stack.y.toFixed(0)}`);

        ok(`${tag} @${space}: pause offers a 44 px target`, g.hit >= 44, `${g.hit} px`);

        if (g.next) {
          ok(`${tag} @${space}: NEXT is below pause, in the corner, clear of the avatar`,
            g.next.y >= g.pause.bottom - 0.5 && Math.abs(g.next.right - g.stack.right) < 1.5 && !hits(g.next, av),
            `next y ${g.next.y.toFixed(0)} vs pause bottom ${g.pause.bottom.toFixed(0)}, right ${g.next.right.toFixed(0)} vs ${g.stack.right.toFixed(0)}`);

          const panel = g.obj || g.flip;
          if (panel) {
            ok(`${tag} @${space}: the mode panel stops short of the control column`,
              panel.right <= g.next.x + 1 && !hits(panel, g.next),
              `panel right ${panel.right.toFixed(0)} vs next left ${g.next.x.toFixed(0)}`);
          }
          if (g.rail) {
            ok(`${tag} @${space}: the waterline rail clears the NEXT tile`, !hits(g.rail, g.next),
              `rail y ${g.rail.y.toFixed(0)} vs next bottom ${g.next.bottom.toFixed(0)}`);
          }
        }
      }
    }
  }

  if (args.falsify) {
    console.log(`\nfalsification arm: ${fails.length} of ${total} checks went red`);
    if (fails.length < total) {
      console.log('ARM TOO WEAK — these positions are not evidence:\n  ' +
        '(the checks that stayed green are the ones the naive layout happens to satisfy)');
      process.exitCode = 1;
    } else console.log('arm ok: every position check is capable of failing');
    return;
  }
  console.log(fails.length ? '\nLAYOUT FAILURES:\n  ' + fails.join('\n  ') : '\nlayout: all green');
  if (fails.length) process.exitCode = 1;
}

/**
 * The ALCHEMY win card, driven by a level actually being solved.
 *
 * Nothing here is staged. The bot plays a real level through the real host loop
 * until the mode declares it won; main.js's own endGame() is what calls
 * UI.results(), so what is photographed and asserted is the card a player gets.
 * The losing half is driven the same way — by pushing the world's clock past the
 * level's limit, which is the mode's own fail condition — because "a timed-out
 * level and a completed one must never look the same" is a claim about two
 * cards, and one of them cannot be checked by looking at the other.
 */
async function alchemyWin() {
  const fails = [];
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const q = (e) => cdp.eval(e);
  const click = (sel, n = 0) => cdp.eval(
    `(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}];
      if (!e) return 'missing'; e.click(); return 'clicked'; })()`);
  const cardState = `(() => { const e = document.querySelector('.card--alc');
    if (!e || e.classList.contains('hide')) return 'none';
    return e.classList.contains('is-won') ? 'won' : 'lost'; })()`;

  await cdp.viewport(390, 844, 1, true);
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=alchemy&seed=4242`);
  if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
    console.log('  !! shell never came up'); process.exitCode = 1; return;
  }
  await cdp.frames(20);
  if (args.falsify) await blindResults();
  // Same z-order arm as the probe: put the shipped bug back and the campaign
  // opens behind the card that asked for it.
  if (args.zbug) {
    await cdp.eval(`(() => { const s = document.createElement('style');
      s.textContent = '.sheet-wrap { z-index: 6 }'; document.head.append(s); return 1; })()`);
  }

  // MORE THAN ONE SEED, because a level is only guaranteed to fall to the bot
  // on TWO of three seeds — that is the bar tools/modesim.mjs ships it against.
  // Pinning this gate to a single seed asks for a stricter property than the
  // campaign ever promised, and it duly went red on a level the table says the
  // bot beats 3 of 3: the win card was fine, the seed was not. What is under
  // test here is the CARD.
  let lv = JSON.parse(await q('JSON.stringify(window.__game.world.alchemy)'));
  let wonUrl = `${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=alchemy&seed=4242`;
  let r = await drive('w.alchemy && w.alchemy.won', 90000);
  for (const seed of [900, 1213]) {
    if (r.reached) break;
    console.log(`  seed ${seed}: the bot did not solve it, trying another`);
    wonUrl = `${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=alchemy&seed=${seed}`;
    await cdp.goto(wonUrl);
    await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000);
    await cdp.frames(20);
    lv = JSON.parse(await q('JSON.stringify(window.__game.world.alchemy)'));
    r = await drive('w.alchemy && w.alchemy.won', 90000);
  }
  console.log('  played: ' + JSON.stringify(r));
  ok('the bot solves a real ALCHEMY level', r.reached);
  // Hand back to the host loop — endGame() is main.js's call, not this tool's.
  await cdp.frames(30);
  ok('a solved level lands on the results screen', (await q('window.__ui.screen')) === 'results');
  ok('a solved level shows the WIN card', (await q(cardState)) === 'won', String(await q(cardState)));

  const earned = await q('window.__game.world.alchemy.stars');
  const lit = await q('document.querySelectorAll(".bigstars-row svg.on").length');
  const offered = await q('document.querySelectorAll(".bigstars-row svg").length');
  ok('the win card shows the stars this run earned', lit === earned && lit > 0, `${lit} lit, mode says ${earned}`);
  ok('the stars still on offer are visible too', offered === 3, String(offered));
  const title = await q('document.querySelector(".alc-title").textContent');
  ok('the win card names the level', title === lv.name, `${title} | ${lv.name}`);
  const nxt = await q('document.querySelector(".card--alc .gb--primary").textContent');
  ok('the win card offers the next level',
    /next level/i.test(nxt) && nxt.indexOf('lv ' + (lv.id + 1)) >= 0, nxt);
  await settle();
  if (SHOTS) await shot('phone-alchemy-win');

  // REPLAY sits beside NEXT LEVEL on a WON level, and must restart the level you
  // just finished rather than the one after it — the two buttons are adjacent
  // and one of them being wired to the other is the whole risk.
  const againVis = await q(`(() => { const e = document.querySelector('.alc-again');
    if (!e || e.classList.contains('hide')) return 'hidden';
    const r = e.getBoundingClientRect();
    // Both bounds. A minimum-only check let a 294px replay button — the whole
    // card, sitting on top of NEXT LEVEL's row — pass as "shown".
    const w = Math.round(r.width), h = Math.round(r.height);
    return w >= 44 && h >= 44 && w <= 90 ? 'shown ' + w + 'x' + h : 'wrong size ' + w + 'x' + h; })()`);
  ok('a won level offers a replay button', /^shown/.test(againVis), String(againVis));
  await click('.alc-again');
  await cdp.frames(12);
  ok('replay restarts THIS level, not the next one',
    (await q('window.__game.world.cfg.levelId')) === lv.id,
    `lv ${await q('window.__game.world.cfg.levelId')} vs ${lv.id}`);
  // Back to the win card for the checks below, by RELOADING THE SEED THAT WON.
  // Restarting through startLevel() gives the level a fresh random seed and the
  // bot only beats a level on two seeds out of three, so that route fails this
  // gate about a third of the time for a reason that has nothing to do with it.
  await cdp.goto(wonUrl);
  await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000);
  await cdp.frames(20);
  await drive('w.alchemy && w.alchemy.won', 90000);
  await cdp.frames(30);

  await click('.card--alc .gb--primary');
  await cdp.frames(12);
  ok('NEXT LEVEL starts the level after this one',
    (await q('window.__state.mode')) === 'alchemy' &&
    (await q('window.__game.world.cfg.levelId')) === lv.id + 1,
    `lv ${await q('window.__game.world.cfg.levelId')}`);
  ok('the stars are banked against the level', (await q(`window.__game.save.starsFor(${lv.id})`)) >= earned);

  // Now lose one, on the mode's own terms. Let the bot get part of the way
  // first: a losing card photographed at 0% proves the card exists and nothing
  // about whether it can say how close you came.
  const part = await drive('w.alchemy && w.alchemy.frac > 0.4', 30000);
  console.log('  part-played: ' + JSON.stringify(part));
  await q('window.__game.world.t = 1e4');
  await cdp.frames(24);
  ok('a level that runs out of time shows the OUT OF TIME card', (await q(cardState)) === 'lost',
    String(await q(cardState)));
  ok('a timed-out level shows no earned stars',
    (await q('document.querySelectorAll(".bigstars-row svg.on").length')) === 0);
  // Two ways to lose, and the card has to name the right one. Which one the bot
  // hit is the WORLD's answer, not this tool's, so ask the world.
  const left = await q('window.__game.world.alchemy.left');
  const kick = await q('document.querySelector(".alc-kicker").textContent');
  ok('the two cards do not read the same', !/complete/i.test(kick) && /time|topped/i.test(kick), kick);
  ok('the losing card names the failure the world actually had',
    left > 0 ? /topped out/i.test(kick) : /out of time/i.test(kick), `${kick} with ${left}s left`);
  const objn = await q('(document.querySelector(".alc-obj-num") || {}).textContent || ""');
  ok('the losing card says how close the objective got', /\d+\s*\/\s*\d+/.test(objn), objn);
  await settle();
  if (SHOTS) await shot('phone-alchemy-lost');

  // And the clock specifically, from a healthy board, so the timeout branch is
  // exercised rather than left to whether the bot happened to top out.
  await q('window.__game.startLevel(3)');
  await cdp.frames(24);
  await q('window.__game.world.t = 1e4');
  await cdp.frames(24);
  const kick2 = await q('document.querySelector(".alc-kicker").textContent');
  ok('a level whose clock runs out says OUT OF TIME',
    (await q(cardState)) === 'lost' && /out of time/i.test(kick2), kick2);

  // The two halves of this work, tied together: the card sends you back to the
  // campaign and the campaign already knows what you just did.
  await click('.card--alc .card-row .gb', 0);                 // LEVELS
  await new Promise((r) => setTimeout(r, 360));
  const tiles = await q('document.querySelectorAll(".sheet--lv .lvt").length');
  const onTile = await q(`(() => { const t = document.querySelectorAll('.sheet--lv .lvt')[${lv.id - 1}];
    return t ? t.querySelectorAll('.lvt-stars svg.on').length : -1; })()`);
  ok('the results card opens the campaign with the new stars already on the tile',
    tiles > 0 && onTile === earned, `${tiles} tiles, lv ${lv.id} shows ${onTile} of ${earned}`);
  // Counting tiles is not seeing them. This check counted 96 of them while the
  // picker was rendering BEHIND the result card that opened it, invisible to
  // the player, and stayed green for the whole of that bug's life.
  ok('the campaign opens IN FRONT of the result card',
    (await frontLayer('.sheet--lv')) === 'sheet', String(await frontLayer('.sheet--lv')));

  if (args.falsify) {
    // Eight. The arm blinds the results card to WHICH mode finished, which is
    // exactly the state this work replaced, so every claim about the alchemy
    // card must collapse: the card itself, the two star counts, the level name,
    // the next-level button, that the button starts the next level, that the
    // kicker changes, and the objective line on the loss.
    // Four cannot move and are named rather than counted: the bot still solves
    // the level, results is still the screen, the save still banks the stars,
    // and "no stars on a timed-out level" is vacuously true against a card that
    // never draws stars at all.
    const MUST = 9;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST} required`);
    if (fails.length < MUST) { console.log('ARM TOO WEAK — these checks are not evidence'); process.exitCode = 1; }
    else console.log('arm ok: every alchemy-result check is capable of failing');
    return;
  }
  console.log(fails.length ? '\nALCHEMY RESULT FAILURES:\n  ' + fails.join('\n  ') : '\nalchemy results: all green');
  if (fails.length) process.exitCode = 1;
}

/* ------------------------------------------------------------------ payout */
/**
 * DOES A CHAIN PAY?
 *
 * The complaint this gate exists for: "chains read beautifully ... but the
 * chain doesn't read as a SCORE. There is no floating +74, no chain-size
 * callout — just sparks and a small CHAINS 5 pill in the corner."
 *
 * Every check here is one a player could make by looking, and every one of them
 * is capable of being wrong in a way `querySelector('.payout')` is not:
 *
 *  - THE NUMBER IS THE AWARD, not merely a number. World.score moves only on a
 *    chain, so `score after - score before` is the exact award, and the payout
 *    is compared against it. A payout printing the running total, or the chain
 *    count, or a constant, fails this line while satisfying "a number appeared".
 *  - IT IS ON THE BOARD. Its centre must lie inside the board rect and OUTSIDE
 *    the top-left control column — the corner is precisely where the reward
 *    already was, and moving it three pixels would otherwise pass.
 *  - IT LEAVES. A number that never goes away is a HUD field, not a payout.
 *  - NOTHING IS ON TOP OF IT. elementFromPoint ignores pointer-events:none, so
 *    the payout can never be the hit itself; what it CAN prove is that no sheet
 *    or card is covering the spot, which is the bug class that hid the level
 *    picker behind the card that opened it.
 *
 * The arm (--payout --falsify) is the shell as it was before this work: the
 * frame loop still hands over the score, the chain count and the combo, and the
 * shell drops all three on the floor. Every check below must go red against it.
 */
async function payoutGate() {
  const fails = [];
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const q = (e) => cdp.eval(e);

  // Read the payout the way a player reads it: what it says, where it is, and
  // whether anything is in front of it.
  // The board rect comes from the VIEW — js/core/viewport.js's own letterboxed
  // answer, the same rect the renderer draws into — and not from the payout's
  // own container, which would make "is it on the board" tautologically true of
  // wherever the container happens to be. Same for the corner: the box tested
  // against is the live control column, measured, not a hardcoded rectangle.
  const READ = `JSON.stringify((() => {
    const n = document.querySelector('.payout:not(.is-out)');
    const stack = document.querySelector('.hud-stack');
    const all = document.querySelectorAll('.payout').length;
    if (!n) return { all, live: 0 };
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    const b = window.__game.view.board;
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const front = document.elementFromPoint(cx, cy);
    const sr = stack ? stack.getBoundingClientRect() : null;
    const overlaps = (a, c) => !!a && !!c && a.left < c.right && a.right > c.left
                                         && a.top < c.bottom && a.bottom > c.top;
    return {
      all, live: 1,
      text: n.querySelector('.payout-num').textContent,
      cap: n.querySelector('.payout-cap').textContent,
      capOn: n.querySelector('.payout-cap').classList.contains('on'),
      tier: n.classList.contains('is-huge') ? 'huge' : n.classList.contains('is-big') ? 'big' : 'plain',
      shown: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05
             && r.width > 8 && r.height > 8,
      onBoard: cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h,
      inCorner: overlaps(r, sr),
      covered: !!(front && front.closest && (front.closest('.sheet-wrap') || front.closest('.modal-wrap'))),
      cx, cy, board: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)],
    };
  })())`;

  const PROG = `JSON.stringify((() => {
    const p = document.querySelector('.hud-prog');
    if (!p) return null;
    const cs = getComputedStyle(p);
    const fill = p.querySelector('i');
    return { off: p.classList.contains('off') || cs.display === 'none',
             w: fill ? fill.style.width : '', lab: p.querySelector('.hud-prog-lab').textContent,
             best: p.classList.contains('is-best') };
  })())`;

  /**
   * Play, through the real bot and the real host loop, until one more chain has
   * landed — pushing the shell exactly as main.js's frame loop does, on every
   * tick. Nothing is staged: the payload is read off the live world each step.
   */
  async function toNextChain(max = 40000) {
    return JSON.parse(await cdp.eval(`(async () => {
      const M = await import('${base}/gms/2d/silt/js/modes/index.js');
      const { Bot } = await import('${base}/gms/2d/silt/js/ai/bot.js');
      const w = window.__game.world, m = M.byId(window.__state.mode);
      if (!window.__pbot || window.__pbot.w !== w) window.__pbot = { w, b: new Bot(w) };
      const push = () => window.__ui.setHud({
        score: w.score, chains: w.chains, combo: w.combo, next: w.nextPiece,
        mode: m.name, modeId: m.id, hud: m.hud,
        tide: w.tide, hourglass: w.hourglass, alchemy: w.alchemy, zen: w.zen });
      const c0 = w.chains, s0 = w.score;
      push();
      let i = 0;
      for (; i < ${max}; i++) {
        window.__pbot.b.update(); window.__game.step(1); push();
        if (w.chains > c0 || w.over) break;
      }
      return JSON.stringify({ i, c0, c1: w.chains, s0, s1: w.score, over: w.over });
    })()`));
  }

  /** Two adjacent frames — the shape the frame loop delivers during a cascade. */
  async function twoFrames(gain1, gain2) {
    return cdp.eval(`(async () => {
      const M = await import('${base}/gms/2d/silt/js/modes/index.js');
      const w = window.__game.world, m = M.byId(window.__state.mode);
      const base = { combo: 1, next: w.nextPiece, mode: m.name, modeId: m.id, hud: m.hud };
      const s0 = w.score, c0 = w.chains;
      window.__ui.setHud({ ...base, score: s0, chains: c0 });
      window.__ui.setHud({ ...base, score: s0 + ${gain1}, chains: c0 + 1 });
      window.__ui.setHud({ ...base, score: s0 + ${gain1} + ${gain2}, chains: c0 + 2 });
      return 1; })()`);
  }

  // --se runs the whole gate on the short phone instead. The payout is placed in
  // BOARD percentages and the best rail lives in the score column, so both are
  // things a 375x667 viewport can break without 390x844 noticing.
  const S = SIZES[SIZES.length - 1];
  console.log(`  --- ${S.tag} ${S.w}x${S.h}`);
  await cdp.viewport(S.w, S.h, 1, true);
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=flow&seed=4242`);
  if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
    console.log('  !! shell never came up'); process.exitCode = 1; return;
  }
  await cdp.frames(20);

  if (args.falsify) {
    // The shell as it shipped: main.js hands over score, chains and combo every
    // frame and none of them reaches the board. Everything below must go red.
    await cdp.eval(`(() => { const f = window.__ui.setHud;
      window.__ui.setHud = (s) => f({ ...s, score: 0, chains: 0, combo: 0 });
      return 1; })()`);
  }
  // The SECOND arm, and the one that matters most, because the first cannot
  // reach it: a payout that is drawn perfectly, says exactly the right number,
  // and does it back in the corner the reward already lived in. Everything about
  // this work is WHERE the number is, so exactly one check — the position — must
  // go red here and every other line must stay green. If they all go red the
  // arm is too blunt to prove anything; if none does, the position check is
  // decoration.
  if (args.paybug) {
    await cdp.eval(`(() => {
      const r = document.querySelector('.hud-stack').getBoundingClientRect();
      const s = document.createElement('style');
      s.textContent = '.payout-host { left: ' + r.left + 'px !important; top: ' + r.top +
        'px !important; width: ' + r.width + 'px !important; height: ' + r.height + 'px !important; }';
      document.head.append(s); return 1; })()`);
  }

  /* --------------------------------------------------- one chain, one payout */
  const r1 = await toNextChain();
  console.log('  first chain: ' + JSON.stringify(r1));
  const p1 = JSON.parse(await q(READ));
  const award = r1.s1 - r1.s0;
  const expect = '+' + award.toLocaleString('en-US');

  ok('a chain puts a payout on screen', p1.live === 1 && p1.shown, JSON.stringify(p1));
  // --payout --shots: catch it in a still. A thing that exists for a second and
  // a half cannot be reviewed any other way.
  if (args.shots) await shot(`${S.tag}-payout`);
  ok('the payout is the points THAT chain earned', p1.text === expect,
    `${p1.text || '(none)'} vs the score's own delta ${expect}`);
  ok('the payout is on the board, not in the corner pill',
    !!p1.onBoard && !p1.inCorner && !p1.covered,
    `at ${p1.cx},${p1.cy} onBoard ${p1.onBoard} inCorner ${p1.inCorner} covered ${p1.covered}`);

  const saw = p1.live === 1;
  await new Promise((r) => setTimeout(r, 2400));
  const gone = JSON.parse(await q(READ));
  ok('the payout rises and goes — it is not a HUD field', saw && gone.all === 0,
    `saw ${saw}, ${gone.all} left after 2.4s`);

  /* ---------------------------------------- a cascade is ONE number, not five */
  await twoFrames(award, award);
  await new Promise((r) => setTimeout(r, 120));
  const p2 = JSON.parse(await q(READ));
  ok('two chains in quick succession merge into one number',
    p2.all === 1 && p2.text === '+' + (award * 2).toLocaleString('en-US'),
    `${p2.all} payouts, reading ${p2.text}`);
  ok('a merged payout says how many chains', p2.capOn && /×\s*2/.test(p2.cap || ''), p2.cap);
  if (args.shots) await shot(`${S.tag}-payout-combo`);

  /* ------------------------- a big clear must not print like a small one */
  await new Promise((r) => setTimeout(r, 2400));
  await twoFrames(award, 0);
  await new Promise((r) => setTimeout(r, 100));
  const small = JSON.parse(await q(READ));
  await new Promise((r) => setTimeout(r, 2400));
  await twoFrames(award * 12, 0);
  await new Promise((r) => setTimeout(r, 100));
  const big = JSON.parse(await q(READ));
  ok('a much larger chain does not look like an ordinary one',
    small.tier === 'plain' && (big.tier === 'big' || big.tier === 'huge'),
    `${award} -> ${small.tier}, ${award * 12} -> ${big.tier}`);
  if (args.shots) await shot(`${S.tag}-payout-huge`);

  /* --------------------------------------------- progress with nothing scored */
  // The other half of the complaint: HOURGLASS and JELLY can be played for
  // minutes at zero. Bank a best, start a fresh run, and the score gains a rail
  // that says how far into that best this run has got.
  const bestScore = Math.max(400, award * 8);
  await q(`window.__game.save.recordGame('flow', ${bestScore}, 5, 100)`);
  // Back to the title first. UI.show() refuses to re-enter the screen it is
  // already on, so starting a run straight over a running one never gives the
  // shell the "new run" transition — which is a property of the shell worth
  // knowing about, not something to route around silently.
  await q('window.__game.attract()');
  await cdp.frames(4);
  await q(`window.__game.start('flow', { seed: 4242 })`);
  await cdp.frames(12);
  const r2 = await toNextChain();
  const pr = JSON.parse(await q(PROG));
  await new Promise((r) => setTimeout(r, 600));
  const pr2 = JSON.parse(await q(PROG));
  const want = Math.min(100, Math.round((r2.s1 / bestScore) * 100)) + '%';
  ok('a run at nothing still shows where it is against your best',
    !!pr && !pr.off && pr2.w === want && parseFloat(pr2.w) > 0 &&
    pr2.lab === 'best ' + bestScore.toLocaleString('en-US'),
    pr ? `${pr2.w} (want ${want}) · "${pr2.lab}"` : 'no rail');

  // Past the best, the rail is pinned at 100% — so the PERCENTAGE cannot be
  // what tells you that you have overtaken it, and a rail that says nothing at
  // the one moment it is about would be worse than no rail. Push the score past
  // the best and the label has to change.
  const over = JSON.parse(await cdp.eval(`(async () => {
    const M = await import('${base}/gms/2d/silt/js/modes/index.js');
    const w = window.__game.world, m = M.byId(window.__state.mode);
    window.__ui.setHud({ score: ${bestScore + 1}, chains: w.chains, combo: 1, next: w.nextPiece,
      mode: m.name, modeId: m.id, hud: m.hud });
    return ${PROG}; })()`));
  ok('overtaking your best is what the rail is FOR', over && over.best && /new best/i.test(over.lab),
    over ? `${over.w} "${over.lab}"` : 'no rail');
  if (args.shots) await shot(`${S.tag}-payout-prog`);

  /* ---------------------------------------- and if nothing has scored at all */
  // The rail only helps a player who already has a best. A first run in
  // HOURGLASS has neither, and that is the run the playtester sat in: two
  // minutes at zero with nothing on screen changing. After 25 s with no chain
  // the hint line comes back and says what pays — once, and only to a player
  // who is not already chaining. Both halves are checked, on real runs: a nudge
  // that fires at a player mid-combo is worse than no nudge at all.
  const HINT = `(document.querySelector('.hud-hint') || {}).textContent || ''`;
  const HINTON = `(() => { const e = document.querySelector('.hud-hint');
    return !!e && !e.classList.contains('gone') && +getComputedStyle(e).opacity > 0.05; })()`;

  // This is still the FLOW run from the rail check, and it has really chained.
  // nudgeSeek only winds the clock back; every other condition on the nudge has
  // to hold, and "this player has never chained" does not.
  const g0 = await q(HINT);
  await q('window.__ui.nudgeSeek(26000)');
  await pump();
  await new Promise((r) => setTimeout(r, 260));
  ok('a player who IS chaining is never nagged', (await q(HINT)) === g0,
    `chains ${r2.c1}, hint "${await q(HINT)}"`);

  await q('window.__game.attract()');
  await cdp.frames(4);
  await q(`window.__game.start('hourglass', { seed: 4242 })`);
  await cdp.frames(10);
  const h0 = await q(HINT);
  await q('window.__ui.nudgeSeek(26000)');
  await pump();
  await new Promise((r) => setTimeout(r, 160));
  const h1 = await q(HINT);
  const hLines = await q(`(() => { const e = document.querySelector('.hud-hint');
    return e ? Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).fontSize) / 1.3) : 0; })()`);
  ok('a run with nothing scored is told what pays',
    h1 !== h0 && /wall to wall/i.test(h1) && (await q(HINTON)) === true, `"${h0}" -> "${h1}"`);
  // ...on one line. The first wording of it wrapped, and the wrap put the last
  // word two pixels off the bottom of an SE.
  ok('the nudge fits on one line', hLines === 1, `${hLines} lines`);
  if (args.shots) await shot(`${S.tag}-payout-nudge`);

  await q(`(() => { try { localStorage.removeItem('silt.best'); } catch (e) {} return 1; })()`);

  if (args.falsify || args.paybug) {
    // --falsify blinds the shell to the score and the chain count. Eight lines
    // collapse — no payout, nothing to compare against the award, nothing on the
    // board, nothing that leaves, no merge, no caption, no tier, a rail pinned at
    // 0% — and a ninth flips the other way: a shell told the player has zero
    // chains nags one who is mid-combo. Nine.
    // "a run with nothing scored is told what pays" is the one line the arm
    // cannot move, and it is named rather than counted: the arm's whole effect
    // is to make every run look chainless, which is the state that line asserts.
    // --paybug must flip EXACTLY ONE, the position — see the arm itself.
    const MUST = args.paybug ? 1 : 10;   // the one-line fit cannot move; the arm changes no copy
    const EXACT = !!args.paybug;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST}${EXACT ? ' exactly' : ''} required`);
    if (fails.length < MUST || (EXACT && fails.length > MUST)) {
      console.log(EXACT
        ? 'ARM MISCALIBRATED — this arm must prove the POSITION check alone, and it did not'
        : 'ARM TOO WEAK — the payout is not evidence');
      process.exitCode = 1;
    } else console.log('arm ok: every payout check is capable of failing');
    return;
  }
  console.log(fails.length ? '\nPAYOUT FAILURES:\n  ' + fails.join('\n  ') : '\npayout: all green');
  if (fails.length) process.exitCode = 1;
}

/* -------------------------------------------------------------- card copy */
/**
 * TWO THINGS A PLAYER COULD MISREAD.
 *
 *  1. "TIME 10s" on the ALCHEMY win card. That card also knows about a
 *     countdown, so a bare "time" is ambiguous by construction — taken, or
 *     left? It is elapsed, and the star thresholds beside it are elapsed times
 *     too, so it has to say so.
 *  2. "Dissolve 9035 grains" over "8,577 / 9,035". The headline is generated in
 *     js/data/levelgen.js from a raw integer while the counter under it is
 *     formatted, and one card cannot print the same quantity two ways.
 *
 * The second check is the one that could quietly become meaningless: a sample
 * of levels that all happen to have three-digit targets would pass it forever
 * while the bug sat there. So the sample is required to CONTAIN a target big
 * enough to separate — if it does not, the gate fails rather than passing on
 * nothing.
 */
async function copyGate() {
  const fails = [];
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const q = (e) => cdp.eval(e);
  const BARE = /\d{4,}/;         // four digits in a row with no separator

  await cdp.viewport(390, 844, 1, true);
  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=alchemy&seed=4242`);
  if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
    console.log('  !! shell never came up'); process.exitCode = 1; return;
  }
  await cdp.frames(20);
  if (args.falsify) {
    // The copy as it shipped: the headline printed raw, and a time caption that
    // does not say which time it is. Both checks must go red.
    await cdp.eval(`(() => {
      const raw = (t) => String(t).replace(/(\\d),(?=\\d{3})/g, '$1');
      const undo = () => {
        for (const e of document.querySelectorAll('.obj-label, .alc-obj-lab')) {
          const r = raw(e.textContent);
          if (r !== e.textContent) e.textContent = r;
        }
        for (const e of document.querySelectorAll('.card--alc .statrow .t-cap')) {
          if (/time taken/i.test(e.textContent)) e.textContent = 'time';
        }
      };
      new MutationObserver(undo).observe(document.getElementById('ui'),
        { subtree: true, childList: true, characterData: true });
      setInterval(undo, 25);
      return 1; })()`);
  }

  /* ------------------------------------- the objective headline, level by level */
  const LEVELS = [1, 12, 30, 48, 66, 84];
  const seen = [];
  for (const n of LEVELS) {
    await q(`window.__game.startLevel(${n})`);
    await cdp.frames(6);
    await pump();
    await new Promise((r) => setTimeout(r, 60));
    seen.push(JSON.parse(await q(`JSON.stringify({
      lv: ${n},
      target: (window.__game.world.alchemy || {}).target || 0,
      head: (document.querySelector('.obj-label') || {}).textContent || '',
      count: (document.querySelector('.obj-count') || {}).textContent || '' })`)));
  }
  const big = seen.filter((r) => r.target >= 1000);
  ok('the sample contains an objective big enough to need separators',
    big.length > 0, seen.map((r) => `lv${r.lv} ${r.target}`).join(' '));
  ok('no objective headline prints an unseparated thousand',
    seen.length === LEVELS.length && !seen.some((r) => BARE.test(r.head)),
    seen.map((r) => `"${r.head}" | ${r.count}`).join(' · '));

  /* ------------------------------------------------ the two ALCHEMY result cards */
  // The card is a pure function of the payload main.js hands it, so hand it one
  // rather than spending a minute of sim to arrive at the same DOM.
  const lvBig = (big[0] || seen[0]).lv;
  const alcPayload = (won) => `(() => {
    const a = window.__game.world.alchemy;
    window.__ui.results({ modeId: 'alchemy', won: ${won}, stars: ${won ? 2 : 0}, bestStars: 1,
      score: 1071, chains: 7, mode: 'ALCHEMY',
      alchemy: { ...a, won: ${won}, left: ${won ? 14 : 0} } });
    return 1; })()`;

  await q(`window.__game.startLevel(${lvBig})`);
  await cdp.frames(6);
  await q(alcPayload(true));
  await new Promise((r) => setTimeout(r, 420));
  const caps = JSON.parse(await q(`JSON.stringify(
    [...document.querySelectorAll('.card--alc .statrow .t-cap')].map((e) => e.textContent))`));
  const timeCap = caps[0] || '';
  ok('the win card says WHOSE time 45s is', /taken|elapsed|spent/i.test(timeCap),
    `"${timeCap}" — ${caps.join(' / ')}`);
  // ...and it must still fit on one line in a third of the card.
  const wrapped = await q(`(() => {
    const e = document.querySelector('.card--alc .statrow .t-cap');
    return e ? e.getBoundingClientRect().height > 18 : true; })()`);
  ok('the time caption still fits on one line', wrapped === false, String(wrapped));
  if (args.shots) await shot('phone-copy-win');

  await q(`window.__game.startLevel(${lvBig})`);
  await cdp.frames(6);
  await q(alcPayload(false));
  await new Promise((r) => setTimeout(r, 420));
  const lost = JSON.parse(await q(`JSON.stringify({
    lab: (document.querySelector('.alc-obj-lab') || {}).textContent || '',
    num: (document.querySelector('.alc-obj-num') || {}).textContent || '' })`));
  ok('the losing card prints its headline and its counter the same way',
    !!lost.lab && !BARE.test(lost.lab) && !BARE.test(lost.num), `${lost.lab} | ${lost.num}`);
  if (args.shots) await shot('phone-copy-lost');

  if (args.falsify) {
    // Three: the headline across the level sample, the headline on the losing
    // card, and the time caption. The "sample is big enough" line cannot move —
    // it is about the LEVELS, not about the copy — and neither can the one-line
    // fit, which the arm's shorter caption only makes easier.
    const MUST = 3;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST} required`);
    if (fails.length < MUST) { console.log('ARM TOO WEAK — this copy is not evidence'); process.exitCode = 1; }
    else console.log('arm ok: both copy fixes are capable of failing');
    return;
  }
  console.log(fails.length ? '\nCOPY FAILURES:\n  ' + fails.join('\n  ') : '\ncard copy: all green');
  if (fails.length) process.exitCode = 1;
}

/* ------------------------------------------------------------- legibility */
/**
 * CAN YOU READ IT ON THE BRIGHTEST BOARD, AND IS IT CLEAN ON IT?
 *
 * The defect this exists for shipped twice in one afternoon. Light type over
 * the sand carried a broad dark blur — invisible on the old grey `lumen` wash,
 * and the moment lumen became a luminous aqua light panel the same blur was a
 * dirty grey thumbprint across the brightest part of the frame. The payout's
 * halo was the single most noticeable thing on that screen.
 *
 * Both halves have to be measured, because fixing either one alone is how you
 * get the other. A metric that only asked "is the type visible" would have
 * SCORED THE THUMBPRINT HIGHEST: darkening two hundred pixels of background is
 * an enormous amount of visible change. A metric that only asked "is the
 * background undisturbed" is passed perfectly by type nobody can read.
 *
 * So: screenshot the frozen page twice, once with the element visible and once
 * with it hidden, and difference them.
 *   INK    mean |Δluma| inside the element's own box — how much of the glyph
 *          actually reaches the eye. White-on-white scores near zero.
 *   SMEAR  the share of pixels in a 70 px ring AROUND the box that the element
 *          darkens at all — how much board it dirties to achieve that.
 * A keyline is high ink at near-zero smear. A halo is high ink at high smear.
 * Nothing else in this suite can tell them apart.
 *
 * Two arms, and they pull in opposite directions on purpose:
 *   --dirtbug  puts the halo back. INK stays fine; SMEAR must blow up.
 *   --flatbug  strips every shadow. SMEAR is perfect; INK must collapse on the
 *              bright biome and — this is the point — stay fine on the dark one,
 *              because white type on a black board never needed the help.
 */

/** Chrome's screenshot, unpacked. 8-bit RGB/RGBA, no interlace: what CDP sends. */
function pngPixels(b64) {
  const buf = Buffer.from(b64, 'base64');
  let pos = 8, w = 0, h = 0, ct = 6, bd = 8;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bd !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`unexpected PNG: depth ${bd} colour ${ct}`);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  const luma = new Float32Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += bpp) {
    luma[i] = 0.2126 * out[j] + 0.7152 * out[j + 1] + 0.0722 * out[j + 2];
  }
  return { w, h, luma };
}

async function parkRenderer(on) {
  await cdp.eval(`(() => { const R = window.__game && window.__game.renderer;
    if (!R) return 0;
    if (${on ? 'true' : 'false'}) { if (!R.__parked) { R.__parked = R.draw; R.draw = function () {}; } }
    else if (R.__parked) { R.draw = R.__parked; R.__parked = null; }
    return 1; })()`).catch(() => {});
}

async function rawShot() {
  const p = cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const to = new Promise((_, rej) => setTimeout(() => rej(new Error('captureScreenshot hung')), 25000));
  return (await Promise.race([p, to])).data;
}

/** ink + smear for one element, against whatever board is behind it right now. */
async function inkAndSmear(sel, ring = 70) {
  await parkRenderer(true);
  await new Promise((r) => setTimeout(r, 120));
  // The TEXT's box, not the element's. `.hint` is a full-width centred line, so
  // its element box is nine tenths empty background — averaging the difference
  // over that dilutes a perfectly readable line down to nothing and the gate
  // fails a bug that is not there. A Range over the contents gives the glyphs'
  // own extent; the 3 px pad is the keyline.
  const box = JSON.parse(await cdp.eval(`JSON.stringify((() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
    const rg = document.createRange(); rg.selectNodeContents(e);
    let r = rg.getBoundingClientRect();
    if (!(r.width > 3 && r.height > 3)) r = e.getBoundingClientRect();
    if (!(r.width > 3 && r.height > 3)) return null;
    return { x: Math.round(r.left) - 3, y: Math.round(r.top) - 3,
             w: Math.round(r.width) + 6, h: Math.round(r.height) + 6 };
  })())`));
  if (!box) { await parkRenderer(false); return null; }

  const on = await rawShot();
  await cdp.eval(`(() => { document.querySelector(${JSON.stringify(sel)}).style.visibility = 'hidden'; return 1; })()`);
  await new Promise((r) => setTimeout(r, 90));
  const off = await rawShot();
  await cdp.eval(`(() => { document.querySelector(${JSON.stringify(sel)}).style.visibility = ''; return 1; })()`);
  await parkRenderer(false);

  const A = pngPixels(on), B = pngPixels(off);
  if (A.w !== B.w || A.h !== B.h) return null;
  const at = (P, x, y) => P.luma[y * P.w + x];
  // INK is the mean of the STRONGEST tenth of the differences in the box, not
  // the mean of all of them. Glyph coverage varies wildly — 9.5 px caps with
  // .3em tracking put ink on a few percent of their own box, a 46 px numeral on
  // a third of it — and a flat mean scores the two on how fat their letters
  // are rather than on whether either can be read. The strongest tenth is the
  // stroke against the board behind it, which is the thing in question, and it
  // still collapses to nothing for white type on a white board.
  const deltas = [];
  let bg = 0, ringHit = 0, ringN = 0;
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
  const x1 = Math.min(A.w, box.x + box.w), y1 = Math.min(A.h, box.y + box.h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    deltas.push(Math.abs(at(A, x, y) - at(B, x, y))); bg += at(B, x, y);
  }
  const inkN = deltas.length || 1;
  deltas.sort((a, b) => b - a);
  const top = Math.max(1, Math.round(deltas.length * 0.1));
  let inkSum = 0;
  for (let i = 0; i < top; i++) inkSum += deltas[i];
  const rx0 = Math.max(0, box.x - ring), ry0 = Math.max(0, box.y - ring);
  const rx1 = Math.min(A.w, box.x + box.w + ring), ry1 = Math.min(A.h, box.y + box.h + ring);
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    if (x >= x0 - 3 && x < x1 + 3 && y >= y0 - 3 && y < y1 + 3) continue;   // the glyph box itself
    ringN++;
    if (Math.abs(at(A, x, y) - at(B, x, y)) > 4) ringHit++;
  }
  return {
    ink: +(inkSum / top).toFixed(2),
    smear: +(ringHit / Math.max(1, ringN)).toFixed(4),
    bg: Math.round(bg / Math.max(1, inkN)),
  };
}

async function legibilityGate() {
  const fails = [];
  const ok = (name, cond, detail = '') => {
    if (!cond) fails.push(name + (detail ? ': ' + detail : ''));
    console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  const q = (e) => cdp.eval(e);
  // 75 sits in the gap the arms measure out, not on a hunch: with the keyline
  // the six ink readings are 104, 121, 127, 171, 180 and 209; strip it and the
  // three on a bright field fall to 17, 23 and 61. Nothing lands near 75 in
  // either direction.
  const MIN_INK = 75;
  const MAX_SMEAR = 0.06;  // above this the element is dirtying the board around it

  const arm = async () => {
    if (args.dirtbug) {
      // The shipped defect, exactly: a broad dark blur and a soft radial veil
      // behind every piece of floating type.
      await cdp.eval(`(() => { const s = document.createElement('style');
        s.textContent = '.payout-num, .payout-cap, .tagline, .hint, .hud-hint {' +
          ' text-shadow: 0 2px 20px rgba(0,0,0,.9), 0 0 26px rgba(0,0,0,.85) !important; }' +
          '.payout { position: absolute; }' +
          '.payout::before { content: ""; position: absolute; left: 50%; top: 50%; z-index: -1;' +
          ' width: 260px; height: 160px; transform: translate(-50%, -50%);' +
          ' background: radial-gradient(closest-side, rgba(6,5,9,.66) 0%, rgba(6,5,9,.44) 42%,' +
          ' rgba(6,5,9,.14) 72%, rgba(6,5,9,0) 100%); }';
        document.head.append(s); return 1; })()`);
    }
    if (args.flatbug) {
      await cdp.eval(`(() => { const s = document.createElement('style');
        s.textContent = '.payout-num, .payout-cap, .tagline, .hint, .hud-hint { text-shadow: none !important; }';
        document.head.append(s); return 1; })()`);
    }
  };

  await cdp.viewport(390, 844, 1, true);

  /* ----------------------------------------------- the payout, both extremes */
  // JELLY LAB is `lumen`, the brightest board in the game; TIDE is `abyss`, the
  // darkest. One number, one treatment, and it has to survive both.
  for (const [mode, what] of [['jelly', 'the brightest board'], ['tide', 'the darkest board']]) {
    await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&auto&mode=${mode}&seed=4242`);
    if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) {
      ok(`${mode}: shell came up`, false); continue;
    }
    await cdp.frames(20);
    await arm();
    const r = await drive('w.chains >= 1', 40000);
    if (!r.reached) { ok(`${mode}: the bot reached a chain`, false, JSON.stringify(r)); continue; }
    await pump();
    await new Promise((r2) => setTimeout(r2, 200));
    const m = await inkAndSmear('.payout-num');
    ok(`the payout is legible on ${what} (${mode})`, !!m && m.ink >= MIN_INK,
      m ? `ink ${m.ink} on a board averaging ${m.bg}/255, want >= ${MIN_INK}` : 'no payout on screen');
    ok(`the payout does not dirty ${what} (${mode})`, !!m && m.smear <= MAX_SMEAR,
      m ? `${(m.smear * 100).toFixed(1)}% of the surrounding board disturbed, want <= ${(MAX_SMEAR * 100)}%` : 'no payout');
    if (args.shots) await shot(`phone-legibility-${mode}`);
  }

  /* ------------------------------------------ the small copy, at both extremes */
  // The tagline and TOUCH THE SAND are the same trap in 9 px type, and the
  // playtest flagged them on the new lumen panel.
  //
  // These are measured against a FORCED field rather than against whatever the
  // bot happened to build, and that is deliberate: a real board puts a
  // different background under a 9 px line every run, so a threshold against it
  // measures the seed as much as the stylesheet. The shell's own veils are left
  // in place — they are part of its answer to this problem — and the biome is
  // replaced with the two extremes it has to survive: a near-white light panel
  // and near-black. This is exactly the change that caused the bug: a biome
  // that went bright underneath type that assumed dark.
  const field = (col) => cdp.eval(`(() => {
    let s = document.getElementById('__field');
    if (!s) { s = document.createElement('style'); s.id = '__field'; document.head.append(s); }
    s.textContent = '#game { visibility: hidden !important } #stage { background: ${col} !important }';
    return 1; })()`);

  await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&attract=jelly&seed=4242`);
  if (await cdp.waitFor('window.__ui && window.__state', 20000)) {
    await cdp.frames(40);
    await arm();
    // The tagline and the hint fade in on a 1.6 s delay. Measured before that
    // lands, a perfectly legible line reads as "not on screen" — and the gate
    // would be timing the animation rather than looking at the type.
    await cdp.waitFor('+getComputedStyle(document.querySelector(".hint")).opacity > 0.9', 9000);
    await q('window.__ui.wmSeek(3400)');
    await cdp.frames(8);
    for (const [col, what] of [['#eefbf6', 'a white board'], ['#05060a', 'a black board']]) {
      await field(col);
      await new Promise((r) => setTimeout(r, 120));
      for (const [sel, name] of [['.tagline', 'the tagline'], ['.hint', 'TOUCH THE SAND']]) {
        const m = await inkAndSmear(sel, 40);
        ok(`${name} is legible on ${what}`, !!m && m.ink >= MIN_INK,
          m ? `ink ${m.ink} over ${m.bg}/255, want >= ${MIN_INK}` : 'not on screen');
        if (col === '#eefbf6') {
          ok(`${name} does not dirty ${what}`, !!m && m.smear <= MAX_SMEAR,
            m ? `${(m.smear * 100).toFixed(1)}% disturbed` : 'not on screen');
        }
      }
      if (args.shots) await shot(`phone-legibility-attract-${col === '#eefbf6' ? 'white' : 'black'}`);
    }
  } else ok('attract came up for the copy pass', false);

  if (args.dirtbug || args.flatbug) {
    // --dirtbug is a halo: everything stays readable and every SMEAR line blows.
    // --flatbug is bare type: nothing smears and the INK lines blow — but only
    //   the ones on the bright board. White type on `abyss` never needed a
    //   shadow, so a gate that went red there too would be measuring the
    //   stylesheet rather than the pixels.
    // --dirtbug: at least three. The halo dirties the board under the payout on
    //   lumen and under both lines of attract copy on a white field, and it
    //   drags two of their ink readings down with it — five in practice.
    // --flatbug: EXACTLY three, and which three is the point. The three ink
    //   readings on a bright field must collapse; the three on a black field
    //   must not, because white type on black never needed a keyline and a
    //   check that went red there would be reading the stylesheet rather than
    //   the pixels. No smear line may move either — bare type dirties nothing.
    const MUST = 3, EXACT = !!args.flatbug;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST}${EXACT ? ' exactly' : ' or more'} required`);
    console.log('  ' + (fails.length ? fails.join('\n  ') : '(none)'));
    const bright = fails.length === MUST && fails.every((f) => /jelly|white board/.test(f));
    if (fails.length < MUST || (EXACT && !bright)) {
      console.log(EXACT
        ? 'ARM MISCALIBRATED — bare type must fail on the bright fields and only there'
        : 'ARM TOO WEAK — this legibility is not evidence');
      process.exitCode = 1;
    } else console.log('arm ok: ink and smear can both be seen to fail');
    return;
  }
  console.log(fails.length ? '\nLEGIBILITY FAILURES:\n  ' + fails.join('\n  ') : '\nlegibility: all green');
  if (fails.length) process.exitCode = 1;
}

const SHOTS = !(args.flow || args.win || args.layout || args.payout || args.copy || args.legible) || args.shots;

const LOOP_SHOTS = ['attract', 'attract-pour', 'modes', 'events', 'settings', 'hud', 'pause', 'results', 'banner'];

try {
  for (const S of (SHOTS && LOOP_SHOTS.some(want) ? SIZES : [])) {
    await cdp.viewport(S.w, S.h, 1, S.tag === 'phone');
    await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&seed=4242`);
    const up = await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000);
    if (!up) { console.log('  !! shell never came up (' + S.tag + ')'); continue; }

    // Let the attract sim build a real pile and the wordmark reach its hold.
    await cdp.frames(140);
    // Attract starts on an empty board and __game.step() does not drive the
    // attract bot, so the pieces would pile up in one column. Run the same Bot
    // by hand: the shot has to show the board a real player would be watching.
    // Stop at a half-full board, not at game over: main.js restarts the attract
    // world the instant it tops out, and a shot taken after that is of an empty
    // board — which is exactly what the first two rounds of this tool captured.
    await cdp.eval(`(async () => {
      const { Bot } = await import('${base}/gms/2d/silt/js/ai/bot.js');
      const w = window.__game.world, b = new Bot(w);
      const target = w.g.cols * w.g.rows * 0.34;
      for (let i = 0; i < 9000; i++) {
        b.update(); window.__game.step(1);
        if (w.over || w.g.count > target) break;
      }
      return w.g.count;
    })()`);
    await cdp.eval('window.__ui.wmSeek(3400)');   // the wordmark's hold phase
    await cdp.frames(8);
    if (want('attract')) await shot(`${S.tag}-attract`);

    if (want('attract-pour')) {
      // Catch the wordmark mid-pour. seek() is the only reason __ui exposes it.
      await cdp.eval('window.__ui.wmSeek(620)');
      await new Promise((r) => setTimeout(r, 120));
      await shot(`${S.tag}-attract-pour`);
    }

    if (want('modes')) {
      await cdp.eval('window.__ui.openModes()');
      await new Promise((r) => setTimeout(r, 620));
      await shot(`${S.tag}-modes`);
      await cdp.eval('window.__ui.show("attract")');
    }

    if (want('events')) {
      await cdp.eval('window.__ui.openDaily()');
      await new Promise((r) => setTimeout(r, 620));
      await shot(`${S.tag}-events`);
      await cdp.eval('window.__ui.show("attract")');
    }

    if (want('settings')) {
      await cdp.eval('window.__ui.openSettings()');
      await new Promise((r) => setTimeout(r, 700));
      await shot(`${S.tag}-settings`);
      await cdp.eval('window.__ui.show("attract")');
    }

    if (want('hud') || want('pause') || want('results') || want('banner')) {
      await cdp.eval('window.__game.start("flow", { seed: 4242 })');
      await cdp.frames(30);
      // Fast-forward the sim so the HUD has a real board and real numbers.
      const real = await cdp.eval(`(async () => {
        const { Bot } = await import('${base}/gms/2d/silt/js/ai/bot.js');
        const w = window.__game.world, b = new Bot(w);
        let i = 0;
        for (; i < 5200; i++) { b.update(); window.__game.step(1); if (w.over) break; }
        return JSON.stringify({ ticks: i, score: w.score, chains: w.chains, over: w.over });
      })()`);
      console.log('  bot run: ' + real);
      // The HUD shot is about LAYOUT, and lane C has not shipped modes/index.js
      // yet — so main.js falls back to a bare 4-tint config, which by D3 can
      // never clear and always scores 0. Stage the numbers rather than ship a
      // screenshot of a HUD that reads zero for a reason nothing to do with it.
      await cdp.eval(`(() => { const w = window.__game.world;
        if (!w.score) { w.score = 148230; w.chains = 11; w.combo = 3; } return w.score; })()`);
      await cdp.frames(6);
      if (want('hud')) await shot(`${S.tag}-hud`);

      if (want('banner')) {
        await cdp.eval('window.__ui.banner("QUICKENING")');
        await new Promise((r) => setTimeout(r, 420));
        await shot(`${S.tag}-hud-banner`);
        await new Promise((r) => setTimeout(r, 2200));
      }

      if (want('pause')) {
        await cdp.eval('window.__ui.show("pause")');
        await new Promise((r) => setTimeout(r, 520));
        await shot(`${S.tag}-pause`);
        await cdp.eval('window.__ui.show("hud")');
      }

      if (want('results')) {
        const w = await cdp.eval('JSON.stringify({ s: window.__game.world.score, c: window.__game.world.chains })');
        const { s, c } = JSON.parse(w);
        await cdp.eval(`window.__ui.results({ score: ${s}, chains: ${c}, best: ${Math.round(s * 1.0)}, isBest: true, mode: 'FLOW' })`);
        await new Promise((r) => setTimeout(r, 620));
        await shot(`${S.tag}-results`);
      }
    }
  }

  if (SHOTS && want('levels')) {
    console.log('\nalchemy campaign');
    for (const S of SIZES) {
      await cdp.viewport(S.w, S.h, 1, S.tag === 'phone');
      await cdp.goto(`${base}/gms/2d/silt/index.html?preserve=1&dpr=1&soak&seed=4242`);
      if (!await cdp.waitFor('window.__ui && window.__state && window.__state.state', 20000)) continue;
      await cdp.frames(20);
      await cdp.eval('window.__ui.openLevels()');
      await new Promise((r) => setTimeout(r, 700));
      await shot(`${S.tag}-levels-new`);
      // The picker at level 1 shows one open tile and ninety-five shut ones,
      // which proves the lock but says nothing about what the screen looks like
      // to somebody playing it. Bank real progress through the real save API —
      // the same call main.js makes on a win — and shoot it again.
      await cdp.eval(`(() => { const s = window.__game.save;
        [3,3,2,3,1,2,3,2,1,3,2,3,1,2,3,3,2,1,3,3,2,1,2].forEach((n, i) => s.recordLevel(i + 1, n));
        return 1; })()`);
      await cdp.eval('window.__ui.openLevels()');
      await new Promise((r) => setTimeout(r, 700));
      await shot(`${S.tag}-levels`);
      // Do not leave staged progress in the profile for the gates that follow.
      await cdp.eval(`(() => { try { localStorage.removeItem('silt.levels'); } catch (e) {} return 1; })()`);
    }
  }

  if (SHOTS && want('modehud')) {
    console.log('\nper-mode HUD');
    for (const S of SIZES) {
      await cdp.viewport(S.w, S.h, 1, S.tag === 'phone');
      await modeShots(S.tag);
    }
  }

  if (args.layout) { console.log('\ntop-control layout'); await layoutGate(); }
  if (args.flow) { console.log('\nend-to-end flow'); await endToEnd(); }
  if (args.flow || args.win) { console.log('\nalchemy: a level played to a win'); await alchemyWin(); }
  if (args.payout) { console.log('\ndoes a chain pay?'); await payoutGate(); }
  if (args.copy) { console.log('\ncard copy'); await copyGate(); }
  if (args.legible || args.dirtbug || args.flatbug) { console.log('\ntype over sand'); await legibilityGate(); }
  if (args.hit || args.hitbug) { console.log('\nthumb-sized hit targets'); await hitGate(); }
  if (args.probe) { console.log('\ninteraction probe'); await probe(); }

  const errs = cdp.errors.filter((e) => !/favicon/.test(e));
  console.log(errs.length ? '\nconsole errors:\n  ' + errs.slice(0, 12).join('\n  ') : '\nno console errors');
  const off = cdp.offOrigin(base);
  console.log(off.length ? 'OFF-ORIGIN REQUESTS: ' + off.join(', ') : 'no off-origin requests');
} catch (e) {
  console.error('\nFAILED: ' + e.message);
  process.exitCode = 1;
} finally {
  close();
  process.exit(process.exitCode || 0);
}
