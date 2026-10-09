// upgradegate.mjs — headless balance harness for the Hangar.
//
// Runs the real game modules in node (render is never called; a tiny canvas
// stub satisfies the Starfield constructor). The human is replaced with the
// game's own Bot at a fixed, human-ish skill, so every number below is the
// actual Game/Ship/Bot code, not a model of it.
//
//   node tools/upgradegate.mjs                 # tier table: none / half / max on Veteran + max on Ace
//   node tools/upgradegate.mjs --seeds 6       # more seeds per cell
//   node tools/upgradegate.mjs --falsify       # max levels bought but upgrades force-disabled
//   node tools/upgradegate.mjs --career        # play from zero credits, buy greedily, count matches to max
//   node tools/upgradegate.mjs --gate          # exit 1 unless the targets hold

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

// ---- minimal DOM stub (Starfield/sprites build canvases at construction) ----
const ctxStub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
globalThis.localStorage = { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };

// seeded RNG so a run is reproducible
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const { Game } = await import('../js/game.js');
const { Bot } = await import('../js/bot.js');
const { UPGRADES, HANGAR_MAX, SHIP_LIST } = await import('../js/config.js');
const SHIP_PICK = opt('ship', 'all');   // 'all' rotates the five ships across seeds
const H = await import('../js/hangar.js');

const PILOT_SKILL = Number(opt('skill', 0.5));
const REACT = Number(opt('react', 0.25));     // seconds of reaction lag
const HUMAN = !flag('botpilot');

// A thumb-on-glass human, built on the game's own Bot: it sees targets
// REACT seconds late and aims at where they WERE (no lead), and it holds
// fire whenever an enemy is roughly ahead without minding its energy (which
// is also its health). --botpilot uses the plain Bot instead.
class HumanPilot extends Bot {
  constructor(ship, skill) { super(ship, skill); this.hist = new Map(); this.clock = 0; }
  think(dt, game) {
    this.clock += dt;
    for (const o of game.ships) {
      let h = this.hist.get(o); if (!h) this.hist.set(o, h = []);
      h.push({ t: this.clock, x: o.x, y: o.y });
      while (h.length > 2 && h[1].t <= this.clock - REACT) h.shift();
    }
    super.think(dt, game);
    const s = this.ship, tgt = this.target, c = s.cmd;
    if (!s.alive || !tgt) return;
    const seen = this._lead(s, tgt);
    const d = Math.hypot(seen.x - s.x, seen.y - s.y);
    const off = Math.abs(((Math.atan2(seen.y - s.y, seen.x - s.x) - s.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < 520 && off < 0.4) c.fireGun = true;
  }
  _lead(s, tgt) {
    const h = this.hist.get(tgt);
    return h && h.length ? h[0] : { x: tgt.x, y: tgt.y };
  }
}
const DIFF = { rookie: 0.4, veteran: 0.62, ace: 0.85 };
const DT = 1 / 60;

function levelsAt(n) { const l = {}; for (const u of UPGRADES) l[u.key] = n; return l; }

function playMatch({ mode, ship = 'warbird', diff = 'veteran', levels = null, seed = 1, forceOff = false }) {
  Math.random = mulberry32(seed * 7919 + 13);
  let pilot = null;
  const input = {
    intent() {
      pilot.think(DT, game);
      const c = game.player.cmd;
      this._special = c.fireSpecial;
      return { aimAngle: c.aimAngle, aimMag: c.aimMag, turn: 0, thrust: 0, fireGun: c.fireGun, fireBomb: c.fireBomb };
    },
    consumePressed(k) { return k === 'special' ? !!this._special : false; },
  };
  const upgrades = forceOff || !levels ? null : H.hangarEffects(levels);
  const game = new Game({ input, audio: null, modeKey: mode, shipKey: ship, difficulty: DIFF[diff], playerName: 'Pilot', upgrades });
  pilot = HUMAN ? new HumanPilot(game.player, PILOT_SKILL) : new Bot(game.player, PILOT_SKILL);
  pilot.skill = PILOT_SKILL;   // no random jitter for the stand-in human
  let guard = 0;
  while (game.state === 'playing' && guard++ < 60 * 60 * 15) game.update(DT);
  const p = game.player;
  const bots = game.ships.filter(s => !s.isPlayer);
  const botK = bots.reduce((a, s) => a + s.stats.kills, 0) / bots.length;
  const botD = bots.reduce((a, s) => a + s.stats.deaths, 0) / bots.length;
  const rows = game.scoreboard();
  const place = rows.findIndex(r => r.isPlayer) + 1;
  const summary = game.matchSummary();
  return {
    kills: p.stats.kills, deaths: p.stats.deaths, won: game.playerWon(), place,
    botK, botD, secs: game.time, credits: H.creditsFor(summary, diff),
  };
}

function cell(label, cfg, seeds) {
  const rs = [];
  for (let i = 0; i < seeds; i++) rs.push(playMatch({ ship: SHIP_PICK === 'all' ? SHIP_LIST[i % SHIP_LIST.length] : SHIP_PICK, ...cfg, seed: 100 + i }));
  const sum = k => rs.reduce((a, r) => a + r[k], 0);
  const K = sum('kills'), D = sum('deaths');
  return {
    label, n: rs.length,
    kd: D ? K / D : K, kills: K / rs.length, deaths: D / rs.length,
    win: rs.filter(r => r.won).length / rs.length,
    place: sum('place') / rs.length,
    botKd: sum('botD') ? sum('botK') / sum('botD') : 0,
    botK: sum('botK') / rs.length,
    credits: sum('credits') / rs.length,
    mins: sum('secs') / rs.length / 60,
  };
}

const f2 = v => v.toFixed(2).padStart(6);
function print(rows) {
  console.log('tier                         n   K/D   kills deaths  win%  place  botK/D botKills credits  mins');
  for (const r of rows) console.log(
    r.label.padEnd(27), String(r.n).padStart(3), f2(r.kd), f2(r.kills), f2(r.deaths),
    String(Math.round(r.win * 100)).padStart(5), f2(r.place), f2(r.botKd), f2(r.botK), String(Math.round(r.credits)).padStart(7), f2(r.mins));
}

const seeds = Number(opt('seeds', 4));
const modes = (opt('modes', 'deathmatch,team')).split(',');
const t0 = Date.now();

if (flag('ablate')) {
  // one upgrade at a time, at --level (default 4), Deathmatch Veteran
  const L = Number(opt('level', 4));
  const rows = [cell('none', { mode: modes[0], levels: levelsAt(0) }, seeds)];
  for (const u of UPGRADES) { const l = levelsAt(0); l[u.key] = L; rows.push(cell(`${u.key} L${L}`, { mode: modes[0], levels: l }, seeds)); }
  print(rows);
} else if (flag('career')) {
  // Play from zero, alternating modes on Veteran; after each match buy the
  // cheapest affordable level (spreads upgrades evenly, like a real player).
  const runs = Number(opt('runs', 3));
  const results = [];
  for (let r = 0; r < runs; r++) {
    const levels = levelsAt(0); let credits = 0, m = 0;
    const allMax = () => UPGRADES.every(u => levels[u.key] >= HANGAR_MAX);
    const careerModes = ['deathmatch', 'team', 'ctf', 'koth'];
    while (!allMax() && m < 200) {
      const res = playMatch({ mode: careerModes[m % 4], diff: opt('diff', 'veteran'), ship: SHIP_LIST[m % SHIP_LIST.length], levels, seed: 5000 + r * 1000 + m });
      credits += res.credits; m++;
      for (;;) {
        let best = null;
        for (const u of UPGRADES) {
          const L = levels[u.key] + 1; if (L > HANGAR_MAX) continue;
          const c = H.upgradeCost(u.key, L);
          if (c <= credits && (!best || c < best.c)) best = { k: u.key, c };
        }
        if (!best) break;
        credits -= best.c; levels[best.k]++;
      }
      if (m % 5 === 0) console.log(`  run ${r + 1}: after ${m} matches, upgrade levels total ${Object.values(levels).reduce((a, b) => a + b, 0)}/${UPGRADES.length * HANGAR_MAX}`);
    }
    results.push(m);
    console.log(`career run ${r + 1}: fully upgraded after ${m} matches`);
  }
  console.log(`total cost to max: ${H.totalCostToMax()} credits; matches to max: ${results.join(', ')} (mean ${(results.reduce((a, b) => a + b, 0) / results.length).toFixed(1)})`);
} else {
  const rows = [];
  for (const mode of modes) {
    if (flag('falsify')) {
      rows.push(cell(`${mode} vet none`, { mode, levels: levelsAt(0) }, seeds));
      rows.push(cell(`${mode} vet max FORCED OFF`, { mode, levels: levelsAt(HANGAR_MAX), forceOff: true }, seeds));
      rows.push(cell(`${mode} vet max`, { mode, levels: levelsAt(HANGAR_MAX) }, seeds));
    } else {
      rows.push(cell(`${mode} vet none`, { mode, levels: levelsAt(0) }, seeds));
      rows.push(cell(`${mode} vet half`, { mode, levels: levelsAt(HANGAR_MAX / 2) }, seeds));
      rows.push(cell(`${mode} vet max`, { mode, levels: levelsAt(HANGAR_MAX) }, seeds));
      rows.push(cell(`${mode} ace max`, { mode, diff: 'ace', levels: levelsAt(HANGAR_MAX) }, seeds));
      if (flag('rookie')) {
        rows.push(cell(`${mode} rookie none`, { mode, diff: 'rookie', levels: levelsAt(0) }, seeds));
        rows.push(cell(`${mode} ace none`, { mode, diff: 'ace', levels: levelsAt(0) }, seeds));
      }
    }
  }
  print(rows);
  if (flag('gate')) {
    const fails = [];
    for (const mode of modes) {
      const g = l => rows.find(r => r.label === `${mode} ${l}`);
      const none = g('vet none'), half = g('vet half'), max = g('vet max'), ace = g('ace max');
      if (flag('falsify')) {
        const off = g('vet max FORCED OFF');
        if (Math.abs(off.kd - none.kd) > Math.max(0.35, none.kd * 0.35)) fails.push(`${mode}: forced-off K/D ${off.kd.toFixed(2)} not like none ${none.kd.toFixed(2)}`);
        if (max.kd < off.kd * 2) fails.push(`${mode}: max K/D ${max.kd.toFixed(2)} not clearly above forced-off ${off.kd.toFixed(2)}`);
        continue;
      }
      if (mode === 'deathmatch' && none.kd >= none.botKd) fails.push(`${mode}: none K/D ${none.kd.toFixed(2)} not below bot avg ${none.botKd.toFixed(2)}`);
      if (max.kd < 3) fails.push(`${mode}: max K/D ${max.kd.toFixed(2)} < 3`);
      if (max.win < 0.6) fails.push(`${mode}: max win ${max.win} < 0.6`);
      if (ace.win < 0.25) fails.push(`${mode}: ace-at-max win ${ace.win} < 0.25`);
      if (!(half.kd > none.kd && half.kd < max.kd)) fails.push(`${mode}: half not between none and max`);
    }
    console.log(fails.length ? 'GATE FAIL\n  ' + fails.join('\n  ') : 'GATE PASS');
    if (fails.length) process.exitCode = 1;
  }
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s, pilot ${HUMAN ? `human-model skill ${PILOT_SKILL} react ${REACT}s` : `plain Bot skill ${PILOT_SKILL}`})`);
