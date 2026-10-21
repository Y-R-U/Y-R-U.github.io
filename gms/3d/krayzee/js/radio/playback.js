// Minimal playback used until/unless the AUDIO lane's playRadio is passed in. Clip if we have one, else timed subtitle.

export function estimateSeconds(text, maxSeconds) {
  const words = String(text).trim().split(/\s+/).length;
  const est = 0.75 + words * 0.36;
  return Math.max(1.4, Math.min(est, maxSeconds || 6));
}

export function createFallbackPlayer() {
  let volume = 1;
  let cur = null;
  return {
    setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); },
    play({ url, text, maxSeconds, duration }) {
      const secs = duration || estimateSeconds(text, maxSeconds);
      let audio = null, timer = 0, resolve;
      const done = new Promise((r) => (resolve = r));
      const finish = () => { clearTimeout(timer); if (audio) { audio.onended = audio.onerror = null; audio.pause(); } resolve(); };
      const arm = (s) => { clearTimeout(timer); timer = setTimeout(finish, s * 1000); };
      if (url && volume > 0) {
        audio = new Audio(url);
        audio.volume = volume;
        audio.onended = finish;
        audio.onerror = () => arm(secs);
        audio.onloadedmetadata = () => { if (isFinite(audio.duration)) arm(Math.min(audio.duration, (maxSeconds || 8) + 0.5) + 0.25); };
        audio.play().catch(() => arm(secs));
        arm(Math.max(secs, maxSeconds || 0) + 1.5);
      } else arm(secs);
      cur = { stop: finish };
      return { done, stop: finish };
    },
    stop() { cur?.stop(); },
  };
}
