import { hashStr, mulberry32 } from './events.js?v=20261004b';

export function contractProgress(c, state, data, equipped) {
  const lines = state.lines;
  switch (c.kind) {
    case 'ownDistrict': return data.lines.filter((l) => l.district === c.district && lines[l.id].lv > 0).length;
    case 'lineLevel': return lines[c.lineId]?.lv || 0;
    case 'pileTaps': return state.stats.pileTaps;
    case 'housing': return state.life.homeTier;
    case 'managers': return data.lines.filter((l) => lines[l.id].mgr).length;
    case 'events': return state.stats.events;
    case 'couriers': return state.stats.couriers;
    case 'sigmaMax': return data.lines.some((l) => lines[l.id].lv > 0 && lines[l.id].thr >= l.throughput.length) ? 1 : 0;
    case 'supply': return state.supply.on ? 1 : 0;
    case 'partner': return state.life.partner ? 1 : 0;
    case 'nightShift': return state.nightShift.length;
    case 'equipped': return equipped;
    default: return 0;
  }
}

export function contractsView(state, data, equipped) {
  return data.contracts.map((c) => {
    const p = Math.min(c.n, contractProgress(c, state, data, equipped));
    const claimed = state.contracts[c.id] === 'claimed';
    return { ...c, p, done: claimed || p >= c.n, claimed, visible: claimed || state.districts.includes(c.district) };
  });
}

export function claimedIn(state, data, districtId) {
  return data.contracts.filter((c) => c.district === districtId && state.contracts[c.id] === 'claimed').length;
}

export function rollDaily(state, data, day) {
  const rng = mulberry32(hashStr(day + ':' + state.seed));
  const pool = data.dailyPool.filter((d) => (!d.district || state.districts.includes(d.district)) && (!d.needStat || state.stats[d.needStat] > 0));
  const goals = [];
  while (goals.length < 3 && pool.length) {
    const g = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    goals.push({ id: g.id, emoji: g.emoji, text: g.text, stat: g.stat, n: g.n, base: state.stats[g.stat] || 0, claimed: false });
  }
  state.goals.daily = { day, goals, bonus: false };
}

export function dailyView(state) {
  const d = state.goals.daily;
  if (!d) return [];
  return d.goals.map((g) => {
    const p = Math.min(g.n, (state.stats[g.stat] || 0) - g.base);
    return { ...g, p, done: p >= g.n };
  });
}

export function giftView(state, data, day) {
  const g = state.goals.gift;
  return { step: g.step, day: g.step + 1, ready: g.last !== day, reward: data.gift[g.step], ladder: data.gift };
}

export function statValue(state, data, name) {
  switch (name) {
    case 'allTime': return state.family.allTime;
    case 'owned': return data.lines.filter((l) => state.lines[l.id].lv > 0).length;
    case 'maxLevel': return Math.max(0, ...data.lines.map((l) => state.lines[l.id].lv));
    case 'sigmaMax': return data.lines.some((l) => state.lines[l.id].lv > 0 && state.lines[l.id].thr >= l.throughput.length) ? 1 : 0;
    case 'home': return state.life.homeTier;
    case 'partner': return state.life.partner ? 1 : 0;
    case 'kids': return state.life.kids.length;
    case 'dog': return state.life.dog ? 1 : 0;
    case 'gen': return state.family.gen;
    case 'managers': return Object.keys(state.managers).length;
    case 'seasonRank': {
      let r = 0;
      for (const k in state.seasons) r = Math.max(r, state.seasons[k].rank || 0);
      return r;
    }
    default: return state.stats[name] || 0;
  }
}
