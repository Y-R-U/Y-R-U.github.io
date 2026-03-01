/**
 * ui.js - DOM rendering, tab management, UI updates
 */

const UI = (() => {
  let currentTab = 'jobs';
  let settingsOpen = false;

  function init() {
    renderShell();
    bindTabs();
    bindScene();
    renderTab();
  }

  function renderShell() {
    // Header coins update is done in updateHeader()
  }

  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab();
      });
    });
  }

  function bindScene() {
    const scene = document.getElementById('scene-area');
    scene.addEventListener('click', (e) => {
      const rect = scene.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      handleTap(x, y);
    });

    // Prevent double-firing on touch devices
    scene.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = scene.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      handleTap(x, y);
    }, { passive: false });
  }

  function handleTap(x, y) {
    const value = GameState.tap();
    Effects.coinFlyUp(x, y, value);
    Effects.tapRipple(x, y);
    updateHeader();

    // Hide tap hint after first tap
    const hint = document.getElementById('tap-hint');
    if (hint) hint.style.display = 'none';
  }

  function updateHeader() {
    const state = GameState.getState();
    const coinsEl = document.getElementById('header-coins');
    const ipsEl = document.getElementById('header-ips');

    coinsEl.textContent = Utils.formatCoins(state.coins);

    const ips = GameState.getTotalIncomePerSec();
    ipsEl.textContent = ips > 0
      ? Utils.formatCoins(ips) + '/s'
      : 'Tap to earn!';

    // Update buff indicators
    updateBuffBar();
  }

  function updateBuffBar() {
    const state = GameState.getState();
    const bar = document.getElementById('buff-bar');
    const now = Date.now();
    const activeBuffs = state.buffs.filter(b => b.endsAt > now);

    if (activeBuffs.length === 0) {
      bar.innerHTML = '';
      bar.classList.add('hidden');
      return;
    }

    bar.classList.remove('hidden');
    bar.innerHTML = activeBuffs.map(b => {
      const remaining = Math.ceil((b.endsAt - now) / 1000);
      const ev = GameData.EVENTS.find(e => e.id === b.id);
      const icon = ev ? ev.icon : '\u2728';
      return `<span class="buff-pill">${icon} ${b.mult}x ${Utils.formatTime(remaining)}</span>`;
    }).join('');
  }

  function renderTab() {
    const content = document.getElementById('tab-content');
    content.innerHTML = '';

    switch (currentTab) {
      case 'jobs': renderJobsTab(content); break;
      case 'upgrades': renderUpgradesTab(content); break;
      case 'prestige': renderPrestigeTab(content); break;
      case 'achievements': renderAchievementsTab(content); break;
    }
  }

  // ---- JOBS TAB ----
  function renderJobsTab(container) {
    const state = GameState.getState();

    // Buy mode selector
    const modeBar = document.createElement('div');
    modeBar.className = 'buy-mode-bar';
    modeBar.innerHTML = `
      <span class="buy-mode-label">Buy:</span>
      <button class="buy-mode-btn ${state.buyMode === 1 ? 'active' : ''}" data-mode="1">x1</button>
      <button class="buy-mode-btn ${state.buyMode === 10 ? 'active' : ''}" data-mode="10">x10</button>
      <button class="buy-mode-btn ${state.buyMode === -1 ? 'active' : ''}" data-mode="-1">Max</button>
    `;
    container.appendChild(modeBar);

    modeBar.querySelectorAll('.buy-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.buyMode = parseInt(btn.dataset.mode);
        modeBar.querySelectorAll('.buy-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab();
      });
    });

    // Business list
    const list = document.createElement('div');
    list.className = 'business-list';
    list.id = 'business-list';

    for (const biz of GameData.BUSINESSES) {
      if (!GameState.isBusinessVisible(biz)) continue;

      const owned = state.businesses[biz.id]?.owned || 0;
      const unlocked = GameState.isBusinessUnlocked(biz);
      const income = GameState.getBusinessIncome(biz);

      let buyCount, cost;
      if (state.buyMode === -1) {
        buyCount = GameState.getMaxBuyable(biz.id);
        cost = buyCount > 0 ? GameData.getBusinessCostN(biz, owned, buyCount) : GameData.getBusinessCost(biz, owned);
      } else {
        buyCount = state.buyMode;
        cost = state.buyMode === 1
          ? GameData.getBusinessCost(biz, owned)
          : GameData.getBusinessCostN(biz, owned, state.buyMode);
      }

      const canAfford = state.coins >= cost && (state.buyMode !== -1 || buyCount > 0);

      // Next milestone
      const nextMilestone = GameData.MILESTONES.find(m => owned < m.count);
      const milestoneProgress = nextMilestone
        ? Math.min(100, (owned / nextMilestone.count) * 100)
        : 100;

      const row = document.createElement('div');
      row.className = `biz-row ${!unlocked ? 'locked' : ''} ${canAfford ? 'affordable' : ''}`;
      row.innerHTML = `
        <div class="biz-icon">${biz.icon}</div>
        <div class="biz-info">
          <div class="biz-name">${biz.name} ${owned > 0 ? `<span class="biz-count">x${owned}</span>` : ''}</div>
          <div class="biz-income">${unlocked ? (income > 0 ? Utils.formatCoins(income) + '/s' : 'Idle') : 'Earn ' + Utils.formatCoins(biz.unlockCost) + ' to unlock'}</div>
          ${nextMilestone && owned > 0 ? `<div class="biz-milestone-bar"><div class="biz-milestone-fill" style="width:${milestoneProgress}%"></div><span class="biz-milestone-text">${owned}/${nextMilestone.count}</span></div>` : ''}
        </div>
        <button class="biz-buy-btn ${canAfford ? '' : 'disabled'}" data-biz="${biz.id}" data-count="${buyCount}" ${!unlocked || !canAfford ? 'disabled' : ''}>
          ${!unlocked ? '\uD83D\uDD12' : `${Utils.formatCoins(cost)}${state.buyMode === -1 && buyCount > 0 ? ' (x' + buyCount + ')' : state.buyMode > 1 ? ' (x' + state.buyMode + ')' : ''}`}
        </button>
      `;

      if (unlocked && canAfford) {
        const btn = row.querySelector('.biz-buy-btn');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const count = state.buyMode === -1
            ? GameState.getMaxBuyable(biz.id)
            : state.buyMode;
          if (count > 0) {
            GameState.buyBusiness(biz.id, count);
            updateHeader();
            renderTab();
          }
        });
      }

      list.appendChild(row);
    }

    container.appendChild(list);
  }

  // ---- UPGRADES TAB ----
  function renderUpgradesTab(container) {
    const state = GameState.getState();

    // Tap upgrades section
    const tapSection = document.createElement('div');
    tapSection.className = 'upgrade-section';
    tapSection.innerHTML = `<h3 class="section-title">\uD83D\uDC46 Tap Power: ${Utils.formatCoins(GameState.getTapValue())}/tap</h3>`;

    for (const upg of GameData.TAP_UPGRADES) {
      const bought = state.tapUpgradesBought.includes(upg.id);
      const canAfford = state.coins >= upg.cost;

      const row = document.createElement('div');
      row.className = `upgrade-row ${bought ? 'bought' : ''} ${canAfford && !bought ? 'affordable' : ''}`;
      row.innerHTML = `
        <div class="upg-icon">${upg.icon}</div>
        <div class="upg-info">
          <div class="upg-name">${upg.name}</div>
          <div class="upg-desc">${upg.desc} (${upg.mult}x tap)</div>
        </div>
        <button class="upg-buy-btn ${bought ? 'bought' : canAfford ? '' : 'disabled'}" ${bought || !canAfford ? 'disabled' : ''}>
          ${bought ? '\u2714' : Utils.formatCoins(upg.cost)}
        </button>
      `;

      if (!bought && canAfford) {
        row.querySelector('.upg-buy-btn').addEventListener('click', () => {
          GameState.buyTapUpgrade(upg.id);
          updateHeader();
          renderTab();
        });
      }

      tapSection.appendChild(row);
    }
    container.appendChild(tapSection);

    // Business milestones section
    const milestoneSection = document.createElement('div');
    milestoneSection.className = 'upgrade-section';
    milestoneSection.innerHTML = `<h3 class="section-title">\uD83C\uDFAF Business Milestones</h3>`;

    for (const biz of GameData.BUSINESSES) {
      const owned = state.businesses[biz.id]?.owned || 0;
      if (owned === 0) continue;

      const milestoneInfo = document.createElement('div');
      milestoneInfo.className = 'milestone-biz';

      let milestonesHtml = '';
      for (const m of GameData.MILESTONES) {
        const reached = owned >= m.count;
        milestonesHtml += `<span class="milestone-dot ${reached ? 'reached' : ''}" title="${m.count}: ${m.mult}x">${m.count}</span>`;
      }

      milestoneInfo.innerHTML = `
        <div class="milestone-header">${biz.icon} ${biz.name} (x${owned})</div>
        <div class="milestone-dots">${milestonesHtml}</div>
      `;
      milestoneSection.appendChild(milestoneInfo);
    }
    container.appendChild(milestoneSection);
  }

  // ---- PRESTIGE TAB ----
  function renderPrestigeTab(container) {
    const state = GameState.getState();
    const currentStars = state.pioneerStars;
    const newStars = GameState.calcPrestigeStars();
    const prestigeMult = GameState.getPrestigeMultiplier();
    const nextMult = 1 + ((currentStars + Math.max(1, newStars)) * 0.05);

    const panel = document.createElement('div');
    panel.className = 'prestige-panel';
    panel.innerHTML = `
      <div class="prestige-title">\uD83C\uDF05 Move West</div>
      <div class="prestige-desc">
        Pack up and head to a new frontier town.<br>
        You'll start over, but your reputation precedes you.
      </div>

      <div class="prestige-stats">
        <div class="prestige-stat">
          <div class="stat-label">Pioneer Stars</div>
          <div class="stat-value">\u2B50 ${currentStars}</div>
        </div>
        <div class="prestige-stat">
          <div class="stat-label">Current Bonus</div>
          <div class="stat-value">${Math.round((prestigeMult - 1) * 100)}%</div>
        </div>
        <div class="prestige-stat">
          <div class="stat-label">Stars on Reset</div>
          <div class="stat-value">+${newStars}</div>
        </div>
        <div class="prestige-stat">
          <div class="stat-label">New Bonus</div>
          <div class="stat-value">${Math.round((nextMult - 1) * 100)}%</div>
        </div>
      </div>

      <div class="prestige-info">
        Each \u2B50 = +5% all income (multiplicative)<br>
        Formula: \u230A\u221A(total earned / 1M)\u230B stars<br>
        Total earned this run: ${Utils.formatCoins(state.totalEarned)}<br>
        Times moved: ${state.totalPrestiges}
      </div>

      <button class="prestige-btn ${newStars > 0 ? '' : 'disabled'}" id="prestige-btn" ${newStars > 0 ? '' : 'disabled'}>
        ${newStars > 0 ? `Move West (+${newStars} \u2B50)` : 'Need $1M+ earned to Move West'}
      </button>
    `;

    if (newStars > 0) {
      panel.querySelector('#prestige-btn').addEventListener('click', () => {
        if (confirm(`Move West? You'll earn ${newStars} Pioneer Star(s) but lose all businesses and coins.`)) {
          GameState.resetForPrestige();
          updateHeader();
          renderTab();
          showToast('\uD83C\uDF05 You head West to a new frontier!');
        }
      });
    }

    container.appendChild(panel);
  }

  // ---- ACHIEVEMENTS TAB ----
  function renderAchievementsTab(container) {
    const state = GameState.getState();
    const section = document.createElement('div');
    section.className = 'achievements-section';
    section.innerHTML = `<h3 class="section-title">\uD83C\uDFC6 Achievements (${state.achievements.length}/${GameData.ACHIEVEMENTS.length})</h3>`;

    for (const ach of GameData.ACHIEVEMENTS) {
      const unlocked = state.achievements.includes(ach.id);
      const row = document.createElement('div');
      row.className = `ach-row ${unlocked ? 'unlocked' : 'locked'}`;
      row.innerHTML = `
        <div class="ach-icon">${unlocked ? ach.icon : '\uD83D\uDD12'}</div>
        <div class="ach-info">
          <div class="ach-name">${unlocked ? ach.name : '???'}</div>
          <div class="ach-desc">${unlocked ? ach.desc : 'Keep playing to unlock'}</div>
        </div>
      `;
      section.appendChild(row);
    }

    container.appendChild(section);
  }

  // ---- TOAST ----
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---- SETTINGS ----
  function toggleSettings() {
    settingsOpen = !settingsOpen;
    const panel = document.getElementById('settings-panel');
    if (settingsOpen) {
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
    }
  }

  function initSettings() {
    document.getElementById('settings-btn').addEventListener('click', toggleSettings);

    document.getElementById('settings-close').addEventListener('click', toggleSettings);

    document.getElementById('save-btn').addEventListener('click', () => {
      GameState.save();
      showToast('Game saved!');
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('Are you sure? This will DELETE ALL progress permanently!')) {
        if (confirm('Really? There is no undo!')) {
          GameState.hardReset();
          location.reload();
        }
      }
    });
  }

  return {
    init, updateHeader, renderTab, showToast, initSettings
  };
})();
