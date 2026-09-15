// node tools/test_utils.mjs — pin the pure helpers every seed in the game rests on.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clamp, lerp, rng, hash32, fmt$, fmtM, fmtTime, dayKey, weekKey } from '../js/utils.js';

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!cond) fails++;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const D = (y, m, d) => new Date(y, m - 1, d);

// 1. hash32 is a fixed function of the string — change it and every seeded city,
//    mission and daily contract in the game becomes a different one.
{
  ok('hash32 golden values',
    hash32('meridian') === 728183243 && hash32('city:s02') === 299194445 && hash32('') === 1779010670,
    `meridian=${hash32('meridian')} city:s02=${hash32('city:s02')} ''=${hash32('')}`);
  ok('hash32 is order-sensitive', hash32('ab') !== hash32('ba'), `ab=${hash32('ab')} ba=${hash32('ba')}`);
  ok('hash32 returns uint32', [...'abcdefgh'].every(c => {
    const h = hash32(c + 'seed');
    return Number.isInteger(h) && h >= 0 && h <= 0xffffffff;
  }));
}

// 2. rng determinism — the golden sequence. Every mission layout, every city and
//    every daily is reproducible only as long as these exact numbers come out.
{
  const GOLD = [0.996054043062, 0.333428842481, 0.993179396493, 0.522752487799, 0.778525702190];
  const r = rng('meridian');
  const got = GOLD.map(() => r());
  ok('rng("meridian") golden sequence', got.every((v, i) => near(v, GOLD[i], 1e-11)),
    got.map(v => v.toFixed(6)).join(' '));

  const a = rng('city:s02'), b = rng('city:s02');
  ok('same seed → same stream', Array.from({ length: 50 }, () => a() === b()).every(Boolean));

  const c = rng('city:s03');
  const d = rng('city:s02');
  ok('different seed → different stream', Array.from({ length: 20 }, () => c() !== d()).some(Boolean));

  const n = rng(12345);
  ok('numeric seed golden', near(n(), 0.979728267761, 1e-11) && near(n(), 0.306752264500, 1e-11));
  ok('numeric and string seeds are distinct spaces', rng(0)() !== rng('0')());

  const u = rng('uniform');
  let lo = 1, hi = 0, sum = 0;
  for (let i = 0; i < 20000; i++) { const v = u(); lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; }
  ok('rng stays in [0,1)', lo >= 0 && hi < 1, `min=${lo.toFixed(6)} max=${hi.toFixed(6)}`);
  ok('rng mean ≈ 0.5', Math.abs(sum / 20000 - 0.5) < 0.012, `mean=${(sum / 20000).toFixed(4)}`);
}

// 3. r.int is INCLUSIVE of its upper bound. missions.js indexes loop[r.int(0,3)]
//    into a 4-element array, so an exclusive bound there is a silent crash and an
//    off-by-one the other way walks civilians off the end of their patrol.
{
  const r = rng('ints');
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(r.int(0, 3));
  ok('r.int(0,3) yields exactly {0,1,2,3}',
    seen.size === 4 && [0, 1, 2, 3].every(v => seen.has(v)),
    `seen={${[...seen].sort().join(',')}}`);

  const r2 = rng('ints2');
  let outside = 0;
  for (let i = 0; i < 20000; i++) { const v = r2.int(-3, 5); if (v < -3 || v > 5 || !Number.isInteger(v)) outside++; }
  ok('r.int(-3,5) stays in range and is integral', outside === 0, `outside=${outside}`);

  const r3 = rng('ints3');
  ok('r.int(n,n) is n', Array.from({ length: 200 }, () => r3.int(7, 7)).every(v => v === 7));

  const r4 = rng('range');
  let bad = 0;
  for (let i = 0; i < 20000; i++) { const v = r4.range(-2, 6); if (v < -2 || v >= 6) bad++; }
  ok('r.range(lo,hi) stays in [lo,hi)', bad === 0, `bad=${bad}`);

  const r5 = rng('pick');
  const arr = ['a', 'b', 'c'];
  const picks = new Set(Array.from({ length: 5000 }, () => r5.pick(arr)));
  ok('r.pick never runs off the array', picks.size === 3 && [...picks].every(v => arr.includes(v)));

  const r6 = rng('chance');
  let hits = 0;
  for (let i = 0; i < 20000; i++) if (r6.chance(0.25)) hits++;
  ok('r.chance(0.25) fires ~25%', Math.abs(hits / 20000 - 0.25) < 0.02, `p=${(hits / 20000).toFixed(3)}`);
  const r7 = rng('chance2');
  ok('r.chance(0)/r.chance(1) are absolute',
    Array.from({ length: 500 }, () => !r7.chance(0) && r7.chance(1)).every(Boolean));
}

// 4. dayKey — the daily contract's identity. Unpadded months/days would make
//    2026-1-5 and 2026-10-5 sort and compare wrongly against a stored key.
{
  ok('dayKey zero-pads month and day', dayKey(D(2026, 1, 5)) === '2026-01-05', dayKey(D(2026, 1, 5)));
  ok('dayKey end of year', dayKey(D(2026, 12, 31)) === '2026-12-31', dayKey(D(2026, 12, 31)));
  ok('dayKey two-digit parts', dayKey(D(2026, 10, 25)) === '2026-10-25', dayKey(D(2026, 10, 25)));
  ok('dayKey is local-time, not UTC', dayKey(new Date(2026, 5, 9, 23, 59, 59)) === '2026-06-09');
  ok('dayKey format', /^\d{4}-\d{2}-\d{2}$/.test(dayKey(D(2027, 3, 7))));
}

// 5. weekKey — ISO-8601 week-of-year. The weekly gauntlet's identity, and the one
//    piece of date arithmetic in the codebase that is genuinely easy to get wrong:
//    the week that straddles New Year belongs to whichever year owns its THURSDAY.
{
  ok('2027-01-01 (Fri) is 2026-W53', weekKey(D(2027, 1, 1)) === '2026-W53', weekKey(D(2027, 1, 1)));
  ok('2027-01-03 (Sun) still 2026-W53', weekKey(D(2027, 1, 3)) === '2026-W53', weekKey(D(2027, 1, 3)));
  ok('2027-01-04 (Mon) starts 2027-W01', weekKey(D(2027, 1, 4)) === '2027-W01', weekKey(D(2027, 1, 4)));
  ok('2026-12-28 (Mon) is 2026-W53', weekKey(D(2026, 12, 28)) === '2026-W53', weekKey(D(2026, 12, 28)));
  ok('2026-12-27 (Sun) is 2026-W52', weekKey(D(2026, 12, 27)) === '2026-W52', weekKey(D(2026, 12, 27)));
  ok('2026-01-01 (Thu) is 2026-W01', weekKey(D(2026, 1, 1)) === '2026-W01', weekKey(D(2026, 1, 1)));
  ok('2025-01-01 (Wed) is 2025-W01', weekKey(D(2025, 1, 1)) === '2025-W01', weekKey(D(2025, 1, 1)));
  ok('weekKey zero-pads', weekKey(D(2026, 9, 15)) === '2026-W38' && /^\d{4}-W\d{2}$/.test(weekKey(D(2026, 1, 1))));

  // the invariant that actually matters: a weekly contract must not change key
  // underneath the player mid-week.
  let unstable = 0;
  for (const start of [D(2025, 12, 29), D(2026, 6, 1), D(2026, 12, 28), D(2027, 1, 4), D(2028, 2, 28)]) {
    const k = weekKey(start);
    for (let i = 1; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      if (weekKey(d) !== k) unstable++;
    }
  }
  ok('weekKey is constant Mon→Sun', unstable === 0, `drifting days=${unstable}`);

  // and it must advance exactly once per week, never skipping or repeating.
  const keys = [];
  for (let i = 0; i < 400; i++) { const d = D(2025, 12, 29); d.setDate(d.getDate() + i * 7); keys.push(weekKey(d)); }
  ok('weekKey unique across 400 consecutive weeks', new Set(keys).size === 400, `distinct=${new Set(keys).size}`);
  ok('every week number is 01–53', keys.every(k => { const w = +k.slice(-2); return w >= 1 && w <= 53; }));
}

// 6. fmtTime — the mission countdown. It CEILS, so a clock reading 0:00 means the
//    window is genuinely gone, and a negative remainder never prints "-1:59".
{
  ok('fmtTime(0)', fmtTime(0) === '0:00', fmtTime(0));
  ok('fmtTime clamps negatives', fmtTime(-5) === '0:00' && fmtTime(-0.1) === '0:00', fmtTime(-5));
  ok('fmtTime ceils partial seconds', fmtTime(5.2) === '0:06', fmtTime(5.2));
  ok('fmtTime(59.1) rolls to 1:00', fmtTime(59.1) === '1:00', fmtTime(59.1));
  ok('fmtTime(61)', fmtTime(61) === '1:01', fmtTime(61));
  ok('fmtTime zero-pads seconds', fmtTime(65) === '1:05', fmtTime(65));
  ok('fmtTime(600)', fmtTime(600) === '10:00', fmtTime(600));
  ok('fmtTime past an hour keeps counting minutes', fmtTime(3600) === '60:00' && fmtTime(3599) === '59:59', fmtTime(3600));
}

// 7. the small formatters + clamp/lerp
{
  ok('fmt$ groups thousands', fmt$(1234567) === '$1,234,567', fmt$(1234567));
  ok('fmt$ rounds', fmt$(999.6) === '$1,000' && fmt$(0) === '$0', fmt$(999.6));
  ok('fmtM rounds to whole metres', fmtM(649.7) === '650m' && fmtM(0.2) === '0m', fmtM(649.7));
  ok('clamp', clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0 && clamp(2, 0, 3) === 2);
  ok('lerp endpoints and midpoint', lerp(10, 20, 0) === 10 && lerp(10, 20, 1) === 20 && lerp(10, 20, 0.5) === 15);
  ok('lerp extrapolates', lerp(0, 10, 2) === 20 && lerp(0, 10, -1) === -10);
}

// 8. B8.7 — perchReach must never stand the shooter off his own roof.
//    city.js imports THREE, so it cannot be imported here; lift the function out
//    of the real source text instead, so this tests the shipped code and not a copy.
{
  const src = readFileSync(fileURLToPath(new URL('../js/city.js', import.meta.url)), 'utf8');
  // tolerate added params (B3 gave it `back = 3`); capture the arg list too so
  // defaults still apply when the body is rebuilt.
  const m = src.match(/export function perchReach\(([^)]*)\) \{([\s\S]*?)\n\}/);
  ok('perchReach extracted from js/city.js', !!m);
  if (m) {
    const perchReach = new Function(`return function(${m[1]}){${m[2]}}`)();

    // the stand point is (sin(yaw), cos(yaw)) × reach from the roof centre; a
    // w-square roof spans ±w/2 on both axes.
    let off = 0, worst = null;
    for (let w = 2; w <= 60; w += 0.5) {
      for (let i = 0; i < 64; i++) {
        const yaw = i * Math.PI * 2 / 64;
        const reach = perchReach(w, yaw);
        const px = Math.abs(Math.sin(yaw) * reach), pz = Math.abs(Math.cos(yaw) * reach);
        if (reach < 0 || px > w / 2 + 1e-9 || pz > w / 2 + 1e-9) {
          off++;
          if (!worst) worst = `w=${w} yaw=${yaw.toFixed(2)} reach=${reach.toFixed(2)} needs≤${(w / 2).toFixed(2)}`;
        }
      }
    }
    ok('perchReach stand point is always inside the footprint', off === 0,
      `off-roof=${off}${worst ? ' first ' + worst : ''}`);

    // a 30 m perch facing diagonally reaches 1.41× further than facing square-on —
    // the bug CLAUDE.md records as "nine metres of his own gravel".
    ok('perchReach(30, 0) = 12', near(perchReach(30, 0), 12, 1e-9), perchReach(30, 0).toFixed(3));
    ok('perchReach(30, π/4) ≈ 18.21', near(perchReach(30, Math.PI / 4), 30 / 2 * Math.SQRT2 - 3, 1e-9),
      perchReach(30, Math.PI / 4).toFixed(3));
    ok('perchReach is yaw-symmetric', near(perchReach(30, 0.7), perchReach(30, -0.7), 1e-9)
      && near(perchReach(30, 0.7), perchReach(30, Math.PI - 0.7), 1e-9));
    ok('perchReach leaves ~3 m of roof ahead on any real perch',
      [20, 24, 30, 40].every(w => Array.from({ length: 32 }, (_, i) => {
        const yaw = i * Math.PI * 2 / 32;
        const edge = (w / 2) / Math.max(Math.abs(Math.sin(yaw)), Math.abs(Math.cos(yaw)));
        return near(edge - perchReach(w, yaw), 3, 1e-9);
      }).every(Boolean)));

    // the fix is behaviour-preserving for every perch the game actually builds
    // (the floor only ever bound below ~12 m), so nothing downstream moves.
    let drift = 0;
    for (let w = 12; w <= 60; w += 0.5) {
      for (let i = 0; i < 32; i++) {
        const yaw = i * Math.PI * 2 / 32;
        const edge = (w / 2) / Math.max(Math.abs(Math.sin(yaw)), Math.abs(Math.cos(yaw)));
        if (!near(perchReach(w, yaw), Math.max(3, edge - 3), 1e-9)) drift++;
      }
    }
    ok('unchanged vs the old formula for every roof ≥ 12 m', drift === 0, `drifted=${drift}`);
  }
}

console.log(fails ? `\n${fails} FAILURES` : '\nall utils tests pass');
process.exit(fails ? 1 : 0);
