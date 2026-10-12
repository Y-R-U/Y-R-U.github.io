#!/usr/bin/env node
// Ghost fights in node: a ghost is the uploader's REAL loadout (moveStats with their save,
// their perks, their HEAVIER HAND), clamped, labelled GHOST, and never ranked.
//
//   node tools/ghostgate.mjs            the checks
//   node tools/ghostgate.mjs --falsify  break it 11 ways; each must turn the gate red
//
// GHOST_JS points the gate at another copy of js/ (the falsifier uses it).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../js');
const DIR = process.env.GHOST_JS || SRC;

if (process.argv.includes('--falsify')) {
  const MUTANTS = [
    ['Brain ignores the save', 'ai.js', 'if (this.save) {', 'if (false) {'],
    ['ghost Brain gets no save', 'net/ghost.js', 'g.ids, g.save, { byKind: true }', 'g.ids, null, { byKind: true }'],
    ['ghost Brain not byKind', 'net/ghost.js', '{ byKind: true }', '{ byKind: false }'],
    ['no perks on the ghost body', 'net/ghost.js', 'f.stats = g.stats;', ''],
    ['flat-rate ghost punches', 'net/ghost.js', 'if (attacker.ghost && !def.id && !def.special) def', 'if (false) def'],
    ['no clamp', 'net/ghost.js', 'Math.min(perkMax(k, ALL_WORLDS), snap?.p?.[k.id] | 0)', '(snap?.p?.[k.id] | 0)'],
    ['snapshot carries the save', 'net/ghost.js', 'return { v: 1, t, cd: save?.carryDark ? 1 : 0, p, m };', 'return { v: 1, t, cd: save?.carryDark ? 1 : 0, p, m, ink: save?.ink };'],
    ['ghost result ranked', 'net/ghost.js', "kind: 'ghost', ranked: false", "kind: 'ghost', ranked: true"],
    ['ghost result counts as arena', 'net/ghost.js', "src: 'campaign', kind: 'ghost'", "src: 'arena', kind: 'ghost'"],
    ['no GHOST label', 'net/ghost.js', 'name: `GHOST · ${', 'name: `${'],
    ['friends not first', 'net/ghost.js', 'friend: 0, near: 1', 'friend: 3, near: 1'],
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'ghostgate-'));
    cpSync(SRC, tmp, { recursive: true });
    const src = readFileSync(join(tmp, file), 'utf8');
    if (!src.includes(from)) { console.log(`STALE  ${name}: "${from}" not in ${file}`); bad++; rmSync(tmp, { recursive: true }); continue; }
    writeFileSync(join(tmp, file), src.replace(from, to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, GHOST_JS: tmp }, encoding: 'utf8' });
    rmSync(tmp, { recursive: true });
    const red = r.status !== 0;
    if (!red) bad++;
    console.log(`${red ? 'RED  ' : 'GREEN'}  ${name}${red ? '  (' + (r.stdout.match(/FAIL\s+(.*)/)?.[1] || r.stderr.split('\n')[0]) + ')' : '  <- gate missed it'}`);
  }
  console.log(bad ? `\n${bad} mutant(s) survived` : '\nevery mutant turned the gate red');
  process.exit(bad ? 1 : 0);
}

const noopCtx = new Proxy({}, {
  get: (t, k) => k === 'canvas' ? { width: 0, height: 0 } :
    (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {},
  set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.location = { search: '', hostname: 'localhost', origin: 'http://localhost', pathname: '/' };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const imp = (f) => import(pathToFileURL(join(DIR, f)).href);
const C = await imp('config.js');
const { Match } = await imp('match.js');
const { STRIKES } = await imp('fighter.js');
const G = await imp('net/ghost.js');
const { DEFAULT } = await imp('save.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x && !c ? '  ' + x : ''}`); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// A built-up DARK player: levelled specials, real perks, plus things a ghost must NOT carry.
const real = {
  ...DEFAULT(), theme: 'dark', darkUnlocked: true, ink: 12345, totalInk: 99999, level: 30,
  perks: { hp: 6, atk: 7, spd: 3, armor: 4, crit: 2, combo: 2, drain: 1, wind: 2, ink: 3 },
  moves: {
    power: { owned: true, power: 5, cd: 2 },                // a LIGHT move: not in the dark set
    d_shank: { owned: true, power: 6, cd: 3 }, d_knife: { owned: true, power: 4, cd: 4 },
    d_sawn: { owned: true, power: 3, cd: 1 }, d_hook: { owned: true, power: 5, cd: 2 },
    d_bottle: { owned: false, power: 0, cd: 0 },
  },
};

// ── the snapshot ────────────────────────────────────────────────────────
const snap = G.ghostSnap(real);
ok('snapshot holds only the loadout', Object.keys(snap).sort().join() === 'cd,m,p,t,v', JSON.stringify(snap));
ok('snapshot: the active set, owned only', Object.keys(snap.m).sort().join() === 'd_hook,d_knife,d_sawn,d_shank', JSON.stringify(snap.m));
ok('snapshot: no ink well, no ink, no records', !('ink' in snap.p) && !JSON.stringify(snap).includes('12345'));
ok('snapshot is small', JSON.stringify(snap).length < 400, JSON.stringify(snap).length);

// ── the ghost save reproduces the real numbers ──────────────────────────
const gs = G.ghostSave(JSON.parse(JSON.stringify(snap)));
for (const id of Object.keys(snap.m)) {
  const a = C.moveStats(real, id), b = C.moveStats(gs, id);
  ok(`moveStats(${id}) matches the real save`, b && near(a.damage, b.damage) && near(a.cooldown, b.cooldown) && near(a.knockback, b.knockback),
    JSON.stringify([a?.damage, b?.damage]));
}
const dr = C.derive(real), dg = C.derive(gs);
ok('derive() matches for every combat number', ['maxHp', 'atkMul', 'speed', 'jump', 'dr', 'kbResist', 'crit', 'combo', 'getUp', 'drain', 'heal'].every((k) => near(dr[k], dg[k])));

const hacked = G.ghostSave({ v: 1, t: 'dark', p: { hp: 999, atk: 50, armor: 99 }, m: { d_shank: [99, 99], power: [9, 9], nope: [1, 1] } });
ok('an edited snapshot is clamped to a reachable save', hacked.perks.hp <= C.perkMax(C.PERKS[0], { darkUnlocked: true, thugWon: true, simulantWon: true }) && hacked.perks.armor <= 12 &&
  hacked.moves.d_shank.power <= C.MOVE_MAX_LV + 2 && !hacked.moves.power && !hacked.moves.nope, JSON.stringify(hacked));
ok('rubbish in, a plain fighter out', Object.keys(G.ghostSave(null).moves).length === 0 && G.ghostSave({ t: '<x>' }).theme === 'light');

// ── skill and the list ──────────────────────────────────────────────────
ok('skill rises with a winning record', G.ghostSkill({ wins: 18, battles: 20 }) > G.ghostSkill({ wins: 2, battles: 20 }) && G.ghostSkill({}) >= 0.3 && G.ghostSkill({ wins: 1e6, battles: 1e6 }) <= 0.9);
const pool = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1, name: `P${i}`, updated: 1000 - i, wins: i, battles: 20,
  snap: { v: 1, t: 'light', p: { hp: i, atk: i }, m: { power: [Math.min(7, i >> 1), 0] } },
}));
const mine = G.ghostPower(G.ghostSave(pool[6].snap));
const pick = G.pickGhosts(pool, mine, ['p17', 'P2'], 8);
ok('the list: 8 ghosts, friends first', pick.length === 8 && pick[0].why === 'friend' && pick[1].why === 'friend' && new Set(pick.slice(0, 2).map((g) => g.name)).has('P17'), pick.map((g) => g.name + ':' + g.why).join());
ok('the list: some near your strength', pick.filter((g) => g.why === 'near').every((g) => Math.abs(g.power - mine) <= mine * 0.6 + 4) && pick.some((g) => g.why === 'near'));
ok('the list: some stronger', pick.filter((g) => g.why === 'stronger' && g.power > mine).length >= 2);

// ── the fight ───────────────────────────────────────────────────────────
const me = { ...DEFAULT(), theme: 'light', perks: { hp: 3, atk: 3 }, moves: { power: { owned: true, power: 2, cd: 2 }, toss: { owned: true, power: 1, cd: 1 } }, level: 12 };
const ghostRow = { name: 'Rival', snap, wins: 14, battles: 20 };
const thrown = [], strikes = [];
const realLand = Match.prototype.land;
Match.prototype.land = function (a, t, def, from) { if (a.ghost && !def.id && !def.special) strikes.push([def.kb, def.dmg]); return realLand.call(this, a, t, def, from); };
let ended = null;
let fights = 0;
for (let seed = 0; seed < 6; seed++) {
  const m = new G.GhostMatch({ ghost: ghostRow, save: me, seed, onEnd: (r) => { ended = r; } });
  m.autoplay = true;
  m.playerBrain = new (await imp('ai.js')).Brain(m.player, 0.6, ['power', 'toss'], me);
  const f = m.enemies[0];
  if (seed === 0) {
    ok('the opponent is labelled GHOST', f.name === 'GHOST · RIVAL' && m.level.kind === 'ghost', f.name);
    ok('ghost body: their HP, speed and jump', near(f.maxHp, dg.maxHp * (1 + dg.heal)) && near(f.speed, dg.speed) && near(f.jumpV, dg.jump));
    ok('ghost body: their armour, crit and lifesteal (stats)', f.stats && near(f.stats.dr, dg.dr) && near(f.stats.crit, dg.crit) && near(f.stats.drain, dg.drain));
    ok('ghost brain: their save, their moves, their record', m.brains[0].save === undefined ? false : m.brains[0].save?.moves?.d_shank?.power === 6 && m.brains[0].moves.length === 4 && near(m.brains[0].skill, G.ghostSkill(ghostRow)));
    ok('a DARK ghost is armed', f.armed === true);
    ok('you fight as your own rank', m.player.rank === C.ranksFor('light')[C.playerRankAt(12)]);
  }
  const sp = f.special.bind(f);
  f.special = (mv) => { const r = sp(mv); if (r) thrown.push(mv); return r; };
  for (let t = 0; t < 90 && !m.over; t += 1 / 120) m.update(1 / 120, null);
  fights++;
}
// A ghost with no specials has to win with its fists, so its punches are measured too.
for (let seed = 0; seed < 3; seed++) {
  const m = new G.GhostMatch({ ghost: { ...ghostRow, snap: { ...snap, m: {} } }, save: me, seed });
  m.autoplay = true;
  m.playerBrain = new (await imp('ai.js')).Brain(m.player, 0.6, [], me);
  for (let t = 0; t < 60 && !m.over; t += 1 / 120) m.update(1 / 120, null);
}
Match.prototype.land = realLand;
ok('the ghost throws its specials', thrown.length >= 6, thrown.length);
ok('the ghost uses dark kinds too (knives / gun)', thrown.some((x) => x.kind === 'knives' || x.kind === 'gun'), [...new Set(thrown.map((x) => x.id))].join());
ok('EVERY ghost special is moveStats(their save)', thrown.length > 0 && thrown.every((x) => {
  const want = C.moveStats(real, x.id);
  return want && near(x.damage, want.damage) && near(x.cooldown, want.cooldown) && near(x.knockback, want.knockback);
}), JSON.stringify(thrown.slice(0, 3).map((x) => [x.id, x.damage, C.moveStats(real, x.id)?.damage])));
ok('ghost punches carry their HEAVIER HAND', strikes.length > 0 && strikes.every(([kb, d]) => near(d, Object.values(STRIKES).find((s) => s.kb === kb).dmg * dr.atkMul)), JSON.stringify(strikes.slice(0, 3)));

// ── never ranked ────────────────────────────────────────────────────────
const m = new G.GhostMatch({ ghost: ghostRow, save: me, seed: 1 });
m.enemies[0].hp = m.enemies[0].maxHp * 0.3;
const b = G.ghostBattle('lose', m, 1760000000000);
ok('a ghost result is never ranked', b.ranked === false && b.kind === 'ghost' && !b.id.startsWith('arena:'), JSON.stringify(b));
const EV = await imp('events/points.js');
const win = { start: 0, end: 2e12 };
ok('events: a ghost counts only for "any battle" events, as a campaign fight', b.src === 'campaign' &&
  EV.counted({ anyBattle: true }, win, [b]).length === 1 && EV.counted({ anyBattle: false }, win, [b]).length === 0, JSON.stringify(b));
ok('a ghost result has event-shaped points input', b.won === false && near(b.oppDmg, 0.7) && b.at === 1760000000000);
const ghostSrc = readFileSync(join(DIR, 'net/ghost.js'), 'utf8');
ok('ghost.js never talks to a server', !/fetch\(|WebSocket|ArenaClient|client\.|sendBeacon|XMLHttpRequest/.test(ghostSrc));

console.log(`\n${pass} passed, ${fail} failed (${fights} ghost fights)`);
process.exit(fail ? 1 : 0);
