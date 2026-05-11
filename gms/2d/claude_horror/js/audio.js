// THE HOLLOW — music player.
// Looks for music/theme1.mp3 .. theme9.mp3 (user-supplied). Plays available tracks
// in random order, crossfading on `ended`. No track found = silent (no error UI).

(function () {
  const MAX_TRACKS = 9;
  const FADE_MS = 1200;

  const audio = document.getElementById('bg-audio');
  const tracks = [];        // discovered URLs
  let probed = false;
  let started = false;
  let currentIdx = -1;
  let targetVolume = 0.6;
  let muted = true;
  let fadeRaf = null;

  function url(i) { return `music/theme${i}.mp3`; }

  // HEAD-probe each candidate. We skip 404s silently.
  // Done lazily on first `play()` so the page loads fast.
  async function probe() {
    if (probed) return;
    probed = true;
    const checks = [];
    for (let i = 1; i <= MAX_TRACKS; i++) {
      checks.push(
        fetch(url(i), { method: 'HEAD' })
          .then(r => (r.ok ? url(i) : null))
          .catch(() => null)
      );
    }
    const found = (await Promise.all(checks)).filter(Boolean);
    tracks.push(...found);
  }

  function pickNextIdx() {
    if (tracks.length <= 1) return 0;
    let next;
    do { next = Math.floor(Math.random() * tracks.length); }
    while (next === currentIdx);
    return next;
  }

  function fadeTo(volume, ms = FADE_MS) {
    cancelAnimationFrame(fadeRaf);
    const start = audio.volume;
    const t0 = performance.now();
    function step(now) {
      const k = Math.min(1, (now - t0) / ms);
      audio.volume = start + (volume - start) * k;
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    }
    fadeRaf = requestAnimationFrame(step);
  }

  async function playRandom() {
    if (muted) return;
    await probe();
    if (tracks.length === 0) return;
    currentIdx = pickNextIdx();
    audio.src = tracks[currentIdx];
    audio.loop = false; // we handle the next-track shuffle
    audio.volume = 0;
    try {
      await audio.play();
      fadeTo(targetVolume);
      started = true;
    } catch (e) {
      // autoplay blocked — wait for next user gesture
      started = false;
    }
  }

  audio.addEventListener('ended', () => {
    if (!muted) playRandom();
  });
  // If a track 404s mid-stream or fails to decode, drop it from rotation and try the next.
  audio.addEventListener('error', () => {
    if (currentIdx >= 0 && currentIdx < tracks.length) tracks.splice(currentIdx, 1);
    currentIdx = -1;
    if (!muted && tracks.length > 0) playRandom();
  });

  // Public API
  window.Music = {
    setMuted(m) {
      muted = m;
      if (muted) {
        fadeTo(0, 400);
        setTimeout(() => { try { audio.pause(); } catch (e) {} }, 450);
      } else {
        if (audio.src && audio.paused) {
          audio.play().then(() => fadeTo(targetVolume)).catch(() => playRandom());
        } else {
          playRandom();
        }
      }
    },
    setVolume(v) {
      targetVolume = Math.max(0, Math.min(1, v));
      if (!muted) fadeTo(targetVolume, 200);
    },
    // Call on any user gesture so a future autoplay can succeed.
    primeOnGesture() {
      if (started || muted) return;
      playRandom();
    },
    isMuted: () => muted,
  };
})();
