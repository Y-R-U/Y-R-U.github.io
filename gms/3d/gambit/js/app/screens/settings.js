import { h, esc, icon, segmented, bindSegmented, toggle, toast, confirmDialog } from '../ui.js';
import { getSettings, setSettings } from '../store.js';
import { THEME_META, installedThemes } from '../themes-meta.js';
import { play } from '../sound.js';
import { resetBench } from './bots.js';

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
    <p class="hint-txt">Top, Tilt and 3D are fixed views. Free lets you drag, pinch and use the arrow keys to look around. Press V or the View button in a game to cycle.</p>
    ${segmented('view', [{ value: 'top', label: 'Top' }, { value: 'tilt', label: 'Tilt' }, { value: 'angle', label: '3D' }, { value: 'free', label: 'Free' }], s.view === 'default' ? 'tilt' : s.view)}
    <div class="rows" style="margin-top:12px">
      <label class="row"><span><b>Ambient animation</b><small>Flickering flames, drifting fog and other idle effects. Off saves battery</small></span>${toggle('ambientAnim', s.ambientAnim !== false)}</label>
    </div>

    <h3 class="sect">Gameplay</h3>
    <div class="rows">
      <label class="row"><span><b>Sound</b><small>Moves, captures and clocks</small></span>${toggle('sound', s.sound)}</label>
      <div class="row"><span><b>Effects volume</b></span><input type="range" min="0" max="100" step="5" value="${Math.round((s.volume ?? 0.8) * 100)}" data-vol="volume" aria-label="Effects volume" style="width:46%;max-width:200px;accent-color:var(--accent)"></div>
      <label class="row"><span><b>Music</b><small>Calm theme music, loops quietly</small></span>${toggle('music', !!s.music)}</label>
      <div class="row"><span><b>Music volume</b></span><input type="range" min="0" max="100" step="5" value="${Math.round((s.musicVolume ?? 0.5) * 100)}" data-vol="musicVolume" aria-label="Music volume" style="width:46%;max-width:200px;accent-color:var(--accent)"></div>
      <label class="row"><span><b>Confirm moves</b><small>Tap ✓ before a move is played</small></span>${toggle('moveConfirm', s.moveConfirm)}</label>
      <label class="row"><span><b>Check alerts</b><small>A big CHECK sign when a king is attacked, then a badge by the board edge</small></span>${toggle('checkAlerts', s.checkAlerts !== false)}</label>
      <label class="row"><span><b>Show coordinates</b><small>a–h and 1–8 on the board edge</small></span>${toggle('coords', s.coords)}</label>
    </div>
    ${compact ? '' : `<h3 class="sect">This device</h3>
    <div class="rows"><div class="row"><span><b>Bot speed test</b><small class="bench-txt">${benchText(app)}</small></span>
      <button class="btn btn-ghost btn-sm" data-act="bench">Re-test</button></div></div>
    <h3 class="sect">Data</h3>
    <div class="rows"><button class="row danger" data-act="reset"><span><b>Reset ladder &amp; stats</b><small>Starts your bot ladder from zero</small></span>${icon('chevron')}</button></div>
    <p class="fine">Progress is saved on this device${app.cloud ? ' and to your account when signed in' : ''}.</p>
    <h3 class="sect">About</h3>
    <p class="fine about">Puzzles from the <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener">Lichess.org open database</a> (CC0), plus classic games and studies.<br>Pieces, boards and animations are drawn in code with Three.js.</p>`}
  </div>`);
  bindSegmented(el, (name, v) => {
    const val = name === 'battleSpeed' ? (v === 'off' ? 'off' : +v) : v;
    setSettings({ [name]: val });
  });
  // audio agent: volume sliders (live), a tap on release previews the effects level
  el.addEventListener('input', e => { const r = e.target.closest('[data-vol]'); if (r) setSettings({ [r.dataset.vol]: +r.value / 100 }); });
  el.addEventListener('change', e => { const r = e.target.closest('[data-vol="volume"]'); if (r) play('move'); });
  el.addEventListener('click', async e => {
    // .theme-card, not [data-theme]: <html data-theme> would match every click in the panel (qa)
    const t = e.target.closest('.theme-card');
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
    const bb = e.target.closest('[data-act="bench"]');
    if (bb) {
      if (bb.disabled) return;
      bb.disabled = true; bb.textContent = 'Testing…';
      const txt = el.querySelector('.bench-txt');
      txt.textContent = 'Measuring how fast this device thinks… (about 2 s)';
      try { await app.deps.bots.benchmark({ force: true }); resetBench(); toast('Speed test done'); }
      catch (err) { console.warn('[gambit] benchmark', err); toast('The speed test failed — try again'); }
      bb.disabled = false; bb.textContent = 'Re-test';
      txt.textContent = benchText(app);
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

// "310k positions a second · 19 of 20 bots available on this device"
function benchText(app) {
  const bots = app.deps.bots;
  const b = bots.cachedBenchmark && bots.cachedBenchmark();
  if (!b) return 'Not measured yet. It runs when you open Play Bots.';
  const n = bots.BOTS.filter(x => bots.botAvailable(x, b)).length;
  const k = b.nps >= 1e6 ? `${(b.nps / 1e6).toFixed(1)}M` : `${Math.round(b.nps / 1000)}k`;
  return `${k} positions a second · ${n} of ${bots.BOTS.length} bots available. Re-test if the device was busy.`;
}

export function render(app) {
  const el = h('<section class="screen settings-screen"></section>');
  el.appendChild(settingsPanel(app));
  // back returns to wherever Settings was opened from (ui-4), home after a deep link
  const prev = app.prevHash && app.prevHash();
  return { el, top: { title: 'Settings', back: prev && !/^#\/settings/.test(prev) ? prev : '#/home' } };
}
