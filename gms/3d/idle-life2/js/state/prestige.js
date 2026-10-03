export function legacyTotal(allTime, L) {
  if (!(allTime > 0)) return 0;
  return Math.floor(L.scale * Math.pow(allTime / L.e0, L.power));
}

export function legacyMult(points, floor, L) {
  return Math.max(floor || 1, 1 + L.perPoint * points);
}

export function retirePreview(state, L) {
  const fam = state.family;
  const total = legacyTotal(fam.allTime, L);
  const gain = Math.max(0, total - fam.legacy);
  const cur = legacyMult(fam.legacy, fam.floor, L);
  const raw = 1 + L.perPoint * (fam.legacy + gain);
  const next = Math.max(raw, fam.gen === 1 ? L.firstFloor : fam.floor || 1);
  const kidsTeen = state.life.kids.some((k) => k.stage === 'teen');
  const harbour = state.districts.includes('harbour');
  return {
    available: kidsTeen && harbour,
    legacy: gain,
    total,
    mult: next / cur,
    nextMult: next,
    curMult: cur,
    recommended: kidsTeen && harbour && raw / cur >= 1 + L.recommendGain,
    floorApplies: raw < next,
    starterCash: Math.max(50, (fam.legacy + gain) * L.starterCashPerPoint),
    needs: [
      { id: 'teen', emoji: '🧑', text: 'A teen heir', done: kidsTeen },
      { id: 'harbour', emoji: '⚓', text: 'Harbour open', done: harbour },
    ],
  };
}

export function canRetire(state) {
  return state.life.kids.some((k) => k.stage === 'teen') && state.districts.includes('harbour');
}
