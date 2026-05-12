(function () {
  const tracks = Array.from({ length: 9 }, (_, index) => `music/theme${index + 1}.mp3`);
  const endingTracks = {
    clear_morning: "music/ending_clear.mp3",
    witness: "music/ending_witness.mp3",
    observation: "music/ending_observation.mp3",
    bad: "music/ending_bad.mp3",
  };
  let audio;
  let settings = { music: true, volume: 0.55 };
  let queue = [];
  let attempted = 0;
  let mode = "theme";
  let fadeTimer = null;

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

  function stopFade() {
    if (!fadeTimer) return;
    clearInterval(fadeTimer);
    fadeTimer = null;
  }

  function fadeTo(target, done) {
    stopFade();
    if (!audio) return;
    const start = audio.volume;
    const steps = 12;
    let step = 0;
    fadeTimer = setInterval(() => {
      step += 1;
      const mix = step / steps;
      audio.volume = start + (target - start) * mix;
      if (step >= steps) {
        stopFade();
        audio.volume = target;
        if (done) done();
      }
    }, 55);
  }

  function tryPlay(reset = false) {
    if (!audio || !settings.music || attempted >= tracks.length) return;
    mode = "theme";
    if (reset || !audio.src) audio.src = nextTrack();
    audio.volume = settings.volume;
    audio.loop = false;
    audio.play().catch(() => {});
  }

  function resumeTheme() {
    if (!audio || !settings.music) return;
    attempted = 0;
    audio.src = nextTrack();
    audio.volume = 0;
    mode = "theme";
    audio.loop = false;
    audio.play().then(() => fadeTo(settings.volume)).catch(() => {});
  }

  function endingTrack(id, kind) {
    return endingTracks[id] || endingTracks[kind] || (kind === "bad" ? endingTracks.bad : "");
  }

  window.BlackGlassAudio = {
    init(el, initialSettings) {
      audio = el;
      settings = Object.assign(settings, initialSettings);
      audio.volume = settings.volume;
      audio.addEventListener("error", () => {
        if (mode === "ending") {
          resumeTheme();
          return;
        }
        attempted += 1;
        audio.removeAttribute("src");
        audio.load();
        if (attempted < tracks.length && settings.music) {
          audio.src = nextTrack();
          tryPlay();
        }
      });
      audio.addEventListener("ended", () => {
        if (mode === "ending") {
          resumeTheme();
          return;
        }
        audio.src = nextTrack();
        tryPlay();
      });
      audio.addEventListener("playing", () => {
        if (mode === "theme") attempted = 0;
      });
    },
    apply(nextSettings) {
      settings = Object.assign(settings, nextSettings);
      if (!audio) return;
      audio.volume = settings.volume;
      if (!settings.music) {
        stopFade();
        audio.pause();
        return;
      }
      tryPlay();
    },
    prime() {
      attempted = 0;
      tryPlay();
    },
    playEnding(id, kind) {
      if (!audio || !settings.music) return;
      const src = endingTrack(id, kind);
      if (!src) return;
      stopFade();
      attempted = 0;
      const startEnding = () => {
        mode = "ending";
        audio.src = src;
        audio.loop = false;
        audio.volume = settings.volume;
        audio.play().catch(() => resumeTheme());
      };
      if (!audio.paused) {
        fadeTo(0, startEnding);
      } else {
        startEnding();
      }
    },
  };
})();
