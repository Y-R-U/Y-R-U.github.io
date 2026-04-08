'use strict';
/* ── ui.js ── UIManager: screens, HUD updates, toasts, overlays ── */

class UIManager {
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

    const timerPill = document.getElementById('hud-timer');
    const pbWrap    = document.getElementById('progress-bar-wrap');

    if (!isFinite(timeLeft)) {
      // LMS mode — no timer, no progress bar
      this.setText('hud-timer-val', 'LMS');
      timerPill.classList.remove('urgent');
      if (pbWrap) pbWrap.style.visibility = 'hidden';
    } else {
      if (pbWrap) pbWrap.style.visibility = '';
      this.setText('progress-target', targetCrowd);
      const secs = Math.max(0, Math.ceil(timeLeft));
      const m    = Math.floor(secs / 60);
      const s    = secs % 60;
      this.setText('hud-timer-val', `${m}:${String(s).padStart(2, '0')}`);
      if (secs <= 15) timerPill.classList.add('urgent');
      else            timerPill.classList.remove('urgent');
      const pct = Math.min(100, Math.round((crowdSize / targetCrowd) * 100));
      document.getElementById('progress-bar-fill').style.width = pct + '%';
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
    this.setText('vic-time',    Math.ceil(Math.max(0, stats.timeLeft)) + 's');
    this.setText('vic-enemies', stats.enemiesAbsorbed);
    this.setText('vic-coins',   stats.coinsEarned);

    // Star rating
    let stars = 1;
    if (stats.timeLeft / stats.totalTime > 0.5)   stars = 2;
    if (stats.finalCrowd >= stats.targetCrowd)     stars = 3;
    this.setText('victory-stars', '⭐'.repeat(stars) + '☆'.repeat(3 - stars));

    // Hide "Next Level" on last level
    const nextBtn = document.getElementById('btn-next-level');
    nextBtn.style.display = levelIdx >= LEVELS.length - 1 ? 'none' : '';

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

  // ── Ranking panel ────────────────────────────────────────────────────
  // entities = [{name, size, color (hex int), isPlayer}]
  updateRanking(entities) {
    const sorted = [...entities].sort((a, b) => b.size - a.size);
    const list   = document.getElementById('ranking-list');
    if (!list) return;
    list.innerHTML = '';
    sorted.slice(0, 9).forEach((ent, rank) => {
      const div       = document.createElement('div');
      div.className   = 'rank-entry' + (ent.isPlayer ? ' rank-player' : '');
      const colorStr  = '#' + ent.color.toString(16).padStart(6, '0');
      div.innerHTML   = `
        <span class="rank-pos">#${rank + 1}</span>
        <span class="rank-dot" style="background:${colorStr}"></span>
        <span class="rank-name">${ent.name}</span>
        <span class="rank-size">${ent.size}</span>
      `;
      list.appendChild(div);
    });
  }

  // ── Size labels (CSS overlay) ─────────────────────────────────────────
  // Call once per entity per frame with projected screen position
  updateLabel(id, screenX, screenY, size, colorHex, visible) {
    const container = document.getElementById('label-container');
    if (!container) return;

    let el = document.getElementById('lbl-' + id);
    if (!el) {
      el              = document.createElement('div');
      el.className    = 'entity-label';
      el.id           = 'lbl-' + id;
      container.appendChild(el);
    }

    if (!visible) { el.style.display = 'none'; return; }

    const colorStr  = '#' + colorHex.toString(16).padStart(6, '0');
    el.style.display = 'flex';
    el.style.left    = screenX + 'px';
    el.style.top     = screenY + 'px';
    el.innerHTML     = `<span class="label-dot" style="background:${colorStr}"></span>${size}`;
  }

  removeLabel(id) {
    document.getElementById('lbl-' + id)?.remove();
  }

  clearLabels() {
    const c = document.getElementById('label-container');
    if (c) c.innerHTML = '';
  }
}
