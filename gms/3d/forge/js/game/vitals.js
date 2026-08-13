// Health and Focus as the HUD draws them. Pure: every number comes from sim/combat.

import { hpMax, focusMax, focusRegen, RESTED_AFTER, OVERDRAW, GUTTER } from '../sim/combat.js';
import { levelFor } from '../sim/xp.js';

export const LOW_HP = 0.25;

export function limits(schools = {}) {
  const ward = levelFor(schools.ward || 0);
  const hearth = levelFor(schools.hearth || 0);
  return { hp: hpMax(ward, hearth), focus: focusMax(ward), regen: focusRegen(ward), ward };
}

export function blank(schools, saved = null) {
  const l = limits(schools);
  return {
    hp: saved?.hp == null ? l.hp : Math.min(saved.hp, l.hp),
    focus: saved?.focus == null ? l.focus : Math.min(saved.focus, l.focus),
    since: RESTED_AFTER,
    guttered: 0,
  };
}

export function tick(v, dt, l) {
  const since = v.since + dt;
  const rate = l.regen * (since >= RESTED_AFTER ? 2 : 1);
  return {
    hp: Math.min(l.hp, v.hp),
    focus: Math.min(l.focus, v.focus + rate * dt),
    since,
    guttered: Math.max(0, v.guttered - dt),
  };
}

// SYSTEMS §4.1: casting short is allowed once — the shortfall comes out of HP 1:1 and leaves you
// Guttered. Returns `spent: false` only when there was not even a body left to pay with.
export function spend(v, cost, l) {
  const price = cost * (v.guttered > 0 ? OVERDRAW.costMul : 1);
  if (v.focus >= price) return { ...v, focus: v.focus - price, since: 0, spent: true };
  const short = price - v.focus;
  if (short >= v.hp) return { ...v, spent: false };
  return { ...v, hp: v.hp - short, focus: 0, since: 0, guttered: OVERDRAW.guttered, spent: true };
}

export function hurt(v, damage) {
  return { ...v, hp: Math.max(0, v.hp - damage), guttered: v.guttered };
}

export const low = (v, l) => v.hp / l.hp <= LOW_HP;
export const down = v => v.hp <= 0;

// The gutter: no XP loss, no corpse run. §9.4 — a lesson, not a punishment.
export function gutter(doc, whiteCord = false) {
  const rate = whiteCord ? GUTTER.marksWithWhiteCord : GUTTER.marks;
  return { marks: Math.floor(doc.purse.marks * rate), perishables: GUTTER.perishables };
}
