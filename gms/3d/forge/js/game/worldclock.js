// Drives the pure clock into the existing `time` lighting knob, and rebases onto that knob when
// the panel or a scenario writes it, so the two can never hold different times.

import { advance, hourOf, dayOf, weekdayOf, isEighthDay, crossedDay, bellsBetween } from './clock.js';

const PUSH = 0.25;   // seconds between knob writes: 4 Hz is 0.06° of sun travel at the default rate

export class WorldClock {
  constructor(player) {
    this.player = player;
    this.t = 0;
    this.acc = 0;
    this.paused = false;
    this.writing = false;
    this.pushed = null;
    this.fade = null;
    this.dayMinutes = 24;
    this.nightRate = 1;
    this.startHour = 4;
    this.listeners = new Map();
  }

  registerKnobs(q) {
    this.q = q;
    q.register({ key: 'dayMinutes', label: 'Day length (real min)', type: 'range', min: 0, max: 120, step: 1, default: 24, group: 'World' },
      v => { this.dayMinutes = v; });
    q.register({ key: 'nightRate', label: 'Night speed', type: 'range', min: 1, max: 6, step: 0.1, default: 1, group: 'World' },
      v => { this.nightRate = v; });
    q.register({ key: 'startHour', label: 'Start hour', type: 'range', min: 0, max: 24, step: 0.5, default: 4, group: 'World' },
      v => { this.startHour = v; });
    this.rebase(q.get('time') ?? this.startHour);
    this.unsubscribe = q.onChange(key => {
      if (key === 'time' && !this.writing) this.rebase(q.get('time'));
    });
  }

  get hoursPerMinute() { return this.dayMinutes > 0 ? 24 / this.dayMinutes : 0; }
  get rate() { return this.hoursPerMinute / 60; }   // SYSTEMS.md §9.1 asks for game-hours per real second
  get hour() { return hourOf(this.t); }
  get day() { return dayOf(this.t); }
  get weekday() { return weekdayOf(this.t); }
  get eighthDay() { return isEighthDay(this.t); }

  update(dt) { this.tick(dt); }

  tick(dt) {
    if (this.paused || !this.player?.enabled) return;
    const before = this.t;
    if (this.fade) {
      const f = this.fade;
      f.el = Math.min(f.el + dt, f.dur);
      this.t = f.from + (f.to - f.from) * (f.el / f.dur);
      if (f.el >= f.dur) { this.t = f.to; this.fade = null; }
    } else {
      this.t = advance(this.t, dt, this.hoursPerMinute, this.nightRate);
    }
    for (const bell of bellsBetween(before, this.t)) this.emit('bell', bell);
    if (crossedDay(before, this.t)) this.emit('day', dayOf(this.t));
    this.acc += dt;
    if (this.fade) { this.acc = 0; return this.push(); }
    if (this.acc < PUSH) return;
    this.acc -= PUSH;
    this.push();
  }

  push() {
    const hour = +this.hour.toFixed(3);
    if (hour === this.pushed || !this.q) return;
    this.pushed = hour;
    this.writing = true;
    this.q.set('time', hour);
    this.writing = false;
  }

  // Keeps the current day and moves within it, so scrubbing the panel slider is never a day roll.
  rebase(hour) {
    if (typeof hour !== 'number' || Number.isNaN(hour)) return;
    this.t += hour - this.hour;
    this.pushed = +this.hour.toFixed(3);
    this.acc = 0;
    this.fade = null;
  }

  reset(hour = this.startHour) {
    this.t = hour;
    this.fade = null;
    this.acc = 0;
    this.pushed = null;
    this.push();
  }

  // SYSTEMS.md §9.1's required method. Returns the hours skipped; the gap is crossfaded rather
  // than jumped so the player watches the time pass instead of waiting for it.
  advanceTo(hour, dur = 1.2) {
    return this.waitUntil(this.t + (hour - this.hour) + (hour <= this.hour ? 24 : 0), dur);
  }

  waitUntil(t, dur = 1.2) {
    if (!(t > this.t)) return 0;
    this.fade = { from: this.t, to: t, dur, el: 0 };
    return t - this.t;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  toJSON() { return { t: this.t }; }

  load(state) {
    if (typeof state?.t === 'number' && Number.isFinite(state.t)) this.t = state.t;
    this.fade = null;
    this.acc = 0;
    this.pushed = null;
    this.push();
  }

  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.listeners.get(evt).delete(fn);
  }

  emit(evt, arg) { for (const fn of this.listeners.get(evt) || []) fn(arg); }
}
