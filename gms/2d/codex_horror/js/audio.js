(function () {
  const tracks = Array.from({ length: 9 }, (_, index) => `music/theme${index + 1}.mp3`);
  let audio;
  let settings = { music: true, volume: 0.55 };
  let queue = [];
  let attempted = 0;

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

  function tryPlay() {
    if (!audio || !settings.music || attempted >= tracks.length) return;
    if (!audio.src) audio.src = nextTrack();
    audio.volume = settings.volume;
    audio.play().catch(() => {});
  }

  window.BlackGlassAudio = {
    init(el, initialSettings) {
      audio = el;
      settings = Object.assign(settings, initialSettings);
      audio.volume = settings.volume;
      audio.addEventListener("error", () => {
        attempted += 1;
        audio.removeAttribute("src");
        audio.load();
        if (attempted < tracks.length && settings.music) {
          audio.src = nextTrack();
          tryPlay();
        }
      });
      audio.addEventListener("ended", () => {
        audio.src = nextTrack();
        tryPlay();
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
      tryPlay();
    },
    prime() {
      attempted = 0;
      tryPlay();
    },
  };
})();
