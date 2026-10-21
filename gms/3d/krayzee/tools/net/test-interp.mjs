// node tools/net/test-interp.mjs — the state-stream maths and room options, no browser.
import { unwrap16, RemoteTrack, DELAY_MIN, DELAY_MAX } from '../../js/net/interp.js';
import { normalise, defaultsFor } from '../../js/net/options.js';
import { Aircraft } from '../../js/flight/aircraft.js';
import { unpackState } from '../../js/flight/netstate.js';

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };

ok(unwrap16(65530, 65540) === 65530 && unwrap16(4, 65540) === 65540 && unwrap16(10, 65530) === 65546, 'u16 room time unwraps across the 65.5 s wrap');
ok(unwrap16(100, 20) === 100, 'a sender slightly ahead stays ahead, not 65 s behind');

const ac = new Aircraft();
const tr = new RemoteTrack();
let rt = 200000;
for (let i = 0; i < 30; i++) {
  ac.pos.set(i * 3.33, 300, 0); ac.vel.set(50, 0, 0);
  const st = unpackState(ac.packState({ roomTimeMs: rt }));
  tr.push(st, rt + 40);
  rt += 66.7;
}
ok(tr.delay >= DELAY_MIN && tr.delay < 130, `steady 40 ms lateness keeps the delay near 100 ms (${tr.delay.toFixed(0)})`);
ok(!tr.push(unpackState(ac.packState({ roomTimeMs: rt - 500 })), rt), 'old packet dropped');
const view = new Aircraft();
const state = view.applyRemote(tr.samples, tr.renderMs(rt));
ok(state === 'interp' && Math.abs(view.pos.x - (tr.renderMs(rt) - (rt - 30 * 66.7)) / 66.7 * 3.33) < 1.5, 'interpolated position sits on the path');

const jt = new RemoteTrack();
rt = 1000;
for (let i = 0; i < 60; i++) { jt.push(unpackState(ac.packState({ roomTimeMs: rt })), rt + 40 + (i % 2 ? 120 : 0)); rt += 66.7; }
ok(jt.delay > 200 && jt.delay <= DELAY_MAX, `jitter grows the delay toward 300 ms (${jt.delay.toFixed(0)})`);
ok(jt.health(rt + 100) === 'live' && jt.health(rt + 800) === 'lost' && jt.health(rt + 3000) === 'autopilot', 'live → lost → autopilot');

const j = normalise({ type: 'joust', maxPlayers: 8, traffic: 'busy', decrees: ['all_bathtubs'] }, 'king');
ok(j.maxPlayers === 2 && j.traffic === 'none' && j.decrees.length === 1, 'joust fixes traffic and players; a King keeps a decree');
const g = normalise({ type: 'garden', protection: 'realistic', aircraft: ['airliner'], ranked: true }, 'baron');
ok(g.protection === 'rubber' && g.aircraft.join() === 'ultralight,light' && !g.ranked, 'garden fixes protection and classes; a Baron cannot host ranked');
ok(defaultsFor('strict').minutes === 12 && defaultsFor('open').minutes === 0, 'type defaults come from data/modes.js');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
