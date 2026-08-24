/**
 * Duel — DESIGN §7.5.
 *
 * 1v1 versus a named ace. No ground fire, no crates, no third parties. Both
 * start at 400 m, 40 m/s, 800 m apart, closing. Best of three, and **nothing
 * heals between rounds**, which is what makes round one matter.
 *
 * It exists because it is the pure, unconfounded test of the flight model, and
 * it doubles as the balance harness's fixture (§10.2). Everything the duel
 * matrix reports comes out of this file driving the shipping modules.
 *
 * Pure: no DOM, no clock, no Math.random. `tools/sim.mjs` and a browser scene
 * drive the identical object.
 */

import { createRNG } from '../core/rng.js';
import { AIRFRAME_BY_ID, REFERENCE } from '../data/tables.js';
import { createWorld, ENEMY_BY_ID, playerType } from '../sim/entities.js';
import { createAI, ACES, createFormation, cornerGuess } from '../sim/ai.js';
import { GUN_BY_ID } from '../sim/weapons.js';
import { makeHP, HP_REF } from '../sim/damage.js';

export const DUEL = Object.freeze({
  startAlt: 400,          // m
  startSpeed: 40,         // m/s
  startSep: 800,          // m, closing
  arenaHalfW: 1000,       // m — a 2 km arena
  cloudLo: -560, cloudHi: -420,     // the Deck band, §0b
  rounds: 3,              // best of three
  roundSecs: 90,          // §7.5's session is 40-120 s; a round that has not been
                          // decided by 90 s is a stalemate and is scored as one
  drawBand: 0.02,         // structure fractions within 2% of each other = draw
  reachRadius: 45,        // m — how close you must get to the crate Grelle is guarding
});

/** Which enemy airframe an ace flies when §5.3 does not name one. */
const ACE_TYPE = {
  A1: 'wasp', A2: 'shrike', A3: 'wasp', A4: 'shrike', A5: 'anvil', A6: 'kestrel',
  A7: 'nightjar', A8: 'shrike', A9: 'wasp', A10: 'shrike', A11: 'shrike', A12: null,
  S1: 'shrike', S2: 'shrike', S3: 'kestrel', S4: null,
};

/** Extra aircraft the ace brings. §5.3 A11 commands a formation; A6/S3 are a pair. */
const ACE_WINGMEN = { A11: 2, A6: 1, S3: 1 };

/**
 * §5.3 D4 Grelle is a duel you cannot win by shooting. Without crates (P6) the
 * duel frame models the objective as a point past him: `reach` wins the round.
 * That is a PROXY and P5_NOTES §7 says so — it measures whether he can be got
 * past, which is the half of the idea that is about flying.
 */
const ACE_WIN = { S2: 'reach' };

export function createDuel(ctx = {}, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = createRNG(seed);
  const world = createWorld({ rng, bus: ctx.bus }, {});
  const aceId = opts.ace || 'A10';
  const prof = ACES[aceId];
  if (!prof) throw new Error('no such ace ' + aceId);

  const pAirframe = AIRFRAME_BY_ID[opts.airframe || 'kite_b1'] || REFERENCE;
  const pGun = GUN_BY_ID[opts.gun || 't2'];
  const pType = playerType(pAirframe.id, pGun.id);
  const aceTypeId = prof.mirrorLoadout || prof.replayMirror ? null : (ACE_TYPE[aceId] || 'shrike');
  const aType = aceTypeId ? ENEMY_BY_ID[aceTypeId] : mirrorType(pAirframe, pGun);
  const wing = ACE_WINGMEN[aceId] || 0;
  const winBy = ACE_WIN[aceId] || 'kill';

  // carried between rounds — nothing heals (§7.5)
  /**
   * An ace's machine is his own. §5.3 gives A5 340 HP outright and A10 "best
   * available everything", and the arithmetic forces the rest: the player has
   * 220 structure by §3.1, so an ace on a stock 60-80 HP scout cannot possibly
   * win 30-45% of duels no matter how well he flies. `prof.hp` is the ace's
   * structure; every ordinary hostile keeps §5.1's.
   */
  const aceStruct = prof.hp || aType.structure;
  const pHP = makeHP(HP_REF.structure);
  const aHP = makeHP(aceStruct);
  const pAmmo = { n: pGun.ammo };
  const aAmmo = { n: (aType.gun && aType.gun.ammo) || 600 };

  world.arena.cloudLo = DUEL.cloudLo;
  world.arena.cloudHi = DUEL.cloudHi;
  world.arena.halfW = DUEL.arenaHalfW;
  world.arena.lineX = DUEL.arenaHalfW;
  world.arena.dark = !!prof.dark;
  world.arena.updrafts = prof.useUpdraft
    ? [{ x0: -320, x1: -120, y0: -900, y1: -200, w: 6 }, { x0: 180, x1: 380, y0: -900, y1: -200, w: 6 }]
    : null;
  if (winBy === 'reach') {
    // A POINT, not a half-plane. The first version made the objective "get past
    // x = 900" in a 2 km arena the aeroplane bounces off at 999, so the player
    // won 91% of the time by flying in a straight line and Grelle's whole idea
    // measured as nothing.
    world.arena.objectiveX = (opts.swap ? -1 : 1) * DUEL.arenaHalfW * 0.92;
    world.arena.objectiveY = -DUEL.startAlt - 120;
  }

  function mirrorType(af, gun) {
    // §5.3 A12: your airframe, your guns, your traits, snapshotted at level start.
    return { id: 'mirror:' + af.id, name: 'mirror', structure: HP_REF.structure, role: 'player',
             airframe: af, gun: { ...gun }, turrets: null, armour: 1, gasbag: false };
  }

  const summary = {
    ace: aceId, airframe: pAirframe.id, gun: pGun.id, seed,
    rounds: [], won: 0, lost: 0, drawn: 0, winner: '', ttk: [], shots: 0, hits: 0,
    cause: '', causes: [], time: 0, playerStruct: 0, aceStruct: 0, mutual: 0,
  };

  /**
   * `swap` puts the player on the right heading -x and the ace on the left
   * heading +x. Nothing about a duel should depend on which way round it is set
   * up, and running the mirror ace both ways is the cheapest possible test of
   * that — it is what would have caught the spawn-roll and pilot-sign bugs on
   * the first day instead of the third. Gate C7b.
   */
  const swap = !!opts.swap;

  function seatRound(i) {
    world.reset();
    const closing = (swap ? -1 : 1) * DUEL.startSep / 2;
    const player = world.spawn(pType, {
      id: 'player', side: 0, xM: -closing, yM: -DUEL.startAlt, speed: DUEL.startSpeed, theta: swap ? Math.PI : 0,
      hp: pHP, hpMax: makeHP(HP_REF.structure), ammo: pAmmo.n, coolHand: !!opts.coolHand,
      morale: 1, k: opts.k ?? 0.70,
    });
    player.ai = createAI(player, { k: opts.k ?? 0.70, aggro: opts.aggro ?? 1.2, counter: opts.counter || null });
    const ace = world.spawn(aType, {
      id: 'ace', side: 1, xM: +closing, yM: -DUEL.startAlt, speed: DUEL.startSpeed, theta: swap ? 0 : Math.PI,
      hp: aHP, hpMax: makeHP(aceStruct), ammo: aAmmo.n,
      morale: prof.morale, k: prof.k, aggro: prof.aggro,
    });
    if (prof.armour) ace.armour = prof.armour;
    ace.ai = createAI(ace, { profile: prof, k: prof.k, aggro: prof.aggro,
                             pairRole: prof.pair ? 'bait' : null });
    const wingmen = [];
    for (let w = 0; w < wing; w++) {
      const wt = ENEMY_BY_ID[prof.pair ? 'drover' : 'kestrel'];
      const e = world.spawn(wt, {
        id: 'wing' + w, side: 1, xM: closing + (swap ? -1 : 1) * (40 + w * 30), yM: -DUEL.startAlt - 20,
        speed: DUEL.startSpeed, theta: swap ? 0 : Math.PI, morale: prof.morale - 0.1, k: prof.k - 0.15, aggro: 1.2,
        hp: makeHP(prof.wingHp || wt.structure), hpMax: makeHP(prof.wingHp || wt.structure),
      });
      e.ai = createAI(e, { k: prof.k - 0.15, aggro: 1.2, pairRole: prof.pair ? 'killer' : null });
      wingmen.push(e);
    }
    const form = wingmen.length && prof.formation ? createFormation(ace, wingmen, prof.formation) : null;
    return { player, ace, wingmen, form };
  }

  function causeOf(e) {
    if (e.burning) return 'fire';
    if (e.flight.sy >= -0.6) return 'ground';
    if (e.lastHitBy === 'airframe') return 'airframe';
    if (e.lastHitBy === 'ground') return 'ground';
    if (e.hp.pilot <= 0) return 'pilot';
    if (e.hp.wingU <= 0 || e.hp.wingL <= 0) return 'wing';
    if (e.hp.engine <= 0) return 'engine';
    return 'guns';
  }

  /* ------------------------------------------------------------ the loop -- */
  /**
   * The rules live here once and are stepped one tick at a time, so the headless
   * matrix and the browser bench drive the identical object. `run()` is just
   * `begin()` plus `step()` in a loop — there is no second copy of the round
   * logic for the page to drift away from.
   */
  const live = { player: null, ace: null, wingmen: [], form: null };
  const api = {
    world, summary, profile: prof, roundIndex: 0, roundTime: 0, done: false,
    get entities() { return live; },
  };

  function seatNext() {
    const r = seatRound(api.roundIndex);
    live.player = r.player; live.ace = r.ace; live.wingmen = r.wingmen; live.form = r.form;
    api.roundTime = 0;
  }

  function endRound(result, cause) {
    const player = live.player, ace = live.ace;
    /**
     * §7.5: "between rounds nothing heals — damage carries, which makes round 1
     * matter." That applies to a SURVIVOR. An aeroplane that was shot down is
     * gone and you fly another one, so it comes back whole — otherwise the loser
     * of round 1 starts round 2 with zero structure and dies in the first second,
     * which is what the first version did: best-of-three was best-of-one and the
     * other two rounds were a formality. Ammunition goes with the machine.
     */
    if (player.dead) { makeHP(HP_REF.structure, pHP); pAmmo.n = pGun.ammo; }
    else { for (const key in pHP) pHP[key] = Math.max(0, player.hp[key]); pAmmo.n = player.gun ? player.gun.ammo : 0; }
    if (ace.dead) { makeHP(aceStruct, aHP); aAmmo.n = (aType.gun && aType.gun.ammo) || 600; }
    else { for (const key in aHP) aHP[key] = Math.max(0, ace.hp[key]); aAmmo.n = ace.gun ? ace.gun.ammo : 0; }
    summary.shots += player.shotsFired;
    summary.hits += player.hits;
    summary.time += api.roundTime;
    summary.playerStruct = player.alive ? player.hp.structure : 0;
    summary.aceStruct = ace.alive ? ace.hp.structure : 0;
    summary.rounds.push({ i: api.roundIndex, result, cause, t: +api.roundTime.toFixed(2),
                          pStruct: +player.hp.structure.toFixed(1), aStruct: +ace.hp.structure.toFixed(1),
                          aceState: ace.ai ? ace.ai.state : '' });
    summary.causes.push(cause);
    if (result === 'player') { summary.won++; summary.ttk.push(api.roundTime); }
    else if (result === 'ace') summary.lost++;
    else summary.drawn++;

    const need = Math.ceil(DUEL.rounds / 2);
    api.roundIndex++;
    if (summary.won >= need || summary.lost >= need || api.roundIndex >= DUEL.rounds) {
      api.done = true;
      summary.winner = summary.won > summary.lost ? 'player' : summary.lost > summary.won ? 'ace' : 'draw';
      summary.cause = summary.causes.length ? modal(summary.causes) : '';
      summary.accuracy = summary.shots ? summary.hits / summary.shots : 0;
    } else seatNext();
  }

  /** One tick. Returns false when the duel is over. */
  function step() {
    if (api.done) return false;
    const dt = world.dt;
    const player = live.player, ace = live.ace;
    world.update(dt);
    if (live.form) live.form.update(dt, world);
    api.roundTime += dt;
    keepInside(player); keepInside(ace);
    for (let w = 0; w < live.wingmen.length; w++) keepInside(live.wingmen[w]);

    if (winBy === 'reach' && player.alive && !player.dead
        && Math.hypot(player.flight.sx - world.arena.objectiveX,
                      player.flight.sy - world.arena.objectiveY) < DUEL.reachRadius) {
      endRound('player', 'objective'); return !api.done;
    }
    const aceGone = ace.dead || !ace.alive, playerGone = player.dead || !player.alive;
    // A mutual kill is a mutual kill. Checking the ace first made every head-on
    // trade a player win, which is a thumb on the scale in exactly the place a
    // mirror duel is supposed to be measuring — it was worth 17 points there.
    if (aceGone && playerGone) { summary.mutual++; endRound('draw', 'mutual'); return !api.done; }
    if (aceGone) { endRound('player', causeOf(ace)); return !api.done; }
    if (playerGone) { endRound('ace', causeOf(player)); return !api.done; }

    if (api.roundTime >= DUEL.roundSecs) {
      const pf = player.hp.structure / player.hpMax.structure;
      const af = ace.hp.structure / ace.hpMax.structure;
      // STORY §3.3 D4: he fights to a stalemate ON PURPOSE, because a stalemate
      // is a delivery completed. Time running out is his win, not a draw.
      const r = winBy === 'reach' ? 'ace'
              : Math.abs(pf - af) < DUEL.drawBand ? 'draw' : (pf > af ? 'player' : 'ace');
      endRound(r, 'timeout');
    }
    return !api.done;
  }

  function keepInside(e) {
    if (!e.alive) return;
    const f = e.flight, W = world.arena.halfW;
    if (Math.abs(f.sx) < W) return;
    if (e.ai && e.ai.state === 'BUG_OUT') {
      // §5.2: a fled enemy that reaches its own line survives, and comes back
      // next level with k + 0.05 and a grudge marker.
      e.fled = true; e.grudge++;
      world.stats.fled++;
      if (ctx.bus) ctx.bus.emit('enemy:fled', { id: e.id, k: e.k + 0.05 });
      world.despawn(e);
      return;
    }
    f.sx = Math.sign(f.sx) * (W - 1);
    f.svx = -f.svx * 0.6;
    f.theta = Math.atan2(f.svy, f.svx);
  }

  api.begin = () => { if (!live.player) seatNext(); return api; };
  api.step = step;
  api.run = () => {
    api.begin();
    let guard = 0;
    while (step() && guard++ < 60 * DUEL.roundSecs * DUEL.rounds + 10);
    if (!api.done) {
      api.done = true;
      summary.winner = summary.won > summary.lost ? 'player' : summary.lost > summary.won ? 'ace' : 'draw';
      summary.cause = summary.causes.length ? modal(summary.causes) : '';
      summary.accuracy = summary.shots ? summary.hits / summary.shots : 0;
    }
    return summary;
  };
  return api;
}

function modal(a) {
  const c = Object.create(null);
  let best = '', bn = 0;
  for (let i = 0; i < a.length; i++) { const n = (c[a[i]] = (c[a[i]] || 0) + 1); if (n > bn) { bn = n; best = a[i]; } }
  return best;
}

/** The intended loadout for each act — gate C4's "act's intended loadout". §6.2/§6.5. */
export const INTENDED = Object.freeze({
  1: { airframe: 'kite_b1',     gun: 't1' },
  2: { airframe: 'kite_b2',     gun: 't2' },
  3: { airframe: 'harrier_tri', gun: 't3' },
  4: { airframe: 'harrier_tri', gun: 't4' },
  5: { airframe: 'kitehawk',    gun: 't5' },
});
