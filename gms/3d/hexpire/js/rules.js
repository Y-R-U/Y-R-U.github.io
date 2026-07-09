// The rulebook: territory claims, income, building actions, arrow volleys,
// splits, eliminations and win detection. Pure state-in/state-out — events
// worth animating are returned or pushed to st.log for the presentation layer.
import { CFG } from './config.js';
import { key, disc, hexDist, components, neighbors } from './hex.js';
import { makeBuilding, makeArmy, tileAt, armyAt, empireBases, villagesOwned } from './state.js';

export const claimRadius = (b) =>
  b.type === 'base' ? CFG.base[b.level].radius :
  b.type === 'village' ? 0 : CFG.towers[b.type].radius;

export const buildingDef = (b) =>
  b.type === 'base' ? CFG.base[b.level].def :
  b.type === 'village' ? 0 : CFG.towers[b.type].def;

export const buildingArrows = (b) =>
  b.type === 'base' ? CFG.base[b.level].arrows :
  b.type === 'village' ? 0 : CFG.towers[b.type].arrows;

// ---------- territory ----------

export function recalcTerritory(st, depth = 0) {
  // 1. project claims from bases + towers
  for (const t of st.tiles.values()) t.claims = [];
  for (const t of st.tiles.values()) {
    const b = t.building;
    if (!b || b.owner < 0 || b.type === 'village') continue;
    if (!st.empires[b.owner].alive) continue;
    const rad = claimRadius(b);
    for (const [q, r] of disc(t.q, t.r, rad)) {
      const ct = st.tiles.get(key(q, r));
      if (ct && !ct.claims.includes(b.owner)) ct.claims.push(b.owner);
    }
  }
  // 2. resolve ownership; building tiles always belong to their building
  for (const t of st.tiles.values()) {
    if (t.building && t.building.owner >= 0 && t.building.type !== 'village') {
      t.owner = t.building.owner;
    } else {
      t.owner = t.claims.length === 0 ? -1 : t.claims.length === 1 ? t.claims[0] : -2;
    }
  }
  // 3. villages follow the land they stand on
  for (const t of st.tiles.values()) {
    if (t.building && t.building.type === 'village') {
      const newOwner = t.owner >= 0 ? t.owner : -1;
      if (t.building.owner !== newOwner) {
        st.log.push({ ev: 'villageFlip', k: t.k, from: t.building.owner, to: newOwner });
        t.building.owner = newOwner;
      }
    }
  }
  // 4. split lands: any owned component without a base gets a free L1 base,
  //    as long as the empire still holds a base somewhere (its capital lives)
  if (depth === 0) {
    let spawned = false;
    for (const e of st.empires) {
      if (!e.alive) continue;
      if (!empireBases(st, e.idx).length) continue;
      const mine = [...st.tiles.values()].filter(t => t.owner === e.idx).map(t => t.k);
      for (const comp of components(mine)) {
        if (comp.length < CFG.autoBaseMinTiles) continue;
        const hasBase = comp.some(k => {
          const b = st.tiles.get(k).building;
          return b && b.type === 'base';
        });
        if (hasBase) continue;
        const free = comp.map(k => st.tiles.get(k)).filter(t => !t.building && !t.armyId);
        if (!free.length) continue;
        const spot = free[Math.floor(st.rng() * free.length)];
        spot.building = makeBuilding('base', e.idx, CFG.autoBaseLevel);
        spot.tree = false;
        spawned = true;
        st.log.push({ ev: 'autoBase', k: spot.k, owner: e.idx });
      }
    }
    if (spawned) return recalcTerritory(st, 1);
  }
  return st;
}

// empire falls when it holds no base: towers crumble, villages go neutral,
// armies disband. Returns true if anyone fell (territory then needs recalc).
export function checkEliminations(st) {
  let fell = false;
  for (const e of st.empires) {
    if (!e.alive) continue;
    if (empireBases(st, e.idx).length) continue;
    e.alive = false;
    fell = true;
    st.log.push({ ev: 'empireFell', empire: e.idx });
    for (const t of st.tiles.values()) {
      if (t.building && t.building.owner === e.idx) {
        if (t.building.type === 'village') t.building.owner = -1;
        else t.building = null;
      }
    }
    for (const a of [...st.armies.values()]) {
      if (a.owner === e.idx) {
        st.tiles.get(key(a.q, a.r)).armyId = 0;
        st.armies.delete(a.id);
        st.log.push({ ev: 'armyDisband', id: a.id, k: key(a.q, a.r) });
      }
    }
  }
  if (fell) recalcTerritory(st);
  return fell;
}

export function checkWinner(st) {
  const alive = st.empires.filter(e => e.alive);
  if (alive.length === 1) st.winner = alive[0].idx;
  else if (alive.length === 0) st.winner = -2; // mutual ruin
  return st.winner;
}

// ---------- income ----------

export function computeIncome(st, idx) {
  let bases = 0, villages = 0, hexCount = 0;
  for (const t of st.tiles.values()) {
    const b = t.building;
    if (b && b.owner === idx) {
      if (b.type === 'base') bases += CFG.base[b.level].income;
      else if (b.type === 'village') villages += CFG.villageIncome;
    }
    if (t.owner === idx) hexCount++;
  }
  const hexes = Math.floor(hexCount / CFG.hexIncomePer);
  return { bases, villages, hexes, hexCount, total: bases + villages + hexes };
}

export function collectIncome(st, idx) {
  const inc = computeIncome(st, idx);
  st.empires[idx].income = inc;
  st.empires[idx].coins += inc.total;
  return inc;
}

// ---------- defence auras ----------

// summed def of `idx`-owned bases/towers covering tile k (cap applies)
export function auraAt(st, k, idx) {
  const [tq, tr] = st.tiles.get(k) ? [st.tiles.get(k).q, st.tiles.get(k).r] : [0, 0];
  let aura = 0;
  for (const t of st.tiles.values()) {
    const b = t.building;
    if (!b || b.owner !== idx || b.type === 'village') continue;
    if (hexDist(t.q, t.r, tq, tr) <= claimRadius(b)) aura += buildingDef(b);
  }
  return Math.min(aura, CFG.auraCap);
}

// effective defence of whatever occupies tile k, vs an attack
export function effectiveDef(st, k) {
  const t = st.tiles.get(k);
  const a = armyAt(st, t);
  if (a) return CFG.armyDef(a.level) + auraAt(st, k, a.owner);
  if (t.building && t.building.owner >= 0) {
    const b = t.building;
    // the building's own def counts once; other friendly covers add aura
    let aura = 0;
    for (const ot of st.tiles.values()) {
      const ob = ot.building;
      if (!ob || ob.owner !== b.owner || ob.type === 'village' || ob.id === b.id) continue;
      if (hexDist(ot.q, ot.r, t.q, t.r) <= claimRadius(ob)) aura += buildingDef(ob);
    }
    return buildingDef(b) + Math.min(aura, CFG.auraCap);
  }
  return 0;
}

// ---------- build / economy actions (return error string or null) ----------

export function canBuildHere(st, idx, k) {
  const t = st.tiles.get(k);
  if (!t) return 'No land here';
  if (t.owner !== idx) return 'Must be built on your own land';
  if (t.building) return 'Tile already has a building';
  if (t.armyId) return 'An army is camped here';
  return null;
}

export function buildTower(st, idx, k, type) {
  const err = canBuildHere(st, idx, k);
  if (err) return err;
  const cost = CFG.towers[type].cost;
  const e = st.empires[idx];
  if (e.coins < cost) return 'Not enough coin';
  e.coins -= cost;
  const t = st.tiles.get(k);
  t.building = makeBuilding(type, idx);
  t.tree = false;
  recalcTerritory(st);
  st.log.push({ ev: 'built', k, type, owner: idx });
  return null;
}

export function buildVillage(st, idx, k) {
  const err = canBuildHere(st, idx, k);
  if (err) return err;
  const t0 = st.tiles.get(k);
  for (const [nq, nr] of neighbors(t0.q, t0.r)) {
    const nt = st.tiles.get(key(nq, nr));
    if (nt && nt.building && nt.building.type === 'village') {
      return 'Villages need fields — not next to another village';
    }
  }
  const cost = CFG.villageCost(villagesOwned(st, idx));
  const e = st.empires[idx];
  if (e.coins < cost) return 'Not enough coin';
  e.coins -= cost;
  const t = st.tiles.get(k);
  t.building = makeBuilding('village', idx);
  t.building.invested = cost;
  t.tree = false;
  recalcTerritory(st);
  st.log.push({ ev: 'built', k, type: 'village', owner: idx });
  return null;
}

export function upgradeBase(st, idx, k) {
  const t = st.tiles.get(k);
  const b = t && t.building;
  if (!b || b.type !== 'base' || b.owner !== idx) return 'Not your base';
  if (b.level >= 5) return 'Base is at max level';
  const cost = CFG.baseUpgrade[b.level];
  const e = st.empires[idx];
  if (e.coins < cost) return 'Not enough coin';
  e.coins -= cost;
  b.level++;
  const heal = CFG.base[b.level].hp - b.maxHp;
  b.maxHp = CFG.base[b.level].hp;
  b.hp = Math.min(b.maxHp, b.hp + Math.max(heal, 0));
  recalcTerritory(st);
  st.log.push({ ev: 'upgraded', k, type: 'base', level: b.level, owner: idx });
  return null;
}

export function upgradeTower(st, idx, k) {
  const t = st.tiles.get(k);
  const b = t && t.building;
  if (!b || b.owner !== idx || !(b.type in CFG.towers)) return 'Not your tower';
  const order = CFG.towerOrder;
  const i = order.indexOf(b.type);
  if (i >= order.length - 1) return 'Tower is at max level';
  const next = order[i + 1];
  const cost = CFG.towers[next].cost - CFG.towers[b.type].cost;
  const e = st.empires[idx];
  if (e.coins < cost) return 'Not enough coin';
  e.coins -= cost;
  b.type = next;
  b.invested += cost;
  const nhp = CFG.towers[next].hp;
  b.hp = Math.min(nhp, b.hp + (nhp - b.maxHp));
  b.maxHp = nhp;
  recalcTerritory(st);
  st.log.push({ ev: 'upgraded', k, type: next, owner: idx });
  return null;
}

export function sellBuilding(st, idx, k) {
  const t = st.tiles.get(k);
  const b = t && t.building;
  if (!b || b.owner !== idx) return 'Not your building';
  if (b.type === 'base') return 'The home base cannot be sold';
  st.empires[idx].coins += Math.floor(b.invested * CFG.sellRefund);
  t.building = null;
  recalcTerritory(st);
  checkEliminations(st);
  st.log.push({ ev: 'sold', k, owner: idx });
  return null;
}

// recruit an army of `level` within musterRadius of one of your bases
export function recruitArmy(st, idx, k, level) {
  const t = st.tiles.get(k);
  if (!t) return 'No land here';
  if (t.building || t.armyId) return 'Tile is occupied';
  if (t.owner !== idx) return 'Must muster on your own land';
  const nearBase = empireBases(st, idx).some(bt => hexDist(bt.q, bt.r, t.q, t.r) <= CFG.musterRadius);
  if (!nearBase) return 'Armies muster within ' + CFG.musterRadius + ' hexes of a base';
  const cost = CFG.armyCost(level);
  const e = st.empires[idx];
  if (e.coins < cost) return 'Not enough coin';
  e.coins -= cost;
  const a = makeArmy(idx, level, t.q, t.r);
  st.armies.set(a.id, a);
  t.armyId = a.id;
  t.tree = false;
  st.log.push({ ev: 'recruit', k, id: a.id, level, owner: idx });
  return null;
}

// ---------- arrows (end of empire turn) ----------

// every tower/base of `idx` with arrows fires at enemy ARMIES in radius.
// nearest first; overflow arrows roll to the next target. Returns shot list.
export function fireArrows(st, idx) {
  const shots = [];
  for (const t of st.tiles.values()) {
    const b = t.building;
    if (!b || b.owner !== idx || b.type === 'village') continue;
    let arrows = buildingArrows(b);
    if (!arrows) continue;
    const rad = claimRadius(b);
    const targets = [...st.armies.values()]
      .filter(a => a.owner !== idx && st.empires[a.owner].alive !== false &&
                   hexDist(a.q, a.r, t.q, t.r) <= rad)
      .sort((a, b2) => hexDist(a.q, a.r, t.q, t.r) - hexDist(b2.q, b2.r, t.q, t.r));
    for (const tgt of targets) {
      if (!arrows) break;
      while (arrows > 0 && tgt.hp > 0) {
        arrows--;
        tgt.hp -= CFG.arrowDamage;
        shots.push({ from: t.k, to: key(tgt.q, tgt.r), armyId: tgt.id, kill: tgt.hp <= 0 });
      }
      if (tgt.hp <= 0) {
        st.tiles.get(key(tgt.q, tgt.r)).armyId = 0;
        st.armies.delete(tgt.id);
        st.log.push({ ev: 'armyKilled', id: tgt.id, k: key(tgt.q, tgt.r), by: 'arrows' });
      }
    }
  }
  return shots;
}
