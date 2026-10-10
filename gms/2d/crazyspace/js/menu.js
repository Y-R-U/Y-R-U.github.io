// menu.js — DOM screens: title, mode select, ship select, hangar, pause, results.
//
// Layout rule (Aaron): every screen is header / scrolling body / footer. Primary
// actions and navigation live in the header or footer, which never scroll away.

import { MODES, MODE_LIST, SHIPS, SHIP_LIST, TEAMS, UPGRADES, HANGAR_MAX, DIFFICULTY } from './config.js';
import { fmtDuration, kdRatio } from './save.js';
import { loadHangar, buyUpgrade, upgradeCost, upgradeCount, setHangar } from './hangar.js';

// Aaron's test panel: only when the game is opened from a literal 192.* LAN address
// (his phone hitting the Mac's dev server), never on games.br8t.com or Pages.
const LOCAL_DEBUG = /^192\.\d+\.\d+\.\d+$/.test(location.hostname);

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

// header / scrolling body / fixed footer
function screen(cls, { head, body = [], foot } = {}) {
  const s = el('div', { class: 'screen ' + cls });
  if (head) s.append(el('div', { class: 'shead' }, head));
  s.append(el('div', { class: 'sbody' }, el('div', { class: 'sinner' }, ...body)));
  if (foot) s.append(el('div', { class: 'sfoot' }, el('div', { class: 'sinner' }, ...foot)));
  return s;
}
function topbar(title, onBack, right) {
  return el('div', { class: 'topbar' },
    onBack ? el('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: onBack }, '‹') : el('span', {}),
    el('h2', {}, title), right || el('span', {}));
}

export const HANGAR_HINT = 'Every match earns credits. Hangar upgrades stack, so the longer you play the easier it gets.';

// normalize ship stats for the little bars
const SMAX = { top: 440, turn: 5.6, energy: 2200, power: 2000 };
function shipPower(d) { return d.gunDmg * d.fireRate; }

const DIFFS = Object.entries(DIFFICULTY).map(([key, d]) => ({ key, ...d }));
function diffText(d) {
  const pct = k => Math.round((d[k] - 1) * 100);
  const buff = d.hull === 1 && d.fire === 1 ? 'normal enemies'
    : pct('hull') === pct('fire') ? `enemies +${pct('hull')}% hull & firepower`
    : `enemies +${pct('hull')}% hull, +${pct('fire')}% firepower`;
  const aim = d.skill < 0.5 ? 'sloppy aim' : d.skill < 0.75 ? 'sharp aim' : 'deadly aim';
  return `${d.label}: ${buff}, ${aim}`;
}

export class Menu {
  constructor(root, opts = {}) {
    this.onStart = opts.onStart;
    this.onHangarRematch = null;
    this.onSettings = opts.onSettings || (() => {});
    this.getCareer = opts.getCareer || (() => null);
    this.onResetCareer = opts.onResetCareer || (() => {});
    this.settings = opts.settings || {};
    this.ui = root;

    // last-used selection comes back from the persisted settings
    this.selMode = MODE_LIST.includes(this.settings.lastMode) ? this.settings.lastMode : 'deathmatch';
    this.selShip = SHIP_LIST.includes(this.settings.lastShip) ? this.settings.lastShip : 'warbird';
    this.selDiff = DIFFS.find(d => d.key === this.settings.lastDiff) || DIFFS[0];

    this._build();
  }

  _build() {
    // ---------------- title ----------------
    this.titleCredits = el('span', { class: 'cr-badge' }, '');
    this.title = screen('title-screen active', {
      body: [
        el('div', { class: 'logo' },
          el('h1', { html: 'CRAZY<span>SPACE</span>' }),
          el('p', { class: 'tag' }, 'Zero-gravity arena combat')),
        el('p', { class: 'upg-hint' }, HANGAR_HINT),
      ],
      foot: [
        el('div', { class: 'menu-btns' },
          el('button', { class: 'btn primary', onclick: () => this.show('mode') }, '▶  PLAY'),
          el('button', { class: 'btn hangar-btn', onclick: () => this.show('hangar') }, '🛠  Hangar ', this.titleCredits)),
        el('div', { class: 'nav-row' },
          el('button', { class: 'btn small', onclick: () => this.show('career') }, '📊 Career'),
          el('button', { class: 'btn small', onclick: () => this.show('settings') }, '⚙ Settings'),
          el('button', { class: 'btn small', onclick: () => this.show('help') }, '? Help')),
        el('p', { class: 'foot' }, 'A single-player Subspace-style shooter · play vs AI'),
      ],
    });

    // ---------------- help ----------------
    this.help = screen('', {
      head: topbar('How to Play', () => this.show('title')),
      body: [el('div', { class: 'panel' },
        el('div', { class: 'help-grid', html: `
          <div><b>Move</b><span>Left thumb — drag to steer & thrust. Keyboard: <kbd>W/A/S/D</kbd> or arrows.</span></div>
          <div><b>Fire</b><span>Right buttons or <kbd>Space</kbd>. Hold to keep firing.</span></div>
          <div><b>Bomb</b><span>💣 button or <kbd>Shift</kbd>. Fire while still to drop a mine.</span></div>
          <div><b>Special</b><span>✦ Burst or Repel — <kbd>E</kbd> / <kbd>L</kbd>.</span></div>
          <div><b>Energy</b><span>Your bar is health <i>and</i> ammo. It recharges — don't bottom out.</span></div>
          <div><b>Greens</b><span>Fly near green prizes to upgrade guns, bombs, speed & more. Your magnet pulls them in.</span></div>
          <div><b>Scores</b><span>Hold <kbd>Tab</kbd> (or 🏆) for the scoreboard. <kbd>P</kbd> to pause.</span></div>
          <div><b>Hangar</b><span>Finished matches pay credits. Spend them in the Hangar on permanent upgrades (hull, guns, aim assist…). They stack, so the game gets easier the more you play.</span></div>
        ` }))],
      foot: [el('button', { class: 'btn primary wide', onclick: () => this.show('title') }, 'Got it')],
    });

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
    this.mode = screen('', {
      head: topbar('Select Mode', () => this.show('title')),
      body: [modeGrid],
    });

    // ---------------- ship select ----------------
    this.shipGrid = el('div', { class: 'cards ships' });
    this._buildShipCards();
    const diffWrap = el('div', { class: 'segment' });
    this.diffBtns = DIFFS.map(d => {
      const b = el('button', { class: 'seg' + (d === this.selDiff ? ' on' : ''), onclick: () => this._pickDiff(d) }, d.label);
      diffWrap.append(b); return b;
    });
    this.shipUpgLine = el('p', { class: 'upg-line' }, '');
    this.ship = screen('', {
      head: topbar('Select Ship', () => this.show('mode'),
        el('button', { class: 'icon-btn', 'aria-label': 'Hangar', onclick: () => this.show('hangar') }, '🛠')),
      body: [this.shipGrid],
      foot: [
        el('div', { class: 'diff-row' }, el('label', {}, 'AI Difficulty'), diffWrap),
        this.diffLine = el('p', { class: 'diff-line' }, diffText(this.selDiff)),
        this.shipUpgLine,
        el('button', { class: 'btn primary wide', onclick: () => this._launch() }, '🚀  LAUNCH'),
      ],
    });

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

    this.settingsScreen = screen('settings-screen', {
      head: topbar('Settings', () => this.show('title')),
      body: [el('div', { class: 'panel' },
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
      )],
    });

    // ---------------- career ----------------
    this.careerBody = el('div', { class: 'panel' });
    this.career = screen('career-screen', {
      head: topbar('Career', () => this.show('title')),
      body: [this.careerBody],
    });

    // ---------------- hangar ----------------
    this.hangarCredits = el('div', { class: 'cr-head' }, '');
    this.hangarList = el('div', { class: 'upg-list' });
    this.hangarFoot = el('div', { class: 'menu-btns row' });
    this.hangar = screen('hangar-screen', {
      head: topbar('Hangar', () => this._hangarBack()),
      body: [
        this.hangarCredits,
        el('p', { class: 'upg-hint' }, 'Permanent upgrades for every ship, and bots never get them. They stack, so the longer you play the easier it gets.'),
        this.hangarList,
        ...(LOCAL_DEBUG ? [this._debugPanel()] : []),
      ],
      foot: [this.hangarFoot],
    });

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
    this.resultsHead = el('div', { class: 'res-head' });
    this.resultsBody = el('div', { class: 'panel wide' });
    this.resultsFoot = el('div', { class: 'res-foot' });
    this.results = screen('overlay results-screen', {
      head: this.resultsHead, body: [this.resultsBody], foot: [this.resultsFoot],
    });

    // ---------------- in-game small buttons ----------------
    this.gameBtns = el('div', { class: 'game-btns' },
      el('button', { class: 'mini', onclick: () => this._igCb('pause') }, '⏸'),
      el('button', { class: 'mini', ontouchstart: () => this._igCb('scoresOn'), ontouchend: () => this._igCb('scoresOff'), onmousedown: () => this._igCb('scoresOn'), onmouseup: () => this._igCb('scoresOff') }, '🏆'),
    );
    this.gameBtns.style.display = 'none';

    this.ui.append(this.title, this.help, this.mode, this.ship, this.settingsScreen,
      this.career, this.hangar, this.pause, this.results, this.gameBtns);
  }

  get _screens() {
    return [this.title, this.help, this.mode, this.ship, this.settingsScreen,
      this.career, this.hangar, this.pause, this.results];
  }

  // ---------------- local debug (192.* only) ----------------
  _debugPanel() {
    const act = (fn) => () => { fn(); this._renderHangar(); this._refreshCredits(); };
    const zero = () => Object.fromEntries(UPGRADES.map(u => [u.key, 0]));
    const max = () => Object.fromEntries(UPGRADES.map(u => [u.key, HANGAR_MAX]));
    return el('div', { class: 'dbg-panel' },
      el('div', { class: 'dbg-title' }, 'DEBUG · local network only'),
      el('div', { class: 'dbg-btns' },
        el('button', { class: 'btn', onclick: act(() => setHangar({ credits: loadHangar().credits + 10000 })) }, '+10k ◈'),
        el('button', { class: 'btn', onclick: act(() => setHangar({ credits: loadHangar().credits + 100000 })) }, '+100k ◈'),
        el('button', { class: 'btn', onclick: act(() => setHangar({ levels: zero() })) }, 'Reset levels'),
        el('button', { class: 'btn', onclick: act(() => setHangar({ credits: 0 })) }, 'Zero credits'),
        el('button', { class: 'btn', onclick: act(() => setHangar({ levels: max() })) }, 'Max all')));
  }

  // ---------------- hangar screen ----------------
  _renderHangar() {
    const h = loadHangar();
    this.hangarCredits.innerHTML = '';
    this.hangarCredits.append(
      el('b', {}, '◈ ' + h.credits.toLocaleString()), el('span', {}, 'credits'),
      el('i', {}, `${upgradeCount(h)} / ${UPGRADES.length * HANGAR_MAX} upgrades`));
    this.hangarList.innerHTML = '';
    for (const u of UPGRADES) {
      const L = h.levels[u.key] || 0;
      const maxed = L >= HANGAR_MAX;
      const cost = maxed ? 0 : upgradeCost(u.key, L + 1);
      const can = !maxed && h.credits >= cost;
      const pips = el('div', { class: 'pips' });
      for (let i = 1; i <= HANGAR_MAX; i++) pips.append(el('i', { class: i <= L ? 'on' : '' }));
      this.hangarList.append(el('div', { class: 'upg' + (maxed ? ' maxed' : '') },
        el('div', { class: 'upg-ic' }, u.icon),
        el('div', { class: 'upg-main' },
          el('div', { class: 'upg-name' }, u.name, el('span', {}, ` L${L}/${HANGAR_MAX}`)),
          pips,
          el('div', { class: 'upg-eff' }, 'Now: ', el('b', {}, u.fmt(u.eff[L]))),
          maxed ? el('div', { class: 'upg-eff max' }, 'Maxed out')
            : el('div', { class: 'upg-eff next' }, 'Next: ', el('b', {}, u.fmt(u.eff[L + 1]))),
          el('div', { class: 'upg-blurb' }, u.blurb)),
        el('button', {
          class: 'btn buy' + (can ? ' primary' : ''), ...(can ? {} : { disabled: '' }),
          onclick: () => { if (buyUpgrade(u.key)) { this._renderHangar(); this._refreshCredits(); } },
        }, maxed ? 'MAX' : '◈ ' + cost),
      ));
    }
    this.hangarFoot.innerHTML = '';
    if (this.onHangarRematch) {
      this.hangarFoot.append(
        el('button', { class: 'btn primary', onclick: () => { const f = this.onHangarRematch; this.onHangarRematch = null; this.hideAll(); f(); } }, '↻ Rematch'),
        el('button', { class: 'btn', onclick: () => this._hangarBack() }, 'Main Menu'));
    } else {
      this.hangarFoot.append(
        el('button', { class: 'btn', onclick: () => this._hangarBack() }, '‹ Back'),
        el('button', { class: 'btn primary', onclick: () => this.show('mode') }, '▶ Play'));
    }
  }

  _hangarBack() { this.onHangarRematch = null; this.show(this._hangarFrom || 'title'); }

  /** Open the Hangar after a match; `rematch` restarts with the new upgrades. */
  showHangarAfterMatch(rematch) {
    this.onHangarRematch = rematch;
    this._hangarFrom = 'title';
    this.show('hangar');
  }

  _refreshCredits() {
    const h = loadHangar();
    this.titleCredits.textContent = '◈ ' + h.credits;
    const n = upgradeCount(h);
    this.shipUpgLine.textContent = n
      ? `Hangar: ${n}/${UPGRADES.length * HANGAR_MAX} upgrades active · ◈ ${h.credits} to spend`
      : `No upgrades yet · finish matches to earn credits for the Hangar`;
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
    this.diffLine.textContent = diffText(d);
  }
  _launch() {
    this.onSettings({ lastMode: this.selMode, lastShip: this.selShip, lastDiff: this.selDiff.key });
    this.hideAll();
    this.onStart(this.selMode, this.selShip, this.selDiff.skill);
  }

  show(name) {
    if (name === 'hangar' && !this.onHangarRematch) {
      const cur = ['title', 'ship', 'mode'].find(k => this[k === 'title' ? 'title' : k].classList.contains('active'));
      this._hangarFrom = cur || 'title';
    }
    this.hideAll();
    this._refreshCredits();
    if (name === 'career') this._renderCareer();
    if (name === 'hangar') this._renderHangar();
    const s = ({
      title: this.title, help: this.help, mode: this.mode, ship: this.ship,
      settings: this.settingsScreen, career: this.career, hangar: this.hangar,
    }[name]);
    if (s) { s.classList.add('active'); const b = s.querySelector('.sbody'); if (b) b.scrollTop = 0; }
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

    this.resultsHead.innerHTML = '';
    this.resultsHead.append(
      el('h2', { class: 'win' }, data.winner),
      el('p', { class: 'mode-name' }, data.modeName));
    this.resultsBody.append(
      table,
      t ? el('p', { class: 'career-line' },
        `Career · ${t.matches || 0} matches · ${t.wins || 0} won · ${t.kills || 0} kills · best streak ${t.bestStreak || 0}`) : null,
    );
    const h = loadHangar();
    this.resultsFoot.innerHTML = '';
    this.resultsFoot.append(
      el('div', { class: 'earn' },
        el('b', {}, `+${data.credits || 0} credits`),
        el('span', {}, ` · ◈ ${h.credits} to spend. Upgrades make every match easier.`)),
      el('div', { class: 'menu-btns row' },
        el('button', { class: 'btn primary', onclick: () => cb('hangar') }, '🛠 Upgrade'),
        el('button', { class: 'btn', onclick: () => cb('rematch') }, '↻ Rematch'),
        el('button', { class: 'btn', onclick: () => cb('menu') }, 'Menu')),
    );
    this.results.classList.add('active');
    const b = this.results.querySelector('.sbody'); if (b) b.scrollTop = 0;
  }
  hideResults() { this.results.classList.remove('active'); }
}
