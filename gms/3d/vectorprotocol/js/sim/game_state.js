// The facade the UI calls. Owns the save object; every mutating call returns
// {ok, reason?, ...} and emits 'change' ({what}) so screens can re-render.
import { createRng, hashSeed } from './rng.js';
import { prepareData } from './battle.js';
import { lookupUnit, unitStats, unitPower, squadPower, sumMods, activeSynergies } from './stats.js';
import * as P from './progression.js';
import { canAfford, spend, grant, rollRecruit } from './economy.js';
import { allLevels, getLevel, isUnlocked, nextLevel, mapProgress, recordClear, evalGoals, recordGoals, levelGoals, DEFAULT_GOALS, goalText, goalSquadRule, mapChests } from './story.js';
import { generateRival, arenaTier, updateRating } from './arena.js';
import { activeEvents, raidRewards } from './events.js';
import FIXTURE_DATA from './fixture_data.js';
import { readSave, writeSave, clearSave, SAVE_VERSION, SAVE_KEY } from './save.js';

const DAY_MS = 86400000;

export function createGame(opts = {}) {
  const data = prepareData(opts.data || FIXTURE_DATA);
  const E = P.econ(data);
  const now = opts.now || (() => Date.now());
  const storage = opts.storage === false ? null : (opts.storage || { read: () => readSave(opts.key || SAVE_KEY), write: (s) => writeSave(s, opts.key || SAVE_KEY), clear: () => clearSave(opts.key || SAVE_KEY) });
  const autosave = opts.autosave !== false;
  const listeners = {};
  let save = null;
  let pending = null;
  let rivals = null;

  const emit = (ev, payload) => { for (const fn of listeners[ev] || []) { try { fn(payload); } catch (e) { console.error(e); } } };
  const changed = (what) => { if (save) save.updated = now(); if (autosave && storage && save) storage.write(save); emit('change', { what }); };
  const fail = (reason) => ({ ok: false, reason });
  // Feature gating: an id is gated only if some level's firstClear.unlocks grants it.
  const knownFeatures = new Set(allLevels(data).flatMap((l) => l.firstClear?.unlocks || []));
  const hasFeature = (id) => !id || !knownFeatures.has(id) || (save?.features || []).includes(id);
  const day = () => Math.floor(now() / DAY_MS) + (save?.dayOffset || 0);

  function makeUnit(defId, extra = {}) {
    const def = lookupUnit(data, defId);
    const u = { uid: `u${save.nextUid++}`, def: def.id, level: 1, xp: 0, rank: E.startRank[def.rarity] ?? 0, abilityLevels: { attack: 1, passive: 1, overdrive: 1 }, obtained: now(), ...extra };
    save.units.push(u);
    return u;
  }
  const owned = (defId) => save.units.find((u) => u.def === defId);

  // A card reward/recruit: new unit, or shards if already owned.
  function giveCard(defId) {
    const def = lookupUnit(data, defId);
    if (owned(defId)) {
      const n = E.dupeShards[def.rarity] ?? 10;
      save.shards[defId] = (save.shards[defId] || 0) + n;
      return { def: defId, rarity: def.rarity, isNew: false, shards: n };
    }
    const u = makeUnit(defId);
    return { def: defId, rarity: def.rarity, isNew: true, uid: u.uid };
  }

  // Shards a unit can still use on rank-ups; anything above that is surplus (convertible).
  function shardsNeeded(defId) {
    const u = owned(defId);
    if (!u) return Infinity; // keep shards of units you don't own yet
    const def = lookupUnit(data, defId);
    let need = 0;
    for (let r = u.rank; r < P.maxRank(E, def.rarity); r++) need += P.rankUpCost(E, { rank: r }).shards;
    return need;
  }
  // Focus shards (sim-4): go to the deployed unit closest to completing its next rank-up (fewest shards short, then lower
  // rank, then deploy order); cheap low ranks finish first, so the squad rises together instead of one superstar.
  // Units already holding enough shards for their next rank are skipped unless every candidate does.
  // Fallback pool: the current squad. null = everyone maxed.
  function focusTarget(uids) {
    const pool = (uids?.length ? uids : save.formation.map((f) => f.uid)).map(findUnit).filter(Boolean);
    let best = null, key = null;
    for (const u of pool) {
      const def = lookupUnit(data, u.def);
      if (u.rank >= P.maxRank(E, def.rarity)) continue;
      const short = P.rankUpCost(E, u).shards - (save.shards[u.def] || 0);
      const k = [short > 0 ? 1 : 0, -short, -u.rank];
      if (!best || k[0] > key[0] || (k[0] === key[0] && (k[1] > key[1] || (k[1] === key[1] && k[2] > key[2])))) { best = u; key = k; }
    }
    return best ? best.def : null;
  }
  function surplusShards(defId) { const n = shardsNeeded(defId); return n === Infinity ? 0 : Math.max(0, (save.shards[defId] || 0) - n); }
  function shardValue(rarity) { const x = E.shardExchange; return x ? { [x.to || 'chips']: x.rate?.[rarity] ?? 1 } : null; }
  // Convert surplus shards (default: all of them) into economy.shardExchange.to (chips).
  function convertShards(defId, n) {
    const x = E.shardExchange;
    if (!x) return fail('no_exchange');
    if (!owned(defId)) return fail('not_owned');
    const max = surplusShards(defId);
    const k = Math.min(max, n ?? max);
    if (k <= 0) return fail('no_surplus');
    const def = lookupUnit(data, defId);
    const gain = Math.floor(k * (x.rate?.[def.rarity] ?? 1));
    save.shards[defId] -= k;
    save.wallet[x.to || 'chips'] = (save.wallet[x.to || 'chips'] || 0) + gain;
    changed('shards');
    return { ok: true, shards: k, gained: { [x.to || 'chips']: gain } };
  }
  function convertAllShards() {
    const got = {}; let shards = 0;
    for (const id of Object.keys(save.shards)) { const r = convertShards(id); if (r.ok) { shards += r.shards; for (const k in r.gained) got[k] = (got[k] || 0) + r.gained[k]; } }
    return shards ? { ok: true, shards, gained: got } : fail('no_surplus');
  }

  function newGame({ name = 'Vector Company', seed } = {}) {
    const st = E.start;
    save = {
      v: SAVE_VERSION, created: now(), updated: now(), seed: seed ?? hashSeed(String(now())), counter: 0, nextUid: 1, dayOffset: 0,
      company: { name, level: 1, xp: 0 },
      wallet: Object.fromEntries(E.currencies.map((c) => [c, st[c] || 0])),
      units: [], shards: {}, formation: [], slots: st.slots || 2,
      buffs: {}, selectedBuff: null, hq: {},
      story: { levels: {}, chests: {} },
      arena: { rating: data.arena?.startRating ?? 1000, wins: 0, losses: 0, matches: 0, best: data.arena?.startRating ?? 1000 },
      events: {}, pity: {}, features: [],
      stats: { battles: 0, wins: 0, battleSeconds: 0, byKind: { story: 0, arena: 0, event: 0 }, secondsByKind: { story: 0, arena: 0, event: 0 } },
    };
    for (const u of st.units || []) makeUnit(u.def, { level: u.level || 1 });
    autoFormation();
    rivals = null;
    changed('new');
    return save;
  }

  function load() {
    const s = storage?.read();
    if (!s) return false;
    save = s; rivals = null;
    emit('change', { what: 'load' });
    return true;
  }

  // ---------- views
  function unitView(uidOrUnit) {
    const u = typeof uidOrUnit === 'string' ? save.units.find((x) => x.uid === uidOrUnit) : uidOrUnit;
    if (!u) return null;
    const def = lookupUnit(data, u.def);
    const cap = P.levelCap(E, u.rank);
    const rk = P.rankUpCost(E, u);
    const maxR = P.maxRank(E, def.rarity);
    return {
      ...u, name: def.name, role: def.role, faction: def.faction, rarity: def.rarity, model: def.model,
      stats: unitStats(data, u), power: unitPower(data, u, P.hqMods(data, save)),
      levelCap: cap, xpToNext: u.level < cap ? P.xpToNext(E, u.level) : 0, xpToCap: P.xpToCap(E, u),
      maxRank: maxR, shards: save.shards[u.def] || 0, rankUpCost: u.rank < maxR ? rk : null,
      canRankUp: u.rank < maxR && u.level >= cap && (save.shards[u.def] || 0) >= rk.shards && (save.wallet.credits || 0) >= rk.credits,
      abilityCap: P.abilityCap(E, u),
      surplusShards: surplusShards(u.def), shardValue: shardValue(def.rarity),
      abilities: { attack: def.attack, passive: def.passive, overdrive: def.overdrive },
      inSquad: save.formation.some((f) => f.uid === u.uid),
    };
  }

  function squadUnits() {
    return save.formation.map((f) => {
      const u = save.units.find((x) => x.uid === f.uid);
      return u && { def: u.def, level: u.level, rank: u.rank, abilityLevels: { ...u.abilityLevels }, slot: { ...f.slot }, uid: u.uid };
    }).filter(Boolean);
  }
  function squadMods() {
    const b = save.selectedBuff && (save.buffs[save.selectedBuff] || 0) > 0 ? data.buffs?.[save.selectedBuff]?.mods : null;
    return sumMods(P.hqMods(data, save), b);
  }
  function power(units = squadUnits()) { return squadPower(data, units, squadMods()); }

  // ---------- formation
  function setFormation(list) {
    if (!Array.isArray(list)) return fail('bad_formation');
    if (list.length > save.slots) return fail('too_many_units');
    const slots = new Set(), uids = new Set();
    for (const f of list) {
      if (!save.units.some((u) => u.uid === f.uid)) return fail('unknown_unit');
      const si = f.slot?.col * 3 + f.slot?.lane;
      if (!(si >= 0 && si < 6) || ![0, 1].includes(f.slot.col) || ![0, 1, 2].includes(f.slot.lane)) return fail('bad_slot');
      if (slots.has(si) || uids.has(f.uid)) return fail('duplicate');
      slots.add(si); uids.add(f.uid);
    }
    save.formation = list.map((f) => ({ uid: f.uid, slot: { col: f.slot.col, lane: f.slot.lane } }));
    changed('formation');
    return { ok: true };
  }

  // Strongest units by power, tanks front-mid, archers back, mages back-sides.
  // opts (all optional, used for star goals): {maxUnits, excludeRoles:[role], minRole:{role:n},
  //   minFaction:{faction:n}, apply:false (just return the formation)}. goalSquadRule(goal) builds these.
  function autoFormation(opts = {}) {
    // Role-balanced: best of each role first (slots >= 3), then best remaining under role caps.
    // Pure power-ranking picks tank-heavy squads that time out.
    const roleOf = (u) => lookupUnit(data, u.def).role;
    const facOf = (u) => lookupUnit(data, u.def).faction;
    let all = save.units.slice().sort((a, b) => unitPower(data, b) - unitPower(data, a));
    if (opts.excludeRoles?.length) all = all.filter((u) => !opts.excludeRoles.includes(roleOf(u)));
    const n = Math.min(save.slots, opts.maxUnits ?? 6);
    const ranked = [];
    const cnt = { tank: 0, archer: 0, mage: 0 };
    const take = (u) => { if (ranked.length < n && !ranked.includes(u)) { ranked.push(u); cnt[roleOf(u)]++; } };
    for (const [r, k] of Object.entries(opts.minRole || {})) all.filter((u) => roleOf(u) === r).slice(0, k).forEach(take);
    for (const [f, k] of Object.entries(opts.minFaction || {})) {
      const have = ranked.filter((u) => facOf(u) === f).length;
      all.filter((u) => facOf(u) === f && !ranked.includes(u)).slice(0, Math.max(0, k - have)).forEach(take);
    }
    const caps = { tank: Math.max(1, Math.ceil(n / 3)), archer: Math.ceil(n / 2), mage: Math.ceil(n / 2) };
    if (n >= 3) for (const r of ['tank', 'archer', 'mage']) { if (!cnt[r]) { const u = all.find((x) => roleOf(x) === r); if (u) take(u); } }
    else if (!cnt.tank) { const t = all.find((x) => roleOf(x) === 'tank'); if (t) take(t); }
    for (const u of all) if (cnt[roleOf(u)] < caps[roleOf(u)]) take(u);
    for (const u of all) take(u);
    const order = { tank: [[0, 1], [0, 0], [0, 2], [1, 1], [1, 0], [1, 2]], archer: [[1, 1], [1, 0], [1, 2], [0, 1], [0, 0], [0, 2]], mage: [[1, 0], [1, 2], [1, 1], [0, 0], [0, 2], [0, 1]] };
    const used = new Set();
    const out = [];
    for (const u of ranked.sort((a, b) => ['tank', 'archer', 'mage'].indexOf(roleOf(a)) - ['tank', 'archer', 'mage'].indexOf(roleOf(b)))) {
      const s = order[roleOf(u)].find(([c, l]) => !used.has(c * 3 + l));
      used.add(s[0] * 3 + s[1]);
      out.push({ uid: u.uid, slot: { col: s[0], lane: s[1] } });
    }
    if (opts.apply === false) return { ok: true, formation: out };
    save.formation = out;
    if (save) changed('formation');
    return { ok: true, formation: out };
  }

  // Formation aimed at a level's star goals: applies every goal's squad rule that is still open.
  function goalFormation(levelId, apply = true) {
    const l = getLevel(data, levelId);
    if (!l) return fail('unknown_level');
    const done = save.story.levels[levelId]?.goals || [];
    const opts = { apply };
    (levelGoals(l) || []).forEach((g, i) => {
      if (done[i]) return;
      const r = goalSquadRule(g);
      if (!r) return;
      if (r.maxUnits != null) opts.maxUnits = Math.min(opts.maxUnits ?? 6, r.maxUnits);
      if (r.excludeRoles) opts.excludeRoles = [...(opts.excludeRoles || []), ...r.excludeRoles];
      if (r.minRole) opts.minRole = { ...(opts.minRole || {}), ...r.minRole };
      if (r.minFaction) opts.minFaction = { ...(opts.minFaction || {}), ...r.minFaction };
    });
    return autoFormation(opts);
  }

  // ---------- upgrades
  function findUnit(uid) { return save.units.find((u) => u.uid === uid); }

  function levelUp(uid, levels = 1) {
    if (!hasFeature('workshop')) return fail('locked');
    const u = findUnit(uid);
    if (!u) return fail('unknown_unit');
    const cap = P.levelCap(E, u.rank);
    if (u.level >= cap) return fail('at_cap');
    let need = -(u.xp || 0);
    const target = Math.min(cap, u.level + levels);
    for (let l = u.level; l < target; l++) need += P.xpToNext(E, l);
    const cost = P.scrapCost(E, need);
    if (!spend(save.wallet, cost)) return fail('cannot_afford');
    P.addUnitXp(E, u, need);
    changed('unit');
    return { ok: true, level: u.level, cost };
  }

  // Feed as much scrap as possible (up to `scrap`, default all) into one unit.
  function feedScrap(uid, scrap = Infinity) {
    if (!hasFeature('workshop')) return fail('locked');
    const u = findUnit(uid);
    if (!u) return fail('unknown_unit');
    const toCap = P.xpToCap(E, u);
    if (toCap <= 0) return fail('at_cap');
    const perXp = E.levelCost.creditsPerXp;
    const maxByCredits = perXp > 0 ? Math.floor((save.wallet.credits || 0) / perXp) : Infinity;
    const xp = Math.floor(Math.min(toCap, (Math.min(scrap, save.wallet.scrap || 0)) * E.scrapXp, maxByCredits));
    if (xp <= 0) return fail('cannot_afford');
    const cost = P.scrapCost(E, xp);
    if (!spend(save.wallet, cost)) return fail('cannot_afford');
    const gained = P.addUnitXp(E, u, xp);
    changed('unit');
    return { ok: true, levels: gained, level: u.level, cost };
  }

  function rankUp(uid) {
    if (!hasFeature('rank_up')) return fail('locked');
    const u = findUnit(uid);
    if (!u) return fail('unknown_unit');
    const def = lookupUnit(data, u.def);
    if (u.rank >= P.maxRank(E, def.rarity)) return fail('max_rank');
    if (u.level < P.levelCap(E, u.rank)) return fail('not_at_cap');
    const c = P.rankUpCost(E, u);
    if ((save.shards[u.def] || 0) < c.shards) return fail('not_enough_shards');
    if (!spend(save.wallet, { credits: c.credits })) return fail('cannot_afford');
    save.shards[u.def] -= c.shards;
    u.rank++;
    changed('unit');
    emit('rankup', { uid, rank: u.rank });
    return { ok: true, rank: u.rank };
  }

  function upgradeAbility(uid, which) {
    const u = findUnit(uid);
    if (!u || !['attack', 'passive', 'overdrive'].includes(which)) return fail('bad_args');
    if (!hasFeature('ability_upgrades')) return fail('locked');
    const cur = u.abilityLevels[which] || 1;
    if (cur >= P.abilityCap(E, u)) return fail('ability_cap');
    const cost = P.abilityCost(E, cur);
    if (!spend(save.wallet, cost)) return fail('cannot_afford');
    u.abilityLevels[which] = cur + 1;
    changed('unit');
    return { ok: true, level: cur + 1, cost };
  }

  function upgradeHq(id) {
    const d = data.hq?.[id];
    if (!d) return fail('unknown_skill');
    if (!hasFeature('hq')) return fail('locked');
    const cur = save.hq[id] || 0;
    if (cur >= (d.max || 1)) return fail('max_level');
    if (!P.hqRequirementMet(data, save, d)) return fail('locked');
    const cost = P.hqCost(d, cur);
    if (!spend(save.wallet, cost)) return fail('cannot_afford');
    save.hq[id] = cur + 1;
    changed('hq');
    return { ok: true, level: cur + 1, cost };
  }

  function upgrade(kind, ...args) {
    if (kind === 'level') return levelUp(...args);
    if (kind === 'scrap') return feedScrap(...args);
    if (kind === 'rank') return rankUp(...args);
    if (kind === 'ability') return upgradeAbility(...args);
    if (kind === 'hq') return upgradeHq(...args);
    return fail('bad_kind');
  }

  function buyBuff(id, n = 1) {
    const b = data.buffs?.[id];
    if (!b || !b.cost) return fail('not_for_sale');
    if (!hasFeature('buffs')) return fail('locked');
    const cost = Object.fromEntries(Object.entries(b.cost).map(([k, v]) => [k, v * n]));
    if (!spend(save.wallet, cost)) return fail('cannot_afford');
    save.buffs[id] = (save.buffs[id] || 0) + n;
    changed('buffs');
    return { ok: true, count: save.buffs[id] };
  }
  function selectBuff(id) {
    if (id && !(save.buffs[id] > 0)) return fail('none_owned');
    save.selectedBuff = id || null;
    changed('buffs');
    return { ok: true };
  }

  // ---------- recruitment
  // A unit with `recruitable: levelId` joins pools only once that level is cleared.
  const available = (id) => { const r = data.units[id]?.recruitable; return !r || !!save.story.levels[r]?.stars; };
  function bannerPool(bannerId) {
    const b = data.recruit?.[bannerId];
    if (!b) return [];
    const pool = b.pool === 'all' || !b.pool ? Object.keys(data.units).filter((id) => !data.units[id].bannerOnly) : b.pool;
    return pool.filter((id) => data.units[id] && !data.units[id].noRecruit && available(id));
  }
  function recruit(bannerId, n = 1) {
    const banner = data.recruit?.[bannerId];
    if (!banner) return fail('unknown_banner');
    if (!hasFeature(banner.unlock)) return fail('locked');
    if (!bannerPool(bannerId).length) return fail('empty_pool');
    const disc = 1 - Math.min(0.5, P.hqEffect(data, save, 'recruitDiscount'));
    const cost = Object.fromEntries(Object.entries(banner.cost || {}).map(([k, v]) => [k, Math.round(v * n * disc)]));
    if (!spend(save.wallet, cost)) return fail('cannot_afford');
    const rng = createRng(hashSeed(`${save.seed}:recruit:${save.counter++}`));
    const pity = (save.pity[bannerId] ||= {});
    const results = [];
    for (let i = 0; i < n; i++) {
      const { def } = rollRecruit(data, banner, rng, pity, available);
      results.push(giveCard(def));
    }
    changed('recruit');
    emit('recruit', results);
    return { ok: true, results, cost };
  }

  // ---------- battles
  function battleSeed(tag) { return hashSeed(`${save.seed}:${tag}:${save.counter++}`); }

  function startLevel(levelId) {
    const l = getLevel(data, levelId);
    if (!l) return fail('unknown_level');
    if (!isUnlocked(data, save, levelId)) return fail('locked');
    const units = squadUnits();
    if (!units.length) return fail('empty_squad');
    pending = { kind: 'story', id: levelId, uids: units.map((u) => u.uid), buff: save.selectedBuff };
    const goals = levelGoals(l);
    return { ok: true, kind: 'story', id: levelId, data, seed: battleSeed(levelId), player: { units, mods: squadMods() }, enemyWaves: l.waves, level: l,
      ...(l.stars ? { stars: l.stars } : {}), ...(goals ? { goals } : {}) };
  }

  function arenaRivals() {
    if (rivals) return rivals;
    const units = squadUnits();
    const p = squadPower(data, units);
    const [lo, hi] = data.arena?.rivalPower || [0.85, 1.12];
    const maxLevel = Math.max(...save.units.map((u) => u.level)) + 5;
    rivals = [0, 1, 2].map((i) => {
      const f = lo + ((hi - lo) * i) / 2;
      const r = generateRival(data, { targetPower: p * f, size: Math.max(1, units.length), seed: hashSeed(`${save.seed}:arena:${save.arena.matches}:${i}`), rating: save.arena.rating + (f - 1) * 400, maxLevel });
      r.mods = P.hqMods(data, save);
      r.difficulty = ['easy', 'even', 'hard'][i];
      return r;
    });
    return rivals;
  }

  function startArena(index = 1) {
    if (!hasFeature('arena')) return fail('locked');
    const r = arenaRivals()[index];
    const units = squadUnits();
    if (!units.length) return fail('empty_squad');
    pending = { kind: 'arena', id: 'arena', rival: r, uids: units.map((u) => u.uid), buff: save.selectedBuff };
    return { ok: true, kind: 'arena', data, seed: battleSeed('arena'), player: { units, mods: squadMods() }, enemyWaves: [{ units: r.units, mods: r.mods }], rival: r };
  }

  function startEvent(eventId, tierId) {
    const ev = data.events?.[eventId];
    if (!ev) return fail('unknown_event');
    if (!hasFeature(ev.unlock)) return fail('locked');
    if (!activeEvents(data, day()).includes(ev)) return fail('not_active');
    const tier = ev.tiers?.find((t) => t.id === tierId) || ev.tiers?.[0];
    if (!tier) return fail('unknown_tier');
    const units = squadUnits();
    if (!units.length) return fail('empty_squad');
    pending = { kind: 'event', id: eventId, tier: tier.id, uids: units.map((u) => u.uid), buff: save.selectedBuff };
    return { ok: true, kind: 'event', data, seed: battleSeed(eventId), player: { units, mods: squadMods() }, enemyWaves: tier.waves, event: ev, tier };
  }

  function applyRewards(r, mult, deployed, out) {
    const xpMult = 1 + P.hqEffect(data, save, 'xpGain');
    const scrapMult = 1 + P.hqEffect(data, save, 'scrapGain');
    const credMult = 1 + P.hqEffect(data, save, 'creditGain');
    const w = {};
    for (const c of E.currencies) if (r[c]) w[c] = Math.round(r[c] * mult * (c === 'scrap' ? scrapMult : c === 'credits' ? credMult : 1));
    grant(save.wallet, w);
    for (const k in w) out.currency[k] = (out.currency[k] || 0) + w[k];
    if (r.xp) {
      const each = Math.round(r.xp * mult * E.battleXp.perLevel * xpMult);
      for (const uid of deployed) {
        const u = findUnit(uid);
        if (!u) continue;
        const g = P.addUnitXp(E, u, each);
        out.xp[uid] = each;
        if (g) out.levelups.push({ uid, level: u.level });
      }
    }
    const shards = { ...(r.shards || {}) };
    for (const [id, n] of Object.entries(shards)) { const k = Math.round(n * (mult < 1 ? 1 : mult)); save.shards[id] = (save.shards[id] || 0) + k; out.shards[id] = (out.shards[id] || 0) + k; }
    // focus shards DO shrink with a diminish/replay mult (floored), so a repeatable source of them stays capped per day
    const focus = r.focusShards ? Math.floor(r.focusShards * mult + 1e-9) : 0;
    if (focus > 0) { const id = focusTarget(deployed); if (id) { save.shards[id] = (save.shards[id] || 0) + focus; out.shards[id] = (out.shards[id] || 0) + focus; } }
    for (const id of r.cards || []) out.cards.push(giveCard(id));
    for (const [id, n] of Object.entries(r.buffs || {})) { save.buffs[id] = (save.buffs[id] || 0) + n; out.buffs[id] = (out.buffs[id] || 0) + n; }
  }

  function goalCtx(result, uids) {
    const roles = {}, factions = {};
    for (const uid of uids) { const u = findUnit(uid); if (!u) continue; const d = lookupUnit(data, u.def); roles[d.role] = (roles[d.role] || 0) + 1; factions[d.faction] = (factions[d.faction] || 0) + 1; }
    return { win: !!result.win, time: result.time || 0, lost: (result.lost || []).length, deployed: uids.length, roles, factions, integrity: result.integrity ?? 0 };
  }

  // Map star chests unlock by total stars on the map; granted automatically after the win that reaches them.
  function claimChests(mapId, out) {
    const got = [];
    for (const c of mapChests(data, save, mapId)) {
      if (!c.ready) continue;
      ((save.story.chests ||= {})[mapId] ||= [])[c.index] = true;
      applyRewards(c.rewards || {}, 1, [], out);
      got.push({ mapId, index: c.index, stars: c.stars, rewards: c.rewards });
    }
    if (got.length) emit('unlock', { type: 'chest', chests: got });
    return got;
  }

  function completeBattle(result) {
    if (!pending) return fail('no_battle');
    const p = pending; pending = null;
    const out = { ok: true, kind: p.kind, id: p.id, win: !!result.win, stars: result.stars || 0, currency: {}, xp: {}, levelups: [], shards: {}, cards: [], buffs: {}, unlocks: [], firstClear: false };
    save.stats.battles++; if (result.win) save.stats.wins++;
    save.stats.battleSeconds += result.time || 0;
    save.stats.byKind[p.kind] = (save.stats.byKind[p.kind] || 0) + 1;
    save.stats.secondsByKind[p.kind] = (save.stats.secondsByKind[p.kind] || 0) + (result.time || 0);
    if (p.buff && save.buffs[p.buff] > 0) { save.buffs[p.buff]--; if (!save.buffs[p.buff]) save.selectedBuff = null; }
    const lossXp = E.lossXp ?? 0.2;

    if (p.kind === 'story') {
      const l = getLevel(data, p.id);
      if (result.win) {
        const goals = levelGoals(l);
        const done = goals ? evalGoals(goals, goalCtx(result, p.uids)) : [true, result.stars >= 2, result.stars >= 3];
        const prevStars = save.story.levels[p.id]?.stars || 0;
        const rec = recordClear(save, p.id, 0);
        const fresh = recordGoals(save, p.id, done);
        out.stars = done.filter(Boolean).length;
        out.goals = done;
        out.newGoals = fresh;
        out.firstClear = rec.first;
        out.newStars = fresh.length;
        applyRewards(l.rewards || {}, rec.first ? 1 : E.replay.rewardMult, p.uids, out);
        if (rec.first && l.firstClear) {
          applyRewards({ ...l.firstClear, xp: 0 }, 1, p.uids, out); // uids only pick the focus-shard target
          if (l.firstClear.unlockSlot) unlockSlot(l.firstClear.unlockSlot, out);
          for (const f of l.firstClear.unlocks || []) {
            if (!(save.features ||= []).includes(f)) { save.features.push(f); out.unlocks.push({ type: 'feature', id: f }); emit('unlock', { type: 'feature', id: f }); }
          }
        }
        // goalRewards[i] = first completion of goal i; legacy starRewards[n] = reaching n stars
        for (const i of fresh) if (l.goalRewards?.[i]) applyRewards(l.goalRewards[i], 1, [], out);
        for (let s = prevStars + 1; s <= save.story.levels[p.id].stars; s++) if (l.starRewards?.[s]) applyRewards(l.starRewards[s], 1, [], out);
        for (const [slot, lid] of Object.entries(E.slotUnlocks || {})) if (lid === p.id) unlockSlot(+slot, out);
        out.chests = claimChests(l.mapId, out);
      } else applyRewards({ xp: l.rewards?.xp || 0 }, lossXp, p.uids, out);
    } else if (p.kind === 'arena') {
      const before = save.arena.rating;
      save.arena.rating = updateRating(data, before, p.rival.rating, result.win);
      save.arena.best = Math.max(save.arena.best, save.arena.rating);
      save.arena.matches++;
      result.win ? save.arena.wins++ : save.arena.losses++;
      const tier = arenaTier(data, save.arena.rating);
      const tokMult = 1 + P.hqEffect(data, save, 'arenaTokens');
      const r = { ...tier.reward };
      if (r.arena_tokens) r.arena_tokens *= tokMult;
      applyRewards(r, result.win ? 1 : (data.arena?.lossReward ?? 0.3), p.uids, out);
      if (data.arena?.xp) applyRewards({ xp: data.arena.xp }, result.win ? 1 : lossXp, p.uids, out);
      out.rating = { before, after: save.arena.rating, tier: tier.id };
      rivals = null;
    } else if (p.kind === 'event') {
      const ev = data.events[p.id];
      const tier = ev.tiers.find((t) => t.id === p.tier);
      const rec = ((save.events[p.id] ||= {})[p.tier] ||= { clears: 0, lastDay: -1, today: 0 });
      if (rec.lastDay !== day()) { rec.lastDay = day(); rec.today = 0; }
      const dim = ev.diminish ? ev.diminish[Math.min(rec.today, ev.diminish.length - 1)] : 1;
      if (ev.kind === 'raid') {
        const dmg = Object.entries(result.stats || {}).filter(([id]) => id.startsWith('e')).reduce((s, [, v]) => s + v.taken, 0);
        applyRewards(raidRewards(ev, dmg), dim, p.uids, out);
        out.raidDamage = dmg;
      } else if (result.win) applyRewards(tier.rewards || {}, dim, p.uids, out);
      if (result.win) { rec.clears++; rec.today++; }
    }
    if (P.addCompanyXp(E, save.company, E.companyXp.perBattle * (result.win ? 1 : 0.5))) out.companyLevel = save.company.level;
    changed('battle');
    emit('reward', out);
    return out;
  }

  function unlockSlot(n, out) {
    if (save.slots >= n) return;
    save.slots = Math.min(6, n);
    out.unlocks.push({ type: 'slot', slots: save.slots });
    emit('unlock', { type: 'slot', slots: save.slots });
  }

  // ---------- arena shop
  function buyArena(itemId, choice) {
    const it = (data.arena?.shop || []).find((x) => x.id === itemId);
    if (!it) return fail('unknown_item');
    if (it.item.shardsChoice && !(choice && data.units[choice])) return fail('need_choice');
    if (!spend(save.wallet, it.cost)) return fail('cannot_afford');
    const i = it.item;
    if (i.shardsChoice) save.shards[choice] = (save.shards[choice] || 0) + i.shardsChoice;
    for (const [id, n] of Object.entries(i.shards || {})) save.shards[id] = (save.shards[id] || 0) + n;
    for (const c of E.currencies) if (i[c]) save.wallet[c] = (save.wallet[c] || 0) + i[c];
    if (i.buff) save.buffs[i.buff] = (save.buffs[i.buff] || 0) + (i.n || 1);
    if (i.card) giveCard(i.card);
    changed('shop');
    return { ok: true };
  }

  function goalsView(l) {
    if (!l) return null;
    const rec = save.story.levels[l.id];
    const done = rec?.goals || (rec ? [rec.stars >= 1, rec.stars >= 2, rec.stars >= 3] : []);
    return (levelGoals(l) || DEFAULT_GOALS).map((g, i) => ({ ...g, index: i, text: goalText(g), done: !!done[i], reward: l.goalRewards?.[i] || null, squad: goalSquadRule(g) }));
  }

  const game = {
    data,
    get save() { return save; },
    get pending() { return pending; },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
    newGame, load, persist: () => storage?.write(save), reset: () => { storage?.clear?.(); save = null; },
    // queries
    get wallet() { return save.wallet; },
    units: () => save.units.map(unitView),
    unit: unitView,
    formation: () => save.formation.map((f) => ({ ...f, slot: { ...f.slot } })),
    get slots() { return save.slots; },
    squadUnits, squadMods, power,
    synergies: () => activeSynergies(data, squadUnits().map((u) => lookupUnit(data, u.def))),
    levels: () => allLevels(data).map((l) => ({ id: l.id, mapId: l.mapId, name: l.name, node: l.node, boss: !!l.boss, power: l.power, unlocked: isUnlocked(data, save, l.id), stars: save.story.levels[l.id]?.stars || 0 })),
    level: (id) => { const l = getLevel(data, id); return l && { ...l, unlocked: isUnlocked(data, save, id), stars: save.story.levels[id]?.stars || 0, clears: save.story.levels[id]?.clears || 0, goals: goalsView(l) }; },
    goals: (id) => goalsView(getLevel(data, id)),
    nextLevel: () => nextLevel(data, save),
    maps: () => (data.maps || []).map((m) => ({ id: m.id, name: m.name, ...mapProgress(data, save, m.id), unlocked: isUnlocked(data, save, m.levels[0].id), chests: mapChests(data, save, m.id) })),
    chests: (mapId) => mapChests(data, save, mapId),
    mapProgress: (id) => mapProgress(data, save, id),
    arenaTier: () => arenaTier(data, save.arena.rating),
    arenaRivals,
    activeEvents: () => activeEvents(data, day()).filter((e) => hasFeature(e.unlock)),
    features: () => [...(save.features || [])],
    hasFeature,
    banners: () => Object.values(data.recruit || {}).filter((b) => hasFeature(b.unlock)),
    bannerPool,
    day,
    // actions
    setFormation, autoFormation, goalFormation, convertShards, convertAllShards, surplusShards, levelUp, feedScrap, rankUp, upgradeAbility, upgradeHq, upgrade,
    buyBuff, selectBuff, recruit, startLevel, startArena, startEvent, completeBattle, buyArena,
    canAfford: (cost) => canAfford(save.wallet, cost),
    advanceDay(n = 1) { save.dayOffset = (save.dayOffset || 0) + n; changed('day'); },
  };
  return game;
}
