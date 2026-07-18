// Cartoon athlete rendering + simple state machine. Players are drawn, not sprited —
// chunky bobblehead style with squash & stretch.
import { project } from "./court.js";
import { clamp } from "./util.js";

// states: idle | run | swing | serve | celebrate | sad | faceplant | argue | heckle | injury | flip
export function makePlayer(opts) {
  return {
    x: 0, y: 0, tx: 0,                     // world pos + move target x
    far: !!opts.far,                        // far side of court?
    col: opts.col || "#ffd23e",            // shirt
    col2: opts.col2 || "#2f6d9e",          // shorts
    skin: opts.skin || "#f2c79c",
    boss: !!opts.boss,
    state: "idle", stateT: 0, animT: Math.random() * 9,
    facing: 1, speed: 6,
    name: opts.name || "",
  };
}

export function setState(p, s) { if (p.state !== s) { p.state = s; p.stateT = 0; } }

export function updatePlayer(p, dt) {
  p.animT += dt; p.stateT += dt;
  const oneShot = { swing: 0.38, serve: 0.5, faceplant: 1.4, flip: 0.85 };
  if (oneShot[p.state] && p.stateT > oneShot[p.state]) setState(p, "idle");
}

export function drawPlayer(ctx, p) {
  const pr = project(p.x, p.y, 0);
  const s = pr.s;                                    // px per metre at player depth
  if (p.boss) return drawBoss(ctx, p, pr, s);

  ctx.save();
  ctx.translate(pr.x, pr.y);
  const dir = p.far ? -1 : 1;                        // near player faces away (up-screen)
  const t = p.animT;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.52, s * 0.16, 0, 0, 7); ctx.fill();

  let bob = Math.sin(t * 3.2) * 0.04, legSwing = 0, armPose = 0, bodyTilt = 0, headTilt = 0;
  let racketAng = p.far ? 0.6 : -0.6, jump = 0;
  switch (p.state) {
    case "run": legSwing = Math.sin(t * 14); bob = Math.abs(Math.sin(t * 14)) * 0.08; bodyTilt = p.facing * 0.08; break;
    case "swing": { const k = p.stateT / 0.38; racketAng = (p.far ? 1 : -1) * (2.4 - k * 4.2); armPose = 1; bodyTilt = p.facing * 0.18 * Math.sin(k * Math.PI); break; }
    case "serve": { const k = p.stateT / 0.5; racketAng = (p.far ? 1 : -1) * (-2.2 + k * 4.6); armPose = 2; jump = Math.sin(k * Math.PI) * 0.25; break; }
    case "celebrate": armPose = 3; jump = Math.abs(Math.sin(t * 8)) * 0.3; break;
    case "sad": headTilt = 0.4; bodyTilt = 0.12; bob = 0; break;
    case "faceplant": return drawFaceplant(ctx, p, s, dir);
    case "flip": { const k = p.stateT / 0.85; jump = Math.sin(k * Math.PI) * 1.1; ctx.rotate((p.far ? -1 : 1) * k * Math.PI * 2); armPose = 1; racketAng = -2 + k * 5; break; }
    case "argue": armPose = 4; bob = Math.abs(Math.sin(t * 10)) * 0.1; headTilt = Math.sin(t * 10) * 0.15; break;
    case "heckle": armPose = 5; headTilt = -0.2; break;
    case "injury": return drawInjury(ctx, p, s, t);
  }
  ctx.translate(0, -jump * s);
  ctx.rotate(bodyTilt);

  const H = 1.78;                                    // body proportions in metres
  // Legs
  ctx.strokeStyle = p.skin; ctx.lineWidth = s * 0.14; ctx.lineCap = "round";
  const hipY = -H * 0.42 * 1 * s - bob * s;
  for (const side of [-1, 1]) {
    const kick = legSwing * side * 0.22 * s;
    ctx.beginPath(); ctx.moveTo(side * s * 0.14, hipY);
    ctx.lineTo(side * s * 0.17 + kick, -s * 0.05);
    ctx.stroke();
    // Shoe
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(side * s * 0.17 + kick, -s * 0.03, s * 0.14, s * 0.07, 0, 0, 7); ctx.fill();
  }
  // Shorts
  ctx.fillStyle = p.col2;
  ctx.beginPath(); ctx.ellipse(0, hipY, s * 0.26, s * 0.17, 0, 0, 7); ctx.fill();
  // Torso
  ctx.fillStyle = p.col;
  ctx.beginPath(); ctx.ellipse(0, hipY - s * 0.35, s * 0.3, s * 0.36, 0, 0, 7); ctx.fill();

  const shY = hipY - s * 0.55;                       // shoulders
  // Arms + racket
  ctx.strokeStyle = p.skin; ctx.lineWidth = s * 0.11;
  const rSide = p.far ? -1 : 1;                      // racket hand side
  let handX, handY;
  if (armPose === 3) {          // celebrate: both arms up
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * s * 0.26, shY); ctx.lineTo(side * s * 0.45, shY - s * 0.5); ctx.stroke();
    }
    handX = rSide * s * 0.45; handY = shY - s * 0.5;
  } else if (armPose === 4) {   // argue: fist shake toward umpire
    ctx.beginPath(); ctx.moveTo(rSide * s * 0.26, shY); ctx.lineTo(rSide * s * 0.62, shY - s * 0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-rSide * s * 0.26, shY); ctx.lineTo(-rSide * s * 0.4, shY + s * 0.15); ctx.stroke();
    handX = rSide * s * 0.62; handY = shY - s * 0.35;
  } else if (armPose === 5) {   // heckle: hands cupped at mouth
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * s * 0.26, shY); ctx.lineTo(side * s * 0.12, shY - s * 0.42); ctx.stroke();
    }
    handX = rSide * s * 0.4; handY = shY;
  } else {
    // Off arm
    ctx.beginPath(); ctx.moveTo(-rSide * s * 0.26, shY); ctx.lineTo(-rSide * s * 0.4, shY + s * 0.22); ctx.stroke();
    // Racket arm — angle animated
    const aLen = s * 0.42;
    handX = rSide * s * 0.26 + Math.cos(racketAng) * aLen * rSide;
    handY = shY + Math.sin(racketAng) * aLen * 0.7;
    ctx.beginPath(); ctx.moveTo(rSide * s * 0.26, shY); ctx.lineTo(handX, handY); ctx.stroke();
  }
  drawRacket(ctx, handX, handY, racketAng * (p.far ? -1 : 1), s);

  // Head + headband + face
  const headY = shY - s * 0.34;
  ctx.save(); ctx.translate(0, headY); ctx.rotate(headTilt);
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, 7); ctx.fill();
  ctx.fillStyle = p.far ? "#d84343" : "#ffe24a";
  ctx.fillRect(-s * 0.24, -s * 0.14, s * 0.48, s * 0.09);
  if (!p.far) {
    // Near player faces away — show back of head hair tuft
    ctx.fillStyle = "#6b4a2a";
    ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.2, Math.PI, 0); ctx.fill();
  } else {
    // Far player: little face
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(-s * 0.08, 0, s * 0.03, 0, 7); ctx.arc(s * 0.08, 0, s * 0.03, 0, 7); ctx.fill();
    ctx.beginPath();
    if (p.state === "sad" || p.state === "argue") ctx.arc(0, s * 0.16, s * 0.06, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(0, s * 0.08, s * 0.07, 0.3, Math.PI - 0.3);
    ctx.strokeStyle = "#222"; ctx.lineWidth = s * 0.03; ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawRacket(ctx, hx, hy, ang, s) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang * 0.5);
  ctx.strokeStyle = "#7a4a1e"; ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.3); ctx.stroke();
  ctx.strokeStyle = "#c9c9c9"; ctx.lineWidth = s * 0.05;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.48, s * 0.17, s * 0.22, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * s * 0.06, -s * 0.3); ctx.lineTo(i * s * 0.06, -s * 0.66); ctx.stroke();
  }
  ctx.restore();
}

function drawFaceplant(ctx, p, s, dir) {
  // Flat on the floor, legs twitching
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = p.col;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.5, s * 0.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(s * 0.55 * dir, -s * 0.14, s * 0.2, 0, 7); ctx.fill();
  const tw = Math.sin(p.stateT * 20) * s * 0.08;
  ctx.strokeStyle = p.skin; ctx.lineWidth = s * 0.12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-s * 0.4 * dir, -s * 0.14); ctx.lineTo(-s * 0.7 * dir, -s * 0.3 + tw); ctx.stroke();
  ctx.restore();
}

function drawInjury(ctx, p, s, t) {
  // Sitting, clutching leg, dramatic
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.15, 0, 0, 7); ctx.fill();
  ctx.fillStyle = p.col2;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.15, s * 0.3, s * 0.18, 0, 0, 7); ctx.fill();
  ctx.fillStyle = p.col;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.28, s * 0.3, Math.sin(t * 6) * 0.08, 0, 7); ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, -s * 0.85, s * 0.22, 0, 7); ctx.fill();
  ctx.strokeStyle = p.skin; ctx.lineWidth = s * 0.12; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.45, -s * 0.2 + Math.sin(t * 6) * s * 0.05); ctx.stroke();
  ctx.restore();
}

function drawBoss(ctx, p, pr, s) {
  ctx.save(); ctx.translate(pr.x, pr.y);
  const t = p.animT;
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.18, 0, 0, 7); ctx.fill();
  // Wheels
  ctx.fillStyle = "#181818";
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * s * 0.45, -s * 0.1, s * 0.16, 0, 7); ctx.fill(); }
  // Body
  const shake = p.state === "swing" ? Math.sin(t * 40) * s * 0.03 : 0;
  ctx.fillStyle = "#3d4450";
  ctx.fillRect(-s * 0.55 + shake, -s * 1.05, s * 1.1, s * 0.85);
  ctx.fillStyle = "#2a2f38";
  ctx.fillRect(-s * 0.55 + shake, -s * 1.05, s * 1.1, s * 0.18);
  // Barrel — aims at ball hand-wavily
  ctx.save(); ctx.translate(shake, -s * 0.85); ctx.rotate(Math.sin(t * 1.7) * 0.25);
  ctx.fillStyle = "#171a1f";
  ctx.fillRect(-s * 0.12, -s * 0.45, s * 0.24, s * 0.5);
  ctx.restore();
  // LED eye
  const blink = Math.sin(t * 5) > 0.85 ? "#fff" : (p.state === "celebrate" ? "#41ff6a" : "#ff3131");
  ctx.fillStyle = blink;
  ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.7, s * 0.09, 0, 7); ctx.fill();
  // Rank badge
  ctx.fillStyle = "#ffe24a"; ctx.font = `bold ${s * 0.24}px sans-serif`; ctx.textAlign = "center";
  ctx.fillText("#1", s * 0.25, -s * 0.62);
  ctx.restore();
}
