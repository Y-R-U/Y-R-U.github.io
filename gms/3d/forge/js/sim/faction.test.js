import test from 'node:test';
import assert from 'node:assert/strict';

import {
  band, bandOf, newStanding, applyStanding, rollStandingDay, enterCampaign, STANDING,
  suspicionRate, stepSuspicion, suspicionEvent, graftDuration, graftXp, breakGraft,
  WATCH_WEIGHT, SUSPICION, GRAFT,
} from './faction.js';
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
