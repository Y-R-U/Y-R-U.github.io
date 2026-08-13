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
export function applyStanding(st, action, { faction, amount = 0 } = {}) {
  const next = { ...st, caps: { ...st.caps, [faction]: { ...st.caps[faction] } } };
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
};

export const graftDuration = glamourLevel => 180 + 30 * glamourLevel;
export const GRAFT = { channel: 3.0, uninterruptibleAfter: 1.0, focus: 30, cooldown: 20, cooldownAfterBreak: 120, losRadius: 22 };

export function suspicionRate({ watchmen = 0, watchWeight = 1, glamour = 1, indoorsLongacre = false, rateKnob = 1 }) {
  if (watchmen <= 0) return (indoorsLongacre ? SUSPICION.decayIndoors : SUSPICION.decay) * rateKnob;
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
