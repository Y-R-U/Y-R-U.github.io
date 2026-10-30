import { h, esc, icon, segmented, bindSegmented, toggle, toast, confirmDialog } from '../ui.js';
import { getSettings, setSettings } from '../store.js';
import { THEME_META, installedThemes } from '../themes-meta.js';

export const ROUTE = 'settings';
const GL = { k: '♚', q: '♛', r: '♜', n: '♞', b: '♝', p: '♟' };

function themePreview(t) {
  // 4×3 mini board with a few pieces in the theme's colours
  const cells = [];
  const pcs = { 0: ['r', 'b'], 2: ['k', 'b'], 5: ['p', 'b'], 6: ['n', 'w'], 9: ['q', 'w'], 11: ['p', 'w'] };
  for (let i = 0; i < 12; i++) {
    const dark = ((i % 4) + Math.floor(i / 4)) % 2 === 1;
    const p = pcs[i];
    cells.push(`<i style="background:${dark ? t.dark : t.light}">${p ? `<b style="color:${p[1] === 'w' ? t.w : t.b}">${GL[p[0]]}</b>` : ''}</i>`);
  }
  return `<div class="tp-board">${cells.join('')}</div>`;
}

export function settingsPanel(app, { compact = false } = {}) {
  const s = getSettings();
  const inst = installedThemes(app.deps);
  const el = h(`<div class="settings">
    <h3 class="sect">Piece set &amp; board</h3>
    <div class="theme-grid">${THEME_META.map(t => {
      const ok = inst.includes(t.id);
      return `<button class="theme-card${t.id === s.theme ? ' on' : ''}${ok ? '' : ' soon'}" data-theme="${t.id}" style="--tc:${t.accent}" ${ok ? '' : 'aria-disabled="true"'}>
        ${themePreview(t)}<span class="tc-name">${esc(t.name)}${ok ? '' : ' <em>Soon</em>'}</span><small>${esc(t.blurb)}</small></button>`;
    }).join('')}</div>

    <h3 class="sect">Battle animations</h3>
    <p class="hint-txt">Capture animations. Tap the board during one to skip it.</p>
    ${segmented('battleSpeed', [{ value: 'off', label: 'Off' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 5, label: '5×' }], s.battleSpeed)}

    <h3 class="sect">Board view</h3>
    ${segmented('view', [{ value: 'top', label: 'Top' }, { value: 'default', label: 'Default' }, { value: 'angle', label: 'Angled' }], s.view)}

    <h3 class="sect">Gameplay</h3>
    <div class="rows">
      <label class="row"><span><b>Sound</b><small>Moves, captures and clocks</small></span>${toggle('sound', s.sound)}</label>
      <label class="row"><span><b>Confirm moves</b><small>Tap ✓ before a move is played</small></span>${toggle('moveConfirm', s.moveConfirm)}</label>
      <label class="row"><span><b>Show coordinates</b><small>a–h and 1–8 on the board edge</small></span>${toggle('coords', s.coords)}</label>
    </div>
    ${compact ? '' : `<h3 class="sect">Data</h3>
    <div class="rows"><button class="row danger" data-act="reset"><span><b>Reset ladder &amp; stats</b><small>Starts your bot ladder from zero</small></span>${icon('chevron')}</button></div>
    <p class="fine">Progress is saved on this device${app.cloud ? ' and to your account when signed in' : ''}.</p>`}
  </div>`);
  bindSegmented(el, (name, v) => {
    const val = name === 'battleSpeed' ? (v === 'off' ? 'off' : +v) : v;
    setSettings({ [name]: val });
  });
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-theme]');
    if (t) {
      if (t.getAttribute('aria-disabled')) { toast(`${t.querySelector('.tc-name').firstChild.textContent.trim()} pieces are being carved — coming soon`); return; }
      el.querySelectorAll('[data-theme]').forEach(x => x.classList.toggle('on', x === t));
      setSettings({ theme: t.dataset.theme });
      document.documentElement.dataset.theme = t.dataset.theme;
      return;
    }
    const g = e.target.closest('.tgl');
    if (g) {
      e.preventDefault();
      const on = !g.classList.contains('on');
      g.classList.toggle('on', on); g.setAttribute('aria-checked', String(on));
      setSettings({ [g.dataset.name]: on });
      return;
    }
    if (e.target.closest('[data-act="reset"]')) {
      if (!(await confirmDialog({ title: 'Reset ladder and stats?', body: 'Your points, rank, ladder Elo and game record go back to zero. This cannot be undone.', ok: 'Reset', danger: true }))) return;
      try { localStorage.removeItem('gambit.ladder'); localStorage.removeItem('gambit.stats'); } catch { /* ignore */ }
      toast('Ladder reset');
    }
  });
  return el;
}

export function render(app) {
  const el = h('<section class="screen settings-screen"></section>');
  el.appendChild(settingsPanel(app));
  return { el, top: { title: 'Settings', back: '#/home' } };
}
