// Pointer input → cell taps and swipe-swaps. Callbacks wired by game.js.
import { screenToCell } from './render.js';

export const input = {
  enabled: false,
  onSwap: null,     // (a, b)
  onTap: null,      // (cell) — used by hammer/forge targeting
  onSelect: null,   // (cell|null) — selection highlight
};

let downCell = null, downX = 0, downY = 0, selected = null;

export function initInput() {
  const el = document.getElementById('game-container');
  el.addEventListener('pointerdown', (e) => {
    if (!input.enabled) return;
    downCell = screenToCell(e.clientX, e.clientY);
    downX = e.clientX; downY = e.clientY;
  });

  el.addEventListener('pointermove', (e) => {
    if (!input.enabled || !downCell) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (Math.hypot(dx, dy) < 24) return;
    // swipe: swap toward dominant direction
    const b = Math.abs(dx) > Math.abs(dy)
      ? { r: downCell.r, c: downCell.c + Math.sign(dx) }
      : { r: downCell.r + Math.sign(dy), c: downCell.c };
    const a = downCell;
    downCell = null;
    selected = null;
    input.onSelect?.(null);
    input.onSwap?.(a, b);
  });

  el.addEventListener('pointerup', (e) => {
    if (!input.enabled || !downCell) { downCell = null; return; }
    const cell = screenToCell(e.clientX, e.clientY);
    downCell = null;
    if (!cell) { selected = null; input.onSelect?.(null); return; }
    if (input.onTap && input.onTap(cell)) { selected = null; input.onSelect?.(null); return; }
    if (selected) {
      const adj = Math.abs(selected.r - cell.r) + Math.abs(selected.c - cell.c) === 1;
      if (adj) {
        const a = selected;
        selected = null;
        input.onSelect?.(null);
        input.onSwap?.(a, cell);
        return;
      }
      if (selected.r === cell.r && selected.c === cell.c) {
        selected = null; input.onSelect?.(null); return;
      }
    }
    selected = cell;
    input.onSelect?.(cell);
  });

  el.addEventListener('pointercancel', () => { downCell = null; });
}

export function clearSelection() {
  selected = null;
  input.onSelect?.(null);
}
