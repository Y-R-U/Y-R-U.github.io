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
  n = String(n).replace(/lose$/, '');
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

// arena: real scratches on Odie (the score is pre-set close to 20 to keep the run short)
async function arenaScratches(c, n) {
  for (let i = 0; i < 40; i++) {
    const g = await c.eval('S.L().ar.g');
    if (g >= n || await c.eval('S.L().ar.over')) return;
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); const g = S.ctx().controller.pos; const d = S.V(g.x - o.x, 0, g.z - o.z); if (d.length() < 0.2) d.set(-1, 0, 0); d.normalize(); S.tp(o.clone().addScaledVector(d, 0.45).setY(o.y), o); })()`);
    await sleep(120);
    await c.key('KeyJ');
    await sleep(1000);
  }
  throw new Error('arena: could not score ' + n);
}
async function arenaLose(c) {
  await c.eval(`S.L().ar.o = 19; S.L().ar.cool = 0`);
  // stand still next to Odie: his very-easy lunge must connect eventually
  for (let i = 0; i < 60 && !(await c.eval('S.L().ar.over')); i++) {
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); S.tp(o.clone().add(S.V(-1.0, 0, 0)).setY(o.y), o); })()`);
    await sleep(1000);
  }
  if (await c.eval(`S.L().ar.result`) !== 'lose') throw new Error('arena: Odie never scored the last point');
}
const SOLVE = {
  async 'c2:10'(c) {
    await c.eval(`(() => { const d = S.A('sockDrawer').pos; const r = S.A('sockDrawer').rotY ?? Math.PI; S.tp(S.V(d.x + Math.sin(r) * 0.5, 3.0, d.z + Math.cos(r) * 0.5), d); })()`);
    await sleep(500);
    for (const lab of ['Open', 'Jump', 'Play']) {
      await until(c, `S.ctx().interact.current?.id==='sockDrawer' && !S.L().flags.busy`, 4000, 'drawer: ' + lab);
      await c.key('KeyE');
      await sleep(900);
    }
    await until(c, `S.ctx().objectives[1].done`, 5000, 'played in the socks');
    await shot(c, 'c2_10_socks');
    await until(c, `S.L().flags.odieHere`, 25000, 'Odie walks in');
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); S.tp(o.clone().add(S.V(0.55, 0, 0)).setY(3.0), o); })()`);
    for (let i = 0; i < 3; i++) {
      await until(c, `S.ctx().interact.current?.id==='sock' && !S.L().flags.busy`, 4000, 'sock ' + i);
      await c.key('KeyE');
      await sleep(900);
    }
    await until(c, `S.ctx().objectives[2].done`, 3000, 'Odie socked');
    await shot(c, 'c2_10_socked');
    await until(c, `S.ctx().objectives[3].done`, 60000, 'chase over');
    await c.eval(`(() => { const w = S.A('whistleSpot').pos; S.tp(w.clone().add(S.V(0.35, 0, 0)), w); })()`);
    await sleep(500);
    await until(c, `S.ctx().interact.current?.id==='whistle'`, 3000, 'whistle highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[4].done`, 3000, 'whistle taken');
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='whistle'`, 3000, 'blow highlighted');
    await c.key('KeyE');
    await sleep(6000); await shot(c, 'c2_10_shaking');
  },
  async 'c2:9'(c) {
    await c.eval(`(() => { const t = S.A('tableTop').pos; S.tp(S.V(t.x + 0.3, t.y + 0.02, t.z)); })()`);
    await sleep(500);
    await until(c, `S.ctx().interact.current?.id==='sit'`, 3000, 'sit highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[0].done`, 2000, 'sitting');
    await until(c, `S.ai().state==='byTable'`, 25000, 'Jon walks by');
    await sleep(600); await shot(c, 'c2_09_morning');
    await until(c, `S.ctx().interact.current?.id==='poke'`, 3000, 'poke highlighted');
    await c.key('KeyE');
    await until(c, `S.L().flags.holdReady`, 30000, 'hold ready');
    await shot(c, 'c2_09_hold0');
    await c.keyDown('KeyE'); await sleep(900); await shot(c, 'c2_09_holding'); await sleep(2600); await c.keyUp('KeyE');
    await until(c, `S.ctx().objectives[2].done`, 3000, 'glared');
    await sleep(9000); await shot(c, 'c2_09_hug');
  },
  async 'c2:8'(c) {
    const spots = [['shedBed', 'bed'], ['shedSofa', 'sofa'], ['shedArmchair', 'armchair'], ['shedTable', 'table']];
    for (let i = 0; i < 4; i++) {
      const [a, id] = spots[i];
      await c.eval(`(() => { const p = S.A('${a}').pos; S.tp(S.V(p.x + 0.15, p.y + 0.05, p.z + 0.1), p); })()`);
      await sleep(600);
      await until(c, `S.ctx().interact.current?.id==='shed_${id}'`, 3000, 'shed spot ${id}');
      await c.key('KeyE');
      if (i < 3) await until(c, `S.ctx().objectives[${i}].done`, 4000, 'shed ${id}');
      if (i === 1) await shot(c, 'c2_08_sofa');
    }
    await sleep(3500); await shot(c, 'c2_08_bald');
  },
  async arena(c) {
    await c.eval(`S.L().ar.g = 18`);
    await arenaScratches(c, 20);
    await until(c, `!!document.querySelector('.ui-popup, .popup, [class*=popup]')`, 6000, 'result popup');
    await sleep(500); await shot(c, 'arena_result');
    const txt = await c.eval(`document.querySelector('.ui-popup, .popup, [class*=popup]').textContent`);
    console.log('   popup:', txt.replace(/\s+/g, ' ').slice(0, 80));
  },
  async 'c2:7'(c) {
    await shot(c, 'c2_07_start');
    await c.eval(`S.L().ar.g = 17`);
    await arenaScratches(c, 20);
    await shot(c, 'c2_07_win');
  },
  async 'c2:7lose'(c) {
    await arenaLose(c);
    await shot(c, 'c2_07_lose');
  },
  async 'c2:6'(c) {
    await c.eval(`S.tp(S.A('bedroomInside').pos.clone())`);
    await until(c, `S.ctx().objectives[0].done`, 3000, "in Jon's room");
    await c.eval(`(() => { const d = S.A('breakDrawer').pos; const r = S.A('breakDrawer').rotY || 0; S.tp(S.V(d.x + Math.sin(r) * 0.45, 3.0, d.z + Math.cos(r) * 0.45), d); })()`);
    await sleep(400);
    for (let i = 0; i < 3; i++) { await c.key('KeyJ'); await sleep(600); }
    await until(c, `S.ctx().objectives[1].done`, 3000, 'drawer broken');
    await shot(c, 'c2_06_drawer');
    await until(c, `S.ctx().interact.current?.id==='launcher'`, 3000, 'launcher highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[2].done`, 3000, 'launcher taken');
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); S.tp(o.clone().add(S.V(2.2, 0, 0.6)), o); })()`);
    await sleep(500);
    await until(c, `S.ctx().interact.current?.id==='fire'`, 3000, 'fire highlighted');
    await c.key('KeyE');
    await sleep(5000); await shot(c, 'c2_06_brawl');
  },
  async 'c2:5'(c) {
    await c.eval(`(() => { const h = S.A('mouseHole0').pos; S.tp(h.clone().add(S.V(0.5, 0, 0)), h); })()`);
    await until(c, `S.ctx().objectives[0].done`, 3000, 'mouse hole found');
    await c.eval(`(() => { const f = S.A('fridgeFront').pos; S.tp(f.clone(), S.ctx().world.props.get('fridge').root.getWorldPosition(S.V(0,0,0))); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='fridge'`, 3000, 'fridge highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[1].done`, 4000, 'cheese');
    for (let i = 0; i < 3; i++) {
      await c.eval(`(() => { const p = S.A('cheese${i}').pos; S.tp(p.clone().add(S.V(0.3, 0, 0.1)), p); })()`);
      await sleep(400);
      await until(c, `S.ctx().interact.current?.id==='cheese_${i}'`, 3000, 'cheese spot ${i}');
      await c.key('KeyE');
      await sleep(300);
    }
    await until(c, `S.L().flags.chaos`, 3000, 'mice chaos');
    await sleep(2500); await shot(c, 'c2_05_mice');
    await until(c, `!S.ctx().director.active`, 15000, 'mice cutscene over');
    await c.eval(`(() => { const e = S.A('carpetEdge').pos; S.tp(e.clone().add(S.V(0.2, 0, 0.2)), e); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='carpet'`, 3000, 'carpet highlighted');
    await c.key('KeyE');
    await sleep(2500); await shot(c, 'c2_05_flat');
  },
  async 'c2:4'(c) {
    await c.eval(`(() => { const s = S.A('windowsill').pos; S.tp(S.V(s.x + 0.4, s.y, s.z + 0.02), S.V(s.x, s.y, s.z)); })()`);
    await sleep(500);
    await until(c, `S.ctx().interact.current?.id==='window'`, 3000, 'window highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[1].done`, 3000, 'window open');
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); const w = S.A('window').pos; const d = S.V(o.x - w.x, 0, o.z - w.z).normalize(); S.tp(o.clone().addScaledVector(d, 0.55).setY(0), o); })()`);
    await sleep(400);
    await c.key('KeyJ');
    await until(c, `S.L().flags.flying`, 2000, 'Odie launched at the wall');
    await sleep(1600); await shot(c, 'c2_04_splat');
    await until(c, `S.L().flags.onTableOdie && !S.L().flags.flying`, 20000, 'Odie on the table');
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); const w = S.A('window').pos; const d = S.V(o.x - w.x, 0, o.z - w.z).normalize(); S.tp(o.clone().addScaledVector(d, 0.5), o); })()`);
    await sleep(600);
    await c.key('KeyJ');
    await until(c, `S.ctx().objectives[3].done`, 3000, 'out of the window');
    await sleep(900); await shot(c, 'c2_04_fly');
  },
  async 'c2:3'(c) {
    await c.eval(`(() => { const s = S.ctx().world.props.get('soupBowl').root.getWorldPosition(S.V(0,0,0)); const j = S.ai().pos(); const d = S.V(s.x - j.x, 0, s.z - j.z).normalize(); S.tp(S.V(s.x + d.x * 0.3, S.A('tableTop').pos.y + 0.02, s.z + d.z * 0.3), s); })()`);
    await sleep(500);
    await until(c, `S.ctx().interact.current?.id==='soup'`, 3000, 'soup highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[0].done`, 3000, 'soup splashed');
    await sleep(1200); await shot(c, 'c2_03_splash');
    await until(c, `S.L().flags.dancing`, 30000, 'Lyman dancing');
    await shot(c, 'c2_03_disco');
    await c.eval(`(() => { const p = S.ctx().lyman.root.position; S.tp(S.V(p.x + 0.35, 0, p.z), p); })()`);
    await until(c, `S.L().flags.fur > 0.5`, 6000, 'shedding');
    await shot(c, 'c2_03_shed');
  },
  async 'c2:2'(c) {
    await until(c, `S.ctx().odieAI.state==='sit'`, 5000, 'Odie on the table edge');
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); const t = S.A('tableTop').pos; const d = S.V(t.x - o.x, 0, t.z - o.z).normalize(); S.tp(S.V(o.x + d.x * 0.5, o.y + 0.02, o.z + d.z * 0.5), o); })()`);
    await sleep(400);
    await c.key('KeyJ');
    await until(c, `S.ctx().objectives[0].done`, 3000, 'Odie off the table');
    await sleep(1200); await shot(c, 'c2_02_offtable');
    await until(c, `S.ctx().humans.lyman.state==='chase' || S.ctx().humans.lyman.state==='glare'`, 5000, 'Lyman chases too');
    await shot(c, 'c2_02_chase');
    await until(c, `S.ctx().objectives[1].done`, 30000, 'chase over');
    await until(c, `S.ctx().odie.root.position.distanceTo(S.A('odieSill').pos) < 0.5`, 15000, 'Odie under the sill');
    await c.eval(`(() => { const v = S.ctx().world.props.get('vase').root.getWorldPosition(S.V(0,0,0)); const s = S.A('windowsill').pos; S.tp(S.V(v.x + 0.38, s.y, s.z + 0.02), v); })()`);
    await sleep(500);
    await c.key('KeyJ');
    await until(c, `S.ctx().objectives[2].done`, 4000, 'vase on Odie');
    await sleep(600); await shot(c, 'c2_02_vase');
    await until(c, `S.ctx().objectives[3].done`, 30000, 'second chase over');
    await c.eval(`(() => { const f = S.A('cupboardFront').pos; S.tp(f.clone().add(S.V(-0.3, 0, 0)), f.clone().add(S.V(1,0,0))); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='cupboardDoor'`, 3000, 'cupboard door highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[4].done`, 3000, 'cupboard open');
    await c.eval(`(() => { const b = S.A('biscuitBox').pos; S.tp(S.V(b.x - 0.45, 0, b.z), b); })()`);
    await sleep(500); await shot(c, 'c2_02_cupboard');
    await c.key('KeyJ');
    await until(c, `S.ctx().objectives[5].done`, 3000, 'biscuits burst');
    await c.eval(`(() => { const f = S.A('cupboardFront').pos; S.tp(f.clone().add(S.V(-0.6, 0, 0.5)), f); })()`);
    await until(c, `S.L().flags.odieIn`, 15000, 'Odie in the cupboard');
    await sleep(800); await shot(c, 'c2_02_odie_in');
    await c.eval(`(() => { const f = S.A('cupboardFront').pos; S.tp(f.clone().add(S.V(-0.3, 0, 0)), f.clone().add(S.V(1,0,0))); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='cupboardDoor'`, 3000, 'door highlighted');
    await c.key('KeyE');
  },
  async 'c2:1'(c) {
    await c.eval(`(() => { const b = S.A('catBowl').pos; S.tp(b.clone().add(S.V(-0.35, 0, -0.1)), b); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='catBowl'`, 3000, 'bowl highlighted');
    await c.key('KeyE');
    await until(c, `S.ctx().objectives[0].done`, 6000, 'biscuits eaten');
    // hop onto the table by the plates
    await c.eval(`(() => { const p = S.ctx().world.props.get('plate').pos.clone(); const t = S.V(p.x, p.y + 0.05, p.z); const j = S.ai().pos(); const d = S.V(p.x - j.x, 0, p.z - j.z).normalize(); S.tp(t.addScaledVector(d, 0.3).add(S.V(0,0.3,0)), p); })()`);
    await until(c, `S.L().flags.left`, 4000, 'Ew! they leave');
    await shot(c, 'c2_01_ew');
    await sleep(2500);
    for (const id of ['plate', 'plate2']) {
      await c.eval(`(() => { const p = S.ctx().world.props.get('${id}').pos.clone(); S.tp(S.V(p.x + 0.28, p.y + 0.02, p.z), p); })()`);
      await sleep(400);
      await until(c, `S.ctx().interact.current?.id==='eat_${id}'`, 3000, '${id} highlighted');
      await c.key('KeyE');
      await until(c, `S.L().flags.ate_${id}`, 6000, 'ate ${id}');
    }
    await shot(c, 'c2_01_plates');
    await c.eval(`(() => { const o = S.ctx().odie.root.position.clone(); const b = S.A('odieBowl').pos; const d = S.V(o.x - b.x, 0, o.z - b.z).normalize(); S.tp(o.clone().addScaledVector(d, 0.5).setY(0), o); })()`);
    await sleep(300);
    await c.key('KeyJ');
    await until(c, `S.L().flags.odieGone`, 3000, 'Odie scratched → flees');
    await sleep(1500); await shot(c, 'c2_01_flee');
    await c.eval(`(() => { const b = S.A('odieBowl').pos; S.tp(b.clone().add(S.V(0.35, 0, -0.1)), b); })()`);
    await sleep(400);
    await until(c, `S.ctx().interact.current?.id==='odieBowl'`, 3000, 'odie bowl highlighted');
    await c.key('KeyE');
  },
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

// Chapter One Free Play smoke test: knockouts recover, vine face scratch, fridge + door toggles, trap/free, eating.
async function fp1Test(c) {
  await boot(c, 'fp1');
  const sitDown = async () => {
    await c.eval(`S.ai().setOff(); S.L().flags.api.sitIdle()`);
    await until(c, `S.ai().state==='sitIdle' && S.ai().seated()`, 15000, 'Jon sits (not eating)');
    await sleep(800);
  };
  await sitDown();
  await shot(c, 'fp1_sit');
  // chair leg → fall → 10 s → back up
  const legs = `(() => { const ch = S.ctx().world.props.get('chair'); const a = ch.legPos(S.V(0,0,0)), b = ch.legPosR(S.V(0,0,0)); return a.lerp(b, 0.5).setY(0); })()`;
  await c.eval(`(() => { const m = ${legs}; const j = S.ai().pos(); const d = S.V(m.x - j.x, 0, m.z - j.z).normalize(); S.tp(m.clone().addScaledVector(d, 0.3), m); })()`);
  await sleep(250);
  await c.key('KeyJ');
  await until(c, `S.ai().state==='down'`, 4000, 'chair-leg fall');
  await sleep(2500); await shot(c, 'fp1_chairfall');
  const t0 = Date.now();
  await until(c, `S.ai().state!=='down'`, 20000, 'recovers from the chair fall');
  console.log(`   chair knockout lasted ${((Date.now() - t0) / 1000 + 2.5).toFixed(1)}s`);
  // vine swing over seated Jon → face → fall_back_chair
  await sitDown();
  await c.eval(`(() => { const ft = S.A('fridgeTop').pos; S.tp(S.V(ft.x - 0.1, ft.y + 0.02, ft.z - 0.05)); })()`);
  await sleep(400);
  await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='vine'`, 3000, 'vine highlighted');
  await c.key('KeyE');
  await until(c, `S.L().flags.swinging`, 2000, 'swinging');
  await until(c, `S.ctx().ui.hud.state.interactLabel==='SCRATCH!'`, 12000, 'over Jon');
  await shot(c, 'fp1_vine_over');
  await c.key('Space');
  await until(c, `S.ai().state==='down'`, 2000, 'vine face → chair fall');
  await sleep(1500); await shot(c, 'fp1_vine_fall');
  await until(c, `!S.L().flags.swinging`, 10000, 'swing ends');
  await until(c, `S.ai().state!=='down'`, 20000, 'recovers');
  // eat while he's away from the table
  await c.eval(`S.ai().setOff(); S.ai().wander()`);
  await sleep(1500);
  await c.eval(`S.tp(S.tableSpot(0.25), S.plate())`);
  await sleep(300);
  await c.key('KeyE');
  await until(c, `S.L().flags.eaten`, 6000, 'free-play eat');
  // fridge open + close
  await c.eval(`(() => { const ff = S.A('fridgeFront').pos; S.tp(ff.clone(), S.ctx().world.props.get('fridge').root.getWorldPosition(S.V(0,0,0))); })()`);
  await sleep(400);
  await until(c, `S.ctx().interact.current && S.ctx().interact.current.id==='fridge'`, 3000, 'fridge highlighted');
  await c.key('KeyE');
  await until(c, `S.ctx().world.props.get('fridge').state.open`, 3000, 'fridge opens');
  await sleep(1200); await shot(c, 'fp1_fridge');
  await c.key('KeyE');
  await until(c, `!S.ctx().world.props.get('fridge').state.open`, 3000, 'fridge closes');
  // bed x3 → Jon goes up → shut him in → Garfield opens the door → free
  await c.eval(`(() => { const b = S.ctx().world.props.get('jonBed'); const p = b.root.getWorldPosition(S.V(0,0,0)); const ins = S.A('bedroomInside').pos; const d = S.V(ins.x - p.x, 0, ins.z - p.z).normalize(); const half = b.size ? Math.max(b.size.w, b.size.d)/2 : 1; S.tp(S.V(p.x + d.x*(half*0.6), 3.0, p.z + d.z*(half*0.6)), p); })()`);
  await sleep(300);
  for (let i = 0; i < 3; i++) { await c.key('KeyJ'); await sleep(650); }
  await until(c, `S.ai().state==='investigate'`, 4000, 'Jon comes to the bed');
  await c.eval(`S.tp(S.A('landing').pos.clone(), S.A('bedroomDoor').pos)`);
  await until(c, `(() => { const j = S.ai().pos(); const b = S.ctx().world.props.get('jonBed').root.getWorldPosition(S.V(0,0,0)); return j.y > 2.5 && Math.hypot(j.x - b.x, j.z - b.z) < 2.2 && S.ctx().interact.current && S.ctx().interact.current.id==='bedroomDoor'; })()`, 40000, 'Jon at the bed');
  await sleep(1500);
  console.log('   door before close:', await c.eval(`JSON.stringify([S.ctx().world.props.get('bedroomDoor').state, S.ctx().interact.current?.id, S.ai().state])`));
  await c.key('KeyE');
  await sleep(1500);
  console.log('   door after close:', await c.eval(`JSON.stringify([S.ctx().world.props.get('bedroomDoor').state, S.ctx().interact.current?.id, S.ai().state, S.L().flags.doorBusy, __game.paused, __game.sys.input.enabled])`));
  await until(c, `S.ai().state==='trapped'`, 4000, 'trapped');
  await sleep(1500); await shot(c, 'fp1_trapped');
  await c.key('KeyE');
  await until(c, `S.ai().state!=='trapped'`, 4000, 'opening the door frees him');
  // vase → shards → slip → faceplant → recover
  await c.eval(`S.ai().setOff(); S.ai().wander()`);
  await c.eval(`(() => { const v = S.L().flags.vasePos(); const s = S.A('windowsill').pos; S.tp(S.V(v.x + 0.38, s.y, s.z + 0.02), v); })()`);
  await sleep(300);
  await c.key('KeyJ');
  await until(c, `S.L().flags.vaseBroken`, 3000, 'vase');
  await until(c, `S.ai().state==='investigate' && S.ai().distTo(S.L().flags.frag) < 1.3`, 25000, 'Jon at shards');
  await sleep(600);
  await c.eval(`(() => { const j = S.ai().pos(); const f = S.V(Math.sin(S.ctx().jon.root.rotation.y), 0, Math.cos(S.ctx().jon.root.rotation.y)); S.tp(j.clone().addScaledVector(f, 0.55).setY(0), j); })()`);
  await sleep(200);
  await c.key('KeyJ');
  await until(c, `S.ai().state==='hopToShards'`, 4000, 'slip');
  await sleep(4000); await shot(c, 'fp1_faceplant');
  await until(c, `S.ai().state!=='hopToShards'`, 20000, 'recovers from the faceplant');
  console.log('   ', await info(c));
}

// Unlock ladder (D14): an old save with Ch1 done → Ch2 + Coming Soon anim on the menu, Free Play on the Ch1 screen.
async function menusTest(c) {
  const B = `${base}?nogate=1&nointro=1&ch2=1`;
  await c.nav(B);
  await c.waitFor(`window.__game && __game.state==='menu'`, 45000);
  await c.eval(`localStorage.setItem('garfield_hh_v1', JSON.stringify({introSeen:true, chapterUnlockSeen:true, levelsUnlocked:10, levelsDone:[1,2,3,4,5,6,7,8,9,10], levelUnlockSeen:10, belly:0.5}))`);
  // gated (no ?ch2=1): Chapter Two stays 'Coming Soon' and the unlock flag is NOT consumed (only while CH2_READY=false)
  const ready = await c.eval(`import('./js/core/game.js').then((m) => m.CH2_READY)`);
  console.log('   CH2_READY:', ready);
  if (!ready) {
  await c.nav(B.replace('&ch2=1', ''));
  await c.waitFor(`window.__game && __game.state==='menu'`, 45000);
  await sleep(1500);
  const gated = await c.eval(`[...document.querySelectorAll('.chap-row .chap-btn')].map(b => b.textContent.trim()).join(' | ') + ' / seen=' + !!__game.save.data.ch2MenuSeen`);
  console.log('   gated menu:', gated);
  if (!/^Chapter One: Food \| Coming Soon \/ seen=false$/.test(gated)) throw new Error('gate broken: ' + gated);
  }
  await c.nav(B);
  await c.waitFor(`window.__game && __game.state==='menu'`, 45000);
  await sleep(1300); await shot(c, 'menu_ch2_unlocking');
  await c.waitFor(`__game.save.data.ch2MenuSeen`, 15000);
  await sleep(600); await shot(c, 'menu_ch2_unlocked');
  const btns = await c.eval(`[...document.querySelectorAll('.chap-row .chap-btn')].map(b => b.textContent.trim() + (b.classList.contains('is-locked') ? ' [locked]' : '')).join(' | ')`);
  console.log('   menu:', btns);
  if (!/Chapter Two: Odie and Lyman/.test(btns) || !/Coming Soon \[locked\]/.test(btns)) throw new Error('menu buttons wrong: ' + btns);
  await c.eval(`__game.chapter()`);
  await sleep(1200); await shot(c, 'ch1_free_unlocking');
  await sleep(2000); await shot(c, 'ch1_free_unlocked');
  const side = await c.eval(`document.querySelector('.scr-chapter .soon-btn').textContent.trim() + (document.querySelector('.scr-chapter .soon-btn').classList.contains('is-locked') ? ' [locked]' : '')`);
  console.log('   ch1 side:', side);
  if (!/Free\s*Play/.test(side) || /locked/.test(side)) throw new Error('Free Play not unlocked: ' + side);
  await c.eval(`__game.menu()`);
  await sleep(800);
  const again = await c.eval(`[...document.querySelectorAll('.chap-row .chap-btn')].map(b => b.textContent.trim()).join(' | ')`);
  console.log('   menu again (no anim):', again);
}

// Own the browser for exactly the length of the run (the Mac is memory-tight: never leave one idling).
const CDP = homedir() + '/.claude/bin/cdp';
if (!args.keep) { try { execFileSync(CDP, ['start', '--port', String(port), '--idle', '120', '--', '--use-angle=metal'], { stdio: 'ignore' }); } catch {} }
const stopBrowser = () => { if (!args.keep) { try { execFileSync(CDP, ['stop', String(port)], { stdio: 'ignore' }); } catch {} } };
process.on('exit', stopBrowser);
process.on('SIGINT', () => process.exit(130));
const c = await connect(port);
const list = which === 'arena' ? ['c2:7', 'c2:7lose', 'arena'] : ['catch', 'fp1', 'menus'].includes(which) ? [] : which.startsWith('c2:') ? (() => { const r = which.slice(3); if (!r.includes('-')) return r.split(',').map((n) => 'c2:' + n); const [a, b] = r.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => 'c2:' + (a + i)); })() : which.includes('-') ? (() => { const [a, b] = which.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })() : which.split(',').map(Number);
let fails = 0;
for (const n of list) {
  const t0 = Date.now();
  try {
    await boot(c, n);
    await SOLVE[n](c);
    if (n !== 'arena') await won(c);
    await sleep(1200); await shot(c, `${String(n).replace(':', '_')}_win`);
    console.log(`${String(n).startsWith('c2') ? n : 'L' + n}: PASS (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
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
if (which === 'menus') {
  try { await menusTest(c); console.log('MENUS: PASS'); } catch (e) { fails++; console.log('MENUS: FAIL ' + e.message); await shot(c, 'menus_FAIL').catch(() => {}); }
}
if (which === 'fp1') {
  try { await fp1Test(c); console.log('FP1: PASS'); } catch (e) { fails++; console.log('FP1: FAIL ' + e.message); await shot(c, 'fp1_FAIL').catch(() => {}); }
  const errs = c.logs.filter((l) => /exception|\[error\]/.test(l));
  if (errs.length) console.log('   errors:\n   ' + [...new Set(errs)].slice(0, 8).join('\n   '));
}
c.close();
process.exit(fails ? 1 : 0);
