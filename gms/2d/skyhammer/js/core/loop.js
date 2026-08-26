// Fixed 60 Hz accumulator + a frame-time histogram. Render interpolates on `alpha`.

export const STEP = 1000 / 60;

export function makeLoop({ update, render }) {
  let acc = 0, last = 0, raf = 0, running = false;
  const hist = new Float64Array(64);          // 1 ms buckets, 0..63 ms
  let frames = 0, sumMs = 0, worst = 0;

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dtMs = now - last;
    last = now;
    if (dtMs > 250) dtMs = STEP;              // tab was backgrounded; do not spiral
    hist[Math.min(63, Math.max(0, Math.round(dtMs)))]++;
    frames++; sumMs += dtMs;
    if (dtMs > worst) worst = dtMs;

    acc += dtMs;
    let steps = 0;
    while (acc >= STEP && steps < 6) { update(); acc -= STEP; steps++; }
    if (steps === 6) acc = 0;
    render(acc / STEP);
  }

  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    stats() {
      let n = 0, p50 = 0, p95 = 0, p99 = 0, seen = 0;
      for (let i = 0; i < 64; i++) n += hist[i];
      for (let i = 0; i < 64; i++) {
        seen += hist[i];
        if (!p50 && seen >= n * 0.50) p50 = i;
        if (!p95 && seen >= n * 0.95) p95 = i;
        if (!p99 && seen >= n * 0.99) p99 = i;
      }
      return { frames, fps: frames ? 1000 / (sumMs / frames) : 0, p50, p95, p99, worst: Math.round(worst), n };
    },
    histogram() { return Array.from(hist); },
    reset() { hist.fill(0); frames = 0; sumMs = 0; worst = 0; },
  };
}
