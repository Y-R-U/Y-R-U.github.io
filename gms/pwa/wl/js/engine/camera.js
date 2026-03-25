/**
 * Camera / viewport for the tile map.
 * Converts between world (tile) coordinates and screen (pixel) coordinates.
 */
export class Camera {
  /**
   * @param {number} tileSize - pixels per tile
   * @param {number} mapSize  - tiles per side
   */
  constructor(tileSize, mapSize) {
    this.tileSize = tileSize;
    this.mapSize  = mapSize;
    this.x = 0;    // top-left tile offset (pixels)
    this.y = 0;
    this.screenW = 800;
    this.screenH = 600;
    this._dragging = false;
    this._dragStart = { x: 0, y: 0 };
    this._camStart  = { x: 0, y: 0 };
  }

  /** Resize viewport to canvas dimensions */
  resize(w, h) { this.screenW = w; this.screenH = h; }

  /** @returns {number} total map width in pixels */
  get mapPixelW() { return this.mapSize * this.tileSize; }
  get mapPixelH() { return this.mapSize * this.tileSize; }

  /** Clamp camera so it doesn't scroll past map edge */
  clamp() {
    const maxX = Math.max(0, this.mapPixelW - this.screenW);
    const maxY = Math.max(0, this.mapPixelH - this.screenH);
    this.x = Math.max(0, Math.min(this.x, maxX));
    this.y = Math.max(0, Math.min(this.y, maxY));
  }

  /** Pan by pixel delta */
  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /** Center camera on tile (tx, ty) */
  centerOn(tx, ty) {
    this.x = tx * this.tileSize - this.screenW  / 2 + this.tileSize / 2;
    this.y = ty * this.tileSize - this.screenH / 2 + this.tileSize / 2;
    this.clamp();
  }

  /**
   * Convert screen pixel → tile coordinate.
   * @returns {{ tx: number, ty: number }}
   */
  screenToTile(sx, sy) {
    return {
      tx: Math.floor((sx + this.x) / this.tileSize),
      ty: Math.floor((sy + this.y) / this.tileSize),
    };
  }

  /**
   * Convert tile → screen pixel (top-left of tile).
   */
  tileToScreen(tx, ty) {
    return {
      px: tx * this.tileSize - this.x,
      py: ty * this.tileSize - this.y,
    };
  }

  /** @returns {{ minTX, maxTX, minTY, maxTY }} visible tile range */
  visibleTiles() {
    return {
      minTX: Math.max(0, Math.floor(this.x / this.tileSize)),
      minTY: Math.max(0, Math.floor(this.y / this.tileSize)),
      maxTX: Math.min(this.mapSize - 1, Math.ceil((this.x + this.screenW)  / this.tileSize)),
      maxTY: Math.min(this.mapSize - 1, Math.ceil((this.y + this.screenH) / this.tileSize)),
    };
  }

  // --- drag support ---

  startDrag(sx, sy) {
    this._dragging = true;
    this._dragStart = { x: sx, y: sy };
    this._camStart  = { x: this.x, y: this.y };
  }

  drag(sx, sy) {
    if (!this._dragging) return;
    this.x = this._camStart.x - (sx - this._dragStart.x);
    this.y = this._camStart.y - (sy - this._dragStart.y);
    this.clamp();
  }

  endDrag() {
    const wasDragging = this._dragging;
    this._dragging = false;
    return wasDragging;
  }

  get isDragging() { return this._dragging; }

  /** How far has the drag moved? (to distinguish drag from click) */
  dragDistance(sx, sy) {
    return Math.abs(sx - this._dragStart.x) + Math.abs(sy - this._dragStart.y);
  }
}
