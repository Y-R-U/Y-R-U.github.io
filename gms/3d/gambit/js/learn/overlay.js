// Learn: a DOM/SVG layer over the shared 3D board. Everything is placed by projecting the
// board's world-space squares through its camera, so zones, stars and value tags stay glued to
// the squares in every view (Top / Tilt / 3D / Free) and both orientations.
//   const ov = createOverlay(container, () => board);
//   ov.set({zones, stars, tags});  ov.collect(sq);  ov.flash(sq, 'good'|'bad');
//   ov.tapMode(fn | null)          // capture taps on squares (the board gets none meanwhile)
//   ov.squareAt(x, y)              // container px -> square
import * as THREE from 'three';

const FILES = 'abcdefgh';
const SQUARES = []; for (const f of FILES) for (let r = 1; r <= 8; r++) SQUARES.push(f + r);
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5L7 14.3l-5.3-5 7.2-.9z"/></svg>';
const _v = new THREE.Vector3();

export function createOverlay(container, getBoard) {
  const el = document.createElement('div');
  el.className = 'ln-ov';
  el.innerHTML = '<svg class="ln-ov-svg"></svg><div class="ln-ov-items"></div><div class="ln-ov-tap" hidden></div>';
  container.appendChild(el);
  const svg = el.querySelector('svg'), items = el.querySelector('.ln-ov-items'), tapEl = el.querySelector('.ln-ov-tap');
  let zones = [], stars = new Map(), tags = new Map(), flashes = [];
  let raf = 0, sig = '', tapFn = null, dead = false;

  function project(x, z) {
    const b = getBoard(); const cam = b?.camera?.three;
    if (!cam) return null;
    _v.set(x, 0, z).project(cam);
    return { x: (_v.x + 1) / 2 * container.clientWidth, y: (1 - _v.y) / 2 * container.clientHeight };
  }
  const centre = sq => project(sq.charCodeAt(0) - 97 - 3.5, 3.5 - (sq.charCodeAt(1) - 49));
  function corners(sq) {
    const x = sq.charCodeAt(0) - 97 - 3.5, z = 3.5 - (sq.charCodeAt(1) - 49);
    return [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([dx, dz]) => project(x + dx, z + dz));
  }
  function squareSize(sq) { const c = corners(sq); if (!c[0]) return 40; return Math.max(8, (Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) + Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)) / 2); }

  function layout() {
    const b = getBoard(); const cam = b?.camera?.three;
    if (!cam) return;
    const s = cam.matrixWorld.elements.map(n => n.toFixed(3)).join(',') + cam.projectionMatrix.elements[0].toFixed(4) + container.clientWidth + 'x' + container.clientHeight;
    if (s === sig) return;
    sig = s;
    svg.setAttribute('viewBox', `0 0 ${container.clientWidth} ${container.clientHeight}`);
    svg.innerHTML = zones.map(z => z.sq.map(sq => {
      const c = corners(sq); if (!c[0]) return '';
      return `<polygon class="ln-zone ${z.tone || 'gold'}" points="${c.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`;
    }).join('')).join('') + flashes.map(f => {
      const c = corners(f.sq); if (!c[0]) return '';
      return `<polygon class="ln-flash ${f.tone}" points="${c.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`;
    }).join('');
    for (const [sq, n] of stars) place(n, sq, 0.62);
    for (const [sq, n] of tags) place(n, sq, null);
  }
  function place(n, sq, frac) {
    const p = centre(sq); if (!p) return;
    if (frac) { const s = squareSize(sq) * frac; n.style.width = n.style.height = `${s.toFixed(1)}px`; }
    n.style.left = `${p.x.toFixed(1)}px`; n.style.top = `${p.y.toFixed(1)}px`;
  }
  function loop() {
    raf = 0;
    if (dead) return;
    layout();
    if (zones.length || stars.size || tags.size || flashes.length) raf = requestAnimationFrame(loop);
  }
  function kick() { sig = ''; if (!raf && !dead) raf = requestAnimationFrame(loop); }

  function set({ zones: z, stars: st, tags: tg } = {}) {
    if (z !== undefined) zones = z || [];
    if (st !== undefined) {
      for (const n of stars.values()) n.remove();
      stars = new Map((st || []).map(sq => { const n = document.createElement('div'); n.className = 'ln-star'; n.innerHTML = STAR; items.appendChild(n); return [sq, n]; }));
    }
    if (tg !== undefined) {
      for (const n of tags.values()) n.remove();
      tags = new Map(Object.entries(tg || {}).map(([sq, t]) => { const n = document.createElement('div'); n.className = 'ln-vtag'; n.textContent = t; items.appendChild(n); return [sq, n]; }));
    }
    kick();
  }
  function collect(sq) {
    const n = stars.get(sq); if (!n) return false;
    stars.delete(sq);
    n.classList.add('got');
    setTimeout(() => n.remove(), 650);
    return true;
  }
  function flash(sq, tone = 'good', ms = 700) {
    const f = { sq, tone }; flashes.push(f); kick();
    setTimeout(() => { flashes = flashes.filter(x => x !== f); kick(); }, ms);
  }
  function squareAt(x, y) {
    for (const sq of SQUARES) {
      const c = corners(sq); if (!c[0]) return null;
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        if ((c[i].y > y) !== (c[j].y > y) && x < (c[j].x - c[i].x) * (y - c[i].y) / (c[j].y - c[i].y) + c[i].x) inside = !inside;
      }
      if (inside) return sq;
    }
    return null;
  }
  tapEl.addEventListener('pointerdown', e => {
    if (!tapFn) return;
    e.preventDefault();
    const r = container.getBoundingClientRect();
    const sq = squareAt(e.clientX - r.left, e.clientY - r.top);
    if (sq) tapFn(sq);
  });
  function tapMode(fn) { tapFn = fn || null; tapEl.hidden = !tapFn; }
  function clear() { set({ zones: [], stars: [], tags: {} }); flashes = []; tapMode(null); }

  const ro = new ResizeObserver(kick); ro.observe(container);
  return {
    el, set, collect, flash, tapMode, clear, squareAt, centre, kick,
    get starsLeft() { return [...stars.keys()]; },
    dispose() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); el.remove(); },
  };
}
