// Bot ladder (DECISIONS D9 / D20): a field of ~200 generated rivals plus the
// player, points for every bot game scaled heavily by bot strength.
//
// The field is generated from a seed stored in gambit.ladder, so it is stable
// per account and travels with cloud sync. Rival scores grow a little each day
// (pure function of days since creation) so the ladder feels alive without any
// stored per-rival state.

import { getLadder, setLadder, getStats, setStats } from './store.js';

// ---------- D20 points ----------
// win  = 40 × clamp(2^((botElo − ladderElo)/200), 0.1, 64)
// draw = 25 × same multiplier
// loss = 10 × min(3, 1 + diff/400) vs stronger bots, 10 × max(0.1, 2^(diff/200)) vs weaker
//        (so a loss never pays more than a win against the same bot)
// assisted (any takeback or hint used) = × 0.5, and never counts as a "best win".
export function pointsFor(result, botElo, ladderElo, assisted = false) {
  const diff = botElo - ladderElo;
  let pts;
  if (result === 'win' || result === 'draw') {
    const mult = Math.min(64, Math.max(0.1, Math.pow(2, diff / 200)));
    pts = (result === 'win' ? 40 : 25) * mult;
  } else {
    // a little extra vs much stronger bots (×3 cap), and decaying vs weaker ones so a
    // loss never out-earns a win against the same bot
    pts = 10 * (diff >= 0 ? Math.min(3, 1 + diff / 400) : Math.max(0.1, Math.pow(2, diff / 200)));
  }
  if (assisted) pts *= 0.5;
  return Math.max(1, Math.round(pts));
}

// Ladder Elo: a standard Elo update against the bot's listed Elo. K is high for
// the first games so a new player finds their level quickly.
export function eloAfter(elo, botElo, score, games, assisted) {
  const k = (games < 10 ? 48 : games < 40 ? 32 : 20) * (assisted ? 0.5 : 1);
  const expected = 1 / (1 + Math.pow(10, (botElo - elo) / 400));
  return Math.round(Math.max(100, elo + k * (score - expected)));
}

// ---------- generated field ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PUNS = [
  'SirCastlesALot', 'KnightOwl', 'PawnStarr', 'Rook_and_Roll', 'CheckYoSelf', 'EnPassantLover',
  'BongCloudBandit', 'Mate_in_Won', 'DrZugzwang', 'FlyingFianchetto', 'HangingPawns', 'BlunderBuss',
  'ForkLift9000', 'StalemateSteve', 'TheBishopOfBanter', 'QueenSacQueen', 'Caro_Can', 'NajdorfNacho',
  'LondonSystemFan', 'KingsIndianSummer', 'Tempo_Tantrum', 'ThePinIsMightier', 'Smothered_Mate',
  'GrandmasterFlash', 'NoMoreTheory', 'Pawnderous', 'Checkmatey', 'CastleCrasher', 'BackRankBetty',
  'DoubledPawnDave', 'Opposition_Olga', 'Rookie_Mistake', 'KnightmareFuel', 'BishopBashful',
  'Zwischenzug_Zed', 'TheHorseWhisperer', 'Triangulator', 'Underpromotion', 'Desperado_Dan',
  'LuftLiz', 'Windmill_Will', 'PoisonedPawnPete', 'Fried_Liver_Fran', 'Scholars_Mate', 'TheDragon_Rawr',
];
const LEFT = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King', 'Castle', 'Gambit', 'Blitz', 'Fork',
  'Tempo', 'Endgame', 'Sicilian', 'Fianchetto', 'Check', 'Bullet', 'Rapid', 'Bongcloud', 'Outpost', 'Skewer',
  'Battery', 'Discovery', 'Lucena', 'Philidor', 'Berlin', 'Grünfeld', 'Catalan', 'Dutch', 'Pirc', 'Benko'];
const RIGHT = ['Star', 'Slayer', 'Wizard', 'Monkey', 'Ninja', 'Panda', 'Goblin', 'Baron', 'Muncher',
  'Whisperer', 'Hustler', 'Prophet', 'Enjoyer', 'Gremlin', 'Tornado', 'Pilot', 'Duke', 'Viking', 'Otter',
  'Bard', 'Ghost', 'Falcon', 'Moose', 'Badger', 'Sage', 'Wolf', 'Llama', 'Comet', 'Kraken', 'Cat'];
const FLAGS = ['🇬🇧', '🇺🇸', '🇮🇳', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇳🇱', '🇳🇴', '🇸🇪', '🇵🇱', '🇺🇦', '🇧🇷',
  '🇦🇷', '🇨🇦', '🇦🇺', '🇯🇵', '🇰🇷', '🇨🇳', '🇳🇬', '🇿🇦', '🇲🇽', '🇹🇷', '🇮🇪', '🇵🇭', '🇻🇳', '🇮🇷', '🇪🇬'];
const LEGENDS = [1_048_576, 640_250, 382_900, 211_040, 120_777];
const FIELD_SIZE = 200;

function ensureSeed() {
  const lad = getLadder();
  if (!lad.seed) {
    lad.seed = (Math.random() * 2 ** 31) | 0 || 1;
    lad.createdAt = Date.now();
    setLadder(lad);
  }
  return lad;
}

let fieldCache = null;
function baseField(seed) {
  if (fieldCache && fieldCache.seed === seed) return fieldCache.list;
  const rnd = mulberry32(seed);
  const gauss = () => {
    const u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const used = new Set();
  const puns = PUNS.slice();
  const list = [];
  for (let i = 0; i < FIELD_SIZE; i++) {
    let name;
    for (let tries = 0; tries < 20; tries++) {
      if (puns.length && rnd() < 0.3) name = puns.splice((rnd() * puns.length) | 0, 1)[0];
      else {
        name = LEFT[(rnd() * LEFT.length) | 0] + RIGHT[(rnd() * RIGHT.length) | 0];
        if (rnd() < 0.55) name += (rnd() < 0.5 ? '_' : '') + ((rnd() * (rnd() < 0.5 ? 99 : 2026)) | 0);
      }
      if (!used.has(name)) break;
    }
    used.add(name);
    // legends at the top, a band of newcomers at the bottom (so the first few
    // wins visibly climb), a lognormal body in between
    const base = i < LEGENDS.length ? LEGENDS[i] * (0.9 + rnd() * 0.2)
      : i >= FIELD_SIZE - 30 ? 2 + Math.pow(rnd(), 1.6) * 90
      : Math.max(4, Math.exp(Math.log(900) + 1.5 * gauss()));
    // growth per day: most drift up slowly, a few are dormant, a few are grinders
    const r = rnd();
    const growth = r < 0.15 ? 0 : r < 0.9 ? 0.001 + rnd() * 0.004 : 0.008 + rnd() * 0.012;
    list.push({
      id: 'r' + i, name, flag: FLAGS[(rnd() * FLAGS.length) | 0], base, growth,
      hue: (rnd() * 360) | 0, elo: 0,
    });
  }
  fieldCache = { seed, list };
  return list;
}

// Score a rival shows today. Bounded so a field left alone for a year doesn't run away.
function rivalScore(r, days) { return Math.round(r.base * (1 + Math.min(2, r.growth * days))); }

// Full sorted standings including the player: [{rank, name, flag, score, hue, you}]
export function standings(playerName = 'You') {
  const lad = ensureSeed();
  const days = Math.max(0, (Date.now() - (lad.createdAt || Date.now())) / 86400000);
  const rows = baseField(lad.seed).map(r => ({ id: r.id, name: r.name, flag: r.flag, hue: r.hue, score: rivalScore(r, days) }));
  rows.push({ id: 'you', name: playerName, flag: '', hue: 32, score: lad.points, you: true });
  // ties: the player sits above rivals on an equal score (they earned it most recently)
  rows.sort((a, b) => b.score - a.score || (b.you ? 1 : 0) - (a.you ? 1 : 0));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function playerRank() {
  const rows = standings();
  const i = rows.findIndex(r => r.you);
  return { rank: i + 1, of: rows.length, row: rows[i], next: i > 0 ? rows[i - 1] : null };
}

// ---------- recording a finished bot game ----------
// result: 'win' | 'draw' | 'loss' (from the player's side)
export function recordGame({ bot, result, assisted, reason, tc, color, moves }) {
  const lad = ensureSeed();
  const before = playerRank();
  const pts = pointsFor(result, bot.elo, lad.elo, assisted);
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const eloBefore = lad.elo;
  lad.points += pts;
  lad.elo = eloAfter(lad.elo, bot.elo, score, lad.games, assisted);
  lad.games += 1;
  setLadder(lad);

  const st = getStats();
  st.games += 1;
  const k = result === 'win' ? 'w' : result === 'draw' ? 'd' : 'l';
  st[k] += 1;
  const pb = st.perBot[bot.id] || { w: 0, d: 0, l: 0 };
  pb[k] += 1;
  st.perBot[bot.id] = pb;
  let newBest = false;
  if (result === 'win' && !assisted && (!st.bestWin || bot.elo > st.bestWin.elo)) {
    st.bestWin = { botId: bot.id, name: bot.name, elo: bot.elo, at: Date.now() };
    newBest = true;
  }
  st.recent = [{ botId: bot.id, name: bot.name, elo: bot.elo, result, reason, pts, tc, color, moves, assisted: !!assisted, at: Date.now() },
    ...(st.recent || [])].slice(0, 30);
  setStats(st);

  const after = playerRank();
  return { pts, eloBefore, eloAfter: lad.elo, rankBefore: before.rank, rankAfter: after.rank, of: after.of, next: after.next, newBest, total: lad.points };
}

// Points preview used on the bot cards ("Win: +320").
export function previewPoints(botElo) {
  const lad = getLadder();
  return { win: pointsFor('win', botElo, lad.elo), draw: pointsFor('draw', botElo, lad.elo), loss: pointsFor('loss', botElo, lad.elo) };
}
