// Bot Web Worker (module worker). All engine work runs here, never on the UI thread.
// Messages in:  {type:'think', reqId, botId|persona, startFen, moves, timeLeftMs, incMs, seed}
//               {type:'hint',  reqId, startFen, moves, ms}
//               {type:'bench', reqId, ms}
//               {type:'solve', reqId, fen, n, maxNodes}
// Messages out: {type:'result', reqId, ...} | {type:'error', reqId, message}
import { Engine, runBenchmark } from './engine.js';
import { chooseMove, makeRng } from './play.js';
import { byId } from './personas.js';
import { solveMate } from '../chess/solve.js';

let engine = null;
const getEngine = () => engine || (engine = new Engine({ ttBits: 20 }));

self.onmessage = (ev) => {
  const msg = ev.data || {};
  const { reqId } = msg;
  try {
    if (msg.type === 'think') {
      const persona = msg.persona || byId(msg.botId);
      if (!persona) throw new Error('unknown bot ' + msg.botId);
      const e = getEngine();
      e.setPosition(msg.startFen || msg.fen, msg.moves || []);
      let lastTo = -1;
      if (msg.moves && msg.moves.length) {
        const l = msg.moves[msg.moves.length - 1];
        lastTo = (l.charCodeAt(3) - 49) * 16 + (l.charCodeAt(2) - 97);
      }
      const t0 = performance.now();
      const r = chooseMove(e, persona, { timeLeftMs: msg.timeLeftMs, incMs: msg.incMs, rng: makeRng(msg.seed), lastTo });
      self.postMessage({ type: 'result', reqId, move: r.lan, score: r.score, depth: r.depth, nodes: r.nodes, mate: r.mate || 0, pv: r.pv || [], book: !!r.book, ms: Math.round(performance.now() - t0) });
    } else if (msg.type === 'hint') {
      const e = getEngine();
      e.setPosition(msg.startFen || msg.fen, msg.moves || []);
      e.setEval({}); e.evalNoise = 0;
      const ms = msg.ms || 1000;
      const r = e.search({ softMs: ms, hardMs: ms * 1.5, nodes: msg.nodes });
      self.postMessage({ type: 'result', reqId, move: r.lan, score: r.score, depth: r.depth, nodes: r.nodes, mate: r.mate, pv: r.pv, ms: Math.round(r.ms) });
    } else if (msg.type === 'bench') {
      self.postMessage({ type: 'result', reqId, ...runBenchmark(msg.ms || 1000) });
    } else if (msg.type === 'solve') {
      self.postMessage({ type: 'result', reqId, ...solveMate(msg.fen, msg.n, { maxNodes: msg.maxNodes }) });
    } else if (msg.type === 'ping') {
      self.postMessage({ type: 'result', reqId, pong: true });
    }
  } catch (err) {
    self.postMessage({ type: 'error', reqId, message: String(err && err.stack || err) });
  }
};
