import { h, icon, fmt } from './dom.js';
import { MODE_GLYPH } from './icons.js';

/**
 * The per-mode HUD.
 *
 * Five of the six modes publish live state that the base HUD (score, chains,
 * combo, next) cannot express, and one of them — ALCHEMY — is unplayable
 * without it, because the objective the player is being asked to complete
 * exists only in `world.alchemy.label`.
 *
 * Everything here obeys the same rule as the rest of the shell: the sand is the
 * screen. The objective and the flip clock are thin strips under the score,
 * inside the top veil that already exists to keep type legible. The tide is an
 * 8 px rail on the board's right edge — 2% of the width — because the threat is
 * vertical and a horizontal readout cannot say "the ceiling is coming down".
 *
 * The mode's own `hud` array decides which of these appear. A panel that a mode
 * did not ask for is display:none, not merely empty, so a mode that publishes
 * nothing costs no layout.
 */

const STAR = '<path d="M12 3.1l2.65 5.86 6.35.62-4.8 4.3 1.4 6.28L12 16.9l-5.6 3.26 1.4-6.28-4.8-4.3 6.35-.62Z"/>';

/** m:ss, but seconds with a decimal under ten — the last ten seconds are the mode. */
function clock(s) {
  s = Math.max(0, s || 0);
  if (s < 10) return s.toFixed(1);
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function pips(n) {
  const els = [];
  for (let i = 0; i < n; i++) els.push(icon(STAR));
  return els;
}

export function createModeHud() {
  /* ------------------------------------------------------- objective (ALCHEMY) */

  const objLabel = h('span', { class: 'obj-label', text: '' });
  const objCount = h('span', { class: 'obj-count t-num' });
  const objFill = h('i');
  const objLv = h('span', { class: 'obj-lv' });
  const objStars = h('span', { class: 'obj-stars' }, ...pips(3));
  const objClock = h('span', { class: 'obj-clock t-num' });
  const objective = h('div', { class: 'panel obj hide' },
    h('div', { class: 'obj-head' }, objLabel, objCount),
    h('div', { class: 'obj-bar' }, objFill),
    h('div', { class: 'obj-foot' }, objLv, objStars, objClock));

  /* -------------------------------------------------------- flip (HOURGLASS) */

  const flipGlyph = h('span', { class: 'flip-glyph' }, icon(MODE_GLYPH.hourglass));
  const flipLab = h('span', { class: 'flip-lab', text: 'next turn' });
  const flipNum = h('span', { class: 'flip-num t-num' });
  const flipFill = h('i');
  const flipCount = h('span', { class: 'flip-count' });
  const flip = h('div', { class: 'panel flip hide' },
    h('div', { class: 'flip-head' }, flipGlyph, flipLab, flipCount, flipNum),
    h('div', { class: 'flip-bar' }, flipFill));

  /** An inset glow on the board rect, so the flip is telegraphed without one
   *  pixel of sand being covered. */
  const flipring = h('div', { class: 'flipring' });

  /* ------------------------------------------------------------ rail (TIDE) */

  const railFill = h('i');
  // The HIGH WATER mark is painted AFTER the fill, so it is still visible once
  // the flood has climbed past it — which is exactly when it matters.
  const rail = h('div', { class: 'rail hide' }, railFill, h('span', { class: 'rail-mark' }));

  /* ----------------------------------------------------------------- state */

  // Cached so the DOM is only touched when a number actually moves; setHud runs
  // every rAF and this panel is on screen for whole minutes at a time.
  let lastObj = '', lastFlip = '', lastTide = -1, lastRailCls = '';
  // The flip period, so the bar can DEPLETE rather than guess. Latching it from
  // the first `until` seen is wrong: join a run two seconds before a flip and the
  // period becomes two seconds, so the bar reads empty at the exact moment it
  // should be screaming. Take it from the mode's own config, and only ever raise.
  let flipPeriod = 30;

  // ALCHEMY's star thresholds are TIMES, and the mode publishes only the star
  // count it has already earned (0 until the level is won). The thresholds live
  // on the level, so read them from lane C's own level table rather than
  // guessing — then the three pips can show the star still on offer while the
  // clock is running, which is the only version of them that affects play.
  let levelOf = null;
  import('../modes/alchemy.js')
    .then((m) => { if (m && m.levelById) levelOf = m.levelById; })
    .catch(() => { /* lane C absent: pips fall back to the earned count */ });
  import('../modes/hourglass.js')
    .then((m) => { const n = m && m.HOURGLASS_CFG && m.HOURGLASS_CFG.flipEvery; if (n > 0) flipPeriod = n; })
    .catch(() => { /* keep the 30 s default */ });

  function setObjective(a) {
    const lv = levelOf && a.id != null ? levelOf(a.id) : null;
    const limit = lv && lv.limitS;
    const th = lv && lv.stars;
    const frac = Math.max(0, Math.min(1, a.frac || 0));
    const live = a.won ? (a.stars || 1)
      : (th && limit != null ? starOnOffer(th, limit - a.left) : 0);

    const key = [a.label, a.value, a.target, a.won, live, Math.round(a.left * 10),
                 Math.round(frac * 200), a.id].join('|');
    if (key === lastObj) return;
    lastObj = key;

    objLabel.textContent = a.won ? 'Complete' : (a.label || 'Objective');
    objCount.textContent = a.won ? '' : fmt(a.value) + ' / ' + fmt(a.target);
    objFill.style.width = (frac * 100).toFixed(1) + '%';
    objLv.textContent = a.id != null ? ('lv ' + a.id + (a.name ? ' · ' + a.name : '')) : '';
    objClock.textContent = clock(a.left);

    objective.classList.toggle('is-won', !!a.won);
    objective.classList.toggle('is-late', !a.won && a.left <= 10);
    objective.classList.toggle('is-urgent', !a.won && a.left <= 5);
    const stars = objStars.children;
    for (let i = 0; i < stars.length; i++) stars[i].classList.toggle('on', i < live);
  }

  /** stars[] is [oneStar, twoStar, threeStar] in seconds, fastest last. */
  function starOnOffer(th, elapsed) {
    if (elapsed <= th[2]) return 3;
    if (elapsed <= th[1]) return 2;
    return 1;
  }

  function setFlip(g) {
    if (g.until > flipPeriod) flipPeriod = g.until;
    const left = Math.max(0, g.until || 0);
    const frac = Math.max(0, Math.min(1, 1 - left / flipPeriod));

    const key = [Math.round(left * 10), g.flips, g.settling, g.dir].join('|');
    if (key === lastFlip) return;
    lastFlip = key;

    flipLab.textContent = g.settling ? 'turning' : 'next turn';
    flipNum.textContent = g.settling ? '' : clock(left);
    flipFill.style.width = (g.settling ? 100 : frac * 100).toFixed(1) + '%';
    flipCount.textContent = g.flips ? 'turn ' + g.flips : '';
    flipGlyph.style.transform = 'rotate(' + (g.flips % 2 ? 180 : 0) + 'deg)';

    const soon = !g.settling && left <= 6;
    const now = g.settling || (!g.settling && left <= 2.5);
    flip.classList.toggle('is-soon', soon && !now);
    flip.classList.toggle('is-now', now);
    flipring.classList.toggle('on', now);
  }

  function setTide(t) {
    const frac = Math.max(0, Math.min(1, t.frac || 0));
    const cls = frac > 0.82 ? 'hot' : frac > 0.6 ? 'warm' : '';
    const pct = Math.round(frac * 1000);
    if (pct !== lastTide) { lastTide = pct; railFill.style.height = (frac * 100).toFixed(1) + '%'; }
    if (cls !== lastRailCls) {
      lastRailCls = cls;
      rail.classList.toggle('warm', cls === 'warm');
      rail.classList.toggle('hot', cls === 'hot');
    }
  }

  return {
    /** Panels that hang off the BOARD rect, not the control frame. */
    boardEls: [rail, flipring],
    panels: [objective, flip],

    /**
     * @param s the whole setHud payload. `fields` is the mode's own hud[] as a
     *          Set, or null when a mode did not declare one (show everything).
     */
    update(s, fields) {
      const wantObj = !!s.alchemy && (!fields || fields.has('objective'));
      const wantFlip = !!s.hourglass && (!fields || fields.has('flip'));
      const wantTide = !!s.tide && (!fields || fields.has('tide'));

      objective.classList.toggle('hide', !wantObj);
      flip.classList.toggle('hide', !wantFlip);
      rail.classList.toggle('hide', !wantTide);
      if (!wantFlip && flipring.classList.contains('on')) flipring.classList.remove('on');

      if (wantObj) setObjective(s.alchemy);
      if (wantFlip) setFlip(s.hourglass);
      if (wantTide) setTide(s.tide);
      return wantTide ? s.tide : null;
    },

    reset() {
  
      flipring.classList.remove('on');
    },
  };
}
