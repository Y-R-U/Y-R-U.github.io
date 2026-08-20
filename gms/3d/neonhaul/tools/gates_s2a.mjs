#!/usr/bin/env node
// S2-A's gates — the dashboard, the two view presentations, the instruments, the ticker and the
// stats row. New file; it edits none of the manager's suites.
//
//   node tools/gates_s2a.mjs [--headed] [--w= --h=] [--land]
//
// **Every check here is falsified.** Not "written so it could fail" — each one breaks the thing it
// guards and asserts the same check goes the other way, because this project has now logged
// eighteen measurements that silently measured nothing. Where a check is a geometric fact rather
// than a mechanism (a corner is transparent, a rect overlaps another) the falsification perturbs
// the geometry and requires the check to notice.
//
// Two rules borrowed from the suites that came before: results are written to disk AS EACH CHECK
// COMPLETES, never batched, because agents on this project have been killed mid-suite; and no
// isolation is `&&`-guarded — every hook goes through `hook()`, which THROWS when it is missing
// rather than resolving quietly to undefined.

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce, logs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2a');
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
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function pxDiff(a, b) {
  if (!a || !b || a.length !== b.length) return { n: -1 };
  let n = 0, worst = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; if (d > worst) worst = d; }
  return { n, worst };
}

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2a/${name}.png`;
}

// A real touch on a real element, the way a thumb does it. Returns where it landed so a check can
// say "and a tap 200 px away does nothing" against a point it actually chose.
async function tapEl(S, sel, dx = 0, dy = 0) {
  const box = await evalJSON(S, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { empty: true };
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, w: Math.round(r.width), h: Math.round(r.height),
      covered: !(el === hit || el.contains(hit)), hit: hit ? (hit.id || hit.className) : null };
  })()`);
  if (!box) throw new Error(`no element matched ${sel}`);
  if (box.empty) throw new Error(`${sel} has no box`);
  if (!dx && !dy && box.covered) throw new Error(`${sel} is covered by ${box.hit} — a thumb could not press it`);
  const x = box.x + dx, y = box.y + dy;
  await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(S, 4);
  return { ...box, tapped: [x, y] };
}

const rectOf = (S, sel) => evalJSON(S, `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
})()`);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ctx = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  const { S, base, close } = ctx;

  const goto = async extra => {
    await S('Page.navigate', { url: `${base}/index.html?nosave=1${extra ? '&' + extra : ''}` });
    await waitFor(S, 'window.__ready', 60000);
    await settle(S, 30);
  };
  await goto();
  await quiesce(S, { timeout: 60000 });

  // ── 1. cockpit is the default VIEW, and the dash is what a new player sees ─
  // The shipped defect this phase exists to fix: save.js shipped `camera: 'chase'` and the only
  // switch was a settings row, so the entire instrument panel was invisible to the player it was
  // built for. Asserted on a FRESH profile (?nosave=1 gives defaults, never a stored choice).
  const st0 = await evalJSON(S, '({rig: __state.rig.mode, shown: __state.hud.shown, strip: __state.hud.strip, saved: __game.settings().camera})');
  await hook(S, 'applySettings', { camera: 'chase' });
  await settle(S, 8);
  const stChase = await evalJSON(S, '({rig: __state.rig.mode, shown: __state.hud.shown, strip: __state.hud.strip})');
  await hook(S, 'applySettings', { camera: 'cockpit' });
  await settle(S, 8);
  const stBack = await evalJSON(S, '__state.hud.shown');
  check('S2-A/views — a fresh profile boots INTO the cabin, and the cabin follows the rig both ways',
    st0.rig === 'cockpit' && st0.saved === 'cockpit' && st0.shown === true && st0.strip === false
      && stChase.shown === false && stChase.strip === true && stBack === true,
    `fresh profile: settings.camera "${st0.saved}", rig "${st0.rig}", cabin shown ${st0.shown}, chase HUD ${st0.strip}\n`
    + `FALSIFIED: switching to chase makes the SAME readings ${stChase.shown} / ${stChase.strip}, and switching `
    + `back restores ${stBack}. Before S2 this line read chase/false/true on a fresh profile, which is why `
    + `Aaron played the shipped build without ever seeing the dashboard`);

  // ── 2. the on-screen view switch is a real button a thumb can press ───────
  const before = await evalJSON(S, '__state.rig.mode');
  const t1 = await tapEl(S, '#btn-view');
  const after1 = await evalJSON(S, '({m: __state.rig.mode, label: document.querySelector("#btn-view span").textContent})');
  const t2 = await tapEl(S, '#btn-view');
  const after2 = await evalJSON(S, '({m: __state.rig.mode, label: document.querySelector("#btn-view span").textContent})');
  // FALSIFICATION — the same gesture 160 px away from the button must do nothing, or what the two
  // taps above proved is that a touch anywhere changes the view.
  const t3 = await tapEl(S, '#btn-view', 0, 160);
  const after3 = await evalJSON(S, '__state.rig.mode');
  check('S2-A/views FALSIFIED — the on-screen switch flips the view, and a tap beside it does not',
    before === 'cockpit' && after1.m === 'chase' && after2.m === 'cockpit' && after3 === 'cockpit'
      && after1.label === 'COCKPIT' && after2.label === 'CHASE',
    `#btn-view is ${t1.w}x${t1.h} px at (${t1.tapped}) and uncovered\n`
    + `tap 1: ${before} → ${after1.m}, label now "${after1.label}"   tap 2: → ${after2.m}, label "${after2.label}"\n`
    + `FALSIFIED: the identical touch at (${t3.tapped}), 160 px below the button, leaves the rig at "${after3}"`);

  // ── 3. ChaseStrip is GONE and chase view has a real HUD reading the same model ──
  await hook(S, 'applySettings', { camera: 'chase' });
  await settle(S, 10);
  const dom = await evalJSON(S, `(() => {
    const el = document.getElementById('hud-strip');
    const q = s => el.querySelectorAll(s).length;
    return { chips: q('.chip'), frames: q('.ch-frame'), dial: q('.ch-dial svg path'),
      bars: q('.ch-bar'), pips: q('.ch-pips em'),
      speed: +document.querySelector('[data-f=speed]').textContent,
      cash: document.querySelector('[data-f=cash]').textContent,
      alt: document.querySelector('[data-f=alt]').textContent };
  })()`);
  const model = await evalJSON(S, '({speed: Math.round(__game.hudData().speed), alt: Math.round(__game.hudData().alt), credits: __state.credits})');
  // the strip's numbers must BE the model's, not a plausible second opinion
  const agrees = dom.speed === model.speed
    && dom.alt === `${model.alt} m`
    && dom.cash === String(model.credits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // FALSIFICATION — inject the old chip markup and require the same query to see it.
  const chipsAfter = await evalJSON(S, `(() => {
    const el = document.getElementById('hud-strip');
    const d = document.createElement('div'); d.className = 'chip'; el.appendChild(d);
    const n = el.querySelectorAll('.chip').length; d.remove();
    return n;
  })()`);
  const srcHits = grepJs(/\bChaseStrip\b/);
  check('S2-A/views FALSIFIED — the three-chip strip is deleted, and the chase HUD reads the dash\'s own data model',
    dom.chips === 0 && chipsAfter === 1 && dom.frames >= 3 && dom.dial === 3 && dom.bars === 2
      && dom.pips > 0 && agrees && srcHits.length === 0,
    `#hud-strip holds ${dom.frames} neon frames, a ${dom.dial}-path speed ring, ${dom.bars} bars and `
    + `${dom.pips} hold pips — and ${dom.chips} of P6's .chip elements\n`
    + `it agrees with hudData(): speed ${dom.speed} vs ${model.speed}, alt "${dom.alt}" vs ${model.alt} m, `
    + `cash "${dom.cash}" vs ${model.credits}\n`
    + `FALSIFIED: appending one .chip makes the same query return ${chipsAfter}\n`
    + `source grep /\\bChaseStrip\\b/ over js/: ${srcHits.length} hits${srcHits.length ? ' — ' + srcHits.join(', ') : ' (the class is gone, not renamed or kept beside its replacement)'}`);

  // ── 4. the bonus and its clock DISAPPEAR when the window is missed ────────
  // §S2, explicit. Driven as arithmetic on a synthetic job so the three states are three calls
  // rather than a four-minute flight, then checked on the live DOM.
  const J = (left, total = 200, pay = 1000) => ({ pay, timeLeft: left, timeTotal: total });
  const bFresh = await hook(S, 'bonusFor', J(200));
  const bEdge = await hook(S, 'bonusFor', J(70.1));      // 0.35 * 200 = the saturation point
  const bFade = await hook(S, 'bonusFor', J(35));
  const bGone = await hook(S, 'bonusFor', J(0));
  const bNoJob = await hook(S, 'bonusFor', null);
  // and on the surface: with a bonus the pair is in the DOM, without one it is not displayed
  const domOn = await evalJSON(S, `(() => {
    __game.hudData();
    const el = document.querySelector('.ch-bonus');
    return { off: el.classList.contains('off'), display: getComputedStyle(el).display };
  })()`);
  check('S2-A/instruments FALSIFIED — the bonus is a live figure with its own clock, and BOTH vanish when the window closes',
    bFresh && bFresh.pay === 450 && bFresh.fading === false && near(bFresh.left, 130, 0.01)
      && bEdge && bEdge.fading === false && bFade && bFade.fading === true
      && bFade.pay < bFresh.pay && bFade.pay > 0 && near(bFade.left, 35, 0.01)
      && bGone === null && bNoJob === null,
    `a 1000 CRD job on a 200 s limit:\n`
    + `  200 s left (untouched)  +$${bFresh.pay}, clock ${bFresh.left.toFixed(1)} s to the saturation point, fading ${bFresh.fading}\n`
    + `  70.1 s left (the edge)  +$${bEdge.pay}, fading ${bEdge.fading}\n`
    + `  35 s left (eroding)     +$${bFade.pay} — the LIVE figure, not the headline one — clock ${bFade.left.toFixed(1)} s, fading ${bFade.fading}\n`
    + `  0 s left                ${JSON.stringify(bGone)}   ·   no job at all: ${JSON.stringify(bNoJob)}\n`
    + `FALSIFIED by construction: null is what makes the pair disappear, and the live surface reads `
    + `off=${domOn.off} display=${domOn.display} with no bonus on the board. A panel that kept showing `
    + `+$450 while the payout had fallen to +$${bFade.pay} would be lying about money`);

  // ── 5. the chatter TICKER — history, one live line, three tags ────────────
  await goto();
  // §10.4's OWN suppression, held open for the length of this check. With the director live it
  // kept feeding the queue and a line was never observed retired inside a 40 s window — which
  // reads exactly like a broken ticker and is not. `suppress` is the mechanism `onToast()` already
  // uses, so this is the game's switch rather than a test-only back door, and it is asserted to
  // have taken (a missing radio layer would leave `sup` null and fail here rather than quietly
  // making the check measure the director).
  const sup = await evalJSON(S, `(() => {
    const r = window.__game.radio;
    if (!r || !r.dir) return null;
    r.dir.suppress(r.t, 900);
    return +r.dir.suppressedUntil.toFixed(1);
  })()`);
  if (sup === null) throw new Error('no radio director to suppress — this check would measure the director, not the ticker');
  await evalJSON(S, `(__game.applySettings({chatterHold: 'normal', camera: 'chase'}), 1)`);
  await settle(S, 10);
  // Each line has to RETIRE before the next is fired, or §8.5 queues the second and drops it — and
  // the hold is counted in SIM time, which under a software renderer runs slower than the wall
  // clock. Sleeping 4.2 s of wall time against a 3.5 s hold showed one line in a three-line test
  // and read like a broken ticker. Poll the state instead of guessing at a duration.
  const drainChatter = async (budget = 40000) => {
    const t0 = Date.now();
    for (;;) {
      const live = await evalJSON(S, '__game.uiState().chatter');
      if (!live) return true;
      if (Date.now() - t0 > budget) throw new Error('a chatter line never retired within 40 s of wall clock');
      await sleep(400);
    }
  };
  await drainChatter();
  for (const [sp, tx, tag] of [['NET', 'lane four nominal', 'bg'],
    ['TRAFFIC', 'spine ramp closed at six', 'info'],
    ['DISPATCH', 'parcel is temperature critical', 'alert']]) {
    await evalJSON(S, `__game.chatter({speaker:${JSON.stringify(sp)}, text:${JSON.stringify(tx)}, tag:${JSON.stringify(tag)}})`);
    await drainChatter();
  }
  const log = await hook(S, 'chatLog');
  await evalJSON(S, `__game.chatter({speaker:'X', text:'y', tag:'nonsense'})`);
  await drainChatter();
  const bogus = (await hook(S, 'chatLog')).slice(-1)[0].tag;
  const ticker = await evalJSON(S, `(() => {
    const el = document.getElementById('chatter');
    const live = el.querySelectorAll('.chat-line'), past = el.querySelectorAll('.chat-past');
    const cs = s => { const n = el.querySelector(s); return n ? getComputedStyle(n) : null; };
    // the RETIRED rows, because that is what is on screen once a line has been read
    const bg = cs('.chat-past.k-bg'), al = cs('.chat-past.k-alert');
    return { live: live.length, past: past.length, rows: el.children.length,
      bgOpacity: bg && bg.opacity, alertOpacity: al && al.opacity,
      bgBorder: bg && bg.borderLeftColor, alertBorder: al && al.borderLeftColor };
  })()`);
  const tagsSeen = log.map(l => l.tag).join(',');
  check('S2-A/chatter FALSIFIED — the ticker keeps history, exactly one line is live, and the three tags render differently',
    log.length >= 3 && tagsSeen.startsWith('bg,info,alert') && bogus === 'info'
      && ticker.live === 0 && ticker.past >= 4 && ticker.rows >= 4
      && ticker.bgBorder !== ticker.alertBorder
      // …and in the right DIRECTION. `bg` is the wash the player is not being spoken to by and
      // `alert` is the traffic that matters, so a rule that made them merely DIFFERENT would pass
      // while the two were the wrong way round — which is exactly what the cascade did once.
      && +ticker.bgOpacity < +ticker.alertOpacity,
    `three lines, one per tag, each left to retire: log holds ${log.length} in order [${tagsSeen}]\n`
    + `the DOM holds ${ticker.rows} rows — ${ticker.live} LIVE (.chat-line) and ${ticker.past} retired (.chat-past); `
    + `every line was left to retire before the next was fired, so the live count here is 0 by construction. `
    + `§8.5's one-line rule is about what is being READ, which is why gates_p6's count of .chat-line — taken `
    + `while a line IS live — is still exactly 1\n`
    + `the §10.4 director was held suppressed until t=${sup} s for the length of this check\n`
    + `retired bg    opacity ${ticker.bgOpacity}, rule ${ticker.bgBorder}\n`
    + `retired alert opacity ${ticker.alertOpacity}, rule ${ticker.alertBorder}   — two tags that rendered the `
    + `same, or the wrong way round, would make the whole S2-A↔S2-B contract decorative\n`
    + `FALSIFIED: tag "nonsense" normalises to "${bogus}", so a manifest S2-B has not relabelled yet cannot `
    + `produce an unstyled line`);

  // and the same log reaches the DASH canvas, which is the cockpit-view surface
  await hook(S, 'applySettings', { camera: 'cockpit' });
  await settle(S, 8);
  const dashPx = d => evalJSON(S, `(__game.drawHud(${JSON.stringify(d)}), __game.dashPixels(4))`);
  const baseD = { speed: 20, maxSpeed: 62, alt: 60, cell: 1, cargo: 0, cargoMax: 3, heading: 0, credits: 250 };
  const noChat = await dashPx(baseD);
  const same = await dashPx(baseD);
  const withChat = await dashPx({ ...baseD, chat: [{ k: 1, speaker: 'DISPATCH', text: 'parcel is temperature critical', tag: 'alert' }] });
  const withBonus = await dashPx({ ...baseD, job: { dest: 'FATHOM DECK', pay: 800, timeLeft: 120, timeTotal: 200 }, bonus: { pay: 360, left: 50, fading: false } });
  const dChat = pxDiff(noChat, withChat), dSame = pxDiff(noChat, same), dBonus = pxDiff(noChat, withBonus);
  check('S2-A/dash FALSIFIED — the chat box and the top bar are on the dash canvas, and identical data still draws identical pixels',
    dSame.n === 0 && dChat.n > 100 && dBonus.n > 100,
    `same data twice → ${dSame.n} sampled channels differ. It MUST be 0: the dash canvas has to stay a pure `
    + `function of its data model or gates_p6's §8.2 falsification cannot tell an instrument from noise, `
    + `which is why nothing on it reads a clock or a random\n`
    + `adding one alert line to the log → ${dChat.n} channels differ (worst ${dChat.worst}/255) — the ticker is `
    + `drawn INSIDE the dashboard housing, not floating over the city\n`
    + `adding a job and its bonus to the top bar → ${dBonus.n} differ (worst ${dBonus.worst}/255)`);

  // ── 6. the stats row drives the EXISTING ?perf overlay ───────────────────
  const perfOff = await evalJSON(S, `({n: document.querySelectorAll('#perf').length,
    hidden: document.getElementById('perf').classList.contains('hidden'),
    text: document.getElementById('perf').textContent.length})`);
  await hook(S, 'applySettings', { stats: true });
  await sleep(700); await settle(S, 20);
  const perfOn = await evalJSON(S, `({n: document.querySelectorAll('#perf').length,
    hidden: document.getElementById('perf').classList.contains('hidden'),
    text: document.getElementById('perf').textContent.length,
    fps: /(\\d+) fps/.test(document.getElementById('perf').textContent)})`);
  await hook(S, 'applySettings', { stats: false });
  await settle(S, 8);
  const perfBack = await evalJSON(S, `document.getElementById('perf').classList.contains('hidden')`);
  const rows = await evalJSON(S, `(() => { __game.openSettings(true);
    const l = [...document.querySelectorAll('#settings .set-label')].map(e => e.textContent);
    __game.openSettings(false); return l; })()`);
  check('S2-A/settings FALSIFIED — the Stats row turns the ?perf overlay on and off, and there is only ever ONE overlay',
    rows.includes('Stats') && !rows.includes('View')
      && perfOff.hidden === true && perfOn.hidden === false && perfBack === true
      && perfOn.fps === true && perfOn.text > perfOff.text && perfOn.n === 1 && perfOff.n === 1,
    `settings rows: ${rows.join(' · ')}\n`
    + `Stats Off → #perf hidden ${perfOff.hidden}, ${perfOff.text} chars   On → hidden ${perfOn.hidden}, `
    + `${perfOn.text} chars, an fps figure present ${perfOn.fps}   Off again → ${perfBack}\n`
    + `elements matching #perf: ${perfOn.n} — the row drives the overlay that already existed rather than `
    + `building a second one, because two surfaces answering one question is how they start disagreeing\n`
    + `the View row is GONE (${rows.includes('View') ? 'STILL PRESENT' : 'confirmed'}); the switch is #btn-view`);

  // ── 7. the dash is about HALF its shipped height, on screen, with round corners ──
  // The shipped numbers are literals here because the old geometry no longer exists to measure.
  // P6's dash lip was [1.50, 0.14, 0.52] at y −0.475 z −0.88 rot −9, its consoles [0.20, 0.13,
  // 0.44] at y −0.315 z −0.55 rot −6, and its instrument plane 0.345 x (212/340) portrait /
  // 0.86 x (160/512) landscape at y −0.26 z −0.682 pitch −34. Every corner is projected the same
  // way `cabinExtent()` projects the live ones, so the two numbers are comparable.
  const lay = await hook(S, 'hudLayout');
  const ext = await hook(S, 'cabinExtent');
  const t = Math.tan(lay.fov * 0.5 * Math.PI / 180);
  const D2R = Math.PI / 180;
  const oldTop = (() => {
    let top = -1;
    const consider = (y, z) => { if (z < -1e-3) top = Math.max(top, y / (t * -z)); };
    for (const [py, pz, sy, sz, rx] of [
      [-0.475, -0.88, 0.14, 0.52, -9],        // dash_lip
      [-0.368, -0.704, 0.09, 0.06, -30],      // dash_face
      [-0.315, -0.55, 0.13, 0.44, -6],        // console_l / console_r (mirrored: same y and z)
    ]) {
      for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
        consider(py + sy * dy + Math.abs(sz * dz * Math.sin(rx * D2R)), pz + sz * dz);
      }
    }
    const w = lay.wide ? 0.86 : 0.345, ar = lay.wide ? 160 / 512 : 212 / 340;
    const h = w * ar, yc = h * 0.5 * Math.cos(-34 * D2R), zc = h * 0.5 * Math.abs(Math.sin(-34 * D2R));
    consider(-0.26 + yc, -0.682 - zc);
    return top;
  })();
  const oldFrac = (oldTop + 1) / 2;
  const ratio = ext.frac / oldFrac;
  const corners = await evalJSON(S, `(() => {
    const c = __game.cockpit.dashCanvas, g = c.getContext('2d');
    const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
    const r = 22;
    return { tl: a(1, 1), tr: a(c.width - 2, 1), bl: a(1, c.height - 2), br: a(c.width - 2, c.height - 2),
      insideTL: a(r, r), centre: a(c.width >> 1, c.height >> 1), w: c.width, h: c.height };
  })()`);
  // FALSIFICATION — paint the corner and require the same read to see it.
  const forced = await evalJSON(S, `(() => {
    const c = __game.cockpit.dashCanvas, g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
    const v = g.getImageData(1, 1, 1, 1).data[3];
    __game.drawHud(__game.hudData());
    return { forced: v, restored: g.getImageData(1, 1, 1, 1).data[3] };
  })()`);
  // §S2-L moved this bound, and it is the ASSERTION that changed rather than the build being made
  // to fit it. It read `planeBottom < -0.9` — the plane's near edge within a hair of the FLOOR of
  // the frame — which was true because the quad used to be bottom-anchored to the frame. It is now
  // bottom-anchored to the top of the DOM control lip, so -0.86 portrait / -0.76 landscape is the
  // design rather than a drift. What the bound protected is intact and is now stated exactly: the
  // near edge must be ON SCREEN (> -1, which is the S2-A defect where the bottom third of the
  // dashboard was below the floor and a portrait capture showed nothing wrong) and it must land ON
  // the lip line rather than anywhere near it — a seam, not a gap.
  const lipN = -1 + 2 * (ext.lipFrac || 0);
  const seatedOnLip = ext.planeBottom > -1 && Math.abs(ext.planeBottom - lipN) < 0.01;
  check('S2-A/dash FALSIFIED — the assembly is about half the height it shipped at, sits fully on screen, and its corners are round',
    ratio < 0.65 && ratio > 0.35 && seatedOnLip
      && corners.tl === 0 && corners.tr === 0 && corners.bl === 0 && corners.br === 0
      && corners.insideTL === 255 && corners.centre === 255
      && forced.forced === 255 && forced.restored === 0,
    `${lay.wide ? 'landscape' : 'portrait'} at fov ${lay.fov}: the whole dash ASSEMBLY — lip, consoles and `
    + `instrument plane — covers ${(ext.frac * 100).toFixed(1)} % of the frame height against the shipped `
    + `${(oldFrac * 100).toFixed(1)} %. A ratio of ${ratio.toFixed(2)}; S2 asked for "almost half"\n`
    + `measuring the QUAD alone would have reported ${(ext.plane * 100).toFixed(1)} % and missed the lip, which in `
    + `portrait was the larger half of what the player actually saw\n`
    + `the plane's near edge projects to ${ext.planeBottom} against the control lip's top edge at `
    + `${lipN.toFixed(4)} — SEATED ON IT (${seatedOnLip}), and inside the frame. The first S2 layout put it `
    + `at −1.03, i.e. the bottom third of the dashboard was below the floor of the screen on a landscape `
    + `phone, and a portrait screenshot showed nothing wrong\n`
    + `canvas ${corners.w}x${corners.h}: alpha at the four extreme corners ${[corners.tl, corners.tr, corners.bl, corners.br].join('/')}, `
    + `at (22,22) just inside the radius ${corners.insideTL}, at the centre ${corners.centre} — the corner is CLEARED, `
    + `not painted black over a curve, which is what a transparent material buys\n`
    + `FALSIFIED: painting the top-left corner white makes the same probe read ${forced.forced}, and a redraw `
    + `restores ${forced.restored}`);

  // ── 7b. the two RESERVED bays are real, empty and out of everything's way ─
  // The manager's forward note: S2-E fits a debt-pressure "warmth" gauge, and S2-D/E puts the
  // player on 5-minute vehicle hires that have to be extendable from inside the cabin. Neither is
  // built here. What IS asserted is that there is somewhere for each of them to go.
  const slots = await hook(S, 'dashSlots');
  const rects = ['speed', 'cell', 'warmth', 'alt', 'hold', 'lamps', 'chat']
    .map(k => [k, slots[k]]);
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [an, a] = rects[i], [bn, b] = rects[j];
      const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      if (ox > 0 && oy > 0) overlaps.push(`${an}/${bn} by ${ox.toFixed(0)}x${oy.toFixed(0)}`);
    }
  }
  const inCanvas = rects.every(([, r]) => r[0] >= 0 && r[1] >= slots.bar
    && r[0] + r[2] <= slots.W && r[1] + r[3] <= slots.H);
  // FALSIFICATION — move the warmth bay on top of the cell ring and require the same sweep to see it.
  const clash = (() => {
    const a = slots.cell, b = [slots.cell[0] + 2, slots.cell[1] + 2, slots.warmth[2], slots.warmth[3]];
    const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    return ox > 0 && oy > 0;
  })();
  // and the hire button's slot on the left console, un-hidden, must clear every other control
  const hire = await evalJSON(S, `(() => {
    const b = document.getElementById('btn-hire');
    b.classList.remove('hidden');
    const r = b.getBoundingClientRect();
    const others = ['#altpad', '#btn-view', '#btn-settings', '#mapcase', '#stick']
      .map(s => { const e = document.querySelector(s); const q = e.getBoundingClientRect();
        const ox = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        return { s, over: ox > 0 && oy > 0 }; });
    const centre = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    b.classList.add('hidden');
    return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      clashes: others.filter(o => o.over).map(o => o.s),
      reachable: !!(centre && centre.closest && centre.closest('#btn-hire')),
      hiddenAgain: document.getElementById('btn-hire').getBoundingClientRect().width };
  })()`);
  check('S2-A/reserved FALSIFIED — there is an empty instrument bay for the warmth gauge and a console slot for the hire button',
    overlaps.length === 0 && inCanvas && clash === true
      && slots.warmth[2] > 20 && slots.warmth[3] > 20
      && hire.clashes.length === 0 && hire.reachable === true && hire.hiddenAgain === 0,
    `dash slots (canvas ${slots.W}x${slots.H}, top bar ${slots.bar}${slots.bay ? `, console bay ${JSON.stringify(slots.bay)}` : ', no bay'}):\n`
    + rects.map(([k, r]) => `  ${k.padEnd(7)} ${JSON.stringify(r)}`).join('\n') + '\n'
    + `${overlaps.length} overlapping pairs; all inside the canvas below the top bar: ${inCanvas}. The drawing reads `
    + `this same table, so a reserved bay cannot quietly be drawn over\n`
    + `warmth is ${slots.warmth[2]}x${slots.warmth[3]} px beside the cell ring — both answer "how much runway is `
    + `left", which is why S2-E's debt-pressure gauge belongs there\n`
    + `FALSIFIED: shifting the warmth bay 2 px onto the cell ring makes the same sweep report an overlap (${clash})\n`
    + `#btn-hire un-hidden: ${JSON.stringify(hire.rect)}, clashes with [${hire.clashes.join(', ') || 'nothing'}], `
    + `its own centre hit-tests to itself (${hire.reachable}), and it measures ${hire.hiddenAgain} px again once re-hidden`);

  // ── 7c. the in-cabin panel is a REUSABLE shell, not markup owned by settings ──
  // A hire panel, an earnings screen and a company screen are all coming, and Aaron's verdict on
  // the surface they replace was "it looks fine if it was a web form". So the shell is a class.
  const panel = await evalJSON(S, `(() => {
    __game.openSettings(true);
    const p = document.querySelector('#settings .hud-panel');
    if (!p) { __game.openSettings(false); return { missing: true }; }
    const cs = getComputedStyle(p), br = getComputedStyle(p, '::before');
    const bg = cs.backgroundColor, ok = cs.borderTopColor;
    const out = { radius: parseFloat(cs.borderTopLeftRadius), border: ok, bg,
      bracket: br.content !== 'none', kicker: !!p.querySelector('.hp-kicker'),
      title: (p.querySelector('.hp-title') || {}).textContent,
      body: !!p.querySelector('.hp-body'), close: !!p.querySelector('.hp-close'),
      rows: p.querySelectorAll('.set-row').length };
    __game.openSettings(false);
    return out;
  })()`);
  // FALSIFICATION — build a SECOND panel through the same class on a throwaway host and require it
  // to come out with the identical shell. A "reusable pattern" that only ever produced one panel
  // would be indistinguishable from markup written once.
  const reuse = await evalJSON(S, `(() => {
    const host = document.createElement('div');
    host.className = 'cabin-layer hidden';
    document.body.appendChild(host);
    const p = new __game.CabinPanel(host, { kicker: 'CONTRACT', title: 'EXTEND HIRE' });
    p.body.textContent = '+5 minutes';
    p.show();
    const el = host.querySelector('.hud-panel');
    const cs = getComputedStyle(el);
    const out = { radius: parseFloat(cs.borderTopLeftRadius), border: cs.borderTopColor,
      bg: cs.backgroundColor, title: host.querySelector('.hp-title').textContent,
      open: p.open, afterHide: (p.hide(), p.open), hidden: host.classList.contains('hidden') };
    host.remove();
    return out;
  })()`);
  check('S2-A/panels FALSIFIED — the in-cabin panel is a reusable neon-frame shell, and a second one comes out identical',
    !panel.missing && panel.radius >= 10 && panel.bracket && panel.kicker && panel.body && panel.close
      && panel.title === 'SETTINGS' && panel.rows > 8
      && reuse.title === 'EXTEND HIRE' && reuse.radius === panel.radius
      && reuse.border === panel.border && reuse.bg === panel.bg
      && reuse.open === true && reuse.afterHide === false && reuse.hidden === true,
    `#settings renders a .hud-panel: radius ${panel.radius} px, frame ${panel.border}, tint ${panel.bg}, `
    + `corner brackets ${panel.bracket}, kicker+title "${panel.title}", ${panel.rows} settings rows inside its body\n`
    + `FALSIFIED by construction: a second CabinPanel built on a throwaway host — the shape S2-D/E's hire panel `
    + `will take — comes out with radius ${reuse.radius}, frame ${reuse.border}, tint ${reuse.bg} and the title `
    + `"${reuse.title}", and show/hide moves ${reuse.open} → ${reuse.afterHide} with the layer hidden ${reuse.hidden}. `
    + `Identical shell, different contents, no second idea of what a NEONHAUL panel looks like`);

  // ── 8. every control says what it does, and relabelling did not unbind it ─
  const labels = await evalJSON(S, `(() => {
    const t = id => (document.getElementById(id).textContent || '').replace(/\\s+/g, ' ').trim();
    return { up: t('btn-up'), down: t('btn-down'), boost: t('btn-boost'), view: t('btn-view'),
      squelch: t('btn-squelch'), hover: document.querySelector('.lv-tag').textContent };
  })()`);
  const held = {};
  const spawn = await hook(S, 'spawn');
  for (const [id, key] of [['btn-up', 'up'], ['btn-down', 'down'], ['btn-boost', 'boost']]) {
    // Reset to a known pose before EACH button, so the second measurement is not fighting the
    // velocity the first one left behind. The ▼ leg read -3.73 m/s against a -3 bar when it
    // started from whatever ▲ had just done: a pass by luck, which is a fail waiting to happen.
    await hook(S, 'flightReset', spawn.pos[0], 300, spawn.pos[2], 0, 0);
    await settle(S, 6);
    const box = await evalJSON(S, `(() => { const b = document.getElementById('${id}').getBoundingClientRect();
      return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)]; })()`);
    await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box[0], y: box[1] }] });
    await settle(S, 22);
    const p = await evalJSON(S, '({btn: __game.controlsProbe().btn, vy: __state.flight.vy})');
    await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(S, 6);
    const rel = await evalJSON(S, '__game.controlsProbe().btn');
    held[key] = { at: box, down: p.btn[key], vy: +p.vy.toFixed(2), up: rel[key] };
  }
  // FALSIFICATION — blank one label and require the same read to catch it.
  const blanked = await evalJSON(S, `(() => {
    const n = document.querySelector('#btn-up .cb-label'), was = n.textContent;
    n.textContent = ''; const seen = document.getElementById('btn-up').textContent.includes('RISE');
    n.textContent = was; return seen;
  })()`);
  const labelled = /RISE/.test(labels.up) && /SINK/.test(labels.down) && /BOOST/.test(labels.boost)
    && labels.hover === 'HOVER';
  const bound = held.up.down === true && held.up.vy > 6 && held.up.up === false
    && held.down.down === true && held.down.vy < -6 && held.down.up === false
    && held.boost.down === true && held.boost.up === false;
  check('S2-A/controls FALSIFIED — the collective and the boost say what they do, and saying it did not unbind them',
    labelled && bound && blanked === false,
    `labels: ▲ "${labels.up}"  ▼ "${labels.down}"  boost "${labels.boost}"  slot "${labels.hover}"  `
    + `view "${labels.view}"  left console "${labels.squelch}"\n`
    + `Aaron read the chevrons as CLIMB — which the nose already does — and correctly concluded they were `
    + `redundant. What they actually do is rise and sink ON THE SPOT, so that is what they now say, and the `
    + `word between them is HOVER\n`
    + `still bound after the rebuild: ▲ at (${held.up.at}) held=${held.up.down} vy ${held.up.vy} released=${held.up.up}  ·  `
    + `▼ at (${held.down.at}) held=${held.down.down} vy ${held.down.vy} released=${held.down.up}  ·  `
    + `⏵⏵ held=${held.boost.down} released=${held.boost.up}\n`
    + `FALSIFIED: blanking the ▲ label makes the same read return ${blanked}`);

  // ── 9. the cog is TUCKED UNDER the minimap and overlapping it ─────────────
  const map = await rectOf(S, '#mapcase');
  const gear = await rectOf(S, '#btn-settings');
  const overlapY = Math.min(map.bottom, gear.bottom) - Math.max(map.y, gear.y);
  const inside = gear.x >= map.x && gear.right <= map.right;
  const under = gear.y > map.y + map.h * 0.5;
  const topRight = map.y < H * 0.12 && map.right > W - 24;
  // FALSIFICATION — push the cog 200 px down and require the same geometry check to fail.
  await evalJSON(S, `(document.getElementById('btn-settings').style.top = '${Math.round(gear.y + 200)}px', 1)`);
  await settle(S, 3);
  const gearMoved = await rectOf(S, '#btn-settings');
  const overlapMoved = Math.min(map.bottom, gearMoved.bottom) - Math.max(map.y, gearMoved.y);
  await evalJSON(S, `(document.getElementById('btn-settings').style.top = '', 1)`);
  check('S2-A/layout FALSIFIED — the map is in the top-right corner and the cog tucks under it, overlapping',
    topRight && inside && under && overlapY > 4 && overlapMoved <= 4,
    `map ${JSON.stringify(map)} in a ${W}x${H} frame — top-right corner: ${topRight}\n`
    + `cog ${JSON.stringify(gear)} — horizontally inside the map's span: ${inside}, below its centre line: ${under}, `
    + `vertical overlap ${overlapY.toFixed(1)} px\n`
    + `The cog is BEHIND the disc rather than on top of it because #hud is z 20 and #controls is z 18 — that is `
    + `what makes the two read as one housing rather than as a button parked near a map\n`
    + `FALSIFIED: pushing the cog 200 px down takes the overlap to ${overlapMoved.toFixed(1)} px and the same check fails`);

  // ── evidence ─────────────────────────────────────────────────────────────
  await hook(S, 'applySettings', { camera: 'cockpit' });
  await settle(S, 16);
  await shot(S, `cockpit_${W}x${H}`);
  await hook(S, 'applySettings', { camera: 'chase' });
  await settle(S, 16);
  await shot(S, `chase_${W}x${H}`);
  const errs = await evalJSON(S, '__state.errors');
  check('S2-A — nothing threw across the whole run',
    errs.length === 0, `${errs.length} error(s)${errs.length ? ': ' + JSON.stringify(errs.slice(0, 4)) : ''}`);

  console.log('\nlogs:', logs.length ? logs.slice(0, 6).join('\n') : 'none');
  await close();
}

// A source grep, so "ChaseStrip is deleted" is checked against the files rather than against memory.
function grepJs(re) {
  const dir = resolve(ROOT, 'js');
  const hits = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    readFileSync(resolve(dir, f), 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (re.test(code)) hits.push(`${f}:${i + 1}`);
    });
  }
  return hits;
}

main().then(() => {
  console.log(`\n${ok.length}/${ok.length + fail.length} gates pass  →  ${FILE.replace(ROOT + '/', '')}`);
  if (fail.length) console.log('FAILED: ' + fail.join('\n        '));
  process.exit(fail.length ? 1 : 0);
}).catch(async e => {
  console.error('gates_s2a aborted:', e.message);
  console.error(logs.slice(0, 10).join('\n'));
  process.exit(2);
});
