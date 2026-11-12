import { CONFIG } from '../config.js';
import { createRng } from './rng.js';

// Crowd 0 is always the local player. Bots get the remaining teams; persona→team is seeded.
export function makePlayers({ seed = 1, playerName = 'You', playerTeam = 0, auto = false, allBots = false } = {}) {
  const rng = createRng('players:' + seed);
  const teams = CONFIG.TEAMS.slice(0, CONFIG.MATCH.crowds);
  const order = teams.map((t, i) => i).filter((i) => i !== playerTeam);
  const specs = CONFIG.BOTS.slice();
  for (let i = specs.length - 1; i > 0; i--) { const j = rng.int(i + 1); [specs[i], specs[j]] = [specs[j], specs[i]]; }
  const pt = teams[playerTeam];
  const players = [{
    id: 'p0', name: (playerName || '').trim() || pt.name, team: pt.name, color: pt.color,
    isBot: allBots, skill: CONFIG.AUTO_PLAYER.skill, persona: CONFIG.AUTO_PLAYER.persona, human: !allBots,
  }];
  order.forEach((ti, k) => {
    const s = specs[k % specs.length];
    players.push({ id: 'b' + ti, name: teams[ti].name, team: teams[ti].name, color: teams[ti].color, isBot: true, skill: s.skill, persona: s.persona });
  });
  const botIndices = [], botSpecs = [];
  players.forEach((p, i) => {
    if (i === 0 && !(auto || allBots)) return;
    botIndices.push(i);
    botSpecs.push({ persona: p.persona, skill: p.skill });
  });
  return { players, botIndices, botSpecs };
}
