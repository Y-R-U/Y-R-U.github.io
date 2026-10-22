// SCORE lane harness: node tools/score-sim.mjs [--falsify] [--quiet]
// Asserts every DESIGN/DECISIONS number for js/game/*, runs a 30-hour career pacing sim, and with --falsify
// re-runs the suite against deliberately broken copies to prove the checks can fail.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.KRZ_ROOT || path.resolve(HERE, '..');
const QUIET = process.argv.includes('--quiet');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

if (process.argv.includes('--falsify')) { falsify(); process.exit(0); }

const G = await imp('js/game/index.js');
const { RANKS } = await imp('data/ranks.js');
const { AI_RANK_WEIGHTS } = await imp('data/ranks.js');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) { if (cond) { pass++; if (!QUIET) console.log('  ok  ' + msg); } else { fail++; failures.push(msg); console.log('  FAIL ' + msg); } }
const eq = (a, b, msg) => ok(Math.abs(a - b) < 1e-6, `${msg} (got ${a}, want ${b})`);
const section = (s) => { if (!QUIET) console.log('\n# ' + s); };
const IDX = Object.fromEntries(RANKS.map((r, i) => [r.id, i]));

function memStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
function seeded(s = 1) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const game = (o = {}) => G.createGame({ mode: 'free', career: false, rng: seeded(7), ...o });
const inf = (id, extra = {}) => ({ type: id, actor: 'player', ...extra });
function landAndStop(g, surface = 'runway', atStand = false) {
  g.update(0.1, { onGround: false, gsKt: 60 });
  g.update(0.1, { onGround: true, gsKt: 40, surface });
  for (let i = 0; i < 25; i++) g.update(0.1, { onGround: true, gsKt: 0, surface, atStand });
}

section('base PP (DESIGN §1.2)');
eq(G.basePP('cut_in_final', { data: { gap: 900 } }), 300, 'cut in 300');
eq(G.basePP('cut_in_final', { data: { gap: 300 } }), 450, 'cut in close (<400 m) ×1.5');
eq(G.basePP('queue_jump', { data: { jumped: 3 } }), 450, 'queue jump 150 × planes jumped');
eq(G.basePP('tower_buzz', { data: { dist: 50 } }), 300, 'tower buzz 300');
eq(G.basePP('tower_buzz', { data: { dist: 20 } }), 600, 'tower buzz cab-level ×2');
eq(G.basePP('formation', { data: { seconds: 6 } }), 190, 'formation 100 + 30/extra s');
eq(G.basePP('formation', { data: { seconds: 40 } }), 400, 'formation cap 400');
eq(G.basePP('near_miss', {}, false), 200, 'near miss 200');
eq(G.basePP('near_miss', {}, true), 300, 'near miss ×1.5 under Realistic');
eq(G.basePP('apron_landing', {}), 600, 'valet parking 600');
ok(G.basePP('runway_incursion', {}) == null, 'ATC extras with pp 0 do not score');

section('D19 LANDED — DEMAND IT (finish zones, demand(), autoBank fallback)');
{
  const Z = G.finishZone;
  ok(Z('easy', { x: 0, z: 200, surface: 'grass' }).ok && !Z('easy', { x: 0, z: 700, surface: 'grass' }).ok, 'easy: grass within 300 m of a runway ok, 700 m out not');
  ok(Z('medium', { x: 300, z: 0, surface: 'runway' }).ok && Z('medium', { x: -80, z: -200, surface: 'apron' }).ok && !Z('medium', { x: 0, z: 60, surface: 'grass' }).ok, 'medium: runway or terminal apron only');
  ok(Z('medium', { x: 0, z: 60, surface: 'grass' }).reason === 'Stop on a runway or the terminal apron', 'medium reason line');
  ok(!Z('hard', { x: 300, z: 0, surface: 'runway' }).ok && Z('hard', { x: G.DEFAULT_SPOT.x, z: G.DEFAULT_SPOT.z, surface: 'apron' }).ok, 'hard: runway refused, designated spot ok');
  ok(Z('hard', { x: 300, z: 0, surface: 'runway' }).reason === 'Taxi to the terminal', 'hard reason line');
  ok(G.difficultyFor({ protection: 'realistic' }) === 'hard', 'protection realistic → hard');
  const g = game({ autoBank: false }); g.handleEvent(inf('low_pass', { outrage: 0 }));
  eq(g.demand().ok, false, 'demand before landing refused');
  landAndStop(g, 'runway');
  eq(g.state().banked, 0, 'autoBank:false never banks silently');
  ok(g.state().finishReady, 'finishReady once landed and stopped');
  ok(g.demand({ ok: false, reason: 'Taxi to the terminal' }).reason === 'Taxi to the terminal', 'outside the zone: refused with the reason');
  let fin = null; g.on('finished', (e) => (fin = e));
  const r = g.demand({ ok: true });
  ok(r.ok && r.amount === 250 && g.state().banked === 250 && fin?.amount === 250, 'demand inside the zone banks + emits finished');
  ok(!g.state().finishReady, 'finish consumed until the next landing');
  const h = game({ autoBank: 15 }); h.handleEvent(inf('low_pass', { outrage: 0 }));
  landAndStop(h, 'runway'); eq(h.state().banked, 0, 'Free Flight fallback: not after 2.5 s');
  for (let i = 0; i < 130; i++) h.update(0.1, { onGround: true, gsKt: 0, surface: 'runway' });
  eq(h.state().banked, 250, 'Free Flight fallback: banks after a 15 s stop');
  const m = game({ autoBank: false }); m.handleEvent(inf('low_pass', { outrage: 0 }));
  m.update(0.1, { onGround: false, gsKt: 60 }); m.update(0.1, { onGround: true, gsKt: 30, surface: 'runway' });
  ok(m.demand().reason === 'Come to a stop', 'rolling fast: come to a stop');
}

section('multipliers');
{
  const g = game(); const got = [];
  g.on('pp', (e) => got.push(e.combo));
  for (let i = 0; i < 6; i++) { g.handleEvent(inf('low_pass', { outrage: 0 })); g.update(19); }
  ok(JSON.stringify(got) === JSON.stringify([1, 1.25, 1.5, 2, 2.5, 2.5]), `combo ladder ×1→×2.5 cap within 20 s (${got})`);
  g.update(21); g.handleEvent(inf('low_pass', { outrage: 0 }));
  eq(got.at(-1), 1, 'combo resets after 20 s');
}
eq(G.audacityMult(0, 4), 1.4, 'audacity Baron vs Duke ×1.4');
eq(G.audacityMult(0, 9), 1.8, 'audacity capped ×1.8');
eq(G.audacityMult(5, 1), 1, 'audacity min ×1.0 vs lower rank');
eq(G.heatMult(50), 1.25, 'outrage heat ×(1+50/200)');
eq(G.heatMult(100), 1.5, 'outrage heat max ×1.5');
{
  const g = game({ aircraft: 'bathtub' }); let e;
  g.on('pp', (x) => (e = x));
  g.handleEvent(inf('cut_in_final', { outrage: 0, data: { gap: 900 } }));
  eq(e.amount, 480, 'Bathtub ×1.6 on cut in (300 → 480)');
  const h = game(); let f; h.on('pp', (x) => (f = x));
  h.setPilotRank('ai7', 4);
  h.handleEvent({ type: 'composure', outrage: 50 });
  h.handleEvent(inf('cut_in_final', { victim: 'ai7', outrage: 65, data: { gap: 300 } }));
  // 450 × audacity 1.4 × heat 1.25 = 787.5 → 790
  eq(f.amount, 790, 'all multipliers chained + rounded to 10 (450×1.4×1.25)');
  ok(/^CUT IN! \+790 ×1\.75$/.test(f.text), `popup text "${f.text}"`);
  eq(h.state().outrage, 65, 'ATC outrage value adopted from events');
}

section('banking (pending → banked only when stopped after landing)');
{
  const g = game(); g.handleEvent(inf('low_pass', { outrage: 0 }));
  g.update(0.1, { onGround: false, gsKt: 70 });
  for (let i = 0; i < 50; i++) g.update(0.1, { onGround: false, gsKt: 0 });
  eq(g.state().banked, 0, 'airborne: nothing banks');
  g.update(0.1, { onGround: true, gsKt: 50, surface: 'grass' });
  for (let i = 0; i < 30; i++) g.update(0.1, { onGround: true, gsKt: 0, surface: 'grass' });
  eq(g.state().banked, 0, 'stopped on grass: not paved, not banked');
  for (let i = 0; i < 15; i++) g.update(0.1, { onGround: true, gsKt: 1, surface: 'taxiway' });
  eq(g.state().banked, 0, 'stopped < 2 s: not yet');
  for (let i = 0; i < 10; i++) g.update(0.1, { onGround: true, gsKt: 1, surface: 'taxiway' });
  eq(g.state().banked, 250, 'stopped 2 s on paved after landing: banked 250');
  eq(g.state().pending, 0, 'pending cleared');
  g.update(25); g.handleEvent(inf('taxi_speeding', { outrage: 0 }));
  for (let i = 0; i < 25; i++) g.update(0.1, { onGround: true, gsKt: 0, surface: 'apron', atStand: false });
  eq(g.state().pending, 80, 'taxi crime on apron without a new landing stays pending');
  for (let i = 0; i < 25; i++) g.update(0.1, { onGround: true, gsKt: 0, surface: 'apron', atStand: true });
  eq(g.state().banked, 330, 'stopping at a stand banks it');
}

section('outrage and Royal Scandal (internal meter, no ATC)');
{
  const g = game({ outrageSource: 'internal' }); let sc = null;
  g.on('scandal', (e) => (sc = e));
  g.handleEvent(inf('apron_landing')); g.update(30); // +25
  g.handleEvent(inf('apron_landing')); g.update(30); // 50
  g.handleEvent(inf('apron_landing')); g.update(30); // 75
  eq(g.state().outrage, 75, 'outrage adds rule outrage (25 per Valet Parking)');
  eq(g.state().tier, 3, '75 = tier 3 Cracking');
}
{
  const g = game({ outrageSource: 'internal' }); let sc = null;
  g.on('scandal', (e) => (sc = e));
  for (let i = 0; i < 3; i++) { g.handleEvent(inf('apron_landing')); g.update(30); }
  const before = g.state().pending;
  g.handleEvent(inf('apron_landing'));
  ok(sc && sc.forfeit === Math.round(before * 0.25), `scandal at 100 forfeits 25 % of pending (${sc?.forfeit} of ${before})`);
  eq(g.state().outrage, 60, 'outrage resets to 60');
  eq(g.state().frozen, 60, 'frozen for 60 s');
  ok(/KRAYZEE HERALD/.test(sc.headline), 'Herald headline');
  const p = g.state().pending;
  g.update(10); g.handleEvent(inf('tower_buzz'));
  eq(g.state().pending, p, 'infraction during freeze worth ×0');
  g.update(51); g.handleEvent(inf('low_pass'));
  ok(g.state().pending > p, 'scores again after 60 s');
}
{
  const g = game(); let sc = 0; g.on('scandal', () => sc++);
  g.handleEvent(inf('low_pass', { id: 1, outrage: 95 }));
  const p = g.state().pending;
  g.handleEvent({ type: 'scandal', key: 'tower', actor: 'player', t: 12, outrage: 60 });
  g.handleEvent({ type: 'scandal', key: 'tower', actor: 'player', t: 12, outrage: 60 });
  eq(sc, 1, 'ATC scandal event applied once (dedupe)');
  eq(g.state().pending, p - Math.round(p * 0.25), 'ATC scandal forfeits 25 %');
  g.handleEvent(inf('tower_buzz', { id: 2, outrage: 75, frozen: false }));
  ok(g.state().pending > p * 0.75, 'ATC frozen:false (the triggering infraction) still counts');
  const q = g.state().pending;
  g.handleEvent(inf('tower_buzz', { id: 3, outrage: 80, frozen: true }));
  eq(g.state().pending, q, 'ATC frozen:true worth ×0');
  g.handleEvent(inf('low_pass', { id: 4, outrage: 80, frozen: false }));
  const q2 = g.state().pending;
  g.handleEvent(inf('low_pass', { id: 4, outrage: 80, frozen: false }));
  ok(q2 > q && g.state().pending === q2, 'same ATC event id twice (on("*") double delivery) scores once');
  g.handleEvent({ type: 'cut_in_final', actor: 'ai3', victim: 'player', id: 9, outrage: 80 });
  ok(g.state().pending === q2, "AI's infraction never scores for the player");
}
{
  const g = game({ outragePerPlayer: true });
  g.handleEvent({ type: 'low_pass', actor: 'ai2', isPlayer: false, outrage: 90 });
  eq(g.state().outrage, 0, "per-player meters: another plane's outrage is ignored");
}

section('banter');
{
  const g = game(); const got = [];
  g.on('pp', (e) => got.push([e.name, e.amount]));
  g.handleEvent({ type: 'barked', intent: 'retort', source: 'response', reaction: 3.1 });
  g.handleEvent({ type: 'barked', intent: 'insult', source: 'response', reaction: 1.4 });
  g.handleEvent({ type: 'barked', intent: 'priority', target: 'tower', source: 'response', reaction: 1 });
  g.handleEvent({ type: 'barked', intent: 'insult', source: 'menu' });
  ok(JSON.stringify(got) === JSON.stringify([['Riposte', 40], ['Quick Riposte', 80], ['Do You Know Who I Am', 60]]), `riposte 40, quick ≤2 s 80, priority 60, menu bark 0 (${JSON.stringify(got)})`);
  eq(g.state().outrage, 5, 'priority reply +5 outrage');
}

section('protection: Rubber');
{
  const g = game({ protection: 'rubber', outrageSource: 'internal' }); const fwd = [];
  g.on('outrageDelta', (d) => fwd.push(d.amount));
  g.handleEvent(inf('apron_landing'));
  const r = g.reportImpact({ speedKt: 80 });
  ok(r.result === 'bounce' && r.protectionLeft === 100, 'rubber: always bounce, protection stays 100');
  eq(r.restitution, 0.55, 'restitution 0.55');
  eq(r.pendingLost, 90, '−15 % pending per bounce (600 → 510)');
  eq(g.state().outrage, 33, '+8 outrage per bounce (25 from the landing)');
  ok(fwd.join() === '8', "bounce outrage forwarded via 'outrageDelta' (for atc.addOutrage); infraction outrage is not");
  const e = game({ protection: 'rubber' }); e.handleEvent(inf('low_pass', { outrage: 30 })); e.reportImpact({ speedKt: 5 });
  eq(e.state().outrage, 30, 'ATC-sourced meter: score does not double-add bounce outrage locally');
  ok(Math.abs(r.spinDegPerS) <= 120 && r.apResumeAfter === 2, 'spin ≤ 120°/s, autopilot after 2 s');
}

section('protection: Partial');
eq(G.partialLoss(20), 16, 'partial loss 20 kt × 0.8 = 16 %');
eq(G.partialLoss(2), 5, 'partial loss min 5 %');
eq(G.partialLoss(200), 60, 'partial loss max 60 %');
eq(G.partialRestitution(100), 0.55, 'restitution at 100 % = 0.55');
eq(G.partialRestitution(10), 0.1, 'restitution at 10 % = 0.1');
{
  const g = game({ protection: 'partial' }); const pe = [];
  g.on('protection', (e) => pe.push(e));
  let r = g.reportImpact({ speedKt: 20 });
  ok(r.result === 'bounce' && r.protectionLeft === 84, `20 kt: bounce, 100 → 84 (${r.protectionLeft})`);
  r = g.reportImpact({ speedKt: 100 }); eq(r.protectionLeft, 24, '100 kt: −60 → 24');
  r = g.reportImpact({ speedKt: 100 }); eq(r.protectionLeft, 0, 'clamped at 0');
  ok(r.result === 'bounce', 'the hit that empties it still bounces');
  ok(g.state().effectiveProtection === 'realistic', 'at 0 % the plane is Realistic');
  g.handleEvent(inf('low_pass', { outrage: 0 }));
  r = g.reportImpact({ speedKt: 20 });
  ok(r.result === 'destroyed' && g.state().pending === 0, 'next 20 kt hit destroys, pending lost');
  g.respawn(); g.reportImpact({ speedKt: 50 });
  eq(g.state().protection, 60, 'respawn refills, 50 kt hit −40');
  g.handleEvent(inf('low_pass', { outrage: 0 }));
  landAndStop(g, 'runway'); eq(g.state().protection, 85, 'banked landing +25 %');
  g.reportImpact({ speedKt: 10 }); g.handleEvent(inf('low_pass', { outrage: 0 }));
  landAndStop(g, 'apron', true); eq(g.state().protection, 100, 'banked at stand refills 100 %');
  ok(pe.length >= 4, "'protection' events emitted");
}
{
  const g = G.createGame({ mode: 'court', career: false }); eq(g.state().protection, 100, 'court room → partial 100 %');
  const h = G.createGame({ mode: 'court', career: false, partialStartPct: 50 }); eq(h.state().protection, 50, 'host partial start 50 %');
}

section('protection: Realistic');
{
  const g = game({ protection: 'realistic', outrageSource: 'internal' });
  g.handleEvent(inf('apron_landing'));
  let r = g.reportImpact({ speedKt: 10 });
  ok(r.result === 'damage' && r.shake === 1.5, 'prang ≤ 15 kt: damage + 1.5 s shake');
  eq(r.pendingLost, 60, 'prang −10 % pending');
  eq(g.state().outrage, 35, 'prang +10 outrage (25 from the landing)');
  r = g.reportImpact({ speedKt: 15 }); ok(r.result === 'damage', '15 kt exactly is a prang');
  r = g.reportImpact({ speedKt: 15.1 }); ok(r.result === 'destroyed' && r.gagSecs === 4, '> 15 kt destroyed, 4 s gag');
  eq(g.state().pending, 0, 'destroyed: pending lost entirely');
  g.respawn(); g.handleEvent(inf('low_pass', { outrage: 0 }));
  r = g.reportImpact({ speedKt: 3, onGear: false }); ok(r.result === 'destroyed', 'ground hit outside gear limits = destroyed at any speed');
  ok(G.withinGearLimits({ sinkFpm: 500, bankDeg: 10, pitchDeg: 5 }) && !G.withinGearLimits({ sinkFpm: 950 }) && !G.withinGearLimits({ bankDeg: 30 }) && !G.withinGearLimits({ pitchDeg: -7 }) && !G.withinGearLimits({ pitchDeg: 20 }), 'gear limits 900 fpm / 25° / −5..18°');
  const s = G.createGame({ mode: 'strict', career: false });
  s.handleEvent(inf('apron_landing', { outrage: 0 })); landAndStop(s);
  s.reportImpact({ speedKt: 40 }); eq(s.state().banked, 100, 'Strict Tower crash −500 room PP (600 → 100)');
}

section('D28/D30 contact close calls and big hits');
{
  const fly = (g, kt = 90) => g.update(0.1, { onGround: false, gsKt: kt });
  const lt = (o) => { const g = game({ outrageSource: 'internal', ...o }); const pp = []; g.on('pp', (e) => pp.push(e)); g.handleEvent(inf('apron_landing')); fly(g); return { g, pp }; };
  let { g, pp } = lt({ protection: 'rubber' });
  let r = g.reportImpact({ speedKt: 8, other: 'ai3' });
  ok(r.result === 'bounce' && r.lightTouch === 'scored', 'easy (rubber): 8 kt plane contact is a light touch');
  ok(pp.at(-1)?.id === 'light_touch' && pp.at(-1).name === 'Close Call' && /^CLOSE CALL!/.test(pp.at(-1).text), "light touch is shown as a CLOSE CALL");
  eq(pp.at(-1).parts.base, 150, 'light touch base 150');
  eq(r.pendingLost, 0, 'light touch: no dignity lost');
  eq(g.state().outrage, 33, 'light touch +8 outrage, no extra bounce outrage (25 from the landing)');
  r = g.reportImpact({ speedKt: 12, other: 'ai4' }); ok(r.lightTouch === 'scored', '12 kt exactly is still light (other pair)');
  ({ g, pp } = lt({ protection: 'rubber' }));
  const before = g.state().pending;
  r = g.reportImpact({ speedKt: 12.5, other: 'ai3' });
  ok(!r.lightTouch && !pp.some((e) => e.id === 'light_touch'), 'big hit (> 12 kt) never scores');
  eq(r.pendingLost, Math.round(before * 0.15), 'big hit keeps the −15 % bounce penalty');
  ({ g, pp } = lt({ protection: 'rubber' }));
  r = g.reportImpact({ speedKt: 5 }); ok(!r.lightTouch, 'no other plane (ground/building) is never a light touch');
  ({ g, pp } = lt({ protection: 'rubber' })); g.update(0.1, { onGround: true, gsKt: 2, surface: 'apron' });
  r = g.reportImpact({ speedKt: 6, other: 'ai3' }); ok(!r.lightTouch, 'parked (< 5 kt): being nudged earns nothing');
  ({ g, pp } = lt({ protection: 'rubber' }));
  g.reportImpact({ speedKt: 6, other: 'ai3' }); for (let i = 0; i < 590; i++) fly(g);
  r = g.reportImpact({ speedKt: 6, other: 'ai3' });
  ok(r.lightTouch === 'cooldown' && pp.filter((e) => e.id === 'light_touch').length === 1, 'same pair inside 60 s: no second close call');
  eq(r.pendingLost, 0, 'cooldown repeat is still penalty-free');
  r = g.reportImpact({ speedKt: 6, other: 'ai5' }); ok(r.lightTouch === 'scored', 'cooldown is per pair: another plane pays');
  for (let i = 0; i < 11; i++) fly(g);
  r = g.reportImpact({ speedKt: 6, other: 'ai3' }); ok(r.lightTouch === 'scored', 'same pair pays again after 60 s');
  ({ g, pp } = lt({ protection: 'partial' }));
  r = g.reportImpact({ speedKt: 10, other: 'p:bob' });
  ok(r.lightTouch === 'scored' && r.protectionLeft === 92 && r.pendingLost === 0, 'medium (partial): scores, rubber still scuffed −8 %, no dignity lost');
  ({ g, pp } = lt({ protection: 'partial', partialStartPct: 50 }));
  g.reportImpact({ speedKt: 200 }); ok(g.state().effectiveProtection === 'realistic', 'partial emptied');
  r = g.reportImpact({ speedKt: 5, other: 'ai3' });
  ok(r.result === 'damage' && r.lightTouch === 'pending', 'partial at 0 %: real metal, a light touch is a prang, judged like Hard');
  const surv = (s) => { for (let i = 0; i < s * 10; i++) fly(g); };
  ({ g, pp } = lt({ protection: 'realistic' }));
  const p0 = g.state().pending;
  r = g.reportImpact({ speedKt: 10, other: 'ai3' });
  ok(r.result === 'damage' && r.lightTouch === 'pending' && !pp.some((e) => e.id === 'light_touch'), 'hard: survivable light prang is not paid at once');
  eq(r.pendingLost, Math.round(p0 * 0.1), 'hard: the prang penalty (−10 %) still applies');
  surv(2.9); ok(!pp.some((e) => e.id === 'light_touch'), 'hard: not paid before 3 s');
  surv(0.2); ok(pp.at(-1)?.id === 'light_touch' && pp.at(-1).name === 'Close Call', 'hard: survived 3 s → CLOSE CALL paid');
  ({ g, pp } = lt({ protection: 'realistic' }));
  g.reportImpact({ speedKt: 10, other: 'ai3' }); surv(1);
  r = g.reportImpact({ speedKt: 40 }); surv(5);
  ok(r.result === 'destroyed' && !pp.some((e) => e.id === 'light_touch'), 'hard: destroyed inside the 3 s → nothing paid');
  ({ g, pp } = lt({ protection: 'realistic' }));
  g.reportImpact({ speedKt: 10, other: 'ai3' }); g.respawn(); surv(5); ok(!pp.some((e) => e.id === 'light_touch'), 'respawn cancels a pending close call');
  ({ g, pp } = lt({ protection: 'realistic' }));
  r = g.reportImpact({ speedKt: 14, other: 'ai3' }); surv(5);
  ok(r.result === 'damage' && !r.lightTouch && !pp.some((e) => e.id === 'light_touch'), 'hard: 14 kt prang survives but is a big hit → nothing');
  ({ g, pp } = lt({ protection: 'realistic' }));
  r = g.reportImpact({ speedKt: 20, other: 'ai3' }); surv(5);
  ok(r.result === 'destroyed' && !pp.some((e) => e.id === 'light_touch'), 'hard: destroying contact pays nothing');
  ({ g, pp } = lt({ mode: 'story', difficulty: 'hard', protection: 'rubber' }));
  r = g.reportImpact({ speedKt: 5, other: 'ai3' });
  ok(r.result === 'bounce' && !r.lightTouch && !pp.some((e) => e.id === 'light_touch') && r.pendingLost > 0, 'story Hard: a Rubber bounce still earns nothing, penalty stands');
  eq(G.basePP('near_miss', {}, true), 300, 'hard still scores close calls (near miss ×1.5)');
  ok(lt({ mode: 'story', difficulty: 'easy' }).g.difficulty === 'easy' && lt({ mode: 'strict' }).g.difficulty === 'hard' && lt({ mode: 'court' }).g.difficulty === 'medium' && lt({ mode: 'rumble' }).g.difficulty === 'easy', 'room difficulty from protection: rumble easy, court medium, strict hard');
  ({ g, pp } = lt({ mode: 'court' }));
  const j = g.serialize(); j.protectionMode = 'realistic'; j.protection = 0; g.restore(j);
  r = g.reportImpact({ speedKt: 5, other: 'p:bob' }); ok(g.difficulty === 'hard' && !pp.some((e) => e.id === 'light_touch'), 'online room switched to Realistic after create: Hard rules');
  ({ g, pp } = lt({ protection: 'rubber' })); g.handleEvent({ type: 'scandal', actor: 'player' });
  r = g.reportImpact({ speedKt: 6, other: 'ai3' }); ok(pp.at(-1)?.id === 'light_touch' && pp.at(-1).amount === 0, 'frozen by scandal: close call pays 0');
}

section('D30 one close-call window per pair (near miss, touch, formation)');
{
  const g = game({ outrageSource: 'internal', protection: 'rubber' }); const pp = []; g.on('pp', (e) => pp.push(e));
  const fly = (s) => { for (let i = 0; i < s * 10; i++) g.update(0.1, { onGround: false, gsKt: 90 }); };
  const n = (id) => pp.filter((e) => e.id === id).length;
  fly(1);
  g.handleEvent(inf('near_miss', { id: 1, victim: 'ai3' }));
  const r = g.reportImpact({ speedKt: 6, other: 'ai3' });
  ok(n('near_miss') === 1 && r.lightTouch === 'cooldown' && n('light_touch') === 0, 'near miss then touch, same pair: paid once');
  g.handleEvent(inf('formation', { id: 2, victim: 'ai3', data: { seconds: 5 } })); ok(n('formation') === 0, 'formation on the same pair inside the window: not paid');
  g.handleEvent(inf('near_miss', { id: 3, victim: 'ai4' })); ok(n('near_miss') === 2, 'another pair is free');
  fly(55); g.handleEvent(inf('near_miss', { id: 4, victim: 'ai3' })); ok(n('near_miss') === 1 + 1 && pp.filter((e) => e.victim === 'ai3').length === 1, '55 s later: still in the window');
  fly(6); g.handleEvent(inf('near_miss', { id: 5, victim: 'ai3' })); ok(pp.filter((e) => e.victim === 'ai3').length === 2, '61 s later: pays again');
  g.handleEvent(inf('cut_in_final', { id: 6, victim: 'ai3' })); ok(n('cut_in_final') === 1, 'non close-call crimes are not gated');

}

section("goaroundrefused → Selective Hearing (once per go-around)");
{
  const mk = () => { const g = game({ outrageSource: 'internal' }); const pp = [], fwd = []; g.on('pp', (e) => pp.push(e)); g.on('outrageDelta', (d) => fwd.push(d)); return { g, pp, fwd }; };
  let { g, pp, fwd } = mk();
  g.handleEvent({ type: 'goaroundrefused', reason: 'Tower: go around' });
  ok(pp.length === 1 && pp[0].id === 'ignored_instruction' && pp[0].amount === 120, 'refused go-around scores ignored_instruction 120');
  eq(g.state().outrage, 10, 'refusal +10 outrage');
  ok(fwd.some((d) => d.amount === 10 && d.why === 'ignored_instruction'), 'refusal outrage forwarded to ATC (it never saw the crime)');
  g.handleEvent({ type: 'ignored_instruction', id: 501, actor: 'player', outrage: 40, data: { instruction: 'goAround', landed: true } });
  ok(pp.length === 1 && g.state().outrage === 10, "ATC's later go-around Selective Hearing is not paid twice");
  g.handleEvent({ type: 'ignored_instruction', id: 502, actor: 'player', data: { instruction: 'holdPosition' } });
  ok(pp.length === 2, 'a hold-position Selective Hearing is a separate crime');
  g.handleEvent({ type: 'goaroundrefused', actor: 'ai7' }); ok(pp.length === 2, "an AI's refusal never scores");
  for (let i = 0; i < 910; i++) g.update(0.1, { onGround: false, gsKt: 90 });
  g.handleEvent({ type: 'goaroundrefused', actor: 'player' }); ok(pp.length === 3, 'a new go-around 90 s later scores again');
  ({ g, pp } = mk());
  g.handleEvent({ type: 'ignored_instruction', id: 9, actor: 'player', outrage: 12, data: { instruction: 'goAround' } });
  g.handleEvent({ type: 'goaroundrefused' });
  ok(pp.length === 1 && pp[0].amount === 120, 'ATC first, refusal second: still once');
}

section('career: D2 / D3');
{
  const st = memStore(); let t = 1000;
  const c = G.loadCareer({ storage: st, now: () => ++t });
  eq(c.rankIndex, 0, 'new career = Baron');
  const ups = []; c.on('rankUp', (u) => ups.push(u.rank.id));
  c.addPP(2000); eq(c.rankIndex, IDX.viscount, '2 000 PP = Viscount');
  c.addPP(258000); eq(c.lifetimePP, 260000, 'lifetime 260k');
  eq(c.rankIndex, IDX.king, 'D2: 260k PP but 0 online wins stays King');
  ok(!c.emperorEarned && !c.unlockedTitles.includes('emperor'), 'Emperor not unlocked without wins');
  ok(c.nextGoal().winsNeeded === 10 && c.nextGoal().ppNeeded === 0, 'nextGoal says 10 wins needed');
  for (let i = 0; i < 9; i++) c.addOnlineWin();
  eq(c.rankIndex, IDX.king, '9 wins: still King');
  c.addOnlineWin(); eq(c.rankIndex, IDX.emperor, '10 wins + 260k = Emperor');
  ok(ups.join() === 'viscount,king,emperor', `rankUp events (${ups})`);
  const c2 = G.loadCareer({ storage: memStore() });
  for (let i = 0; i < 12; i++) c2.addOnlineWin();
  c2.addPP(200000); eq(c2.rankIndex, IDX.king, 'wins without the points: King at 200k');
  ok(c.unlockedTitles.length === 10, 'all 10 titles unlocked');
  ok(!c2.selectTitle('emperor'), 'cannot select a locked title');
  ok(c.selectTitle('king'), 'select King');
  ok(c.displayTitle({ context: 'free', gender: 'f' }) === 'Queen', 'Free Flight shows the chosen title (Queen)');
  ok(c.displayTitle({ context: 'menu' }) === 'Emperor', 'before story completion, outside Free Flight: real rank');
  ok(c.displayTitle({ context: 'story', rankIndex: IDX.earl }) === 'Earl', 'story mission dictates rank');
  ok(c.displayTitle({ context: 'ranked', rankIndex: IDX.duke, gender: 'f' }) === 'Duchess', 'ranked online uses Court rank');
  c.setStoryComplete();
  ok(c.displayTitle({ context: 'menu' }) === 'King', 'after story completion the chosen title applies outside Free Flight');
  const c3 = G.loadCareer({ storage: memStore() }); c3.setStoryComplete(); eq(c3.rankIndex, IDX.prince, 'story completion floor = Prince');
  const saved = JSON.parse(st.getItem('krayzee.career'));
  ok(saved.v === 1 && saved.savedAt > 1000 && saved.lifetimePP === 260000 && saved.onlineWins === 10, 'saved to krayzee.career, versioned, stamped');
  const re = G.loadCareer({ storage: st });
  ok(re.rankIndex === IDX.emperor && re.selectedTitle === 'king' && re.storyComplete, 'reload round-trips');
  const bad = memStore(); bad.setItem('krayzee.career', '{oops'); ok(G.loadCareer({ storage: bad }).rankIndex === 0, 'corrupt save → defaults');
  const old = memStore(); old.setItem('krayzee.career', JSON.stringify({ lifetimePP: 7000 })); const o = G.loadCareer({ storage: old });
  ok(o.rankIndex === IDX.earl && o.onlineWins === 0 && o.unlockedTitles.join() === 'baron,viscount,earl', 'unversioned/partial save merges defaults');
  const thrower = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const tc = G.loadCareer({ storage: thrower }); tc.addPP(100); ok(tc.lifetimePP === 100, 'blocked storage does not throw');
  ok(G.newerCareer({ savedAt: 5 }, { savedAt: 9 }).savedAt === 9, 'newerCareer compares savedAt');
}
{
  const st = memStore(); const c = G.loadCareer({ storage: st });
  const g = G.createGame({ mode: 'free', career: c, rng: seeded(3) }); let up = null, bk = null;
  g.on('rankUp', (u) => (up = u)); g.on('banked', (b) => (bk = b));
  for (let i = 0; i < 4; i++) { g.handleEvent(inf('apron_landing', { outrage: 0 })); g.update(25); }
  landAndStop(g);
  ok(bk && c.lifetimePP === bk.amount && bk.amount >= 2000, `createGame banks into career (${bk?.amount})`);
  ok(up && up.rank.id === 'viscount' && /PROMOTED/.test(up.text), "createGame emits 'rankUp'");
  eq(g.state().rankIndex, IDX.viscount, 'audacity rank follows career');
}

section('court: D4');
{
  const court = G.createCourt({ roomType: 'court' }); const crowns = [];
  court.on('crownChange', (e) => crowns.push(e.to));
  for (const id of ['a', 'b', 'c', 'd']) court.addPlayer(id, { emperorEarned: id === 'b' });
  ok(court.standings().every((p) => p.rank.id === 'baron'), '0 PP = Baron for everyone, no crown');
  court.addPP('a', 1000, 1); court.addPP('c', 400, 2); court.addPP('d', 300, 3);
  const r = Object.fromEntries(court.standings().map((p) => [p.id, p.rank.id]));
  ok(r.a === 'king' && r.c === 'crownprince' && r.d === 'prince' && r.b === 'baron', `leader without Emperor = King, steps down (${JSON.stringify(r)})`);
  ok(court.holder === 'a', 'a holds the Crown');
  court.addPP('a', 99000, 4);
  ok(court.rankOf('a').id === 'king', 'NO 2× rule: huge lead still King');
  court.addPP('b', 200000, 5);
  const r2 = Object.fromEntries(court.standings().map((p) => [p.id, p.rank.id]));
  ok(r2.b === 'emperor' && r2.a === 'king' && r2.c === 'crownprince' && r2.d === 'prince', `leader with career Emperor = Emperor, 2nd King (${JSON.stringify(r2)})`);
  ok(crowns.join() === 'a,b', `crownChange events (${crowns})`);
  const blob = JSON.stringify(court.serialize());
  const c2 = G.createCourt(); ok(c2.restore(JSON.parse(blob)), 'restore accepts serialized court');
  ok(JSON.stringify(c2.standings()) === JSON.stringify(court.standings()) && c2.holder === 'b', 'host handoff: identical standings and Crown');
  c2.penalize('b', 500, 6); eq(c2.standings()[0].roomPP, 199500, 'penalize (Strict crash) on restored court');
  const t = G.createCourt(); t.addPlayer('x'); t.addPlayer('y'); t.addPP('y', 100, 1); t.addPP('x', 100, 2);
  ok(t.standings()[0].id === 'y', 'tie broken by earlier time-to-reach');
  const big = G.createCourt(); for (let i = 0; i < 11; i++) { big.addPlayer('p' + i); big.addPP('p' + i, 1000 - i, i); }
  const bs = big.standings().map((p) => p.rank.id);
  ok(bs[0] === 'king' && bs[8] === 'baron' && bs[10] === 'baron', `11 players: King … Baron (${bs.join(' ')})`);
  const cor = G.createCourt({ roomType: 'coronation' }); let w = null; cor.on('winner', (e) => (w = e.id));
  cor.addPlayer('x'); cor.addPlayer('y'); cor.addPP('x', 4900); cor.addPP('y', 5000);
  ok(w === 'y', 'Coronation: first to 5 000 wins');
  const fin = court.finish(); ok(fin.winner === 'b' && fin.countsAsWin, 'finish(): winner + countsAsWin (≥2 humans)');
  const solo = G.createCourt(); solo.addPlayer('me'); solo.addPP('me', 10); ok(!solo.finish().countsAsWin, 'solo room never counts as an online win');
  const j = G.createCourt({ roomType: 'joust' }); j.addPlayer('x'); j.addPlayer('y'); let jw = null; j.on('winner', (e) => (jw = e.id));
  j.recordRound('x'); j.recordRound('y'); j.recordRound('x'); j.recordRound('x'); ok(jw === 'x', 'Joust: best of 5 landings');
}

section('pacing: 30-hour career sim (behaviour model, see docs/SCORE.md)');
const pacing = careerSim();
ok(pacing.viscountMin >= 8 && pacing.viscountMin <= 25, `Viscount after ${pacing.viscountMin.toFixed(0)} min (target ~15)`);
ok(pacing.kingHours != null && pacing.kingHours < 30, `King after ${pacing.kingHours?.toFixed(1)} h of play`);
ok(pacing.rankAt30NoWins === 'king', `30 h, 0 wins: ${pacing.rankAt30NoWins} (ladder stops at King)`);
ok(pacing.ppAt30 >= 240000 && pacing.ppAt30 <= 330000, `lifetime PP at 30 h = ${Math.round(pacing.ppAt30)} (Emperor threshold 260k)`);
ok(pacing.emperorHoursWithWins != null && pacing.emperorHoursWithWins >= 22 && pacing.emperorHoursWithWins <= 36, `with wins: Emperor at ${pacing.emperorHoursWithWins?.toFixed(1)} h (target ~30)`);
ok(pacing.emperorBeforeWin10 === false, 'Emperor never before the 10th online win');
if (!QUIET) console.log('  ranks reached (h):', pacing.table.map(([id, h]) => `${id} ${h < 1 ? Math.round(h * 60) + 'm' : h.toFixed(1) + 'h'}`).join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('failures:\n  ' + failures.join('\n  ')); process.exit(1); }

// ---------- pacing model ----------
// One sortie = 5 min of play. A player's crime rate and nerve grow with hours played. Everything is routed through
// createGame (rules, combos, scandals, bounces, banking), so the numbers are the economy's own, not a formula.
function careerSim() {
  const rng = seeded(42);
  const pick = (w) => { let r = rng() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i; return w.length - 1; };
  const CRIMES = [['queue_jump', 3], ['unauth_takeoff', 3], ['cut_in_final', 3], ['forced_goaround', 2], ['runway_steal', 1], ['taxiway_landing', 1], ['grass_landing', 1], ['apron_landing', 0.5], ['tower_buzz', 2], ['terminal_buzz', 1], ['low_pass', 2], ['formation', 1], ['near_miss', 1.5], ['taxi_speeding', 2]];
  const run = (winsAtHour) => {
    const c = G.loadCareer({ storage: memStore() });
    const g = G.createGame({ mode: 'free', protection: 'rubber', career: c, rng, outrageSource: 'internal' });
    const reached = { baron: 0 }; let emperorEarly = false, ppAt30 = 0, rankAt30 = null, wins = 0;
    c.on('rankUp', (u) => { for (let k = u.from + 1; k <= u.to; k++) reached[RANKS[k].id] ??= t / 3600; if (u.rank.id === 'emperor' && c.onlineWins < 10) emperorEarly = true; });
    let t = 0;
    while (t < 40 * 3600) {
      const h = t / 3600;
      while (winsAtHour && wins < 10 && h >= winsAtHour[wins]) { c.addOnlineWin(); wins++; }
      const skill = Math.min(1, 0.3 + h / 8);
      const crimes = Math.max(0, Math.round(1.2 + 1.1 * skill + (rng() - 0.5) * 2));
      const tight = rng() < 0.2 + 0.4 * skill;                // chains crimes inside the combo window
      for (let k = 0; k < crimes; k++) {
        const id = CRIMES[pick(CRIMES.map((x) => x[1]))][0];
        const victimRank = pick(AI_RANK_WEIGHTS);
        g.setPilotRank('ai', victimRank);
        g.handleEvent({ type: id, actor: 'player', victim: 'ai', data: { gap: rng() * 900, dist: 20 + rng() * 60, jumped: 1 + Math.floor(rng() * 2), seconds: 3 + rng() * 8 } });
        g.update(tight ? 5 + rng() * 10 : 25 + rng() * 40, { onGround: false, calm: false });
      }
      if (rng() < 0.15) g.reportImpact({ speedKt: 10 + rng() * 30 });
      if (rng() < 0.15 + 0.15 * skill) g.handleEvent({ type: 'barked', intent: 'retort', source: 'response', reaction: 1 + rng() * 3 });
      g.update(60, { onGround: false, calm: true });
      landAndStop(g, 'runway');
      t += 300;
      if (!rankAt30 && t >= 30 * 3600) { rankAt30 = c.rank.id; ppAt30 = c.lifetimePP; }
    }
    return { reached, emperorEarly, ppAt30, rankAt30 };
  };
  const noWins = run(null);
  const withWins = run([1, 2, 3, 5, 8, 10, 13, 16, 19, 22]);
  return {
    viscountMin: noWins.reached.viscount * 60,
    kingHours: noWins.reached.king, rankAt30NoWins: noWins.rankAt30, ppAt30: noWins.ppAt30,
    emperorHoursWithWins: withWins.reached.emperor, emperorBeforeWin10: withWins.emperorEarly || noWins.reached.emperor != null,
    table: Object.entries(noWins.reached).filter(([id]) => id !== 'baron').concat(withWins.reached.emperor ? [['emperor(10 wins)', withWins.reached.emperor]] : []),
  };
}

// ---------- falsification: break a rule in a scratch copy, the suite must fail ----------
function falsify() {
  const breaks = [
    { name: 'combo window ignored (combo never builds)', file: 'js/game/score.js', from: "S.comboStep = S.comboLeft > 0 ? Math.min(S.comboStep + 1, M.combo.length - 1) : 0;", to: 'S.comboStep = 0;' },
    { name: 'D2 gate removed (Emperor on points alone)', file: 'js/game/career.js', from: 'if (i >= EMPEROR && onlineWins < EMPEROR_MIN_WINS) i = KING;', to: '' },
    { name: 'D4 broken (Emperor ignores career flag)', file: 'js/game/court.js', from: "sorted[0].emperorEarned ? EMPEROR : KING", to: 'true ? KING : EMPEROR' },
    { name: 'partial loss clamp dropped', file: 'js/game/score.js', from: 'return clamp(kt * P.partial.lossPerKt, P.partial.lossMin, P.partial.lossMax);', to: 'return kt * P.partial.lossPerKt;' },
    { name: 'D19 zone ignored (demand anywhere)', file: 'js/game/score.js', from: "if (!zone.ok) return { ok: false, reason: zone.reason || 'Not here' };", to: '' },
    { name: 'D28 light touch never pays', file: 'js/game/score.js', from: "const payTouch = (other, kt) => infraction(", to: 'const payTouch = (other, kt) => 0 && infraction(' },
    { name: 'D28 parked guard dropped', file: 'js/game/score.js', from: ' && S.gsKt >= INFRACTIONS.light_touch.minOwnKt', to: '' },
    { name: 'D28 light-touch speed cap ignored (big hits score)', file: 'js/game/score.js', from: ' && kt <= INFRACTIONS.light_touch.maxRelKt', to: '' },
    { name: 'D30 close-call window ignored', file: 'js/game/score.js', from: 'if (S.t - (S.closeAt[victim] ?? -1e9) < CLOSE_CALL.pairCooldown) return false;', to: '' },
    { name: 'D30 window only per id (near miss + touch both pay)', file: 'js/game/score.js', from: 'S.closeAt[victim]', to: 'S.closeAt[id + victim]', all: true },
    { name: 'D30 window 30 s instead of 60', file: 'data/rules.js', from: 'pairCooldown: 60', to: 'pairCooldown: 30' },
    { name: 'D28 Hard rewards a Rubber bounce', file: 'data/rules.js', from: "targetMult: 1.3, contact: 'survived'", to: "targetMult: 1.3, contact: 'glancing'" },
    { name: 'D30 Hard pays before survival is known', file: 'js/game/score.js', from: "S.touchWait = { other, kt, left: INFRACTIONS.light_touch.surviveSecs };", to: 'payTouch(other, kt);' },
    { name: 'D30 destroyed does not cancel the pending close call', file: 'js/game/score.js', from: 'S.stats.crashes++; S.touchWait = null;', to: 'S.stats.crashes++;' },
    { name: 'D30 still shown as Love Tap', file: 'data/rules.js', from: "name: 'Close Call',", to: "name: 'Love Tap'," },
    { name: 'goaroundrefused not scored', file: 'js/game/score.js', from: "else if (ev.type === 'goaroundrefused' && (ev.actor == null || mine(ev))) ignoredGoAround(ev, true);", to: '' },
    { name: 'go-around paid twice (no dedupe)', file: 'js/game/score.js', from: 'if (S.t - S.gaIgnoredAt < INFRACTIONS.ignored_instruction.refusedWindow) return;', to: '' },
    { name: 'D19 hard accepts runways', file: 'js/game/finish.js', from: 'const ok = atSpot || (onApron(x, z) && nearStand(x, z));', to: 'const ok = true;' },
  ];
  let allCaught = true;
  for (const b of breaks) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krz-falsify-'));
    for (const d of ['js/game', 'data']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'js/world'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'js/world/layout.js'), path.join(tmp, 'js/world/layout.js'));
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
    const f = path.join(tmp, b.file); const src = fs.readFileSync(f, 'utf8');
    if (!src.includes(b.from)) { console.log(`BREAK NOT APPLIED: ${b.name}`); allCaught = false; continue; }
    fs.writeFileSync(f, b.all ? src.split(b.from).join(b.to) : src.replace(b.from, b.to));
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--quiet'], { env: { ...process.env, KRZ_ROOT: tmp }, encoding: 'utf8' });
    const caught = r.status !== 0;
    allCaught &&= caught;
    const fails = (r.stdout.match(/^ {2}FAIL .*/gm) || []).slice(0, 3).map((s) => s.trim());
    console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${b.name}\n        ${fails.join('\n        ')}`);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(allCaught ? '\nfalsification: every break was caught' : '\nfalsification: SOME BREAKS WERE MISSED');
  if (!allCaught) process.exit(1);
}
