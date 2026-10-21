// node gms/3d/krayzee/server/test.mjs — builds the prototype, runs it on a local port, checks the room rules.
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const bin = join(tmpdir(), 'krayzeenet-test');
const PORT = 8718, GRACE = 600;
execFileSync('go', ['build', '-o', bin, '.'], { cwd: dir, stdio: 'inherit' });
const srv = spawn(bin, [], { env: { ...process.env, KRAYZEE_ADDR: `127.0.0.1:${PORT}`, KRAYZEE_GRACE_MS: String(GRACE) }, stdio: 'ignore' });
const URL = `ws://127.0.0.1:${PORT}/gms/3d/krayzee/net/ws`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

class P {
  static async open(name, voices, q = '') {
    const p = new P();
    p.name = name; p.inbox = [];
    p.ws = new WebSocket(URL + q, { headers: { origin: 'http://localhost:8888' } });
    p.ws.onmessage = e => p.inbox.push(JSON.parse(e.data));
    await new Promise((res, rej) => { p.ws.onopen = res; p.ws.onerror = rej; });
    const w = await p.next('welcome');
    p.id = w.id; p.tok = w.tok;
    p.send({ t: 'hello', name, voices });
    return p;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async next(t, pred = () => true, ms = 2000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = this.inbox.findIndex(m => m.t === t && pred(m));
      if (i >= 0) return this.inbox.splice(i, 1)[0];
      await sleep(10);
    }
    return null;
  }
  async room(pred = () => true, ms) { const m = await this.next('room', m => pred(m.room), ms); return m && m.room; }
  drain() { this.inbox = []; }
}
const voiceOf = (room, p) => room.members.find(m => m.id === p.id)?.voice;

try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/gms/3d/krayzee/net/health`); break; } catch { await sleep(100); } }

  const A = await P.open('Baron Dirk', ['toff', 'bubba']);
  A.send({ t: 'create', name: 'Dirk Air', set: { type: 'strict', protection: 'partial', partialStart: 60, maxPlayers: 3, aircraft: ['C172', 'light', '<x>'], traffic: 'warp' } });
  let r = await A.room();
  ok(r && r.host === A.id, 'creator hosts');
  ok(r && voiceOf(r, A) === 'toff', 'creator gets first preferred voice');
  ok(r && r.set.partialStart === 100 && r.set.traffic === 'busy' && r.set.maxPlayers === 3 && r.set.type === 'strict' && r.set.voices === 'first_come', 'settings clamped');
  ok(r && JSON.stringify(r.set.aircraft) === '["c172","light"]', 'aircraft ids cleaned');

  const B = await P.open('Lady Mo', ['toff', 'duchess']);
  B.send({ t: 'list' });
  const list = await B.next('rooms');
  ok(list && list.rooms.length === 1 && !list.rooms[0].code, 'public room listed without its code');
  B.send({ t: 'join', id: r.id });
  r = await B.room(x => x.n === 2);
  ok(r && voiceOf(r, B) === 'duchess', 'taken voice falls back to next preference');

  const C = await P.open('Nan', ['nan']);
  C.send({ t: 'join', code: r.code.toLowerCase() });
  r = await C.room(x => x.n === 3);
  ok(r && voiceOf(r, C) === 'nan', 'join by code (case-insensitive)');
  const calls = r.members.map(m => m.call);
  ok(new Set(calls).size === 3 && calls.every(n => n >= 11 && n <= 99 && n % 10), 'callsign numbers unique, 11-99');
  const D = await P.open('Late', ['nan']);
  D.send({ t: 'join', code: r.code });
  ok((await D.next('err'))?.code === 'full', 'maxPlayers enforced');

  B.drain(); C.drain();
  B.send({ t: 'claim', voice: 'tex' }); C.send({ t: 'claim', voice: 'tex' });
  const cb = await B.next('claim'), cc = await C.next('claim');
  ok(cb && cc && cb.ok !== cc.ok, 'simultaneous claim: exactly one wins');
  const loser = cb.ok ? cc : cb, winner = cb.ok ? B : C;
  ok(loser.by === winner.id, 'loser is told who holds it');
  B.send({ t: 'claim', voice: 'toff' });
  ok((await B.next('claim'))?.ok === false, 'cannot take the host\'s voice');

  B.drain(); C.drain();
  A.send({ t: 'rl', d: { k: 'bark', id: 'cutin_03' } });
  const gb = await B.next('rl'), gc = await C.next('rl');
  ok(gb?.from === A.id && gc?.d?.id === 'cutin_03', 'relay to whole room');
  A.send({ t: 'rl', to: C.id, d: { k: 'x' } });
  ok(!(await B.next('rl', () => true, 300)) && (await C.next('rl'))?.d?.k === 'x', 'relay to one member only');

  const E = await P.open('Hidden', []);
  E.send({ t: 'create', priv: true, set: {} });
  const er = await E.room();
  D.send({ t: 'list' });
  ok((await D.next('rooms'))?.rooms.every(x => x.id !== er.id), 'private room not listed');
  D.send({ t: 'join', code: er.code });
  ok((await D.room(x => x.id === er.id))?.n === 2, 'private room joinable by code');
  E.send({ t: 'set', set: { voices: 'duplicates_allowed' } });
  await D.room(x => x.set.voices === 'duplicates_allowed');
  D.send({ t: 'claim', voice: voiceOf(await E.room(x => x.set.voices === 'duplicates_allowed'), E) });
  ok((await D.next('claim'))?.ok === true, 'duplicates_allowed lets two share a voice');
  await sleep(100); E.drain();
  D.send({ t: 'set', set: { voices: 'first_come' } });
  ok(!(await E.room(x => x.set.voices === 'first_come', 300)), 'only the host can change room options');

  // Host drops (not a goodbye): role moves at once, seat + voice held for the grace.
  B.drain();
  const epoch = r.epoch;
  A.ws.close(4000);
  r = await B.room(x => x.host !== A.id);
  ok(r && r.host === B.id && r.epoch > epoch, 'dropped host hands off at once (epoch bumped)');
  ok(r && r.members.find(m => m.id === A.id)?.away && voiceOf(r, A) === 'toff', 'dropped player keeps seat and voice while away');
  B.send({ t: 'claim', voice: 'toff' });
  ok((await B.next('claim'))?.ok === false, 'away player\'s voice stays claimed');
  const A2 = await P.open('Baron Dirk', ['toff'], `?id=${A.id}&tok=${A.tok}`);
  ok(A2.id === A.id, 'resume with token keeps the id');
  r = await A2.room(x => !x.members.find(m => m.id === A.id)?.away);
  ok(r && r.host === B.id && voiceOf(r, A2) === 'toff', 'resumed player is a guest with the same voice');
  const bad = await P.open('Thief', [], `?id=${A.id}&tok=nope`);
  ok(bad.id !== A.id, 'wrong token cannot take a seat');

  // Grace runs out: seat and voice are freed.
  C.ws.close(4000);
  await sleep(GRACE + 500);
  B.drain();
  B.send({ t: 'claim', voice: 'nan' });
  ok((await B.next('claim'))?.ok === true, 'voice freed after the grace');

  // A goodbye leaves at once.
  A2.drain();
  B.ws.close(1000);
  r = await A2.room(x => !x.members.find(m => m.id === B.id));
  ok(r && r.host === A.id, 'goodbye leaves at once and the next in line hosts');
} catch (e) {
  console.error(e); fails++;
} finally {
  srv.kill();
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
