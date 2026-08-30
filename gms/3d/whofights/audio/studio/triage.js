// Which sounds are keepers, which are still being argued about, and which are out. Seeded with
// the verdicts from the first listening session so nothing has to be rediscovered; after that the
// browser's own copy wins, because it is the one being edited.

import { SFX, SFX_IDS } from '../js/sfx.js';

export const BUCKETS = ['keep', 'review', 'bad'];
export const BUCKET_LABEL = { keep: 'Keepers', review: 'Still deciding', bad: 'Rejected' };
const KEY = 'wf.sfx.triage.v1';

// Aaron's own words, 2026-08-04. `as` is a suggested rename where the sound turned out not to be
// the thing it was named after.
const SEED = {
  explosionDistant: { b: 'keep', n: 'Good. The dials sound good at different levels too.' },
  impactMetal: { b: 'keep', as: 'Bell — struck', n: 'Kind of a bell, or a tubular bell. Has potential.' },
  impactWood: { b: 'keep', n: 'Default is a bit gentle. Pitch at the lowest is better — sounds like chopping wood. Pitch right down + reverb right up could work for a lot: distant spooky knocking, scary footsteps, even a distant gunshot.' },
  whooshFast: { b: 'keep', n: 'Nice. Sword swipe or magic effect, and probably more. Different speeds all work — faster for swords, slower for magic.' },
  whooshHeavy: { b: 'keep', n: 'Also good. Similar to the fast one but gives more range again.' },
  uiBlip: { b: 'keep', n: 'Fine.' },
  uiConfirm: { b: 'keep', n: 'Fine.' },
  uiError: { b: 'keep', n: 'Fine.' },
  laser: { b: 'keep', as: 'Magic — beam', n: 'Not very laser-ish, but a nice magical effect — which this game is far more likely to want than a laser. Has potential.' },
  zap: { b: 'keep', n: 'Two sounds welded together. The zappy half is not very good; the other half is creaky and creepy, like something a monster in the dark would make. That half is now split out as Creak.' },
  footGrass: { b: 'keep', n: 'Not the best, but sounds ok with soft/level turned down.' },
  footGravel: { b: 'keep', n: 'Good with small adjustments, e.g. pitch.' },
  footWood: { b: 'keep', n: 'Needs pitch right down, hollow right down, reverb up — then ok. The default is not.' },
  waterSplash: { b: 'keep', n: 'Usable.' },
  waterDrip: { b: 'keep', n: 'Yes.' },
  stream: { b: 'keep', n: 'Yes.' },
  fireCrackle: { b: 'keep', n: 'Yes.' },
  ignite: { b: 'keep', n: 'Yes.' },
  bird: { b: 'keep', n: 'Yes.' },
  insect: { b: 'keep', n: 'Great. The options mean it could cover a lot of different monster noises.' },
  thunder: { b: 'keep', n: 'Like this one, and the adjustments are all useful.' },

  powerup: { b: 'review', n: 'Same platformer problem as the coin, but more usable — could work in limited situations.' },
  alarm: { b: 'review', n: 'Potentially usable.' },
  growl: { b: 'review', as: 'Engine / monster drone', n: 'Not a growl. Maybe an engine noise, or a monster noise.' },
  frog: { b: 'review', as: '(not a croak)', n: 'Not much like a croak. A little bit with adjustments — but useful for other things, so potentially still usable.' },

  pickupCoin: { b: 'bad', n: 'Too platformer. Not this style of game. Replaced by Coins — into a bag.' },
  explosionBoom: { b: 'bad', n: '' },
  explosionCrack: { b: 'bad', n: '' },
  impactThud: { b: 'bad', n: '' },
};

// Anything added since the seed starts in review — that is what the review bucket is for.
export function freshState() {
  const out = {};
  for (const id of SFX_IDS) {
    const s = SEED[id];
    out[id] = { bucket: s ? s.b : 'review', note: s ? s.n : '', as: s && s.as ? s.as : '' };
  }
  return out;
}

export function load() {
  const base = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) for (const id in base) if (saved[id]) Object.assign(base[id], saved[id]);
  } catch {}
  return base;
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Only the params that were actually moved, so the report says what to change rather than
// restating every default back at you.
export function changed(id, values) {
  const out = {};
  const ps = SFX[id].params;
  for (const k in ps) {
    if (values[k] !== undefined && Math.abs(values[k] - ps[k].def) > 1e-9) out[k] = values[k];
  }
  return out;
}

function block(id, st, values) {
  const s = SFX[id];
  const lines = [`${s.name}${st.as ? `   → rename: ${st.as}` : ''}`, `  id: ${id}   group: ${s.group}`];
  const tweaks = changed(id, values);
  const keys = Object.keys(tweaks);
  if (keys.length) lines.push('  settings: ' + keys.map(k => `${k}=${tweaks[k]}`).join(', '));
  if (st.note) lines.push('  notes: ' + st.note);
  return lines.join('\n');
}

export function report(state, store, only = 'keep') {
  const ids = SFX_IDS.filter(id => state[id].bucket === only);
  const head = `WHO FIGHTS SFX — ${BUCKET_LABEL[only].toLowerCase()} (${ids.length} of ${SFX_IDS.length})`;
  const body = ids.map(id => block(id, state[id], store[id])).join('\n\n');
  const tally = BUCKETS.map(b => `${BUCKET_LABEL[b]}: ${SFX_IDS.filter(i => state[i].bucket === b).length}`).join('   ');
  return `${head}\n${'─'.repeat(head.length)}\n\n${body}\n\n${tally}\n`;
}

export function reportAll(state, store) {
  return BUCKETS.map(b => report(state, store, b)).join('\n\n');
}
