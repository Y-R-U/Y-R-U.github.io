import { h, svg } from './dom.js';

/**
 * The SILT wordmark, formed out of sand.
 *
 * The letters are stroked paths — no webfont, so the mark is byte-identical on
 * every device and there is nothing to fetch.
 *
 * The sand is a THRESHOLDED NOISE MASK, which is the only cheap way to get real
 * grains rather than a fade. The mask's source is a vertical grey ramp; the
 * filter adds fractal noise to it and then slams the result through a very steep
 * linear transfer, so each pixel is either fully in or fully out. Sliding the
 * transfer's intercept moves that cut point, and because the ramp is brighter at
 * the top, the top of the letters crosses the threshold first: grains land from
 * above, pile up, and later blow away from the bottom edge.
 *
 * PERF. An SVG filter re-evaluates on every attribute change, and this one runs
 * over the whole wordmark box. So: 3 octaves not 4, a mask region padded by 8px
 * not by the halo's 23, the halo left OUTSIDE the mask (its opacity is a plain
 * composite, which is free), updates throttled to 20 Hz while pouring and 5 Hz
 * while holding, and the whole controller stopped dead when the attract screen
 * is not on screen or the tab is hidden.
 */

const GLYPHS = [
  // S — an open spiral. Spine inset 11 on every side, so 22px of stroke lands
  // the ink exactly on the 0..80 x 0..100 box.
  { x: 0,   d: 'M69 28C69 14 52 11 40 11 24 11 11 17 11 29c0 13 13 18 29 21 16 3 29 8 29 21 0 12-13 18-29 18-12 0-29-3-29-17' },
  { x: 104, d: 'M11 0V100' },
  { x: 150, d: 'M11 0V89H80' },
  { x: 254, d: 'M0 11H80M40 0V100' },
];

const B_HIDDEN = -9.4;    // transfer intercept at which no grain survives
const B_SOLID = -4.3;     // ...and at which only the bottom edge stays speckled

const T_POUR = 1500;
const T_HOLD = 6600;
const T_ERODE = 1500;
const T_GONE = 500;
const T_CYCLE = T_POUR + T_HOLD + T_ERODE + T_GONE;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;

let uid = 0;

export function createWordmark() {
  const id = 'wm' + (++uid);
  const paths = GLYPHS.map((g) => `<path transform="translate(${g.x} 0)" d="${g.d}"/>`).join('');

  const el = h('div', { class: 'wm' });
  const gfx = svg(`viewBox="-24 -26 382 152" role="img" aria-label="SILT">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="-4" x2="0" y2="104" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff3d8"/>
        <stop offset="0.30" stop-color="#f6c473"/>
        <stop offset="0.66" stop-color="#e0913f"/>
        <stop offset="1" stop-color="#c4703a"/>
      </linearGradient>
      <linearGradient id="${id}r" x1="0" y1="-26" x2="0" y2="126" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#b8b8b8"/>
        <stop offset="1" stop-color="#808080"/>
      </linearGradient>
      <filter id="${id}f" x="-8" y="-8" width="350" height="116"
              filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="3" seed="3" result="n"/>
        <feColorMatrix in="n" type="matrix" result="ng"
          values="0.34 0.34 0.34 0 0  0.34 0.34 0.34 0 0  0.34 0.34 0.34 0 0  0 0 0 0 1"/>
        <feComposite in="SourceGraphic" in2="ng" operator="arithmetic"
                     k1="0" k2="0.60" k3="0.62" k4="0" result="mix"/>
        <feComponentTransfer in="mix">
          <feFuncR type="linear" slope="9" intercept="-9.4"/>
          <feFuncG type="linear" slope="9" intercept="-9.4"/>
          <feFuncB type="linear" slope="9" intercept="-9.4"/>
        </feComponentTransfer>
      </filter>
      <mask id="${id}m" maskUnits="userSpaceOnUse" x="-8" y="-8" width="350" height="116">
        <rect x="-8" y="-8" width="350" height="116" fill="url(#${id}r)" filter="url(#${id}f)"/>
      </mask>
    </defs>
    <g class="wm-halo" fill="none" stroke-linecap="butt" stroke-linejoin="round">
      <g stroke="#ff8a2e" stroke-opacity="0.05" stroke-width="46">${paths}</g>
      <g stroke="#ffb257" stroke-opacity="0.075" stroke-width="29">${paths}</g>
    </g>
    <g mask="url(#${id}m)">
      <g fill="none" stroke="url(#${id}g)" stroke-width="19" stroke-linecap="butt" stroke-linejoin="round">${paths}</g>
      <g fill="none" stroke="#fff6e2" stroke-opacity="0.5" stroke-width="1.1"
         stroke-linecap="butt" stroke-linejoin="round" transform="translate(0 -0.6)">${paths}</g>
    </g>
  </svg>`);
  el.append(gfx);

  // Grain streaks that fall into the letters while they form.
  const pour = h('div', { class: 'wm-pour' });
  for (let i = 0; i < 18; i++) {
    pour.append(h('i', { style: {
      left: (2 + (i * 96 / 18) + (i * 37 % 5)) + '%',
      animationDuration: (0.72 + (i % 5) * 0.13) + 's',
      animationDelay: (-(i * 137 % 90) / 100) + 's',
      opacity: String(0.35 + (i % 4) * 0.18),
    } }));
  }
  el.append(pour);

  const halo = gfx.querySelector('.wm-halo');
  const funcs = [...gfx.querySelectorAll('feFuncR,feFuncG,feFuncB')];
  const turb = gfx.querySelector('feTurbulence');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, t0 = 0, lastWrite = -1e9, seedAt = -1e9, seed = 3, running = false;

  function setB(b) {
    const s = b.toFixed(2);
    for (const f of funcs) f.setAttribute('intercept', s);
  }

  function step(now) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    const t = (now - t0) % T_CYCLE;

    let b, pouring = false, gap;
    if (t < T_POUR) { b = B_HIDDEN + (B_SOLID - B_HIDDEN) * easeOut(t / T_POUR); pouring = true; gap = 50; }
    else if (t < T_POUR + T_HOLD) { b = B_SOLID; gap = 190; }
    else if (t < T_POUR + T_HOLD + T_ERODE) { b = B_SOLID + (B_HIDDEN - B_SOLID) * easeIn((t - T_POUR - T_HOLD) / T_ERODE); gap = 50; }
    else { b = B_HIDDEN; gap = 400; }

    el.classList.toggle('is-pouring', pouring);
    halo.style.opacity = String(Math.max(0, Math.min(1, (b - B_HIDDEN) / (B_SOLID - B_HIDDEN))));

    if (now - lastWrite < gap) return;
    lastWrite = now;
    setB(b);
    // Reshuffling the noise field is what makes the held mark look like loose
    // grain rather than a stencil. It is also the expensive half, so it is slow.
    if (now - seedAt > 210) { seedAt = now; seed = (seed % 9) + 1; turb.setAttribute('seed', String(seed)); }
  }

  return {
    el,
    start() {
      if (running) return;
      if (reduced) { setB(B_SOLID); halo.style.opacity = '1'; return; }
      running = true; t0 = performance.now(); lastWrite = -1e9;
      raf = requestAnimationFrame(step);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf), raf = 0;
      el.classList.remove('is-pouring');
    },
    /** Skip the pour and sit at full strength — used when the sheet is over it. */
    settle() { this.stop(); setB(B_SOLID); halo.style.opacity = '1'; },
  };
}
