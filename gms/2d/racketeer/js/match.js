// The match engine: state machine + rules + skills. One instance per match.
import { COURT, SWING, SHOT_T, PLAYER, METERS, PTS, BALL_R } from "./const.js";
import { clamp, lerp, rand, pick, pickBag } from "./util.js";
import { makeBall, stepBall, predictLanding, predictAtDepth, aimVelocity, netClearance, drawBall } from "./ball.js";
import { makePlayer, setState, updatePlayer, drawPlayer } from "./player.js";
import { drawScene, drawNet, setCrowd, project, view, pokeUmpire } from "./court.js";
import * as FX from "./fx.js";
import { sfx, setCrowdLevel } from "./audio.js";
import { skillFx, SKILLS } from "./skills.js";
import * as NAMES from "./names.js";
import { aiUpdate, aiPointStart, aiBetweenPoints } from "./ai.js";

const YOU_Y = 1.1, OPP_Y = COURT.L - 1.1;

export function makeMatch(save, opp, tier, gear, hooks) {
  const m = {
    save, opp, tier, gear, hooks,          // hooks: {onHud, onTicker, onSkillDock, onMatchOver, onPause}
    time: 0, timeScale: 1, state: "preServe", stateT: 0,
    you: makePlayer({ col: "#ffd23e", col2: "#1d3557", skin: "#f2c79c" }),
    oppP: makePlayer({ far: true, boss: opp.boss, col: opp.boss ? "#3d4450" : pick(["#e63946", "#9b5de5", "#00b4d8", "#f77f00", "#43aa8b"]), col2: "#333", skin: pick(["#f2c79c", "#d9a066", "#a56a3a", "#ffdbac"]) }),
    ball: makeBall(),
    server: "you", serveNum: 1, serveSide: 1,
    ptsYou: 0, ptsOpp: 0, gamesYou: 0, gamesOpp: 0, targetGames: tier.games,
    stam: 100, comp: 100, oppStam: 100, oppComp: 100,
    hype: 10, mojo: 25, oppMojo: 20,
    earnings: 0, over: false, won: false,
    // Swing state
    contact: null,            // {t, x, z} predicted contact for whoever ball approaches
    ballTo: null,             // "you" | "opp" — who the ball is travelling toward
    pendingQuality: null, pendingAim: null,
    aim: { x: 0, y: OPP_Y - 3.5 },     // player aim reticle (world, opp side)
    aiming: false,
    // Serve
    serveMeter: 0, serveDir: 1, tossed: false,
    // Skill effects
    armedPower: false, armedOutrageous: false, gruntNext: 0, zoneShots: 0, zoneWiden: 1,
    oppNextError: 0, youNextError: 0, youWindowShrink: 1, underarmServe: false,
    injuriesUsed: 0, cooldowns: {}, lastPointWonBy: null, canArgue: false, argued: false,
    oppFx: { gruntNext: 0, zoneShots: 0, armedPower: false, armedOutrageous: false, injuriesUsed: 0, underarm: false },
    autoPilot: false, pointNum: 0, netcordPending: null,
    stats: { winners: 0, aces: 0, outrageous: 0, longestRally: 0, rally: 0 },
    msg: null, msgT: 0,
  };
  setCrowd(tier.crowd);
  m.you.x = 0; m.you.y = YOU_Y; m.oppP.x = 0; m.oppP.y = OPP_Y;
  if (opp.boss) sayBanner(m, pick(NAMES.BOSS_LINES), "#ff5c5c", 1.0);
  beginPreServe(m, true);
  return m;
}

/* ---------------- helpers ---------------- */
function ticker(m, str, dur = 2.4) { m.hooks.onTicker && m.hooks.onTicker(str, dur); }
function sayBanner(m, str, col, size = 1.4) { FX.bannerText(str, col, size); }
function hypeMult(m) { return 1 + (m.hype / 100) * (1 + m.gear.hyp); }
function earn(m, base, wx, wy) {
  const amt = Math.max(1, Math.round(base * hypeMult(m)));
  m.earnings += amt;
  sfx.cash(2);
  if (wx !== undefined) FX.floatText(wx, wy, 2.2, `+$${amt}`, "#7ee6a1", 0.9);
  pushHud(m);
  return amt;
}
function addMojo(m, n) { m.mojo = clamp(m.mojo + n, 0, METERS.MOJO_MAX); pushHud(m); }
function addHype(m, n) { m.hype = clamp(m.hype + n, 0, 100); setCrowdLevel(m.hype / 100); pushHud(m); }
function pushHud(m) { m.hooks.onHud && m.hooks.onHud(m); }
export function skillLevel(m, id) { return m.save.skills[id] || 0; }

function ptLabel(m, mine) {
  const a = mine ? m.ptsYou : m.ptsOpp, b = mine ? m.ptsOpp : m.ptsYou;
  if (a >= 3 && b >= 3) return a === b ? "40" : (a > b ? "AD" : "40");
  return PTS[Math.min(a, 3)];
}
export function scoreLine(m) {
  return { youPts: ptLabel(m, true), oppPts: ptLabel(m, false), youGames: m.gamesYou, oppGames: m.gamesOpp };
}

/* ---------------- state transitions ---------------- */
function beginPreServe(m, first) {
  m.state = "preServe"; m.stateT = 0;
  m.ball.live = false; m.ball.trail.length = 0;
  m.contact = null; m.ballTo = null; m.pendingQuality = null;
  m.armedPower = false; m.armedOutrageous = false; m.canArgue = false;
  m.tossed = false; m.underarmServe = false;
  m.stam = clamp(m.stam + METERS.STAM_POINT_REST, 0, 100);
  m.oppStam = clamp(m.oppStam + METERS.STAM_POINT_REST, 0, 100);
  m.serveSide = ((m.ptsYou + m.ptsOpp) % 2 === 0) ? 1 : -1;
  const sx = m.serveSide * 2.0;
  m.you.tx = m.server === "you" ? sx : 0;
  m.oppP.tx = m.server === "opp" ? -sx : 0;
  m.ball.x = m.server === "you" ? sx : -sx;
  m.ball.y = m.server === "you" ? YOU_Y - 0.2 : OPP_Y + 0.2;
  m.ball.z = 1.0;
  setState(m.you, "idle"); setState(m.oppP, "idle");
  if (!first) aiBetweenPoints(m);
  m.hooks.onSkillDock && m.hooks.onSkillDock(m);
  pushHud(m);
  if (m.server === "you") ticker(m, m.serveNum === 2 ? "Second serve — tap to toss, tap to hit!" : "Your serve — tap to toss, tap to hit!", 3);
  else ticker(m, `${m.opp.name.split(" ")[0]} to serve...`, 2);
}

function startRallyFromServe(m, byYou, quality) {
  const b = m.ball;
  b.live = true; b.bounces = 0; b.lastHitBy = byYou ? "you" : "opp";
  m.stats.rally = 0;
  const serveBonus = byYou ? skillFx("luckyballs", skillLevel(m, "luckyballs") || 1, "serve") * (skillLevel(m, "luckyballs") ? 1 : 0) : 0;
  const fromY = byYou ? YOU_Y : OPP_Y;
  const dir = byYou ? 1 : -1;
  b.x = (byYou ? 1 : -1) * m.serveSide * 2.0; b.y = fromY; b.z = 2.5;
  // Serve target: service box depth
  const depth = COURT.NET_Y + dir * rand(2.2, 5.0);
  const err = (1 - quality) * 2.6;
  const tx = clamp(-m.serveSide * dir * rand(0.6, 3.2) + rand(-err, err), -COURT.W / 2 - err, COURT.W / 2 + err);
  const T = lerp(0.95, 0.62, quality) * (1 - serveBonus);
  const v = aimVelocity(b.x, b.y, b.z, tx, depth + rand(-err, err) * dir, T);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  setState(byYou ? m.you : m.oppP, "serve");
  sfx.pock(1 + quality);
  m.ballTo = byYou ? "opp" : "you";
  scheduleContact(m);
  m.state = "rally"; m.stateT = 0;
}

/* ---------------- shots ---------------- */
function scheduleContact(m) {
  const targetY = m.ballTo === "you" ? YOU_Y : OPP_Y;
  const p = predictAtDepth(m.ball, targetY);
  if (p) m.contact = { t: m.time + p.t, x: clamp(p.x, -COURT.W / 2 - 3, COURT.W / 2 + 3), z: p.z };
  else m.contact = null;
}

// quality: 0..1 (1 = perfect). Executes a groundstroke for `who`.
function hitShot(m, who, quality, aimX, aimY, opts = {}) {
  const you = who === "you";
  const b = m.ball;
  const P = you ? m.you : m.oppP;
  setState(P, opts.flip ? "flip" : "swing");
  b.lastHitBy = who; b.bounces = 0;
  m.stats.rally++;
  if (you) addMojo(m, METERS.MOJO_PER_RALLY_HIT);
  else m.oppMojo = clamp(m.oppMojo + 8, 0, 100);

  // Error from quality + composure + forced effects
  const comp = you ? m.comp : m.oppComp;
  let err = (1 - quality) * 3.2 + (1 - comp / 100) * 1.4;
  if (you && m.youNextError) { err += m.youNextError; m.youNextError = 0; }
  if (!you && m.oppNextError) { err += m.oppNextError; m.oppNextError = 0; }
  if (you && skillLevel(m, "luckyballs")) err *= (1 - skillFx("luckyballs", skillLevel(m, "luckyballs"), "mercy"));

  // Power
  let powBonus = you ? m.gear.pow : (m.opp.stars * 0.05);
  let T = lerp(SHOT_T.shank, SHOT_T.perfect, quality);
  const gruntNow = you ? m.gruntNext : m.oppFx.gruntNext;
  if (gruntNow) {
    powBonus += gruntNow;
    if (you) m.gruntNext = 0; else m.oppFx.gruntNext = 0;
  }
  if (opts.power) powBonus += opts.power;
  T *= (1 - clamp(powBonus, 0, 0.6) * 0.45);
  const lowStam = (you ? m.stam : m.oppStam) < 25;
  if (lowStam) T *= 1.25;

  // Final target with error scatter
  const dir = you ? 1 : -1;
  let tx = aimX + rand(-err, err) * 0.9;
  let ty = aimY + rand(-err, err) * 1.1 * dir;
  // Terrible shots sometimes just hit the net
  const netFlub = quality < 0.25 && Math.random() < 0.5;
  const v = aimVelocity(b.x, b.y, Math.max(b.z, 0.3), tx, ty, T);
  if (!netFlub) {
    // Auto-loft to clear the net for decent-quality shots
    let tries = 0;
    while (netClearance(b.x, b.y, Math.max(b.z, 0.3), v) < 0.06 && tries++ < 5) {
      T *= 1.13;
      const v2 = aimVelocity(b.x, b.y, Math.max(b.z, 0.3), tx, ty, T);
      v.vx = v2.vx; v.vy = v2.vy; v.vz = v2.vz;
    }
  }
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.live = true;
  sfx.pock(0.8 + quality + powBonus);
  if (quality > 0.9) FX.floatText(b.x, b.y, b.z + 0.4, "PERFECT!", "#ffe24a", 0.8);
  else if (quality < 0.25) FX.floatText(b.x, b.y, b.z + 0.4, "SHANK!", "#ff8a5c", 0.7);
  FX.burst(b.x, b.y, b.z, 6, "#f4ff9a", 2.5);
  m.ballTo = you ? "opp" : "you";
  scheduleContact(m);
}

/* ---------------- point resolution ---------------- */
function inCourt(x, y) {
  return Math.abs(x) <= COURT.W / 2 + BALL_R && y >= -BALL_R && y <= COURT.L + BALL_R;
}

function endPoint(m, winner, why) {
  if (m.state === "pointOver" || m.over) return;
  m.state = "pointOver"; m.stateT = 0;
  m.lastPointWonBy = winner; m.argued = false;
  m.ball.live = false;
  m.contact = null;
  m.stats.longestRally = Math.max(m.stats.longestRally, m.stats.rally);
  const youWon = winner === "you";
  m.canArgue = !youWon && skillLevel(m, "argue") > 0 && m.mojo >= SKILLS.argue.mojo && why !== "netYou";

  if (youWon) {
    m.ptsYou++;
    addMojo(m, METERS.MOJO_POINT_WIN);
    addHype(m, why === "winner" || why === "ace" ? METERS.HYPE_WINNER : 3);
    m.comp = clamp(m.comp + 2, 0, 100);
    const base = 4 + m.tier.id * 6;
    earn(m, base, m.you.x, YOU_Y);
    setState(m.you, "celebrate"); setState(m.oppP, "sad");
    sfx.cheer(0.7 + m.hype / 150);
    if (why === "ace") { m.stats.aces++; sayBanner(m, pick(NAMES.COMMENT_ACE), "#ffe24a"); }
    else if (why === "winner") { m.stats.winners++; sayBanner(m, pick(NAMES.COMMENT_WINNER), "#7ee6a1", 1.1); }
    else if (why === "oppError") ticker(m, pick(NAMES.COMMENT_ERROR));
  } else {
    m.ptsOpp++;
    m.oppComp = clamp(m.oppComp + 2, 0, 100);
    m.comp = clamp(m.comp - (why === "youError" ? METERS.COMP_ERR_PENALTY : 3), 5, 100);
    setState(m.oppP, "celebrate"); setState(m.you, "sad");
    if (why === "youError") { sfx.gasp(); ticker(m, pick(NAMES.COMMENT_ERROR)); }
    else sfx.cheer(0.3);
    if (m.opp.boss && Math.random() < 0.4) sayBanner(m, pick(NAMES.BOSS_LINES), "#ff5c5c", 0.9);
  }
  pushHud(m);
  m.hooks.onSkillDock && m.hooks.onSkillDock(m);
  // Game / match?
  const a = m.ptsYou, b = m.ptsOpp;
  if ((a >= 4 || b >= 4) && Math.abs(a - b) >= 2) {
    const youGame = a > b;
    m.pendingGame = youGame ? "you" : "opp";
  } else m.pendingGame = null;
}

function settleGame(m) {
  if (!m.pendingGame) return false;
  const youGame = m.pendingGame === "you";
  if (youGame) m.gamesYou++; else m.gamesOpp++;
  m.ptsYou = 0; m.ptsOpp = 0;
  m.server = m.server === "you" ? "opp" : "you"; m.serveNum = 1;
  m.pendingGame = null;
  if (m.gamesYou >= m.targetGames || m.gamesOpp >= m.targetGames) {
    finishMatch(m, m.gamesYou > m.gamesOpp);
    return true;
  }
  sayBanner(m, youGame ? "GAME YOU! 🎾" : "GAME " + m.opp.name.split(" ")[0].toUpperCase(), youGame ? "#7ee6a1" : "#ff8a5c", 1.3);
  if (youGame) { sfx.fanfare(); earn(m, 15 + m.tier.id * 10, 0, YOU_Y + 2); }
  return false;
}

function finishMatch(m, won) {
  m.over = true; m.won = won; m.state = "matchOver"; m.stateT = 0;
  if (won) {
    m.earnings += Math.round(m.tier.prize * hypeMult(m));
    sfx.fanfare(); setTimeout(() => sfx.cheer(1.5), 300);
    FX.confetti(90);
    setState(m.you, "celebrate"); setState(m.oppP, "sad");
    sayBanner(m, "MATCH WON!", "#ffe24a", 1.8);
  } else {
    sfx.sadTrombone();
    setState(m.you, "sad"); setState(m.oppP, "celebrate");
    sayBanner(m, "DEFEAT...", "#8899aa", 1.5);
  }
  setTimeout(() => m.hooks.onMatchOver && m.hooks.onMatchOver(m), 2200);
}

/* ---------------- player input API (called from input.js / ui.js) ---------------- */
export function inputPress(m, nx, ny) {
  if (m.over) return;
  if (m.state === "preServe" && m.server === "you") {
    if (!m.tossed) {
      if (m.underarmServe) return;      // underarm resolves itself
      m.tossed = true; m.serveMeter = 0; m.serveDir = 1;
      sfx.serveToss();
      m.state = "serveMeter"; m.stateT = 0;
    }
    return;
  }
  if (m.state === "serveMeter") {
    // Second tap = hit serve; meter near 1 = great
    const q = clamp(1 - Math.abs(1 - m.serveMeter) * 1.6, 0.1, 1);
    serveNow(m, q);
    return;
  }
  if (m.state === "rally") {
    m.aiming = true;
    updateAim(m, nx, ny);
  }
}

export function inputMove(m, nx, ny) {
  if (m.aiming) updateAim(m, nx, ny);
}

export function inputRelease(m) {
  if (!m.aiming) return;
  m.aiming = false;
  if (m.state !== "rally" || m.ballTo !== "you" || !m.contact) return;
  const dt = m.contact.t - m.time;
  if (dt > SWING.WINDOW) return;              // way too early: ignore, keep aiming chances
  commitSwing(m, dt);
}

function updateAim(m, nx, ny) {
  // Map screen to opponent court: x across width, y (0.05..0.6 of screen) to depth
  m.aim.x = clamp((nx - 0.5) * 2 * (COURT.W / 2 + 0.6), -COURT.W / 2 - 1, COURT.W / 2 + 1);
  const t = clamp((ny - 0.06) / 0.5, 0, 1);   // top of screen = deep
  m.aim.y = lerp(OPP_Y - 0.4, COURT.NET_Y + 1.6, t);
}

function qualityFromDt(m, dt) {
  const widen = (m.zoneShots > 0 ? m.zoneWiden : 1) / m.youWindowShrink;
  const a = Math.abs(dt);
  if (a <= SWING.PERFECT * widen) return 1;
  if (a <= SWING.GOOD * widen) return 0.75;
  if (a <= SWING.OK * widen) return 0.45;
  return 0.15;
}

function commitSwing(m, dt) {
  let q = qualityFromDt(m, dt);
  m.youWindowShrink = 1;
  if (m.zoneShots > 0) m.zoneShots--;
  m.pendingQuality = q;
  m.pendingAim = { x: m.aim.x, y: m.aim.y };
  // If commit is at/after contact, execute immediately
  if (dt <= 0.02) executePlayerSwing(m);
}

function executePlayerSwing(m) {
  const q = m.pendingQuality, aim = m.pendingAim || { x: m.aim.x, y: m.aim.y };
  m.pendingQuality = null; m.pendingAim = null;
  // Out of reach → whiff
  if (Math.abs(m.ball.x - m.you.x) > SWING.REACH_X + 0.4) {
    setState(m.you, "swing"); sfx.swishMiss();
    return;
  }
  const opts = {};
  if (m.armedPower) {
    const lvl = skillLevel(m, "power");
    opts.power = skillFx("power", lvl, "pow");
    m.stam = clamp(m.stam - skillFx("power", lvl, "stam"), 0, 100);
    m.armedPower = false;
    FX.addShake(7); FX.burst(m.ball.x, m.ball.y, m.ball.z, 14, ["#ffd34a", "#ff8a5c"], 5);
  }
  if (m.armedOutrageous) {
    m.armedOutrageous = false;
    const lvl = skillLevel(m, "outrageous");
    m.stam = clamp(m.stam - 15, 0, 100);
    if (Math.random() < skillFx("outrageous", lvl, "landChance") * (q > 0.4 ? 1 : 0.5)) {
      // SPECTACLE: guaranteed screamer to a corner
      const name = pick(NAMES.OUTRAGEOUS_NAMES);
      sayBanner(m, name + "!", "#ff5ce1", 1.4);
      sfx.cheer(1.4); FX.addShake(10);
      addHype(m, skillFx("outrageous", lvl, "hype"));
      earn(m, skillFx("outrageous", lvl, "cash"), m.you.x, YOU_Y);
      m.stats.outrageous++;
      opts.flip = true;
      hitShot(m, "you", 1, pick([-1, 1]) * (COURT.W / 2 - 0.35), OPP_Y - rand(0.3, 1.2), { ...opts, power: (opts.power || 0) + 0.25, flip: true });
      return;
    }
    // Faceplant
    setState(m.you, "faceplant");
    sfx.gasp(); sfx.boo(); FX.addShake(6);
    sayBanner(m, "FACEPLANT!", "#ff8a5c", 1.2);
    addHype(m, 6);   // crowd still enjoys it
    return;          // no contact — ball will bounce twice
  }
  hitShot(m, "you", q, aim.x, aim.y, opts);
  m.hooks.onSkillDock && m.hooks.onSkillDock(m);
}

function serveNow(m, q) {
  m.serveQuality = q;
  m.state = "serving"; m.stateT = 0;
  setState(m.you, "serve");
  setTimeout(() => {}, 0);
}

/* ---------------- skills (player) ---------------- */
export function canUseSkill(m, id) {
  const lvl = skillLevel(m, id);
  if (!lvl || m.over) return false;
  const def = SKILLS[id];
  if (def.type === "passive") return false;
  if (m.mojo < def.mojo) return false;
  if (m.cooldowns[id] && m.time < m.cooldowns[id]) return false;
  if (def.betweenPoints && m.state !== "preServe") return false;
  if (def.serveOnly && !(m.state === "preServe" && m.server === "you" && !m.tossed)) return false;
  if (def.afterLoss && !(m.state === "pointOver" && m.canArgue && !m.argued)) return false;
  if (id === "power" || id === "outrageous") {
    if (!(m.state === "rally" || m.state === "preServe")) return false;
    if (m.stam < 20) return false;
  }
  if (id === "racketsmash" && m.save.money + m.earnings < skillFx("racketsmash", lvl, "cashCost")) return false;
  return true;
}

export function useSkill(m, id) {
  if (!canUseSkill(m, id)) return false;
  const lvl = skillLevel(m, id);
  const def = SKILLS[id];
  m.mojo -= def.mojo;
  if (def.cd) m.cooldowns[id] = m.time + def.cd;
  switch (id) {
    case "power":
      m.armedPower = !m.armedPower ? true : m.armedPower;
      ticker(m, "POWER HIT ARMED 💥");
      sfx.click();
      break;
    case "grunt": {
      m.gruntNext = skillFx("grunt", lvl, "pow");
      const g = pick(NAMES.GRUNTS);
      FX.floatText(m.you.x, YOU_Y + 1, 2.2, g, "#ffd34a", 1.2);
      sfx.grunt(lvl);
      FX.addShake(3 + lvl);
      if (Math.random() < skillFx("grunt", lvl, "startle")) {
        m.oppNextError = 1.6;
        FX.floatText(m.oppP.x, OPP_Y, 2.4, "😨", "#fff", 1.2);
        ticker(m, "Opponent startled by sheer volume!");
      }
      break;
    }
    case "heckle": {
      const line = pickBag("heck", NAMES.HECKLES);
      setState(m.you, "heckle");
      FX.speech(m.you.x, YOU_Y + 0.5, line, 2.6);
      sfx.heckleLaugh();
      m.oppComp = clamp(m.oppComp - skillFx("heckle", lvl, "comp"), 5, 100);
      addHype(m, 4);
      ticker(m, "Opponent composure rattled!");
      break;
    }
    case "argue": {
      m.argued = true;
      setState(m.you, "argue");
      pokeUmpire(); sfx.umpBeep();
      FX.speech(m.you.x, YOU_Y + 0.5, pick(NAMES.ARGUE_LINES), 2.4);
      const r = Math.random();
      setTimeout(() => {
        if (m.over) return;
        if (r < skillFx("argue", lvl, "win")) {
          // Point stolen back!
          m.ptsOpp = Math.max(0, m.ptsOpp - 1); m.ptsYou++;
          sayBanner(m, pick(NAMES.UMPIRE_OK), "#7ee6a1", 0.9);
          sfx.cheer(0.8); addHype(m, 6);
          recheckGamePending(m);
        } else if (r < skillFx("argue", lvl, "win") + skillFx("argue", lvl, "replay")) {
          m.ptsOpp = Math.max(0, m.ptsOpp - 1);
          sayBanner(m, pick(NAMES.UMPIRE_REPLAY), "#6fd3ff", 0.9);
          recheckGamePending(m);
        } else {
          m.comp = clamp(m.comp - 8, 5, 100);
          sayBanner(m, pick(NAMES.UMPIRE_BAD), "#ff8a5c", 0.9);
          sfx.boo();
        }
        pushHud(m);
      }, 1200);
      break;
    }
    case "outrageous":
      m.armedOutrageous = true;
      ticker(m, "OUTRAGEOUS SHOT ARMED 🤸 — next ball!");
      sfx.click();
      break;
    case "underarm": {
      m.underarmServe = true; m.tossed = true;
      ticker(m, "The cheekiest of serves...");
      setState(m.you, "serve");
      sfx.click();
      const aceChance = skillFx("underarm", lvl, "ace") + (1 - m.oppComp / 100) * 0.3;
      setTimeout(() => {
        if (m.over) return;
        m.oppComp = clamp(m.oppComp - skillFx("underarm", lvl, "tilt"), 5, 100);
        if (Math.random() < aceChance) {
          sfx.pock(0.4);
          setTimeout(() => {
            sayBanner(m, "UNDERARM ACE! 🥷", "#ffe24a", 1.3);
            FX.floatText(m.oppP.x, OPP_Y - 2, 0.5, "plop.", "#fff", 0.8);
            endPoint(m, "you", "ace");
          }, 600);
        } else {
          startRallyFromServe(m, true, 0.3);
          ticker(m, "They got it back — and they are FURIOUS.");
        }
      }, 700);
      break;
    }
    case "injury": {
      m.injuriesUsed++;
      setState(m.you, "injury");
      FX.speech(m.you.x, YOU_Y + 0.5, pick(NAMES.INJURY_LINES), 2.6);
      sfx.whistle();
      const heal = skillFx("injury", lvl, "heal");
      m.stam = clamp(m.stam + heal, 0, 100);
      m.comp = clamp(m.comp + heal * 0.6, 0, 100);
      m.oppComp = clamp(m.oppComp - 5, 5, 100);
      if (m.injuriesUsed > 1) {
        sfx.boo(); addHype(m, -12);
        ticker(m, "The crowd is NOT buying it any more...");
      } else ticker(m, "Medical timeout! Miraculous recovery incoming.");
      break;
    }
    case "pigeon": {
      FX.launchPigeon(true);
      sfx.pigeonCoo();
      m.oppNextError = 1.2 + skillFx("pigeon", lvl, "weaken") * 1.5;
      sayBanner(m, "RELEASE CLIVE! 🐦", "#fff", 1.1);
      setTimeout(() => { if (!m.over) FX.floatText(m.oppP.x, OPP_Y, 2.4, "AAGH! BIRD!", "#ff8a5c", 0.9); }, 900);
      break;
    }
    case "racketsmash": {
      const cost = skillFx("racketsmash", lvl, "cashCost");
      m.earnings -= cost;
      setState(m.you, "argue");
      sfx.smash(); FX.addShake(9);
      FX.burst(m.you.x, YOU_Y, 0.5, 20, ["#c9c9c9", "#7a4a1e", "#ffd34a"], 6);
      m.comp = 100;
      addHype(m, skillFx("racketsmash", lvl, "hype"));
      sayBanner(m, "RACKET OBLITERATED! 🎇", "#ffd34a", 1.2);
      ticker(m, `-$${cost} for a new racket. Worth it.`);
      break;
    }
    case "crowdwork": {
      setState(m.you, "celebrate");
      sfx.cheer(0.9);
      addHype(m, skillFx("crowdwork", lvl, "hype"));
      sayBanner(m, pick(NAMES.CROWD_LINES), "#ff9de2", 0.95);
      FX.confetti(25);
      break;
    }
    case "zone": {
      m.zoneShots = skillFx("zone", lvl, "shots");
      m.zoneWiden = skillFx("zone", lvl, "widen");
      sfx.zoneIn();
      sayBanner(m, "THE ZONE 🧠", "#b06cff", 1.2);
      break;
    }
  }
  pushHud(m);
  m.hooks.onSkillDock && m.hooks.onSkillDock(m);
  return true;
}

function recheckGamePending(m) {
  const a = m.ptsYou, b = m.ptsOpp;
  m.pendingGame = ((a >= 4 || b >= 4) && Math.abs(a - b) >= 2) ? (a > b ? "you" : "opp") : null;
}

/* ---------------- update ---------------- */
export function updateMatch(m, rawDt) {
  // Zone slows time while the ball approaches you
  m.timeScale = (m.zoneShots > 0 && m.ballTo === "you" && m.state === "rally") ? 0.55 : 1;
  const dt = Math.min(rawDt, 0.05) * m.timeScale;
  m.time += dt; m.stateT += dt;

  updatePlayer(m.you, dt); updatePlayer(m.oppP, dt);
  FX.updateFx(rawDt);

  if (m.over) return;

  // Soak-test bot: sprinkle random skill usage
  if (m.autoPilot && Math.random() < dt * 0.4) {
    const id = pick(m.save.loadout);
    if (id && canUseSkill(m, id)) useSkill(m, id);
  }

  // Meters drift
  if (m.state === "rally") {
    m.stam = clamp(m.stam + METERS.STAM_REGEN * dt * 0.3, 0, 100);
    m.hype = clamp(m.hype - dt * 0.8, 0, 100);
  }

  switch (m.state) {
    case "preServe": {
      // Players walk to positions
      movePlayerTo(m.you, m.you.tx, dt, playerSpeed(m));
      movePlayerTo(m.oppP, m.oppP.tx, dt, 5);
      // Opponent serves automatically after a beat
      if (m.server === "opp" && m.stateT > 1.6) {
        const q = aiServeQuality(m);
        startRallyFromServe(m, false, q);
      }
      // Auto-pilot serves for you
      if (m.server === "you" && m.autoPilot && m.stateT > 1.2 && !m.tossed) {
        serveNow(m, rand(0.5, 0.95));
      }
      break;
    }
    case "serveMeter": {
      m.serveMeter += m.serveDir * dt * 2.2;
      if (m.serveMeter > 1.35) { m.serveMeter = 1.35; m.serveDir = -1; }
      if (m.serveMeter < 0) { // let it lapse = weak serve
        serveNow(m, 0.2);
      }
      if (m.autoPilot && m.serveMeter > 0.9) serveNow(m, rand(0.7, 1));
      break;
    }
    case "serving": {
      if (m.stateT > 0.35) {
        const q = m.serveQuality;
        // Fault chance on wild meter timing
        if (q < 0.3 && Math.random() < 0.5) {
          m.ball.live = true; m.ball.lastHitBy = "you";
          startRallyFromServe(m, true, q * 0.6);
          // mark: likely lands out and triggers fault logic below via bounce position
        } else startRallyFromServe(m, true, q);
      }
      break;
    }
    case "rally": {
      stepBall(m.ball, dt, (ev, data) => onBallEvent(m, ev, data));
      // Move players
      updateRallyMovement(m, dt);
      aiUpdate(m, dt);
      // Player contact handling
      if (m.ballTo === "you" && m.contact) {
        const dtc = m.contact.t - m.time;
        if (m.autoPilot && dtc < 0.09 && dtc > 0 && !m.pendingQuality) {
          m.aim.x = rand(-3.4, 3.4); m.aim.y = rand(COURT.NET_Y + 2.5, OPP_Y - 0.5);
          m.pendingQuality = pick([1, 0.75, 0.75, 0.45]); m.pendingAim = { ...m.aim };
        }
        if (dtc <= 0 && m.pendingQuality !== null && m.pendingQuality !== undefined) {
          executePlayerSwing(m);
        } else if (dtc < -0.12 && m.pendingQuality == null) {
          // Assist: automatic weak lob back (keeps beginners rallying)
          if (Math.abs(m.ball.x - m.you.x) <= SWING.REACH_X + 0.5) {
            m.pendingQuality = 0.4; m.pendingAim = { x: rand(-2, 2), y: COURT.NET_Y + rand(2, 6) };
            executePlayerSwing(m);
          } else m.contact = null;   // out of reach — whiff, ball will double bounce
        }
      }
      // Double bounce / ball dead → resolve point
      resolveDeadBall(m);
      break;
    }
    case "pointOver": {
      movePlayerTo(m.you, 0, dt, 3);
      movePlayerTo(m.oppP, 0, dt, 3);
      const wait = m.canArgue && !m.argued ? 3.2 : 1.7;
      if (m.stateT > wait) {
        if (!settleGame(m)) beginPreServe(m);
      }
      break;
    }
  }
}

function playerSpeed(m) {
  return PLAYER.SPEED * (1 + m.gear.spd) * (m.stam < 25 ? 0.7 : 1);
}

function movePlayerTo(p, tx, dt, speed) {
  const d = tx - p.x;
  if (Math.abs(d) > 0.08) {
    p.x += clamp(d, -speed * dt, speed * dt);
    p.facing = d > 0 ? 1 : -1;
    if (p.state === "idle") setState(p, "run");
  } else if (p.state === "run") setState(p, "idle");
}

function updateRallyMovement(m, dt) {
  // You: chase predicted contact x; otherwise drift to centre
  let target = 0;
  if (m.ballTo === "you" && m.contact) target = clamp(m.contact.x, -COURT.W / 2 - 1.5, COURT.W / 2 + 1.5);
  movePlayerTo(m.you, target, dt, playerSpeed(m));
}

function onBallEvent(m, ev, data) {
  if (ev === "bounce") {
    sfx.bounce();
    FX.burst(data.x, data.y, 0.05, 4, "#cfe8ff", 1.5);
    const b = m.ball;
    if (b.bounces === 1) {
      // First bounce decides in/out
      const onYourSide = data.y < COURT.NET_Y;
      const hitter = b.lastHitBy;
      if (!inCourt(data.x, data.y)) {
        FX.floatText(data.x, clamp(data.y, 1, COURT.L - 1), 0.4, "OUT!", "#ff8a5c", 1);
        if (hitter === "you") {
          if (m.state === "rally" && m.stats.rally === 0 && m.server === "you" && m.serveNum === 1) {
            m.serveNum = 2; ticker(m, "FAULT! Second serve."); sfx.gasp();
            m.state = "preServe"; m.stateT = 0; m.ball.live = false; m.tossed = false; m.contact = null;
            return;
          }
          endPoint(m, "opp", "youError");
        } else {
          if (m.state === "rally" && m.stats.rally === 0 && m.server === "opp" && m.serveNum === 1) {
            m.serveNum = 2; ticker(m, "Fault! Second serve coming...");
            m.state = "preServe"; m.stateT = 0; m.ball.live = false; m.contact = null;
            return;
          }
          endPoint(m, "you", "oppError");
        }
        return;
      }
      // In: reset serve count once a legal rally ball lands
      m.serveNum = 1;
    }
  } else if (ev === "net") {
    sfx.netHit();
    FX.burst(m.ball.x, COURT.NET_Y, data.zAt, 6, "#ffffff", 2);
    const hitter = m.ball.lastHitBy;
    // Net cord karma: chance the ball flops over anyway
    if (hitter === "you" && skillLevel(m, "netcord") &&
        Math.random() < skillFx("netcord", skillLevel(m, "netcord"), "luck")) {
      m.ball.y = COURT.NET_Y + 0.3; m.ball.vy = 1.6; m.ball.vz = 2.2; m.ball.vx *= 0.3;
      sayBanner(m, "NET CORD KARMA 🕸️", "#7ee6a1", 0.9);
      m.ballTo = "opp"; scheduleContact(m);
      return;
    }
    if (hitter === "you" && m.state === "rally" && m.stats.rally === 0 && m.server === "you" && m.serveNum === 1) {
      m.serveNum = 2; ticker(m, "FAULT! Into the net. Second serve.");
      m.state = "preServe"; m.stateT = 0; m.ball.live = false; m.tossed = false; m.contact = null;
      return;
    }
    endPoint(m, hitter === "you" ? "opp" : "you", hitter === "you" ? "netYou" : "oppError");
  } else if (ev === "netcord") {
    FX.floatText(m.ball.x, COURT.NET_Y, 1.3, "net cord!", "#fff", 0.7);
    scheduleContact(m);
  }
}

function resolveDeadBall(m) {
  const b = m.ball;
  if (!b.live || m.state !== "rally") return;
  if (b.bounces >= 2) {
    // Double bounce on someone's side
    const winner = b.y < COURT.NET_Y ? "opp" : "you";
    const wasWinner = m.stats.rally > 0 || true;
    endPoint(m, winner, winner === "you" ? "winner" : (m.ballTo === "you" ? "winner2" : "youError"));
    if (winner === "opp" && m.ballTo === "you") {
      // You failed to reach it — opponent winner
    }
  }
  // Safety: ball rolled far away
  if (b.y < -6 || b.y > COURT.L + 6 || Math.abs(b.x) > 14) {
    endPoint(m, b.y < COURT.NET_Y ? "opp" : "you", "rollaway");
  }
}

function aiServeQuality(m) {
  return clamp(0.45 + m.opp.stars * 0.09 + rand(-0.15, 0.15), 0.2, 0.98);
}

// Opponent AI calls this to hit (from ai.js)
export function opponentHit(m, quality, aimX, aimY, opts) { hitShot(m, "opp", quality, aimX, aimY, opts); }
export { endPoint, ticker, sayBanner, addHype, earn, YOU_Y, OPP_Y };

/* ---------------- draw ---------------- */
export function drawMatch(m, ctx) {
  ctx.save();
  if (FX.shake > 0) ctx.translate(rand(-FX.shake, FX.shake) * 0.5, rand(-FX.shake, FX.shake) * 0.5);
  drawScene(ctx, m.time, m.hype, m.hype > 80);
  drawPlayer(ctx, m.oppP);
  drawNet(ctx);
  // Aim reticle
  if (m.state === "rally" && m.ballTo === "you") drawReticle(m, ctx);
  drawBall(ctx, m.ball);
  drawPlayer(ctx, m.you);
  // Swing timing ring
  if (m.state === "rally" && m.ballTo === "you" && m.contact) drawTimingRing(m, ctx);
  if (m.state === "serveMeter") drawServeMeter(m, ctx);
  FX.drawFx(ctx);
  FX.drawZoneVignette(ctx, m.zoneShots > 0 ? 1 : 0);
  ctx.restore();
}

function drawReticle(m, ctx) {
  const p = project(m.aim.x, m.aim.y, 0);
  const r = Math.max(10, p.s * 0.5);
  const pulse = 1 + Math.sin(m.time * 8) * 0.08;
  ctx.strokeStyle = m.aiming ? "#ffe24a" : "rgba(255,226,74,.5)";
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, r * pulse, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
}

function drawTimingRing(m, ctx) {
  const dtc = m.contact.t - m.time;
  if (dtc > SWING.WINDOW || dtc < -0.2) return;
  const p = project(m.ball.x, m.ball.y, m.ball.z);
  const widen = (m.zoneShots > 0 ? m.zoneWiden : 1) / m.youWindowShrink;
  const k = clamp(dtc / SWING.WINDOW, 0, 1);
  const rBall = Math.max(4, p.s * 0.16);
  const r = rBall + k * Math.max(30, view.w * 0.09);
  const inPerfect = Math.abs(dtc) <= SWING.PERFECT * widen;
  const inGood = Math.abs(dtc) <= SWING.GOOD * widen;
  ctx.lineWidth = inPerfect ? 4 : 2.5;
  ctx.strokeStyle = inPerfect ? "#7ee6a1" : inGood ? "#ffe24a" : "rgba(255,255,255,.7)";
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
  // Sweet-spot ring marker
  ctx.strokeStyle = "rgba(126,230,161,.4)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, rBall + SWING.PERFECT * widen / SWING.WINDOW * Math.max(30, view.w * 0.09), 0, 7); ctx.stroke();
}

function drawServeMeter(m, ctx) {
  const w = Math.min(260, view.w * 0.6), h = 18;
  const x = (view.w - w) / 2, y = view.h * 0.68;
  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.beginPath(); ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 8); ctx.fill();
  // Sweet zone near the top (value 1.0 of 1.35)
  const sweetX = x + (0.88 / 1.35) * w, sweetW = (0.24 / 1.35) * w;
  ctx.fillStyle = "rgba(126,230,161,.5)"; ctx.fillRect(sweetX, y, sweetW, h);
  ctx.fillStyle = "#ffd34a";
  ctx.fillRect(x, y, clamp(m.serveMeter / 1.35, 0, 1) * w, h);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("TAP TO SERVE!", view.w / 2, y - 12);
}
