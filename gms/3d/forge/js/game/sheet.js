// The character sheet and the school dial, as data. Pure.

import { SCHOOLS, SCHOOL_NAMES } from '../sim/schools.js';
import { SPELLS, factionBolt } from '../sim/spells.js';
import { levelFor, progress, grasp } from '../sim/xp.js';
import { band } from '../sim/faction.js';
import { limits } from './vitals.js';
import { count } from './journal.js';
import { TOWNS, townOf } from './towns.js';

// The opening's first input is a cast, so Kindle can never be locked. Everything else opens the
// first time it is trained or a quest grants it — there is no separate unlock ledger to keep in
// step with the XP the player already has.
export const ALWAYS = 'kindle';
export const PINS = 3;

export const isUnlocked = (doc, school) =>
  school === ALWAYS || (doc.schools?.[school] || 0) > 0 || !!doc.flags?.[`school.${school}`];

export const unlocked = doc => SCHOOLS.filter(s => isUnlocked(doc, s));

// A pin the player set survives a school being re-locked by a rolled-back save, so the list is
// filtered before it is padded.
export function pins(doc) {
  const open = unlocked(doc);
  const kept = (doc.pins || []).filter(p => open.includes(p));
  for (const s of open) if (kept.length < PINS && !kept.includes(s)) kept.push(s);
  return kept.slice(0, PINS);
}

export function cycle(doc, current) {
  const p = pins(doc);
  if (!p.length) return null;
  const i = p.indexOf(current);
  return p[(i + 1) % p.length];
}

export function schoolRows(doc) {
  return SCHOOLS.map(id => {
    const xp = doc.schools?.[id] || 0;
    const p = progress(xp);
    return { id, name: SCHOOL_NAMES[id], xp, level: p.level, frac: p.frac, into: p.into,
      need: p.need, locked: !isUnlocked(doc, id) };
  });
}

const title = id => id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export const charmRows = doc => (doc.charms || [null, null, null]).map(c =>
  c ? { filled: true, text: `${title(c.id)}  +${Math.round((c.mag || 0) * 100)}%`, integrity: c.integrity }
    : { filled: false, text: 'empty' });

export function playedText(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}

export function sheetOf(doc, { truths = {}, day = 0 } = {}) {
  const l = limits(doc.schools);
  const t = count({ truths: doc.truths || [], log: doc.log || [] }, truths);
  return {
    town: townOf(doc.campaign?.current || doc.faction),
    grasp: grasp(doc.schools || {}),
    hp: l.hp,
    focus: l.focus,
    regen: l.regen,
    schools: schoolRows(doc),
    charms: charmRows(doc),
    stave: { name: title(doc.stave?.id || 'ash_stave'), integrity: Math.round(doc.stave?.integrity ?? 100) },
    standing: TOWNS.map(x => ({ ...x, value: doc.standing?.[x.id] || 0, band: band(doc.standing?.[x.id] || 0) })),
    echoes: doc.campaign?.echoes || [],
    truths: t,
    marks: doc.purse?.marks || 0,
    played: playedText(doc.played || 0),
    day,
  };
}

// §9.4's telegraph: the band a road carries against what the player can survive. One calm line,
// never a skull. Grasp/10 is the yardstick SYSTEMS §4.4 uses for the same comparison.
export const OVER_LEVEL = 6;
export const outclassed = (doc, bandLevel) => bandLevel - grasp(doc.schools || {}) / 10 > OVER_LEVEL;

export const levelIn = (doc, school) => levelFor(doc.schools?.[school] || 0);

// What the dial casts for a school: its cheapest tier-1 spell. Kindle is the one that changes
// with the faction you are wearing, which is why it goes through `factionBolt`.
export function basicOf(school, faction = 'light') {
  if (school === 'kindle') return factionBolt(faction);
  const list = Object.values(SPELLS).filter(s => s.school === school && s.tier === 1 && !s.factionId);
  return list.sort((a, b) => a.cost - b.cost)[0] || null;
}
