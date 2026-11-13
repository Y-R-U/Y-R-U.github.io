// THRONG online wire format (docs/NET.md). Pure: runs in the browser and in node.
import { CONFIG } from '../config.js';
import { SIM_DT } from '../sim/sim.js';
import { hash32 } from '../meta/hash.js';

export const PROTO = 1;
export const SIM_REV = 1;                 // bump when sim.js changes behaviour without a CONFIG change
export const SNAP_EVERY = 2;              // sim ticks per snapshot (30 Hz sim → 15 Hz)
export const KEY_EVERY = 240;             // a full keyframe every 8 s (late joiners start from it)
export const NEUTRAL_EPS = 0.35;          // metres a pedestrian may drift from the guests' model before a correction
export const MSG = { SNAP: 1, KEY: 2, INPUT: 3 };
const PHASES = ['countdown', 'play', 'over'];
const KINDS = ['speed', 'magnet', 'double'];
const EV = { recruit: 1, steal: 2, elim: 3, respawn: 4, pickup: 5, lead: 6, phase: 7 };
const TAU = Math.PI * 2;

export function simVersion() {
  return hash32(JSON.stringify({ sim: CONFIG.SIM, match: CONFIG.MATCH, rev: SIM_REV })).toString(36);
}
export function mapVersion(map) {
  return hash32(JSON.stringify([map.size, map.obstacles, map.spawns, map.plazas])).toString(36);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const q16 = (v) => clamp(Math.round(v * 100), -32767, 32767);
const u8 = (v, k) => clamp(Math.round(v * k), 0, 255);
const qh = (h) => Math.round(((h % TAU) + TAU) % TAU / TAU * 256) & 255;

class Writer {
  constructor(n = 2048) { this.buf = new ArrayBuffer(n); this.dv = new DataView(this.buf); this.o = 0; }
  need(n) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = nb; this.dv = new DataView(nb);
  }
  u8(v) { this.need(1); this.dv.setUint8(this.o++, v); }
  i8(v) { this.need(1); this.dv.setInt8(this.o++, v); }
  u16(v) { this.need(2); this.dv.setUint16(this.o, v); this.o += 2; }
  i16(v) { this.need(2); this.dv.setInt16(this.o, v); this.o += 2; }
  u32(v) { this.need(4); this.dv.setUint32(this.o, v >>> 0); this.o += 4; }
  at(pos, v) { this.dv.setUint16(pos, v); }
  bytes() { return new Uint8Array(this.buf.slice(0, this.o)); }
}

class Reader {
  constructor(b) { const u = b instanceof Uint8Array ? b : new Uint8Array(b); this.dv = new DataView(u.buffer, u.byteOffset, u.byteLength); this.o = 0; }
  u8() { return this.dv.getUint8(this.o++); }
  i8() { return this.dv.getInt8(this.o++); }
  u16() { const v = this.dv.getUint16(this.o); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o); this.o += 4; return v; }
}

// What every guest believes about each pedestrian: a quantised position + velocity at tick t0.
// The host keeps an identical copy and only sends a slot when reality drifts from it.
export function createNeutralModel(cap) {
  return {
    cap,
    x: new Float64Array(cap), z: new Float64Array(cap), vx: new Float64Array(cap), vz: new Float64Array(cap),
    t0: new Int32Array(cap), state: new Uint8Array(cap), target: new Int8Array(cap).fill(-1),
    look: new Uint8Array(cap), heading: new Float32Array(cap),
  };
}
export function predictX(m, i, tick) { return m.x[i] + m.vx[i] * (tick - m.t0[i]) * SIM_DT; }
export function predictZ(m, i, tick) { return m.z[i] + m.vz[i] * (tick - m.t0[i]) * SIM_DT; }

function setSlot(m, i, st, qx, qz, qvx, qvz, hb, tg, look, tick) {
  m.state[i] = st;
  if (!st) { m.target[i] = -1; return; }
  m.x[i] = qx / 100; m.z[i] = qz / 100; m.vx[i] = qvx / 10; m.vz[i] = qvz / 10;
  m.t0[i] = tick; m.heading[i] = hb / 256 * TAU; m.target[i] = tg; m.look[i] = look;
}

// Host side. acks[i] = { seq, applied } for remote-steered crowds (client-side prediction replays from it).
export function createSnapEncoder(cap) {
  const model = createNeutralModel(cap);
  const w = new Writer(4096);
  const stats = { snaps: 0, keys: 0, bytes: 0, slots: 0 };

  function encode(state, events, { full = false, epoch = 0, acks = null } = {}) {
    w.o = 0;
    const tick = state.tick;
    w.u8(full ? MSG.KEY : MSG.SNAP); w.u8(epoch & 255); w.u32(tick);
    w.u8(Math.max(0, PHASES.indexOf(state.phase)));
    w.u16(clamp(Math.round(state.timeLeft * 100), 0, 65535));
    w.u16(clamp(Math.round((state.countdownLeft || 0) * 100), 0, 65535));
    w.u16(clamp(Math.round((state.duration || 0) * 10), 0, 65535));
    w.u8(state.leader & 255); w.u8(Math.min(255, state.leadChanges || 0));
    w.u8(state.crowds.length);
    for (const c of state.crowds) {
      w.u8((c.alive ? 1 : 0) | (c.remote ? 2 : 0));
      w.i16(q16(c.x)); w.i16(q16(c.z)); w.i16(q16(c.vx)); w.i16(q16(c.vz));
      w.u16(clamp(c.count, 0, 65535)); w.u16(clamp(c.best, 0, 65535));
      w.u8(Math.min(255, c.kills)); w.u8(Math.min(255, c.deaths));
      w.u16(Math.min(65535, c.recruited)); w.u16(Math.min(65535, c.stolen)); w.u16(Math.min(65535, c.lost));
      w.u8(c.rank);
      w.u8(u8(c.protect, 20)); w.u8(u8(c.respawnIn, 20));
      w.u8(u8(c.fx.speed, 20)); w.u8(u8(c.fx.magnet, 20)); w.u8(u8(c.fx.double, 20));
      w.u8(u8(Math.max(0, c.eating), 400)); w.u8(u8(Math.max(0, c.panic), 400));
      const a = acks && acks[c.index];
      w.u16(a ? a.seq & 65535 : 0); w.u8(a ? Math.min(255, a.applied) : 0);
      w.u8(qh(c.heading));
    }
    w.u8(state.pickups.length);
    for (const p of state.pickups) {
      w.u8(p.id & 255); w.u8(Math.max(0, KINDS.indexOf(p.kind)) | (p.active ? 128 : 0));
      w.i16(q16(p.x)); w.i16(q16(p.z)); w.u8(u8(Math.max(0, p.respawnIn || 0), 10));
    }
    const N = state.neutrals, nPos = w.o;
    w.u16(0);
    let n = 0;
    const eps2 = NEUTRAL_EPS * NEUTRAL_EPS;
    for (let i = 0; i < cap; i++) {
      const st = N.state[i];
      if (!full) {
        if (st === model.state[i] && (st === 0 || st === 2 && N.target[i] === model.target[i] || st === 1 && N.look[i] === model.look[i])) {
          if (st !== 1) continue;
          const dx = N.x[i] - predictX(model, i, tick), dz = N.z[i] - predictZ(model, i, tick);
          if (dx * dx + dz * dz <= eps2) continue;
        }
      }
      n++;
      w.u16(i | (st << 14));
      if (!st) { setSlot(model, i, 0); continue; }
      const qx = q16(N.x[i]), qz = q16(N.z[i]);
      const qvx = st === 1 ? clamp(Math.round((N.x[i] - N.px[i]) / SIM_DT * 10), -127, 127) : 0;
      const qvz = st === 1 ? clamp(Math.round((N.z[i] - N.pz[i]) / SIM_DT * 10), -127, 127) : 0;
      const hb = qh(N.heading[i]);
      w.i16(qx); w.i16(qz); w.i8(qvx); w.i8(qvz); w.u8(hb); w.i8(N.target[i]); w.u8(N.look[i]);
      setSlot(model, i, st, qx, qz, qvx, qvz, hb, N.target[i], N.look[i], tick);
    }
    w.at(nPos, n);
    const evPos = w.o;
    w.u16(0);
    let ne = 0;
    // Steals arrive every tick of a contact: merge them per pair for the snapshot.
    const steals = new Map();
    for (const e of events) {
      if (e.type === 'steal') { const k = e.from * 64 + e.to; steals.set(k, (steals.get(k) || 0) + e.n); continue; }
      const t = EV[e.type];
      if (!t) continue;
      ne++; w.u8(t);
      if (t === 1) { w.u8(e.crowd); w.u16(e.slot); w.u8(e.n || 1); }
      else if (t === 3) { w.u8(e.victim); w.u8(e.by); }
      else if (t === 4) { w.u8(e.crowd); w.i16(q16(e.x)); w.i16(q16(e.z)); w.u16(e.count || 0); }
      else if (t === 5) { w.u8(e.crowd); w.u8(e.id); w.u8(Math.max(0, KINDS.indexOf(e.kind))); }
      else if (t === 6) w.u8(e.crowd);
      else if (t === 7) w.u8(Math.max(0, PHASES.indexOf(e.phase)));
    }
    for (const [k, v] of steals) { ne++; w.u8(2); w.u8(k >> 6); w.u8(k & 63); w.u16(Math.min(65535, v)); }
    w.at(evPos, ne);
    const out = w.bytes();
    stats[full ? 'keys' : 'snaps']++; stats.bytes += out.length; stats.slots += n;
    return out;
  }

  return { encode, model, stats, reset() { model.state.fill(0); } };
}

// Decoded snapshots keep their pedestrian updates packed until the guest's view reaches their tick.
export function decodeSnap(buf) {
  const r = new Reader(buf);
  const type = r.u8();
  if (type !== MSG.SNAP && type !== MSG.KEY) return null;
  const s = { full: type === MSG.KEY, epoch: r.u8(), tick: r.u32() };
  s.phase = PHASES[r.u8()] || 'play';
  s.timeLeft = r.u16() / 100; s.countdownLeft = r.u16() / 100; s.duration = r.u16() / 10;
  s.leader = r.u8(); s.leadChanges = r.u8();
  const nc = r.u8();
  s.crowds = new Array(nc);
  for (let i = 0; i < nc; i++) {
    const f = r.u8();
    s.crowds[i] = {
      index: i, alive: !!(f & 1), remote: !!(f & 2),
      x: r.i16() / 100, z: r.i16() / 100, vx: r.i16() / 100, vz: r.i16() / 100,
      count: r.u16(), best: r.u16(), kills: r.u8(), deaths: r.u8(),
      recruited: r.u16(), stolen: r.u16(), lost: r.u16(), rank: r.u8(),
      protect: r.u8() / 20, respawnIn: r.u8() / 20,
      fx: { speed: r.u8() / 20, magnet: r.u8() / 20, double: r.u8() / 20 },
      eating: r.u8() / 400, panic: r.u8() / 400,
      ackSeq: r.u16(), applied: r.u8(), heading: r.u8() / 256 * TAU,
    };
  }
  const np = r.u8();
  s.pickups = new Array(np);
  for (let i = 0; i < np; i++) {
    const id = r.u8(), k = r.u8();
    s.pickups[i] = { id, kind: KINDS[k & 127] || 'speed', active: !!(k & 128), x: r.i16() / 100, z: r.i16() / 100, respawnIn: r.u8() / 10 };
  }
  const nn = r.u16();
  const slots = new Uint16Array(nn), qx = new Int16Array(nn), qz = new Int16Array(nn), qvx = new Int8Array(nn), qvz = new Int8Array(nn);
  const hb = new Uint8Array(nn), tg = new Int8Array(nn), lk = new Uint8Array(nn);
  for (let k = 0; k < nn; k++) {
    const v = r.u16();
    slots[k] = v;
    if (!(v >> 14)) continue;
    qx[k] = r.i16(); qz[k] = r.i16(); qvx[k] = r.i8(); qvz[k] = r.i8(); hb[k] = r.u8(); tg[k] = r.i8(); lk[k] = r.u8();
  }
  s.nupd = { n: nn, slots, qx, qz, qvx, qvz, hb, tg, lk };
  const ne = r.u16();
  s.events = [];
  for (let k = 0; k < ne; k++) {
    const t = r.u8();
    if (t === 1) s.events.push({ type: 'recruit', crowd: r.u8(), slot: r.u16(), n: r.u8() });
    else if (t === 2) s.events.push({ type: 'steal', from: r.u8(), to: r.u8(), n: r.u16() });
    else if (t === 3) s.events.push({ type: 'elim', victim: r.u8(), by: r.u8() });
    else if (t === 4) s.events.push({ type: 'respawn', crowd: r.u8(), x: r.i16() / 100, z: r.i16() / 100, count: r.u16() });
    else if (t === 5) s.events.push({ type: 'pickup', crowd: r.u8(), id: r.u8(), kind: KINDS[r.u8()] || 'speed' });
    else if (t === 6) s.events.push({ type: 'lead', crowd: r.u8() });
    else if (t === 7) s.events.push({ type: 'phase', phase: PHASES[r.u8()] || 'play' });
    else break;
  }
  s.bytes = r.dv.byteLength;
  return s;
}

// Applies a decoded snapshot's pedestrian updates to a guest model (for a key: everything else is empty).
export function applyNeutrals(m, s) {
  const u = s.nupd;
  if (s.full) m.state.fill(0);
  for (let k = 0; k < u.n; k++) {
    const v = u.slots[k], i = v & 0x3fff, st = v >> 14;
    if (i >= m.cap) continue;
    setSlot(m, i, st, u.qx[k], u.qz[k], u.qvx[k], u.qvz[k], u.hb[k], u.tg[k], u.lk[k], s.tick);
  }
}

export function encodeInput(seq, ax, az) {
  const b = new Uint8Array(5), dv = new DataView(b.buffer);
  dv.setUint8(0, MSG.INPUT); dv.setUint16(1, seq & 65535);
  dv.setInt8(3, clamp(Math.round(ax * 127), -127, 127)); dv.setInt8(4, clamp(Math.round(az * 127), -127, 127));
  return b;
}
// The server forwards inputs to the host with the sender's crowd index in front: [3][crowd][seq u16][ax][az].
export function decodeForwardedInput(buf) {
  const r = new Reader(buf);
  if (r.u8() !== MSG.INPUT || r.dv.byteLength < 6) return null;
  return { crowd: r.u8(), seq: r.u16(), ax: r.i8() / 127, az: r.i8() / 127 };
}
export const quantAxis = (v) => clamp(Math.round(v * 127), -127, 127) / 127;
