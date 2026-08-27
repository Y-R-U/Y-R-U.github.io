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
    await cdp.eval(`(async () => {
      const { Bot } = await import('${base}/gms/2d/silt/js/ai/bot.js');
      const b = new Bot(window.__game.world);
      for (let i = 0; i < 4200; i++) { b.update(); window.__game.step(1); if (window.__game.world.over) break; }
      return window.__game.world.g.count;
    })()`);
    await cdp.frames(8);
    await new Promise((r) => setTimeout(r, 2600));
    if (want('attract')) await shot(`${S.tag}-attract`);

    if (want('attract-pour')) {
      // Catch the wordmark mid-pour: restart the cycle and grab it 0.7 s in.
      await cdp.eval('window.__ui.show("attract")');
      await new Promise((r) => setTimeout(r, 60));
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
      await cdp.eval(`(async () => {
        const { Bot } = await import('${base}/gms/2d/silt/js/ai/bot.js');
        const b = new Bot(window.__game.world);
        for (let i = 0; i < 5200; i++) { b.update(); window.__game.step(1); if (window.__game.world.over) break; }
        return window.__game.world.score;
      })()`);
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
