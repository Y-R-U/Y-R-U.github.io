// HUDPOLISH E3: one-time hints for the two controls a new player would not guess: the F-35's context button (VERTICAL
// TAKEOFF / HOVER / LAND HERE share the LAND slot) and the MAP chip. A small bubble beside the control, never a modal and
// never in the way (no buttons, pointer-events none, never over a control). Using the control ends it; otherwise it goes
// after SECS. Each one shows once per device (localStorage `krayzee.hints`), and a control used before its hint showed
// never gets one.
import { rects } from './place.js';

const KEY = 'krayzee.hints';
const SECS = 9, SETTLE = 0.8, GAP = 4;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

const HINTS = [
  { id: 'ctx', sel: '.krz-land[data-ctx]', text: () => '<b>One button for the F-35.</b> It changes as you fly: <b>VERTICAL TAKEOFF</b>, <b>HOVER</b>, <b>LAND HERE</b>.' },
  { id: 'map', sel: '.krz-map-chip', text: () => '<b>MAP:</b> the whole Kingdom. Pick an airfield and fly there.' },
];
// a hint never sits on these (controls, the HUD, and the other message cards)
const AVOID = ['.krz-stick-zone', '.krz-thr-col', '.krz-pad', '.krz-r-btn', '.krz-land', '.krz-finish', '.krz-gbtn', '.krz-top-l', '.krz-top-r', '.krz-warp',
  '.krz-r-tower', '#krz-hud .krz-hud-strip', '#krz-hud .krz-ap', '.krz-score', '.krz-chips', '.krz-map-chip', '.krz-r-pill', '.krz-st-coach', '.krz-prompt',
  '.krz-coach-bub', '.krz-r-panel'];
const shown = (e) => e && !e.hidden && !e.closest('[hidden]') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';

export function createHints({ force = false } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-hint';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.innerHTML = '<div class="krz-hint-ring"></div><div class="krz-hint-bub"></div>';
  document.body.append(el);
  const ring = el.firstChild, bub = el.lastChild;
  const S = { done: force ? {} : read(), cur: null, t: 0, seen: 0, cand: null, placeT: 0, gap: 0, log: [] };

  const mark = (id, why) => { S.done[id] = why; write(S.done); S.log.push({ id, why }); };
  function end(why) {
    if (!S.cur) return;
    mark(S.cur.id, why);
    S.cur = null; S.gap = GAP;
    el.classList.remove('in');
    setTimeout(() => { if (!S.cur) el.hidden = true; }, 250);
  }
  // use = the hint's job is done (or never needed): a tap on the control itself, before or while it shows
  addEventListener('click', (e) => {
    for (const h of HINTS) if (!S.done[h.id] || S.done[h.id] === 'shown') {
      if (!e.target.closest?.(h.sel)) continue;
      if (S.cur?.id === h.id) end('used'); else if (!S.done[h.id]) mark(h.id, 'used-first');
    }
  }, { capture: true, passive: true });

  function place(target) {
    const r = target.getBoundingClientRect(), W = innerWidth, H = innerHeight, pad = 8, gap = 12;
    Object.assign(ring.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    const bw = bub.offsetWidth || 220, bh = bub.offsetHeight || 60, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const clampX = (x) => Math.max(pad, Math.min(W - bw - pad, x)), clampY = (y) => Math.max(pad, Math.min(H - bh - pad, y));
    // above / below (centred, then flush with either edge; stepping away from a crowded band), then either side
    const slots = [];
    for (let k = 0; k <= 14; k++) {
      for (const dir of ['down', 'up']) {
        const y = dir === 'down' ? r.top - gap - bh - k * 8 : r.bottom + gap + k * 8;
        for (const x of [cx - bw / 2, r.left, r.right - bw]) slots.push({ dir: k ? '' : dir, x: clampX(x), y });   // stepped away: no arrow (it would point at whatever is between)
      }
      if (k === 0) slots.push({ dir: 'right', x: r.left - gap - bw, y: clampY(cy - bh / 2) }, { dir: 'left', x: r.right + gap, y: clampY(cy - bh / 2) });
    }
    const fits = slots.filter((q) => q.x >= pad - 0.5 && q.y >= pad - 0.5 && q.x + bw <= W - pad + 0.5 && q.y + bh <= H - pad + 0.5);
    const hits = (s, list) => list.some((o) => s.x < o.right + 4 && o.left - 4 < s.x + bw && s.y < o.bottom + 4 && o.top - 4 < s.y + bh);
    const all = rects(AVOID).filter((o) => !(o.left === r.left && o.top === r.top)), controls = all.filter((o) => !/pill|coach|prompt|panel/.test(o.sel));
    // stay put while the spot is still clear (a radio card coming and going must not make it hop)
    const key = `${Math.round(r.left)}|${Math.round(r.top)}|${bw}|${bh}`, keep = S.slot?.key === key && !hits(S.slot, all) ? S.slot : null;
    const s = keep || fits.find((q) => !hits(q, all)) || fits.find((q) => !hits(q, controls));
    if (!s) return false;
    S.slot = { ...s, key };
    bub.dataset.dir = s.dir;
    bub.style.left = `${Math.round(s.x)}px`; bub.style.top = `${Math.round(s.y)}px`;
    if (s.dir === 'up' || s.dir === 'down') bub.style.setProperty('--ax', `${Math.round(Math.max(14, Math.min(bw - 14, cx - s.x)))}px`);
    else bub.style.setProperty('--ay', `${Math.round(Math.max(12, Math.min(bh - 12, cy - s.y)))}px`);
    return true;
  }

  return {
    el,
    // w = { blocked } (a coach mark, a radio sheet, the takeoff coach, pause): hold, don't burn the hint's time
    update(dt, { blocked = false } = {}) {
      if (S.cur) {
        const target = document.querySelector(S.cur.sel);
        // the control went within 3 s (the F-35 rolled past VERTICAL TAKEOFF): not seen properly, so it may come back next time
        if (!shown(target)) { if (S.t < 3) { const id = S.cur.id; end('gone'); delete S.done[id]; write(S.done); return; } return end('gone'); }
        if (blocked) { el.hidden = true; return; }
        el.hidden = false;
        if ((S.t += dt) > SECS) return end('timeout');
        if ((S.placeT -= dt) <= 0) { S.placeT = 0.25; if (!place(target)) el.hidden = true; }
        return;
      }
      if (blocked || (S.gap -= dt) > 0) { S.cand = null; return; }
      const h = HINTS.find((x) => !S.done[x.id] && shown(document.querySelector(x.sel)));
      if (!h) { S.cand = null; return; }
      if (S.cand !== h.id) { S.cand = h.id; S.seen = 0; }
      if ((S.seen += dt) < SETTLE) return;
      S.cur = h; S.t = 0; S.placeT = 0; S.slot = null;
      bub.innerHTML = h.text();
      el.dataset.hint = h.id;
      el.hidden = false;
      if (!place(document.querySelector(h.sel))) { el.hidden = true; S.cur = null; S.seen = SETTLE - 0.5; return; }   // no clear slot yet: look again in 0.5 s
      mark(h.id, 'shown');
      requestAnimationFrame(() => el.classList.add('in'));
    },
    hide() { if (S.cur) { S.cur = null; el.classList.remove('in'); el.hidden = true; } S.cand = null; },
    get active() { return S.cur?.id || null; },
    get state() { return { active: S.cur?.id || null, done: { ...S.done }, log: S.log.slice() }; },
  };
}
