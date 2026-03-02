// ============================================================
// ui.js - HUD, panels, menus (HTML-based for mobile-friendly interaction)
// ============================================================

import {
  ITEMS, ITEM_TYPE, SKILL, SKILL_LIST, SKILL_COLORS, SKILL_ICONS,
  XP_TABLE, INVENTORY_SIZE, EQUIP_SLOT, METAL_COLORS,
} from './config.js';

export class GameUI {
  constructor(game) {
    this.game = game;
    this.activeTab = 'inventory'; // inventory, skills, equipment
    this.messages = [];
    this.maxMessages = 50;
    this.selectedSlot = -1;
    this.contextMenu = null;
    this.notification = null;
    this.notificationTimer = 0;
    this.tooltipItem = null;
    this.tooltipX = 0;
    this.tooltipY = 0;
    this.showMobileControls = this._isMobile();

    this._buildDOM();
  }

  _isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;
  }

  _buildDOM() {
    // HUD overlay container
    const hud = document.getElementById('hud');
    if (!hud) return;

    hud.innerHTML = `
      <div id="hud-top">
        <div id="hp-orb" class="orb">
          <div id="hp-fill" class="orb-fill hp-fill"></div>
          <span id="hp-text" class="orb-text"></span>
        </div>
        <div id="wave-info">
          <span id="wave-text">Wave 1</span>
          <span id="kills-text">Kills: 0</span>
        </div>
        <div id="combat-level">
          <span id="combat-text">Combat: 3</span>
        </div>
      </div>

      <div id="panel-container">
        <div id="panel-tabs">
          <button class="panel-tab active" data-tab="inventory">Bag</button>
          <button class="panel-tab" data-tab="skills">Skills</button>
          <button class="panel-tab" data-tab="equipment">Equip</button>
        </div>
        <div id="panel-content">
          <div id="tab-inventory" class="tab-panel active"></div>
          <div id="tab-skills" class="tab-panel"></div>
          <div id="tab-equipment" class="tab-panel"></div>
        </div>
      </div>

      <div id="message-log"></div>
      <div id="notification-popup"></div>
      <div id="context-menu" class="hidden"></div>
      <div id="tooltip" class="hidden"></div>
      <div id="death-screen" class="hidden">
        <div class="death-content">
          <h2>You Died!</h2>
          <p>Your items have been lost.</p>
          <button id="respawn-btn">Respawn</button>
        </div>
      </div>

      <div id="mobile-action-bar">
        <button id="btn-fish" class="action-btn" title="Fish">🎣</button>
        <button id="btn-cook" class="action-btn" title="Cook">🔥</button>
        <button id="btn-eat" class="action-btn" title="Eat">🍖</button>
        <button id="btn-pickup" class="action-btn" title="Pickup">⬆️</button>
      </div>
    `;

    // Tab switching
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchTab(tab.dataset.tab);
      });
    });

    // Mobile action buttons
    document.getElementById('btn-fish')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.tryFish();
    });
    document.getElementById('btn-cook')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.tryCook();
    });
    document.getElementById('btn-eat')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.tryEat();
    });
    document.getElementById('btn-pickup')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.tryPickup();
    });

    // Respawn button
    document.getElementById('respawn-btn')?.addEventListener('click', () => {
      this.game.respawn();
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.panel-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    this.updatePanel();
  }

  updatePanel() {
    switch (this.activeTab) {
      case 'inventory': this.renderInventory(); break;
      case 'skills': this.renderSkills(); break;
      case 'equipment': this.renderEquipment(); break;
    }
  }

  renderInventory() {
    const container = document.getElementById('tab-inventory');
    if (!container) return;
    const player = this.game.player;
    let html = '<div class="inv-grid">';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const entry = player.inventory[i];
      const item = entry ? ITEMS[entry.id] : null;
      const selected = i === this.selectedSlot ? ' selected' : '';
      const colorClass = item?.metalTier ? ` tier-${item.metalTier}` : '';
      html += `<div class="inv-slot${selected}${colorClass}" data-slot="${i}">`;
      if (item && entry) {
        html += `<div class="inv-item-icon">${this._getItemIcon(item)}</div>`;
        html += `<div class="inv-item-name">${item.name}</div>`;
        if (entry.count > 1) {
          html += `<div class="inv-item-count">${entry.count}</div>`;
        }
      }
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.inv-slot').forEach(slot => {
      const idx = parseInt(slot.dataset.slot);
      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onInventoryClick(idx);
      });
      // Long press for context menu
      let timer;
      slot.addEventListener('touchstart', (e) => {
        timer = setTimeout(() => {
          e.preventDefault();
          this.showContextMenu(idx, e.touches[0].clientX, e.touches[0].clientY);
        }, 500);
      });
      slot.addEventListener('touchend', () => clearTimeout(timer));
      slot.addEventListener('touchmove', () => clearTimeout(timer));

      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(idx, e.clientX, e.clientY);
      });
    });
  }

  _getItemIcon(item) {
    if (!item) return '';
    if (item.type === ITEM_TYPE.WEAPON) return '⚔️';
    if (item.type === ITEM_TYPE.SHIELD) return '🛡️';
    if (item.type === ITEM_TYPE.HELMET) return '⛑️';
    if (item.type === ITEM_TYPE.BODY) return '🦺';
    if (item.type === ITEM_TYPE.LEGS) return '👖';
    if (item.type === ITEM_TYPE.FISH_RAW) return '🐟';
    if (item.type === ITEM_TYPE.FISH_COOKED) return '🍖';
    if (item.type === ITEM_TYPE.FISH_BURNT) return '💀';
    if (item.type === ITEM_TYPE.FISHING_ROD) return '🎣';
    return '📦';
  }

  onInventoryClick(slot) {
    const player = this.game.player;
    const entry = player.inventory[slot];
    if (!entry) {
      this.selectedSlot = -1;
      this.updatePanel();
      return;
    }

    const item = ITEMS[entry.id];
    if (!item) return;

    // Auto-use based on type
    if ([ITEM_TYPE.WEAPON, ITEM_TYPE.SHIELD, ITEM_TYPE.HELMET, ITEM_TYPE.BODY, ITEM_TYPE.LEGS].includes(item.type)) {
      if (player.equipItem(slot)) {
        this.addMessage(`Equipped ${item.name}.`);
        this.game.audio.playPickup();
      } else {
        this.addMessage(`You don't meet the requirements for ${item.name}.`, '#f44');
      }
    } else if (item.type === ITEM_TYPE.FISH_COOKED) {
      // Eat
      if (player.hp < player.maxHp) {
        player.removeFromInventory(slot, 1);
        player.heal(item.healAmount);
        this.addMessage(`You eat the ${item.name}. It heals ${item.healAmount} HP.`, '#4f4');
        this.game.audio.playEat();
      } else {
        this.addMessage('You are already at full health.');
      }
    } else {
      this.selectedSlot = slot;
    }

    this.updatePanel();
  }

  showContextMenu(slot, x, y) {
    const player = this.game.player;
    const entry = player.inventory[slot];
    if (!entry) return;
    const item = ITEMS[entry.id];
    const count = entry.count;

    const menu = document.getElementById('context-menu');
    let options = [];

    if ([ITEM_TYPE.WEAPON, ITEM_TYPE.SHIELD, ITEM_TYPE.HELMET, ITEM_TYPE.BODY, ITEM_TYPE.LEGS].includes(item.type)) {
      options.push({ label: 'Equip', action: () => { player.equipItem(slot); this.addMessage(`Equipped ${item.name}.`); } });
    }
    if (item.type === ITEM_TYPE.FISH_COOKED) {
      options.push({ label: 'Eat', action: () => {
        if (player.hp < player.maxHp) {
          player.removeFromInventory(slot, 1);
          player.heal(item.healAmount);
          this.addMessage(`Ate ${item.name}. Healed ${item.healAmount} HP.`, '#4f4');
          this.game.audio.playEat();
        }
      }});
    }
    options.push({ label: 'Drop', action: () => {
      player.removeFromInventory(slot, 1);
      this.addMessage(`Dropped 1 ${item.name}.`);
    }});
    if (count > 1) {
      options.push({ label: `Drop All (${count})`, action: () => {
        player.removeAllFromSlot(slot);
        this.addMessage(`Dropped ${count} ${item.name}.`);
      }});
    }
    options.push({ label: 'Cancel', action: () => {} });

    menu.innerHTML = options.map(o =>
      `<div class="ctx-option">${o.label}</div>`
    ).join('');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');

    menu.querySelectorAll('.ctx-option').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        options[i].action();
        menu.classList.add('hidden');
        this.updatePanel();
      });
    });

    // Close on outside click
    setTimeout(() => {
      const close = () => {
        menu.classList.add('hidden');
        document.removeEventListener('click', close);
      };
      document.addEventListener('click', close);
    }, 50);
  }

  renderSkills() {
    const container = document.getElementById('tab-skills');
    if (!container) return;
    const player = this.game.player;
    let html = '<div class="skills-list">';
    for (const skill of SKILL_LIST) {
      const level = player.getLevel(skill);
      const xp = player.xp[skill];
      const currentLevelXp = XP_TABLE[level];
      const nextLevelXp = level < 99 ? XP_TABLE[level + 1] : XP_TABLE[99];
      const progress = level >= 99 ? 1 : (xp - currentLevelXp) / (nextLevelXp - currentLevelXp);
      const color = SKILL_COLORS[skill];
      const icon = SKILL_ICONS[skill];
      html += `
        <div class="skill-row">
          <span class="skill-icon" style="color:${color}">${icon}</span>
          <span class="skill-name">${skill.charAt(0).toUpperCase() + skill.slice(1)}</span>
          <span class="skill-level">${level}</span>
          <div class="skill-bar">
            <div class="skill-bar-fill" style="width:${progress * 100}%;background:${color}"></div>
          </div>
          <span class="skill-xp">${this._formatXp(xp)}</span>
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  _formatXp(xp) {
    if (xp >= 1000000) return `${(xp / 1000000).toFixed(1)}M`;
    if (xp >= 1000) return `${(xp / 1000).toFixed(1)}K`;
    return `${xp}`;
  }

  renderEquipment() {
    const container = document.getElementById('tab-equipment');
    if (!container) return;
    const player = this.game.player;

    const slots = [
      { slot: EQUIP_SLOT.HELMET, label: 'Helmet' },
      { slot: EQUIP_SLOT.WEAPON, label: 'Weapon' },
      { slot: EQUIP_SLOT.BODY, label: 'Body' },
      { slot: EQUIP_SLOT.SHIELD, label: 'Shield' },
      { slot: EQUIP_SLOT.LEGS, label: 'Legs' },
    ];

    let html = '<div class="equip-grid">';
    for (const { slot, label } of slots) {
      const itemId = player.equipment[slot];
      const item = itemId ? ITEMS[itemId] : null;
      html += `<div class="equip-slot" data-slot="${slot}">`;
      html += `<div class="equip-label">${label}</div>`;
      if (item) {
        html += `<div class="equip-item">${this._getItemIcon(item)} ${item.name}</div>`;
      } else {
        html += `<div class="equip-empty">Empty</div>`;
      }
      html += '</div>';
    }
    html += '</div>';

    // Stats summary
    html += '<div class="stats-summary">';
    html += `<div>Atk Bonus: +${player.getAttackBonus()}</div>`;
    html += `<div>Str Bonus: +${player.getStrengthBonus()}</div>`;
    html += `<div>Def Bonus: +${player.getDefenseBonus()}</div>`;
    html += '</div>';

    container.innerHTML = html;

    // Unequip on click
    container.querySelectorAll('.equip-slot').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = el.dataset.slot;
        const itemId = player.equipment[slot];
        if (itemId) {
          // Move to inventory
          const invSlot = player.addToInventory(itemId);
          if (invSlot >= 0) {
            player.equipment[slot] = null;
            this.addMessage(`Unequipped ${ITEMS[itemId].name}.`);
          } else {
            this.addMessage('Inventory is full!', '#f44');
          }
          this.updatePanel();
        }
      });
    });
  }

  // ---- HUD UPDATES ----
  updateHUD() {
    const player = this.game.player;

    // HP orb
    const hpFill = document.getElementById('hp-fill');
    const hpText = document.getElementById('hp-text');
    if (hpFill && hpText) {
      const ratio = player.hp / player.maxHp;
      hpFill.style.height = `${ratio * 100}%`;
      hpText.textContent = `${player.hp}/${player.maxHp}`;
      hpFill.style.background = ratio > 0.5 ? '#2a8a2a' : ratio > 0.25 ? '#aa8a2a' : '#aa2a2a';
    }

    // Wave info
    const waveText = document.getElementById('wave-text');
    const killsText = document.getElementById('kills-text');
    if (waveText) waveText.textContent = `Wave ${this.game.waveSpawner.currentWave}`;
    if (killsText) killsText.textContent = `Kills: ${this.game.waveSpawner.totalKills}`;

    // Combat level
    const combatText = document.getElementById('combat-text');
    if (combatText) combatText.textContent = `Combat: ${player.getCombatLevel()}`;
  }

  // ---- MESSAGES ----
  addMessage(text, color = '#ccc') {
    this.messages.push({ text, color, time: Date.now() });
    if (this.messages.length > this.maxMessages) this.messages.shift();
    this._renderMessages();
  }

  _renderMessages() {
    const log = document.getElementById('message-log');
    if (!log) return;
    // Show last 5 messages
    const recent = this.messages.slice(-5);
    log.innerHTML = recent.map(m =>
      `<div class="msg" style="color:${m.color}">${m.text}</div>`
    ).join('');
    log.scrollTop = log.scrollHeight;
  }

  // ---- NOTIFICATIONS ----
  showNotification(text, duration = 3000) {
    const popup = document.getElementById('notification-popup');
    if (popup) {
      popup.textContent = text;
      popup.classList.add('show');
      clearTimeout(this._notifTimeout);
      this._notifTimeout = setTimeout(() => {
        popup.classList.remove('show');
      }, duration);
    }
  }

  // ---- DEATH SCREEN ----
  showDeathScreen() {
    document.getElementById('death-screen')?.classList.remove('hidden');
  }

  hideDeathScreen() {
    document.getElementById('death-screen')?.classList.add('hidden');
  }

  update(dt) {
    this.updateHUD();
    this.updatePanel();
  }
}
