// C5 sheep scatter in the REAL game at Muckle Bottom (?airport=farm): a low pass over the south pasture makes the
// sheep bolt away from the plane and a bleat play; the same pass at altitude does nothing. Screenshots → docs/shots/sheep/.
//   ~/.claude/bin/cdp start --port 9731 -- --use-angle=metal --autoplay-policy=no-user-gesture-required
//   node tools/test-sheep.mjs [--port=9731] [--only=portrait,landscape] [--falsify=nosheep]
//   --falsify=nosheep turns world.sheep.update into a no-op (the main.js wiring removed): the run must go red.
//   SHEEP2 (D38): the low pass also pays Woolly Jumper PP, counts one Sheep Scatterer task scatter, and Mudge (chance
//   forced to 1 here) answers with his own voiced sheep_scatter line. --falsify=nobonus drops the score event,
//   --falsify=noclips removes the sheep_scatter clips (Mudge falls back to scold_buzz): each must go red.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './story/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'docs', 'shots', 'sheep');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const ONLY = arg('only', 'portrait,landscape').split(',');
const FALSIFY = arg('falsify', '');
const BASE = 'http://localhost:8888/gms/3d/krayzee/';
const PROFILE = { name: 'Shep', gender: 'm', company: 'Shep Air', primary: '#2f6b3a', secondary: '#f6f1e6', accent: '#c8102e', voice: 'toff', registration: 'K-BAAA' };
const VIEWS = { portrait: [390, 844, true], landscape: [844, 390, true] };

const C = await connect(+arg('port', 9731));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const REC = `(async () => {
  const A = await import('${BASE}js/audio/index.js'), sys = A.getAudio(), H = window.__game.world.sheep;
  const rec = window.__sheepRec = { bleats: [], scatters: [], lines: [], pp: [] };
  const SM = await import('${BASE}js/world/sheep.js'); SM.MUDGE.chance = 1;
  const g = window.__game.wiring.game; g.on('pp', (e) => rec.pp.push({ id: e.id, amount: e.amount, flock: e.flock }));
  if (${JSON.stringify(FALSIFY)} === 'nobonus') { const he = g.handleEvent; g.handleEvent = (ev) => (ev?.type === 'sheep_scatter' ? undefined : he(ev)); }
  if (${JSON.stringify(FALSIFY)} === 'noclips') { const au = window.__game.wiring.radio.bank.audio; for (const k of [...au.keys()]) if (k.includes('.sheep_scatter.')) au.delete(k); }
  const pb = sys.playBleat;
  sys.playBleat = (o) => { rec.bleats.push({ t: performance.now(), x: o.position?.[0], z: o.position?.[2] }); return pb(o); };
  const os = H.flock.onScatter;
  H.flock.onScatter = (ev) => { rec.scatters.push({ ...ev, t: performance.now() }); return os(ev); };
  window.__game.wiring.radio.on('line', (l) => rec.lines.push({ id: l.id, intent: l.intent, missing: !!l.missing }));
  if (${JSON.stringify(FALSIFY)} === 'nosheep') H.update = () => {};
  return H.flock.sheep.length;
})()`;
// the pasture beside the strip (flock 0): its centre, long axis and current sheep positions
const FIELD = `(() => { const F = window.__game.world.sheep.flock, f = F.flocks[0];
  return { cx: f.cx, cz: f.cz, u: f.u, a: f.a, b: f.b, sheep: F.sheep.filter((s) => s.f === f).map((s) => [s.x, s.z]) }; })()`;
const P = `(() => { const p = window.__game.S.player?.ac; return p && { x: p.pos.x, z: p.pos.z, agl: p.agl, crashed: p.crashed }; })()`;

async function flyOver(f, agl, secs, label, v) {
  // start 300 m out along the field's long axis (+u) and fly straight down it (-u); heading 0 = north (-Z)
  const head = ((Math.atan2(-f.u[0], f.u[1]) * 180) / Math.PI + 360) % 360;
  const x0 = f.cx + f.u[0] * 300, z0 = f.cz + f.u[1] * 300;
  const n0 = await C.ev('({ s: window.__sheepRec.scatters.length, b: window.__sheepRec.bleats.length })');
  const before = (await C.ev(FIELD)).sheep;
  await C.ev(`window.__game.teleport({ x: ${x0}, z: ${z0}, alt: ${agl}, heading: ${head}, speedKt: 85, throttle: 0.75 })`);
  const track = [];
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < secs * 1000) {
    const p = await C.ev(P);
    if (p) track.push([p.x, p.z, p.agl]);
    if (!shot && Date.now() - t0 > secs * 450) { shot = true; await C.shot(SHOTS, `${v}_${label}_mid`); }
    await C.sleep(150);
  }
  await C.shot(SHOTS, `${v}_${label}_after`);
  const after = (await C.ev(FIELD)).sheep;
  const rec = await C.ev('window.__sheepRec');
  const sc = rec.scatters.slice(n0.s).filter((e) => e.player);
  const bl = rec.bleats.slice(n0.b);
  // away: each sheep that moved ended further from the closest point of the player's track than it started
  const close = (x, z) => track.reduce((m, q) => (Math.hypot(q[0] - x, q[1] - z) < m.d ? { d: Math.hypot(q[0] - x, q[1] - z), q } : m), { d: Infinity, q: null });
  const moved = before.map(([x, z], i) => {
    const [x1, z1] = after[i], c = close(x, z);
    return { m: Math.hypot(x1 - x, z1 - z), away: c.q ? Math.hypot(x1 - c.q[0], z1 - c.q[1]) - c.d : 0, d: c.d };
  });
  const minAgl = Math.min(...track.map((q) => q[2])), maxAgl = Math.max(...track.map((q) => q[2]));
  return { sc, bl, moved, minAgl, maxAgl, track: track.length, lines: rec.lines, pp: rec.pp };
}

for (const v of ONLY.filter((x) => VIEWS[x])) {
  const [w, h, mobile] = VIEWS[v];
  await C.viewport(w, h, mobile);
  await C.send('Page.navigate', { url: 'about:blank' });
  await C.sleep(200);
  await C.load(BASE + '?intro=0');
  await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('krayzee.coach', '{"goal":1,"stick":1,"release":1,"radio":1,"bank":1}'); localStorage.setItem('krayzee.coachTakeoff', '1'); true`);
  check(`${v}: boots at the farm`, await C.load(BASE + '?intro=0&noaccount=1&airport=farm&plane=c172') && await C.ev("window.__game.world.airport === 'farm' && !!window.__game.world.sheep"));
  C.errors.length = 0;
  await C.ev(`window.__game.start('free')`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(await C.ev('!!window.__game.S.player'))) await C.sleep(300);
  await C.sleep(1500);
  const n = await C.ev(REC);
  check(`${v}: 34 sheep in 3 fields, one instanced mesh`, n === 34 && await C.ev(`window.__game.world.root.children.filter((m) => m.name === 'flock-sheep' && m.isInstancedMesh).length === 1 && window.__game.world.sheep.flock.flocks.length === 3`), `${n} sheep`);
  await C.ev(`window.__game.setView?.('chase')`);
  const f = await C.ev(FIELD);
  await C.shot(SHOTS, `${v}_grazing`);

  const hi = await flyOver(f, 220, 6, 'high', v);
  const hiRan = hi.moved.filter((m) => m.m > 8).length;
  check(`${v}: pass at ~${Math.round(hi.minAgl)}-${Math.round(hi.maxAgl)} m AGL: no scatter by the player`, hi.sc.length === 0 && hiRan <= 2, `${hi.sc.length} player scatters, ${hiRan} sheep moved > 8 m`);

  const TK = `import('${BASE}js/game/tasks.js').then((m) => ({ n: m.peekTasks()?.stats().sheepScatters || 0, done: !!m.peekTasks()?.isDone('sheep_1') }))`;
  const tk0 = await C.ev(TK);
  const lo = await flyOver(f, 14, 10, 'low', v);
  const near = lo.moved.filter((m) => m.d < 70), ran = near.filter((m) => m.m > 6), away = ran.filter((m) => m.away > 2);
  const fps = await C.ev('window.__game.state().fps');
  check(`${v}: low pass (${Math.round(lo.minAgl)}-${Math.round(lo.maxAgl)} m AGL): the player scatters the flock`, lo.sc.length >= 1 && near.length >= 5 && ran.length >= near.length * 0.8, `${lo.sc.length} scatter events, ${ran.length}/${near.length} sheep within 70 m of the track moved > 6 m (${lo.moved.filter((m) => m.m > 6).length}/${f.sheep.length} in all)`);
  check(`${v}:   … they run away from the plane`, ran.length && away.length >= ran.length * 0.8, `${away.length}/${ran.length}`);
  check(`${v}:   … and a bleat plays`, lo.bl.length >= 1, `${lo.bl.length} bleats`);
  check(`${v}: fps during the pass`, fps > 0, `${fps} fps (headless Metal)`);
  const wool = lo.pp.filter((e) => e.id === 'sheep_scatter'), perFlock = new Set(wool.map((e) => e.flock));
  check(`${v}:   … Woolly Jumper PP, once per flock (D38)`, wool.length >= 1 && wool.length === perFlock.size && wool.every((e) => e.amount >= 30), wool.map((e) => `flock ${e.flock} +${e.amount}`).join(', ') || 'none');
  const tk = await C.ev(TK);
  check(`${v}:   … counted for the Sheep Scatterer task`, tk.n - tk0.n === wool.length && wool.length >= 1 && tk.done, `sheepScatters ${tk0.n} → ${tk.n}, sheep_1 ${tk.done ? 'done' : 'not done'}`);
  const mudge = lo.lines.filter((l) => /^tower_farm\.(sheep_scatter|scold_buzz)/.test(l.id || ''));
  await C.sleep(4000); // he speaks after the queue; give him a moment
  const all = (await C.ev('window.__sheepRec.lines')).filter((l) => /^tower_farm\.(sheep_scatter|scold_buzz)/.test(l.id || ''));
  check(`${v}:   … Farmer Mudge answers with his own voiced sheep line`, all.length >= 1 && all.every((l) => l.intent === 'sheep_scatter' && !l.missing), all.map((l) => l.id + (l.missing ? ' (no clip)' : '')).join(', ') || `none (${mudge.length} during the pass)`);
  // a few seconds later they settle and graze again
  await C.sleep(5000);
  const st = await C.ev('window.__game.world.sheep.state');
  await C.shot(SHOTS, `${v}_settled`);
  check(`${v}: they settle again`, st.fleeing === 0, `fleeing ${st.fleeing}, moving ${st.moving}`);
  check(`${v}: no console errors`, C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
}
// --closeup: a fixed camera beside a group of grazing sheep while a low pass goes straight over them (screenshots
// for the docs, no checks)
if (process.argv.includes('--closeup')) {
  await C.viewport(1280, 720, false);
  await C.send('Page.navigate', { url: 'about:blank' });
  await C.sleep(200);
  await C.load(BASE + '?intro=0&noaccount=1&airport=farm&plane=c172');
  await C.ev(`window.__game.start('free')`);
  await C.sleep(4000);
  await C.ev(REC);
  const f = await C.ev(FIELD);
  // the densest little group of sheep in the pasture
  const g = f.sheep.map(([x, z]) => ({ x, z, n: f.sheep.filter(([a, b]) => Math.hypot(a - x, b - z) < 25).length })).sort((a, b) => b.n - a.n)[0];
  const v = [-f.u[1], f.u[0]];
  await C.ev(`(() => { const R = window.__game.renderer.renderer, cam = window.__game.camera, render = R.render.bind(R), H = window.__game.world.groundHeightAt;
    const cx = ${g.x} + ${v[0]} * 34 - ${f.u[0]} * 14, cz = ${g.z} + ${v[1]} * 34 - ${f.u[1]} * 14;
    R.render = (s, c) => { cam.position.set(cx, H(cx, cz) + 3.5, cz); cam.lookAt(${g.x} + ${f.u[0]} * 8, H(${g.x}, ${g.z}) + 3, ${g.z} + ${f.u[1]} * 8); cam.fov = 55; cam.updateProjectionMatrix(); render(s, cam); };
    for (const e of document.body.children) if (!e.querySelector('canvas') && e.tagName !== 'CANVAS') e.style.visibility = 'hidden';
    return true; })()`);
  await C.sleep(800);
  await C.shot(SHOTS, 'closeup_0_grazing');
  const head = ((Math.atan2(-f.u[0], f.u[1]) * 180) / Math.PI + 360) % 360;
  await C.ev(`window.__game.teleport({ x: ${g.x + f.u[0] * 160}, z: ${g.z + f.u[1] * 160}, alt: 9, heading: ${head}, speedKt: 75, throttle: 0.6 })`);
  for (let i = 1; i <= 7; i++) { await C.sleep(700); await C.shot(SHOTS, `closeup_${i}`); }
  await C.sleep(9000);
  await C.shot(SHOTS, 'closeup_9_settled');
  console.log('closeup shots in', SHOTS, JSON.stringify(g));
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed${FALSIFY ? ` (falsify=${FALSIFY}: must be red)` : ''}`);
process.exit(bad.length ? 1 : 0);
