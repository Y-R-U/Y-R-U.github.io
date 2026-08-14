// Standing, bands, and the Graft suspicion model. SYSTEMS.md §8.

export const FACTIONS = ['light', 'neutral', 'dark'];
export const OPPOSED = { light: 'dark', dark: 'light', neutral: null };

export const STANDING = {
  min: -100, max: 100,
  quest: 8,
  vermin: 0.5, verminCap: 6,
  sellPer100: 0.2, sellCap: 4,
  attackCitizen: -15,
  killCitizen: -40,
  graftBreak: -25,
  bleed: 0.4,
  campaignEntryClamp: -20,
};

export const BANDS = [
  { id: 'hostile', from: -100, to: -40, priceMul: null, vendors: false, ferry: false },
  { id: 'watched', from: -40, to: -10, priceMul: 1.25, vendors: false, ferry: true },
  { id: 'plain',   from: -10, to: 20,  priceMul: 1.00, vendors: true,  ferry: true },
  { id: 'trusted', from: 20,  to: 60,  priceMul: 0.90, vendors: true,  ferry: true, gates: true },
  { id: 'sworn',   from: 60,  to: 101, priceMul: 0.90, vendors: true,  ferry: true, gates: true, capstone: true },
];

export function band(value) {
  for (const b of BANDS) if (value >= b.from && value < b.to) return b.id;
  return value < -40 ? 'hostile' : 'sworn';
}

export const bandOf = value => BANDS.find(b => b.id === band(value));

export const newStanding = (day = 0) => ({
  day, light: 0, neutral: 0, dark: 0,
  caps: { light: { vermin: 0, sell: 0 }, neutral: { vermin: 0, sell: 0 }, dark: { vermin: 0, sell: 0 } },
});

const clamp = v => Math.max(STANDING.min, Math.min(STANDING.max, v));

export function rollStandingDay(st, day) {
  if (day <= st.day) return st;
  return { ...st, day, caps: newStanding(day).caps };
}

// Returns a new state; never mutates. `amount` is only read by the sell and vermin actions.
// The save document's `standing` is the flat `{light, neutral, dark}` map with the daily caps kept
// in `daily.standing`, so the caps block is filled in rather than required.
export function applyStanding(st, action, { faction, amount = 0 } = {}) {
  const caps = st.caps || newStanding().caps;
  const next = { ...st, caps: { ...caps, [faction]: { ...caps[faction] } } };
  let delta = 0;
  switch (action) {
    case 'quest': delta = STANDING.quest; break;
    case 'vermin': {
      const room = Math.max(0, STANDING.verminCap - next.caps[faction].vermin);
      delta = Math.min(room, STANDING.vermin * (amount || 1));
      next.caps[faction].vermin += delta;
      break;
    }
    case 'sell': {
      const room = Math.max(0, STANDING.sellCap - next.caps[faction].sell);
      delta = Math.min(room, STANDING.sellPer100 * amount / 100);
      next.caps[faction].sell += delta;
      break;
    }
    case 'attackCitizen': delta = STANDING.attackCitizen; break;
    case 'killCitizen': delta = STANDING.killCitizen; break;
    case 'graftBreak': delta = STANDING.graftBreak; break;
    default: return st;
  }
  next[faction] = clamp(next[faction] + delta);
  const other = OPPOSED[faction];
  if (other && delta > 0) next[other] = clamp(next[other] - delta * STANDING.bleed);
  return next;
}

export function enterCampaign(st, faction) {
  if (st[faction] <= STANDING.campaignEntryClamp) return st;
  return { ...st, [faction]: STANDING.campaignEntryClamp };
}

export const WATCH_WEIGHT = { kesta: 2.0, alder: 0.6, watch: 1.0 };

export const SUSPICION = {
  max: 100, showAbove: 10,
  perWatchman: 4, twoOrMore: 1.8,
  wrongProjectile: 25, ownField: 8, strikeCitizen: 40, seenChannelling: 100, wrongBuilding: 30,
  decay: -3, decayIndoors: -8,
  breakAt: 100, voluntaryUnder: 40,
  radius: 6, holdRadius: 10,
  ticks: [40, 70, 90],
};

export const graftDuration = glamourLevel => 180 + 30 * glamourLevel;
export const GRAFT = { channel: 3.0, uninterruptibleAfter: 1.0, focus: 30, cooldown: 20, cooldownAfterBreak: 120, losRadius: 22 };

// `nearby` is a Watchman between `radius` and `holdRadius`: too far to accrue, too close to relax.
export function suspicionRate({ watchmen = 0, nearby = 0, watchWeight = 1, glamour = 1, indoorsLongacre = false, rateKnob = 1 }) {
  if (watchmen <= 0) {
    if (nearby > 0) return 0;
    return (indoorsLongacre ? SUSPICION.decayIndoors : SUSPICION.decay) * rateKnob;
  }
  const base = SUSPICION.perWatchman * watchWeight * (1 - glamour / 24);
  return base * (watchmen >= 2 ? SUSPICION.twoOrMore : 1) * rateKnob;
}

export function stepSuspicion(susp, dt, ctx) {
  return Math.max(0, Math.min(SUSPICION.max, susp + suspicionRate(ctx) * dt));
}

export const suspicionEvent = (susp, event) =>
  Math.max(0, Math.min(SUSPICION.max, susp + (SUSPICION[event] ?? 0)));

// A Break punishes and immediately re-arms: the free 20 s Graft into the other faction is the
// comeback that keeps detection from reading as a mechanic to avoid.
export function breakGraft(standing, wornFaction) {
  return {
    standing: applyStanding(standing, 'graftBreak', { faction: wornFaction }),
    suspicion: 0,
    cooldown: GRAFT.cooldownAfterBreak,
    freeGraft: { faction: OPPOSED[wornFaction] ?? 'neutral', seconds: 20 },
    aggroRadius: 30,
  };
}

export function graftXp(secondsHeld, suspicion) {
  if (suspicion >= SUSPICION.voluntaryUnder) return 0;
  return Math.min(1600, 400 + 25 * secondsHeld);
}

// ── the Graft itself ──────────────────────────────────────────────────────────
// One state object, no timers, no clock. The caller ticks it with a real dt and reacts to the
// event names it returns. `free` marks the 20 s Graft a Break hands back: no ash, and no XP.

export const newGraft = () => ({ worn: null, left: 0, held: 0, susp: 0, cd: 0, free: false });

export const BLOCKED = {
  granted: 'Nobody has shown you how.',
  cooldown: 'Not yet.',
  ash: 'You have no Hearth Ash.',
  worn: 'You are already wearing one.',
  seen: 'Someone is watching.',
};

export function graftBlocked(g, { granted = false, ash = 0, seen = false } = {}) {
  if (!granted) return 'granted';
  if (g.worn) return 'worn';
  if (g.cd > 0) return 'cooldown';
  if (ash < 1) return 'ash';
  if (seen) return 'seen';
  return null;
}

export function startGraft(g, faction, { glamour = 0, durationMul = 1, seconds = null, free = false } = {}) {
  return {
    ...g,
    worn: faction,
    left: seconds ?? graftDuration(glamour) * durationMul,
    held: 0,
    susp: 0,
    free,
  };
}

export function tickGraft(g, dt, ctx = {}) {
  const out = { ...g };
  const events = [];
  if (out.cd > 0) {
    out.cd = Math.max(0, out.cd - dt);
    if (out.cd === 0) events.push('ready');
  }
  if (!out.worn) return { graft: out, events };
  out.held += dt;
  out.left = Math.max(0, out.left - dt);
  const was = out.susp;
  out.susp = stepSuspicion(out.susp, dt, ctx);
  for (const m of SUSPICION.ticks) if (was < m && out.susp >= m) events.push(`tick${m}`);
  if (out.susp >= SUSPICION.breakAt) events.push('break');
  else if (out.left <= 0) events.push('expire');
  return { graft: out, events };
}

// Every exit runs through here. A Break scores 0 because `graftXp` already refuses anything at
// suspicion 40 or above, and the free Graft scores 0 because being caught should not pay.
export function endGraft(g, { reason = 'voluntary' } = {}) {
  const long = reason === 'break';
  return {
    graft: { ...newGraft(), cd: Math.max(g.cd, long ? GRAFT.cooldownAfterBreak : GRAFT.cooldown) },
    xp: g.free ? 0 : graftXp(g.held, g.susp),
  };
}

export const graftEvent = (g, event) => ({ ...g, susp: suspicionEvent(g.susp, event) });
