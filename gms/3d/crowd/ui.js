'use strict';
/* ── ui.js ── UIManager: screens, HUD updates, toasts, overlays ── */

class UIManager {
  constructor() {
    // Cache for label last-rendered values (P3: skip innerHTML if unchanged)
    this._labelVals = {};
    // Pre-built ranking row elements for in-place updates (P4)
    this._rankRows  = [];
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  show(id) { document.getElementById(id)?.classList.remove('hidden'); }
  hide(id) { document.getElementById(id)?.classList.add('hidden'); }
  setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

  // ── Toast notifications ───────────────────────────────────────────────
  showToast(msg, type = 'info', duration = 2000) {
    const container = document.getElementById('toast-container');
    const div       = document.createElement('div');
    div.className   = `toast ${type}`;
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), duration + 350);
  }

  // ── HUD ──────────────────────────────────────────────────────────────
  updateHUD(crowdSize, enemyCount, timeLeft, targetCrowd, coins) {
    this.setText('hud-crowd-num',    crowdSize);
    this.setText('hud-enemy-num',    enemyCount);
    this.setText('hud-coins-ig-num', coins);

    const timerEl = document.getElementById('hud-timer');
    const pbWrap  = document.getElementById('progress-bar-wrap');

    if (!isFinite(timeLeft)) {
      // LMS mode — no timer, no progress bar
      this.setText('hud-timer-val', 'LMS');
      if (timerEl) timerEl.classList.remove('urgent');
      if (pbWrap)  pbWrap.style.display = 'none';
    } else {
      if (pbWrap) pbWrap.style.display = '';
      this.setText('progress-target', targetCrowd);
      const secs = Math.max(0, Math.ceil(timeLeft));
      const m    = Math.floor(secs / 60);
      const s    = secs % 60;
      this.setText('hud-timer-val', `${m}:${String(s).padStart(2, '0')}`);
      if (timerEl) {
        if (secs <= 15) timerEl.classList.add('urgent');
        else            timerEl.classList.remove('urgent');
      }
      const pct = Math.min(100, Math.round((crowdSize / targetCrowd) * 100));
      const fill = document.getElementById('progress-bar-fill');
      if (fill) fill.style.width = pct + '%';
    }
  }

  // ── Result screens ───────────────────────────────────────────────────
  showGameOver(stats) {
    this.setText('go-crowd',   stats.peakCrowd);
    this.setText('go-time',    Math.floor(stats.survived) + 's');
    this.setText('go-enemies', stats.enemiesAbsorbed);
    this.setText('go-coins',   stats.coinsEarned);
    this.show('gameover-screen');
  }

  showVictory(stats, levelIdx) {
    this.setText('vic-crowd',   stats.finalCrowd);
    this.setText('vic-enemies', stats.enemiesAbsorbed);
    this.setText('vic-coins',   stats.coinsEarned);

    let stars, timeDisplay;
    if (!isFinite(stats.totalTime) || stats.totalTime <= 1) {
      // LMS win — star based on enemies absorbed
      timeDisplay = Math.ceil(stats.survived || 0) + 's';
      stars = stats.enemiesAbsorbed >= 6 ? 3 : stats.enemiesAbsorbed >= 3 ? 2 : 1;
    } else {
      timeDisplay = Math.ceil(Math.max(0, stats.timeLeft)) + 's';
      stars = 1;
      if (stats.timeLeft / stats.totalTime > 0.5) stars = 2;
      if (stats.finalCrowd >= stats.targetCrowd)  stars = 3;
    }
    this.setText('vic-time', timeDisplay);
    this.setText('victory-stars', '⭐'.repeat(stars) + '☆'.repeat(3 - stars));

    const nextBtn = document.getElementById('btn-next-level');
    if (nextBtn) nextBtn.style.display = (levelIdx >= LEVELS.length - 1 || levelIdx < 0) ? 'none' : '';

    this.show('victory-screen');
  }

  // ── Level select screen ───────────────────────────────────────────────
  buildLevelScreen(levelStars, unlockedLevel, onSelect) {
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';

    LEVELS.forEach((lv, i) => {
      const locked = i >= unlockedLevel;
      const stars  = levelStars[i] || 0;

      const card = document.createElement('div');
      card.className = 'level-card' + (locked ? ' locked' : '');
      card.innerHTML = locked
        ? `<div class="level-num">${i + 1}</div>
           <div class="level-name">${lv.name}</div>
           <div class="level-lock">🔒</div>`
        : `<div class="level-num">${i + 1}</div>
           <div class="level-name">${lv.name}</div>
           <div class="level-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`;

      if (!locked) card.addEventListener('click', () => onSelect(i));
      grid.appendChild(card);
    });
  }

  // ── Upgrade shop screen ───────────────────────────────────────────────
  buildUpgradeScreen(saveData, onBuy) {
    this.setText('upgrade-coin-count', saveData.coins || 0);
    const list = document.getElementById('upgrades-list');
    list.innerHTML = '';

    UPGRADE_DEFS.forEach(def => {
      const level     = (saveData.upgrades && saveData.upgrades[def.id]) || 0;
      const maxed     = level >= def.maxLevel;
      const cost      = maxed ? null : def.costs[level];
      const canAfford = !maxed && (saveData.coins || 0) >= cost;

      const item = document.createElement('div');
      item.className = 'upgrade-item';
      item.innerHTML = `
        <div class="upgrade-icon">${def.icon}</div>
        <div class="upgrade-info">
          <div class="upgrade-name">
            ${def.name}
            <span style="color:var(--accent);font-size:0.78rem;margin-left:6px">Lv ${level}/${def.maxLevel}</span>
          </div>
          <div class="upgrade-desc">${def.desc}</div>
          <div class="upgrade-level-bar">
            ${Array.from({ length: def.maxLevel }, (_, j) =>
              `<div class="upgrade-pip${j < level ? ' filled' : ''}"></div>`
            ).join('')}
          </div>
        </div>
        <button
          class="btn ${canAfford ? 'btn-gold' : 'btn-secondary'} btn-sm upgrade-buy-btn"
          ${maxed || !canAfford ? 'disabled' : ''}
          data-id="${def.id}">
          ${maxed ? 'MAX' : `🪙 ${cost}`}
        </button>
      `;
      if (!maxed && canAfford) {
        item.querySelector('button').addEventListener('click', () => onBuy(def.id));
      }
      list.appendChild(item);
    });
  }

  // ── In-game upgrade prompt ────────────────────────────────────────────
  showIgUpgrade(onChoose) {
    const picks = [...IG_UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
    const cards = document.getElementById('ig-upgrade-cards');
    cards.innerHTML = '';

    picks.forEach(up => {
      const card = document.createElement('div');
      card.className = 'ig-card';
      card.innerHTML = `
        <div class="ig-card-icon">${up.icon}</div>
        <div class="ig-card-name">${up.name}</div>
        <div class="ig-card-desc">${up.desc}</div>
      `;
      card.addEventListener('click', () => onChoose(up.id), { once: true });
      cards.appendChild(card);
    });

    this.show('ig-upgrade-overlay');
  }

  // ── Menu coin display ────────────────────────────────────────────────
  refreshMenuCoins(coins) {
    this.setText('menu-coin-count', coins);
    this.setText('upgrade-coin-count', coins);
  }

  // ── LMS personal best display ─────────────────────────────────────────
  updateLmsBest(best) {
    const el = document.getElementById('lms-best-line');
    if (!el) return;
    if (best && (best.crowd > 0 || best.enemies > 0)) {
      el.textContent = `Best: ${best.enemies} eliminated · crowd ${best.crowd}`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  // ── Ranking panel (in-place update, P4) ──────────────────────────────
  // entities = [{name, size, color (hex int), isPlayer}]
  updateRanking(entities) {
    const sorted = [...entities].sort((a, b) => b.size - a.size);
    const list   = document.getElementById('ranking-list');
    if (!list) return;

    const count = Math.min(sorted.length, 9);

    // Create or reuse row elements
    while (this._rankRows.length < count) {
      const div = document.createElement('div');
      div.className = 'rank-entry';
      div.innerHTML = `<span class="rank-pos"></span><span class="rank-dot"></span><span class="rank-name"></span><span class="rank-size"></span>`;
      list.appendChild(div);
      this._rankRows.push(div);
    }
    // Hide excess rows
    for (let i = count; i < this._rankRows.length; i++) {
      this._rankRows[i].style.display = 'none';
    }

    for (let rank = 0; rank < count; rank++) {
      const ent = sorted[rank];
      const row = this._rankRows[rank];
      row.style.display = '';
      row.className = 'rank-entry' + (ent.isPlayer ? ' rank-player' : '');
      const colorStr = '#' + ent.color.toString(16).padStart(6, '0');
      row.querySelector('.rank-pos').textContent  = '#' + (rank + 1);
      row.querySelector('.rank-dot').style.background = colorStr;
      row.querySelector('.rank-name').textContent = ent.name;
      row.querySelector('.rank-size').textContent = ent.size;
    }
  }

  // Reset ranking rows when starting a new game
  clearRanking() {
    this._rankRows.forEach(r => r.remove());
    this._rankRows = [];
  }

  // ── Kill feed (LMS) ───────────────────────────────────────────────────
  showKillFeed(msg) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const div = document.createElement('div');
    div.className = 'kill-msg';
    div.textContent = msg;
    feed.appendChild(div);
    setTimeout(() => div.remove(), 3000);
  }

  clearKillFeed() {
    const feed = document.getElementById('kill-feed');
    if (feed) feed.innerHTML = '';
  }

  // ── Hit flash ─────────────────────────────────────────────────────────
  showHitFlash() {
    const el = document.getElementById('hit-flash');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('flash');
  }

  // ── Size labels (CSS overlay, P3: cache to skip redundant writes) ─────
  updateLabel(id, screenX, screenY, size, colorHex, visible) {
    const container = document.getElementById('label-container');
    if (!container) return;

    let el = document.getElementById('lbl-' + id);
    if (!el) {
      el           = document.createElement('div');
      el.className = 'entity-label';
      el.id        = 'lbl-' + id;
      container.appendChild(el);
      this._labelVals[id] = -1; // force first write
    }

    if (!visible) { el.style.display = 'none'; return; }

    el.style.display = 'flex';
    el.style.left    = Math.round(screenX) + 'px';
    el.style.top     = Math.round(screenY) + 'px';

    if (this._labelVals[id] !== size || !el.innerHTML) {
      this._labelVals[id] = size;
      const colorStr = '#' + colorHex.toString(16).padStart(6, '0');
      el.innerHTML = `<span class="label-dot" style="background:${colorStr}"></span>${size}`;
    }
  }

  removeLabel(id) {
    document.getElementById('lbl-' + id)?.remove();
    delete this._labelVals[id];
  }

  clearLabels() {
    const c = document.getElementById('label-container');
    if (c) c.innerHTML = '';
    this._labelVals = {};
  }
}
