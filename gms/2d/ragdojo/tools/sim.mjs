#!/usr/bin/env node
/**
 * Runs real fights headless in node — the engine is pure JS, only FX touches the DOM.
 * Simulates the whole campaign with its economy: earn ink, spend it greedily, fight on.
 *
 *   node tools/sim.mjs                 # full campaign, 5 runs
 *   node tools/sim.mjs --runs=20
 *   node tools/sim.mjs --level=44 --runs=40    # one level in isolation
 *   node tools/sim.mjs --naked         # never spend ink (worst case)
 */

// ── DOM stub: enough for FX's offscreen marks canvas ─────────────────────
const noopCtx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'canvas') return { width: 0, height: 0 };
    if (k === 'createLinearGradient' || k === 'createRadialGradient') {
      return () => ({ addColorStop() {} });
    }
    return () => {};
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  fonts: { ready: Promise.resolve() },
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const { Match } = await import('../js/match.js');
const {
  LEVELS, TOTAL_LEVELS, MOVES, PERKS, moveBuyCost, movePowerCost, moveCdCost,
  perkCost, MOVE_MAX_LV, playerRankAt, RANKS,
} = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const RUNS = +(args.runs || 5);
const MAX_SECONDS = 120;
const DT = 1 / 120;

/** Play one fight to a result with no renderer and no clock. */
function runFight(level, save, bully = false) {
  const m = new Match({ level, save, bully, autoplay: true, onEnd: () => {} });
  if (args.nosep) m.separate = () => {};      // A/B the solid-body rule
  let t = 0;
  while (!m.over && t < MAX_SECONDS) {
    m.update(DT, null);
    t += DT;
  }
  return {
    result: m.over ? m.result : 'timeout',
    seconds: t,
    score: m.score,
    dmgDealt: m.damageDealt,
    dmgTaken: m.damageTaken,
    hpLeft: m.player.hp / m.player.maxHp,
    launch: m.biggestLaunch,
  };
}

/** Spend ink the way a player plausibly would: cheapest useful thing first. */
function spend(save) {
  let bought = 0;
  for (let guard = 0; guard < 40; guard++) {
    const rank = playerRankAt(save.level);
    const opts = [];
    for (const mv of MOVES) {
      const st = save.moves[mv.id] || { owned: false, power: 0, cd: 0 };
      if (!st.owned) { if (mv.tier <= rank) opts.push({ c: moveBuyCost(mv), f: () => { save.moves[mv.id] = { owned: true, power: 0, cd: 0 }; } }); continue; }
      if (st.power < MOVE_MAX_LV) opts.push({ c: movePowerCost(mv, st.power), f: () => save.moves[mv.id].power++ });
      if (st.cd < MOVE_MAX_LV) opts.push({ c: moveCdCost(mv, st.cd), f: () => save.moves[mv.id].cd++ });
    }
    for (const p of PERKS) {
      const lv = save.perks[p.id] || 0;
      if (lv < p.max) opts.push({ c: perkCost(p, lv), f: () => { save.perks[p.id] = lv + 1; } });
    }
    const afford = opts.filter((o) => o.c <= save.ink).sort((a, b) => a.c - b.c);
    if (!afford.length) break;
    const pick = afford[Math.floor(Math.random() * Math.min(3, afford.length))];
    save.ink -= pick.c;
    pick.f();
    bought++;
  }
  return bought;
}

if (args.bully) {
  // Maxed player against white belts: should be a slaughter with big launches.
  const save = DEFAULT();
  save.bully = true;
  for (const m of MOVES) save.moves[m.id] = { owned: true, power: MOVE_MAX_LV, cd: MOVE_MAX_LV };
  for (const p of PERKS) save.perks[p.id] = p.max;
  let wins = 0, secs = 0, launch = 0, taken = 0;
  const N = +(args.runs || 10);
  for (let i = 0; i < N; i++) {
    const r = runFight(LEVELS[+(args.at || 0)], save, true);
    if (r.result === 'win') wins++;
    secs += r.seconds; launch += r.launch; taken += r.dmgTaken;
  }
  console.log(`BULLY MODE vs level ${args.at || 0}:`);
  console.log(`  win ${(wins / N * 100).toFixed(0)}%  avg ${(secs / N).toFixed(1)}s  ` +
    `avg launch ${(launch / N).toFixed(0)}u (${(launch / N / 10).toFixed(1)} m)  dmg taken ${(taken / N).toFixed(1)}`);
  process.exit(0);
}

if (args.level !== undefined) {
  const L = LEVELS[+args.level];
  const save = DEFAULT();
  save.level = L.idx;
  if (!args.naked) { save.ink = 200 + L.idx * 260; spend(save); }
  let wins = 0, secs = 0, timeouts = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = runFight(L, save);
    if (r.result === 'win') wins++;
    if (r.result === 'timeout') timeouts++;
    secs += r.seconds;
  }
  console.log(`level ${L.idx} (${L.title}, ${L.kind}, ${L.enemies.length} enemy)`);
  console.log(`  win ${(wins / RUNS * 100).toFixed(0)}%  timeout ${timeouts}  avg ${(secs / RUNS).toFixed(1)}s`);
  process.exit(0);
}

// Full campaign.
console.log(`campaign x${RUNS}${args.naked ? ' (never spending ink)' : ''}\n`);
const perLevel = LEVELS.map(() => ({ w: 0, n: 0, s: 0, to: 0, attempts: 0 }));
let finished = 0;
const totals = { fights: 0, seconds: 0 };

for (let run = 0; run < RUNS; run++) {
  const save = DEFAULT();
  let idx = 0, attempts = 0, guard = 0;
  while (idx < TOTAL_LEVELS && guard++ < 400) {
    save.level = idx;
    if (!args.naked) spend(save);
    const L = LEVELS[idx];
    const r = runFight(L, save);
    const st = perLevel[idx];
    st.n++; st.s += r.seconds; st.attempts++;
    if (r.result === 'timeout') st.to++;
    totals.fights++; totals.seconds += r.seconds;
    if (r.result === 'win') {
      st.w++;
      save.ink += Math.round(L.reward + r.score * 0.12);
      idx++;
      attempts = 0;
    } else {
      save.ink += Math.round(r.score * 0.05);
      attempts++;
      if (attempts > 12) break;      // wall: stop this run
    }
  }
  if (idx >= TOTAL_LEVELS) finished++;
}

console.log('lvl  rank        kind       win%   avg s  tries/clear');
for (let i = 0; i < TOTAL_LEVELS; i++) {
  const st = perLevel[i];
  if (!st.n) continue;
  const L = LEVELS[i];
  const winPct = (st.w / st.n * 100).toFixed(0).padStart(3);
  const tries = st.w ? (st.n / st.w).toFixed(1) : '—';
  const flag = st.to ? `  ${st.to} TIMEOUT` : '';
  const gap = L.tier - playerRankAt(i);
  console.log(
    `${String(i).padStart(3)}  ${RANKS[L.tier].name.padEnd(7)}${gap > 0 ? '↑' : gap < 0 ? '↓' : ' '}   ` +
    `${L.kind.padEnd(9)} ${winPct}%  ${(st.s / st.n).toFixed(1).padStart(5)}  ${String(tries).padStart(4)}${flag}`);
}
console.log(`\ncampaigns finished: ${finished}/${RUNS}`);
console.log(`avg fight ${(totals.seconds / totals.fights).toFixed(1)}s · avg campaign ${(totals.fights / RUNS).toFixed(0)} fights, ${(totals.seconds / RUNS / 60).toFixed(1)} min of fighting`);
