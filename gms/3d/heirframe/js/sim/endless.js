// P6 endless helpers (ECONOMY §8, DESIGN §11.4): Heir Core ranks, heirlooms that grow with the heir, Voice Hunt cards.
import { L } from '../data/balance.js';
import { RARITIES, RARITY_INDEX, BASES, AFFIXES, HEIR_CORE } from '../data/loot.js';
import { primaryFor } from './stats.js';
import { VOICES, VOICE_HUNT } from '../data/voices.js';

export const HEIR_RANK_EVERY = 10;      // +1 Heir Core rank per 10 Legacy points earned (ever)
export const HEIR_RANK_PCT = 0.05;      // +5% Heir Protocol damage per rank
export const HANDED_DOWN_MAX = 5;       // an heirloom can be handed down this many times (+11 … +15)

export const heirRank = (legacyEver = 0) => Math.floor(legacyEver / HEIR_RANK_EVERY);
// the Heir Core's look steps up at ranks 5, 10 and 20
export const heirVisualTier = (rank) => (rank >= 20 ? 3 : rank >= 10 ? 2 : rank >= 5 ? 1 : 0);

// Re-level an item in place: the primary block and level-scaled affixes follow the new iLvl.
export function growItem(item, ilvl) {
  ilvl = Math.max(1, Math.round(ilvl));
  if (item.ilvl === ilvl) return false;
  const r = RARITIES[RARITY_INDEX[item.rarity]];
  const base = BASES[item.slot]?.find((b) => b.id === item.baseId);
  const k = L(ilvl) / L(item.ilvl);
  item.primary = primaryFor(item.slot, ilvl, item.heirCore ? HEIR_CORE.primaryMult : r.mult, base?.tilt);
  for (const a of item.affixes || []) if (AFFIXES.find((d) => d.id === a.id)?.scales) a.value = Math.max(1, Math.round(a.value * k));
  item.ilvl = ilvl;
  item.reqLevel = 1;
  return true;
}

// the next Voice to surface: the first one not caught this cycle, in a stable seeded order
export function nextVoice(vs, rng) {
  const left = VOICES.filter((v) => !vs.caught.includes(v.id));
  return left.length ? left[rng.int(0, left.length - 1)] : null;
}
export function huntDistrict(rng, unlocked, avoid) {
  const pool = VOICE_HUNT.districts.filter((d) => unlocked.includes(d) && d !== avoid);
  return pool.length ? pool[rng.int(0, pool.length - 1)] : unlocked[0];
}
export const voiceById = (id) => VOICES.find((v) => v.id === id) || null;
