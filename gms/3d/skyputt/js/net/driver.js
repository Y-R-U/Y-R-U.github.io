// Host-side driver for AI seats (ghost AIs, and humans who dropped out = "AI takeover").
// The server has no physics, so the host's client plans each AI stroke with js/ai (worker,
// planner + personality noise), relays it like a player's shot and plays it as a ghost; the
// other clients replay it from the relayed input. Host migration: the new host's driver picks
// up from the positions on the server.
import { AIGolfer } from '../ai/golfers.js';
import { aiClient } from '../ai/index.js';
import { shotSpeed } from '../engine/constants.js';

const FIRST_AT = 3.6;          // s of the shared hole clock before the AIs start (after the fly-over)
const THINK = [0.9, 1.6];      // s between an AI's ball stopping and its next putt (min, + random)
const AHEAD = 0.5;             // plan for a launch this far ahead on the obstacle clock

export class AIDriver {
  constructor(game) {
    this.g = game;
    this.seats = new Map();      // seat index → { key, phase: idle|thinking|waiting|rolling, readyAt, ball, hole, n, plan }
    this.golfers = new Map();    // spec key → AIGolfer
    this.ai = null;
  }
  dispose() { this.seats.clear(); }
  reset() { this.seats.clear(); }

  golfer(s) {
    const a = s.ai || { personality: 'pro', skill: 0.45, seed: 1 };
    const key = `${s.i}:${a.personality}:${a.skill}:${a.seed}`;
    let g = this.golfers.get(key);
    if (!g) { g = new AIGolfer({ personality: a.personality, skill: a.skill, seed: (a.seed | 0) || 1, name: s.name }); this.golfers.set(key, g); }
    return g;
  }

  // Each frame on the host. round: the OnlineRound showing this hole.
  update(round) {
    const g = this.g, room = g.room;
    if (!room || room.state !== 'playing' || room.phase !== 'play' || !g.isHost() || !round || round.index !== room.hole) return;
    const now = g.sharedTime();
    if (now < FIRST_AT) return;
    for (const s of room.seats) {
      if (s.ctrl !== 'ai' || s.cur.done) continue;
      let st = this.seats.get(s.i);
      // new hole, or the server moved this seat on (a result we sent, or a voided shot): start over
      if (!st || st.hole !== room.hole || st.n !== s.cur.n) {
        st = { phase: 'idle', hole: room.hole, n: s.cur.n, readyAt: now + Math.random() * 1.2, ball: null };
        this.seats.set(s.i, st);
      }
      if (st.phase === 'idle' && !s.cur.flying && now >= st.readyAt && !round.ghostBusy(s.i)) this.plan(round, s, st);
      else if (st.phase === 'waiting' && now >= st.plan.t0) this.launch(round, s, st);
    }
  }

  ballFor(round, s, st) {
    if (st.ball && st.ballN === s.cur.n) return st.ball;   // the exact rest state from our last sim
    const p = s.cur.pos, t = round.hole.tee;
    return p ? { x: p[0], y: p[1], z: p[2] } : { x: t.x, y: t.y, z: t.z };
  }

  async plan(round, s, st) {
    st.phase = 'thinking';
    const hole = st.hole, n = s.cur.n, ball = this.ballFor(round, s, st);
    try {
      this.ai = this.ai || aiClient();
      const r = await this.ai.shot(round.def, this.golfer(s), ball, { t0: this.g.sharedTime() + AHEAD, budgetScale: 0.6 });
      if (!this.still(s.i, hole, n)) return;
      st.plan = { ...r, ball };
      st.phase = 'waiting';
    } catch (e) {
      console.warn('[skyputt] ai plan failed', e);
      st.phase = 'idle'; st.readyAt = this.g.sharedTime() + 2;
    }
  }

  launch(round, s, st) {
    const p = st.plan, v = shotSpeed(p.shot.power);
    const vx = Math.sin(p.shot.aim) * v, vz = -Math.cos(p.shot.aim) * v;
    const n = s.cur.n, hole = st.hole;
    const b = p.ball;
    const ballMsg = { x: b.x, y: b.y, z: b.z, sup: b.sup ?? false, n: b.n || [0, 1, 0], surf: b.surf ?? 0 };
    st.phase = 'rolling';
    this.g.sendShot({ seat: s.i, hole, n, vx, vz, t0: p.t0, aim: p.shot.aim, power: p.shot.power, mods: {}, ball: ballMsg });
    const state = p.state === 'cup' || p.state === 'oob' ? p.state : 'rest';
    const shot = { path: p.path, hz: 30, state, from: p.from, to: state === 'oob' ? p.from : p.to };
    round.playGhost(s.i, shot, () => {
      if (!this.still(s.i, hole, n)) return;
      this.g.sendResult({ seat: s.i, hole, n, state, to: shot.to });
      st.ball = state === 'oob' ? { x: p.from[0], y: p.from[1], z: p.from[2] } : state === 'rest' ? p.rest : null;
      st.ballN = n + 1;
      st.n = n + 1;
      st.phase = 'idle';
      st.readyAt = this.g.sharedTime() + THINK[0] + Math.random() * THINK[1];
    });
  }

  // The seat is still ours to drive, on that hole, at that shot number.
  still(i, hole, n) {
    const room = this.g.room, s = room?.seats[i];
    return !!s && this.g.isHost() && room.state === 'playing' && room.phase === 'play' && room.hole === hole && s.ctrl === 'ai' && !s.cur.done && s.cur.n === n;
  }
}
