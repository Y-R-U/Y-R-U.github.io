import { PHYS, COURT, BALL_R } from "./const.js";
import { project } from "./court.js";

export function makeBall() {
  return { x: 0, y: 2, z: 1, vx: 0, vy: 0, vz: 0, live: false, bounces: 0,
    lastHitBy: null, trail: [], spinT: 0, curve: 0, wind: 0 };
}

// Advance physics; returns "bounce" | "net" | null events via callback.
export function stepBall(b, dt, onEvent) {
  if (!b.live) return;
  const prevY = b.y;
  b.vz += PHYS.G * dt;
  b.vx += (b.curve + b.wind) * dt;          // sidespin curve + event wind
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.vx *= PHYS.AIR_DRAG; b.vy *= PHYS.AIR_DRAG;
  b.spinT += dt * 12;

  // Net collision — crossing the net plane below tape height
  const crossed = (prevY - COURT.NET_Y) * (b.y - COURT.NET_Y) < 0;
  if (crossed) {
    const t = (COURT.NET_Y - prevY) / (b.y - prevY);
    const zAt = b.z - b.vz * dt * (1 - t);
    if (zAt < COURT.NET_H + BALL_R && Math.abs(b.x) < COURT.W / 2 + 1) {
      onEvent && onEvent("net", { zAt });
      // Ball dies at the net: drop it on the hitter's side
      b.y = COURT.NET_Y + (prevY < COURT.NET_Y ? -0.25 : 0.25);
      b.vy = -b.vy * 0.08; b.vx *= 0.2; b.vz = Math.min(b.vz, 0);
    } else if (zAt < COURT.NET_H + BALL_R + 0.12 && Math.abs(b.x) < COURT.W / 2 + 1) {
      onEvent && onEvent("netcord", { zAt });   // clipped the tape
      b.vy *= 0.55; b.vz = Math.max(b.vz * 0.4, 1.2);
    }
  }

  // Ground bounce
  if (b.z <= BALL_R && b.vz < 0) {
    b.z = BALL_R;
    b.vz = -b.vz * PHYS.BOUNCE;
    b.vx *= 0.85; b.vy *= 0.82;
    b.curve *= 0.35;                        // spin scrubs off on the bounce
    b.bounces++;
    onEvent && onEvent("bounce", { x: b.x, y: b.y });
  }

  b.trail.push({ x: b.x, y: b.y, z: b.z, a: 1 });
  if (b.trail.length > 9) b.trail.shift();
  for (const t of b.trail) t.a *= 0.82;
}

// Landing spot prediction (first future bounce) — used by AI and player auto-run.
export function predictLanding(b) {
  let { x, y, z, vx, vy, vz } = b;
  const acc = (b.curve || 0) + (b.wind || 0);
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) {
    vz += PHYS.G * dt; vx += acc * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    vx *= PHYS.AIR_DRAG; vy *= PHYS.AIR_DRAG;
    if (z <= BALL_R && vz < 0) return { x, y, t: i * dt };
  }
  return { x, y, t: 4 };
}

// Predict when/where ball reaches a given depth line (for contact timing).
// Find where/when the receiver can meet the ball: the crossing of `targetY`,
// or — for short balls that would die first — just before the second bounce.
export function predictAtDepth(b, targetY) {
  let { x, y, z, vx, vy, vz } = b;
  let acc = (b.curve || 0) + (b.wind || 0);
  let bounces = b.bounces;
  const dt = 1 / 60;
  if ((targetY - y) * vy <= 0) return null;   // moving away
  let post = null;                            // best point after the first bounce (apex-ish)
  for (let i = 0; i < 300; i++) {
    const py = y;
    vz += PHYS.G * dt; vx += acc * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    vx *= PHYS.AIR_DRAG; vy *= PHYS.AIR_DRAG;
    if (z <= BALL_R && vz < 0) {
      bounces++;
      if (bounces >= 2) return post || { x, y, z: BALL_R, t: i * dt, short: true };
      vz = -vz * PHYS.BOUNCE; vx *= 0.85; vy *= 0.82; acc *= 0.35; z = BALL_R;
    }
    if ((py - targetY) * (y - targetY) <= 0) return { x, y, z, t: i * dt };
    // Remember a comfortable strike point after the bounce (waist-ish height, falling)
    if (bounces >= 1 && vz < 0 && z < 1.1 && z > 0.5) post = { x, y, z, t: i * dt, short: true };
  }
  return null;
}

// Compute velocity to send ball from (x,y,z) to land at (tx,ty) in T seconds.
export function aimVelocity(x, y, z, tx, ty, T) {
  return {
    vx: (tx - x) / T,
    vy: (ty - y) / T,
    vz: (BALL_R - z) / T - 0.5 * PHYS.G * T,
  };
}

// Net clearance for a proposed shot; returns metres above tape (negative = into net).
export function netClearance(x, y, z, v) {
  if ((COURT.NET_Y - y) * v.vy <= 0) return 99;
  const t = (COURT.NET_Y - y) / v.vy;
  const zAt = z + v.vz * t + 0.5 * PHYS.G * t * t;
  return zAt - COURT.NET_H;
}

export function drawBall(ctx, b) {
  if (!b.live && b.z < 0.05) return;
  // Trail
  for (const t of b.trail) {
    const p = project(t.x, t.y, t.z);
    ctx.fillStyle = `rgba(220,255,80,${t.a * 0.25})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, p.s * BALL_R * t.a), 0, 7); ctx.fill();
  }
  // Shadow
  const sh = project(b.x, b.y, 0);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(sh.x, sh.y, sh.s * 0.13, sh.s * 0.05, 0, 0, 7); ctx.fill();
  // Ball
  const p = project(b.x, b.y, b.z);
  const r = Math.max(2.5, p.s * BALL_R * 1.5);
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.2, p.x, p.y, r);
  g.addColorStop(0, "#f4ff9a"); g.addColorStop(1, "#c8e030");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.72, b.spinT, b.spinT + 2.2); ctx.stroke();
}
