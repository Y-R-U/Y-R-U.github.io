// DOM overlay: menu (pick brother + part), HUD, fart button, result modal, and
// a manager for cute speech bubbles projected from 3D head positions.
import { BROS, ROLES, other } from './config.js';

const overlay = document.getElementById('overlay');
const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

export class UI {
  constructor() {
    this.sel = { bro: 'older', role: 'p1' };
    this.bubbles = new Map();
    this._build();
  }

  _build() {
    this.menu = el(`
      <div id="menu"><div class="card panel">
        <div class="title">Glade Bros 3D<small>💨 FART &amp; SEEK 🤢</small></div>
        <div class="tagline">One brother lets one rip and bolts. The other coughs his guts up… then hunts for revenge. Pick your guy and your part — the computer plays the other brother.</div>
        <div class="qlabel">1 · Which brother are you?</div>
        <div class="choices" id="ch-bro"></div>
        <div class="qlabel">2 · What's your part?</div>
        <div class="choices" id="ch-role"></div>
        <div class="aihint" id="aihint"></div>
        <button class="btn go" id="startbtn">Let's go! ▶</button>
      </div></div>`);
    overlay.appendChild(this.menu);

    const broWrap = this.menu.querySelector('#ch-bro');
    for (const k of ['older', 'younger']) {
      const b = BROS[k];
      broWrap.appendChild(el(`<div class="choice" data-grp="bro" data-key="${k}"><span class="em">${b.emoji}</span>${b.label}<small>${b.blurb}</small></div>`));
    }
    const roleWrap = this.menu.querySelector('#ch-role');
    for (const k of ['p1', 'p2']) {
      const r = ROLES[k];
      roleWrap.appendChild(el(`<div class="choice" data-grp="role" data-key="${k}"><span class="em">${r.emoji}</span>${r.short}<small>${r.blurb}</small></div>`));
    }
    this.menu.querySelectorAll('.choice').forEach(c => c.addEventListener('click', () => {
      const grp = c.dataset.grp;
      this.menu.querySelectorAll(`.choice[data-grp="${grp}"]`).forEach(o => o.classList.remove('sel'));
      c.classList.add('sel'); this.sel[grp] = c.dataset.key; this._aihint();
    }));
    this.menu.querySelector('.choice[data-grp="bro"][data-key="older"]').classList.add('sel');
    this.menu.querySelector('.choice[data-grp="role"][data-key="p1"]').classList.add('sel');
    this._aihint();
    this.menu.querySelector('#startbtn').addEventListener('click', () => this.onStart && this.onStart(this.sel.bro, this.sel.role));

    this.hud = el(`<div id="hud" class="hide"><div id="banner"></div><div id="timer"></div></div>`);
    overlay.appendChild(this.hud);
    this.banner = this.hud.querySelector('#banner');
    this.timerEl = this.hud.querySelector('#timer');

    this.fartBtn = el(`<button id="fartbtn" class="hide">💨 FART!</button>`);
    overlay.appendChild(this.fartBtn);
    this.fartBtn.addEventListener('click', () => this.onFart && this.onFart());

    this.hintEl = el(`<div class="hint"></div>`);
    overlay.appendChild(this.hintEl);

    this.bubbleLayer = el(`<div id="bubbles"></div>`);
    overlay.appendChild(this.bubbleLayer);

    this.result = el(`
      <div id="result" class="hide"><div class="card panel">
        <div class="big"></div><h2></h2><div class="verdict"></div><p></p>
        <button class="btn go" id="againbtn">Play again ↺</button>
      </div></div>`);
    overlay.appendChild(this.result);
    this.result.querySelector('#againbtn').addEventListener('click', () => this.onAgain && this.onAgain());
  }

  _aihint() {
    const ab = BROS[other(this.sel.bro)], ar = ROLES[other(this.sel.role)];
    this.menu.querySelector('#aihint').innerHTML = `<span>🤖 Computer plays <b>${ab.label}</b> — the <b>${ar.short}</b>.</span>`;
  }

  showMenu() { this.menu.classList.remove('hide'); }
  hideMenu() { this.menu.classList.add('hide'); }
  showHUD() { this.hud.classList.remove('hide'); }
  hideHUD() { this.hud.classList.add('hide'); }
  setBanner(t) { this.banner.innerHTML = t; }
  setTimer(s) {
    if (s == null) { this.timerEl.style.display = 'none'; return; }
    this.timerEl.style.display = '';
    this.timerEl.textContent = Math.ceil(s);
    this.timerEl.classList.toggle('warn', s <= 8);
  }
  showFart(on) { this.fartBtn.classList.toggle('hide', !on); }
  hint(t) { this.hintEl.textContent = t; this.hintEl.classList.add('show'); }
  hideHint() { this.hintEl.classList.remove('show'); }

  showResult({ emoji, title, verdict, win, sub }) {
    this.result.querySelector('.big').textContent = emoji;
    this.result.querySelector('h2').textContent = title;
    const v = this.result.querySelector('.verdict');
    v.textContent = verdict; v.className = 'verdict ' + (win ? 'win' : 'lose');
    this.result.querySelector('p').textContent = sub;
    this.result.classList.remove('hide');
  }
  hideResult() { this.result.classList.add('hide'); }

  // ── speech bubbles ──
  say(id, text, dur = 2.2) {
    let b = this.bubbles.get(id);
    if (!b) { const div = el(`<div class="bubble3d"></div>`); this.bubbleLayer.appendChild(div); b = { el: div }; this.bubbles.set(id, b); }
    b.el.textContent = text; b.t = 0; b.dur = dur; b.el.style.opacity = '0';
  }
  clearBubble(id) { const b = this.bubbles.get(id); if (b) { b.el.remove(); this.bubbles.delete(id); } }
  clearAllBubbles() { for (const id of [...this.bubbles.keys()]) this.clearBubble(id); }

  tickBubbles(dt) {
    for (const [id, b] of this.bubbles) { b.t += dt; if (b.t >= b.dur) this.clearBubble(id); }
  }
  placeBubble(id, x, y, onScreen) {
    const b = this.bubbles.get(id); if (!b) return;
    if (!onScreen) { b.el.style.opacity = '0'; return; }
    b.el.style.left = x + 'px'; b.el.style.top = y + 'px';
    const fade = b.t < 0.12 ? b.t / 0.12 : (b.dur - b.t < 0.25 ? (b.dur - b.t) / 0.25 : 1);
    b.el.style.opacity = String(Math.max(0, fade));
  }
  hasBubble(id) { return this.bubbles.has(id); }
}
