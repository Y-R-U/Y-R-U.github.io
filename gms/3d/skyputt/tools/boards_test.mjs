#!/usr/bin/env node
// Online boards (boards agent) client checks, headless, against the local dev server:
//   tools/server_run.sh --bg   (:8098, dev auth)   then   node tools/boards_test.mjs [--server=<base>]
//  1. server/dailypool.json + the Go cross-check fixture are fresh (tools/daily_pool.mjs --check)
//  2. js/net/boards.js: roundIdFor / roundList
//  3. against the server: feature detection, daily submit (today's real pick) → board, my rank, best-of-3,
//     resend, refusals not queued, offline queue + flush, friends scope, course-round submit → week / all-time
//  4. fallbacks: no server / older server without boards / a 404 → available() false, no throws
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };

const { createBoards, roundIdFor, roundList } = await import('../js/net/boards.js');
const { SkyputtNet } = await import('../js/net/net.js');
const { COURSES } = await import('../js/course/holes/index.js');
const { dailyFor } = await import('../js/daily/daily.js');
const { localYmd } = await import('../js/events/calendar.js');
const { weekKey } = await import('../js/meta/ladder.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const BASE = (args.server || 'http://127.0.0.1:8098/gms/3d/skyputt').replace(/\/$/, '');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else fails++; console.log(c ? '  ok  ' : '  FAIL', msg); };
const section = s => console.log('\n' + s);
const run = Math.random().toString(36).slice(2, 7);   // fresh uids each run (the dev DB keeps rows)
const player = (uid, name) => { const n = new SkyputtNet(); n._opts.devUser = { uid: `${uid}${run}`, name, signed: true }; return createBoards({ net: n, base: BASE }); };

// ---------------------------------------------------------------- 1
section('pool + fixture');
const chk = spawnSync(process.execPath, [fileURLToPath(new URL('./daily_pool.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
ok(chk.status === 0, `daily_pool --check: ${chk.stdout.trim()}`);

// ---------------------------------------------------------------- 2
section('roundIdFor / roundList');
ok(roundIdFor(COURSES.sky, 0, 9) === 'front' && roundIdFor(COURSES.sky, 9, 18) === 'back', 'sky nines');
ok(roundIdFor(COURSES.festival, 0, COURSES.festival.holes.length) === 'all', 'a course without nines = all');
ok(roundIdFor(COURSES.sky, 3, 6) === null && roundIdFor(COURSES.festival, 2, 9) === null, 'partial runs are not rounds');
const rl = roundList([COURSES.sky, COURSES.festival]);
ok(rl.length === 3 && rl[0].name === 'Sky Isles · Front nine' && rl[2].round === 'all' && rl[0].par === COURSES.sky.holes.slice(0, 9).reduce((a, h) => a + h.par, 0), 'roundList');

// ---------------------------------------------------------------- 3
section(`server ${BASE}`);
const alice = player('alice', 'Alice'), bob = player('bob', 'Bob'), cat = player('cat', 'Cat');
const up = await alice.available();
ok(up, 'available() — health says boards');
if (!up) { console.log(`\n  server down or old (start tools/server_run.sh --bg) — ${passes} passed, ${fails + 1} FAILED`); process.exit(1); }

const day = localYmd(Date.now()), ch = dailyFor(day), par = ch.hole.par;
const body = (t, strokes, extra = {}) => ({ day, hole: ch.hole.id, twist: ch.twist.id, try: t, strokes, gems: 0, ms: 30000, ...extra });
let r = await alice.submitDaily(body(1, par + 1, { name: 'Alice' }));
ok(r?.ok && r.improved && r.name === 'Alice', `alice try 1 on ${day} ${ch.hole.id} (${ch.twist.id}): ${JSON.stringify(r)}`);
r = await alice.submitDaily(body(2, 1, { name: 'Alice' }));
ok(r?.ok && r.improved, 'alice try 2 improves to an ace');
r = await alice.submitDaily(body(2, 1, { name: 'Alice' }));
ok(r?.ok && r.dup, 'resend of try 2 = dup, no error');
await bob.submitDaily(body(1, par, { name: 'Bob' }));
let b = await bob.dailyBoard({ day, hole: ch.hole.id });
const mine = b.rows.filter(x => x.name === 'Alice' || x.name === 'Bob');
ok(b.me?.name === 'Bob' && b.me.rank > (b.rows.find(x => x.name === 'Alice')?.rank ?? 99), `bob's rank below alice (me #${b.me?.rank} of ${b.total})`);
ok(mine.length >= 2 && !JSON.stringify(b).includes('@'), 'names shown, no emails');
r = await alice.submitDaily(body(3, par, { hole: 'sky1' === ch.hole.id ? 'sky2' : 'sky1' }));
ok(r && !r.ok && (r.code === 'bad_hole' || r.code === 'bad_twist'), `wrong hole refused (${r?.code})`);
r = await alice.submitDaily(body(3, par + 9));
ok(r && !r.ok && r.code === 'bad_strokes', 'strokes over par + 4 refused');
ok(alice.pending().length === 0, 'refusals are not queued');

// offline: the POST fails → queued; flush later sends it
const realFetch = globalThis.fetch;
globalThis.fetch = (url, o) => (o?.method === 'POST' ? Promise.reject(new TypeError('network down')) : realFetch(url, o));
r = await cat.submitDaily(body(1, par + 2, { name: 'Cat' }));
globalThis.fetch = realFetch;
ok(r && !r.ok && r.code === 'offline' && cat.pending().length === 1, 'offline submit queued');
await cat.flush();
ok(cat.pending().length === 0, 'flush sent the queue');
b = await cat.dailyBoard({ day, hole: ch.hole.id });
ok(b.me?.name === 'Cat' && b.me.strokes === par + 2, 'queued result is on the board');
b = await cat.dailyBoard({ day, hole: ch.hole.id, scope: 'friends' });
ok(b.scope === 'friends' && b.rows.length === 1 && b.rows[0].name === 'Cat', 'friends scope with no online rounds = just me');

// course rounds
const week = weekKey(Date.now()), sky = COURSES.sky, front = sky.holes.slice(0, 9).map(h => h.par);
r = await alice.submitRound({ course: 'sky', round: 'front', week, scores: front, name: 'Alice' });
ok(r?.ok && r.strokes === front.reduce((a, x) => a + x, 0), `round submit (week ${week}): ${JSON.stringify(r)}`);
r = await bob.submitRound({ course: 'sky', round: 'front', week, scores: front.map((x, i) => (i ? x : 1)), name: 'Bob' });
b = await alice.roundBoard({ course: 'sky', round: 'front', week });
ok(b.me?.name === 'Alice' && b.rows.findIndex(x => x.name === 'Bob') < b.rows.findIndex(x => x.name === 'Alice'), `week board: bob above alice (alice #${b.me?.rank})`);
b = await alice.roundBoard({ course: 'sky', round: 'front', week: 'all' });
ok(b.me?.name === 'Alice' && b.week === 'all', 'all-time board');
r = await alice.submitRound({ course: 'sky', round: 'front', week, scores: front.slice(1) });
ok(r && !r.ok && r.code === 'bad_scores', 'short scorecard refused');

// ---------------------------------------------------------------- 4
section('fallbacks');
const none = createBoards({ net: new SkyputtNet(), base: 'http://127.0.0.1:9/gms/3d/skyputt' });
ok(await none.available() === false, 'no server → unavailable');
ok(await none.submitDaily(body(1, 2)) === null && none.pending().length === 0, 'submit with no server → null, nothing queued');
globalThis.fetch = (url, o) => (String(url).endsWith('/api/health') ? Promise.resolve(new Response(JSON.stringify({ ok: true, name: 'skyputt', protocol: 1 }), { status: 200 })) : realFetch(url, o));
const old = player('old', 'Old');
ok(await old.available() === false, 'older server (health without boards) → unavailable');
globalThis.fetch = realFetch;
const four = player('four', 'Four');
await four.available();
globalThis.fetch = (url, o) => (String(url).includes('/api/daily') ? Promise.resolve(new Response('{"code":"not_found"}', { status: 404 })) : realFetch(url, o));
let threw = null;
try { await four.dailyBoard({ day, hole: ch.hole.id }); } catch (e) { threw = e; }
globalThis.fetch = realFetch;
ok(threw?.status === 404 && await four.available() === false, 'a 404 → unavailable from then on');

console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASS'} (${passes} passed)`);
process.exit(fails ? 1 : 0);
