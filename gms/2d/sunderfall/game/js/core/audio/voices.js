/**
 * Voice pool: fixed slots, priority stealing, per-key rate limiting, distance
 * attenuation and stereo placement.
 *
 * The reason all of this exists: a collapsing buttress in Ruinreach emits several
 * hundred debris impacts inside 400 ms. Uncapped that is a white-noise wall and a
 * dropped frame. Capped, rate-limited and density-compensated it is a rockslide.
 *
 * Every slot owns its gain / lowpass / panner / send nodes for the lifetime of the
 * pool. The only thing allocated per play is the AudioBufferSourceNode, which the
 * WebAudio spec requires to be single-use.
 */

const MIN_G = 0.00015;

export function createVoices(actx, mix, bank, opts = {}) {
  const sfxCap = opts.sfxCap ?? 40;
  const uiCap = opts.uiCap ?? 8;
  const hasPanner = typeof actx.createStereoPanner === 'function';

  const slots = [];
  let token = 1;

  function makeSlot(bus) {
    const gain = actx.createGain();
    gain.gain.value = 0;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;
    lp.Q.value = 0.0001;
    const pan = hasPanner ? actx.createStereoPanner() : null;
    const send = actx.createGain();
    send.gain.value = 0;

    gain.connect(lp);
    if (pan) { lp.connect(pan); pan.connect(mix.input(bus)); }
    else lp.connect(mix.input(bus));
    lp.connect(send);
    send.connect(mix.reverbSend);

    return {
      bus, gain, lp, pan, send,
      src: null, active: false, sticky: false,
      key: '', prio: 0, startAt: 0, endAt: 0, rate: 1, id: 0, baseGain: 1,
    };
  }

  const ambCap = opts.ambCap ?? 10;
  for (let i = 0; i < sfxCap; i++) slots.push(makeSlot('sfx'));
  for (let i = 0; i < uiCap; i++) slots.push(makeSlot('ui'));
  for (let i = 0; i < ambCap; i++) slots.push(makeSlot('ambience'));

  const poolOf = (bus) => (bus === 'ui' ? 'ui' : bus === 'ambience' ? 'ambience' : 'sfx');

  /* ---- listener ------------------------------------------------------- */

  const L = { x: 0, y: 0, halfW: 960, ref: 780, range: 6000 };
  let bend = 1, bendUntil = 0;

  function setListener(x, y, halfWidth) {
    L.x = x; L.y = y;
    if (halfWidth > 0) {
      L.halfW = halfWidth;
      L.ref = halfWidth * 0.85;
      L.range = halfWidth * 7;
    }
  }

  /* ---- rate limiting -------------------------------------------------- */

  const keyState = new Map();   // key -> { last, live, pending }

  function ks(key) {
    let s = keyState.get(key);
    if (!s) { s = { last: -99, live: 0, pending: 0 }; keyState.set(key, s); }
    return s;
  }

  /* ---- allocation ------------------------------------------------------ */

  function reap(now) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.active && !s.sticky && now >= s.endAt) release(s);
    }
  }

  function release(s) {
    s.active = false;
    s.sticky = false;
    if (s.key) { const k = ks(s.key); if (k.live > 0) k.live--; }
    s.key = '';
    s.src = null;
  }

  function stop(s, fade = 0.012) {
    if (!s.active) return;
    const t = actx.currentTime;
    try {
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(Math.max(MIN_G, s.gain.gain.value), t);
      s.gain.gain.exponentialRampToValueAtTime(MIN_G, t + fade);
      if (s.src) s.src.stop(t + fade + 0.005);
    } catch { /* already stopped */ }
    release(s);
  }

  /** Lowest priority first, oldest first inside a priority. */
  function findVictim(bus, prio) {
    let best = null;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.bus !== bus || !s.active || s.sticky) continue;
      if (s.prio > prio) continue;
      if (!best || s.prio < best.prio || (s.prio === best.prio && s.startAt < best.startAt)) best = s;
    }
    return best;
  }

  function alloc(bus, prio) {
    const now = actx.currentTime;
    reap(now);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.bus === bus && !s.active) return s;
    }
    const v = findVictim(bus, prio);
    if (v) { stop(v, 0.008); return v; }
    return null;
  }

  /* ---- playback -------------------------------------------------------- */

  const out = { id: 0, slot: null };

  /**
   * @param key   already resolved to a real bank key
   * @param o     { x, y, volume, pitch, variation, pan, delay, prio, force, loop, sticky }
   * @returns     voice id (>0) or 0 if the sound was rate-limited, stolen out, or muted
   */
  function play(key, o) {
    const rec = bank.get(key);
    if (!rec) return 0;
    const now = actx.currentTime;
    const st = ks(key);

    const prio = (o && o.prio !== undefined) ? o.prio : rec.prio;
    const force = !!(o && o.force);
    const loop = !!(o && o.loop) || (!!rec.loop && !!(o && o.sustain));

    // rate limit: too soon, or too many of this exact sound already ringing
    if (!force && !loop) {
      if (now - st.last < rec.rate) { st.pending++; return 0; }
      if (st.live >= rec.max) {
        // steal our own oldest rather than adding to the pile
        let oldest = null;
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          if (s.active && !s.sticky && s.key === key && (!oldest || s.startAt < oldest.startAt)) oldest = s;
        }
        if (oldest) stop(oldest, 0.01); else { st.pending++; return 0; }
      }
    }

    // Spatialisation first: an out-of-range sound must not steal a slot on its way out.
    let att = 1, panv = 0;
    const positional = o && (o.x !== undefined || o.y !== undefined) && rec.bus !== 'ui';
    if (positional) {
      const dx = (o.x || 0) - L.x;
      const dy = (o.y || 0) - L.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > L.range && !force) { st.pending++; return 0; }
      att = L.ref / (L.ref + dist);
      panv = Math.max(-1, Math.min(1, dx / L.halfW)) * 0.82;
    } else if (o && o.pan !== undefined) {
      panv = Math.max(-1, Math.min(1, o.pan));
    }

    const slot = alloc(poolOf(rec.bus), prio);
    if (!slot) { st.pending++; return 0; }

    const vol = (o && o.volume !== undefined ? o.volume : 1);
    // density bonus: sounds suppressed by the rate limit make the next one bigger,
    // so a hundred bricks read as a rockslide instead of a metronome
    const dens = Math.min(0.45, st.pending * 0.06);
    st.pending = 0;

    let g = rec.gain * vol * att * (1 + dens);
    if (g < 0.0008) { return 0; }
    if (g > 4) g = 4;

    const variation = o && o.variation !== undefined ? o.variation : 1;
    const variant = rec.variants > 1 ? (Math.random() * rec.variants) | 0 : 0;
    const buf = bank.audioBuffer(actx, key, variant);
    if (!buf) return 0;

    let rate = (o && o.pitch ? o.pitch : 1);
    if (rec.pitchVar && variation) rate *= 1 + (Math.random() * 2 - 1) * rec.pitchVar * variation;
    if (now < bendUntil) rate *= bend;
    if (rate < 0.25) rate = 0.25; else if (rate > 4) rate = 4;

    const src = actx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (loop) { src.loop = true; if (rec.loopEnd) src.loopEnd = rec.loopEnd; }
    src.connect(slot.gain);

    const when = now + (o && o.delay ? o.delay : 0);
    const atk = o && o.attack ? o.attack : (loop ? 0.08 : 0);
    slot.gain.gain.cancelScheduledValues(now);
    if (atk > 0) {
      slot.gain.gain.setValueAtTime(MIN_G, when);
      slot.gain.gain.exponentialRampToValueAtTime(Math.max(MIN_G, g), when + atk);
    } else {
      slot.gain.gain.setValueAtTime(g, when);
    }

    const sendAmt = (o && o.send !== undefined ? o.send : rec.send) * (positional ? 0.5 + 0.5 * (1 - att) : 1);
    slot.send.gain.setTargetAtTime(sendAmt, now, 0.01);

    // distant things are dull, not just quiet — the single biggest depth cue
    const cut = positional ? Math.max(700, 19000 * Math.pow(att, 0.85)) : 20000;
    slot.lp.frequency.setValueAtTime(cut, now);

    if (slot.pan) slot.pan.pan.setTargetAtTime(panv, now, 0.005);

    try { src.start(when); } catch { return 0; }

    slot.src = src;
    slot.active = true;
    slot.sticky = loop;
    slot.key = key;
    slot.prio = prio;
    slot.startAt = when;
    slot.rate = rate;
    slot.baseGain = g;
    slot.endAt = loop ? Infinity : when + buf.duration / rate + 0.05;
    slot.id = token++;
    st.last = now;
    st.live++;

    out.id = slot.id;
    out.slot = slot;
    return slot.id;
  }

  function slotById(id) {
    for (let i = 0; i < slots.length; i++) if (slots[i].active && slots[i].id === id) return slots[i];
    return null;
  }

  /* ---- hitstop --------------------------------------------------------- */

  /**
   * Hitstop pitch-bend. Live one-shots sag with the freeze, which is what makes a
   * big impact feel like it has mass. Music and ambience are on other buses and are
   * never touched, so the score never stutters.
   */
  function setTimeScale(scale, seconds) {
    const s = Math.max(0, Math.min(1, scale));
    if (s >= 0.98 || seconds <= 0) return;
    const now = actx.currentTime;
    bend = 0.68 + 0.32 * s;
    bendUntil = now + seconds;
    for (let i = 0; i < slots.length; i++) {
      const v = slots[i];
      if (!v.active || v.bus === 'ui' || !v.src) continue;
      try {
        const pr = v.src.playbackRate;
        pr.cancelScheduledValues(now);
        pr.setValueAtTime(pr.value, now);
        pr.linearRampToValueAtTime(v.rate * bend, now + 0.012);
        pr.setTargetAtTime(v.rate, now + seconds, 0.03);
      } catch { /* source already ended */ }
    }
  }

  /* ---- loop handles ----------------------------------------------------- */

  const handles = [];
  function handle(id) {
    let h = handles.pop();
    if (!h) {
      h = {
        id: 0,
        get alive() { return !!slotById(this.id); },
        volume(v) { const s = slotById(this.id); if (s) s.gain.gain.setTargetAtTime(Math.max(MIN_G, s.baseGain * v), actx.currentTime, 0.05); return this; },
        pitch(p) { const s = slotById(this.id); if (s && s.src) { s.rate = p; s.src.playbackRate.setTargetAtTime(p, actx.currentTime, 0.05); } return this; },
        move(x, y) {
          const s = slotById(this.id);
          if (!s) return this;
          const dx = x - L.x, dy = y - L.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const att = L.ref / (L.ref + d);
          s.gain.gain.setTargetAtTime(Math.max(MIN_G, s.baseGain * att), actx.currentTime, 0.08);
          s.lp.frequency.setTargetAtTime(Math.max(700, 19000 * Math.pow(att, 0.85)), actx.currentTime, 0.08);
          if (s.pan) s.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / L.halfW)) * 0.82, actx.currentTime, 0.08);
          return this;
        },
        stop(fade = 0.25) {
          const s = slotById(this.id);
          if (s) { s.sticky = false; stop(s, Math.max(0.01, fade)); }
          this.id = 0;
          if (handles.length < 16) handles.push(this);
          return this;
        },
      };
    }
    h.id = id;
    return h;
  }

  const DEAD = {
    id: 0, alive: false,
    volume() { return this; }, pitch() { return this; }, move() { return this; }, stop() { return this; },
  };

  return {
    play,
    stop(id, fade) { const s = slotById(id); if (s) { s.sticky = false; stop(s, fade ?? 0.02); } },
    stopKey(key, fade) { for (const s of slots) if (s.active && s.key === key) { s.sticky = false; stop(s, fade ?? 0.05); } },
    stopAll(fade = 0.05) { for (const s of slots) if (s.active) { s.sticky = false; stop(s, fade); } },
    loop(key, o) {
      const id = play(key, o ? { ...o, loop: true } : { loop: true });
      return id ? handle(id) : DEAD;
    },
    setListener,
    setTimeScale,
    update() { reap(actx.currentTime); },
    get count() { let n = 0; for (const s of slots) if (s.active) n++; return n; },
    get cap() { return slots.length; },
    get slots() { return slots; },
    keyState,
  };
}
