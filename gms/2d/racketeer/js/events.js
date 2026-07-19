// Random match events — trigger between points, last one point, pure chaos.
// Daily-challenge modifiers reuse the same effect ids but last the whole match.
import { pick, rand } from "./util.js";
import * as FX from "./fx.js";
import { sfx } from "./audio.js";
import { project, view } from "./court.js";

export const EVENTS = [
  { id: "wind", name: "FREAK GUST!", emo: "🌬️",
    line: "A rogue wind barrels through — every ball will drift!" },
  { id: "rain", name: "SUDDEN DOWNPOUR!", emo: "🌧️",
    line: "Rain! Shots are slower and everyone regrets everything." },
  { id: "dog", name: "DOG ON COURT!", emo: "🐕",
    line: "A dog has the ball. The dog is faster than everyone." },
  { id: "bees", name: "BEE SWARM!", emo: "🐝",
    line: "BEES. Both players will be swatting mid-swing!" },
  { id: "powercut", name: "POWER CUT!", emo: "🔦",
    line: "The floodlights die — play on by the glow of the ball!" },
  { id: "squareball", name: "SUSPICIOUS BALL!", emo: "🎲",
    line: "This replacement ball is... slightly square? Bounces are a lottery." },
  { id: "mascot", name: "MASCOT INVASION!", emo: "🐔",
    line: "The mascot is doing laps. The crowd LOVES the mascot." },
  { id: "paparazzi", name: "PAPARAZZI FRENZY!", emo: "📸",
    line: "Flashbulbs everywhere — hard to time anything in this strobe!" },
];

export function rollEvent(m, chance) {
  if (m.activeEvent || Math.random() > chance) return;
  startEvent(m, pick(EVENTS), 1);
}

export function startEvent(m, ev, points) {
  m.activeEvent = { ...ev, pointsLeft: points };
  FX.bannerText(`${ev.emo} ${ev.name}`, "#6fd3ff", 1.3);
  m.hooks.onTicker && m.hooks.onTicker(ev.line, 3.2);
  applyEventStart(m, ev.id);
}

function applyEventStart(m, id) {
  switch (id) {
    case "wind": m.eventWind = rand(-3.2, 3.2); sfx.gasp(); break;
    case "rain": sfx.gasp(); break;
    case "dog": FX.runDog(); sfx.cheer(0.8);
      m.comp = Math.max(5, m.comp - 4); m.oppComp = Math.max(5, m.oppComp - 4); break;
    case "bees": sfx.gasp(); m.youNextError = Math.max(m.youNextError, 1.4); m.oppNextError = Math.max(m.oppNextError, 1.4); break;
    case "powercut": sfx.gasp(); break;
    case "squareball": sfx.click(); break;
    case "mascot": sfx.cheer(1.1); break;
    case "paparazzi": m.youWindowShrink = Math.max(m.youWindowShrink, 1.35); break;
  }
}

// Called at the end of each point.
export function tickEvent(m) {
  if (!m.activeEvent) return;
  if (m.modifier === m.activeEvent.id) return;   // match-long daily modifier never expires
  m.activeEvent.pointsLeft--;
  if (m.activeEvent.pointsLeft <= 0) {
    m.activeEvent = null;
    m.eventWind = 0;
  }
}

// Per-frame effects during rallies.
export function eventFrame(m, dt) {
  const ev = m.activeEvent;
  if (!ev) { m.ball.wind = 0; return; }
  switch (ev.id) {
    case "wind":
      m.ball.wind = m.eventWind || 0;
      if (Math.random() < dt * 6) FX.burst(rand(-6, 6), rand(2, 20), rand(0.5, 3), 1, "rgba(200,220,255,.5)", 1);
      break;
    case "bees":
      if (Math.random() < dt * 10) FX.burst(m.ball.x + rand(-1, 1), m.ball.y + rand(-1, 1), m.ball.z + rand(0, 1), 1, "#ffd34a", 0.8);
      break;
    case "rain":
      if (Math.random() < dt * 30) FX.burst(rand(-7, 7), rand(0, 23), rand(3, 5), 1, "rgba(140,180,255,.6)", 0.5);
      break;
    default: m.ball.wind = 0;
  }
}

// Shot-time multiplier (rain slows everything).
export function eventShotSlow(m) { return m.activeEvent?.id === "rain" ? 1.18 : 1; }

// Weird bounce hook.
export function eventBounce(m) {
  if (m.activeEvent?.id === "squareball") {
    m.ball.vx += rand(-2.4, 2.4);
    m.ball.vy *= rand(0.75, 1.2);
    FX.floatText(m.ball.x, m.ball.y, 0.6, "boing?", "#fff", 0.6);
  }
}

// Overlay tint after everything else draws.
export function eventOverlay(m, ctx) {
  const ev = m.activeEvent;
  if (!ev) return;
  if (ev.id === "powercut") {
    ctx.fillStyle = "rgba(2,4,10,.82)";
    ctx.fillRect(0, 0, view.w, view.h);
    // Ball glow re-punched through the dark
    if (m.ball.live) {
      const p = project(m.ball.x, m.ball.y, m.ball.z);
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 90);
      g.addColorStop(0, "rgba(220,255,120,.9)"); g.addColorStop(1, "rgba(220,255,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 90, 0, 7); ctx.fill();
    }
  } else if (ev.id === "rain") {
    ctx.fillStyle = "rgba(60,90,140,.14)";
    ctx.fillRect(0, 0, view.w, view.h);
  } else if (ev.id === "paparazzi" && Math.random() < 0.08) {
    ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

/* ---------------- Daily challenge modifiers ---------------- */
export const DAILY_MODS = [
  { id: "wind", name: "Wind Tunnel", emo: "🌬️", desc: "A permanent gale. Every ball drifts." },
  { id: "bees", name: "Bee Day", emo: "🐝", desc: "The bees never leave. Ever." },
  { id: "squareball", name: "Square Ball Saturday*", emo: "🎲", desc: "*applies on all days. Bounces are a lottery." },
  { id: "powercut", name: "Lights Out", emo: "🔦", desc: "The whole match in the dark. Follow the glow." },
  { id: "rain", name: "The Great Drizzle", emo: "🌧️", desc: "Slow, soggy, cinematic tennis." },
  { id: "paparazzi", name: "Flash Mob", emo: "📸", desc: "Cameras. So many cameras." },
];

export function dailySeed(dateStr) {
  let h = 0;
  for (const c of dateStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function dailyChallenge(dateStr) {
  const seed = dailySeed(dateStr);
  const mod = DAILY_MODS[seed % DAILY_MODS.length];
  const stars = 1.5 + (seed >> 4) % 30 / 10;      // 1.5 .. 4.4
  return { mod, stars, prize: (150 + (seed % 5) * 50) * 10, games: 1 };
}
