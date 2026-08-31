#!/usr/bin/env node
/**
 * Drives REAL touches at the running game and checks the controls do what they claim.
 * Screenshots prove nothing about input; this is the only thing that does.
 */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';

const W = 900, H = 420;
const log = (m) => process.stderr.write(m + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await serveWithUpload();
const c = await CDP.launch();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

async function touch(points, opts = {}) {
  const [first, ...rest] = points;
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first.x, y: first.y }] });
  for (const p of rest) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
    if (opts.step) await sleep(opts.step);
  }
  if (opts.hold) await sleep(opts.hold);
  const last = points[points.length - 1];
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  void last;
}

const line = (x0, y0, x1, y1, n = 14) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + (x1 - x0) * i / (n - 1), y: y0 + (y1 - y0) * i / (n - 1) }));
const arc = (cx, cy, r, a0, a1, n = 22) =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + (a1 - a0) * i / (n - 1);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

try {
  await c.viewport(W, H, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1&unlock=1&level=20`);
  await c.waitFor('window.__state && window.__state.mode === "fight"', 20000);
  await c.frames(20);
  log(`in fight: ${JSON.stringify(await c.eval('window.__state'))}\n`);

  // Park the enemies. Otherwise they knock the player down mid-assertion and the test
  // reports a control failure that is really just the player being staggered.
  await c.eval(`window.__ragdojo.match.brains.length = 0`);
  const RESET = `(()=>{const m=window.__ragdojo.match,p=m.player;
    for(const k in p.cd) p.cd[k]=0;
    p.attack=null; p.mode='live'; p.stunT=0; p.staggerT=0; p.guardBroken=0;
    p.hp=p.maxHp; p.gain=1; p.vx=0; p.vy=0; p.onGround=true; p.y=p.standY;
    p.rag.place(p.x,p.y,[]); return 1})()`;

  // ── gestures ───────────────────────────────────────────────────────────
  const RX = 640, RY = 200;   // right half, clear of the move strip
  const CASES = [
    ['power', 'slash  /',   () => line(RX - 70, RY + 70, RX + 70, RY - 70)],
    ['toss',  'arch   ∩',   () => arc(RX, RY + 20, 70, Math.PI, Math.PI * 2)],
    ['rise',  'up     ↑',   () => line(RX, RY + 80, RX + 4, RY - 80)],
    ['slam',  'down   ↓',   () => line(RX, RY - 80, RX + 4, RY + 80)],
    ['dash',  'right  →',   () => line(RX - 80, RY, RX + 80, RY + 4)],
    ['flipF', 'circle ↻',   () => arc(RX, RY, 64, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 28)],
    ['flipB', 'circle ↺',   () => arc(RX, RY, 64, -Math.PI / 2, -Math.PI / 2 - Math.PI * 2, 28)],
    ['bomb',  'vee    V',   () => [...line(RX - 70, RY - 60, RX, RY + 60, 10), ...line(RX, RY + 60, RX + 70, RY - 60, 10)]],
  ];

  for (const [id, label, gen] of CASES) {
    await c.eval(RESET);
    await c.frames(4);
    await touch(gen(), { step: 5 });
    await c.frames(6);
    const cd = await c.eval(`window.__ragdojo.match.player.cooldown(${JSON.stringify(id)})`);
    ok(`gesture ${label} -> ${id}`, cd > 0, `cooldown=${(+cd).toFixed(2)}`);
  }

  // ── tap = punch ────────────────────────────────────────────────────────
  await c.eval(RESET);
  await c.frames(4);
  await touch([{ x: RX, y: RY }, { x: RX + 2, y: RY + 1 }], { hold: 40 });
  await c.frames(2);
  const atk = await c.eval(`(()=>{const a=window.__ragdojo.match.player.attack; return a?a.key:null})()`);
  ok('tap -> punch', !!atk, `attack=${atk}`);

  // ── stick ──────────────────────────────────────────────────────────────
  await c.eval(RESET);
  await c.frames(4);
  const x0 = await c.eval(`window.__ragdojo.match.player.x`);
  // The stick base sits bottom-left; drag right from it.
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: H - 100 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 175, y: H - 100 }] });
  await c.frames(30);
  const x1 = await c.eval(`window.__ragdojo.match.player.x`);
  ok('stick right -> moves right', x1 > x0 + 8, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`);

  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: H - 190 }] });
  await c.frames(4);
  const airborne = await c.eval(`!window.__ragdojo.match.player.onGround`);
  ok('stick up -> jumps', airborne);

  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.eval(RESET);
  await c.frames(6);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: H - 20 }] });
  await c.frames(20);
  const blocking = await c.eval(`window.__ragdojo.match.player.blocking || window.__ragdojo.match.player.anim === 'block'`);
  ok('stick down -> ducks/blocks', blocking);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  log(c.errors.length ? `\nCONSOLE ERRORS:\n${c.errors.slice(0, 8).join('\n')}` : '\nno console errors');
  log(`\n${pass} pass, ${fail} fail`);
} finally { c.close(); srv.close(); }
process.exit(fail ? 1 : 0);
