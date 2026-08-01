// Pseudo-3D projection + court/crowd/umpire rendering.
// World: x lateral (0 = centre), y depth (0 = near baseline .. L = far baseline), z up. Metres.
import { COURT, CAM } from "./const.js";
import { clamp, lerp } from "./util.js";

export const view = { w: 0, h: 0, dpr: 1, stageW: 0 };

// The game is drawn portrait. Let the court stretch to the full width of a desktop
// window and it becomes a comically wide letterbox, so the playing area is capped
// at a bit under one screen-height wide, centred — and the space left over at the
// sides fills with crowd instead.
const STAGE_MAX_AR = 0.85;

export function resize(canvas) {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth; view.h = window.innerHeight;
  view.stageW = Math.min(view.w, view.h * STAGE_MAX_AR);
  // Published so the DOM menus can hug the same centre column as the court.
  document.documentElement.style.setProperty("--stage-w", view.stageW + "px");
  canvas.width = view.w * view.dpr; canvas.height = view.h * view.dpr;
  canvas.getContext("2d").setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  reseedCrowd();
}

const f = (y) => 1 / (y + CAM.DEPTH);

export function pxPerM(y) {
  return (view.stageW * 1.06 / COURT.W) * (CAM.DEPTH * f(y));
}

export function groundY(y) {
  const fNear = f(-1.2), fFar = f(COURT.L + CAM.DEPTH * 1.45);
  const u = (fNear - f(y)) / (fNear - fFar);
  return view.h * CAM.NEAR - u * view.h * (CAM.NEAR - CAM.HORIZON);
}

export function project(x, y, z) {
  const s = pxPerM(y);
  return { x: view.w / 2 + x * s, y: groundY(y) - (z || 0) * s * 0.95, s };
}

function line(ctx, x1, y1, x2, y2) {
  const a = project(x1, y1, 0), b = project(x2, y2, 0);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function quad(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const p = project(x, y, 0);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.closePath(); ctx.fill();
}

// Crowd members are stable per-match; seeded on setCrowd() and again on resize,
// because how far out they have to reach depends on the window.
let crowd = [], crowdN = 0;
const SKINS = ["#f2c79c", "#d9a066", "#a56a3a", "#7c4a24", "#ffdbac"];

// How far out (in metres) the crowd has to go at this depth to reach the edge of
// the frame. On a phone that's barely past the run-off; on a desktop it's miles.
function edgeX(y) { return (view.w / 2 + 40) / pxPerM(y); }

export function setCrowd(n) { crowdN = n; reseedCrowd(); }

export function reseedCrowd() {
  crowd = [];
  if (!crowdN || !view.stageW) return;
  // Seats are laid out in rows that stay evenly spaced ON SCREEN, so they read as
  // banked seating rather than people scattered on a lawn. How many of those seats
  // actually have somebody in them is the venue's business: a Tesco car park gets a
  // sprinkling, Centre Court gets a wall of faces.
  const density = clamp(crowdN / 70, 0.07, 0.92);
  const inner = COURT.W / 2 + COURT.MARGIN_X + 0.5;   // outside the run-off, not on it
  // Nothing in front of the near baseline: at that depth a spectator fills a third
  // of the screen, and the run-off has nowhere to put them anyway.
  const yMin = -1.2, yMax = COURT.L + COURT.MARGIN_Y + 2;
  for (let y = yMin; y < yMax; y += 0.9 + Math.max(0, y + 1.2) * 0.055) {
    const step = Math.max(0.85, 34 / pxPerM(y));
    const out = edgeX(y);
    for (let x = inner; x < out; x += step) {
      // Courtside fills before the cheap seats, so a quiet venue still looks like a
      // venue rather than a scattering of people in a field.
      const near = density * lerp(1.5, 0.55, (x - inner) / Math.max(1, out - inner));
      for (const side of [-1, 1]) {
        if (Math.random() > near) continue;
        crowd.push({
          x: side * (x + Math.random() * step * 0.6),
          y: y + Math.random() * 0.6,
          hue: Math.floor(Math.random() * 360),
          skin: SKINS[Math.floor(Math.random() * SKINS.length)],
          ph: Math.random() * 7, amp: 0.5 + Math.random(),
        });
      }
    }
  }
  crowd.sort((a, b) => b.y - a.y);          // far rows painted first
}

export function drawScene(ctx, t, hype, flash) {
  const { w, h } = view;
  // Sky + stadium backdrop
  const sky = ctx.createLinearGradient(0, 0, 0, h * CAM.HORIZON + 40);
  sky.addColorStop(0, "#0e2a3f"); sky.addColorStop(1, "#1c4a63");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * CAM.HORIZON + 40);
  // Stadium band
  ctx.fillStyle = "#132c1c";
  ctx.fillRect(0, h * CAM.HORIZON - 26, w, 70);
  // Floodlights — pinned to the court, not the window, so they still frame it on a
  // wide screen instead of drifting off to the corners.
  for (const s of [-1, 1]) {
    const fx = w / 2 + s * view.stageW * 0.4;
    ctx.strokeStyle = "#0a1a10"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(fx, h * CAM.HORIZON - 20); ctx.lineTo(fx, h * CAM.HORIZON - 78); ctx.stroke();
    ctx.fillStyle = flash ? "#fff8d0" : "#ffec9e";
    ctx.beginPath(); ctx.ellipse(fx, h * CAM.HORIZON - 84, 16, 9, 0, 0, 7); ctx.fill();
  }

  // Outer ground
  const gr = ctx.createLinearGradient(0, h * CAM.HORIZON, 0, h);
  gr.addColorStop(0, "#2c6e46"); gr.addColorStop(1, "#1c5433");
  ctx.fillStyle = gr; ctx.fillRect(0, h * CAM.HORIZON, w, h * (1 - CAM.HORIZON));

  // Court surface (blue hard court, because it pops)
  const HW = COURT.W / 2, L = COURT.L, MX = COURT.MARGIN_X, MY = COURT.MARGIN_Y;
  ctx.fillStyle = "#2f6d9e";
  quad(ctx, [[-HW - MX, -MY], [HW + MX, -MY], [HW + MX, L + MY], [-HW - MX, L + MY]]);
  ctx.fillStyle = "#3a85c2";
  quad(ctx, [[-HW, 0], [HW, 0], [HW, L], [-HW, L]]);

  // Lines
  ctx.strokeStyle = "rgba(255,255,255,.92)"; ctx.lineWidth = Math.max(1.5, view.stageW / 260);
  line(ctx, -HW, 0, HW, 0); line(ctx, -HW, L, HW, L);           // baselines
  line(ctx, -HW, 0, -HW, L); line(ctx, HW, 0, HW, L);           // sidelines
  const sv = COURT.L / 2 - 5.485;                                // service lines
  line(ctx, -HW, COURT.NET_Y - 5.485, HW, COURT.NET_Y - 5.485);
  line(ctx, -HW, COURT.NET_Y + 5.485, HW, COURT.NET_Y + 5.485);
  line(ctx, 0, COURT.NET_Y - 5.485, 0, COURT.NET_Y + 5.485);    // centre service line
  line(ctx, 0, -0.02, 0, 0.35); line(ctx, 0, L - 0.35, 0, L);   // centre marks

  drawCrowd(ctx, t, hype);
  drawUmpire(ctx, t);
}

// Glowing target box for a serve. `side` is the x sign it must land in; `far` picks
// the opponent's half. Without this the diagonal rule is invisible and feels unfair.
export function drawServeTarget(ctx, side, far, t) {
  const HW = COURT.W / 2;
  const y0 = far ? COURT.NET_Y : COURT.NET_Y - COURT.SVC;
  const y1 = far ? COURT.NET_Y + COURT.SVC : COURT.NET_Y;
  const x0 = side < 0 ? -HW : 0, x1 = side < 0 ? 0 : HW;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
  ctx.fillStyle = `rgba(255,226,74,${0.07 + pulse * 0.07})`;
  quad(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  ctx.strokeStyle = `rgba(255,226,74,${0.45 + pulse * 0.35})`;
  ctx.lineWidth = Math.max(2, view.stageW / 230);
  ctx.beginPath();
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => {
    const p = project(x, y, 0);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.closePath(); ctx.stroke();
}

function drawCrowd(ctx, t, hype) {
  const excite = clamp(hype / 100, 0, 1);
  for (const c of crowd) {
    const bounce = Math.max(0, Math.sin(t * (3 + excite * 6) + c.ph)) * (0.06 + excite * 0.28) * c.amp;
    const p = project(c.x, c.y, bounce);
    const s = p.s;
    ctx.fillStyle = `hsl(${c.hue},60%,50%)`;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - s * 0.55, s * 0.34, s * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.arc(p.x, p.y - s * 1.2, s * 0.26, 0, 7); ctx.fill();
    if (excite > 0.55) { // arms up when hyped
      ctx.strokeStyle = c.skin; ctx.lineWidth = s * 0.12;
      ctx.beginPath(); ctx.moveTo(p.x - s * 0.3, p.y - s * 0.8); ctx.lineTo(p.x - s * 0.55, p.y - s * 1.45);
      ctx.moveTo(p.x + s * 0.3, p.y - s * 0.8); ctx.lineTo(p.x + s * 0.55, p.y - s * 1.45); ctx.stroke();
    }
  }
}

let umpireWake = 0;
export function pokeUmpire() { umpireWake = 3; }

function drawUmpire(ctx, t) {
  umpireWake = Math.max(0, umpireWake - 0.016);
  const x = COURT.W / 2 + 1.7, y = COURT.NET_Y;
  const p = project(x, y, 0), s = p.s;
  // Tall chair
  ctx.strokeStyle = "#5d4a2f"; ctx.lineWidth = s * 0.14;
  ctx.beginPath();
  ctx.moveTo(p.x - s * 0.4, p.y); ctx.lineTo(p.x - s * 0.25, p.y - s * 2.1);
  ctx.moveTo(p.x + s * 0.4, p.y); ctx.lineTo(p.x + s * 0.25, p.y - s * 2.1);
  ctx.stroke();
  ctx.fillStyle = "#7a5f3a";
  ctx.fillRect(p.x - s * 0.45, p.y - s * 2.35, s * 0.9, s * 0.35);
  // Umpire body + head (dozes: head tilts unless poked)
  const doze = umpireWake > 0 ? 0 : Math.sin(t * 0.9) * 0.12 + 0.18;
  ctx.fillStyle = "#20304a";
  ctx.beginPath(); ctx.ellipse(p.x, p.y - s * 2.55, s * 0.3, s * 0.38, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#e8b88a";
  ctx.beginPath(); ctx.arc(p.x + doze * s * 0.4, p.y - s * 3.0 + doze * s * 0.25, s * 0.22, 0, 7); ctx.fill();
  if (umpireWake > 0) { // startled "!"
    ctx.fillStyle = "#ffe24a"; ctx.font = `bold ${s * 0.5}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("!", p.x, p.y - s * 3.5);
  }
}

export function drawNet(ctx) {
  const HW = COURT.W / 2 + 0.9;
  const a = project(-HW, COURT.NET_Y, 0), b = project(HW, COURT.NET_Y, 0);
  const at = project(-HW, COURT.NET_Y, COURT.NET_H), bt = project(HW, COURT.NET_Y, COURT.NET_H);
  // Mesh
  ctx.fillStyle = "rgba(20,30,40,.55)";
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(bt.x, bt.y); ctx.lineTo(at.x, at.y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(230,240,250,.35)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    ctx.beginPath();
    ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    ctx.lineTo(at.x + (bt.x - at.x) * t, at.y + (bt.y - at.y) * t);
    ctx.stroke();
  }
  // Tape
  ctx.strokeStyle = "#f5f5f5"; ctx.lineWidth = Math.max(2, view.stageW / 200);
  ctx.beginPath(); ctx.moveTo(at.x, at.y); ctx.lineTo(bt.x, bt.y); ctx.stroke();
  // Posts
  ctx.strokeStyle = "#222"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(at.x, at.y); ctx.moveTo(b.x, b.y); ctx.lineTo(bt.x, bt.y); ctx.stroke();
}
