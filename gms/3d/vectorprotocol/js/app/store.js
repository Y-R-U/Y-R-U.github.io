// UI facade over the sim's game_state (js/sim/game_state.js createGame). Screens only talk to this,
// so they keep a stable, view-shaped API while the sim owns the save (key vectorprotocol.save.v1).
import { data, unitDef } from './data.js';
import { load } from './modules.js';

const listeners = new Set();
let G = null;      // sim game
let P = null;      // sim progression helpers (costs)
let E = null;      // econ(data)
let cache = null;
const Q = new URLSearchParams(location.search);
const Q_ALL = Q.has('unlockall');
// ?dev (D24-style dev mode): the save and settings live under a _dev suffix so debug play never touches the real ones
export const DEV = Q.has('dev');
const SUFFIX = DEV ? '_dev' : '';
const SAVE_KEY = 'vectorprotocol.save.v1' + SUFFIX;

const SETTINGS_KEY = 'vectorprotocol.settings' + SUFFIX;
const DEFAULT_SETTINGS = { quality: 'auto', speed: 1, auto: true, damageNumbers: true, hints: true, introSeen: false, layout: 'auto' };
function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }

const REASON = {
  cannot_afford: 'Not enough resources', locked: 'Locked', at_cap: 'Level cap reached — rank up to raise it', not_at_cap: 'Reach the level cap first',
  not_enough_shards: 'Not enough shards', max_rank: 'Max rank', ability_cap: 'Rank up to train further', too_many_units: 'Too many units for your slots',
  bad_slot: 'Invalid slot', duplicate: 'Duplicate slot', empty_squad: 'Deploy at least one unit', not_active: 'Operation offline today',
  max_level: 'Maxed', empty_pool: 'No Rift recruits yet — clear Rift contracts first', no_surplus: 'No surplus shards', not_owned: 'Unit not owned', none_owned: 'None owned', need_choice: 'Pick a unit', not_for_sale: 'Not for sale',
};
const res = (r) => (r?.ok ? r : { ...r, ok: false, why: REASON[r?.reason] || r?.reason || 'Not possible' });

function emit(what) { cache = null; for (const f of listeners) try { f(what); } catch (e) { console.error(e); } }

function buildState() {
  const s = G.save;
  const progress = {};
  for (const [id, r] of Object.entries(s.story.levels || {})) if (r.stars) progress[id] = r.stars;
  return {
    company: s.company, cur: s.wallet, slots: s.slots, squad: s.formation, buffs: s.buffs, selectedBuff: s.selectedBuff, hq: s.hq,
    arena: s.arena, progress, shards: s.shards, stats: s.stats,
    roster: s.units.map((u) => ({ ...u, ab: u.abilityLevels, shards: s.shards[u.def] || 0 })),
  };
}

export const store = {
  get state() { return cache || (cache = buildState()); },
  get game() { return G; },
  get backend() { return G ? 'sim' : 'none'; },
  settings: { ...DEFAULT_SETTINGS, ...(readJSON(SETTINGS_KEY) || {}) },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setSetting(k, v) { store.settings[k] = v; writeJSON(SETTINGS_KEY, store.settings); emit('settings'); },

  async init(mod) {
    if (!mod?.createGame) throw new Error('Company records offline (js/sim/game_state.js unavailable)');
    P = await load('progression');
    G = mod.createGame({ data: data(), key: SAVE_KEY });
    E = P?.econ ? P.econ(G.data) : null;
    if (!G.load()) G.newGame({ name: 'Nightshift Contracting' });
    G.on('change', ({ what } = {}) => emit(what));
    emit('init');
  },
  reset() { G.reset(); G.newGame({ name: 'Nightshift Contracting' }); emit('reset'); },
  dev: DEV,
  saveKey: SAVE_KEY,
  // after a direct save edit (dev tools): persist + re-render
  touch(what = 'dev') { G.persist(); emit(what); },

  // ---- views
  unit(uid) { return G.save.units.find((u) => u.uid === uid); },
  view(uidOrUnit) {
    const v = G.unit(typeof uidOrUnit === 'string' ? uidOrUnit : uidOrUnit?.uid);
    if (!v) return null;
    const def = unitDef(v.def);
    return { ...def, ...v, id: v.def, ab: v.abilityLevels, cap: v.levelCap, xpNext: v.xpToNext || 1, stars: v.rank + 1,
      shardsNext: v.rankUpCost?.shards ?? null, attack: def.attack, passive: def.passive, overdrive: def.overdrive };
  },
  roster() { return G.save.units.map((u) => store.view(u.uid)); },
  squad() { return G.save.formation.map((f) => ({ ...store.view(f.uid), slot: f.slot })).filter((u) => u.id); },
  squadPower() { return G.power(); },
  powerOf(entries) { return G.power(entries.map((e) => { const u = store.unit(e.uid); return { def: u.def, level: u.level, rank: u.rank, abilityLevels: u.abilityLevels, slot: e.slot, uid: u.uid }; })); },
  levelStars(id) { return G.save.story.levels[id]?.stars || 0; },
  isLevelOpen(id) { return !!G.level(id)?.unlocked; },
  mapOpen(i) { return !!G.maps()[i - 1]?.unlocked; },
  maps() { return G.maps(); },
  nextLevel() { return G.nextLevel(); },
  companyXpNext() { return P?.companyXpToNext && E ? P.companyXpToNext(E, G.save.company.level) : 200; },

  // ---- squad / buffs
  setFormation(entries) { return res(G.setFormation(entries.slice(0, G.slots).map((e) => ({ uid: e.uid, slot: { ...e.slot } })))); },
  buyBuff(id) { return res(G.buyBuff(id, 1)); },
  selectBuff(id) { return res(G.selectBuff(id)); },

  // ---- battles: start returns the battle config; finish applies rewards via the sim
  startLevel(levelId) { return res(G.startLevel(levelId)); },
  startArena(i) { return res(G.startArena(i)); },
  startEvent(eventId, tierId) { return res(G.startEvent(eventId, tierId)); },
  finishBattle(result) {
    const before = Object.fromEntries(G.save.units.map((u) => [u.uid, u.level]));
    const slotsBefore = G.save.slots;
    const o = G.completeBattle(result || { win: false, stars: 0 });
    if (!o?.ok) return { win: false, stars: 0, xp: 0, levelUps: [], cards: [], shards: {} };
    const xpVals = Object.values(o.xp || {});
    return {
      win: o.win, stars: o.stars, firstClear: o.firstClear, ...o.currency, xp: xpVals.length ? Math.max(...xpVals) : 0,
      shards: o.shards || {}, cards: (o.cards || []).filter((c) => c.isNew).map((c) => c.def),
      dupeCards: (o.cards || []).filter((c) => !c.isNew), buffsGot: o.buffs,
      levelUps: (o.levelups || []).map((l) => ({ uid: l.uid, from: before[l.uid], to: l.level })),
      slotUnlocked: G.save.slots > slotsBefore ? G.save.slots : null, companyLevelUp: !!o.companyLevel,
      delta: o.rating ? o.rating.after - o.rating.before : null, raidDamage: o.raidDamage,
      goals: o.goals || null, newGoals: o.newGoals || [], chests: o.chests || [],
    };
  },

  // ---- upgrades
  levelUpCost(uid) {
    const u = store.unit(uid), v = G.unit(uid);
    if (!u) return null;
    const capped = u.level >= v.levelCap;
    const need = Math.max(0, (v.xpToNext || 0) - (u.xp || 0));
    const c = P?.scrapCost && E ? P.scrapCost(E, need) : { scrap: need, credits: Math.ceil(need * 0.5) };
    return { ...c, capped };
  },
  levelUp(uid) { return res(G.levelUp(uid, 1)); },
  rankUpCost(uid) { return G.unit(uid)?.rankUpCost || null; },
  rankUp(uid) { return res(G.rankUp(uid)); },
  abilityCost(uid, slot) {
    const u = store.unit(uid); if (!u || !E) return null;
    const lv = u.abilityLevels[slot] || 1;
    if (lv >= E.abilityLevel.max) return null;
    const c = P.abilityCost(E, lv);
    return { credits: c.credits || 0, chips: c.chips || 0, capped: lv >= P.abilityCap(E, u) };
  },
  abilityUp(uid, slot) { return res(G.upgradeAbility(uid, slot)); },
  hqCost(id) {
    const d = data().hq?.[id]; const lv = G.save.hq[id] || 0;
    if (!d || lv >= (d.max || 1)) return null;
    const c = P?.hqCost ? P.hqCost(d, lv) : {};
    return { credits: c.credits || 0, chips: c.chips || 0 };
  },
  hqLocked(id) { const d = data().hq?.[id]; return d && P?.hqRequirementMet ? !P.hqRequirementMet(G.data, G.save, d) : false; },
  hqUp(id) { return res(G.upgradeHq(id)); },

  // ---- shards (surplus beyond max rank -> chips) and star goals / chests
  convertShards(def) { return res(G.convertShards(def)); },
  convertAllShards() { return res(G.convertAllShards()); },
  surplusTotal() {
    let n = 0, chips = 0;
    for (const u of G.units()) if (u.surplusShards > 0) { n += u.surplusShards; chips += Math.floor(u.surplusShards * (u.shardValue?.chips ?? 1)); }
    return { shards: n, chips };
  },
  goals(levelId) { try { return G.goals?.(levelId) || []; } catch (e) { return []; } },
  chests(mapId) { try { return G.chests?.(mapId) || []; } catch (e) { return []; } },
  goalFormation(levelId) { return G.goalFormation ? res(G.goalFormation(levelId, false)) : { ok: false, why: 'Not available' }; },

  // ---- recruit / arena / events
  recruit(bannerId) {
    const r = res(G.recruit(bannerId, 1));
    if (!r.ok) return r;
    const x = r.results[0];
    return { ok: true, def: x.def, dupe: !x.isNew, shards: x.shards, uid: x.uid || G.save.units.find((u) => u.def === x.def)?.uid, rarity: x.rarity };
  },
  recruitMany(bannerId, n) {
    const r = res(G.recruit(bannerId, n));
    if (!r.ok) return r;
    return { ok: true, pulls: r.results.map((x) => ({ def: x.def, dupe: !x.isNew, shards: x.shards, rarity: x.rarity || unitDef(x.def)?.rarity,
      uid: x.uid || G.save.units.find((u) => u.def === x.def)?.uid })) };
  },
  canAfford(cost) { return Object.entries(cost || {}).every(([k, v]) => (G.save.wallet[k] || 0) >= v); },
  recruitCost(bannerId) {
    const b = data().recruit?.[bannerId]; if (!b) return null;
    const disc = 1 - Math.min(0.5, P?.hqEffect ? P.hqEffect(G.data, G.save, 'recruitDiscount') : 0);
    return Object.fromEntries(Object.entries(b.cost || {}).map(([k, v]) => [k, Math.round(v * disc)]));
  },
  arenaRivals() { return G.arenaRivals(); },
  arenaTier() { return G.arenaTier(); },
  buyArena(itemId, choice) { return res(G.buyArena(itemId, choice)); },
  activeEvents() { return G.activeEvents(); },
  // feature gates (DATA.features: {levelId: [featureKeys]}); a key may also be a level id
  isUnlocked(key) {
    if (!key) return true;
    if (Q_ALL) return true;
    if ((G.save.features || []).includes(key)) return true;
    if (G.save.story.levels[key]) return !!G.save.story.levels[key].stars;
    const F = data().features || {};
    let gated = false;
    for (const [lid, keys] of Object.entries(F)) if (keys.includes(key)) { gated = true; if (G.save.story.levels[lid]?.stars) return true; }
    return !gated && !/^m\d+_l\d+$/.test(key);
  },
  unlockLevelFor(key) { for (const [lid, keys] of Object.entries(data().features || {})) if (keys.includes(key)) return lid; return /^m\d+_l\d+$/.test(key) ? key : null; },
  markIntroSeen() { store.setSetting('introSeen', true); },
};
