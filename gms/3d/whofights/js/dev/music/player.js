// The audition player: one <audio>, a scrub bar, and a note of what is loaded. Separate from the
// game runtime — this is for deciding whether a take is any good, not for testing fades.

import { el, clock } from './ui.js';

export class Auditioner {
  constructor(base = '') {
    this.base = base;
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.track = null;
    this.listeners = new Set();
    for (const ev of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'error']) {
      this.audio.addEventListener(ev, () => this.emit());
    }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  get playing() { return this.track && !this.audio.paused && !this.audio.ended; }

  toggle(track) {
    if (this.track?.id === track.id && !this.audio.paused) return this.audio.pause();
    if (this.track?.id !== track.id) {
      this.track = track;
      this.audio.src = this.base + track.file;
      this.error = null;
    }
    this.audio.play().catch(e => { this.error = e.message; this.emit(); });
    this.emit();
  }

  stop() { this.audio.pause(); this.audio.removeAttribute('src'); this.track = null; this.emit(); }

  bar() {
    const wrap = el('div', 'mus-bar');
    const btn = el('button', 'primary', '▶');
    const now = el('div', 'mus-now');
    const scrub = el('input');
    scrub.type = 'range'; scrub.min = 0; scrub.max = 1000; scrub.value = 0; scrub.step = 1;
    const t = el('div', 'mus-t', '0:00 / 0:00');
    btn.onclick = () => { if (this.track) this.toggle(this.track); };
    scrub.oninput = () => {
      const d = this.audio.duration;
      if (d) this.audio.currentTime = (+scrub.value / 1000) * d;
    };
    const paint = () => {
      const tr = this.track;
      now.innerHTML = '';
      now.append(el('b', null, tr ? (tr.title || tr.id) : 'nothing loaded'),
        el('span', 'dim', tr ? `${tr.id} · ${tr.kind || ''} ${tr.mood || ''}` : 'pick a track below'));
      btn.textContent = this.playing ? '❚❚' : '▶';
      btn.disabled = !tr;
      const d = this.audio.duration || tr?.seconds || 0;
      if (document.activeElement !== scrub) scrub.value = d ? Math.round((this.audio.currentTime / d) * 1000) : 0;
      t.textContent = this.error ? this.error : `${clock(this.audio.currentTime)} / ${clock(d)}`;
      t.className = this.error ? 'mus-t bad' : 'mus-t';
    };
    this.onChange(paint);
    paint();
    wrap.append(btn, now, scrub, t);
    return wrap;
  }
}
