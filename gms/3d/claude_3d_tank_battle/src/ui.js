// UI: HUD updates, leaderboard, popups (rename, victory, defeat), kill feed, toasts.

const NAME_KEY = 'tankbattle.playerName';
const NAME_MAX = 14;

export class UI {
  constructor() {
    this.$titleScreen = document.getElementById('title-screen');
    this.$titlePlayerName = document.getElementById('title-player-name');
    this.$playerInfo = document.getElementById('player-info');
    this.$playerName = document.getElementById('player-name');
    this.$playerKills = document.getElementById('player-kills');
    this.$playerPlace = document.getElementById('player-place');
    this.$hpFill = document.getElementById('hp-fill');
    this.$leaderboard = document.getElementById('leaderboard');
    this.$lbAlive = document.getElementById('lb-alive');
    this.$lbList = document.getElementById('lb-list');
    this.$banner = document.getElementById('banner');
    this.$bannerText = document.getElementById('banner-text');
    this.$crosshair = document.getElementById('crosshair');
    this.$tagLayer = document.getElementById('tag-layer');
    this.$hitFlash = document.getElementById('hit-flash');
    this.$popupRoot = document.getElementById('popup-root');
    this.$btnRename = document.getElementById('btn-rename');
    this.$btnTitleRename = document.getElementById('btn-title-rename');
    this.$btnPlay = document.getElementById('btn-play');
    this.$btnHelp = document.getElementById('btn-help');
    this.$helpBox = document.getElementById('help-box');
    this.$touchLeft = document.getElementById('touch-left');
    this.$touchFire = document.getElementById('touch-fire');

    this._killFeed = this._ensureContainer('kill-feed');
    this._toastRoot = this._ensureContainer('toast-root');

    // Player name (persisted)
    this.playerName = localStorage.getItem(NAME_KEY) || generateRandomPlayerName();
    if (!localStorage.getItem(NAME_KEY)) localStorage.setItem(NAME_KEY, this.playerName);
    this._refreshNameDisplay();

    // Wire common buttons
    this.$btnRename.addEventListener('click', () => this.openRename());
    this.$btnTitleRename.addEventListener('click', () => this.openRename());
    this.$btnHelp.addEventListener('click', () => this.$helpBox.classList.toggle('hidden'));

    // Match callbacks set by game.js
    this.onPlay = null;
    this.onMatchStartCallback = null;
  }

  _ensureContainer(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    return el;
  }

  setOnPlay(fn) { this.onPlay = fn; }

  showTitle() {
    this.$titleScreen.classList.remove('hidden');
    this.$playerInfo.classList.add('hidden');
    this.$leaderboard.classList.add('hidden');
    this.$crosshair.classList.add('hidden');
    this.$tagLayer.classList.add('hidden');
    this.$touchLeft.classList.add('hidden');
    this.$touchFire.classList.add('hidden');
    if (this.minimap) this.minimap.hide();
  }
  hideTitle() {
    this.$titleScreen.classList.add('hidden');
  }

  // Called by Battle when match begins
  onMatchStart(battle) {
    this.battle = battle;
    this.hideTitle();
    this.closePopups();
    this.$playerInfo.classList.remove('hidden');
    this.$leaderboard.classList.remove('hidden');
    this.$tagLayer.classList.remove('hidden');
    if (this.minimap) {
      this.minimap.setBattle(battle);
      this.minimap.show();
    }
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      this.$touchLeft.classList.remove('hidden');
      this.$touchFire.classList.remove('hidden');
      this.$crosshair.classList.add('hidden');
    } else {
      this.$crosshair.classList.remove('hidden');
    }
    this._killFeed.innerHTML = '';
    this._toastRoot.innerHTML = '';
    this.showBanner('FIGHT');
    this._refreshHUD();
    this._refreshLeaderboard();
  }

  // Called by Battle each frame (or after damage events) to keep HUD in sync.
  tick() {
    if (!this.battle) return;
    this._refreshHUD();
    this._refreshLeaderboard();
    // Crosshair cooldown indicator (desktop only — touch hides crosshair)
    const p = this.battle.player;
    if (p && p.alive && !this.$crosshair.classList.contains('hidden')) {
      const onCd = p.fireCooldown > 0.05;
      this.$crosshair.classList.toggle('cooldown', onCd);
    }
  }

  _refreshHUD() {
    const p = this.battle.player;
    if (!p) return;
    const pct = Math.max(0, p.health / p.maxHealth);
    this.$hpFill.style.width = (pct * 100) + '%';
    this.$hpFill.classList.toggle('mid', pct <= 0.6 && pct > 0.3);
    this.$hpFill.classList.toggle('low', pct <= 0.3);
    this.$playerKills.textContent = p.kills;
    if (p.alive) {
      const aliveCount = this.battle.aliveTanks().length;
      this.$playerPlace.textContent = `Top ${aliveCount}`;
    } else {
      this.$playerPlace.textContent = `#${p.placement}`;
    }
  }

  _refreshLeaderboard() {
    const tanks = this.battle.rankedTanks();
    const aliveCount = this.battle.aliveTanks().length;
    this.$lbAlive.textContent = aliveCount;
    this.$lbList.innerHTML = '';
    for (const t of tanks) {
      const li = document.createElement('li');
      li.className = 'lb-row';
      if (t.isPlayer) li.classList.add('is-player');
      if (!t.alive) li.classList.add('is-dead');
      const dot = document.createElement('span');
      dot.className = 'lb-dot';
      dot.style.background = t.color.tag;
      dot.style.color = t.color.tag;
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = t.name;
      const kills = document.createElement('span');
      kills.className = 'lb-kills';
      kills.textContent = `${t.kills}K`;
      li.append(dot, name, kills);
      this.$lbList.appendChild(li);
    }
  }

  // Called when any tank dies
  onTankDeath(victim, killer, battle) {
    this._addKillFeed(victim, killer);
    this._refreshHUD();
    this._refreshLeaderboard();
    if (victim.isPlayer) this.flashHit();
  }

  _addKillFeed(victim, killer) {
    const item = document.createElement('div');
    item.className = 'kill-feed-item';
    if (killer && killer.isPlayer) item.classList.add('is-player-killer');
    if (victim.isPlayer) item.classList.add('is-player-victim');

    const killerSpan = document.createElement('span');
    killerSpan.className = 'kf-name';
    killerSpan.style.color = killer ? killer.color.tag : '#88a4c4';
    killerSpan.textContent = killer ? killer.name : 'The void';

    const arrow = document.createElement('span');
    arrow.className = 'kf-arrow';
    arrow.textContent = '→';

    const victimSpan = document.createElement('span');
    victimSpan.className = 'kf-name';
    victimSpan.style.color = victim.color.tag;
    victimSpan.textContent = victim.name;

    item.append(killerSpan, arrow, victimSpan);
    this._killFeed.appendChild(item);
    setTimeout(() => item.remove(), 4600);
  }

  // Called when match ends. won = true if player won.
  onMatchEnd(won, battle) {
    this._refreshHUD();
    this._refreshLeaderboard();
    setTimeout(() => this._showEndPopup(won, battle), 700);
  }

  _showEndPopup(won, battle) {
    const p = battle.player;
    const place = p ? p.placement : battle.tanks.length;
    const killer = p?.lastKilledBy;
    const killerLabel = killer
      ? `${killer.name}${killer.personality ? ' <span class="muted">[' + killer.personality.label + ']</span>' : ''}`
      : '—';
    const card = document.createElement('div');
    card.className = 'popup-card ' + (won ? 'is-victory' : 'is-defeat');
    card.innerHTML = `
      <h2>${won ? '🏆 VICTORY' : 'DEFEATED'}</h2>
      <div class="popup-sub">${won ? 'Last tank rolling.' : `Place #${place} of ${battle.tanks.length}`}</div>
      <div class="stats">
        <div class="stat-row"><span>Kills</span><span>${p ? p.kills : 0}</span></div>
        <div class="stat-row"><span>Place</span><span>#${place}</span></div>
        ${won ? '' : `<div class="stat-row"><span>Killed by</span><span>${killerLabel}</span></div>`}
        <div class="stat-row"><span>Survivors</span><span>${battle.aliveTanks().length}</span></div>
      </div>
      <div class="popup-actions">
        <button class="btn-primary" data-action="play-again">PLAY AGAIN</button>
        <button class="btn-secondary" data-action="menu">MAIN MENU</button>
      </div>
    `;
    this._showPopup(card);
    card.querySelector('[data-action="play-again"]').addEventListener('click', () => {
      this.closePopups();
      this.onPlay && this.onPlay();
    });
    card.querySelector('[data-action="menu"]').addEventListener('click', () => {
      this.closePopups();
      battle.cleanup();
      this.showTitle();
    });
  }

  // ── Rename popup ──
  openRename() {
    const card = document.createElement('div');
    card.className = 'popup-card';
    card.innerHTML = `
      <h2>YOUR NAME</h2>
      <div class="popup-sub">Tag shown above your tank</div>
      <input type="text" class="popup-input" maxlength="${NAME_MAX}" />
      <div class="popup-actions">
        <button class="btn-primary" data-action="save">SAVE</button>
        <button class="btn-secondary" data-action="cancel">CANCEL</button>
        <button class="btn-secondary" data-action="random">RANDOM</button>
      </div>
    `;
    this._showPopup(card);
    const input = card.querySelector('input');
    input.value = this.playerName;
    setTimeout(() => { input.focus(); input.select(); }, 30);

    const save = () => {
      const v = input.value.trim().slice(0, NAME_MAX) || generateRandomPlayerName();
      this.setPlayerName(v);
      this.closePopups();
      this.toast(`Now playing as ${v}`);
    };
    card.querySelector('[data-action="save"]').addEventListener('click', save);
    card.querySelector('[data-action="cancel"]').addEventListener('click', () => this.closePopups());
    card.querySelector('[data-action="random"]').addEventListener('click', () => {
      input.value = generateRandomPlayerName();
      input.focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') this.closePopups();
    });
  }

  setPlayerName(n) {
    this.playerName = n;
    localStorage.setItem(NAME_KEY, n);
    this._refreshNameDisplay();
    // Live update during match
    if (this.battle && this.battle.player) {
      this.battle.player.name = n;
      // Refresh tag if mounted
      if (this.battle.nameTags) {
        const rec = this.battle.nameTags.tags.get(this.battle.player);
        if (rec) {
          rec.name.textContent = n.toUpperCase();
          const w = Math.max(76, 24 + n.length * 9);
          rec.el.style.setProperty('--tag-w', `${w}px`);
        }
      }
      this._refreshLeaderboard();
    }
  }

  _refreshNameDisplay() {
    this.$playerName.textContent = this.playerName;
    this.$titlePlayerName.textContent = this.playerName;
  }

  // ── Banner / hit flash / toasts ──
  showBanner(text) {
    this.$bannerText.textContent = text;
    this.$banner.classList.remove('hidden');
    this.$bannerText.style.animation = 'none';
    void this.$bannerText.offsetWidth;
    this.$bannerText.style.animation = '';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.$banner.classList.add('hidden'), 2100);
  }
  flashHit() {
    this.$hitFlash.classList.remove('hidden');
    this.$hitFlash.style.animation = 'none';
    void this.$hitFlash.offsetWidth;
    this.$hitFlash.style.animation = '';
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => this.$hitFlash.classList.add('hidden'), 500);
  }

  // Show a chevron pointing toward the attacker, briefly.
  showDamageDirection(attacker) {
    if (!attacker || !this.battle || !this.battle.player) return;
    const me = this.battle.player.root.position;
    const yawTo = Math.atan2(
      attacker.root.position.x - me.x,
      attacker.root.position.z - me.z
    );
    // Convert world yaw → screen-relative angle (camera looks +Z).
    // Player tank's body yaw isn't relevant — camera is fixed-axis. So angle
    // 0 = north (top of screen, away from camera).
    const angleDeg = (yawTo * 180 / Math.PI) - 90; // CSS rotate has 0 = right
    if (!this._dmgDir) {
      this._dmgDir = document.createElement('div');
      this._dmgDir.className = 'damage-arc';
      document.body.appendChild(this._dmgDir);
    }
    this._dmgDir.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
    this._dmgDir.classList.remove('show');
    void this._dmgDir.offsetWidth;
    this._dmgDir.classList.add('show');
    clearTimeout(this._dmgDirT);
    this._dmgDirT = setTimeout(() => this._dmgDir.classList.remove('show'), 900);
  }
  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this._toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 2900);
  }

  // ── Popup helper ──
  _showPopup(card) {
    this.$popupRoot.innerHTML = '';
    this.$popupRoot.appendChild(card);
    this.$popupRoot.classList.remove('hidden');
  }
  closePopups() {
    this.$popupRoot.classList.add('hidden');
    this.$popupRoot.innerHTML = '';
  }
}

const FIRST = ['Iron', 'Steel', 'Storm', 'Ash', 'Wolf', 'Eagle', 'Frost', 'Coal',
               'Bronze', 'Cinder', 'Onyx', 'Sky', 'Echo', 'Lone', 'Crimson'];
const LAST  = ['Rider', 'Bear', 'Wing', 'Dancer', 'Howl', 'Strike', 'Forge',
               'Sentinel', 'Drifter', 'Specter', 'Vanguard', 'Hammer'];
function generateRandomPlayerName() {
  return FIRST[Math.floor(Math.random() * FIRST.length)] +
         LAST[Math.floor(Math.random() * LAST.length)];
}
