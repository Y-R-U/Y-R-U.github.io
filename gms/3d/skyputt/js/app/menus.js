// Title, course map and the settings sheet (DOM only).
import { ICONS, starRow } from '../game/hud.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Pickable themes (D7 ids under js/themes/). The swatch is a tiny CSS preview of each look.
export const THEME_LIST = [
  { id: 'sky', name: 'Sky Isles', swatch: 'linear-gradient(160deg, #7fb4ef 0%, #f6c98a 55%, #4fae4a 56%, #3a8a37 100%)', moon: '#f2c75c' },
  { id: 'spooky', name: 'Spooky Hollow', swatch: 'linear-gradient(160deg, #1b1233 0%, #4a2a6a 55%, #3e4a2c 56%, #262d1c 100%)', moon: '#ff8a2a' },
];

export function renderTitle(store, course, themeId, onTheme) {
  const tot = course.holes.reduce((a, h) => a + (store.hole(h.id)?.stars ?? 0), 0);
  $('#t-progress').innerHTML = `<span>${starRow(1, 1)} ${tot}/${course.holes.length * 3}</span><span>${ICONS.coin}${store.data.coins | 0}</span>`;
  const el = $('#t-themes');
  if (!el) return;
  el.innerHTML = THEME_LIST.map(t => `<button class="theme-chip ${t.id === themeId ? 'on' : ''}" data-id="${t.id}" aria-pressed="${t.id === themeId}">
    <span class="sw" style="background:${t.swatch}"><i style="background:${t.moon}"></i></span><span>${esc(t.name)}</span></button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (b) onTheme?.(b.dataset.id); };
}

// Course map: one tile per hole with stars / best, locked holes greyed out.
export function showMap(store, course, { onHole, onFront, onBack, click }) {
  const el = $('#map');
  const open = store.unlockedCount(course);
  const tot = course.holes.reduce((a, h) => a + (store.hole(h.id)?.stars ?? 0), 0);
  el.innerHTML = `
    <div class="map-card">
      <div class="map-head">
        <button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div><div class="map-title">${esc(course.name)}</div><div class="map-sub">Front nine · ${starRow(1, 1)} ${tot}/${course.holes.length * 3} · ${ICONS.coin}${store.data.coins | 0}</div></div>
      </div>
      <div class="map-grid">${course.holes.map((h, i) => {
        const rec = store.hole(h.id), locked = i >= open;
        return `<button class="tile ${locked ? 'locked' : ''}" data-i="${i}" ${locked ? 'disabled' : ''} aria-label="Hole ${i + 1}: ${esc(h.name)}${locked ? ' (locked)' : ''}">
          <b class="num">${i + 1}</b>${locked ? `<span class="lk">${ICONS.lock}</span>` : starRow(rec?.stars ?? 0)}
          <span class="nm">${esc(h.name)}</span><span class="pr">Par ${h.par}${rec?.best ? ` · best ${rec.best}` : ''}</span></button>`;
      }).join('')}</div>
      <button class="btn primary" data-a="front">Play front nine</button>
    </div>`;
  el.hidden = false;
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    click?.();
    if (b.dataset.a === 'back') { el.hidden = true; onBack(); }
    else if (b.dataset.a === 'front') { el.hidden = true; onFront(); }
    else if (b.dataset.i) { el.hidden = true; onHole(+b.dataset.i); }
  };
}

// Settings sheet. apply(settings) is called on every change (audio volumes, camera, lefty).
export function openSettings(store, { apply, onClose, click }) {
  const el = $('#sheet');
  const s = store.settings();
  const qualityAtLoad = document.body.dataset.quality;
  el.innerHTML = `
    <div class="card sheet">
      <div class="card-title">Settings</div>
      <label class="row"><span>Sound</span><input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
      <label class="row"><span>Music</span><input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"></label>
      <label class="row"><span>Camera speed</span><input type="range" min="0.4" max="2" step="0.1" data-k="camSens" value="${s.camSens}"></label>
      <div class="row"><span>Quality</span><div class="seg" data-k="quality">
        <button data-v="low" class="${s.quality === 'low' ? 'on' : ''}">Low</button><button data-v="high" class="${s.quality !== 'low' ? 'on' : ''}">High</button></div></div>
      <div class="row"><span>Left-handed HUD</span><div class="seg" data-k="lefty">
        <button data-v="0" class="${!s.lefty ? 'on' : ''}">Off</button><button data-v="1" class="${s.lefty ? 'on' : ''}">On</button></div></div>
      <div class="card-note" id="sheet-note" hidden>Quality changes apply after a reload.</div>
      <button class="btn" data-a="reload" hidden>Reload now</button>
      <button class="btn primary" data-a="close">Done</button>
    </div>`;
  el.hidden = false;
  const note = el.querySelector('#sheet-note'), reload = el.querySelector('[data-a=reload]');
  el.querySelectorAll('input[type=range]').forEach(inp => {
    inp.oninput = () => { store.setSetting(inp.dataset.k, +inp.value); apply(store.settings()); };
  });
  el.querySelectorAll('.seg').forEach(seg => {
    seg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      click?.();
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      const k = seg.dataset.k;
      store.setSetting(k, k === 'lefty' ? b.dataset.v === '1' : b.dataset.v);
      apply(store.settings());
      if (k === 'quality') { const changed = b.dataset.v !== qualityAtLoad; note.hidden = !changed; reload.hidden = !changed; }
    };
  });
  reload.onclick = () => location.reload();
  el.querySelector('[data-a=close]').onclick = () => { click?.(); el.hidden = true; el.innerHTML = ''; onClose?.(); };
}
