/**
 * One brain, nine states, three dials (DESIGN §5.2), plus the twelve behaviour
 * profiles of §5.3 and the four STORY §3.3 asks that §5.3 does not cover.
 *
 * The thing to understand before changing anything: the AI does not aim. It
 * flies. It sets a pilot INTENT (P4's `js/sim/pilot.js`) and the auto-fire cone
 * in `weapons.js` decides when to squeeze — the same cone, the same lead
 * solution and the same real bullets the player gets. An AI with better `k` puts
 * its NOSE in a better place and holds fire in a tighter cone; it never gets a
 * bullet that curves.
 *
 * The one subtlety worth stating: `k`'s aim error is applied ONCE PER DECISION
 * and held, not resampled every tick. Per-tick noise on an aim point averages to
 * zero over a burst and `k` would then measure nothing — which is exactly the
 * "believable metric" shape this project keeps finding. P5_NOTES §5.
 *
 * Pure: no DOM, no clock, no Math.random.
 */

import { G_SI } from '../data/tables.js';
import { clamp } from '../core/math.js';
import { wrapPi } from './physics.js';
import { offNose, leadPoint, GUNS } from './weapons.js';
import { cornerSpeed } from './aero.js';
import { HULL_M, bugOf } from './damage.js';

const DEG = Math.PI / 180;

export const STATES = Object.freeze(['PATROL', 'CLIMB', 'ENGAGE', 'ATTACK_RUN', 'EXTEND',
                                     'DEFEND', 'CRATE_RUN', 'BUG_OUT', 'WRECK']);

/** DESIGN §5.2's thresholds, in metres of specific energy. */
/** How close a hostile must be before a pilot is fighting rather than looking. */
export const ENGAGE_RANGE = 500;      // m

export const ENERGY = Object.freeze({
  attack: +80, engageLo: -40, defend: -60, crateFloor: -100, reclimb: +150,
});

/** §5.2's morale table. Register T24 — measured by the flee rate, gate C8. */
export const MORALE = Object.freeze({
  wingmanDied: -0.30, wingmanRange: 250,
  damage: -0.90,
  alone: -0.15, alonePeriod: 10, aloneRange: 400,
  playerKill: -0.15, killWindow: 15,
  aceAura: +0.20, auraRange: 600,
  advantage: +0.10,
  regen: +0.05,
  // Register T24. §5.2 guessed 0.20 with -0.35 damage and -0.20 for a wingman;
  // measured against gate C8's 12-22%, that table produced a flee rate of
  // 0.0% and, once the three implementation defects behind it were fixed, 4.2%.
  // These are the values that put it in band. The SHAPE of the table is §5.2's
  // and is unchanged — only the size of the numbers moved, which is exactly
  // what T24 says this measurement is for.
  flee: 0.42,
  bloodedFlee: -0.25, bloodedAggro: 1.15,   // §3.3 "Blooded": they fight harder and run less
});

/** The corner speed the AI flies to. Derived once, in aero.js, from the identity
 *  rather than from a fit — see `cornerSpeed`. Re-exported so nothing downstream
 *  grows a second copy. */
export { cornerSpeed as cornerGuess } from './aero.js';

/**
 * How hard a pilot eases off a max-rate turn he cannot pay for. It is NOT scaled
 * by `k`: scaling it made a better pilot refuse more turn fights than a worse
 * one, and `k` came out anti-monotone (a k 0.25 ace beat the player more often
 * than a k 0.95 ace). Energy discipline is a property of the aeroplane's
 * envelope, not of the man; what `k` buys is aim, reaction and trigger.
 */
export const DISCIPLINE = 0.55;

/** How often any pilot re-chooses a state. Fixed for everyone — see ai.update. */
export const STATE_PERIOD = 0.40;

/**
 * Isolation switch for the harness, the same shape as `setTierForce`. Pins one
 * of `k`'s dials to a fixed value so the others can be varied alone — the only
 * way to find out which dial an anti-monotone `k` is coming from, rather than
 * guessing and tuning. No shipped code sets it.
 */
export const DIAL_LOCK = { react: 0, aimLead: -1, aimAng: -1, fireCone: 0, six: 0 };
export function setDialLock(o) { Object.assign(DIAL_LOCK, o); return DIAL_LOCK; }

const specE = (f) => -f.sy + (f.svx * f.svx + f.svy * f.svy) / (2 * G_SI);

/* ---------------------------------------------------- the ace behaviours -- */
/**
 * DESIGN §5.3's twelve, plus STORY §3.3's four that §5.3 has no profile for.
 * R-11: the NAMES are P11's; these are the behaviours. `counter` names the
 * scripted idea the counter-play check (gate C6) runs against each one.
 *
 * `k` and `morale` are §5.3's, unchanged — they are the ace's CHARACTER and
 * register T23 says the duel matrix refines them, not replaces them. What the
 * matrix actually set is `hp`: one monotone lever, bisected per ace until the
 * intended-tier loadout wins the middle of C4's band (`tools/lab/tune.mjs`).
 * A12 is exempt — it is an exact mirror of the player by definition, and C7
 * is what governs it.
 */
export const ACES = Object.freeze({
  A1:  { id: 'A1',  act: 1, k: 0.60, morale: 0.85, aggro: 0.2, tag: 'boom-and-zoom', hp: 380,
         neverTurnBelow: 45, reclimb: ENERGY.reclimb, counter: 'lowSlow' },
  A2:  { id: 'A2',  act: 2, k: 0.65, morale: 0.90, aggro: 2.0, tag: 'flat sustained turner', hp: 220,
         lockSpeed: [26, 30], neverExtend: true, counter: 'outEnergy' },
  A3:  { id: 'A3',  act: 2, k: 0.72, morale: 0.85, aggro: 1.0, tag: 'energy mirror', hp: 260,
         mirrorE: 0.5, counter: 'stallTurn' },
  A4:  { id: 'A4',  act: 3, k: 0.75, morale: 0.80, aggro: 1.2, tag: 'cloud ambush', hp: 250,
         useCloud: true, counter: 'campCloudTop' },
  A5:  { id: 'A5',  act: 3, k: 0.70, morale: 0.95, aggro: 0.0, tag: 'armoured head-on', hp: 340,
         armour: 0.55, headOnOnly: true, type: 'anvil', counter: 'neverMerge' },
  A6:  { id: 'A6',  act: 3, k: 0.68, morale: 0.75, aggro: 1.5, tag: 'bait pair', hp: 130, wingHp: 105,
         pair: 'bait', counter: 'killBaitFast' },
  A7:  { id: 'A7',  act: 4, k: 0.78, morale: 0.85, aggro: 1.0, tag: 'runs dark', hp: 90,
         dark: true, counter: 'ears' },
  A8:  { id: 'A8',  act: 4, k: 0.80, morale: 0.90, aggro: 1.3, tag: 'storm updrafts', hp: 195,
         useUpdraft: true, counter: 'useUpdraftToo' },
  A9:  { id: 'A9',  act: 4, k: 0.76, morale: 0.80, aggro: 1.1, tag: 'hunts crate carriers', hp: 210,
         huntCarriers: true, counter: 'carryNothing', needsCrates: true },
  A10: { id: 'A10', act: 5, k: 0.90, morale: 0.95, aggro: 1.0, tag: 'no gimmick', hp: 260,
         counter: null, counterIsSkill: true },
  A11: { id: 'A11', act: 5, k: 0.82, morale: 0.90, aggro: 1.2, tag: 'commands a finger-four', hp: 220,
         wingHp: 90, formation: 'finger4', counter: 'killLeader' },
  A12: { id: 'A12', act: 5, k: 0.90, morale: 1.00, aggro: 1.2, tag: 'mirrors your loadout',
         mirrorLoadout: true, counter: null, counterIsBuild: true },
  /* STORY §3.3's four that §5.3 has no profile for. R-11 says the story wins on
     who and when; these are what they DO, which is the half §5.3 owes them. */
  S1:  { id: 'S1',  act: 3, k: 0.84, morale: 0.95, aggro: 0.3, tag: 'hunts silk, not aeroplanes', hp: 290,
         huntsSilk: true, refusesTurnFight: true, cannonRange: 90, counter: 'denySilk', needsCrates: true },
  S2:  { id: 'S2',  act: 4, k: 0.86, morale: 1.00, aggro: 0.0, tag: 'blocks, never shoots first', hp: 900,
         blocker: true, neverShootsFirst: true, counter: 'goPast', unkillable: true },
  S3:  { id: 'S3',  act: 4, k: 0.70, morale: 0.70, aggro: 1.4, tag: 'two-ship, bonded', hp: 150, wingHp: 125,
         pair: 'bait', pairBond: true, counter: 'driveOneOff' },
  S4:  { id: 'S4',  act: 5, k: 0.80, morale: 0.90, aggro: 1.0, tag: 'mirrors your last three flights', hp: 200,
         replayMirror: true, counter: null, counterIsBuild: true },
});
export const ACE_IDS = Object.freeze(Object.keys(ACES));

/* -------------------------------------------------------------- the brain -- */

export function createAI(ent, opts = {}) {
  const prof = opts.profile || null;
  const rng = ent.rngAI;
  const ai = {
    profile: prof,
    k: opts.k ?? (prof ? prof.k : 0.6),
    aggro: opts.aggro ?? (prof ? prof.aggro : 1),
    state: 'PATROL', stateT: 0,
    reactT: 0, react: 0.65, stateClock: 0,
    aimLead: 0, aimAng: 0,
    sixT: 0, sixAware: true,
    extendT: 0, extendDir: 1, escapeY: 0,
    breakT: 0, breakDir: 1, breakCool: 0, extendGoal: 300, hammerT: 0,
    aloneT: 0, killT: 99, lastStruct: ent.hp.structure,
    promoteT: 0, leaderDead: false,
    mirrorE: 0, mirrorT: 0,
    counter: opts.counter || null, counterT: 0, counterPhase: 0,
    baitRole: prof && prof.pair ? (opts.pairRole || 'bait') : null,
    seen: null, seenT: 99, seenX: 0, seenY: 0,
    stats: { states: Object.create(null), decisions: 0 },
  };
  ent.k = ai.k;
  ent.aggro = ai.aggro;
  ai.react = DIAL_LOCK.react || (0.65 - 0.45 * ai.k);
  ai.sixPeriod = DIAL_LOCK.six || (4.5 - 3.2 * ai.k);
  // §2.6: stricter auto-fire is an AMMO and ACCURACY trade, not a DPS win, and a
  // steep k-scaling here made every good pilot fire so rarely that k measured
  // backwards in the mirror duel. Modest, and it is not where skill lives.
  ai.fireCone = DIAL_LOCK.fireCone || GUNS.coneHalf * (1 - 0.25 * ai.k);
  if (ent.gun) ent.gun.fireCone = ai.fireCone;

  const LEAD = { x: 0, y: 0, t: 0, range: 0 };
  const AIM = { x: 0, y: 0, range: 0 };
  const AIMSOFT = { x: 0, y: 0 };
  const AIMPT = { xM: 0, yM: 0 };      // reused: `point` intents must not allocate

  /* ---------------------------------------------------------- perception -- */

  function inCloud(world, f) {
    const a = world.arena;
    return f.sy >= a.cloudLo && f.sy <= a.cloudHi;
  }

  /**
   * Whether `e` can see `o` at all. Cloud hides an aircraft inside it; §5.3 A7's
   * dark machine is invisible past 200 m unless he has just fired. Detection is
   * a world-unit quantity and does not vary with zoom.
   */
  function visible(world, e, o) {
    const d = Math.hypot(o.flight.sx - e.flight.sx, o.flight.sy - e.flight.sy);
    if (inCloud(world, o.flight) && !inCloud(world, e.flight) && d > 150) return false;
    if (o.ai && o.ai.profile && o.ai.profile.dark && d > 200 && o.lastFireT > 1.5) return false;
    return true;
  }

  function pickTarget(world, e) {
    let best = null, bd = 1e9;
    for (let i = 0; i < world.live.length; i++) {
      const o = world.live[i];
      if (o === e || !o.alive || o.dead || o.side === e.side) continue;
      if (prof && prof.huntCarriers && !o.carrying && !e.forcedTarget) continue;
      if (!visible(world, e, o)) continue;
      const d = Math.hypot(o.flight.sx - e.flight.sx, o.flight.sy - e.flight.sy);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { ai.seen = best; ai.seenT = 0; ai.seenX = best.flight.sx; ai.seenY = best.flight.sy; }
    return best;
  }

  /* ------------------------------------------------------------- morale --- */

  function updateMorale(world, e, dt, engaged) {
    if (bugOf(world.ctx) === 'no-morale') { ai.lastStruct = e.hp.structure; return; }
    const took = ai.lastStruct - e.hp.structure;
    ai.lastStruct = e.hp.structure;
    if (took > 0) e.morale += MORALE.damage * (took / e.hpMax.structure);

    let friends = 0, foes = 0, aura = 0, near = false;
    for (let i = 0; i < world.live.length; i++) {
      const o = world.live[i];
      if (o === e || !o.alive || o.dead) continue;
      const d = Math.hypot(o.flight.sx - e.flight.sx, o.flight.sy - e.flight.sy);
      if (o.side === e.side) {
        friends++;
        if (d < MORALE.aloneRange) near = true;
        if (o.ai && o.ai.profile && d < MORALE.auraRange) aura = MORALE.aceAura;
      } else foes++;
    }
    if (!near) { ai.aloneT += dt; if (ai.aloneT >= MORALE.alonePeriod) { ai.aloneT = 0; e.morale += MORALE.alone; } }
    else ai.aloneT = 0;
    // §5.2: "regenerating TOWARD the unit's base". Toward, and no further — an
    // uncapped +0.05/s adds six whole points of nerve over a two-minute patrol
    // and buries every negative term in the table.
    if (!engaged && e.morale < e.moraleBase) {
      e.morale = Math.min(e.moraleBase, e.morale + MORALE.regen * dt);
    }
    e.morale = Math.min(1.4, Math.max(0, e.morale));
    /**
     * The last two rows of §5.2's table are STATES, not rates: "+0.20 aura,
     * WHILE a named ace is alive within 600 m" and "+0.10 per friendly numerical
     * advantage STEP". Integrated as per-second terms they add a quarter of a
     * point of nerve every second a squadron is winning, which drowns every
     * negative row in the table — the flee rate measured exactly 0.0% and a
     * per-tick morale trace showed a perfectly healthy number that had simply
     * never moved. They are offsets on the nerve, and the flee test reads the
     * sum.
     */
    e.moraleEff = Math.min(1.4, e.morale + aura + MORALE.advantage * Math.max(0, friends - foes));
    ai.killT += dt;
  }

  /** §5.2: a wingman dying within 250 m, and the streak the player is on. */
  ai.onFriendlyLost = (dist) => { if (dist < MORALE.wingmanRange) ent.morale += MORALE.wingmanDied; };
  ai.onPlayerKill = () => { ent.morale += MORALE.playerKill; ai.killT = 0; };

  /* ---------------------------------------------------------- the states -- */

  function chooseState(world, e, tgt) {
    if (e.dead) return 'WRECK';
    if (ai.promoteT > 0) return ai.state === 'WRECK' ? 'WRECK' : 'PATROL';
    const flee = MORALE.flee + (world.blooded ? MORALE.bloodedFlee : 0);
    const nerve = e.moraleEff ?? e.morale;
    // Running away is a decision, not a mood. Without hysteresis a bug-out
    // lasted a few seconds, the 0.05/s regen lifted him back over the line while
    // he was disengaged and running, and he turned round and came back — 591
    // bug-out decisions produced 7 aeroplanes that actually left.
    if (ai.state === 'BUG_OUT' && nerve < flee + 0.30) return 'BUG_OUT';
    if (nerve < flee) return 'BUG_OUT';
    if (!tgt) return specE(e.flight) < 250 ? 'CLIMB' : 'PATROL';
    const dTgt = Math.hypot(tgt.flight.sx - e.flight.sx, tgt.flight.sy - e.flight.sy);
    // Nobody is "engaged" with something 1.4 km away. Without this a formation
    // leader was in ENGAGE from the first tick of the level and his wingmen
    // never held station at all — §5.2's element split had no window to exist in
    // and the fixture that tests it could never have gone green.
    if (dTgt > ENGAGE_RANGE) return specE(e.flight) < 250 ? 'CLIMB' : 'PATROL';

    const eRel = specE(e.flight) - specE(tgt.flight);
    const d = Math.hypot(tgt.flight.sx - e.flight.sx, tgt.flight.sy - e.flight.sy);

    if (prof) {
      if (prof.blocker) return 'ENGAGE';
      if (prof.headOnOnly) {
        const closing = closure(e, tgt) > 0;
        const ahead = Math.abs(offNose(e.flight, tgt.flight.sx, tgt.flight.sy)) < 60 * DEG;
        return (closing && ahead) || d > 200 ? 'ENGAGE' : 'EXTEND';
      }
      if (prof.neverTurnBelow) {
        // §5.3 A1's whole idea, and the reason his counter is a place rather
        // than a manoeuvre: he will not turn slow, and he will not follow you
        // down. A slow, low opponent gets attack runs made at him and nothing
        // else — and an attack run breaks off at 90 m, so it hands you a belly.
        if (e.flight.speedSI < prof.neverTurnBelow && ai.state === 'ENGAGE') return 'EXTEND';
        const slowLow = tgt.flight.speedSI < prof.neverTurnBelow && -tgt.flight.sy < 300;
        if (slowLow && ai.state === 'ENGAGE') return 'EXTEND';
        if (slowLow && eRel < prof.reclimb) return 'CLIMB';
      }
      if (prof.reclimb && eRel < prof.reclimb && ai.state === 'EXTEND') return 'CLIMB';
      if (prof.neverExtend) return 'ENGAGE';
      // He matches your energy, so he is always level with you — which means he
      // is always in the fight, and that is what makes a hammerhead work on him:
      // he is committed to a turning solution when you go vertical.
      if (prof.mirrorE) return d < 220 ? 'ENGAGE' : (eRel > ENERGY.attack ? 'ATTACK_RUN' : 'CLIMB');
      if (prof.pair && ai.baitRole === 'bait') return 'PATROL';
      if (prof.useCloud && ai.state !== 'ATTACK_RUN' && !inCloud(world, e.flight) && eRel < ENERGY.attack) return 'CLIMB';
    }

    // counter preferences: energy discipline the player would be told about in a
    // briefing, not skill the bot was handed
    if (PREF.needERel && eRel < PREF.needERel && d > 170) return 'CLIMB';
    if (eRel > ENERGY.attack) return 'ATTACK_RUN';
    if (eRel < ENERGY.defend) {
      const astern = Math.abs(offNose(tgt.flight, e.flight.sx, e.flight.sy)) < 40 * DEG && d < 150;
      if (astern && ai.sixAware) return 'DEFEND';
      // §5.2 says "run 250-400 m", not "run". An EXTEND that never ends is two
      // aeroplanes leaving the level in opposite directions, which is what the
      // first version of this did for 60 s at a stretch.
      return d < ai.extendGoal ? 'EXTEND' : 'CLIMB';
    }
    // -40 .. +80 — the profile dial decides what kind of pilot this is
    if (ai.aggro >= 1) return 'ENGAGE';
    if (ai.state === 'EXTEND') return d < ai.extendGoal ? 'EXTEND' : 'CLIMB';
    if (ai.state === 'CLIMB') return 'CLIMB';
    return 'EXTEND';
  }

  /**
   * The merge. Two aircraft in pure pursuit on a head-on pass fly into each
   * other; a pilot breaks. Which way is an ENERGY decision and not a coin toss:
   * fast, you break UP and spend the excess on angle; slow, you break DOWN and
   * buy speed back. That one line is most of what makes a fight look like a
   * fight rather than a jousting match, and it is the reason the scissors
   * appears without anybody writing a `scissors()`.
   */
  function mergeBreak(e, tgt, dt, corner) {
    const f = e.flight, p = e.pilot;
    if (ai.breakCool > 0) ai.breakCool -= dt;
    if (ai.breakT > 0) {
      ai.breakT -= dt;
      p.setIntent(ai.breakDir > 0 ? 'turnUp' : 'turnDown');
      return true;
    }
    const d = Math.hypot(tgt.flight.sx - f.sx, tgt.flight.sy - f.sy);
    if (PREF.noMerge && ai.breakCool > 0) return false;
    if (d > (PREF.noMerge || 90) || closure(e, tgt) < 25) return false;
    if (Math.abs(offNose(f, tgt.flight.sx, tgt.flight.sy)) > 30 * DEG) return false;
    ai.breakT = 1.0 + (rng ? rng.next() * 0.5 : 0.25);
    // Refusing a merge is one decision per pass, not a permanent policy: break
    // once, then convert it into a stern chase. Re-triggering every tick kept
    // the bot at arm's length and never let it shoot.
    if (PREF.noMerge) ai.breakCool = 5.0;
    ai.breakDir = PREF.noMerge ? (f.sy > tgt.flight.sy ? 1 : -1)
                : f.speedSI > corner * 1.15 ? 1 : -1;
    p.setIntent(ai.breakDir > 0 ? 'turnUp' : 'turnDown');
    return true;
  }

  /**
   * The single most important thing a good pilot does, and the reason `k` was
   * measuring nothing before it existed.
   *
   * P4's gate F8 says the instantaneous turn is 95 deg/s and the sustained one
   * 74, and F9 says the difference costs 7.2 m/s of energy EVERY SECOND you take
   * it. A pilot who pulls maximum-rate at every opportunity arrives at the bottom
   * of the fight at 20 m/s with nothing left — which is exactly what P4_NOTES §8
   * predicts and exactly what the `ace` pilot tier (envelope 1.00) did: at k 0.90
   * the mirror ace won 12% of duels, WORSE than at k 0.30.
   *
   * So a skilled pilot eases the pull when he is below corner speed and there is
   * no shot to take, and takes the max-rate turn only when it buys a solution.
   * The discipline scales with k. That makes k monotone, and it makes the tactic
   * the player learns and the tactic the AI flies the same tactic.
   */
  function disciplinedAim(e, aimX, aimY) {
    const f = e.flight;
    const vc = cornerSpeed(e.af, f.altM);
    const v = f.speedSI;
    // A solution in reach is worth spending energy on — but only while there is
    // energy to spend. Below the floor the aeroplane is mushing toward a stall
    // and a shot it cannot hold is not a shot.
    const d = Math.hypot(aimX - f.sx, aimY - f.sy);
    if (d < GUNS.rangeEff * 1.25 && v > vc * 0.88) return null;
    /**
     * No shot: fly LAG pursuit, not lead. This is the single most important line
     * in the AI and it was the last defect in the phase.
     *
     * Pointing continuously at the exact lead solution is the tightest turn the
     * aeroplane can draw, and P4's F9 prices it at 7.2 m/s of energy per second
     * at corner and 15.6 at the top of the band. A pilot who does it for a whole
     * fight arrives at the bottom with nothing. The discipline used to apply
     * only below corner speed, which meant a pilot with a SMALL aim error flew
     * perfect lead pursuit above corner and exhausted itself — so `k` measured
     * anti-monotone by 19 points, and locking the aim error was what proved it
     * (tools/lab/dials.mjs: the inversion vanishes, -18.9 -> +2.3).
     *
     * Easing is heavier the deeper below corner the aeroplane already is.
     */
    const deficit = v < vc ? Math.min(1, (vc - v) / (vc * 0.40)) : 0;
    const ease = DISCIPLINE * (0.60 + 0.40 * deficit);
    const bearing = Math.atan2(aimY - f.sy, aimX - f.sx);
    const blended = f.gamma + wrapPi(bearing - f.gamma) * (1 - ease);
    const r = Math.max(60, d);
    AIMSOFT.x = f.sx + Math.cos(blended) * r;
    AIMSOFT.y = f.sy + Math.sin(blended) * r;
    return AIMSOFT;
  }

  function closure(e, o) {
    const dx = o.flight.sx - e.flight.sx, dy = o.flight.sy - e.flight.sy;
    const d = Math.max(1e-6, Math.hypot(dx, dy));
    return ((e.flight.svx - o.flight.svx) * dx + (e.flight.svy - o.flight.svy) * dy) / d;
  }

  /**
   * Where to point. §5.2 gives `k` two errors and they are NOT the same kind of
   * thing, which is why they now go to two different places:
   *
   * Both of them describe what the pilot BELIEVES the solution to be, so both
   * of them move the moment he squeezes and neither moves where he flies. The
   * AI always steers at the true solution, as well as its pilot tier allows.
   *
   * That is not tidiness, it is the fix for a 19-point anti-monotone `k`, and it
   * took two attempts to find. Applied to the FLIGHT PATH, an aim error makes a
   * bad pilot fly a wider, sloppier pursuit curve — and in a model where P4's F9
   * prices a max-rate turn at 7.2 m/s of energy per second, a wide sloppy curve
   * is free energy. Perfect aim meant perfect lead pursuit meant exhaustion, so
   * the best pilots lost. Moving the big (lead) error alone was not enough:
   * three or four degrees of angular error is worth 14 points on its own.
   * Locking each dial in turn is what proved it — tools/lab/dials.mjs, where
   * the inversion vanishes the moment the aim error is held constant.
   *
   * With both on the trigger, `k` is monotone by construction: better judgement
   * about when to fire cannot make a pilot worse.
   */
  function aimAt(e, tgt) {
    leadPoint(e.flight, tgt, LEAD);
    AIM.x = LEAD.x; AIM.y = LEAD.y; AIM.range = LEAD.range;
    e.aimErrLead = ai.aimLead;          // read by the trigger, never by the flying
    e.aimErrAng = ai.aimAng;
    return AIM;
  }

  /**
   * §5.2's two `k` errors: the lead solution is wrong by N(0, (1-k)*0.9) aircraft
   * lengths and the aim is wrong by N(0, 6-5k) degrees.
   *
   * They are stored as magnitudes and applied ABOUT THE LINE OF SIGHT, not as a
   * world (x, y) offset. A world offset is heading-dependent — `+lead` on x is a
   * lead for an aeroplane flying right and a lag for one flying left — and that
   * is a systematic advantage to one half of the roster that no summary statistic
   * would ever show.
   */
  function rollAimError() {
    if (!rng) { ai.aimLead = 0; ai.aimAng = 0; return; }
    const sdLead = DIAL_LOCK.aimLead >= 0 ? DIAL_LOCK.aimLead : (1 - ai.k) * 0.9;
    const sdAng = DIAL_LOCK.aimAng >= 0 ? DIAL_LOCK.aimAng : (6 - 5 * ai.k);
    ai.aimLead = rng.gauss(0, sdLead) * HULL_M;
    ai.aimAng = rng.gauss(0, sdAng * DEG);
  }

  /* --------------------------------------------------- the steering layer -- */
  /**
   * Everything the AI does goes through P4's `point` intent, and NOTHING goes
   * through `level`, `hold`, `climb`, `speed`, `turnUp` or `turnDown`.
   *
   * That is not stylistic. Those intents return an ABSOLUTE flight-path angle:
   * `level` is gamma 0, which for an aeroplane flying LEFT (gamma = pi) is a
   * command to reverse, and `turnUp` returns -pi, whose error against gamma = pi
   * wraps to exactly zero — so a hard break is a no-op for half the aeroplanes in
   * the game. Measured before it was found: in a perfectly symmetric mirror fight
   * the aircraft that started flying +x won 79 of 80. `point` is frame-free, so
   * everything below builds its own target point in the aircraft's own frame.
   * REQUEST-2 asks P4 to make the intents relative; until then, this is the fix.
   */
  const dirX = (f) => (Math.cos(f.gamma) >= 0 ? 1 : -1);

  /**
   * The steering layer. Every one of these is now a straight P4 intent: the two
   * defects that forced P5 to route everything through `point` with a mirrored
   * bearing — the roll sign in the load-factor conversion, and the intents that
   * returned absolute flight-path angles — are fixed at root in `pilot.js`, and
   * the workaround is gone rather than sitting alongside the fix.
   */
  function goTo(e, xM, yM) { AIMPT.xM = xM; AIMPT.yM = yM; e.pilot.setIntent('point', AIMPT); }
  function holdAlt(e, altM) { e.pilot.setIntent('hold', altM); }
  function climbAway(e) { e.pilot.setIntent('climb'); }
  function diveAway(e) { e.pilot.setIntent('dive', 0.4); }
  function speedTo(e, v) { e.pilot.setIntent('speed', v); }
  /** The break: full deflection in the vertical, toward the canopy or away from it. */
  function hardTurn(e, up) { e.pilot.setIntent(up ? 'turnUp' : 'turnDown'); }

  /**
   * The floor. A defensive spiral "toward the ground" (§5.2) and a bug-out "dive
   * for their own line at max speed" are both, taken literally, instructions to
   * fly into the dirt — and taken literally is exactly what the first version
   * did: `ground` was the MODAL cause of loss across the whole duel matrix, in
   * every cell. A pilot pulls out. P4 measured the dive recovery at 88 m from
   * Vne and it scales with speed, so the floor does too.
   */
  const FLOOR_M = 120;
  function floorOf(e) { return FLOOR_M + e.flight.speedSI; }
  function groundGuard(e, dt) {
    const f = e.flight;
    const alt = -f.sy, floor = floorOf(e);
    if (alt > floor) return false;
    if (alt > floor * 0.6 && f.svy <= 0) return false;      // already climbing away
    holdAlt(e, floor + 120);
    ai.floorT = (ai.floorT || 0) + dt;
    return true;
  }

  function drive(world, e, tgt, dt) {
    const p = e.pilot, f = e.flight, af = e.af;
    const corner = cornerSpeed(af);
    e.wantsFire = true;
    if (groundGuard(e, dt)) return;

    switch (ai.state) {
      case 'WRECK': e.wantsFire = false; return;

      case 'PATROL': {
        if (PREF.ears && ai.seen && ai.seenT < 6) { goTo(e, ai.seenX, ai.seenY); return; }
        if (PREF.holdAltM) { holdAlt(e, -world.arena.cloudLo + 30); return; }
        if (PREF.ceilM) { holdAlt(e, PREF.ceilM - 40); return; }
        if (prof && prof.pair && ai.baitRole === 'bait') {
          // §5.3 A6 / STORY D5: the bait flies predictably and INVITES the shot.
          holdAlt(e, 380);
          e.wantsFire = tgt ? Math.hypot(tgt.flight.sx - f.sx, tgt.flight.sy - f.sy) < 90 : false;
          return;
        }
        holdAlt(e, 450);
        return;
      }

      case 'CLIMB': {
        if (PREF.holdAltM) { holdAlt(e, -world.arena.cloudLo + 30); return; }
        if (PREF.updraft && world.arena.updrafts && world.arena.updrafts.length) {
          const b = world.arena.updrafts[0];
          if (f.sx < b.x0 || f.sx > b.x1) { goTo(e, (b.x0 + b.x1) / 2, f.sy); return; }
          climbAway(e); return;
        }
        if (PREF.ceilM && -f.sy > PREF.ceilM) { holdAlt(e, PREF.ceilM); return; }
        if (prof && prof.mirrorE && tgt) {
          ai.mirrorT -= dt;
          if (ai.mirrorT <= 0) { ai.mirrorT = prof.mirrorE; ai.mirrorE = specE(tgt.flight); }
          const mine = specE(f);
          if (mine < ai.mirrorE - 10) climbAway(e);
          else if (mine > ai.mirrorE + 10) diveAway(e);
          else holdAlt(e, -f.sy);
          return;
        }
        if (prof && prof.useCloud) { holdAlt(e, -world.arena.cloudLo - 20); return; }
        if (f.speedSI < corner) speedTo(e, corner); else climbAway(e);
        return;
      }

      case 'EXTEND': {
        ai.extendT += dt;
        if (!tgt) { holdAlt(e, -f.sy); return; }
        ai.extendDir = f.sx - tgt.flight.sx >= 0 ? 1 : -1;
        goTo(e, f.sx + ai.extendDir * 600, f.sy - 40);
        e.wantsFire = false;
        return;
      }

      case 'DEFEND': {
        // The defensive spiral: a hard break that trades height for turn. It goes
        // downhill only while there is height to spend; below that it is a flat
        // break, because a spiral into the ground is not a defence.
        const room = -f.sy > floorOf(e) + 200;
        const above = tgt ? tgt.flight.sy < f.sy : true;
        hardTurn(e, room ? !above : above);
        e.wantsFire = false;
        return;
      }

      case 'BUG_OUT': {
        const dir = f.sx >= 0 ? 1 : -1;
        goTo(e, f.sx + dir * 900, f.sy + 30);
        e.wantsFire = false;
        return;
      }

      case 'ATTACK_RUN': {
        if (!tgt) { ai.state = 'PATROL'; return; }
        if (mergeBreak(e, tgt, dt, corner)) return;
        const a = aimAt(e, tgt);
        // §5.2: dive on, fire between 40 and 90 m, then EXTEND. Do not merge.
        const breakAt = (prof && prof.neverTurnBelow && tgt.flight.speedSI < prof.neverTurnBelow) ? 90 : 40;
        if (a.range < breakAt || (closure(e, tgt) < 0 && a.range > 60)) { ai.state = 'EXTEND'; ai.extendT = 0; return; }
        goTo(e, a.x, a.y);
        return;
      }

      case 'ENGAGE': {
        if (!tgt) { ai.state = 'PATROL'; return; }
        if (prof && prof.blocker) {
          // STORY D4: sit between the player and where he wants to go, mirror him,
          // and do not shoot first. A stalemate is a delivery completed.
          const gx = world.arena.objectiveX ?? (tgt.flight.sx + 500);
          const gy = world.arena.objectiveY ?? tgt.flight.sy;
          goTo(e, (gx + tgt.flight.sx) * 0.5, (gy + tgt.flight.sy) * 0.5);
          e.wantsFire = !prof.neverShootsFirst || e.tookDamage > 0;
          return;
        }
        if (mergeBreak(e, tgt, dt, corner)) return;
        if (prof && prof.lockSpeed) {
          const [lo, hi] = prof.lockSpeed;
          if (f.speedSI > hi + 3) { speedTo(e, (lo + hi) / 2); return; }
        }
        if (prof && prof.refusesTurnFight) {
          // §3.3 D3: extremely hard to bait into a turning fight, because he does
          // not want one. He is here for silk.
          if (Math.abs(offNose(f, tgt.flight.sx, tgt.flight.sy)) > 50 * DEG) { ai.state = 'EXTEND'; ai.extendT = 0; return; }
        }
        if (PREF.reach) {
          // the crate, not the kill. Fight only what gets in the way.
          const gx = world.arena.objectiveX ?? 800, gy = world.arena.objectiveY ?? f.sy;
          if (Math.hypot(gx - f.sx, gy - f.sy) > 90) { goTo(e, gx, gy); return; }
        }
        if (PREF.hammer) {
          // Straight up, and hold it. The point is to arrive at zero airspeed:
          // an energy mirror can match a climb but it cannot match a hammerhead,
          // and P4's limiter release (full deflection 0.35 s under 24 m/s) is
          // what turns the top of that climb into a reversal.
          const astern = Math.abs(offNose(tgt.flight, f.sx, f.sy)) < 50 * DEG
                      && Math.hypot(tgt.flight.sx - f.sx, tgt.flight.sy - f.sy) < 130
                      && f.speedSI > 32;
          if (astern || (ai.hammerT > 0 && f.speedSI > 19)) {
            ai.hammerT = astern ? 3.0 : ai.hammerT - dt;
            hardTurn(e, true);
            return;
          }
          ai.hammerT = 0;
        }
        if (PREF.placebo === 1) { if (Math.sin(world.t * 0.8) > 0) climbAway(e); else diveAway(e); return; }
        if (PREF.placebo === 2) { holdAlt(e, 400 + 60 * Math.sin(world.t * 0.5)); return; }
        const a = aimAt(e, tgt);
        const soft = disciplinedAim(e, a.x, a.y);
        goTo(e, soft ? soft.x : a.x, soft ? soft.y : a.y);
        // Get slow the way a pilot gets slow: by climbing, not by braking. The
        // first version used the airbrake and gave the boom-and-zoom ace a
        // stationary target 240 m off the deck; it measured -71 points.
        if (PREF.slow && f.speedSI > PREF.slow && a.range > 100) { climbAway(e); return; }
        // DESIGN §2.3: the horizontal axis is a brake. Fast and badly pointed is
        // the one time an aeroplane wants less speed, and the AI gets the same
        // control the player has — not a private one.
        const facing = Math.cos(f.theta) >= 0 ? 1 : -1;
        p.setAxisX(f.speedSI > corner * 1.45 && Math.abs(offNose(f, a.x, a.y)) > 25 * DEG ? -facing : 0);
        return;
      }

      case 'CRATE_RUN': {
        // P6 owns crates. The state, the transition and the utility hook exist;
        // what they run against does not yet. Reported, not faked.
        holdAlt(e, 300);
        return;
      }
    }
  }

  /* ------------------------------------------------- the scripted counters -- */
  /**
   * Gate C6. A counter is a TACTIC, so it is expressed as a script that changes
   * what the bot does — never as a bonus to its skill, its guns or its aircraft.
   * The counter bot and the baseline bot are the same bot with the same `k`, the
   * same airframe and the same guns; the only difference is this function.
   *
   * The important lesson is in HOW they are expressed. The first version made
   * each counter an override that pre-empted `drive()` entirely, and nine of the
   * eleven measured NEGATIVE — one at -62 points — because a bot executing a
   * tactic had stopped fighting. A counter is a PREFERENCE the normal brain
   * consults, not a replacement for it. Only two things legitimately override:
   * choosing a different target, and going for a different win condition.
   *
   * `--counterplay --placebo` runs two deliberately irrelevant preferences
   * through the identical machinery. If a porpoise is also "worth 18 points",
   * the harness is measuring bot quality and every number here is worthless.
   */
  const PREF = { ceilM: 0, slow: 0, needERel: 0, holdAltM: 0, noMerge: false,
                 hammer: false, ears: false, updraft: false, reach: false, placebo: 0 };
  ai.pref = PREF;

  function setCounter(c) {
    PREF.ceilM = 0; PREF.slow = 0; PREF.needERel = 0; PREF.holdAltM = 0;
    PREF.noMerge = false; PREF.hammer = false; PREF.ears = false;
    PREF.updraft = false; PREF.reach = false; PREF.placebo = 0;
    switch (c) {
      // A1 will not follow you under 45 m/s. Take the fight to the floor and
      // keep it slow: he can still make passes, but he cannot stay to turn, so
      // every pass hands you his belly on the pull-out.
      case 'lowSlow':        PREF.slow = 44; break;
      // A2 never leaves his circle. Do not get in it: bank height, then use it.
      case 'outEnergy':      PREF.needERel = 175; break;
      // A3 mirrors your energy. He cannot mirror a manoeuvre that goes to zero.
      case 'stallTurn':      PREF.hammer = true; break;
      // A4 must come out of the cloud somewhere. Own the roof.
      case 'campCloudTop':   PREF.holdAltM = -1; PREF.needERel = 20; break;
      // A5 only wants the head-on. Refuse it and take his six.
      case 'neverMerge':     PREF.noMerge = 150; break;
      // A7 is invisible past 200 m. Fly the last known bearing.
      case 'ears':           PREF.ears = true; break;
      // A8's updrafts are authored, visible, and yours too.
      case 'useUpdraftToo':  PREF.updraft = true; PREF.needERel = 60; break;
      // D4 Grelle: you do not win by shooting him. Go around, and go past.
      case 'goPast':         PREF.reach = true; break;
      case 'placeboA':       PREF.placebo = 1; break;
      case 'placeboB':       PREF.placebo = 2; break;
    }
  }
  setCounter(ai.counter);

  /** The two counters that are target selection, and nothing else. */
  function counterTarget(world, e) {
    const c = ai.counter;
    if (c !== 'killBaitFast' && c !== 'driveOneOff' && c !== 'killLeader') return null;
    for (let i = 0; i < world.live.length; i++) {
      const o = world.live[i];
      if (o.side === e.side || !o.alive || o.dead || !o.ai) continue;
      if ((c === 'killLeader' && o.ai.profile && o.ai.profile.formation)
       || (c !== 'killLeader' && o.ai.baitRole === 'bait')) return o;
    }
    return null;
  }
  /* --------------------------------------------------------------- update -- */

  ai.update = (dt, world, e) => {
    if (e.dead) { ai.state = 'WRECK'; e.wantsFire = false; return; }
    ai.stateT += dt; ai.reactT -= dt; ai.sixT += dt; ai.seenT += dt;
    e.lastFireT = (e.lastFireT || 99) + dt;
    if (e.shootingAt) e.lastFireT = 0;
    if (ai.promoteT > 0) { ai.promoteT -= dt; e.wantsFire = false; e.pilot.setIntent('level'); return; }

    if (ai.sixT >= ai.sixPeriod) { ai.sixT = 0; ai.sixAware = true; }
    // The trap this switch exists to prove: resampled every tick, the k-error is
    // white noise the airframe filters out, and `k` measures nothing at all.
    if (bugOf(world.ctx) === 'aim-noise-per-tick') rollAimError();

    const forced = counterTarget(world, e)
      || (e.forcedTarget && e.forcedTarget.alive && !e.forcedTarget.dead ? e.forcedTarget : null);
    const tgt = forced || pickTarget(world, e);
    if (!tgt && PREF.ears && ai.seen && ai.seenT < 6) { ai.seenT = ai.seenT; }
    const engaged = !!tgt && Math.hypot(tgt.flight.sx - e.flight.sx, tgt.flight.sy - e.flight.sy) < ENGAGE_RANGE;
    updateMorale(world, e, dt, engaged);

    // Aim and STATE are on separate clocks. `k` sets the aim clock — a sharper
    // pilot re-solves the lead more often — but state selection runs on a fixed
    // cadence for everybody. Tying the two together made a high-k pilot
    // re-choose its state 4.5 times a second and thrash between ENGAGE, EXTEND
    // and CLIMB, and `k` came out anti-monotone by 29 points.
    if (ai.reactT <= 0) {
      ai.reactT = ai.react;
      if (bugOf(world.ctx) !== 'aim-noise-per-tick') rollAimError();
    }
    ai.stateClock -= dt;
    if (ai.stateClock <= 0) {
      ai.stateClock = STATE_PERIOD;
      ai.stats.decisions++;
      const next = chooseState(world, e, tgt);
      if (next !== ai.state) {
        if (next === 'EXTEND') ai.extendGoal = 250 + (rng ? rng.next() : 0.5) * 150;
        ai.state = next; ai.stateT = 0;
      }
      ai.stats.states[ai.state] = (ai.stats.states[ai.state] || 0) + 1;
      if (ai.state !== 'DEFEND') ai.sixAware = ai.sixAware && true;
    }
    e.state = ai.state;

    drive(world, e, tgt, dt);
  };

  /** §5.2: killing a leader forces a 2.5 s promotion delay on the whole formation. */
  ai.promote = (world) => {
    ai.promoteT = bugOf(world && world.ctx) === 'no-promotion' ? 0 : FORMATION.promoteDelay;
    ai.leaderDead = true;
  };

  return ai;
}

/* ------------------------------------------------------------ formations -- */
/**
 * §5.2. The stations are in metres, relative to the leader, and the 2.5 s
 * promotion delay is a real, discoverable reward for target selection — it is
 * the counter to A11 and the only reason "kill the leader" is a tactic rather
 * than advice.
 */
export const FORMATION = Object.freeze({
  promoteDelay: 2.5,
  lineAstern: [[-35, 0]],
  finger4: [[-40, -18], [+45, -10], [+80, +14]],
});

export function createFormation(leader, wingmen, kind = 'finger4') {
  const stations = FORMATION[kind] || FORMATION.finger4;
  /**
   * One target point PER WINGMAN. `pilot.setIntent('point', obj)` RETAINS the
   * object and reads it back every tick, so a single shared point object means
   * every wingman in the formation flies to whichever station was written last.
   * This is the same defect as aero.js's shared `OUT`, in P5's own code, found
   * by going looking for the pattern after the first one turned up.
   */
  const pts = wingmen.map(() => ({ xM: 0, yM: 0 }));
  const form = { leader, wingmen, kind, stations, promoting: 0 };
  for (let i = 0; i < wingmen.length; i++) {
    wingmen[i].leaderId = leader.id;
    wingmen[i].formSlot = i;
  }
  form.update = (dt, world) => {
    if (form.promoting > 0) { form.promoting -= dt; return; }
    if (!leader.alive || leader.dead) {
      if (!form.collapsed) {
        form.collapsed = true;
        form.promoting = FORMATION.promoteDelay;
        for (let i = 0; i < wingmen.length; i++) if (wingmen[i].ai) wingmen[i].ai.promote(world);
        // §5.2's morale: a wingman down within 250 m is felt
        for (let i = 0; i < wingmen.length; i++) {
          const w = wingmen[i];
          if (w.alive && w.ai) w.ai.onFriendlyLost(Math.hypot(w.flight.sx - leader.flight.sx, w.flight.sy - leader.flight.sy));
        }
      }
      return;
    }
    const lead = leader.ai ? leader.ai.state : 'PATROL';
    const split = lead === 'ENGAGE' || lead === 'ATTACK_RUN';
    for (let i = 0; i < wingmen.length; i++) {
      const w = wingmen[i];
      if (!w.alive || w.dead || !w.ai) continue;
      if (split) { w.ai.holding = false; continue; }
      w.ai.holding = true;
      const st = stations[i % stations.length];
      const pt = pts[i];
      pt.xM = leader.flight.sx + st[0]; pt.yM = leader.flight.sy + st[1];
      w.pilot.setIntent('point', pt);
    }
  };
  return form;
}
