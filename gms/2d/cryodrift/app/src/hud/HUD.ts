import { Container, Graphics, Text } from 'pixi.js';
import { PAL } from '../config/palette';
import { insets } from '../core/safearea';
import { maxMembrane } from '../sim/sim';
import type { World } from '../sim/World';

const mono = 'ui-monospace, "SF Mono", Menlo, monospace';

/**
 * In-game HUD, Pixi-native (build plan §6 signature: a microscope graticule that
 * frames the field, with corner "specimen labels"). Reads sim state only.
 */
export class HUD {
  readonly view = new Container();
  private frame = new Graphics();
  private bars = new Graphics();
  private score = new Text({ text: '0', style: { fill: PAL.ink, fontFamily: mono, fontSize: 30, fontWeight: '600', letterSpacing: 2 } });
  private day = new Text({ text: '', style: { fill: PAL.inkDim, fontFamily: mono, fontSize: 11, letterSpacing: 3 } });
  private strain = new Text({ text: '', style: { fill: PAL.inkDim, fontFamily: mono, fontSize: 10, letterSpacing: 2 } });
  private streak = new Text({ text: '', style: { fill: PAL.nutrientSpark, fontFamily: mono, fontSize: 13, letterSpacing: 1 } });
  private banner = new Text({ text: '', style: { fill: PAL.ink, fontFamily: mono, fontSize: 18, letterSpacing: 4 } });
  private bannerT = 0;

  constructor() {
    this.view.addChild(this.frame, this.bars, this.score, this.day, this.strain, this.streak, this.banner);
    this.score.anchor.set(0.5, 0);
    this.day.anchor.set(0.5, 0);
    this.streak.anchor.set(0.5, 0);
    this.banner.anchor.set(0.5, 0.5);
    this.view.eventMode = 'none';
  }

  flashBanner(text: string): void {
    this.banner.text = text;
    this.bannerT = 2.2;
  }

  update(world: World, w: number, h: number, dt: number): void {
    const t = insets.top + 14;
    const l = insets.left + 16;
    const r = w - insets.right - 16;
    const b = h - insets.bottom;

    // ── meters (top-left) ──
    const bw = Math.min(230, w * 0.46);
    const bh = 9;
    const g = this.bars;
    g.clear();

    const p = world.player;
    const memFrac = Math.max(0, p.membrane / maxMembrane(world));
    const atpFrac = Math.max(0, p.atp / world.stats.maxAtp);

    const memCol = memFrac > 0.5 ? PAL.player : memFrac > 0.25 ? PAL.dangerWarm : PAL.danger;
    this.meter(g, l, t, bw, bh, memFrac, memCol);
    this.meter(g, l, t + bh + 7, bw * 0.82, bh - 2, atpFrac, PAL.mutation);

    // labels on meters
    // (drawn as part of frame text would be heavy; keep them implicit via color)

    // ── graticule frame (signature) ──
    this.drawGraticule(g, l - 4, t - 6, r, b - insets.bottom - 8, w, h);

    // ── texts ──
    this.score.position.set(w / 2, t - 2);
    this.score.text = String(world.score);
    this.day.position.set(w / 2, t + 32);
    this.day.text = `CULTURE · DAY ${Math.max(1, world.wave)}`;
    this.strain.position.set(l, t + bh * 2 + 12);
    this.strain.text = `STRAIN: ${world.strain.name.toUpperCase()}`;
    this.streak.position.set(w / 2, t + 48);
    this.streak.text = world.streak > 1 ? `COMBO ×${world.streak}` : '';

    // banner
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      this.banner.visible = true;
      this.banner.position.set(w / 2, h * 0.34);
      this.banner.alpha = Math.min(1, this.bannerT) * (this.bannerT > 1.6 ? (2.2 - this.bannerT) / 0.6 : 1);
    } else {
      this.banner.visible = false;
    }
  }

  private meter(g: Graphics, x: number, y: number, w: number, h: number, frac: number, color: number): void {
    g.roundRect(x, y, w, h, h / 2).fill({ color: PAL.mediumMid, alpha: 0.85 });
    g.roundRect(x, y, w, h, h / 2).stroke({ width: 1, color, alpha: 0.3 });
    if (frac > 0) {
      g.roundRect(x + 1, y + 1, Math.max(h - 2, (w - 2) * frac), h - 2, (h - 2) / 2).fill({ color, alpha: 0.9 });
    }
  }

  private drawGraticule(g: Graphics, x0: number, y0: number, x1: number, y1: number, w: number, h: number): void {
    const c = PAL.reticle;
    const len = 22;
    const corners: [number, number, number, number][] = [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      g.moveTo(cx, cy).lineTo(cx + len * sx, cy).stroke({ width: 1, color: c, alpha: 0.5 });
      g.moveTo(cx, cy).lineTo(cx, cy + len * sy).stroke({ width: 1, color: c, alpha: 0.5 });
    }
    // centre crosshair ticks
    const cx = w / 2;
    const cy = h / 2;
    const tick = 8;
    const gap = 26;
    g.moveTo(cx - gap - tick, cy).lineTo(cx - gap, cy).stroke({ width: 1, color: c, alpha: 0.3 });
    g.moveTo(cx + gap, cy).lineTo(cx + gap + tick, cy).stroke({ width: 1, color: c, alpha: 0.3 });
    g.moveTo(cx, cy - gap - tick).lineTo(cx, cy - gap).stroke({ width: 1, color: c, alpha: 0.3 });
    g.moveTo(cx, cy + gap).lineTo(cx, cy + gap + tick).stroke({ width: 1, color: c, alpha: 0.3 });
  }
}
