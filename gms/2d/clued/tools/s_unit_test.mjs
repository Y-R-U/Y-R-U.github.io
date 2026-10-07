// Lane S node unit checks: async progressive winners, stage multiplier, progressive timing helpers.
//   node tools/s_unit_test.mjs
const { questionWinners, detailOf } = await import('../js/net/board.js');
const { stageMultiplier, progressiveLimit, stageExtendMs } = await import('../js/core/scoring.js');
let bad = 0;
const eq = (got, want, msg) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? '  ok  ' : '  FAIL', msg, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const A = { detail: [[1, 2, 900], [1, 0, 5000], [0, 0, 100], [1, 1, 3000]] };
const B = { detail: [[1, 1, 4000], [1, 0, 4000], [1, 3, 9000], [1, 1, 2000]] };
const { winners, wins } = questionWinners([A, B], 4);
eq(winners, [1, 1, 1, 1], 'lowest stage wins; then the faster time; a wrong answer never wins');
eq(questionWinners([A, { detail: [[0, 0, 1]] }], 2).winners, [0, 0], 'missing detail counts as not answered');
eq(wins, [0, 4], 'win totals');
eq(detailOf([{ i: 1, correct: false, ms: 10.4 }, { i: 0, correct: true, stage: 2, ms: 99.6 }]), [[1, 2, 100], [0, 0, 10]], 'detailOf orders by question and rounds ms');
eq([0, 1, 2, 3].map(s => +stageMultiplier(s, 4).toFixed(2)), [1, 0.8, 0.6, 0.4], 'multiplier 1 → 0.4 across 4 stages');
eq(stageMultiplier(3, 1), 1, 'non-progressive multiplier is 1');
eq([progressiveLimit(3000), progressiveLimit(10000), stageExtendMs(4000), stageExtendMs(30000)], [10000, 15000, 5000, 15000], 'progressive timing helpers match the server');

// multi-round rooms (js/net/roundset.js)
const { roundAt, specRound, annotateTimes, fitSet } = await import('../js/net/roundset.js');
const st = { roundSizes: [2, 3, 1], roundSpec: [0, 2, 3], spec: { rounds: [{ format: 'a' }, { format: 'b' }, { format: 'c' }, { format: 'd' }] } };
eq([0, 1, 2, 4, 5].map(a => { const r = roundAt(st, a); return [r.ord, r.pos, r.size, r.first, r.last]; }),
  [[0, 0, 2, true, false], [0, 1, 2, false, true], [1, 0, 3, true, false], [1, 2, 3, false, true], [2, 0, 1, true, true]], 'roundAt: ordinal, position, first/last');
eq([roundAt({ roundSizes: [5] }, 0), roundAt({}, 0), roundAt(st, 6)], [null, null, null], 'single-round / out of range → null');
eq([0, 1, 2].map(o => specRound(st, o).format), ['a', 'c', 'd'], 'specRound follows roundSpec past a dropped round');
const fmts = { slow: { timeScale: q => 1 + q.n * 0.5 }, fixed: { timeScale: 1.8 }, plain: {}, wild: { timeScale: 99 }, broken: { timeScale: () => { throw new Error('x'); } } };
const qs = annotateTimes([{ format: 'slow', n: 3 }, { format: 'fixed' }, { format: 'plain', tscale: 4 }, { format: 'wild' }, { format: 'broken' }, { format: 'gone' }], f => fmts[f]);
eq(qs.map(q => q.tscale), [2.5, 1.8, undefined, 6, undefined, undefined], 'annotateTimes: function/number scales, clamp 6, none for plain/broken/missing');
const set = [...Array(12)].map((_, i) => ({ id: i, round: i < 8 ? 0 : i < 10 ? 1 : 2, pad: 'x'.repeat(50) }));
const fit = fitSet(set, { maxN: 6 });
eq([fit.length, [0, 1, 2].map(r => fit.filter(q => q.round === r).length)], [6, [2, 2, 2]], 'fitSet trims the biggest round first, every round survives');
const fitB = fitSet(set, { maxBytes: JSON.stringify(set).length - 200 });
ok2(JSON.stringify(fitB).length <= JSON.stringify(set).length - 200 && fitB.filter(q => q.round === 2).length === 2, 'fitSet respects the byte cap');
function ok2(c, msg) { eq(!!c, true, msg); }

// TIMING.md: the reveal's points breakdown and scoreboard notes
const { pointsBreakdown, rowNote } = await import('../js/net/board.js');
eq(pointsBreakdown({ correct: true, points: 515, ms: 5895, speed: 343, bonus: 172, streak: 7 }), '343 speed (5.9 s) · +172 streak (7 in a row)', 'breakdown: speed + streak (the 4XG4W Q15 case)');
eq(pointsBreakdown({ correct: true, points: 515, ms: 5895, speed: 343, bonus: 172, streak: 7 }, { streakBonus: false }), '343 speed (5.9 s)', 'no streak part when streaks are just for show');
eq(pointsBreakdown({ correct: true, points: 446, ms: 2000, speed: 420, clipMul: 1.25, artMul: 1, clip: 5, replays: 1 }), '420 speed (2.0 s) · ×1.25 5 s clip · −15% 1 replay', 'listen: clip factor and replays');
eq(pointsBreakdown({ correct: true, points: 357, ms: 3000, speed: 420, stage: 1, stages: 5 }), '420 speed (3.0 s) · ×0.85 at step 2/5', 'progressive step multiplier');
eq([pointsBreakdown({ correct: false, points: 0, ms: 4000 }), pointsBreakdown({ correct: true, points: 400, ms: 1000 })], ['', ''], 'nothing for a wrong answer or an old server');
eq([rowNote({ correct: true, ms: 4114, bonus: 39 }), rowNote({ correct: true, ms: 4114, bonus: 39 }, { streakBonus: false }), rowNote({ correct: false, ms: 1 }), rowNote(null)], ['4.1 s · +39 streak', '4.1 s', '✗', ''], 'scoreboard row notes');
const { answerMs, listenFactors } = await import('../js/net/p2p_room.js');
eq([answerMs(4000, 3950, 15000), answerMs(4000, 950, 15000), answerMs(4000, 4400, 15000), answerMs(4000, undefined, 15000), answerMs(20000, 19000, 15000)], [3950, 2500, 4000, 4000, 15000], 'answerMs: client time within [receive − 1.5 s, receive + 0.3 s], clamped to the limit');
eq(listenFactors({ data: { len: 5, art: 'blur', replays: 2 } }, 7), { clipMul: 1.25, artMul: 0.85, reps: 2, clip: 5 }, 'listenFactors clamps replays to the allowance');
const listen = (await import('../js/audio/listen.js')).default;
eq(listen.options.map(o => o.key).includes('grow'), false, 'listen has no Grow option');

console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);
