export function seasonLive(def, wallMs) {
  const d = new Date(wallMs);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= def.from[0] * 100 + def.from[1] && md <= def.to[0] * 100 + def.to[1];
}

export function activeSeasons(seasons, wallMs) {
  return seasons.filter((s) => seasonLive(s, wallMs));
}

export function seasonYear(wallMs) {
  return new Date(wallMs).getFullYear();
}

export function newSeasonState(def, year) {
  const lines = {};
  for (const l of def.lines) lines[l.id] = { lv: l.cost === 0 ? 1 : 0, boost: 0, cyc: 0 };
  return { year, inside: false, candy: 0, xp: 0, rank: 0, xpNext: def.ranks[0].xp, claimed: [], lines };
}

export function seasonLineRate(def, l, ls) {
  if (!ls || ls.lv <= 0) return 0;
  let m = 1;
  for (const t of def.milestones) if (ls.lv >= t) m *= 2;
  for (let i = 0; i < ls.boost; i++) m *= def.boostMult[i];
  return ls.lv * l.rate * m;
}

export function seasonLevelCost(l, lv, n) {
  const g = l.growth;
  return l.levelCost * Math.pow(g, lv - 1) * (Math.pow(g, n) - 1) / (g - 1);
}

export function seasonMaxAffordable(l, lv, cash) {
  let n = 0;
  while (n < 1000 && seasonLevelCost(l, lv, n + 1) <= cash) n++;
  return n;
}

export function seasonMult(def, wallMs) {
  const d = new Date(wallMs);
  if (d.getMonth() + 1 === def.peak.month && d.getDate() === def.peak.day) return def.peak.mult;
  const h = d.getHours();
  return h >= def.witching.from && h < def.witching.to ? def.witching.mult : 1;
}

export function seasonAvgMult(def, startMs, endMs) {
  if (!(endMs > startMs)) return seasonMult(def, endMs);
  const step = Math.max(60e3, (endMs - startMs) / 96);
  let sum = 0, n = 0;
  for (let t = startMs + step / 2; t < endMs; t += step, n++) sum += seasonMult(def, t);
  return n ? sum / n : seasonMult(def, endMs);
}
