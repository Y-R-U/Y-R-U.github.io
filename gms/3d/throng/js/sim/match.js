import { CONFIG } from '../config.js';
import { createRng } from './rng.js';
import { botCosmetics } from '../meta/shop.js';

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const colorDist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

// Crowd 0 is always the local player. Bots get the remaining teams; persona→team is seeded.
// roster (optional): [{ name, flag, persona, skill, aggr, human, league }] for sim-online opponents.
// playerColor (optional): a locker colour; the team closest to it sits out so no bot looks like you.
// playerCos: the renderer cosmetics (hat, leader, flag, trail, ring) of crowd 0; bots get some by league.
export function makePlayers({ seed = 1, mode = 'classic', playerName = 'You', playerTeam = 0, playerColor = null, playerCos = null, auto = false, allBots = false, roster = null } = {}) {
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
    cos: allBots ? botCosmetics('p0:' + seed, 2) : playerCos || {},
  }];
  order.forEach((ti, k) => {
    const r = roster && roster[k];
    const s = r || specs[k % specs.length];
    players.push({
      id: 'b' + ti, name: r ? r.name : teams[ti].name, team: teams[ti].name, color: teams[ti].color, isBot: true,
      skill: s.skill, persona: s.persona, aggr: s.aggr, throttle: s.throttle, humanish: !!(r && r.human), flag: r ? r.flag : '', league: r ? r.league : null,
      cos: r && r.cos ? r.cos : botCosmetics('b' + ti + ':' + seed, 2),
    });
  });
  applyModeLooks(players, mode, seed);
  const botIndices = [], botSpecs = [];
  players.forEach((p, i) => {
    if (i === 0 && !(auto || allBots)) return;
    botIndices.push(i);
    botSpecs.push({ persona: p.persona, skill: p.skill, aggr: p.aggr, throttle: p.throttle, human: p.humanish });
  });
  return { players, botIndices, botSpecs };
}

// Teams: even crowds are side 0 (with you), odd side 1, in shades of the side colour.
// Infection: patient zero (a bot if there is one) wears the horde colour and swaps with whoever looked like it.
export function applyModeLooks(players, mode, seed) {
  if (mode === 'teams') {
    const sides = CONFIG.MODES.teams.sides;
    players.forEach((p, i) => {
      const t = i % 2, side = sides[t];
      // Generic practice names would put "Gold Squad" on the blue side: name those after the side.
      if (CONFIG.TEAMS.some((tm) => tm.name === p.name)) p.name = side.name + ' ' + side.crews[(i >> 1) % side.crews.length];
      p.team = t;
      p.color = side.colors[(i >> 1) % side.colors.length];
      p.teamName = side.name;
      if (p.cos) { p.cos = { ...p.cos }; delete p.cos.palette; }
    });
  } else if (mode === 'infection') {
    const rng = createRng('horde:' + seed);
    const pool = players.map((p, i) => i).filter((i) => !players[i].human);
    const list = pool.length ? pool : players.map((p, i) => i);
    const z = list[rng.int(list.length)];
    const hc = CONFIG.MODES.infection.hordeColor;
    let near = -1, nd = 90;
    players.forEach((p, i) => { if (i !== z) { const d = colorDist(p.color, hc); if (d < nd) { nd = d; near = i; } } });
    if (near >= 0) players[near].color = players[z].color;
    players.forEach((p) => { p.horde = false; });
    players[z].horde = true;
    players[z].color = hc;
    players.forEach((p) => { if (p.cos) { p.cos = { ...p.cos }; delete p.cos.palette; } });
  }
  return players;
}
