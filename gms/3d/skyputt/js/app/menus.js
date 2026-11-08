// Title, course map and the settings sheet (DOM only).
import { ICONS, starRow } from '../game/hud.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Pickable themes (D7 ids under js/themes/). The swatch is a tiny CSS preview of each look.
export const THEME_LIST = [
  { id: 'sky', name: 'Sky Isles', swatch: 'linear-gradient(160deg, #7fb4ef 0%, #f6c98a 55%, #4fae4a 56%, #3a8a37 100%)', moon: '#f2c75c' },
  { id: 'spooky', name: 'Spooky Hollow', swatch: 'linear-gradient(160deg, #1b1233 0%, #4a2a6a 55%, #3e4a2c 56%, #262d1c 100%)', moon: '#ff8a2a' },
  { id: 'frost', name: 'Frost Fair', swatch: 'linear-gradient(160deg, #0b1440 0%, #2a4a9a 55%, #e8eefa 56%, #c4d2ee 100%)', moon: '#f4f2e6' },
  { id: 'candy', name: 'Candy Land', swatch: 'linear-gradient(160deg, #6fb0f2 0%, #ffc6e4 55%, #8fe0ae 56%, #ff9cc8 100%)', moon: '#ff4f9a' },
  { id: 'volcano', name: 'Volcano Forge', swatch: 'linear-gradient(160deg, #2a120c 0%, #ff7a34 55%, #6c7a4a 56%, #3a3634 100%)', moon: '#ff5a1a' },
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

// Course map: one tile per hole with stars / best, locked holes greyed out. Courses with `nines`
// (Sky Isles: front + back, story2) get a tab per nine; the map opens on the nine you're playing.
let mapNine = null;
// events2: `courses` (optional) adds a tab per extra course (Festival Isles); `onCourse(c)` switches to it.
export function showMap(store, course, { onHole, onFront, onNine, onBack, click, courses = null, onCourse = null }) {
  const el = $('#map');
  const open = store.unlockedCount(course);
  const nines = course.nines || [{ id: course.id, name: course.name, from: 0, to: course.holes.length }];
  const extra = (courses || []).filter(c => c !== course);
  // courses2: a course with `lockedBy: { hole }` stays locked until that hole (on another course) is finished
  const gated = c => !!c.lockedBy && !store.data.unlocked?.[c.lockedBy.hole];
  const gate = gated(course);
  let nine = nines.find(n => n.id === mapNine) || nines.filter(n => n.from < open).pop() || nines[0];
  const render = () => {
    const holes = course.holes.slice(nine.from, nine.to);
    const tot = holes.reduce((a, h) => a + (store.hole(h.id)?.stars ?? 0), 0);
    const locked = gate || nine.from >= open;
    el.innerHTML = `
    <div class="map-card">
      <div class="map-head">
        <button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div><div class="map-title">${esc(course.name)}</div><div class="map-sub">${esc(nine.name)} · ${starRow(1, 1)} ${tot}/${holes.length * 3} · ${ICONS.coin}${store.data.coins | 0}</div></div>
      </div>
      ${nines.length > 1 || extra.length ? `<div class="seg nines">${(courses || [course]).map(c => c !== course
        ? (c.nines || [{ id: c.id, name: c.name }]).map(n => `<button data-course="${c.id}" data-cnine="${n.id}">${esc(n.name)}${gated(c) ? ' ' + ICONS.lock : ''}</button>`).join('')
        : nines.map(n => `<button data-nine="${n.id}" class="${n === nine ? 'on' : ''}">${esc(n.name)}${gate || n.from >= open ? ' ' + ICONS.lock : ''}</button>`).join('')).join('')}</div>` : ''}
      <div class="map-grid">${holes.map((h, k) => {
        const i = nine.from + k, rec = store.hole(h.id), lk = (gate || i >= open) && !rec;   // events2: a hole already played (e.g. in an event) is open
        return `<button class="tile ${lk ? 'locked' : ''}" data-i="${i}" ${lk ? 'disabled' : ''} aria-label="Hole ${i + 1}: ${esc(h.name)}${lk ? ' (locked)' : ''}">
          <b class="num">${i + 1}</b>${lk ? `<span class="lk">${ICONS.lock}</span>` : starRow(rec?.stars ?? 0)}
          <span class="nm">${esc(h.name)}</span><span class="pr">Par ${h.par}${rec?.best ? ` · best ${rec.best}` : ''}</span></button>`;
      }).join('')}</div>
      ${locked ? `<div class="card-note small">${gate ? esc(course.lockedBy.note || 'Locked.') : `Finish hole ${nine.from} to open the ${esc(nine.name.toLowerCase())}.`}</div>` : ''}
      <button class="btn primary" data-a="front" ${locked ? 'disabled' : ''}>Play ${esc(nine.name.toLowerCase())}</button>
    </div>`;
  };
  render();
  el.hidden = false;
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    click?.();
    if (b.dataset.nine) { nine = nines.find(n => n.id === b.dataset.nine); mapNine = nine.id; render(); }
    else if (b.dataset.course) { mapNine = b.dataset.cnine; onCourse?.((courses || []).find(c => c.id === b.dataset.course)); }
    else if (b.dataset.a === 'back') { el.hidden = true; onBack(); }
    else if (b.dataset.a === 'front') { el.hidden = true; if (onNine && course.nines) onNine(nine); else onFront(); }
    else if (b.dataset.i) { el.hidden = true; onHole(+b.dataset.i); }
  };
}

// Ball hits modes (notes/ballhit.md): Battle = balls collide, knocked out of bounds = +1 to its owner; Classic = pass through.
export const ballHitHint = on => (on ? 'Battle: knock rivals’ balls, out of bounds = +1 to them.' : 'Classic: balls pass through each other.');

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
      <div class="row"><span>Ball hits</span><div class="seg" data-k="ballHit">
        <button data-v="1" class="${s.ballHit !== false ? 'on' : ''}">Battle</button><button data-v="0" class="${s.ballHit === false ? 'on' : ''}">Classic</button></div></div>
      <div class="card-note small" id="ballhit-hint">${ballHitHint(s.ballHit !== false)} Online, the room’s host picks this for everyone.</div>
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
      store.setSetting(k, k === 'lefty' || k === 'ballHit' ? b.dataset.v === '1' : b.dataset.v);
      apply(store.settings());
      if (k === 'ballHit') { const h = el.querySelector('#ballhit-hint'); if (h) h.textContent = `${ballHitHint(b.dataset.v === '1')} Online, the room’s host picks this for everyone.`; }
      if (k === 'quality') { const changed = b.dataset.v !== qualityAtLoad; note.hidden = !changed; reload.hidden = !changed; }
    };
  });
  reload.onclick = () => location.reload();
  el.querySelector('[data-a=close]').onclick = () => { click?.(); el.hidden = true; el.innerHTML = ''; onClose?.(); };
}
