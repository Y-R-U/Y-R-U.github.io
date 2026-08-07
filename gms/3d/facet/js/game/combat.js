// Swings, bolts, damage, auto-retaliate and death.
//
// The effects share props.js's unlit swarm, so a bolt in flight and a sword arc cost no draw call
// of their own. Damage numbers and the target plate are DOM projected off the camera — text in the
// scene would mean a font atlas, and there is no texture budget here to spend on one.

import * as THREE from 'three';
import { Mesh, prism, spire, blob, matrix, mix, rgb } from '../world/shape.js';
import { palette } from '../world/palette.js';
import { fx, pose, enemies, enemyOf, hurtEnemy } from './props.js';

const TAU = Math.PI * 2;
const UNARMED = { style: 'melee', range: 1.7, swing: 1.9, min: 1, max: 4, mana: 0 };

const emit = (c, f) => { const k = rgb(c); return [k[0] * f, k[1] * f, k[2] * f]; };

function arcGeo(p) {
  const m = new Mesh();
  const bright = mix(p.build.wall[1], p.lit.warm, 0.35);
  const n = 9, span = 2.3, r0 = 0.72, r1 = 1.42;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const a0 = -span / 2 + t0 * span, a1 = -span / 2 + t1 * span;
    const w0 = Math.sin(t0 * Math.PI), w1 = Math.sin(t1 * Math.PI);
    const inner = a => [Math.sin(a) * r0, 0, Math.cos(a) * r0];
    const outer = (a, w) => [Math.sin(a) * (r0 + (r1 - r0) * w), 0, Math.cos(a) * (r0 + (r1 - r0) * w)];
    m.quad(inner(a0), inner(a1), outer(a1, w1), outer(a0, w0), emit(bright, 0.35 + w0 * 0.75));
  }
  return m.geo();
}

function boltGeo(col) {
  const m = new Mesh();
  m.add(prism(5, 0.115, 0.018, 0.44, { rot: 0.4, col: emit(col, 1.2) }), matrix({ pos: [0, 0, -0.08], rx: 1.5708 }));
  m.add(spire(5, 0.082, 0.55, { curve: 1.45, rings: 2, col: emit(col, 0.4) }), matrix({ pos: [0, 0, -0.1], rx: -1.5708 }));
  return m.geo();
}

function burstGeo(col) {
  return blob(0.26, 0, { jitter: 0.4, stretch: 0.8, col: emit(col, 0.95) });
}

export function create(game, app, world) {
  const p = palette(world.paletteId);
  const boltCol = '#a8d8ff';

  const arcs = [];
  const bolts = [];
  const bursts = [];
  for (let i = 0; i < 3; i++) arcs.push({ part: fx.glow.add(arcGeo(p)), t: 0 });
  for (let i = 0; i < 5; i++) bolts.push({ part: fx.glow.add(boltGeo(boltCol)), live: false });
  for (let i = 0; i < 4; i++) bursts.push({ part: fx.glow.add(burstGeo(mix(p.lit.warm, p.accent, 0.4))), t: 0 });

  const dom = makeDom();
  const S = {
    target: null, swing: 0, walk: false, respawn: 0, manaNag: 0,
    pops: [], t: 0,
  };

  const terrain = world.terrain;
  const weapon = () => game.equip.weapon()?.weapon || UNARMED;
  const hasWalker = () => !!(game.control && game.control.player);
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function engage(o) {
    const e = enemyOf(o);
    if (!e || !e.alive || !game.player.alive) return;
    S.target = e;
    e.aggro = true;
    S.walk = !hasWalker();
    game.player.target = e;
    game.player.inCombat = Math.max(game.player.inCombat, 6);
    // engage() is also the programmatic entry point, so it has to close the distance itself —
    // a tap already walked you in, a scripted engage from across the green has not.
    if (!S.walk && e.inter && flat(game.player.pos, e.pos) > weapon().range) {
      game.control.goTo(e.inter.pos, e.inter);
    }
  }

  function stop() {
    S.target = null;
    S.walk = false;
    game.player.target = null;
  }

  function pop(pos, text, colour, dy = 1.5) {
    S.pops.push({ x: pos.x, y: pos.y + dy, z: pos.z, text, colour, t: 0 });
    if (S.pops.length > dom.pops.length) S.pops.shift();
  }

  function spark(pos, y = 0.8) {
    const b = bursts.find(q => q.t <= 0);
    if (!b) return;
    b.t = 0.3;
    b.x = pos.x; b.y = pos.y + y; b.z = pos.z;
  }

  function damageEnemy(e, raw) {
    const dmg = Math.max(1, Math.round(raw));
    const killed = hurtEnemy(e, dmg);
    pop(e.pos, String(dmg), '#ffe9a8', 1.25);
    spark(e.pos, 0.75);
    game.emit('damage', { side: 'enemy', to: 'enemy', amount: dmg, id: e.inter?.id });
    game.player.inCombat = 6;
    const w = weapon();
    game.addXp(w.style === 'magic' ? 'magic' : 'melee', dmg);
    if (killed) {
      game.addXp(w.style === 'magic' ? 'magic' : 'melee', 12);
      game.addXp('vitality', 6);
      game.emit('toast', { text: 'The boar drops.' });
      if (S.target === e) stop();
    }
    return killed;
  }

  function damagePlayer(raw, from) {
    const pl = game.player;
    if (!pl.alive) return;
    const dmg = Math.max(1, Math.round(raw - (pl.armour || 0) * 0.3));
    pl.hp -= dmg;
    pl.inCombat = 6;
    pop(pl.pos, String(dmg), '#ff8f7a', 2.0);
    game.emit('damage', { side: 'player', to: 'player', amount: dmg });
    game.emit('change');
    if (!S.target && from) engage(from);
    if (pl.hp <= 0) die();
  }

  function die() {
    const pl = game.player;
    pl.hp = 0;
    pl.alive = false;
    stop();
    for (const e of enemies()) e.aggro = false;
    S.respawn = 2.2;
    game.emit('death', { who: 'player' });
    game.emit('toast', { text: 'You black out. The village will take you back.' });
    game.emit('change');
  }

  function respawn() {
    const pl = game.player;
    // control.js reads a *new* Vector3 as a cut rather than a walk, which is exactly what a
    // respawn is — writing into the old one would leave the character strolling home from death.
    const home = game.spawnPoint;
    if (home) pl.pos = new THREE.Vector3(home.x, terrain.heightAt(home.x, home.z), home.z);
    pl.hp = pl.hpMax;
    pl.mp = pl.mpMax;
    pl.alive = true;
    pl.inCombat = 0;
    game.emit('toast', { text: 'You wake at the village centre.' });
    game.emit('change');
  }

  function fire(e) {
    const w = weapon();
    const pl = game.player;
    if (w.style === 'magic') {
      if (pl.mp < (w.mana || 0)) {
        if (S.manaNag <= 0) { S.manaNag = 3; game.emit('toast', { text: 'Not enough mana.' }); }
        return;
      }
      pl.mp -= w.mana || 0;
      game.emit('change');
      const b = bolts.find(q => !q.live);
      const dmg = w.min + Math.random() * (w.max - w.min);
      if (!b) { damageEnemy(e, dmg); return; }
      b.live = true;
      b.x = pl.pos.x; b.y = pl.pos.y + 1.1; b.z = pl.pos.z;
      b.target = e; b.dmg = dmg; b.speed = 17;
    } else {
      const a = arcs.find(q => q.t <= 0) || arcs[0];
      a.t = 0.26;
      a.yaw = Math.atan2(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
      a.x = pl.pos.x; a.y = pl.pos.y + 0.95; a.z = pl.pos.z;
      damageEnemy(e, w.min + Math.random() * (w.max - w.min));
    }
    game.emit('swing', { style: w.style, dur: w.style === 'magic' ? 0.6 : 0.45 });
    pl.inCombat = 6;
  }

  function stepEffects(dt) {
    for (const a of arcs) {
      if (a.t <= 0) { fx.glow.hide(a.part); continue; }
      a.t -= dt;
      const k = Math.max(0, a.t / 0.26);
      const sweep = (1 - k) * 1.5 - 0.75;
      fx.glow.write(a.part, pose(a.x, a.y, a.z, -0.55, a.yaw + sweep, 0, 0.8 + (1 - k) * 0.45));
      fx.glow.scaleColor(a.part, Math.pow(k, 0.7) * 1.2);
    }

    for (const b of bolts) {
      if (!b.live) { fx.glow.hide(b.part); continue; }
      const e = b.target;
      const tx = e.pos.x, ty = e.pos.y + 0.7, tz = e.pos.z;
      const dx = tx - b.x, dy = ty - b.y, dz = tz - b.z;
      const d = Math.hypot(dx, dy, dz);
      const step = b.speed * dt;
      if (d <= step + 0.35 || !e.alive) {
        b.live = false;
        fx.glow.hide(b.part);
        if (e.alive) { damageEnemy(e, b.dmg); spark(e.pos, 0.8); }
        continue;
      }
      b.x += (dx / d) * step; b.y += (dy / d) * step; b.z += (dz / d) * step;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.asin(THREE.MathUtils.clamp(dy / d, -1, 1));
      fx.glow.write(b.part, pose(b.x, b.y, b.z, pitch, yaw, S.t * 6, 1));
    }

    for (const b of bursts) {
      if (b.t <= 0) { fx.glow.hide(b.part); continue; }
      b.t -= dt;
      const k = Math.max(0, b.t / 0.3);
      fx.glow.write(b.part, pose(b.x, b.y, b.z, 0, S.t * 3, 0, 0.5 + (1 - k) * 1.1));
      fx.glow.scaleColor(b.part, k * k * 1.15);
    }
  }

  const _pv = new THREE.Vector3();
  function project(x, y, z) {
    _pv.set(x, y, z).project(app.camera);
    const r = app.renderer.domElement.getBoundingClientRect();
    return {
      x: r.left + (_pv.x * 0.5 + 0.5) * r.width,
      y: r.top + (-_pv.y * 0.5 + 0.5) * r.height,
      on: _pv.z > -1 && _pv.z < 1,
    };
  }

  function stepDom(dt) {
    for (let i = S.pops.length - 1; i >= 0; i--) {
      S.pops[i].t += dt;
      if (S.pops[i].t > 1.15) S.pops.splice(i, 1);
    }
    for (let i = 0; i < dom.pops.length; i++) {
      const el = dom.pops[i], q = S.pops[i];
      if (!q) { el.style.opacity = '0'; continue; }
      const s = project(q.x, q.y, q.z);
      const k = q.t / 1.15;
      el.textContent = q.text;
      el.style.color = q.colour;
      el.style.opacity = String(s.on ? Math.max(0, 1 - k * k * 1.15) : 0);
      el.style.transform = `translate(-50%,-50%) scale(${1.28 - k * 0.42})`;
      el.style.left = `${s.x}px`;
      el.style.top = `${s.y - k * 46}px`;
    }

    const e = S.target;
    if (e && e.alive) {
      const s = project(e.pos.x, e.pos.y + 1.35, e.pos.z);
      dom.plate.style.opacity = s.on ? '1' : '0';
      dom.plate.style.left = `${s.x}px`;
      dom.plate.style.top = `${s.y}px`;
      dom.fill.style.width = `${Math.max(0, (e.hp / e.hpMax) * 100)}%`;
    } else {
      dom.plate.style.opacity = '0';
    }
  }

  function update(dt) {
    if (!fx.ready) return;
    if (!game.controlled) { if (dom.root.style.display !== 'none') dom.root.style.display = 'none'; return; }
    dom.root.style.display = '';
    S.t += dt;
    S.manaNag = Math.max(0, S.manaNag - dt);

    const pl = game.player;
    if (!pl.alive) {
      S.respawn -= dt;
      if (S.respawn <= 0) respawn();
      stepEffects(dt);
      stepDom(dt);
      fx.glow.flush(true);
      return;
    }

    const w = weapon();
    const e = S.target;
    if (e && !e.alive) stop();

    if (S.target) {
      const tgt = S.target;
      if (tgt.inter) tgt.inter.reach = Math.max(1.2, w.range * 0.85);
      const d = flat(pl.pos, tgt.pos);
      if (d > w.range + 7) {
        stop();
      } else {
        // Without a real controller nothing walks the player in, so combat closes the gap itself.
        if (S.walk && !hasWalker() && d > w.range * 0.8) {
          const step = Math.min(d - w.range * 0.7, 3.4 * dt);
          const nx = pl.pos.x + ((tgt.pos.x - pl.pos.x) / d) * step;
          const nz = pl.pos.z + ((tgt.pos.z - pl.pos.z) / d) * step;
          pl.pos.set(nx, terrain.heightAt(nx, nz), nz);
        }
        S.swing -= dt;
        if (d <= w.range && S.swing <= 0) { S.swing = w.swing; fire(tgt); }
        else if (d > w.range) S.swing = Math.min(S.swing, w.swing * 0.35);
      }
    } else {
      S.swing = Math.max(0, S.swing - dt);
    }

    for (const q of enemies()) {
      if (!q.alive || !q.aggro) continue;
      const d = flat(pl.pos, q.pos);
      if (d > q.range + 0.55) { q.cool = Math.min(q.cool, q.swing * 0.4); continue; }
      q.cool -= dt;
      if (q.cool > 0) continue;
      q.cool = q.swing;
      spark(pl.pos, 1.0);
      damagePlayer(q.dmg[0] + Math.random() * (q.dmg[1] - q.dmg[0]), q);
    }

    stepEffects(dt);
    stepDom(dt);
    fx.glow.flush(true);
  }

  return { update, engage, stop, get target() { return S.target; } };
}

// A self-contained overlay. ui.css belongs to someone else, so every rule here is inline and the
// layer never takes a pointer event.
function makeDom() {
  const root = document.createElement('div');
  root.id = 'fx-combat';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:24;overflow:hidden;display:none;'
    + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';

  const pops = [];
  for (let i = 0; i < 14; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;opacity:0;font-weight:800;font-size:19px;line-height:1;'
      + 'text-shadow:0 2px 5px rgba(6,10,14,.85),0 0 2px rgba(6,10,14,.9);will-change:transform,opacity;';
    root.appendChild(el);
    pops.push(el);
  }

  const plate = document.createElement('div');
  plate.style.cssText = 'position:absolute;opacity:0;transform:translate(-50%,-100%);'
    + 'padding:3px 7px 5px;border-radius:7px;background:rgba(10,14,18,.52);'
    + 'backdrop-filter:blur(2px);text-align:center;min-width:88px;';
  const name = document.createElement('div');
  name.textContent = 'Wild boar';
  name.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:.04em;color:#f0e6d8;margin-bottom:3px;';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:4px;border-radius:3px;background:rgba(0,0,0,.45);overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:100%;background:linear-gradient(90deg,#d9584a,#e88a54);transition:width .12s linear;';
  bar.appendChild(fill);
  plate.appendChild(name);
  plate.appendChild(bar);
  root.appendChild(plate);

  document.body.appendChild(root);
  return { root, pops, plate, fill };
}
