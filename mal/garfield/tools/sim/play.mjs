// Autoplayer: proves each level is completable. Teleports Garfield between beats, but every key action
// (scratch / jump / interact / the vine catch) is a real CDP key press through the game's input layer.
//   ~/.claude/bin/cdp start --port 9408 -- --use-angle=metal
//   node tools/sim/play.mjs [levels=1-10|catch] [--shots=DIR] [--port=9408] [--base=http://localhost:8888/mal/garfield/]
import { connect, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '1-10';
const port = +(args.port || 9409);
const base = args.base || 'http://localhost:8888/mal/garfield/';
const shots = args.shots || null;
if (shots) mkdirSync(shots, { recursive: true });

const HELPERS = `
window.S = (() => {
  const G = __game, ctx = () => G.ctx, L = () => G.ctx.L, ai = () => G.ctx.jonAI;
  const A = (n) => G.ctx.world.anchors.get(n);
  const V = (x, y, z) => new G.ctx.THREE.Vector3(x, y, z);
  const tp = (p, faceP) => {
    const rot = faceP ? Math.atan2(faceP.x - p.x, faceP.z - p.z) : undefined;
    G.ctx.controller.teleport(p, rot);
    if (rot !== undefined) G.ctx.garfield.root.rotation.y = rot;
  };
  const plate = () => L().foodPos();
  // a spot on the tabletop d m from the plate, on the side away from Jon
  const tableSpot = (d = 0.32, towardJon = false) => {
    const p = plate(), j = G.ctx.jon.root.position;
    const dir = V(p.x - j.x, 0, p.z - j.z).normalize();
    if (towardJon) dir.negate();
    return V(p.x + dir.x * d, p.y, p.z + dir.z * d);
  };
  const trace = [];
  ai().events = { emit: (n, v) => { trace.push(n + ':' + v + '@' + ai().t.toFixed(1)); if (trace.length > 40) trace.shift(); } };
  return { G, ctx, L, ai, A, V, tp, plate, tableSpot, trace,
    info: () => ({ st: G.state, ai: ai()?.state, task: ai()?.taskName, objs: ctx().objectives.map((o) => (o.done ? 'X' : '-') + o.text).join(' | '),
      g: G.ctx.controller.pos.toArray().map((v) => +v.toFixed(2)), jon: ai().pos().toArray().map((v) => +v.toFixed(2)),
      label: G.ctx.interact.current?.id || null, trace: trace.slice(-8).join(' '), canEat: L()?.canEat?.(), barks: L()?.barks.log.slice(-4).map((b) => b.key).join(',') }),
  };
})(); true`;

async function boot(c, n) {
  await c.nav(`${base}?level=${n}&skip=1&nointro=1`);
  await c.waitFor(`window.__game && __game.state==='play' && __game.ctx && __game.ctx.L && __game.ctx.L.started`, 45000);
  await c.eval(HELPERS);
  await sleep(600);
}
const info = (c) => c.eval('JSON.stringify(S.info())');
async function until(c, expr, timeout = 30000, label = expr) {
  try { return await c.waitFor(expr, timeout, 150); }
  catch { throw new Error(`timeout: ${label}\n   ${await info(c)}`); }
}
async function shot(c, name) { if (shots) await c.shot(`${shots}/${name}.png`); }
const won = (c) => until(c, `__game.state==='won' || (__game.ctx.L && __game.ctx.L.won)`, 15000, 'win');

const SOLVE = {
  async 1(c) {
    await c.eval(`S.L().t = 29.5`);                       // fast-forward the 30 s tutorial wander
    await until(c, `S.ai().state==='sitEat'`, 25000, 'Jon sits');
    await shot(c, 'l01_seated');
    await c.eval(`S.tp(S.tableSpot(0.3, true), S.ai().pos().clone().setY(0.9))`);
    await sleep(300);
    await c.key('KeyJ');
    await until(c, `S.L().flags.face`, 3000, 'face scratch');
    await sleep(1200); await shot(c, 'l01_coverface');
    await until(c, `S.ai().state==='fetchPaper'`, 8000, 'newspaper thrown + fetch');
    await shot(c, 'l01_fetch');
    await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 2(c) {
    await until(c, `S.ai().state==='sitEat'`, 5000);
    const legs = `(() => { const ch = S.ctx().world.props.get('chair'); const a = ch.legPos(S.V(0,0,0)), b = ch.legPosR(S.V(0,0,0)); return a.lerp(b, 0.5).setY(0); })()`;
    await c.eval(`(() => { const m = ${legs}; const j = S.ai().pos(); const d = S.V(m.x - j.x, 0, m.z - j.z).normalize(); S.tp(m.clone().addScaledVector(d, 0.3), m); })()`);
    await sleep(250); await shot(c, 'l02_behind');
    await c.key('KeyJ');
    await until(c, `S.L().flags.down`, 4000, 'chair breaks');
    await sleep(1500); await shot(c, 'l02_fallen');
    await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 3(c) {
    await c.eval(`(() => { const v = S.L().flags.vasePos(); const s = S.A('windowsill').pos; S.tp(S.V(v.x + 0.38, s.y, s.z + 0.02), v); })()`);
    await sleep(400);
    await until(c, `S.ctx().objectives[0].done`, 2000, 'on sill');
    await c.key('KeyJ');
    await until(c, `S.L().flags.vaseBroken`, 3000, 'vase knocked');
    await sleep(900); await shot(c, 'l03_vase');
    await until(c, `S.ai().state==='investigate'`, 6000);
    await sleep(1500); await shot(c, 'l03_jon_looks');
    await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 4(c) {
    await c.eval(`(() => { const p = S.A('curtains').pos.clone().setY(0); const r = S.A('curtains').rotY || 0; const f = S.V(Math.sin(r), 0, Math.cos(r)); let at = p.clone().addScaledVector(f, 0.45); if (at.distanceTo(S.A('livingCentre').pos) > p.distanceTo(S.A('livingCentre').pos)) at = p.clone().addScaledVector(f, -0.45); S.tp(at, p); })()`);
    await sleep(300);
    for (let i = 0; i < 4; i++) { await c.key('KeyJ'); await sleep(650); }
    await until(c, `S.L().flags.busy`, 2000, 'curtains shredded 4x');
    await shot(c, 'l04_shred');
    await until(c, `S.ai().state==='investigate'`, 6000);
    await sleep(1200); await shot(c, 'l04_jon_looks');
    await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 5(c) {
    // the climb route must exist (bench → counter → microwave → fridge)
    const route = await c.eval(`JSON.stringify((S.L().flags.route||[]).map(r => r.id + '@' + r.max.y.toFixed(2)))`);
    console.log('   route:', route);
    await c.eval(`(() => { const ft = S.A('fridgeTop').pos; S.tp(S.V(ft.x - 0.1, ft.y + 0.02, ft.z - 0.05)); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='vine'`, 3000, 'vine highlighted');
    await shot(c, 'l05_fridgetop');
    await c.key('KeyE');
    await until(c, `S.L().flags.swinging`, 2000, 'swinging');
    await sleep(500); await shot(c, 'l05_swing');
    // press Space when the prompt says SPACE!
    await until(c, `S.ctx().ui.hud.state.interactLabel==='SPACE!'`, 8000, 'over the pan');
    await c.key('Space');
    await shot(c, 'l05_catch');
    await until(c, `S.L().flags.caught`, 1500, 'pan caught');
    await until(c, `S.L().flags.havePan && !S.L().flags.swinging`, 8000, 'back on fridge with pan');
    await sleep(500); await shot(c, 'l05_pan_on_fridge');
    await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='food'`, 3000, 'food highlighted');
    await c.key('KeyE');
  },
  async 6(c) {
    await c.eval(`S.tp(S.tableSpot(0.33), S.plate())`);
    await sleep(300);
    await c.key('KeyJ');
    await until(c, `S.L().flags.onFloor`, 3000, 'plate flung');
    await sleep(500); await shot(c, 'l06_flung');
    await c.eval(`(() => { const p = S.plate(); const j = S.ai().pos(); const d = S.V(p.x - j.x, 0, p.z - j.z).normalize(); S.tp(S.V(p.x + d.x*0.35, 0, p.z + d.z*0.35), p); })()`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 7(c) {
    await c.eval(`(() => { const s = S.A('windowsill').pos; S.tp(S.V(s.x + 0.4, s.y, s.z + 0.02), S.V(s.x, s.y, s.z)); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='window'`, 3000, 'window highlighted');
    await c.key('KeyE');
    await until(c, `S.L().flags.open`, 2000);
    await sleep(800); await shot(c, 'l07_open');
    await until(c, `S.ai().state==='cold' && S.ai().distTo(S.ctx().world.anchors.get('jonChair').pos) > 1.5`, 12000, 'Jon walking to window');
    await shot(c, 'l07_jon_cold');
    await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 8(c) {
    await c.eval(`(() => { const b = S.ctx().world.props.get('jonBed'); const p = b.root.getWorldPosition(S.V(0,0,0)); const ins = S.A('bedroomInside').pos; const d = S.V(ins.x - p.x, 0, ins.z - p.z).normalize(); const half = b.size ? Math.max(b.size.w, b.size.d)/2 : 1; S.tp(S.V(p.x + d.x*(half*0.6), 3.0, p.z + d.z*(half*0.6)), p); })()`);
    await sleep(300);
    for (let i = 0; i < 3; i++) { await c.key('KeyJ'); await sleep(650); }
    console.log('   ', await info(c));
    await until(c, `S.L().flags.called`, 2000, 'bed scratched 3x');
    await shot(c, 'l08_bed');
    await c.eval(`S.tp(S.A('landing').pos.clone(), S.A('bedroomDoor').pos)`);
    await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='bedroomDoor'`, 40000, 'Jon inside → door closable');
    await shot(c, 'l08_door');
    await c.key('KeyE');
    await until(c, `S.ai().state==='trapped'`, 3000, 'trapped');
    await sleep(800); await shot(c, 'l08_trapped');
    await c.eval(`S.tp(S.tableSpot(0.25, true), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 9(c) {
    await c.eval(`S.tp(S.A('underTable').pos.clone())`);
    await sleep(300);
    for (let i = 0; i < 3; i++) { await c.key('Space', { hold: 120 }); await sleep(900); }
    await until(c, `S.L().flags.n >= 3`, 2000, '3 table bumps');
    await shot(c, 'l09_bumps');
    const cc = `(() => { const ch = S.ctx().world.props.get('chair'); const p = ch.root.getWorldPosition(S.V(0,0,0)); p.y = 0; return p; })()`;
    // walk under the chair with real input: start just in front of it (under the table edge) and hold S/W toward it
    await c.eval(`(() => { const p = ${cc}; S.tp(S.V(p.x, 0, p.z + 0.7), p); })()`);
    await sleep(200);
    await c.eval(`(() => { const cam = S.ctx().camera; cam.yaw = S.ctx().garfield.root.rotation.y + Math.PI; })()`);
    await c.keyDown('KeyW'); await sleep(450); await c.keyUp('KeyW');
    await until(c, `S.ai().state==='bounced' || S.ai().state==='stunned'`, 3000, 'chair bounce');
    await until(c, `S.ai().state==='stunned'`, 3000, 'stunned');
    await sleep(500); await shot(c, 'l09_stunned');
    await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
    await sleep(250);
    await c.key('KeyE');
  },
  async 10(c) {
    await until(c, `S.ai().state==='sulk'`, 15000, 'Jon sulking');
    await c.eval(`(() => { const v = S.L().flags.vasePos(); const s = S.A('windowsill').pos; S.tp(S.V(v.x + 0.38, s.y, s.z + 0.02), v); })()`);
    await sleep(300);
    await c.key('KeyJ');
    await until(c, `S.L().flags.vaseBroken`, 3000, 'vase');
    await until(c, `S.ai().state==='investigate' && S.ai().taskName==='investigate' && S.ai().distTo(S.L().flags.frag) < 1.3`, 25000, 'Jon at shards');
    await sleep(800); await shot(c, 'l10_jon_shards');
    await c.eval(`(() => { const j = S.ai().pos(); const f = S.V(Math.sin(S.ctx().jon.root.rotation.y), 0, Math.cos(S.ctx().jon.root.rotation.y)); S.tp(j.clone().addScaledVector(f, 0.55).setY(0), j); })()`);
    await sleep(200);
    await c.key('KeyJ');
    await until(c, `S.ai().state==='faceplant'`, 8000, 'faceplant');
    await sleep(1800); await shot(c, 'l10_faceplant');
    await c.eval(`(() => { const ff = S.A('fridgeFront').pos; S.tp(ff.clone(), S.ctx().world.props.get('fridge').root.getWorldPosition(S.V(0,0,0))); })()`);
    await sleep(300);
    await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='fridge'`, 3000, 'fridge highlighted');
    await c.key('KeyE');
    await until(c, `S.L().flags.fridgeOpen`, 2000);
    await sleep(1000); await shot(c, 'l10_fridge');
    await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='food'`, 3000, 'pan highlighted');
    await c.key('KeyE');
  },
};

// Reactions + catch: leg → hop → chase → caught → catch cutscene → back. Butt → chase → escape onto the sofa.
async function catchTest(c) {
  await boot(c, 2);
  await c.eval(`S.ai().standSpot && 0`);
  await c.eval(`S.L().spec.canEat = () => false`);
  // stand Jon up somewhere open and scratch his shin from the front
  await c.eval(`(() => { const p = S.A('kitchenCentre').pos.clone(); S.ai().setHome({type:'stay'}); S.ai().setOff(); S.ai().leave(); S.ctx().jon.root.position.copy(p); S.ctx().jon.root.rotation.y = 0; S.ai().state='idle'; S.tp(p.clone().add(S.V(0,0,0.6)), p); })()`);
  await sleep(300);
  await c.key('KeyJ');
  await until(c, `S.ai().lastZone`, 2000, 'Jon reacts');
  console.log('   zone:', await c.eval('S.ai().lastZone'));
  await sleep(600);
  await c.eval(`(() => { const p = S.ai().pos(); S.tp(S.A('livingCentre').pos.clone(), p); })()`);
  await shot(c, 'catch_hop');
  await until(c, `S.trace.some((x) => x.startsWith('state:chase'))`, 6000, 'chase starts');
  await shot(c, 'catch_chase');
  await until(c, `S.ai().catches > 0`, 12000, 'Jon catches a standing-still Garfield');
  await sleep(1500); await shot(c, 'catch_whack');
  await until(c, `S.ai().state!=='catch' && !S.ctx().director.active`, 15000, 'catch cutscene ends');
  console.log('   after catch:', await info(c));
  // butt: behind him
  await c.eval(`(() => { const p = S.A('livingCentre').pos.clone(); S.ai().setOff(); S.ai().leave(); S.ctx().jon.root.position.copy(p); S.ctx().jon.root.rotation.y = 0; S.ai().state='idle'; S.tp(p.clone().add(S.V(0,0,-0.55)), p); })()`);
  await sleep(300);
  await c.key('KeyJ');
  // escape onto the sofa
  await c.eval(`(() => { const s = S.A('sofa').pos; S.tp(S.V(s.x, s.y + 0.1, s.z)); })()`);
  await until(c, `S.trace.slice(-3).some((x) => x.startsWith('state:chase') || x.startsWith('state:glare'))`, 6000, 'butt → chase');
  console.log('   zone:', await c.eval('S.ai().lastZone'));
  await until(c, `S.ai().state==='glare'`, 6000, 'Jon glares below');
  await sleep(1200); await shot(c, 'catch_glare');
  await until(c, `S.ai().state!=='glare' && S.ai().state!=='chase'`, 8000, 'Jon gives up');
  // face: newspaper must hit a stationary Garfield
  await c.eval(`(() => { const p = S.A('kitchenCentre').pos.clone(); S.ai().setOff(); S.ai().leave(); S.ctx().jon.root.position.copy(p); S.ctx().jon.root.rotation.y = 0; S.ai().state='idle'; S.ai().zoneOverride = () => 'face'; S.tp(p.clone().add(S.V(0,0,0.6)), p); window.__kb = 0; S.ctx().events.on('knockback', () => window.__kb++); })()`);
  await sleep(300);
  await c.key('KeyJ');
  await c.eval(`(() => { const p = S.A('kitchenCentre').pos; S.tp(p.clone().add(S.V(0,0,1.6)), p); })()`);
  await until(c, `window.__kb > 0`, 6000, 'newspaper knockback');
  await sleep(150); await shot(c, 'catch_paper_hit');
  console.log('   newspaper hit + knockback OK');
}

// Own the browser for exactly the length of the run (the Mac is memory-tight: never leave one idling).
const CDP = homedir() + '/.claude/bin/cdp';
if (!args.keep) { try { execFileSync(CDP, ['start', '--port', String(port), '--idle', '120', '--', '--use-angle=metal'], { stdio: 'ignore' }); } catch {} }
const stopBrowser = () => { if (!args.keep) { try { execFileSync(CDP, ['stop', String(port)], { stdio: 'ignore' }); } catch {} } };
process.on('exit', stopBrowser);
process.on('SIGINT', () => process.exit(130));
const c = await connect(port);
const list = which === 'catch' ? [] : which.includes('-') ? (() => { const [a, b] = which.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : which.split(',').map(Number);
let fails = 0;
for (const n of list) {
  const t0 = Date.now();
  try {
    await boot(c, n);
    await SOLVE[n](c);
    await won(c);
    await sleep(1200); await shot(c, `l${String(n).padStart(2, '0')}_win`);
    console.log(`L${n}: PASS (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    fails++;
    console.log(`L${n}: FAIL ${e.message}`);
    await shot(c, `l${String(n).padStart(2, '0')}_FAIL`).catch(() => {});
  }
  const errs = c.logs.filter((l) => /exception|\[error\]/.test(l));
  if (errs.length) console.log('   errors:\n   ' + [...new Set(errs)].slice(0, 8).join('\n   '));
  c.logs.length = 0;
}
if (which === 'catch' || args.catch) {
  try { await catchTest(c); console.log('CATCH/REACTIONS: PASS'); } catch (e) { fails++; console.log('CATCH/REACTIONS: FAIL ' + e.message); }
  const errs = c.logs.filter((l) => /exception|\[error\]/.test(l));
  if (errs.length) console.log('   errors:\n   ' + [...new Set(errs)].slice(0, 8).join('\n   '));
}
c.close();
process.exit(fails ? 1 : 0);
