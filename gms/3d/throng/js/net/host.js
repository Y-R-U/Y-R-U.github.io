// Host role: this browser runs the real sim and the bots, applies the guests' inputs and
// broadcasts snapshots (deltas at 15 Hz, a keyframe every 8 s).
import { SIM_DT } from '../sim/sim.js';
import { createSnapEncoder, SNAP_EVERY, KEY_EVERY, decodeForwardedInput } from './proto.js';

export const STALE_MS = 2500;  // a guest silent this long gets autopilot until its input returns

export function createHost({ sim, bots, me, send, epoch = 0 }) {
  const enc = createSnapEncoder(sim.state.neutrals.cap);
  const remote = new Map();     // crowd → { ax, az, seq, applied, at, away }
  const pending = [];
  let lastKey = -1e9, forceKey = true;

  function setRemote(crowd, on, name) {
    if (crowd === me) return;
    if (on) {
      const r = remote.get(crowd) || { ax: 0, az: 0, seq: 0, applied: 0, at: 0, away: false };
      r.away = false; r.at = 0;
      remote.set(crowd, r);
      sim.setRemote(crowd, true, name);
    } else {
      remote.delete(crowd);
      sim.setRemote(crowd, false);
      bots.setEnabled(crowd, true);
    }
  }

  function setAway(crowd, away) {
    const r = remote.get(crowd);
    if (r) { r.away = away; if (!away) r.at = 0; }
  }

  function onInput(bytes, now) {
    const m = decodeForwardedInput(bytes);
    if (!m) return;
    const r = remote.get(m.crowd);
    if (!r) return;
    r.ax = m.ax; r.az = m.az; r.seq = m.seq; r.applied = 0; r.at = now;
  }

  // Before each sim step: remote crowds follow their latest input, or a bot if they went quiet.
  function beforeStep(now) {
    for (const [crowd, r] of remote) {
      const live = !r.away && r.at > 0 && now - r.at < STALE_MS;
      bots.setEnabled(crowd, !live);
      r.live = live;
    }
    bots.update();
    for (const [crowd, r] of remote) {
      if (!r.live) continue;
      sim.setInput(crowd, r.ax, r.az);
      r.applied++;
    }
  }

  const acks = [];
  function afterStep(events) {
    for (const e of events) pending.push(e);
    const st = sim.state;
    if (st.tick % SNAP_EVERY) return null;
    const full = forceKey || st.tick - lastKey >= KEY_EVERY;
    if (full) { lastKey = st.tick; forceKey = false; }
    acks.length = 0;
    for (const [crowd, r] of remote) acks[crowd] = r.live ? r : null;
    const bytes = enc.encode(st, pending, { full, epoch, acks });
    pending.length = 0;
    send(bytes);
    return bytes;
  }

  return {
    setRemote, setAway, onInput, beforeStep, afterStep, enc, remote,
    key() { forceKey = true; },
    get epoch() { return epoch; },
    isLive: (crowd) => !!(remote.get(crowd) && remote.get(crowd).live),
    tickMs: SIM_DT * 1000,
  };
}
