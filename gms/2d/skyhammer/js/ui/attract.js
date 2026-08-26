// The title-screen backdrop: a live, no-player AI dogfight over a dawn landscape.
// Self-contained canvas so it works before gfx/renderer.js exists; see UI_NOTES "attract swap".

import { makeRng } from '../core/rng.js';
import { drawPlane } from './icons.js';
import { prefs } from './prefs.js';

// farmland/dawn from ART.md §4, weighted so the blue keeps the top third
const SKY = [[0, '#41689a'], [0.30, '#6e7ba4'], [0.56, '#a5849f'], [0.78, '#e2a184'], [0.93, '#f7c68e'], [1, '#ffdfae']];
const EARTH = '#2b2016';

let host = null, cv = null, g = null, raf = 0, last = 0, t = 0;
let W = 0, H = 0, dpr = 1;
let clouds = [], planes = [], shots = [], booms = [], hills = null;
let rng = makeRng(20260826);

export function startAttract(parent) {
  stopAttract();
  host = parent;
  cv = document.createElement('canvas');
  cv.className = 'attract-cv';
  host.appendChild(cv);
  g = cv.getContext('2d', { alpha: false });
  resize();
  window.addEventListener('resize', resize);
  seed();
  last = performance.now();
  raf = requestAnimationFrame(tick);
  return cv;
}

export function stopAttract() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
  cv = null; g = null; host = null;
}

function resize() {
  if (!cv || !host) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = host.clientWidth || window.innerWidth;
  H = host.clientHeight || window.innerHeight;
  cv.width = Math.max(1, Math.round(W * dpr));
  cv.height = Math.max(1, Math.round(H * dpr));
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  hills = null;
  clouds.forEach((c) => { c.y = c.yf * H; });
}

/* ------------------------------------------------------------ prerendered art */

function cloudSprite(w, h, warm) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const blobs = 7 + Math.floor(rng.f() * 5);
  for (let i = 0; i < blobs; i++) {
    const bx = w * (0.12 + rng.f() * 0.76);
    const by = h * (0.34 + rng.f() * 0.42);
    const br = h * (0.24 + rng.f() * 0.30);
    const grd = x.createRadialGradient(bx, by - br * 0.3, br * 0.1, bx, by, br);
    grd.addColorStop(0, `rgba(255,${warm ? 232 : 244},${warm ? 214 : 250},0.95)`);
    grd.addColorStop(0.6, `rgba(${warm ? 246 : 226},${warm ? 208 : 232},${warm ? 196 : 242},0.42)`);
    grd.addColorStop(1, 'rgba(220,214,214,0)');
    x.fillStyle = grd;
    x.beginPath();
    x.ellipse(bx, by, br * 1.7, br, 0, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function seed() {
  rng = makeRng(20260826);
  clouds = [];
  for (let i = 0; i < 18; i++) {
    const band = i < 6 ? 0 : i < 12 ? 1 : 2;
    const w = 190 + rng.f() * 260;
    clouds.push({
      sp: cloudSprite(Math.round(w), Math.round(w * 0.30), band > 0),
      x: rng.f() * 1600 - 200,
      yf: band === 0 ? 0.08 + rng.f() * 0.14 : band === 1 ? 0.26 + rng.f() * 0.16 : 0.44 + rng.f() * 0.14,
      y: 0,
      w,
      par: band === 0 ? 6 : band === 1 ? 12 : 22,
      a: band === 0 ? 0.34 : band === 1 ? 0.30 : 0.26,
    });
  }
  clouds.forEach((c) => { c.y = c.yf * H; });

  planes = [];
  for (let i = 0; i < 6; i++) planes.push(spawnPlane(i % 2, i < 4 ? 0 : 1));
  shots = [];
  booms = [];
}

// Two lanes: high sky and low over the ridge. The middle belongs to the logo.
const LANES = [[0.05, 0.25], [0.60, 0.74]];

function spawnPlane(team, lane) {
  const shapes = team ? ['biplane', 'monoplane'] : ['fighter', 'monoplane'];
  const ln = lane != null ? lane : (rng.f() < 0.55 ? 0 : 1);
  const [lo, hi] = LANES[ln];
  return {
    team, lane: ln, lo, hi,
    shape: shapes[Math.floor(rng.f() * shapes.length)],
    x: rng.f() * 1.2 - 0.1,      // normalised 0..1 of width
    y: lo + rng.f() * (hi - lo),
    ang: rng.f() * Math.PI * 2,
    sp: 0.10 + rng.f() * 0.06,
    turn: 1.1 + rng.f() * 0.9,
    len: 40 + rng.f() * 18,
    cool: rng.f() * 2,
    hp: 1,
    smoke: 0,
  };
}

/* ------------------------------------------------------------------- the loop */

function tick(now) {
  raf = requestAnimationFrame(tick);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  t += dt;
  step(dt);
  draw();
}

function step(dt) {
  const ar = W / Math.max(1, H);
  for (const p of planes) {
    // pick the nearest enemy and turn toward it
    let best = null, bd = 1e9;
    for (const q of planes) {
      if (q.team === p.team || q.hp <= 0) continue;
      const dx = (q.x - p.x) * ar, dy = q.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = q; }
    }
    if (best) {
      const want = Math.atan2(best.y - p.y, (best.x - p.x) * ar);
      let d = want - p.ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.ang += Math.max(-p.turn * dt, Math.min(p.turn * dt, d));
      p.cool -= dt;
      if (p.cool <= 0 && bd < 0.16 && Math.abs(d) < 0.35) {
        p.cool = 0.9 + rng.f() * 0.8;
        shots.push({ x: p.x, y: p.y, ang: p.ang, ttl: 0.55, team: p.team, tgt: best });
      }
    }
    p.x += Math.cos(p.ang) * p.sp * dt / ar;
    p.y += Math.sin(p.ang) * p.sp * dt;
    // soft box: nudge back in rather than teleport
    if (p.y < p.lo) p.ang += 2.2 * dt;
    if (p.y > p.hi) p.ang -= 2.2 * dt;
    if (p.x < -0.12 || p.x > 1.12) { const ln = p.lane; Object.assign(p, spawnPlane(p.team, ln)); p.x = p.x < 0 ? -0.1 : 1.1; }
    if (p.smoke > 0) p.smoke -= dt;
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.ttl -= dt;
    s.x += Math.cos(s.ang) * 0.9 * dt / ar;
    s.y += Math.sin(s.ang) * 0.9 * dt;
    if (s.ttl <= 0) {
      shots.splice(i, 1);
      if (s.tgt && s.tgt.hp > 0 && rng.f() < 0.34) {
        s.tgt.smoke = 2.4;
        if (rng.f() < 0.45) {
          booms.push({ x: s.tgt.x, y: s.tgt.y, t: 0 });
          Object.assign(s.tgt, spawnPlane(s.tgt.team, s.tgt.lane));
          s.tgt.x = s.team ? 1.12 : -0.12;
        }
      }
    }
  }

  for (let i = booms.length - 1; i >= 0; i--) {
    booms[i].t += dt;
    if (booms[i].t > 1.1) booms.splice(i, 1);
  }
}

/* ---------------------------------------------------------------------- draw */

function draw() {
  if (!g) return;
  const horizon = H * 0.80;

  const grd = g.createLinearGradient(0, 0, 0, horizon);
  for (const [at, col] of SKY) grd.addColorStop(at, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // the sun sitting just above the horizon — the reference's hot spot
  const sunX = W * 0.66, sunY = horizon - H * 0.20;
  const sun = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.42);
  sun.addColorStop(0, 'rgba(255,244,206,0.95)');
  sun.addColorStop(0.10, 'rgba(255,214,140,0.72)');
  sun.addColorStop(0.42, 'rgba(255,176,96,0.26)');
  sun.addColorStop(1, 'rgba(255,176,96,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, horizon);

  // horizon bloom

  for (const c of clouds) {
    const x = ((c.x - t * c.par) % (W + c.w + 400)) + (W + c.w + 400);
    g.globalAlpha = c.a;
    g.drawImage(c.sp, (x % (W + c.w + 400)) - c.w - 100, c.y, c.w, c.w * 0.30);
    g.globalAlpha = 1;
  }

  drawHills(horizon);

  for (const s of shots) {
    g.strokeStyle = s.team ? 'rgba(255,220,150,0.9)' : 'rgba(255,240,210,0.9)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(s.x * W, s.y * H);
    g.lineTo(s.x * W - Math.cos(s.ang) * 16, s.y * H - Math.sin(s.ang) * 16);
    g.stroke();
  }

  for (const p of planes) {
    const px = p.x * W, py = p.y * H;
    if (p.smoke > 0) {
      for (let i = 0; i < 5; i++) {
        const k = i / 5;
        g.fillStyle = `rgba(60,55,52,${0.22 * (1 - k) * Math.min(1, p.smoke)})`;
        g.beginPath();
        g.arc(px - Math.cos(p.ang) * (14 + k * 60), py - Math.sin(p.ang) * (14 + k * 60), 4 + k * 13, 0, Math.PI * 2);
        g.fill();
      }
    }
    const ph = p.len * 0.42;
    g.save();
    g.translate(px, py);
    g.rotate(p.ang);
    if (Math.cos(p.ang) < 0) g.scale(-1, -1);   // flying left: mirror, never upside-down
    g.translate(-p.len / 2, -ph / 2);
    drawPlane(g, p.shape, p.len, ph);
    g.restore();
  }

  for (const b of booms) {
    const k = b.t / 1.1;
    const r = 8 + k * 46;
    const bg = g.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, r);
    bg.addColorStop(0, `rgba(255,250,220,${(1 - k) * 0.95})`);
    bg.addColorStop(0.35, `rgba(255,150,50,${(1 - k) * 0.8})`);
    bg.addColorStop(1, 'rgba(60,50,45,0)');
    g.fillStyle = bg;
    g.beginPath(); g.arc(b.x * W, b.y * H, r, 0, Math.PI * 2); g.fill();
  }

  // a soft warm bloom over everything, ART.md §1
  if (!prefs.reduceFx) {
    const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,12,6,0.14)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }
}

function drawHills(horizon) {
  if (!hills || hills.w !== W) {
    hills = { w: W, far: ridge(W, H * 0.19, 0.9, 7), mid: ridge(W, H * 0.11, 1.7, 13) };
  }
  // far hazed ridge
  g.fillStyle = 'rgba(148,142,164,0.52)';
  band(hills.far, horizon - H * 0.055);
  g.fillStyle = 'rgba(78,68,78,0.86)';
  band(hills.mid, horizon - H * 0.014);

  // earth band — a shallow arc, nearly a silhouette
  g.fillStyle = EARTH;
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, horizon + H * 0.035);
  g.quadraticCurveTo(W * 0.5, horizon - H * 0.045, W, horizon + H * 0.035);
  g.lineTo(W, H);
  g.closePath();
  g.fill();

  g.strokeStyle = 'rgba(255,190,120,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, horizon + H * 0.035);
  g.quadraticCurveTo(W * 0.5, horizon - H * 0.045, W, horizon + H * 0.035);
  g.stroke();
}

function ridge(w, amp, freq, n) {
  const r = makeRng(4477 + n);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const peak = r.f() < 0.45 ? 1 : 0.35 + r.f() * 0.4;   // real peaks, not a rolling wave
    pts.push({ x: (i / n) * w, y: -amp * peak });
  }
  return { pts, amp, freq };
}

function band(rg, baseY) {
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, baseY + rg.pts[0].y * 0.4);
  for (const p of rg.pts) g.lineTo(p.x, baseY + p.y);
  g.lineTo(W, baseY + rg.pts[rg.pts.length - 1].y * 0.4);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}
