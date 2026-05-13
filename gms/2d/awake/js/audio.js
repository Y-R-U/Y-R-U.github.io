(function () {
  const tracks = Array.from({ length: 9 }, (_, i) => `music/theme${i + 1}.mp3`);
  let audio;
  let settings = { music: true, sound: true, volume: 0.55 };
  let queue = [];
  let primed = false;

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function nextTrack() {
    if (!queue.length) queue = shuffle(tracks);
    return queue.shift();
  }

  function playTheme(forceNew = false) {
    if (!audio || !settings.music) return;
    if (forceNew || !audio.getAttribute("src")) audio.src = nextTrack();
    audio.volume = settings.volume;
    audio.loop = false;
    audio.play().catch(() => {});
  }

  function beep(freq, duration, gain) {
    if (!settings.sound || !primed || !window.AudioContext && !window.webkitAudioContext) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    const ctx = new Context();
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    amp.gain.value = gain * settings.volume;
    osc.connect(amp).connect(ctx.destination);
    osc.start();
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  }

  function layeredClick() {
    if (!settings.sound || !primed || !window.AudioContext && !window.webkitAudioContext) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    const ctx = new Context();
    const high = ctx.createOscillator();
    const low = ctx.createOscillator();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    high.type = "triangle";
    low.type = "sine";
    high.frequency.setValueAtTime(1180, ctx.currentTime);
    high.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.035);
    low.frequency.setValueAtTime(210, ctx.currentTime);
    filter.type = "highpass";
    filter.frequency.value = 160;
    amp.gain.setValueAtTime(0.0001, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.055 * settings.volume, ctx.currentTime + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
    high.connect(filter);
    low.connect(filter);
    filter.connect(amp).connect(ctx.destination);
    high.start();
    low.start();
    high.stop(ctx.currentTime + 0.05);
    low.stop(ctx.currentTime + 0.04);
    setTimeout(() => ctx.close(), 140);
  }

  window.CodexHorrorAudio = {
    init(el, initialSettings) {
      audio = el;
      settings = Object.assign(settings, initialSettings);
      audio.addEventListener("ended", () => playTheme(true));
      audio.addEventListener("error", () => {
        audio.removeAttribute("src");
        audio.load();
        playTheme(true);
      });
    },
    apply(nextSettings) {
      settings = Object.assign(settings, nextSettings);
      if (!audio) return;
      audio.volume = settings.volume;
      if (!settings.music) {
        audio.pause();
        return;
      }
      playTheme(false);
    },
    prime() {
      primed = true;
      playTheme(false);
    },
    click() {
      layeredClick();
    },
    tick() {
      beep(620, 0.055, 0.035);
    },
    danger() {
      beep(120, 0.18, 0.06);
    },
    success() {
      beep(420, 0.08, 0.04);
      setTimeout(() => beep(760, 0.11, 0.035), 80);
    },
  };
})();
