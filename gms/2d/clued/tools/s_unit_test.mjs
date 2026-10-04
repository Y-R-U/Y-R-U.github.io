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
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);
