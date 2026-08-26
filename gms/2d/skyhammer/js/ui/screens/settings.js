// Settings. Reachable from the title, from pause, and from any topbar cog.
// Three columns, because this is a landscape game and a single 390 px scroller would bury
// the track list under the switches.

import { el, btn, topbar, popup, toast, refreshCoins } from '../widgets.js';
import { prefs, setPref, togglePref, buzz, setTrackOn, setTracksOn, onPrefsChange } from '../prefs.js';
import * as U from '../units.js';

const GROUPS = [
  { id: 'title', name: 'Menu' },
  { id: 'hangar', name: 'Hangar' },
  { id: 'battle', name: 'Battle' },
  { id: 'boss', name: 'Boss' },
  { id: 'sting', name: 'Stings', match: (t) => t.context === 'sting_win' || t.context === 'sting_lose' },
];

let preview = null;        // the one HTMLAudioElement; only ever one track at a time
let previewId = null;

// The game music we parked so the preview can be heard. Module scope, because unmount() runs
// after mount()'s closure is gone and leaving the game silent is the failure that would ship.
let audioRef = null;
let holding = false;
let heldTrack = null;
let unsubPrefs = null;

export function mount(root, ctx) {
  const from = (ctx.args && ctx.args.from) || 'title';
  const TRACKS = (ctx.data && ctx.data.MUSIC) || [];
  audioRef = ctx.audio || null;

  // The back arrow, the name/version and the DONE button all live in the top bar. There used to
  // be a 54 px footer carrying the last two, on a screen whose whole job is two scrolling lists
  // in 390 px of height.
  const bar = topbar(ctx, 'SETTINGS', { back: () => back(), cog: false, screen: 'settings' });
  bar.insertBefore(el('span.set-ver', {}, 'SKYHAMMER · build 0.1'), bar.querySelector('.spacer'));
  bar.appendChild(btn('go done', from === 'pause' ? 'BACK TO PAUSE' : 'DONE', () => back()));
  root.appendChild(bar);

  const list = el('div.set-col');
  const unitsCol = el('div.set-col.units');
  const musicPanel = el('section.set-music');
  root.appendChild(el('div.set-body', {}, list, unitsCol, musicPanel));

  /* ------------------------------------------------- column 1: audio & feel */

  list.appendChild(el('div.set-col-h', {}, 'Audio & feel'));
  list.appendChild(row('Music', 'The engine of the thing. Off is fine.', 'music', () => syncHead()));
  list.appendChild(row('Sound effects', 'Guns, blasts, the radio.', 'sfx'));
  list.appendChild(row('Haptics', 'A short buzz on hits and kills.', 'haptics'));
  list.appendChild(row('Reduce effects', 'Fewer particles and no bloom — for older phones.', 'reduceFx'));
  // Phones auto-request fullscreen; desktop is offered a button instead, so the copy has to be
  // honest about which behaviour this switch actually governs.
  list.appendChild(row('Fullscreen', 'Take fullscreen automatically on phones. Desktop is always asked, never grabbed.', 'fullscreen'));
  list.appendChild(row('Show frame rate', 'A small readout in the corner. Nobody has measured this game on a real phone yet.', 'fps'));

  list.appendChild(pickRow('Thumb layout', 'Which side the four weapon buttons sit on.',
    [{ id: 'left', label: 'LEFT' }, { id: 'right', label: 'RIGHT' }],
    () => prefs.hand, (id) => setPref('hand', id), true));

  /* ----------------------------------------------------------- column 2: units */

  unitsCol.appendChild(el('div.set-col-h', {}, 'Units'));

  unitsCol.appendChild(pickRow('Currency', 'The symbol on every price.',
    U.CURRENCIES, () => U.currency().id, (id) => { U.setCurrency(id); repaintSamples(); refreshCoins(ctx); }, true, true));

  unitsCol.appendChild(pickRow('Speed', 'Airspeed on the hangar stat lines.',
    U.SPEED_UNITS.map((u) => ({ id: u.id, label: u.label, name: u.name })),
    () => U.speedUnit().id, (id) => { U.setSpeedUnit(id); repaintSamples(); }, true));

  unitsCol.appendChild(pickRow('Altitude', 'The in-flight ribbon, and map distances.',
    U.ALT_UNITS.map((u) => ({ id: u.id, label: u.id === 'ft' ? 'FEET' : 'METRES', name: u.name })),
    () => U.altUnit().id, (id) => { U.setAltUnit(id); repaintSamples(); }, true));

  const sample = el('div.set-sample');
  unitsCol.appendChild(sample);
  repaintSamples();

  unitsCol.appendChild(el('div.set-row.pick', {},
    el('div.set-txt', {},
      el('div.set-name', {}, 'Save data'),
      el('div.set-sub', {}, 'Wipes money, aircraft, upgrades and every star.')
    ),
    btn('mini danger', 'WIPE', () => popup({
      title: 'Wipe everything?',
      body: 'Every mission, every aircraft, all your money. There is no undo.',
      actions: [
        { label: 'Cancel' },
        { label: 'Wipe it', kind: 'danger', act: () => {
          const d = ctx.save.data || ctx.save;
          for (const k of Object.keys(d)) delete d[k];
          d.settings = { ...prefs, musicOff: { ...prefs.musicOff } };
          if (ctx.save.flush) ctx.save.flush();
          toast('Save wiped', 'bad');
          ctx.go('title');
        } },
      ],
    }))
  ));

  /* ------------------------------------------------------- column 3: tracks
     Built ONCE. Every state change patches the nodes it actually changed, because a rebuild
     drops the scroller's scrollTop and the player loses their place halfway down 22 tracks. */

  const rowRefs = new Map();   // trackId -> { row, sw, play }
  const groupRefs = [];        // { ids, countEl, btn }
  let headSub = null;

  buildMusicPanel();

  // prefs.apply() calls audio.setMusic() on EVERY setPref, and that restarts the parked music
  // mid-preview. Subscribers fire straight after apply(), so re-asserting here kills it before
  // its fade-in is audible. Covers every setPref, not just the ones this screen makes.
  unsubPrefs = onPrefsChange(() => reassertHold());

  function buildMusicPanel() {
    musicPanel.textContent = '';
    rowRefs.clear();
    groupRefs.length = 0;

    headSub = el('div.set-sub');
    musicPanel.appendChild(el('div.music-head', {},
      el('div.music-h-t', {}, el('div.set-name', {}, 'Tracks'), headSub),
      TRACKS.length ? btn('mini ghost', 'ALL ON', () => bulk(TRACKS.map((t) => t.id), true)) : null,
      TRACKS.length ? btn('mini ghost', 'ALL OFF', () => bulk(TRACKS.map((t) => t.id), false)) : null
    ));

    const scroll = el('div.music-scroll');
    musicPanel.appendChild(scroll);

    if (!TRACKS.length) {
      scroll.appendChild(el('div.empty', {}, 'No music in the game yet. Tracks appear here as they land, and every one of them can be switched off.'));
      syncHead();
      return;
    }

    for (const gdef of GROUPS) {
      const rows = TRACKS.filter(gdef.match || ((t) => t.context === gdef.id));
      if (!rows.length) continue;
      const ids = rows.map((t) => t.id);
      const countEl = el('span.music-group-c');
      const toggle = btn('tiny ghost', 'OFF', () => bulk(ids, ids.every((id) => prefs.musicOff[id])));
      groupRefs.push({ ids, countEl, btn: toggle });
      scroll.appendChild(el('div.music-group', {},
        el('span.music-group-n', {}, gdef.name), countEl, el('div.spacer'), toggle));
      for (const t of rows) scroll.appendChild(trackRow(t));
    }
    syncGroups();
    syncHead();
  }

  /* ------------------------------------------------- targeted repaints, no rebuild */

  function syncTrack(id) {
    const r = rowRefs.get(id);
    if (!r) return;
    const on = !prefs.musicOff[id];
    r.sw.classList.toggle('on', on);
    r.row.classList.toggle('trow-off', !on);
  }

  function syncGroups() {
    for (const g of groupRefs) {
      const on = g.ids.filter((id) => !prefs.musicOff[id]).length;
      g.countEl.textContent = `${on}/${g.ids.length}`;
      g.btn.textContent = on ? 'OFF' : 'ON';
    }
  }

  function syncHead() {
    musicPanel.classList.toggle('off', !prefs.music);
    if (!headSub) return;
    const live = TRACKS.filter((t) => !prefs.musicOff[t.id]).length;
    headSub.textContent = TRACKS.length
      ? `${live} of ${TRACKS.length} on${prefs.music ? '' : ' · music is muted'}`
      : 'None yet';
  }

  function syncPreviewButtons() {
    for (const [id, r] of rowRefs) r.play.classList.toggle('playing', previewId === id);
  }

  function bulk(ids, on) {
    setTracksOn(ids, on);
    buzz(10);
    for (const id of ids) syncTrack(id);
    syncGroups();
    syncHead();
  }

  function trackRow(t) {
    const on = !prefs.musicOff[t.id];
    const sw = el('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-label': t.name }, el('span.knob'));
    sw.addEventListener('click', () => {
      setTrackOn(t.id, !!prefs.musicOff[t.id]);
      buzz(8);
      syncTrack(t.id);
      syncGroups();
      syncHead();
    });

    const play = btn('icon prev' + (previewId === t.id ? ' playing' : ''), '', () => togglePreview(t), { aria: 'Preview ' + t.name });
    const rowEl = el('div.trow' + (on ? '' : '.trow-off'), {},
      play,
      el('div.trow-t', {},
        el('div.trow-n', {}, t.name),
        el('div.trow-m', {}, meta(t))
      ),
      sw
    );
    rowRefs.set(t.id, { row: rowEl, sw, play });
    return rowEl;
  }

  function meta(t) {
    const bits = [];
    if (t.seconds) bits.push(U.secs(t.seconds));
    if (t.acts && t.acts.length) bits.push(t.acts.length > 1 ? `ACTS ${t.acts[0]}–${t.acts[t.acts.length - 1]}` : `ACT ${t.acts[0]}`);
    if (t.intensity) bits.push(String(t.intensity).toUpperCase());
    return bits.join(' · ') || '—';
  }

  function togglePreview(t) {
    if (previewId === t.id) { stopPreview(); syncPreviewButtons(); return; }
    stopPreviewEl();               // switching tracks: keep the game music parked, don't bounce it
    const src = trackUrl(t);
    if (!src) { releaseGameMusic(); toast('No file for that track', 'bad'); return; }
    holdGameMusic();
    preview = new Audio(src);
    preview.volume = 0.7;
    preview.addEventListener('ended', () => { stopPreview(); syncPreviewButtons(); });
    preview.addEventListener('error', () => { toast('Could not play that track', 'bad'); stopPreview(); syncPreviewButtons(); });
    previewId = t.id;
    const p = preview.play();
    if (p && p.catch) p.catch(() => { /* autoplay policy; the tap satisfies it in practice */ });
    syncPreviewButtons();
  }

  /* --------------------------------------------------------------- helpers */

  function repaintSamples() {
    sample.textContent = '';
    sample.appendChild(el('span.set-sample-t', {}, 'READS AS'));
    sample.appendChild(el('b.gold', {}, U.cash(4820)));
    sample.appendChild(el('b', {}, U.speedText(490)));
    sample.appendChild(el('b', {}, U.altText(2400) + ' ceiling'));
  }

  function back() {
    if (from === 'pause') ctx.go('pause', (ctx.args && ctx.args.pauseArgs) || {});
    else if (from && from !== 'settings') ctx.go(from);
    else ctx.go('title');
  }

  function row(name, sub, key, after) {
    const sw = el('button.switch' + (prefs[key] ? '.on' : ''), { type: 'button', role: 'switch', 'aria-label': name },
      el('span.knob'));
    sw.addEventListener('click', () => {
      const v = togglePref(key);
      sw.classList.toggle('on', v);
      buzz(10);
      after && after();
    });
    return el('div.set-row', {},
      el('div.set-txt', {}, el('div.set-name', {}, name), el('div.set-sub', {}, sub)),
      sw
    );
  }

  /** Stacked: the options sit under the label, because a 270 px column has no room beside it. */
  function pickRow(name, sub, options, get, set, stack, sym) {
    const holder = el('div.pickers');
    const paint = () => {
      holder.textContent = '';
      for (const o of options) {
        const b = btn('pickb' + (get() === o.id ? ' on' : '') + (sym ? ' sym' : ''), o.label, () => {
          set(o.id);
          paint();
          buzz(10);
        }, { aria: `${name}: ${o.name || o.label}` });
        holder.appendChild(b);
      }
    };
    paint();
    return el('div.set-row.pick' + (stack ? '.stack' : ''), {},
      el('div.set-txt', {}, el('div.set-name', {}, name), el('div.set-sub', {}, sub)),
      holder
    );
  }
}

export function unmount() {
  if (unsubPrefs) { try { unsubPrefs(); } catch { /* already gone */ } unsubPrefs = null; }
  stopPreview();          // also releases the game music — leaving mid-preview is the real case
}

/* ==================================================================== preview */

function stopPreviewEl() {
  if (preview) { try { preview.pause(); preview.src = ''; } catch { /* already gone */ } }
  preview = null;
  previewId = null;
}

function stopPreview() {
  stopPreviewEl();
  releaseGameMusic();
}

/**
 * Park whatever the game is playing so a preview is heard on its own.
 *
 * `audio.holdMusic(on)` is the method this wants and core/audio.js does not have yet (see
 * UI_NOTES). Until it exists: remember the live track, stop the decks, and start that track
 * again on release. `setMusic(false)` is deliberately NOT used — it is the Music *preference*,
 * and prefs.apply() writes it back on every setting change.
 */
function holdGameMusic() {
  if (holding) return;
  holding = true;
  const a = audioRef || {};
  if (typeof a.holdMusic === 'function') { a.holdMusic(true); return; }
  heldTrack = typeof a.nowPlaying === 'function' ? a.nowPlaying() : null;
  if (typeof a.stopMusic === 'function') a.stopMusic({ fade: 0.3 });
}

function releaseGameMusic() {
  if (!holding) return;
  holding = false;
  const a = audioRef || {};
  const t = heldTrack;
  heldTrack = null;
  try {
    if (typeof a.holdMusic === 'function') { a.holdMusic(false); return; }
    // A bare track id is a valid context to audio.music(), so the same track comes back.
    if (t && t.id && typeof a.music === 'function') a.music(t.id, { fade: 0.6 });
  } catch { /* audio is optional; the menu must still work without it */ }
}

/** prefs.apply() restarts the music behind our back on every setPref. Put it back down. */
function reassertHold() {
  if (!holding) return;
  const a = audioRef || {};
  try {
    if (typeof a.holdMusic === 'function') a.holdMusic(true);
    else if (typeof a.stopMusic === 'function') a.stopMusic({ fade: 0.12 });
  } catch { /* ditto */ }
}

/** The manifest stores a bare filename; resolve it against the repo, not the page. */
function trackUrl(t) {
  if (!t.file) return null;
  if (/^(https?:)?\/\//.test(t.file) || t.file.startsWith('/')) return t.file;
  const rel = t.file.includes('/') ? t.file : 'assets/audio/music/' + t.file;
  try { return new URL('../../../' + rel, import.meta.url).href; } catch { return rel; }
}

// Test seam. The preview element is never in the DOM, so a gate cannot see it any other way.
if (typeof window !== 'undefined') {
  window.__settings = {
    previewId: () => previewId,
    previewPlaying: () => !!(preview && !preview.paused && !preview.ended),
    holding: () => holding,
    held: () => heldTrack,
  };
}
