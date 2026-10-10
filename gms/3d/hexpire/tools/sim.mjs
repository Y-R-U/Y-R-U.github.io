// Headless AI-vs-AI balance / stall check. No DOM, no three.js.
//   node tools/sim.mjs [nSeeds=30] [maxRounds=200] [jsDir]
// Plays nSeeds skirmishes cycling style × size × player count (small maps
// capped at 4 empires, like the menu) plus every story chapter, then prints
// one line per game and a summary. STALEMATE = still running at maxRounds;
// FROZEN = a stalemate with no attacks in its last 50 rounds (the bad kind).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const N = +(process.argv[2] || 30), MAXR = +(process.argv[3] || 200);
const dir = process.argv[4] || path.join(path.dirname(new URL(import.meta.url).pathname), '../js');
const J = (f) => pathToFileURL(path.join(path.resolve(dir), f)).href;
const { CFG } = await import(J('config.js'));
const { makeState } = await import(J('state.js'));
const R = await import(J('rules.js'));
const { resetMoves } = await import(J('units.js'));
const { generateMap } = await import(J('mapgen.js'));
const { STORY, storyMapDef } = await import(J('maps.js'));
const { aiBeginTurn, aiStep } = await import(J('ai.js'));

const pers = Object.keys(CFG.personalities);
const SMALL_MAX = 4;

function play(mapDef, empires, seed) {
  const st = makeState(mapDef, empires, seed);
  R.recalcTerritory(st);
  const late = {};
  while (st.round < MAXR) {
    for (let e = 0; e < st.empires.length; e++) {
      if (!st.empires[e].alive) continue;
      st.turn = e; R.recalcTerritory(st); resetMoves(st, e); R.collectIncome(st, e);
      aiBeginTurn(st, e);
      for (let s = 0; s < 48; s++) {
        const a = aiStep(st, e);
        if (!a) break;
        if (st.round > MAXR - 50) late[a.type] = (late[a.type] || 0) + 1;
      }
      R.fireArrows(st, e); R.checkWinner(st);
      if (st.winner !== -1) return { round: st.round, winner: st.empires[st.winner].personality };
    }
    st.round++;
  }
  return { round: MAXR, winner: late.attack ? 'STALEMATE' : 'FROZEN', alive: st.empires.filter(e => e.alive).length, late };
}

const res = [];
const styles = ['classic', 'jagged', 'islands', 'maze'], sizes = ['small', 'medium', 'large'];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const style = styles[i % 4], size = sizes[i % 3];
  let players = 2 + (i % 5);
  if (size === 'small') players = Math.min(players, SMALL_MAX);
  const m = generateMap({ style, size, players, seed: 'sim' + i });
  if (m.bases.length !== players) { res.push({ tag: `${style}/${size}/${players}p`, skip: true }); continue; }
  const emp = Array.from({ length: players }, (_, j) => ({ name: 'E' + j, colorIdx: j, isAI: true, personality: pers[(i + j) % pers.length] }));
  res.push({ tag: `${style}/${size}/${players}p`, ...play({ name: 'x', land: m.land, bases: m.bases }, emp, 'sim' + i) });
}
for (const ch of STORY) {
  const emp = [{ name: 'P', colorIdx: 0, isAI: true, personality: 'balanced' },
    ...ch.ais.map((a, j) => ({ name: a.name, colorIdx: j + 1, isAI: true, personality: a.personality }))];
  res.push({ tag: 'story ' + ch.id, ...play(storyMapDef(ch), emp, 'story-' + ch.id) });
}
for (const r of res) console.log(JSON.stringify(r));
const done = res.filter(r => !r.skip);
const ended = done.filter(r => r.round < MAXR).map(r => r.round).sort((a, b) => a - b);
const q = (p) => ended[Math.min(ended.length - 1, Math.floor(ended.length * p))];
console.log(`games ${done.length} · ended ${ended.length} (median round ${q(0.5)}, p25 ${q(0.25)}, p75 ${q(0.75)}, max ${ended.at(-1)})` +
  ` · stalemates ${done.filter(r => r.winner === 'STALEMATE').length} · FROZEN ${done.filter(r => r.winner === 'FROZEN').length}` +
  ` · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const wins = {};
for (const r of done) wins[r.winner] = (wins[r.winner] || 0) + 1;
console.log(wins);
