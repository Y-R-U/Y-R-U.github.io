// Builds match configs (tier-shaped) + opponents for each play mode.
import { rand, pick } from "./util.js";
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
    games: 1, prize: Math.round(30 + stars * 40), crowd: 8 + Math.round(stars * 8),
    oppSkills: oppSkillsForStars(stars),
    eventChance: 0.12,
    flavour: "No rankings. No stakes. Full chaos permitted.",
  };
  return { cfg, opp };
}

/* ---------------- Tournaments ---------------- */
export const TOURNAMENTS = {
  local: { id: "local", name: "The Local Cup", emo: "🥉", entry: 50,
    stars: [1.0, 2.2], games: [1, 1, 2], prize: 500, crowd: 12,
    desc: "Three rounds. The trophy is an old kettle, spray-painted gold." },
  national: { id: "national", name: "The National Cup", emo: "🥈", entry: 250,
    stars: [2.4, 3.6], games: [2, 2, 2], prize: 2000, crowd: 30,
    desc: "Three rounds on live television. Your nan has told EVERYONE." },
  world: { id: "world", name: "The World Cup of Tennis*", emo: "🏆", entry: 1000,
    stars: [3.6, 4.8], games: [2, 3, 3], prize: 8000, crowd: 60,
    desc: "*name pending legal review. Three rounds against the planet's weirdest." },
};
const ROUND_NAMES = ["Quarter-Final", "Semi-Final", "THE FINAL"];

export function startTournament(kind) {
  const t = TOURNAMENTS[kind];
  const opps = [0, 1, 2].map(i => {
    const stars = t.stars[0] + (t.stars[1] - t.stars[0]) * (i / 2) * rand(0.92, 1.08);
    return makeOpponent({ boss: false }, i, 3, Math.min(5, stars));
  });
  return { kind, round: 0, opps };
}

export function tournamentMatch(tstate) {
  const t = TOURNAMENTS[tstate.kind];
  const opp = tstate.opps[tstate.round];
  const cfg = {
    id: starsToTierId(opp.stars), mode: "tournament",
    name: `${t.emo} ${t.name} — ${ROUND_NAMES[tstate.round]}`,
    venue: t.name + " Centre Court",
    games: t.games[tstate.round],
    prize: tstate.round === 2 ? t.prize : Math.round(t.prize * 0.06),
    crowd: t.crowd + tstate.round * 10,
    oppSkills: oppSkillsForStars(opp.stars),
    eventChance: 0.1 + tstate.round * 0.06,
    flavour: t.desc,
  };
  return { cfg, opp, roundName: ROUND_NAMES[tstate.round] };
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
