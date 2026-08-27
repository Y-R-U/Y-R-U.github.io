import { h, tap } from './dom.js';

/**
 * ZEN's material palette.
 *
 * ZEN declares `hud: []` — no score, no chains, no fail state — so the HUD's
 * job in this mode is to disappear. What replaces it is the only control the
 * mode actually needs: which of the eleven materials the finger is pouring.
 *
 * The swatches are baked from the RENDERER's own material palette rather than
 * hand-picked, so a chip is the colour the sand will actually be. Same exposure
 * and gamma approximation the next-piece tile uses — the shader's albedo is
 * linear and under a light rig, the chip is neither.
 *
 * Painting goes through core/input.js's own paint route — __game.input
 * .setPaint(fn). That is the sanctioned path and it is also the more robust
 * one: input.js already swallows the drag when a paint handler is installed, so
 * the falling piece cannot slide sideways under the brush, and because the
 * listener is on the CANVAS a press on a chip is not a stroke by construction.
 * The window-capture version this replaces had to name every UI class it must
 * not paint through in one `guarded()` selector list — a list that silently
 * rots the first time a control is added without being added to it.
 *
 * The old route survives only as a fallback for a host that does not expose
 * input, so the palette still works if this lane is ahead of main.js again.
 *
 * Either way it pours through the mode's own exported paint(), which goes
 * through grid.set — the sanctioned mutation path, so the mass ledger stays
 * honest and the dirty-chunk scheduler wakes.
 */

const BRUSHES = [4, 7, 11];
const MIN_GAP = 22;          // ms between strokes while dragging

const enc = (v, e) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v * e)), 1 / 2.2));

/**
 * A biome colour as a swatch. Emissives (lava 2.6, fire 3.4) are stored ABOVE 1
 * on purpose, and pushing those through the same exposure as sand clips every
 * channel and paints both chips white — which is what the first round of chips
 * did. Normalise anything over 1 by its own peak instead, so the hue survives.
 */
function hex(c) {
  const peak = Math.max(c[0], c[1], c[2], 1);
  const e = peak > 1 ? 1 / peak : 2.2;
  return '#' + [enc(c[0], e), enc(c[1], e), enc(c[2], e)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export function createZenPalette(isActive) {
  const nameEl = h('span', { class: 'zp-name', text: 'Sand' });
  const tintRow = h('div', { class: 'zp-tints' });
  const chipRow = h('div', { class: 'zp-chips' });
  const sizeRow = h('div', { class: 'zp-sizes' });
  const el = h('div', { class: 'zen-pal hide' },
    h('div', { class: 'zp-head' }, nameEl, tintRow, sizeRow),
    chipRow);

  let PAL = null, paintFn = null, EMPTY = 0;
  let sel = 0, tint = 1, brush = 1;
  let matCols = null, tintCols = null;

  /* -------------------------------------------------------------- palette */

  Promise.all([
    import('../modes/zen.js').catch(() => null),
    import('../gfx/biomes.js').catch(() => null),
    import('../sim/materials.js').catch(() => null),
  ]).then(([zen, gfx, mats]) => {
    if (!zen || !zen.PALETTE) return;
    PAL = zen.PALETTE;
    paintFn = zen.paint;
    if (gfx && gfx.bakeBiome && gfx.BIOMES) {
      const b = gfx.BIOMES.dune || gfx.BIOMES[Object.keys(gfx.BIOMES)[0]];
      const baked = gfx.bakeBiome(b);
      matCols = [];
      for (let i = 0; i * 3 < baked.matCol.length; i++) {
        matCols.push(hex([baked.matCol[i * 3], baked.matCol[i * 3 + 1], baked.matCol[i * 3 + 2]]));
      }
      tintCols = (b.tints || []).slice(1, 4).map(hex);
    }
    EMPTY = (mats && mats.EMPTY != null) ? mats.EMPTY : 0;
    build();
  });

  function build() {
    chipRow.replaceChildren(...PAL.map((p, i) => {
      const erase = p.mat === EMPTY;
      const c = (matCols && matCols[p.mat]) || '#7a6a52';
      const chip = tap(h('button', {
        class: 'zp-chip' + (erase ? ' zp-chip--erase' : '') + (i === sel ? ' on' : ''),
        'aria-label': p.name,
        style: { '--sw': c },
      }), () => pick(i));
      chip.style.setProperty('--sw', c);
      return chip;
    }));

    tintRow.replaceChildren(...[0, 1, 2].map((k) => {
      const c = (tintCols && tintCols[k]) || ['#f2b33d', '#d9603b', '#41c9d8'][k];
      const b = tap(h('button', { class: 'zp-tint' + (k + 1 === tint ? ' on' : ''), style: { '--sw': c } }),
        () => { tint = k + 1; sync(); });
      b.style.setProperty('--sw', c);
      return b;
    }));

    sizeRow.replaceChildren(...BRUSHES.map((r, k) =>
      tap(h('button', { class: 'zp-size' + (k === brush ? ' on' : ''), 'aria-label': 'Brush ' + r },
        h('i')), () => { brush = k; sync(); })));
    sync();
  }

  function pick(i) { sel = i; sync(); }

  function sync() {
    if (!PAL) return;
    const p = PAL[sel];
    nameEl.textContent = p.name;
    el.classList.toggle('is-tinted', !!p.tinted);
    [...chipRow.children].forEach((c, i) => c.classList.toggle('on', i === sel));
    [...tintRow.children].forEach((c, i) => c.classList.toggle('on', i + 1 === tint));
    [...sizeRow.children].forEach((c, i) => c.classList.toggle('on', i === brush));
  }

  /* --------------------------------------------------------------- brush */

  let down = false, last = 0;

  /** Grain coordinates in, sand out. */
  function paintAt(gx, gy) {
    const w = window.__game && window.__game.world;
    if (!w || !PAL || !paintFn) return;
    const cx = Math.round(gx), cy = Math.round(gy);
    if (cx < -20 || cy < -20 || cx > w.g.cols + 20 || cy > w.g.rows + 20) return;
    const m = PAL[sel];
    paintFn(w, cx, cy, {
      mat: m.mat,
      tint: m.tinted ? tint : 0,
      radius: BRUSHES[brush],
      density: 1,
    }, w.rng);
  }

  /** Client coordinates in — the harness's entry point, and the legacy route's. */
  function stroke(clientX, clientY) {
    const view = window.__game && window.__game.view;
    if (!view || !view.toGrain) return;
    const rect = document.getElementById('game').getBoundingClientRect();
    const p = view.toGrain(clientX - rect.left, clientY - rect.top);
    paintAt(p.x, p.y);
  }

  /** core/input.js's paint contract: (grainPoint, isDown), and null on release. */
  function onPaint(p, isDown) {
    if (!p) { down = false; return; }
    if (!isActive()) return;
    const now = performance.now();
    if (isDown) { down = true; last = 0; }
    else if (!down || now - last < MIN_GAP) return;
    last = now;
    try { paintAt(p.x, p.y); } catch { down = false; }
  }

  /* Legacy route, used only where the host exposes no input. */

  const guarded = (e) => e.target && e.target.closest &&
    e.target.closest('.gb,.zen-pal,.sheet,.card,.mcard,.sheet-scrim,.modal-scrim');

  function onDown(e) {
    if (!isActive() || guarded(e)) return;
    e.stopPropagation();
    down = true; last = 0;
    try { stroke(e.clientX, e.clientY); } catch { down = false; }
  }
  function onMove(e) {
    if (!down) return;
    e.stopPropagation();
    if (!isActive()) { down = false; return; }
    const now = performance.now();
    if (now - last < MIN_GAP) return;
    last = now;
    try { stroke(e.clientX, e.clientY); } catch { down = false; }
  }
  function onUp(e) { if (down) { down = false; e.stopPropagation && e.stopPropagation(); } }

  let legacy = false;
  function useLegacy() {
    if (legacy) return;
    legacy = true;
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onUp, { capture: true, passive: true });
    window.addEventListener('pointercancel', onUp, { capture: true, passive: true });
  }

  // The host builds INPUT after the UI, so this cannot be resolved once at
  // construction — ask on every show, which is also when it matters.
  function bind(on) {
    const input = window.__game && window.__game.input;
    if (input && input.setPaint) { input.setPaint(on ? onPaint : null); return; }
    if (on) useLegacy();
  }

  return {
    el,
    show(on) {
      el.classList.toggle('hide', !on);
      if (!on) down = false;
      bind(on);
    },
    /** Exposed so the capture harness can paint without a synthetic pointer. */
    stroke,
    get route() { return legacy ? 'legacy' : 'input'; },
    get material() { return PAL ? PAL[sel] : null; },
  };
}
