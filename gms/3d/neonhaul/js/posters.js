// S2-G — living posters. A handful of the figurative poster sites signage.js already places stop
// being one baked tile and become a screen that changes: stills held 6-9 s and ~5 s looping clips,
// crossfading into each other.
//
// ── the shape of it, and why ───────────────────────────────────────────────
//
// N CHANNELS, ONE TEXTURE. A channel is one cell of a 2x2 CanvasTexture atlas. Every living
// poster quad points its `iRegion` at a channel's cell, so the whole layer is ONE extra draw call
// and ONE texture whatever the poster count — the same trick signs.js's three hero panels use, and
// the only shape that fits render_city.js's global instanced fields. DECISIONS decision 9 said
// "no runtime generation, no separate texture, no additional draw calls"; Aaron's S2-G brief
// overrides that clause explicitly. The rest of decision 9 — punctuation not wallpaper, distance
// only, stylised and graphic — is untouched, and the tiles keep the baked 1:2 aspect so §3.10 #4's
// size ruler still reads.
//
// THE COST IS THE UPLOAD AND THE DECODE, NOT THE QUAD. A poster quad far behind you costs the same
// as any other instance in the field: nothing you can measure. What costs is (a) `<video>` decode,
// which is a hard hardware limit on a phone and is what stalls it, and (b) re-uploading the atlas.
// So both are gated on the same question — is any site of this channel within `RANGE` and inside
// the view cone. An idle channel pauses its video, stops its playlist clock, and does not draw, so
// the steady state with no poster in front of you is zero uploads and zero decodes.
//
// AND THE BYTES ARE NOT FETCHED EITHER. A channel's media has no `src` until the first time it
// goes live. `state().fetched` counts the elements that have one, so a gate can assert the zero at
// distance AND watch it become non-zero when you look — CLAUDE.md's warning about Chrome's memory
// cache is that a zero nobody can move is not a measurement.
//
// THE WORD IS DRAWN HERE, NOT BAKED. Flux cannot spell, and a picture without a strapline reads as
// a picture rather than as an advert — which is the whole point of the feature. Canvas text is
// also crisp at every distance, where a baked one would be mush at 192 px.

import * as THREE from 'three';

const SLOT_W = 192, SLOT_H = 384;          // the poster band is 1:2 (data/signs.json, kind poster)
const COLS = 2, ROWS = 2;

// A living poster is 24-40 m tall and DECISIONS decision 9 keeps it above 120 m, so it is only
// ever seen from 60 m and out. At 300 m a 30 m tile covers ~35 px of a 390 px phone frame; past
// RANGE it is not worth a decode. RANGE also sits inside the 512 m LOD0 radius the quads ramp out
// over, so a channel can never be live for a poster the shader has already faded away.
const RANGE = 380;
// The clip band is much tighter than the still band, because they buy different things. A cycling
// still at 300 m still registers as "that board changed" in peripheral vision and costs one upload
// every several seconds. A 5 s clip at 300 m is 15 screen px of motion for a decoder running flat
// out — measured off shots/s2g: at 240 m the tile is ~25 px. So stills cycle to RANGE and clips
// only inside VIDEO_RANGE.
const VIDEO_RANGE = 220;
const CONE_PAD = 0.35;                     // rad added to the frustum half-angle, so a poster does
                                           // not pop on at the edge of the screen
const FADE = 0.45;                         // s of crossfade between items
const VIDEO_HZ = 12;                       // composite/upload rate while a clip is on screen
const SCAN_HZ = 8;                         // how often the site sweep runs

// Used until (and if) data/posters.json arrives. The channel COUNT is fixed synchronously in the
// constructor and never depends on the fetch, because signage.js decides which quads are living
// while the near ring is still pre-warming — long before any fetch could have resolved. A failed
// fetch therefore degrades to a hazard-stripe placeholder on a real quad, not to a missing layer
// and not to a black rectangle on a facade.
const STUB_ACCENT = ['#ffb04a', '#35e6ff', '#9a6bff', '#ff2a9d'];

export class PosterBoard {
  constructor(base = './', { channels = 4, maxVideo = 2 } = {}) {
    this.base = base;
    this.maxVideo = maxVideo;
    this.enabled = channels > 0;
    this.nCh = Math.max(0, Math.min(COLS * ROWS, channels));

    this.canvas = document.createElement('canvas');
    this.canvas.width = SLOT_W * COLS;
    this.canvas.height = SLOT_H * ROWS;
    this.g = this.canvas.getContext('2d', { alpha: false });
    this.g.fillStyle = '#05060a';
    this.g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.flipY = false;                  // same convention as signs.js — the shader flips v
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;

    this.channels = [];
    this.ready = false;
    this.dirty = false;
    this.scanAcc = 0;
    this.uploads = 0;
    this.errors = 0;
    this.playing = 0;
    this._fwd = new THREE.Vector3();
    this._cam = new THREE.Vector3();

    for (let i = 0; i < this.nCh; i++) {
      this.channels.push(this.stub(i));
      this.placeholder(i);
    }
  }

  stub(i) {
    return { id: 'ch' + i, accent: STUB_ACCENT[i % STUB_ACCENT.length], items: [],
      i: 0, t: 0, fade: 0, snap: null, live: false, wasLive: false, everLive: false,
      vidAcc: 0, drew: false, dist: Infinity, pending: false, retry: 0, allDead: false };
  }

  // The cell for channel `i`, in the same top-left fraction form data/signs.json uses.
  region(i) {
    const c = i % COLS, r = (i / COLS) | 0;
    return { u: c / COLS, v: r / ROWS, w: 1 / COLS, h: 1 / ROWS, aspect: SLOT_W / SLOT_H,
      cls: 'poster', kind: 'poster', mode: 'hero' };
  }

  rect(i) {
    const c = i % COLS, r = (i / COLS) | 0;
    return { x: c * SLOT_W, y: r * SLOT_H, w: SLOT_W, h: SLOT_H };
  }

  async load() {
    if (!this.enabled) return false;
    let man;
    try {
      man = await fetch(this.base + 'data/posters.json').then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    } catch (e) {
      // No manifest is not an error the player should ever see. The quads keep their placeholder
      // and the layer simply never cycles.
      this.ready = false;
      return false;
    }
    const defs = man.channels.slice(0, this.nCh);
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const ch = this.channels[i];
      ch.id = d.id;
      ch.accent = d.accent || ch.accent;
      ch.allDead = false;
      ch.items = d.items.map(it => ({
        id: it.id, kind: it.kind, hold: +it.hold || 7, word: it.word || '',
        src: this.base + `assets/posters/${d.id}_${it.id}.`
          + (it.kind === 'video' ? 'mp4' : 'jpg'),
        el: null, ok: false, dead: false,
      }));
      this.placeholder(i);
    }
    this.ready = defs.length > 0 && this.channels.every(c => c.items.length > 0);
    this.dirty = true;
    return this.ready;
  }

  // ── the sweep ────────────────────────────────────────────────────────────
  //
  // `sites` is signage.js's flat list of live living-poster placements: world position and the
  // outward wall normal. A site qualifies if it is inside RANGE, its face is turned toward the
  // camera, and it is inside the view cone. A channel is live if any of its sites qualifies.
  scan(sites, camera) {
    for (const ch of this.channels) { ch.live = false; ch.dist = Infinity; }
    if (!sites.length || !camera) return;

    camera.getWorldPosition(this._cam);
    const m = camera.matrixWorld.elements;
    this._fwd.set(-m[8], -m[9], -m[10]).normalize();
    // The cone is the frustum's own diagonal half-angle plus a pad, so this cannot be tighter than
    // what is actually on screen at any aspect. camera.fov is VERTICAL.
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    const half = Math.atan(Math.hypot(tv, tv * (camera.aspect || 1)));
    const cosLim = Math.cos(Math.min(1.45, half + CONE_PAD));

    const cx = this._cam.x, cy = this._cam.y, cz = this._cam.z;
    const fx = this._fwd.x, fy = this._fwd.y, fz = this._fwd.z;
    for (const s of sites) {
      const ch = this.channels[s.ch];
      if (!ch) continue;
      const dx = cx - s.x, dy = cy - s.y, dz = cz - s.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > RANGE * RANGE) continue;
      // The poster is printed on the front of the quad only as far as this test is concerned: a
      // site whose wall faces away from you is one you are looking at the back of.
      if (s.nx * dx + s.nz * dz <= 0) continue;
      const d = Math.sqrt(d2) || 1e-6;
      if ((-dx * fx - dy * fy - dz * fz) / d < cosLim) continue;
      ch.live = true;
      if (d < ch.dist) ch.dist = d;
    }
  }

  update(dt, sites, camera) {
    if (!this.ready) return;
    this.scanAcc += dt;
    if (this.scanAcc >= 1 / SCAN_HZ || dt === 0) { this.scanAcc = 0; this.scan(sites, camera); }

    // The video budget is spent on the NEAREST live channels first. `maxVideo` is the cap the
    // frame budget was measured against; a channel over it skips past its clip to the next still
    // rather than queueing a decode it cannot afford.
    const order = this.channels.map((ch, i) => i)
      .filter(i => this.channels[i].live && this.channels[i].dist <= VIDEO_RANGE)
      .sort((a, b) => this.channels[a].dist - this.channels[b].dist);
    const budget = new Set(order.slice(0, this.maxVideo));

    this.playing = 0;
    for (let i = 0; i < this.channels.length; i++) this.step(i, dt, budget.has(i));

    if (this.dirty) { this.tex.needsUpdate = true; this.uploads++; this.dirty = false; }
  }

  step(i, dt, mayVideo) {
    const ch = this.channels[i];
    const item = ch.items[ch.i];

    if (!ch.live) {
      // Idle: the clock stops and the clip is paused where it stands. Nothing is drawn, so the
      // atlas keeps whatever this channel last showed and costs nothing to keep showing it.
      if (ch.wasLive && item && item.el && item.kind === 'video') item.el.pause();
      ch.wasLive = false;
      return;
    }
    if (!ch.everLive) { ch.everLive = true; this.arm(ch); ch.pending = true; ch.retry = 0; }
    ch.wasLive = true;
    // Every item 404'd — assets/posters/ is missing. The placeholder stands and nothing else
    // happens. Without this the "skip a dead item" path below advances every frame, and each
    // advance repaints and re-uploads: 67 uploads a second on a channel showing nothing.
    if (ch.allDead) return;

    // The first frame a channel goes live its media is still in flight, so the paint falls back to
    // the placeholder. Without this retry the channel would sit on that placeholder until its
    // playlist next advanced — up to 10 s of hazard stripes on a poster you are staring at.
    if (ch.pending) {
      ch.retry += dt;
      if (ch.retry >= 0.25) { ch.retry = 0; this.paint(i, ch.fade > 0 ? 1 - ch.fade / FADE : 1); }
    }

    // A clip we have no decode budget for is skipped, not stalled.
    if (item.kind === 'video' && !mayVideo) { this.advance(ch, i); return; }
    if (item.dead) { this.advance(ch, i); return; }

    ch.t += dt;
    // Playback starts when the clip becomes the current item, NOT when its crossfade ends —
    // otherwise the 0.45 s fade is a fade onto a <video> with readyState 0, which draws nothing
    // and shows the placeholder rising out of the previous poster.
    if (item.kind === 'video') {
      const el = item.el;
      if (el && el.paused) el.play()?.catch(() => { item.dead = true; });
      if (el && !el.paused) this.playing++;
    }
    // Every repaint is a full atlas upload, so both the crossfade and the clip are stepped at
    // VIDEO_HZ rather than once per rendered frame.
    ch.vidAcc += dt;
    const tick = ch.vidAcc >= 1 / VIDEO_HZ;
    if (ch.fade > 0) {
      ch.fade = Math.max(0, ch.fade - dt);
      if (tick || ch.fade === 0) { ch.vidAcc = 0; this.paint(i, 1 - ch.fade / FADE); }
    } else if (item.kind === 'video' && tick) {
      ch.vidAcc = 0;
      this.paint(i, 1);
    }
    if (ch.t >= item.hold) this.advance(ch, i);
  }

  advance(ch, i) {
    const cur = ch.items[ch.i];
    if (cur && cur.kind === 'video' && cur.el) cur.el.pause();
    // Snapshot what is on the atlas now, so the crossfade works identically whether the outgoing
    // item was a still or a video frame.
    const r = this.rect(i);
    if (!ch.snap) {
      ch.snap = document.createElement('canvas');
      ch.snap.width = SLOT_W; ch.snap.height = SLOT_H;
    }
    ch.snap.getContext('2d').drawImage(this.canvas, r.x, r.y, r.w, r.h, 0, 0, SLOT_W, SLOT_H);
    const n = ch.items.length;
    let found = -1;
    for (let k = 1; k <= n; k++) {
      const j = (ch.i + k) % n;
      if (!ch.items[j].dead) { found = j; break; }
    }
    if (found < 0) { ch.allDead = true; return; }
    ch.i = found;
    ch.t = 0; ch.fade = FADE; ch.vidAcc = 0; ch.retry = 0;
    const nx = ch.items[ch.i];
    if (nx.kind === 'video' && nx.el) { try { nx.el.currentTime = 0; } catch (e) { /* not seekable yet */ } }
    this.paint(i, 0);
  }

  // ── media, created the first time a channel is looked at ─────────────────

  arm(ch) {
    for (const it of ch.items) {
      if (it.el) continue;
      if (it.kind === 'video') {
        const v = document.createElement('video');
        // The same attribute set §9.6 pinned for the client portraits, and for the same reason:
        // without `playsinline` iOS takes a poster full-screen over the game.
        v.muted = true;
        v.setAttribute('muted', '');
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.setAttribute('loop', '');
        v.setAttribute('preload', 'auto');
        v.setAttribute('disablepictureinpicture', '');
        v.disablePictureInPicture = true;
        v.loop = true;
        v.crossOrigin = 'anonymous';
        v.addEventListener('error', () => { this.errors++; it.dead = true; }, { once: true });
        v.addEventListener('loadeddata', () => { it.ok = true; }, { once: true });
        v.src = it.src;
        it.el = v;
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';   // keeps the atlas canvas readable — the gate reads pixels
        img.decoding = 'async';
        img.addEventListener('error', () => { this.errors++; it.dead = true; }, { once: true });
        img.addEventListener('load', () => { it.ok = true; }, { once: true });
        img.src = it.src;
        it.el = img;
      }
    }
    // Every item dead (the whole directory is missing) leaves the placeholder up rather than a
    // black rectangle on a facade.
  }

  // ── drawing ──────────────────────────────────────────────────────────────

  paint(i, k) {
    const ch = this.channels[i];
    const it = ch.items[ch.i];
    const g = this.g, r = this.rect(i);
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    g.translate(r.x, r.y);

    if (k < 1 && ch.snap) { g.drawImage(ch.snap, 0, 0); }
    g.globalAlpha = k < 1 ? Math.max(0, Math.min(1, k)) : 1;
    const ok = this.drawItem(g, it);
    if (!ok) this.drawFallback(g, ch, it);
    this.drawWord(g, ch, it);
    g.globalAlpha = 1;
    g.restore();
    ch.drew = true;
    ch.pending = !ok && !it.dead;
    this.dirty = true;
    return ok;
  }

  // `cover`, not `fill`: the source is 1:2 and so is the slot, but a clip cropped to 320x640 from
  // a 384x640 plate is not, so the maths has to be real rather than assumed.
  drawItem(g, it) {
    const el = it.el;
    if (!el || it.dead) return false;
    const sw = el.naturalWidth || el.videoWidth || 0;
    const sh = el.naturalHeight || el.videoHeight || 0;
    if (!sw || !sh) return false;
    const s = Math.max(SLOT_W / sw, SLOT_H / sh);
    const w = sw * s, h = sh * s;
    try { g.drawImage(el, (SLOT_W - w) / 2, (SLOT_H - h) / 2, w, h); } catch (e) { return false; }
    return true;
  }

  drawFallback(g, ch, it) {
    g.fillStyle = '#07080d';
    g.fillRect(0, 0, SLOT_W, SLOT_H);
    g.strokeStyle = ch.accent;
    g.globalAlpha *= 0.22;
    g.lineWidth = 10;
    for (let x = -SLOT_H; x < SLOT_W; x += 34) {
      g.beginPath(); g.moveTo(x, SLOT_H); g.lineTo(x + SLOT_H, 0); g.stroke();
    }
    g.globalAlpha = Math.min(1, g.globalAlpha / 0.22);
  }

  drawWord(g, ch, it) {
    if (!it.word) return;
    const h = 46, y = SLOT_H - h - 14;
    g.globalAlpha *= 0.72;
    g.fillStyle = '#000';
    g.fillRect(0, y, SLOT_W, h);
    g.globalAlpha = Math.min(1, g.globalAlpha / 0.72);
    g.fillStyle = ch.accent;
    g.fillRect(0, y, SLOT_W, 3);
    let px = 30;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    for (let n = 0; n < 6; n++) {
      g.font = `700 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      if (g.measureText(it.word).width <= SLOT_W - 20) break;
      px -= 3;
    }
    g.fillStyle = ch.accent;
    g.fillText(it.word, SLOT_W / 2, y + h / 2 + 2);
  }

  placeholder(i) {
    const ch = this.channels[i];
    const g = this.g, r = this.rect(i);
    g.save();
    g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.translate(r.x, r.y);
    this.drawFallback(g, ch, null);
    g.restore();
    this.dirty = true;
  }

  // ── the gate surface ─────────────────────────────────────────────────────

  state() {
    let fetched = 0, videoSrc = 0, live = 0, dead = 0;
    for (const ch of this.channels) {
      if (ch.live) live++;
      for (const it of ch.items) {
        if (it.el && it.el.src) fetched++;
        if (it.el && it.kind === 'video' && it.el.src) videoSrc++;
        if (it.dead) dead++;
      }
    }
    return {
      enabled: this.enabled, ready: this.ready, channels: this.nCh,
      maxVideo: this.maxVideo, live, playing: this.playing,
      fetched, videoSrc, dead, errors: this.errors, uploads: this.uploads,
      range: RANGE, videoRange: VIDEO_RANGE,
      items: this.channels.map(ch => ({ id: ch.id, item: ch.items[ch.i]?.id || null,
        kind: ch.items[ch.i]?.kind || null, live: ch.live,
        dist: ch.dist === Infinity ? -1 : +ch.dist.toFixed(1) })),
    };
  }

  dispose() {
    for (const ch of this.channels) {
      for (const it of ch.items) {
        if (it.el && it.kind === 'video') { it.el.pause(); it.el.removeAttribute('src'); it.el.load(); }
        it.el = null;
      }
    }
    this.channels.length = 0;
    this.tex.dispose();
  }
}

export const POSTER_SLOT = { w: SLOT_W, h: SLOT_H, cols: COLS, rows: ROWS, range: RANGE, videoRange: VIDEO_RANGE };
