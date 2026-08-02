// THE SEASON — 100 levels across ten chapters, with in-engine cutscenes at the
// start of every chapter and at the finale.
//
// Levels are generated from a chapter table rather than hand-listed: each
// chapter owns a set of circuits, a difficulty ramp and a rotation of
// objectives, so the hundred races escalate consistently and the file stays
// something a person can actually read.

import { RIVAL_NAMES, TEAM_NAMES, LIVERY } from './config.js';
import { statsFor } from './arsenal.js';
import { mulberry32, clamp, lerp, pick, shuffled } from './utils.js';

export const CHAPTERS = [
  {
    n: 1, name: 'BACKYARD SERIES', sub: 'Nobody is watching. Yet.',
    tracks: ['hometown', 'dockside', 'hometown', 'speedbowl'],
    skill: 0.62, aggro: 0.22, tier: 0.5, purse: 2200, env: null,
    blurb: 'A regional feeder series in front of two hundred people and one camera.',
  },
  {
    n: 2, name: 'THE SPONSORS NOTICE', sub: 'Ratings are a currency.',
    tracks: ['speedbowl', 'neonmile', 'dockside', 'hometown'],
    skill: 0.68, aggro: 0.3, tier: 1.2, purse: 3400,
    blurb: 'Bad Habit Energy put their logo on your door. They expect a show.',
  },
  {
    n: 3, name: "STEWARDS' WARNING", sub: 'Somebody started counting.',
    tracks: ['grinder', 'stormharbour', 'neonmile', 'dockside'],
    skill: 0.74, aggro: 0.36, tier: 1.9, purse: 4600,
    blurb: 'Adjudicator Hallow has opened a file with your name on it.',
  },
  {
    n: 4, name: 'THE LOOP CIRCUIT', sub: 'Lift and you fall out of it.',
    tracks: ['loopyard', 'grinder', 'speedbowl', 'stormharbour'],
    skill: 0.79, aggro: 0.42, tier: 2.6, purse: 6000,
    blurb: 'Forty feet of welded steel and a champion who wants you under it.',
  },
  {
    n: 5, name: 'DIRT SEASON', sub: 'Out where the cameras are thin.',
    tracks: ['quarry', 'saltflats', 'quarry', 'carverpass'],
    skill: 0.82, aggro: 0.48, tier: 3.2, purse: 7400,
    blurb: 'No barriers, no run-off and, for once, hardly any broadcast crew.',
  },
  {
    n: 6, name: 'PRIME TIME', sub: 'Every corner is live.',
    tracks: ['crownpoint', 'cathedral', 'neonmile', 'crownpoint'],
    skill: 0.85, aggro: 0.52, tier: 3.8, purse: 9200,
    blurb: 'Saturday night. Nine cameras. The stewards are in the booth with the producers.',
  },
  {
    n: 7, name: 'THE MOUNTAIN', sub: 'A long way down on one side.',
    tracks: ['carverpass', 'skyline', 'quarry', 'skyline'],
    skill: 0.88, aggro: 0.56, tier: 4.3, purse: 11000,
    blurb: 'Two rounds up Carver Pass. People do not always come back down.',
  },
  {
    n: 8, name: 'BLOOD MONEY', sub: 'Last place goes home. Permanently.',
    tracks: ['grinder', 'loopyard', 'stormharbour', 'cathedral'],
    skill: 0.9, aggro: 0.66, tier: 4.8, purse: 13500,
    blurb: 'Knockout season. The show discovered that eliminations rate better than racing.',
  },
  {
    n: 9, name: 'THE SYNDICATE', sub: 'The fines were never a punishment.',
    tracks: ['twinrings', 'cathedral', 'skyline', 'twinrings'],
    skill: 0.93, aggro: 0.7, tier: 5.4, purse: 16500,
    blurb: 'You know where the fine money goes now. So does everybody who took it.',
  },
  {
    n: 10, name: 'THE CIRCUS', sub: 'One night. Everything.',
    tracks: ['circus', 'twinrings', 'circus', 'skyline'],
    skill: 0.96, aggro: 0.78, tier: 6, purse: 22000,
    blurb: 'The season finale, live, with a crowd that has been promised a verdict.',
  },
];

export const LEVELS_PER_CHAPTER = 10;
export const storyLength = () => CHAPTERS.length * LEVELS_PER_CHAPTER;

// The rotation of objectives inside a chapter. Index = level within chapter.
const OBJECTIVES = [
  { kind: 'top', n: 5, label: 'FINISH TOP 5' },
  { kind: 'podium', label: 'FINISH ON THE PODIUM' },
  { kind: 'wreck', n: 2, pos: 6, label: 'WRECK 2 RIVALS AND FINISH TOP 6' },
  { kind: 'win', label: 'WIN THE RACE' },
  { kind: 'parts', n: 4, pos: 6, label: 'KNOCK 4 PARTS OFF RIVALS' },
  { kind: 'stealth', max: 55, pos: 3, label: 'PODIUM WITH SUSPICION UNDER 55' },
  { kind: 'clean', pos: 3, label: 'PODIUM WITH NO INVESTIGATIONS' },
  { kind: 'hype', n: 65, pos: 5, label: 'REACH 65 CROWD HYPE' },
  { kind: 'survive', label: 'SURVIVE THE KNOCKOUT' },
  { kind: 'win', label: 'BEAT THE CHAPTER RIVAL' },
];

// Named rivals who show up as the boss of each chapter.
const CHAPTER_RIVALS = [
  { name: 'GUS PENNY', team: 'Moth & Sons', style: 'stock' },
  { name: 'TALA WREN', team: 'Redcap', style: 'wedge' },
  { name: 'BOONE ASH', team: 'Cutshaw', style: 'van' },
  { name: 'VANCE KRIEG', team: 'Iron Pact', style: 'muscle' },
  { name: 'NIKA FANG', team: 'Nightshift', style: 'buggy' },
  { name: 'ODA STRIKE', team: 'Vega Auto', style: 'wedge' },
  { name: 'SIL MORROW', team: 'Halloway', style: 'muscle' },
  { name: 'RIGGS MALO', team: 'Deadbolt', style: 'van' },
  { name: 'MAYA KURO', team: 'Sunk Cost', style: 'wedge' },
  { name: 'VANCE KRIEG', team: 'Iron Pact', style: 'muscle' },
];

export function chapterOf(level) {
  return CHAPTERS[clamp(Math.ceil(level / LEVELS_PER_CHAPTER), 1, CHAPTERS.length) - 1];
}

export function isLevelUnlocked(level, profile) {
  return level <= (profile.story.level || 1);
}

// ---------------------------------------------------------------------------
export function levelEvent(level) {
  const n = clamp(level, 1, storyLength());
  const ch = chapterOf(n);
  const i = (n - 1) % LEVELS_PER_CHAPTER;
  const rng = mulberry32(9000 + n * 37);
  const ramp = i / (LEVELS_PER_CHAPTER - 1);

  const objective = { ...OBJECTIVES[i] };
  const boss = i === LEVELS_PER_CHAPTER - 1;
  const knockout = i === 8 || (ch.n >= 8 && i === 4);
  // A chapter's last race belongs on that chapter's headline circuit — the
  // season finale should be at The Circus, not wherever the rotation landed.
  const track = boss ? ch.tracks[0] : ch.tracks[i % ch.tracks.length];

  const cars = knockout ? 10 : (ch.n >= 6 ? 8 : Math.min(8, 6 + Math.floor(ch.n / 3)));
  const skill = clamp(ch.skill + ramp * 0.05, 0.3, 0.99);
  const aggro = clamp(ch.aggro + ramp * 0.07, 0.05, 1);
  const purse = Math.round(ch.purse * (1 + ramp * 0.55) * (boss ? 1.5 : 1));

  const rivals = [];
  if (boss) {
    const r = CHAPTER_RIVALS[ch.n - 1];
    rivals.push({
      name: r.name, team: r.team, style: r.style,
      livery: LIVERY[(ch.n * 3) % LIVERY.length],
      skill: clamp(skill + 0.05, 0, 1),
      aggression: clamp(aggro + 0.25, 0, 1),
      stats: statsFor(bossKit(ch.tier + 0.6)),
      skills: bossSkills(ch.n),
      boss: true,
    });
  }

  return {
    mode: 'story',
    id: `story-${n}`,
    level: n,
    chapter: ch.n,
    title: `${ch.name} ${i + 1}/${LEVELS_PER_CHAPTER}`,
    subtitle: boss ? `RIVAL: ${CHAPTER_RIVALS[ch.n - 1].name}` : ch.sub,
    track,
    laps: ch.n >= 7 && rng() < 0.4 ? 4 : 3,
    cars,
    aiSkill: skill,
    aiAggro: aggro,
    rubber: clamp(0.45 - ch.n * 0.03, 0.08, 0.45),
    tier: ch.tier,
    styleSeed: n,
    purse,
    purseTier: 0.6 + ch.n * 0.18,
    playerSlot: boss ? cars - 1 : Math.min(cars - 1, 3 + (i % 4)),
    objective,
    rivals: rivals.length ? rivals.concat(fillRivals(cars - 1 - rivals.length, ch, skill, aggro, n)) : null,
    knockout,
    chestOnClear: boss ? (ch.n >= 7 ? 'sponsor' : 'contra') : (i % 3 === 2 ? 'parts' : null),
  };
}

function fillRivals(count, ch, skill, aggro, seed) {
  if (count <= 0) return [];
  const names = shuffled(RIVAL_NAMES, mulberry32(seed * 13 + 7)).slice(0, count);
  const styles = ['muscle', 'wedge', 'stock', 'van', 'buggy'];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      name: names[i] || `RIVAL ${i}`,
      team: TEAM_NAMES[(i + ch.n) % TEAM_NAMES.length],
      style: styles[(i + seed) % styles.length],
      livery: LIVERY[(i + ch.n * 2 + 1) % LIVERY.length],
      skill: clamp(skill + (i - count / 2) * 0.016, 0.3, 1),
      aggression: clamp(aggro + (i % 3) * 0.08 - 0.08, 0.03, 1),
      stats: statsFor(rivalKit(ch.tier)),
      skills: rivalSkillSet(ch.tier),
    });
  }
  return out;
}

function tierPart(prefix, t) {
  return prefix + clamp(Math.round(1 + t), 1, 6);
}
function rivalKit(t) {
  return {
    engine: tierPart('eng', t), tyres: tierPart('tyr', t), armour: tierPart('arm', t - 0.5),
    nitro: tierPart('nit', t - 0.5), frame: tierPart('frm', t - 0.5), stealth: 'stl1',
  };
}
function bossKit(t) {
  return {
    engine: tierPart('eng', t), tyres: tierPart('tyr', t), armour: tierPart('arm', t),
    nitro: tierPart('nit', t), frame: tierPart('frm', t), stealth: 'stl1',
  };
}
function rivalSkillSet(t) {
  const cheap = ['slam', 'bullbar', 'jetwash', 'smoke'];
  const mid = ['pitspin', 'oilslick', 'tacks', 'hooksaw', 'anchor'];
  const big = ['emp', 'shockwave', 'grapple', 'ramjet', 'scattergun'];
  const pool = t > 4 ? [...mid, ...big] : t > 2 ? [...cheap, ...mid] : cheap;
  return shuffled(pool).slice(0, 2);
}
function bossSkills(chapter) {
  if (chapter >= 9) return ['wreckingball', 'ramjet', 'shockwave'];
  if (chapter >= 6) return ['pitspin', 'emp', 'hooksaw'];
  if (chapter >= 3) return ['pitspin', 'oilslick', 'slam'];
  return ['slam', 'bullbar'];
}

// ---------------------------------------------------------------------------
// Cutscenes
// ---------------------------------------------------------------------------
const CUTSCENES = {
  intro: {
    id: 'intro', track: 'hometown', env: 'dusk',
    cars: [
      { style: 'muscle', livery: 0, s: 40, t: -4 },
      { style: 'stock', livery: 6, s: 46, t: 4, stripped: ['bonnet', 'doorL'] },
    ],
    shots: [
      { dur: 3.4, cam: { s: 10, s2: 26, across: 22, above: 7, look: 40, fov: 40 },
        caption: 'FOUL PLAY\nSEASON OPENER · HOMETOWN OVAL' },
      { dur: 4.2, cam: { orbit: { car: 0, r: 11, h: 3.4, from: 1.2, sweep: 1.1 }, fov: 40 },
        who: 'DUTCH', text: 'That is your car. It is mostly held together by paint and optimism. Try to bring some of it home.' },
      { dur: 4.6, cam: { s: 44, across: 9, above: 2.4, lookCar: 1, fov: 38 },
        who: 'DUTCH', text: 'Rules, such as they are: contact is racing. You can lean on anyone, anywhere, all day. Nobody will say a word.' },
      { dur: 4.8, cam: { s: 52, s2: 64, across: 16, above: 5, look: 20, fov: 42 },
        who: 'DUTCH', text: 'What you cannot do is get caught using the interesting equipment. Do it close and it looks like racing. Do it from across the track and it looks like what it is.' },
      { dur: 4.4, cam: { orbit: { car: 1, r: 9, h: 2.6, from: 0.2, sweep: 1.4 }, fov: 44 },
        who: 'DUTCH', text: 'And if they do catch you — smile. The crowd pays the bills, and a crowd that is enjoying itself can talk a steward out of almost anything.' },
      { dur: 3.2, cam: { s: 0, across: 26, above: 12, look: 60, fov: 46 },
        who: 'DUTCH', text: 'Lights in two minutes. Go and be somebody.' },
    ],
  },

  ch2: {
    id: 'ch2', track: 'neonmile', env: 'neon',
    cars: [{ style: 'muscle', livery: 0, s: 30, t: 0 }],
    shots: [
      { dur: 3.2, cam: { s: 4, s2: 20, across: 20, above: 9, look: 40, fov: 42 },
        caption: 'CHAPTER TWO\nTHE SPONSORS NOTICE' },
      { dur: 4.6, cam: { orbit: { car: 0, r: 12, h: 4, from: 2.2, sweep: -1.1 }, fov: 40 },
        who: 'MARGO SALT', text: 'Do you know what our overnight numbers did the night you put Penny into the crane wall? They tripled. Three hundred percent, for a man hitting a wall.' },
      { dur: 4.4, cam: { s: 40, across: 8, above: 2.2, look: 26, fov: 36 },
        who: 'MARGO SALT', text: 'So here is a crate of things the rulebook does not mention, and here is my card. I am the executive producer. I decide what the audience sees.' },
      { dur: 4.2, cam: { s: 60, s2: 88, across: 14, above: 6, look: 30, fov: 44 },
        who: 'MARGO SALT', text: 'Which means, functionally, I decide what happened. Give me something worth deciding about.' },
    ],
  },

  ch3: {
    id: 'ch3', track: 'grinder', env: 'dusk',
    cars: [{ style: 'muscle', livery: 0, s: 24, t: -3 }, { style: 'stock', livery: 10, s: 24, t: 4 }],
    shots: [
      { dur: 3.2, cam: { s: 6, across: 18, above: 8, look: 36, fov: 42 },
        caption: 'CHAPTER THREE\nTHE ADJUDICATOR' },
      { dur: 5.0, cam: { orbit: { car: 1, r: 10, h: 3.2, from: 0.6, sweep: 0.9 }, fov: 38 },
        who: 'ADJ. HALLOW', text: 'I have watched four hundred hours of you. I have never once seen you break a rule. That is what bothers me.' },
      { dur: 4.6, cam: { s: 30, across: 7, above: 2, lookCar: 0, fov: 36 },
        who: 'ADJ. HALLOW', text: 'Sixteen drivers have retired hurt this season. Nine of them were within two car lengths of you at the time.' },
      { dur: 4.6, cam: { s: 44, s2: 70, across: 12, above: 5, look: 24, fov: 44 },
        who: 'ADJ. HALLOW', text: 'I cannot prove a thing. So this is not a warning. Consider it a promise that I am patient.' },
    ],
  },

  ch4: {
    id: 'ch4', track: 'loopyard', env: 'night',
    cars: [{ style: 'muscle', livery: 0, s: 60, t: -4 }, { style: 'muscle', livery: 6, s: 60, t: 4 }],
    shots: [
      { dur: 3.4, cam: { s: 200, s2: 230, across: 26, above: 16, look: 40, fov: 46 },
        caption: 'CHAPTER FOUR\nTHE LOOP YARD' },
      { dur: 4.4, cam: { orbit: { car: 1, r: 12, h: 3.6, from: 3.4, sweep: 1.2 }, fov: 38 },
        who: 'VANCE KRIEG', text: 'Krieg. Four titles. You are the one the producers keep cutting to.' },
      { dur: 4.4, cam: { s: 66, across: 8, above: 2.2, lookCar: 0, fov: 36 },
        who: 'VANCE KRIEG', text: 'Enjoy it. They cut to whoever is about to have an accident. That is the entire job of a camera.' },
      { dur: 4.6, cam: { s: 90, s2: 150, across: 15, above: 7, look: 26, fov: 44 },
        who: 'DUTCH', text: 'He has never been fined. Not once, in four seasons. Ask yourself how a man races like that and never once gets caught.' },
    ],
  },

  ch5: {
    id: 'ch5', track: 'saltflats', env: 'dust',
    cars: [{ style: 'muscle', livery: 0, s: 80, t: -5 }, { style: 'buggy', livery: 8, s: 80, t: 5 }],
    shots: [
      { dur: 3.4, cam: { s: 20, s2: 60, across: 30, above: 10, look: 70, fov: 48 },
        caption: 'CHAPTER FIVE\nDIRT SEASON' },
      { dur: 4.8, cam: { orbit: { car: 1, r: 11, h: 3, from: 1.6, sweep: 1.3 }, fov: 40 },
        who: 'NIKA FANG', text: 'Out here there are two cameras and both of them are pointed at the finish line. It is the only place all season we can talk.' },
      { dur: 5.0, cam: { s: 92, across: 9, above: 2.4, lookCar: 0, fov: 36 },
        who: 'NIKA FANG', text: 'The fines are not punishment. They are revenue. Salt writes the fine into the broadcast as a story beat and sells it back to the sponsors as drama.' },
      { dur: 4.6, cam: { s: 140, s2: 200, across: 22, above: 9, look: 40, fov: 46 },
        who: 'NIKA FANG', text: 'You are not getting away with anything. You are being harvested. Same as the rest of us.' },
    ],
  },

  ch6: {
    id: 'ch6', track: 'crownpoint', env: 'noon',
    cars: [{ style: 'muscle', livery: 0, s: 50, t: 0 }],
    shots: [
      { dur: 3.4, cam: { s: 0, s2: 40, across: 24, above: 14, look: 50, fov: 46 },
        caption: 'CHAPTER SIX\nPRIME TIME' },
      { dur: 4.8, cam: { orbit: { car: 0, r: 13, h: 4.4, from: 0.4, sweep: 1.6 }, fov: 40 },
        who: 'MARGO SALT', text: 'Saturday night. Nine cameras, and every one of them has you on a preset. You do not get a quiet corner any more.' },
      { dur: 4.6, cam: { s: 70, across: 10, above: 2.6, look: 30, fov: 38 },
        who: 'MARGO SALT', text: 'The audience has decided what you are. They have not decided whether they like it. That is the good part.' },
      { dur: 4.4, cam: { s: 120, s2: 170, across: 18, above: 8, look: 34, fov: 44 },
        who: 'DUTCH', text: 'She means: be spectacular or be finished. Both, ideally, in that order.' },
    ],
  },

  ch7: {
    id: 'ch7', track: 'carverpass', env: 'dawn',
    cars: [{ style: 'muscle', livery: 0, s: 120, t: -3 }],
    shots: [
      { dur: 3.6, cam: { s: 60, s2: 120, across: 28, above: 18, look: 60, fov: 48 },
        caption: 'CHAPTER SEVEN\nTHE MOUNTAIN' },
      { dur: 4.8, cam: { orbit: { car: 0, r: 12, h: 4, from: 2.6, sweep: -1.4 }, fov: 40 },
        who: 'DUTCH', text: 'They took the barriers off the outside of turn four. Not damaged. Removed. There is a purchase order for it.' },
      { dur: 4.6, cam: { s: 190, across: 11, above: 3, look: 30, fov: 38 },
        who: 'DUTCH', text: 'Morrow went over there last year. He is alive. He does not race. Nobody was fined, because nobody touched him.' },
      { dur: 4.4, cam: { s: 260, s2: 330, across: 20, above: 10, look: 40, fov: 46 },
        who: 'DUTCH', text: 'You do not have to do this one. I am saying that out loud so it is on the record that I said it.' },
    ],
  },

  ch8: {
    id: 'ch8', track: 'grinder', env: 'dusk',
    cars: [{ style: 'muscle', livery: 0, s: 40, t: -3 }, { style: 'stock', livery: 10, s: 40, t: 4 }],
    shots: [
      { dur: 3.4, cam: { s: 4, across: 18, above: 9, look: 34, fov: 44 },
        caption: 'CHAPTER EIGHT\nBLOOD MONEY' },
      { dur: 5.0, cam: { orbit: { car: 1, r: 10, h: 3.4, from: 1.0, sweep: 1.1 }, fov: 38 },
        who: 'ADJ. HALLOW', text: 'Elimination format. Last car every twenty seconds. I did not sign it off. The broadcaster did, and my office was informed afterwards.' },
      { dur: 5.0, cam: { s: 60, across: 8, above: 2.2, lookCar: 0, fov: 36 },
        who: 'ADJ. HALLOW', text: 'I want Krieg. Give me one thing I can use — one clip, one witness — and I will lose your entire file.' },
      { dur: 4.4, cam: { s: 90, s2: 140, across: 14, above: 6, look: 26, fov: 44 },
        who: 'ADJ. HALLOW', text: 'Or keep collecting fines for a woman who books them as income. Your season.' },
    ],
  },

  ch9: {
    id: 'ch9', track: 'twinrings', env: 'neon',
    cars: [{ style: 'muscle', livery: 0, s: 30, t: 0 }],
    shots: [
      { dur: 3.6, cam: { s: 180, s2: 240, across: 30, above: 20, look: 50, fov: 48 },
        caption: 'CHAPTER NINE\nTHE SYNDICATE' },
      { dur: 5.0, cam: { orbit: { car: 0, r: 13, h: 4.6, from: 3.0, sweep: 1.4 }, fov: 40 },
        who: 'MARGO SALT', text: 'You have paid us four hundred thousand in fines this season. In the accounts it sits under Content Acquisition.' },
      { dur: 4.8, cam: { s: 60, across: 9, above: 2.4, look: 28, fov: 36 },
        who: 'MARGO SALT', text: 'Krieg has never paid a penny, because Krieg has never been shown doing anything. That is a directing decision, not a driving one.' },
      { dur: 4.8, cam: { s: 120, s2: 200, across: 18, above: 9, look: 34, fov: 46 },
        who: 'MARGO SALT', text: 'One race left. Beat him in front of eleven million people and the decision stops being mine.' },
    ],
  },

  ch10: {
    id: 'ch10', track: 'circus', env: 'night',
    cars: [
      { style: 'muscle', livery: 0, s: 30, t: -4 },
      { style: 'muscle', livery: 6, s: 30, t: 4 },
    ],
    shots: [
      { dur: 4.0, cam: { s: 150, s2: 220, across: 34, above: 24, look: 60, fov: 50 },
        caption: 'CHAPTER TEN\nTHE CIRCUS' },
      { dur: 4.6, cam: { orbit: { car: 1, r: 12, h: 3.8, from: 2.0, sweep: 1.2 }, fov: 38 },
        who: 'VANCE KRIEG', text: 'They built a loop, a corkscrew and a jump, and sold ninety thousand seats. Nobody bought a ticket to watch us drive.' },
      { dur: 4.6, cam: { s: 40, across: 8, above: 2.2, lookCar: 0, fov: 36 },
        who: 'VANCE KRIEG', text: 'One of us gets carried out of here tonight. I have four titles that say it is not me.' },
      { dur: 4.8, cam: { s: 80, s2: 160, across: 20, above: 11, look: 36, fov: 46 },
        who: 'DUTCH', text: 'Every camera on this circuit is live and locked on you. There is no quiet corner tonight. So do not look for one.' },
      { dur: 4.4, cam: { orbit: { car: 0, r: 10, h: 3, from: 0.8, sweep: 1.6 }, fov: 40 },
        who: 'DUTCH', text: 'Make it so good they cannot afford to punish you.' },
    ],
  },

  finale: {
    id: 'finale', track: 'circus', env: 'night',
    cars: [
      { style: 'muscle', livery: 0, s: 20, t: -3, stripped: ['roof', 'bonnet', 'doorL', 'spoiler', 'mirrorL'] },
    ],
    shots: [
      { dur: 4.0, cam: { orbit: { car: 0, r: 11, h: 3.2, from: 1.4, sweep: 1.5 }, fov: 40 },
        caption: 'AFTER' },
      { dur: 5.0, cam: { s: 30, across: 9, above: 2.4, lookCar: 0, fov: 36 },
        who: 'ADJ. HALLOW', text: 'The stewards convened for eleven minutes. There were forty-one separate incidents. We have found no case to answer in any of them.' },
      { dur: 5.0, cam: { s: 60, s2: 110, across: 16, above: 7, look: 30, fov: 44 },
        who: 'ADJ. HALLOW', text: 'Ninety thousand people were on their feet. I have never in my career been so comprehensively out-voted by a noise.' },
      { dur: 4.8, cam: { orbit: { car: 0, r: 14, h: 5, from: 3.2, sweep: -1.6 }, fov: 42 },
        who: 'MARGO SALT', text: 'Champion. Ratings record. And an audience that will riot if we ever fine you again. Do you understand what you have made yourself?' },
      { dur: 4.6, cam: { s: 140, s2: 220, across: 24, above: 14, look: 44, fov: 48 },
        who: 'MARGO SALT', text: 'Untouchable. Which is a wonderful thing to be, and a terrible thing to have to stay.' },
      { dur: 4.2, cam: { s: 0, s2: 90, across: 30, above: 20, look: 60, fov: 50 },
        caption: 'FOUL PLAY\nSEASON COMPLETE' },
    ],
  },
};

// Cutscenes fire at the start of each chapter, and one more after the last race.
export function cutsceneFor(level, when = 'pre') {
  if (when === 'post') {
    return level === storyLength() ? CUTSCENES.finale : null;
  }
  if (level === 1) return CUTSCENES.intro;
  const ch = Math.ceil(level / LEVELS_PER_CHAPTER);
  if ((level - 1) % LEVELS_PER_CHAPTER === 0 && ch >= 2) return CUTSCENES['ch' + ch] || null;
  return null;
}

export function cutsceneById(id) { return CUTSCENES[id] || null; }
export const allCutscenes = () => Object.values(CUTSCENES);
