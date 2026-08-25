(() => {
  // Self-contained sound + juice layer. game.js calls window.DRKFX.* when present.
  const MUTE_KEY = "drk_muted";
  const MUSIC_KEY = "drk_music";
  let ctx = null;
  let master = null;
  let muted = false;
  let musicOn = false;
  let musicNodes = null;
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
    musicOn = localStorage.getItem(MUSIC_KEY) === "1";
  } catch {
    muted = false;
    musicOn = false;
  }

  function ensureCtx() {
    try {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, start, dur, { type = "sine", gain = 0.2, glideTo = null } = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, ctx.currentTime + start + dur);
    env.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    env.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.02);
  }

  function noise(start, dur, gain = 0.15) {
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    env.gain.value = gain;
    src.buffer = buffer;
    src.connect(env);
    env.connect(master);
    src.start(ctx.currentTime + start);
  }

  const SOUNDS = {
    click: () => tone(520, 0, 0.06, { type: "triangle", gain: 0.12 }),
    tab: () => tone(680, 0, 0.05, { type: "square", gain: 0.08 }),
    buy: () => { tone(440, 0, 0.08, { type: "triangle", gain: 0.16 }); tone(660, 0.06, 0.1, { type: "triangle", gain: 0.16 }); },
    sell: () => { tone(660, 0, 0.08, { type: "triangle", gain: 0.16 }); tone(440, 0.06, 0.1, { type: "triangle", gain: 0.16 }); },
    cash: () => { tone(880, 0, 0.07, { type: "square", gain: 0.12 }); tone(1320, 0.07, 0.16, { type: "square", gain: 0.12 }); },
    deal: () => { noise(0, 0.05, 0.18); tone(300, 0, 0.04, { type: "square", gain: 0.06 }); },
    spin: () => { for (let i = 0; i < 6; i += 1) tone(300 + i * 40, i * 0.05, 0.05, { type: "square", gain: 0.05 }); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.18, { type: "triangle", gain: 0.18 })); },
    bigwin: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.28, { type: "sawtooth", gain: 0.14 })); },
    lose: () => { tone(330, 0, 0.28, { type: "sawtooth", gain: 0.16, glideTo: 110 }); },
    error: () => { tone(200, 0, 0.12, { type: "square", gain: 0.12 }); },
    goal: () => { [659, 880, 1175].forEach((f, i) => tone(f, i * 0.1, 0.3, { type: "triangle", gain: 0.18 })); },
    rest: () => { tone(392, 0, 0.4, { type: "sine", gain: 0.12, glideTo: 523 }); },
    newday: () => { tone(440, 0, 0.3, { type: "sine", gain: 0.12, glideTo: 880 }); }
  };

  function play(name) {
    if (muted) return;
    try {
      if (!ensureCtx()) return;
      const fn = SOUNDS[name];
      if (fn) fn();
    } catch {
      /* never let audio break a click */
    }
  }

  // ---------- visuals ----------

  function floatText(text, tone = "good", anchor) {
    const el = document.createElement("div");
    el.className = `fx-float ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : "good"}`;
    el.textContent = text;
    let x = window.innerWidth / 2;
    let y = window.innerHeight * 0.32;
    const node = typeof anchor === "string" ? document.getElementById(anchor) : anchor;
    if (node && node.getBoundingClientRect) {
      const r = node.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1100);
  }

  function flash(tone = "good") {
    const el = document.createElement("div");
    el.className = `fx-flash ${tone}`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 420);
  }

  function shake(node) {
    const el = typeof node === "string" ? document.getElementById(node) : node;
    if (!el) return;
    el.classList.remove("fx-shake");
    void el.offsetWidth;
    el.classList.add("fx-shake");
    window.setTimeout(() => el.classList.remove("fx-shake"), 500);
  }

  function confetti(count = 90) {
    const colors = ["#36eca0", "#ff5b7d", "#f4d35e", "#bff7df", "#ffffff"];
    const wrap = document.createElement("div");
    wrap.className = "fx-confetti";
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement("i");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(piece);
    }
    document.body.appendChild(wrap);
    window.setTimeout(() => wrap.remove(), 3400);
  }

  function setMuted(value) {
    muted = Boolean(value);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!muted) play("click");
  }

  // ---------- ambient music (gentle pad, default off) ----------
  function startMusic() {
    if (musicNodes || !ensureCtx()) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(master);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 110;       // A2
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 164.81;     // E3
    const o3 = ctx.createOscillator(); o3.type = "triangle"; o3.frequency.value = 220; o3.detune.value = 5;
    [o1, o2, o3].forEach((o) => o.connect(gain));
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);
    [o1, o2, o3, lfo].forEach((o) => o.start());
    musicNodes = { gain, oscs: [o1, o2, o3, lfo] };
  }

  function stopMusic() {
    if (!musicNodes || !ctx) return;
    const { gain, oscs } = musicNodes;
    try {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      oscs.forEach((o) => o.stop(ctx.currentTime + 1.3));
    } catch {
      /* ignore */
    }
    musicNodes = null;
  }

  function setMusic(value) {
    musicOn = Boolean(value);
    try {
      localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (musicOn) startMusic();
    else stopMusic();
  }

  window.DRKFX = {
    play,
    floatText,
    flash,
    shake,
    confetti,
    setMuted,
    isMuted: () => muted,
    setMusic,
    isMusic: () => musicOn
  };
})();
