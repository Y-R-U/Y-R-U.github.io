// Fixed-step accumulator. The sim only ever advances in whole 1/60 ticks (D3),
// and the renderer interpolates between the last two.
//
// The catch-up cap matters: after a tab has been backgrounded for a minute the
// accumulator holds a minute of time, and without a cap the first frame back
// runs 3600 sim steps and hangs the page.

export const STEP = 1 / 60;
const MAX_CATCHUP = 5;

export function makeLoop(step, render) {
  let acc = 0, last = 0, raf = 0, running = false;
  let fps = 60, fpsAcc = 0, fpsN = 0;

  const frame = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const dt = last ? Math.min(0.25, (now - last) / 1000) : STEP;
    last = now;

    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_CATCHUP) { step(); acc -= STEP; n++; }
    if (n === MAX_CATCHUP) acc = 0;   // we are behind; drop the debt, do not spiral

    render(acc / STEP, dt);
  };

  return {
    start() { if (running) return; running = true; last = 0; acc = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    get fps() { return fps; },
    // one deterministic frame, for the headless gates
    tick() { step(); render(0, STEP); },
  };
}
