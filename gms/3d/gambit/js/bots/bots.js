// GAMBIT bots — main-thread API (see docs/TEAM_BRIEF.md).
//
//   import { BOTS, benchmark, botAvailable, createBot, hint } from './js/bots/bots.js';
//   const bench = await benchmark();                 // {score, nps}  (cached: localStorage 'gambit.bench')
//   BOTS.filter(b => botAvailable(b, bench))
//   const bot = createBot('ada');
//   const r = await bot.think(chess.fen(), {timeLeftMs, incMs, startFen, moves})  // -> {move:'e2e4', ...}
//   bot.stop(); bot.dispose();
//   const h = await hint(fen, 1000);                 // {move, score, mate, pv, depth}
//
// Pass `startFen` + `moves` (LAN list from the game start) to think()/hint() when you can:
// the bot then knows the game history and avoids / aims for threefold repetitions.
// Everything heavy runs in Web Workers: js/bots/worker.js (our engine) and the vendored
// Stockfish 19 lite (GPL-3.0, js/bots/stockfish/) for the top bots.
import { BOTS as PERSONAS, byId, sfSkillLevel } from './personas.js';
import { bookMove, makeRng, timeBudget } from './play.js';

const BENCH_KEY = 'gambit.bench';
const BENCH_VERSION = 2;
// A bot is locked when its typical move would take longer than this on the device.
export const THINK_LIMIT_MS = 6500;
// Stockfish wasm nodes/s relative to our engine's benchmark nps on the same device
// (measured: see docs/notes/core.md). Used only for gating the Stockfish bots.
export const SF_SPEED_RATIO = 1.5;

function minScoreFor(p) {
  // score = benchmark kNPS
  const ratio = p.engine === 'sf' ? SF_SPEED_RATIO : 1;
  return Math.ceil(p.typNodes / ratio / THINK_LIMIT_MS);
}

export const BOTS = PERSONAS.map((p) => ({
  id: p.id, name: p.name, elo: p.elo, avatar: p.avatar, color: p.color, blurb: p.blurb, style: p.style,
  engine: p.engine || 'js',
  minDeviceScore: minScoreFor(p),
}));
const botById = (id) => BOTS.find((b) => b.id === id);

// ---------------------------------------------------------------- workers
const WORKER_URL = new URL('./worker.js', import.meta.url);
const SF_URL = new URL('./stockfish/stockfish-19-lite-single.js', import.meta.url);

class EngineWorker {
  constructor() { this.w = null; this.pending = new Map(); this.seq = 0; }
  _ensure() {
    if (this.w) return this.w;
    this.w = new Worker(WORKER_URL, { type: 'module' });
    this.w.onmessage = (ev) => {
      const m = ev.data, p = this.pending.get(m.reqId);
      if (!p) return;
      this.pending.delete(m.reqId);
      if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
    };
    this.w.onerror = (ev) => {
      const err = new Error('bot worker error: ' + (ev.message || 'unknown'));
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    return this.w;
  }
  call(msg) {
    const w = this._ensure();
    const reqId = ++this.seq;
    return new Promise((resolve, reject) => { this.pending.set(reqId, { resolve, reject }); w.postMessage({ ...msg, reqId }); });
  }
  // abort whatever is running: the worker is synchronous, so we terminate it
  kill() {
    if (this.w) { this.w.terminate(); this.w = null; }
    for (const p of this.pending.values()) p.resolve(null);
    this.pending.clear();
  }
}

class SfWorker {
  constructor() { this.w = null; this.listeners = []; this.ready = null; this.cfg = null; }
  _ensure() {
    if (this.ready) return this.ready;
    this.w = new Worker(SF_URL);
    this.w.onmessage = (ev) => { const l = String(ev.data); for (const f of this.listeners.slice()) f(l); };
    this.ready = (async () => { await this._cmd('uci', /^uciok/); this._send('setoption name Hash value 16'); await this._cmd('isready', /^readyok/); })();
    return this.ready;
  }
  _send(c) { this.w.postMessage(c); }
  _cmd(c, re, onLine) {
    return new Promise((res) => {
      const f = (l) => { if (onLine) onLine(l); if (re.test(l)) { this.listeners = this.listeners.filter((x) => x !== f); res(l); } };
      this.listeners.push(f);
      this._send(c);
    });
  }
  async configure(elo) {
    await this._ensure();
    if (this.cfg === elo) return;
    this._send('ucinewgame');
    if (elo) { this._send('setoption name UCI_LimitStrength value true'); this._send('setoption name UCI_Elo value ' + elo); }
    else this._send('setoption name UCI_LimitStrength value false');
    await this._cmd('isready', /^readyok/);
    this.cfg = elo;
  }
  async go(posCmd, goCmd) {
    let score = 0, mate = 0, depth = 0, nodes = 0, pv = [];
    this._send(posCmd);
    const line = await this._cmd(goCmd, /^bestmove/, (l) => {
      if (!l.startsWith('info') || !/ pv /.test(l) || / multipv [2-9]/.test(l)) return;
      const d = / depth (\d+)/.exec(l); if (d) depth = +d[1];
      const n = / nodes (\d+)/.exec(l); if (n) nodes = +n[1];
      const c = / score cp (-?\d+)/.exec(l); if (c) { score = +c[1]; mate = 0; }
      const m = / score mate (-?\d+)/.exec(l); if (m) { mate = +m[1]; score = mate > 0 ? 32000 - 2 * mate : -32000 - 2 * mate; }
      const p = / pv (.*)$/.exec(l); if (p) pv = p[1].split(' ');
    });
    return { move: line.split(' ')[1], score, mate, depth, nodes, pv };
  }
  kill() {
    if (this.w) this.w.terminate();
    this.w = null; this.ready = null; this.cfg = null;
    for (const f of this.listeners.slice()) f('bestmove (none)');
    this.listeners = [];
  }
}

// ---------------------------------------------------------------- benchmark
function readBench() {
  try {
    const v = JSON.parse(localStorage.getItem(BENCH_KEY) || 'null');
    if (v && v.v === BENCH_VERSION && v.nps > 0) return v;
  } catch { /* storage blocked */ }
  return null;
}
let benchPromise = null;
// ~1 s nodes-per-second benchmark of our engine, in a worker. Cached in localStorage.
export async function benchmark({ force = false, ms = 1000 } = {}) {
  if (!force) { const c = readBench(); if (c) return c; }
  if (benchPromise) return benchPromise;
  benchPromise = (async () => {
    const w = new EngineWorker();
    try {
      const r = await w.call({ type: 'bench', ms });
      const out = { score: r.score, nps: r.nps, v: BENCH_VERSION, at: Date.now(), cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 0 };
      try { localStorage.setItem(BENCH_KEY, JSON.stringify(out)); } catch { /* ignore */ }
      return out;
    } finally { w.kill(); benchPromise = null; }
  })();
  return benchPromise;
}
export function cachedBenchmark() { return readBench(); }

// Diagnostics: Stockfish wasm nodes/s on this device (fixed position, fixed time).
export async function sfBenchmark(ms = 1000, multiPv = 1) {
  const sw = new SfWorker();
  try {
    await sw.configure(0);
    sw._send('setoption name MultiPV value ' + multiPv);
    const t0 = performance.now();
    const r = await sw.go('position fen r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', `go movetime ${ms}`);
    return { nps: Math.round(r.nodes / (performance.now() - t0) * 1000), nodes: r.nodes, depth: r.depth };
  } finally { sw.kill(); }
}

// Typical think time for this bot on this device (ms), or null if unknown.
export function expectedMoveMs(bot, bench = readBench()) {
  const p = byId(typeof bot === 'string' ? bot : bot.id);
  if (!p || !bench) return null;
  const nps = bench.nps * (p.engine === 'sf' ? SF_SPEED_RATIO : 1);
  return Math.round(p.typNodes / nps * 1000);
}

// false = "too strong for this device". Unknown benchmark => available.
export function botAvailable(bot, bench = readBench()) {
  const b = typeof bot === 'string' ? botById(bot) : bot;
  if (!b) return false;
  if (b.engine === 'sf' && typeof WebAssembly === 'undefined') return false;
  if (!bench) return true;
  return bench.score >= b.minDeviceScore;
}

// ---------------------------------------------------------------- bots
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// createBot(id, {humanDelay}) -> {think(fen, opts), stop(), dispose()}
//   think opts: {timeLeftMs, incMs, startFen, moves, seed}
//   resolves {move:'e2e4', score, mate, depth, nodes, pv, book, ms}  (or null if stop()ped)
//   humanDelay (default true): weak bots wait a little so they don't answer instantly.
export function createBot(id, { humanDelay = true } = {}) {
  const persona = byId(id);
  if (!persona) throw new Error('unknown bot ' + id);
  const isSf = persona.engine === 'sf';
  const ew = isSf ? null : new EngineWorker();
  const sw = isSf ? new SfWorker() : null;
  const rng = makeRng();
  let gen = 0;

  async function think(fen, opts = {}) {
    const my = ++gen;
    const t0 = performance.now();
    const { timeLeftMs = Infinity, incMs = 0 } = opts;
    const startFen = opts.startFen || fen;
    const moves = opts.startFen ? (opts.moves || []) : [];
    let r;
    if (isSf) {
      const plyFromStart = (+fen.split(' ')[5] - 1) * 2 + (fen.split(' ')[1] === 'b' ? 1 : 0);
      const bm = persona.book && plyFromStart < persona.book ? bookMove(fen, rng) : null;
      if (bm) r = { move: bm, score: 0, depth: 0, nodes: 0, book: true };
      else {
        await sw.configure(persona.sfElo || 0);
        const tb = timeBudget(timeLeftMs, incMs, plyFromStart);
        const cap = Math.round(Math.min(isFinite(tb.hard) ? tb.hard : 15000, 15000));
        const posCmd = `position fen ${startFen}${moves.length ? ' moves ' + moves.join(' ') : ''}`;
        const goCmd = persona.sfElo ? `go depth ${1 + Math.floor(sfSkillLevel(persona.sfElo))} movetime ${cap}`
          : `go nodes ${persona.sfNodes} movetime ${cap}`;
        r = await sw.go(posCmd, goCmd);
        if (!r.move || r.move === '(none)') return null;
      }
    } else {
      r = await ew.call({ type: 'think', botId: id, startFen, moves, timeLeftMs, incMs, seed: (opts.seed ?? rng() * 2 ** 32) >>> 0 });
      if (!r) return null;
    }
    if (my !== gen) return null;
    // human-ish pacing for the lower bots (never more than a small slice of the clock)
    if (humanDelay && persona.elo < 2000) {
      const want = (r.book ? 250 + rng() * 500 : 350 + rng() * 1100) * (persona.elo < 1200 ? 1 : 0.7);
      const cap = isFinite(timeLeftMs) ? timeLeftMs / 60 : want;
      const wait = Math.min(want, cap) - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      if (my !== gen) return null;
    }
    return { move: r.move, score: r.score, mate: r.mate || 0, depth: r.depth, nodes: r.nodes, pv: r.pv || [], book: !!r.book, ms: Math.round(performance.now() - t0) };
  }
  return {
    id, persona: botById(id),
    think,
    stop() { gen++; if (ew) ew.kill(); if (sw) sw.kill(); },
    dispose() { gen++; if (ew) ew.kill(); if (sw) sw.kill(); },
  };
}

// ---------------------------------------------------------------- hints / puzzle checks
let hintWorker = null;
// best move for hints / puzzle checks: {move, score (cp, side to move), mate, pv, depth}
export async function hint(fen, ms = 1000, { startFen, moves } = {}) {
  hintWorker ||= new EngineWorker();
  return hintWorker.call({ type: 'hint', startFen: startFen || fen, moves: startFen ? (moves || []) : [], ms });
}
// exact mate-in-n check in the worker: {solutions, shortest, unique, pv, duals, complete}
export async function solveMate(fen, n, { maxNodes } = {}) {
  hintWorker ||= new EngineWorker();
  return hintWorker.call({ type: 'solve', fen, n, maxNodes });
}
export function stopHint() { if (hintWorker) hintWorker.kill(); }
