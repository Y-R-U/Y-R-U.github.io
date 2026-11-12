import { CONFIG } from '../config.js';
import { createRng } from './rng.js';

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const colorDist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

// Crowd 0 is always the local player. Bots get the remaining teams; persona→team is seeded.
// roster (optional): [{ name, flag, persona, skill, aggr, human, league }] for sim-online opponents.
// playerColor (optional): a locker colour; the team closest to it sits out so no bot looks like you.
export function makePlayers({ seed = 1, playerName = 'You', playerTeam = 0, playerColor = null, auto = false, allBots = false, roster = null } = {}) {
  const rng = createRng('players:' + seed);
  const teams = CONFIG.TEAMS.slice(0, CONFIG.MATCH.crowds);
  if (playerColor != null) {
    let best = 0, bd = Infinity;
    teams.forEach((t, i) => { const d = colorDist(t.color, playerColor); if (d < bd) { bd = d; best = i; } });
    playerTeam = best;
  }
  const order = teams.map((t, i) => i).filter((i) => i !== playerTeam);
  const specs = CONFIG.BOTS.slice();
  for (let i = specs.length - 1; i > 0; i--) { const j = rng.int(i + 1); [specs[i], specs[j]] = [specs[j], specs[i]]; }
  const pt = teams[playerTeam];
  const players = [{
    id: 'p0', name: (playerName || '').trim() || pt.name, team: pt.name, color: playerColor ?? pt.color,
    isBot: allBots, skill: CONFIG.AUTO_PLAYER.skill, persona: CONFIG.AUTO_PLAYER.persona, human: !allBots,
  }];
  order.forEach((ti, k) => {
    const r = roster && roster[k];
    const s = r || specs[k % specs.length];
    players.push({
      id: 'b' + ti, name: r ? r.name : teams[ti].name, team: teams[ti].name, color: teams[ti].color, isBot: true,
      skill: s.skill, persona: s.persona, aggr: s.aggr, throttle: s.throttle, humanish: !!(r && r.human), flag: r ? r.flag : '', league: r ? r.league : null,
    });
  });
  const botIndices = [], botSpecs = [];
  players.forEach((p, i) => {
    if (i === 0 && !(auto || allBots)) return;
    botIndices.push(i);
    botSpecs.push({ persona: p.persona, skill: p.skill, aggr: p.aggr, throttle: p.throttle, human: p.humanish });
  });
  return { players, botIndices, botSpecs };
}
