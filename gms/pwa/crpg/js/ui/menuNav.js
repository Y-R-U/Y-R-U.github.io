// ===== Bottom Nav & Panel Switcher =====
import { renderSkillsPanel } from './skillsPanel.js';
import { renderInventory } from './inventory.js';
import { saveGame, loadGame, resetGame } from '../state.js';

const PANELS = {
  map:       null,
  skills:    'panel-skills',
  inventory: 'panel-inventory',
  menu:      'panel-menu',
};

let activeTab = 'map';

export function initMenuNav() {
  // Nav buttons
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.panel));
  }

  // Menu buttons
  document.getElementById('btn-save')?.addEventListener('click', () => {
    saveGame();
    alert('Game saved!');
  });
  document.getElementById('btn-load')?.addEventListener('click', () => {
    if (loadGame()) { alert('Game loaded!'); window.location.reload(); }
    else alert('No save found.');
  });
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm('Start a new game? All progress will be lost.')) {
      resetGame();
      window.location.reload();
    }
  });

  // Test button
  document.getElementById('btn-tests')?.addEventListener('click', () => {
    switchTab('tests');
  });

  // Debug mode
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === 'tests') {
    document.querySelectorAll('.debug-only').forEach(el => el.classList.remove('hidden'));
    setTimeout(() => switchTab('tests'), 200);
  }
}

export function switchTab(tab) {
  activeTab = tab;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === tab);
  });

  // Hide all panels
  for (const panelId of Object.values(PANELS)) {
    if (panelId) document.getElementById(panelId)?.classList.add('hidden');
  }
  document.getElementById('test-panel')?.classList.add('hidden');

  // Show selected panel
  if (tab === 'skills') {
    document.getElementById('panel-skills')?.classList.remove('hidden');
    renderSkillsPanel();
  } else if (tab === 'inventory') {
    document.getElementById('panel-inventory')?.classList.remove('hidden');
    renderInventory();
  } else if (tab === 'menu') {
    document.getElementById('panel-menu')?.classList.remove('hidden');
    _updateDebugInfo();
  } else if (tab === 'tests') {
    document.getElementById('test-panel')?.classList.remove('hidden');
  }
  // 'map' — no panel, just canvas
}

function _updateDebugInfo() {
  const el = document.getElementById('debug-info');
  if (!el) return;
  const { getState } = _stateRef;
  if (!getState) return;
  const st = getState();
  el.textContent = `Pos: (${st.player.x.toFixed(1)}, ${st.player.y.toFixed(1)}) | Gold: ${st.player.gold}`;
}

let _stateRef = {};
import('../state.js').then(m => { _stateRef = m; });

// NPC Dialogue modal
export function showDialogue(npc) {
  const modal    = document.getElementById('dialogue-modal');
  const nameEl   = document.getElementById('dialogue-npc-name');
  const textEl   = document.getElementById('dialogue-text');
  const shopEl   = document.getElementById('dialogue-shop');
  const tradeBtn = document.getElementById('btn-dialogue-trade');
  if (!modal || !nameEl || !textEl) return;

  nameEl.textContent = npc.name;
  textEl.textContent = npc.dialogue || '...';

  // Reset shop area each time the modal opens
  if (shopEl)   { shopEl.innerHTML = ''; shopEl.classList.add('hidden'); }
  if (tradeBtn) {
    if (npc.shop && npc.shop.length) {
      tradeBtn.classList.remove('hidden');
      tradeBtn.textContent = 'Trade';
      tradeBtn.onclick = () => _toggleShop(npc, shopEl, tradeBtn);
    } else {
      tradeBtn.classList.add('hidden');
      tradeBtn.onclick = null;
    }
  }

  modal.classList.remove('hidden');
}

function _toggleShop(npc, shopEl, tradeBtn) {
  if (!shopEl.classList.contains('hidden')) {
    shopEl.classList.add('hidden');
    tradeBtn.textContent = 'Trade';
    return;
  }
  tradeBtn.textContent = 'Hide Shop';
  shopEl.classList.remove('hidden');
  _renderShopItems(npc, shopEl);
}

function _renderShopItems(npc, container) {
  Promise.all([
    import('../config.js'),
    import('../state.js'),
  ]).then(([{ ITEMS }, { getState, addToBackpack }]) => {
    const st = getState();

    function rebuild() {
      container.innerHTML =
        `<div class="shop-gold-info">Your gold: <b>${st.player.gold} Au</b></div>` +
        npc.shop.map(itemId => {
          const item = ITEMS[itemId];
          if (!item) return '';
          const canAfford = st.player.gold >= item.value;
          return `<div class="shop-item">
            <span class="shop-glyph">${item.emoji || item.glyph}</span>
            <span class="shop-name">${item.name}</span>
            <span class="shop-price">${item.value}&nbsp;Au</span>
            <button class="shop-buy-btn${canAfford ? '' : ' cant-afford'}"
                    data-id="${itemId}" data-price="${item.value}">Buy</button>
          </div>`;
        }).join('');

      container.querySelectorAll('.shop-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id    = btn.dataset.id;
          const price = Number(btn.dataset.price);
          if (st.player.gold < price) return;
          st.player.gold -= price;
          addToBackpack(id, 1);
          rebuild();   // refresh gold display + affordability highlights
        });
      });
    }

    rebuild();
  });
}

export function initDialogueModal() {
  document.getElementById('btn-dialogue-close')?.addEventListener('click', () => {
    document.getElementById('dialogue-modal')?.classList.add('hidden');
  });
}
