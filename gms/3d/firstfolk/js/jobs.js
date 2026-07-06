// Task selection — the Settlers brain. Employed folk serve their building
// (farmer/forester/quarrier/priest); generalists weigh the village's needs:
// feed construction sites, haul loose goods, forage when food runs low, chop
// when wood runs low, otherwise wander home. Claims (claimedBy / slot counts)
// stop six villagers dog-piling one bush.

import { CFG } from './config.js';
import * as FX from './fx.js';
import { rand, pick, dist2 } from './utils.js';
import { worldToCell, cellToWorld, inIsle, cellIdx } from './terrain.js';

export function dispatch(game, v) {
  const { V } = game;
  // finish what you're holding first
  if (v.carry) { V.assignTask(v, deliverTask(game, v)); return; }
  switch (v.job) {
    case 'farmer': return farmerThink(game, v);
    case 'forester': return foresterThink(game, v);
    case 'quarrier': return quarrierThink(game, v);
    case 'priest': return priestThink(game, v);
    default: return generalistThink(game, v);
  }
}

function deliverTask(game, v) {
  const s = game.nearestStock(v.x, v.z);
  return { x: s.x + rand(-1.5, 1.5), z: s.z + rand(-1.5, 1.5), dur: 0.35, anim: 'idle', onDone: () => { game.V.deliver(v); } };
}

// ── generalists ───────────────────────────────────────────────────────────────
function generalistThink(game, v) {
  const { V, W, T, B, stocks } = game;

  // 1. construction: haul materials from the stockpile to a site
  for (const s of B.sitesNeedingMaterial()) {
    const type = s.nextNeed();
    if (!type || stocks[type] <= 0) continue;
    const take = Math.min(4, s.remaining(type), stocks[type]);
    stocks[type] -= take;
    s.incoming[type] = (s.incoming[type] || 0) + take;
    const stock = game.nearestStock(v.x, v.z);
    let banked = true;      // claim is "spent" once goods are in hand
    V.assignTask(v, {
      x: stock.x + rand(-1.5, 1.5), z: stock.z + rand(-1.5, 1.5), dur: 0.35, anim: 'idle',
      release: () => { if (banked) { s.incoming[type] -= take; stocks[type] += take; } },
      onDone: () => {
        banked = false;
        V.giveCarry(v, type, take);
        V.assignTask(v, {
          x: s.x + rand(-1, 1), z: s.z + rand(-1, 1), dur: 0.35, anim: 'idle', relax: false,
          release: () => { s.incoming[type] -= take; },   // dropped en route → drop mesh spawned by dropCarry
          onDone: () => { s.incoming[type] -= take; s.receive(type, take); v.carry = null; if (v.carryMesh) { v.rig.group.remove(v.carryMesh); v.carryMesh = null; } },
        });
        return 'chained';
      },
    });
    return;
  }

  // 2. construction: swing hammers on a fed site
  for (const s of game.B.sitesNeedingWork()) {
    if (s.workers >= 3) continue;
    s.workers++;
    V.assignTask(v, {
      x: s.x + rand(-s.sizeW / 2 - 1, s.sizeW / 2 + 1), z: s.z + s.sizeW / 2 + 0.8, dur: 1.2, anim: 'hammer',
      release: () => { s.workers--; },
      onSwing: () => { game.AU?.sfx.hammer(); FX.burst(s.x + rand(-1, 1), s.y + 1, s.z + rand(-1, 1), { color: 0xd8c49a, n: 4, spread: 0.7, up: 1.4, size: 0.3, life: 0.5 }); },
      onDone: () => {
        s.work += 1.2;
        if (s.state === 'building' && s.work < s.workNeed) return 'keep';
        s.workers--;
        s.tryComplete();
        return null;
      },
    });
    return;
  }

  // 3. haul loose goods (chopped logs, quarry chips, raid leftovers)
  let drop = null, bd = 1e9;
  for (const d of W.drops) {
    if (d.claimedBy) continue;
    const dd = dist2(v.x, v.z, d.x, d.z);
    if (dd < bd) { bd = dd; drop = d; }
  }
  if (drop) {
    drop.claimedBy = v;
    V.assignTask(v, {
      x: drop.x, z: drop.z, dur: 0.45, anim: 'sow',
      release: () => { if (drop.claimedBy === v) drop.claimedBy = null; },
      onDone: () => {
        if (W.drops.includes(drop)) {
          W.removeDrop(drop);
          game.V.giveCarry(v, drop.type, drop.n);
          V.assignTask(v, deliverTask(game, v));
          return 'chained';
        }
        return null;
      },
    });
    return;
  }

  // 4. food before comfort
  const pop = V.pop();
  if (stocks.food < pop * 2.2) {
    const bush = W.nearestBush(v.x, v.z);
    if (bush) {
      bush.claimedBy = v;
      V.assignTask(v, {
        x: bush.x + rand(-1, 1), z: bush.z + rand(-1, 1), dur: CFG.econ.forageTime, anim: 'sow',
        release: () => { if (bush.claimedBy === v) bush.claimedBy = null; },
        onDone: () => {
          bush.claimedBy = null;
          if (bush.food > 0) {
            const n = bush.food;
            bush.food = 0;
            bush.berries.visible = false;
            game.V.giveCarry(v, 'food', n);
            V.assignTask(v, deliverTask(game, v));
            return 'chained';
          }
          return null;
        },
      });
      return;
    }
  }

  // 5. wood when the pile runs low
  if (stocks.wood < game.woodDemand()) {
    if (chopNearestTree(game, v, 999)) return;
  }

  // 6. wander home-ish (or along a leyline — they like the glow)
  if (Math.random() < 0.5) {
    const s = game.safeSpot();
    game.V.walkTo(v, s.x + rand(-9, 9), s.z + rand(-9, 9));
  }
}

export function chopNearestTree(game, v, maxD, fromX = null, fromZ = null) {
  const { V, W } = game;
  const tree = W.nearestTree(fromX ?? v.x, fromZ ?? v.z, maxD);
  if (!tree) return false;
  tree.claimedBy = v;
  V.assignTask(v, {
    x: tree.x + rand(-1.2, 1.2), z: tree.z + rand(-1.2, 1.2), dur: CFG.econ.chopTime, anim: 'chop',
    release: () => { if (tree.claimedBy === v) tree.claimedBy = null; },
    onSwing: () => { game.AU?.sfx.chop(); FX.burst(tree.x, tree.baseH + 1, tree.z, { color: 0xc9a86a, n: 5, spread: 1, up: 1.6, size: 0.3, life: 0.55 }); },
    onDone: () => {
      tree.claimedBy = null;
      if (tree.stage === 'grown') { W.fellTree(tree, true); game.AU?.sfx.treeFall(); }
      return null;
    },
  });
  return true;
}

// ── employed folk ─────────────────────────────────────────────────────────────
function farmerThink(game, v) {
  const b = v.employedAt;
  if (!b || b.state !== 'done') { game.V.retrain(v, 'villager'); return; }
  // ripe plots first, then empty ones
  const plot = b.plots.find(p => p.state === 'ripe' && !p.claimedBy) || b.plots.find(p => p.state === 'empty' && !p.claimedBy);
  if (!plot) { idleNear(game, v, b, 4); return; }
  plot.claimedBy = v;
  if (plot.state === 'ripe') {
    game.V.assignTask(v, {
      x: plot.x, z: plot.z, dur: CFG.econ.harvestTime, anim: 'sow',
      release: () => { if (plot.claimedBy === v) plot.claimedBy = null; },
      onDone: () => {
        plot.claimedBy = null;
        if (plot.state !== 'ripe') return null;
        b.clearPlot(plot);
        game.V.giveCarry(v, 'food', CFG.econ.plotFood);
        game.V.assignTask(v, deliverTask(game, v));
        return 'chained';
      },
    });
  } else {
    game.V.assignTask(v, {
      x: plot.x, z: plot.z, dur: CFG.econ.sowTime, anim: 'sow',
      release: () => { if (plot.claimedBy === v) plot.claimedBy = null; },
      onDone: () => { plot.claimedBy = null; if (plot.state === 'empty') b.sowPlot(plot); return null; },
    });
  }
}

function foresterThink(game, v) {
  const b = v.employedAt;
  if (!b || b.state !== 'done') { game.V.retrain(v, 'villager'); return; }
  // fell mature trees near the lodge
  if (chopNearestTree(game, v, 20, b.x, b.z)) return;
  // otherwise plant a sapling on a free cell near the lodge
  const { T, W } = game;
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), r = rand(5, 16);
    const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
    const { cx, cz } = worldToCell(x, z);
    if (!inIsle(cx, cz) || T.obstacle[cellIdx(cx, cz)] !== 0 || !T.walkable(cx, cz)) continue;
    game.V.assignTask(v, {
      x, z, dur: 2.2, anim: 'sow',
      onDone: () => {
        const c = worldToCell(x, z);
        if (T.obstacle[cellIdx(c.cx, c.cz)] === 0) { W.plantSapling(x, z); FX.burst(x, T.heightAt(x, z) + 0.4, z, { color: 0x86c26a, n: 6, spread: 0.5, up: 1.2, size: 0.3, life: 0.6 }); }
        return null;
      },
    });
    return;
  }
  idleNear(game, v, b, 6);
}

function quarrierThink(game, v) {
  const b = v.employedAt;
  if (!b || b.state !== 'done') { game.V.retrain(v, 'villager'); return; }
  const f = b.facePoint || { x: b.x, z: b.z };
  game.V.assignTask(v, {
    x: f.x + rand(-1.2, 1.2), z: f.z + rand(-1.2, 1.2), dur: CFG.econ.chipTime, anim: 'chop', relax: false,
    onSwing: () => { game.AU?.sfx.chip(); FX.burst(f.x, game.T.heightAt(f.x, f.z) + 0.8, f.z, { color: 0xa8a8a8, n: 5, spread: 1, up: 1.5, size: 0.3, life: 0.5 }); },
    onDone: () => {
      game.V.giveCarry(v, 'stone', CFG.econ.chipStone);
      game.V.assignTask(v, deliverTask(game, v));
      return 'chained';
    },
  });
}

function priestThink(game, v) {
  const b = v.employedAt;
  if (!b || b.state !== 'done') { game.V.retrain(v, 'villager'); return; }
  if (dist2(v.x, v.z, b.x, b.z) > 36) { game.V.walkTo(v, b.x + rand(-3, 3), b.z + b.sizeW / 2 + rand(1, 3)); return; }
  // daytime devotions: a slow trickle of faith
  v.anim = 'pray';
  game.addFaith(0.12);
  if (Math.random() < 0.35) FX.moteAt(v.x, game.T.heightAt(v.x, v.z) + 1.6, v.z);
}

function idleNear(game, v, b, r) {
  if (!v.path && Math.random() < 0.4) game.V.walkTo(v, b.x + rand(-r, r), b.z + rand(-r, r));
}
