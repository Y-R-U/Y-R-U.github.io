import test from 'node:test';
import assert from 'node:assert/strict';

import {
  band, bandOf, newStanding, applyStanding, rollStandingDay, enterCampaign, STANDING,
  suspicionRate, stepSuspicion, suspicionEvent, graftDuration, graftXp, breakGraft,
  WATCH_WEIGHT, SUSPICION, GRAFT,
  newGraft, graftBlocked, startGraft, tickGraft, endGraft, graftEvent,
} from './faction.js';
import { AI } from './foes.js';
import { xpToReach } from './xp.js';
import { GLAMOUR_XP_EVADE } from './tables.js';

test('§8.1 — the five bands, with Plain from -10 to 20', () => {
  assert.equal(band(-100), 'hostile');
  assert.equal(band(-41), 'hostile');
  assert.equal(band(-40), 'watched');
  assert.equal(band(-11), 'watched');
  assert.equal(band(-10), 'plain');
  assert.equal(band(0), 'plain');
  assert.equal(band(19), 'plain');
  assert.equal(band(20), 'trusted');
  assert.equal(band(59), 'trusted');
  assert.equal(band(60), 'sworn');
  assert.equal(band(100), 'sworn');
});

test('town gates open at Trusted, the capstone at Sworn', () => {
  assert.equal(bandOf(19).gates, undefined);
  assert.equal(bandOf(20).gates, true);
  assert.equal(bandOf(59).capstone, undefined);
  assert.equal(bandOf(60).capstone, true);
});

test('a faction quest is +8 and bleeds 0.4x onto the opposed faction', () => {
  const st = applyStanding(newStanding(), 'quest', { faction: 'light' });
  assert.equal(st.light, 8);
  assert.equal(+st.dark.toFixed(1), -3.2);
  assert.equal(st.neutral, 0);
});

test('Neutral is opposed by neither, and opposes neither', () => {
  const st = applyStanding(newStanding(), 'quest', { faction: 'neutral' });
  assert.equal(st.neutral, 8);
  assert.equal(st.light, 0);
  assert.equal(st.dark, 0);
});

test('vermin and sales are capped per game-day and the cap clears on the boundary', () => {
  let st = newStanding(1);
  for (let i = 0; i < 40; i++) st = applyStanding(st, 'vermin', { faction: 'light' });
  assert.equal(st.light, STANDING.verminCap);
  for (let i = 0; i < 40; i++) st = applyStanding(st, 'sell', { faction: 'light', amount: 500 });
  assert.equal(st.light, STANDING.verminCap + STANDING.sellCap);
  st = rollStandingDay(st, 2);
  st = applyStanding(st, 'vermin', { faction: 'light' });
  assert.equal(st.light, 10.5);
});

test('selling pays 0.2 per 100 mk', () => {
  const st = applyStanding(newStanding(), 'sell', { faction: 'dark', amount: 1000 });
  assert.equal(+st.dark.toFixed(1), 2.0);
});

test('penalties are not bled onto the opposed faction', () => {
  const st = applyStanding(newStanding(), 'killCitizen', { faction: 'light' });
  assert.equal(st.light, -40);
  assert.equal(st.dark, 0);
});

test('standing clamps to +/-100', () => {
  let st = newStanding();
  for (let i = 0; i < 40; i++) st = applyStanding(st, 'quest', { faction: 'neutral' });
  assert.equal(st.neutral, 100);
});

test('§8.2 — entering a campaign clamps that faction to Watched, and eight quests restore Trusted', () => {
  let st = { ...newStanding(), dark: 45 };
  st = enterCampaign(st, 'dark');
  assert.equal(st.dark, -20);
  assert.equal(band(st.dark), 'watched');
  for (let i = 0; i < 8; i++) st = applyStanding(st, 'quest', { faction: 'dark' });
  assert.equal(st.dark, 44);
  assert.equal(band(st.dark), 'trusted');
});

test('a campaign entry never raises a standing that was already low', () => {
  const st = enterCampaign({ ...newStanding(), dark: -60 }, 'dark');
  assert.equal(st.dark, -60);
});

test('§8.3 — Graft duration is 9 min at Glamour 12 and 13 min at 20', () => {
  assert.equal(graftDuration(12), 540);
  assert.equal(graftDuration(20), 780);
  assert.equal(GRAFT.cooldownAfterBreak, 120);
});

test('Kesta is the hardest person in the valley to stand next to', () => {
  assert.equal(WATCH_WEIGHT.kesta, 2.0);
  assert.equal(WATCH_WEIGHT.alder, 0.6);
  const near = w => suspicionRate({ watchmen: 1, watchWeight: w, glamour: 12 });
  assert.equal(near(WATCH_WEIGHT.kesta), 2 * near(WATCH_WEIGHT.watch));
  assert.ok(near(WATCH_WEIGHT.alder) < near(WATCH_WEIGHT.watch));
});

test('Glamour level buys suspicion resistance, and two Watchmen cost 1.8x', () => {
  assert.equal(suspicionRate({ watchmen: 1, glamour: 0 }), 4);
  assert.equal(suspicionRate({ watchmen: 1, glamour: 12 }), 2);
  assert.equal(+suspicionRate({ watchmen: 2, glamour: 12 }).toFixed(1), 3.6);
});

test('suspicion decays at 3/s outdoors and 8/s inside a Longacre building', () => {
  assert.equal(suspicionRate({ watchmen: 0 }), -3);
  assert.equal(suspicionRate({ watchmen: 0, indoorsLongacre: true }), -8);
  assert.equal(stepSuspicion(50, 2, { watchmen: 0 }), 44);
  assert.equal(stepSuspicion(2, 5, { watchmen: 0 }), 0);
});

test('casting the wrong faction bolt costs 25, your own field only 8', () => {
  assert.equal(suspicionEvent(0, 'wrongProjectile'), 25);
  assert.equal(suspicionEvent(0, 'ownField'), 8);
  assert.equal(suspicionEvent(0, 'seenChannelling'), SUSPICION.max);
  assert.equal(suspicionEvent(95, 'strikeCitizen'), 100);
});

test('the intended rhythm holds: worn bolts plus your own fields decay faster than they accrue', () => {
  // 2.5 casts/s of the worn faction's bolt is 0 suspicion; one field every 6 s is +8, against
  // -3/s of decay while no Watchman is inside 6 m.
  const perSixSeconds = SUSPICION.ownField + suspicionRate({ watchmen: 0 }) * 6;
  assert.ok(perSixSeconds < 0);
});

test('a Break costs 25 Standing and hands back a free 20 s Graft into the other faction', () => {
  const r = breakGraft(newStanding(), 'dark');
  assert.equal(r.standing.dark, -25);
  assert.equal(r.cooldown, 120);
  assert.equal(r.freeGraft.faction, 'light');
  assert.equal(r.freeGraft.seconds, 20);
});

test('a voluntary un-Graft pays 400 + 25/s, capped at 1600, and nothing above suspicion 40', () => {
  assert.equal(graftXp(0, 0), 400);
  assert.equal(graftXp(20, 39), 900);
  assert.equal(graftXp(1000, 0), 1600);
  assert.equal(graftXp(60, 40), 0);
});

test('§2.3 — 68 evasions at enemy level 5 reach Glamour 12 with no disguise at all', () => {
  assert.equal(Math.ceil(xpToReach(12) / (GLAMOUR_XP_EVADE * 5)), 68);
});

// ── the Graft state machine ───────────────────────────────────────────────────

// Runs the machine at 20 Hz for `seconds`, as the session ticks it, and reports what it did.
function hold(g, seconds, ctx = {}, dt = 0.05) {
  const events = [];
  let cur = g;
  for (let t = 0; t < seconds && !events.includes('break') && !events.includes('expire'); t += dt) {
    const r = tickGraft(cur, dt, ctx);
    cur = r.graft;
    events.push(...r.events);
  }
  return { graft: cur, events, susp: cur.susp, held: cur.held };
}

test('a fresh character cannot Graft, and every refusal names itself', () => {
  const g = newGraft();
  assert.equal(graftBlocked(g, {}), 'granted');
  assert.equal(graftBlocked(g, { granted: true }), 'ash');
  assert.equal(graftBlocked(g, { granted: true, ash: 1 }), null);
  assert.equal(graftBlocked(g, { granted: true, ash: 1, seen: true }), 'seen');
  assert.equal(graftBlocked({ ...g, cd: 4 }, { granted: true, ash: 1 }), 'cooldown');
  assert.equal(graftBlocked({ ...g, worn: 'light' }, { granted: true, ash: 1 }), 'worn');
});

test('the cast sets the face and the clock, and an empty room never spends it', () => {
  const g = startGraft(newGraft(), 'light', { glamour: 12 });
  assert.equal(g.worn, 'light');
  assert.equal(g.left, 540);
  const r = hold(g, 300);
  assert.equal(r.susp, 0, 'suspicion floors at 0 with nobody watching');
  assert.equal(r.events.length, 0);
  assert.ok(Math.abs(r.graft.left - 240) < 0.01);
});

test('a Graft expires on its own clock and pays the un-Graft XP if it was clean', () => {
  const g = startGraft(newGraft(), 'dark', { glamour: 0 });
  assert.equal(g.left, 180);
  const r = hold(g, 200);
  assert.ok(r.events.includes('expire'));
  const out = endGraft(r.graft, { reason: 'expire' });
  assert.equal(out.xp, 1600, 'held past 48 s, so it is at the cap');
  assert.equal(out.graft.worn, null);
  assert.equal(out.graft.cd, GRAFT.cooldown);
});

test('the ticks fire once each at 40, 70 and 90 on the way to a Break', () => {
  const ctx = { watchmen: 1, watchWeight: WATCH_WEIGHT.kesta, glamour: 12 };
  const r = hold(startGraft(newGraft(), 'light', { glamour: 12 }), 200, ctx);
  assert.deepEqual(r.events, ['tick40', 'tick70', 'tick90', 'break']);
});

test('a Break costs the long cooldown and the free Graft that follows it pays nothing', () => {
  const caught = { ...startGraft(newGraft(), 'dark', { glamour: 12 }), held: 90, susp: 100 };
  const b = breakGraft(newStanding(), caught.worn);
  const out = endGraft(caught, { reason: 'break' });
  assert.equal(out.xp, 0, 'graftXp already refuses anything at suspicion 40 or above');
  assert.equal(out.graft.cd, GRAFT.cooldownAfterBreak);
  const free = startGraft(out.graft, b.freeGraft.faction, { seconds: b.freeGraft.seconds, free: true });
  assert.equal(free.worn, 'light');
  assert.equal(free.left, 20);
  assert.equal(free.cd, 120, 'the free 20 s runs while the 120 s cooldown is still counting');
  const done = hold(free, 30);
  assert.ok(done.events.includes('expire'));
  assert.equal(endGraft(done.graft).xp, 0, 'being caught is not an XP source');
});

test('an instantaneous tell can Break a Graft on its own', () => {
  let g = { ...startGraft(newGraft(), 'light', { glamour: 12 }), susp: 80 };
  g = graftEvent(g, 'wrongProjectile');
  assert.equal(g.susp, 100);
  g = graftEvent(g, 'ownField');
  assert.equal(g.susp, 100, 'suspicion clamps at the maximum');
});

test('a Watchman between 12 m and 22 m stops the decay without starting the climb', () => {
  assert.equal(suspicionRate({ watchmen: 0, nearby: 1 }), 0);
  assert.equal(suspicionRate({ watchmen: 0, nearby: 0 }), SUSPICION.decay);
  assert.equal(suspicionRate({ watchmen: 0 }), SUSPICION.decay, 'the old call shape is unchanged');
});

// The three distances are one mechanic and they only read as one if they nest. At `radius: 6` the
// band a Watchman read your face in was inside its own melee reach, so the two events the disguise
// loop is built out of — being noticed and being bitten — were the same event.
test('the detection bands nest, and noticing you is not the same as reaching you', () => {
  assert.ok(SUSPICION.radius < SUSPICION.holdRadius);
  assert.equal(SUSPICION.holdRadius, GRAFT.losRadius,
    'you cannot cool off anywhere they can see you well enough to refuse you a Graft');
  assert.ok(SUSPICION.radius > AI.reach * 1.7 * 4, `${SUSPICION.radius} m is melee, not a street`);
  assert.ok(SUSPICION.radius > AI.notice, 'the Watch reads a face at least as far as it sees a body');
});

// The old multiplier was a flat "two or more", so a cordon of eight cost exactly what a pair did.
test('every Watchman past the first costs the same again, up to the cap', () => {
  const at = n => suspicionRate({ watchmen: n, glamour: 12 });
  assert.equal(at(1), 2);
  assert.equal(+at(2).toFixed(2), 3.6, 'SYSTEMS §8.3 prices the second at 1.8x');
  assert.ok(at(3) > at(2) && at(4) > at(3), 'three and four used to cost what two did');
  assert.equal(at(9), at(4), 'and a crowd cannot make a Break instant');
  assert.equal(+(at(9) / at(1)).toFixed(2), SUSPICION.crowdCap);
});

// Four Breaks in 58 s standing still, measured on the real Session: each one hands the other face
// back into the same field, which Breaks it again 14.5 s later. −50 Standing a lap, both towns, no
// XP, no input.
test('the free Graft a Break hands back cannot itself be Broken', () => {
  const b = breakGraft(newStanding(), 'light');
  let g = startGraft(newGraft(), b.freeGraft.faction, { seconds: b.freeGraft.seconds, free: true });
  const events = [];
  for (let i = 0; i < 600 && g.worn; i++) {
    const r = tickGraft(g, 1 / 30, { watchmen: 8, watchWeight: WATCH_WEIGHT.kesta, glamour: 0 });
    g = r.graft;
    events.push(...r.events);
  }
  assert.equal(g.susp, 0, 'a face you did not choose does not accrue');
  assert.ok(events.includes('expire') && !events.includes('break'), 'it runs out; it is not caught');
  assert.equal(+g.held.toFixed(1), 20);

  // And a face the player chose is still perfectly catchable in the same field.
  const own = tickGraft(startGraft(newGraft(), 'light', { glamour: 0 }), 1,
    { watchmen: 8, watchWeight: WATCH_WEIGHT.kesta, glamour: 0 });
  assert.ok(own.graft.susp > 0);
});

// The numbers the balance argument rests on. Measured, never asserted from the spec text.
test('§8.3 measured — how long a Grafted player survives a Watchman', () => {
  const at = (glamour, weight, watchmen = 1) =>
    +(hold(startGraft(newGraft(), 'light', { glamour }), 1000,
      { watchmen, watchWeight: weight, glamour }).held).toFixed(2);

  assert.equal(at(12, WATCH_WEIGHT.watch), 50.05);     // one generic Watchman, Glamour 12
  assert.equal(at(12, WATCH_WEIGHT.kesta), 25);        // Kesta, Glamour 12
  assert.equal(at(12, WATCH_WEIGHT.alder), 83.35);     // Warden Alder, Glamour 12
  assert.equal(at(12, WATCH_WEIGHT.kesta, 2), 13.9);   // Kesta and a friend, Glamour 12
  assert.equal(at(20, WATCH_WEIGHT.watch), 150.05);    // one generic Watchman, Glamour 20
  assert.equal(at(20, WATCH_WEIGHT.watch, 2), 83.35);  // two of them, Glamour 20

  // The rhythm §8.3 is aiming at: 20 s beside a Watchman, 20 s away, and the whole 9-minute face
  // runs out before suspicion ever does.
  let g = startGraft(newGraft(), 'light', { glamour: 12 });
  const seen = [];
  let peak = 0;
  while (g.left > 0 && !seen.includes('break')) {
    for (const ctx of [{ watchmen: 1, glamour: 12 }, { watchmen: 0 }]) {
      const r = hold(g, 20, ctx);
      g = r.graft;
      peak = Math.max(peak, r.susp);
      seen.push(...r.events);
    }
  }
  assert.equal(Math.round(peak), 40, 'the ring shows, and never gets past the first tick');
  assert.ok(seen.includes('expire') && !seen.includes('break'), 'the clock runs out, not the disguise');
});

test('§8.3 measured — the duration ladder is the reason to train Glamour', () => {
  const mins = l => +(graftDuration(l) / 60).toFixed(1);
  assert.deepEqual([mins(0), mins(12), mins(17), mins(20)], [3, 9, 11.5, 13]);
  // Every Glamour level is 30 s of face and 1/24th off the suspicion rate.
  assert.equal(graftDuration(13) - graftDuration(12), 30);
  assert.equal(+(suspicionRate({ watchmen: 1, glamour: 20 }) / suspicionRate({ watchmen: 1, glamour: 12 })).toFixed(3), 0.333);
});

test('the duration knob scales the face and nothing else', () => {
  assert.equal(startGraft(newGraft(), 'light', { glamour: 12, durationMul: 0.5 }).left, 270);
  assert.equal(suspicionRate({ watchmen: 1, glamour: 12, rateKnob: 2 }), 4);
});

test('a Graft cannot be re-cast until its cooldown has run', () => {
  const out = endGraft(startGraft(newGraft(), 'light', { glamour: 12 }));
  assert.equal(graftBlocked(out.graft, { granted: true, ash: 9 }), 'cooldown');
  const later = hold(out.graft, 21).graft;
  assert.equal(later.cd, 0);
  assert.equal(graftBlocked(later, { granted: true, ash: 9 }), null);
});
