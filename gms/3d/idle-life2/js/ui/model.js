// Read-only adapters over game.state / game.data (L1 shapes, see CONTRACT "L1 economy").
const KID_EMOJI = { baby: '👶', toddler: '🧒', kid: '🧒', teen: '🧑' };
const NO = { cost: Infinity, qty: 0, affordable: false };

export function createModel(game) {
  const S = () => game.state;
  const D = game.data;
  const lineById = Object.fromEntries(D.lines.map((l) => [l.id, l]));
  const mgrById = Object.fromEntries(D.managers.map((m) => [m.id, m]));
  const itemById = Object.fromEntries(D.items.map((i) => [i.id, i]));
  const q = (type, payload) => game.quote(type, payload) || NO;
  let goalsCache = null, goalsAt = -1;
  const goals = () => {
    const t = performance.now();
    if (t - goalsAt > 200) { goalsCache = game.goals(); goalsAt = t; }
    return goalsCache;
  };
  let seasonCache = null, seasonAt = -1;

  const m = {
    data: D, game, q, lineById, mgrById, itemById,
    D: () => D,
    line: (id) => lineById[id],
    stats: (id) => game.stats(id),
    cash: () => S().cash,
    tickets: () => S().tickets,
    owned() { return D.lines.filter((l) => S().lines[l.id].lv > 0); },
    ownedCount() { let n = 0; for (const l of D.lines) if (S().lines[l.id].lv > 0) n++; return n; },
    started: () => S().bootstrap.done || m.ownedCount() > 0,
    districtOpen: (id) => S().districts.includes(id),
    setting: (k, d) => (S().settings[k] ?? d),
    housingTier: () => S().life.homeTier,
    home: () => D.housing[S().life.homeTier],
    nextHome: () => D.housing[S().life.homeTier + 1] || null,
    life: () => S().life,
    age: () => Math.floor(S().life.age),
    gen: () => S().family.gen,
    name: () => S().life.name,
    talent: (id) => D.talents[id] || D.talents.dreamer,

    manager(lineId) {
      const mid = S().lines[lineId]?.mgr;
      const def = mid ? mgrById[mid] : D.managers.find((x) => x.lineId === lineId && !x.seasonal);
      const st = S().managers[def.id] || null;
      return { def, st, hired: !!mid, owned: !!st, level: st?.level || 0 };
    },
    managers() {
      return D.managers.filter((d) => !d.seasonal || S().managers[d.id]).map((d) => {
        const st = S().managers[d.id] || null;
        const onLine = D.lines.find((l) => S().lines[l.id].mgr === d.id)?.id || null;
        return { def: d, st, owned: !!st, hired: !!onLine, onLine, level: st?.level || 0 };
      });
    },
    slotsFor: (level) => game.managerSlots(level),

    items() {
      return S().items.map((it) => ({ id: it.id, def: itemById[it.def], rarity: it.rarity, equippedTo: it.equipped || null }));
    },
    freeItemCount() { let n = 0; for (const it of S().items) if (!it.equipped) n++; return n; },
    equippedOn(managerId) {
      const slots = S().managers[managerId]?.slots || [];
      const items = m.items();
      return slots.map((id) => (id ? items.find((x) => x.id === id) || null : null));
    },
    itemLabel(it) {
      const v = it.def.values[it.rarity];
      return it.def.stat === 'offline' ? '+' + Math.round(v / 60) + 'm' : '+' + Math.round(v * 1000) / 10 + '%';
    },
    itemEmoji: (defId) => itemById[defId]?.emoji || '🎁',

    contracts: () => goals().contracts,
    daily: () => goals().daily,
    gift: () => goals().gift,
    achievements() {
      const got = S().achievements;
      return D.achievements.map((a) => ({ ...a, done: !!got[a.id] }));
    },
    goalsReady() {
      const g = goals();
      let n = g.gift.ready ? 1 : 0;
      for (const c of g.contracts) if (c.visible && c.done && !c.claimed) n++;
      for (const d of g.daily) if (d.done && !d.claimed) n++;
      return n;
    },

    events: () => S().events.active,
    order: () => S().events.order,

    partners: () => S().life.partnerOffer?.choices || [],
    partnerOffered: () => !S().life.partner && !!S().life.partnerOffer,
    dogOffered: () => !S().life.dog && !!S().life.dogOffer,
    kids() {
      return S().life.kids.map((k) => ({ ...k, emoji: KID_EMOJI[k.stage] || '👶', teen: k.stage === 'teen', canWork: k.stage === 'kid' || k.stage === 'teen' }));
    },
    retire: () => game.retirePreview(),
    portraits: () => S().family.portraits,
    heirlooms: () => S().family.heirlooms,

    // null out of season; cached 250 ms (seasonInfo builds a Date).
    season() {
      const t = performance.now();
      if (t - seasonAt < 250 && seasonCache !== undefined) return seasonCache;
      seasonAt = t;
      const info = game.seasonInfo();
      if (!info.live) return (seasonCache = null);
      const def = info.def;
      const now = new Date();
      const to = new Date(now.getFullYear(), def.to[0] - 1, def.to[1], 23, 59, 59);
      const st = S().seasons[def.id] || {};
      return (seasonCache = {
        def, live: true, active: !!info.inside, endsIn: Math.max(0, (to - now) / 1000),
        rank: info.rank, xp: info.xp, xpNext: info.xpNext ?? info.xp, candy: info.candy, rate: info.rate, mult: info.mult,
        witching: info.witching, trickOrTreat: info.trickOrTreat, ranks: def.ranks, lines: st.lines || {},
      });
    },
    seasonDirty() { seasonAt = -1; },
    keepsakes() {
      return Object.entries(S().keepsakes).map(([id, k]) => ({ id, ...(D.keepsakes[id] || { name: id, emoji: '🎀' }), target: k.target || null }));
    },
  };
  return m;
}
