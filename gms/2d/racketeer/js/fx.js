// Juice: particles, floating text, speech bubbles, pigeon, screenshake, slow-mo vignette.
import { project, view } from "./court.js";
import { rand, pick, clamp } from "./util.js";

const parts = [];      // particles {x,y,z,vx,vy,vz,life,col,r}
const texts = [];      // floating texts {sx,sy,vy,life,str,col,size,wob}
const bubbles = [];    // speech bubbles {wx,wy,z,str,life,style}
const waves = [];      // expanding noise rings {wx,wy,wz,t,dur,k}
let pigeons = [];
export let shake = 0;
export function addShake(n) { shake = Math.min(22, shake + n); }

export function burst(x, y, z, n, col, spd = 4) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(0.3, 1) * spd;
    parts.push({ x, y, z, vx: Math.cos(a) * v, vy: rand(-1, 1) * v * 0.5, vz: rand(0.5, 1.4) * v,
      life: rand(0.4, 0.9), col: Array.isArray(col) ? pick(col) : col, r: rand(0.03, 0.08) });
  }
}

export function confetti(n = 60) {
  for (let i = 0; i < n; i++) {
    parts.push({ x: rand(-6, 6), y: rand(4, 20), z: rand(4, 7), vx: rand(-1, 1), vy: 0,
      vz: rand(-0.5, -0.1), life: rand(1.5, 3), col: `hsl(${rand(0, 360)},90%,60%)`, r: rand(0.05, 0.1), flut: rand(3, 8) });
  }
}

export function floatText(wx, wy, wz, str, col = "#fff", size = 1) {
  const p = project(wx, wy, wz);
  texts.push({ sx: p.x, sy: p.y, vy: -50, life: 1.3, str, col, size: size * Math.max(16, view.stageW * 0.05), wob: rand(0, 7) });
}

export function bannerText(str, col = "#ffe24a", size = 1.6) {
  texts.push({ sx: view.w / 2, sy: view.h * 0.42, vy: -14, life: 1.8, str, col,
    size: size * Math.max(20, view.stageW * 0.055), wob: rand(0, 7), banner: true });
}

// Banners are plain canvas fillText, so nothing wraps for free — a long commentary
// line used to run off both edges of a phone. Shrink first (keeps one punchy line),
// then wrap onto as many lines as it takes.
function fitBanner(ctx, str, size) {
  const maxW = Math.min(view.w * 0.9, view.stageW * 1.15);
  ctx.font = `900 ${size}px sans-serif`;
  if (ctx.measureText(str).width <= maxW) return { size, lines: [str] };
  const small = Math.max(size * 0.66, 15);
  ctx.font = `900 ${small}px sans-serif`;
  if (ctx.measureText(str).width <= maxW) return { size: small, lines: [str] };
  const lines = [];
  let cur = "";
  for (const w of str.split(" ")) {
    const test = cur ? cur + " " + w : w;
    if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return { size: small, lines };
}

// Speech bubbles. `style` picks the shape: "plain" is a rounded box, "shout" is a
// bigger louder one, and "rage" is the spiky cartoon cloud people yell out of.
export function speech(wx, wy, str, life = 2.2, opts = {}) {
  bubbles.push({ wx, wy, z: opts.z ?? 2.2, str, life, max: life,
    style: opts.style || "plain", col: opts.col || null, scale: opts.scale || 1,
    small: !!opts.small });
}
export function rageSpeech(wx, wy, str, life = 3.4) {
  speech(wx, wy, str, life, { style: "rage", scale: 1.3 });
}
export function shoutSpeech(wx, wy, str, life = 2.8) {
  speech(wx, wy, str, life, { style: "shout", scale: 1.12 });
}

// Expanding rings — a grunt you can see. Bigger `k` = louder.
export function shockwave(wx, wy, wz, k = 1) {
  waves.push({ wx, wy, wz, t: 0, dur: 0.55, k });
}

let dogs = [];
// A dog runs across the court with a ball in its mouth. Non-negotiable.
export function runDog() {
  dogs.push({ t: 0, dur: 3.2, dir: Math.random() < 0.5 ? 1 : -1, y: rand(6, 17) });
}

export function launchPigeon(fromFar) {
  // Pigeon flies from crowd toward the victim's head, flaps about, exits.
  pigeons.push({ t: 0, dur: 2.4, fromFar,
    sx: rand(0, 1) < 0.5 ? -7 : 7, sy: rand(6, 16),
    tx: rand(-1, 1), ty: fromFar ? 21.5 : 2.2 });
}

export function clearFx() { parts.length = 0; texts.length = 0; bubbles.length = 0; waves.length = 0; pigeons = []; dogs = []; shake = 0; }

export function updateFx(dt) {
  shake = Math.max(0, shake - dt * 30);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.flut) { p.vz -= 2 * dt; p.x += Math.sin(p.life * p.flut) * dt; }
    else p.vz -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.z < 0 || p.life <= 0) parts.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.sy += t.vy * dt; t.vy *= 0.95;
    if (t.life <= 0) texts.splice(i, 1);
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    bubbles[i].life -= dt;
    if (bubbles[i].life <= 0) bubbles.splice(i, 1);
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    waves[i].t += dt;
    if (waves[i].t > waves[i].dur) waves.splice(i, 1);
  }
  for (let i = pigeons.length - 1; i >= 0; i--) {
    pigeons[i].t += dt;
    if (pigeons[i].t > pigeons[i].dur) pigeons.splice(i, 1);
  }
  for (let i = dogs.length - 1; i >= 0; i--) {
    dogs[i].t += dt;
    if (dogs[i].t > dogs[i].dur) dogs.splice(i, 1);
  }
}

export function drawFx(ctx) {
  for (const p of parts) {
    const pr = project(p.x, p.y, p.z);
    ctx.fillStyle = p.col;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.beginPath(); ctx.arc(pr.x, pr.y, Math.max(1, pr.s * p.r), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const pg of pigeons) {
    const k = pg.t / pg.dur;
    // Fly in (0-0.4), harass (0.4-0.7), fly off (0.7-1)
    let wx, wy, wz;
    if (k < 0.4) { const u = k / 0.4; wx = pg.sx + (pg.tx - pg.sx) * u; wy = pg.sy + (pg.ty - pg.sy) * u; wz = 3 - u * 1.2; }
    else if (k < 0.7) { const u = (k - 0.4) / 0.3; wx = pg.tx + Math.sin(u * 12) * 0.5; wy = pg.ty; wz = 1.8 + Math.sin(u * 18) * 0.3; }
    else { const u = (k - 0.7) / 0.3; wx = pg.tx + u * 8; wy = pg.ty - u * 3; wz = 1.8 + u * 3; }
    const p = project(wx, wy, wz);
    const s = p.s, flap = Math.sin(pg.t * 26);
    ctx.fillStyle = "#9aa2ad";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 0.18, s * 0.12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#7d8590";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - s * 0.3, p.y - flap * s * 0.22);
    ctx.lineTo(p.x - s * 0.1, p.y); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + s * 0.3, p.y - flap * s * 0.22);
    ctx.lineTo(p.x + s * 0.1, p.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8b23a";
    ctx.beginPath(); ctx.arc(p.x + s * 0.16, p.y - s * 0.02, s * 0.035, 0, 7); ctx.fill();
  }

  for (const dg of dogs) {
    const k = dg.t / dg.dur;
    const wx = dg.dir * (9 - k * 18), wy = dg.y + Math.sin(k * 20) * 0.4;
    const p = project(wx, wy, 0);
    const s = p.s, gallop = Math.sin(dg.t * 18);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 0.45, s * 0.1, 0, 0, 7); ctx.fill();
    // Body + head + ears + tail, mid-gallop
    ctx.fillStyle = "#b3763e";
    ctx.beginPath(); ctx.ellipse(p.x, p.y - s * 0.3 - Math.abs(gallop) * s * 0.08, s * 0.4, s * 0.22, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + dg.dir * -s * 0.42, p.y - s * 0.44, s * 0.16, 0, 7); ctx.fill();
    ctx.strokeStyle = "#b3763e"; ctx.lineWidth = s * 0.08; ctx.lineCap = "round";
    for (const off of [-0.22, 0.2]) {
      ctx.beginPath(); ctx.moveTo(p.x + off * s, p.y - s * 0.2);
      ctx.lineTo(p.x + off * s + gallop * s * 0.15, p.y); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(p.x + dg.dir * s * 0.38, p.y - s * 0.36);
    ctx.lineTo(p.x + dg.dir * s * 0.58, p.y - s * 0.52 + gallop * s * 0.06); ctx.stroke();
    // The stolen ball
    ctx.fillStyle = "#d8ec4a";
    ctx.beginPath(); ctx.arc(p.x + dg.dir * -s * 0.56, p.y - s * 0.42, s * 0.08, 0, 7); ctx.fill();
  }

  for (const w of waves) {
    const k = w.t / w.dur;
    const p = project(w.wx, w.wy, w.wz);
    ctx.globalAlpha = (1 - k) * 0.7;
    ctx.strokeStyle = "#ffe24a";
    for (let i = 0; i < 3; i++) {
      const r = p.s * (0.3 + 2.2 * w.k) * (k + i * 0.22);
      if (r <= 0) continue;
      ctx.lineWidth = Math.max(1, 3 * (1 - k));
      ctx.beginPath(); ctx.ellipse(p.x, p.y - p.s * 1.3, r, r * 0.55, 0, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  for (const b of bubbles) drawBubble(ctx, b);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const t of texts) {
    const a = Math.min(1, t.life * 2.2);
    ctx.globalAlpha = a;
    const wob = t.banner ? Math.sin(t.life * 9 + t.wob) * 0.03 : 0;
    const fit = t.banner ? fitBanner(ctx, t.str, t.size) : { size: t.size, lines: [t.str] };
    ctx.save();
    ctx.translate(t.sx, t.sy); ctx.rotate(wob);
    ctx.font = `900 ${fit.size}px sans-serif`;
    ctx.lineWidth = fit.size * 0.14; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineJoin = "round";
    ctx.fillStyle = t.col;
    const lh = fit.size * 1.08, y0 = -(fit.lines.length - 1) * lh / 2;
    for (let i = 0; i < fit.lines.length; i++) {
      ctx.strokeText(fit.lines[i], 0, y0 + i * lh);
      ctx.fillText(fit.lines[i], 0, y0 + i * lh);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function wrapLines(ctx, str, maxW) {
  const lines = [];
  let cur = "";
  for (const w of str.split(" ")) {
    const test = cur ? cur + " " + w : w;
    if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// The jagged cloud a cartoon character yells out of. Alternating radii around an
// ellipse, so the spikes sit proud of the text block on every side.
function spikyPath(ctx, rx, ry, spikes, spike, phase) {
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + phase;
    const k = i % 2 ? 1 : 1 + spike;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawBubble(ctx, b) {
  const p = project(b.wx, b.wy, b.z);
  const rage = b.style === "rage", loud = rage || b.style === "shout";
  ctx.globalAlpha = Math.min(1, b.life * 2, (b.max - b.life) * 6);

  const maxW = Math.min(view.stageW * 0.74, view.w - 34);
  let fs = Math.max(11, view.stageW * 0.034) * b.scale * (b.small ? 0.78 : 1);
  const font = () => ctx.font = `${loud ? 900 : "bold"} ${fs}px sans-serif`;
  font();
  let lines = wrapLines(ctx, b.str, maxW);
  while (lines.length > 3 && fs > 10) { fs -= 1; font(); lines = wrapLines(ctx, b.str, maxW); }
  if (!lines.length) return;                 // nothing to say

  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  const lh = fs * 1.18;
  const padX = fs * (rage ? 1.0 : 0.55), padY = fs * (rage ? 0.8 : 0.4);
  const bw = tw + padX * 2, bh = lines.length * lh + padY * 2;
  // Rage bubbles get a spiky border outside the box, so they need room for it.
  const halo = rage ? Math.max(bw, bh) * 0.1 : 0;
  const cx = clamp(p.x, bw / 2 + halo + 6, view.w - bw / 2 - halo - 6);
  const cy = Math.max(bh / 2 + halo + 8, p.y - bh / 2 - fs * 1.4);
  const wob = rage ? Math.sin(b.life * 34) * 2.2 : 0;

  // Tail first, hidden under the body — it reads as poking out of the bubble.
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(cx - fs * 0.34, cy); ctx.lineTo(cx + fs * 0.34, cy);
  ctx.lineTo(p.x, p.y - fs * 0.3); ctx.closePath(); ctx.fill();

  ctx.save();
  ctx.translate(cx + wob, cy);
  if (rage) {
    spikyPath(ctx, bw / 2, bh / 2, 20, 0.19, b.life * 1.5);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.strokeStyle = "#c1121f"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, fs * 0.55);
    ctx.fillStyle = "#fff"; ctx.fill();
    if (loud) { ctx.strokeStyle = "#e8a020"; ctx.lineWidth = 2.5; ctx.stroke(); }
  }
  ctx.fillStyle = b.col || (rage ? "#c1121f" : "#111");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const y0 = -(lines.length - 1) * lh / 2;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, y0 + i * lh);
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawZoneVignette(ctx, strength) {
  if (strength <= 0) return;
  const g = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.25, view.w / 2, view.h / 2, view.h * 0.75);
  g.addColorStop(0, "rgba(120,60,220,0)");
  g.addColorStop(1, `rgba(120,60,220,${0.35 * strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
}
