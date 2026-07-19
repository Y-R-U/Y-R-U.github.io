// Builds match configs (tier-shaped) + opponents for each play mode.
import { rand, pick, lerp, clamp } from "./util.js";
import { makeOpponent } from "./names.js";
import { storyLevel, CHAPTERS } from "./story.js";
import { dailyChallenge } from "./events.js";

function starsToTierId(stars) { return Math.max(0, Math.min(7, Math.round(stars * 1.5 - 0.5))); }

function oppSkillsForStars(stars) {
  const all = ["heckle", "grunt", "argue", "power", "outrageous", "pigeon", "zone", "injury", "racketsmash"];
  const n = Math.max(0, Math.min(all.length, Math.floor(stars * 2 - 1)));
  return all.slice(0, n);
}

/* ---------------- Story ---------------- */
export function storyMatch(save) {
  const n = Math.min(100, save.story || 1);
  const lvl = storyLevel(n);
  const ch = CHAPTERS[lvl.chapter];
  let opp;
  if (lvl.fixed) {
    opp = { name: lvl.fixed.name, face: lvl.fixed.face, stars: lvl.stars, bio: lvl.fixed.bio };
  } else if (lvl.boss) {
    opp = { name: lvl.boss.name, face: lvl.boss.face, stars: lvl.stars,
      bio: lvl.boss.bio, boss: !!lvl.boss.boss3000 };
  } else {
    opp = makeOpponent({ boss: false }, lvl.inChapter, 10, lvl.stars);
  }
  const cfg = {
    id: starsToTierId(lvl.stars), mode: "story", level: n,
    name: `${ch.emo} ${ch.name} — Level ${n}`, venue: lvl.venue,
    games: lvl.games, prize: lvl.prize, crowd: lvl.crowd,
    oppSkills: oppSkillsForStars(lvl.stars),
    eventChance: lvl.eventChance,
    flavour: lvl.line,
  };
  return { cfg, opp, lvl };
}

/* ---------------- Quick match ---------------- */
export function quickMatch(stars) {
  const opp = makeOpponent({ boss: false }, 0, 1, stars);
  const cfg = {
    id: starsToTierId(stars), mode: "quick",
    name: "Exhibition", venue: pick(["The Local Courts", "A Surprisingly Nice Marquee", "Roof of a Multi-Storey"]),
    games: 1, prize: Math.round(30 + Math.pow(stars, 3.2) * 120), crowd: 8 + Math.round(stars * 8),
    oppSkills: oppSkillsForStars(stars),
    eventChance: 0.12,
    flavour: "No rankings. No stakes. Full chaos permitted.",
  };
  return { cfg, opp };
}

/* ---------------- Tournaments ---------------- */
// `size` is the draw: 8 = quarters onward, 16 = adds a round of 16, 32 adds another.
// `reqLevel` is the story level you must have reached to enter.
export const TOURNAMENTS = {
  local: { id: "local", name: "The Local Cup", emo: "🥉", entry: 50, size: 8, reqLevel: 0,
    stars: [0.8, 2.4], prize: 500, crowd: 12,
    desc: "An eight-player draw. The trophy is an old kettle, spray-painted gold." },
  national: { id: "national", name: "The National Cup", emo: "🥈", entry: 5000, size: 16, reqLevel: 50,
    stars: [2.2, 3.8], prize: 250000, crowd: 30,
    desc: "Sixteen players, live on television. Your nan has told EVERYONE." },
  world: { id: "world", name: "The World Cup of Tennis*", emo: "🏆", entry: 100000, size: 32, reqLevel: 100,
    stars: [3.4, 5.0], prize: 3000000, crowd: 60,
    desc: "*name pending legal review. Thirty-two of the planet's weirdest, and a seven-figure cheque." },
};

// Round labels, longest draw first — sliced to fit whatever size the cup is.
const ALL_ROUNDS = [
  { key: "R32", name: "Round of 32" },
  { key: "R16", name: "Round of 16" },
  { key: "QF", name: "Quarter-Final" },
  { key: "SF", name: "Semi-Final" },
  { key: "F", name: "THE FINAL" },
];
export function roundsFor(size) {
  return ALL_ROUNDS.slice(ALL_ROUNDS.length - Math.round(Math.log2(size)));
}

export function cupLocked(save, kind) {
  const req = TOURNAMENTS[kind].reqLevel;
  if (!req) return null;
  const reached = save.storyDone ? 100 : save.story;
  return reached >= req ? null : req;
}

// Star-weighted coin flip for matches the player isn't in.
function simMatch(a, b) {
  const p = clamp(0.5 + (a.stars - b.stars) * 0.18, 0.12, 0.88);
  return Math.random() < p;
}
function simScore(target) {
  return { win: target, lose: Math.floor(Math.random() * target) };
}

export function startTournament(kind, save) {
  const t = TOURNAMENTS[kind];
  const size = t.size;
  // You, plus a full field seeded from weak to strong, then shuffled into the draw.
  const field = [{ you: true, name: "YOU", face: "🎾", stars: 0, bio: "" }];
  for (let i = 1; i < size; i++) {
    const stars = lerp(t.stars[0], t.stars[1], (i - 1) / (size - 2)) * rand(0.93, 1.07);
    field.push(makeOpponent({ boss: false }, i, size, Math.min(5, stars)));
  }
  const order = field.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {   // Fisher–Yates: your path is never fixed
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const names = roundsFor(size);
  const rounds = names.map((r, ri) => ({
    ...r,
    matches: Array.from({ length: size / Math.pow(2, ri + 1) },
      () => ({ a: null, b: null, w: null, sa: 0, sb: 0 })),
  }));
  for (let i = 0; i < rounds[0].matches.length; i++) {
    rounds[0].matches[i].a = order[i * 2];
    rounds[0].matches[i].b = order[i * 2 + 1];
  }
  return { kind, size, round: 0, youIdx: 0, field, rounds, out: false, championIdx: null };
}

export function youMatch(ts) {
  const ms = ts.rounds[ts.round].matches;
  const i = ms.findIndex(m => m.a === ts.youIdx || m.b === ts.youIdx);
  return i < 0 ? null : { match: ms[i], index: i };
}

function feedNext(ts, r) {
  const next = ts.rounds[r + 1];
  if (!next) return;
  ts.rounds[r].matches.forEach((m, i) => {
    const slot = next.matches[Math.floor(i / 2)];
    if (i % 2 === 0) slot.a = m.w; else slot.b = m.w;
  });
}

// Resolve the round the player just played: their real result, everyone else simulated.
export function advanceRound(ts, youWon, youGames, oppGames, target) {
  const r = ts.round;
  const ym = youMatch(ts);
  for (const m of ts.rounds[r].matches) {
    if (m.w !== null || m.a === null || m.b === null) continue;
    if (ym && m === ym.match) {
      const youIsA = m.a === ts.youIdx;
      m.w = youWon ? ts.youIdx : (youIsA ? m.b : m.a);
      m.sa = youIsA ? youGames : oppGames;
      m.sb = youIsA ? oppGames : youGames;
    } else {
      const aWins = simMatch(ts.field[m.a], ts.field[m.b]);
      m.w = aWins ? m.a : m.b;
      const s = simScore(target || 2);
      m.sa = aWins ? s.win : s.lose;
      m.sb = aWins ? s.lose : s.win;
    }
  }
  feedNext(ts, r);
  if (!youWon) ts.out = true;
  if (r + 1 >= ts.rounds.length) ts.championIdx = ts.rounds[r].matches[0].w;
  else ts.round = r + 1;
  return ts;
}

// Player knocked out: play the rest of the draw out so the bracket stays truthful.
export function simulateRest(ts, target) {
  for (let r = ts.round; r < ts.rounds.length; r++) {
    for (const m of ts.rounds[r].matches) {
      if (m.w !== null || m.a === null || m.b === null) continue;
      const aWins = simMatch(ts.field[m.a], ts.field[m.b]);
      m.w = aWins ? m.a : m.b;
      const s = simScore(target || 2);
      m.sa = aWins ? s.win : s.lose;
      m.sb = aWins ? s.lose : s.win;
    }
    feedNext(ts, r);
  }
  const last = ts.rounds[ts.rounds.length - 1].matches[0];
  ts.championIdx = last.w;
  return ts;
}

export function tournamentMatch(ts) {
  const t = TOURNAMENTS[ts.kind];
  const ym = youMatch(ts);
  const oppIdx = ym.match.a === ts.youIdx ? ym.match.b : ym.match.a;
  const opp = ts.field[oppIdx];
  const r = ts.round, last = ts.rounds.length - 1;
  const round = ts.rounds[r];
  // Early rounds pay a token appearance fee; the winner's cheque is the point.
  const prize = r === last ? t.prize : Math.round(t.prize * 0.015 * Math.pow(1.9, r));
  const cfg = {
    id: starsToTierId(opp.stars), mode: "tournament",
    name: `${t.emo} ${t.name} — ${round.name}`,
    venue: t.name + " Centre Court",
    prize, crowd: t.crowd + r * 10,
    oppSkills: oppSkillsForStars(opp.stars),
    eventChance: 0.1 + r * 0.05,
    flavour: t.desc,
  };
  return { cfg, opp, roundName: round.name };
}

/* ---------------- Daily challenge ---------------- */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dailyMatch() {
  const date = todayStr();
  const ch = dailyChallenge(date);
  const opp = makeOpponent({ boss: false }, 0, 1, ch.stars);
  const cfg = {
    id: starsToTierId(ch.stars), mode: "daily",
    name: `📅 Daily Challenge — ${ch.mod.emo} ${ch.mod.name}`,
    venue: "The Challenge Court",
    games: ch.games, prize: ch.prize, crowd: 26,
    oppSkills: oppSkillsForStars(ch.stars),
    eventChance: 0,               // the modifier IS the event, all match long
    modifier: ch.mod.id,
    flavour: ch.mod.desc,
  };
  return { cfg, opp, date, mod: ch.mod };
}
