// One online match on this client, as host (runs the sim) or guest (mirrors snapshots).
// DOM-free: the browser (js/main.js) and the node harness (tools/net_test.mjs) drive the same code.
import { CONFIG } from '../config.js';
import { createSim, SIM_DT, modeOf, modeDuration } from '../sim/sim.js';
import { applyModeLooks } from '../sim/match.js';
import { eventSim } from '../meta/events.js';
import { encodeEmote } from './proto.js';
import { createBots } from '../sim/bots.js';
import { createRng } from '../sim/rng.js';
import { playerFor } from '../meta/names.js';
import { botCosmetics } from '../meta/shop.js';
import { createHost } from './host.js';
import { createGuest } from './guest.js';

// The host builds this when the room starts: humans first (join order), bots fill to 8.
// mode: the room's game mode; events: the live event ids (their sim overrides travel with the match).
export function buildMeta({ seed, members, mode = 'classic', events = [] }) {
  const rng = createRng('meta:' + seed);
  const teams = CONFIG.TEAMS.slice(0, CONFIG.MATCH.crowds);
  const specs = CONFIG.BOTS.slice();
  for (let i = specs.length - 1; i > 0; i--) { const j = rng.int(i + 1); [specs[i], specs[j]] = [specs[j], specs[i]]; }
  const players = teams.map((t, i) => {
    const m = members[i];
    if (m) return { id: m.id, name: m.name, color: t.color, team: t.name, human: true, persona: 'opportunist', skill: 0.8, cos: m.cos || {} };
    const s = specs[i % specs.length], p = playerFor('online:' + seed + ':' + i);
    return { id: '', name: p.name, flag: p.flag, color: t.color, team: t.name, human: false, persona: s.persona, skill: Math.min(0.85, s.skill), throttle: 0.92, cos: botCosmetics('online:' + seed + ':' + i, 2) };
  });
  mode = modeOf(mode);
  applyModeLooks(players, mode, seed);
  return { v: 1, seed: String(seed), mode, events: events.slice(0, 6), duration: modeDuration(mode), countdown: CONFIG.MATCH.countdown, players };
}

const simPlayers = (meta) => meta.players.map((p, i) => ({ id: p.id || 'b' + i, name: p.name, color: p.color, isBot: !p.human, remote: !!p.human, persona: p.persona, skill: p.skill, team: p.team, horde: !!p.horde }));
export const metaConfig = (meta) => eventSim(Array.isArray(meta.events) ? meta.events : []);

export function createNetMatch({ map, meta, me, role, epoch = 0, sendBin = () => {}, restore = null, offline = false }) {
  let host = null, guest = null, sim = null, bots = null;
  let acc = 0, autopilot = false, over = false, crownSecs = 0, lastState = null, lastPeer = 0;
  const frameEvents = [];
  const players = meta.players.map((p) => ({ ...p }));
  const mode = modeOf(meta.mode), config = metaConfig(meta);
  const localEvents = [];

  function startHost(fromState, ep) {
    sim = createSim({ seed: meta.seed, map, players: simPlayers(meta), mode, config, duration: meta.duration, countdown: meta.countdown, restore: fromState });
    const idx = players.map((p, i) => i);
    bots = createBots({ sim, indices: idx, specs: players.map((p) => ({ persona: p.persona || 'opportunist', skill: p.skill ?? 0.7, throttle: p.throttle ?? 1 })), seed: meta.seed + ':' + ep });
    host = createHost({ sim, bots, me, send: offline ? () => {} : sendBin, epoch: ep });
    players.forEach((p, i) => {
      if (i === me) { sim.setRemote(i, true, p.name); bots.setEnabled(i, autopilot); }
      else if (p.human) host.setRemote(i, true, p.name);
      else sim.setRemote(i, false);
    });
    guest = null;
    role = 'host';
    acc = 0;
  }

  function startGuest() {
    guest = createGuest({ map, me, players, send: sendBin, mode, config: { ...CONFIG.SIM, ...config } });
    host = null; sim = null; bots = null;
    role = 'guest';
  }

  if (role === 'host') startHost(restore, epoch); else startGuest();

  // maxSteps: a hidden host tab is pumped by a 1 Hz timer, so it may need ~30 steps at once.
  function frame(now, dt, ax = 0, az = 0, maxSteps = 8) {
    frameEvents.length = 0;
    for (const e of localEvents) frameEvents.push(e);
    localEvents.length = 0;
    if (role === 'host') {
      for (const e of host.takeEmotes()) frameEvents.push(e);
      acc += Math.min(dt, maxSteps * SIM_DT);
      let steps = 0;
      while (acc >= SIM_DT && steps < maxSteps) {
        const st = sim.state;
        bots.setEnabled(me, autopilot);
        host.beforeStep(now);
        if (!autopilot) sim.setInput(me, st.phase === 'play' ? ax : 0, st.phase === 'play' ? az : 0);
        sim.step();
        const ev = sim.drainEvents();
        for (let i = 0; i < ev.length; i++) frameEvents.push(ev[i]);
        host.afterStep(ev);
        if (st.phase === 'play' && st.leader === me) crownSecs += SIM_DT;
        acc -= SIM_DT; steps++;
      }
      if (steps === maxSteps) acc = Math.min(acc, SIM_DT);
      lastState = sim.state;
      return { state: sim.state, events: frameEvents, alpha: Math.min(1, acc / SIM_DT) };
    }
    if (!guest.synced) return { state: lastState, events: frameEvents, alpha: 1 };
    const r = guest.update(now, dt, ax, az, autopilot);
    for (const e of r.events) frameEvents.push(e);
    const st = r.state;
    if (st.phase === 'play' && st.leader === me) crownSecs += dt;
    lastState = st;
    lastPeer = guest.lastRecv;
    return { state: st, events: frameEvents, alpha: 1 };
  }

  // Guest → host after a host change (or when the server is lost for good: offline = true).
  function promote({ epoch: ep, away = [], offline: off = false } = {}) {
    if (role === 'host') { host.key(); for (const c of away) host.setAway(c, true); return true; }
    const rs = guest.restoreState();
    if (!rs) return false;
    if (off) offline = true;
    startHost(rs, ep ?? 0);
    for (const c of away) host.setAway(c, true);
    if (offline) for (const [c] of host.remote) host.setAway(c, true);
    return true;
  }

  function demote() {
    if (role === 'guest') return;
    startGuest();
  }

  // Host: give a late joiner the bot crowd whose size is nearest the bots' median (never the leader).
  function pickBotCrowd() {
    if (role !== 'host') return -1;
    const st = sim.state;
    const cand = players.map((p, i) => i).filter((i) => !players[i].human && i !== me && !st.crowds[i].out);
    if (!cand.length) return -1;
    const pool = cand.filter((i) => i !== st.leader && st.crowds[i].alive);
    const list = pool.length ? pool : cand;
    const counts = list.map((i) => st.crowds[i].count).sort((a, b) => a - b);
    const med = counts[counts.length >> 1];
    list.sort((a, b) => Math.abs(st.crowds[a].count - med) - Math.abs(st.crowds[b].count - med) || a - b);
    return list[0];
  }

  function assign(crowd, who, name, cos = null) {
    players[crowd] = { ...players[crowd], id: who, name, human: true, flag: '', cos: cos || {} };
    meta.players[crowd] = { ...meta.players[crowd], id: who, name, human: true, flag: '', cos: cos || {} };
    if (role === 'host') host.setRemote(crowd, true, name);
  }

  function setPlayers(next) {
    next.forEach((p, i) => { if (players[i]) Object.assign(players[i], p); });
  }

  function result() {
    const st = role === 'host' ? sim.state : guest.latest;
    if (!st) return null;
    return st.crowds.map((c, i) => ({ crowd: i, count: c.count, best: c.best, kills: c.kills, rank: c.rank }));
  }

  // Your emote: the host puts it straight into the stream; a guest sends it to the host first.
  function emote(id) {
    if (role === 'host') { const e = { type: 'emote', crowd: me, id, tick: sim.state.tick }; host.pushEvent(e); }
    else if (guest && guest.synced) sendBin(encodeEmote(guest.localTick, id));
  }

  return {
    frame, promote, demote, pickBotCrowd, assign, setPlayers, result, emote, mode,
    onSnap: (b, now) => { if (guest) guest.onSnap(b, now); },
    onInput: (b, now) => { if (host) host.onInput(b, now); },
    setAway: (c, away) => { if (host) host.setAway(c, away); },
    setAutopilot(v) { autopilot = !!v; },
    get autopilot() { return autopilot; },
    get role() { return role; },
    get me() { return me; },
    get players() { return players; },
    get meta() { return meta; },
    get state() { return role === 'host' ? sim.state : lastState; },
    get ready() { return role === 'host' || !!(guest && guest.synced); },
    get sim() { return sim; },
    get host() { return host; },
    get guest() { return guest; },
    get crownSecs() { return crownSecs; },
    get offline() { return offline; },
    get lastPeer() { return lastPeer; },
    get over() { return over; },
    set over(v) { over = v; },
  };
}
