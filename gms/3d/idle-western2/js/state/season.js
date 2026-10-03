// Ghost Town date window, read from the injected wall clock only (state never reads the real time).
export function seasonLive(def, ms) {
  if (!def || !(ms > 0)) return false;
  const d = new Date(ms);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= def.from.month * 100 + def.from.day && md <= def.to.month * 100 + def.to.day;
}

export function seasonYear(ms) {
  return new Date(ms).getFullYear();
}

export function newSeasonState(def, year) {
  return { id: def.id, year, ecto: 0, xp: 0, rank: 0, ghost: null, nextGhost: 0, seq: 0 };
}
