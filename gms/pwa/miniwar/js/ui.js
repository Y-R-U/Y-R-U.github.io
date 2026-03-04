/* ===== UI MANAGER ===== */
const UI = (() => {
  let unitCooldowns = {};

  function init() {
    // Settings panel
    document.getElementById('btn-settings').addEventListener('click', () => showPanel('settings-panel'));
    document.getElementById('btn-close-settings').addEventListener('click', () => hidePanel('settings-panel'));

    // Sound toggles
    document.getElementById('toggle-sound').addEventListener('change', e => {
      AudioManager.setSoundEnabled(e.target.checked);
    });
    document.getElementById('toggle-music').addEventListener('change', e => {
      AudioManager.setMusicEnabled(e.target.checked);
      if (e.target.checked && Game.getState()) {
        AudioManager.playThemeMusic(Game.getState().ageIndex);
      }
    });

    // Evolve panel
    document.getElementById('btn-evolve').addEventListener('click', () => {
      openEvolvePanel();
    });
    document.getElementById('btn-close-evolve').addEventListener('click', () => hidePanel('evolve-panel'));
    document.getElementById('btn-do-evolve').addEventListener('click', () => {
      Game.doEvolve();
      hidePanel('evolve-panel');
    });

    // Age up panel
    document.getElementById('btn-upgrade').addEventListener('click', () => {
      openAgeUpPanel();
    });
    document.getElementById('btn-close-ageup').addEventListener('click', () => hidePanel('ageup-panel'));
    document.getElementById('btn-do-ageup').addEventListener('click', () => {
      Game.doAgeUp();
      hidePanel('ageup-panel');
    });

    // Special attack
    document.getElementById('btn-special').addEventListener('click', () => {
      Game.doSpecialAttack();
    });

    // Victory
    document.getElementById('btn-next-wave').addEventListener('click', () => {
      hidePanel('victory-panel');
      Game.nextWave();
    });

    // Defeat
    document.getElementById('btn-retry').addEventListener('click', () => {
      hidePanel('defeat-panel');
      Game.retryBattle();
    });
    document.getElementById('btn-defeat-evolve').addEventListener('click', () => {
      hidePanel('defeat-panel');
      openEvolvePanel();
    });
  }

  function showPanel(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function hidePanel(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function showIntro() {
    showPanel('intro-panel');
    const input = document.getElementById('nation-name-input');
    const saved = Game.getSavedNationName();
    if (saved) input.value = saved;

    document.getElementById('btn-start-game').addEventListener('click', () => {
      const name = input.value.trim() || 'Nova Republic';
      hidePanel('intro-panel');
      Game.startGame(name);
    }, { once: true });

    // Also allow Enter key
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        document.getElementById('btn-start-game').click();
      }
    });
  }

  function buildUnitBar(age) {
    const bar = document.getElementById('unit-bar');
    bar.innerHTML = '';
    unitCooldowns = {};

    const units = CONFIG.AGES[age].units;
    units.forEach((u, idx) => {
      const btn = document.createElement('button');
      btn.className = 'unit-btn';
      btn.dataset.unitIndex = idx;

      const iconCanvas = Graphics.getUnitIcon(u, true);
      const icon = document.createElement('canvas');
      icon.className = 'unit-icon';
      icon.width = 32; icon.height = 32;
      const ic = icon.getContext('2d');
      ic.drawImage(iconCanvas, 0, 0, 64, 64, 0, 0, 32, 32);

      const cost = document.createElement('span');
      cost.className = 'unit-cost';
      cost.textContent = u.cost;

      const name = document.createElement('span');
      name.className = 'unit-name';
      name.textContent = u.name;

      const cd = document.createElement('div');
      cd.className = 'cooldown-overlay';
      cd.id = 'cd-' + u.id;

      btn.appendChild(icon);
      btn.appendChild(cost);
      btn.appendChild(name);
      btn.appendChild(cd);

      btn.addEventListener('click', () => {
        Game.spawnPlayerUnit(idx);
      });

      bar.appendChild(btn);
      unitCooldowns[u.id] = { lastSpawn: 0, cooldown: u.cooldown };
    });
  }

  function updateCooldowns(time) {
    Object.keys(unitCooldowns).forEach(id => {
      const cd = unitCooldowns[id];
      const el = document.getElementById('cd-' + id);
      if (!el) return;
      const remaining = Math.max(0, cd.cooldown - (time - cd.lastSpawn));
      const pct = remaining / cd.cooldown;
      el.style.height = (pct * 100) + '%';
    });
  }

  function setUnitCooldown(unitId, time) {
    if (unitCooldowns[unitId]) {
      unitCooldowns[unitId].lastSpawn = time;
    }
  }

  function isUnitOnCooldown(unitId, time) {
    const cd = unitCooldowns[unitId];
    if (!cd) return false;
    return (time - cd.lastSpawn) < cd.cooldown;
  }

  function updateHUD(state) {
    document.getElementById('gold-display').textContent = Math.floor(state.gold);
    document.getElementById('xp-display').textContent = Math.floor(state.xp) + ' / ' + state.xpToNext;

    const age = CONFIG.AGES[state.ageIndex];
    document.getElementById('age-display').textContent = `Age ${state.ageIndex + 1}: ${age.name}`;
    document.getElementById('wave-display').textContent = `Wave ${state.wave}`;

    // Player HP bar
    const pPct = Math.max(0, state.playerBaseHp / state.playerBaseMaxHp);
    document.getElementById('player-hp-fill').style.width = (pPct * 100) + '%';
    document.getElementById('player-hp-label').textContent = Math.round(pPct * 100) + '%';

    // Enemy HP bar
    const ePct = Math.max(0, state.enemyBaseHp / state.enemyBaseMaxHp);
    document.getElementById('enemy-hp-fill').style.width = (ePct * 100) + '%';
    document.getElementById('enemy-hp-label').textContent = Math.round(ePct * 100) + '%';

    // Special button cooldown
    const specialBtn = document.getElementById('btn-special');
    const specialReady = state.specialCooldownLeft <= 0;
    specialBtn.disabled = !specialReady;
    if (!specialReady) {
      specialBtn.querySelector('.action-label').textContent =
        Math.ceil(state.specialCooldownLeft / 1000) + 's';
    } else {
      specialBtn.querySelector('.action-label').textContent = 'Special';
    }

    // Age up button
    const ageBtn = document.getElementById('btn-upgrade');
    const canAgeUp = state.ageIndex < CONFIG.AGES.length - 1;
    ageBtn.disabled = !canAgeUp;

    // Settings info
    document.getElementById('settings-nation-name').textContent = state.nationName || '-';
    document.getElementById('settings-evolves').textContent = state.totalEvolves || 0;
  }

  function openEvolvePanel() {
    const state = Game.getState();
    const epGain = Game.calcEvolvePointGain();

    document.getElementById('evolve-ep-current').textContent = state.evolvePoints;
    document.getElementById('evolve-ep-gain').textContent = '+' + epGain;

    // Build upgrade tree
    const tree = document.getElementById('evolve-upgrades');
    tree.innerHTML = '';

    CONFIG.EVOLVE_UPGRADES.forEach(upg => {
      const currentLevel = state.evolveLevels[upg.id] || 0;
      const cost = Math.ceil(upg.costBase * Math.pow(upg.costScale, currentLevel));
      const maxed = currentLevel >= upg.maxLevel;
      const canBuy = state.evolvePoints >= cost && !maxed;

      const card = document.createElement('div');
      card.className = 'evolve-upgrade-card' + (currentLevel > 0 ? ' owned' : '');
      card.innerHTML = `
        <span class="eu-icon">${upg.icon}</span>
        <span class="eu-name">${upg.name}</span>
        <span class="eu-level">Lv ${currentLevel}/${upg.maxLevel}</span>
        <span class="eu-cost">${maxed ? 'MAX' : cost + ' EP'}</span>
      `;

      if (canBuy) {
        card.addEventListener('click', () => {
          Game.buyEvolveUpgrade(upg.id, cost);
          openEvolvePanel(); // refresh
        });
      }

      tree.appendChild(card);
    });

    showPanel('evolve-panel');
  }

  function openAgeUpPanel() {
    const state = Game.getState();
    const age = CONFIG.AGES[state.ageIndex];
    if (!age.ageUpCost) return;

    const nextAge = CONFIG.AGES[state.ageIndex + 1];
    document.getElementById('ageup-desc-text').textContent =
      `Advance from ${age.name} to ${nextAge.name}?`;
    document.getElementById('ageup-cost-display').textContent = age.ageUpCost + ' Gold';

    const btn = document.getElementById('btn-do-ageup');
    btn.disabled = state.gold < age.ageUpCost;

    showPanel('ageup-panel');
  }

  function showVictory(rewards) {
    document.getElementById('victory-rewards').textContent =
      `+${rewards.gold} Gold  |  +${rewards.xp} XP`;
    showPanel('victory-panel');
    AudioManager.playVictory();
  }

  function showDefeat() {
    showPanel('defeat-panel');
    AudioManager.playDefeat();
  }

  function showHUD() {
    document.getElementById('hud').classList.remove('hidden');
  }

  function hideHUD() {
    document.getElementById('hud').classList.add('hidden');
  }

  return {
    init, showIntro, buildUnitBar, updateCooldowns, setUnitCooldown,
    isUnitOnCooldown, updateHUD, showVictory, showDefeat,
    showHUD, hideHUD, showPanel, hidePanel,
  };
})();
