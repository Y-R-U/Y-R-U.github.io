// Lane F shared helpers: CSS injection, timer stretch, fact maths, pointer drag. Used by F's formats only.
import { normalize } from '../core/fuzzy.js?v=1';
import { factText, shuffle } from './registry.js?v=1';

export const norm = normalize;

export function injectCSS(id, text) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
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
.f-stage{flex:1;display:flex;flex-direction:column;gap:12px;width:100%;max-width:640px;margin:0 auto;min-height:0}
.f-stage .q-prompt{font-size:clamp(20px,5.6vw,28px)}
.play.kids .f-stage .q-prompt{font-size:clamp(24px,6.8vw,34px)}
.f-rv-list{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--ink-2);margin:0;padding:0;list-style:none}
.f-rv-list b{color:var(--ink)}
@media (min-width:900px) and (min-height:560px){.f-stage{max-width:820px}.f-stage .q-prompt{font-size:30px}}
@media (orientation:landscape) and (max-height:520px){.f-stage{max-width:none}.f-stage .q-prompt{font-size:clamp(17px,3.2vw,24px)}}
`;
export const baseCSS = () => injectCSS('f-base-css', BASE_CSS);

// The player's answer time suits a one-tap question; slow formats stretch it (never in online rooms, which sync deadlines).
export function stretchTimer(api, el, factor) {
  setTimeout(() => {
    if (api.mode === 'online' || !el.isConnected) return;
    const ring = el.closest('.play')?.querySelector('.ring');
    if (!ring || ring.hidden) return;
    const lim = api.timer.limit;
    if (lim > 0 && api.timer.remaining() > 0) api.timer.start(Math.round(lim * factor));
  }, 0);
}

// Formats with their own clock (blitz60) hide the shared ring.
export function ownClock(api, el) {
  setTimeout(() => {
    try { api.timer.stop(); } catch (e) {}
    const ring = el.closest('.play')?.querySelector('.ring');
    if (ring) ring.hidden = true;
  }, 0);
}

// Call api.answer once at most.
export function once(api) {
  let done = false;
  const f = res => { if (done) return false; done = true; api.answer(res); return true; };
  f.done = () => done;
  return f;
}

export const packNoun = pack => String(pack.noun || pack.title || 'items').toLowerCase();

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

// Two values are far enough apart to compare fairly at this difficulty.
export function apart(meta, a, b, difficulty = 0) {
  if (a == null || b == null || a === b) return false;
  if (meta.type === 'year') {
    const gap = [8, 25, 8, 3][difficulty] ?? 8;
    return Math.abs(a - b) >= Math.max(gap, meta.minGap || 0);
  }
  const ratio = Math.max([1.5, 2.5, 1.5, 1.2][difficulty] ?? 1.5, meta.minRatio ? Math.min(meta.minRatio, 3) : 0);
  const hi = Math.max(Math.abs(a), Math.abs(b)), lo = Math.min(Math.abs(a), Math.abs(b));
  if (Math.sign(a) !== Math.sign(b)) return true;
  return lo === 0 ? hi > 0 : hi / lo >= ratio;
}

// Pick n candidates whose values are pairwise apart.
export function spreadSet(rng, cands, valueFn, meta, n, difficulty) {
  const out = [];
  for (const c of shuffle(rng, cands)) {
    const v = valueFn(c);
    if (v == null) continue;
    if (out.every(o => apart(meta, v, valueFn(o), difficulty))) out.push(c);
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
