export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function injectCss() {
  if (document.getElementById('kz-ui-css')) return;
  const link = document.createElement('link');
  link.id = 'kz-ui-css';
  link.rel = 'stylesheet';
  link.href = new URL('../../css/ui.css', import.meta.url).href;
  document.head.append(link);
}

let soundSink = null;
export function setSoundSink(fn) { soundSink = fn; }
export function sound(kind) { try { soundSink?.(kind); } catch (e) { /* audio is optional */ } }

export function onTap(node, fn, kind = 'click') {
  node.addEventListener('click', (e) => { e.stopPropagation(); if (kind) sound(kind); fn(e); });
}

let toastTimer = 0;
export function toast(root, title, text, ms = 2800) {
  let t = root.querySelector('.kz-toast');
  if (!t) { t = el('<div class="kz-toast" role="status"></div>'); root.append(t); }
  t.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

export const ICON = {
  lock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>',
  crown: '<svg viewBox="0 0 20 20"><path d="M3 15h14l1-9-4.5 3.5L10 4 6.5 9.5 2 6z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 20 20"><path d="M7 5l8 5-8 5z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 20 20"><rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor"/></svg>',
  mute: '<svg viewBox="0 0 20 20"><path d="M4 8h3l4-3v10l-4-3H4z" fill="currentColor" opacity=".55"/><path d="M14 8l3 4M17 8l-3 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  story: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 5c3-1 5-1 8 1 3-2 5-2 8-1v14c-3-1-5-1-8 1-3-2-5-2-8-1z"/><path d="M12 6v14"/></svg>',
  online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/></svg>',
  hangar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 20V10c0-3 4-6 9-6s9 3 9 6v10"/><path d="M3 20h18M7 20v-6h10v6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/></svg>',
  plane: '<svg viewBox="0 0 32 32"><path d="M3 15.2l9.5-.4L18 4.5h3l-3 10.1 7.5-.3 2.6-3.3H30l-1.4 5 1.4 5h-1.9l-2.6-3.3-7.5-.3 3 10.1h-3l-5.5-10.3-9.5-.4z" fill="#fff6d6" stroke="#5a3a06" stroke-width=".8" stroke-linejoin="round"/></svg>',
};

export const CREST = `<svg class="kz-crest" viewBox="0 0 240 250" aria-hidden="true">
  <defs>
    <linearGradient id="kzg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#f2cf74"/><stop offset="1" stop-color="#a8741c"/></linearGradient>
    <linearGradient id="kzs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4304a"/><stop offset="1" stop-color="#7d0c22"/></linearGradient>
    <linearGradient id="kzb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25407f"/><stop offset="1" stop-color="#101d45"/></linearGradient>
  </defs>
  <g fill="url(#kzg)" stroke="#5a3a06" stroke-width="1.6" stroke-linejoin="round">
    <path d="M70 118c-18-4-38-2-60 8 14-14 31-22 52-24-16-2-30 0-44 6 13-12 30-18 50-17-11-4-23-4-35 0 14-10 30-12 47-8z"/>
    <path d="M170 118c18-4 38-2 60 8-14-14-31-22-52-24 16-2 30 0 44 6-13-12-30-18-50-17 11-4 23-4 35 0-14-10-30-12-47-8z"/>
  </g>
  <path d="M120 66l50 14v60c0 34-22 58-50 72-28-14-50-38-50-72V80z" fill="url(#kzg)" stroke="#5a3a06" stroke-width="2"/>
  <path d="M120 75l42 12v53c0 29-18 49-42 62-24-13-42-33-42-62V87z" fill="url(#kzb)"/>
  <path d="M120 75l42 12v53c0 29-18 49-42 62z" fill="url(#kzs)"/>
  <g transform="translate(120 140) rotate(-24)">
    <path d="M-30 0l14-1 4-16h5l-3 16 14-1 4-6h4l-2 8 2 8h-4l-4-6-14-1 3 16h-5l-4-16-14-1z" fill="#fff6d6" stroke="#2a1a02" stroke-width="1.2" stroke-linejoin="round"/>
  </g>
  <path d="M84 186c12 10 24 16 36 20 12-4 24-10 36-20" fill="none" stroke="#f7dc8f" stroke-width="1.4" opacity=".6"/>
  <g stroke="#5a3a06" stroke-width="1.6" stroke-linejoin="round">
    <path d="M82 58l-6-30 20 14 12-24 12 22 12-22 12 24 20-14-6 30z" fill="url(#kzg)"/>
    <rect x="80" y="56" width="80" height="11" rx="3" fill="url(#kzg)"/>
  </g>
  <g fill="#c8243f" stroke="#5a1020" stroke-width="1"><circle cx="100" cy="61.5" r="3.4"/><circle cx="140" cy="61.5" r="3.4"/></g>
  <circle cx="120" cy="61.5" r="4.4" fill="#2f5bd0" stroke="#122a6a"/>
  <g fill="#fff6d6"><circle cx="76" cy="27" r="4"/><circle cx="108" cy="17" r="4"/><circle cx="132" cy="17" r="4"/><circle cx="164" cy="27" r="4"/><circle cx="120" cy="38" r="3.6"/></g>
  <path d="M50 214c22 8 44 12 70 12s48-4 70-12l-6 18c-20 6-42 9-64 9s-44-3-64-9z" fill="url(#kzs)" stroke="#5a1020" stroke-width="1.4"/>
  <text x="120" y="233" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="13" fill="#fff3c4" letter-spacing="2">EST. MCMXXII</text>
</svg>`;
