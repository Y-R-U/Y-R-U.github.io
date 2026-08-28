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
 *   node tools/uishot.mjs --layout        where the top controls ACTUALLY land, per mode
 *   node tools/uishot.mjs --layout --falsify  the naive version of the swap; every position must go red
 *   node tools/uishot.mjs --se            add a 375x667 iPhone SE pass to any of the above
 */
import { harness, ROOT } from './cdp.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

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

  ok('attract is the first screen', (await q('window.__ui.screen')) === 'attract');

  ok('PLAY starts a run',
    (await click('.attract-btns .gb--primary')) === 'clicked' &&
    (await q('window.__state.state')) === 'play' && (await q('window.__ui.screen')) === 'hud');

  await click('.hud-pause .gb');
  ok('pause button pauses the sim',
    (await q('window.__state.state')) === 'pause' && (await q('window.__ui.screen')) === 'pause');

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
  ok('attract suppresses mode banners', (await q('document.querySelectorAll(".banner").length')) === 0);

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

  const lv = JSON.parse(await q('JSON.stringify(window.__game.world.alchemy)'));
  const r = await drive('w.alchemy && w.alchemy.won', 90000);
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

const SHOTS = !(args.flow || args.win || args.layout) || args.shots;

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
