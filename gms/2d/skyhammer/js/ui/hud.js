// The in-flight HUD. Canvas only, drawn last, no DOM and no per-frame allocation.

import { COMBAT, PHYS } from '../data/tuning.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES } from '../data/enemies.js';
import * as U from './units.js';
import { drawIcon, GOLD } from './icons.js';
import { register, unregister } from './hitrects.js';
import { prefs } from './prefs.js';

const EMPTY_DASH = [];
const CEIL_DASH = [3, 3];
const SLOT_MIN = 64;         // CSS px — the reachability floor for a real thumb
const PAD = 10;

const L = {                  // cached layout, recomputed only when the screen changes
  w: 0, h: 0, hand: '', n: 0,
  slots: [{ x: 0, y: 0, s: 0 }, { x: 0, y: 0, s: 0 }, { x: 0, y: 0, s: 0 }, { x: 0, y: 0, s: 0 }],
  pause: { x: 0, y: 0, w: 0, h: 0 },
  takeoff: { x: 0, y: 0, w: 0, h: 0 },
  map: { x: 0, y: 0, w: 0, h: 0 },
  bars: { x: 0, y: 0, w: 0, h: 0 },
  alt: { x: 0, y: 0, w: 0, h: 0, dir: 1 },
};

const iconCache = new Map();   // `${id}|${size}|${color}` → offscreen canvas
let takeoffShown = false;

// hit / damage feedback state, driven off world.t so no dt is needed
let lastHp = -1, flashT = -99, lastT = 0, dtHud = 0;

const CEIL = (PHYS && PHYS.ceiling) || 2400;   // minimap vertical axis maxes at the service ceiling

// altitude ribbon state
const ALT = { top: 0, hot: false, scanAt: -99, vis: 0.28, str: '', strKey: -1, unitId: '' };

/* --------------------------------------------------------------------- api */

export function resetHud() {
  L.w = L.h = 0;
  lastHp = -1; flashT = -99;
  ALT.top = 0; ALT.hot = false; ALT.scanAt = -99; ALT.vis = 0.28; ALT.strKey = -1;
  takeoffShown = false;
  for (let i = 0; i < 4; i++) unregister('slot' + i);
  unregister('pause'); unregister('takeoff');
}

/** Every rect the HUD claims, for the reachability audit. */
export function hudRects() {
  const out = [];
  for (let i = 0; i < L.n; i++) out.push({ id: 'slot' + i, x: L.slots[i].x, y: L.slots[i].y, w: L.slots[i].s, h: L.slots[i].s });
  out.push({ id: 'pause', ...L.pause });
  if (takeoffShown) out.push({ id: 'takeoff', ...L.takeoff });
  return out;
}

/**
 * @param g      CanvasRenderingContext2D, transform reset to CSS px, no shake applied
 * @param world  CONTRACTS §4
 * @param screen { w, h } in CSS px
 */
// The overlay canvas need not match the WebGL canvas pixel for pixel (CONTRACTS §14),
// so the HUD derives its own world->screen scale from `screen` instead of trusting cam.scale.
const V = { sc: 1, camx: 0, top: 0 };

function setView(world, screen) {
  const cam = world.cam || { x: 0, y: 0, vh: 900 };
  V.sc = screen.h / (cam.vh || 900);
  V.camx = cam.x || 0;
  V.top = (cam.y || 0) + (cam.vh || 900);
}

/* --------------------------------------------------- world -> screen (D-U13)
 * The 3D renderer uses a 20 deg perspective camera and bends world y quadratically in
 * camera-relative x inside the vertex shader (GFX_NOTES 1.3). The flat transform above cannot
 * reproduce either and drifts up to 43 px at the screen edges, so every world-anchored mark goes
 * through renderer.project(). It degrades to the flat transform when there is no projector —
 * gfx/debug.js has none, and ?gfx=debug must keep working.
 */
let projFn = null, projScale = null;

/** main.js: call once after makeRenderer(). Accepts the renderer or a bare project function. */
export function setProjector(r) {
  if (typeof r === 'function') { projFn = r; projScale = null; return; }
  projFn = r && typeof r.project === 'function' ? (x, y) => r.project(x, y, 0) : null;
  projScale = r && typeof r.scale === 'function' ? () => r.scale() : null;
}

let PROJ = null;                       // this frame's projector, or null for the flat fallback
const P = { x: 0, y: 0 };              // reused; never hold on to what proj() returns

function proj(wx, wy) {
  if (PROJ) {
    const q = PROJ(wx, wy);
    P.x = q.x; P.y = q.y;
  } else {
    P.x = (wx - V.camx) * V.sc;
    P.y = (V.top - wy) * V.sc;
  }
  return P;
}
const worldScale = () => (PROJ && projScale ? projScale() : V.sc);

export function drawHud(g, world, screen) {
  const w = screen.w, h = screen.h;
  const p = world.player;
  const t = world.t || 0;
  const slots = readSlots(world);
  setView(world, screen);

  if (w !== L.w || h !== L.h || prefs.hand !== L.hand || slots.n !== L.n) layout(w, h, slots.n);

  PROJ = (screen.project) || projFn || null;

  if (p) {
    if (lastHp >= 0 && p.hp < lastHp - 0.01) flashT = t;
    lastHp = p.hp;
  }
  dtHud = Math.max(0, Math.min(0.1, t - lastT));
  lastT = t;

  g.save();
  // The overlay is a TRANSPARENT canvas that nothing else draws on, and it is never cleared for
  // us, so a HUD that does not clear leaves a full-screen smear of every previous frame (D-U14).
  // The one exception is gfx/debug.js, which paints the whole world into this same canvas and
  // gives itself an opaque context to do it — that is the signal, so ?gfx=debug still works.
  const dpr = screen.dpr || (g.canvas ? g.canvas.width / Math.max(1, w) : 1);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (screen.clear !== undefined ? screen.clear : !opaqueContext(g)) {
    g.clearRect(0, 0, g.canvas ? g.canvas.width : w, g.canvas ? g.canvas.height : h);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0;
  g.shadowColor = 'rgba(0,0,0,0)';
  g.setLineDash(EMPTY_DASH);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.lineJoin = 'round';

  drawWorldBars(g, world, screen);
  drawMinimap(g, world, screen);
  drawStatusBars(g, world);
  drawWeaponStrip(g, world, slots);
  drawObjectives(g, world);
  drawAltitude(g, world, t);
  drawChevron(g, world, screen);
  drawSlotButtons(g, world, slots, t);
  drawPause(g);
  drawTakeoff(g, world);
  drawVignette(g, world, screen, t);

  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

/* ------------------------------------------------------------------ layout */

function layout(w, h, n) {
  L.w = w; L.h = h; L.hand = prefs.hand; L.n = n;

  const s = Math.max(SLOT_MIN, Math.min(84, Math.round(h * 0.20)));
  const gap = Math.max(8, Math.round(s * 0.13));
  const total = n * s + (n - 1) * gap;
  const y = h - s - PAD - 2;
  const left = prefs.hand === 'left';
  const x0 = left ? PAD + 2 : w - PAD - 2 - total;

  for (let i = 0; i < 4; i++) {
    const k = left ? n - 1 - i : i;    // slot 1 stays nearest the screen edge under the thumb
    L.slots[i].x = x0 + k * (s + gap);
    L.slots[i].y = y;
    L.slots[i].s = s;
    if (i < n) register('slot' + i, { x: L.slots[i].x, y: L.slots[i].y, w: L.slots[i].s, h: L.slots[i].s });
    else unregister('slot' + i);
  }

  const pb = 46;
  L.pause.w = pb; L.pause.h = pb;
  L.pause.x = left ? w - PAD - pb : PAD;
  L.pause.y = PAD;
  register('pause', L.pause);

  L.takeoff.w = 190; L.takeoff.h = 54;
  L.takeoff.x = Math.round(w / 2 - 95);
  L.takeoff.y = h - 54 - PAD - 2;

  const mapW = Math.min(320, Math.round(w * 0.34));
  L.map.w = mapW; L.map.h = 35;   // tall enough to read altitude, short enough to stay out of the way
  L.map.x = Math.round(w / 2 - mapW / 2);
  L.map.y = PAD;

  // under the pause button, not beside it — the minimap needs the top-centre clear
  L.bars.x = left ? w - PAD - 152 : PAD + 4;
  L.bars.y = PAD + pb + 8;
  L.bars.w = Math.min(136, Math.round(w * 0.17));
  L.bars.h = 7;

  // The altitude ribbon lives on the edge OPPOSITE the thumb buttons, below the status bars,
  // so it is never under a thumb and never fights the minimap for the top-centre.
  L.alt.w = 9;
  L.alt.dir = left ? -1 : 1;                       // which way its labels read
  L.alt.x = left ? w - PAD - 8 - L.alt.w : PAD + 8;
  L.alt.y = L.bars.y + L.bars.h * 2 + 30;
  L.alt.h = Math.max(0, h - PAD - 8 - L.alt.y);
}

/* -------------------------------------------------------------- slot state */

const slotScratch = { n: 4, id: [null, null, null, null], ammo: [0, 0, 0, 0], cd: [0, 0, 0, 0], cdMax: [1, 1, 1, 1], sel: 0 };

function readSlots(world) {
  const p = world.player || {};
  const src = p.slots || world.slots || null;
  const load = (world.loadout || (p.def && p.def.loadout) || (world.save && world.save.loadout)) || null;
  const n = Math.max(1, Math.min(4, p.def && p.def.slots ? p.def.slots : (src ? src.length : (load ? load.filter(Boolean).length || 4 : 4))));
  slotScratch.n = n;
  slotScratch.sel = p.slot != null ? p.slot : (world.selSlot || 0);
  for (let i = 0; i < 4; i++) {
    const s = src && src[i];
    const id = s ? (s.id || s.weapon || null) : (load ? load[i] : null);
    slotScratch.id[i] = id;
    const def = id ? WEAPONS[id] : null;
    slotScratch.ammo[i] = s && s.ammo != null ? s.ammo : (def ? def.ammo : 0);
    slotScratch.cd[i] = s && s.cd != null ? s.cd : 0;
    slotScratch.cdMax[i] = (s && s.cdMax) || (def && def.cooldown) || 1;
  }
  return slotScratch;
}

/* ------------------------------------------------------------- status bars */

function drawStatusBars(g, world) {
  const p = world.player;
  if (!p) return;
  const x = L.bars.x, y = L.bars.y, w = L.bars.w, h = L.bars.h;

  const hp = clamp01(p.hp / (p.hpMax || 1));
  bar(g, x + 16, y, w, h, hp, hp > 0.55 ? '#7fd45a' : hp > 0.25 ? '#e8c14a' : '#e0603c');
  glyphHeart(g, x, y + h / 2);

  const fuel = p.fuel != null ? clamp01(p.fuel / (p.fuelMax || 600)) : 1;
  bar(g, x + 16, y + h + 5, w, h, fuel, fuel > 0.2 ? '#6fb6d8' : '#e0603c');
  glyphDrop(g, x, y + h + 5 + h / 2);

  if (fuel <= 0.2) {
    const blink = (Math.sin(lastT * 7) + 1) / 2;
    g.globalAlpha = 0.4 + blink * 0.6;
    g.fillStyle = '#ffb0a0';
    g.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    g.fillText('BINGO FUEL', x + 16, y + h * 2 + 16);
    g.globalAlpha = 1;
  }
}

function bar(g, x, y, w, h, f, col) {
  g.fillStyle = 'rgba(12,9,6,0.62)';
  rrect(g, x - 1, y - 1, w + 2, h + 2, 3); g.fill();
  g.fillStyle = col;
  rrect(g, x, y, Math.max(0, w * f), h, 2); g.fill();
  g.strokeStyle = 'rgba(255,220,180,0.22)'; g.lineWidth = 1;
  rrect(g, x - 0.5, y - 0.5, w + 1, h + 1, 3); g.stroke();
}

function glyphHeart(g, x, cy) {
  g.fillStyle = '#7fd45a';
  g.beginPath();
  g.moveTo(x + 6, cy + 4);
  g.bezierCurveTo(x - 1, cy - 1, x + 2, cy - 6, x + 6, cy - 2);
  g.bezierCurveTo(x + 10, cy - 6, x + 13, cy - 1, x + 6, cy + 4);
  g.fill();
}

function glyphDrop(g, x, cy) {
  g.fillStyle = '#6fb6d8';
  g.beginPath();
  g.moveTo(x + 6, cy - 6);
  g.quadraticCurveTo(x + 12, cy + 1, x + 6, cy + 5);
  g.quadraticCurveTo(x, cy + 1, x + 6, cy - 6);
  g.fill();
}

/* ------------------------------------------------------------ weapon strip */

function drawWeaponStrip(g, world, slots) {
  const left = prefs.hand === 'left';
  const size = 24, gap = 7;
  const n = slots.n;
  const totalW = n * (size + gap) - gap;
  const x0 = left ? PAD : L.w - PAD - totalW;
  const y = PAD + 2;

  for (let i = 0; i < n; i++) {
    const x = x0 + i * (size + gap);
    const sel = i === slots.sel;
    g.fillStyle = sel ? 'rgba(255,196,107,0.20)' : 'rgba(12,9,6,0.5)';
    rrect(g, x - 3, y - 3, size + 6, size + 16, 5); g.fill();
    if (sel) {
      g.strokeStyle = GOLD; g.lineWidth = 1.4;
      rrect(g, x - 3, y - 3, size + 6, size + 16, 5); g.stroke();
    }
    const id = slots.id[i];
    if (id) {
      const empty = slots.ammo[i] <= 0;
      g.drawImage(icon(WEAPONS[id] ? WEAPONS[id].icon : 'bomb', size, empty ? 'rgba(180,165,140,0.4)' : GOLD), x, y);
      g.font = '700 9px ui-sans-serif, system-ui, sans-serif';
      g.fillStyle = empty ? '#e0603c' : '#f2e6d4';
      g.textAlign = 'center';
      g.fillText(String(slots.ammo[i]), x + size / 2, y + size + 6);
      g.textAlign = 'left';
    }
  }
}

/* ---------------------------------------------------------------- minimap */

function drawMinimap(g, world, screen) {
  const m = L.map;
  const len = (world.level && world.level.length) || 1;
  const cam = world.cam;

  // Occlusion: anything worth seeing behind the strip fades it — including the player's own
  // aeroplane, which matters most of all now the camera follows you up into the top of the frame.
  let occluding = false;
  const ents = world.ents || [];
  const sc = worldScale();
  const behind = (e, pad) => {
    const q = proj(e.x, e.y);
    const r = (e.r || 40) * sc + pad;
    return q.x + r > m.x && q.x - r < m.x + m.w && q.y + r > m.y && q.y - r < m.y + m.h;
  };
  if (world.player && !world.player.dead && behind(world.player, 10)) occluding = true;
  if (!occluding) {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e === world.player) continue;
      const k = e.kind;
      if (k !== 'balloon' && k !== 'pickup' && k !== 'fighter' && k !== 'boss' && k !== 'flak' && k !== 'ground') continue;
      if (behind(e, 0)) { occluding = true; break; }
    }
  }

  g.globalAlpha = occluding ? 0.22 : 1;

  g.fillStyle = occluding ? 'rgba(12,9,6,0.80)' : 'rgba(12,9,6,0.70)';
  rrect(g, m.x, m.y, m.w, m.h, 4); g.fill();
  g.strokeStyle = 'rgba(255,220,180,0.34)'; g.lineWidth = 1;
  rrect(g, m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1, 4); g.stroke();

  // the ground line
  g.strokeStyle = 'rgba(190,160,120,0.35)';
  g.beginPath(); g.moveTo(m.x + 3, m.y + m.h - 4.5); g.lineTo(m.x + m.w - 3, m.y + m.h - 4.5); g.stroke();

  const px = (x) => m.x + 3 + (m.w - 6) * Math.max(0, Math.min(1, x / len));
  // Vertical axis is ALTITUDE. The whole point of the taller strip: an enemy loitering high up
  // used to be indistinguishable from one on the deck, in a game where the top of the sky is
  // worth going to.
  const groundY = m.y + m.h - 4.5;
  const topY = m.y + 4;
  const py = (wy) => groundY - (groundY - topY) * Math.max(0, Math.min(1, (wy || 0) / CEIL));

  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead) continue;
    const x = px(e.x);
    switch (e.kind) {
      case 'balloon': case 'pickup': {
        const y = py(e.y);
        g.fillStyle = '#7fd45a';
        g.fillRect(x - 1.5, y - 3, 3, 6);
        break;
      }
      case 'fighter': case 'boss': {
        const y = py(e.y);
        g.fillStyle = '#e0603c';
        g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 3.5, y + 3); g.lineTo(x - 3.5, y + 3); g.closePath(); g.fill();
        break;
      }
      case 'flak': case 'ground':
        g.fillStyle = e.objective ? GOLD : 'rgba(220,190,150,0.55)';
        g.fillRect(x - 1.5, groundY - 6, 3, 6);
        break;
      case 'pad':
        g.fillStyle = '#7fd45a';
        g.fillRect(x - 5, groundY - 5, 10, 4);
        break;
      default: break;
    }
  }

  // camera window then the player, so the player is on top
  const cx0 = px(cam.x), cx1 = px(cam.x + (cam.vw || 1600));
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.strokeRect(cx0 + 0.5, m.y + 2.5, Math.max(2, cx1 - cx0), m.h - 5);

  const p = world.player;
  if (p) {
    const x = px(p.x);
    g.fillStyle = '#fff3d8';
    g.beginPath();
    g.moveTo(x + 5, m.y + m.h / 2);
    g.lineTo(x - 4, m.y + m.h / 2 - 4);
    g.lineTo(x - 4, m.y + m.h / 2 + 4);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(60,40,20,0.9)'; g.lineWidth = 1; g.stroke();
  }

  g.globalAlpha = 1;
}

/* ------------------------------------------------------------- objectives */

function drawObjectives(g, world) {
  const mi = world.mission;
  if (!mi || !mi.objectives || !mi.objectives.length) return;
  g.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'left';
  let out = '';
  for (let i = 0; i < mi.objectives.length; i++) {
    const o = mi.objectives[i];
    const have = o.have != null ? o.have : (o.progress != null ? o.progress : 0);
    // sim/mission.js normalises to `need`; the raw level row only has count/seconds
    const need = o.need != null ? o.need : (o.count != null ? o.count : (o.seconds != null ? o.seconds : 1));
    const done = o.done || have >= need;
    out += (i ? '   ' : '') + (done ? '✓ ' : '') + shortObj(o) + ' ' + Math.min(have, need) + '/' + need;
  }
  // To the RIGHT of the strip now that the strip is tall — under it would push into the play
  // area, and the top-right weapon icons leave a clear gap here.
  const tw = g.measureText(out).width + 14;
  const bx = L.map.x + L.map.w + 8;
  const by = L.map.y + L.map.h / 2 - 8;
  g.fillStyle = 'rgba(12,9,6,0.5)';
  rrect(g, bx, by, tw, 16, 4); g.fill();
  g.fillStyle = '#f0e0c6';
  g.fillText(out, bx + 7, by + 11);
}

function shortObj(o) {
  switch (o.type) {
    case 'destroy': return 'TARGETS';
    case 'kill': return 'KILLS';
    case 'survive': return 'HOLD';
    case 'land': return 'LAND';
    case 'collect': return 'SUPPLY';
    default: return String(o.type || '').toUpperCase();
  }
}

/* ------------------------------------------------------- altitude ribbon */
// D26 made the top of the sky a real sanctuary: ground AA tops out at 1800 against a 2400
// ceiling, so ~600 units of high air cannot be reached from the ground. That rule was
// completely invisible. This exists to teach exactly that one thing and nothing else, so it
// is thin, quiet, and fades away whenever the answer is not interesting.

const HARD_TOP = PHYS.ceiling + 420;      // sim/plane.js bounces the player here

/** The row that actually does the shooting: a flak ent, or a ground ent with `shoots`. */
function aaRow(e) {
  const d = e.def;
  if (!d) return null;
  if (typeof d.range === 'number') return d;
  if (d.shoots) return ENEMIES[d.shoots] || null;
  return null;
}

function scanThreat(world, t) {
  if (t - ALT.scanAt < 0.25 && ALT.scanAt > -50) return;
  ALT.scanAt = t;
  const p = world.player;
  const ents = world.ents || [];
  let top = 0, hot = false;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || (e.kind !== 'flak' && e.kind !== 'ground')) continue;
    const row = aaRow(e);
    if (!row || !row.range) continue;
    const reach = e.y + row.range;
    if (reach > top) top = reach;
    // the sim's own firing gate, so the shaded band means precisely "it can shoot me here"
    if (p && !hot && p.y - e.y >= 40 && Math.hypot(p.x - e.x, p.y - e.y) < row.range) hot = true;
  }
  ALT.top = Math.min(top, HARD_TOP);
  ALT.hot = hot;
}

function drawAltitude(g, world, t) {
  const p = world.player;
  const A = L.alt;
  if (!p || A.h < 90) return;
  scanThreat(world, t);

  const y0 = A.y, y1 = A.y + A.h;                     // top of ribbon, bottom of ribbon
  const yOf = (wy) => y1 - Math.max(0, Math.min(1, wy / HARD_TOP)) * A.h;
  const alt = Math.max(0, p.y || 0);
  const stalling = !!p.stalling || (p.def && p.speed != null && p.speed < p.def.stall * 1.06);
  const nearCeil = alt > PHYS.ceiling * 0.88;

  const want = (ALT.hot || nearCeil || stalling || (ALT.top > 0 && alt > ALT.top * 0.8)) ? 1 : 0.28;
  ALT.vis += (want - ALT.vis) * Math.min(1, dtHud * 4.5);
  const vis = ALT.vis;

  const dir = A.dir;                                   // +1: labels to the right of the track
  const lx = dir > 0 ? A.x + A.w + 6 : A.x - 6;        // label anchor
  g.textAlign = dir > 0 ? 'left' : 'right';

  g.globalAlpha = vis;
  g.fillStyle = 'rgba(12,9,6,0.52)';
  rrect(g, A.x, y0, A.w, A.h, 4); g.fill();

  g.save();
  rrect(g, A.x, y0, A.w, A.h, 4); g.clip();
  const yThreat = yOf(ALT.top);
  const yCeil = yOf(PHYS.ceiling);
  if (ALT.top > 0) {
    g.fillStyle = ALT.hot ? 'rgba(232,86,52,0.62)' : 'rgba(224,96,60,0.34)';
    g.fillRect(A.x, yThreat, A.w, y1 - yThreat);
  }
  g.fillStyle = 'rgba(120,196,226,0.26)';
  g.fillRect(A.x, yCeil, A.w, Math.max(0, yThreat - yCeil));
  g.fillStyle = 'rgba(255,240,220,0.10)';             // thin air: turn rate collapses up here
  g.fillRect(A.x, y0, A.w, Math.max(0, yCeil - y0));
  g.restore();

  g.strokeStyle = 'rgba(255,220,180,0.20)'; g.lineWidth = 1;
  rrect(g, A.x + 0.5, y0 + 0.5, A.w - 1, A.h - 1, 4); g.stroke();

  // The readout is the one thing that must always be legible, so it is placed first and the
  // band labels stand down wherever they would sit under it.
  const cy = yOf(alt);
  const ty = Math.max(y0 + 7, Math.min(y1 - 7, cy - 9));
  const clear = (y) => Math.abs(y - ty) > 12;
  const tx = dir > 0 ? lx + 3 : lx - 3;

  g.font = '700 8px ui-sans-serif, system-ui, sans-serif';

  // the ceiling
  g.strokeStyle = 'rgba(240,224,200,0.42)';
  g.setLineDash(CEIL_DASH);
  g.beginPath(); g.moveTo(A.x - 2, yCeil + 0.5); g.lineTo(A.x + A.w + 2, yCeil + 0.5); g.stroke();
  g.setLineDash(EMPTY_DASH);
  if (clear(yCeil)) {
    g.fillStyle = 'rgba(240,224,200,0.62)';
    g.fillText('CEILING', lx, yCeil);
  }

  // the line the whole thing exists to show
  if (ALT.top > 0 && yThreat > y0 + 6 && yThreat < y1 - 4) {
    g.strokeStyle = ALT.hot ? 'rgba(255,130,96,0.95)' : 'rgba(224,96,60,0.62)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(A.x - 3, yThreat); g.lineTo(A.x + A.w + 3, yThreat); g.stroke();
    if (clear(yThreat)) {
      g.fillStyle = ALT.hot ? 'rgba(255,150,120,0.98)' : 'rgba(230,150,120,0.68)';
      g.fillText('AA', lx, yThreat);
    }
    const mid = (yThreat + yCeil) / 2;
    if (vis > 0.6 && yCeil < yThreat - 18 && clear(mid)) {
      g.globalAlpha = vis * (vis - 0.6) * 2.5;
      g.fillStyle = 'rgba(150,205,230,0.85)';
      g.fillText('SAFE', lx, mid);
      g.globalAlpha = vis;
    }
  }

  // the player
  g.globalAlpha = 0.45 + 0.55 * vis;
  g.strokeStyle = 'rgba(20,14,9,0.75)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(A.x - 1, cy); g.lineTo(A.x + A.w + 1, cy); g.stroke();
  g.strokeStyle = '#fff3d8'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(A.x - 1, cy); g.lineTo(A.x + A.w + 1, cy); g.stroke();
  g.fillStyle = '#fff3d8';
  g.beginPath();
  g.moveTo(A.x + (dir > 0 ? A.w + 2 : -2), cy);
  g.lineTo(A.x + (dir > 0 ? A.w + 8 : -8), cy - 4.5);
  g.lineTo(A.x + (dir > 0 ? A.w + 8 : -8), cy + 4.5);
  g.closePath(); g.fill();

  const key = Math.round(alt);
  if (key !== ALT.strKey || prefs.altUnit !== ALT.unitId) {
    ALT.strKey = key; ALT.unitId = prefs.altUnit; ALT.str = U.altText(alt);
  }
  g.font = '700 10px ui-sans-serif, system-ui, sans-serif';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(10,7,4,0.75)'; g.lineWidth = 3;
  g.strokeText(ALT.str, tx, ty);
  g.fillStyle = '#f7ead0';
  g.fillText(ALT.str, tx, ty);

  if (stalling) {
    g.globalAlpha = 0.55 + 0.45 * ((Math.sin(t * 8) + 1) / 2);
    g.font = '800 9px ui-sans-serif, system-ui, sans-serif';
    g.strokeStyle = 'rgba(10,7,4,0.75)'; g.lineWidth = 3;
    const sy = Math.min(y1 - 7, ty + 12);
    g.strokeText('STALL', tx, sy);
    g.fillStyle = '#ff9a7a';
    g.fillText('STALL', tx, sy);
  }

  g.globalAlpha = 1;
  g.textAlign = 'left';
}

/* ----------------------------------------------------- off-screen chevron */

function drawChevron(g, world, screen) {
  const p = world.player;
  if (!p) return;
  const cam = world.cam;
  const ents = world.ents || [];
  let best = null, bd = 1e18;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || !e.objective) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return;
  const q = proj(best.x, best.y);
  const sx = q.x, sy = q.y;
  const inView = sx > 12 && sx < screen.w - 12 && sy > 12 && sy < screen.h - 12;
  if (inView) return;

  const cx = screen.w / 2, cy = screen.h / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const rx = Math.min(screen.w / 2 - 34, screen.h / 2 - 34);
  const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * rx;

  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = GOLD;
  g.globalAlpha = 0.55 + 0.35 * ((Math.sin(lastT * 4) + 1) / 2);
  g.beginPath();
  g.moveTo(13, 0); g.lineTo(-6, -9); g.lineTo(-2, 0); g.lineTo(-6, 9);
  g.closePath(); g.fill();
  g.restore();
  g.globalAlpha = 1;
}

/* ----------------------------------------------------- world-space hp bars */

function drawWorldBars(g, world, screen) {
  const sc = worldScale();
  const bw = (COMBAT.hpBarWidth || 96) * sc;
  const bh = Math.max(3, (COMBAT.hpBarHeight || 5) * sc);
  const ents = world.ents || [];
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    if (e.dead || e === world.player || !e.hpMax) continue;
    if (e.hp >= e.hpMax) continue;
    if (e.kind === 'pickup' || e.kind === 'pad') continue;
    const q = proj(e.x, e.y + (e.h || 20) + 14);
    const sx = q.x, sy = q.y;
    if (sx < -bw || sx > screen.w + bw) continue;
    if (sy < -20 || sy > screen.h + 20) continue;
    const f = Math.max(0, e.hp / e.hpMax);
    g.fillStyle = 'rgba(10,7,5,0.7)';
    g.fillRect(sx - bw / 2 - 1, sy - 1, bw + 2, bh + 2);
    g.fillStyle = f > 0.5 ? '#7fd45a' : f > 0.22 ? '#e8c14a' : '#e0603c';
    g.fillRect(sx - bw / 2, sy, bw * f, bh);
  }
}

/* ------------------------------------------------------- the thumb buttons */

function drawSlotButtons(g, world, slots, t) {
  for (let i = 0; i < slots.n; i++) {
    const s = L.slots[i];
    const id = slots.id[i];
    const ammo = slots.ammo[i];
    const cd = slots.cd[i];
    const sel = i === slots.sel;
    const dead = !id || ammo <= 0;

    g.fillStyle = dead ? 'rgba(16,12,9,0.5)' : 'rgba(28,21,15,0.72)';
    rrect(g, s.x, s.y, s.s, s.s, 12); g.fill();
    g.lineWidth = sel ? 2.2 : 1.4;
    g.strokeStyle = dead ? 'rgba(150,135,115,0.28)' : sel ? GOLD : 'rgba(255,214,160,0.42)';
    rrect(g, s.x + 0.5, s.y + 0.5, s.s - 1, s.s - 1, 12); g.stroke();

    if (id) {
      const isz = Math.round(s.s * 0.52);
      g.drawImage(icon(WEAPONS[id] ? WEAPONS[id].icon : 'bomb', isz, dead ? 'rgba(180,165,140,0.35)' : GOLD),
        Math.round(s.x + (s.s - isz) / 2), Math.round(s.y + s.s * 0.12));

      g.font = '800 13px ui-sans-serif, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = dead ? '#e0603c' : '#fdf0da';
      g.fillText(dead ? '—' : String(ammo), s.x + s.s / 2, s.y + s.s - 12);
      g.textAlign = 'left';

      if (cd > 0) {
        const f = Math.max(0, Math.min(1, cd / (slots.cdMax[i] || 1)));
        g.save();
        g.beginPath();
        rrect(g, s.x, s.y, s.s, s.s, 12);
        g.clip();
        g.fillStyle = 'rgba(6,4,3,0.55)';
        g.beginPath();
        g.moveTo(s.x + s.s / 2, s.y + s.s / 2);
        g.arc(s.x + s.s / 2, s.y + s.s / 2, s.s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
        g.closePath(); g.fill();
        g.restore();
      }
    } else {
      g.strokeStyle = 'rgba(160,145,125,0.28)';
      g.setLineDash([4, 4]);
      rrect(g, s.x + 8.5, s.y + 8.5, s.s - 17, s.s - 17, 8); g.stroke();
      g.setLineDash([]);
    }

    g.font = '700 9px ui-sans-serif, system-ui, sans-serif';
    g.fillStyle = 'rgba(255,230,200,0.45)';
    g.fillText(String(i + 1), s.x + 6, s.y + 10);
  }
}

function drawPause(g) {
  const b = L.pause;
  g.fillStyle = 'rgba(20,15,11,0.55)';
  rrect(g, b.x, b.y, b.w, b.h, 10); g.fill();
  g.strokeStyle = 'rgba(255,214,160,0.30)'; g.lineWidth = 1.2;
  rrect(g, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10); g.stroke();
  g.fillStyle = '#f0e0c6';
  g.fillRect(b.x + b.w / 2 - 7, b.y + b.h / 2 - 8, 5, 16);
  g.fillRect(b.x + b.w / 2 + 2, b.y + b.h / 2 - 8, 5, 16);
}

function drawTakeoff(g, world) {
  const show = !!(world.player && (world.player.landed || world.landed));
  if (show !== takeoffShown) {
    takeoffShown = show;
    if (show) register('takeoff', L.takeoff); else unregister('takeoff');
  }
  if (!show) return;
  const b = L.takeoff;
  g.fillStyle = 'rgba(127,212,90,0.90)';
  rrect(g, b.x, b.y, b.w, b.h, 12); g.fill();
  g.fillStyle = '#12200c';
  g.font = '800 18px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('TAKE OFF', b.x + b.w / 2, b.y + b.h / 2 + 1);
  g.textAlign = 'left';
}

/* ------------------------------------------------------- damage feedback */

function drawVignette(g, world, screen, t) {
  const p = world.player;
  if (!p) return;
  const hurt = 1 - Math.max(0, Math.min(1, p.hp / (p.hpMax || 1)));
  const since = t - flashT;

  if (hurt > 0.35 && !prefs.reduceFx) {
    const a = (hurt - 0.35) / 0.65;
    const r = Math.max(screen.w, screen.h);
    const grd = g.createRadialGradient(screen.w / 2, screen.h / 2, r * 0.30, screen.w / 2, screen.h / 2, r * 0.72);
    grd.addColorStop(0, 'rgba(120,10,6,0)');
    grd.addColorStop(1, `rgba(120,10,6,${(0.18 + a * 0.42).toFixed(3)})`);
    g.fillStyle = grd;
    g.fillRect(0, 0, screen.w, screen.h);
  }

  if (since >= 0 && since < 0.28) {
    const a = (1 - since / 0.28) * 0.85;
    const t2 = Math.round(Math.min(screen.w, screen.h) * 0.09);
    g.save();
    g.globalCompositeOperation = 'lighter';
    edgeFlash(g, screen.w, screen.h, t2, a);
    g.restore();
  }
}

function edgeFlash(g, w, h, t, a) {
  let grd = g.createLinearGradient(0, 0, 0, t);
  grd.addColorStop(0, `rgba(220,40,26,${a})`); grd.addColorStop(1, 'rgba(220,40,26,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, t);
  grd = g.createLinearGradient(0, h, 0, h - t);
  grd.addColorStop(0, `rgba(220,40,26,${a})`); grd.addColorStop(1, 'rgba(220,40,26,0)');
  g.fillStyle = grd; g.fillRect(0, h - t, w, t);
  grd = g.createLinearGradient(0, 0, t, 0);
  grd.addColorStop(0, `rgba(220,40,26,${a})`); grd.addColorStop(1, 'rgba(220,40,26,0)');
  g.fillStyle = grd; g.fillRect(0, 0, t, h);
  grd = g.createLinearGradient(w, 0, w - t, 0);
  grd.addColorStop(0, `rgba(220,40,26,${a})`); grd.addColorStop(1, 'rgba(220,40,26,0)');
  g.fillStyle = grd; g.fillRect(w - t, 0, t, h);
}

/* -------------------------------------------------------------- utilities */

function icon(name, size, color) {
  const key = name + '|' + size + '|' + color;
  let c = iconCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = size; c.height = size;
  drawIcon(c.getContext('2d'), name || 'bomb', size, color);
  iconCache.set(key, c);
  return c;
}

function rrect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** gfx/debug.js asks for { alpha: false } and owns the canvas; main.js does not. */
function opaqueContext(g) {
  try { return !!(g.getContextAttributes && g.getContextAttributes().alpha === false); }
  catch { return false; }
}
