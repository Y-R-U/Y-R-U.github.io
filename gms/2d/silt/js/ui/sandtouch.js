import { h } from './dom.js';

/**
 * Touch the attract screen and sand pours out of your finger.
 *
 * main.js's createInput only forwards to the world while state === 'play', so
 * the title screen would otherwise be inert — and an inert falling-sand title is
 * a poster, not a game. This listens on the window in the CAPTURE phase (the
 * canvas swallows pointer events, and #ui is pointer-events:none above it) and
 * pours through the grid's own set(), which is the sanctioned mutation path and
 * keeps g.count — the mass ledger — honest.
 *
 * MANAGER: a first-class hook would be better than this. See the note in
 * HANDOFF; if main.js grows `window.__game.pour(x, y)` this file collapses to a
 * call. Everything here is feature-detected and wrapped, so if the sim moves it
 * degrades to just the ripple.
 */

const RADIUS = 4.6;        // grains
const PER_POUR = 34;
const MIN_GAP = 55;        // ms between pours while dragging

export function createSandTouch(host, isActive) {
  let SAND = 2;
  import('../sim/materials.js').then((m) => { if (m && m.SAND != null) SAND = m.SAND; }).catch(() => {});

  let last = 0, down = false, tint = 1;

  function pour(clientX, clientY) {
    const g = window.__game;
    const w = g && g.world;
    const view = g && g.view;
    if (!w || !view || !view.toGrain || !w.g || !w.g.set) return;

    const rect = document.getElementById('game').getBoundingClientRect();
    const p = view.toGrain(clientX - rect.left, clientY - rect.top);
    const grid = w.g;
    const cx = Math.round(p.x), cy = Math.round(p.y);
    if (cx < -8 || cy < -8 || cx > grid.cols + 8 || cy > grid.rows + 8) return;

    for (let k = 0; k < PER_POUR; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * RADIUS;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!grid.inb(x, y)) continue;
      const i = grid.idx(x, y);
      if (grid.mat[i] !== 0) continue;                // never overwrite; only fill air
      grid.set(i, SAND, tint);
    }
  }

  function ripple(x, y) {
    const r = h('div', { class: 'ripple', style: { left: x + 'px', top: y + 'px' } });
    host.append(r);
    setTimeout(() => r.remove(), 750);
  }

  function onDown(e) {
    if (!isActive()) return;
    if (e.target.closest && e.target.closest('.gb,.sheet,.card,.mcard,.sheet-scrim,.modal-scrim')) return;
    down = true;
    tint = 1 + ((Math.random() * 3) | 0);
    ripple(e.clientX, e.clientY);
    try { pour(e.clientX, e.clientY); } catch { /* sim moved; ripple still fired */ }
    last = performance.now();
  }

  function onMove(e) {
    if (!down || !isActive()) return;
    const now = performance.now();
    if (now - last < MIN_GAP) return;
    last = now;
    try { pour(e.clientX, e.clientY); } catch { down = false; }
  }

  const onUp = () => { down = false; };

  window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  window.addEventListener('pointermove', onMove, { capture: true, passive: true });
  window.addEventListener('pointerup', onUp, { capture: true, passive: true });
  window.addEventListener('pointercancel', onUp, { capture: true, passive: true });

  return { pour, dispose() { window.removeEventListener('pointerdown', onDown, true); } };
}
