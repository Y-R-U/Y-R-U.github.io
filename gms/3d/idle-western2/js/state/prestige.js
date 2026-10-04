// "Fake Your Death" (W2): Bounty maths (IL2 legacy points), graves with seeded epitaphs, the next disguise.
import { mulberry32, hashStr } from './events.js?v=20261004f';

export function bountyTotal(allTime, B) {
  if (!(allTime > 0)) return 0;
  return Math.floor(B.scale * Math.pow(allTime / B.e0, B.power));
}

export function bountyMult(points, floor, B) {
  return Math.max(floor || 1, 1 + B.perPoint * points);
}

export function canFakeDeath(state, B) {
  return state.districts.includes(B.needDistrict) && (state.lines[B.needLine]?.lv || 0) > 0;
}

export function deathPreview(state, B) {
  const total = bountyTotal(state.allTime, B);
  const gain = Math.max(0, total - state.bounty);
  const cur = bountyMult(state.bounty, state.bountyFloor, B);
  const raw = 1 + B.perPoint * (state.bounty + gain);
  const next = Math.max(raw, state.gen === 1 ? B.firstFloor : state.bountyFloor || 1);
  const available = canFakeDeath(state, B);
  return {
    available,
    bounty: gain,
    total,
    mult: next / cur,
    nextMult: next,
    curMult: cur,
    recommended: available && raw / cur >= 1 + B.recommendGain,
    floorApplies: raw < next,
    starterCash: Math.max(50, (state.bounty + gain) * B.starterCashPerPoint),
    needs: [
      { id: B.needDistrict, emoji: '🏦', text: 'Bank Block open', done: state.districts.includes(B.needDistrict) },
      { id: B.needLine, emoji: '⚰️', text: 'Own Boot Hill Undertakers', done: (state.lines[B.needLine]?.lv || 0) > 0 },
    ],
  };
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Pure and seeded: the same (seed, gen) always gives the same alias, disguise and epitaph.
export function disguiseFor(seed, gen, E) {
  const rng = mulberry32(hashStr('disguise:' + seed + ':' + gen));
  return { name: pick(E.ALIASES, rng) + ' ' + pick(E.SURNAMES, rng), moustache: pick(E.MOUSTACHES, rng), specs: pick(E.SPECS, rng) };
}

export function epitaphFor(seed, gen, name, hatName, E) {
  const rng = mulberry32(hashStr('epitaph:' + seed + ':' + gen));
  return pick(E.EPITAPHS, rng).replace('{name}', name).replace('{hat}', hatName);
}
