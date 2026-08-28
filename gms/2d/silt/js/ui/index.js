import { h, tap, icon, fmt } from './dom.js';
import { GLYPH, MODE_GLYPH, MODE_ACCENT } from './icons.js';
import { createWordmark } from './wordmark.js';
import { createSheet } from './sheet.js';
import { createSettings } from './settings.js';
import { mergeModes } from './modelist.js';
import { createSandTouch } from './sandtouch.js';
import { createModeHud } from './modehud.js';
import { createZenPalette } from './zenpalette.js';
import { createPayout } from './payout.js';
import { createLevelPicker, levelById, levelCount, pieces, stars } from './levels.js';

/**
 * SILT shell.
 *
 * The rule the whole layout obeys: the sand is the screen. Nothing here centres
 * a menu stack over the board — controls live in the four corners, where a thumb
 * already is, and everything else is a bottom sheet that leaves the top two
 * thirds of the sim visible.
 *
 * #ui is pointer-events:none. Each control opts back in with .gb / .mcard /
 * .sheet, so a tap that misses a button falls through to the canvas — which is
 * what makes the attract screen pour sand under your finger.
 */

const LAST_MODE_KEY = 'silt.lastmode';

const HINT = {
  play: 'drag to move · tap to turn · swipe to drop',
  zen: 'pick a material · drag to pour',
  // THE RULE ALCHEMY IS PLAYED BY, said in the place this shell already says
  // rules. A level is a handful of pieces, not a stopwatch, and a player who
  // has learned that mashing wins will not work that out from a number that
  // merely counts down — the sentence has to name BOTH halves: the drop costs
  // something, and the thinking does not.
  alchemy: 'each drop spends a piece · thinking costs nothing',
};

// A run that has not chained yet is a run scoring nothing, and after half a
// minute of that a player is entitled to know whether the game is broken or
// they are. Fired once, worded as the rule rather than as a scolding.
const NO_CHAIN_HINT = 'span wall to wall in one colour to score';
const NO_CHAIN_AFTER = 25000;

/**
 * Thousands separators in a string generated somewhere else.
 *
 * `js/data/levelgen.js` builds "Dissolve 9035 grains" while the counter under it
 * reads "8,577 / 9,035", and one card cannot print the same quantity two ways.
 * Only runs of four digits or more are touched, so "lv 3" and "Level 12" are
 * left alone, and it is idempotent: once the commas are in, no run is long
 * enough to match again. The real fix belongs in levelgen — lane C's file — and
 * this survives it rather than fighting it.
 */
function fmtLabel(t) {
  return String(t == null ? '' : t).replace(/\d{4,}/g, (d) => Number(d).toLocaleString('en-US'));
}

export function createUI(handlers = {}) {
  const H = { onStart() {}, onPause() {}, onResume() {}, onQuit() {}, ...handlers };
  const root = document.getElementById('ui');
  if (!root) return null;
  root.replaceChildren();

  let current = 'attract';
  let modes = mergeModes(null);
  let lastStarted = readLast();

  /* ------------------------------------------------------------- attract */

  const wm = createWordmark();
  const storyLab = h('b', { class: 'btn-sub t-num', text: '' });
  const storyBtn = h('button', { class: 'gb gb--pill gb--primary' },
    icon(MODE_GLYPH.alchemy), 'Story', storyLab);
  const attract = h('div', { class: 'scr scr-attract' },
    h('div', { class: 'veil veil-top' }),
    h('div', { class: 'veil veil-bot' }),
    h('div', { class: 'frame' },
      h('div', { class: 'brandbox' },
        wm.el,
        h('div', { class: 'tagline', html: 'Span the board &nbsp;<em>&middot;</em>&nbsp; watch it dissolve' })),
      h('div', { class: 'bestline' }),
      h('div', { class: 'hint', text: 'touch the sand' }),
      h('div', { class: 'corner corner-tl' },
        tap(h('button', { class: 'gb gb--icon', 'aria-label': 'Daily and events' },
          icon(GLYPH.spark), h('span', { class: 'pip' })), () => openDaily())),
      h('div', { class: 'corner corner-tr' },
        tap(h('button', { class: 'gb gb--icon', 'aria-label': 'Settings' }, icon(GLYPH.gear)), () => settings.show())),
      // Three doors, not one. "Play" used to resume whatever mode was last
      // started, which is the least legible thing a title screen can do: a
      // first-time player has no last mode, and a returning one cannot tell
      // what the button will boot. The campaign gets its own door — it is the
      // only part of SILT with a beginning — and everything else is one tap
      // behind QUICK PLAY, which picks an endless mode for you. MODES stays as
      // the icon between them for a player who wants to choose.
      h('div', { class: 'attract-btns' },
        storyBtn,
        tap(h('button', { class: 'gb gb--icon', 'aria-label': 'All modes' }, icon(GLYPH.grid)), () => openModes()),
        tap(h('button', { class: 'gb gb--pill' }, icon(GLYPH.play), 'Quick play'), () => quickPlay()))),
  );
  const bestline = attract.querySelector('.bestline');

  /* ----------------------------------------------------------------- hud */

  const hudMode = h('span', { class: 'hud-mode t-cap', text: 'FLOW' });
  const hudVal = h('span', { class: 'hud-val t-num', text: '0' });
  const pillChains = h('span', { class: 'pill' }, 'Chains', h('b', { text: '0' }));
  const pillTide = h('span', { class: 'pill pill--tide off' }, 'Tide', h('b', { text: '0%' }));
  const pillCombo = h('span', { class: 'pill pill--combo hide' }, 'Combo', h('b', { text: 'x1' }));
  const nextBox = h('div', { class: 'next' });
  const hudHint = h('div', { class: 'hud-hint', text: HINT.play });

  // The per-mode panels. Two of them hang off the CONTROL frame (they are type,
  // and type follows the buttons); two hang off the BOARD rect, because a
  // waterline and a flip warning are statements about the sand itself.
  const modeHud = createModeHud();
  const zenPal = createZenPalette(() => current === 'hud' && lastModeId === 'zen' && !sheetsOpen());

  // The payout. It hangs off the BOARD rect rather than the control frame, for
  // the same reason the tide rail and the flip ring do: it is a statement about
  // the sand, and the whole complaint it answers is that the reward for a chain
  // was living in a corner.
  const payout = createPayout();

  // Progress when the score cannot supply any.
  //
  // HOURGLASS and JELLY can be played for minutes at zero, and a zero that never
  // moves is indistinguishable from a broken game. This is a 3 px rail under the
  // pills filling toward your best run in THIS mode — the only honest "are you
  // getting anywhere" the shell can answer without reading the sim. It is off
  // for ALCHEMY, which already carries an objective bar, and off in ZEN, which
  // has no score to make progress against.
  const progFill = h('i');
  const progLab = h('span', { class: 'hud-prog-lab t-cap', text: '' });
  const hudProg = h('div', { class: 'hud-prog off' },
    h('span', { class: 'hud-prog-bar' }, progFill), progLab);

  const hudScore = h('div', { class: 'hud-score' }, hudMode, hudVal,
    h('div', { class: 'hud-pills' }, pillChains, pillTide, pillCombo), hudProg);

  // The top of the HUD is two columns, and which control sits in which is a
  // playtest result rather than a preference. PAUSE used to live in the
  // bottom-left thumb arc and NEXT in the top-right; on a real phone the thumb
  // is on the board for the whole run, so the button under it was being hit by
  // accident and the tile you actually want to READ was the one furthest from
  // the eye. They are swapped: PAUSE takes the top slot (and grows past 44 px,
  // since it is no longer where the thumb already rests) and NEXT drops beneath
  // it, under the account avatar. Both live in one column so the mode panels —
  // ALCHEMY's objective, HOURGLASS's flip clock — are laid out BESIDE them and
  // can never run underneath either.
  const hud = h('div', { class: 'scr scr-hud' },
    h('div', { class: 'veil veil-top' }),
    h('div', { class: 'veil veil-bot' }),
    ...modeHud.boardEls,
    payout.el,
    h('div', { class: 'frame' },
      h('div', { class: 'hud-stack' },
        h('div', { class: 'hud-main' }, hudScore, ...modeHud.panels),
        h('div', { class: 'hud-side' },
          h('div', { class: 'hud-pause' },
            tap(h('button', { class: 'gb gb--icon', 'aria-label': 'Pause' }, icon(GLYPH.pause)), () => pause())),
          nextBox)),
      zenPal.el,
      hudHint),
  );

  /* --------------------------------------------------------------- pause */

  const pauseScore = h('div', { class: 'bigscore t-num', text: '0' });
  const pauseTitle = h('h2', { class: 'card-title', text: 'FLOW' });
  const pauseScreen = h('div', { class: 'scr scr-pause' },
    h('div', { class: 'modal-wrap' },
      h('div', { class: 'modal-scrim', onclick: () => resume() }),
      h('div', { class: 'card' },
        h('div', { class: 'card-kicker', text: 'paused' }),
        pauseTitle,
        pauseScore,
        h('div', { class: 'card-kicker', text: 'points' }),
        h('div', { class: 'card-btns' },
          tap(h('button', { class: 'gb gb--primary' }, icon(GLYPH.play), 'Resume'), () => resume()),
          h('div', { class: 'card-row' },
            tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.gear), 'Settings'), () => settings.show()),
            tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.home), 'Quit'), () => { H.onQuit(); }))))),
  );

  /* ------------------------------------------------------------- results */

  const resKicker = h('div', { class: 'card-kicker', text: 'run over' });
  const resTitle = h('h2', { class: 'card-title', text: 'FLOW' });
  const resScore = h('div', { class: 'bigscore t-num', text: '0' });
  const resRibbon = h('div', { class: 'ribbon hide', text: 'new best' });
  const resChains = h('b', { class: 't-num', text: '0' });
  const resBest = h('b', { class: 't-num', text: '0' });
  const runCard = h('div', { class: 'card' },
    resKicker, resTitle, resScore, resRibbon,
    h('div', { class: 'statrow' },
      h('div', {}, h('span', { class: 't-cap', text: 'chains' }), resChains),
      h('div', {}, h('span', { class: 't-cap', text: 'best' }), resBest)),
    h('div', { class: 'card-btns' },
      tap(h('button', { class: 'gb gb--primary' }, icon(GLYPH.again), 'Play again'),
        () => play(lastStarted)),
      h('div', { class: 'card-row' },
        tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.grid), 'Modes'), () => { H.onQuit(); openModes(); }),
        tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.home), 'Home'), () => H.onQuit()))));

  /* ---------------------------------------------------- the ALCHEMY card */
  // A level that ran out of time and a level that was SOLVED are not the same
  // event and must never be able to look the same. The run card can only say
  // how many points a dead run scored, which is the least interesting fact
  // about a puzzle: what a player wants is the stars they took, the stars they
  // left behind, and the next problem.

  const alcKicker = h('div', { class: 'card-kicker alc-kicker', text: 'level complete' });
  const alcTitle = h('h2', { class: 'card-title alc-title', text: '' });
  const alcStars = h('div', { class: 'bigstars' });
  const alcGoal = h('div', { class: 'alc-goal' });
  const alcStats = h('div', { class: 'statrow' });
  const alcPrimary = tap(h('button', { class: 'gb gb--primary' }), () => alcGo());
  // REPLAY, on a won level as much as a lost one. A star rating you can see is
  // an invitation to beat it, and until now the only way back into a level you
  // had just three-starred-with-one-star was through the campaign sheet, two
  // taps away and scrolled to the wrong act. It rides beside the primary rather
  // than under it, small, because the forward move is still the default.
  const alcAgain = h('button', { class: 'gb gb--icon alc-again', 'aria-label': 'Play this level again' },
    icon(GLYPH.again));
  const alcLead = h('div', { class: 'alc-lead' }, alcAgain, alcPrimary);
  const alcCard = h('div', { class: 'card card--alc hide' },
    alcKicker, alcTitle, alcStars, alcGoal, alcStats,
    h('div', { class: 'card-btns' },
      alcLead,
      h('div', { class: 'card-row' },
        tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.grid), 'Levels'), () => openLevels()),
        tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.home), 'Home'), () => H.onQuit()))));

  let alcGo = () => {};
  let againGo = () => {};
  const tapAgain = (fn) => { againGo = fn; };
  tap(alcAgain, () => againGo());

  const results = h('div', { class: 'scr scr-results' },
    h('div', { class: 'modal-wrap' },
      h('div', { class: 'modal-scrim' }),
      runCard, alcCard),
  );

  /* -------------------------------------------------------------- sheets */

  const modeSheet = createSheet('MODES', 'six ways for sand to fall');
  const dailySheet = createSheet('EVENTS', 'today and this device');
  const levelSheet = createLevelPicker((n) => playLevel(n));
  const settings = createSettings({ blip: () => { const a = window.__game && window.__game.audio; a && a.sfx && a.sfx('rotate'); } });

  const bannerHost = h('div', { class: 'banner-host' });

  root.append(attract, hud, pauseScreen, results, modeSheet.el, dailySheet.el, levelSheet.el, settings.el, bannerHost);

  /* --------------------------------------------------------------- logic */

  // Lane C ships one mode at a time. Ask for the list, and rebuild the sheet if
  // it arrives after the shell is already up. A mode that is not there yet must
  // read as SOON, never as a button that boots nothing.
  import('../modes/index.js')
    .then((m) => { modes = mergeModes(m && (m.MODES || m.default)); buildModes(); paintStory(); })
    .catch(() => { modes = mergeModes(guessShipped()); buildModes(); paintStory(); });

  // The level table arrives on its own import inside levels.js. Asking for the
  // same module here costs nothing once it is cached and tells the Story button
  // how far the campaign has got the moment it can know.
  import('../modes/alchemy.js').then(() => paintStory()).catch(() => {});

  function guessShipped() {
    let ids = ['flow'];
    try { ids = (window.__game && window.__game.modes && window.__game.modes()) || ids; } catch { /* pre-boot */ }
    return ids.map((id) => ({ id }));
  }

  function readLast() {
    try { return localStorage.getItem(LAST_MODE_KEY) || 'flow'; } catch { return 'flow'; }
  }
  function writeLast(id) {
    lastStarted = id;
    try { localStorage.setItem(LAST_MODE_KEY, id); } catch { /* private mode */ }
  }

  function play(id, opts) {
    const m = modes.find((x) => x.id === id && x.ready) || modes.find((x) => x.ready) || modes[0];
    closeSheets();
    writeLast(m.id);
    H.onStart(m.id, opts || {});
  }

  function pause() { H.onPause(); show('pause'); }
  function resume() { H.onResume(); show('hud'); }

  /**
   * Start one ALCHEMY level. Goes through __game.startLevel — the host's own
   * entry point — so the shell is not a second place that knows how a level is
   * configured, and falls back to the plain onStart contract if it is absent.
   */
  function playLevel(n) {
    closeSheets();
    writeLast('alchemy');
    const g = window.__game;
    if (g && g.startLevel) g.startLevel(n);
    else H.onStart('alchemy', { level: n });
  }

  function closeSheets() {
    modeSheet.hide(); dailySheet.hide(); levelSheet.hide();
    if (settings.open) settings.hide();
  }

  function sheetsOpen() { return modeSheet.open || dailySheet.open || levelSheet.open || settings.open; }

  function openModes() { buildModes(); modeSheet.show(); }

  /** ALCHEMY is a campaign, so its entry point is the campaign, not level 1. */
  function openLevels() { modeSheet.hide(); levelSheet.show(); }

  /** The campaign, or the mode sheet while lane C's levels are still loading. */
  function openStory() {
    const alc = modes.find((m) => m.id === 'alchemy');
    if (alc && alc.ready && levelCount()) openLevels(); else openModes();
  }
  tap(storyBtn, () => openStory());

  /**
   * One tap, a mode you did not choose.
   *
   * ALCHEMY is a campaign with a fixed order and ZEN has no score and no end,
   * so neither is a "quick game" — the pool is the endless scoring modes only.
   * It also avoids handing back the mode you just played, so two taps in a row
   * are two different games rather than a coin that keeps landing the same way.
   */
  function quickPlay() {
    const pool = modes.filter((m) => m.ready && m.id !== 'alchemy' && m.id !== 'zen');
    if (!pool.length) { play(lastStarted); return; }
    const fresh = pool.length > 1 ? pool.filter((m) => m.id !== lastStarted) : pool;
    const pick = fresh[(Math.random() * fresh.length) | 0] || pool[0];
    play(pick.id);
    banner(pick.name);
  }

  /** How far through the campaign the Story button is offering to take you. */
  function paintStory() {
    const total = levelCount();
    const save = window.__game && window.__game.save;
    const at = (total && save && save.unlockedUpTo) ? Math.min(save.unlockedUpTo(total), total) : 1;
    const lab = at > 1 ? 'lv ' + at : '';
    storyLab.textContent = lab;
    // "Story lv 25" is 30 px wider than "Story", and the three doors already
    // sit edge to edge on a 390 px phone: measured, the gaps between them go to
    // ZERO the moment a returning player has a level to show. Published as a
    // class so the row can tighten only for the player who has one — a new
    // player keeps the roomier pill. See #ui.has-story-lv in ui.css.
    root.classList.toggle('has-story-lv', !!lab);
  }

  function buildModes() {
    const save = window.__game && window.__game.save;
    modeSheet.body.replaceChildren(...modes.map((m) => {
      const best = save && save.bestFor ? save.bestFor(m.id) : 0;
      const art = h('span', { class: 'mcard-art' }, icon(MODE_GLYPH[m.id] || MODE_GLYPH.flow));
      const card = h('button', {
        class: 'mcard' + (m.ready ? '' : ' locked'),
        style: { '--ac': MODE_ACCENT[m.id] || '#f2b33d' },
      },
        art,
        h('span', { class: 'mcard-txt' },
          h('span', { class: 'mcard-name', text: m.name }),
          h('span', { class: 'mcard-blurb', text: m.blurb })),
        h('span', { class: 'mcard-meta' },
          m.ready
            ? (m.id === 'alchemy' ? alchemyMeta(save)
              : best ? [h('span', { class: 't-cap', text: 'best' }), h('b', { text: fmt(best) })]
                     : h('span', { class: 't-cap', text: m.tag }))
            : h('span', { class: 'tag-soon', text: 'soon' })));
      // --ac is read by a color-mix() in ui.css, so it has to be a real custom
      // property on the element, not a class.
      card.style.setProperty('--ac', MODE_ACCENT[m.id] || '#f2b33d');
      if (m.ready) tap(card, () => (m.id === 'alchemy' ? openLevels() : play(m.id)));
      return card;
    }));
  }

  /** ALCHEMY's best is not a score, it is how far through the campaign you are. */
  function alchemyMeta(save) {
    const total = levelCount();
    if (!total || !save || !save.unlockedUpTo) return h('span', { class: 't-cap', text: 'puzzles' });
    const at = Math.min(save.unlockedUpTo(total), total);
    const done = save.levels ? Object.keys(save.levels).length : 0;
    return done
      ? [h('span', { class: 't-cap', text: 'level' }), h('b', { text: at + ' / ' + total })]
      : h('span', { class: 't-cap', text: total + ' levels' });
  }

  function dayHash(s) {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
    return (x >>> 0);
  }

  function openDaily() {
    const save = window.__game && window.__game.save;
    const day = (save && save.today && save.today()) || new Date().toISOString().slice(0, 10);
    // ALCHEMY is hand-built levels and ZEN cannot end, so neither means anything
    // as a seeded one-shot. The daily is only ever an endless, scoring mode.
    const ready = modes.filter((m) => m.ready && m.id !== 'alchemy' && m.id !== 'zen');
    const hsh = dayHash(day);
    const pick = ready.length ? ready[hsh % ready.length] : modes[0];
    const seed = hsh % 1000000;
    const stats = (save && save.stats) || { games: 0, chains: 0, cells: 0 };

    dailySheet.setTitle('EVENTS', day);
    dailySheet.body.replaceChildren(
      h('button', {
        class: 'mcard' + (pick.ready ? '' : ' locked'),
        style: { '--ac': MODE_ACCENT[pick.id] || '#f2b33d' },
        onclick: pick.ready ? () => play(pick.id, { seed }) : null,
      },
        h('span', { class: 'mcard-art' }, icon(GLYPH.spark)),
        h('span', { class: 'mcard-txt' },
          h('span', { class: 'mcard-name', text: "Today's run" }),
          h('span', { class: 'mcard-blurb', text: `${pick.name} on seed ${seed}. The same board for everyone, until midnight UTC.` })),
        h('span', { class: 'mcard-meta' }, icon(GLYPH.play))),
      h('div', { class: 'row' },
        h('div', {}, h('span', { class: 'row-lab', text: 'Runs played' })),
        h('div', { class: 'row-ctl' }, h('b', { class: 't-num', text: fmt(stats.games) }))),
      h('div', { class: 'row' },
        h('div', {}, h('span', { class: 'row-lab', text: 'Chains made' })),
        h('div', { class: 'row-ctl' }, h('b', { class: 't-num', text: fmt(stats.chains) }))),
      h('div', { class: 'row' },
        h('div', {}, h('span', { class: 'row-lab', text: 'Grains dissolved' })),
        h('div', { class: 'row-ctl' }, h('b', { class: 't-num', text: fmt(stats.cells) }))),
    );
    const first = dailySheet.body.firstElementChild;
    if (pick.ready) first.style.setProperty('--ac', MODE_ACCENT[pick.id] || '#f2b33d');
    dailySheet.show();
  }

  /* ------------------------------------------------------------ next tile */

  let nextKey = '';
  let tintCache = null, tintBiome = '';
  let BIOME_TINTS = null;

  function tintHex(t) {
    const R = window.__game && window.__game.renderer;
    const bn = (R && R.biome) || 'dune';
    if (bn !== tintBiome) { tintBiome = bn; tintCache = null; }
    if (!tintCache) {
      tintCache = ['#8a6b45', '#f2b33d', '#d9603b', '#cfc6ae', '#41c9d8', '#b189d6', '#b7c46a', '#e0d2b4'];
      if (BIOME_TINTS && BIOME_TINTS[bn]) tintCache = BIOME_TINTS[bn];
    }
    return tintCache[t] || tintCache[1];
  }

  import('../gfx/biomes.js').then((m) => {
    if (!m || !m.BIOMES) return;
    // The renderer stores albedo in linear space under a lit rig; the swatch has
    // no rig, so approximate what the eye sees with a fixed exposure + gamma.
    // Close enough that the tile reads as the same colour as the falling piece.
    const enc = (v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v * 2.2)), 1 / 2.2));
    BIOME_TINTS = {};
    for (const k in m.BIOMES) {
      BIOME_TINTS[k] = (m.BIOMES[k].tints || []).map((c) =>
        '#' + [enc(c[0]), enc(c[1]), enc(c[2])].map((n) => n.toString(16).padStart(2, '0')).join(''));
    }
    tintCache = null; nextKey = '';
  }).catch(() => {});

  function drawNext(p) {
    if (!p || !p.cells) { if (nextKey) { nextBox.replaceChildren(); nextKey = ''; } return; }
    const key = p.key + ':' + p.cells.map((c) => c.tint).join('');
    if (key === nextKey) return;
    nextKey = key;

    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const c of p.cells) {
      if (c.bx < minX) minX = c.bx; if (c.bx > maxX) maxX = c.bx;
      if (c.by < minY) minY = c.by; if (c.by > maxY) maxY = c.by;
    }
    const w = maxX - minX + 1, hgt = maxY - minY + 1;
    const cells = p.cells.map((c) =>
      `<rect x="${(c.bx - minX) * 10 + 0.7}" y="${(c.by - minY) * 10 + 0.7}" width="8.6" height="8.6" rx="2.1" fill="${tintHex(c.tint)}"/>`).join('');
    const pad = 1.2;
    const el = document.createElement('div');
    el.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w * 10 + pad * 2} ${hgt * 10 + pad * 2}" preserveAspectRatio="xMidYMid meet">${cells}</svg>`;
    nextBox.replaceChildren(el.firstElementChild);
  }

  /* -------------------------------------------------------------- banner */

  let bannerAt = 0;
  function banner(text) {
    if (!text) return;
    // The attract loop runs a real mode, so it fires real mode banners — and
    // they land straight on top of the wordmark. The title screen is not a
    // scoreboard; only a run the player is actually in gets to shout.
    if (current !== 'hud' && current !== 'pause') return;
    const now = performance.now();
    if (now - bannerAt < 140) return;         // a mode firing twice on one tick
    const live = bannerHost.lastElementChild;
    if (live && live.textContent === String(text)) return;
    bannerAt = now;
    const el = h('div', { class: 'banner', text: String(text) });
    bannerHost.append(el);
    setTimeout(() => el.remove(), 2400);
    while (bannerHost.childElementCount > 3) bannerHost.firstElementChild.remove();
  }

  /* ------------------------------------------------------- alchemy result */

  function statCell(cap, value) {
    return h('div', {}, h('span', { class: 't-cap', text: cap }),
      value && value.nodeType ? value : h('b', { class: 't-num', text: String(value) }));
  }

  /**
   * Won and lost are two different cards wearing one shell. The won card leads
   * with the stars, because that is the number a puzzle player is playing for;
   * the lost card leads with how close the objective got, because "run over"
   * with a score on it says nothing about a level you nearly had.
   */
  function alchemyResult(r, a) {
    const lv = levelById(a.id);
    const won = !!r.won;
    const total = levelCount();
    const got = won ? (r.stars || 1) : 0;
    const bestSt = Math.max(r.bestStars || 0, got);
    // What the level COST, in the currency it is scored in. The mode publishes
    // it outright now; deriving it from a limit and a remainder was only ever a
    // workaround for a clock that published neither.
    //
    // CLAMPED TO THE BUDGET, and that is not rounding a number down to flatter
    // anyone. The mode fails a run on `used > budget` and explicitly disowns the
    // spawn that crossed the line — `world.piece = null`, the piece never
    // happened — so an unclamped card reports "19 of 18" for a player who was
    // handed eighteen and played eighteen.
    const budget = a.budget > 0 ? (a.budget | 0) : null;
    const spent = a.used == null ? null
      : Math.min(budget == null ? Infinity : budget, Math.max(0, a.used | 0));

    // Two ways to fail a level and they are not the same mistake: the budget ran
    // out, or the board filled up. Printing "out of pieces" over a board that
    // topped out with nine still in hand tells the player to be quicker with a
    // resource they had plenty of, which is the opposite of the advice they need.
    alcCard.classList.toggle('is-won', won);
    alcKicker.textContent = won ? 'level complete'
      : (a.left > 0 ? 'topped out' : 'out of pieces');
    alcTitle.textContent = a.name || ('Level ' + a.id);

    alcStars.replaceChildren(stars(got, 'bigstars-row'),
      h('span', { class: 'alc-lv t-cap', text: 'lv ' + a.id + (a.arch ? ' · ' + a.arch : '') }));

    if (won) {
      // The star you did NOT take is the reason to play the level again, so name
      // the time that would have earned it rather than just dimming a pip.
      // The star you did NOT take is a piece count, and naming it is the whole
      // instruction: "in 11 pieces" tells a player to place better, where
      // "under 42s" told them to hurry. `in`, not `under` — lane C's own
      // starsFor awards the star AT the threshold, and "under 11" is wrong by one.
      const nextStar = lv && got < 3 ? lv.stars[got] : null;
      alcGoal.replaceChildren(
        got >= 3
          ? h('div', { class: 'ribbon ribbon--win', text: 'perfect' })
          : h('div', { class: 'alc-nudge' },
              stars(got + 1, 'stars stars--inline'),
              h('span', { class: 'alc-next', text: nextStar != null ? 'in ' + pieces(nextStar) : 'in fewer pieces' })));
      alcStats.replaceChildren(
        // "PIECES 12" on a card that also knows about a budget is ambiguous by
        // construction: spent, or left? It is what the level cost, and the star
        // threshold beside it is a cost too, so say so — and print the budget
        // next to it, because twelve is only good or bad against eighteen.
        statCell('pieces used', spent == null ? '—' : (budget ? spent + ' of ' + budget : String(spent))),
        statCell('score', fmt(r.score)),
        statCell('best', stars(bestSt, 'stars stars--stat')));
    } else {
      const frac = Math.max(0, Math.min(1, a.frac || 0));
      const bar = h('i');
      alcGoal.replaceChildren(
        h('div', { class: 'alc-obj' },
          h('span', { class: 'alc-obj-lab', text: fmtLabel(a.label || 'Objective') }),
          h('span', { class: 'alc-obj-num t-num', text: fmt(a.value) + ' / ' + fmt(a.target) })),
        h('div', { class: 'alc-obj-bar' }, bar));
      requestAnimationFrame(() => { bar.style.width = (frac * 100).toFixed(1) + '%'; });
      alcStats.replaceChildren(
        statCell('reached', Math.round(frac * 100) + '%'),
        // What it cost to get that far belongs on the losing card too: on a
        // top-out it says how much of the budget is still unspent, and on a
        // spent budget it is the sentence itself. It takes the score's cell,
        // and that is the right trade — a score is decoration on a puzzle you
        // failed, while "18 of 18" is the reason you failed it.
        statCell('pieces used', spent == null ? '—' : (budget ? spent + ' of ' + budget : String(spent))),
        statCell('best', stars(bestSt, 'stars stars--stat')));
    }

    const hasNext = won && total && a.id < total;
    const last = won && total && a.id >= total;
    alcPrimary.replaceChildren(...[
      icon(won ? GLYPH.play : GLYPH.again),
      document.createTextNode(hasNext ? 'Next level' : last ? 'Back to levels' : 'Try again'),
      hasNext ? h('b', { class: 'lv-cont-n', text: 'lv ' + (a.id + 1) }) : null,
    ].filter(Boolean));
    alcGo = hasNext ? () => playLevel(a.id + 1)
          : last ? () => { H.onQuit(); openLevels(); }
          : () => playLevel(a.id);
    // On a LOST level the primary is already "Try again", so a second replay
    // button would be the same button twice.
    alcAgain.classList.toggle('hide', !won);
    tapAgain(() => playLevel(a.id));
  }

  /** Seven digits do not fit at 54px. Step the size instead of letting it clip. */
  function setBig(el, n) {
    const t = fmt(n);
    el.textContent = t;
    el.classList.toggle('long', t.length >= 8);
    el.classList.toggle('vlong', t.length >= 11);
  }

  /* --------------------------------------------------------------- screens */

  const SCREENS = { attract, hud, pause: pauseScreen, results };

  function show(name) {
    if (name === 'menu') { show('attract'); openModes(); return; }
    const target = SCREENS[name] ? name : 'attract';
    // 'hud' is NOT idempotent, and skipping it was a real trap. Everything a
    // new run needs reset — the payout baseline, the nudge clock, the best-run
    // rail, the field list — lives in the hud branch below, so
    // __game.start() called OVER a live run inherited the last run's state. No
    // player path hits it (results and attract both pass through another
    // screen first) but the payout gate did, and had to detour via attract()
    // to get a clean run. Re-entering costs a hint that shows again, which
    // after a resume is no loss.
    if (target === current && target !== 'attract' && target !== 'hud') return;
    const from = current;
    current = target;

    for (const k in SCREENS) SCREENS[k].classList.toggle('is-on', k === target);

    if (target === 'attract') {
      closeSheets();
      wm.start();
      const save = window.__game && window.__game.save;
      const best = save && save.bestFor ? Math.max(...modes.map((m) => save.bestFor(m.id) || 0), 0) : 0;
      bestline.replaceChildren(...(best > 0
        ? [h('span', { class: 't-cap', text: 'best' }), h('b', { class: 't-num', text: fmt(best) })]
        : []));
      paintStory();
    } else {
      wm.stop();
    }

    // A banner belongs to the run that fired it. Left alone they outlive it by
    // up to 2.4s, so quitting mid-chain carried a "COMBO x4" onto the title
    // screen — which is the exact thing the guard in banner() exists to prevent,
    // arriving by the other door.
    if (target !== 'hud' && target !== 'pause') bannerHost.replaceChildren();
    // A payout belongs to the run that earned it. It is a second and a half of
    // life, so quitting on a chain used to be able to carry a +2,140 onto the
    // results card — the same class of leak the banner line above exists for.
    if (target !== 'hud') payout.reset();

    if (target === 'hud') {
      hudHint.textContent = HINT[lastModeId] || HINT.play;
      hudHint.classList.remove('gone');
      clearTimeout(hintT);
      hintT = setTimeout(() => hudHint.classList.add('gone'), 4200);
      // A new run may be a different mode; make the next setHud re-read the
      // field list rather than inheriting the last run's panels.
      lastFields = '';
      // Coming back from PAUSE is the same run continuing: resetting the payout
      // baseline there would make the first chain after a pause pay out the
      // whole run's score in one number.
      if (from !== 'pause') {
        payout.reset();
        payMark = (window.__state && window.__state.score) || 0;
        lastChains = -1; progPct = -1;
        runAt = performance.now(); nudged = false;
        // A replay is the same level id, so without this the budget banner
        // would fire once per level ever rather than once per attempt — and the
        // attempt is the thing being taught.
        alcLevel = -1; alcOffer = 0;
      }
    } else {
      zenPal.show(false);
      modeHud.reset();
      root.classList.remove('has-panel');
    }
    if (target === 'pause') {
      const st = window.__state;
      pauseTitle.textContent = lastMode || 'RUN';
      setBig(pauseScore, (st && st.score) || Math.max(lastScore, 0));
    }
    if (target === 'results' || target === 'pause') closeSheets();
  }

  let hintT = 0;

  /* ---------------------------------------------------------------- hud IO */

  let lastScore = -1, lastChains = -1, lastCombo = -1, lastMode = '';
  let lastModeId = '', lastFields = '', lastTidePct = '', fields = null;
  // The payout is a DIFF, and the diff needs its own mark: `lastScore` moves on
  // every frame the score does, so it cannot also be the baseline a chain is
  // measured from. World.score only ever moves on a chain (world.js awards
  // there and score.js replaces that award in onChain), so this difference is
  // the exact award and not an approximation of it.
  let payMark = 0, runAt = 0, nudged = false, progBest = 0, progPct = -1, progOn = false;

  /**
   * Which panels a mode gets is the MODE's decision, published as its `hud`
   * array. An absent array means "everything" — that is a mode that predates the
   * field list, not a mode that wants a blank HUD. ZEN's `hud: []` is the real
   * empty case and it has to survive the difference.
   */
  function applyFields(s) {
    const F = Array.isArray(s.hud) ? new Set(s.hud) : null;
    const has = (k) => !F || F.has(k);
    lastModeId = s.modeId || '';

    hud.classList.toggle('is-bare', !!F && F.size === 0);
    hudScore.classList.toggle('off', !has('score'));
    nextBox.classList.toggle('off', !has('next'));
    pillChains.classList.toggle('off', !has('chains'));
    pillTide.classList.toggle('off', !has('tide'));
    pillCombo.classList.toggle('off', !has('combo'));
    hudHint.textContent = HINT[lastModeId] || HINT.play;
    zenPal.show(lastModeId === 'zen');
    // A mode panel occupies the band the banner used to drop into, and a banner
    // landing on the objective is how ALCHEMY's "COMPLETE" ended up printed
    // twice, on top of itself. Move the banners below the panel instead.
    root.classList.toggle('has-panel', !F || F.has('objective') || F.has('flip'));

    // The best-run rail. ALCHEMY already answers "am I getting anywhere" with an
    // objective bar and a piece budget, so it does not get a second one; ZEN has no
    // score to make progress against. What is left is exactly the four endless
    // modes, two of which are the ones a playtester sat in at zero for minutes.
    const save = window.__game && window.__game.save;
    progBest = (has('score') && !has('objective') && save && save.bestFor)
      ? (save.bestFor(lastModeId) || 0) : 0;
    progOn = progBest > 0;
    hudProg.classList.toggle('off', !progOn);
    progPct = -1;

    modeHud.reset();
    return F;
  }

  function setHud(s) {
    if (!s) return;
    if (s.mode && s.mode !== lastMode) { lastMode = s.mode; hudMode.textContent = s.mode; }

    // The field list only changes when the mode does, and rebuilding it every
    // rAF would allocate a Set 60 times a second for a run that lasts minutes.
    const fkey = (s.modeId || s.mode || '') + '|' + (Array.isArray(s.hud) ? s.hud.join(',') : '*');
    if (fkey !== lastFields) { lastFields = fkey; fields = applyFields(s); }
    // Coerce, because NaN !== NaN would re-run the bump animation every frame
    // for the rest of the run. (World.score does go NaN today — see HANDOFF.)
    const score = Number.isFinite(s.score) ? s.score : 0;
    if (score !== lastScore) {
      const jump = score > lastScore && lastScore >= 0;
      lastScore = score;
      hudVal.textContent = fmt(score);
      if (jump) { hudVal.classList.remove('bump'); void hudVal.offsetWidth; hudVal.classList.add('bump'); }
    }
    if (s.chains !== lastChains) {
      // A chain landed between this frame and the last. `s.chain`, if the sim
      // ever publishes it, carries the grain count and where on the board it
      // went; without it the payout still knows what it was worth and rises
      // from mid-board. The shell does not go looking in the grid for the rest.
      const d = s.chains - lastChains;
      if (lastChains >= 0 && d > 0) {
        const c = s.chain || null;
        payout.chain({ gain: score - payMark, chains: d,
          size: c && c.size, x: c && c.x, y: c && c.y });
      }
      payMark = score;
      lastChains = s.chains;
      pillChains.lastElementChild.textContent = fmt(s.chains);
    }
    if (s.combo !== lastCombo) {
      lastCombo = s.combo;
      pillCombo.classList.toggle('hide', !(s.combo > 1));
      pillCombo.lastElementChild.textContent = 'x' + (s.combo || 1);
    }

    if (progOn) {
      // The rail is capped at 100%, so the percentage alone cannot tell "at your
      // best" from "past it" — and past it is the whole moment. Beating it is
      // part of the key, or the label never flips.
      const beat = score > progBest;
      const pct = Math.min(100, Math.round((score / progBest) * 100));
      const key = pct + (beat ? 1 : 0) * 1000;
      if (key !== progPct) {
        progPct = key;
        progFill.style.width = pct + '%';
        hudProg.classList.toggle('is-best', beat);
        progLab.textContent = beat ? 'new best' : 'best ' + fmt(progBest);
      }
    }

    // Zero for half a minute with no chain is the state a playtester sat in and
    // could not read. Say the rule once, then go quiet again.
    if (!nudged && runAt && lastChains <= 0 && (!fields || fields.has('score'))
        && performance.now() - runAt > NO_CHAIN_AFTER) {
      nudged = true;
      hudHint.textContent = NO_CHAIN_HINT;
      hudHint.classList.remove('gone');
      clearTimeout(hintT);
      hintT = setTimeout(() => hudHint.classList.add('gone'), 6000);
    }

    const tide = modeHud.update(s, fields);
    if (s.alchemy && (!fields || fields.has('objective'))) alchemyEconomy(s.alchemy);
    if (tide) {
      const pct = Math.round(Math.max(0, Math.min(1, tide.frac || 0)) * 100) + '%';
      if (pct !== lastTidePct) { lastTidePct = pct; pillTide.lastElementChild.textContent = pct; }
    }
    drawNext(s.next);
  }

  /**
   * THE ECONOMY, SAID OUT LOUD — and then not said again.
   *
   * ALCHEMY's currency is pieces now, not seconds, and the number in the HUD
   * cannot teach that on its own to a player who has already learned that
   * mashing wins: it looks like every countdown they have ever seen. Two
   * moments carry it, both in the shell's existing quiet voice rather than a
   * tutorial box.
   *
   *   THE BUDGET, at the top of a level. `18 PIECES` in the same banner the
   *   mode itself uses for COMPLETE. Only while the campaign is young — a
   *   banner that fires on all ninety levels is wallpaper, and by then the chip
   *   in the HUD is doing the job.
   *
   *   THE COST, the first time a drop takes a star off the table. That is the
   *   instant the economy becomes real and it is exactly the one a masher needs:
   *   nothing was slow, a piece was wasted. It can fire at most twice a level.
   *
   * The third and largest part is not here at all — it is HINT.alchemy, which
   * states the rule in words for four seconds at the start of every run.
   */
  const STAR_LOST = { 2: 'TWO STARS LEFT', 1: 'ONE STAR LEFT' };
  let alcLevel = -1, alcOffer = 0;

  function alchemyEconomy(a) {
    if (a.id !== alcLevel) {
      alcLevel = a.id;
      alcOffer = modeHud.offer;
      const save = window.__game && window.__game.save;
      const done = (save && save.levels) ? Object.keys(save.levels).length : 0;
      if (a.budget > 0 && done < 4) banner(a.budget + ' PIECES');
      return;
    }
    const now = modeHud.offer;
    if (!a.won && now > 0 && now < alcOffer) banner(STAR_LOST[now] || 'A STAR SPENT');
    alcOffer = now;
  }

  /* --------------------------------------------------------------- touch */

  // Mirror the letterboxed board rect into CSS. Everything in .frame hangs off
  // these, so the shell tracks the sand through rotation, a notch and a desktop
  // window without a single JS-driven layout pass.
  function syncBoard() {
    const v = window.__game && window.__game.view;
    const b = v && v.board;
    if (!b || !(b.w > 1)) return;
    root.style.setProperty('--board-x', b.x + 'px');
    root.style.setProperty('--board-y', b.y + 'px');
    root.style.setProperty('--board-w', b.w + 'px');
    root.style.setProperty('--board-h', b.h + 'px');
    const safe = v.safe || { left: 0, right: 0, bottom: 0 };
    const gap = Math.max(0, v.h - (b.y + b.h));
    root.style.setProperty('--board-b', Math.min(gap, safe.bottom || 0) + 'px');

    // The controls track the board, but they must never be NARROWER than a
    // thumb needs: a mode with a 64-column board letterboxes to ~245 px on a
    // phone, and PLAY + MODES do not fit in that. Widen to a comfortable
    // minimum, then re-centre on the board and clamp inside the safe area.
    const avail = v.w - safe.left - safe.right;
    const w = Math.max(b.w, Math.min(avail, 430));
    const x = Math.max(safe.left, Math.min(b.x + (b.w - w) / 2, v.w - safe.right - w));
    root.style.setProperty('--ui-x', x + 'px');
    root.style.setProperty('--ui-w', w + 'px');
  }
  {
    const v = window.__game && window.__game.view;
    if (v && v.onResize) v.onResize(syncBoard);
    syncBoard();
    // setBoard() fires before the UI exists on the very first world, so take one
    // more reading once the first frame has been through main's loop.
    requestAnimationFrame(syncBoard);
  }

  // sheetsOpen(), not a hand-written list: the original named three of the four
  // sheets and left out the campaign picker. Nothing leaked through — guarded()
  // in sandtouch.js blocks a tap on any .sheet structurally — but two lists of
  // the same thing is how the next sheet gets forgotten.
  createSandTouch(attract, () => current === 'attract' && !sheetsOpen());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) wm.stop();
    else if (current === 'attract') wm.start();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (sheetsOpen()) closeSheets();
    else if (current === 'hud') pause();
    else if (current === 'pause') resume();
  });

  show('attract');

  const api = {
    show,
    setHud,
    banner,
    results(r = {}) {
      lastScore = -1; lastChains = -1; lastCombo = -1; payMark = 0;
      const alc = r.modeId === 'alchemy' && r.alchemy ? r.alchemy : null;
      runCard.classList.toggle('hide', !!alc);
      alcCard.classList.toggle('hide', !alc);
      if (alc) alchemyResult(r, alc);
      else {
        resTitle.textContent = r.mode || 'RUN';
        setBig(resScore, r.score);
        resChains.textContent = fmt(r.chains);
        resBest.textContent = fmt(Math.max(r.best || 0, r.score || 0));
        resRibbon.classList.toggle('hide', !r.isBest);
        resKicker.textContent = 'run over';
      }
      show('results');
    },
    openModes, openLevels, openSettings: () => settings.show(), openDaily,
    wmSeek: (ms) => wm.seek(ms),
    /** Wind this run's clock back, so a gate can reach the chainless nudge in
     *  under 25 real seconds. Same idea as wmSeek: it moves the CLOCK, it does
     *  not fake the outcome — every condition on the nudge still has to hold. */
    nudgeSeek: (ms) => { if (runAt) runAt -= ms; },
    zen: zenPal,
    get screen() { return current; },
  };
  window.__ui = api;
  return api;
}
