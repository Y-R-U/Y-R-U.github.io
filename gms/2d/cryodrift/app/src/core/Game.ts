import type { Application } from 'pixi.js';
import { SIM_HZ } from '../config/feel';
import type { UpgradeDef } from '../config/balance';
import { Input } from '../input/Input';
import { emptyInput, type InputState } from '../input/InputState';
import { Renderer } from '../render/Renderer';
import { Juice } from '../render/effects';
import { HUD } from '../hud/HUD';
import { Sound } from '../audio/Sound';
import { World } from '../sim/World';
import { applyUpgrade, stepWorld } from '../sim/sim';
import { Loop } from './Loop';

export type GameState = 'menu' | 'playing' | 'paused' | 'over';

/**
 * Central controller: owns the world, the fixed-timestep loop, and the bridge from
 * sim events to audio / particles / juice / HUD. Scene/menu code drives it via
 * start/pause/resume/pickUpgrade and the on* callbacks.
 */
export class Game {
  state: GameState = 'menu';
  world: World;
  strainId = 'cyto';

  readonly renderer: Renderer;
  readonly hud: HUD;
  readonly juice = new Juice();

  onWaveClear?: (choices: UpgradeDef[]) => void;
  onDeath?: (world: World) => void;

  private loop: Loop;
  private input: InputState = emptyInput();
  private upgradePrompted = false;

  constructor(
    private readonly app: Application,
    private readonly inputMgr: Input,
    private readonly sound: Sound,
  ) {
    this.renderer = new Renderer(app, inputMgr);
    this.hud = new HUD();
    app.stage.addChild(this.hud.view);
    this.hud.view.visible = false;

    this.world = new World('cyto');
    this.world.demo = true;

    this.loop = new Loop(
      SIM_HZ,
      (dt) => {
        if (this.state === 'playing' || this.world.demo) stepWorld(this.world, this.input, dt);
      },
      (alpha) => this.renderer.render(this.world, this.input, alpha, this.juice),
    );
  }

  startDemo(): void {
    this.world = new World('cyto');
    this.world.demo = true;
    this.state = 'menu';
    this.hud.view.visible = false;
  }

  start(strainId: string): void {
    this.strainId = strainId;
    this.world = new World(strainId);
    this.state = 'playing';
    this.upgradePrompted = false;
    this.hud.view.visible = true;
    this.sound.unlock();
  }

  restart(): void {
    this.start(this.strainId);
  }

  pause(): void {
    if (this.state === 'playing') this.state = 'paused';
  }
  resume(): void {
    if (this.state === 'paused') this.state = 'playing';
  }

  pickUpgrade(id: string): void {
    applyUpgrade(this.world, id);
    this.upgradePrompted = false;
    this.sound.ui();
  }

  /** Driven by the Pixi ticker every frame. */
  tick(ms: number): void {
    const realDt = ms / 1000;
    this.input = this.inputMgr.sample();
    const scale = this.juice.update(realDt);

    if (this.state === 'paused') {
      // freeze sim, keep one render so the frozen frame stays on screen
      this.renderer.render(this.world, this.input, 1, this.juice);
    } else {
      this.loop.tick(ms * scale);
    }

    this.renderer.particles.update(realDt);

    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (this.hud.view.visible) this.hud.update(this.world, w, h, realDt);

    this.drainEvents();

    // wave-clear upgrade prompt
    if (this.state === 'playing' && this.world.pendingUpgrade && !this.upgradePrompted) {
      this.upgradePrompted = true;
      this.onWaveClear?.(this.world.upgradeChoices);
    }

    // death
    if (this.state === 'playing' && this.world.state === 'dead') {
      this.state = 'over';
      this.onDeath?.(this.world);
    }
  }

  private drainEvents(): void {
    const ev = this.world.events;
    const part = this.renderer.particles;
    const j = this.juice;
    const s = this.sound;
    for (const e of ev) {
      const x = e.x ?? 0;
      const y = e.y ?? 0;
      switch (e.type) {
        case 'fire':
          s.fire();
          break;
        case 'enemyFire':
          s.enemyFire();
          break;
        case 'hit':
          part.emit(x, y, 5, { color: e.color ?? 0x7cf6c0, speed: 160, life: 0.35, size: 2.4, glow: true });
          s.hit();
          break;
        case 'kill':
          part.emit(x, y, 22, { color: e.color ?? 0xff6f7a, speed: 260, life: 0.7, size: 3, glow: true });
          j.addShake(4);
          j.microPause(0.06);
          s.kill();
          break;
        case 'explosion':
          part.emit(x, y, 36, { color: e.color ?? 0xffb14d, speed: 380, life: 0.8, size: 3.4, glow: true });
          j.addShake(12);
          j.addFlash(e.color ?? 0xffb14d, 0.12);
          s.explosion();
          break;
        case 'lysis':
          part.emit(x, y, 48, { color: 0xb98bff, speed: 520, life: 0.7, size: 3.6, glow: true });
          j.addShake(14);
          j.addFlash(0xb98bff, 0.14);
          s.lysis();
          break;
        case 'engulf':
          part.emit(x, y, 20, { color: 0x5ff3d0, speed: 200, life: 0.5, size: 3, glow: true });
          s.engulf();
          break;
        case 'absorb':
          part.emit(x, y, 6, { color: 0x8be36b, speed: 120, life: 0.4, size: 2, glow: true });
          s.absorb();
          break;
        case 'organelle':
          part.emit(x, y, 24, { color: 0xb98bff, speed: 220, life: 0.7, size: 2.6, glow: true });
          s.organelle();
          break;
        case 'playerHit':
          j.addShake(8 + (e.n ?? 0) * 0.5);
          j.addFlash(0xff4d5e, 0.22);
          part.emit(x, y, 14, { color: 0xff4d5e, speed: 220, life: 0.5, size: 2.6, glow: true });
          s.playerHit();
          break;
        case 'waveStart':
          this.hud.flashBanner(`CULTURE · DAY ${e.n}`);
          s.wave();
          break;
        case 'death':
          j.addShake(22);
          j.addFlash(0xff4d5e, 0.4);
          part.emit(x, y, 60, { color: 0x5ff3d0, speed: 420, life: 1.1, size: 4, glow: true });
          s.death();
          break;
      }
    }
    ev.length = 0;
  }
}
