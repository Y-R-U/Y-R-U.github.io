const PENTA = [0, 2, 4, 7, 9];

export function createAudio({ enabled = true } = {}) {
  let ctx = null, master = null, on = enabled, noiseBuf = null, lastAt = {}, gestured = false;

  function ensure() {
    if (!on || !gestured) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  const GESTURES = ['click', 'touchend', 'keydown'];
  const unlock = () => {
    gestured = true;
    ensure();
    for (const g of GESTURES) removeEventListener(g, unlock, true);
  };
  for (const g of GESTURES) addEventListener(g, unlock, true);

  function tone(freq, { type = 'sine', at = 0, dur = 0.12, vol = 0.5, slide = 0 } = {}) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise({ at = 0, dur = 0.25, vol = 0.3, from = 400, to = 3000, q = 1.2 } = {}) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf;
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  const note = (step, base = 660) => {
    const oct = Math.floor(step / 5), deg = PENTA[((step % 5) + 5) % 5];
    return base * Math.pow(2, oct + deg / 12);
  };

  function throttle(key, ms) {
    const now = performance.now();
    if (now - (lastAt[key] || 0) < ms) return true;
    lastAt[key] = now;
    return false;
  }

  const sfx = {
    tink(step = 0) { if (throttle('tink', 35)) return; tone(note(Math.min(step, 14), 880), { type: 'triangle', dur: 0.09, vol: 0.28 }); },
    plink(step = 0) { if (throttle('plink', 25)) return; tone(note(Math.min(step, 14), 660), { type: 'sine', dur: 0.14, vol: 0.3 }); },
    kaching() {
      if (throttle('kaching', 120)) return;
      tone(note(7, 660), { type: 'square', dur: 0.08, vol: 0.12 });
      tone(note(9, 660), { type: 'square', at: 0.07, dur: 0.2, vol: 0.12 });
      noise({ at: 0.05, dur: 0.18, vol: 0.12, from: 5000, to: 9000, q: 3 });
    },
    pop() { if (throttle('pop', 40)) return; tone(520, { type: 'sine', dur: 0.08, vol: 0.35, slide: 1.8 }); },
    stamp() { tone(140, { type: 'triangle', dur: 0.22, vol: 0.55, slide: 0.5 }); noise({ dur: 0.12, vol: 0.25, from: 300, to: 120, q: 0.8 }); },
    whoosh() { if (throttle('whoosh', 200)) return; noise({ dur: 0.38, vol: 0.18, from: 300, to: 2400, q: 0.9 }); },
    clunk() { tone(220, { type: 'square', dur: 0.1, vol: 0.18, slide: 0.6 }); },
    nope() { if (throttle('nope', 150)) return; tone(200, { type: 'sine', dur: 0.12, vol: 0.2, slide: 0.8 }); },
    chime() {
      [0, 2, 4, 7].forEach((s, i) => tone(note(s + 5, 523), { type: 'sine', at: i * 0.09, dur: 0.4, vol: 0.22 }));
    },
    sting() {
      [0, 3, 6].forEach((s, i) => tone(note(s, 330) * 0.94, { type: 'sawtooth', at: i * 0.12, dur: 0.35, vol: 0.06 }));
    },
  };

  return {
    sfx,
    get on() { return on; },
    set(v) { on = !!v; if (on) ensure(); },
  };
}

export function haptic(ms = 10) {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(ms); } catch {}
}
