// Read-only adapters over game.state / game.data. UI writes only through game.act.
const NO = { cost: Infinity, qty: 0, affordable: false };

export function createModel(game) {
  const S = () => game.state;
  const D = game.data;
  const lineById = Object.fromEntries(D.lines.map((l) => [l.id, l]));
  const mgrById = Object.fromEntries(D.managers.map((m) => [m.id, m]));
  const itemById = Object.fromEntries((D.items || []).map((i) => [i.id, i]));
  const q = (type, payload) => game.quote(type, payload) || NO;
  let goalsCache = null, goalsAt = -1, seasonCache, seasonAt = -1;
  const goals = () => {
    const t = performance.now();
    if (t - goalsAt > 200) { goalsCache = game.goals?.() || { contracts: [] }; goalsAt = t; }
    return goalsCache;
  };

  const m = {
    data: D, game, q, lineById, mgrById, itemById,
    line: (id) => lineById[id],
    lineName: (id) => { const l = lineById[id]; return (S().sunday && l?.sundayName) || l?.name || id; },
    stats: (id) => game.stats(id),
    cash: () => S().cash,
    teeth: () => S().teeth || 0,
    boxes: () => S().boxes || { basic: 0, silver: 0, gold: 0 },
    boxCount() { const b = m.boxes(); return (b.basic || 0) + (b.silver || 0) + (b.gold || 0); },
    owned() { return D.lines.filter((l) => S().lines[l.id].lv > 0); },
    ownedCount() { let n = 0; for (const l of D.lines) if (S().lines[l.id].lv > 0) n++; return n; },
    building: (id) => S().build?.[id] || null,
    anyBuilding: () => Object.keys(S().build || {}).length > 0,
    started: () => S().bootstrap.done || m.ownedCount() > 0,
    bootstrapping: () => !S().bootstrap.done,
    hatCoins: () => S().bootstrap?.hat || 0,
    districtOpen: (id) => S().districts.includes(id),
    setting: (k, d) => (S().settings[k] ?? d),
    sunday: () => !!S().sunday,
    hat() {
      const info = game.hatInfo?.();
      if (info) return info;
      return { tier: 0, hat: { name: 'Squashed Derby', scale: 0.8 }, pomfrey: 7, pomfreyHat: { name: 'Two-Hundred-Gallon', scale: 4.6 }, own: 0, frontages: 18, mine: D.lines.length };
    },
    pomfreyFrontages: () => (D.frontages || []).filter((f) => f.kind === 'pomfrey').length || 7,

    manager(lineId) {
      const mid = S().lines[lineId]?.mgr;
      const def = mid ? mgrById[mid] : D.managers.find((x) => x.lineId === lineId && !x.seasonal);
      const st = def ? S().managers[def.id] || null : null;
      return { def, st, hired: !!mid, owned: !!st, level: st?.level || 0 };
    },
    managers() {
      return D.managers.filter((d) => !d.seasonal || S().managers[d.id]).map((d) => {
        const st = S().managers[d.id] || null;
        const onLine = D.lines.find((l) => S().lines[l.id].mgr === d.id)?.id || null;
        return { def: d, st, owned: !!st, hired: !!onLine, onLine, level: st?.level || 0 };
      });
    },
    slotsFor: (level) => game.managerSlots?.(level) ?? 1,
    items() {
      return (S().items || []).map((it) => ({ id: it.id, def: itemById[it.def] || { id: it.def, name: it.def, emoji: '🎁', values: [0, 0, 0] }, rarity: it.rarity, equippedTo: it.equipped || null }));
    },
    freeItemCount() { let n = 0; for (const it of S().items || []) if (!it.equipped) n++; return n; },
    equippedOn(managerId) {
      const slots = S().managers[managerId]?.slots || [];
      const items = m.items();
      return slots.map((id) => (id ? items.find((x) => x.id === id) || null : null));
    },
    itemLabel(it) {
      const v = it.def.values?.[it.rarity] || 0;
      return it.def.stat === 'offline' ? '+' + Math.round(v / 60) + 'm' : '+' + Math.round(v * 1000) / 10 + '%';
    },
    itemEmoji: (defId) => itemById[defId]?.emoji || '🎁',

    contracts: () => goals().contracts || [],
    achievements() {
      const got = S().achievements || {};
      return (D.achievements || []).map((a) => ({ ...a, done: !!got[a.id] }));
    },
    goalsReady() {
      let n = 0;
      for (const c of m.contracts()) if (c.visible && c.done && !c.claimed) n++;
      return n;
    },

    events: () => S().events.active,
    special: () => game.special?.() || null,
    death: () => game.deathPreview?.() || { available: false },
    graves: () => S().graves || [],
    gen: () => S().gen || 1,
    disguise: () => S().disguise || null,

    season() {
      const t = performance.now();
      if (t - seasonAt < 250 && seasonCache !== undefined) return seasonCache;
      seasonAt = t;
      const info = game.seasonInfo?.();
      if (!info || !info.live) return (seasonCache = null);
      return (seasonCache = info);
    },
    keepsakes() {
      return Object.entries(S().keepsakes || {}).map(([id, k]) => ({ id, ...(D.keepsakes?.[id] || { name: id, emoji: '🎩' }), target: k.target || null }));
    },
  };
  return m;
}
