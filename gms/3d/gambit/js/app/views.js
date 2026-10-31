// View button helpers shared by the game, online game, puzzle and lesson screens (ui-4).
// D26: Top → Tilt → 3D → Free. A theme may fix the camera (board.camera.fixed, e.g. 'top' for the
// flat Plain set): the button then shows that view and is disabled (the V key is already a no-op).
export const VIEW_NAMES = { top: 'Top', tilt: 'Tilt', angle: '3D', free: 'Free', default: 'Tilt' };
export const viewLabel = v => VIEW_NAMES[v] || 'Top';

/** Label + enabled state of a View button for this board (settingsView: fallback before the board is up). */
export function syncViewButton(btn, board, settingsView) {
  if (!btn) return;
  const fixed = board?.camera?.fixed || null;
  const v = fixed || board?.camera?.view || settingsView;
  const lbl = btn.querySelector('.lbl'); if (lbl) lbl.textContent = viewLabel(v);
  btn.disabled = !!fixed;
  btn.title = fixed ? 'This piece set always uses the top view' : 'Cycle view (V)';
}
