#!/usr/bin/env node
// Validates every shipped puzzle with the core rules:  node tools/puzzles_test.mjs
//  - index <-> chunk consistency, unique ids, ratings ascending per region
//  - every move legal; the line ends on a player move; mate puzzles end in checkmate
//  - mate-in-1..3 (and classics up to 4): the key move forces mate in N, no faster mate,
//    unique key for N >= 2 (js/chess/solve.js)
//  - PuzzleRun plays each line to completion; a wrong move is rejected; any mating move is accepted
//  - map graph: every node reachable, the first node is open on a fresh profile
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from '../js/chess/chess.js';
import { solveMate } from '../js/chess/solve.js';
import { validatePuzzle, PuzzleRun, lanOf, eloUpdate } from '../js/puzzles/logic.js';
import { REGIONS } from '../js/puzzles/regions.js';
import { buildGraph, computeState, nextOpen } from '../js/puzzles/layout.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets/puzzles');
const load = f => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
let fails = 0, checks = 0;
const bad = (msg) => { fails++; if (fails < 40) console.log('FAIL', msg); };
const ok = (c, msg) => { checks++; if (!c) bad(msg); };

const index = load('index.json');
ok(/Lichess/.test(index.attribution) && /CC0/.test(index.attribution), 'attribution present');
const ids = new Set();
const stats = [];
let solved = 0, t0 = Date.now();
for (const reg of REGIONS) {
  const ir = index.regions.find(r => r.id === reg.id);
  ok(!!ir, `region ${reg.id} in index`);
  if (!ir) continue;
  const list = load(`${reg.id}.json`);
  ok(list.length === ir.nodes.length, `${reg.id}: index count ${ir.nodes.length} vs chunk ${list.length}`);
  const byId = new Map(list.map(p => [p.id, p]));
  const row = { region: reg.name, n: list.length, lo: Infinity, hi: 0, m1: 0, m2: 0, m3: 0, m4p: 0, tactic: 0, classic: 0, moves: [0, 0, 0, 0] };
  let prevR = 0;
  for (const [id, r, cl] of ir.nodes) {
    const p = byId.get(id);
    ok(!!p, `${reg.id}: ${id} missing from chunk`);
    if (!p) continue;
    ok(!ids.has(id), `duplicate id ${id}`); ids.add(id);
    ok(p.r === r && !!p.n === !!cl, `${id}: index rating/flag mismatch`);
    ok(r >= prevR, `${reg.id}: ratings not ascending at ${id}`); prevR = r;
    const v = validatePuzzle(p, { solveMate: (f, n) => solveMate(f, n, { maxNodes: 4e6 }), maxSolve: p.n ? 4 : 3 });
    if (!v.ok) bad(`${id}: ${v.errors.join('; ')}`); else checks++;
    if (v.info.solve) solved++;
    // play it through PuzzleRun
    const run = new PuzzleRun(p);
    run.start();
    // a non-mating wrong move must be rejected
    const exp = run.expected();
    const wrong = run.chess.moves({ verbose: true }).find(m => lanOf(m) !== exp && !m.san.includes('#'));
    if (wrong) { const res = run.tryMove(wrong); ok(!res.ok && run.expected() === exp, `${id}: wrong move ${wrong.san} accepted`); }
    let guard = 0, last = null;
    while (!run.done && guard++ < 40) { last = run.playExpected(); if (!last.ok) { bad(`${id}: line rejected at ${run.expected()}`); break; } }
    ok(run.done, `${id}: run did not finish`);
    if (v.info.mateIn) ok(last && last.mate, `${id}: final move not reported as mate`);
    // any mating move is accepted at the last step
    if (v.info.mateIn === 1) {
      const r2 = new PuzzleRun(p); r2.start();
      const mates = r2.chess.moves({ verbose: true }).filter(m => m.san.includes('#'));
      for (const m of mates) { const rr = new PuzzleRun(p); rr.start(); ok(rr.tryMove(m).ok, `${id}: alternative mate ${m.san} rejected`); }
    }
    row.lo = Math.min(row.lo, r); row.hi = Math.max(row.hi, r);
    const mi = v.info.mateIn;
    if (p.n) row.classic++;
    if (mi === 1) row.m1++; else if (mi === 2) row.m2++; else if (mi === 3) row.m3++; else if (mi >= 4) row.m4p++; else row.tactic++;
    const pm = Math.ceil((p.m.split(' ').length - (p.pf ? 0 : 1)) / 2);
    row.moves[Math.min(4, pm) - 1]++;
  }
  stats.push(row);
}

// graph
const g = buildGraph(index, REGIONS);
ok(g.order.length === ids.size, `graph has every node (${g.order.length}/${ids.size})`);
const fresh = computeState(g, REGIONS, { s: {}, r: 800 });
ok(nextOpen(g, fresh) === g.order[0], 'first node open on a fresh profile');
ok([...fresh.state.values()].filter(s => s === 'open').length === 1, 'exactly one open node on a fresh profile');
// solving along the order opens everything
const prog = { s: {}, r: 800 };
let reach = 0;
for (let i = 0; i < g.order.length; i++) {
  const st = computeState(g, REGIONS, prog);
  const nx = nextOpen(g, st);
  if (!nx) break;
  prog.s[nx] = 3; reach++;
  if (i % 50 === 0) ok(st.state.get(nx) === 'open', 'next is open');
}
ok(reach === g.order.length, `all nodes reachable by playing (${reach}/${g.order.length})`);
// branches: some rows have 2-3 lanes
ok(g.rows.some(r => r.ids.length === 2) && g.rows.some(r => r.ids.length === 3), 'map has side paths');
// Elo sanity
ok(eloUpdate(800, 0, 800, 1) > 800 && eloUpdate(800, 0, 800, 0) < 800 && eloUpdate(1500, 50, 600, 1) - 1500 < 3, 'elo update');

console.log('\nregion             count  rating      m1  m2  m3  m4+ tactic classic | 1-move 2-move 3-move 4+');
for (const r of stats) console.log(`${r.region.padEnd(18)} ${String(r.n).padStart(5)}  ${r.lo}-${r.hi}`.padEnd(37) + ` ${String(r.m1).padStart(3)} ${String(r.m2).padStart(3)} ${String(r.m3).padStart(3)} ${String(r.m4p).padStart(4)} ${String(r.tactic).padStart(6)} ${String(r.classic).padStart(7)} | ${r.moves.map(x => String(x).padStart(6)).join(' ')}`);
const tot = stats.reduce((s, r) => s + r.n, 0);
console.log(`total ${tot} puzzles (${stats.reduce((s, r) => s + r.classic, 0)} classics), ${solved} mate puzzles proved with the solver, ${checks} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(fails ? `\n${fails} FAILURES` : 'ALL PASS');
process.exit(fails ? 1 : 0);
