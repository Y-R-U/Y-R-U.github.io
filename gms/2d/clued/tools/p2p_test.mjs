// Lane P2P: device-hosted room logic (js/net/p2p_room.js) against the server's rules. node tools/p2p_test.mjs
import { P2PRoom, MAX_PLAYERS, GRACE_MS, LEAD_IN_MS, ONLINE_MS, basePoints, withStreak, stageMultiplier, verifyCorrect } from '../js/net/p2p_room.js';
import * as S from '../js/core/scoring.js';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) pass++; else { fail++; console.log(`FAIL ${msg} ${extra}`); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

let T = 1_000_000;
const now = () => T;
const mc = (i, answer = 0) => ({ format: 'mc', id: `q${i}`, prompt: `Q${i}`, options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], answer });
const prog = (i, stages = 4) => ({ format: 'reveal', id: `p${i}`, prompt: 'What is it?', options: [{ text: 'a' }, { text: 'b' }], answer: 0, stages });
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function room(opts = {}) {
  const r = new P2PRoom({ questions: [mc(0), mc(1), mc(2)], answerSec: 10, gapSec: 5, now, rand, ...opts });
  const host = r.addPlayer('Host', { local: true }).player;
  return { r, host };
}
const join = (r, n) => { const p = r.addPlayer(n).player; r.connect(p, 1); return p; };
const openQ = r => { T = r.qStart; };

/* scoring parity with the client and the Go server */
for (const [rem, lim] of [[0, 10000], [5000, 10000], [10000, 10000], [2500, 20000]]) {
  eq(basePoints('mc', true, undefined, lim - rem, lim, true), S.basePoints({ timed: true, remaining: rem, limit: lim }), `timed base ${rem}/${lim} matches client`);
}
eq(basePoints('mc', true, undefined, 0, 10000, false), 100, 'untimed = 100');
eq(basePoints('mc', false, undefined, 0, 10000, true), 0, 'wrong = 0');
eq(basePoints('ladder', false, 340, 0, 10000, true), 340, 'partial formats use client points');
eq(basePoints('ladder', true, 9999, 0, 10000, true), 500, 'partial points capped at 500');
eq(basePoints('mc', true, 9999, 0, 10000, true), 500, 'non-partial ignores client points');
for (const st of [1, 2, 3, 6, 9]) eq(withStreak(400, st), S.withStreak(400, st), `streak ${st} matches client`);
for (const [s, n] of [[0, 4], [1, 4], [3, 4], [5, 4], [2, 5]]) ok(Math.abs(stageMultiplier(s, n) - S.stageMultiplier(s, n)) < 1e-9, `stage multiplier ${s}/${n} matches client`);
ok(verifyCorrect(mc(0, 2), 2, false) === true && verifyCorrect(mc(0, 2), 1, true) === false, 'mc index re-checked');
ok(verifyCorrect({ format: 'tf', answer: true }, false, true) === false, 'tf re-checked');
ok(verifyCorrect({ format: 'type', answer: 'x' }, 'y', true) === true, 'other formats trust the claim');

/* lobby, names, caps */
{
  const { r, host } = room();
  eq(r.hostId, host.id, 'first player is host');
  const a = join(r, 'Sam'), b = join(r, 'sam');
  eq(b.name, 'sam 2', 'case-insensitive dedupe');
  eq(r.addPlayer('  ').error, 'name_required', 'blank name refused');
  eq(join(r, 'A<b>​ c').name, 'Ab c', 'names tidied');
  while (r.active().length < MAX_PLAYERS) join(r, 'X');
  eq(r.addPlayer('Late').error, 'room_full', `cap at ${MAX_PLAYERS}`);
  r.remove(a, false);
  ok(!r.addPlayer('Fill').error, 'a leaver frees a slot');
  eq(r.hostAction(b, 'start').error, 'not_host', 'only the host starts');
  eq(r.rejoin(b.key).player.id, b.id, 'rejoin by key');
  eq(r.rejoin('nope').error, 'bad_key', 'unknown key refused');
}

/* question flow, deadline + grace, early end, gap */
{
  T = 1_000_000;
  const { r, host } = room({ answerSec: 15, gapSec: 3 });
  const a = join(r, 'Ann'), b = join(r, 'Bob');
  r.hostAction(host, 'start');
  eq(r.phase, 'question', 'start opens Q0');
  eq(r.qStart - T, LEAD_IN_MS, '3 s lead-in');
  eq(r.qDeadline - r.qStart, 15000, 'host-picked answer time');
  eq(r.answer(a, { q: 0, given: 0, correct: true }).error === undefined, false, 'answers before the lead-in are refused');
  openQ(r);
  T += 3000;
  const ra = r.answer(a, { q: 0, given: 0, correct: false, ms: 3000 }).answer;
  ok(ra.correct, 'mc correctness from given, not the claim');
  eq(ra.points, basePoints('mc', true, undefined, 3000, 15000, true), 'timed points');
  eq(r.answer(a, { q: 0, given: 0 }).error, 'already_answered', 'one answer each');
  T += 100;
  eq(r.answer(b, { q: 0, given: 1, correct: true, ms: 9000 }).answer.ms, 3100, 'client ms ignored when it claims more than the host measured + 300');
  eq(r.phase, 'question', 'host has not answered yet');
  r.answer(host, { q: 0, given: 0, ms: 3200 });
  eq(r.phase, 'reveal', 'early reveal when everyone answered');
  eq(r.revealAt - T, 3000, 'gap countdown');
  const st = r.stateFor(a);
  ok(st.players[0].score >= st.players[1].score && st.players.every(p => p.last), 'reveal state sorted with last results');
  eq(st.you.rank, 1 + st.players.filter(p => p.score > st.players.find(x => x.id === a.id).score).length, 'rank');
  T = r.revealAt; r.tick();
  eq([r.phase, r.q], ['question', 1], 'auto-next after the gap');
  // grace: 499 ms ok, 501 ms refused
  T = r.qDeadline + 499;
  ok(!r.answer(a, { q: 1, given: 0 }).error, 'answer inside the 500 ms grace accepted');
  T = r.qDeadline + 501;
  eq(r.answer(b, { q: 1, given: 0 }).error, 'too_late', 'answer after the grace refused');
  r.tick();
  eq(r.phase, 'reveal', 'deadline + grace reveals');
  eq(b.streak, 0, 'missed answer resets streak');
  ok(a.streak === 2 && withStreak(100, 2) === 110, 'streak bonus builds');
}

/* offline players don't hold the question; host taps Next; kids; late join; kick; again; close */
{
  T = 2_000_000;
  const { r, host } = room({ gapSec: 0 });
  const a = join(r, 'Ann'), b = join(r, 'Bob');
  r.hostAction(host, 'start'); openQ(r);
  r.connect(b, -1);
  T += ONLINE_MS + 1;
  r.answer(host, { q: 0, given: 0 }); r.answer(a, { q: 0, given: 0 });
  eq(r.phase, 'reveal', 'a disconnected player does not hold up the reveal');
  T += 60000; r.tick();
  eq(r.phase, 'reveal', 'gap 0: waits for the host');
  eq(r.hostAction(a, 'next').error, 'not_host', 'only the host advances');
  r.hostAction(host, 'next');
  eq(r.q, 1, 'host taps Next');
  const late = join(r, 'Late');
  eq(late.joinedQ, 2, 'late joiner plays from the next question');
  ok(r.stateFor(late).players.find(p => p.id === late.id).late, 'late flag');
  r.hostAction(host, 'kick', { playerId: a.id });
  ok(a.kicked && r.stateFor(a).you.kicked, 'kick marks the seat');
  eq(r.rejoin(a.key).error, 'kicked', 'kicked players cannot rejoin');
  eq(r.hostAction(host, 'host', { playerId: b.id }).error, 'not_supported', 'no host handover in device rooms');
  r.hostAction(host, 'end');
  eq(r.phase, 'final', 'host can end');
  r.hostAction(host, 'again', { spec: { rounds: [{ format: 'mc', opts: { kids: true } }] }, title: 'Again', questions: [mc(0)] });
  ok(r.phase === 'lobby' && r.game === 1 && r.kids && r.players.every(p => p.score === 0), 'play again resets scores and reads kids from the spec');
  r.hostAction(host, 'start'); openQ(r); T += 5000;
  eq(r.answer(host, { q: 0, given: 0 }).answer.points, 100, 'kids: flat 100');
  r.close();
  ok(r.closed && r.phase === 'final' && r.stateFor(b).closed, 'closing ends the room with final scores');
  eq(r.addPlayer('After').error, 'room_not_found', 'no joins after close');
}

/* settings, noLate, kids default */
{
  const { r, host } = room({ lateJoin: false });
  r.hostAction(host, 'settings', { answerSec: 20, gapSec: 10 });
  eq([r.answerMs, r.revealMs, r.auto], [20000, 10000, true], 'settings change timing');
  r.hostAction(host, 'settings', { answerSec: 7 });
  eq(r.answerMs, 20000, 'only allowed answer times');
  r.hostAction(host, 'start');
  eq(r.addPlayer('Late').error, 'started', 'late join can be off');
  eq(r.hostAction(host, 'settings', { answerSec: 5 }).error, 'in_question', 'answer time locked mid-question');
  const k = new P2PRoom({ spec: { rounds: [{ opts: { kids: true } }] }, questions: [mc(0)], now });
  eq(k.answerMs, 20000, 'kids default 20 s');
}

/* vote to reveal more */
{
  T = 3_000_000;
  const { r, host } = room({ questions: [prog(0, 4), mc(1)], answerSec: 10 });
  const a = join(r, 'Ann'), b = join(r, 'Bob');
  r.hostAction(host, 'start');
  eq(r.qDeadline - r.qStart, 15000, 'progressive initial = answer × 1.5');
  eq(r.vote(a, 0).error, 'not_open', 'no votes during the lead-in');
  openQ(r);
  r.vote(a, 0);
  let st = r.stateFor(b);
  eq([st.stage, st.stages, st.votes, st.needed, st.locked], [0, 4, 1, 3, false], 'vote count and needed in state');
  ok(r.stateFor(a).you.voted && !st.you.voted, 'you.voted');
  r.vote(a, 0); r.vote(b, 0);
  eq(r.stage, 0, 'repeat votes do not count twice');
  T += 2000;
  const res = r.vote(host, 0);
  ok(res.advanced && r.stage === 1, 'all connected unanswered players voted → stage 1');
  eq(r.votes.size, 0, 'votes reset after an advance');
  eq(r.qDeadline, Math.max(r.qStart + 15000, T + 5000), 'deadline = max(current, now + max(5 s, answer/2))');
  // a dropped non-voter: the rest are enough
  r.vote(a, 0); r.vote(host, 0);
  r.connect(b, -1); T += ONLINE_MS + 1; r.tick();
  eq(r.stage, 2, 'a dropped player stops blocking the vote');
  r.connect(b, 1);
  // extend near the deadline
  T = r.qDeadline - 1000;
  r.vote(a, 0); r.vote(b, 0); r.vote(host, 0);
  eq(r.stage, 3, 'stage 3');
  eq(r.qDeadline, T + 5000, 'late advance extends the deadline');
  eq(r.vote(a, 0).error, 'last_stage', 'no votes past the last stage');
  const before = r.limitFor(r.questions[0]);
  const ans = r.answer(a, { q: 0, given: 0, correct: true, ms: T - r.qStart }).answer;
  eq(ans.stage, 3, 'answer records its stage');
  eq(ans.points, Math.round(basePoints('reveal', true, undefined, Math.min(T - r.qStart, before), before, true) * stageMultiplier(3, 4)), 'stage multiplier applied (scored against the initial limit)');
  ok(r.locked && r.stateFor(b).locked, 'first answer locks voting');
  eq(r.stateFor(a).you.stage, 3, 'you.stage');
  eq(r.stateFor(b).limitMs, r.qDeadline - r.qStart, 'ring limit follows the extended deadline');
}
{
  T = 4_000_000;
  const { r, host } = room({ questions: [prog(0, 20)], answerSec: 30 });
  const a = join(r, 'Ann');
  r.hostAction(host, 'start'); openQ(r);
  for (let i = 0; i < 12; i++) { T += 7000; r.vote(a, 0); r.vote(host, 0); }
  eq(r.qDeadline - r.qStart, 90000, 'deadline capped at 90 s from the start');
  r.answer(host, { q: 0, given: 1 });
  eq(r.vote(a, 0).error, 'locked', 'locked after a wrong guess too');
}
{
  T = 5_000_000;
  const r = new P2PRoom({ spec: { kids: true }, questions: [prog(0, 3)], now, rand });
  r.addPlayer('Kid', { local: true });
  r.start(); openQ(r);
  T += 3999; r.tick(); eq(r.stage, 0, 'kids: no auto-stage before 4 s');
  T += 2; r.tick(); eq(r.stage, 1, 'kids: stage auto-advances every 4 s');
  T += 4001; r.tick(); T += 4001; r.tick(); eq(r.stage, 2, 'kids: stops at the last stage');
}
{
  // non-progressive: no stage fields, vote refused
  const { r, host } = room();
  r.hostAction(host, 'start'); openQ(r);
  ok(r.stateFor(host).stages === undefined, 'plain questions carry no stage fields');
  eq(r.vote(host, 0).error, 'not_progressive', 'vote refused on plain questions');
}

/* host refresh: snapshot → restore */
{
  T = 6_000_000;
  const { r, host } = room();
  const a = join(r, 'Ann');
  r.hostAction(host, 'start'); openQ(r); r.answer(a, { q: 0, given: 0 });
  const snap = JSON.parse(JSON.stringify(r.snapshot()));
  const r2 = P2PRoom.restore(snap, { now });
  const a2 = r2.byKey(a.key);
  ok(a2 && a2.score === a.score && r2.q === 0 && r2.phase === 'question' && r2.hostId === host.id, 'restore keeps seats, scores and phase');
  eq(r2.answer(a2, { q: 0, given: 0 }).error, 'already_answered', 'restore keeps answers');
  ok(r2.ver === r.ver, 'restore keeps the version (clients ignore older states)');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
