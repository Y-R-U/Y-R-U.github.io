import { h, tap, icon, fmt } from './dom.js';
import { GLYPH, MODE_GLYPH, MODE_ACCENT } from './icons.js';
import { createWordmark } from './wordmark.js';
import { createSheet } from './sheet.js';
import { createSettings } from './settings.js';
import { mergeModes } from './modelist.js';
import { createSandTouch } from './sandtouch.js';

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
      h('div', { class: 'attract-btns' },
        tap(h('button', { class: 'gb gb--pill gb--primary' }, icon(GLYPH.play), 'Play'), () => play(lastStarted)),
        tap(h('button', { class: 'gb gb--pill' }, icon(GLYPH.grid), 'Modes'), () => openModes()))),
  );
  const bestline = attract.querySelector('.bestline');

  /* ----------------------------------------------------------------- hud */

  const hudMode = h('span', { class: 'hud-mode t-cap', text: 'FLOW' });
  const hudVal = h('span', { class: 'hud-val t-num', text: '0' });
  const pillChains = h('span', { class: 'pill' }, 'Chains', h('b', { text: '0' }));
  const pillCombo = h('span', { class: 'pill pill--combo hide' }, 'Combo', h('b', { text: 'x1' }));
  const nextBox = h('div', { class: 'next' });
  const hudHint = h('div', { class: 'hud-hint', text: 'drag to move · tap to turn · swipe down to drop' });

  const hud = h('div', { class: 'scr scr-hud' },
    h('div', { class: 'veil veil-top' }),
    h('div', { class: 'veil veil-bot' }),
    h('div', { class: 'frame' },
      h('div', { class: 'hud-top' },
        h('div', { class: 'hud-score' }, hudMode, hudVal,
          h('div', { class: 'hud-pills' }, pillChains, pillCombo)),
        nextBox),
      h('div', { class: 'hud-pause' },
        tap(h('button', { class: 'gb gb--icon', 'aria-label': 'Pause' }, icon(GLYPH.pause)), () => pause())),
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
  const results = h('div', { class: 'scr scr-results' },
    h('div', { class: 'modal-wrap' },
      h('div', { class: 'modal-scrim' }),
      h('div', { class: 'card' },
        resKicker, resTitle, resScore, resRibbon,
        h('div', { class: 'statrow' },
          h('div', {}, h('span', { class: 't-cap', text: 'chains' }), resChains),
          h('div', {}, h('span', { class: 't-cap', text: 'best' }), resBest)),
        h('div', { class: 'card-btns' },
          tap(h('button', { class: 'gb gb--primary' }, icon(GLYPH.again), 'Play again'),
            () => play(lastStarted)),
          h('div', { class: 'card-row' },
            tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.grid), 'Modes'), () => { H.onQuit(); openModes(); }),
            tap(h('button', { class: 'gb gb--ghost' }, icon(GLYPH.home), 'Home'), () => H.onQuit()))))),
  );

  /* -------------------------------------------------------------- sheets */

  const modeSheet = createSheet('MODES', 'six ways for sand to fall');
  const dailySheet = createSheet('EVENTS', 'today and this device');
  const settings = createSettings({ blip: () => { const a = window.__game && window.__game.audio; a && a.sfx && a.sfx('rotate'); } });

  const bannerHost = h('div', { class: 'banner-host' });

  root.append(attract, hud, pauseScreen, results, modeSheet.el, dailySheet.el, settings.el, bannerHost);

  /* --------------------------------------------------------------- logic */

  // Lane C ships one mode at a time. Ask for the list, and rebuild the sheet if
  // it arrives after the shell is already up. A mode that is not there yet must
  // read as SOON, never as a button that boots nothing.
  import('../modes/index.js')
    .then((m) => { modes = mergeModes(m && (m.MODES || m.default)); buildModes(); })
    .catch(() => { modes = mergeModes(guessShipped()); buildModes(); });

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

  function closeSheets() {
    modeSheet.hide(); dailySheet.hide();
    if (settings.open) settings.hide();
  }

  function openModes() { buildModes(); modeSheet.show(); }

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
            ? (best ? [h('span', { class: 't-cap', text: 'best' }), h('b', { text: fmt(best) })]
                    : h('span', { class: 't-cap', text: m.tag }))
            : h('span', { class: 'tag-soon', text: 'soon' })));
      // --ac is read by a color-mix() in ui.css, so it has to be a real custom
      // property on the element, not a class.
      card.style.setProperty('--ac', MODE_ACCENT[m.id] || '#f2b33d');
      if (m.ready) tap(card, () => play(m.id));
      return card;
    }));
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
    if (target === current && target !== 'attract') return;
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
    } else {
      wm.stop();
    }

    if (target === 'hud') {
      hudHint.classList.remove('gone');
      clearTimeout(hintT);
      hintT = setTimeout(() => hudHint.classList.add('gone'), 4200);
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
  function setHud(s) {
    if (!s) return;
    if (s.mode && s.mode !== lastMode) { lastMode = s.mode; hudMode.textContent = s.mode; }
    // Coerce, because NaN !== NaN would re-run the bump animation every frame
    // for the rest of the run. (World.score does go NaN today — see HANDOFF.)
    const score = Number.isFinite(s.score) ? s.score : 0;
    if (score !== lastScore) {
      const jump = score > lastScore && lastScore >= 0;
      lastScore = score;
      hudVal.textContent = fmt(score);
      if (jump) { hudVal.classList.remove('bump'); void hudVal.offsetWidth; hudVal.classList.add('bump'); }
    }
    if (s.chains !== lastChains) { lastChains = s.chains; pillChains.lastElementChild.textContent = fmt(s.chains); }
    if (s.combo !== lastCombo) {
      lastCombo = s.combo;
      pillCombo.classList.toggle('hide', !(s.combo > 1));
      pillCombo.lastElementChild.textContent = 'x' + (s.combo || 1);
    }
    drawNext(s.next);
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

  createSandTouch(attract, () => current === 'attract' && !modeSheet.open && !dailySheet.open && !settings.open);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) wm.stop();
    else if (current === 'attract') wm.start();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (settings.open || modeSheet.open || dailySheet.open) closeSheets();
    else if (current === 'hud') pause();
    else if (current === 'pause') resume();
  });

  show('attract');

  const api = {
    show,
    setHud,
    banner,
    results(r = {}) {
      lastScore = -1; lastChains = -1; lastCombo = -1;
      resTitle.textContent = r.mode || 'RUN';
      setBig(resScore, r.score);
      resChains.textContent = fmt(r.chains);
      resBest.textContent = fmt(Math.max(r.best || 0, r.score || 0));
      resRibbon.classList.toggle('hide', !r.isBest);
      resKicker.textContent = 'run over';
      show('results');
    },
    openModes, openSettings: () => settings.show(), openDaily,
    wmSeek: (ms) => wm.seek(ms),
    get screen() { return current; },
  };
  window.__ui = api;
  return api;
}
