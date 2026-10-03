// Town Council Demands (contracts) and achievement stats.
export function contractProgress(c, state, data) {
  const lines = state.lines;
  switch (c.kind) {
    case 'ownDistrict': return data.lines.filter((l) => l.district === c.district && lines[l.id].lv > 0).length;
    case 'lineLevel': return lines[c.lineId]?.lv || 0;
    case 'managers': return data.lines.filter((l) => lines[l.id].mgr).length;
    case 'equipped': { let n = 0; for (const it of state.items) if (it.equipped) n++; return n; }
    default: return state.stats[c.kind] || 0;
  }
}

export function contractsView(state, data) {
  return data.contracts.map((c) => {
    const p = Math.min(c.n, contractProgress(c, state, data));
    const claimed = state.contracts[c.id] === 'claimed';
    return { ...c, p, done: claimed || p >= c.n, claimed, visible: claimed || state.districts.includes(c.district) };
  });
}

export function statValue(state, data, name) {
  switch (name) {
    case 'allTime': return state.allTime;
    case 'owned': return data.lines.filter((l) => state.lines[l.id].lv > 0).length;
    case 'maxLevel': return Math.max(0, ...data.lines.map((l) => state.lines[l.id].lv));
    case 'hat': return state.hat;
    case 'gen': return state.gen;
    case 'managers': return Object.keys(state.managers).length;
    case 'seasonRank': return state.season?.rank || 0;
    default: return state.stats[name] || 0;
  }
}
