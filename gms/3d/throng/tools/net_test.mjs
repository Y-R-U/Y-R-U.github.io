// node tools/net_test.mjs [--duration=120] [--break=counts|migrate|late|bytes|rate|version] [--keep]
// Builds and starts the Go server locally, runs headless clients (tools/net_client.mjs, the real js/net code;
// the host runs the real sim + bots) through a whole match and asserts the online guarantees. Exit 1 on failure.
import { fork, spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const BREAK = args.break || '';
const DUR = +(args.duration || (BREAK ? 60 : 120));
const PORT = 18024 + Math.floor(Math.random() * 40);
const PORT2 = PORT + 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [], notes = [];
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, m) => (cond ? ok(m) : fail(m));
const tmp = mkdtempSync(join(tmpdir(), 'throng-net-'));
const procs = [];
const dev = () => Array.from({ length: 32 }, () => ((Math.random() * 16) | 0).toString(16)).join('');
const cid = (n) => n + Math.random().toString(36).slice(2, 14);

console.log(`THRONG net test: match ${DUR}s${BREAK ? ', break=' + BREAK : ''}`);
const bin = join(tmp, 'throng');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), env: { ...process.env, CGO_ENABLED: '0' }, stdio: 'inherit' });

function startServer(port, extra = {}) {
  const p = spawn(bin, [], {
    env: { ...process.env, THRONG_ADDR: '127.0.0.1:' + port, THRONG_DATA: join(tmp, 'data' + port), THRONG_QUICK_WAIT_MS: '1500', THRONG_MAX_CONNS_PER_IP: '40', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.log = '';
  p.stdout.on('data', (d) => { p.log += d; }); p.stderr.on('data', (d) => { p.log += d; });
  procs.push(p);
  return p;
}
async function waitHealth(port) {
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/gms/3d/throng/api/health`); if (r.ok) return r.json(); } catch {} await sleep(100); }
  throw new Error('server did not start');
}
const srv = startServer(PORT, BREAK === 'rate' ? { THRONG_NO_RATE: '1' } : {});
await waitHealth(PORT);
const url = `ws://127.0.0.1:${PORT}/gms/3d/throng/api/ws`;

function client(name, env = {}) {
  const c = fork(join(ROOT, 'tools/net_client.mjs'), [], { env: { ...process.env, NET_DURATION: String(DUR), ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  c.stderr.on('data', (d) => { c.errs = (c.errs || '') + d; });
  c.stdout.on('data', () => {});
  Object.assign(c, { name, last: null, events: [], waiters: [] });
  c.on('message', (m) => {
    if (m.ev === 'tick') { c.last = m; return; }
    m.at = Date.now();
    c.events.push(m);
    for (const w of c.waiters.slice()) if (w.f(m)) { c.waiters.splice(c.waiters.indexOf(w), 1); w.res(m); }
  });
  c.wait = (f, ms = 15000, what = '') => new Promise((res, rej) => {
    const found = c.events.find(f);
    if (found) return res(found);
    const w = { f, res };
    c.waiters.push(w);
    setTimeout(() => { const i = c.waiters.indexOf(w); if (i >= 0) { c.waiters.splice(i, 1); rej(new Error(`${name}: timed out waiting for ${what}`)); } }, ms);
  });
  c.cmd = (cmd, extra = {}) => { c.send({ cmd, ...extra }); return c.wait((m) => m.ev === 'reply' && m.cmd === cmd && !m.__seen && (m.__seen = true), 10000, cmd); };
  procs.push(c);
  return c;
}

async function connect(c, extra = {}) {
  await c.wait((m) => m.ev === 'ready', 10000, 'ready');
  c.send({ cmd: 'connect', url, name: c.name, dev: dev(), cid: cid(c.name), break: BREAK, ...extra });
  await c.wait((m) => m.ev === 'status' && m.status === 'online', 8000, 'online');
}

// Raw protocol client for the version / rate checks.
function raw(hello, port = PORT) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/gms/3d/throng/api/ws`);
    ws.binaryType = 'arraybuffer';
    const got = [];
    const out = { ws, got, closed: null, opened: false };
    ws.onopen = () => { out.opened = true; if (hello) ws.send(JSON.stringify(hello)); setTimeout(() => resolve(out), 400); };
    ws.onmessage = (e) => { if (typeof e.data === 'string') got.push(JSON.parse(e.data)); };
    ws.onclose = (e) => { out.closed = e.code; };
    ws.onerror = () => { setTimeout(() => resolve(out), 100); };
  });
}
const SIMV = await (async () => { const { CONFIG } = await import('../js/config.js'); CONFIG.MATCH.duration = DUR; const p = await import('../js/net/proto.js'); return p.simVersion(); })();
const MAPV = await (async () => { const p = await import('../js/net/proto.js'); let g; try { g = (await import('../js/world/map.js')).generateMap; } catch { g = (await import('./stub_map.js')).generateMap; } return p.mapVersion(g(1)); })();
const hello = (o = {}) => ({ t: 'hello', v: 1, sim: SIMV, map: MAPV, dev: dev(), cid: cid('raw'), name: 'Raw', ...o });

let exitCode = 0;
try {
  // ------------------------------------------------------------ private room: create → join by code → start
  console.log('\n[room] create, join by code, start');
  const H = client('Alice'), G1 = client('Bob'), G2 = client('Cara');
  await Promise.all([connect(H), connect(G1), connect(G2)]);
  const created = await H.cmd('create');
  const code = created.room.code;
  check(/^[A-Z2-9]{6}$/.test(code), `room code ${code}`);
  const j1 = await G1.cmd('join', { code }), j2 = await G2.cmd('join', { code });
  check(!j1.error && !j2.error && j2.room.members.length === 3, 'two guests joined by code (3 members)');
  const bad = await G2.cmd('join', { code: 'ZZZZZZ' });
  check(bad.error === 'no_room', `unknown code refused (${bad.error})`);

  // version mismatch: a client on another build must not share the room
  const vm = await raw(hello({ sim: BREAK === 'version' ? SIMV : 'other' }));
  vm.ws.send(JSON.stringify({ t: 'join', id: 7, code }));
  await sleep(300);
  const vmErr = vm.got.find((m) => m.id === 7);
  check(vmErr && vmErr.t === 'error' && vmErr.code === 'version_mismatch', `different sim version refused from the room (${vmErr && (vmErr.code || vmErr.t)})`);
  vm.ws.close();
  const old = await raw(hello({ v: BREAK === 'version' ? 1 : 99 }));
  await sleep(300);
  check(old.got.some((m) => m.code === 'old_client') && old.closed === 4002, `different protocol version refused at hello (close ${old.closed})`);

  await H.cmd('start');
  const [bh, b1, b2] = await Promise.all([H.wait((m) => m.ev === 'begin'), G1.wait((m) => m.ev === 'begin'), G2.wait((m) => m.ev === 'begin')]);
  check(bh.role === 'host' && b1.role === 'guest' && b2.role === 'guest', 'creator hosts, joiners are guests');
  check(new Set([bh.me, b1.me, b2.me]).size === 3, `three distinct crowds (${bh.me}, ${b1.me}, ${b2.me})`);
  const humans0 = bh.humans.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  const t0 = Date.now();
  const at = (s) => sleep(Math.max(0, t0 + s * 1000 - Date.now()));

  // ------------------------------------------------------------ late joiner takes over a bot
  await at(Math.min(15, DUR * 0.12));
  console.log('\n[late] a fourth player joins the running match');
  const L = client('Lee');
  await connect(L);
  const jl = await L.cmd('join', { code });
  let bl = null;
  try { bl = await L.wait((m) => m.ev === 'begin', 8000, 'late begin'); } catch (e) { fail(e.message); }
  if (bl) {
    check(bl.late && bl.role === 'guest', 'late joiner gets begin(late) as a guest');
    check(!humans0.includes(bl.me), `late joiner took over bot crowd ${bl.me} (humans were ${humans0.join(',')})`);
    await sleep(1500);
    check(L.last && L.last.counts && L.last.counts[bl.me] > 4, `the bot crowd it took over kept its people (${L.last && L.last.counts && L.last.counts[bl.me]})`);
  }
  if (jl.error) fail('late join failed: ' + jl.error);

  // ------------------------------------------------------------ input flood trips the rate limit
  await at(DUR * 0.3);
  console.log('\n[rate] a guest floods inputs, a raw client floods pings');
  const before = H.last.inputsRecv;
  await sleep(1000);
  const normal = H.last.inputsRecv - before;
  G2.events = G2.events.filter((m) => !(m.ev === 'error' && m.code === 'rate_limited'));
  await G2.cmd('flood', { n: 400 });
  const fb = H.last.inputsRecv;
  await sleep(1000);
  const flooded = H.last.inputsRecv - fb;
  check(flooded < normal + 150, `host received ${flooded} inputs in the flood second (normal ${normal}/s; 400 sent)`);
  const rl = G2.events.some((m) => m.ev === 'error' && m.code === 'rate_limited');
  check(rl, 'the flooding guest was told rate_limited');
  const pf = await raw(hello());
  for (let i = 0; i < 60; i++) pf.ws.send(JSON.stringify({ t: 'ping', c: i }));
  await sleep(500);
  const pongs = pf.got.filter((m) => m.t === 'pong').length;
  check(pongs <= 25 && pf.got.some((m) => m.code === 'rate_limited'), `60 pings at once → ${pongs} pongs + rate_limited`);
  pf.ws.close();

  // ------------------------------------------------------------ kill the host mid-match
  await at(DUR * 0.45);
  console.log('\n[migrate] SIGKILL the host');
  H.send({ cmd: 'samples' });
  const hostSamples = await H.wait((m) => m.ev === 'samples' && !m.__seen && (m.__seen = true), 5000, 'host samples');
  const hostTick = H.last.tick;
  const counts0 = H.last.counts;
  H.kill('SIGKILL');
  const killedAt = Date.now();
  let prom = null;
  try { prom = await G1.wait((m) => m.ev === 'role' && m.role === 'host', 8000, 'promotion'); } catch (e) { fail(e.message); }
  if (prom) check(true, `longest-standing guest promoted after ${Date.now() - killedAt} ms (${prom.why})`);
  await sleep(3000);
  const tickAfter = G2.last && G2.last.tick;
  check(tickAfter > hostTick + 30, `the match moves on after the handover (tick ${hostTick} → ${tickAfter})`);

  // ------------------------------------------------------------ finish
  const endBy = (DUR + 3) * 1000 + 20000;
  const overs = await Promise.allSettled([G1, G2, L].map((c) => c.wait((m) => m.ev === 'over', Math.max(5000, t0 + endBy - Date.now()), 'over')));
  const rows = overs.map((o) => (o.status === 'fulfilled' ? o.value : null));
  check(rows.every(Boolean), 'every remaining client reached the end of the match');
  console.log('\n[end] results and counts');
  if (rows.every(Boolean)) {
    const key = (r) => r.rows.map((x) => `${x.count}/${x.best}/${x.kills}/${x.rank}`).join(' ');
    check(key(rows[0]) === key(rows[1]) && key(rows[1]) === key(rows[2]), `final counts identical on the new host and both guests: ${rows[0].rows.map((x) => x.count).join(',')}`);
  }
  // Per-tick samples: every client that saw a tick saw the same counts.
  const S = {};
  for (const c of [G1, G2, L]) {
    c.send({ cmd: 'samples' });
    const s = await c.wait((m) => m.ev === 'samples' && !m.__seen && (m.__seen = true), 5000, 'samples');
    S[c.name] = s;
  }
  let compared = 0, diff = 0;
  for (const t of Object.keys(S.Cara.samples)) {
    for (const other of ['Bob', 'Lee']) {
      const a = S.Cara.samples[t], b = S[other].samples[t];
      if (!a || !b) continue;
      compared++;
      if (a.join() !== b.join()) diff++;
    }
  }
  check(compared >= 10 && diff === 0, `sampled ticks compared across clients: ${compared}, mismatching ${diff}`);
  // Pedestrians: what each guest reconstructed from deltas vs what the host (old, then new) simulated.
  const hostN = { ...hostSamples.hsamples, ...S.Bob.hsamples };
  let ncmp = 0, nStateBad = 0, nMaxErr = 0;
  for (const who of ['Cara', 'Lee']) {
    for (const [t, g] of Object.entries(S[who].nsamples)) {
      const hs = hostN[t];
      if (!hs) continue;
      ncmp++;
      for (let i = 0; i < hs.state.length; i++) {
        if (hs.state[i] !== g.state[i]) { nStateBad++; continue; }
        if (hs.state[i] === 1) nMaxErr = Math.max(nMaxErr, Math.hypot(hs.x[i] - g.x[i], hs.z[i] - g.z[i]));
      }
    }
  }
  check(ncmp >= 8 && nStateBad === 0 && nMaxErr <= 0.45, `pedestrians rebuilt from deltas: ${ncmp} samples, ${nStateBad} slot states wrong, max position error ${nMaxErr.toFixed(2)} m (budget 0.45)`);
  // Continuity across the host change (Cara's view, 250 ms samples).
  const ser = S.Cara.series;
  let maxJump = 0;
  for (let i = 1; i < ser.length; i++) {
    const a = ser[i - 1], b = ser[i];
    const dt = b.tick - a.tick;
    if (dt <= 0) continue;
    // per 250 ms of SIM time: after a host change the guest catches up several ticks in one sample
    const per = Math.min(1, 7.5 / dt);
    for (let k = 0; k < a.counts.length; k++) if (a.alive[k] && b.alive[k]) maxJump = Math.max(maxJump, Math.abs(b.counts[k] - a.counts[k]) * per);
  }
  let stall = 0;
  for (let i = 0; i < ser.length; i++) {
    let j = i;
    while (j + 1 < ser.length && ser[j + 1].tick === ser[i].tick) j++;
    stall = Math.max(stall, ser[j].t - ser[i].t);
  }
  check(maxJump <= 110, `largest per-crowd count change per 250 ms of sim time (alive) is ${maxJump.toFixed(0)}`);
  notes.push(`host change stall seen by a guest: ${stall} ms`);
  check(stall < 6000, `longest freeze seen by a guest (host killed) ${stall} ms`);
  const preKill = counts0.reduce((a, b) => a + b, 0);
  notes.push(`people in crowds when the host died: ${preKill}`);

  // bandwidth + latency (Cara: a guest from the start; Lee: late joiner)
  for (const c of [G2, L]) {
    const g = c.last.guest, secs = g.secs;
    const kbs = g.bytes / 1024 / secs;
    check(kbs < 15, `${c.name}: snapshot traffic ${kbs.toFixed(2)} kB/s (${g.snaps} snaps, ${g.keys} keys)`);
    notes.push(`${c.name} download ${kbs.toFixed(2)} kB/s, upload ${(c.last.net.sentBin / 1024 / c.last.netSecs).toFixed(2)} kB/s`);
  }
  const lat = G2.last.guest.latency.slice().sort((a, b) => a - b);
  const med = lat[lat.length >> 1], p95 = lat[Math.floor(lat.length * 0.95)];
  check(lat.length > 20 && med < 120, `input → snapshot latency median ${med && med.toFixed(0)} ms, p95 ${p95 && p95.toFixed(0)} ms (localhost)`);
  notes.push(`Cara prediction corrections ${G2.last.guest.corrections}, max error ${G2.last.guest.maxErr.toFixed(2)} m`);
  const hostEnc = G1.last.hostEnc;
  if (hostEnc) notes.push(`new host encoder: ${hostEnc.snaps} snaps + ${hostEnc.keys} keys, ${(hostEnc.bytes / Math.max(1, hostEnc.snaps + hostEnc.keys)).toFixed(0)} B avg, ${(hostEnc.slots / Math.max(1, hostEnc.snaps + hostEnc.keys)).toFixed(1)} pedestrian slots avg`);

  // leaderboard
  const ended = await Promise.allSettled([G1, G2].map((c) => c.wait((m) => m.ev === 'ended', 15000, 'ended')));
  const rec = ended.map((e) => e.status === 'fulfilled' && e.value.recorded);
  const boards = await (await fetch(`http://127.0.0.1:${PORT}/gms/3d/throng/api/boards?period=day&kind=best`)).json();
  const names = boards.rows.map((r) => r.name);
  if (DUR >= 90) {
    check(rec.every(Boolean), 'server confirmed and recorded the result');
    check(names.includes('Bob') && names.includes('Cara') && !names.includes('Lee'), `daily board: ${names.join(', ')} (late joiner not recorded)`);
    const wins = await (await fetch(`http://127.0.0.1:${PORT}/gms/3d/throng/api/boards?period=week&kind=wins`)).json();
    check(Array.isArray(wins.rows), `weekly wins board answers (${wins.rows.length} rows)`);
  } else {
    check(!rec.some(Boolean) && names.length === 0, `a ${DUR}s match is not board-plausible and was not recorded`);
  }

  // ------------------------------------------------------------ quick match + late join by quick
  console.log('\n[quick] two quick-match players share a room; a third joins it running');
  const Q1 = client('Quin', { NET_DURATION: '70' }), Q2 = client('Ravi', { NET_DURATION: '70' }), Q3 = client('Sol', { NET_DURATION: '70' });
  await Promise.all([connect(Q1), connect(Q2), connect(Q3)]);
  const qa = await Q1.cmd('quick'), qb = await Q2.cmd('quick');
  check(qa.room.code === qb.room.code, 'quick match put both in one room');
  const qs = await Promise.all([Q1.wait((m) => m.ev === 'begin', 8000, 'quick begin'), Q2.wait((m) => m.ev === 'begin', 8000, 'quick begin')]);
  check(qs[0].humans.filter(Boolean).length === 2 && qs[0].humans.length === 8, 'lobby timer started the match with 2 humans + 6 bots');
  await sleep(2500);
  const qc = await Q3.cmd('quick');
  check(qc.room.code === qa.room.code, 'a later quick match joins the running room');
  const q3b = await Q3.wait((m) => m.ev === 'begin', 8000, 'quick late begin').catch((e) => fail(e.message));
  if (q3b) check(q3b.late && !qs[0].humans[q3b.me], `quick late joiner took over bot crowd ${q3b.me}`);
  const other = await raw(hello({ sim: 'zzzz' }));
  other.ws.send(JSON.stringify({ t: 'quick', id: 9 }));
  await sleep(400);
  const oq = other.got.find((m) => m.id === 9);
  check(oq && oq.room && oq.room.code !== qa.room.code, 'quick match on another sim version gets its own room');
  other.ws.close();
  for (const c of [Q1, Q2, Q3]) c.kill();

  // ------------------------------------------------------------ per-IP connection cap
  console.log('\n[cap] per-IP connection cap');
  const s2 = startServer(PORT2, { THRONG_MAX_CONNS_PER_IP: BREAK === 'rate' ? '100' : '3' });
  await waitHealth(PORT2);
  const socks = [];
  for (let i = 0; i < 4; i++) socks.push(await raw(hello(), PORT2));
  check(socks.slice(0, 3).every((s) => s.opened) && !socks[3].opened, `4th socket from one IP refused (opened: ${socks.map((s) => s.opened).join(',')})`);
  socks.forEach((s) => { try { s.ws.close(); } catch {} });
  s2.kill();

  const h = await waitHealth(PORT);
  notes.push(`server health at the end: ${JSON.stringify({ conns: h.conns, rooms: h.rooms })}`);
} catch (e) {
  fail('harness: ' + (e && e.stack || e));
} finally {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch {} }
  if (!args.keep) rmSync(tmp, { recursive: true, force: true });
}
console.log('\nnotes:\n  ' + notes.join('\n  '));
if (failures.length && srv.log && args.log) console.log(srv.log.slice(-3000));
console.log(`\n${failures.length ? 'FAIL' : 'PASS'} (${failures.length} failed)${BREAK ? ` break=${BREAK}` : ''}`);
process.exit(failures.length ? 1 : exitCode);
