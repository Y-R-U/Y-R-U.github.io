// ---- career (4 divisions), champions cup, world cup, quick match, saves ----
import { CLUBS, NATIONS, GIANTS, DIV_NAMES, teamDef } from './teams.js';
import { SAVE_KEY } from './const.js';
import { clamp, poisson, shuffle, chance, rand, pick, mulberry32, strSeed } from './util.js';

// ---------- schedule: double round robin for 8 teams -> 14 rounds ----------
function roundRobin(n = 8) {
  const rounds = [];
  const idx = [...Array(n).keys()];
  for (let r = 0; r < n - 1; r++) {
    const rd = [];
    for (let i = 0; i < n / 2; i++) {
      const a = idx[i], b = idx[n - 1 - i];
      rd.push(r % 2 ? [b, a] : [a, b]); // [home, away]
    }
    rounds.push(rd);
    idx.splice(1, 0, idx.pop());
  }
  const back = rounds.map(rd => rd.map(([h, a]) => [a, h]));
  return [...rounds, ...back];
}

function simScore(rA, rB, homeA = 2) {
  const diff = (rA + homeA) - rB;
  const xa = clamp(1.25 + diff * 0.045, 0.15, 3.6);
  const xb = clamp(1.05 - diff * 0.04, 0.12, 3.4);
  return [poisson(xa), poisson(xb)];
}

const blankRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

// ---------- career ----------
export function newCareer(name, short, kit, badge) {
  const teams = CLUBS.map(c => ({ ...c, kit: { ...c.kit } }));
  teams[teams.length - 1] = { name, short, kit, badge, rating: 36, div: 4, user: true };
  const c = {
    v: 1, season: 1, round: 0,
    userIdx: teams.length - 1,
    teams,
    stats: teams.map(blankRow),
    fixtures: {}, rosters: {},
    trophies: [],
    lastResults: [],
    cc: null,             // champions cup state
    played: 0, wins: 0,
  };
  _buildSeason(c);
  saveCareer(c);
  return c;
}

function _buildSeason(c) {
  c.rosters = {};
  c.fixtures = {};
  for (let div = 1; div <= 4; div++) {
    const roster = c.teams.map((t, i) => t.div === div ? i : -1).filter(i => i >= 0);
    // deterministic-ish shuffle per season
    shuffle(roster, mulberry32(strSeed('szn' + c.season + 'd' + div)));
    c.rosters[div] = roster;
    c.fixtures[div] = roundRobin(8);
  }
  c.stats = c.teams.map(blankRow);
  c.round = 0;
}

export function saveCareer(c) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch (e) { /* full/blocked */ }
}
export function loadCareer() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return null;
    const c = JSON.parse(s);
    return c && c.v === 1 ? c : null;
  } catch (e) { return null; }
}
export function deleteCareer() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

export function userTeam(c) { return c.teams[c.userIdx]; }
export function userDiv(c) { return userTeam(c).div; }

// next fixture for the user this round: {oppIdx, home}
export function nextFixture(c) {
  if (c.cc) return null;
  const div = userDiv(c);
  const roster = c.rosters[div];
  const uPos = roster.indexOf(c.userIdx);
  const rd = c.fixtures[div][c.round];
  for (const [h, a] of rd) {
    if (h === uPos) return { oppIdx: roster[a], home: true, round: c.round, div };
    if (a === uPos) return { oppIdx: roster[h], home: false, round: c.round, div };
  }
  return null;
}

export function pickPitchType(div) {
  const w = div >= 4 ? { mud: 30, wet: 22, grass: 28, dry: 12, ice: 8 }
    : div === 3 ? { mud: 18, wet: 22, grass: 40, dry: 12, ice: 8 }
    : div === 2 ? { mud: 8, wet: 20, grass: 52, dry: 14, ice: 6 }
    : { mud: 2, wet: 16, grass: 62, dry: 16, ice: 4 };
  let total = 0; for (const k in w) total += w[k];
  let r = Math.random() * total;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'grass';
}

// apply user's match result, sim every other match in all divisions this round
export function reportRound(c, userGoals, oppGoals, oppIdx) {
  const div = userDiv(c);
  _applyResult(c, c.userIdx, oppIdx, userGoals, oppGoals);
  c.lastResults.push({ season: c.season, round: c.round, opp: oppIdx, ga: userGoals, gb: oppGoals });
  if (c.lastResults.length > 40) c.lastResults.shift();
  c.played++; if (userGoals > oppGoals) c.wins++;
  // user rating drifts with results
  const u = userTeam(c);
  u.rating = clamp(u.rating + (userGoals > oppGoals ? 1.4 : userGoals === oppGoals ? 0.4 : -0.5), 32, 93);

  for (let d = 1; d <= 4; d++) {
    const roster = c.rosters[d];
    for (const [h, a] of c.fixtures[d][c.round]) {
      const hi = roster[h], ai = roster[a];
      if (hi === c.userIdx || ai === c.userIdx) continue;
      const [gh, ga] = simScore(c.teams[hi].rating, c.teams[ai].rating);
      _applyResult(c, hi, ai, gh, ga);
    }
  }
  c.round++;
  const seasonOver = c.round >= 14;
  let events = null;
  if (seasonOver) events = _endSeason(c);
  saveCareer(c);
  return { seasonOver, events };
}

function _applyResult(c, hi, ai, gh, ga) {
  const H = c.stats[hi], A = c.stats[ai];
  H.p++; A.p++;
  H.gf += gh; H.ga += ga; A.gf += ga; A.ga += gh;
  if (gh > ga) { H.w++; A.l++; H.pts += 3; }
  else if (gh < ga) { A.w++; H.l++; A.pts += 3; }
  else { H.d++; A.d++; H.pts++; A.pts++; }
}

// sorted standings for a division: [{ti, row}]
export function table(c, div) {
  return c.rosters[div]
    .map(ti => ({ ti, ...c.stats[ti] }))
    .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}

function _endSeason(c) {
  const events = { season: c.season, champion: false, promoted: false, relegated: false, ccQualified: false, userPos: 0, div: userDiv(c) };
  const moves = []; // {ti, newDiv}
  for (let d = 1; d <= 4; d++) {
    const t = table(c, d);
    t.forEach((row, pos) => { if (row.ti === c.userIdx) events.userPos = pos + 1; });
    if (d === 1) {
      const champ = t[0].ti;
      if (champ === c.userIdx) {
        events.champion = true;
        events.ccQualified = true;
        c.trophies.push({ season: c.season, label: DIV_NAMES[1] + ' CHAMPIONS', icon: '🏆' });
      }
    } else if (t[0].ti === c.userIdx || t[1].ti === c.userIdx) {
      events.promoted = true;
      c.trophies.push({ season: c.season, label: DIV_NAMES[d] + (t[0].ti === c.userIdx ? ' CHAMPIONS' : ' — PROMOTED'), icon: t[0].ti === c.userIdx ? '🏆' : '🎖️' });
    }
    if (d < 4) { moves.push({ ti: t[6].ti, nd: d + 1 }, { ti: t[7].ti, nd: d + 1 }); }
    if (d > 1) { moves.push({ ti: t[0].ti, nd: d - 1 }, { ti: t[1].ti, nd: d - 1 }); }
    if (d > 1 && (t[6].ti === c.userIdx || t[7].ti === c.userIdx) && d < 4) events.relegated = true;
    if (d === 1 && (t[6].ti === c.userIdx || t[7].ti === c.userIdx)) events.relegated = true;
  }
  for (const m of moves) c.teams[m.ti].div = m.nd;
  // AI ratings drift
  for (const t of c.teams) if (!t.user) t.rating = clamp(t.rating + rand(-2, 2), 30, 95);

  c.season++;
  _buildSeason(c);
  if (events.ccQualified) {
    c.cc = { stage: 0, alive: shuffle(GIANTS.map((g, i) => i)).slice(0, 7), results: [] };
  }
  return events;
}

// ---------- champions cup (after winning div 1): QF, SF, Final vs giants ----------
export const CC_STAGES = ['QUARTER FINAL', 'SEMI FINAL', 'FINAL'];
export function ccNextMatch(c) {
  if (!c.cc) return null;
  return { gi: c.cc.alive[0], stage: c.cc.stage };
}
export function ccReport(c, won) {
  const cc = c.cc;
  const stageName = CC_STAGES[cc.stage];
  if (!won) {
    c.cc = null;
    saveCareer(c);
    return { out: true, stageName, wonCup: false };
  }
  cc.stage++;
  cc.alive.shift();
  // remaining giants knock each other out
  shuffle(cc.alive);
  cc.alive = cc.alive.slice(0, Math.max(0, [3, 1, 0][cc.stage - 1] ?? 0));
  if (cc.stage >= 3) {
    c.cc = null;
    c.trophies.push({ season: c.season, label: 'WORLD CHAMPIONS CUP', icon: '🌍' });
    saveCareer(c);
    return { out: false, stageName, wonCup: true };
  }
  saveCareer(c);
  return { out: false, stageName, wonCup: false };
}

// ---------- world cup mode (transient) ----------
export function newWorldCup(userNi) {
  const order = shuffle([...Array(NATIONS.length).keys()]);
  // ensure user's nation is in
  if (!order.includes(userNi)) order[0] = userNi;
  return {
    userNi,
    rounds: [order],       // rounds[r] = list of nation idx still in, paired [0v1, 2v3...]
    results: [],           // per round: array of {a, b, ga, gb, winner}
    stage: 0,              // 0 R16, 1 QF, 2 SF, 3 F
    done: false, won: false,
  };
}
export const WC_STAGES = ['ROUND OF 16', 'QUARTER FINAL', 'SEMI FINAL', 'FINAL'];

export function wcUserMatch(cup) {
  const cur = cup.rounds[cup.stage];
  for (let i = 0; i < cur.length; i += 2) {
    if (cur[i] === cup.userNi || cur[i + 1] === cup.userNi) {
      const opp = cur[i] === cup.userNi ? cur[i + 1] : cur[i];
      return { oppNi: opp, stage: cup.stage };
    }
  }
  return null;
}

// user result known; sim rest of round
export function wcReport(cup, userWon, userGa = 0, userGb = 0, pens = null) {
  const cur = cup.rounds[cup.stage];
  const next = [];
  const res = [];
  for (let i = 0; i < cur.length; i += 2) {
    const a = cur[i], b = cur[i + 1];
    let winner;
    if (a === cup.userNi || b === cup.userNi) {
      winner = userWon ? cup.userNi : (a === cup.userNi ? b : a);
      const mine = a === cup.userNi;
      res.push({ a, b, ga: mine ? userGa : userGb, gb: mine ? userGb : userGa, winner, pens });
      if (!userWon) cup.done = true;
    } else {
      const [ga, gb] = simScore(NATIONS[a].rating, NATIONS[b].rating, 0);
      winner = ga > gb ? a : gb > ga ? b : (chance(0.5) ? a : b);
      res.push({ a, b, ga, gb, winner });
    }
    next.push(winner);
  }
  cup.results.push(res);
  cup.stage++;
  cup.rounds.push(next);
  if (next.length === 1) {
    cup.done = true;
    cup.won = next[0] === cup.userNi;
  }
  return cup;
}

// ---------- quick match team catalogue ----------
export function catalogue(career) {
  const groups = [];
  if (career) groups.push({ label: 'My Club', teams: [{ ...userTeam(career), user: true }] });
  for (let d = 1; d <= 4; d++) {
    groups.push({ label: DIV_NAMES[d], teams: CLUBS.filter(t => t.div === d) });
  }
  groups.push({ label: 'Nations', teams: NATIONS });
  groups.push({ label: 'World Giants', teams: GIANTS });
  return groups;
}

export { teamDef, DIV_NAMES };
