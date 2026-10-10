#!/usr/bin/env node
// Remote debug log client (js/core/debuglog.js): ring buffer, gating on the server flag, batching, beacon, caps.
// node tools/dbg_test.mjs
import { createDebugLog, dlog, debugOn } from '../js/core/debuglog.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };

function harness({ flag = false } = {}) {
  const posts = [], beacons = [], timers = new Map();
  let clock = 1000, perf = 0, tid = 0, serverFlag = flag, postStatus = null, failNet = false;
  const env = {
    fetch: async (url, body, post) => {
      if (failNet) throw new Error('net');
      if (post) { posts.push(JSON.parse(body)); return { status: postStatus ?? (serverFlag ? 200 : 204) }; }
      return { ok: true, json: async () => ({ level: 0, debugLogs: serverFlag }) };
    },
    beacon: (url, b) => { beacons.push(JSON.parse(b)); return true; },
    now: () => clock, perf: () => perf,
    setTimer: (fn, ms) => { timers.set(++tid, { fn, ms }); return tid; }, clearTimer: t => timers.delete(t),
    statusUrl: '/status', postUrl: '/debuglog', device: 'dev', session: 'ses', build: () => 'B1', ua: 'UA', room: () => 'ROOM1',
  };
  const d = createDebugLog(env);
  return {
    d, posts, beacons, timers,
    set flag(v) { serverFlag = v; }, set postStatus(v) { postStatus = v; }, set failNet(v) { failNet = v; },
    tick: (ms) => { perf += ms; clock += ms; },
    flushTimer: () => [...timers.values()].find(t => t.ms === 3000),
  };
}

// 1. Off: ring only, no network, no timers.
{
  const H = harness();
  for (let i = 0; i < 250; i++) H.d.dlog('clip', 'm' + i, { i });
  ok(H.d.ring.length === 200, 'ring keeps 200');
  ok(H.d.ring[0].msg === 'm50' && H.d.ring[199].msg === 'm249', 'ring drops oldest');
  ok(H.d.queue.length === 0, 'nothing queued while off');
  ok(H.timers.size === 0, 'no timers while off');
  await H.d.flush();
  ok(H.posts.length === 0, 'no posts while off');
  await H.d.check(true);
  ok(!H.d.on && H.timers.size === 0, 'server says off → stays off');
  H.d.beaconAll();
  ok(H.beacons.length === 0, 'no beacon while off');
}

// 2. Switching on (no reload): history first, then live lines, batched by the 3 s timer.
{
  const H = harness();
  for (let i = 0; i < 5; i++) H.d.dlog('listen', 'pre' + i, { i });
  H.flag = true;
  await H.d.check();
  ok(H.d.on, 'server flag on → logging on');
  ok(H.timers.size === 2 && H.flushTimer(), 'flush timer (3 s) + status re-check timer');
  H.d.dlog('clip', 'live', { state: 'running', x: 1.23456 });
  await H.flushTimer().fn();
  ok(H.posts.length === 1, 'one batch');
  const b = H.posts[0];
  ok(b.device === 'dev' && b.session === 'ses' && b.build === 'B1' && b.ua === 'UA' && b.room === 'ROOM1', 'batch envelope');
  ok(b.lines[0].msg === 'pre0' && b.lines[4].msg === 'pre4', 'history comes first');
  const live = b.lines.find(l => l.msg === 'live');
  ok(live && live.data.state === 'running' && live.data.x === 1.235 && live.tag === 'clip' && live.t > 0, 'live line with data');
  ok(b.lines.some(l => l.tag === 'debug' && l.msg === 'on'), 'logs its own switch-on');
  ok(H.d.queue.length === 0, 'queue drained');
  await H.flushTimer().fn();
  ok(H.posts.length === 1, 'empty queue → no post');
}

// 3. Data is snapshotted at dlog time.
{
  const H = harness({ flag: true });
  await H.d.check(true);
  const o = { state: 'suspended' };
  H.d.dlog('ctx', 'state', o);
  o.state = 'running';
  await H.d.flush();
  ok(H.posts.at(-1).lines.at(-1).data.state === 'suspended', 'snapshot, not live reference');
  const big = { s: 'x'.repeat(5000) };
  H.d.dlog('x', 'big', big);
  const circ = {}; circ.self = circ;
  H.d.dlog('x', 'circ', circ);
  H.d.dlog('x', 'err', { e: new Error('boom') });
  await H.d.flush();
  const L = H.posts.at(-1).lines;
  ok(typeof L.find(l => l.msg === 'big').data === 'string' && L.find(l => l.msg === 'big').data.length <= 2001, 'big data cut to a string');
  ok(typeof L.find(l => l.msg === 'circ').data === 'string', 'circular data does not throw');
  ok(L.find(l => l.msg === 'err').data.e.message === 'boom', 'errors serialised');
}

// 4. Batch size caps: ≤ 300 lines and ≤ 56 KB per request.
{
  const H = harness({ flag: true });
  await H.d.check(true);
  for (let i = 0; i < 700; i++) H.d.dlog('t', 'm' + i, { pad: 'y'.repeat(150) });
  await H.d.flush();
  const sizes = H.posts.map(p => JSON.stringify(p).length);
  ok(H.posts.length >= 3, `split into batches (${H.posts.length})`);
  ok(H.posts.every(p => p.lines.length <= 300), 'each batch ≤ 300 lines');
  ok(sizes.every(s => s <= 56000), 'each batch ≤ 56 KB');
  ok(H.posts.flatMap(p => p.lines).filter(l => l.tag === 't').length === 700, 'nothing lost');
}

// 5. Network failure keeps lines for the next tick; server 204 (flag switched off) stops logging.
{
  const H = harness({ flag: true });
  await H.d.check(true);
  H.d.dlog('a', 'one');
  H.failNet = true;
  await H.d.flush();
  ok(H.posts.length === 0 && H.d.queue.length > 0, 'kept after network error');
  H.failNet = false;
  await H.d.flush();
  ok(H.posts.length === 1 && H.posts[0].lines.some(l => l.msg === 'one'), 'retried');
  H.flag = false;
  H.d.dlog('a', 'two');
  await H.d.flush();
  ok(!H.d.on && H.timers.size === 0, 'a 204 switches the client off and clears timers');
  H.d.dlog('a', 'three');
  ok(H.d.queue.length === 0, 'off again → queue empty');
}

// 6. Periodic status check while on notices the flag going off.
{
  const H = harness({ flag: true });
  await H.d.check(true);
  H.flag = false;
  await [...H.timers.values()].find(t => t.ms === 60000).fn();
  ok(!H.d.on, 'status re-check switches off');
}

// 7. Throttle: unforced checks at most once a minute.
{
  const H = harness();
  let n = 0;
  const f = H.d.check;
  await H.d.check(); n = H.d.stats.checks;
  await H.d.check(); await H.d.check();
  ok(H.d.stats.checks === n, 'throttled within a minute');
  H.tick(61000);
  await H.d.check();
  ok(H.d.stats.checks === n + 1, 'checks again after a minute');
  void f;
}

// 8. Beacon on pagehide sends what's queued.
{
  const H = harness({ flag: true });
  await H.d.check(true);
  H.d.dlog('page', 'x');
  H.d.beaconAll();
  ok(H.beacons.length === 1 && H.beacons[0].lines.some(l => l.msg === 'x') && H.d.queue.length === 0, 'beacon');
}

// 9. Forced (?debug=1) stays on even when the server says off.
{
  const H = harness();
  H.d.force(true);
  ok(H.d.on, 'forced on');
  await H.d.check(true);
  ok(H.d.on, 'server off does not turn a forced client off');
}

// 10. The module's own browserless instance is inert in node.
dlog('node', 'hello', { a: 1 });
ok(debugOn() === false, 'default instance off in node');
ok(globalThis.__cluedDbg.ring.at(-1).msg === 'hello', 'default instance rings');

console.log(fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
