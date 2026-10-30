#!/usr/bin/env node
// Validates every Learn lesson (js/learn/data.js):
//   - every FEN parses; positions with both kings are legal chess (Chess.validateFen)
//   - info demos, pre-moves, expected moves and replies are legal along every accepted branch
//   - "mate" tasks have a mating move; every listed mate really mates; stalemate traps exist
//   - tactic drills: the engine (checkUnique) agrees the expected first move is clearly best
//   - star fields: BFS over the single piece proves every star/prey is collectable within `max`
//   - tap tasks: targets are real squares ('reach:' targets come from the piece's moves)
//   - K+P claims match the exact bitbase; K+P practice: promotion can be FORCED within `max`
//   - K+Q / K+R practice: the engine, playing White against the engine's best defence, mates within `max`
//   node tools/learn_test.mjs [--quick]     (--quick skips the engine self-play games)
import { LESSONS, UNITS } from '../js/learn/data.js';
import { fieldFromFen, solveField, fieldMoves, reach } from '../js/learn/field.js';
import { kpkProbe } from '../js/learn/kpk.js';
import { Chess } from '../js/chess/chess.js';
import { checkUnique } from '../js/chess/solve.js';
import { Engine } from '../js/bots/engine.js';
import { goalTest, hasKings, parseOk } from '../js/learn/rules.js';

const QUICK = process.argv.includes('--quick');
let checks = 0, fails = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  FAIL', msg); } return !!cond; };
const isSq = s => typeof s === 'string' && /^[a-h][1-8]$/.test(s);
const SAY_MAX = 230;

function placementOk(fen) {
  const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) return false;
  return rows.every(r => [...r].reduce((n, c) => n + (/\d/.test(c) ? +c : /[pnbrqkPNBRQK]/.test(c) ? 1 : 99), 0) === 8);
}
const pieceAt = (fen, sq) => { const c = new Chess(); try { c.load(fen); return c.get(sq); } catch { return null; } };
function placeGet(fen, sq) {
  const rows = fen.split(' ')[0].split('/'); const r = 8 - +sq[1]; let x = 0;
  for (const ch of rows[r]) { if (/\d/.test(ch)) { x += +ch; continue; } if ('abcdefgh'[x] === sq[0]) return ch; x++; }
  return null;
}

// can White force a safe promotion within n moves (exact, K+P v K)?
function forcePromote(fen, n, memo = new Map()) {
  const key = fen.split(' ').slice(0, 2).join(' ') + n;
  if (memo.has(key)) return memo.get(key);
  let res = false;
  if (n > 0 && kpkProbe(fen) === 'win') {
    const c = new Chess(fen);
    for (const m of c.moves({ verbose: true })) {
      if (m.promotion && m.promotion !== 'q') continue;
      c.move(m.lan);
      if (m.promotion) {
        const safe = !c.moves({ verbose: true }).some(r => r.to === m.to);
        c.undo(); if (safe) { res = true; break; } continue;
      }
      if (kpkProbe(c.fen()) !== 'win') { c.undo(); continue; }
      const replies = c.moves({ verbose: true });
      let all = replies.length > 0;
      for (const r of replies) { c.move(r.lan); const w = forcePromote(c.fen(), n - 1, memo); c.undo(); if (!w) { all = false; break; } }
      c.undo();
      if (all) { res = true; break; }
    }
  }
  memo.set(key, res);
  return res;
}

const LEGAL_SEEN = new Map();   // every LAN in an ok-list must be legal on at least one branch
let eng = null;
function selfPlayMate(fen, max, ms = 250) {
  eng ||= new Engine({ ttBits: 20 });
  eng.setEval({}); eng.evalNoise = 0;
  const c = new Chess(fen);
  for (let mv = 1; mv <= max; mv++) {
    eng.setPosition(c.fen(), []);
    const a = eng.search({ softMs: ms, hardMs: ms * 2 });
    c.move(a.lan);
    if (c.isCheckmate()) return mv;
    if (c.isGameOver()) return -1;
    eng.setPosition(c.fen(), []);
    const d = eng.search({ softMs: ms, hardMs: ms * 2 });
    c.move(d.lan);
    if (c.isGameOver()) return -1;
  }
  return 0;
}

// walk a move task along every accepted branch
function walkMoves(c, list, i, path, where, tacticRuns) {
  if (i >= list.length) return;
  const st = list[i];
  const fen = c.fen();
  const legal = c.moves({ verbose: true });
  const accepted = legal.filter(m => goalTest(st.ok, c, m));
  ok(accepted.length > 0, `${where} move ${i + 1}: no legal move satisfies "${st.ok}" (${fen})`);
  const lans = parseOk(st.ok);
  const seen = LEGAL_SEEN.get(`${where}/${i}`) || LEGAL_SEEN.set(`${where}/${i}`, { lans: lans || [], hit: new Set() }).get(`${where}/${i}`);
  for (const l of seen.lans) if (legal.some(m => m.lan === l || m.lan === l + 'q')) seen.hit.add(l);
  if (st.ok === 'mate') ok(accepted.every(m => m.mate), `${where}: mate test accepted a non-mate`);
  if (st.tactic) tacticRuns.push({ where: `${where} move ${i + 1}`, fen, ok: st.ok, accepted: accepted.map(m => m.lan) });
  for (const m of accepted) {
    c.move(m.lan);
    if (st.reply) {
      const r = c.move(st.reply);
      ok(!!r, `${where} move ${i + 1}: reply ${st.reply} illegal after ${m.lan} (${c.fen()})`);
      if (r) { walkMoves(c, list, i + 1, [...path, m.lan, st.reply], where, tacticRuns); c.undo(); }
    } else {
      ok(i === list.length - 1 || c.isGameOver(), `${where} move ${i + 1}: no reply but more moves follow`);
    }
    c.undo();
  }
}

console.log(`Learn: ${UNITS.length} units, ${LESSONS.length} lessons, ${LESSONS.reduce((n, l) => n + l.steps.length, 0)} steps`);
const ids = new Set();
const tactics = [], plays = [];
for (const L of LESSONS) {
  ok(!ids.has(L.id), `duplicate lesson id ${L.id}`); ids.add(L.id);
  ok(UNITS.some(u => u.id === L.unit), `${L.id}: unknown unit ${L.unit}`);
  ok(L.steps.length >= 2, `${L.id}: too few steps`);
  let fen = null;
  L.steps.forEach((s, si) => {
    const where = `${L.id}#${si + 1}`;
    const type = s.type || 'info';
    ok(['info', 'tap', 'stars', 'move', 'quiz', 'play', 'cta'].includes(type), `${where}: unknown type ${type}`);
    ok(typeof s.say === 'string' && s.say.length > 0, `${where}: no coach text`);
    ok(s.say.replace(/<[^>]+>/g, '').length <= SAY_MAX, `${where}: coach text too long (${s.say.replace(/<[^>]+>/g, '').length} chars)`);
    if (s.fen) fen = s.fen;
    if (si === 0) ok(!!s.fen, `${where}: first step needs a fen`);
    if (!fen) return;
    ok(placementOk(fen), `${where}: bad FEN ${fen}`);
    const kings = hasKings(fen);
    if (kings) { const v = Chess.validateFen(fen); ok(v.ok, `${where}: illegal position ${fen}: ${v.error}`); }
    for (const a of s.arrows || []) ok(isSq(a[0]) && isSq(a[1]), `${where}: bad arrow ${a}`);
    for (const z of s.zones || []) ok(z.sq.every(isSq), `${where}: bad zone`);
    for (const t of Object.keys(s.tags || {})) ok(isSq(t), `${where}: bad tag square ${t}`);
    if (s.dots) ok(!!placeGet(fen, s.dots), `${where}: dots square ${s.dots} is empty`);
    if (s.label) ok(!!placeGet(fen, s.label), `${where}: label square ${s.label} is empty`);
    if (s.demo) {
      if (kings) {
        const c = new Chess(fen);
        for (const m of s.demo) ok(!!c.move(m), `${where}: demo move ${m} illegal`);
      } else {
        let f = fen;
        for (const m of s.demo) {
          const from = m.slice(0, 2), to = m.slice(2, 4), ch = placeGet(f, from);
          ok(ch && ch === ch.toUpperCase(), `${where}: demo ${m} has no white piece`);
          if (ch) ok(fieldMoves(fieldFromFen(f, from)).some(x => x.to === to), `${where}: demo ${m} not a legal piece move`);
        }
      }
    }
    if (type === 'tap') {
      if (s.coords) ok(s.coords > 0 && s.coords <= 20, `${where}: coords count`);
      else if (typeof s.find === 'string') {
        const sq = s.find.split(':')[1];
        const t = reach(null, sq, fen);
        ok(t.length > 0, `${where}: reach ${sq} gives no squares`);
      } else ok(Array.isArray(s.find) && s.find.length && s.find.every(isSq), `${where}: bad find list`);
    }
    if (type === 'stars') {
      const ch = placeGet(fen, s.piece);
      ok(ch && ch === ch.toUpperCase() && ch !== 'K' || ch === 'K', `${where}: no white piece on ${s.piece}`);
      ok(!kings || ch === 'K', `${where}: star fields are lone-piece boards`);
      for (const st of s.stars) ok(!placeGet(fen, st), `${where}: star on an occupied square ${st}`);
      const fld = fieldFromFen(fen, s.piece, s.stars);
      const n = solveField(fld);
      ok(n > 0, `${where}: star field unsolvable`);
      ok(n > 0 && n <= s.max, `${where}: needs ${n} moves, max ${s.max}`);
      ok(n === s.max, `${where}: max ${s.max} but ${n} is enough (keep it tight)`);
      ok(!/\d moves/.test(s.say) || s.say.includes('{max}'), `${where}: hard-coded move count in text`);
      console.log(`  ${where.padEnd(14)} stars: ${fld.type.toUpperCase()} ${s.stars.length}★ ${fld.prey.size} prey, solved in ${n} (max ${s.max})`);
    }
    if (type === 'move') {
      ok(kings, `${where}: move tasks need a legal chess position`);
      const c = new Chess(fen);
      if (s.pre) ok(!!c.move(s.pre), `${where}: pre-move ${s.pre} illegal`);
      walkMoves(c, s.moves, 0, [], where, tactics);
      if (s.trap === 'stalemate') {
        const cc = new Chess(c.fen());
        const st = cc.moves({ verbose: true }).filter(m => { cc.move(m.lan); const r = cc.isStalemate(); cc.undo(); return r; });
        ok(st.length > 0, `${where}: claimed stalemate trap not present`);
        console.log(`  ${where.padEnd(14)} stalemate traps: ${st.map(m => m.san).join(' ')}`);
      }
    }
    if (type === 'quiz') {
      ok(Array.isArray(s.options) && s.options.length >= 2 && s.answer >= 0 && s.answer < s.options.length, `${where}: bad quiz`);
      ok(!!s.q && !!s.explain, `${where}: quiz needs q + explain`);
      if (s.kpk) ok(kpkProbe(fen) === s.kpk, `${where}: bitbase says ${kpkProbe(fen)}, lesson says ${s.kpk}`);
    }
    if (type === 'play') {
      ok(kings && new Chess(fen).turn() === 'w', `${where}: play needs a legal position, White to move`);
      ok(s.max > 0, `${where}: play needs max`);
      if (s.kpk) {
        ok(kpkProbe(fen) === 'win', `${where}: K+P start is not a win`);
        const can = forcePromote(fen, s.max);
        ok(can, `${where}: promotion can't be forced within ${s.max}`);
        let tight = s.max; while (tight > 1 && forcePromote(fen, tight - 1)) tight--;
        console.log(`  ${where.padEnd(14)} K+P: forced promotion in ${tight} (max ${s.max})`);
        const c = new Chess(fen);
        const wins = c.moves({ verbose: true }).filter(m => { c.move(m.lan); const r = kpkProbe(c.fen()); c.undo(); return r === 'win' || (m.promotion && r === null); });
        console.log(`  ${where.padEnd(14)} winning first moves: ${wins.map(m => m.san).join(' ')}`);
      } else plays.push({ where, fen, max: s.max });
    }
    if (type === 'cta') for (const l of s.links) ok(/^#\//.test(l.href) && l.label, `${where}: bad link`);
  });
}

for (const [k, v] of LEGAL_SEEN) for (const l of v.lans) ok(v.hit.has(l), `${k}: ${l} is never legal`);

// tactic drills: engine must agree
for (const t of tactics) {
  const r = checkUnique(t.fen, { ms: 700, margin: 150 });
  const good = t.accepted.includes(r.best);
  ok(good, `${t.where}: engine prefers ${r.best} (score ${r.bestScore}) over ${t.ok}`);
  const lone = parseOk(t.ok)?.length === 1;
  if (lone) ok(r.unique, `${t.where}: ${t.ok} not clearly unique (gap ${r.gap}, 2nd ${r.second})`);
  console.log(`  ${t.where.padEnd(16)} tactic ${t.ok.padEnd(10)} engine ${r.best} ${r.bestMate ? 'mate ' + r.bestMate : r.bestScore}  gap ${r.gap === Infinity ? '∞' : r.gap}`);
}

if (!QUICK) for (const p of plays) {
  const n = selfPlayMate(p.fen, p.max);
  ok(n > 0, `${p.where}: engine self-play did not mate within ${p.max}`);
  console.log(`  ${p.where.padEnd(14)} engine mates in ${n} vs best defence (max ${p.max})`);
}

console.log(`${fails ? 'FAILED' : 'ALL PASS'}: ${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
