#!/usr/bin/env node
// §S2-L's gates — the game LOADS, and it comes back from the two ways it can die.
//
//   node tools/gates_boot.mjs [--headed]
//
// B1  a full boot makes no request to any origin but its own
// B2  the game still boots with every CDN host blocked and the HTTP cache off
// B3  a boot that never finishes surfaces itself instead of hanging on the bar forever
// B4  a lost context that the browser does not restore is restored by the game
// B5  the cog opens settings under a real TOUCH, not just under a mouse
//
// Why this suite exists. Aaron: *"sometimes the game doesn't load if i reload the page… happens on
// local as well. i think game freezes first on restore of browser? then refresh of game doesn't
// work."* The cause was `index.html` resolving the bare specifier `three` to cdn.jsdelivr.net,
// which made the entire module graph hostage to one third-party fetch. When that fetch fails there
// is no error and no fallback: js/main.js never evaluates, #boot sits on its bar, and
// `__state.errors` is EMPTY — because the module that owns reportError is the module that did not
// load. Every gate in this repo runs against a page that booted, so not one of them could see it.
//
// Every check is falsified in-suite, and B2's falsification is the one that matters: the first
// version of this experiment PASSED its null control, because the Chrome profile was being reused
// and was serving three from its HTTP cache. A control that cannot fail is not a control.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, evalJSON } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const OUT = resolve(ROOT, 'shots/boot');
mkdirSync(OUT, { recursive: true });
const FILE = resolve(OUT, '_gates.json');

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every CDN this repo's other games reach for, plus the two three.js is actually published on.
const CDNS = ['*jsdelivr.net*', '*unpkg.com*', '*cdnjs.cloudflare.com*', '*esm.sh*', '*skypack.dev*'];

const ctx = await open({ w: 390, h: 844, dpr: 2, mobile: true });
const { S, base, close } = ctx;

// Requests are recorded per navigation. `Network.enable` has to be on before the navigate or the
// first — and only interesting — request is the one that is missed.
const seen = [];
await S('Network.enable');
ctx.cdp.ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.requestWillBeSent') seen.push(m.params.request.url);
});

async function boot({ block = [], cache = true, extraScript = null, wait = 30000 } = {}) {
  seen.length = 0;
  await S('Network.setCacheDisabled', { cacheDisabled: !cache });
  await S('Network.setBlockedURLs', { urls: block });
  if (extraScript) await S('Page.addScriptToEvaluateOnNewDocument', { source: extraScript });
  await S('Page.navigate', { url: `${base}/index.html?nosave` });
  try { await waitFor(S, 'window.__ready', wait); return true; } catch { return false; }
}

// A fresh page for every arm, and every arm re-registers its own script-on-new-document, so the
// helper above cannot leak an injection into the next check.
async function reset() {
  await S('Page.navigate', { url: 'about:blank' });
  await sleep(150);
}

// ── B1 ─────────────────────────────────────────────────────────────────────
// The durable form of the fix. Not "three is vendored" — that is one file and the next dependency
// somebody adds will not be it — but "nothing this page loads comes from anywhere else".
{
  const booted = await boot();
  const origin = new URL(base).origin;
  const foreign = [...new Set(seen)].filter(u => {
    if (/^(data|blob|about|chrome-extension):/.test(u)) return false;
    try { return new URL(u).origin !== origin; } catch { return true; }
  });
  check('B1 no external origin', booted && foreign.length === 0,
    `booted=${booted}  ${seen.length} requests, ${new Set(seen).size} distinct, `
    + `${foreign.length} foreign${foreign.length ? ': ' + foreign.slice(0, 4).join(' ') : ''}`);

  await reset();
  const booted2 = await boot({ extraScript: `fetch('https://cdn.jsdelivr.net/npm/three@0.160.0/package.json').catch(()=>{});` });
  const foreign2 = [...new Set(seen)].filter(u => { try { return new URL(u).origin !== origin && !/^(data|blob|about):/.test(u); } catch { return false; } });
  check('B1-falsify one injected external fetch is seen', foreign2.length > 0,
    `booted=${booted2}  ${foreign2.length} foreign: ${foreign2.slice(0, 2).join(' ') || '(none — B1 is blind)'}`);
}

// ── B2 ─────────────────────────────────────────────────────────────────────
// The cache is the reason this needs saying out loud. With it on, a CDN block proves nothing at
// all: the file is already local and the request never leaves.
await reset();
{
  const booted = await boot({ block: CDNS, cache: false });
  check('B2 boots with every CDN blocked and no cache', booted,
    `__ready=${booted}  blocked ${CDNS.length} hosts, cacheDisabled=true`);

  await reset();
  // The positive control for the block itself: take away the vendored copy the same way, and the
  // boot must die. If this arm ALSO booted, the blocking is not working and B2 said nothing.
  const dead = await boot({ block: [...CDNS, '*/vendor/three/*'], cache: false, wait: 12000 });
  const st = await evalJSON(S, `JSON.stringify({ boot: (document.getElementById('boot-status')||{}).textContent,
    errs: (window.__state && window.__state.errors || []).length })`);
  check('B2-falsify blocking the vendored three does kill the boot', dead === false,
    `__ready=${dead} (want false)  page: ${st}`);
}

// ── B3 ─────────────────────────────────────────────────────────────────────
// The watchdog is a CLASSIC inline script in index.html and not a module, because the failure it
// exists to catch is the module never running. So the falsification is not "remove the watchdog",
// it is "let the boot succeed" — a watchdog that fires on a healthy boot is worse than none.
await reset();
{
  await boot({ block: ['*/js/main.js'], cache: false, wait: 1500 });
  let stalled = null;
  for (let i = 0; i < 60; i++) {                        // BOOT_MS is 20 s; give it 30
    await sleep(500);
    stalled = await evalJSON(S, `(() => { const b = document.getElementById('boot'), r = document.getElementById('boot-retry');
      return { stalled: !!b && b.classList.contains('stalled'), retry: !!r && !r.hidden,
               msg: (document.getElementById('boot-status')||{}).textContent }; })()`);
    if (stalled.stalled) break;
  }
  check('B3 a boot that never finishes says so and offers a reload',
    !!(stalled && stalled.stalled && stalled.retry),
    `stalled=${stalled?.stalled} retry=${stalled?.retry} msg=${JSON.stringify(stalled?.msg)}`);

  await reset();
  const good = await boot({ cache: false });
  await sleep(1200);
  const clean = await evalJSON(S, `(() => { const b = document.getElementById('boot');
    return { stalled: !!b && b.classList.contains('stalled'), hidden: !!b && b.classList.contains('hidden') }; })()`);
  check('B3-falsify a healthy boot does NOT trip the watchdog', good && !clean.stalled,
    `__ready=${good} stalled=${clean.stalled} bootHidden=${clean.hidden}`);
}

// ── B4 ─────────────────────────────────────────────────────────────────────
// `preventDefault()` makes a restore POSSIBLE; it does not make one happen. Headless Chrome does
// not auto-restore here — measured, and that is what makes this gate meaningful — so a pass means
// the game's own backoff did it.
await reset();
{
  await boot({ cache: false });
  const f0 = await evalJSON(S, 'window.__state.frames');
  await evalJSON(S, 'window.__game.loseContext(-1)');       // -1 = nobody schedules a restore
  let back = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    back = await evalJSON(S, `(() => ({ overlay: !document.getElementById('ctxlost').classList.contains('hidden'),
      frames: window.__state.frames, msg: (document.getElementById('ctxlost-msg')||{}).textContent }))()`);
    if (!back.overlay) break;
  }
  const f1 = back?.frames ?? 0;
  await sleep(900);
  const f2 = await evalJSON(S, 'window.__state.frames');
  check('B4 an unassisted context loss is restored and the loop resumes',
    !!back && !back.overlay && f2 > f1,
    `overlay=${back?.overlay}  frames ${f0} → ${f1} → ${f2}  advancing=${f2 > f1}`);

  await reset();
  // The retry defers while the tab is hidden — spending a restoreContext() on a backgrounded tab
  // buys nothing. Force that condition and the recovery must NOT happen: this falsifies the retry
  // itself rather than the overlay that reports it.
  await boot({ cache: false, extraScript: `Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });` });
  await evalJSON(S, 'window.__game.loseContext(-1)');
  await sleep(9000);
  const stuck = await evalJSON(S, `(() => ({ overlay: !document.getElementById('ctxlost').classList.contains('hidden') }))()`);
  check('B4-falsify a hidden tab is not restored (so B4 measured the retry)', stuck.overlay === true,
    `overlay=${stuck.overlay} (want true) after 9 s with document.hidden forced true`);
}

// ── B5 ─────────────────────────────────────────────────────────────────────
// The cog was bound to `click` alone, and #controls' touchstart handler ends with an unconditional
// preventDefault() — which is exactly what suppresses the browser's synthesised click. So on a
// phone the cog's only listener could never fire, and under a mouse it worked perfectly. Aaron:
// *"settings is unclickable. (in testing on mobile)"*
await reset();
{
  const tap = async () => {
    const b = await evalJSON(S, `(() => { const e = document.getElementById('btn-settings'); const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] });
    await sleep(60);
    await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
    return evalJSON(S, `(() => { const e = document.getElementById('settings'); const r = e.getBoundingClientRect();
      return { open: r.width > 0 && r.height > 0 && !e.classList.contains('hidden') }; })()`);
  };

  await boot({ cache: false });
  const opened = await tap();
  check('B5 the cog opens settings under a real touch', opened.open === true,
    `#settings open=${opened.open} after one touchStart/touchEnd on #btn-settings`);

  await reset();
  await boot({ cache: false });
  // cloneNode carries the markup and drops every listener — the shipped bug, reconstructed.
  await evalJSON(S, `(() => { const g = document.getElementById('btn-settings'); g.replaceWith(g.cloneNode(true)); return 1; })()`);
  const dead = await tap();
  check('B5-falsify a cog with no listeners does not open it', dead.open === false,
    `#settings open=${dead.open} (want false) with the cog's listeners stripped`);
}

await close();
console.log(`\n${ok.length}/${ok.length + fail.length} gates green${fail.length ? '  FAILED: ' + fail.join(', ') : ''}`);
process.exit(fail.length ? 1 : 0);
