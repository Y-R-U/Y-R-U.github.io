// The single top-level game state + actions. Pure (no DOM/three). Emits events for UI/engine.
// The real-time runtime (movement, AI, step runner) lives in js/game/* and calls these actions.
import { createRng, rngFor } from './rng.js';
import { createEmitter, deepClone, clamp } from './util.js';
import { computeStats, makeCombatant, restat, resolveHit, tickCombatant, useSkill, skillReady, heal, addStatus } from './stats.js';
import { newFrame, frameDef, frameSkills, chooseMod, maxSync, tierName, canEquipItem } from './frames.js';
import { rollItem, rollKillLoot, rollCache, itemFR, salvageYield, tuneCost, applyTune, recalibrateCost, applyRecalibrate, marketStock, makeHeirCore, rollHeirloom, newLootState, RARITY_INDEX } from './loot.js';
import { xpNext, addXp, addSyncXp, framePrice, mkUpgrade, repairCost, wreckCost, rerollCost, consumableCost, cleanSlateCost, nextStash, legacyStats, nextGoal, featuresAt, newFeatures, SHIFT_SECONDS, RENTAL_FEE, LEGACY_XP } from './economy.js';
import { createEnemy } from './enemies.js';
import { L } from '../data/balance.js';
import { newFactionState, adjustRep, killRep, resetMissionRep, stance, addHeat, setHeat, tickHeat, heatStars, heatEffects, repPayMul, canHarm, repTier } from './factions.js';
import { generateBoard, generateContract, completionRewards, threatDef, validateMission, missionPayout } from './missions.js';
import { newStoryState, storyReady, completeStory, tickRenewal, rollEcho, echoAvailable, buildStoryMission, storyFlags, storyCacheItem, codexView } from './story.js';
import { createSaveStore, SAVE_VERSION } from './save.js';
import { OWNABLE_FRAMES, MK_TIERS } from '../data/frames.js';
import { POWERS, HEIRLOOM_SETS } from '../data/loot.js';
import { DISTRICTS, DISTRICT_ORDER } from '../data/districts.js';
import { THREATS } from '../data/missions.js';
import { STASH_SIZES, CONSUMABLES, COSTS, DEBT_FREE_PERK, SUCCESSION, LEGACY_NODES, WARRANTY_SURCHARGE, HOMES, PAINTS, MATERIAL_BROKER } from '../data/economy.js';
import { HEAT } from '../data/factions.js';
import { MATERIALS } from '../data/loot.js';
import { heirRank, HEIR_RANK_PCT, HANDED_DOWN_MAX, growItem, nextVoice, huntDistrict, voiceById } from './endless.js';
import { VOICE_HUNT } from '../data/voices.js';

export function newState(seed = 1, { name = 'Wren' } = {}) {
  const st = {
    v: SAVE_VERSION, seed: String(seed), created: 0, playSeconds: 0, shiftIndex: 0, shiftClock: 0, actCounter: 0,
    player: { name, level: 1, xp: 0, legacyXp: 0, legacyPoints: 0, legacyBoard: {}, legacyEver: 0, legacyGen: 0, generation: 1, heirs: [] },
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
    voices: { open: false, caught: [], hunt: null, cycle: 0, lastShift: 0, relics: [] },
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
    const hr = heirRank(S.player.legacyEver);
    if (hr) ex.push({ heirPct: hr * HEIR_RANK_PCT });
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

  // ---- vendor pricing by reputation (DESIGN §9: Nexus −2% per tier above Neutral; Concord Friendly = cheap repairs) --
  const VENDOR_MUL = { hated: 1.1, hostile: 1.05, wary: 1, neutral: 1, friendly: 0.98, trusted: 0.96, honored: 0.94 };
  const vendorMul = (faction = 'nexus') => VENDOR_MUL[repTier(S.factions.rep[faction] ?? 0).id] ?? 1;
  const nexusPrice = (p) => (p == null ? p : Math.round(p * vendorMul('nexus')));
  const repairMul = () => (repTier(S.factions.rep.concord ?? 0).min >= 25 ? 0.75 : 1);

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
      growItems();
      restatPlayer({ heal: true });
      for (const lvl of res.levels) emit('levelUp', { level: lvl, features: newFeatures(lvl - 1, lvl) });
      if (newFeatures(before, S.player.level).some(x => x.id === 'brightline')) unlockDistrict('brightline');
      if (S.player.level >= 60 && !S.overclock.unlocked) { S.overclock.unlocked = 1; emit('overclock:unlock', { n: 1 }); }
    } else if (syncUps.length) restatPlayer();
    if (res.legacy) {
      S.player.legacyEver = (S.player.legacyEver || 0) + res.legacy;
      S.player.legacyGen = (S.player.legacyGen || 0) + res.legacy;
      const hr = heirRank(S.player.legacyEver);
      if (hr > heirRank(S.player.legacyEver - res.legacy)) { restatPlayer(); emit('heir:rank', { rank: hr }); }
      emit('legacy', { points: S.player.legacyPoints, gained: res.legacy, gen: S.player.legacyGen });
    }
    return xp;
  }
  // the Heir Core and handed-down heirlooms level with their rider (never down, except at a Succession)
  function growItems() {
    for (const it of S.stash) {
      if (it.grows) { if (it.ilvl < S.player.level + 2) growItem(it, S.player.level + 2); }
      else if ((it.heirCore || it.rarity === 'heirloom') && it.ilvl < S.player.level) growItem(it, S.player.level);
    }
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
      if (cur?.heirCore) continue;   // the Heir Core carries the 4th skill: auto-equip never swaps it out
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
    const price = nexusPrice(framePrice(owned, { discount: S.flags.firstFrameDiscount }));
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
    const cost = f.rental ? 0 : Math.round(repairCost(missing, S.player.level, frameStats(f).repairCostPct) * repairMul());
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
    if (!spend(nexusPrice(consumableCost(id, S.player.level)), id)) return { ok: false, reason: 'credits' };
    S.consumables[id] = (S.consumables[id] || 0) + 1;
    return { ok: true, count: S.consumables[id] };
  }
  // found in the world (a vending machine jackpot): free, up to the carry cap
  function grantConsumable(id, n = 1) {
    if (!(id in S.consumables) || S.consumables[id] >= carryCap(id)) return { ok: false, reason: 'full' };
    S.consumables[id] = Math.min(carryCap(id), S.consumables[id] + n);
    emit('consumable', { id, left: S.consumables[id] });
    return { ok: true };
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
    if (!spend(nexusPrice(e.price), 'market')) return { ok: false, reason: 'credits', need: nexusPrice(e.price) };
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
      repMul: f => repPayMul(S.factions, f), creditsPct: frameStats().creditsPct, archetypes: live.archetypes || null, twists: live.twists || null, ...extra,
    };
  }
  function storyCard() {
    const def = storyReady(S.story, S.player.level);
    if (!def || def.act > (live.storyActCap ?? Infinity)) return null;
    return buildStoryMission(def.id, boardCtx());
  }
  // ---- Crackdown (DESIGN §11.3): danger ≥ 8 → the district's controlling faction sweeps it for 2 shifts and posts a
  // bounty board of 3 champion targets
  function crackdownCards() {
    const cd = S.districts.crackdown;
    if (!cd) return [];
    const ctx = boardCtx({ contractsDone: 99 });
    const out = [];
    for (let i = 0; i < 3; i++) {
      const m = generateContract(rngFor(S.seed, 'crackdown', cd.id, cd.start, i), ctx, { grade: 'elite', archetype: 'bounty', district: cd.id, noTwist: true, slot: 20 + i });
      if (!m || !m.target) continue;
      m.id = `cd_${cd.start}_${i}`; m.target.rank = 'champion'; m.badge = 'Crackdown';
      m.title = `Crackdown: ${m.target.name}`;
      m.payout = { ...m.payout, credits: Math.round(m.payout.credits * 1.5) };
      out.push(m);
    }
    return out;
  }
  function checkCrackdown(id) {
    if (S.districts.crackdown || (S.districts.danger[id] ?? 0) < 8) return;
    S.districts.crackdown = { id, shifts: 2, start: S.shiftIndex };
    emit('crackdown', { id, name: DISTRICTS[id].name, on: true });
    if (S.board) S.board.cards.unshift(...crackdownCards());
  }

  function refreshBoard({ reroll = 0 } = {}) {
    S.board = generateBoard({ ...boardCtx(), reroll, storyCard: storyCard() });
    if (S.districts.crackdown) S.board.cards.unshift(...crackdownCards().filter((c) => !S.districts.crackdown.done?.includes(c.id)));
    const vc = voiceCard();
    if (vc) S.board.cards.unshift(vc);
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

  // tests: put a specific contract on the board ({archetype, grade, twist, modifiers, seed}) → mission or null
  function makeContract({ archetype, grade = 'street', twist = null, modifiers = null, seed = 1 } = {}) {
    const ctx = boardCtx({ contractsDone: 99 });
    const m = generateContract(createRng(`${S.seed}|debug|${seed}`), ctx, { grade, archetype, district: S.districts.current, forceTwist: twist, noTwist: !twist, slot: 9 });
    if (!m) return null;
    if (twist && (!m.twist || m.twist.id !== twist)) return null;
    if (modifiers) { m.modifiers = modifiers.slice(); m.timeLimit = modifiers.includes('timed') ? Math.round(m.parTime * 1.3) : null; m.payout = missionPayout(m, ctx); }
    board().cards.unshift(m);
    return m;
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
  // story beats that set Heat mid-mission (A1-M5's Warden swarm)
  function forceHeat(stars) { setHeat(S.factions, Math.max(S.factions.heat, stars)); emit('heat', { stars: heatStars(S.factions), changed: true }); return { ok: true }; }
  // A1-M4: Mara's dealer discount lands when the mission is taken, so the frame can be bought before the fight
  function grantFrameDiscount() { if (ownedFrames().length) return { ok: false }; S.flags.firstFrameDiscount = true; return { ok: true, price: framePrice(0, { discount: true }) }; }
  function reportSpotted() {
    if (S.contract?.mission.modifiers.includes('watched')) emit('heat', addHeat(S.factions, 'spotted'));
  }

  // A5-M2's Heir Core installs itself: the active frame's core slot (or the first owned frame with one). Also used by
  // story jumps (dev checkpoints, autopilot storyat) that skip finishContract.
  function installHeirCore(level = S.player.level) {
    if (S.stash.some(i => i.heirCore)) return null;
    const hc = addItem(makeHeirCore(actRng('heircore'), level), { silent: true });
    const f = [activeFrame(), ...ownedFrames()].find(x => x && frameDef(x).slots.includes('core'));
    if (hc && f) equip(hc.uid, f.uid);
    return hc;
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
    // the first Pro/Elite clear from level 15 always carries a Relic (ECONOMY §9: first Relic at 3–5 h)
    const firstRelic = !m.cacheItem && m.grade !== 'street' && !S.loot.relicsFound && S.player.level >= 15;
    const cacheItem = m.cacheItem ? storyCacheItem(m.cacheItem, rng, m.level) : firstRelic ? rollItem(rng, { ilvl: Math.min(m.level, S.player.level + 2), rarity: 'relic', q: lootQuality(), lootState: S.loot }) : rollCache(rng, m.grade, { level: m.level, riderLevel: S.player.level, q: lootQuality(), rental: onRental(), lootState: S.loot, overclock: S.overclock.active });
    if (cacheItem) { const it = addItem(cacheItem, { silent: true }); if (it) out.items.push(it); }
    if (rw.stiffed && S.board) {
      const collect = deepClone(m);
      collect.id = m.id + '_collect'; collect.title = `Collect from ${m.client.name}`; collect.twist = null; collect.archetype = 'bounty';
      collect.payout = { ...collect.payout, credits: Math.round(m.payout.credits * m.twist.collectPay) };
      S.board.cards.unshift(collect);
    }
    if (m.story) {
      const fx = completeStory(S.story, m.story.id, { choice: c.choices[m.story.choice], choices: c.choices });
      out.story = fx;
      if (fx) {
        for (const d of fx.unlocks) unlockDistrict(d);
        if (fx.grants.firstFrameDiscount) S.flags.firstFrameDiscount = true;
        if (fx.grants.heirCore) { const hc = installHeirCore(m.level); if (hc) out.items.push(hc); }
        if (fx.grants.heirloom) {
          const af = activeFrame().rental ? ownedFrames()[0] : activeFrame();
          const set = fx.grants.heirloom === 'frame' ? Object.values(HEIRLOOM_SETS).find(x => x.frame === af?.archetype)?.id : fx.grants.heirloom;
          const hl = addItem(rollHeirloom(actRng('heirloom:' + m.story.id), { ilvl: m.level, q: lootQuality(), lootState: S.loot, set }), { silent: true });
          if (hl) out.items.push(hl);
        }
        if (fx.grants.home) S.home = fx.grants.home;
        if (fx.setHeat != null) emit('heat', (setHeat(S.factions, fx.setHeat ? Math.max(S.factions.heat, fx.setHeat) : 0), { stars: heatStars(S.factions) }));
        if (m.story.id === 'a1_m1') S.flags.boardUnlocked = true;
        if (S.story.flags.includes('finale')) openVoiceHunts();
        emit('story', fx);
      }
    } else {
      tickRenewal(S.story);
      const echo = rollEcho(actRng('echo'), S.story, m.district);
      if (echo) { out.clue = echo; emit('clue', { id: echo }); }
      if (m.faction && m.archetype !== 'pest' && DISTRICTS[m.district]) { S.districts.danger[m.district] = Math.min(10, (S.districts.danger[m.district] ?? DISTRICTS[m.district].danger) + 0.3); checkCrackdown(m.district); }
      if (m.badge === 'Crackdown' && S.districts.crackdown) (S.districts.crackdown.done ||= []).push(m.id);
    }
    if (m.voiceHunt) voiceCaught(m, out);
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
    // a wreck drops Heat a star: otherwise a 3★ rider who fights back (+½★ per Warden) is hunted and wrecked on a
    // loop, with the relays locked at 4★ and every contract failing (P7 soak stall)
    let heatDrop = false;
    if (S.factions.heat > 0) {
      setHeat(S.factions, Math.max(0, heatStars(S.factions) - 1)); heatDrop = true;
      emit('heat', { stars: heatStars(S.factions), changed: true, wreck: true });
    }
    emit('wreck', { cost, checkpoint: !!cp, heatDrop });
    if (S.contract && !cp) failContract('wrecked');
    return { cost, checkpoint: !!cp, heatDrop };
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
    // story fights set their own Heat (A1-M5); killing a story mission's Wardens doesn't stack more on top
    if (enemy.faction === 'concord' && enemy.tags.includes('frame') && !S.contract?.mission.story) emit('heat', addHeat(S.factions, 'wardenKill'));   // Warden Eyes are drones, not Wardens
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
      if (S.rentalDebt && S.credits > 0) payRental();
      emit('rental:fee', { fee, debt: S.rentalDebt });
    }
    const cd = S.districts.crackdown;
    if (cd && --cd.shifts <= 0) { S.districts.crackdown = null; emit('crackdown', { id: cd.id, name: DISTRICTS[cd.id].name, on: false }); }
    for (const id of S.districts.unlocked) {
      if (!DISTRICTS[id]) continue;
      const floor = DISTRICTS[id].danger;
      const cur = S.districts.danger[id] ?? floor;
      S.districts.danger[id] = Math.max(floor, cur - 0.5);
    }
    voiceShift();
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
  // ECONOMY §8: Pass the Frame once this heir has earned Legacy 20 (a new heir must earn their own 20)
  function successionState() {
    const gen = S.player.legacyGen || 0;
    const heirlooms = S.stash.filter((i) => i.rarity === 'heirloom' && !i.heirCore && (i.handedDown || 0) < HANDED_DOWN_MAX);
    return { ok: S.player.level >= 60 && gen >= SUCCESSION.minLegacy, legacyGen: gen, need: SUCCESSION.minLegacy, generation: S.player.generation,
      nextGen: S.player.generation + 1, creditCap: SUCCESSION.creditCap, duty: Math.max(0, S.credits - SUCCESSION.creditCap),
      xpBonus: SUCCESSION.xpPerGen * Math.min(S.player.generation, SUCCESSION.maxGen), lootBonus: SUCCESSION.lootPerGen * Math.min(S.player.generation, SUCCESSION.maxGen),
      heirlooms: heirlooms.map((i) => ({ uid: i.uid, name: i.name, slot: i.slot, tune: i.tune || 0, handedDown: i.handedDown || 0 })) };
  }
  function succession(heirName, heirloomUid) {
    const st = successionState();
    if (!st.ok) return { ok: false, reason: S.player.level < 60 ? 'level' : 'legacy', need: SUCCESSION.minLegacy, have: st.legacyGen };
    if (S.contract) return { ok: false, reason: 'contract' };
    const name = String(heirName || '').trim().slice(0, 18) || `Heir ${S.player.generation + 1}`;
    const hl = heirloomUid ? itemByUid(heirloomUid) : null;
    if (hl && hl.rarity === 'heirloom' && !hl.heirCore && (hl.handedDown || 0) < HANDED_DOWN_MAX) {
      hl.handedDown = (hl.handedDown || 0) + 1;
      hl.maxTuneBonus = hl.handedDown;
      hl.grows = true;
      hl.lore = `Handed down ×${hl.handedDown}. ${hl.lore || ''}`.trim();
    }
    const from = { name: S.player.name, gen: S.player.generation, level: S.player.level, legacy: S.player.legacyEver };
    S.player.heirs.push({ name, gen: S.player.generation + 1, from: from.name, shift: S.shiftIndex, heirloom: hl?.name || null });
    S.player.generation++;
    S.player.name = name; S.player.level = 1; S.player.xp = 0; S.player.legacyXp = 0; S.player.legacyGen = 0;
    for (const f of S.frames) { f.sync = 1; f.syncXp = 0; f.hpFrac = 1; f.wrecked = false; }
    // gear the heir can't wear waits in the stash; the Heir Core and the handed-down pieces re-level to the heir
    for (const f of S.frames) for (const [slot, uid] of Object.entries(f.equipped)) {
      const it = uid && itemByUid(uid);
      if (!it) continue;
      if (it.heirCore) growItem(it, 1);
      else if (it.grows) growItem(it, 3);
      else { it.equippedOn = null; f.equipped[slot] = null; }
    }
    for (const it of S.stash) { if (it.heirCore) growItem(it, 1); else if (it.grows) growItem(it, 3); }
    const duty = Math.max(0, S.credits - SUCCESSION.creditCap);
    S.credits = Math.min(S.credits, SUCCESSION.creditCap);
    S.factions.heat = 0; S.districts.danger = {}; S.districts.crackdown = null;
    S.districts.unlocked = ['aurum_plaza']; S.districts.current = 'aurum_plaza';
    const codexClues = S.story.clues.slice(), ending = S.story.choices?.ending;
    S.story = newStoryState(); S.story.clues = codexClues; S.story.echo = true; S.story.echoOf = ending || null;
    S.contract = null; S.threat = 'tense'; S.overclock.active = null;
    if (S.voices) S.voices.hunt = null;
    S.flags.firstFrameDiscount = false;
    for (const f of S.frames) { if (!f.rental) equipBest(f.uid); }
    playerCombatant(true);
    refreshBoard();
    emit('succession', { gen: S.player.generation, name, from, duty, heirloom: hl?.name || null });
    autosave();
    return { ok: true, gen: S.player.generation, name, duty };
  }

  // ---- Voice Hunts (DESIGN §11.4) ---------------------------------------------------------
  function openVoiceHunts() {
    const V = S.voices ||= { open: false, caught: [], hunt: null, cycle: 0, lastShift: 0, relics: [] };
    if (V.open) return;
    V.open = true;
    startHunt();
  }
  function startHunt() {
    const V = S.voices;
    if (!V?.open || V.hunt) return null;
    if (V.caught.length >= 5) { V.caught = []; V.cycle++; }
    const rng = rngFor(S.seed, 'voice', V.cycle, V.caught.length, S.shiftIndex);
    const v = nextVoice(V, rng);
    if (!v) return null;
    V.hunt = { id: v.id, district: huntDistrict(rng, S.districts.unlocked, null), since: S.shiftIndex, n: 0 };
    emit('voice:hunt', { id: v.id, name: v.name, district: V.hunt.district, districtName: DISTRICTS[V.hunt.district]?.name });
    const vc = S.board && voiceCard();
    if (vc) S.board.cards.unshift(vc);
    return V.hunt;
  }
  function voiceCard() {
    const h = S.voices?.hunt;
    if (!h || !S.districts.unlocked.includes(h.district)) return null;
    const v = voiceById(h.id);
    const ctx = boardCtx({ contractsDone: 99 });
    const m = generateContract(rngFor(S.seed, 'voicecard', h.id, h.since, h.n), ctx, { grade: 'elite', archetype: 'bounty', district: h.district, noTwist: true, slot: 30 });
    if (!m || !m.target) return null;
    m.id = `vh_${h.id}_${h.since}_${h.n}`;
    // a Voice levels to its hunter (+1, +2 per full cycle) and keeps a small gilded court, not the district's packs
    m.level = S.player.level + 1 + S.voices.cycle * VOICE_HUNT.cycleLevel;
    m.faction = 'voices';
    m.target = { ...m.target, defId: 'voice', rank: 'boss', faction: 'voices', name: v.name, epithet: v.epithet, voice: v.id, paint: v.paint };
    const kill = m.steps.findIndex((st) => st.type === 'kill');
    const u = (defId, rank) => ({ defId, rank, level: m.level });
    m.enemies = [{ pack: 'gilded_court', faction: 'voices', atStep: Math.max(0, kill), site: m.target.site, units: [u('gilded_guard', 'veteran'), u('gilded_guard', 'grunt'), u('halo_drone', 'grunt'), u('halo_drone', 'grunt')] }];
    m.voiceHunt = v.id; m.badge = 'Voice Hunt'; m.modifiers = []; m.timeLimit = null; m.checkpoints = true;
    m.title = `Voice Hunt: ${v.name}`;
    m.blurb = `${v.name}, ${v.epithet}, fled the Helm and hides in ${DISTRICTS[h.district].name}. Find it before it moves on.`;
    m.payout = { ...m.payout, credits: Math.round(m.payout.credits * VOICE_HUNT.pay), xp: Math.round(m.payout.xp * 2) };
    m.relic = POWERS.find((p) => p.voice === v.id)?.name;
    return m;
  }
  function voiceCaught(m, out) {
    const V = S.voices;
    if (!V || !m.voiceHunt) return;
    if (!V.caught.includes(m.voiceHunt)) V.caught.push(m.voiceHunt);
    const pw = POWERS.find((p) => p.voice === m.voiceHunt);
    const relic = rollItem(actRng('voice:' + m.voiceHunt), { ilvl: m.level, rarity: 'relic', power: pw.id, q: lootQuality(), lootState: S.loot });
    const it = addItem(relic, { silent: true });
    if (it) out.items.push(it);
    V.relics = [...new Set([...(V.relics || []), pw.id])];
    V.hunt = null; V.lastShift = S.shiftIndex;
    out.voice = { id: m.voiceHunt, relic: it?.name, left: 5 - V.caught.length };
    emit('voice:caught', { id: m.voiceHunt, name: voiceById(m.voiceHunt)?.name, relic: it?.name, left: 5 - V.caught.length });
  }
  function voiceShift() {
    const V = S.voices;
    if (!V?.open) return;
    if (!V.hunt) { if (S.shiftIndex - (V.lastShift || 0) >= VOICE_HUNT.everyShifts) startHunt(); return; }
    if (S.shiftIndex - V.hunt.since >= VOICE_HUNT.moveShifts * (V.hunt.n + 1)) {
      V.hunt.n++;
      V.hunt.district = huntDistrict(rngFor(S.seed, 'voicemove', V.hunt.id, V.hunt.n), S.districts.unlocked, V.hunt.district);
      emit('voice:moved', { id: V.hunt.id, name: voiceById(V.hunt.id)?.name, district: V.hunt.district, districtName: DISTRICTS[V.hunt.district]?.name });
    }
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

  if (S.story.flags.includes('finale') && !S.voices?.open) openVoiceHunts();
  if (!S.board) refreshBoard();

  const game = {
    state: S, events, on: events.on, off: events.off, live,
    // queries
    activeFrame, frameByUid, itemByUid, ownedFrames, frameStats, frameSkills: skillsOf, frameFR, playerCombatant, lootQuality, currentThreat,
    board, storyCard, currentStep, hud, skillsHud, nextGoal: () => nextGoal(S), codex: () => codexView(S.story, { heirs: S.player.heirs }),
    features: () => featuresAt(S.player.level), threatsUnlocked, enemyStance, freeStash, validateMission,
    framePrice: () => nexusPrice(framePrice(ownedFrames().length, { discount: S.flags.firstFrameDiscount })),
    vendorMul, nexusPrice, repairMul,
    standing: () => Object.entries(S.factions.rep).map(([id, v]) => ({ id, value: v, tier: repTier(v) })),
    // actions
    // runtime scope: which archetypes/twists the engine can run (null = all)
    setScope({ archetypes = null, twists = null } = {}) { live.archetypes = archetypes; live.twists = twists; },
    makeContract,
    get storyActCap() { return live.storyActCap ?? Infinity; }, set storyActCap(v) { live.storyActCap = v; }, forceHeat, grantFrameDiscount,
    tick, refreshBoard, rerollBoard, acceptContract, completeStep, fireTwist, reportAlarm, reportCollateral, reportSpotted, finishContract, failContract, abandonContract, playerWrecked,
    spawnEnemy, hit, useSkill: useSkillFor, kill, addItem, lootPickup: items => items.map(i => addItem(i)).filter(Boolean),
    equip, unequip, equipBest, salvage, salvageAll, tune, recalibrate,
    buyFrame, swapFrame, returnRental, upgradeMk, chooseSyncMod, repair, payRental, payWardDebt,
    buyConsumable, useConsumable, grantConsumable, cleanSlate, buyStash, refreshMarket, buyMarket, travel, setThreat, unlockDistrict,
    spendLegacy, succession, successionState, legacyTotal, openVoiceHunts, startHunt, addCredits, giveXp, save,
    heirRank: () => heirRank(S.player.legacyEver),
    buyHome, setHome, buyPaint, setPaint, buyMaterial, brokerPrice,
    homes: () => Object.keys(HOMES).map(homeState), paintsList: () => PAINTS.map(p => paintState(p.id)),
    setSites(districtId, sites) { live.sitesRegistry[districtId] = sites; },
    checkCrackdown, installHeirCore,
  };
  return game;
}

function stepLabel(s) {
  if (!s) return '';
  const map = { goto: 'Go to the marker', pickup: 'Pick it up', deliver: 'Deliver it', kill: 'Take out the target', destroy: 'Destroy the objectives', hack: 'Hack the terminals', photo: 'Get the photo',
    tail: 'Tail the target', escort: 'Escort them', defend: 'Hold the position', race: 'Hit the checkpoints', capture: 'Capture the target', exfil: 'Get out', choose: 'Decide', survive: 'Survive', snap: 'Photograph the boards' };
  return map[s.type] || s.type;
}

export function loadGame(opts = {}) {
  const store = opts.store || createSaveStore();
  const r = store.load(opts.slot || 'main');
  if (!r.ok) return null;
  return createGame({ ...opts, state: r.state, store });
}
