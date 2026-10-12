// Special-events engine gate: points, UTC windows, seeded dice + boards, THE REPLAY RULE,
// rival selection, the reveal grid and the events save (dailies rule, merge).
//
//   node tools/eventsgate.mjs              run every check against js/events/
//   node tools/eventsgate.mjs --falsify    break the engine 16 ways; each must turn its section red
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
    ['replay', 'vines.js', 'turns >= banked', 'turns > banked'],
    ['rivals', 'vines.js', '[...fr, ...rest]', '[...rest, ...fr]'],
    ['reveal', 'reveal.js', 'left(def, st, pts) < def.cost', 'left(def, st, pts) < 0'],
    ['reveal', 'reveal.js', '1 + Math.floor(st.open.length / 5)', '1 + st.open.length'],
    ['reveal', 'reveal.js', '(CELLS - st.open.length) * def.guessBonus', 'CELLS * def.guessBonus'],
    ['save', 'state.js', 'state.seenDay >= day', 'state.seenDay === day'],
    ['save', 'state.js', 'm.open = open.slice(0, cap);', 'm.open = open;'],
    ['save', 'state.js', 'if (a.locked || !counts', 'if (!counts'],
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
  const def = cal.defById('vines-day'), arenaOnly = cal.defById('vines-month');
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
  const D = cal.defById('vines-day'), W = cal.defById('reveal-week'), M = cal.defById('vines-month'), H = cal.defById('halloween');
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
  check('windows', act.length === 5 && act.filter((a) => a.locked).map((a) => a.def.id).join() === 'vines-month,reveal-month,halloween',
    'daily + weekly free, monthly + seasonal Pass');
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

// ---------- THE REPLAY RULE (Aaron's example) ----------
{
  const def = cal.defById('vines-day');
  const t0 = T('2026-10-13T09:00:00Z');
  const win = cal.windowOf(def, t0), EV = cal.eventIdOf(def, win), board = V.makeBoard(EV);
  const battles = [
    { id: 'm1', at: t0, src: 'arena', won: false, oppDmg: 0.2 },
    { id: 'm2', at: t0 + 60e3, src: 'arena', won: true, oppDmg: 1 },
    { id: 'm3', at: t0 + 120e3, src: 'campaign', won: false, oppDmg: 0.8 },
  ];
  check('replay', eq(battles.map(pts.pointsFor), [1, 3, 2]), 'the three battles are worth 1, 3, 2');
  let banked = V.rollsBanked(def, pts.pointsIn(def, win, battles));
  check('replay', banked === 7, `1 starting roll + 1 + 3 + 2 = 7 rolls banked, got ${banked}`);
  let turns = 0;
  for (let i = 0; i < 20; i++) { const r = V.takeTurn(board, 'me', EV, turns, banked); if (!r.move) break; turns = r.turns; }
  check('replay', turns === 7, `I leave at turn 7, got ${turns}`);
  check('replay', V.takeTurn(board, 'me', EV, 7, 7).move === null, 'no 8th turn without an 8th banked roll');

  const rivals = [{ uid: 'ann', turns: 2 }, { uid: 'bo', turns: 4 }, { uid: 'cy', turns: 3 }];
  for (const r of rivals) {
    const v = V.rivalView(board, EV, r, turns);
    check('replay', v.shownTurns === r.turns && v.pos === V.positionAt(board, r.uid, EV, r.turns).pos,
      `${r.uid} has only played ${r.turns}: shown at their own turn ${r.turns}`);
  }
  const later = [{ uid: 'ann', turns: 12 }, { uid: 'bo', turns: 30 }, { uid: 'cy', turns: 5 }];
  for (const r of later) {
    const v = V.rivalView(board, EV, r, turns);
    const want = Math.min(r.turns, 7);
    check('replay', v.shownTurns === want && v.pos === V.positionAt(board, r.uid, EV, want).pos,
      `after ${r.uid} plays to ${r.turns}, I (still at 7) see them at turn ${want}, got ${v.shownTurns}`);
  }
  const annAt12 = V.positionAt(board, 'ann', EV, 12).pos, annAt7 = V.positionAt(board, 'ann', EV, 7).pos;
  check('replay', annAt12 !== annAt7, 'the example board must actually tell turn 7 from turn 12');
  battles.push({ id: 'm4', at: t0 + 3600e3, src: 'arena', won: true, oppDmg: 1 });
  banked = V.rollsBanked(def, pts.pointsIn(def, win, battles));
  for (let k = 0; k < 3; k++) {
    const r = V.takeTurn(board, 'me', EV, turns, banked);
    turns = r.turns;
    for (const rv of later) {
      const v = V.rivalView(board, EV, rv, turns);
      check('replay', v.shownTurns === Math.min(rv.turns, turns), `after my turn ${turns}, ${rv.uid} is shown at ${v.shownTurns}`);
    }
  }
  check('replay', turns === 10, `three more turns from a win: 10, got ${turns}`);
  const me = V.positionAt(board, 'me', EV, turns);
  check('replay', me.pos >= 0 && me.pos <= 100, 'position stays on the board');
}

// ---------- rivals ----------
{
  const EV = 'vines-day:2026-10-13', board = V.makeBoard(EV);
  const pool = Array.from({ length: 24 }, (_, i) => ({ uid: `r${String(i).padStart(2, '0')}`, turns: i % 4 === 3 ? 0 : 3 + (i * 7) % 20 }));
  pool.push({ uid: 'me', turns: 9 });
  const friends = new Set(['r01', 'r10', 'r21', 'r03']);
  const sel = V.selectRivals(board, EV, pool, { uid: 'me', turns: 9 }, { friends });
  const mine = V.positionAt(board, 'me', EV, 9).pos;
  check('rivals', sel.length === 10, `10 rivals, got ${sel.length}`);
  check('rivals', sel.slice(0, 3).every((r) => r.friend) && !sel.slice(3).some((r) => r.friend),
    `friends first (r03 never played): ${sel.map((r) => r.uid)}`);
  check('rivals', !sel.some((r) => r.uid === 'me' || r.turns === 0), 'never yourself, never a player with no turns');
  const d = sel.slice(3).map((r) => Math.abs(r.pos - mine));
  check('rivals', d.every((x, i) => i === 0 || x >= d[i - 1]), `the rest sorted nearest first: ${d}`);
  check('rivals', sel.every((r) => r.shownTurns <= 9), 'rival selection uses replay-rule positions');
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
  check('reveal', R.uncover(cal.defById('reveal-month'), R.fresh(), 1, 0).why === 'points', 'cost 2 needs 2 points');
  check('reveal', R.guessesLeft(R.fresh()) === 1 && R.guessesLeft(st) === 2, 'one guess, plus one per five squares');
  const pic = R.pictureOf(def, 'reveal-week:2026-W42');
  const ch = R.choicesFor('reveal-week:2026-W42', pic);
  check('reveal', ch.length === 4 && new Set(ch).size === 4 && ch.includes(R.PICTURES[pic].answer), 'four distinct choices incl. the answer');
  check('reveal', eq(ch, R.choicesFor('reveal-week:2026-W42', pic)), 'choices are stable for an event');
  const slots = new Set(Array.from({ length: 40 }, (_, i) => R.choicesFor(`reveal-week:x${i}`, pic).indexOf(R.PICTURES[pic].answer)));
  check('reveal', slots.size >= 3, 'the answer is not always in the same slot');
  let g = R.guess(def, st, 'A TEA PARTY', false);
  check('reveal', g.ok && !g.right && R.guessesLeft(g.st) === 1 && !g.st.solved, 'a wrong guess costs a guess');
  g = R.guess(def, g.st, R.PICTURES[pic].answer, true);
  check('reveal', g.right && g.st.solved && g.st.bonus === 20 * def.guessBonus, `bonus = 20 covered x ${def.guessBonus}, got ${g.st.bonus}`);
  check('reveal', R.guess(def, g.st, 'x', true).ok === false, 'no guessing once solved');
  const owed = R.rewardsOwed(def, g.st, pic);
  check('reveal', eq(owed.map((r) => r.kind).sort(), ['arenaBackground', 'guessBonus']), 'a solved picture owes its bonus and its background');
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
  let s = S.recordBattle(S.fresh(), camp, { pass: false });
  s = S.recordBattle(s, camp, { pass: false });
  check('save', eq(Object.keys(s.ev).sort(), ['reveal-week:2026-W43', 'vines-day:2026-10-25']), `free player, campaign win: ${Object.keys(s.ev)}`);
  check('save', S.pointsOf(S.evState(s, 'vines-day:2026-10-25')) === 3, 'the same battle banks once');
  s = S.recordBattle(s, arena, { pass: false });
  check('save', !s.ev['vines-month:2026-10'], 'a free player banks nothing into a Pass event');
  let p = S.recordBattle(S.fresh(), camp, { pass: true });
  p = S.recordBattle(p, arena, { pass: true });
  check('save', S.pointsOf(S.evState(p, 'vines-month:2026-10')) === 2 && S.pointsOf(S.evState(p, 'halloween:2026')) === 5,
    'Pass: arena-only monthly takes the arena loss only; any-battle Halloween takes both');
  const RW = 'reveal-week:2026-W43';
  const base = S.recordBattle(S.fresh(), camp, {});
  const a = S.setEv(base, RW, { ...S.evState(base, RW), open: [0, 1, 2] });
  const b = S.setEv(base, RW, { ...S.evState(base, RW), open: [10, 11, 12] });
  const m = S.merge(a, b);
  check('save', m.ev[RW].open.length === 3, `two devices spending the same 3 points: ${m.ev[RW].open.length} squares, want 3`);
  const a2 = S.setEv(a, 'vines-day:2026-10-25', { ...S.evState(a, 'vines-day:2026-10-25'), turns: 4 });
  const b2 = S.recordBattle(S.setEv(b, 'vines-day:2026-10-25', { ...S.evState(b, 'vines-day:2026-10-25'), turns: 2 }), { ...arena, id: 'arena:10' }, {});
  const m2 = S.merge(a2, b2);
  check('save', m2.ev['vines-day:2026-10-25'].turns === 4 && S.pointsOf(S.evState(m2, 'vines-day:2026-10-25')) === 3 + 2,
    'merge: max turns, battles unioned by id');
  check('save', S.merge({ seenDay: '2026-10-13', ev: {} }, { seenDay: '2026-10-14', ev: {} }).seenDay === '2026-10-14', 'merge keeps the later seenDay');
  const pr = S.prune(p, T('2026-11-05T00:00:00Z'));
  check('save', !pr.ev['vines-day:2026-10-25'] && pr.ev['vines-month:2026-10'], 'prune drops events ended over a week ago');
  check('save', eq(S.load(JSON.parse(JSON.stringify(p))), p), 'the save round-trips through JSON');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
