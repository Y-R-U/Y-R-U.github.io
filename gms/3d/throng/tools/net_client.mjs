// One headless THRONG online client (child process of tools/net_test.mjs). It runs the real js/net code:
// as host the real sim + bots, as guest the snapshot mirror + own-leader prediction. Driven over IPC.
import { CONFIG } from '../js/config.js';

const DUR = +process.env.NET_DURATION || 0;
const MODE = process.env.NET_MODE || '';
if (DUR) CONFIG.MATCH.duration = DUR;
if (DUR && MODE && CONFIG.MODES[MODE]) CONFIG.MODES[MODE].duration = DUR;
const { createOnline } = await import('../js/net/online.js');
const { decodeSnap, applyNeutrals, createNeutralModel, predictX, predictZ } = await import('../js/net/proto.js');
let km = 0;
let genMap;
try { genMap = (await import('../js/world/map.js')).generateMap; } catch { genMap = (await import('./stub_map.js')).generateMap; }
const map = genMap(1);

const tell = (o) => { try { process.send(o); } catch {} };
let online = null, steerA = Math.random() * 6.28, steerT = 0, last = performance.now();
const samples = {};           // tick → counts (every 150 ticks) from what this client sees as authoritative
const series = [];            // { t, tick, counts, role } every 250 ms
let breakMode = '';
let inputsRecv = 0;
// Pedestrian reconstruction check: an independent model fed exactly what this client received.
const nsamples = {}, hsamples = {};
let ver = null, verSynced = false;
const r2 = (v) => Math.round(v * 100) / 100;
function verify(b) {
  const s = decodeSnap(b);
  if (!s) return;
  if (!ver) ver = createNeutralModel(CONFIG.SIM.neutralCap);
  if (s.full) verSynced = true;
  if (!verSynced) return;
  applyNeutrals(ver, s);
  if (s.tick % 150 === 0) nsamples[s.tick] = { state: Array.from(ver.state), x: Array.from(ver.state, (st, i) => r2(predictX(ver, i, s.tick))), z: Array.from(ver.state, (st, i) => r2(predictZ(ver, i, s.tick))) };
}
function hostSample(st) {
  if (st.tick % 150 || hsamples[st.tick]) return;
  const N = st.neutrals;
  hsamples[st.tick] = { state: Array.from(N.state), x: Array.from(N.x, r2), z: Array.from(N.z, r2) };
}

function wrap(m) {
  if (!m || m.__wrapped) return;
  m.__wrapped = true;
  const on = m.onSnap; let k = 0;
  m.onSnap = (b, now) => {
    if (breakMode === 'counts' && m.role === 'guest' && b[0] === 1 && ++k % 7 === 0) return;
    if (breakMode === 'mode' && m.role === 'guest' && ++km % 3 === 0) { const s = decodeSnap(b); if (s && s.mode) b = b.slice(0, s.modeAt); }
    on(b, now);
    if (m.role === 'guest') verify(b);
  };
  if (breakMode === 'migrate') m.promote = () => false;
  if (breakMode === 'late') m.pickBotCrowd = () => -1;
  const oi = m.onInput;
  m.onInput = (b, now) => { inputsRecv++; oi(b, now); };
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const m = online && online.match;
  if (!m) return;
  wrap(m);
  steerT -= dt;
  if (steerT <= 0) { steerA += (Math.random() - 0.5) * 2.4; steerT = 1 + Math.random() * 2; }
  if (breakMode === 'bytes' && m.role === 'host') m.host.key();
  const r = m.frame(now, dt, Math.sin(steerA), Math.cos(steerA), 8);
  const st = r.state;
  if (!st) return;
  // The authoritative view: the host's sim, or the guest's latest snapshot.
  const auth = m.role === 'host' ? m.sim.state : m.guest.latest;
  if (auth && auth.tick % 150 === 0 && !samples[auth.tick]) {
    const mc = m.role === 'host' ? (auth.mode !== 'classic' ? auth.crowds.map((c) => `${Math.round(c.score * 10) / 10}|${c.out}|${c.horde}`) : [])
      : (auth.mode ? auth.mode.crowds.map((c) => `${c.score}|${c.out}|${c.horde}`) : []);
    samples[auth.tick] = auth.crowds.map((c) => c.count).concat(mc);
  }
  if (m.role === 'host') hostSample(m.sim.state);
  if (st.phase === 'over' && !m.over) {
    m.over = true;
    online.report();
    tell({ ev: 'over', role: m.role, me: m.me, rows: m.result(), tick: auth && auth.tick });
  }
}
setInterval(loop, 16);

setInterval(() => {
  const m = online && online.match;
  if (!m || !m.state) return;
  const auth = m.role === 'host' ? m.sim.state : m.guest.latest;
  if (!auth) return;
  series.push({ t: Date.now(), tick: auth.tick, role: m.role, counts: auth.crowds.map((c) => c.count), alive: auth.crowds.map((c) => c.alive) });
  const g = m.guest;
  tell({
    ev: 'tick', role: m.role, me: m.me, tick: auth.tick, phase: auth.phase, timeLeft: auth.timeLeft,
    counts: auth.crowds.map((c) => c.count), humans: m.players.map((p) => !!p.human),
    net: online.net, netSecs: (performance.now() - online.net.since) / 1000, rtt: online.rtt, inputsRecv,
    guest: g ? { bytes: g.stats.bytes, secs: (performance.now() - g.stats.since) / 1000, snaps: g.stats.snaps, keys: g.stats.keys, since: g.stats.since, latency: g.stats.latency.slice(-200), corrections: g.stats.corrections, maxErr: g.stats.maxErr } : null,
    hostEnc: m.host ? { ...m.host.enc.stats } : null,
  });
}, 250);

process.on('message', async (msg) => {
  try {
    if (msg.cmd === 'connect') {
      breakMode = msg.break || '';
      online = createOnline({
        url: msg.url, map, name: msg.name, dev: msg.dev, cid: msg.cid,
        ...(MODE ? { pickMode: (quick) => (quick ? 'classic' : MODE) } : {}),
        emit: (type, data) => {
          if (type === 'room') tell({ ev: 'room', room: data });
          else if (type === 'begin') tell({ ev: 'begin', me: data.match.me, role: data.match.role, late: data.late, humans: data.match.players.map((p) => !!p.human), counts: null, mode: data.match.mode });
          else if (type === 'role') tell({ ev: 'role', role: data.role, why: data.why });
          else if (type === 'status') tell({ ev: 'status', status: data.status });
          else if (type === 'ended') tell({ ev: 'ended', recorded: data.recorded, why: data.why });
          else if (type === 'error') tell({ ev: 'error', code: data.code, error: data.error });
        },
      });
      online.connect();
    } else if (msg.cmd === 'quick') tell({ ev: 'reply', cmd: 'quick', room: (await online.quick()).room });
    else if (msg.cmd === 'create') tell({ ev: 'reply', cmd: 'create', room: (await online.create()).room });
    else if (msg.cmd === 'join') {
      try { tell({ ev: 'reply', cmd: 'join', room: (await online.join(msg.code)).room }); } catch (e) { tell({ ev: 'reply', cmd: 'join', error: e.code }); }
    } else if (msg.cmd === 'start') tell({ ev: 'reply', cmd: 'start', ok: !!(await online.start()) });
    else if (msg.cmd === 'flood') {
      // Bypasses the client's own input pacing on purpose: straight to the socket.
      const { encodeInput } = await import('../js/net/proto.js');
      for (let i = 0; i < msg.n; i++) online.sendBin(encodeInput(60000 + i, 0.5, 0.5));
      tell({ ev: 'reply', cmd: 'flood' });
    } else if (msg.cmd === 'samples') tell({ ev: 'samples', samples, series, nsamples, hsamples });
    else if (msg.cmd === 'close') { online.close(); tell({ ev: 'reply', cmd: 'close' }); }
  } catch (e) {
    tell({ ev: 'reply', cmd: msg.cmd, error: e.code || String(e) });
  }
});
tell({ ev: 'ready' });
