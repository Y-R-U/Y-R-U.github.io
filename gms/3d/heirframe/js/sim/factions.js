// Reputation and Heat (DESIGN §9, §11.2).
import { FACTIONS, REP_TIERS, HOSTILITY, RIVALS, REP_RULES, HEAT } from '../data/factions.js';
import { clamp } from './util.js';

export function newFactionState() {
  const rep = {};
  for (const f of Object.values(FACTIONS)) if (!f.noRep) rep[f.id] = f.startRep || 0;
  return { rep, heat: 0, heatIdle: 0, wardenKillCd: 0, missionKillRep: {} };
}

export function repTier(value) {
  let t = REP_TIERS[0];
  for (const tier of REP_TIERS) if (value >= tier.min) t = tier;
  return t;
}

export const repPayMul = (fs, faction) => (FACTIONS[faction]?.noRep ? 1 : repTier(fs.rep[faction] ?? 0).payMul);

// Returns [{faction, delta, value, tier, tierChanged}]
export function adjustRep(fs, faction, delta, { rivals = true } = {}) {
  const out = [];
  const apply = (f, d) => {
    if (FACTIONS[f]?.noRep || !d) return;
    const before = fs.rep[f] ?? 0;
    const after = clamp(before + d, -100, 100);
    fs.rep[f] = Math.round(after * 10) / 10;
    const tb = repTier(before), ta = repTier(after);
    out.push({ faction: f, delta: Math.round((after - before) * 10) / 10, value: fs.rep[f], tier: ta.id, tierChanged: tb.id !== ta.id });
  };
  apply(faction, delta);
  if (rivals) for (const r of RIVALS[faction] || []) apply(r, -delta * REP_RULES.rivalShare);
  return out;
}

// Killing members of a faction: -0.5 each, capped at -5 per mission.
export function killRep(fs, faction) {
  if (FACTIONS[faction]?.noRep) return [];
  const used = fs.missionKillRep[faction] || 0;
  if (used <= REP_RULES.killCapPerMission) return [];
  fs.missionKillRep[faction] = used + REP_RULES.killEach;
  return adjustRep(fs, faction, REP_RULES.killEach, { rivals: false });
}

export function resetMissionRep(fs) { fs.missionKillRep = {}; }

// ctx: {onTurf (syndicate turf), missionHostile: Set/array of factions hostile for the active contract}
export function stance(fs, faction, ctx = {}) {
  const f = FACTIONS[faction];
  if (!f) return 'neutral';
  if (faction === 'civilians') return 'friendly';
  if (f.alwaysHostile) return 'hostile';
  const mh = ctx.missionHostile;
  if (mh && (mh.has ? mh.has(faction) : mh.includes(faction))) return 'hostile';
  const rule = HOSTILITY[faction];
  const rep = fs.rep[faction] ?? 0;
  if (rule) {
    if (rule.heatAtLeast != null && heatStars(fs) >= rule.heatAtLeast) return 'hostile';
    if (rule.repAtMost != null && rep <= rule.repAtMost && (!rule.onTurf || ctx.onTurf)) return 'hostile';
  }
  if (repTier(rep).min >= 25) return 'friendly';
  return f.stance === 'hostile' ? 'hostile' : 'neutral';
}

export const canHarm = faction => !FACTIONS[faction]?.invulnerable;

// ---- heat (0..5 stars, stored as a float so UI can show partial fills) ----------------------
// a star lasts until its whole bar has decayed (ceil): +1 Heat = 1★ for the full 3 minutes
export const heatStars = fs => Math.min(5, Math.ceil(fs.heat - 1e-6));

// reason: alarm | wardenKill | blackContract | collateral | spotted | {amount}
export function addHeat(fs, reason, amount) {
  if (reason === 'wardenKill') {
    if (fs.wardenKillCd > 0) return { stars: heatStars(fs), added: 0 };
    fs.wardenKillCd = HEAT.wardenKillCooldown;
  }
  const add = amount ?? HEAT.gains[reason] ?? 1;
  const before = heatStars(fs);
  fs.heat = clamp(fs.heat + add, 0, HEAT.maxStars);
  fs.heatIdle = 0;
  const stars = heatStars(fs);
  return { stars, added: add, changed: stars !== before, effect: stars > before ? HEAT.effects[stars] : null };
}

export function setHeat(fs, stars) { fs.heat = clamp(stars, 0, HEAT.maxStars); fs.heatIdle = 0; }

// -1 star per 3 min without incident. Returns {stars, changed}.
export function tickHeat(fs, dt) {
  if (fs.wardenKillCd > 0) fs.wardenKillCd = Math.max(0, fs.wardenKillCd - dt);
  if (fs.heat <= 0) return { stars: 0, changed: false };
  const before = heatStars(fs);
  fs.heatIdle += dt;
  fs.heat = Math.max(0, fs.heat - dt / HEAT.decaySeconds);
  const stars = heatStars(fs);
  return { stars, changed: stars !== before };
}

export const heatEffects = fs => {
  const s = heatStars(fs);
  return {
    stars: s, wardensWatch: s >= 1, wardensHostile: s >= 2, huntPatrols: s >= 3, blackContracts: s >= 3,
    lancers: s >= 4, relaysLocked: s >= 4, choirSquads: s >= 5, rewardMult: s >= 5 ? HEAT.rewardMultAt5 : 1,
  };
};

export { FACTIONS, REP_TIERS };
