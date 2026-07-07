// ---- goal replay: ring buffer of recent frames, played back slow-mo ----

const HZ = 30;
const SECONDS = 4.2;
const MAX_FRAMES = (HZ * SECONDS) | 0;

export class Replay {
  constructor() {
    // per frame: ball(x,y,z) + 22 players (x,y,dir,pose) = 3 + 88
    this.stride = 3 + 22 * 4;
    this.buf = new Float32Array(MAX_FRAMES * this.stride);
    this.count = 0;
    this.head = 0;        // next write slot
    this.acc = 0;
    this.active = false;
    this.playT = 0;
    this.playFrames = 0;
    this.speed = 0.55;
  }

  clear() { this.count = 0; this.head = 0; this.acc = 0; }

  record(match, dt) {
    this.acc += dt;
    if (this.acc < 1 / HZ) return;
    this.acc %= (1 / HZ);
    const o = this.head * this.stride;
    const b = this.buf;
    b[o] = match.ball.x; b[o + 1] = match.ball.y; b[o + 2] = match.ball.z;
    let i = o + 3;
    for (const f of match.all) {
      const { d, p } = f.pose();
      b[i++] = f.x; b[i++] = f.y; b[i++] = d; b[i++] = p;
    }
    this.head = (this.head + 1) % MAX_FRAMES;
    if (this.count < MAX_FRAMES) this.count++;
  }

  begin() {
    if (this.count < HZ) return false;
    this.active = true;
    this.playT = 0;
    this.playFrames = this.count;
    return true;
  }

  // writes the recorded frame into match entities; returns false when finished
  step(match, dt) {
    if (!this.active) return false; // skipped
    this.playT += dt * this.speed * HZ;
    const fi = this.playT | 0;
    if (fi >= this.playFrames - 1) { this.active = false; return false; }
    const t = this.playT - fi;
    const idx0 = (this.head - this.playFrames + fi + MAX_FRAMES * 2) % MAX_FRAMES;
    const idx1 = (idx0 + 1) % MAX_FRAMES;
    const o0 = idx0 * this.stride, o1 = idx1 * this.stride;
    const b = this.buf;
    const L = (a, c) => a + (c - a) * t;
    match.ball.x = L(b[o0], b[o1]);
    match.ball.y = L(b[o0 + 1], b[o1 + 1]);
    match.ball.z = L(b[o0 + 2], b[o1 + 2]);
    let i0 = o0 + 3, i1 = o1 + 3;
    for (const f of match.all) {
      f.x = L(b[i0], b[i1]);
      f.y = L(b[i0 + 1], b[i1 + 1]);
      f.replayDir = b[i0 + 2];
      f.replayPose = b[i0 + 3];
      i0 += 4; i1 += 4;
    }
    return true;
  }

  skip() { this.active = false; }
}
