// Pacing bot: drives the real js/state/game.js with an active and an idle player. Business-agnostic (reads data/).
// node tools/sim.mjs [--minutes=120] [--json]
import { createGame } from '../js/state/game.js';
import { LINES } from '../js/data/lines.js';

const START = Date.parse('2026-10-05T09:00:00');

export const PROFILES = {
  active: { bootRate: 3, tapRate: 1.5, decideEvery: 2, pileEvery: 20, checkIn: 0, events: true },
  idle: { bootRate: 1.2, tapRate: 0, decideEvery: 0, pileEvery: 0, checkIn: 180, events: false },
};

function value(g, prof) {
  let v = 0;
  for (const l of LINES) {
    const s = g.stats(l.id);
    if (!s.owned) continue;
    const pile = prof.pileEvery || prof.checkIn ? Math.min(1, s.shelfCap / Math.max(1e-9, s.grossPerSec) / (prof.pileEvery || prof.checkIn)) : 0;
    v += s.autoPile ? s.grossPerSec : s.grossPerSec * (s.sigma + (1 - s.sigma) * pile);
  }
  return v;
}

function options(g) {
  const out = [];
  for (const l of LINES) {
    const s = g.stats(l.id);
    if (!s.owned) { if (s.unlockable) out.push(['unlock', { lineId: l.id }]); continue; }
    out.push(['level', { lineId: l.id, qty: 1 }], ['throughput', { lineId: l.id }], ['boost', { lineId: l.id }], ['storage', { lineId: l.id }]);
    if (!s.managed) out.push(['hire', { lineId: l.id }]);
  }
  for (const d of g.data.districts) if (!g.state.districts.includes(d.id)) out.push(['permit', { districtId: d.id }]);
  return out;
}

// Greedy: best Δvalue / cost among what is affordable now; unlocks and permits always win (they open content).
function decide(g, prof, log, t) {
  for (let n = 0; n < 50; n++) {
    let best = null, bestScore = 0;
    const v0 = value(g, prof);
    for (const [type, p] of options(g)) {
      const q = g.quote(type, p);
      if (!q.affordable) continue;
      if (type === 'unlock' || type === 'permit') { best = [type, p]; break; }
      const save = g.serialize();
      const probe = createGame({ save: JSON.parse(save), seed: g.state.seed, nowWall: () => 0 });
      if (!probe.act(type, p).ok) continue;
      const score = (value(probe, prof) - v0) / Math.max(1e-9, q.cost);
      if (score > bestScore) { bestScore = score; best = [type, p]; }
    }
    if (!best) return;
    const r = g.act(best[0], best[1]);
    if (!r.ok) return;
    if (best[0] === 'unlock') log.opened[best[1].lineId] = Math.round(t);
  }
}

export function runSim({ profile = 'active', minutes = 120, seed = 7 } = {}) {
  const prof = PROFILES[profile];
  const clock = { t: START };
  const g = createGame({ seed, nowWall: () => clock.t });
  const log = { profile, firstBuy: null, opened: {}, owned: 0, incomePerSec: 0, cash: 0 };
  const dt = 0.5;
  let nextDecide = 0, nextPile = 0, nextCheck = 0, bootAcc = 0, tapAcc = 0;
  g.on('event:spawn', ({ event }) => { if (prof.events) g.act('claimEvent', { eventId: event.id }); });
  for (let t = 0; t < minutes * 60; t += dt) {
    clock.t += dt * 1000;
    g.tick(dt);
    if (!g.state.bootstrap.done) {
      bootAcc += prof.bootRate * dt;
      while (bootAcc >= 1) { bootAcc -= 1; g.act('tap'); }
      if (g.quote('unlock', { lineId: LINES[0].id }).affordable) {
        g.act('unlock', { lineId: LINES[0].id });
        log.firstBuy = Math.round(t);
        log.opened[LINES[0].id] = Math.round(t);
      }
      continue;
    }
    tapAcc += prof.tapRate * dt;
    while (tapAcc >= 1) { tapAcc -= 1; g.act('tap'); }
    const checking = prof.checkIn ? t >= nextCheck : false;
    if (checking) nextCheck = t + prof.checkIn;
    if ((prof.pileEvery && t >= nextPile) || checking) {
      nextPile = t + prof.pileEvery;
      for (const l of LINES) if (g.stats(l.id).stock > 0) g.act('tapPile', { lineId: l.id });
    }
    if ((prof.decideEvery && t >= nextDecide) || checking) {
      nextDecide = t + prof.decideEvery;
      decide(g, prof, log, t);
    }
  }
  log.owned = LINES.filter((l) => g.stats(l.id).owned).length;
  log.incomePerSec = g.totals().incomePerSec;
  log.cash = g.state.cash;
  return log;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  const minutes = +(args.minutes || 120);
  const runs = Object.keys(PROFILES).map((p) => runSim({ profile: p, minutes }));
  if (args.json) console.log(JSON.stringify(runs, null, 2));
  else {
    const mmss = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    console.log(`Idle Western 2 sim — ${minutes} min (placeholder numbers)`);
    console.log(['business'.padEnd(16), ...runs.map((r) => r.profile.padStart(9))].join(''));
    for (const l of LINES) console.log([(l.emoji + ' ' + l.name).padEnd(16), ...runs.map((r) => mmss(r.opened[l.id]).padStart(9))].join(''));
    console.log(['income/s'.padEnd(16), ...runs.map((r) => r.incomePerSec.toExponential(2).padStart(9))].join(''));
  }
}
