export const DURATION = 60;
export const WIND_DURATION = 5;
export const IMPACT_DELAY = 0.8;

export class Heist {
  constructor() { this.reset(); }
  reset() {
    this.time = 0;
    this.furthest = 0;
    this.playing = false;
    this.windAt = null;
    this.dropAt = null;
    this.takeAt = null;
    this.echo = false;
    this.recording = false;
    this.won = false;
    this.replaying = false;
    this.rewinds = 0;
  }
  get power() { return this.windAt !== null && this.time >= this.windAt && this.time < this.windAt + WIND_DURATION; }
  get impact() { return this.dropAt !== null && this.time >= this.dropAt + IMPACT_DELAY; }
  get open() { return this.dropAt !== null && this.time >= this.dropAt + 2.7; }
  get canDrop() { return !this.won && this.power && this.echo && !this.recording && (this.dropAt === null || this.time < this.dropAt); }
  get taken() { return this.takeAt !== null && this.time >= this.takeAt; }
  wind() {
    if (this.windAt !== null || this.won) return false;
    this.windAt = this.time;
    this.recording = true;
    this.playing = true;
    return true;
  }
  seek(time) {
    if (this.recording || !Number.isFinite(time)) return;
    const target = Math.max(0, Math.min(this.furthest, time));
    if (target < this.time - 0.05 && this.windAt !== null) {
      if (!this.echo) this.rewinds++;
      this.echo = true;
      this.recording = false;
    }
    this.time = target;
    this.playing = false;
  }
  drop() {
    if (!this.canDrop) return false;
    this.dropAt = this.time;
    this.takeAt = null;
    this.playing = true;
    return true;
  }
  take() {
    if (!this.open || this.taken || this.won) return false;
    this.takeAt = this.time;
    this.won = true;
    this.playing = true;
    return true;
  }
  tick(dt) {
    if (!this.playing || !Number.isFinite(dt)) return;
    const limit = this.recording ? this.windAt + WIND_DURATION : DURATION;
    this.time = Math.min(limit, this.time + Math.max(0, dt));
    this.furthest = Math.max(this.furthest, this.time);
    if (this.recording && this.time >= this.windAt + WIND_DURATION) {
      this.time = this.windAt + WIND_DURATION;
      this.recording = false;
      this.playing = false;
    }
    if (this.time >= DURATION || (this.takeAt !== null && this.time >= this.takeAt + 3)) this.playing = false;
  }
  replay() {
    if (!this.won) return;
    this.time = 0;
    this.playing = true;
    this.replaying = true;
    this.recording = false;
  }
}
