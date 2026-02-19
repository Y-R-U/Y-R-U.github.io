// ============================================================
// LIFE IDLE - UI Module
// Renders panels, handles tabs, particles, toasts
// ============================================================

const UI = (() => {

  // ── Cached DOM refs ───────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Number formatting (proxy to Game) ────────────────────
  const fmt = n => Game.fmt(n);
  const fmtC = n => Game.fmtCurrency(n);

  // ── Header ────────────────────────────────────────────────
  function updateHeader() {
    const { state, derived } = Game;
    $('balance').textContent = fmtC(state.coins);
    $('income-rate').textContent = `+${fmtC(derived.incomePerSec)}/sec`;
    $('total-earned').textContent = `Total: ${fmtC(state.totalEarned)}`;
    $('click-power').textContent = `Tap: ${fmtC(derived.clickPower)}`;

    // Update character
    const stage = Game.getCharacterStage();
    const sprite = $('character-sprite');
    if (SPRITE.exists) {
      // Use spritesheet
      const col = 0; // character column
      const stageIdx = CHARACTER_STAGES.indexOf(stage);
      sprite.style.backgroundImage = `url(${SPRITE.path})`;
      sprite.style.backgroundPosition =
        `-${col * SPRITE.tileSize}px -${stageIdx * SPRITE.tileSize}px`;
      sprite.style.backgroundSize = `${SPRITE.cols * SPRITE.tileSize}px auto`;
      sprite.style.width = sprite.style.height = SPRITE.tileSize + 'px';
      sprite.textContent = '';
    } else {
      sprite.textContent = stage.emoji;
      sprite.style.backgroundImage = '';
    }

    // Update event timers in banner if active
    const now = Date.now();
    const events = Game.state.activeEvents;
    if (events.length > 0) {
      const ev = events[0];
      const remaining = Math.max(0, Math.ceil((ev.expiresAt - now) / 1000));
      $('active-event-label').textContent =
        `⚡ Boost active: ${ev.multiplier}× income — ${remaining}s remaining`;
      $('active-event-label').classList.remove('hidden');
    } else {
      $('active-event-label').classList.add('hidden');
    }
  }

  // ── Coin particle ─────────────────────────────────────────
  function spawnCoinParticle(x, y, label) {
    const el = document.createElement('div');
    el.className = 'coin-particle';
    el.textContent = label;
    // Position relative to click area
    const area = $('click-area');
    const rect = area.getBoundingClientRect();
    el.style.left = (x - rect.left) + 'px';
    el.style.top  = (y - rect.top) + 'px';
    area.appendChild(el);
    // Also spawn a small coin emoji
    const coin = document.createElement('div');
    coin.className = 'coin-emoji';
    coin.textContent = '🪙';
    coin.style.left = (x - rect.left + (Math.random() * 40 - 20)) + 'px';
    coin.style.top  = (y - rect.top) + 'px';
    area.appendChild(coin);
    setTimeout(() => { el.remove(); coin.remove(); }, 900);
  }

  // ── Toast notifications ───────────────────────────────────
  let toastTimer = null;
  function showToast(msg, type = 'info') {
    let toast = $('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  // ── Offline modal ─────────────────────────────────────────
  function showOfflineModal(amount, fmtFn) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">Welcome Back!</div>
        <div class="modal-body">
          <div class="modal-icon">💰</div>
          <p>While you were away your team kept working!</p>
          <div class="modal-amount">${fmtFn(amount)}</div>
          <p class="modal-sub">earned offline</p>
        </div>
        <button class="modal-btn" id="modal-close">Collect!</button>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-close').onclick = () => modal.remove();
  }

  // ── Sprite helper for icons ───────────────────────────────
  function iconEl(row, col, emoji) {
    if (SPRITE.exists) {
      const d = document.createElement('div');
      d.className = 'sprite-icon';
      d.style.backgroundImage = `url(${SPRITE.path})`;
      d.style.backgroundPosition = `-${col * SPRITE.tileSize}px -${row * SPRITE.tileSize}px`;
      d.style.backgroundSize = `${SPRITE.cols * SPRITE.tileSize}px auto`;
      return d;
    }
    const s = document.createElement('span');
    s.className = 'emoji-icon';
    s.textContent = emoji;
    return s;
  }

  // ── Tab switching ─────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`).classList.remove('hidden');
      });
    });
  }

  // ── Jobs panel ────────────────────────────────────────────
  function renderJobs() {
    const container = $('tab-work');
    container.innerHTML = '';

    const { state, derived } = Game;
    let anyVisible = false;

    for (const job of JOBS) {
      if (state.totalEarned < job.unlockAt) continue;
      anyVisible = true;

      const owned = state.jobs[job.id] || 0;
      const cost1 = Game.jobHireCost(job, 1);
      const cost10 = Game.jobBulkCost(job, 10);
      const incomeEach = job.incomePerWorker * (derived.jobMultipliers[job.id] || 1)
                         * derived.globalMultiplier;
      const canAfford1 = state.coins >= cost1;
      const canAfford10 = state.coins >= cost10;

      const card = document.createElement('div');
      card.className = 'card job-card' + (owned > 0 ? ' owned' : '');
      card.innerHTML = `
        <div class="card-icon"></div>
        <div class="card-info">
          <div class="card-name">${job.name}</div>
          <div class="card-desc">${job.description}</div>
          <div class="card-stats">
            <span class="stat-workers">👷 ${owned}</span>
            <span class="stat-income">+${Game.fmtCurrency(incomeEach)}/s each</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-hire btn-primary ${canAfford1 ? '' : 'disabled'}" data-job="${job.id}" data-count="1">
            Hire<br><small>${Game.fmtCurrency(cost1)}</small>
          </button>
          <button class="btn-hire btn-secondary ${canAfford10 ? '' : 'disabled'}" data-job="${job.id}" data-count="10">
            ×10<br><small>${Game.fmtCurrency(cost10)}</small>
          </button>
        </div>`;

      // Insert icon
      card.querySelector('.card-icon').appendChild(iconEl(job.spriteRow, job.spriteCol, job.emoji));

      // Hire buttons
      card.querySelectorAll('.btn-hire').forEach(btn => {
        const doHire = () => {
          const count = parseInt(btn.dataset.count);
          const result = Game.hireWorker(btn.dataset.job, count);
          if (!result) {
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 400);
          }
        };
        btn.addEventListener('click', doHire);
        // touchend: call action and prevent duplicate click from firing
        btn.addEventListener('touchend', e => { e.preventDefault(); doHire(); });
      });

      container.appendChild(card);
    }

    if (!anyVisible) {
      container.innerHTML = '<div class="empty-msg">🧹 Start tapping to earn your first coins!</div>';
    }
  }

  // ── Business panel ────────────────────────────────────────
  function renderBusinesses() {
    const container = $('tab-business');
    container.innerHTML = '';

    const { state, derived } = Game;
    let anyVisible = false;
    let lastTier = '';

    for (const biz of BUSINESSES) {
      if (state.totalEarned < biz.unlockAt) continue;
      anyVisible = true;

      const level = state.businesses[biz.id] || 0;
      const cost = Game.bizLevelCost(biz);
      const canAfford = state.coins >= cost;
      const maxed = level >= biz.maxLevel;
      const incomeNow = level === 0 ? biz.baseIncome
        : biz.baseIncome * Math.pow(biz.incomeGrowth, level - 1)
          * (derived.bizMultipliers[biz.id] || 1)
          * derived.globalMultiplier;

      // Tier header
      if (biz.tier !== lastTier) {
        const tierEl = document.createElement('div');
        tierEl.className = 'tier-header';
        tierEl.textContent = `— ${biz.tier} Businesses —`;
        container.appendChild(tierEl);
        lastTier = biz.tier;
      }

      const card = document.createElement('div');
      card.className = 'card biz-card' + (level > 0 ? ' owned' : '');
      card.innerHTML = `
        <div class="card-icon"></div>
        <div class="card-info">
          <div class="card-name">${biz.name}
            ${level > 0 ? `<span class="level-badge">Lv.${level}</span>` : ''}
            ${maxed ? `<span class="maxed-badge">MAX</span>` : ''}
          </div>
          <div class="card-desc">${biz.description}</div>
          <div class="card-stats">
            ${level > 0 ? `<span class="stat-income">+${Game.fmtCurrency(incomeNow)}/s</span>` : ''}
            ${!maxed ? `<span class="stat-next">${level === 0 ? 'Build' : 'Upgrade'}: ${Game.fmtCurrency(cost)}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">
          ${maxed
            ? `<button class="btn-maxed" disabled>MAXED</button>`
            : `<button class="btn-buy btn-primary ${canAfford ? '' : 'disabled'}" data-biz="${biz.id}">
                ${level === 0 ? 'Build' : 'Level Up'}<br>
                <small>${Game.fmtCurrency(cost)}</small>
              </button>`
          }
        </div>`;

      card.querySelector('.card-icon').appendChild(iconEl(biz.spriteRow, biz.spriteCol, biz.emoji));

      if (!maxed) {
        card.querySelector('.btn-buy').addEventListener('click', () => {
          const result = Game.levelUpBusiness(biz.id);
          if (!result) {
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 400);
          }
        });
      }

      container.appendChild(card);
    }

    if (!anyVisible) {
      container.innerHTML = `<div class="empty-msg">🏗️ Keep earning to unlock businesses!<br><small>First unlocks at ${Game.fmtCurrency(BUSINESSES[0].unlockAt)} total earned</small></div>`;
    }
  }

  // ── Upgrades panel ────────────────────────────────────────
  function renderUpgrades() {
    const container = $('tab-upgrades');
    container.innerHTML = '';

    const { state } = Game;
    const available = UPGRADES.filter(u =>
      !state.upgrades.has(u.id) && state.totalEarned >= u.unlockAt
    );
    const owned = UPGRADES.filter(u => state.upgrades.has(u.id));

    if (available.length === 0 && owned.length === 0) {
      container.innerHTML = `<div class="empty-msg">⬆️ Upgrades unlock as you earn more.<br><small>Keep tapping!</small></div>`;
      return;
    }

    if (available.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'tier-header';
      hdr.textContent = '— Available —';
      container.appendChild(hdr);

      for (const upg of available) {
        const canAfford = state.coins >= upg.cost;
        const card = document.createElement('div');
        card.className = 'card upg-card';
        card.innerHTML = `
          <div class="upg-icon">${upg.emoji}</div>
          <div class="card-info">
            <div class="card-name">${upg.name}</div>
            <div class="card-desc">${upg.description}</div>
          </div>
          <div class="card-actions">
            <button class="btn-buy btn-primary ${canAfford ? '' : 'disabled'}" data-upg="${upg.id}">
              Buy<br><small>${Game.fmtCurrency(upg.cost)}</small>
            </button>
          </div>`;
        card.querySelector('.btn-buy').addEventListener('click', () => {
          Game.purchaseUpgrade(upg.id);
        });
        container.appendChild(card);
      }
    }

    if (owned.length > 0) {
      const hdr = document.createElement('div');
      hdr.className = 'tier-header owned-hdr';
      hdr.textContent = `— Owned (${owned.length}) —`;
      container.appendChild(hdr);

      for (const upg of owned) {
        const card = document.createElement('div');
        card.className = 'card upg-card upg-owned';
        card.innerHTML = `
          <div class="upg-icon">${upg.emoji}</div>
          <div class="card-info">
            <div class="card-name">${upg.name} ✓</div>
            <div class="card-desc">${upg.description}</div>
          </div>`;
        container.appendChild(card);
      }
    }
  }

  // ── Stats panel ───────────────────────────────────────────
  function renderStats() {
    const container = $('tab-stats');
    const { state, derived } = Game;
    const stage = Game.getCharacterStage();

    const totalWorkers = JOBS.reduce((s, j) => s + (state.jobs[j.id] || 0), 0);
    const totalBiz = BUSINESSES.filter(b => (state.businesses[b.id] || 0) > 0).length;

    container.innerHTML = `
      <div class="stats-card">
        <div class="stats-title">📊 Your Empire</div>
        <div class="stats-grid">
          <div class="stat-row"><span>Status</span><span>${stage.label}</span></div>
          <div class="stat-row"><span>Balance</span><span>${Game.fmtCurrency(state.coins)}</span></div>
          <div class="stat-row"><span>Total Earned</span><span>${Game.fmtCurrency(state.totalEarned)}</span></div>
          <div class="stat-row"><span>Income /sec</span><span>${Game.fmtCurrency(derived.incomePerSec)}</span></div>
          <div class="stat-row"><span>Tap Power</span><span>${Game.fmtCurrency(derived.clickPower)}</span></div>
          <div class="stat-row"><span>Workers Hired</span><span>${totalWorkers}</span></div>
          <div class="stat-row"><span>Businesses Owned</span><span>${totalBiz}</span></div>
          <div class="stat-row"><span>Upgrades</span><span>${state.upgrades.size} / ${UPGRADES.length}</span></div>
          <div class="stat-row"><span>Global Multiplier</span><span>${derived.globalMultiplier}×</span></div>
        </div>
        <div class="stats-workforce">
          <div class="stats-title" style="margin-top:16px">👷 Workforce</div>
          ${JOBS.filter(j => (state.jobs[j.id] || 0) > 0)
            .map(j => `<div class="stat-row"><span>${j.emoji} ${j.name}</span><span>${state.jobs[j.id]}</span></div>`)
            .join('') || '<div class="stat-row muted"><span>No workers yet</span></div>'}
        </div>
        <button class="btn-reset" id="btn-reset">🗑️ Reset Game</button>
      </div>`;

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone!')) Game.reset();
    });
  }

  // ── Full render ───────────────────────────────────────────
  function render() {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'work';
    switch (activeTab) {
      case 'work':     renderJobs(); break;
      case 'business': renderBusinesses(); break;
      case 'upgrades': renderUpgrades(); break;
      case 'stats':    renderStats(); break;
    }
    updateHeader();
  }

  // Render current tab when switching
  function initTabRender() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => render());
    });
  }

  return {
    updateHeader, spawnCoinParticle, showToast,
    showOfflineModal, render,
    init() { initTabs(); initTabRender(); }
  };
})();
