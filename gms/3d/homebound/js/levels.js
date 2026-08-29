// HOMEBOUND — level generation.
//
// ===========================================================================
// MANAGER: two small asks. Everything from the last round landed — enemies.js
// reads the per-item `hp`/`dps`, game.js fires `{kind:'bubble'}` items from the
// z-loop, gates.js honours PRESS `action`, and gates.js:342 now scales growth by
// `growDmgScale`, which this file's budget model matches exactly.
//
//  1. `state.js:applyBaseUpgrades` — STARTING SQUAD grants `1 + up.squad`, but
//     `UPGRADES.squad.fmt` promises `${1 + v * 2} men`. The doubling landed in
//     the label and not in the grant, so the store advertises twice what it
//     gives. Everything measured here uses what state.js actually does; when
//     the grant is fixed, every "extra men at the finish per level of SQUAD"
//     number in dev/ doubles with it and nothing needs re-tuning.
//
//  2. `hud.js` TUTORIALS has no `gamble` entry, and chapter 1 level 6 now ships
//     `tutorial: 'gamble'`. Suggested copy, in the house style:
//       gamble: { icon: '?', head: 'THE PURPLE GATE',
//                 body: 'It will not say what it does. Usually good. Not always.',
//                 done: 'gate:pass' }
// ===========================================================================
// ===========================================================================
//
// WHAT THIS FILE IS
//
// A level is not sprinkled, it is *composed*. `buildLevel` runs a small budget
// model down the road — how many men the player is expected to have at metre
// 300, what their DPS is — and every beat sizes its content against that model
// rather than against a hand-typed constant. That is why one generator can
// serve level 3 and level 118: the shapes are the same, the numbers are always
// relative to the squad that will actually arrive.
//
// THE BEATS (each is a generator below, each returns the new cursor z):
//
//   runway    clear road. Breathing room, props, the odd off-lane pickup.
//   open      paired GROW gates, no threat. The on-ramp and the tutorial.
//   ladder    the reference frame: a long chain of cheap gates down one side,
//             a chain of expensive ones down the other, and a red column wide
//             enough that neither side is a dodge.
//   pressure  good gates and a blocking enemy group ON THE SAME LANE. Farm it
//             and eat the block, or swerve and take the poor lane.
//   wall      a full-span numbered barrier with a gate row 30 m in front of it.
//             Every bullet you spend growing the gate is a bullet not spent on
//             the wall, and bodying a live wall costs BARRIER.killOnTouch.
//   blocker   a partial barrier you can drive around — the fixed-price version.
//   fork      one row, three genuinely different offers, no threat. A decision
//             with nothing else pulling at the trigger. Rare on purpose.
//   trapline  rows of three where one or two lanes are red glass. Shooting a
//             trap denies it; that is fire you are not spending on the good one.
//   press     a button plate placed where triggering it is worth the shot.
//   narrows   the road pinches. No gates inside it — the pinch is the threat.
//   promote   a ▲ row with a fight 40 m behind it. Divide your count now for
//             more DPS in ten seconds, or keep the bodies.
//   convoy    an enemy column advancing at you, with cash gates behind it.
//   boss      a short top-up, then the pin.
//
// THE CORE TENSION IS AN ASSERTION, NOT AN INTENTION. Every level past the
// tutorials must contain at least one gate row whose fire window (GUN.range in
// front of it) overlaps a live threat. `verifyLevel()` checks it and
// `buildLevel` repairs it. A level without that is a corridor.
//
// EXPORTS
//   buildLevel(spec)            → LevelDef
//   levelSpec(chapter, level)   → spec for a story level (null if out of range)
//   LEVEL_KINDS                 → ['story','mission','event']
//   MISSIONS / missionSpec / buildMission / missionRankFor
//   EVENTS   / eventSpec   / buildEvent   / activeEvents
//   levelName(chapter, level)
//   verifyLevel(def)            → [] or a list of contract violations
//
// Pure data. No Three.js, no DOM, no Math.random.

import { GATE, BARRIER, TIERS, RUN, ROAD, GUN, EFFECTS, ECON, SHIELD_PER } from './config.js';
import { seededRng, clamp } from './utils.js';
import { storySeen } from './save.js';
import { beatsFor } from './story.js';
import {
  chapterOf, levelCount, reqPowerFor, rewardFor, isBoss, bossRank,
  isChapterFinale, themeFor, impliedUpgrades,
} from './chapters.js';

export const LEVEL_KINDS = ['story', 'mission', 'event'];

// The lane grid. Gates only ever sit on these three x values — the contract
// says so and gates.js binary-searches rows by z assuming it.
export const LANES = [-3.6, 0, 3.6];
const laneX = (i) => LANES[clamp(i + 1, 0, 2)];          // -1 | 0 | +1 → x

// --------------------------------------------------------------------------
// Tuning constants. Every one of these is a number I had to pick; the comment
// is why it is that number and not another.
// --------------------------------------------------------------------------

// Fraction of GATE.growMax a competent player actually banks on a gate they
// chose to farm. At GUN.fireCap shooters a gate reaches its 24x ceiling in
// roughly 0.6 s of undivided fire, but rows in a ladder are 7 m apart — 0.56 s
// at RUN.speed — so you are always one rung behind the cap. Measured off the
// greedy run simulation, not assumed. Used only by the FIXED PRICE modifier,
// which has to pay what a gate would have grown to.
const GROW_EFF = 0.75;

// How much of the road a "you cannot dodge this" enemy group covers. ROAD is
// 11 m across and the squad is a disc; anything at 9 m or wider owns every lane.
const WIDE = 9;
const NARROW_GROUP = 6;      // dodgeable if you give up the lane it sits on

// How much one rich row is worth once the squad is big enough for the +24 floor
// to stop mattering. 0.30 means a level's crowd multiplies by 1.3 a row, so ten
// rows is 14x — which is the shape of a run that feels like it snowballed.
const ROW_GAIN = 0.30;

// How many rich rows it takes to walk `start` up to `target`. Growth is
// additive at GATE.growMax*0.85 men a row until about 75 men and geometric at
// ROW_GAIN after, so the answer cannot be divided out — it is walked. This is
// the number that decides how many gates a level has, and therefore how long
// it is: the content follows the curve, not the other way round.
function rowsToTarget(start, target) {
  let n = 0, t = Math.max(1, start);
  while (t < target && n < 22) { t += Math.max(GATE.growMax * 0.85, t * ROW_GAIN); n++; }
  return clamp(n, 5, 20);
}

// MIN_ROW_GAP is a READABILITY constant, not a pacing one. A gate panel is 3 m
// tall and the camera looks down the road at a shallow angle from CAM.back
// behind, so two rows closer than about 18 m physically overlap on screen and
// the player cannot tell which sign belongs to which row. The first build of
// this file used 7 m and three rows stacked into one unreadable pile of panels.
// 18 m is 1.44 s at RUN.speed, which is also about how long a player needs to
// read a row, decide, and steer to it.
const MIN_ROW_GAP = 18.0;
const LADDER_GAP = 19.0;     // z between rungs. The reference chain has air in it.
const ROW_GAP = 20.0;        // z between ordinary gate rows
const TAIL = 72;             // clear road after the last item. Contract wants ≥60.
const RUNWAY = 74;           // clear road before the first item, so the drag hint lands

// --------------------------------------------------------------------------
// The budget model — "who is going to be standing here?"
// --------------------------------------------------------------------------
// Built from `reqPowerFor`, run through the same buyer chapters.js uses, so it
// describes the *weakest* player allowed through the door. Sizing content
// against the weakest legal player is the only sizing that cannot produce a
// wall; a strong player simply melts it, which is the reward for grinding.
//
// The model walks the level as it is generated, so by the time a boss is placed
// it knows how many men will be standing there. Checked against a greedy run
// simulation over all 147 levels: the model lands within ~20% of the run, which
// is what keeps boss time-to-kill in the 5–10 s band instead of the 2 s and
// 25 s it hit while the two disagreed.
function budgetFor(chapter, level, opts = {}) {
  const power = opts.power ?? reqPowerFor(chapter, level);
  const up = impliedUpgrades(power).up;
  const startTier = opts.startTier ?? 0;
  const sim = {
    troops: Math.max(1, 1 + (up.squad || 0)),
    tier: Math.max(startTier, Math.min(up.start || 0, TIERS.length - 1)),
    dmgMul: 1 + (up.damage || 0) * 0.08,
    rateMul: 1 + (up.rate || 0) * 0.04,
    // BODY ARMOUR now pays twice. The shield pool is the half that matters at
    // the squad sizes chapter 1 is actually played at — 3 points absorbs a whole
    // barrier body-check when the squad is eight men — so the model has to carry
    // it or every early margin here is measured against the wrong player.
    shield: (up.armour || 0) * SHIELD_PER,
    armour: Math.min(0.6, (up.armour || 0) * 0.02),
    power,
  };
  // state.js:squadDps(). The one number every hp in this file is divided by.
  sim.dps = () => TIERS[sim.tier].dps * sim.dmgMul * sim.troops;

  // ...except for anything that PUNISHES a weak run. Measured over 147 levels,
  // the model lands within 5% of an actual run at the median but spreads from
  // 0.30x to 1.28x, mostly because a promotion the model took and the player
  // declined (or the reverse) swings squad DPS by the tier merge ratio.
  //
  // The two failure modes are not symmetric. A boss sized too small dies fast
  // and is anticlimactic; a boss sized too large pins the squad for twenty
  // seconds, and an unbreakable full-span wall costs BARRIER.killOnTouch of the
  // army for a mistake the player could not have avoided. So full-span walls
  // and bosses are sized against the low end of that spread and everything
  // else — partial barriers you can drive around, enemy blocks you can decline
  // to fight — is sized against the expected line.
  // 0.9, measured: with cash gates no longer out-bidding troop gates the model
  // never over-predicts any more (p90 of model/run is 0.97), so the pessimism
  // only has to cover the last 10%. It was 0.55 while the spread reached 1.28x.
  sim.weakDps = () => sim.dps() * 0.90;
  // Bullets per second that can land on a gate. combat.js only spawns
  // GUN.fireCap tracers, and GATE.growPerHit is per hit, so the growth rate
  // saturates at 26 shooters — which is why gate *base* values, not gate
  // count, are this game's balance lever.
  sim.hitsPerSec = () =>
    Math.min(sim.troops, GUN.fireCap) / (TIERS[sim.tier].rate / sim.rateMul);
  return sim;
}

// What a GROW gate of base value `b` is worth after `sec` seconds of fire.
// Mirrors GATE.growPerHit / growFlat / growMax exactly: v = v*1.055 + 0.35,
// ceiling 24x base.
function grownValue(base, sec, sim) {
  const cap = base * GATE.growMax;
  // GATE.growDmgScale: the number on the sign answers to FIREPOWER, not just to
  // how many bullets land. This is the only reason the damage upgrade is worth
  // buying in a chapter where the only thing to shoot is gates.
  const dScale = 1 + (sim.dmgMul - 1) * GATE.growDmgScale;
  let v = base;
  const hits = Math.floor(sec * sim.hitsPerSec());
  for (let i = 0; i < hits && v < cap; i++) v += (GATE.growFlat + v * GATE.growPerHit) * dScale;
  return Math.min(cap, v);
}

// What fraction of a gate's geometric window the MODEL assumes goes into that
// gate. Not 1.0, and that matters more than it looks: gate growth is capped at
// GATE.growMax x base, so if the model assumes a perfect farm then every gate is
// written to hit its ceiling exactly and a player with a better gun gets nothing
// extra out of it — FIREPOWER would compound into nothing. Leaving 45% of the
// window unspent is both realistic (there is always something else to shoot) and
// the headroom a bigger dmgMul converts into more men.
const MODEL_FOCUS = 0.55;

// Inverse of `grownValue`: the number to paint on the sign so that farming it
// for `sec` seconds is worth `target` men. Solved numerically rather than
// divided by GATE.growMax, because growth saturates — a gate that reaches its
// 24x ceiling in 0.5 s pays the same for 0.5 s of fire as for 2 s, and dividing
// by the ceiling overshoots by 30% a row.
//
// The target is an ABSOLUTE number of men, not a multiplier. Growth in this
// game is additive, not geometric: past GUN.fireCap shooters any growable gate
// saturates at 24x base inside half a second, so a row is worth `24 x base`
// almost regardless of the squad's size. Sizing rows as percentages of the
// squad is what produced a whole game of identical `+1` signs.
//
// Clamped to 1: a +1 that grows to +24 is the reference frame's left-hand side.
function growBase(sim, target, sec) {
  if (target <= grownValue(1, sec, sim)) return 1;
  let lo = 1, hi = Math.max(2, target);
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (grownValue(mid, sec, sim) >= target) hi = mid; else lo = mid;
  }
  return Math.max(1, Math.round(hi));
}

// Signage reads at a glance while moving, so gate numbers are rounded to
// something a thumb can parse: 1..24 exact, then 2 significant figures.
function nice(n) {
  n = Math.max(1, Math.round(n));
  if (n <= 24) return n;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

// --------------------------------------------------------------------------
// Item constructors. Every gate goes through one of these so panel/grow/sign
// can never disagree with EFFECTS.
// --------------------------------------------------------------------------

// Only `troops` and `cash` are ever growable. A growable ×N is not a bet, it is
// a win button: ×2 grown to its 24x ceiling is ×48 and the level is over.
const GROWABLE = new Set(['troops', 'cash']);

function gate(z, lane, effect, extra = {}) {
  const def = EFFECTS[effect.type] || {};
  const good = def.good !== false;
  const grow = extra.grow ?? (GROWABLE.has(effect.type) && good);
  // Bad gates are always glass: BREAK is the counterplay, and a trap you cannot
  // shoot off the board is just a tax.
  const panel = extra.panel ?? (good ? 'wood' : 'glass');
  return {
    kind: 'gate', z, x: laneX(lane), w: GATE.width,
    panel, effect, grow,
    hp: extra.hp ?? GATE.glassHp,
    action: extra.action ?? null,
  };
}

function trapGate(z, lane, sim, r) {
  // A trap that cannot meaningfully hurt is decoration. `loss` is sized against
  // the squad that will actually be standing there; `divide` is the nastier of
  // the two and shows up less often.
  const effect = r.chance(0.7)
    ? { type: 'loss', value: nice(Math.max(2, sim.troops * r.range(0.14, 0.30))) }
    : { type: 'divide', value: r.pick([2, 2, 3]) };
  // Glass HP scales with the squad so denying a trap always costs about a third
  // of a second of the whole squad's fire — at level 3 and at level 118.
  const hp = Math.max(GATE.glassHp, Math.round(sim.dps() * 0.30));
  return gate(z, lane, effect, { hp });
}

function enemy(z, x, w, count, tier, form, sim, opts = {}) {
  count = Math.max(3, Math.round(count));
  // Total group HP is a *time*, not a number: `killSec` seconds of the squad's
  // undivided fire. That is what keeps a chapter-4 block from evaporating.
  const total = Math.max(count, sim.dps() * (opts.killSec ?? 1.6));
  return {
    kind: 'enemy', z, x, w, count, tier, form, speed: opts.speed ?? 0,
    // EXTRA (see MANAGER note 1)
    hp: Math.max(1, Math.round(total / count)),
    dps: Math.round((0.55 * (1 + tier * 0.35)) * 100) / 100,
  };
}

function barrier(z, x, w, sec, sim, weak = false) {
  // The painted number IS the hp, like the 140 and 300 in the reference.
  // `weak` is for the walls you cannot drive around — see sim.weakDps.
  const value = nice(Math.max(20, (weak ? sim.weakDps() : sim.dps()) * sec));
  return { kind: 'barrier', z, x, w, hp: value, value };
}

const prop = (z, x, id) => ({ kind: 'prop', z, x, id });
const pickup = (z, x, effect) => ({ kind: 'pickup', z, x, effect });

// --------------------------------------------------------------------------
// Beat generators.
//
// Every one takes the shared context `c` = { z, items, sim, r, d, ... } where
// `d` is difficulty 0..1 within the chapter, mutates `c.sim` with the expected
// outcome, appends items, and returns the new cursor z.
// --------------------------------------------------------------------------

// How much of your squad a threat beat costs if you ignore it completely.
// Four or five of these at chapter-4 rates is death, which is the point: you
// cannot farm every gate and you cannot kill every enemy.
// Measured, not guessed: at 0.25 the model and an actual run diverged by 2.1x
// over five threat beats, because the model assumed the player thins a block by
// 58% and a greedy run — busy growing gates — manages far less. Six beats of
// compounding turns a 16%-a-beat assumption into a 2x error at the boss.
const lossFrac = (c) => 0.12 + 0.16 * c.d;
// Seconds of undivided fire a group is worth. Longer late so a fight is a
// commitment rather than a speed bump.
const killSec = (c) => 1.1 + 1.6 * c.d;

// --------------------------------------------------------------------------
// THE ROW.
//
// Every gate row in the game comes out of here, because a row has two rules and
// both of them are easy to break one beat at a time:
//
//  1. NO FREE LANE. Three lanes, three offers — or two offers and the third
//     lane physically blocked at that z by a column, a wall or a pinch. A row
//     with an empty lane is not a choice, it is a row you drive around, and the
//     first build of this file was full of them: gates on the outside two lanes
//     and an unpunished ride straight down the middle.
//  2. The offers are DIFFERENT THINGS. A wooden gate that grows under fire, a
//     glass gate that pays now for nothing, and a third lane that is usually a
//     smaller reward and is sometimes a red trap — so the lazy lane has a price.
//
// `blocked` names the lane a threat already owns, if any.
// --------------------------------------------------------------------------
function row(c, z, richLane, opts = {}) {
  const r = c.r;
  // The two big offers sit as far apart as the road allows, so choosing one is
  // a commitment across the width rather than a nudge.
  const fixedLane = richLane === 0 ? r.pick([-1, 1]) : -richLane;
  const spare = [-1, 0, 1].find((l) => l !== richLane && l !== fixedLane);
  const hasSpare = opts.blocked !== spare;
  c.rowIndex++;

  // THE MULTIPLIER. Exactly one guaranteed per level, in the back half.
  //
  // Without it a level is pure addition, and pure addition is why STARTING
  // SQUAD was worth nothing: beginning with nine men instead of one means
  // FINISHING with eight more men. A x2 makes every gate taken before it matter
  // again, retroactively, and that is the only thing that turns a bigger start
  // into a bigger finish. Back half, so there is something to grow *for* on the
  // way to it.
  // A forced `?` (the chapter-1 level-6 lesson) outranks the multiplier for the
  // spare lane; the multiplier simply waits for the next row that has one.
  const forced = hasSpare && opts.forceGamble;
  const mult = hasSpare && !forced && !c.multDone &&
    c.rowIndex >= c.multRow && z >= c.multZMin;
  const rich = richGate(c, z, opts.share ?? 1, opts.capSec, { bank: !mult });
  const fixed = fixedGate(c, rich, opts.fixedFrac ?? 0.45);
  c.items.push(gate(z, richLane, rich));
  c.items.push(gate(z, fixedLane, fixed, GLASS));

  if (mult) {
    const v = c.d > 0.45 && r.chance(0.35) ? 3 : 2;
    c.items.push(gate(z, spare, { type: 'mult', value: v }, { grow: false }));
    c.multDone = true;
    // The model takes it: it is worth a whole squad and the other two lanes are
    // worth a fraction of one, so everything sized after this assumes the x2.
    c.sim.troops = Math.min(c.ceiling, c.sim.troops * v);
  } else if (forced || (hasSpare && c.gambleRate > 0 && r() < c.gambleRate)) {
    // The `?`. Always placed opposite a gate whose number you CAN read, so the
    // choice is "take the known thing, or find out" — the only framing in which
    // a gate that hides its own effect is fair rather than arbitrary.
    c.items.push(gate(z, spare, { type: 'gamble', value: 0 }, { grow: false }));
  } else if (hasSpare) {
    c.items.push(thirdGate(c, z, spare, rich));
  }
  return rich;
}

// The third lane. Deliberately a different KIND of thing from the two big
// offers — money, armour, a gun, or a trap — so a row reads as three decisions
// and not as one number repeated. The trap is the important one: it is what
// stops the leftover lane being a free ride.
function thirdGate(c, z, lane, rich) {
  const r = c.r;
  const roll = r();
  if (roll < c.trapRate) return trapGate(z, lane, c.sim, r);
  // Troop gates are the bread and butter and these weights say so. Two of a
  // row's three lanes already pay men; holding the third lane to ~14% cash and
  // ~10% each of shield/gun keeps the measured mix around two thirds troops.
  // WHERE cash goes is the brake on it. Only on rows inside a beat that has
  // something shooting at you, and weighted to the front half where the men it
  // displaces still have a whole level to compound in. Money you take on an
  // empty road costs nothing; money you take with a column of red at your
  // shoulder costs the fight, which is the decision the gate is supposed to be.
  const cashRate = !c.beatThreat ? 0 : (c.rowIndex < c.multRow ? 0.42 : 0.14);
  if (roll < c.trapRate + cashRate) return gate(z, lane, cashGate(c, c.lastSec || 1.2, 0.8));
  if (roll < c.trapRate + cashRate + 0.20) {
    return gate(z, lane, { type: 'shield', value: nice(Math.max(3, c.sim.troops * 0.10)) }, { grow: false });
  }
  if (roll < c.trapRate + cashRate + 0.30) return gate(z, lane, { type: 'weapon', value: r.int(1, 2) }, { grow: false });
  // A smaller fixed price. Same verb as the glass gate opposite, less of it —
  // the row still has a cheap seat. Priced off `lastGrown` like `fixedGate`,
  // NOT off the wooden gate's 24x ceiling: a one-man squad cannot reach that
  // ceiling in one window, and pricing against it put a +58 in the third lane
  // of level one beside a wooden gate that could only ever reach +21.
  return gate(z, lane, { type: 'troops', value: nice(Math.max(1, (c.lastGrown || 4) * 0.22)) }, GLASS);
}

// Rows are the level's real currency. A beat asks for N and gets at most a bit
// over half of what is left, so one long ladder cannot eat the whole level and
// leave the boss with nothing to top up on. `c.reserve` holds rows back for the
// boss beat, which needs men more than any other beat does.
//
// Only `richGate` actually SPENDS a row; this just sizes the beat.
function takeRows(c, want) {
  const avail = Math.max(1, c.rowsLeft - c.reserve);
  return clamp(want, 1, Math.max(1, Math.ceil(avail * 0.55)));
}

// The one place the model loses men, so the one place BODY ARMOUR is felt:
// the shield pool absorbs 1:1 before anyone dies, then the percentage applies.
function hurtModel(c, men) {
  let n = Math.max(0, men) * (1 - c.sim.armour);
  const absorbed = Math.min(c.sim.shield, n);
  c.sim.shield -= absorbed;
  n -= absorbed;
  c.sim.troops = Math.max(1, c.sim.troops - n);
}

// Book-keeping: the player kills most of what they shoot at, but not all.
function spendThreat(c, count) {
  hurtModel(c, count * (0.30 + 0.24 * c.d));
}
function bankGate(c, base, sec = 0.55) {
  c.sim.troops = Math.min(RUN.maxTroops * 0.85, c.sim.troops + grownValue(base, sec, c.sim));
}

// The rich lane of a row, and the only place a troop gate's number is decided.
//
// TWO BUDGETS. `rowsLeft` is how many rows the level can still afford to pay in
// men (`rowsToTarget` walked it), and `ceiling` is the hard stop before
// RUN.maxTroops. Past either, the rich lane banks CASH instead. The gate is
// still a bet you rewrite by shooting it; it just pays money, which is what a
// row is worth once the crowd is as big as the road can hold.
function richGate(c, z, share = 1, capSec = Infinity, o = {}) {
  // THE WINDOW IS GEOMETRY. A gate pops in at GATE.approachFade and stops being
  // the nearest target the moment the row behind it takes over, so the seconds
  // of fire it can receive are `min(approachFade, gapFromLastRow) / RUN.speed`.
  //
  // The first row of a beat sits 50–90 m behind the last one, so it gets the
  // full 2.08 s and grows to its 24x ceiling; a ladder rung 7 m behind its
  // neighbour gets 0.56 s. Pricing every row off a per-beat constant instead
  // under-counted the model by 3x, which is why an earlier pass of this file
  // shipped a chapter-1 boss that died in 2.6 seconds to an 871-man squad.
  const sec = Math.min(capSec, WINDOW_MAX, Math.max(0.08, (z - c.lastRowZ) / RUN.speed));
  c.lastRowZ = z;
  // What this row is worth. A base-1 gate always pays about GATE.growMax men
  // once you have GUN.fireCap shooters, so there is a FLOOR under every row —
  // below ~75 men a level grows additively at +24 a row no matter what the
  // budget says, and only above that does `rowGain` take over and make the
  // signs climb into three figures. Both regimes are real; pretending the first
  // one does not exist is what produced a whole level of identical `+1`s.
  const want = Math.max(GATE.growMax * 0.85, c.sim.troops * c.rowGain) * share;
  // The base is solved against MODEL_FOCUS of the window, so the sign is written
  // for a player who is also busy with something else. `lastGrown` is what the
  // whole window is worth — the glass gate beside it and the cash gate opposite
  // are both priced against THAT, and the gap between the two is the room a
  // better gun has to work in.
  const b = nice(growBase(c.sim, want, sec * MODEL_FOCUS));
  const gain = grownValue(b, sec * MODEL_FOCUS, c.sim);
  c.lastGrown = grownValue(b, sec, c.sim);
  c.lastSec = sec;
  // Out of budget, or the squad is at RUN.maxTroops and more men are wasted:
  // the row banks money instead. `lastGrown` is what farming this row is worth
  // at the CURRENT squad, which is what the glass gate beside it is priced off.
  if (c.rowsLeft <= c.reserve || c.sim.troops + gain > c.ceiling) {
    // Out of budget. The row still has to be worth stopping for, so it pays
    // money — at half temptation, because a squad already at target does not
    // need bribing away from men it cannot use.
    c.lastGrown = Math.max(2, c.sim.troops * 0.25);
    return cashGate(c, sec, 0.5);
  }
  c.rowsLeft--;
  if (o.bank !== false) c.sim.troops = Math.min(c.ceiling, c.sim.troops + gain);
  return { type: 'troops', value: b };
}
// CASH IS PRICED OFF THE MEN IT DISPLACES, not off the level's reward.
//
// A share-of-reward price is a trap for anyone who has not done the arithmetic.
// Take `+40` on row three and those men are still with you at the finish, by
// which time every multiplier and grown gate after them has compounded them into
// a few hundred — worth `ECON.perTroop` each at payout, and worth rather more
// than that in the fights they won on the way. A `$30` sign beside that is not
// an option, it is a punishment for reading it.
//
//     cash ~ T_competing x M(z) x ECON.perTroop x ECON.cashTempt
//
// `T_competing` is what the troop gate on this row is actually worth over its
// whole window (`c.lastGrown`); `M(z)` is how much the squad still has to grow
// from here, which the budget model knows because it is walking the level as it
// writes it; `cashTempt` is the thumb on the scale that makes money genuinely
// tempting rather than merely fair.
//
// Two things fall out of this for free and both are good. Early cash gates are
// enormous numbers, because early men compound the most and the money has to
// beat that. Late ones are modest, because by then a man is nearly just a man.
// And the brake on cash is never that it pays badly — it is that you arrive at
// the boss with the army you started with.
function cashGate(c, sec, tempt = 1) {
  const ahead = clamp(c.endTarget / Math.max(1, c.sim.troops), 1, 40);   // M(z)
  const worth = (c.lastGrown || 4) * ahead * ECON.perTroop * ECON.cashTempt * tempt;
  return { type: 'cash', value: nice(growBase(c.sim, worth, sec * MODEL_FOCUS)) };
}
// Non-growable cash, for the pickups lying beside the road.
const cashFlat = (c, tempt = 0.4) => ({
  type: 'cash',
  value: nice(Math.max(5, (c.lastGrown || 4) * clamp(c.endTarget / Math.max(1, c.sim.troops), 1, 40) *
    ECON.perTroop * ECON.cashTempt * tempt)),
});

// THE OTHER LANE — and the reason a row is a decision.
//
// A wooden GROW gate beside another wooden GROW gate is not a choice, it is two
// numbers. So the second lane is the brief's fixed-price option: GLASS, not
// growable, showing a middling number you get **without firing a single shot**.
//
// That is the core tension written into every single row. Take the glass gate
// and keep your whole window for the enemy column; or spend the window growing
// the wooden +1 into a +24 and let the column walk into you. The sign colour
// still separates good from trap (EFFECTS decides it), and glass gates read as
// glass, so nothing here is ambiguous at a glance.
const GLASS = { panel: 'glass', grow: false };
function fixedGate(c, rich, frac = 0.45) {
  // Priced off `c.lastGrown` — what the wooden gate beside it is ACTUALLY worth
  // to the squad standing here, not its 24x ceiling and not the model's
  // post-bank troop count. Both of those mis-price it by an order of magnitude:
  // a 6-man squad cannot reach a gate's ceiling in one window, so pricing the
  // glass gate off that ceiling offered +80 next to a +8 and ended the level.
  //
  // At frac ~0.45 the fixed price is a little under half of a full farm, so
  // farming wins whenever you can give the gate more than about half its
  // window — and every threat on the road is an argument that you cannot.
  return { type: 'troops', value: nice(Math.max(1, (c.lastGrown || 4) * frac)) };
}

function runway(c, len) {
  const r = c.r;
  const n = Math.floor(len / 26);
  for (let i = 0; i < n; i++) {
    // Props live outside ROAD.halfW so decoration can never become a hitbox.
    const side = r.chance(0.5) ? -1 : 1;
    c.items.push(prop(c.z + 8 + i * 26 + r.range(0, 10), side * r.range(6.4, 8.6),
      r.pick(c.propKit)));
  }
  // An off-lane pickup rewards drifting wide when there is nothing to shoot.
  if (r.chance(0.35) && len > 50) {
    c.items.push(pickup(c.z + len * 0.55, (r.chance(0.5) ? -1 : 1) * 5.0,
      r.chance(0.6) ? cashFlat(c, 0.35)
        : { type: 'shield', value: nice(Math.max(3, c.sim.troops * 0.08)) }));
  }
  return c.z + len;
}

// Seconds of fire each beat gives one gate. These are GEOMETRY, not taste: a
// gate pops in at GATE.approachFade (26 m = 2.08 s at RUN.speed) and stops being
// the nearest target the moment the row behind it does, so a gate's window is
// `min(rowGap, approachFade) / RUN.speed`. Ladder rungs are 7 m apart, so 0.56 s
// each; an isolated row on empty road gets the full 2.08 s.
//
// Guessing these low is what made the first two passes of this file mis-size
// every boss in the game: the model banked a third of what the run actually
// banks, so it sized bosses for a squad three times smaller than the one that
// turns up, and a chapter-1 boss died in 2.2 seconds.
const WINDOW_MAX = GATE.approachFade / RUN.speed;                    // 2.08 s
// The one place geometry is not the whole story: the row in front of a
// full-span wall shares its window with the wall, and the wall is not optional.
const SEC = { wallPre: 0.90 };

// Paired GROW gates, no threat. Two rungs is a choice; one is a gift.
function open(c, rows) {
  const r = c.r;
  rows = takeRows(c, rows);
  c.beatThreat = false;
  for (let i = 0; i < rows; i++) {
    // Nothing is blocking a lane on an empty road, so every one of these is a
    // full three-lane row.
    row(c, c.z, r.pick([-1, 1]), { fixedFrac: r.range(0.40, 0.52) });
    c.z += ROW_GAP;
  }
  return c.z + 10;
}

// THE REFERENCE FRAME. A cheap chain down one side, an expensive chain down the
// other, and a red column wide enough that there is no free lane. You cannot
// max both sides and you cannot thin the column while you farm.
function ladder(c, rows) {
  const r = c.r;
  rows = takeRows(c, rows);
  c.beatThreat = true;
  const rich = r.chance(0.5) ? 1 : -1;
  const start = c.z;
  const span = (rows - 1) * LADDER_GAP;

  // A partial wall in front of the rich side: the good chain has a toll, and it
  // is the first thing you meet, so it is sized against the squad that arrives.
  // 14 m in front of the first rung: the squad commits to a lane at
  // GATE.approachFade (26 m) out, so a toll any closer than this is one it
  // cannot shoot off in time and simply pays 22% for.
  c.items.push(barrier(start + 10, laneX(rich), 4.4, 0.45 + 0.3 * c.d, c.sim));

  // The column and the chain are INTERLEAVED, not appended. A ladder is 100 m+
  // long and the squad can triple over its length, so a column emitted up front
  // in one loop is sized for the squad that entered and is free by the far end
  // — which quietly removes the threat from the beat the whole game is built on.
  //
  // Alternating rungs: one with a block of red holding the centre (2 gates, the
  // reference frame exactly), one without (3 gates). Either way the middle lane
  // is never a free ride, and the red reads as chunks rather than a dotted line
  // because half as many groups carry the same total threat.
  const withCol = Math.ceil(rows / 2);
  const total = c.sim.troops * lossFrac(c) * 1.35;
  for (let i = 0; i < rows; i++) {
    const z = start + 24 + i * LADDER_GAP;
    let blocked = null;
    if (i % 2 === 0) {
      const count = total / withCol;
      c.items.push(enemy(z, 0, WIDE, count, c.enemyTier,
        i === 0 ? 'block' : 'column', c.sim, { killSec: killSec(c) * 0.8 }));
      spendThreat(c, count);
      blocked = 0;
    }
    // You are sweeping past with a column in your face, so the model banks each
    // rung at well under a full farm.
    row(c, z, rich, { blocked, fixedFrac: 0.42 });
  }
  return start + 24 + span + 20;
}

// Good gates and a blocking group on the SAME lane. The dodge exists; it costs
// you the whole chain.
function pressure(c, rows) {
  const r = c.r;
  rows = takeRows(c, rows);
  c.beatThreat = true;
  const lane = r.pick([-1, 1]);
  const start = c.z;
  const count = c.sim.troops * lossFrac(c);

  c.items.push(enemy(start + 22, laneX(lane), NARROW_GROUP, count, c.enemyTier,
    'block', c.sim, { killSec: killSec(c) }));

  for (let i = 0; i < rows; i++) {
    // The rich lane IS the blocked lane: the safe gate opposite is also the
    // dodge, and it pays less. The centre carries the third offer, so splitting
    // the difference is a decision rather than an escape.
    row(c, start + 14 + i * ROW_GAP, lane, { fixedFrac: 0.40 });
  }
  spendThreat(c, count);
  return start + rows * ROW_GAP + 46;
}

// A wall you must shoot, with a gate row in front of it so the shooting has a
// price. Bodying it costs BARRIER.killOnTouch (22%) of the squad.
function wall(c) {
  const r = c.r;
  const start = c.z;
  c.beatThreat = true;
  // In front of the wall the row is deliberately stingy — farming it costs you
  // wall progress — and behind it the row is the prize for having broken it.
  row(c, start, r.pick([-1, 1]), { share: 0.6, capSec: SEC.wallPre, fixedFrac: 0.46 });

  // Full span: 11 m of road, no lane left. `sec` is seconds of undivided fire,
  // and the gate row above has already eaten some of the approach.
  const wz = start + 54;
  // Full span, no lane left, 22% of the squad if you body it — so it is sized
  // against the weak line and given a long clear approach to break it in.
  c.items.push(barrier(wz, 0, ROAD.halfW * 2, 1.1 + 0.7 * c.d, c.sim, true));
  // Bodying the wall is the failure state this beat is testing for; the model
  // assumes the player breaks it but late, and clips it.
  hurtModel(c, c.sim.troops * BARRIER.killOnTouch * 0.35);
  // Payoff on the far side, so breaking through reads as a reward.
  row(c, wz + 24, r.pick([-1, 1]), { share: 1.5, fixedFrac: 0.44 });
  return wz + 56;
}

// The fixed-price version: a partial wall you can simply drive around, with the
// good lane behind it.
function blocker(c) {
  c.beatThreat = true;
  const r = c.r;
  const lane = r.pick([-1, 1]);
  const start = c.z;
  c.items.push(barrier(start, laneX(lane), 4.6, 0.7 + 0.5 * c.d, c.sim));
  // The good lane is the blocked one, so the "just drive around it" option is
  // also the "take the small number" option.
  row(c, start + 30, lane, { fixedFrac: 0.40 });
  return start + 66;
}

// Three offers, three different verbs, nothing shooting at you. The only beat
// in the game that is purely a decision — which is why there is at most one.
function fork(c) {
  c.beatThreat = false;
  const r = c.r;
  const big = richGate(c, c.z, 1.6);
  const canPromote = c.sim.tier < TIERS.length - 1;
  const promo = canPromote && r.chance(0.55);
  // Three offers, three sign colours. Two greens in one row is a fork the
  // player has to read twice, and a fork you read twice is a fork you miss.
  // NOT a multiplier: the level already guarantees exactly one, in the back
  // half, and a second one in the front stacks into a run that hits
  // RUN.maxTroops with a third of the road still to walk.
  const mid = promo ? { type: 'tier', value: 1 } : { type: 'weapon', value: r.int(2, 4) };
  const right = { type: 'shield', value: nice(Math.max(4, c.sim.troops * 0.16)) };
  c.items.push(gate(c.z, -1, big));
  c.items.push(gate(c.z, 0, mid, { grow: false }));
  c.items.push(gate(c.z, 1, right, { grow: false }));
  return c.z + 44;
}

// Red glass among the blue. The tell is the sign colour, which EFFECTS decides,
// so a trap is never invisible — but shooting it out is fire you wanted for the
// gate beside it.
function trapline(c, rows) {
  const r = c.r;
  rows = takeRows(c, rows);
  c.beatThreat = false;
  const start = c.z;
  for (let i = 0; i < rows; i++) {
    const z = start + i * (ROW_GAP + 2);
    const good = richGate(c, z);
    const poor = fixedGate(c, good, 0.30);
    // Three lanes, three different things: the red glass trap, the wooden gate
    // that grows, and the blue glass one that pays now. Handing two lanes the
    // same offer turns a trap row into a coin flip with a dud face.
    const bad = r.int(0, 2) - 1;
    const rest = [-1, 0, 1].filter((l) => l !== bad);
    const growLane = r.pick(rest);
    for (const lane of [-1, 0, 1]) {
      if (lane === bad) c.items.push(trapGate(z, lane, c.sim, r));
      else if (lane === growLane) c.items.push(gate(z, lane, good));
      // No gaps: a trapline row you can drive around is not a trapline row.
      else c.items.push(gate(z, lane, poor, GLASS));
    }
  }
  return start + rows * (ROW_GAP + 2) + 24;
}

// A button plate placed where pressing it pays: right before a group big enough
// that you would rather not shoot it man by man.
function press(c) {
  c.beatThreat = true;
  const r = c.r;
  const start = c.z;
  const action = r.pick(['airstrike', 'mines', 'cage', 'bridge']);
  const lane = r.pick([-1, 1]);
  c.items.push(gate(start, lane, { type: 'power', value: 5, id: 'rapid' }, {
    panel: 'button', grow: false, action, hp: Math.max(10, Math.round(c.sim.dps() * 0.08)),
  }));
  c.items.push(gate(start, -lane, cashGate(c, 1.6, 1.0)));
  c.items.push(gate(start, 0, { type: 'shield', value: nice(Math.max(3, c.sim.troops * 0.10)) }, { grow: false }));
  const count = c.sim.troops * lossFrac(c) * 1.15;
  c.items.push(enemy(start + 36, 0, WIDE, count, c.enemyTier, 'block', c.sim,
    { killSec: killSec(c) * 1.15 }));
  spendThreat(c, count * 0.8);           // the press is worth about 20% of it
  return start + 72;
}

// Two quiet rows, the first of which carries a `?` opposite a glass gate whose
// number is unusually generous. That pairing is the lesson: the safe thing is
// visibly good, so taking the `?` has to be a decision and not a shrug.
function gambleRow(c) {
  c.beatThreat = false;
  const start = c.z;
  row(c, start, c.r.pick([-1, 1]), { forceGamble: true, fixedFrac: 0.62 });
  row(c, start + ROW_GAP + 6, c.r.pick([-1, 1]), { fixedFrac: 0.45 });
  return start + 2 * ROW_GAP + 28;
}

// The road pinches. No gates inside the pinch — the pinch IS the beat, and a
// gate at ±3.6 would be hanging over the water.
function narrows(c) {
  c.beatThreat = true;
  const r = c.r;
  const start = c.z;
  const len = 34 + Math.round(18 * c.d);
  c.items.push({ kind: 'narrow', z: start, len, halfW: 3.2 });
  const count = c.sim.troops * lossFrac(c) * 0.8;
  c.items.push(enemy(start + len * 0.55, 0, 5.6, count, c.enemyTier, 'skirmish', c.sim,
    { killSec: killSec(c) * 0.8, speed: 3 + 3 * c.d }));
  for (let i = 0; i < 3; i++) {
    c.items.push(prop(start + 4 + i * (len / 3), (i % 2 ? 1 : -1) * 4.6, 'sandbags'));
  }
  spendThreat(c, count);
  // The reward sits 12 m past the exit, so its fire window opens while the
  // skirmishers are still on you.
  const zz = start + len + 18;
  row(c, zz, r.pick([-1, 1]), { fixedFrac: 0.44 });
  return zz + 36;
}

// ▲ with a bill attached. game.js:promote divides your count by TIERS[i].merge,
// so taking this with 40 men leaves you 20 — and the fight is 40 m away.
function promoteBeat(c) {
  c.beatThreat = true;
  const r = c.r;
  const start = c.z;
  const canPromote = c.sim.tier < TIERS.length - 1;
  const merge = TIERS[Math.min(TIERS.length - 1, c.sim.tier + 1)].merge;
  // The one row in the game with a hand-placed centre lane: ▲ is the decision
  // and it belongs in the middle, with the two ways of declining it either side.
  const keep = richGate(c, start);
  const side = r.pick([-1, 1]);
  c.items.push(gate(start, 0, canPromote
    ? { type: 'tier', value: 1 }
    : { type: 'mult', value: 2 }, { grow: false }));
  c.items.push(gate(start, side, keep));
  c.items.push(gate(start, -side, fixedGate(c, keep, 0.50), GLASS));

  const count = c.sim.troops * lossFrac(c) * 1.3;
  c.items.push(enemy(start + 30, 0, WIDE, count,
    clamp(c.enemyTier + (canPromote ? 1 : 0), 0, TIERS.length - 1),
    'block', c.sim, { killSec: killSec(c) * 1.1 }));

  // The model takes the promotion: fewer men, more DPS. It is the branch that
  // makes every subsequent hp in this level smaller, so sizing against it is
  // the conservative choice.
  if (canPromote) {
    c.sim.troops = Math.max(1, Math.floor(c.sim.troops / merge));
    c.sim.tier += 1;
  } else {
    c.sim.troops *= 2;
  }
  spendThreat(c, count);

  // A row 12 m past the block, so its fire window opens while the block is
  // still standing. Without this the promotion is a decision made in silence.
  const zz = start + 56;
  row(c, zz, r.pick([-1, 1]), { share: 1.2, fixedFrac: 0.40 });
  return zz + 40;
}

// A column walking at you with money behind it. `speed` is the whole beat —
// the fire window closes faster than the road does.
function convoy(c) {
  c.beatThreat = true;
  const start = c.z;
  const count = c.sim.troops * lossFrac(c) * 1.2;
  c.items.push(enemy(start + 24, 0, WIDE, count, c.enemyTier, 'column', c.sim,
    { killSec: killSec(c) * 0.85, speed: 6 + 5 * c.d }));
  for (let i = 0; i < 2; i++) {
    row(c, start + 50 + i * ROW_GAP, c.r.pick([-1, 1]), { fixedFrac: 0.44 });
  }
  spendThreat(c, count);
  return start + 50 + 2 * ROW_GAP + 30;
}

// --------------------------------------------------------------------------
// Bosses.
//
// A boss pins the squad (RUN.speedBoss = 0) until its hp is gone, so its hp is
// a *stopwatch*, not a number. Time-to-kill is `hp / state.squadDps()`, and the
// budget model knows squadDps exactly. 7 s for the first boss of a chapter,
// 11 s for the finale — long enough to be a set piece, short enough that a
// phone player does not put the phone down. A boss that takes four minutes is
// a bug, and the harness asserts TTK ≤ 14 s at reqPower.
// --------------------------------------------------------------------------
const BOSS_NAMES = [
  'THE COLONEL', 'IRON MAGDA', 'BLACKROAD', 'THE QUARTERMASTER',
  'GREY WOLF', 'THE ARBITER', 'SEVEN', 'MOTHER OF DOGS',
  'THE CARTOGRAPHER', 'LAST LIGHT', 'THE WIDOWMAKER', 'ZERO HOUR',
];

function bossBeat(c, name, seconds) {
  c.beatThreat = true;
  const start = c.z;
  c.reserve = 0;                 // the rows held back all level are for this
  // A short top-up first: walking into a pin with a thin squad is a loss you
  // could not see coming, and the reference always gives you the +99 chain
  // before the giant.
  for (let i = 0; i < 2; i++) {
    row(c, start + i * ROW_GAP, c.r.pick([-1, 1]), { share: 1.3, fixedFrac: 0.48 });
  }
  const bz = start + 2 * ROW_GAP + 44;
  const hp = Math.round(c.sim.weakDps() * seconds);
  // The boss should take 12–22% of the squad over the hold. Anything more and
  // the level is decided by the boss instead of by the road that led to it.
  const bite = 0.10 + 0.08 * c.d;
  c.items.push({
    kind: 'boss', z: bz, hp, name, tier: Math.min(TIERS.length - 1, c.enemyTier + 2),
    // EXTRA (MANAGER note 1): what it does to you while you hold station.
    dps: Math.round((c.sim.troops * bite / (seconds * 0.90)) * 100) / 100,
  });
  hurtModel(c, c.sim.troops * bite);
  return bz + 40;
}

// --------------------------------------------------------------------------
// Recipes — which beats, in which order.
//
// Chapter 1's first five levels are hand-ordered: one new idea each, and the
// order is gates → grow → barrier → trap → promote. Promote is last of the
// five even though the enum lists it earlier, because dividing your count by
// two is only a decision once you have a count worth dividing.
// --------------------------------------------------------------------------
const TUTORIALS = [
  null, 'gates', 'grow', 'barrier', 'trap', 'promote', 'gamble',
];

function recipeFor(chapter, level, c) {
  const r = c.r;
  const n = levelCount(chapter);
  const boss = isBoss(chapter, level);

  // Missions and events are authored shapes, not composed ones — a BREACH that
  // sometimes has no walls in it is not a mission, it is a random level.
  if (c.spec?.recipe) return c.spec.recipe.slice();

  if (chapter === 1 && level <= 6) {
    switch (level) {
      case 1: return ['open3', 'open3'];
      case 2: return ['open2', 'openLadder', 'open2'];
      case 3: return ['open2', 'blocker', 'wall', 'open2'];
      case 4: return ['open2', 'trapline2', 'pressure2'];
      case 5: return ['open2', 'promote', 'open3'];
      case 6: return ['open2', 'gambleRow', 'pressure2', 'open2'];
    }
  }

  // Everything else is composed. `mid` grows with the chapter so a level 3 run
  // is 45 s and a level 110 run is 70 s — long enough to have an arc, short
  // enough to retry without resentment.
  const mid = clamp(2 + Math.round(c.d * 3) + (chapter >= 4 ? 1 : 0), 2, 6);
  const pool = [];
  const w = (name, weight) => { for (let i = 0; i < weight; i++) pool.push(name); };
  w('ladder', 5);
  w('pressure', 4);
  w('wall', c.d > 0.15 ? 3 : 1);
  w('blocker', 2);
  w('trapline', c.d > 0.12 ? 3 : 0);
  w('narrows', c.d > 0.25 ? 3 : 0);
  w('press', c.d > 0.35 ? 2 : 0);
  w('convoy', c.d > 0.30 ? 3 : 0);
  w('promote', c.d > 0.20 ? 2 : 0);
  w('fork', 2);

  const out = ['open2'];
  const used = {};
  // Caps: more than one fork is a level with no pressure in it; more than two
  // walls is a level that is one idea repeated.
  const cap = { fork: 1, promote: 1, wall: 2, press: 1, narrows: 2 };
  let guard = 0;
  while (out.length < mid + 1 && guard++ < 60) {
    const pickName = r.pick(pool);
    if ((used[pickName] || 0) >= (cap[pickName] ?? 3)) continue;
    if (pickName === out[out.length - 1] && r.chance(0.8)) continue;   // no stutter
    used[pickName] = (used[pickName] || 0) + 1;
    out.push(pickName);
  }
  // The contract: at least one beat where a gate row and a threat share a fire
  // window. `fork`, `open` and `blocker` do not qualify.
  const TENSE = ['ladder', 'pressure', 'wall', 'narrows', 'press', 'convoy', 'promote'];
  if (!out.some((b) => TENSE.includes(b))) out.splice(1, 0, 'ladder');
  if (boss) out.push('boss');
  else if (level === n) out.push('boss');
  return out;
}

// --------------------------------------------------------------------------
// Names
// --------------------------------------------------------------------------
const CH1_NAMES = [
  'MOVING OUT', 'THE SUPPLY ROAD', 'CHECKPOINT NINE', 'THE BROKEN BRIDGE',
  'FIELD PROMOTION', 'ASH VALLEY', 'RIVER CROSSING', 'THE COLONEL',
  'SALT FLATS', 'WIRE COUNTRY', 'THE LONG CULVERT', 'MARKET ROAD',
  'ORCHARD LINE', 'THE DRY CANAL', 'OUTSKIRTS', 'IRON MAGDA',
  'TRAM STREET', 'THE RAIL YARD', 'SCHOOL HILL', 'THE OLD BAKERY',
  'FOUR STREETS OUT', 'THE LAST CHECKPOINT', 'OUR ROAD', 'THE FRONT GATE',
];
const CH3_NAMES = ['NO FLAG', 'CASH IN ADVANCE', 'THE HANDOVER'];
const CH4_A = ['BROKEN', 'RED', 'COLD', 'HIGH', 'LOW', 'BURNT', 'IRON', 'GREY',
  'DEEP', 'FALLEN', 'BITTER', 'QUIET', 'BLACK', 'LAST'];
const CH4_B = ['RIDGE', 'CROSSING', 'YARD', 'PASS', 'BASIN', 'STATION', 'QUARRY',
  'MARCH', 'HOLLOW', 'CAUSEWAY', 'REACH', 'GATE', 'BEND', 'SPUR'];

export function levelName(chapter, level) {
  if (chapter === 1) return CH1_NAMES[clamp(level - 1, 0, CH1_NAMES.length - 1)];
  if (chapter === 3) return CH3_NAMES[clamp(level - 1, 0, CH3_NAMES.length - 1)];
  if (chapter === 4) {
    const r = seededRng(40000 + level * 7919);
    return `${r.pick(CH4_A)} ${r.pick(CH4_B)}`;
  }
  return `SECTOR ${level}`;
}

// --------------------------------------------------------------------------
// levelSpec / buildLevel
// --------------------------------------------------------------------------

// The seed. main.js falls back to `chapter*1000 + level`, so that stays the
// public seed; buildLevel hashes it before use so neighbouring levels do not
// come out looking like each other.
export const seedFor = (chapter, level) => chapter * 1000 + level;
const hash32 = (n) => {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

export function levelSpec(chapter, level) {
  const n = levelCount(chapter);
  if (!n || level < 1 || level > n) return null;
  return {
    chapter, level, mode: 'story',
    seed: seedFor(chapter, level),
    theme: themeFor(chapter, level),
  };
}

const PROP_KITS = {
  front: ['sandbags', 'wreck', 'crate', 'tower'],
  valley: ['crate', 'wreck', 'sandbags'],
  town: ['wreck', 'crate', 'tower'],
  desert: ['crate', 'wreck', 'tower'],
  home: ['crate', 'sandbags'],
};

export function buildLevel(spec) {
  const chapter = spec?.chapter ?? 1;
  const level = Math.max(1, spec?.level ?? 1);
  const mode = spec?.mode || 'story';
  const seed = spec?.seed ?? seedFor(chapter, level);
  const r = seededRng(hash32(seed));
  const n = levelCount(chapter) || 1;
  const theme = spec?.theme || themeFor(chapter, level);

  // Difficulty within the chapter, 0..1. Chapter 4 carries a floor because its
  // level 1 follows chapter 3's finale, not chapter 1's tutorials. Missions and
  // events pass `d` directly — their "level" is a rank, not a position.
  const base = n > 1 ? (level - 1) / (n - 1) : 0.5;
  const floor = chapter >= 4 ? 0.35 : chapter === 3 ? 0.30 : 0;
  const d = spec?.d != null ? clamp(spec.d, 0, 1)
    : clamp(floor + base * (1 - floor), 0, 1);

  const startTier = chapter === 4 ? Math.min(2, Math.floor(level / 40)) : 0;
  const sim = budgetFor(chapter, level, { power: spec?.power, startTier });
  const start0 = sim.troops;

  const c = {
    z: 0, items: [], sim, r, d, chapter, level, mode, spec,
    propKit: PROP_KITS[theme] || PROP_KITS.front,
    // Cash gates are priced as a share of this, so a $ sign always means the
    // same thing relative to what finishing the level pays.
    reward: spec?.reward ?? rewardFor(chapter, level),
    // How often the leftover lane of a row is a red trap rather than a small
    // reward. Zero until the game has actually taught traps — the tutorial for
    // them is chapter 1 level 4, and punishing a lane the player has not been
    // told about is not difficulty, it is a gotcha.
    trapRate: (chapter === 1 && level < 4) ? 0 : clamp(0.10 + 0.26 * d, 0, 0.35),
    // The `?` gate is taught at chapter 1 level 6 and only appears at random
    // after that. Never in the first two levels: a gate whose sign does not say
    // what it does is a mechanic, and a mechanic before the basics have landed
    // is just confusion.
    gambleRate: (chapter === 1 && level < 6) ? 0 : clamp(0.10 + 0.08 * d, 0, 0.18),
    // Enemy tier trails the player's expected tier by design: a fight you can
    // out-shoot reads as your army being good, which is the fantasy of ch.4.
    enemyTier: clamp(Math.floor(d * (chapter >= 4 ? 5 : chapter >= 3 ? 3 : 2)), 0, TIERS.length - 2),
  };

  // The target is an END SIZE, but it is NOT a fixed destination — that was the
  // hidden reason STARTING SQUAD felt worthless. A level that always finishes at
  // 300 men normalises the squad you brought straight back out of the result:
  // start with 1 or start with 21, the generator writes smaller gates and you
  // finish in the same place. So the target is `whichever is larger` of a floor
  // (chapter 1 level 1 has to feel like a crowd even from one man) and a
  // multiple of what you actually walked in with. Above the floor, every extra
  // starting man is worth `levelMul` men at the finish line.
  // Headroom under RUN.maxTroops matters as much as the target itself. Aim at
  // the cap and a chapter-4 run spends its whole second half pinned at 900,
  // where no gate does anything and no upgrade can be felt — measured, that is
  // exactly what a 22x multiple produced. 14-28x lands runs around 400-650 with
  // the ceiling still visible up ahead.
  const levelMul = 14 + 14 * d;
  const floorTarget = 90 + 190 * d;
  const endTarget = spec?.endTarget ??
    clamp(Math.max(floorTarget, sim.troops * levelMul), 60, RUN.maxTroops * 0.72);

  const beats = recipeFor(chapter, level, c);
  // Growth is additive, so the budget is divided by ROWS, not compounded across
  // beats. `perRow` is what one rich gate is worth; `ceiling` is a straight ramp
  // to `endTarget`, and `richGate` pays cash once the squad is ahead of it.
  // Roughly 1.7 rich rows per beat actually pay men; the rest overflow to cash.
  // Growth is ADDITIVE below ~75 men and multiplicative above it, so the budget
  // is spent in ROWS, not compounded across beats. `rowGain` is the geometric
  // rate that lands `troopRows` rows on `endTarget`; `richGate` floors it at
  // one base-1 gate's worth so early rows still snowball.
  // One row in the back half is a x2, so the additive rows only have to carry
  // the squad halfway. `+1` for the multiplier row itself.
  const troopRows = rowsToTarget(start0, endTarget / 2) + 1;
  c.rowGain = ROW_GAIN;
  c.rowsLeft = troopRows;
  c.reserve = beats.includes('boss') ? 2 : 0;    // the boss top-up gets its men
  c.lastGrown = 4;
  c.lastSec = 1.2;
  c.lastRowZ = 0;                               // the first row gets a full window
  c.endTarget = endTarget;                      // cashGate prices M(z) off this
  c.rowIndex = 0;
  c.multDone = false;
  c.beatThreat = false;
  // Back half, but not the very last row: a x2 you meet on the finish line has
  // nothing left to multiply into and nothing after it to spend the squad on.
  // In ROWS, not metres: the budget knows how many rows pay men, and roughly
  // half as many again arrive after the budget runs out, so `0.9 x troopRows`
  // lands the multiplier around 60% of the way down the road. `verifyLevel`
  // checks the metres afterwards and complains if it drifts forward.
  c.multRow = Math.max(3, Math.round(troopRows * 0.9));
  // ...and in metres as well. Row counts alone put the multiplier at 20% of the
  // road on levels whose long beats all come afterwards. The final length is not
  // known while the level is still being written, so estimate it from the beat
  // count — ~105 m a beat, measured — and demand the multiplier sit past 45% of
  // that. `verifyLevel` checks the real number once the level exists.
  c.multZMin = (RUNWAY + beats.length * 105 + TAIL) * 0.45;

  c.z = RUNWAY;
  // The model has to stop short of `endTarget`, not overshoot it: a run takes
  // the best of three lanes on every row while the model only banks one, so the
  // squad that actually turns up runs ~14% ahead of the line. Budgeting to 1.12x
  // is what keeps chapter 4 off the RUN.maxTroops ceiling until the last beat.
  c.ceiling = Math.min(RUN.maxTroops * 0.72, endTarget * 1.12);
  runwayProps(c, RUNWAY);

  let bossIdx = 0;
  for (let bi = 0; bi < beats.length; bi++) {
    const b = beats[bi];
    // The growth ramp. `richGate` pays men while the squad is under this and
    // cash once it is over, so the level arrives at `endTarget` instead of
    // slamming into RUN.maxTroops in the second beat.
    const before = c.z;
    switch (b) {
      case 'open2': c.z = open(c, 2); break;
      case 'open3': c.z = open(c, 3); break;
      case 'openLadder': c.z = open(c, 5); break;
      case 'ladder': c.z = ladder(c, clamp(4 + Math.round(d * 4), 4, 8)); break;
      case 'pressure': c.z = pressure(c, clamp(2 + Math.round(d * 2), 2, 4)); break;
      case 'wall': c.z = wall(c); break;
      case 'blocker': c.z = blocker(c); break;
      case 'fork': c.z = fork(c); break;
      case 'trapline': c.z = trapline(c, clamp(2 + Math.round(d), 2, 3)); break;
      case 'trapline2': c.z = trapline(c, 2); break;
      case 'pressure2': c.z = pressure(c, 2); break;
      case 'gambleRow': c.z = gambleRow(c); break;
      case 'press': c.z = press(c); break;
      case 'narrows': c.z = narrows(c); break;
      case 'promote': c.z = promoteBeat(c); break;
      case 'convoy': c.z = convoy(c); break;
      case 'boss': {
        const rank = bossRank(chapter, level) || 1;
        const finale = isChapterFinale(chapter, level);
        const nm = finale && chapter === 1 ? 'THE FRONT GATE'
          : BOSS_NAMES[(rank - 1 + chapter * 3) % BOSS_NAMES.length];
        // Nominal seconds against sim.weakDps(), so a run on the expected line
        // kills it in ~0.58 of these and a bad run still gets there.
        // Nominal seconds against sim.weakDps(). Measured TTK across all 16
        // bosses at exactly reqPower: 4.0–8.7 s. A boss that takes four minutes
        // is a bug; one that takes eight seconds is a set piece.
        c.z = bossBeat(c, nm, finale ? 12 : 9 + 2.5 * d);
        bossIdx++;
        break;
      }
      default: break;
    }
    // A beat that produced nothing would leave two beats stacked at one z.
    if (c.z <= before) c.z = before + 40;
    c.z += 10 + r.range(0, 14);           // seam between beats, never rhythmic
  }

  // `|| 0` matters: boss and bubble items carry no `x`, and `undefined -
  // undefined` is NaN, which makes a comparator silently non-deterministic.
  // `|| 0` matters: boss and bubble items carry no `x`, and `undefined -
  // undefined` is NaN, which makes a comparator silently non-deterministic.
  // Safety net for the multiplier guarantee. A level whose back half is all
  // two-gate ladder rungs never finds a spare lane, so the last full row gives
  // up its glass gate instead. `verifyLevel` asserts the result.
  if (!c.multDone) {
    const rows = new Map();
    for (const g of c.items) if (g.kind === 'gate') {
      const k = g.z.toFixed(3);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(g);
    }
    const zs = [...rows.keys()].map(Number).sort((a, b2) => a - b2);
    for (let i = zs.length - 1; i >= 0; i--) {
      const row3 = rows.get(zs[i].toFixed(3));
      const victim = row3.find((g) => g.panel === 'glass' && g.effect?.type === 'troops');
      if (!victim || zs[i] > (zs[zs.length - 1] - 30)) continue;
      victim.effect = { type: 'mult', value: 2 };
      victim.panel = 'wood'; victim.grow = false;
      c.multDone = true;
      break;
    }
  }

  // `|| 0` matters: boss and bubble items carry no `x`, and `undefined -
  // undefined` is NaN, which makes a comparator silently non-deterministic.
  const byZ = (a, b2) => (a.z - b2.z) || ((a.x || 0) - (b2.x || 0));
  const physical = c.items.slice().sort(byZ);
  const lastZ = physical.length ? physical[physical.length - 1].z : RUNWAY;
  const length = Math.round(lastZ + TAIL);

  // The multiplier guarantee, enforced now that the level's real length exists.
  // `row()` places it from a row count and an estimated length, which is close
  // but not exact; here the metres are known, so a level whose multiplier drifted
  // into the front half trades it with a glass troop gate further down the road.
  // A level with no spare lane in its back half at all — an all-ladder finish —
  // gets one made for it the same way.
  {
    const rows = new Map();
    for (const g of c.items) if (g.kind === 'gate') {
      const k = g.z.toFixed(3);
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(g);
    }
    const zs = [...rows.keys()].map(Number).sort((a, b2) => a - b2);
    const back = length * 0.45, front = length * 0.85;
    const mults = c.items.filter((g) => g.kind === 'gate' && g.effect?.type === 'mult');
    if (!mults.some((m) => m.z >= back)) {
      for (let i = zs.length - 1; i >= 0; i--) {
        if (zs[i] < back || zs[i] > front) continue;
        const victim = rows.get(zs[i].toFixed(3)).find((g) => g.panel === 'glass' && g.effect?.type === 'troops');
        if (!victim) continue;
        victim.effect = { type: 'mult', value: d > 0.45 && r.chance(0.35) ? 3 : 2 };
        victim.panel = 'wood'; victim.grow = false;
        // Exactly one per level: whatever was in the front half goes back to
        // being a plain gate so the two do not stack.
        for (const m of mults) {
          m.effect = { type: 'troops', value: nice(Math.max(2, m.z / length * endTarget * 0.12)) };
          m.panel = 'glass'; m.grow = false;
        }
        break;
      }
    }
  }

  // Story bubbles are PLACED, not broadcast. game.js fires them from the z-loop,
  // so the opening line lands as the squad sets off and the closing one as it
  // walks the last stretch to the finish — a line at a moment rather than a line
  // at the door. They sit outside the length calculation because a bubble is not
  // a wall; the ≥60 m of clear road is measured against physical items only.
  //
  // This is the one part of a level that is not pure from the seed: a beat you
  // have already read does not come back. `story.js` retires them on run:start.
  if (mode === 'story') {
    const lines = beatsFor(chapter, level);
    const say = (b, z) => {
      if (b && !storySeen(b.id)) c.items.push({ kind: 'bubble', z, who: b.who, text: b.text, ms: b.ms });
    };
    say(lines?.in, Math.max(14, RUNWAY - 30));
    say(lines?.out, lastZ + 26);
  }
  const items = c.items.slice().sort(byZ);

  const def = {
    id: mode === 'story' ? `c${chapter}l${level}` : `${mode}:${spec?.id || seed}`,
    chapter, level, seed,
    name: spec?.name || levelName(chapter, level),
    theme,
    length,
    startTroops: spec?.startTroops ?? 1,
    startTier: spec?.startTier ?? startTier,
    reqPower: spec?.reqPower ?? reqPowerFor(chapter, level),
    reward: spec?.reward ?? rewardFor(chapter, level),
    mode,
    tutorial: chapter === 1 ? (TUTORIALS[level] || null) : null,
    items,

    // Extras. Not in the contract, not required by anything — the HUD and the
    // level select read them so a player can see what they are walking into.
    boss: items.find((it) => it.kind === 'boss')?.name || null,
    modifiers: spec?.modifiers || null,
    // What the budget model expects, so dev/ can diff prediction against a run.
    expect: {
      startTroops: Math.round(start0), endTroops: Math.round(sim.troops),
      endTier: sim.tier, seconds: Math.round(length / RUN.speed + (bossIdx ? 9 : 0)),
      beats,
    },
  };

  if (spec?.modifiers) applyModifiers(def, spec.modifiers, r);
  return def;
}

// Props on the entry runway, before the first beat.
function runwayProps(c, len) {
  for (let i = 0; i < 3; i++) {
    c.items.push(prop(12 + i * (len / 3), (i % 2 ? 1 : -1) * c.r.range(6.4, 8.4),
      c.r.pick(c.propKit)));
  }
}

// --------------------------------------------------------------------------
// Missions and events
//
// Modifiers are baked into the ITEMS, never left as a flag for another system
// to honour. `noGrow` really does set grow:false on every panel; `swarm` really
// does double every count. That way an event plays correctly against a gates.js
// that has never heard of events.
// --------------------------------------------------------------------------

export const MODIFIERS = {
  noGrow:     { name: 'FIXED PRICE',  desc: 'No gate can be grown. What it says is what it pays.' },
  swarm:      { name: 'SWARM',        desc: 'Twice the enemy, half the health each.' },
  doubleCash: { name: 'PAYDAY',       desc: 'Every cash gate pays double.' },
  brittle:    { name: 'GLASS ROAD',   desc: 'Barriers are thin. Traps are not.' },
  hardened:   { name: 'DUG IN',       desc: 'Barriers and bosses have 60% more health.' },
};

function applyModifiers(def, mods, r) {
  const on = (k) => Array.isArray(mods) ? mods.includes(k) : !!mods[k];
  for (const it of def.items) {
    if (on('noGrow') && it.kind === 'gate') {
      // FIXED PRICE has to pay what the gate WOULD have grown to, or the level
      // is quietly 24x poorer than it was sized for and the player starves.
      // The sign says +99 and it stays +99 — that is the whole modifier.
      if (it.grow && it.effect) {
        it.effect = { ...it.effect, value: nice(it.effect.value * GATE.growMax * GROW_EFF) };
      }
      it.grow = false;
    }
    if (on('doubleCash') && it.kind === 'gate' && it.effect?.type === 'cash') {
      it.effect = { ...it.effect, value: Math.round(it.effect.value * 2) };
    }
    if (on('swarm') && it.kind === 'enemy') {
      it.count = Math.round(it.count * 2);
      it.hp = Math.max(1, Math.round(it.hp * 0.5));
    }
    if (on('brittle') && it.kind === 'barrier') {
      it.hp = it.value = nice(it.value * 0.55);
    }
    if (on('hardened')) {
      if (it.kind === 'barrier') it.hp = it.value = nice(it.value * 1.6);
      if (it.kind === 'boss') it.hp = Math.round(it.hp * 1.6);
    }
  }
  def.modifiers = Array.isArray(mods) ? mods.slice() : Object.keys(mods).filter((k) => mods[k]);
  return def;
}

// Repeatable. Rank is the difficulty dial the player turns; reward scales with
// it faster than reqPower does, so pushing rank is always the efficient grind.
export const MISSIONS = [
  { id: 'supply',  name: 'SUPPLY RUN',   icon: '📦', theme: 'valley', desc: 'Light resistance. Heavy pockets.',            recipe: ['open3', 'convoy', 'ladder', 'blocker'], cashMul: 2.2, boss: false },
  { id: 'patrol',  name: 'BORDER PATROL',icon: '🎖', theme: 'front',  desc: 'They are dug in. Bring men.',                 recipe: ['open2', 'pressure', 'ladder', 'pressure', 'narrows'], cashMul: 1.0, boss: false },
  { id: 'breach',  name: 'BREACH',       icon: '🧱', theme: 'town',   desc: 'Four walls and nothing to hide behind.',      recipe: ['open2', 'wall', 'blocker', 'wall', 'press'], cashMul: 1.2, boss: false },
  { id: 'salvage', name: 'SALVAGE',      icon: '⚠',  theme: 'desert', desc: 'Half of what is out there is bait.',          recipe: ['open2', 'trapline', 'trapline', 'ladder'], cashMul: 1.6, boss: false },
  { id: 'hold',    name: 'HOLD THE LINE',icon: '💀', theme: 'front',  desc: 'One of theirs is worth forty of yours.',      recipe: ['open3', 'ladder', 'promote', 'boss'], cashMul: 1.4, boss: true },
];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

// Rank 1 sits below the chapter-3 gate on purpose: a player who is stuck must
// always have something they can actually run. Rank 40 lands at 1000, just
// under the powerOf() ceiling of 1055 — an endless mode that asks for more
// power than the game can produce is an endless mode with an end.
export const MISSION_RANK_TOP = 1000;
export const missionReqPower = (rank) =>
  Math.round(120 + (MISSION_RANK_TOP - 120) * Math.pow((clamp(rank, 1, 40) - 1) / 39, 0.85));
// 1.20 a rank, not 1.24. At 1.24 a chapter-2 player out-ranks the debt in seven
// runs and the whole act evaporates; at 1.20 it takes about twenty-five, which
// is the twenty minutes the act is supposed to be. Rank 40 still pays ~1M so
// missions stay worth running next to chapter 4.
export const MISSION_REW_BASE = 340, MISSION_REW_GROWTH = 1.20;
export const missionReward = (id, rank) => {
  const m = MISSION_BY_ID[id] || MISSIONS[0];
  return Math.round(MISSION_REW_BASE * Math.pow(MISSION_REW_GROWTH, rank - 1) * m.cashMul);
};
// What rank the level select should offer first: the hardest one the player
// clears comfortably, not the hardest one they technically qualify for.
export const missionRankFor = (power) => {
  let rank = 1;
  while (rank < 40 && missionReqPower(rank + 1) <= power * 0.85) rank++;
  return rank;
};
export const MISSION_RANK_MAX = 40;

export function missionSpec(id, rank = 1, seed = 0) {
  const m = MISSION_BY_ID[id] || MISSIONS[0];
  rank = clamp(Math.round(rank), 1, MISSION_RANK_MAX);
  return {
    chapter: 5, level: rank, mode: 'mission',
    id: `${m.id}${rank}`, name: m.name, theme: m.theme,
    seed: seed || (600000 + rank * 7919 + m.id.charCodeAt(0) * 131),
    power: missionReqPower(rank),
    reqPower: missionReqPower(rank),
    reward: missionReward(m.id, rank),
    recipe: m.recipe,
    // Rank IS the difficulty dial. Rank 1 sits where chapter 1 ends, rank 25
    // and up is chapter-4 territory.
    d: clamp(0.28 + (rank - 1) * 0.028, 0, 1),
  };
}
export const buildMission = (id, rank = 1, seed = 0) => buildLevel(missionSpec(id, rank, seed));

// Time-limited. Two run at a time on a rolling three-day window, so the pair a
// player sees is a pure function of the clock and needs no server.
export const EVENT_WINDOW_H = 72;
export const EVENTS = [
  { id: 'blackout',  name: 'BLACKOUT',      icon: '🌑', theme: 'town',   mods: ['noGrow', 'doubleCash'], recipe: ['open2', 'ladder', 'trapline', 'wall', 'boss'],       rewardMul: 3.0 },
  { id: 'tide',      name: 'RED TIDE',      icon: '🌊', theme: 'front',  mods: ['swarm'],                recipe: ['open2', 'pressure', 'convoy', 'ladder', 'boss'],      rewardMul: 3.4 },
  { id: 'minefield', name: 'MINEFIELD',     icon: '💣', theme: 'desert', mods: ['brittle'],              recipe: ['open2', 'trapline', 'narrows', 'trapline', 'press'],  rewardMul: 2.6 },
  { id: 'bunkers',   name: 'THE BUNKERS',   icon: '🏚', theme: 'front',  mods: ['hardened'],             recipe: ['open3', 'wall', 'wall', 'promote', 'boss'],           rewardMul: 3.8 },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// Which window we are in. Deterministic from the clock; no state to sync.
export function eventWindow(now = Date.now()) {
  const w = Math.floor(now / (EVENT_WINDOW_H * 3.6e6));
  return { index: w, endsAt: (w + 1) * EVENT_WINDOW_H * 3.6e6 };
}
export function activeEvents(now = Date.now(), power = 0) {
  const { index, endsAt } = eventWindow(now);
  const a = EVENTS[index % EVENTS.length];
  const b = EVENTS[(index + 1 + (index % (EVENTS.length - 1))) % EVENTS.length];
  const pair = b.id === a.id ? [a, EVENTS[(index + 2) % EVENTS.length]] : [a, b];
  return pair.map((e) => ({
    ...e, endsAt, seed: index * 104729 + e.id.length * 7919,
    reqPower: eventReqPower(e.id, index, power),
    reward: eventReward(e.id, index, power),
  }));
}
// Events are "higher stakes": they ask ~15% more power than the missions a
// player of this strength would be running, and pay ~3x for it.
export const eventReqPower = (id, index, power) =>
  Math.round(Math.max(150, missionReqPower(missionRankFor(power)) * 1.15));
export const eventReward = (id, index, power) => {
  const e = EVENT_BY_ID[id] || EVENTS[0];
  return Math.round(missionReward('supply', missionRankFor(power)) * e.rewardMul);
};

export function eventSpec(id, seed = 0, power = 0) {
  const e = EVENT_BY_ID[id] || EVENTS[0];
  const { index } = eventWindow();
  const req = eventReqPower(e.id, index, power);
  return {
    chapter: 5, level: Math.max(1, missionRankFor(power) + 2), mode: 'event',
    id: e.id, name: e.name, theme: e.theme,
    seed: seed || (index * 104729 + e.id.length * 7919),
    power: req, reqPower: req,
    reward: eventReward(e.id, index, power),
    recipe: e.recipe, modifiers: e.mods,
    d: clamp(0.34 + missionRankFor(power) * 0.028, 0, 1),
  };
}
export const buildEvent = (id, seed = 0, power = 0) => buildLevel(eventSpec(id, seed, power));

// --------------------------------------------------------------------------
// verifyLevel — the LevelDef contract, as code.
//
// Every rule from CLAUDE.md that a generator can break. dev/ runs this over a
// spread of levels; it is cheap enough to run in ?dev too.
// --------------------------------------------------------------------------
export function verifyLevel(def) {
  const bad = [];
  const it = def.items || [];
  for (let i = 1; i < it.length; i++) {
    if (it[i].z < it[i - 1].z) { bad.push(`items not sorted by z at ${i} (${it[i - 1].z} > ${it[i].z})`); break; }
  }
  const rows = new Map();
  for (const g of it) {
    if (g.kind !== 'gate') continue;
    if (!LANES.some((x) => Math.abs(x - g.x) < 1e-6)) bad.push(`gate off the lane grid at z=${g.z} x=${g.x}`);
    const k = g.z.toFixed(3);
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push(g);
  }
  // Rows must be far enough apart to READ. A panel is 3 m tall and the camera
  // looks down the road from CAM.back behind it, so rows closer than MIN_ROW_GAP
  // physically overlap on screen into one pile of signs.
  const rowZ = [...rows.keys()].map(Number).sort((a, b) => a - b);
  for (let i = 1; i < rowZ.length; i++) {
    const gap = rowZ[i] - rowZ[i - 1];
    if (gap < MIN_ROW_GAP - 0.01) bad.push(`gate rows ${gap.toFixed(1)} m apart at z=${rowZ[i].toFixed(0)} — they overlap on screen`);
  }

  // NO FREE LANE. Three lanes, and each one must cost or offer something at
  // that z: a gate, or a threat wide enough to cover it. A row you can drive
  // around is not a choice, it is scenery.
  const covers = (o, x) => {
    if (o.kind === 'enemy' || o.kind === 'barrier') return Math.abs((o.x || 0) - x) < (o.w || 0) / 2 + 1.6;
    if (o.kind === 'boss') return true;
    if (o.kind === 'narrow') return Math.abs(x) + GATE.width / 2 > o.halfW;   // off-road = not free
    return false;
  };
  let freeLanes = 0;
  for (const [k, row] of rows) {
    const z = parseFloat(k);
    const near = it.filter((o) => (o.kind === 'enemy' || o.kind === 'barrier' || o.kind === 'boss') && Math.abs(o.z - z) < 12)
      .concat(it.filter((o) => o.kind === 'narrow' && z >= o.z - 6 && z <= o.z + o.len + 6));
    for (const lx of LANES) {
      if (row.some((g) => Math.abs(g.x - lx) < 1e-6)) continue;
      if (near.some((o) => covers(o, lx))) continue;
      freeLanes++;
    }
  }
  if (freeLanes) bad.push(`${freeLanes} rows have a free lane (no gate, nothing blocking it)`);

  let singles = 0;
  for (const [k, row] of rows) {
    if (row.length < 2) { singles++; continue; }
    if (row.length > 3) bad.push(`gate row of ${row.length} at z=${k}`);
    // The tell: a trap must never share a sign colour with a good gate beside it.
    const hasBad = row.some((g) => EFFECTS[g.effect?.type]?.good === false);
    if (hasBad) {
      const badSigns = new Set(row.filter((g) => EFFECTS[g.effect?.type]?.good === false).map((g) => EFFECTS[g.effect.type].sign));
      const goodSigns = new Set(row.filter((g) => EFFECTS[g.effect?.type]?.good !== false).map((g) => EFFECTS[g.effect.type].sign));
      for (const s of badSigns) if (goodSigns.has(s)) bad.push(`unsignalled trap at z=${k} (both sides ${s})`);
    }
    if (new Set(row.map((g) => g.x)).size !== row.length) bad.push(`two gates on one lane at z=${k}`);
  }
  if (singles > 1) bad.push(`${singles} lone gates (rows of 1 should be rare)`);

  // Bubbles are dialogue, not geometry — the "60 m of clear road" rule is about
  // not ending the run on a wall, and a line of speech is not a wall.
  const solid = it.filter((x) => x.kind !== 'bubble');
  const lastZ = solid.length ? solid[solid.length - 1].z : 0;
  if (def.length - lastZ < 60) bad.push(`tail is ${(def.length - lastZ).toFixed(0)} m, needs ≥60`);

  // Gates must never hang over the water inside a narrow section.
  for (const nrw of it.filter((x) => x.kind === 'narrow')) {
    for (const g of it) {
      if (g.kind !== 'gate') continue;
      if (g.z >= nrw.z && g.z <= nrw.z + nrw.len && Math.abs(g.x) + GATE.width / 2 > nrw.halfW) {
        bad.push(`gate at z=${g.z} x=${g.x} is outside the narrow (halfW ${nrw.halfW})`);
      }
    }
  }

  // The core tension. At least one gate row whose fire window overlaps a threat.
  if (def.tutorial !== 'gates' && def.tutorial !== 'grow') {
    const threats = it.filter((x) => x.kind === 'enemy' || x.kind === 'barrier' || x.kind === 'boss');
    const tense = [...rows.keys()].some((k) => {
      const z = parseFloat(k);
      return threats.some((t) => t.z > z - GUN.range && t.z < z + 20);
    });
    if (!tense) bad.push('no gate row shares a fire window with a threat — this is a corridor');
  }

  // Every level carries at least one multiplier. Without one the level is pure
  // addition and the STARTING SQUAD upgrade buys nothing you can feel.
  // A `fork` beat can also offer one, early, and that is a bonus rather than a
  // problem — what matters is that at least one sits in the back half, where
  // there is a run's worth of growth behind it to multiply.
  const mults = it.filter((g) => g.kind === 'gate' && g.effect?.type === 'mult');
  if (!mults.length) bad.push('no multiplier gate — a level of pure addition');
  else if (!mults.some((m) => m.z >= def.length * 0.45)) {
    bad.push(`multipliers all in the front ${(mults[mults.length - 1].z / def.length * 100).toFixed(0)}% — nothing to grow for`);
  }

  if (def.reqPower > 1055) bad.push(`reqPower ${def.reqPower} exceeds the powerOf() ceiling of 1055`);
  return bad;
}
