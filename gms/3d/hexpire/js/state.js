// Game state: plain data only (fully JSON-serializable), mutated by rules.js
// and units.js. Rendering observes it; nothing here touches three.js or DOM.
import { CFG } from './config.js';
import { key } from './hex.js';
import { mulberry32, hashStr } from './utils.js';

let nextId = 1;
export const newId = () => nextId++;

export function makeTile(q, r) {
  return {
    q, r, k: key(q, r),
    owner: -1,          // -1 neutral, -2 contested; else empire idx
    claims: [],         // empire idxs claiming this tile (recomputed)
    building: null,     // { id, type:'base'|'wood'|'stone'|'mortar'|'village', level, hp, maxHp, invested, owner }
    armyId: 0,
    tree: false,        // decorative; cleared when built on
    hVar: 0,            // per-tile visual jitter, set by mapgen
  };
}

export function makeEmpire(idx, { name, colorIdx, isAI, personality }) {
  return {
    idx, name, colorIdx,
    isAI: !!isAI,
    personality: personality || 'balanced',
    coins: CFG.startCoins,
    alive: true,
    // last computed income breakdown (for HUD)
    income: { bases: 0, villages: 0, hexes: 0, total: 0, hexCount: 0 },
  };
}

export function makeArmy(owner, level, q, r) {
  return {
    id: newId(), owner, level, q, r,
    hp: CFG.armyHp(level), maxHp: CFG.armyHp(level),
    movesLeft: 0,          // fresh recruits muster this turn
  };
}

export function makeBuilding(type, owner, level = 0) {
  let hp, invested;
  if (type === 'base') {
    hp = CFG.base[level].hp;
    invested = 0; // bases can't be sold
  } else if (type === 'village') {
    hp = CFG.villageHp; invested = 0; // set by caller (tiered price)
  } else {
    hp = CFG.towers[type].hp; invested = CFG.towers[type].cost;
  }
  return { id: newId(), type, level, hp, maxHp: hp, invested, owner };
}

export function makeState(mapDef, empiresDef, seedStr) {
  const seed = hashStr(seedStr || String(Date.now()));
  const st = {
    seed,
    rng: mulberry32(seed),      // stripped on serialize, rebuilt on load
    mapName: mapDef.name || 'Unnamed',
    mode: mapDef.mode || 'skirmish',   // 'story' | 'skirmish' | 'custom'
    storyId: mapDef.storyId || null,
    tiles: new Map(),            // key -> tile
    empires: empiresDef.map((d, i) => makeEmpire(i, d)),
    armies: new Map(),           // id -> army
    round: 1,
    turn: 0,                     // empire idx whose turn it is
    winner: -1,
    log: [],
  };
  for (const [q, r] of mapDef.land) {
    const t = makeTile(q, r);
    t.hVar = st.rng() * CFG.neutralTopVar * 2 - CFG.neutralTopVar;
    t.tree = st.rng() < (mapDef.treeChance ?? 0.13);
    st.tiles.set(t.k, t);
  }
  // starting bases
  mapDef.bases.forEach((b, i) => {
    if (i >= st.empires.length) return;
    const t = st.tiles.get(key(b[0], b[1]));
    if (!t) return;
    t.building = makeBuilding('base', i, CFG.startBaseLevel);
    t.tree = false;
  });
  // optional extra starting pieces (editor maps): [q, r, empireIdx, kind, level]
  // kind: wood|stone|mortar|village|army; empireIdx -1 = neutral (villages only)
  for (const [q, r, owner, kind, level] of mapDef.pieces || []) {
    const t = st.tiles.get(key(q, r));
    if (!t || t.building || t.armyId) continue;
    if (owner >= st.empires.length) continue;
    if (kind === 'army') {
      if (owner < 0) continue;
      const a = makeArmy(owner, Math.min(Math.max(level || 1, 1), CFG.armyMax), q, r);
      st.armies.set(a.id, a);
      t.armyId = a.id;
    } else if (kind === 'village') {
      t.building = makeBuilding('village', Math.max(owner, -1));
      t.building.invested = 10;
    } else if (kind in CFG.towers) {
      if (owner < 0) continue;
      t.building = makeBuilding(kind, owner);
    } else continue;
    t.tree = false;
  }
  return st;
}

export const tileAt = (st, q, r) => st.tiles.get(key(q, r));
export const armyAt = (st, tile) => tile && tile.armyId ? st.armies.get(tile.armyId) : null;

export function empireBases(st, idx) {
  const out = [];
  for (const t of st.tiles.values())
    if (t.building && t.building.type === 'base' && t.building.owner === idx) out.push(t);
  return out;
}

export function empireBuildings(st, idx, type = null) {
  const out = [];
  for (const t of st.tiles.values())
    if (t.building && t.building.owner === idx && (!type || t.building.type === type)) out.push(t);
  return out;
}

export function empireArmies(st, idx) {
  const out = [];
  for (const a of st.armies.values()) if (a.owner === idx) out.push(a);
  return out;
}

export function villagesOwned(st, idx) {
  let n = 0;
  for (const t of st.tiles.values())
    if (t.building && t.building.type === 'village' && t.building.owner === idx) n++;
  return n;
}

// ---------- serialization (auto-save / resume) ----------

export function serialize(st) {
  return JSON.stringify({
    v: 1,
    seed: st.seed, mapName: st.mapName, mode: st.mode, storyId: st.storyId,
    round: st.round, turn: st.turn, winner: st.winner,
    empires: st.empires,
    tiles: [...st.tiles.values()],
    armies: [...st.armies.values()],
    nextId,
  });
}

export function deserialize(json) {
  const d = JSON.parse(json);
  const st = {
    seed: d.seed, rng: mulberry32((d.seed ^ (d.round * 2654435761)) >>> 0),
    mapName: d.mapName, mode: d.mode, storyId: d.storyId,
    round: d.round, turn: d.turn, winner: d.winner,
    empires: d.empires,
    tiles: new Map(d.tiles.map(t => [t.k, t])),
    armies: new Map(d.armies.map(a => [a.id, a])),
    log: [],
  };
  nextId = d.nextId || 100000;
  return st;
}
