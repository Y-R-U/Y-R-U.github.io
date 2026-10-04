// Lane F shared helpers: CSS injection, timer stretch, fact maths, pointer drag. Used by F's formats only.
import { normalize } from '../core/fuzzy.js?v=1';
import { factText, shuffle } from './registry.js?v=1';
import { basePoints } from '../core/scoring.js?v=1';

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
.f-more{align-self:center}
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
