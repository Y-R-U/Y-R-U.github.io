// node tools/sim_test.mjs [--matches=N] [--map=stub|real|both] [--break=determinism|nan|stuck|leak|events|distribution|jitter|league|restore|remote] [--quiet]
import { createSim, SIM_DT, stateHash } from '../js/sim/sim.js';
import { createBots } from '../js/sim/bots.js';
import { makePlayers } from '../js/sim/match.js';
import { generateMap as stubMap } from './stub_map.js';
import { buildRoster } from '../js/meta/roster.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const MATCHES = +(args.matches || 24);
const BREAK = args.break || '';
const quiet = !!args.quiet;
const SET = {};
for (const kv of String(args.set || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); SET[k] = +v; }

let realMap = null;
try { realMap = (await import('../js/world/map.js')).generateMap; } catch (e) { if (args.map === 'real') throw e; }
const mapMode = args.map || (realMap ? 'both' : 'stub');
const mapSets = [];
if (mapMode === 'stub' || mapMode === 'both') mapSets.push(['stub', stubMap]);
if ((mapMode === 'real' || mapMode === 'both') && realMap) mapSets.push(['real', realMap]);

const failures = [];
const fail = (msg) => { failures.push(msg); };
const EVENT_TYPES = ['recruit', 'steal', 'elim', 'respawn', 'pickup', 'lead', 'phase'];

function runMatch(seed, genMap, opts = {}) {
  const map = genMap(seed);
  const roster = opts.rating != null ? buildRoster({ seed, rating: opts.rating }) : null;
  if (roster && BREAK === 'league') roster.forEach((r) => { r.throttle = 1; r.skill = 0.6; r.aggr = 1; });
  const { players, botIndices, botSpecs } = makePlayers({ seed, allBots: true, roster });
  const config = { ...SET };
  if (BREAK === 'nan') config.radiusK = NaN;
  if (BREAK === 'stuck') config.speedBase = 0.15;
  if (BREAK === 'events') config.pickupCount = 0;
  if (BREAK === 'distribution') { config.neutralStart = 0; config.neutralRespawn = 0; }
  const sim = createSim({ seed, map, players, config });
  const bots = createBots({ sim, indices: botIndices, specs: botSpecs, seed });
  const S = sim.state, nc = S.crowds.length;
  const seen = new Set();
  const stats = { elims: 0, leads: 0, steals: 0, recruits: 0, pickups: 0, neutralsMin: Infinity, arc: [], neutralsSum: 0, samples: 0 };
  const stuckSecs = new Array(nc).fill(0);
  const winPos = S.crowds.map((c) => ({ x: c.x, z: c.z, t: 0, aliveFor: 0 }));
  const turn = new Array(nc).fill(0), lastIn = S.crowds.map(() => null);
  let nanAt = -1, leakAt = -1, midHash = '';
  const prev = new Int32Array(nc);
  const total = SIM_DT;
  const steps = Math.round((S.duration + 3.5) / total);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < nc; i++) prev[i] = S.crowds[i].count;
    bots.update();
    if (opts.perturb && S.tick === 500) sim.setInput(0, Math.random(), Math.random());
    if (BREAK === 'jitter' && S.tick % 2) { const c = S.crowds[3]; sim.setInput(3, -c.ix, -c.iz); }
    for (const c of S.crowds) {
      if (!c.alive || S.phase !== 'play') { lastIn[c.index] = null; continue; }
      const a = Math.atan2(c.ix, c.iz), l = lastIn[c.index];
      if (l !== null) { let d = a - l; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; turn[c.index] += Math.abs(d); }
      lastIn[c.index] = a;
    }
    sim.step();
    if (BREAK === 'leak' && S.tick === 900) S.crowds[2].count += 1;
    const ev = sim.drainEvents();
    const delta = new Int32Array(nc);
    for (const e of ev) {
      seen.add(e.type);
      if (e.type === 'recruit') { delta[e.crowd] += e.n; stats.recruits++; }
      else if (e.type === 'steal') { delta[e.from] -= e.n; delta[e.to] += e.n; stats.steals++; if (e.n <= 0) fail(`seed ${seed}: steal with n=${e.n}`); }
      else if (e.type === 'respawn') delta[e.crowd] += e.count;
      else if (e.type === 'elim') stats.elims++;
      else if (e.type === 'lead') stats.leads++;
      else if (e.type === 'pickup') stats.pickups++;
    }
    for (let i = 0; i < nc; i++) {
      const c = S.crowds[i];
      if (leakAt < 0 && c.count !== prev[i] + delta[i]) leakAt = S.tick;
      if (c.alive && c.count < 1 && leakAt < 0) leakAt = S.tick;
    }
    if (nanAt < 0 && S.tick % 15 === 0) {
      for (const c of S.crowds) if (![c.x, c.z, c.vx, c.vz, c.count, c.radius, c.heading].every(Number.isFinite)) nanAt = S.tick;
      const N = S.neutrals;
      for (let i = 0; i < N.cap; i++) if (N.state[i] && !(Number.isFinite(N.x[i]) && Number.isFinite(N.z[i]))) { nanAt = S.tick; break; }
    }
    if (S.tick % 30 === 0) {
      stats.neutralsMin = Math.min(stats.neutralsMin, S.neutrals.active);
      stats.neutralsSum += S.neutrals.active; stats.samples++;
      for (const c of S.crowds) {
        const w = winPos[c.index];
        if (S.phase === 'play' && c.alive && c.protect === 0 && w.aliveFor >= 1 && Math.hypot(c.x - w.x, c.z - w.z) < 0.5) stuckSecs[c.index]++;
        w.aliveFor = c.alive ? w.aliveFor + 1 : 0;
        w.x = c.x; w.z = c.z;
      }
    }
    if (S.tick === 1800) midHash = stateHash(S);
    if (S.phase === 'play' && S.tick % 600 === 0) {
      const cs = S.crowds.map((c) => c.count).sort((x, y) => y - x);
      stats.arc.push([Math.round(S.duration - S.timeLeft), cs[0], cs[1], cs[3], cs[7]]);
    }
  }
  const playTicks = S.duration / SIM_DT;
  return {
    seed, S, stats, seen, nanAt, leakAt, midHash, hash: stateHash(S), stuckSecs,
    turnRate: turn.map((t) => t / (playTicks * SIM_DT) * 180 / Math.PI),
    players,
  };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pad = (v, n) => String(v).padStart(n);

const t0 = Date.now();
for (const [mapName, genMap] of mapSets) {
  const tag = `[${mapName}]`;
  const a = runMatch(7, genMap), b = runMatch(7, genMap, { perturb: BREAK === 'determinism' });
  if (a.hash !== b.hash || a.midHash !== b.midHash) fail(`${tag} determinism: seed 7 hashes differ (${a.midHash}/${a.hash} vs ${b.midHash}/${b.hash})`);

  const results = [];
  for (let m = 0; m < MATCHES; m++) results.push(runMatch(1000 + m * 17, genMap));

  const seen = new Set();
  const byPersona = {};
  const winners = [], allFinals = [], elims = [], leads = [], spreads = [];
  let maxStuck = 0, maxStuckWho = '', minTravel = Infinity, minTravelWho = '', maxTurn = 0, maxTurnWho = '';
  for (const r of results) {
    r.seen.forEach((t) => seen.add(t));
    if (r.nanAt >= 0) fail(`${tag} seed ${r.seed}: NaN at tick ${r.nanAt}`);
    if (r.leakAt >= 0) fail(`${tag} seed ${r.seed}: count not conserved at tick ${r.leakAt}`);
    const finals = r.S.crowds.map((c) => c.count);
    winners.push(Math.max(...finals));
    finals.forEach((f) => allFinals.push(f));
    elims.push(r.stats.elims); leads.push(r.stats.leads);
    spreads.push(Math.max(...finals) - Math.min(...finals));
    r.S.crowds.forEach((c, i) => {
      const p = r.players[i].persona + (i === 0 ? '*' : '');
      const e = byPersona[p] || (byPersona[p] = { finals: [], best: [], kills: [], deaths: [], wins: 0, travel: [], stuck: [], turn: [], rec: [], stole: [] });
      e.finals.push(c.count); e.best.push(c.best); e.kills.push(c.kills); e.deaths.push(c.deaths);
      e.travel.push(c.travelled); e.rec.push(c.recruited); e.stole.push(c.stolen); e.stuck.push(r.stuckSecs[i]); e.turn.push(r.turnRate[i]);
      if (c.rank === 1) e.wins++;
      if (r.stuckSecs[i] > maxStuck) { maxStuck = r.stuckSecs[i]; maxStuckWho = `${p} seed ${r.seed}`; }
      if (c.travelled < minTravel) { minTravel = c.travelled; minTravelWho = `${p} seed ${r.seed}`; }
      if (r.turnRate[i] > maxTurn) { maxTurn = r.turnRate[i]; maxTurnWho = `${p} seed ${r.seed}`; }
    });
    if (r.stats.neutralsMin < r.S.neutrals.cap * 0.25) fail(`${tag} seed ${r.seed}: city emptied (min ${r.stats.neutralsMin} pedestrians)`);
  }
  for (const t of EVENT_TYPES) if (!seen.has(t)) fail(`${tag} event type '${t}' never occurred`);
  if (maxStuck > 6) fail(`${tag} a crowd was stationary ${maxStuck}s (${maxStuckWho})`);
  if (minTravel < 300) fail(`${tag} a crowd travelled only ${minTravel.toFixed(0)} m (${minTravelWho})`);
  if (maxTurn > 120) fail(`${tag} jittery steering: ${maxTurn.toFixed(0)} deg/s mean turn (${maxTurnWho})`);
  const wMed = median(winners);
  if (wMed < 300 || wMed > 2500) fail(`${tag} median winning count ${wMed} outside 300..2500`);
  if (Math.min(...winners) < 120) fail(`${tag} a match was won with only ${Math.min(...winners)}`);
  if (mean(elims) < 1) fail(`${tag} fewer than 1 elimination per match (${mean(elims).toFixed(2)})`);
  if (mean(leads) < 1) fail(`${tag} fewer than 1 lead change per match`);

  if (!quiet) {
    console.log(`\n${tag} ${MATCHES} matches  (determinism hash ${a.hash})`);
    console.log('persona        mean  median  best  kills deaths  wins  travel  stuck  turn°/s  recruit  stolen');
    for (const [p, e] of Object.entries(byPersona).sort((x, y) => mean(y[1].finals) - mean(x[1].finals))) {
      console.log(`${p.padEnd(13)}${pad(mean(e.finals).toFixed(0), 6)}${pad(median(e.finals), 8)}${pad(mean(e.best).toFixed(0), 6)}${pad(mean(e.kills).toFixed(1), 7)}${pad(mean(e.deaths).toFixed(1), 7)}${pad(e.wins, 6)}${pad(mean(e.travel).toFixed(0), 8)}${pad(Math.max(...e.stuck), 7)}${pad(mean(e.turn).toFixed(0), 9)}${pad(mean(e.rec).toFixed(0), 9)}${pad(mean(e.stole).toFixed(0), 8)}`);
    }
    const wr = results.map((r) => r.S.crowds.find((c) => c.rank === 1));
    console.log(`winner sources: recruited ${mean(wr.map((c) => c.recruited)).toFixed(0)}  stolen ${mean(wr.map((c) => c.stolen)).toFixed(0)}  lost ${mean(wr.map((c) => c.lost)).toFixed(0)}`);
    console.log(`winner   mean ${mean(winners).toFixed(0)}  median ${wMed}  min ${Math.min(...winners)}  max ${Math.max(...winners)}`);
    console.log(`all      median ${median(allFinals)}  p10 ${allFinals.slice().sort((x, y) => x - y)[Math.floor(allFinals.length * 0.1)]}  p90 ${allFinals.slice().sort((x, y) => x - y)[Math.floor(allFinals.length * 0.9)]}`);
    console.log(`per match: elims ${mean(elims).toFixed(1)}  lead changes ${mean(leads).toFixed(1)}  steals ${mean(results.map((r) => r.stats.steals)).toFixed(0)}  pickups ${mean(results.map((r) => r.stats.pickups)).toFixed(1)}  pedestrians avg ${mean(results.map((r) => r.stats.neutralsSum / r.stats.samples)).toFixed(0)}`);
    console.log(`worst: stuck ${maxStuck}s (${maxStuckWho}), least travel ${minTravel.toFixed(0)} m (${minTravelWho}), max turn ${maxTurn.toFixed(0)}°/s (${maxTurnWho})`);
    const arcRows = results[0].stats.arc.map((row, k) => [row[0], ...[1, 2, 3, 4].map((j) => mean(results.map((r) => (r.stats.arc[k] || row)[j])).toFixed(0))]);
    console.log('arc (mean count by rank): ' + arcRows.map((r) => `${r[0]}s ${r[1]}/${r[2]}/${r[3]}/${r[4]}`).join('  '));
  }
}
// sim-online rosters: league-scaled skill/aggression and the human-feeling bots must not get stuck or jitter.
{
  const [mapName, genMap] = mapSets[mapSets.length - 1];
  const rows = [], places = {};
  for (const [label, rating] of [['Bronze', 0], ['Diamond', 1300], ['Legend', 4000]]) {
    const rs = [];
    for (let m = 0; m < Math.max(4, MATCHES >> 2); m++) rs.push(runMatch(5000 + m * 31, genMap, { rating }));
    let place = 0, winner = 0;
    for (const r of rs) {
      place += r.S.crowds[0].rank; winner += Math.max(...r.S.crowds.map((c) => c.count));
      r.S.crowds.forEach((c, i) => {
        const who = `${label} ${r.players[i].humanish ? 'human-ish ' : ''}${r.players[i].persona} seed ${r.seed}`;
        if (r.stuckSecs[i] > 6) fail(`[${mapName}] online: ${who} stationary ${r.stuckSecs[i]}s`);
        if (c.travelled < 300) fail(`[${mapName}] online: ${who} travelled only ${c.travelled.toFixed(0)} m`);
        if (r.turnRate[i] > 120) fail(`[${mapName}] online: ${who} jitter ${r.turnRate[i].toFixed(0)} deg/s`);
      });
      if (r.leakAt >= 0 || r.nanAt >= 0) fail(`[${mapName}] online ${label} seed ${r.seed}: leak/NaN`);
    }
    places[label] = place / rs.length;
    rows.push(`${label.padEnd(8)} auto-player mean place ${(place / rs.length).toFixed(2)}  winner mean ${(winner / rs.length).toFixed(0)}`);
  }
  if (places.Legend - places.Bronze < 1) fail(`[${mapName}] leagues are not a difficulty curve: the auto-player places ${places.Bronze.toFixed(2)} in Bronze and ${places.Legend.toFixed(2)} in Legend`);
  if (!quiet) console.log(`\n[${mapName}] sim-online rosters (crowd 0 = the ?auto=1 bot, skill 0.8):\n  ` + rows.join('\n  '));
}

// Online (M3): serialize → restore continues exactly; a state-only restore (host migration) carries on with
// the same counts; a remote-steered crowd is never driven by its bot.
{
  const [mapName, genMap] = mapSets[mapSets.length - 1];
  const tag = `[${mapName}] online`;
  const seed = 77, map = genMap(seed);
  const { players, botIndices, botSpecs } = makePlayers({ seed, allBots: true });
  const A = createSim({ seed, map, players });
  const botsA = createBots({ sim: A, indices: botIndices, specs: botSpecs, seed });
  for (let i = 0; i < 1500; i++) { botsA.update(); A.step(); A.drainEvents(); }
  const snap = JSON.parse(JSON.stringify(A.serialize()));
  if (BREAK === 'restore') delete snap.rng;
  const B = createSim({ seed, map, players, restore: snap });
  if (stateHash(B.state) !== stateHash(A.state)) fail(`${tag}: restored state hash differs at once (${stateHash(A.state)} vs ${stateHash(B.state)})`);
  while (A.state.phase !== 'over') {
    botsA.update();
    for (const c of A.state.crowds) B.setInput(c.index, c.ix, c.iz);
    A.step(); B.step(); A.drainEvents(); B.drainEvents();
  }
  if (stateHash(B.state) !== stateHash(A.state)) fail(`${tag}: serialize/restore did not continue exactly (${stateHash(A.state)} vs ${stateHash(B.state)})`);

  // Partial restore: only what a guest's mirror has (contract fields, no RNG, no wander targets).
  const S0 = createSim({ seed, map, players });
  const bots0 = createBots({ sim: S0, indices: botIndices, specs: botSpecs, seed });
  for (let i = 0; i < 1800; i++) { bots0.update(); S0.step(); S0.drainEvents(); }
  const N = S0.state.neutrals;
  const mirror = {
    tick: S0.state.tick, time: S0.state.time, timeLeft: S0.state.timeLeft, countdownLeft: 0, phase: S0.state.phase, leader: S0.state.leader, leadChanges: S0.state.leadChanges,
    crowds: S0.state.crowds.map((c) => ({ alive: c.alive, x: c.x, z: c.z, vx: c.vx, vz: c.vz, heading: c.heading, count: c.count, radius: c.radius, kills: c.kills, best: c.best,
      rank: c.rank, protect: c.protect, respawnIn: c.respawnIn, eating: c.eating, panic: c.panic, recruited: c.recruited, stolen: c.stolen, lost: c.lost, deaths: c.deaths, fx: { ...c.fx } })),
    neutrals: { x: N.x.slice(), z: N.z.slice(), heading: N.heading.slice(), state: N.state.slice(), target: N.target.slice(), look: N.look.slice() },
    pickups: S0.state.pickups.map((p) => ({ ...p })),
  };
  const P = createSim({ seed, map, players, restore: mirror });
  const countsBefore = S0.state.crowds.map((c) => c.count).join(',');
  if (P.state.crowds.map((c) => c.count).join(',') !== countsBefore) fail(`${tag}: partial restore changed counts`);
  if (P.state.neutrals.active !== N.active) fail(`${tag}: partial restore has ${P.state.neutrals.active} pedestrians, source ${N.active}`);
  if (P.state.tick !== S0.state.tick) fail(`${tag}: partial restore lost the tick`);
  const botsP = createBots({ sim: P, indices: botIndices, specs: botSpecs, seed: seed + 1 });
  const prevP = new Int32Array(8);
  let leakP = -1, jumps = 0;
  const lastX = P.state.crowds.map((c) => [c.x, c.z]);
  while (P.state.phase !== 'over') {
    P.state.crowds.forEach((c, i) => { prevP[i] = c.count; });
    botsP.update(); P.step();
    const d = new Int32Array(8);
    for (const e of P.drainEvents()) {
      if (e.type === 'recruit') d[e.crowd] += e.n; else if (e.type === 'steal') { d[e.from] -= e.n; d[e.to] += e.n; } else if (e.type === 'respawn') d[e.crowd] += e.count;
    }
    P.state.crowds.forEach((c, i) => {
      if (leakP < 0 && c.count !== prevP[i] + d[i]) leakP = P.state.tick;
      if (c.alive && Math.hypot(c.x - lastX[i][0], c.z - lastX[i][1]) > 1.5) jumps++;
      lastX[i] = [c.x, c.z];
    });
  }
  if (leakP >= 0) fail(`${tag}: partial-restore match leaked people at tick ${leakP}`);
  if (jumps > 8) fail(`${tag}: partial-restore leaders jumped ${jumps} times (more than the respawns)`);

  // Remote crowd: its bot is switched off; the input set from outside must survive bots.update().
  const R = createSim({ seed, map, players });
  const botsR = createBots({ sim: R, indices: [0, 1, 2, 3, 4, 5, 6, 7], specs: botSpecs.concat([{ persona: 'collector', skill: 0.6 }]), seed });
  R.setRemote(3, true, 'Remote');
  if (BREAK !== 'remote') botsR.setEnabled(3, false);
  let overridden = 0;
  for (let i = 0; i < 600; i++) {
    R.setInput(3, 0.6, -0.8);
    botsR.update();
    if (R.state.phase === 'play' && (Math.abs(R.state.crowds[3].ix - 0.6) > 1e-9 || Math.abs(R.state.crowds[3].iz + 0.8) > 1e-9)) overridden++;
    R.step(); R.drainEvents();
  }
  if (overridden) fail(`${tag}: a remote crowd's input was overwritten by its bot on ${overridden} ticks`);
  if (R.state.crowds[3].name !== 'Remote' || !R.state.crowds[3].remote) fail(`${tag}: setRemote did not mark the crowd`);
  botsR.setEnabled(3, true);
  for (let i = 0; i < 120; i++) { R.setInput(3, 0.6, -0.8); botsR.update(); R.step(); R.drainEvents(); }
  if (Math.abs(R.state.crowds[3].ix - 0.6) < 1e-9 && Math.abs(R.state.crowds[3].iz + 0.8) < 1e-9) fail(`${tag}: re-enabled bot (autopilot) did not take the crowd back`);
  if (!quiet) console.log(`\n${tag}: serialize/restore exact, partial restore conserved (jumps ${jumps}), remote crowd untouched by its bot`);
}

console.log(`\n${failures.length ? 'FAIL' : 'PASS'} in ${((Date.now() - t0) / 1000).toFixed(1)}s${BREAK ? ` (break=${BREAK})` : ''}`);
for (const f of failures) console.log('  - ' + f);
process.exit(failures.length ? 1 : 0);
