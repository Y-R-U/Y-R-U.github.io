// Shared Learn widgets: progress ring, credits popup, sound button, read-aloud button, notice banner.
import { h, esc } from '../ui/kit.js?v=202610100510';
import { popup } from '../ui/popup.js?v=202610100510';
import { speak, canSpeak, stopSpeaking } from '../ui/speech.js?v=202610100510';
import { BUILD } from '../build.js?v=202610100510';
import { lazyImport } from '../ui/update.js?v=202610100510';
import { kidsOn } from './data.js?v=202610100510';

export function ring(pct, { size = 44, label = true } = {}) {
  const r = 16, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
  const el = h('span.l-ring', { style: { width: size + 'px', height: size + 'px' }, 'aria-label': `${p}% learned`, role: 'img' });
  el.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" class="bg"/><circle cx="20" cy="20" r="${r}" class="fg" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>` +
    (label ? `<b>${p >= 100 ? '★' : p}</b>` : '');
  if (p >= 100) el.classList.add('full');
  return el;
}

export function showCredits(list, title = 'Credits') {
  const rows = list.filter(Boolean).map(m => `<p class="credit"><b>${esc(m.credit || 'Unknown')}</b> · ${esc(m.license || '')}` +
    (m.page ? ` · <a href="${esc(m.page)}" target="_blank" rel="noopener">source</a>` : '') + '</p>');
  return popup({ title, body: rows.join('') || '<p>No media for this item.</p>' });
}
export const creditBtn = (list, title) => h('button.icon-btn.l-info', { type: 'button', 'aria-label': 'Media credits', onclick: e => { e.stopPropagation(); showCredits(list, title); } }, 'ⓘ');

export const notice = text => (text ? h('div.l-notice', { role: 'note' }, h('span', {}, '⚠️'), h('span', {}, text)) : null);

/* ---------- audio: AU's clip player when present, a plain <audio> element otherwise ---------- */
let clipP = null;
const clipMod = () => clipP || (clipP = lazyImport(new URL(`../audio/clip.js?v=${BUILD}`, import.meta.url).href).catch(() => (clipP = null)));
let now = null;   // { btn, handle }
let fallbackEl = null;

export function stopAudio() {
  const n = now; now = null;
  if (!n) return;
  try { n.handle?.stop?.(); } catch (e) {}
  setBtn(n.btn, false);
}

function setBtn(btn, on) {
  if (!btn) return;
  btn.classList.toggle('playing', on);
  const ico = btn.querySelector('.ico');
  if (ico) ico.textContent = on ? '❚❚' : '▶';
}

export async function playAudio(a, btn = null) {
  stopAudio();
  stopSpeaking();
  const me = { btn, handle: null };
  now = me;
  setBtn(btn, true);
  btn?.classList.add('loading');
  try {
    const clip = await clipMod();
    let handle;
    if (clip) handle = clip.isPiano(a) ? await clip.play(a, { start: 0, len: Math.min(a.dur || 30, 40) }) : await clip.stream(a, { start: a.minStart || 0 });
    else {
      fallbackEl = fallbackEl || new Audio();
      fallbackEl.src = a.src; fallbackEl.currentTime = a.start || 0;
      await fallbackEl.play();
      handle = { stop: () => fallbackEl.pause(), done: new Promise(r => fallbackEl.addEventListener('ended', r, { once: true })) };
    }
    me.handle = handle;
    if (now !== me) { handle?.stop?.(); return; }
    handle?.done?.then(() => { if (now === me) { now = null; setBtn(btn, false); } });
  } catch (e) {
    console.info('[learn] audio failed', e?.message);
    if (now === me) { now = null; setBtn(btn, false); }
    btn?.classList.add('broken');
  } finally { btn?.classList.remove('loading'); }
}

export function soundBtn(a, { label = 'Play sound', big = false, text = '' } = {}) {
  const btn = h('button.l-sound', { type: 'button', class: big ? 'big' : '', 'aria-label': label }, h('span.ico', {}, '▶'), text ? h('span.txt', {}, text) : null);
  btn.addEventListener('click', e => { e.stopPropagation(); if (now?.btn === btn) stopAudio(); else playAudio(a, btn); });
  return btn;
}

export function sayBtn(textFn, { label = 'Read aloud' } = {}) {
  if (!canSpeak()) return null;
  return h('button.icon-btn.l-say', { type: 'button', 'aria-label': label, onclick: e => { e.stopPropagation(); stopAudio(); say(typeof textFn === 'function' ? textFn() : textFn); } }, '🔊');
}
export const say = text => speak(text, { kids: kidsOn() });

export function emptyState(icon, title, text, action) {
  return h('div.l-empty', {}, h('div.e-ico', {}, icon), h('h3', {}, title), text ? h('p.muted', {}, text) : null, action || null);
}

export const put = (el, ...nodes) => el.append(...nodes.filter(Boolean));

// Wide screens get more room than the shell's 560px column.
export const WIDE = 'learn-wide';
