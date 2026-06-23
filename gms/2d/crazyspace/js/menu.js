// menu.js — DOM screens: title, mode select, ship select, pause, results.

import { MODES, MODE_LIST, SHIPS, SHIP_LIST, TEAMS } from './config.js';

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') e.className = props[k];
    else if (k === 'html') e.innerHTML = props[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else e.setAttribute(k, props[k]);
  }
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
}

// normalize ship stats for the little bars
const SMAX = { top: 440, turn: 5.6, energy: 2200, power: 2000 };
function shipPower(d) { return d.gunDmg * d.fireRate; }

const DIFFS = [
  { key: 'rookie', label: 'Rookie', skill: 0.4 },
  { key: 'veteran', label: 'Veteran', skill: 0.62 },
  { key: 'ace', label: 'Ace', skill: 0.85 },
];

export class Menu {
  constructor(root, { onStart }) {
    this.onStart = onStart;
    this.ui = root;
    this.selMode = 'deathmatch';
    this.selShip = 'warbird';
    this.selDiff = DIFFS[1];

    this._build();
  }

  _build() {
    // ---------------- title ----------------
    this.title = el('div', { class: 'screen active' },
      el('div', { class: 'logo' },
        el('h1', { html: 'CRAZY<span>SPACE</span>' }),
        el('p', { class: 'tag' }, 'Zero-gravity arena combat')),
      el('div', { class: 'menu-btns' },
        el('button', { class: 'btn primary', onclick: () => this.show('mode') }, '▶  PLAY'),
        el('button', { class: 'btn', onclick: () => this.show('help') }, 'How to Play')),
      el('p', { class: 'foot' }, 'A single-player Subspace-style shooter · play vs AI'),
    );

    // ---------------- help ----------------
    this.help = el('div', { class: 'screen' },
      el('div', { class: 'panel' },
        el('h2', {}, 'How to Play'),
        el('div', { class: 'help-grid', html: `
          <div><b>Move</b><span>Left thumb — drag to steer & thrust. Keyboard: <kbd>W/A/S/D</kbd> or arrows.</span></div>
          <div><b>Fire</b><span>Right buttons or <kbd>Space</kbd>. Hold to keep firing.</span></div>
          <div><b>Bomb</b><span>💣 button or <kbd>Shift</kbd>. Fire while still to drop a mine.</span></div>
          <div><b>Special</b><span>✦ Burst or Repel — <kbd>E</kbd> / <kbd>L</kbd>.</span></div>
          <div><b>Energy</b><span>Your bar is health <i>and</i> ammo. It recharges — don't bottom out.</span></div>
          <div><b>Greens</b><span>Fly over green prizes to upgrade guns, bombs, speed & more.</span></div>
          <div><b>Scores</b><span>Hold <kbd>Tab</kbd> (or 🏆) for the scoreboard. <kbd>P</kbd> to pause.</span></div>
        ` }),
        el('button', { class: 'btn primary', onclick: () => this.show('title') }, 'Got it'),
      ),
    );

    // ---------------- mode select ----------------
    const modeGrid = el('div', { class: 'cards' });
    for (const k of MODE_LIST) {
      const m = MODES[k];
      modeGrid.append(el('button', {
        class: 'card mode-card', onclick: () => { this.selMode = k; this.show('ship'); },
      },
        el('div', { class: 'card-icon' }, m.icon),
        el('div', { class: 'card-title' }, m.name),
        el('div', { class: 'card-sub' }, m.blurb),
      ));
    }
    this.mode = el('div', { class: 'screen' },
      el('div', { class: 'topbar' },
        el('button', { class: 'icon-btn', onclick: () => this.show('title') }, '‹'),
        el('h2', {}, 'Select Mode'), el('span', {})),
      modeGrid,
    );

    // ---------------- ship select ----------------
    this.shipGrid = el('div', { class: 'cards ships' });
    this._buildShipCards();
    const diffWrap = el('div', { class: 'segment' });
    this.diffBtns = DIFFS.map(d => {
      const b = el('button', { class: 'seg' + (d === this.selDiff ? ' on' : ''), onclick: () => this._pickDiff(d) }, d.label);
      diffWrap.append(b); return b;
    });
    this.ship = el('div', { class: 'screen' },
      el('div', { class: 'topbar' },
        el('button', { class: 'icon-btn', onclick: () => this.show('mode') }, '‹'),
        el('h2', {}, 'Select Ship'), el('span', {})),
      this.shipGrid,
      el('div', { class: 'diff-row' }, el('label', {}, 'AI Difficulty'), diffWrap),
      el('button', { class: 'btn primary launch', onclick: () => this._launch() }, '🚀  LAUNCH'),
    );

    // ---------------- pause ----------------
    this.pause = el('div', { class: 'screen overlay' },
      el('div', { class: 'panel narrow' },
        el('h2', {}, 'Paused'),
        el('button', { class: 'btn primary', onclick: () => this._pauseCb('resume') }, 'Resume'),
        el('button', { class: 'btn', onclick: () => this._pauseCb('restart') }, 'Restart Match'),
        this.muteBtn = el('button', { class: 'btn', onclick: () => this._pauseCb('mute') }, '🔊 Sound: On'),
        el('button', { class: 'btn danger', onclick: () => this._pauseCb('quit') }, 'Quit to Menu'),
      ),
    );

    // ---------------- results ----------------
    this.resultsBody = el('div', { class: 'panel wide' });
    this.results = el('div', { class: 'screen overlay' }, this.resultsBody);

    // ---------------- in-game small buttons ----------------
    this.gameBtns = el('div', { class: 'game-btns' },
      el('button', { class: 'mini', onclick: () => this._igCb('pause') }, '⏸'),
      el('button', { class: 'mini', ontouchstart: () => this._igCb('scoresOn'), ontouchend: () => this._igCb('scoresOff'), onmousedown: () => this._igCb('scoresOn'), onmouseup: () => this._igCb('scoresOff') }, '🏆'),
    );
    this.gameBtns.style.display = 'none';

    this.ui.append(this.title, this.help, this.mode, this.ship, this.pause, this.results, this.gameBtns);
  }

  _buildShipCards() {
    this.shipGrid.innerHTML = '';
    this.shipCards = {};
    for (const k of SHIP_LIST) {
      const d = SHIPS[k];
      const bars = [
        ['SPD', d.top / SMAX.top], ['AGI', d.turn / SMAX.turn],
        ['ARM', d.maxEnergy / SMAX.energy], ['PWR', shipPower(d) / SMAX.power],
      ];
      const barEls = bars.map(([lab, v]) => el('div', { class: 'stat' },
        el('span', {}, lab),
        el('div', { class: 'bar' }, el('i', { style: `width:${Math.min(100, v * 100)}%` }))));
      const card = el('button', {
        class: 'card ship-card' + (k === this.selShip ? ' sel' : ''),
        onclick: () => this._pickShip(k),
      },
        el('div', { class: 'ship-head' },
          el('div', { class: 'ship-glyph', style: `--c:${TEAMS[0].color}` }, this._glyph(d.shape)),
          el('div', {}, el('div', { class: 'card-title' }, d.name), el('div', { class: 'card-sub' }, d.desc))),
        el('div', { class: 'stats' }, ...barEls),
      );
      this.shipCards[k] = card;
      this.shipGrid.append(card);
    }
  }

  _glyph(shape) {
    const m = { arrow: '➤', dart: '◤', spider: '✦', heavy: '◆', wedge: '▲' };
    return m[shape] || '➤';
  }

  _pickShip(k) {
    this.selShip = k;
    for (const key in this.shipCards) this.shipCards[key].classList.toggle('sel', key === k);
  }
  _pickDiff(d) {
    this.selDiff = d;
    this.diffBtns.forEach((b, i) => b.classList.toggle('on', DIFFS[i] === d));
  }
  _launch() { this.hideAll(); this.onStart(this.selMode, this.selShip, this.selDiff.skill); }

  show(name) {
    for (const s of [this.title, this.help, this.mode, this.ship, this.pause, this.results])
      s.classList.remove('active');
    ({ title: this.title, help: this.help, mode: this.mode, ship: this.ship }[name])?.classList.add('active');
  }

  hideAll() {
    for (const s of [this.title, this.help, this.mode, this.ship, this.pause, this.results])
      s.classList.remove('active');
  }

  showPause(cb) { this._pauseCb = (a) => cb(a); this.pause.classList.add('active'); }
  hidePause() { this.pause.classList.remove('active'); }
  setMuteLabel(muted) { if (this.muteBtn) this.muteBtn.textContent = muted ? '🔇 Sound: Off' : '🔊 Sound: On'; }

  showInGameButtons(v) { this.gameBtns.style.display = v ? 'flex' : 'none'; }
  bindInGame(cb) { this._igCb = cb; }

  showResults(data, cb) {
    this.resultsBody.innerHTML = '';
    const rows = data.rows;
    const table = el('div', { class: 'score-table' });
    table.append(el('div', { class: 'srow head' },
      el('span', {}, '#'), el('span', { class: 'nm' }, 'Player'),
      el('span', {}, 'K'), el('span', {}, 'D'), el('span', {}, 'Pts')));
    rows.forEach((r, i) => {
      table.append(el('div', { class: 'srow' + (r.isPlayer ? ' me' : '') },
        el('span', {}, i + 1),
        el('span', { class: 'nm' }, el('i', { class: 'dot', style: `background:${r.color}` }), r.name),
        el('span', {}, r.kills), el('span', {}, r.deaths), el('span', {}, r.score + r.kills)));
    });
    this.resultsBody.append(
      el('h2', { class: 'win' }, data.winner),
      el('p', { class: 'mode-name' }, data.modeName),
      table,
      el('div', { class: 'menu-btns row' },
        el('button', { class: 'btn primary', onclick: () => cb('rematch') }, '↻ Rematch'),
        el('button', { class: 'btn', onclick: () => cb('menu') }, 'Main Menu')),
    );
    this.results.classList.add('active');
  }
  hideResults() { this.results.classList.remove('active'); }
}
