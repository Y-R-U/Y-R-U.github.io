// Lane F shared helpers: CSS injection, timer stretch, fact maths, pointer drag. Used by F's formats only.
import { normalize } from '../core/fuzzy.js?v=202610100431';
import { factText, shuffle, lcLabel } from './registry.js?v=202610100431';
import { basePoints } from '../core/scoring.js?v=202610100431';
import { reducedMotion } from '../ui/fx.js?v=202610100431';

export const norm = normalize;

export function injectCSS(id, text) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  if (id !== 'f-base-css') baseCSS();   // base first, so per-format rules win the cascade
  const s = document.createElement('style');
  s.id = id;
  s.textContent = text;
  document.head.append(s);
}

const BASE_CSS = `
.f-sub{text-align:center;color:var(--ink-2);font-weight:800;font-size:15px;margin-top:-6px}
.f-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.f-row .btn{flex:1 1 0;min-width:120px;max-width:260px}
.f-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border:2px solid var(--ink);border-radius:999px;background:#fff;font-weight:900;font-size:14px}
.f-pop{animation:f-pop .45s cubic-bezier(.2,1.8,.4,1)}
@keyframes f-pop{40%{transform:scale(1.08)}}
.f-shake{animation:shake .4s}
.f-stage{flex:1;display:flex;flex-direction:column;justify-content:safe center;gap:12px;width:100%;max-width:640px;margin:0 auto;min-height:0}
.f-stage .q-prompt{font-size:clamp(20px,5.6vw,28px)}
.play.kids .f-stage .q-prompt{font-size:clamp(24px,6.8vw,34px)}
.f-more{align-self:center}
.f-rv-list{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--ink-2);margin:0;padding:0;list-style:none}
.f-rv-list b{color:var(--ink)}
@media (min-width:900px) and (min-height:560px){.f-stage{max-width:820px}.f-stage .q-prompt{font-size:30px}}
@media (orientation:landscape) and (max-height:520px){.f-stage{max-width:none}.f-stage .q-prompt{font-size:clamp(17px,3.2vw,24px)}}
`;
export function baseCSS() { injectCSS('f-base-css', BASE_CSS); }

// Slow formats declare `timeScale` on the format object; the runner stretches the answer time (never online).

// Formats with their own clock (blitz60, manualTimer) never start the shared timer; the runner keeps its ring hidden.
export function ownClock(api) {
  try { api.timer.stop(); } catch (e) {}
}

// Call api.answer once at most.
export function once(api) {
  let done = false;
  const f = res => { if (done) return false; done = true; api.answer(res); return true; };
  f.done = () => done;
  return f;
}

// Plural, for "Which of these … is made up?" (pack.noun is singular: type's "Name the …").
export const packNoun = pack => lcLabel(pack.nounPlural || pack.title || 'items');

export function fmtFact(meta, v) {
  if (meta?.type === 'year') return v < 0 ? `${-v} BC` : String(v);
  return factText(meta, v);
}

// Numeric facts worth asking about (no ranks, no tiny integer codes).
export function numericKeys(pack, { min = 4 } = {}) {
  const out = [];
  for (const [key, m] of Object.entries(pack.factsMeta || {})) {
    if (m.type !== 'num' && m.type !== 'year') continue;
    if (m.lowerIsBetter || m.noCompare) continue;
    const n = (pack.items || []).filter(it => isFinite(Number(it.facts?.[key])) && it.facts?.[key] !== null && it.facts?.[key] !== '').length;
    if (n >= min) out.push(key);
  }
  return out;
}
export const numOf = (it, key) => { const v = it?.facts?.[key]; return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); };

// Two values are far enough apart to compare fairly at this difficulty. range = rangeOf(pack, key) switches
// to an absolute gap when the scale has zero or negatives (temperatures), where ratios mean nothing.
export function apart(meta, a, b, difficulty = 0, range = null) {
  if (a == null || b == null || a === b) return false;
  if (meta.type === 'year') {
    const gap = [5, 20, 6, 2][difficulty] ?? 5;
    return Math.abs(a - b) >= Math.max(gap, meta.minGap || 0);
  }
  if (range && range.min <= 0) return Math.abs(a - b) >= ([0.08, 0.2, 0.08, 0.03][difficulty] ?? 0.08) * (range.max - range.min);
  if (a <= 0 || b <= 0) return false;
  const ratio = Math.max([1.5, 2.5, 1.5, 1.2][difficulty] ?? 1.5, meta.minRatio ? Math.min(meta.minRatio, 3) : 0);
  return Math.max(a, b) / Math.min(a, b) >= ratio;
}

export function rangeOf(pack, key) {
  let min = Infinity, max = -Infinity;
  for (const it of pack.items || []) { const v = numOf(it, key); if (v != null) { if (v < min) min = v; if (v > max) max = v; } }
  return { min, max };
}

// Pick n candidates whose values are pairwise apart.
export function spreadSet(rng, cands, valueFn, meta, n, difficulty, range = null) {
  const out = [];
  for (const c of shuffle(rng, cands)) {
    const v = valueFn(c);
    if (v == null) continue;
    if (out.every(o => apart(meta, v, valueFn(o), difficulty, range))) out.push(c);
    if (out.length >= n) return out;
  }
  return null;
}

// Item names must be unique in a question.
export function uniqueByName(list, nameFn = c => c.item.name) {
  const seen = new Set();
  return list.filter(c => { const k = norm(nameFn(c)); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

// Pointer drag with a small threshold, so taps still work. Returns an off() function.
export function drag(el, { onStart, onMove, onEnd, onTap, threshold = 6 } = {}) {
  let s = null;
  const down = e => {
    if (e.button > 0) return;
    s = { x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
  };
  const move = e => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.moving && Math.hypot(dx, dy) > threshold) {
      s.moving = true;
      try { el.setPointerCapture(e.pointerId); } catch (er) {}
      onStart && onStart(e, s);
    }
    if (s.moving) { e.preventDefault(); onMove && onMove(e, dx, dy, s); }
  };
  const up = e => {
    if (!s || e.pointerId !== s.id) return;
    const was = s.moving;
    const st = s;
    s = null;
    if (was) onEnd && onEnd(e, e.clientX - st.x, e.clientY - st.y, st);
    else if (e.type === 'pointerup') onTap && onTap(e);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}

export const plural = (n, w, ws = w + 's') => `${n} ${n === 1 ? w : ws}`;
export const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Progressive stages (CONTRACT "Progressive stages"). The runner owns the stage, the Show-more/vote button and the
// points multiplier. Until the runner ships that, this falls back to a local button and applies the multiplier here.
export const stageMultiplier = (stage, n) => (n > 1 ? 1 - 0.6 * Math.min(stage, n - 1) / (n - 1) : 1);
export function stages(api, q, el, onChange, { label = 'Show more 👀', kidsEvery = 4000 } = {}) {
  const n = q.stages || 1;
  const native = typeof api.onStage === 'function';
  let stage = native ? (api.stage || 0) : 0;
  let locked = false, btn = null, timer = null;
  const set = s => {
    stage = Math.max(0, Math.min(n - 1, s));
    if (btn) btn.disabled = locked || stage >= n - 1;
    onChange(stage);
  };
  let unsub = null;
  if (native) {
    const r = api.onStage(s => set(s));
    if (typeof r === 'function') unsub = r;
  } else {
    btn = typeof document !== 'undefined' ? document.createElement('button') : null;
    if (btn) {
      btn.type = 'button';
      btn.className = 'btn small sun f-more';
      btn.textContent = label;
      btn.addEventListener('click', () => more());
    }
    if (api.kids) timer = setInterval(() => { if (!locked && stage < n - 1) set(stage + 1); }, kidsEvery);
  }
  function more() {
    if (locked || stage >= n - 1) return;
    if (typeof api.requestMore === 'function') api.requestMore(); else set(stage + 1);
  }
  set(stage);
  return {
    get stage() { return stage; }, n, button: btn, native, more,
    lock() { locked = true; if (btn) btn.disabled = true; clearInterval(timer); },
    // extra fields for api.answer: the runner scores stages itself when it supports them
    points() {
      if (native) return {};
      let rem = 0, lim = 0;
      try { rem = api.timer.remaining(); lim = api.timer.limit; } catch (e) {}
      return { points: Math.round(basePoints({ timed: rem > 0 && lim > 0, remaining: rem, limit: lim }) * stageMultiplier(stage, n)) };
    },
    destroy() { clearInterval(timer); unsub && unsub(); },
  };
}

// Pictures usable in a question: never a disputed flag (C2: facts.flagDisputed).
export const hasImg = it => !!it?.media?.img?.length && !it.facts?.flagDisputed;

/* Timed zoom-out: the one shared behaviour for every picture question that offers Zoom (Aaron 2026-10-08).
   Starts zoomed in on the probable subject and eases out to the whole picture at `fullAt`% of the real answer
   window (the runner's ring: timer setting, timeScale, the online deadline after any ready hold); no timer = 10 s.
   No stages, no votes: answering earlier scores more through the normal speed points. Reduced motion = whole picture. */
export const ZOOM_FULL_AT = [50, 65, 80, 90];
export const fullAtOf = v => (ZOOM_FULL_AT.includes(+v) ? +v : 80);
const ZOOM_UNTIMED_MS = 10000;
// starting zoom by difficulty: the visible window is never smaller than ~30% of the picture
export const zoomStart = (q, kids) => (kids ? 2.2 : [2.4, 2.9, 3.3][Math.max(0, Math.min(2, (q?.difficulty || 2) - 1))]);
// the shared format option; showIf/favIf tie it to whatever turns zoom on in that format
export const zoomOption = when => ({
  key: 'fullAt', label: 'Zoom: whole picture at', help: 'Share of the answer time spent zooming out; the rest shows the full image',
  type: 'choice', values: ZOOM_FULL_AT, labels: ZOOM_FULL_AT.map(p => `${p}%`), default: 80, showIf: when,
  favLabels: ZOOM_FULL_AT.map(p => `full at ${p}%`), favIf: when,
});

const ZOOM_CSS = `
.zx-on{position:relative;overflow:hidden}
.zx-on>img.zx{transform-origin:0 0;will-change:transform}
.zx-on>img.zx.zx-wait{opacity:0}
.zx-on.zx-done>img.zx{transition:transform .6s cubic-bezier(.3,1,.4,1),opacity .2s}
.zx-tag{position:absolute;left:10px;top:10px;z-index:2;padding:3px 10px;background:rgba(255,255,255,.9);border:2px solid var(--ink);border-radius:999px;font-weight:900;font-size:13px;color:var(--ink)}
.zx-done .zx-tag{display:none}
`;

function corsImg(src) {
  return new Promise(res => {
    const a = new Image();
    a.crossOrigin = 'anonymous';
    a.referrerPolicy = 'no-referrer';
    a.onload = () => res(a);
    a.onerror = () => res(null);
    a.src = src;
  });
}

// Where the subject probably is: detail (edges) and colour unlike the border, weighted to the centre. The window
// (wx × wy, fractions of the picture) holding the most of it wins. Null when the pixels can't be read (no CORS).
export function focusOf(img, wx, wy) {
  const G = 40;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return null;
  const gw = iw >= ih ? G : Math.max(8, Math.round(G * iw / ih)), gh = iw >= ih ? Math.max(8, Math.round(G * ih / iw)) : G;
  let px;
  try {
    const c = document.createElement('canvas');
    c.width = gw; c.height = gh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, gw, gh);
    px = g.getImageData(0, 0, gw, gh).data;
  } catch (e) { return null; }
  const at = (x, y) => (y * gw + x) * 4;
  let br = 0, bg = 0, bb = 0, bn = 0;
  const edgePx = (x, y) => { const i = at(x, y); br += px[i]; bg += px[i + 1]; bb += px[i + 2]; bn++; };
  for (let x = 0; x < gw; x++) { edgePx(x, 0); edgePx(x, gh - 1); }
  for (let y = 1; y < gh - 1; y++) { edgePx(0, y); edgePx(gw - 1, y); }
  br /= bn; bg /= bn; bb /= bn;
  const lum = i => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
  const W1 = gw + 1, S = new Float64Array(W1 * (gh + 1));   // integral image of the score
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = at(x, y);
      const edge = Math.abs(lum(i) - lum(at(Math.min(gw - 1, x + 1), y))) + Math.abs(lum(i) - lum(at(x, Math.min(gh - 1, y + 1))));
      const dc = Math.hypot(px[i] - br, px[i + 1] - bg, px[i + 2] - bb);
      const dx = (x + 0.5) / gw - 0.5, dy = (y + 0.5) / gh - 0.5;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * 0.22 * 0.22));
      S[(y + 1) * W1 + x + 1] = (edge + dc) * w + S[y * W1 + x + 1] + S[(y + 1) * W1 + x] - S[y * W1 + x];
    }
  }
  const ww = Math.max(1, Math.min(gw, Math.round(wx * gw))), wh = Math.max(1, Math.min(gh, Math.round(wy * gh)));
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y + wh <= gh; y++) {
    for (let x = 0; x + ww <= gw; x++) {
      const s = S[(y + wh) * W1 + x + ww] - S[y * W1 + x + ww] - S[(y + wh) * W1 + x] + S[y * W1 + x];
      if (s > best) { best = s; bx = x; by = y; }
    }
  }
  if (best <= 0) return null;
  return [(bx + ww / 2) / gw, (by + wh / 2) / gh];
}

// Translation for zoom z in a W×H box with the contain-fitted picture rect r and focus f (0–1 of the picture) at
// progress e (0 start → 1 whole): the focus starts centred and drifts home as z eases to 1; no needless gaps.
export function zoomTransform(z, W, H, r, f, e) {
  const Fx = r.x + f[0] * r.w, Fy = r.y + f[1] * r.h;
  const fit = (T, lo, size, box) => {
    const a = T + z * lo, b = T + z * (lo + size);
    if (z * size >= box) return a > 0 ? T - a : b < box ? T + (box - b) : T;
    return a < 0 ? T - a : b > box ? T - (b - box) : T;
  };
  return { tx: fit(W / 2 + (Fx - W / 2) * e - z * Fx, r.x, r.w, W), ty: fit(H / 2 + (Fy - H / 2) * e - z * Fy, r.y, r.h, H) };
}

// Progress 0→1 of the zoom against the runner's real answer window.
export function zoomProgress(api, fullAt, t0) {
  const until = fullAtOf(fullAt) / 100;
  const tm = api.timer;
  if (api.timed && tm) {
    const full = tm.full || tm.limit || 0;
    if (!tm.running || !full) return 0;
    return Math.max(0, Math.min(1, (1 - tm.remaining() / full) / until));
  }
  return Math.min(1, (performance.now() - t0) / (ZOOM_UNTIMED_MS * until));
}

// box: positioned container; im: an <img> filling it with object-fit: contain. Returns { finish(), stop(), focus, active }.
export function timedZoom(box, im, src, api, { z0 = 2.9, fullAt = 80, tag = '' } = {}) {
  const ctl = { active: false, focus: null, finish() {}, stop() {} };
  if (typeof document === 'undefined' || reducedMotion()) return ctl;
  injectCSS('f-zoom-css', ZOOM_CSS);
  ctl.active = true;
  box.classList.add('zx-on');
  im.classList.add('zx', 'zx-wait');
  if (tag) box.append(Object.assign(document.createElement('span'), { className: 'zx-tag', textContent: tag }));
  let ended = false, raf = 0, nat = null, t0 = performance.now(), focusDone = false;
  const show = () => { focusDone = true; im.classList.remove('zx-wait'); };
  const paint = () => {
    if (!nat || !focusDone) return;
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    const e = zoomProgress(api, fullAt, t0);
    const k = Math.min(W / nat[0], H / nat[1]);
    const r = { w: nat[0] * k, h: nat[1] * k };
    r.x = (W - r.w) / 2; r.y = (H - r.h) / 2;
    const z = Math.pow(z0, 1 - e);
    const { tx, ty } = zoomTransform(z, W, H, r, ctl.focus || [0.5, 0.5], e);
    im.style.transform = e >= 1 ? 'none' : `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${z.toFixed(4)})`;
  };
  const frame = () => { raf = 0; if (ended) return; paint(); raf = requestAnimationFrame(frame); };
  const onNat = () => { if (im.naturalWidth) nat = [im.naturalWidth, im.naturalHeight]; };
  if (im.complete) onNat(); else im.addEventListener('load', onNat, { once: true });
  // the subject finder needs readable pixels: a CORS copy (the shown <img> stays a plain load). Hidden until then
  // (≤ 700 ms) so the picture never jumps from the centre to the subject.
  const wait = setTimeout(show, 700);
  corsImg(src).then(a => {
    if (a && !ended) {
      const W = box.clientWidth || 1, H = box.clientHeight || 1;
      const k = Math.min(W / a.naturalWidth, H / a.naturalHeight);
      ctl.focus = focusOf(a, Math.min(1, W / (z0 * a.naturalWidth * k)), Math.min(1, H / (z0 * a.naturalHeight * k)));
    }
    clearTimeout(wait); show();
  });
  raf = requestAnimationFrame(frame);
  ctl.stop = () => { ended = true; clearTimeout(wait); cancelAnimationFrame(raf); };
  ctl.finish = () => { ctl.stop(); show(); box.classList.add('zx-done'); im.style.transform = 'none'; };
  return ctl;
}
