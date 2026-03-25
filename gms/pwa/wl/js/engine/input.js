/**
 * Input handler: mouse, touch, keyboard.
 * Fires events via the provided handler callbacks object.
 *
 * Handlers:
 *   onClick(tx, ty, button)   - tile clicked (button 0=left, 2=right)
 *   onDragEnd(dx, dy)         - drag released
 *   onKeyDown(key)            - keyboard key pressed
 *   onWheel(delta)            - scroll wheel
 */
export class InputHandler {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Camera} camera
   * @param {object} handlers - { onClick, onDragEnd, onKeyDown, onWheel }
   */
  constructor(canvas, camera, handlers) {
    this.canvas   = canvas;
    this.camera   = camera;
    this.handlers = handlers;
    this._bound   = {};
    this._attach();
  }

  _attach() {
    const c = this.canvas;
    this._on(c, 'mousedown',   e => this._mouseDown(e));
    this._on(c, 'mousemove',   e => this._mouseMove(e));
    this._on(c, 'mouseup',     e => this._mouseUp(e));
    this._on(c, 'contextmenu', e => { e.preventDefault(); this._rightClick(e); });
    this._on(c, 'wheel',       e => { e.preventDefault(); this.handlers.onWheel?.(e.deltaY); });
    this._on(window, 'keydown', e => this.handlers.onKeyDown?.(e.key));

    // Touch
    this._on(c, 'touchstart', e => this._touchStart(e), { passive: false });
    this._on(c, 'touchmove',  e => this._touchMove(e),  { passive: false });
    this._on(c, 'touchend',   e => this._touchEnd(e));
  }

  _on(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    this._bound[ev] = { el, fn };
  }

  destroy() {
    for (const [ev, { el, fn }] of Object.entries(this._bound)) {
      el.removeEventListener(ev, fn);
    }
  }

  // ---- Mouse ----

  _mouseDown(e) {
    const { x, y } = this._canvasXY(e);
    if (e.button === 0) {
      this.camera.startDrag(x, y);
      this._downPos = { x, y };
    }
  }

  _mouseMove(e) {
    const { x, y } = this._canvasXY(e);
    this.camera.drag(x, y);
  }

  _mouseUp(e) {
    const { x, y } = this._canvasXY(e);
    const dist = this.camera.dragDistance(x, y);
    this.camera.endDrag();

    if (dist < 5) {
      // It's a click, not a drag
      const { tx, ty } = this.camera.screenToTile(x, y);
      this.handlers.onClick?.(tx, ty, e.button);
    }
  }

  _rightClick(e) {
    const { x, y } = this._canvasXY(e);
    const { tx, ty } = this.camera.screenToTile(x, y);
    this.handlers.onClick?.(tx, ty, 2);
  }

  _canvasXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  // ---- Touch ----

  _touchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { x, y } = this._touchXY(t);
      this.camera.startDrag(x, y);
      this._touchDownPos = { x, y };
      this._touchDownTime = Date.now();
    }
  }

  _touchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const { x, y } = this._touchXY(e.touches[0]);
      this.camera.drag(x, y);
    }
  }

  _touchEnd(e) {
    if (e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const { x, y } = this._touchXY(t);
      const dist = this.camera.dragDistance(x, y);
      this.camera.endDrag();

      if (dist < 8 && Date.now() - (this._touchDownTime || 0) < 400) {
        const { tx, ty } = this.camera.screenToTile(x, y);
        this.handlers.onClick?.(tx, ty, 0);
      }
    }
  }

  _touchXY(touch) {
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top)  * scaleY,
    };
  }
}
