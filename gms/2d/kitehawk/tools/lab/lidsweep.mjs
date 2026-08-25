import { execFileSync } from 'node:child_process';
const LEVELS = ['a1-01','a1-04','a1-12','a2-05'];
const SEEDS = [...Array(12).keys()].map(i => 3 + i * 7);
const run = (f, seed, brk) => {
  const args = ['tools/sim.mjs','--levelrun','--levelfile',`data/levels/${f}.json`,'--seed',String(seed),'--quiet'];
  if (brk) args.push('--break', brk);
  return JSON.parse(execFileSync('node', args, { encoding: 'utf8', maxBuffer: 1 << 26 }));
};
const rows = [];
for (const L of LEVELS) {
  for (const arm of ['lid','no-lid']) {
    let done = 0, occ = [], t = [], lidW = new Set(), hits = 0, deck = 0;
    for (const s of SEEDS) {
      const r = run(L, s, arm === 'lid' ? '' : 'no-lid');
      lidW.add(r.lidWu); hits += r.lidHits;
      if (r.completed) done++;
      occ.push(r.occupied.length); t.push(r.time); deck += r.timeInBand.deck;
    }
    const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
    rows.push({ L, arm, lidWu: [...lidW].join('/'), lidHits: hits,
      completed: `${done}/${SEEDS.length}`, occMin: Math.min(...occ), occMax: Math.max(...occ),
      occMean: +mean(occ).toFixed(2), tMean: +mean(t).toFixed(1), deckMean: +(deck/SEEDS.length).toFixed(1) });
  }
}
console.table(rows);
