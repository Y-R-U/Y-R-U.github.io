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
    // Bought gear is worn: the pro shop is pointless if nobody can see it.
    outfit: opts.outfit || "vest",
    racket: opts.racket || "pan",
    shoes: opts.shoes || "flip",
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
  const chick = p.outfit === "chick";
  ctx.strokeStyle = chick ? "#f79c1d" : p.skin; ctx.lineWidth = s * 0.14; ctx.lineCap = "round";
  const hipY = -H * 0.42 * 1 * s - bob * s;
  for (const side of [-1, 1]) {
    const kick = legSwing * side * 0.22 * s;
    ctx.beginPath(); ctx.moveTo(side * s * 0.14, hipY);
    ctx.lineTo(side * s * 0.17 + kick, -s * 0.05);
    ctx.stroke();
    drawShoe(ctx, side * s * 0.17 + kick, -s * 0.03, s, p, side, p.state === "run");
  }
  drawKit(ctx, p, s, hipY);

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
  drawRacket(ctx, handX, handY, racketAng * (p.far ? -1 : 1), s, p.racket);

  // Head + headgear + face
  const headY = shY - s * 0.34;
  ctx.save(); ctx.translate(0, headY); ctx.rotate(headTilt);
  ctx.fillStyle = p.outfit === "chick" ? "#ffd23e" : p.skin;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, 7); ctx.fill();
  drawHeadgear(ctx, p, s);
  if (!p.far) {
    // Near player faces away — show back of head hair tuft (a chicken has feathers)
    if (p.outfit !== "chick") {
      ctx.fillStyle = p.outfit === "tux" ? "#241c14" : "#6b4a2a";
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.2, Math.PI, 0); ctx.fill();
    }
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

/* ---------------- worn gear ---------------- */
// Everything bought in the pro shop shows up on court. A chicken suit you can't see
// is just an expensive number in a save file.

// Torso + shorts, by outfit.
function drawKit(ctx, p, s, hipY) {
  const torsoY = hipY - s * 0.35, shY = hipY - s * 0.55;
  switch (p.outfit) {
    case "chick": {
      // Tail feathers fan out behind, then a fat feathered body and stubby wings
      ctx.fillStyle = "#f79c1d";
      for (const a of [-0.55, 0, 0.55]) {
        ctx.save(); ctx.translate(0, torsoY + s * 0.1); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, s * 0.34, s * 0.08, s * 0.3, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#ffd23e";
      ctx.beginPath(); ctx.ellipse(0, hipY - s * 0.08, s * 0.33, s * 0.28, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, torsoY, s * 0.35, s * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffe888";
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * s * 0.3, torsoY + s * 0.08, s * 0.1, s * 0.25, side * 0.3, 0, 7);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(197,133,15,.5)"; ctx.lineWidth = s * 0.022;
      for (const r of [0.06, 0.2]) {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.arc(i * s * 0.14, torsoY + s * r, s * 0.09, Math.PI, 0); ctx.stroke();
        }
      }
      return;
    }
    case "tux": {
      ctx.fillStyle = "#12141a";
      ctx.beginPath(); ctx.ellipse(0, hipY, s * 0.27, s * 0.18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#f4f4f0";                                  // dress shirt
      ctx.beginPath(); ctx.ellipse(0, torsoY, s * 0.2, s * 0.35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#12141a";                                  // jacket, open at the front
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.05, torsoY - s * 0.34);
        ctx.lineTo(side * s * 0.3, torsoY - s * 0.3);
        ctx.quadraticCurveTo(side * s * 0.36, torsoY + s * 0.2, side * s * 0.15, torsoY + s * 0.35);
        ctx.quadraticCurveTo(side * s * 0.13, torsoY, side * s * 0.05, torsoY - s * 0.34);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#b0132b";                                  // bow tie
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, shY + s * 0.05);
        ctx.lineTo(side * s * 0.11, shY - s * 0.02);
        ctx.lineTo(side * s * 0.11, shY + s * 0.12); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, shY + s * 0.05, s * 0.035, 0, 7); ctx.fill();
      return;
    }
    case "retro": {
      ctx.fillStyle = "#e63946";                                  // very short shorts
      ctx.beginPath(); ctx.ellipse(0, hipY, s * 0.25, s * 0.14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#f6f6f2";
      ctx.beginPath(); ctx.ellipse(0, torsoY, s * 0.3, s * 0.36, 0, 0, 7); ctx.fill();
      ctx.save();                                                 // chest stripes
      ctx.beginPath(); ctx.ellipse(0, torsoY, s * 0.3, s * 0.36, 0, 0, 7); ctx.clip();
      for (const [i, col] of [[0, "#e63946"], [1, "#2a6fb0"]]) {
        ctx.fillStyle = col;
        ctx.fillRect(-s * 0.3, torsoY - s * 0.12 + i * s * 0.11, s * 0.6, s * 0.075);
      }
      ctx.restore();
      return;
    }
    default: {                                                    // string vest + shorts
      ctx.fillStyle = p.col2;
      ctx.beginPath(); ctx.ellipse(0, hipY, s * 0.26, s * 0.17, 0, 0, 7); ctx.fill();
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.ellipse(0, torsoY, s * 0.3, s * 0.36, 0, 0, 7); ctx.fill();
      if (p.outfit === "vest") {                                  // the string bit
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, torsoY, s * 0.3, s * 0.36, 0, 0, 7); ctx.clip();
        ctx.strokeStyle = "rgba(0,0,0,.16)"; ctx.lineWidth = s * 0.02;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(i * s * 0.09, torsoY - s * 0.4);
          ctx.lineTo(i * s * 0.09, torsoY + s * 0.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-s * 0.32, torsoY + i * s * 0.09);
          ctx.lineTo(s * 0.32, torsoY + i * s * 0.09); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
}

// Headband / hat / beak, drawn in the head's own transform (origin = head centre).
function drawHeadgear(ctx, p, s) {
  if (p.outfit === "chick") {
    ctx.fillStyle = "#e63946";                                    // comb
    for (const i of [-1, 0, 1]) {
      ctx.beginPath(); ctx.arc(i * s * 0.08, -s * 0.24, s * 0.07, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = "#f79c1d";                                    // beak + wattle
    if (p.far) {
      ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.08); ctx.lineTo(s * 0.09, s * 0.08);
      ctx.lineTo(0, s * 0.22); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(0, s * 0.16, s * 0.07, s * 0.05, 0, 0, 7); ctx.fill();
    }
    return;
  }
  if (p.outfit === "tux") {
    ctx.fillStyle = "#1a1a22";                                    // top hat
    ctx.fillRect(-s * 0.26, -s * 0.19, s * 0.52, s * 0.05);
    ctx.fillRect(-s * 0.17, -s * 0.46, s * 0.34, s * 0.28);
    ctx.fillStyle = "#b0132b";
    ctx.fillRect(-s * 0.17, -s * 0.24, s * 0.34, s * 0.05);
    return;
  }
  if (p.outfit === "retro") {                                     // fat 80s sweatband
    ctx.fillStyle = "#ff2e88";
    ctx.fillRect(-s * 0.245, -s * 0.17, s * 0.49, s * 0.13);
    ctx.fillStyle = "#f6f6f2";
    ctx.fillRect(-s * 0.245, -s * 0.125, s * 0.49, s * 0.03);
    return;
  }
  ctx.fillStyle = p.far ? "#d84343" : "#ffe24a";
  ctx.fillRect(-s * 0.24, -s * 0.14, s * 0.48, s * 0.09);
}

function drawShoe(ctx, x, y, s, p, side, running) {
  switch (p.shoes) {
    case "jet":                                                   // rocket boots
      ctx.fillStyle = "#4a5160";
      ctx.beginPath(); ctx.ellipse(x, y - s * 0.03, s * 0.13, s * 0.1, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#c9ccd4";
      ctx.beginPath(); ctx.ellipse(x, y, s * 0.14, s * 0.06, 0, 0, 7); ctx.fill();
      if (running) {                                              // afterburner
        ctx.fillStyle = "rgba(255,150,40,.85)";
        ctx.beginPath(); ctx.ellipse(x - side * s * 0.14, y, s * 0.09, s * 0.04, 0, 0, 7); ctx.fill();
      }
      break;
    case "run":                                                   // proper trainers
      ctx.fillStyle = "#fafafa";
      ctx.beginPath(); ctx.ellipse(x, y, s * 0.15, s * 0.075, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#e63946"; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.moveTo(x - s * 0.1, y - s * 0.01); ctx.lineTo(x + s * 0.08, y - s * 0.05);
      ctx.stroke();
      break;
    case "plims":                                                 // school plimsolls
      ctx.fillStyle = "#1d3557";
      ctx.beginPath(); ctx.ellipse(x, y - s * 0.01, s * 0.13, s * 0.07, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#f0f0f0";
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.02, s * 0.14, s * 0.035, 0, 0, 7); ctx.fill();
      break;
    default:                                                      // flip flops
      ctx.fillStyle = "#d9b382";
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.01, s * 0.13, s * 0.04, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = s * 0.022;
      ctx.beginPath(); ctx.moveTo(x - s * 0.07, y); ctx.lineTo(x, y - s * 0.05);
      ctx.lineTo(x + s * 0.07, y); ctx.stroke();
  }
}

const RACKET_LOOK = {
  pan:   { grip: "#3a3a3a", frame: "#4a4a4a", strings: null,               rw: 0.19, rh: 0.19 },
  wood:  { grip: "#6b4a2a", frame: "#a97142", strings: "rgba(255,240,200,.6)", rw: 0.16, rh: 0.21 },
  graph: { grip: "#7a4a1e", frame: "#c9c9c9", strings: "rgba(255,255,255,.5)", rw: 0.17, rh: 0.22 },
  laser: { grip: "#20313f", frame: "#3ff0ff", strings: "rgba(120,240,255,.7)", rw: 0.18, rh: 0.24, glow: "#3ff0ff" },
  excal: { grip: "#5c3b12", frame: "#ffd34a", strings: "rgba(255,235,150,.8)", rw: 0.19, rh: 0.26, glow: "#ffd34a", jewel: "#e63946" },
};

function drawRacket(ctx, hx, hy, ang, s, kind) {
  const R = RACKET_LOOK[kind] || RACKET_LOOK.pan;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang * 0.5);
  ctx.strokeStyle = R.grip; ctx.lineWidth = s * 0.07;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.3); ctx.stroke();
  if (R.glow) { ctx.shadowColor = R.glow; ctx.shadowBlur = s * 0.22; }
  if (!R.strings) {                            // the frying pan is, regrettably, solid
    ctx.fillStyle = R.frame;
    ctx.beginPath(); ctx.ellipse(0, -s * 0.48, s * R.rw, s * R.rh, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.beginPath(); ctx.ellipse(-s * 0.05, -s * 0.54, s * 0.06, s * 0.07, 0, 0, 7); ctx.fill();
  } else {
    ctx.strokeStyle = R.frame; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.ellipse(0, -s * 0.48, s * R.rw, s * R.rh, 0, 0, 7); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = R.strings; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * s * 0.06, -s * 0.3); ctx.lineTo(i * s * 0.06, -s * 0.66); ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  if (R.jewel) {
    ctx.fillStyle = R.jewel;
    ctx.beginPath(); ctx.arc(0, -s * 0.28, s * 0.045, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// Outfit body colour, for the poses that draw a blob instead of a torso.
const BODY_COL = { chick: "#ffd23e", tux: "#12141a", retro: "#f6f6f2" };
function bodyCol(p) { return BODY_COL[p.outfit] || p.col; }

function drawFaceplant(ctx, p, s, dir) {
  // Flat on the floor, legs twitching
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = bodyCol(p);
  ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.5, s * 0.16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = p.outfit === "chick" ? "#ffd23e" : p.skin;
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
  ctx.fillStyle = bodyCol(p);
  ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.28, s * 0.3, Math.sin(t * 6) * 0.08, 0, 7); ctx.fill();
  ctx.fillStyle = p.outfit === "chick" ? "#ffd23e" : p.skin;
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
