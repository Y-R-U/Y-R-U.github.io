import { h, fmt } from './dom.js';

/**
 * THE PAYOUT — what a chain is worth, printed where the chain happened.
 *
 * A dissolve is the best-looking event in SILT: a whole band ignites, throws
 * embers and disperses into glowing grains. It used to earn a silent +1 on a
 * 10 px pill in the corner. The score sat top-left in 30 px of white and never
 * moved anywhere near the thing that fed it, so the spectacle read as weather
 * rather than as a reward.
 *
 * The rule the rest of the shell obeys — the sand is the screen — applies here
 * too, and it is the whole design: the number belongs on the board, not in the
 * corner. Everything else is restraint.
 *
 *   ONE NUMBER. A cascade fires two, three, five chains inside a second. Five
 *   numbers flying about is a slot machine; SILT is meant to look quiet and
 *   expensive. Chains landing within MERGE_MS are folded into the payout that
 *   is already on screen — it grows, re-pulses and picks up a "x3 chain"
 *   caption. One number that gets bigger reads as a combo. Five do not.
 *
 *   MAGNITUDE IS RELATIVE. A 7,000-grain clear and a 300-grain clear must not
 *   look the same, but the six modes have six different economies and a
 *   constant threshold would shout permanently in one of them and never fire in
 *   another. The tier is judged against the mean award of THIS RUN, so it
 *   calibrates itself to whatever the mode is paying.
 *
 * The element is pointer-events:none the whole way down. It covers the middle
 * of the board, which is exactly where a thumb is: if it ever took a tap the
 * piece would stop responding in the one place a player is always touching.
 */

const MERGE_MS = 700;      // two chains this close are ONE payout
const HOLD_MS = 900;       // how long the number holds before it leaves
const OUT_MS = 620;        // the fade

const clamp01 = (v) => (v > 1 ? 1 : v < 0 ? 0 : v || 0);

export function createPayout() {
  const el = h('div', { class: 'payout-host' });

  let live = null;               // the payout currently on screen, if any
  let sum = 0, count = 0;        // this run's awards, for the magnitude tiers

  function reset() {
    if (live && live.timer) clearTimeout(live.timer);
    el.replaceChildren();
    live = null; sum = 0; count = 0;
  }

  function tierOf(gain) {
    if (count < 2) return '';
    const avg = sum / count;
    if (!(avg > 0)) return '';
    if (gain >= avg * 3) return 'is-huge';
    if (gain >= avg * 1.6) return 'is-big';
    return '';
  }

  function paint(p) {
    p.num.textContent = '+' + fmt(p.total);
    // The caption is the part that can be missing. A cascade is worth naming
    // and a big clear is worth naming; an ordinary chain is worth a number and
    // nothing else, or the caption stops meaning anything.
    const cap = p.count > 1 ? '×' + p.count + ' chain'
      : p.size > 0 ? fmt(p.size) + ' grains'
      : '';
    p.cap.textContent = cap;
    p.cap.classList.toggle('on', !!cap);

    const t = tierOf(p.total);
    p.el.classList.toggle('is-big', t === 'is-big');
    p.el.classList.toggle('is-huge', t === 'is-huge');
    // Re-pulse, so a merge is felt rather than merely re-rendered.
    p.num.classList.remove('hit'); void p.num.offsetWidth; p.num.classList.add('hit');
  }

  function retire(p) {
    p.timer = setTimeout(() => {
      p.el.classList.add('is-out');
      setTimeout(() => { p.el.remove(); if (live === p) live = null; }, OUT_MS + 80);
    }, HOLD_MS);
  }

  /**
   * @param info.gain   points this chain earned. Nothing is drawn for zero.
   * @param info.chains how many chains the payload represents (>1 when several
   *                    landed between two frames).
   * @param info.size   grains dissolved, if the sim ever publishes it.
   * @param info.x/.y   0..1 within the BOARD rect. Absent means mid-board — the
   *                    sim does not publish where a chain happened yet, and the
   *                    shell must not go and read the grid to find out.
   */
  function chain(info = {}) {
    const gain = Math.max(0, Math.round(info.gain || 0));
    if (!gain) return null;
    const now = performance.now();
    sum += gain; count++;

    if (live && !live.el.classList.contains('is-out') && now - live.born < MERGE_MS) {
      clearTimeout(live.timer);
      live.total += gain;
      live.count += Math.max(1, info.chains | 0);
      live.size += Math.max(0, info.size | 0);
      live.born = now;
      paint(live);
      retire(live);
      return live;
    }

    const num = h('b', { class: 'payout-num t-num' });
    const cap = h('span', { class: 'payout-cap t-cap' });
    const node = h('div', { class: 'payout' }, num, cap);
    node.style.left = (clamp01(info.x == null ? 0.5 : info.x) * 100).toFixed(2) + '%';
    node.style.top = (clamp01(info.y == null ? 0.42 : info.y) * 100).toFixed(2) + '%';

    const p = {
      el: node, num, cap, born: now, timer: 0,
      total: gain, count: Math.max(1, info.chains | 0), size: Math.max(0, info.size | 0),
    };
    paint(p);
    el.append(node);
    // Two at most: the one leaving and the one arriving. A third is a queue.
    while (el.childElementCount > 2) el.firstElementChild.remove();
    requestAnimationFrame(() => node.classList.add('is-in'));
    retire(p);
    live = p;
    return p;
  }

  return {
    el,
    chain,
    reset,
    /** For gates: what is on screen right now, as the player would read it. */
    get state() {
      const n = el.querySelector('.payout:not(.is-out)');
      return n ? { text: n.querySelector('.payout-num').textContent,
                   cap: n.querySelector('.payout-cap').textContent,
                   tier: n.classList.contains('is-huge') ? 'huge'
                       : n.classList.contains('is-big') ? 'big' : 'plain' } : null;
    },
  };
}
