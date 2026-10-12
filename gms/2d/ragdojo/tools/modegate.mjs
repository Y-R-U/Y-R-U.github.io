#!/usr/bin/env node
/**
 * Rules of the online modes, in node, against the real PvpMatch:
 *   Last Man Standing, Steal the Bandana, King of the Hill, the free-for-all fixes, spawns,
 *   the crowd camera, verdict agreement over the wire, and host migration (keyframe +
 *   newest snapshot -> a new master that carries on).
 *
 *   node tools/modegate.mjs
 *   node tools/modegate.mjs --falsify    break the rules N ways; each must turn its section red
 *
 * MODES_JS points the gate at another copy of js/ (the falsifier uses it).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../js');
const JS = process.env.MODES_JS || SRC;
const args = process.argv.slice(2);

if (args.includes('--falsify')) {
  const MUTANTS = [
    ['bandana-pickup', 'net/modes.js', 'const GRAB_R = 36;', 'const GRAB_R = 0;'],
    ['bandana-score', 'net/modes.js', '    m.scores[b.holder] += dt;', '    m.scores[b.holder] += dt * 0.5;'],
    ['bandana-knock', 'net/modes.js', "if ((def.stagger ?? 0) < KNOCK_STAGGER) return;", "if ((def.stagger ?? 0) < 0.2) return;"],
    ['bandana-knock', 'net/modes.js', 'const dir = Math.sign(target.x - attacker.x) || target.facing;', 'const dir = Math.sign(attacker.x - target.x) || target.facing;'],
    ['bandana-regrab', 'net/modes.js', "if (f.slot === b.last && b.lastT > 0) continue;", ''],
    ['respawn', 'net/modes.js', "else if ((f.respawnT -= dt) <= 0) respawn(m, f);", ''],
    ['respawn', 'net/modes.js', 'hp: f.maxHp, attack: null', 'hp: f.maxHp * 0.3, attack: null'],
    ['bandana-win', 'net/modes.js', 'else if (M.target && top >= M.target * 10) winner = leaders[0];', ''],
    ['overtime', 'net/modes.js', "else if (!v.overtime && M.overtime) return { overtime: true };", ''],
    ['overtime', 'net/modes.js', 'else if (v.overtime && leaders.length === 1 && top > 0) winner = leaders[0];', ''],
    ['hill-score', 'net/modes.js', "z.holder = inside.length === 1 ? inside[0].slot : -1;", "z.holder = inside.length >= 1 ? inside[0].slot : -1;"],
    ['hill-move', 'net/modes.js', "if (z.t <= 0) { z.x = z.next ?? z.x;", "if (z.t <= -999) { z.x = z.next ?? z.x;"],
    ['hill-move', 'net/modes.js', 'if (Math.abs(x - z.x) > 380) opts.push(x);', 'opts.push(x);'],
    ['lms', 'net/modes.js', 'for (const f of m.all) if (f.dead && !f.out && !f.gone) f.out = ++m.outSeq;', ''],
    ['lms', 'net/fight.js', '    Modes.stampOuts(this);\n', ''],
    ['lms', 'net/modes.js', 'if (alive.length === 1) { winner = alive[0].slot; ko = true; }', 'if (alive.length === 0) { winner = -1; }'],
    ['ffa', 'match.js', 'const friendly = !this.ffa && attacker', 'const friendly = attacker'],
    ['ffa', 'match.js', "if (!this.ffa && f !== this.player && o !== this.player) continue;", "if (f !== this.player && o !== this.player) continue;"],
    ['spawns', 'net/modes.js', 'xs.push(MIN_X + (MAX_X - MIN_X) * ((i + 0.5) / n));', 'xs.push(MIN_X + 60 * i);'],
    ['camera', 'match.js', 'if (this.fitAll) wantH', 'if (false) wantH'],
    ['wire', 'net/wire.js', 'F.score = v.getUint16(o) / 10; o += 2;', 'F.score = v.getUint16(o) / 100; o += 2;'],
    ['wire', 'net/wire.js', 's.obj = { holder: holder === 255 ? -1 : holder,', 's.obj = { holder: -1,'],
    ['migration', 'net/fight.js', '      f.rag.x[k] = x; f.rag.y[k] = y; f.rag.px[k] = x - vx; f.rag.py[k] = y - vy;', ''],
    ['migration', 'net/fight.js', "    mp.scores[F.slot] = F.score || 0;\n  }\n  mp.outSeq", "  }\n  mp.outSeq"],
    ['migration', 'net/fight.js', "    o.holder = s.obj.holder;\n", ''],
    ['eliminate', 'net/modes.js', '  f.gone = true;   // bandanaStep', '  f.gone = false;   // bandanaStep'],
  ];
  let bad = 0;
  for (const [section, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'modegate-'));
    cpSync(SRC, tmp, { recursive: true });
    const p = join(tmp, file);
    const src = readFileSync(p, 'utf8');
    if (!src.includes(from)) { console.log(`STALE mutant [${section}] ${file}: "${from.slice(0, 60)}" not found`); bad++; rmSync(tmp, { recursive: true, force: true }); continue; }
    writeFileSync(p, src.replace(from, to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--only-report'], { env: { ...process.env, MODES_JS: tmp }, encoding: 'utf8' });
    rmSync(tmp, { recursive: true, force: true });
    const red = new Set((r.stdout.match(/^FAIL \[([\w-]+)\]/gm) || []).map((l) => l.slice(6, -1)));
    const killed = red.has(section);
    if (!killed) bad++;
    console.log(`${killed ? 'red ' : 'SURVIVED'}  [${section}] ${file}: ${from.slice(0, 70).replace(/\n/g, '⏎')}${red.size && !killed ? `  (red: ${[...red].join(',')})` : ''}`);
  }
  console.log(bad ? `\n${bad} mutant(s) survived — the gate does not check what it claims` : `\nall ${MUTANTS.length} mutants turned their section red`);
  process.exit(bad ? 1 : 0);
}

// ── the gate ──────────────────────────────────────────────────────────
const noopCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 } : () => ({ addColorStop() {} })), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.location = { search: '', hostname: 'node' };
const imp = (f) => import(pathToFileURL(join(JS, f)).href);
const { PvpMatch, pvpSave, arenaLevel, matchState, applyState, patchFromSnap } = await imp('net/fight.js');
const Modes = await imp('net/modes.js');
const W = await imp('net/wire.js');
const { SHEET_W, GROUND_Y, moveStats } = await imp('config.js');
const { ObjectiveBrain } = await imp('net/objective.js');

let pass = 0, fail = 0;
const ok = (section, n, c, x = '') => {
  c ? pass++ : fail++;
  const line = `${c ? 'PASS' : 'FAIL'} [${section}] ${n}${x ? '  ' + x : ''}`;
  console.log(line);
};
const STEP = 1 / 120;
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const make = (mode, n, seed = 5) => {
  const m = new PvpMatch({ level: { ...arenaLevel(seed, mode) }, saves: Array.from({ length: n }, () => pvpSave(ALL)),
    you: 0, seats: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })), mode, seed });
  m.begin();
  run(m, 3.05);
  return m;
};
function run(m, secs, each) { for (let i = 0; i < Math.round(secs * 120); i++) { if (each) each(i); m.update(STEP); } }
const park = (m, f, x) => { f.place(x, GROUND_Y); f.vx = 0; };
/** Hold everyone still (no input) far apart; a fight with nobody fighting. */
const spread = (m, xs) => m.all.forEach((f, i) => park(m, f, xs[i]));
const power = (save) => moveStats(save, 'power');
const swing = (m, a, def) => m.land(a, m.all[def.t], def.d, [a.x, a.y - 60]);

// ── spawns ────────────────────────────────────────────────────────────
{
  const xs = Modes.spawnXs(8, 3).slice().sort((a, b) => a - b);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  ok('spawns', '8 fighters spread evenly across the page', Math.max(...gaps) - Math.min(...gaps) < 1 && Math.min(...gaps) >= 150, gaps.map(Math.round).join(','));
  ok('spawns', 'and all inside the walls with room to move', xs[0] >= 150 && xs[7] <= SHEET_W - 150, `${Math.round(xs[0])}..${Math.round(xs[7])}`);
  const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => Math.round(Modes.spawnXs(8, s)[0])));
  ok('spawns', 'which spot each seat gets changes with the match seed (no seat always on the wall)', firsts.size >= 4, [...firsts].join(','));
}

// ── free-for-all ──────────────────────────────────────────────────────
{
  const m = make('lms', 3);
  spread(m, [300, 800, 870]);
  const [a, b, c] = m.all;
  const hpC = c.hp;
  m.land(b, c, { dmg: 10, kb: 100, stagger: 0.2 }, [b.x, b.y - 60]);
  ok('ffa', 'a hit between two guests does full damage on the master (no gauntlet 25%)', hpC - c.hp >= 9.9, `${(hpC - c.hp).toFixed(1)}`);
  run(m, 0.2);
  ok('ffa', 'guests face the nearest fighter, not the master', b.facing === 1 && c.facing === -1, `${b.facing} ${c.facing}`);
}

// ── camera ────────────────────────────────────────────────────────────
{
  for (const [aspect, what] of [[2.1, 'a landscape phone'], [16 / 9, 'a 16:9 screen'], [4 / 3, 'a tablet']]) {
    const m = make('lms', 8);
    m.aspect = aspect;
    m.all.forEach((f, i) => park(m, f, 130 + i * (1420 / 7)));
    for (let i = 0; i < 240; i++) m.camera(1 / 60);
    const half = (m.camH * m.aspect) / 2;
    const allIn = m.all.every((f) => Math.abs(f.rag.centre()[0] - m.camX) < half - 20);
    ok('camera', `eight fighters wall to wall all fit on ${what}`, allIn, `camH ${Math.round(m.camH)}, half-width ${Math.round(half)}`);
  }
}

// ── bandana ───────────────────────────────────────────────────────────
{
  const m = make('bandana', 3);
  spread(m, [300, 1300, 1450]);
  ok('bandana-pickup', 'the bandana starts mid-sheet', Math.abs(m.obj.x - SHEET_W / 2) < 1 && m.obj.holder === -1);
  run(m, 1.5, () => spread(m, [300, 1300, 1450]));
  ok('bandana-pickup', 'and falls to the floor with nobody near', m.obj.holder === -1 && Math.abs(m.obj.y - (GROUND_Y - 8)) < 2, `y ${m.obj.y.toFixed(1)}`);
  park(m, m.all[0], SHEET_W / 2 + 10);
  run(m, 0.3);
  ok('bandana-pickup', 'touching it picks it up', m.obj.holder === 0, `holder ${m.obj.holder}`);
  const s0 = m.scores[0];
  run(m, 2);
  ok('bandana-score', 'holding it scores seconds (2 s held = 2 s)', Math.abs(m.scores[0] - s0 - 2) < 0.02 && m.scores[1] === 0, `${(m.scores[0] - s0).toFixed(3)}`);
  const [h, x] = [m.all[0], m.all[1]];
  park(m, x, h.x + 60);
  const jab = { dmg: 4, kb: 190, stagger: 0.22 }, kick = { dmg: 4, kb: 440, stagger: 0.55 };
  h.invuln = 0; m.land(x, h, jab, [x.x, x.y - 60]);
  h.invuln = 0; m.land(x, h, kick, [x.x, x.y - 60]);
  ok('bandana-knock', 'a jab or a kick (under the heavy line) does not knock it loose', m.obj.holder === 0);
  h.invuln = 0; m.land(x, h, { dmg: 4, kb: 500, stagger: 1 }, [x.x, x.y - 60]);
  ok('bandana-knock', 'a heavy/special hit knocks it loose', m.obj.holder === -1);
  ok('bandana-knock', 'and it flies out on the knockback, away from the hitter', m.obj.vx < -150 && m.obj.vy < -300, `v ${m.obj.vx.toFixed(0)},${m.obj.vy.toFixed(0)}`);
  // The one who just lost it cannot snatch it straight back, even back on their feet under it.
  Object.assign(h, { mode: 'live', gain: 1, attack: null });
  park(m, h, 700); park(m, x, 1300);
  m.obj.x = h.rag.x[0]; m.obj.y = h.rag.y[0]; m.obj.vx = m.obj.vy = 0; m.obj.grabT = 0;
  m.update(STEP); m.update(STEP);
  ok('bandana-regrab', 'the holder who was knocked cannot re-grab it at once', m.obj.holder === -1, `holder ${m.obj.holder}`);
  run(m, 1.2, () => { park(m, h, 700); m.obj.x = h.rag.x[0]; m.obj.y = h.rag.y[0]; m.obj.vy = 0; });
  ok('bandana-regrab', 'but can after a second', m.obj.holder === 0, `holder ${m.obj.holder}`);
  // KO drops it, and the KO'd fighter comes back.
  const m2 = make('bandana', 3);
  spread(m2, [300, SHEET_W / 2, 1450]);
  run(m2, 1.5, () => spread(m2, [300, SHEET_W / 2, 1450]));
  const holder = m2.all[m2.obj.holder] || m2.all[1];
  ok('bandana-pickup', 'whoever stands under it gets it as it lands', m2.obj.holder === 1);
  holder.invuln = 0;
  m2.land(m2.all[0], holder, { dmg: 999, kb: 300, stagger: 1 }, [holder.x - 40, holder.y - 60]);
  run(m2, 0.05);
  ok('bandana-knock', 'a KO drops the bandana', m2.obj.holder !== 1 && holder.dead);
  run(m2, 1.5);
  ok('respawn', 'a KO is still down after 1.5 s', holder.dead);
  run(m2, 2);
  ok('respawn', 'and back on the page within the respawn delay, at full HP', !holder.dead && holder.hp === holder.maxHp && holder.mode === 'live', `dead ${holder.dead} hp ${holder.hp}`);
  ok('respawn', 'with spawn protection', holder.invuln > 0);
  // First to N.
  const m3 = make('bandana', 3);
  m3.obj.holder = 2; m3.scores[2] = Modes.MODES.bandana.target - 0.05;
  run(m3, 0.2);
  ok('bandana-win', `first to ${Modes.MODES.bandana.target} s wins`, m3.over && m3.verdict.winner === 2 && m3.verdict.place[2] === 1, JSON.stringify(m3.verdict));
  // Time up: most seconds; a tie goes to overtime, where the first to pull ahead wins.
  const v = (scores, holder, timeUp, overtime) => Modes.verdict({ mode: 'bandana', timeUp, overtime, holder,
    fighters: scores.map((s, i) => ({ slot: i, hp: 50, dead: false, gone: false, out: 0, score: s })) });
  ok('bandana-win', 'time up: the most seconds wins', v([5, 12.3, 12.2], -1, true, false).winner === 1);
  ok('overtime', 'time up on a tie: overtime', v([5, 12, 12], -1, true, false).overtime === true);
  ok('overtime', 'in overtime the first to pull ahead wins at once', v([5, 12.1, 12], 1, false, true)?.winner === 1);
  ok('overtime', 'still tied when overtime runs out: the holder wins it', v([5, 12, 12], 2, true, true).winner === 2);
  const m4 = make('bandana', 2);
  m4.clock = 0.01;
  run(m4, 0.1);
  ok('overtime', 'the master plays overtime on a tie at time up', m4.overtime && !m4.over && m4.clock > 20);
}

// ── hill ──────────────────────────────────────────────────────────────
{
  const m = make('hill', 3);
  const zx = m.obj.x;
  spread(m, [zx, 300, 1450]);
  run(m, 2, () => spread(m, [zx, 300, 1450]));
  ok('hill-score', 'standing in it alone scores', Math.abs(m.scores[0] - 2) < 0.02 && m.obj.holder === 0, m.scores.map((s) => s.toFixed(2)).join(','));
  spread(m, [zx - 40, zx + 40, 1450]);
  const before = m.scores.slice();
  run(m, 2, () => spread(m, [zx - 40, zx + 40, 1450]));
  ok('hill-score', 'contested scores nothing', m.scores.every((s, i) => s === before[i]) && m.obj.contested, m.scores.map((s) => s.toFixed(2)).join(','));
  const M = Modes.MODES.hill;
  const m2 = make('hill', 2);
  run(m2, M.every - M.warn - 0.5);
  ok('hill-move', 'no warning yet', m2.obj.next == null);
  run(m2, 1);
  const nx = m2.obj.next;
  ok('hill-move', `a warning ${M.warn} s before it moves`, nx != null, `next ${nx}`);
  let near = 0;
  const zz = m2.obj;
  for (let i = 0; i < 60; i++) {
    const save = { ...zz };
    zz.next = null; zz.t = M.warn;
    m2.update(STEP);
    if (Math.abs(zz.next - zz.x) <= 380) near++;
    Object.assign(zz, save);
  }
  ok('hill-move', 'and always somewhere well away (60 draws)', near === 0, `${near} too close`);
  run(m2, M.warn);
  ok('hill-move', `it moves every ${M.every} s`, Math.abs(m2.obj.x - nx) < 1 && m2.obj.next == null, `x ${m2.obj.x}`);
  const v = (scores, timeUp, overtime) => Modes.verdict({ mode: 'hill', timeUp, overtime, holder: -1,
    fighters: scores.map((s, i) => ({ slot: i, hp: 50, dead: false, gone: false, out: 0, score: s })) });
  ok('hill-score', 'highest score wins at time up', v([10, 31.4, 2], true, false).winner === 1);
  ok('overtime', 'nobody scored: overtime, not a draw', v([0, 0, 0], true, false).overtime === true);
}

// ── last man standing ─────────────────────────────────────────────────
{
  const m = make('lms', 4);
  const kill = (i) => { const f = m.all[i]; f.invuln = 0; m.land(m.all[(i + 1) % 4], f, { dmg: 999, kb: 300, stagger: 1 }, [f.x - 30, f.y - 60]); run(m, 0.05); };
  kill(2); kill(0);
  run(m, 6);
  ok('lms', 'no respawns in last man standing', m.all[2].dead && m.all[0].dead);
  kill(3);
  run(m, 0.1);
  ok('lms', 'the last fighter alive wins, by KO', m.over && m.verdict.winner === 1 && m.verdict.ko, JSON.stringify(m.verdict));
  ok('lms', 'placements follow the order of elimination', JSON.stringify(m.verdict.place) === '[3,1,4,2]', JSON.stringify(m.verdict.place));
  // The deciding KO lands in the middle of a tick, after this tick's numbering: it still counts as the latest.
  const m5 = make('lms', 3);
  m5.all[0].invuln = 0; m5.land(m5.all[1], m5.all[0], { dmg: 999, kb: 300, stagger: 1 }, [0, 0]); run(m5, 0.05);
  m5.all[2].invuln = 0; m5.land(m5.all[1], m5.all[2], { dmg: 999, kb: 300, stagger: 1 }, [0, 0]);
  m5.checkEnd(STEP);
  ok('lms', 'the final KO of the fight places second, not last', JSON.stringify(m5.verdict?.place) === '[3,1,2]', JSON.stringify(m5.verdict?.place));
  const v = Modes.verdict({ mode: 'lms', timeUp: true, overtime: false, holder: -1,
    fighters: [{ slot: 0, hp: 20, dead: false, out: 0 }, { slot: 1, hp: 40, dead: false, out: 0 }, { slot: 2, hp: 0, dead: true, out: 1 }] });
  ok('lms', 'time up: the most HP left wins', v.winner === 1 && JSON.stringify(v.place) === '[2,1,3]');
}

// ── a leaver ──────────────────────────────────────────────────────────
{
  const m = make('bandana', 3);
  m.obj.holder = 1;
  m.eliminate(1);
  run(m, 0.05);
  ok('eliminate', 'a leaver holding the bandana drops it', m.obj.holder !== 1 && m.all[1].gone && m.all[1].dead);
  run(m, 5);
  ok('eliminate', 'and never respawns', m.all[1].dead && m.all[1].gone);
  m.scores = [1, 9, 2];
  const v = Modes.verdict(Modes.viewOf(m, true));
  ok('eliminate', 'a leaver cannot win, even on the most seconds, and places last', v?.winner === 2 && v.place[1] === 3, JSON.stringify(v));
}

// ── the wire: guests decide from snapshots exactly what the master decided ─────
{
  let same = 0, total = 0;
  for (const mode of ['lms', 'bandana', 'hill']) {
    for (let k = 0; k < 6; k++) {
      const m = make(mode, 4, k + 1);
      const brains = m.all.map((f, i) => new ObjectiveBrain(f, 0.6, ['power', 'rise', 'dash', 'toss'], m.saves[i]));
      run(m, 300, () => { if (!m.over) brains.forEach((b) => b.update(STEP, m)); });
      if (!m.over) continue;
      const fighters = m.all.map((f, i) => ({ slot: i, f, ack: 0, score: m.scores[i], cds: [] }));
      const s = W.unSnap(W.snap(1, 1, m.phase, m.clock, m.timeUp, fighters, [], { mode: Modes.MODES[mode].id, overtime: m.overtime, obj: m.obj }));
      const g = Modes.verdict(Modes.viewOfSnap(s, mode));
      total++;
      if (JSON.stringify(g) === JSON.stringify(m.verdict)) same++;
      else console.log('   ', mode, JSON.stringify(m.verdict), 'vs', JSON.stringify(g));
    }
  }
  ok('wire', 'a guest\'s verdict from the final snapshot equals the master\'s, every mode', total >= 15 && same === total, `${same}/${total}`);
  const m = make('bandana', 3);
  m.obj.holder = 2; m.scores = [1.26, 7.04, 12.35];
  const fs = m.all.map((f, i) => ({ slot: i, f, ack: 0, score: m.scores[i], cds: [] }));
  const s = W.unSnap(W.snap(1, 1, m.phase, m.clock, false, fs, [], { mode: 2, overtime: true, obj: m.obj }));
  ok('wire', 'scores, holder and overtime ride the snapshot', s.fighters.map((F) => F.score).join() === '1.3,7,12.4' && s.obj.holder === 2 && s.overtime, `${s.fighters.map((F) => F.score)} h${s.obj.holder}`);
}

// ── host migration: keyframe + newest snapshot = the same fight ──────────
{
  for (const mode of ['bandana', 'hill', 'lms']) {
    const m = make(mode, 3, 9);
    const brains = m.all.map((f, i) => new ObjectiveBrain(f, 0.6, ['power', 'rise', 'dash'], m.saves[i]));
    const tick = () => { if (!m.over) brains.forEach((b) => b.update(STEP, m)); };
    run(m, 8, tick);
    const key = JSON.parse(JSON.stringify(matchState(m)));
    run(m, 0.7, tick);
    // The objective changed hands after the keyframe: only the snapshot knows.
    if (m.obj) { m.obj.holder = m.obj.holder === 2 ? 1 : 2; if (mode === 'bandana') { m.obj.x = m.all[m.obj.holder].rag.x[0]; m.obj.y = m.all[m.obj.holder].rag.y[0]; } }
    const snapOf = (t) => W.unSnap(W.snap(1, t, m.phase, m.clock, m.timeUp, m.all.map((f, i) => ({ slot: i, f, ack: 0, score: m.scores[i], cds: [] })), m.projectiles, { mode: Modes.MODES[mode].id, overtime: m.overtime, obj: m.obj }));
    const prev = snapOf(1);
    const was = m.all.map((f) => Array.from(f.rag.y));
    run(m, 1 / 30, tick);
    const s = snapOf(1 + 1 / 30);
    // A guest's Match (built at the start, drawn from snapshots ever since) takes over.
    const g = new PvpMatch({ level: { ...arenaLevel(9, mode) }, saves: [0, 1, 2].map(() => pvpSave([0])), you: 1,
      seats: [0, 1, 2].map((i) => ({ name: `P${i}` })), mode, seed: 9 });
    applyState(g, key);
    patchFromSnap(g, s, prev);
    const posErr = Math.max(...m.all.map((f, i) => Math.max(Math.abs(f.x - g.all[i].x), ...Array.from(f.rag.y, (v, k) => Math.abs(v - g.all[i].rag.y[k])))));
    ok('migration', `${mode}: the new master stands everyone where the old one last had them`, posErr <= 0.2, `max err ${posErr.toFixed(3)}`);
    // Velocity: the old master's mean motion over the last snapshot interval (4 steps).
    const velErr = Math.max(...m.all.map((f, i) => Math.max(...Array.from(f.rag.y, (v, k) => Math.abs((v - was[i][k]) / 4 - (g.all[i].rag.y[k] - g.all[i].rag.py[k]))))));
    const moving = Math.max(...m.all.map((f, i) => Math.max(...Array.from(f.rag.y, (v, k) => Math.abs(v - was[i][k]) / 4))));
    ok('migration', `${mode}: and moving the way they were moving`, velErr < 0.1 && (moving < 0.5 || velErr < moving / 4), `max per-step velocity err ${velErr.toFixed(3)} (fastest point ${moving.toFixed(2)}/step)`);
    ok('migration', `${mode}: scores, holder and HP carried over`, m.scores.every((v, i) => Math.abs(v - g.scores[i]) <= 0.05) &&
      (m.obj ? m.obj.holder === g.obj.holder : true) && m.all.every((f, i) => Math.abs(f.hp - g.all[i].hp) <= 0.05),
      `${m.scores.map((v) => v.toFixed(1))} vs ${g.scores.map((v) => v.toFixed(1))}`);
    ok('migration', `${mode}: everyone's real moves come with the keyframe`, g.saves.every((sv) => Object.keys(sv.moves).length === 8));
    g.eliminate(0);
    const gb = g.all.map((f, i) => new ObjectiveBrain(f, 0.6, ['power', 'rise', 'dash'], g.saves[i]));
    let t = 0;
    while (!g.over && t < 400) { if (g.phase === W.PHASE.FIGHT) gb.forEach((b) => b.update(STEP, g)); g.update(STEP); t += STEP; }
    ok('migration', `${mode}: carries on to a result without the old master`, g.over && g.verdict.winner !== 0 && g.all.every((f) => Number.isFinite(f.x)), `${t.toFixed(0)} s, ${JSON.stringify(g.verdict)}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
