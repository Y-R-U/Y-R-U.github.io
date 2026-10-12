// Binary messages between browsers. The first byte is the kind. Positions are int16 at 1/8 of
// a world unit, so a 1680-wide page fits with room to spare and 11 ragdoll points cost 44 bytes.
// Written for up to 8 fighters (star topology: the master streams one snapshot to every guest).

import { NPTS } from '../ragdoll.js';
import { ANIM } from '../poses.js';

export const KIND = { JSON: 0, SNAP: 1, INPUT: 2, PING: 3, PONG: 4, CHUNK: 5, ACT: 6 };
export const MODES = ['live', 'stagger', 'down', 'getup', 'dead'];
export const ANIMS = Object.keys(ANIM);
export const PROJ = ['band', 'bomb', 'crumb', 'knife', 'slug'];
/** Gesture slots in MOVES order — the same order as keys 1-8 and the move strip. */
export const GESTURES = ['slash', 'archUp', 'up', 'right', 'circleCW', 'down', 'circleCCW', 'vee'];
export const ACT = { STRIKE: 0, JUMP: 1, SPECIAL: 10 };
export const PHASE = { WAIT: 0, COUNT: 1, FIGHT: 2, OVER: 3 };

const Q = 8;
const enc = new TextEncoder(), dec = new TextDecoder();
const i16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
const u16 = (v) => Math.max(0, Math.min(65535, Math.round(v)));
const u8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

export function json(obj) {
  const s = enc.encode(JSON.stringify(obj));
  const out = new Uint8Array(s.length + 1);
  out[0] = KIND.JSON;
  out.set(s, 1);
  return out;
}
export function unjson(b) { try { return JSON.parse(dec.decode(b.subarray(1))); } catch { return null; } }

/** Guest -> master, unreliable, ~30/s: the stick. Newest wins. */
export function input(seq, moveX, block) {
  const b = new Uint8Array(5), v = new DataView(b.buffer);
  b[0] = KIND.INPUT;
  v.setUint16(1, seq & 0xffff);
  v.setInt8(3, Math.max(-100, Math.min(100, Math.round(moveX * 100))));
  b[4] = block ? 1 : 0;
  return b;
}
export function unInput(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { seq: v.getUint16(1), moveX: v.getInt8(3) / 100, block: !!(b[4] & 1) };
}

/** Guest -> master, reliable: a tap, a jump, or a gesture slot. Never dropped. */
export function act(seq, a) {
  const b = new Uint8Array(4), v = new DataView(b.buffer);
  b[0] = KIND.ACT;
  v.setUint16(1, seq & 0xffff);
  b[3] = a;
  return b;
}
export function unAct(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { seq: v.getUint16(1), a: b[3] };
}

const F_BYTES = 1 + 1 + 1 + 2 + 2 + 2 + 2 + 2 + 2 + 1 + 2 + 2 + 1 + 1 + NPTS * 4 + 8;
const P_BYTES = 1 + 1 + 1 + 2 + 2 + 2 + 1;

/**
 * Master -> guests, unreliable, 30/s. fighters: [{slot, f (a Fighter), ack, cds[8]}].
 * `t` is the master's clock in seconds; the guest interpolates on it.
 */
export function snap(seq, t, phase, clock, timeUp, fighters, projs) {
  const n = fighters.length, np = Math.min(40, projs.length);
  const b = new Uint8Array(12 + n * F_BYTES + np * P_BYTES), v = new DataView(b.buffer);
  b[0] = KIND.SNAP;
  v.setUint16(1, seq & 0xffff);
  v.setFloat32(3, t);
  b[7] = phase | (timeUp ? 0x10 : 0);
  v.setUint16(8, u16(clock * 10));
  b[10] = n; b[11] = np;
  let o = 12;
  for (const { slot, f, ack, cds } of fighters) {
    b[o++] = slot;
    b[o++] = Math.max(0, MODES.indexOf(f.mode)) | (f.facing > 0 ? 8 : 0) | (f.onGround ? 16 : 0) |
      (f.blocking ? 32 : 0) | (f.dead ? 64 : 0) | (f.attack ? 128 : 0);
    b[o++] = Math.max(0, ANIMS.indexOf(f.anim));
    v.setUint16(o, u16(f.hp * 10)); o += 2;
    v.setInt16(o, i16(f.x * Q)); o += 2;
    v.setInt16(o, i16(f.y * Q)); o += 2;
    v.setInt16(o, i16(f.vx)); o += 2;
    v.setInt16(o, i16(f.vy)); o += 2;
    v.setUint16(o, u16(f.animT * 1000)); o += 2;
    b[o++] = u8(f.hitFlash * 1000);
    v.setUint16(o, ack & 0xffff); o += 2;
    v.setUint16(o, u16((f.duckDrop || 0) * Q)); o += 2;
    b[o++] = u8(f.combo);
    b[o++] = u8((f.guardBroken || 0) * 100);
    for (let i = 0; i < NPTS; i++) {
      v.setInt16(o, i16(f.rag.x[i] * Q)); o += 2;
      v.setInt16(o, i16(f.rag.y[i] * Q)); o += 2;
    }
    for (let i = 0; i < 8; i++) b[o++] = u8((cds && cds[i]) * 20);
  }
  for (let k = 0; k < np; k++) {
    const p = projs[k];
    b[o++] = p.netId & 0xff;
    b[o++] = Math.max(0, PROJ.indexOf(p.type));
    b[o++] = p.ownerSlot ?? 255;
    v.setInt16(o, i16(p.x * Q)); o += 2;
    v.setInt16(o, i16(p.y * Q)); o += 2;
    v.setInt16(o, i16(((p.rot % 6.2832) + 6.2832) % 6.2832 * 1000)); o += 2;
    b[o++] = u8(p.fuse * 100);
  }
  return b;
}

export function unSnap(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const s = {
    seq: v.getUint16(1), t: v.getFloat32(3), phase: b[7] & 0x0f, timeUp: !!(b[7] & 0x10),
    clock: v.getUint16(8) / 10, fighters: [], projs: [],
  };
  const n = b[10], np = b[11];
  if (b.length < 12 + n * F_BYTES + np * P_BYTES) return null;
  let o = 12;
  for (let k = 0; k < n; k++) {
    const F = { slot: b[o++] };
    const m = b[o++];
    F.mode = MODES[m & 7] || 'live';
    F.facing = m & 8 ? 1 : -1;
    F.onGround = !!(m & 16); F.blocking = !!(m & 32); F.dead = !!(m & 64); F.attacking = !!(m & 128);
    F.anim = ANIMS[b[o++]] || 'guard';
    F.hp = v.getUint16(o) / 10; o += 2;
    F.x = v.getInt16(o) / Q; o += 2;
    F.y = v.getInt16(o) / Q; o += 2;
    F.vx = v.getInt16(o); o += 2;
    F.vy = v.getInt16(o); o += 2;
    F.animT = v.getUint16(o) / 1000; o += 2;
    F.hitFlash = b[o++] / 1000;
    F.ack = v.getUint16(o); o += 2;
    F.duckDrop = v.getUint16(o) / Q; o += 2;
    F.combo = b[o++];
    F.guardBroken = b[o++] / 100;
    F.pts = new Float32Array(NPTS * 2);
    for (let i = 0; i < NPTS; i++) {
      F.pts[i * 2] = v.getInt16(o) / Q; o += 2;
      F.pts[i * 2 + 1] = v.getInt16(o) / Q; o += 2;
    }
    F.cds = [];
    for (let i = 0; i < 8; i++) F.cds.push(b[o++] / 20);
    s.fighters.push(F);
  }
  for (let k = 0; k < np; k++) {
    const p = { id: b[o++], type: PROJ[b[o++]] || 'band', owner: b[o++] };
    p.x = v.getInt16(o) / Q; o += 2;
    p.y = v.getInt16(o) / Q; o += 2;
    p.rot = v.getInt16(o) / 1000; o += 2;
    p.fuse = b[o++] / 100;
    s.projs.push(p);
  }
  return s;
}

/**
 * Who won a round, from nothing but what every client can see: HP at 1/10 precision and
 * who is down for good. Master and guests run this same function on the same numbers, so
 * an honest pair always reports the same thing to the server.
 */
export function verdict(fs, timeUp) {
  const alive = fs.filter((f) => !f.dead);
  if (alive.length === 1) return { winner: alive[0].slot, ko: true };
  if (alive.length === 0) return { winner: -1, ko: false };
  if (!timeUp) return null;
  const score = (f) => Math.round(f.hp * 10);
  let best = -1, top = -1, tie = false;
  for (const f of alive) {
    const s = score(f);
    if (s > top) { top = s; best = f.slot; tie = false; } else if (s === top) tie = true;
  }
  return { winner: tie ? -1 : best, ko: false };
}
