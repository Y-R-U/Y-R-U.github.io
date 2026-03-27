// ─── UI: screen management, popups, shop, HUD updates ───

import { UPGRADES, loadSave, writeSave, getUpgradeLevel } from './config.js';
import { sfxClick, sfxUpgrade, isMusicOn, isSfxOn, setMusicOn, setSfxOn } from './audio.js';

let onPlay = null;
let onUpgradesOpen = null;
let onSettingsOpen = null;

export function initUI(callbacks) {
  onPlay = callbacks.onPlay;

  // Title screen buttons
  document.getElementById('btn-play').addEventListener('click', () => {
    sfxClick();
    showScreen('hud');
    if (onPlay) onPlay();
  });
  document.getElementById('btn-upgrades').addEventListener('click', () => {
    sfxClick();
    showUpgradeScreen();
  });
  document.getElementById('btn-settings').addEventListener('click', () => {
    sfxClick();
    showSettings();
  });

  // HUD settings
  document.getElementById('btn-settings-hud').addEventListener('click', () => {
    sfxClick();
    showSettings();
  });

  // Settings popup
  document.getElementById('btn-settings-close').addEventListener('click', () => {
    sfxClick();
    hideSettings();
  });
  document.getElementById('toggle-music').addEventListener('click', (e) => {
    sfxClick();
    const on = !isMusicOn();
    setMusicOn(on);
    e.target.textContent = on ? 'ON' : 'OFF';
    e.target.className = 'toggle-btn ' + (on ? 'on' : 'off');
  });
  document.getElementById('toggle-sfx').addEventListener('click', (e) => {
    sfxClick();
    const on = !isSfxOn();
    setSfxOn(on);
    e.target.textContent = on ? 'ON' : 'OFF';
    e.target.className = 'toggle-btn ' + (on ? 'on' : 'off');
  });

  // Game Over buttons
  document.getElementById('btn-go-upgrades').addEventListener('click', () => {
    sfxClick();
    hidePopup('gameover-popup');
    showUpgradeScreen();
  });
  document.getElementById('btn-go-retry').addEventListener('click', () => {
    sfxClick();
    hidePopup('gameover-popup');
    showScreen('hud');
    if (onPlay) onPlay();
  });
  document.getElementById('btn-go-menu').addEventListener('click', () => {
    sfxClick();
    hidePopup('gameover-popup');
    showScreen('title-screen');
  });

  // Upgrade shop buttons
  document.getElementById('btn-shop-back').addEventListener('click', () => {
    sfxClick();
    showScreen('title-screen');
  });
  document.getElementById('btn-shop-start').addEventListener('click', () => {
    sfxClick();
    showScreen('hud');
    if (onPlay) onPlay();
  });

  // Sync settings toggles with saved state
  const save = loadSave();
  syncToggle('toggle-music', save.musicOn);
  syncToggle('toggle-sfx', save.sfxOn);
}

function syncToggle(id, on) {
  const el = document.getElementById(id);
  el.textContent = on ? 'ON' : 'OFF';
  el.className = 'toggle-btn ' + (on ? 'on' : 'off');
}

// ─── Screen Management ───
const screens = ['title-screen', 'upgrade-screen', 'hud'];

export function showScreen(id) {
  screens.forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function showPopup(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hidePopup(id) {
  document.getElementById(id).classList.add('hidden');
}

function showSettings() {
  showPopup('settings-popup');
}

function hideSettings() {
  hidePopup('settings-popup');
}

// ─── HUD Updates ───
export function updateHUD(score, wave) {
  document.getElementById('hud-score').textContent = `Score: ${Math.floor(score)}`;
  document.getElementById('hud-wave').textContent = `Wave ${wave}`;
}

// ─── Wave Banner ───
export function showWaveBanner(wave, isBoss) {
  const el = document.getElementById('wave-banner');
  const text = document.getElementById('wave-banner-text');
  text.textContent = isBoss ? `⚠ BOSS WAVE ${wave}` : `WAVE ${wave}`;
  text.style.color = isBoss ? '#ff4444' : '#ffffff';
  el.classList.remove('hidden');
  // Reset animation
  text.style.animation = 'none';
  text.offsetHeight; // reflow
  text.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 1600);
}

// ─── Chain Text ───
export function showChainText(count) {
  const el = document.getElementById('chain-text');
  el.textContent = `CHAIN x${count}!`;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 900);
}

// ─── Game Over ───
export function showGameOver(score, waves, bestMerge, crystalsEarned) {
  document.getElementById('go-score').textContent = Math.floor(score);
  document.getElementById('go-waves').textContent = waves;
  document.getElementById('go-merge').textContent = bestMerge;
  document.getElementById('go-crystals').textContent = crystalsEarned;
  showPopup('gameover-popup');
}

// ─── Damage Numbers ───
export function spawnDamageNumber(screenX, screenY, amount, isCrit) {
  const el = document.createElement('div');
  el.className = 'damage-number';
  el.textContent = `-${Math.floor(amount)}`;
  if (isCrit) {
    el.textContent += '!';
    el.style.color = '#ffdd00';
    el.style.fontSize = '1.6rem';
  }
  el.style.left = `${screenX}px`;
  el.style.top = `${screenY}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// ─── Upgrade Shop ───
export function showUpgradeScreen() {
  showScreen('upgrade-screen');
  renderUpgradeList();
}

function renderUpgradeList() {
  const save = loadSave();
  const list = document.getElementById('upgrade-list');
  list.innerHTML = '';
  document.getElementById('crystal-count').textContent = save.crystals;

  UPGRADES.forEach(upg => {
    const level = getUpgradeLevel(save, upg.id);
    const maxed = level >= upg.maxLevel - 1;
    const cost = maxed ? null : upg.costs[level + 1];
    const canAfford = cost !== null && save.crystals >= cost;

    const card = document.createElement('div');
    card.className = 'upgrade-card';

    // Pips
    let pipsHtml = '';
    for (let i = 0; i < upg.maxLevel; i++) {
      pipsHtml += `<div class="pip ${i <= level ? 'filled' : ''}"></div>`;
    }

    card.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${upg.name}</div>
        <div class="upgrade-desc">${upg.desc}: ${upg.effectLabel(upg.values[level])}</div>
        <div class="upgrade-level">${pipsHtml}</div>
      </div>
    `;

    const btn = document.createElement('button');
    btn.className = 'upgrade-buy';
    if (maxed) {
      btn.textContent = 'MAX';
      btn.disabled = true;
    } else {
      btn.textContent = `💎 ${cost}`;
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => {
        sfxUpgrade();
        save.crystals -= cost;
        save.upgradeLevels[upg.id] = level + 1;
        writeSave(save);
        renderUpgradeList();
      });
    }
    card.appendChild(btn);
    list.appendChild(card);
  });
}
