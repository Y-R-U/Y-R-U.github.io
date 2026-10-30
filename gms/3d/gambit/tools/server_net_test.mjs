// Drives js/app/net.js (the real client module) against a running local server:
//   tools/server_run.sh --bg && node tools/server_net_test.mjs [http://127.0.0.1:8094/gms/3d/gambit]
// Two dev players: lobby feed, private room, a full game to checkmate, clocks, draw/rematch,
// reconnect + resume, allowance and leaderboard. Exits 1 on the first failure.
import { GambitNet, CHEAT_WARNING } from '../js/app/net.js';

const base = process.argv[2] || 'http://127.0.0.1:8094/gms/3d/gambit';
const run = Math.random().toString(36).slice(2, 7);
let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ok  ', msg); else { fails++; console.log('  FAIL', msg); } };
const once = (n, type, pred = () => true, ms = 4000) => new Promise((res, rej) => {
  const t = setTimeout(() => { off(); rej(new Error('timeout waiting for ' + type)); }, ms);
  const off = n.on(type, d => { if (pred(d)) { clearTimeout(t); off(); res(d); } });
});

const a = new GambitNet(), b = new GambitNet();
const wa = await a.connect({ base, devUser: { uid: 'nt-a-' + run, name: 'Ann' } });
const wb = await b.connect({ base, devUser: { uid: 'nt-b-' + run, name: 'Ben' } });
ok(wa.you.name === 'Ann' && wb.you.anon === true, 'connect + welcome');
ok(a.allowance.tier === 'anon' && a.allowance.remaining === 2, `guest allowance ${JSON.stringify(a.allowance)}`);
ok(a.tcs.length === 11 && a.tcs.some(t => t.id === 'unlimited'), 'time controls listed');
ok(CHEAT_WARNING.includes('does not try to detect cheating'), 'cheat warning exported');

// Lobby feed + public room
const lobbyA = await b.subscribeLobby(true);
ok(Array.isArray(lobbyA.rooms), 'lobby subscribe');
const pub = await a.createRoom({ tc: 'unlimited', public: true, name: 'Ann slow ' + run });
await once(b, 'lobby', l => l.rooms.some(r => r.code === pub.code));
ok(true, 'public room appears in lobby feed');
const http = await b.listRooms();
ok(http.rooms.some(r => r.code === pub.code), 'GET /api/rooms lists it');
await a.closeRoom(pub.code);

// Private room, host plays white
const room = await a.createRoom({ tc: '3+2', rated: true, color: 'w' });
const startA = once(a, 'start'), startB = once(b, 'start');
const gid = await b.joinRoom(room.code.toLowerCase());
const [sa] = await Promise.all([startA, startB]);
ok(sa.game.id === gid && sa.game.you === 'w' && b.game(gid).you === 'b', 'private room join, colours as asked');

const seenB = [];
b.on('move', m => seenB.push(m.san));
let seen = once(b, 'move', m => m.uci === 'e2e4');
await a.move(gid, 'e2e4');
await seen;
seen = once(a, 'move', m => m.uci === 'e7e5');
await b.move(gid, 'e7e5');
await seen;
const c1 = a.clock(gid);
ok(c1.running && c1.turn === 'w' && c1.w > 179000 && c1.w <= 180000, `clock started after both first moves ${JSON.stringify(c1)}`);
try { await b.move(gid, 'd7d5'); ok(false, 'out-of-turn move refused'); } catch (e) { ok(e.code === 'not_your_turn', 'out-of-turn move refused'); }
try { await a.move(gid, 'e4e5'); ok(false, 'illegal move refused'); } catch (e) { ok(e.code === 'illegal_move', 'illegal move refused'); }
await once(a, 'allowance', x => x.used === 1, 2000).catch(() => {});
ok((await a.getAllowance()).used === 1, 'game counted once both moved');

// Draw offer declined, then reconnect mid-game and resume
const drP = once(b, 'draw');
await a.offerDraw(gid).catch(e => ok(false, 'offer draw ' + e.code));
const dr = await drP;
ok(dr.action === 'offer' && !dr.mine && b.game(gid).drawOffer === 'w', 'draw offer event');
await b.declineDraw(gid);
const gone = once(a, 'opponent', o => o.status === 'gone');
b.close();
ok((await gone).claimAt > 0, 'opponent-gone event with claimAt');
const back = once(a, 'opponent', o => o.status === 'back');
const b2 = new GambitNet();
const w2 = await b2.connect({ base, devUser: { uid: 'nt-b-' + run, name: 'Ben' } });
await back;
ok(w2.games.length === 1 && b2.game(gid).moves.length === 2, 'reconnect resumes the game');

// Scholar's mate
const endA = once(a, 'end'), endB = once(b2, 'end');
for (const [n, u] of [[a, 'f1c4'], [b2, 'b8c6'], [a, 'd1h5'], [b2, 'g8f6'], [a, 'h5f7']]) {
  const other = n === a ? b2 : a;
  const seen = once(other, 'move', m => m.uci === u);
  await n.move(gid, u);
  await seen;
}
const [ea] = await Promise.all([endA, endB]);
ok(ea.result === '1-0' && ea.reason === 'checkmate' && ea.pgn.includes('Qxf7#'), `checkmate end ${ea.result} ${ea.reason}`);
ok(ea.ratings && ea.ratings.w.delta > 0 && ea.ratings.b.delta < 0, 'rated: deltas');
const rec = await a.gameRecord(gid);
ok(rec.pgn.includes('[Result "1-0"]') && rec.cat === 'blitz', 'stored game + PGN');

// Rematch, colours swap; then abort (costs nothing)
const rmP = once(b2, 'rematch', r => r.action === 'offer');
await a.offerRematch(gid);
await rmP;
const st = once(a, 'start');
await b2.acceptRematch(gid);
const rm = (await st).game;
ok(rm.you === 'b' && rm.id !== gid, 'rematch with colours swapped');
const abP = once(a, 'end', e => e.gameId === rm.id);
await b2.abort(rm.id);
const ab = await abP;
ok(ab.reason === 'aborted', 'abort before first moves');
ok((await a.getAllowance()).remaining === 1, 'aborted game not counted');

// Quick match
const qs = [once(a, 'start'), once(b2, 'start')];
await a.quickMatch('1+0', { rated: false });
ok(a.seek && a.seek.tc === '1+0', 'seek queued');
await b2.quickMatch('1+0', { rated: false });
const [qa] = await Promise.all(qs);
ok(qa.game.tc.id === '1+0' && a.seek === null, 'quick match paired');
const qe = once(a, 'end', e => e.gameId === qa.game.id);
await (qa.game.you === 'w' ? a : b2).resign(qa.game.id);
await qe;

const lb = await a.leaderboard('blitz');
ok(Array.isArray(lb.rows), 'leaderboard');
a.close(); b2.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
