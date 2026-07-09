// AI empires. aiStep() performs ONE action per call and returns a descriptor
// for the presentation layer to animate; null means the turn is finished.
// Personalities weight the build economy; aggro shapes army behaviour.
import { CFG } from './config.js';
import { key, unkey, neighbors, disc, hexDist, bfs, pathTo } from './hex.js';
import { armyAt, empireBases, empireArmies, villagesOwned } from './state.js';
import {
  recalcTerritory, buildTower, buildVillage, upgradeBase, upgradeTower,
  recruitArmy, claimRadius, buildingArrows, effectiveDef, computeIncome,
} from './rules.js';
import { moveOptions, applyMove, applyMerge, applyAttack } from './units.js';

// story-only pushover; not offered in skirmish setup
const MEEK = { label: 'Meek', village: 1.2, tower: 0.6, army: 0.35, upgrade: 0.4, aggro: 0.05 };
const personaOf = (e) => CFG.personalities[e.personality] || MEEK;

export function aiBeginTurn(st, idx) {
  st._ai = { idx, phase: 'build', buildsLeft: 7, armyQueue: empireArmies(st, idx).map(a => a.id) };
}

export function aiStep(st, idx) {
  if (!st._ai || st._ai.idx !== idx) aiBeginTurn(st, idx);
  const ctx = st._ai;
  if (ctx.phase === 'build') {
    if (ctx.buildsLeft-- > 0) {
      const act = tryBuild(st, idx);
      if (act) return act;
    }
    ctx.phase = 'army';
  }
  while (ctx.armyQueue.length) {
    const a = st.armies.get(ctx.armyQueue[0]);
    if (!a || a.owner !== idx || a.movesLeft <= 0) { ctx.armyQueue.shift(); continue; }
    const act = armyAct(st, idx, a);
    if (act) return act;
    ctx.armyQueue.shift();
  }
  st._ai = null;
  return null;
}

// ---------- economy ----------

function tryBuild(st, idx) {
  const e = st.empires[idx];
  const p = personaOf(e);
  const rng = st.rng;
  const income = computeIncome(st, idx);
  const myArmies = empireArmies(st, idx);
  const maxArmies = CFG.armyCap(income.total);
  const threat = threatLevel(st, idx);
  const cands = [];

  // upgrade a base
  for (const bt of empireBases(st, idx)) {
    const b = bt.building;
    if (b.level >= 5) continue;
    const cost = CFG.baseUpgrade[b.level];
    if (e.coins < cost) continue;
    cands.push({
      score: p.upgrade * (6 - b.level) * 2.2 * jit(rng),
      run: () => { upgradeBase(st, idx, bt.k); return { type: 'upgrade', k: bt.k, what: 'base' }; },
    });
  }
  // village on a safe interior tile
  const vCost = CFG.villageCost(villagesOwned(st, idx));
  if (e.coins >= vCost) {
    const spot = bestVillageSpot(st, idx);
    if (spot) cands.push({
      score: p.village * 3.0 * (12 / (vCost + 2)) * jit(rng),
      run: () => { buildVillage(st, idx, spot); return { type: 'build', k: spot, what: 'village' }; },
    });
  }
  // tower — expansion or defence
  if (e.coins >= CFG.towers.wood.cost) {
    const exp = bestTowerSpot(st, idx, 'expand');
    if (exp) cands.push({
      score: p.tower * (1.6 + exp.gain * 0.22) * jit(rng),
      run: () => { buildTower(st, idx, exp.k, 'wood'); return { type: 'build', k: exp.k, what: 'wood' }; },
    });
    if (threat > 0) {
      const dfn = bestTowerSpot(st, idx, 'defend');
      // don't stack endless towers on the same hot corner
      if (dfn && !crowded(st, idx, dfn.k)) {
        const type = e.coins >= CFG.towers.mortar.cost && threat > 2 ? 'mortar'
                   : e.coins >= CFG.towers.stone.cost ? 'stone' : 'wood';
        cands.push({
          score: (p.tower + 0.6) * (1 + threat) * jit(rng),
          run: () => { buildTower(st, idx, dfn.k, type); return { type: 'build', k: dfn.k, what: type }; },
        });
      }
    }
  }
  // upgrade an existing tower under threat
  if (threat > 1) {
    for (const t of st.tiles.values()) {
      const b = t.building;
      if (!b || b.owner !== idx || !(b.type in CFG.towers) || b.type === 'mortar') continue;
      const next = CFG.towerOrder[CFG.towerOrder.indexOf(b.type) + 1];
      const cost = CFG.towers[next].cost - CFG.towers[b.type].cost;
      if (e.coins < cost) continue;
      if (nearEnemy(st, idx, t.q, t.r, 4)) {
        cands.push({
          score: p.tower * 1.5 * jit(rng),
          run: () => { upgradeTower(st, idx, t.k); return { type: 'upgrade', k: t.k, what: 'tower' }; },
        });
        break;
      }
    }
  }
  // recruit an army — bank up for quality troops instead of drip-feeding
  // cannon fodder into enemy arrow fire
  if (myArmies.length < maxArmies) {
    const affordable = Math.min(CFG.armyMax, Math.floor(e.coins / 10));
    const desired = Math.min(CFG.armyMax, 2 + Math.floor(st.round / 3));
    const lvl = Math.min(affordable, CFG.armyMax);
    const worthIt = myArmies.length === 0 ? lvl >= 1 : lvl >= Math.max(2, desired - 2);
    if (worthIt && lvl >= 1) {
      const spot = musterSpot(st, idx);
      if (spot) cands.push({
        score: p.army * (1.4 + threat * 0.8 + (myArmies.length === 0 ? 1.2 : 0)) * jit(rng),
        run: () => {
          const err = recruitArmy(st, idx, spot, lvl);
          return err ? null : { type: 'recruit', k: spot, level: lvl };
        },
      });
    }
  }

  cands.sort((a, b) => b.score - a.score);
  for (const c of cands) {
    if (c.score < 1.1) break;      // nothing worthwhile — bank coins
    const act = c.run();
    if (act) return act;
  }
  return null;
}

const jit = (rng) => 0.75 + rng() * 0.5;

function threatLevel(st, idx) {
  // enemy armies near any of my buildings
  let threat = 0;
  for (const a of st.armies.values()) {
    if (a.owner === idx) continue;
    for (const t of st.tiles.values()) {
      const b = t.building;
      if (!b || b.owner !== idx) continue;
      const d = hexDist(a.q, a.r, t.q, t.r);
      if (d <= 3) threat += a.level * (b.type === 'base' ? 1.5 : 0.8) / (d + 1);
    }
  }
  return threat;
}

// already 2+ of my towers within 2 hexes? then another won't help
function crowded(st, idx, k) {
  const t = st.tiles.get(k);
  let n = 0;
  for (const ot of st.tiles.values()) {
    const b = ot.building;
    if (b && b.owner === idx && b.type in CFG.towers && hexDist(ot.q, ot.r, t.q, t.r) <= 2) n++;
  }
  return n >= 2;
}

function nearEnemy(st, idx, q, r, range) {
  for (const t of st.tiles.values()) {
    if (t.owner >= 0 && t.owner !== idx && hexDist(q, r, t.q, t.r) <= range) return true;
    const a = armyAt(st, t);
    if (a && a.owner !== idx && hexDist(q, r, t.q, t.r) <= range) return true;
  }
  return false;
}

// tiles beside my bases stay clear so armies can muster
function chokesMuster(st, idx, q, r) {
  for (const bt of empireBases(st, idx)) {
    if (hexDist(bt.q, bt.r, q, r) <= 1) return true;
  }
  return false;
}

function bestVillageSpot(st, idx) {
  let best = null, bs = -1;
  outer:
  for (const t of st.tiles.values()) {
    if (t.owner !== idx || t.building || t.armyId) continue;
    const [q, r] = [t.q, t.r];
    if (chokesMuster(st, idx, q, r)) continue;
    let s = 0, built = 0;
    for (const [nq, nr] of neighbors(q, r)) {
      const nt = st.tiles.get(key(nq, nr));
      if (!nt) continue;
      if (nt.building?.type === 'village') continue outer;  // game rule
      if (nt.building) built++;
      if (nt.owner === idx) s += 1;              // interior is safer
    }
    if (built >= 3) continue;                    // keep lanes walkable
    if (nearEnemy(st, idx, q, r, 3)) s -= 4;
    s += st.rng() * 0.8;
    if (s > bs) { bs = s; best = t.k; }
  }
  return bs > 1 ? best : null;
}

function bestTowerSpot(st, idx, mode) {
  let best = null, bg = 0;
  for (const t of st.tiles.values()) {
    if (t.owner !== idx || t.building || t.armyId) continue;
    if (chokesMuster(st, idx, t.q, t.r)) continue;
    if (mode === 'expand') {
      // how many currently-unclaimed-by-me tiles would a wood tower claim?
      let gain = 0;
      for (const [nq, nr] of neighbors(t.q, t.r)) {
        const nt = st.tiles.get(key(nq, nr));
        if (nt && !nt.claims.includes(idx)) gain++;
      }
      gain += st.rng();
      if (gain > bg) { bg = gain; best = { k: t.k, gain }; }
    } else {
      // defensive: closest free tile to a threatened building of mine
      let score = 0;
      for (const a of st.armies.values()) {
        if (a.owner === idx) continue;
        const d = hexDist(a.q, a.r, t.q, t.r);
        if (d <= 4) score += a.level / (d + 1);
      }
      score += st.rng() * 0.3;
      if (score > bg) { bg = score; best = { k: t.k, gain: score }; }
    }
  }
  return mode === 'expand' ? (bg >= 2 ? best : null) : (bg > 0.8 ? best : null);
}

function musterSpot(st, idx) {
  // free own tile within muster range, safest from enemy arrows first
  let best = null, bs = -1e9;
  for (const bt of empireBases(st, idx)) {
    for (const [q, r] of disc(bt.q, bt.r, CFG.musterRadius)) {
      const t = st.tiles.get(key(q, r));
      if (!t || t.owner !== idx || t.building || t.armyId) continue;
      let danger = 0;
      for (const ot of st.tiles.values()) {
        const b = ot.building;
        if (!b || b.owner === idx || b.owner < 0 || b.type === 'village') continue;
        if (hexDist(ot.q, ot.r, q, r) <= claimRadius(b)) danger += buildingArrows(b);
      }
      const s = -danger * 10 + st.rng();
      if (s > bs) { bs = s; best = t.k; }
    }
  }
  return best;
}

// ---------- armies ----------

function armyAct(st, idx, army) {
  const p = personaOf(st.empires[idx]);
  const opts = moveOptions(st, army);

  // 1. merge into a bigger host — mobs of small armies jam the front
  if (army.level <= 5 && opts.merges.size) {
    let bestM = null, bl = -1;
    for (const [k, m] of opts.merges) {
      const other = armyAt(st, st.tiles.get(k));
      if (other && other.level + army.level <= CFG.armyMax && other.level > bl) {
        bl = other.level; bestM = { k, m };
      }
    }
    if (bestM && (bl >= army.level || st.rng() < 0.4)) {
      const err = applyMerge(st, army, bestM.k, bestM.m.cost);
      if (!err) return { type: 'merge', from: key(army.q, army.r), k: bestM.k };
    }
  }

  // 2. attack something worthwhile in range
  let bestAtk = null, bas = 0;
  for (const [k, info] of opts.attacks) {
    const t = st.tiles.get(k);
    const dfd = armyAt(st, t);
    const atk = CFG.armyAtk(army.level);
    const def = effectiveDef(st, k);
    let dmg = atk - def;
    if (dmg <= 0) dmg = atk >= def - CFG.glancingMargin ? 1 : 0;
    if (dmg <= 0) continue;                         // would be repelled
    let value = dfd ? (12 + dfd.level * 2) * (t.owner === idx ? 2.5 : 1)  // repel invaders!
      : t.building.type === 'base' ? 90 + t.building.level * 12
      : t.building.type === 'village' ? (p.aggro > 1.2 ? 34 : 26)         // raiders starve rivals
      : 24;
    const hp = dfd ? dfd.hp : t.building.hp;
    if (dmg >= hp) value *= 1.6;                    // finishing blows are gold
    else if (dmg === 1) value *= dfd ? 0.3 : 0.7;   // chip damage: fine vs walls, poor vs armies
    value *= p.aggro;
    if (value > bas) { bas = value; bestAtk = { k, info }; }
  }
  if (bestAtk && bas >= 6) {
    // walk to the striking tile if needed, then hit (one action: move+attack)
    let movePath = null;
    const viaK = bestAtk.info.via;
    if (viaK !== key(army.q, army.r)) {
      movePath = pathTo(opts.dist, viaK);
      applyMove(st, army, movePath);
    }
    const ev = applyAttack(st, army, bestAtk.k);
    return { type: 'attack', armyId: army.id, path: movePath, targetK: bestAtk.k, ev };
  }

  // 3. hurt? fall back into friendly aura
  if (army.hp < army.maxHp * 0.4 && p.aggro < 1.5) {
    const home = nearestOwnBuilding(st, idx, army);
    if (home && hexDist(army.q, army.r, home.q, home.r) > 1) {
      const path = stepToward(st, army, home.q, home.r, opts);
      if (path) { applyMove(st, army, path); return { type: 'move', armyId: army.id, path }; }
    }
    army.movesLeft = 0;
    return null;
  }

  // 4. march on the juiciest enemy target (turtles only defend their realm)
  const tgt = pickTarget(st, idx, army, p);
  if (tgt) {
    const path = stepToward(st, army, tgt.q, tgt.r, opts);
    if (path && path.length) {
      applyMove(st, army, path);
      return { type: 'move', armyId: army.id, path };
    }
  }
  army.movesLeft = 0;
  return null;
}

function nearestOwnBuilding(st, idx, army) {
  let best = null, bd = Infinity;
  for (const t of st.tiles.values()) {
    const b = t.building;
    if (!b || b.owner !== idx || b.type === 'village') continue;
    const d = hexDist(army.q, army.r, t.q, t.r);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function pickTarget(st, idx, army, p) {
  let best = null, bs = 0;
  const myBase = empireBases(st, idx)[0];
  for (const t of st.tiles.values()) {
    let value = 0;
    const b = t.building;
    const a = armyAt(st, t);
    if (b && b.owner >= 0 && b.owner !== idx && st.empires[b.owner].alive) {
      value = b.type === 'base' ? 100 + b.level * 10 : b.type === 'village' ? 30 : 22;
    } else if (a && a.owner !== idx) {
      value = (10 + a.level * 2) * p.aggro;
      if (t.owner === idx) value = 40 + a.level * 3;  // invader on my land — intercept
      if (a.level >= army.level + 2) value *= 0.25;   // don't chase giants
    } else continue;
    // turtles defend: only care about targets near home
    if (p.aggro < 0.45 && myBase && hexDist(t.q, t.r, myBase.q, myBase.r) > CFG.base[myBase.building.level].radius + 2) continue;
    const d = hexDist(army.q, army.r, t.q, t.r);
    const s = value / (d + 2);
    if (s > bs) { bs = s; best = t; }
  }
  return best;
}

// advance as far as possible toward (tq,tr) this turn; returns path or null
function stepToward(st, army, tq, tr, opts) {
  const fromK = key(army.q, army.r);
  // long-range dist map — marches through friendly armies, stands on free land
  const far = bfs(fromK, 64, (k) => {
    const t = st.tiles.get(k);
    if (!t || t.building) return false;
    if (!t.armyId) return true;
    const a = st.armies.get(t.armyId);
    return a && a.owner === army.owner;
  });
  // best reachable-this-turn FREE tile that minimizes distance to target
  let bestK = null, bestRem = hexDist(army.q, army.r, tq, tr), bestCost = 0;
  for (const [k, c] of far) {
    if (c > army.movesLeft) continue;
    const t = st.tiles.get(k);
    if (t.armyId) continue;
    const [q, r] = unkey(k);
    const rem = hexDist(q, r, tq, tr);
    if (rem < bestRem || (rem === bestRem && c < bestCost)) { bestRem = rem; bestK = k; bestCost = c; }
  }
  if (!bestK || bestK === fromK) return null;
  return pathTo(far, bestK);
}
