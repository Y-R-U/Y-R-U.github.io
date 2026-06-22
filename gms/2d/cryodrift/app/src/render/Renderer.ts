import { Application, Container, DisplacementFilter, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { PAL } from '../config/palette';
import { WAVE } from '../config/balance';
import { settings } from '../core/settings';
import type { Input } from '../input/Input';
import type { InputState } from '../input/InputState';
import type { World } from '../sim/World';
import type { Body } from '../sim/movement';
import { Particles, Juice } from './effects';
import type { GameTextures } from './textures';

const ARENA = WAVE.arenaRadius;
const GRID = 90;
type Tier = 'high' | 'medium' | 'low';

const ix = (b: Body, a: number): number => b.prev.x + (b.pos.x - b.prev.x) * a;
const iy = (b: Body, a: number): number => b.prev.y + (b.pos.y - b.prev.y) * a;

/**
 * Draws the world (reads sim state only — build plan §4). Parallax haze backdrop,
 * an emissive `fx` layer carrying bloom + a displacement "membrane wobble", and a
 * microscope vignette. Heavy filters are gated by quality tier (§7).
 */
export class Renderer {
  readonly bg = new Container();
  readonly worldLayer = new Container();
  readonly fx = new Container();
  readonly overlay = new Container();
  readonly particles = new Particles();

  private grid = new Graphics();
  private dish = new Graphics();
  private haz = new Graphics();
  private bodies = new Graphics();
  private enemies = new Graphics();
  private proj = new Graphics();
  private player = new Graphics();
  private sticks = new Graphics();
  private flash = new Graphics();

  private hazeFar?: TilingSprite;
  private hazeNear?: TilingSprite;
  private vignette?: Sprite;
  private noiseSprite?: Sprite;
  private displacement?: DisplacementFilter;
  private bloom?: AdvancedBloomFilter;
  private textures?: GameTextures;

  camX = 0;
  camY = 0;
  tier: Tier = 'high';
  // view bounds in world space (for off-screen culling), recomputed each frame
  private vL = 0;
  private vR = 0;
  private vT = 0;
  private vB = 0;

  private inView(x: number, y: number, m: number): boolean {
    return x > this.vL - m && x < this.vR + m && y > this.vT - m && y < this.vB + m;
  }

  constructor(
    private readonly app: Application,
    private readonly input: Input,
  ) {
    this.worldLayer.addChild(this.grid, this.dish, this.haz, this.bodies);
    this.fx.addChild(this.proj, this.enemies, this.player, this.particles.g);
    this.worldLayer.addChild(this.fx);
    app.stage.addChild(this.bg, this.worldLayer, this.overlay);
    this.overlay.addChild(this.sticks, this.flash);
  }

  setQuality(tier: Tier, density: number): void {
    this.tier = tier;
    this.particles.density = density;
    this.applyFilters();
  }

  /** Called once game textures finish loading. */
  setBackground(t: GameTextures): void {
    this.textures = t;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.hazeFar = new TilingSprite({ texture: t.hazeFar, width: w, height: h });
    this.hazeFar.tileScale.set(1.5);
    this.hazeFar.alpha = 0.5;
    this.hazeNear = new TilingSprite({ texture: t.hazeNear, width: w, height: h });
    this.hazeNear.tileScale.set(0.9);
    this.hazeNear.alpha = 0.32;
    this.bg.addChild(this.hazeFar, this.hazeNear);

    this.vignette = new Sprite(t.vignette);
    this.overlay.addChildAt(this.vignette, 0);

    this.noiseSprite = new Sprite(t.noise);
    this.noiseSprite.renderable = false;
    this.fx.addChild(this.noiseSprite);

    this.applyFilters();
  }

  private applyFilters(): void {
    if (!this.textures || !this.noiseSprite) return;
    if (!this.displacement) {
      this.displacement = new DisplacementFilter({ sprite: this.noiseSprite, scale: 14 });
    }
    if (!this.bloom) {
      this.bloom = new AdvancedBloomFilter({ threshold: 0.35, bloomScale: 0.9, brightness: 1, blur: 6, quality: 4 });
    }
    const wobble = !settings.reduceMotion;
    if (this.tier === 'high') {
      this.displacement.scale.set(14);
      this.bloom.bloomScale = 0.95;
      this.fx.filters = wobble ? [this.displacement, this.bloom] : [this.bloom];
    } else if (this.tier === 'medium') {
      this.bloom.bloomScale = 0.7;
      this.fx.filters = [this.bloom];
    } else {
      this.fx.filters = [];
    }
    if (this.hazeNear) this.hazeNear.visible = this.tier !== 'low';
  }

  render(world: World, input: InputState, alpha: number, juice: Juice): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const px = ix(world.player, alpha);
    const py = iy(world.player, alpha);
    this.camX = px;
    this.camY = py;
    this.vL = px - w / 2;
    this.vR = px + w / 2;
    this.vT = py - h / 2;
    this.vB = py + h / 2;
    this.worldLayer.position.set(w / 2 - px + juice.shakeX, h / 2 - py + juice.shakeY);

    this.drawBackground(w, h, world.time);
    this.drawGrid(w, h);
    this.drawDish();
    this.drawHazards(world);
    this.drawBodies(world, alpha);
    this.drawProjectiles(world, alpha);
    this.drawEnemies(world, alpha);
    this.drawPlayer(world, alpha);
    this.particles.draw();
    this.drawSticks();
    this.drawAim(input, w, h, world);
    this.drawFlash(w, h, juice);
  }

  private drawBackground(w: number, h: number, time: number): void {
    if (this.hazeFar) {
      this.hazeFar.width = w;
      this.hazeFar.height = h;
      this.hazeFar.tilePosition.set(-this.camX * 0.12 + time * 2, -this.camY * 0.12);
    }
    if (this.hazeNear) {
      this.hazeNear.width = w;
      this.hazeNear.height = h;
      this.hazeNear.tilePosition.set(-this.camX * 0.34 - time * 4, -this.camY * 0.34);
    }
    if (this.vignette) {
      this.vignette.width = w * 1.05;
      this.vignette.height = h * 1.05;
      this.vignette.position.set(-w * 0.025, -h * 0.025);
    }
    if (this.noiseSprite) {
      this.noiseSprite.position.set(Math.sin(time * 0.3) * 30, Math.cos(time * 0.23) * 30);
      this.noiseSprite.scale.set(2 + Math.sin(time * 0.5) * 0.1);
    }
  }

  private drawGrid(w: number, h: number): void {
    const g = this.grid;
    g.clear();
    const left = this.camX - w / 2;
    const right = this.camX + w / 2;
    const top = this.camY - h / 2;
    const bottom = this.camY + h / 2;
    for (let x = Math.floor(left / GRID) * GRID; x <= right; x += GRID) g.moveTo(x, top).lineTo(x, bottom);
    for (let y = Math.floor(top / GRID) * GRID; y <= bottom; y += GRID) g.moveTo(left, y).lineTo(right, y);
    g.stroke({ width: 1, color: PAL.membrane, alpha: 0.045 });
  }

  private drawDish(): void {
    const g = this.dish;
    g.clear();
    g.circle(0, 0, ARENA).stroke({ width: 6, color: PAL.membrane, alpha: 0.18 });
    g.circle(0, 0, ARENA).stroke({ width: 1.5, color: PAL.player, alpha: 0.25 });
    g.circle(0, 0, ARENA - 40).stroke({ width: 60, color: PAL.membrane, alpha: 0.03 });
  }

  private drawHazards(world: World): void {
    const g = this.haz;
    g.clear();
    for (const z of world.phZones) {
      const pulse = 0.5 + Math.sin(z.phase * 1.5) * 0.5;
      g.circle(z.x, z.y, z.radius).fill({ color: PAL.phZone, alpha: 0.05 + pulse * 0.04 });
      g.circle(z.x, z.y, z.radius).stroke({ width: 1.5, color: PAL.phZone, alpha: 0.18 + pulse * 0.12 });
      g.circle(z.x, z.y, z.radius * 0.6).stroke({ width: 1, color: PAL.phZone, alpha: 0.1 });
    }
  }

  private drawBodies(world: World, a: number): void {
    const g = this.bodies;
    g.clear();
    for (const ab of world.antibodies.items) {
      if (!ab.alive) continue;
      const x = ix(ab, a);
      const y = iy(ab, a);
      if (!this.inView(x, y, ab.radius + 10)) continue;
      g.circle(x, y, ab.radius + 4).fill({ color: PAL.macrophage, alpha: 0.05 });
      for (let i = 0; i < 5; i++) {
        const ang = ab.heading + (i / 5) * Math.PI * 2;
        const r = ab.radius * 0.62;
        g.circle(x + Math.cos(ang) * r, y + Math.sin(ang) * r, ab.radius * 0.42).fill({ color: PAL.macrophage, alpha: 0.14 });
      }
      g.circle(x, y, ab.radius).stroke({ width: 1.2, color: PAL.danger, alpha: 0.3 });
    }
    for (const pk of world.pickups.items) {
      if (!pk.alive) continue;
      const x = ix(pk, a);
      const y = iy(pk, a);
      if (!this.inView(x, y, 20)) continue;
      const tw = 0.7 + Math.sin(pk.wobble) * 0.3;
      if (pk.kind === 'nutrient') {
        g.circle(x, y, pk.radius + 3).fill({ color: PAL.nutrient, alpha: 0.12 * tw });
        g.circle(x, y, pk.radius * 0.7).fill({ color: PAL.nutrient, alpha: 0.85 });
        g.circle(x, y, pk.radius * 0.32).fill({ color: PAL.nutrientSpark, alpha: 0.95 });
      } else {
        g.circle(x, y, pk.radius + 5).fill({ color: PAL.mutation, alpha: 0.14 * tw });
        g.circle(x, y, pk.radius * 0.8).stroke({ width: 2, color: PAL.mutation, alpha: 0.9 });
        g.circle(x, y, pk.radius * 0.36).fill({ color: PAL.nutrientSpark, alpha: 0.9 });
      }
    }
  }

  private drawProjectiles(world: World, a: number): void {
    const g = this.proj;
    g.clear();
    for (const pr of world.projectiles.items) {
      if (!pr.alive) continue;
      const x = ix(pr, a);
      const y = iy(pr, a);
      if (!this.inView(x, y, 30)) continue;
      const col = pr.team === 0 ? PAL.toxin : PAL.danger;
      g.moveTo(x - pr.vel.x * 0.02, y - pr.vel.y * 0.02).lineTo(x, y).stroke({ width: pr.radius * 0.9, color: col, alpha: 0.4, cap: 'round' });
      g.circle(x, y, pr.radius + 2).fill({ color: col, alpha: 0.18 });
      g.circle(x, y, pr.radius).fill({ color: col, alpha: 0.95 });
    }
  }

  private drawEnemies(world: World, a: number): void {
    const g = this.enemies;
    g.clear();
    for (const e of world.enemies.items) {
      if (!e.alive) continue;
      const x = ix(e, a);
      const y = iy(e, a);
      if (!this.inView(x, y, 60)) continue;
      const tint = e.def.tint;
      const flash = e.hitFlash;
      g.circle(x, y, e.radius + 6).fill({ color: tint, alpha: 0.06 });
      g.circle(x, y, e.radius).fill({ color: tint, alpha: 0.16 + flash * 0.5 });
      g.circle(x, y, e.radius).stroke({ width: 2, color: flash > 0.1 ? 0xffffff : tint, alpha: 0.85 });
      g.circle(x, y, e.radius * 0.32).fill({ color: tint, alpha: 0.9 });
      if (e.fuse > 0) {
        const p = 0.5 + Math.sin(world.time * 40) * 0.5;
        g.circle(x, y, e.radius + 4 + p * 6).stroke({ width: 2, color: PAL.dangerWarm, alpha: 0.3 + p * 0.5 });
      }
      if (e.maxHp > 40) {
        const frac = Math.max(0, e.hp / e.maxHp);
        g.arc(x, y, e.radius + 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).stroke({ width: 2.5, color: tint, alpha: 0.7 });
      }
    }
  }

  private drawPlayer(world: World, a: number): void {
    const g = this.player;
    g.clear();
    const p = world.player;
    if (!p.alive || world.state === 'dead') return;
    const x = ix(p, a);
    const y = iy(p, a);
    const tint = world.strain.tint;
    const r = p.radius;
    const flick = p.invuln > 0 ? 0.45 + Math.sin(world.time * 50) * 0.35 : 1;
    g.circle(x, y, r + 12).fill({ color: tint, alpha: 0.05 * flick });
    g.circle(x, y, r + 5).fill({ color: tint, alpha: 0.09 * flick });
    g.circle(x, y, r).fill({ color: tint, alpha: 0.18 * flick });
    g.circle(x, y, r).stroke({ width: 2.5, color: tint, alpha: 0.95 * flick });
    g.circle(x, y, r * 0.34).fill({ color: PAL.playerCore, alpha: 0.9 * flick });
    const hx = Math.cos(p.heading);
    const hy = Math.sin(p.heading);
    const speed = Math.hypot(p.vel.x, p.vel.y);
    const bright = Math.min(1, speed / 480);
    g.moveTo(x, y).lineTo(x + hx * (r + 16), y + hy * (r + 16)).stroke({ width: 2, color: PAL.playerCore, alpha: (0.25 + bright * 0.5) * flick, cap: 'round' });
  }

  private drawSticks(): void {
    const g = this.sticks;
    g.clear();
    for (const s of this.input.sticks) {
      const col = s.side === 'thrust' ? PAL.player : PAL.toxin;
      g.circle(s.ox, s.oy, 52).stroke({ width: 1.5, color: col, alpha: 0.2 });
      g.moveTo(s.ox, s.oy).lineTo(s.kx, s.ky).stroke({ width: 2, color: col, alpha: 0.3 });
      g.circle(s.kx, s.ky, 22).fill({ color: col, alpha: 0.16 });
      g.circle(s.kx, s.ky, 22).stroke({ width: 1.5, color: col, alpha: 0.5 });
    }
  }

  private drawAim(input: InputState, w: number, h: number, world: World): void {
    if (!input.firing || world.state === 'dead') return;
    const cx = w / 2;
    const cy = h / 2;
    const x = cx + input.aimX * 70;
    const y = cy + input.aimY * 70;
    const g = this.sticks;
    g.circle(x, y, 7).stroke({ width: 1.5, color: PAL.toxin, alpha: 0.6 });
    g.circle(x, y, 2).fill({ color: PAL.toxin, alpha: 0.9 });
  }

  private drawFlash(w: number, h: number, juice: Juice): void {
    const g = this.flash;
    g.clear();
    if (juice.flashAlpha > 0.01) g.rect(0, 0, w, h).fill({ color: juice.flashColor, alpha: juice.flashAlpha });
  }
}
