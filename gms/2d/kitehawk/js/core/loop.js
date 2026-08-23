export const DT = 1 / 60;

/**
 * Fixed 60 Hz sim, uncapped interpolated render (§3.1). `update(dt)` always
 * receives exactly DT — never read performance.now() or Date.now() inside it
 * (§10 rule 8). Real time belongs to `render(alpha, dtReal)` and R.tick(dtReal).
 */

/* timeScale scales the accumulator, never DT — hitstop must not change physics. */
export function createLoop({ update, render, getTimeScale, maxSteps = 5, onStats = null }) {
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;

  let fpsAcc = 0, fpsFrames = 0;
  const loop = {
    fps: 60,
    ms: 16.7,
    steps: 0,
    frame: 0,
    get running() { return running; },
  };

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);

    let real = (now - last) / 1000;
    last = now;
    // a tab-switch or a breakpoint hands us a huge delta; never try to catch up
    if (real > 0.25) real = 0.25;
    if (real < 0) real = 0;

    const ts = getTimeScale ? getTimeScale() : 1;
    acc += real * ts;

    let steps = 0;
    while (acc >= DT && steps < maxSteps) {
      update(DT);
      acc -= DT;
      steps++;
    }
    // hit the ceiling: drop the backlog instead of spiralling
    if (steps === maxSteps && acc > DT) acc = 0;
    loop.steps = steps;

    render(acc / DT, real);

    loop.frame++;
    fpsAcc += real;
    fpsFrames++;
    if (fpsAcc >= 0.4) {
      loop.fps = fpsFrames / fpsAcc;
      loop.ms = (fpsAcc * 1000) / fpsFrames;
      fpsAcc = 0; fpsFrames = 0;
      if (onStats) onStats(loop);
    }
  }

  loop.start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(tick);
  };

  loop.stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  // Coming back from a hidden tab with a stale timestamp would fire the spiral
  // clamp every time; reset instead.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && running) { last = performance.now(); acc = 0; }
  });

  return loop;
}
