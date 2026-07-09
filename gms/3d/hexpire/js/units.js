// Army logic: reachability, movement, merging, and combat resolution.
import { CFG } from './config.js';
import { key, unkey, neighbors, bfs, pathTo } from './hex.js';
import { armyAt } from './state.js';
import { recalcTerritory, checkEliminations, checkWinner, effectiveDef } from './rules.js';

// What an army can do with its remaining moves.
// Returns { dist, moves:Set<k>, merges:Map<k,cost>, attacks:Map<k,{cost,via}> }
//  - moves: free tiles it can stand on
//  - merges: friendly-army tiles it can join (level sum <= max)
//  - attacks: enemy army/building tiles; cost includes the +1 attack point;
//    via = tile key to stand on when striking (its own tile if adjacent)
export function moveOptions(st, army) {
  const fromK = key(army.q, army.r);
  const mp = army.movesLeft;
  // armies march THROUGH friendly armies but can only STAND on free tiles
  const passable = (k) => {
    const t = st.tiles.get(k);
    if (!t || t.building) return false;
    if (!t.armyId) return true;
    const a = st.armies.get(t.armyId);
    return a && a.owner === army.owner;
  };
  const standable = (k) => {
    const t = st.tiles.get(k);
    return !!t && !t.building && !t.armyId;
  };
  const dist = bfs(fromK, mp, passable);
  const moves = new Set();
  const merges = new Map();
  const attacks = new Map();

  for (const [k, c] of dist) {
    if (k !== fromK && c <= mp && standable(k)) moves.add(k);
  }
  // merge / attack targets are adjacent to any reachable standing spot
  const standing = [[fromK, 0], ...[...dist].filter(([k]) => k !== fromK)];
  for (const [k, c] of standing) {
    if (c >= mp && k !== fromK) continue; // need spare point to act? merging costs the step itself
    const [q, r] = unkey(k);
    for (const [nq, nr] of neighbors(q, r)) {
      const nk = key(nq, nr);
      const t = st.tiles.get(nk);
      if (!t) continue;
      const other = armyAt(st, t);
      if (other && other.owner === army.owner && other.id !== army.id) {
        const cost = c + 1; // step onto their tile
        if (cost <= mp && other.level + army.level <= CFG.armyMax) {
          if (!merges.has(nk) || merges.get(nk).cost > cost) merges.set(nk, { cost, via: k });
        }
      } else if ((other && other.owner !== army.owner) ||
                 (t.building && t.building.owner >= 0 && t.building.owner !== army.owner)) {
        const cost = c + 1; // attack costs one move point
        // must be able to actually stand on the striking tile
        if (cost <= mp && (k === fromK || standable(k))) {
          if (!attacks.has(nk) || attacks.get(nk).cost > cost) attacks.set(nk, { cost, via: k });
        }
      }
    }
  }
  return { dist, moves, merges, attacks };
}

// path (list of keys, excluding start) to a free destination
export function pathToTile(st, army, destK) {
  const { dist } = moveOptions(st, army);
  return pathTo(dist, destK);
}

// apply a move along path; caller animates. path excludes start tile.
export function applyMove(st, army, path) {
  if (!path || !path.length) return;
  st.tiles.get(key(army.q, army.r)).armyId = 0;
  const [q, r] = unkey(path[path.length - 1]);
  army.q = q; army.r = r;
  st.tiles.get(key(q, r)).armyId = army.id;
  army.movesLeft -= path.length;
  st.log.push({ ev: 'move', id: army.id, path });
}

// merge `army` into the friendly army on destK (already adjacent-reachable).
// Combined group loses a turn's edge: moves = mover's remaining - cost - 1.
export function applyMerge(st, army, destK, cost) {
  const target = armyAt(st, st.tiles.get(destK));
  if (!target) return 'No army to merge with';
  if (target.level + army.level > CFG.armyMax) return 'Merged army would exceed level ' + CFG.armyMax;
  st.tiles.get(key(army.q, army.r)).armyId = 0;
  st.armies.delete(army.id);
  const remaining = Math.max(0, army.movesLeft - cost);
  target.level += army.level;
  const nmax = CFG.armyHp(target.level);
  target.hp = Math.min(target.hp + army.hp, nmax);
  target.maxHp = nmax;
  target.movesLeft = Math.max(0, Math.min(target.movesLeft, remaining) - 1);
  st.log.push({ ev: 'merge', into: target.id, gone: army.id, k: destK });
  return null;
}

// resolve one attack from army (standing adjacent) onto tile targetK.
// Returns event { dmg, repelled, killedArmy?, killedBuilding?, empireFell?, winner? }
export function applyAttack(st, army, targetK) {
  army.movesLeft -= 1;
  const t = st.tiles.get(targetK);
  const defender = armyAt(st, t);
  const atk = CFG.armyAtk(army.level);
  const def = effectiveDef(st, targetK);
  const ev = { attacker: army.id, targetK, dmg: 0, repelled: false };

  // dmg = attack − defence; near-misses land a glancing blow so heavily
  // shielded targets can still be ground down — only a defence advantage
  // of 3+ repels outright
  let dmg = atk - def;
  if (dmg <= 0 && atk >= def - CFG.glancingMargin) dmg = 1;

  if (dmg <= 0) {
    ev.repelled = true;
    army.hp -= CFG.repelDamage;
    if (army.hp <= 0) {
      st.tiles.get(key(army.q, army.r)).armyId = 0;
      st.armies.delete(army.id);
      ev.attackerDied = true;
      st.log.push({ ev: 'armyKilled', id: army.id, k: key(army.q, army.r), by: 'repel' });
    }
    st.log.push({ ev: 'repelled', id: army.id, k: targetK });
    return ev;
  }

  ev.dmg = dmg;
  if (defender) {
    defender.hp -= ev.dmg;
    if (defender.hp <= 0) {
      t.armyId = 0;
      st.armies.delete(defender.id);
      ev.killedArmy = defender.id;
      st.log.push({ ev: 'armyKilled', id: defender.id, k: targetK, by: army.id });
    }
  } else if (t.building) {
    t.building.hp -= ev.dmg;
    if (t.building.hp <= 0) {
      ev.killedBuilding = t.building.type;
      ev.buildingOwner = t.building.owner;
      st.log.push({ ev: 'razed', k: targetK, type: t.building.type, owner: t.building.owner, by: army.owner });
      t.building = null;
      recalcTerritory(st);
      if (checkEliminations(st)) ev.empireFell = true;
      const w = checkWinner(st);
      if (w !== -1) ev.winner = w;
    }
  }
  return ev;
}

export function resetMoves(st, idx) {
  for (const a of st.armies.values()) if (a.owner === idx) a.movesLeft = CFG.armyMoves;
}
