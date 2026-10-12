// Ghost fights: an AI wearing a real player's name and loadout. The snapshot is uploaded when
// that player plays an arena match; the fight itself runs entirely offline in the
// challenger's browser and its result is never sent anywhere — not ranked, not counted
// toward the daily allowance. Always labelled GHOST.

import { Match } from '../match.js';
import { Brain } from '../ai.js';
import {
  derive, MOVE_SETS, PERKS, perkMax, moveMaxLv, MOVE_MAX_LV, activeMoves,
  ranksFor, playerRankAt, TOTAL_LEVELS,
} from '../config.js';

const THEMES = Object.keys(MOVE_SETS);
const ALL_WORLDS = { darkUnlocked: true, thugWon: true, simulantWon: true };

/** What a ghost needs from a save to fight, and nothing more. */
export function ghostSnap(save) {
  const p = {}, m = {};
  for (const k of PERKS) {
    const l = save?.perks?.[k.id] | 0;
    if (l > 0 && k.id !== 'ink') p[k.id] = l;
  }
  for (const mv of activeMoves(save)) {
    const s = save?.moves?.[mv.id];
    if (s?.owned) m[mv.id] = [s.power | 0, s.cd | 0];
  }
  const t = THEMES.includes(save?.theme) ? save.theme : 'light';
  return { v: 1, t, cd: save?.carryDark ? 1 : 0, p, m };
}

/**
 * A snapshot back into a save that `derive` and `moveStats` read. Clamped to what any real
 * save could reach, so an edited snapshot cannot make a monster.
 */
export function ghostSave(snap) {
  const t = THEMES.includes(snap?.t) ? snap.t : 'light';
  const carryDark = !!snap?.cd;
  const perks = {};
  for (const k of PERKS) {
    const l = Math.max(0, Math.min(perkMax(k, ALL_WORLDS), snap?.p?.[k.id] | 0));
    if (l) perks[k.id] = l;
  }
  const set = activeMoves({ theme: t, carryDark });
  const moves = {};
  for (const mv of set) {
    const v = snap?.m?.[mv.id];
    if (!Array.isArray(v)) continue;
    moves[mv.id] = {
      owned: true,
      power: Math.max(0, Math.min(MOVE_MAX_LV + 2, v[0] | 0)),
      cd: Math.max(0, Math.min(moveMaxLv(ALL_WORLDS, mv, 'cd'), v[1] | 0)),
    };
  }
  return { theme: t, carryDark, perks, moves, settings: {}, seen: { punch: true, power: true } };
}

export const ownedMoves = (gs) => activeMoves(gs).filter((m) => gs.moves[m.id]?.owned).map((m) => m.id);

/** One number for "how built up is this fighter", for choosing who to list. */
export function ghostPower(gs) {
  let n = 0;
  for (const k in gs.perks) n += gs.perks[k];
  for (const id in gs.moves) n += 2 + (gs.moves[id].power + gs.moves[id].cd) / 2;
  return Math.round(n * 10) / 10;
}

/** Skill from their ranked record: a winning record fights sharper, more battles steadier. */
export function ghostSkill(rec = {}) {
  const b = Math.max(0, rec.battles | 0), w = Math.max(0, Math.min(b, rec.wins | 0));
  const rate = (w + 1) / (b + 2);
  const seasoned = Math.min(1, b / 20);
  return Math.round(Math.max(0.3, Math.min(0.9, 0.3 + 0.12 * seasoned + 0.5 * rate)) * 100) / 100;
}

/**
 * Which ghosts to offer: friends first, then the ones nearest your strength, then a few
 * stronger ones to aim at. Each comes back tagged with `why`.
 */
export function pickGhosts(list, myPower, friends = [], n = 8) {
  const fr = new Set(friends.map((s) => String(s).toLowerCase()));
  const rows = list.map((g) => ({ ...g, power: g.power ?? ghostPower(ghostSave(g.snap)) }));
  const taken = new Set();
  const out = [];
  const take = (g, why) => { if (out.length < n && !taken.has(g)) { taken.add(g); out.push({ ...g, why }); } };
  for (const g of rows) if (fr.has(String(g.name).toLowerCase()) && out.length < Math.min(3, n)) take(g, 'friend');
  const near = rows.filter((g) => !taken.has(g)).sort((a, b) => Math.abs(a.power - myPower) - Math.abs(b.power - myPower) || b.updated - a.updated);
  const strong = myPower * 1.15 + 2;
  const stronger = rows.filter((g) => g.power > strong).sort((a, b) => a.power - b.power);
  const nearN = Math.max(1, Math.ceil((n - out.length) / 2));
  for (const g of near.slice(0, nearN)) take(g, 'near');
  for (const g of stronger) { if (out.filter((x) => x.why === 'stronger').length >= 3) break; take(g, 'stronger'); }
  for (const g of near) take(g, 'near');
  for (const g of out) if (g.why === 'near' && g.power > strong) g.why = 'stronger';
  const order = { friend: 0, near: 1, stronger: 2 };
  return out.sort((a, b) => order[a.why] - order[b.why] || a.power - b.power);
}

/** Everything the Match needs to build the ghost: a one-enemy arena level. */
export function ghostLevel(g, seed = 0) {
  const gs = ghostSave(g.snap);
  const d = derive(gs);
  const power = ghostPower(gs);
  const ids = ownedMoves(gs);
  return {
    idx: 200 + (seed % 6), tier: 0, kind: 'ghost', event: null, reward: 0, dojo: 'The Arena', title: 'ghost',
    enemies: [{
      name: `GHOST · ${String(g.name || 'PLAYER').toUpperCase()}`,
      tier: Math.max(0, Math.min(8, Math.floor(power / 9))),
      hp: d.maxHp * (1 + d.heal), dmg: 8 * d.atkMul, speed: d.speed, scale: 1, mass: 1,
      skill: ghostSkill(g), moves: ids.length, boss: false,
      ghost: { save: gs, stats: d, ids, skill: ghostSkill(g), armed: gs.theme === 'dark' || gs.carryDark },
    }],
  };
}

/** A normal offline Match, except the one opponent is built from a ghost's real save. */
export class GhostMatch extends Match {
  constructor({ ghost, save, seed = 0, onEnd }) {
    super({ level: ghostLevel(ghost, seed), save, onEnd });
    this.ghostOf = ghost;
  }

  build() {
    super.build();
    const g = this.level.enemies[0].ghost;
    const f = this.enemies[0];
    f.ghost = true;
    f.stats = g.stats;
    f.jumpV = g.stats.jump;
    f.armed = g.armed;
    this.brains[0] = new Brain(f, g.skill, g.ids, g.save, { byKind: true });
    // You fight as the rank you have earned, not the arena sheet's index.
    const R = ranksFor(this.save.theme);
    this.player.rank = R[this.bully ? R.length - 1 : playerRankAt(Math.min(TOTAL_LEVELS - 1, this.save.level | 0))];
  }

  /** The campaign's enemies punch at a flat rate; a ghost's HEAVIER HAND is real. */
  land(attacker, target, def, from) {
    if (attacker.ghost && !def.id && !def.special) def = { ...def, dmg: (def.dmg / 8) * attacker.baseDmg };
    return super.land(attacker, target, def, from);
  }
}

/**
 * The finished fight, in the shape js/events counts (`counted`/`pointsFor`). It is a
 * campaign-type battle (`src: 'campaign'`, so only "any battle" events take it, under the
 * campaign cap), marked `kind: 'ghost'`. Not wired to events yet.
 */
export function ghostBattle(result, m, at = Date.now()) {
  const e = m.enemies[0];
  return {
    id: `ghost:${at}`, at, src: 'campaign', kind: 'ghost', ranked: false, won: result === 'win',
    oppDmg: e ? Math.max(0, Math.min(1, 1 - e.hp / e.maxHp)) : 0,
    ghost: m.ghostOf?.name || '',
  };
}
