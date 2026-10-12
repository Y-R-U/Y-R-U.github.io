#!/usr/bin/env node
/**
 * The online client fixes from the 2026-10-13 netcode review (fixer F2), in node:
 *   overSnap / eliminate   a quit during the knockout slow-mo cannot change the result (H3)
 *   hitstop / buffer / ack prediction agrees with the master (M1); the campaign keeps its hit-stop
 *   stall / hide           a frozen or hidden master is reported, not waited out (H1)
 *   tie / hill / rest      LMS time-up ties, standing on the hill, the bandana clear of the stick
 *   focus / arrows         the objective stays on screen, or an arrow points at it (M4)
 *   left / bots / connect  'N LEFT' in respawn modes, ?bots=0, a WebSocket that throws
 *
 *   node tools/netfixgate.mjs
 *   node tools/netfixgate.mjs --falsify    undo each fix; its section must go red
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../js');
const JS = process.env.NETFIX_JS || SRC;

if (process.argv.includes('--falsify')) {
  const MUTANTS = [
    ['overSnap', 'net/fight.js', 'this.overSnap = this.overSnap || s;', 'this.overSnap = s;'],
    ['eliminate', 'net/fight.js', 'eliminate(slot) { if (!this.over) Modes.eliminate(this, slot); }', 'eliminate(slot) { Modes.eliminate(this, slot); }'],
    ['hitstop', 'net/fight.js', '    this.fx.hitstop = 0;\n    super.update(dt, null);', '    super.update(dt, null);'],
    ['hitstop', 'match.js', '    if (this.fx.hitstop > 0) {\n      this.fx.update', '    if (this.fx.hitstop > 0 && false) {\n      this.fx.update'],
    ['buffer', 'net/fight.js', 'else if (!f.dead) (this.strikeQ = this.strikeQ || {})[slot] = this.time + STRIKE_BUFFER;', ''],
    ['buffer', 'net/fight.js', 'else this.strikeAt = this.predT + STRIKE_BUFFER;', ''],
    ['ack', 'net/fight.js', 'const at = sent != null ? sent + INPUT_MS / 2 : now - this.rtt();', 'const at = now - this.rtt();'],
    ['stall', 'net/fight.js', '    if (!this.isMaster) this.watchMaster(now);\n', ''],
    ['stall', 'net/fight.js', '      this.client.stall(this.matchId, 0);', ''],
    ['hide', 'net/client.js', '{ if (!this.hidden) this._resume(); return; }', '{ this._resume(); return; }'],
    ['hide', 'net/client.js', '    this.ws.close(4001);', ''],
    ['connect', 'net/client.js', '    this._connecting = threw ? null : p;', '    this._connecting = p;'],
    ['tie', 'net/modes.js', '      for (const f of alive) if (Math.round(f.hp * 10) === top) place[f.slot] = 1;', ''],
    ['tie', 'net/modes.js', '  if (winner < 0) for (const s of leaders) place[s] = 1;', ''],
    ['hill', 'net/modes.js', 'export const onHill = (f, z) => f.onGround && ', 'export const onHill = (f, z) => '],
    ['hill', 'net/modes.js', 'Math.abs(f.rag.x[P.PELVIS] - z.x) <= z.w / 2;', 'Math.abs(f.x - z.x) <= z.w / 2 + 30;'],
    ['rest', 'net/modes.js', 'if (b.x < REST_LO) b.vx', 'if (false) b.vx'],
    ['focus', 'match.js', '    if (this.focusPoints) pts.push(...this.focusPoints());\n', ''],
    ['arrows', 'net/modes.js', '  drawEdgeArrows(ctx, vw, vh, m);\n', ''],
    ['left', 'ui.js', 'm.modeDef?.respawn ? \'\' : ', ''],
    ['bots', 'net/panel.js', 'return Number.isFinite(n) ? Math.max(1, Math.min(7, n)) : 3;', 'return n || 3;'],
  ];
  let bad = 0;
  for (const [section, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'netfix-'));
    cpSync(SRC, tmp, { recursive: true });
    const p = join(tmp, file);
    const src = readFileSync(p, 'utf8');
    if (!src.includes(from)) { console.log(`STALE mutant [${section}] ${file}: "${from.slice(0, 60)}"`); bad++; rmSync(tmp, { recursive: true, force: true }); continue; }
    writeFileSync(p, src.replace(from, to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, NETFIX_JS: tmp }, encoding: 'utf8' });
    rmSync(tmp, { recursive: true, force: true });
    const red = new Set((r.stdout.match(/^FAIL \[([\w-]+)\]/gm) || []).map((l) => l.slice(6, -1)));
    const killed = red.has(section);
    if (!killed) bad++;
    console.log(`${killed ? 'red ' : 'SURVIVED'}  [${section}] ${file}: ${from.slice(0, 70).replace(/\n/g, '⏎')}${!killed ? `  (red: ${[...red].join(',') || 'none'}; ${r.stderr.split('\n').find((l) => /Error/.test(l)) || ''})` : ''}`);
  }
  console.log(bad ? `\n${bad} mutant(s) survived` : `\nall ${MUTANTS.length} mutants turned their section red`);
  process.exit(bad ? 1 : 0);
}

// ── stubs ──────────────────────────────────────────────────────────────
const texts = [];
const ctx = new Proxy({}, {
  get: (t, k) => k === 'canvas' ? { width: 0, height: 0 } : k === 'measureText' ? () => ({ width: 10 })
    : k === 'fillText' ? (s) => texts.push(String(s)) : () => ({ addColorStop() {} }),
  set: () => true,
});
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }), fonts: { ready: Promise.resolve() },
  getElementById: () => null, addEventListener() {}, querySelector: () => null };
globalThis.window = globalThis;
globalThis.location = { search: '', hostname: 'node', origin: 'http://node', pathname: '/', protocol: 'http:' };
let sockets = [], wsThrows = false;
class FakeWS {
  constructor(url) { if (wsThrows) throw new Error('blocked'); this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
  send(m) { this.sent.push(m); }
  close(code) { this.closed = code; this.readyState = 3; this.onclose?.({ code }); }
  open(msg) { this.readyState = 1; this.onmessage({ data: JSON.stringify(msg) }); }
}
globalThis.WebSocket = FakeWS;

const imp = (f) => import(pathToFileURL(join(JS, f)).href);
const { PvpMatch, pvpSave, arenaLevel, NetFight } = await imp('net/fight.js');
const Modes = await imp('net/modes.js');
const W = await imp('net/wire.js');
const { ArenaClient } = await imp('net/client.js');
const { Match } = await imp('match.js');
const { drawHUD } = await imp('ui.js');
const { SHEET_W, GROUND_Y, WALL_PAD, LEVELS } = await imp('config.js');
const { P } = await imp('ragdoll.js');

let pass = 0, fail = 0;
const ok = (section, n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} [${section}] ${n}${x ? '  ' + x : ''}`); };
const STEP = 1 / 120, ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const make = (mode, n, seed = 5) => {
  const m = new PvpMatch({ level: { ...arenaLevel(seed, mode) }, saves: Array.from({ length: n }, () => pvpSave(ALL)),
    you: 0, seats: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), mode, seed });
  m.aspect = 844 / 390;
  m.begin();
  run(m, 3.05);
  return m;
};
function run(m, secs, each) { for (let i = 0; i < Math.round(secs * 120); i++) { if (each) each(i); m.update(STEP); } }
const count = (f) => { f.starts = 0; const o = f.beginAttack.bind(f); f.beginAttack = (...a) => { f.starts++; return o(...a); }; return f; };

/** A stub arena connection, recording what a NetFight tells the server. */
function stubClient(rtt = 0) {
  const c = { reports: [], stalls: [], sent: 0, handlers: {} };
  Object.assign(c, {
    on: (e, f) => { c.handlers[e] = f; }, off() {}, send() { c.sent++; }, pingLinks() {}, sendRtts() {},
    link: () => ({ rtt, direct: true, rttN: 3 }),
    report: (...a) => c.reports.push(a), stall: (match, ms) => c.stalls.push(ms),
  });
  return c;
}
const GO = (mode = 'duel', you = 1) => ({ mode, match: 'm1', round: 1, you, master: 0, arena: 3, score: [0, 0],
  seats: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, ...(mode === 'duel' ? [] : [{ id: 'c', name: 'C' }])] });
const snapOf = (m, seq, t) => W.unSnap(W.snap(seq, t, m.phase, m.clock, m.timeUp,
  m.all.map((f, i) => ({ slot: i, f, ack: 0, score: m.scores[i], cds: new Array(8).fill(0) })), m.projectiles,
  { mode: Modes.MODES[m.modeId].id, overtime: m.overtime, obj: m.obj }));

// ── H3: the knockout slow-mo is frozen ─────────────────────────────────
{
  const m = make('lms', 3);
  m.all[2].hp = 0; m.all[2].dead = true; m.all[1].hp = 0; m.all[1].dead = true;
  run(m, 0.05);
  const v = m.verdict;
  ok('eliminate', 'the round finished with a winner', m.over && v && v.winner === 0, JSON.stringify(v));
  const hp0 = m.all[0].hp;
  m.eliminate(0);   // the winner quits during the slow-mo
  ok('eliminate', 'an elimination after the end changes nothing on the master', !m.all[0].gone && !m.all[0].dead && m.all[0].hp === hp0, `gone ${m.all[0].gone}, hp ${hp0} -> ${m.all[0].hp}`);
}
{
  const cl = stubClient();
  const g = new NetFight({ client: cl, go: GO('lms'), loadout: ALL });
  const m = make('lms', 3);
  m.all[2].hp = 0; m.all[2].dead = true; m.all[1].hp = 0; m.all[1].dead = true;
  run(m, 0.05);
  const s1 = snapOf(m, 1, 10);
  // An old master (or a buggy one) shows the winner leaving in a LATER end-of-round snapshot.
  Object.assign(m.all[0], { gone: true, dead: true, hp: 0 });
  const s2 = snapOf(m, 2, 10.033);
  g.onSnap(s1); g.onSnap(s2);
  g.guestEnd();
  const r = cl.reports[0];
  ok('overSnap', 'the guest reports the FIRST end-of-round snapshot (winner 0)', r && r[2] === 0, JSON.stringify(r));
  g.destroy();
}

// ── M1: hit-stop is a picture online, a pause offline ──────────────────
{
  const m = make('duel', 2);
  const t0 = m.time;
  m.fx.stop(0.1);
  run(m, 0.05);
  ok('hitstop', 'online: the sim runs through a hit-stop', m.time - t0 > 0.04, `${(m.time - t0).toFixed(3)} s of fight time in 0.05 s`);
  ok('hitstop', 'and the stop is still there to hold the picture, then runs out', m.fx.hitstop > 0.03 && m.fx.hitstop < 0.06, m.fx.hitstop.toFixed(3));
  run(m, 0.1);
  ok('hitstop', 'it runs out', m.fx.hitstop <= 0, m.fx.hitstop.toFixed(3));
  const levels = typeof LEVELS === 'function' ? LEVELS() : LEVELS;
  const c = new Match({ level: levels[0], save: { ...pvpSave([0]), perks: {}, moves: {} } });
  for (let i = 0; i < 400; i++) c.update(STEP, null);
  const ct0 = c.time;
  c.fx.stop(0.1);
  for (let i = 0; i < 6; i++) c.update(STEP, null);
  ok('hitstop', 'the campaign still freezes on a hit-stop', c.time === ct0, `${(c.time - ct0).toFixed(3)}`);
}

// ── M1: a tap just before a swing ends lands, on both screens ──────────
{
  const len = (() => { const m = make('duel', 2); const f = m.all[0]; f.strike(); let n = 0; while (f.attack && n < 600) { m.update(STEP); n++; } return n * STEP; })();
  const m = make('duel', 2);
  const f = count(m.all[0]);
  m.all[1].place(f.x + 400, GROUND_Y);
  m.act(0, W.ACT.STRIKE);
  run(m, len - 0.08);
  m.act(0, W.ACT.STRIKE);   // still busy: 80 ms left
  run(m, 0.2);
  ok('buffer', 'master: a strike 80 ms before the last one ends still swings', f.starts === 2, `swing ${len.toFixed(2)} s, starts ${f.starts}`);
  run(m, 1);
  m.act(0, W.ACT.STRIKE);
  run(m, len - 0.3);
  const before = f.starts;
  m.act(0, W.ACT.STRIKE);   // 300 ms early: too early, dropped
  run(m, 0.5);
  ok('buffer', 'but not one tapped long before (300 ms)', f.starts === before, `${before} -> ${f.starts}`);

  const cl = stubClient();
  const g = new NetFight({ client: cl, go: GO('duel', 1), loadout: ALL });
  const mp = g.match;
  mp.phase = W.PHASE.FIGHT;
  g.authority = false;
  const me = count(mp.player);
  mp.enemies[0].place(me.x + 400, GROUND_Y);
  g.localAct(W.ACT.STRIKE);
  for (let t = 0; t < len - 0.08; t += 1 / 60) g.stepGuest(1 / 60, performance.now(), { moveX: 0, block: false, acts: [] });
  g.localAct(W.ACT.STRIKE);
  for (let t = 0; t < 0.2; t += 1 / 60) g.stepGuest(1 / 60, performance.now(), { moveX: 0, block: false, acts: [] });
  ok('buffer', 'guest prediction: the same tap swings too', me.starts === 2, `starts ${me.starts}`);
  g.destroy();
}

// ── M1: correct against what the master had applied (ack), not "now - ping" ─
{
  const cl = stubClient(150);
  const g = new NetFight({ client: cl, go: GO('duel', 1), loadout: ALL });
  const mp = g.match, me = mp.player;
  g.authority = false;
  g.hist = [{ t: 1000, x: 500, y: GROUND_Y }, { t: 1100, x: 600, y: GROUND_Y }, { t: 1200, x: 700, y: GROUND_Y }, { t: 1300, x: 800, y: GROUND_Y }];
  g.sentAt.set(7, 1100 - 1000 / 60);   // input 7 went out just before t=1100; the master had been on it ~half an interval
  const m = make('duel', 2);
  m.all[1].place(600, GROUND_Y);
  const s = snapOf(m, 1, 5);
  s.fighters[1].ack = 7; s.fighters[1].mode = 'live';
  me.x = 800;
  g.reconcile(s, 1300);
  ok('ack', 'a snapshot that matches our past position at its ack corrects nothing', g.corr === 0 && g.m.reseeds === 0, `corr ${g.corr.toFixed(1)}, reseeds ${g.m.reseeds}`);
  g.destroy();
}

// ── H1: a quiet master is reported; a hidden master hangs up ───────────
{
  const cl = stubClient();
  const g = new NetFight({ client: cl, go: GO('duel', 1), loadout: ALL });
  const m = make('duel', 2);
  const s = snapOf(m, 1, 5);
  const now = performance.now();
  g.onSnap(s);
  g.match.phase = W.PHASE.FIGHT;
  g.buf[g.buf.length - 1].recv = now - 3500;
  g.step(1 / 60, null);
  ok('stall', 'a guest 3.5 s without a snapshot tells the server', cl.stalls.length === 1 && cl.stalls[0] >= 3000, JSON.stringify(cl.stalls));
  g.step(1 / 60, null);
  ok('stall', 'not every frame', cl.stalls.length === 1);
  g.stallSent -= 2100;
  g.step(1 / 60, null);
  ok('stall', 'but again while it lasts', cl.stalls.length === 2);
  g.buf[g.buf.length - 1].recv = performance.now();
  g.step(1 / 60, null);
  ok('stall', 'and ms 0 once the master is back', cl.stalls.at(-1) === 0, JSON.stringify(cl.stalls));
  g.destroy();
}
{
  sockets = [];
  const c = new ArenaClient('http://node/arena');
  const p = c.connect({ name: 'x' });
  sockets[0].open({ t: 'welcome', id: 'me', tok: 'tk', grace: 10000 });
  await p;
  sockets[0].onmessage({ data: JSON.stringify({ t: 'go', match: 'm1' }) });
  c.hide();
  ok('hide', 'hidden while running a fight: the socket closes with 4001', sockets[0].closed === 4001, String(sockets[0].closed));
  await sleep(500);
  ok('hide', 'and stays closed while hidden (no resume)', sockets.length === 1, `${sockets.length} sockets`);
  c.show();
  await sleep(500);
  ok('hide', 'visible again: it resumes the seat with its token', sockets.length === 2 && /id=me&tok=tk/.test(sockets[1].url), sockets[1]?.url || 'none');
  c.wantOpen = false;
}
{
  sockets = [];
  const c = new ArenaClient('http://node/arena');
  wsThrows = true;
  let threw = false;
  try { await c.connect({}); } catch { threw = true; }
  wsThrows = false;
  const p2 = c.connect({});
  ok('connect', 'a WebSocket that throws does not poison the next connect', threw && sockets.length === 1, `${sockets.length} sockets made`);
  sockets[0]?.open({ t: 'welcome', id: 'me', tok: 't' });
  await p2.catch(() => {});
  c.wantOpen = false;
}

// ── ties, the hill, the bandana's resting place ────────────────────────
{
  const view = (hps, timeUp = true) => ({ mode: 'lms', timeUp, overtime: false, holder: -1, fighters: hps.map((hp, i) => ({ slot: i, hp, dead: hp <= 0, gone: false, out: hp <= 0 ? 1 : 0, score: 0 })) });
  const v = Modes.verdict(view([50, 50, 20, 0]));
  ok('tie', 'LMS time-up tie: a draw, the tied pair share first', v.winner === -1 && v.place[0] === 1 && v.place[1] === 1 && v.place[2] === 3 && v.place[3] === 4, JSON.stringify(v));
  const h = Modes.verdict({ mode: 'hill', timeUp: true, overtime: true, holder: -1, fighters: [10, 10, 3].map((sc, i) => ({ slot: i, hp: 100, dead: false, gone: false, out: 0, score: sc })) });
  ok('tie', 'hill tie after overtime: the tied leaders share first', h.winner === -1 && h.place[0] === 1 && h.place[1] === 1 && h.place[2] === 3, JSON.stringify(h));
}
{
  const m = make('hill', 2, 3);
  const z = m.obj, [a, b] = m.all;
  b.place(200, GROUND_Y); b.vx = 0;
  a.place(z.x, GROUND_Y); a.vx = 0;
  run(m, 0.5);
  const s0 = m.scores[0];
  run(m, 1);
  ok('hill', 'standing on the ledge scores', m.scores[0] - s0 > 0.9, (m.scores[0] - s0).toFixed(2));
  let air = 0, scored = 0;
  for (let i = 0; i < 600; i++) {
    if (a.onGround && a.canAct) a.jump();
    const before = m.scores[0];
    m.update(STEP);
    if (!a.onGround) { air++; if (m.scores[0] > before) scored++; }
  }
  ok('hill', 'bunny-hopping over it scores nothing while airborne', air > 100 && scored === 0, `${scored}/${air}`);
  a.place(z.x + z.w / 2 + 22, GROUND_Y); a.vx = 0;
  run(m, 0.3);
  const s1 = m.scores[0];
  run(m, 1);
  ok('hill', 'pelvis past the edge does not hold it', a.rag.x[P.PELVIS] - z.x > z.w / 2 ? m.scores[0] === s1 : true, `pelvis ${(a.rag.x[P.PELVIS] - z.x).toFixed(0)} from centre, +${(m.scores[0] - s1).toFixed(2)}`);
}
{
  const m = make('bandana', 2, 3);
  m.all[0].place(SHEET_W / 2 - 100, GROUND_Y); m.all[1].place(SHEET_W / 2 + 100, GROUND_Y);
  const rests = [];
  for (const [x, vx] of [[WALL_PAD, -300], [SHEET_W - WALL_PAD, 300]]) {
    Object.assign(m.obj, { holder: -1, x, y: GROUND_Y - 200, vx, vy: 0, grabT: 9, lastT: 0, last: -1 });
    for (let i = 0; i < 120 * 4; i++) { m.obj.grabT = 9; m.update(STEP); }
    rests.push(m.obj.x);
  }
  ok('rest', 'a bandana knocked to either wall rolls back out', rests[0] >= Modes.REST_LO - 10 && rests[1] <= Modes.REST_HI + 10, rests.map(Math.round).join(', '));
  // Where that is on a screen at the widest the crowd camera goes, clamped to the wall.
  for (const [vw, vh] of [[844, 390], [667, 375], [740, 360], [1024, 768]]) {
    const camH = Math.min(1250, Math.max(720, (SHEET_W - 2 * WALL_PAD + 260) / (vw / vh)));
    const scale = vh / camH, r = Math.min(84, vh * 0.21);
    const sx = (Math.min(...rests.map((x) => Math.min(x, SHEET_W - x))) + 90) * scale;
    ok('rest', `${vw}x${vh}: it rests clear of the thumb-stick`, sx > 2 * r + 26 + 4, `${Math.round(sx)} px vs stick edge ${Math.round(2 * r + 26)}`);
  }
}

// ── M4: the objective in shot ───────────────────────────────────────────
{
  const m = make('bandana', 2, 3);
  m.all[0].place(1300, GROUND_Y); m.all[1].place(1450, GROUND_Y);
  Object.assign(m.obj, { holder: -1, x: 450, y: GROUND_Y - 8, vx: 0, vy: 0, grabT: 99 });
  for (let i = 0; i < 360; i++) { m.obj.grabT = 99; m.all.forEach((f) => { f.vx = 0; }); m.update(STEP); }
  const camW = (m.camH || 700) * m.aspect;
  ok('focus', 'a loose bandana far from the fight is in shot', m.obj.x > m.camX - camW / 2 && m.obj.x < m.camX + camW / 2, `bandana ${m.obj.x}, view ${Math.round(m.camX - camW / 2)}..${Math.round(m.camX + camW / 2)}`);
  const h = make('hill', 2, 3);
  h.all[0].place(400, GROUND_Y); h.all[1].place(500, GROUND_Y);
  Object.assign(h.obj, { x: 450, next: 1350, t: 3 });
  for (let i = 0; i < 300; i++) { h.all.forEach((f) => { f.vx = 0; }); h.obj.t = 3; h.update(STEP); }
  const hw = (h.camH || 700) * h.aspect;
  ok('focus', 'the next hill is in shot during its warning', 1350 < h.camX + hw / 2, `view ..${Math.round(h.camX + hw / 2)}`);
}
{
  const m = make('bandana', 2, 3);
  Object.assign(m.obj, { holder: -1, x: 200, y: GROUND_Y - 8 });
  m.camX = 1400; m.camH = 500; m.edgeArrows = 0;
  Modes.drawModeHUD(ctx, 844, 390, m);
  ok('arrows', 'an objective the camera still misses gets an edge arrow', m.edgeArrows === 1, String(m.edgeArrows));
}

// ── HUD copy, practice bots ────────────────────────────────────────────
{
  const hud = (mode) => { const m = make(mode, 4); texts.length = 0; drawHUD(ctx, 844, 390, m, m.hudSave || pvpSave([0]), null); return texts.join(' | '); };
  const b = hud('bandana'), l = hud('lms');
  ok('left', "respawn modes do not count 'N LEFT'", !/\d+ LEFT/.test(b), b.slice(0, 120));
  ok('left', 'Last Man Standing still does', /3 LEFT/.test(l), l.slice(0, 120));
}
{
  const { practiceBots } = await imp('net/panel.js');
  const got = ['0', '-2', null, '', '3', '9', 'x'].map(practiceBots);
  ok('bots', '?bots=0 -> 1 (a room of one is already won), none -> 3, clamps to 7', JSON.stringify(got) === '[1,1,3,3,3,7,3]', JSON.stringify(got));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
