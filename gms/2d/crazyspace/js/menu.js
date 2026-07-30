// menu.js — DOM screens: title, mode select, ship select, pause, results.

import { MODES, MODE_LIST, SHIPS, SHIP_LIST, TEAMS } from './config.js';
import { fmtDuration, kdRatio } from './save.js';

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
  constructor(root, opts = {}) {
    this.onStart = opts.onStart;
    this.onSettings = opts.onSettings || (() => {});
    this.getCareer = opts.getCareer || (() => null);
    this.onResetCareer = opts.onResetCareer || (() => {});
    this.settings = opts.settings || {};
    this.ui = root;

    // last-used selection comes back from the persisted settings
    this.selMode = MODE_LIST.includes(this.settings.lastMode) ? this.settings.lastMode : 'deathmatch';
    this.selShip = SHIP_LIST.includes(this.settings.lastShip) ? this.settings.lastShip : 'warbird';
    this.selDiff = DIFFS.find(d => d.key === this.settings.lastDiff) || DIFFS[1];

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
        el('button', { class: 'btn', onclick: () => this.show('career') }, '📊  Career'),
        el('button', { class: 'btn', onclick: () => this.show('settings') }, '⚙  Settings'),
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

    // ---------------- settings ----------------
    this.nameInput = el('input', {
      class: 'field', type: 'text', maxlength: '14', spellcheck: 'false',
      autocomplete: 'off', placeholder: 'Pilot', value: this.settings.name || 'You',
      oninput: () => this._commitName(),
      onchange: () => this._commitName(),
    });
    this.volInput = el('input', {
      class: 'slider', type: 'range', min: '0', max: '100', step: '5',
      value: String(Math.round((this.settings.volume != null ? this.settings.volume : 0.5) * 100)),
      oninput: (e) => this._commitVolume(e.target.value),
    });
    this.volLabel = el('span', { class: 'val' }, Math.round((this.settings.volume != null ? this.settings.volume : 0.5) * 100) + '%');

    const handWrap = el('div', { class: 'segment' });
    this.handBtns = [['left', 'Left thumb'], ['right', 'Right thumb']].map(([k, lab]) => {
      const b = el('button', {
        class: 'seg' + (this.settings.handed === k ? ' on' : ''),
        onclick: () => this._commitHanded(k),
      }, lab);
      handWrap.append(b); return b;
    });

    this.settingsScreen = el('div', { class: 'screen settings-screen' },
      el('div', { class: 'topbar' },
        el('button', { class: 'icon-btn', onclick: () => this.show('title') }, '‹'),
        el('h2', {}, 'Settings'), el('span', {})),
      el('div', { class: 'panel' },
        el('div', { class: 'setting' },
          el('label', {}, 'Pilot name'),
          this.nameInput),
        el('div', { class: 'setting' },
          el('label', {}, 'Sound volume'),
          el('div', { class: 'slide-row' }, this.volInput, this.volLabel)),
        el('div', { class: 'setting' },
          el('label', {}, 'Steering thumb'),
          handWrap),
        el('p', { class: 'hint' }, 'Steering joystick goes on this side; fire buttons on the other. Settings and career stats are saved on this device — sign in from the avatar to carry them between devices.'),
      ),
    );

    // ---------------- career ----------------
    this.careerBody = el('div', { class: 'panel' });
    this.career = el('div', { class: 'screen career-screen' },
      el('div', { class: 'topbar' },
        el('button', { class: 'icon-btn', onclick: () => this.show('title') }, '‹'),
        el('h2', {}, 'Career'), el('span', {})),
      this.careerBody,
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

    this.ui.append(this.title, this.help, this.mode, this.ship, this.settingsScreen,
      this.career, this.pause, this.results, this.gameBtns);
  }

  get _screens() {
    return [this.title, this.help, this.mode, this.ship, this.settingsScreen,
      this.career, this.pause, this.results];
  }

  // ---------------- settings commits ----------------
  _commitName() {
    const v = (this.nameInput.value || '').trim().slice(0, 14) || 'You';
    this.settings.name = v;
    this.onSettings({ name: v });
  }
  _commitVolume(raw) {
    const v = Math.max(0, Math.min(1, (Number(raw) || 0) / 100));
    this.settings.volume = v;
    this.volLabel.textContent = Math.round(v * 100) + '%';
    this.onSettings({ volume: v });
  }
  _commitHanded(k) {
    this.settings.handed = k;
    this.handBtns.forEach((b, i) => b.classList.toggle('on', ['left', 'right'][i] === k));
    this.onSettings({ handed: k });
  }

  // ---------------- career screen ----------------
  _renderCareer() {
    const c = this.getCareer();
    this.careerBody.innerHTML = '';
    this._resetArmed = false;
    if (!c) { this.careerBody.append(el('p', { class: 'hint' }, 'No career data available.')); return; }
    const t = c.total || {};

    const tiles = [
      ['Matches', t.matches || 0],
      ['Wins', t.wins || 0],
      ['Kills', t.kills || 0],
      ['Deaths', t.deaths || 0],
      ['K/D', kdRatio(t)],
      ['Best streak', t.bestStreak || 0],
      ['Best score', t.bestScore || 0],
      ['Time flown', fmtDuration(t.playSec || 0)],
    ];
    const tileGrid = el('div', { class: 'tiles' },
      ...tiles.map(([k, v]) => el('div', { class: 'tile' },
        el('b', {}, String(v)), el('span', {}, k))));

    const modeTable = el('div', { class: 'stat-table' },
      el('div', { class: 'trow head' },
        el('span', { class: 'nm' }, 'Mode'), el('span', {}, 'Played'),
        el('span', {}, 'Won'), el('span', {}, 'K/D')));
    for (const k of MODE_LIST) {
      const m = (c.modes && c.modes[k]) || {};
      const extra = k === 'ctf' ? `${m.caps || 0} caps`
        : k === 'koth' ? `${fmtDuration(m.holdSec || 0)}` : '';
      modeTable.append(el('div', { class: 'trow' },
        el('span', { class: 'nm' }, MODES[k].icon + ' ' + MODES[k].name + (extra ? ' · ' + extra : '')),
        el('span', {}, String(m.matches || 0)),
        el('span', {}, String(m.wins || 0)),
        el('span', {}, String(kdRatio(m)))));
    }

    const shipTable = el('div', { class: 'stat-table' },
      el('div', { class: 'trow head' },
        el('span', { class: 'nm' }, 'Ship'), el('span', {}, 'Games'),
        el('span', {}, 'Kills'), el('span', {}, '')));
    for (const k of SHIP_LIST) {
      const s = (c.ships && c.ships[k]) || {};
      shipTable.append(el('div', { class: 'trow' },
        el('span', { class: 'nm' }, SHIPS[k].name),
        el('span', {}, String(s.games || 0)),
        el('span', {}, String(s.kills || 0)),
        el('span', {}, '')));
    }

    this.resetBtn = el('button', { class: 'btn danger', onclick: () => this._resetTap() }, 'Reset career');

    this.careerBody.append(
      tileGrid,
      el('h3', { class: 'sec' }, 'By mode'), modeTable,
      el('h3', { class: 'sec' }, 'By ship'), shipTable,
      this.resetBtn,
    );
  }

  // Two-tap confirm — no alert()/confirm() dialogs anywhere in this game.
  _resetTap() {
    if (!this._resetArmed) {
      this._resetArmed = true;
      this.resetBtn.textContent = 'Tap again to erase';
      setTimeout(() => {
        if (this._resetArmed && this.resetBtn) { this._resetArmed = false; this.resetBtn.textContent = 'Reset career'; }
      }, 3000);
      return;
    }
    this._resetArmed = false;
    this.onResetCareer();
    this._renderCareer();
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
  _launch() {
    this.onSettings({ lastMode: this.selMode, lastShip: this.selShip, lastDiff: this.selDiff.key });
    this.hideAll();
    this.onStart(this.selMode, this.selShip, this.selDiff.skill);
  }

  show(name) {
    this.hideAll();
    if (name === 'career') this._renderCareer();
    ({
      title: this.title, help: this.help, mode: this.mode, ship: this.ship,
      settings: this.settingsScreen, career: this.career,
    }[name])?.classList.add('active');
  }

  hideAll() {
    for (const s of this._screens) s.classList.remove('active');
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
    // Career line — the match has already been folded in by this point, so this
    // doubles as visible proof the save took.
    const c = this.getCareer();
    const t = (c && c.total) || null;

    this.resultsBody.append(
      el('h2', { class: 'win' }, data.winner),
      el('p', { class: 'mode-name' }, data.modeName),
      table,
      t ? el('p', { class: 'career-line' },
        `Career · ${t.matches || 0} matches · ${t.wins || 0} won · ${t.kills || 0} kills · best streak ${t.bestStreak || 0}`) : null,
      el('div', { class: 'menu-btns row' },
        el('button', { class: 'btn primary', onclick: () => cb('rematch') }, '↻ Rematch'),
        el('button', { class: 'btn', onclick: () => cb('menu') }, 'Main Menu')),
    );
    this.results.classList.add('active');
  }
  hideResults() { this.results.classList.remove('active'); }
}
