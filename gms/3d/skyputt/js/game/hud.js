// DOM HUD: hole / par / strokes pills, pause + look buttons, power meter, banners and the cards
// (hole complete, pause menu, scorecard), and the helper tray (M5: every helper in js/meta/helpers.js,
// scrollable, with tooltips on hover / long-press / tap). Pure DOM, no THREE.
import { HELPERS, HELPER_ICONS, helperName } from '../meta/helpers.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const ICONS = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exitfs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  sight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/></svg>',
  mull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f2c75c" stroke="#b9862a" stroke-width="2"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" stroke="#7a5512" stroke-width="1.6" fill="none"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path fill="#6fd6ff" d="M12 2l6 7-6 13L6 9z"/><path fill="#bff0ff" d="M12 2l-6 7h12z" opacity=".7"/></svg>',
};

const TRAY_ID = { longSight: 'sight', mulligan: 'mull' };   // keeps the M2 ids (#h-sight, #h-mull)

// A little chest (wood / silver / gold) for cards and the shop.
export const CHEST_COLORS = { wood: ['#b8743a', '#7a4a22', '#e0a35a'], silver: ['#cfd6e0', '#6c7686', '#ffffff'], gold: ['#f2c75c', '#9a6a12', '#fff3c4'] };
export function chestIcon(kind, size = 40) {
  const [a, b, c] = CHEST_COLORS[kind] || CHEST_COLORS.wood;
  return `<svg class="chest-ic" width="${size}" height="${size}" viewBox="0 0 40 40"><rect x="5" y="17" width="30" height="18" rx="3" fill="${a}" stroke="${b}" stroke-width="2"/>
    <path d="M5 18c0-8 5-12 15-12s15 4 15 12z" fill="${c}" stroke="${b}" stroke-width="2"/><rect x="5" y="16" width="30" height="4" fill="${b}"/>
    <rect x="17" y="15" width="6" height="9" rx="1.5" fill="#f2c75c" stroke="#7a5512" stroke-width="1.4"/></svg>`;
}

export const starRow = (n, max = 3) => `<span class="stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</span>`;

export function scoreName(strokes, par, picked) {
  if (picked) return 'Picked up';
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  return { '-4': 'Condor!', '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] ?? `+${d}`;
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="pill"><span class="lbl">Hole</span><b id="h-hole">1/3</b></div>
        <div class="pill"><span class="lbl">Par</span><b id="h-par">2</b></div>
        <div class="pill"><span class="lbl">Strokes</span><b id="h-strokes">0</b></div>
        <div class="spacer"></div>
        <button id="h-look" class="round" aria-label="Look around" aria-pressed="false">${ICONS.eye}</button>
        <button id="h-pause" class="round" aria-label="Pause">${ICONS.pause}</button>
      </div>
      <div class="hud-sub"><div class="pill small" id="h-gems">${ICONS.gem}<b>0</b></div></div>
      <div class="tray" id="h-tray">${HELPERS.map(h => `<button id="h-${TRAY_ID[h.id] || h.id}" class="tray-btn" data-h="${h.id}" aria-label="${h.name}">${HELPER_ICONS[h.id]}<span class="cnt">0</span>${h.kind !== 'post' ? '<span class="lvl"></span>' : ''}</button>`).join('')}</div>
      <div id="h-tip" class="tip" role="tooltip"></div>
      <div id="h-banner" class="banner"></div>
      <div id="h-hint" class="hint">Drag back anywhere to aim · release to putt</div>
      <div id="h-power" class="power" hidden><div class="power-track"><div class="power-fill"></div></div><div class="power-lbl"></div></div>
      <div id="h-card" class="card-wrap" hidden></div>`;
    this.el = {
      hole: $('#h-hole', root), par: $('#h-par', root), strokes: $('#h-strokes', root), gems: $('#h-gems b', root),
      banner: $('#h-banner', root), hint: $('#h-hint', root), power: $('#h-power', root),
      fill: $('.power-fill', root), plbl: $('.power-lbl', root), card: $('#h-card', root),
      look: $('#h-look', root), pause: $('#h-pause', root),
      sight: $('#h-sight', root), mull: $('#h-mull', root), tray: $('#h-tray', root), tip: $('#h-tip', root),
    };
    this._bt = 0;
    this.onHelper = null;   // (id) → set by the round
    this._wireTray();
  }
  _wireTray() {
    const tray = this.el.tray;
    let pressT = 0, longPressed = false;
    tray.addEventListener('click', e => {
      const b = e.target.closest('.tray-btn'); if (!b) return;
      if (longPressed) { longPressed = false; return; }   // a long-press only shows the tip
      this.tipFor(b, 1800);
      if (!b.classList.contains('off')) this.onHelper?.(b.dataset.h);
    });
    tray.addEventListener('pointerdown', e => {
      const b = e.target.closest('.tray-btn'); if (!b || e.pointerType === 'mouse') return;
      longPressed = false; clearTimeout(pressT);
      pressT = setTimeout(() => { longPressed = true; this.tipFor(b, 2600); }, 450);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tray.addEventListener(ev, () => clearTimeout(pressT));
    tray.addEventListener('scroll', () => this.tipHide());
    tray.addEventListener('pointerover', e => { const b = e.target.closest('.tray-btn'); if (b && e.pointerType === 'mouse') this.tipFor(b, 0); });
    tray.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && !tray.contains(e.relatedTarget)) this.tipHide(); });
    // unusable buttons get .off (not the disabled attribute) so they still show their tip
  }
  tipFor(b, ms) {
    const h = HELPERS.find(x => x.id === b.dataset.h), tip = this.el.tip;
    if (!h) return;
    const n = b.querySelector('.cnt').textContent;
    tip.innerHTML = `<b>${esc(h.name)}</b> <span>×${esc(n)}</span><small>${esc(h.desc)}${h.kind === 'pre' ? ' Tap again to take it back.' : ''}</small>`;
    const r = b.getBoundingClientRect(), left = r.left + r.width / 2 < innerWidth / 2;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - 90, r.top + r.height / 2 - 30))}px`;
    tip.style.left = left ? `${r.right + 10}px` : 'auto';
    tip.style.right = left ? 'auto' : `${innerWidth - r.left + 10}px`;
    tip.classList.add('show');
    clearTimeout(this._tt);
    if (ms) this._tt = setTimeout(() => this.tipHide(), ms);
  }
  tipHide() { this.el.tip.classList.remove('show'); }
  show(on) { this.root.hidden = !on; }
  setHole(i, n, par) { this.el.hole.textContent = `${i}/${n}`; this.el.par.textContent = par; }
  setStrokes(n, max) { this.el.strokes.textContent = n; this.el.strokes.classList.toggle('warn', n >= max - 1); }
  setGems(n, icon = null) {
    this.el.gems.textContent = n;
    const pill = this.el.gems.parentElement, svg = pill.querySelector('svg, .cur');
    if (icon && !pill.querySelector('.cur')) { svg?.remove(); pill.insertAdjacentHTML('afterbegin', `<span class="cur">${icon}</span>`); }
    else if (!icon && pill.querySelector('.cur')) { pill.querySelector('.cur').remove(); pill.insertAdjacentHTML('afterbegin', ICONS.gem); }
  }
  setLook(on) { this.el.look.classList.toggle('on', on); this.el.look.setAttribute('aria-pressed', on); }
  // counts: { id: n } · sight: Long Sight stacks this shot · armed: { id: true } one-shot helpers on
  // canPre: before a shot · canMull: a shot to undo. Long Sight + Mulligan always show; the rest only
  // when you hold one (or it is armed), so a fresh tray stays short.
  setHelpers({ counts, sight = 0, armed = {}, canPre, canMull }) {
    for (const b of this.el.tray.children) {
      const id = b.dataset.h, h = HELPERS.find(x => x.id === id), n = counts[id] | 0, on = id === 'longSight' ? sight > 0 : !!armed[id];
      b.querySelector('.cnt').textContent = n;
      const lvl = b.querySelector('.lvl');
      if (lvl) lvl.textContent = id === 'longSight' ? (sight ? '×' + sight : '') : on ? 'ON' : '';
      b.classList.toggle('on', on);
      b.hidden = !(id === 'longSight' || id === 'mulligan' || n > 0 || on);
      const off = h.kind === 'post' ? !canMull || n <= 0 : h.kind === 'stack' ? !canPre || (n <= 0 && !sight) || sight >= 3 : !canPre || (n <= 0 && !on);
      b.classList.toggle('off', off); b.setAttribute('aria-disabled', off);
    }
  }
  hint(on, text) { if (text) this.el.hint.textContent = text; this.el.hint.classList.toggle('show', on); }
  power(aim) {
    const p = this.el.power;
    if (!aim.active) { p.hidden = true; return; }
    p.hidden = false;
    this.el.fill.style.transform = `scaleX(${aim.power.toFixed(3)})`;
    this.el.fill.style.background = `hsl(${(130 - aim.power * 125).toFixed(0)} 85% 55%)`;
    p.classList.toggle('cancel', aim.cancel);
    this.el.plbl.textContent = aim.cancel ? 'Release here to cancel' : `${Math.round(aim.power * 100)}%`;
  }
  banner(html, cls = '', ms = 1600) {
    const b = this.el.banner;
    b.innerHTML = html; b.className = 'banner show ' + cls;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { b.className = 'banner ' + cls; }, ms);
  }
  hideCard() { this.el.card.hidden = true; this.el.card.innerHTML = ''; }
  _card(html) { const c = this.el.card; c.innerHTML = `<div class="card">${html}</div>`; c.hidden = false; return c; }

  holeDone({ hole, n, name, par, strokes, picked, gems, stars = 0, coins = 0, newBest, reward, nextLabel, onMap, rivals, youTotal, currency, ladder, chest, roundBonus, notes = null }, onNext) {
    const label = scoreName(strokes, par, picked);
    const d = strokes - par;
    const cls = strokes === 1 ? 'ace' : d < 0 ? 'under' : d === 0 ? 'par' : 'over';
    const rw = reward ? helperName(reward) : null;
    const c = this._card(`
      <div class="card-kicker">Hole ${hole} of ${n} · ${esc(name)}</div>
      <div class="card-title ${cls}">${esc(label)}</div>
      <div class="card-stars">${starRow(stars)}</div>
      <div class="card-stats"><div><span>Strokes</span><b>${strokes}</b></div><div><span>Par</span><b>${par}</b></div>${currency ? `<div><span>${esc(currency.name)}</span><b>+${gems}</b></div>` : `<div><span>Coins</span><b>+${coins}</b></div>`}</div>
      ${(notes || []).map(t => `<div class="card-note bad">${esc(t)}</div>`).join('')}
      ${newBest ? '<div class="card-note good">New best!</div>' : ''}
      ${rw ? `<div class="card-note good">3 stars: +1 ${esc(rw)}</div>` : ''}
      ${ladder ? `<div class="card-ladder"><span class="lp">+${ladder.points} ladder pts</span>${ladder.streak > 1 ? `<span class="streak">🔥 ${ladder.streak}-day streak</span>` : ''}</div>` : ''}
      ${roundBonus && (roundBonus.points || roundBonus.coins) ? `<div class="card-note good">Round complete: +${roundBonus.points} pts${roundBonus.coins ? ` · ${ICONS.coin}+${roundBonus.coins}` : ''}</div>` : ''}
      ${chest ? `<div class="card-chest">${chestIcon(chest, 34)}<span>Chest earned! <small>Open it in the Shop</small></span></div>` : ''}
      ${rivals?.length ? `<table class="scores rivals"><tr><th></th><th>Hole</th><th>Total</th></tr>
        <tr class="you"><td>You</td><td>${strokes}</td><td>${youTotal}</td></tr>
        ${(rivals.length > 4 ? [...rivals].sort((a, b) => a.total - b.total).slice(0, 4) : rivals).map(r => `<tr><td><i class="dot" style="background:${r.colour}"></i>${esc(r.name)}</td><td>${r.strokes}</td><td>${r.total}</td></tr>`).join('')}</table>` : ''}
      <button class="btn primary" data-a="next">${esc(nextLabel || 'Next hole')}</button>
      ${onMap ? '<button class="btn ghost" data-a="map">Course map</button>' : ''}`);
    c.querySelector('[data-a=next]').onclick = () => { this.hideCard(); onNext(); };
    const m = c.querySelector('[data-a=map]'); if (m) m.onclick = () => { this.hideCard(); onMap(); };
  }
  // onRestart null hides Restart (online rounds); title / note / quitLabel are optional
  pause({ onResume, onRestart, onQuit, onSettings, fsButton, title = 'Paused', note = '', quitLabel = 'Quit to title' }) {
    const c = this._card(`
      <div class="card-title">${esc(title)}</div>
      ${note ? `<div class="card-note">${esc(note)}</div>` : ''}
      <button class="btn primary" data-a="resume">Resume</button>
      ${onRestart ? '<button class="btn" data-a="restart">Restart hole</button>' : ''}
      ${onSettings ? '<button class="btn" data-a="settings">Settings</button>' : ''}
      ${fsButton ? '<button class="btn" data-a="fs">Fullscreen</button>' : ''}
      <button class="btn ghost" data-a="quit">${esc(quitLabel)}</button>`);
    c.querySelector('[data-a=resume]').onclick = () => { this.hideCard(); onResume(); };
    const rs = c.querySelector('[data-a=restart]'); if (rs) rs.onclick = () => { this.hideCard(); onRestart(); };
    c.querySelector('[data-a=quit]').onclick = () => { this.hideCard(); onQuit(); };
    const fs = c.querySelector('[data-a=fs]'); if (fs) fs.onclick = fsButton;
    const st = c.querySelector('[data-a=settings]'); if (st) st.onclick = () => { this.hideCard(); onSettings(); };
  }
  scorecard({ course, rows, gems }, { onAgain, onTitle }) {
    const tp = rows.reduce((a, r) => a + r.par, 0), ts = rows.reduce((a, r) => a + r.strokes, 0);
    const diff = ts - tp, ds = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
    const c = this._card(`
      <div class="card-kicker">${esc(course)}</div>
      <div class="card-title">Scorecard</div>
      <table class="scores">
        <tr><th>Hole</th>${rows.map(r => `<th>${r.hole}</th>`).join('')}<th>Tot</th></tr>
        <tr><td>Par</td>${rows.map(r => `<td>${r.par}</td>`).join('')}<td>${tp}</td></tr>
        <tr class="you"><td>You</td>${rows.map(r => `<td class="${r.strokes < r.par ? 'under' : r.strokes > r.par ? 'over' : ''}">${r.strokes}${r.picked ? '*' : ''}</td>`).join('')}<td>${ts}</td></tr>
      </table>
      <div class="card-big ${diff < 0 ? 'under' : diff > 0 ? 'over' : 'par'}">${ds}</div>
      <div class="card-note">${gems} crystal${gems === 1 ? '' : 's'} collected</div>
      <button class="btn primary" data-a="again">Play again</button>
      <button class="btn ghost" data-a="title">Title</button>`);
    c.querySelector('[data-a=again]').onclick = () => { this.hideCard(); onAgain(); };
    c.querySelector('[data-a=title]').onclick = () => { this.hideCard(); onTitle(); };
  }
}
