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
 * Screenshots prove layout, not wiring. This clicks the real buttons and
 * asserts what the game did — the only way to catch a control that renders
 * perfectly and is attached to nothing.
 */
async function probe() {
  const fails = [];
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
  const before = await q('window.__game.world.g.count');
  // Aim at the middle of the BOARD, not the middle of the window: on a desktop
  // viewport the board is a narrow centred column and a hard-coded phone
  // coordinate lands in the black margin, where pouring is correctly a no-op.
  await cdp.eval(`(() => { const c = document.getElementById('game');
    const b = window.__game.view.board;
    const x = b.x + b.w / 2, y = b.y + b.h * 0.35;
    for (const t of ['pointerdown', 'pointermove']) {
      c.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    } })()`);
  const after = await q('window.__game.world.g.count');
  ok('touching the sand on attract pours grains', after > before, `${before} -> ${after}`);

  await q('window.__ui.banner("TEST")');
  ok('attract suppresses mode banners', (await q('document.querySelectorAll(".banner").length')) === 0);

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
    const MUST = 6;
    console.log(`\nfalsification arm: ${fails.length} checks went red, ${MUST} required`);
    if (fails.length < MUST) { console.log('ARM TOO WEAK — these checks are not evidence'); process.exitCode = 1; }
    else console.log('arm ok: every listener-dependent check is capable of failing');
    return;
  }
  console.log(fails.length ? '\nPROBE FAILURES:\n  ' + fails.join('\n  ') : '\nprobe: all green');
  if (fails.length) process.exitCode = 1;
}

try {
  for (const S of SIZES) {
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
