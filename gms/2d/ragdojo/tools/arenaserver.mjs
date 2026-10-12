#!/usr/bin/env node
/**
 * The arena server binary, driven by two simulated clients over real WebSockets:
 * lobby -> challenge -> offer (TURN only now) -> accept -> 3 rounds with the master rule
 * (coin flip, swap, round 3 to the round-2 loser) -> agreed result -> stats on the board.
 * Then: a disagreement is void and uncounted; a rage-quit mid-match is a counted forfeit.
 *
 *   node tools/arenaserver.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT } from './cdp.mjs';

const log = (m) => process.stderr.write(m + '\n');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const tmp = mkdtempSync(join(tmpdir(), 'arenaserver-'));
const bin = join(tmp, 'arena');
execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), stdio: 'inherit' });

// A stand-in for snakenet's loopback /ice, so we can see who gets the TURN credential.
const ice = createServer((q, r) => r.end(JSON.stringify({ iceServers: [{ urls: ['stun:x'] }, { urls: ['turn:x'], username: 'u', credential: 'TURNSECRET' }], turn: true, refreshSeconds: 3600 })));
const PORT = +(process.env.ARENA_TEST_PORT || 9320);
await new Promise((r) => ice.listen(PORT + 1, '127.0.0.1', r));
const server = spawn(bin, [], { env: { ...process.env, ARENA_ADDR: `127.0.0.1:${PORT}`, ARENA_DB: join(tmp, 'a.db'),
  ARENA_ICE_URL: `http://127.0.0.1:${PORT + 1}/ice`, ARENA_ALLOWANCE_URL: 'off', ARENA_DEV_AUTH: '1', ARENA_EARLY_FF_MS: '0' }, stdio: 'ignore' });
const base = `http://127.0.0.1:${PORT}/gms/2d/ragdojo/arena`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch {} await sleep(100); }

class Sim {
  constructor(name, tok) { this.name = name; this.tok = tok; this.q = []; this.waiters = []; this.raw = []; }
  async open() {
    this.ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      this.raw.push(e.data);
      if (m.t === 'p') { this.send({ t: 'q', s: m.s }); return; }
      this.q.push(m);
      this.waiters.forEach((w) => w());
    };
    this.id = (await this.next('welcome')).id;
    this.send({ t: 'hello', name: this.name, tok: this.tok, tz: 'Australia/Sydney', loadout: [0, 1] });
    await this.next('me');
    return this;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async next(t, ms = 4000) {
    const until = Date.now() + ms;
    for (;;) {
      const i = this.q.findIndex((m) => m.t === t);
      if (i >= 0) return this.q.splice(i, 1)[0];
      if (Date.now() > until) throw new Error(`${this.name}: no ${t}`);
      await new Promise((r) => { this.waiters.push(r); setTimeout(r, 100); });
      this.waiters = [];
    }
  }
}

async function matchUp(a, b) {
  a.send({ t: 'wait', type: 'duel' });
  b.send({ t: 'lobby', on: true });
  let l;
  for (let i = 0; i < 10; i++) { l = await b.next('lobby'); if (l.players.some((p) => p.id === a.id)) break; }
  const seen = l.players.find((p) => p.id === a.id);
  ok('the lobby lists the waiting player with a ping estimate', seen && seen.est > 0 && seen.type === 'duel', JSON.stringify(seen));
  b.send({ t: 'challenge', to: a.id });
  const [oa, ob] = [await a.next('offer'), await b.next('offer')];
  return [oa, ob];
}

try {
  const a = await new Sim('Alice', 'dev:alice').open();
  const b = await new Sim('Bob', 'dev:bob').open();
  const x = await new Sim('Nosy', 'dev:nosy').open();
  x.send({ t: 'lobby', on: true });
  const [oa, ob] = await matchUp(a, b);
  ok('matched players get the TURN credential', JSON.stringify(oa.ice).includes('TURNSECRET') && JSON.stringify(ob.ice).includes('TURNSECRET'));
  await sleep(200);
  ok('nobody else ever sees it', !x.raw.some((r) => r.includes('TURNSECRET')) && !a.raw.find((r) => r.includes('"welcome"')).includes('TURNSECRET'));
  const id = oa.match;
  a.send({ t: 'accept', match: id, tok: 'dev:alice' });
  b.send({ t: 'accept', match: id, tok: 'dev:bob' });

  let ga = await a.next('go'), gb = await b.next('go');
  ok('round 1 starts with a coin-flip master both agree on', ga.round === 1 && ga.master === gb.master && [0, 1].includes(ga.master));
  const m1 = ga.master;
  const report = (round, winner, ko) => { for (const c of [a, b]) c.send({ t: 'round', match: id, round, winner, ko }); };
  report(1, m1, true);
  ga = await a.next('go'); await b.next('go');
  ok('round 2 swaps the master', ga.round === 2 && ga.master === 1 - m1, `r1 ${m1} r2 ${ga.master}`);
  report(2, 1 - m1, false);   // the round-1 master loses round 2: 1-1
  ga = await a.next('go'); await b.next('go');
  ok('round 3 goes to the player who lost round 2', ga.round === 3 && ga.master === m1, `r3 ${ga.master}`);
  report(3, 0, true);
  const [ra, rb] = [await a.next('result'), await b.next('result')];
  ok('both get the agreed result', ra.winner === 0 && rb.winner === 0 && ra.score.join() === '2,1');
  ok('the winner\'s stats count it', ra.stats?.wins === 1 && ra.stats?.battles === 1, JSON.stringify(ra.stats));
  ok('the loser\'s too', rb.stats?.losses === 1 && rb.stats?.wins === 0);
  const lb = await (await fetch(base + '/leaderboard?board=wins')).json();
  ok('leaderboard: Alice on top, no uids', lb.rows[0]?.name === 'Alice' && !JSON.stringify(lb).includes('alice'), JSON.stringify(lb.rows));
  const up = await fetch(base + '/ghost', { method: 'POST', headers: { Authorization: 'Bearer dev:alice' },
    body: JSON.stringify({ name: 'Alice', snap: { v: 1, t: 'light', p: { hp: 2 }, m: { power: [1, 0] } } }) });
  const ghosts = await (await fetch(base + '/ghosts')).json();
  const own = await (await fetch(base + '/ghosts', { headers: { Authorization: 'Bearer dev:alice' } })).json();
  ok('ghosts: an uploaded loadout is listed with its record, never to its owner', up.ok && ghosts.ghosts.length === 1 &&
    ghosts.ghosts[0].name === 'Alice' && ghosts.ghosts[0].wins === 1 && ghosts.ghosts[0].snap.m.power.join() === '1,0' && own.ghosts.length === 0, JSON.stringify(ghosts));

  // A mismatch is void and counts for nobody.
  for (const c of [a, b]) c.send({ t: 'leave' });
  const [o2] = await matchUp(a, b);
  a.send({ t: 'accept', match: o2.match, tok: 'dev:alice' }); b.send({ t: 'accept', match: o2.match, tok: 'dev:bob' });
  await a.next('go'); await b.next('go');
  a.send({ t: 'round', match: o2.match, round: 1, winner: 0, ko: true });
  b.send({ t: 'round', match: o2.match, round: 1, winner: 1, ko: true });
  const v = await a.next('void');
  ok('disagreeing reports void the match', v.why === 'disagree');
  const lb2 = await (await fetch(base + '/leaderboard?board=battles')).json();
  ok('a void counts for nobody', lb2.rows.every((r) => r.value === 1));

  // Rage-quit while losing: the result stands, as a forfeit.
  const [o3] = await matchUp(a, b);
  a.send({ t: 'accept', match: o3.match, tok: 'dev:alice' }); b.send({ t: 'accept', match: o3.match, tok: 'dev:bob' });
  await a.next('go'); await b.next('go');
  for (const c of [a, b]) c.send({ t: 'round', match: o3.match, round: 1, winner: 0, ko: true });
  await a.next('go'); await b.next('go');
  b.send({ t: 'leave' });
  const f = await a.next('result');
  ok('a rage-quit is a counted forfeit win for the one who stayed', f.forfeit === true && f.winner === 0 && f.stats?.wins === 2, JSON.stringify(f.stats));

  const st = await (await fetch(`http://127.0.0.1:${PORT}/internal/stats`)).json();
  ok('internal stats answer on loopback', st.app === 'ragdojo-arena' && st.db.matches === 3 && st.db.voided === 1, JSON.stringify(st.db));
  const fwd = await fetch(`http://127.0.0.1:${PORT}/internal/stats`, { headers: { 'X-Forwarded-For': '1.2.3.4' } });
  ok('internal stats 404 when forwarded', fwd.status === 404);
} catch (e) {
  ok('gate ran', false, e.stack);
}
log(`\n${pass} passed, ${fail} failed`);
server.kill('SIGKILL'); ice.close(); rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
