// ---- team AI: formation shape, chasing, carrying, keeping goal ----
import {
  PX, PY, PITCH_W, PITCH_H, CX, GOAL_W, BOX_W, BOX_H,
  FORMATION, ROLE_PULL, SHOT_RANGE, P_SPEED,
} from './const.js';
import { clamp, dist, dist2, rand, chance } from './util.js';

const T = { x: 0, y: 0 }; // scratch

// world position of a normalized formation spot for a team
export function spotWorld(match, ti, spot, out) {
  const team = match.teams[ti];
  const ownLine = team.atkDir === -1 ? PY + PITCH_H : PY;
  out.x = PX + spot.x * PITCH_W;
  out.y = ownLine + team.atkDir * spot.y * PITCH_H;
  return out;
}

function formationTarget(match, f, out) {
  const team = match.teams[f.team];
  const ball = match.ball;
  spotWorld(match, f.team, FORMATION[f.idx], out);
  const pull = ROLE_PULL[f.role];
  out.x += clamp((ball.x - out.x) * pull, -130, 130);
  out.y += clamp((ball.y - out.y) * pull * 1.25, -PITCH_H * 0.3, PITCH_H * 0.3);
  // push up when we own it, drop off when they do
  const ownerTeam = ball.owner ? ball.owner.team : -1;
  if (ownerTeam === f.team) out.y += team.atkDir * 55;
  else if (ownerTeam !== -1) out.y -= team.atkDir * 50;
  out.x = clamp(out.x, PX + 12, PX + PITCH_W - 12);
  out.y = clamp(out.y, PY + 12, PY + PITCH_H - 12);
  return out;
}

// simple arrive steering
function seek(f, tx, ty, speedScale = 1) {
  const dx = tx - f.x, dy = ty - f.y;
  const d = Math.hypot(dx, dy);
  const ms = f.maxSpeed() * f.aiSpeedMul * speedScale;
  const sp = Math.min(ms, d * 3.2);
  if (d > 1) { f.desX = dx / d * sp; f.desY = dy / d * sp; }
  else { f.desX = 0; f.desY = 0; }
}

function interceptPoint(match, f, out) {
  const b = match.ball;
  let px = b.x, py = b.y;
  for (let i = 0; i < 2; i++) {
    const t = Math.min(1.2, dist(f.x, f.y, px, py) / Math.max(60, f.maxSpeed()));
    const slow = Math.exp(-1.0 * t); // ball decelerating
    px = b.x + b.vx * t * slow;
    py = b.y + b.vy * t * slow;
  }
  out.x = clamp(px, PX - 30, PX + PITCH_W + 30);
  out.y = clamp(py, PY - 30, PY + PITCH_H + 30);
  return out;
}

// -------- carrier decisions --------
function carrier(match, f, dt) {
  const team = match.teams[f.team];
  const opp = match.teams[1 - f.team];
  const goal = match.goalPos(f.team);
  const prm = team.aiPrm;

  // nearest opponent (pressure)
  let press = 1e9, presser = null;
  for (const o of opp.players) {
    if (o.grounded) continue;
    const d2 = dist2(f.x, f.y, o.x, o.y);
    if (d2 < press) { press = d2; presser = o; }
  }
  press = Math.sqrt(press);

  // default: dribble toward goal, weaving away from pressure
  let tx = goal.x + (f.x < CX ? -30 : 30);
  let ty = goal.y - team.atkDir * 40;
  if (presser && press < 90) {
    // veer around the presser
    const ax = f.x - presser.x, ay = f.y - presser.y;
    const al = Math.hypot(ax, ay) || 1;
    tx += (ax / al) * 90;
    ty += (ay / al) * 40;
  }
  seek(f, tx, ty);

  f.decideT -= dt;
  if (f.decideT > 0) return;
  f.decideT = rand(0.14, 0.3) / prm.react;

  const dGoal = dist(f.x, f.y, goal.x, goal.y);

  // shoot?
  if (dGoal < SHOT_RANGE * 0.92) {
    let blockers = 0;
    for (const o of opp.players) {
      if (o.role === 'GK') continue;
      const t = ((o.x - f.x) * (goal.x - f.x) + (o.y - f.y) * (goal.y - f.y)) / (dGoal * dGoal);
      if (t > 0.1 && t < 0.9) {
        const lx = f.x + (goal.x - f.x) * t, ly = f.y + (goal.y - f.y) * t;
        if (dist2(o.x, o.y, lx, ly) < 28 * 28) blockers++;
      }
    }
    const q = (1 - dGoal / SHOT_RANGE) * 1.2 - blockers * 0.35 + (press < 50 ? 0 : 0.15);
    if (q > 0.32 || (dGoal < 150 && blockers === 0)) { match.aiShoot(f); return; }
  }

  // pass? evaluate teammates
  const pressured = press < 60;
  let best = null, bestScore = pressured ? 0.18 : 0.55;
  for (const m of team.players) {
    if (m === f || m.grounded) continue;
    const d = dist(f.x, f.y, m.x, m.y);
    if (d < 60 || d > 420) continue;
    // forward progress
    const fwd = (m.y - f.y) * team.atkDir / d;    // -1..1
    // openness of receiver
    let open = 1e9;
    for (const o of opp.players) open = Math.min(open, dist2(m.x, m.y, o.x, o.y));
    open = Math.sqrt(open);
    // lane blocked?
    let lane = 1;
    for (const o of opp.players) {
      const t = ((o.x - f.x) * (m.x - f.x) + (o.y - f.y) * (m.y - f.y)) / (d * d);
      if (t > 0.15 && t < 0.85) {
        const lx = f.x + (m.x - f.x) * t, ly = f.y + (m.y - f.y) * t;
        if (dist2(o.x, o.y, lx, ly) < 22 * 22) { lane = 0; break; }
      }
    }
    if (!lane && !pressured) continue;
    const score = fwd * 0.55 + Math.min(open, 120) / 120 * 0.5 + (lane ? 0.25 : -0.2)
      + (m.role === 'FW' ? 0.1 : 0) - (m.role === 'GK' ? 0.8 : 0);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (best) { match.aiPass(f, best); return; }

  // desperate deep in own half -> hoof it
  const ownGoal = match.ownGoalPos(f.team);
  if (pressured && dist(f.x, f.y, ownGoal.x, ownGoal.y) < 260 && chance(0.6)) {
    match.aiClear(f);
  }
}

// -------- keeper --------
function keeper(match, f, dt) {
  const team = match.teams[f.team];
  const ball = match.ball;
  const own = match.ownGoalPos(f.team);
  const inField = team.atkDir; // direction into pitch from own goal line

  // shot incoming at our goal? match triggers f.startDive via keeperAlert
  if (f.state === 'dive' || f.state === 'fallen') return;

  const ballDist = dist(f.x, f.y, ball.x, ball.y);
  const ballInBox = Math.abs(ball.x - CX) < BOX_W / 2 &&
    (team.atkDir === -1 ? ball.y > PY + PITCH_H - BOX_H : ball.y < PY + BOX_H);

  // claim loose slow balls in the box
  if (!ball.owner && ballInBox && ball.speed() < 230 && ballDist < 150 && ball.shotAtGoal === -1) {
    interceptPoint(match, f, T);
    seek(f, T.x, T.y);
    return;
  }
  // sweep: carrier very close to goal
  if (ball.owner && ball.owner.team !== f.team && ballInBox && ballDist < 90) {
    seek(f, ball.x, ball.y);
    return;
  }

  // hold the line, tracking ball x
  const gx = clamp(own.x + (ball.x - own.x) * 0.45, own.x - GOAL_W / 2 + 10, own.x + GOAL_W / 2 - 10);
  const depth = clamp(120 - Math.abs(ball.y - own.y) * 0.1, 8, 26);
  seek(f, gx, own.y + inField * depth);
}

// -------- per-frame team think (play state only) --------
export function teamThink(match, ti, dt) {
  const team = match.teams[ti];
  const ball = match.ball;
  const owner = ball.owner;

  // find our two nearest outfielders to the ball
  let n1 = null, n2 = null, d1 = 1e18, d2v = 1e18;
  for (const f of team.players) {
    if (f.role === 'GK' || f.grounded) continue;
    const d = dist2(f.x, f.y, ball.x, ball.y);
    if (d < d1) { n2 = n1; d2v = d1; n1 = f; d1 = d; }
    else if (d < d2v) { n2 = f; d2v = d; }
  }

  for (const f of team.players) {
    if (f.busy || f.state === 'celeb') continue;
    const userDriven = f.controlBlend > 0.65 && match.userTeam === ti;

    if (owner === f) {
      if (!userDriven) carrier(match, f, dt);
      continue;
    }
    if (f.role === 'GK') { keeper(match, f, dt); continue; }
    if (userDriven) continue; // input layer steers them

    const oppOwns = owner && owner.team !== ti;
    const weOwn = owner && owner.team === ti;

    if (!weOwn && (f === n1 || (!owner && f === n2 && ball.speed() < 380))) {
      // chase / press
      if (oppOwns) {
        // goal-side press
        const og = match.ownGoalPos(ti);
        const bx = ball.x + (og.x - ball.x) * 0.06;
        const by = ball.y + (og.y - ball.y) * 0.06;
        seek(f, bx, by);
        // occasional AI slide tackle
        f.decideT -= dt;
        if (f.decideT <= 0) {
          f.decideT = rand(0.2, 0.5);
          const d = dist(f.x, f.y, ball.x, ball.y);
          if (d < 42 && d > 16 && chance(0.30 * team.aiPrm.react)) match.aiSlide(f);
        }
      } else {
        interceptPoint(match, f, T);
        seek(f, T.x, T.y);
      }
      continue;
    }

    // support run: nearest attacker ahead of a carrying teammate offers an option
    if (weOwn && f === n1 && owner !== f) {
      const goal = match.goalPos(ti);
      T.x = owner.x + (goal.x - owner.x) * 0.25 + (f.x < owner.x ? -90 : 90);
      T.y = owner.y + team.atkDir * 120;
      T.x = clamp(T.x, PX + 15, PX + PITCH_W - 15);
      T.y = clamp(T.y, PY + 15, PY + PITCH_H - 15);
      seek(f, T.x, T.y, 0.95);
      continue;
    }

    formationTarget(match, f, T);
    // light separation from nearest teammate
    for (const m of team.players) {
      if (m === f) continue;
      const dd = dist2(f.x, f.y, m.x, m.y);
      if (dd < 30 * 30 && dd > 0.01) {
        const d = Math.sqrt(dd);
        T.x += (f.x - m.x) / d * 24;
        T.y += (f.y - m.y) / d * 24;
      }
    }
    const urgency = f === n1 || f === n2 ? 1 : 0.86;
    seek(f, T.x, T.y, urgency);
  }
}
