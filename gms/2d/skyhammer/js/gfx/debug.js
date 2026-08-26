// Deliberately ugly grey-box renderer. Same makeRenderer seam as the real one
// (CONTRACTS §11 + §14): makeRenderer({ gl, hud }) -> { resize, draw }. It draws
// into the 2D overlay only and leaves the WebGL canvas alone. It is a scaffold.

import { screenToWorld } from '../core/math.js';
import { register, unregister } from '../ui/hitrects.js';

const DT = 1 / 60;
const SLOT_MIN = 68, PAD = 12;

const COL = {
  sky0: '#20262e', sky1: '#39434e', sky2: '#5b6570',
  ground: '#232a22', groundEdge: '#3d4a3a', water: '#1d2c3a',
  player: '#ffd27a', playerLine: '#100c06',
  enemy: '#c05a4a', flak: '#8a6a3a', groundProp: '#6a6f66',
  balloon: '#5fa8c8', pad: 'rgba(90,220,120,.38)', padLine: '#6ee08a',
  bullet: '#ffe9b0', ebullet: '#ff9a7a', bomb: '#dfe4e8',
  hp: '#6ee08a', hpBg: 'rgba(0,0,0,.55)', text: '#cfd6dd',
};

export function makeRenderer(target) {
  const hud = target && target.hud ? target.hud : target;
  const glc = target && target.gl ? target.gl : null;
  const g = hud.getContext('2d', { alpha: false, desynchronized: true });

  let W = 0, H = 0, dpr = 1;
  const fx = [];              // { x, y, r, t, life, big }
  const flashes = [];
  let ownHud = false;
  let cachedVw = 0;
  const slotRects = [];

  function resize() {
    const cap = Math.min(window.devicePixelRatio || 1, 2);
    const q = new URLSearchParams(location.search).get('dpr');
    dpr = q ? Number(q) : cap;
    const r = hud.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    for (const c of [hud, glc]) {
      if (!c) continue;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function eat(events) {
    for (const ev of events) {
      if (ev.e === 'explode') fx.push({ x: ev.x, y: ev.y, r: ev.r || 90, t: 0, life: ev.big ? 0.75 : 0.42, big: !!ev.big });
      else if (ev.e === 'hit') fx.push({ x: ev.x, y: ev.y, r: 22, t: 0, life: 0.14, hit: true });
      else if (ev.e === 'pickup') flashes.push({ x: ev.x, y: ev.y, t: 0, life: 0.8, text: '+' + Math.round(ev.amount || 0) });
    }
  }

  function draw(world, alpha, events) {
    if (events && events.length) eat(events);
    if (!W) resize();

    const cam = world.cam;
    const sc = H / cam.vh;
    cachedVw = cam.vw;
    const camx = cam.x + cam.shakeX;
    const camy = cam.y + cam.shakeY;
    const top = camy + cam.vh;
    const SX = (wx) => (wx - camx) * sc;
    const SY = (wy) => (top - wy) * sc;

    // 1. sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, COL.sky0); sky.addColorStop(0.6, COL.sky1); sky.addColorStop(1, COL.sky2);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // 2. a grid so motion reads at all
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
    g.beginPath();
    const gs = 400;
    for (let x = Math.floor(camx / gs) * gs; x < camx + cam.vw + gs; x += gs) { g.moveTo(SX(x), 0); g.lineTo(SX(x), H); }
    for (let y = Math.floor(camy / gs) * gs; y < top + gs; y += gs) { g.moveTo(0, SY(y)); g.lineTo(W, SY(y)); }
    g.stroke();

    // 3. terrain
    const N = 96;
    const hs = world.terrain.sample(camx - 40, camx + cam.vw + 40, N);
    g.beginPath();
    g.moveTo(-10, H + 10);
    for (let i = 0; i < N; i++) {
      const wx = camx - 40 + (cam.vw + 80) * (i / (N - 1));
      g.lineTo(SX(wx), SY(hs[i]));
    }
    g.lineTo(W + 10, H + 10);
    g.closePath();
    g.fillStyle = world.terrain.waterY !== null ? COL.water : COL.ground;
    g.fill();
    g.strokeStyle = COL.groundEdge; g.lineWidth = 2; g.stroke();

    // 4. debris
    g.fillStyle = '#4b5148';
    for (const b of world.debris) g.fillRect(SX(b.x) - b.s * sc * 0.5, SY(b.y) - b.s * sc * 0.5, b.s * sc, b.s * sc);

    // 5. actors
    for (const e of world.ents) {
      if (e.dead) continue;
      const ex = e.x + (e.vx || 0) * alpha * DT;
      const ey = e.y + (e.vy || 0) * alpha * DT;
      if (SX(ex) < -400 || SX(ex) > W + 400) continue;
      if (e.kind === 'player') { drawPlane(g, SX(ex), SY(ey), e, sc, COL.player, alpha); continue; }
      if (e.kind === 'pad') {
        g.fillStyle = COL.pad;
        g.fillRect(SX(e.x - e.w), SY(e.y + e.h), e.w * 2 * sc, e.h * 2 * sc);
        g.strokeStyle = COL.padLine; g.lineWidth = 2;
        g.strokeRect(SX(e.x - e.w), SY(e.y + e.h), e.w * 2 * sc, e.h * 2 * sc);
        continue;
      }
      if (e.parts) { for (const p of e.parts) drawBox(g, SX(p.x), SY(p.y), p.w * 2 * sc, p.h * 2 * sc, p.dead ? '#3a3430' : (p.weak ? '#c8804a' : COL.enemy), p.dead ? 0 : p.hp / p.hpMax, sc); continue; }
      if (e.kind === 'fighter') { drawPlane(g, SX(ex), SY(ey), e, sc, COL.enemy, alpha); continue; }
      const col = e.kind === 'flak' ? COL.flak : e.kind === 'balloon' ? COL.balloon : COL.groundProp;
      drawBox(g, SX(ex), SY(ey), e.w * 2 * sc, e.h * 2 * sc, col, e.hpMax > 1 ? e.hp / e.hpMax : -1, sc, e.stun > 0);
    }

    // 6. projectiles
    for (const p of world.projs) {
      const px = SX(p.x + p.vx * alpha * DT), py = SY(p.y + p.vy * alpha * DT);
      const big = p.blastR > 0;
      g.strokeStyle = p.team === 0 ? (big ? COL.bomb : COL.bullet) : COL.ebullet;
      g.lineWidth = big ? 4 : 2;
      const L = big ? 14 : 22;
      const a = Math.atan2(-p.vy, p.vx);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px - Math.cos(a) * L, py - Math.sin(a) * L);
      g.stroke();
    }

    // 7. fx
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += DT;
      if (f.t > f.life) { fx.splice(i, 1); continue; }
      const k = f.t / f.life;
      g.globalAlpha = 1 - k;
      g.fillStyle = f.hit ? '#ffe1a8' : (f.big ? '#ffd08a' : '#ff9a4c');
      g.beginPath();
      g.arc(SX(f.x), SY(f.y), f.r * sc * (0.35 + k * 0.9), 0, 6.2832);
      g.fill();
      g.globalAlpha = 1;
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += DT;
      if (f.t > f.life) { flashes.splice(i, 1); continue; }
      g.globalAlpha = 1 - f.t / f.life;
      g.fillStyle = COL.hp; g.font = '600 15px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(f.text, SX(f.x), SY(f.y) - f.t * 60);
      g.globalAlpha = 1;
    }

    if (ownHud) drawOwnHud(g, world, W, H);
    drawDebugText(g, world, W, H);
  }

  function drawPlane(gg, x, y, e, sc, col, alpha) {
    const L = (e.w || 60) * sc, T = (e.h || 15) * sc;
    gg.save();
    gg.translate(x, y);
    gg.rotate(-e.ang);
    gg.fillStyle = e.hitFlash > 0 ? '#fff' : col;
    gg.strokeStyle = COL.playerLine; gg.lineWidth = 2;
    gg.beginPath();
    gg.moveTo(L, 0); gg.lineTo(-L * 0.7, -T * 1.6); gg.lineTo(-L * 0.45, 0); gg.lineTo(-L * 0.7, T * 1.6);
    gg.closePath(); gg.fill(); gg.stroke();
    gg.restore();
    if (e.kind !== 'player' && e.hpMax) hpBar(gg, x, y - T * 3.4, e.hp / e.hpMax, sc);
  }

  function drawBox(gg, x, y, w, h, col, frac, sc, stunned) {
    gg.fillStyle = col;
    gg.fillRect(x - w / 2, y - h / 2, w, h);
    gg.strokeStyle = stunned ? '#8ad0ff' : 'rgba(0,0,0,.5)';
    gg.lineWidth = stunned ? 3 : 1.5;
    gg.strokeRect(x - w / 2, y - h / 2, w, h);
    if (frac >= 0) hpBar(gg, x, y - h / 2 - 9, frac, sc);
  }

  function hpBar(gg, x, y, frac, sc) {
    const w = 46, h = 4;
    gg.fillStyle = COL.hpBg; gg.fillRect(x - w / 2, y, w, h);
    gg.fillStyle = COL.hp; gg.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function drawOwnHud(gg, world, w, h) {
    const p = world.player;
    if (!p) return;
    const n = Math.min(4, p.def.slots || 4);
    const s = Math.max(SLOT_MIN, Math.min(96, h * 0.19));
    slotRects.length = 0;
    for (let i = 0; i < n; i++) {
      const col = i % 2, row = i < 2 ? 0 : 1;
      const rx = w - PAD - (2 - col) * (s + PAD) + PAD;
      const ry = h - PAD - (2 - row) * (s + PAD) + PAD;
      const id = p.loadout[i];
      slotRects.push({ id: 'slot' + i, x: rx, y: ry, w: s, h: s });
      register('slot' + i, { x: rx, y: ry, w: s, h: s });
      gg.fillStyle = id ? (p.ammo[i] > 0 ? 'rgba(40,50,62,.85)' : 'rgba(30,32,36,.6)') : 'rgba(24,26,30,.4)';
      gg.strokeStyle = p.cool[i] > 0 ? '#4c5a6a' : '#8fa3b6';
      gg.lineWidth = 2;
      gg.beginPath(); gg.roundRect(rx, ry, s, s, 12); gg.fill(); gg.stroke();
      gg.fillStyle = COL.text; gg.font = '600 12px system-ui, sans-serif'; gg.textAlign = 'center';
      gg.fillText(id ? id.slice(0, 8) : '—', rx + s / 2, ry + s / 2);
      if (id) gg.fillText('x' + p.ammo[i], rx + s / 2, ry + s - 10);
    }
    // hp + fuel
    gg.fillStyle = COL.hpBg; gg.fillRect(PAD, PAD, 220, 8);
    gg.fillStyle = COL.hp; gg.fillRect(PAD, PAD, 220 * Math.max(0, p.hp / p.hpMax), 8);
    gg.fillStyle = COL.hpBg; gg.fillRect(PAD, PAD + 12, 220, 5);
    gg.fillStyle = '#e0c070'; gg.fillRect(PAD, PAD + 12, 220 * Math.max(0, p.fuel / p.fuelMax), 5);

    if (p.landed) {
      const bw = 190, bh = 58, bx = (w - bw) / 2, by = h - bh - 26;
      register('takeoff', { x: bx, y: by, w: bw, h: bh });
      gg.fillStyle = 'rgba(30,44,34,.9)'; gg.strokeStyle = COL.padLine; gg.lineWidth = 2;
      gg.beginPath(); gg.roundRect(bx, by, bw, bh, 14); gg.fill(); gg.stroke();
      gg.fillStyle = COL.padLine; gg.font = '700 19px system-ui, sans-serif'; gg.textAlign = 'center';
      gg.fillText('TAKE OFF', w / 2, by + 37);
    } else unregister('takeoff');
  }

  // CONTRACTS §13.1: every debug capture burns its RESOLVED configuration into the
  // frame. The requested value is what lies to you.
  function drawDebugText(gg, world, w, h) {
    const p = world.player;
    const lv = world.level;
    const paletteKey = `${lv.biome}/${lv.timeOfDay}/${lv.weather}`;
    const lines = [
      `RESOLVED  ${lv.id}  ${paletteKey}  seed ${world.seed}`,
      `view ${w}x${h} @dpr ${dpr.toFixed(2)}  vw ${cachedVw | 0} vh ${world.cam.vh}  renderer debug2d`,
      `x ${p.x | 0} y ${p.y | 0} v ${p.speed | 0}${p.stalling ? ' STALL' : ''}  hp ${Math.max(0, p.hp) | 0}  $${world.stats.money | 0}  t ${world.t.toFixed(0)}s`,
      `ents ${world.ents.length} proj ${world.projs.length} debris ${world.debris.length}  ` +
        world.mission.objectives.map((o) => `${o.done ? 'X' : 'o'}${Math.round(o.have)}/${Math.round(o.need)}`).join(' '),
    ];
    gg.font = '11px ui-monospace, monospace';
    gg.textAlign = 'left';
    let wide = 0;
    for (const l of lines) wide = Math.max(wide, gg.measureText(l).width);
    const bx = 10, by = h - 10 - lines.length * 14 - 8;
    gg.fillStyle = 'rgba(0,0,0,.52)';
    gg.fillRect(bx - 6, by - 4, wide + 14, lines.length * 14 + 10);
    gg.fillStyle = COL.text;
    lines.forEach((l, i) => gg.fillText(l, bx, by + 11 + i * 14));
  }

  return {
    resize,
    draw,
    /** kept so a renderer that does own the screen->world transform stays compatible */
    toWorld: (cam, sx, sy) => screenToWorld(cam, sx, sy),
    set ownHud(v) { ownHud = v; if (!v) { for (let i = 0; i < 4; i++) unregister('slot' + i); unregister('takeoff'); } },
    get ownHud() { return ownHud; },
    isDebug: true,
  };
}
