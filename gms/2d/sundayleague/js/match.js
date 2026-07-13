// ---- match orchestration: states, user control, kicks, set pieces, penalties ----
import {
  PX, PY, PITCH_W, PITCH_H, CX, CY, GOAL_W, GOAL_DEPTH, POST_R, BALL_R,
  BAR_Z, BOX_W, BOX_H, SIX_H, SPOT_DIST,
  CONTROL_RADIUS, KICK_REGAIN_CD, TAKEOVER_BLEND, SLIDE_TIME,
  PASS_SPEED_MIN, PASS_SPEED_MAX, SHOT_SPEED_MIN, SHOT_SPEED_MAX, SHOT_RANGE,
  PASS_CONE, AFTERTOUCH_TIME, GRAVITY, PITCH_TYPES, DIFFICULTY, FORMATION,
  KEEPER_HOLD, YELLOW_CHANCE, RED_CHANCE, RED_CHANCE_MAX, BOOKINGS_OFF, MIN_PLAYERS,
  RESTART_ZOOM, GOAL_BALL_LINGER, REPLAY_HOLD,
} from './const.js';
import { clamp, lerp, dist, dist2, rand, chance, pick, vibrate } from './util.js';
import { Ball } from './ball.js';
import { Footballer } from './footballer.js';
import { teamThink, spotWorld } from './ai.js';
import { genSquad, resolveKits } from './teams.js';
import { bakePlayerSheet } from './sprites.js';
import { AUDIO } from './audio.js';

const TMP = { x: 0, y: 0 };

// first point along segment (x0,y0)->(x1,y1) that touches a circle of radius R at (cx,cy)
function sweepHit(x0, y0, x1, y1, cx, cy, R) {
  const dx = x1 - x0, dy = y1 - y0;
  const fx = x0 - cx, fy = y0 - cy;
  if (fx * fx + fy * fy <= R * R) return { x: x0, y: y0 };
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - R * R;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > 1) return null;
  return { x: x0 + dx * t, y: y0 + dy * t };
}

export class Match {
  // cfg: { teamA, teamB (defs), userTeam, halfLen, pitchType, difficulty, mode,
  //        settings, resolveDraw, onEvent(type,data), onFinish(result) }
  constructor(cfg, deps) {
    this.cfg = cfg;
    this.fx = deps.fx;
    this.input = deps.input;
    this.camera = deps.camera;
    this.replay = deps.replay;
    this.settings = cfg.settings;
    this.mode = cfg.mode || 'friendly';
    this.userTeam = cfg.userTeam ?? 0;
    this.pitchType = cfg.pitchType || 'grass';
    this.halfLen = cfg.halfLen || 120;
    this.diff = DIFFICULTY[cfg.difficulty || 'normal'];

    this.ball = new Ball();
    this.ball.onBounce = (sp) => { if (sp > 90) AUDIO.bounce(); };

    const kits = resolveKits(cfg.teamA.kit, cfg.teamB.kit);
    this.teams = [
      this._buildTeam(0, cfg.teamA, kits.home, kits.gkHome, -1),
      this._buildTeam(1, cfg.teamB, kits.away, kits.gkAway, +1),
    ];
    if (this.mode === 'practice') this.teams[1].players = this.teams[1].players.filter(f => f.role === 'GK');
    this.all = [...this.teams[0].players, ...this.teams[1].players];

    this.sel = null;              // user-controlled footballer
    this.half = 1;
    this.elapsed = 0;             // real seconds in current half
    this.clockMin = 0;            // displayed game minute
    this.paused = false;
    this.finished = false;
    this.state = 'idle';
    this.stateT = 0;
    this.restart = null;          // {type, x, y, team, taker, thrown}
    this.pen = null;              // penalty sub-state
    this.pens = null;             // shootout tallies
    this.scorer = null;
    this.contestCD = new Map();
    this.aftertouchUsed = false;

    const w = PITCH_TYPES[this.pitchType].weather;
    this.fx.setWeather(w);
    AUDIO.setCrowd(this.mode !== 'practice');

    if (this.mode === 'shootout') {
      this.teams[0].atkDir = 1; this.teams[1].atkDir = 1;
      this._beginShootout();
    } else {
      this._setupKickoff(0, true);
    }
    this.camera.snap(this.ball.x, this.ball.y);
  }

  _buildTeam(ti, def, kit, gkKit, atkDir) {
    const squad = genSquad(def);
    const norm = clamp((def.rating - 30) / 65, 0, 1);
    const isUser = ti === this.userTeam;
    const d = isUser ? DIFFICULTY.normal : this.diff;
    const aiPrm = {
      react: (0.7 + norm * 0.6) * d.react,
      err: (1.7 - norm * 1.2) * d.err,
      keeper: (0.72 + norm * 0.45) * d.keeper,
    };
    const ptype = PITCH_TYPES[this.pitchType];
    const players = squad.map((person, i) => {
      const role = FORMATION[i].role;
      const look = { kit: role === 'GK' ? gkKit : kit, skin: person.skin, hair: person.hair, style: person.style };
      const f = new Footballer(ti, i, role, person, bakePlayerSheet(look));
      f.speedMul = ptype.speedMul * (0.9 + norm * 0.14) * (isUser ? 1 : d.speed);
      f.aiSpeedMul = 0.93;
      f.decideT = rand(0, 0.3);
      return f;
    });
    return {
      def, kit, gkKit, players, atkDir, aiPrm,
      score: 0, scorers: [],
      stats: { shots: 0, onTarget: 0, possession: 0.0001, corners: 0, fouls: 0, yellows: 0, reds: 0 },
    };
  }

  goalPos(ti) { return { x: CX, y: this.teams[ti].atkDir === -1 ? PY : PY + PITCH_H }; }
  ownGoalPos(ti) { return { x: CX, y: this.teams[ti].atkDir === -1 ? PY + PITCH_H : PY }; }
  event(type, data) { if (this.cfg.onEvent) this.cfg.onEvent(type, data); }
  get userTeamObj() { return this.userTeam >= 0 ? this.teams[this.userTeam] : null; }

  // ================= kicks =================

  _execKick(f, vx, vy, vz, spin = 0) {
    if (this.settings.offside && this.state === 'play' && !this.suppressOffside) this._markOffsides(f);
    else this._clearOffsides();
    f.startKick();
    f.kickCD = 0.25;
    this.ball.kick(f, vx, vy, vz, spin);
    this.aftertouchUsed = false;
    const p = clamp(Math.hypot(vx, vy) / SHOT_SPEED_MAX, 0, 1);
    AUDIO.kick(p);
    if (this.settings.vibration && f.team === this.userTeam) vibrate(12);
    this.fx.grassKick(this.ball.x, this.ball.y, this.pitchType === 'mud' ? '#5a4326' : '#2c6e38');
    if (this.pitchType === 'wet') this.fx.splash(this.ball.x, this.ball.y);
  }

  // ballistic kick that lands near (tx,ty) after T seconds
  _loftedKick(f, tx, ty, T, err = 0) {
    if (err > 0) { tx += rand(-err, err); ty += rand(-err, err); }
    const vx = (tx - this.ball.x) / T;
    const vy = (ty - this.ball.y) / T;
    const vz = 0.5 * GRAVITY * T - this.ball.z / T;
    this._execKick(f, vx, vy, vz);
  }

  passTo(f, mate, errMul = 0) {
    const b = this.ball;
    let d = dist(b.x, b.y, mate.x, mate.y);
    const sp = clamp(PASS_SPEED_MIN + d * 1.05, PASS_SPEED_MIN, PASS_SPEED_MAX);
    const t = d / sp;
    let tx = mate.x + mate.vx * t * 0.85;
    let ty = mate.y + mate.vy * t * 0.85;
    if (errMul > 0) {
      const e = errMul * d * 0.09;
      tx += rand(-e, e); ty += rand(-e, e);
    }
    d = dist(b.x, b.y, tx, ty) || 1;
    const vz = d > 300 ? 90 : 0;
    this._execKick(f, (tx - b.x) / d * sp, (ty - b.y) / d * sp, vz);
    this.event('pass', { f });
  }

  shoot(f, power, aimLat = 0, errMul = 0) {
    const goal = this.goalPos(f.team);
    const b = this.ball;
    let tx = goal.x + aimLat * (GOAL_W / 2 - 13); // a clean corner: just inside the post
    if (errMul > 0) tx += rand(-1, 1) * errMul * 34;
    tx += rand(-1, 1) * power * 10; // power = risk
    const sp = SHOT_SPEED_MIN + power * (SHOT_SPEED_MAX - SHOT_SPEED_MIN);
    const d = dist(b.x, b.y, tx, goal.y) || 1;
    const vz = 30 + power * 130 + rand(0, 30) * errMul;
    this._execKick(f, (tx - b.x) / d * sp, (goal.y - b.y) / d * sp, vz);
    b.shotAtGoal = 1 - f.team;
    this._alertKeeper(1 - f.team);
    const T = this.teams[f.team];
    T.stats.shots++;
    this.event('shot', { f });
    AUDIO.bump(0.3);
  }

  clear(f) {
    const goal = this.goalPos(f.team);
    const tx = goal.x + rand(-140, 140);
    const ty = goal.y - this.teams[f.team].atkDir * rand(240, 380);
    this._loftedKick(f, tx, ty, rand(0.85, 1.05), 30);
    this.event('clear', { f });
  }

  header(f, aimX, aimY) {
    const goal = this.goalPos(f.team);
    const dGoal = dist(f.x, f.y, goal.x, goal.y);
    const b = this.ball;
    if (dGoal < 240) { // header at goal!
      const sp = 520 + rand(0, 120);
      let tx = goal.x + clamp(aimX, -1, 1) * GOAL_W * 0.35 + rand(-26, 26);
      const d = dist(b.x, b.y, tx, goal.y) || 1;
      this._execKick(f, (tx - b.x) / d * sp, (goal.y - b.y) / d * sp, -40);
      b.shotAtGoal = 1 - f.team;
      this._alertKeeper(1 - f.team);
      this.teams[f.team].stats.shots++;
      this.event('header', { f });
    } else {
      const l = Math.hypot(aimX, aimY) || 1;
      this._execKick(f, aimX / l * 360, aimY / l * 360, 140);
    }
  }

  // -------- AI kick entry points --------
  aiShoot(f) {
    const err = this.teams[f.team].aiPrm.err / (f.person.skill || 1);
    this.shoot(f, rand(0.55, 0.95), rand(-0.8, 0.8), err);
  }
  aiPass(f, mate) {
    const err = this.teams[f.team].aiPrm.err / (f.person.skill || 1);
    this.passTo(f, mate, err * 0.5);
  }
  aiClear(f) { this.clear(f); }
  aiSlide(f) {
    const b = this.ball;
    const dx = b.x + b.vx * 0.12 - f.x, dy = b.y + b.vy * 0.12 - f.y;
    if (f.startSlide(dx, dy, PITCH_TYPES[this.pitchType].slideMul)) AUDIO.slide();
  }

  // ================= offside (optional rule, off by default) =================

  // snapshot at the moment of a kick: teammates beyond the second-last
  // defender AND the ball, in the opponent half, are flagged
  _markOffsides(kicker) {
    const ti = kicker.team;
    const team = this.teams[ti], opp = this.teams[1 - ti];
    const dir = team.atkDir;
    let y1 = dir === -1 ? 1e9 : -1e9, y2 = y1; // last & second-last defender
    for (const o of opp.players) {
      if (dir === -1 ? o.y < y1 : o.y > y1) { y2 = y1; y1 = o.y; }
      else if (dir === -1 ? o.y < y2 : o.y > y2) { y2 = o.y; }
    }
    const ballY = this.ball.y;
    for (const m of team.players) {
      m.offside = m !== kicker &&
        (dir === -1 ? m.y < y2 : m.y > y2) &&
        (dir === -1 ? m.y < ballY : m.y > ballY) &&
        (dir === -1 ? m.y < CY : m.y > CY);
    }
    for (const o of opp.players) o.offside = false;
  }

  _clearOffsides() { for (const f of this.all) f.offside = false; }

  _offsideCall(f) {
    AUDIO.whistle(1);
    AUDIO.boo();
    this.fx.bigText('OFFSIDE!', { color: '#8af0ff', sub: f.person.name });
    this._clearOffsides();
    this.event('offside', { f });
    this._setupRestart('freekick', f.x, f.y, 1 - f.team);
  }

  // ================= keeper =================

  _alertKeeper(ti) {
    const gk = this.teams[ti].players[0];
    if (gk.role !== 'GK') return;
    gk.alert = { t: 0.1 + (1.3 - this.teams[ti].aiPrm.keeper) * 0.16 };
  }

  _keeperUpdate(dt) {
    for (let ti = 0; ti < 2; ti++) {
      const team = this.teams[ti];
      const gk = team.players[0];
      if (gk.role !== 'GK') continue;
      const b = this.ball;

      // react to incoming shot
      if (gk.alert && b.shotAtGoal === ti) {
        gk.alert.t -= dt;
        if (gk.alert.t <= 0 && !gk.grounded) {
          gk.alert = null;
          const own = this.ownGoalPos(ti);
          const vy = b.vy || 1;
          const tCross = clamp((own.y - b.y) / vy, 0.08, 1.2);
          let crossX = b.x + b.vx * tCross;
          const reach = 60 * team.aiPrm.keeper;
          const errX = rand(-1, 1) * (1.25 - team.aiPrm.keeper) * 46;
          crossX += errX;
          const dx = clamp(crossX - gk.x, -reach * 1.8, reach * 1.8);
          if (Math.abs(dx) > 14) {
            gk.startDive(dx / tCross * 0.9, (own.y + team.atkDir * 6 - gk.y) / tCross * 0.5);
            AUDIO.bump(0.25);
          }
        }
      } else if (b.shotAtGoal !== ti) {
        gk.alert = null;
      }

      // keeper-ball contact: catch or parry
      if (this.state !== 'play' && this.state !== 'penalty') continue;
      if (b.owner === gk) continue;
      const reachR = gk.state === 'dive' ? 22 : 15;
      if (b.z < 42 && dist2(gk.x, gk.y, b.x, b.y) < reachR * reachR) {
        if (b.owner && b.owner.team === ti) continue;      // own carrier
        if (b.owner && b.owner.team !== ti) {               // smother the striker
          if (dist2(gk.x, gk.y, b.x, b.y) < 13 * 13) this._keeperClaims(gk);
          continue;
        }
        if (b.lastKicker === gk && b.regainT < KICK_REGAIN_CD) continue;
        const sp = b.speed();
        if (sp < 430 && b.z < 30) this._keeperClaims(gk);
        else this._keeperParry(gk);
      }
    }
  }

  _keeperClaims(gk) {
    const b = this.ball;
    const wasShot = b.shotAtGoal === gk.team;
    b.owner = gk; b.touch(gk); b.vx = 0; b.vy = 0; b.vz = 0; b.z = 0;
    b.shotAtGoal = -1;
    gk.holdT = 0;
    AUDIO.catchBall();
    if (wasShot) {
      this.fx.text(gk.x, gk.y, 'SAVED!', '#8af0ff');
      this.teams[1 - gk.team].stats.onTarget++;
      this.event('save', { f: gk });
      AUDIO.ooh();
    }
  }

  _keeperParry(gk) {
    const b = this.ball;
    if (b.shotAtGoal === gk.team) this.teams[1 - gk.team].stats.onTarget++;
    const away = this.teams[gk.team].atkDir; // into the field
    b.vx = rand(-1, 1) * 220 + (b.x < CX ? -80 : 80);
    b.vy = Math.abs(b.vy) * 0.45 * away + away * 120;
    b.vz = rand(120, 220);
    b.z = Math.max(b.z, 4);
    b.spin = 0;
    b.touch(gk);
    b.shotAtGoal = -1;
    b.lastKicker = gk;
    b.regainT = 0;
    this.fx.text(gk.x, gk.y, 'PARRIED!', '#8af0ff');
    this.event('save', { f: gk });
    AUDIO.ooh();
  }

  _keeperDistribute(dt) {
    const b = this.ball;
    const gk = b.owner;
    if (!gk || gk.role !== 'GK' || this.state !== 'play') return;
    gk.holdT = (gk.holdT || 0) + dt;
    // user may kick manually (handled in user control); AI after hold
    if (gk.holdT > KEEPER_HOLD && (gk.team !== this.userTeam || gk.controlBlend < 0.6)) {
      const team = this.teams[gk.team];
      let best = null, bestOpen = 90;
      for (const m of team.players) {
        if (m === gk || m.role === 'FW') continue;
        let open = 1e9;
        for (const o of this.teams[1 - gk.team].players) open = Math.min(open, dist(m.x, m.y, o.x, o.y));
        if (open > bestOpen && dist(gk.x, gk.y, m.x, m.y) < 330) { bestOpen = open; best = m; }
      }
      if (best && chance(0.7)) this.passTo(gk, best, 0.2);
      else this.clear(gk);
    }
  }

  // ================= user control =================

  _pickUserPlayer() {
    const team = this.userTeamObj;
    if (!team) return null;
    const b = this.ball;
    if (b.owner && b.owner.team === this.userTeam) return b.owner;
    let best = null, bestD = 1e18;
    for (const f of team.players) {
      if (f.role === 'GK' || f.grounded) continue;
      const d = dist2(f.x, f.y, b.x + b.vx * 0.25, b.y + b.vy * 0.25);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  _switchSel(f, keepBlend = 0.45) {
    if (this.sel === f || !f) return;
    const old = this.sel ? this.sel.controlBlend : 0;
    this.sel = f;
    f.controlBlend = Math.min(old, keepBlend);
    this.switchT = 0;
  }

  _userControl(dt) {
    if (this.userTeam < 0) return;
    const inp = this.input;
    const b = this.ball;
    const team = this.userTeamObj;
    const engaged = inp.stick.active || inp.kick.held;

    // ---- selection ----
    if (b.owner && b.owner.team === this.userTeam && b.owner.role !== 'GK') {
      if (this.sel !== b.owner) this._switchSel(b.owner, 0.55);
    } else if (inp.stick.justPressed || !this.sel) {
      this._switchSel(this._pickUserPlayer());
    } else if (this.settings.autoSwitch && engaged) {
      this.switchT = (this.switchT || 0) + dt;
      if (this.switchT > 0.35 && (!b.owner || b.owner.team !== this.userTeam)) {
        this.switchT = 0;
        const cand = this._pickUserPlayer();
        if (cand && cand !== this.sel &&
          dist2(cand.x, cand.y, b.x, b.y) * 1.55 < dist2(this.sel.x, this.sel.y, b.x, b.y)) {
          this._switchSel(cand);
        }
      }
    }
    const sel = this.sel;
    if (!sel) return;

    // ---- control blend (seamless takeover) ----
    for (const f of team.players) {
      if (f === sel && engaged) f.controlBlend = Math.min(1, f.controlBlend + TAKEOVER_BLEND * dt);
      else f.controlBlend = Math.max(0, f.controlBlend - TAKEOVER_BLEND * 1.4 * dt);
    }

    // ---- steering: blend user stick into AI desire ----
    if (engaged && sel.controlBlend > 0 && !sel.busy && sel.state !== 'celeb') {
      const ms = sel.maxSpeed();
      const ux = inp.stick.x * inp.stick.mag * ms;
      const uy = inp.stick.y * inp.stick.mag * ms;
      const t = sel.controlBlend;
      sel.desX = lerp(sel.desX, ux, t);
      sel.desY = lerp(sel.desY, uy, t);
      if (inp.stick.mag > 0.3 && b.owner === sel) sel.setFacing(inp.stick.x, inp.stick.y);
    }

    // ---- aftertouch curl ----
    if (this.settings.aftertouch && b.lastKicker === sel && b.regainT < AFTERTOUCH_TIME &&
      !b.owner && inp.stick.active && inp.stick.mag > 0.45 && !this.aftertouchUsed) {
      const sp = b.speed();
      if (sp > 250) {
        const lat = (inp.stick.x * b.vy - inp.stick.y * b.vx) / sp; // side input rel. to flight
        if (Math.abs(lat) > 0.5) { b.spin = -Math.sign(lat) * 260; this.aftertouchUsed = true; }
      }
    }

    // ---- kick actions ----
    const tapped = inp.kick.tapped;
    const released = inp.kick.released;
    if (!tapped && !released) return;
    const power = released ? 0.35 + inp.kick.releasedCharge * 0.65 : 0.5;
    const aimX = inp.stick.active && inp.stick.mag > 0.25 ? inp.stick.x : sel.fx;
    const aimY = inp.stick.active && inp.stick.mag > 0.25 ? inp.stick.y : sel.fy;

    if (this.state === 'ready' && this.restart && this.restart.taker.team === this.userTeam) {
      this._takeRestartKick(this.restart.taker, aimX, aimY, power, true);
      return;
    }
    if (this.state !== 'play') return;

    const dBall = dist(sel.x, sel.y, b.x, b.y);
    if (b.owner === sel || (!b.owner && dBall < 30 && b.z < 26 &&
        !(b.lastKicker === sel && b.regainT < KICK_REGAIN_CD))) {
      this._userKickBall(sel, aimX, aimY, power, released);
    } else if (!b.owner && dBall < 34 && b.z >= 26 && b.z < 75) {
      header: {
        if (sel.busy) break header;
        this.header(sel, aimX, aimY);
      }
    } else if (b.owner !== sel) {
      // defensive slide
      if (sel.startSlide(aimX, aimY, PITCH_TYPES[this.pitchType].slideMul)) AUDIO.slide();
    }
  }

  _userKickBall(sel, aimX, aimY, power, charged) {
    const goal = this.goalPos(sel.team);
    const b = this.ball;
    const dGoal = dist(sel.x, sel.y, goal.x, goal.y);
    // aiming at goal?
    const gd = Math.hypot(goal.x - sel.x, goal.y - sel.y) || 1;
    const dot = (aimX * (goal.x - sel.x) + aimY * (goal.y - sel.y)) / gd;
    if (dot > 0.72 && dGoal < SHOT_RANGE * (0.7 + power * 0.5)) {
      // lateral placement from aim
      const lat = clamp((aimX * (goal.y - sel.y) - aimY * (goal.x - sel.x)) / gd * -2.2, -1, 1);
      this.shoot(sel, power, lat, 0);
      return;
    }
    const mate = this._pickPassTarget(sel, aimX, aimY);
    if (mate && (!charged || power < 0.75)) { this.passTo(sel, mate, 0); return; }
    // no target / big charge: drive it into space
    const sp = PASS_SPEED_MIN + power * (SHOT_SPEED_MAX * 0.85 - PASS_SPEED_MIN);
    const l = Math.hypot(aimX, aimY) || 1;
    this._execKick(sel, aimX / l * sp, aimY / l * sp, power > 0.55 ? 60 + power * 150 : 0);
  }

  _pickPassTarget(f, aimX, aimY) {
    const team = this.teams[f.team];
    const al = Math.hypot(aimX, aimY) || 1;
    const ax = aimX / al, ay = aimY / al;
    let best = null, bestScore = -1;
    for (const m of team.players) {
      if (m === f || m.grounded || m.role === 'GK') continue;
      const dx = m.x - f.x, dy = m.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d < 34 || d > 460) continue;
      const ang = Math.acos(clamp((dx * ax + dy * ay) / d, -1, 1));
      if (ang > PASS_CONE) continue;
      const score = (1 - ang / PASS_CONE) * 1.2 + (1 - d / 460) * 0.35;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ================= possession & contacts =================

  _possession(dt) {
    const b = this.ball;
    if (this.state !== 'play') return;

    // steal contest vs carrier
    if (b.owner) {
      const owner = b.owner;
      const opp = this.teams[1 - owner.team];
      for (const o of opp.players) {
        if (o.busy || o.state === 'fallen') continue;
        if (dist2(o.x, o.y, b.x, b.y) > 13 * 13) continue;
        const cd = this.contestCD.get(o) || 0;
        if (cd > this.now) continue;
        this.contestCD.set(o, this.now + 0.55);
        if (chance(0.5)) {
          // knocked loose
          b.kick(o, rand(-1, 1) * 120 + o.vx * 0.6, rand(-1, 1) * 120 + o.vy * 0.6, 30);
          b.lastTouchTeam = o.team;
          this.fx.puff(b.x, b.y);
        }
      }
      return;
    }

    // free ball: traps, blocks, slides, headers
    let claimer = null, claimD = 1e9;
    for (const f of this.all) {
      if (f.state === 'fallen' || f.state === 'celeb' || f.state === 'kick' || f.state === 'dive') continue;
      if (f.role === 'GK') continue; // keepers handled separately
      const d = dist2(f.x, f.y, b.x, b.y);

      // sliding tackle contact
      if (f.state === 'slide') {
        if (d < 20 * 20 && b.z < 34) {
          b.kick(f, f.slideDX * 300 + rand(-60, 60), f.slideDY * 300 + rand(-60, 60), 60);
          b.lastTouchTeam = f.team;
          f.slideWon = true;
          this.fx.puff(b.x, b.y);
          this.event('tackle', { f });
        }
        continue;
      }
      if (b.lastKicker === f && b.regainT < KICK_REGAIN_CD) continue;
      if (d > CONTROL_RADIUS * CONTROL_RADIUS) continue;

      // AI headers / volleys on airborne balls (defensive clears & attacking nods)
      if (b.z >= 26) {
        if (b.z < 72 && f.kickCD <= 0 && (f.team !== this.userTeam || f.controlBlend < 0.5)) {
          const own = this.ownGoalPos(f.team);
          const nearOwnBox = dist(f.x, f.y, own.x, own.y) < 220;
          const goal = this.goalPos(f.team);
          const nearOppBox = dist(f.x, f.y, goal.x, goal.y) < 230;
          if (nearOwnBox || nearOppBox) {
            f.kickCD = 0.5;
            this.header(f, (goal.x - f.x) / 100, (goal.y - f.y) / 100);
          }
        }
        continue;
      }

      // fast ball: body block/deflect
      if (b.speed() > 520) {
        b.vx *= rand(-0.35, -0.1); b.vy *= rand(-0.35, -0.1);
        b.vx += rand(-80, 80); b.vy += rand(-80, 80);
        b.vz = rand(40, 140);
        b.touch(f);
        b.lastKicker = f; b.regainT = 0;
        this.fx.puff(f.x, f.y);
        continue;
      }
      if (d < claimD) { claimD = d; claimer = f; }
    }
    if (claimer) {
      if (claimer.offside && this.settings.offside && this.mode !== 'practice') {
        this._offsideCall(claimer);
        return;
      }
      b.owner = claimer;
      b.touch(claimer);
      if (claimer.team === this.userTeam && this.input.stick.active) this._switchSel(claimer, 0.55);
      this.event('trap', { f: claimer });
    }
  }

  _collisions() {
    for (let i = 0; i < this.all.length; i++) {
      const a = this.all[i];
      if (a.grounded) continue;
      for (let j = i + 1; j < this.all.length; j++) {
        const c = this.all[j];
        if (c.grounded) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const dd = dx * dx + dy * dy;
        if (dd < 15 * 15 && dd > 0.01) {
          const d = Math.sqrt(dd), push = (15 - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          c.x += nx * push; c.y += ny * push;
        }
      }
    }
  }

  _foulCheck() {
    // sliders hitting bodies without the ball (snapshot: a red card mutates this.all)
    const sliders = this.all.filter(f => f.state === 'slide' && !f.slideWon && !f.fouled &&
      f.stateT <= SLIDE_TIME * f.slideMul);
    for (const f of sliders) {
      for (const v of this.teams[1 - f.team].players) {
        if (v.grounded) continue;
        if (dist2(f.x, f.y, v.x, v.y) < 14 * 14) {
          f.fouled = true;
          const speed = Math.hypot(f.vx, f.vy);
          const hadBall = this.ball.owner === v || dist2(this.ball.x, this.ball.y, v.x, v.y) < 40 * 40;
          v.fall();
          if (chance(0.62)) this._awardFoul(f, v, speed, hadBall);
          break;
        }
      }
    }
  }

  _awardFoul(offender, victim, speed = 0, hadBall = false) {
    const team = this.teams[offender.team];
    team.stats.fouls++;
    AUDIO.whistle(1);
    AUDIO.boo();
    this.fx.text(victim.x, victim.y, 'FOUL!', '#ffd94a');
    this.event('foul', { f: offender, v: victim });

    const own = this.ownGoalPos(offender.team);
    const inBox = Math.abs(victim.x - CX) < BOX_W / 2 && Math.abs(victim.y - own.y) < BOX_H;
    this._discipline(offender, victim, speed, hadBall, inBox);

    if (inBox) {
      this.fx.bigText('PENALTY!', { color: '#ff6a6a' });
      this._startPenalty(1 - offender.team, 'play');
    } else {
      this._setupRestart('freekick', victim.x, victim.y, 1 - offender.team);
    }
  }

  // most fouls are just fouls; reckless ones get booked, a straight red is rare.
  // the ref is harsher on you (and softer on them) as difficulty goes up.
  _discipline(offender, victim, speed, hadBall, inBox) {
    const own = this.ownGoalPos(offender.team);
    const lastMan = hadBall && dist(victim.x, victim.y, own.x, own.y) < 320;
    const reckless = speed > 250;
    const mul = offender.team === this.userTeam ? this.diff.cardYou : this.diff.cardThem;

    let red = RED_CHANCE;
    if (reckless) red += 0.02;
    if (lastMan) red += 0.03;              // denying a clear chance
    if (inBox && hadBall) red += 0.01;
    const yellow = YELLOW_CHANCE + (reckless ? 0.16 : 0) + (lastMan ? 0.2 : 0);

    if (chance(Math.min(red, RED_CHANCE_MAX) * mul)) { this._card(offender, 'red'); return; }
    if (chance(yellow * mul)) this._card(offender, 'yellow');
  }

  _card(offender, kind) {
    const team = this.teams[offender.team];
    // keepers are spared the walk (there is no sub keeper) and the ref won't gut a team
    const canSendOff = offender.role !== 'GK' && team.players.length > MIN_PLAYERS;
    if (kind === 'red' && !canSendOff) kind = 'yellow';

    if (kind === 'yellow') {
      offender.yellows++;
      team.stats.yellows++;
      this.fx.card(offender.x, offender.y, 'yellow', offender.yellows);
      AUDIO.whistle(1);
      if (offender.yellows >= BOOKINGS_OFF && canSendOff) {
        this._sendOff(offender, offender.yellows);
        return;
      }
      this.event('card', { f: offender, kind: 'yellow', n: offender.yellows, team: offender.team });
      return;
    }
    this._sendOff(offender, 0);
  }

  _sendOff(offender, bookings) {
    const team = this.teams[offender.team];
    team.stats.reds++;
    this.fx.card(offender.x, offender.y, 'red');
    this.fx.bigText('RED CARD!', {
      sub: `${offender.person.name} — ${bookings ? `${bookings} bookings` : team.def.short}`,
      color: '#ff4d4d',
    });
    AUDIO.whistle(2);
    AUDIO.boo();
    this.fx.addShake(6);
    if (this.settings.vibration) vibrate([20, 60, 20]);

    // off he goes: out of the squad, out of every update loop
    if (this.ball.owner === offender) this.ball.owner = null;
    if (this.sel === offender) this.sel = null;
    const pi = team.players.indexOf(offender);
    if (pi >= 0) team.players.splice(pi, 1);
    const ai = this.all.indexOf(offender);
    if (ai >= 0) this.all.splice(ai, 1);
    this.replay.clear();  // buffered frames hold 22 players; the stride just changed

    this.event('card', { f: offender, kind: 'red', bookings, team: offender.team });
  }

  // ================= restarts & out of play =================

  _setupKickoff(kickTeam, first = false) {
    this.state = 'restart';
    this.stateT = 0;
    this.ball.reset(CX, CY);
    this.scorer = null;
    for (const f of this.all) {
      f.stopCelebrate();
      const spot = FORMATION[f.idx];
      spotWorld(this, f.team, { x: spot.x, y: spot.y * 0.42 + (f.team === kickTeam ? 0.06 : 0) }, TMP);
      f.restX = TMP.x; f.restY = TMP.y;
      f.state = 'run';
    }
    const team = this.teams[kickTeam];
    const taker = team.players[9] || team.players[team.players.length - 1];
    const support = team.players[10] || taker;
    taker.restX = CX - 6; taker.restY = CY + team.atkDir * -2 - team.atkDir * 0;
    taker.restY = CY - team.atkDir * 8;
    support.restX = CX + 40; support.restY = CY - team.atkDir * 30;
    this.restart = { type: 'kickoff', x: CX, y: CY, team: kickTeam, taker, whistle: true };
    if (first) for (const f of this.all) { f.x = f.restX; f.y = f.restY; f.vx = f.vy = 0; }
    this.event('kickoff', { team: kickTeam });
  }

  _setupRestart(type, x, y, teamIdx) {
    this.state = 'restart';
    this.stateT = 0;
    const team = this.teams[teamIdx];
    x = clamp(x, PX + 2, PX + PITCH_W - 2);
    y = clamp(y, PY + 2, PY + PITCH_H - 2);
    const own = this.ownGoalPos(teamIdx);

    if (type === 'goalkick') { x = CX + (x < CX ? -SIX_H : SIX_H); y = own.y + team.atkDir * SIX_H; }
    if (type === 'corner') {
      const gy = this.goalPos(teamIdx).y;
      x = x < CX ? PX + 4 : PX + PITCH_W - 4;
      y = gy;
      team.stats.corners++;
      this.event('corner', { team: teamIdx });
    }

    this.ball.reset(x, y);
    // taker: keeper for goal kicks, else nearest
    let taker = null;
    if (type === 'goalkick') taker = team.players[0];
    else {
      let bd = 1e18;
      for (const f of team.players) {
        if (f.role === 'GK') continue;
        const d = dist2(f.x, f.y, x, y);
        if (d < bd) { bd = d; taker = f; }
      }
    }
    taker.state = 'run';

    // default rest spots: formation-ish
    for (const f of this.all) {
      spotWorld(this, f.team, FORMATION[f.idx], TMP);
      f.restX = TMP.x + (x - TMP.x) * 0.18;
      f.restY = TMP.y + (y - TMP.y) * 0.18;
    }
    // corners: crash the box
    if (type === 'corner') {
      const gy = this.goalPos(teamIdx).y;
      const inDir = -Math.sign(gy - CY); // into pitch
      const spots = [[-70, 90], [40, 100], [-20, 150], [90, 160]];
      const attackers = team.players.filter(f => f.role === 'FW' || f.role === 'MF').slice(0, 4);
      attackers.forEach((f, i) => { f.restX = CX + spots[i][0]; f.restY = gy + inDir * spots[i][1] * 0.8; });
      const defs = this.teams[1 - teamIdx].players.filter(f => f.role === 'DF' || f.role === 'MF').slice(0, 4);
      defs.forEach((f, i) => { f.restX = CX + spots[i][0] + 10; f.restY = gy + inDir * (spots[i][1] * 0.8 + 16); });
    }
    // free kick: shove opponents back
    if (type === 'freekick') {
      for (const o of this.teams[1 - teamIdx].players) {
        const d = dist(o.x, o.y, x, y);
        if (d < 95) {
          const ux = (o.x - x) / (d || 1), uy = (o.y - y) / (d || 1);
          o.restX = x + ux * 100; o.restY = y + uy * 100;
        } else { o.restX = o.x; o.restY = o.y; }
      }
    }
    taker.restX = x - 2; taker.restY = y + team.atkDir * -14;
    if (type === 'throwin') taker.restY = y;
    this.restart = { type, x, y, team: teamIdx, taker, whistle: type === 'freekick' };
  }

  _restartUpdate(dt) {
    const r = this.restart;
    const b = this.ball;
    b.reset(r.x, r.y);
    if (r.type === 'throwin') b.z = 26;
    // kickoffs follow a goal/half: everyone hustles the full pitch back
    const kickoff = r.type === 'kickoff';
    const hustle = kickoff ? 1.35 : 1.05;
    const timeout = kickoff ? 3.6 : 2.4;
    let allNear = true;
    for (const f of this.all) {
      if (f.grounded) { f.update(dt); allNear = false; continue; }
      const d = dist(f.x, f.y, f.restX, f.restY);
      if (d > 26) allNear = false;
      const sp = Math.min(f.maxSpeed() * hustle, d * 3.5);
      f.desX = d > 2 ? (f.restX - f.x) / d * sp : 0;
      f.desY = d > 2 ? (f.restY - f.y) / d * sp : 0;
      f.update(dt);
    }
    this._collisions();
    if (allNear || this.stateT > timeout) {
      if (kickoff) {
        // nobody may start a kickoff in the wrong half — snap stragglers
        for (const f of this.all) {
          if (dist(f.x, f.y, f.restX, f.restY) > 40) {
            f.x = f.restX; f.y = f.restY; f.vx = 0; f.vy = 0;
            if (f.grounded) { f.state = 'run'; f.stateT = 0; }
          }
        }
      }
      this.state = 'ready';
      this.stateT = 0;
      if (r.whistle) AUDIO.whistle(1);
      if (this.userTeam === r.team) { this.sel = r.taker; r.taker.controlBlend = 1; }
    }
  }

  _readyUpdate(dt) {
    const r = this.restart;
    const b = this.ball;
    b.reset(r.x, r.y);
    if (r.type === 'throwin') b.z = 26;
    const t = r.taker;
    t.setFacing(this.goalPos(r.team).x - t.x, this.goalPos(r.team).y - t.y);
    for (const f of this.all) { f.desX = 0; f.desY = 0; if (!f.grounded) { f.vx *= 0.8; f.vy *= 0.8; } f.update(dt); }
    // user kick handled in _userControl; AI (or timeout) here
    const aiDelay = r.type === 'kickoff' ? 0.7 : 0.9;
    const userTakes = this.userTeam === r.team && this.mode !== 'demo';
    if ((!userTakes && this.stateT > aiDelay) || this.stateT > 4.5) {
      this._takeRestartKick(t, t.fx, t.fy, 0.5, false);
    }
  }

  _takeRestartKick(taker, aimX, aimY, power, byUser) {
    const r = this.restart;
    const team = this.teams[r.team];
    const b = this.ball;
    b.reset(r.x, r.y);
    this.state = 'play';
    this.stateT = 0;

    this.suppressOffside = true; // no offside straight from set pieces
    const mate = byUser ? this._pickPassTarget(taker, aimX, aimY) : null;
    switch (r.type) {
      case 'kickoff': {
        const target = mate || team.players[7] || team.players[1];
        this.passTo(taker, target, byUser ? 0 : 0.15);
        break;
      }
      case 'throwin': {
        b.z = 26;
        const target = mate || this._aiOpenMate(taker, 240);
        if (target) {
          const d = dist(b.x, b.y, target.x, target.y);
          this._loftedKick(taker, target.x, target.y, clamp(d / 300, 0.4, 0.8), byUser ? 0 : 12);
        } else {
          const l = Math.hypot(aimX, aimY) || 1;
          this._execKick(taker, aimX / l * 260, aimY / l * 260, 120);
        }
        break;
      }
      case 'corner': {
        // cross to the box
        const gy = this.goalPos(r.team).y;
        const inDir = -Math.sign(gy - CY);
        let tx = CX + rand(-50, 60), ty = gy + inDir * rand(70, 130);
        if (byUser && Math.hypot(aimX, aimY) > 0.3) {
          const d = clamp(200 + power * 260, 200, 430);
          tx = b.x + aimX * d; ty = b.y + aimY * d;
        }
        this._loftedKick(taker, tx, ty, 0.85, byUser ? 0 : 18);
        b.spin = (b.x < CX ? -1 : 1) * 120; // natural inswing
        break;
      }
      case 'goalkick': {
        if (byUser && mate) this.passTo(taker, mate, 0);
        else if (chance(0.6)) this.clear(taker);
        else { const m = this._aiOpenMate(taker, 300); m ? this.passTo(taker, m, 0.15) : this.clear(taker); }
        break;
      }
      case 'freekick': {
        const goal = this.goalPos(r.team);
        const dGoal = dist(b.x, b.y, goal.x, goal.y);
        if (byUser) {
          this._userKickBall(taker, aimX, aimY, power, power > 0.55);
        } else if (dGoal < 320 && chance(0.5)) {
          this.aiShoot(taker);
        } else {
          const m = this._aiOpenMate(taker, 320);
          m ? this.passTo(taker, m, 0.12) : this.clear(taker);
        }
        break;
      }
    }
    this.suppressOffside = false;
    this.restart = null;
  }

  _aiOpenMate(f, maxD) {
    const team = this.teams[f.team];
    let best = null, bestOpen = 40;
    for (const m of team.players) {
      if (m === f || m.role === 'GK' || m.grounded) continue;
      const d = dist(f.x, f.y, m.x, m.y);
      if (d > maxD || d < 50) continue;
      let open = 1e9;
      for (const o of this.teams[1 - f.team].players) open = Math.min(open, dist(m.x, m.y, o.x, o.y));
      open += (m.y - f.y) * this.teams[f.team].atkDir * 0.1;
      if (open > bestOpen) { bestOpen = open; best = m; }
    }
    return best;
  }

  // posts and bar are solid: swept test against this frame's travel, so a 900px/s
  // shot can't tunnel through the frame. clipping the inside of a post sends it in.
  _woodwork(dt) {
    const b = this.ball;
    this.postCD = Math.max(0, (this.postCD || 0) - dt);
    if (b.owner || b.z > BAR_Z + BALL_R) return;
    const RR = BALL_R + POST_R;

    for (const lineY of [PY, PY + PITCH_H]) {
      if (Math.min(b.py, b.y) > lineY + 40 || Math.max(b.py, b.y) < lineY - 40) continue;

      // posts (vertical, ground to bar)
      for (const side of [-1, 1]) {
        const px = CX + side * GOAL_W / 2;
        const hit = sweepHit(b.px, b.py, b.x, b.y, px, lineY, RR);
        if (!hit) continue;
        let nx = hit.x - px, ny = hit.y - lineY;
        const nd = Math.hypot(nx, ny) || 1;
        nx /= nd; ny /= nd;
        b.x = px + nx * (RR + 0.6);
        b.y = lineY + ny * (RR + 0.6);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 1.62 * vn * nx; b.vy -= 1.62 * vn * ny; }
        b.vx *= 0.92; b.vy *= 0.92; b.spin = 0;
        b.px = b.x; b.py = b.y;
        this._postHit(b.x, b.y);
        return;
      }

      // crossbar
      const crossing = (b.py - lineY) * (b.y - lineY) <= 0;
      if (crossing && Math.abs(b.x - CX) < GOAL_W / 2 && Math.abs(b.z - BAR_Z) < RR && b.z > 0) {
        b.y = b.py + (lineY - b.py) * 0.9 - Math.sign(b.vy) * 3;
        b.vy *= -0.35;
        b.vz = -Math.abs(b.vz) * 0.5 - 40;
        b.spin = 0;
        b.px = b.x; b.py = b.y;
        this._postHit(b.x, b.y);
        return;
      }
    }
  }

  _postHit(x, y) {
    if (this.pen && this.pen.phase === 'flight') this.pen.postHit = true;
    if (this.postCD > 0) return;
    this.postCD = 0.3;
    AUDIO.post();
    this.fx.text(x, y, 'POST!', '#ffd94a');
    this.fx.addShake(4);
    this.event('post', {});
  }

  // netting: a ball in the goal stays in the goal instead of sailing out the back
  _netHold() {
    const b = this.ball;
    if (b.owner) return;
    // a scored ball gets gathered in even if it was drifting out past a post
    const scored = this.state === 'goal' || (this.pen && this.pen.resolved && this.pen.scored);
    for (const lineY of [PY, PY + PITCH_H]) {
      const dir = lineY === PY ? -1 : 1;              // net extends away from the pitch
      const behind = (b.y - lineY) * dir;
      if (behind <= 0 || b.z > BAR_Z || Math.abs(b.x - CX) > GOAL_W / 2 + (scored ? 14 : 0)) continue;
      const back = GOAL_DEPTH - BALL_R - 2;
      if (behind > back) {                            // back netting
        b.y = lineY + dir * back;
        b.vy *= -0.15; b.vx *= 0.4; b.vz *= 0.3; b.spin = 0;
      }
      const lim = GOAL_W / 2 - BALL_R - POST_R;       // side netting
      if (b.x < CX - lim) { b.x = CX - lim; b.vx = Math.abs(b.vx) * 0.2; }
      else if (b.x > CX + lim) { b.x = CX + lim; b.vx = -Math.abs(b.vx) * 0.2; }
    }
  }

  _outOfPlay() {
    const b = this.ball;
    if (this.state !== 'play') return;

    // practice: just recycle the ball
    if (this.mode === 'practice') {
      if (b.x < PX - 20 || b.x > PX + PITCH_W + 20 || b.y < PY - 20 || b.y > PY + PITCH_H + 20) {
        const goalY = b.y < PY ? PY : b.y > PY + PITCH_H ? PY + PITCH_H : null;
        if (goalY !== null && Math.abs(b.x - CX) < GOAL_W / 2 && b.z < BAR_Z) { this._goalScored(goalY); return; }
        b.reset(CX, CY);
        this.fx.text(CX, CY, 'NEW BALL', '#fff');
      }
      return;
    }

    // side lines -> throw in
    if (b.x < PX || b.x > PX + PITCH_W) {
      const t = 1 - (b.lastTouchTeam === -1 ? 1 : b.lastTouchTeam);
      this._setupRestart('throwin', b.x < PX ? PX + 3 : PX + PITCH_W - 3, b.y, t);
      this.event('throwin', { team: t });
      return;
    }
    // goal lines
    let goalLineY = null;
    if (b.y < PY) goalLineY = PY;
    else if (b.y > PY + PITCH_H) goalLineY = PY + PITCH_H;
    if (goalLineY === null) return;

    const dx = b.x - CX;
    if (Math.abs(dx) < GOAL_W / 2 && b.z < BAR_Z) { this._goalScored(goalLineY); return; }

    // wide / over: corner or goal kick (which team defends this line?)
    const defTeam = this.teams[0].atkDir === -1
      ? (goalLineY === PY ? 1 : 0)      // team0 attacks top -> top goal defended by team1
      : (goalLineY === PY ? 0 : 1);
    if (b.lastTouchTeam === defTeam) this._setupRestart('corner', b.x, b.y, 1 - defTeam);
    else this._setupRestart('goalkick', b.x, b.y, defTeam);
  }

  _goalScored(goalLineY) {
    const b = this.ball;
    // scoring team attacks this goal line
    const scoringTi = this.teams[0].atkDir === (goalLineY === PY ? -1 : 1) ? 0 : 1;
    const team = this.teams[scoringTi];
    team.score++;
    const kicker = b.lastKicker && b.lastKicker.team === scoringTi ? b.lastKicker : null;
    const scorerName = kicker ? kicker.person.name : (b.lastKicker ? b.lastKicker.person.name + ' (OG)' : '???');
    team.scorers.push({ name: scorerName, min: Math.floor(this.clockMin) });
    this.state = 'goal';
    this.stateT = 0;
    // put it in the net for good: a shot from a tight angle used to keep drifting
    // sideways past the post and read as a miss
    const into = goalLineY === PY ? -1 : 1;
    const lim = GOAL_W / 2 - BALL_R - POST_R - 2;
    b.x = clamp(b.x, CX - lim, CX + lim);
    b.vx *= 0.15;
    b.vy = into * Math.max(70, Math.abs(b.vy) * 0.25);
    b.vz *= 0.3; b.spin = 0; b.shotAtGoal = -1;
    this.scorer = kicker || team.players[9] || team.players[0];
    this.scorer.celebrate(this.scorer.x + rand(-60, 60), clamp(this.scorer.y - this.teams[scoringTi].atkDir * -120, PY + 60, PY + PITCH_H - 60));
    for (const f of team.players) {
      if (f !== this.scorer && f.role !== 'GK' && dist(f.x, f.y, this.scorer.x, this.scorer.y) < 320) {
        f.celebrate(this.scorer.celebX + rand(-50, 50), this.scorer.celebY + rand(-50, 50));
      }
    }
    AUDIO.cheer(); AUDIO.net();
    this.fx.bigText('GOAL!', { sub: scorerName + ' ' + Math.floor(this.clockMin) + "'", color: '#ffd94a' });
    this.fx.confetti(b.x, goalLineY, [team.kit.shirt, team.kit.sleeve, '#fff', '#ffd94a']);
    this.fx.addShake(9);
    if (this.settings.vibration) vibrate([30, 40, 60]);
    this.event('goal', { team: scoringTi, scorer: scorerName, min: Math.floor(this.clockMin) });
  }

  // ================= penalties =================

  _startPenalty(attackTi, resumeAfter) {
    const defTi = 1 - attackTi;
    const atk = this.teams[attackTi];
    const goal = this.goalPos(attackTi);
    const spotY = goal.y - atk.atkDir * SPOT_DIST;
    const kicker = this.pens && this.pens.queue ? this.pens.queue : (atk.players[9] || atk.players[atk.players.length - 1]);
    const keeper = this.teams[defTi].players[0];
    this.state = 'penalty';
    this.stateT = 0;
    this.pen = {
      attackTi, defTi, resumeAfter,
      kicker, keeper,
      spotX: CX, spotY, goalY: goal.y, atkDir: atk.atkDir,
      phase: 'walk', t: 0,
      aimX: 0, power: 0.5,
      userKicker: attackTi === this.userTeam,
      userKeeper: defTi === this.userTeam && this.mode === 'shootout',
      keeperDove: false, resolved: false,
    };
    this.ball.reset(CX, spotY);
    // park everyone else
    for (const f of this.all) {
      if (f === kicker || f === keeper) continue;
      f.restX = CX + rand(-140, 140); f.restY = CY + rand(-80, 80);
    }
    // the principals get up (kicker may be the fouled man) and walk over
    kicker.state = 'run'; kicker.stateT = 0;
    if (keeper.state !== 'run') { keeper.state = 'run'; keeper.stateT = 0; }
    kicker.restX = CX - 10; kicker.restY = spotY - atk.atkDir * 42;
    keeper.restY = goal.y - atk.atkDir * 6;
    keeper.restX = CX;
    if (attackTi === this.userTeam) { this.sel = kicker; kicker.controlBlend = 1; }
  }

  _penaltyUpdate(dt) {
    const p = this.pen;
    const b = this.ball;
    p.t += dt;

    if (p.phase === 'walk') {
      b.reset(p.spotX, p.spotY);
      let near = true;
      for (const f of this.all) {
        if (f.grounded) {
          f.update(dt);
          if (f === p.kicker || f === p.keeper) near = false; // still getting up
          continue;
        }
        const d = dist(f.x, f.y, f.restX, f.restY);
        if ((f === p.kicker || f === p.keeper) && d > 14) near = false;
        const sp = Math.min(f.maxSpeed() * 1.15, d * 3.4);
        f.desX = d > 2 ? (f.restX - f.x) / d * sp : 0;
        f.desY = d > 2 ? (f.restY - f.y) / d * sp : 0;
        f.update(dt);
      }
      if (near || p.t > 4.2) {
        // never start the penalty without the principals in position
        for (const f of [p.kicker, p.keeper]) {
          if (dist(f.x, f.y, f.restX, f.restY) > 18) {
            f.x = f.restX; f.y = f.restY; f.vx = 0; f.vy = 0;
            f.state = 'run'; f.stateT = 0;
          }
        }
        p.phase = 'aim'; p.t = 0;
        AUDIO.whistle(1);
        if (p.userKicker) this.event('penaltyAim', {});
      }
      return;
    }

    if (p.phase === 'aim') {
      b.reset(p.spotX, p.spotY);
      p.kicker.setFacing(0, p.atkDir);
      p.keeper.setFacing(0, -p.atkDir);
      this._penaltyBystanders(dt);
      if (p.userKicker) {
        const inp = this.input;
        if (inp.stick.active) p.aimX = clamp(p.aimX + inp.stick.x * dt * 2.4, -1, 1);
        if (inp.kick.held) p.power = 0.35 + inp.kick.charge * 0.65;
        if (inp.kick.tapped || inp.kick.released || p.t > 7) {
          const pow = inp.kick.released ? 0.35 + inp.kick.releasedCharge * 0.65 : (p.t > 7 ? 0.5 : 0.5);
          this._penaltyKick(p.aimX, pow);
        }
      } else {
        if (p.userKeeper && this.input.stick.active) p.keeperLean = Math.sign(this.input.stick.x);
        if (p.t > rand(1.5, 2.3)) {
          const err = this.teams[p.attackTi].aiPrm.err;
          this._penaltyKick(clamp(rand(-1, 1) * 1.1, -1, 1), rand(0.45, 0.95), err);
        }
      }
      return;
    }

    if (p.phase === 'flight') {
      this._penaltyBystanders(dt);
      b.update(dt, this.pitchType);
      this._woodwork(dt);
      this._netHold();
      this._keeperUpdate(dt);
      // resolve: crossing line, keeper catch (handled by keeperUpdate), or dead
      const crossed = p.atkDir === 1 ? b.y >= p.goalY : b.y <= p.goalY;
      if (!p.resolved) {
        if (b.owner === p.keeper) { this._penaltyResolve(false, 'SAVED!'); }
        else if (crossed && Math.abs(b.x - CX) < GOAL_W / 2 && b.z < BAR_Z) { this._penaltyResolve(true, 'GOAL!'); }
        else if (crossed || b.speed() < 60 || p.t > 2.6) {
          const label = p.postHit ? 'OFF THE WOODWORK!'
            : Math.abs(b.x - CX) < GOAL_W / 2 + 10 ? 'SAVED!' : 'WIDE!';
          this._penaltyResolve(false, label);
        }
      } else if (p.t > 1.6) {
        this._penaltyNext();
      }
      return;
    }
  }

  // kicker & keeper hold their marks; everyone else keeps clearing the box
  // (only the goalie belongs anywhere near the goal during a penalty)
  _penaltyBystanders(dt) {
    const p = this.pen;
    for (const f of this.all) {
      if (f === p.kicker || f === p.keeper) {
        f.desX = 0; f.desY = 0;
        if (!f.grounded) { f.vx = 0; f.vy = 0; }
        f.update(dt);
        continue;
      }
      if (f.grounded || f.state === 'celeb') { f.update(dt); continue; }
      const d = dist(f.x, f.y, f.restX, f.restY);
      const sp = Math.min(f.maxSpeed(), d * 3);
      f.desX = d > 4 ? (f.restX - f.x) / d * sp : 0;
      f.desY = d > 4 ? (f.restY - f.y) / d * sp : 0;
      f.update(dt);
    }
  }

  _penaltyKick(aimX, power, err = 0) {
    const p = this.pen;
    const b = this.ball;
    let tx = CX + aimX * (GOAL_W / 2 - 12); // full aim = just inside the post, not off it
    if (err) tx += rand(-1, 1) * err * 30;
    if (power > 0.8) tx += rand(-1, 1) * (power - 0.8) * 130; // blasting = risky
    const T = 0.5 - power * 0.14;
    const tz = 6 + power * (BAR_Z - 4);
    const vx = (tx - b.x) / T;
    const vy = (p.goalY - b.y) / T;
    const vz = (tz - b.z) / T + 0.5 * GRAVITY * T;
    this._execKick(p.kicker, vx, vy, vz);
    b.shotAtGoal = p.defTi;
    p.phase = 'flight'; p.t = 0;
    this.teams[p.attackTi].stats.shots++;

    // keeper dive
    const keeper = p.keeper;
    const prm = this.teams[p.defTi].aiPrm.keeper;
    let diveDir;
    if (p.userKeeper && p.keeperLean) diveDir = p.keeperLean;
    else diveDir = chance(0.5 + prm * 0.04) ? Math.sign(tx - CX) || 1 : -(Math.sign(tx - CX) || 1);
    const reach = (0.55 + prm * 0.5) * (GOAL_W / 2);
    setTimeout(() => {
      if (this.pen === p && p.phase === 'flight') {
        keeper.startDive(diveDir * reach / T * 0.75, 0);
      }
    }, 90 + (1.25 - prm) * 120);
  }

  _penaltyResolve(scored, label) {
    const p = this.pen;
    p.resolved = true;
    p.scored = scored;
    if (scored) {
      const team = this.teams[p.attackTi];
      if (this.mode !== 'shootout' || !this.pens) {
        if (p.resumeAfter === 'play') {
          team.score++;
          team.scorers.push({ name: p.kicker.person.name + ' (P)', min: Math.floor(this.clockMin) });
        }
      }
      AUDIO.cheer();
      this.fx.bigText('GOAL!', { sub: p.kicker.person.name, color: '#ffd94a' });
      this.fx.confetti(this.ball.x, p.goalY, [this.teams[p.attackTi].kit.shirt, '#fff', '#ffd94a']);
      p.kicker.celebrate(p.kicker.x + rand(-40, 40), p.kicker.y - p.atkDir * 90);
    } else {
      AUDIO.aww();
      this.fx.bigText(label, { color: '#8af0ff' });
    }
    if (this.pens) {
      this.pens[p.attackTi === this.pens.firstTi ? 'a' : 'b'].push(scored ? 1 : 0);
    }
    this.event('penaltyResult', { scored });
  }

  _penaltyNext() {
    const p = this.pen;
    this.pen = null;
    if (p.resumeAfter === 'play') {
      // resume match: goal -> kickoff, else goal kick
      if (p.scored) this._setupKickoff(p.defTi);
      else this._setupRestart('goalkick', CX - 60, 0, p.defTi);
      return;
    }
    // shootout flow
    const s = this.pens;
    const a = s.a.reduce((x, y) => x + y, 0), bb = s.b.reduce((x, y) => x + y, 0);
    const ra = s.a.length, rb = s.b.length;
    let done = false;
    if (ra >= 5 && rb >= 5 && ra === rb && a !== bb) done = true;
    else if (ra <= 5 && rb <= 5) {
      // decided early?
      if (a > bb + (5 - rb)) done = true;
      if (bb > a + (5 - ra)) done = true;
    }
    if (done) { this._shootoutEnd(); return; }
    const nextTi = ra === rb ? s.firstTi : 1 - s.firstTi;
    // rotate kickers
    const team = this.teams[nextTi];
    s.kIdx[nextTi] = (s.kIdx[nextTi] + 1) % 10;
    const kicker = team.players[10 - s.kIdx[nextTi] % team.players.length] || team.players[team.players.length - 1];
    this.pens.queue = kicker;
    this._startPenalty(nextTi, 'shootout');
  }

  _beginShootout() {
    this.pens = { a: [], b: [], firstTi: chance(0.5) ? 0 : 1, kIdx: [0, 0], queue: null };
    this.fx.bigText('PENALTIES!', { color: '#ffd94a', sub: 'best of five' });
    AUDIO.whistle(2);
    // both teams shoot at the bottom goal for camera comfort
    this.teams[0].atkDir = 1; this.teams[1].atkDir = 1;
    for (const f of this.all) { f.x = CX + rand(-150, 150); f.y = CY + rand(-60, 60); }
    const s = this.pens;
    const team = this.teams[s.firstTi];
    s.queue = team.players[10] || team.players[team.players.length - 1];
    this._startPenalty(s.firstTi, 'shootout');
  }

  _shootoutEnd() {
    const s = this.pens;
    const a = s.a.reduce((x, y) => x + y, 0), b = s.b.reduce((x, y) => x + y, 0);
    // map back to team indexes
    const scoreFirst = a, scoreSecond = b;
    const tiFirst = s.firstTi, tiSecond = 1 - s.firstTi;
    this.penResult = { [tiFirst]: scoreFirst, [tiSecond]: scoreSecond };
    this._fullTime(true);
  }

  // ================= flow: goal/half/full time =================

  _goalStateUpdate(dt) {
    for (const f of this.all) f.update(dt);
    this.ball.update(dt, this.pitchType);
    this._woodwork(dt);
    this._netHold();
    // keep ball in the net
    this.ball.vx *= Math.exp(-4 * dt); this.ball.vy *= Math.exp(-4 * dt);
    if (this.stateT > 2.3 + GOAL_BALL_LINGER) {
      if (this.mode === 'practice') { this.ball.reset(CX, CY); this.state = 'play'; return; }
      if (this.mode !== 'demo' && this.settings.replays && this.replay.begin()) {
        this.state = 'replay';
        this.stateT = 0;
        this.event('replayStart', {});
      } else {
        const conceded = this.teams[0].atkDir === -1
          ? (this.ball.y < CY ? 1 : 0) : (this.ball.y < CY ? 0 : 1);
        this._setupKickoff(this.teams[0].score + this.teams[1].score > 0 && this.scorer ? 1 - this.scorer.team : conceded);
      }
    }
  }

  _replayUpdate(dt) {
    if (this.input.tapEdge || this.input.kick.tapped) {
      this.replay.skip();
      this.event('replayEnd', {});
      this._endReplay();                 // tapped to skip: get straight on with it
      return;
    }
    if (!this.replay.step(this, dt)) {
      this.state = 'replayhold';         // hold on the ball in the net for a beat
      this.stateT = 0;
      this.event('replayEnd', {});
    }
  }

  _replayHoldUpdate(dt) {
    if (this.stateT > REPLAY_HOLD || this.input.tapEdge || this.input.kick.tapped) this._endReplay();
  }

  _endReplay() {
    for (const f of this.all) { f.replayDir = undefined; f.replayPose = undefined; }
    this._setupKickoff(this.scorer ? 1 - this.scorer.team : 0);
  }

  _clock(dt) {
    if (this.mode === 'practice' || this.mode === 'shootout') return;
    this.elapsed += dt;
    this.clockMin = (this.half - 1) * 45 + Math.min(45.4, (this.elapsed / this.halfLen) * 45);
    if (this.elapsed >= this.halfLen && this.state === 'play') {
      if (this.half === 1) {
        this.half = 2;
        this.elapsed = 0;
        this.state = 'halftime';
        this.stateT = 0;
        AUDIO.whistle(2, true);
        this.fx.bigText('HALF TIME', { color: '#fff' });
        this.event('half', this.result());
      } else {
        this._fullTime(false);
      }
    }
  }

  resumeSecondHalf() {
    this.teams[0].atkDir *= -1;
    this.teams[1].atkDir *= -1;
    this.replay.clear();
    this._setupKickoff(1);
  }

  _fullTime(fromShootout) {
    // draw needing a winner? go to penalties
    const draw = this.teams[0].score === this.teams[1].score;
    if (!fromShootout && draw && this.cfg.resolveDraw) {
      this.mode2 = 'shootout';
      this.mode = this.mode; // keep mode label; shootout runs inline
      AUDIO.whistle(2, true);
      this.fx.bigText('FULL TIME', { sub: 'penalties decide it!', color: '#fff' });
      this._beginShootout();
      return;
    }
    this.state = 'fulltime';
    this.stateT = 0;
    this.finished = true;
    AUDIO.whistle(3, true);
    this.fx.bigText('FULL TIME', { color: '#fff' });
    this.event('fulltime', this.result());
  }

  result() {
    const t0 = this.teams[0], t1 = this.teams[1];
    const total = t0.stats.possession + t1.stats.possession;
    return {
      a: t0.score, b: t1.score,
      nameA: t0.def.name, nameB: t1.def.name,
      scorersA: t0.scorers, scorersB: t1.scorers,
      statsA: { ...t0.stats, possession: Math.round(t0.stats.possession / total * 100) },
      statsB: { ...t1.stats, possession: Math.round(t1.stats.possession / total * 100) },
      pens: this.penResult || null,
      userTeam: this.userTeam,
    };
  }

  // ================= main update =================

  update(dt) {
    if (this.paused || this.finished && this.state !== 'fulltime') return;
    this.now = (this.now || 0) + dt;
    this.stateT += dt;
    const b = this.ball;

    switch (this.state) {
      case 'restart': this._restartUpdate(dt); break;
      case 'ready': this._readyUpdate(dt); this._userControl(dt); break;
      case 'penalty': this._penaltyUpdate(dt); break;
      case 'goal': this._goalStateUpdate(dt); break;
      case 'replay': this._replayUpdate(dt); break;
      case 'replayhold': this._replayHoldUpdate(dt); break;
      case 'halftime': break;
      case 'fulltime': {
        for (const f of this.all) { f.desX = 0; f.desY = 0; f.update(dt); }
        b.update(dt, this.pitchType);
        break;
      }
      case 'play': {
        teamThink(this, 0, dt);
        teamThink(this, 1, dt);
        this._userControl(dt);
        for (const f of this.all) f.update(dt);
        this._collisions();
        b.update(dt, this.pitchType);
        this._woodwork(dt);
        this._netHold();
        this._possession(dt);
        this._keeperUpdate(dt);
        this._keeperDistribute(dt);
        this._foulCheck();
        this._outOfPlay();
        this._clock(dt);
        // possession stats
        if (b.owner) this.teams[b.owner.team].stats.possession += dt;
        if (this.state === 'play') this.replay.record(this, dt);
        break;
      }
    }

    // clear one-shot foul flags when slides end
    for (const f of this.all) if (f.state !== 'slide') { f.slideWon = false; f.fouled = false; }

    // camera target
    let camX = b.x, camY = b.y, lvx = b.vx, lvy = b.vy;
    // stay on the ball as it hits the net, then swing over to the celebration
    if (this.state === 'goal' && this.scorer && this.stateT > GOAL_BALL_LINGER) {
      camX = this.scorer.x; camY = this.scorer.y; lvx = lvy = 0;
    }
    if (this.state === 'penalty' && this.pen) {
      camX = CX; camY = (this.pen.spotY + this.pen.goalY) / 2; lvx = lvy = 0;
    }
    // pull back at set-pieces so your team is on screen, then ease in for play
    const wide = (this.state === 'restart' || this.state === 'ready') ? RESTART_ZOOM : 1;
    this.camera.update(dt, camX, camY, lvx, lvy, wide);

    this.fx.update(dt);
    AUDIO.update(dt);
    this.input.endFrame();
  }
}
