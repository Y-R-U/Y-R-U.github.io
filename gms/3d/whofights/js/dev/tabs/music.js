// Sound & music — DEV_CONTRACT §9. Four views over data/music.json plus the way into the sound
// studio. The heavy lifting is in js/dev/music/*; this file is the shell and the shared context.

import { registerTab } from '../hub.js';
import { ensureStyle, el } from '../music/ui.js';
import { Auditioner } from '../music/player.js';
import { library } from '../music/library.js';
import { sets } from '../music/sets.js';
import { assign } from '../music/assign.js';
import { generate } from '../music/generate.js';

// The tab can be mounted from index.html or from js/dev/selftest.html, so audio and the studio are
// addressed from the module's own URL rather than the page's.
const ROOT = new URL('../../../', import.meta.url).href;

const VIEWS = [
  ['library', 'Library', library],
  ['sets', 'Sets', sets],
  ['assign', 'Assign', assign],
  ['generate', 'Generate', generate],
];

registerTab({
  id: 'music',
  order: 40,

  async mount(root, ctx) {
    ensureStyle();
    const aud = new Auditioner(ROOT);
    const doc = await ctx.data.load('music');

    // The game's own bed would play underneath everything auditioned here. Park it and put it
    // back on the way out.
    const game = globalThis.__wfMusic || null;
    const parked = game?.state?.().setId || null;
    if (parked) game.stop(300);

    const C = {
      ctx, aud, base: ROOT,
      doc: () => ctx.data.get('music') || { version: 1, tracks: [], sets: [] },
      track: id => (C.doc().tracks || []).find(t => t.id === id) || null,
      mutate: (fn, label) => ctx.data.mutate('music', undefined, fn, { label }),
      repaint: () => paintView(),
      // A renamed set has to follow into every level that named it, or the default silently breaks.
      renamed: (from, to) => renameEverywhere(ctx, from, to),
    };

    root.innerHTML = '';
    const head = el('div', 'row');
    head.style.marginBottom = '0';
    const subs = el('div', 'mus-sub');
    const studio = el('button', null, '🎛 Sound studio ↗');
    studio.title = 'the SFX bench — synthesised sounds, triaged';
    studio.onclick = () => openStudio(ctx);
    head.append(subs, studio);

    const stats = el('div', 'dim');
    stats.style.fontSize = '11px';
    const top = el('div', 'mus-top');
    top.append(head, aud.bar(), stats);
    const body = el('div');
    root.append(top, body);
    // The set list sticks below the header, so it has to know how tall the header is.
    const measure = () => root.style.setProperty('--mus-top', `${top.offsetHeight}px`);
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(top);

    let view = localStorage.getItem('wf.dev.music.view') || 'library';
    let mounted = null;

    for (const [id, label] of VIEWS) {
      const b = el('button', null, label);
      b.dataset.view = id;
      b.onclick = () => { view = id; localStorage.setItem('wf.dev.music.view', id); paintView(); };
      subs.append(b);
    }

    function paintStats() {
      const d = C.doc();
      const songs = (d.tracks || []).filter(t => t.kind === 'song').length;
      const orphan = (d.sets || []).flatMap(s => (s.tracks || []).filter(t => !C.track(t)));
      stats.innerHTML = `${(d.tracks || []).length} tracks (${songs} sung) · ${(d.sets || []).length} sets` +
        (orphan.length ? ` · <span class="bad">${orphan.length} set entries name a track that is not in the library</span>` : '') +
        ` · <span class="dim">${ctx.data.source('music') || '—'}</span>`;
    }

    function paintView() {
      mounted?.dispose?.();
      mounted = null;
      body.innerHTML = '';
      for (const b of subs.children) b.className = b.dataset.view === view ? 'on' : '';
      paintStats();
      const found = VIEWS.find(v => v[0] === view) || VIEWS[0];
      mounted = found[2](body, C);
    }

    paintView();
    this._off = ctx.data.onChange('music', () => { paintStats(); mounted?.paint?.(); });
    this._stop = () => { ro?.disconnect(); mounted?.dispose?.(); aud.stop(); if (parked) game.playSet(parked); };
    if (!doc?.tracks?.length) ctx.toast('data/music.json has no tracks yet', 'warn');
  },

  unmount() { this._off?.(); this._stop?.(); },
});

// A separate page, so the way back travels in the URL. Opened in its own window the opener still
// has the hub up on this tab, which is the honest "back" — the studio closes itself and refocuses.
function openStudio(ctx) {
  const url = new URL('audio/studio/index.html', ROOT);
  url.searchParams.set('from', location.href);
  localStorage.setItem('wf.dev.tab', 'music');
  const w = window.open(url.toString(), 'wf-studio');
  if (!w) { ctx.toast('popup blocked — opening in this tab instead', 'warn'); location.href = url.toString(); }
}

async function renameEverywhere(ctx, from, to) {
  let hit = 0;
  for (const id of await ctx.data.levelIds()) {
    const doc = await ctx.data.load('levels', id);
    if (!doc) continue;
    const uses = doc.music === from || (doc.hotspots || []).some(h => (h.actions || []).some(a => a?.k === 'music' && a.set === from));
    if (!uses) continue;
    ctx.data.mutate('levels', id, d => {
      if (d.music === from) d.music = to;
      for (const h of d.hotspots || []) for (const a of h.actions || []) if (a?.k === 'music' && a.set === from) a.set = to;
    }, { label: 'set renamed' });
    hit++;
  }
  if (hit) ctx.toast(`renamed in ${hit} level${hit > 1 ? 's' : ''} too — they are unsaved`, 'warn');
}
