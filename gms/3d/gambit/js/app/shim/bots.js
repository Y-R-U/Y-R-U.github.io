// UI-side SHIM of js/bots/bots.js (TEAM_BRIEF). Main-thread, shallow search —
// just enough to play a game through the UI until core's worker bots land.
import { Chess } from './chess.js';

export const BOTS = [
  ['pip', 'Pip', 250, '🐣', 'Just learned how the horsey moves. Mostly.', 'random', 0],
  ['marge', 'Marge', 400, '🧶', 'Plays between knitting rows. Loves her queen a bit too much.', 'queen-happy', 0],
  ['tobias', 'Tobias', 550, '🎒', 'Twelve years old and fearless. Attacks everything.', 'aggressive', 0],
  ['dot', 'Dot', 700, '☕', 'Café regular. Solid-ish, until the coffee wears off.', 'solid', 0],
  ['rex', 'Rex', 850, '🦖', 'Charges forward with every pawn. Subtlety is extinct.', 'aggressive', 0],
  ['quill', 'Professor Quill', 1000, '🦉', 'Knows the openings by heart. The middlegame, less so.', 'book', 0],
  ['sasha', 'Sasha', 1150, '🎸', 'Plays fast, plays loud, sometimes plays brilliantly.', 'tactical', 0],
  ['bruno', 'Bruno', 1300, '🥊', 'Trades everything and wins the endgame on grit.', 'trader', 10],
  ['iris', 'Iris', 1450, '🌙', 'Quiet, positional, patient. Waits for your mistake.', 'positional', 20],
  ['kasimir', 'Kasimir', 1600, '🎩', 'Club champion three years running. Loves a gambit.', 'gambiteer', 30],
  ['nova', 'Nova', 1750, '🚀', 'Computer science student. Calculates like a machine.', 'tactical', 45],
  ['vera', 'Vera', 1900, '🗡️', 'Sharp as a rapier. Never refuses a sacrifice.', 'attacker', 60],
  ['magnus', 'The Baron', 2050, '🏰', 'Old money, older openings. Grinds you to dust.', 'positional', 80],
  ['zero', 'Zero', 2200, '🤖', 'A cold engine with a single setting: crush.', 'engine', 100],
  ['oracle', 'The Oracle', 2400, '🔮', 'Sees every line. Has never been surprised.', 'engine', 130],
].map(([id, name, elo, avatar, blurb, style, minDeviceScore]) => ({ id, name, elo, avatar, blurb, style, minDeviceScore }));

const VAL = { p: 100, n: 310, b: 320, r: 500, q: 900, k: 0 };
function material(c, color) {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
function search(c, depth, alpha, beta, color) {
  if (c.isCheckmate()) return -100000;
  if (c.isDraw()) return 0;
  if (depth === 0) return material(c, c.turn());
  let best = -Infinity;
  for (const m of c.legal()) {
    const u = c.make(m);
    const v = -search(c, depth - 1, -beta, -alpha);
    c.unmake(u);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export async function benchmark() { return { score: 100, nps: 0, shim: true }; }
export function botAvailable(bot, bench) { return !bench || (bench.score || 0) >= (bot.minDeviceScore || 0); }

export function createBot(id) {
  const bot = BOTS.find(b => b.id === id) || BOTS[0];
  let stopped = false;
  return {
    async think(fen, { timeLeftMs } = {}) {
      const c = new Chess(fen);
      const moves = c.legal();
      const delay = Math.min(1200, 350 + Math.random() * 700, timeLeftMs ? timeLeftMs / 30 : 1e9);
      await new Promise(r => setTimeout(r, delay));
      if (stopped || !moves.length) return { move: null };
      const blunder = Math.max(0.02, 0.6 - bot.elo / 4000);
      let pick;
      if (Math.random() < blunder) pick = moves[(Math.random() * moves.length) | 0];
      else {
        const depth = bot.elo >= 1500 ? 2 : 1;
        let best = -Infinity;
        for (const m of moves) {
          const u = c.make(m);
          const v = -search(c, depth - 1, -Infinity, Infinity) + Math.random() * (bot.elo < 1200 ? 80 : 20);
          c.unmake(u);
          if (v > best) { best = v; pick = m; }
        }
      }
      const v = c.verbose(pick, moves);
      return { move: v.lan, san: v.san };
    },
    stop() { stopped = true; },
    dispose() { stopped = true; },
  };
}

export async function hint(fen) {
  const c = new Chess(fen);
  const moves = c.legal();
  let best = -Infinity, pick = null;
  for (const m of moves) {
    const u = c.make(m);
    const v = -search(c, 1, -Infinity, Infinity);
    c.unmake(u);
    if (v > best) { best = v; pick = m; }
  }
  return pick ? { move: c.verbose(pick, moves).lan } : null;
}
