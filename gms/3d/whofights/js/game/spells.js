// What a spell costs, what it does, and what it looks like coming out.
//
// Pure — no three, no DOM — because everything that decides whether a cast is legal is arithmetic
// over a small well of mana and a map of cooldowns, and that is worth a test. js/world/spellfx.js
// draws what this module describes; js/game/casting.js is where the two meet the world.
//
// There is no per-ability tuning table and there is deliberately not going to be one. Sixty
// essence abilities and fifty-four confluence ones is a spreadsheet nobody would keep true, and
// the first time it drifted from data/essences.json the game would be lying about what it does.
// The ability's own `kind` is the tuning; its essence's `spell` block is the look.

export const MANA = 100;
export const REGEN = 6.5;         // mana a second, always, whether or not there is a fight
export const WARD = 0.45;         // how much of a blow a ward takes off while it holds

// The ten kinds data/essences.json uses. `aim` is the only structural difference between them:
// `bolt` is thrown at something, `self` blooms where you stand, `dash` moves you and blooms where
// you land.
export const KINDS = {
  attack:      { damage: 22, cost: 14, cooldown: 1.1, aim: 'bolt' },
  affliction:  { damage: 15, cost: 13, cooldown: 1.2, aim: 'bolt', stagger: 0.5 },
  conjuration: { damage: 17, cost: 20, cooldown: 2.4, aim: 'bolt', stagger: 0.4 },
  control:     { damage: 7,  cost: 12, cooldown: 1.8, aim: 'bolt', stagger: 1.4 },
  utility:     { damage: 5,  cost: 8,  cooldown: 1.0, aim: 'bolt' },
  special:     { damage: 44, cost: 38, cooldown: 6.0, aim: 'bolt', stagger: 0.8 },
  // A movement ability is not a blink out of the fight — every one of them in the book arrives
  // somewhere and arrives hot. It moves you and it hurts what you land on.
  movement:    { damage: 12, cost: 10, cooldown: 1.6, aim: 'dash', dash: 6.0, stagger: 0.3 },
  recovery:    { damage: 0,  cost: 22, cooldown: 4.0, aim: 'self', mend: 30 },
  defence:     { damage: 0,  cost: 16, cooldown: 5.0, aim: 'self', ward: 4.0 },
  buff:        { damage: 0,  cost: 14, cooldown: 5.0, aim: 'self', ward: 3.0, mend: 6 },
};

export const DEFAULT_KIND = 'utility';

// The confluence ability is the fourth, and it is meant to feel like the other three arriving at
// once: it costs more, hits harder and waits longer.
export const CONFLUENCE_MUL = { damage: 1.35, cost: 1.3, cooldown: 1.4 };

export const rulesFor = a => KINDS[a?.kind] || KINDS[DEFAULT_KIND];

export function tuning(a) {
  const k = rulesFor(a);
  if (!a?.confluence) return k;
  return {
    ...k,
    damage: Math.round(k.damage * CONFLUENCE_MUL.damage),
    cost: Math.round(k.cost * CONFLUENCE_MUL.cost),
    cooldown: +(k.cooldown * CONFLUENCE_MUL.cooldown).toFixed(2),
  };
}

// ── the well ────────────────────────────────────────────────────────────────
// Kept the way js/game/vitals.js keeps health: a value object, replaced rather than mutated, so a
// caller cannot half-apply a cast.

export const makeWell = (max = MANA) => ({ mana: max, max, cool: {} });

export function well(w, dt) {
  const cool = {};
  for (const [id, t] of Object.entries(w.cool)) {
    const left = t - dt;
    if (left > 0) cool[id] = left;
  }
  return { ...w, mana: Math.min(w.max, w.mana + REGEN * dt), cool };
}

export const cooling = (w, a) => w.cool[a?.id] || 0;
export const fraction = w => (w.max > 0 ? Math.max(0, Math.min(1, w.mana / w.max)) : 0);

// Why this cast will not happen, or null if it will. One reason, said the way the player would
// say it, because it goes straight into a toast.
export function refuse(w, a) {
  if (!a?.id) return 'Nothing to cast.';
  const t = tuning(a);
  if (cooling(w, a) > 0) return `${a.name} is not ready.`;
  if (w.mana < t.cost) return `Not enough mana for ${a.name}.`;
  return null;
}

export const ready = (w, a) => refuse(w, a) === null;

export function spend(w, a) {
  const t = tuning(a);
  return { ...w, mana: Math.max(0, w.mana - t.cost), cool: { ...w.cool, [a.id]: t.cooldown } };
}

// ── the look ────────────────────────────────────────────────────────────────
// One entry per essence. The numbers are the whole difference between fire and water: nothing
// below branches on an essence id, so a thirteenth essence is a data change and no code at all.
//
//   speed/range   how far and how fast the bolt travels
//   fall          gravity on the bolt itself — water arcs, earth drops, wind does not care
//   wobble/curve  chaos strays; manipulation bends toward where you looked
//   pull          the burst falls inward instead of out
//   grow          the trail widens as it goes, which is what makes life read as spreading
//   ring          how much of a mark it leaves on the floor
//   hole          the collapsing dark core, for anything that has to go darker than the room

export const SHAPES = {
  bolt:    { charge: 0.16, speed: 26, range: 22, trail: 5, burst: 120, spread: 3.4, rise: 1.6, fall: 0,    drag: 1.9, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 1.0, size: 1.00 },
  lance:   { charge: 0.22, speed: 20, range: 22, trail: 7, burst: 100, spread: 2.2, rise: -0.2, fall: 1.2, drag: 2.6, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 1.4, size: 1.10 },
  shards:  { charge: 0.26, speed: 18, range: 14, trail: 4, burst: 90,  spread: 3.0, rise: 0.4, fall: 3.5,  drag: 0.9, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 1.6, size: 1.25 },
  cut:     { charge: 0.08, speed: 42, range: 26, trail: 9, burst: 46,  spread: 5.2, rise: 0.2, fall: 0,    drag: 3.4, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 0.4, size: 0.70 },
  fold:    { charge: 0.30, speed: 16, range: 18, trail: 4, burst: 70,  spread: 1.6, rise: 0.2, fall: 0,    drag: 2.2, wobble: 0,   curve: 0, grow: 0, pull: 1, ring: 0.6, size: 0.95 },
  weight:  { charge: 0.34, speed: 12, range: 16, trail: 3, burst: 80,  spread: 1.4, rise: -0.8, fall: 2.2, drag: 3.0, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 2.0, size: 1.15 },
  scatter: { charge: 0.14, speed: 24, range: 20, trail: 6, burst: 130, spread: 4.6, rise: 1.0, fall: 0,    drag: 1.4, wobble: 5.0, curve: 0, grow: 0, pull: 0, ring: 1.1, size: 0.90 },
  ruin:    { charge: 0.28, speed: 22, range: 20, trail: 3, burst: 170, spread: 5.0, rise: 1.4, fall: 0,    drag: 1.1, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 1.8, size: 1.30 },
  hand:    { charge: 0.18, speed: 20, range: 16, trail: 5, burst: 60,  spread: 1.8, rise: 0.6, fall: 0,    drag: 2.4, wobble: 0,   curve: 1, grow: 0, pull: 0, ring: 0.8, size: 0.85 },
  bloom:   { charge: 0.24, speed: 15, range: 16, trail: 8, burst: 110, spread: 2.0, rise: 2.4, fall: -0.6, drag: 1.2, wobble: 0,   curve: 0, grow: 1, pull: 0, ring: 1.3, size: 1.00 },
  shadow:  { charge: 0.12, speed: 30, range: 22, trail: 6, burst: 60,  spread: 2.6, rise: 0.3, fall: 0,    drag: 2.0, wobble: 0,   curve: 0, grow: 0, pull: 0, ring: 0.7, size: 0.85 },
  draw:    { charge: 0.20, speed: 28, range: 18, trail: 5, burst: 90,  spread: 3.0, rise: 0.8, fall: 0,    drag: 2.0, wobble: 0,   curve: 0, grow: 0, pull: 1, ring: 1.0, size: 0.95 },
};

// What a triple's confluence comes out as: everything the three do, slower and wider.
export const CONFLUENCE_SHAPE = 'confluence';
SHAPES[CONFLUENCE_SHAPE] = {
  charge: 0.34, speed: 19, range: 22, trail: 8, burst: 190, spread: 4.2, rise: 1.8, fall: 0,
  drag: 1.3, wobble: 1.2, curve: 0, grow: 1, pull: 0, ring: 2.2, size: 1.20,
};

export const FALLBACK = {
  shape: 'bolt', core: '#ffffff', edge: '#c8a24a', bloom: '#6b5220', void: null, flare: 1,
};

export const shapeOf = spell => SHAPES[spell?.shape] || SHAPES.bolt;

const hex = s => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const unhex = rgb => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

// Averaged in gamma space on purpose. The exact one is darker and muddier, and these are colours
// for a particle that is already being added to whatever is behind it.
export function mixHex(list, fallback) {
  const rgbs = list.map(hex).filter(Boolean);
  if (!rgbs.length) return fallback;
  const out = [0, 1, 2].map(i => rgbs.reduce((a, c) => a + c[i], 0) / rgbs.length);
  return unhex(out);
}

// The three a player took, blended, and made a little brighter than any one of them. Nobody
// chooses a confluence, so nobody authored a palette for the 220 of them either — this is what
// the fourth spell is, and it is the honest picture of it.
export function blendSpell(doc, picked = []) {
  const parts = picked.map(id => doc?.essences?.[id]?.spell).filter(Boolean);
  if (!parts.length) return { ...FALLBACK, shape: CONFLUENCE_SHAPE };
  return {
    shape: CONFLUENCE_SHAPE,
    core: mixHex(parts.map(p => p.core), FALLBACK.core),
    edge: mixHex(parts.map(p => p.edge), FALLBACK.edge),
    bloom: mixHex(parts.map(p => p.bloom), FALLBACK.bloom),
    // One void among the three is enough to open one: the fourth spell of a triple with void in
    // it should be a hole, not an average of a hole and two glows.
    void: parts.map(p => p.void).find(Boolean) || null,
    flare: Math.max(...parts.map(p => p.flare ?? 1)),
  };
}

// The palette and the shape a given ability comes out as. `from` is the essence or confluence id
// js/game/essences.js stamped on it when it was awakened.
export function lookOf(doc, ability, picked = []) {
  const own = doc?.essences?.[ability?.from]?.spell;
  if (own) return { ...FALLBACK, ...own };
  if (ability?.confluence) return blendSpell(doc, picked);
  return { ...FALLBACK };
}

// Everything a caster needs for one press, or null with a reason. One call so that "may I" and
// "what does it look like" cannot answer differently.
export function plan(doc, well_, ability, picked = []) {
  const why = refuse(well_, ability);
  if (why) return { ok: false, why, cast: null };
  const t = tuning(ability);
  const look = lookOf(doc, ability, picked);
  return { ok: true, why: null, cast: { ability, ...t, look, shape: shapeOf(look) } };
}
