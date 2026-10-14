// Special-events engine gate: points, UTC windows, seeded dice + boards, THE REPLAY RULE,
// rival selection, the reveal grid and the events save (dailies rule, merge).
//
//   node tools/eventsgate.mjs              run every check against js/events/
//   node tools/eventsgate.mjs --falsify    break the engine 43 ways; each must turn its section red
//
// EVENTS_DIR points the gate at another copy of js/events (the falsifier uses it).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../js/events');
const DIR = process.env.EVENTS_DIR || SRC;
const imp = (f) => import(pathToFileURL(join(DIR, f)).href);
const args = process.argv.slice(2);

const PROBES = [
  '2026-10-13T00:00:00.000Z', '2026-10-13T23:59:59.999Z', '2026-10-14T00:00:00.000Z',
  '2026-10-18T23:59:59.000Z', '2026-10-19T00:00:00.000Z', '2026-10-31T23:59:59.000Z',
  '2026-11-01T00:00:00.000Z', '2026-10-23T23:59:59.000Z', '2026-10-24T00:00:00.000Z',
  '2026-12-31T12:00:00.000Z', '2027-01-01T03:00:00.000Z', '2027-01-04T00:00:00.000Z',
  '2024-12-30T00:00:00.000Z', '2026-03-29T01:30:00.000Z',
];

if (args.includes('--tzprobe')) {
  const cal = await imp('calendar.js');
  const out = PROBES.map((p) => {
    const ms = Date.parse(p);
    return cal.EVENT_DEFS.map((d) => { const w = cal.windowOf(d, ms); return w ? `${w.key}@${w.start}-${w.end}` : '-'; }).join(' ');
  });
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

if (args.includes('--falsify')) {
  const MUTANTS = [
    ['points', 'points.js', 'b.oppDmg > 0.5', 'b.oppDmg >= 0.5'],
    ['points', 'points.js', 'b.at < win.end', 'b.at <= win.end'],
    ['windows', 'calendar.js', 'const start = Date.UTC(y, m, d.getUTCDate());', 'const start = Date.UTC(y, m, d.getDate());'],
    ['windows', 'calendar.js', '(new Date(day).getUTCDay() + 6) % 7', 'new Date(day).getUTCDay()'],
    ['dice', 'hash.js', "1 + (hash32(`die|${uid}|${eventId}|${turn}`) % 6)", '1 + Math.floor(Math.random() * 6)'],
    ['dice', 'hash.js', '0x01000193', '0x01000197'],
    ['board', 'vines.js', '|| Math.abs(col(a) - col(b)) > 3', ''],
    ['replay', 'vines.js', 'Math.min(rivalTurns, myTurns)', 'rivalTurns'],
    ['replay', 'vines.js', 'rolls >= rollsBanked(points)', 'rolls > rollsBanked(points)'],
    ['replay', 'vines.js', "positionAtTurn(board, rival.uid, eventId, rival.points, t)", "positionAfterRolls(board, rival.uid, eventId, t)"],
    ['replay', 'vines.js', "return ends.filter((e) => e <= last).length;", "return last;"],
    ['points', 'points.js', '>= cap.perDay', '>= cap.perDay + 5'],
    ['points', 'points.js', 'b.at - lastCamp < cap.gapMs', 'false'],
    ['save', 'state.js', "if (battle.src === 'campaign' && !campaignAllowed(cur.b, battle, cap)) continue;", ''],
    ['save', 'state.js', '].sort(order), cap) };', '], cap) };'],
    ['save', 'state.js', 'return rows.filter((r) => keep.has(r[0]));', 'return rows;'],
    ['save', 'state.js', "e.claimed = e.claimed.filter((r) => !INK_CLAIMS.includes(r) || had.includes(r));", ''],
    ['paid', 'calendar.js', 'export const PAID_CAP = { perDay: Infinity, gapMs: 15000 };', 'export const PAID_CAP = { perDay: 10, gapMs: 15000 };'],
    ['paid', 'calendar.js', 'export const PAID_CAP = { perDay: Infinity, gapMs: 15000 };', 'export const PAID_CAP = { perDay: Infinity, gapMs: 0 };'],
    ['paid', 'calendar.js', '(paid ? PAID_CAP : CAMPAIGN_CAP)', '(CAMPAIGN_CAP)'],
    ['paid', 'state.js', 'out = merge(local, cloud, { cap });', 'out = merge(local, cloud);'],
    ['tower', 'tower.js', '      else floor++;', '      floor++;'],
    ['tower', 'tower.js', 'else floor = Math.max(1, floor - 1);', 'else floor = floor - 1;'],
    ['tower', 'tower.js', 'else floor = Math.max(1, floor - 1);', ''],
    ['tower', 'tower.js', 'if (floor === FLOORS) tops++;', 'if (floor === FLOORS - 1) tops++;'],
    ['tower', 'tower.js', 'at - last < cap.gapMs', 'false'],
    ['tower', 'tower.js', "!(st.claimed || []).includes(r.id)", 'true'],
    ['tower', 'points.js', "def.kind !== 'tower' && ", ''],
    ['story', 'story.js', 'left >= story.chapters[ch].circles', 'left > story.chapters[ch].circles'],
    ['story', 'story.js', '(((y * 12 + (m - 1)) % STORIES.length)', '((0 % STORIES.length)'],
    ['story', 'state.js', 'm.read = Math.max(x.read | 0, y.read | 0);', 'm.read = x.read | 0;'],
    ['retired', 'state.js', "if (parseEventId(id) && e && typeof e === 'object') ev[id] = e;", "if (e && typeof e === 'object') ev[id] = e;"],
    ['windows', 'calendar.js', "{ id: 'tower', kind: 'tower', cadence: 'weekly', pass: true,", "{ id: 'tower', kind: 'tower', cadence: 'weekly', pass: false,"],
    ['reveal', 'reveal.js', "!!art && (st.b?.length || 0) > 0 && guessesLeft(st) > 0", 'guessesLeft(st) > 0'],
    ['reveal', 'reveal.js', '(st.b?.length || 0) > 0 && ', ''],
    ['reveal', 'reveal.js', 'if (st.open.length >= CELLS || st.open.includes(cell))', 'if (complete(st) || st.open.includes(cell))'],
    ['rivals', 'vines.js', '[...fr, ...rest]', '[...rest, ...fr]'],
    ['reveal', 'reveal.js', 'left(def, st, pts) < def.cost', 'left(def, st, pts) < 0'],
    ['reveal', 'reveal.js', '1 + Math.floor(st.open.length / 5)', '1 + st.open.length'],
    ['reveal', 'reveal.js', '(CELLS - st.open.length) * def.guessBonus', 'CELLS * def.guessBonus'],
    ['save', 'state.js', 'state.seenDay >= day', 'state.seenDay === day'],
    ['save', 'state.js', 'm.open = open.slice(0, cap);', 'm.open = open;'],
    ['save', 'state.js', 'activeEvents(battle.at, { pass: true })', 'activeEvents(battle.at, { pass: false }).filter((a) => !a.locked)'],
  ];
  let bad = 0;
  for (const [section, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'evgate-'));
    cpSync(SRC, tmp, { recursive: true });
    const src = readFileSync(join(tmp, file), 'utf8');
    if (!src.includes(from)) { console.log(`STALE mutant [${section}] ${file}: "${from}" not found`); bad++; continue; }
    writeFileSync(join(tmp, file), src.replace(from, to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, EVENTS_DIR: tmp }, encoding: 'utf8' });
    rmSync(tmp, { recursive: true, force: true });
    const red = r.status !== 0 && r.stdout.includes(`FAIL [${section}]`);
    if (!red) bad++;
    console.log(`${red ? 'red  ' : 'GREEN'} [${section}] ${file}: ${from}  ->  ${to}`);
  }
  console.log(bad ? `\n${bad} mutant(s) survived — the gate does not check what it claims` : '\nevery mutant turned its section red');
  process.exit(bad ? 1 : 0);
}

const hash = await imp('hash.js');
const cal = await imp('calendar.js');
const pts = await imp('points.js');
const V = await imp('vines.js');
const R = await imp('reveal.js');
const S = await imp('state.js');

let fails = 0, passes = 0;
const check = (section, ok, msg) => {
  if (ok) passes++; else { fails++; console.log(`FAIL [${section}] ${msg}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T = (iso) => Date.parse(iso);

// ---------- points ----------
{
  const P = (won, oppDmg) => pts.pointsFor({ won, oppDmg });
  check('points', P(true, 0) === 3 && P(true, 1) === 3, 'a win is 3 whatever the damage');
  check('points', P(false, 0) === 1 && P(false, 0.3) === 1, 'a plain loss is 1');
  check('points', P(false, 0.5) === 1, 'exactly 50% damage is NOT "more than 50%"');
  check('points', P(false, 0.51) === 2 && P(false, 0.99) === 2, 'a loss with the opponent >50% damaged is 2');
  const def = cal.defById('vines-day'), arenaOnly = { id: 'arena-only', kind: 'vines', cadence: 'monthly', anyBattle: false };
  const win = cal.windowOf(def, T('2026-10-13T12:00:00Z'));
  const mwin = cal.windowOf(arenaOnly, T('2026-10-13T12:00:00Z'));
  const bs = [
    { id: 'a1', at: win.start, src: 'arena', won: true, oppDmg: 1 },
    { id: 'a1', at: win.start, src: 'arena', won: true, oppDmg: 1 },
    { id: 'c1', at: win.start + 5000, src: 'campaign', won: false, oppDmg: 0.7 },
    { id: 'late', at: win.end, src: 'arena', won: true, oppDmg: 1 },
    { id: 'early', at: win.start - 1, src: 'arena', won: true, oppDmg: 1 },
  ];
  check('points', pts.pointsIn(def, win, bs) === 5, `any-battle daily: win + campaign 2 = 5, got ${pts.pointsIn(def, win, bs)}`);
  check('points', pts.pointsIn(arenaOnly, mwin, bs) === 9,
    `arena-only monthly ignores the campaign fight, got ${pts.pointsIn(arenaOnly, mwin, bs)}`);
  check('points', !pts.counts(def, win, bs[3]) && pts.counts(def, win, bs[0]), 'the window is [start, end)');
  check('points', cal.CAMPAIGN_CAP.perDay === 10 && cal.CAMPAIGN_CAP.gapMs === 60000, 'campaign cap is 10 a UTC day, 60 s apart');
  const camp = (i, at) => ({ id: `c${i}`, at, src: 'campaign', won: true, oppDmg: 1 });
  const flood = Array.from({ length: 14 }, (_, i) => camp(i, win.start + i * 61e3));
  check('points', pts.counted(def, win, flood).length === 10, `14 campaign wins a minute apart: 10 count, got ${pts.counted(def, win, flood).length}`);
  const quick = [camp('q1', win.start), camp('q2', win.start + 30e3), camp('q3', win.start + 61e3)];
  check('points', pts.counted(def, win, quick).map((b) => b.id).join() === 'cq1,cq3', 'a campaign fight under 60 s after the last counted one does not count');
  const mixed = [{ id: 'z', at: win.start + 9e3, src: 'arena', won: false, oppDmg: 0 }, { id: 'y', at: win.start + 1e3, src: 'arena', won: true, oppDmg: 1 }];
  check('points', pts.counted(def, win, mixed).map((b) => b.pts).join() === '3,1', 'counted battles come back in play order');
}

// ---------- windows (UTC, in every timezone) ----------
{
  const expect = {
    '2026-10-13T23:59:59.999Z': ['2026-10-13', '2026-W42', '2026-10'],
    '2026-10-14T00:00:00.000Z': ['2026-10-14', '2026-W42', '2026-10'],
    '2026-10-18T23:59:59.000Z': ['2026-10-18', '2026-W42', '2026-10'],
    '2026-10-19T00:00:00.000Z': ['2026-10-19', '2026-W43', '2026-10'],
    '2026-10-31T23:59:59.000Z': ['2026-10-31', '2026-W44', '2026-10'],
    '2026-11-01T00:00:00.000Z': ['2026-11-01', '2026-W44', '2026-11'],
    '2026-12-31T12:00:00.000Z': ['2026-12-31', '2026-W53', '2026-12'],
    '2027-01-01T03:00:00.000Z': ['2027-01-01', '2026-W53', '2027-01'],
    '2027-01-04T00:00:00.000Z': ['2027-01-04', '2027-W01', '2027-01'],
    '2024-12-30T00:00:00.000Z': ['2024-12-30', '2025-W01', '2024-12'],
  };
  const D = cal.defById('vines-day'), W = cal.defById('reveal-week'), M = cal.defById('story'), H = cal.defById('halloween');
  for (const [iso, keys] of Object.entries(expect)) {
    const got = [D, W, M].map((d) => cal.windowOf(d, T(iso)).key);
    check('windows', eq(got, keys), `${iso}: expected ${keys}, got ${got}`);
  }
  const wk = cal.windowOf(W, T('2026-10-13T08:00:00Z'));
  check('windows', wk.start === T('2026-10-12T00:00:00Z') && wk.end === T('2026-10-19T00:00:00Z'), 'week runs Monday 00:00Z to Monday 00:00Z');
  const mo = cal.windowOf(M, T('2026-02-10T00:00:00Z'));
  check('windows', mo.start === T('2026-02-01T00:00:00Z') && mo.end === T('2026-03-01T00:00:00Z'), 'February window');
  check('windows', cal.windowOf(H, T('2026-10-23T23:59:59Z')) === null, 'Halloween not open on Oct 23');
  check('windows', cal.windowOf(H, T('2026-10-24T00:00:00Z'))?.key === '2026', 'Halloween opens Oct 24 00:00Z');
  check('windows', cal.windowOf(H, T('2026-11-01T00:00:00Z')) === null, 'Halloween closes Nov 1 00:00Z');
  for (const iso of Object.keys(expect)) for (const d of [D, W, M]) {
    const w = cal.windowOf(d, T(iso)), id = cal.eventIdOf(d, w), back = cal.parseEventId(id);
    check('windows', back && back.def === d && eq(back.win, w), `parseEventId round trip ${id}`);
  }
  check('windows', cal.parseEventId('vines-day:2026-13-45') === null && cal.parseEventId('nope:2026') === null, 'bad ids parse to null');
  const act = cal.activeEvents(T('2026-10-25T10:00:00Z'), { pass: false });
  check('windows', act.length === 5 && act.filter((a) => a.locked).map((a) => a.def.id).join() === 'tower,story,halloween',
    'daily + weekly free; THE TOWER, STORY and the seasonal event need the Pass');
  check('windows', cal.activeEvents(T('2026-10-25T10:00:00Z'), { pass: true }).every((a) => !a.locked), 'a Pass holder sees nothing locked');
  const zones = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Lord_Howe'];
  const runs = zones.map((tz) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--tzprobe'],
    { env: { ...process.env, TZ: tz, EVENTS_DIR: DIR }, encoding: 'utf8' }).stdout);
  for (let i = 1; i < zones.length; i++) check('windows', runs[i] === runs[0] && runs[0].length > 10, `windows differ in TZ=${zones[i]}`);
}

// ---------- dice ----------
{
  const EV = 'vines-day:2026-10-13';
  const seq = Array.from({ length: 20 }, (_, t) => hash.die('uid-aaron', EV, t)).join('');
  check('dice', seq === '21533222666143346156', `golden dice vector changed: ${seq}`);
  check('dice', hash.hash32('') === 2872998923 && hash.hash32('ragdojo') === 2596282342, 'golden hash32 vector changed');
  const again = Array.from({ length: 20 }, (_, t) => hash.die('uid-aaron', EV, t)).join('');
  check('dice', again === seq, 'the same account + event + turn must roll the same face');
  const other = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import(${JSON.stringify(pathToFileURL(join(DIR, 'hash.js')).href)}).then(h=>process.stdout.write(Array.from({length:20},(_,t)=>h.die('uid-aaron','${EV}',t)).join('')))`],
  { encoding: 'utf8' }).stdout;
  check('dice', other === seq, `a fresh process rolls differently: ${other}`);
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (let u = 0; u < 600; u++) for (let t = 0; t < 100; t++) n[hash.die(`u${u}`, EV, t)]++;
  for (let f = 1; f <= 6; f++) check('dice', Math.abs(n[f] / 60000 - 1 / 6) < 0.006, `face ${f} is ${(n[f] / 600).toFixed(2)}%`);
  check('dice', n[0] === 0 && n.reduce((a, b) => a + b) === 60000, 'faces are 1..6');
  const s2 = Array.from({ length: 20 }, (_, t) => hash.die('uid-aaron', 'vines-day:2026-10-14', t)).join('');
  const s3 = Array.from({ length: 20 }, (_, t) => hash.die('uid-aaro', EV, t)).join('');
  check('dice', s2 !== seq && s3 !== seq, 'another day or account rolls a different sequence');
}

// ---------- board ----------
{
  const b = V.makeBoard('vines-day:2026-10-13');
  check('board', eq(b.ladders, [[57, 83], [48, 56], [42, 63], [19, 39], [32, 51], [12, 33], [84, 99], [14, 28]])
    && eq(b.vines, [[55, 27], [68, 54], [50, 29], [60, 41], [85, 75], [25, 2], [98, 66], [91, 70]]), 'golden board changed');
  let bad = 0;
  for (let i = 0; i < 500; i++) {
    const bb = V.makeBoard(`vines-day:x${i}`);
    const ends = [...bb.ladders, ...bb.vines].flat();
    const row = (s) => Math.floor((s - 1) / 10);
    const col = (s) => (row(s) % 2 ? 9 - (s - 1) % 10 : (s - 1) % 10);
    if (bb.ladders.length !== 8 || bb.vines.length !== 8) bad++;
    else if (new Set(ends).size !== ends.length || ends.includes(1) || ends.includes(100)) bad++;
    else if (bb.ladders.some(([a, c]) => c <= a || row(a) === row(c)) || bb.vines.some(([a, c]) => c >= a || row(a) === row(c))) bad++;
    else if ([...bb.ladders, ...bb.vines].some(([a, c]) => Math.abs(col(a) - col(c)) > 3)) bad++;
  }
  check('board', bad === 0, `${bad}/500 boards break the layout rules`);
  const m = V.move({ link: {} }, 98, 4);
  check('board', m.to === 98 && m.bounced && eq(m.path, [99, 100, 99, 98]), 'overshooting 100 bounces back');
  const l = V.move({ link: { 5: 40 } }, 1, 4);
  check('board', l.to === 40 && l.link.kind === 'ladder', 'a ladder takes you up');
}

// ---------- THE REPLAY RULE (Aaron's example: a TURN is a BATTLE) ----------
{
  const def = cal.defById('vines-day');
  const t0 = T('2026-10-13T09:00:00Z');
  const win = cal.windowOf(def, t0), EV = cal.eventIdOf(def, win), board = V.makeBoard(EV);
  const battles = [
    { id: 'm1', at: t0, src: 'arena', won: false, oppDmg: 0.2 },
    { id: 'm2', at: t0 + 60e3, src: 'arena', won: true, oppDmg: 1 },
    { id: 'm3', at: t0 + 120e3, src: 'campaign', won: false, oppDmg: 0.8 },
  ];
  const mine = pts.counted(def, win, battles).map((b) => b.pts);
  check('replay', eq(mine, [1, 3, 2]), `the three battles are worth 1, 3, 2 in play order, got ${mine}`);
  check('replay', V.rollsBanked(mine) === 6, 'no free starting roll: 6 rolls banked');
  check('replay', eq(V.turnEnds(mine), [1, 4, 6]), 'turn ends land after roll 1, roll 4 and roll 6');

  // Rivals whose own battle points differ from mine; each has rolled everything banked.
  const rv = (uid, points) => ({ uid, points, rolls: V.rollsBanked(points) });
  const ann = rv('ann', [3, 3]), bo = rv('bo', [2, 1, 3, 1]), cy = rv('cy', [1, 1, 2]);
  let rolls = 0, ends = [];
  const seenAt = [];
  for (let i = 0; i < 10; i++) {
    const r = V.takeRoll(board, 'me', EV, mine, rolls);
    if (!r.move) break;
    rolls = r.rolls;
    if (r.turnEnded) ends.push(rolls);
    const myTurns = V.turnsDone(board, 'me', EV, mine, rolls);
    seenAt.push([ann, bo, cy].map((x) => V.rivalView(board, EV, x, myTurns).shownTurns).join(''));
  }
  check('replay', rolls === 6 && eq(ends, [1, 4, 6]), `turns end after rolls ${ends}, want 1,4,6`);
  check('replay', eq(seenAt, ['111', '111', '111', '222', '222', '233']),
    `rivals move only at my turn ends (ann/bo/cy shown turns per roll): ${seenAt}`);
  check('replay', V.takeRoll(board, 'me', EV, mine, 6).move === null, 'no 7th roll without a 4th battle');
  check('replay', V.rollsLeftInTurn(board, 'me', EV, mine, 2) === 2 && V.rollsLeftInTurn(board, 'me', EV, mine, 4) === 2 && V.rollsLeftInTurn(board, 'me', EV, mine, 6) === 0,
    'rolls left: 2 after roll 2, the next batch (2) after roll 4, 0 once all are rolled');

  // A rival's turn-k position is the end of THEIR k-th batch, with their own dice.
  const v = V.rivalView(board, EV, bo, 3);
  check('replay', v.shownTurns === 3 && v.pos === V.positionAfterRolls(board, 'bo', EV, 2 + 1 + 3).pos,
    'bo at turn 3 = after his 2+1+3 rolls, not after 3 rolls');
  const at3 = V.positionAfterRolls(board, 'bo', EV, 3).pos, at6 = V.positionAfterRolls(board, 'bo', EV, 6).pos;
  check('replay', at3 !== at6, 'the example board must tell roll 3 from roll 6 for bo');

  // Leave at turn 7 while others have at most 4; they play on; still shown at 7 until I play more.
  const seven = [1, 3, 2, 1, 2, 3, 1];
  const me7 = rv('me', seven);
  const myT = V.turnsOf(board, EV, me7);
  check('replay', myT === 7, `I leave at turn 7, got ${myT}`);
  const early = [rv('ann', [3, 3, 1, 2]), rv('bo', [2, 1]), rv('cy', [1, 1, 2, 3])];
  for (const r of early) {
    const vv = V.rivalView(board, EV, r, myT);
    check('replay', vv.shownTurns === r.points.length, `${r.uid} has only played ${r.points.length}: shown at their own last turn`);
  }
  const later = early.map((r) => rv(r.uid, [...r.points, 3, 1, 2, 2, 1, 3, 2, 1]));
  for (const r of later) {
    const vv = V.rivalView(board, EV, r, myT);
    const want = V.positionAtTurn(board, r.uid, EV, r.points, 7).pos;
    check('replay', vv.shownTurns === 7 && vv.pos === want,
      `${r.uid} played on to ${r.points.length} turns; I (still at 7) see them at their turn 7, got ${vv.shownTurns}`);
  }
  check('replay', later.some((r) => V.positionAtTurn(board, r.uid, EV, r.points, 7).pos !== V.positionAtTurn(board, r.uid, EV, r.points, 12).pos),
    'the example must actually tell turn 7 from turn 12');
  const me8 = { uid: 'me', points: [...seven, 3], rolls: 13 + 2 };
  check('replay', V.turnsOf(board, EV, me8) === 7 && later.every((r) => V.rivalView(board, EV, r, 7).shownTurns === 7),
    'two rolls into my 8th battle: nobody moves yet');
  me8.rolls = 16;
  const t8 = V.turnsOf(board, EV, me8);
  check('replay', t8 === 8 && later.every((r) => V.rivalView(board, EV, r, t8).shownTurns === 8), 'my 8th turn ends: everyone moves to their turn 8');
}

// ---------- rivals ----------
{
  const EV = 'vines-day:2026-10-13', board = V.makeBoard(EV);
  const pool = Array.from({ length: 24 }, (_, i) => {
    const points = i % 4 === 3 ? [] : Array.from({ length: 2 + (i * 7) % 9 }, (_, k) => 1 + ((i + k) % 3));
    return { uid: `r${String(i).padStart(2, '0')}`, points, rolls: points.reduce((a, b) => a + b, 0) };
  });
  const me = { uid: 'me', points: [3, 1, 2, 3, 1], rolls: 10 };
  pool.push(me);
  const friends = new Set(['r01', 'r10', 'r21', 'r03']);
  const sel = V.selectRivals(board, EV, pool, me, { friends });
  const mine = V.positionAfterRolls(board, 'me', EV, 10).pos;
  check('rivals', sel.length === 10, `10 rivals, got ${sel.length}`);
  check('rivals', sel.slice(0, 3).every((r) => r.friend) && !sel.slice(3).some((r) => r.friend),
    `friends first (r03 never played): ${sel.map((r) => r.uid)}`);
  check('rivals', !sel.some((r) => r.uid === 'me' || r.turns === 0), 'never yourself, never a player with no turns');
  const d = sel.slice(3).map((r) => Math.abs(r.pos - mine));
  check('rivals', d.every((x, i) => i === 0 || x >= d[i - 1]), `the rest sorted nearest first: ${d}`);
  check('rivals', sel.every((r) => r.shownTurns <= 5), 'rival selection uses replay-rule positions');
}

// ---------- reveal ----------
{
  const def = cal.defById('reveal-week');
  let st = R.fresh();
  for (let c = 0; c < 5; c++) {
    const r = R.uncover(def, st, 5, c * 3);
    check('reveal', r.ok, `square ${c * 3} opens with points left`);
    st = r.st;
  }
  check('reveal', R.uncover(def, st, 5, 1).why === 'points', 'a sixth square needs a sixth point');
  check('reveal', R.uncover(def, st, 6, 0).why === 'open', 'an open square cannot be bought twice');
  check('reveal', R.uncover(def, st, 99, 25).why === 'cell' && R.uncover(def, st, 99, -1).why === 'cell', 'cells are 0..24');
  check('reveal', R.uncover({ ...def, cost: 2 }, R.fresh(), 1, 0).why === 'points', 'cost 2 needs 2 points');
  check('reveal', R.guessesLeft(R.fresh()) === 1 && R.guessesLeft(st) === 2, 'one guess, plus one per five squares');
  const pic = 'art';
  check('reveal', !('PICTURES' in R) && !('choicesFor' in R) && !/answer\s*:/.test(readFileSync(join(DIR, 'reveal.js'), 'utf8')), 'no answers ship in the engine');
  check('reveal', !R.canGuess(st, false), 'the practice picture (no art) takes no guesses');
  check('reveal', !R.canGuess(st, true) && R.guess(def, st, 'A TEA PARTY', true).ok === false, 'no guess before a battle in the event');
  st = { ...st, b: [['camp:1', 1, 'campaign', 0]] };
  check('reveal', R.canGuess(st, true), 'real art + one battle: guessing opens');
  let g = R.guess(def, st, 'A TEA PARTY', false);
  check('reveal', g.ok && !g.right && R.guessesLeft(g.st) === 1 && !g.st.solved, 'a wrong guess costs a guess');
  g = R.guess(def, g.st, 'THE ANSWER', true);
  check('reveal', g.right && g.st.solved && g.st.bonus === 20 * def.guessBonus, `bonus = 20 covered x ${def.guessBonus}, got ${g.st.bonus}`);
  check('reveal', R.guess(def, g.st, 'x', true).ok === false, 'no guessing once solved');
  check('reveal', R.uncover(def, g.st, 25, 24).ok, 'a solved picture keeps opening: the whole art only comes at 25');
  const owed = R.rewardsOwed(def, g.st, pic);
  check('reveal', eq(owed.map((r) => r.kind).sort(), ['arenaBackground', 'ink']), 'a solved picture owes its bonus and its background');
  check('reveal', R.rewardsOwed(def, { ...g.st, claimed: ['bonus', 'background'] }, pic).length === 0, 'claimed rewards are not owed again');
  let full = R.fresh();
  for (let c = 0; c < 25; c++) full = R.uncover(def, full, 25, c).st;
  check('reveal', R.complete(full) && R.rewardsOwed(def, full, pic).map((r) => r.kind).join() === 'arenaBackground',
    'uncovering all 25 completes it with no guess bonus');
}

// ---------- save (dailies rule, recording, merge) ----------
{
  check('save', S.seenToday({ seenDay: '2026-10-14' }, '2026-10-13'), 'a stamp from a clock running ahead is still "seen today"');
  check('save', S.seenToday({ seenDay: '2026-10-13' }, '2026-10-13') && !S.seenToday({ seenDay: '2026-10-12' }, '2026-10-13'), 'last >= today');
  check('save', S.markSeen({ seenDay: '2026-10-14', ev: {} }, '2026-10-13').seenDay === '2026-10-14', 'markSeen never moves the stamp backwards');
  const at = T('2026-10-25T10:00:00Z');
  const camp = { id: 'camp:1', at, src: 'campaign', won: true, oppDmg: 1 };
  const arena = { id: 'arena:9', at: at + 1, src: 'arena', won: false, oppDmg: 0.9 };
  let s = S.recordBattle(S.fresh(), camp);
  s = S.recordBattle(s, camp);
  check('save', eq(Object.keys(s.ev).sort(), ['halloween:2026', 'reveal-week:2026-W43', 'story:2026-10', 'vines-day:2026-10-25']), `campaign win banks into every any-battle event, Pass ones too: ${Object.keys(s.ev)}`);
  check('save', S.pointsOf(S.evState(s, 'vines-day:2026-10-25')) === 3, 'the same battle banks once');
  check('save', S.recordBattle(S.fresh(), camp, { pass: false }).ev['halloween:2026']?.b.length === 1,
    'a Pass holder whose entitlement reads false for a moment still banks the fight (the Pass gates display, not banking)');
  let p = S.recordBattle(S.fresh(), camp);
  p = S.recordBattle(p, arena);
  check('save', S.pointsOf(S.evState(p, 'story:2026-10')) === 5 && S.pointsOf(S.evState(p, 'halloween:2026')) === 5 && !p.ev['tower:2026-W43'],
    'Pass: STORY and Halloween take both fights; THE TOWER takes no points');
  const RW = 'reveal-week:2026-W43';
  const base = S.recordBattle(S.fresh(), camp, {});
  const a = S.setEv(base, RW, { ...S.evState(base, RW), open: [0, 1, 2] });
  const b = S.setEv(base, RW, { ...S.evState(base, RW), open: [10, 11, 12] });
  const m = S.merge(a, b);
  check('save', m.ev[RW].open.length === 3, `two devices spending the same 3 points: ${m.ev[RW].open.length} squares, want 3`);
  const VD = 'vines-day:2026-10-25';
  const a2 = S.setEv(a, VD, { ...S.evState(a, VD), rolls: 3 });
  const early = { ...arena, id: 'arena:10', at: at - 3600e3 };
  const b2 = S.recordBattle(S.setEv(b, VD, { ...S.evState(b, VD), rolls: 1 }), early, {});
  const m2 = S.merge(a2, b2);
  check('save', m2.ev[VD].rolls === 3 && eq(S.turnPoints(S.evState(m2, VD)), [2, 3]),
    `merge: max rolls, battles unioned and put in play order, got ${S.turnPoints(S.evState(m2, VD))}`);
  const tooMany = S.merge(S.setEv(a, VD, { ...S.evState(a, VD), rolls: 9 }), b);
  check('save', tooMany.ev[VD].rolls === 3, 'merged rolls never exceed what the battles bank');
  let c = S.fresh();
  for (let i = 0; i < 13; i++) c = S.recordBattle(c, { id: `camp:${i}`, at: at + i * 61e3, src: 'campaign', won: false, oppDmg: 0 });
  c = S.recordBattle(c, { id: 'camp:fast', at: at + 13 * 61e3 + 5e3, src: 'campaign', won: true, oppDmg: 1 });
  check('save', S.evState(c, VD).b.length === 10, `the save banks 10 campaign fights a day, got ${S.evState(c, VD).b.length}`);
  let g = S.recordBattle(S.fresh(), { id: 'camp:a', at, src: 'campaign', won: true, oppDmg: 1 });
  g = S.recordBattle(g, { id: 'camp:b', at: at + 20e3, src: 'campaign', won: true, oppDmg: 1 });
  check('save', S.evState(g, VD).b.length === 1, 'the save refuses a campaign fight 20 s after the last');
  check('save', S.merge({ seenDay: '2026-10-13', ev: {} }, { seenDay: '2026-10-14', ev: {} }).seenDay === '2026-10-14', 'merge keeps the later seenDay');
  // Two devices, ten campaign fights each the same day: merged, still ten, still 60 s apart.
  let da = S.fresh(), db = S.fresh();
  for (let i = 0; i < 10; i++) {
    da = S.recordBattle(da, { id: `camp:A${i}`, at: at + i * 120e3, src: 'campaign', won: true, oppDmg: 1 });
    db = S.recordBattle(db, { id: `camp:B${i}`, at: at + i * 120e3 + 5e3, src: 'campaign', won: true, oppDmg: 1 });
  }
  const dm = S.evState(S.merge(da, db), VD).b;
  check('save', dm.length === 10 && dm.every((r, i) => !i || r[3] - dm[i - 1][3] >= 60e3), `merge re-applies the campaign cap and the 60 s gap: ${dm.length} fights`);
  check('save', S.evState(S.merge(da, S.recordBattle(db, { id: 'arena:x', at: at + 30e3, src: 'arena', won: true, oppDmg: 1 })), VD).b.some((r) => r[0] === 'arena:x'),
    'arena battles are never capped by a merge');
  // Adopting a cloud save: a bonus paid on this device stays claimed only if the cloud save paid it.
  const solvedHere = S.setEv(base, RW, { ...S.evState(base, RW), solved: true, bonus: 40, claimed: ['bonus', 'background'] });
  const cloudOld = S.setEv(base, RW, { ...S.evState(base, RW) });
  const ad = S.adoptMerge(cloudOld, solvedHere).ev[RW];
  check('save', !ad.claimed.includes('bonus') && ad.claimed.includes('background') && ad.solved && ad.bonus === 40,
    `cloud adopt: the ink the cloud save never got is owed again (claimed ${ad.claimed})`);
  const cloudPaid = S.setEv(base, RW, { ...S.evState(base, RW), solved: true, bonus: 40, claimed: ['bonus'] });
  check('save', S.adoptMerge(cloudPaid, solvedHere).ev[RW].claimed.includes('bonus'), 'cloud adopt: a bonus the cloud save paid is not paid twice');
  const pr = S.prune(p, T('2026-11-05T00:00:00Z'));
  check('save', !pr.ev['vines-day:2026-10-25'] && pr.ev['story:2026-10'], 'prune drops events ended over a week ago');
  check('save', eq(S.load(JSON.parse(JSON.stringify(p))), p), 'the save round-trips through JSON');
}

// ---------- paid: supporters and Pass holders have no daily cap, only a 15 s gap ----------
{
  const VD = 'vines-day:2026-10-25', at = T('2026-10-25T10:00:00Z');
  check('paid', cal.PAID_CAP.perDay === Infinity && cal.PAID_CAP.gapMs === 15000 && cal.capFor(true) === cal.PAID_CAP && cal.capFor(false) === cal.CAMPAIGN_CAP,
    'paid = no daily limit, 15 s apart; free = CAMPAIGN_CAP');
  const fights = (n, gap, pre = 'p') => Array.from({ length: n }, (_, i) => ({ id: `camp:${pre}${i}`, at: at + i * gap, src: 'campaign', won: true, oppDmg: 1 }));
  const def = cal.defById('vines-day'), win = cal.windowOf(def, at);
  check('paid', pts.counted(def, win, fights(40, 16e3), cal.PAID_CAP).length === 40, 'paid: 40 fights 16 s apart all count');
  check('paid', pts.counted(def, win, fights(40, 16e3), cal.CAMPAIGN_CAP).length === 10, 'free: the same 40 count 10');
  check('paid', pts.counted(def, win, fights(40, 61e3)).length === 10, 'free: 10 a day');
  check('paid', pts.counted(def, win, fights(6, 10e3), cal.PAID_CAP).length === 3, 'paid: a fight 10 s after the last counted one is spam');
  let s = S.fresh();
  for (const b of fights(30, 20e3)) s = S.recordBattle(s, b, { cap: cal.PAID_CAP });
  check('paid', S.evState(s, VD).b.length === 30, `paid save banks 30 fights 20 s apart, got ${S.evState(s, VD).b.length}`);
  let f = S.fresh();
  for (const b of fights(30, 61e3)) f = S.recordBattle(f, b, { cap: cal.CAMPAIGN_CAP });
  check('paid', S.evState(f, VD).b.length === 10, 'free save still banks 10');
  check('paid', S.evState(S.adoptMerge(s, S.fresh(), { cap: cal.PAID_CAP }), VD).b.length === 30, 'adopting a cloud save with the paid cap keeps every banked fight');
  check('paid', S.evState(S.merge(s, S.fresh()), VD).b.length < 30, 'merge with the free cap would trim them (the game passes PAID_CAP)');
}

// ---------- THE TOWER ----------
{
  const tw = await imp('tower.js');
  const win = cal.windowOf(cal.defById('tower'), T('2026-10-14T12:00:00Z'));
  const R1 = (wl, gap = 60e3) => wl.map((w, i) => [`tower:${i}`, w, win.start + 3600e3 + i * gap]);
  check('tower', cal.defById('tower').pass && cal.defById('tower').cadence === 'weekly' && cal.defById('tower').kind === 'tower', 'THE TOWER: weekly, Pass');
  check('tower', tw.towerOf([]).floor === 1, 'everyone starts on floor 1');
  check('tower', tw.towerOf(R1([1, 1, 1])).floor === 4, 'a win is up one floor');
  check('tower', tw.towerOf(R1([1, 1, 0])).floor === 2, 'a loss is down one floor');
  check('tower', tw.towerOf(R1([0, 0, 0, 1])).floor === 2, 'never below floor 1');
  const climb = R1(Array(11).fill(1));
  check('tower', tw.towerOf(climb).floor === 12 && tw.towerOf(climb).tops === 0, 'eleven wins reach floor 12, not the TOP');
  const top = tw.towerOf(R1([...Array(12).fill(1), 1, 0]));
  check('tower', top.tops === 2 && top.floor === 11 && top.best === 12, `winning ON floor 12 is a TOP (defend it: stay); a loss drops to 11, got ${JSON.stringify(top)}`);
  check('tower', tw.nextFloor(12, true) === 12 && tw.nextFloor(1, false) === 1 && tw.nextFloor(5, false) === 4, 'nextFloor clamps to 1..12');
  check('tower', tw.towerCounted(win, R1([1, 1, 1], 3e3)).length === 1, 'tower fights closer than the gap do not count');
  check('tower', tw.towerCounted(win, [['tower:a', 1, win.start - 1], ['tower:b', 1, win.end]]).length === 0, 'outside the week does not count');
  check('tower', tw.towerCounted(win, [['tower:a', 1, win.start + 9e5], ['tower:a', 0, win.start + 9e6]]).length === 1, 'one result per fight id');
  check('tower', eq(tw.rewardsOwed({ t: top ? R1([...Array(12).fill(1)]) : [], claimed: [] }).map((r) => r.id), ['top', 'topbg']), 'the TOP owes ink and its prize');
  check('tower', tw.rewardsOwed({ t: R1([...Array(12).fill(1)]), claimed: ['top', 'topbg'] }).length === 0 && tw.rewardsOwed({ t: climb, claimed: [] }).length === 0, 'paid once; nothing before the TOP');
  let s = S.fresh();
  const TID = cal.eventIdOf(cal.defById('tower'), win);
  for (const r of R1([1, 1, 0, 1])) s = S.recordTower(s, TID, r);
  s = S.recordTower(s, TID, ['tower:spam', 1, win.start + 3600e3 + 3 * 60e3 + 2e3]);
  check('tower', tw.towerOf(S.evState(s, TID).t).floor === 3 && S.evState(s, TID).t.length === 4, 'recordTower keeps the play order and drops spam');
  const sel = tw.selectRivals([{ uid: 'a', name: 'A', t: R1([1]) }, { uid: 'b', name: 'B', t: R1([1, 1, 1, 1, 1]) }, { uid: 'c', name: 'C', t: [] }, { uid: 'me', name: 'Me', t: [] }],
    { uid: 'me', t: R1([1, 1, 1, 1]) }, { friends: new Set(['a']) });
  check('tower', sel.map((r) => r.uid).join() === 'a,b' && sel[0].friend, `rivals: friends first, then nearest, nobody without a fight: ${sel.map((r) => r.uid)}`);
  const viaBattle = S.recordBattle(S.fresh(), { id: 'arena:t', at: win.start + 3600e3, src: 'arena', won: true, oppDmg: 1 });
  check('tower', !viaBattle.ev[TID] && !pts.counts(cal.defById('tower'), win, { at: win.start + 1, src: 'arena' }), 'THE TOWER takes no battle points, arena or campaign');
  const ab = S.merge(S.recordTower(S.fresh(), TID, R1([1])[0]), S.recordTower(S.fresh(), TID, ['tower:z', 0, win.start + 7200e3]));
  check('tower', S.evState(ab, TID).t.length === 2, 'merge unions two devices\' tower fights');
}

// ---------- STORY ----------
{
  const sy = await imp('story.js');
  check('story', cal.defById('story').pass && cal.defById('story').anyBattle && cal.defById('story').cadence === 'monthly', 'STORY: monthly, Pass, any battle');
  check('story', sy.STORIES.length === 3 && sy.STORIES.every((s) => s.chapters.length === 6 && s.chapters.every((c) => c.circles >= 12 && c.circles <= 16 && c.text.length > 80)),
    'three stories, six chapters each, 12-16 circles, a real paragraph');
  check('story', new Set(['2026-10', '2026-11', '2026-12'].map(sy.storyIndex)).size === 3 && sy.storyIndex('2027-01') === sy.storyIndex('2026-10'), 'the stories take turns by month');
  const st = sy.STORIES[0];
  check('story', sy.progress(st, 0).chapter === 0 && sy.progress(st, 12).chapter === 0 && sy.progress(st, 12).circle === 12, 'points are circles');
  check('story', sy.progress(st, 13).chapter === 1 && sy.progress(st, 13).circle === 0 && sy.progress(st, 13).opened === 1, 'the last circle opens the chapter');
  check('story', sy.progress(st, 30).chapter === 2 && sy.progress(st, 30).circle === 3, 'points carry over into the next chapter');
  check('story', sy.progress(st, 87).done && !sy.progress(st, 86).done && sy.progress(st, 500).walked === 87, 'the story ends at its last circle');
  check('story', sy.rewardsOwed(st, 87).map((r) => r.id).join() === 'end,endbg' && sy.rewardsOwed(st, 86).length === 0 && sy.rewardsOwed(st, 87, ['end', 'endbg']).length === 0,
    'finishing pays once');
  const SID = 'story:2026-10', at = T('2026-10-20T10:00:00Z');
  let s = S.fresh();
  s = S.recordBattle(s, { id: 'camp:s1', at, src: 'campaign', won: true, oppDmg: 1 });
  s = S.recordBattle(s, { id: 'arena:s2', at: at + 5e3, src: 'arena', won: false, oppDmg: 0.9 });
  check('story', S.pointsOf(S.evState(s, SID)) === 5, 'any battle walks the story: a win (3) and a close loss (2)');
  const m = S.merge(S.setEv(s, SID, { ...S.evState(s, SID), seen: 5, read: 0 }), S.setEv(s, SID, { ...S.evState(s, SID), seen: 3, read: 1 }));
  check('story', m.ev[SID].seen === 5 && m.ev[SID].read === 1, 'merge keeps the furthest walk and the chapters read');
}

// ---------- retired: SCROLLS & ROPES and MONTHLY PICTURE ----------
{
  check('retired', !cal.defById('vines-month') && !cal.defById('reveal-month') && cal.parseEventId('vines-month:2026-10') === null && cal.parseEventId('reveal-month:2026-10') === null,
    'the old Pass events are gone');
  const old = { v: 1, seenDay: '2026-10-13', ev: { 'vines-month:2026-10': { b: [['arena:1', 3, 'arena', 1]], rolls: 2 }, 'reveal-month:2026-10': { b: [], open: [1] },
    'vines-day:2026-10-13': { b: [], rolls: 0 } } };
  const l = S.load(old);
  check('retired', eq(Object.keys(l.ev), ['vines-day:2026-10-13']), 'a save holding the old events loads without them');
  check('retired', Object.keys(S.merge(old, S.fresh()).ev).join() === 'vines-day:2026-10-13' && Object.keys(S.adoptMerge(old, old).ev).length === 1, 'merge and adopt drop them too');
  let r = S.recordBattle(old, { id: 'camp:r', at: T('2026-10-13T10:00:00Z'), src: 'campaign', won: true, oppDmg: 1 });
  check('retired', !Object.keys(r.ev).some((k) => /month/.test(k)), 'banking a fight into an old save never touches them');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
