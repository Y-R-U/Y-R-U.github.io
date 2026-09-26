// Converters from sim objects to the shapes js/ui/README.md expects.
import { RARITIES, RARITY_INDEX, SLOTS, SLOT_NAMES, POWERS, HEIRLOOM_SETS } from '../data/loot.js';
import { MODIFIERS } from '../data/missions.js';
import { itemFR, affixLabel, tuneCost } from './loot.js';
import { itemStats } from './stats.js';
import { xpNext, rerollCost } from './economy.js';
import { frameDef, tierName } from './frames.js';

export function uiConfig() {
  return {
    rarities: RARITIES.map(r => ({ id: r.id, name: r.name, color: r.color })),
    slots: SLOTS.slice(),
    statLabels: {
      hp: 'HP', shield: 'Shield', armor: 'Armor', energy: 'Energy', weaponDamage: 'Weapon Damage', critChance: 'Crit Chance', movePct: 'Move Speed',
      dmgPct: 'Damage', atkSpdPct: 'Attack Speed', critDmg: 'Crit Damage', cdr: 'Cooldowns', lootLuck: 'Loot Luck', creditsPct: 'Credits', power: 'FR',
    },
  };
}

export function toUiItem(item, { compareTo } = {}) {
  if (!item) return null;
  const stats = { power: itemFR(item) };
  for (const [k, v] of Object.entries(item.primary || {})) stats[k] = v;
  const tc = tuneCost(item);
  const flavor = item.lore || (item.powers?.length ? POWERS.find(p => p.id === item.powers[0])?.desc : undefined);
  return {
    id: item.uid, name: item.tune ? `${item.name} +${item.tune}` : item.name, rarity: RARITY_INDEX[item.rarity], rarityId: item.rarity,
    slot: item.slot, slotName: SLOT_NAMES[item.slot], level: item.ilvl, reqLevel: item.reqLevel, icon: item.slot, element: item.element || null,
    stats, allStats: itemStats(item), affixes: (item.affixes || []).map(affixLabel),
    power: item.powers?.length ? POWERS.find(p => p.id === item.powers[0]) : null,
    set: item.set ? { id: item.set, name: HEIRLOOM_SETS[item.set].name, bonuses: HEIRLOOM_SETS[item.set].bonuses } : null,
    value: stats.power, upgrade: { level: item.tune || 0, max: 10 + (item.maxTuneBonus || 0), cost: tc ? tc.credits : null, chance: tc?.chance ?? null, mats: tc?.mats },
    flavor, isUpgrade: !!item.upgrade, equippedOn: item.equippedOn || null, new: !!item.new, locked: !!item.locked,
    delta: compareTo ? stats.power - itemFR(compareTo) : undefined,
  };
}

const MOD_KIND = { bad: 'bad', good: 'good', neutral: 'neutral' };

export function toUiContract(m) {
  return {
    id: m.id, title: m.title, type: m.story ? 'story' : m.type, archetype: m.archetype, grade: m.grade,
    client: { name: m.client.name, org: m.client.org, portrait: m.client.portrait },
    location: m.steps.find(s => s.site)?.site || '', district: m.districtName || m.district, difficulty: m.difficulty, level: m.level,
    payout: m.payout.credits, xp: m.payout.xp, bonus: m.badge || null, timeLimit: m.timeLimit,
    modifiers: m.modifiers.map(id => ({ label: MODIFIERS[id].label, kind: MOD_KIND[MODIFIERS[id].kind] || 'neutral', desc: MODIFIERS[id].desc })),
    desc: m.blurb, story: !!m.story, target: m.target ? `${m.target.name}${m.target.epithet ? ' ' + m.target.epithet : ''}` : null,
  };
}

export function toUiBoard(game) {
  const b = game.board();
  const cards = b.cards.map(toUiContract);
  if (b.story && !game.state.contract) cards.unshift(toUiContract(b.story));
  return { contracts: cards, rerollCost: rerollCost(game.state.player.level), threat: game.currentThreat(), threats: game.threatsUnlocked() };
}

export function toUiWarehouse(game) {
  const S = game.state;
  const frames = S.frames.map(f => {
    const st = game.frameStats(f);
    const d = frameDef(f);
    const slots = {};
    for (const s of SLOTS) slots[s] = d.slots.includes(s) ? toUiItem(f.equipped[s] ? game.itemByUid(f.equipped[s]) : null) : undefined;
    return {
      id: f.uid, frameId: f.frameId, name: f.name, model: d.model, kind: f.archetype, tier: f.tier, tierName: tierName(f), level: S.player.level, sync: f.sync,
      rental: !!f.rental, fr: game.frameFR(f), hpFrac: f.hpFrac, paint: f.paint,
      stats: { hp: st.hp, shield: st.shield, armor: st.armor, energy: st.energy, weaponDamage: st.weaponDamage, critChance: st.critChance, critDmg: st.critDmg, moveSpeed: st.moveSpeed, dodgeCd: st.dodgeCd },
      slots,
    };
  });
  return {
    credits: S.credits, active: S.activeFrame, bays: 3, framePrice: game.framePrice(), frames,
    inventory: S.stash.filter(i => !i.equippedOn).map(i => toUiItem(i)), materials: { ...S.materials }, stashSize: S.stashSize,
    owned: frames.filter(f => !f.rental).map(f => f.kind),
  };
}

export function toUiComplete(out, game) {
  const S = game.state;
  const bonusPct = out.bonuses.reduce((a, b) => a + b.pct, 0);
  return {
    title: out.mission.title, grade: out.grade, credits: out.credits, bonus: Math.round(bonusPct * 100), xp: out.xp,
    xpMax: xpNext(S.player.level), xpFrom: S.player.xp, level: out.levelTo, levelUp: out.levelTo > out.levelFrom,
    items: out.items.map(i => toUiItem(i)), surcharge: out.surcharge || 0,
    stats: [...out.bonuses.map(b => ({ label: b.id[0].toUpperCase() + b.id.slice(1), value: `+${Math.round(b.pct * 100)}%` })), ...(out.surcharge ? [{ label: 'HireFrame surcharge', value: `-${out.surcharge} cr` }] : [])],
  };
}
