import { el, esc, CREST, ICON } from './dom.js';

const QUIPS = [
  'Polishing the propellers…', 'Bribing air traffic control…', 'Inflating the impossiRubber…', 'Waking the tower trainee…',
  'Ironing the windsocks…', 'Teaching pigeons to yield…', 'Pouring the tea…', 'Misplacing the rulebook…',
];

export function createLoading(root) {
  const node = el(`<section class="kz-screen kz-load on" aria-label="Loading">
    <div class="kz-stars"></div>
    <div class="kz-cloud c1"></div><div class="kz-cloud c2"></div><div class="kz-cloud c3"></div>
    <div class="kz-flyby">${ICON.plane}</div>
    ${CREST}
    <div class="kz-word"><span class="kz-word-a">The Kingdom of</span><span class="kz-word-b">Krayzee</span></div>
    <div class="kz-tag">Not your normal flight sim</div>
    <div class="kz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="kz-bar"><div class="kz-fill">${ICON.plane}</div></div>
      <div class="kz-plabel"><span class="kz-plabel-t">Preparing the kingdom</span><b>0%</b></div>
    </div>
    <div class="kz-load-foot">${esc(QUIPS[0])}</div>
  </section>`);
  root.append(node);
  const fill = node.querySelector('.kz-fill');
  const pct = node.querySelector('.kz-plabel b');
  const lab = node.querySelector('.kz-plabel-t');
  const bar = node.querySelector('.kz-progress');
  const foot = node.querySelector('.kz-load-foot');
  let q = 0;
  const quipTimer = setInterval(() => { q = (q + 1) % QUIPS.length; foot.textContent = QUIPS[q]; }, 2200);
  let shown = 0;
  return {
    node,
    set(f, label) {
      const v = Math.max(shown, Math.min(1, Number(f) || 0));
      shown = v;
      const p = Math.round(v * 100);
      fill.style.width = p + '%';
      pct.textContent = p + '%';
      bar.setAttribute('aria-valuenow', p);
      if (label) lab.textContent = label;
    },
    hide() {
      node.classList.remove('on');
      clearInterval(quipTimer);
      setTimeout(() => node.remove(), 1200);
    },
  };
}
