import { FEEL } from '../config/feel';
import type { World } from '../sim/World';
import { speedOf } from '../sim/movement';

/**
 * Grey-box instrumentation: an always-on DOM readout (speed / fps / throttle) and,
 * in dev only, a Tweakpane panel bound to FEEL so the flight model can be dialed
 * live — on a phone, over the LAN — without a rebuild. The panel is dynamically
 * imported so it is never shipped in the production bundle.
 */
export class DebugHUD {
  private el: HTMLElement;
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private speedDisplay = 0;

  constructor() {
    this.el = document.getElementById('hud')!;
    this.mountPane();
  }

  update(world: World, frameMs: number): void {
    this.frames++;
    this.acc += frameMs;
    if (this.acc >= 250) {
      this.fps = Math.round((this.frames * 1000) / this.acc);
      this.frames = 0;
      this.acc = 0;
    }
    const sp = speedOf(world.player);
    // smooth the readout a touch so it's legible
    this.speedDisplay += (sp - this.speedDisplay) * 0.2;

    this.el.innerHTML =
      `speed <b>${this.speedDisplay.toFixed(0)}</b>  fps <b>${this.fps}</b>  t <b>${world.time.toFixed(1)}</b>\n` +
      `wave ${world.wave} ${world.phase}  en ${world.enemies.aliveCount} pr ${world.projectiles.aliveCount} pk ${world.pickups.aliveCount}\n` +
      `mem ${world.player.membrane.toFixed(0)} atp ${world.player.atp.toFixed(0)} thrust ${FEEL.thrust} drag ${FEEL.drag.toFixed(2)}`;
  }

  /**
   * Dev-only live tuning. The dynamic import sits directly inside the
   * `import.meta.env.DEV` branch so the whole tweakpane chunk is dead-code
   * eliminated from the production bundle (not merely lazy-loaded).
   */
  private mountPane(): void {
    if (import.meta.env.DEV) {
      void import('tweakpane').then(({ Pane }) => {
        const pane = new Pane({ title: 'feel' });
        // dock bottom-left, out of the thumb zones
        const root = pane.element.parentElement as HTMLElement;
        root.style.position = 'fixed';
        root.style.left = '12px';
        root.style.bottom = '12px';
        root.style.top = 'auto';
        root.style.right = 'auto';
        root.style.width = '220px';
        root.style.zIndex = '10';

        pane.addBinding(FEEL, 'thrust', { min: 100, max: 2500, step: 10 });
        pane.addBinding(FEEL, 'drag', { min: 0.05, max: 0.95, step: 0.01 });
        pane.addBinding(FEEL, 'maxSpeed', { min: 120, max: 1200, step: 10 });
        pane.addBinding(FEEL, 'capSoftness', { min: 0.02, max: 1, step: 0.02 });
        pane.addBinding(FEEL, 'boostThrustMult', { min: 1, max: 3, step: 0.05 });
        pane.addBinding(FEEL, 'boostMaxMult', { min: 1, max: 3, step: 0.05 });
        pane.addBinding(FEEL, 'turnResponse', { min: 0.02, max: 1, step: 0.02 });
      });
    }
  }
}
