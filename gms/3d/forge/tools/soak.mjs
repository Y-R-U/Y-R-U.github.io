#!/usr/bin/env node
// Virtual-clock balance soak. Plays the whole campaign with no renderer and no quest pack:
// it walks js/sim/campaign.js, resolves every action through js/sim/*, and prints a per-act
// table against SYSTEMS.md §11. Its output is what §11 should say.
//
//   node tools/soak.mjs
//   node tools/soak.mjs --policy=completionist --competence=expert --report=csv
//   node tools/soak.mjs --tiermul=all --seed=99
//
// --policy      story | average | completionist      how much sandbox work is done
// --competence  casual | average | expert            time overhead and fumble rates
// --tiermul     kills | all | off                    whether diminishing returns touch gathering
// --repmul      on | off                            switch the streak penalty off, to size its bite
// --report      table | csv | json
// --seed        integer

import { QUESTS, ACTS, SANDBOX, BALANCE_TABLE, BOARD_ALWAYS, TOWN_LEG, rewardXp, rewardMk } from '../js/sim/campaign.js';
import { SCHOOLS, affinityXp } from '../js/sim/schools.js';
import { xpToReach, levelFor, tierMul, repMul, grasp, MAX_LEVEL } from '../js/sim/xp.js';
import * as CB from '../js/sim/combat.js';
import * as G from '../js/sim/gather.js';
import * as E from '../js/sim/economy.js';
import * as F from '../js/sim/faction.js';
import { ENEMIES, ITEM_VALUE, ROCK, PERISHABLE, CHARMS as TABLES_CHARMS, STALL_BARTER_LEVEL as TABLES_STALL_LEVEL, FIRST_OF_KIND_XP, MEND_XP_PER_TIER,
         MEND_FIRST_DAILY_MUL, WARD_XP_BRACED, WARD_XP_BARE, GLAMOUR_XP_EVADE } from '../js/sim/tables.js';
import { makeRng } from '../js/sim/rng.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  return [k, v];
}));

const OPT = {
  seed: +(args.seed ?? 1234),
  policy: args.policy ?? 'average',
  competence: args.competence ?? 'average',
  tiermul: args.tiermul ?? 'kills',
  repmul: args.repmul ?? 'on',
  questxp: args.questxp ?? 'story',
  report: args.report ?? 'table',
};

const COMPETENCE = {
  casual:  { time: 1.45, strike: 0.75, boardPerAct: 2, brace: 0.15, deathsPerAct: 1.2 },
  average: { time: 1.00, strike: 0.88, boardPerAct: 3, brace: 0.45, deathsPerAct: 0.5 },
  expert:  { time: 0.78, strike: 0.97, boardPerAct: 4, brace: 0.80, deathsPerAct: 0.1 },
}[OPT.competence];

// Time the quest work lists do not contain, and the term that decides whether the campaign is a
// four-hour game or a ten-hour one. Derived, not chosen: giver → objective → giver is two
// in-town legs of WORLD.md's 80 m at 5 m/s, plus a dialogue exchange either side, plus an
// amortised market or journal detour.
const OVERHEAD = { walk: 2 * 80 / 5, dialogue: 2 * 22, detour: 55 };
const overheadSeconds = () => args.overhead !== undefined
  ? +args.overhead
  : OVERHEAD.walk + OVERHEAD.dialogue + OVERHEAD.detour;

const BOARD_PER_ACT = { story: 0, average: 1, completionist: COMPETENCE.boardPerAct }[OPT.policy] ?? 1;

// Seconds per unit of work, before the competence multiplier. The one place pacing is tuned.
const TIME = {
  approachPerEnemy: 2.5, walkSpeed: 5, escortSpeed: 3,
  cook: 5, sellStack: 5, forageNode: 5, forageWalk: 7, rockNode: 9, rockWalk: 9,
  mend: 6, talkNode: 22, interact: 6, evadeCycle: 60, fishHandling: 2,
};

const GAME_HOURS_PER_REAL_MINUTE = 1;
const REOUTFIT = 700;

const state = {
  t: 0,
  schools: Object.fromEntries(SCHOOLS.map(s => [s, 0])),
  marks: 0,
  faction: 'light',
  standing: F.newStanding(0),
  ledger: E.newLedger(0),
  day: 0,
  firsts: new Set(),
  mendedToday: new Set(),
  inventory: {},
  lastCatchAt: 0,
  streakKey: null, streakN: 0,
  spent: 0, earned: 0,
  deaths: 0,
  charms: [0, 0, 0, 0],
  echoes: [],
  income: { sales: 0, drops: 0, quests: 0, board: 0 },
  brake: { base: 0, tier: 0, rep: 0 },
  warnings: [],
  perSchoolSource: Object.fromEntries(SCHOOLS.map(s => [s, {}])),
};

const rng = makeRng(OPT.seed);
const lvl = s => levelFor(state.schools[s]);

function advance(seconds) {
  state.t += seconds * COMPETENCE.time;
  const day = Math.floor((state.t / 60) * GAME_HOURS_PER_REAL_MINUTE / 24);
  if (day > state.day) {
    state.day = day;
    state.ledger = E.rollDay(state.ledger, day);
    state.standing = F.rollStandingDay(state.standing, day);
    state.mendedToday.clear();
  }
}

// One action is one use of one source key, however many schools it pays. Counting per award
// would reset the streak every time a rat paid both Cull and Kindle.
function streak(key) {
  if (state.streakKey !== key) { state.streakKey = key; state.streakN = 0; }
  return state.streakN++;
}

function award(school, base, { sourceLevel = null, rep = 0, source = 'misc' } = {}) {
  if (base <= 0) return 0;
  const applyTier = OPT.tiermul !== 'off' && sourceLevel !== null && (OPT.tiermul === 'all' || source === 'kill');
  const tm = applyTier ? tierMul(lvl(school), sourceLevel) : 1;
  const rm = OPT.repmul === 'off' ? 1 : repMul(rep);
  const aff = affinityXp(school, state.faction);
  const gained = Math.max(1, Math.round(base * tm * rm * aff));
  if (source !== 'quest') {
    state.brake.base += base * aff;
    state.brake.tier += base * aff * (1 - tm);
    state.brake.rep += base * aff * tm * (1 - rm);
  }
  state.schools[school] += gained;
  state.perSchoolSource[school][source] = (state.perSchoolSource[school][source] || 0) + gained;
  return gained;
}

function first(id, school) {
  if (state.firsts.has(id)) return;
  state.firsts.add(id);
  state.schools[school] += FIRST_OF_KIND_XP;
  state.perSchoolSource[school].first = (state.perSchoolSource[school].first || 0) + FIRST_OF_KIND_XP;
}

function gain(item, n = 1) { state.inventory[item] = (state.inventory[item] || 0) + n; }

function sell(item, n, district) {
  const value = ITEM_VALUE[item] ?? 0;
  const held = PERISHABLE.has(item) ? (state.t - state.lastCatchAt) / 60 : 0;
  const fresh = E.freshness(held);
  const r = E.sellStack(state.ledger, { item, value, n, barter: lvl('barter'), freshness: fresh, district });
  state.ledger = r.ledger;
  state.marks += r.marks;
  state.earned += r.marks;
  state.income.sales += r.marks;
  award('barter', E.transactionXp(E.itemTier(value), r.marks), { rep: streak(`barter:${district}`), source: 'sell' });
  state.standing = F.applyStanding(state.standing, 'sell', { faction: state.faction, amount: r.marks });
  state.inventory[item] = Math.max(0, (state.inventory[item] || 0) - n);
  advance(TIME.sellStack);
  return r.marks;
}

const DISTRICT = { light: 'light', dark: 'dark', neutral: 'neutral' };

function doWork(verb, act) {
  const [kind, a, b] = verb;
  switch (kind) {
    case 'kill': {
      const e = ENEMIES[a];
      const n = b;
      for (let i = 0; i < n; i++) {
        const rep = streak(`cull:${a}`);
        for (const [school, base] of Object.entries(e.xp)) {
          award(school, base, { sourceLevel: e.level, rep, source: 'kill' });
        }
        const braced = rng() < COMPETENCE.brace;
        award('ward', (braced ? WARD_XP_BRACED : WARD_XP_BARE) * e.level, { rep, source: 'absorb' });
        first(`kill:${a}`, Object.keys(e.xp)[0]);
        for (const [item, count] of e.drops || []) gain(item, count);
        state.marks += e.mk; state.earned += e.mk; state.income.drops += e.mk;
        state.standing = F.applyStanding(state.standing, 'vermin', { faction: state.faction });
      }
      const leadSchool = e.xp.cull ? 'cull' : 'kindle';
      advance(CB.secondsToClear({ level: lvl(leadSchool), faction: state.faction, enemy: a, count: n, approach: TIME.approachPerEnemy }));
      break;
    }
    case 'catch': {
      const reach = a === 'local' ? reachFor(act) : a;
      const n = b;
      const lineLevel = lvl('line');
      for (let i = 0; i < n; i++) {
        const fish = G.rollCatch(rng, reach, lineLevel);
        if (!fish) { state.warnings.push(`${act.id}: no catchable entry in ${reach} at Line ${lineLevel}`); break; }
        award('line', fish.xp, { sourceLevel: fish.req, rep: streak(`line:${reach}`), source: 'catch' });
        first(`catch:${fish.id}`, 'line');
        gain(fish.id, 1);
      }
      state.lastCatchAt = state.t;
      const per = G.secondsPerCatch(lineLevel, 1) / COMPETENCE.strike + TIME.fishHandling;
      advance(per * n);
      break;
    }
    case 'sell': sell(a, b, DISTRICT[state.faction]); break;
    case 'cook': {
      const n = b;
      const value = ITEM_VALUE[a] ?? 10;
      const recipeLevel = Math.max(1, E.itemTier(value) * 3 - 2);
      for (let i = 0; i < n; i++) {
        const r = G.cook(rng, a, lvl('hearth'), recipeLevel);
        award('hearth', r.xp, { sourceLevel: recipeLevel, rep: streak(`hearth:${a}`), source: 'cook' });
        first(`cook:${a}`, 'hearth');
      }
      advance(TIME.cook * n);
      break;
    }
    case 'forage': {
      const zone = a === 'local' ? zoneFor(act) : a;
      const n = b;
      for (let i = 0; i < n; i++) {
        const e = G.rollForage(rng, zone, lvl('forage'));
        award('forage', e.xp, { sourceLevel: e.tier * 4 - 3, rep: streak(`forage:${zone}`), source: 'forage' });
        first(`forage:${e.id}`, 'forage');
        gain(e.id, G.forageYield(lvl('forage')));
      }
      advance((TIME.forageNode + TIME.forageWalk) * n);
      break;
    }
    case 'rock': {
      const r = ROCK[a];
      const n = b;
      if (lvl('setting') < r.req) {
        state.warnings.push(`${act.id}: ${a} needs Setting ${r.req}, player has ${lvl('setting')}`);
      }
      for (let i = 0; i < n; i++) {
        award('setting', r.xp, { sourceLevel: r.req, rep: streak(`setting:${a}`), source: 'rock' });
        first(`rock:${a}`, 'setting');
        gain(r.item, G.rockYield(a, lvl('setting')));
      }
      advance((TIME.rockNode + TIME.rockWalk) * n);
      break;
    }
    case 'mend': {
      const tier = a, n = b;
      for (let i = 0; i < n; i++) {
        const key = `object:${act.id}:${i}`;
        const mul = state.mendedToday.has(key) ? 1 : MEND_FIRST_DAILY_MUL;
        state.mendedToday.add(key);
        award('mend', MEND_XP_PER_TIER * tier * mul, { sourceLevel: tier * 4, rep: streak(`mend:t${tier}`), source: 'mend' });
        first(`mend:t${tier}`, 'mend');
      }
      advance(TIME.mend * n);
      break;
    }
    case 'evade': {
      const enemyLevel = a === 'band' ? act.lead : a;
      for (let i = 0; i < b; i++) award('glamour', GLAMOUR_XP_EVADE * enemyLevel, { sourceLevel: enemyLevel, rep: streak('glamour:evade'), source: 'evade' });
      advance(TIME.evadeCycle * b);
      break;
    }
    case 'absorb': {
      const attackerLevel = a === 'band' ? act.lead : a;
      for (let i = 0; i < b; i++) {
        const braced = rng() < COMPETENCE.brace;
        award('ward', (braced ? WARD_XP_BRACED : WARD_XP_BARE) * attackerLevel, { rep: streak('ward:absorb'), source: 'absorb' });
      }
      break;
    }
    case 'travel': {
      advance(a / TIME.walkSpeed);
      if (a >= 400) {
        const toll = E.ferryToll(a >= TOWN_LEG.neutral_dark + 200 ? 2 : 1, F.band(state.standing[state.faction]));
        state.marks -= toll; state.spent += toll;
      }
      break;
    }
    case 'escort': advance(a / TIME.escortSpeed); break;
    case 'talk': advance(TIME.talkNode * a); break;
    case 'interact': advance(TIME.interact * a); break;
    case 'survive': advance(a); break;
    default: state.warnings.push(`unknown work verb ${kind}`);
  }
}

const reachFor = act => act.campaign === 'light' ? 'whitewall' : act.campaign === 'dark' ? 'blackstone' : 'longacre';
const zoneFor = act => act.campaign === 'light' ? 'whitewall' : act.campaign === 'dark' ? 'blackstone' : 'longacre';

function trainedSchools() { return SCHOOLS.filter(s => state.schools[s] > 0); }

function runQuest(q, act) {
  for (const w of q.work || []) doWork(w, act);
  advance(overheadSeconds());

  const { all, ...named } = rewardXp(q);
  for (const [school, base] of Object.entries(named)) award(school, base, { source: 'quest' });
  if (all !== undefined) for (const s of trainedSchools()) award(s, all, { source: 'quest' });

  const mk = rewardMk(q);
  state.marks += mk; state.earned += mk; state.income.quests += mk;
  state.standing = F.applyStanding(state.standing, 'quest', { faction: state.faction });

  // Perishables left over after a gathering quest get sold on the way past.
  for (const [item, n] of Object.entries(state.inventory)) {
    if (n >= 4 && (ITEM_VALUE[item] ?? 0) > 0) sell(item, n, DISTRICT[state.faction]);
  }
  if (q.echo) state.echoes.push(q.echo);
  if (q.id === 'L03') state.openingPurse = state.marks;
}

function runBoard(act, n) {
  const posted = [
    ...BOARD_ALWAYS.map(id => SANDBOX.find(j => j.id === id)),
    ...Array.from({ length: Math.max(0, n - BOARD_ALWAYS.length) }, () => SANDBOX[Math.floor(rng() * SANDBOX.length)]),
  ];
  for (let i = 0; i < n; i++) {
    const job = posted[i % posted.length];
    const scaled = (job.work || []).map(([k, a, b]) => k === 'kill'
      ? ['kill', bandEnemy(act), b]
      : [k, a, b]);
    for (const w of scaled) doWork(w, act);
    advance(overheadSeconds());
    const pay = Math.round(1.2 * act.mk / QUESTS.filter(q => q.act === act.id).length);
    state.marks += pay; state.earned += pay; state.income.board += pay;
    if (job.school) award(job.school, Math.round(0.20 * (xpToReach(Math.min(MAX_LEVEL, act.lead + 1)) - xpToReach(act.lead))), { source: 'board' });
  }
}

function bandEnemy(act) {
  const pool = {
    whitewall_low: 'grain_rat', river: 'rat_knot', fields: 'sour_crow',
    whitewall_upper: 'blight_boar', blackstone_approach: 'hollow',
    blackstone_town: 'watchman', finale: 'champion_1',
  };
  return pool[act.region] || 'mire_rat';
}

// §7.2's sinks, all of them. The soak used to model only a token charm purchase, which is why
// its purse ran away: the income was right and the outgoings were missing.
function spendAndLose(act, actHours) {
  let spent = 0;
  const g = grasp(state.schools);
  const slots = 3 + (state.echoes.includes('long_furrow') ? 1 : 0);

  // One charm upgrade per act, weakest slot first: a player improves a build, they do not
  // re-buy all three slots the moment a tier opens.
  for (let slot = 0; slot < slots; slot++) {
    if (state.charms[slot] > Math.min(...state.charms.slice(0, slots))) continue;
    const next = state.charms[slot] + 1;
    const c = TABLES_CHARMS.find(x => x.tier === next);
    if (!c || g < c.grasp || state.marks - spent < c.cost * 2.2) continue;
    if (next >= 3 && lvl('setting') < ROCK.obsidian.req) continue;
    spent += c.cost;
    state.charms[slot] = next;
    break;
  }

  spent += Math.round(E.THREADS_PER_HOUR * actHours * 4);
  if (lvl('barter') >= TABLES_STALL_LEVEL) spent += E.stallRent() * Math.max(1, Math.round(actHours * 2.5));

  // §11's Neutral Act 1 marks dip: arriving home, the player re-outfits every slot on the
  // Longacre build. Explicit rather than emergent, because it is a story beat, not an optimum.
  if (act.id === 'N1') spent += REOUTFIT * slots;

  const deaths = COMPETENCE.deathsPerAct;
  state.deaths += deaths;
  const lost = Math.round(E.gutterLoss(Math.max(0, state.marks - spent), state.echoes.includes('white_cord')) * deaths);

  state.marks -= spent + lost;
  state.spent += spent + lost;
}

const rows = [];
let prevXp = 0, prevH = 0;

for (const act of ACTS) {
  state.faction = act.campaign;
  if (act.n === 1 && act.campaign !== 'light') {
    state.standing = F.enterCampaign(state.standing, act.campaign);
  }
  for (const q of QUESTS.filter(x => x.act === act.id)) runQuest(q, act);
  runBoard(act, BOARD_PER_ACT);
  spendAndLose(act, state.t / 3600 - prevH);

  const totalXp = SCHOOLS.reduce((n, s) => n + state.schools[s], 0);
  const h = state.t / 3600;
  rows.push({
    act: act.id, title: act.title,
    h: h - prevH, cumH: h,
    grasp: grasp(state.schools),
    xp: totalXp, actXp: totalXp - prevXp,
    xpPerH: (totalXp - prevXp) / Math.max(1e-6, h - prevH),
    mk: state.marks,
    lead: Math.max(...SCHOOLS.map(lvl)),
    want: act.lead,
    levels: Object.fromEntries(SCHOOLS.map(s => [s, lvl(s)])),
  });
  prevXp = totalXp; prevH = h;
}

const table = BALANCE_TABLE;
const pct = (a, b) => b === 0 ? Infinity : (a - b) / b * 100;

function fmt(n, w = 8) { return String(n).padStart(w); }

if (OPT.report === 'json') {
  console.log(JSON.stringify({ opt: OPT, rows, warnings: state.warnings }, null, 2));
} else if (OPT.report === 'csv') {
  console.log('act,title,h,cumH,grasp,totalXp,actXp,xpPerH,mk,' + SCHOOLS.join(','));
  for (const r of rows) {
    console.log([r.act, JSON.stringify(r.title), r.h.toFixed(3), r.cumH.toFixed(3), r.grasp,
      r.xp, r.actXp, Math.round(r.xpPerH), r.mk, ...SCHOOLS.map(s => r.levels[s])].join(','));
  }
} else {
  console.log(`FORGE soak — seed ${OPT.seed}, policy ${OPT.policy}, competence ${OPT.competence}, tierMul on ${OPT.tiermul}\n`);
  console.log('act  title                     h   cum h  Grasp   (doc)   total XP     (doc)    XP/h     mk    (doc)  lead/want');
  console.log('-'.repeat(112));
  rows.forEach((r, i) => {
    const d = table[i];
    console.log([
      r.act.padEnd(4),
      r.title.slice(0, 24).padEnd(24),
      fmt(r.h.toFixed(2), 5),
      fmt(r.cumH.toFixed(2), 6),
      fmt(r.grasp, 6),
      fmt(`(${d.grasp})`, 8),
      fmt(r.xp.toLocaleString(), 10),
      fmt(`(${d.xp.toLocaleString()})`, 10),
      fmt(Math.round(r.xpPerH).toLocaleString(), 8),
      fmt(r.mk.toLocaleString(), 7),
      fmt(`(${d.mk.toLocaleString()})`, 8),
      fmt(`${r.lead}/${r.want}`, 8),
    ].join(' '));
  });

  const last = rows.at(-1);
  console.log('\n' + '='.repeat(112));
  console.log(`TOTAL  ${last.cumH.toFixed(2)} h   Grasp ${last.grasp}   ${last.xp.toLocaleString()} XP   ${last.mk.toLocaleString()} mk`);
  const d = table.at(-1);
  console.log(`§11     ${d.cumH.toFixed(2)} h   Grasp ${d.grasp}   ${d.xp.toLocaleString()} XP   ${d.mk.toLocaleString()} mk`);
  console.log(`DELTA  ${pct(last.cumH, d.cumH).toFixed(0)}% hours   ${pct(last.grasp, d.grasp).toFixed(0)}% Grasp   ${pct(last.xp, d.xp).toFixed(0)}% XP   ${pct(last.mk, d.mk).toFixed(0)}% marks`);
  console.log(`Average demand ${(last.xp / (last.cumH * 3600)).toFixed(1)} XP/s`);

  const jobs = QUESTS.length + BOARD_PER_ACT * ACTS.length;
  const oh = overheadSeconds();
  const mech = last.cumH - jobs * oh * COMPETENCE.time / 3600;
  console.log(`\n${jobs} jobs at ${(last.cumH * 60 / jobs).toFixed(1)} min each: ${mech.toFixed(2)} h of quest work`);
  console.log(`plus ${oh} s per job of walking, dialogue and market detour (${(last.cumH - mech).toFixed(2)} h).`);

  console.log('\n--- acts outside SYSTEMS §11 by more than 8% (a clean list means the doc is current) ---');
  let clean = true;
  rows.forEach((r, i) => {
    const d = table[i];
    const bad = [];
    if (Math.abs(pct(r.cumH, d.cumH)) > 8) bad.push(`hours ${pct(r.cumH, d.cumH) > 0 ? '+' : ''}${pct(r.cumH, d.cumH).toFixed(0)}%`);
    if (Math.abs(pct(r.xp, d.xp)) > 8) bad.push(`XP ${pct(r.xp, d.xp) > 0 ? '+' : ''}${pct(r.xp, d.xp).toFixed(0)}%`);
    if (Math.abs(pct(r.grasp, d.grasp)) > 8) bad.push(`Grasp ${pct(r.grasp, d.grasp) > 0 ? '+' : ''}${pct(r.grasp, d.grasp).toFixed(0)}%`);
    if (Math.abs(pct(r.mk, d.mk)) > 8) bad.push(`marks ${pct(r.mk, d.mk) > 0 ? '+' : ''}${pct(r.mk, d.mk).toFixed(0)}%`);
    if (bad.length) { clean = false; console.log(`  ${r.act}  ${bad.join(', ')}`); }
  });
  if (clean) console.log('  none');

  console.log('\n--- levelling against the act script ---');
  rows.forEach(r => {
    const gap = r.lead - r.want;
    if (gap >= 2) console.log(`  ${r.act}  OVER-levelled: lead school ${r.lead} against an act written for ${r.want}`);
    if (gap <= -2) console.log(`  ${r.act}  UNDER-levelled: lead school ${r.lead} against an act written for ${r.want}`);
  });

  console.log('\n--- schools at the end ---');
  const end = rows.at(-1).levels;
  for (const s of SCHOOLS) {
    const src = state.perSchoolSource[s];
    const top = Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${Math.round(v / state.schools[s] * 100)}%`).join(', ');
    const flag = end[s] < 5 ? '  <-- never trained by the critical path' : '';
    console.log(`  ${s.padEnd(8)} ${String(end[s]).padStart(2)}  ${String(state.schools[s]).padStart(7)} XP   ${top}${flag}`);
  }

  console.log('\n--- diminishing returns, on action XP only ---');
  const b = state.brake;
  console.log(`  tierMul took ${Math.round(b.tier).toLocaleString()} XP (${(b.tier / b.base * 100).toFixed(1)}% of ${Math.round(b.base).toLocaleString()} action XP)`);
  console.log(`  repMul  took ${Math.round(b.rep).toLocaleString()} XP (${(b.rep / b.base * 100).toFixed(1)}%)`);
  const actionShare = SCHOOLS.reduce((n, s) => n + (state.schools[s] - (state.perSchoolSource[s].quest || 0)), 0);
  console.log(`  action XP is ${(actionShare / rows.at(-1).xp * 100).toFixed(0)}% of the run, quest turn-ins ${(100 - actionShare / rows.at(-1).xp * 100).toFixed(0)}%`);

  console.log('\n--- economy ---');
  console.log(`  earned ${state.earned.toLocaleString()} mk, spent ${state.spent.toLocaleString()} mk, ending purse ${state.marks.toLocaleString()} mk`);
  console.log(`  income: ${Object.entries(state.income).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(', ')}`);
  const negative = rows.find(r => r.mk < 0);
  if (negative) console.log(`  STALL: purse goes negative at ${negative.act}`);
  const runaway = rows.findIndex((r, i) => r.mk > table[i].mk * 3);
  if (runaway >= 0) console.log(`  RUNAWAY: purse is ${(rows[runaway].mk / table[runaway].mk).toFixed(1)}x the §11 budget from ${rows[runaway].act} onward`);
  if (!negative && runaway < 0) console.log('  within an order of the §11 budget throughout');

  console.log('\n--- §12.3 Neutral gate, by scenario ---');
  for (const r of CB.neutralGate({ level: 17 })) {
    console.log(`  ${r.id.padEnd(7)} +${((r.ratio - 1) * 100).toFixed(0)}%  ${r.note}`);
  }

  console.log('\n--- §12.2 extra assertions ---');
  const glutAt = [...Array(60).keys()].findIndex(n => E.glut(n) === E.GLUT_FLOOR) + 1;
  console.log(`  first glut unit at the floor: ${glutAt} ${glutAt === 34 ? 'PASS' : 'FAIL'}`);
  // §7.3's shop is priced against this purse: kit+food and charm+kit both affordable, the Warm
  // cord alone a trap that leaves nothing.
  const purse = state.openingPurse;
  const shop = { kit: 42, food4: 60, charm: 83, cord: 115 };
  const shopOk = shop.kit + shop.food4 <= purse && shop.charm + shop.kit <= purse
    && shop.cord <= purse && purse - shop.cord < shop.kit;
  console.log(`  purse at the §10.4 opening (after L03): ${purse} mk`);
  console.log(`  §7.3 shop still three options and one trap: ${shopOk ? 'PASS' : 'FAIL — re-derive the prices against ' + purse + ' mk'}`);
  const noGate = QUESTS.every(q => !q.grasp && !q.schoolReq);
  console.log(`  no Grasp or school gate on any act exit: ${noGate ? 'PASS' : 'FAIL'}`);
  const stuck = SCHOOLS.filter(s => end[s] < 5);
  console.log(`  no school below level 5 at the end: ${stuck.length === 0 ? 'PASS' : `FAIL — ${stuck.join(', ')}`}`);

  if (state.warnings.length) {
    console.log('\n--- warnings ---');
    for (const w of [...new Set(state.warnings)]) console.log(`  ${w}`);
  }
}
