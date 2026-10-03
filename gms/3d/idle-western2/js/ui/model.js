// Read-only adapters over game.state / game.data. UI writes only through game.act.
const NO = { cost: Infinity, qty: 0, affordable: false };

export function createModel(game) {
  const S = () => game.state;
  const D = game.data;
  const lineById = Object.fromEntries(D.lines.map((l) => [l.id, l]));
  const mgrById = Object.fromEntries(D.managers.map((m) => [m.id, m]));
  const q = (type, payload) => game.quote(type, payload) || NO;

  const m = {
    data: D, game, q, lineById, mgrById,
    line: (id) => lineById[id],
    stats: (id) => game.stats(id),
    cash: () => S().cash,
    owned() { return D.lines.filter((l) => S().lines[l.id].lv > 0); },
    ownedCount() { let n = 0; for (const l of D.lines) if (S().lines[l.id].lv > 0) n++; return n; },
    started: () => S().bootstrap.done || m.ownedCount() > 0,
    districtOpen: (id) => S().districts.includes(id),
    setting: (k, d) => (S().settings[k] ?? d),
    manager(lineId) {
      const mid = S().lines[lineId]?.mgr;
      const def = mid ? mgrById[mid] : D.managers.find((x) => x.lineId === lineId);
      const st = def ? S().managers[def.id] || null : null;
      return { def, st, hired: !!mid, owned: !!st };
    },
    events: () => S().events.active,
  };
  return m;
}
