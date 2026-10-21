// One remote plane's state stream (docs/ONLINE.md §3): unwraps the u16 room-time stamp, keeps ~1.5 s of
// samples, and sizes the render delay from measured lateness: 100 ms, growing with jitter to 300 ms.
// Pure (no DOM), so node can test it.

export const DELAY_MIN = 100, DELAY_MAX = 300, LOST_MS = 600, AUTOPILOT_MS = 2500;
const KEEP_MS = 1500, PERIOD = 1000 / 15;

export function unwrap16(t16, nowRT) {
  const n16 = ((Math.round(nowRT) % 65536) + 65536) % 65536;
  const d = ((t16 - n16 + 98304) % 65536) - 32768;
  return Math.round(nowRT) + d;
}

export class RemoteTrack {
  constructor() {
    this.samples = [];
    this.lateMean = 0;
    this.lateDev = 0;
    this.n = 0;
    this.delay = DELAY_MIN;
    this.lastRT = -Infinity;
  }

  // state: unpackState() output (has t16). Returns false for a duplicate or out-of-order packet.
  push(state, nowRT) {
    const t = unwrap16(state.t16, nowRT);
    const last = this.samples[this.samples.length - 1];
    if (last && t <= last.t) return false;
    const late = nowRT - t;
    if (this.n++ === 0) this.lateMean = late;
    else {
      this.lateDev += (Math.abs(late - this.lateMean) - this.lateDev) * 0.1;
      this.lateMean += (late - this.lateMean) * 0.1;
    }
    this.delay = Math.min(DELAY_MAX, Math.max(DELAY_MIN, this.lateMean + PERIOD + 2 * this.lateDev));
    state.t = t;
    this.samples.push(state);
    this.lastRT = nowRT;
    while (this.samples.length > 2 && this.samples[1].t < nowRT - KEEP_MS) this.samples.shift();
    return true;
  }

  renderMs(nowRT) { return nowRT - this.delay; }
  latest() { return this.samples[this.samples.length - 1] || null; }

  // 'live' → 'lost' after LOST_MS without packets (faint ghost) → 'autopilot' after AUTOPILOT_MS (host flies it, O4).
  health(nowRT) {
    if (!this.samples.length) return 'empty';
    const gap = nowRT - this.lastRT;
    return gap > AUTOPILOT_MS ? 'autopilot' : gap > LOST_MS ? 'lost' : 'live';
  }
}
