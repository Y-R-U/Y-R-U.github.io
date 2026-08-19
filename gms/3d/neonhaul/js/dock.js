// §7.3 — THE DOCKING PANEL. P7b, and §13 gives it a phase of its own because R4 predicts it is
// "the piece most likely to be rushed at the end of a long phase by an agent that has been doing
// shader work all day".
//
// It renders into `#dock`. `ui.js`'s `DockUI` keeps `#ui` and is the BOARD — the list of what is
// posted at this pad, the hold, and the shop. This file is the DEAL: one client, one job, the
// question §7.3 says the panel exists to answer. Splitting them that way is not a preference, it
// is what §9.1's loading discipline requires: *"the job board uses only the 96x96 thumb"* and
// *"the video's src is set only when the docking panel opens for that client"*, and §13 asserts
// **zero `.mp4` fetched when only the job board has been opened**. A board that inlined the video
// could not pass that gate no matter how it was written.
//
// **Never alert/confirm/prompt** (brief, hard rule). DECLINE just closes the panel.
//
// ── §9.6's element is a SPECIFICATION, not a suggestion ────────────────────
//
//   <video muted playsinline webkit-playsinline autoplay loop
//          preload="none" disablepictureinpicture poster="assets/clients/<id>.jpg">
//
// `playsinline` (and the legacy `webkit-playsinline`) is the difference between the centrepiece of
// this game's main UI and iOS Safari throwing the player into a native fullscreen video player.
// `muted` is the difference between autoplay and no playback at all. `loop` is the ENTIRE playback
// path: §9.2 bakes the ping-pong into the file with no duplicated frame at the turn or the wrap,
// so a JS seek loop can only make it worse and this file contains none.
//
// ── absence is a feature, not an error path ────────────────────────────────
// The whole of `assets/clients/` may be missing. Video 404 -> the still with a scanline shimmer
// and NO video element at all. Still 404 too -> a generated hex silhouette in the zone tint with
// the client's initials. Nothing here throws, nothing blocks on a fetch, and nothing writes to
// `__state.errors` — a portrait Aaron has not generated yet is not a §2.8 error.

import { ZONE_TYPES } from './config.js';
import { accentOf } from './utils.js';

const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};
const mmss = s => {
  const t = Math.max(0, Math.round(s));
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
};

// §7.3's mock carries a five-dot reliability meter. `clients.json` has no such field — this is
// DERIVED, deterministically, from the client id, and it is flagged as derived here so nobody
// later looks for the data that produced it. It is flavour: nothing in §7.4 reads it.
export function reliabilityOf(id) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < String(id).length; i++) {
    h ^= String(id).charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 2 + (h % 4);            // 2..5 of 5 — nobody on this board is a complete unknown
}

export function initialsOf(name) {
  return String(name || '?').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
}

// `paths` is `data/clients.json`'s own `paths` block, so the file locations live in the data file
// and not in js/ (obligation T8 again: nothing in js/ may contain the client count, and by the
// same argument nothing here should hard-code where the media lives).
const DEFAULT_PATHS = {
  still: 'assets/clients/{id}.jpg',
  thumb: 'assets/clients/{id}_thumb.jpg',
  video: 'assets/clients/{id}.mp4',
};

export function mediaFor(paths, id, kind) {
  const t = (paths && paths[kind]) || DEFAULT_PATHS[kind];
  return './' + String(t).replace('{id}', id).replace(/^\.\//, '');
}

export class ClientPanel {
  // `hooks`: { accept(job), haggle(job), decline() } — each returns the fresh board state, exactly
  // like DockUI's, so this file knows nothing about main.js.
  constructor(root, { paths = null, hooks = {} } = {}) {
    this.root = root;
    this.paths = paths || DEFAULT_PATHS;
    this.hooks = hooks;
    this.open = false;
    this.job = null;
    this.pad = null;
    this.state = null;
    this.note = '';
    this.opens = 0;
    // Measured, and read by the gate: how the media resolved on the last open.
    this.media = { mode: 'none', id: null, src: null, playing: false, rejected: 0, errors: 0 };
    this._video = null;
    this._blur = '';
    this.forcePlayReject = false;
  }

  // The §7.3 static-blur background. main.js hands us a data URL captured IN the rAF callback
  // right after `composer.render()` — reading the WebGL canvas outside it returns an empty buffer
  // unless `preserveDrawingBuffer` is on, which we do not want and do not need. There is no
  // `backdrop-filter` anywhere: on mobile Safari a blur over a live WebGL canvas is a full-res
  // readback on every composited frame, 5-15 ms of it, for an effect that is not even moving.
  setBackdrop(url) {
    this._blur = url || '';
    if (this.open) this._paintBackdrop();
    return !!this._blur;
  }

  _paintBackdrop() {
    const sheet = this.root.querySelector('.cp-sheet');
    if (sheet) sheet.style.backgroundImage = this._blur ? `url(${this._blur})` : 'none';
  }

  show(job, pad, state) {
    if (!job) return false;
    this.job = job; this.pad = pad; this.state = state; this.note = '';
    this.open = true;
    this.opens++;
    this.root.classList.remove('hidden');
    this.paint();
    return true;
  }

  hide() {
    this.open = false;
    this.job = null;
    this._teardownMedia();
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    return true;
  }

  refresh(job, state, note) {
    if (job) this.job = job;
    if (state) this.state = state;
    if (note !== undefined) this.note = note;
    if (this.open) this.paint();
  }

  // A repaint must not restart the clip — that is the one thing that would make the panel look
  // broken every time a button is pressed. The media block is built once per open and moved into
  // the new DOM.
  _act(fn) {
    const keep = this.root.querySelector('.cp-media');
    const r = fn ? fn(this.job) : null;
    if (r) {
      this.state = r.state || this.state;
      // The board rebuilds after every action; find this job again by id, or fall back to what we
      // already had so a withdrawn job still renders its own refusal note.
      if (r.jobs) this.job = r.jobs.find(j => j.id === (this.job && this.job.id)) || this.job;
      this.note = r.note === undefined ? '' : r.note;
    }
    if (this.open) this.paint(keep);
    return r;
  }

  paint(keepMedia = null) {
    const r = this.root, job = this.job, st = this.state;
    if (!job || !st) return;
    const type = (this.pad && this.pad.displayType) || (job.rush ? 'RUSH' : 'PICKUP');
    // §7.3: "exactly one saturated colour per panel — the zone's tint". The client's own
    // `tint_hex` is the neon the portrait was LIT with, so when we have it the UI and the image
    // agree; otherwise the zone colour.
    // S2-D: through `accentOf`. §7.3 asks for "exactly one saturated colour per panel", and HUB's
    // zone colour is 0xdfeaff — which is not saturated at all. Taken literally it painted the frame,
    // the kicker and the whole ACCEPT key white on the first board of the game. `accentOf` keeps
    // every genuinely saturated tint and substitutes the HUD cyan for the ones that are not.
    const zoneHex = accentOf((ZONE_TYPES[type] || ZONE_TYPES.PICKUP).color);
    const tint = job.client && job.client.tint ? accentOf(job.client.tint) : zoneHex;

    r.innerHTML = '';
    const sheet = el('div', 'cp-sheet');
    sheet.style.setProperty('--tint', tint);
    sheet.style.setProperty('--zone', zoneHex);

    // ── block 1: who is this ───────────────────────────────────────────────
    sheet.appendChild(el('div', 'cp-kicker', '▸ CLIENT'));
    const who = el('div', 'cp-who');
    who.appendChild(keepMedia || this._media(job));
    const id = el('div', 'cp-id');
    id.appendChild(el('div', 'cp-name', job.client ? job.client.name : 'UNLISTED'));
    id.appendChild(el('div', 'cp-fac', `${(ZONE_TYPES[type] || {}).glyph || '◇'} ${job.client ? job.client.faction : '—'}`));
    const rel = el('div', 'cp-rel');
    const n = job.client ? reliabilityOf(job.client.id) : 3;
    for (let i = 0; i < 5; i++) rel.appendChild(el('i', i < n ? 'on' : null));
    rel.appendChild(el('span', null, 'reliability'));
    id.appendChild(rel);
    if (job.client && job.client.line) id.appendChild(el('div', 'cp-line', `“${job.client.line}”`));
    who.appendChild(id);
    sheet.appendChild(who);

    // ── block 2: what do they want ─────────────────────────────────────────
    const deal = el('div', 'cp-deal');
    deal.appendChild(el('div', 'cp-parcel',
      `${job.parcel.icon} ${job.parcel.name} — ${job.parcel.slots} slot${job.parcel.slots > 1 ? 's' : ''}`));
    deal.appendChild(el('div', 'cp-dest', `→ ${job.dest.districtName} · ${job.dest.name}`));
    const chips = el('div', 'cp-chips');
    chips.appendChild(el('span', 'cp-chip', `${job.km.toFixed(1)} km`));
    chips.appendChild(el('span', 'cp-chip', `⏱ ${mmss(job.limit)}`));
    chips.appendChild(el('span', 'cp-chip risk r' + job.risk, `⚠ ${job.riskLabel}`));
    if (job.rush) chips.appendChild(el('span', 'cp-chip hot', `⚡ RUSH ×${job.rushMul}`));
    deal.appendChild(chips);

    // Every number here comes out of §7.4's formulas via missions.js. Nothing is computed twice.
    const pay = el('div', 'cp-pay');
    pay.appendChild(el('span', 'cp-payl', 'PAYMENT'));
    pay.appendChild(el('b', null, `${job.base + Math.round(job.base * job.haggleGain)} CRD`));
    deal.appendChild(pay);
    const b1 = el('div', 'cp-bonus');
    b1.appendChild(el('span', null, `+ under ${mmss(job.bonus.saturateAt)}`));
    b1.appendChild(el('b', null, `+${Math.round(job.bonus.maxTime * 100)}%`));
    deal.appendChild(b1);
    const b2 = el('div', 'cp-bonus');
    const held = st.cargo ? st.cargo.length : 0;
    b2.appendChild(el('span', null, `+ chain (${held} held)`));
    b2.appendChild(el('b', null, `+${Math.round(job.bonus.chain * 100 * Math.max(1, held))}%`));
    if (!held) b2.classList.add('dim');
    deal.appendChild(b2);
    sheet.appendChild(deal);

    if (this.note) sheet.appendChild(el('div', 'cp-note', this.note));

    // ── block 3: do I take it ──────────────────────────────────────────────
    const chk = this.hooks.canAccept ? this.hooks.canAccept(job) : { ok: true };
    const acc = el('button', 'cp-accept', chk.ok ? 'ACCEPT'
      : chk.why === 'slots' ? `NO ROOM (${chk.free}/${job.parcel.slots})`
        : chk.why === 'cooldown' ? 'CLIENT COOLED OFF' : 'LICENCE TOO LOW');
    acc.disabled = !chk.ok;
    acc.addEventListener('click', () => {
      const res = this._act(this.hooks.accept);
      if (res && res.accepted) this.hide();
    });
    sheet.appendChild(acc);

    const row = el('div', 'cp-acts');
    if (!job.haggled) {
      const hg = el('button', 'cp-ghost cp-haggle', 'HAGGLE');
      hg.addEventListener('click', () => this._act(this.hooks.haggle));
      row.appendChild(hg);
    }
    const dec = el('button', 'cp-ghost cp-decline', 'DECLINE');
    dec.addEventListener('click', () => { this.hooks.decline && this.hooks.decline(); this.hide(); });
    row.appendChild(dec);
    sheet.appendChild(row);

    r.appendChild(sheet);
    this._paintBackdrop();
  }

  // ── §9.6's media block ───────────────────────────────────────────────────
  _teardownMedia() {
    if (this._video) {
      this._video.pause();
      this._video.removeAttribute('src');
      this._video.load();                 // releases the connection; without it Safari keeps it
      this._video = null;
    }
  }

  _media(job) {
    this._teardownMedia();
    const id = job.client ? job.client.id : null;
    const frame = el('div', 'cp-media');
    this.media = { mode: 'none', id, src: null, playing: false, rejected: 0, errors: 0 };
    if (!id) { frame.appendChild(this._placeholder(job)); return frame; }

    const stillSrc = mediaFor(this.paths, id, 'still');
    const img = el('img', 'cp-still');
    img.loading = 'lazy';                 // §9.1
    img.alt = '';
    img.src = stillSrc;
    img.addEventListener('error', () => {
      this.media.errors++;
      if (img.parentNode) img.replaceWith(this._placeholder(job));
      this.media.mode = this.media.mode === 'video' ? 'video' : 'placeholder';
    }, { once: true });
    frame.appendChild(img);

    const v = document.createElement('video');
    // §9.6 verbatim. Attribute, not property, for the two that iOS reads off the markup.
    v.muted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('autoplay', '');
    v.setAttribute('loop', '');
    v.setAttribute('preload', 'none');
    v.setAttribute('disablepictureinpicture', '');
    v.disablePictureInPicture = true;
    v.autoplay = true;
    v.loop = true;
    v.preload = 'none';
    v.poster = stillSrc;
    v.className = 'cp-video';

    const fallBack = why => {
      this.media.mode = 'still';
      this.media.playing = false;
      frame.classList.add('shimmer');     // §9.6's "still with a subtle scanline shimmer"
      frame.dataset.fallback = why;
      if (v.parentNode) v.remove();       // "and no video element at all"
      this._video = null;
    };
    v.addEventListener('error', () => { this.media.errors++; fallBack('404'); }, { once: true });
    v.addEventListener('playing', () => { this.media.playing = true; this.media.mode = 'video'; }, { once: true });

    // §9.1: the src is set ONLY here, when the panel opens for this client. The job board never
    // touches it, which is what makes "zero .mp4 fetched from the board" true by construction
    // rather than by care.
    v.src = mediaFor(this.paths, id, 'video');
    this.media.src = v.src;
    this.media.mode = 'video';
    frame.appendChild(v);
    this._video = v;

    // §9.6: "the play call must be allowed to fail". A rejected promise is a NORMAL outcome — low
    // power mode, a browser that wants a gesture — and it must land on the still path without
    // throwing and without logging an error.
    //
    // `forcePlayReject` is a TEST SEAM and it is deliberately here rather than in the gate: it
    // replaces the element's own `play` so the rejection travels the identical path a real
    // NotAllowedError does. A gate that instead called `fallBack()` directly would be testing its
    // own call, not the game's handling of it.
    if (this.forcePlayReject) {
      v.play = () => Promise.reject(new DOMException('forced play() rejection', 'NotAllowedError'));
    }
    const p = v.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => { this.media.rejected++; fallBack('play-rejected'); });
    }

    frame.appendChild(el('div', 'cp-scan'));   // §7.3's scanline overlay
    frame.appendChild(el('div', 'cp-wipe'));   // §7.3's 2 s "signal acquired" wipe
    return frame;
  }

  // Still and video both gone: a hex silhouette in the tint with the client's initials. Generated,
  // never a broken-image icon.
  _placeholder(job) {
    const d = el('div', 'cp-ph', initialsOf(job.client ? job.client.name : '?'));
    this.media.mode = 'placeholder';
    return d;
  }

  stateOf() {
    return {
      open: this.open,
      job: this.job ? this.job.id : null,
      client: this.job && this.job.client ? this.job.client.id : null,
      opens: this.opens,
      media: { ...this.media },
      backdrop: !!this._blur,
      // The four §9.6 attributes, read off the LIVE element rather than off what we meant to set.
      attrs: this._video ? {
        muted: this._video.hasAttribute('muted') && this._video.muted,
        playsinline: this._video.hasAttribute('playsinline'),
        webkitPlaysinline: this._video.hasAttribute('webkit-playsinline'),
        loop: this._video.loop,
        preload: this._video.getAttribute('preload'),
        disablePiP: this._video.hasAttribute('disablepictureinpicture'),
        paused: this._video.paused,
        fullscreen: this._video.webkitDisplayingFullscreen === undefined
          ? false : !!this._video.webkitDisplayingFullscreen,
        poster: !!this._video.poster,
      } : null,
    };
  }
}

// §7.3's static-blur background, exactly as the section specifies it: `drawImage` the live WebGL
// canvas into a small offscreen canvas IN the same rAF callback, immediately after
// `composer.render()`, and let the upscale be the blur. One CSS `filter: blur()` on top smooths
// the last of it for nothing. No `backdrop-filter`, no readback per frame — the city behind the
// panel is static anyway, because the craft is docked.
export function captureBlur(sourceCanvas, w = 96, h = 208) {
  if (!sourceCanvas) return '';
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(sourceCanvas, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  } catch (e) {
    return '';                              // a tainted or zero-size canvas is not an error here
  }
}
