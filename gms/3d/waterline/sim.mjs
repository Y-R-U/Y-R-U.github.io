#!/usr/bin/env node
// Node soak harness for js/sim/. No browser, no renderer — the sim is pure, so it runs here at
// thousands of games a second and every invariant below is checked after every single shot.
//
//   node sim.mjs               # 2000 games
//   node sim.mjs 5000          # C5's gate
//   node sim.mjs 2000 --ladder # tier matrix + the monotone-with-separation gate and its control
//   node sim.mjs 300 --rungs   # the ladder curve as a player of fixed skill experiences it
//
// The invariant list is BUILD_PLAN §4.4, all nine of REVIEW.md B10's holes, and the gates
// REVIEW_SIM asked for in pass 2.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const sim = await import(resolve(ROOT, 'js/sim/index.js'));

const games = +(process.argv[2] || 2000);
const wantLadder = process.argv.includes('--ladder');
const wantRungs = process.argv.includes('--rungs');
const quiet = process.argv.includes('--quiet');

execFileSync('node', [resolve(ROOT, 'tools/purity.mjs')], { stdio: quiet ? 'ignore' : 'inherit' });

if (!sim.implemented) {
  console.log(`sim: stubs only — 0 of ${games} games run. C5 implements js/sim/, then this gate bites.`);
  process.exit(0);
}

let failures = 0;
const seen = new Set();
function fail(msg, ctx) {
  failures++;
  if (seen.has(msg)) return;
  seen.add(msg);
  console.error(`FAIL ${msg}`, ctx === undefined ? '' : JSON.stringify(ctx));
}

const { UNKNOWN, MISS, HIT, SUNK } = sim;

// Every game the harness builds needs a layoutSeed (D8). It is derived from the harness's own
// counter and NOT from the game's `seed`, which is exactly the separation the ruling is about —
// if these two were the same integer the soak would be re-testing the hole.
const LS = n => (Math.imul(n | 0, 0x9e3779b1) ^ 0x5ee0da7a) | 0;

function deepEq(a, b, path = '') {
  if (a === b) return null;
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return path || 'root';
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return `${path}[${i}]`;
    return null;
  }
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return path || 'root';
  if (Array.isArray(a) !== Array.isArray(b)) return path || 'root';
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return `${path}<keys ${ka.length}!=${kb.length}>`;
  for (const k of ka) {
    if (!(k in b)) return `${path}.${k}`;
    const r = deepEq(a[k], b[k], `${path}.${k}`);
    if (r) return r;
  }
  return null;
}

// ------------------------------------------------- the AI is structurally blind (BLOCK-4)
// "ai.js cannot reach a Game" was documented and false. It is now checked, because a sentence in
// a handoff does not survive the next agent to open the file.

// Strips comments properly. The previous version dropped any line whose FIRST character was a
// comment marker, which deleted code from `// eslint-disable */ import('./state.js')` and from
// every continuation line of a block comment — 2 of the 7 documented bypasses were that alone.
function stripComments(src) {
  let out = '', i = 0, mode = 0;                       // 0 code, 1 line comment, 2 block, 3 string
  let quote = '';
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (mode === 0) {
      if (c === '/' && d === '/') { mode = 1; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 2; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 3; quote = c; }
      out += c; i++;
    } else if (mode === 1) { if (c === '\n') { mode = 0; out += c; } i++; }
    else if (mode === 2) { if (c === '*' && d === '/') { mode = 0; i += 2; } else i++; }
    else { if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; } if (c === quote) mode = 0; out += c; i++; }
  }
  return out;
}

// Catches an ACCIDENT, not an adversary. The identifier regexes below cannot be made sound —
// `gameState`, `v[K]` and a re-export through an allowed module all walk straight past them, and
// the review demonstrated seven such bypasses. What this does buy is that the next agent who
// reaches for state.js in ai.js because it was convenient gets stopped at the build. The real
// guarantee is structural: ai.js is 300 lines, imports three files, and is handed a View.
function auditAiModule() {
  const code = stripComments(readFileSync(resolve(ROOT, 'js/sim/ai.js'), 'utf8'));
  const specifiers = [
    ...[...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]),
    ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]),
    ...[...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]),
  ];
  const allowed = ['./tables.js', './rng.js', './consts.js'];
  for (const i of specifiers) if (!allowed.includes(i)) fail('ai.js imports something that can reach a Game', { import: i });
  // Not `&& !specifiers.length`: ai.js has three literal imports, so that guard only ever fired on
  // a file with none — a concatenated import('./sta'+'te.js') sitting beside them was invisible.
  if (/\bimport\s*\(|\brequire\s*\(/.test(code)) fail('ai.js has a computed import specifier');
  if (/\bgame\b/.test(code)) fail('ai.js mentions `game` — it must only ever see a View');
  if (/\.players\b|\.ships\b|\.owner\b|\bseed\b/.test(code)) fail('ai.js touches a Game-shaped field');
}

// ---------------------------------------------------------------- degenerate newGame (B10.9)

function fuzzNewGame() {
  const rejects = [
    ['empty fleet', { w: 10, h: 10, fleet: [] }],
    ['unplaceable fleet', { w: 6, h: 6, fleet: [6, 6, 6, 6, 6, 6, 6] }],
    ['ship longer than min(w,h)', { w: 6, h: 8, fleet: [7] }],
    ['grid too small', { w: 4, h: 10, fleet: [3] }],
    ['grid too big', { w: 18, h: 10, fleet: [3] }],
    ['aspect over 2:1', { w: 16, h: 6, fleet: [3] }],
    ['13 ships', { w: 12, h: 12, fleet: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }],
    ['over the occupancy cap', { w: 6, h: 6, fleet: [6, 6, 3] }],
    ['under the occupancy floor', { w: 16, h: 16, fleet: [1] }],
    ['fractional grid', { w: 10.5, h: 10, fleet: [3] }],
    ['fractional ship', { w: 10, h: 10, fleet: [3.5] }],
    ['fleet not a list', { w: 10, h: 10, fleet: 5 }],
  ];
  for (const [label, opts] of rejects) {
    const why = sim.fleetLegal(opts.w, opts.h, opts.fleet);
    if (!why) { fail(`fleetLegal accepted a degenerate config: ${label}`, opts); continue; }
    let threw = null;
    try { sim.newGame(opts); } catch (e) { threw = e; }
    if (!threw) fail(`newGame accepted a degenerate config: ${label}`, opts);
    else if (threw.name !== 'RulesError' || threw.reason !== why) {
      fail(`newGame's failure for ${label} disagrees with fleetLegal`, { fleetLegal: why, threw: threw.message });
    }
  }

  const accepts = [
    ['w != h', { w: 12, h: 8, fleet: [5, 4, 3, 3, 2] }],
    ['length == min(w,h)', { w: 8, h: 6, fleet: [6, 3, 2] }],
    ['12 ships on 6x6', { w: 6, h: 6, fleet: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }],
    ['exactly at the occupancy cap', { w: 10, h: 10, fleet: [5, 5, 5, 5, 5, 5, 5] }],
    ['exactly at the occupancy floor', { w: 10, h: 10, fleet: [4, 4] }],
  ];
  for (const [label, opts] of accepts) {
    const why = sim.fleetLegal(opts.w, opts.h, opts.fleet);
    if (why) { fail(`fleetLegal rejected a legal config: ${label}`, { why }); continue; }
    try {
      const g = sim.newGame({ ...opts, seed: 3, layoutSeed: LS(3), tiers: [2, 2] });
      sim.placeFleet(g, 0, null);
      sim.placeFleet(g, 1, null);
      for (const p of g.players) {
        const occ = new Set();
        for (const s of p.ships) for (const c of s.cells) {
          if (c.r < 0 || c.c < 0 || c.r >= opts.h || c.c >= opts.w) fail(`placement off the board: ${label}`, c);
          const k = `${c.r},${c.c}`;
          if (occ.has(k)) fail(`placement overlaps: ${label}`, c);
          occ.add(k);
        }
        if (p.ships.length !== opts.fleet.length) fail(`wrong ship count: ${label}`);
      }
    } catch (e) { fail(`newGame/placeFleet threw on a legal config: ${label}`, { msg: e.message }); }
  }

  // Nonsense arguments must throw, not be silently coerced (REVIEW_SIM NOTE-1.6 / FIX-9).
  const nonsense = [
    ["seed 'abc'", { seed: 'abc' }],
    ['seed 1.5', { seed: 1.5 }],
    ['first 5', { seed: 1, first: 5 }],
    ['tiers [9,-3]', { seed: 1, tiers: [9, -3] }],
    ['tiers of the wrong length', { seed: 1, tiers: [1] }],
    ['ordnance salvo 1e9', { seed: 1, ordnance: { salvo: 1e9 } }],
    ['ordnance salvo -5', { seed: 1, ordnance: { salvo: -5 } }],
    ['ordnance salvo 2.5', { seed: 1, ordnance: { salvo: 2.5 } }],
    ['unknown ordnance kind', { seed: 1, ordnance: { nuke: 2 } }],
    ['layoutSeed "x"', { seed: 1, layoutSeed: 'x' }],
  ];
  for (const [label, opts] of nonsense) {
    let threw = null;
    try { sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], layoutSeed: 4242, ...opts }); } catch (e) { threw = e; }
    if (!threw) fail(`newGame silently accepted nonsense: ${label}`);
    else if (threw.name !== 'RulesError') fail(`newGame threw the wrong error type for ${label}`, { name: threw.name });
  }
}

// ---------------------------------------------------- hostile saves must be RulesErrors (FIX-1)

function fuzzDeserialize() {
  const g = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 11, layoutSeed: LS(11), tiers: [2, 3] });
  sim.placeFleet(g, 0, null); sim.placeFleet(g, 1, null);
  for (let i = 0; i < 12; i++) sim.fireRaw(g, g.sideToMove, sim.aiMove(g, g.sideToMove));
  const good = sim.serialize(g);

  const tamper = [
    ['nothing but a version', () => '{"v":1}'],
    ['not JSON', () => '{oh no'],
    ['not an object', () => '42'],
    ['w edited to 99', j => { j.w = 99; }],
    ['winner set while AIM', j => { j.winner = 1; }],
    ['phase OVER with no winner', j => { j.phase = 'OVER'; }],
    ['salvo charges to 999', j => { j.players[0].charges.salvo = 999; }],
    ['defender ships emptied', j => { j.players[1].ships = []; }],
    ['sideToMove set to 7', j => { j.sideToMove = 7; }],
    ['a ship moved without its cells', j => { j.players[0].ships[0].r = (j.players[0].ships[0].r + 3) % 6; }],
    ['a hit invented on open water', j => { const i = j.players[0].board.indexOf(UNKNOWN); j.players[0].board[i] = HIT; }],
    ['ship hit count inflated', j => {
      const s0 = j.players[0].ships.find(x => x.hits !== x.len) ?? j.players[0].ships[0];
      s0.hits = s0.hits === s0.len ? 0 : s0.len;
    }],
    ['owner map cleared', j => { j.players[1].owner = j.players[1].owner.map(() => -1); }],
    ['board truncated', j => { j.players[0].board.pop(); }],
    ['unknown phase', j => { j.phase = 'WOBBLE'; }],
    ['rng made a string', j => { j.rng = 'x'; }],
    ['fleet lengths changed', j => { j.fleet = [5, 4, 3, 3, 3]; }],
    ['a tier out of range', j => { j.tiers = [0, 9]; }],
  ];
  let caught = 0;
  for (const [label, fn] of tamper) {
    let payload;
    if (fn.length === 0) payload = fn();
    else { const j = JSON.parse(good); fn(j); payload = JSON.stringify(j); }
    let err = null;
    try { const back = sim.deserialize(payload); sim.viewAs(back, 0); sim.aiMove(back, back.sideToMove); }
    catch (e) { err = e; }
    if (!err) fail(`deserialize accepted a tampered save: ${label}`);
    else if (err.name !== 'RulesError') fail(`a tampered save threw ${err.name}, not RulesError: ${label}`, { msg: err.message });
    else caught++;
  }

  // deserialize(object) must be a copy, not an alias (FIX-1 / D4).
  const copy = sim.deserialize(JSON.parse(good));
  copy.turns = 9999;
  if (JSON.parse(good).turns === 9999) fail('deserialize(object) returned an alias, not a copy');
  return caught;
}

// ------------------------------------------------- snapTarget totality + idempotence (B10.5)

function fuzzSnap() {
  let n = 0;
  for (const [w, h, fleet] of [[10, 10, [5, 4, 3, 3, 2]], [6, 6, [3, 2, 2]], [16, 8, [5, 4, 3, 3, 2]],
    [8, 16, [5, 4, 3, 3, 2]], [16, 16, [6, 5, 4, 4, 3, 3, 2]], [12, 8, [5, 4, 3, 3, 2]]]) {
    const g = sim.newGame({ w, h, fleet, seed: 5, layoutSeed: LS(5), tiers: [2, 2] });
    sim.placeFleet(g, 0, null); sim.placeFleet(g, 1, null);
    const wild = [-99, -1, 0, 1, h - 1, h, h + 40, w + 40, 3.7, NaN, Infinity, -Infinity, '3', undefined, null, {}];
    for (const kind of ['shell', 'heavy', 'salvo', 'bogus', undefined, null, 42]) {
      for (const r of wild) for (const c of wild) {
        n++;
        const a = sim.snapTarget(g, { kind, r, c });
        const b = sim.snapTarget(g, a);
        if (a.kind !== b.kind || a.r !== b.r || a.c !== b.c) fail('snapTarget is not idempotent', { w, h, kind, r, c, a, b });
        const fp = sim.footprint(g, { kind, r, c });
        if (![1, 4, 9].includes(fp.length)) fail('footprint length is not 1, 4 or 9', { w, h, kind, n: fp.length });
        for (const cell of fp) {
          if (cell.r < 0 || cell.c < 0 || cell.r >= h || cell.c >= w) fail('footprint left the board', { w, h, kind, cell });
        }
        const why = sim.whyIllegal(g, g.sideToMove, a);
        if (why && !/charges|turn|placed|over/.test(why)) fail('snapTarget produced an illegal anchor', { a, why });
      }
    }
    for (const junk of [null, 0, 'shell', [], Object.create(null)]) {
      n++;
      const fp = sim.footprint(g, junk);
      if (![1, 4, 9].includes(fp.length)) fail('footprint of a malformed shot is not 1/4/9', { junk: String(junk) });
    }
  }
  return n;
}

// ------------------------------------------- the packRows fallback, forced (it never runs otherwise)

function fuzzPackFallback() {
  for (const cfg of [{ w: 10, h: 10, fleet: [5, 4, 3, 3, 2] }, { w: 12, h: 8, fleet: [5, 4, 3, 3, 2] },
    { w: 6, h: 6, fleet: [6, 6] }, { w: 16, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2] }, { w: 8, h: 6, fleet: [6, 3, 2] }]) {
    for (let seed = 1; seed <= 400; seed++) {
      const list = sim.packedPlacement(sim.makeRng(LS(seed)), cfg.w, cfg.h, cfg.fleet);
      const why = sim.fleetLegal(cfg.w, cfg.h, cfg.fleet);
      if (why) { fail('fuzzPackFallback got an illegal fleet', { cfg, why }); continue; }
      const occ = new Set();
      let cells = 0;
      for (const s of list) for (const c of sim.cellsOf(s)) {
        cells++;
        if (c.r < 0 || c.c < 0 || c.r >= cfg.h || c.c >= cfg.w) fail('packRows fallback placed a ship off the board', { cfg, c });
        const k = `${c.r},${c.c}`;
        if (occ.has(k)) fail('packRows fallback overlapped two ships', { cfg, c });
        occ.add(k);
      }
      if (cells !== cfg.fleet.reduce((a, b) => a + b, 0)) fail('packRows fallback lost cells', { cfg });
    }
  }
}

// ---------------------------------- termination and conservation on the awkward boards
// Extremes rather than the four shapes the main soak cycles: the occupancy cap, the aspect cap,
// twelve one-cell ships, a 2:1 board in both orientations.

function fuzzDegenerate() {
  const boards = [
    { w: 10, h: 10, fleet: [5, 5, 5, 5, 5, 5, 5] },
    { w: 16, h: 8, fleet: [5, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
    { w: 8, h: 16, fleet: [5, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
    { w: 6, h: 6, fleet: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    { w: 6, h: 12, fleet: [6, 6, 6, 3] },
    { w: 16, h: 16, fleet: [6, 5, 4, 4, 3, 3, 2] },
  ];
  let longest = 0;
  for (const cfg of boards) {
    const why = sim.fleetLegal(cfg.w, cfg.h, cfg.fleet);
    if (why) { fail(`fleetLegal rejected a board the soak needs: ${cfg.w}x${cfg.h}`, { why }); continue; }
    const bound = 4 * cfg.w * cfg.h;
    for (let seed = 1; seed <= 60; seed++) {
      const g = sim.newGame({ ...cfg, seed, layoutSeed: LS(seed), tiers: [seed % 5, (seed + 2) % 5], first: seed % 2 });
      sim.placeFleet(g, 0, null); sim.placeFleet(g, 1, null);
      let guard = 0;
      while (g.phase === 'AIM' && guard++ < bound + 10) sim.fireRaw(g, g.sideToMove, sim.aiMove(g, g.sideToMove));
      if (g.phase !== 'OVER') { fail(`${cfg.w}x${cfg.h} did not terminate inside 4·w·h`, { seed }); continue; }
      if (g.turns > bound) fail(`${cfg.w}x${cfg.h} exceeded 4·w·h`, { turns: g.turns, bound });
      longest = Math.max(longest, g.turns);
      const total = cfg.fleet.reduce((a, b) => a + b, 0);
      for (const p of g.players) {
        if (p.ships.reduce((a, s) => a + s.cells.length, 0) !== total) fail(`${cfg.w}x${cfg.h} lost ship cells`);
      }
      if (!g.players[1 - g.winner].ships.every(s => s.sunk)) fail(`${cfg.w}x${cfg.h} ended with the loser afloat`);
    }
  }
  return { boards: boards.length, longest };
}

// ------------------------------------------------------- the AI does not cheat (B10.3)

function permuteDefender(game, side, rnd) {
  const g2 = JSON.parse(sim.serialize(game));
  const def = g2.players[1 - side];
  const { w, h } = g2;
  const board = def.board;

  const blocked = new Uint8Array(w * h);
  const mustCover = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === MISS || board[i] === SUNK) blocked[i] = 1;
    else if (board[i] === HIT) mustCover.push(i);
  }
  const open = def.ships.filter(s => !s.sunk);
  if (!open.length) return { skip: 'every ship is already sunk' };

  const order = [...open].sort((a, b) => b.len - a.len);
  const occ = new Uint8Array(w * h);
  const chosen = new Map();
  let nodes = 0;

  const candidates = len => {
    const out = [];
    for (let r = 0; r < h; r++) for (let c = 0; c + len <= w; c++) out.push({ r, c, dir: 'h' });
    if (len > 1) for (let r = 0; r + len <= h; r++) for (let c = 0; c < w; c++) out.push({ r, c, dir: 'v' });
    for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  };

  const cellsOf = p => {
    const out = [];
    for (let i = 0; i < p.len; i++) out.push(p.dir === 'h' ? p.r * w + p.c + i : (p.r + i) * w + p.c);
    return out;
  };

  const tail = order.map((_, k) => order.slice(k).reduce((a, s) => a + s.len, 0));

  function search(k) {
    if (++nodes > 200000) return false;
    if (k === order.length) return mustCover.every(i => occ[i]);
    let need = 0;
    for (const i of mustCover) if (!occ[i]) need++;
    if (need > tail[k]) return false;
    const ship = order[k];
    for (const cand of candidates(ship.len)) {
      const cells = cellsOf({ ...cand, len: ship.len });
      let ok = true, hits = 0;
      for (const i of cells) {
        if (blocked[i] || occ[i]) { ok = false; break; }
        if (board[i] === HIT) hits++;
      }
      if (!ok || hits >= ship.len) continue;
      for (const i of cells) occ[i] = 1;
      chosen.set(ship.id, { ...cand, len: ship.len, cells });
      if (search(k + 1)) return true;
      for (const i of cells) occ[i] = 0;
      chosen.delete(ship.id);
    }
    return false;
  }

  if (!search(0)) return { skip: 'no consistent layout found inside the node cap' };
  let differs = false;
  for (const s of open) {
    const p = chosen.get(s.id);
    if (p.r !== s.r || p.c !== s.c || p.dir !== s.dir) differs = true;
  }
  if (!differs) return { skip: 'the resolved cells force the layout' };

  def.owner = new Array(w * h).fill(-1);
  for (const s of def.ships) {
    const p = s.sunk ? null : chosen.get(s.id);
    if (p) {
      s.r = p.r; s.c = p.c; s.dir = p.dir;
      s.cells = p.cells.map(i => ({ r: Math.floor(i / w), c: i % w }));
      s.hits = p.cells.filter(i => board[i] === HIT).length;
    }
    for (const c of s.cells) def.owner[c.r * w + c.c] = s.id;
  }
  return { game: sim.deserialize(JSON.stringify(g2)) };
}

// --------------------------------------------------------------------------- the soak

function soak(n) {
  let totalTurns = 0, permTests = 0, permSkips = 0, repeats = 0, redactChecks = 0;
  const permReasons = new Map();

  for (let gi = 0; gi < n; gi++) {
    const seed = gi + 1;
    const cfg = [
      { w: 10, h: 10, fleet: [5, 4, 3, 3, 2] },
      { w: 8, h: 8, fleet: [4, 3, 3, 2] },
      { w: 12, h: 8, fleet: [5, 4, 3, 3, 2] },
      { w: 12, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2] },
    ][gi % 4];
    const tiers = [gi % 5, (gi + 3) % 5];
    const game = sim.newGame({ ...cfg, seed, layoutSeed: LS(seed), tiers, first: gi % 2 });

    // replay == view from newGame onward, not just from the first shot (BLOCK-5).
    const agree = where => {
      for (const s of [0, 1]) {
        const d = deepEq(sim.replay(sim.eventsAs(game, s)), sim.viewAs(game, s));
        if (d) fail(`replay(eventsFor) != view at ${where}`, { gi, side: s, at: d });
      }
    };
    agree('newGame');
    sim.placeFleet(game, 0, null);
    agree('one fleet placed');
    sim.placeFleet(game, 1, null);
    agree('both fleets placed');

    const resolved = [new Map(), new Map()];
    const sunkSeen = [new Set(), new Set()];
    const bound = 4 * cfg.w * cfg.h;
    let over = 0, winner = null, guard = 0;

    while (game.phase === 'AIM') {
      if (++guard > bound + 10) { fail('game did not terminate inside 4·w·h turns', { gi, turns: game.turns }); break; }
      const side = game.sideToMove;

      const preAi = gi < 300 ? sim.serialize(game) : null;
      const shot = sim.aiMove(game, side);
      if (preAi !== null && sim.serialize(game) !== preAi) fail('aiMove mutated the game', { gi });
      if (sim.whyIllegal(game, side, shot)) fail('aiMove returned an illegal shot', { gi, shot, why: sim.whyIllegal(game, side, shot) });
      const fp = sim.footprint(game, shot);
      const enemyBoard = game.players[1 - side].board;
      const already = fp.filter(c => enemyBoard[c.r * cfg.w + c.c] !== UNKNOWN).length;
      if (shot.kind === 'shell' && already) fail('AI fired a shell at an already-resolved cell', { gi, tier: tiers[side], shot });
      if (shot.kind !== 'shell' && already * 2 > fp.length) fail('AI fired ordnance at a majority-resolved footprint', { gi, shot });

      // whyIllegal() and fire() must agree in both directions (B10.4).
      let threw = false;
      try { sim.fireRaw(game, 1 - side, { kind: shot.kind, r: shot.r, c: shot.c }); } catch { threw = true; }
      if (!threw) fail('fire() accepted a shot from the wrong side', { gi });
      if (gi < 300) {
        for (const probe of [
          { kind: 'shell', r: (game.turns * 7) % cfg.h, c: (game.turns * 11) % cfg.w },
          { kind: 'heavy', r: (game.turns * 3) % cfg.h, c: (game.turns * 5) % cfg.w },
          { kind: 'salvo', r: (game.turns * 13) % cfg.h, c: (game.turns * 17) % cfg.w },
          { kind: 'shell', r: -1, c: 0 }, { kind: 'salvo', r: 0, c: 0 }, { kind: 'nuke', r: 1, c: 1 },
        ]) {
          const why = sim.whyIllegal(game, side, probe);
          const copy = sim.deserialize(sim.serialize(game));
          let err = null;
          try { sim.fireRaw(copy, side, probe); } catch (e) { err = e; }
          if (why && !err) fail('fire() accepted a shot whyIllegal() rejected', { gi, probe, why });
          if (!why && err) fail('fire() rejected a shot whyIllegal() accepted', { gi, probe, msg: err.message });
        }
      }

      const before = { ...game.players[side].charges };
      const snapshot = sim.serialize(game);
      const events = sim.fireRaw(game, side, shot);

      // fire() is the channel a renderer animates; it must carry the same redaction eventsFor()
      // does, and must differ from the raw delta in shipId and nowhere else (BLOCK-3).
      if (gi < 300) {
        for (const viewer of [0, 1]) {
          redactChecks++;
          const back = sim.deserialize(snapshot);
          const shown = sim.fire(back, side, shot, viewer);
          if (shown.length !== events.length) fail('fire() and fireRaw() returned different event counts', { gi });
          shown.forEach((e, i) => {
            const raw = events[i];
            for (const k of new Set([...Object.keys(e), ...Object.keys(raw)])) {
              if (k === 'shipId' || k === 'ships') continue;
              if (JSON.stringify(e[k]) !== JSON.stringify(raw[k])) fail('fire() altered a field other than shipId', { gi, t: e.t, k });
            }
            if (e.t === 'result' && raw.at !== viewer && e.shipId !== null) fail('fire() leaked an enemy shipId', { gi, e });
            if (e.t === 'result' && raw.at === viewer && e.shipId !== raw.shipId) fail('fire() hid your own shipId from you', { gi, e });
          });
        }
      }

      totalTurns++;
      if (!events.some(e => e.t === 'result')) fail('fire() returned no result event', { gi, shot });
      if (events[0].t !== 'shot') fail('fire() did not lead with a shot event', { gi });
      for (const e of events) if (e.side === undefined || e.by === undefined) fail('an event is missing its side/by field', { gi, t: e.t });

      const order = { shot: 0, result: 1, sunk: 2, turn: 3, over: 3 };
      let last = -1, lastCell = -1;
      for (const e of events) {
        const rank = order[e.t];
        if (rank === undefined) fail('unknown event type', { gi, t: e.t });
        if (rank < last) fail('events out of order', { gi, t: e.t });
        if (e.t === 'result') {
          const k = e.r * cfg.w + e.c;
          if (k <= lastCell) fail('results are not row-major within the footprint', { gi, r: e.r, c: e.c });
          lastCell = k;
        }
        last = rank;
      }

      for (const e of events) {
        if (e.t === 'result') {
          if (e.by !== side || e.at !== 1 - side) fail('result by/at is wrong', { gi, e });
          const key = `${e.r},${e.c}`;
          const prev = resolved[e.at].get(key);
          if (prev !== undefined && prev !== e.hit) fail('cell resolved twice to a different value', { gi, key });
          if (prev !== undefined && !e.repeat) fail('a repeat result was not flagged repeat:true', { gi, key });
          if (prev === undefined && e.repeat) fail('a first result was flagged repeat:true', { gi, key });
          if (e.repeat) repeats++;
          resolved[e.at].set(key, e.hit);
        }
        if (e.t === 'sunk') {
          if (sunkSeen[e.at].has(e.shipId)) fail('sunk fired twice for one ship', { gi, ship: e.shipId });
          sunkSeen[e.at].add(e.shipId);
          if (e.cells.length !== e.len) fail('sunk cell count != ship length', { gi, ship: e.shipId });
        }
        if (e.t === 'over') { over++; winner = e.winner; }
      }

      for (const p of game.players) {
        for (const k of ['heavy', 'salvo']) {
          if (p.charges[k] < 0) fail('ordnance charges went negative', { gi, k });
          if (p.charges[k] > p.ordnanceStart[k]) fail('ordnance charges exceeded the starting value', { gi, k });
        }
        if (p.ordnanceStart.heavy !== game.players[0].ordnanceStart.heavy
          || p.ordnanceStart.salvo !== game.players[0].ordnanceStart.salvo) {
          fail('the two sides started with different ordnance', { gi });
        }
      }
      if (shot.kind !== 'shell') {
        const spent = before[shot.kind] - game.players[side].charges[shot.kind];
        if (spent !== 1 && spent !== 0) fail('firing ordnance did not cost exactly one charge', { gi, spent });
      }

      for (const p of game.players) {
        const cells = p.ships.reduce((a, s) => a + s.cells.length, 0);
        if (cells !== cfg.fleet.reduce((a, b) => a + b, 0)) fail('ship cell count not conserved', { gi });
        for (const s of p.ships) if (s.hits > s.len) fail('a ship took more hits than it has cells', { gi });
      }

      for (const s of [0, 1]) {
        const v = sim.viewAs(game, s);
        for (const e of v.enemyShips) {
          if (!e.sunk && (e.cells !== null || e.hits !== 0)) fail('view leaked an unsunk enemy ship', { gi, e });
        }
        const d = deepEq(sim.replay(sim.eventsAs(game, s)), v);
        if (d) fail('replay(eventsFor) != view after a shot', { gi, side: s, at: d });
      }

      if (game.turns > bound) fail('turns exceeded 4·w·h', { gi, turns: game.turns, bound });
    }
    agree('over');

    // The permutation test, on a probe game, with stops spread across the whole match rather than
    // bunched at the start — the endgame is where a hidden-information cheat pays most.
    if (gi % 11 === 0) {
      const probeTiers = [(gi / 11) % 5, ((gi / 11) + 2) % 5];
      const build = () => {
        const p = sim.newGame({ ...cfg, seed: seed * 7919, layoutSeed: LS(seed * 7919), tiers: probeTiers, first: 0 });
        sim.placeFleet(p, 0, null);
        sim.placeFleet(p, 1, null);
        return p;
      };
      // Measure this exact game's length first, so the stops land at real fractions of it. A fixed
      // schedule ran off the end of short games and never sampled the endgame, which is where a
      // hidden-information cheat pays most.
      let len = 0;
      { const p = build(); while (p.phase === 'AIM' && len < bound) { sim.fireRaw(p, p.sideToMove, sim.aiMove(p, p.sideToMove)); len++; } }
      const probe = build();
      let s = (seed * 2654435761) >>> 0;
      const rnd = m => { s = (s * 1664525 + 1013904223) >>> 0; return s % m; };
      const stops = new Set([0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95].map(f => Math.max(1, Math.round(f * len))));
      for (let t = 0; probe.phase === 'AIM' && t <= len; t++) {
        const side = probe.sideToMove;
        if (stops.has(t)) {
          const expect = sim.aiMove(probe, side);
          let alt = null;
          for (let a = 0; a < 3 && !alt?.game; a++) alt = permuteDefender(probe, side, rnd);
          if (!alt.game) { permSkips++; permReasons.set(alt.skip, (permReasons.get(alt.skip) ?? 0) + 1); }
          else {
            permTests++;
            const vd = deepEq(sim.viewAs(alt.game, side), sim.viewAs(probe, side));
            if (vd) fail('permuting the defender changed the attacker view', { gi, at: vd });
            const got = sim.aiMove(alt.game, side);
            if (got.kind !== expect.kind || got.r !== expect.r || got.c !== expect.c) {
              fail('aiMove changed when the hidden layout was permuted — the AI is cheating', { gi, t, expect, got });
            }
          }
        }
        sim.fireRaw(probe, side, sim.aiMove(probe, side));
      }
    }

    if (over !== 1) fail(`over fired ${over} times`, { gi });
    if (game.phase !== 'OVER') fail('game left AIM without going OVER', { gi, phase: game.phase });
    const wv = sim.viewAs(game, winner);
    if (!wv.ships.some(s => !s.sunk)) fail('winner has no unsunk ship', { gi });
    const loser = game.players[1 - winner];
    if (!loser.ships.every(s => s.sunk && s.hits === s.len)) fail('over fired with the loser still afloat', { gi });
    for (const s of loser.ships) {
      for (const c of s.cells) if (loser.board[c.r * cfg.w + c.c] !== SUNK) fail('a sunk ship has an unresolved cell', { gi });
    }
    if (sunkSeen[1 - winner].size !== cfg.fleet.length) fail('not every loser ship emitted sunk', { gi });

    const round = sim.deserialize(sim.serialize(game));
    const rd = deepEq(round, game);
    if (rd) fail('deserialize(serialize(g)) is not deep-equal to g', { gi, at: rd });
    if (sim.serialize(round) !== sim.serialize(game)) fail('serialize round trip differs', { gi });
    const rv = deepEq(sim.viewAs(round, 0), sim.viewAs(game, 0));
    if (rv) fail('view differs after a serialize round trip', { gi, at: rv });
  }

  return { totalTurns, permTests, permSkips, permReasons, repeats, redactChecks };
}

// ------------------------------------------------------------------- deterministic replay

function transcript(seed) {
  const game = sim.newGame({ w: 8, h: 8, fleet: [4, 3, 3, 2], seed, layoutSeed: LS(seed), tiers: [3, 4] });
  sim.placeFleet(game, 0, null);
  sim.placeFleet(game, 1, null);
  const log = [];
  while (game.phase === 'AIM' && log.length < 4000) {
    const side = game.sideToMove;
    for (const e of sim.fireRaw(game, side, sim.aiMove(game, side))) {
      log.push(e.t === 'over' ? `over:${e.winner}` : `${e.t}:${e.r ?? e.side ?? ''},${e.c ?? ''}`);
    }
  }
  return log.join('|');
}

// ------------------------------------------------------- the opening must not be one shot (FIX-4)

function openingSpread() {
  const out = [];
  for (const tier of [0, 1, 2, 3, 4]) {
    const first = new Map();
    for (let seed = 1; seed <= 400; seed++) {
      const g = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed, layoutSeed: LS(seed), tiers: [tier, tier] });
      sim.placeFleet(g, 0, null); sim.placeFleet(g, 1, null);
      const s = sim.aiMove(g, 0);
      const k = `${s.kind}@${s.r},${s.c}`;
      first.set(k, (first.get(k) ?? 0) + 1);
    }
    const top = [...first.values()].sort((a, b) => b - a)[0] / 400;
    out.push({ tier, distinct: first.size, top });
    if (tier >= 2 && first.size < 12) fail(`tier ${tier} has only ${first.size} distinct openings over 400 seeds`);
    if (tier >= 2 && top > 0.15) fail(`tier ${tier} plays the same opening in ${(top * 100).toFixed(0)}% of games`);
  }
  return out;
}

// ---------------------------------------- a hand-placed layout must not beat the AI forever (FIX-5)

const LAYOUTS = {
  random: null,
  edges: [{ r: 0, c: 0, dir: 'h' }, { r: 9, c: 0, dir: 'h' }, { r: 0, c: 9, dir: 'v' }, { r: 6, c: 9, dir: 'v' }, { r: 9, c: 8, dir: 'h' }],
  corners: [{ r: 0, c: 0, dir: 'v' }, { r: 0, c: 6, dir: 'h' }, { r: 7, c: 0, dir: 'v' }, { r: 7, c: 7, dir: 'h' }, { r: 9, c: 4, dir: 'h' }],
  centre: [{ r: 4, c: 3, dir: 'h' }, { r: 5, c: 3, dir: 'h' }, { r: 6, c: 4, dir: 'h' }, { r: 3, c: 4, dir: 'h' }, { r: 7, c: 4, dir: 'h' }],
};

// The AI is unopposed: only side 1 fires, so the score is purely how long that layout survives.
// `tail` is the last third — with a learning prior the early games are untrained by definition,
// and what matters is where it converges.
function shotsToClear(tier, layout, n, memory) {
  const shots = [];
  for (let seed = 1; seed <= n; seed++) {
    const prior = memory ? sim.placementPrior(memory, 10, 10) : null;
    const g = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed, layoutSeed: LS(seed), tiers: [null, tier], memories: [null, memory] });
    sim.placeFleet(g, 0, layout);
    sim.placeFleet(g, 1, null);
    let guard = 0;
    // Unopposed: side 0 never fires, so the turn is handed straight back. This is a measurement
    // of how long a layout survives, not a match.
    g.sideToMove = 1;
    while (g.phase === 'AIM' && guard++ < 400) { sim.fireRaw(g, 1, sim.aiMove(g, 1)); g.sideToMove = 1; }
    shots.push(g.players[1].shots);
    if (memory) sim.observeLayout(memory, 10, 10, sim.revealedLayout(g, 0));
  }
  const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
  return { mean: mean(shots), tail: mean(shots.slice(Math.floor(n * 2 / 3))) };
}

function exploitCheck(n) {
  const rows = [];
  for (const [label, layout] of Object.entries(LAYOUTS)) {
    rows.push({ label, naive: shotsToClear(4, layout, n, null), learned: shotsToClear(4, layout, n, sim.newMemory()) });
  }
  const base = rows.find(r => r.label === 'random');
  for (const r of rows) {
    if (r.label === 'random') continue;
    const gapNaive = (r.naive.tail - base.naive.tail) / base.naive.tail;
    const gapLearned = (r.learned.tail - base.learned.tail) / base.learned.tail;
    if (gapNaive > 0.1 && gapLearned > 0.1) {
      fail(`a fixed '${r.label}' layout still costs tier 4 ${(gapLearned * 100).toFixed(0)}% more shots after ${n} games of learning`);
    }
  }
  return rows;
}

// ------------------------------- the session guard, and layoutSeed on every entry point

function fuzzGuards() {
  const g = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 5, layoutSeed: LS(5), tiers: [null, 3], localSide: 0 });
  sim.placeFleet(g, 0, null); sim.placeFleet(g, 1, null);
  for (const [label, fn] of [
    ['view of the other side', () => sim.view(g, 1)],
    ['eventsFor the other side', () => sim.eventsFor(g, 1)],
  ]) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    if (!threw) fail(`${label} was allowed from a localSide:0 session`);
    else if (threw.name !== 'RulesError') fail(`${label} threw ${threw.name}, not RulesError`);
  }
  // ...and the named escape hatches must still work, or the guard is just a wall.
  try { sim.viewAs(g, 1); sim.eventsAs(g, 1); } catch (e) { fail('viewAs/eventsAs should not be guarded', { msg: e.message }); }
  const one = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 5, layoutSeed: LS(5), tiers: [null, 3], localSide: 1 });
  try { sim.view(one, 1); } catch (e) { fail('view(game, localSide) must be allowed', { msg: e.message }); }

  // D8: no entry point that can create a game may do so without a layoutSeed.
  for (const [label, fn] of [
    ['newGame', () => sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 9 })],
    ['ladderGame', () => sim.ladderGame(4, 909)],
    ['autoplay with a null game', () => sim.autoplay(null, 5, { seed: 909 })],
  ]) {
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    if (!threw) fail(`${label} created a game with no layoutSeed — the layout is derivable from the public seed (D8)`);
    else if (threw.name !== 'RulesError') fail(`${label} threw ${threw.name}, not RulesError`, { msg: threw.message });
  }
  // A raw prior is no longer an accepted input at all (R2-5).
  let threw = null;
  try { sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 9, layoutSeed: 1, priors: [null, new Array(100).fill(9)] }); }
  catch (e) { threw = e; }
  if (!threw) fail('newGame still accepts a raw prior array');
  for (const badMem of [{ v: 2, boards: {} }, { v: 1 }, { v: 1, boards: { bad: {} } }, { v: 1, boards: { '10x10': { n: 1, counts: [1], shots: 0, shotCounts: [] } } }]) {
    let t2 = null;
    try { sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 9, layoutSeed: 1, memories: [null, badMem] }); } catch (e) { t2 = e; }
    if (!t2 || t2.name !== 'RulesError') fail('newGame accepted a malformed memory', { badMem: JSON.stringify(badMem).slice(0, 60) });
  }
}

// ------------------------------------- the public seed must not be a layout oracle (D8)
// Reimplements the attack outside the sim: derive the placement stream from what an attacker
// actually holds and see whether the fleet comes out. The positive control matters as much as the
// negative one — an attacker WITH the layoutSeed must succeed, or the test proves nothing.

function seedOracle(seed, w, h, fleet, layoutSeed) {
  const cells = fleet.reduce((a, b) => a + b, 0);
  const rng = sim.makeRng(0);
  // The sim seeds its stream as hash(layoutSeed, w*31+h, cells) and draws placements from it.
  // Rebuild that by driving a throwaway game whose layoutSeed we are guessing.
  const g = sim.newGame({ w, h, fleet, seed, layoutSeed, tiers: [null, 3] });
  sim.placeFleet(g, 0, null);
  sim.placeFleet(g, 1, null);
  void rng;
  return g.players[1].ships.map(x => `${x.r},${x.c}${x.dir}`).join('|');
}

function seedOracleCheck(n) {
  const w = 10, h = 10, fleet = [5, 4, 3, 3, 2];
  let fromSeed = 0, fromLayoutSeed = 0, hidden = 0;
  for (let i = 0; i < n; i++) {
    const seed = i + 1;
    const secret = LS(i * 7919 + 13);
    const real = sim.newGame({ w, h, fleet, seed, layoutSeed: secret, tiers: [null, 3] });
    sim.placeFleet(real, 0, null);
    sim.placeFleet(real, 1, null);
    const truth = real.players[1].ships.map(x => `${x.r},${x.c}${x.dir}`).join('|');

    // The round-1 default that D8 removed, plus the bare seed and a couple of obvious guesses.
    for (const guess of [seed, (seed * 2654435761) | 0, 0, 1]) {
      if (seedOracle(seed, w, h, fleet, guess) === truth) { fromSeed++; break; }
    }
    if (seedOracle(seed, w, h, fleet, secret) === truth) fromLayoutSeed++;

    // Tier 4's HIDDEN fleet is the same question: the 48-candidate draw runs off the same stream.
    const ghost = sim.newGame({ w: 12, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2], seed, layoutSeed: secret, tiers: [null, 4] });
    sim.placeFleet(ghost, 1, null);
    const gTruth = ghost.players[1].ships.map(x => `${x.r},${x.c}${x.dir}`).join('|');
    for (const guess of [seed, (seed * 2654435761) | 0, 0, 1]) {
      const probe = sim.newGame({ w: 12, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2], seed, layoutSeed: guess, tiers: [null, 4] });
      sim.placeFleet(probe, 1, null);
      if (probe.players[1].ships.map(x => `${x.r},${x.c}${x.dir}`).join('|') === gTruth) { hidden++; break; }
    }
  }
  if (fromSeed) fail(`the fleet is recoverable from the public seed in ${fromSeed}/${n} games`);
  if (hidden) fail(`tier 4's hidden fleet is recoverable from the public seed in ${hidden}/${n} games`);
  if (fromLayoutSeed !== n) fail(`the oracle test is broken: knowing layoutSeed reproduced only ${fromLayoutSeed}/${n}`);
  return { fromSeed, hidden, fromLayoutSeed, n };
}

// ------------------------- the sim must be immune to config.js being edited underneath it (R2-7)

async function configImmunityCheck() {
  const cfg = await import(resolve(ROOT, 'js/config.js'));
  const build = () => {
    const g = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 3, layoutSeed: 77, tiers: [2, 2] });
    sim.placeFleet(g, 0, null);
    sim.placeFleet(g, 1, null);
    return sim.serialize(g);
  };
  const before = build();
  const saved = { tries: cfg.BOARD.placeTries, occ: cfg.BOARD.occupancy, offsets: cfg.ORDNANCE.salvo.offsets };
  try {
    cfg.BOARD.placeTries = 0;
    cfg.BOARD.occupancy = 0.01;
    cfg.ORDNANCE.salvo.offsets = [[0, 0]];
    if (build() !== before) fail('editing js/config.js changed the sim underneath it');
    if (sim.footprint({ w: 10, h: 10 }, { kind: 'salvo', r: 5, c: 5 }).length !== 9) fail('editing js/config.js changed the ordnance footprint');
    if (sim.fleetLegal(10, 10, [5, 4, 3, 3, 2])) fail('editing js/config.js changed fleet legality');
  } finally {
    cfg.BOARD.placeTries = saved.tries;
    cfg.BOARD.occupancy = saved.occ;
    cfg.ORDNANCE.salvo.offsets = saved.offsets;
  }
}

// ---------------------------------- the deprecation aliases must be gone, not hidden (R2-6)

function aliasCheck() {
  const g = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 2, layoutSeed: 21, tiers: [null, 2] });
  sim.placeFleet(g, 0, null); sim.placeFleet(g, 1, null);
  const v = sim.view(g, 0);
  for (const [label, obj, key] of [['game.turn', g, 'turn'], ['game.first', g, 'first'],
    ['players[0].start', g.players[0], 'start'], ['view.turn', v, 'turn']]) {
    if (key in obj) fail(`${label} still exists — a non-enumerable alias survives serialize but not structuredClone or a spread`);
  }
  // The replacements must survive every copy a renderer plausibly makes.
  for (const [label, copy] of [['structuredClone', structuredClone(g)], ['JSON round trip', JSON.parse(JSON.stringify(g))],
    ['spread', { ...g }], ['deserialize', sim.deserialize(sim.serialize(g))]]) {
    if (copy.sideToMove !== g.sideToMove || copy.firstMove !== g.firstMove) fail(`sideToMove/firstMove lost across ${label}`);
  }
  if (structuredClone(g).players[0].ordnanceStart.heavy !== g.players[0].ordnanceStart.heavy) fail('ordnanceStart lost across structuredClone');
}

// -------------------------------------- the adaptive prior must not pay to poison (R2-2)

const RUNG8 = { w: 12, h: 12, fleet: [6, 5, 4, 4, 3, 3, 2] };
const CORNER = [{ r: 0, c: 0, dir: 'h' }, { r: 1, c: 0, dir: 'h' }, { r: 2, c: 0, dir: 'h' },
  { r: 3, c: 0, dir: 'h' }, { r: 4, c: 0, dir: 'h' }, { r: 5, c: 0, dir: 'h' }, { r: 6, c: 0, dir: 'h' }];
const CENTRE = [{ r: 5, c: 3, dir: 'h' }, { r: 6, c: 3, dir: 'h' }, { r: 7, c: 4, dir: 'h' },
  { r: 4, c: 4, dir: 'h' }, { r: 8, c: 5, dir: 'h' }, { r: 3, c: 5, dir: 'h' }, { r: 9, c: 5, dir: 'h' }];

function rung8Run(layoutFor, n, mem, offset = 0) {
  let wins = 0, played = 0;
  for (let i = 0; i < n; i++) {
    const g = sim.ladderGame(8, i + 1 + offset * 7919, {
      layoutSeed: LS(i + 1 + offset * 104729), playerTier: 2, first: i % 2,
      placements: layoutFor(i), aiMemory: mem,
    });
    let guard = 0;
    while (g.phase === 'AIM' && guard++ < 4 * g.w * g.h + 10) sim.fireRaw(g, g.sideToMove, sim.aiMove(g, g.sideToMove));
    if (g.winner === null) continue;
    played++;
    if (g.winner === 0) wins++;
    if (mem) {
      sim.observeLayout(mem, g.w, g.h, sim.revealedLayout(g, 0));
      sim.observeShots(mem, g.w, g.h, sim.shotHistory(g, 0));
    }
  }
  return played ? wins / played : 0;
}

function poisonCheck(n) {
  const auto = rung8Run(() => null, n, null);
  const honest = (() => { const m = sim.newMemory(); return rung8Run(() => CENTRE, n, m); })();
  const poisoned = (() => {
    const m = sim.newMemory();
    rung8Run(() => CORNER, 12, m, 3);            // the sacrificial games, not scored
    return rung8Run(() => CENTRE, n, m, 5);
  })();
  // Teaching Ghost a lie must not beat simply auto-placing. Unbounded, twelve sacrificial games
  // moved a cell's multiplier to ~3.9x and took a tier-2 player from 10.0% to 22.8% on the rung
  // that sets complete:true — a better payoff than the exploit the prior exists to close.
  if (poisoned > auto + 0.05) {
    fail(`poisoning the adaptive prior pays: ${(poisoned * 100).toFixed(1)}% against ${(auto * 100).toFixed(1)}% for auto-placing`);
  }
  return { auto, honest, poisoned };
}

// ---------------------------------------------------------------------------- the ladder

function playout(tierA, tierB, seed, first, ordnance) {
  const game = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed, layoutSeed: LS(seed), tiers: [tierA, tierB], first, ordnance });
  sim.placeFleet(game, 0, null);
  sim.placeFleet(game, 1, null);
  let guard = 0;
  while (game.phase === 'AIM' && guard++ < 4 * 10 * 10 + 10) sim.fireRaw(game, game.sideToMove, sim.aiMove(game, game.sideToMove));
  if (game.winner === null) { fail('a ladder playout did not terminate', { tierA, tierB, seed }); return null; }
  return game.winner;
}

// Both sides handed layouts from the same plain-random family, so the only thing left between
// them is how they AIM. This is the confound sim.mjs's ordnance-off control did not remove: with
// hiding live, "tier 4 wins with ordnance off" was measuring where it parked its ships.
function pairingForced(a, b, n) {
  let winsA = 0, played = 0;
  const cfg = { w: 10, h: 10, fleet: [5, 4, 3, 3, 2] };
  for (let i = 0; i < n; i++) {
    const src = sim.newGame({ ...cfg, seed: i + 1, layoutSeed: LS(i + 9001), tiers: [2, 2] });
    sim.placeFleet(src, 0, null);
    sim.placeFleet(src, 1, null);
    const layouts = [0, 1].map(sd => src.players[sd].ships.map(x => ({ r: x.r, c: x.c, dir: x.dir })));
    const g = sim.newGame({ ...cfg, seed: i + 1, layoutSeed: LS(i + 1), tiers: [a, b], first: i % 2, ordnance: false });
    sim.setBoard(g, 0, layouts[i % 2]);
    sim.setBoard(g, 1, layouts[1 - i % 2]);
    let guard = 0;
    while (g.phase === 'AIM' && guard++ < 4 * 10 * 10 + 10) sim.fireRaw(g, g.sideToMove, sim.aiMove(g, g.sideToMove));
    if (g.winner === null) { fail('a forced-layout playout did not terminate', { i }); continue; }
    played++;
    if (g.winner === 0) winsA++;
  }
  return { winsA, played };
}

function pairing(a, b, n, ordnance) {
  let winsA = 0, played = 0;
  for (let i = 0; i < n; i++) {
    const w = playout(a, b, i + 1 + a * 7919 + b * 104729, i % 2, ordnance);
    if (w === null) continue;
    played++;
    if (w === 0) winsA++;
  }
  return { winsA, played };
}

const ci = (w, n) => (n ? 1.96 * Math.sqrt((w / n) * (1 - w / n) / n) : 1);

function ladderMatrix(n) {
  const tiers = [0, 1, 2, 3, 4];
  const wins = tiers.map(() => tiers.map(() => 0));
  const played = tiers.map(() => tiers.map(() => 0));
  for (const a of tiers) for (const b of tiers) {
    if (a >= b) continue;
    const r = pairing(a, b, n);
    wins[a][b] = r.winsA; wins[b][a] = r.played - r.winsA;
    played[a][b] = r.played; played[b][a] = r.played;
  }
  return { tiers, wins, played };
}

function rungCurve(n) {
  const rows = [];
  for (const rung of sim.ladderRungs) {
    const row = { rung: rung.rung, name: rung.name, tier: rung.tier, w: rung.w, h: rung.h, by: {} };
    for (const skill of [1, 2, 3]) {
      let wins = 0, played = 0;
      for (let i = 0; i < n; i++) {
        const g = sim.ladderGame(rung.rung, i + 1 + rung.rung * 7919, { layoutSeed: LS(i + 1 + rung.rung * 104729), playerTier: skill, first: i % 2 });
        let guard = 0;
        while (g.phase === 'AIM' && guard++ < 4 * g.w * g.h + 10) sim.fireRaw(g, g.sideToMove, sim.aiMove(g, g.sideToMove));
        if (g.winner === null) { fail('a rung playout did not terminate', { rung: rung.rung }); continue; }
        played++;
        if (g.winner === 0) wins++;
      }
      row.by[skill] = { p: wins / played, e: ci(wins, played) };
    }
    rows.push(row);
  }
  return rows;
}

// ------------------------------------------------------------------------------- run it

const t0 = process.hrtime.bigint();
auditAiModule();
fuzzNewGame();
const hostileCaught = fuzzDeserialize();
fuzzGuards();
aliasCheck();
await configImmunityCheck();
const oracle = seedOracleCheck(150);
const snapInputs = fuzzSnap();
fuzzPackFallback();
const degen = fuzzDegenerate();
const stats = soak(games);
const openings = openingSpread();
const exploit = exploitCheck(120);
const poison = poisonCheck(150);

const a = transcript(7), b = transcript(7), c = transcript(8);
if (a !== b) fail('a fixed seed did not replay identically');
if (a === c) fail('two different seeds produced an identical transcript');

const secs = Number(process.hrtime.bigint() - t0) / 1e9;
if (!quiet) {
  console.log(`sim: ${games} games, ${stats.totalTurns} shots, ${stats.repeats} repeat results, `
    + `${stats.permTests} AI-blindness permutations (${stats.permSkips} skipped), `
    + `${stats.redactChecks} fire()-redaction checks, ${hostileCaught} hostile saves rejected, `
    + `${snapInputs} snapTarget inputs, ${degen.boards} degenerate boards (longest ${degen.longest} turns), ${secs.toFixed(1)}s`);
  for (const [why, n] of stats.permReasons) console.log(`  permutation skipped ${n}x: ${why}`);
  console.log('  opening spread over 400 seeds: '
    + openings.map(o => `T${o.tier} ${o.distinct} distinct/${(o.top * 100).toFixed(0)}% top`).join('  '));
  console.log(`  seed oracle: ${oracle.fromSeed}/${oracle.n} fleets and ${oracle.hidden}/${oracle.n} hidden fleets `
    + `recovered from the public seed (${oracle.fromLayoutSeed}/${oracle.n} with the layoutSeed, the positive control)`);
  console.log(`  rung 8, tier-2 player: auto-place ${(poison.auto * 100).toFixed(1)}%  ·  one honest layout `
    + `${(poison.honest * 100).toFixed(1)}%  ·  12 poison games then switch ${(poison.poisoned * 100).toFixed(1)}%`);
  console.log('  shots for tier 4 to clear a hand-placed fleet, converged (uniform prior → learned prior):');
  for (const r of exploit) console.log(`    ${r.label.padEnd(9)} ${r.naive.tail.toFixed(1)} → ${r.learned.tail.toFixed(1)}`);
}

if (wantLadder) {
  const { tiers, wins, played } = ladderMatrix(games);
  const rate = (w, n) => (n ? w / n : 0);
  console.log('\nhead-to-head win rate, row beats column:');
  console.log('        ' + tiers.map(t => `T${t}`.padStart(7)).join(''));
  for (const a2 of tiers) {
    console.log(`  T${a2}   ` + tiers.map(b2 => (a2 === b2 ? '     — ' : `${(rate(wins[a2][b2], played[a2][b2]) * 100).toFixed(1)}%`.padStart(7))).join(''));
  }

  // The gate is the ADJACENT head-to-head, not the round-robin average: averaging tier 0 only
  // against stronger tiers and tier 4 only against weaker ones stretches the ends mechanically
  // (REVIEW_SIM FIX-2). These are the numbers a player climbing the ladder actually meets.
  console.log('\nadjacent step (the gate): each must be >= 55% with the interval clear of 50%');
  for (let i = 1; i < tiers.length; i++) {
    const lo = tiers[i - 1], hi = tiers[i];
    const w = wins[hi][lo], n = played[hi][lo], p = rate(w, n), e = ci(w, n);
    const ok = p >= 0.55 && p - e > 0.5;
    console.log(`  T${hi} vs T${lo}: ${(p * 100).toFixed(1)}% ± ${(e * 100).toFixed(1)}  ${ok ? 'pass' : 'FAIL'}`);
    if (!ok) fail(`ladder step T${lo} → T${hi} is ${(p * 100).toFixed(1)}% ± ${(e * 100).toFixed(1)}`);
  }

  console.log('\nround robin, for reference only — excl-self is inflated at the ends, incl-self is not:');
  for (const t of tiers) {
    const wx = tiers.reduce((s, o) => s + (o === t ? 0 : wins[t][o]), 0);
    const nx = tiers.reduce((s, o) => s + (o === t ? 0 : played[t][o]), 0);
    const self = pairing(t, t, Math.round(games / 4));
    const wi = wx + self.winsA, ni = nx + self.played;
    console.log(`  tier ${t} ${sim.TIER_NAMES[t].padEnd(13)} excl-self ${(wx / nx * 100).toFixed(1)}%   incl-self ${(wi / ni * 100).toFixed(1)}%`);
  }

  // The control REVIEW_SIM BLOCK-1 asked for: hold ordnance constant and the separation must
  // survive. If it does not, the ladder is measuring ammunition, not skill.
  console.log('\ntier 4 vs tier 3 with the confound held constant:');
  const base = sim.newGame({ w: 10, h: 10, fleet: [5, 4, 3, 3, 2], seed: 1, layoutSeed: 1 }).players[0].ordnanceStart;
  const conditions = [
    ['table charges, both sides', undefined],
    ['1.5x charges, both sides', { heavy: Math.ceil(base.heavy * 1.5), salvo: Math.ceil(base.salvo * 1.5) }],
    ['ordnance disabled entirely', false],
  ];
  for (const [label, ord] of conditions) {
    const r = pairing(3, 4, games, ord);
    const p = 1 - r.winsA / r.played, e = ci(r.played - r.winsA, r.played);
    console.log(`  ${label.padEnd(28)} T4 ${(p * 100).toFixed(1)}% ± ${(e * 100).toFixed(1)}`);
    if (p - e <= 0.5) fail(`tier 4 does not beat tier 3 when ${label} — the separation is ammunition, not policy`);
  }

  // The fourth condition, and the honest one: ordnance off AND both fleets from a common family.
  // Tier 4 does not lead here and is not expected to — its margin is placement and ordnance
  // policy, not aiming. What this gate catches is aiming that has been actively broken.
  {
    const r = pairingForced(3, 4, games);
    const p = 1 - r.winsA / r.played, e = ci(r.played - r.winsA, r.played);
    console.log(`  aiming alone (ordnance off, both fleets forced from one family)`.padEnd(30) + ` T4 ${(p * 100).toFixed(1)}% ± ${(e * 100).toFixed(1)}`);
    console.log('    tier 4 is NOT expected to lead here — see HANDOFF §7. The gate is that it is not broken.');
    if (p < 0.42) fail(`tier 4's aiming alone is ${(p * 100).toFixed(1)}% against tier 3 — below the 42% floor`);
  }
}

if (wantRungs) {
  console.log('\nladder curve — a player of fixed skill against each rung as ladderGame() builds it:');
  console.log('  rung  opponent          tier  grid   ordnance         T1            T2            T3');
  const curve = rungCurve(games);
  for (const r of curve) {
    const cfg = sim.rungConfig(r.rung);
    const ord = cfg.ordnance === false ? 'none' : cfg.ordnance ? `h${cfg.ordnance.heavy} s${cfg.ordnance.salvo}` : 'table';
    console.log(`   ${r.rung}    ${r.name.padEnd(16)} T${r.tier}   ${`${r.w}x${r.h}`.padEnd(6)} ${ord.padEnd(9)} `
      + [1, 2, 3].map(s => `${(r.by[s].p * 100).toFixed(1)}±${(r.by[s].e * 100).toFixed(1)}`.padStart(13)).join(' '));
  }
  // A ladder is a curve or it is a step function. Every skill level must find each rung no easier
  // than the one below it, allowing for the interval, and no single step may be a cliff.
  for (const skill of [1, 2, 3]) {
    for (let i = 1; i < curve.length; i++) {
      const lo = curve[i].by[skill], hi = curve[i - 1].by[skill];
      if (lo.p - lo.e > hi.p + hi.e) fail(`rung ${curve[i].rung} is easier than rung ${curve[i - 1].rung} for a tier-${skill} player`);
      // The cliff check starts at rung 2. Rung 1 is tier 0, which loses to every other tier 100%
      // of the time (measured, 0/8000): it is a guaranteed win by construction, so the step off it
      // is always large and says nothing about spacing.
      if (i > 1 && hi.p - lo.p > 0.34) fail(`the step from rung ${curve[i - 1].rung} to ${curve[i].rung} is ${((hi.p - lo.p) * 100).toFixed(0)} points for a tier-${skill} player`);
    }
    const top = curve[curve.length - 1].by[skill];
    if (skill === 3 && top.p < 0.15) fail(`rung 8 is unwinnable even for a tier-3 player (${(top.p * 100).toFixed(1)}%)`);
  }
}

console.log(failures ? `\nsim: ${failures} failure(s)` : '\nsim: ok — every invariant held');
process.exit(failures ? 1 : 0);
