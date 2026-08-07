// Who you are: origin, name, gender, personality, traits — and the sim numbers the origin buys.
// Pure. Everything random here comes off a seed so the same seed always rolls the same person.

import content from './content.js';
import { createRng } from './rng.js';

export const PROFILE_VERSION = 1;

export function origins() { return content.all('origin'); }
export function getOrigin(id) { return content.get('origin', id) || origins()[1]; }

export function rollName(seed) {
  const r = createRng(seed);
  const n = content.names;
  return {
    name: `${r.pick(n.given)} ${r.pick(n.family)}`,
    company: `${r.pick(n.companyHead)} ${r.pick(n.companyTail)}`,
  };
}

export function newProfile(originId, seed = 1) {
  const o = getOrigin(originId);
  const rolled = rollName(seed);
  return {
    v: PROFILE_VERSION,
    origin: o.id,
    name: rolled.name,
    company: rolled.company,
    gender: 'x',
    personality: o.character.personality,
    traits: o.character.traits.slice(),
  };
}

const TRAIT_IDS = () => new Set(content.all('trait').map(t => t.id));
const PERSONALITY_IDS = () => new Set(content.all('personality').map(p => p.id));

// A profile can arrive from localStorage, a URL or a hand edit, so nothing here trusts its input.
export function normalise(p, seed = 1) {
  const base = newProfile(p?.origin, seed);
  if (!p) return base;
  const traitIds = TRAIT_IDS();
  const traits = (Array.isArray(p.traits) ? p.traits : [])
    .filter(t => traitIds.has(t))
    .slice(0, content.traitRules.MAX_TRAITS);
  return {
    v: PROFILE_VERSION,
    origin: base.origin,
    name: String(p.name || base.name).trim().slice(0, 28) || base.name,
    company: String(p.company || base.company).trim().slice(0, 28) || base.company,
    gender: ['m', 'f', 'x'].includes(p.gender) ? p.gender : 'x',
    personality: PERSONALITY_IDS().has(p.personality) ? p.personality : base.personality,
    traits,
  };
}

export function toggleTrait(profile, id) {
  const has = profile.traits.includes(id);
  if (has) return { ...profile, traits: profile.traits.filter(t => t !== id) };
  if (profile.traits.length >= content.traitRules.MAX_TRAITS) return profile;
  return { ...profile, traits: profile.traits.concat(id) };
}

// The origin's overrides sit on top of content/balance.js rather than replacing it, so a number
// nobody chose to change stays in one place.
export function balanceFor(originId) {
  const b = content.balance;
  const o = getOrigin(originId);
  return Object.freeze({
    ...b,
    start: Object.freeze({ ...b.start, ...o.start }),
    loan: Object.freeze({ ...b.loan, ...o.loan }),
  });
}

export function describe(profile) {
  const o = getOrigin(profile.origin);
  const p = content.get('personality', profile.personality);
  const ts = profile.traits.map(t => content.get('trait', t)?.name).filter(Boolean);
  return [o.name, p?.name, ...ts].join(' · ');
}

export default { newProfile, normalise, toggleTrait, balanceFor, rollName, origins, getOrigin, describe, PROFILE_VERSION };
