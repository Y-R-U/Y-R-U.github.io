// Tap/click-to-move (with pathfinding) + WASD/arrow nudging for the human brother.
export class Input {
  constructor(canvas, game) {
    this.game = game;
    this.keys = new Set();

    canvas.addEventListener('pointerdown', (e) => {
      const w = game.screenToWorld(e.clientX, e.clientY);
      if (w) game.handleTap(w.x, w.y);
    });

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  keyDir() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (x && y) { const d = Math.SQRT1_2; x *= d; y *= d; }
    return { x, y };
  }
}
