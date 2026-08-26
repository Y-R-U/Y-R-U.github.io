// Settings. Reachable from the title, from pause, and from any topbar cog.
// Two columns, because this is a landscape game and a single 390 px scroller would bury
// the track list under the switches.

import { el, btn, topbar, popup, toast, refreshCoins } from '../widgets.js';
import { prefs, setPref, togglePref, buzz, setTrackOn, setTracksOn } from '../prefs.js';
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

export function mount(root, ctx) {
  const from = (ctx.args && ctx.args.from) || 'title';
  const TRACKS = (ctx.data && ctx.data.MUSIC) || [];

  root.appendChild(topbar(ctx, 'SETTINGS', { back: () => back(), cog: false, screen: 'settings' }));

  const list = el('div.set-col');
  const unitsCol = el('div.set-col.units');
  const musicPanel = el('section.set-music');
  root.appendChild(el('div.set-body', {}, list, unitsCol, musicPanel));

  /* ------------------------------------------------- column 1: audio & feel */

  list.appendChild(el('div.set-col-h', {}, 'Audio & feel'));
  list.appendChild(row('Music', 'The engine of the thing. Off is fine.', 'music', () => paintMusicPanel()));
  list.appendChild(row('Sound effects', 'Guns, blasts, the radio.', 'sfx'));
  list.appendChild(row('Haptics', 'A short buzz on hits and kills.', 'haptics'));
  list.appendChild(row('Reduce effects', 'Fewer particles and no bloom — for older phones.', 'reduceFx'));

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

  /* ------------------------------------------------------- column 2: tracks */

  paintMusicPanel();

  function paintMusicPanel() {
    musicPanel.textContent = '';
    musicPanel.classList.toggle('off', !prefs.music);

    const live = TRACKS.filter((t) => !prefs.musicOff[t.id]).length;
    const head = el('div.music-head', {},
      el('div.music-h-t', {},
        el('div.set-name', {}, 'Tracks'),
        el('div.set-sub', {}, TRACKS.length
          ? `${live} of ${TRACKS.length} on${prefs.music ? '' : ' · music is muted'}`
          : 'None yet')
      ),
      TRACKS.length ? btn('mini ghost', 'ALL ON', () => bulk(TRACKS.map((t) => t.id), true)) : null,
      TRACKS.length ? btn('mini ghost', 'ALL OFF', () => bulk(TRACKS.map((t) => t.id), false)) : null
    );
    musicPanel.appendChild(head);

    const scroll = el('div.music-scroll');
    musicPanel.appendChild(scroll);

    if (!TRACKS.length) {
      scroll.appendChild(el('div.empty', {}, 'No music in the game yet. Tracks appear here as they land, and every one of them can be switched off.'));
      return;
    }

    for (const gdef of GROUPS) {
      const rows = TRACKS.filter(gdef.match || ((t) => t.context === gdef.id));
      if (!rows.length) continue;
      const on = rows.filter((t) => !prefs.musicOff[t.id]).length;
      scroll.appendChild(el('div.music-group', {},
        el('span.music-group-n', {}, gdef.name),
        el('span.music-group-c', {}, `${on}/${rows.length}`),
        el('div.spacer'),
        btn('tiny ghost', on ? 'OFF' : 'ON', () => bulk(rows.map((t) => t.id), on === 0))
      ));
      for (const t of rows) scroll.appendChild(trackRow(t));
    }
  }

  function bulk(ids, on) {
    setTracksOn(ids, on);
    buzz(10);
    paintMusicPanel();
  }

  function trackRow(t) {
    const on = !prefs.musicOff[t.id];
    const sw = el('button.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-label': t.name }, el('span.knob'));
    sw.addEventListener('click', () => {
      const next = !!prefs.musicOff[t.id];
      setTrackOn(t.id, next);
      sw.classList.toggle('on', next);
      buzz(8);
      paintMusicPanel();
    });

    const play = btn('icon prev' + (previewId === t.id ? ' playing' : ''), '', () => togglePreview(t), { aria: 'Preview ' + t.name });

    return el('div.trow' + (on ? '' : '.trow-off'), {},
      play,
      el('div.trow-t', {},
        el('div.trow-n', {}, t.name),
        el('div.trow-m', {}, meta(t))
      ),
      sw
    );
  }

  function meta(t) {
    const bits = [];
    if (t.seconds) bits.push(U.secs(t.seconds));
    if (t.acts && t.acts.length) bits.push(t.acts.length > 1 ? `ACTS ${t.acts[0]}–${t.acts[t.acts.length - 1]}` : `ACT ${t.acts[0]}`);
    if (t.intensity) bits.push(String(t.intensity).toUpperCase());
    return bits.join(' · ') || '—';
  }

  function togglePreview(t) {
    if (previewId === t.id) { stopPreview(); paintMusicPanel(); return; }
    stopPreview();
    const src = trackUrl(t);
    if (!src) { toast('No file for that track', 'bad'); return; }
    preview = new Audio(src);
    preview.volume = 0.7;
    preview.addEventListener('ended', () => { stopPreview(); paintMusicPanel(); });
    preview.addEventListener('error', () => { toast('Could not play that track', 'bad'); stopPreview(); paintMusicPanel(); });
    previewId = t.id;
    const p = preview.play();
    if (p && p.catch) p.catch(() => { /* autoplay policy; the tap satisfies it in practice */ });
    paintMusicPanel();
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

  root.appendChild(el('footer.set-foot', {},
    el('span.set-ver', {}, 'SKYHAMMER · build 0.1'),
    el('div.spacer'),
    btn('go', from === 'pause' ? 'BACK TO PAUSE' : 'DONE', () => back())
  ));
}

export function unmount() { stopPreview(); }

function stopPreview() {
  if (preview) { try { preview.pause(); preview.src = ''; } catch { /* already gone */ } }
  preview = null;
  previewId = null;
}

/** The manifest stores a bare filename; resolve it against the repo, not the page. */
function trackUrl(t) {
  if (!t.file) return null;
  if (/^(https?:)?\/\//.test(t.file) || t.file.startsWith('/')) return t.file;
  const rel = t.file.includes('/') ? t.file : 'assets/audio/music/' + t.file;
  try { return new URL('../../../' + rel, import.meta.url).href; } catch { return rel; }
}
