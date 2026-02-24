// ============================================================
// LIFE IDLE - UI Module  v2.0
// Renders panels, handles tabs, particles, toasts
// ============================================================

const UI = (() => {

  const $ = id => document.getElementById(id);
  const fmt  = n => Game.fmt(n);
  const fmtC = n => Game.fmtCurrency(n);

  // ── Header ────────────────────────────────────────────────
  let _lastClickPower = -1;
  function updateHeader() {
    const { state, derived } = Game;
    $('balance').textContent    = fmtC(state.coins);
    $('income-rate').textContent = `+${fmtC(derived.incomePerSec)}/sec`;
    $('total-earned').textContent = `Total: ${fmtC(state.totalEarned)}`;

    const cpEl = $('click-power');
    const newCp = derived.clickPower;
    cpEl.textContent = `Tap: ${fmtC(newCp)}`;
    if (_lastClickPower >= 0 && Math.abs(newCp - _lastClickPower) > 0.01) {
      cpEl.classList.remove('tap-flash');
      void cpEl.offsetWidth;
      cpEl.classList.add('tap-flash');
    }
    _lastClickPower = newCp;

    // Character
    const stage  = Game.getCharacterStage();
    const sprite = $('character-sprite');
    if (SPRITE.exists) {
      const stageIdx = CHARACTER_STAGES.indexOf(stage);
      sprite.style.backgroundImage    = `url(${SPRITE.path})`;
      sprite.style.backgroundPosition = `-${0}px -${stageIdx * SPRITE.tileSize}px`;
      sprite.style.backgroundSize     = `${SPRITE.cols * SPRITE.tileSize}px auto`;
      sprite.style.width = sprite.style.height = SPRITE.tileSize + 'px';
      sprite.textContent = '';
    } else {
      sprite.textContent = stage.emoji;
      sprite.style.backgroundImage = '';
    }

    // Prestige badge in header
    const badge = $('prestige-badge');
    if (badge) {
      if (state.totalEarned >= PRESTIGE_CONFIG.unlockAt) {
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Prestige multiplier in mini-stats
    const pmEl = $('prestige-mult');
    if (pmEl && state.prestigePoints > 0) {
      pmEl.textContent = `✨ ${PRESTIGE_CONFIG.calcMultiplier(state.prestigePoints).toFixed(1)}×`;
      pmEl.classList.remove('hidden');
    } else if (pmEl) {
      pmEl.classList.add('hidden');
    }

    // Active event countdown
    const events = state.activeEvents;
    if (events.length > 0) {
      const now  = Date.now();
      const ev   = events[0];
      const rem  = Math.max(0, Math.ceil((ev.expiresAt - now) / 1000));
      $('active-event-label').textContent =
        `⚡ Boost active: ${ev.multiplier}× — ${rem}s remaining`;
      $('active-event-label').classList.remove('hidden');
    } else {
      $('active-event-label').classList.add('hidden');
    }
  }

  // ── Coin particle ─────────────────────────────────────────
  function spawnCoinParticle(x, y, label) {
    const area = $('click-area');
    const rect = area.getBoundingClientRect();

    const el = document.createElement('div');
    el.className = 'coin-particle';
    el.textContent = label;
    el.style.left = (x - rect.left) + 'px';
    el.style.top  = (y - rect.top)  + 'px';
    area.appendChild(el);

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
        <button type="button" class="modal-btn" id="modal-close">Collect!</button>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-close').onclick = () => modal.remove();
  }

  // ── Sprite helper ─────────────────────────────────────────
  function iconEl(row, col, emoji) {
    if (SPRITE.exists) {
      const d = document.createElement('div');
      d.className = 'sprite-icon';
      d.style.backgroundImage    = `url(${SPRITE.path})`;
      d.style.backgroundPosition = `-${col * SPRITE.tileSize}px -${row * SPRITE.tileSize}px`;
      d.style.backgroundSize     = `${SPRITE.cols * SPRITE.tileSize}px auto`;
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
        render();
      });
    });
  }

  // ── Event delegation helpers ──────────────────────────────
  let _lastActionMs = 0;

  function delegatedHire(btn) {
    const now = Date.now();
    if (now - _lastActionMs < 100) return;
    _lastActionMs = now;
    const jobId = btn.dataset.job;
    const count = parseInt(btn.dataset.count, 10);
    const job   = JOBS.find(j => j.id === jobId);
    if (!job) return;
    if (Game.hireWorker(jobId, count)) {
      const label = count > 1 ? `${count}× ${job.name}` : job.name;
      showToast(`Hired ${label}! ${job.emoji}`, 'gold');
    } else {
      const cost = Game.jobBulkCost(job, count);
      const diff = cost - Game.state.coins;
      showToast(`Need ${fmtC(diff)} more to hire ${job.name}`, 'info');
      btn.classList.add('shake');
      setTimeout(() => btn.classList.remove('shake'), 400);
    }
  }

  function delegatedBiz(btn) {
    const now = Date.now();
    if (now - _lastActionMs < 100) return;
    _lastActionMs = now;
    const bizId = btn.dataset.biz;
    const biz   = BUSINESSES.find(b => b.id === bizId);
    if (!biz) return;
    if (Game.levelUpBusiness(bizId)) {
      const lvl = Game.state.businesses[bizId];
      showToast(`${biz.name} ${lvl === 1 ? 'built' : `upgraded to Lv.${lvl}`}! ${biz.emoji}`, 'gold');
    } else {
      const cost = Game.bizLevelCost(biz);
      const diff = cost - Game.state.coins;
      showToast(`Need ${fmtC(diff)} more for ${biz.name}`, 'info');
    }
  }

  function delegatedUpgrade(btn) {
    const now = Date.now();
    if (now - _lastActionMs < 100) return;
    _lastActionMs = now;
    const upgId = btn.dataset.upg;
    const upg   = UPGRADES.find(u => u.id === upgId);
    if (!upg) return;
    if (Game.purchaseUpgrade(upgId)) {
      showToast(`${upg.emoji} ${upg.name} purchased!`, 'gold');
    } else {
      const diff = upg.cost - Game.state.coins;
      showToast(`Need ${fmtC(diff)} more for ${upg.name}`, 'info');
    }
  }

  function initPanelDelegates() {
    function attachDelegate(containerId, selector, action) {
      const container = $(containerId);
      if (!container) return;
      container.addEventListener('click', e => {
        const btn = e.target.closest(selector);
        if (btn) action(btn);
      });
      container.addEventListener('touchend', e => {
        const btn = e.target.closest(selector);
        if (btn) { e.preventDefault(); action(btn); }
      });
    }
    attachDelegate('tab-work',     '.btn-hire',          delegatedHire);
    attachDelegate('tab-business', '.btn-buy[data-biz]', delegatedBiz);
    attachDelegate('tab-upgrades', '.btn-buy[data-upg]', delegatedUpgrade);
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
      const owned      = state.jobs[job.id] || 0;
      const cost1      = Game.jobHireCost(job, 1);
      const cost10     = Game.jobBulkCost(job, 10);
      const incomeEach = job.incomePerWorker
        * (derived.jobMultipliers[job.id] || 1)
        * derived.globalMultiplier;
      const canAfford1  = state.coins >= cost1;
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
            <span class="stat-income">+${fmtC(incomeEach)}/s each</span>
          </div>
        </div>
        <div class="card-actions">
          <button type="button"
            class="btn-hire btn-primary ${canAfford1 ? 'affordable' : 'unaffordable'}"
            data-job="${job.id}" data-count="1">
            Hire<br><small>${fmtC(cost1)}</small>
          </button>
          <button type="button"
            class="btn-hire btn-secondary ${canAfford10 ? 'affordable' : 'unaffordable'}"
            data-job="${job.id}" data-count="10">
            ×10<br><small>${fmtC(cost10)}</small>
          </button>
        </div>`;
      card.querySelector('.card-icon').appendChild(
        iconEl(job.spriteRow, job.spriteCol, job.emoji)
      );
      container.appendChild(card);
    }

    if (!anyVisible) {
      container.innerHTML =
        '<div class="empty-msg">🧹 Start tapping to earn your first coins!</div>';
    }
  }

  // ── Business panel ────────────────────────────────────────
  function renderBusinesses() {
    const container = $('tab-business');
    container.innerHTML = '';
    const { state, derived } = Game;
    let anyVisible = false;
    let lastTier   = '';

    for (const biz of BUSINESSES) {
      if (state.totalEarned < biz.unlockAt) continue;
      anyVisible = true;
      const level     = state.businesses[biz.id] || 0;
      const cost      = Game.bizLevelCost(biz);
      const canAfford = state.coins >= cost;
      const maxed     = level >= biz.maxLevel;
      const incomeNow = level === 0
        ? biz.baseIncome
        : biz.baseIncome * Math.pow(biz.incomeGrowth, level - 1)
          * (derived.bizMultipliers[biz.id] || 1)
          * derived.globalMultiplier;

      if (biz.tier !== lastTier) {
        const tierEl = document.createElement('div');
        tierEl.className = `tier-header tier-${biz.tier.toLowerCase()}`;
        tierEl.textContent = `— ${biz.tier} —`;
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
            ${maxed     ? `<span class="maxed-badge">MAX</span>` : ''}
          </div>
          <div class="card-desc">${biz.description}</div>
          <div class="card-stats">
            ${level > 0 ? `<span class="stat-income">+${fmtC(incomeNow)}/s</span>` : ''}
            ${!maxed    ? `<span class="stat-next">${level === 0 ? 'Build' : 'Upgrade'}: ${fmtC(cost)}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">
          ${maxed
            ? `<button type="button" class="btn-maxed" disabled>MAXED</button>`
            : `<button type="button"
                class="btn-buy btn-primary ${canAfford ? 'affordable' : 'unaffordable'}"
                data-biz="${biz.id}">
                ${level === 0 ? 'Build' : 'Level Up'}<br>
                <small>${fmtC(cost)}</small>
              </button>`
          }
        </div>`;
      card.querySelector('.card-icon').appendChild(
        iconEl(biz.spriteRow, biz.spriteCol, biz.emoji)
      );
      container.appendChild(card);
    }

    if (!anyVisible) {
      container.innerHTML = `<div class="empty-msg">🏗️ Keep earning to unlock businesses!<br>
        <small>First unlocks at ${fmtC(BUSINESSES[0].unlockAt)} total earned</small></div>`;
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
      container.innerHTML =
        `<div class="empty-msg">⬆️ Upgrades unlock as you earn more.<br><small>Keep tapping!</small></div>`;
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
            <button type="button"
              class="btn-buy btn-primary ${canAfford ? 'affordable' : 'unaffordable'}"
              data-upg="${upg.id}">
              Buy<br><small>${fmtC(upg.cost)}</small>
            </button>
          </div>`;
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

  // ── Prestige & Achievements panel ─────────────────────────
  function renderPrestige() {
    const container = $('tab-prestige');
    const { state } = Game;
    const pts       = state.prestigePoints || 0;
    const mult      = PRESTIGE_CONFIG.calcMultiplier(pts);
    const canPrestige = state.totalEarned >= PRESTIGE_CONFIG.unlockAt;
    const previewPts  = Game.calcPrestigePoints();
    const newTotal    = pts + previewPts;
    const newMult     = PRESTIGE_CONFIG.calcMultiplier(newTotal);
    const pct = Math.min(100, (state.totalEarned / PRESTIGE_CONFIG.unlockAt * 100));
    const achCount = state.achievements.size;
    const achTotal = ACHIEVEMENTS.length;

    container.innerHTML = `
      <div class="prestige-card">
        <div class="prestige-hdr">
          <div class="prestige-star-icon">✨</div>
          <div>
            <div class="prestige-level-text">Prestige Level ${state.prestigeLevel}</div>
            <div class="prestige-sub-text">${pts} Stars &bull; ${mult.toFixed(1)}× all income &amp; taps</div>
          </div>
        </div>

        ${pts > 0 ? `
        <div class="prestige-mult-row">
          <span class="prestige-mult-num">${mult.toFixed(1)}×</span>
          <span class="prestige-mult-lbl">current prestige multiplier</span>
        </div>` : ''}

        <div class="prestige-info-block">
          <div class="pi-row">
            <span>Earned this run</span>
            <span class="${canPrestige ? 'pi-green' : ''}">${fmtC(state.totalEarned)}</span>
          </div>
          <div class="pi-row">
            <span>Prestige gate</span>
            <span>${fmtC(PRESTIGE_CONFIG.unlockAt)}</span>
          </div>
          ${canPrestige ? `
          <div class="pi-row pi-highlight">
            <span>Stars you'll earn</span>
            <span>+${previewPts}</span>
          </div>
          <div class="pi-row pi-highlight">
            <span>New multiplier</span>
            <span>${newMult.toFixed(1)}× (currently ${mult.toFixed(1)}×)</span>
          </div>` : `
          <div class="prestige-progress-wrap">
            <div class="prestige-progress-bar" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="prestige-pct">${pct.toFixed(1)}% to prestige</div>`}
        </div>

        ${canPrestige
          ? `<button type="button" class="btn-prestige" id="btn-prestige">
               ✨ PRESTIGE NOW!
               <small>Resets progress — keeps Stars &amp; Achievements</small>
             </button>`
          : `<div class="prestige-locked">
               🔒 Earn ${fmtC(PRESTIGE_CONFIG.unlockAt)} this run to prestige
             </div>`}
      </div>

      <div class="ach-section-hdr">🏆 Achievements (${achCount} / ${achTotal})</div>
      <div class="ach-grid">
        ${ACHIEVEMENTS.map(ach => {
          const earned = state.achievements.has(ach.id);
          return `<div class="ach-card ${earned ? 'ach-earned' : 'ach-locked'}">
            <div class="ach-emoji">${earned ? ach.emoji : '🔒'}</div>
            <div class="ach-body">
              <div class="ach-name">${earned ? ach.name : '???'}</div>
              <div class="ach-desc">${ach.desc}</div>
            </div>
            ${earned ? '<div class="ach-check">✓</div>' : ''}
          </div>`;
        }).join('')}
      </div>`;

    // Prestige button handler (DOM just rebuilt so addEventListener is safe)
    const btnP = $('btn-prestige');
    if (btnP) {
      const doPrestige = () => {
        if (confirm(
          `Prestige for +${previewPts} Stars?\n` +
          `Progress resets, Stars & Achievements stay.\n` +
          `New multiplier: ${newMult.toFixed(1)}×`
        )) {
          Game.prestige();
          render(); // re-render prestige tab immediately
        }
      };
      btnP.addEventListener('click', doPrestige);
      btnP.addEventListener('touchend', e => { e.preventDefault(); doPrestige(); });
    }
  }

  // ── Stats panel ───────────────────────────────────────────
  function renderStats() {
    const container = $('tab-stats');
    const { state, derived } = Game;
    const stage = Game.getCharacterStage();
    const totalWorkers = JOBS.reduce((s, j) => s + (state.jobs[j.id] || 0), 0);
    const totalBiz     = BUSINESSES.filter(b => (state.businesses[b.id] || 0) > 0).length;
    const prestigeMult = PRESTIGE_CONFIG.calcMultiplier(state.prestigePoints || 0);

    container.innerHTML = `
      <div class="stats-card">
        <div class="stats-title">📊 Your Empire</div>
        <div class="stats-grid">
          <div class="stat-row"><span>Status</span><span>${stage.label}</span></div>
          <div class="stat-row"><span>Balance</span><span>${fmtC(state.coins)}</span></div>
          <div class="stat-row"><span>Total Earned (run)</span><span>${fmtC(state.totalEarned)}</span></div>
          <div class="stat-row"><span>Lifetime Earned</span><span>${fmtC((state.lifetimeCoins||0) + state.totalEarned)}</span></div>
          <div class="stat-row"><span>Income /sec</span><span>${fmtC(derived.incomePerSec)}</span></div>
          <div class="stat-row"><span>Tap Power</span><span>${fmtC(derived.clickPower)}</span></div>
          <div class="stat-row"><span>Total Taps</span><span>${(state.totalTaps||0).toLocaleString()}</span></div>
          <div class="stat-row"><span>Workers Hired</span><span>${totalWorkers}</span></div>
          <div class="stat-row"><span>Businesses Owned</span><span>${totalBiz}</span></div>
          <div class="stat-row"><span>Upgrades</span><span>${state.upgrades.size} / ${UPGRADES.length}</span></div>
          <div class="stat-row"><span>Prestige Level</span><span>${state.prestigeLevel}</span></div>
          <div class="stat-row"><span>Stars</span><span>${state.prestigePoints}</span></div>
          <div class="stat-row"><span>Prestige Bonus</span><span>${prestigeMult.toFixed(1)}× all</span></div>
          <div class="stat-row"><span>Global Multiplier</span><span>${derived.globalMultiplier}×</span></div>
          <div class="stat-row"><span>Achievements</span><span>${state.achievements.size} / ${ACHIEVEMENTS.length}</span></div>
        </div>
        <div class="stats-workforce">
          <div class="stats-title" style="margin-top:16px">👷 Workforce</div>
          ${JOBS.filter(j => (state.jobs[j.id] || 0) > 0)
            .map(j => `<div class="stat-row">
              <span>${j.emoji} ${j.name}</span>
              <span>${state.jobs[j.id]}</span></div>`)
            .join('') || '<div class="stat-row muted"><span>No workers yet</span></div>'}
        </div>
        <button type="button" class="btn-reset" id="btn-reset">🗑️ Reset All Progress</button>
      </div>`;

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm('Reset ALL progress including prestige and achievements? This cannot be undone!')) {
        Game.reset();
      }
    });
  }

  // ── Full render ───────────────────────────────────────────
  function render() {
    const activeTab =
      document.querySelector('.tab-btn.active')?.dataset.tab || 'work';
    switch (activeTab) {
      case 'work':     renderJobs();       break;
      case 'business': renderBusinesses(); break;
      case 'upgrades': renderUpgrades();   break;
      case 'prestige': renderPrestige();   break;
      case 'stats':    renderStats();      break;
    }
    updateHeader();
  }

  return {
    updateHeader, spawnCoinParticle, showToast,
    showOfflineModal, render,
    init() {
      initTabs();
      initPanelDelegates();
    }
  };
})();
