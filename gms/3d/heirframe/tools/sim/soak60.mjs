// P6 balance soak: N seeds × 60+ simulated hours through the real sim; every ECONOMY §9 target ±20%.
// node tools/sim/soak60.mjs [--seeds 6] [--hours 66]
import { runBalance, ttkTable } from './balance.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const SEEDS = arg('seeds', 6), HOURS = arg('hours', 66);
const H = 3600, M = 60;
// [label, milestone key, lo, hi] in seconds; the ±20% band is applied to the ends of the range
const TARGETS = [
  ['first contract, level 2', 'level2', 5 * M, 5 * M], ['first upgrade equipped', 'firstUpgrade', 0, 8 * M],
  ['first frame', 'frame1', 30 * M, 75 * M], ['Act 1 complete (A1-M5)', 'story_a1_m5', 60 * M, 100 * M],   // ECONOMY 1.3 h, amended by D19/P2 to 60–100 min
  ['level 8', 'level8', 1.3 * H, 1.3 * H],
  ['second frame', 'frame2', 3 * H, 4 * H], ['third frame', 'frame3', 7 * H, 9 * H], ['first Relic', 'firstRelic', 3 * H, 5 * H],
  ['story finale', 'story_a6_m5', 28 * H, 32 * H], ['level 50', 'level50', 28 * H, 32 * H], ['level 60', 'level60', 40 * H, 40 * H],
  ['first Succession', 'succession1', 55 * H, 55 * H],
];
const fmt = (s) => (s == null ? '—' : s < H ? `${Math.round(s / M)} min` : `${(s / H).toFixed(1)} h`);
const t0 = Date.now();
const runs = [];
for (let seed = 1; seed <= SEEDS; seed++) runs.push(runBalance({ hours: HOURS, seed, quiet: true }));
let bad = 0;
console.log(`${SEEDS} seeds × ${HOURS} h (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
for (const [label, key, lo, hi] of TARGETS) {
  const v = runs.map((r) => r.milestones[key]);
  const ok = v.every((x) => x != null && (key === 'firstUpgrade' ? x <= hi * 1.2 : x >= lo * 0.8 && x <= hi * 1.2));
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'MISS'} ${label.padEnd(26)} ${v.map(fmt).join('  ').padEnd(64)} target ${fmt(lo)}${hi !== lo ? '–' + fmt(hi) : ''}`);
}
const idle = runs.map((r) => r.idleRich);
console.log(`${idle.every((x) => x === 0) ? 'ok  ' : 'MISS'} credits idle > 3× next want for 2 h: ${idle.join(' ')} windows`);
if (idle.some((x) => x)) { bad++; for (const r of runs) for (const w of r.idleLog) console.log('     ', JSON.stringify(w)); }
console.log(`     gens ${runs.map((r) => r.final.gen).join(' ')} · Voices caught ${runs.map((r) => r.final.voices?.length ?? 0).join(' ')} · Overclock ${runs.map((r) => r.final.overclock.unlocked).join(' ')} · deaths ${runs.map((r) => r.deaths).join(' ')}`);
const tt = ttkTable();
for (const [f, row] of Object.entries(tt.byFrame)) {
  // owned frames start at level 5 (the licence), so their level-1 column is not a real case
  const ok = row.every((x, i) => (f !== 'rental' && tt.levels[i] < 5) || (x >= 1.5 * 0.8 && x <= 4 * 1.2));
  console.log(`${ok ? 'ok  ' : 'MISS'} grunt TTK ${f.padEnd(8)} ${row.join(' ')} (1.5–4 s)`);
  if (!ok) bad++;
}
console.log(`\n${bad ? bad + ' MISSED' : 'all targets met'}`);
process.exit(bad ? 1 : 0);
