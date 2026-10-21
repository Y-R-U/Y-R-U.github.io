const CSS_URL = new URL('./story.css', import.meta.url).href;

export function ensureStoryCss() {
  if (typeof document === 'undefined' || document.querySelector('link[data-krz-story]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS_URL; l.dataset.krzStory = '1';
  document.head.appendChild(l);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (typeof window !== 'undefined' && 'ontouchstart' in window);

// Story progress (intro seen, missions completed). Storage may be blocked: everything degrades to "not seen".
const KEY = 'krayzee.story';
export function loadProgress() {
  try { return { introSeen: false, missions: {}, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { return { introSeen: false, missions: {} }; }
}
export function saveProgress(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* blocked */ } }
