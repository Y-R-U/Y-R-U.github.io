import { Quat, V3, clamp } from './vmath.js';

// 32-byte plane state packet (docs/ONLINE.md §3), little-endian:
//  0 f32 x | 4 f32 z | 8 i16 y×10 | 10 u32 quat smallest-three (2-bit index + 3×10 bit) | 14 3×i16 vel ×20
// 20 3×i8 body rates ×40 | 23 3×i8 aileron/elevator/rudder ×127 | 26 u8 throttle | 27 u8 flags | 28 u8 flaps
// 29 u8 hull % | 30 u16 room time ms (wrapping)
export const FLAG = { ground: 1, override: 2, gear: 4, crashed: 8, parachute: 16, brake: 32, stalled: 64 };

export function packState(ac, { roomTimeMs = 0, hull = 100, overriding = false, parachute = false } = {}) {
  const buf = new Uint8Array(32), dv = new DataView(buf.buffer);
  dv.setFloat32(0, ac.pos.x, true);
  dv.setFloat32(4, ac.pos.z, true);
  dv.setInt16(8, clamp(Math.round(ac.pos.y * 10), -32768, 32767), true);
  dv.setUint32(10, packQuat(ac.q), true);
  dv.setInt16(14, clamp(Math.round(ac.vel.x * 20), -32768, 32767), true);
  dv.setInt16(16, clamp(Math.round(ac.vel.y * 20), -32768, 32767), true);
  dv.setInt16(18, clamp(Math.round(ac.vel.z * 20), -32768, 32767), true);
  dv.setInt8(20, clamp(Math.round(ac.w.x * 40), -127, 127));
  dv.setInt8(21, clamp(Math.round(ac.w.y * 40), -127, 127));
  dv.setInt8(22, clamp(Math.round(ac.w.z * 40), -127, 127));
  const c = ac.ctl;
  dv.setInt8(23, clamp(Math.round(c.aileron * 127), -127, 127));
  dv.setInt8(24, clamp(Math.round(c.elevator * 127), -127, 127));
  dv.setInt8(25, clamp(Math.round(c.rudder * 127), -127, 127));
  dv.setUint8(26, clamp(Math.round(c.throttle * 255), 0, 255));
  let f = FLAG.gear;
  if (ac.onGround) f |= FLAG.ground;
  if (overriding) f |= FLAG.override;
  if (ac.crashed) f |= FLAG.crashed;
  if (parachute) f |= FLAG.parachute;
  if (c.brake > 0.3) f |= FLAG.brake;
  if (ac.stalled) f |= FLAG.stalled;
  dv.setUint8(27, f);
  dv.setUint8(28, clamp(Math.round(ac.flapsPos * 255), 0, 255));
  dv.setUint8(29, clamp(Math.round(hull), 0, 100));
  dv.setUint16(30, roomTimeMs & 0xffff, true);
  return buf;
}

export function unpackState(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, 32);
  const f = dv.getUint8(27);
  return {
    pos: new V3(dv.getFloat32(0, true), dv.getInt16(8, true) / 10, dv.getFloat32(4, true)),
    q: unpackQuat(dv.getUint32(10, true)),
    vel: new V3(dv.getInt16(14, true) / 20, dv.getInt16(16, true) / 20, dv.getInt16(18, true) / 20),
    w: new V3(dv.getInt8(20) / 40, dv.getInt8(21) / 40, dv.getInt8(22) / 40),
    ctl: { aileron: dv.getInt8(23) / 127, elevator: dv.getInt8(24) / 127, rudder: dv.getInt8(25) / 127, throttle: dv.getUint8(26) / 255, brake: f & FLAG.brake ? 1 : 0 },
    flags: f, onGround: !!(f & FLAG.ground), overriding: !!(f & FLAG.override), crashed: !!(f & FLAG.crashed),
    flaps: dv.getUint8(28) / 255, hull: dv.getUint8(29), t16: dv.getUint16(30, true),
  };
}

const QS = 511 / Math.SQRT1_2;
function packQuat(q) {
  const c = [q.x, q.y, q.z, q.w];
  let m = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(c[i]) > Math.abs(c[m])) m = i;
  const sg = c[m] < 0 ? -1 : 1;
  let out = m, sh = 2;
  for (let i = 0; i < 4; i++) {
    if (i === m) continue;
    out |= (clamp(Math.round(c[i] * sg * QS) + 511, 0, 1023)) << sh;
    sh += 10;
  }
  return out >>> 0;
}
function unpackQuat(u) {
  const m = u & 3, c = [0, 0, 0, 0];
  let sh = 2, s = 0;
  for (let i = 0; i < 4; i++) {
    if (i === m) continue;
    c[i] = (((u >>> sh) & 1023) - 511) / QS;
    s += c[i] * c[i]; sh += 10;
  }
  c[m] = Math.sqrt(Math.max(0, 1 - s));
  return new Quat(c[0], c[1], c[2], c[3]).normalize();
}

// samples: [{ t (unwrapped room ms), ...unpackState() }] oldest first. renderMs is already "now - buffer delay".
// Hermite position with the sent velocities, slerp rotation; dead-reckons up to 600 ms past the newest sample.
export function applyRemote(ac, samples, renderMs) {
  if (!samples.length) return 'empty';
  let a = samples[0], b = null;
  for (let i = samples.length - 1; i >= 0; i--) if (samples[i].t <= renderMs) { a = samples[i]; b = samples[i + 1] || null; break; }
  let state;
  if (b && renderMs >= a.t) {
    const T = (b.t - a.t) / 1000, s = clamp((renderMs - a.t) / (b.t - a.t), 0, 1);
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (const k of ['x', 'y', 'z']) ac.pos[k] = h00 * a.pos[k] + h10 * T * a.vel[k] + h01 * b.pos[k] + h11 * T * b.vel[k];
    ac.vel.copy(a.vel).lerp(b.vel, s);
    ac.q.slerpQuats(a.q, b.q, s);
    state = 'interp';
  } else {
    const last = samples[samples.length - 1];
    const dt = clamp((renderMs - last.t) / 1000, 0, 0.6);
    ac.pos.copy(last.pos).addScaled(last.vel, dt);
    ac.vel.copy(last.vel);
    ac.q.copy(last.q).integrateBody(last.w, dt);
    state = renderMs - last.t > 600 ? 'lost' : 'reckon';
    a = last;
  }
  ac.w.copy(a.w);
  Object.assign(ac.ctl, a.ctl, { flaps: a.flaps });
  ac.flapsPos = a.flaps; ac.eng = a.ctl.throttle;
  ac.onGround = ac.mainsDown = a.onGround; ac.crashed = a.crashed;
  ac.prevPos.copy(ac.pos); ac.prevQ.copy(ac.q);
  ac._derive(null);
  return state;
}
