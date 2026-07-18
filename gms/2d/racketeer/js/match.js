// The match engine: state machine + rules + skills + events. One instance per match.
// `tier` is a config object: { id, name, games, oppSkills, crowd, prize, boss?, eventChance?, modifier? }
import { COURT, SWING, SHOT_T, PTS, BALL_R, PLAYER, METERS } from "./const.js";
import { clamp, lerp, rand, pick, pickBag } from "./util.js";
import { makeBall, stepBall, predictAtDepth, aimVelocity, netClearance, drawBall } from "./ball.js";
import { makePlayer, setState, updatePlayer, drawPlayer } from "./player.js";
import { drawScene, drawNet, setCrowd, project, view, pokeUmpire } from "./court.js";
import * as FX from "./fx.js";
import { sfx, setCrowdLevel } from "./audio.js";
import { skillFx, skillCd, SKILLS } from "./skills.js";
import * as NAMES from "./names.js";
import * as EV from "./events.js";
import { aiUpdate, aiBetweenPoints } from "./ai.js";

const YOU_Y = 1.1, OPP_Y = COURT.L - 1.1;
const SERVE_WINDOW = 0.4;      // s of grace around ideal serve contact

export function makeMatch(save, opp, tier, gear, hooks) {
  const m = {
    save, opp, tier, gear, hooks,
    time: 0, timeScale: 1, state: "preServe", stateT: 0,
    you: makePlayer({ col: "#ffd23e", col2: "#1d3557", skin: "#f2c79c" }),
    oppP: makePlayer({ far: true, boss: opp.boss, col: opp.boss ? "#3d4450" : pick(["#e63946", "#9b5de5", "#00b4d8", "#f77f00", "#43aa8b"]), col2: "#333", skin: pick(["#f2c79c", "#d9a066", "#a56a3a", "#ffdbac"]) }),
    ball: makeBall(),
    server: "you", serveNum: 1, serveSide: 1,
    ptsYou: 0, ptsOpp: 0, gamesYou: 0, gamesOpp: 0, targetGames: tier.games,
    stam: 100, comp: 100, oppStam: 100, oppComp: 100,
    hype: 10,
    earnings: 0, over: false, won: false,
    // Swing state
    contact: null,            // {t, x, z} predicted contact for whoever ball approaches
    ballTo: null,             // "you" | "opp"
    pendingQuality: null, pendingAim: null, pendingCurve: 0,
    timingWobble: 0,          // hidden per-ball timing offset when rattled
    // Gesture
    gest: null,               // {pts:[{x,y,t}]} while finger is down
    trail: [],                // fading on-screen swipe trail
    // Serve
    tossed: false, serveContactT: 0,
    // Skill state
    armedPower: false, armedOutrageous: false, armedGrunt: false, underarmServe: false,
    cooldowns: {}, usesLeft: {},
    zoneShots: 0, zoneWiden: 1,
    oppNextError: 0, youNextError: 0, youWindowShrink: 1,
    lastPointWonBy: null, canArgue: false, argued: false,
    oppFx: { zoneShots: 0, injuriesUsed: 0 }, oppCd: {},
    // Events
    activeEvent: null, eventWind: 0, modifier: tier.modifier || null,
    autoPilot: false, netcordPending: null,
    stats: { winners: 0, aces: 0, outrageous: 0, longestRally: 0, rally: 0 },
  };
  for (const id of Object.keys(SKILLS)) if (SKILLS[id].uses) m.usesLeft[id] = SKILLS[id].uses;
  setCrowd(tier.crowd);
  m.you.x = 0; m.you.y = YOU_Y; m.oppP.x = 0; m.oppP.y = OPP_Y;
  if (opp.boss) sayBanner(m, pick(NAMES.BOSS_LINES), "#ff5c5c", 1.0);
  if (m.modifier) {
    const ev = EV.EVENTS.find(e => e.id === m.modifier);
    if (ev) EV.startEvent(m, ev, Infinity);
  }
  beginPreServe(m, true);
  if (tier.mode === "story" && tier.flavour) {
    // The story beat also opens the match, so it's never missed
    sayBanner(m, `LEVEL ${tier.level}`, "#ffe24a", 1.2);
    ticker(m, tier.flavour, 6);
  }
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
  m.ball.live = false; m.ball.trail.length = 0; m.ball.curve = 0; m.ball.wind = 0;
  m.contact = null; m.ballTo = null; m.pendingQuality = null; m.pendingCurve = 0;
  m.armedPower = false; m.armedOutrageous = false; m.armedGrunt = false; m.canArgue = false;
  m.tossed = false; m.underarmServe = false; m.gest = null;
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
  if (!first) {
    aiBetweenPoints(m);
    EV.rollEvent(m, m.tier.eventChance ?? (0.04 + (m.tier.id || 0) * 0.03));
  }
  m.hooks.onSkillDock && m.hooks.onSkillDock(m);
  pushHud(m);
  if (m.server === "you") ticker(m, m.serveNum === 2 ? "Second serve — tap to toss, then SWIPE!" : "Your serve — tap to toss, then SWIPE to hit!", 3);
  else ticker(m, `${m.opp.name.split(" ")[0]} to serve...`, 2);
}

function startRallyFromServe(m, byYou, quality, aimTx) {
  const b = m.ball;
  b.live = true; b.bounces = 0; b.curve = 0; b.lastHitBy = byYou ? "you" : "opp";
  m.stats.rally = 0;
  const lbLvl = skillLevel(m, "luckyballs");
  const serveBonus = byYou && lbLvl ? skillFx("luckyballs", lbLvl, "serve") : 0;
  const fromY = byYou ? YOU_Y : OPP_Y;
  const dir = byYou ? 1 : -1;
  b.x = (byYou ? 1 : -1) * m.serveSide * 2.0; b.y = fromY; b.z = 2.5;
  const depth = COURT.NET_Y + dir * rand(2.2, 5.0);
  const err = (1 - quality) * 2.6;
  let tx = aimTx !== undefined ? aimTx : -m.serveSide * dir * rand(0.6, 3.2);
  tx = clamp(tx + rand(-err, err), -COURT.W / 2 - err, COURT.W / 2 + err);
  const T = lerp(0.95, 0.62, quality) * (1 - serveBonus) * EV.eventShotSlow(m);
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
  const you = m.ballTo === "you";
  const targetY = you ? YOU_Y : OPP_Y;
  const p = predictAtDepth(m.ball, targetY);
  if (p) m.contact = {
    t: m.time + p.t,
    x: clamp(p.x, -COURT.W / 2 - 3, COURT.W / 2 + 3),
    y: clamp(p.y, you ? 0.6 : COURT.NET_Y + 1.3, you ? COURT.NET_Y - 1.3 : COURT.L - 0.6),
    z: p.z, total: p.t,
  };
  else m.contact = null;
  if (!you) m.aiRead = null;                 // opponent must re-read the new ball
  // Rattled players mistime: the "right moment" secretly drifts when composure is low
  if (m.ballTo === "you") m.timingWobble = (1 - m.comp / 100) * rand(-0.15, 0.15);
}

// quality: 0..1 (1 = perfect). Executes a groundstroke for `who`.
function hitShot(m, who, quality, aimX, aimY, opts = {}) {
  const you = who === "you";
  const b = m.ball;
  const P = you ? m.you : m.oppP;
  setState(P, opts.flip ? "flip" : "swing");
  b.lastHitBy = who; b.bounces = 0;
  m.stats.rally++;

  const comp = you ? m.comp : m.oppComp;
  let err = (1 - quality) * 3.2 + (1 - comp / 100) * 1.4;
  if (you && m.youNextError) { err += m.youNextError; m.youNextError = 0; }
  if (!you && m.oppNextError) { err += m.oppNextError; m.oppNextError = 0; }
  const lbLvl = you ? skillLevel(m, "luckyballs") : 0;
  if (lbLvl) err *= (1 - skillFx("luckyballs", lbLvl, "mercy"));

  let powBonus = you ? m.gear.pow : (m.opp.stars * 0.05);
  let T = lerp(SHOT_T.shank, SHOT_T.perfect, quality);
  if (you && m.armedGrunt) {
    m.armedGrunt = false;
    const lvl = skillLevel(m, "grunt");
    powBonus += skillFx("grunt", lvl, "pow");
    const g = pick(NAMES.GRUNTS);
    FX.floatText(m.you.x, YOU_Y + 1, 2.2, g, "#ffd34a", 1.2);
    sfx.grunt(lvl); FX.addShake(3 + lvl);
    if (Math.random() < skillFx("grunt", lvl, "startle")) {
      m.oppNextError = 1.6;
      FX.floatText(m.oppP.x, OPP_Y, 2.4, "😨", "#fff", 1.2);
    }
  }
  if (opts.power) powBonus += opts.power;
  if (opts.swipePow) powBonus += opts.swipePow;
  T *= (1 - clamp(powBonus, 0, 0.6) * 0.45);
  T *= EV.eventShotSlow(m);
  const lowStam = (you ? m.stam : m.oppStam) < 25;
  if (lowStam) T *= 1.25;

  const dir = you ? 1 : -1;
  const curve = opts.curve || 0;
  // Compensate aim so a curved shot still lands near the intended spot (banana flight)
  let tx = aimX - 0.5 * curve * T * T + rand(-err, err) * 0.9;
  let ty = aimY + rand(-err, err) * 1.1 * dir;
  const netFlub = quality < 0.25 && Math.random() < 0.5;
  const v = aimVelocity(b.x, b.y, Math.max(b.z, 0.3), tx, ty, T);
  if (!netFlub) {
    let tries = 0;
    while (netClearance(b.x, b.y, Math.max(b.z, 0.3), v) < 0.06 && tries++ < 5) {
      T *= 1.13;
      const v2 = aimVelocity(b.x, b.y, Math.max(b.z, 0.3), tx, ty, T);
      v.vx = v2.vx; v.vy = v2.vy; v.vz = v2.vz;
    }
  }
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.curve = curve; b.live = true;
  sfx.pock(0.8 + quality + powBonus);
  if (!you && quality < 0.25) FX.floatText(b.x, b.y, b.z + 0.4, "SHANK!", "#ff8a5c", 0.7);
  if (Math.abs(curve) > 4) FX.floatText(b.x, b.y, b.z + 0.7, "🍌 CURVE!", "#ffd34a", 0.7);
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
  m.contact = null; m.gest = null;
  m.stats.longestRally = Math.max(m.stats.longestRally, m.stats.rally);
  EV.tickEvent(m);
  const youWon = winner === "you";
  m.canArgue = !youWon && skillLevel(m, "argue") > 0 && (m.usesLeft.argue || 0) > 0 && why !== "netYou";

  if (youWon) {
    m.ptsYou++;
    addHype(m, why === "winner" || why === "ace" ? METERS.HYPE_WINNER : 3);
    m.comp = clamp(m.comp + 2, 0, 100);
    const base = 4 + (m.tier.id || 0) * 6;
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
  const a = m.ptsYou, b = m.ptsOpp;
  if ((a >= 4 || b >= 4) && Math.abs(a - b) >= 2) m.pendingGame = a > b ? "you" : "opp";
  else m.pendingGame = null;
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
  if (youGame) { sfx.fanfare(); earn(m, 15 + (m.tier.id || 0) * 10, 0, YOU_Y + 2); }
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

/* ---------------- gesture input (from input.js) ---------------- */
export function inputPress(m, nx, ny) {
  if (m.over) return;
  if (m.state === "preServe" && m.server === "you" && !m.tossed) {
    if (m.underarmServe) return;
    // Tap = toss; the swipe comes next
    m.tossed = true;
    m.state = "serveWait"; m.stateT = 0;
    m.serveContactT = m.time + 0.55;
    sfx.serveToss();
    return;
  }
  if (m.state === "rally" || m.state === "serveWait") {
    m.gest = { pts: [{ x: nx, y: ny, t: m.time }] };
  }
}

export function inputMove(m, nx, ny) {
  if (!m.gest) return;
  const pts = m.gest.pts;
  const lp = pts[pts.length - 1];
  if (Math.hypot(nx - lp.x, ny - lp.y) > 0.004) pts.push({ x: nx, y: ny, t: m.time });
  m.trail.push({ x: nx * view.w, y: ny * view.h, a: 1 });
  if (m.trail.length > 24) m.trail.shift();
}

export function inputRelease(m) {
  const g = m.gest;
  m.gest = null;
  if (!g || m.over) return;
  const pts = g.pts;
  const A = pts[0], B = pts[pts.length - 1];
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy);

  if (m.state === "serveWait") {
    // Any decisive gesture hits the serve; direction aims it
    const dt = m.serveContactT - m.time;
    if (dt > SERVE_WINDOW) return;                    // way early — let them try again
    const q = clamp(1 - Math.abs(dt) / SERVE_WINDOW, 0.12, 1);
    const tx = clamp(dx * 14, -1, 1) * (COURT.W / 2 - 0.3);
    serveNow(m, q, tx);
    return;
  }

  if (m.state !== "rally" || m.ballTo !== "you" || !m.contact) return;
  const dtc = m.contact.t - m.time + m.timingWobble;
  if (dtc > SWING.WINDOW) return;                     // far too early: ignore

  let aim, curve = 0, swipePow = 0;
  if (len < 0.045) {
    // Tap = safe centre return
    aim = { x: rand(-1.2, 1.2), y: COURT.NET_Y + rand(3.5, 7) };
  } else {
    // Swipe: direction = aim, length = depth, speed = power, bend = curve
    const lateral = clamp((dx / Math.max(0.06, Math.abs(dy))) * 1.15, -1, 1);
    const aimX = lateral * (COURT.W / 2 + 0.4);
    const depth = clamp((len - 0.06) / 0.34, 0, 1);   // long swipe = deep
    const aimY = lerp(COURT.NET_Y + 2.0, OPP_Y - 0.35, depth);
    aim = { x: aimX, y: aimY };
    const dur = Math.max(0.03, B.t - A.t);
    swipePow = clamp(len / dur / 6, 0, 0.18);         // fast flick = extra zip
    curve = gestureCurve(pts, dx, dy) * -9;           // signed m/s² sideways (bow right = ball curves right)
  }
  commitSwing(m, dtc, aim, curve, swipePow);
}

// Signed curvature of the swipe path: + = bows right of the chord.
function gestureCurve(pts, chx, chy) {
  if (pts.length < 5) return 0;
  const A = pts[0];
  const chLen = Math.hypot(chx, chy);
  if (chLen < 0.05) return 0;
  let sum = 0, n = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const ox = pts[i].x - A.x, oy = pts[i].y - A.y;
    sum += (chx * oy - chy * ox) / chLen;             // perpendicular offset, signed
    n++;
  }
  const avg = sum / Math.max(1, n);
  return clamp(avg / 0.05, -1, 1);                    // ~5% screen bow = full curve
}

function qualityFromDt(m, dt) {
  const widen = (m.zoneShots > 0 ? m.zoneWiden : 1) / m.youWindowShrink;
  const a = Math.abs(dt);
  if (a <= SWING.PERFECT * widen) return 1;
  if (a <= SWING.GOOD * widen) return 0.75;
  if (a <= SWING.OK * widen) return 0.45;
  return 0.15;
}

function commitSwing(m, dt, aim, curve, swipePow) {
  let q = qualityFromDt(m, dt);
  // Instant timing feedback so players can learn the rhythm
  const fx = q === 1 ? ["PERFECT!", "#7ee6a1", 0.9]
    : q >= 0.75 ? [dt > 0 ? "EARLY!" : "LATE!", "#ffe24a", 0.8]
    : q >= 0.45 ? [dt > 0 ? "EARLY!" : "LATE!", "#ffab5c", 0.8]
    : [dt > 0 ? "WAY EARLY!" : "WAY LATE!", "#ff6b6b", 0.85];
  FX.floatText(m.you.x, m.you.y + 1.4, 1.6, fx[0], fx[1], fx[2]);
  m.youWindowShrink = 1;
  if (m.zoneShots > 0) m.zoneShots--;
  m.pendingQuality = q;
  m.pendingAim = aim;
  m.pendingCurve = curve;
  m.pendingSwipePow = swipePow;
  if (dt <= 0.02) executePlayerSwing(m);
}

function executePlayerSwing(m) {
  const q = m.pendingQuality, aim = m.pendingAim || { x: 0, y: COURT.NET_Y + 5 };
  const curve = m.pendingCurve || 0, swipePow = m.pendingSwipePow || 0;
  m.pendingQuality = null; m.pendingAim = null; m.pendingCurve = 0; m.pendingSwipePow = 0;
  if (Math.hypot(m.ball.x - m.you.x, m.ball.y - m.you.y) > SWING.REACH_X + 0.6) {
    setState(m.you, "swing"); sfx.swishMiss();
    return;
  }
  const opts = { curve, swipePow };
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
      const name = pick(NAMES.OUTRAGEOUS_NAMES);
      sayBanner(m, name + "!", "#ff5ce1", 1.4);
      sfx.cheer(1.4); FX.addShake(10);
      addHype(m, skillFx("outrageous", lvl, "hype"));
      earn(m, skillFx("outrageous", lvl, "cash"), m.you.x, YOU_Y);
      m.stats.outrageous++;
      hitShot(m, "you", 1, pick([-1, 1]) * (COURT.W / 2 - 0.35), OPP_Y - rand(0.3, 1.2), { ...opts, power: (opts.power || 0) + 0.25, flip: true });
      return;
    }
    setState(m.you, "faceplant");
    sfx.gasp(); sfx.boo(); FX.addShake(6);
    sayBanner(m, "FACEPLANT!", "#ff8a5c", 1.2);
    addHype(m, 6);
    return;
  }
  hitShot(m, "you", q, aim.x, aim.y, opts);
  m.hooks.onSkillDock && m.hooks.onSkillDock(m);
}

function serveNow(m, q, tx) {
  m.serveQuality = q; m.serveTx = tx;
  m.state = "serving"; m.stateT = 0;
  setState(m.you, "serve");
}

/* ---------------- skills (player) ---------------- */
export function canUseSkill(m, id) {
  const lvl = skillLevel(m, id);
  if (!lvl || m.over) return false;
  const def = SKILLS[id];
  if (def.type === "passive") return false;
  if (m.cooldowns[id] && m.time < m.cooldowns[id]) return false;
  if (def.uses && (m.usesLeft[id] || 0) <= 0) return false;
  if (def.betweenPoints && m.state !== "preServe") return false;
  if (def.serveOnly && !(m.state === "preServe" && m.server === "you" && !m.tossed)) return false;
  if (def.afterLoss && !(m.state === "pointOver" && m.canArgue && !m.argued)) return false;
  if (id === "power" || id === "outrageous") {
    if (!(m.state === "rally" || m.state === "preServe" || m.state === "serveWait")) return false;
    if (m.stam < 20) return false;
  }
  if (id === "grunt" && !(m.state === "rally" || m.state === "preServe" || m.state === "serveWait")) return false;
  if (id === "pigeon" && !(m.state === "rally" || m.state === "preServe")) return false;
  if (id === "racketsmash" && m.save.money + m.earnings < skillFx("racketsmash", lvl, "cashCost")) return false;
  return true;
}

export function useSkill(m, id) {
  if (!canUseSkill(m, id)) return false;
  const lvl = skillLevel(m, id);
  const def = SKILLS[id];
  const cd = skillCd(id, lvl);
  if (cd) m.cooldowns[id] = m.time + cd;
  if (def.uses) m.usesLeft[id] = (m.usesLeft[id] || 0) - 1;
  switch (id) {
    case "power":
      m.armedPower = true;
      ticker(m, "POWER HIT ARMED 💥");
      sfx.click();
      break;
    case "grunt":
      m.armedGrunt = true;
      ticker(m, "GRUNT LOADED 📢 — next shot");
      sfx.click();
      break;
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
      setState(m.you, "injury");
      FX.speech(m.you.x, YOU_Y + 0.5, pick(NAMES.INJURY_LINES), 2.6);
      sfx.whistle();
      const heal = skillFx("injury", lvl, "heal");
      m.stam = clamp(m.stam + heal, 0, 100);
      m.comp = clamp(m.comp + heal * 0.6, 0, 100);
      m.oppComp = clamp(m.oppComp - 5, 5, 100);
      if ((m.usesLeft.injury || 0) < 1) {
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
  m.timeScale = (m.zoneShots > 0 && m.ballTo === "you" && m.state === "rally") ? 0.55 : 1;
  const dt = Math.min(rawDt, 0.05) * m.timeScale;
  m.time += dt; m.stateT += dt;

  updatePlayer(m.you, dt); updatePlayer(m.oppP, dt);
  FX.updateFx(rawDt);
  for (const t of m.trail) t.a *= (1 - rawDt * 5);

  if (m.over) return;

  // Soak-test bot: sprinkle random skill usage
  if (m.autoPilot && Math.random() < dt * 0.4) {
    const id = pick(m.save.loadout);
    if (id && canUseSkill(m, id)) useSkill(m, id);
  }

  if (m.state === "rally") {
    m.stam = clamp(m.stam + METERS.STAM_REGEN * dt * 0.3, 0, 100);
    m.hype = clamp(m.hype - dt * 0.8, 0, 100);
    EV.eventFrame(m, dt);
  }

  switch (m.state) {
    case "preServe": {
      movePlayerTo(m.you, m.you.tx, dt, playerSpeed(m), YOU_Y);
      movePlayerTo(m.oppP, m.oppP.tx, dt, 5, OPP_Y);
      if (m.server === "opp" && m.stateT > 1.6) {
        const q = aiServeQuality(m);
        startRallyFromServe(m, false, q);
      }
      if (m.server === "you" && m.autoPilot && m.stateT > 1.2 && !m.tossed) {
        m.tossed = true; m.state = "serveWait"; m.stateT = 0;
        m.serveContactT = m.time + 0.55;
      }
      break;
    }
    case "serveWait": {
      // Toss animation: ball rises from hand to apex at serveContactT
      const k = clamp(1 - (m.serveContactT - m.time) / 0.55, 0, 1.6);
      m.ball.x = m.serveSide * 2.0; m.ball.y = YOU_Y - 0.1;
      m.ball.z = 1.0 + Math.sin(Math.min(k, 1.3) * Math.PI * 0.62) * 1.9;
      if (m.autoPilot && m.serveContactT - m.time < 0.06 && m.serveContactT - m.time > 0) {
        serveNow(m, rand(0.6, 1), rand(-2.5, 2.5));
      }
      if (m.time > m.serveContactT + SERVE_WINDOW) {
        // Fluffed the toss — weak auto serve keeps things moving
        ticker(m, "Awkward toss... a gentle pat over.");
        serveNow(m, 0.22, rand(-1.5, 1.5));
      }
      break;
    }
    case "serving": {
      if (m.stateT > 0.3) startRallyFromServe(m, true, m.serveQuality, m.serveTx);
      break;
    }
    case "rally": {
      stepBall(m.ball, dt, (ev, data) => onBallEvent(m, ev, data));
      updateRallyMovement(m, dt);
      aiUpdate(m, dt);
      if (m.ballTo === "you" && m.contact) {
        const dtc = m.contact.t - m.time;
        if (m.autoPilot && dtc < 0.09 && dtc > 0 && m.pendingQuality == null) {
          m.pendingQuality = pick([1, 0.75, 0.75, 0.45]);
          m.pendingAim = { x: rand(-3.4, 3.4), y: rand(COURT.NET_Y + 2.5, OPP_Y - 0.5) };
          m.pendingCurve = pick([0, 0, rand(-8, 8)]);
        }
        if (dtc <= 0 && m.pendingQuality != null) {
          executePlayerSwing(m);
        } else if (dtc < -0.12 && m.pendingQuality == null) {
          if (Math.hypot(m.ball.x - m.you.x, m.ball.y - m.you.y) <= SWING.REACH_X + 0.7) {
            // Assist: automatic weak lob back keeps beginners rallying
            m.pendingQuality = 0.4; m.pendingAim = { x: rand(-2, 2), y: COURT.NET_Y + rand(2, 6) };
            executePlayerSwing(m);
          } else m.contact = null;
        }
      }
      resolveDeadBall(m);
      break;
    }
    case "pointOver": {
      movePlayerTo(m.you, 0, dt, 3, YOU_Y);
      movePlayerTo(m.oppP, 0, dt, 3, OPP_Y);
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

function movePlayerTo(p, tx, dt, speed, ty) {
  const d = tx - p.x;
  const dy = ty === undefined ? 0 : ty - p.y;
  const dist = Math.hypot(d, dy);
  if (dist > 0.08) {
    const step = Math.min(dist, speed * dt) / dist;
    p.x += d * step;
    if (ty !== undefined) p.y += dy * step;
    p.facing = d > 0 ? 1 : -1;
    if (p.state === "idle") setState(p, "run");
  } else if (p.state === "run") setState(p, "idle");
}

function updateRallyMovement(m, dt) {
  let tx = 0, ty = YOU_Y;
  if (m.ballTo === "you" && m.contact) {
    tx = clamp(m.contact.x, -COURT.W / 2 - 1.5, COURT.W / 2 + 1.5);
    ty = m.contact.y ?? YOU_Y;
  }
  movePlayerTo(m.you, tx, dt, playerSpeed(m), ty);
}

function onBallEvent(m, ev, data) {
  if (ev === "bounce") {
    sfx.bounce();
    FX.burst(data.x, data.y, 0.05, 4, "#cfe8ff", 1.5);
    EV.eventBounce(m);
    const b = m.ball;
    if (b.bounces === 1) {
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
      m.serveNum = 1;
    }
  } else if (ev === "net") {
    sfx.netHit();
    FX.burst(m.ball.x, COURT.NET_Y, data.zAt, 6, "#ffffff", 2);
    const hitter = m.ball.lastHitBy;
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
    const winner = b.y < COURT.NET_Y ? "opp" : "you";
    endPoint(m, winner, winner === "you" ? "winner" : "youError");
  }
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
  drawBall(ctx, m.ball);
  drawPlayer(ctx, m.you);
  if ((m.state === "rally" && m.ballTo === "you" && m.contact) || m.state === "serveWait") drawTimingRing(m, ctx);
  drawSwipeTrail(m, ctx);
  FX.drawFx(ctx);
  FX.drawZoneVignette(ctx, m.zoneShots > 0 ? 1 : 0);
  EV.eventOverlay(m, ctx);
  ctx.restore();
}

function drawSwipeTrail(m, ctx) {
  if (m.trail.length < 2) return;
  ctx.lineCap = "round";
  for (let i = 1; i < m.trail.length; i++) {
    const a = m.trail[i - 1], b = m.trail[i];
    if (b.a < 0.03) continue;
    ctx.strokeStyle = `rgba(255,226,74,${b.a * 0.85})`;
    ctx.lineWidth = 3 + b.a * 6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

function drawTimingRing(m, ctx) {
  const isServe = m.state === "serveWait";
  const contactT = isServe ? m.serveContactT : m.contact.t;
  const dtc = contactT - m.time + (isServe ? 0 : m.timingWobble);
  const windowLen = isServe ? SERVE_WINDOW * 2 : SWING.WINDOW;
  if (dtc > windowLen || dtc < -0.25) return;
  const p = project(m.ball.x, m.ball.y, m.ball.z);
  const widen = isServe ? 1 : (m.zoneShots > 0 ? m.zoneWiden : 1) / m.youWindowShrink;
  const k = clamp(dtc / windowLen, 0, 1);
  const rBall = Math.max(4, p.s * 0.16);
  const r = rBall + k * Math.max(30, view.w * 0.09);
  const perfectBand = (isServe ? 0.1 : SWING.PERFECT) * widen;
  const goodBand = (isServe ? 0.22 : SWING.GOOD) * widen;
  const inPerfect = Math.abs(dtc) <= perfectBand;
  const inGood = Math.abs(dtc) <= goodBand;
  ctx.lineWidth = inPerfect ? 4 : 2.5;
  ctx.strokeStyle = inPerfect ? "#7ee6a1" : inGood ? "#ffe24a" : "rgba(255,255,255,.7)";
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
  ctx.strokeStyle = "rgba(126,230,161,.4)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, rBall + perfectBand / windowLen * Math.max(30, view.w * 0.09), 0, 7); ctx.stroke();
  if (isServe) {
    ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.max(12, view.w * 0.032)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("SWIPE!", p.x, p.y - r - 14);
  }
}
