#!/usr/bin/env node
// Ball hits in the real game (headless Chrome, raw CDP), against the local server on :8098.
//   ~/.claude/bin/cdp start --port 9532 && ~/.claude/bin/cdp start --port 9533 && tools/server_run.sh --bg
//   node tools/ballhit_cdp.mjs [--out=docs/notes/ballhit_shots] [--port=9532] [--port2=9533]
// Alice creates a room (ball hits on by default, 1 ghost AI), Bob joins. Bob putts down the fairway,
// Alice putts straight at his ball: Bob's screen must freeze + animate his ball, the server's knock
// must put it where Alice's sim left it on both screens. Then Bob putts at the AI's ball (Alice's
// client runs the AI): the AI seat is knocked and its driver carries on. Settings + lobby shown.
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const PORT = +(args.port || 9532), PORT2 = +(args.port2 || 9533);
const BASE = args.base || 'http://192.168.0.236:8888/gms/3d/skyputt/';
const OUT = args.out || 'docs/notes/ballhit_shots';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
let fails = 0;
const check = (c, msg) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails++; };

function rpc(ws) {
  let id = 0; const pending = new Map(), handlers = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) handlers.forEach(h => h(m));
  };
  return {
    send: (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pending.set(i, { res, rej })); },
    on: f => handlers.push(f),
  };
}
const open = url => new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(ws); ws.onerror = rej; });

class Page {
  static async create(browser, name, port = PORT) {
    const { browserContextId } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const p = new Page();
    p.name = name; p.targetId = targetId;
    p.ws = await open(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
    p.c = rpc(p.ws);
    await p.c.send('Runtime.enable'); await p.c.send('Log.enable'); await p.c.send('Page.enable');
    await p.c.send('Network.enable'); await p.c.send('Network.setCacheDisabled', { cacheDisabled: true });
    p.c.on(m => {
      const tag = `[${name}]`;
      if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) errors.push(`${tag} console.error: ` + m.params.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') console.log(`  ${tag} warn:`, m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 240));
      if (m.method === 'Runtime.exceptionThrown') errors.push(`${tag} exception: ` + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errors.push(`${tag} log: ` + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    });
    return p;
  }
  async size(w, h, mobile) {
    await this.c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });   // DPR 1: software GL is slow
    await this.c.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await this.c.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  }
  async eval(expr) {
    const r = await this.c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${this.name} eval: ` + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async waitFor(expr, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch { /* navigating */ } await sleep(150); }
    throw new Error(`${this.name}: timeout waiting for ${expr}`);
  }
  async go(qs) {
    await this.c.send('Page.navigate', { url: `${BASE}?${qs}&t=${Date.now()}` });
    await sleep(400);
    await this.waitFor('window.__booted === true', 40000);
    await sleep(600);
  }
  async click(sel) { return this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`); }
  async shot(file) {
    const r = await this.c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${OUT}/${file}.png`, Buffer.from(r.data, 'base64'));
    console.log('  shot', `${OUT}/${file}.png`);
  }
}


const R = `window.__skyputt.round`;
const seatPos = (p, i) => p.eval(`JSON.stringify(window.__skyputt.online.game.room.seats[${i}].cur.pos)`);
const near = (a, b, e = 1e-6) => a && b && a.every((v, k) => Math.abs(v - b[k]) < e);

// --ghost: a story-style rival ghost on hole 1 (single page): wait for its first putt to stop, putt at
// it, check it is knocked off its line and plays on (AI), and the hole card shows its real score.
async function ghostMain() {
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const br = rpc(await open(ver.webSocketDebuggerUrl));
  const A = await Page.create(br, 'solo', PORT);
  await A.size(412, 915, true);
  await A.go(`hole=1&fresh&noflyover&q=low`);
  await A.waitFor(`!!${R} && ${R}.state === 'ready'`, 30000);
  // a recorded Carl, as the story's rival match passes it (field entry: scores + shots per hole)
  const rec = await A.eval(`(async () => { const AI = await import('/gms/3d/skyputt/js/ai/index.js'); const r = ${R};
    const g = AI.golferFor({ id: 'carl', name: 'Careful Carl', personality: 'careful', skill: 0.36 }, 7);
    const h = AI.playHoleSync({ hole: r.hole, golfer: g, trace: true, budgetScale: 0.5, think: [8, 0.5] });
    const carl = { id: 'carl', name: 'Careful Carl', colour: '#c9d36a', personality: 'careful', skill: 0.36, scores: [h.strokes], total: h.strokes, shots: [h.shots] };
    r.ghosts = [carl]; r.opponents = [carl]; window.__carl = carl;
    r.loadHole(0); r.endFlyover();
    return { strokes: h.strokes, t0: h.shots.map(s => s.t0), end0: h.shots[0].t0 + h.shots[0].path.length / 90 }; })()`);
  console.log('  recorded Carl:', JSON.stringify(rec));
  await A.waitFor(`!!${R}.ghost?.sim`, 15000);
  await A.waitFor(`${R}.world.time > ${rec.end0 + 0.3}`, 60000);
  const at = await A.eval(`JSON.stringify([${R}.ghost.sim.ball.px, ${R}.ghost.sim.ball.py, ${R}.ghost.sim.ball.pz])`);
  await A.shot('ghost-before');
  // set my ball down 0.7 m short of it (toward the tee, along the fairway) and putt at it
  await A.eval(`(() => { const r = ${R}, p = ${at}, F = r.hole.frames;
    let best = 0, bd = Infinity; F.forEach((f, i) => { const d = Math.hypot(f.p[0] - p[0], f.p[2] - p[2]); if (d < bd && !f.loop) { bd = d; best = i; } });
    const f = F.findLast(q => q.s <= F[best].s - 0.7) || F[0];
    r.ball.place(f.p[0], f.p[1] + 0.06, f.p[2]); r.ballMesh.position.set(r.ball.px, r.ball.py, r.ball.pz);
    r.app.rig.snap(r.ballMesh.position.clone(), r.fairwayYaw()); return true; })()`);
  await sleep(600);
  await A.eval(`(() => { const r = ${R}, p = ${at}; const dx = p[0] - r.ball.px, dz = p[2] - r.ball.pz, L = Math.hypot(dx, dz); r.shoot(dx / L * 2.2, dz / L * 2.2, 0.4); return true; })()`);
  let live = false;
  for (let i = 0; i < 40 && !live; i++) { await sleep(250); live = await A.eval(`${R}.ghost.sim.mode === 'live'`);
    if (args.debug && i % 4 === 0) console.log('   ', await A.eval(`(() => { const r = ${R}, g = r.ghost.sim.ball, b = r.ball; return [r.state, b.state, g.state, g.noHit, g.kinematic, Math.hypot(g.px - b.px, g.pz - b.pz).toFixed(3), r.world.time.toFixed(2), r.collide, b.noHit].join(' '); })()`)); }
  check(live, 'my putt knocked the rival ghost off its line');
  await sleep(300); await A.shot('ghost-hit');
  await A.waitFor(`${R}.state === 'ready' || ${R}.state === 'done' || ${R}.state === 'sinking'`, 40000);
  // the AI plays the ghost on: wait for its next live putt
  const shots0 = await A.eval(`${R}.ghost.sim.strokes`);
  let moved = false;
  for (let i = 0; i < 80 && !moved; i++) { await sleep(250); moved = await A.eval(`${R}.ghost.sim.strokes > ${shots0} || ${R}.ghost.sim.done`); }
  check(moved, 'the knocked ghost plays on with the AI planner');
  await sleep(1200); await A.shot('ghost-playing-on');
  // finish my hole: drop my ball next to the cup and tap it in
  await A.eval(`(() => { const r = ${R}; if (r.state !== 'ready') return false; const c = r.hole.cup; r.ball.place(c.x, c.y + 0.05, c.z + 0.3); r.shoot(0, -0.9, 0.1); return true; })()`);
  await A.waitFor(`${R}.state === 'done'`, 40000);
  await sleep(800);
  const res = await A.eval(`JSON.stringify({ sim: ${R}.ghost.sim.result(), score: window.__carl.scores[0], card: document.querySelector('.card')?.innerText || '' })`);
  const r = JSON.parse(res);
  console.log('  ghost result', JSON.stringify(r.sim), 'scorecard value', r.score);
  check(r.sim.diverged && r.score === r.sim.strokes, `the rival's hole score is what it really took (${r.score}, recorded ${rec.strokes})`);
  check(/Careful Carl/.test(r.card), 'hole card lists the rival');
  await A.shot('ghost-card');
  check(!errors.length, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}

async function main() {
  const browserAt = async port => { const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); const ws = await open(ver.webSocketDebuggerUrl); return { ws, b: rpc(ws) }; };
  const b1 = await browserAt(PORT), b2 = await browserAt(PORT2);
  const A = await Page.create(b1.b, 'alice', PORT), B = await Page.create(b2.b, 'bob', PORT2);
  await A.size(412, 915, true); await B.size(412, 915, true);
  const qs = name => `devuid=${name}${Date.now().toString(36)}&devname=${name[0].toUpperCase() + name.slice(1)}&fresh&noflyover&q=low`;
  await Promise.all([A.go(qs('alice')), B.go(qs('bob'))]);

  // settings sheet: the toggle, on by default
  await A.eval(`(() => { const b = document.querySelector('#t-settings') || document.querySelector('[data-a=settings]'); b?.click(); return !!b; })()`);
  await sleep(500);
  check(await A.eval(`!!document.querySelector('#sheet [data-k=ballHit] button.on[data-v="1"]')`), 'settings: Ball hits = Battle by default');
  await A.shot('settings');
  await A.eval(`document.querySelector('#sheet [data-a=close]')?.click(); true`);

  await A.click('#t-online');
  await A.waitFor(`window.__skyputt.online.view === 'home'`);
  await A.click('[data-a=create]');
  await A.waitFor(`window.__skyputt.online.view === 'create'`);
  await A.eval(`(() => { document.querySelector('[data-k=aiCount] [data-d="-1"]').click(); return true; })()`);
  await sleep(200);
  check(await A.eval(`!!document.querySelector('.net-form [data-k=collide] button.on[data-v="1"]')`), 'create form: Ball hits = Battle (from the setting)');
  await A.shot('create-form');
  await A.click('[data-a=make]');
  await A.waitFor(`window.__skyputt.online.view === 'lobby'`);
  const code = await A.eval(`window.__skyputt.online.net.room.code`);
  await B.click('#t-online');
  await B.waitFor(`window.__skyputt.online.view === 'home'`);
  await B.eval(`(() => { const i = document.querySelector('[data-k=code]'); i.value = ${JSON.stringify(code.toLowerCase())}; return true; })()`);
  await B.click('[data-a=join]');
  await B.waitFor(`window.__skyputt.online.view === 'lobby'`);
  await sleep(400);
  check(await B.eval(`/Battle/.test(document.querySelector('.net-sum')?.textContent || '')`), 'lobby shows the room rule (Battle)');
  await B.shot('lobby');
  await A.click('[data-a=start]');
  await Promise.all([A.waitFor(`!!${R} && ${R}.state === 'ready'`, 30000), B.waitFor(`!!${R} && ${R}.state === 'ready'`, 30000)]);
  check(await A.eval(`${R}.collide === true`) && await B.eval(`${R}.collide === true`), 'both rounds play with ball hits on');
  // the AI seat waits for step 3, then putts from the tee straight at Bob's ball (aim convention: 0 = -Z)
  await A.eval(`(() => { const g = window.__skyputt.online.game;
    g.driver.ai = { shot: async (def, golfer, ball, o) => {
      while (!window.__aiGo) await new Promise(r => setTimeout(r, 100));
      window.__aiGo = false; window.__aiShots = (window.__aiShots || 0) + 1;   // one aimed putt per go
      const p = g.room.seats[1].cur.pos, dx = p[0] - ball.x, dz = p[2] - ball.z, v = 3.0;
      const power = Math.pow((v - 0.25) / 6.15, 0.8), from = [ball.x, ball.y, ball.z];
      return { shot: { aim: Math.atan2(dx, -dz), power }, t0: g.sharedTime() + 0.3, path: Float32Array.from(from), state: 'rest', from, to: from, rest: ball };
    } }; return true; })()`);

  // 1. Bob putts gently down the fairway
  await B.eval(`(() => { const r = ${R}, y = r.fairwayYaw(); r.shoot(Math.sin(y) * 1.6, -Math.cos(y) * 1.6, 0.3); return true; })()`);
  await B.waitFor(`${R}.state === 'ready'`, 30000);
  await A.waitFor(`(() => { const s = window.__skyputt.online.game.room.seats[1]; return !!s.cur.pos && !s.cur.flying && !${R}.peers.get(1).ball.playing; })()`, 30000);
  const bob0 = JSON.parse(await seatPos(A, 1));
  console.log('  bob rests at', bob0.map(v => v.toFixed(3)).join(', '));
  await sleep(600);
  await A.shot('a-before');

  // 2. Alice putts straight at Bob's ball
  const tg = await A.eval(`JSON.stringify(${R}.targetsFor(window.__skyputt.online.game.you, { x: ${R}.ball.px, y: ${R}.ball.py, z: ${R}.ball.pz }).map(t => t.seat))`);
  check(JSON.parse(tg).includes(1), `Bob's ball is a target for Alice (${tg}); the AI still on the tee is not`);
  await A.eval(`(() => { const r = ${R}, p = ${JSON.stringify(bob0)}; const dx = p[0] - r.ball.px, dz = p[2] - r.ball.pz, L = Math.hypot(dx, dz); r.shoot(dx / L * 3.2, dz / L * 3.2, 0.55); return true; })()`);
  let sawKnocked = false, sawLive = false;
  for (let i = 0; i < 6; i++) {
    await sleep(450);
    if (await B.eval(`${R}.state === 'knocked'`)) sawKnocked = true;
    if (await A.eval(`${R}.others.some(o => o.knockedBy != null)`)) sawLive = true;
    if (i === 1 || i === 3) { await A.shot(`a-hit-${i}`); await B.shot(`b-hit-${i}`); }
  }
  check(sawLive, "Alice's live sim knocked Bob's ball");
  check(sawKnocked, "Bob's screen froze his ball while the knock played ('knocked')");
  await B.waitFor(`${R}.state === 'ready' || ${R}.state === 'done'`, 30000);
  await A.waitFor(`${R}.state === 'ready' || ${R}.state === 'done'`, 30000);
  await sleep(800);
  const bobA = JSON.parse(await seatPos(A, 1)), bobB = JSON.parse(await seatPos(B, 1));
  const bobBall = JSON.parse(await B.eval(`JSON.stringify([${R}.ball.px, ${R}.ball.py, ${R}.ball.pz])`));
  const bobDone = await B.eval(`${R}.state === 'done'`);
  console.log('  bob after the knock:', bobDone ? 'holed' : bobBall.map(v => v.toFixed(3)).join(', '));
  check(bobDone || (!near(bobA, bob0, 1e-3) && near(bobA, bobB) && near(bobB, bobBall)), 'Bob\'s ball moved, and both clients + the server agree where');
  const ghostOnA = JSON.parse(await A.eval(`JSON.stringify(${R}.peers.get(1).ball.ball.position.toArray())`));
  check(bobDone || near(ghostOnA, bobBall, 1e-4), "Alice's ghost of Bob sits where Bob's ball is");
  await A.shot('a-after'); await B.shot('b-after');

  // 3. The AI seat (run by Alice's client) putts at Bob's ball: the AI's plan is swapped for an aimed
  //    putt (set up right after the start), the host-side driver plays it against the resting balls.
  if (!bobDone) {
    const aiN0 = await A.eval(`window.__skyputt.online.game.room.seats[2].cur.n`);
    const bobN0 = await A.eval(`window.__skyputt.online.game.room.seats[1].cur.n`);
    let sawKnocked2 = false;
    const aliceN0 = await A.eval(`window.__skyputt.online.game.room.seats[0].cur.n`);
    // the AI putts from where it is at Bob's ball; Alice's ball may be in the way (then it's knocked first)
    for (let go = 0; go < 3; go++) {
      const n0 = await A.eval(`window.__skyputt.online.game.room.seats[2].cur.n`);
      await A.eval(`window.__aiGo = true`);
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        if (!sawKnocked2) sawKnocked2 = await B.eval(`${R}.state === 'knocked'`);
        if (await A.eval(`window.__skyputt.online.game.room.seats[2].cur.n`) > n0 && await B.eval(`${R}.state !== 'knocked'`)) break;
      }
      if (await A.eval(`window.__skyputt.online.game.room.seats[1].cur.n`) > bobN0) break;
    }
    await sleep(500); await A.shot('a-ai-hit'); await B.shot('b-ai-hit');
    await B.waitFor(`${R}.state === 'ready' || ${R}.state === 'done'`, 30000);
    await sleep(1500);
    const bobN1 = await A.eval(`window.__skyputt.online.game.room.seats[1].cur.n`);
    const aiN1 = await A.eval(`window.__skyputt.online.game.room.seats[2].cur.n`);
    const b1 = JSON.parse(await seatPos(A, 1)), b2 = JSON.parse(await seatPos(B, 1));
    const bb = JSON.parse(await B.eval(`JSON.stringify([${R}.ball.px, ${R}.ball.py, ${R}.ball.pz])`));
    const done2 = await B.eval(`${R}.state === 'done'`);
    console.log(`  AI putt: AI n ${aiN0} → ${aiN1}, Bob n ${bobN0} → ${bobN1}, Bob ${done2 ? 'holed' : bb.map(v => v.toFixed(3)).join(', ')}`);
    check(sawKnocked2, "the host's AI putt froze Bob's ball on Bob's screen");
    const aliceN1 = await A.eval(`window.__skyputt.online.game.room.seats[0].cur.n`);
    console.log(`  AI aimed putts: ${await A.eval('window.__aiShots')}, Alice n ${aliceN0} → ${aliceN1}${aliceN1 > aliceN0 ? ' (the AI knocked its host\'s ball on the way)' : ''}`);
    check(aiN1 === aiN0 + await A.eval('window.__aiShots') && bobN1 === bobN0 + 1, 'the AI putts were reported and Bob\'s ball knocked (shot numbers moved on)');
    check(done2 || (near(b1, b2) && near(b2, bb)), 'host, Bob and the server agree where the AI knocked Bob');
    if (aliceN1 > aliceN0) {
      const a1 = JSON.parse(await seatPos(A, 0)), a2 = JSON.parse(await seatPos(B, 0));
      const ab = JSON.parse(await A.eval(`JSON.stringify([${R}.ball.px, ${R}.ball.py, ${R}.ball.pz])`));
      const g = JSON.parse(await B.eval(`JSON.stringify(${R}.peers.get(0).ball.ball.position.toArray())`));
      check(near(a1, a2) && near(a1, ab) && near(ab, g, 1e-4), "the host's own knocked ball: host, Bob's ghost and the server agree");
    }
    await A.eval(`window.__skyputt.online.game.driver.ai = null; true`);
  }
  await sleep(4000);
  await A.shot('a-end'); await B.shot('b-end');
  check(!errors.length, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await A.eval(`window.__skyputt.online.net.leaveRoom().catch(() => {}); true`); await B.eval(`window.__skyputt.online.net.leaveRoom().catch(() => {}); true`);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
(args.ghost ? ghostMain : main)().catch(e => { console.error(e); process.exit(1); });
