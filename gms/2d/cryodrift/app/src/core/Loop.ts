/**
 * Fixed-timestep loop with render interpolation.
 *
 * The simulation advances in fixed `step` increments so the feel is identical on
 * 60Hz, 120Hz, and throttled/background tabs. Leftover time becomes `alpha`, the
 * 0..1 blend the renderer uses between the previous and current sim state.
 *
 * Spiral-of-death guarded two ways: clamp a single frame's delta, and cap the
 * number of sub-steps per frame (dropping leftover time if we fall too far behind).
 */
export class Loop {
  private acc = 0;
  private readonly step: number;
  private readonly maxFrame = 0.25; // ignore stalls longer than this (tab switch, breakpoint)
  private readonly maxSubSteps = 5;

  constructor(
    hz: number,
    private readonly onStep: (dt: number) => void,
    private readonly onRender: (alpha: number) => void,
  ) {
    this.step = 1 / hz;
  }

  /** Drive with elapsed wall-clock milliseconds since the last frame. */
  tick(elapsedMs: number): void {
    let frame = elapsedMs / 1000;
    if (frame > this.maxFrame) frame = this.maxFrame;

    this.acc += frame;

    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSubSteps) {
      this.onStep(this.step);
      this.acc -= this.step;
      steps++;
    }
    // fell behind the budget — drop the backlog rather than spiral
    if (steps === this.maxSubSteps && this.acc > this.step) {
      this.acc = 0;
    }

    this.onRender(this.acc / this.step);
  }
}
