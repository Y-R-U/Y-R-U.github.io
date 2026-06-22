import { Application, Container, Graphics } from 'pixi.js';
import { PAL } from '../config/palette';
import { WAVE } from '../config/balance';
import type { Input } from '../input/Input';
import type { InputState } from '../input/InputState';
import type { World } from '../sim/World';
import type { Body } from '../sim/movement';
import { Particles, Juice } from './effects';

const ARENA = WAVE.arenaRadius;
const GRID = 90;

function ix(b: Body, a: number): number {
  return b.prev.x + (b.pos.x - b.prev.x) * a;
}
function iy(b: Body, a: number): number {
  return b.prev.y + (b.pos.y - b.prev.y) * a;
}

/**
 * Draws the world. Reads sim state only (build plan §4). Camera centres the
 * interpolated player; screen shake offsets the whole world layer. Immediate-mode
 * Graphics for now — P3 swaps emissive bits to textured sprites + filters.
 */
export class Renderer {
  readonly worldLayer = new Container();
  readonly overlay = new Container();
  readonly particles = new Particles();

  private dish = new Graphics();
  private grid = new Graphics();
  private haz = new Graphics();
  private bodies = new Graphics(); // antibodies + pickups
  private enemies = new Graphics();
  private proj = new Graphics();
  private player = new Graphics();
  private sticks = new Graphics();
  private flash = new Graphics();

  camX = 0;
  camY = 0;
  tier: 'high' | 'medium' | 'low' = 'high';

  setQuality(tier: 'high' | 'medium' | 'low', density: number): void {
    this.tier = tier;
    this.particles.density = density;
  }

  constructor(
    private readonly app: Application,
    private readonly input: Input,
  ) {
    this.worldLayer.addChild(this.grid, this.dish, this.haz, this.bodies, this.proj, this.enemies, this.player, this.particles.g);
    this.overlay.addChild(this.sticks, this.flash);
    app.stage.addChild(this.worldLayer, this.overlay);
  }

  render(world: World, input: InputState, alpha: number, juice: Juice): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const px = ix(world.player, alpha);
    const py = iy(world.player, alpha);
    this.camX = px;
    this.camY = py;
    this.worldLayer.position.set(w / 2 - px + juice.shakeX, h / 2 - py + juice.shakeY);

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

  private drawGrid(w: number, h: number): void {
    const g = this.grid;
    g.clear();
    const left = this.camX - w / 2;
    const right = this.camX + w / 2;
    const top = this.camY - h / 2;
    const bottom = this.camY + h / 2;
    for (let x = Math.floor(left / GRID) * GRID; x <= right; x += GRID) {
      g.moveTo(x, top).lineTo(x, bottom);
    }
    for (let y = Math.floor(top / GRID) * GRID; y <= bottom; y += GRID) {
      g.moveTo(left, y).lineTo(right, y);
    }
    g.stroke({ width: 1, color: PAL.membrane, alpha: 0.05 });
  }

  private drawDish(): void {
    const g = this.dish;
    g.clear();
    // meniscus wall — a glowing ring + faint inner vignette band
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
    // antibodies (immune obstacles)
    for (const ab of world.antibodies.items) {
      if (!ab.alive) continue;
      const x = ix(ab, a);
      const y = iy(ab, a);
      g.circle(x, y, ab.radius + 4).fill({ color: PAL.macrophage, alpha: 0.05 });
      for (let i = 0; i < 5; i++) {
        const ang = ab.heading + (i / 5) * Math.PI * 2;
        const r = ab.radius * 0.62;
        g.circle(x + Math.cos(ang) * r, y + Math.sin(ang) * r, ab.radius * 0.42).fill({ color: PAL.macrophage, alpha: 0.14 });
      }
      g.circle(x, y, ab.radius).stroke({ width: 1.2, color: PAL.danger, alpha: 0.3 });
    }
    // pickups
    for (const pk of world.pickups.items) {
      if (!pk.alive) continue;
      const x = ix(pk, a);
      const y = iy(pk, a);
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
      const col = pr.team === 0 ? PAL.toxin : PAL.danger;
      // tracer
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
      const tint = e.def.tint;
      const flash = e.hitFlash;

      g.circle(x, y, e.radius + 6).fill({ color: tint, alpha: 0.06 });
      g.circle(x, y, e.radius).fill({ color: tint, alpha: 0.16 + flash * 0.5 });
      g.circle(x, y, e.radius).stroke({ width: 2, color: flash > 0.1 ? 0xffffff : tint, alpha: 0.85 });
      g.circle(x, y, e.radius * 0.32).fill({ color: tint, alpha: 0.9 });

      // burster fuse pulse
      if (e.fuse > 0) {
        const p = 0.5 + Math.sin(world.time * 40) * 0.5;
        g.circle(x, y, e.radius + 4 + p * 6).stroke({ width: 2, color: PAL.dangerWarm, alpha: 0.3 + p * 0.5 });
      }

      // hp arc for tougher enemies
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

    // heading nose
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
    const d = 70;
    const x = cx + input.aimX * d;
    const y = cy + input.aimY * d;
    const g = this.sticks;
    g.circle(x, y, 7).stroke({ width: 1.5, color: PAL.toxin, alpha: 0.6 });
    g.circle(x, y, 2).fill({ color: PAL.toxin, alpha: 0.9 });
  }

  private drawFlash(w: number, h: number, juice: Juice): void {
    const g = this.flash;
    g.clear();
    if (juice.flashAlpha > 0.01) {
      g.rect(0, 0, w, h).fill({ color: juice.flashColor, alpha: juice.flashAlpha });
    }
  }
}
