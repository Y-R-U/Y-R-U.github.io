export function createTimer({ onTick, onEnd, tickMs = 100 } = {}) {
  let limit = 0, startAt = 0, pausedAt = 0, pausedTotal = 0, id = null, running = false;
  const now = () => performance.now();
  const elapsed = () => (running ? (pausedAt || now()) - startAt - pausedTotal : 0);
  const remaining = () => (limit ? Math.max(0, limit - elapsed()) : 0);
  function loop() {
    if (!running || pausedAt) return;
    const r = remaining();
    onTick && onTick(r, limit);
    if (limit && r <= 0) { stop(); onEnd && onEnd(); }
  }
  function start(ms) {
    stop();
    limit = ms; startAt = now(); pausedAt = 0; pausedTotal = 0; running = true;
    id = setInterval(loop, tickMs);
    loop();
  }
  function stop() { running = false; if (id) clearInterval(id); id = null; }
  function pause() { if (running && !pausedAt) pausedAt = now(); }
  function resume() { if (pausedAt) { pausedTotal += now() - pausedAt; pausedAt = 0; } }
  function add(ms) { limit += ms; }
  return { start, stop, pause, resume, add, remaining, elapsed, get limit() { return limit; }, get running() { return running; } };
}
