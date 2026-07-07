// ---- procedural pixel-art sprite baking (players, ball, badges) ----
// Chibi players painted with rects on a 14x18 art-pixel grid, baked at 2x
// into per-player sheets: 8 direction rows x 12 pose columns.
import { DIR8_VEC } from './util.js';

export const POSE = {
  IDLE: 0, RUN0: 1, RUN1: 2, RUN2: 3, RUN3: 4,
  KICK: 5, SLIDE: 6, FALL: 7, CELEB0: 8, CELEB1: 9, DIVEL: 10, DIVER: 11,
};
export const S = 2;                 // art pixel -> canvas px
export const CELL_W = 14 * S;       // 28
export const CELL_H = 18 * S;       // 36
export const ANCHOR_X = 7 * S;      // sprite anchor: bottom-centre
export const ANCHOR_Y = 17 * S;

export const SKINS = ['#f0c8a0', '#d9a066', '#b07a4a', '#8a5a32', '#6b4226'];
export const HAIRS = ['#241809', '#4a2f18', '#8a5a24', '#c9922f', '#111111', '#666666', '#b03a2e', '#e8e0d0'];
export const BOOT = '#1c1c1c';

const sheetCache = new Map();

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x) * S, Math.round(y) * S, Math.round(w) * S, Math.round(h) * S);
}

// paint one pose into current cell (translated ctx), dir = 8-way index
function paintPlayer(ctx, dirIdx, pose, look) {
  const [dx, dy] = DIR8_VEC[dirIdx];
  const px_ = (x, y, w, h, c) => px(ctx, x, y, w, h, c);
  const perpX = -dy, perpY = dx;
  const cx = 7; // centre column, ground at y 17
  const { kit, skin, hair, style } = look;

  // ----- lying poses (slide / fall / keeper dive) -----
  if (pose === POSE.SLIDE || pose === POSE.FALL || pose === POSE.DIVEL || pose === POSE.DIVER) {
    let ax = dx, ay = dy;
    if (pose === POSE.DIVEL) { ax = -1; ay = 0; }
    if (pose === POSE.DIVER) { ax = 1; ay = 0; }
    const gy = 15; // body line
    // legs trailing
    px_(cx - ax * 5 - 1, gy - ay * 5, 2, 2, kit.socks);
    px_(cx - ax * 3 - 1, gy - ay * 3, 2, 2, kit.shorts);
    // torso
    px_(cx - ax * 1 - 2, gy - ay * 1 - 1, 5, 3, kit.shirt);
    // head ahead
    px_(cx + ax * 3 - 1, gy + ay * 3 - 1, 3, 3, skin);
    px_(cx + ax * 3 - 1, gy + ay * 3 - 2, 3, 1, style === 2 ? skin : hair);
    // arms reaching (dive) or one up (slide)
    if (pose === POSE.DIVEL || pose === POSE.DIVER) {
      px_(cx + ax * 5, gy - 1, 1, 1, kit.sleeve);
      px_(cx + ax * 6, gy - 1, 1, 1, skin);
      px_(cx + ax * 5, gy + 1, 1, 1, kit.sleeve);
    } else {
      px_(cx - ax * 1, gy - 3, 1, 2, kit.sleeve);
      px_(cx + ax * 4, gy + 1, 1, 1, skin);
    }
    // boots
    px_(cx - ax * 6 - 1, gy - ay * 6, 2, 1, BOOT);
    return;
  }

  // ----- standing poses -----
  const celeb = pose === POSE.CELEB0 || pose === POSE.CELEB1;
  const jump = pose === POSE.CELEB1 ? 2 : 0;
  let strideA = 0, bob = 0;
  if (pose >= POSE.RUN0 && pose <= POSE.RUN3) {
    const f = pose - POSE.RUN0;
    strideA = [2, 0, -2, 0][f];
    bob = (f === 0 || f === 2) ? 1 : 0;
  }
  const oy = -bob - jump; // vertical offset (up is negative)

  // legs: two blocks either side of perp axis
  const legOff = 1.6;
  for (let s_ = -1; s_ <= 1; s_ += 2) {
    let lx = cx + perpX * legOff * s_ - 1;
    let ly = 13 + oy;
    let st = strideA * s_;
    if (pose === POSE.KICK && s_ === 1) st = 3.5;       // kicking leg extended
    if (pose === POSE.CELEB1) st = 0;
    lx += dx * st * 0.5;
    const lyOff = dy * st * 0.5;
    px_(lx, ly + lyOff, 2, 1, skin);                      // thigh
    px_(lx, ly + 1 + lyOff, 2, 2, kit.socks);             // sock
    px_(lx + dx * 0.5, ly + 3 + lyOff * 1.2, 2, 1, BOOT); // boot
  }

  // shorts
  px_(cx - 3, 11 + oy, 6, 2, kit.shorts);
  // torso: narrower in profile (shirt colour must dominate for team reading)
  const tw = Math.abs(dx) > 0.6 ? 5 : 6;
  px_(cx - tw / 2, 6 + oy, tw, 5, kit.shirt);
  // sleeve trim: single row at shoulders
  px_(cx - tw / 2, 6 + oy, 1, 1, kit.sleeve);
  px_(cx + tw / 2 - 1, 6 + oy, 1, 1, kit.sleeve);

  // arms in shirt colour with skin hands
  const armOff = tw / 2 + 1;
  for (let s_ = -1; s_ <= 1; s_ += 2) {
    const axp = cx + perpX * armOff * s_ - 0.5;
    if (celeb) {
      px_(axp, 3 + oy, 1, 3, kit.shirt);
      px_(axp, 2 + oy, 1, 1, skin);
    } else {
      let swing = -strideA * s_ * 0.5;
      if (pose === POSE.KICK) swing = s_ === 1 ? -2 : 2;
      px_(axp + dx * swing * 0.4, 7 + oy + dy * swing * 0.3, 1, 2, kit.shirt);
      px_(axp + dx * swing * 0.4, 9 + oy + dy * swing * 0.3, 1, 1, skin);
    }
  }

  // head (offset slightly toward facing)
  const hx = cx + dx * 0.9 - 2, hy = 2 + oy + (dy > 0.4 ? 0.5 : 0);
  px_(hx, hy, 4, 4, skin);
  // hair by style: 0 buzz, 1 mop, 2 bald, 3 long
  if (style !== 2) {
    px_(hx, hy, 4, 1, hair);
    if (style >= 1) px_(hx, hy + 1, 4, 1, hair);
    if (style === 3 && dy < 0.4) px_(hx + 1, hy + 4, 2, 1, hair);
    if (dy < -0.4) px_(hx, hy + 1, 4, 2, hair); // back of head
  }
  // face hint when visible
  if (dy > 0.4) px_(hx + 1, hy + 2, 2, 1, 'rgba(0,0,0,0.55)');
  else if (Math.abs(dx) > 0.6 && dy > -0.5) px_(hx + (dx > 0 ? 3 : 0), hy + 2, 1, 1, 'rgba(0,0,0,0.55)');
}

// kit = {shirt, sleeve, shorts, socks}; look adds skin/hair/style per player
export function bakePlayerSheet(look) {
  const key = JSON.stringify(look);
  let c = sheetCache.get(key);
  if (c) return c;
  if (sheetCache.size > 120) sheetCache.clear(); // bound memory across long careers
  c = document.createElement('canvas');
  c.width = CELL_W * 12; c.height = CELL_H * 8;
  const ctx = c.getContext('2d');
  for (let d = 0; d < 8; d++) {
    for (let p = 0; p < 12; p++) {
      ctx.save();
      ctx.translate(p * CELL_W, d * CELL_H);
      paintPlayer(ctx, d, p, look);
      ctx.restore();
    }
  }
  sheetCache.set(key, c);
  return c;
}

export function drawSprite(ctx, sheet, dirIdx, pose, x, y) {
  ctx.drawImage(sheet, pose * CELL_W, dirIdx * CELL_H, CELL_W, CELL_H,
    Math.round(x - ANCHOR_X), Math.round(y - ANCHOR_Y), CELL_W, CELL_H);
}

// ---- ball: 4 rotation frames ----
let ballSheet = null;
export const BALL_FRAMES = 4, BALL_SIZE = 12;
export function bakeBall() {
  if (ballSheet) return ballSheet;
  const c = document.createElement('canvas');
  c.width = BALL_SIZE * BALL_FRAMES; c.height = BALL_SIZE;
  const ctx = c.getContext('2d');
  for (let f = 0; f < BALL_FRAMES; f++) {
    const ox = f * BALL_SIZE + 6, oy = 6;
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9c9c9';
    ctx.beginPath(); ctx.arc(ox + 1.5, oy + 1.5, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f4f4';
    ctx.beginPath(); ctx.arc(ox - 0.5, oy - 0.5, 3.8, 0, Math.PI * 2); ctx.fill();
    // rotating patches
    ctx.fillStyle = '#222';
    const a = (f / BALL_FRAMES) * Math.PI;
    for (let k = 0; k < 3; k++) {
      const t = a + k * (Math.PI * 2 / 3);
      ctx.fillRect(ox + Math.cos(t) * 2.6 - 1, oy + Math.sin(t) * 2.6 - 1, 2, 2);
    }
  }
  ballSheet = c;
  return c;
}

// ---- team badge (used in menus & hub) ----
// style 0 shield, 1 circle, 2 diamond, 3 star-ish
export function drawBadge(ctx, style, c1, c2, x, y, size) {
  const s = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = '#f2ecd8';
  ctx.fillStyle = c1;
  ctx.beginPath();
  if (style === 0) { // shield
    ctx.moveTo(-s, -s * 0.9); ctx.lineTo(s, -s * 0.9); ctx.lineTo(s, s * 0.2);
    ctx.quadraticCurveTo(s, s * 0.75, 0, s); ctx.quadraticCurveTo(-s, s * 0.75, -s, s * 0.2);
    ctx.closePath();
  } else if (style === 1) {
    ctx.arc(0, 0, s * 0.95, 0, Math.PI * 2);
  } else if (style === 2) {
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.9, 0); ctx.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.55 : s * 0.98;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  ctx.clip();
  ctx.fillStyle = c2;
  if (style === 1) { ctx.fillRect(-s, -s * 0.33, size, s * 0.66); }
  else { ctx.fillRect(-s, 0, size, size); ctx.fillStyle = c1; }
  if (style === 0) { ctx.fillStyle = c2; ctx.fillRect(-s * 0.2, -s, s * 0.4, size * 2); }
  ctx.restore();
}
