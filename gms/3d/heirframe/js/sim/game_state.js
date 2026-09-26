// The single top-level game state + actions. Pure (no DOM/three). Emits events for UI/engine.
// The real-time runtime (movement, AI, step runner) lives in js/game/* and calls these actions.
import { createRng, rngFor } from './rng.js';
import { createEmitter, deepClone, clamp } from './util.js';
import { computeStats, makeCombatant, restat, resolveHit, tickCombatant, useSkill, skillReady, heal, addStatus } from './stats.js';
import { newFrame, frameDef, frameSkills, chooseMod, maxSync, tierName, canEquipItem } from './frames.js';
import { rollItem, rollKillLoot, rollCache, itemFR, salvageYield, tuneCost, applyTune, recalibrateCost, applyRecalibrate, marketStock, makeHeirCore, newLootState, RARITY_INDEX } from './loot.js';
import { xpNext, addXp, addSyncXp, framePrice, mkUpgrade, repairCost, wreckCost, rerollCost, consumableCost, cleanSlateCost, nextStash, legacyStats, nextGoal, featuresAt, newFeatures, SHIFT_SECONDS, RENTAL_FEE, LEGACY_XP } from './economy.js';
import { createEnemy } from './enemies.js';
import { L } from '../data/balance.js';
import { newFactionState, adjustRep, killRep, resetMissionRep, stance, addHeat, setHeat, tickHeat, heatStars, heatEffects, repPayMul, canHarm } from './factions.js';
import { generateBoard, completionRewards, threatDef, validateMission } from './missions.js';
import { newStoryState, storyReady, completeStory, tickRenewal, rollEcho, echoAvailable, buildStoryMission, storyFlags, storyCacheItem, codexView } from './story.js';
import { createSaveStore, SAVE_VERSION } from './save.js';
import { OWNABLE_FRAMES, MK_TIERS } from '../data/frames.js';
import { POWERS } from '../data/loot.js';
import { DISTRICTS, DISTRICT_ORDER } from '../data/districts.js';
import { THREATS } from '../data/missions.js';
import { STASH_SIZES, CONSUMABLES, COSTS, DEBT_FREE_PERK, SUCCESSION, LEGACY_NODES, WARRANTY_SURCHARGE, HOMES, PAINTS, MATERIAL_BROKER } from '../data/economy.js';
import { HEAT } from '../data/factions.js';
import { MATERIALS } from '../data/loot.js';

export function newState(seed = 1, { name = 'Wren' } = {}) {
  const st = {
    v: SAVE_VERSION, seed: String(seed), created: 0, playSeconds: 0, shiftIndex: 0, shiftClock: 0, actCounter: 0,
    player: { name, level: 1, xp: 0, legacyXp: 0, legacyPoints: 0, legacyBoard: {}, generation: 1, heirs: [] },
    credits: 0, rentalDebt: 0, wardDebt: COSTS.wardDebt, surchargeTotal: 0,
    materials: Object.fromEntries(Object.keys(MATERIALS).map(k => [k, 0])),
    frames: [], activeFrame: null, rentalReturned: false,
    stash: [], stashSize: STASH_SIZES[0].size,
    consumables: { repairKit: 1, signalJammer: 0, decoyDrone: 0 },
    loot: newLootState(),
    factions: newFactionState(),
    story: newStoryState(),
    districts: { unlocked: ['aurum_plaza'], current: 'aurum_plaza', danger: {} },
    threat: 'tense', overclock: { unlocked: 0, active: null },
    board: null, contract: null, market: null,
    perks: [], home: 'pod', homesOwned: ['pod'], paints: ['rental_orange'],
    flags: { firstFrameDiscount: false, boardUnlocked: false },
    stats: { contractsDone: 0, contractsFailed: 0, kills: 0, wrecks: 0, itemsFound: 0, creditsEarned: 0 },
  };
  const rental = newFrame('rental', 'fr_rental');
  st.frames.push(rental);
  st.activeFrame = rental.uid;
  return st;
}

export function createGame({ seed = 1, state = null, store = null, sites = null, name } = {}) {
  const S = state ? state : newState(seed, { name });
  const events = createEmitter();
  const saveStore = store || createSaveStore();
  const live = { player: null, sitesRegistry: sites || {}, combatRng: createRng(`${S.seed}|combat|${S.actCounter}`) };
  const emit = (e, p) => events.emit(e, p);
  const toast = (text, kind = 'info', extra = {}) => emit('toast', { text, kind, ...extra });
  const actRng = label => rngFor(S.seed, 'act', label, S.actCounter++);

  // ---- queries --------------------------------------------------------------------------
  const itemByUid = uid => S.stash.find(i => i.uid === uid) || null;
  const frameByUid = uid => S.frames.find(f => f.uid === uid) || null;
  const activeFrame = () => frameByUid(S.activeFrame);
  const ownedFrames = () => S.frames.filter(f => !f.rental);
  const freeStash = () => S.stash.filter(i => !i.equippedOn).length;
  const onRental = () => activeFrame()?.rental;
  const generationBonus = () => Math.min(S.player.generation - 1, SUCCESSION.maxGen);

  function extrasFor() {
    const ex = [legacyStats(S.player.legacyBoard)];
    if (S.perks.includes('debtFree')) ex.push(DEBT_FREE_PERK);
    return ex;
  }
  function frameItems(f) { return Object.values(f.equipped).map(itemByUid).filter(Boolean); }
  function frameStats(f = activeFrame()) {
    return computeStats({ frameDef: frameDef(f), sync: f.sync, tier: f.tier, level: S.player.level, items: frameItems(f), extras: extrasFor() });
  }
  function skillsOf(f = activeFrame(), stats = frameStats(f)) {
    const hooks = [...stats.powers.map(p => POWERS.find(x => x.id === p)?.hook), ...stats.setBonuses.map(b => b.hook)].filter(h => h?.skill);
    return frameSkills(f, { heirCore: frameItems(f).some(i => i.heirCore), hooks });
  }
  function frameFR(f = activeFrame()) {
    const d = frameDef(f);
    const base = Math.round(S.player.level * 10 * (f.rental ? 0.6 : MK_TIERS[f.tier].mult) * (1 + 0.02 * (f.sync - 1)));
    return base + frameItems(f).reduce((a, i) => a + itemFR(i), 0) + (d.slots.length < 6 ? 0 : 0);
  }
  function lootQuality() {
    const threat = threatDef(currentThreat());
    const danger = S.districts.danger[S.districts.current] ?? 0;
    return (threat.loot || 0) + danger * 0.03 + (frameStats().lootLuck || 0) + generationBonus() * 0.1;
  }
  function currentThreat() { return S.overclock.active ? `overclock:${S.overclock.active}` : S.threat; }

  // ---- player combatant ------------------------------------------------------------------
  function playerCombatant(rebuild = false) {
    const f = activeFrame();
    if (!live.player || rebuild || live.player.frameUid !== f.uid) {
      const stats = frameStats(f);
      const skills = skillsOf(f, stats);
      const c = makeCombatant({ id: 'player', name: S.player.name, level: S.player.level, stats, faction: 'player', kind: 'player', passive: frameDef(f).passive?.id, skills });
      c.hp = Math.max(1, Math.round(stats.hp * (f.hpFrac ?? 1)));
      c.frameUid = f.uid;
      c.momentumMax = skills.attack?.momentumMax || frameDef(f).passive?.maxStacks || 5;
      live.player = c;
    }
    return live.player;
  }
  function restatPlayer({ heal: full = false } = {}) {
    if (!live.player || live.player.frameUid !== S.activeFrame) return playerCombatant(true);
    const f = activeFrame();
    const stats = frameStats(f);
    restat(live.player, stats, { heal: full });
    live.player.skills = skillsOf(f, stats);
    live.player.level = S.player.level;
    return live.player;
  }
  function storeHp() {
    const c = live.player;
    if (!c) return;
    const f = frameByUid(c.frameUid);
    if (f) f.hpFrac = clamp(c.hp / c.stats.hp, 0, 1);
  }

  // ---- money / materials ------------------------------------------------------------------
  function addCredits(n, reason) {
    if (!n) return;
    S.credits += n;
    if (n > 0) S.stats.creditsEarned += n;
    emit('credits', { credits: S.credits, delta: n, reason });
  }
  function spend(cost, reason) {
    if (S.credits < cost) { toast(`Not enough credits (${cost})`, 'bad'); return false; }
    addCredits(-cost, reason);
    return true;
  }
  function hasMats(m) { return Object.entries(m).every(([k, v]) => !v || (S.materials[k] || 0) >= v); }
  function spendMats(m) { for (const [k, v] of Object.entries(m)) if (v) S.materials[k] -= v; }
  function addMats(m) { for (const [k, v] of Object.entries(m)) S.materials[k] = (S.materials[k] || 0) + v; emit('materials', { ...S.materials }); }

  // ---- xp -----------------------------------------------------------------------------------
  function giveXp(amount, source) {
    const f = activeFrame();
    const mult = (1 + (frameStats(f).xpPct || 0)) * (1 + SUCCESSION.xpPerGen * generationBonus());
    const xp = Math.round(amount * mult);
    const before = S.player.level;
    const res = addXp(S.player, xp);
    emit('xp', { xp: S.player.xp, xpMax: xpNext(S.player.level), gained: xp, source });
    const syncUps = addSyncXp(f, xp, maxSync(f));
    for (const s of syncUps) emit('sync', { frame: f.uid, sync: s, modUnlocked: [5, 10, 15, 20].includes(s) });
    if (res.levels.length) {
      restatPlayer({ heal: true });
      for (const lvl of res.levels) emit('levelUp', { level: lvl, features: newFeatures(lvl - 1, lvl) });
      if (newFeatures(before, S.player.level).some(x => x.id === 'brightline')) unlockDistrict('brightline');
      if (S.player.level >= 60 && !S.overclock.unlocked) { S.overclock.unlocked = 1; emit('overclock:unlock', { n: 1 }); }
    } else if (syncUps.length) restatPlayer();
    if (res.legacy) emit('legacy', { points: S.player.legacyPoints, gained: res.legacy });
    return xp;
  }

  // ---- stash / items ----------------------------------------------------------------------
  function addItem(item, { silent = false } = {}) {
    const low = ['scrap', 'standard'];
    if (freeStash() >= S.stashSize) {
      if (low.includes(item.rarity)) {
        const mats = salvageYield(item, actRng('autosalvage'));
        addMats(mats);
        emit('autosalvage', { item, mats });
        return null;
      }
      const victim = S.stash.find(i => !i.equippedOn && low.includes(i.rarity) && !i.locked);
      if (victim) salvage(victim.uid, { silent: true });
      else emit('stash:full', { size: S.stashSize });
    }
    item.new = true;
    S.stash.push(item);
    S.stats.itemsFound++;
    const f = activeFrame();
    const cur = f.equipped[item.slot] ? itemByUid(f.equipped[item.slot]) : null;
    const eq = canEquipItem(item, f, S.player.level);
    item.upgrade = eq.ok && itemFR(item) > itemFR(cur);
    if (!silent) emit('loot', { items: [item] });
    return item;
  }

  function equip(itemUid, frameUid = S.activeFrame) {
    const item = itemByUid(itemUid);
    const f = frameByUid(frameUid);
    if (!item || !f) return { ok: false, reason: 'missing' };
    const chk = canEquipItem(item, f, S.player.level);
    if (!chk.ok) return chk;
    if (item.equippedOn && item.equippedOn !== f.uid) {
      const other = frameByUid(item.equippedOn);
      if (other) other.equipped[item.slot] = null;
    }
    const prev = f.equipped[item.slot];
    if (prev && prev !== item.uid) { const p = itemByUid(prev); if (p) p.equippedOn = null; }
    f.equipped[item.slot] = item.uid;
    item.equippedOn = f.uid;
    item.new = false; item.upgrade = false;
    if (f.uid === S.activeFrame) restatPlayer();
    for (const it of S.stash) if (!it.equippedOn && it.slot === item.slot) it.upgrade = canEquipItem(it, f, S.player.level).ok && itemFR(it) > itemFR(item);
    emit('equip', { frame: f.uid, slot: item.slot, item, prev });
    return { ok: true, prev };
  }

  function unequip(frameUid, slot) {
    const f = frameByUid(frameUid);
    const uid = f?.equipped[slot];
    if (!uid) return { ok: false };
    const it = itemByUid(uid);
    if (it) it.equippedOn = null;
    f.equipped[slot] = null;
    if (f.uid === S.activeFrame) restatPlayer();
    emit('equip', { frame: f.uid, slot, item: null, prev: uid });
    return { ok: true };
  }

  function equipBest(frameUid = S.activeFrame) {
    const f = frameByUid(frameUid);
    const changed = [];
    for (const slot of frameDef(f).slots) {
      const cur = f.equipped[slot] ? itemByUid(f.equipped[slot]) : null;
      let best = cur;
      for (const it of S.stash) {
        if (it.slot !== slot || (it.equippedOn && it.equippedOn !== f.uid)) continue;
        if (!canEquipItem(it, f, S.player.level).ok) continue;
        if (itemFR(it) > itemFR(best)) best = it;
      }
      if (best && best !== cur) { equip(best.uid, f.uid); changed.push(best.uid); }
    }
    return changed;
  }

  function salvage(itemUid, { silent = false } = {}) {
    const it = itemByUid(itemUid);
    if (!it || it.equippedOn || it.locked || it.heirCore) return { ok: false };
    const mats = salvageYield(it, actRng('salvage'));
    S.stash.splice(S.stash.indexOf(it), 1);
    addMats(mats);
    if (!silent) emit('salvage', { item: it, mats });
    return { ok: true, mats };
  }

  function salvageAll(maxRarity = 'standard') {
    const cap = RARITY_INDEX[maxRarity];
    const victims = S.stash.filter(i => !i.equippedOn && !i.locked && !i.heirCore && RARITY_INDEX[i.rarity] <= cap);
    const total = {};
    for (const v of victims) { const r = salvage(v.uid, { silent: true }); for (const [k, n] of Object.entries(r.mats || {})) total[k] = (total[k] || 0) + n; }
    emit('salvage', { count: victims.length, mats: total });
    return { count: victims.length, mats: total };
  }

  function tune(itemUid) {
    const it = itemByUid(itemUid);
    if (!it) return { ok: false, reason: 'missing' };
    const c = tuneCost(it);
    if (!c) return { ok: false, reason: 'max' };
    if (!hasMats(c.mats)) return { ok: false, reason: 'materials', need: c.mats };
    if (!spend(c.credits, 'tune')) return { ok: false, reason: 'credits', need: c.credits };
    spendMats(c.mats);
    const r = applyTune(it, actRng('tune'));
    if (it.equippedOn === S.activeFrame) restatPlayer();
    emit('tune', { item: it, ...r, cost: c });
    return r;
  }

  function recalibrate(itemUid, index) {
    const it = itemByUid(itemUid);
    if (!it) return { ok: false, reason: 'missing' };
    if (!featuresAt(S.player.level).includes('recalibrate')) return { ok: false, reason: 'locked' };
    if (it.recal != null && it.recal !== index) return { ok: false, reason: 'locked', index: it.recal };
    const c = recalibrateCost(it);
    if (!hasMats(c.mats)) return { ok: false, reason: 'materials', need: c.mats };
    if (!spend(c.credits, 'recalibrate')) return { ok: false, reason: 'credits' };
    spendMats(c.mats);
    const r = applyRecalibrate(it, index, actRng('recal'), lootQuality());
    if (it.equippedOn === S.activeFrame) restatPlayer();
    emit('recalibrate', { item: it, ...r });
    return r;
  }

  // ---- frames -----------------------------------------------------------------------------
  function buyFrame(frameId) {
    if (!OWNABLE_FRAMES.includes(frameId)) return { ok: false, reason: 'bad' };
    if (S.frames.some(f => f.frameId === frameId)) return { ok: false, reason: 'owned' };
    if (!featuresAt(S.player.level).includes('pro') && !S.flags.firstFrameDiscount) return { ok: false, reason: 'level', need: 5 };
    const owned = ownedFrames().length;
    const price = framePrice(owned, { discount: S.flags.firstFrameDiscount });
    if (price == null) return { ok: false, reason: 'max' };
    if (!spend(price, 'frame')) return { ok: false, reason: 'credits', need: price };
    if (owned === 0) S.flags.firstFrameDiscount = false;
    const f = newFrame(frameId, `fr_${frameId}`);
    S.frames.push(f);
    emit('frame:buy', { frame: f, price });
    swapFrame(f.uid, { force: true });
    return { ok: true, frame: f, price };
  }

  function swapFrame(frameUid, { force = false, inCombat = false, bossFight = false } = {}) {
    const f = frameByUid(frameUid);
    if (!f) return { ok: false, reason: 'missing' };
    if (!force) {
      if (inCombat) return { ok: false, reason: 'combat' };
      if (bossFight) return { ok: false, reason: 'boss' };
      if (S.contract?.mission.modifiers.includes('noSwap')) return { ok: false, reason: 'noSwap' };
      if (f.wrecked) return { ok: false, reason: 'wrecked' };
    }
    storeHp();
    S.activeFrame = f.uid;
    playerCombatant(true);
    emit('frame:swap', { frame: f });
    return { ok: true };
  }

  function returnRental() {
    const r = S.frames.find(f => f.rental);
    if (!r || !ownedFrames().length) return { ok: false, reason: r ? 'noFrame' : 'none' };
    if (S.rentalDebt > 0 && !spend(S.rentalDebt, 'rentalDebt')) return { ok: false, reason: 'debt', need: S.rentalDebt };
    S.rentalDebt = 0;
    for (const uid of Object.values(r.equipped)) if (uid) { const it = itemByUid(uid); if (it) it.equippedOn = null; }
    S.frames = S.frames.filter(f => f !== r);
    S.rentalReturned = true;
    if (S.activeFrame === r.uid) swapFrame(ownedFrames()[0].uid, { force: true });
    emit('rental:return', {});
    return { ok: true };
  }

  function upgradeMk(frameUid) {
    const f = frameByUid(frameUid);
    if (!f || f.rental) return { ok: false, reason: 'bad' };
    const up = mkUpgrade(f, S.player.level);
    if (!up) return { ok: false, reason: 'max' };
    if (!up.ok) return { ok: false, reason: 'gate', needLevel: up.needLevel, needSync: up.needSync };
    if (!spend(up.cost, 'mk')) return { ok: false, reason: 'credits', need: up.cost };
    f.tier = up.tier;
    if (f.uid === S.activeFrame) restatPlayer({ heal: true });
    emit('frame:mk', { frame: f, tier: f.tier, name: up.name });
    return { ok: true, tier: f.tier };
  }

  function chooseSyncMod(frameUid, rank, optionId) {
    const f = frameByUid(frameUid);
    const ok = f && chooseMod(f, rank, optionId);
    if (ok && f.uid === S.activeFrame) restatPlayer();
    if (ok) emit('frame:mod', { frame: f.uid, rank, optionId });
    return { ok: !!ok };
  }

  function repair(frameUid = S.activeFrame) {
    const f = frameByUid(frameUid);
    if (!f) return { ok: false };
    if (f.uid === S.activeFrame) storeHp();
    const missing = 1 - (f.hpFrac ?? 1);
    const cost = f.rental ? 0 : repairCost(missing, S.player.level, frameStats(f).repairCostPct);
    if (cost && !spend(cost, 'repair')) return { ok: false, reason: 'credits', need: cost };
    f.hpFrac = 1; f.wrecked = false;
    if (f.uid === S.activeFrame) restatPlayer({ heal: true });
    emit('repair', { frame: f.uid, cost });
    return { ok: true, cost };
  }

  // ---- consumables / market / stash --------------------------------------------------------
  function carryCap(id) { return id === 'repairKit' ? (S.player.level >= 20 ? CONSUMABLES.repairKit.carryAt20 : CONSUMABLES.repairKit.carry) : 5; }
  function buyConsumable(id) {
    if (!CONSUMABLES[id]) return { ok: false };
    if ((S.consumables[id] || 0) >= carryCap(id)) return { ok: false, reason: 'full' };
    if (!spend(consumableCost(id, S.player.level), id)) return { ok: false, reason: 'credits' };
    S.consumables[id] = (S.consumables[id] || 0) + 1;
    return { ok: true, count: S.consumables[id] };
  }
  function useConsumable(id) {
    if (!(S.consumables[id] > 0)) return { ok: false, reason: 'none' };
    S.consumables[id]--;
    if (id === 'repairKit') { const c = playerCombatant(); heal(c, c.stats.hp * CONSUMABLES.repairKit.healPct); }
    if (id === 'signalJammer') setHeat(S.factions, Math.max(0, S.factions.heat - 1)), emit('heat', { stars: heatStars(S.factions) });
    emit('consumable', { id, left: S.consumables[id] });
    return { ok: true };
  }
  function cleanSlate() {
    if (!spend(cleanSlateCost(S.player.level), 'cleanSlate')) return { ok: false };
    setHeat(S.factions, 0); emit('heat', { stars: 0 });
    return { ok: true };
  }
  function buyStash() {
    const n = nextStash(S.stashSize);
    if (!n) return { ok: false, reason: 'max' };
    if (!spend(n.cost, 'stash')) return { ok: false, reason: 'credits', need: n.cost };
    S.stashSize = n.size;
    return { ok: true, size: n.size };
  }
  function refreshMarket() {
    S.market = { shift: S.shiftIndex, stock: marketStock(rngFor(S.seed, 'market', S.shiftIndex), S.player.level, { rental: onRental() }).map(x => ({ ...x, sold: false })) };
    return S.market;
  }
  function buyMarket(index) {
    if (!S.market || S.market.shift !== S.shiftIndex) refreshMarket();
    const e = S.market.stock[index];
    if (!e || e.sold) return { ok: false, reason: 'sold' };
    if (!spend(e.price, 'market')) return { ok: false, reason: 'credits', need: e.price };
    e.sold = true;
    addItem(deepClone(e.item));
    return { ok: true, item: e.item };
  }
  function brokerPrice(id, count = 1) {
    const base = MATERIAL_BROKER.price[id];
    if (!base) return null;
    const bought = S.broker?.shift === S.shiftIndex ? S.broker.bought[id] || 0 : 0;
    let total = 0;
    for (let i = 0; i < count; i++) total += Math.round(base * L(S.player.level) * (1 + MATERIAL_BROKER.step * (bought + i)));
    return total;
  }
  function buyMaterial(id, count = 1) {
    if (S.player.level < MATERIAL_BROKER.unlock) return { ok: false, reason: 'locked', need: MATERIAL_BROKER.unlock };
    const cost = brokerPrice(id, count);
    if (cost == null || count < 1) return { ok: false, reason: 'bad' };
    if (!spend(cost, 'broker')) return { ok: false, reason: 'credits', need: cost };
    if (S.broker?.shift !== S.shiftIndex) S.broker = { shift: S.shiftIndex, bought: {} };
    S.broker.bought[id] = (S.broker.bought[id] || 0) + count;
    addMats({ [id]: count });
    return { ok: true, cost };
  }
  function payWardDebt() {
    if (!S.wardDebt) return { ok: false };
    if (!spend(S.wardDebt, 'wardDebt')) return { ok: false, reason: 'credits', need: S.wardDebt };
    S.wardDebt = 0;
    S.perks.push('debtFree');
    restatPlayer();
    emit('perk', { id: 'debtFree' });
    return { ok: true };
  }
  function payRental() {
    if (!S.rentalDebt) return { ok: true, paid: 0 };
    const pay = Math.min(S.credits, S.rentalDebt);
    addCredits(-pay, 'rentalDebt');
    S.rentalDebt -= pay;
    return { ok: S.rentalDebt === 0, paid: pay, left: S.rentalDebt };
  }

  function storyDone(id) { return id === 'finale' ? S.story.flags.includes('finale') : S.story.done.includes(id); }
  function homeState(id) {
    const h = HOMES[id];
    if (!h) return null;
    return { ...h, owned: S.homesOwned.includes(id), current: S.home === id, locked: !!h.needs && !storyDone(h.needs) };
  }
  function buyHome(id) {
    const h = homeState(id);
    if (!h) return { ok: false, reason: 'bad' };
    if (h.owned) return { ok: false, reason: 'owned' };
    if (h.locked) return { ok: false, reason: 'locked', needs: h.needs };
    if (h.cost && !spend(h.cost, 'home')) return { ok: false, reason: 'credits', need: h.cost };
    S.homesOwned.push(id);
    S.home = id;
    emit('home', { id, name: h.name });
    return { ok: true };
  }
  function setHome(id) {
    if (!S.homesOwned.includes(id)) return { ok: false };
    S.home = id; emit('home', { id, name: HOMES[id].name });
    return { ok: true };
  }
  function paintState(id) {
    const p = PAINTS.find(x => x.id === id);
    if (!p) return null;
    const locked = p.needs === 'trusted' ? !Object.values(S.factions.rep).some(v => v >= 50) : p.needs === 'story' ? !storyDone('finale') : false;
    return { ...p, owned: S.paints.includes(id), locked };
  }
  function buyPaint(id) {
    const p = paintState(id);
    if (!p) return { ok: false, reason: 'bad' };
    if (p.owned) return { ok: false, reason: 'owned' };
    if (p.locked) return { ok: false, reason: 'locked' };
    if (p.cost && !spend(p.cost, 'paint')) return { ok: false, reason: 'credits', need: p.cost };
    S.paints.push(id);
    emit('paint:buy', { id });
    return { ok: true };
  }
  function setPaint(frameUid, id) {
    const f = frameByUid(frameUid);
    if (!f || !S.paints.includes(id)) return { ok: false };
    f.paint = id; emit('paint', { frame: f.uid, paint: id });
    return { ok: true };
  }

  // ---- districts / threat ----------------------------------------------------------------
  function unlockDistrict(id) {
    if (!DISTRICTS[id] || S.districts.unlocked.includes(id)) return false;
    S.districts.unlocked.push(id);
    emit('district:unlock', { id, name: DISTRICTS[id].name });
    return true;
  }
  function travel(id) {
    if (!S.districts.unlocked.includes(id)) return { ok: false, reason: 'locked' };
    if (heatEffects(S.factions).relaysLocked) return { ok: false, reason: 'heat' };
    S.districts.current = id;
    emit('travel', { id, name: DISTRICTS[id].name });
    return { ok: true };
  }
  function threatsUnlocked() {
    return Object.values(THREATS).filter(t => S.player.level >= t.unlock).map(t => t.id);
  }
  function setThreat(id) {
    if (String(id).startsWith('overclock')) {
      const n = +String(id).split(':')[1];
      if (S.player.level < 60 || n < 1 || n > Math.max(1, S.overclock.unlocked)) return { ok: false };
      S.overclock.active = n;
    } else {
      if (!threatsUnlocked().includes(id)) return { ok: false, reason: 'locked' };
      S.threat = id; S.overclock.active = null;
    }
    refreshBoard();
    return { ok: true };
  }

  // ---- board / contracts -------------------------------------------------------------------
  function boardCtx(extra = {}) {
    return {
      seed: S.seed, shiftIndex: S.shiftIndex, riderLevel: S.player.level, threat: currentThreat(), heatStars: heatStars(S.factions),
      frameArchetype: activeFrame().archetype, districts: S.districts.unlocked.map(id => ({ id })), currentDistrict: S.districts.current,
      danger: Object.fromEntries(S.districts.unlocked.map(id => [id, S.districts.danger[id] ?? DISTRICTS[id].danger])),
      contractsDone: S.stats.contractsDone, flags: storyFlags(S.story), sites: live.sitesRegistry,
      repMul: f => repPayMul(S.factions, f), creditsPct: frameStats().creditsPct, ...extra,
    };
  }
  function storyCard() {
    const def = storyReady(S.story, S.player.level);
    if (!def) return null;
    return buildStoryMission(def.id, boardCtx());
  }
  function refreshBoard({ reroll = 0 } = {}) {
    S.board = generateBoard({ ...boardCtx(), reroll, storyCard: storyCard() });
    emit('board', S.board);
    return S.board;
  }
  function rerollBoard() {
    const cost = rerollCost(S.player.level);
    if (!spend(cost, 'reroll')) return { ok: false, reason: 'credits', need: cost };
    return { ok: true, board: refreshBoard({ reroll: (S.board?.reroll || 0) + 1 }) };
  }
  function board() {
    if (!S.board || S.board.shift !== S.shiftIndex) refreshBoard();
    return S.board;
  }

  function acceptContract(id) {
    if (S.contract) return { ok: false, reason: 'active' };
    const b = board();
    let m = b.story?.id === id ? b.story : b.cards.find(c => c.id === id);
    if (!m) return { ok: false, reason: 'missing' };
    m = deepClone(m);
    S.contract = {
      mission: m, steps: m.steps.map(s => ({ ...s })), stepIndex: 0, startedAt: S.playSeconds, elapsed: 0,
      kills: 0, alarm: false, hpLost: false, collateral: 0, twistFired: false, twistOutcome: null, choices: {}, loot: [], credits: 0, xp: 0,
    };
    if (m.grade !== 'story') b.cards = b.cards.filter(c => c.id !== id);
    resetMissionRep(S.factions);
    if (m.grade === 'black') { const h = addHeat(S.factions, 'blackContract'); emit('heat', h); }
    live.combatRng = createRng(`${S.seed}|combat|${m.seed}`);
    playerCombatant();
    emit('contract:accept', { mission: m });
    return { ok: true, mission: m };
  }

  const currentStep = () => S.contract ? S.contract.steps[S.contract.stepIndex] || null : null;

  // Mark the current step complete (info: {outcome, captured, choice}) → {done, step}
  function completeStep(info = {}) {
    const c = S.contract;
    if (!c) return { ok: false };
    const s = currentStep();
    if (s?.type === 'choose') {
      const opt = s.options?.find(o => o.outcome === info.outcome) || s.options?.[info.choice ?? 0];
      if (opt) {
        c.choices[s.choiceKey || s.id] = opt.outcome;
        if (!s.choiceKey) c.twistOutcome = opt;
        if (opt.fail) { emit('contract:step', { index: c.stepIndex, step: s, choice: opt }); return failContract('bribe', { payMult: opt.payMult }); }
      }
    }
    if (info.captured) c.captured = true;
    emit('contract:step', { index: c.stepIndex, step: s, info });
    c.stepIndex++;
    while (c.steps[c.stepIndex]?.auto) c.stepIndex++;
    const next = currentStep();
    return { ok: true, done: !next, step: next, index: c.stepIndex };
  }

  // Fire the hidden twist (the runner decides when: mission.twist.atStep/at). Splices twist steps in after the current step.
  function fireTwist() {
    const c = S.contract;
    const tw = c?.mission.twist;
    if (!tw || c.twistFired) return null;
    c.twistFired = true;
    if (tw.steps?.length) {
      const at = Math.min(c.stepIndex + 1, c.steps.length);
      if (tw.replaceRest) c.steps.splice(at, c.steps.length - at, ...deepClone(tw.steps));
      else c.steps.splice(at, 0, ...deepClone(tw.steps));
      if (tw.npc) c.mission.npcs.push(tw.npc);
    }
    if (tw.heat) emit('heat', addHeat(S.factions, 'twist', tw.heat));
    emit('twist', { twist: tw });
    return tw;
  }

  function reportAlarm() {
    const c = S.contract;
    if (c) c.alarm = true;
    emit('heat', addHeat(S.factions, 'alarm'));
    if (c?.mission.modifiers.includes('noAlarm')) return failContract('alarm');
    return { ok: true };
  }
  function reportCollateral(cr) {
    if (!S.contract) return;
    const mult = S.contract.mission.modifiers.includes('collateral') ? 2 : 1;
    S.contract.collateral += cr * mult;
    if (S.contract.collateral >= HEAT.collateralThreshold && !S.contract.collateralHeat) { S.contract.collateralHeat = true; emit('heat', addHeat(S.factions, 'collateral')); }
  }
  function reportSpotted() {
    if (S.contract?.mission.modifiers.includes('watched')) emit('heat', addHeat(S.factions, 'spotted'));
  }

  function finishContract(result = {}) {
    const c = S.contract;
    if (!c) return { ok: false };
    const m = c.mission;
    storeHp();
    const heatMult = heatEffects(S.factions).rewardMult;
    const rw = completionRewards(m, {
      alarm: c.alarm, hpLost: c.hpLost, time: result.time ?? c.elapsed, collateral: c.collateral, captured: c.captured,
      twistFired: c.twistFired, twistOutcome: c.twistOutcome, raceFirst: result.raceFirst, rental: onRental(), heatMult,
    });
    const out = { mission: m, credits: rw.credits, surcharge: rw.surcharge, bonuses: rw.bonuses, xp: 0, items: [], rep: [], clue: null, story: null, levelFrom: S.player.level, stiffed: rw.stiffed };
    if (m.twist?.id === 'T10' && c.twistFired) {
      const clue = echoAvailable(S.story, m.district) ? rollEcho({ chance: () => true, pick: a => a[0] }, S.story, m.district) : null;
      if (clue) { out.clue = clue; emit('clue', { id: clue }); }
      else out.credits = Math.round(out.credits * m.twist.fallbackCreditMult);
    }
    addCredits(out.credits, 'contract');
    S.surchargeTotal += rw.surcharge;
    out.xp = giveXp(rw.xp, 'contract');
    for (const [f, d] of Object.entries(rw.rep)) out.rep.push(...adjustRep(S.factions, f, d));
    for (const [f, d] of Object.entries(c.twistOutcome?.rep || {})) out.rep.push(...adjustRep(S.factions, f, d));
    if (m.twist?.clientRep && c.twistFired) out.rep.push(...adjustRep(S.factions, m.client.faction, m.twist.clientRep));
    if (m.heat) emit('heat', addHeat(S.factions, 'mission', m.heat));
    const rng = actRng('cache:' + m.id);
    const cacheItem = m.cacheItem ? storyCacheItem(m.cacheItem, rng, m.level) : rollCache(rng, m.grade, { level: m.level, riderLevel: S.player.level, q: lootQuality(), rental: onRental(), lootState: S.loot, overclock: S.overclock.active });
    if (cacheItem) { const it = addItem(cacheItem, { silent: true }); if (it) out.items.push(it); }
    if (rw.stiffed && S.board) {
      const collect = deepClone(m);
      collect.id = m.id + '_collect'; collect.title = `Collect from ${m.client.name}`; collect.twist = null; collect.archetype = 'bounty';
      collect.payout = { ...collect.payout, credits: Math.round(m.payout.credits * m.twist.collectPay) };
      S.board.cards.unshift(collect);
    }
    if (m.story) {
      const fx = completeStory(S.story, m.story.id, { choice: c.choices[m.story.choice] });
      out.story = fx;
      if (fx) {
        for (const d of fx.unlocks) unlockDistrict(d);
        if (fx.grants.firstFrameDiscount) S.flags.firstFrameDiscount = true;
        if (fx.grants.heirCore) addItem(makeHeirCore(actRng('heircore'), m.level));
        if (fx.grants.home) S.home = fx.grants.home;
        if (fx.setHeat != null) emit('heat', (setHeat(S.factions, fx.setHeat), { stars: heatStars(S.factions) }));
        if (m.story.id === 'a1_m1') S.flags.boardUnlocked = true;
        emit('story', fx);
      }
    } else {
      tickRenewal(S.story);
      const echo = rollEcho(actRng('echo'), S.story, m.district);
      if (echo) { out.clue = echo; emit('clue', { id: echo }); }
      if (m.faction && m.archetype !== 'pest') S.districts.danger[m.district] = Math.min(10, (S.districts.danger[m.district] ?? DISTRICTS[m.district].danger) + 0.3);
    }
    const oc = S.overclock.active;
    if (oc && m.grade === 'elite' && oc >= S.overclock.unlocked && oc < 30) { S.overclock.unlocked = oc + 1; out.overclockUnlocked = oc + 1; emit('overclock:unlock', { n: oc + 1 }); }
    S.stats.contractsDone++;
    out.levelTo = S.player.level;
    out.grade = gradeFor(c, rw);
    S.contract = null;
    emit('contract:complete', out);
    if (S.board) S.board.story = storyCard();
    autosave();
    return { ok: true, ...out };
  }

  function gradeFor(c, rw) {
    const n = rw.bonuses.length;
    return n >= 4 ? 'S' : n === 3 ? 'A' : n === 2 ? 'B' : 'C';
  }

  function failContract(reason = 'fail', { payMult } = {}) {
    const c = S.contract;
    if (!c) return { ok: false };
    storeHp();
    const m = c.mission;
    const rep = adjustRep(S.factions, m.client.faction, -3, { rivals: false });
    let credits = 0;
    if (payMult) { credits = Math.round(m.payout.credits * payMult); addCredits(credits, 'bribe'); }
    S.stats.contractsFailed++;
    S.contract = null;
    emit('contract:fail', { mission: m, reason, rep, credits });
    autosave();
    return { ok: true, failed: true, reason, credits };
  }

  function abandonContract() { return failContract('abandon'); }

  // Frame reached 0 HP. Checkpointed missions (heists, defends, story) keep going after a redeploy.
  function playerWrecked() {
    const f = activeFrame();
    const cost = f.rental ? 0 : wreckCost(S.player.level);
    if (cost) { const pay = Math.min(cost, S.credits); addCredits(-pay, 'wreck'); }
    f.hpFrac = 0.5;
    S.stats.wrecks++;
    playerCombatant(true);
    const cp = S.contract && (S.contract.mission.checkpoints || S.contract.mission.archetype === 'defend');
    emit('wreck', { cost, checkpoint: !!cp });
    if (S.contract && !cp) failContract('wrecked');
    return { cost, checkpoint: !!cp };
  }

  // ---- combat bridge ------------------------------------------------------------------------
  function spawnEnemy(spawn) {
    const t = threatDef(currentThreat());
    return createEnemy(spawn, { threat: { hp: t.hp, dmg: t.dmg }, riderLevel: S.player.level });
  }
  // attacker/defender are combatants (player from playerCombatant(), enemies from spawnEnemy)
  function hit(attacker, defender, skill, opts = {}) {
    if (defender.faction && !canHarm(defender.faction)) return { hit: false, immune: true };
    const res = resolveHit(attacker, defender, skill, live.combatRng, opts);
    if (defender.kind === 'player' && res.amount > 0 && S.contract) S.contract.hpLost = true;
    if (defender.kind === 'player' && !defender.alive) res.wrecked = true;
    return res;
  }
  function useSkillFor(c, skill, opts = {}) {
    const energyCostMult = S.contract?.mission.modifiers.includes('jammed') ? 1.5 : 1;
    return useSkill(c, skill, { energyCostMult, ...opts });
  }
  function kill(enemy) {
    if (!enemy || enemy.kind !== 'enemy' || enemy.rewarded) return null;
    if (!canHarm(enemy.faction)) return null;
    enemy.rewarded = true;
    const out = { xp: 0, credits: 0, items: [], rep: [] };
    out.xp = giveXp(enemy.xp, 'kill');
    const stats = frameStats();
    const drop = rollKillLoot(actRng('kill'), {
      rank: enemy.rank, level: enemy.level, riderLevel: S.player.level, q: lootQuality(), rental: onRental(), lootState: S.loot,
      overclock: S.overclock.active, powers: stats.powers, killCreditsPct: stats.killCreditsPct, creditsPct: stats.creditsPct,
    });
    if (drop.credits) { addCredits(drop.credits, 'kill'); out.credits = drop.credits; }
    for (const it of drop.items) { const added = addItem(it, { silent: true }); if (added) out.items.push(added); }
    if (out.items.length) emit('loot', { items: out.items, credits: out.credits, from: enemy.id });
    out.rep = killRep(S.factions, enemy.faction);
    if (enemy.faction === 'concord') emit('heat', addHeat(S.factions, 'wardenKill'));
    S.stats.kills++;
    if (S.contract) S.contract.kills++;
    const p = live.player;
    if (p && stats.powers.includes('brighter_future')) heal(p, p.stats.hp * 0.03);
    emit('kill', { enemy: enemy.id, defId: enemy.defId, rank: enemy.rank, ...out });
    return out;
  }
  function enemyStance(faction) {
    const mh = S.contract ? new Set([S.contract.mission.faction].filter(Boolean)) : null;
    return stance(S.factions, faction, { missionHostile: mh, onTurf: faction === 'syndicate' });
  }

  // ---- time ----------------------------------------------------------------------------------
  // dt seconds of ACTIVE play. opts.moving for the gunner passive.
  function tick(dt, opts = {}) {
    S.playSeconds += dt;
    S.shiftClock += dt;
    if (S.contract) S.contract.elapsed += dt;
    const h = tickHeat(S.factions, dt);
    if (h.changed) emit('heat', h);
    if (live.player) {
      const evs = tickCombatant(live.player, dt, { moving: opts.moving });
      for (const e of evs) if (e.type === 'death') res_wreck();
    }
    if (!S.contract) {
      const f = activeFrame();
      if (f.rental) f.hpFrac = 1;
      else if ((f.hpFrac ?? 1) < 0.5) f.hpFrac = Math.min(0.5, f.hpFrac + dt * 0.01);
    }
    while (S.shiftClock >= SHIFT_SECONDS) { S.shiftClock -= SHIFT_SECONDS; newShift(); }
  }
  function res_wreck() { emit('playerDown', {}); }

  function newShift() {
    S.shiftIndex++;
    let fee = 0;
    if (onRental() && !S.rentalReturned) {
      fee = RENTAL_FEE;
      if (S.credits >= fee) addCredits(-fee, 'rental');
      else { S.rentalDebt += fee - S.credits; addCredits(-S.credits, 'rental'); toast('HireFrame: rental fee added to your account balance!', 'warn'); }
      emit('rental:fee', { fee, debt: S.rentalDebt });
    }
    for (const id of S.districts.unlocked) {
      const floor = DISTRICTS[id].danger;
      const cur = S.districts.danger[id] ?? floor;
      S.districts.danger[id] = Math.max(floor, cur - 0.5);
    }
    if (!S.contract) refreshBoard();
    refreshMarket();
    emit('shift', { shift: S.shiftIndex, fee });
  }

  // ---- legacy / succession ---------------------------------------------------------------
  function spendLegacy(nodeId) {
    if (!LEGACY_NODES.some(n => n.id === nodeId) || S.player.legacyPoints < 1) return { ok: false };
    S.player.legacyPoints--;
    S.player.legacyBoard[nodeId] = (S.player.legacyBoard[nodeId] || 0) + 1;
    restatPlayer();
    return { ok: true, ranks: S.player.legacyBoard[nodeId] };
  }
  function legacyTotal() { return Object.values(S.player.legacyBoard).reduce((a, b) => a + b, 0) + S.player.legacyPoints; }
  function succession(heirName, heirloomUid) {
    if (legacyTotal() < SUCCESSION.minLegacy) return { ok: false, reason: 'legacy' };
    const hl = heirloomUid && itemByUid(heirloomUid);
    if (hl && hl.rarity === 'heirloom') hl.maxTuneBonus = 1;
    S.player.heirs.push({ name: heirName, gen: S.player.generation + 1 });
    S.player.generation++;
    S.player.name = heirName; S.player.level = 1; S.player.xp = 0; S.player.legacyXp = 0;
    for (const f of S.frames) { f.sync = 1; f.syncXp = 0; }
    S.credits = Math.min(S.credits, SUCCESSION.creditCap);
    S.factions.heat = 0; S.districts.danger = {};
    const codexClues = S.story.clues.slice();
    S.story = newStoryState(); S.story.clues = codexClues; S.story.echo = true;
    S.contract = null; S.threat = 'tense'; S.overclock.active = null;
    playerCombatant(true);
    refreshBoard();
    emit('succession', { gen: S.player.generation, name: heirName });
    return { ok: true };
  }

  // ---- save ------------------------------------------------------------------------------------
  function save(slot = 'main') { const r = saveStore.save(S, slot); emit('save', r); return r; }
  function autosave() { if (!game.noAutosave) save(); }

  // ---- UI snapshots ----------------------------------------------------------------------
  function hud() {
    const c = playerCombatant();
    const f = activeFrame();
    const step = currentStep();
    const m = S.contract?.mission;
    return {
      hp: Math.round(c.hp), hpMax: c.stats.hp, shield: Math.round(c.shield), shieldMax: c.stats.shield, energy: Math.round(c.energy), energyMax: c.stats.energy,
      level: S.player.level, xp: S.player.xp, xpMax: xpNext(S.player.level), credits: S.credits,
      frame: { name: f.name, kind: f.archetype, tier: f.tier, tierName: tierName(f) },
      heat: S.factions.heat, district: DISTRICTS[S.districts.current].name,
      mission: m ? { title: m.title, objective: step?.label || stepLabel(step), progress: S.contract.stepIndex / S.contract.steps.length, count: `${S.contract.stepIndex}/${S.contract.steps.length}`,
        timer: m.timeLimit ? Math.max(0, Math.round(m.timeLimit - S.contract.elapsed)) : null } : null,
      buffs: c.statuses.filter(s => s.t > 0).map(s => ({ id: s.id, icon: s.id, t: s.t, tMax: s.tMax || s.t, kind: s.dmgTakenMult > 1 || s.stun || s.dot ? 'debuff' : 'buff' })),
      surcharge: f.rental ? S.surchargeTotal : null, goal: nextGoal(S), renewalDays: S.story.renewalDays,
    };
  }
  function skillsHud() {
    const c = playerCombatant();
    return ['s1', 's2', 's3', 'heir'].filter(k => c.skills[k]).map((k, i) => {
      const s = c.skills[k];
      return { id: k, icon: s.icon, label: s.name, cd: c.cooldowns[s.id] || 0, cdMax: (s.cooldown || 1) * (1 - c.stats.cdr), ready: skillReady(c, s), cost: s.energy || 0, key: String(i + 1) };
    });
  }

  if (!S.board) refreshBoard();

  const game = {
    state: S, events, on: events.on, off: events.off, live,
    // queries
    activeFrame, frameByUid, itemByUid, ownedFrames, frameStats, frameSkills: skillsOf, frameFR, playerCombatant, lootQuality, currentThreat,
    board, storyCard, currentStep, hud, skillsHud, nextGoal: () => nextGoal(S), codex: () => codexView(S.story, { heirs: S.player.heirs }),
    features: () => featuresAt(S.player.level), threatsUnlocked, enemyStance, freeStash, validateMission,
    framePrice: () => framePrice(ownedFrames().length, { discount: S.flags.firstFrameDiscount }),
    // actions
    tick, refreshBoard, rerollBoard, acceptContract, completeStep, fireTwist, reportAlarm, reportCollateral, reportSpotted, finishContract, failContract, abandonContract, playerWrecked,
    spawnEnemy, hit, useSkill: useSkillFor, kill, addItem, lootPickup: items => items.map(i => addItem(i)).filter(Boolean),
    equip, unequip, equipBest, salvage, salvageAll, tune, recalibrate,
    buyFrame, swapFrame, returnRental, upgradeMk, chooseSyncMod, repair, payRental, payWardDebt,
    buyConsumable, useConsumable, cleanSlate, buyStash, refreshMarket, buyMarket, travel, setThreat, unlockDistrict,
    spendLegacy, succession, addCredits, giveXp, save,
    buyHome, setHome, buyPaint, setPaint, buyMaterial, brokerPrice,
    homes: () => Object.keys(HOMES).map(homeState), paintsList: () => PAINTS.map(p => paintState(p.id)),
    setSites(districtId, sites) { live.sitesRegistry[districtId] = sites; },
  };
  return game;
}

function stepLabel(s) {
  if (!s) return '';
  const map = { goto: 'Go to the marker', pickup: 'Pick it up', deliver: 'Deliver it', kill: 'Take out the target', destroy: 'Destroy the objectives', hack: 'Hack the terminals', photo: 'Get the photo',
    tail: 'Tail the target', escort: 'Escort them', defend: 'Hold the position', race: 'Hit the checkpoints', capture: 'Capture the target', exfil: 'Get out', choose: 'Decide', survive: 'Survive' };
  return map[s.type] || s.type;
}

export function loadGame(opts = {}) {
  const store = opts.store || createSaveStore();
  const r = store.load(opts.slot || 'main');
  if (!r.ok) return null;
  return createGame({ ...opts, state: r.state, store });
}
