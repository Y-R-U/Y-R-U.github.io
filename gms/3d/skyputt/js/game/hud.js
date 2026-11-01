// DOM HUD: hole / par / strokes pills, pause + look buttons, power meter, banners and the cards
// (hole complete, pause menu, scorecard). Pure DOM, no THREE.

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const ICONS = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exitfs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  gem: '<svg viewBox="0 0 24 24"><path fill="#6fd6ff" d="M12 2l6 7-6 13L6 9z"/><path fill="#bff0ff" d="M12 2l-6 7h12z" opacity=".7"/></svg>',
};

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
      <div id="h-banner" class="banner"></div>
      <div id="h-hint" class="hint">Drag back anywhere to aim · release to putt</div>
      <div id="h-power" class="power" hidden><div class="power-track"><div class="power-fill"></div></div><div class="power-lbl"></div></div>
      <div id="h-card" class="card-wrap" hidden></div>`;
    this.el = {
      hole: $('#h-hole', root), par: $('#h-par', root), strokes: $('#h-strokes', root), gems: $('#h-gems b', root),
      banner: $('#h-banner', root), hint: $('#h-hint', root), power: $('#h-power', root),
      fill: $('.power-fill', root), plbl: $('.power-lbl', root), card: $('#h-card', root),
      look: $('#h-look', root), pause: $('#h-pause', root),
    };
    this._bt = 0;
  }
  show(on) { this.root.hidden = !on; }
  setHole(i, n, par) { this.el.hole.textContent = `${i}/${n}`; this.el.par.textContent = par; }
  setStrokes(n, max) { this.el.strokes.textContent = n; this.el.strokes.classList.toggle('warn', n >= max - 1); }
  setGems(n) { this.el.gems.textContent = n; }
  setLook(on) { this.el.look.classList.toggle('on', on); this.el.look.setAttribute('aria-pressed', on); }
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

  holeDone({ hole, n, name, par, strokes, picked, gems, last }, onNext) {
    const label = scoreName(strokes, par, picked);
    const d = strokes - par;
    const cls = strokes === 1 ? 'ace' : d < 0 ? 'under' : d === 0 ? 'par' : 'over';
    const c = this._card(`
      <div class="card-kicker">Hole ${hole} of ${n} · ${esc(name)}</div>
      <div class="card-title ${cls}">${esc(label)}</div>
      <div class="card-stats"><div><span>Strokes</span><b>${strokes}</b></div><div><span>Par</span><b>${par}</b></div><div><span>Crystals</span><b>${gems}</b></div></div>
      <button class="btn primary" data-a="next">${last ? 'Scorecard' : 'Next hole'}</button>`);
    c.querySelector('[data-a=next]').onclick = () => { this.hideCard(); onNext(); };
  }
  pause({ onResume, onRestart, onQuit, fsButton }) {
    const c = this._card(`
      <div class="card-title">Paused</div>
      <button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="restart">Restart hole</button>
      ${fsButton ? '<button class="btn" data-a="fs">Fullscreen</button>' : ''}
      <button class="btn ghost" data-a="quit">Quit to title</button>`);
    c.querySelector('[data-a=resume]').onclick = () => { this.hideCard(); onResume(); };
    c.querySelector('[data-a=restart]').onclick = () => { this.hideCard(); onRestart(); };
    c.querySelector('[data-a=quit]').onclick = () => { this.hideCard(); onQuit(); };
    const fs = c.querySelector('[data-a=fs]'); if (fs) fs.onclick = fsButton;
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
