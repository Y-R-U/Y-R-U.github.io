import { createApp } from './core/App';
import { initSafeArea } from './core/safearea';
import { applyQuality, detectTier, DPR_CAP } from './core/quality';
import { Game } from './core/Game';
import { Input } from './input/Input';
import { Sound } from './audio/Sound';
import { UI } from './ui/UI';
import { loadGameTextures } from './render/textures';

/**
 * Boot + wiring. Sim/render/input/audio are all owned by Game; this file just
 * assembles them, mounts the DOM UI, and pumps the Pixi ticker.
 */
async function main(): Promise<void> {
  initSafeArea();

  const stage = document.getElementById('stage')!;
  const boostBtn = document.getElementById('boost')!;
  const specialBtn = document.getElementById('special')!;

  const app = await createApp(stage, DPR_CAP[detectTier()]);
  const sound = new Sound();
  const input = new Input(app.canvas, boostBtn, specialBtn);
  input.onFirstInput = () => sound.unlock();

  const game = new Game(app, input, sound);
  applyQuality(game.renderer);

  const ui = new UI(game, sound);
  ui.showMenu();

  // backdrop textures load after first paint, then pop in + (re)apply quality filters
  void loadGameTextures().then((tex) => {
    game.renderer.setBackground(tex);
    applyQuality(game.renderer);
  });

  app.ticker.add((ticker) => game.tick(ticker.deltaMS));

  // pause on backgrounding
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') {
      game.pause();
      ui.showPause();
    }
  });

  // portrait guard — nudge to rotate on landscape phones
  const rotate = document.getElementById('rotate')!;
  const coarse = window.matchMedia('(pointer: coarse)');
  const checkOrientation = (): void => {
    const landscape = window.innerWidth > window.innerHeight && coarse.matches;
    rotate.classList.toggle('hidden', !landscape);
    if (landscape && game.state === 'playing') {
      game.pause();
      ui.showPause();
    }
  };
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

  // dev: live feel/balance tuning (stripped from production build)
  if (import.meta.env.DEV) {
    const { DebugHUD } = await import('./ui/DebugHUD');
    const dbg = new DebugHUD();
    app.ticker.add(() => dbg.update(game.world, app.ticker.deltaMS));
    // ?play=<strain> jumps straight into a run (for quick testing / screenshots)
    const p = new URLSearchParams(location.search).get('play');
    if (p !== null) {
      document.getElementById('ui')!.replaceChildren();
      document.getElementById('controls')!.classList.remove('hidden');
      game.start(p || 'cyto');
    }
  }
}

void main();
