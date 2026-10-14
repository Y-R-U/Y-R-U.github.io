#!/usr/bin/env node
/**
 * QUICK FIGHT ghosts, in node, against the real engine:
 *   personality  each style plays measurably like itself (seeded fights vs a plain bot)
 *   sneak        SNEAK hangs back from fair fights and picks off the hurt ones (4-way LMS)
 *   random       RANDOM's style schedule: pure in (seed, clock), switches every 12-25 s
 *   fair         a ghost fights with the skill and loadout the server gave it
 *   netfight     ghost seats after the people's; only the master runs their brains; a new
 *                master after a hand-over runs the same ghosts on from the keyframe
 *   local        a ghost-only quick fight: room modes, and 1v1 as a best of 3
 *   names        a ghost's "*" survives every place a name is shortened or drawn
 *   plain        a Brain with no style plays EXACTLY as HEAD's (campaign + practice balance)
 *
 *   node tools/quickgate.mjs
 *   node tools/quickgate.mjs --falsify   JS mutants (each must turn its section red) and Go
 *                                        mutants of server/ (each must turn go test -run Quick red)
 */
import { spawnSync, execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const SRC = join(GAME, 'js');
const JS = process.env.QUICK_JS || SRC;
const args = process.argv.slice(2);

if (args.includes('--falsify')) {
  const JS_MUTANTS = [
    ['personality', 'net/quick.js', 'brick: { react: 1.4, block: 2.4,', 'brick: { react: 1, block: 1,'],
    ['personality', 'net/quick.js', 'inkslinger: { keep: 3.3, ranged: true,', 'inkslinger: { keep: 0, ranged: false,'],
    ['personality', 'net/quick.js', 'rumble: { react: 0.7, block: 0.4, aggro: 1.1, retreat: 0.1,', 'rumble: { react: 1, block: 1, aggro: 1, retreat: 1,'],
    ['personality', 'net/quick.js', 'zippy: { keep: 1.8, runAfter: 0.45,', 'zippy: { keep: 0, runAfter: 0,'],
    ['personality', 'ai.js', "    if (this.intent === 'hover') {", "    if (false) {"],
    ['sneak', 'net/objective.js', 'if (info.targets.length && !(g && g.flee)) g = lurk(', 'if (false) g = lurk('],
    ['random', 'net/quick.js', 'at += 12 + r() * 13;', 'at += 60;'],
    ['random', 'net/quick.js', "if (s !== this.style) { this.style = s; this.ob.setStyle(STYLES[s]); }", ''],
    ['fair', 'net/quick.js', "const skill = Math.max(0.3, Math.min(0.9, +ghost.skill || 0.55));", 'const skill = 0.55;'],
    ['fair', 'net/quick.js', 'new ObjectiveBrain(f, skill, movesOf(ghost.lo), save,', 'new ObjectiveBrain(f, skill, movesOf([0, 1, 2, 3, 4, 5, 6, 7]), save,'],
    ['netfight', 'net/fight.js', '          if (this.brains[i]) { this.brains[i].update(STEP, mp); return; }\n', ''],
    ['netfight', 'net/fight.js', 'peers() { return this.ids.filter((_, i) => i < this.humans && ', 'peers() { return this.ids.filter((_, i) => '],
    ['local', 'net/fight.js', "    if (w >= 0 || this.draws >= 3) {", "    if (true) {"],
    ['local', 'net/fight.js', 'if (st.ghost) return new GhostBrain(f, st.ghost, this.saves[i]);', ''],
    ['names', 'net/modes.js', "return s.endsWith('*') ? s.slice(0, n - 1) + '*' : s.slice(0, n);", 'return s.slice(0, n);'],
    ['names', 'net/quick.js', "name: String(g.name || 'Fighter*')", "name: String(g.name || 'Fighter*').replace(/\\*$/, '')"],
    ['plain', 'ai.js', '    this.style = null;\n', '    this.style = { ...PLAIN_STYLE, retreat: 0.5 };\n'],
  ];
  // Go: each must turn `go test -run Quick` red (the server's quick rules).
  const GO_MUTANTS = [
    ['ghost reveal', 'quick.go', '\t\t\t\th.quickOffer(m)\n\t\t\t\tbreak', '\t\t\t\tbreak'],
    ['ghost replacement', 'quick.go', '\tfor len(m.ghosts) > need {', '\tfor false && len(m.ghosts) > need {'],
    ['seat filling', 'quick.go', '\treturn 4\n}', '\treturn 3\n}'],
    ['seat filling (duel)', 'rooms.go', '\t\tif m.typ == "duel" && len(kept) == 2 {', '\t\tif false {'],
    ['never ranked (stats)', 'rooms.go', '\t\th.st.recordQuick(m.id, m.typ, score, rows)', '\t\th.st.recordMatch(m.id, m.typ, m.friend, score, rows)'],
    ['never ranked (duel stats)', 'hub.go', '\t\th.st.recordQuick(m.id, m.typ, score, seats)', '\t\th.st.recordMatch(m.id, m.typ, m.friend, score, seats)'],
    ['never ranked (counted)', 'rooms.go', '"counted": s.ranked && !rows[i].NoStats && !m.quick', '"counted": s.ranked && !rows[i].NoStats'],
    ['allowance spent', 'quick.go', '\th.lobbyDirt = true\n\th.startMatch(m)', '\th.lobbyDirt = true\n\tm.state = mStarting\n\tfor _, s := range m.seats {\n\t\ts.spent = &spendResult{OK: true, Remaining: -1}\n\t}\n\th.maybeBegin(m)'],
    ['allowance needs sign-in', 'quick.go', '\tif !c.ranked && !h.openLobby {\n\t\th.send(c, map[string]any{"t": "err", "code": "signin", "msg": "Sign in for a quick fight.', '\tif false {\n\t\th.send(c, map[string]any{"t": "err", "code": "signin", "msg": "Sign in for a quick fight.'],
    ['* naming', 'quick.go', 'Name: name + "*"', 'Name: name'],
    ['* only for ghosts', 'names.go', "r == '<', r == '>', isStar(r),", "r == '<', r == '>',"],
    ['no * look-alikes', 'names.go', "\tcase r >= 0x2722 && r <= 0x273D,", "\tcase false,"],
    ['the filling joiner is offered its peers', 'quick.go', '\th.quickPlan(m, false)\n\th.quickOffer(m)', '\tif len(m.seats) >= quickCap(m.typ) {\n\t\th.quickStart(m)\n\t\treturn\n\t}\n\th.quickPlan(m, false)\n\th.quickOffer(m)'],
    ['decline is one person leaving', 'hub.go', '\t\t\tif mt.room || mt.quick {', '\t\t\tif false {'],
    ['a 1v1 stays a room while starting', 'quick.go', '\th.quickStrength(m)\n\th.lobbyDirt = true', '\th.quickStrength(m)\n\tif m.typ == "duel" && len(kept) == 2 {\n\t\tm.room, m.ghosts = false, nil\n\t}\n\th.lobbyDirt = true'],
    ['a lone person earns no event points', 'rooms.go', '\t\tlone = in < 2', '\t\tlone = false'],
    ['no ghost twin of a joiner', 'quick.go', 'if !names[strings.ToLower(strings.TrimSuffix(g.Name, "*"))] {', 'if true {'],
    ['shown ghosts stay', 'quick.go', '\t\tif drop < 0 && !now {\n\t\t\tbreak\n\t\t}\n', ''],
    ['people ranked among themselves', 'rooms.go', '\t\thw = humanWinner(place, len(m.seats))\n', ''],
    ['last person fights on', 'rooms.go', 'case len(left) == 1 && len(m.ghosts) == 0:', 'case len(left) == 1:'],
    ['no duplicate personality', 'quick.go', '\t\tif p.id != "random" && taken[p.id] {\n\t\t\tcontinue\n\t\t}\n', ''],
    ['separate from FIND A FIGHT', 'rooms.go', 'm.room && !m.friend && !m.quick && m.typ == typ', 'm.room && !m.friend && m.typ == typ'],
  ];
  let bad = 0;
  for (const [section, file, from, to] of JS_MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'quickgate-'));
    cpSync(SRC, tmp, { recursive: true });
    const p = join(tmp, file);
    const src = readFileSync(p, 'utf8');
    if (!src.includes(from)) { console.log(`STALE mutant [${section}] ${file}: "${from.slice(0, 60)}"`); bad++; rmSync(tmp, { recursive: true, force: true }); continue; }
    writeFileSync(p, src.replace(from, to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, QUICK_JS: tmp }, encoding: 'utf8' });
    rmSync(tmp, { recursive: true, force: true });
    const red = new Set((r.stdout.match(/^FAIL \[([\w-]+)\]/gm) || []).map((l) => l.slice(6, -1)));
    const killed = red.has(section);
    if (!killed) bad++;
    console.log(`${killed ? 'red ' : 'SURVIVED'}  [${section}] ${file}: ${from.slice(0, 70).replace(/\n/g, '⏎')}${red.size && !killed ? `  (red: ${[...red].join(',')})` : ''}`);
  }
  const goSrc = mkdtempSync(join(tmpdir(), 'quickgate-go-'));
  cpSync(join(GAME, 'server'), goSrc, { recursive: true });
  // Another lane may be mid-edit in server/: if the tree does not build, test against HEAD's files of theirs.
  if (spawnSync('go', ['vet', '.'], { cwd: goSrc }).status !== 0) {
    for (const f of ['main.go', 'events.go', 'events_test.go', 'eventart.go', 'eventart_test.go', 'abuse_test.go']) {
      try { writeFileSync(join(goSrc, f), execSync(`git show HEAD:gms/2d/ragdojo/server/${f}`, { cwd: GAME })); } catch {}
    }
    console.log('(server/ does not build as it stands; Go mutants run against HEAD\'s events files)');
  }
  const base = spawnSync('go', ['test', '-count=1', '-run', 'Quick', '.'], { cwd: goSrc, encoding: 'utf8' });
  if (base.status !== 0) { console.log('the unmutated server fails go test -run Quick:\n' + base.stdout.slice(-800)); process.exit(1); }
  for (const [what, file, from, to] of GO_MUTANTS) {
    const p = join(goSrc, file);
    const orig = readFileSync(p, 'utf8');
    if (!orig.includes(from)) { console.log(`STALE go mutant [${what}] ${file}: "${from.slice(0, 60)}"`); bad++; continue; }
    writeFileSync(p, orig.replace(from, to));
    const r = spawnSync('go', ['test', '-count=1', '-run', 'Quick', '.'], { cwd: goSrc, encoding: 'utf8', timeout: 300000 });
    writeFileSync(p, orig);
    const killed = r.status !== 0;
    if (!killed) bad++;
    const tests = [...r.stdout.matchAll(/--- FAIL: (TestQuick\w+)/g)].map((x) => x[1].replace('TestQuick', ''));
    const why = (r.stdout.match(/^.*(cannot|undefined|declared).*$/m) || [''])[0].trim();
    console.log(`${killed ? 'red ' : 'SURVIVED'}  [go: ${what}] ${file}${killed ? '  ' + (tests.join(', ') || why).slice(0, 140) : ''}`);
  }
  rmSync(goSrc, { recursive: true, force: true });
  const n = JS_MUTANTS.length + GO_MUTANTS.length;
  console.log(bad ? `\n${bad} of ${n} mutant(s) survived` : `\nall ${n} mutants turned red (${JS_MUTANTS.length} JS, ${GO_MUTANTS.length} Go)`);
  process.exit(bad ? 1 : 0);
}

// ── the gate ──────────────────────────────────────────────────────────
const noopCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 } : () => ({ addColorStop() {} })), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.location = { search: '', hostname: 'node' };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const imp = (dir, f) => import(pathToFileURL(join(dir, f)).href);
const { PvpMatch, pvpSave, arenaLevel, NetFight, LocalFight, matchState } = await imp(JS, 'net/fight.js');
const Q = await imp(JS, 'net/quick.js');
const Modes = await imp(JS, 'net/modes.js');
const { ObjectiveBrain } = await imp(JS, 'net/objective.js');
const W = await imp(JS, 'net/wire.js');

let pass = 0, fail = 0;
const ok = (section, n, c, x = '') => {
  c ? pass++ : fail++;
  console.log(`${c ? 'PASS' : 'FAIL'} [${section}] ${n}${x ? '  ' + x : ''}`);
};
const STEP = 1 / 120;
const realRandom = Math.random;
const seeded = (seed) => { Math.random = Q.rng(seed); };

/** One fight: slot 0 is the subject (a ghost or a plain bot), the rest plain bots. Returns what it did. */
function fight({ mode = 'duel', subject, n = 2, secs = 25, seed = 1, early = Infinity }) {
  seeded(seed);
  const lo = subject.lo || [0, 1, 2, 3];
  const seats = Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
  const saves = seats.map((_, i) => pvpSave(i === 0 ? lo : [0, 1, 2, 3]));
  const m = new PvpMatch({ level: { ...arenaLevel(seed, mode) }, saves, you: n - 1, seats, mode, seed });
  const ids = (l) => Q.movesOf(l);
  const brains = m.all.map((f, i) => (i === 0
    ? (subject.pers ? new Q.GhostBrain(f, { pers: subject.pers, skill: 0.6, seed, lo }, saves[0]) : new ObjectiveBrain(f, 0.6, ids(lo), saves[0]))
    : new ObjectiveBrain(f, 0.6, ids([0, 1, 2, 3]), saves[i])));
  m.begin();
  const me = m.all[0];
  let met = false;
  const S = { steps: 0, block: 0, dist: 0, live: 0, close: 0, away: 0, toward: 0, attacks: 0, projs: 0, early: 0, earlyN: 0, dealt: 0, dealtHurt: 0, firstHit: 0, kos: 0 };
  let lastAtk = null;
  const seen = new Set();
  const land = m.land.bind(m);
  m.land = (a, t, def, from) => {
    const hp = t.hp, hurt = t.hp / t.maxHp < 0.55;
    const r = land(a, t, def, from);
    if (a === me && t.hp < hp) {
      S.dealt += hp - t.hp; if (hurt) S.dealtHurt += hp - t.hp;
      if (!S.firstHit) S.firstHit = m.time;
      if (t.hp <= 0 || t.dead) S.kos++;
    }
    return r;
  };
  for (let i = 0; i < Math.round(secs * 120); i++) {
    if (m.phase === W.PHASE.FIGHT && !m.over) {
      brains.forEach((b) => b.update(STEP, m));
      if (!me.dead) {
        const foes = m.all.filter((o) => o !== me && !o.dead);
        if (foes.length) {
          const near = foes.reduce((a, b) => (Math.abs(b.x - me.x) < Math.abs(a.x - me.x) ? b : a));
          const d = Math.abs(near.x - me.x);
          S.steps++;
          if (me.blocking) S.block++;
          // Distance and footwork only while both stand: knockback flight is not a choice.
          met = met || d < 130;
          if (met && me.mode === 'live' && near.mode === 'live') {
            S.live++; S.dist += d;
            if (d < 100) S.close++;
            if (Math.abs(me.vx) > 30 && Math.sign(me.vx) === -Math.sign(near.x - me.x)) S.away++;
            if (Math.abs(me.vx) > 30 && Math.sign(me.vx) === Math.sign(near.x - me.x)) S.toward++;
          }
          if (m.time < early) { S.early += d; S.earlyN++; }
        }
      }
      if (me.attack && me.attack !== lastAtk) S.attacks++;
      lastAtk = me.attack;
      for (const p of m.projectiles) if (p.owner === me && !seen.has(p)) { seen.add(p); S.projs++; }
    }
    m.update(STEP);
    if (m.over) break;
  }
  Math.random = realRandom;
  S.place = m.verdict?.place?.[0] || n;
  S.won = m.verdict?.winner === 0 ? 1 : 0;
  return S;
}

function profile(subject, opts = {}, runs = 8) {
  const T = { steps: 0, block: 0, dist: 0, live: 0, close: 0, away: 0, toward: 0, attacks: 0, projs: 0, early: 0, earlyN: 0, dealt: 0, dealtHurt: 0, firstHit: 0, kos: 0, place: 0, won: 0, secs: 0 };
  for (let k = 0; k < runs; k++) {
    const S = fight({ subject, seed: 101 + k * 7, ...opts });
    for (const key of Object.keys(S)) T[key] += S[key];
    T.secs += S.steps / 120;
  }
  return {
    block: T.block / T.steps, dist: T.dist / Math.max(1, T.live), close: T.close / Math.max(1, T.live), away: T.away / Math.max(1, T.live), toward: T.toward / Math.max(1, T.live), atkRate: T.attacks / Math.max(1, T.secs),
    projs: T.projs / runs, early: T.early / Math.max(1, T.earlyN), hurtShare: T.dealtHurt / Math.max(1, T.dealt),
    firstHit: T.firstHit / runs, place: T.place / runs, won: T.won / runs, kosPer100: (100 * T.kos) / Math.max(1, T.dealt),
  };
}
const fmt = (p) => Object.entries(p).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ');

// ── personality ───────────────────────────────────────────────────────
{
  const RANGED_LO = [0, 1, 7, 3];
  const plain = profile({});
  const plainR = profile({ lo: RANGED_LO });
  const P = Object.fromEntries(['brick', 'zippy', 'rumble'].map((p) => [p, profile({ pers: p })]));
  P.inkslinger = profile({ pers: 'inkslinger', lo: RANGED_LO });
  console.log(`  plain      ${fmt(plain)}\n  plain(rng) ${fmt(plainR)}`);
  for (const [k, v] of Object.entries(P)) console.log(`  ${k.padEnd(10)} ${fmt(v)}`);
  ok('personality', 'BRICK blocks far more than a plain fighter', P.brick.block > plain.block * 2 && P.brick.block > 0.1, `${P.brick.block.toFixed(2)} vs ${plain.block.toFixed(2)}`);
  ok('personality', 'ZIPPY keeps its distance and backs off after hitting', P.zippy.close < plain.close * 0.8 && P.zippy.away > plain.away * 2,
    `in reach ${P.zippy.close.toFixed(2)} vs ${plain.close.toFixed(2)} of the time, backing off ${P.zippy.away.toFixed(2)} vs ${plain.away.toFixed(2)}`);
  ok('personality', 'RUMBLE keeps coming, swings more and hardly blocks or backs off', P.rumble.atkRate > plain.atkRate * 1.15 && P.rumble.block < plain.block * 0.7 && P.rumble.away < plain.away * 0.5,
    `atk/s ${P.rumble.atkRate.toFixed(2)} vs ${plain.atkRate.toFixed(2)}, block ${P.rumble.block.toFixed(3)}, away ${P.rumble.away.toFixed(2)} vs ${plain.away.toFixed(2)}`);
  ok('personality', 'INKSLINGER fights from range and throws far more', P.inkslinger.dist > plainR.dist * 1.3 && P.inkslinger.close < plainR.close * 0.7 && P.inkslinger.projs > plainR.projs * 1.5,
    `dist ${P.inkslinger.dist.toFixed(0)} vs ${plainR.dist.toFixed(0)}, thrown ${P.inkslinger.projs.toFixed(1)} vs ${plainR.projs.toFixed(1)}`);
  const all = Object.values(P);
  ok('personality', 'no style is a walkover: each still lands blows', all.every((p) => p.atkRate > 0.2), all.map((p) => p.atkRate.toFixed(2)).join(','));
  // Fair, not walkovers: over 20 full 1v1 rounds against an equal plain fighter, every style wins some and loses some.
  const W20 = Object.fromEntries(['brick', 'zippy', 'rumble', 'inkslinger', 'sneak'].map((p) => [p, profile({ pers: p, lo: p === 'inkslinger' ? RANGED_LO : undefined }, { secs: 63 }, 20).won]));
  const base = profile({}, { secs: 63 }, 20).won;
  ok('personality', 'every style wins 20-80% of 1v1 rounds against an equal plain fighter', Object.values(W20).every((w) => w >= 0.2 && w <= 0.8),
    Object.entries(W20).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ') + ` (plain ${Math.round(base * 100)}%)`);
}

// ── sneak ─────────────────────────────────────────────────────────────
{
  const o = { mode: 'lms', n: 4, secs: 60, early: 18 };
  const plain = profile({}, o, 10), sneak = profile({ pers: 'sneak' }, o, 10);
  console.log(`  lms plain ${fmt(plain)}\n  lms sneak ${fmt(sneak)}`);
  ok('sneak', 'SNEAK hangs back while everyone is fresh', sneak.early > plain.early * 1.2, `${sneak.early.toFixed(0)} vs ${plain.early.toFixed(0)} from the nearest, first 15 s`);
  ok('sneak', 'and picks off the hurt: more of its damage on them, more finishing blows', sneak.hurtShare > plain.hurtShare + 0.04 && sneak.kosPer100 > plain.kosPer100 * 1.5,
    `on the hurt ${sneak.hurtShare.toFixed(2)} vs ${plain.hurtShare.toFixed(2)}, KOs per 100 damage ${sneak.kosPer100.toFixed(2)} vs ${plain.kosPer100.toFixed(2)}`);
  // It still plays the objective: on the hill it ends up holding it some of the time.
  seeded(9);
  const seats = Array.from({ length: 4 }, (_, i) => ({ name: `P${i}` }));
  const saves = seats.map(() => pvpSave([0, 1, 2, 3]));
  const m = new PvpMatch({ level: { ...arenaLevel(9, 'hill') }, saves, you: 3, seats, mode: 'hill', seed: 9 });
  const b = m.all.map((f, i) => (i === 0 ? new Q.GhostBrain(f, { pers: 'sneak', skill: 0.6, seed: 3, lo: [0, 1, 2, 3] }, saves[0]) : new ObjectiveBrain(f, 0.6, Q.movesOf([0, 1, 2, 3]), saves[i])));
  m.begin();
  for (let i = 0; i < 120 * 70 && !m.over; i++) { if (m.phase === W.PHASE.FIGHT) b.forEach((x) => x.update(STEP, m)); m.update(STEP); }
  Math.random = realRandom;
  ok('sneak', 'it still plays the objective (scores on the hill)', m.scores[0] > 2, m.scores.map((s) => s.toFixed(1)).join(','));
}

// ── random ────────────────────────────────────────────────────────────
{
  const seq = (seed) => { const out = []; let cur = Q.styleAt(seed, 0), at = 0; for (let t = 0; t < 600; t += 0.25) { const s = Q.styleAt(seed, t); if (s !== cur) { out.push(t - at); at = t; cur = s; } } return out; };
  const gaps = [11, 222, 3333, 44444].flatMap(seq);
  ok('random', 'RANDOM changes style every 12-25 s', gaps.length > 40 && gaps.every((g) => g >= 11.75 && g <= 25.25), `${gaps.length} switches, ${Math.min(...gaps).toFixed(1)}-${Math.max(...gaps).toFixed(1)} s`);
  ok('random', 'the schedule is a pure function of seed + clock (a new master agrees)', [0, 13.3, 77, 300].every((t) => Q.styleAt(42, t) === Q.styleAt(42, t)) && Q.styleAt(42, 100) === Q.styleAt(42, 100));
  const used = new Set([1, 2, 3, 4, 5, 6, 7, 8].flatMap((s) => [0, 30, 60, 90, 120, 150].map((t) => Q.styleAt(s, t))));
  ok('random', 'it uses every named style', Q.NAMED.every((s) => used.has(s)), [...used].join(','));
  const f = { x: 0 };
  const g = new Q.GhostBrain(new PvpMatch({ level: { ...arenaLevel(1, 'lms') }, saves: [pvpSave([0]), pvpSave([0])], you: 0, seats: [{ name: 'a' }, { name: 'b' }], mode: 'lms', seed: 1 }).all[1], { pers: 'random', seed: 77, skill: 0.6, lo: [0] }, pvpSave([0]));
  const fake = { time: 0, all: [], projectiles: [], modeId: 'lms' };
  const styles = [];
  for (const t of [0, 30, 60, 90, 120]) { fake.time = t; g.update(STEP, { ...fake, all: [g.f] }); styles.push(g.style + ':' + (g.ob.brain.style?.keep ?? '?')); }
  ok('random', 'a RANDOM ghost actually changes its Brain mid-match', new Set(styles).size >= 3, styles.join(' '));
  void f;
}

// ── fair ──────────────────────────────────────────────────────────────
{
  const m = new PvpMatch({ level: { ...arenaLevel(1, 'lms') }, saves: [pvpSave([0]), pvpSave([0, 3])], you: 0, seats: [{ name: 'a' }, { name: 'b' }], mode: 'lms', seed: 1 });
  const g = new Q.GhostBrain(m.all[1], { pers: 'brick', seed: 5, skill: 0.42, lo: [0, 3] }, pvpSave([0, 3]));
  ok('fair', 'the ghost fights at the skill the server gave it', Math.abs(g.ob.brain.skill - 0.42) < 1e-9, String(g.ob.brain.skill));
  ok('fair', 'with exactly the specials of its loadout', g.ob.brain.moves.join() === 'power,dash', g.ob.brain.moves.join());
}

// ── netfight ──────────────────────────────────────────────────────────
function fakeClient() {
  const c = { sent: [], reports: [], handlers: {} };
  Object.assign(c, {
    on: (e, f) => { c.handlers[e] = f; }, off: () => {}, send: (id, lane, b) => c.sent.push(id),
    link: () => ({ rtt: 30, direct: true, rttN: 3 }), pingLinks: () => {}, sendRtts: () => {}, stall: () => {},
    report: (...a) => c.reports.push(a),
  });
  return c;
}
const GHOSTS = [{ pers: 'rumble', name: 'Rumble*', seed: 11, skill: 0.6, lo: [0, 3, 4] }, { pers: 'random', name: 'Maddy*', seed: 12, skill: 0.55, lo: [0, 1] }];
const goMsg = (you, master) => ({ match: 'm1', round: 1, master, you, mode: 'lms', arena: 77, score: [0, 0], out: [false, false],
  seats: [{ id: 'A', name: 'Ann' }, { id: 'B', name: 'Bob' }], ghosts: GHOSTS, quick: true });
{
  globalThis.performance.now = (() => { let t = 0; return () => (t += 1000 / 60); })();
  const cA = fakeClient(), cB = fakeClient();
  const A = new NetFight({ client: cA, go: goMsg(0, 0), loadout: [0, 1] });
  const B = new NetFight({ client: cB, go: goMsg(1, 0), loadout: [0, 2] });
  const names = A.match.all.map((f) => f.netName);
  ok('netfight', 'four fighters: the two people, then the ghosts', names.join() === 'Ann,Bob,Rumble*,Maddy*', names.join());
  ok('netfight', 'brains only for the ghost seats', A.brains.map((b) => !!b).join() === 'false,false,true,true');
  ok('netfight', 'ghosts are not peers: nothing is sent to them', A.peers().join() === 'B' && B.peers().join() === 'A', `${A.peers()} / ${B.peers()}`);
  // A ghost "acts" in a frame when it walks, swings or blocks: only a running brain does that.
  const acting = (nf, secs) => {
    const n = [0, 0];
    for (let i = 0; i < 60 * secs; i++) {
      nf.step(1 / 60, { moveX: 0, block: false });
      nf.match.all.slice(2).forEach((f, k) => { if (!f.dead && (Math.abs(f.vx) > 20 || f.attack || f.blocking)) n[k]++; });
    }
    return n.map((v) => v / (60 * secs));
  };
  seeded(5);
  A.match.begin(); A.match.clock = 0.01;
  const act = acting(A, 6);
  ok('netfight', 'the master runs the ghosts (they walk and fight)', act.every((v) => v > 0.15), act.map((v) => v.toFixed(2)).join(','));
  ok('netfight', 'the master never sends to a ghost', !cA.sent.some((id) => String(id).startsWith('ghost:')), [...new Set(cA.sent)].join(','));
  // Hand-over: B gets the last keyframe, then becomes master and must run the same ghosts on.
  B.keyframe = matchState(A.match);
  const gx = B.match.all.slice(2).map((f, i) => B.keyframe.fighters[i + 2].x);
  B.migrate(1, 0);
  const y0 = B.match.all.slice(2).map((f) => f.x);
  ok('netfight', 'the new master rebuilds the ghosts from the keyframe', y0.every((x, i) => Math.abs(x - gx[i]) < 1), `${y0.map(Math.round)} vs ${gx.map(Math.round)}`);
  const act2 = acting(B, 6);
  ok('netfight', 'and runs them on as master', B.isMaster && act2.every((v) => v > 0.15), act2.map((v) => v.toFixed(2)).join(','));
  const guest = new NetFight({ client: fakeClient(), go: goMsg(1, 0), loadout: [0] });
  guest.match.begin(); guest.match.clock = 0.01;
  const act3 = acting(guest, 3);
  ok('netfight', 'a guest never runs them (it draws the master\'s)', act3.every((v) => v === 0), act3.join(','));
  guest.destroy();
  Math.random = realRandom;
  ok('netfight', 'a RANDOM ghost picks the style the clock says, on any master', B.brains[3].style === Q.styleAt(12, B.match.time), `${B.brains[3].style} @ ${B.match.time.toFixed(1)}`);
  A.destroy(); B.destroy();
}

// ── local ─────────────────────────────────────────────────────────────
{
  const room = new LocalFight({ mode: 'bandana', ghosts: GHOSTS.concat([{ pers: 'sneak', name: 'Sneak*', seed: 3, skill: 0.6, lo: [0] }]), seed: 5 });
  ok('local', 'a ghost-only room: you and the server\'s ghosts, by name', room.match.all.map((f) => f.netName).join() === 'YOU,Rumble*,Maddy*,Sneak*', room.match.all.map((f) => f.netName).join());
  ok('local', 'each ghost on its own GhostBrain', room.brains.slice(1).every((b) => b instanceof Q.GhostBrain) && room.brains[1].style === 'rumble');
  let done = null, rounds = 0;
  const duel = new LocalFight({ mode: 'duel', ghosts: [GHOSTS[0]], seed: 9, onDone: (v) => { done = v; }, onRound: () => { rounds++; } });
  ok('local', 'a 1v1 quick fight stays a 1v1', duel.mode === 'duel' && duel.match.all.length === 2);
  const win = (slot) => { const m = duel.match; m.phase = W.PHASE.FIGHT; m.finishWith({ winner: slot, ko: true }, false); m.endT = 99; duel.step(1 / 60, null); };
  win(1); win(0);
  ok('local', 'one round each: a third round', !done && rounds === 2 && duel.round === 3, `rounds ${rounds}, done ${JSON.stringify(done)}`);
  win(0);
  ok('local', 'best of 3: the second round win ends it', done && done.winner === 0 && done.score.join() === '2,1' && done.place.join() === '1,2', JSON.stringify(done));
  const practice = new LocalFight({ mode: 'hill', bots: 3 });
  ok('local', 'the dev practice hook still makes bots', practice.match.all.length === 4 && practice.brains.slice(1).every((b) => b instanceof ObjectiveBrain));
}

// ── names ─────────────────────────────────────────────────────────────
{
  ok('names', 'shortName keeps the * of a ghost', Modes.shortName('Inkslinger*', 9) === 'Inksling*', Modes.shortName('Inkslinger*', 9));
  ok('names', 'and leaves people\'s names alone', Modes.shortName('Annabelle Smith', 9) === 'Annabelle' && Modes.shortName('Bo', 9) === 'Bo');
  // What the HUD and the name tags actually draw.
  const drawn = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === 'fillText' ? (s) => drawn.push(String(s)) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  const seats = [{ name: 'YOU' }, ...Q.ghostSeats([{ name: 'Inkslinger*' }, { name: 'Fighter 4821*' }, { name: 'Bob' }])];
  const m = new PvpMatch({ level: { ...arenaLevel(1, 'bandana') }, saves: seats.map(() => pvpSave([0])), you: 0, seats, mode: 'bandana', seed: 1 });
  Modes.drawModeHUD(ctx, 844, 390, m);
  new Modes.ModeLayer(m).drawTags(ctx);
  const ghostsDrawn = drawn.filter((s) => /Inksl|Fighter/.test(s));
  ok('names', 'every drawn ghost name keeps its *', ghostsDrawn.length >= 4 && ghostsDrawn.every((s) => /\*/.test(s)), JSON.stringify(ghostsDrawn));
  ok('names', 'the HUD bar shows the full name', m.all[1].name === 'Inkslinger*', m.all[1].name);
}

// ── plain ─────────────────────────────────────────────────────────────
{
  // HEAD's js/ next to ours: the same seeded fights must play out identically.
  const head = mkdtempSync(join(tmpdir(), 'quickgate-head-'));
  let headOk = true;
  try { execSync(`git archive HEAD js | tar -x -C ${head}`, { cwd: GAME, stdio: 'pipe' }); } catch { headOk = false; }
  const trace = async (jsDir) => {
    const F = await imp(jsDir, 'net/fight.js');
    const O = await imp(jsDir, 'net/objective.js');
    const M = await imp(jsDir, 'match.js');
    const C = await imp(jsDir, 'config.js');
    const out = [];
    seeded(4242);
    const seats = Array.from({ length: 4 }, (_, i) => ({ name: `P${i}` }));
    const saves = seats.map(() => F.pvpSave([0, 1, 2, 3, 4, 5, 6, 7]));
    const m = new F.PvpMatch({ level: { ...F.arenaLevel(3, 'lms') }, saves, you: 3, seats, mode: 'lms', seed: 3 });
    const bs = m.all.map((f, i) => new O.ObjectiveBrain(f, 0.6, C.MOVE_SETS.light.map((x) => x.id), saves[i]));
    m.begin();
    for (let i = 0; i < 120 * 30 && !m.over; i++) { if (m.phase === 2) bs.forEach((b) => b.update(STEP, m)); m.update(STEP); if (i % 120 === 0) out.push(m.all.map((f) => `${f.x.toFixed(3)}/${f.hp.toFixed(2)}`).join(' ')); }
    seeded(99);
    const camp = new M.Match({ level: C.LEVELS[20], save: { perks: {}, moves: {}, settings: {}, seen: {}, theme: 'light' } });
    for (let i = 0; i < 120 * 20 && !camp.result; i++) { camp.update(STEP, null); if (i % 120 === 0) out.push(camp.all.map((f) => `${f.x.toFixed(3)}/${f.hp.toFixed(2)}`).join(' ')); }
    Math.random = realRandom;
    return out;
  };
  if (headOk) {
    const LEVELS = (await imp(JS, 'config.js')).LEVELS;
    if (!LEVELS) console.log('  (config has no LEVELS export; campaign half skipped)');
    const [a, b] = [await trace(join(head, 'js')), await trace(JS)];
    const same = a.length === b.length && a.every((l, i) => l === b[i]);
    const at = a.findIndex((l, i) => l !== b[i]);
    ok('plain', 'a Brain with no style plays exactly as HEAD\'s (practice LMS + a campaign fight, seeded)', same, same ? `${a.length} samples` : `first difference at sample ${at}`);
  } else ok('plain', 'HEAD\'s js/ available for the comparison', false);
  rmSync(head, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
