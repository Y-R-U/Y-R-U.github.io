import { h, icon, fmt } from './dom.js';
import { GLYPH, MODE_GLYPH } from './icons.js';

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

/**
 * The objective headline is generated in js/data/levelgen.js as
 * `Dissolve ${o.target} grains` — a raw integer — while the counter directly
 * underneath it is formatted, so one card printed "Dissolve 9035 grains" over
 * "8,577 / 9,035". Only runs of four digits or more are touched, which leaves
 * "lv 3" alone, and it is idempotent, so it survives the real fix landing in
 * levelgen rather than fighting it.
 */
function fmtLabel(t) {
  return String(t == null ? '' : t).replace(/\d{4,}/g, (d) => Number(d).toLocaleString('en-US'));
}

const STAR = '<path d="M12 3.1l2.65 5.86 6.35.62-4.8 4.3 1.4 6.28L12 16.9l-5.6 3.26 1.4-6.28-4.8-4.3 6.35-.62Z"/>';

/** m:ss, but seconds with a decimal under ten. HOURGLASS's flip is still a clock. */
function clock(s) {
  s = Math.max(0, s || 0);
  if (s < 10) return s.toFixed(1);
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

/**
 * WHERE THE WARNING STARTS, WHEN THE UNIT IS PIECES.
 *
 * A clock's last ten seconds are a slide you can watch arrive. A budget is
 * discrete and it only moves when the player moves it, so the warning has to be
 * a share of the budget rather than a fixed count — three left of fourteen and
 * three left of sixty-one are not the same situation — and it must not blink,
 * because a thing that changes on its own is a clock and this one does not.
 *
 * Twenty per cent and eight per cent, floored so a small budget still warns at
 * all and capped so a large one does not spend a third of the level shouting.
 */
const LOW_FRAC = 0.20, LAST_FRAC = 0.08;
const lowAt = (budget) => Math.min(8, Math.max(3, Math.round(budget * LOW_FRAC)));
const lastAt = (budget) => Math.min(3, Math.max(1, Math.round(budget * LAST_FRAC)));

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
  // THE BUDGET, WHERE THE CLOCK USED TO BE — and deliberately not shaped like
  // one. A clock is a bare numeral that changes on its own; this is a numeral
  // the player moves, wearing the glyph and the noun of the thing it counts, so
  // "18" can never be read as eighteen seconds. It is a chip rather than plain
  // type for the same reason: a clock is part of the readout, a budget is an
  // inventory.
  const objLeft = h('b', { class: 'obj-left t-num' });
  const objUnit = h('span', { class: 'obj-unit', text: 'pieces' });
  const objPieces = h('span', { class: 'obj-pieces' }, icon(GLYPH.piece), objLeft, objUnit);
  const objective = h('div', { class: 'panel obj hide' },
    h('div', { class: 'obj-head' }, objLabel, objCount),
    h('div', { class: 'obj-bar' }, objFill),
    h('div', { class: 'obj-foot' }, objLv, objStars, objPieces));

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
  // The last piece count seen, so a SPEND can be told from a repaint, and the
  // star currently on offer, so the shell can say something about it losing one
  // without this file deciding what that something is.
  let lastUsed = -1, offer = 0;
  // The flip period, so the bar can DEPLETE rather than guess. Latching it from
  // the first `until` seen is wrong: join a run two seconds before a flip and the
  // period becomes two seconds, so the bar reads empty at the exact moment it
  // should be screaming. Take it from the mode's own config, and only ever raise.
  let flipPeriod = 30;

  // ALCHEMY's star thresholds are PIECE COUNTS, and the mode publishes only the
  // star count it has already earned (0 until the level is won). The thresholds
  // live on the level, so read them from lane C's own level table rather than
  // guessing — then the three pips can show the star still on offer while the
  // budget is still being spent, which is the only version of them that affects
  // play. `starsFor` is lane C's own comparison; using it here rather than
  // re-deriving one is what stops the HUD and the result card disagreeing about
  // what a drop just cost.
  let levelOf = null, starsOf = null;
  import('../modes/alchemy.js')
    .then((m) => { levelOf = m && m.levelById; starsOf = m && m.starsFor; })
    .catch(() => { /* lane C absent: pips fall back to the earned count */ });
  import('../modes/hourglass.js')
    .then((m) => { const n = m && m.HOURGLASS_CFG && m.HOURGLASS_CFG.flipEvery; if (n > 0) flipPeriod = n; })
    .catch(() => { /* keep the 30 s default */ });

  function setObjective(a) {
    const lv = levelOf && a.id != null ? levelOf(a.id) : null;
    const budget = a.budget > 0 ? a.budget : 0;
    const used = Math.max(0, a.used | 0);
    const left = Math.max(0, a.left | 0);
    const frac = Math.max(0, Math.min(1, a.frac || 0));
    // The star STILL ON OFFER, judged on pieces spent. Fewer is better, so this
    // only ever falls — which is the whole lesson: a careless drop is not slower,
    // it is one star nearer the floor.
    const live = a.won ? (a.stars || 1) : (lv && starsOf ? starsOf(lv, used) : 0);

    const key = [a.label, a.value, a.target, a.won, live, left, used, budget,
                 Math.round(frac * 200), a.id].join('|');
    if (key === lastObj) return;
    const spent = lastUsed >= 0 && used > lastUsed && !a.won;
    lastObj = key; lastUsed = used;

    objLabel.textContent = a.won ? 'Complete' : fmtLabel(a.label || 'Objective');
    objCount.textContent = a.won ? '' : fmt(a.value) + ' / ' + fmt(a.target);
    objFill.style.width = (frac * 100).toFixed(1) + '%';
    objLv.textContent = a.id != null ? ('lv ' + a.id + (a.name ? ' · ' + a.name : '')) : '';
    // Won, the interesting number is no longer what is left in your hand: it is
    // what the level cost you, because that is the number the stars were judged
    // on and the number to beat on a replay.
    objLeft.textContent = String(a.won ? used : left);
    objUnit.textContent = a.won ? 'spent' : (left === 1 ? 'piece' : 'pieces');

    objective.classList.toggle('is-won', !!a.won);
    objective.classList.toggle('is-low', !a.won && budget > 0 && left <= lowAt(budget));
    objective.classList.toggle('is-last', !a.won && budget > 0 && left <= lastAt(budget));
    // A spend is the one event in this panel the player caused, so it is the one
    // thing that moves. Re-triggered rather than transitioned: two drops in a
    // second have to read as two.
    if (spent) { objPieces.classList.remove('spend'); void objPieces.offsetWidth; objPieces.classList.add('spend'); }

    const stars = objStars.children;
    for (let i = 0; i < stars.length; i++) {
      const on = i < live;
      // A pip that has just gone out flares as it goes. A star quietly missing
      // on the next glance is a thing you notice too late to learn from.
      if (!on && stars[i].classList.contains('on')) {
        stars[i].classList.remove('out'); void stars[i].getBoundingClientRect();
        stars[i].classList.add('out');
      }
      if (on) stars[i].classList.remove('out');
      stars[i].classList.toggle('on', on);
    }
    offer = live;
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

    /** The star ALCHEMY is currently offering, 0 when no level is running. */
    get offer() { return offer; },

    reset() {
      lastObj = ''; lastUsed = -1; offer = 0;
      objPieces.classList.remove('spend');
      for (const p of objStars.children) p.classList.remove('out');
      flipring.classList.remove('on');
    },
  };
}
