// Chapter Two Free Play soak test: directed checks of every Ch2 trick, then a random-Garfield soak.
//   node tools/sim/fp2.mjs [--mins=6] [--shots=DIR] [--port=9408] [--only=a,b] [--nosoak] [--keep]
// Asserts: no exceptions, nobody stuck (frozen humans, Odie in walls, events that never end), events fire at a
// sensible rate, mutually-exclusive events never overlap, knockouts ~10 s, traps end (door or 60 s).
import { connect, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const port = +(args.port || 9408);
const base = args.base || 'http://localhost:8888/mal/garfield/';
const mins = +(args.mins || 6);
const shots = args.shots || null;
const only = args.only ? String(args.only).split(',') : null;
if (shots) mkdirSync(shots, { recursive: true });

const HELPERS = `
window.S = (() => {
  const G = __game, ctx = () => G.ctx, L = () => G.ctx.L, fp = () => G.ctx.L.fp, api = () => G.ctx.L.fp.api;
  const A = (n) => G.ctx.world.anchors.get(n);
  const V = (x, y, z) => new G.ctx.THREE.Vector3(x, y, z);
  const tp = (p, faceP) => {
    const rot = faceP ? Math.atan2(faceP.x - p.x, faceP.z - p.z) : undefined;
    G.ctx.controller.teleport(p, rot);
    if (rot !== undefined) G.ctx.garfield.root.rotation.y = rot;
  };
  const ground = (x, z, y) => G.ctx.world.groundAt(x, z, y + 0.3);
  // stand where the interactable's ring is, then the caller presses E
  const tpItem = (id) => {
    const it = G.ctx.interact.items.get(id); if (!it) return false;
    const p = it.getPos ? it.getPos(V(0, 0, 0)) : it.pos.clone();
    tp(V(p.x, ground(p.x, p.z, p.y), p.z)); return true;
  };
  // stand 0.33 m from a scratch target, facing it, feet 0.26 below the claw point
  const tpScratch = (id, from) => {
    const t = G.ctx.scratch.targets.get(id); if (!t) return false;
    const p = t.getPos ? t.getPos(V(0, 0, 0)) : t.pos.clone();
    const d = from ? V(from.x - p.x, 0, from.z - p.z) : V(0.3, 0, 0.3); d.normalize();
    const s = V(p.x + d.x * 0.33, 0, p.z + d.z * 0.33); s.y = ground(s.x, s.z, p.y);
    tp(s, p); return true;
  };
  const cur = () => G.ctx.interact.current?.id || null;
  // on the tabletop beside Odie (off the middle, so the table-warp gag doesn't fire)
  const besideOdieOnTable = () => { const o = odie(), tb = G.ctx.world.anchors.get('tableTop').pos; const x = o.x + (o.x <= tb.x ? 0.42 : -0.42); tp(V(x, tb.y + 0.01, o.z), o); };
  // frame the action for a screenshot (the follow cam resumes after)
  const look = (p, o = {}) => { G.ctx.camera.cut(G.ctx.L.shot(p.clone ? p.clone() : V(p.x, p.y, p.z), { dist: 3.0, h: 0.8, ...o })); };
  const follow = () => G.ctx.camera.follow({ dur: 0 });
  const odie = () => G.ctx.L.odie.root.position;
  // anything inside a solid collider (walls/furniture)?
  const inSolid = (p, r = 0.05) => (G.ctx.world.colliders || []).find((c) => c.enabled !== false && c.kind !== 'surface' && !/door|blocker/i.test(c.id || '')
    && p.x > c.min.x + r && p.x < c.max.x - r && p.z > c.min.z + r && p.z < c.max.z - r && p.y + 0.3 > c.min.y && p.y + 0.05 < c.max.y)?.id || null;
  const snap = () => {
    const l = L(), f = fp();
    const hs = l.humans.list.map((h) => ({ who: h.who, st: h.state, task: h.taskName, stT: +h.stateT.toFixed(1), p: h.pos().toArray().map((v) => +v.toFixed(2)), vis: h.actor.root.visible }));
    const op = odie();
    return { t: +l.t.toFixed(1), state: G.state, hs, odie: { st: l.odieAI.state, task: l.odieAI.taskName(), p: op.toArray().map((v) => +v.toFixed(2)), vis: l.odie.root.visible,
      onTable: !!l.flags.odieOnTable, down: !!l.flags.odieDown, out: !!l.flags.odieOut, trapped: !!l.flags.odieTrapped, solid: l.flags.odieOnTable ? null : inSolid(op) },
      active: [...f.active.entries()].map(([id, e]) => ({ id, age: +(l.t - e.t0).toFixed(1), max: +(e.until - e.t0).toFixed(1) })),
      claims: { ...f.claims }, locked: G.ctx.controller.locked, dir: !!G.ctx.director.active, g: G.ctx.controller.pos.toArray().map((v) => +v.toFixed(2)),
      wd: f.watchdog.length, logN: f.log.length };
  };
  return { G, ctx, L, fp, api, A, V, tp, tpItem, tpScratch, cur, odie, inSolid, snap, ground, besideOdieOnTable, look, follow };
})(); true`;

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const CDP = homedir() + '/.claude/bin/cdp';
if (!args.keep) { try { execFileSync(CDP, ['start', '--port', String(port), '--idle', String(mins * 60 + 1200), '--', '--use-angle=metal'], { stdio: 'ignore' }); } catch {} }
const stopBrowser = () => { if (!args.keep) { try { execFileSync(CDP, ['stop', String(port)], { stdio: 'ignore' }); } catch {} } };
process.on('exit', stopBrowser);
process.on('SIGINT', () => process.exit(130));

let c = await connect(port);
const E = (x) => c.eval(x);
const allLogs = [];
// if the browser dies mid-run (memory pressure, a stray `cdp stop`), start a fresh one and a fresh session
async function revive(why) {
  console.log(`   (browser lost: ${why} — restarting it)`);
  allLogs.push(...c.logs);
  try { execFileSync(CDP, ['start', '--port', String(port), '--idle', '1800', '--', '--use-angle=metal'], { stdio: 'ignore' }); } catch {}
  const fresh = await connect(port);
  Object.assign(c, fresh); c.dead = false;
  await c.nav(`${base}?level=fp2&skip=1&nointro=1&ch2=1`);
  await c.waitFor(`window.__game && __game.state==='play' && __game.ctx && __game.ctx.L && __game.ctx.L.started && __game.ctx.L.fp`, 60000);
  await E(HELPERS);
  await E(`S.api().director(false)`);
}
const until = async (expr, timeout = 20000, every = 200) => { try { await c.waitFor(expr, timeout, every); return true; } catch { return false; } };
const shot = async (name, lookExpr) => {
  if (!shots) return;
  if (lookExpr) { await E(`S.look(${lookExpr})`); await sleep(120); }
  await c.shot(`${shots}/fp2_${name}.png`);
  if (lookExpr) await E(`S.follow()`);
};
const logHas = (kind, id, since = 0) => E(`S.fp().log.some((e) => e.kind === ${JSON.stringify(kind)} ${id ? `&& e.id === ${JSON.stringify(id)}` : ''} && e.t >= ${since})`);
const now = () => E('S.L().t');
const settle = async () => {
  // let any chase / catch cutscene finish, then send the humans off to wander
  await until(`!S.L().humans.chasing() && !S.ctx().director.active && !S.L().humans.any((h) => h.state === 'catch')`, 25000);
};
const keyHold = async (code, ms) => { await c.keyDown(code); await sleep(ms); await c.keyUp(code); };
const pressE = async () => c.key('KeyE');
const pressJ = async () => c.key('KeyJ');
const want = (name) => !only || only.includes(name);

await c.nav(`${base}?level=fp2&skip=1&nointro=1&ch2=1`);
if (!(await until(`window.__game && __game.state==='play' && __game.ctx && __game.ctx.L && __game.ctx.L.started && __game.ctx.L.fp`, 60000))) { console.log('BOOT FAILED'); console.log(c.logs.slice(-20).join('\n')); process.exit(1); }
await E(HELPERS);
await sleep(1500);
ok('boot', true, await E(`JSON.stringify({lanes: __game.lanes && Object.fromEntries(Object.entries(__game.lanes).filter(([k,v]) => v !== 'real')), cast: S.ctx().world._cast2?.lanes})`));
await shot('00_start');

// ---------------------------------------------------------------- directed checks
const T = {};
// directed checks drive events themselves: the random director is paused until the soak
await E(`S.api().director(false)`);
T.exclusion = async () => {
  await E(`S.api().start('tvtime')`);
  const a = await E(`S.api().can('dinner')`), b = await E(`S.api().can('mice')`), d = await E(`S.api().can('disco')`);
  ok('exclusion: dinner/mice/disco blocked while tvtime', /^excl/.test(a) && /^excl/.test(b) && /^excl/.test(d), `${a} ${b} ${d}`);
  const n0 = await E(`S.fp().cancels`);
  await E(`S.api().end('tvtime')`);
  await E(`S.api().roll('disco', 'dinner')`);
  const n1 = await E(`S.fp().cancels`), act = await E(`[...S.fp().active.keys()].join(',')`);
  ok('exclusion: contradictory pair rolled together cancels both', n1 === n0 + 1 && !/disco|dinner/.test(act), `cancels ${n0}->${n1} active=[${act}]`);
  const sym = await E(`Object.entries(S.api().events).every(([a, e]) => [...e.excl].every((b) => S.api().excl(b, a)))`);
  ok('exclusion table symmetric', sym);
};
T.zoomies = async () => {
  await settle();
  await E(`S.api().start('zoomies')`);
  const up = await until(`S.L().flags.zoomSat && S.L().odieAI.taskName() === 'fpZoomies'`, 30000);
  ok('zoomies: Odie laps the table then sits on the edge', up, JSON.stringify((await E('JSON.stringify(S.snap().odie)'))));
  await shot('01_zoomies_edge');
  if (!up) return;
  const t0 = await now();
  await E(`S.besideOdieOnTable()`);
  await sleep(350);
  await pressJ();
  const down = await until(`S.L().flags.odieDown`, 3000);
  ok('scratch Odie off the table → land_head knockout', down, down ? '' : await E(`JSON.stringify({hit: S.ctx().scratch.lastHit && [S.ctx().scratch.lastHit.hit, S.ctx().scratch.lastHit.propId, S.ctx().scratch.lastHit.zone], g: S.ctx().controller.pos, odie: S.snap().odie, log: S.fp().log.slice(-4)})`));
  await sleep(1200); await shot('02_odie_landhead', `S.odie().clone().setY(0.4)`);
  const chase = await until(`S.fp().log.some((e) => e.kind === 'chase' && e.t >= ${t0})`, 4000);
  ok('…and Jon + Lyman chase ("Naughty Garfield!")', chase);
  const rec = await until(`!S.L().flags.odieDown`, 16000);
  const dur = (await now()) - t0;
  ok('Odie recovers after ~10 s', rec && dur > 9 && dur < 14, `${dur.toFixed(1)}s`);
  await settle();
};
T.trapDoor = async () => {
  await settle();
  await E(`S.api().act('jon', 'room')`);
  const inRoom = await until(`S.L().jon.state === 'fpRoom' && S.L().jon.pos().y > 2.9 && S.L().jon.pos().distanceTo(S.A('bedroomCentre').pos) < 1.2`, 40000);
  ok("Jon goes up to his room", inRoom, JSON.stringify((await E('JSON.stringify(S.snap().hs[0])'))));
  if (!inRoom) return;
  await E(`S.tp(S.A('landing').pos.clone(), S.A('bedroomDoor').pos)`);
  await until(`S.cur() === 'fp_bedroomDoor'`, 3000);
  await pressE();
  const trapped = await until(`S.L().jon.state === 'trapped'`, 4000);
  ok('close the bedroom door on Jon → trapped', trapped);
  await sleep(2500); await shot('03_jon_trapped', `S.A('bedroomDoor').pos.clone().setY(4)`);
  await until(`S.cur() === 'fp_bedroomDoor'`, 3000);
  await pressE();
  const freed = await until(`S.L().jon.state !== 'trapped'`, 4000);
  const ev = await E(`JSON.stringify(S.fp().log.filter((e) => e.kind === 'free').slice(-1)[0])`);
  ok('Garfield opens the door → Jon gets out', freed && /"self":false/.test(ev), ev);
};
T.lymanTrap60 = async () => {
  await settle();
  await E(`S.api().act('lyman', 'room')`);
  const inRoom = await until(`S.L().ly.state === 'fpRoom' && S.L().ly.pos().y > 2.9 && S.L().ly.pos().z > 7.6`, 45000);
  ok("Lyman goes to his room", inRoom, JSON.stringify((await E('JSON.stringify(S.snap().hs[1])'))));
  if (!inRoom) return null;
  // don't shut Odie in with him for the whole minute (the Odie checks that follow would fail at random)
  if (await E(`S.odie().y > 2.5 && S.odie().z > 6.95`)) {
    await E(`S.api().odieGo('bowl')`);
    await until(`!(S.odie().y > 2.5 && S.odie().z > 6.6)`, 20000);
  }
  await E(`S.tp(S.A('lymanDoorOut').pos.clone(), S.A('lymanDoor').pos)`);
  await until(`S.cur() === 'fp_lymanDoor'`, 3000);
  await pressE();
  const trapped = await until(`S.L().ly.state === 'trapped'`, 4000);
  ok('close Lyman in his room → trapped', trapped);
  return trapped ? await now() : null;   // the 60 s self-escape is checked later, while the other tests run
};
T.delivery = async () => {
  await settle();
  await E(`S.api().start('delivery')`);
  const atDoor = await until(`S.L().del && S.L().del.root.visible`, 30000);
  await sleep(1500); await E(`S.tp(S.V(6.2, 0, 2.6), S.A('doorInside').pos)`); await sleep(400); await shot('04_delivery', `S.A('doorInside').pos.clone().setY(1.2)`);
  const swapped = await until(`S.L().flags.swapped && !S.fp().active.has('delivery')`, 60000);
  ok('delivery man + new TV, old TV left on the carpet', atDoor && swapped, JSON.stringify(await E(`JSON.stringify(S.fp().log.filter((e) => /delivery|swap/.test(e.id)))`)));
};
T.carpet = async () => {
  if (!(await E('S.L().flags.swapped'))) { ok('carpet pull', false, 'no TV swap yet'); return; }
  await settle();
  for (const id of ['tvtime', 'dinner', 'brawl']) await E(`S.api().end('${id}')`);
  await E(`S.api().act('jon', 'wander'); S.api().act('lyman', 'coffee'); S.api().odieGo('oldTv')`);
  const there = await until(`S.L().odieAI.taskName() === 'fpOldTv' && S.odie().distanceTo(S.A('oldTvSpot').pos) < 1.4 && !S.L().odieAI.busy() === false`, 25000);
  await until(`S.odie().distanceTo(S.A('oldTvSpot').pos) < 1.1`, 15000);
  await E(`S.tpItem('fp_carpet')`);
  await sleep(400);
  const cur = await E('S.cur()');
  const tv0 = await E(`JSON.stringify(S.ctx().world.props.get('tv').root.getWorldPosition(S.V(0,0,0)).toArray().map((v) => +v.toFixed(2)))`);
  await pressE();
  const pulled = await until(`S.L().flags.pulled`, 3000);
  await sleep(2000);
  console.log('   old TV', tv0, '→', await E(`JSON.stringify(S.ctx().world.props.get('tv').root.getWorldPosition(S.V(0,0,0)).toArray().map((v) => +v.toFixed(2)))`), 'odie', await E(`JSON.stringify(S.odie().toArray().map((v) => +v.toFixed(2)))`));
  await sleep(3000); await shot('05_carpet_flatten', `S.odie().clone().setY(0.5)`);
  const flat = await until(`S.L().odieAI.state === 'down'`, 3000);
  ok('grip the carpet → old TV flattens Odie', there && pulled && flat, `cur=${cur} there=${there} pulled=${pulled} flat=${flat} ` + await E(`JSON.stringify({o: S.snap().odie, log: S.fp().log.slice(-3), hs: S.snap().hs.map((h) => h.st)})`));
  const back = await until(`!S.L().flags.pulled`, 20000);
  ok('carpet + old TV reset for another go', back);
};
T.vase = async () => {
  await settle();
  await E(`S.api().odieGo('sill')`);
  const there = await until(`S.odie().distanceTo(S.A('odieSill').pos) < 0.5 && S.L().odieAI.taskName() === 'fp_sill'`, 25000);
  await E(`(() => { const v = S.L().flags.sill ? S.ctx().world.props.get('vase').root.getWorldPosition(S.V(0,0,0)) : null; const s = S.A('windowsill').pos; S.tp(S.V(v.x + 0.38, s.y, s.z + 0.02), v); })()`);
  await sleep(400);
  await pressJ();
  const hit = await until(`S.fp().log.some((e) => e.kind === 'vase')`, 3000);
  const res = await E(`JSON.stringify(S.fp().log.filter((e) => e.kind === 'vase').slice(-1)[0])`);
  await sleep(1300); await shot('06_vase_odie', `S.odie().clone().setY(0.5)`);
  ok('knock the vase onto Odie by the sill', there && hit && /hit/.test(res), res);
  await settle();
};
T.windowLaunch = async () => {
  await settle();
  await E(`S.tpItem('fp_window')`);
  await sleep(500);
  if (!(await E('S.L().flags.winOpen'))) { await until(`S.cur() === 'fp_window'`, 3000); await pressE(); }
  const open = await until(`S.L().flags.winOpen`, 3000);
  ok('open the window from the sill', open);
  await until(`!S.L().flags.odieDown`, 15000);
  await E(`S.api().start('zoomies')`);
  const up = await until(`S.L().flags.zoomSat && S.L().odieAI.taskName() === 'fpZoomies'`, 30000);
  await E(`S.besideOdieOnTable()`);
  await sleep(350);
  if (!(await E('S.L().flags.winOpen'))) await E(`S.L().flags.winOpen = true`); // a human may have shut it meanwhile
  await pressJ();
  const out = await until(`S.L().flags.odieOut`, 3000);
  await sleep(1300); await shot('07_out_the_window', `S.A('window').pos.clone()`);
  ok('scratch Odie from the table with the window open → out he goes', up && out);
  const back = await until(`!S.L().flags.odieOut && S.L().odie.root.visible`, 30000);
  ok('Odie comes back through the front door ~20 s later', back);
};
T.cupboard = async () => {
  await settle();
  await until(`!S.L().flags.odieDown && !S.L().flags.odieOut`, 15000);
  await E(`S.tpItem('fp_cupboardDoor')`);
  await sleep(400);
  if (!(await E(`S.ctx().world.props.get('cupboardDoor').isOpen`))) { await until(`S.cur() === 'fp_cupboardDoor'`, 3000); await pressE(); }
  await until(`S.ctx().world.props.get('cupboardDoor').isOpen`, 3000);
  await E(`S.tpScratch('fp_biscuitBox', S.A('cupboardInside').pos)`);
  await sleep(400);
  await pressJ();
  const burst = await until(`S.L().flags.biscuits`, 3000);
  await E(`S.tp(S.A('cupboardFront').pos.clone().add(S.V(-0.6, 0, 0)), S.A('cupboardFront').pos)`);
  const odieIn = await until(`S.L().odieAI.taskName() === 'fpBiscuits' && S.odie().x > 8.05`, 25000);
  await sleep(1500);
  await E(`S.tpItem('fp_cupboardDoor')`);
  await sleep(400);
  await until(`S.cur() === 'fp_cupboardDoor'`, 3000);
  await pressE();
  const shut = await until(`S.L().flags.odieTrapped`, 3000);
  ok('scratch the biscuit box, Odie runs in, shut the door on him', burst && odieIn && shut, JSON.stringify(await E('JSON.stringify(S.snap().odie)')));
  await sleep(2000);
  await until(`S.cur() === 'fp_cupboardDoor'`, 3000);
  await pressE();
  const free = await until(`!S.L().flags.odieTrapped`, 3000);
  ok('open the cupboard → Odie trots out', free);
};
T.socksWhistle = async () => {
  await settle();
  await until(`!S.L().flags.odieDown && !S.L().flags.odieOut && !S.L().flags.odieTrapped`, 15000);
  await E(`S.api().odieGo('roam')`);
  const dr = `S.ctx().world.props.get('dresser').sockDrawer`;
  await E(`(() => { const a = S.A('sockDrawer'), d = a.pos; const r = a.rotY; S.tp(S.V(d.x + Math.sin(r) * 0.55, 3, d.z + Math.cos(r) * 0.55), d); })()`);
  await sleep(500);
  let cur = await E('S.cur()');
  if (!(await E(`${dr}.isOpen`))) { await pressE(); await until(`${dr}.isOpen`, 3000); }
  await sleep(700);
  await pressE(); // jump in
  const inD = await until(`S.L().flags.inDrawer`, 2000);
  let odieCame = false;
  for (let tries = 0; tries < 3 && !odieCame; tries++) {
    await pressE(); // play
    await sleep(3200);
    odieCame = await until(`S.L().flags.odieHere`, 25000);
  }
  await shot('08_sock_drawer');
  ok('open the sock drawer, jump in and play; Odie wanders in', inD && odieCame, `cur=${cur}`);
  if (odieCame) {
    for (let i = 0; i < 3; i++) {
      await E(`(() => { const o = S.odie(); S.tp(S.V(o.x + 0.45, 3, o.z), o); })()`);
      await sleep(300);
      cur = await E('S.cur()');
      if (cur === 'fp_sock') await pressE(); else await E(`S.ctx().interact.items.get('fp_sock').onInteract()`);
      await sleep(900);
    }
    const socked = await until(`S.fp().log.some((e) => e.kind === 'socks' && e.id === 'odie')`, 3000);
    await sleep(2500); await shot('09_odie_socked', `S.odie().clone().setY(S.odie().y + 0.4)`);
    ok('sock Odie ×3 → he walks off socked, Jon chases', socked);
  }
  await settle();
  await E(`S.tpItem('fp_whistle')`);
  await sleep(500);
  await until(`S.cur() === 'fp_whistle'`, 3000);
  await pressE();
  const got = await until(`!!S.L().flags.whistle`, 2000);
  await sleep(500);
  const t0 = await now();
  await pressE();
  const blown = await until(`S.fp().log.some((e) => e.kind === 'whistle')`, 4000);
  const shake = await until(`S.L().odieAI.state === 'down'`, 3000);
  ok('pick up the whistle, blow it ("Must be broken.") → Odie shakes', got && blown && shake);
  const rec = await until(`!S.L().flags.odieDown`, 16000);
  ok('…and recovers after ~10 s', rec, `${((await now()) - t0).toFixed(1)}s`);
};
T.brawl = async () => {
  await settle();
  await E(`S.tpScratch('fp_breakDrawer', S.V(4.1, 3, 5.4))`);
  await sleep(400);
  for (let i = 0; i < 3; i++) { await pressJ(); await sleep(600); }
  const broke = await until(`S.L().flags.drawerBroken`, 2000);
  await E(`S.tpItem('fp_launcher')`);
  await sleep(400);
  await until(`S.cur() === 'fp_launcher'`, 3000);
  await pressE();
  const got = await until(`!!S.L().flags.launcher`, 2000);
  ok("scratch Jon's drawer open, take the spit-ball launcher", broke && got);
  await until(`!S.L().flags.odieDown && !S.L().flags.odieOut`, 15000);
  await E(`S.api().start('tvtime')`);
  const sofa = await until(`S.L().jon.state === 'sofa' && S.L().ly.state === 'sofa'`, 40000);
  await E(`S.api().odieGo('sofa')`);
  await until(`S.odie().distanceTo(S.A('sofaFoot').pos) < 0.5`, 20000);
  await E(`(() => { const o = S.odie(); S.tp(S.V(o.x + 2.2, 0, o.z + 1.4), o); })()`);
  await sleep(400);
  const cur = await E('S.cur()');
  if (cur === 'fp_fire') await pressE(); else await E(`S.ctx().interact.items.get('fp_fire').onInteract()`);
  const brawl = await until(`S.fp().active.has('brawl')`, 3000);
  await sleep(5000); await shot('10_brawl', `S.A('sofaFoot').pos.clone().setY(1.0)`);
  ok('spit-ball Odie while they watch telly → the coffee brawl', sofa && brawl, `fire via ${cur === 'fp_fire' ? 'E' : 'direct call (another interactable was nearer)'}`);
  const end = await until(`!S.fp().active.has('brawl')`, 30000);
  const hs = await E(`JSON.stringify(S.snap().hs.map((h) => h.st + '/' + h.task))`);
  ok('…they make up and carry on', end, hs);
};
T.dinner = async () => {
  await settle();
  await E(`S.api().start('dinner')`);
  const seated = await until(`S.L().jon.state === 'sitEat' && S.L().ly.state === 'sitEat'`, 40000);
  await shot('11_dinner', `S.A('tableTop').pos.clone().setY(1.0)`);
  await E(`(() => { const p = S.ctx().world.props.get('plate').pos.clone(); const tb = S.A('tableTop').pos; S.tp(S.V(p.x, tb.y + 0.01, p.z + 0.3), p); })()`);
  const ew = await until(`S.L().flags.ew`, 3000);
  ok('dinner for two; step in it → "Ew!", they leave it', seated && ew);
  await sleep(2500);
  const b0 = await E('S.ctx().controller.belly');
  await E(`(() => { const p = S.ctx().world.props.get('plate').pos.clone(); S.tp(S.V(p.x, p.y + 0.01, p.z + 0.25), p); })()`);
  await sleep(400);
  const cur = await E('S.cur()');
  await pressE();
  const ate = await until(`!S.L().flags.food_plate`, 5000);
  ok('…and Garfield eats the dinner (belly up)', ate && (await E('S.ctx().controller.belly')) > b0, `cur=${cur}`);
  await E(`S.api().end('dinner')`);
};
T.soup = async () => {
  await settle();
  await E(`S.api().start('soup')`);
  const seated = await until(`S.L().jon.state === 'sitEat' && S.ctx().world.props.get('soupBowl').root.visible`, 40000);
  await E(`(() => { const s = S.ctx().world.props.get('soupBowl').root.getWorldPosition(S.V(0,0,0)); S.tp(S.V(s.x, s.y + 0.01, s.z + 0.3), s); })()`);
  await sleep(500);
  const cur = await E('S.cur()');
  if (cur === 'fp_splash') await pressE(); else await E(`S.ctx().interact.items.get('fp_splash').enabled() && S.ctx().interact.items.get('fp_splash').onInteract()`);
  const splash = await until(`S.fp().log.some((e) => e.kind === 'splash')`, 3000);
  await sleep(1200); await shot('12_soup_splash', `S.A('tableTop').pos.clone().setY(1.0)`);
  ok("splash Jon's chicken soup", seated && splash, `cur=${cur} ` + await E(`JSON.stringify({ jon: S.L().jon.state, task: S.L().jon.taskName, p: S.L().jon.pos().toArray().map(v => +v.toFixed(2)), act: [...S.fp().active.keys()], claims: S.fp().claims })`));
  const end = await until(`!S.fp().active.has('soup')`, 30000);
  ok('…he wipes off and the soup event ends', end);
};
T.disco = async () => {
  await settle();
  await E(`S.api().start('disco')`);
  const on = await until(`S.L().flags.discoOn && S.L().ly.taskName === 'fpDance'`, 45000);
  await sleep(800); await shot('13_disco');
  ok('Lyman changes into the disco suit and dances', on);
  if (!on) return;
  for (let i = 0; i < 25 && !(await E('S.L().flags.furDone')); i++) {
    await E(`(() => { const p = S.ctx().lyman.root.position; S.tp(S.V(p.x + 0.35, 0, p.z), p); })()`);
    await sleep(250);
  }
  const furry = await E('!!S.L().flags.furDone');
  await shot('14_disco_furry');
  ok('rub his legs → disco suit covered in fur', furry);
  const back = await until(`!S.fp().active.has('disco') && !S.L().flags.discoOn`, 40000);
  ok('…he goes and changes back (normal and disco never coincide)', back);
};
T.goodmorning = async () => {
  await settle();
  // Jon has to be free to walk by (a leftover event can hold him, and from upstairs the walk alone is ~20 s)
  for (const id of ['tvtime', 'dinner', 'soup', 'brawl', 'mice', 'disco']) await E(`S.api().end('${id}')`);
  await E(`S.api().act('jon', 'wander')`);
  await E(`S.api().start('goodmorning')`);
  await E(`(() => { const tb = S.A('tableTop').pos; S.tp(S.V(tb.x + 0.35, tb.y + 0.01, tb.z)); })()`);
  await sleep(500);
  await until(`S.cur() === 'fp_sit'`, 3000);
  await pressE();
  const sat = await until(`S.L().flags.gmSit`, 2000);
  const by = await until(`S.L().flags.gmPhase === 'byTable'`, 50000);
  await sleep(600); await shot('15_good_morning', `S.A('tableTop').pos.clone().setY(1.1)`);
  await until(`S.cur() === 'fp_poke'`, 3000);
  const cur = await E('S.cur()');
  if (cur === 'fp_poke') await pressE(); else await E(`S.ctx().interact.items.get('fp_poke').onInteract()`);
  const poked = await until(`S.fp().log.some((e) => e.kind === 'poke')`, 3000);
  const glarePh = await until(`S.L().flags.gmPhase === 'glare'`, 20000);
  await c.keyDown('KeyE'); await sleep(2200); await shot('16_glare', `S.ctx().controller.pos.clone().setY(1.1)`); await c.keyUp('KeyE');
  const glared = await until(`S.fp().log.some((e) => e.kind === 'glare')`, 3000);
  ok('bad mood: sit on the table, Jon sings good morning, poke, hold to glare', sat && by && poked && glarePh && glared, `cur=${cur} sat=${sat} by=${by} poked=${poked} glare=${glarePh}/${glared} ` + await E(`JSON.stringify({ jon: S.L().jon.state, task: S.L().jon.taskName, p: S.L().jon.pos().toArray().map(v => +v.toFixed(2)), gm: S.L().flags.gmPhase, act: [...S.fp().active.keys()] })`));
  const end = await until(`!S.fp().active.has('goodmorning') && !S.ctx().controller.locked`, 15000);
  ok('…and the controls come back', end, (await E(`JSON.stringify(S.fp().log.filter((e) => e.kind === 'hug'))`)));
};
T.shedding = async () => {
  await settle();
  if (await E('S.L().flags.bald')) await until('!S.L().flags.bald', 65000);
  await E(`S.api().start('shedding')`);
  for (const s of ['bed', 'sofa', 'armchair', 'table']) {
    await E(`S.tpItem('fp_shed_${s}')`);
    await sleep(400);
    const cur = await E('S.cur()');
    if (cur === 'fp_shed_' + s) await pressE(); else { console.log(`   shed ${s}: cur=${cur} enabled=${await E(`S.ctx().interact.items.get('fp_shed_${s}').enabled()`)}`); await E(`S.ctx().interact.items.get('fp_shed_${s}').onInteract()`); }
    await sleep(1900);
    if (s === 'sofa') await shot('17_shed_sofa');
  }
  const n = await E(`S.fp().log.filter((e) => e.kind === 'shed').length`);
  ok('shedding week: shed on bed, sofa, armchair, table', n >= 4, `${n} sheds, bald=${await E('!!S.L().flags.bald')}`);
};
T.mice = async () => {
  await settle();
  for (const id of [...['tvtime', 'delivery']]) await E(`S.api().end('${id}')`);
  await E(`S.tpItem('fp_fridge')`);
  await sleep(400);
  await until(`S.cur() === 'fp_fridge'`, 3000);
  await pressE();
  const cheese = await until(`S.L().flags.cheeseHeld > 0`, 3000);
  for (const i of [0, 2]) {
    await E(`S.tpItem('fp_cheese${i}')`);
    await sleep(400);
    await until(`S.cur() === 'fp_cheese${i}'`, 2000);
    await pressE();
    await sleep(500);
  }
  const mice = await until(`S.fp().active.has('mice') || S.fp().pending.has('mice')`, 3000);
  const run = await until(`S.fp().active.has('mice')`, 30000);
  await sleep(4000); await shot('18_mice', `S.L().jon.pos().setY(0.8)`);
  ok('cheese from the fridge + 2 around the house → mice night (both humans chase mice)', cheese && mice && run);
  const end = await until(`!S.fp().active.has('mice')`, 35000);
  ok('…and it ends after ~20 s', end);
};
T.warp = async () => {
  await settle();
  await E(`S.api().act('jon', 'coffee')`);
  const sat = await until(`S.L().jon.state === 'sitEat' && S.L().jon.seated()`, 40000);
  let warped = false;
  for (let i = 0; i < 6 && !warped; i++) {
    await E(`(() => { const tb = S.A('tableTop').pos; S.tp(S.V(tb.x + 0.6, tb.y + 0.01, tb.z)); S.L().flags.warpTried = false; S.L().flags.warpAt = -999; })()`);
    await sleep(300);
    await E(`(() => { const tb = S.A('tableTop').pos; S.tp(S.V(tb.x, tb.y + 0.01, tb.z)); })()`);
    warped = await until(`S.L().flags.warping`, 1200);
  }
  await sleep(900); await shot('19_table_warp');
  const done = await until(`!S.L().flags.warping && !S.ctx().director.active`, 15000);
  const y = await E('S.ctx().controller.pos.y');
  ok('walk the table while Jon sits at it → the table sags ("Diet time.")', sat && warped && done && y > 0.6, `y after=${y.toFixed(2)}`);
};

T.debugTable = async () => {
  await E(`S.api().start('zoomies')`);
  await until(`S.L().flags.odieOnTable && S.L().odieAI.taskName() === 'fpZoomies' && S.odie().distanceTo(S.A('odieTableEdge').pos) < 0.3`, 30000);
  await E(`S.besideOdieOnTable()`);
  await sleep(350);
  console.log(await E(`JSON.stringify({g: S.ctx().controller.pos, rot: S.ctx().garfield.root.rotation.y, odie: S.odie(), tgt: S.ctx().scratch.targets.get('odie').getPos(S.V(0,0,0)), en: S.ctx().scratch.targets.get('odie').enabled(), jon: S.L().jon.pos(), jst: S.L().jon.state})`));
  await pressJ();
  await sleep(300);
  console.log(await E(`JSON.stringify({hit: S.ctx().scratch.lastHit && {hit: S.ctx().scratch.lastHit.hit, prop: S.ctx().scratch.lastHit.propId}, down: S.L().flags.odieDown, g: S.ctx().controller.pos})`));
};
const order = ['exclusion', 'zoomies', 'trapDoor', 'lymanTrap60', 'delivery', 'carpet', 'vase', 'windowLaunch', 'cupboard', 'socksWhistle', 'brawl', 'dinner', 'soup', 'disco', 'goodmorning', 'shedding', 'mice', 'warp'];
let lymanTrapAt = null;
for (const name of only || order) {
  if (!want(name)) continue;
  try {
    const r = await T[name]();
    if (name === 'lymanTrap60') lymanTrapAt = r;
  } catch (e) {
    if (/socket closed/.test(e.message)) { await revive(name); try { const r = await T[name](); if (name === 'lymanTrap60') lymanTrapAt = r; } catch (e2) { ok(name, false, 'threw after restart: ' + e2.message); } }
    else ok(name, false, 'threw: ' + e.message);
  }
  if (lymanTrapAt != null && (await now()) - lymanTrapAt > 62) {
    const ev = await E(`JSON.stringify(S.fp().log.find((e) => e.kind === 'free' && e.id === 'lyman'))`);
    ok('Lyman lets himself out after 60 s', /"self":true/.test(ev) && /"after":6[0-2]/.test(ev), ev);
    lymanTrapAt = null;
  }
}
if (lymanTrapAt != null) {
  await until(`S.fp().log.some((e) => e.kind === 'free' && e.id === 'lyman')`, Math.max(1000, (62 - ((await now()) - lymanTrapAt)) * 1000));
  const ev = await E(`JSON.stringify(S.fp().log.find((e) => e.kind === 'free' && e.id === 'lyman'))`);
  ok('Lyman lets himself out after 60 s', /"self":true/.test(ev), ev);
}

// ---------------------------------------------------------------- random soak
if (!args.nosoak) {
  console.log(`--- soak ${mins} min (random Garfield) ---`);
  // the soak judges the director on its own: a fresh session
  await c.nav(`${base}?level=fp2&skip=1&nointro=1&ch2=1`);
  await until(`window.__game && __game.state==='play' && __game.ctx && __game.ctx.L && __game.ctx.L.started && __game.ctx.L.fp`, 60000);
  await E(HELPERS);
  c.logs.length = c.logs.length; // keep directed-phase logs for the error check
  const t0 = Date.now(), end = t0 + mins * 60000;
  const samples = [], fails = [];
  const lastMove = {};
  let lockedFor = 0, shotN = 0, lastShot = Date.now();
  const SIT = new Set(['sofa', 'sitEat', 'lounge', 'trapped', 'fpRoom', 'catch', 'cutscene']);
  let i = 0;
  while (Date.now() < end) {
    i++;
    // a random action
    const r = Math.random();
    try {
      if (r < 0.45) {
        const id = await E(`(() => { const ids = [...S.ctx().interact.items.values()].filter((it) => !it.enabled || it.enabled()).map((it) => it.id).filter((id) => !/^fp_(fire|poke)$/.test(id) || Math.random() < 0.5); return ids[Math.floor(Math.random() * ids.length)] || null; })()`);
        if (id && !(await E('S.ctx().controller.locked || S.ctx().director.active'))) { await E(`S.tpItem(${JSON.stringify(id)})`); await sleep(300); await pressE(); }
      } else if (r < 0.75) {
        const id = await E(`(() => { const ids = [...S.ctx().scratch.targets.values()].filter((t) => !t.enabled || t.enabled()).map((t) => t.id); return ids[Math.floor(Math.random() * ids.length)] || null; })()`);
        if (id && !(await E('S.ctx().controller.locked || S.ctx().director.active'))) { await E(`S.tpScratch(${JSON.stringify(id)})`); await sleep(250); await pressJ(); }
      } else if (r < 0.9) {
        await keyHold(['KeyW', 'KeyA', 'KeyS', 'KeyD'][Math.floor(Math.random() * 4)], 400 + Math.random() * 900);
        if (Math.random() < 0.4) await c.key('Space');
      } else await sleep(1500);
    } catch (e) { fails.push('action threw: ' + e.message); }
    await sleep(800 + Math.random() * 1500);
    // sample
    let s;
    try { s = JSON.parse(await E('JSON.stringify(S.snap())')); } catch (e) { fails.push('snap failed: ' + e.message); break; }
    if (s.state !== 'play') { fails.push('left play state: ' + s.state); break; }
    samples.push(s);
    for (const h of s.hs) {
      const k = h.who, key = h.st + '|' + h.p.join(',');
      if (!lastMove[k] || lastMove[k].key !== key) lastMove[k] = { key, at: s.t };
      else if (!SIT.has(h.st) && s.t - lastMove[k].at > 90) fails.push(`${k} frozen ${(s.t - lastMove[k].at).toFixed(0)}s in ${h.st}/${h.task} at ${h.p}`), lastMove[k].at = s.t;
      if (h.st === 'trapped' && h.stT > 70) fails.push(`${k} trapped ${h.stT}s`);
    }
    {
      const o = s.odie, key = o.task + '|' + o.p.join(',');
      if (!lastMove.odie || lastMove.odie.key !== key) lastMove.odie = { key, at: s.t };
      else if (s.t - lastMove.odie.at > 90 && !o.trapped) fails.push(`odie frozen ${(s.t - lastMove.odie.at).toFixed(0)}s in ${o.st}/${o.task}`), lastMove.odie.at = s.t;
      if (o.solid && o.vis) fails.push(`odie inside ${o.solid} at ${o.p} (${o.task})`);
    }
    for (const a of s.active) if (a.age > a.max + 6) fails.push(`event ${a.id} overran: ${a.age}s > ${a.max}s`);
    const ids = s.active.map((a) => a.id);
    for (const a of ids) for (const b of ids) if (a < b && (await E(`S.api().excl(${JSON.stringify(a)}, ${JSON.stringify(b)})`))) fails.push(`exclusive events overlap: ${a} + ${b}`);
    lockedFor = s.locked && !s.dir ? lockedFor + 1 : 0;
    if (lockedFor > 12) { fails.push('controller locked outside a cutscene for >12 samples'); lockedFor = 0; }
    if (shots && Date.now() - lastShot > (mins * 60000) / 6) { lastShot = Date.now(); await c.shot(`${shots}/fp2_soak_${++shotN}.png`); }
  }
  const fpState = JSON.parse(await E(`JSON.stringify({ log: S.fp().log, counts: S.fp().counts, cancels: S.fp().cancels, skips: S.fp().skips, wd: S.fp().watchdog, knocks: S.fp().knocks, traps: S.fp().traps, frees: S.fp().frees, chases: S.fp().chases || 0, eaten: S.fp().eaten || 0, launches: S.fp().launches || 0, t: S.L().t, barks: S.L().barks.log.length, barkKeys: new Set(S.L().barks.log.map((b) => b.key)).size })`));
  const gameMin = fpState.t / 60;
  const starts = fpState.log.filter((e) => e.kind === 'start').length;
  console.log(`   game time ${fpState.t.toFixed(0)}s, ${samples.length} samples, ${i} actions`);
  console.log('   event starts:', JSON.stringify(fpState.counts), `cancels ${fpState.cancels}, skips ${fpState.skips}`);
  console.log(`   knocks ${fpState.knocks}, traps ${fpState.traps}, frees ${fpState.frees}, chases ${fpState.chases}, eaten ${fpState.eaten}, window launches ${fpState.launches}`);
  console.log(`   barks ${fpState.barks} (${fpState.barkKeys} distinct)`);
  console.log('   watchdog:', JSON.stringify(fpState.wd));
  ok('soak: no stuck states / overlaps / overruns', !fails.length, fails.slice(0, 12).join(' | '));
  ok('soak: events fire at a sensible rate (1–3 per game minute)', starts / gameMin >= 0.8 && starts / gameMin <= 4, `${starts} starts in ${gameMin.toFixed(1)} min`);
  ok('soak: watchdogs rarely needed (≤ 2 per 5 min)', fpState.wd.length <= Math.max(2, Math.ceil(gameMin / 2.5)), `${fpState.wd.length}`);
  ok('soak: plenty of barks (≥ 4 per minute)', fpState.barks / gameMin >= 4, `${(fpState.barks / gameMin).toFixed(1)}/min`);
}

const errs = [...new Set([...allLogs, ...c.logs].filter((l) => /exception|\[error\]/.test(l)))];
ok('no exceptions / console errors', !errs.length, errs.slice(0, 6).join('\n   '));
const warns = [...new Set(c.logs.filter((l) => /\[warn/.test(l) && /fp2|odie|human|cast2/i.test(l)))];
if (warns.length) console.log('   warnings:\n   ' + warns.slice(0, 8).join('\n   '));
c.close();
const failed = results.filter((r) => !r.pass);
console.log(`\nFP2: ${results.length - failed.length}/${results.length} passed${failed.length ? ' — FAIL: ' + failed.map((r) => r.name).join('; ') : ''}`);
process.exit(failed.length ? 1 : 0);
