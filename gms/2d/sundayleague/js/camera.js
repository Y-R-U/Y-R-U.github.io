// ---- camera: follows ball with velocity lookahead ----
import { WORLD_W, WORLD_H, ZOOMS } from './const.js';
import { clamp, damp } from './util.js';

export class Camera {
  constructor() {
    this.x = WORLD_W / 2; this.y = WORLD_H / 2;
    this.scale = 1;
    this.viewW = 100; this.viewH = 100;
    this.zoomKey = 'normal';
  }

  resize(viewW, viewH, zoomKey = this.zoomKey) {
    this.viewW = viewW; this.viewH = viewH;
    this.zoomKey = zoomKey;
    const targetH = ZOOMS[zoomKey] || ZOOMS.normal;
    this.scale = viewH / targetH;
    // never zoom so far out that the world doesn't cover the view
    this.scale = Math.max(this.scale, Math.max(viewW / WORLD_W, viewH / WORLD_H));
  }

  snap(tx, ty) { this.x = tx; this.y = ty; this._clamp(); }

  update(dt, tx, ty, lookVX = 0, lookVY = 0) {
    const gx = tx + lookVX * 0.3;
    const gy = ty + lookVY * 0.35;
    const k = damp(4.2, dt);
    this.x += (gx - this.x) * k;
    this.y += (gy - this.y) * k;
    this._clamp();
  }

  _clamp() {
    const hw = this.viewW / 2 / this.scale, hh = this.viewH / 2 / this.scale;
    this.x = clamp(this.x, hw, WORLD_W - hw);
    this.y = clamp(this.y, hh, WORLD_H - hh);
  }

  apply(ctx, shakeX = 0, shakeY = 0) {
    ctx.setTransform(this.scale, 0, 0, this.scale,
      -(this.x - this.viewW / 2 / this.scale) * this.scale + shakeX,
      -(this.y - this.viewH / 2 / this.scale) * this.scale + shakeY);
  }
}
