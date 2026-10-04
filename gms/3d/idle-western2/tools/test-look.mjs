// Hold-to-look: real CDP touch (S22 412×915) + desktop mouse. `node tools/test-look.mjs` (CDP_PORT, shots → docs/shots/look-*.png)
import { fileURLToPath } from 'node:url';
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';

const OUT = fileURLToPath(new URL('../docs/shots/', import.meta.url));
const S22_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const fails = [];
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails.push(msg); };

const SETUP = `(() => {
  window.__clicks = { hero: 0, card: 0 };
  document.querySelector('.hero-view').addEventListener('click', () => __clicks.hero++);
  for (const v of document.querySelectorAll('.line-view')) v.addEventListener('click', () => __clicks.card++);
  // The hero shows sky + mesas by design (round 2, refs/a_clay_hero.jpg): only its lower frame must land in the world.
  window.__probe = (cam) => {
    const V = cam.position.constructor, b = __iw2.world.heroRig.bounds; let bad = 0;
    cam.updateMatrixWorld();
    // Facade card cameras (P r3+) frame a sky band on purpose, so like the hero only their lower frame must land.
    const line = cam.userData?.iw2Line, facade = !!(line && __iw2.world.plots.get(line)?.camera?.facade);
    const hero = cam === __iw2.world.heroRig.camera || facade;
    for (const [x, y] of hero ? [[-1, -1], [0, -1], [1, -1], [-1, -0.4], [1, -0.4]] : [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) {
      const p = new V(x, y, 0.5).unproject(cam), d = p.sub(cam.position).normalize();
      if (d.y > -0.004) { bad++; continue; }
      const t = -cam.position.y / d.y, gx = cam.position.x + d.x * t, gz = cam.position.z + d.z * t;
      if (t > cam.far * 0.9 || gx < b.x0 || gx > b.x1 || gz < b.z0 || gz > b.z1) bad++;
    }
    return bad;
  };
  return true;
})()`;
const STATE = (orbitExpr, camExpr) => `(() => { const o = ${orbitExpr}, c = ${camExpr}; return { active: __iw2ui.debug.look.active, busy: o.busy, off: o.offset, pos: c.position.toArray(), bad: __probe(c), y: scrollY, clicks: { ...__clicks } }; })()`;

async function touch(page, type, pts) {
  await page.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
}
async function drag(page, x, y, dx, dy, steps = 12, ms = 240, extra = []) {
  for (let i = 1; i <= steps; i++) { await touch(page, 'touchMove', [[x + dx * i / steps, y + dy * i / steps], ...extra]); await sleep(ms / steps); }
}
const rect = (page, sel) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top }; })()`);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const port = launch({ port: +(process.env.CDP_PORT || 9311) });
try {
  console.log('phone S22 412x915 (touch)');
  const page = await openPage(port);
  await page.send('Network.setUserAgentOverride', { userAgent: S22_UA });
  await page.goto(GAME + '?nosave=1&demo=1', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  await page.wait('window.__iw2 && window.__iw2.ready', 20000);
  await sleep(2500);
  await page.eval(SETUP);
  await page.eval('scrollTo(0, 0)');
  await sleep(400);
  const HERO = STATE('__iw2.world.heroRig.orbit', '__iw2.world.heroRig.camera');

  // 1. Quick tap on the hero still clicks.
  let h = await rect(page, '.hero-view');
  let s0 = await page.eval(HERO);
  await touch(page, 'touchStart', [[h.x, h.y + 40]]); await sleep(70); await touch(page, 'touchEnd', []);
  await sleep(250);
  let s = await page.eval(HERO);
  check(s.clicks.hero === s0.clicks.hero + 1 && !s.busy, `quick hero tap clicks (${s.clicks.hero - s0.clicks.hero}) and no look`);

  // 2. Hold + drag on the hero orbits; no scroll; no click.
  const cur0 = await page.eval('__iw2.world.heroRig.current');
  await touch(page, 'touchStart', [[h.x, h.y]]);
  await sleep(330);
  s = await page.eval(HERO);
  check(s.active, 'hero hold engages look mode');
  await drag(page, h.x, h.y, -150, 90);
  await sleep(120);
  s = await page.eval(HERO);
  check(Math.abs(s.off.yaw) > 20 && s.off.pitch > 3, `hero drag orbits (yaw ${s.off.yaw.toFixed(1)}°, pitch +${s.off.pitch.toFixed(1)}°)`);
  check(s.y === 0, `no page scroll while looking (scrollY ${s.y})`);
  check(s.bad === 0, `hero mid-look frame lands inside the world (${s.bad} bad probes)`);
  await page.shot(OUT + 'look-hero-mid.png');
  await drag(page, h.x - 150, h.y + 90, -500, 500, 10, 200);
  await sleep(100);
  s = await page.eval(HERO);
  check(s.bad === 0 && Math.abs(s.off.yaw) <= 75.01, `hero clamp at extremes (yaw ${s.off.yaw.toFixed(1)}°, pitch ${s.off.pitch.toFixed(1)}°, zoom ${s.off.zoom.toFixed(2)}, bad ${s.bad})`);
  await page.shot(OUT + 'look-hero-extreme.png');
  await touch(page, 'touchEnd', []);
  await sleep(200);
  s = await page.eval(HERO);
  check(!s.active && s.busy && s.clicks.hero === s0.clicks.hero + 1, `release holds the view, no click (busy ${s.busy}, clicks +${s.clicks.hero - s0.clicks.hero})`);
  await sleep(800);
  const sHold = await page.eval(HERO);
  check(sHold.off.w === 1, 'view still held ~1 s after release');
  await sleep(1500);
  s = await page.eval(HERO);
  const cur1 = await page.eval('__iw2.world.heroRig.current');
  check(!s.busy && s.off.w === 0, 'eases back to the default framing');
  check(cur0 === cur1, `director tour paused during look (${cur0} → ${cur1})`);

  // 3. Fast swipe on a card scrolls natively and never engages.
  await page.eval(`document.querySelector('.line-card:not([hidden]):not(.ghost)').scrollIntoView({ block: 'center' })`);
  await sleep(700);
  let c = await rect(page, '.line-card:not([hidden]):not(.ghost) .line-view');
  const y0 = await page.eval('scrollY');
  await touch(page, 'touchStart', [[c.x, c.y + 60]]);
  await drag(page, c.x, c.y + 60, 0, -260, 8, 110);
  await touch(page, 'touchEnd', []);
  await sleep(700);
  const y1 = await page.eval('scrollY');
  const busyAfterSwipe = await page.eval(`__iw2ui.debug.look.busy`);
  check(y1 - y0 > 150 && !busyAfterSwipe, `fast swipe scrolls (${y0} → ${y1}) without look`);

  // 4. Card: tap still taps; hold-look orbits its own camera; pinch zooms.
  const id = await page.eval(`(() => { const cs = [...document.querySelectorAll('.line-card:not([hidden]):not(.ghost)')]; const c = cs[Math.min(1, cs.length - 1)]; c.scrollIntoView({ block: 'center' }); return c.dataset.line; })()`);
  await sleep(900);
  const sel = `.line-card[data-line="${id}"] .line-view`;
  c = await rect(page, sel);
  const CARD = STATE(`__iw2.world.cardRig('${id}').orbit`, `__iw2.world.cardRig('${id}').camera`);
  s0 = await page.eval(CARD);
  await touch(page, 'touchStart', [[c.x, c.y - 30]]); await sleep(80); await touch(page, 'touchEnd', []);
  await sleep(250);
  s = await page.eval(CARD);
  check(s.clicks.card === s0.clicks.card + 1 && !s.busy, `quick ${id} card tap clicks (+${s.clicks.card - s0.clicks.card})`);
  const yc = await page.eval('scrollY');
  await touch(page, 'touchStart', [[c.x, c.y]]);
  await sleep(320);
  await drag(page, c.x, c.y, 130, 70);
  await sleep(150);
  s = await page.eval(CARD);
  check(s.active && Math.abs(s.off.yaw) > 20 && s.bad === 0 && dist(s.pos, s0.pos) > 2, `${id} card orbits (yaw ${s.off.yaw.toFixed(1)}°, pitch ${s.off.pitch.toFixed(1)}°, moved ${dist(s.pos, s0.pos).toFixed(1)} m, bad ${s.bad})`);
  check(s.y === yc, `card look holds the page still (${yc} → ${s.y})`);
  await page.shot(OUT + 'look-card-mid.png');
  await touch(page, 'touchStart', [[c.x + 130, c.y + 70], [c.x - 40, c.y - 40]]);
  for (let i = 1; i <= 8; i++) { await touch(page, 'touchMove', [[c.x + 130, c.y + 70], [c.x - 40 - i * 12, c.y - 40 - i * 12]]); await sleep(30); }
  await sleep(100);
  s = await page.eval(CARD);
  check(s.off.zoom < 0.95 || s.off.zoom > 1.05 || s.bad === 0, `pinch changes zoom (${s.off.zoom.toFixed(2)}; clamped if it would leave the world, bad ${s.bad})`);
  await touch(page, 'touchEnd', []);
  await sleep(300);
  await touch(page, 'touchStart', [[c.x, c.y]]);
  await sleep(320);
  check(await page.eval(`__iw2ui.debug.look.active`), 're-grab during the hold re-engages');
  await drag(page, c.x, c.y, -600, 400, 10, 200);
  await sleep(100);
  s = await page.eval(CARD);
  check(s.bad === 0 && Math.abs(s.off.yaw) <= 60.01, `${id} card clamp at extremes (yaw ${s.off.yaw.toFixed(1)}°, pitch ${s.off.pitch.toFixed(1)}°, bad ${s.bad})`);
  await page.shot(OUT + 'look-card-extreme.png');
  await touch(page, 'touchEnd', []);
  await sleep(300);
  const cardFps = await page.eval(`__iw2.host.debug.listViews?.().find((v) => v.id === 'line:${id}')?.fps ?? null`);
  await sleep(2600);
  s = await page.eval(CARD);
  check(!s.busy && dist(s.pos, s0.pos) < 0.05 && s.clicks.card === s0.clicks.card + 1, `${id} card eased back (off ${dist(s.pos, s0.pos).toFixed(3)} m), no click`);
  const fpsAfter = await page.eval(`__iw2.host.debug.listViews?.().find((v) => v.id === 'line:${id}')?.fps ?? null`);
  console.log(`  info card fps during ease ${cardFps}, after ${fpsAfter}`);
  check(!page.exceptions.length, 'no exceptions' + (page.exceptions.length ? ': ' + page.exceptions[0] : ''));
  await page.close();

  console.log('desktop 1440x900 (mouse)');
  const dp = await openPage(port);
  await dp.goto(GAME + '?nosave=1&demo=1', VIEWPORTS.desktop);
  await dp.wait('window.__iw2 && window.__iw2.ready', 20000);
  await sleep(2000);
  await dp.eval(SETUP);
  h = await rect(dp, '.hero-view');
  const mouse = (type, x, y, extra = {}) => dp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  s0 = await dp.eval(HERO);
  await mouse('mousePressed', h.x, h.y); await sleep(60); await mouse('mouseReleased', h.x, h.y);
  await sleep(200);
  s = await dp.eval(HERO);
  check(s.clicks.hero === s0.clicks.hero + 1 && !s.busy, 'mouse click on hero still clicks');
  await mouse('mousePressed', h.x, h.y);
  await sleep(330);
  for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', h.x + i * 18, h.y + i * 6); await sleep(20); }
  s = await dp.eval(HERO);
  check(s.active && Math.abs(s.off.yaw) > 10 && s.bad === 0, `mouse hold-drag orbits the hero (yaw ${s.off.yaw.toFixed(1)}°)`);
  await dp.shot(OUT + 'look-desktop-mid.png');
  await mouse('mouseReleased', h.x + 180, h.y + 60);
  await sleep(200);
  s = await dp.eval(HERO);
  check(s.clicks.hero === s0.clicks.hero + 1, 'mouse look release does not click');
  const side = await rect(dp, '.line-card:not([hidden])');
  const w0 = await dp.eval('scrollY');
  await dp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: side.x, y: side.y, deltaX: 0, deltaY: 400 });
  await sleep(500);
  const w1 = await dp.eval('scrollY');
  check(w1 > w0, `wheel still scrolls the page (${w0} → ${w1})`);
  check(!dp.exceptions.length, 'no exceptions' + (dp.exceptions.length ? ': ' + dp.exceptions[0] : ''));
  await dp.close();
} finally {
  stop(port);
}
console.log(fails.length ? `\nFAIL ${fails.length}` : '\nPASS');
process.exit(fails.length ? 1 : 0);
