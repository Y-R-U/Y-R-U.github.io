// The god-hand: sculpt strokes (faith-metered), leyline painting, and the
// miracles — Rain, Sprout, Smite, Sunburst. Cooldowns + the active-rain field
// that farms and burning buildings check.

import { CFG, MIRACLES } from './config.js';
import * as FX from './fx.js';
import { clamp, dist2 } from './utils.js';

export function createPowers(game) {
  const P = {
    mode: 'hand',
    sculptTool: 'raise',      // raise | lower | flatten | smooth
    leyTool: 'draw',          // draw | erase
    brush: CFG.sculpt.r0,
    cd: {}, rains: [], sunburstT: 0,
    anchorH: null, armedMiracle: null,
  };
  const { T, W } = game;

  P.setMode = (m) => { P.mode = m; P.armedMiracle = null; };

  // ── sculpting ───────────────────────────────────────────────────────────────
  P.beginStroke = (wx, wz) => { P.anchorH = T.heightAt(wx, wz); };
  P.applySculpt = (wx, wz, dt) => {
    if (game.state.faith <= 0.2) { game.ui?.needFaith(); return 0; }
    const vol = T.sculpt(wx, wz, P.brush, P.sculptTool, dt, P.anchorH);
    if (vol > 0) {
      const cost = vol * CFG.sculpt.cost;
      game.state.faith = Math.max(0, game.state.faith - cost);
      game.AU?.rumble();
    }
    return vol;
  };
  P.applyLey = (wx, wz) => {
    const erase = P.leyTool === 'erase';
    if (!erase && game.state.faith < 0.5) { game.ui?.needFaith(); return; }
    const n = T.paintLey(wx, wz, erase);
    if (n && !erase) {
      game.state.faith = Math.max(0, game.state.faith - n * 0.5);
      game.AU?.sfx.ley();
    }
  };

  // ── miracles ────────────────────────────────────────────────────────────────
  P.miracleReady = (name) => {
    const def = MIRACLES[name];
    return game.state.age >= def.age && !(P.cd[name] > 0) && game.state.faith >= def.cost;
  };
  P.cast = (name, wx = 0, wz = 0) => {
    const def = MIRACLES[name];
    if (!def || game.state.age < def.age) return false;
    if (P.cd[name] > 0) { game.ui?.toast('The heavens are still gathering…'); return false; }
    if (!game.spendFaith(def.cost)) { game.ui?.needFaith(); return false; }
    P.cd[name] = def.cd;
    if (name === 'rain') {
      FX.startRain(wx, wz, def.r, 18);
      P.rains.push({ x: wx, z: wz, r: def.r, until: 18 });
      game.AU?.sfx.rain();
      // berries in the rain ripen at once
      for (const b of W.bushes)
        if (dist2(b.x, b.z, wx, wz) < def.r * def.r && b.food <= 0) { b.food = CFG.econ.bushFood; b.berries.visible = true; }
    } else if (name === 'sprout') {
      W.sproutAt(wx, wz, def.r, 9);
      FX.ringPulse(wx, wz, 0x86c26a, def.r);
      game.AU?.sfx.sprout();
    } else if (name === 'smite') {
      FX.lightning(wx, wz);
      game.AU?.sfx.thunder();
      const hits = game.R?.smiteAt(wx, wz, 3.2) || 0;
      // a tree in the blast becomes firewood
      const tr = W.nearestTree(wx, wz, 2.6, false);
      if (tr) W.fellTree(tr, true);
      // careless gods hurt their own
      for (const v of game.V.list) {
        if (v.dead) continue;
        if (dist2(v.x, v.z, wx, wz) < 3.2 * 3.2) {
          game.V.damage(v, 60);
          game.state.faith = Math.max(0, game.state.faith - 5);
          game.ui?.toast('Your folk cry out — the bolt struck one of your own!', true);
        }
      }
      if (hits > 0) game.addFaith(2, wx, T.heightAt(wx, wz) + 3, wz);
    } else if (name === 'sunburst') {
      P.sunburstT = def.dur;
      FX.ringPulse(T.camp.x, T.camp.z, 0xffe8a0, 22);
      game.AU?.sfx.sunburst();
      game.ui?.toast('☀️ The sun blazes — your folk work with holy vigour!');
    }
    return true;
  };

  P.rainBoostAt = (x, z) => P.rains.some(r => dist2(x, z, r.x, r.z) < r.r * r.r);

  P.tick = (dt) => {
    for (const k of Object.keys(P.cd)) if (P.cd[k] > 0) P.cd[k] -= dt;
    for (const r of [...P.rains]) {
      r.until -= dt;
      if (r.until <= 0) P.rains.splice(P.rains.indexOf(r), 1);
    }
    if (P.sunburstT > 0) P.sunburstT -= dt;
  };

  P.serialize = () => ({ cd: P.cd, sb: +P.sunburstT.toFixed(1) });
  P.loadState = (d) => { P.cd = d.cd || {}; P.sunburstT = d.sb || 0; };

  return P;
}
