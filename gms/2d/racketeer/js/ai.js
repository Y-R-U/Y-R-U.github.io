// Opponent brain: chase the ball, time shots by star rating, and fight dirty at higher tiers.
import { COURT, SWING } from "./const.js";
import { clamp, lerp, rand, pick, pickBag } from "./util.js";
import * as NAMES from "./names.js";
import * as FX from "./fx.js";
import { sfx } from "./audio.js";
import { setState } from "./player.js";
import { pokeUmpire } from "./court.js";

// Injected accessors (match.js exports what we need; imported lazily to avoid cycle pain)
import { opponentHit, endPoint, ticker, sayBanner, YOU_Y, OPP_Y } from "./match.js";

export function aiPointStart(m) {}

// Cooldown gate for opponent skills: passes at most once per `cd` seconds.
function cdOk(m, id, cd) {
  if ((m.oppCd[id] || 0) > m.time) return false;
  m.oppCd[id] = m.time + cd;
  return true;
}

export function aiUpdate(m, dt) {
  const p = m.oppP;
  const stars = m.opp.stars;
  const speed = (3.6 + stars * 0.9) * (m.oppStam < 25 ? 0.7 : 1);

  // Read the incoming ball — imperfectly. Weak players misjudge where it's
  // going (curve fools them badly) and only partially correct on the way.
  if (m.ballTo === "opp" && m.contact && !m.aiRead) {
    const skill = stars / 5;                              // 0..1
    const sharp = m.opp.boss ? 0.92 : skill;
    let err0 = rand(-1, 1) * 2.0 * (1 - sharp);           // plain misjudgement
    err0 -= (m.ball.curve || 0) * 0.13 * (1.25 - sharp);  // they read it straight — curve deceives
    m.aiRead = { err0, residual: (1 - sharp) * 0.55 };
  }

  // Movement (2D: chases short balls up the court)
  let tx = 0, ty = OPP_Y;
  if (m.ballTo === "opp" && m.contact) {
    const c = m.contact;
    let off = 0;
    if (m.aiRead) {
      const u = clamp((c.t - m.time) / Math.max(0.2, c.total || 1), 0, 1);
      off = m.aiRead.err0 * lerp(m.aiRead.residual, 1, u);  // corrects toward truth, never fully if weak
    }
    tx = clamp(c.x + off, -COURT.W / 2 - 1.5, COURT.W / 2 + 1.5);
    ty = c.y ?? OPP_Y;
  }
  const d = tx - p.x, dy2 = ty - p.y;
  const dist = Math.hypot(d, dy2);
  if (dist > 0.1) {
    const step = Math.min(dist, speed * dt) / dist;
    p.x += d * step; p.y += dy2 * step;
    p.facing = d > 0 ? 1 : -1;
    if (p.state === "idle") setState(p, "run");
  } else if (p.state === "run") setState(p, "idle");

  // Contact
  if (m.ballTo === "opp" && m.contact && m.time >= m.contact.t) {
    m.contact = null; m.aiRead = null;
    const gap = Math.hypot(m.ball.x - p.x, m.ball.y - p.y);
    if (gap > SWING.REACH_X + 0.55 + stars * 0.12) {
      // Can't reach — whiff, ball double bounces
      setState(p, "swing"); sfx.swishMiss();
      FX.floatText(p.x, p.y, 1.5, "!!", "#ff8a5c", 0.8);
      m.stats.oppMisses = (m.stats.oppMisses || 0) + 1;
      return;
    }
    // Even in reach, hard balls get missed: fast/curved/deep-in-a-long-rally
    // shots crack weak players; the elite (and the boss) barely blink.
    const b = m.ball;
    const pace = Math.hypot(b.vx, b.vy);
    let miss = (pace - 9) * 0.030                          // shot speed (power/perfect = fast)
      + Math.abs(b.curve || 0) * 0.022                     // curve is hard to clean-hit
      + m.stats.rally * 0.010 * (1.3 - stars * 0.2)        // rally fatigue
      + (1 - stars / 5) * 0.10                             // plain scrubbiness
      + clamp(gap - 0.8, 0, 2) * 0.10;                     // stretching at full reach
    miss *= (1.35 - stars * 0.22);
    if (m.opp.boss) miss *= 0.25;
    if (m.oppFx.zoneShots > 0) miss *= 0.3;
    miss = clamp(miss, 0.02, 0.75);
    if (Math.random() < miss) {
      m.stats.oppMisses = (m.stats.oppMisses || 0) + 1;
      if (Math.random() < 0.5) {
        setState(p, "swing"); sfx.swishMiss();             // clean air-shot
        FX.floatText(p.x, p.y, 1.6, pick(["WHIFF!", "SWING AND A MISS!", "AIR!"]), "#7ee6a1", 0.8);
      } else {
        aiHit(m, 0.06);                                    // frame-shank flub
      }
      return;
    }
    aiHit(m);
  }
}

function aiHit(m, forceQ) {
  const stars = m.opp.stars;
  // Quality: stats + composure + zone + boss precision
  let base = clamp(0.32 + stars * 0.11, 0, 0.92);
  if (m.opp.boss) base = 0.88;
  base *= lerp(0.55, 1, m.oppComp / 100);
  if (m.oppFx.zoneShots > 0) { base = Math.max(base, 0.9); m.oppFx.zoneShots--; }
  let q = forceQ !== undefined ? forceQ : clamp(base + rand(-0.22, 0.18), 0.1, 1);

  // Mid-rally skills that trigger on their hit
  const skills = m.tier.oppSkills;
  const opts = {};
  const aggression = 0.1 + stars * 0.05;
  if (skills.includes("grunt") && Math.random() < aggression && cdOk(m, "grunt", 9)) {
    const g = pick(NAMES.GRUNTS);
    FX.floatText(m.oppP.x, OPP_Y - 1, 2.2, g, "#ff8a5c", 1.1);
    sfx.grunt(2);
    opts.power = 0.18;
    if (Math.random() < 0.3 + stars * 0.06) {
      m.youWindowShrink = 1.5;
      ticker(m, "That grunt rattled you — smaller sweet spot!");
    }
  }
  if (skills.includes("power") && Math.random() < aggression * 0.8 && cdOk(m, "power", 8)) {
    m.oppStam = clamp(m.oppStam - 15, 0, 100);
    opts.power = (opts.power || 0) + 0.28;
    FX.floatText(m.oppP.x, OPP_Y - 1, 2.4, "💥", "#fff", 1.2);
  }
  if (skills.includes("outrageous") && Math.random() < aggression * 0.5 && cdOk(m, "outrageous", 14)) {
    if (Math.random() < 0.6) {
      sayBanner(m, "OPPONENT " + pick(NAMES.OUTRAGEOUS_NAMES) + "!", "#ff8a5c", 1.1);
      sfx.cheer(1); opts.power = (opts.power || 0) + 0.2; opts.flip = true;
      q = Math.max(q, 0.95);
    } else {
      setState(m.oppP, "faceplant");
      sfx.gasp(); sayBanner(m, "OPPONENT FACEPLANT!", "#7ee6a1", 1.1);
      return;  // they missed it entirely
    }
  }

  // Aim: better players target away from you
  const away = m.you.x > 0 ? -1 : 1;
  const cornerBias = clamp(0.3 + stars * 0.12, 0, 0.9);
  let aimX = Math.random() < cornerBias ? away * rand(1.6, COURT.W / 2 - 0.4) : rand(-2.5, 2.5);
  let aimY = Math.random() < 0.25 ? COURT.NET_Y - rand(2, 5.5) : YOU_Y + rand(0.3, 3.2);
  aimY = clamp(aimY, 1.0, COURT.NET_Y - 1.2);
  opponentHit(m, q, aimX, aimY, opts);
}

// Called between points (from beginPreServe) — taunts, arguments, heals.
export function aiBetweenPoints(m) {
  const skills = m.tier.oppSkills;
  const stars = m.opp.stars;
  const chance = 0.16 + stars * 0.05;
  if (m.over) return;

  if (skills.includes("heckle") && Math.random() < chance) {
    setState(m.oppP, "heckle");
    FX.speech(m.oppP.x, OPP_Y - 0.5, pickBag("oppheck", NAMES.HECKLES), 2.4);
    sfx.heckleLaugh();
    m.comp = clamp(m.comp - (6 + stars * 3), 5, 100);
    ticker(m, "You've been heckled! Composure shaken.");
    return;
  }
  if (skills.includes("pigeon") && Math.random() < chance * 0.5) {
    FX.launchPigeon(false);
    sfx.pigeonCoo();
    m.youNextError = 1.6;
    sayBanner(m, "ENEMY PIGEON INBOUND! 🐦", "#ff8a5c", 1);
    return;
  }
  if (skills.includes("argue") && m.lastPointWonBy === "you" && Math.random() < chance * 0.7) {
    setState(m.oppP, "argue");
    pokeUmpire(); sfx.umpBeep();
    FX.speech(m.oppP.x, OPP_Y - 0.5, pick(NAMES.ARGUE_LINES), 2.2);
    if (Math.random() < 0.25) {
      // They steal your point!
      m.ptsYou = Math.max(0, m.ptsYou - 1); m.ptsOpp++;
      sayBanner(m, "THE UMPIRE SIDES WITH THEM?!", "#ff5c5c", 1);
      sfx.boo();
    } else {
      ticker(m, "Their tantrum falls on deaf ears. Play on.");
    }
    return;
  }
  if (skills.includes("injury") && (m.oppStam < 40 || m.oppComp < 40) && m.oppFx.injuriesUsed < 1 && Math.random() < 0.5) {
    m.oppFx.injuriesUsed++;
    setState(m.oppP, "injury");
    FX.speech(m.oppP.x, OPP_Y - 0.5, pick(NAMES.INJURY_LINES), 2.4);
    sfx.whistle();
    m.oppStam = clamp(m.oppStam + 50, 0, 100);
    m.oppComp = clamp(m.oppComp + 35, 0, 100);
    ticker(m, "Opponent takes a VERY convincing medical timeout. 🙄");
    return;
  }
  if (skills.includes("racketsmash") && m.oppComp < 35 && Math.random() < 0.5) {
    sfx.smash(); FX.addShake(6);
    FX.burst(m.oppP.x, OPP_Y, 0.5, 16, ["#c9c9c9", "#333"], 5);
    m.oppComp = 95;
    sayBanner(m, "OPPONENT SMASHES THEIR RACKET!", "#ff8a5c", 1);
    return;
  }
  if (skills.includes("zone") && Math.random() < chance * 0.6 && cdOk(m, "zone", 20)) {
    m.oppFx.zoneShots = 3;
    FX.floatText(m.oppP.x, OPP_Y - 1, 2.6, "🧠", "#b06cff", 1.3);
    ticker(m, "Opponent has entered The Zone. Uh oh.");
    return;
  }
}
