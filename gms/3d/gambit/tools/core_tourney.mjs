// Bot-vs-bot calibration tourney (node, worker_threads).
//
//   node tools/core_tourney.mjs --pairs pip:mabel,mabel:otto --games 40 --threads 8
//   node tools/core_tourney.mjs --ladder --games 30          # each bot vs its 2 neighbours above
//   node tools/core_tourney.mjs --anchor ada --sf 1700,1900,2100 --games 30
//   node tools/core_tourney.mjs --rate results/*.json        # just recompute ratings
//
// Players: persona ids from js/bots/personas.js, or `sf<elo>` (Stockfish UCI_LimitStrength
// anchor, e.g. sf1500) / `sfmax`. Games are untimed and node-limited, so results do not
// depend on the machine. Each pairing plays both colours from the same random book opening.
// Results are appended to tools/core_tourney_results.jsonl; ratings are a Bradley-Terry
// maximum-likelihood fit with the Stockfish anchors held at their UCI_Elo.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Position, START_FEN } from '../js/chess/chess.js';
import { Engine } from '../js/bots/engine.js';
import { chooseMove, makeRng, bookMove } from '../js/bots/play.js';
import { BOTS, byId as byIdShipped, sfSkillLevel } from '../js/bots/personas.js';
import { CANDIDATES } from './core_candidates.mjs';
const byId = (id) => byIdShipped(id) || CANDIDATES[id];

const __file = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__file), '..');
const RESULTS = path.join(ROOT, 'tools', 'core_tourney_results.jsonl');

// ---------------------------------------------------------------- Stockfish (node)
export async function loadSF() {
  const require = createRequire(import.meta.url);
  const eng = await require(path.join(ROOT, 'js/bots/stockfish/stockfish-19-lite-single.js'))();
  let waiters = [];
  eng.listener = (line) => { for (const w of waiters.slice()) w(line); };
  const send = (c) => eng.processCommand(c);
  const until = (re) => new Promise((res) => {
    const f = (l) => { if (re.test(l)) { waiters = waiters.filter((x) => x !== f); res(l); } };
    waiters.push(f);
  });
  const u = until(/^uciok/); send('uci'); await u;
  return { send, until, eng };
}

export function sfPlayer(id) {
  // `sf1500` = limited, `sfmax` = full strength; persona ids with engine:'sf' map to these
  const persona = byId(id);
  let elo = persona ? persona.sfElo : (id === 'sfmax' ? 0 : +id.slice(2));
  const nodes = persona?.sfNodes || 1500000;
  return { id, sf: true, elo, nodes, book: persona ? persona.book : 0 };
}

async function sfMove(sf, p, startFen, moves, rng, plyFromStart) {
  if (p.book && plyFromStart < p.book) {
    const pos = new Position(startFen); for (const l of moves) pos.make(pos.lanToMove(l));
    const bm = bookMove(pos.fen(), rng); if (bm) return { lan: bm, nodes: 0 };
  }
  if (sf.cfg !== p.id) {
    sf.send('ucinewgame');
    if (p.elo) { sf.send('setoption name UCI_LimitStrength value true'); sf.send('setoption name UCI_Elo value ' + p.elo); }
    else sf.send('setoption name UCI_LimitStrength value false');
    const r = sf.until(/^readyok/); sf.send('isready'); await r;
    sf.cfg = p.id;
  }
  sf.send(`position fen ${startFen}${moves.length ? ' moves ' + moves.join(' ') : ''}`);
  let nodes = 0;
  const lis = (l) => { const m = / nodes (\d+)/.exec(l); if (m) nodes = +m[1]; };
  const prevL = sf.eng.listener;
  sf.eng.listener = (l) => { lis(l); prevL(l); };
  const done = sf.until(/^bestmove/);
  if (p.elo) sf.send(`go depth ${1 + Math.floor(sfSkillLevel(p.elo))} movetime 3000`);
  else sf.send(`go nodes ${p.nodes}`);
  const line = await done;
  sf.eng.listener = prevL;
  return { lan: line.split(' ')[1], nodes };
}

// ---------------------------------------------------------------- one game
export async function playGame({ white, black, seed, openingPlies = 0 }, sf) {
  const rng = makeRng(seed);
  const players = [white, black].map((id) => {
    if ((id.startsWith('sf') && !byId(id)) || byId(id)?.engine === 'sf') return sfPlayer(id);
    return { id, persona: byId(id), engine: new Engine({ ttBits: 18 }) };
  });
  const pos = new Position(START_FEN);
  const moves = [];
  // shared random opening so both colours are tried from the same start
  const orng = makeRng(seed ^ 0x5bd1e995);
  for (let i = 0; i < openingPlies; i++) {
    const bm = bookMove(pos.fen(), orng); if (!bm) break;
    pos.make(pos.lanToMove(bm)); moves.push(bm);
  }
  const startFen = START_FEN;
  const stats = [{ nodes: 0, moves: 0, ms: 0, blunders: 0 }, { nodes: 0, moves: 0, ms: 0, blunders: 0 }];
  let result = '1/2-1/2', reason = 'maxply', lastTo = -1;
  for (let ply = moves.length; ply < 400; ply++) {
    if (!pos.hasLegalMove()) { result = pos.inCheck() ? (pos.side === 0 ? '0-1' : '1-0') : '1/2-1/2'; reason = pos.inCheck() ? 'mate' : 'stalemate'; break; }
    if (pos.half >= 100) { reason = 'fifty'; break; }
    if (pos.repetitions() >= 3) { reason = 'repetition'; break; }
    if (pos.insufficientMaterial()) { reason = 'material'; break; }
    const side = pos.side, p = players[side], st = stats[side];
    const t0 = performance.now();
    let r;
    if (p.sf) r = await sfMove(sf, p, startFen, moves, rng, ply);
    else {
      p.engine.setPosition(startFen, moves);
      r = chooseMove(p.engine, p.persona, { rng, lastTo });
      if (r.blunder) st.blunders++;
    }
    st.ms += performance.now() - t0;
    if (!r.book) { st.nodes += r.nodes || 0; st.moves++; }
    const m = pos.lanToMove(r.lan);
    if (!m) throw new Error(`${p.id} illegal move ${r.lan} in ${pos.fen()}`);
    lastTo = (m >> 7) & 127;
    pos.make(m); moves.push(r.lan);
  }
  return { white, black, result, reason, plies: moves.length, stats, moves: moves.join(' ') };
}

// ---------------------------------------------------------------- worker side
if (!isMainThread) {
  let sf = null;
  parentPort.on('message', async (job) => {
    if (job === 'exit') process.exit(0);
    try {
      if (!sf && (job.white.startsWith('sf') || job.black.startsWith('sf'))) sf = await loadSF();
      const g = await playGame(job, sf);
      parentPort.postMessage({ ok: true, g });
    } catch (e) { parentPort.postMessage({ ok: false, err: String(e.stack || e), job }); }
  });
}

// ---------------------------------------------------------------- ratings
function scoreOf(result, white) { return result === '1/2-1/2' ? 0.5 : (result === '1-0') === white ? 1 : 0; }

export function fitRatings(games, anchors = {}) {
  const ids = [...new Set(games.flatMap((g) => [g.white, g.black]))];
  const R = Object.fromEntries(ids.map((id) => [id, anchors[id] ?? byId(id)?.elo ?? 1500]));
  const free = ids.filter((id) => anchors[id] === undefined);
  // gradient ascent on the BT log-likelihood (with a weak prior to keep isolated players sane)
  for (let it = 0; it < 4000; it++) {
    const grad = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const g of games) {
      const s = scoreOf(g.result, true);
      const e = 1 / (1 + 10 ** ((R[g.black] - R[g.white]) / 400));
      grad[g.white] += s - e; grad[g.black] -= s - e;
    }
    let maxStep = 0;
    for (const id of free) {
      const step = grad[id] * 8;
      R[id] += Math.max(-40, Math.min(40, step));
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (!anchors || !Object.keys(anchors).length) { // no anchors: centre on the persona elos
      const m = free.reduce((a, id) => a + R[id] - (byId(id)?.elo ?? 1500), 0) / free.length;
      for (const id of free) R[id] -= m;
    }
    if (maxStep < 0.01) break;
  }
  return R;
}

function summarise(games) {
  const t = {};
  for (const g of games) {
    for (const [id, white] of [[g.white, true], [g.black, false]]) {
      const o = t[id] ||= { games: 0, score: 0, nodes: 0, moves: 0, ms: 0, blunders: 0 };
      const st = g.stats[white ? 0 : 1];
      o.games++; o.score += scoreOf(g.result, white); o.nodes += st.nodes; o.moves += st.moves; o.ms += st.ms; o.blunders += st.blunders || 0;
    }
  }
  return t;
}

export function report(games) {
  const anchors = {};
  for (const id of new Set(games.flatMap((g) => [g.white, g.black]))) {
    const p = byId(id);
    if (/^sf\d+$/.test(id) && !p) anchors[id] = +id.slice(2);
    else if (p && p.engine === 'sf' && p.sfElo) anchors[id] = p.sfElo;
  }
  const R = fitRatings(games, anchors);
  const S = summarise(games);
  const rows = Object.keys(R).sort((a, b) => R[a] - R[b]);
  // Label scale: Stockfish UCI_Elo above PIVOT; below it the scale is stretched so a uniformly
  // random mover lands at 0 (see docs/notes/core.md "Calibration" for why).
  const PIVOT = 1700;
  const k = R.rand !== undefined && R.rand < PIVOT - 200 ? PIVOT / (PIVOT - R.rand) : 1.42;
  const label = (e) => Math.round(e >= PIVOT ? e : PIVOT - (PIVOT - e) * k);
  console.log(`\nlabel stretch below ${PIVOT}: x${k.toFixed(2)}`);
  console.log('\nplayer        label   fitted  ->label  games  score%  avgNodes/move  ms/move  blunder%');
  for (const id of rows) {
    const s = S[id], p = byId(id);
    console.log(`${id.padEnd(12)} ${String(p?.elo ?? '-').padStart(6)} ${String(Math.round(R[id])).padStart(7)}${anchors[id] !== undefined ? '*' : ' '} ${String(label(R[id])).padStart(7)} ${String(s.games).padStart(5)}  ${(100 * s.score / s.games).toFixed(0).padStart(5)}  ${String(Math.round(s.nodes / Math.max(1, s.moves))).padStart(13)}  ${(s.ms / Math.max(1, s.moves)).toFixed(0).padStart(7)}  ${(100 * s.blunders / Math.max(1, s.moves)).toFixed(0).padStart(6)}`);
  }
  // pairwise table
  const pair = {};
  for (const g of games) {
    const [a, b] = [g.white, g.black].sort();
    const o = pair[a + ' v ' + b] ||= { n: 0, a: 0 };
    o.n++; o.a += scoreOf(g.result, g.white === a);
  }
  console.log('\npairing                      games  score(first)');
  for (const k of Object.keys(pair).sort()) console.log(`${k.padEnd(28)} ${String(pair[k].n).padStart(5)}  ${(pair[k].a).toFixed(1)}`);
  console.log('(* = anchor held fixed)');
  return R;
}

// ---------------------------------------------------------------- main
if (isMainThread && process.argv[1] === __file) {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const has = (k) => args.includes('--' + k);
  if (has('rate')) {
    const f = arg('rate') || RESULTS;
    const games = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const only = arg('only');
    report(only ? games.filter((g) => only.split(',').includes(g.white) && only.split(',').includes(g.black)) : games);
    process.exit(0);
  }
  const nGames = +arg('games', 20);     // games per pairing (both colours)
  const threads = +arg('threads', Math.max(1, os.cpus().length - 2));
  let pairs = [];
  if (arg('pairs')) pairs = arg('pairs').split(',').map((s) => s.split(':'));
  if (has('ladder')) {
    const ids = (arg('ids') ? arg('ids').split(',') : BOTS.filter((b) => b.engine !== 'sf').map((b) => b.id));
    for (let i = 0; i < ids.length; i++) for (let k = 1; k <= +arg('span', 2); k++) if (ids[i + k]) pairs.push([ids[i], ids[i + k]]);
  }
  if (arg('anchor')) for (const a of arg('anchor').split(',')) for (const e of arg('sf', '1500').split(',')) pairs.push([a, 'sf' + e]);
  const jobs = [];
  let seed = +arg('seed', Date.now() % 1e9);
  for (const [a, b] of pairs) for (let i = 0; i < nGames; i += 2) {
    seed++;
    const op = 2 + (seed % 5);
    jobs.push({ white: a, black: b, seed: seed * 7919, openingPlies: op });
    jobs.push({ white: b, black: a, seed: seed * 7919, openingPlies: op });
  }
  console.log(`${pairs.length} pairings, ${jobs.length} games, ${threads} threads`);
  const games = [];
  let next = 0, done = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    const workers = [];
    for (let i = 0; i < Math.min(threads, jobs.length); i++) {
      const w = new Worker(__file);
      workers.push(w);
      const feed = () => { if (next < jobs.length) w.postMessage(jobs[next++]); else { w.postMessage('exit'); } };
      w.on('message', (msg) => {
        done++;
        if (msg.ok) {
          games.push(msg.g);
          fs.appendFileSync(RESULTS, JSON.stringify({ ...msg.g, at: new Date().toISOString() }) + '\n');
          if (has('v')) console.log(`${msg.g.white} - ${msg.g.black}: ${msg.g.result} (${msg.g.reason}, ${msg.g.plies})`);
        } else console.error('job failed', msg.err);
        if (done % 20 === 0) console.log(`  ${done}/${jobs.length} games, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
        if (done === jobs.length) resolve();
        else feed();
      });
      w.on('error', (e) => { console.error(e); });
      feed();
    }
  });
  report(games);
  process.exit(0);
}
